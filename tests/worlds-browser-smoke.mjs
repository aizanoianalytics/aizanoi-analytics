import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base=process.env.ANCIENT_WORLD_BASE_URL||'http://127.0.0.1:4173';
const worlds=[
  {id:'aizanoi',path:'/worlds/aizanoi-225/',hero:'temple'},
  {id:'rome',path:'/worlds/rome-410-476/',hero:'colosseum'},
  {id:'athens',path:'/worlds/athens-450-430/',hero:'parthenon'},
  {id:'iga',path:'/worlds/iga-airport/',hero:'tower'},
];
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
async function open(context,spec){
  const page=await context.newPage();const errors=[];
  page.on('pageerror',(e)=>errors.push(String(e)));
  page.on('console',(m)=>{if(m.type()==='error')errors.push(m.text());});
  const response=await page.goto(`${base}${spec.path}`,{waitUntil:'networkidle'});
  assert.ok(response?.ok(),`${spec.id}: HTTP ${response?.status()}`);
  await page.waitForFunction(()=>window.__WORLD_BOOTSTRAP__?.ready===true||window.__WORLD_DEBUG__?.ready===true,null,{timeout:20000});
  assert.equal(await page.locator('canvas#viewport').count(),1,`${spec.id}: WebGL canvas missing`);
  return{page,errors};
}
async function position(page){return page.evaluate(()=>window.__WORLD_DEBUG__.player);}
async function enter(page,spec){
  await page.locator('#btn-enter').click();
  await page.waitForFunction(()=>window.__WORLD_DEBUG__?.ready===true,null,{timeout:30000});
  await page.waitForFunction(()=>document.documentElement.dataset.worldReady==='true',null,{timeout:30000});
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>window.__WORLD_DEBUG__?.player?.controlsEnabled===true,null,{timeout:5000});
  assert.ok(await page.locator('.hud-top').count(),`${spec.id}: HUD missing`);
}
for(const spec of worlds){
  const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});const opened=await open(context,spec);const page=opened.page;
  await enter(page,spec);
  const before=await position(page);await page.keyboard.down('w');assert.equal(await page.evaluate(()=>window.__WORLD_DEBUG__.step(0.25)),true,`${spec.id}: deterministic movement step unavailable`);await page.keyboard.up('w');const after=await position(page);const d=Math.hypot(after.x-before.x,after.z-before.z);assert.ok(d>0.05&&d<20,`${spec.id}: WASD movement unstable (${d})`);
  assert.equal(await page.evaluate((id)=>window.__WORLD_DEBUG__.teleport(id),spec.hero),true,`${spec.id}: hero teleport failed`);
  assert.equal(await page.evaluate(()=>window.__WORLD_DEBUG__.toggleEvidence()),true,`${spec.id}: evidence did not enable`);assert.equal(await page.evaluate(()=>window.__WORLD_DEBUG__.toggleEvidence()),false,`${spec.id}: evidence did not disable`);
  assert.deepEqual(opened.errors,[],`${spec.id}: browser errors: ${opened.errors.join(' | ')}`);await context.close();
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,serviceWorkers:'block'});const mo=await open(mobile,spec);const mp=mo.page;await enter(mp,spec);await mp.waitForFunction(()=>getComputedStyle(document.querySelector('#mobile-controls')).display!=='none');const pad=await mp.locator('#movePad').boundingBox();assert.ok(pad,`${spec.id}: mobile joystick missing`);const box=await mp.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));assert.ok(box.sw<=box.cw+2,`${spec.id}: mobile horizontal overflow`);assert.deepEqual(mo.errors,[],`${spec.id}: mobile errors: ${mo.errors.join(' | ')}`);await mobile.close();
}
await browser.close();console.log('Unified Worlds desktop/mobile WebGL smoke passed');
