import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless:true });
const context = await browser.newContext({ viewport:{ width:1280, height:800 } });

await context.addInitScript(() => {
  sessionStorage.setItem('aizanoi-world-ai-context', JSON.stringify({
    worldLabel:'Rome AD 410–476',
    place:'Colosseum',
    timestamp:Date.now(),
  }));
});

const page = await context.newPage();
const errors = [];
let chatRequests = 0;
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => {
  if (message.type() !== 'error') return;
  const text = message.text();
  if (/<g> attribute transform: Expected '\)', "translate\(50%, 100%\)"/.test(text)) return;
  errors.push(text);
});
page.on('request', request => {
  if (new URL(request.url()).pathname === '/api/chat') chatRequests += 1;
});

const visibleQuestion = 'Explain the place I was viewing and its historical evidence.';
await page.goto(`${base}/?ask=${encodeURIComponent(visibleQuestion)}`, { waitUntil:'networkidle' });
await page.waitForFunction(() => Boolean(window.AIZANOI_OS_INTENT && window.AIZANOI_AI_DISABLED), null, { timeout:6000 });

const url = new URL(page.url());
assert.equal(url.searchParams.has('ask'), false, 'disabled AI deep-link parameter should be removed');
assert.equal(chatRequests, 0, 'security build must never call /api/chat from the browser');
assert.equal(await page.evaluate(() => window.AIZANOI_OS_INTENT.shouldAskAI('hello')), false, 'natural-language AI routing must stay disabled');
assert.equal(await page.evaluate(() => window.AIZANOI_OS_INTENT.submitContextualAI('hello')), false, 'historical-world AI handoff must stay disabled');
assert.equal(await page.evaluate(() => sessionStorage.getItem('aizanoi-world-ai-context')), null, 'stale world AI context should be cleared');
assert.equal(await page.locator('[data-app="chatbot"]:visible').count(), 0, 'AI app launcher should be hidden');
assert.deepEqual(errors, [], `AI-disabled browser errors: ${errors.join(' | ')}`);

await context.close();
await browser.close();
console.log('Historical World AI bridge remains safely disabled');
