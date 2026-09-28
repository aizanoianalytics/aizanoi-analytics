import { mkdirSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { chromium } from 'playwright';

// Mean luma of a PNG, decoded with stdlib only. This is the guard that stops a
// black "hero" frame from being published as visual evidence; a fragile guess
// is worse than none, so it decodes the real pixels.
function meanLuma(file) {
  const png = readFileSync(file);
  if (png.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file} is not a PNG`);
  let pos = 8, width = 0, height = 0, depth = 0, colour = 0;
  const idat = [];
  while (pos < png.length) {
    const len = png.readUInt32BE(pos);
    const type = png.toString('ascii', pos + 4, pos + 8);
    const data = png.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      depth = data[8]; colour = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || (colour !== 2 && colour !== 6)) {
    throw new Error(`${file} has an unsupported PNG format (depth ${depth}, colour ${colour})`);
  }
  const channels = colour === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const prev = Buffer.alloc(stride);
  const line = Buffer.alloc(stride);
  let sum = 0, count = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    raw.copy(line, 0, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc) ? b : c;
      }
      line[i] = v & 255;
    }
    line.copy(prev);
    for (let x = 0; x < width; x++) {
      const i = x * channels;
      sum += 0.299 * line[i] + 0.587 * line[i + 1] + 0.114 * line[i + 2];
      count++;
    }
  }
  return sum / count;
}

const base=process.env.ANCIENT_WORLD_BASE_URL||'http://127.0.0.1:4173';
const out='artifacts/final-visual-review';mkdirSync(out,{recursive:true});
const worlds=[['aizanoi','/worlds/aizanoi-225/','temple'],['rome','/worlds/rome-410-476/','colosseum'],['athens','/worlds/athens-450-430/','parthenon'],['iga','/worlds/iga-airport/','tower']];
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
for(const [id,path,hero] of worlds){
  const page=await browser.newPage({viewport:{width:900,height:600}});
  await page.goto(`${base}${path}`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__WORLD_BOOTSTRAP__?.ready===true||window.__WORLD_DEBUG__?.ready===true,null,{timeout:20000});
  // The Enter button disables itself while the runtime module is imported, so
  // a bare evaluate().click() is swallowed silently and the world never loads.
  // Wait for it to be actionable, then click it as a real user would.
  await page.waitForSelector('#btn-enter', { timeout: 20000 });
  await page.waitForFunction(()=>{ const b=document.getElementById('btn-enter'); return b && !b.disabled; }, null, { timeout: 20000 });
  await page.locator('#btn-enter').click({ timeout: 30000 });
  await page.waitForFunction(()=>window.__WORLD_DEBUG__?.ready===true,null,{timeout:90000});
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>window.__WORLD_DEBUG__?.player?.controlsEnabled===true,null,{timeout:15000});
  // Settle past the 0.8s cinematic fade before judging pixels — mid-fade frames
  // read black. Aizanoi never hides .cinematic-title, so this is best-effort:
  // the luma gate below is the check that actually has to hold.
  await page.waitForFunction(()=>{const ov=document.querySelector('.cinematic-title');return !ov||getComputedStyle(ov).display==='none';},null,{timeout:8000}).catch(()=>{});
  await page.waitForTimeout(2500);
  await page.evaluate((target)=>window.__WORLD_DEBUG__.teleport(target),hero);
  // Wait for the pose to land, then wait for the frame loop to actually draw
  // it. A flat sleep here is a race: the screenshot is taken mid-frame and Rome
  // rendered a 96%-black "hero" capture that way, repeatedly, for the same
  // code path that works when sampled slightly later.
  await page.waitForFunction((target)=>{
    const last=window.__WORLD_LAST_TELEPORT__;
    return last===target && window.__WORLD_DEBUG__.player?.controlsEnabled===true;
  },hero,{timeout:15000,polling:50});
  // Re-frame once the loop has drawn, and keep re-framing while the frame is
  // still black. The pose blender and the first post-jump frame can settle in
  // either order, so the only honest signal is the pixel measurement itself.
  let luma=0;
  for(let attempt=1;attempt<=6;attempt++){
    await page.waitForTimeout(500);
    await page.screenshot({path:`${out}/${id}-hero.png`,fullPage:false,timeout:120000});
    luma=meanLuma(`${out}/${id}-hero.png`);
    if(luma>=24) break;
  }
  // A hero capture that is almost entirely black is a broken capture, not a
  // dark scene. It must not be published as visual evidence. The pixels are
  // measured from the saved PNG: reading a WebGL canvas back with drawImage
  // yields 0 unless preserveDrawingBuffer is on.
  if(luma<24){
    throw new Error(`${id} hero capture is effectively black (mean luma ${luma.toFixed(1)} after 6 samples); the capture is broken, not the world`);
  }
  console.log(`${id} hero captured (mean luma ${luma.toFixed(1)})`);
  await page.close();
}
await browser.close();console.log('Unified Worlds visual captures written');
