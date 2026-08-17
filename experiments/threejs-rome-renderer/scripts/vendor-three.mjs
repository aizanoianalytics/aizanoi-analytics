import { mkdir, copyFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const root = resolve(here, '..');
const source = resolve(root, 'node_modules/three/build/three.module.js');
const vendorDir = resolve(root, 'vendor');
const destination = resolve(vendorDir, 'three.module.js');

try {
  await access(source);
} catch {
  throw new Error('Three.js is not installed. Run npm install in experiments/threejs-rome-renderer first.');
}

await mkdir(vendorDir, { recursive: true });
await copyFile(source, destination);
console.log(`Vendored Three.js -> ${destination}`);
