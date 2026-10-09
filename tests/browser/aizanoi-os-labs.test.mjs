import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4187';

test('Aizanoi Labs opens as a desktop shortcut with the Grok workspace', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await page.goto(`${base}/?labs-qa=${Date.now()}`, { waitUntil: 'networkidle' });
    await page.locator('.az-desktop-shortcut[data-app="labs"]:visible').click();
    const app = page.locator('.az-window[data-app-id="labs"]');
    await app.locator('[data-workspace-panel="grok"]').waitFor();
    assert.equal(await app.getByRole('heading', { name: 'Grok 4.6 Fast' }).count(), 1);
    await app.locator('[data-labs-prompt="grok"]').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-labs-prompt="grok"]')?.value.length > 1000);
    assert.ok((await app.locator('[data-labs-prompt="grok"]').inputValue()).includes('The Rise of Rome'));
    assert.match(await app.locator('[data-labs-video="grok"]').getAttribute('src'), /roman-history\.mp4$/);
    await app.getByRole('button', { name: 'Step 5 Preview' }).click();
    await page.waitForFunction(() => document.querySelector('[data-labs-prompt="step5"]')?.value.length > 80);
    assert.equal(await app.locator('[data-labs-prompt="step5"]').inputValue(), 'Create a video depicting the Conquest of Istanbul using HTML, JavaScript, SVG, GSAP, and other related web technologies.');
    assert.match(await app.locator('[data-labs-video="step5"]').getAttribute('src'), /istanbul-fethi-1453\.mp4$/);
    const videoResponse = await page.request.get(`${base}/js/v3/apps/labs/assets/istanbul-fethi-1453.mp4`);
    assert.equal(videoResponse.status(), 200);
    assert.match(videoResponse.headers()['content-type'], /video\/mp4/);
    assert.equal(await app.locator('.az-empty-state').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
