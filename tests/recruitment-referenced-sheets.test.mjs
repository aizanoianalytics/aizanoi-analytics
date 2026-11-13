import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('frontend/analytics/dashboards/new-hr-collection/recruitment-analytics/index.html', 'utf8');
const first = 'Ref Adayları_28.09.2023 sonrası';
const second = 'TÜM REFERANSLI ADAYLAR';
const firstHeaders = ['NO', 'CV İLETİLME TARİHİ', 'AD SOYAD', 'REFERANS', "CV'Yİ PAYLAŞAN", 'KAYNAK', 'ADAYA İLK TEMAS EDİLEN TARİH', '1.GÖRÜŞME TARİHİ', 'MÜLAKATI YAPAN İK', '2.GÖRÜŞME TARİHİ', 'MÜLAKATI YAPAN YÖNETİCİ', 'POZİSYON', 'MÜLAKAT SONUCU', 'GÖRÜŞME NOTU', 'KISA AÇIKLAMA', 'SONUÇ', 'MMPI', 'WALL STREET', 'SÖZLEŞME TÜRÜ', 'FİNAL', 'GERİ DÖNÜŞ TARİHİ', 'GERİ DÖNÜŞ'];
const secondHeaders = ['NO', 'İLETİLME TARİHİ', 'AD SOYAD', 'REFERANS', "CV'Yİ PAYLAŞAN", 'GÖRÜŞME TARİHİ', 'POZİSYON', 'DEĞERLENDİRME SONUCU', 'DEĞERLENDİRME NOTU', 'FİNAL'];

function parser() {
  const context = {};
  const vendor = html.slice(html.indexOf('var XLSX={};function make_xlsx_lib'), html.indexOf('</script>', html.indexOf('var XLSX={};function make_xlsx_lib')));
  vm.runInNewContext(vendor, context);
  const source = html.split('// REFERENCED SHEET PARSER START')[1]?.split('// REFERENCED SHEET PARSER END')[0];
  assert.ok(source, 'referenced sheet parser is available');
  return { XLSX: context.XLSX, parse: vm.runInNewContext(`${source}\nparseReferencedWorkbook`, context) };
}
function book(XLSX, entries) {
  const b = XLSX.utils.book_new();
  for (const [name, headers, rows] of entries) XLSX.utils.book_append_sheet(b, XLSX.utils.aoa_to_sheet([headers, ...rows]), name);
  return b;
}

test('both exact selected sheets import as independent datasets without importing other sheets', () => {
  const { XLSX, parse } = parser();
  const workbook = book(XLSX, [['Other', ['NO'], [[100]]], [first, firstHeaders, [[1, '', 'First', 'Ref A', '', '', '', '', '', '', '', 'Pilot', 'Olumlu']]], [second, secondHeaders, [[2, '', 'Second', 'Ref B', '', '', 'Engineer', 'Uygun']]]]);
  const result = parse(workbook);
  assert.deepEqual(Object.keys(result), [first, second]);
  assert.equal(result[first].rows.length, 1);
  assert.equal(result[second].rows.length, 1);
  assert.equal(result[first].rows[0].name, 'First');
  assert.equal(result[second].rows[0].position, 'Engineer');
  assert.equal(result[first].rows[0].result, 'Olumlu');
  assert.equal(result[second].rows[0].result, 'Uygun');
});

test('inflated formatted range is bounded to populated applicant rows', () => {
  const { XLSX, parse } = parser();
  const workbook = book(XLSX, [[first, firstHeaders, [[1, '', 'First']]], [second, secondHeaders, [[2, '', 'Second']]]]);
  workbook.Sheets[first]['!ref'] = 'A1:V1048561';
  workbook.Sheets[second]['!ref'] = 'A1:DL1170';
  const started = performance.now();
  const result = parse(workbook);
  assert.equal(result[first].rows.length, 1);
  assert.equal(result[second].rows.length, 1);
  assert.ok(performance.now() - started < 3000, 'formatted million-row extent must not drive iteration');
});

test('missing or invalid selected sheet fails closed without replacing an earlier dataset', () => {
  const { XLSX, parse } = parser();
  const onlyFirst = book(XLSX, [[first, firstHeaders, [[1, '', 'First']]]]);
  assert.throws(() => parse(onlyFirst), /TÜM REFERANSLI ADAYLAR/);
  const malformed = book(XLSX, [[first, firstHeaders, [[1, '', 'First']]], [second, ['wrong'], [[2, '', 'Second']]]]);
  assert.throws(() => parse(malformed), /başlık|şema/i);
});

test('two selected sheets have a visible switch, dedicated charts and a bounded detail table', () => {
  assert.match(html, /id="referencedPanel"/);
  assert.match(html, /id="referencedSheetSelect"/);
  assert.match(html, /id="referencedPositionChart"/);
  assert.match(html, /id="referencedResultChart"/);
  assert.match(html, /id="referencedTable"/);
  assert.match(html, /referencedSheetSelect.*addEventListener\("change"/);
  assert.match(html, /kind: "referenced"/);
  assert.match(html, /textContent = .*name/);
});
