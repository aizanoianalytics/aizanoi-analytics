/**
 * city-data.js — Compact Aizanoi AD 225 · Blender-kit reconstruction layout.
 * Compressed ~55% vs the 1:1 survey map: same monuments, same ids, same
 * evidence discipline; all building geometry resolves to studio-authored
 * CC0 GLB kit pieces (frontend/worlds/aizanoi-225/assets/).
 * Adapted from DPU Aizanoi Excavation data, Tandoğan & Erdoğan (2020), and Özer & Özcan (2022).
 */

export const CITY = {
  id: 'aizanoi-225',
  title: 'AIZANOI · AD 225',
  subtitle: 'Roman Phrygia: The Temple of Zeus, Penkalas River & The Theatre-Stadium Complex',
  scaleMetres: 800,
  period: 'c. AD 225',
  boundary: 'Penkalas Valley Urban Core (compact reconstruction)',
  description: 'A source-led, navigable 3D reconstruction of Roman Aizanoi in Phrygia Epiktetos: featuring the best-preserved pseudodipteral Temple of Zeus with its vaulted subterranean cella, the Macellum, where the AD 301 Edict on Maximum Prices survives in inscription, the unified theatre-stadium axis, and Roman bridges spanning the Penkalas river. Building geometry is a compressed-layout Blender kit reconstruction; monument placement follows the archaeological survey.',
};

export const SOURCES = [
  { id: 'temple', title: 'DPU Aizanoi — Temple of Zeus', url: 'https://aizanoi.dpu.edu.tr/en/index/sayfa/13884/temple-of-zeus-in-aizanoi' },
  { id: 'stadium', title: 'DPU Aizanoi — Theatre–Stadium', url: 'https://aizanoi.dpu.edu.tr/en/index/sayfa/13885/theatre-stadion-structure-complex' },
  { id: 'agora', title: 'DPU Aizanoi — Agora & Propylon', url: 'https://aizanoi.dpu.edu.tr/en/index/sayfa/13886/agora-and-the-propylon' },
  { id: 'bath', title: 'DPU Aizanoi — Great Bath–Palaestra', url: 'https://aizanoi.dpu.edu.tr/en/index/sayfa/13888/roman-bath-palaestra-structure-complex' },
  { id: 'mosaic', title: 'DPU Aizanoi — Mosaic Bath', url: 'https://aizanoi.dpu.edu.tr/en/index/sayfa/13889/mosaic-bath' },
  { id: 'street', title: 'DPU Aizanoi — Colonnaded Street', url: 'https://aizanoi.dpu.edu.tr/en/index/sayfa/13890/columned-street' },
  { id: 'macellum', title: 'DPU Aizanoi — Macellum (Price Edict)', url: 'https://aizanoi.dpu.edu.tr/en/index/sayfa/13891/macellum' },
  { id: 'odeon', title: 'DPU Aizanoi — Odeon / Bouleuterion', url: 'https://aizanoi.dpu.edu.tr/en/index/sayfa/13892/odeon-bouleterion' },
  { id: 'river', title: 'DPU Aizanoi — Penkalas & Bridges', url: 'https://aizanoi.dpu.edu.tr/en/index/sayfa/13894/penkalas-and-the-bridges' },
  { id: 'meter', title: 'DPU Aizanoi — Meter Steunene Sanctuary', url: 'https://aizanoi.dpu.edu.tr/en/index/sayfa/13893/sacred-place-of-the-meter-steunene-cybele' }
];

export const REGIONS = [
  { id: 'sanctuary', name: 'Zeus Sanctuary & Civic Core', x: -55, z: -10, w: 150, d: 170, note: 'Temple of Zeus, Agora, Propylon and Bouleuterion.' },
  { id: 'west-quarter', name: 'Western Residential Quarter', x: -160, z: -30, w: 150, d: 230, note: 'Street-facing Roman housing west of the civic core.' },
  { id: 'east-quarter', name: 'Eastern Residential Quarter', x: 130, z: -40, w: 150, d: 220, note: 'Housing, shops, and workshops east of the Penkalas.' },
  { id: 'bath-quarter', name: 'Great Bath & Palaestra', x: -155, z: 115, w: 150, d: 110, note: 'Imperial bath-gymnasium complex.' },
  { id: 'spectacle', name: 'Theatre–Stadium District', x: -115, z: 210, w: 130, d: 190, note: 'Unique conjoined spectacle complex on a single continuous axis.' },
  { id: 'south', name: 'Southern Civic & Macellum', x: 0, z: -140, w: 180, d: 150, note: 'Circular Macellum and colonnaded procession route.' },
];

export const STREETS = [
  { id: 'east-west', name: 'Civic East–West Street', points: [[-210, 30], [-100, 28], [0, 30], [60, 28], [140, 30], [210, 28]], width: 8 },
  { id: 'north-south', name: 'Sanctuary Procession Way', points: [[-45, -235], [-45, -120], [-45, -20], [-48, 80], [-60, 170], [-80, 250]], width: 8 },
  { id: 'quay', name: 'Penkalas East Quay', points: [[48, -200], [50, -100], [52, 0], [54, 100], [56, 200]], width: 6 },
];

const E_ARCH = { level: 'archaeological', note: 'Excavated standing monument.' };
const E_DOC = { level: 'documented', note: 'Epigraphically / topographically attested.' };

export const BUILDINGS = [
  {
    id: 'temple', name: 'Temple of Zeus', type: 'temple',
    x: -80, z: 5, w: 58, d: 38, h: 18, podiumHeight: 2.4, state: 'standing', region: 'sanctuary', source: 'temple', evidence: E_ARCH,
    detail: 'Pseudodipteral Ionic temple (13x7 kit columns) with an intact vaulted subterranean crypt beneath the cella dedicated to Cybele/Meter Steunene.'
  },
  {
    id: 'agora', name: 'Agora & Propylon', type: 'forum',
    x: -15, z: -5, w: 64, d: 54, h: 8, state: 'standing', region: 'sanctuary', source: 'agora', evidence: E_ARCH,
    detail: 'Civic market square between the Zeus sanctuary and the Penkalas river, entered through a monumental propylon gateway.'
  },
  {
    id: 'macellum', name: 'Macellum (Food Market & Price Edict)', type: 'round',
    x: 35, z: -105, w: 56, d: 56, h: 8, state: 'standing', region: 'south', source: 'macellum', evidence: E_ARCH,
    detail: 'Circular Roman food market; its stone walls bore Diocletian\'s AD 301 Edict on Maximum Prices, preserving one of the major epigraphic witnesses to the edict. Modern “stock exchange” labels are interpretive rather than an ancient institutional designation.'
  },
  {
    id: 'theatre', name: 'Aizanoi Theatre', type: 'theatre',
    x: -115, z: 255, w: 64, d: 54, h: 16, state: 'standing', region: 'spectacle', source: 'stadium', evidence: E_ARCH,
    detail: 'Large hillside theatre facing directly south along the continuous axis of the stadium.'
  },
  {
    id: 'stadium', name: 'Aizanoi Stadium', type: 'stadium',
    x: -115, z: 165, w: 64, d: 100, h: 10, state: 'standing', region: 'spectacle', source: 'stadium', evidence: E_ARCH,
    detail: 'Athletic stadium forming an unprecedented architectural ensemble joined directly to the rear of the theatre scaena.'
  },
  {
    id: 'greatbath', name: 'Great Bath–Palaestra', type: 'bath',
    x: -155, z: 115, w: 72, d: 46, h: 12, state: 'standing', region: 'bath-quarter', source: 'bath', evidence: E_ARCH,
    detail: 'Grand second-century thermal bathing complex with vaulted halls and an expansive wrestling palaestra.'
  },
  {
    id: 'mosaicbath', name: 'Mosaic Bath', type: 'bath',
    x: 135, z: 35, w: 30, d: 22, h: 9, state: 'standing', region: 'east-quarter', source: 'mosaic', evidence: E_ARCH,
    detail: 'Thermae adorned with hypocaust heating and the celebrated floor mosaics depicting satyrs and maenads.'
  },
  {
    id: 'odeon', name: 'Bouleuterion / Odeon', type: 'theatre',
    x: -20, z: -62, w: 30, d: 26, h: 9, state: 'standing', region: 'sanctuary', source: 'odeon', evidence: E_ARCH,
    detail: 'Covered semicircular council house for the city elders and musical performances.'
  },
  {
    id: 'colonnaded-street', name: 'Colonnaded Marble Street', type: 'stoa',
    x: -10, z: -160, w: 30, d: 150, h: 8, state: 'standing', region: 'south', source: 'street', evidence: E_ARCH,
    detail: 'Paved ceremonial avenue flanked on both sides by marble Corinthian colonnades and boutique workshops.'
  },
  {
    id: 'bridge2', name: 'Hadrianic Agora Bridge (Bridge II)', type: 'bridge',
    x: 62, z: -55, w: 68, d: 8, h: 6.2, state: 'standing', region: 'sanctuary', source: 'river', evidence: E_ARCH,
    detail: 'Historic 5-arch Roman stone bridge linking the market to the river quays.'
  },
  {
    id: 'bridge3', name: 'Central Roman Bridge (Bridge III)', type: 'bridge',
    x: 64, z: 55, w: 68, d: 8, h: 6.2, state: 'standing', region: 'sanctuary', source: 'river', evidence: E_ARCH,
    detail: 'Extant Roman stone bridge that carried vehicles and pedestrians across the Penkalas river for millennia.'
  }
];

export const WATERS = [
  {
    id: 'penkalas',
    name: 'Penkalas River (Koca Çay)',
    type: 'river',
    points: [
      { x: 58, z: -280 },
      { x: 60, z: -180 },
      { x: 62, z: -55 },
      { x: 63, z: 55 },
      { x: 66, z: 180 },
      { x: 70, z: 300 }
    ],
    width: 16,
    color: 0x3e686c
  }
];

export const BOUNDS = { minX: -260, maxX: 260, minZ: -280, maxZ: 330 };
const SPAWN_POSITION = { x: -30, z: 28 };
const SPAWN_TARGET = BUILDINGS.find((building) => building.id === 'temple');
export const SPAWN = {
  ...SPAWN_POSITION,
  angle: Math.atan2(SPAWN_TARGET.x - SPAWN_POSITION.x, SPAWN_TARGET.z - SPAWN_POSITION.z),
}; // Facing the Temple of Zeus

export const TELEPORTS = [
  { id: 'temple', name: 'Temple of Zeus' },
  { id: 'macellum', name: 'Macellum & Price Edict' },
  { id: 'theatre', name: 'Theatre & Stadium Complex' },
  { id: 'agora', name: 'Agora & Propylon' },
  { id: 'greatbath', name: 'Great Bath & Palaestra' },
  { id: 'bridge2', name: 'Hadrianic Bridge II & Penkalas' },
  { id: 'bridge3', name: 'Central Roman Bridge III' },
  { id: 'colonnaded-street', name: 'Colonnaded Street' }
];

export const TOUR_STOPS = [
  { id: 'temple', title: 'Temple of Zeus', description: 'The magnificent pseudodipteral temple of Zeus with its intact subterranean vaulted crypt dedicated to Cybele.', duration: 40 },
  { id: 'agora', title: 'Agora & Propylon', description: 'The grand civic marketplace connected to the sanctuary by a monumental propylon.', duration: 30 },
  { id: 'bridge2', title: 'Hadrianic Bridge across the Penkalas', description: 'One of the stone bridges that transformed the river into an urban spine.', duration: 25 },
  { id: 'macellum', title: 'The Macellum & Price Edict', description: 'The round market whose surviving stone inscription preserves the AD 301 Edict on Maximum Prices, a major witness to Diocletian\'s empire-wide price legislation.', duration: 35 },
  { id: 'theatre', title: 'Theatre–Stadium Complex', description: 'A unique architectural feat in the ancient world: a theatre conjoined on one axis with a stadium.', duration: 45 },
  { id: 'greatbath', title: 'Great Bath–Palaestra', description: 'Vast Roman bathing halls and wrestling grounds reflecting the opulent public lifestyle of Roman Phrygia.', duration: 30 }
];

export const DISTRICT_STYLES = {
  'sanctuary': { density: 0.30, heightRange: [5, 9], shopRatio: 0.20, materials: ['marble', 'limestone'] },
  'west-quarter': { density: 0.60, heightRange: [5, 10], shopRatio: 0.40, materials: ['romanBrick'] },
  'east-quarter': { density: 0.62, heightRange: [5, 10], shopRatio: 0.45, materials: ['plasterAged', 'romanBrick'] },
  'bath-quarter': { density: 0.40, heightRange: [6, 11], shopRatio: 0.30, materials: ['travertine', 'romanBrick'] },
  'spectacle': { density: 0.28, heightRange: [4, 8], shopRatio: 0.10, materials: ['limestone', 'travertine'] },
  'south': { density: 0.55, heightRange: [5, 9], shopRatio: 0.50, materials: ['romanBrick', 'plaster'] },
};

// Compress empty travel corridors while preserving every documented footprint.
export function compactAizanoiLayout({ xScale = 0.39, zScale = 0.88 } = {}) {
  const buildings = BUILDINGS.map((b) => ({ ...b, x: b.x * xScale, z: b.z * zScale, w: b.w * xScale, d: b.d * zScale }));
  const regions = REGIONS.map((r) => ({ ...r, x: r.x * xScale, z: r.z * zScale, w: r.w * xScale, d: r.d * zScale }));
  const streets = STREETS.map((s) => ({ ...s, points: s.points.map(([x, z]) => [x * xScale, z * zScale]), width: s.width * Math.min(xScale, zScale) }));
  const waters = WATERS.map((w) => ({ ...w, points: w.points.map((p) => ({ ...p, x: p.x * xScale, z: p.z * zScale })) }));
  const spawn = { ...SPAWN, x: SPAWN.x * xScale, z: SPAWN.z * zScale };
  const spawnTarget = buildings.find((building) => building.id === 'temple');
  spawn.angle = Math.atan2(spawnTarget.x - spawn.x, spawnTarget.z - spawn.z);
  return {
    BUILDINGS: buildings, REGIONS: regions, STREETS: streets, WATERS: waters,
    BOUNDS: { minX: BOUNDS.minX * xScale, maxX: BOUNDS.maxX * xScale, minZ: BOUNDS.minZ * zScale, maxZ: BOUNDS.maxZ * zScale },
    SPAWN: spawn,
  };
}
