import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const route = '/analytics/dashboards/new-hr-collection/recruitment-analytics/';

async function dismissTestGate() {
  // No credentials or authentication changes: bypass only this disposable QA DOM.
  assert.equal(await page.locator('#internPageLock').isVisible(), true);
  await page.evaluate(() => { document.querySelector('#internPageLock').hidden = true; });
}

async function workbook(headers, objects, name) {
  const bytes = await page.evaluate(({ headers, objects }) => {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...objects.map(row => headers.map(key => row[key] ?? ''))]);
    XLSX.utils.book_append_sheet(book, sheet, 'db');
    return Array.from(new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' })));
  }, { headers, objects });
  return { name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(bytes) };
}

async function preview(mode, periods, expected, useFilters = false, expectedCandidates = expected[0]) {
  await page.locator('#monthlyReportBtn').click();
  await page.selectOption('#mrPeriod', mode);
  await page.selectOption('#mrMonth', periods);
  if (useFilters) await page.locator('#mrFilters').check();
  assert.equal(await page.locator('#mrMonth option:checked').count(), periods.length);
  const popupPromise = page.waitForEvent('popup');
  await page.locator('#mrPreview').click();
  const report = await popupPromise;
  await report.waitForLoadState('domcontentloaded');
  const values = await report.locator('.cover .tile b').allTextContents();
  assert.deepEqual(values.slice(0, 2), expected, `${mode} ${periods}: recruitment aggregate`);
  assert.equal(await report.locator('.cover .tile').filter({ hasText: 'Görüşülen aday' }).locator('b').textContent(), expectedCandidates);
  assert.doesNotMatch(await report.locator('body').innerText(), /QA Candidate|qa-candidate@example\.invalid/);
  assert.match(await report.title(), /İşeAlım_Rapor_/);
  if (mode === 'year') assert.equal(await report.locator('.cover .mo').textContent(), periods.map(y => `${y} (Yıllık)`).join(', '));
  await report.close();
  await page.locator('#mrCancel').click();
  assert.equal(await page.locator('#monthlyReportBtn').evaluate(el => el === document.activeElement), true);
}

try {
  await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
  assert.match(await page.locator('#datasetMeta').textContent(), /5[,.]000/);
  await dismissTestGate();
  const headers = await page.evaluate(() => JSON.parse(document.querySelector('#igatsEmbeddedData').textContent).headers);
  const dates = ['31.12.2024','01.01.2025','28.02.2025','31.03.2025','01.04.2025','31.12.2025','01.01.2026'];
  const records = dates.map((date, i) => ({ check_area: '', ptf: `QA-${i}`, unit: 'QA Unit', position_name: 'QA Role', status: 'Kapalı', process_step: 'Teklif Kabul', hiring_manager: 'QA Manager', responsible: i % 2 ? 'REQ Beta' : 'REQ Alpha', position_start_date: date, offer_date: date, hired_employee: `QA Hire ${i}`, resource: 'QA Source', position_level: 'Uzman', level_category: 'Uzman' }));
  const ctHeaders = ['Recruiter','Ad Soyad','Telefon','Mail','İlk Görüşme Tarihi','Kaynak','Referans','LinkedIn Profili','Pozisyon','Ücret Beklentisi (Net)','Mezuniyet Durumu','Üniversite Türü','Okul','Bölüm','İK Görüşme Notu (Comment)','İngilizce Sınav Seviyesi','Sonuç','İş Başı Tarihi','Elenen Aşama','Eleme Nedeni'];
  const candidates = dates.map((date, i) => ({ Recruiter: i % 2 ? 'CT Beta' : 'CT Alpha', 'Ad Soyad': `QA Candidate ${i}`, Mail: 'qa-candidate@example.invalid', 'İlk Görüşme Tarihi': date, 'İş Başı Tarihi': date, Pozisyon: 'QA Role', Sonuç: 'Olumlu', Kaynak: 'QA Source' }));
  await page.locator('#unifiedExcelInput').setInputFiles([await workbook(headers, records, 'qa-requisitions.xlsx'), await workbook(ctHeaders, candidates, 'qa-candidates.xlsx')]);
  await page.waitForFunction(() => document.querySelector('#ctTabBadge').textContent === '7');
  await preview('month', ['2024-12','2025-03'], ['2','2']);
  await preview('quarter', ['2025-Q1'], ['3','3']);
  await preview('quarter', ['2025-Q4','2026-Q1'], ['2','2']);
  await preview('year', ['2025'], ['5','5']);
  await page.locator('#monthlyReportBtn').click();
  await page.selectOption('#mrPeriod', 'quarter');
  await page.selectOption('#mrMonth', ['2025-Q1']);
  await page.locator('#mrPrint').click();
  const printed = page.frameLocator('#mrFrame');
  await printed.locator('.cover .tile b').first().waitFor();
  assert.deepEqual((await printed.locator('.cover .tile b').allTextContents()).slice(0, 2), ['3', '3']);
  assert.match(await page.locator('#mrFrame').getAttribute('srcdoc'), /2025-01_2025-02_2025-03/);

  // Candidate source Recruiter must not read requisition responsible values.
  await page.locator('[data-view="candidate-tracking"]').click();
  const ctFilter = page.locator('[data-ct-filter="recruiter"]');
  assert.match(await ctFilter.locator('option').allTextContents().then(v => v.join('|')), /CT Alpha/);
  assert.doesNotMatch(await ctFilter.locator('option').allTextContents().then(v => v.join('|')), /REQ Alpha/);
  await ctFilter.selectOption('CT Alpha');
  assert.equal(await page.locator('#ctTableBody tr').count(), 4);
  assert.match(await page.locator('#ctFilters').textContent(), /İşe Alım Uzmanı/);
  await page.locator('[data-view="dashboard"]').click();
  const shell = page.locator('[data-multi-filter="responsible"]');
  await shell.locator('[data-multi-trigger]').click();
  await shell.locator('[data-multi-clear]').click();
  await shell.locator('[data-multi-option][value="REQ Beta"]').check();
  await shell.locator('[data-multi-apply]').click();
  await preview('year', ['2025'], ['3', '3'], true, '5');
  await page.locator('[data-view="records"]').click();
  assert.equal(await page.locator('#recordsTableBody tr').count(), 3);
  await page.locator('[data-view="candidate-tracking"]').click();
  assert.equal(await ctFilter.inputValue(), 'CT Alpha');
  assert.equal(await page.locator('#ctTableBody tr').count(), 4);
  await page.locator('#ctReset').click();
  assert.equal(await page.locator('#ctTableBody tr').count(), 7);
  await page.locator('[data-view="dashboard"]').click();
  assert.match(await shell.locator('[data-multi-trigger]').innerText(), /REQ Beta/);
  await page.locator('#clearGlobalFilters').click();
  await page.locator('[data-view="records"]').click();
  assert.equal(await page.locator('#recordsTableBody tr').count(), 7);

  // Browser-local filters/PII are not persisted. Portable export excludes candidate rows.
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  assert.doesNotMatch(storage, /QA Candidate|CT Alpha|REQ Beta|qa-candidate@example/);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#downloadPortableHtmlButton').click();
  const download = await downloadPromise;
  const portable = await readFile(await download.path(), 'utf8');
  assert.doesNotMatch(portable, /QA Candidate|qa-candidate@example\.invalid/);
  const exported = JSON.parse(portable.match(/<script id="igatsEmbeddedData" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(exported.rows.length, 7);
  for (const width of [768, 390, 320]) {
    const height = width === 320 ? 568 : 900;
    await page.setViewportSize({ width, height });
    await page.locator('[data-view="dashboard"]').click();
    await page.locator('#monthlyReportBtn').click();
    await page.selectOption('#mrPeriod', 'quarter');
    await page.selectOption('#mrMonth', ['2025-Q1', '2025-Q4']);
    const geometry = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth, modal: document.querySelector('#mrModal').getBoundingClientRect().toJSON() }));
    assert.ok(geometry.page <= geometry.viewport + 1, JSON.stringify(geometry));
    assert.ok(geometry.modal.left >= 0 && geometry.modal.right <= width + 1, JSON.stringify(geometry));
    assert.ok(geometry.modal.top >= 0 && geometry.modal.bottom <= height + 1, JSON.stringify(geometry));
    await page.locator('#mrCancel').click();
    if (width === 390) {
      await page.locator('#globalFilterToggle').click();
      assert.equal(await page.locator('#globalFilterBar').isVisible(), true);
      await shell.locator('[data-multi-trigger]').click();
      await shell.locator('[data-multi-clear]').click();
      await shell.locator('[data-multi-option][value="REQ Alpha"]').check();
      await shell.locator('[data-multi-apply]').click();
      await page.locator('[data-view="records"]').click();
      assert.equal(await page.locator('#recordsTableBody tr').count(), 4);
      await shell.locator('[data-multi-trigger]').click();
      await shell.locator('[data-multi-clear]').click();
      await shell.locator('[data-multi-apply]').click();
      assert.equal(await page.locator('#clearGlobalFiltersCompact').isEnabled(), true, 'empty specialist selection is still an active filter');
      await page.locator('#clearGlobalFiltersCompact').click();
      assert.equal(await page.locator('#recordsTableBody tr').count(), 7);
      await page.locator('[data-view="candidate-tracking"]').click();
      await ctFilter.selectOption('CT Beta');
      assert.equal(await page.locator('#ctTableBody tr').count(), 3);
      await page.locator('#ctReset').click();
      assert.equal(await page.locator('#ctTableBody tr').count(), 7);
    }
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await dismissTestGate();
  assert.equal(await page.locator('#ctTabBadge').textContent(), '0', 'candidate records remain memory-only');
  assert.match(await page.locator('#datasetMeta').textContent(), /5[,.]000/);
  assert.deepEqual(errors, []);
  console.log('Recruitment periods/browser: 5 aggregate previews + print iframe; independent source filters/reset; portable export privacy; 768/390/320 layouts; no page errors.');
} finally { await browser.close(); }
