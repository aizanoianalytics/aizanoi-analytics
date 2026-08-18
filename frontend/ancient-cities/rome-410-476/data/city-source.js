/* Rome, AD 410–476 — source-backed placement data.
   Coordinates are a navigable, schematic city grid; monument locations preserve relative topography.
   `state` describes the late-antique visual treatment, not a claim of precise elevation. */
export const CITY = {
  id: 'rome-410-476', title: 'ROME · AD 410–476', subtitle: 'A Late Antique city between sack, survival and transformation',
  scaleMetres: 2200, period: 'AD 410–476', boundary: 'Aurelian Walls',
  description: 'A source-led, navigable reconstruction of Rome after Alaric and before the end of the Western Empire.'
};

export const SOURCES = [
  ['forma','Stanford Digital Forma Urbis Romae Project','https://formaurbis.stanford.edu/'],
  ['notitia','Notitia / Curiosum Urbis Romae Regionum XIIII','https://penelope.uchicago.edu/Thayer/E/Gazetteer/Places/Europe/Italy/Lazio/Roma/Rome/_Texts/Notitia_Regionum/description.html'],
  ['claridge','Amanda Claridge, Rome: An Oxford Archaeological Guide (2010)','https://global.oup.com/academic/product/rome-9780199546831'],
  ['krautheimer','Richard Krautheimer, Rome: Profile of a City, 312–1308','https://press.princeton.edu/books/paperback/9780691002590/rome'],
  ['ward','Bryan Ward-Perkins, The Fall of Rome and the End of Civilization','https://global.oup.com/academic/product/the-fall-of-rome-and-the-end-of-civilization-9780192807281'],
  ['sack410','Sack of Rome (410)','https://en.wikipedia.org/wiki/Sack_of_Rome_(410)'],
  ['sack455','Sack of Rome (455)','https://en.wikipedia.org/wiki/Sack_of_Rome_(455)'],
  ['walls','Aurelian Walls','https://en.wikipedia.org/wiki/Aurelian_Walls'],
  ['forum','Roman Forum','https://en.wikipedia.org/wiki/Roman_Forum'],
  ['colosseum','Colosseum','https://en.wikipedia.org/wiki/Colosseum'],
  ['pantheon','Pantheon, Rome','https://en.wikipedia.org/wiki/Pantheon,_Rome'],
  ['caracalla','Baths of Caracalla','https://en.wikipedia.org/wiki/Baths_of_Caracalla'],
  ['diocletian','Baths of Diocletian','https://en.wikipedia.org/wiki/Baths_of_Diocletian'],
  ['peter','Old St. Peter’s Basilica','https://en.wikipedia.org/wiki/Old_St._Peter%27s_Basilica'],
  ['smm','Santa Maria Maggiore','https://en.wikipedia.org/wiki/Santa_Maria_Maggiore'],
  ['sabina','Santa Sabina','https://en.wikipedia.org/wiki/Santa_Sabina'],
  ['paul','San Paolo fuori le Mura','https://en.wikipedia.org/wiki/Basilica_of_Saint_Paul_Outside_the_Walls'],
  ['augustus','Mausoleum of Augustus','https://en.wikipedia.org/wiki/Mausoleum_of_Augustus'],
  ['hadrian','Mausoleum of Hadrian','https://en.wikipedia.org/wiki/Mausoleum_of_Hadrian'],
  ['spolia','Spolia','https://en.wikipedia.org/wiki/Spolia']
].map(([id,title,url]) => ({id,title,url}));

export const REGIONS = [
 ['I','Porta Capena',-90,-570,270,190,'South-east gateways, Appian approach and imperial-era fabric.'],
 ['II','Caelimontium',-80,-275,260,220,'Caelian hill, villas and new Christian basilicas.'],
 ['III','Isis et Serapis',45,-75,260,240,'Colosseum, ludus and Oppian hill.'],
 ['IV','Templum Pacis',-190,80,280,220,'Forum of Peace, Subura edge and Maxentian basilica.'],
 ['V','Esquiliae',135,210,300,250,'Esquiline residences, reservoirs and Santa Maria Maggiore.'],
 ['VI','Alta Semita',-120,310,310,250,'Quirinal, Diocletian’s baths and Sallust’s damaged gardens.'],
 ['VII','Via Lata',-365,260,240,370,'Via Lata corridor, porticoes and northern Campus Martius.'],
 ['VIII','Forum Romanum',-170,-85,250,190,'Forum, Capitol and imperial fora.'],
 ['IX','Circus Flaminius',-430,30,280,255,'Campus Martius theatres, porticoes and Tiber-facing trade.'],
 ['X','Palatium',-10,-235,230,175,'Palatine palace shell and sacred slopes.'],
 ['XI','Circus Maximus',-200,-305,315,135,'Circus valley, Velabrum and Forum Boarium.'],
 ['XII','Piscina Publica',70,-455,285,185,'Caracalla baths and southern residential zones.'],
 ['XIII','Aventinus',-300,-430,260,255,'Aventine, Emporium, horrea and Santa Sabina.'],
 ['XIV','Transtiberim',-655,5,270,510,'Trastevere and Vatican pilgrimage district.']
].map(([id,name,x,z,w,d,note])=>({id,name,x,z,w,d,note}));

export const STREETS = [
 ['via-sacra','Via Sacra',[[-290,-52],[-215,-38],[-142,-30],[-60,-35],[25,-60]],18,'forum'],
 ['via-lata','Via Lata',[[-350,525],[-345,370],[-335,210],[-320,60],[-310,-100]],20,'notitia'],
 ['via-appia','Via Appia',[[-110,-350],[-75,-470],[-55,-595]],18,'notitia'],
 ['via-ostiense','Via Ostiensis',[[-275,-260],[-360,-390],[-440,-550]],16,'paul'],
 ['via-salaria','Via Salaria',[[-125,350],[-95,510],[-70,625]],16,'sack410'],
 ['via-flaminia','Via Flaminia',[[-355,430],[-390,590],[-430,680]],18,'notitia'],
 ['via-tiburtina','Via Tiburtina',[[110,190],[235,315],[350,430]],16,'notitia'],
 ['via-praenestina','Via Praenestina',[[125,35],[310,80],[485,130]],15,'notitia'],
 ['via-latina','Via Latina',[[-45,-410],[80,-540],[180,-640]],14,'notitia'],
 ['via-aurelia','Via Aurelia',[[-610,170],[-760,250],[-890,330]],16,'notitia'],
 ['triumphalis','Via Triumphalis',[[-650,205],[-560,185],[-475,150]],15,'peter'],
 ['vatican-way','Via Cornelia',[[-720,60],[-625,95],[-520,115]],14,'peter']
].map(([id,name,points,width,source])=>({id,name,points,width,source}));

const M = (id,name,type,x,z,w,d,h,state,region,source,detail) => ({id,name,type,x,z,w,d,h,state,region,source,detail});
export const BUILDINGS = [
 M('aurelian-walls','Aurelian Walls','wall',-20,20,1510,1250,16,'fortified','all','walls','Honorius’s heightened 5th-century circuit, drawn as a navigable schematic perimeter.'),
 M('porta-salaria','Porta Salaria','gate',-92,640,38,18,22,'fortified','VI','walls','Northern gate through which Alaric entered in 410 according to tradition.'),
 M('porta-appia','Porta Appia','gate',-50,-625,42,20,23,'fortified','I','walls','The Appian gate remains one of the great southern approaches.'),
 M('porta-ostiense','Porta Ostiensis','gate',-450,-535,38,18,21,'fortified','XIII','walls','Gate to Ostia and the Pauline basilica.'),
 M('porta-mag','Porta Maggiore','gate',475,130,44,22,23,'fortified','V','walls','Aqueduct monument adapted to the Aurelian circuit.'),
 M('porta-flaminia','Porta Flaminia','gate',-435,685,38,18,22,'fortified','VII','walls','North road gate to Via Flaminia.'),
 M('porta-aurelia','Porta Aurelia','gate',-870,330,38,18,21,'fortified','XIV','walls','Western gate and Via Aurelia approach.'),
 M('forum','Roman Forum','forum',-185,-65,175,105,5,'spoliated','VIII','forum','The civic centre survives, but many courts and temples are silent, stripped or damaged.'),
 M('curia','Curia Julia','basilica',-235,-30,38,25,20,'standing','VIII','forum','Late antique senate house; robust brick shell.'),
 M('saturn','Temple of Saturn','temple',-272,-60,34,24,18,'spoliated','VIII','forum','The temple had a late fourth-century restoration before cult closure.'),
 M('castor','Temple of Castor and Pollux','temple',-132,-68,30,24,17,'spoliated','VIII','forum','Pagan cult closed; columnar temple remains in the Forum.'),
 M('vesta','Temple of Vesta','round',-100,-38,22,22,17,'damaged','VIII','forum','Sacred complex after the end of the Vestal institution.'),
 M('aemilia','Basilica Aemilia','basilica',-235,-95,82,34,17,'ruined','VIII','sack410','Burned in the 410 sack; shown as a broken arcade and rubble.'),
 M('julia','Basilica Julia','basilica',-145,-105,95,34,13,'damaged','VIII','sack410','Fire damage and repair marks, not a pristine Republican basilica.'),
 M('severus-arch','Arch of Septimius Severus','arch',-275,1,28,13,21,'standing','VIII','forum','Monumental arch beside the Forum’s northwest end.'),
 M('constantine-arch','Arch of Constantine','arch',20,-130,28,14,22,'standing','X','colosseum','Fourth-century arch constructed with reused material.'),
 M('titus-arch','Arch of Titus','arch',-25,-88,25,13,20,'standing','X','forum','Triumphal arch on the sacred way.'),
 M('maxentius','Basilica of Maxentius','basilica',-60,35,102,57,34,'damaged','IV','forum','Huge late Roman basilica: surviving vaults and broken side bays.'),
 M('trajan-forum','Forum of Trajan','forum',-265,95,108,115,7,'spoliated','VIII','forum','Column and market area retain their monumental silhouette.'),
 M('trajan-column','Trajan’s Column','column',-240,113,11,11,37,'standing','VIII','forum','Column remained a dominant skyline marker.'),
 M('trajan-market','Trajan’s Market','market',-305,138,76,58,22,'standing','VIII','forum','Brick hemicycles and chambers adapt to late uses.'),
 M('augustus-forum','Forum of Augustus','forum',-155,120,88,67,6,'spoliated','VIII','forum','Partly standing marble precinct and Mars Ultor remains.'),
 M('nerva-forum','Forum of Nerva','forum',-105,98,58,82,6,'spoliated','VIII','forum','Narrow transit forum and surviving colonnade.'),
 M('colosseum','Colosseum','amphitheatre',52,-65,125,102,48,'repaired','III','colosseum','Still used for venationes; 443 earthquake repairs are represented.'),
 M('ludus','Ludus Magnus','arena',112,-120,54,45,15,'damaged','III','colosseum','Gladiatorial training complex, reduced in late use.'),
 M('venus-roma','Temple of Venus and Roma','temple',-15,2,78,32,22,'spoliated','IV','forum','Twin temple complex with stripped roof and partial ruin.'),
 M('palatine','Palatine Palace','palace',-25,-245,142,100,34,'damaged','X','sack410','Imperial palace shell after the court has moved to Ravenna.'),
 M('circus','Circus Maximus','circus',-185,-310,260,74,18,'damaged','XI','forum','Large, worn racing valley; active at reduced intensity in the fifth century.'),
 M('boarium','Forum Boarium','market',-330,-210,104,75,7,'standing','XI','forum','Cattle-market district, river trade and surviving temples.'),
 M('portunus','Temple of Portunus','temple',-365,-210,31,22,17,'standing','XI','forum','Port-related temple, largely intact.'),
 M('hercules','Temple of Hercules Victor','round',-320,-187,28,28,18,'standing','XI','forum','Round marble temple in the Forum Boarium.'),
 M('janus','Arch of Janus','arch',-288,-190,22,18,20,'standing','XI','forum','Four-way masonry arch at the Velabrum.'),
 M('pantheon','Pantheon','dome',-365,120,64,64,39,'standing','IX','pantheon','Still an intact civic/religious monument before its 609 conversion.'),
 M('pompey','Theatre of Pompey','theatre',-445,53,118,72,29,'damaged','IX','forum','Theatre and portico complex, parts absorbed into housing.'),
 M('marcellus','Theatre of Marcellus','theatre',-390,-70,94,58,28,'standing','IX','forum','Large theatre façade remains visible above later occupation.'),
 M('stadium','Stadium of Domitian','stadium',-445,205,126,51,14,'spoliated','IX','forum','Former arena around which late antique urban fabric grows.'),
 M('augustus-mausoleum','Mausoleum of Augustus','mausoleum',-340,360,68,68,29,'damaged','VII','augustus','Urns desecrated in 410; massive circular structure remains.'),
 M('hadrian','Mausoleum of Hadrian','mausoleum',-560,125,74,74,42,'fortified','XIV','hadrian','Honorius incorporated the tomb into the defensive system.'),
 M('pons-aelius','Pons Aelius','bridge',-500,95,112,15,10,'standing','XIV','hadrian','Bridge linking the Tiber crossing to Hadrian’s tomb.'),
 M('diocletian','Baths of Diocletian','bath',12,375,175,126,34,'working','VI','diocletian','Still supplied before later aqueduct cuts; vast halls and service yards.'),
 M('caracalla','Baths of Caracalla','bath',65,-438,175,132,37,'working','XII','caracalla','Olympiodorus still listed the baths among Rome’s wonders.'),
 M('titus-baths','Baths of Titus','bath',120,20,86,64,22,'damaged','III','colosseum','Earlier bath complex, partially repaired and weathered.'),
 M('sallust','Horti Sallustiani','garden',-92,475,140,105,9,'ruined','VI','sack410','Burned in 410 and not rebuilt: terraces, stumps and ruin gardens.'),
 M('castra','Castra Praetoria','fort',242,348,102,85,20,'fortified','VI','walls','Barracks integrated into the Aurelian boundary.'),
 M('peter','Old St. Peter’s Basilica','church',-710,115,160,70,30,'working','XIV','peter','Constantinian basilica, atrium and Vatican pilgrimage approach.'),
 M('vatican-necropolis','Vatican Necropolis','cemetery',-722,20,180,55,4,'burial','XIV','peter','Burial landscape below the Vatican slope and basilica.'),
 M('lateran','Lateran Basilica','church',305,-118,125,62,30,'working','II','notitia','Episcopal basilica and baptismal complex.'),
 M('maria-maggiore','Santa Maria Maggiore','church',130,215,103,49,28,'new','V','smm','New fifth-century Marian basilica with its celebrated mosaic programme.'),
 M('sabina','Santa Sabina','church',-302,-425,82,39,24,'new','XIII','sabina','Aventine basilica built 422–432, one of the era’s clearest new forms.'),
 M('paul','San Paolo fuori le Mura','church',-505,-605,142,63,30,'working','XIII','paul','Great Pauline basilica beyond the Ostian gate, linked by Via Ostiensis.'),
 M('croce','Santa Croce in Gerusalemme','church',355,56,93,42,23,'working','V','notitia','Sessorian palace hall converted into a major pilgrimage church.'),
 M('clemente','San Clemente','church',112,-10,63,35,19,'working','III','notitia','Fourth-century basilica in the Subura/Colosseum corridor.'),
 M('john-paul','Santi Giovanni e Paolo','church',-70,-252,68,34,19,'working','II','notitia','Christian basilica founded at the end of the fourth century.'),
 M('pudenziana','Santa Pudenziana','church',73,95,55,31,19,'working','IV','notitia','Ancient titular church in the dense Subura edge.'),
 M('stephen','Santo Stefano Rotondo','round-church',-15,-348,58,58,25,'new','II','notitia','Begun near the end of the target period, 468–483.'),
 M('pyramid','Pyramid of Cestius','pyramid',-440,-475,38,38,38,'standing','XIII','walls','Tomb embedded close to the Aurelian circuit.'),
 M('empy','Emporium and Horrea Galbae','warehouse',-410,-385,118,64,18,'working','XIII','notitia','River warehouses and commercial yards survive with reduced trade.'),
 M('island','Tiber Island','island',-485,-145,90,125,4,'standing','XIV','notitia','River island and healing sanctuary corridor.'),
 M('claudia','Aqua Claudia','aqueduct',340,-35,290,12,20,'damaged','V','notitia','Major aqueduct arc; surviving systems are visibly fragile.'),
 M('virgo','Aqua Virgo','aqueduct',-340,255,130,11,13,'working','VII','notitia','Reliable line serving the Campus Martius corridor.'),
 M('insula-subura','Subura Insulae','insula',40,95,120,115,19,'inferred','IV','notitia','Dense multi-storey fabric; masses are schematic rather than individual excavated houses.'),
 M('trastevere','Trastevere Insulae','insula',-655,-205,165,150,17,'inferred','XIV','notitia','Working river district represented as low, dense urban fabric.'),
 M('aventine-houses','Aventine Insulae','insula',-220,-440,105,85,16,'inferred','XIII','notitia','Residential blocks around the Aventine approach.'),
 M('esquiline-houses','Esquiline Insulae','insula',215,160,120,100,18,'inferred','V','notitia','Schematic blocks based on regionary density, not individual house restitutions.')
];

export const TELEPORTS = [
 ['forum','Forum Romanum'],['colosseum','Colosseum'],['pantheon','Pantheon'],['caracalla','Baths of Caracalla'],['diocletian','Baths of Diocletian'],['peter','Vatican & Old St. Peter’s'],['maria-maggiore','Santa Maria Maggiore'],['sabina','Aventine & Santa Sabina'],['hadrian','Hadrian’s Mausoleum'],['palatine','Palatine Palace'],['circus','Circus Maximus']
];
