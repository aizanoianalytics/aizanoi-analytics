import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const repoRoot = join(import.meta.dirname, '..', '..');

/**
 * Mock-based connectivity test. Serves the real app over HTTP and injects a
 * fake Tableau Extensions API. This proves the web-side state machine
 * (connected / error / demo) — it does NOT replace validation on the actual
 * corporate Tableau Desktop 2023.1.22.
 *
 * The real vendored SDK installs its own window.tableau (its own version of the
 * API), so the mock replaces the served SDK body with a stub. What is exercised
 * then is the pilot's own app.js state machine against a realistic API surface;
 * a separate one-off probe with the real SDK verified the vendored file loads
 * and defines tableau.extensions.initializeAsync in a real browser.
 */

const MOCK_ACCESSOR = `
  window.__calls = [];
  Object.defineProperty(window, 'tableau', {
    configurable: true,
    get() { return window.__mock; },
    set(v) { window.__mock = v; },
  });
  window.__mock = {
    extensions: {
      initializeAsync() {
        window.__calls.push('initializeAsync');
        if (window.__failNext) return Promise.reject(new Error('mock handshake failure'));
        return Promise.resolve();
      },
    },
  };
`;

const FAIL_ACCESSOR = `
  window.__calls = [];
  Object.defineProperty(window, 'tableau', {
    configurable: true,
    get() { return this.__mock; },
    set(v) { this.__mock = v; },
  });
  window.__mock = {
    extensions: {
      initializeAsync() {
        window.__calls.push('initializeAsync');
        return Promise.reject(new Error('mock handshake failure'));
      },
    },
  };
`;

const STRIPPED_SDK = `
  window.__calls = [];
  window.__mock = undefined;
  Object.defineProperty(window, 'tableau', {
    configurable: true,
    get() { return window.__mock; },
    set(v) { window.__mock = v; },
  });
`;

async function withServer(t, script, opts = {}) {
  const http = await import('node:http');
  const { readFile } = await import('node:fs/promises');
  const { chromium } = await import('playwright');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
  const helloDir = join(repoRoot, 'frontend/analytics/tableau/hello');

  const server = http.createServer(async (req, res) => {
    const p = req.url.split('?')[0];
    const file = join(helloDir, p === '/' ? 'index.html' : p);
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[p.slice(p.lastIndexOf('.'))] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', () => resolve()); });
  t.after(() => new Promise((resolve) => { server.close(() => resolve()); }));
  const port = server.address().port;

  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  const failures = [];
  page.on('requestfailed', (req) => failures.push(req.url()));
  await page.addInitScript(script);
  if (opts.stripSdk) {
    await page.route('**/vendor/tableau.extensions-1.10.0.min.js', (route) => route.fulfill({
      status: 200, contentType: 'text/javascript', body: '/* stubbed SDK */',
    }));
  }
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' }).catch(() => {});
  return { page, failures };
}

test('connected state renders after a successful initializeAsync', async (t) => {
  const { page } = await withServer(t, MOCK_ACCESSOR, { stripSdk: true });
  await page.waitForSelector('#state-badge[data-state="connected"]');
  assert.equal(await page.textContent('#state-badge'), 'Tableau connected');
  assert.equal(await page.textContent('#fact-mode'), 'Tableau Desktop');
  const calls = await page.evaluate(() => window.__calls);
  assert.deepEqual(calls, ['initializeAsync']);
  // On success the actions row (retry + docs link) stays hidden; only the
  // privacy link lives outside it, so assert the retry button specifically.
  assert.ok(await page.locator('#retry-button').isHidden());
});

test('failed handshake shows an actionable error with retry', async (t) => {
  const { page } = await withServer(t, FAIL_ACCESSOR, { stripSdk: true });
  await page.waitForSelector('#state-badge[data-state="error"]');
  const message = await page.textContent('#state-message');
  assert.match(message, /mock handshake failure/);
  assert.match(message, /https:\/\/aizanoianalytics\.com\/analytics\/tableau\/hello\//);
  assert.ok(await page.locator('#actions').isVisible());
});

test('browser load shows Demo without calling Tableau', async (t) => {
  const { page } = await withServer(t, STRIPPED_SDK, { stripSdk: true });
  await page.waitForSelector('#state-badge[data-state="demo"]');
  assert.equal(await page.textContent('#state-badge'), 'Demo / Tableau not detected');
  const calls = await page.evaluate(() => window.__calls || []);
  assert.deepEqual(calls, [], 'Demo must not attempt any Tableau call');
  assert.ok(await page.locator('#actions').isVisible(), 'demo offers a retry path');
});
