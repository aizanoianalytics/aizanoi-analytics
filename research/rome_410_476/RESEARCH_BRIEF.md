# Rome AD 410–476 — Research Brief

This brief records the historical and reconstruction assumptions behind the Late Antique Rome experience. It is a research-facing document, not a development task list.

## Scope

The target is Rome between the sack of Alaric in AD 410 and the formal end of the Western Roman Empire in AD 476.

The reconstruction is intentionally selective. It does not claim a street-by-street restitution of the entire city. Much of Late Antique Rome survives only through incomplete archaeology, later reuse, literary testimony, topographical inference and modern scholarship. Where evidence is incomplete, the project distinguishes supported monuments from plausible urban fabric and atmospheric reconstruction.

The main geographic frame is the city within the Aurelian Walls, with selected immediately adjacent monuments only where they are historically essential to understanding the period.

## Evidence model

The shared Ancient World evidence vocabulary is used throughout the implementation:

- **archaeological** — supported by excavated physical evidence, surviving fabric, measured remains or securely documented archaeological context;
- **documented** — supported by literary, epigraphic or historical documentation and consistent with the known topography;
- **plausible** — scholarly/topographical inference used when an exact restitution is not securely known;
- **atmospheric** — environmental or experiential detail used for legibility and mood rather than as a factual reconstruction claim.

Visual state and evidence are separate concepts. A structure may be shown as damaged, repaired, spoliated, ruined or working while the confidence in that depiction is recorded independently.

## Historical frame

The city of AD 410–476 should not look like an intact Augustan postcard. The period is defined by continuity and transformation at the same time:

- the Aurelian Walls remain the dominant urban boundary and were strengthened under Honorius shortly before the sack of 410;
- major imperial monuments such as the Colosseum, Pantheon, Curia, arches, aqueduct structures, bridges and large bath complexes still shaped the city;
- repeated sack, fire, earthquake, maintenance decline and spoliation altered many civic spaces;
- Christian basilicas and tituli became increasingly important urban anchors;
- former imperial and pagan spaces could remain standing even when their original function had weakened or ended;
- population and street activity were lower and more uneven than at the High Imperial peak;
- residential fabric remained dense in many districts, but exact individual buildings are usually not recoverable and therefore must be treated as plausible massing rather than excavated fact.

## Geographic and urban principles

The reconstruction uses the fourteen Augustan regions as a historical/topographical organizing framework while acknowledging that their administrative meaning changed over time.

Important spatial anchors include:

- the Aurelian Walls and principal gates;
- the Roman Forum and Imperial Fora;
- the Colosseum and surrounding monumental zone;
- the Palatine and Caelian hills;
- the Campus Martius;
- the Aventine and the southern monumental corridor;
- the Tiber, bridges and Trastevere;
- the main approach roads and surviving aqueduct infrastructure;
- major Christian basilicas and pilgrimage destinations.

Terrain and district geometry are schematic where no validated survey dataset is available. The model preserves major hill, valley, river and monument relationships rather than claiming centimetre-accurate topography.

## Monument categories

### Strongly attested / major surviving anchors

Representative monuments include:

- Aurelian Walls and major gates;
- Colosseum;
- Pantheon;
- Curia Julia;
- Basilica of Maxentius;
- Trajan's Forum, Column and Markets;
- Arch of Constantine, Arch of Titus and Arch of Septimius Severus;
- Theatre of Marcellus and Theatre of Pompey;
- Baths of Diocletian and Baths of Caracalla;
- Mausoleum of Hadrian and Mausoleum of Augustus;
- Circus Maximus;
- major Tiber bridges;
- principal aqueduct structures;
- Old St. Peter's Basilica;
- Santa Maria Maggiore;
- Santa Sabina;
- San Paolo fuori le Mura;
- other securely documented late-antique Christian sites represented in the city data.

Each rendered monument should retain its own evidence/source record. Inclusion in this brief does not override the more specific city dataset.

### Damaged, reused or spoliated fabric

Late Antique Rome should visibly include selective evidence of:

- fire and sack damage;
- stripped marble revetment and reused architectural material;
- collapsed or partly maintained monumental shells;
- changed access patterns around formerly central civic spaces;
- reuse of existing buildings and precincts;
- lower-intensity occupation in some monumental districts.

These effects must not be applied indiscriminately. A monument is not shown as ruined merely because the period is Late Antiquity; the state must be supported by a source or explicitly marked as plausible.

### Inferred urban fabric

Residential quarters, workshops, minor streets and background blocks are used to make the city spatially readable. They are procedural and are therefore treated as **plausible**, not individually excavated restitutions.

The most important rule is that inferred massing must remain visually subordinate to named monuments, major roads and evidence-bearing structures.

## Visual atmosphere

The intended atmosphere is a functioning but transformed imperial capital:

1. **Continuity:** monumental Rome is still recognizably monumental.
2. **Wear:** maintenance is uneven; exposed brick, patched surfaces, rubble and missing revetment are credible where supported.
3. **Religious transition:** Christian buildings and routes are increasingly prominent without turning the whole city into a later medieval landscape.
4. **Lower density of activity:** streets should not feel like the population peak of the second century.
5. **Environmental realism:** the Tiber, hills, walls, roads and large civic spaces should dominate orientation.
6. **Uncertainty:** attractive rendering must never erase the distinction between evidence and inference.

## Reconstruction rules

- Do not invent a precise street alignment where the evidence is weak.
- Do not label procedural residential massing as excavated or documented.
- Do not project a later medieval condition backward into AD 410–476 without evidence.
- Do not portray every pagan monument as destroyed; many remained standing after their cultic use changed.
- Do not portray every major bath or civic building as fully operational; state must be period-appropriate and sourced.
- Keep the modern-orientation overlay schematic unless a validated modern cadastral/topographic dataset is deliberately introduced.
- Building-level evidence in the runtime dataset takes precedence over broad prose in this brief.

## Primary research material in this repository

The Rome research folder contains the working historical reports used to build and audit the city model:

- `augustan_rome_410_476.md` — regional/topographical inventory and monument notes;
- `rome_410_476_report.md` — Late Antique historical synthesis and monument/state research.

The implementation also keeps source/evidence data close to the city itself under:

- `frontend/ancient-cities/rome-410-476/data/`;
- `frontend/ancient-cities/rome-410-476/js/methodology.js`;
- `frontend/ancient-cities/rome-410-476/research/`.

## Core bibliography and reference families

The reconstruction draws on a mixture of archaeological/topographical scholarship and historical sources, including:

- the *Notitia* / *Curiosum* regionary catalogues;
- Platner & Ashby, *A Topographical Dictionary of Ancient Rome*;
- L. Richardson Jr., *A New Topographical Dictionary of Ancient Rome*;
- Amanda Claridge, *Rome: An Oxford Archaeological Guide*;
- Richard Krautheimer, *Rome: Profile of a City, 312–1308*;
- Bryan Ward-Perkins on Late Antique urban change and the end of the Western Roman world;
- Neil Christie on the later Roman Empire and Late Antique city;
- J. B. Lott on the neighbourhoods and Augustan regions of Rome;
- Filippo Coarelli's archaeological/topographical guides;
- the Stanford Digital Forma Urbis Romae Project and related topographical resources where applicable;
- monument-specific archaeological publications and official heritage material used in the city source records.

Wikipedia and other encyclopedic pages may be used as discovery aids or snapshots, but they are not treated as sufficient evidence for a high-confidence reconstruction claim when stronger archaeological or scholarly sources are available.

## Source-of-truth rule

This document explains the reconstruction philosophy. The executable city data and evidence metadata remain the operational source of truth for what is actually rendered.

When this brief, an older research note and the current city dataset disagree, the current evidence-tagged implementation should be reviewed against the strongest available source rather than silently choosing whichever version is more visually convenient.
