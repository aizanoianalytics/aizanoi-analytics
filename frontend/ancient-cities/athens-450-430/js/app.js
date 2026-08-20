import { CITY, SOURCES, REGIONS, STREETS, BUILDINGS } from '../data/city.js';
import { generateUrbanFabric } from '../data/urban-fabric.js';
import { expandPerimeterWalls } from '../../../ancient-world/assets/city-layout-tools.js';
import { startFlatBlockyCity } from '../../../ancient-world/engine/flat-city-runtime.js';

const TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || matchMedia('(pointer:coarse)').matches || innerWidth < 820;
const urbanFabric = generateUrbanFabric({
  regions: REGIONS,
  buildings: BUILDINGS,
  streets: STREETS,
  mobile: TOUCH,
});

const runtime = startFlatBlockyCity({
  city: CITY,
  sources: SOURCES,
  regions: REGIONS,
  streets: STREETS,
  buildings: expandPerimeterWalls(BUILDINGS),
  urbanFabric,
  waters: [
    { type: 'rect', x: 350, z: 180, w: 36, d: 700, name: 'Eridanos' },
    { type: 'polyline', points: [[-500, -100], [-390, 20], [-300, 100], [-220, 220]], width: 38, name: 'Ilissos' },
    { type: 'rect', x: 260, z: 470, w: 900, d: 70, name: 'Kephissos plain channel' },
  ],
  bounds: { minX: -700, maxX: 1200, minZ: -480, maxZ: 720 },
  spawn: { x: 110, z: 230, yaw: Math.PI * 0.95, pitch: -0.03 },
  ui: 'standard',
  cityRoute: '/ancient-cities/athens-450-430/',
});

window.__ATHENS_WORLD__ = runtime;
