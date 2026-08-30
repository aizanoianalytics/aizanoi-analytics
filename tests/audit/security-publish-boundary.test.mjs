import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

function listDir(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      out.push(...listDir(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

test('public allowlist: every frontend/* file is a public web asset', () => {
  const files = listDir(path.join(repoRoot, 'frontend'));
  const offenders = files
    .map((p) => path.relative(repoRoot, p))
    .filter((rel) => !rel.startsWith('frontend' + path.sep));
  assert.deepEqual(offenders, [], `Non-public files inside frontend/: ${offenders.join(', ')}`);
});

test('repo source/build directories must not be tracked under frontend/', () => {
  const tracked = ['analytics', 'tests', 'docs', 'scripts', '.github', 'infra'];
  for (const dir of tracked) {
    const full = path.join(repoRoot, dir);
    if (!existsSync(full)) continue;
    assert.ok(
      !full.startsWith(path.join(repoRoot, 'frontend')),
      `${dir}/ must not live under frontend/`
    );
  }
});

// ---- Denylist (negative contract) ----

const DENY_PATTERNS = [/\.py$/, /\.xlsx$/, /\.mjs$/];
const ALLOWED_DOWNLOADS = [
  /frontend[\\/]analytics[\\/]dashboards[\\/]hr-analytics-full-set[\\/]downloads[\\/]hr-analytics-full-set-synthetic-output\.xlsx$/
];

const ALLOWED_JSON = [
  /\/manifest\.webmanifest$/,
  /\/sitemap\.xml$/,
  /\/news\/sitemap\.xml$/,
  /\/news\/index\.json$/,
  /\/news\/.+\/index\.json$/,
  /\/analytics\/.+\/data\.json$/,
  /\/js\/v3\/apps\/notepad\/manifest\.json$/
];

test('denylist: no source or workbook files enter frontend except the declared synthetic output download', () => {
  const files = listDir(path.join(repoRoot, 'frontend'));
  const offenders = files
    .map((p) => path.relative(repoRoot, p))
    .filter((rel) => DENY_PATTERNS.some((re) => re.test(rel)))
    .filter((rel) => !ALLOWED_DOWNLOADS.some((re) => re.test(rel)));
  assert.deepEqual(
    offenders,
    [],
    `Undeclared build/source artifacts leaked into frontend/: ${offenders.join(', ')}`
  );
});

test('denylist: pipeline-manifest.json never reaches frontend/', () => {
  const files = listDir(path.join(repoRoot, 'frontend'));
  const offenders = files
    .map((p) => path.relative(repoRoot, p))
    .filter((rel) => /\/pipeline-manifest\.json$/.test(rel));
  assert.deepEqual(
    offenders,
    [],
    `Build manifests leaked into frontend/: ${offenders.join(', ')}`
  );
});

test('denylist: HR Analytics Full Set per-dashboard README.md are build artifacts, not public', () => {
  const files = listDir(path.join(repoRoot, 'frontend'));
  const offenders = files
    .map((p) => path.relative(repoRoot, p))
    .filter((rel) => /\/dashboards\/hr-analytics-full-set\/[^/]+\/README\.md$/.test(rel));
  assert.deepEqual(
    offenders,
    [],
    `Generator README.md artifacts under frontend/: ${offenders.join(', ')}`
  );
});

test('JSON allow-list: every JSON inside frontend/ is on the public list', () => {
  const files = listDir(path.join(repoRoot, 'frontend')).filter((p) => p.endsWith('.json'));
  const offenders = files
    .map((p) => path.relative(repoRoot, p).replaceAll(path.sep, '/'))
    .filter((rel) => !ALLOWED_JSON.some((re) => re.test(rel)));
  assert.deepEqual(
    offenders,
    [],
    `Unexpected JSON files inside frontend/: ${offenders.join(', ')}`
  );
});

// ---- Deployment procedure contract ----

test('deploy procedure only mirrors frontend/ → webroot', () => {
  const script = path.join(repoRoot, 'scripts', 'deploy-public.sh');
  assert.ok(existsSync(script), `Missing deploy script: ${script}`);
  const body = readFileSync(script, 'utf8');
  assert.match(body, /\/opt\/aizanoi-analytics-public\/frontend/, 'Script must source from frontend/');
  assert.match(body, /\/var\/www\/aizanoianalytics\.com/, 'Script must target /var/www/aizanoianalytics.com');
  // Publish contract must be cwd-independent: rsync source is an absolute
  // path with a trailing slash, not a relative ./ that depends on the
  // caller's working directory.
  assert.match(body, /rsync\s+-a\s+--delete\s+"\$\{SOURCE\}\/"/, 'Script must use absolute-source rsync (cwd-independent)');
  assert.doesNotMatch(body, /rsync[^n]*\.\/\s+"?\$\{WEBROOT\}/, 'Script must not use ./ as rsync source (cwd-dependent)');
});

test('deploy is cwd-independent: same frontend/ → staging result from different cwds', { skip: process.platform === 'win32' }, async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { execFileSync } = await import('node:child_process');
  const source = path.join(repoRoot, 'frontend');
  const script = path.join(repoRoot, 'scripts', 'deploy-public.sh');
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'aizanoi-deploy-audit-'));
  const fromRoot = path.join(tempRoot, 'from-root');
  const fromNested = path.join(tempRoot, 'from-nested');
  const nestedCwd = path.join(repoRoot, 'tests', 'audit');

  try {
    execFileSync('bash', [script], { cwd: repoRoot, env: { ...process.env, SOURCE: source, WEBROOT: fromRoot } });
    execFileSync('bash', [script], { cwd: nestedCwd, env: { ...process.env, SOURCE: source, WEBROOT: fromNested } });

    const rootFiles = listDir(fromRoot).map((p) => path.relative(fromRoot, p)).sort();
    const nestedFiles = listDir(fromNested).map((p) => path.relative(fromNested, p)).sort();
    assert.deepEqual(nestedFiles, rootFiles, 'Deploy output must be identical regardless of caller cwd');
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

const dashboardDir = path.join(repoRoot, 'frontend', 'analytics', 'dashboards', 'hr-analytics-full-set');
const expectedDashboardRoutes = [
  'index.html',
  'hr-master/index.html',
  'personel-butce/index.html',
  'personel-maliyet/index.html',
  'organizasyon/index.html',
  'izin-devamsizlik/index.html',
  'ise-alim/index.html',
  'devir-orani/index.html',
  'performans/index.html',
  'egitim/index.html',
  'executive-overview/index.html',
];

test('webroot smoke: all 11 dashboard HTML routes exist under frontend/', () => {
  for (const rel of expectedDashboardRoutes) {
    assert.ok(existsSync(path.join(dashboardDir, rel)), `Missing public dashboard route: ${rel}`);
  }
});

test('legacy /analytics/workforce-turnover/ stays 404 (owner decision 2026-08-26)', () => {
  assert.equal(existsSync(path.join(repoRoot, 'frontend', 'analytics', 'workforce-turnover')), false);
});
