/* Period/state source data remains preserved in city-source.js. This wrapper adds
   authored arrival composition metadata without changing historical placement. */
import * as base from './city-source.js';

export const CITY = base.CITY;
export const SOURCES = base.SOURCES;
export const REGIONS = base.REGIONS;
export const STREETS = base.STREETS;

const FRAMING = Object.freeze({
  // Flat-ground traversal no longer needs the old Palatine-side approach. Arrive
  // from the east first so the amphitheatre reads as the requested hero instead
  // of placing the visitor among the Palatine/foreground residential masses.
  colosseum: { distance: 165, preferredDirections: [[1,0],[1,1],[1,-1],[0,1]] },
  // Forum arrival is authored from the north-east civic corridor instead of the
  // dense Palatine-side fabric that can fill the camera with a single wall.
  forum: { distance: 96, preferredDirections: [[1,1],[0,1]] },
  // The east side gives the Pantheon a readable rotunda/portico silhouette and
  // keeps neighbouring spectacle massing out of the immediate foreground.
  pantheon: { distance: 92, preferredDirections: [[1,0],[1,1]] },
  'trajan-forum': { distance: 110, preferredDirections: [[0,1],[1,1]] },
  'peter': { distance: 145, preferredDirections: [[0,1],[1,1]] },
  'caracalla': { distance: 150, preferredDirections: [[0,1],[-1,1]] },
  'diocletian': { distance: 150, preferredDirections: [[0,-1],[-1,-1]] },
});

// Camera composition is live-presentation metadata, separate from the authored
// arrival distance contract above. It can widen a hero view without lengthening
// the compact approach street or mutating the source/research ledger.
const CAMERA_DISTANCE = Object.freeze({ colosseum: 205 });

export const BUILDINGS = base.BUILDINGS.map((building) => {
  const framing = FRAMING[building.id];
  if (!framing) return building;
  const cameraDistance = CAMERA_DISTANCE[building.id];
  return {
    ...building,
    framing: Number.isFinite(cameraDistance) ? { ...framing, cameraDistance } : framing,
  };
});

export const TELEPORTS = base.TELEPORTS;
