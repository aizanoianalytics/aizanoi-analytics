import { CITY, SOURCES, REGIONS, STREETS, BUILDINGS } from '../data/city.js';
import { generateUrbanFabric } from '../data/urban-fabric.js';
import { startAncientCity } from '../../../ancient-world/engine/city-bootstrap.js';

const { runtime } = startAncientCity({
  city:CITY,
  sources:SOURCES,
  regions:REGIONS,
  streets:STREETS,
  buildings:BUILDINGS,
  waters:[
    { type:'rect', x:350, z:180, w:36, d:700, name:'Eridanos' },
    { type:'polyline', points:[[-500,-100],[-390,20],[-300,100],[-220,220]], width:38, name:'Ilissos' },
    { type:'rect', x:260, z:470, w:900, d:70, name:'Kephissos plain channel' },
  ],
  bounds:{ minX:-700, maxX:1200, minZ:-480, maxZ:720 },
  spawn:{ x:110, z:230, yaw:Math.PI * 0.95, pitch:-0.03 },
  compactionProfile:'athens',
  approachWidth:10,
  frontageWidth:8,
  generateFabric:generateUrbanFabric,
  expandWalls:true,
  ui:'standard',
  cityRoute:'/ancient-cities/athens-450-430/',
});

window.__ATHENS_WORLD__ = runtime;
