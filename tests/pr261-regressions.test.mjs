import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { BodyState, Vec3, Quat, FlySimulation, replay, TelemetryProtocol, createFlyWorldEnvironmentAdapter } from '../frontend/labs/fly-simulation/index.js';
import { parseWebSocketFrames, createFlySimulationService, createFlyWorldSimulationService } from '../services/fly-simulation/service.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = { schemaVersion:'e1', hash:'e1', glbHash:'g1', meta:{artifactHashes:{environmentSource:'e1',flyHouseGlb:'g1'}}, surfaces:[
  {id:'floor',point:[0,0,0],normal:[0,1,0]}, {id:'wall',point:[1,0,0],normal:[-1,0,0]}, {id:'ceiling',point:[0,0,2],normal:[0,0,-1]}
] };

test('node simulation service is outside publish tree', () => {
  assert.equal(existsSync(resolve(root,'frontend/labs/fly-simulation/service.js')), false);
  assert.equal(existsSync(resolve(root,'services/fly-simulation/service.mjs')), true);
});
test('service rejects injected simulations without authored identity', () => {
  assert.throws(() => createFlySimulationService({
    simulation: { environment: {}, listFlyIds: () => [], telemetrySnapshot: () => ({}) },
  }), /server-authoritative FlySimulation/);
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

test('strict parser rejects malformed RFC6455 close payloads', () => {
  const maskedClose = (payload) => {
    const mask = Buffer.from([1, 2, 3, 4]);
    return Buffer.concat([
      Buffer.from([0x88, 0x80 | payload.length]),
      mask,
      Buffer.from(payload.map((value, index) => value ^ mask[index % 4]))
    ]);
  };
  assert.throws(() => parseWebSocketFrames(maskedClose(Buffer.from([0x03]))), /close payload/);
  const reservedCode = Buffer.alloc(2); reservedCode.writeUInt16BE(1005);
  assert.throws(() => parseWebSocketFrames(maskedClose(reservedCode)), /close code/);
  assert.throws(() => parseWebSocketFrames(maskedClose(Buffer.from([0x03, 0xe8, 0xc3, 0x28]))), /invalid utf8/);
});

test('parser persists fragmented message state across split TCP chunks', () => {
  const mask = Buffer.from([1, 2, 3, 4]);
  const masked = (text) => { const payload = Buffer.from(text); return Buffer.concat([Buffer.from([0x01, 0x80 | payload.length]), mask, Buffer.from(payload.map((v, i) => v ^ mask[i % 4]))]); };
  const first = masked('{"a":');
  const secondPayload = Buffer.from('1}');
  const secondMask = Buffer.from([5, 6, 7, 8]);
  const second = Buffer.concat([Buffer.from([0x80, 0x80 | secondPayload.length]), secondMask, Buffer.from(secondPayload.map((v, i) => v ^ secondMask[i % 4]))]);
  const a = parseWebSocketFrames(first.subarray(0, 4));
  const b = parseWebSocketFrames(Buffer.concat([a.buffer, first.subarray(4)]), { fragmented: a.fragmented, fragmentedOpcode: a.fragmentedOpcode });
  assert.equal(b.messages.length, 0);
  const c = parseWebSocketFrames(second, { buffer: b.buffer, fragmented: b.fragmented, fragmentedOpcode: b.fragmentedOpcode });
  assert.equal(c.messages[0].payload.toString(), '{"a":1}');
});

test('parser validates UTF-8 after fragmented text is reassembled', () => {
  const mask = Buffer.from([1, 2, 3, 4]);
  const frame = (first, payload) => Buffer.concat([
    Buffer.from([first, 0x80 | payload.length]),
    mask,
    Buffer.from(payload.map((value, index) => value ^ mask[index % 4]))
  ]);
  const first = parseWebSocketFrames(frame(0x01, Buffer.from([0xc3])));
  assert.throws(() => parseWebSocketFrames(frame(0x80, Buffer.from([0x28])), {
    fragmented: first.fragmented,
    fragmentedOpcode: first.fragmentedOpcode
  }), /invalid utf8/);
});

test('service disconnects a backpressured client without telemetry accumulation', async () => {
  const server = new EventEmitter();
  server.listening = false;
  const service = createFlySimulationService({ environment: env, server, intervalMs: 5 });
  service.simulation.addFly({ flyId: 'backpressure-fly' });
  await service.start();
  const socket = new EventEmitter();
  let writes = 0;
  socket.write = () => { writes += 1; return writes === 1; };
  socket.end = () => socket.emit('close');
  socket.destroy = () => socket.emit('close');
  server.emit('upgrade', {
    url: '/spectator/telemetry-1',
    headers: {
      host: '127.0.0.1', upgrade: 'websocket', connection: 'Upgrade',
      'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ=='
    }
  }, socket);
  await new Promise((resolve) => { setImmediate(resolve); });
  assert.equal(service.status().clients, 0);
  assert.equal(service.status().metrics.backpressureDisconnects, 1);
  assert.equal(service.status().metrics.lastDisconnectReason, 'telemetry_backpressure');
  await service.stop();
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

test('real Fly House environment shape adapts Z-up gravity and swept raycast collision', () => {
  const planes = [
    { surfaceId:'floor', point:new Vec3(0,0,0), normal:new Vec3(0,0,1) },
    { surfaceId:'wall', point:new Vec3(1,0,0), normal:new Vec3(-1,0,0) },
    { surfaceId:'ceiling', point:new Vec3(0,0,2), normal:new Vec3(0,0,-1) }
  ];
  const raycast = (origin, direction, maxDistance=100) => {
    const o = origin instanceof Vec3 ? origin : new Vec3(origin.x, origin.y, origin.z);
    const d = direction instanceof Vec3 ? direction.normalize() : new Vec3(direction.x, direction.y, direction.z).normalize();
    let nearest = null;
    for (const plane of planes) {
      const denominator = d.dot(plane.normal);
      if (Math.abs(denominator) < 1e-9) continue;
      const distance = plane.point.sub(o).dot(plane.normal) / denominator;
      if (distance < 0 || distance > maxDistance || (nearest && distance >= nearest.distance)) continue;
      nearest = { ...plane, distance, point:o.add(d.mul(distance)), room:'main-room', zones:[] };
    }
    return nearest;
  };
  const authored = {
    version:2, axis:'Z-up', meta:{schemaVersion:2, artifactHashes:{environmentSource:'environment-sha',flyHouseGlb:'glb-sha'}}, surfaces:[{representation:'mesh-triangles'}],
    integration:{coordinateSystem:{axis:'Z-up'},raycast,roomAt:()=> 'main-room',zonesAt:()=> []}
  };
  assert.throws(() => createFlyWorldSimulationService({ authoredEnvironment:authored, identity:{ environmentHash:'wrong-environment', glbHash:'glb-sha' } }), /environment hash mismatch/);
  assert.throws(() => createFlyWorldSimulationService({ authoredEnvironment:authored, identity:{ environmentHash:'environment-sha', glbHash:'glb-sha', axis:'Y-up' } }), /axis mismatch/);
  const service = createFlyWorldSimulationService({
    authoredEnvironment:authored,
    identity:{ environmentHash:'environment-sha', glbHash:'glb-sha' },
    simulationOptions:{ fixedDt:.02 },
    port:0
  });
  const adapter = service.simulation.environment;
  assert.deepEqual(adapter.downDirection.toJSON(), [0,0,-1]);
  assert.equal(adapter.schemaVersion, '2');
  const sim = service.simulation;
  assert.deepEqual(sim.gravity.toJSON(), [0,0,-9.81]);
  sim.addFly({flyId:'real-shape',body:new BodyState({position:[0,0,1],velocity:[100,0,0],radius:.2})});
  sim.step();
  const fly = sim.getFly('real-shape');
  assert.ok(fly.body.position.x <= .8 + 1e-9);
  assert.equal(fly.contact.surfaceId, 'wall');
  assert.equal(fly.room, 'main-room');
});

test('replay rejects non-fixed dt and checkpoint data is isolated', () => {
  const sim=new FlySimulation(env); sim.addFly({flyId:'f'}); assert.throws(()=>replay(sim,[{dt:.01,inputs:{}}]),/fixed/);
  const cp=sim.checkpoint(); cp.flies[0].body.position[0]=99; assert.notEqual(sim.getFly('f').body.position.x,99);
});
test('authored adapter rejects caller-supplied identity when authored artifact hashes are absent', () => {
  assert.throws(() => createFlyWorldEnvironmentAdapter({ schemaVersion:'1', raycast:()=>null }, { environmentHash:'caller-env', glbHash:'caller-glb' }), /exact authored environment and GLB hashes/);
});

test('telemetry rejects the retired secret key and unknown nested keys', () => {
  const identity = { environmentHash:'e1', glbHash:'g1' };
  assert.throws(() => new TelemetryProtocol().encode({ flyId:'f', sequence:0, identity, state:{}, secret:'x' }), /allowlist/);
  assert.throws(() => new TelemetryProtocol().encode({ flyId:'f', sequence:0, identity, state:{position:[],evil:1} }), /allowlist/);
});
