import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('frontend/analytics/dashboards/new-hr-collection/recruitment-analytics/index.html', 'utf8');
function parser() {
  const context = {};
  const start = html.indexOf('var XLSX={};function make_xlsx_lib');
  vm.runInNewContext(html.slice(start, html.indexOf('</script>', start)), context);
  const source = html.split('// REFERENCED SHEET PARSER START')[1]?.split('// REFERENCED SHEET PARSER END')[0];
  assert.ok(source);
  return vm.runInNewContext(`${source}\n({parse: parseReferencedWorkbook, filter: (typeof filterReferencedRows === 'undefined' ? null : filterReferencedRows), options: (typeof referencedFilterOptions === 'undefined' ? null : referencedFilterOptions), quality: (typeof analyzeReferencedQuality === 'undefined' ? null : analyzeReferencedQuality), year: (typeof referencedYear === 'undefined' ? null : referencedYear)})`, context);
}
function row(cells, extra = {}) {
  return { name: cells['AD SOYAD'] || '', ref: cells['REFERANS'] || '', position: cells['POZİSYON'] || '', result: cells['SONUÇ'] || '', row: 2, cells, date: cells['CV İLETİLME TARİHİ'] || '', ...extra };
}

test('combined filters narrow rows by position, SONUÇ, CV year and reference', () => {
  const { filter } = parser();
  assert.ok(filter, 'filterReferencedRows helper exists');
  const rows = [
    row({ 'AD SOYAD': 'A', 'REFERANS': 'R1', 'POZİSYON': 'Pilot', 'SONUÇ': 'OLUMLU', 'CV İLETİLME TARİHİ': '2024-03-05' }),
    row({ 'AD SOYAD': 'B', 'REFERANS': 'R2', 'POZİSYON': 'Mühendis', 'SONUÇ': '', 'CV İLETİLME TARİHİ': '2023-05-01' }),
    row({ 'AD SOYAD': 'C', 'REFERANS': 'R1', 'POZİSYON': 'Pilot', 'SONUÇ': 'OLUMSUZ', 'CV İLETİLME TARİHİ': '2024-06-01' }),
  ];
  assert.equal(filter(rows, {}).length, 3);
  assert.equal(filter(rows, { position: 'Pilot' }).length, 2);
  assert.equal(filter(rows, { result: 'OLUMLU' }).length, 1);
  assert.equal(filter(rows, { year: '2024' }).length, 2);
  assert.equal(filter(rows, { ref: 'R1', position: 'Pilot', year: '2024' }).length, 2);
  assert.equal(filter(rows, { q: 'mühendis' }).length, 1);
  assert.equal(filter(rows, { position: 'Pilot', result: 'OLUMLU' }).length, 1);
});

test('numeric Excel serials survive as text in date cells for year filter and quality', () => {
  const { filter, quality, year } = parser();
  assert.equal(year(45494), '2024');
  assert.equal(year('45494'), '2024');
  const rows = [
    row({ 'AD SOYAD': 'Serial', 'CV İLETİLME TARİHİ': '45494', 'ADAYA İLK TEMAS EDİLEN TARİH': '45495' }),
  ];
  assert.equal(filter(rows, { year: '2024' }).length, 1);
  const report = quality(rows, { today: '2024-06-01' });
  assert.equal(report.counts.withIssues, 1);
  assert.ok(report.issues[0].types.some(t => /Gelecek/.test(t)), 'serial July 2024 after June today is future, not invalid');
  assert.ok(!report.issues[0].types.some(t => /Geçersiz|Eksik/.test(t)));
});

test('blank SONUÇ stays distinct from YAPILMADI and MUAF in filter options', () => {
  const { options } = parser();
  assert.ok(options, 'referencedFilterOptions helper exists');
  const rows = [
    row({ 'AD SOYAD': 'A', 'REFERANS': 'R', 'POZİSYON': 'P', 'SONUÇ': '' }),
    row({ 'AD SOYAD': 'B', 'REFERANS': 'R', 'POZİSYON': 'P', 'SONUÇ': 'YAPILMADI' }),
    row({ 'AD SOYAD': 'C', 'REFERANS': 'R', 'POZİSYON': 'P', 'SONUÇ': 'MUAF' }),
  ];
  const opts = options(rows);
  assert.ok(opts.results.includes('YAPILMADI'));
  assert.ok(opts.results.includes('MUAF'));
  assert.ok(!opts.results.includes('') || opts.blanks >= 1);
});

test('quality analysis flags missing dates and reversed chronology without punishing YAPILMADI/MUAF', () => {
  const { quality } = parser();
  assert.ok(quality, 'analyzeReferencedQuality helper exists');
  const rows = [
    row({ 'AD SOYAD': 'Ok', 'CV İLETİLME TARİHİ': '2024-01-01', 'ADAYA İLK TEMAS EDİLEN TARİH': '2024-01-02', '1.GÖRÜŞME TARİHİ': '2024-01-03', '2.GÖRÜŞME TARİHİ': 'MUAF', 'GERİ DÖNÜŞ TARİHİ': '2024-01-04' }),
    row({ 'AD SOYAD': 'Bad', 'CV İLETİLME TARİHİ': '2024-01-10', 'ADAYA İLK TEMAS EDİLEN TARİH': '2024-01-05', '1.GÖRÜŞME TARİHİ': '', '2.GÖRÜŞME TARİHİ': '', 'GERİ DÖNÜŞ TARİHİ': '' }),
  ];
  const report = quality(rows, { today: '2024-06-01' });
  const bad = report.issues.find(i => i.name === 'Bad');
  const ok = report.issues.find(i => i.name === 'Ok');
  assert.ok(bad, 'reversed/missing row flagged');
  assert.ok(bad.types.some(t => /sıra|ters|kronoloji/i.test(t)), 'chronology issue typed');
  assert.ok(!ok || !ok.types.some(t => /muaf/i.test(t)), 'MUAF not flagged as invalid');
  assert.ok(report.counts.total === 2);
});

test('filter bar and data-quality panel exist with clear/reset and visible counts', () => {
  for (const id of ['referencedPositionFilter', 'referencedResultFilter', 'referencedYearFilter', 'referencedRefFilter', 'referencedClearFilters', 'referencedFilteredCount', 'referencedQuality', 'referencedQualitySearch']) {
    assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
  }
});
