import { CITY, REGIONS, STREETS, BUILDINGS, TELEPORTS } from './city.js';
import { TERRAIN_EVIDENCE } from './terrain.js';
import { defineAncientCity, cityCapabilities } from '../../../ancient-world/engine/city-contract.js';

const bounds = Object.freeze({ minX: -900, maxX: 700, minZ: -700, maxZ: 700 });
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

export const ROME_MANIFEST = defineAncientCity({
  id: CITY.id,
  title: CITY.title,
  period: CITY.period,
  description: CITY.description,
  language: 'en',
  bounds,
  spawn: { x: -205, z: -165, yaw: Math.PI * 0.88, pitch: -0.03 },
  districts: REGIONS.map((region) => ({
    ...region,
    evidence: { level: 'documented', note: 'Augustan regional framework used as a historical orientation system.' },
  })),
  roads: STREETS.map((road) => ({
    ...road,
    evidence: { level: 'documented', note: 'Source-led route alignment represented schematically on the navigable city grid.' },
  })),
  monuments: BUILDINGS,
  teleportTargets,
  evidence: {
    level: 'documented',
    note: 'Named monuments and the research framework are source-led; exact fifth-century restitution varies by record. Denser domestic/working fabric remains explicitly plausible rather than individually excavated.',
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
    mobileGeometryBudget: 170,
    desktopGeometryBudget: 430,
  },
  metadata: {
    boundary: CITY.boundary,
    scaleMetres: CITY.scaleMetres,
    route: '/ancient-cities/rome-410-476/',
  },
});

export const ROME_CAPABILITIES = cityCapabilities(ROME_MANIFEST);
