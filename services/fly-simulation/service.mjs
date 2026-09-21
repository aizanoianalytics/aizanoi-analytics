import http from 'node:http';
import crypto from 'node:crypto';
import { FlySimulation, FixedStepScheduler, TelemetryProtocol, WebSocketTelemetryAdapter, createFlyWorldEnvironmentAdapter } from '../../frontend/labs/fly-simulation/index.js';

export const FLY_SPECTATOR_PATH = '/spectator/telemetry-1';
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const DEFAULT_MAX_FRAME = 64 * 1024;
const DEFAULT_MAX_MESSAGE = 256 * 1024;
const DEFAULT_MAX_BUFFER = 512 * 1024;

export function wsFrame(text, maxMessage = DEFAULT_MAX_MESSAGE) {
  const payload = Buffer.from(text);
  if (payload.length > maxMessage) throw new RangeError('message oversize');
  if (payload.length < 126) return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
  if (payload.length <= 0xffff) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
    return Buffer.concat([header, payload]);
  }
  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(payload.length), 2);
  return Buffer.concat([header, payload]);
}

function parserResult(buffer, messages, fragmented, fragmentedOpcode) {
  return { buffer, messages, fragmented, fragmentedOpcode };
}

function validateUtf8(payload) {
  try { new TextDecoder('utf-8', { fatal: true }).decode(payload); }
  catch { throw new Error('invalid utf8'); }
}

function validateClosePayload(payload) {
  if (payload.length === 1) throw new Error('invalid close payload');
  if (payload.length === 0) return;
  const code = payload.readUInt16BE(0);
  const standard = code >= 1000 && code <= 1014 && ![1004, 1005, 1006].includes(code);
  const application = code >= 3000 && code <= 4999;
  if (!standard && !application) throw new Error('invalid close code');
  validateUtf8(payload.subarray(2));
}

export function parseWebSocketFrames(chunk, {
  buffer = Buffer.alloc(0),
  fragmented = null,
  fragmentedOpcode = null,
  maxFrame = DEFAULT_MAX_FRAME,
  maxMessage = DEFAULT_MAX_MESSAGE,
  maxBuffer = DEFAULT_MAX_BUFFER
} = {}) {
  if (!Buffer.isBuffer(chunk)) throw new TypeError('frame buffer');
  buffer = Buffer.concat([buffer, chunk]);
  if (buffer.length > maxBuffer) throw new RangeError('connection buffer oversize');
  const messages = [];

  while (buffer.length >= 2) {
    const first = buffer[0];
    const second = buffer[1];
    const fin = Boolean(first & 0x80);
    const rsv = first & 0x70;
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    if (rsv) throw new Error('RSV');
    if (!masked) throw new Error('masked frame required');

    let length = second & 0x7f;
    let headerSize = 2;
    if (length === 126) {
      if (buffer.length < 4) return parserResult(buffer, messages, fragmented, fragmentedOpcode);
      length = buffer.readUInt16BE(2);
      headerSize = 4;
    } else if (length === 127) {
      if (buffer.length < 10) return parserResult(buffer, messages, fragmented, fragmentedOpcode);
      const wideLength = buffer.readBigUInt64BE(2);
      if (wideLength > BigInt(maxFrame)) throw new RangeError('frame oversize');
      length = Number(wideLength);
      headerSize = 10;
    }
    if (length > maxFrame) throw new RangeError('frame oversize');
    const control = opcode >= 8;
    if (control && (!fin || length > 125)) throw new Error('control constraint');
    if (![0, 1, 2, 8, 9, 10].includes(opcode)) throw new Error('opcode');

    const total = headerSize + 4 + length;
    if (buffer.length < total) return parserResult(buffer, messages, fragmented, fragmentedOpcode);
    const mask = buffer.subarray(headerSize, headerSize + 4);
    const payload = Buffer.allocUnsafe(length);
    for (let index = 0; index < length; index += 1) {
      payload[index] = buffer[headerSize + 4 + index] ^ mask[index % 4];
    }
    buffer = buffer.subarray(total);

    if (opcode === 8 || opcode === 9 || opcode === 10) {
      if (opcode === 8) validateClosePayload(payload);
      messages.push({ opcode, payload });
      continue;
    }
    if (opcode === 0) {
      if (!fragmented) throw new Error('unexpected continuation');
      fragmented = Buffer.concat([fragmented, payload]);
      if (fragmented.length > maxMessage) throw new RangeError('message oversize');
      if (fin) {
        if (fragmentedOpcode === 1) validateUtf8(fragmented);
        messages.push({ opcode: fragmentedOpcode, payload: fragmented });
        fragmented = null;
        fragmentedOpcode = null;
      }
      continue;
    }
    if (fragmented) throw new Error('fragmented frame');
    if (opcode === 1 && fin) validateUtf8(payload);
    if (length > maxMessage) throw new RangeError('message oversize');
    if (fin) {
      messages.push({ opcode, payload });
    } else {
      fragmented = payload;
      fragmentedOpcode = opcode;
    }
  }
  return parserResult(buffer, messages, fragmented, fragmentedOpcode);
}

function validUpgrade(req, { allowedHosts, allowedOrigins }) {
  const host = String(req.headers.host || '').toLowerCase();
  const origin = req.headers.origin == null ? null : String(req.headers.origin);
  const hostOk = allowedHosts.some((value) => value instanceof RegExp
    ? value.test(host)
    : String(value).toLowerCase() === host
      || (String(value).toLowerCase() === '127.0.0.1' && host.startsWith('127.0.0.1:'))
      || (String(value).toLowerCase() === 'localhost' && host.startsWith('localhost:')));
  const originOk = origin === null || allowedOrigins.some((value) => value instanceof RegExp ? value.test(origin) : String(value) === origin);
  return req.url === FLY_SPECTATOR_PATH
    && String(req.headers.upgrade || '').toLowerCase() === 'websocket'
    && String(req.headers.connection || '').toLowerCase().split(',').map((value) => value.trim()).includes('upgrade')
    && req.headers['sec-websocket-version'] === '13'
    && /^[+/0-9A-Za-z]{22}==$/.test(req.headers['sec-websocket-key'] || '')
    && hostOk && originOk;
}

export function createFlyWorldSimulationService({ authoredEnvironment, identity, simulationOptions = {}, ...serviceOptions } = {}) {
  const environment = createFlyWorldEnvironmentAdapter(authoredEnvironment, identity);
  const simulation = new FlySimulation(environment, simulationOptions);
  return createFlySimulationService({ ...serviceOptions, environment, simulation });
}

export function createFlySimulationService({
  environment,
  simulation,
  server: injectedServer = null,
  host = '127.0.0.1',
  port = 0,
  intervalMs = 20,
  controller = 'HEURISTIC TEST CONTROLLER',
  allowedHosts = [`127.0.0.1:${port}`, '127.0.0.1', 'localhost'],
  allowedOrigins = [],
  maxFrame = DEFAULT_MAX_FRAME,
  maxMessage = DEFAULT_MAX_MESSAGE,
  maxBuffer = DEFAULT_MAX_BUFFER
} = {}) {
  if (!simulation && !environment) throw new TypeError('authored Fly World environment required');
  const sim = simulation ?? new FlySimulation(environment);
  if (!(sim instanceof FlySimulation)) throw new TypeError('server-authoritative FlySimulation required');
  const authored = sim.environment?.meta?.artifactHashes;
  if (!authored || authored.environmentSource !== sim.environment.hash || authored.flyHouseGlb !== sim.environment.glbHash) {
    throw new TypeError('simulation authored artifact hashes required');
  }
  if (environment && (environment.hash !== sim.environment.hash || environment.glbHash !== sim.environment.glbHash)) {
    throw new Error('simulation environment identity mismatch');
  }
  const ownServer = injectedServer === null;
  const server = injectedServer ?? http.createServer();
  const clients = new Set();
  const scheduler = new FixedStepScheduler(sim);
  const protocol = new TelemetryProtocol();
  const metrics = { backpressureDisconnects: 0, protocolDisconnects: 0, lastDisconnectReason: null };
  let timer = null;
  let started = false;
  let listening = false;
  let lastWall = process.hrtime.bigint();

  function disconnect(client, reason) {
    if (!clients.delete(client)) return;
    metrics.lastDisconnectReason = reason;
    if (reason === 'telemetry_backpressure') metrics.backpressureDisconnects += 1;
    if (reason === 'protocol_error') metrics.protocolDisconnects += 1;
    client.socket.end();
  }

  function frameFor(id) {
    const checkpointStatus={...sim.telemetrySnapshot(id,{controller}).checkpointStatus,scheduler:scheduler.status()};
    const snapshot = sim.telemetrySnapshot(id, { lagSeconds: scheduler.lag, controller, checkpointStatus });
    return {
      flyId: id,
      sequence: sim.tick,
      identity: { environmentHash: sim.environment.hash, glbHash: sim.environment.glbHash },
      state: {
        room: snapshot.room,
        position: snapshot.transform.position,
        orientation: snapshot.transform.orientation,
        contact: snapshot.contact,
        sensors: snapshot.sensorSummary,
        motor: snapshot.motor,
        controllerState: snapshot.controller.state,
        checkpointStatus: snapshot.checkpointStatus
      },
      metadata: { controller: snapshot.controller.name, version: snapshot.controller.version, provenance: snapshot.controller.provenance, units: 'SI' },
      lag: scheduler.status()
    };
  }

  function send(client) {
    for (const id of sim.listFlyIds()) {
      try {
        const telemetry = new WebSocketTelemetryAdapter({
          send: (encoded) => {
            const accepted = client.socket.write(wsFrame(encoded, maxMessage));
            if (!accepted) throw new Error('telemetry_backpressure');
          }
        }, protocol, { maxLag: Infinity });
        telemetry.send(frameFor(id));
      } catch (error) {
        disconnect(client, error.message === 'telemetry_backpressure' ? 'telemetry_backpressure' : 'protocol_error');
        return;
      }
    }
  }

  function onUpgrade(req, socket) {
    if (!validUpgrade(req, { allowedHosts, allowedOrigins })) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const client = { socket, buffer: Buffer.alloc(0), fragmented: null, fragmentedOpcode: null };
    clients.add(client);
    socket.on('data', (chunk) => {
      try {
        const result = parseWebSocketFrames(chunk, { buffer: client.buffer, fragmented: client.fragmented, fragmentedOpcode: client.fragmentedOpcode, maxFrame, maxMessage, maxBuffer });
        client.buffer = result.buffer;
        client.fragmented = result.fragmented;
        client.fragmentedOpcode = result.fragmentedOpcode;
        for (const message of result.messages) {
          if (message.opcode === 8) { socket.write(Buffer.from([0x88, 0])); socket.end(); }
          else if (message.opcode === 9 && message.payload.length <= 125) socket.write(Buffer.concat([Buffer.from([0x8a, message.payload.length]), message.payload]));
        }
      } catch {
        disconnect(client, 'protocol_error');
      }
    });
    socket.on('close', () => clients.delete(client));
    socket.on('error', () => clients.delete(client));
    setImmediate(() => send(client));
  }

  server.on('upgrade', onUpgrade);

  function tick() {
    const now = process.hrtime.bigint();
    const elapsed = Number(now - lastWall) / 1e9;
    lastWall = now;
    const startedAt = process.hrtime.bigint();
    scheduler.advanceWallClock(elapsed);
    scheduler.recordProcessing?.(Number(process.hrtime.bigint() - startedAt) / 1e9);
    for (const client of clients) send(client);
  }

  async function start() {
    if (started) return service;
    started = true;
    lastWall = process.hrtime.bigint();
    timer = setInterval(tick, intervalMs);
    timer.unref?.();
    if (injectedServer) { listening = Boolean(server.listening); return service; }
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen({ host, port }, () => { listening = true; resolve(); });
    });
    return service;
  }

  async function stop() {
    if (!started) return;
    started = false;
    if (timer) clearInterval(timer);
    timer = null;
    for (const client of clients) client.socket.end();
    clients.clear();
    if (ownServer && server.listening) await new Promise((resolve) => server.close(resolve));
    listening = false;
  }

  async function probeUpgrade({ host: requestHost = '127.0.0.1', origin = null } = {}) {
    return validUpgrade({ url: FLY_SPECTATOR_PATH, headers: {
      host: requestHost, origin, upgrade: 'websocket', connection: 'Upgrade',
      'sec-websocket-version': '13', 'sec-websocket-key': crypto.randomBytes(16).toString('base64')
    } }, { allowedHosts, allowedOrigins });
  }

  const service = {
    simulation: sim,
    server,
    start,
    stop,
    address: () => server.address(),
    probeUpgrade,
    status: () => ({ running: started, listening, host, authority: 'server-authoritative', protocol: 'telemetry-1', scheduler: scheduler.status(), clients: clients.size, metrics: { ...metrics } })
  };
  return service;
}
