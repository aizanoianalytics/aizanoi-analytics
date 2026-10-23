import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const url = `${base}/analytics/dashboards/new-hr-collection/recruitment-analytics/`;
const headers = [
  'Id', 'Başlangıç saati', 'Tamamlama saati', 'E-posta', 'Ad', 'Staj Durumunuz',
  'T.C. Kimlik Numarası', 'Adı', 'Soyadı', 'Telefon numaranız', 'E-posta adresiniz',
  'Doğum Tarihiniz', 'İkametgah Adresi', 'İlçe/İl', 'Anne Adı', 'Baba Adı',
  'Kan Grubunuz', 'Staj Başlangıç Dönemi', 'Kaç iş günü stajınızı gerçekleştireceksiniz?',
  'Staj Katılım Günleri', 'Staj son günü', 'Eğitim Durumunuz', 'Üniversite', 'Bölüm',
  'Sınıf', 'İngilizce Seviyeniz', 'Linkedin bağlantınız', '1. Birim Tercihiniz',
  '2. Birim Tercihiniz', '3. Birim Tercihiniz',
  'Yukarıdaki KVKK Aydınlatma Metnini okudum, anladım ve onaylıyorum.',
  'Kesinleşen Birim', 'sorumlu', 'Şirket', 'Güvenlik Bilinci Sınavı', 'Adli Sicil',
  'Biyometrik Fotoğraf', 'Nüfus Cüzdanı Belgesi', 'İkametgah Belgesi', 'Öğrenci Belgesi',
  'Staj Başvuru Formu', 'SGK işe giriş belgesi', 'İptal mi?', 'NOTLAR',
];

function row(values) {
  return headers.map((header) => values[header] ?? '');
}

const activeMarker = 'APPLICANT-NEVER-LEAVES-BROWSER-4815';
const rows = [
  row({
    Id: '1', 'T.C. Kimlik Numarası': '00123456789', Adı: activeMarker, Soyadı: 'Aktif',
    'Telefon numaranız': '05320000001', 'Doğum Tarihiniz': '2002-05-06',
    'Staj Başlangıç Dönemi': '28 Ekim 2026',
    'Kaç iş günü stajınızı gerçekleştireceksiniz?': 1,
    'Staj Katılım Günleri': 'Pazartesi;Salı;Çarşamba;Perşembe;Cuma',
    'Kesinleşen Birim': '', sorumlu: '', Şirket: '', 'İptal mi?': 'Hayır',
  }),
  row({
    Id: '2', 'T.C. Kimlik Numarası': '00987654321', Adı: 'İptal Aday', Soyadı: 'İptal',
    'Telefon numaranız': '05320000002', 'Doğum Tarihiniz': '2001-04-03',
    'Staj Başlangıç Dönemi': '01 Mayıs 2026',
    'Kaç iş günü stajınızı gerçekleştireceksiniz?': 2,
    'Staj Katılım Günleri': 'Pazartesi;Salı;Çarşamba;Perşembe;Cuma',
    'Kesinleşen Birim': 'Operasyon', sorumlu: 'Uzman', Şirket: 'İGA', 'İptal mi?': 'Evet',
  }),
];

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || undefined });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
const requestsAfterLoad = [];
page.on('pageerror', (error) => errors.push(error.stack || error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

async function uploadWorkbook({ fileName, sheetName, matrix }) {
  await page.evaluate(({ fileName, sheetName, matrix }) => {
    const sheet = XLSX.utils.aoa_to_sheet(matrix);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, sheetName);
    const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
    const file = new File([bytes], fileName, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = document.querySelector('#internRecruitmentFileInput');
    Object.defineProperty(input, 'files', { value: transfer.files, configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { fileName, sheetName, matrix });
}

try {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  assert.ok(response && response.ok(), `route failed: ${response?.status()}`);
  assert.equal((await page.content()).includes(activeMarker), false, 'applicant rows must not be embedded in the shipped HTML');
  page.on('request', (request) => requestsAfterLoad.push({ url: request.url(), postData: request.postData() || '' }));

  assert.equal(await page.locator('#internPageLock').isVisible(), true, 'page lock must gate every load');
  await page.locator('#internPageLockInput').fill('yanlis-sifre');
  await page.locator('#internPageLockBtn').click();
  assert.match(await page.locator('#internPageLockError').textContent(), /yanlış/);
  assert.equal(await page.locator('#internPageLock').isVisible(), true, 'wrong password must not unlock');
  const pagePassword = process.env.INTERN_PAGE_PASSWORD;
  assert.ok(pagePassword, 'INTERN_PAGE_PASSWORD env is required to unlock the page gate');
  await page.locator('#internPageLockInput').fill(pagePassword);
  await page.locator('#internPageLockBtn').click();
  await page.waitForFunction(() => document.querySelector('#internPageLock')?.hidden === true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(await page.locator('#internPageLock').isVisible(), true, 'reload must lock again (no persistence)');
  await page.locator('#internPageLockInput').fill(pagePassword);
  await page.locator('#internPageLockBtn').click();
  await page.waitForFunction(() => document.querySelector('#internPageLock')?.hidden === true);

  await page.locator('[data-view="intern-recruitment"]').click();
  await uploadWorkbook({
    fileName: 'gelecek-forms-disari-aktarimi.xlsx',
    sheetName: 'Güncel Başvurular',
    matrix: [[...headers, 'Yeni Forms Sütunu'], ...rows.map((item, index) => [...item, `ek-${index}`])],
  });
  await page.waitForFunction(() => document.querySelector('#internRecruitmentTableWrap')?.style.display === 'block');

  assert.equal(await page.locator('#internRecruitmentTableBody tr').count(), 1, 'cancelled row should be hidden by default');
  assert.equal(await page.locator('#internCandidateCount').textContent(), '1 aday');
  assert.equal(await page.locator('#internCandidateTabCount').textContent(), '1');
  assert.deepEqual(await page.locator('#internPeriodSelect option').allTextContents(), ['Tüm dönemler', '01 Mayıs 2026', '28 Ekim 2026']);
  const internHeaders = await page.locator('#internRecruitmentTableHead th').allTextContents();
  assert.ok(internHeaders.some((label) => label.trim() === 'Hesaplanan Bitiş'), 'computed end-date column should be present');
  assert.equal(await page.locator('#internRecruitmentTableBody [data-intern-end]').first().inputValue(), '30.10.2026', 'half-day and full-day holidays should contribute fractional credit');
  assert.equal(await page.locator('#internPeriodSelect').inputValue(), '', 'All periods should be the default');

  const blankDepartment = page.locator('select[aria-label^="Kesinleşen Birim"]').first();
  assert.equal(await blankDepartment.inputValue(), '');
  assert.equal(await blankDepartment.locator('option').first().textContent(), '(boş)');

  const tableA11y = await page.locator('#internRecruitmentTableWrap').evaluate((element) => ({
    role: element.getAttribute('role'), label: element.getAttribute('aria-label'), tabIndex: element.tabIndex,
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  assert.deepEqual(tableA11y, { role: 'region', label: 'Stajyer adayları tablosu', tabIndex: 0, pageOverflow: 0 });
  assert.equal(await page.locator('#internRecruitmentTable th').first().evaluate((element) => getComputedStyle(element).position), 'sticky');

  await page.locator('label.ip-switch', { has: page.locator('#internIncludeCancelled') }).click();
  assert.equal(await page.locator('#internRecruitmentTableBody tr').count(), 2);
  assert.equal(await page.locator('#internCandidateCount').textContent(), '2 aday');
  await page.locator('label.ip-switch', { has: page.locator('#internIncludeCancelled') }).click();

  const exportProbe = await page.evaluate(() => {
    const result = {};
    try { result.sheet = XLSX.utils.aoa_to_sheet([["Doğum Tarihi"], [new Date(2002, 4, 6)]], { cellDates: true, dateNF: "dd\\.mm\\.yyyy" }).A2.t; } catch (error) { result.sheetError = String(error); }
    try { result.address = XLSX.utils.encode_cell({ r: 1, c: 0 }); } catch (error) { result.addressError = String(error); }
    return result;
  });
  assert.deepEqual(exportProbe, { sheet: 'd', address: 'A2' });
  await page.evaluate(() => {
    XLSX.writeFile = (book, filename, options) => { window.__capturedInternWorkbook = { book, filename, options }; };
  });
  await page.locator('#exportIsgBtn').click();
  await page.waitForTimeout(250);
  if (!await page.evaluate(() => window.__capturedInternWorkbook !== null)) {
    throw new Error(`Export did not run: ${JSON.stringify(errors)}`);
  }
  const exported = await page.evaluate(() => {
    const sheet = window.__capturedInternWorkbook.book.Sheets.Liste;
    return {
      filename: window.__capturedInternWorkbook.filename,
      tc: { type: sheet.C2.t, value: sheet.C2.v },
      phone: { type: sheet.E2.t, value: sheet.E2.v },
      birth: { type: sheet.F2.t, format: sheet.F2.z, isDate: sheet.F2.v instanceof Date },
    };
  });
  assert.match(exported.filename, /^ISG-Listesi-/);
  assert.deepEqual(exported.tc, { type: 's', value: '00123456789' });
  assert.deepEqual(exported.phone, { type: 's', value: '05320000001' });
  assert.deepEqual(exported.birth, { type: 'd', format: 'dd\\.mm\\.yyyy', isDate: true });

  const storageSnapshot = await page.evaluate(() => ({
    local: Object.values(localStorage), session: Object.values(sessionStorage), source: document.documentElement.outerHTML.includes('APPLICANT-NEVER-LEAVES-BROWSER-4815'),
  }));
  assert.equal(storageSnapshot.local.some((value) => value.includes(activeMarker)), false);
  assert.equal(storageSnapshot.session.some((value) => value.includes(activeMarker)), false);
  assert.equal(requestsAfterLoad.some((request) => request.url.includes(activeMarker) || request.postData.includes(activeMarker)), false);
  assert.equal(storageSnapshot.source, true, 'fixture should be visible only in the live DOM');

  await uploadWorkbook({ fileName: 'bozuk.xlsx', sheetName: 'Başka', matrix: [['uyumsuz'], [activeMarker]] });
  await page.waitForFunction(() => /beklenen üç yapıdan birine uymuyor/.test(document.querySelector('#internImportResult')?.textContent || ''));
  assert.equal(await page.locator('#internRecruitmentTableBody tr').count(), 0);
  assert.equal(await page.locator('#internRecruitmentTableWrap').evaluate((element) => element.style.display), 'none');
  assert.equal(await page.locator('#internHrPanel').evaluate((element) => element.hidden), true);
  assert.equal(await page.locator('#internCandidateCount').textContent(), '0 aday');

  assert.ok((await page.locator('#internLiveCard').count()) === 1, 'live card should be discoverable');
  assert.equal(await page.locator('#internLiveCard iframe').count(), 0, 'blocked SharePoint frame must not be embedded');
  assert.ok((await page.locator('#internLiveOpen').getAttribute('href') || '').includes('action=embedview'), 'open link must use the SharePoint file URL');
  assert.equal(await page.locator('#internLiveOpen').getAttribute('target'), '_blank');
  assert.ok((await page.locator('#internLiveDownload').getAttribute('href') || '').includes('download=1'), 'download link must use download=1');
  assert.equal(await page.locator('#recruitmentLiveCard').count(), 1, 'recruitment card should share the same import page');
  assert.equal(await page.locator('#unifiedExcelInput').getAttribute('multiple'), '', 'unified input must accept several workbooks at once');
  assert.equal(await page.locator('#internBackendUrl').count(), 0, 'backend URL controls must be gone');
  assert.equal(await page.locator('#internBackendLoadBtn').count(), 0, 'backend load button must be gone');

  const unifiedOutcome = await page.evaluate(({ internHeaders, internRows }) => {
    const recruitmentHeaders = ['check_area', 'ptf', 'unit', 'position_name', 'status', 'process_step', 'hiring_manager', 'responsible', 'comment', 'position_start_date', 'position_level', 'level_category', 'offer_date', 'hired_employee', 'resource', 'refferal_name', 'gender'];
    const recruitmentRow = recruitmentHeaders.map((header) => ({ ptf: '50060009', unit: 'Operasyon', position_name: 'Uzman', status: 'Open' }[header] ?? ''));
    const recruitmentBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(recruitmentBook, XLSX.utils.aoa_to_sheet([recruitmentHeaders, recruitmentRow]), 'db');
    const recruitmentBytes = XLSX.write(recruitmentBook, { type: 'array', bookType: 'xlsx' });
    const internBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(internBook, XLSX.utils.aoa_to_sheet([internHeaders, ...internRows]), 'Basvurular');
    const internBytes = XLSX.write(internBook, { type: 'array', bookType: 'xlsx' });
    const makeFile = (bytes, name) => new File([bytes], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const transfer = new DataTransfer();
    transfer.items.add(makeFile(recruitmentBytes, 'ise_alim_toplu.xlsx'));
    transfer.items.add(makeFile(internBytes, 'staj_toplu.xlsx'));
    const input = document.querySelector('#unifiedExcelInput');
    Object.defineProperty(input, 'files', { value: transfer.files, configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { internHeaders: headers, internRows: rows });
  void unifiedOutcome;
  await page.waitForFunction(() => (document.querySelector('#unifiedImportResult')?.textContent || '').includes('ise_alim_toplu.xlsx'));
  await page.waitForFunction(() => (document.querySelector('#unifiedImportResult')?.textContent || '').includes('staj_toplu.xlsx'));
  assert.match(await page.locator('#unifiedImportResult').textContent(), /İşe alım panosu/);
  assert.match(await page.locator('#unifiedImportResult').textContent(), /Staj paneli/);
  assert.equal(await page.locator('#internRecruitmentTableWrap').evaluate((element) => element.style.display), 'block');
  assert.equal(await page.locator('#internDashboard').isVisible(), true, 'intern dashboard should render after import');
  assert.equal(await page.locator('#internKpiGrid .ip-kpi').count(), 4);

  await page.evaluate((marker) => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['uyumsuz'], [marker]]), 'Baska');
    const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
    const file = new File([bytes], 'bilinmeyen.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = document.querySelector('#unifiedExcelInput');
    Object.defineProperty(input, 'files', { value: transfer.files, configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, activeMarker);
  await page.waitForFunction(() => (document.querySelector('#unifiedImportResult')?.textContent || '').includes('beklenen üç yapıdan birine uymuyor'));
  assert.deepEqual(errors, []);
  console.log('Recruitment intern browser QA: schema import, privacy, stale reset, cancellation, a11y, mobile, Excel typing, live card and unified import passed.');
} finally {
  await context.close();
  await browser.close();
}
