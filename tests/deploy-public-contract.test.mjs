import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);
const script = 'scripts/deploy-public.sh';
const repoRoot = process.cwd();
const scriptPath = `${repoRoot}/${script}`;

// Build a temporary deployable checkout that mirrors the script's hard-coded
// `/opt/aizanoi-analytics-public` REPO. This lets CI runners without /opt
// prove the SHA gate behaviour without weakening the production contract.
function createFakeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'aizanoi-deploy-test-'));
  const frontend = join(root, 'frontend');
  mkdirSync(frontend, { recursive: true });
  // The synthetic workbook path must exist and be non-empty to clear the
  // source-tree assertion that runs after the env gate.
  mkdirSync(join(frontend, 'analytics', 'dashboards', 'hr-analytics-full-set', 'downloads'), { recursive: true });
  writeFileSync(join(frontend, 'analytics', 'dashboards', 'hr-analytics-full-set', 'downloads', 'hr-analytics-full-set-synthetic-output.xlsx'), 'synthetic');
  mkdirSync(join(frontend, 'js', 'v3'), { recursive: true });
  // The promoted-asset checks require index.html, release.js, service-worker.js.
  writeFileSync(join(frontend, 'index.html'), '<!doctype html>');
  writeFileSync(join(frontend, 'release.js'), 'export const release = "test";\n');
  writeFileSync(join(frontend, 'service-worker.js'), '// sw\n');
  // A working git repo is required so `git status --porcelain` and
  // `git rev-parse HEAD` succeed. Initialize one at the temp root.
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git(['init', '-q']);
  git(['config', 'user.email', 'aizanoi-deploy-test@example.invalid']);
  git(['config', 'user.name', 'aizanoi-deploy-test']);
  git(['config', 'commit.gpgsign', 'false']);
  // Stage the synthetic workbook only so git status stays clean.
  git(['add', join(frontend, 'analytics', 'dashboards', 'hr-analytics-full-set', 'downloads', 'hr-analytics-full-set-synthetic-output.xlsx')]);
  git(['add', join(frontend, 'index.html')]);
  git(['add', join(frontend, 'release.js')]);
  git(['add', join(frontend, 'service-worker.js')]);
  git(['commit', '-q', '-m', 'init']);
  return root;
}

// Build a deployable copy of scripts/deploy-public.sh in a *separate* tmp dir
// from the fake checkout so the test copy never dirties git status inside
// the fake REPO. The copy only swaps REPO/WEBROOT/RELEASE_ROOT paths.
function createDeployableCopy(fakeRepo, sourceScript) {
  const sibling = mkdtempSync(join(tmpdir(), 'aizanoi-deploy-script-'));
  const dst = join(sibling, 'deploy-public.sh');
  const patched = sourceScript
    .replace(/REPO="[^"]*"/, `REPO="${fakeRepo}"`)
    .replace(/WEBROOT="[^"]*"/, `WEBROOT="${fakeRepo}/webroot"`)
    .replace(/RELEASE_ROOT="[^"]*"/, `RELEASE_ROOT="${fakeRepo}/webroot-releases"`);
  writeFileSync(dst, patched);
  execFileSync('chmod', ['+x', dst]);
  return { script: dst, cleanup: () => rmSync(sibling, { recursive: true, force: true }) };
}

test('deploy-public.sh script file exists with strict shell mode', () => {
  const stat = statSync(scriptPath);
  assert.ok(stat.isFile());
  const src = readFileSync(scriptPath, 'utf8');
  assert.match(src, /^set -euo pipefail$/m);
  assert.match(src, /AIZANOI_DEPLOY_SHA env variable is required/);
  assert.match(src, /usage: AIZANOI_DEPLOY_SHA/);
  // No skip-gate branch (was `-n` check before).
  assert.doesNotMatch(src, /-n "\$\{AIZANOI_DEPLOY_SHA:-\}" &&/);
  // SHA gate runs before any filesystem mutation so a missing env fails closed
  // before source-tree checks.
  const envGateIdx = src.indexOf('AIZANOI_DEPLOY_SHA env variable is required');
  const sourceTreeIdx = src.indexOf('source tree missing');
  assert.ok(envGateIdx > -1 && sourceTreeIdx > -1 && envGateIdx < sourceTreeIdx,
    'AIZANOI_DEPLOY_SHA gate must precede source-tree check');
});

test('deploy-public.sh refuses to run without AIZANOI_DEPLOY_SHA env', async () => {
  const env = { ...process.env };
  delete env.AIZANOI_DEPLOY_SHA;
  let caught = null;
  try {
    await execFileAsync('bash', [scriptPath], {
      cwd: repoRoot,
      env,
      timeout: 30000,
    });
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, 'script must exit non-zero when AIZANOI_DEPLOY_SHA is missing');
  assert.notEqual(caught.code, 0, 'exit code must be non-zero');
  assert.match(String(caught.stderr || caught.stdout || ''), /AIZANOI_DEPLOY_SHA env variable is required/);
});

test('deploy-public.sh refuses when AIZANOI_DEPLOY_SHA mismatches HEAD', async () => {
  const fakeRepo = createFakeRepo();
  let copy;
  try {
    const source = readFileSync(scriptPath, 'utf8');
    copy = createDeployableCopy(fakeRepo, source);
    const env = { ...process.env, AIZANOI_DEPLOY_SHA: '0000000000000000000000000000000000000000' };
    let caught = null;
    try {
      await execFileAsync('bash', [copy.script], { env, timeout: 30000 });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, 'script must exit non-zero when SHA mismatches');
    assert.notEqual(caught.code, 0, 'exit code must be non-zero');
    assert.match(String(caught.stderr || caught.stdout || ''), /does not match approved AIZANOI_DEPLOY_SHA/);
  } finally {
    if (copy) copy.cleanup();
    rmSync(fakeRepo, { recursive: true, force: true });
  }
});

test('deploy-public.sh rejects symbolic links before promotion', () => {
  const src = readFileSync(scriptPath, 'utf8');
  assert.match(src, /find "\$\{STAGING\}" -type l -print -quit/);
  assert.match(src, /FATAL: staged release contains symbolic links/);
});

test('HERMES_OPERATIONS.md documents the exact-SHA invocation form', () => {
  const ops = readFileSync(`${repoRoot}/docs/HERMES_OPERATIONS.md`, 'utf8');
  assert.match(ops, /AIZANOI_DEPLOY_SHA="\$TARGET_SHA" bash scripts\/deploy-public\.sh/);
});

test('deploy carries the self-hosted Dungeon route and Phaser vendor bundle', () => {
  const page = readFileSync(`${repoRoot}/frontend/dungeon/index.html`, 'utf8');
  assert.match(page, /<script src="\/vendor\/phaser\.min\.js"><\/script>/);
  const vendor = statSync(`${repoRoot}/frontend/vendor/phaser.min.js`);
  assert.ok(vendor.size > 1000000, `phaser vendor bundle must ship, got ${vendor.size} bytes`);
  const script = readFileSync(scriptPath, 'utf8');
  assert.match(script, /"\$\{SOURCE\}\/"\s+"\$\{STAGING\}\/"/, 'deploy stages the whole frontend tree (dungeon + vendor included)');
});

test('service worker keeps the 1.18MB Phaser bundle out of precache (mobile data)', () => {
  const sw = readFileSync(`${repoRoot}/frontend/service-worker.js`, 'utf8');
  assert.doesNotMatch(sw, /phaser/, 'phaser must load on demand, never precache');
});

test('post-promotion health failure rolls the active symlink back', async () => {
  const fakeRepo = createFakeRepo();
  const releaseRoot = join(fakeRepo, 'webroot-releases');
  const webroot = join(fakeRepo, 'webroot');
  const rollback = join(releaseRoot, 'release-A');
  const bin = mkdtempSync(join(tmpdir(), 'aizanoi-deploy-bin-'));
  let copy;
  try {
    writeFileSync(join(fakeRepo, '.git', 'info', 'exclude'), 'webroot\nwebroot-releases/\n');
    mkdirSync(rollback, { recursive: true });
    writeFileSync(join(rollback, 'index.html'), 'release A');
    mkdirSync(releaseRoot, { recursive: true });
    // This is the already-active release before B is staged and promoted.
    execFileSync('ln', ['-s', rollback, webroot]);
    writeFileSync(join(bin, 'nginx'), '#!/bin/sh\nexit 0\n');
    // Root HEAD pre-check fails (-sfI -L returns nonzero) AND every probe
    // also fails (curl exits nonzero for the body call). The deploy must not
    // finalise and must roll the active symlink back to release-A.
    writeFileSync(join(bin, 'curl'), '#!/bin/sh\nexit 1\n');
    execFileSync('chmod', ['+x', join(bin, 'nginx'), join(bin, 'curl')]);
    copy = createDeployableCopy(fakeRepo, readFileSync(scriptPath, 'utf8'));
    const env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      AIZANOI_DEPLOY_HEALTH_INSECURE_HTTP: '1',
      AIZANOI_DEPLOY_HEALTH_HOST: '127.0.0.1',
      AIZANOI_DEPLOY_HEALTH_PORT: '80',
      AIZANOI_DEPLOY_SHA: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fakeRepo, encoding: 'utf8' }).trim(),
    };
    let caught = null;
    try {
      await execFileAsync('bash', [copy.script], { env, timeout: 30000 });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, 'unavailable health endpoints must fail deployment');
    assert.notEqual(caught.code, 0);
    assert.equal(readFileSync(join(webroot, 'index.html'), 'utf8'), 'release A', 'active release must be restored');
    assert.equal(readFileSync(join(webroot, 'index.html'), 'utf8'), readFileSync(join(rollback, 'index.html'), 'utf8'));
  } finally {
    if (copy) copy.cleanup();
    rmSync(bin, { recursive: true, force: true });
    rmSync(fakeRepo, { recursive: true, force: true });
  }
});

test('successful post-promotion health keeps the new active release', async () => {
  const fakeRepo = createFakeRepo();
  const releaseRoot = join(fakeRepo, 'webroot-releases');
  const webroot = join(fakeRepo, 'webroot');
  const rollback = join(releaseRoot, 'release-A');
  const bin = mkdtempSync(join(tmpdir(), 'aizanoi-deploy-bin-'));
  let copy;
  try {
    writeFileSync(join(fakeRepo, '.git', 'info', 'exclude'), 'webroot\nwebroot-releases/\n');
    mkdirSync(rollback, { recursive: true });
    writeFileSync(join(rollback, 'index.html'), 'release A');
    mkdirSync(releaseRoot, { recursive: true });
    execFileSync('ln', ['-s', rollback, webroot]);
    writeFileSync(join(bin, 'nginx'), '#!/bin/sh\nexit 0\n');
    // The new health gate calls curl with -sfI -L for the pre-check and
    // expects -w '%{http_code} %{num_redirects} %{url_effective}' for each
    // probe. For success we want terminal status 200, no redirects.
    writeFileSync(join(bin, 'curl'), [
      '#!/bin/sh',
      // Match -sfI -L pre-check by emitting nothing but exiting 0.
      'if echo "$*" | grep -q -- "-sfI"; then exit 0; fi',
      // Body probes: always print "200 0 http://example/" so the gate sees
      // terminal 2xx, zero redirects, and a sane effective URL.
      'printf "200 0 http://example/\\n"',
      'exit 0',
      '',
    ].join('\n'));
    execFileSync('chmod', ['+x', join(bin, 'nginx'), join(bin, 'curl')]);
    copy = createDeployableCopy(fakeRepo, readFileSync(scriptPath, 'utf8'));
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fakeRepo, encoding: 'utf8' }).trim();
    const env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      AIZANOI_DEPLOY_HEALTH_INSECURE_HTTP: '1',
      AIZANOI_DEPLOY_HEALTH_HOST: '127.0.0.1',
      AIZANOI_DEPLOY_HEALTH_PORT: '80',
      AIZANOI_DEPLOY_SHA: sha,
    };
    await execFileAsync('bash', [copy.script], { env, timeout: 30000 });
    const active = readFileSync(join(webroot, 'index.html'), 'utf8');
    assert.equal(active, '<!doctype html>', 'new release must remain active after all health checks');
    assert.notEqual(await import('node:fs/promises').then(({ realpath }) => realpath(webroot)), rollback);
  } finally {
    if (copy) copy.cleanup();
    rmSync(bin, { recursive: true, force: true });
    rmSync(fakeRepo, { recursive: true, force: true });
  }
});

test('redirect target ending in 404/500 fails the deployment and rolls back', async () => {
  // Scenario B: probe follows an HTTP 301/302 redirect chain but the
  // terminal response is 404/500. The old gate accepted the 301 as success;
  // the new gate must observe the terminal 4xx/5xx and fail closed.
  const fakeRepo = createFakeRepo();
  const releaseRoot = join(fakeRepo, 'webroot-releases');
  const webroot = join(fakeRepo, 'webroot');
  const rollback = join(releaseRoot, 'release-A');
  const bin = mkdtempSync(join(tmpdir(), 'aizanoi-deploy-bin-'));
  let copy;
  try {
    writeFileSync(join(fakeRepo, '.git', 'info', 'exclude'), 'webroot\nwebroot-releases/\n');
    mkdirSync(rollback, { recursive: true });
    writeFileSync(join(rollback, 'index.html'), 'release A');
    mkdirSync(releaseRoot, { recursive: true });
    execFileSync('ln', ['-s', rollback, webroot]);
    writeFileSync(join(bin, 'nginx'), '#!/bin/sh\nexit 0\n');
    // Pre-check (-sfI -L) succeeds; body probes (-w '%{http_code} ...') claim
    // terminal 500 with one redirect, simulating a broken HTTPS backend.
    writeFileSync(join(bin, 'curl'), [
      '#!/bin/sh',
      'if echo "$*" | grep -q -- "-sfI"; then exit 0; fi',
      'printf "500 1 http://example/broken\\n"',
      'exit 0',
      '',
    ].join('\n'));
    execFileSync('chmod', ['+x', join(bin, 'nginx'), join(bin, 'curl')]);
    copy = createDeployableCopy(fakeRepo, readFileSync(scriptPath, 'utf8'));
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fakeRepo, encoding: 'utf8' }).trim();
    const env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      AIZANOI_DEPLOY_HEALTH_INSECURE_HTTP: '1',
      AIZANOI_DEPLOY_HEALTH_HOST: '127.0.0.1',
      AIZANOI_DEPLOY_HEALTH_PORT: '80',
      AIZANOI_DEPLOY_SHA: sha,
    };
    let caught = null;
    try {
      await execFileAsync('bash', [copy.script], { env, timeout: 30000 });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, 'broken terminal response must fail deployment');
    assert.notEqual(caught.code, 0);
    assert.match(String(caught.stderr || caught.stdout || ''), /terminal=500/, 'failure must report terminal status');
    // Rollback target must be active again after the failed promotion.
    const { realpath: realpathAsync } = await import('node:fs/promises');
    const realWebroot = await realpathAsync(webroot);
    assert.equal(realWebroot, await realpathAsync(rollback), 'active release must be restored to release-A');
  } finally {
    if (copy) copy.cleanup();
    rmSync(bin, { recursive: true, force: true });
    rmSync(fakeRepo, { recursive: true, force: true });
  }
});

test('missing curl executable is fail-closed in the deploy script', async () => {
  // Scenario C source-level contract: the script must (1) detect a missing
  // curl with `command -v curl >/dev/null 2>&1` and (2) refuse to finalise
  // with a clear FATAL message naming curl. We do not actually run the
  // script without curl because removing curl from PATH would also break
  // the upstream git operations; instead we pin the exact guard so the
  // behaviour cannot silently regress to "deploy anyway".
  const src = readFileSync(scriptPath, 'utf8');
  assert.match(src, /command -v curl >\/dev\/null 2>&1/);
  assert.match(src, /curl executable not found/);
  assert.match(src, /refusing to finalize deployment/);
});

test('nginx reload failure rolls the active release back', async () => {
  // Scenario E: nginx -s reload fails right after the symlink promotion.
  // The script must NOT proceed to the health probe and must restore the
  // previous known-good release.
  const fakeRepo = createFakeRepo();
  const releaseRoot = join(fakeRepo, 'webroot-releases');
  const webroot = join(fakeRepo, 'webroot');
  const rollback = join(releaseRoot, 'release-A');
  const bin = mkdtempSync(join(tmpdir(), 'aizanoi-deploy-bin-'));
  let copy;
  try {
    writeFileSync(join(fakeRepo, '.git', 'info', 'exclude'), 'webroot\nwebroot-releases/\n');
    mkdirSync(rollback, { recursive: true });
    writeFileSync(join(rollback, 'index.html'), 'release A');
    mkdirSync(releaseRoot, { recursive: true });
    execFileSync('ln', ['-s', rollback, webroot]);
    // nginx -t (config test, first call) succeeds, nginx -s reload fails.
    writeFileSync(join(bin, 'nginx'), [
      '#!/bin/sh',
      // shellcheck disable=SC2145
      'if [ "$1" = "-t" ]; then exit 0; fi',
      'if [ "$1" = "-s" ] && [ "$2" = "reload" ]; then exit 1; fi',
      'exit 0',
      '',
    ].join('\n'));
    // Even a fully successful curl must not save the deploy, since the gate
    // is gated behind nginx -s reload succeeding.
    writeFileSync(join(bin, 'curl'), '#!/bin/sh\nexit 0\n');
    execFileSync('chmod', ['+x', join(bin, 'nginx'), join(bin, 'curl')]);
    copy = createDeployableCopy(fakeRepo, readFileSync(scriptPath, 'utf8'));
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fakeRepo, encoding: 'utf8' }).trim();
    const env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      AIZANOI_DEPLOY_HEALTH_INSECURE_HTTP: '1',
      AIZANOI_DEPLOY_HEALTH_HOST: '127.0.0.1',
      AIZANOI_DEPLOY_HEALTH_PORT: '80',
      AIZANOI_DEPLOY_SHA: sha,
    };
    let caught = null;
    try {
      await execFileAsync('bash', [copy.script], { env, timeout: 30000 });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, 'nginx reload failure must fail deployment');
    assert.notEqual(caught.code, 0);
    assert.match(String(caught.stderr || caught.stdout || ''), /Nginx reload failed/);
    // Release-A must still be the active release.
    const { realpath: realpathAsync2 } = await import('node:fs/promises');
    const realWebroot = await realpathAsync2(webroot);
    assert.equal(realWebroot, await realpathAsync2(rollback), 'rollback target must be active after nginx reload failure');
  } finally {
    if (copy) copy.cleanup();
    rmSync(bin, { recursive: true, force: true });
    rmSync(fakeRepo, { recursive: true, force: true });
  }
});

test('post-promotion health probe is forced through the canonical production host', async () => {
  // Source-level guard: default health gate MUST target the canonical
  // production host and MUST follow redirects to a terminal 2xx; it MUST NOT
  // accept any 3xx as success the way the old plain-HTTP gate did.
  const src = readFileSync(scriptPath, 'utf8');
  assert.match(src, /AIZANOI_DEPLOY_HEALTH_HOST:-aizanoianalytics\.com/, 'default host must be the canonical production host');
  assert.match(src, /AIZANOI_DEPLOY_HEALTH_PORT:-443/, 'default port must be HTTPS 443');
  assert.match(src, /--resolve/, 'HTTPS probes must use curl --resolve so loopback is forced and SNI matches');
  assert.match(src, /-L /, 'probes must follow redirects to the terminal response');
  assert.match(src, /2\?\?/, 'only terminal 2xx is accepted as success');
  assert.doesNotMatch(src, /200\|301\|302\|303\|307\|308/, 'the old redirect-as-success gate must be gone');
});
