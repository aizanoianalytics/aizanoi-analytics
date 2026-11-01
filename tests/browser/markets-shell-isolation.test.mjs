import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('../../frontend', import.meta.url)));
const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.woff2':'font/woff2', '.webmanifest':'application/manifest+json' };

function serve() {
  return new Promise(done => {
    const server = http.createServer(async (req, res) => {
      try {
        let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
        let file = join(root, path);
        if (!file.startsWith(root)) throw new Error('outside');
        if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
        res.end(body);
      } catch { res.writeHead(404); res.end('not found'); }
    });
    server.listen(0, '127.0.0.1', () => done({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

// Synthetic fixture routed in the browser only; nothing here is committed as market data.
const quality = { dailyClose:'complete', fourHour:'unavailable', ohlcv:'unavailable', history:'complete' };
const row = (market, i) => ({ market, ticker:`T${i}`, name:`Test ${i}`, exchange:'NASDAQ', slug:`t${i}`, memberships:['S&P 500'], latestPrice:100 + i, previousPrice:99, price1w:101, price1m:102, price3m:103, price6m:104, price1y:105, price2y:106, price3y:107, price2019:108, return1d:0.01 * i, return1w:0.02, return1m:0.03, return3m:0.04, return6m:0.05, return1y:0.06, return2y:0.07, return3y:0.08, returnSince2019:0.09, dataQuality:quality });
async function fixtures(page) {
  await page.route('**/analytics/markets/data/manifest.json', r => r.fulfill({ json:{ schemaVersion:3, completedAt:'2026-09-10T07:00:00Z', status:'complete', counts:{ us:3, crypto:3 } } }));
  await page.route('**/analytics/markets/data/health.json', r => r.fulfill({ json:{ schemaVersion:3, status:'complete', counts:{ us:3, crypto:3 }, failedSymbols:[] } }));
  for (const market of ['us', 'crypto']) {
    await page.route(`**/analytics/markets/data/summary/${market}/index.json`, r => r.fulfill({ json:{ market, chunks:[{ path:'00.json', count:3 }] } }));
    await page.route(`**/analytics/markets/data/summary/${market}/00.json`, r => r.fulfill({ json:{ market, rows:[1, 2, 3].map(i => row(market, i)) } }));
    await page.route(`**/analytics/markets/data/pulse/${market}.json`, r => r.fulfill({ json:{ market } }));
  }
}

const probe = page => page.evaluate(() => {
  const css = (el, prop) => el ? getComputedStyle(el)[prop] : null;
  const html = document.documentElement, body = document.body, shell = document.querySelector('.az-shell');
  return {
    htmlBg:css(html, 'backgroundColor'), htmlImage:css(html, 'backgroundImage'), htmlScheme:css(html, 'colorScheme'),
    bodyBg:css(body, 'backgroundColor'), bodyImage:css(body, 'backgroundImage'), bodyScheme:css(body, 'colorScheme'),
    shellBg:css(shell, 'backgroundColor'), shellImage:css(shell, 'backgroundImage'),
    ink:getComputedStyle(html).getPropertyValue('--ink'),
  };
});

async function openMarkets(page) {
  await page.locator('.az-desktop-shortcut[data-app="markets"]:visible').first().click();
  await page.locator('.az-window[data-app-id="markets"] [data-raw-table] tbody tr[data-symbol]').first().waitFor({ timeout:15000 });
}

test('Markets in the shell never changes document, body or shell styling on a dark OS', async () => {
  const { server, base } = await serve();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const colorScheme of ['dark', 'light']) {
      const context = await browser.newContext({ viewport:{ width:1440, height:900 }, colorScheme, serviceWorkers:'block' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      await fixtures(page);
      await page.goto(`${base}/?markets-isolation=${Date.now()}`, { waitUntil:'networkidle' });
      const before = await probe(page);
      for (let i = 0; i < 2; i += 1) {
        await openMarkets(page);
        const during = await probe(page);
        assert.deepEqual(during, before, `document styles changed while Markets is open (${colorScheme}, run ${i + 1})`);
        assert.equal(await page.locator('link[href="/analytics/markets/markets.css"]').count(), 1, 'stylesheet must not be duplicated');
        await page.locator('.az-window[data-app-id="markets"] [data-action="close"]').click();
        await page.locator('.az-window[data-app-id="markets"]').waitFor({ state:'detached' });
        assert.equal(await page.locator('link[href^="/analytics/markets/"]').count(), 0, 'Markets stylesheets are released on close');
        assert.deepEqual(await probe(page), before, `document styles changed after closing Markets (${colorScheme}, run ${i + 1})`);
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); server.close(); }
});

test('Embedded Markets ignores shell history, uses pressed buttons and keeps live regions small', async () => {
  const { server, base } = await serve();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport:{ width:1440, height:900 }, serviceWorkers:'block' });
    const page = await context.newPage();
    await fixtures(page);
    await page.goto(`${base}/?markets-history=${Date.now()}`, { waitUntil:'networkidle' });
    await openMarkets(page);
    const win = page.locator('.az-window[data-app-id="markets"]');
    assert.equal(await win.locator('[role="tab"], [role="tablist"]').count(), 0);
    assert.equal(await win.locator('[aria-live]').count(), 0, 'no aria-live wrapper inside the app');
    assert.equal(await win.locator('[data-market="us"]').getAttribute('aria-pressed'), 'true');
    await win.locator('[data-market="crypto"]').click();
    await win.locator('[data-market="crypto"][aria-pressed="true"]').waitFor();
    await win.locator('[data-table-filter-toggle]').click();
    await win.locator('[data-search]').fill('T2');
    await win.locator('tr[data-symbol]').first().waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.az-window[data-app-id="markets"] tr[data-symbol]').length === 1);
    // Shell navigation must not reset the local Markets state.
    await page.evaluate(() => { history.pushState(null, '', '/?other=1'); history.pushState(null, '', '/?other=2'); history.back(); });
    await page.waitForTimeout(400);
    assert.equal(await win.locator('[data-market="crypto"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await win.locator('[data-search]').inputValue(), 'T2');
    assert.equal(await win.locator('tr[data-symbol]').count(), 1);
    assert.equal(new URL(page.url()).searchParams.has('market'), false, 'embedded Markets does not write the shell URL');
    await context.close();
  } finally { await browser.close(); server.close(); }
});

test('Markets shows a specific error with Try again and keeps its chrome usable', async () => {
  const { server, base } = await serve();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport:{ width:1440, height:900 }, serviceWorkers:'block' });
    const page = await context.newPage();
    await page.goto(`${base}/?markets-error=${Date.now()}`, { waitUntil:'networkidle' });
    await page.locator('.az-desktop-shortcut[data-app="markets"]:visible').first().click();
    const win = page.locator('.az-window[data-app-id="markets"]');
    const error = win.locator('[data-error]');
    await error.waitFor({ state:'visible', timeout:15000 });
    assert.match(await error.innerText(), /could not be loaded/i);
    assert.match(await error.innerText(), /not found|HTTP|reached/i);
    assert.equal(await win.locator('[data-market-retry]').isVisible(), true);
    assert.equal(await win.locator('[data-market="crypto"]').isEnabled(), true);
    // Recovery: data appears, Try again loads it and the error disappears.
    await fixtures(page);
    await win.locator('[data-market-retry]').click();
    await win.locator('[data-raw-table] tbody tr[data-symbol]').first().waitFor({ timeout:15000 });
    assert.equal(await error.isHidden(), true);
    await context.close();
  } finally { await browser.close(); server.close(); }
});
