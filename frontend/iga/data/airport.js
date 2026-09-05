// Spatial model for an original, navigable interpretation of İstanbul Airport.
// References explain the real design cues represented here.
export const CITY = Object.freeze({
  id:'iga-istanbul-airport',
  title:'İGA · ISTANBUL AIRPORT',
  subtitle:'Present-day global gateway · original interactive interpretation',
  period:'Present day · Arnavutköy, Istanbul',
  description:'A source-led walk through the check-in hall, security transition, international piers and apron of an original procedural interpretation of Istanbul Airport.',
  boundary:'Terminal processor, airside piers and apron',
  scaleMetres:1400000,
});

export const SOURCES = Object.freeze([
  { id:'nordic', title:'Nordic Office of Architecture — Istanbul Airport', url:'https://nordicarch.com/projects/istanbul-airport', note:'1.4m m² terminal; 36×36 m roof grid; two-and-a-half-level main processor and piers.' },
  { id:'iga-map', title:'İGA — Airport Map', url:'https://www.istairport.com/en/airport/maps/airport-map?locale=en', note:'Public wayfinding and passenger-facing spatial reference.' },
  { id:'iga-departures', title:'İGA — Departing Passenger Guide', url:'https://www.istairport.com/en/flights/airport-guides/departing-passenger-guide?locale=en', note:'Check-in islands, passenger flow and accessibility details.' },
  { id:'iga-arrivals', title:'İGA — Arriving Passenger Guide', url:'https://www.istairport.com/en/flights/airport-guides/arrival-passenger-guide?locale=en', note:'Arrival, exit gates, metro and landside movement details.' },
  { id:'iga-transfer', title:'İGA — Transfer Passenger Guide', url:'https://www.istairport.com/en/flights/airport-guides/transfer-passenger-guide?locale=en', note:'Transfer flows, baggage and onward routing.' },
  { id:'iga-leed', title:'İGA — LEED certification + Time Travel', url:'https://www.istairport.com/en/flights/airport-guides/iga-cares-accessibility/time-travel?locale=en', note:'World\'s largest LEED-certified building; operational milestones.' },
]);

export const REGIONS = Object.freeze([
  { id:'landside', name:'Landside forecourt', x:0, z:-320, w:820, d:240, note:'Compressed curbside arrival and terminal frontage.' },
  { id:'processor', name:'Main processor', x:0, z:0, w:860, d:410, note:'Check-in, security and passport-flow interpretation beneath the roof grid.' },
  { id:'airside-west', name:'International Pier A–B', x:-470, z:340, w:250, d:660, note:'Gate concourse and apron view.' },
  { id:'airside-east', name:'International Pier C–F', x:470, z:340, w:250, d:660, note:'Gate concourse, retail and quiet-zone interpretation.' },
  { id:'domestic', name:'Domestic wing', x:0, z:510, w:360, d:330, note:'Domestic gates and onward travel zone.' },
  { id:'airfield', name:'Apron and tower vista', x:0, z:980, w:1500, d:420, note:'Compressed aircraft stands, taxiways and original tulip-inspired tower silhouette.' },
]);

export const STREETS = Object.freeze([
  { id:'curb', name:'Departures curb', points:[[-420,-255],[-180,-255],[0,-255],[180,-255],[420,-255]], width:24 },
  { id:'checkin-axis', name:'Check-in hall axis', points:[[0,-190],[0,-20],[0,145],[0,305]], width:42 },
  { id:'west-pier', name:'Pier A–B concourse', points:[[-260,195],[-430,310],[-470,610],[-470,910]], width:26 },
  { id:'east-pier', name:'Pier C–F concourse', points:[[260,195],[430,310],[470,610],[470,910]], width:26 },
  { id:'domestic-pier', name:'Domestic concourse', points:[[0,180],[0,430],[0,700]], width:28 },
]);

const E = Object.freeze({ level:'documented', note:'Spatial cue is based on public architecture or passenger-guide material; this is an original, compact interactive interpretation rather than an as-built plan.' });
const B = (id,name,type,x,z,w,d,h,region,detail,extra={}) => ({ id,name,type,x,z,w,d,h,region,detail,evidence:E,material:'terminal',...extra });
export const BUILDINGS = Object.freeze([
  B('terminal','Grand terminal hall','terminal',0,0,860,410,38,'processor','A single, daylight-led terminal volume with an original vaulted grid and check-in islands.',{noCollision:true}),
  B('checkin-bcd','Domestic check-in islands B–D','checkin',-205,-38,190,68,5,'processor','Domestic check-in island reference from the departing passenger guide.',{noCollision:true}),
  B('checkin-fgh','International check-in islands F–H', 'checkin',0,-38,190,68,5,'processor','International check-in flow interpretation.',{noCollision:true}),
  B('checkin-mps','International check-in islands M–S', 'checkin',205,-38,190,68,5,'processor','Long-hall check-in rhythm and wayfinding cues.',{noCollision:true}),
  B('security','Security and passport transition','gateway',0,125,410,26,11,'processor','A broad transition zone where focused skylight and signage pull the journey onward.'),
  B('pier-west','Pier A–B','terminal',-470,570,105,720,18,'airside-west','International pier with gates, waiting zones and a continuous apron-facing window wall.',{noCollision:true}),
  B('pier-east','Pier C–F','terminal',470,570,105,720,18,'airside-east','International pier with retail, napzone cues and a continuous apron-facing window wall.',{noCollision:true}),
  B('domestic-wing','Domestic wing','terminal',0,575,230,320,20,'domestic','Domestic gates, food-court rhythm and short onward routes.',{noCollision:true}),
  B('tower','Tulip-inspired ATC tower','tower',-250,1030,35,35,90,'airfield','Original simplified tower silhouette informed by the airport\'s tulip-inspired air traffic control tower.',{noCollision:true}),
  B('apron-west','Apron stands west','apron',-470,1010,260,260,1,'airfield','Aircraft stand field and taxiway atmosphere.',{noCollision:true,framing:{distance:58,cameraDistance:64,pitch:-0.18,preferredDirections:[[1,1],[1,0]]}}),
  B('apron-east','Apron stands east','apron',470,1010,260,260,1,'airfield','Aircraft stand field and taxiway atmosphere.',{noCollision:true,framing:{distance:58,cameraDistance:64,pitch:-0.18,preferredDirections:[[-1,1],[-1,0]]}}),
  B('plaza','Departure forecourt plaza','forecourt',0,-290,800,240,6,'landside','Original curbside, covered drop-off and lane rhythm for a legible terminal arrival sequence.',{noCollision:true}),
  B('passport-west','Passport control west','gateway',-180,160,100,24,11,'processor','Formal boundary between landside and airside zones.'),
  B('passport-east','Passport control east','gateway',180,160,100,24,11,'processor','Formal boundary between landside and airside zones.'),
  B('retail-belt','Pier retail belt','market',0,740,500,30,4,'domestic','Rhythmic duty-free and F&B presence along the pier transition.'),
  B('checkin-hall-mark','Check-in hall viewpoint','hallmark',0,-120,2,2,6,'processor','Interior viewpoint marker anchoring the check-in hall tour.',{noCollision:true,framing:{distance:34,cameraDistance:16,pitch:0.02,preferredDirections:[[0,-1]],interior:true}}),
  B('flight-board','Departures flight board','signage',0,-152,30,1.4,5,'processor','Split-flap-era departures board rendered as a modern dark-glass display over the check-in islands.',{noCollision:true,framing:{distance:26,cameraDistance:14,pitch:0.05,preferredDirections:[[0,-1]],interior:true}}),
  B('dutyfree-north','Duty-free transfer band','market',0,172,240,20,4,'processor','Security-side duty-free and retail band before the passport control line.'),
  B('gate-pod-west','Pier A–B gate pod','gate',-430,300,26,18,12,'airside-west','Boarding-gate pod with lounge sightlines along the west pier.',{noCollision:true,framing:{distance:30,cameraDistance:22,pitch:0.0,preferredDirections:[[0,1]],interior:true}}),
  B('gate-pod-east','Pier C–F gate pod','gate',430,300,26,18,12,'airside-east','Boarding-gate pod with lounge sightlines along the east pier.',{noCollision:true,framing:{distance:30,cameraDistance:22,pitch:0.0,preferredDirections:[[0,1]],interior:true}}),
  B('lounge-west','Pier A–B lounge deck','bench',-455,640,60,10,1.4,'airside-west','Seating rhythm and window-wall rest zone along the west pier.',{noCollision:true}),
  B('lounge-east','Pier C–F lounge deck','bench',455,640,60,10,1.4,'airside-east','Seating rhythm and window-wall rest zone along the east pier.',{noCollision:true}),
  B('terrace','Fresh-air terrace','stoa',-520,680,40,60,3,'airside-west','Open-air terrace reference from the official passenger guide.'),
]);
export const WATERS = Object.freeze([]);
export const BOUNDS = Object.freeze({ minX:-900,maxX:900,minZ:-430,maxZ:1240 });
export const SPAWN = Object.freeze({ x:0,z:-270,yaw:2.76,pitch:0.02 });
