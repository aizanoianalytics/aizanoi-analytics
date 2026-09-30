import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  ];
  for (const doc of docs) {
    const content = read(doc);
    assert.doesNotMatch(content, /Rome.*current|Athens.*current|İGA.*current/i, `${doc} must not describe Rome/Athens/İGA as current`);
    assert.doesNotMatch(content, /Fly Simulation.*current|Fly World.*current/i, `${doc} must not describe Fly as current`);
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
