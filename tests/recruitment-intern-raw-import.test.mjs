import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const dashboardPath = 'frontend/analytics/dashboards/new-hr-collection/recruitment-analytics/index.html';
const html = readFileSync(dashboardPath, 'utf8');

const expectedHeaders = [
  'Id',
  'Başlangıç saati',
  'Tamamlama saati',
  'E-posta',
  'Ad',
  'Staj Durumunuz',
  'T.C. Kimlik Numarası',
  'Adı',
  'Soyadı',
  'Telefon numaranız',
  'E-posta adresiniz',
  'Doğum Tarihiniz',
  'İkametgah Adresi',
  'İlçe/İl',
  'Anne Adı',
  'Baba Adı',
  'Kan Grubunuz',
  'Staj Başlangıç Dönemi',
  'Kaç iş günü stajınızı gerçekleştireceksiniz?',
  'Staj Katılım Günleri',
  'Staj son günü',
  'Eğitim Durumunuz',
  'Üniversite',
  'Bölüm',
  'Sınıf',
  'İngilizce Seviyeniz',
  'Linkedin bağlantınız',
  '1. Birim Tercihiniz',
  '2. Birim Tercihiniz',
  '3. Birim Tercihiniz',
  'Yukarıdaki KVKK Aydınlatma Metnini okudum, anladım ve onaylıyorum.',
  'Kesinleşen Birim',
  'sorumlu',
  'Şirket',
  'Güvenlik Bilinci Sınavı',
  'Adli Sicil',
  'Biyometrik Fotoğraf',
  'Nüfus Cüzdanı Belgesi',
  'İkametgah Belgesi',
  'Öğrenci Belgesi',
  'Staj Başvuru Formu',
  'SGK işe giriş belgesi',
  'İptal mi?',
  'NOTLAR',
];

function internLogic() {
  const start = html.indexOf('async function handleInternRecruitmentFile');
  const end = html.indexOf('// NAVIGATION', start);
  assert.ok(start > 0 && end > start, 'missing isolated Intern Recruitment logic');
  return html.slice(start, end);
}

test('Recruitment dashboard adds exactly one discoverable Intern Recruitment tab and panel', () => {
  assert.equal((html.match(/<button[^>]+data-view="intern-recruitment"/g) || []).length, 1);
  assert.equal((html.match(/<div[^>]+data-view-panel="intern-recruitment"/g) || []).length, 1);
  assert.match(html, /<span>Intern Recruitment<\/span>/);
  assert.match(html, /data-view="intern-recruitment"[\s\S]*?id="internCandidateTabCount"/);
  assert.match(html, /@media \(max-width: 820px\)[\s\S]*?\[data-view="intern-recruitment"\][^{]*\{[^}]*order:\s*-1/);
});

test('Intern Recruitment accepts compatible local .xlsx workbooks by schema, not filename, hash, or sheet name', () => {
  assert.match(html, /id="internRecruitmentFileInput" accept="\.xlsx"/);
  assert.doesNotMatch(html, /INTERN_RECRUITMENT_FILE|INTERN_RECRUITMENT_SHA256|crypto\.subtle\.digest/);
  assert.match(html, /findInternRecruitmentSheet\(workbook\)/);
  assert.match(html, /missing required columns/i);
  assert.match(html, /XLSX\.utils\.sheet_to_json\(sheet, \{ header: 1, raw: true, defval: "", blankrows: false \}\)/);
  assert.match(html, /function renderInternRecruitmentRawData\(matrix, fileName\)/);
  assert.match(html, /never uploaded|Hiçbir veri yüklenmez/i);
});

test('Intern Recruitment declares the required schema without committing applicant rows', () => {
  const match = html.match(/const INTERN_RECRUITMENT_HEADERS = Object\.freeze\((\[[\s\S]*?\])\);/);
  assert.ok(match, 'missing Intern Recruitment header contract');
  assert.deepEqual(JSON.parse(match[1]), expectedHeaders);
  assert.match(html, /<tbody id="internRecruitmentTableBody"><\/tbody>/);
  assert.doesNotMatch(html, /<script[^>]+id="internRecruitmentEmbeddedData"/);

  const tracked = spawnSync('git', ['ls-files'], { encoding: 'utf8' });
  assert.equal(tracked.status, 0, tracked.stderr);
  assert.doesNotMatch(tracked.stdout, /İGA Staj Başvuru Formu\.xlsx|IGA-Staj-Basvuru-Formu\.xlsx/);
});

test('Applicant rows stay isolated from network and browser storage code paths', () => {
  const logic = internLogic();
  assert.doesNotMatch(logic, /state\.records|normalizePayload|applyPayload|renderAll/);
  assert.doesNotMatch(logic, /fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|indexedDB|caches\./);
  assert.match(logic, /resetInternRecruitmentState\(\)/);
  assert.match(logic, /renderInternRecruitmentRawData\(matrix, file\.name\)/);
});

test('Every internship upload attempt clears stale rows, controls, status, and file input state', () => {
  const logic = internLogic();
  const handler = logic.slice(0, logic.indexOf('// HR PANELI'));
  assert.match(handler, /resetInternRecruitmentState\(\);/);
  assert.match(handler, /finally\s*\{[\s\S]*?internRecruitmentFileInput[\s\S]*?value\s*=\s*""/);
  assert.match(html, /internState\.headers\s*=\s*\[\]/);
  assert.match(html, /internState\.rows\s*=\s*\[\]/);
  assert.match(html, /internHrPanel[\s\S]*?style\.display\s*=\s*"none"/);
});

test('Cancelled candidates are excluded by default and can be included explicitly', () => {
  assert.match(html, /id="internIncludeCancelled"/);
  assert.match(html, /İptal edilen adayları dahil et/);
  assert.match(html, /function internRowCancelled\(rowIdx\)/);
  assert.match(html, /if \(!includeCancelled && internRowCancelled\(idx\)\) return/);
  assert.match(html, /internIncludeCancelled[\s\S]*?addEventListener\("change"/);
});

test('Internship calendar models full and half-day Turkish holidays from 2026 through 2030', () => {
  for (const year of [2026, 2027, 2028, 2029, 2030]) {
    assert.match(html, new RegExp(`"${year}-01-01":\\s*1`));
    assert.match(html, new RegExp(`"${year}-10-28":\\s*0\\.5`));
    assert.match(html, new RegExp(`"${year}-10-29":\\s*1`));
  }
  assert.match(html, /"2026-03-19":\s*0\.5/);
  assert.match(html, /"2027-05-15":\s*0\.5/);
  assert.match(html, /"2028-02-26":\s*0\.5/);
  assert.match(html, /"2029-02-13":\s*0\.5/);
  assert.match(html, /"2030-04-12":\s*0\.5/);
  assert.match(html, /const credit = 1 - \(TR_HOLIDAY_CREDIT\[toIsoDay\(cursor\)\] \?\? 0\)/);
  assert.match(html, /throw new RangeError\(/);
  assert.doesNotMatch(html, /for \(let step = 0; step < 1500; step\+\+\)/);
});

test('Today is derived deterministically in Europe/Istanbul', () => {
  assert.match(html, /timeZone:\s*"Europe\/Istanbul"/);
  assert.match(html, /function istanbulToday\(now = new Date\(\)\)/);
  assert.match(html, /function remainingText\(endDate, today = istanbulToday\(\)\)/);
});

test('Dropdowns expose an explicit blank option and periods are chronological with All selected', () => {
  assert.match(html, /const options = \["", \.\.\.distinctInternValues/);
  assert.match(html, /escapeHtml\(option\) \|\| "\(boş\)"/);
  assert.match(html, /sort\(\(a, b\) => periodSortValue\(a\) - periodSortValue\(b\)/);
  assert.match(html, /<option value="">Tüm dönemler<\/option>/);
  assert.match(html, /select\.value = ""/);
});

test('Intern table is an accessible scroll region with sticky headers and identity columns', () => {
  assert.match(html, /id="internRecruitmentTableWrap"[^>]+tabindex="0"[^>]+role="region"[^>]+aria-label="Stajyer adayları tablosu"/);
  assert.match(html, /#internRecruitmentTable th\s*\{[^}]*position:\s*sticky/);
  assert.match(html, /#internRecruitmentTable :is\(th, td\):nth-child\(1\)/);
  assert.match(html, /#internRecruitmentTable select\s*\{[^}]*min-width:/);
  assert.match(html, /internEditorLabel\(rowIdx, header\)/);
});

test('Excel exports preserve identifiers as text and dates as formatted date cells', () => {
  assert.match(html, /const INTERN_TEXT_EXPORT_HEADERS = new Set\(\[[^\]]*"T\.C\. Kimlik Numarası"[^\]]*"Telefon"[^\]]*\]\)/);
  assert.match(html, /cell\.t = "s"/);
  assert.match(html, /cell\.t = "d"/);
  assert.match(html, /cell\.z = "dd\\\\\.mm\\\\\.yyyy"/);
  assert.match(html, /XLSX\.writeFile\(book, filename, \{ cellDates: true \}\)/);
});

test('Page and internship controls expose Turkish language and candidate counts', () => {
  assert.match(html, /<html lang="tr">/);
  assert.match(html, /id="internCandidateCount"[^>]+aria-live="polite"/);
  assert.match(html, /updateInternCandidateCounts\(\)/);
});

test('Intern exports surface failures, map optional gender, and label editors by candidate identity', () => {
  assert.match(html, /function runInternExport\(exporter\)/);
  assert.match(html, /Rapor oluşturulamadı:/);
  assert.match(html, /internCell\(i, "Cinsiyet"\)/);
  assert.match(html, /internEditorLabel\(rowIdx, header\)/);
  assert.match(html, /aria-label="\$\{escapeHtml\(internEditorLabel\(rowIdx, header\)\)\}"/);
});

test('Selected weekend attendance days can earn internship credit', () => {
  const block = html.slice(html.indexOf('function calcInternEndDate'), html.indexOf('function istanbulToday'));
  assert.match(block, /if \(weekdays\.has\(jsDay\)\)/);
  assert.doesNotMatch(block, /jsDay !== 0|jsDay !== 6/);
});
