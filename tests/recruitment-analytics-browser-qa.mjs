import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const route = '/analytics/dashboards/new-hr-collection/recruitment-analytics/';
const url = `${base}${route}`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];

page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('response', (response) => {
  if (response.status() >= 400 && !/\/favicon\.ico(?:$|\?)/i.test(response.url())) {
    errors.push(`response ${response.status()}: ${response.url()}`);
  }
});

async function indexByValue(locator, value) {
  return locator.evaluateAll((nodes, wanted) => nodes.findIndex((node) => node.value === wanted), value);
}

async function overflowSnapshot() {
  return page.evaluate(() => {
    const root = document.documentElement;
    const viewportWidth = root.clientWidth;
    const offenders = Array.from(document.querySelectorAll('body *'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id || '',
          className: typeof element.className === 'string' ? element.className : '',
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter((item) => item.right > viewportWidth + 1 || item.left < -1)
      .slice(0, 12);
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: viewportWidth,
      offenders,
    };
  });
}

try {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  assert.ok(response && response.status() < 400, `Recruitment route returned ${response?.status()}`);
  await page.waitForFunction(() =>
    document.querySelectorAll('[data-settings-dimension="unit"] [data-settings-list="included"] input').length > 2,
  );

  for (const field of ['year', 'unit', 'responsible', 'status', 'level_category', 'resource']) {
    assert.equal(await page.locator(`[data-multi-filter="${field}"] [data-multi-trigger]`).count(), 1,
      `missing ${field} multi-select trigger`);
  }

  // Excel-style multi-select: draft selections do not affect the dashboard until Apply.
  const unitTrigger = page.locator('[data-multi-filter="unit"] [data-multi-trigger]');
  const beforeMeta = await page.locator('#datasetMeta').textContent();
  await unitTrigger.click();
  await page.locator('[data-multi-filter="unit"] [data-multi-clear]').click();
  let unitOptions = page.locator('[data-multi-filter="unit"] [data-multi-option]');
  assert.ok(await unitOptions.count() >= 2, 'expected at least two Business Unit options');
  await unitOptions.nth(0).check();
  await unitOptions.nth(1).check();
  assert.equal(await page.locator('#datasetMeta').textContent(), beforeMeta,
    'draft multi-select changed analysis before Apply');
  await page.locator('[data-multi-filter="unit"] [data-multi-apply]').click();
  assert.match((await unitTrigger.textContent()) || '', /2 selected/);
  assert.notEqual(await page.locator('#datasetMeta').textContent(), beforeMeta,
    'Apply did not update the analysis scope');

  // Cancel discards a draft change.
  await unitTrigger.click();
  await page.locator('[data-multi-filter="unit"] [data-multi-clear]').click();
  await page.locator('[data-multi-filter="unit"] [data-multi-cancel]').click();
  assert.match((await unitTrigger.textContent()) || '', /2 selected/,
    'Cancel changed the applied multi-select state');

  // Business Unit: Included -> Excluded, persistence, filter reconciliation, then Include again.
  await page.locator('#clearGlobalFilters').click();
  await page.locator('[data-view="settings"]').click();
  let includedUnits = page.locator('[data-settings-dimension="unit"] [data-settings-list="included"] input[data-settings-check="included"]');
  const unitValue = await includedUnits.nth(0).getAttribute('value');
  assert.ok(unitValue, 'expected a Business Unit value to exclude');
  await includedUnits.nth(0).check();
  await page.locator('[data-settings-dimension="unit"] [data-settings-action="exclude"]').click();
  let excludedUnits = page.locator('[data-settings-dimension="unit"] [data-settings-list="excluded"] input[data-settings-check="excluded"]');
  assert.ok(await indexByValue(excludedUnits, unitValue) >= 0,
    'excluded Business Unit did not move to the adjacent Excluded list');

  let stored = await page.evaluate(() => JSON.parse(localStorage.getItem('aizanoi-recruitment-settings-v1')));
  assert.ok(stored?.excluded?.unit?.includes(unitValue), 'Business Unit exclusion was not persisted browser-locally');

  await page.locator('[data-view="dashboard"]').click();
  await unitTrigger.click();
  unitOptions = page.locator('[data-multi-filter="unit"] [data-multi-option]');
  assert.equal(await indexByValue(unitOptions, unitValue), -1,
    'excluded Business Unit remained in the global filter choices');
  await page.locator('[data-multi-filter="unit"] [data-multi-cancel]').click();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    document.querySelectorAll('[data-settings-dimension="unit"] [data-settings-list="included"] input').length > 1,
  );
  await page.locator('[data-view="settings"]').click();
  excludedUnits = page.locator('[data-settings-dimension="unit"] [data-settings-list="excluded"] input[data-settings-check="excluded"]');
  const persistedUnitIndex = await indexByValue(excludedUnits, unitValue);
  assert.ok(persistedUnitIndex >= 0, 'Business Unit exclusion did not survive reload');
  await excludedUnits.nth(persistedUnitIndex).check();
  await page.locator('[data-settings-dimension="unit"] [data-settings-action="include"]').click();
  excludedUnits = page.locator('[data-settings-dimension="unit"] [data-settings-list="excluded"] input[data-settings-check="excluded"]');
  assert.equal(await indexByValue(excludedUnits, unitValue), -1,
    'Include selected did not restore the Business Unit');

  // Position Name uses the same Included <-> Excluded round trip.
  const includedPositions = page.locator('[data-settings-dimension="position_name"] [data-settings-list="included"] input[data-settings-check="included"]');
  assert.ok(await includedPositions.count() > 0, 'expected Position Name options');
  const positionValue = await includedPositions.nth(0).getAttribute('value');
  assert.ok(positionValue, 'expected a Position Name value');
  await includedPositions.nth(0).check();
  await page.locator('[data-settings-dimension="position_name"] [data-settings-action="exclude"]').click();
  let excludedPositions = page.locator('[data-settings-dimension="position_name"] [data-settings-list="excluded"] input[data-settings-check="excluded"]');
  const positionIndex = await indexByValue(excludedPositions, positionValue);
  assert.ok(positionIndex >= 0, 'Position Name did not move to Excluded');
  await excludedPositions.nth(positionIndex).check();
  await page.locator('[data-settings-dimension="position_name"] [data-settings-action="include"]').click();
  excludedPositions = page.locator('[data-settings-dimension="position_name"] [data-settings-list="excluded"] input[data-settings-check="excluded"]');
  assert.equal(await indexByValue(excludedPositions, positionValue), -1,
    'Position Name did not move back to Included');

  // Reset Settings leaves the browser-local exclusion store empty.
  await page.locator('#resetRecruitmentExclusions').click();
  stored = await page.evaluate(() => JSON.parse(localStorage.getItem('aizanoi-recruitment-settings-v1')));
  assert.deepEqual(stored?.excluded?.unit || [], []);
  assert.deepEqual(stored?.excluded?.position_name || [], []);

  // Settings must remain usable without page-level horizontal scrolling at 390px.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-view="settings"]').click();
  const columns = await page.locator('[data-settings-dimension="unit"] .settings-transfer-grid')
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  assert.ok(!columns.includes(' '), `expected a single Settings grid column on mobile, got ${columns}`);
  const overflow = await overflowSnapshot();
  assert.ok(overflow.scrollWidth <= overflow.clientWidth + 1,
    `Recruitment Settings horizontal overflow: ${JSON.stringify(overflow)}`);

  assert.deepEqual(errors, [], `Recruitment browser errors: ${JSON.stringify(errors)}`);
  console.log('Recruitment Analytics browser QA: multi-select + Settings + persistence + mobile passed.');
} finally {
  await context.close();
  await browser.close();
}
