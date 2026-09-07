import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const base=process.env.ANCIENT_WORLD_BASE_URL||'http://127.0.0.1:4173';
const out='artifacts/final-visual-review';mkdirSync(out,{recursive:true});
const worlds=[['aizanoi','/worlds/aizanoi-225/','temple'],['rome','/worlds/rome-410-476/','colosseum'],['athens','/worlds/athens-450-430/','parthenon'],['iga','/worlds/iga-airport/','tower']];
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
for(const [id,path,hero] of worlds){const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(`${base}${path}`,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__WORLD_DEBUG__?.ready,null,{timeout:20000});await page.locator('#btn-enter').click();await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__WORLD_DEBUG__?.player?.controlsEnabled===true,null,{timeout:5000});await page.evaluate((hero)=>window.__WORLD_DEBUG__.teleport(hero),hero);await page.waitForTimeout(500);await page.screenshot({path:`${out}/${id}-hero.png`,fullPage:false});await page.close();}
await browser.close();console.log('Unified Worlds visual captures written');
