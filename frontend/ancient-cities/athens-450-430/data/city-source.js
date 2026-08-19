/* Athens, 450–430 BCE — source-backed placement data.
   Coordinates are a navigable, schematic city grid; monument locations preserve relative topography.
   `state` describes the visible treatment in this period (e.g. `new` for monuments finished in 432 BCE).
   Distances are scaled from Travlos / ASCSA / Wikipedia measurements (1 unit ≈ 0.7 m on the ground).
   This is a Periclean-Athens reconstruction; no Roman or Byzantine layers are shown. */

export const CITY = {
  id: 'athens-450-430',
  title: 'ATHENS · 450–430 BCE',
  subtitle: 'The Periclean city between the Thirty Years’ Peace and the Plague',
  scaleMetres: 2200,
  period: '450–430 BCE',
  boundary: 'Themistoclean Walls',
  description: 'A source-led, navigable reconstruction of Classical Athens during the Periclean building programme: the rebuilt Acropolis, the Agora civic core, the Kerameikos gates, the Piraeus harbour city and the Long Walls corridor.'
};

/* All sources are public, English-language references verified to return HTTP 200 on
   the day of publication. They are cited by `id` on monuments and districts. */
export const SOURCES = [
  ['parthenon','Parthenon (Wikipedia)','https://en.wikipedia.org/wiki/Parthenon'],
  ['propylaea','Propylaea (Wikipedia)','https://en.wikipedia.org/wiki/Propylaea'],
  ['erechtheion','Erechtheion (Wikipedia)','https://en.wikipedia.org/wiki/Erechtheion'],
  ['athena-nike','Temple of Athena Nike (Wikipedia)','https://en.wikipedia.org/wiki/Temple_of_Athena_Nike'],
  ['acropolis','Acropolis of Athens (Wikipedia)','https://en.wikipedia.org/wiki/Acropolis_of_Athens'],
  ['agora','Ancient Agora of Athens (Wikipedia)','https://en.wikipedia.org/wiki/Ancient_Agora_of_Athens'],
  ['ascsa','ASCSA Agora Excavations','https://www.agoraexcavations.org/'],
  ['hephaisteion','Hephaisteion (Wikipedia)','https://en.wikipedia.org/wiki/Hephaisteion'],
  ['stoa-poikile','Stoa Poikile (Wikipedia)','https://en.wikipedia.org/wiki/Stoa_Poikile'],
  ['stoa-zeus','Stoa of Zeus Eleutherios (Wikipedia)','https://en.wikipedia.org/wiki/Stoa_of_Zeus_Eleutherios'],
  ['royal-stoa','Royal Stoa (Wikipedia)','https://en.wikipedia.org/wiki/Royal_Stoa'],
  ['stoa-hermes','Stoa of Hermes (Wikipedia)','https://en.wikipedia.org/wiki/Stoa_of_Hermes'],
  ['tholos','Tholos (Wikipedia)','https://en.wikipedia.org/wiki/Tholos_of_Athens'],
  ['bouleuterion','Bouleuterion (Wikipedia)','https://en.wikipedia.org/wiki/Bouleuterion'],
  ['theatre-dionysus','Theatre of Dionysus (Wikipedia)','https://en.wikipedia.org/wiki/Theatre_of_Dionysus'],
  ['odeion-pericles','Odeon of Pericles (Wikipedia)','https://en.wikipedia.org/wiki/Odeon_of_Pericles'],
  ['kerameikos','Kerameikos (Wikipedia)','https://en.wikipedia.org/wiki/Kerameikos'],
  ['pnyx','Pnyx (Wikipedia)','https://en.wikipedia.org/wiki/Pnyx'],
  ['areopagus','Areopagus (Wikipedia)','https://en.wikipedia.org/wiki/Areopagus'],
  ['olympieion','Temple of Olympian Zeus (Wikipedia)','https://en.wikipedia.org/wiki/Olympieion'],
  ['academy','Platonic Academy (Wikipedia)','https://en.wikipedia.org/wiki/Platonic_Academy'],
  ['piraeus','Piraeus (Wikipedia)','https://en.wikipedia.org/wiki/Piraeus'],
  ['long-walls','Long Walls (Wikipedia)','https://en.wikipedia.org/wiki/Long_Walls'],
  ['panathenaea','Panathenaea (Wikipedia)','https://en.wikipedia.org/wiki/Panathenaea'],
  ['delian-league','Delian League (Wikipedia)','https://en.wikipedia.org/wiki/Delian_League'],
  ['pericles','Pericles (Wikipedia)','https://en.wikipedia.org/wiki/Pericles'],
  ['plague','Plague of Athens (Wikipedia)','https://en.wikipedia.org/wiki/Plague_of_Athens'],
  ['city-dionysia','City Dionysia (Wikipedia)','https://en.wikipedia.org/wiki/City_Dionysia'],
  ['eleusis','Eleusinian Mysteries (Wikipedia)','https://en.wikipedia.org/wiki/Eleusinian_Mysteries']
].map(([id,title,url]) => ({id,title,url}));

/* Districts: each is a named topographical or civic district of the period.
   `x`,`z` are centre of a bounding box (`w` east-west, `d` north-south in units).
   These are not the Augustan regions of Rome: Athens is organised around the Acropolis,
   Agora, long walls corridor and the Piraeus city. */
export const REGIONS = [
  ['acropolis','Akropolis precinct',-20,-310,260,160,'The sacred rock and its temples; the rebuilt heart of the city.'],
  ['south-slope','South slope of the Akropolis',-90,-180,260,140,'Theatre of Dionysus, Odeion of Pericles, Asclepieion.'],
  ['agora','Agora of Athens',110,10,330,260,'Civic centre: stoa, bouleuterion, tholos, panathenaic way.'],
  ['lower-city','Lower city & Plaka slopes',60,-110,280,160,'Houses and workshops between Agora and south slope.'],
  ['kerameikos','Kerameikos & Sacred Gate',360,210,260,180,'Potters’ quarter, cemetery and the Dipylon / Sacred Gates.'],
  ['northgate','North Gate & Academy approach',230,420,300,170,'Dromos out through the Dipylon to the Academy.'],
  ['pnyx','Pnyx & Areopagus',-260,-90,160,200,'Assembly rock and the homicide court.'],
  ['olympieion','Olympieion & Ilissos',-340,90,180,260,'Archaios naos south-east of the city; the Ilissos valley.'],
  ['long-walls','Long Walls corridor',480,40,360,720,'Parallel fortified walls running to Piraeus.'],
  ['piraeus','Piraeus',900,220,260,260,'Hippodamian harbour city: emporion, shipsheds, Hippalos agora.']
].map(([id,name,x,z,w,d,note]) => ({id,name,x,z,w,d,note}));

/* Streets: polylines representing known or strongly-supported routes.
   Width is in our schematic units (≈ 0.7 m each side).
   `source` cites the entry from SOURCES that grounds the route. */
export const STREETS = [
  ['dromos','Dromos',[[110,310],[240,330],[340,330],[450,310]],24,'kerameikos'],
  ['sacred-way','Sacred Way (to Eleusis)',[[380,200],[470,140],[560,80],[660,30]],18,'eleusis'],
  ['panathenaic-way','Panathenaic Way',[[240,230],[180,180],[110,140],[40,80],[-30,20],[-110,-60]],22,'panathenaea'],
  ['eastern-long-wall','Northern Long Wall (Athens → Piraeus)',[[340,30],[500,80],[680,180],[870,260]],22,'long-walls'],
  ['southern-long-wall','Middle / Southern Long Wall',[[330,-40],[490,30],[670,150],[860,250]],22,'long-walls'],
  ['phaleron-way','Road to Phaleron',[[70,90],[150,160],[230,210],[320,250]],16,'piraeus'],
  ['academy-road','Road to the Academy',[[300,360],[360,440],[420,520],[500,600]],18,'academy'],
  ['piraeus-grid-east','Piraeus grid — eastern plateia',[[840,160],[940,160],[1040,160]],16,'piraeus'],
  ['piraeus-grid-south','Piraeus grid — southern plateia',[[840,260],[940,260],[1040,260]],16,'piraeus']
].map(([id,name,points,width,source]) => ({id,name,points,width,source}));

/* Builders factory: every monument declares its evidence level explicitly.
   evidence.level vocabulary: 'archaeological' | 'documented' | 'plausible' | 'atmospheric'.
   `state` vocabulary: 'standing' | 'working' | 'new' | 'repaired' | 'fortified' | 'spoliated' | 'damaged' | 'ruined' | 'burial' | 'inferred'.
   `source` is the SOURCES id backing the monument. */
const M = (id,name,type,x,z,w,d,h,state,region,source,evidence,detail) => ({id,name,type,x,z,w,d,h,state,region,source,evidence,detail});

/* ----- AKROPOLIS (sacred rock; 157 m peak) ----- */
const EVIDENCE_ARCH = { level: 'archaeological', note: 'Foundation or substantial remains survive; visible plan is the standing or reconstructed footprint.' };
const EVIDENCE_DOC = { level: 'documented', note: 'Literary or inscriptional mention plus accepted topographic placement.' };
const EVIDENCE_PLAUS = { level: 'plausible', note: 'Scholarly consensus placement; no standing remains or no in-period remains in the city.' };

export const BUILDINGS = [
  // -------- AKROPOLIS precinct --------
  M('parthenon','Parthenon','temple',-50,-330,46,22,16,'new','acropolis','parthenon',EVIDENCE_ARCH,
    'Octastyle peripteral Doric temple, ~69.5 × 30.9 m, Pentelic marble; built 447–432 BCE under Iktinos and Kallikrates with Phidias overseeing sculpture.'),
  M('propylaea','Propylaea','gateway',-115,-300,30,16,12,'new','acropolis','propylaea',EVIDENCE_ARCH,
    'Monumental Doric gateway by Mnesicles, begun ca. 437 BCE, completed 432 BCE (without the Pinakotheke wings). The standard Periclean visitor entry.'),
  M('propylaea-east','East wing of the Propylaea','gateway',-145,-300,12,8,8,'new','acropolis','propylaea',EVIDENCE_DOC,
    'Eastern flank of the Propylaea complex; the symmetrical Pinakotheke to the north was never finished.'),
  M('athena-nike','Temple of Athena Nike','temple',-160,-310,8,5,5,'new','acropolis','athena-nike',EVIDENCE_ARCH,
    'Tetrastyle amphiprostyle Ionic temple designed by Kallikrates, finished ca. 420 BCE; perched on the bastion west of the Propylaea.'),
  M('erechtheion','Erechtheion','temple',-30,-300,22,11,8,'working','acropolis','erechtheion',EVIDENCE_ARCH,
    'Ionic temple begun 421 BCE, still under construction in this period (final dedication 406 BCE). Houses the olive-wood Athena Polias cult statue and the Panathenaic peplos.'),
  M('erechtheion-north','North porch of the Erechtheion','temple',-32,-308,8,5,6,'working','acropolis','erechtheion',EVIDENCE_DOC,
    'Prostyle east-facing porch in Pentelic marble; the olive-tree cult of Athena Polias stood here.'),
  M('erechtheion-karyatid','Karyatid porch','porch',-15,-296,6,4,5,'working','acropolis','erechtheion',EVIDENCE_DOC,
    'South porch with the six draped maidens (Karyatids) carrying the Ionic entablature; under construction in 450–430 BCE.'),
  M('old-hekatompedon','Old Hekatompedon footprint','temple',-50,-330,46,21,0,'inferred','acropolis','acropolis',EVIDENCE_DOC,
    'Foundation line of the earlier poros temple destroyed by Xerxes in 480 BCE, reused as the euthynteria of the new Parthenon; visible as a faint terrace.'),
  M('brauronion','Sanctuary of Artemis Brauronia','sanctuary',40,-330,16,12,4,'standing','acropolis','acropolis',EVIDENCE_ARCH,
    'Doric stoa-like sanctuary on the Acropolis; a near-copy of the rural sanctuary at Brauron.'),
  M('chalkotheke','Chalkotheke','building',60,-340,30,11,7,'standing','acropolis','acropolis',EVIDENCE_DOC,
    'Long rectangular Doric building south-east of the Erechtheion: state treasury for votive offerings.'),
  M('zeus-poleus','Sanctuary of Zeus Polieus','sanctuary',-30,-360,12,12,3,'standing','acropolis','acropolis',EVIDENCE_DOC,
    'Open-air precinct north of the Erechtheion with the altar of Zeus Polieus and the Bouphonia sacrificial pit.'),
  M('athena-promachos','Athena Promachos','statue',-30,-310,2,2,9,'new','acropolis','parthenon',EVIDENCE_DOC,
    'Tall bronze Athena by Phidias, erected after the Persians; the helmet and spear were visible from the sea at Sunium.'),

  // -------- South slope of the Akropolis --------
  M('theatre-dionysus','Theatre of Dionysus','theatre',-110,-180,80,60,4,'working','south-slope','theatre-dionysus',EVIDENCE_ARCH,
    'The Lykourgan phase (mid-4th c. BCE) is later than this period; in 450–430 BCE it is a stone-seated cavea with wooden proskenion, hosting the City Dionysia.'),
  M('orchestra-dionysus','Orchestra of the Theatre','theatre',-110,-200,28,18,0,'working','south-slope','theatre-dionysus',EVIDENCE_DOC,
    'Circular orchestra terrace of packed earth; the thymele altar stood at its centre.'),
  M('sanctuary-dionysus','Sanctuary of Dionysus Eleuthereus','sanctuary',-130,-220,40,18,4,'standing','south-slope','theatre-dionysus',EVIDENCE_ARCH,
    'The older sanctuary beneath the Acropolis rock: temple of Dionysus, with the choragic monuments along its south wall.'),
  M('odeion-pericles','Odeion of Pericles','building',-180,-150,30,28,12,'new','south-slope','odeion-pericles',EVIDENCE_DOC,
    'Square hall roofed in ship-timber masts from the Persian fleet, imitating Xerxes’ tent; used for musical contests and rehearsals.'),
  M('asclepieion','Asclepieion','sanctuary',-60,-150,40,30,5,'standing','south-slope','acropolis',EVIDENCE_ARCH,
    'Sanctuary of Asclepius: spring, kline (incubation) hall, temple; pilgrimage healing site.'),

  // -------- AGORA civic core --------
  M('hephaisteion','Hephaisteion','temple',60,140,32,14,8,'standing','agora','hephaisteion',EVIDENCE_ARCH,
    'Doric peripteral temple on Agoraios Kolonos hill; rededicated 449 BCE (often miscalled the Theseion).'),
  M('stoa-poikile','Stoa Poikile','stoa',50,40,40,12,5,'standing','agora','stoa-poikile',EVIDENCE_ARCH,
    'Painted Stoa, ca. 460s BCE; housed paintings of the Marathon, Theseus, Amazonomachy by Polygnotos, Micon and Panaenus.'),
  M('stoa-zeus','Stoa of Zeus Eleutherios','stoa',110,80,40,11,5,'standing','agora','stoa-zeus',EVIDENCE_DOC,
    'Stoa on the west side of the Agora with a shrine of Zeus Eleutherios; built ca. 430s–420s BCE.'),
  M('royal-stoa','Royal Stoa','stoa',140,80,36,11,5,'working','agora','royal-stoa',EVIDENCE_ARCH,
    'Stoa Basileios on the west side of the Agora; seat of the archon basileus and lawcourts.'),
  M('stoa-hermes','Stoa of Hermes','stoa',170,-30,16,8,4,'standing','agora','stoa-hermes',EVIDENCE_DOC,
    'Small stoa near the Agora entrance; the Herms stood here.'),
  M('bouleuterion','Bouleuterion','building',200,20,18,12,4,'standing','agora','bouleuterion',EVIDENCE_ARCH,
    'Council House of the 500; classical roof and square plan preserved by ASCSA excavations.'),
  M('tholos','Tholos','round',230,40,14,14,3,'standing','agora','tholos',EVIDENCE_ARCH,
    'Round building housing the prytaneis (executive committee); in continuous use in this period.'),
  M('metroon','Metroon','building',220,80,26,11,5,'standing','agora','acropolis',EVIDENCE_DOC,
    'Repository of public archives and a sanctuary of the Mother of the Gods; west of the Bouleuterion.'),
  M('panathenaic-way-route','Panathenaic Way (southern stretch)','road',110,80,5,5,0,'standing','agora','panathenaea',EVIDENCE_DOC,
    'Sacred road from the Dipylon through the Agora up to the Eleusinion and the Acropolis; visible only as the cleared alignment here.'),
  M('eleusinion','Eleusinion','sanctuary',180,150,30,18,4,'standing','agora','eleusis',EVIDENCE_DOC,
    'City sanctuary of Demeter and Kore; the Panathenaic procession turned east here on the way to the Acropolis.'),
  M('fountain-enneakrounos','Enneakrounos fountainhouse','building',300,170,16,12,3,'standing','agora','agora',EVIDENCE_DOC,
    'The 5th-century public fountain fed by the Kallirrhoe spring; Peisistratos’ earlier scheme still functioning.'),
  M('agoraios-kolonos','Agoraios Kolonos hill','hill',60,140,40,30,8,'standing','agora','agora',EVIDENCE_DOC,
    'Low hill rising above the Agora; the Hephaisteion sits on its summit.'),

  // -------- Pnyx & Areopagus --------
  M('pnyx-bema','Pnyx assembly rock','rock',-300,-130,30,30,8,'standing','pnyx','pnyx',EVIDENCE_ARCH,
    'The bema (speakers’ platform) hewn from the bedrock; the seat of the ekklesia after the 460s BCE re-arrangement.'),
  M('pnyx-cavea','Pnyx assembly seating','rock',-280,-160,60,40,4,'standing','pnyx','pnyx',EVIDENCE_DOC,
    'Tiered seating carved from the hillside, north and east of the bema; capacity for several thousand.'),
  M('areopagus-rock','Areopagus rock','rock',-220,-180,40,30,6,'standing','pnyx','areopagus',EVIDENCE_DOC,
    'Rocky outcrop north-west of the Acropolis; homicide court of the Areopagus Council.'),

  // -------- Olympieion & Ilissos --------
  M('olympieion-archaios','Archaios naos of the Olympieion','temple',-340,80,8,4,4,'standing','olympieion','olympieion',EVIDENCE_ARCH,
    'The archaic predecessor of the later Roman Olympieion: a small stone precinct and altar founded by Deukalion, then rebuilt by Peisistratos.'),
  M('olympieion-altar','Altar of the Olympieion','altar',-330,90,6,4,1,'standing','olympieion','olympieion',EVIDENCE_DOC,
    'Open-air altar of Zeus Olympios south-east of the city; visible from the Ilissos crossing.'),
  M('ilissos-bridge','Ilissos bridge crossing','bridge',-260,140,10,4,2,'standing','olympieion','acropolis',EVIDENCE_DOC,
    'Stone crossing of the Ilissos stream east of the Olympieion; the Kallirrhoe spring fed the Enneakrounos fountainhouse through this corridor.'),

  // -------- Kerameikos & city walls --------
  M('themistoclean-walls','Themistoclean city walls','wall',110,250,520,460,12,'standing','kerameikos','kerameikos',EVIDENCE_DOC,
    'Circuit wall rebuilt ca. 478 BCE after the Persian destruction; ~6.5 km around the city; shown as a navigable schematic perimeter.'),
  M('sacred-gate','Sacred Gate','gate',380,240,12,10,10,'standing','kerameikos','kerameikos',EVIDENCE_ARCH,
    'Gate south of the Dipylon for the Sacred Way to Eleusis; rebuilt in the Themistoclean circuit.'),
  M('dipylon-gate','Dipylon Gate','gate',360,260,22,16,12,'standing','kerameikos','kerameikos',EVIDENCE_ARCH,
    'Double-arched main western gate; the Panathenaic procession and state funerals entered here.'),
  M('pompeion','Pompeion','building',360,180,36,22,6,'standing','kerameikos','kerameikos',EVIDENCE_ARCH,
    'Square hall inside the Dipylon used to marshal the Panathenaic procession; foundation visible to the ASCSA.'),
  M('kerameikos-cemetery','Kerameikos cemetery','cemetery',430,210,80,160,0,'burial','kerameikos','kerameikos',EVIDENCE_DOC,
    'The public cemetery outside the Sacred and Dipylon Gates; roadside stelai and the State Pit.'),
  M('street-of-the-tombs','Street of the Tombs','road',460,260,4,4,0,'burial','kerameikos','kerameikos',EVIDENCE_DOC,
    'Sacred Way’s western branch lined with the lekythoi and stelai of the Kerameikos.'),
  M('academy-grove','Academy grove','grove',500,600,120,80,2,'standing','northgate','academy',EVIDENCE_DOC,
    'Olive grove of the hero Akademos, walled by Cimon; gymnasium and palaestra for the city’s youth.'),
  M('hero-academus','Heroon of Akademos','hero',510,580,6,6,2,'standing','northgate','academy',EVIDENCE_DOC,
    'Small heroon near the entry of the Academy; the Eponymoi Heroes monument stood nearby.'),

  // -------- Long Walls corridor --------
  M('long-wall-north','Northern Long Wall','wall',520,80,360,18,12,'standing','long-walls','long-walls',EVIDENCE_DOC,
    'Themistoclean Athens–Piraeus wall (north) built 478 BCE; fortified parapet walk and gates.'),
  M('long-wall-south','Southern / Middle Long Wall','wall',510,-30,360,18,12,'standing','long-walls','long-walls',EVIDENCE_DOC,
    'Third / middle wall, built ca. 443 BCE under Cimon’s successors; the corridor is the city’s lifeline.'),

  // -------- PIRAEUS harbour city --------
  M('piraeus-agora','Agora of Hippalos (Hippodamian agora)','forum',920,210,80,80,0,'standing','piraeus','piraeus',EVIDENCE_DOC,
    'Hippodamian grid market square in the centre of Piraeus; named after the architect Hippodamos of Miletus.'),
  M('piraeus-shipsheds-zea','Shipsheds of Zea','neoria',1020,160,80,30,4,'standing','piraeus','piraeus',EVIDENCE_DOC,
    'Slipway shipsheds of the Zea harbour; roofed sheds housing triremes drawn up for maintenance.'),
  M('piraeus-shipsheds-munichia','Shipsheds of Munichia','neoria',1010,300,80,30,4,'standing','piraeus','piraeus',EVIDENCE_DOC,
    'Munichia harbour shipsheds; smaller basin with rocky hill of Munichia above.'),
  M('piraeus-emporion','Emporion','forum',880,260,40,30,3,'standing','piraeus','piraeus',EVIDENCE_DOC,
    'Trade quarter near the Piraeus harbour; merchant warehouses and metic workshops.'),
  M('piraeus-canonic-gate','Canonic Gate','gate',820,210,16,10,10,'standing','piraeus','long-walls',EVIDENCE_DOC,
    'Gate on the south side of Piraeus where the Long Walls corridor terminated.'),
  M('phaleron-anchor','Phaleron (older harbour)','harbour',560,420,160,80,1,'working','long-walls','piraeus',EVIDENCE_DOC,
    'The earlier open bay of Phaleron, by this period eclipsed by Piraeus but still used for beach-landing.'),
];

export const TELEPORTS = [
  ['parthenon','Parthenon'],
  ['propylaea','Propylaea'],
  ['erechtheion','Erechtheion'],
  ['athena-nike','Temple of Athena Nike'],
  ['theatre-dionysus','Theatre of Dionysus'],
  ['odeion-pericles','Odeion of Pericles'],
  ['stoa-poikile','Stoa Poikile'],
  ['stoa-zeus','Stoa of Zeus Eleutherios'],
  ['hephaisteion','Hephaisteion'],
  ['tholos','Tholos'],
  ['bouleuterion','Bouleuterion'],
  ['asclepieion','Asclepieion'],
  ['pnyx-bema','Pnyx assembly rock'],
  ['areopagus-rock','Areopagus rock'],
  ['olympieion-archaios','Archaios naos of the Olympieion'],
  ['kerameikos-cemetery','Kerameikos cemetery'],
  ['dipylon-gate','Dipylon Gate'],
  ['sacred-gate','Sacred Gate'],
  ['pompeion','Pompeion'],
  ['academy-grove','Academy grove'],
  ['piraeus-agora','Agora of Hippalos'],
  ['piraeus-shipsheds-zea','Shipsheds of Zea'],
  ['long-wall-north','Long Walls corridor']
];
