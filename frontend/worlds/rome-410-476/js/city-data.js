/**
 * city-data.js — Rome AD 410–476 · Compact reconstruction dataset.
 * Compressed ~55% vs the 1:1 survey map: same monuments, ids, types,
 * evidence levels and sources; all building geometry resolves to
 * studio-authored CC0 GLB kit pieces (frontend/worlds/rome-410-476/assets/)
 * with InstancedMesh batching for every repeated element.
 * Adapted from Stanford Forma Urbis, Notitia 14 Regionum, Claridge, and Krautheimer.
 * Coordinates: 1 unit ≈ 0.7m on the ground.
 */

/* ── City metadata ────────────────────────────────────────── */

export const CITY = {
  id: 'rome-410-476',
  title: 'ROME · AD 410–476',
  subtitle: 'The Late Antique Capital between Sack, Survival, and Transformation',
  scaleMetres: 1100,
  period: 'AD 410–476',
  boundary: 'Aurelian Walls (compact reconstruction)',
  description: 'A source-led, navigable reconstruction of Rome from the sack of Alaric (410) through Gaiseric (455) to the deposition of Romulus Augustulus (476): the colossal Colosseum, intact Pantheon, grand basilicas, ruined imperial fora, and the fortified Aurelian circuit. Building geometry is a compressed-layout Blender kit reconstruction; monument placement follows the survey.',
};

/* ── Academic sources ─────────────────────────────────────── */

export const SOURCES = [
  { id: 'forma', title: 'Stanford Digital Forma Urbis Romae Project', url: 'https://formaurbis.stanford.edu/' },
  { id: 'notitia', title: 'Notitia / Curiosum Urbis Romae Regionum XIIII', url: 'https://penelope.uchicago.edu/Thayer/E/Gazetteer/Places/Europe/Italy/Lazio/Rome/Rome/_Texts/Notitia_Regionum/description.html' },
  { id: 'claridge', title: 'Amanda Claridge, Rome: An Oxford Archaeological Guide', url: 'https://global.oup.com/academic/product/rome-9780199546831' },
  { id: 'krautheimer', title: 'Richard Krautheimer, Rome: Profile of a City, 312–1308', url: 'https://press.princeton.edu/books/paperback/9780691002590/rome' },
  { id: 'ward', title: 'Bryan Ward-Perkins, The Fall of Rome and the End of Civilization', url: 'https://global.oup.com/academic/product/the-fall-of-rome-and-the-end-of-civilization-9780192807281' },
  { id: 'colosseum', title: 'Colosseum (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Colosseum' },
  { id: 'pantheon', title: 'Pantheon, Rome (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Pantheon,_Rome' },
  { id: 'forum', title: 'Roman Forum (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Roman_Forum' },
  { id: 'caracalla', title: 'Baths of Caracalla (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Baths_of_Caracalla' },
  { id: 'diocletian', title: 'Baths of Diocletian (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Baths_of_Diocletian' },
  { id: 'peter', title: 'Old St. Peter’s Basilica (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Old_St._Peter%27s_Basilica' },
  { id: 'smm', title: 'Santa Maria Maggiore (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Santa_Maria_Maggiore' },
  { id: 'sabina', title: 'Santa Sabina (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Santa_Sabina' },
  { id: 'paul', title: 'San Paolo fuori le Mura (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Basilica_of_Saint_Paul_Outside_the_Walls' },
  { id: 'hadrian', title: 'Mausoleum of Hadrian (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Mausoleum_of_Hadrian' },
  { id: 'walls', title: 'Aurelian Walls (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Aurelian_Walls' },
];

/* ── 14 Augustan Regiones (compressed) ─────────────────────── */

export const REGIONS = [
  { id: 'I', name: 'Regio I · Porta Capena', x: -50, z: -300, w: 150, d: 110, note: 'South-east gateways, Appian approach and imperial-era fabric.' },
  { id: 'II', name: 'Regio II · Caelimontium', x: -40, z: -160, w: 140, d: 120, note: 'Caelian hill, villas and new Christian basilicas.' },
  { id: 'III', name: 'Regio III · Isis et Serapis', x: 90, z: -60, w: 140, d: 130, note: 'Colosseum, Ludus Magnus and Oppian hill.' },
  { id: 'IV', name: 'Regio IV · Templum Pacis', x: -90, z: 40, w: 150, d: 120, note: 'Forum of Peace, Subura edge and Basilica of Maxentius.' },
  { id: 'V', name: 'Regio V · Esquiliae', x: 130, z: 100, w: 160, d: 130, note: 'Esquiline residences, reservoirs and Santa Maria Maggiore.' },
  { id: 'VI', name: 'Regio VI · Alta Semita', x: 0, z: 180, w: 160, d: 130, note: 'Quirinal, Diocletian’s baths and Sallust’s gardens.' },
  { id: 'VII', name: 'Regio VII · Via Lata', x: -190, z: 170, w: 130, d: 190, note: 'Via Lata corridor, porticoes and northern Campus Martius.' },
  { id: 'VIII', name: 'Regio VIII · Forum Romanum', x: -90, z: -10, w: 140, d: 110, note: 'Forum Romanum, Capitol and imperial fora.' },
  { id: 'IX', name: 'Regio IX · Circus Flaminius', x: -220, z: 90, w: 150, d: 140, note: 'Campus Martius, Pantheon, theatres and Tiber-facing trade.' },
  { id: 'X', name: 'Regio X · Palatium', x: -30, z: -140, w: 130, d: 100, note: 'Palatine palace shell and sacred slopes.' },
  { id: 'XI', name: 'Regio XI · Circus Maximus', x: -120, z: -180, w: 170, d: 80, note: 'Circus valley, Velabrum and Forum Boarium.' },
  { id: 'XII', name: 'Regio XII · Piscina Publica', x: 30, z: -250, w: 150, d: 100, note: 'Baths of Caracalla and southern residential zones.' },
  { id: 'XIII', name: 'Regio XIII · Aventinus', x: -190, z: -250, w: 140, d: 140, note: 'Aventine hill, Emporium, horrea and Santa Sabina.' },
  { id: 'XIV', name: 'Regio XIV · Transtiberim', x: -320, z: 60, w: 140, d: 260, note: 'Trastevere, Tiber Island, and Old St. Peter’s Vatican approach.' },
];

export const STREETS = [
  { id: 'via-sacra', name: 'Via Sacra', points: [[-140,-30],[-90,-25],[-40,-30],[10,-35],[60,-40]], width: 10, source: 'forum' },
  { id: 'forum-radial', name: 'Forum Approach', points: [[-110,40],[-80,10],[-60,-10]], width: 8, source: 'forum' },
  { id: 'colosseum-way', name: 'Colosseum Approach', points: [[60,-40],[90,-40],[140,-50]], width: 8, source: 'notitia' },
  { id: 'tiber-quay', name: 'Tiber Quay Road', points: [[-265,-200],[-265,-50],[-265,100],[-260,220]], width: 6, source: 'notitia' },
  { id: 'north-way', name: 'Via Lata North', points: [[-215,150],[-200,220],[-190,290]], width: 8, source: 'notitia' },
];

const E_ARCH = { level: 'archaeological', note: 'Excavated standing monument.' };

export const BUILDINGS = [
  { id: 'colosseum', name: 'Colosseum (Amphitheatrum Flavium)', type: 'amphitheatre',
    x: 90, z: -40, w: 124, d: 100, h: 38, state: 'repaired', region: 'III', source: 'colosseum', evidence: E_ARCH,
    detail: 'The colossal amphitheatre, still hosting venationes (beast hunts). Features post-443 earthquake repairs.' },
  { id: 'pantheon', name: 'Pantheon', type: 'dome',
    x: -190, z: 60, w: 64, d: 76, h: 36, state: 'standing', region: 'IX', source: 'pantheon', evidence: E_ARCH,
    detail: 'Hadrian\'s intact concrete rotunda with a 43.3m dome and bronze-framed oculus. Still a civic/pagan marvel.' },
  { id: 'circus', name: 'Circus Maximus', type: 'circus',
    x: -90, z: -190, w: 150, d: 50, h: 14, state: 'damaged', region: 'XI', source: 'forum', evidence: E_ARCH,
    detail: 'The great chariot racing stadium between Palatine and Aventine, seating over 150,000 in its prime.' },
  { id: 'ludus', name: 'Ludus Magnus', type: 'arena',
    x: 150, z: -95, w: 40, d: 34, h: 12, state: 'damaged', region: 'III', source: 'colosseum', evidence: E_ARCH,
    detail: 'Principal gladiatorial barracks with its own miniature amphitheatre connected to the Colosseum by tunnel.' },

  // ──── FORUM ROMANUM CIVIC CORE ────
  { id: 'forum', name: 'Roman Forum (Forum Romanum)', type: 'forum',
    x: -60, z: -10, w: 110, d: 70, h: 5, state: 'spoliated', region: 'VIII', source: 'forum', evidence: E_ARCH,
    detail: 'The historic heart of the Empire; temples stripped of bronze tiles, but still the symbolic center of the Senate.' },
  { id: 'curia', name: 'Curia Julia', type: 'basilica',
    x: -105, z: -5, w: 30, d: 20, h: 16, state: 'standing', region: 'VIII', source: 'forum', evidence: E_ARCH,
    detail: 'Senate House restored by Diocletian; strong brick shell with porphyry and marble floor.' },
  { id: 'saturn', name: 'Temple of Saturn', type: 'temple',
    x: -125, z: -35, w: 26, d: 18, h: 14, state: 'spoliated', region: 'VIII', source: 'forum', evidence: E_ARCH,
    detail: 'State treasury (Aerarium); granite Ionic columns stand with late 4th-century restoration inscription.' },
  { id: 'castor', name: 'Temple of Castor and Pollux', type: 'temple',
    x: -35, z: -45, w: 24, d: 18, h: 14, state: 'spoliated', region: 'VIII', source: 'forum', evidence: E_ARCH,
    detail: 'Peripteral Corinthian temple of the Dioscuri standing proudly near the Lacus Juturnae.' },
  { id: 'vesta', name: 'Temple of Vesta', type: 'round',
    x: -15, z: -25, w: 20, d: 20, h: 14, state: 'damaged', region: 'VIII', source: 'forum', evidence: E_ARCH,
    detail: 'Circular shrine of the eternal fire, defunct since Theodosius extinguished the sacred flame in 394.' },
  { id: 'aemilia', name: 'Basilica Aemilia', type: 'basilica',
    x: -105, z: -55, w: 55, d: 24, h: 13, state: 'ruined', region: 'VIII', source: 'walls', evidence: E_ARCH,
    detail: 'Burned during Alaric\'s 410 sack; bronze coins melted into the marble floor tiles.' },
  { id: 'julia', name: 'Basilica Julia', type: 'basilica',
    x: -45, z: -60, w: 60, d: 24, h: 11, state: 'damaged', region: 'VIII', source: 'walls', evidence: E_ARCH,
    detail: 'Double aisles of marble arcades; game boards (tabulae lusoriae) still etched on its steps.' },
  { id: 'maxentius', name: 'Basilica of Maxentius & Constantine', type: 'basilica',
    x: 20, z: 55, w: 70, d: 40, h: 24, state: 'damaged', region: 'IV', source: 'forum', evidence: E_ARCH,
    detail: 'Colossal barrel-vaulted basilica, the largest building in the Forum with 35m-high concrete coffered vaults.' },

  // ──── TRIUMPHAL ARCHES ────
  { id: 'constantine-arch', name: 'Arch of Constantine', type: 'arch',
    x: 30, z: -105, w: 24, d: 14, h: 20, state: 'standing', region: 'X', source: 'colosseum', evidence: E_ARCH,
    detail: 'Triple-bay triumphal arch built 315 AD incorporating high-relief spolia sculptures from Trajan and Hadrian.' },
  { id: 'severus-arch', name: 'Arch of Septimius Severus', type: 'arch',
    x: -130, z: 5, w: 24, d: 14, h: 21, state: 'standing', region: 'VIII', source: 'forum', evidence: E_ARCH,
    detail: 'White marble triple arch at the foot of the Capitoline commemorating Parthian campaigns.' },
  { id: 'titus-arch', name: 'Arch of Titus', type: 'arch',
    x: 140, z: -60, w: 22, d: 13, h: 20, state: 'standing', region: 'X', source: 'forum', evidence: E_ARCH,
    detail: 'Single-arch monument on the Velian ridge, depicting the spoils of the Jerusalem Temple (Menorah).' },
  { id: 'janus', name: 'Arch of Janus (Quadrifrons)', type: 'arch',
    x: -150, z: -90, w: 18, d: 14, h: 16, state: 'standing', region: 'XI', source: 'forum', evidence: E_ARCH,
    detail: 'Four-way marble crossroads arch over the Cloaca Maxima at the Forum Boarium entrance.' },

  // ──── IMPERIAL FORA & TRAJAN’S COMPLEX ────
  { id: 'trajan-forum', name: 'Forum of Trajan', type: 'forum',
    x: -110, z: 70, w: 70, d: 70, h: 7, state: 'spoliated', region: 'VIII', source: 'forum', evidence: E_ARCH,
    detail: 'The grandest imperial forum with its gilded bronze equestrian statues, libraries, and Basilica Ulpia.' },
  { id: 'trajan-column', name: 'Trajan’s Column', type: 'column',
    x: -95, z: 80, w: 11, d: 11, h: 37, state: 'standing', region: 'VIII', source: 'forum', evidence: E_ARCH,
    detail: 'Freestanding Carrara marble spiral relief column depicting the Dacian Wars; 35m landmark.' },
  { id: 'trajan-market', name: 'Trajan’s Market', type: 'market',
    x: -140, z: 95, w: 50, d: 38, h: 18, state: 'standing', region: 'VIII', source: 'forum', evidence: E_ARCH,
    detail: 'Multi-level brick hemicycle shopping and administrative complex cut into the Quirinal hill.' },
  { id: 'augustus-forum', name: 'Forum of Augustus', type: 'forum',
    x: -60, z: 80, w: 55, d: 45, h: 6, state: 'spoliated', region: 'VIII', source: 'forum', evidence: E_ARCH,
    detail: 'High peperino fire-wall enclosing the Temple of Mars Ultor.' },

  // ──── IMPERIAL PALACE & CAPITOL ────
  { id: 'palatine', name: 'Palatine Imperial Palace (Domus Augustana)', type: 'palace',
    x: -30, z: -150, w: 90, d: 60, h: 24, state: 'damaged', region: 'X', source: 'walls', evidence: E_ARCH,
    detail: 'Vast multi-winged imperial palace complex overlooking the Circus Maximus; partially stripped by Visigoths.' },
  { id: 'venus-roma', name: 'Temple of Venus and Roma', type: 'temple',
    x: 60, z: 10, w: 60, d: 40, h: 20, state: 'spoliated', region: 'IV', source: 'forum', evidence: E_ARCH,
    detail: 'Double decastyle temple designed by Hadrian with back-to-back apses dedicated to Venus Felix and Roma Aeterna.' },

  // ──── IMPERIAL BATHS (THERMAE) ────
  { id: 'caracalla', name: 'Baths of Caracalla (Thermae Antoninianae)', type: 'bath',
    x: 50, z: -230, w: 110, d: 85, h: 26, state: 'working', region: 'XII', source: 'caracalla', evidence: E_ARCH,
    detail: 'Vast thermal leisure complex with natatio pool, caldarium rotunda, and palatial mosaic courtyards.' },
  { id: 'diocletian', name: 'Baths of Diocletian', type: 'bath',
    x: 60, z: 190, w: 110, d: 80, h: 24, state: 'working', region: 'VI', source: 'diocletian', evidence: E_ARCH,
    detail: 'The largest imperial thermae in the Roman world, holding up to 3,000 bathers simultaneously.' },

  // ──── THEATRES & CAMPUS MARTIUS ────
  { id: 'marcellus', name: 'Theatre of Marcellus', type: 'theatre',
    x: -200, z: 40, w: 60, d: 40, h: 20, state: 'standing', region: 'IX', source: 'forum', evidence: E_ARCH,
    detail: 'Three-tiered open-air theatre with Doric and Ionic travertine arcades, precursor model to the Colosseum.' },
  { id: 'pompey', name: 'Theatre of Pompey', type: 'theatre',
    x: -230, z: 110, w: 70, d: 45, h: 20, state: 'damaged', region: 'IX', source: 'forum', evidence: E_ARCH,
    detail: 'Rome\'s first permanent stone theatre (55 BC), site of Julius Caesar\'s assassination in the curia hall.' },
  { id: 'stadium', name: 'Stadium of Domitian (Piazza Navona outline)', type: 'stadium',
    x: -230, z: 180, w: 80, d: 36, h: 12, state: 'spoliated', region: 'IX', source: 'forum', evidence: E_ARCH,
    detail: 'Athletic stadium whose shape survives today in Piazza Navona; inhabited by early medieval tenements.' },

  // ──── TIBER RIVER & FORUM BOARIUM ────
  { id: 'boarium', name: 'Forum Boarium', type: 'market',
    x: -190, z: -60, w: 65, d: 50, h: 7, state: 'standing', region: 'XI', source: 'forum', evidence: E_ARCH,
    detail: 'Ancient cattle market and river harbour (Portus Tiberinus) on the banks of the Tiber.' },
  { id: 'portunus', name: 'Temple of Portunus', type: 'temple',
    x: -215, z: -60, w: 24, d: 18, h: 14, state: 'standing', region: 'XI', source: 'forum', evidence: E_ARCH,
    detail: 'Ionic tetrastyle pseudoperipteral temple dedicated to the god of river ports and keys; well-preserved.' },
  { id: 'hercules', name: 'Temple of Hercules Victor', type: 'round',
    x: -175, z: -45, w: 22, d: 22, h: 15, state: 'standing', region: 'XI', source: 'forum', evidence: E_ARCH,
    detail: 'Monopteros Greek marble circular temple surrounded by 20 Corinthian columns; oldest surviving marble building in Rome.' },
  { id: 'pons-aelius', name: 'Pons Aelius (Ponte Sant\'Angelo)', type: 'bridge',
    x: -275, z: 20, w: 70, d: 10, h: 6.2, state: 'standing', region: 'XIV', source: 'hadrian', evidence: E_ARCH,
    detail: 'Monumental five-arch travertine bridge spanning the Tiber toward Hadrian’s mausoleum.' },
  { id: 'hadrian', name: 'Mausoleum of Hadrian (Castel Sant\'Angelo)', type: 'mausoleum',
    x: -310, z: 30, w: 56, d: 56, h: 34, state: 'fortified', region: 'XIV', source: 'hadrian', evidence: E_ARCH,
    detail: 'Cylindrical tomb crowned with earthen tumulus, converted by Emperor Honorius into a bridgehead fortress.' },

  // ──── EARLY CHRISTIAN BASILICAS ────
  { id: 'peter', name: 'Old St. Peter’s Basilica', type: 'church',
    x: -350, z: 90, w: 70, d: 105, h: 30, state: 'working', region: 'XIV', source: 'peter', evidence: E_ARCH,
    detail: 'Constantine\'s five-aisled pilgrimage basilica built over the tomb of St. Peter in the Vatican necropolis.' },
  { id: 'maria-maggiore', name: 'Santa Maria Maggiore', type: 'church',
    x: 130, z: 120, w: 45, d: 80, h: 22, state: 'new', region: 'V', source: 'smm', evidence: E_ARCH,
    detail: 'Built under Pope Sixtus III (432–440) celebrating Mary as Theotokos with splendid 5th-century mosaics.' },
  { id: 'sabina', name: 'Santa Sabina on the Aventine', type: 'church',
    x: -150, z: -210, w: 42, d: 72, h: 20, state: 'new', region: 'XIII', source: 'sabina', evidence: E_ARCH,
    detail: 'Classical basilica erected 422–432 with 24 fluted marble columns taken from the Temple of Juno Regina.' },
  { id: 'paul', name: 'San Paolo fuori le Mura', type: 'church',
    x: -240, z: -280, w: 55, d: 95, h: 24, state: 'working', region: 'XIII', source: 'paul', evidence: E_ARCH,
    detail: 'Grand basilica founded by Valentinian II, Theodosius, and Arcadius along the Ostian Way.' },

  // ──── AURELIAN CIRCUIT WALLS & GATES ────
  { id: 'porta-appia', name: 'Porta Appia (Porta San Sebastiano)', type: 'gate',
    x: -20, z: -300, w: 34, d: 18, h: 20, state: 'fortified', region: 'I', source: 'walls', evidence: E_ARCH,
    detail: 'Twin semicircular marble-faced towers commanding the Appian Way; heightened under Honorius.' },
  { id: 'porta-ostiense', name: 'Porta Ostiensis (Porta San Paolo)', type: 'gate',
    x: -215, z: -245, w: 34, d: 18, h: 21, state: 'fortified', region: 'XIII', source: 'walls', evidence: E_ARCH,
    detail: 'Crenellated brick gatehouse opening to Ostia, framed beside the Pyramid of Cestius.' },
  { id: 'pyramid', name: 'Pyramid of Cestius', type: 'pyramid',
    x: -205, z: -215, w: 38, d: 38, h: 38, state: 'standing', region: 'XIII', source: 'walls', evidence: E_ARCH,
    detail: 'White marble pyramid tomb (12 BC) incorporated into the defensive Aurelian Wall curtain.' },
  { id: 'porta-flaminia', name: 'Porta Flaminia', type: 'gate',
    x: -215, z: 300, w: 34, d: 18, h: 22, state: 'fortified', region: 'VII', source: 'walls', evidence: E_ARCH,
    detail: 'Northern ceremonial entrance on the Via Flaminia leading down the Via Lata.' },
  { id: 'porta-salaria', name: 'Porta Salaria', type: 'gate',
    x: -50, z: 300, w: 34, d: 18, h: 22, state: 'fortified', region: 'VI', source: 'walls', evidence: E_ARCH,
    detail: 'Northeastern gate breached by Alaric\'s Visigoths on the night of August 24, 410 AD.' },
  { id: 'porta-mag', name: 'Porta Maggiore', type: 'gate',
    x: 230, z: 60, w: 36, d: 20, h: 21, state: 'fortified', region: 'V', source: 'walls', evidence: E_ARCH,
    detail: 'Monumental travertine double-arch aqueduct crossing of Aqua Claudia converted into an eastern city gate.' },
  { id: 'claudia', name: 'Aqua Claudia & Anio Novus', type: 'aqueduct',
    x: 170, z: -10, w: 150, d: 10, h: 16, state: 'damaged', region: 'V', source: 'notitia', evidence: E_ARCH,
    detail: 'Majestic arcade of the imperial aqueduct supplying the Palatine and Caelian hills.' },
  { id: 'tiber', name: 'Tiber River (Tevere)', type: 'river',
    x: -290, z: 0, w: 30, d: 700, h: 0, state: 'standing', region: 'XIV', source: 'notitia', evidence: E_ARCH,
    detail: 'The working river of Rome; wharves, mills and bridges along its urban course.' },
];

/* ── Tiber River Polyline (Flowing from north to south) ───── */

export const WATERS = [
  {
    id: 'tiber',
    name: 'Tiber River (Tevere)',
    type: 'river',
    points: [
      { x: -292, z: 340 },
      { x: -288, z: 200 },
      { x: -290, z: 60 },
      { x: -286, z: -80 },
      { x: -290, z: -220 },
      { x: -284, z: -340 }
    ],
    width: 30,
    color: 0x36585c
  }
];

/* ── Spawn & Bounds ───────────────────────────────────────── */

export const BOUNDS = { minX: -168, maxX: 134.4, minZ: -285.6, maxZ: 285.6 };
export const COMPACTION = { xFactor: 0.42, zFactor: 0.84, factor: 0.84, origin: { x: 0, z: 0 } };
function compactPoint(point) {
  point.x *= COMPACTION.xFactor;
  point.z *= COMPACTION.zFactor;
}
for (const region of REGIONS) { compactPoint(region); region.w *= 0.5; }
for (const street of STREETS) street.points.forEach((point) => {
  point[0] *= COMPACTION.xFactor;
  point[1] *= COMPACTION.zFactor;
});
for (const building of BUILDINGS) { compactPoint(building); building.w *= 0.5; }
for (const water of WATERS) {
  water.points.forEach(compactPoint);
  water.width *= 0.5;
  // Preserve the dense audio/visual river sampling contract after shortening the route.
  for (let density = 0; density < 3; density++) water.points = water.points.flatMap((point, index, points) => {
    const next = points[index + 1];
    if (!next) return [point];
    return [point, { x: (point.x + next.x) / 2 + (index % 2 ? 9 : -9), z: (point.z + next.z) / 2 }];
  });
}

const SPAWN_POSITION = { x: -200 * COMPACTION.xFactor, z: 314 * COMPACTION.zFactor };
const SPAWN_TARGET = BUILDINGS.find((building) => building.id === 'colosseum');
export const SPAWN = {
  ...SPAWN_POSITION,
  angle: Math.atan2(SPAWN_TARGET.x - SPAWN_POSITION.x, SPAWN_TARGET.z - SPAWN_POSITION.z),
}; // Via Lata approach, outside the Aurelian circuit, facing the city

export const TELEPORTS = [
  { id: 'colosseum', name: 'Colosseum (Flavian Amphitheatre)' },
  { id: 'pantheon', name: 'Pantheon' },
  { id: 'forum', name: 'Forum Romanum' },
  { id: 'maxentius', name: 'Basilica of Maxentius' },
  { id: 'constantine-arch', name: 'Arch of Constantine' },
  { id: 'trajan-forum', name: 'Forum of Trajan & Column' },
  { id: 'caracalla', name: 'Baths of Caracalla' },
  { id: 'diocletian', name: 'Baths of Diocletian' },
  { id: 'circus', name: 'Circus Maximus' },
  { id: 'hadrian', name: 'Mausoleum of Hadrian (Castel Sant\'Angelo)' },
  { id: 'peter', name: 'Old St. Peter’s Basilica' },
  { id: 'maria-maggiore', name: 'Santa Maria Maggiore' },
  { id: 'sabina', name: 'Santa Sabina on Aventine' },
  { id: 'boarium', name: 'Forum Boarium & Portunus' },
  { id: 'porta-appia', name: 'Porta Appia' },
  { id: 'porta-salaria', name: 'Porta Salaria' },
];

export const TOUR_STOPS = [
  { id: 'porta-salaria', title: 'Porta Salaria', description: 'Where Alaric\'s Visigoths entered Rome on August 24, 410 AD, shaking the Mediterranean world.', duration: 30 },
  { id: 'colosseum', title: 'The Colosseum', description: 'Still towering at 48 meters, with post-443 earthquake repairs and active gladiatorial/beast displays.', duration: 40 },
  { id: 'constantine-arch', title: 'Arch of Constantine', description: 'The famous triple-bay arch commemorating the 312 battle of the Milvian Bridge, adorned with reused spolia.', duration: 25 },
  { id: 'forum', title: 'Forum Romanum', description: 'The historic heart of civic life, surrounded by the Curia Julia, Basilica of Maxentius, and Temple of Saturn.', duration: 40 },
  { id: 'pantheon', title: 'The Pantheon', description: 'The miraculous concrete dome of Hadrian, intact and soaring with its unglazed oculus.', duration: 40 },
  { id: 'trajan-forum', title: 'Forum & Column of Trajan', description: 'Trajan\'s 35-meter spiral Carrara column celebrating the Dacian wars beside the multi-tiered market.', duration: 30 },
  { id: 'caracalla', title: 'Baths of Caracalla', description: 'Vast vaulted halls with mosaic floors and heated caldaria, representing imperial engineering at its peak.', duration: 35 },
  { id: 'circus', title: 'Circus Maximus', description: 'The grand chariot racing track nestled between the Palatine imperial palaces and Aventine hill.', duration: 30 },
  { id: 'hadrian', title: 'Hadrian\'s Tomb & Pons Aelius', description: 'The massive cylindrical tomb overlooking the Tiber, fortified by Honorius as a bridgehead fortress.', duration: 35 },
  { id: 'peter', title: 'Old St. Peter’s Basilica', description: 'Constantine\'s great five-aisled pilgrimage church over the Apostle Peter\'s tomb in the Vatican.', duration: 40 },
];

export const DISTRICT_STYLES = {
  'I':    { density: 0.55, heightRange: [6, 12], shopRatio: 0.35, materials: ['romanBrick', 'plasterAged'] },
  'II':   { density: 0.50, heightRange: [7, 14], shopRatio: 0.30, materials: ['travertine', 'romanBrick'] },
  'III':  { density: 0.70, heightRange: [8, 16], shopRatio: 0.55, materials: ['romanBrick', 'plaster'] },
  'IV':   { density: 0.85, heightRange: [10, 18], shopRatio: 0.70, materials: ['romanBrick', 'plasterAged'] },
  'V':    { density: 0.60, heightRange: [7, 13], shopRatio: 0.40, materials: ['romanBrick', 'travertine'] },
  'VI':   { density: 0.65, heightRange: [8, 15], shopRatio: 0.45, materials: ['travertine', 'plaster'] },
  'VII':  { density: 0.75, heightRange: [9, 16], shopRatio: 0.60, materials: ['romanBrick', 'plaster'] },
  'VIII': { density: 0.40, heightRange: [6, 12], shopRatio: 0.20, materials: ['travertine', 'marble'] },
  'IX':   { density: 0.75, heightRange: [8, 15], shopRatio: 0.65, materials: ['romanBrick', 'travertine'] },
  'X':    { density: 0.30, heightRange: [10, 20], shopRatio: 0.05, materials: ['travertine', 'marble'] },
  'XI':   { density: 0.60, heightRange: [6, 12], shopRatio: 0.50, materials: ['romanBrick', 'tufa'] },
  'XII':  { density: 0.50, heightRange: [6, 12], shopRatio: 0.30, materials: ['romanBrick', 'plasterAged'] },
  'XIII': { density: 0.65, heightRange: [8, 14], shopRatio: 0.50, materials: ['romanBrick', 'travertine'] },
  'XIV':  { density: 0.80, heightRange: [6, 13], shopRatio: 0.65, materials: ['romanBrick', 'plasterAged'] },
};
