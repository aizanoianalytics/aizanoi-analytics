import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('frontend/analytics/dashboards/new-hr-collection/recruitment-analytics/index.html', 'utf8');

test('owner portable report is available without publishing its private dataset', () => {
  assert.match(html, /function buildMonthlyReportHtml\(opts\)/);
  const payload = JSON.parse(html.match(/<script id="igatsEmbeddedData" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(payload.sourceFile, 'ise_alim_dummy_data.xlsx');
  assert.equal(payload.rows.length, 5000);
  assert.equal(payload.settings, undefined, 'private portable settings must not ship');
});

test('report calculations aggregate events once and exclude unselected gaps', () => {
  const context = vm.createContext({ Date, Set, Map,
    state: { records: [
      { position_start_date: new Date(2025, 0, 1), offer_date: new Date(2025, 2, 31), hired_employee: 'QA One', lead_time_days: 89, responsible: 'REQ Alpha' },
      { position_start_date: new Date(2025, 1, 1), offer_date: new Date(2025, 1, 28), hired_employee: 'QA Gap', lead_time_days: 27, responsible: 'REQ Beta' },
      { position_start_date: new Date(2025, 2, 31), offer_date: new Date(2025, 2, 31), hired_employee: '', lead_time_days: 0, responsible: 'REQ Alpha' },
    ] },
    ct: { rows: [
      { firstDate: new Date(2025, 0, 1), startDate: new Date(2025, 2, 31), reached: 1, result: 'active' },
      { firstDate: new Date(2025, 1, 1), startDate: new Date(2025, 1, 28), reached: 1, result: 'active' },
    ] },
    internState: { rows: [0, 1, 2] },
    internRowComputedSafe: i => [
      { start: new Date(2024, 11, 1), end: new Date(2025, 3, 1) },
      { start: new Date(2025, 1, 1), end: new Date(2025, 1, 28) },
      { start: new Date(2025, 2, 1), end: new Date(2025, 2, 31) },
    ][i],
    internRowCancelled: () => false, internCell: () => 'QA',
    parseExcelDate: value => value || null, recordExcluded: () => false,
    hasHiredEmployee: value => !!value, isOpenStatus: () => false,
    text: value => value || '', fold: value => String(value || '').toLowerCase(),
    CT_STAGES: ['CV', 'Interview'],
  });
  const start = html.indexOf('    const mrFileName =');
  const end = html.indexOf('    // ---- Rapor HTML', start);
  vm.runInContext(`${html.slice(start, end)};globalThis.result={recruit:mrRecruitment(['2025-01','2025-03'],false),cand:mrCandidates(['2025-01','2025-03']),intern:mrInterns(['2025-01','2025-03'])};`, context);
  const { recruit, cand, intern } = context.result;
  assert.equal(recruit.cur.opened.length, 2);
  assert.equal(recruit.cur.offers.length, 2);
  assert.equal(recruit.cur.hired.length, 1);
  assert.equal(recruit.cur.lead, 44.5, 'average must be weighted over actual events');
  assert.equal(cand.seen.length, 1);
  assert.equal(cand.started.length, 1);
  assert.equal(intern.active.length, 2, 'one intern spanning both months counted once; gap-only intern excluded');
  assert.equal(intern.started.length, 1);
  assert.equal(intern.ended.length, 1);
});

function periods() {
  const start = html.indexOf('    function mrPeriodMonths(');
  const end = html.indexOf('    // ---- Görsel parçalar', start);
  assert.ok(start >= 0 && end > start, 'report period helpers must exist');
  const context = vm.createContext({ Date, Set });
  vm.runInContext(`${html.slice(start, end)};globalThis.api={mrPeriodMonths,mrPreviousMonths,mrInPeriod};`, context);
  return context.api;
}

test('quarter and year selections expand to complete calendar periods', () => {
  const p = periods();
  assert.deepEqual(Array.from(p.mrPeriodMonths('quarter', ['2025-Q4', '2026-Q1'])), ['2025-10','2025-11','2025-12','2026-01','2026-02','2026-03']);
  assert.equal(p.mrPeriodMonths('year', ['2024']).length, 12);
  assert.equal(p.mrInPeriod(new Date(2024, 1, 29, 23, 59), p.mrPeriodMonths('year', ['2024'])), true);
  assert.equal(p.mrInPeriod(new Date(2025, 0, 1), p.mrPeriodMonths('year', ['2024'])), false);
});

test('arbitrary months stay discontiguous, deduplicated and have a comparable prior period', () => {
  const p = periods();
  const months = p.mrPeriodMonths('month', ['2026-03','2025-12','2026-03']);
  assert.deepEqual(Array.from(months), ['2025-12','2026-03']);
  assert.equal(p.mrInPeriod(new Date(2026, 0, 1), months), false);
  assert.deepEqual(Array.from(p.mrPreviousMonths(['2026-01','2026-02','2026-03'])), ['2025-10','2025-11','2025-12']);
  assert.deepEqual(Array.from(p.mrPreviousMonths(months)), ['2025-08','2025-11']);
});
