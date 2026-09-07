/**
 * city-data.js — Athens 450-430 BCE · Complete Monument Dataset
 * Adapted from aizanoi-analytics city-source.js with period corrections.
 * Coordinates: 1 unit ≈ 0.7m on the ground.
 */

/* ── City metadata ────────────────────────────────────────── */

export const CITY = {
  id: 'athens-450-430',
  title: 'ATHENS · 450–430 BCE',
  subtitle: 'The Periclean city between the Thirty Years\' Peace and the Plague',
  scaleMetres: 2200,
  period: '450–430 BCE',
  boundary: 'Themistoclean Walls',
  description: 'A source-led, navigable reconstruction of Classical Athens in a c. 432–430 BCE visual snapshot: the completed Parthenon and Propylaea, the Agora civic core, Kerameikos gates, Piraeus and the Long Walls corridor.',
};

/* ── Academic sources ─────────────────────────────────────── */

export const SOURCES = [
  { id: 'parthenon', title: 'Parthenon (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Parthenon' },
  { id: 'propylaea', title: 'Propylaea (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Propylaea' },
  { id: 'acropolis', title: 'Acropolis of Athens (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Acropolis_of_Athens' },
  { id: 'agora', title: 'Ancient Agora of Athens (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Ancient_Agora_of_Athens' },
  { id: 'ascsa', title: 'ASCSA Agora Excavations', url: 'https://www.agoraexcavations.org/' },
  { id: 'hephaisteion', title: 'Hephaisteion (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Hephaisteion' },
  { id: 'stoa-poikile', title: 'Stoa Poikile (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Stoa_Poikile' },
  { id: 'stoa-zeus', title: 'Stoa of Zeus Eleutherios (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Stoa_of_Zeus_Eleutherios' },
  { id: 'royal-stoa', title: 'Royal Stoa (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Royal_Stoa' },
  { id: 'stoa-hermes', title: 'Stoa of Hermes (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Stoa_of_Hermes' },
  { id: 'tholos', title: 'Tholos (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Tholos_of_Athens' },
  { id: 'bouleuterion', title: 'Bouleuterion (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Bouleuterion' },
  { id: 'theatre-dionysus', title: 'Theatre of Dionysus (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Theatre_of_Dionysus' },
  { id: 'odeion-pericles', title: 'Odeon of Pericles (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Odeon_of_Pericles' },
  { id: 'kerameikos', title: 'Kerameikos (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Kerameikos' },
  { id: 'pnyx', title: 'Pnyx (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Pnyx' },
  { id: 'areopagus', title: 'Areopagus (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Areopagus' },
  { id: 'olympieion', title: 'Temple of Olympian Zeus (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Olympieion' },
  { id: 'academy', title: 'Platonic Academy (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Platonic_Academy' },
  { id: 'piraeus', title: 'Piraeus (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Piraeus' },
  { id: 'long-walls', title: 'Long Walls (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Long_Walls' },
  { id: 'panathenaea', title: 'Panathenaea (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Panathenaea' },
  { id: 'eleusis', title: 'Eleusinian Mysteries (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Eleusinian_Mysteries' },
  { id: 'athena-nike', title: 'Temple of Athena Nike (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Temple_of_Athena_Nike' },
  { id: 'pericles', title: 'Pericles (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Pericles' },
];

/* ── Districts ────────────────────────────────────────────── */

export const REGIONS = [
  { id: 'acropolis', name: 'Akropolis precinct', x: -20, z: -310, w: 260, d: 160, note: 'The sacred rock and its temples; the rebuilt heart of the city.' },
  { id: 'south-slope', name: 'South slope of the Akropolis', x: -90, z: -180, w: 260, d: 140, note: 'Theatre of Dionysus and Odeion of Pericles below the Acropolis.' },
  { id: 'agora', name: 'Agora of Athens', x: 110, z: 10, w: 330, d: 260, note: 'Civic centre: stoas, bouleuterion, tholos, Panathenaic Way.' },
  { id: 'lower-city', name: 'Lower city & Plaka slopes', x: 60, z: -110, w: 280, d: 160, note: 'Houses and workshops between Agora and south slope.' },
  { id: 'kerameikos', name: 'Kerameikos & Sacred Gate', x: 360, z: 210, w: 260, d: 180, note: 'Potters\' quarter, cemetery, Dipylon and Sacred Gates.' },
  { id: 'northgate', name: 'North Gate & Academy approach', x: 230, z: 420, w: 300, d: 170, note: 'Dromos to the Academy.' },
  { id: 'pnyx', name: 'Pnyx & Areopagus', x: -260, z: -90, w: 160, d: 200, note: 'Assembly rock and the homicide court.' },
  { id: 'olympieion', name: 'Olympieion & Ilissos', x: -340, z: 90, w: 180, d: 260, note: 'Archaic temple precinct; the Ilissos valley.' },
  { id: 'long-walls', name: 'Long Walls corridor', x: 480, z: 40, w: 360, d: 720, note: 'Parallel fortified walls running to Piraeus.' },
  { id: 'piraeus', name: 'Piraeus', x: 900, z: 220, w: 260, d: 260, note: 'Hippodamian harbour city: emporion, shipsheds.' },
];

/* ── Streets ──────────────────────────────────────────────── */

export const STREETS = [
  { id: 'dromos', name: 'Dromos', points: [[110,310],[240,330],[340,330],[450,310]], width: 24, source: 'kerameikos' },
  { id: 'sacred-way', name: 'Sacred Way (to Eleusis)', points: [[380,200],[470,140],[560,80],[660,30]], width: 18, source: 'eleusis' },
  { id: 'panathenaic-way', name: 'Panathenaic Way', points: [[240,230],[180,180],[110,140],[40,80],[-30,20],[-110,-60]], width: 22, source: 'panathenaea' },
  { id: 'eastern-long-wall', name: 'Northern Long Wall', points: [[340,30],[500,80],[680,180],[870,260]], width: 22, source: 'long-walls' },
  { id: 'southern-long-wall', name: 'Southern Long Wall', points: [[330,-40],[490,30],[670,150],[860,250]], width: 22, source: 'long-walls' },
  { id: 'phaleron-way', name: 'Road to Phaleron', points: [[70,90],[150,160],[230,210],[320,250]], width: 16, source: 'piraeus' },
  { id: 'academy-road', name: 'Road to the Academy', points: [[300,360],[360,440],[420,520],[500,600]], width: 18, source: 'academy' },
  { id: 'piraeus-grid-east', name: 'Piraeus grid — eastern', points: [[840,160],[940,160],[1040,160]], width: 16, source: 'piraeus' },
  { id: 'piraeus-grid-south', name: 'Piraeus grid — southern', points: [[840,260],[940,260],[1040,260]], width: 16, source: 'piraeus' },
];

/* ── Evidence levels ──────────────────────────────────────── */

const E_ARCH = { level: 'archaeological', note: 'Foundation or remains survive; visible plan is standing or reconstructed footprint.' };
const E_DOC = { level: 'documented', note: 'Literary or inscriptional mention plus accepted placement.' };
const E_PLAUS = { level: 'plausible', note: 'Scholarly consensus placement; no standing in-period remains.' };

/* ── Buildings / Monuments ────────────────────────────────── */

export const BUILDINGS = [
  // ──── AKROPOLIS ────
  { id: 'parthenon', name: 'Parthenon', type: 'temple',
    x: -50, z: -330, w: 46, d: 22, h: 16, state: 'new', region: 'acropolis', source: 'parthenon', evidence: E_ARCH,
    detail: 'Octastyle peripteral Doric temple, ~69.5 × 30.9 m, Pentelic marble; built 447–432 BCE under Iktinos and Kallikrates.' },
  { id: 'propylaea', name: 'Propylaea', type: 'gateway',
    x: -115, z: -300, w: 30, d: 16, h: 12, state: 'new', region: 'acropolis', source: 'propylaea', evidence: E_ARCH,
    detail: 'Monumental Doric gateway by Mnesicles, begun ca. 437 BCE, completed 432 BCE.' },
  { id: 'propylaea-east', name: 'East wing of the Propylaea', type: 'gateway',
    x: -145, z: -300, w: 12, d: 8, h: 8, state: 'new', region: 'acropolis', source: 'propylaea', evidence: E_DOC,
    detail: 'Eastern flank of the Propylaea complex.' },
  { id: 'athena-nike-early', name: 'Athena Nike bastion & earlier shrine', type: 'sanctuary',
    x: -160, z: -310, w: 8, d: 5, h: 2.6, state: 'standing', region: 'acropolis', source: 'athena-nike', evidence: E_ARCH,
    detail: 'A low sanctuary marker represents the older Athena Nike cult buildings on the bastion.' },
  { id: 'old-athena-polias', name: 'Old Temple of Athena Polias', type: 'temple',
    x: -30, z: -300, w: 22, d: 11, h: 5, state: 'standing', region: 'acropolis', source: 'acropolis', evidence: E_DOC,
    detail: 'Sixth-century Old Temple damaged in 480 BCE, repaired; stands before the later Erechtheion.' },
  { id: 'old-hekatompedon', name: 'Old Hekatompedon footprint', type: 'temple',
    x: -50, z: -330, w: 46, d: 21, h: 0, state: 'inferred', region: 'acropolis', source: 'acropolis', evidence: E_DOC,
    detail: 'Foundation line of the earlier poros temple destroyed by Xerxes in 480 BCE.' },
  { id: 'brauronion', name: 'Sanctuary of Artemis Brauronia', type: 'sanctuary',
    x: 40, z: -330, w: 16, d: 12, h: 4, state: 'standing', region: 'acropolis', source: 'acropolis', evidence: E_ARCH,
    detail: 'Doric stoa-like sanctuary on the Acropolis.' },
  { id: 'chalkotheke', name: 'Chalkotheke', type: 'building',
    x: 60, z: -340, w: 30, d: 11, h: 7, state: 'standing', region: 'acropolis', source: 'acropolis', evidence: E_DOC,
    detail: 'State treasury for votive offerings.' },
  { id: 'zeus-poleus', name: 'Sanctuary of Zeus Polieus', type: 'sanctuary',
    x: -30, z: -360, w: 12, d: 12, h: 3, state: 'standing', region: 'acropolis', source: 'acropolis', evidence: E_DOC,
    detail: 'Open-air precinct with the altar of Zeus Polieus.' },
  { id: 'athena-promachos', name: 'Athena Promachos', type: 'statue',
    x: -30, z: -310, w: 2, d: 2, h: 9, state: 'new', region: 'acropolis', source: 'parthenon', evidence: E_DOC,
    detail: 'Tall bronze Athena by Phidias; the helmet and spear were visible from the sea at Sunium.' },

  // ──── SOUTH SLOPE ────
  { id: 'theatre-dionysus', name: 'Theatre of Dionysus', type: 'theatre',
    x: -110, z: -180, w: 80, d: 60, h: 4, state: 'working', region: 'south-slope', source: 'theatre-dionysus', evidence: E_ARCH,
    detail: 'Around 432–430 BCE the Classical theatre relied on timber ikria/bleachers with the stage developing.' },
  { id: 'orchestra-dionysus', name: 'Orchestra of the Theatre', type: 'road',
    x: -110, z: -200, w: 28, d: 18, h: 0, state: 'working', region: 'south-slope', source: 'theatre-dionysus', evidence: E_DOC,
    detail: 'Circular orchestra terrace; the thymele altar stood at its centre.' },
  { id: 'sanctuary-dionysus', name: 'Sanctuary of Dionysus Eleuthereus', type: 'sanctuary',
    x: -130, z: -220, w: 40, d: 18, h: 4, state: 'standing', region: 'south-slope', source: 'theatre-dionysus', evidence: E_ARCH,
    detail: 'Older sanctuary beneath the Acropolis rock: temple of Dionysus.' },
  { id: 'odeion-pericles', name: 'Odeion of Pericles', type: 'building',
    x: -180, z: -150, w: 30, d: 28, h: 12, state: 'new', region: 'south-slope', source: 'odeion-pericles', evidence: E_DOC,
    detail: 'Square hall roofed in ship-timber masts; used for musical contests and rehearsals.' },

  // ──── AGORA ────
  { id: 'hephaisteion', name: 'Hephaisteion', type: 'temple',
    x: 60, z: 140, w: 32, d: 14, h: 8, state: 'working', region: 'agora', source: 'hephaisteion', evidence: E_ARCH,
    detail: 'Doric peripteral temple on Agoraios Kolonos hill; construction 460–420 BCE.' },
  { id: 'stoa-poikile', name: 'Stoa Poikile', type: 'stoa',
    x: 50, z: 40, w: 40, d: 12, h: 5, state: 'standing', region: 'agora', source: 'stoa-poikile', evidence: E_ARCH,
    detail: 'Painted Stoa, ca. 460s BCE; paintings of Marathon, Theseus, Amazonomachy.' },
  { id: 'stoa-zeus', name: 'Stoa of Zeus Eleutherios', type: 'stoa',
    x: 110, z: 80, w: 40, d: 11, h: 5, state: 'working', region: 'agora', source: 'stoa-zeus', evidence: E_DOC,
    detail: 'Stoa on the west side with a shrine of Zeus Eleutherios; built 430s–420s BCE.' },
  { id: 'royal-stoa', name: 'Royal Stoa', type: 'stoa',
    x: 140, z: 80, w: 36, d: 11, h: 5, state: 'working', region: 'agora', source: 'royal-stoa', evidence: E_ARCH,
    detail: 'Stoa Basileios; seat of the archon basileus and lawcourts.' },
  { id: 'stoa-hermes', name: 'Stoa of Hermes', type: 'stoa',
    x: 170, z: -30, w: 16, d: 8, h: 4, state: 'standing', region: 'agora', source: 'stoa-hermes', evidence: E_DOC,
    detail: 'Small stoa near the Agora entrance; the Herms stood here.' },
  { id: 'bouleuterion', name: 'Bouleuterion', type: 'building',
    x: 200, z: 20, w: 18, d: 12, h: 4, state: 'standing', region: 'agora', source: 'bouleuterion', evidence: E_ARCH,
    detail: 'Council House of the 500.' },
  { id: 'tholos', name: 'Tholos', type: 'round',
    x: 230, z: 40, w: 14, d: 14, h: 3, state: 'standing', region: 'agora', source: 'tholos', evidence: E_ARCH,
    detail: 'Round building housing the prytaneis (executive committee).' },
  { id: 'metroon', name: 'Metroon', type: 'building',
    x: 220, z: 80, w: 26, d: 11, h: 5, state: 'standing', region: 'agora', source: 'acropolis', evidence: E_DOC,
    detail: 'Repository of public archives; sanctuary of the Mother of the Gods.' },
  { id: 'eleusinion', name: 'Eleusinion', type: 'sanctuary',
    x: 180, z: 150, w: 30, d: 18, h: 4, state: 'standing', region: 'agora', source: 'eleusis', evidence: E_DOC,
    detail: 'City sanctuary of Demeter and Kore; the procession turned east here.' },
  { id: 'fountain-enneakrounos', name: 'Enneakrounos fountainhouse', type: 'building',
    x: 300, z: 170, w: 16, d: 12, h: 3, state: 'standing', region: 'agora', source: 'agora', evidence: E_DOC,
    detail: '5th-century public fountain fed by the Kallirrhoe spring.' },

  // ──── PNYX & AREOPAGUS ────
  { id: 'pnyx-bema', name: 'Pnyx assembly rock', type: 'rock',
    x: -300, z: -130, w: 30, d: 30, h: 8, state: 'standing', region: 'pnyx', source: 'pnyx', evidence: E_ARCH,
    detail: 'The bema (speakers\' platform) hewn from bedrock; seat of the ekklesia.' },
  { id: 'pnyx-cavea', name: 'Pnyx assembly seating', type: 'rock',
    x: -280, z: -160, w: 60, d: 40, h: 4, state: 'standing', region: 'pnyx', source: 'pnyx', evidence: E_DOC,
    detail: 'Tiered seating carved from hillside; capacity for several thousand.' },
  { id: 'areopagus-rock', name: 'Areopagus rock', type: 'rock',
    x: -220, z: -180, w: 40, d: 30, h: 6, state: 'standing', region: 'pnyx', source: 'areopagus', evidence: E_DOC,
    detail: 'Homicide court of the Areopagus Council.' },

  // ──── OLYMPIEION ────
  { id: 'olympieion-archaios', name: 'Archaios naos of the Olympieion', type: 'temple',
    x: -340, z: 80, w: 8, d: 4, h: 4, state: 'standing', region: 'olympieion', source: 'olympieion', evidence: E_ARCH,
    detail: 'Archaic predecessor rebuilt by Peisistratos.' },
  { id: 'olympieion-altar', name: 'Altar of the Olympieion', type: 'altar',
    x: -330, z: 90, w: 6, d: 4, h: 1, state: 'standing', region: 'olympieion', source: 'olympieion', evidence: E_DOC,
    detail: 'Open-air altar of Zeus Olympios.' },
  { id: 'ilissos-bridge', name: 'Ilissos bridge crossing', type: 'bridge',
    x: -260, z: 140, w: 10, d: 4, h: 2, state: 'standing', region: 'olympieion', source: 'acropolis', evidence: E_DOC,
    detail: 'Stone crossing of the Ilissos stream.' },

  // ──── KERAMEIKOS ────
  { id: 'sacred-gate', name: 'Sacred Gate', type: 'gate',
    x: 380, z: 240, w: 12, d: 10, h: 10, state: 'standing', region: 'kerameikos', source: 'kerameikos', evidence: E_ARCH,
    detail: 'Gate south of the Dipylon for the Sacred Way to Eleusis.' },
  { id: 'dipylon-gate', name: 'Dipylon Gate', type: 'gate',
    x: 360, z: 260, w: 22, d: 16, h: 12, state: 'standing', region: 'kerameikos', source: 'kerameikos', evidence: E_ARCH,
    detail: 'Double-arched main western gate; Panathenaic procession entered here.' },
  { id: 'kerameikos-cemetery', name: 'Kerameikos cemetery', type: 'cemetery',
    x: 430, z: 210, w: 80, d: 160, h: 0, state: 'burial', region: 'kerameikos', source: 'kerameikos', evidence: E_DOC,
    detail: 'Public cemetery outside the Sacred and Dipylon Gates.' },
  { id: 'academy-grove', name: 'Academy grove', type: 'grove',
    x: 500, z: 600, w: 120, d: 80, h: 2, state: 'standing', region: 'northgate', source: 'academy', evidence: E_DOC,
    detail: 'Olive grove of the hero Akademos; gymnasium and palaestra.' },
  { id: 'hero-academus', name: 'Heroon of Akademos', type: 'hero',
    x: 510, z: 580, w: 6, d: 6, h: 2, state: 'standing', region: 'northgate', source: 'academy', evidence: E_DOC,
    detail: 'Small heroon near the entry of the Academy.' },

  // ──── LONG WALLS ────
  { id: 'long-wall-north', name: 'Northern Long Wall', type: 'wall',
    x: 520, z: 80, w: 360, d: 18, h: 12, state: 'standing', region: 'long-walls', source: 'long-walls', evidence: E_DOC,
    detail: 'Themistoclean Athens–Piraeus wall (north) built 478 BCE.' },
  { id: 'long-wall-south', name: 'Southern / Middle Long Wall', type: 'wall',
    x: 510, z: -30, w: 360, d: 18, h: 12, state: 'standing', region: 'long-walls', source: 'long-walls', evidence: E_DOC,
    detail: 'Third / middle wall, built ca. 443 BCE.' },

  // ──── PIRAEUS ────
  { id: 'piraeus-agora', name: 'Agora of Hippalos', type: 'forum',
    x: 920, z: 210, w: 80, d: 80, h: 0, state: 'standing', region: 'piraeus', source: 'piraeus', evidence: E_DOC,
    detail: 'Hippodamian grid market square in the centre of Piraeus.' },
  { id: 'piraeus-shipsheds-zea', name: 'Shipsheds of Zea', type: 'neoria',
    x: 1020, z: 160, w: 80, d: 30, h: 4, state: 'standing', region: 'piraeus', source: 'piraeus', evidence: E_DOC,
    detail: 'Slipway shipsheds of the Zea harbour.' },
  { id: 'piraeus-shipsheds-munichia', name: 'Shipsheds of Munichia', type: 'neoria',
    x: 1010, z: 300, w: 80, d: 30, h: 4, state: 'standing', region: 'piraeus', source: 'piraeus', evidence: E_DOC,
    detail: 'Munichia harbour shipsheds.' },
  { id: 'piraeus-emporion', name: 'Emporion', type: 'forum',
    x: 880, z: 260, w: 40, d: 30, h: 3, state: 'standing', region: 'piraeus', source: 'piraeus', evidence: E_DOC,
    detail: 'Trade quarter near the Piraeus harbour.' },
  { id: 'piraeus-canonic-gate', name: 'Canonic Gate', type: 'gate',
    x: 820, z: 210, w: 16, d: 10, h: 10, state: 'standing', region: 'piraeus', source: 'long-walls', evidence: E_DOC,
    detail: 'Gate on the south side where the Long Walls corridor terminated.' },
  { id: 'phaleron-anchor', name: 'Phaleron (older harbour)', type: 'harbour',
    x: 560, z: 420, w: 160, d: 80, h: 1, state: 'working', region: 'long-walls', source: 'piraeus', evidence: E_DOC,
    detail: 'The earlier open bay, eclipsed by Piraeus but still used for beach-landing.' },
];

/* ── Water bodies ─────────────────────────────────────────── */

export const WATERS = [
  { id: 'eridanos', name: 'Eridanos Stream', type: 'river',
    points: [{ x: 180, z: 200 }, { x: 280, z: 220 }, { x: 380, z: 230 }, { x: 450, z: 220 }],
    width: 8, color: 0x4a7a6a },
  { id: 'ilissos', name: 'Ilissos River', type: 'river',
    points: [{ x: -380, z: 140 }, { x: -300, z: 160 }, { x: -200, z: 180 }, { x: -100, z: 200 }],
    width: 12, color: 0x3a6a7a },
  { id: 'kallirrhoe', name: 'Kallirrhoe Spring', type: 'spring',
    x: -260, z: 160, radius: 6 },
];

/* ── Spawn & Bounds ───────────────────────────────────────── */

export const SPAWN = { x: 340, z: 280, angle: Math.PI * 0.75 };

export const BOUNDS = { minX: -450, maxX: 1100, minZ: -450, maxZ: 700 };

/* ── Teleport destinations ────────────────────────────────── */

export const TELEPORTS = [
  ['parthenon', 'Parthenon'],
  ['propylaea', 'Propylaea'],
  ['old-athena-polias', 'Old Temple of Athena Polias'],
  ['athena-nike-early', 'Athena Nike bastion'],
  ['theatre-dionysus', 'Theatre of Dionysus'],
  ['odeion-pericles', 'Odeion of Pericles'],
  ['stoa-poikile', 'Stoa Poikile'],
  ['stoa-zeus', 'Stoa of Zeus Eleutherios'],
  ['hephaisteion', 'Hephaisteion'],
  ['tholos', 'Tholos'],
  ['bouleuterion', 'Bouleuterion'],
  ['pnyx-bema', 'Pnyx assembly rock'],
  ['areopagus-rock', 'Areopagus rock'],
  ['olympieion-archaios', 'Archaios naos of the Olympieion'],
  ['kerameikos-cemetery', 'Kerameikos cemetery'],
  ['dipylon-gate', 'Dipylon Gate'],
  ['sacred-gate', 'Sacred Gate'],
  ['academy-grove', 'Academy grove'],
  ['piraeus-agora', 'Agora of Hippalos'],
  ['piraeus-shipsheds-zea', 'Shipsheds of Zea'],
  ['long-wall-north', 'Long Walls corridor'],
].map(([id, name]) => ({ id, name }));

/* ── Guided tour stops ────────────────────────────────────── */

export const TOUR_STOPS = [
  { id: 'dipylon-gate', title: 'Dipylon Gate', description: 'Enter Athens through the main western gate, where the Panathenaic procession began its journey to the Acropolis.', duration: 30 },
  { id: 'stoa-poikile', title: 'Stoa Poikile', description: 'The Painted Stoa with its famous battle paintings — Marathon, the Amazonomachy, the Fall of Troy.', duration: 35 },
  { id: 'hephaisteion', title: 'Hephaisteion', description: 'The best-preserved Greek Doric temple, overlooking the Agora from Agoraios Kolonos hill.', duration: 35 },
  { id: 'tholos', title: 'Tholos', description: 'The circular headquarters where the prytaneis dined and kept the official weights and measures.', duration: 25 },
  { id: 'bouleuterion', title: 'Bouleuterion', description: 'The Council House of the Five Hundred — the heart of Athenian democratic deliberation.', duration: 25 },
  { id: 'propylaea', title: 'Propylaea', description: 'Ascend through the monumental gateway to the sacred precinct of the Acropolis.', duration: 30 },
  { id: 'parthenon', title: 'Parthenon', description: 'The crown jewel — completed just two years ago. Phidias\' chryselephantine Athena Parthenos stands inside.', duration: 45 },
  { id: 'athena-promachos', title: 'Athena Promachos', description: 'The colossal bronze Athena by Phidias, her spear tip glinting in the Attic sun, visible from the sea.', duration: 25 },
  { id: 'theatre-dionysus', title: 'Theatre of Dionysus', description: 'Where the tragedies of Aeschylus, Sophocles and Euripides were first performed at the City Dionysia.', duration: 35 },
  { id: 'pnyx-bema', title: 'Pnyx', description: 'The assembly hill where Pericles himself addressed the citizens. Democracy was enacted here.', duration: 40 },
];

/* ── District styles for procedural infill ────────────────── */

export const DISTRICT_STYLES = {
  acropolis: { density: 0.16, heightRange: [4, 8], shopRatio: 0.05, materials: ['marble', 'limestone'] },
  'south-slope': { density: 0.58, heightRange: [4, 8], shopRatio: 0.34, materials: ['plaster', 'plasterAged'] },
  agora: { density: 0.72, heightRange: [4, 8], shopRatio: 0.68, materials: ['plaster', 'limestone'] },
  'lower-city': { density: 0.90, heightRange: [5, 10], shopRatio: 0.52, materials: ['plaster', 'plasterAged'] },
  kerameikos: { density: 0.82, heightRange: [5, 10], shopRatio: 0.64, materials: ['plasterAged', 'terracotta'] },
  northgate: { density: 0.66, heightRange: [4, 8], shopRatio: 0.40, materials: ['plaster'] },
  pnyx: { density: 0.32, heightRange: [3, 6], shopRatio: 0.10, materials: ['poros', 'limestone'] },
  olympieion: { density: 0.34, heightRange: [4, 7], shopRatio: 0.20, materials: ['limestone', 'plaster'] },
  'long-walls': { density: 0.18, heightRange: [3, 6], shopRatio: 0.15, materials: ['plaster'] },
  piraeus: { density: 0.92, heightRange: [6, 13], shopRatio: 0.68, materials: ['plaster', 'limestone'] },
};
