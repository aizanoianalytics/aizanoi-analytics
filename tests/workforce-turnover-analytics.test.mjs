import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';

const dataPath = 'frontend/analytics/workforce-turnover/data.json';
const data = JSON.parse(readFileSync(dataPath, 'utf8'));
const html = readFileSync('frontend/analytics/workforce-turnover/index.html', 'utf8');
const app = readFileSync('frontend/analytics/workforce-turnover/app.js', 'utf8');
const style = readFileSync('frontend/analytics/workforce-turnover/style.css', 'utf8');
const generator = readFileSync('analytics/workforce-turnover/generate_data.py', 'utf8');
const readme = readFileSync('analytics/workforce-turnover/README.md', 'utf8');

const cellKey = (row) => [row.month, row.scope, row.region, row.site, row.department, row.division, row.city, row.gender, row.contractType, row.roleLevel].join('|');

test('full turnover centre ships a documented static v2 application', () => {
  for (const file of ['index.html', 'style.css', 'app.js', 'data.json']) assert.ok(existsSync(`frontend/analytics/workforce-turnover/${file}`), `${file} missing`);
  assert.equal(data.meta.version, '2.0.0');
  assert.match(html, /100% synthetic scenario/i);
  assert.match(html, /No real employer, business location or person/i);
  assert.match(readme, /not anonymised, transformed or derived records/i);
  assert.ok(statSync(dataPath).size < 5_000_000, 'public JSON should remain below 5 MB before transfer compression');
});

test('public dataset is deterministic fictional data with no input source', () => {
  assert.equal(data.meta.seed, 410225);
  assert.equal(data.privacy.synthetic, true);
  assert.equal(data.privacy.realPeople, false);
  assert.equal(data.privacy.realBusinesses, false);
  assert.deepEqual(data.privacy.directIdentifiers, []);
  assert.deepEqual(data.privacy.inputSources, []);
  assert.match(generator, /rng = random\.Random\(SEED\)/);
  assert.doesNotMatch(generator, /read_excel|read_csv|openpyxl|pandas|requests|os\.environ|dotenv|sqlite/i);
  assert.doesNotMatch(generator, /^\s*#/m);
  assert.doesNotMatch(app, /^\s*\/\//m);
});

test('monthly cube covers every declared analytical dimension', () => {
  assert.equal(data.monthly.length, 36 * 6 * 4 * 2 * 2 * 3);
  const keys = ['month', 'scope', 'region', 'site', 'department', 'division', 'city', 'gender', 'contractType', 'roleLevel', 'startHeadcount', 'hires', 'exits', 'endHeadcount'];
  const seen = new Set();
  for (const row of data.monthly) {
    assert.deepEqual(Object.keys(row), keys);
    assert.equal(row.startHeadcount + row.hires - row.exits, row.endHeadcount);
    assert.ok(!seen.has(cellKey(row)), `duplicate monthly cell ${cellKey(row)}`);
    seen.add(cellKey(row));
  }
});

test('synthetic exit events reconcile to every aggregate cell', () => {
  const totals = new Map();
  for (const row of data.exits) {
    assert.match(row.profileId, /^SIM-\d{5}$/);
    assert.equal(row.syntheticProfile, true);
    totals.set(cellKey(row), (totals.get(cellKey(row)) || 0) + 1);
  }
  for (const row of data.monthly) assert.equal(totals.get(cellKey(row)) || 0, row.exits, `exit mismatch in ${cellKey(row)}`);
  assert.equal(new Set(data.exits.map((row) => row.profileId)).size, data.exits.length);
});

test('forecast, survival and risk datasets publish complete synthetic contracts', () => {
  assert.equal(data.forecasts.length, 4 * 6);
  assert.equal(data.backtestSummary.length, 4);
  assert.equal(data.annualBacktest.length, 4 * 2);
  assert.equal(data.survivalCurve.length, 4 * 21);
  assert.equal(data.survivalSummary.length, 4);
  assert.equal(data.riskLocations.length, 6);
  assert.equal(data.riskProfiles.length, 180);
  assert.ok(data.forecasts.every((row) => row.lowerRate <= row.forecastRate && row.forecastRate <= row.upperRate));
  assert.ok(data.survivalCurve.every((row) => row.survivalProbability >= 0 && row.survivalProbability <= 1));
  assert.ok(data.riskProfiles.every((row) => /^RISK-\d{4}$/.test(row.profileId) && row.syntheticProfile === true));
});

test('interface restores the original analytical feature families', () => {
  const tabs = ['overview', 'breakdown', 'comparison', 'forecast', 'early', 'exits', 'risk', 'settings'];
  for (const tab of tabs) assert.match(html, new RegExp(`data-tab="${tab}"`));
  for (const heading of ['Monthly turnover trend', 'Turnover heat map', 'Cumulative role turnover matrix', 'Forecast and confidence interval', 'Early exits by year', 'Exit detail', 'Regrettable turnover', 'Survival analysis', 'Synthetic profile risk detail', 'Exit reason classification']) assert.match(html, new RegExp(heading));
  for (const control of ['scopeFilter', 'typeFilter', 'startFilter', 'endFilter', 'regionFilter', 'siteFilter', 'departmentFilter', 'divisionFilter', 'cityFilter', 'genderFilter', 'contractFilter', 'roleFilter']) assert.match(html, new RegExp(`id="${control}"`));
  assert.match(style, /\.tabs\{/);
  assert.match(style, /@media\(max-width:520px\)/);
});

test('dashboard preserves cumulative formula, numerator classification and exports', () => {
  assert.match(app, /const denominator = valid\.length \? valid\.reduce\(\(total, row\) => total \+ averageWorkforce\(row\), 0\) \/ valid\.length/);
  assert.match(app, /return denominator \? sum\(rows, 'exits'\) \/ denominator : 0/);
  assert.match(app, /reasonOverrides\[exit\.reasonKey\]/);
  assert.match(app, /type === 'all' \|\| reasonType\(row\) === type/);
  assert.match(app, /smartTable\(\$\('#exitTable'\)/);
  assert.match(app, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(app, /synthetic-turnover-\$\{state\.tab\}\.csv/);
  assert.doesNotMatch(app, /eval\(|new Function|innerHTML\s*=\s*location/i);
});

test('public payload and implementation contain no former identity or direct identifier', () => {
  const payload = readFileSync(dataPath, 'utf8');
  const publicSource = `${payload}\n${html}\n${app}\n${style}\n${generator}\n${readme}`;
  const formerIdentities = [new RegExp(['ipek', 'yol'].join(''), 'i'), new RegExp(['erdu', 'ran'].join(''), 'i')];
  for (const identity of formerIdentities) assert.doesNotMatch(publicSource, identity);
  assert.doesNotMatch(publicSource, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const forbiddenKeys = [];
  const walk = (value) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => { if (/^(name|employeeId|email|phone|address|birthDate|nationalId)$/i.test(key)) forbiddenKeys.push(key); walk(child); });
  };
  walk(data);
  assert.deepEqual(forbiddenKeys, []);
});
