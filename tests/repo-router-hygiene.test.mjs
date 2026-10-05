// Guards the routing/documentation layer against drift classes that the existing
// topology gates do not catch:
//
//   1. An `index.md` that no parent router links is an ORPHAN: the area is
//      maintained, but the documented navigation never reaches it. (The existing
//      gates check that links in an index resolve; none check that every index
//      is linked FROM somewhere.)
//   2. A router that backticks a repository path which does not exist sends the
//      next reader into a dead end.
//   3. A router that presents a removed route as a live compatibility redirect
//      is worse than a missing route: it looks resolvable and is not.
//
// The sweeps are repository-wide rather than per-file string lists, so a new
// area is covered the day it lands instead of the day someone remembers to
// extend a list.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { test } from 'node:test';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const SKIP_DIRS = new Set(['.git', 'node_modules', 'artifacts', '__pycache__', 'gelistirmeler']);

function collectMarkdown(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectMarkdown(full, out);
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

const markdownFiles = collectMarkdown(ROOT).map((f) => f.slice(ROOT.length + 1)).sort();
const indexFiles = markdownFiles.filter((f) => f.endsWith('/index.md') || f === 'index.md');

function linksOf(source) {
  const out = [];
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const raw = match[1].trim();
    if (!raw || raw.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(raw)) continue;
    const target = raw.split('#', 1)[0].split('?', 1)[0];
    if (target) out.push(target);
  }
  return out;
}

// The root index is the documented entry point for the whole repository; being
// the entry point is precisely what makes it reachable.
const ENTRY_POINTS = new Set(['index.md']);

// Cumulative ancestor prefixes, nearest first, ending at the repository root.
// `frontend/js/v3/apps/aizanoi/index.md` -> ['frontend/js/v3/apps/aizanoi', 'frontend/js/v3/apps', ... , '']
function ancestors(file) {
  const segments = file.split('/').slice(0, -1);
  const out = [];
  for (let i = segments.length; i > 0; i -= 1) out.push(segments.slice(0, i).join('/'));
  out.push('');
  return out;
}

// Every index.md must be reachable through a real Markdown link from another
// index.md. A backticked directory mention is prose, not navigation: it is how
// `analytics/dashboards/new-hr-collection/` and the retired `/iga/` route ended
// up described but never actually linked.
test('every area index.md is reachable through a Markdown link from a parent router', () => {
  const linked = new Set();
  for (const file of markdownFiles) {
    const dir = file.slice(0, file.lastIndexOf('/') + 1);
    for (const link of linksOf(read(file))) {
      if (link.startsWith('/')) continue;
      // `posix.normalize` resolves `./` and `../` segments against the linking
      // file's own directory, so `../../index.md` from apps/<id>/ lands on the
      // area router it actually names.
      linked.add(normalize(`${dir}${link}`));
    }
  }
  const orphans = [];
  for (const index of indexFiles) {
    if (ENTRY_POINTS.has(index)) continue;
    if (!linked.has(index)) orphans.push(index);
  }
  assert.deepEqual(
    orphans,
    [],
    `index.md files no parent router links (route them with a Markdown link): ${orphans.join(', ')}`,
  );
});

// All repository-relative file paths, for suffix resolution below.
const repoPaths = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else repoPaths.push(full.slice(ROOT.length + 1));
  }
})(ROOT);

test('backtick-quoted repository paths in index.md routers resolve on disk', () => {
  const repoRelative = /`(?!https?:)([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._*-]+)+)`/g;
  const missing = [];
  for (const file of indexFiles) {
    const source = read(file);
    const dirs = ancestors(file);
    for (const [, token] of source.matchAll(repoRelative)) {
      // A leading `/` is a public route, not a repository path.
      if (token.startsWith('/')) continue;
      // Globs, range/prose notation (`flower-01..15.webp`) and language
      // constructs that merely look like paths (`try/catch`) are not literals.
      if (/[*]/.test(token) || token.includes('..') || token === 'try/catch') continue;
      // A documented path may be written relative to the area it describes
      // (`src/index.js` in a module-shape block), so accept it when it resolves
      // from this file's directory, from the repository root, or as the trailing
      // path of a real file anywhere in the tree.
      const resolved =
        dirs.some((dir) => existsSync(join(ROOT, dir, token))) ||
        repoPaths.some((p) => p === token || p.endsWith(`/${token}`));
      if (!resolved) missing.push(`${file}: \`${token}\``);
    }
  }
  assert.deepEqual(missing, [], `router paths that do not exist:\n${missing.join('\n')}`);
});

test('directory-tree blocks in routers list only files that exist', () => {
  // A router's tree diagram is a contract: an agent reads it to find the owner
  // of a file. A listed file that is gone sends them to a dead path that reads
  // as if it exists.
  const missing = [];
  for (const file of indexFiles) {
    const lines = read(file).split('\n');
    // A fenced block that documents a SHAPE (`apps/<id>/…`) lists templates,
    // not real files, so it is skipped entirely.
    const templated = new Set();
    for (let i = 0; i < lines.length; i += 1) {
      if (!lines[i].startsWith('```')) continue;
      const start = i;
      let end = i;
      while (end + 1 < lines.length && !lines[end + 1].startsWith('```')) end += 1;
      if (lines.slice(start, end + 1).some((l) => l.includes('<'))) {
        for (let k = start; k <= end; k += 1) templated.add(k);
      }
      i = end;
    }
    let currentRoot = file.slice(0, file.lastIndexOf('/') + 1).replace(/\/$/, '');
    lines.forEach((line, i) => {
      if (templated.has(i)) return;
      // A fence may document several roots in sequence (`frontend/js/v3/apps/x/`
      // then `frontend/worlds/`). Track the most recent root header so each row
      // resolves against the tree it actually belongs to.
      const rootLine = line.match(/^([A-Za-z0-9._/-]+)\/\s*$/);
      if (rootLine) {
        currentRoot = rootLine[1];
        return;
      }
      // Top-level rows of an ASCII tree only: ├── or └── with nothing before it.
      const match = line.match(/^(?:├──|└──)\s*([A-Za-z0-9._*-]+(?:\.[A-Za-z0-9]+)+)\s*(?:#.*)?$/);
      if (!match) return;
      const token = match[1];
      if (token.includes('*')) return;
      // A tree diagram is rooted at the directory its header names: resolve the
      // entry there only. Falling back to any ancestor would let a module claim
      // ownership of a file that merely shares its name higher in the tree (the
      // dungeon router listed `README.md`, which exists only at the root).
      if (!existsSync(join(ROOT, currentRoot, token))) {
        missing.push(`${file}:${i + 1}: \`${token}\``);
      }
    });
  }
  assert.deepEqual(missing, [], `tree entries in routers that do not exist:\n${missing.join('\n')}`);
});

test('no maintained markdown document is unroutable', () => {
  // Every canonical doc must be reachable from some index or root document. A
  // module-local doc that nothing links (the Labs prompt record, a Blender
  // asset-source note) is maintained but invisible to the next reader.
  const routed = new Set(ENTRY_POINTS);
  for (const file of markdownFiles) {
    const dir = file.slice(0, file.lastIndexOf('/') + 1);
    for (const link of linksOf(read(file))) {
      if (link.startsWith('/')) continue;
      routed.add(normalize(`${dir}${link}`));
    }
  }
  const unrouted = [];
  for (const file of markdownFiles) {
    if (file.startsWith('.github/')) continue; // GitHub surfaces render their own tree
    if (routed.has(file)) continue;
    // A doc may be referenced by name in prose (`assets/SOURCES.md`) rather than
    // as a link, so accept a basename or trailing-path mention too.
    const base = file.split('/').pop();
    const mentioned = markdownFiles.some((other) => {
      if (other === file) return false;
      const text = read(other);
      return text.includes(file) || text.includes(base);
    });
    if (!mentioned) unrouted.push(file);
  }
  assert.deepEqual(unrouted, [], `markdown docs nothing routes or mentions: ${unrouted.join(', ')}`);
});

test('no router presents a removed route as a live compatibility redirect', () => {
  // `/historic-world/` and `/ancient-cities/*` are real redirect documents.
  // `/iga/` was fully removed (no document, no nginx location, live 404) and
  // must not be described as a route that exists.
  const offenders = [];
  for (const file of indexFiles) {
    if (read(file).includes('`/iga/`')) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `routers still describing /iga/ as a route: ${offenders.join(', ')}`);
});

test('documented documentation inventory matches the docs/ directory', () => {
  const onDisk = readdirSync(join(ROOT, 'docs'))
    .filter((f) => f.endsWith('.md') && f !== 'index.md')
    .sort();
  const listed = read('docs/index.md') + read('docs/README.md');
  const unlisted = onDisk.filter((f) => !listed.includes(f));
  assert.deepEqual(unlisted, [], `docs/ files no documentation index routes: ${unlisted.join(', ')}`);
});

test('routers document only the browser suites their owner actually runs', () => {
  // tests/index.md claims "every browser-driving suite has exactly one owner".
  // That claim is only true if the routine-CI row names every suite routine CI
  // runs, so pin the two against each other.
  const ci = read('.github/workflows/ci.yml');
  const docs = read('tests/index.md');
  const routineRow = read('tests/index.md').split('\n').find((line) => line.includes('`Aizanoi CI`')) ?? '';
  const runInCi = [...ci.matchAll(/tests\/browser\/([A-Za-z0-9._-]+\.test\.mjs)/g)].map((m) => m[1]);
  const unlisted = [...new Set(runInCi)].filter((suite) => !routineRow.includes(suite));
  assert.deepEqual(
    unlisted,
    [],
    `tests/browser suites routine CI runs but the tests/index.md Aizanoi CI row omits: ${unlisted.join(', ')}`,
  );
});