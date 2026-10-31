import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
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
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

async function staticServer() {
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
      if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
      const body = await readFile(filename);
      response.writeHead(200, {
        'Content-Type': contentTypes[path.extname(filename)] || 'application/octet-stream',
        'Content-Security-Policy': "script-src 'self'; worker-src 'self' blob:; object-src 'none'",
        'X-Content-Type-Options': 'nosniff'
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
    close: () => new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    })
  };
}

test('Anatolian Pact: uploaded legal bot completes an Instant game against samples', {
  timeout: 120000
}, async () => {
  const server = await staticServer();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const pageErrors = [];
    const workerErrors = [];
    const customCalls = [];

    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('worker', worker => {
      if (!worker.url().startsWith('blob:')) return;

      // Observe actual replies from the Blob worker, rather than merely
      // accepting a completed game that might have used safe fallbacks.
      worker.on('close', () => {});
    });

    // Register observation before any game worker is created. This wraps only
    // the browser test's Worker constructor; the production builder is unchanged.
    await page.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.__PACT_CUSTOM_REPLIES__ = [];
      window.__PACT_CUSTOM_ERRORS__ = [];
      window.Worker = class extends NativeWorker {
        constructor(url, options) {
          super(url, options);
          if (!String(url).startsWith('blob:')) return;
          this.addEventListener('message', event => {
            const message = event.data;
            if (message && (message.type === 'ready' ||
                message.type === 'fail' || message.type === 'answer')) {
              window.__PACT_CUSTOM_REPLIES__.push({
                type: message.type,
                call: message.call,
                payload: message.payload,
                detail: message.detail
              });
            }
          });
          this.addEventListener('error', event => {
            window.__PACT_CUSTOM_ERRORS__.push(event.message || 'worker error');
          });
        }
      };
    });

    await page.goto(`${server.origin}/arcade/anatolian-pact/?years=6&speed=0`);
    await page.waitForFunction(() => {
      const start = document.getElementById('ap-start');
      return start && !start.disabled &&
        document.querySelectorAll('#ap-seats select').length === 6;
    });
    await assertFullRoster(page, 'anatolian-pact');

    const controllers = page.locator('#ap-seats select');
    const samples = ['sample-schemer', 'sample-expander', 'sample-turtle'];
    for (let index = 1; index < 6; index++) {
      await controllers.nth(index).selectOption(samples[(index - 1) % samples.length]);
    }

    const customPower = await page.evaluate(() => window.__ANATOLIAN_PACT__().powers[0].power);

    // Intercept the chooser before opening it; an unhandled native chooser can cancel the pending upload before setInputFiles.
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      controllers.first().selectOption('custom')
    ]);
    await page.waitForSelector('#arena-custom-file', { state: 'attached' });
    assert.equal(await page.locator('#arena-custom-file').getAttribute('type'), 'file');
    assert.equal(await page.locator('#arena-custom-file').evaluate(input => input.hidden), true);

    // Empty orders legally leave every unit holding; empty builds waive builds.
    // Retreats explicitly disband and answers explicitly reject incoming deals.
    const code = `
      module.exports = {
        propose() { return []; },
        answer(state) {
          return Object.fromEntries(state.inbox.map(proposal => [proposal.id, 'reject']));
        },
        orders() { return []; },
        retreats(state) {
          return Object.fromEntries(state.retreats.map(unit => [unit.at, null]));
        },
        builds() { return []; }
      };
    `;
    await chooser.setFiles({
      name: 'pact-hold.js',
      mimeType: 'text/javascript',
      buffer: Buffer.from(code)
    });

    await page.waitForFunction(() => {
      const select = document.querySelector('#ap-seats select');
      return select.value === 'custom' &&
        select.selectedOptions[0].textContent === 'Your bot: pact-hold.js' &&
        !document.getElementById('ap-start').disabled;
    });
    assert.deepEqual(
      await controllers.evaluateAll(inputs => inputs.map(input =>
        [...input.options].find(option => option.value === 'custom').textContent)),
      Array(6).fill('Your bot: pact-hold.js')
    );

    await page.selectOption('#ap-years', '6');
    await page.selectOption('#ap-speed', '0');
    await page.click('#ap-start');

    await page.waitForFunction(() => {
      const state = window.__ANATOLIAN_PACT__();
      return state.result !== null && !state.running &&
        !document.getElementById('ap-result').hidden;
    }, null, { timeout: 90000 });

    const result = await page.evaluate(() => ({
      state: window.__ANATOLIAN_PACT__(),
      text: document.getElementById('ap-result').textContent,
      standings: document.getElementById('ap-standings').textContent,
      log: document.getElementById('ap-log').textContent,
      replies: window.__PACT_CUSTOM_REPLIES__,
      errors: window.__PACT_CUSTOM_ERRORS__
    }));
    workerErrors.push(...result.errors);
    customCalls.push(...result.replies.filter(reply => reply.type === 'answer'));

    assert.ok(result.state.result);
    assert.equal(result.state.running, false);
    assert.match(result.text, /(?:wins with|Shared victory:)/);
    assert.equal(result.state.powers[0].id, 'custom');
    assert.equal(result.state.powers[0].kind, 'bot');
    assert.ok(result.state.powers.slice(1).every(power => samples.includes(power.id)));
    assert.match(result.standings, /pact-hold\.js · You/);
    assert.ok(result.replies.some(reply => reply.type === 'ready'));
    assert.ok(!result.replies.some(reply => reply.type === 'fail'));
    assert.ok(customCalls.some(reply => reply.call === 'orders'));
    assert.ok(customCalls.filter(reply => reply.call === 'orders')
      .every(reply => Array.isArray(reply.payload) && reply.payload.length === 0));
    assert.ok(!result.log.includes(`${customPower}: safe `),
      'The uploaded bot must play successfully, not complete through safe fallbacks');
    assert.deepEqual(workerErrors, []);
    assert.deepEqual(pageErrors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});
