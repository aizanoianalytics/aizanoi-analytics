import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const publicDashboards = [
  'frontend/analytics/dashboards/hr-analytics-full-set/corporate-goals/index.html',
  'frontend/analytics/dashboards/hr-analytics-full-set/hr-administration-deep-dive/index.html',
  'frontend/analytics/dashboards/hr-analytics-full-set/hr-executive-board-current/index.html',
  'frontend/analytics/dashboards/hr-analytics-full-set/hr-executive-board-current/pdks_takip_dashboard.html',
  'frontend/analytics/dashboards/hr-analytics-full-set/hr-executive-board-full-history/index.html',
  'frontend/analytics/dashboards/hr-analytics-full-set/hr-executive-board-full-history/pdks_takip_dashboard.html',
  'frontend/analytics/dashboards/hr-analytics-full-set/learning-academy-analytics/index.html',
  'frontend/analytics/dashboards/hr-analytics-full-set/performance-hiring-turnover/index.html',
  'frontend/analytics/dashboards/hr-analytics-full-set/store-learning-compliance/index.html',
  'frontend/analytics/dashboards/hr-analytics-full-set/store-operations-tracking/index.html',
  'frontend/analytics/dashboards/hr-analytics-full-set/workforce-time-attendance/index.html',
  'frontend/analytics/dashboards/hr-analytics-full-set/workforce-turnover/index.html',
];

const pipeline = resolve('analytics/dashboards/hr-analytics-full-set/production-pipeline');

function collectWorkbookNames(directory, names = new Set()) {
  let entries = [];
  try { entries = readdirSync(directory, { withFileTypes:true }); } catch { return names; }
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) collectWorkbookNames(path, names);
    else if (entry.isFile() && /\.xlsx$/i.test(entry.name)) names.add(entry.name);
  }
  return names;
}

const internalWorkbookNames = collectWorkbookNames(pipeline);
internalWorkbookNames.add('icmal_sorgu_sonuc.xlsx');

const prohibitedIdentifiers = [
  { category:'vendor', label:'Arvato vendor identifier', pattern:/\bArvato\b/i },
  { category:'partner', label:'Tekno partner identifier', pattern:/\bTekno\b/i },
  { category:'company', label:'Ayaydın company identifier', pattern:/\bAyaydın\b/i },
];
const identityMetadata = /"(company|brand|vendor|partner|customer|client|project)(?:_name|_id|_code)"\s*:\s*"([^"]+)"/gi;
const personMetadata = /"(employee_name|person_name|contact_name|manager_name)"\s*:\s*"([^"]+)"/gi;
const allowedSyntheticIdentity = /^(?:aizanoi|aurelia|borealis|cyrene|synthetic|example|generic|logistics|lojistik|external|harici|corporate|kurumsal|employee\b|person\b)/i;
const emailPattern = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
const allowedEmailDomain = /(?:^|\.)(?:example\.com|example\.org|example\.net|aizanoi\.test|invalid)$/i;

function scanIdentityMetadata(html, file) {
  for (const match of html.matchAll(identityMetadata)) {
    const [, key, value] = match;
    assert.match(value.trim(), allowedSyntheticIdentity, `${file} exposes non-synthetic ${key} identity metadata: ${value}`);
  }
  for (const match of html.matchAll(personMetadata)) {
    const [, key, value] = match;
    assert.match(value.trim(), allowedSyntheticIdentity, `${file} exposes person identity metadata in ${key}: ${value}`);
  }
  for (const match of html.matchAll(emailPattern)) {
    assert.match(match[1], allowedEmailDomain, `${file} exposes non-fixture email address`);
  }
}

test('public generated HR dashboards contain no prohibited identity/source identifiers', () => {
  for (const file of publicDashboards) {
    const html = readFileSync(file, 'utf8');
    for (const rule of prohibitedIdentifiers) assert.doesNotMatch(html, rule.pattern, `${file} exposes ${rule.category}: ${rule.label}`);
    for (const workbook of internalWorkbookNames) {
      assert.equal(html.toLocaleLowerCase('en-US').includes(workbook.toLocaleLowerCase('en-US')), false, `${file} exposes internal workbook ${workbook}`);
    }
    assert.doesNotMatch(html, /"source_file"\s*:\s*"[^"]*\.xlsx"/i, `${file} exposes source_file workbook metadata`);
    assert.doesNotMatch(html, /"(?:source|fiili_source)"\s*:\s*"[^"]*\.xlsx"/i, `${file} exposes source workbook metadata`);
    scanIdentityMetadata(html, file);
  }
});

test('HR public identity policy covers person/email/company/brand/vendor/customer/project classes without generic xlsx false positives', () => {
  const sanitizer = readFileSync('scripts/hr/sanitize-public-dashboard.mjs', 'utf8');
  for (const token of ['company','brand','vendor','partner','customer','client','project','employee_name','person_name','contact_name','manager_name','emailPattern']) {
    assert.match(sanitizer, new RegExp(token), `sanitizer should cover ${token}`);
  }
  assert.match(sanitizer, /workbookBasenames/);
  assert.match(sanitizer, /collectWorkbookBasenames/);
  assert.match(sanitizer, /source_file\|source\|fiili_source/);
  assert.match(sanitizer, /parser\/regex literals/);
  assert.doesNotMatch(sanitizer, /assert\.doesNotMatch\([^\n]*\/\\\.xlsx\//, 'sanitizer must not ban every .xlsx literal indiscriminately');
});
