import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const dashboardPath = 'frontend/analytics/dashboards/new-hr-collection/recruitment-analytics/index.html';

test('Recruitment dashboard embeds the committed dummy workbook deterministically', () => {
  const result = spawnSync('python3', ['scripts/hr/embed-recruitment-dummy-data.py', '--check'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /5000 rows from ise_alim_dummy_data\.xlsx/);
});

test('Recruitment embedded payload and visible metadata identify the dummy dataset', () => {
  const html = readFileSync(dashboardPath, 'utf8');
  const match = html.match(/<script id="igatsEmbeddedData" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(match, 'missing igatsEmbeddedData payload');
  const payload = JSON.parse(match[1]);
  assert.equal(payload.sourceFile, 'ise_alim_dummy_data.xlsx');
  assert.equal(payload.sheetName, 'db');
  assert.equal(payload.rows.length, 5000);
  assert.equal(payload.headers.length, 17);
  assert.match(html, /ise_alim_dummy_data\.xlsx · 5,000 Records/);
  assert.match(html, /visualizes 5,000 synthetic historical and active requisition lifecycle records/);
});
