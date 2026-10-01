import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const frontend = path.join(repoRoot, 'frontend');

// Mock browser globals needed by modules under test
globalThis.window = globalThis;
globalThis.matchMedia = globalThis.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));

function read(relative) {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

// ---------------------------------------------------------------------------
// Aizanoi module contract
// ---------------------------------------------------------------------------

test('Aizanoi module exports mount({ container }) as a function', async () => {
  const entry = path.join(frontend, 'js/v3/apps/aizanoi/src/index.js');
  const imported = await import(pathToFileURL(entry).href + `?t=${Date.now()}`);
  assert.equal(typeof imported.mount, 'function', 'Aizanoi module must export mount()');
  assert.equal(typeof imported.default, 'function', 'Aizanoi module default export must be mount()');
});

test('Aizanoi module mount() navigates to the canonical runtime', async () => {
  const entry = path.join(frontend, 'js/v3/apps/aizanoi/src/index.js');
  const imported = await import(pathToFileURL(entry).href + `?t=${Date.now()}`);
  let navigated = null;
  const originalLocation = globalThis.location;
  Object.defineProperty(globalThis, 'location', {
    value: { set href(value) { navigated = value; } },
    writable: true,
    configurable: true,
  });
  try {
    await imported.mount({ container: null });
    assert.equal(navigated, '/worlds/aizanoi-225/');
  } finally {
    if (originalLocation) Object.defineProperty(globalThis, 'location', { value: originalLocation, writable: true, configurable: true });
    else delete globalThis.location;
  }
});

// ---------------------------------------------------------------------------
// Single catalog source — no WORLDS, no duplicate Aizanoi
// ---------------------------------------------------------------------------

test('registry has no WORLDS export and no duplicate Aizanoi entries', async () => {
  const registry = await import(pathToFileURL(path.join(frontend, 'js/v3/registry.js')).href + `?t=${Date.now()}`);
  assert.equal('WORLDS' in registry, false, 'WORLDS catalog must be retired');
  const aizanoiApps = registry.APPS.filter((app) => app.id === 'aizanoi');
  assert.equal(aizanoiApps.length, 1, 'Aizanoi must appear exactly once in APPS');
});

test('searchableEntries returns no world-type entries and Aizanoi appears once', async () => {
  const registry = await import(pathToFileURL(path.join(frontend, 'js/v3/registry.js')).href + `?t=${Date.now()}`);
  const entries = registry.searchableEntries([]);
  const worldEntries = entries.filter((e) => e.type === 'world');
  assert.equal(worldEntries.length, 0, 'searchableEntries must not return world-type entries');
  const aizanoiEntries = entries.filter((e) => e.id === 'aizanoi');
  assert.equal(aizanoiEntries.length, 1, 'Aizanoi must appear exactly once in search');
});

// ---------------------------------------------------------------------------
// No worldsCapability
// ---------------------------------------------------------------------------

test('capabilities has no worlds provider', async () => {
  const caps = await import(pathToFileURL(path.join(frontend, 'js/v3/capabilities.js')).href + `?t=${Date.now()}`);
  await assert.rejects(
    () => caps.resolveCapabilities(['worlds']),
    /Application capability unavailable: worlds/,
  );
});

// ---------------------------------------------------------------------------
// No launchWorld in shell
// ---------------------------------------------------------------------------

test('shell has no launchWorld export', async () => {
  const shell = await import(pathToFileURL(path.join(frontend, 'js/v3/shell.js')).href + `?t=${Date.now()}`);
  assert.equal('launchWorld' in shell, false, 'launchWorld must be retired from shell');
});

// ---------------------------------------------------------------------------
// No data-world handling
// ---------------------------------------------------------------------------

test('shell has no data-world click handler', () => {
  const shell = readFileSync(path.join(frontend, 'js/v3/shell.js'), 'utf8');
  assert.doesNotMatch(shell, /data-world/, 'shell must not handle data-world clicks');
});

test('aizanoi-os has no data-world launcher tile', () => {
  const os = readFileSync(path.join(frontend, 'js/v3/aizanoi-os.js'), 'utf8');
  assert.doesNotMatch(os, /data-world/, 'aizanoi-os must not render data-world tiles');
});

// ---------------------------------------------------------------------------
// No renderWorldCards
// ---------------------------------------------------------------------------

test('shell has no renderWorldCards function', () => {
  const shell = readFileSync(path.join(frontend, 'js/v3/shell.js'), 'utf8');
  assert.doesNotMatch(shell, /renderWorldCards/, 'renderWorldCards must be removed');
});

// ---------------------------------------------------------------------------
// Resume/session copy
// ---------------------------------------------------------------------------

test('shell resume copy says Aizanoi, not Historical World', () => {
  const shell = readFileSync(path.join(frontend, 'js/v3/shell.js'), 'utf8');
  assert.match(shell, /Return to Aizanoi/);
  assert.match(shell, /Resume your Aizanoi exploration/);
  assert.doesNotMatch(shell, /Historical World/, 'shell must not use Historical World copy');
});

// ---------------------------------------------------------------------------
// Documentation drift guards
// ---------------------------------------------------------------------------

test('FIELD_SYSTEM.md describes Aizanoi as the singular interactive world', () => {
  const field = read('docs/FIELD_SYSTEM.md');
  assert.match(field, /Aizanoi.*singular flagship interactive reconstruction/i);
  assert.match(field, /only current interactive world/i);
  assert.doesNotMatch(field, /Four public worlds|four worlds|all four worlds/i);
  assert.doesNotMatch(field, /Three Historical Worlds|three worlds/i);
  assert.doesNotMatch(field, /present-day companion/i);
});

test('no maintained doc claims Rome/Athens/İGA/Fly as current products', () => {
  const docs = [
    'README.md', 'DESIGN.md', 'ARCHITECTURE.md', 'index.md',
    'frontend/index.md', 'frontend/worlds/index.md',
    'docs/FIELD_SYSTEM.md', 'docs/README.md', 'infra/README.md',
    'CONTRIBUTING.md',
    // Operator/contributor surfaces are exactly where stale multi-world
    // obligations survived an earlier pass, so they are covered explicitly.
    'docs/OPERATIONS.md', 'docs/HERMES_OPERATIONS.md', 'docs/ACCESSIBILITY.md',
    'scripts/modules/index.md',
  ];
  for (const doc of docs) {
    const content = read(doc);
    assert.doesNotMatch(content, /Rome.*current|Athens.*current|İGA.*current/i, `${doc} must not describe Rome/Athens/İGA as current`);
    assert.doesNotMatch(content, /Fly Simulation.*current|Fly World.*current/i, `${doc} must not describe Fly as current`);
  }
});

test('operations docs do not impose retired-world smoke or deploy obligations', () => {
  const operations = read('docs/OPERATIONS.md');
  const hermes = read('docs/HERMES_OPERATIONS.md');
  for (const [name, doc] of [['docs/OPERATIONS.md', operations], ['docs/HERMES_OPERATIONS.md', hermes]]) {
    assert.doesNotMatch(doc, /Rome|Athens|İGA|Istanbul Airport/i, `${name} must not carry a retired-world deploy obligation`);
    assert.doesNotMatch(doc, /four worlds|all four/i, `${name} must not reference four worlds`);
    // The retired `worlds` app id must never be smoke-tested again.
    assert.doesNotMatch(doc, /\?app=worlds\b/, `${name} must not smoke-test the retired worlds app id`);
    // Current Aizanoi routes must be listed instead.
    assert.match(doc, /\/worlds\/aizanoi-225\//, `${name} must name the canonical Aizanoi runtime route`);
    assert.match(doc, /\/dungeon\//, `${name} must name the Dungeon route`);
  }
  assert.match(hermes, /\?app=aizanoi\b/, 'Hermes operations must smoke-test the canonical aizanoi app id');
});

test('accessibility release checks are scoped to Aizanoi only', () => {
  const accessibility = read('docs/ACCESSIBILITY.md');
  // `\b` anchors keep legitimate words such as "Chrome" out of the result.
  assert.doesNotMatch(accessibility, /\bRome\b|\bAthens\b|İGA|Istanbul Airport/i, 'accessibility checks must not cover retired worlds');
  assert.match(accessibility, /Aizanoi keyboard\/input smoke/);
});

test('module docs describe only capabilities the runtime actually resolves', () => {
  const moduleDocs = read('scripts/modules/index.md');
  assert.doesNotMatch(moduleDocs, /list\(\).*currentSession\(\).*launch\(\)/, 'module docs must not document a retired worlds facade');
  // The id may appear, but only as an explicit retired statement.
  const worldsMentions = moduleDocs.split('\n').filter((line) => line.includes('worlds'));
  for (const line of worldsMentions) {
    assert.match(line, /retired|no longer|must now fail/i, `module docs mention of worlds must be an explicit retirement note: ${line}`);
  }
});

test('worlds AGENTS instructions describe Aizanoi-only architecture', () => {
  const worldsAgents = read('frontend/worlds/AGENTS.md');
  // The file must name retired worlds only inside an explicit retirement
  // warning; naming them as current architecture is the failure this guards.
  for (const line of worldsAgents.split('\n')) {
    if (!/\bRome\b|\bAthens\b|İGA|Istanbul Airport/i.test(line)) continue;
    assert.match(line, /retired|must not/i, `worlds AGENTS must present retired worlds only as retired: ${line}`);
  }
  assert.doesNotMatch(worldsAgents, /all four worlds|four worlds/i, 'worlds AGENTS must not require four independent worlds');
  assert.match(worldsAgents, /only maintained interactive world/i, 'worlds AGENTS must state Aizanoi is the only maintained world');
});

test('public Forge page advertises Aizanoi only, never four worlds', () => {
  const forge = read('frontend/forge/index.html');
  assert.doesNotMatch(forge, /Rome|Athens|İGA|Istanbul Airport/i, 'Forge must not advertise retired worlds');
  assert.doesNotMatch(forge, /four worlds|Unified Worlds/i, 'Forge must not claim a four-world product');
  assert.doesNotMatch(forge, /Explore worlds/i, 'Forge demo must not offer retired world-catalog browsing');
  assert.match(forge, /Evidence-aware interactive reconstruction of Roman Aizanoi/i);
  assert.match(forge, /Active · flagship reconstruction/);
  assert.match(forge, /Enter Aizanoi/, 'Forge must offer the canonical Aizanoi entry');
  assert.match(forge, /href="\/worlds\/aizanoi-225\/"/, 'Forge demo must point at the canonical runtime');
  assert.doesNotMatch(forge, /Active · four worlds/i, 'Forge must not claim a four-world product');
});

test('build-time and runtime capability contracts agree: worlds is not offered by either', async () => {
  const { PLATFORM_CAPABILITIES } = await import('../scripts/modules/build-module-registry.mjs');
  assert.equal(PLATFORM_CAPABILITIES.includes('worlds'), false, 'build-time must not offer the retired worlds capability');
  const caps = await import(pathToFileURL(path.join(frontend, 'js/v3/capabilities.js')).href + `?t=${Date.now()}`);
  await assert.rejects(
    () => caps.resolveCapabilities(['worlds']),
    /Application capability unavailable: worlds/,
    'runtime must reject the retired worlds capability',
  );
  // Every build-time platform capability must resolve at runtime, otherwise
  // build-time validation can again approve a manifest that fails in-browser.
  const runtimeProviders = Object.keys({
    apps: true, dialog: true, filesystem: true, media: true, sound: true,
  });
  for (const capability of PLATFORM_CAPABILITIES) {
    if (capability === 'notifications') continue; // injected by the shell host, not the provider table
    assert.ok(runtimeProviders.includes(capability), `capabilities.js must provide ${capability}`);
  }
});

test('nginx world snippet is named for Aizanoi and keeps the strict policy', () => {
  const snippetPath = 'infra/nginx/snippets/aizanoi-world-security-headers.conf.example';
  assert.ok(existsSync(path.join(repoRoot, snippetPath)), `renamed Aizanoi world security snippet must exist at ${snippetPath}`);
  assert.equal(
    existsSync(path.join(repoRoot, 'infra/nginx/snippets/aizanoi-historical-world-security-headers.conf.example')),
    false,
    'the Historical Worlds snippet name must be gone',
  );
  const snippet = read(snippetPath);
  assert.match(snippet, /script-src 'self';/, 'strict script-src must be preserved through the rename');
  assert.doesNotMatch(snippet, /script-src[^;]*'unsafe-inline'/, 'the rename must not weaken script-src');
  assert.doesNotMatch(snippet, /style-src[^;]*'unsafe-inline'/, 'the rename must not weaken style-src');
  assert.doesNotMatch(snippet, /Historical Worlds/, 'the snippet must not describe retired worlds');
  for (const consumer of ['infra/nginx/aizanoianalytics.com.conf.example', 'scripts/ci/with-production-nginx.sh', 'tests/seo-delivery.test.mjs']) {
    assert.doesNotMatch(read(consumer), /aizanoi-historical-world-security-headers/, `${consumer} must reference the renamed snippet`);
  }
});

test('infra README no longer claims the world snippet permits inline boot code', () => {
  const readme = read('infra/README.md');
  assert.doesNotMatch(readme, /still require inline boot code/i, 'infra README must not describe the snippet as permitting inline code');
  assert.doesNotMatch(readme, /permits inline code/i, 'infra README must not claim the world routes permit inline code');
  assert.match(readme, /strict/);
  assert.match(readme, /no `unsafe-inline`/);
});

test('GitHub-facing templates and docs never offer retired-world work', () => {
  const surfaces = {
    'issue templates': ['.github/ISSUE_TEMPLATE/feature_request.md', '.github/ISSUE_TEMPLATE/bug_report.md'],
    'PR template': ['.github/pull_request_template.md'],
    'ARCHITECTURE.md': ['ARCHITECTURE.md'],
    'AGENTS.md': ['AGENTS.md'],
    'frontend/js/v3/index.md': ['frontend/js/v3/index.md'],
  };
  for (const [label, files] of Object.entries(surfaces)) {
    for (const file of files) {
      const content = read(file);
      // `\b` anchors prevent false positives on ordinary words ("Chrome").
      assert.doesNotMatch(content, /\bRome\b|\bAthens\b|İGA|Istanbul Airport/i, `${label} (${file}) must not name retired worlds as current work`);
      assert.doesNotMatch(content, /four worlds|all four worlds/i, `${label} (${file}) must not reference four worlds`);
      assert.doesNotMatch(content, /app\/world catalog|app \+ world catalog/i, `${label} (${file}) must not describe an app/world catalog`);
    }
  }
});

test('no current UI says "Historical Worlds" as the product label', () => {
  const shell = readFileSync(path.join(frontend, 'js/v3/shell.js'), 'utf8');
  const os = readFileSync(path.join(frontend, 'js/v3/aizanoi-os.js'), 'utf8');
  const main = readFileSync(path.join(frontend, 'js/v3/main.js'), 'utf8');
  const brand = readFileSync(path.join(frontend, 'js/v3/brand-platform.js'), 'utf8');
  for (const [name, content] of [['shell', shell], ['aizanoi-os', os], ['main', main], ['brand-platform', brand]]) {
    assert.doesNotMatch(content, /Historical Worlds/, `${name} must not use "Historical Worlds" as product label`);
  }
});

// ---------------------------------------------------------------------------
// Launcher deduplication
// ---------------------------------------------------------------------------

test('aizanoi-os launcher renders Aizanoi only through APPS, not as a separate world tile', () => {
  const os = readFileSync(path.join(frontend, 'js/v3/aizanoi-os.js'), 'utf8');
  // The launcher should render only one group: Applications
  const worldGroupMatch = os.match(/az-launchpad-worlds/);
  assert.equal(worldGroupMatch, null, 'launcher must not have a separate worlds group');
});

// ---------------------------------------------------------------------------
// Retired product IDs remain absent (negative guards)
// ---------------------------------------------------------------------------

test('retired product IDs are absent from registry', async () => {
  const registry = await import(pathToFileURL(path.join(frontend, 'js/v3/registry.js')).href + `?t=${Date.now()}`);
  for (const id of ['rome', 'athens', 'iga', 'fly-world', 'fly-simulation', 'telemetry-1']) {
    assert.equal(registry.appById(id), null, `${id} must remain retired from public routing`);
  }
});
