
import {chromium} from 'playwright';
const b=await chromium.launch({headless:true, args:['--autoplay-policy=no-user-gesture-required']});
const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[];
p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://127.0.0.1:4211/iga/?aud1='+Date.now(),{waitUntil:'networkidle'});
await p.locator('#enter').click();await p.waitForTimeout(600);
await p.evaluate(()=>{const d=window.__ANCIENT_WORLD_DEBUG__;d.teleport('checkin-hall-mark',{lock:false});});
await p.waitForTimeout(400);
// find ambience button (drawer) or #soundBtn
const btn = await p.evaluate(()=>{
  const b=document.querySelector('#soundBtn')||document.querySelector('[data-audio]')||Array.from(document.querySelectorAll('button')).find(x=>/AMBIENCE|Sound/i.test(x.textContent));
  return b?b.id||b.textContent.trim():null;
});
console.log('audio button:',btn);
await p.evaluate(()=>{
  const b=document.querySelector('#soundBtn')||Array.from(document.querySelectorAll('button')).find(x=>/AMBIENCE|Sound/i.test(x.textContent));
  if(b) b.click();
});
await p.waitForTimeout(600);
const after = await p.evaluate(()=>{
  const b=Array.from(document.querySelectorAll('button')).find(x=>/AMBIENCE|Sound/i.test(x.textContent));
  return b?b.textContent.trim():null;
});
console.log('after click:',after,'errors:',errs.length?errs:'none');
await b.close();
