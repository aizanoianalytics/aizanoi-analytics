import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const SKIP_DIRS = new Set(['.git', 'node_modules', 'artifacts']);

function collectIndexes(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectIndexes(full, out);
    else if (entry.isFile() && entry.name === 'index.md') out.push(full);
  }
  return out;
}

function relative(file) {
  return path.relative(repoRoot, file).replaceAll(path.sep, '/');
}

function localMarkdownLinks(source) {
  const links = [];
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim();
    if (!target || target.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
    target = target.split('#', 1)[0].split('?', 1)[0];
    if (!target) continue;
    try { target = decodeURIComponent(target); } catch (_) {}
    links.push(target);
  }
  return links;
}

test('repository index routers do not point at missing local files or directories', () => {
  const indexes = collectIndexes(repoRoot).sort();
  assert.ok(indexes.length >= 8, `Expected repository routing indexes, found only ${indexes.length}`);

  const broken = [];
  for (const indexFile of indexes) {
    const source = readFileSync(indexFile, 'utf8');
    for (const target of localMarkdownLinks(source)) {
      const resolved = path.resolve(path.dirname(indexFile), target);
      const withinRepo = resolved === repoRoot || resolved.startsWith(`${repoRoot}${path.sep}`);
      if (!withinRepo) {
        broken.push(`${relative(indexFile)} -> ${target} (escapes repository)`);
        continue;
      }
      if (!existsSync(resolved)) broken.push(`${relative(indexFile)} -> ${target}`);
    }
  }

  assert.deepEqual(broken, [], `Broken repository index routes:\n${broken.join('\n')}`);
});
