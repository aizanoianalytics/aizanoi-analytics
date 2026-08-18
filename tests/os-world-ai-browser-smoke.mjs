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
const requests = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => {
  if (message.type() !== 'error') return;
  const text = message.text();
  if (/<g> attribute transform: Expected '\)', "translate\(50%, 100%\)"/.test(text)) return;
  errors.push(text);
});
await page.route('**/api/chat', async route => {
  requests.push(JSON.parse(route.request().postData() || '{}'));
  await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ reply:'The Colosseum remained a major monument in Late Antique Rome.' }) });
});

const visibleQuestion = 'Explain the place I was viewing and its historical evidence.';
await page.goto(`${base}/?ask=${encodeURIComponent(visibleQuestion)}`, { waitUntil:'networkidle' });
await page.waitForFunction(() => Boolean(window.AIZANOI_OS_INTENT && window.__AIZANOI_CHAT__), null, { timeout:6000 });
await page.waitForFunction(() => document.querySelectorAll('.chat-msg.bot:not(.typing)').length >= 2, null, { timeout:6000 });

const url = new URL(page.url());
assert.equal(url.searchParams.has('ask'), false, 'one-shot Historical World AI query was not consumed');
assert.equal(requests.length, 1, 'Historical World return should issue exactly one AI request');
const history = requests[0].history;
assert.ok(Array.isArray(history) && history.length >= 1, 'chat history missing');
const userPayload = history.findLast(item => item.role === 'user')?.content || '';
assert.match(userPayload, /Current Historical World context: Rome AD 410–476 · Colosseum/);
assert.match(userPayload, /User request: Explain the place I was viewing and its historical evidence\./);
assert.match(await page.locator('.chat-msg.user').last().innerText(), new RegExp(visibleQuestion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.equal(await page.evaluate(() => sessionStorage.getItem('aizanoi-world-ai-context')), null, 'consumed world AI context should be cleared');
assert.deepEqual(errors, [], `Historical World AI bridge browser errors: ${errors.join(' | ')}`);

await context.close();
await browser.close();
console.log('Historical World → Aizanoi AI browser context bridge passed');
