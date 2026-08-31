/**
 * Workspace virtual file system contract tests.
 *
 * Browser QA exercises real IndexedDB behavior. This hermetic Node suite locks
 * the source-level invariants that protect initialization, atomic mutations,
 * migration repair and safe restore semantics.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fsSource = readFileSync('frontend/js/v3/workspace/fs.js', 'utf8');

function exportedBody(name) {
  const start = fsSource.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} export missing`);
  const next = fsSource.indexOf('\nexport ', start + 1);
  return fsSource.slice(start, next === -1 ? fsSource.length : next);
}

test('fs.js guarantees initialization through guarded read helpers and one mutation gateway', () => {
  assert.match(fsSource, /async function mutateNodes\(mutator\)[\s\S]*?await ensureInitialized\(\)/);
  for (const helper of ['allNodes', 'getNode', 'putNode']) {
    assert.match(exportedBody(helper), /await ensureInitialized\(\)/, `${helper} must guard initialization`);
  }
  for (const name of ['createFile', 'createFolder', 'renameNode', 'updateFileContent', 'trashNode', 'deleteNode', 'restoreNode', 'emptyRecycleBin']) {
    assert.match(exportedBody(name), /mutateNodes\(/, `${name} must use the initialized atomic mutation gateway`);
  }
  assert.match(exportedBody('childrenOf'), /await allNodes\(\)/);
  assert.match(exportedBody('readFileBlob'), /await getNode\(id\)/);
});

test('fs.js v2 migration wires root children to system folders while preserving user folders', () => {
  assert.match(fsSource, /DB_VERSION = 2/);
  assert.match(fsSource, /children: \[DOCUMENTS_ID, PICTURES_ID, MUSIC_ID\]/);
  assert.match(fsSource, /const userExtras = current\.children\.filter/);
  assert.match(fsSource, /const repaired = \[\.\.\.new Set\(\[\.\.\.spec\.children, \.\.\.userExtras\]\)\]/);
});

test('trashNode preserves the original parent for restore', () => {
  const body = fsSource.slice(fsSource.indexOf('export async function trashNode'), fsSource.indexOf('export async function deleteNode'));
  assert.match(body, /node\.previousParent = node\.parent/, 'trashNode must record previousParent before detaching');
});

test('restoreNode accepts only a usable previous folder and otherwise falls back to Documents', () => {
  assert.match(fsSource, /function usableRestoreParent\(map, id\)/);
  assert.match(fsSource, /node\.id === RECYCLE_ID/);
  assert.match(fsSource, /cursor\.parent === RECYCLE_ID/);
  const body = exportedBody('restoreNode');
  assert.match(body, /usableRestoreParent\(map, node\.previousParent\) \|\| map\.get\(DOCUMENTS_ID\)/);
});

test('formatSize renders human-readable sizes', async () => {
  const module = await import('../frontend/js/v3/workspace/fs.js');
  assert.equal(module.formatSize(512), '512 B');
  assert.equal(module.formatSize(2048), '2.0 KB');
  assert.equal(module.formatSize(3 * 1024 * 1024), '3.0 MB');
});
