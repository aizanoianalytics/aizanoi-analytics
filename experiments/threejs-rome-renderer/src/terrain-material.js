export const ROME_TERRAIN_FRAGMENT_GRAIN = Object.freeze({
  cellScale: 0.72,
  amplitude: 0.12,
});

export function createTerrainMaterial(THREE) {
  if (!THREE?.MeshStandardMaterial) throw new TypeError('createTerrainMaterial requires THREE.MeshStandardMaterial.');

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    vertexColors: true,
  });

  const cellScale = Number(ROME_TERRAIN_FRAGMENT_GRAIN.cellScale);
  const amplitude = Number(ROME_TERRAIN_FRAGMENT_GRAIN.amplitude);
  if (!Number.isFinite(cellScale) || cellScale <= 0 || !Number.isFinite(amplitude) || amplitude < 0) {
    throw new RangeError('Rome terrain fragment grain settings must be finite non-negative values.');
  }

  material.onBeforeCompile = (shader) => {
    const vertexMain = 'void main() {';
    const beginVertex = '#include <begin_vertex>';
    const fragmentMain = 'void main() {';
    const colorFragment = '#include <color_fragment>';

    if (!shader.vertexShader.includes(vertexMain) || !shader.vertexShader.includes(beginVertex)) {
      throw new Error('Three.js terrain vertex shader markers changed; refusing an unverified grain patch.');
    }
    if (!shader.fragmentShader.includes(fragmentMain) || !shader.fragmentShader.includes(colorFragment)) {
      throw new Error('Three.js terrain fragment shader markers changed; refusing an unverified grain patch.');
    }

    shader.vertexShader = shader.vertexShader
      .replace(vertexMain, `varying vec2 vRomeTerrainXZ;\n${vertexMain}`)
      .replace(beginVertex, `${beginVertex}\n  vRomeTerrainXZ = position.xz;`);

    shader.fragmentShader = shader.fragmentShader
      .replace(
        fragmentMain,
        `varying vec2 vRomeTerrainXZ;\nfloat romeTerrainHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\nfloat romeTerrainNoise(vec2 p) {\n  vec2 cell = floor(p);\n  vec2 local = fract(p);\n  vec2 blend = local * local * (3.0 - 2.0 * local);\n  float a = romeTerrainHash(cell);\n  float b = romeTerrainHash(cell + vec2(1.0, 0.0));\n  float c = romeTerrainHash(cell + vec2(0.0, 1.0));\n  float d = romeTerrainHash(cell + vec2(1.0, 1.0));\n  return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);\n}\n${fragmentMain}`,
      )
      .replace(
        colorFragment,
        `${colorFragment}\n  float romeTerrainGrain = (romeTerrainNoise(vRomeTerrainXZ * ${cellScale.toFixed(4)}) - 0.5) * ${amplitude.toFixed(4)};\n  diffuseColor.rgb *= 1.0 + romeTerrainGrain;`,
      );
  };

  material.customProgramCacheKey = () => `rome-terrain-smooth-grain-v2:${cellScale}:${amplitude}`;
  return material;
}
