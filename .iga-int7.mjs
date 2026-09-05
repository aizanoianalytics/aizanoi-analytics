
import {chromium} from 'playwright';
const b=await chromium.launch({headless:true});
const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto('http://127.0.0.1:4211/iga/?int7='+Date.now(),{waitUntil:'networkidle'});
await p.locator('#enter').click();await p.waitForTimeout(800);
for(const [tag,id] of [['board','flight-board'],['gate','gate-pod-east'],['lounge','lounge-east']]){
  await p.evaluate((id)=>{const d=window.__ANCIENT_WORLD_DEBUG__;d.teleport(id,{lock:false});},id);
  await p.waitForTimeout(800);
  await p.screenshot({path:`/tmp/iga-${tag}.png`,timeout:60000});
}
console.log('done');
await b.close();
