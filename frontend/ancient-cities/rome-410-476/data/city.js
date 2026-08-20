/* Period/state source data remains preserved in city-source.js. This wrapper adds
   authored arrival composition metadata without changing historical placement. */
import * as base from './city-source.js';

export const CITY = base.CITY;
export const SOURCES = base.SOURCES;
export const REGIONS = base.REGIONS;
export const STREETS = base.STREETS;

const FRAMING = Object.freeze({
  // The compact live city keeps the Colosseum close enough to read clearly while
  // retaining an eastern approach that avoids the Palatine-side monument cluster.
  colosseum: { distance: 145, preferredDirections: [[1,0],[0,1],[1,1],[1,-1]] },
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

export const BUILDINGS = base.BUILDINGS.map((building) => (
  FRAMING[building.id] ? { ...building, framing: FRAMING[building.id] } : building
));

export const TELEPORTS = base.TELEPORTS;
