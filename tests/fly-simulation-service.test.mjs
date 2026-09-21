import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import crypto from 'node:crypto';
import { BodyState, Vec3, createFlyWorldEnvironmentAdapter } from '../frontend/labs/fly-simulation/index.js';
import { createFlySimulationService, createFlyWorldSimulationService } from '../services/fly-simulation/service.mjs';

const authoredPlane = createFlyWorldEnvironmentAdapter({
  meta: { artifactHashes: { environmentSource: 'authored-test-plane-v1', flyHouseGlb: 'authored-test-plane.glb' } },
  schemaVersion: 'fly-world-test-plane-1',
  raycast(origin, direction) {
    if (direction[1] >= 0 && direction.y >= 0) return null;
    const y = origin.y ?? origin[1];
    return { distance: Math.max(0, y), surfaceId: 'authored-floor', point: [origin.x ?? origin[0], 0, origin.z ?? origin[2]], normal: [0, 1, 0], room: 'test-plane' };
  },
  roomAt: () => 'test-plane',
  zonesAt: () => ['authored-floor-zone']
});

function frame(payload) {
  const data = Buffer.from(payload);
  const mask = crypto.randomBytes(4);
  const masked = Buffer.from(data.map((byte, i) => byte ^ mask[i % 4]));
  const header = data.length < 126 ? Buffer.from([0x81, 0x80 | data.length]) : Buffer.from([0x81, 0x80 | 126, data.length >> 8, data.length & 255]);
  return Buffer.concat([header, mask, masked]);
}

function connect(port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    let buffer = Buffer.alloc(0);
    const pending = [];
    let handshake = false;
    const fail = (error) => { while (pending.length) pending.shift().reject(error); reject(error); };
    socket.on('error', fail);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!handshake) {
        const end = buffer.indexOf('\r\n\r\n');
        if (end < 0) return;
        assert.match(buffer.subarray(0, end).toString(), /101 Switching Protocols/);
        buffer = buffer.subarray(end + 4); handshake = true;
        resolve({ socket, next: () => new Promise((res, rej) => { pending.push({ resolve: res, reject: rej }); parse(); }) });
      }
      parse();
    });
    function parse() {
      while (handshake && buffer.length >= 2) {
        const length = buffer[1] & 0x7f;
        const headerSize = length < 126 ? 2 : length === 126 ? 4 : 10;
        if (buffer.length < headerSize) return;
        const size = length < 126 ? length : length === 126 ? buffer.readUInt16BE(2) : Number(buffer.readBigUInt64BE(2));
        if (buffer.length < headerSize + size) return;
        const opcode = buffer[0] & 0x0f;
        const payload = buffer.subarray(headerSize, headerSize + size);
        buffer = buffer.subarray(headerSize + size);
        if (opcode === 1 && pending.length) pending.shift().resolve(JSON.parse(payload.toString()));
      }
    }
    const key = crypto.randomBytes(16).toString('base64');
    socket.write(`GET /spectator/telemetry-1 HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
  });
}

test('real Fly World service streams allowlisted telemetry and ignores mutations', async () => {
  const service = createFlySimulationService({ environment: authoredPlane, port: 0, intervalMs: 5 });
  const sim = service.simulation;
  sim.addFly({ flyId: 'service-fly', body: new BodyState({ position: new Vec3(0, 1, 0) }) });
  await service.start();
  const client = await connect(service.address().port);
  try {
    const first = await client.next();
    assert.equal(first.version, 'telemetry-1');
    assert.deepEqual(Object.keys(first).sort(), ['flyId', 'identity', 'lag', 'metadata', 'sequence', 'state', 'version'].sort());
    assert.deepEqual(first.identity, { environmentHash: 'authored-test-plane-v1', glbHash: 'authored-test-plane.glb' });
    assert.equal(first.state.room, 'test-plane');
    assert.equal(first.lag.fixedDt, 0.02);
    client.socket.write(frame(JSON.stringify({ command: 'setPosition', flyId: 'service-fly', position: [999, 999, 999] })));
    const second = await client.next();
    assert.equal(second.version, 'telemetry-1');
    assert.notDeepEqual(second.state.position, [999, 999, 999]);
    assert.equal(sim.getFly('service-fly').body.position.x, second.state.position[0]);
    assert.equal(service.status().authority, 'server-authoritative');
  } finally {
    client.socket.destroy();
    await service.stop();
  }
});

test('actual Fly World service preserves runtime sensors through the environment boundary', async () => {
  const runtimeEnvironment = {
    meta: { artifactHashes: { environmentSource: 'runtime-sensor-plane-v1', flyHouseGlb: 'runtime-sensor-plane.glb' } },
    schemaVersion: 'fly-world-runtime-sensor-plane-1',
    raycast: authoredPlane.raycast,
    roomAt: () => 'runtime-room',
    zonesAt: () => ['runtime-zone'],
    sampleSensor: (channel) => ({ light: { status: 'MODELLED', value: 0.8, units: 'relative intensity' }, olfaction: { status: 'MODELLED', value: 0.4, units: 'normalized concentration' }, taste: { status: 'AVAILABLE', value: 1, units: 'contact flag' }, airflow: { status: 'MODELLED', value: [0.1, 0, 0], units: 'm/s' }, temperature: { status: 'UNAVAILABLE', value: null, units: 'K' } }[channel])
  };
  const service = createFlyWorldSimulationService({ authoredEnvironment: runtimeEnvironment, port: 0, intervalMs: 5 });
  service.simulation.addFly({ flyId: 'runtime-sensor-fly', body: new BodyState({ position: new Vec3(0, 1, 0) }) });
  await service.start();
  const client = await connect(service.address().port);
  try {
    const telemetry = await client.next();
    const channels = telemetry.state.sensors.channels;
    assert.equal(telemetry.state.room, 'runtime-room');
    assert.equal(channels.light.status, 'MODELLED');
    assert.equal(channels.olfaction.value, 0.4);
    assert.equal(channels.taste.status, 'AVAILABLE');
    assert.deepEqual(channels.airflow.value, [0.1, 0, 0]);
    assert.equal(service.simulation.getFly('runtime-sensor-fly').sensors.channels.light.value, 0.8);
  } finally {
    client.socket.destroy();
    await service.stop();
  }
});


test('service rejects unversioned spectator paths and arbitrary upgrade requests', async () => {
  const service = createFlySimulationService({ environment: authoredPlane, port: 0 });
  await service.start();
  await new Promise((resolve, reject) => {
    const socket = net.connect(service.address().port, '127.0.0.1', () => socket.write('GET /spectator HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'));
    socket.once('data', (data) => { assert.match(data.toString(), /400|403|404/); socket.destroy(); resolve(); });
    socket.once('error', reject);
  });
  await service.stop();
});
