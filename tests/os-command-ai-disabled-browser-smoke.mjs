import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless:true });
const context = await browser.newContext({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true, deviceScaleFactor:2 });
const page = await context.newPage();
page.setDefaultTimeout(10000);

await page.goto(`${base}/`, { waitUntil:'networkidle' });
await page.waitForFunction(() => {
  const boot = document.getElementById('boot');
  return (!boot || boot.classList.contains('hide') || getComputedStyle(boot).display === 'none') && Boolean(window.AIZANOI_OS_INTENT && window.AIZANOI_PRODUCT_POLISH);
}, null, { timeout:10000 });

await page.evaluate(() => window.AIZANOI_OS?.openCommand?.(''));
await page.waitForSelector('#az-command.open');
await page.waitForTimeout(100);

const initialVisible = await page.locator('#az-command-results .az-command-result:visible').allInnerTexts();
assert.ok(initialVisible.length > 0, 'command palette has no visible results');
assert.ok(initialVisible.every((text) => !/Aizanoi AI/i.test(text)), `disabled AI leaked into initial command results: ${initialVisible.join(' | ')}`);

// Use the removed app id itself so normal Aizanoi historical-world search results
// are not mistaken for the former AI surface.
const input = page.locator('#az-command-input');
await input.fill('chatbot');
await page.waitForTimeout(120);
const removedAppVisible = await page.locator('#az-command-results .az-command-result:visible').allInnerTexts();
assert.ok(removedAppVisible.every((text) => !/Aizanoi AI/i.test(text)), `disabled AI leaked after chatbot search: ${removedAppVisible.join(' | ')}`);
assert.equal(await page.locator('#az-command-results [data-ai-disabled-empty]').count(), 1, 'removed chatbot search should fail closed with local no-match copy');

// Enter on a removed-app-only query must not resurrect/open the chatbot window.
await input.press('Enter');
await page.waitForTimeout(150);
assert.equal(await page.locator('.win').filter({ hasText:'Aizanoi AI' }).count(), 0, 'Enter executed a hidden disabled AI command');
assert.equal(await page.locator('[data-app-id="chatbot"]:visible').count(), 0, 'chatbot became visible from command palette');

// A normal visible command must still execute through the safe visible selection.
if (!(await page.locator('#az-command').evaluate((node) => node.classList.contains('open')))) {
  await page.evaluate(() => window.AIZANOI_OS?.openCommand?.(''));
  await page.waitForSelector('#az-command.open');
}
await input.fill('terminal');
await page.waitForTimeout(100);
const visibleTerminal = page.locator('#az-command-results .az-command-result:visible').filter({ hasText:'Field Terminal' }).first();
await visibleTerminal.waitFor({ state:'visible' });
await input.press('Enter');
await page.locator('.win[data-app-id="terminal"]').waitFor({ state:'visible', timeout:8000 });

await browser.close();
console.log('Aizanoi disabled-AI command palette smoke passed');
