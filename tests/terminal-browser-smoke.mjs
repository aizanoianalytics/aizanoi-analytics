import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless:true });
const context = await browser.newContext({ viewport:{ width:1280, height:800 } });
const page = await context.newPage();
const apiRequests = [];
const errors = [];

page.on('request', (request) => {
  try {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  } catch (_) {}
});
page.on('pageerror', (error) => errors.push(String(error)));

await page.goto(`${base}/`, { waitUntil:'networkidle' });
await page.waitForFunction(() => !document.getElementById('boot') || document.getElementById('boot').classList.contains('hide'), null, { timeout:6000 });
await page.waitForFunction(() => Boolean(window.AIZANOI_OS), null, { timeout:8000 });
await page.evaluate(() => window.AIZANOI_OS.launchApp('terminal'));
await page.locator('#term-input').waitFor({ state:'visible', timeout:5000 });

const initialOutput = await page.locator('#term-out').innerText();
assert.match(initialOutput, /AIZANOI FIELD TERMINAL/);
assert.match(initialOutput, /browser-only/i);
assert.doesNotMatch(initialOutput, /Microsoft|Windows XP|Copyright 1985|C:\\Aizanoi/i);
assert.match(await page.locator('#term-out .prompt').last().innerText(), /aizanoi@field:~\$/);
const statusbarText = await page.locator('#term-input').evaluate((input) => input.closest('.win')?.querySelector('.win-statusbar')?.innerText || '');
assert.match(statusbarText, /LOCAL VIRTUAL SHELL · \/aizanoi/);
assert.doesNotMatch(statusbarText, /C:\\Aizanoi|Windows|Microsoft/i);
const taskText = await page.locator('#task-terminal').innerText();
assert.match(taskText, /Field Terminal/);
assert.doesNotMatch(taskText, /C:\\Aizanoi|Windows|Microsoft/i);
assert.equal(await page.locator('#task-terminal').getAttribute('aria-label'), 'Field Terminal');

async function command(value) {
  const input = page.locator('#term-input');
  await input.fill(value);
  await input.press('Enter');
  await page.waitForTimeout(50);
  return page.locator('#term-out').innerText();
}

let output = await command('help');
assert.match(output, /Available commands:/);
assert.match(output, /pwd/);
assert.match(output, /cat/);

output = await command('ls');
assert.match(output, /README\.txt/);
assert.match(output, /docs/);

output = await command('cat docs/info.txt');
assert.match(output, /Aizanoi Analytics/);

output = await command('cat ..\/..\/etc\/passwd');
assert.match(output, /Access denied/);

output = await command('hostname');
assert.match(output, /not available in the Aizanoi virtual terminal/);

await page.evaluate(() => { window.__terminalXss = false; });
await command('echo <img src=x onerror="window.__terminalXss=true">');
assert.equal(await page.evaluate(() => window.__terminalXss), false, 'terminal output executed injected HTML');
assert.match(await page.locator('#term-out').innerText(), /<img src=x onerror=/);

assert.deepEqual(apiRequests, [], `terminal/static workstation made API requests: ${apiRequests.join(', ')}`);
assert.deepEqual(errors, [], `terminal browser errors: ${errors.join(' | ')}`);

await context.close();
await browser.close();
console.log('Aizanoi browser-only terminal smoke passed');
