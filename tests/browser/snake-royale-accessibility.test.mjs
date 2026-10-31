import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { assertFullRoster } from './arcade-roster.mjs';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const csp = "default-src 'self'; script-src 'self'; style-src 'self'; worker-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'";

test('phone arena remains CSP-safe and announces events rather than every card update', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  try {
    await page.route('**/arcade/snake-royale/?accessibility=*', async route => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: { ...response.headers(), 'content-security-policy': csp },
      });
    });
    await page.goto(`${base}/arcade/snake-royale/?accessibility=1`);
    await page.waitForFunction(() => typeof window.__SNAKE_ROYALE__ === 'function');
    await assertFullRoster(page, 'snake-royale');
    assert.equal(await page.locator('.sr-side-panel[aria-live]').count(), 0);
    assert.equal(await page.locator('#sr-ticker').getAttribute('role'), 'status');
    assert.equal(await page.locator('#sr-result').getAttribute('role'), 'status');
    assert.equal(await page.locator('#sr-cards [aria-live]').count(), 0);
    // Roster tints, preview-card tints and health bars also use CSP-safe CSSOM custom properties.
    const styles = await page.locator('[style]').evaluateAll(nodes => nodes.map(node => ({
      fighterA: node.matches('.sr-a'),
      fighterB: node.matches('.sr-b'),
      roster: node.matches('#sr-list li'),
      card: node.matches('#sr-cards .sr-card'),
      health: node.matches('#sr-cards .sr-bar > i'),
      properties: [...node.style].map(name => ({
        name,
        value: node.style.getPropertyValue(name).trim(),
        priority: node.style.getPropertyPriority(name),
      })),
    })));
    const botCount = await page.evaluate(() => window.__SNAKE_ROYALE__().bots);
    assert.equal(styles.length, botCount + 6,
      'initial styles belong to two picker tints, every roster entry, two cards and two health bars');
    assert.equal(styles.filter(style => style.fighterA).length, 1);
    assert.equal(styles.filter(style => style.fighterB).length, 1);
    assert.equal(styles.filter(style => style.roster).length, botCount);
    assert.equal(styles.filter(style => style.card).length, 2);
    assert.equal(styles.filter(style => style.health).length, 2);
    for (const style of styles) {
      assert.ok(style.fighterA || style.fighterB || style.roster || style.card || style.health,
        `unexpected styled element: ${JSON.stringify(style)}`);
      const expected = style.fighterA ? ['--sr-a'] :
        style.fighterB ? ['--sr-b'] :
        style.health ? ['--c', '--health'] : ['--c'];
      assert.deepEqual(style.properties.map(property => property.name).sort(), expected.sort());
      for (const property of style.properties) {
        assert.equal(property.priority, '');
        assert.match(property.value, property.name === '--health' ? /^100%$/ : /^#[0-9a-f]{6}$/i);
      }
    }
    const metrics = await page.evaluate(() => {
      const bounds = id => {
        const rect = document.getElementById(id).getBoundingClientRect();
        return { width: rect.width, height: rect.height, top: rect.top };
      };
      const fight = bounds('sr-fight');
      const random = bounds('sr-random');
      const add = bounds('sr-add');
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        fight, random, add,
        canvas: bounds('sr-canvas'),
        cardLabels: [...document.querySelectorAll('#sr-cards .sr-card b')]
          .map(node => node.textContent),
      };
    });
    assert.ok(metrics.overflow <= 1, JSON.stringify(metrics));
    assert.ok(metrics.canvas.width >= 280, JSON.stringify(metrics));
    assert.ok(metrics.fight.top < 844, JSON.stringify(metrics));
    for (const target of [metrics.fight, metrics.random, metrics.add]) {
      assert.ok(target.height >= 44);
    }
    assert.equal(metrics.random.top, metrics.add.top);
    assert.match(metrics.cardLabels[0], /^A ·/);
    assert.match(metrics.cardLabels[1], /^B ·/);
    assert.match(await page.locator('#sr-canvas').getAttribute('aria-label'), /2 of 2 fighters alive/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('failed bot startup is visible and final cards expose actual placements', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  try {
    // Exercise the real worker bootstrap without depending on a long-running bot.
    await page.route('**/arcade/snake-royale/bots/opus.js', route => route.fulfill({
      contentType: 'application/javascript',
      body: "'use strict'; throw new Error('intentional startup test failure');",
    }));
    await page.route('**/arcade/snake-royale/bots/haiku.js', route => route.fulfill({
      contentType: 'application/javascript',
      body: "'use strict'; module.exports = function () { return 'up'; };",
    }));
    await page.goto(`${base}/arcade/snake-royale/?a=opus&b=haiku`);
    await page.waitForFunction(() => typeof window.__SNAKE_ROYALE__ === 'function');
    await assertFullRoster(page, 'snake-royale');
    await page.selectOption('#sr-speed', '0');
    await page.locator('#sr-fight').click();
    await page.waitForFunction(() => window.__SNAKE_ROYALE__().result !== null);
    const state = await page.evaluate(() => window.__SNAKE_ROYALE__());
    assert.equal(state.running, false);
    assert.match(state.ticker, /Claude Opus 5\.5 failed to start/);
    assert.match(state.result, /Claude Haiku 5\.5 wins/);
    assert.match(state.cards[0], /Place 2/);
    assert.match(state.cards[0], /load-error/);
    assert.match(state.cards[1], /Place 1/);
    assert.match(state.cards[1], /Survivor/);
    assert.equal(await page.locator('#sr-cards .sr-bar').count(), 0,
      'final placements do not pretend every survivor has zero health');
  } finally {
    await browser.close();
  }
});
