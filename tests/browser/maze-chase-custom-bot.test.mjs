import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { assertFullRoster } from './arcade-roster.mjs';

const frontend = fileURLToPath(new URL('../../frontend/', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.md': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

async function serveFrontend() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      let filename = path.resolve(frontend, `.${pathname}`);
      const relative = path.relative(frontend, filename);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        response.writeHead(403).end();
        return;
      }
      if ((await stat(filename)).isDirectory()) {
        filename = path.join(filename, 'index.html');
      }
      const body = await readFile(filename);
      response.writeHead(200, {
        'Content-Type': MIME[path.extname(filename)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self'; worker-src 'self' blob:; " +
          "style-src 'self'; img-src 'self' data:; connect-src 'self'; " +
          "font-src 'self'; object-src 'none'; base-uri 'self'",
      });
      response.end(body);
    } catch (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}

test('maze-chase: uploaded bot completes an Instant game against the samples', {
  timeout: 120000,
}, async t => {
  const server = await serveFrontend();
  t.after(() => server.close());

  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());

  const context = await browser.newContext();
  t.after(() => context.close());

  const page = await context.newPage();
  const pageErrors = [];
  const workerFailures = [];
  const workerTypes = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  // Observe real worker traffic without replacing workers or their messages.
  // A game result alone would also be possible with a failed bot, because
  // Maze Chase intentionally falls back to the previous direction.
  await page.exposeFunction('recordMazeWorkerReply', data => {
    if (data?.type === 'fail') workerFailures.push(data.detail);
    if (data?.type === 'ready' || data?.type === 'move') {
      workerTypes.push(data.type);
    }
  });
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        if (String(args[0]).startsWith('blob:')) {
          this.addEventListener('message', event => {
            void window.recordMazeWorkerReply(event.data);
          });
        }
      }
    };
  });

  await page.goto(
    `${server.origin}/arcade/maze-chase/?runners=sample-wanderer&ghosts=sample-hunter,sample-tactician,sample-wanderer`,
    { waitUntil: 'load' },
  );
  await page.waitForFunction(() => {
    const start = document.getElementById('mc-start');
    return start && !start.disabled;
  });
  await assertFullRoster(page, 'maze-chase');

  await page.selectOption('#mc-speed', '0');
  await page.selectOption('#mc-series', '1');

  const pickerOpened = page.waitForEvent('filechooser');
  await page.locator('#mc-runners select').first().selectOption('custom');
  await pickerOpened;

  await page.setInputFiles('#arena-custom-file', {
    name: 'always-left.js',
    mimeType: 'text/javascript',
    buffer: Buffer.from("module.exports = function move() { return 'left'; };\n"),
  });

  await page.waitForFunction(() => {
    const select = document.querySelector('#mc-runners select');
    return select?.value === 'custom' &&
      select.selectedOptions[0]?.textContent === 'Your bot: always-left.js' &&
      !document.getElementById('mc-start').disabled;
  });

  assert.equal(await page.locator('#arena-custom-file').isHidden(), true);
  assert.match(
    await page.locator('#mc-cards [data-seat="r1"]').innerText(),
    /always-left\.js[\s\S]*You/,
  );
  assert.deepEqual(
    await page.evaluate(() => window.__MAZE_CHASE__().seats),
    [
      { role: 'runner', kind: 'bot', id: 'custom' },
      { role: 'ghost', kind: 'bot', id: 'sample-hunter' },
      { role: 'ghost', kind: 'bot', id: 'sample-tactician' },
      { role: 'ghost', kind: 'bot', id: 'sample-wanderer' },
    ],
  );

  await page.click('#mc-start');
  await page.waitForFunction(() => {
    const state = window.__MAZE_CHASE__();
    return !state.running && Boolean(state.result) && state.tick > 0;
  }, null, { timeout: 90000 });

  const state = await page.evaluate(() => window.__MAZE_CHASE__());
  assert.match(state.result, /^(?:Runners|Ghosts) win:/);
  assert.ok(state.tick > 0 && state.tick <= 1500);
  assert.ok(workerTypes.includes('ready'), 'The uploaded worker must initialize');
  assert.ok(workerTypes.includes('move'), 'The uploaded worker must answer a move');
  assert.deepEqual(workerFailures, []);
  assert.deepEqual(pageErrors, []);
});
