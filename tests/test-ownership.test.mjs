// Guards test ownership: every browser-driving suite must be claimed by exactly
// one CI owner, or be an explicitly documented operator diagnostic. A suite that
// loses its CI job without gaining a documented owner is how the Fly spectator
// and release-cache tests stayed broken for weeks.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const workflows = {
  ci: read('.github/workflows/ci.yml'),
  fullQa: read('.github/workflows/full-qa.yml'),
  crossBrowser: read('.github/workflows/cross-browser-smoke.yml'),
};

// Operator-only diagnostics: real browser tools, but not pass/fail gates.
// These exist to answer "what is actually happening in the browser right now"
// during an investigation; the pass/fail contracts live in the owned suites
// below. The Aizanoi runtime audit and the two isolation probes were added for
// the section-9 runtime investigation: they drive the real world across the
// full device matrix and record raw evidence to artifacts/ instead of
// asserting a threshold, so making them CI gates would be a fabricated
// pass/fail rather than a real contract.
const DIAGNOSTICS = new Set([
  'entry-battery.mjs',
  'webkit-entry-probe.mjs',
  'aizanoi-runtime-audit.mjs',
  'aizanoi-luma-isolate.mjs',
  'aizanoi-loop-diagnose.mjs',
  'aizanoi-black-frame-diagnose.mjs'
]);

function browserSuites(dir = 'tests') {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(join(ROOT, d))) {
      const rel = `${d}/${entry}`;
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
      else if (entry.endsWith('.mjs') && read(rel).includes('playwright')) out.push(rel);
    }
  };
  walk(dir);
  return out.sort();
}

test('every browser-driving suite has an automation owner', () => {
  const owned = { ci: 0, fullQa: 0, crossBrowser: 0 };
  const unowned = [];
  // Deliberately shared suites. cross-browser-critical.mjs runs under Chromium in
  // routine CI and under Firefox/WebKit in the weekly workflow; cross-device
  // critical runs in routine CI and is repeated by Full QA as a device-matrix
  // check alongside the deeper per-app suites.
  const shared = new Map([
    ['cross-browser-critical.mjs', ['ci', 'crossBrowser']],
    ['cross-device-critical.mjs', ['ci', 'fullQa']],
    // The Aizanoi WebGL smoke was promoted into routine CI (text #25) and is
    // still repeated by Full QA as the deep single-world Aizanoi traversal.
    ['aizanoi-browser-smoke.mjs', ['ci', 'fullQa']],
  ]);

  for (const suite of browserSuites()) {
    const name = suite.split('/').pop();
    // The two operator diagnostics are deliberately outside CI; this audit file
    // mentions playwright in its own source and is not a browser suite itself.
    if (DIAGNOSTICS.has(name) || name === 'test-ownership.test.mjs') continue;
    const isDeclaredShared = shared.has(name);
    const owners = isDeclaredShared
      ? shared.get(name)
      : [
          ['ci', workflows.ci.includes(name)],
          ['fullQa', workflows.fullQa.includes(name)],
          ['crossBrowser', workflows.crossBrowser.includes(name)],
        ].filter(([, claimed]) => claimed).map(([owner]) => owner);

    for (const owner of owners) owned[owner] += 1;

    if (owners.length === 0) unowned.push(suite);
    else if (owners.length > 1 && !isDeclaredShared) {
      assert.fail(
        `${suite} is claimed by ${owners.length} owners (${owners.join(', ')}); ` +
          'if that is intended, declare it in the `shared` map above',
      );
    }
  }

  assert.deepEqual(
    unowned,
    [],
    `browser suites with no CI owner: ${unowned.join(', ')}. ` +
      'Add them to a workflow, or document them in tests/index.md as an ' +
      'operator-only diagnostic.',
  );

  // Sanity: the ownership table must reflect reality, not an empty split.
  assert.ok(owned.fullQa >= 20, `Full QA should own the product suites, owns ${owned.fullQa}`);
  assert.ok(owned.ci >= 3, `routine CI should own critical smoke, owns ${owned.ci}`);
  assert.ok(owned.crossBrowser >= 1, 'cross-browser weekly smoke should own something');
});

test('the only unowned browser scripts are the documented operator diagnostics', () => {
  const docs = read('tests/index.md');
  for (const diagnostic of ['entry-battery.mjs', 'webkit-entry-probe.mjs']) {
    assert.ok(
      docs.includes(diagnostic),
      `${diagnostic} is not in CI, so tests/index.md must document why`,
    );
  }
  // They must stay diagnostics: no assertions, no CI gate.
  for (const diagnostic of ['entry-battery.mjs', 'webkit-entry-probe.mjs']) {
    const source = read(`tests/${diagnostic}`);
    assert.doesNotMatch(source, /\bassert\./, `${diagnostic} must not become a gate silently`);
    assert.doesNotMatch(source, /from 'node:assert/, `${diagnostic} must not import assertions`);
  }
  assert.doesNotMatch(workflows.ci, /entry-battery/, 'a production-hitting probe must stay out of CI');
  assert.doesNotMatch(workflows.fullQa, /entry-battery/, 'a production-hitting probe must stay out of CI');
});

test('tests/browser ownership is documented exactly as the workflows define it', () => {
  const docs = read('tests/index.md');
  // Full QA does NOT own everything under tests/browser/: the Nginx production
  // policy gate is a required routine check on purpose. The table must say so,
  // and the claim must stay true of the workflow.
  assert.match(workflows.ci, /nginx-production-policy\.test\.mjs/, 'routine CI must still run the Nginx policy gate');
  assert.doesNotMatch(
    workflows.fullQa,
    /nginx-production-policy\.test\.mjs/,
    'a required policy gate must not be duplicated into the weekly Full QA run',
  );
  assert.doesNotMatch(
    docs,
    /everything under `tests\/browser\/`/,
    'tests/index.md must not claim Full QA owns all of tests/browser/ while routine CI also runs nginx-production-policy.test.mjs',
  );
  // The routine row must name every suite CI actually runs.
  for (const routine of [
    'cross-browser-critical.mjs',
    'cross-device-critical.mjs',
    'service-worker-browser.mjs',
    'representative-a11y.mjs',
    'nginx-production-policy.test.mjs',
  ]) {
    assert.ok(docs.includes(routine), `tests/index.md must list ${routine} under its real owner`);
  }
});

test('routine CI stays small and the expensive suites are not required', () => {
  // The cleanup contract: three required checks, no giant browser job.
  assert.match(workflows.ci, /^\s{2}validate:/m);
  assert.match(workflows.ci, /^\s{2}browser-smoke:/m);
  assert.match(workflows.ci, /^\s{2}lighthouse:/m);
  assert.doesNotMatch(workflows.ci, /hr-pipeline-rebuild/);
  assert.doesNotMatch(workflows.ci, /entry-battery|webkit-entry-probe/);

  // Full QA must never become a required check.
  assert.match(workflows.fullQa, /workflow_dispatch:/);
  assert.match(workflows.fullQa, /schedule:/);
});

// Repositories cannot read their own branch protection without elevated
// credentials, so the deterministic contract lives in the workflow assertions
// above. This last check is a best-effort live confirmation: it runs only when
// a `gh` CLI with admin scope happens to be available, and SKIPS (never fails,
// never silently passes as verified) otherwise. Do not read a green run here as
// "CI enforced branch protection" — see docs/HERMES_OPERATIONS.md.
const AUTHORITATIVE_REQUIRED_CHECKS = ['browser-smoke', 'lighthouse', 'validate'];

test('best-effort: live branch protection matches the documented required checks', async (t) => {
  const { execFileSync } = await import('node:child_process');
  let contexts;
  try {
    contexts = JSON.parse(
      execFileSync(
        'gh',
        [
          'api',
          '-H',
          'Accept: application/vnd.github.luke-cage-preview+json',
          'repos/aizanoianalytics/aizanoi-analytics/branches/main/protection',
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      ),
    ).required_status_checks.contexts;
  } catch {
    t.skip('gh unavailable or lacks admin scope — live branch protection not verified here');
    return;
  }
  assert.deepEqual([...contexts].sort(), AUTHORITATIVE_REQUIRED_CHECKS);
});
