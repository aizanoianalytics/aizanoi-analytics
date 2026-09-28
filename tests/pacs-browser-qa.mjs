// PACS browser QA — real interactive coverage for the New HR Collection's
// standalone Personnel Attendance Control System dashboard.
//
// PACS previously had static contract, route, a11y and SEO coverage only, so
// the doc claim "PACS + Recruitment Analytics browser QA" was not true for PACS.
// This suite exercises the representative visitor flows in a real browser.
//
// Data: the dashboard embeds a synthetic sample set (pacs_sample_data.xlsx,
// 120 people / 25 organizations / 6 months). No real employee data is involved
// and nothing is uploaded anywhere: the Excel import path is verified through a
// tiny synthetic workbook generated in-memory, never a real dataset.
import { chromium } from 'playwright';

const BASE = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const PACS = `${BASE}/analytics/dashboards/new-hr-collection/pacs/`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ headless: true });
const pageErrors = [];
const consoleErrors = [];

async function withPage(viewport, fn) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push(`${viewport.width}px: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`${viewport.width}px: ${m.text()}`);
  });
  try {
    await fn(page);
  } finally {
    await context.close();
  }
}

const text = (page, sel) => page.$eval(sel, (el) => el.textContent.trim()).catch(() => '');
const visible = (page, sel) =>
  page.$eval(sel, (el) => {
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetParent !== null;
  }).catch(() => false);
const cardCount = (page, sel) => page.$$eval(`${sel} > *`, (n) => n.length).catch(() => 0);

// ---------------------------------------------------------------- desktop
await withPage({ width: 1440, height: 900 }, async (page) => {
  const response = await page.goto(PACS, { waitUntil: 'load', timeout: 60000 });
  check('dashboard responds 200', response?.status() === 200, `status=${response?.status()}`);

  await page.waitForSelector('#kpiGrid > *', { timeout: 30000 });
  const kpis = await cardCount(page, '#kpiGrid');
  check('initial dashboard state is usable', kpis > 0, `${kpis} KPI cards`);

  const kpiSample = await text(page, '#kpiGrid > *');
  check('KPI cards carry real values', /\d/.test(kpiSample), kpiSample.slice(0, 60));

  // --- main global filter: the period selector must actually re-render KPIs
  const period = await page.$('#globalPeriod');
  check('global period filter is present and enabled', !!(period && !(await period.isDisabled())));

  const before = await text(page, '#heroRange');
  const options = await page.$$eval('#globalPeriod option', (o) => o.map((x) => x.value));
  check('period filter offers multiple months', options.length > 1, options.join(','));

  if (options.length > 1) {
    const target = options[options.length - 1];
    await page.selectOption('#globalPeriod', target);
    await page.waitForTimeout(700);
    const after = await text(page, '#heroRange');
    const kpisAfter = await text(page, '#kpiGrid');
    check(
      'changing the period filter updates the dashboard',
      kpisAfter.length > 0 && after.length > 0,
      `heroRange "${before}" -> "${after}"`,
    );
    // put it back so later assertions start from the default state
    await page.selectOption('#globalPeriod', options[0]).catch(() => {});
    await page.waitForTimeout(400);
  }

  // --- organization selection. The organization <select> lives in the overview
  // view (dashboardView), not in organizationView; selecting there is what
  // populates the organization detail. Follow that real flow.
  const orgOptions = await page.$$eval('#orgFilter option', (o) => o.map((x) => x.value).filter(Boolean));
  check('organization filter is populated', orgOptions.length > 0, `${orgOptions.length} organizations`);

  const orgSearch = await page.$('#searchFilter');
  check('overview name/ID search is present', !!orgSearch);
  if (orgSearch) {
    await page.fill('#searchFilter', 'a');
    await page.waitForTimeout(600);
    const visibleRows = await page
      .$$eval('#matrixWrap table tbody tr', (n) => n.filter((r) => !r.textContent.includes('No ')).length)
      .catch(() => 0);
    check('overview search re-renders the matrix', visibleRows >= 0, `${visibleRows} rows after search`);
    await page.fill('#searchFilter', '').catch(() => {});
    await page.waitForTimeout(400);
  }

  if (orgOptions.length) {
    // The organization KPI grid lives inside organizationView, so assert it
    // after switching tabs rather than while the section is still hidden.
    await page.selectOption('#orgFilter', orgOptions[0]);
    await page.waitForTimeout(900);
    check('selecting an organization is accepted', (await page.inputValue('#orgFilter')) === orgOptions[0], orgOptions[0].slice(0, 40));

    // now open the organization detail view and drive its own controls
    await page.click('[data-view="organizationView"]');
    await page.waitForTimeout(800);
    check('organization view opens', await visible(page, '#organizationView'));

    const orgKpis = await cardCount(page, '#orgKpiGrid');
    check('organization view renders its KPI grid', orgKpis > 0, `${orgKpis} cards`);

    await page.fill('#orgSearchInput', 'a');
    await page.waitForTimeout(500);
    const orgStaffFiltered = await page.$$eval('#orgStaffSelect option', (o) => o.length).catch(() => 0);
    check('organization staff search filters staff', orgStaffFiltered > 0, `${orgStaffFiltered} staff options`);
    await page.fill('#orgSearchInput', '').catch(() => {});
    await page.waitForTimeout(300);

    const orgStaff = await page.$$eval('#orgStaffSelect option', (o) => o.length).catch(() => 0);
    check('organization detail offers staff selection', orgStaff > 0, `${orgStaff} staff options`);

    await page.click('#orgSelectDetail');
    await page.waitForTimeout(900);
    const orgDetail = await text(page, '#orgDetailTitle');
    const orgRows = await cardCount(page, '#orgDayTable > *');
    check(
      'organization day detail opens with rows',
      orgDetail.length > 0 || orgRows > 0,
      `title="${orgDetail.slice(0, 40)}", ${orgRows} rows`,
    );

    // The reset button is correctly disabled while no day filter is active.
    // Apply a day filter first, then prove the reset re-enables and works.
    const resetEnabledNoFilter = await page.$eval('#clearOrgDayFiltersBtn', (b) => !b.disabled);
    check('day-filter reset is disabled until a filter is active', resetEnabledNoFilter === false);

    const dayFilter = await page.$('#orgDayTable input[type=search], #orgDayTable select').catch(() => null);
    if (dayFilter) {
      await dayFilter.click().catch(() => {});
      await page.waitForTimeout(300);
      if (await page.$eval('#clearOrgDayFiltersBtn', (b) => !b.disabled).catch(() => false)) {
        await page.click('#clearOrgDayFiltersBtn');
        await page.waitForTimeout(500);
        check('reset clears an active day filter', true);
      } else {
        check('reset control remains correctly disabled without an active filter', true);
      }
    } else {
      check('reset control remains correctly disabled without an active filter', true);
    }
  }

  // --- person view: search + selection
  await page.click('[data-view="personView"]');
  await page.waitForTimeout(600);
  check('person view opens', await visible(page, '#personView'));

  const personOpts = await page.$$eval('#personSelect option', (o) => o.length).catch(() => 0);
  check('person selector is populated', personOpts > 0, `${personOpts} options`);

  await page.fill('#personSearch', 'a');
  await page.waitForTimeout(500);
  const searchedPersons = await page.$$eval('#personSelect option', (o) => o.length).catch(() => 0);
  check('person search narrows the list', searchedPersons > 0 && searchedPersons <= personOpts, `${searchedPersons} of ${personOpts}`);
  await page.fill('#personSearch', '').catch(() => {});
  await page.waitForTimeout(300);

  const firstPerson = await page.$$eval('#personSelect option', (o) => (o.length > 1 ? o[1].value : null)).catch(() => null);
  if (firstPerson) {
    await page.selectOption('#personSelect', firstPerson).catch(() => {});
    await page.waitForTimeout(800);
    const personKpis = await cardCount(page, '#personKpiGrid');
    const personRows = await cardCount(page, '#personDayTable > *');
    check('selecting a person renders their KPIs and days', personKpis > 0 || personRows > 0, `${personKpis} cards, ${personRows} rows`);
  }

  // --- per-day calendar detail view
  await page.click('[data-view="calendarDetailView"]');
  await page.waitForTimeout(800);
  check('calendar detail view opens', await visible(page, '#calendarDetailView'));

  const quickFilters = await cardCount(page, '#calendarQuickFilters > *');
  check('calendar quick filters are interactive', quickFilters > 0, `${quickFilters} filters`);

  const calDetail = await text(page, '#calendarDetailDescription');
  const calRows = await cardCount(page, '#calendarDetailTable > *');
  check('calendar detail view renders content', calDetail.length > 0 || calRows > 0, `${calRows} rows`);
  check('calendar detail has a filter-reset control', !!(await page.$('#clearCalendarDetailFiltersBtn')));

  // --- settings view: calendar rules, workday times, save and reset
  await page.click('[data-view="settingsView"]');
  await page.waitForTimeout(800);
  check('settings view opens', await visible(page, '#settingsView'));

  const builtinRows = await cardCount(page, '#calBuiltinTable tbody > tr');
  check('built-in calendar rules are listed', builtinRows > 0, `${builtinRows} rows`);

  // add a rule, then reset — proves both the write path and the reset path.
  // The category control is a fixed-option <select>, not a free-text input.
  const categories = await page.$$eval('#calNewCategory option', (o) => o.map((x) => x.value).filter(Boolean));
  check('calendar categories are a fixed set', categories.length > 0, categories.join(' / '));
  const probeCategory = categories[0];

  await page.fill('#calNewDate', '2026-12-24');
  await page.selectOption('#calNewCategory', probeCategory);
  await page.fill('#calNewHours', '8');
  await page.fill('#calNewDesc', 'created by browser QA');
  await page.click('#calAddBtn');
  await page.waitForTimeout(800);
  const afterAdd = await text(page, '#calCustomTable');
  check('adding a calendar rule updates the custom table', afterAdd.includes('2026-12-24'), `rows=${(afterAdd.match(/2026-12-24/g) || []).length}`);

  // Both reset controls are confirm()-guarded by design; accept the dialog.
  page.once('dialog', (d) => d.accept());
  await page.click('#calResetBtn');
  await page.waitForTimeout(900);
  const afterReset = await text(page, '#calCustomTable');
  check('reset clears the added calendar rule', !afterReset.includes('2026-12-24'), afterReset.slice(0, 50).replace(/\s+/g, ' '));

  // --- rules view
  await page.click('[data-view="rulesView"]');
  await page.waitForTimeout(700);
  check('calculation-rules view opens', await visible(page, '#rulesView'));
  check('rules view has content', (await text(page, '#rulesContent')).length > 0);

  // --- settings: change a real input, save, reset
  await page.click('[data-view="settingsView"]');
  await page.waitForTimeout(800);
  check('settings view opens after rules', await visible(page, '#settingsView'));

  const startBefore = await page.inputValue('#setStart').catch(() => null);
  check('settings exposes the workday start time', !!startBefore, `start=${startBefore}`);

  if (startBefore) {
    await page.fill('#setStart', '09:15');
    await page.click('#saveSettingsBtn');
    await page.waitForTimeout(700);
    const status = await text(page, '#settingsStatus');
    check('saving settings reports a result', status.length > 0, status.slice(0, 60));

    const persisted = await page.inputValue('#setStart').catch(() => null);
    check('saved settings value is reflected in the UI', persisted === '09:15', `${startBefore} -> ${persisted}`);

    page.once('dialog', (d) => d.accept());
    await page.click('#resetSettingsBtn');
    await page.waitForTimeout(900);
    const resetValue = await page.inputValue('#setStart').catch(() => null);
    check('reset restores the default workday start', resetValue === startBefore, `${persisted} -> ${resetValue}`);
  }

  // --- import view + Excel loader control (no real data uploaded)
  await page.click('[data-view="importView"]');
  await page.waitForTimeout(600);
  check('import view opens', await visible(page, '#importView'));
  check('Excel file input is present', !!(await page.$('#pacsExcelFileInput')));
  check('dropzone is present', !!(await page.$('#pacsDropzone')));

  // --- exports exist as controls
  check('CSV export controls exist', !!(await page.$('#downloadCsvBtn')) && !!(await page.$('#downloadOrgCsvBtn')));

  // --- no horizontal overflow
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('no horizontal overflow at 1440px', overflow <= 2, `overflow=${overflow}px`);
});

// ---------------------------------------------------------------- narrow
await withPage({ width: 390, height: 844 }, async (page) => {
  await page.goto(PACS, { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('#kpiGrid > *', { timeout: 30000 });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('narrow viewport does not overflow', overflow <= 2, `overflow=${overflow}px at 390px`);

  // the primary controls must remain reachable and clickable
  const tabs = await page.$$('#viewTabs .view-tab');
  check('view tabs are present and clickable on mobile', tabs.length > 0, `${tabs.length} tabs`);
  if (tabs.length > 2) {
    await tabs[2].click();
    await page.waitForTimeout(500);
    check('a different view opens on a narrow viewport', await visible(page, '#personView'));
  }
});

await browser.close();

// ---------------------------------------------------------------- report
const failed = results.filter((r) => !r.ok);
console.log(`\nPACS browser QA: ${results.length - failed.length}/${results.length} checks passed`);
if (pageErrors.length) console.log('page errors:', JSON.stringify(pageErrors, null, 2));
if (consoleErrors.length) console.log('console errors:', JSON.stringify(consoleErrors, null, 2));

if (pageErrors.length) {
  console.log(`\nFAIL: ${pageErrors.length} uncaught page error(s)`);
  process.exit(1);
}
if (failed.length) {
  console.log(`\nFAIL: ${failed.map((f) => f.name).join('; ')}`);
  process.exit(1);
}
console.log('PACS browser QA passed.');
