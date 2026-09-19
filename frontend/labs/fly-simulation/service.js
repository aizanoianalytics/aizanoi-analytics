import http from 'node:http';
import crypto from 'node:crypto';
import { FlySimulation, FixedStepScheduler } from './index.js';

const PATH = '/spectator/telemetry-1';
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';


function wsFrame(text) {
  const payload = Buffer.from(text);
  if (payload.length < 126) return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
  if (payload.length < 65536) { const h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(payload.length, 2); return Buffer.concat([h, payload]); }
  const h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(payload.length), 2); return Buffer.concat([h, payload]);
}

function consumeFrames(state, chunk, onText) {
  state.buffer = Buffer.concat([state.buffer, chunk]);
  while (state.buffer.length >= 2) {
    const first = state.buffer[0]; const second = state.buffer[1];
    const masked = (second & 0x80) !== 0; let length = second & 0x7f; let header = 2;
    if (length === 126) { if (state.buffer.length < 4) return; length = state.buffer.readUInt16BE(2); header = 4; }
    else if (length === 127) { if (state.buffer.length < 10) return; const n = state.buffer.readBigUInt64BE(2); if (n > BigInt(Number.MAX_SAFE_INTEGER)) return; length = Number(n); header = 10; }
    if (!masked || state.buffer.length < header + 4 + length) return;
    const mask = state.buffer.subarray(header, header + 4); const start = header + 4;
    const payload = Buffer.alloc(length); for (let i = 0; i < length; i++) payload[i] = state.buffer[start + i] ^ mask[i % 4];
    state.buffer = state.buffer.subarray(start + length);
    if ((first & 0x0f) === 1) onText(payload.toString('utf8'));
    else if ((first & 0x0f) === 8) state.socket.end();
  }
}

function validUpgrade(request) {
  const upgrade = String(request.headers.upgrade ?? '').toLowerCase();
  const connection = String(request.headers.connection ?? '').toLowerCase();
  return request.url === PATH && upgrade === 'websocket' && connection.split(',').map(x => x.trim()).includes('upgrade') && request.headers['sec-websocket-version'] === '13' && /^[+/0-9A-Za-z]{22}==$/.test(request.headers['sec-websocket-key'] ?? '');
}

export function createFlySimulationService({ environment, simulation, server: injectedServer = null, host = '127.0.0.1', port = 0, intervalMs = 20, controller = 'HEURISTIC TEST CONTROLLER' } = {}) {
  if (!simulation && !environment) throw new TypeError('authored Fly World environment required');
  const sim = simulation ?? new FlySimulation(environment);

  const ownServer = injectedServer === null;
  const server = injectedServer ?? http.createServer();
  const clients = new Set();
  const scheduler = new FixedStepScheduler(sim);
  let timer = null; let started = false; let listening = false;

  function frameFor(flyId) {
    const snapshot = sim.telemetrySnapshot(flyId, { lagSeconds: scheduler.lag, controller, checkpointStatus: { version: 'checkpoint-1', environmentHash: sim.environment.hash, environmentSchema: sim.environment.schemaVersion, glbHash: sim.environment.glbHash ?? null, lagSeconds: scheduler.lag } });
    return { ...snapshot, version: 'telemetry-1', sequence: sim.tick, lag: { seconds: scheduler.lag, scheduler: { fixedDt: sim.fixedDt, tick: sim.tick, running: scheduler.running, stepsBehind: scheduler.status().stepsBehind, silentDrops: scheduler.status().silentDrops } }, state: { position: snapshot.transform.position, orientation: snapshot.transform.orientation, room: snapshot.room, contact: snapshot.contact } };
  }
  function sendTelemetry(client) {
    for (const flyId of sim.listFlyIds()) {
      try { client.socket.write(wsFrame(JSON.stringify(frameFor(flyId)))); } catch { clients.delete(client); client.socket.destroy(); }
    }
  }
  function broadcast() { for (const client of clients) sendTelemetry(client); }
  function onUpgrade(request, socket) {
    if (!validUpgrade(request)) { socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(request.headers['sec-websocket-key'] + GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const client = { socket, buffer: Buffer.alloc(0) }; clients.add(client);
    socket.on('data', chunk => consumeFrames(client, chunk, () => {}));
    socket.on('close', () => clients.delete(client)); socket.on('error', () => clients.delete(client));
    sendTelemetry(client);
  }
  server.on('upgrade', onUpgrade);
  function start() {
    if (started) return Promise.resolve(service);
    started = true; scheduler.start({ requestFrame: null });
    timer = setInterval(() => { scheduler.advanceWallClock(intervalMs / 1000); broadcast(); }, intervalMs);
    timer.unref?.();
    if (injectedServer) return Promise.resolve().then(() => { listening = Boolean(server.listening); return service; });
    return new Promise((resolve, reject) => { const done = () => { listening = true; resolve(service); }; server.once('error', reject); server.listen({ host, port }, done); });
  }
  async function stop() {
    if (!started) return;
    started = false; scheduler.stop(); if (timer) clearInterval(timer); timer = null;
    for (const client of clients) client.socket.end(); clients.clear();
    if (ownServer && server.listening) await new Promise(resolve => server.close(resolve));
    listening = false;
  }
  const service = { simulation: sim, server, start, stop, address: () => server.address(), status: () => ({ running: started, listening, host, authority: 'server-authoritative', protocol: 'telemetry-1', scheduler: scheduler.status(), clients: clients.size }) };
  return service;
}

export { PATH as FLY_SPECTATOR_PATH };
