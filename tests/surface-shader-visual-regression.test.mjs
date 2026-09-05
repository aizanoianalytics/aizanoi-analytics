import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');

const shader = read('frontend/ancient-world/engine/surface-shader.js');
const envRenderer = read('frontend/ancient-world/engine/environment-renderer.js');
const materials = read('frontend/ancient-world/assets/materials.js');

// ── Surface shader: must preserve uniform/attribute contract ──

test('surface shader exposes the required fragment shader string export', () => {
  assert.match(shader, /export\s+const\s+ANCIENT_CITY_FRAGMENT_SHADER\s*=/);
});

test('surface shader declares the four required uniforms', () => {
  assert.match(shader, /uniform\s+vec3\s+uFog/);
  assert.match(shader, /uniform\s+vec3\s+uSun/);
  assert.match(shader, /uniform\s+float\s+uAmbient/);
  assert.match(shader, /uniform\s+float\s+uFogDensity/);
});

test('surface shader consumes exactly the varyings the vertex shader provides', () => {
  assert.match(shader, /varying\s+vec3\s+vN/);
  assert.match(shader, /varying\s+vec3\s+vC/);
  assert.match(shader, /varying\s+vec3\s+vW/);
  assert.match(shader, /varying\s+float\s+vDepth/);
});

test('surface shader outputs gl_FragColor (WebGL1)', () => {
  assert.match(shader, /gl_FragColor\s*=/);
});

test('surface shader does not use WebGL2-only constructs', () => {
  assert.doesNotMatch(shader, /#version\s+300/);
  assert.doesNotMatch(shader, /\bin\b\s+vec/);
  assert.doesNotMatch(shader, /\bout\b\s+vec/);
  assert.doesNotMatch(shader, /texture2D\s*\(/);
});

// ── Surface shader: visual improvement assertions ──

test('surface shader applies specular lighting for material readability', () => {
  // A specular component (Blinn half-vector or Phong reflect) is the primary
  // visual fix for flat blocky appearance.  Either pattern is valid.
  const hasSpecular = /specular|halfDir|reflect\s*\(/.test(shader);
  assert.ok(hasSpecular, 'shader should compute a specular/lighting term for material relief');
});

test('surface shader applies Fresnel rim lighting for depth on silhouette edges', () => {
  // Fresnel = edge glow that separates blocks from background and each other.
  const hasFresnel = /fresnel|rim|1\.0\s*-\s*max\s*\(\s*dot/.test(shader);
  assert.ok(hasFresnel, 'shader should include a Fresnel or rim lighting term');
});

test('surface shader has micro-scale variation beyond the existing macro/meso/micro noise', () => {
  // The existing three noise bands (macro/meso/micro) must still be present
  // to preserve the breakup character.
  assert.match(shader, /valueNoise\s*\(/);
  assert.match(shader, /hash\s*\(/);
  // And the new detail should add at least one additional noise modulation.
  const noiseCalls = shader.match(/valueNoise|hash/g);
  assert.ok(noiseCalls.length >= 5, 'should have additional procedural detail calls beyond the base three bands');
});

test('surface shader retains the masonry course pattern for vertical walls', () => {
  assert.match(shader, /course/);
  assert.match(shader, /smoothstep/);
});

test('surface shader retains roof tile grid lines', () => {
  assert.match(shader, /roofMask|tiles/);
});

test('surface shader retains soil/grit on upward surfaces', () => {
  assert.match(shader, /soil|grit/);
});

test('surface shader retains the warm/cool separation pass', () => {
  assert.match(shader, /mix\s*\(\s*color\s*,\s*color\s*\*\s*vec3/);
});

test('surface shader retains the fog blending at distance', () => {
  assert.match(shader, /mix\s*\(\s*color\s*,\s*uFog/);
});

test('surface shader retains the multi-band noise variation term', () => {
  assert.match(shader, /\*=\.94/);
  assert.match(shader, /macro/);
  assert.match(shader, /meso/);
  assert.match(shader, /micro/);
});

// ── Environment renderer: uniform/attribute contract ──

test('sky renderer preserves all sky uniform names', () => {
  assert.match(envRenderer, /uniform\s+vec3\s+uTop/);
  assert.match(envRenderer, /uniform\s+vec3\s+uHorizon/);
  assert.match(envRenderer, /uniform\s+float\s+uSunRel/);
  assert.match(envRenderer, /uniform\s+float\s+uPitch/);
  assert.match(envRenderer, /uniform\s+float\s+uTime/);
  assert.match(envRenderer, /uniform\s+float\s+uYaw/);
});

test('sky renderer provides gl_Position and gl_FragColor (WebGL1)', () => {
  assert.match(envRenderer, /gl_Position\s*=/);
  assert.match(envRenderer, /gl_FragColor\s*=/);
});

test('water renderer preserves all water attribute/uniform names', () => {
  for (const name of ['aP', 'aN', 'aC', 'uP', 'uV', 'uTime', 'uFog', 'uFogDensity']) {
    const re = new RegExp(`(attribute|uniform)\\s+\\w+\\s+${name}\\b`);
    assert.match(envRenderer, re, `water shader must declare ${name}`);
  }
});

test('water renderer uses alpha blending for water transparency', () => {
  assert.match(envRenderer, /BLEND|SRC_ALPHA|ONE_MINUS_SRC_ALPHA/);
});

test('water renderer has improved Fresnel-based reflectivity', () => {
  // New: Fresnel reflection that increases at grazing angles
  const hasFresnel = /fresnel|\.82\s*\+|grazing/.test(envRenderer);
  assert.ok(hasFresnel, 'water shader should include Fresnel-based reflectivity');
});

test('sky renderer includes sun disc rendering', () => {
  // Sun disc = smoothstep circle at sun position
  const hasDisc = /sun.*smoothstep|sun.*disc|glow.*smoothstep/i.test(envRenderer);
  assert.ok(hasDisc, 'sky shader should include a sun disc or glow rendering');
});

// ── Materials: palette completeness ──

test('materials.js exports ANCIENT_MATERIALS with all historical keys', () => {
  assert.match(materials, /export\s+const\s+ANCIENT_MATERIALS/);
  for (const name of ['earth','road','brick','marble','limestone','roof','timber',
                       'darkStone','rubble','grass','water','wall','bronze','gold',
                       'plaster','plaster2','plaster3']) {
    assert.match(materials, new RegExp(name));
  }
});

test('materials.js provides the material() lookup function', () => {
  assert.match(materials, /export\s+function\s+material\s*\(/);
});

test('materials export is frozen for renderer safety', () => {
  assert.match(materials, /Object\.freeze/);
});
