import { defineAncientCity } from '../../../ancient-world/engine/city-contract.js';

// Copy this file into a real city package and replace every example value with
// researched city data. This example is intentionally generic and is not a
// historical claim about any place.
export const CITY_MANIFEST = defineAncientCity({
  id: 'example-city-period',
  title: 'EXAMPLE CITY · PERIOD',
  period: 'Example period',
  description: 'Renderer-neutral Ancient World city manifest example.',
  language: 'en',
  bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 },
  spawn: { x: 0, z: 30, yaw: Math.PI, pitch: 0 },

  districts: [
    {
      id: 'district-core',
      name: 'Core district',
      evidence: { level: 'documented', note: 'Replace with a source-backed district record.' },
    },
  ],

  roads: [
    {
      id: 'road-main',
      name: 'Main route',
      points: [[-100, 0], [100, 0]],
      evidence: { level: 'documented', note: 'Replace with the researched route alignment.' },
    },
  ],

  monuments: [
    {
      id: 'monument-example',
      name: 'Example monument',
      x: 0,
      z: 0,
      state: 'standing',
      evidence: { level: 'archaeological', note: 'Use only when physical evidence supports this level.' },
    },
    {
      id: 'fabric-example',
      name: 'Example inferred urban fabric',
      x: 80,
      z: 40,
      state: 'inferred',
      evidence: { level: 'plausible', note: 'Illustrative massing, not an excavated building restitution.' },
    },
  ],

  teleportTargets: [
    { id: 'jump-example', name: 'Example monument', monumentId: 'monument-example', position: { x: 0, z: 25 } },
  ],

  evidence: { level: 'documented', note: 'Describe the overall reconstruction evidence here.' },
  terrain: { type: 'height-field', physicsMatchesVisibleSurface: true },
  ambience: { audio: 'opt-in', atmosphericProps: 'procedural' },
  performance: {
    maxPixelRatioMobile: 1.15,
    maxPixelRatioDesktop: 1.55,
    mobileGeometryBudget: 100,
    desktopGeometryBudget: 220,
  },
});
