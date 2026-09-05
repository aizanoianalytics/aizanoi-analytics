import test from 'node:test';
import assert from 'node:assert/strict';
import {createPointerLook} from '../frontend/ancient-world/engine/pointer-look.js';
test('pointer lock acquisition discards cursor recenter delta, then applies real look',()=>{
 const p={yaw:1,pitch:0}; const look=createPointerLook(p);look.setLocked(true);
 look.move({movementX:500,movementY:-500}); assert.deepEqual(p,{yaw:1,pitch:0});
 look.move({movementX:10,movementY:20}); assert.ok(p.yaw>1);assert.ok(p.pitch<0);
});
test('unlock and reacquire cannot leak old cursor movement into camera',()=>{
 const p={yaw:0,pitch:0};const look=createPointerLook(p);look.move({movementX:100,movementY:100});assert.equal(p.yaw,0);
 look.setLocked(true);look.move({movementX:100,movementY:100});look.move({movementX:10,movementY:0});
 const yaw=p.yaw;look.setLocked(false);look.move({movementX:200,movementY:200});look.setLocked(true);look.move({movementX:200,movementY:200});assert.equal(p.yaw,yaw);
});
test('pointer look rejects invalid deltas and clamps pitch',()=>{
 const p={yaw:0,pitch:0};const look=createPointerLook(p);look.setLocked(true);look.move({movementX:0,movementY:0});
 look.move({movementX:NaN,movementY:Infinity});assert.deepEqual(p,{yaw:0,pitch:0});
 look.move({movementX:1,movementY:9999});assert.equal(p.pitch,-1.3);
});
