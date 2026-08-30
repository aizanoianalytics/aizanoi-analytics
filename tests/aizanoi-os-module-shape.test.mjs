import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_APPS_ROOT,
  discoverModules,
} from '../scripts/modules/build-module-registry.mjs';

const repoRoot = process.cwd();

function relative(file) {
  return path.relative(repoRoot, file).replaceAll(path.sep, '/');
}

test('AizanoiOS app root contains module directories, not flat JavaScript implementations', () => {
  const entries = readdirSync(DEFAULT_APPS_ROOT, { withFileTypes: true });
  const flatImplementations = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(
    flatImplementations,
    [],
    `Flat app implementations returned under ${relative(DEFAULT_APPS_ROOT)}: ${flatImplementations.join(', ')}`
  );
});

test('every discovered public app module has the canonical navigation, manifest and public-entry shape', async () => {
  const modules = await discoverModules();
  assert.ok(modules.length > 0, 'No AizanoiOS application modules were discovered');

  for (const module of modules) {
    const moduleRoot = path.join(DEFAULT_APPS_ROOT, module.id);
    const required = [
      path.join(moduleRoot, 'index.md'),
      path.join(moduleRoot, 'manifest.json'),
      path.join(moduleRoot, 'src/index.js'),
    ];

    for (const file of required) {
      assert.equal(existsSync(file), true, `${module.id} is missing canonical module file ${relative(file)}`);
    }
  }
});

test('every top-level app directory is discoverable through a manifest', async () => {
  const modules = await discoverModules();
  const discovered = modules.map((module) => module.id).sort();
  const directories = readdirSync(DEFAULT_APPS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(
    directories,
    discovered,
    'An app directory exists outside manifest discovery or a discovered module is missing its directory'
  );
});

test('canonical public app catalog is one-to-one with manifest modules and contains no direct module paths', async () => {
  const modules = await discoverModules();
  const discovered = modules.map((module) => module.id).sort();
  const registry = readFileSync(path.join(repoRoot, 'frontend/js/v3/registry.js'), 'utf8');
  const definitions = registry.match(/const APP_DEFINITIONS = Object\.freeze\(\[\n([\s\S]*?)\n\]\);/)?.[1] || '';

  assert.ok(definitions, 'Could not locate canonical APP_DEFINITIONS catalog');
  assert.doesNotMatch(
    definitions,
    /\bmodule\s*:/,
    'Canonical app metadata must use moduleId, never a direct module implementation path'
  );

  const catalogIds = [...definitions.matchAll(/\{\s*id:'([^']+)'/g)].map((match) => match[1]).sort();
  const moduleRefs = [...definitions.matchAll(/\bmoduleId:'([^']+)'/g)].map((match) => match[1]).sort();

  assert.deepEqual(catalogIds, discovered, 'Public app ids and discovered manifest module ids diverged');
  assert.deepEqual(moduleRefs, discovered, 'Every public app must resolve through its matching manifest moduleId');
});
