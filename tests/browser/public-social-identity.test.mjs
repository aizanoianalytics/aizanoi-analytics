import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const EMAIL = 'aizanoianalytics@protonmail.com';

async function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('requestfailed', (request) => errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`));
  return errors;
}

for (const viewport of [
  { width:1440, height:900 },
  { width:768, height:1024 },
  { width:390, height:844 },
  { width:320, height:568 }
]) {
  test(`Aizo identity is usable without overflow at ${viewport.width}px`, async () => {
    const browser = await chromium.launch({ headless:true });
    const context = await browser.newContext({ viewport, serviceWorkers:'block' });
    const page = await context.newPage();
    const errors = await collectErrors(page);
    try {
      await page.goto(`${base}/?aizo-qa=${viewport.width}`, { waitUntil:'networkidle' });
      await page.waitForSelector('.az-aizo-card:visible');
      const result = await page.locator('.az-aizo-card:visible').first().evaluate((card) => {
        const x = card.querySelector('a[href="https://x.com/AizanoiHQ"]');
        const email = card.querySelector(`a[href="mailto:${'aizanoianalytics@protonmail.com'}"]`);
        const rect = card.getBoundingClientRect();
        const targets = [...card.querySelectorAll('.az-aizo-action')].map((link) => {
          const box = link.getBoundingClientRect();
          return { width:box.width, height:box.height, left:box.left, right:box.right };
        });
        return {
          copy:card.textContent,
          xTarget:x?.target,
          xRel:x?.rel,
          emailHref:email?.getAttribute('href'),
          cardLeft:rect.left,
          cardRight:rect.right,
          cardTop:rect.top,
          viewport:document.documentElement.clientWidth,
          viewportHeight:document.documentElement.clientHeight,
          overflow:document.documentElement.scrollWidth - document.documentElement.clientWidth,
          targets
        };
      });
      assert.match(result.copy, /AIZO \/ ONLINE/);
      assert.match(result.copy, /Aizo is on X\. Unfortunately\./);
      assert.equal(result.xTarget, '_blank');
      assert.equal(result.xRel, 'noopener noreferrer');
      assert.equal(result.emailHref, `mailto:${EMAIL}`);
      assert.ok(result.cardLeft >= 0 && result.cardRight <= result.viewport + 1, JSON.stringify(result));
      assert.ok(result.overflow <= 1, JSON.stringify(result));
      if (viewport.width <= 430) {
        assert.ok(result.cardTop < result.viewportHeight * 2, `Aizo card is buried below the mobile discovery surface: ${JSON.stringify(result)}`);
        for (const target of result.targets) assert.ok(target.height >= 44 && target.left >= 0 && target.right <= result.viewport + 1, JSON.stringify(target));
      }
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}

test('representative public landings expose working public identity links without page errors', async () => {
  const browser = await chromium.launch({ headless:true });
  const context = await browser.newContext({ viewport:{ width:1280, height:800 }, serviceWorkers:'block' });
  try {
    for (const route of [
      '/analytics/', '/tv/', '/worlds/', '/forge/', '/journal/', '/labs/', '/arcade/', '/privacy/',
      '/news/', '/news/2026-09-07/', '/news/2026-09-07/nvidia-acquires-hugging-face/'
    ]) {
      const page = await context.newPage();
      const errors = await collectErrors(page);
      const response = await page.goto(`${base}${route}`, { waitUntil:'networkidle' });
      assert.equal(response?.status(), 200, route);
      assert.equal(await page.locator('meta[name="twitter:site"]').getAttribute('content'), '@AizanoiHQ', `${route} twitter:site`);
      const links = await page.locator('footer a').evaluateAll((nodes) => nodes.map((node) => ({ href:node.getAttribute('href'), target:node.target, rel:node.rel })));
      assert.ok(links.some((link) => link.href === 'https://x.com/AizanoiHQ' && link.target === '_blank' && link.rel === 'noopener noreferrer'), route);
      assert.ok(links.some((link) => link.href === 'https://github.com/aizanoianalytics/aizanoi-analytics' && link.target === '_blank' && link.rel === 'noopener noreferrer'), route);
      assert.ok(links.some((link) => link.href === `mailto:${EMAIL}`), route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `${route} overflowed by ${overflow}px`);
      assert.deepEqual(errors, [], `${route}: ${errors.join('\n')}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
