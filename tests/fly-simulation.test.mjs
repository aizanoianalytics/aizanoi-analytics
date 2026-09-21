import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PROVENANCE_LABELS, validateProvenance, Vec3, Quat, BodyState,
  AuthoredSurfaceAdapter, FlySimulation, FixedStepScheduler, SensorFrame,
  HeuristicTestController, TelemetryProtocol, WebSocketTelemetryAdapter,
  checkpoint, restore, stateHash, replayHash, replay,
  createBrowserSimulation, createFlyWorldEnvironmentAdapter,
  SpectatorBridge, TelemetryLagError
} from '../frontend/labs/fly-simulation/index.js';

const planeEnv = () => ({
  schemaVersion: 'fly-env-1', hash: 'env-plane-v1', glbHash: 'glb-plane-v1',
  meta: { artifactHashes: { environmentSource: 'env-plane-v1', flyHouseGlb: 'glb-plane-v1' } },
  roomAt: (p) => p.x < 5 ? 'room-a' : 'room-b',
  surfaces: [{ id: 'floor', point: [0, 0, 0], normal: [0, 1, 0], room: 'room-a' }]
});
const makeSim = () => new FlySimulation(planeEnv(), { fixedDt: 0.02, gravity: new Vec3(0, -9.81, 0) });

test('plane surface conversion preserves authored world coordinates', () => {
  const adapter = new AuthoredSurfaceAdapter([
    { id: 'main-room:floor', axis: 'z', value: 0, normal: [0, 0, 1], bounds: [[-4.8, -4], [4.8, 4]] },
    { id: 'main-room:west-wall', axis: 'x', value: -4.8, normal: [1, 0, 0], bounds: [[-4, 0], [4, 2.85]] },
    { id: 'main-room:ceiling', axis: 'z', value: 2.85, normal: [0, 0, -1], bounds: [[-4.8, -4], [4.8, 4]] }
  ]);
  assert.deepEqual(adapter.surfaces.map((s) => s.point.toJSON()), [[0, 0, 0], [-4.8, 0, 0], [0, 0, 2.85]]);
});
test('provenance contract accepts exact labels and rejects unknown labels', () => {
  assert.deepEqual(PROVENANCE_LABELS, ['CONNECTOME-DERIVED', 'BIOLOGICALLY CONSTRAINED', 'MODELLED', 'HEURISTIC']);
  assert.equal(validateProvenance({ label: 'MODELLED', source: 'stage-b', units: 'm/s', calibrated: false, assumptions: ['simplified'], limitations: ['not biological'], sourceReferences: [], version: '1.0.0' }).label, 'MODELLED');
  assert.throws(() => validateProvenance({ label: 'BIOLOGICAL', source: 'x' }), /provenance label/);
});

test('body accepts plain coordinate objects at the browser seam', () => {
  const body = new BodyState({ position: { x: 1, y: 2, z: 3 } });
  assert.deepEqual(body.position.toJSON(), [1, 2, 3]);
});

test('vectors, quaternions and body integration apply gravity forces torque damping and thrust', () => {
  const body = new BodyState({ position: new Vec3(0, 2, 0), mass: 2, damping: 0.1, drag: 0.1 });
  body.applyForce(new Vec3(2, 0, 0)); body.applyTorque(new Vec3(0, 1, 0)); body.applyThrust(new Vec3(0, 3, 0));
  body.integrate(0.1, new Vec3(0, -9.81, 0));
  assert.ok(body.position.y > 1.8 && body.position.y < 2.1);
  assert.ok(body.velocity.x > 0); assert.notDeepEqual(body.orientation, new Quat());
  assert.throws(() => body.applyThrust([1, 2, 3]), /Vec3/);
});

test('physics uses authored raycast adapter and landing/rest/takeoff transitions', () => {
  const sim = makeSim();
  sim.addFly({ flyId: 'f1', body: new BodyState({ position: new Vec3(0, .25, 0), radius: .25 }) });
  sim.step(0.02);
  assert.equal(sim.getFly('f1').contact.phase, 'STABLE_REST');
  assert.equal(sim.getFly('f1').room, 'room-a');
  sim.setMotors('f1', { thrust: 20 }); sim.step(0.02);
  assert.equal(sim.getFly('f1').contact.phase, 'AIRBORNE');
  sim.setMotors('f1', { thrust: 0 });
  assert.equal(sim.physicsCollisionAdapter instanceof AuthoredSurfaceAdapter, true);
  assert.equal(Object.hasOwn(sim.environment, 'collisionAt'), false);
});

test('room transition is deterministic and registry stores complete independent fly state', () => {
  const sim = makeSim();
  sim.addFly({ flyId: 'a', body: new BodyState({ position: new Vec3(0, 1, 0) }) });
  sim.addFly({ flyId: 'b', body: new BodyState({ position: new Vec3(6, 1, 0) }) });
  sim.step(0.01);
  assert.deepEqual(sim.listFlyIds(), ['a', 'b']);
  assert.equal(sim.getFly('b').room, 'room-b');
  assert.notEqual(sim.getFly('a').body, sim.getFly('b').body);
  assert.ok(sim.getFly('a').sensors && sim.getFly('b').motors);
});

test('manual fixed step and wall clock scheduler preserve lag without silently dropping it', () => {
  const sim = makeSim(); let ticks = 0; const scheduler = new FixedStepScheduler(sim, { onStep: () => ticks++ });
  assert.equal(scheduler.manualStep(3), 3); assert.equal(ticks, 3);
  assert.equal(scheduler.advanceWallClock(0.1), 5); assert.equal(scheduler.lag, 0);
  assert.equal(scheduler.advanceWallClock(0.011), 0); assert.ok(scheduler.lag > 0);
  assert.equal(scheduler.advanceWallClock(0.009), 1); assert.equal(scheduler.lag, 0);
});

test('simulation rejects non-finite step durations and invalid fixed-step configuration', () => {
  assert.throws(() => makeSim().step(Infinity), /finite|dt/i);
  assert.throws(() => new FlySimulation(planeEnv(), { fixedDt: 0 }), /fixedDt/i);
  assert.throws(() => new FlySimulation(planeEnv(), { fixedDt: Infinity }), /fixedDt/i);
});

test('generic simulation rejects environments without authored GLB identity', () => {
  assert.throws(() => new FlySimulation({ hash:'env-only', schemaVersion:'1', surfaces:[] }), /authored artifact hashes/);
});
test('scheduler bounds multi-second catch-up and reports dropped wall time honestly', () => {
  const sim = makeSim(); const scheduler = new FixedStepScheduler(sim, { maxCatchUpSteps: 4 });
  assert.equal(scheduler.advanceWallClock(2), 4);
  assert.equal(sim.tick, 4);
  assert.equal(scheduler.status().cannotKeepPace, true);
  assert.ok(scheduler.status().droppedSeconds > 1.9);
  assert.equal(scheduler.status().owedLagSeconds, scheduler.status().lagSeconds);
  const fractional = new FixedStepScheduler(makeSim(), { maxCatchUpSteps: 4 });
  fractional.advanceWallClock(2.005);
  assert.ok(Math.abs(fractional.status().droppedSeconds - 1.925) < 1e-12);
});

test('sensor frame implements proprioception contact coarse authored rays and explicit unavailable channels', () => {
  const sim = makeSim(); sim.addFly({ flyId: 'f', body: new BodyState({ position: new Vec3(0, 1, 0) }) });
  sim.step(0.02); const s = sim.getFly('f').sensors;
  assert.equal(s.version, 'sensor-1'); assert.ok(Number.isFinite(s.proprioception.speed));
  assert.equal(s.contact.grounded, false); assert.ok(Math.abs(s.rays.down.distance - 1) < .01);
  assert.equal(s.environment.room, 'room-a'); assert.equal(s.channels.vision.status, 'MODELLED'); assert.equal(s.channels.vision.value.length, 8); assert.equal(s.channels.olfaction.status, 'UNAVAILABLE');
});

test('vision directions rotate with the authoritative body orientation', () => {
  const seen = [];
  const identity = { environmentSource: 'env-orientation-v1', flyHouseGlb: 'glb-orientation-v1' };
  const env = {
    schemaVersion: 'fly-env-1', hash: identity.environmentSource, glbHash: identity.flyHouseGlb,
    meta: { artifactHashes: identity }, surfaces: [],
    raycast: (_origin, direction) => { seen.push(direction); return null; },
    roomAt: () => 'room-a'
  };
  const sim = new FlySimulation(env, { gravity: new Vec3(0, 0, 0) });
  sim.addFly({ flyId: 'f', body: new BodyState({ position: new Vec3(0, 1, 0) }) });
  seen.length = 0;
  sim.getFly('f').body.orientation = new Quat(0, 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4));
  sim.step(0);
  const firstVisionRay = seen[1];
  assert.ok(Math.abs(firstVisionRay.x) < 1e-9);
  assert.ok(Math.abs(firstVisionRay.y - 1) < 1e-9);
});

test('replay preserves recorded motor and controller state with an attached controller', () => {
  class StatefulController {
    constructor() { this.name = 'STATEFUL'; this.version = 'test-v1'; this.provenance = 'MODELLED'; }
    step(_sensor, state = {}) {
      const count = Number(state.count ?? 0) + 1;
      return { motors: { thrust: count }, state: { count } };
    }
  }
  const expected = makeSim(); expected.addFly({ flyId: 'f' });
  const events = [1, 2, 3].map((count) => ({
    dt: 0.02,
    inputs: { f: { thrust: 9 + count } },
    controllerState: { f: { count } }
  }));
  for (const event of events) {
    expected.setMotors('f', event.inputs.f); expected.step(event.dt);
    expected.getFly('f').controllerState = event.controllerState.f;
  }
  const replayed = makeSim(); replayed.addFly({ flyId: 'f', controller: new StatefulController() });
  replay(replayed, events);
  assert.equal(replayed.getFly('f').motors.thrust, 12);
  assert.deepEqual(replayed.getFly('f').controllerState, { count: 3 });
  assert.deepEqual(replayed.getFly('f').body.position.toJSON(), expected.getFly('f').body.position.toJSON());
});

test('thrust follows body orientation instead of a fixed world axis', () => {
  const env = {
    ...planeEnv(),
    hash: 'env-body-frame-v1', glbHash: 'glb-body-frame-v1',
    meta: { artifactHashes: { environmentSource: 'env-body-frame-v1', flyHouseGlb: 'glb-body-frame-v1' } },
    downDirection: [0, 0, -1],
    surfaces: [{ id: 'floor', point: [0, 0, 0], normal: [0, 0, 1], room: 'room-a' }]
  };
  const sim = new FlySimulation(env, { gravity: new Vec3(0, 0, 0), downDirection: new Vec3(0, 0, -1) });
  sim.addFly({ flyId: 'f', body: new BodyState({ position: new Vec3(0, 0, 1), orientation: new Quat(0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)) }) });
  sim.setMotors('f', { thrust: 1 });
  sim.step(0.1);
  const position = sim.getFly('f').body.position;
  assert.ok(position.x > 0.004, 'rotated local thrust should move along world X');
  assert.ok(Math.abs(position.z - 1) < 1e-9, 'rotated local thrust should not remain world-Z thrust');
});

test('named HEURISTIC TEST CONTROLLER maps sensor to motors without teleport', () => {
  const sim = makeSim(); sim.addFly({ flyId: 'f', body: new BodyState({ position: new Vec3(0, 1, 0) }) });
  const c = new HeuristicTestController(); const before = sim.getFly('f').body.position.clone();
  const motors = c.motorFromSensor(sim.getFly('f').sensors); assert.equal(c.name, 'HEURISTIC TEST CONTROLLER');
  sim.setMotors('f', motors); sim.step(0.02); assert.notDeepEqual(sim.getFly('f').body.position, before);
});

test('telemetry is versioned and allowlisted, websocket adapter emits only protocol frames', () => {
  const frames = []; const socket = { send: (x) => frames.push(x) }; const t = new TelemetryProtocol();
  const adapter = new WebSocketTelemetryAdapter(socket, t);
  assert.throws(() => adapter.send({ flyId: 'f', state: { room: 'a', position: [1, 2, 3] }, secret: 'no' }), /allowlist/);
  assert.equal(frames.length, 0);
  assert.throws(() => t.encode({ flyId: 'f', arbitrary: 1 }), /allowlist/);
});

test('provenance requires machine-readable scientific metadata and every sensor subsystem reports it', () => {
  assert.throws(() => validateProvenance({ label: 'MODELLED', source: 'x' }), /units/);
  const sim = makeSim(); sim.addFly({ flyId: 'f', body: new BodyState() });
  for (const subsystem of Object.values(sim.getFly('f').sensors.provenance)) {
    assert.ok(subsystem.units && typeof subsystem.calibrated === 'boolean' && subsystem.version);
  }
  for (const channel of Object.values(sim.getFly('f').sensors.channels)) validateProvenance(channel.provenance);
});

test('checkpoint carries sensor history, motor state and environment dynamic state', () => {
  const sim = makeSim(); sim.addFly({ flyId: 'f', body: new BodyState() });
  sim.setMotors('f', { thrust: 2 }); sim.step(); const cp = checkpoint(sim);
  assert.ok(cp.rngState && cp.sensorHistory && cp.environmentState);
  const restored = makeSim(); restore(restored, cp); assert.equal(stateHash(restored), stateHash(sim));
});

test('replay applies identical inputs to reproduce simulation state', () => {
  const a = makeSim(); a.addFly({ flyId: 'f' });
  const events = [{ dt: .02, inputs: { f: { thrust: 4 } } }, { dt: .02, inputs: { f: { thrust: 0 } } }];
  const b = makeSim(); b.addFly({ flyId: 'f' });
  for (const event of events) { for (const [id, motors] of Object.entries(event.inputs)) { a.setMotors(id, motors); b.setMotors(id, motors); } a.step(event.dt); b.step(event.dt); }
  const replayed = makeSim(); replayed.addFly({ flyId: 'f' }); replay(replayed, events);
  assert.equal(stateHash(replayed), stateHash(a));
});

test('browser factory adapts Fly World raycast and bridge interpolates without authority', () => {
  const env = createFlyWorldEnvironmentAdapter({ meta: { artifactHashes: { environmentSource: 'h', flyHouseGlb: 'g' } }, schemaVersion: 's', raycast: () => ({ distance: 1, surfaceId: 'floor', point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } }), roomAt: () => 'main-room', zonesAt: () => ['airflow'] });
  const { simulation, bridge } = createBrowserSimulation(env, { now: () => 0 });
  simulation.addFly({ flyId: 'f', body: new BodyState() });
  bridge.ingest({ version: 'telemetry-1', sequence: 1, flyId: 'f', identity: { environmentHash: 'h', glbHash: 'g' }, state: { position: [0, 0, 0], orientation: [0, 0, 0, 1] } });
  bridge.ingest({ version: 'telemetry-1', sequence: 2, flyId: 'f', identity: { environmentHash: 'h', glbHash: 'g' }, state: { position: [2, 0, 0], orientation: [0, 0, 0, 1] } });
  assert.equal(bridge.ingest({ version: 'telemetry-1', sequence: 3, flyId: 'f', identity: { environmentHash: 'other', glbHash: 'g' }, state: { position: [999, 0, 0], orientation: [0, 0, 0, 1] } }), false);
  const target = { position: { set: (...v) => { target.value = v; } }, quaternion: { set: () => { target.rotated = true; } } };
  bridge.render(target, .5); assert.deepEqual(target.value, [1, 0, 0]); assert.equal(target.rotated, true);
  assert.equal(bridge.authority, 'spectator-read-only'); assert.equal(bridge.sentCommands, 0);
});

test('spectator bridge keeps independent sequence and render buffers per fly', () => {
  const bridge = new SpectatorBridge({ environmentHash: 'env', glbHash: 'glb' });
  const frame = (flyId, sequence, x) => ({ version: 'telemetry-1', flyId, sequence, identity: { environmentHash: 'env', glbHash: 'glb' }, state: { position: [x, 0, 0], orientation: [0, 0, 0, 1] } });
  assert.equal(bridge.ingest(frame('a', 1, 0)), true); assert.equal(bridge.ingest(frame('b', 1, 10)), true);
  assert.equal(bridge.ingest(frame('a', 2, 2)), true); assert.equal(bridge.ingest(frame('b', 2, 12)), true);
  const a = { position: { set: (...value) => { a.value = value; } }, quaternion: { set: () => {} } };
  const b = { position: { set: (...value) => { b.value = value; } }, quaternion: { set: () => {} } };
  assert.equal(bridge.render(a, .5, 'a'), true); assert.equal(bridge.render(b, .5, 'b'), true);
  assert.deepEqual(a.value, [1, 0, 0]); assert.deepEqual(b.value, [11, 0, 0]); assert.equal(bridge.flyStates.size, 2);
});
test('telemetry includes required metadata, identity, rejects arbitrary keys, and reports lag rather than dropping frames', () => {
  const t = new TelemetryProtocol();
  const identity = { environmentHash: 'env-plane-v1', glbHash: 'glb-plane-v1' };
  const encoded = JSON.parse(t.encode({ flyId: 'f', sequence: 1, identity, state: { room: 'a', position: [1, 2, 3], orientation: [0, 0, 0, 1] }, metadata: { controller: 'HEURISTIC TEST CONTROLLER', provenance: 'MODELLED' } }));
  assert.deepEqual(encoded.identity, identity);
  assert.equal(encoded.metadata.controller, 'HEURISTIC TEST CONTROLLER');
  assert.throws(() => t.encode({ flyId: 'f', sequence: 1, identity, state: {}, metadata: {}, arbitrary: 1 }), /allowlist/);
  assert.throws(() => t.encode({ flyId: 'f', sequence: 1, identity, state: { contact: { evil: 1 } }, metadata: {} }), /allowlist/);
  assert.throws(() => new WebSocketTelemetryAdapter({ send() {} }, t, { maxLag: 0 }).send({ flyId: 'f', sequence: 1, identity, state: {} }), TelemetryLagError);
});

test('Fly House integration surface stays authored and spectator-visible', () => {
  const source = readFileSync(new URL('../frontend/labs/fly-world/glb-runtime-v3.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../frontend/labs/fly-world/index.html', import.meta.url), 'utf8');
  assert.match(source, /createEnvironment/); assert.match(source, /FLY_ENVIRONMENT/);
  assert.match(html, /HEURISTIC TEST CONTROLLER|fly-simulation/);
});

test('simulation pause resume and explicit stepping are deterministic', () => {
  const sim = makeSim(); sim.addFly({ flyId: 'f' });
  assert.equal(sim.paused, false);
  sim.pause(); sim.stepOne(); assert.equal(sim.tick, 1);
  sim.stepN(2); assert.equal(sim.tick, 3);
  sim.resume(); sim.step(); assert.equal(sim.tick, 4);
  sim.pause(); sim.step(); assert.equal(sim.tick, 4);
});

test('realtime scheduler can start and stop while reporting accumulated lag', () => {
  const sim = makeSim(); const scheduler = new FixedStepScheduler(sim);
  let callback; let now = 0;
  scheduler.start({ now: () => now, requestFrame: (fn) => { callback = fn; return 7; } });
  callback(0); now = 0.051; callback(51);
  assert.equal(sim.tick, 2); assert.ok(scheduler.status().lagSeconds > 0);
  scheduler.stop(); assert.equal(scheduler.status().running, false);
});

test('telemetry snapshot is deterministic, complete, and allowlisted', () => {
  const sim = makeSim(); sim.addFly({ flyId: 'f' }); sim.stepOne();
  const snapshot = sim.telemetrySnapshot('f', { lagSeconds: .01, controller: 'HEURISTIC TEST CONTROLLER' });
  assert.deepEqual(Object.keys(snapshot).sort(), ['checkpointStatus','contact','controller','fly','flyId','motor','provenance','room','sensorSummary','tick','time','timeSeconds','transform','velocity','zones'].sort());
  assert.equal(snapshot.tick, 1); assert.equal(snapshot.fly.id, 'f');
  assert.equal(snapshot.controller.name, 'HEURISTIC TEST CONTROLLER'); assert.equal(snapshot.checkpointStatus.environmentHash, 'env-plane-v1');
  assert.throws(() => new TelemetryProtocol().encode({ flyId: 'f', state: snapshot, unexpected: true }), /allowlist/);
});

test('adapter preserves exact environment and GLB identity in checkpoints', () => {
  const env = createFlyWorldEnvironmentAdapter({ meta: { artifactHashes: { environmentSource: 'environment-exact', flyHouseGlb: 'glb-exact' } }, schemaVersion: 's', raycast: () => null });
  const sim = new FlySimulation(env); sim.addFly({ flyId: 'f' });
  const cp = checkpoint(sim);
  assert.equal(env.hash, 'environment-exact'); assert.equal(env.glbHash, 'glb-exact');
  assert.equal(cp.environmentHash, 'environment-exact'); assert.equal(cp.glbHash, 'glb-exact');
});

test('Fly House browser wiring uses authored spawn, spectator telemetry, and RAF interpolation', () => {
  const source = readFileSync(new URL('../frontend/labs/fly-world/glb-runtime-v3.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /simulation\.addFly|HeuristicTestController|FixedStepScheduler|createBrowserSimulation/);
  assert.match(source, /FLY_TELEMETRY_CONFIG|Telemetry inactive|new WebSocket/);
});
