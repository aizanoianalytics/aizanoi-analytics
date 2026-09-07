/**
 * city-data.js — Aizanoi AD 225 · Complete Archaeological Dataset
 * Adapted from DPU Aizanoi Excavation data, Tandoğan & Erdoğan (2020), and Özer & Özcan (2022).
 */

export const CITY = {
  id: 'aizanoi-225',
  title: 'AIZANOI · AD 225',
  subtitle: 'Roman Phrygia: The Temple of Zeus, Penkalas River & The Theatre-Stadium Complex',
  scaleMetres: 1800,
  period: 'c. AD 225',
  boundary: 'Penkalas Valley Urban Core',
  description: 'A source-led, navigable 3D reconstruction of Roman Aizanoi in Phrygia Epiktetos: featuring the best-preserved pseudodipteral Temple of Zeus with its vaulted subterranean cella, the Macellum, where the AD 301 Edict on Maximum Prices survives in inscription, the unified theatre-stadium axis, and Roman bridges spanning the Penkalas river.',
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
  { id: 'sanctuary', name: 'Zeus Sanctuary & Civic Core', x: -125, z: 0, w: 300, d: 280, note: 'Temple of Zeus, Agora, Propylon and Bouleuterion.' },
  { id: 'west-quarter', name: 'Western Residential Quarter', x: -410, z: -40, w: 330, d: 390, note: 'Street-facing Phrygian Roman housing west of the Penkalas.' },
  { id: 'east-quarter', name: 'Eastern Residential Quarter', x: 330, z: -40, w: 360, d: 390, note: 'Housing, shops, and workshops east of the Penkalas.' },
  { id: 'bath-quarter', name: 'Great Bath & Palaestra', x: -315, z: 280, w: 310, d: 280, note: 'Imperial bath-gymnasium complex.' },
  { id: 'spectacle', name: 'Theatre–Stadium District', x: -230, z: 650, w: 300, d: 430, note: 'Unique conjoined spectacle complex on a single continuous axis.' },
  { id: 'south', name: 'Southern Civic & Macellum', x: -80, z: -520, w: 430, d: 520, note: 'Circular Macellum and colonnaded procession route.' },
];

export const STREETS = [
  { id: 'regional-east-west', name: 'Regional East–West Highway', points: [[-780,-410],[-540,-315],[-330,-220],[-190,-130],[-50,-70],[88,-20],[260,25],[520,95],[830,160]], width: 12 },
  { id: 'north-south-west', name: 'Northern Civic Road', points: [[-435,680],[-360,500],[-300,320],[-220,150],[-140,15],[-55,-165],[-30,-350]], width: 10 },
  { id: 'agora-road', name: 'Agora Approach Road', points: [[-540,250],[-395,220],[-270,135],[-165,40],[-65,-12]], width: 8 },
  { id: 'east-bank-road', name: 'Penkalas East Quay Road', points: [[-150,-330],[-60,-275],[35,-220],[130,-150],[260,-70],[430,-15]], width: 8 },
  { id: 'river-road', name: 'Penkalas West Quay Road', points: [[0,-600],[35,-470],[78,-355],[100,-240],[105,-120],[125,25],[160,175],[220,350]], width: 8 },
  { id: 'spectacle-road', name: 'Theatre–Stadium Procession Way', points: [[-320,510],[-250,580],[-220,680],[-210,800]], width: 10 },
];

const E_ARCH = { level: 'archaeological', note: 'Excavated standing monument.' };
const E_DOC = { level: 'documented', note: 'Epigraphically / topographically attested.' };

export const BUILDINGS = [
  {
    id: 'temple', name: 'Temple of Zeus', type: 'temple',
    x: -160, z: 20, w: 55, d: 35, h: 18, state: 'standing', region: 'sanctuary', source: 'temple', evidence: E_ARCH,
    detail: 'Pseudodipteral Ionic temple (8x15 columns) with an intact vaulted subterranean crypt beneath the cella dedicated to Cybele/Meter Steunene.'
  },
  {
    id: 'agora', name: 'Agora & Propylon', type: 'forum',
    x: -65, z: -35, w: 98, d: 82, h: 8, state: 'standing', region: 'sanctuary', source: 'agora', evidence: E_ARCH,
    detail: 'Civic market square between the Zeus sanctuary and the Penkalas river, entered through a monumental 30-step propylon gateway.'
  },
  {
    id: 'macellum', name: 'Macellum (Food Market & Price Edict)', type: 'round',
    x: 60, z: -300, w: 54, d: 54, h: 11, state: 'standing', region: 'south', source: 'macellum', evidence: E_ARCH,
    detail: 'Circular Roman food market; its stone walls bore Diocletian\'s AD 301 Edict on Maximum Prices, preserving one of the major epigraphic witnesses to the edict. Modern “stock exchange” labels are interpretive rather than an ancient institutional designation.'
  },
  {
    id: 'theatre', name: 'Aizanoi Theatre', type: 'theatre',
    x: -230, z: 748, w: 104, d: 88, h: 27, state: 'standing', region: 'spectacle', source: 'stadium', evidence: E_ARCH,
    detail: 'Large hillside theatre seating 15,000, facing directly south along the continuous axis of the stadium.'
  },
  {
    id: 'stadium', name: 'Aizanoi Stadium', type: 'stadium',
    x: -230, z: 555, w: 96, d: 220, h: 14, state: 'standing', region: 'spectacle', source: 'stadium', evidence: E_ARCH,
    detail: '13,500-capacity athletic stadium forming an unprecedented architectural ensemble joined directly to the rear of the theatre scaena.'
  },
  {
    id: 'greatbath', name: 'Great Bath–Palaestra', type: 'bath',
    x: -315, z: 280, w: 110, d: 145, h: 18, state: 'standing', region: 'bath-quarter', source: 'bath', evidence: E_ARCH,
    detail: 'Grand second-century thermal bathing complex with multi-hall caldarium and an expansive wrestling palaestra.'
  },
  {
    id: 'mosaicbath', name: 'Mosaic Bath', type: 'bath',
    x: 285, z: 105, w: 50, d: 44, h: 12, state: 'standing', region: 'east-quarter', source: 'mosaic', evidence: E_ARCH,
    detail: 'Thermae adorned with hypocaust heating and the celebrated floor mosaics depicting satyrs and maenads.'
  },
  {
    id: 'odeon', name: 'Bouleuterion / Odeon', type: 'theatre',
    x: -78, z: -142, w: 48, d: 45, h: 9, state: 'standing', region: 'sanctuary', source: 'odeon', evidence: E_ARCH,
    detail: 'Covered semicircular council house for the city elders and musical performances.'
  },
  {
    id: 'colonnaded-street', name: 'Colonnaded Marble Street', type: 'stoa',
    x: -65, z: -540, w: 36, d: 420, h: 8, state: 'standing', region: 'south', source: 'street', evidence: E_ARCH,
    detail: 'Paved ceremonial avenue flanked on both sides by marble Corinthian colonnades and boutique workshops.'
  },
  {
    id: 'bridge2', name: 'Hadrianic Agora Bridge (Bridge II)', type: 'bridge',
    x: 112, z: -160, w: 78, d: 12, h: 6, state: 'standing', region: 'sanctuary', source: 'river', evidence: E_ARCH,
    detail: 'Historic 5-arch Roman stone bridge commissioned by the prominent Eurykles family linking the market to the river quays.'
  },
  {
    id: 'bridge3', name: 'Central Roman Bridge (Bridge III)', type: 'bridge',
    x: 132, z: 70, w: 78, d: 12, h: 6, state: 'standing', region: 'sanctuary', source: 'river', evidence: E_ARCH,
    detail: 'Extant Roman stone bridge that carried vehicles and pedestrians across the Penkalas river for millennia.'
  }
];

export const WATERS = [
  {
    id: 'penkalas',
    name: 'Penkalas River (Koca Çay)',
    type: 'river',
    points: [
      { x: 35, z: -820 },
      { x: 50, z: -650 },
      { x: 72, z: -480 },
      { x: 96, z: -320 },
      { x: 112, z: -160 },
      { x: 125, z: 0 },
      { x: 145, z: 180 },
      { x: 178, z: 360 },
      { x: 205, z: 520 }
    ],
    width: 28,
    color: 0x3e686c
  }
];

export const BOUNDS = { minX: -820, maxX: 860, minZ: -950, maxZ: 950 };
export const SPAWN = { x: -38, z: 13, angle: -Math.PI / 2 };

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
  { id: 'agora', title: 'Agora & Propylon', description: 'The grand civic marketplace connected to the sanctuary by a 30-step monumental propylon.', duration: 30 },
  { id: 'bridge2', title: 'Hadrianic Bridge across the Penkalas', description: 'One of the four stone bridges built during the reign of Hadrian that transformed the river into an urban spine.', duration: 25 },
  { id: 'macellum', title: 'The Macellum & Price Edict', description: 'The round market building where Emperor Diocletian carved his Price Edict into stone to halt inflation.', duration: 35 },
  { id: 'theatre', title: 'Theatre–Stadium Complex', description: 'A unique architectural feat in the ancient world: a 15,000-seat theatre conjoined on one axis with a 13,500-seat stadium.', duration: 45 },
  { id: 'greatbath', title: 'Great Bath–Palaestra', description: 'Vast Roman bathing halls and wrestling grounds reflecting the opulent public lifestyle of Roman Phrygia.', duration: 30 }
];

export const DISTRICT_STYLES = {
  'sanctuary': { density: 0.35, heightRange: [5, 10], shopRatio: 0.20, materials: ['marble', 'limestone'] },
  'west-quarter': { density: 0.65, heightRange: [5, 11], shopRatio: 0.40, materials: ['plaster', 'romanBrick'] },
  'east-quarter': { density: 0.70, heightRange: [5, 11], shopRatio: 0.45, materials: ['plasterAged', 'romanBrick'] },
  'bath-quarter': { density: 0.45, heightRange: [6, 12], shopRatio: 0.30, materials: ['travertine', 'romanBrick'] },
  'spectacle': { density: 0.30, heightRange: [4, 9], shopRatio: 0.10, materials: ['limestone', 'travertine'] },
  'south': { density: 0.60, heightRange: [5, 10], shopRatio: 0.50, materials: ['romanBrick', 'plaster'] },
};
