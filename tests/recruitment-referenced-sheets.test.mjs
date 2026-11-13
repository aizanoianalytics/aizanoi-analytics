import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('frontend/analytics/dashboards/new-hr-collection/recruitment-analytics/index.html', 'utf8');
const name = 'Ref Adayları_28.09.2023 sonrası';
const headers = ['NO', 'CV İLETİLME TARİHİ', 'AD SOYAD', 'REFERANS', "CV'Yİ PAYLAŞAN", 'KAYNAK', 'ADAYA İLK TEMAS EDİLEN TARİH', '1.GÖRÜŞME TARİHİ', 'MÜLAKATI YAPAN İK', '2.GÖRÜŞME TARİHİ', 'MÜLAKATI YAPAN YÖNETİCİ', 'POZİSYON', 'MÜLAKAT SONUCU', 'GÖRÜŞME NOTU', 'KISA AÇIKLAMA', 'SONUÇ', 'MMPI', 'WALL STREET', 'SÖZLEŞME TÜRÜ', 'FİNAL', 'GERİ DÖNÜŞ TARİHİ', 'GERİ DÖNÜŞ'];
function parser() {
  const context = {};
  const start = html.indexOf('var XLSX={};function make_xlsx_lib');
  vm.runInNewContext(html.slice(start, html.indexOf('</script>', start)), context);
  const source = html.split('// REFERENCED SHEET PARSER START')[1]?.split('// REFERENCED SHEET PARSER END')[0];
  assert.ok(source);
  return { XLSX: context.XLSX, ...vm.runInNewContext(`${source}\n({parse: parseReferencedWorkbook, summarize: summarizeReferencedCategories})`, context) };
}
function book(XLSX, rows, header = headers) {
  const b = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(b, XLSX.utils.aoa_to_sheet([header, ...rows]), name);
  return b;
}
test('selected sheet alone imports without requiring other worksheets; notes preserve line breaks and markup as data', () => {
  const { XLSX, parse } = parser();
  const b = book(XLSX, [[1, '21.07.2023', 'Synthetic One', 'Ref', '', '', '', '', '', '', '', 'Pilot', 'OLUMLU', 'Line one\n<script>alert(1)</script>', '  second line  ', 'SÜREÇ DEVAM', '', '', '', 'OLUMLU']]);
  const result = parse(b);
  assert.deepEqual(Object.keys(result), [name]);
  assert.equal(result[name].rows[0].cells['GÖRÜŞME NOTU'], 'Line one\n<script>alert(1)</script>');
  assert.equal(result[name].rows[0].cells['KISA AÇIKLAMA'], '  second line  ');
});
test('375 selected candidates survive C100 and 1168 survive C1000; inflated formatting does not drive iteration', () => {
  const { XLSX, parse } = parser();
  for (const count of [375, 1168]) {
    const b = book(XLSX, Array.from({ length: count }, (_, i) => [i + 1, '', `Synthetic ${i + 1}`]));
    b.Sheets[name]['!ref'] = 'A1:V1048561';
    const start = performance.now();
    const rows = parse(b)[name].rows;
    assert.equal(rows.length, count);
    assert.equal(rows.at(-1).row, count + 1);
    assert.ok(performance.now() - start < 3000);
  }
});
test('invalid or missing selected sheet fails closed and tolerates trailing header whitespace', () => {
  const { XLSX, parse } = parser();
  const b = book(XLSX, [[1, '', 'Synthetic']], headers.map(h => h === 'KISA AÇIKLAMA' ? 'KISA AÇIKLAMA  ' : h));
  assert.equal(parse(b)[name].rows.length, 1);
  assert.throws(() => parse({ Sheets: {} }), /Ref Adayları/);
  assert.throws(() => parse(book(XLSX, [[1, '', 'Synthetic']], ['wrong'])), /başlık|şema/i);
});
test('typed Excel dates remain usable for contact, interview and callback metrics', () => {
  const { XLSX, parse } = parser();
  const b = book(XLSX, [[1, '2024-01-15', 'Synthetic', '', '', '', '', '', '', 'MUAF']]);
  for (const [address, day] of [['G2',16], ['H2',17], ['U2',18]]) b.Sheets[name][address] = { t: 'd', v: new Date(2024, 0, day) };
  b.Sheets[name]['!ref'] = 'A1:V2';
  const row = parse(b)[name].rows[0];
  assert.match(row.cells['ADAYA İLK TEMAS EDİLEN TARİH'], /^2024-01-16/);
  assert.match(row.cells['1.GÖRÜŞME TARİHİ'], /^2024-01-17/);
  assert.match(row.cells['GERİ DÖNÜŞ TARİHİ'], /^2024-01-18/);
  assert.equal(row.cells['2.GÖRÜŞME TARİHİ'], 'MUAF');
});

test('category charts include top ten plus all remaining and blank categories', () => {
  const { summarize } = parser();
  const categories = summarize(Array.from({length: 25}, (_, i) => ({value: `Role ${i}`})), 'value');
  assert.equal(categories.length, 11);
  assert.equal(categories.at(-1)[1], 15);
  assert.equal(categories.reduce((sum, [, count]) => sum + count, 0), 25);
  assert.equal(summarize([{value: ''}], 'value')[0][0], 'Belirtilmemiş');
});
test('time trend retains every month in chronological order rather than only the ten busiest', () => {
  const { summarize } = parser();
  const months = Array.from({length: 18}, (_, i) => ({ value: `${2024 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}` }));
  assert.equal(summarize(months, 'value', Infinity).length, 18);
  assert.match(html, /summarizeReferencedCategories\(items, "value", id === "#referencedTrendChart" \? Infinity : 10\)/);
});

test('one top navigation tab leads to rich private candidate dashboard, not duplicate import charts', () => {
  assert.match(html, /data-view="reference-recent"/);
  assert.ok(!html.includes('data-view="reference-all"'));
  assert.match(html, /id="referencedSearch"/);
  assert.match(html, /id="referencedDetail"[^>]*role="dialog"/);
  assert.match(html, /id="referencedReferrerChart"/);
  assert.match(html, /id="referencedTrendChart"/);
  assert.match(html, /id="referencedKpis"/);
  assert.match(html, /id="referencedTable"/);
  assert.match(html, /id="referencedPrev"/);
  assert.match(html, /textContent = value/);
  assert.ok(!html.includes('id="referencedSheetSelect"'));
});
