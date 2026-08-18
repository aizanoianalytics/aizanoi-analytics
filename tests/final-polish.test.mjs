import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=(p)=>readFileSync(p,'utf8');
const index=read('frontend/index.html');
const os=read('frontend/js/os-v2.js');
const brick=read('frontend/games/brick.js');
const rome=read('frontend/ancient-cities/rome-410-476/js/app.js');
const athens=read('frontend/ancient-cities/athens-450-430/js/app.js');
const ru=read('frontend/ancient-cities/rome-410-476/data/urban-fabric.js');
const au=read('frontend/ancient-cities/athens-450-430/data/urban-fabric.js');

test('window lifecycle removes document-level drag listeners and clamps after drag',()=>{
  assert.match(index,/w\.cleanup = \(\) =>/);
  assert.match(index,/typeof w\.cleanup === 'function'/);
  assert.match(os,/installWindowLifecycleBridge/);
  assert.match(os,/requestAnimationFrame\(clampWindows\)/);
});

test('OS observer batches only newly-added interactive nodes instead of full rescans',()=>{
  assert.match(os,/pendingInteractiveNodes/);
  assert.match(os,/scheduleInteractive/);
  assert.match(os,/mutationFrame = requestAnimationFrame/);
  assert.match(os,/batch\.forEach\(markInteractive\)/);
});

test('AI composer supports multiline, timeout, retry and abort-on-close protection',()=>{
  assert.match(index,/<textarea id="chat-input"/);
  assert.match(index,/!e\.shiftKey/);
  assert.match(os,/CHAT_TIMEOUT_MS/);
  assert.match(os,/installChatFetchGuard/);
  assert.match(os,/data-chat-action="retry"/);
  assert.match(os,/abortChatRequest/);
});

test('Brick Breaker uses a capped requestAnimationFrame fixed-step loop',()=>{
  assert.match(brick,/FRAME_MS=1000\/60/);
  assert.match(brick,/requestAnimationFrame\(frame\)/);
  assert.match(brick,/steps<4/);
  assert.match(brick,/stopLoop\(\)/);
  assert.doesNotMatch(brick,/setInterval\(tick,16\)/);
});

test('Rome and Athens have city-specific final hero/detail vocabulary',()=>{
  assert.match(rome,/ellipseSurface/); assert.match(rome,/seatingRings/); assert.match(rome,/arcadeCount/); assert.match(rome,/Arena floor \+ podium wall/); assert.match(rome,/Forum \/ market corridors/);
  assert.doesNotMatch(rome,/mastCount/);
  assert.match(athens,/hephaisteionHero/); assert.match(athens,/dionysusTheatreHero/); assert.match(athens,/stoaHero/); assert.doesNotMatch(athens,/building\.id === 'pantheon'/);
});

test('urban fabric uses district-specific style profiles without upgrading evidence',()=>{
  assert.match(ru,/REGION_STYLE/); assert.match(ru,/districtStyle/); assert.match(au,/DISTRICT_STYLE/); assert.match(au,/districtStyle/);
  assert.match(ru,/level: 'plausible'/); assert.match(au,/level: 'plausible'/);
});
