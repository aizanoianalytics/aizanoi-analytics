import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const repoRoot = join(import.meta.dirname, '..', '..');

const PROD_TREX = 'https://aizanoianalytics.com/analytics/tableau/igahranalytics_date_picker/igahranalytics_date_picker.trex';
const PROD_URL = 'https://aizanoianalytics.com/analytics/tableau/igahranalytics_date_picker/';

/**
 * Mock Tableau transport. The real vendored SDK is neutralized at the network
 * layer (page.route fulfills a comment-only body), so the stub below is the
 * only window.tableau the app can ever see; the suite then measures the real
 * app.js state machine, never the vendor bundle.
 *
 * Dashboard: three mapped worksheets with distinct date captions plus one
 * excluded worksheet. Every sheet also carries an unrelated 'Organization'
 * filter that must survive Apply/Reset untouched.
 */
const TABLEAU_MOCK = (settingsJson, failures = []) => `
  window.__calls = [];
  window.__failIds = ${JSON.stringify(failures)};
  Object.defineProperty(window, 'tableau', {
    configurable: true,
    get() { return window.__mock; },
    set(v) { window.__mock = v; },
  });
  const sheets = [
    { id: 'ws-headcount', name: 'Headcount', caption: 'processing_time', dataType: 'date-time' },
    { id: 'ws-turnover', name: 'Turnover', caption: 'duzeltilmis_max_date', dataType: 'date' },
    { id: 'ws-exits', name: 'Exits', caption: 'exit_date', dataType: 'date' },
    { id: 'ws-plan', name: 'Plan vs Actual', caption: 'plan_date', dataType: 'date' },
  ].map((meta) => {
    const state = { min: null, max: null, cleared: 0 };
    const filterFor = (fieldName, dataType) => ({
      fieldName,
      async getFieldAsync() { return { name: fieldName, dataType }; },
    });
    return {
      ...meta,
      state,
      async getFiltersAsync() {
        const out = [filterFor('Organization', 'STRING')];
        if (state.min) {
          out.push({ fieldName: meta.caption, minValue: state.min, maxValue: state.max, async getFieldAsync() { return { name: meta.caption, dataType: meta.dataType }; } });
        } else {
          out.push(filterFor(meta.caption, meta.dataType));
        }
        return out;
      },
      async applyRangeFilterAsync(caption, range) {
        window.__calls.push({ kind: 'apply', id: meta.id, caption, min: range.min.toISOString(), max: range.max.toISOString(), nullOption: String(range.nullOption) });
        await new Promise((resolve) => { setTimeout(resolve, 8); });
        if (window.__failIds.includes(meta.id)) throw new Error('synthetic apply failure');
        state.min = range.min; state.max = range.max;
      },
      async clearFilterAsync(caption) {
        window.__calls.push({ kind: 'clear', id: meta.id, caption });
        state.min = null; state.max = null; state.cleared += 1;
      },
    };
  });
  window.__sheets = sheets;
  window.__settingsStore = { settings: ${JSON.stringify(settingsJson)} };
  window.__mock = {
    FilterNullOption: { AllValues: 'all-values', NonNullValues: 'non-null-values' },
    extensions: {
      // Faithful to the real SDK: dashboardContent is a getter backed by the
      // init handshake (initializeDashboardContent) and stays undefined until
      // initializeAsync/initializeDialogAsync resolves. A stub that
      // pre-populates it hides dialog boot bugs (issue: dialog silently ran
      // the standalone mock inside real Tableau, so Save never wrote).
      dashboardContent: undefined,
      settings: {
        get(key) { return key === 'igahranalytics_date_picker' ? window.__settingsStore.settings : undefined; },
        set(key, value) { window.__calls.push({ kind: 'settings-set', key }); window.__settingsStore.settings = value; },
        async saveAsync() { window.__calls.push({ kind: 'settings-save' }); },
      },
      ui: {
        async displayDialogAsync(url, payload) {
          window.__calls.push({ kind: 'dialog', url });
          return payload || '';
        },
        async closeDialog(payload) {
          window.__calls.push({ kind: 'dialog-close', payload });
          return payload || '';
        },
      },
      initializeAsync() {
        window.__calls.push({ kind: 'initializeAsync' });
        window.__mock.extensions.dashboardContent = { dashboard: { worksheets: sheets } };
        return Promise.resolve();
      },
      initializeDialogAsync() {
        window.__calls.push({ kind: 'initializeDialog' });
        window.__mock.extensions.dashboardContent = { dashboard: { worksheets: sheets } };
        return Promise.resolve('');
      },
    },
  };
`;

const NO_TABLEAU = `
  window.__calls = [];
  Object.defineProperty(window, 'tableau', {
    configurable: true,
    get() { return window.__mock; },
    set(v) { window.__mock = v; },
  });
  window.__mock = undefined;
`;

const DEFAULT_TARGETS = [
  { worksheetId: 'ws-headcount', worksheetName: 'Headcount', fieldCaption: 'processing_time', fieldType: 'DATETIME', enabled: true, resetEnabled: true },
  { worksheetId: 'ws-turnover', worksheetName: 'Turnover', fieldCaption: 'duzeltilmis_max_date', fieldType: 'DATE', enabled: true, resetEnabled: true },
  { worksheetId: 'ws-exits', worksheetName: 'Exits', fieldCaption: 'exit_date', fieldType: 'DATE', enabled: true, resetEnabled: false },
];
const DEFAULT_SETTINGS = JSON.stringify({ version: 1, locale: 'tr-TR', targets: DEFAULT_TARGETS });

async function withServer(t, initScript, pagePath, opts = {}) {
  const http = await import('node:http');
  const { readFile } = await import('node:fs/promises');
  const { chromium } = await import('playwright');
  const types = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.png': 'image/png', '.trex': 'application/xml', '.svg': 'image/svg+xml',
  };
  const root = join(repoRoot, 'frontend');
  const server = http.createServer(async (req, res) => {
    const p = req.url.split('?')[0];
    const file = join(root, p === '/' ? 'analytics/tableau/index.html' : p);
    try {
      const body = await readFile(file);
      const ext = p.slice(p.lastIndexOf('.'));
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
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
  const context = await browser.newContext({ viewport: opts.viewport || { width: 880, height: 700 } });
  const page = await context.newPage();
  const failures = [];
  page.on('requestfailed', (req) => failures.push(req.url()));
  await page.addInitScript(initScript);
  // Neutralize the real vendored SDK at the transport layer so it can never
  // install its own window.tableau over the mock above — unless the caller
  // explicitly wants the real SDK (stubSdk: false) to prove the host-less
  // fallback path.
  if (opts.stubSdk !== false) {
    await page.route('**/vendor/tableau.extensions-1.10.0.min.js', (route) => route.fulfill({
      status: 200, contentType: 'text/javascript', body: '/* stubbed SDK: mock owns window.tableau */',
    }));
  }
  await page.goto(`http://127.0.0.1:${port}${pagePath}`, { waitUntil: 'load' }).catch(() => {});
  return { page, failures };
}

const appPath = '/analytics/tableau/igahranalytics_date_picker/index.html';
const configPath = '/analytics/tableau/igahranalytics_date_picker/config.html';

async function applyRange(page, start, end) {
  await page.fill('#start-input', start);
  await page.fill('#end-input', end);
  await page.click('#apply-btn');
}

test('apply updates three mapped captions, leaves the excluded sheet and unrelated filters alone', async (t) => {
  const { page, failures } = await withServer(t, TABLEAU_MOCK(DEFAULT_SETTINGS), appPath);
  await page.waitForSelector('#status-badge[data-state="applied"]', { timeout: 15000 }).catch(() => {});
  await applyRange(page, '2025-01-01', '2025-03-31');
  await page.waitForSelector('#status-badge[data-state="applied"]', { timeout: 15000 });
  const calls = await page.evaluate(() => window.__calls.filter((c) => c.kind === 'apply'));
  assert.deepEqual(calls.map((c) => [c.id, c.caption]), [
    ['ws-headcount', 'processing_time'],
    ['ws-turnover', 'duzeltilmis_max_date'],
    ['ws-exits', 'exit_date'],
  ]);
  assert.ok(!calls.some((c) => c.id === 'ws-plan'), 'excluded worksheet must never be touched');
  assert.ok(calls.every((c) => c.caption !== 'Organization'), 'unrelated filters must be preserved');
  assert.ok(calls.every((c) => /non-null/i.test(c.nullOption)), 'range filters exclude nulls explicitly');
  const badge = await page.textContent('#status-badge');
  assert.match(badge, /Uygulandı|Applied/);
  assert.deepEqual(failures, [], 'extension must issue no network requests');
});

test('partial failure reports honestly and retry touches only the failed target', async (t) => {
  const { page } = await withServer(t, TABLEAU_MOCK(DEFAULT_SETTINGS, ['ws-exits']), appPath);
  await applyRange(page, '2025-01-01', '2025-03-31');
  await page.waitForSelector('#status-badge[data-state="partial"]', { timeout: 15000 });
  const before = await page.evaluate(() => window.__calls.filter((c) => c.kind === 'apply').length);
  assert.equal(before, 3);
  await page.evaluate(() => { window.__failIds = []; });
  await page.click('#retry-btn');
  await page.waitForSelector('#status-badge[data-state="applied"]', { timeout: 15000 });
  const retries = await page.evaluate(() => window.__calls.filter((c) => c.kind === 'apply'));
  assert.deepEqual(retries.slice(3).map((c) => c.id), ['ws-exits'], 'retry must not re-apply successful targets');
});

test('rapid re-apply is serialized and the latest range wins', async (t) => {
  const { page } = await withServer(t, TABLEAU_MOCK(DEFAULT_SETTINGS), appPath);
  await page.fill('#start-input', '2025-01-01');
  await page.fill('#end-input', '2025-03-31');
  await page.click('#apply-btn');
  await page.fill('#end-input', '2025-06-30');
  await page.click('#apply-btn');
  await page.waitForFunction(
    () => window.__calls.filter((c) => c.kind === 'apply' && c.id === 'ws-headcount').length >= 2,
    { timeout: 15000 },
  );
  await page.waitForSelector('#status-badge[data-state="applied"]', { timeout: 15000 });
  const last = await page.evaluate(() => {
    const calls = window.__calls.filter((c) => c.kind === 'apply' && c.id === 'ws-headcount');
    return calls[calls.length - 1];
  });
  assert.ok(last.max.startsWith('2025-06-30'), `latest range must win, got ${last.max}`);
});

test('reset clears only reset-enabled mappings', async (t) => {
  const { page } = await withServer(t, TABLEAU_MOCK(DEFAULT_SETTINGS), appPath);
  await applyRange(page, '2025-01-01', '2025-03-31');
  await page.waitForSelector('#status-badge[data-state="applied"]', { timeout: 15000 });
  await page.click('#reset-btn');
  await page.waitForFunction(
    () => window.__calls.some((c) => c.kind === 'clear'),
    { timeout: 15000 },
  );
  const clears = await page.evaluate(() => window.__calls.filter((c) => c.kind === 'clear'));
  assert.deepEqual(clears.map((c) => [c.id, c.caption]), [
    ['ws-headcount', 'processing_time'],
    ['ws-turnover', 'duzeltilmis_max_date'],
  ]);
});

test('configuration dialog boots Tableau mode on a real-Desktop-shaped host, lists real sheets, saves once', async (t) => {
  const { page } = await withServer(t, TABLEAU_MOCK(DEFAULT_SETTINGS), configPath);
  await page.waitForSelector('#mapping-list .mapping-row', { timeout: 15000 });
  const mode = await page.textContent('#dlg-mode');
  assert.match(mode, /Tableau Desktop/, 'dialog must boot Tableau mode, never the standalone mock');
  assert.ok(await page.locator('#dlg-mocknote').isHidden(), 'mock note must stay hidden inside Tableau');
  const names = await page.locator('#mapping-list .dp-sheet-name').allTextContents();
  assert.ok(names.includes('Headcount'), `dialog must list real sheets, saw: ${names.join('|')}`);
  assert.ok(!names.join(' ').includes('(demo)'), 'dialog must not show synthetic mock sheets inside Tableau');
  const headcountOptions = await page.locator('[data-sheet="ws-headcount"] select option').allTextContents();
  assert.ok(
    headcountOptions.some((text) => text.includes('processing_time (DATETIME)')),
    `official Tableau date-time enum must appear as DATETIME; saw ${headcountOptions.join('|')}`,
  );
  const rows = await page.locator('#mapping-list .mapping-row').count();
  assert.ok(rows >= 4, `dialog must list every dashboard worksheet, saw ${rows}`);
  await page.click('#save-btn');
  await page.waitForFunction(
    () => window.__calls.some((c) => c.kind === 'settings-save'),
    { timeout: 15000 },
  );
  const sets = await page.evaluate(() => window.__calls.filter((c) => c.kind === 'settings-set'));
  assert.equal(sets.length, 1, 'settings must be written exactly once per save');
  const closes = await page.evaluate(() => window.__calls.filter((c) => c.kind === 'dialog-close'));
  assert.equal(closes.length, 1, 'dialog must close itself after saving');
});

test('dialog with the real SDK but no Tableau host falls back to the mock instead of hanging', async (t) => {
  const { page } = await withServer(t, 'window.__calls = [];', configPath, { stubSdk: false });
  await page.waitForSelector('#mapping-list .mapping-row', { timeout: 15000 });
  const note = await page.textContent('#dlg-mocknote');
  assert.match(note, /Standalone mock|Standalone deneme/);
  const names = await page.locator('#mapping-list .dp-sheet-name').allTextContents();
  assert.ok(names.join(' ').includes('(demo)'), 'host-less dialog shows synthetic sheets only');
});

test('main gear opens a read-only summary, never a settings write', async (t) => {
  const { page } = await withServer(t, TABLEAU_MOCK(DEFAULT_SETTINGS), appPath);
  await page.waitForSelector('#gear-btn', { timeout: 15000 });
  await page.click('#gear-btn');
  await page.waitForSelector('#config-popover:not([hidden])', { timeout: 15000 });
  const summary = await page.textContent('#config-summary');
  assert.match(summary, /processing_time/);
  const writes = await page.evaluate(() => window.__calls.filter((c) => c.kind === 'settings-set'));
  assert.deepEqual(writes, [], 'opening the summary must not write settings');
});

test('calendar popover opens, navigates months and closes with Escape', async (t) => {
  const { page } = await withServer(t, TABLEAU_MOCK(DEFAULT_SETTINGS), appPath);
  await page.waitForSelector('#calendar-btn', { timeout: 15000 });
  await page.click('#calendar-btn');
  await page.waitForSelector('#calendar-popover:not([hidden])', { timeout: 15000 });
  const titleBefore = await page.textContent('#cal-title');
  await page.click('#cal-next');
  const titleAfter = await page.textContent('#cal-title');
  assert.notEqual(titleBefore, titleAfter, 'month navigation must change the visible month');
  await page.keyboard.press('Escape');
  assert.ok(await page.locator('#calendar-popover').isHidden(), 'Escape must close the calendar');
});

test('standalone browser load is an honest labeled mock, never connected', async (t) => {
  const { page } = await withServer(t, NO_TABLEAU, `${appPath}?mock=1`);
  await page.waitForSelector('#mock-banner', { timeout: 15000 });
  const banner = await page.textContent('#mock-banner');
  assert.match(banner, /Standalone mock/);
  assert.match(banner, /synthetic/i);
  const badge = await page.textContent('#status-badge');
  assert.doesNotMatch(badge, /Tableau connected/);
  const calls = await page.evaluate(() => window.__calls || []);
  assert.deepEqual(calls, [], 'mock mode must attempt no Tableau calls');
});

test('layout holds at 280px and 900px without horizontal overflow', async (t) => {
  for (const width of [280, 900]) {
    const { page } = await withServer(
      t, NO_TABLEAU, `${appPath}?mock=1`, { viewport: { width, height: 700 } },
    );
    await page.waitForSelector('#mock-banner', { timeout: 15000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `${width}px: no horizontal overflow (got ${overflow}px)`);
    assert.ok(await page.locator('#apply-btn').isVisible(), `${width}px: Apply stays visible`);
  }
});

test('no serious or critical accessibility violations on the main surface', async (t) => {
  const { page } = await withServer(t, NO_TABLEAU, `${appPath}?mock=1`);
  await page.waitForSelector('#mock-banner', { timeout: 15000 });
  const { readFileSync } = await import('node:fs');
  const axeSource = readFileSync(join(repoRoot, 'node_modules/axe-core/axe.min.js'), 'utf8');
  await page.evaluate(axeSource);
  const results = await page.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] }));
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  assert.deepEqual(blocking.map((v) => v.id), [], `blocking a11y violations: ${blocking.map((v) => v.id).join(', ')}`);
});

test('catalog page surfaces the date-picker card with a direct TREX download', async (t) => {
  const { page } = await withServer(t, NO_TABLEAU, '/analytics/tableau/index.html');
  await page.waitForSelector('text=IGA HR Analytics — Date Picker', { timeout: 15000 });
  const href = await page.getAttribute('a[href$="igahranalytics_date_picker.trex"]', 'href');
  assert.equal(href, PROD_TREX);
  const appHref = await page.getAttribute('a[href$="igahranalytics_date_picker/"]', 'href');
  assert.equal(appHref, PROD_URL);
});
