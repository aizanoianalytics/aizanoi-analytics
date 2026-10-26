// Natural first-wave combat/reward; late HUD uses explicitly labelled fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const evidence = process.env.DUNGEON_EVIDENCE_DIR;
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'];
async function boot(browser, viewport, touch = false) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(`${base}/dungeon/?core=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.AIZANOI_DUNGEON_GAME?.frames > 0, null, { timeout: 60000 });
  const warning = page.locator('.az-play-anyway');
  if (await warning.isVisible()) await warning.click();
  await page.locator('.az-dungeon-begin').click({ timeout: 90000 });
  return { context, page, errors };
}
async function capture(context, page, name) {
  if (!evidence) return;
  await mkdir(evidence, { recursive: true });
  // CDP capture avoids the screenshot font-wait path, which stalls under a
  // loaded software renderer long after the frame is actually drawn.
  const cdp = await context.newCDPSession(page);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(`${evidence}/${name}.png`, Buffer.from(data, 'base64'));
}
async function overlap(page, a, b) {
  return page.evaluate(([a,b]) => {
    const x = document.querySelector(a), y = document.querySelector(b);
    if (!x || !y || x.hidden || y.hidden) return false;
    const r = x.getBoundingClientRect(), s = y.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || s.width === 0 || s.height === 0) return false;
    return r.left < s.right && r.right > s.left && r.top < s.bottom && r.bottom > s.top;
  }, [a,b]);
}
async function contained(page, inner, outer) {
  return page.evaluate(([inner, outer]) => {
    const x = document.querySelector(inner), y = document.querySelector(outer);
    if (!x || !y || x.hidden || y.hidden) return false;
    const r = x.getBoundingClientRect(), s = y.getBoundingClientRect();
    return r.top >= s.top - 1 && r.left >= s.left - 1 && r.bottom <= s.bottom + 1 && r.right <= s.right + 1;
  }, [inner, outer]);
}

test('natural combat reward is clickable; Escape cannot silently sell a blessing', { timeout: 240000 }, async () => {
  const browser = await chromium.launch({ args });
  try {
    const { context, page, errors } = await boot(browser, { width: 1024, height: 640 });
    await page.keyboard.down('k');
    for (let i=0; i<90; i++) {
      await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.qaAdvance(20));
      if (await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.enemyCount === 0 && window.AIZANOI_DUNGEON_GAME.status.pendingSpawns === 0)) break;
    }
    await page.keyboard.up('k');
    const ledger = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.ledger);
    assert.equal(ledger.kills, 5, 'actual combat must clear all first-wave enemies');
    await capture(context,page, 'desktop-combat-clear');
    await page.keyboard.press('Enter');
    await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.qaAdvance(1));
    await page.locator('.az-dungeon-pick').waitFor({ timeout: 15000 });
    assert.equal(await page.locator('.az-hud-pause').isVisible(), false);
    const before = await page.evaluate(() => ({ gold: window.AIZANOI_DUNGEON_GAME.ledger.gold, blessings: window.AIZANOI_DUNGEON_GAME.buffs.blessings }));
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.az-dungeon-pick').isVisible(), true, 'Escape must preserve the pending reward');
    assert.equal(await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.ledger.gold), before.gold);
    for (const card of await page.locator('.az-dungeon-pick-card').all()) {
      assert.equal(await card.evaluate(el => { const r=el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); }), true);
    }
    await capture(context,page, 'desktop-natural-reward');
    await page.locator('.az-dungeon-pick-card').nth(1).click();
    assert.equal(await page.locator('.az-dungeon-pick').count(), 0);
    assert.equal(await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.buffs.blessings.length), before.blessings.length+1);
    await page.keyboard.press('Enter');
    await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.qaAdvance(70));
    assert.ok(await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.enemyCount > 0));
    await capture(context,page, 'desktop-next-wave');
    assert.deepEqual(errors, []);
    if (evidence) await writeFile(`${evidence}/natural.json`, JSON.stringify({ ledger, before, errors }, null, 2));
  } finally { await browser.close(); }
});

test('trusted secondary touch dashes while the movement pointer stays owned', { timeout: 180000 }, async () => {
  const browser = await chromium.launch({ args });
  try {
    const { context, page, errors } = await boot(browser, { width: 844, height: 390 }, true);
    const mode = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.assist.mode);
    assert.equal(mode, 'auto');
    const modeButton = page.getByRole('button', { name: /Assist mode:/ });
    await modeButton.tap();
    assert.equal(await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.assist.mode), 'manual');
    const pad = await page.locator('.az-touch-joystick').boundingBox();
    const dash = await page.getByRole('button', { name: 'Dash', exact: true }).boundingBox();
    const cdp = await context.newCDPSession(page);
    const p1 = { x: pad.x+pad.width/2, y: pad.y+pad.height/2, id: 1 };
    const p2 = { x: dash.x+dash.width/2, y: dash.y+dash.height/2, id: 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p1] });
    const before = await page.evaluate(() => ({ stamina: window.AIZANOI_DUNGEON_GAME.stamina }));
    // Second finger taps Dash while the first holds the pad. CDP touchEnd
    // lists the RELEASED points, so releasing the action finger keeps p1.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p1,p2] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [p2] });
    await page.waitForFunction(
      (s) => window.AIZANOI_DUNGEON_GAME.stamina < s - 10,
      before.stamina,
      { timeout: 30000, polling: 250 },
    );
    const after = await page.evaluate(() => ({ stamina: window.AIZANOI_DUNGEON_GAME.stamina, active: document.querySelector('.az-touch-joystick').classList.contains('is-active') }));
    assert.ok(after.stamina < before.stamina - 10, `secondary dash must spend stamina: ${JSON.stringify({before,after})}`);
    assert.equal(after.active, true, 'action release must not release movement');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [p1] });
    assert.equal(await page.locator('.az-touch-joystick').evaluate(el => el.classList.contains('is-active')), false);
    await capture(context,page, 'landscape-multitouch');
    assert.deepEqual(errors, []);
    if (evidence) await writeFile(`${evidence}/multitouch.json`, JSON.stringify({ mode, before, after, errors }, null, 2));
  } finally { await browser.close(); }
});

for (const [name, width, height, touch] of [['desktop',1440,900,false], ['tablet',1024,640,true], ['portrait',390,844,true], ['landscape',844,390,true]]) {
  test(`${name} HUD reserves navigation, vitals, build and touch regions`, { timeout: 180000 }, async () => {
    const browser = await chromium.launch({ args });
    try {
      const { context, page, errors } = await boot(browser, { width, height }, touch);
      await page.evaluate(() => {
        // Populated presentation fixture, not evidence of a completed run.
        const list=document.querySelector('.az-hud-blessings'); list.hidden=false;
        for(let i=0;i<7;i++) { const li=document.createElement('li'); li.className='az-hud-blessing-item'; li.textContent='Very long blessing of the ancient temple ◆◆◆'; list.append(li); }
      });
      // A real announcement through the game's own assist toggle, so the
      // banner geometry is production text, not an empty box.
      await page.keyboard.press('t');
      for (const [a,b] of [['.az-dungeon-exit','.az-hud-vitals'], ['.az-fs-fab','.az-hud-loot-feed'], ['.az-hud-announcer','.az-hud-stamina'], ...(touch ? [['.az-touch-joystick','.az-hud-special'],['.az-touch-joystick','.az-hud-assist']] : [])]) {
        if ((name === 'tablet' || name === 'portrait') && a === '.az-hud-announcer') continue;
        assert.equal(await overlap(page,a,b), false, `${a} overlaps ${b}`);
      }
      // The claimed build list grows inside the vitals panel, never over it.
      assert.equal(await contained(page, '.az-hud-blessings', '.az-hud-vitals'), true, 'blessings must live inside the vitals panel');
      await capture(context,page, `${name}-populated-hud`);
      if (name === 'tablet') {
        await page.evaluate(() => { const h=window.AIZANOI_DUNGEON_GAME; for(let i=0;i<10;i++) h.qaClearWave(); });
        const panel=page.locator('.az-dungeon-victory');
        await panel.waitFor();
        const r=await panel.boundingBox();
        assert.ok(r.y >= 0 && r.y+r.height <= height, `victory panel cropped: ${JSON.stringify(r)}`);
        await page.getByRole('button', { name: 'Continue the descent', exact: true }).scrollIntoViewIfNeeded();
        await capture(context,page, 'tablet-victory-fixture');
      }
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}
