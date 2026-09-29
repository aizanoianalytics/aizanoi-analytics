import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const runtime = fs.readFileSync(new URL('../frontend/labs/fly-world/glb-runtime-v3.js', import.meta.url), 'utf8');

// Dark metallic GLB materials with no environment map render as pure black
// voids (the wood stove read as a silhouette). The runtime must tame dark
// metals after load: this locks the stabilization call and its trigger.
test('fly house tames dark metals after GLB load', () => {
  assert.ok(runtime.includes('stabilizeDarkMetals(gltf.scene)'), 'stabilizer must run on the loaded GLB scene');
  assert.ok(runtime.includes('material.metalness = '), 'stabilizer must lower metalness of dark metals');
});

test('fly house keeps a shadow-side fill light', () => {
  assert.ok(runtime.includes('southFill'), 'a dim fill must lift sun-shadowed faces crushing to black');
});
