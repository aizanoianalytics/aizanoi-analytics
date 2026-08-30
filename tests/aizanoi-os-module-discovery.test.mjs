import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  DEFAULT_OUTPUT,
  buildRegistrySource,
  discoverModules,
} from '../scripts/modules/build-module-registry.mjs';

async function writeFixtureModule(appsRoot, id, overrides = {}) {
  const moduleDir = path.join(appsRoot, id);
  await mkdir(path.join(moduleDir, 'src'), { recursive: true });
  await writeFile(path.join(moduleDir, 'src/index.js'), 'export function mount() {}\n', 'utf8');
  const manifest = {
    manifestVersion: 1,
    id,
    type: 'desktop-app',
    entry: './src/index.js',
    enabledByDefault: true,
    requires: [],
    provides: ['desktop-app'],
    ...overrides,
  };
  await writeFile(path.join(moduleDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return moduleDir;
}

test('actual module manifests generate the committed wiring exactly', async () => {
  const modules = await discoverModules();
  const ids = modules.map((module) => module.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a.localeCompare(b, 'en')), 'discovery order must be deterministic');
  assert.equal(new Set(ids).size, ids.length, 'module ids must be unique');

  const notepad = modules.find((module) => module.id === 'notepad');
  assert.ok(notepad, 'Notepad pilot manifest must be discoverable');
  assert.equal(notepad.entry, '/js/v3/apps/notepad/src/index.js');
  assert.equal(notepad.enabledByDefault, true);

  const committed = await readFile(DEFAULT_OUTPUT, 'utf8');
  assert.equal(committed, buildRegistrySource(modules), 'generated module wiring is stale');
});

test('generated wiring contains runtime wiring, not duplicate public catalog metadata', async () => {
  const source = await readFile(DEFAULT_OUTPUT, 'utf8');
  assert.match(source, /INSTALLED_MODULES/);
  assert.match(source, /enabledModuleById/);
  assert.doesNotMatch(source, /\blabel\s*:/);
  assert.doesNotMatch(source, /\bdescription\s*:/);
  assert.doesNotMatch(source, /\bkeywords\s*:/);
});

test('registry resolves migrated Notepad through generated wiring', async () => {
  const registry = await import('../frontend/js/v3/registry.js');
  assert.equal(registry.appById('notepad')?.module, '/js/v3/apps/notepad/src/index.js');
});

test('discovery is deterministic and preserves explicit disabled state', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'aizanoi-modules-'));
  try {
    await writeFixtureModule(root, 'zeta');
    await writeFixtureModule(root, 'alpha', { enabledByDefault: false, requires: ['filesystem', 'dialog'] });
    const modules = await discoverModules({ appsRoot: root });
    assert.deepEqual(modules.map((module) => module.id), ['alpha', 'zeta']);
    assert.equal(modules[0].enabledByDefault, false);
    assert.deepEqual([...modules[0].requires], ['dialog', 'filesystem']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('manifest public entry cannot escape its module directory', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'aizanoi-modules-'));
  try {
    await writeFixtureModule(root, 'escape', { entry: './../outside.js' });
    await writeFile(path.join(root, 'outside.js'), 'export function mount() {}\n', 'utf8');
    await assert.rejects(
      () => discoverModules({ appsRoot: root }),
      /entry must be a relative \.\/ JavaScript public entry/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
