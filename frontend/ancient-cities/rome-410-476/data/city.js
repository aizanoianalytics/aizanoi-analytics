/* Period/state source data remains preserved in city-source.js. This wrapper adds
   authored arrival composition metadata without changing historical placement. */
import * as base from './city-source.js';

export const CITY = base.CITY;
export const SOURCES = base.SOURCES;
export const REGIONS = base.REGIONS;
export const STREETS = base.STREETS;

const FRAMING = Object.freeze({
  // East / north-east approaches keep the Palatine palace roof out of the
  // Colosseum arrival frame while preserving the monument at historical coords.
  colosseum: { distance: 152, preferredDirections: [[1,0],[1,1]] },
  forum: { distance: 112, preferredDirections: [[0,-1],[-1,-1]] },
  pantheon: { distance: 92, preferredDirections: [[0,-1],[1,-1]] },
  'trajan-forum': { distance: 110, preferredDirections: [[0,1],[1,1]] },
  'peter': { distance: 145, preferredDirections: [[0,1],[1,1]] },
  'caracalla': { distance: 150, preferredDirections: [[0,1],[-1,1]] },
  'diocletian': { distance: 150, preferredDirections: [[0,-1],[-1,-1]] },
});

export const BUILDINGS = base.BUILDINGS.map((building) => (
  FRAMING[building.id] ? { ...building, framing: FRAMING[building.id] } : building
));

export const TELEPORTS = base.TELEPORTS;
