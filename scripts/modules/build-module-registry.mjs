import { access, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DEFAULT_APPS_ROOT = path.join(repoRoot, 'frontend/js/v3/apps');
export const DEFAULT_OUTPUT = path.join(repoRoot, 'frontend/js/v3/module-registry.generated.js');
export const PLATFORM_CAPABILITIES = Object.freeze(['apps', 'dialog', 'filesystem', 'media', 'notifications', 'sound', 'worlds']);

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CAPABILITY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLATFORM_CAPABILITY_SET = new Set(PLATFORM_CAPABILITIES);

function fail(source, message) {
  throw new Error(`${source}: ${message}`);
}

function assertStringArray(value, field, source) {
  if (!Array.isArray(value)) fail(source, `${field} must be an array`);
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== 'string' || !CAPABILITY_PATTERN.test(item)) {
      fail(source, `${field} entries must be lowercase capability ids`);
    }
    if (seen.has(item)) fail(source, `${field} contains duplicate capability: ${item}`);
    seen.add(item);
  }
  return [...value].sort();
}

export async function validateManifest(manifest, { moduleDir, manifestPath }) {
  const source = path.relative(repoRoot, manifestPath).replaceAll(path.sep, '/');
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    fail(source, 'manifest must be a JSON object');
  }
  if (manifest.manifestVersion !== 1) fail(source, 'manifestVersion must be 1');
  if (typeof manifest.id !== 'string' || !ID_PATTERN.test(manifest.id)) {
    fail(source, 'id must be a lowercase kebab-case identifier');
  }
  if (manifest.id !== path.basename(moduleDir)) {
    fail(source, `id must match module directory name (${path.basename(moduleDir)})`);
  }
  if (manifest.type !== 'desktop-app') fail(source, 'type must be desktop-app in the AizanoiOS app registry');
  if (typeof manifest.enabledByDefault !== 'boolean') fail(source, 'enabledByDefault must be boolean');
  if (typeof manifest.entry !== 'string' || !manifest.entry.startsWith('./') || !manifest.entry.endsWith('.js')) {
    fail(source, 'entry must be a relative ./ JavaScript public entry');
  }

  const entryPath = path.resolve(moduleDir, manifest.entry);
  const relativeEntry = path.relative(moduleDir, entryPath);
  if (!relativeEntry || relativeEntry.startsWith('..') || path.isAbsolute(relativeEntry)) {
    fail(source, 'entry must stay inside its module directory');
  }
  try {
    const info = await stat(entryPath);
    if (!info.isFile()) fail(source, 'entry must resolve to a file');
  } catch (error) {
    if (error?.code === 'ENOENT') fail(source, `entry does not exist: ${manifest.entry}`);
    throw error;
  }

  const requires = assertStringArray(manifest.requires, 'requires', source);
  const provides = assertStringArray(manifest.provides, 'provides', source);
  const publicEntry = `/${path.relative(path.join(repoRoot, 'frontend'), entryPath).replaceAll(path.sep, '/')}`;

  return Object.freeze({
    manifestVersion: 1,
    id: manifest.id,
    type: manifest.type,
    entry: publicEntry,
    enabledByDefault: manifest.enabledByDefault,
    requires: Object.freeze(requires),
    provides: Object.freeze(provides),
  });
}

export function validateModuleDependencies(modules) {
  const providers = new Map();
  const graph = new Map(modules.map((module) => [module.id, new Set()]));

  for (const module of modules) {
    for (const capability of module.provides) {
      const owners = providers.get(capability) || [];
      owners.push(module.id);
      providers.set(capability, owners);
    }
  }

  for (const module of modules) {
    for (const capability of module.requires) {
      if (PLATFORM_CAPABILITY_SET.has(capability)) continue;
      const owners = providers.get(capability) || [];
      if (!owners.length) fail(`module ${module.id}`, `requires unavailable capability: ${capability}`);
      if (owners.length > 1) {
        fail(`module ${module.id}`, `requires ambiguous capability ${capability} provided by: ${owners.join(', ')}`);
      }
      graph.get(module.id).add(owners[0]);
    }
  }

  const visited = new Set();
  const visiting = new Set();
  const stack = [];
  const visit = (id) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      const cycle = [...stack.slice(start), id].join(' -> ');
      fail('module dependency graph', `cycle detected: ${cycle}`);
    }
    visiting.add(id);
    stack.push(id);
    for (const dependency of graph.get(id) || []) visit(dependency);
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  };
  for (const module of modules) visit(module.id);
  return true;
}

export async function discoverModules({ appsRoot = DEFAULT_APPS_ROOT } = {}) {
  const entries = (await readdir(appsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));

  const modules = [];
  const ids = new Set();
  for (const entry of entries) {
    const moduleDir = path.join(appsRoot, entry.name);
    const manifestPath = path.join(moduleDir, 'manifest.json');
    try {
      await access(manifestPath);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }

    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    } catch (error) {
      fail(path.relative(repoRoot, manifestPath), `invalid JSON (${error.message})`);
    }
    const validated = await validateManifest(manifest, { moduleDir, manifestPath });
    if (ids.has(validated.id)) fail(path.relative(repoRoot, manifestPath), `duplicate module id: ${validated.id}`);
    ids.add(validated.id);
    modules.push(validated);
  }

  const sorted = modules.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  validateModuleDependencies(sorted);
  return Object.freeze(sorted);
}

function js(value) {
  return JSON.stringify(value);
}

export function buildRegistrySource(modules) {
  const rows = modules.map((module) => `  Object.freeze({\n    manifestVersion: 1,\n    id: ${js(module.id)},\n    type: ${js(module.type)},\n    entry: ${js(module.entry)},\n    enabledByDefault: ${module.enabledByDefault},\n    requires: Object.freeze(${js([...module.requires])}),\n    provides: Object.freeze(${js([...module.provides])}),\n  })`).join(',\n');

  return `/* AUTO-GENERATED by scripts/modules/build-module-registry.mjs. DO NOT EDIT. */\nexport const INSTALLED_MODULES = Object.freeze([\n${rows}\n]);\n\nconst MODULE_MAP = new Map(INSTALLED_MODULES.map((module) => [module.id, module]));\n\nexport function moduleById(id) {\n  return MODULE_MAP.get(String(id || '')) || null;\n}\n\nexport function enabledModuleById(id) {\n  const module = moduleById(id);\n  return module?.enabledByDefault ? module : null;\n}\n`;
}

export async function expectedRegistry({ appsRoot = DEFAULT_APPS_ROOT } = {}) {
  return buildRegistrySource(await discoverModules({ appsRoot }));
}

export async function writeRegistry({ appsRoot = DEFAULT_APPS_ROOT, output = DEFAULT_OUTPUT } = {}) {
  const source = await expectedRegistry({ appsRoot });
  await writeFile(output, source, 'utf8');
  return source;
}

export async function checkRegistry({ appsRoot = DEFAULT_APPS_ROOT, output = DEFAULT_OUTPUT } = {}) {
  const expected = await expectedRegistry({ appsRoot });
  let actual = '';
  try {
    actual = await readFile(output, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (actual !== expected) {
    throw new Error(`Generated module wiring is stale. Run: node scripts/modules/build-module-registry.mjs`);
  }
  return true;
}

async function main() {
  if (process.argv.includes('--check')) {
    await checkRegistry();
    console.log('Module manifests and generated wiring are valid.');
  } else {
    const modules = await discoverModules();
    await writeFile(DEFAULT_OUTPUT, buildRegistrySource(modules), 'utf8');
    console.log(`Generated ${path.relative(repoRoot, DEFAULT_OUTPUT)} from ${modules.length} module manifest(s).`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
