/**
 * city-data.js — Rome AD 410–476 · Complete Late Antique Dataset
 * Adapted from Stanford Forma Urbis, Notitia 14 Regionum, Claridge, and Krautheimer.
 * Coordinates: 1 unit ≈ 0.7m on the ground.
 */

/* ── City metadata ────────────────────────────────────────── */

export const CITY = {
  id: 'rome-410-476',
  title: 'ROME · AD 410–476',
  subtitle: 'The Late Antique Capital between Sack, Survival, and Transformation',
  scaleMetres: 2400,
  period: 'AD 410–476',
  boundary: 'Aurelian Walls',
  description: 'A source-led, navigable reconstruction of Rome from the sack of Alaric (410) through Gaiseric (455) to the deposition of Romulus Augustulus (476): the colossal Colosseum, intact Pantheon, grand basilicas, ruined imperial fora, and the fortified Aurelian circuit.',
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

/* ── 14 Augustan Regiones ──────────────────────────────────── */

export const REGIONS = [
  { id: 'I', name: 'Regio I · Porta Capena', x: -90, z: -570, w: 270, d: 190, note: 'South-east gateways, Appian approach and imperial-era fabric.' },
  { id: 'II', name: 'Regio II · Caelimontium', x: -80, z: -275, w: 260, d: 220, note: 'Caelian hill, villas and new Christian basilicas.' },
  { id: 'III', name: 'Regio III · Isis et Serapis', x: 45, z: -75, w: 260, d: 240, note: 'Colosseum, Ludus Magnus and Oppian hill.' },
  { id: 'IV', name: 'Regio IV · Templum Pacis', x: -190, z: 80, w: 280, d: 220, note: 'Forum of Peace, Subura edge and Basilica of Maxentius.' },
  { id: 'V', name: 'Regio V · Esquiliae', x: 135, z: 210, w: 300, d: 250, note: 'Esquiline residences, reservoirs and Santa Maria Maggiore.' },
  { id: 'VI', name: 'Regio VI · Alta Semita', x: -120, z: 310, w: 310, d: 250, note: 'Quirinal, Diocletian’s baths and Sallust’s gardens.' },
  { id: 'VII', name: 'Regio VII · Via Lata', x: -365, z: 260, w: 240, d: 370, note: 'Via Lata corridor, porticoes and northern Campus Martius.' },
  { id: 'VIII', name: 'Regio VIII · Forum Romanum', x: -170, z: -85, w: 250, d: 190, note: 'Forum Romanum, Capitol and imperial fora.' },
  { id: 'IX', name: 'Regio IX · Circus Flaminius', x: -430, z: 30, w: 280, d: 255, note: 'Campus Martius, Pantheon, theatres and Tiber-facing trade.' },
  { id: 'X', name: 'Regio X · Palatium', x: -10, z: -235, w: 230, d: 175, note: 'Palatine palace shell and sacred slopes.' },
  { id: 'XI', name: 'Regio XI · Circus Maximus', x: -200, z: -305, w: 315, d: 135, note: 'Circus valley, Velabrum and Forum Boarium.' },
  { id: 'XII', name: 'Regio XII · Piscina Publica', x: 70, z: -455, w: 285, d: 185, note: 'Baths of Caracalla and southern residential zones.' },
  { id: 'XIII', name: 'Regio XIII · Aventinus', x: -300, z: -430, w: 260, d: 255, note: 'Aventine hill, Emporium, horrea and Santa Sabina.' },
  { id: 'XIV', name: 'Regio XIV · Transtiberim', x: -655, z: 5, w: 270, d: 510, note: 'Trastevere, Tiber Island, and Old St. Peter’s Vatican approach.' },
];

/* ── Famous Roman Consular Ways (Viae) ─────────────────────── */

export const STREETS = [
  { id: 'via-sacra', name: 'Via Sacra', points: [[-290,-52],[-215,-38],[-142,-30],[-60,-35],[25,-60]], width: 18, source: 'forum' },
  { id: 'via-lata', name: 'Via Lata', points: [[-350,525],[-345,370],[-335,210],[-320,60],[-310,-100]], width: 20, source: 'notitia' },
  { id: 'via-appia', name: 'Via Appia', points: [[-110,-350],[-75,-470],[-55,-595]], width: 18, source: 'notitia' },
  { id: 'via-ostiense', name: 'Via Ostiensis', points: [[-275,-260],[-360,-390],[-440,-550]], width: 16, source: 'paul' },
  { id: 'via-salaria', name: 'Via Salaria', points: [[-125,350],[-95,510],[-70,625]], width: 16, source: 'walls' },
  { id: 'via-flaminia', name: 'Via Flaminia', points: [[-355,430],[-390,590],[-430,680]], width: 18, source: 'notitia' },
  { id: 'via-tiburtina', name: 'Via Tiburtina', points: [[110,190],[235,315],[350,430]], width: 16, source: 'notitia' },
  { id: 'via-praenestina', name: 'Via Praenestina', points: [[125,35],[310,80],[485,130]], width: 15, source: 'notitia' },
  { id: 'via-latina', name: 'Via Latina', points: [[-45,-410],[80,-540],[180,-640]], width: 14, source: 'notitia' },
  { id: 'via-aurelia', name: 'Via Aurelia', points: [[-610,170],[-760,250],[-890,330]], width: 16, source: 'notitia' },
  { id: 'triumphalis', name: 'Via Triumphalis', points: [[-650,205],[-560,185],[-475,150]], width: 15, source: 'peter' },
  { id: 'vatican-way', name: 'Via Cornelia', points: [[-720,60],[-625,95],[-520,115]], width: 14, source: 'peter' },
];

/* ── Evidence standards ───────────────────────────────────── */

const E_ARCH = { level: 'archaeological', note: 'Monumental remains standing or extensively excavated.' };
const E_DOC = { level: 'documented', note: 'Textual references in Notitia 14 Regionum and Late Antique chronicles.' };
const E_PLAUS = { level: 'plausible', note: 'Contextual restitution based on Late Antique urban patterns.' };

/* ── Monuments & Landmarks (55+ structures) ───────────────── */

export const BUILDINGS = [
  // ──── SPECTACLE & HERO MONUMENTS ────
  { id: 'colosseum', name: 'Colosseum (Amphitheatrum Flavium)', type: 'amphitheatre',
    x: 52, z: -65, w: 135, d: 110, h: 48, state: 'repaired', region: 'III', source: 'colosseum', evidence: E_ARCH,
    detail: 'The colossal amphitheatre, still hosting venationes (beast hunts). Features post-443 earthquake repairs.' },
  { id: 'pantheon', name: 'Pantheon', type: 'dome',
    x: -365, z: 120, w: 64, d: 64, h: 39, state: 'standing', region: 'IX', source: 'pantheon', evidence: E_ARCH,
    detail: 'Hadrian\'s intact concrete rotunda with a 43.3m dome and bronze-framed oculus. Still a civic/pagan marvel.' },
  { id: 'circus', name: 'Circus Maximus', type: 'circus',
    x: -185, z: -310, w: 280, d: 74, h: 18, state: 'damaged', region: 'XI', source: 'forum', evidence: E_ARCH,
    detail: 'The great chariot racing stadium between Palatine and Aventine, seating over 150,000 in its prime.' },
  { id: 'ludus', name: 'Ludus Magnus', type: 'arena',
    x: 112, z: -120, w: 54, d: 45, h: 15, state: 'damaged', region: 'III', source: 'colosseum', evidence: E_ARCH,
    detail: 'Principal gladiatorial barracks with its own miniature amphitheatre connected to the Colosseum by tunnel.' },

  // ──── FORUM ROMANUM CIVIC CORE ────
  { id: 'forum', name: 'Roman Forum (Forum Romanum)', type: 'forum',
    x: -185, z: -65, w: 175, d: 105, h: 5, state: 'spoliated', region: 'VIII', source: 'forum', evidence: E_ARCH,
    detail: 'The historic heart of the Empire; temples stripped of bronze tiles, but still the symbolic center of the Senate.' },
  { id: 'curia', name: 'Curia Julia', type: 'basilica',
    x: -235, z: -30, w: 38, d: 25, h: 20, state: 'standing', region: 'VIII', source: 'forum', evidence: E_ARCH,
    detail: 'Senate House restored by Diocletian; strong brick shell with porphyry and marble floor.' },
  { id: 'saturn', name: 'Temple of Saturn', type: 'temple',
    x: -272, z: -60, w: 34, d: 24, h: 18, state: 'spoliated', region: 'VIII', source: 'forum', evidence: E_ARCH,
    detail: 'State treasury (Aerarium); granite Ionic columns stand with late 4th-century restoration inscription.' },
  { id: 'castor', name: 'Temple of Castor and Pollux', type: 'temple',
    x: -132, z: -68, w: 30, d: 24, h: 17, state: 'spoliated', region: 'VIII', source: 'forum', evidence: E_ARCH,
    detail: 'Peripteral Corinthian temple of the Dioscuri standing proudly near the Lacus Juturnae.' },
  { id: 'vesta', name: 'Temple of Vesta', type: 'round',
    x: -100, z: -38, w: 22, d: 22, h: 17, state: 'damaged', region: 'VIII', source: 'forum', evidence: E_ARCH,
    detail: 'Circular shrine of the eternal fire, defunct since Theodosius extinguished the sacred flame in 394.' },
  { id: 'aemilia', name: 'Basilica Aemilia', type: 'basilica',
    x: -235, z: -95, w: 82, d: 34, h: 17, state: 'ruined', region: 'VIII', source: 'walls', evidence: E_ARCH,
    detail: 'Burned during Alaric\'s 410 sack; bronze coins melted into the marble floor tiles.' },
  { id: 'julia', name: 'Basilica Julia', type: 'basilica',
    x: -145, z: -105, w: 95, d: 34, h: 13, state: 'damaged', region: 'VIII', source: 'walls', evidence: E_ARCH,
    detail: 'Double aisles of marble arcades; game boards (tabulae lusoriae) still etched on its steps.' },
  { id: 'maxentius', name: 'Basilica of Maxentius & Constantine', type: 'basilica',
    x: -60, z: 35, w: 102, d: 57, h: 34, state: 'damaged', region: 'IV', source: 'forum', evidence: E_ARCH,
    detail: 'Colossal barrel-vaulted basilica, the largest building in the Forum with 35m-high concrete coffered vaults.' },

  // ──── TRIUMPHAL ARCHES ────
  { id: 'constantine-arch', name: 'Arch of Constantine', type: 'arch',
    x: 20, z: -130, w: 28, d: 14, h: 22, state: 'standing', region: 'X', source: 'colosseum', evidence: E_ARCH,
    detail: 'Triple-bay triumphal arch built 315 AD incorporating high-relief spolia sculptures from Trajan and Hadrian.' },
  { id: 'severus-arch', name: 'Arch of Septimius Severus', type: 'arch',
    x: -275, z: 1, w: 28, d: 13, h: 21, state: 'standing', region: 'VIII', source: 'forum', evidence: E_ARCH,
    detail: 'White marble triple arch at the foot of the Capitoline commemorating Parthian campaigns.' },
  { id: 'titus-arch', name: 'Arch of Titus', type: 'arch',
    x: -25, z: -88, w: 25, d: 13, h: 20, state: 'standing', region: 'X', source: 'forum', evidence: E_ARCH,
    detail: 'Single-arch monument on the Velian ridge, depicting the spoils of the Jerusalem Temple (Menorah).' },
  { id: 'janus', name: 'Arch of Janus (Quadrifrons)', type: 'arch',
    x: -288, z: -190, w: 22, d: 18, h: 20, state: 'standing', region: 'XI', source: 'forum', evidence: E_ARCH,
    detail: 'Four-way marble crossroads arch over the Cloaca Maxima at the Forum Boarium entrance.' },

  // ──── IMPERIAL FORA & TRAJAN’S COMPLEX ────
  { id: 'trajan-forum', name: 'Forum of Trajan', type: 'forum',
    x: -265, z: 95, w: 108, d: 115, h: 7, state: 'spoliated', region: 'VIII', source: 'forum', evidence: E_ARCH,
    detail: 'The grandest imperial forum with its gilded bronze equestrian statues, libraries, and Basilica Ulpia.' },
  { id: 'trajan-column', name: 'Trajan’s Column', type: 'column',
    x: -240, z: 113, w: 11, d: 11, h: 37, state: 'standing', region: 'VIII', source: 'forum', evidence: E_ARCH,
    detail: 'Freestanding Carrara marble spiral relief column depicting the Dacian Wars; 35m landmark.' },
  { id: 'trajan-market', name: 'Trajan’s Market', type: 'market',
    x: -305, z: 138, w: 76, d: 58, h: 22, state: 'standing', region: 'VIII', source: 'forum', evidence: E_ARCH,
    detail: 'Multi-level brick hemicycle shopping and administrative complex cut into the Quirinal hill.' },
  { id: 'augustus-forum', name: 'Forum of Augustus', type: 'forum',
    x: -155, z: 120, w: 88, d: 67, h: 6, state: 'spoliated', region: 'VIII', source: 'forum', evidence: E_ARCH,
    detail: 'High peperino fire-wall enclosing the Temple of Mars Ultor.' },

  // ──── IMPERIAL PALACE & CAPITOL ────
  { id: 'palatine', name: 'Palatine Imperial Palace (Domus Augustana)', type: 'palace',
    x: -25, z: -245, w: 142, d: 100, h: 34, state: 'damaged', region: 'X', source: 'walls', evidence: E_ARCH,
    detail: 'Vast multi-winged imperial palace complex overlooking the Circus Maximus; partially stripped by Visigoths.' },
  { id: 'venus-roma', name: 'Temple of Venus and Roma', type: 'temple',
    x: -15, z: 2, w: 78, d: 32, h: 22, state: 'spoliated', region: 'IV', source: 'forum', evidence: E_ARCH,
    detail: 'Double decastyle temple designed by Hadrian with back-to-back apses dedicated to Venus Felix and Roma Aeterna.' },

  // ──── IMPERIAL BATHS (THERMAE) ────
  { id: 'caracalla', name: 'Baths of Caracalla (Thermae Antoninianae)', type: 'bath',
    x: 65, z: -438, w: 175, d: 132, h: 37, state: 'working', region: 'XII', source: 'caracalla', evidence: E_ARCH,
    detail: 'Vast thermal leisure complex with natatio pool, caldarium rotunda, and palatial mosaic courtyards.' },
  { id: 'diocletian', name: 'Baths of Diocletian', type: 'bath',
    x: 12, z: 375, w: 175, d: 126, h: 34, state: 'working', region: 'VI', source: 'diocletian', evidence: E_ARCH,
    detail: 'The largest imperial thermae in the Roman world, holding up to 3,000 bathers simultaneously.' },

  // ──── THEATRES & CAMPUS MARTIUS ────
  { id: 'marcellus', name: 'Theatre of Marcellus', type: 'theatre',
    x: -390, z: -70, w: 94, d: 58, h: 28, state: 'standing', region: 'IX', source: 'forum', evidence: E_ARCH,
    detail: 'Three-tiered open-air theatre with Doric and Ionic travertine arcades, precursor model to the Colosseum.' },
  { id: 'pompey', name: 'Theatre of Pompey', type: 'theatre',
    x: -445, z: 53, w: 118, d: 72, h: 29, state: 'damaged', region: 'IX', source: 'forum', evidence: E_ARCH,
    detail: 'Rome\'s first permanent stone theatre (55 BC), site of Julius Caesar\'s assassination in the curia hall.' },
  { id: 'stadium', name: 'Stadium of Domitian (Piazza Navona outline)', type: 'stadium',
    x: -445, z: 205, w: 126, d: 51, h: 14, state: 'spoliated', region: 'IX', source: 'forum', evidence: E_ARCH,
    detail: 'Athletic stadium whose shape survives today in Piazza Navona; inhabited by early medieval tenements.' },

  // ──── TIBER RIVER & FORUM BOARIUM ────
  { id: 'boarium', name: 'Forum Boarium', type: 'market',
    x: -330, z: -210, w: 104, d: 75, h: 7, state: 'standing', region: 'XI', source: 'forum', evidence: E_ARCH,
    detail: 'Ancient cattle market and river harbour (Portus Tiberinus) on the banks of the Tiber.' },
  { id: 'portunus', name: 'Temple of Portunus', type: 'temple',
    x: -365, z: -210, w: 31, d: 22, h: 17, state: 'standing', region: 'XI', source: 'forum', evidence: E_ARCH,
    detail: 'Ionic tetrastyle pseudoperipteral temple dedicated to the god of river ports and keys; well-preserved.' },
  { id: 'hercules', name: 'Temple of Hercules Victor', type: 'round',
    x: -320, z: -187, w: 28, d: 28, h: 18, state: 'standing', region: 'XI', source: 'forum', evidence: E_ARCH,
    detail: 'Monopteros Greek marble circular temple surrounded by 20 Corinthian columns; oldest surviving marble building in Rome.' },
  { id: 'pons-aelius', name: 'Pons Aelius (Ponte Sant\'Angelo)', type: 'bridge',
    x: -500, z: 95, w: 112, d: 15, h: 10, state: 'standing', region: 'XIV', source: 'hadrian', evidence: E_ARCH,
    detail: 'Monumental five-arch travertine bridge spanning the Tiber toward Hadrian’s mausoleum.' },
  { id: 'hadrian', name: 'Mausoleum of Hadrian (Castel Sant\'Angelo)', type: 'mausoleum',
    x: -560, z: 125, w: 74, d: 74, h: 42, state: 'fortified', region: 'XIV', source: 'hadrian', evidence: E_ARCH,
    detail: 'Cylindrical tomb crowned with earthen tumulus, converted by Emperor Honorius into a bridgehead fortress.' },

  // ──── EARLY CHRISTIAN BASILICAS ────
  { id: 'peter', name: 'Old St. Peter’s Basilica', type: 'church',
    x: -710, z: 115, w: 160, d: 70, h: 30, state: 'working', region: 'XIV', source: 'peter', evidence: E_ARCH,
    detail: 'Constantine\'s five-aisled pilgrimage basilica built over the tomb of St. Peter in the Vatican necropolis.' },
  { id: 'maria-maggiore', name: 'Santa Maria Maggiore', type: 'church',
    x: 130, z: 215, w: 103, d: 49, h: 28, state: 'new', region: 'V', source: 'smm', evidence: E_ARCH,
    detail: 'Built under Pope Sixtus III (432–440) celebrating Mary as Theotokos with splendid 5th-century mosaics.' },
  { id: 'sabina', name: 'Santa Sabina on the Aventine', type: 'church',
    x: -302, z: -425, w: 82, d: 39, h: 24, state: 'new', region: 'XIII', source: 'sabina', evidence: E_ARCH,
    detail: 'Classical basilica erected 422–432 with 24 fluted marble columns taken from the Temple of Juno Regina.' },
  { id: 'paul', name: 'San Paolo fuori le Mura', type: 'church',
    x: -505, z: -605, w: 142, d: 63, h: 30, state: 'working', region: 'XIII', source: 'paul', evidence: E_ARCH,
    detail: 'Grand basilica founded by Valentinian II, Theodosius, and Arcadius along the Ostian Way.' },

  // ──── AURELIAN CIRCUIT WALLS & GATES ────
  { id: 'porta-appia', name: 'Porta Appia (Porta San Sebastiano)', type: 'gate',
    x: -50, z: -625, w: 42, d: 20, h: 23, state: 'fortified', region: 'I', source: 'walls', evidence: E_ARCH,
    detail: 'Twin semicircular marble-faced towers commanding the Appian Way; heightened under Honorius.' },
  { id: 'porta-ostiense', name: 'Porta Ostiensis (Porta San Paolo)', type: 'gate',
    x: -450, z: -535, w: 38, d: 18, h: 21, state: 'fortified', region: 'XIII', source: 'walls', evidence: E_ARCH,
    detail: 'Crenellated brick gatehouse opening to Ostia, framed beside the Pyramid of Cestius.' },
  { id: 'pyramid', name: 'Pyramid of Cestius', type: 'pyramid',
    x: -440, z: -475, w: 38, d: 38, h: 38, state: 'standing', region: 'XIII', source: 'walls', evidence: E_ARCH,
    detail: 'White marble pyramid tomb (12 BC) incorporated into the defensive Aurelian Wall curtain.' },
  { id: 'porta-flaminia', name: 'Porta Flaminia', type: 'gate',
    x: -435, z: 685, w: 38, d: 18, h: 22, state: 'fortified', region: 'VII', source: 'walls', evidence: E_ARCH,
    detail: 'Northern ceremonial entrance on the Via Flaminia leading down the Via Lata.' },
  { id: 'porta-salaria', name: 'Porta Salaria', type: 'gate',
    x: -92, z: 640, w: 38, d: 18, h: 22, state: 'fortified', region: 'VI', source: 'walls', evidence: E_ARCH,
    detail: 'Northeastern gate breached by Alaric\'s Visigoths on the night of August 24, 410 AD.' },
  { id: 'porta-mag', name: 'Porta Maggiore', type: 'gate',
    x: 475, z: 130, w: 44, d: 22, h: 23, state: 'fortified', region: 'V', source: 'walls', evidence: E_ARCH,
    detail: 'Monumental travertine double-arch aqueduct crossing of Aqua Claudia converted into an eastern city gate.' },
  { id: 'claudia', name: 'Aqua Claudia & Anio Novus', type: 'aqueduct',
    x: 340, z: -35, w: 290, d: 12, h: 20, state: 'damaged', region: 'V', source: 'notitia', evidence: E_ARCH,
    detail: 'Majestic arcade of the imperial aqueduct supplying the Palatine and Caelian hills.' },
];

/* ── Tiber River Polyline (Flowing from north to south) ───── */

export const WATERS = [
  {
    id: 'tiber',
    name: 'Tiber River (Tevere)',
    type: 'river',
    points: [
      { x: -430, z: 720 },
      { x: -480, z: 460 },
      { x: -540, z: 240 },
      { x: -520, z: 95 },
      { x: -485, z: -60 },
      { x: -450, z: -200 },
      { x: -420, z: -390 },
      { x: -440, z: -650 }
    ],
    width: 42,
    color: 0x36585c
  }
];

/* ── Spawn & Bounds ───────────────────────────────────────── */

export const SPAWN = { x: -350, z: 520, angle: Math.PI }; // Starting near Porta Flaminia / Via Lata facing south

export const BOUNDS = { minX: -950, maxX: 600, minZ: -750, maxZ: 750 };

/* ── Fast Travel Teleports ────────────────────────────────── */

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

/* ── Guided Historical Tour Stops ─────────────────────────── */

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

/* ── District styles for Roman insulae generation ─────────── */

export const DISTRICT_STYLES = {
  'I':    { density: 0.55, heightRange: [6, 12], shopRatio: 0.35, materials: ['romanBrick', 'plasterAged'] },
  'II':   { density: 0.50, heightRange: [7, 14], shopRatio: 0.30, materials: ['travertine', 'romanBrick'] },
  'III':  { density: 0.70, heightRange: [8, 16], shopRatio: 0.55, materials: ['romanBrick', 'plaster'] },
  'IV':   { density: 0.85, heightRange: [10, 18], shopRatio: 0.70, materials: ['romanBrick', 'plasterAged'] }, // Subura dense
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
