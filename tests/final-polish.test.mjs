import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
const read=(p)=>readFileSync(p,'utf8');
const index=read('frontend/index.html');
const chat=read('frontend/js/chat.js');
const os=read('frontend/js/os-v2.js');
const brick=read('frontend/games/brick.js');
const rome=read('frontend/ancient-cities/rome-410-476/js/app.js');
const athens=read('frontend/ancient-cities/athens-450-430/js/app.js');
const ru=read('frontend/ancient-cities/rome-410-476/data/urban-fabric.js');
const au=read('frontend/ancient-cities/athens-450-430/data/urban-fabric.js');
const historic=read('frontend/historic-world/index.html');

test('window lifecycle removes document-level drag listeners and clamps after drag',()=>{
  assert.match(index,/w\.cleanup = \(\) =>/);
  assert.match(index,/typeof w\.cleanup === 'function'/);
  assert.match(os,/requestAnimationFrame\(clampWindows\)/);
});

test('OS observer batches newly-added interactive nodes instead of full rescans',()=>{
  assert.match(os,/pendingInteractiveNodes/);
  assert.match(os,/scheduleInteractive/);
  assert.match(os,/mutationFrame = requestAnimationFrame/);
});

test('AI composer remains multiline with bounded timeout retry and abort protection',()=>{
  assert.match(index,/<textarea id="chat-input"/);
  assert.match(chat,/!e\.isComposing/);
  assert.match(chat,/!e\.shiftKey/);
  assert.match(chat,/80000/);
  assert.match(chat,/AbortController/);
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
  assert.match(athens,/hephaisteionHero/); assert.match(athens,/dionysusTheatreHero/); assert.match(athens,/stoaHero/); assert.doesNotMatch(athens,/building\.id === 'pantheon'/);
});

test('urban fabric uses district-specific style profiles without upgrading evidence',()=>{
  assert.match(ru,/REGION_STYLE/); assert.match(ru,/districtStyle/); assert.match(au,/DISTRICT_STYLE/); assert.match(au,/districtStyle/);
  assert.match(ru,/level: 'plausible'/); assert.match(au,/level: 'plausible'/);
});

test('Historic World externalizes stable presentation/runtime boundaries without renderer rewrite',()=>{
  assert.ok(existsSync('frontend/historic-world/style.css'));
  assert.ok(existsSync('frontend/historic-world/app.js'));
  assert.match(historic,/\.\/style\.css/);
  assert.match(historic,/\.\/app\.js/);
  assert.doesNotMatch(historic,/data:image\/jpeg;base64/);
  assert.match(historic,/texier-survey\.jpg/);
  assert.ok(existsSync('frontend/historic-world/assets/texier-survey.jpg'));
  assert.ok(statSync('frontend/historic-world/app.js').size > 80_000,'Historic World runtime extraction unexpectedly small');
  assert.ok(statSync('frontend/historic-world/style.css').size > 15_000,'Historic World style extraction unexpectedly small');
});

test('social metadata and operational error documents are published',()=>{
  assert.match(index,/property="og:image"/);
  assert.match(index,/twitter:card/);
  assert.match(index,/aizanoi-og\.png/);
  for(const path of ['frontend/404.html','frontend/500.html','frontend/503.html','frontend/assets/branding/aizanoi-og.svg']) assert.ok(existsSync(path),`${path} missing`);
});
