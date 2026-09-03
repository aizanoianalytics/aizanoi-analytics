import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, statSync } from 'node:fs';

const execFileAsync = promisify(execFile);
const script = 'scripts/deploy-public.sh';
// Resolve the worktree this test is running from, not the canonical checkout
// the script normally deploys.
const repoRoot = process.cwd();
const scriptPath = `${repoRoot}/${script}`;

test('deploy-public.sh script file exists with strict shell mode', () => {
  const stat = statSync(scriptPath);
  assert.ok(stat.isFile());
  const src = readFileSync(scriptPath, 'utf8');
  assert.match(src, /^set -euo pipefail$/m);
  assert.match(src, /AIZANOI_DEPLOY_SHA env variable is required/);
  assert.match(src, /usage: AIZANOI_DEPLOY_SHA/);
  // No skip-gate branch (was `-n` check before).
  assert.doesNotMatch(src, /-n "\$\{AIZANOI_DEPLOY_SHA:-\}" &&/);
});

test('deploy-public.sh refuses to run without AIZANOI_DEPLOY_SHA env', async () => {
  const env = { ...process.env };
  delete env.AIZANOI_DEPLOY_SHA;
  let caught = null;
  try {
    await execFileAsync('bash', [script], {
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
  const env = { ...process.env, AIZANOI_DEPLOY_SHA: '0000000000000000000000000000000000000000' };
  let caught = null;
  try {
    await execFileAsync('bash', [script], {
      cwd: repoRoot,
      env,
      timeout: 30000,
    });
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, 'script must exit non-zero when SHA mismatches');
  assert.notEqual(caught.code, 0, 'exit code must be non-zero');
  assert.match(String(caught.stderr || caught.stdout || ''), /does not match approved AIZANOI_DEPLOY_SHA/);
});

test('HERMES_OPERATIONS.md documents the exact-SHA invocation form', () => {
  const ops = readFileSync(`${repoRoot}/docs/HERMES_OPERATIONS.md`, 'utf8');
  assert.match(ops, /AIZANOI_DEPLOY_SHA="\$TARGET_SHA" bash scripts\/deploy-public\.sh/);
});

