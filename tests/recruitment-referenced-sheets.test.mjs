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

test('all 125 populated first-sheet candidates survive the C100 boundary', () => {
  const { XLSX, parse } = parser();
  const rows = Array.from({ length: 125 }, (_, i) => [i + 1, '', `Synthetic ${i + 1}`]);
  const workbook = book(XLSX, [[first, firstHeaders, rows], [second, secondHeaders, [[1, '', 'Second']]]]);
  const result = parse(workbook);
  assert.equal(result[first].rows.length, 125);
  assert.equal(result[first].rows.at(-1).name, 'Synthetic 125');
  assert.equal(result[first].rows.at(-1).row, 126);
  assert.equal(result[second].rows.length, 1);
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

test('charts retain every candidate by grouping categories beyond the first ten', () => {
  const source = html.split('// REFERENCED SHEET PARSER START')[1]?.split('// REFERENCED SHEET PARSER END')[0];
  const summarize = vm.runInNewContext(`${source}\nsummarizeReferencedCategories`, {});
  const rows = Array.from({ length: 25 }, (_, i) => ({ position: `Role ${i + 1}` }));
  const categories = summarize(rows, 'position');
  assert.equal(categories.length, 11);
  assert.equal(categories.at(-1)[0], 'Diğer (15 kategori)');
  assert.equal(categories.at(-1)[1], 15);
  assert.equal(categories.reduce((sum, [, count]) => sum + count, 0), rows.length);
  assert.equal(summarize([], 'position').length, 0);
  assert.equal(summarize([{ position: '' }], 'position')[0][0], 'Belirtilmemiş');
  assert.match(html, /Math\.max\(\.\.\.categories\.map\(\(\[, value\]\) => value\)\)/, 'rollup bars must scale against the largest displayed category');
});

test('missing or invalid selected sheet fails closed without replacing an earlier dataset', () => {
  const { XLSX, parse } = parser();
  const onlyFirst = book(XLSX, [[first, firstHeaders, [[1, '', 'First']]]]);
  assert.throws(() => parse(onlyFirst), /TÜM REFERANSLI ADAYLAR/);
  const malformed = book(XLSX, [[first, firstHeaders, [[1, '', 'First']]], [second, ['wrong'], [[2, '', 'Second']]]]);
  assert.throws(() => parse(malformed), /başlık|şema/i);
});

test('sheet choices stay short on mobile while exact worksheet names remain their values', () => {
  assert.match(html, /<option value="Ref Adayları_28\.09\.2023 sonrası">2023 sonrası adaylar<\/option>/);
  assert.match(html, /<option value="TÜM REFERANSLI ADAYLAR">Tüm referanslı adaylar<\/option>/);
  assert.match(html, /referencedCount"\)\.textContent = .*\$\{name\}/);
});

test('successful import compacts the upload target so charts appear sooner on mobile', () => {
  assert.match(html, /#referencedDropzone\.is-loaded\s*\{[^}]*padding:/);
  assert.match(html, /#referencedDropzone\.is-loaded\s+\.drop-icon/);
  assert.match(html, /#referencedDropzone"\)\.classList\.add\("is-loaded"\)/);
  assert.match(html, /Başka Excel yükle/);
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
