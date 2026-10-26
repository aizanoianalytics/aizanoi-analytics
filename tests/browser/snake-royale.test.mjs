import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';

async function withPage(run, prepare) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  try {
    if (prepare) await prepare(page);
    await run(page, errors);
  } finally {
    await browser.close();
  }
}

test('the arena loads every fighter and fights a real match', async () => {
  await withPage(async (page, errors) => {
    await page.goto(`${base}/arcade/snake-royale/?qa=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.__SNAKE_ROYALE__ === 'function', null, { timeout: 20000 });
    // The picker, the roster and both selects come from bots.json, so an empty
    // or unparsable manifest shows up here as zero fighters.
    const loaded = await page.evaluate(() => ({
      state: window.__SNAKE_ROYALE__(),
      options: [...document.querySelectorAll('#sr-a option')].length,
      roster: document.querySelectorAll('#sr-list li').length,
    }));
    assert.ok(loaded.state.bots >= 20, `expected the full roster, got ${loaded.state.bots}`);
    assert.equal(loaded.options, loaded.state.bots, 'every fighter must be selectable in both pickers');
    assert.equal(loaded.roster, loaded.state.bots, 'every fighter must be listed in the roster');
    assert.deepEqual(loaded.state.fighters, ['opus', 'kimi-k31-pro'], 'the default pairing must be two real fighters');

    // Instant speed, single fight: the match must actually finish.
    await page.selectOption('#sr-speed', '0');
    await page.selectOption('#sr-series', '1');
    await page.locator('#sr-fight').click({ timeout: 30000 });
    await page.waitForFunction(() => window.__SNAKE_ROYALE__().result !== null, null, { timeout: 90000 });
    const done = await page.evaluate(() => window.__SNAKE_ROYALE__());
    assert.match(done.result, /wins|Draw/, `the match must produce a verdict, got ${JSON.stringify(done.result)}`);
    assert.equal(done.running, false, 'the fight control must return to its idle state');
    assert.equal(await page.locator('#sr-fight').textContent(), 'Fight', 'the button must stop saying it is fighting');
    assert.equal(done.cards.length, 2, 'both fighter cards must be on screen');
    assert.deepEqual(errors, [], `page errors: ${JSON.stringify(errors)}`);
  });
});

test('a failed fighter manifest states the problem instead of leaving an empty picker', async () => {
  await withPage(async (page) => {
    await page.goto(`${base}/arcade/snake-royale/?qa=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('#sr-a option').length === 0 && document.querySelector('#sr-fight')?.disabled === true, null, { timeout: 20000 });
    const state = await page.evaluate(() => ({
      ticker: document.querySelector('#sr-ticker').textContent,
      fightDisabled: document.querySelector('#sr-fight').disabled,
      randomDisabled: document.querySelector('#sr-random').disabled,
    }));
    assert.match(state.ticker, /could not be loaded/i, 'the page must name the failure');
    assert.equal(state.fightDisabled, true, 'Fight must be disabled when no fighters load');
    assert.equal(state.randomDisabled, true, 'Random pair must be disabled when no fighters load');
  }, (page) => page.route('**/arcade/snake-royale/bots.json', (route) => route.abort()));
});

test('the arcade landing links to the arena and the arena boots from that link', async () => {
  await withPage(async (page) => {
    await page.goto(`${base}/arcade/?qa=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    const card = page.locator('.card', { hasText: 'AI Snake Royale' });
    await card.waitFor({ state: 'visible', timeout: 20000 });
    assert.match(await card.textContent(), /Pick two AI-written snake bots/);
    await card.locator('a.button', { hasText: 'Fight' }).click({ timeout: 30000 });
    await page.waitForURL('**/arcade/snake-royale/**', { timeout: 30000 });
    await page.waitForFunction(() => typeof window.__SNAKE_ROYALE__ === 'function' && window.__SNAKE_ROYALE__().bots > 0, null, { timeout: 30000 });
    assert.equal(await page.title(), 'AI Snake Royale — Aizanoi Arcade');
  });
});

test('the TV page embeds the channel uploads through the privacy-enhanced player', async () => {
  await withPage(async (page) => {
    await page.goto(`${base}/tv/?qa=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    const iframe = page.locator('.tv-frame iframe');
    await iframe.waitFor({ state: 'attached', timeout: 20000 });
    const src = await iframe.getAttribute('src');
    // The uploads playlist UU… mirrors the channel id UC…: a typo here plays
    // nothing, and the iframe still renders, so pin the exact URL.
    assert.equal(src, 'https://www.youtube-nocookie.com/embed/videoseries?list=UUTurwASTgEY2NrivXpkKPmA');
    assert.equal(await iframe.getAttribute('loading'), 'lazy');
    assert.equal(await iframe.getAttribute('title'), 'Aizo — latest uploads on YouTube');
    assert.equal(await page.locator('.tv-frame iframe').count(), 1, 'exactly one player may be embedded');
    // The handle is link text, not body copy: assert the real hrefs a visitor can reach.
    const links = await page.locator('.tv-player a').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')));
    assert.deepEqual(links, ['https://www.youtube.com/@heyaizo/videos']);
    const subscribe = await page.locator('.hero a.button').first().getAttribute('href');
    assert.equal(subscribe, 'https://www.youtube.com/@heyaizo?sub_confirmation=1');
  });
});

test('the AizanoiOS TV app mounts the same player inside its window', async () => {
  await withPage(async (page) => {
    await page.goto(`${base}/?app=videos&qa=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    const iframe = page.locator('.az-window .az-tv-frame iframe');
    await iframe.waitFor({ state: 'attached', timeout: 30000 });
    assert.equal(await iframe.getAttribute('src'), 'https://www.youtube-nocookie.com/embed/videoseries?list=UUTurwASTgEY2NrivXpkKPmA');
    assert.equal(await iframe.getAttribute('title'), 'Aizo — latest uploads on YouTube');
    // The shell strips its own loading placeholder; a video app that only
    // appended would leave "Opening application…" above the player.
    assert.equal(await page.locator('.az-window .az-empty-state').count(), 0);
    assert.equal(await page.locator('.az-window .az-tv-frame iframe').count(), 1);
  });
});
