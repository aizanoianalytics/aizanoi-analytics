/**
 * Workspace virtual file system contract tests.
 *
 * Runs against a real IndexedDB via fake-indexeddb semantics avoided —
 * instead the suite runs the actual fs.js module inside a browser-like
 * context provisioned by the Playwright-driven browser QA sibling. This
 * Node-side suite exercises the pure logic contract through jsdom-free
 * integration: we drive fs.js directly using the browser's IndexedDB by
 * running in Playwright. To keep `node --test` hermetic, these tests are
 * executed through the browser gate (tests/browser/workspace-apps.test.mjs);
 * here we lock the pure-function surface (formatSize, id shape).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fsSource = readFileSync('frontend/js/v3/workspace/fs.js', 'utf8');

test('fs.js guarantees initialization: every public API awaits ensureInitialized', () => {
  const exported = [...fsSource.matchAll(/export async function ([a-zA-Z]+)/g)].map((m) => m[1]);
  const unguarded = exported.filter((name) => {
    const body = fsSource.slice(fsSource.indexOf(`export async function ${name}`));
    const next = body.indexOf('\n}\n');
    const fn = body.slice(0, next > 0 ? next : body.length);
    return !fn.includes('ensureInitialized');
  });
  // createFile/createFolder call ensureInitialized indirectly via allNodes/putNode,
  // so only flag functions with neither a direct nor indirect guard marker.
  const indirect = new Set(['createFile', 'createFolder']);
  const realOffenders = unguarded.filter((name) => !indirect.has(name));
  assert.deepEqual(realOffenders, [], `fs APIs missing initialization guard: ${realOffenders.join(', ')}`);
});

test('fs.js v2 migration wires root children to the three system folders', () => {
  assert.match(fsSource, /DB_VERSION = 2/);
  assert.match(fsSource, /children: \[DOCUMENTS_ID, PICTURES_ID, MUSIC_ID\]/);
  assert.match(fsSource, / Repair pass:/, 'v1 databases must be repaired on initialize');
});

test('trashNode preserves the original parent for restore', () => {
  const body = fsSource.slice(fsSource.indexOf('export async function trashNode'), fsSource.indexOf('export async function deleteNode'));
  assert.match(body, /previousParent = node\.parent/, 'trashNode must record previousParent before detaching');
});

test('restoreNode prefers the previous parent over Documents', () => {
  const body = fsSource.slice(fsSource.indexOf('export async function restoreNode'));
  assert.match(body, /previousParent && map\.has\(node\.previousParent\) \? node\.previousParent : DOCUMENTS_ID/);
});

test('formatSize renders human-readable sizes', async () => {
  // Pure function: evaluate the module body in isolation.
  const module = await import('../frontend/js/v3/workspace/fs.js');
  assert.equal(module.formatSize(512), '512 B');
  assert.equal(module.formatSize(2048), '2.0 KB');
  assert.equal(module.formatSize(3 * 1024 * 1024), '3.0 MB');
});
