import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboardPath = 'frontend/analytics/dashboards/new-hr-collection/recruitment-analytics/index.html';
const html = readFileSync(dashboardPath, 'utf8');

test('Intern HR panel exposes period selector, end-month picker and five export buttons', () => {
  assert.match(html, /id="internHrPanel"/);
  assert.match(html, /id="internPeriodSelect"/);
  assert.match(html, /id="internEndMonth"/);
  assert.match(html, /id="exportIsgBtn"[^>]*>📥 İSG Listesi Oluştur</);
  assert.match(html, /id="exportPozisyonBtn"[^>]*>📥 Pozisyon Kodu Listesi Oluştur</);
  assert.match(html, /id="exportKartBtn"[^>]*>📥 Kart Başvuru Listesi Oluştur</);
  assert.match(html, /id="exportHseBtn"[^>]*>📥 HSE Plus Listesi Oluştur</);
  assert.match(html, /id="exportBitisBtn"[^>]*>📥 Staj Bitiş Listesi Oluştur</);
});

test('Intern end-date engine skips weekends and Turkish public holidays', () => {
  assert.match(html, /function calcInternEndDate\(startDate, totalDays, weekdays\)/);
  assert.match(html, /const TR_HOLIDAYS = Object\.freeze\(\[/);
  for (const day of ['"2026-01-01"', '"2026-04-23"', '"2026-05-01"', '"2026-05-19"', '"2026-10-29"', '"2026-03-20"', '"2026-05-27"']) {
    assert.ok(html.includes(day), `missing holiday ${day}`);
  }
  assert.match(html, /function remainingText\(endDate/);
  assert.match(html, /Stajın bitmesine " \+ diff \+ " gün kaldı/);
  assert.match(html, /function parseTrDate\(value\)/);
  assert.match(html, /function parseWorkdays\(value\)/);
});

test('Intern table gains editable dropdowns, doc checkboxes and computed columns', () => {
  assert.match(html, /const INTERN_DROPDOWN_COLUMNS = Object\.freeze\(\["Kesinleşen Birim", "sorumlu", "Şirket"\]\)/);
  assert.match(html, /const INTERN_DOC_COLUMNS = Object\.freeze\(\[/);
  assert.match(html, /data-intern-edit=/);
  assert.match(html, /<option[^>]*>Alındı<\/option><option[^>]*>Eksik<\/option>/);
  assert.match(html, /"Hesaplanan Bitiş", "Kalan Gün"/);
  assert.match(html, /function renderInternRecruitmentRawData\(matrix, fileName\)/);
  assert.match(html, /renderInternRecruitmentRawData\(matrix, file\.name\)/);
});

test('Intern exports write the exact mail-spec column sets via local SheetJS', () => {
  assert.match(html, /\["Ad", "Soyad", "T\.C\. Kimlik Numarası", "E-mail", "Telefon", "Doğum Tarihi", "İkamet\/Konaklama Adresi", "Kesinleşen Departman", "Sorumlu", "Şirket"\]/);
  assert.match(html, /"Ünvan", "Anne Adı"/);
  assert.match(html, /"stajyer"/);
  assert.match(html, /"Yüksekte çalışacak mı\?", "Gürültülü ortamda çalışacak mı\?", "Kimyasal madde ile çalışacak mı\?", "Gece çalışacak mı\?"\]/);
  assert.match(html, /"Hayır", "Hayır", "Hayır", "Hayır"/);
  assert.match(html, /\["T\.C\. Kimlik Numarası", "Staj Başlangıç Tarihi", "Ad", "Soyad", "Staj Bitiş \/ Çıkış Tarihi"\]/);
  assert.match(html, /XLSX\.writeFile\(book, filename\)/);
  assert.match(html, /function exportIsgList\(\)/);
  assert.match(html, /function exportPozisyonList\(\)/);
  assert.match(html, /function exportKartList\(\)/);
  assert.match(html, /function exportHseList\(\)/);
  assert.match(html, /function exportBitisList\(\)/);
});

test('Intern HR panel stays local-only with no embedded applicant data', () => {
  assert.match(html, /yalnızca bu tarayıcıda/);
  assert.doesNotMatch(html, /<script[^>]+id="internRecruitmentEmbeddedData"/);
});
