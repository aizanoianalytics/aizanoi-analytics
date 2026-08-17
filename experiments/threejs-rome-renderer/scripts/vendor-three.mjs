import { mkdir, copyFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const buildDir = resolve(root, 'node_modules/three/build');
const vendorDir = resolve(root, 'vendor');
const files = ['three.module.js', 'three.core.js'];

for (const file of files) {
  try {
    await access(resolve(buildDir, file));
  } catch {
    throw new Error(`Three.js build file is missing: ${file}. Run npm install in experiments/threejs-rome-renderer first.`);
  }
}

await mkdir(vendorDir, { recursive: true });
for (const file of files) {
  const source = resolve(buildDir, file);
  const destination = resolve(vendorDir, file);
  await copyFile(source, destination);
  console.log(`Vendored Three.js -> ${destination}`);
}
