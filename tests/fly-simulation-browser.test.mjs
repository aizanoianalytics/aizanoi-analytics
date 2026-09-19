import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
let chromium;
try { ({ chromium } = await import('playwright')); } catch { /* CI validate intentionally has no browser dependency. */ }
import { BodyState, Vec3, createFlyWorldEnvironmentAdapter } from '../frontend/labs/fly-simulation/index.js';
import { createFlySimulationService } from '../services/fly-simulation/service.mjs';

test('real Chromium spectator receives telemetry and cannot mutate authority', { skip: !chromium }, async (t) => {
  const environment = createFlyWorldEnvironmentAdapter({ hash:'browser-env', schemaVersion:'1', raycast:()=>({distance:1,point:[0,0,0],normal:[0,1,0]}), roomAt:()=> 'room' });
  const service = createFlySimulationService({ environment, port:0, intervalMs:10, allowedOrigins:[/^http:\/\/127\.0\.0\.1:/] });
  service.simulation.addFly({ flyId:'browser-fly', body:new BodyState({position:new Vec3(0,1,0)}) });
  await service.start(); t.after(()=>service.stop());
  const pageServer = http.createServer((_, response) => response.end('<script>window.frames=[]; const ws=new WebSocket("ws://127.0.0.1:' + service.address().port + '/spectator/telemetry-1"); ws.onmessage=e=>frames.push(JSON.parse(e.data));</script>'));
  await new Promise(resolve => { pageServer.listen(0, '127.0.0.1', resolve); }); t.after(() => pageServer.close());
  const browser = await chromium.launch({headless:true}); t.after(()=>browser.close());
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${pageServer.address().port}/`);
  await page.waitForFunction(() => window.frames.length > 1);
  const before = service.simulation.getFly('browser-fly').body.position.toJSON();
  await page.keyboard.press('ArrowUp');
  const observed = await page.evaluate(() => ({ count:frames.length, version:frames.at(-1).version, authority: typeof window.FlySimulation, cameraInput:frames.at(-1).state.position }));
  assert.equal(observed.version,'telemetry-1'); assert.equal(observed.authority,'undefined'); assert.equal(service.simulation.getFly('browser-fly').body.position.x, before[0]); assert.equal(service.simulation.getFly('browser-fly').body.position.z, before[2]);
});
