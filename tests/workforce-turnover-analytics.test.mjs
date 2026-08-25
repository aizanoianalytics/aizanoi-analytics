import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const dataPath = 'frontend/analytics/workforce-turnover/data.json';
const data = JSON.parse(readFileSync(dataPath, 'utf8'));
const html = readFileSync('frontend/analytics/workforce-turnover/index.html', 'utf8');
const app = readFileSync('frontend/analytics/workforce-turnover/app.js', 'utf8');
const generator = readFileSync('analytics/workforce-turnover/generate_data.py', 'utf8');
const readme = readFileSync('analytics/workforce-turnover/README.md', 'utf8');

const cellKey = (row) => [row.month, row.region, row.department, row.contractType].join('|');

test('public turnover product ships a documented static application', () => {
  for (const file of ['index.html', 'style.css', 'app.js', 'data.json']) {
    assert.ok(existsSync(`frontend/analytics/workforce-turnover/${file}`), `${file} missing`);
  }
  assert.match(html, /100% synthetic data/i);
  assert.match(html, /No employer records\. No employees\. No direct identifiers\./i);
  assert.match(html, /Source/);
  assert.match(html, /Methodology/);
  assert.match(readme, /not an anonymized or transformed employer dataset/i);
});

test('dataset contains only the declared aggregate contract', () => {
  assert.equal(data.privacy.granularity, 'aggregate');
  assert.equal(data.privacy.individualRecords, false);
  assert.deepEqual(data.privacy.directIdentifiers, []);
  assert.deepEqual(data.privacy.inputSources, []);
  assert.equal(data.monthly.length, 24 * 4 * 5 * 2);
  const monthlyKeys = ['month', 'region', 'department', 'contractType', 'startHeadcount', 'hires', 'exits', 'endHeadcount'];
  const reasonKeys = ['month', 'region', 'department', 'contractType', 'reason', 'count'];
  for (const row of data.monthly) assert.deepEqual(Object.keys(row), monthlyKeys);
  for (const row of data.exitReasons) assert.deepEqual(Object.keys(row), reasonKeys);
});

test('headcount accounting and exit-reason totals reconcile for every aggregate cell', () => {
  const reasonTotals = new Map();
  data.exitReasons.forEach((row) => reasonTotals.set(cellKey(row), (reasonTotals.get(cellKey(row)) || 0) + row.count));
  const seen = new Set();
  for (const row of data.monthly) {
    assert.equal(row.startHeadcount + row.hires - row.exits, row.endHeadcount);
    assert.equal(reasonTotals.get(cellKey(row)) || 0, row.exits);
    assert.ok(!seen.has(cellKey(row)), `duplicate aggregate cell ${cellKey(row)}`);
    seen.add(cellKey(row));
  }
});

test('generator is deterministic, input-free and intentionally aggregate-only', () => {
  assert.match(generator, /random\.Random\(SEED\)/);
  assert.match(generator, /SEED = 410225/);
  assert.doesNotMatch(generator, /read_excel|read_csv|openpyxl|pandas|requests|os\.environ|dotenv/i);
  assert.doesNotMatch(generator, /["'](?:name|personName|employeeId|email|phone|address|nationalId)["']\s*:/i);
});

test('public payload has no direct-identifier fields or contact-shaped strings', () => {
  const keys = [];
  const strings = [];
  const walk = (value) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (typeof value === 'string') strings.push(value);
    if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => { keys.push(key); walk(child); });
  };
  walk(data);
  assert.equal(keys.some((key) => /^(name|employeeId|email|phone|address|birthDate|nationalId)$/i.test(key)), false);
  for (const value of strings) {
    assert.doesNotMatch(value, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(value)) assert.ok(value.replace(/\D/g, '').length < 10, `contact-shaped number in ${value}`);
  }
});

test('dashboard computes the published formula and supports all declared filters', () => {
  assert.match(app, /row\.exits, 0\) \/ denominator \* 100/);
  assert.match(app, /startHeadcount \+ row\.endHeadcount/);
  for (const id of ['period', 'region', 'department', 'contract']) assert.match(app, new RegExp(`${id}: document\\.querySelector`));
  assert.match(app, /synthetic-workforce-turnover\.csv/);
  assert.doesNotMatch(app, /eval\(|new Function|innerHTML\s*=\s*location/i);
});
