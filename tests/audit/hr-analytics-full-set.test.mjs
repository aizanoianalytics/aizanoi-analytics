import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const sourceRoot = 'analytics/dashboards/hr-analytics-full-set';
const pipelineRoot = `${sourceRoot}/production-pipeline`;
const publicRoot = 'frontend/analytics/dashboards/hr-analytics-full-set';
const manifest = JSON.parse(readFileSync(`${sourceRoot}/pipeline-manifest.json`, 'utf8'));
const catalog = readFileSync(`${publicRoot}/index.html`, 'utf8');
const dashboardIds = [
  'hr-executive-board-full-history', 'hr-executive-board-current', 'hr-administration-deep-dive',
  'store-operations-tracking', 'workforce-turnover', 'store-learning-compliance',
  'learning-academy-analytics', 'performance-hiring-turnover', 'corporate-goals',
  'workforce-time-attendance',
];
const expectedControlCounts = new Map([
  ['hr-executive-board-full-history', 136], ['hr-executive-board-current', 136],
  ['hr-administration-deep-dive', 13], ['store-operations-tracking', 59],
  ['workforce-turnover', 43], ['store-learning-compliance', 6],
  ['learning-academy-analytics', 46], ['performance-hiring-turnover', 45],
  ['corporate-goals', 13], ['workforce-time-attendance', 63],
]);
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

test('manifest locks the complete original production contract', () => {
  assert.equal(manifest.dataPolicy, 'synthetic-only');
  assert.equal(manifest.sourceWorkbookCount, 27);
  assert.equal(manifest.pythonModuleCount, 22);
  assert.equal(manifest.pipelineStageCount, 10);
  assert.equal(manifest.dashboardCount, 10);
  assert.equal(manifest.publicDashboardCount, 10);
  assert.equal(manifest.sourceParity, 'normalized-text-and-ast-equal');
  assert.equal(manifest.dashboardSurfaceParity, 'exact');
  assert.deepEqual(manifest.dashboards.map(({ id }) => id), dashboardIds);
  assert.deepEqual(manifest.pipeline.map(({ order }) => order), [1,2,3,4,5,6,7,8,9,10]);
});

test('all 27 synthetic inputs and all 22 production modules are present', () => {
  const workbooks = readdirSync(pipelineRoot).filter((name) => name.endsWith('.xlsx'));
  const modules = readdirSync(pipelineRoot).filter((name) => name.endsWith('.py'));
  assert.equal(workbooks.length, 27);
  assert.equal(modules.length, 22);
  for (const file of workbooks) assert.ok(statSync(`${pipelineRoot}/${file}`).size > 4_000, `${file} is unexpectedly small`);
  for (const required of ['run_full_pipeline.py', 'hr_data_pipeline.py', 'refresh_data.py', 'generate_turnover_dashboard.py', 'generate_pdks_dashboard.py']) {
    assert.ok(modules.includes(required), `${required} missing`);
  }
});

test('unchanged ten-stage orchestration remains explicit', () => {
  const source = readFileSync(`${pipelineRoot}/run_full_pipeline.py`, 'utf8');
  for (const stage of ['icmal', 'dashboard', 'admin', 'magaza', 'turnover', 'uyum', 'akademi', 'performans', 'hedefler', 'pdks']) {
    assert.match(source, new RegExp(`['"]${stage}['"]`), `${stage} stage missing`);
  }
  for (const script of ['hr_data_pipeline.py', 'refresh_data.py', 'generate_admin_panel.py', 'generate_magaza_takip_panel.py', 'generate_turnover_dashboard.py', 'generate_magaza_uyum_dashboard.py', 'generate_akademi_dashboard.py', 'generate_performans_dashboard.py', 'generate_hedefler_dashboard.py', 'generate_pdks_dashboard.py']) {
    assert.match(source, new RegExp(script.replaceAll('.', '\\.')));
  }
});

test('all ten original dashboard interaction surfaces are published intact', () => {
  for (const id of dashboardIds) {
    const file = `${publicRoot}/${id}/index.html`;
    assert.ok(existsSync(file), `${id} public route missing`);
    assert.ok(statSync(file).size > 25_000, `${id} output is unexpectedly shallow`);
    const html = readFileSync(file, 'utf8');
    assert.match(html, /<style\b/i);
    assert.match(html, /<script\b/i);
    assert.doesNotMatch(html, /ipekyol|erduran/i);
    for (const email of html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []) {
      assert.match(email, /@example\.test$/i, `${id} contains a non-test email: ${email}`);
    }
  }
});

test('public HR dashboards remain self-contained under the route-scoped CSP', () => {
  for (const id of dashboardIds) {
    const html = readFileSync(`${publicRoot}/${id}/index.html`, 'utf8');
    assert.doesNotMatch(html, /fonts\.(?:googleapis|gstatic)\.com/i, `${id} depends on an external font provider`);
  }
});

test('HTML-aware parser locks the exact original control counts', () => {
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const script = [
    'import importlib.util,json,pathlib',
    "p=pathlib.Path('analytics/dashboards/hr-analytics-full-set/tools/verify_dashboard_parity.py')",
    "s=importlib.util.spec_from_file_location('surface',p)",
    'm=importlib.util.module_from_spec(s)',
    's.loader.exec_module(m)',
    "root=pathlib.Path('frontend/analytics/dashboards/hr-analytics-full-set')",
    `ids=${JSON.stringify(dashboardIds)}`,
    "print(json.dumps({i:m.inspect(root/i/'index.html')['control_count'] for i in ids}))",
  ].join(';');
  const actual = JSON.parse(execFileSync(python, ['-c', script], { encoding: 'utf8' }));
  assert.deepEqual(actual, Object.fromEntries(expectedControlCounts));
});

test('catalog exposes every dashboard and accurately describes the full pipeline', () => {
  for (const dashboard of manifest.dashboards) {
    assert.match(catalog, new RegExp(dashboard.route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(existsSync(`${sourceRoot}/${dashboard.id}/README.md`));
    assert.ok(dashboard.capabilities.length >= 4);
  }
  assert.match(catalog, /10<\/strong><span>original dashboard surfaces/i);
  assert.match(catalog, /27<\/strong><span>synthetic source workbooks/i);
  assert.match(catalog, /22<\/strong><span>parity-verified Python modules/i);
  assert.match(catalog, /same 10-stage Python line/i);
  assert.match(catalog, /0<\/strong><span>real employer or employee records/i);
});

test('download exactly matches the integrated pipeline output', () => {
  const integrated = `${pipelineRoot}/dashboardlar/icmal_sorgu_sonuc.xlsx`;
  const download = `${publicRoot}/downloads/hr-analytics-full-set-synthetic-output.xlsx`;
  assert.ok(statSync(download).size > 5_000_000);
  assert.equal(sha256(download), sha256(integrated));
});

test('executive boards retain their original embedded time-attendance dependency', () => {
  const canonical = `${publicRoot}/workforce-time-attendance/index.html`;
  const generator = readFileSync(`${pipelineRoot}/generate_pdks_dashboard.py`, 'utf8');
  assert.doesNotMatch(`${generator}\n${readFileSync(canonical, 'utf8')}`, /Taner Kerti|\b10007\b/i,
    'former employee example identity remains in the PDKS template');
  assert.doesNotMatch(generator, /\b(?:2208|14794|10373|10723|1076)\b/,
    'former employee exclusion identifiers remain in the PDKS source');
  assert.match(generator, /99000007 veya Synthetic Employee 0007/);
  assert.match(generator, /99990001.*99990005/);
  for (const id of ['hr-executive-board-full-history', 'hr-executive-board-current']) {
    const page = readFileSync(`${publicRoot}/${id}/index.html`, 'utf8');
    const embedded = `${publicRoot}/${id}/pdks_takip_dashboard.html`;
    assert.match(page, /src="pdks_takip_dashboard\.html"/);
    assert.ok(existsSync(embedded), `${id} embedded PDKS dependency missing`);
    assert.equal(sha256(embedded), sha256(canonical), `${id} embeds a divergent PDKS build`);
  }
});

test('synthetic generation is deterministic and spreadsheet-tool backed', () => {
  const generator = readFileSync(`${sourceRoot}/tools/generate_synthetic_source_workbooks.mjs`, 'utf8');
  assert.match(generator, /@oai\/artifact-tool/);
  assert.match(generator, /Synthetic Employee/);
  assert.match(generator, /example\.test/);
  assert.match(generator, /99000001/);
  assert.doesNotMatch(generator, /ipekyol|erduran/i);
  assert.ok([...generator.matchAll(/\.xlsx/g)].length >= 27);
});

test('documentation states parity and the zero-real-data release boundary', () => {
  const readme = readFileSync(`${sourceRoot}/README.md`, 'utf8');
  assert.match(readme, /not a simplified reimplementation/i);
  assert.match(readme, /22 Python modules preserve the original algorithms/i);
  assert.match(readme, /27 source workbooks are fully synthetic/i);
  assert.match(readme, /Never replace the synthetic .* inputs/i);
  assert.doesNotMatch(`${catalog}\n${readme}\n${JSON.stringify(manifest)}`, /ipekyol|erduran/i);
});

test('legacy turnover route stays retired', () => {
  assert.equal(existsSync('frontend/analytics/workforce-turnover/index.html'), false);
  assert.doesNotMatch(JSON.stringify(manifest), /\/analytics\/workforce-turnover\//);
});
