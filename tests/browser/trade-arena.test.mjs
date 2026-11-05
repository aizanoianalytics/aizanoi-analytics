import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const rosterSize = JSON.parse(readFileSync(new URL('../../frontend/arcade/trade-arena/bots/roster.json', import.meta.url), 'utf8')).bots.length;
const policy = readFileSync(new URL('../../infra/nginx/snippets/aizanoi-static-security-headers.conf.example', import.meta.url), 'utf8').match(/Content-Security-Policy "([^"]+)"/)[1];

async function withPage(size, run) {
  const browser = await chromium.launch({ headless:true });
  const context = await browser.newContext({ viewport:size, isMobile:size.width<600, hasTouch:size.width<1200, serviceWorkers:'block' });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  // Apply the unchanged production policy even when CI's origin is its plain static server.
  // Worker responses carry it too: nested workers cannot escape script-src self.
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) { await route.abort(); return; }
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy':policy } });
  });
  // unrouteAll can wait forever on a route.fetch issued by a worker the page already terminated; the browser
  // is closed right after, so teardown never blocks a test for longer than two seconds.
  try { await run(page, errors); } finally { await Promise.race([context.unrouteAll({ behavior:'ignoreErrors' }), new Promise(resolve => { setTimeout(resolve, 2000); })]); await browser.close(); }
}

test('every shipped roster worker initializes under production CSP and arbitrary paths are rejected', async () => {
  await withPage({width:1280,height:900}, async (page,errors) => {
    await page.goto(base + '/arcade/trade-arena/');
    await page.locator('#go').waitFor();
    const loaded = await page.evaluate(async () => {
      const roster = await fetch('bots/roster.json').then(response => response.json());
      const load = file => new Promise((resolve,reject) => {
        const worker = new Worker('ui/bot-worker.js');
        const deadline = setTimeout(() => { worker.terminate(); reject(new Error('worker startup timeout: ' + file)); }, 10000);
        worker.onerror = error => { clearTimeout(deadline); worker.terminate(); reject(new Error(error.message)); };
        worker.onmessage = ({data}) => { if (data.id !== 1) return; clearTimeout(deadline); worker.terminate(); resolve({file,...data}); };
        worker.postMessage({id:1,type:'load',payload:{file,seed:7}});
      });
      return Promise.all([...roster.bots.map(bot => bot.file), 'https://example.com/evil.js'].map(load));
    });
    const evil = loaded.pop();
    assert.equal(loaded.length,rosterSize);
    for (const worker of loaded) assert.equal(worker.ok,true,JSON.stringify(worker));
    assert.equal(evil.ok,false); assert.match(evil.error,/Unknown shipped strategy/);
    assert.deepEqual(errors,[]);
  });
});

test('the full roster races in concurrent workers, computes real trades, and paints results under strict CSP', {timeout:180000}, async () => {
  await withPage({width:1440,height:1000}, async (page,errors) => {
    await page.goto(base + '/arcade/trade-arena/');
    await page.locator('#go').waitFor();
    for (const label of await page.locator('#roster label').all()) { const input = label.locator('input'); if (!await input.isChecked() && await input.isEnabled()) await label.click(); }
    assert.equal(await page.locator('#roster input:checked').count(),rosterSize, 'every roster bot can be selected');
    assert.equal(await page.locator('#roster input:disabled').count(),0);
    assert.equal(await page.locator('#bot-count').innerText(),`${rosterSize} of ${rosterSize} selected`);
    // Read Chromium's real worker targets, not a fake host or a completion marker.
    const cdp = await page.context().browser().newBrowserCDPSession();
    await page.locator('#go').click();
    let concurrent = 0;
    for (const deadline = Date.now() + 30000; Date.now() < deadline;) {
      const { targetInfos } = await cdp.send('Target.getTargets');
      concurrent = targetInfos.filter(target => target.type === 'worker' && target.url.endsWith('/ui/bot-worker.js')).length;
      if (concurrent === rosterSize) break;
      await page.waitForTimeout(50);
    }
    assert.equal(concurrent,rosterSize, 'one live worker per contestant, with the entire roster active together');
    await page.waitForFunction(count => document.querySelectorAll('#rows .row:not(.bench)').length === count,rosterSize);
    const board = await page.locator('#rows').evaluate(box => ({
      height:box.getBoundingClientRect().height,
      count:box.children.length,
      offsets:[...box.children].map(row => Math.round(row.getBoundingClientRect().top - box.getBoundingClientRect().top)),
    }));
    assert.equal(board.height,board.count * 64, 'standings contain the full roster plus benchmarks');
    assert.deepEqual(board.offsets.sort((a,b) => a-b),Array.from({length:board.count},(_,i) => i*64), 'every standings row has its own rank position');
    await page.locator('#speeds [data-v="Infinity"]').click();
    await page.locator('dialog.results[open]').waitFor({timeout:150000});
    const rows = page.locator('dialog.results table.stats tbody tr:not(.bench)');
    assert.equal(await rows.count(),rosterSize);
    const savedIds = await page.evaluate(() => JSON.parse(localStorage.getItem('trade-arena:history'))[0].stats.map(stat => stat.id));
    const selectedIds = await page.evaluate(() => JSON.parse(localStorage.getItem('trade-arena:pick')).bots);
    assert.deepEqual(savedIds.sort(),selectedIds.sort(), 'every selected bot finishes and is recorded');
    const { targetInfos } = await cdp.send('Target.getTargets');
    assert.equal(targetInfos.filter(target => target.type === 'worker' && target.url.endsWith('/ui/bot-worker.js')).length,0, 'completed race releases every bot worker');
    await cdp.detach();
    for (const row of await rows.all()) {
      const values = await row.locator('td').allTextContents();
      assert.ok(Number(values[8]) > 0, 'real executed trade count: ' + values.join('|'));
      // Strategies have a 250 ms wall-clock budget per bar; the first bar (cold JIT, worker spin-up) can brush it on a busy CI runner.
      // A handful of skipped bars is environment noise; a broken strategy would error on every bar.
      assert.ok(Number(values[11]) <= 8, 'few or no strategy errors, got ' + values[11]);
    }
    assert.ok(await page.locator('#achart canvas').count() > 0);
    const pixels = await page.locator('#racecv').evaluate(canvas => { const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data; let visible=0; for(let i=3;i<data.length;i+=4) if(data[i]>0) visible++; return visible; });
    assert.ok(pixels>1000, 'race chart must paint real curves');
    await page.locator('[data-x]').click();
    await page.locator('.nav [data-r="data"]').click();
    await page.locator('#pchart canvas').first().waitFor();
    await page.locator('#q').fill('BTC');
    assert.deepEqual(await page.locator('#alist button[data-s]').getAttribute('data-s'), 'BTC');
    await page.locator('#q').fill('not-an-asset');
    assert.equal(await page.locator('#alist button[data-s]').count(),0);
    await page.locator('#q-clear').click();
    assert.equal(await page.locator('#alist button[data-s]').count(),35);
    await page.locator('.nav [data-r="league"]').click();
    await page.waitForFunction(() => document.querySelector('#view')?.textContent.includes('Imported standings'), null, { timeout: 15000 });
    assert.match(await page.locator('#view').innerText(), /Imported standings/);
    assert.deepEqual(errors,[]);
  });
});

test('late explorer downloads are invalidated after leaving the page', async () => {
  await withPage({width:1280,height:900}, async(page,errors) => {
    let release; const delayed = new Promise(resolve => { release = resolve; });
    await page.context().route('**/data/raw/crypto/1d/BTC.json', async route => { await delayed; await route.fallback(); });
    await page.goto(base + '/arcade/trade-arena/'); await page.locator('#go').waitFor();
    await page.locator('.nav [data-r="data"]').click(); await page.locator('#pchart').waitFor();
    await page.locator('.nav [data-r="bots"]').click(); release();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('#pchart').count(),0);
    assert.deepEqual(errors,[]);
  });
});

test('an incomplete historical download fails closed without saving a race', async () => {
  await withPage({width:1280,height:900}, async(page,errors) => {
    await page.route('**/data/raw/crypto/1d/BTC.json', route => route.fulfill({status:404,body:'missing'}));
    await page.goto(base + '/arcade/trade-arena/'); await page.locator('#go').click();
    await page.waitForFunction(() => document.querySelector('#vtext')?.textContent.includes('BTC.json'), null, {timeout:15000});
    assert.equal(await page.locator('dialog.results').count(),0);
    assert.equal(await page.evaluate(() => localStorage.getItem('trade-arena:history')),null);
    assert.deepEqual(errors.filter(error => !error.includes('404')),[]);
  });
});

test('failed strategy startup cannot be tallied or persisted as a successful race', async () => {
  await withPage({width:1280,height:900}, async(page) => {
    await page.route('**/bots/ai/*.js', route => route.fulfill({status:404,body:'missing'}));
    await page.goto(base + '/arcade/trade-arena/'); await page.locator('#go').click();
    await page.waitForFunction(() => document.querySelector('#vtext')?.textContent.includes('Strategy initialization failed'), null, {timeout:30000});
    assert.equal(await page.locator('dialog.results').count(),0);
    assert.equal(await page.evaluate(() => localStorage.getItem('trade-arena:history')),null);
  });
});

for (const width of [390,768,1440]) test(`independent shell launcher and frame teardown at ${width}px`, async () => {
  await withPage({width,height:900}, async(page,errors) => {
    await page.goto(base + '/?app=trade-arena');
    const frame = page.frameLocator('iframe.ta-shell-frame');
    await frame.locator('#go').waitFor({timeout:30000});
    assert.equal(await frame.locator('#roster input').count(),rosterSize);
    const overflow = await frame.locator('html').evaluate(el => el.scrollWidth - el.clientWidth);
    assert.ok(overflow<=1, `frame overflow at ${width}px: ${overflow}`);
    for (const label of await frame.locator('#roster label').all()) { const input = label.locator('input'); if (!await input.isChecked()) await label.click(); }
    assert.equal(await frame.locator('#roster input:checked').count(),rosterSize);
    const cdp = await page.context().browser().newBrowserCDPSession();
    await frame.locator('#go').click();
    await frame.locator('#racecv').waitFor();
    let active = [];
    for (const deadline = Date.now() + 30000; Date.now() < deadline;) {
      const { targetInfos } = await cdp.send('Target.getTargets');
      active = targetInfos.filter(target => target.type === 'worker' && target.url.endsWith('/ui/bot-worker.js'));
      if (active.length === rosterSize) break;
      await page.waitForTimeout(50);
    }
    assert.equal(active.length,rosterSize, 'close during a real full-roster race');
    // Closing the canonical shell window must detach the document while workers are active.
    const win = page.locator('.az-window').filter({has:page.locator('iframe.ta-shell-frame')});
    await win.locator('[data-window-close], [data-action="close"], [aria-label^="Close"]').first().click();
    assert.equal(await page.locator('iframe.ta-shell-frame').count(),0);
    assert.equal(await page.locator('link[href="/js/v3/apps/trade-arena/src/app.css"]').count(),0);
    let remaining = [];
    for (const deadline = Date.now() + 10000; Date.now() < deadline;) {
      const { targetInfos } = await cdp.send('Target.getTargets');
      remaining = targetInfos.filter(target => target.type === 'worker' && /\/ui\/(bot|race)-worker\.js$/.test(target.url));
      if (!remaining.length) break;
      await page.waitForTimeout(50);
    }
    assert.equal(remaining.length,0, 'cancellation terminates the race worker and all nested contestants');
    await cdp.detach();
    assert.equal(await page.evaluate(() => localStorage.getItem('trade-arena:history')),null, 'cancelled race is not recorded');
    assert.deepEqual(errors,[]);
  });
});

test('today’s basket builds the same holdings twice under strict CSP and a random race starts', {timeout:330000}, async () => {
  await withPage({width:1280,height:900}, async (page,errors) => {
    await page.goto(base + '/arcade/trade-arena/#/basket');
    await page.locator('#bk-go').waitFor();
    assert.match(await page.locator('.notice').first().innerText(), /Not investment advice/);
    await page.locator('label:has(input[name=bk-bot][value="haiku-5-5"])').click();
    await page.locator('#bk-market [data-v="stocks"]').click();
    const build = async () => { await page.locator('#bk-go').click(); await page.locator('.basket-result').waitFor({timeout:150000}); return page.locator('.basket-result table').innerText(); };
    const first = await build();
    assert.ok((await page.locator('.basket-result tbody tr').count()) > 0, 'a fully invested bot shows holdings');
    assert.equal(await build(), first, 'same bot, same archive, same basket');
    await page.goto(base + '/arcade/trade-arena/#/');
    await page.locator('label.preset:has(input[value=random])').click();
    await page.locator('#go').click();
    await page.locator('.race-head h1').waitFor();
    assert.match(await page.locator('.race-head h1').innerText(), /^Random race #/);
    assert.deepEqual(errors, []);
  });
});

test('BIST race charts load their warm-up from the BIST archive without failed requests', {timeout:120000}, async () => {
  await withPage({width:1440,height:1000}, async (page,errors) => {
    const failed = [];
    page.on('response', response => { if (response.status() >= 400) failed.push(response.url()); });
    await page.goto(base + '/arcade/trade-arena/');
    await page.locator('label.preset:has(input[value="borsa-istanbul"])').click();
    await page.locator('#go').click();
    await page.locator('#speeds [data-v="Infinity"]').click();
    await page.locator('dialog.results[open]').waitFor({timeout:100000});
    assert.match(await page.locator('dialog.results').innerText(), /BIST 100 hold/);
    assert.deepEqual(failed, [], 'BIST chart must not request an absent US-stock archive');
    assert.deepEqual(errors, []);
  });
});

test('basket advisor answers a pasted basket with per-bot actions and a consensus under strict CSP', {timeout:180000}, async () => {
  await withPage({width:1440,height:1000}, async (page,errors) => {
    await page.addInitScript(() => { try { localStorage.removeItem('trade-arena:my-basket'); localStorage.setItem('trade-arena:pick', JSON.stringify({ advisorBots: ['sonnet-5-5', 'opus-5-5'] })); } catch {} });
    await page.goto(base + '/arcade/trade-arena/#/advisor');
    await page.locator('#ad-go').waitFor();
    await page.locator('#ad-paste-t').click();
    await page.locator('#ad-paste-txt').fill('BTC 40;ETH 20;DOGE short 5');
    await page.locator('#ad-paste-go').click();
    assert.equal(await page.locator('#ad-rows tr').count(), 3);
    await page.locator('label:has(#ad-short)').click();
    await page.locator('#ad-go').click();
    await page.locator('#ad-out h2').waitFor({timeout:150000});
    assert.equal(await page.locator('.advisor-card').count(), 2);
    assert.equal(await page.locator('.advisor-consensus').count(), 1);
    const actions = await page.locator('.advisor-card .act').allTextContents();
    assert.ok(actions.length >= 3, 'every held asset gets an action');
    assert.ok(actions.every(a => /^(Close|Cover short|Flip side|Trim|Add|Open|Open short|Keep)$/.test(a)), actions.join());
    assert.match(await page.locator('#ad-out').innerText(), /not investment advice/i);
    assert.deepEqual(errors,[]);
  });
});
