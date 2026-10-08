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
  assert.equal(await page.locator('#internRecruitmentTableBody tr').first().locator('td').nth(-2).textContent(), '30.10.2026', 'half-day and full-day holidays should contribute fractional credit');
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

  await page.locator('#internIncludeCancelled').check();
  assert.equal(await page.locator('#internRecruitmentTableBody tr').count(), 2);
  assert.equal(await page.locator('#internCandidateCount').textContent(), '2 aday');
  await page.locator('#internIncludeCancelled').uncheck();

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
  await page.waitForFunction(() => /Dosya reddedildi/.test(document.querySelector('#internRecruitmentStatus')?.textContent || ''));
  assert.equal(await page.locator('#internRecruitmentTableBody tr').count(), 0);
  assert.equal(await page.locator('#internRecruitmentTableWrap').evaluate((element) => element.style.display), 'none');
  assert.equal(await page.locator('#internHrPanel').evaluate((element) => element.style.display), 'none');
  assert.equal(await page.locator('#internCandidateCount').textContent(), '0 aday');

  assert.ok((await page.locator('#internLiveCard').count()) === 1, 'live card should be discoverable');
  assert.equal(await page.locator('#internLiveCard iframe').count(), 0, 'blocked SharePoint frame must not be embedded');
  assert.ok((await page.locator('#internLiveOpen').getAttribute('href') || '').includes('action=embedview'), 'open link must use the SharePoint file URL');
  assert.equal(await page.locator('#internLiveOpen').getAttribute('target'), '_blank');
  assert.ok((await page.locator('#internLiveDownload').getAttribute('href') || '').includes('download=1'), 'download link must use download=1');
  assert.equal(await page.locator('#internBackendUrl').inputValue(), 'http://localhost:18923/dosya');
  assert.ok(await page.locator('#internBackendLoadBtn').isVisible(), 'backend load button should be visible');

  const backendBytes = await page.evaluate(({ columns }) => {
    const candidate = columns.map((header) => ({
      Id: '7', 'T.C. Kimlik Numarası': '00999888777', Adı: 'Backend', Soyadı: 'Aday',
      'Telefon numaranız': '05320000007', 'Doğum Tarihiniz': '2003-01-15',
      'Staj Başlangıç Dönemi': '28 Ekim 2026',
      'Kaç iş günü stajınızı gerçekleştireceksiniz?': 1,
      'Staj Katılım Günleri': 'Pazartesi;Salı;Çarşamba;Perşembe;Cuma',
      'Kesinleşen Birim': '', sorumlu: '', Şirket: '', 'İptal mi?': 'Hayır',
    }[header] ?? ''));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([columns, candidate]), 'Backend');
    return Array.from(new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' })));
  }, { columns: headers });
  await page.route('http://localhost:18923/dosya', (route) => route.fulfill({
    status: 200,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    body: Buffer.from(backendBytes),
  }));
  await page.locator('#internBackendLoadBtn').click();
  await page.waitForFunction(() => document.querySelector('#internRecruitmentTableWrap')?.style.display === 'block');
  assert.equal(await page.locator('#internRecruitmentTableBody tr').count(), 1, 'backend workbook should feed the existing pipeline');
  assert.equal(await page.locator('#internCandidateCount').textContent(), '1 aday');

  await page.unroute('http://localhost:18923/dosya');
  await page.route('http://localhost:18923/dosya', (route) => route.fulfill({
    status: 200,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' },
    body: 'indirilemedi: bozuk govde',
  }));
  await page.locator('#internBackendLoadBtn').click();
  await page.waitForFunction(() => /Backend yüklemesi başarısız/.test(document.querySelector('#internRecruitmentStatus')?.textContent || ''));
  assert.equal(await page.locator('#internRecruitmentTableBody tr').count(), 0);
  assert.equal(await page.locator('#internRecruitmentTableWrap').evaluate((element) => element.style.display), 'none');
  assert.equal(await page.locator('#internCandidateCount').textContent(), '0 aday');

  assert.deepEqual(errors, []);
  console.log('Recruitment intern browser QA: schema import, privacy, stale reset, cancellation, a11y, mobile, Excel typing, live card and backend load passed.');
} finally {
  await context.close();
  await browser.close();
}
