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
//   - canonical + meta description present
//   - basic interactive surface present (shared filters OR turnover view selector)
//
// ACCESSIBILITY regression budget:
//   The HR dashboards carry PRE-EXISTING axe serious/critical debt (tracked
//   separately for a dedicated fix PR). This gate must NOT hard-fail on that
//   known debt — doing so would break every merge and violate the owner's
//   "don't break the product with an arbitrary threshold" instruction.
//   Instead we pin the known-debt violation ids and FAIL ONLY on a NEW violation
//   type (regression) or on a worsening count of a known one. Any new axe
//   serious/critical id beyond BASELINE_AXE_DEBT is a blocker.
//
// Run locally against a built frontend:
//   python3 -m http.server 4173 --directory frontend &
//   ANCIENT_WORLD_BASE_URL=http://127.0.0.1:4173 node tests/hr-analytics-browser-qa.mjs

import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const axePath = new URL('../node_modules/axe-core/axe.min.js', import.meta.url);

// Pre-existing axe serious/critical debt captured at baseline 2026-08-26.
// Any violation id NOT in this set is treated as a regression and fails the run.
// All pre-existing debt was eliminated in PR #62 (2026-08-27). The set is
// kept empty on purpose: ANY axe serious/critical violation now fails QA.
const BASELINE_AXE_DEBT = new Set([]);

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

    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    assert.ok(canonical && canonical.includes('/analytics/dashboards/hr-analytics-full-set/'),
      `${label}: canonical link missing or wrong (${canonical})`);
    const desc = await page.locator('meta[name="description"]').getAttribute('content');
    assert.ok(desc && desc.trim().length > 0, `${label}: meta description missing`);

    // Interactive surface: shared dashboards expose filters; standalone
    // turnover dashboard exposes its own view selector; catalog needs neither.
    if (!isCatalog) {
      if (route.endsWith('workforce-turnover/')) {
        const viewSel = await page.locator('#view-select, [data-view], .tab, button[data-view]').count();
        assert.ok(viewSel > 0, `${label}: turnover dashboard has no view selector`);
      } else {
        const filterCount = await page.locator('#filter-period, #filter-region, #filter-store, #filter-department, #search').count();
        assert.ok(filterCount > 0, `${label}: no filter/tab controls found`);
        const period = page.locator('#filter-period');
        if (await period.count() > 0) {
          await period.selectOption({ index: 0 }).catch(() => {});
        }
      }
    }

    // No page-level horizontal overflow at this viewport.
    const overflow = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    assert.ok(overflow.scrollW <= overflow.clientW + 1,
      `${label}: horizontal overflow (scrollWidth ${overflow.scrollW} > clientWidth ${overflow.clientW})`);

    // Accessibility regression budget (not a hard axe pass — see header).
    await page.evaluate(axeSrc);
    const violations = await page.evaluate(async () => {
      // eslint-disable-next-line no-undef
      const r = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
    });
    const newViolations = violations.filter((v) => !BASELINE_AXE_DEBT.has(v.id));
    if (newViolations.length > 0) {
      assert.fail(`${label}: NEW axe serious/critical violation(s) beyond known debt: ${JSON.stringify(newViolations)}`);
    }
    // Report known debt for visibility (does not fail the run).
    const debt = violations.filter((v) => BASELINE_AXE_DEBT.has(v.id));
    if (debt.length > 0) {
      console.log(`  [a11y-debt] ${label}: ${JSON.stringify(debt)}`);
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
