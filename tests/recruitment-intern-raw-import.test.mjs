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

test('Recruitment dashboard adds exactly one Intern Recruitment tab and panel', () => {
  assert.equal((html.match(/data-view="intern-recruitment"/g) || []).length, 1);
  assert.equal((html.match(/data-view-panel="intern-recruitment"/g) || []).length, 1);
  assert.match(html, /<span>intern recruitment<\/span>/);
});

test('Intern Recruitment accepts only the named local workbook and renders raw rows', () => {
  assert.match(html, /const INTERN_RECRUITMENT_FILE = "İGA Staj Başvuru Formu\.xlsx";/);
  assert.match(html, /id="internRecruitmentFileInput" accept="\.xlsx"/);
  assert.match(html, /const INTERN_RECRUITMENT_SHA256 = "[a-f0-9]{64}";/);
  assert.match(html, /crypto\.subtle\.digest\("SHA-256", buffer\)/);
  assert.match(html, /digestHex !== INTERN_RECRUITMENT_SHA256/);
  assert.match(html, /workbook\.SheetNames\.length !== 1 \|\| workbook\.SheetNames\[0\] !== INTERN_RECRUITMENT_SHEET/);
  assert.match(html, /XLSX\.utils\.sheet_to_json\(sheet, \{ header: 1, raw: true, defval: "", blankrows: false \}\)/);
  assert.match(html, /function renderInternRecruitmentRawData\(matrix, fileName\)/);
  assert.match(html, /data remains in this browser and is never uploaded/i);
});

test('Intern Recruitment pins the exact 44-column schema without committing applicant rows', () => {
  const match = html.match(/const INTERN_RECRUITMENT_HEADERS = Object\.freeze\((\[[\s\S]*?\])\);/);
  assert.ok(match, 'missing exact Intern Recruitment header contract');
  assert.deepEqual(JSON.parse(match[1]), expectedHeaders);
  assert.match(html, /<tbody id="internRecruitmentTableBody"><\/tbody>/);
  assert.doesNotMatch(html, /<script[^>]+id="internRecruitmentEmbeddedData"/);

  const tracked = spawnSync('git', ['ls-files'], { encoding: 'utf8' });
  assert.equal(tracked.status, 0, tracked.stderr);
  assert.doesNotMatch(tracked.stdout, /İGA Staj Başvuru Formu\.xlsx|IGA-Staj-Basvuru-Formu\.xlsx/);
});

test('Intern Recruitment import is isolated from the existing recruitment dataset', () => {
  const start = html.indexOf('async function handleInternRecruitmentFile');
  const end = html.indexOf('// NAVIGATION', start);
  assert.ok(start > 0 && end > start, 'missing isolated Intern Recruitment handler');
  const handler = html.slice(start, end);
  assert.doesNotMatch(handler, /state\.records|normalizePayload|applyPayload|renderAll/);
  assert.match(handler, /internRecruitmentTableHead"\)\.replaceChildren\(\)/);
  assert.match(handler, /internRecruitmentTableBody"\)\.replaceChildren\(\)/);
  assert.match(handler, /renderInternRecruitmentRawData\(matrix, file\.name\)/);
});
