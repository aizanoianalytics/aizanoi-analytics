import { CITY, SOURCES, REGIONS, STREETS, BUILDINGS } from '../data/city.js';
import { generateUrbanFabric } from '../data/urban-fabric.js';
import { expandPerimeterWalls } from '../../../ancient-world/assets/city-layout-tools.js';
import { startFlatBlockyCity } from '../../../ancient-world/engine/flat-city-runtime.js';
import { installCityCompatibility } from '../../../ancient-world/engine/city-compatibility.js';

const TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || matchMedia('(pointer:coarse)').matches || innerWidth < 820;
const urbanFabric = generateUrbanFabric({
  regions: REGIONS,
  buildings: BUILDINGS,
  streets: STREETS,
  mobile: TOUCH,
  tiberX: -505,
});

const runtime = startFlatBlockyCity({
  city: CITY,
  sources: SOURCES,
  regions: REGIONS,
  streets: STREETS,
  buildings: expandPerimeterWalls(BUILDINGS),
  urbanFabric,
  waters: [{ type: 'rect', x: -505, z: 0, w: 92, d: 1450, name: 'Tiber' }],
  bounds: { minX: -900, maxX: 700, minZ: -700, maxZ: 700 },
  spawn: { x: -205, z: -165, yaw: Math.PI * 0.88, pitch: -0.03 },
  ui: 'standard',
  cityRoute: '/ancient-cities/rome-410-476/',
});

installCityCompatibility(runtime, { ui: 'standard' });
window.__ROME_WORLD__ = runtime;
