# Plan: Aizanoi Analytics — Rome 410-476 AD Reconstruction

> Status: ready for review. Three research reports already collected:
> - `augustan_rome_410_476.md` (14 Augustan regions + 60+ buildings with 410-476 status, 4. yy Notitia statistics, sources)
> - `rome_410_476_report.md` (49 Wikipedia entries: sacks, Late Antiquity, aqueducts, vai, churches, spolia)
> - `wikipedia_snapshots/` (107 Wikipedia pages fetched, archived)
> Stanford Forma Urbis Romae Project noted as a continuing source for urban plan.

## 1. Honest framing

**What this product is.** A data-driven, self-contained WebGL reconstruction of the city of Rome as it was plausibly visible in AD 410–476, the period from the sack of Alaric to the formal end of the Western Roman Empire. Each building, street, and region is sourced.

**What it is NOT.**
- Not a complete street-by-street modelling of Rome. 95% of late Roman Rome is under modern Rome. A “sokak sokak” reconstruction of the entire city would be 95% invention.
- Not a static Augustus-era postcard. The whole point is the Late Antique decay and the early Christian transformation.
- Not pretending certainty. Visible reconstruction is separated from excavated evidence.

**Confidence labels** (per building):
- **excavated** — geometry comes from measured archaeology
- **plan** — footprint known, elevation reconstructed
- **inferred** — plausible fill-in for undocumented urban fabric
- **ruined / spoliated** — once-standing structures now damaged; this is the dominant state for 410-476

## 2. Geographical scope

The Aurelian Walls (built 271–275; doubled in height under Honorius c. 401–403) are the historical boundary of the city in 410–476. We cover only the area inside these walls. Earlier Servian Wall and suburbs outside the Aurelian line are excluded.

14 Augustan regions with 410–476 status (from `augustan_rome_410_476.md`):
- I Porta Capena — partially inhabited, suburbium to Appia
- II Caelimontium — aristocratic villas, SS. Giovanni e Paolo (398) active
- III Isis et Serapis — Colosseum still active (5.–6. yy), Baths of Trajan
- IV Templum Pacis — Basilica of Maxentius partly standing; decay
- V Esquiliae — densifying Christian activity, Santa Maria Maggiore area
- VI Alta Semita — Horti Sallustiani unrepaired after 410; Baths of Diocletian active till 537
- VII Via Lata — imperial villas and Pincian still in use
- VIII Forum Romanum — mostly ceremonial ruin; Curia Julia 7. yy conversion
- IX Circus Flaminius — theatres and porticoes still standing; Mausoleum of Augustus sacked
- X Palatium — imperial palace shell, decaying; Arch of Titus intact
- XI Circus Maximus — partially still active; structure deteriorating
- XII Piscina Publica — Baths of Caracalla still operating (Olympiodorus 1600-capacity)
- XIII Aventinus — densely residential; Santa Sabina (422–432)
- XIV Transtiberim — Vatican a Christian pilgrimage hub; Mausoleum of Hadrian becomes a fortress

## 3. Monument ledger (working list)

### 3.1 Confirmed excavated / standing in 410–476
- **Aurelian Walls** (271–275; 16m tall by Honorius), 383 towers, 19 km, 18 main gates
- **Colosseum** (72–80) — still used for hunts until 523; staged repairs under Theodosius II
- **Pantheon** (27 BC / rebuilt 118–128) — maintained until 609
- **Mausoleum of Hadrian / Castel Sant'Angelo** (134–139) — incorporated into Aurelian walls as keep
- **Mausoleum of Augustus** (28 BC) — urns desecrated in 410; structure intact
- **Circus Maximus** — bulky, partially still in use to 6. yy
- **Forum of Trajan**: Trajan's Column, Trajan's Market; Basilica Ulpia roof gone
- **Basilica of Maxentius** (308–312) — 3 nave vaults, 1 still standing
- **Arch of Constantine** (315), Arch of Titus (81), Arch of Septimius Severus (203)
- **Temple of Saturn** (ruins, 8 columns remain), Temple of Vespasian (3 columns), Temple of Castor & Pollux (3 columns)
- **Curia Julia** (283–305 restoration) — still standing
- **Theatre of Marcellus** (13 BC) — preserved; later fortified
- **Theatre of Pompey** (55 BC) — partly standing; converted to housing
- **Stadium of Domitian / Piazza Navona** (80) — function lost in 5. yy
- **Baths of Diocletian** (298–306) — partly functional until 537
- **Baths of Caracalla** (212–216) — fully functional until 537; "1 of 7 wonders" per Olympiodorus
- **Baths of Titus** (80) — damaged by 410, partly restored
- **Aqua Virgo** (19 BC) — most reliable aqueduct; basis of Trevi fountain
- **Aqua Claudia** (38–52) — major remains; reliability contested
- **Pons Aelius / Ponte Sant'Angelo** (134) — still in use
- **Pons Mulvius / Ponte Milvio** (109 BC) — 312 battle site; still in use
- **Porta Maggiore** (52) — combined gate of Aqua Claudia / Anio Novus
- **Porta San Paolo / Porta Ostiensis** (271–275)
- **Porta San Sebastiano / Porta Appia** (271–275)
- **Porta Tiburtina / Porta San Lorenzo** (Honorius restoration 402–403)
- **Porta Salaria** (271–275) — entry point of Alaric 410
- **Porta Flaminia / Porta del Popolo** (271–275)
- **Porta Pinciana** (Honorius 403–404)
- **Porta Settimiana, Porta San Pancrazio** (Trastevere gates)
- **Constantinian Old St. Peter's Basilica** (326) — major pilgrimage site
- **Santa Maria Maggiore** (rebuilt 422–432 by Sixtus III, finished by Leo I)
- **Santa Sabina** (422–432)
- **San Paolo fuori le Mura** (Constantinian, completed 386–402 by Innocent I, finished Leo I)
- **San Lorenzo fuori le Mura** (Constantinian oratory, Damasus I 366–384)
- **Santa Croce in Gerusalemme** (Helena c. 325, Sessorium villa)
- **San Clemente** (4. yy base)
- **Santa Maria Antiqua** (5. yy; Forum building)
- **Santo Stefano Rotondo** (468–483)
- **Temple of Romulus** (Santi Cosma e Damiano, 309) — still pagan in 410–476; converted 527
- **Basilica of San Saba** (5. yy)
- **Santa Pudenziana** (4.–5. yy)
- **Santa Maria in Cosmedin** (consolidated 6. yy but earlier tituli present)
- **Santa Balbina** (built from Villa of Fabius Cilo)
- **Santi Giovanni e Paolo al Celio** (398)
- **Santa Maria sopra Minerva** (built over Temple of Minerva Chalcidica)
- **Tomb of Eurysaces the Baker** (1. yy BC)
- **Ara Pacis** (13 BC)
- **Castra Praetoria** (active garrison)
- **Amphitheatrum Castrense** (3. yy)
- **Pyramid of Cestius** (12 BC)

### 3.2 Documented but ruined / spoliated in 410–476
- **Basilica Aemilia** — 410 fire; collapsed
- **Basilica Julia** — 410 fire; repaired but degraded
- **Temple of Jupiter Optimus Maximus** (Capitolinus) — bronze-gold tiles stripped 455; "vandalism" word origin
- **Mausoleum of Augustus** — urns desecrated 410; structure intact
- **Horti Sallustiani** — destroyed 410; never rebuilt
- **Temple of Claudius** (Caelian) — collapsing 4. yy; capital moved to SS. Giovanni e Paolo
- **Most imperator fora** (Forum of Caesar, Forum of Augustus, Forum of Nerva, Forum of Vespasian) — silent
- **Baths of Agrippa** — gone
- **Temple of Apollo Palatinus** — silent (Theodosius 391 closure)
- **Temple of Magna Mater** — silent (Theodosius 391)
- **Temple of Victoria** — silent
- **Temple of Divus Elagabalus** — silent
- **Stadium of Domitian** — function lost 5. yy
- **Forum of Domitian** (former Nerva) — silent
- **Most fire-damaged insulae** — gone
- **Multiple Senate houses** — silent

### 3.3 State imprecise: dense urban fabric we will mark as inferred
- **Subura** (districts) — dense multi-storey, fire-prone
- **Trastevere** — densely residential, working-class
- **Velabrum** — partly commercial
- **Forum Holitoria** — markets
- **Macellum / Forum Piscaria** — markets
- **The atres of Balbus, Pompey, Marcellus** — partly shaved down for housing
- **Aventine, Quirinal, Esquiline residential quarters** — Roman insulae were in many cases 6–7 storeys; we will not draw individual structures outside the documented ones

## 4. Visual atmosphere for 410–476

Working principles:
1. **Spoliation visible**: marble facings stripped; reds, blacks, white marbles gone from many facades. Bare concrete/brick visible.
2. **Earthquake damage**: 410–476 saw repeated earthquakes (442, 443, 468). Rubble piles inside still-standing shells.
3. **Tiber flooding**: Tiber floods deposited 1.5m of silt in the Forum in Late Antiquity. Forum floor is 4–5m above the original Augustan pavement.
4. **Wall height**: Aurelian Walls doubled in height under Honorius (c. 401–403) to 16m. They are clearly the dominant urban feature.
5. **Religious change**: pagan temples silent; Christian tituli and basilicas active; sensibly placed in residential areas.
6. **Infrastructure decay**: aqueducts broken since 410; population reduced; large baths partly abandoned; small public baths near rivers functional; some imperial baths converted to churches.
7. **Markets**: still in use; smaller stalls in the Forum.
8. **People**: many fewer. Empty streets except near basilica gates.

## 5. Engineering plan

### 5.1 What we ship
- A new module at `frontend/ancient-cities/rome-410-476/index.html`
- A city data file at `frontend/ancient-cities/rome-410-476/data/city.json`
- A regions file at `frontend/ancient-cities/rome-410-476/data/regions.json`
- A sources file at `frontend/ancient-cities/rome-410-476/data/sources.json`
- Routes: `/ancient-cities/rome-410-476/` (the experience) and `/ancient-cities/rome-410-476/research/` (sources)
- A launcher entry from the legacy Ancient Cities launcher in the Aizanoi Analytics desktop

### 5.2 What we do NOT refactor in this phase
- The Aizanoi-specific engine monolith: we keep it for the Aizanoi experience. The new Roma experience uses a parallel but compatible runtime.
- The XP desktop navigation: we extend it only with a new launcher entry.

### 5.3 Engine approach
- Reuse the WebGL mesh builder from Aizanoi but break it into ES modules (no longer a single HTML file).
- Each building has a small JSON description: type, width, depth, height, ruin_state, materials, era, source.
- A scheduler paints the buildings in chunks to avoid jank.
- A separate data layer shows the per-region overlays.

### 5.4 Mobile-first constraint
The Aizanoi engine handles mobile detail reduction. We carry that pattern forward.

### 5.5 SPOLIA rendering
Every Aizanoi "spoliation" system is ported. For Rome, we add:
- "Stripped pediment" — facade with the marble reglet missing
- "Vault collapse" — Basilica of Maxentius-style partial collapse
- "Brick shim" — spoliation leaves raw brick visible
- "Pillar row" — columns reused in a later Christian building

## 6. Source-of-truth

Working bibliography (Wikipedia snapshots are an aggregate, not a primary source):
- **Wikipedia EN**: 410–476 status of each major building (107 snapshots archived)
- **Stanford Digital Forma Urbis Romae Project**: urban plan
- **Notitia / Curiosum Regionum XIIII** (4. yy): statistics of insulae, domus, etc.
- **Platner & Ashby, *A Topographical Dictionary of Ancient Rome*** (1929)
- **Richardson, *A New Topographical Dictionary of Ancient Rome*** (1992)
- **Amanda Claridge, *Rome: An Oxford Archaeological Guide*** (2010)
- **Bryan Ward-Perkins, *From Classical to Late Antique: An Archaeological Study of a Sicilian Town*** (2000) — *required reference*
- **Bryan Ward-Perkins, *The Fall of Rome and the End of Civilization*** (2005)
- **Neil Christie, *The Fall of the Western Roman Empire*** (2011)
- **Richard Krautheimer, *Rome: Profile of a City, 312–1308*** (1980)
- **IB Tauris, *The Oxford Handbook of Roman Studies*** (2010)
- **J. B. Lott, *The Neighborhoods of Augustan Rome*** (2004)
- **Goodman, P. J., "In omnibus regionibus?", *Papers of the British School at Rome* 88 (2020)**
- **Coarelli, F., *Roma* (Guide archeologiche Laterza)**
- **Gregorovius, F., *History of the City of Rome in the Middle Ages*** (1894)

## 7. Honest record

We keep a single document:
`research/rome_410_476/SOURCES.md`

Every building we add will be linked to at least one source. Where evidence is weak, the building is marked `inferred` in the data file.

We will NOT:
- Draw buildings for which we have no source.
- Pretend street alignment where Stanford Forma Urbis has no fragment.
- Mark a building as "ruined" if a specific source does not say it was ruined by 410–476.

We WILL:
- Show the modern ruins (post-2010–2020 excavation) as a second "today" layer; user can toggle between AD 410 and "modern" view.
- Cite our sources at the building level, not just at the document level.

## 8. Deliverables

1. **Phase 1 — Research brief** (this document): done.
2. **Phase 2 — Data schema**: JSON types for buildings, streets, regions, sources.
3. **Phase 3 — Rome data**: ~80–150 buildings with sources.
4. **Phase 4 — Engine shell**: ES module split, runtime, atlases, sources overlay.
5. **Phase 5 — Tests and deployment**: browser test, deploy, push to GitHub.

Each phase ends with a report to the user. We do not move to the next phase until the user confirms the report.

## 9. Estimated scope

- **Buildings**: ~80 in the first deployable version (small subset of the 100+ listed above). Expanded in subsequent iterations.
- **Streets**: 6 main viae (Sacra, Lata, Appia, Ostiense, Salaria, Flaminia) + 8 secondary.
- **Aqueducts**: 4 (Virgo, Claudia, Anio Novus, Traiana) with main segments.
- **Regions**: 14 with bounding rectangle and confidence labels.
- **Hotspots**: 30+ with text from Wikipedia.
- **Sources**: 35+ linked at the data level.

## 10. Open questions

1. Do you want me to include the Vatican (Trastevere, Regio XIV) in detail, or treat it as a thematic subsection?
2. Do we want a "modern" overlay layer (showing what is still standing today) or only the 410–476 view?
3. Do we attempt a soundtrack or ambient soundscape (Tiber sounds, market noises, church bells), or keep it silent?
4. Do we want a "graphical" minimap that shows the 14 Augustan regions in color (with extraction density as opacity)?

Each of these can be answered with "yes"/"no" or with a free-text direction. The default, if you say nothing, is:
- *Vatican*: included as thematic subsection
- *Modern overlay*: not in first deploy, but as a roadmap item
- *Sound*: silent (consistent with Aizanoi)
- *Region minimap*: yes, with extraction density as opacity

## 11. Honest checklist before coding

- [x] Research documents compiled and archived
- [x] Regio boundaries and main building locations documented
- [x] Source verification at planning stage
- [ ] User confirms the plan
- [ ] Data schema draft written
- [ ] User confirms data schema
- [ ] Engine shell scaffolded
- [ ] Rome data populated
- [ ] Browser smoke test
- [ ] Production deploy
- [ ] GitHub push
