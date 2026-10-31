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
    assert.ok(!full.startsWith(path.join(repoRoot, 'frontend')), `${dir}/ must not live under frontend/`);
  }
});

const DENY_PATTERNS = [/\.py$/, /\.xlsx$/, /\.mjs$/];
const ALLOWED_DOWNLOADS = [];

const TRADE_ARENA_JSON = new Set([
  "frontend/arcade/trade-arena/bots/roster.json",
  "frontend/arcade/trade-arena/data/catalog.json",
  "frontend/arcade/trade-arena/data/league.json",
  "frontend/arcade/trade-arena/data/raw/context/1d/DXY.json",
  "frontend/arcade/trade-arena/data/raw/context/1d/GLD.json",
  "frontend/arcade/trade-arena/data/raw/context/1d/QQQ.json",
  "frontend/arcade/trade-arena/data/raw/context/1d/SPY.json",
  "frontend/arcade/trade-arena/data/raw/context/1d/TLT.json",
  "frontend/arcade/trade-arena/data/raw/context/1d/TNX.json",
  "frontend/arcade/trade-arena/data/raw/context/1d/VIX.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/AAVE.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/ADA.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/APT.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/ARB.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/ATOM.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/AVAX.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/BCH.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/BTC.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/DOGE.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/DOT.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/ETC.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/ETH.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/FIL.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/GRAM.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/HBAR.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/INJ.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/LINK.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/LTC.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/NEAR.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/ONDO.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/OP.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/POL.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/RENDER.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/RUNE.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/S.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/SAND.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/SOL.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/SUI.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/TAO.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/THETA.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/UNI.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/VIRTUAL.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/XLM.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/XRP.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1d/ZEC.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/AAVE.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/ADA.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/APT.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/ARB.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/ATOM.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/AVAX.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/BCH.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/BTC.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/DOGE.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/DOT.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/ETC.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/ETH.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/FIL.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/GRAM.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/HBAR.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/INJ.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/LINK.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/LTC.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/NEAR.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/ONDO.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/OP.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/POL.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/RENDER.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/RUNE.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/S.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/SAND.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/SOL.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/SUI.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/TAO.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/THETA.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/UNI.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/VIRTUAL.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/XLM.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/XRP.json",
  "frontend/arcade/trade-arena/data/raw/crypto/1h/ZEC.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/AAVE.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/ADA.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/APT.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/ARB.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/ATOM.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/AVAX.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/BCH.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/BTC.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/DOGE.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/DOT.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/ETC.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/ETH.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/FIL.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/GRAM.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/HBAR.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/INJ.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/LINK.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/LTC.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/NEAR.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/ONDO.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/OP.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/POL.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/RENDER.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/RUNE.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/S.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/SAND.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/SOL.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/SUI.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/TAO.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/THETA.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/UNI.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/VIRTUAL.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/XLM.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/XRP.json",
  "frontend/arcade/trade-arena/data/raw/crypto/4h/ZEC.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/AAVE.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/ADA.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/APT.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/ARB.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/ATOM.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/AVAX.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/BCH.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/BTC.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/DOGE.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/DOT.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/ETC.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/ETH.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/FIL.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/GRAM.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/HBAR.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/INJ.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/LINK.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/LTC.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/NEAR.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/ONDO.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/OP.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/POL.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/RENDER.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/RUNE.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/S.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/SAND.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/SOL.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/SUI.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/TAO.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/THETA.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/UNI.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/VIRTUAL.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/XLM.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/XRP.json",
  "frontend/arcade/trade-arena/data/raw/crypto/funding/ZEC.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/AAPL.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/AMD.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/AMZN.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/AVGO.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/BA.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/BRK.B.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/CAT.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/COIN.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/COST.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/CRM.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/DIS.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/GOOGL.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/GS.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/INTC.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/JPM.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/KO.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/LLY.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/META.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/MSFT.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/MSTR.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/NFLX.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/NVDA.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/ORCL.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/PLTR.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/TSLA.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/UBER.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/UNH.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/V.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/WMT.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1d/XOM.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/AAPL.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/AMD.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/AMZN.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/AVGO.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/BA.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/BRK.B.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/CAT.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/COIN.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/COST.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/CRM.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/DIS.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/GOOGL.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/GS.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/INTC.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/JPM.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/KO.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/LLY.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/META.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/MSFT.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/MSTR.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/NFLX.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/NVDA.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/ORCL.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/PLTR.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/TSLA.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/UBER.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/UNH.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/V.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/WMT.json",
  "frontend/arcade/trade-arena/data/raw/stocks/1h/XOM.json"
]);

const ALLOWED_JSON = [
  /\/js\/v3\/apps\/trade-arena\/manifest\.json$/,
  /\/manifest\.webmanifest$/,
  /\/sitemap\.xml$/,
  /\/news\/sitemap\.xml$/,
  /\/news\/index\.json$/,
  /\/news\/.+\/index\.json$/,
  /\/analytics\/.+\/data\.json$/,
  /\/js\/v3\/apps\/analytics\/manifest\.json$/,
  /\/js\/v3\/apps\/aizanoi\/manifest\.json$/,
  /\/js\/v3\/apps\/browser\/manifest\.json$/,
  /\/js\/v3\/apps\/calculator\/manifest\.json$/,
  /\/js\/v3\/apps\/camera\/manifest\.json$/,
  /\/js\/v3\/apps\/dungeon\/manifest\.json$/,
  /\/js\/v3\/apps\/forge\/manifest\.json$/,
  /\/js\/v3\/apps\/games\/manifest\.json$/,
  /\/js\/v3\/apps\/markets\/manifest\.json$/,
  /\/js\/v3\/apps\/journal\/manifest\.json$/,
  /\/js\/v3\/apps\/labs\/manifest\.json$/,
  /\/js\/v3\/apps\/news\/manifest\.json$/,
  /\/js\/v3\/apps\/notepad\/manifest\.json$/,
  /\/js\/v3\/apps\/recycle-bin\/manifest\.json$/,
  /\/js\/v3\/apps\/snake-royale\/manifest\.json$/,
  /\/js\/v3\/apps\/videos\/manifest\.json$/,
  /\/js\/v3\/apps\/web-editor\/manifest\.json$/,
  /\/js\/v3\/apps\/workspace\/manifest\.json$/,
  /\/js\/v3\/apps\/winamp\/manifest\.json$/,
  // Explicit static arena rosters, not arbitrary JSON beneath arcade/.
  /\/arcade\/snake-royale\/bots\.json$/,
  /\/arcade\/chess\/bots\.json$/,
  /\/arcade\/maze-chase\/bots\.json$/,
  /\/arcade\/capture-flag\/bots\.json$/,
  /\/arcade\/holdem\/bots\.json$/,
  /\/arcade\/football\/bots\.json$/,
  /\/arcade\/anatolian-pact\/bots\.json$/,
  // Authored static geography consumed by the Anatolian Pact map renderer.
  /\/arcade\/anatolian-pact\/data\/anatolia-geo\.json$/,
];

test('denylist: no source or workbook files enter frontend', () => {
  const files = listDir(path.join(repoRoot, 'frontend'));
  const offenders = files
    .map((p) => path.relative(repoRoot, p))
    .filter((rel) => DENY_PATTERNS.some((re) => re.test(rel)))
    .filter((rel) => !ALLOWED_DOWNLOADS.some((re) => re.test(rel)));
  assert.deepEqual(offenders, [], `Undeclared build/source artifacts leaked into frontend/: ${offenders.join(', ')}`);
});

test('denylist: pipeline-manifest.json never reaches frontend/', () => {
  const files = listDir(path.join(repoRoot, 'frontend'));
  const offenders = files.map((p) => path.relative(repoRoot, p)).filter((rel) => /\/pipeline-manifest\.json$/.test(rel));
  assert.deepEqual(offenders, [], `Build manifests leaked into frontend/: ${offenders.join(', ')}`);
});


test('JSON allow-list: every JSON inside frontend/ is on the public list', () => {
  const files = listDir(path.join(repoRoot, 'frontend')).filter((p) => p.endsWith('.json'));
  const offenders = files
    .map((p) => path.relative(repoRoot, p).replaceAll(path.sep, '/'))
    .filter((rel) => !TRADE_ARENA_JSON.has(rel) && !ALLOWED_JSON.some((re) => re.test(rel)));
  assert.deepEqual(offenders, [], `Unexpected JSON files inside frontend/: ${offenders.join(', ')}`);
});

test('deploy stages frontend outside the active webroot and promotes a verified release by symlink', () => {
  const script = path.join(repoRoot, 'scripts', 'deploy-public.sh');
  assert.ok(existsSync(script), `Missing deploy script: ${script}`);
  const body = readFileSync(script, 'utf8');
  assert.match(body, /\/opt\/aizanoi-analytics-public\/frontend/, 'Script must source from frontend/');
  assert.match(body, /WEBROOT="\/var\/www\/aizanoianalytics\.com"/, 'Script must preserve the canonical active webroot');
  assert.match(body, /RELEASE_ROOT="\/var\/www\/aizanoianalytics\.com-releases"/, 'Script must use a separate release store');
  assert.match(body, /git -C "\$\{REPO\}" status --porcelain/, 'Script must reject a dirty server checkout');
  assert.match(body, /AIZANOI_DEPLOY_SHA/, 'Script must support an exact approved-SHA gate');
  assert.match(body, /rsync\s+-a\s+--delete[\s\S]*?"\$\{SOURCE\}\/"\s+"\$\{STAGING\}\/"/, 'Script must use cwd-independent SOURCE → STAGING rsync');
  assert.doesNotMatch(body, /rsync[\s\S]*?"\$\{SOURCE\}\/"\s+"\$\{WEBROOT\}\/"/, 'Script must never rsync directly into the active webroot');
  assert.match(body, /nginx -t/, 'Nginx configuration must validate before promotion');
  assert.match(body, /ln -s "\$\{FINAL\}" "\$\{NEXT_LINK\}"/, 'Script must create a candidate release symlink');
  assert.match(body, /mv -Tf "\$\{NEXT_LINK\}" "\$\{WEBROOT\}"/, 'Script must promote by replacing the active symlink');
  assert.match(body, /ROLLBACK_TARGET/, 'Script must report the previous release for rollback');
  assert.match(body, /cleanup\(\)[\s\S]*ROLLBACK_TARGET[\s\S]*ROLLBACK_LINK/, 'Failed post-promotion checks must restore the previous release');
});

test('deploy blocks ignored backup/editor artifacts before transfer and scrubs staged copies', () => {
  const body = readFileSync(path.join(repoRoot, 'scripts', 'deploy-public.sh'), 'utf8');
  const denied = ['*.bak', '*.bak_*', '*.broken_*', '*.tmp', '*.old', '*~', '*.swp', '.DS_Store'];
  for (const pattern of denied) {
    assert.ok(body.includes(`--exclude='${pattern}'`), `Deploy rsync must exclude local artifact pattern ${pattern}`);
    assert.ok(body.includes(`-name '${pattern}'`), `Deploy scrub/negative smoke must recognize local artifact pattern ${pattern}`);
  }
});

test('deploy is cwd-independent: same frontend/ → staging result from different cwds', { skip: process.platform === 'win32' }, async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { execFileSync } = await import('node:child_process');
  const stagingA = mkdtempSync(path.join(tmpdir(), 'aizanoi-staging-a-'));
  const stagingB = mkdtempSync(path.join(tmpdir(), 'aizanoi-staging-b-'));
  const unrelated = mkdtempSync(path.join(tmpdir(), 'aizanoi-unrelated-'));
  try {
    const source = path.join(repoRoot, 'frontend');
    // Use execFileSync with an explicit argv (no shell interpolation). The test
    // builds the rsync command with literal `${tmpdir}/...` paths that the test
    // itself controls; passing them as separate argv entries means no shell
    // parsing happens, so js/shell-command-injection-from-environment does not
    // see any environment-derived data flowing into a command sink.
    execFileSync('rsync', ['-a', '--delete', `${source}/`, `${stagingA}/`], { cwd: repoRoot });
    execFileSync('rsync', ['-a', '--delete', `${source}/`, `${stagingB}/`], { cwd: unrelated });
    const list = (root) => execFileSync('find', ['.', '-type', 'f'], { cwd: root, encoding: 'utf8' });
    const sortLines = (s) => s.split('\n').filter(Boolean).sort().join('\n');
    const a = sortLines(list(stagingA));
    const b = sortLines(list(stagingB));
    assert.equal(a, b, 'Publish must be cwd-independent: staging trees differ');
    assert.match(a, /analytics\/markets\/index\.html/, 'Staging must contain Aizanoi Markets');
    assert.match(a, /analytics\/dashboards\/new-hr-collection\/index\.html/, 'Staging must contain New HR Collection');
  } finally {
    rmSync(stagingA, { recursive: true, force: true });
    rmSync(stagingB, { recursive: true, force: true });
    rmSync(unrelated, { recursive: true, force: true });
  }
});

test('webroot smoke: current Analytics public routes exist under frontend/', () => {
  const dashboards = [
    'analytics/markets/index.html',
    'analytics/dashboards/new-hr-collection/index.html',
    'analytics/dashboards/new-hr-collection/pacs/index.html',
    'analytics/dashboards/new-hr-collection/recruitment-analytics/index.html'
  ];
  for (const rel of dashboards) {
    const full = path.join(repoRoot, 'frontend', rel);
    assert.ok(existsSync(full), `Missing public asset: ${rel}`);
    assert.ok(statSync(full).size > 0, `Empty public asset: ${rel}`);
  }
});

test('legacy /analytics/workforce-turnover/ stays 404 (owner decision 2026-08-26)', () => {
  const legacyFrontend = path.join(repoRoot, 'frontend/analytics/workforce-turnover/index.html');
  const legacyInRepo = path.join(repoRoot, 'analytics/workforce-turnover/');
  const hasFrontendCopy = existsSync(legacyFrontend);
  const hasRepoRedirect = existsSync(legacyInRepo);
  assert.ok(!hasFrontendCopy && !hasRepoRedirect, `Legacy /analytics/workforce-turnover/ must stay 404: frontend copy=${hasFrontendCopy}, analytics/ redirect=${hasRepoRedirect}`);
});
