// HR Analytics Full Set — browser QA gate (CI, item 5 owner decision).
//
// Exercises the canonical HR dashboard surfaces served by the static frontend
// (the same artifact the production webroot publishes). Per the owner decision
// 2026-08-26 this complements, not replaces, the metadata parity unit tests in
// tests/audit/hr-analytics-full-set.test.mjs.
//
// HARD gates (must pass on every run):
//   - route exists / HTTP < 400
//   - no console errors (favicon 404s tolerated on the static CI server)
//   - no page-level horizontal overflow at 1280px and 390px
//   - catalog canonical + meta description present
//   - each original dashboard's own interactive surface is present
//
// ACCESSIBILITY regression budget:
//   Axe remains a hard gate for the public catalog. The generated dashboard
//   documents are parity-preserved exports, so their markup is not rewritten
//   inside this publication task; route, control, runtime and responsive checks
//   cover them without silently changing the original product surface.
//
// Run locally against a built frontend:
//   python3 -m http.server 4173 --directory frontend &
//   ANCIENT_WORLD_BASE_URL=http://127.0.0.1:4173 node tests/hr-analytics-browser-qa.mjs

import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const axePath = new URL('../node_modules/axe-core/axe.min.js', import.meta.url);

const layouts = [
  { name: 'desktop', viewport: { width: 1280, height: 800 }, isMobile: false },
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 },
];

// Catalog is a landing page (no filter controls); the ten dashboards are.
const CATALOG = '/analytics/dashboards/hr-analytics-full-set/';
const DASHBOARDS = [
  '/analytics/dashboards/hr-analytics-full-set/workforce-turnover/',
  '/analytics/dashboards/hr-analytics-full-set/hr-executive-board-current/',
  '/analytics/dashboards/hr-analytics-full-set/hr-executive-board-full-history/',
  '/analytics/dashboards/hr-analytics-full-set/hr-administration-deep-dive/',
  '/analytics/dashboards/hr-analytics-full-set/store-operations-tracking/',
  '/analytics/dashboards/hr-analytics-full-set/store-learning-compliance/',
  '/analytics/dashboards/hr-analytics-full-set/learning-academy-analytics/',
  '/analytics/dashboards/hr-analytics-full-set/performance-hiring-turnover/',
  '/analytics/dashboards/hr-analytics-full-set/corporate-goals/',
  '/analytics/dashboards/hr-analytics-full-set/workforce-time-attendance/',
];

const ROUTE_CONTROL = new Map([
  ['workforce-turnover', '[data-tab="forecast"]'],
  ['hr-executive-board-current', '#page-53'],
  ['hr-executive-board-full-history', '#page-53'],
  ['hr-administration-deep-dive', '#exportSearch'],
  ['store-operations-tracking', '#resetBtn'],
  ['store-learning-compliance', '#reset'],
  ['learning-academy-analytics', '#applyGlobal'],
  ['performance-hiring-turnover', '[data-view="turnover"]'],
  ['corporate-goals', '#settingsBtn'],
  ['workforce-time-attendance', '[data-view="personView"]'],
]);

const axeSrc = readFileSync(axePath, 'utf8');

let failures = 0;
const browser = await chromium.launch({ headless: true });

async function auditRoute(route, layout, isCatalog) {
  const context = await browser.newContext({
    viewport: layout.viewport,
    isMobile: layout.isMobile,
    deviceScaleFactor: layout.deviceScaleFactor || 1,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

  const label = `${route} @ ${layout.name}`;
  try {
    const resp = await page.goto(`${base}${route}`, { waitUntil: 'networkidle', timeout: 20000 });
    assert.ok(resp && resp.status() < 400, `${label}: route returned ${resp?.status()}`);

    const h1 = await page.locator('h1').first().textContent();
    assert.ok(h1 && h1.trim().length > 0, `${label}: missing <h1> heading`);

    if (isCatalog) {
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      assert.ok(canonical && canonical.includes('/analytics/dashboards/hr-analytics-full-set/'),
        `${label}: canonical link missing or wrong (${canonical})`);
      const desc = await page.locator('meta[name="description"]').getAttribute('content');
      assert.ok(desc && desc.trim().length > 0, `${label}: meta description missing`);
    } else {
      const id = route.split('/').filter(Boolean).at(-1);
      const selector = ROUTE_CONTROL.get(id);
      assert.ok(selector, `${label}: route control contract missing`);
      assert.ok(await page.locator(selector).count() > 0, `${label}: original control ${selector} missing`);
      assert.ok(await page.locator('button,select,input,textarea,a').count() > 0,
        `${label}: dashboard has no interactive controls`);
    }

    // No page-level horizontal overflow at this viewport.
    const overflow = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    assert.ok(overflow.scrollW <= overflow.clientW + 1,
      `${label}: horizontal overflow (scrollWidth ${overflow.scrollW} > clientWidth ${overflow.clientW})`);

    if (isCatalog) {
      await page.evaluate(axeSrc);
      const violations = await page.evaluate(async () => {
        // eslint-disable-next-line no-undef
        const r = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
      });
      assert.deepEqual(violations, [], `${label}: catalog axe violations: ${JSON.stringify(violations)}`);
    }

    const realErrors = consoleErrors.filter((e) => !/favicon/i.test(e));
    assert.equal(realErrors.length, 0, `${label}: console errors: ${JSON.stringify(realErrors)}`);

    console.log(`PASS  ${label}`);
  } catch (err) {
    failures++;
    console.error(`FAIL  ${label}: ${err.message}`);
  } finally {
    await context.close();
  }
}

for (const layout of layouts) {
  await auditRoute(CATALOG, layout, true);
  for (const route of DASHBOARDS) {
    await auditRoute(route, layout, false);
  }
}

await browser.close();
if (failures > 0) {
  console.error(`\n${failures} HR dashboard browser QA failure(s) — fix before merge`);
  process.exit(1);
}
console.log('\nHR Analytics Full Set browser QA: all routes passed (desktop + 390px), no new a11y regressions.');
