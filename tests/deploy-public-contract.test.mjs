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
