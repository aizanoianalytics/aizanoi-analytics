import {
  expandPerimeterWalls,
  compactCityLayout,
  buildHeroApproachStreets,
} from '../assets/city-layout-tools.js';
import { startFlatBlockyCity } from './flat-city-runtime.js';
import { installCityCompatibility } from './city-compatibility.js';
import { installEvidenceMode } from './evidence-mode.js';

export function ancientWorldTouchMode() {
  return ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || matchMedia('(pointer:coarse)').matches || innerWidth < 820;
}

/**
 * Shared city bootstrap. City folders own evidence/data/layout choices while
 * renderer, traversal, compatibility, Research Lens and touch detection remain
 * Ancient World platform responsibilities.
 */
export function startAncientCity({
  city,
  sources = [],
  regions = [],
  streets = [],
  buildings = [],
  waters = [],
  bounds = null,
  spawn = null,
  compactionProfile,
  approachWidth = 10,
  frontageWidth = 8,
  generateFabric = null,
  expandWalls = false,
  ui = 'standard',
  era = null,
  cityRoute = null,
} = {}) {
  if (!city || !compactionProfile) throw new TypeError('startAncientCity requires city metadata and a compaction profile.');
  const touch = ancientWorldTouchMode();
  const layout = compactCityLayout({ city, regions, streets, buildings, waters, bounds, spawn }, compactionProfile);
  const liveStreets = Object.freeze([
    ...layout.streets,
    ...buildHeroApproachStreets(layout.buildings, { approachWidth, frontageWidth }),
  ]);
  const urbanFabric = typeof generateFabric === 'function'
    ? generateFabric({
        regions:layout.regions,
        buildings:layout.buildings,
        streets:liveStreets,
        waters:layout.waters,
        mobile:touch,
      })
    : [];
  const liveBuildings = expandWalls ? expandPerimeterWalls(layout.buildings) : layout.buildings;

  const runtime = startFlatBlockyCity({
    city:layout.city,
    sources,
    regions:layout.regions,
    streets:liveStreets,
    buildings:liveBuildings,
    urbanFabric,
    waters:layout.waters,
    bounds:layout.bounds,
    spawn:layout.spawn,
    ui,
    era,
    cityRoute,
  });
  installCityCompatibility(runtime, { ui });
  const evidenceMode = installEvidenceMode({ runtime, city:layout.city });

  return Object.freeze({ runtime, layout, liveStreets, urbanFabric, evidenceMode, touch });
}
