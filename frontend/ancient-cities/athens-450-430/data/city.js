/* Period-corrected Athens data view for the final Ancient World release.
   The historical frame remains 450–430 BCE, while the rendered city is anchored
   to a late endpoint around 432–430 BCE so later fifth-century buildings are not
   back-projected into the scene. The preserved source dataset lives beside this
   wrapper as city-source.js for auditability. */
import * as base from './city-source.js';

export const CITY = Object.freeze({
  ...base.CITY,
  description: 'A source-led, navigable reconstruction of Classical Athens in a c. 432–430 BCE visual snapshot inside the wider 450–430 BCE frame: the completed Parthenon and Propylaea, the Agora civic core, Kerameikos gates, Piraeus and the Long Walls corridor.',
});

export const SOURCES = base.SOURCES.map((source) => {
  if (source.id === 'athena-nike') return {
    ...source,
    title: 'Acropolis Museum — Temple of Athena Nike',
    url: 'https://www.theacropolismuseum.gr/en/other-monuments-periklean-building-programme/temple-athena-nike',
  };
  if (source.id === 'erechtheion') return {
    ...source,
    title: 'Hellenic Ministry of Culture — Acropolis / Erechtheion',
    url: 'https://odysseus.culture.gr/h/3/eh3530.jsp?obj_id=2384',
  };
  if (source.id === 'theatre-dionysus') return {
    ...source,
    title: 'Hellenic Ministry of Culture — Theatre of Dionysus Eleuthereus',
    url: 'https://odysseus.culture.gr/h/2/eh251.jsp?obj_id=10341',
  };
  if (source.id === 'hephaisteion') return {
    ...source,
    title: 'Hellenic Ministry of Culture — Temple of Hephaistos',
    url: 'https://odysseus.culture.gr/h/2/eh251.jsp?obj_id=6621',
  };
  if (source.id === 'kerameikos') return {
    ...source,
    title: 'Hellenic Ministry of Culture — Kerameikos',
    url: 'https://odysseus.culture.gr/h/3/eh352.jsp?obj_id=2392',
  };
  return source;
});

export const REGIONS = base.REGIONS.map((region) => {
  if (region.id === 'south-slope') return { ...region, note: 'Theatre of Dionysus and Odeion of Pericles below the Acropolis; the Athenian Asklepieion is later than this visual snapshot.' };
  if (region.id === 'kerameikos') return { ...region, note: 'Potters’ quarter, cemetery, Dipylon and Sacred Gates; the later Pompeion is not rendered.' };
  return region;
});

export const STREETS = base.STREETS;

const LATER_BUILDINGS = new Set([
  'erechtheion-north',
  'erechtheion-karyatid',
  'asclepieion',
  'pompeion',
]);

export const BUILDINGS = base.BUILDINGS.flatMap((building) => {
  if (LATER_BUILDINGS.has(building.id)) return [];

  if (building.id === 'athena-nike') return [{
    ...building,
    id: 'athena-nike-early',
    name: 'Athena Nike bastion & earlier shrine',
    type: 'sanctuary',
    w: 8,
    d: 5,
    h: 2.6,
    state: 'standing',
    detail: 'The Classical Ionic temple was built in 426–421 BCE and is therefore absent from the c. 432–430 BCE visual snapshot. A low sanctuary marker represents the older Athena Nike cult buildings whose remains survive within the bastion.',
  }];

  if (building.id === 'erechtheion') return [{
    ...building,
    id: 'old-athena-polias',
    name: 'Old Temple of Athena Polias',
    type: 'temple',
    w: 22,
    d: 11,
    h: 5,
    state: 'standing',
    source: 'acropolis',
    detail: 'The sixth-century Old Temple of Athena Polias was damaged in 480 BCE, repaired after the Persian destruction and remained in the sacred precinct before the later Erechtheion was erected in 421–406 BCE.',
  }];

  if (building.id === 'hephaisteion') return [{
    ...building,
    state: 'working',
    detail: 'Construction of the Hephaisteion spans roughly 460–420 BCE. The c. 432–430 BCE snapshot treats it as substantially present but not yet a completed cult installation; the bronze cult statues belong to the 421–415 BCE completion phase.',
  }];

  if (building.id === 'stoa-zeus') return [{
    ...building,
    state: 'working',
    detail: 'The Stoa of Zeus Eleutherios belongs to the later fifth-century development of the west Agora. At the endpoint of this model it is treated conservatively as an incomplete/working edge rather than a fully finished monument.',
  }];

  if (building.id === 'theatre-dionysus') return [{
    ...building,
    detail: 'The monumental stone theatre belongs to the fourth century BCE. Around c. 432–430 BCE the Classical theatre still relied heavily on timber ikria/bleachers around an earthen orchestra, with the permanent stage complex still developing.',
  }];

  return [building];
});

export const TELEPORTS = base.TELEPORTS.flatMap(([id, name]) => {
  if (['erechtheion-north', 'erechtheion-karyatid', 'asclepieion', 'pompeion'].includes(id)) return [];
  if (id === 'erechtheion') return [['old-athena-polias', 'Old Temple of Athena Polias']];
  if (id === 'athena-nike') return [['athena-nike-early', 'Athena Nike bastion & earlier shrine']];
  return [[id, name]];
});
