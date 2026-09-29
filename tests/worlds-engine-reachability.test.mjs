// Guards against the "maybe someday" code the consolidation brief forbids:
// "Do NOT leave disabled modules, dead folders, hidden catalog entries,
// compatibility shells, unused tests or 'maybe someday' code."
//
// A shared engine module that nothing imports is exactly that. This test reads
// the actual import graph from the source rather than trusting a hand-kept list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const ENGINE = join(ROOT, 'frontend/worlds/shared/engine');
const read = (p) => readFileSync(p, 'utf8');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// Entry points: modules the product loads on purpose. The engine directory is
// deliberately NOT an entry point -- if it were, every engine file would reach
// itself and the orphan check below would be vacuous.
const worldSources = [
  ...walk(join(ROOT, 'frontend/worlds/aizanoi-225/js')),
  ...walk(join(ROOT, 'frontend/js/v3/apps/aizanoi')),
  ...walk(join(ROOT, 'frontend/dungeon/js'))
].filter((f) => ['.js', '.mjs'].includes(extname(f))
  // Vendored libraries are not ours to judge.
  && !f.includes(`${ROOT}frontend/worlds/shared/vendor`)
  && !f.includes(`${ROOT}frontend/js/v3/vendor`));

/** Every module specifier the given source file imports, resolved to a path. */
function importsOf(file) {
  const source = read(file);
  const specs = [
    ...source.matchAll(/(?:^|\n)\s*import\s[^'"]*['"]([^'"]+)['"]/g),
    ...source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...source.matchAll(/\bexport\s+(?:\*|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/g)
  ].map((m) => m[1]);
  return specs.map((spec) => {
    if (!spec.startsWith('.')) return null; // bare specifier: a package or global
    return join(dirname(file), spec);
  }).filter(Boolean);
}

function dirname(file) {
  return file.slice(0, file.lastIndexOf('/'));
}

test('every shared engine module is actually imported by something', () => {
  const reachable = new Set();
  const queue = [...worldSources];
  while (queue.length) {
    const file = queue.pop();
    if (reachable.has(file)) continue;
    reachable.add(file);
    for (const target of importsOf(file)) queue.push(target);
  }

  const orphans = readdirSync(ENGINE)
    .filter((f) => f.endsWith('.js'))
    .map((f) => join(ENGINE, f))
    .filter((f) => !reachable.has(f));

  assert.deepEqual(
    orphans.map((f) => relative(ROOT, f)),
    [],
    `unreferenced engine modules are "maybe someday" code and must be deleted: ${orphans.map((f) => relative(ROOT, f)).join(', ')}`
  );
});

test('the engine module set is the one the world actually uses', () => {
  // A named regression for the instanced-kit.js removal: it was well written,
  // never imported, and had no tests, so nothing would have noticed it rotting.
  assert.equal(existsSync(join(ENGINE, 'instanced-kit.js')), false,
    'the unreferenced draw-call batching module must stay deleted');

  // The live instancing path is vegetation.js, which is genuinely wired in.
  const vegetation = read(join(ENGINE, 'vegetation.js'));
  assert.match(vegetation, /new THREE\.InstancedMesh/,
    'vegetation must keep doing the instancing that instanced-kit.js never did');
  const mainJs = read(join(ROOT, 'frontend/worlds/aizanoi-225/js/main.js'));
  assert.match(mainJs, /VegetationSystem/,
    'the world must actually construct the vegetation system');
});

test('no shared engine module is a bare re-export facade', () => {
  // A facade that only forwards to a single target is a compatibility shell.
  // If one appears here it needs a stated reason to exist.
  const facades = [];
  for (const file of readdirSync(ENGINE).filter((f) => f.endsWith('.js'))) {
    const source = read(join(ENGINE, file));
    const body = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .trim();
    const lines = body.split('\n').filter((l) => l.trim());
    if (lines.length > 0 && lines.every((l) => /^(export|import|\}|\{)/.test(l.trim()))) {
      facades.push(file);
    }
  }
  assert.deepEqual(facades, [], `engine facades must not exist: ${facades.join(', ')}`);
});
