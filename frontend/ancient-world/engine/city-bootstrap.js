import {
  expandPerimeterWalls,
  compactCityLayout,
  buildHeroApproachStreets,
  CITY_COMPACTION_PROFILES,
} from '../assets/city-layout-tools.js';
import { startFlatBlockyCity } from './flat-city-runtime.js';
import { installCityCompatibility } from './city-compatibility.js';
import { installEvidenceMode } from './evidence-mode.js';
import { installShareableLocation } from './shareable-location.js';

export function ancientWorldTouchMode() {
  return ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || matchMedia('(pointer:coarse)').matches || innerWidth < 820;
}

function resolveCompactionProfile(profile) {
  if (typeof profile === 'string') {
    const value = CITY_COMPACTION_PROFILES[profile];
    if (!value) throw new TypeError(`Unknown Ancient World compaction profile: ${profile}`);
    return value;
  }
  if (!profile || typeof profile !== 'object') throw new TypeError('startAncientCity requires a compaction profile.');
  return profile;
}

/**
 * Shared city bootstrap. City folders own evidence/data/layout choices while
 * renderer, traversal, compatibility, share URLs, Research Lens and touch
 * detection remain Ancient World platform responsibilities.
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
  sharePeriods = [],
  cityRoute = null,
} = {}) {
  if (!city) throw new TypeError('startAncientCity requires city metadata.');
  const profile = resolveCompactionProfile(compactionProfile);
  const touch = ancientWorldTouchMode();
  const layout = compactCityLayout({ city, regions, streets, buildings, waters, bounds, spawn }, profile);
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
  const share = installShareableLocation(runtime, { ui, periods:sharePeriods });
  const evidenceMode = installEvidenceMode({ runtime, city:layout.city });

  return Object.freeze({ runtime, layout, liveStreets, urbanFabric, evidenceMode, share, touch });
}
