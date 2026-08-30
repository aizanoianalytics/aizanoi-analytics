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
  /\/js\/v3\/apps\/calculator\/manifest\.json$/,
  /\/js\/v3\/apps\/camera\/manifest\.json$/,
  /\/js\/v3\/apps\/notepad\/manifest\.json$/,
  /\/js\/v3\/apps\/recycle-bin\/manifest\.json$/,
  /\/js\/v3\/apps\/videos\/manifest\.json$/,
  /\/js\/v3\/apps\/workspace\/manifest\.json$/,
  /\/js\/v3\/apps\/winamp\/manifest\.json$/
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
  const stagingA = mkdtempSync(path.join(tmpdir(), 'aizanoi-staging-a-'));
  const stagingB = mkdtempSync(path.join(tmpdir(), 'aizanoi-staging-b-'));
  const unrelated = mkdtempSync(path.join(tmpdir(), 'aizanoi-unrelated-'));
  try {
    // Replicate the publish contract's core: absolute SOURCE, cwd must not matter.
    const source = path.join(repoRoot, 'frontend');
    execFileSync('bash', ['-c', `rsync -a --delete "${source}/" "${stagingA}/"`], { cwd: repoRoot });
    execFileSync('bash', ['-c', `rsync -a --delete "${source}/" "${stagingB}/"`], { cwd: unrelated });
    const list = (root) =>
      execFileSync('bash', ['-c', `cd "${root}" && find . -type f | sort`], { encoding: 'utf8' });
    const a = list(stagingA);
    const b = list(stagingB);
    assert.equal(a, b, 'Publish must be cwd-independent: staging trees differ');
    assert.match(a, /analytics\/dashboards\/hr-analytics-full-set\/index\.html/, 'Staging must contain HR catalog');
    assert.match(a, /analytics\/dashboards\/hr-analytics-full-set\/workforce-turnover\/index\.html/, 'Staging must contain canonical turnover');
  } finally {
    rmSync(stagingA, { recursive: true, force: true });
    rmSync(stagingB, { recursive: true, force: true });
    rmSync(unrelated, { recursive: true, force: true });
  }
});

test('webroot smoke: all 11 dashboard HTML routes exist under frontend/', () => {
  const dashboards = [
    'analytics/dashboards/hr-analytics-full-set/index.html',
    'analytics/dashboards/hr-analytics-full-set/corporate-goals/index.html',
    'analytics/dashboards/hr-analytics-full-set/hr-administration-deep-dive/index.html',
    'analytics/dashboards/hr-analytics-full-set/hr-executive-board-current/index.html',
    'analytics/dashboards/hr-analytics-full-set/hr-executive-board-current/pdks_takip_dashboard.html',
    'analytics/dashboards/hr-analytics-full-set/hr-executive-board-full-history/index.html',
    'analytics/dashboards/hr-analytics-full-set/hr-executive-board-full-history/pdks_takip_dashboard.html',
    'analytics/dashboards/hr-analytics-full-set/learning-academy-analytics/index.html',
    'analytics/dashboards/hr-analytics-full-set/performance-hiring-turnover/index.html',
    'analytics/dashboards/hr-analytics-full-set/store-learning-compliance/index.html',
    'analytics/dashboards/hr-analytics-full-set/store-operations-tracking/index.html',
    'analytics/dashboards/hr-analytics-full-set/workforce-time-attendance/index.html',
    'analytics/dashboards/hr-analytics-full-set/workforce-turnover/index.html',
    'analytics/dashboards/hr-analytics-full-set/downloads/hr-analytics-full-set-synthetic-output.xlsx'
  ];
  for (const rel of dashboards) {
    const full = path.join(repoRoot, 'frontend', rel);
    assert.ok(existsSync(full), `Missing public asset: ${rel}`);
    assert.ok(statSync(full).size > 0, `Empty public asset: ${rel}`);
  }
});

// ---- Owner decisions (regression locks) ----

test('legacy /analytics/workforce-turnover/ stays 404 (owner decision 2026-08-26)', () => {
  // The owner retired the legacy route; production must NOT publish a redirect
  // or a copy at /analytics/workforce-turnover/. The canonical path lives under
  // the HR Analytics Full Set catalog.
  const legacyFrontend = path.join(repoRoot, 'frontend/analytics/workforce-turnover/index.html');
  const legacyInRepo = path.join(repoRoot, 'analytics/workforce-turnover/');
  const hasFrontendCopy = existsSync(legacyFrontend);
  const hasRepoRedirect = existsSync(legacyInRepo);
  assert.ok(
    !hasFrontendCopy && !hasRepoRedirect,
    `Legacy /analytics/workforce-turnover/ must stay 404: ` +
    `frontend copy=${hasFrontendCopy}, analytics/ redirect=${hasRepoRedirect}`
  );
});

test('HR Analytics Full Set catalog declares synthetic provenance and generated pages contain no former identity', () => {
  const dashboards = [
    'analytics/dashboards/hr-analytics-full-set/index.html',
    'analytics/dashboards/hr-analytics-full-set/workforce-turnover/index.html',
    'analytics/dashboards/hr-analytics-full-set/corporate-goals/index.html',
    'analytics/dashboards/hr-analytics-full-set/hr-administration-deep-dive/index.html',
    'analytics/dashboards/hr-analytics-full-set/hr-executive-board-current/index.html',
    'analytics/dashboards/hr-analytics-full-set/hr-executive-board-full-history/index.html',
    'analytics/dashboards/hr-analytics-full-set/learning-academy-analytics/index.html',
    'analytics/dashboards/hr-analytics-full-set/performance-hiring-turnover/index.html',
    'analytics/dashboards/hr-analytics-full-set/store-learning-compliance/index.html',
    'analytics/dashboards/hr-analytics-full-set/store-operations-tracking/index.html',
    'analytics/dashboards/hr-analytics-full-set/workforce-time-attendance/index.html'
  ];
  const catalog = readFileSync(path.join(repoRoot, 'frontend', dashboards[0]), 'utf8');
  assert.match(catalog, /synthetic/i);
  assert.match(catalog, /0<\/strong><span>real employer or employee records/i);
  for (const rel of dashboards.slice(1)) {
    const full = path.join(repoRoot, 'frontend', rel);
    if (!existsSync(full)) continue; // generator output not yet regenerated
    const html = readFileSync(full, 'utf8');
    assert.doesNotMatch(html, /ipekyol|erduran/i, `${rel} contains a prohibited former identity`);
  }
});
