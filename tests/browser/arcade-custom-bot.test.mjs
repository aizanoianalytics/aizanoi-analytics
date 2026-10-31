import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { assertFullRoster } from './arcade-roster.mjs';

const frontend = fileURLToPath(new URL('../../frontend/', import.meta.url));
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

async function serveFrontend() {
  const server = http.createServer(async (request, response) => {
    try {
      const address = new URL(request.url, 'http://localhost');
      const relative = decodeURIComponent(address.pathname).replace(/^\/+/, '');
      let location = path.resolve(frontend, relative);
      const inside = path.relative(frontend, location);
      if (inside.startsWith('..') || path.isAbsolute(inside)) {
        response.writeHead(403).end();
        return;
      }
      if ((await stat(location)).isDirectory()) {
        location = path.join(location, 'index.html');
      }
      const body = await readFile(location);
      response.writeHead(200, {
        'Content-Type': contentTypes[path.extname(location)] || 'application/octet-stream',
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self'",
          "worker-src 'self' blob:",
          "style-src 'self'",
          "img-src 'self' data:",
          "connect-src 'self'",
          "object-src 'none'",
          "base-uri 'self'"
        ].join('; '),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store'
      });
      response.end(body);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
    }
  };
}

test('chess: uploaded bot completes an Instant game under strict CSP', {
  timeout: 120000
}, async t => {
  const site = await serveFrontend();
  t.after(() => site.close());

  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto(`${site.origin}/arcade/chess/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !document.getElementById('ch-white').disabled);
  await assertFullRoster(page, 'chess');

  const chooser = page.waitForEvent('filechooser');
  await page.selectOption('#ch-white', 'custom');
  await chooser;

  // Use the module's hidden input, rather than injecting code into the page.
  await page.setInputFiles('#arena-custom-file', {
    name: 'first-legal.js',
    mimeType: 'text/javascript',
    buffer: Buffer.from(
      'function move(state) { return state.legalMoves[0]; }\n',
      'utf8'
    )
  });

  await page.waitForFunction(() => {
    const select = document.getElementById('ch-white');
    return !select.disabled &&
      select.value === 'custom' &&
      select.selectedOptions[0].textContent === 'Your bot: first-legal.js';
  });

  assert.equal(await page.locator('#arena-custom-file').getAttribute('hidden'), '');
  assert.match(await page.locator('#ch-cards').innerText(), /first-legal\.js/);
  assert.match(await page.locator('#ch-cards').innerText(), /You/);
  assert.equal(await page.locator('#ch-black option[value="custom"]').innerText(),
    'Your bot: first-legal.js');

  await page.selectOption('#ch-black', 'sample-random');
  await page.selectOption('#ch-speed', '0');
  await page.selectOption('#ch-series', '1');
  await page.click('#ch-start');

  await page.waitForFunction(() => {
    const snapshot = window.__CHESS_ARENA__();
    return !snapshot.running && snapshot.result.length > 0;
  }, null, { timeout: 90000 });

  const snapshot = await page.evaluate(() => window.__CHESS_ARENA__());
  assert.ok(snapshot.moves.length > 0, 'The uploaded bot must play actual moves');
  assert.ok(snapshot.result.length > 0);
  assert.doesNotMatch(snapshot.result, /forfeit|load failed|Arena error/i);
  assert.equal(snapshot.seats[0].name, 'first-legal.js');
  assert.equal(snapshot.seats[0].lab, 'You');
  assert.equal(snapshot.seats[0].human, false);
  assert.deepEqual(pageErrors, []);

  const apiResponse = await page.request.get(`${site.origin}/arcade/chess/BOT_API.md`);
  assert.equal(apiResponse.ok(), true);
  assert.match(apiResponse.headers()['content-type'], /^text\/plain\b/);
});

test('every installed roster entry initializes in its real browser worker under strict CSP', {
  timeout: 180000
}, async t => {
  const site = await serveFrontend();
  t.after(() => site.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const games = ['snake-royale', 'chess', 'maze-chase', 'capture-flag', 'holdem', 'football', 'anatolian-pact'];
  let checked = 0;
  for (const game of games) {
    const { bots } = JSON.parse(await readFile(path.join(frontend, 'arcade', game, 'bots.json'), 'utf8'));
    await page.goto(`${site.origin}/arcade/${game}/`, { waitUntil: 'domcontentloaded' });
    const records = await page.evaluate(async ({ game, ids }) => {
      const records = [];
      for (const id of ids) {
        const result = await new Promise(resolve => {
          const worker = new Worker(`/arcade/${game}/bot-worker.js`);
          let settled = false;
          const finish = response => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            worker.terminate();
            resolve({ id, ...response });
          };
          const budget = game === 'chess' ? 1000 : game === 'anatolian-pact' ? 2000 : 5000;
          const timer = setTimeout(() => finish({ type: 'timeout' }), budget);
          worker.onmessage = event => finish(event.data);
          worker.onerror = event => {
            event.preventDefault();
            finish({ type: 'error', detail: event.message });
          };
          worker.onmessageerror = () => finish({ type: 'error', detail: 'Unreadable worker response' });
          worker.postMessage({ type: 'init', id, seed: 7 });
        });
        records.push(result);
      }
      return records;
    }, { game, ids: bots.map(bot => bot.id) });
    assert.deepEqual(records.map(record => record.id), bots.map(bot => bot.id), `${game}: every canonical roster entry checked`);
    assert.deepEqual(records.filter(record => record.type !== 'ready'), [], `${game}: imported contestants must initialize`);
    checked += records.length;
  }
  assert.equal(checked, 194, 'all installed entries, including 153 AI WAR submissions');
});
