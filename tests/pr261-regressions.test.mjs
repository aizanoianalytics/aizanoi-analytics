import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { BodyState, Vec3, Quat, FlySimulation, replay, TelemetryProtocol } from '../frontend/labs/fly-simulation/index.js';
import { parseWebSocketFrames, createFlySimulationService } from '../services/fly-simulation/service.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = { schemaVersion:'e1', hash:'e1', surfaces:[
  {id:'floor',point:[0,0,0],normal:[0,1,0]}, {id:'wall',point:[1,0,0],normal:[-1,0,0]}, {id:'ceiling',point:[0,0,2],normal:[0,0,-1]}
] };

test('node simulation service is outside publish tree', () => {
  assert.equal(existsSync(resolve(root,'frontend/labs/fly-simulation/service.js')), false);
  assert.equal(existsSync(resolve(root,'services/fly-simulation/service.mjs')), true);
});
test('upgrade policy rejects arbitrary host and hostile origin', async () => {
  const service = createFlySimulationService({environment:env, port:0, allowedHosts:['127.0.0.1'], allowedOrigins:['http://127.0.0.1']});
  await service.start();
  const result = await service.probeUpgrade({host:'evil.test', origin:'https://evil.test'});
  assert.equal(result, false); await service.stop();
});
test('strict parser fails closed on unmasked control and oversize frames', () => {
  assert.throws(() => parseWebSocketFrames(Buffer.from([0x81,0x01,0x61])), /masked/);
  assert.throws(() => parseWebSocketFrames(Buffer.from([0x81,0xff,0,0,0,0,0,1,0,1,0,0,0,0])), /maximum|oversize/);
});
test('quaternion integration rotates a non-identity orientation correctly', () => {
  const q = new Quat(0,0,Math.SQRT1_2,Math.SQRT1_2); const b = new BodyState({orientation:q, angularVelocity:new Vec3(0,0,2)});
  b.integrate(.01,new Vec3()); assert.notDeepEqual(b.orientation.toJSON(), q.toJSON()); assert.ok(Math.abs(Math.hypot(...b.orientation.toJSON())-1)<1e-12);
});
test('body volume sweeps through wall and ceiling and reports contacts', () => {
  const sim = new FlySimulation(env,{fixedDt:.02,gravity:new Vec3(0,0,0)}); sim.addFly({flyId:'f',body:new BodyState({position:[0,0.5,1],velocity:[100,0,0],radius:.2})});
  sim.step(); const f=sim.getFly('f'); assert.ok(f.body.position.x <= .8); assert.equal(f.contact.surfaceId,'wall');
  f.body.position=new Vec3(.5,.5,1.7); f.body.velocity=new Vec3(0,0,100); sim.step(); assert.ok(f.body.position.z<=1.8); assert.equal(f.contact.surfaceId,'ceiling');
});
test('replay rejects non-fixed dt and checkpoint data is isolated', () => {
  const sim=new FlySimulation(env); sim.addFly({flyId:'f'}); assert.throws(()=>replay(sim,[{dt:.01,inputs:{}}]),/fixed/);
  const cp=sim.checkpoint(); cp.flies[0].body.position[0]=99; assert.notEqual(sim.getFly('f').body.position.x,99);
});
test('telemetry rejects the retired secret key and unknown nested keys', () => {
  const t=new TelemetryProtocol(); assert.throws(()=>t.encode({flyId:'f',state:{},secret:'x'}),/allowlist/); assert.throws(()=>t.encode({flyId:'f',state:{position:[],evil:1}}),/allowlist/);
});
