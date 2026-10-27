import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const frontend = fileURLToPath(new URL('../../frontend/', import.meta.url));
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

async function serveFrontend() {
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self'",
      "worker-src 'self' blob:",
      "style-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'"
    ].join('; '));
    response.setHeader('X-Content-Type-Options', 'nosniff');

    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      let target = path.resolve(frontend, `.${pathname}`);
      const relative = path.relative(frontend, target);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relative)) {
        response.writeHead(403).end();
        return;
      }
      if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html');
      const content = await readFile(target);
      response.writeHead(200, {
        'Content-Type': mimeTypes[path.extname(target)] || 'application/octet-stream'
      });
      response.end(content);
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
    close: () => new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    })
  };
}

test('holdem: uploaded bot completes an Instant tournament against samples under CSP', {
  timeout: 120000
}, async t => {
  const site = await serveFrontend();
  t.after(() => site.close());

  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' &&
        !message.text().startsWith('Failed to load resource:')) {
      consoleErrors.push(message.text());
    }
  });

  await page.goto(
    `${site.origin}/arcade/holdem/?seats=human,sample-caller,sample-tight,sample-equity`
  );
  await page.waitForFunction(() =>
    typeof window.__HOLDEM__ === 'function' &&
    window.__HOLDEM__().bots === 3 &&
    !document.getElementById('ph-start').disabled
  );

  // All-in is legal while this seat has chips and avoids any assumptions
  // about the shape of the engine's bot-state legal-action metadata.
  const code = 'module.exports = { act: function () { return { type: "allin" }; } };';

  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('#ph-seats select').first().selectOption('custom');
  await chooserPromise;
  await page.setInputFiles('#arena-custom-file', {
    name: 'my-holdem-bot.js',
    mimeType: 'text/javascript',
    buffer: Buffer.from(code)
  });

  await page.waitForFunction(() => {
    const select = document.querySelector('#ph-seats select');
    return select.value === 'custom' &&
      select.selectedOptions[0].textContent === 'Your bot: my-holdem-bot.js' &&
      !document.getElementById('ph-start').disabled;
  });

  assert.equal(await page.locator('#arena-custom-file').getAttribute('type'), 'file');
  assert.equal(await page.locator('#arena-custom-file').isHidden(), true);
  assert.match(await page.locator('#ph-list').innerText(), /You · my-holdem-bot\.js/);
  assert.match(await page.locator('#ph-standings').innerText(), /my-holdem-bot\.js/);

  await page.selectOption('#ph-speed', '0');
  await page.selectOption('#ph-stack', '5000');
  await page.selectOption('#ph-hands', '100');
  await page.click('#ph-start');

  await page.waitForFunction(() => {
    const state = window.__HOLDEM__();
    return Boolean(state.result) && !state.running;
  }, null, { timeout: 90000 });

  const state = await page.evaluate(() => window.__HOLDEM__());
  assert.match(state.result, /(?:wins the tournament|share first place) after \d+ hands/);
  assert.ok(state.hand > 0);
  assert.equal(state.humanToAct, false);
  assert.deepEqual(state.seats.map(seat => seat.id), [
    'custom', 'sample-caller', 'sample-tight', 'sample-equity'
  ]);
  assert.equal(state.errors.s1, 0, 'The uploaded bot must run without fallback errors');
  assert.equal(await page.locator('#ph-result').isVisible(), true);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
});
