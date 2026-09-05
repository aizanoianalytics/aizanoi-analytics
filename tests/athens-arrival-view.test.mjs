import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {compactPoint, CITY_COMPACTION_PROFILES} from '../frontend/ancient-world/assets/city-layout-tools.js';
import {BUILDINGS} from '../frontend/ancient-cities/athens-450-430/data/city.js';
test('Athens arrival camera faces the Dipylon gate instead of empty countryside',()=>{
 const source=readFileSync('frontend/ancient-cities/athens-450-430/js/app.js','utf8');
 const literal=source.match(/spawn:(\{[^}]+\})/)[1];
 const spawn=runInNewContext('('+literal+')',{Math});
 const gate=BUILDINGS.find(x=>x.id==='dipylon-gate');
 const a=compactPoint(spawn.x,spawn.z,CITY_COMPACTION_PROFILES.athens), b=compactPoint(gate.x,gate.z,CITY_COMPACTION_PROFILES.athens);
 const dx=b[0]-a[0],dz=b[1]-a[1];
 const dot=(Math.sin(spawn.yaw)*dx-Math.cos(spawn.yaw)*dz)/Math.hypot(dx,dz);
 assert.ok(dot>0.98,`Arrival faces away from gate: direction agreement ${dot}`);
});
