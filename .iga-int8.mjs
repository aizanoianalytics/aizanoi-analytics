
import {chromium} from 'playwright';
const b=await chromium.launch({headless:true});
const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto('http://127.0.0.1:4211/iga/?int8='+Date.now(),{waitUntil:'networkidle'});
await p.locator('#enter').click();await p.waitForTimeout(700);
await p.evaluate(()=>{const d=window.__ANCIENT_WORLD_DEBUG__;d.teleport('flight-board',{lock:false});});
await p.waitForTimeout(800);
const s=await p.evaluate(()=>{const d=window.__ANCIENT_WORLD_DEBUG__;return {x:d.player.x,z:d.player.z,yaw:d.player.yaw};});
await p.screenshot({path:'/tmp/iga-board2.png',timeout:60000});
console.log('player:',JSON.stringify(s));
await b.close();
