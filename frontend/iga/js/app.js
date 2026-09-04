import { CITY, SOURCES, REGIONS, STREETS, BUILDINGS, WATERS, BOUNDS, SPAWN } from '../data/airport.js';
import { startAncientCity } from '../../ancient-world/engine/city-bootstrap.js';

const { runtime } = startAncientCity({
  city:CITY, sources:SOURCES, regions:REGIONS, streets:STREETS, buildings:BUILDINGS,
  waters:WATERS, bounds:BOUNDS, spawn:SPAWN,
  compactionProfile:{ name:'iga', maxSpan:1680, targetSpan:1280, minBuildingSize:5, minStreetWidth:8 },
  approachWidth:22, frontageWidth:16, ui:'standard', cityRoute:'/iga/',
});
window.__IGA_WORLD__ = runtime;
