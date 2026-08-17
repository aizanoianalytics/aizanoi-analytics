// Shared material colour tokens for procedural Ancient World renderers.
// They are renderer-agnostic on purpose: custom WebGL and a future Three.js
// renderer can interpret the same city/material vocabulary.
export const ANCIENT_MATERIALS = Object.freeze({
  earth: [0.34, 0.27, 0.16],
  road: [0.34, 0.31, 0.25],
  roadEdge: [0.23, 0.21, 0.18],
  brick: [0.43, 0.22, 0.14],
  brickDark: [0.27, 0.13, 0.09],
  marble: [0.68, 0.62, 0.50],
  marbleLight: [0.82, 0.76, 0.63],
  limestone: [0.61, 0.54, 0.42],
  roof: [0.33, 0.13, 0.08],
  timber: [0.25, 0.16, 0.09],
  rubble: [0.25, 0.21, 0.17],
  grass: [0.28, 0.33, 0.16],
  vegetation: [0.20, 0.29, 0.13],
  water: [0.12, 0.27, 0.31],
  wall: [0.38, 0.25, 0.17],
  bronze: [0.49, 0.34, 0.17],
  gold: [0.77, 0.60, 0.30],
  modern: [0.20, 0.58, 0.72],
  plaster: [0.88, 0.82, 0.66],
});

export function material(name, fallback = 'brick') {
  const value = ANCIENT_MATERIALS[name] || ANCIENT_MATERIALS[fallback];
  return [...value];
}
