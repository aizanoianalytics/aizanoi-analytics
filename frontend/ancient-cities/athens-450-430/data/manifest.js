import { CITY, SOURCES, REGIONS, STREETS, BUILDINGS, TELEPORTS } from './city.js';
import { TERRAIN_EVIDENCE } from './terrain.js';
import { defineAncientCity, cityCapabilities } from '../../../ancient-world/engine/city-contract.js';

const bounds = Object.freeze({ minX: -700, maxX: 1200, minZ: -480, maxZ: 720 });
const byId = new Map(BUILDINGS.map((building) => [building.id, building]));

const teleportTargets = TELEPORTS.flatMap(([id, name]) => {
  const monument = byId.get(id);
  if (!monument) return [];
  return [{
    id: `jump-${id}`,
    name,
    monumentId: id,
    position: { x: monument.x, z: monument.z },
  }];
});

export const ATHENS_MANIFEST = defineAncientCity({
  id: CITY.id,
  title: CITY.title,
  period: CITY.period,
  description: CITY.description,
  language: 'en',
  bounds,
  spawn: { x: 110, z: 230, yaw: Math.PI * 0.95, pitch: -0.03 },
  districts: REGIONS.map((region) => ({
    ...region,
    evidence: { level: 'documented', note: 'Topographical / civic district used as an orientation framework for the Periclean city.' },
  })),
  roads: STREETS.map((road) => ({
    ...road,
    evidence: { level: 'documented', note: 'Source-led route alignment represented schematically on the navigable city grid.' },
  })),
  monuments: BUILDINGS,
  teleportTargets,
  evidence: {
    level: 'documented',
    note: 'The 450–430 BCE historical frame is rendered as a c. 432–430 BCE endpoint. Later Athena Nike, Erechtheion, Asklepieion and Pompeion buildings are not back-projected into the scene; the Olympieion remains the small archaic sanctuary, not the later Roman giant.',
  },
  terrain: {
    type: 'height-field',
    evidence: TERRAIN_EVIDENCE,
    physicsMatchesVisibleSurface: true,
  },
  ambience: {
    audio: 'opt-in-procedural',
    crowdSimulation: false,
    atmosphericProps: 'procedural-only',
  },
  performance: {
    maxPixelRatioMobile: 1.15,
    maxPixelRatioDesktop: 1.55,
    mobileGeometryBudget: 155,
    desktopGeometryBudget: 360,
  },
  metadata: {
    boundary: CITY.boundary,
    scaleMetres: CITY.scaleMetres,
    route: '/ancient-cities/athens-450-430/',
    visualSnapshot: 'c. 432–430 BCE',
  },
});

export const ATHENS_CAPABILITIES = cityCapabilities(ATHENS_MANIFEST);
