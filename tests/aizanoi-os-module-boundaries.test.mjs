import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  DEFAULT_APPS_ROOT,
  buildRegistrySource,
  discoverModules,
} from '../scripts/modules/build-module-registry.mjs';

const repoRoot = process.cwd();
const v3Root = path.join(repoRoot, 'frontend/js/v3');

function listFiles(root, predicate = () => true) {
  const out = [];
  if (!existsSync(root)) return out;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, predicate));
    else if (predicate(full)) out.push(full);
  }
  return out;
}

function importSpecifiers(source) {
  const specs = [];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specs.push(match[1]);
  }
  return specs;
}

function resolveBrowserSpecifier(sourceFile, specifier) {
  if (specifier.startsWith('/js/v3/')) {
    return path.join(repoRoot, 'frontend', specifier.slice(1));
  }
  if (specifier.startsWith('.')) {
    return path.resolve(path.dirname(sourceFile), specifier);
  }
  return null;
}

function inside(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('migrated modules do not import another module private file or concrete Workspace implementation', async () => {
  const modules = await discoverModules();
  const roots = new Map(modules.map((module) => [module.id, path.join(DEFAULT_APPS_ROOT, module.id)]));
  const publicEntries = new Map(modules.map((module) => [
    module.id,
    path.join(repoRoot, 'frontend', module.entry.replace(/^\//, '')),
  ]));
  const workspaceRoot = path.join(v3Root, 'workspace');
  const offenders = [];

  for (const sourceFile of listFiles(v3Root, (file) => file.endsWith('.js'))) {
    const owner = modules.find((module) => inside(roots.get(module.id), sourceFile))?.id || null;
    const source = readFileSync(sourceFile, 'utf8');
    for (const specifier of importSpecifiers(source)) {
      const target = resolveBrowserSpecifier(sourceFile, specifier);
      if (!target) continue;

      if (owner && inside(workspaceRoot, target)) {
        offenders.push(`${path.relative(repoRoot, sourceFile)} -> ${specifier} (concrete Workspace import)`);
        continue;
      }

      for (const module of modules) {
        const moduleRoot = roots.get(module.id);
        if (!inside(moduleRoot, target)) continue;
        const sameModule = owner === module.id;
        const publicEntry = path.normalize(publicEntries.get(module.id));
        if (!sameModule && path.normalize(target) !== publicEntry) {
          offenders.push(`${path.relative(repoRoot, sourceFile)} -> ${specifier} (${module.id} private import)`);
        }
      }
    }
  }

  assert.deepEqual(offenders, [], `Module boundary violations:\n${offenders.join('\n')}`);
});

test('canonical app catalog references every migrated app by moduleId and tolerates absence', async () => {
  const modules = await discoverModules();
  const registry = readFileSync('frontend/js/v3/registry.js', 'utf8');
  assert.match(registry, /if \(!installed\) return null;/, 'registry must omit a missing/disabled migrated module');
  assert.match(registry, /APP_DEFINITIONS\.map\(resolveAppDefinition\)\.filter\(Boolean\)/, 'registry must filter absent modules');

  for (const module of modules) {
    const id = escapeRegex(module.id);
    assert.match(
      registry,
      new RegExp(`id:['"]${id}['"][^\n]+moduleId:['"]${id}['"]`),
      `${module.id} must be cataloged through moduleId rather than a direct private path`
    );
  }
});

test('every current optional module can be unplugged from generated wiring without touching the others', async () => {
  const modules = await discoverModules();
  const ids = modules.map((module) => module.id);

  for (const removedId of ids) {
    const tempRoot = mkdtempSync(path.join(tmpdir(), `aizanoi-unplug-${removedId}-`));
    try {
      for (const module of modules) {
        if (module.id === removedId) continue;
        cpSync(path.join(DEFAULT_APPS_ROOT, module.id), path.join(tempRoot, module.id), { recursive: true });
      }
      const remaining = await discoverModules({ appsRoot: tempRoot });
      const remainingIds = remaining.map((module) => module.id);
      assert.deepEqual(remainingIds, ids.filter((id) => id !== removedId), `${removedId} removal changed unrelated discovery`);

      const generated = buildRegistrySource(remaining);
      assert.doesNotMatch(generated, new RegExp(`id: ${JSON.stringify(removedId)}`), `${removedId} stayed in generated wiring after removal`);
      for (const survivor of remainingIds) {
        assert.match(generated, new RegExp(`id: ${JSON.stringify(survivor)}`), `${survivor} disappeared when ${removedId} was removed`);
      }
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }
});

test('module public entries are the only cross-module source files treated as public', async () => {
  const modules = await discoverModules();
  for (const module of modules) {
    const moduleRoot = path.join(DEFAULT_APPS_ROOT, module.id);
    const publicEntry = path.join(repoRoot, 'frontend', module.entry.replace(/^\//, ''));
    assert.ok(inside(moduleRoot, publicEntry), `${module.id} public entry escaped its module root`);
    assert.equal(path.relative(moduleRoot, publicEntry).replaceAll(path.sep, '/'), 'src/index.js');
  }
});
