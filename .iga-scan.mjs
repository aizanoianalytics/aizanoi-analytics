
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
await p.goto('http://127.0.0.1:4211/iga/?scan1='+Date.now(),{waitUntil:'networkidle'});
await p.locator('#enter').click();await p.waitForTimeout(900);
const info=await p.evaluate(()=>{
  const cap=window.__caps.find(c=>c.len>200000)||window.__caps[0];
  if(!cap) return 'no capture';
  const d=cap.data;
  // vertices are 9 floats: pos3, normal3, color3
  let minX=1e9,maxX=-1e9,minZ=1e9,maxZ=-1e9,maxY=-1e9;
  const pinkTop=[];
  for(let i=0;i+8<d.length;i+=9){
    const x=d[i],y=d[i+1],z=d[i+2],r=d[i+6],g=d[i+7],bl=d[i+8];
    if(x<minX)minX=x; if(x>maxX)maxX=x;
    if(z<minZ)minZ=z; if(z>maxZ)maxZ=z;
    if(y>maxY)maxY=y;
  }
  return {vertices:(d.length/9)|0, minX:+minX.toFixed(1),maxX:+maxX.toFixed(1),
          minZ:+minZ.toFixed(1),maxZ:+maxZ.toFixed(1),maxY:+maxY.toFixed(1)};
});
console.log('base buffer scan:',JSON.stringify(info));
await b.close();
