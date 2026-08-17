export const ROME_TERRAIN_FRAGMENT_GRAIN = Object.freeze({
  cellScale: 0.72,
  amplitude: 0.035,
});

export function createTerrainMaterial(THREE) {
  if (!THREE?.MeshStandardMaterial) throw new TypeError('createTerrainMaterial requires THREE.MeshStandardMaterial.');

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    vertexColors: true,
  });

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
      .replace(fragmentMain, `varying vec2 vRomeTerrainXZ;\nfloat romeTerrainHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n${fragmentMain}`)
      .replace(colorFragment, `${colorFragment}\n  float romeTerrainGrain = (romeTerrainHash(floor(vRomeTerrainXZ * 0.72)) - 0.5) * 0.035;\n  diffuseColor.rgb *= 1.0 + romeTerrainGrain;`);
  };

  material.customProgramCacheKey = () => 'rome-terrain-fragment-grain-v1';
  return material;
}
