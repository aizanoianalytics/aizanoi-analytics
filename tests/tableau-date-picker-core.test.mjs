import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCivilDate,
  formatCivilDate,
  toTableauRange,
  presetRange,
} from '../frontend/analytics/tableau/igahranalytics_date_picker/core/dates.js';
import {
  SCHEMA_VERSION,
  parseSettings,
  serializeSettings,
  resolveWorksheet,
} from '../frontend/analytics/tableau/igahranalytics_date_picker/core/settings.js';
import {
  applyMappings,
  clearMappings,
  createLatestQueue,
} from '../frontend/analytics/tableau/igahranalytics_date_picker/core/apply.js';
import { discoverWorksheets } from '../frontend/analytics/tableau/igahranalytics_date_picker/core/discovery.js';

const civil = (year, month, day) => ({ year, month, day });

test('civil dates reject UTC parsing traps and impossible values', () => {
  assert.deepEqual(parseCivilDate('2024-02-29'), civil(2024, 2, 29));
  for (const value of ['2023-02-29', '2024-13-01', '2024-04-31', '99-01-01', '1800-01-01', '2201-01-01', '']) {
    assert.throws(() => parseCivilDate(value), /date/i, value);
  }
});

test('date formatting supports Turkish and English without UTC conversion', () => {
  assert.equal(formatCivilDate(civil(2026, 10, 16), 'tr-TR'), '16.10.2026');
  assert.equal(formatCivilDate(civil(2026, 10, 16), 'en-US'), '10/16/2026');
});

test('Tableau DATETIME range includes the entire final local civil day', () => {
  const range = toTableauRange('2026-10-01', '2026-10-16', 'DATETIME');
  assert.equal(range.min.getFullYear(), 2026);
  assert.equal(range.min.getMonth(), 9);
  assert.equal(range.min.getDate(), 1);
  assert.deepEqual(
    [range.max.getFullYear(), range.max.getMonth(), range.max.getDate(), range.max.getHours(), range.max.getMinutes(), range.max.getSeconds(), range.max.getMilliseconds()],
    [2026, 9, 16, 23, 59, 59, 999],
  );
  assert.throws(() => toTableauRange('2026-10-17', '2026-10-16', 'DATE'), /start/i);
});

test('every preset has explicit inclusive calendar semantics', () => {
  const today = civil(2024, 3, 31);
  assert.deepEqual(presetRange('this-month', today), { start: '2024-03-01', end: '2024-03-31' });
  assert.deepEqual(presetRange('last-month', today), { start: '2024-02-01', end: '2024-02-29' });
  assert.deepEqual(presetRange('this-year', today), { start: '2024-01-01', end: '2024-03-31' });
  assert.deepEqual(presetRange('last-year', today), { start: '2023-01-01', end: '2023-12-31' });
  assert.deepEqual(presetRange('last-30-days', today), { start: '2024-03-02', end: '2024-03-31' });
  assert.deepEqual(presetRange('last-12-calendar-months', today), { start: '2023-04-01', end: '2024-03-31' });
  assert.equal(presetRange('custom', today), null);
});

test('settings migrate, recover corruption, and retain only non-sensitive schema fields', () => {
  const fallback = parseSettings('{broken');
  assert.equal(fallback.version, SCHEMA_VERSION);
  assert.deepEqual(fallback.targets, []);
  const migrated = parseSettings(JSON.stringify({ locale: 'en-US', mappings: [{ sheetName: 'A', fieldCaption: 'Date' }] }));
  assert.equal(migrated.version, SCHEMA_VERSION);
  assert.equal(migrated.locale, 'en-US');
  assert.deepEqual(migrated.targets[0], { worksheetId: '', worksheetName: 'A', fieldCaption: 'Date', fieldType: 'DATE', enabled: true, resetEnabled: true });
  const text = serializeSettings({ ...migrated, password: 'no', employeeRows: ['no'] });
  assert.ok(!text.includes('password'));
  assert.ok(!text.includes('employeeRows'));
});

test('worksheet resolution prefers object id and rejects ambiguous exact names', () => {
  const sheets = [{ id: '1', name: 'Summary' }, { id: '2', name: 'Summary' }, { id: '3', name: 'Exits' }];
  assert.equal(resolveWorksheet({ worksheetId: '2', worksheetName: 'old' }, sheets).id, '2');
  assert.equal(resolveWorksheet({ worksheetId: 'gone', worksheetName: 'Exits' }, sheets).id, '3');
  assert.equal(resolveWorksheet({ worksheetId: '', worksheetName: 'Summary' }, sheets), null);
});

test('discovery reads existing filter metadata only and returns DATE/DATETIME captions', async () => {
  const calls = [];
  const mkFilter = (caption, dataType) => ({
    fieldName: caption,
    async getFieldAsync() { calls.push(caption); return { name: caption, dataType }; },
  });
  const worksheets = [{ id: 'a', name: 'A', async getFiltersAsync() { return [mkFilter('Event Date', 'DATE'), mkFilter('Org', 'STRING')]; } }];
  const result = await discoverWorksheets(worksheets);
  assert.deepEqual(calls, ['Event Date', 'Org']);
  assert.deepEqual(result[0].fields, [{ caption: 'Event Date', dataType: 'DATE' }]);
});

function fixture({ fail = new Set(), verify = true } = {}) {
  let active = 0;
  let maxActive = 0;
  const calls = [];
  const sheets = ['a', 'b', 'c', 'excluded'].map((id) => ({
    id,
    name: id,
    async applyRangeFilterAsync(caption, range) {
      active += 1; maxActive = Math.max(maxActive, active);
      calls.push({ kind: 'apply', id, caption, range });
      await new Promise((resolve) => { setTimeout(resolve, id === 'a' ? 20 : 5); });
      active -= 1;
      if (fail.has(id)) throw new Error('synthetic failure');
    },
    async clearFilterAsync(caption) { calls.push({ kind: 'clear', id, caption }); },
    async getFiltersAsync() {
      if (!verify) throw new Error('metadata unavailable');
      return [{ fieldName: id === 'b' ? 'wrong' : ({ a: 'processing_time', b: 'report_date', c: 'exit_date' }[id]),
        minValue: new Date(2025, 0, 1), maxValue: new Date(2025, 2, 31, 23, 59, 59, 999) }];
    },
  }));
  const targets = [
    { worksheetId: 'a', worksheetName: 'a', fieldCaption: 'processing_time', fieldType: 'DATETIME', enabled: true, resetEnabled: true },
    { worksheetId: 'b', worksheetName: 'b', fieldCaption: 'report_date', fieldType: 'DATE', enabled: true, resetEnabled: false },
    { worksheetId: 'c', worksheetName: 'c', fieldCaption: 'exit_date', fieldType: 'DATE', enabled: true, resetEnabled: true },
  ];
  return { sheets, targets, calls, getMaxActive: () => maxActive };
}

test('apply maps per caption, caps concurrency at three, excludes sheets, and reports verification honestly', async () => {
  const f = fixture({ fail: new Set(['c']) });
  const results = await applyMappings({ worksheets: f.sheets, targets: f.targets, start: '2025-01-01', end: '2025-03-31', nullOption: 'NON_NULL_VALUES' });
  assert.equal(f.getMaxActive() <= 3, true);
  assert.deepEqual(f.calls.filter((call) => call.kind === 'apply').map(({ id, caption }) => [id, caption]), [
    ['a', 'processing_time'], ['b', 'report_date'], ['c', 'exit_date'],
  ]);
  assert.ok(!f.calls.some(({ id }) => id === 'excluded'));
  assert.deepEqual(results.map(({ status }) => status), ['applied-verified', 'mismatch', 'failed']);
});

test('retry targets only failed mappings and clear respects resetEnabled', async () => {
  const f = fixture();
  const retry = await applyMappings({ worksheets: f.sheets, targets: f.targets, start: '2025-01-01', end: '2025-03-31', nullOption: 'NON_NULL_VALUES', onlyWorksheetIds: new Set(['c']) });
  assert.deepEqual(retry.map(({ worksheetId }) => worksheetId), ['c']);
  await clearMappings({ worksheets: f.sheets, targets: f.targets });
  assert.deepEqual(f.calls.filter(({ kind }) => kind === 'clear').map(({ id, caption }) => [id, caption]), [['a', 'processing_time'], ['c', 'exit_date']]);
});

test('latest-wins queue serializes operations and drops superseded pending requests', async () => {
  const events = [];
  const queue = createLatestQueue(async (value) => {
    events.push(`start:${value}`);
    await new Promise((resolve) => { setTimeout(resolve, 12); });
    events.push(`end:${value}`);
    return value;
  });
  const first = queue.run('first');
  const second = queue.run('second');
  const latest = queue.run('latest');
  assert.equal(await first, 'first');
  assert.deepEqual(await second, { superseded: true });
  assert.equal(await latest, 'latest');
  assert.deepEqual(events, ['start:first', 'end:first', 'start:latest', 'end:latest']);
});
