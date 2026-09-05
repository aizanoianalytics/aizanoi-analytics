
import {chromium} from 'playwright';
const b=await chromium.launch({headless:true});
const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto('http://127.0.0.1:4211/iga/?probe4='+Date.now(),{waitUntil:'networkidle'});
await p.locator('#enter').click();await p.waitForTimeout(700);
const info=await p.evaluate(()=>{
  const d=window.__ANCIENT_WORLD_DEBUG__;
  const l=(d.landmarks||[]).find(x=>x.id==='checkin-hall-mark');
  return {found:!!l, framing:l?.framing, w:l?.w, type:l?.type, view:d.teleportViews['checkin-hall-mark']};
});
console.log(JSON.stringify(info));
await b.close();
