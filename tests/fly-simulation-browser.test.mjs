import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, statSync, createReadStream } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
let chromium;
try { ({ chromium } = await import('playwright')); } catch { /* Browser dependency is optional in lightweight validation. */ }
import { BodyState, Vec3, createFlyWorldEnvironmentAdapter } from '../frontend/labs/fly-simulation/index.js';
import { createFlySimulationService } from '../services/fly-simulation/service.mjs';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const worldPath = '/frontend/labs/fly-world/';
const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary' };

function staticWorldServer() {
  return http.createServer((request, response) => {
    const relative = request.url === worldPath || request.url === `${worldPath}index.html`
      ? `${worldPath}index.html` : request.url;
    const file = join(repoRoot, normalize(relative.slice(1)));
    if (!file.startsWith(repoRoot) || !statSafe(file)) { response.writeHead(404); response.end(); return; }
    if (file.endsWith('index.html')) {
      const html = readFileSync(file, 'utf8');
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(html);
      return;
    }
    response.writeHead(200, { 'content-type': contentTypes[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  });
}
function statSafe(file) { try { return statSync(file).isFile(); } catch { return false; } }

test('real Fly House Chromium spectator renders authoritative telemetry read-only', { skip: !chromium }, async (t) => {
  const environment = createFlyWorldEnvironmentAdapter({
    hash: 'browser-env', glbHash: 'browser-glb', schemaVersion: '1',
    raycast: (origin, direction, maxDistance=100) => {
      const dy = direction.y ?? direction[1];
      if (dy >= 0) return null;
      const distance = (origin.y ?? origin[1]) / -dy;
      if (distance > maxDistance) return null;
      return {
        distance,
        point: [(origin.x ?? origin[0]) + (direction.x ?? direction[0]) * distance, 0, (origin.z ?? origin[2]) + (direction.z ?? direction[2]) * distance],
        normal: [0, 1, 0],
        surfaceId: 'floor'
      };
    },
    roomAt: () => 'fly-house'
  });
  const service = createFlySimulationService({ environment, port: 0, intervalMs: 250, allowedOrigins: [/^http:\/\/127\.0\.0\.1:/] });
  service.simulation.addFly({ flyId: 'browser-fly', body: new BodyState({ position: new Vec3(0, 1, 0), velocity: new Vec3(0.5, 0, 0) }) });
  await service.start();
  const pageServer = staticWorldServer(`ws://127.0.0.1:${service.address().port}/spectator/telemetry-1`);
  await new Promise((resolve) => pageServer.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); await new Promise((resolve) => pageServer.close(resolve)); await service.stop(); });
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await page.addInitScript((url) => { window.__FLY_TELEMETRY_CONFIG__ = { url }; }, `ws://127.0.0.1:${service.address().port}/spectator/telemetry-1`);
  await page.goto(`http://127.0.0.1:${pageServer.address().port}/frontend/labs/fly-world/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#simulation-status')?.textContent.includes('Telemetry active'), null, { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#simulation-status')?.textContent && window.__FLY_SCENE__?.getObjectByName('TELEMETRY_SPECTATOR_FLY'), null, { timeout: 30000 });

  const initial = await page.evaluate(() => {
    const mesh = window.__FLY_SCENE__.getObjectByName('TELEMETRY_SPECTATOR_FLY');
    return { mesh: mesh.position.toArray(), camera: window.FLY_DEBUG.camera.position.toArray(), frame: window.__FLY_SPECTATOR_BRIDGE__.frames.at(-1), globals: { simulation: typeof window.FlySimulation, scheduler: typeof window.FixedStepScheduler, controller: typeof window.HeuristicTestController } };
  });
  await page.waitForFunction(({ position, sequence }) => {
    const mesh = window.__FLY_SCENE__?.getObjectByName('TELEMETRY_SPECTATOR_FLY');
    const latest = window.__FLY_SPECTATOR_BRIDGE__?.frames.at(-1);
    if (!mesh || !latest || latest.sequence <= sequence) return false;
    return mesh.position.toArray().some((value, index) => Math.abs(value - position[index]) > 1e-5);
  }, { position:initial.mesh, sequence:initial.frame.sequence }, { timeout:10000 });
  const moved = await page.evaluate(() => window.__FLY_SCENE__.getObjectByName('TELEMETRY_SPECTATOR_FLY').position.toArray());
  assert.notDeepEqual(moved, initial.mesh, 'telemetry-rendered mesh should move from authoritative frames');
  assert.deepEqual(initial.globals, { simulation: 'undefined', scheduler: 'undefined', controller: 'undefined' });
  assert.equal(initial.frame.flyId, 'browser-fly');

  service.simulation.getFly('browser-fly').body.velocity = new Vec3(0, 0, 0);
  const beforeAuthority = service.simulation.getFly('browser-fly').body.position.toJSON();
  await page.mouse.click(512, 384);
  await page.keyboard.down('w');
  await page.waitForTimeout(100);
  await page.keyboard.up('w');
  const afterAuthority = service.simulation.getFly('browser-fly').body.position.toJSON();
  assert.equal(afterAuthority[0], beforeAuthority[0], 'observer input must not control authoritative x');
  assert.equal(afterAuthority[2], beforeAuthority[2], 'observer input must not control authoritative z');
  const cameraAfterInput = await page.evaluate(() => window.FLY_DEBUG.camera.position.toArray());
  assert.notDeepEqual(cameraAfterInput, initial.camera, 'observer camera/input remains local visualization state');

  const protectedPosition = await page.evaluate(() => {
    const bridge = window.__FLY_SPECTATOR_BRIDGE__;
    const mesh = window.__FLY_SCENE__.getObjectByName('TELEMETRY_SPECTATOR_FLY');
    bridge.ingest({ version: 'telemetry-1', sequence: -1, state: { position: [999, 999, 999] } });
    bridge.ingest({ version: 'not-telemetry', sequence: 999, state: { position: [999, 999, 999] } });
    bridge.render(mesh, 1);
    return mesh.position.toArray();
  });
  assert.notDeepEqual(protectedPosition, [999, 999, 999], 'malformed/out-of-order frames must not overwrite visualization');

  const socketState = await page.evaluate(() => ({ readyState: window.__FLY_TELEMETRY_SOCKET__.readyState, hasIngest: typeof window.__FLY_SPECTATOR_BRIDGE__.ingest, hasCommand: typeof window.__FLY_SPECTATOR_BRIDGE__.sendCommand }));
  assert.equal(socketState.hasIngest, 'function');
  assert.equal(socketState.hasCommand, 'undefined');
  await page.close();
  assert.equal(service.status().clients, 0, 'pagehide must close the telemetry socket');
});
