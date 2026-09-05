export const CITY = Object.freeze({
  id: 'aizanoi-225-425',
  title: 'AIZANOI · AD 225',
  subtitle: 'Roman Aizanoi on a flat-ground modular Ancient World layout',
  period: 'AD 225 / 301 / 425',
  description: 'A source-led, navigable reconstruction of Roman Aizanoi with reusable blocky assets, flat Y=0 city ground and period-labelled overlays.',
  boundary: 'Penkalas valley urban core',
  scaleMetres: 1800,
});

export const SOURCES = Object.freeze([
  { id: 'temple', title: 'DPU Aizanoi — Temple of Zeus', url: 'https://aizanoi.dpu.edu.tr/en/index/sayfa/13884/temple-of-zeus-in-aizanoi' },
  { id: 'stadium', title: 'DPU Aizanoi — Theatre–Stadium', url: 'https://aizanoi.dpu.edu.tr/en/index/sayfa/13885/theatre-stadion-structure-complex' },
  { id: 'agora', title: 'DPU Aizanoi — Agora & Propylon', url: 'https://aizanoi.dpu.edu.tr/en/index/sayfa/13886/agora-and-the-propylon' },
  { id: 'bath', title: 'DPU Aizanoi — Great Bath–Palaestra', url: 'https://aizanoi.dpu.edu.tr/en/index/sayfa/13888/roman-bath-palaestra-structure-complex' },
  { id: 'mosaic', title: 'DPU Aizanoi — Mosaic Bath', url: 'https://aizanoi.dpu.edu.tr/en/index/sayfa/13889/mosaic-bath' },
  { id: 'street', title: 'DPU Aizanoi — Colonnaded Street', url: 'https://aizanoi.dpu.edu.tr/en/index/sayfa/13890/columned-street' },
  { id: 'macellum', title: 'DPU Aizanoi — Macellum', url: 'https://aizanoi.dpu.edu.tr/en/index/sayfa/13891/macellum' },
  { id: 'odeon', title: 'DPU Aizanoi — Odeon / Bouleuterion', url: 'https://aizanoi.dpu.edu.tr/en/index/sayfa/13892/odeon-bouleterion' },
  { id: 'meter', title: 'DPU Aizanoi — Meter Steunene', url: 'https://aizanoi.dpu.edu.tr/en/index/sayfa/13893/sacred-place-of-the-meter-steunene-cybele' },
  { id: 'river', title: 'DPU Aizanoi — Penkalas & Bridges', url: 'https://aizanoi.dpu.edu.tr/en/index/sayfa/13894/penkalas-and-the-bridges' },
]);

export const REGIONS = Object.freeze([
  { id: 'sanctuary', name: 'Zeus sanctuary & civic core', x: -125, z: 0, w: 300, d: 280, note: 'Temple, agora, propylon and bouleuterion/odeon.' },
  { id: 'west-quarter', name: 'Western residential quarter', x: -410, z: -40, w: 330, d: 390, note: 'Inferred street-facing housing west of the Penkalas.' },
  { id: 'east-quarter', name: 'Eastern residential quarter', x: 330, z: -40, w: 360, d: 390, note: 'Inferred housing and workshops east of the Penkalas.' },
  { id: 'bath-quarter', name: 'Great Bath quarter', x: -315, z: 280, w: 310, d: 280, note: 'Great Bath–Palaestra and northern approaches.' },
  { id: 'spectacle', name: 'Theatre–Stadium district', x: -230, z: 650, w: 300, d: 430, note: 'Shared-axis spectacle complex.' },
  { id: 'south', name: 'Southern civic & sacred approach', x: -80, z: -520, w: 430, d: 520, note: 'Macellum, late street and southern approach.' },
]);

export const STREETS = Object.freeze([
  { id: 'regional-east-west', name: 'Regional east–west road', points: [[-780,-410],[-540,-315],[-330,-220],[-190,-130],[-50,-70],[88,-20],[260,25],[520,95],[830,160]], width: 9 },
  { id: 'north-south-west', name: 'Northern civic road', points: [[-435,680],[-360,500],[-300,320],[-220,150],[-140,15],[-55,-165],[-30,-350]], width: 8 },
  { id: 'agora-road', name: 'Agora approach', points: [[-540,250],[-395,220],[-270,135],[-165,40],[-65,-12]], width: 7 },
  { id: 'east-bank-road', name: 'Eastern bank road', points: [[-150,-330],[-60,-275],[35,-220],[130,-150],[260,-70],[430,-15]], width: 7 },
  { id: 'river-road', name: 'Penkalas urban road', points: [[0,-600],[35,-470],[78,-355],[100,-240],[105,-120],[125,25],[160,175],[220,350]], width: 7 },
  { id: 'spectacle-road', name: 'Theatre–stadium approach', points: [[-320,510],[-250,580],[-220,680],[-210,800]], width: 7 },
]);

const E_ARCH = Object.freeze({ level: 'archaeological', note: 'Named monument is grounded in archaeological remains and published excavation data; the blocky visual is deliberately schematic.' });
const E_DOC = Object.freeze({ level: 'documented', note: 'Topography/function is documented; exact visual restitution remains schematic.' });
const E_PLAUS = Object.freeze({ level: 'plausible', note: 'Atmospheric or inferred urban fabric, not an individually excavated footprint.' });

const B = (id, name, type, x, z, w, d, h, region, source, detail, extra = {}) => ({ id, name, type, x, z, w, d, h, region, source, detail, evidence: extra.evidence || E_ARCH, ...extra });

export const BUILDINGS = Object.freeze([
  B('temple', 'Temple of Zeus', 'temple', -160, 20, 55, 35, 18, 'sanctuary', 'temple', 'Octastyle pseudodipteral sanctuary; the blocky asset preserves the temple identity while terrain elevation is intentionally removed.', { asset: 'temple-of-zeus', framing: { distance: 92, preferredDirections: [[1,0]], cameraDistance: 210 } }),
  B('agora', 'Agora & Propylon', 'forum', -65, -35, 98, 82, 8, 'sanctuary', 'agora', 'Civic centre between the Zeus sanctuary and the Penkalas.'),
  B('odeon', 'Bouleuterion / Odeon', 'theatre', -78, -142, 48, 45, 9, 'sanctuary', 'odeon', 'Council/performance building with semicircular seating.'),
  B('greatbath', 'Great Bath–Palaestra', 'bath', -315, 280, 110, 145, 18, 'bath-quarter', 'bath', 'Mid-second-century bath and very large palaestra.'),
  B('stadium', 'Stadium', 'stadium', -230, 555, 96, 220, 14, 'spectacle', 'stadium', 'Southern half of the theatre–stadium complex, approximately 13,000 spectator capacity.'),
  B('theatre', 'Theatre', 'theatre', -230, 748, 104, 88, 27, 'spectacle', 'stadium', 'Large imperial theatre sharing the stage-building axis with the stadium.'),
  B('mosaicbath', 'Mosaic Bath', 'bath', 285, 105, 50, 44, 12, 'east-quarter', 'mosaic', 'Second–third-century bath with hypocaust and the satyr/maenad mosaic.'),
  B('macellum', 'Macellum & Price Edict', 'market', 60, -300, 54, 54, 11, 'south', 'macellum', 'Circular food-market complex; AD 301 Maximum Price Edict context.'),
  B('street', 'Early 5th-Century Colonnaded Street', 'stoa', -65, -540, 36, 420, 8, 'south', 'street', 'Early fifth-century colonnaded street built with extensive spolia.', { era: 425 }),
  B('bridge2', 'Market / Agora Bridge', 'bridge', 112, -160, 78, 12, 4, 'sanctuary', 'river', 'Hadrianic bridge in the central urban river sequence.'),
  B('bridge3', 'Central Roman Bridge', 'bridge', 132, 70, 78, 12, 4, 'sanctuary', 'river', 'Central Roman bridge and quay crossing.'),
  B('penkalas', 'Penkalas River & Quays', 'building', 125, 45, 8, 8, 2, 'sanctuary', 'river', 'The Penkalas is the organising river spine of Roman Aizanoi.', { noCollision: true, evidence: E_DOC }),
  B('westnec', 'Western Necropolis', 'cemetery', -620, 130, 150, 150, 4, 'west-quarter', 'river', 'Extra-urban funerary landscape represented with reusable tomb assets.', { evidence: E_DOC }),
  B('northnec', 'Northern Necropolis', 'cemetery', -220, 970, 170, 170, 4, 'spectacle', 'river', 'Northern funerary landscape.', { evidence: E_DOC }),
  B('southnec', 'Southern Necropolis', 'cemetery', -240, -760, 150, 150, 4, 'south', 'river', 'Southern funerary landscape.', { evidence: E_DOC }),
  B('reswest', 'Western Residential Quarter', 'building', -420, -80, 18, 16, 7, 'west-quarter', null, 'District marker for inferred housing.', { noCollision: true, evidence: E_PLAUS }),
  B('reseast', 'Eastern Residential Quarter', 'building', 360, -80, 18, 16, 7, 'east-quarter', null, 'District marker for inferred housing.', { noCollision: true, evidence: E_PLAUS }),
  B('dam', 'Roman River Dam', 'monument', 80, -1200, 120, 8, 6, 'south', 'river', 'Roman hydraulic monument; real distance is compressed in this browser layout.', { asset: 'wall' }),
  B('meter', 'Sanctuary of Meter Steunene', 'sanctuary', -420, -1400, 70, 55, 10, 'south', 'meter', 'Open-air sanctuary about 4 km south of the Zeus temple; represented as a compressed remote zone.'),
]);

export const WATERS = Object.freeze([
  { type: 'polyline', name: 'Penkalas', width: 32, points: [[35,-820],[50,-650],[72,-480],[96,-320],[112,-160],[125,0],[145,180],[178,360],[205,520]] },
]);

export const BOUNDS = Object.freeze({ minX: -820, maxX: 860, minZ: -1500, maxZ: 1120 });
export const SPAWN = Object.freeze({ x: -38, z: 13, yaw: -Math.PI / 2, pitch: -0.06 });
