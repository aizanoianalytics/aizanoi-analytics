/**
 * airport-data.js — İGA Istanbul Airport Spatial Model
 * Present-Day Global Aviation Hub · Aizanoi Analytics unified worlds runtime
 */

export const CITY = {
  id: 'iga-istanbul-airport',
  title: 'İGA · ISTANBUL AIRPORT',
  subtitle: 'Present-Day Global Aviation Gateway · Interactive Spatial Model',
  period: 'Present Day · Arnavutköy, Istanbul',
  boundary: 'Terminal Processor, Airside Piers and Apron',
  scaleMetres: 1800,
  description: 'A source-led 3D walkthrough of the grand terminal hall, check-in islands, security transition, international piers, apron, and the iconic tulip-inspired Air Traffic Control tower of Istanbul Airport.',
};

export const SOURCES = [
  { id: 'nordic', title: 'Nordic Office of Architecture — Istanbul Airport', url: 'https://nordicarch.com/projects/istanbul-airport' },
  { id: 'aecom-atc', title: 'AECOM — Istanbul Airport Air Traffic Control Tower', url: 'https://aecom.com/press-releases/aecom-pininfarina-win-istanbul-new-airport-design-competition/' },
  { id: 'iga-map', title: 'İGA — Interactive Airport Map', url: 'https://www.istairport.com/en/airport/maps/airport-map?locale=en' },
  { id: 'iga-departures', title: 'İGA — Departing Passenger Guide', url: 'https://www.istairport.com/en/flights/airport-guides/departing-passenger-guide?locale=en' },
  { id: 'iga-arrivals', title: 'İGA — Arriving Passenger Guide', url: 'https://www.istairport.com/en/flights/airport-guides/arrival-passenger-guide?locale=en' },
  { id: 'iga-transfer', title: 'İGA — Transfer Passenger Guide', url: 'https://www.istairport.com/en/flights/airport-guides/transfer-passenger-guide?locale=en' },
];

export const REGIONS = [
  { id: 'landside', name: 'Landside Forecourt & Drop-off', x: 0, z: -320, w: 820, d: 240, note: 'Departures curbside, covered canopy and drop-off lanes.' },
  { id: 'processor', name: 'Main Terminal Processor', x: 0, z: 0, w: 860, d: 410, note: 'Grand check-in hall, security filters, and vaulted skylight roof grid.' },
  { id: 'airside-west', name: 'International Pier A–B', x: -470, z: 340, w: 250, d: 660, note: 'International gate concourse and apron vista.' },
  { id: 'airside-east', name: 'International Pier C–F', x: 470, z: 340, w: 250, d: 660, note: 'Gate concourse, duty-free, and passenger lounges.' },
  { id: 'domestic', name: 'Domestic Wing', x: 0, z: 510, w: 360, d: 330, note: 'Domestic departure gates and transfer retail.' },
  { id: 'airfield', name: 'Apron, Taxiways & ATC Tower', x: 0, z: 980, w: 1500, d: 420, note: 'Aircraft stands, taxiway network, and 90m tulip-inspired control tower.' },
];

export const STREETS = [
  { id: 'curb', name: 'Departures Curb Road', points: [[-420,-255],[-180,-255],[0,-255],[180,-255],[420,-255]], width: 24 },
  { id: 'checkin-axis', name: 'Grand Central Check-in Concourse', points: [[0,-190],[0,-20],[0,145],[0,305]], width: 42 },
  { id: 'west-pier', name: 'Pier A–B Concourse Spine', points: [[-260,195],[-430,310],[-470,610],[-470,910]], width: 26 },
  { id: 'east-pier', name: 'Pier C–F Concourse Spine', points: [[260,195],[430,310],[470,610],[470,910]], width: 26 },
  { id: 'domestic-pier', name: 'Domestic Concourse Spine', points: [[0,180],[0,430],[0,700]], width: 28 },
];

const E_DOC = { level: 'documented', note: 'Directly supported by published architectural or official passenger-guide material.' };
const E_MODEL = { level: 'plausible', note: 'Schematic spatial interpretation informed by public architectural and passenger-guide sources.' };

export const BUILDINGS = [
  {
    id: 'terminal', name: 'Grand Terminal Hall', type: 'terminal',
    x: 0, z: 0, w: 860, d: 410, h: 38, region: 'processor', source: 'nordic', evidence: E_MODEL,
    detail: 'A 1.4 million m² terminal under one roof, with a daylight-led vaulted ceiling and modular roof geometry developed for the airport complex.'
  },
  {
    id: 'tower', name: 'Tulip-Inspired Air Traffic Control Tower', type: 'tower',
    x: -250, z: 1030, w: 35, d: 35, h: 90, region: 'airfield', source: 'aecom-atc', evidence: E_DOC,
    detail: 'Iconic 90-meter control tower designed by Pininfarina and AECOM, inspired by the tulip flower—a historic symbol of Istanbul.'
  },
  {
    id: 'checkin-bcd', name: 'Check-in Islands B–D', type: 'checkin',
    x: -205, z: -38, w: 190, d: 68, h: 6, region: 'processor', source: 'iga-departures', evidence: E_MODEL,
    detail: 'Automated self-service baggage drop and airline ticketing desks.'
  },
  {
    id: 'checkin-fgh', name: 'Check-in Islands F–H', type: 'checkin',
    x: 0, z: -38, w: 190, d: 68, h: 6, region: 'processor', source: 'iga-departures', evidence: E_MODEL,
    detail: 'Central international check-in banks beneath the high vaulted skylights.'
  },
  {
    id: 'checkin-mps', name: 'Check-in Islands M–S', type: 'checkin',
    x: 205, z: -38, w: 190, d: 68, h: 6, region: 'processor', source: 'iga-departures', evidence: E_MODEL,
    detail: 'East terminal check-in islands and business-class priority services.'
  },
  {
    id: 'security', name: 'Central Security & Passport Filter', type: 'gateway',
    x: 0, z: 125, w: 410, d: 26, h: 12, region: 'processor', source: 'iga-departures', evidence: E_MODEL,
    detail: 'Biometric e-gates and high-throughput security checkpoints leading into the central duty-free plaza.'
  },
  {
    id: 'pier-west', name: 'International Pier A–B Concourse', type: 'pier',
    x: -470, z: 570, w: 105, d: 720, h: 18, region: 'airside-west', source: 'nordic', evidence: E_MODEL,
    detail: 'International departure concourse lined with glass airside facades, boarding bridges, and gate lounges.'
  },
  {
    id: 'pier-east', name: 'International Pier C–F Concourse', type: 'pier',
    x: 470, z: 570, w: 105, d: 720, h: 18, region: 'airside-east', source: 'nordic', evidence: E_MODEL,
    detail: 'International departure gates, premium airline lounges, and panoramic apron views.'
  },
  {
    id: 'domestic-wing', name: 'Domestic Terminal Wing', type: 'pier',
    x: 0, z: 575, w: 230, d: 320, h: 20, region: 'domestic', source: 'nordic', evidence: E_MODEL,
    detail: 'Domestic departure hall and transfer gates connecting Turkish regional cities.'
  },
  {
    id: 'apron-west', name: 'Apron Stands West & Airliners', type: 'apron',
    x: -470, z: 1010, w: 260, d: 260, h: 1, region: 'airfield', source: 'nordic', evidence: E_MODEL,
    detail: 'Widebody aircraft stands accommodating Airbus A350 and Boeing 777 airliners.'
  },
  {
    id: 'apron-east', name: 'Apron Stands East & Airliners', type: 'apron',
    x: 470, z: 1010, w: 260, d: 260, h: 1, region: 'airfield', source: 'nordic', evidence: E_MODEL,
    detail: 'Aircraft stands, jetways, and fueling positions on the eastern taxiway apron.'
  },
  {
    id: 'plaza', name: 'Departures Forecourt Plaza', type: 'forecourt',
    x: 0, z: -290, w: 800, d: 240, h: 6, region: 'landside', source: 'nordic', evidence: E_MODEL,
    detail: 'Canopied curbside drop-off zones connecting to the M11 Istanbul Metro station.'
  }
];

export const WATERS = []; // Landlocked airfield
export const BOUNDS = { minX: -900, maxX: 900, minZ: -450, maxZ: 1300 };
export const SPAWN = { x: 0, z: -270, angle: 0 }; // Facing North into the Grand Terminal Hall

export const TELEPORTS = [
  { id: 'plaza', name: 'Departures Curbside Plaza' },
  { id: 'terminal', name: 'Grand Terminal Check-in Hall' },
  { id: 'security', name: 'Security & Duty-Free Zone' },
  { id: 'pier-west', name: 'International Pier A–B' },
  { id: 'pier-east', name: 'International Pier C–F' },
  { id: 'domestic-wing', name: 'Domestic Concourse' },
  { id: 'tower', name: 'Tulip ATC Control Tower' },
  { id: 'apron-west', name: 'Apron & Airliner Stands' }
];

export const TOUR_STOPS = [
  { id: 'plaza', title: 'Departures Curbside', description: 'Arrive at the grand canopied curbside drop-off of Istanbul Airport, connecting passenger transit lanes to the terminal.', duration: 30 },
  { id: 'terminal', title: 'Grand Terminal Hall', description: 'Step beneath the 1.4 million m² terminal roof, structured by large modular bays and daylight-focused vaulted geometry.', duration: 40 },
  { id: 'checkin-fgh', title: 'Check-in Islands', description: 'Modern automated self-service bag drops and check-in rows organized along spacious longitudinal avenues.', duration: 25 },
  { id: 'security', title: 'Central Security & Duty-Free', description: 'Transition through the central security and passport-control sequence into the international shopping and lounge promenade.', duration: 30 },
  { id: 'pier-west', title: 'International Pier & Gates', description: 'Stroll along the bright, glass-walled concourse with direct views of taxiing aircraft and passenger boarding bridges.', duration: 35 },
  { id: 'tower', title: 'Tulip Air Traffic Control Tower', description: 'Gaze out at the 90-meter aerodynamic tulip-form control tower commanding the runways and aprons.', duration: 40 }
];

export const DISTRICT_STYLES = {};
