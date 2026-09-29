import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

test('shared GLB assets exist in canonical location', () => {
  const sharedAssets = join(repoRoot, 'frontend/worlds/shared/assets');
  const glbFiles = readdirSync(sharedAssets).filter((f) => f.endsWith('.glb'));
  assert.ok(glbFiles.length >= 7, `expected at least 7 shared GLB assets, got ${glbFiles.length}`);
  const expected = ['scaenae.glb', 'stoa_seg.glb', 'bridge_seg.glb', 'stadium_stand.glb', 'bath_hall.glb', 'theatre_wedge.glb', 'shop_row.glb'];
  for (const f of expected) {
    assert.ok(glbFiles.includes(f), `${f} must exist in shared assets`);
  }
});

test('no duplicate GLB assets remain in world-local folders', () => {
  const shared = new Set(['scaenae.glb', 'stoa_seg.glb', 'bridge_seg.glb', 'stadium_stand.glb', 'bath_hall.glb', 'theatre_wedge.glb', 'shop_row.glb']);
  for (const world of ['aizanoi-225', 'rome-410-476', 'athens-450-430', 'iga-airport']) {
    const assetsDir = join(repoRoot, `frontend/worlds/${world}/assets`);
    if (!existsSync(assetsDir)) continue;
    const glbFiles = readdirSync(assetsDir).filter((f) => f.endsWith('.glb'));
    for (const f of glbFiles) {
      assert.ok(!shared.has(f), `${world}/assets/${f} must not exist (should be in shared/assets/)`);
    }
  }
});

test('world builders reference shared assets via relative path', () => {
  for (const world of ['aizanoi-225', 'rome-410-476']) {
    const builders = readFileSync(join(repoRoot, `frontend/worlds/${world}/js/builders.js`), 'utf8');
    const shared = ['shop_row.glb', 'scaenae.glb', 'stoa_seg.glb', 'theatre_wedge.glb', 'stadium_stand.glb', 'bridge_seg.glb', 'bath_hall.glb'];
    for (const f of shared) {
      assert.ok(!builders.includes(`file: '${f}'`), `${world} builders.js must not reference ${f} locally`);
      assert.ok(builders.includes(`file: '../../shared/assets/${f}'`), `${world} builders.js must reference ${f} via shared path`);
    }
  }
});
