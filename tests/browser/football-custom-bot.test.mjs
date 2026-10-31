import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { assertFullRoster } from './arcade-roster.mjs';

const frontend = fileURLToPath(new URL('../../frontend/', import.meta.url));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.md': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

async function serveFrontend() {
  const server = http.createServer(async (request, response) => {
    response.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self'",
      "worker-src 'self' blob:",
      "style-src 'self'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'"
    ].join('; '));
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      let filename = path.resolve(frontend, `.${pathname}`);
      const relative = path.relative(frontend, filename);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        response.writeHead(403);
        response.end();
        return;
      }
      if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
      const body = await readFile(filename);
      response.writeHead(200, {
        'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    async close() {
      const closed = new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
      server.closeAllConnections();
      await closed;
    }
  };
}

test('football: an uploaded bot plays a Max-speed match against sample bots under CSP', {
  timeout: 120000
}, async t => {
  const server = await serveFrontend();
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const workerFailures = [];

  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  // Observe real worker replies without replacing the worker, engine, runner,
  // or custom source builder. This also prevents a silently disabled uploaded
  // bot from making a merely completed match appear to be a successful test.
  await page.addInitScript(() => {
    window.__footballCustomReplies = [];
    window.__footballWorkerFailures = [];
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        if (!String(args[0]).startsWith('blob:')) return;
        this.addEventListener('message', event => {
          const message = event.data;
          if (message && message.type === 'decide') {
            window.__footballCustomReplies.push(message);
          }
          if (message && message.type === 'fail') {
            window.__footballWorkerFailures.push(message.detail);
          }
        });
        this.addEventListener('error', event => {
          window.__footballWorkerFailures.push(event.message || 'worker error');
        });
      }
    };
    window.__footballCspViolations = [];
    document.addEventListener('securitypolicyviolation', event => {
      window.__footballCspViolations.push({
        directive: event.effectiveDirective,
        blocked: event.blockedURI
      });
    });
  });

  await page.goto(
    `${server.origin}/arcade/football/?red=sample-chaser&blue=sample-striker,sample-chaser&time=60&limit=0&series=1&speed=max`
  );
  await page.waitForFunction(() =>
    typeof window.__FOOTBALL__ === 'function' &&
    !document.getElementById('fb-start').disabled
  );
  await assertFullRoster(page, 'football');

  const redSelect = page.locator('#fb-red select').first();
  assert.deepEqual(await redSelect.locator('option').evaluateAll(options =>
    options.slice(0, 3).map(option => option.value)
  ), ['p1', 'p2', 'custom']);

  // An unhandled native chooser is auto-dismissed by Playwright (a cancel), so accept it like a user would.
  let chooser = page.waitForEvent('filechooser');
  await redSelect.selectOption('custom');
  await (await chooser).setFiles({
    name: 'football-upload.js',
    mimeType: 'text/javascript',
    buffer: Buffer.from(
      'module.exports = { decide: function () { return { x: 1, y: 0, kick: true }; } };',
      'utf8'
    )
  });

  // The UI uses the upload helper's display name, not the literal filename.
  await page.waitForFunction(() => {
    const bot = ArenaCustomBot.get('football');
    return bot && typeof bot.name === 'string' && bot.name.trim().length > 0 &&
      document.querySelector('#fb-red select option[value="custom"]').textContent ===
        `Your bot: ${bot.name}` &&
      window.__FOOTBALL__().seats.some(seat => seat.botId === 'custom') &&
      !document.getElementById('fb-start').disabled;
  });
  const uploadedName = await page.evaluate(() => ArenaCustomBot.get('football').name);
  assert.equal(await redSelect.inputValue(), 'custom');
  assert.equal(await page.locator('#arena-custom-file').getAttribute('hidden'), '');
  assert.ok((await page.locator('#fb-cards').innerText()).includes(uploadedName));
  assert.match(await page.locator('#fb-cards').innerText(), /\bYou\b/);

  // Cancellation preserves the existing seat and the existing in-memory upload.
  await redSelect.selectOption('sample-chaser');
  await redSelect.selectOption('custom');
  await page.locator('#arena-custom-file').dispatchEvent('cancel');
  await page.waitForFunction(() => !document.getElementById('fb-start').disabled);
  assert.equal(await redSelect.inputValue(), 'sample-chaser');
  assert.equal(await page.evaluate(() => ArenaCustomBot.get('football').name), uploadedName);

  // Selecting custom again can replace the single shared upload.
  chooser = page.waitForEvent('filechooser');
  await redSelect.selectOption('custom');
  await (await chooser).setFiles({
    name: 'football-upload.js',
    mimeType: 'text/javascript',
    buffer: Buffer.from(
      'module.exports = { decide: function () { return { x: 1, y: 0, kick: true }; } };',
      'utf8'
    )
  });
  await page.waitForFunction(() =>
    window.__FOOTBALL__().seats.some(seat => seat.botId === 'custom') &&
    !document.getElementById('fb-start').disabled
  );
  await page.selectOption('#fb-speed', 'max');
  await page.click('#fb-start');
  await page.waitForFunction(() => {
    const state = window.__FOOTBALL__();
    return state.result !== null && !state.running;
  }, null, { timeout: 90000 });

  const state = await page.evaluate(() => window.__FOOTBALL__());
  assert.match(state.result, /^(?:Draw|Red wins|Blue wins) \d+–\d+$/);
  assert.equal(state.seats.filter(seat => seat.human || seat.kind === 'human').length, 0);
  assert.equal(state.seats.filter(seat => seat.botId === 'custom').length, 1);
  assert.equal(state.seats.filter(seat => seat.team === 'blue').length, 2);

  const replies = await page.evaluate(() => window.__footballCustomReplies);
  assert.ok(replies.length > 0, 'The uploaded worker must answer actual decisions');
  assert.ok(replies.some(reply =>
    reply.input && reply.input.x === 1 && reply.input.y === 0 &&
    reply.input.kick === true && Number.isSafeInteger(reply.request)
  ), 'The uploaded bot must return its legal action through the normal worker protocol');

  workerFailures.push(...await page.evaluate(() => window.__footballWorkerFailures));
  assert.deepEqual(workerFailures, []);
  assert.deepEqual(await page.evaluate(() => window.__footballCspViolations), []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
});
