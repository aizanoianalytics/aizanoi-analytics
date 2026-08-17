export const ROME_VISUAL_PALETTE = Object.freeze({
  terrainLow: 0x4a3927,
  terrainMid: 0x5a4931,
  terrainHigh: 0x6a5d3a,
  urbanWalls: Object.freeze([0x84533a, 0xa47655, 0xc0ad86, 0x76503b]),
  roofs: 0x5f2f21,
  urbanEaves: 0x6f422f,
  sky: 0x76766d,
  fog: 0x7d786c,
});

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function createTerrainColorSampler(THREE) {
  if (!THREE?.Color) throw new TypeError('createTerrainColorSampler requires THREE.Color.');

  // THREE.Color(hex) enters the renderer's working linear color space through
  // Three.js color management. Returning these linear channels avoids treating
  // display-space sRGB values as if they were already linear vertex colors.
  const low = new THREE.Color(ROME_VISUAL_PALETTE.terrainLow);
  const mid = new THREE.Color(ROME_VISUAL_PALETTE.terrainMid);
  const high = new THREE.Color(ROME_VISUAL_PALETTE.terrainHigh);
  const color = new THREE.Color();

  return function terrainColorAt(x, z, y) {
    const elevation = clamp01((y + 2) / 14);
    if (elevation < 0.58) {
      color.copy(low).lerp(mid, elevation / 0.58);
    } else {
      color.copy(mid).lerp(high, (elevation - 0.58) / 0.42);
    }

    // Two deterministic spatial scales keep the ground from reading as a
    // single flat ochre plane without introducing textures, random state or
    // high-frequency noise that aliases against the relatively coarse terrain
    // mesh. Broad variation provides district-scale tonal patches; the finer
    // term breaks up large uniform triangles while remaining intentionally
    // atmospheric rather than evidence-bearing surface detail.
    const broad = (
      Math.sin(x * 0.0042 + z * 0.0021)
      + Math.cos(z * 0.0051 - x * 0.0017)
    ) * 0.038;
    const grain = (
      Math.sin(x * 0.018)
      + Math.sin(z * 0.015)
      + Math.sin((x + z) * 0.0085)
    ) * 0.024;
    const variation = Math.max(0.82, Math.min(1.10, 0.95 + broad + grain));

    return [
      color.r * variation,
      color.g * variation,
      color.b * variation,
    ];
  };
}
