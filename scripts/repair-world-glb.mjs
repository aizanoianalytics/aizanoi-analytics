#!/usr/bin/env node
/**
 * Drop the stray far-field geometry from a world GLB by rewriting its JSON chunk.
 *
 * `aizanoi-225/assets/temple_of_zeus.glb` carries 36 `col_*` column primitives
 * whose POSITION data sits at z = 998.77 .. 1001.23 while their node
 * translations are near zero -- the signature of a Blender export that merged
 * a second, displaced copy of the colonnade into the file. Because the offset is
 * baked into the accessor, no node transform can hide it, and the asset's bounds
 * come out as 58 x 20 x 1020 instead of 58 x 20 z = 38. The dropped court kit
 * named the same columns `ionic_column` at a correct z = -9, which is why the
 * name alone is not evidence of a foreign object.
 *
 * The repair removes those nodes and the meshes they reach. Meshes are left in
 * `meshes[]` and accessors/bufferViews in place: they are shared, so renumbering
 * would corrupt the surviving geometry, and an unused entry costs nothing. The
 * BIN chunk is copied byte for byte, so every surviving accessor still reads the
 * same data.
 *
 * Usage: node scripts/repair-world-glb.mjs [--write] [--asset <path>]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const args = process.argv.slice(2);
const write = args.includes('--write');
const assetFlag = args.indexOf('--asset');
const TARGET = assetFlag >= 0
  ? args[assetFlag + 1]
  : `${ROOT}frontend/worlds/aizanoi-225/assets/temple_of_zeus.glb`;

/** Accessor Z is in whole units; a real building's parts are not 1 km out. */
const FAR_FIELD = 500;
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const ELEMENT = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

const file = readFileSync(TARGET);
if (file.toString('ascii', 0, 4) !== 'glTF') throw new Error('not a GLB: bad magic');

const jsonLength = file.readUInt32LE(12);
if (file.toString('ascii', 16, 20) !== 'JSON') throw new Error('first chunk is not JSON');
const json = JSON.parse(file.toString('utf8', 20, 20 + jsonLength));

// Locate the BIN chunk by signature, scanning rather than by arithmetic.
//
// This file's JSON chunk declares a length 4 bytes shorter than the JSON it
// actually contains: the 4 bytes at the declared end are the real tail of the
// document, not alignment padding. Trusting `align4(20 + jsonLength)` therefore
// lands on the length field instead of the signature. The window starts at the
// declared end and the signature is looked for within it.
const align4 = (n) => (n + 3) & ~3;
const windowStart = 20 + jsonLength;
let binStart = -1;
let binLength = -1;
for (let off = windowStart; off <= align4(windowStart) + 8; off++) {
  if (file.toString('ascii', off, off + 4) !== 'BIN\0') continue;
  // length-first, which is what this asset uses: the length sits 4 bytes before
  // the signature and the payload starts right after it.
  const first = file.readUInt32LE(off - 4);
  if (first > 0 && off + 4 + first === file.length) {
    binStart = off + 4;
    binLength = first;
    break;
  }
  // standard glTF 2.0 layout, in case another asset is passed in
  const second = file.readUInt32LE(off + 4);
  if (second > 0 && off + 8 + second === file.length) {
    binStart = off + 8;
    binLength = second;
    break;
  }
}
if (binStart < 0) throw new Error('BIN chunk length does not match the file size; refusing to guess');
const bin = file.subarray(binStart, binStart + binLength);
const lengthFirst = binStart - 8 >= 0 && file.readUInt32LE(binStart - 8) === binLength;

// --- Which nodes are displaced? -------------------------------------------------
const positionZ = (node) => {
  const mesh = json.meshes[node.mesh];
  const accessor = json.accessors[mesh?.primitives?.[0]?.attributes?.POSITION];
  if (!accessor) return null;
  const centre = (accessor.max[2] + accessor.min[2]) / 2;
  const scale = node.scale?.[2] ?? 1;
  return centre * scale + (node.translation?.[2] ?? 0);
};

const displaced = new Set();
for (const [index, node] of json.nodes.entries()) {
  const z = positionZ(node);
  if (z !== null && Math.abs(z) > FAR_FIELD) displaced.add(index);
}

const keptNodes = json.nodes.filter((_, i) => !displaced.has(i));
if (displaced.size === 0) {
  console.log(`${TARGET}: no displaced geometry found; nothing to do`);
  process.exit(0);
}

// --- Report, and prove the surviving geometry is intact. ------------------------
const usedMeshes = new Set(keptNodes.map((n) => n.mesh).filter((m) => m !== undefined));
const bufferLength = json.buffers?.[0]?.byteLength ?? 0;
for (const [index, node] of keptNodes.entries()) {
  for (const primitive of json.meshes[node.mesh]?.primitives ?? []) {
    const keys = [primitive.indices, ...Object.values(primitive.attributes ?? {})];
    for (const key of keys) {
      if (key === undefined) continue;
      const view = json.bufferViews[json.accessors[key]?.bufferView];
      if (!view) continue;
      const accessor = json.accessors[key];
      const need = accessor.count
        * (COMPONENTS[accessor.type] ?? 1)
        * (ELEMENT[accessor.componentType] ?? 4);
      if ((view.byteOffset ?? 0) + need > binLength || (view.byteOffset ?? 0) + need > bufferLength) {
        throw new Error(
          `kept node ${index} (${node.name}) needs bytes past the end of the buffer; refusing to write`,
        );
      }
    }
  }
}

const zCentres = [...new Set([...displaced].map((i) => Math.round(positionZ(json.nodes[i]))))];
console.log(`${TARGET}: ${json.nodes.length} nodes -> ${keptNodes.length}`);
console.log(`  dropping ${displaced.size} displaced nodes, z centre(s): ${zCentres.join(', ')}`);
console.log(`  keeping: ${keptNodes.map((n) => n.name).join(', ')}`);
console.log(`  BIN: declared ${bufferLength}, on disk ${binLength}, copied verbatim`);

if (!write) {
  console.log('  --check only; pass --write to apply');
  process.exit(0);
}

// --- Rewrite ------------------------------------------------------------------
// Renumbering is mandatory, not optional: `nodes[i].mesh` indexes `meshes[]`, so
// dropping nodes without dropping their meshes leaves every surviving node
// pointing at the wrong geometry. Accessors and bufferViews are left alone -- they
// are reached by index from the surviving primitives, and the BIN chunk is copied
// byte for byte, so their data is still where the file says it is.
const dropMeshes = new Set(
  [...displaced].map((i) => json.nodes[i].mesh).filter((m) => m !== undefined),
);
const meshRemap = new Map();
{
  // The original index space has to be captured before filtering, or the remap
  // is computed over the already-shortened array and every node ends up wrong.
  const originalCount = json.meshes.length;
  json.meshes = json.meshes.filter((_, i) => !dropMeshes.has(i));
  let next = 0;
  for (let oldIndex = 0; oldIndex < originalCount; oldIndex++) {
    if (dropMeshes.has(oldIndex)) continue;
    // Keyed by the OLD index, because that is what the surviving nodes still
    // carry; the value is where the mesh ends up in the shortened array.
    meshRemap.set(oldIndex, next);
    next += 1;
  }
}
// Both index spaces shift when nodes are dropped, and everything that points into
// them has to move with them: `nodes[].mesh`, `nodes[].children` and
// `scene.nodes`. Leaving `scene.nodes` at its old values is what made an earlier
// build of this script produce a file the loader rejected with
// `undefined.name` -- it was still asking for nodes 39..45.
const originalNodeCount = json.nodes.length;
const nodeRemap = new Map();
{
  let next = 0;
  for (let oldIndex = 0; oldIndex < originalNodeCount; oldIndex++) {
    if (displaced.has(oldIndex)) continue;
    nodeRemap.set(oldIndex, next);
    next += 1;
  }
}
json.nodes = keptNodes.map((node) => ({
  ...node,
  ...(node.mesh === undefined ? {} : { mesh: meshRemap.get(node.mesh) }),
  ...(node.children
    ? {
        children: node.children
          .filter((c) => !displaced.has(c))
          .map((c) => nodeRemap.get(c)),
      }
    : {}),
}));
for (const scene of json.scenes ?? []) {
  scene.nodes = (scene.nodes ?? [])
    .filter((i) => !displaced.has(i))
    .map((i) => nodeRemap.get(i));
}
void usedMeshes;

const jsonText = JSON.stringify(json);
const padded = Buffer.concat([
  Buffer.from(jsonText, 'utf8'),
  Buffer.alloc(align4(jsonText.length) - jsonText.length, 0x20),
]);

const binHeader = Buffer.alloc(8);
// Keep the chunk layout the input used. This file is length-first, and emitting
// the standard order instead is what made an earlier build of this script
// produce a file the loader rejected.
if (lengthFirst) {
  binHeader.writeUInt32LE(bin.length, 0);
  binHeader.write('BIN\0', 4, 'ascii');
} else {
  binHeader.write('BIN\0', 0, 'ascii');
  binHeader.writeUInt32LE(bin.length, 4);
}

// The 20-byte file header ends with the JSON chunk's own 8-byte header
// (length at offset 12, "JSON" at 16), so the JSON payload simply follows it.
const total = 20 + padded.length + 8 + bin.length;
const header = Buffer.alloc(20);
header.write('glTF', 0, 'ascii');
header.writeUInt32LE(file.readUInt32LE(4), 4);
header.writeUInt32LE(total, 8);
header.writeUInt32LE(padded.length, 12);
header.write('JSON', 16, 'ascii');

writeFileSync(TARGET, Buffer.concat([header, padded, binHeader, bin]));
console.log(`  wrote ${file.length} -> ${total} bytes`);
console.log('  verify in a browser before committing: a loadable file is the only proof that counts');
