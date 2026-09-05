
import {chromium} from 'playwright';
const b=await chromium.launch({headless:true});
const ctx=await b.newContext({viewport:{width:1440,height:900}});
await ctx.addInitScript(()=>{
  window.__caps=[];
  const origBD=WebGLRenderingContext.prototype.bufferData;
  WebGLRenderingContext.prototype.bufferData=function(t,data,usage){
    if(t===this.ARRAY_BUFFER && data && data.length>10000){
      window.__caps.push({len:data.length, data:Array.from(data)});
    }
    return origBD.call(this,t,data,usage);
  };
});
const p=await ctx.newPage();
await p.goto('http://127.0.0.1:4211/iga/?scan2='+Date.now(),{waitUntil:'networkidle'});
await p.locator('#enter').click();await p.waitForTimeout(900);
const info=await p.evaluate(()=>{
  const cap=window.__caps.find(c=>c.len>100000);
  const d=cap.data;
  const verts=[];
  for(let i=0;i+8<d.length;i+=9){
    verts.push([d[i],d[i+1],d[i+2],d[i+6],d[i+7],d[i+8]]);
  }
  // terminal region: |x|<420, z in [-160,240], y in [0,40]
  const term=verts.filter(v=>Math.abs(v[0])<420 && v[2]>-160 && v[2]<240 && v[1]>=-1 && v[1]<40);
  // count vertices exactly on the south plane z=-154.8±1.5
  const south=term.filter(v=>Math.abs(v[2]+154.8)<1.5);
  // count on glass plane z=-143±1.5
  const glass=term.filter(v=>Math.abs(v[2]+143)<1.5);
  // count vertices ABOVE 8m (glass/panels/mullions area y 8..30)
  const high=term.filter(v=>v[1]>8 && v[1]<31);
  // and south-facing high vertices (the visible facade) y>8, z<-100
  const facade=verts.filter(v=>v[1]>8 && v[1]<31 && v[2]>-160 && v[2]<-90 && Math.abs(v[0])<420);
  return {termVerts:term.length, southPlane:south.length, glassPlane:glass.length,
          highVerts:high.length, facadeVerts:facade.length,
          maxY:+Math.max(...term.map(v=>v[1])).toFixed(1)};
});
console.log('terminal scan:',JSON.stringify(info));
await b.close();
