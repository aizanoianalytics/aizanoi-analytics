import { ANCIENT_MATERIALS as M } from './materials.js';

const mat = (name, fallback = 'brick') => M[name] || M[fallback] || [0.5, 0.5, 0.5];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function colourFor(record) {
  if (record?.material && M[record.material]) return M[record.material];
  const state = record?.state;
  if (state === 'new') return M.marbleLight;
  if (state === 'standing' || state === 'repaired') return M.marble;
  if (state === 'fortified') return M.wall;
  if (state === 'damaged' || state === 'spoliated') return M.brickDark;
  if (state === 'ruined' || state === 'burial') return M.rubble;
  return M.brick;
}

function footprint(scene, b, pad = 0.15) {
  if (b.noCollision) return;
  scene.collider(b.x, b.z, Math.max(1, (b.w || 8) - pad), Math.max(1, (b.d || 8) - pad), b.rot || 0, b.id || b.type || 'building');
}

function genericHouse(scene, b) {
  const c = colourFor(b);
  const h = Math.max(3, b.h || 7);
  scene.box(b.x, 0, b.z, b.w || 12, h * 0.72, b.d || 10, c, b.rot || 0);
  scene.roof(b.x, h * 0.72, b.z, b.w || 12, Math.max(1.5, h * 0.28), b.d || 10, M.roof, b.rot || 0);
  footprint(scene, b);
}

function shop(scene, b) {
  genericHouse(scene, b);
  const rot = b.rot || 0;
  const front = scene.localPoint(b.x, b.z, 0, -(b.d || 10) * 0.51, rot);
  scene.box(front[0], 0.6, front[1], Math.max(2.5, (b.w || 12) * 0.42), 1.6, 0.35, M.timber, rot);
  scene.box(front[0], 2.35, front[1], Math.max(3.2, (b.w || 12) * 0.62), 0.16, 1.7, M.red, rot);
}

function villa(scene, b) {
  const c = colourFor(b);
  const w = b.w || 24, d = b.d || 20, h = Math.max(5, b.h || 8);
  scene.box(b.x, 0, b.z, w, h * 0.62, d, c, b.rot || 0);
  scene.box(b.x, h * 0.62, b.z, w * 0.72, h * 0.22, d * 0.72, mat('plaster'), b.rot || 0);
  scene.roof(b.x, h * 0.84, b.z, w * 0.78, Math.max(1.4, h * 0.16), d * 0.78, M.roof2, b.rot || 0);
  footprint(scene, b);
}

function temple(scene, b) {
  const c = colourFor(b);
  const w = b.w || 32, d = b.d || 18, h = Math.max(8, b.h || 14), rot = b.rot || 0;
  const baseH = Math.max(0.8, h * 0.11);
  scene.box(b.x, 0, b.z, w + 2.6, baseH, d + 2.6, M.limestone, rot);
  const colH = h * 0.56;
  const colsFront = clamp(Math.round(w / 6), 4, 12);
  const colsSide = clamp(Math.round(d / 5), 3, 9);
  const x0 = -w * 0.42, x1 = w * 0.42, z0 = -d * 0.42, z1 = d * 0.42;
  for (let i = 0; i < colsFront; i++) {
    const lx = x0 + (x1 - x0) * (colsFront === 1 ? 0.5 : i / (colsFront - 1));
    for (const lz of [z0, z1]) {
      const p = scene.localPoint(b.x, b.z, lx, lz, rot);
      scene.column(p[0], baseH, p[1], Math.max(0.38, Math.min(0.8, w / 70)), colH, M.marbleLight);
    }
  }
  for (let i = 1; i < colsSide - 1; i++) {
    const lz = z0 + (z1 - z0) * i / (colsSide - 1);
    for (const lx of [x0, x1]) {
      const p = scene.localPoint(b.x, b.z, lx, lz, rot);
      scene.column(p[0], baseH, p[1], Math.max(0.38, Math.min(0.8, w / 70)), colH, M.marbleLight);
    }
  }
  scene.box(b.x, baseH, b.z, w * 0.58, colH * 0.92, d * 0.54, c, rot);
  scene.box(b.x, baseH + colH, b.z, w * 0.92, 0.75, d * 0.92, M.marble, rot);
  scene.roof(b.x, baseH + colH + 0.72, b.z, w * 0.9, Math.max(2, h * 0.21), d * 0.86, M.marbleLight, rot);
  footprint(scene, b);
}

function basilica(scene, b) {
  const c = colourFor(b), w = b.w || 46, d = b.d || 24, h = Math.max(8, b.h || 14), rot = b.rot || 0;
  scene.box(b.x, 0, b.z, w, h * 0.68, d, c, rot);
  scene.box(b.x, h * 0.68, b.z, w * 0.56, h * 0.18, d * 0.58, M.plaster, rot);
  scene.roof(b.x, h * 0.86, b.z, w * 0.62, h * 0.14, d * 0.64, M.roof2, rot);
  for (const side of [-1, 1]) {
    const p = scene.localPoint(b.x, b.z, 0, side * d * 0.36, rot);
    scene.box(p[0], 0, p[1], w * 0.92, h * 0.38, d * 0.18, M.brick, rot);
  }
  footprint(scene, b);
}

function bath(scene, b) {
  const c = colourFor(b), w = b.w || 70, d = b.d || 55, h = Math.max(8, b.h || 18), rot = b.rot || 0;
  scene.box(b.x, 0, b.z, w, h * 0.42, d, c, rot);
  for (const sx of [-0.28, 0, 0.28]) {
    const p = scene.localPoint(b.x, b.z, sx * w, 0, rot);
    scene.box(p[0], h * 0.42, p[1], w * 0.22, h * 0.32, d * 0.56, M.plaster3, rot);
  }
  scene.roof(b.x, h * 0.74, b.z, w * 0.82, h * 0.13, d * 0.74, M.roof2, rot);
  footprint(scene, b);
}

function theatre(scene, b) {
  const c = colourFor(b), w = b.w || 90, d = b.d || 62, h = Math.max(7, b.h || 20), rot = b.rot || 0;
  const rows = scene.mobile ? 6 : 10;
  for (let i = 0; i < rows; i++) {
    const t = i / Math.max(1, rows - 1);
    const rw = w * (0.38 + t * 0.58);
    const rd = d * (0.16 + t * 0.52);
    const p = scene.localPoint(b.x, b.z, 0, d * (0.16 - t * 0.22), rot);
    scene.box(p[0], i * (h * 0.045), p[1], rw, Math.max(0.5, h * 0.045), rd, i % 2 ? M.limestone2 : c, rot);
  }
  const stage = scene.localPoint(b.x, b.z, 0, -d * 0.4, rot);
  scene.box(stage[0], 0, stage[1], w * 0.72, h * 0.52, d * 0.12, M.limestone, rot);
  footprint(scene, b);
}

function stadium(scene, b) {
  const c = colourFor(b), w = b.w || 90, d = b.d || 220, h = Math.max(5, b.h || 14), rot = b.rot || 0;
  scene.box(b.x, 0.02, b.z, w * 0.55, 0.08, d * 0.9, M.earth, rot);
  for (const side of [-1, 1]) {
    const p = scene.localPoint(b.x, b.z, side * w * 0.35, 0, rot);
    scene.box(p[0], 0, p[1], w * 0.16, h * 0.45, d * 0.92, c, rot);
  }
  footprint(scene, b);
}

function amphitheatre(scene, b) {
  const c = colourFor(b), w = b.w || 120, d = b.d || 95, h = Math.max(16, b.h || 42), rot = b.rot || 0;
  const segments = scene.mobile ? 18 : 28;
  const tiers = scene.mobile ? 2 : 3;
  const tierH = h * 0.24;
  const rx = w * 0.48;
  const rz = d * 0.48;
  const meanRadius = (rx + rz) * 0.5;
  const arcadeSpan = Math.max(3.2, (Math.PI * 2 * meanRadius / segments) * 0.74);
  const pierSpan = Math.max(1.5, arcadeSpan * 0.30);
  const wallDepth = Math.max(2.6, Math.min(w, d) * 0.055);

  scene.box(b.x, 0.02, b.z, w * 0.58, 0.10, d * 0.48, M.earth, rot);
  for (let tier = 0; tier < tiers; tier++) {
    const y = tier * tierH;
    const inset = 1 - tier * 0.035;
    for (let i = 0; i < segments; i++) {
      const angle = i * Math.PI * 2 / segments;
      const p = scene.localPoint(b.x, b.z, Math.cos(angle) * rx * inset, Math.sin(angle) * rz * inset, rot);
      const tangent = rot + angle + Math.PI / 2;
      const material = (i + tier) % 3 === 0 ? M.limestone2 : c;
      scene.box(p[0], y, p[1], pierSpan, tierH * 0.68, wallDepth, material, tangent);
      scene.box(p[0], y + tierH * 0.68, p[1], arcadeSpan, tierH * 0.17, wallDepth * 1.04, M.limestone, tangent);
    }
  }

  const atticY = tiers * tierH;
  const atticH = Math.max(2.8, h - atticY);
  for (let i = 0; i < segments; i++) {
    const angle = i * Math.PI * 2 / segments;
    const p = scene.localPoint(b.x, b.z, Math.cos(angle) * rx * 0.91, Math.sin(angle) * rz * 0.91, rot);
    scene.box(p[0], atticY, p[1], arcadeSpan * 0.78, atticH, wallDepth * 0.92, i % 2 ? M.limestone2 : c, rot + angle + Math.PI / 2);
  }

  const seatingRings = scene.mobile ? 2 : 3;
  for (let i = 0; i < seatingRings; i++) {
    const t = i / Math.max(1, seatingRings - 1);
    scene.ellipseRing(b.x, 0.18 + i * 0.46, b.z, rx * (0.68 - t * 0.08), rz * (0.68 - t * 0.08), 0.42, M.limestone2, scene.mobile ? 18 : 26);
  }
  footprint(scene, b);
}

function dome(scene, b) {
  const c = colourFor(b), w = b.w || 60, d = b.d || w, h = Math.max(14, b.h || 32), r = Math.min(w, d) * 0.38;
  scene.cylinder(b.x, 0, b.z, r, h * 0.46, c, scene.mobile ? 16 : 26);
  const rings = scene.mobile ? 5 : 8;
  for (let i = 0; i < rings; i++) {
    const t = (i + 1) / rings;
    const rr = Math.max(1.8, r * Math.cos(t * Math.PI * 0.5));
    scene.cylinder(b.x, h * 0.46 + i * h * 0.045, b.z, rr, h * 0.055 + 0.06, i % 2 ? M.limestone2 : c, scene.mobile ? 14 : 24);
  }
  footprint(scene, b);
}

function round(scene, b) {
  const c = colourFor(b), radius = Math.max(3, Math.min(b.w || 18, b.d || 18) * 0.5), h = Math.max(6, b.h || 14);
  scene.cylinder(b.x, 0, b.z, radius, h * 0.72, c, scene.mobile ? 14 : 22);
  scene.cylinder(b.x, h * 0.72, b.z, radius * 0.76, h * 0.18, M.limestone2, scene.mobile ? 14 : 22);
  footprint(scene, b);
}

function arch(scene, b) {
  const c = colourFor(b), w = b.w || 22, d = b.d || 10, h = Math.max(8, b.h || 18), rot = b.rot || 0;
  const pier = Math.max(2, w * 0.22), opening = Math.max(3, w - pier * 2), spring = h * 0.62;
  for (const side of [-1, 1]) {
    const p = scene.localPoint(b.x, b.z, side * (opening + pier) / 2, 0, rot);
    scene.box(p[0], 0, p[1], pier, spring, d, c, rot);
  }
  scene.box(b.x, spring, b.z, w, h - spring, d, c, rot);
  footprint(scene, b);
}

function wall(scene, b) {
  const c = colourFor(b), w = b.w || 120, d = Math.max(2, b.d || 5), h = Math.max(5, b.h || 12), rot = b.rot || 0;
  scene.box(b.x, 0, b.z, w, h, d, c, rot);
  const towerStep = Math.max(26, Math.min(60, w / 7));
  const towers = Math.max(2, Math.floor(w / towerStep));
  for (let i = 0; i <= towers; i++) {
    const lx = -w * 0.5 + w * i / towers;
    const p = scene.localPoint(b.x, b.z, lx, 0, rot);
    scene.box(p[0], 0, p[1], d * 2.2, h * 1.22, d * 2.2, M.wall, rot);
  }
  footprint(scene, b, 0);
}

function gate(scene, b) { arch(scene, { ...b, w: b.w || 34, d: b.d || 14, h: b.h || 20 }); }

// Modern, non-historical public-infrastructure assets. They intentionally use
// original low-poly geometry rather than copied plans, branding or photography.
function terminal(scene, b) {
  const w=b.w||220,d=b.d||120,h=Math.max(16,b.h||30),rot=b.rot||0, glass=[0.33,0.53,0.61];
  scene.box(b.x,0,b.z,w,h*0.22,d,[0.56,0.58,0.57],rot);
  for(const side of [-1,1]) {
    const p=scene.localPoint(b.x,b.z,0,side*d*0.47,rot);
    scene.box(p[0],h*0.22,p[1],w*0.94,h*0.46,0.55,glass,rot);
  }
  const bays=scene.mobile?Math.max(5,Math.round(w/80)):Math.max(8,Math.round(w/52));
  for(let i=0;i<=bays;i++) {
    const p=scene.localPoint(b.x,b.z,-w*0.46+w*i/bays,0,rot);
    scene.box(p[0],h*0.18,p[1],0.7,h*0.74,d*0.96,[0.76,0.75,0.69],rot);
  }
  for(let i=0;i<bays;i++) {
    const p=scene.localPoint(b.x,b.z,-w*0.42+w*(i+.5)/bays,0,rot);
    scene.roof(p[0],h*0.7,p[1],w/bays*1.04,h*0.3,d*0.98,[0.72,0.73,0.7],rot);
  }
  footprint(scene,b);
}
function tower(scene,b) {
  const h=Math.max(28,b.h||72),r=Math.max(5,Math.min(b.w||24,b.d||24)*.42);
  const conc=[0.64,0.62,0.54],dark=[0.20,0.30,0.33],gold=[0.77,0.72,0.55],seg=scene.mobile?12:20;
  scene.cylinder(b.x,0,b.z,r,h*.36,conc,seg);
  scene.cylinder(b.x,h*.36,b.z,r*.62,h*.36,[0.58,0.56,0.48],seg);
  const bulge=(i)=>{const t=(i+1)/5;return r*0.62*Math.sin(t*Math.PI)*1.6;};
  for(let i=0;i<5;i++){
    const rr=Math.max(1.2,bulge(i)),y=h*.36+i*h*.11;
    scene.cylinder(b.x,y,b.z,rr,h*.12,i%2?dark:conc,seg);
  }
  scene.cylinder(b.x,h*.91,b.z,r*.7,h*.09,dark,seg);
  scene.cylinder(b.x,h,b.z,r*.38,h*.05,gold,seg);
}
function checkin(scene,b) { scene.box(b.x,0.1,b.z,b.w||80,1.1,b.d||14,[0.22,0.29,0.31],b.rot||0); }
function forecourt(scene,b) {
  const w=b.w||420,d=b.d||130,rot=b.rot||0, asphalt=[0.25,0.27,0.28],paving=[0.46,0.48,0.47],mark=[0.76,0.71,0.52];
  scene.box(b.x,0,b.z,w,.08,d,asphalt,rot);
  for(const lane of [-.30,0,.30]){
    const p=scene.localPoint(b.x,b.z,0,lane*d,rot);
    scene.box(p[0],.09,p[1],w*.92,.035,1.1,mark,rot);
  }
  for(const side of [-1,1]){
    const p=scene.localPoint(b.x,b.z,0,side*d*.43,rot);
    scene.box(p[0],.10,p[1],w,.14,d*.11,paving,rot);
  }
  const bays=scene.mobile?5:9;
  for(let i=0;i<bays;i++){
    const x=-w*.40+w*.80*i/Math.max(1,bays-1);
    const curb=scene.localPoint(b.x,b.z,x,-d*.16,rot);
    scene.box(curb[0],.12,curb[1],w/(bays*2.2),.18,d*.10,[0.60,0.62,0.60],rot);
    const canopy=scene.localPoint(b.x,b.z,x,-d*.31,rot);
    scene.box(canopy[0],.16,canopy[1],.42,5.6,.42,[0.67,0.68,0.65],rot);
    scene.box(canopy[0],5.72,canopy[1],w/(bays*.78),.20,d*.18,[0.55,0.59,0.59],rot);
  }
}
function apron(scene,b) {
  const w=b.w||160,d=b.d||160,rot=b.rot||0;
  scene.box(b.x,0,b.z,w,.06,d,[0.22,0.24,0.25],rot);
  const stands=scene.mobile?3:6;
  for(let i=0;i<stands;i++){
    const sx=-w*.35+w*i/(stands-1);
    const p=scene.localPoint(b.x,b.z,sx,0,rot);
    scene.box(p[0],0.06,p[1],6,.08,40,[0.28,0.30,0.31],rot);
    const ax=p[0],az=p[1];
    scene.box(ax,0.08,az-14,18,.12,3.5,[0.72,0.72,0.7],rot);
    scene.box(ax,0.20,az-14,4,.10,3.5,[0.72,0.72,0.7],rot);
    scene.box(ax,0.08,az-14,18,.06,12,[0.62,0.62,0.6],rot);
  }
}

function bridge(scene, b) {
  const c = colourFor(b), w = b.w || 42, d = Math.max(6, b.d || 10), rot = b.rot || 0;
  scene.box(b.x, 0.12, b.z, w, 0.8, d, c, rot);
  const deckY = 0.92;
  scene.walkRect(b.x, b.z, w - 0.5, d - 0.5, deckY, rot, b.id || 'bridge deck');
  for (const side of [-1, 1]) {
    const p = scene.localPoint(b.x, b.z, 0, side * d * 0.47, rot);
    scene.box(p[0], deckY, p[1], w, 0.65, 0.55, M.limestone2, rot);
  }
}

function market(scene, b) {
  const c = colourFor(b), w = b.w || 50, d = b.d || 44, h = Math.max(6, b.h || 12), rot = b.rot || 0;
  scene.box(b.x, 0, b.z, w, 0.25, d, M.roadLight, rot);
  const cols = 8;
  for (let i = 0; i < cols; i++) {
    const a = i * Math.PI * 2 / cols;
    const p = scene.localPoint(b.x, b.z, Math.cos(a) * w * 0.36, Math.sin(a) * d * 0.36, rot);
    scene.column(p[0], 0.25, p[1], 0.42, h * 0.48, M.marbleLight);
  }
  scene.box(b.x, 0.25, b.z, w * 0.26, h * 0.44, d * 0.26, c, rot);
  footprint(scene, b);
}

function forum(scene, b) {
  const w = b.w || 100, d = b.d || 80, h = Math.max(4, b.h || 7), rot = b.rot || 0;
  scene.box(b.x, 0.01, b.z, w, 0.08, d, M.roadLight, rot);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 10; i++) {
      const t = i / 9;
      const p = scene.localPoint(b.x, b.z, -w * 0.42 + t * w * 0.84, side * d * 0.43, rot);
      scene.column(p[0], 0.08, p[1], 0.38, h, M.marbleLight);
    }
  }
}

function church(scene, b) {
  basilica(scene, { ...b, material: b.material || 'plaster' });
  const h = Math.max(8, b.h || 18), rot = b.rot || 0;
  const p = scene.localPoint(b.x, b.z, 0, -(b.d || 30) * 0.36, rot);
  scene.box(p[0], h * 0.58, p[1], Math.max(2, (b.w || 40) * 0.08), h * 0.3, Math.max(2, (b.d || 30) * 0.1), M.marbleLight, rot);
}

function cemetery(scene, b) {
  const c = colourFor(b), count = scene.mobile ? 14 : 26;
  for (let i = 0; i < count; i++) {
    const a = i * 2.399963, r = Math.sqrt((i + 1) / count) * Math.min(b.w || 70, b.d || 70) * 0.46;
    const p = scene.localPoint(b.x, b.z, Math.cos(a) * r, Math.sin(a) * r, b.rot || 0);
    scene.box(p[0], 0, p[1], 1.3, 1.1 + (i % 4) * 0.28, 0.8, c, (b.rot || 0) + a * 0.05);
  }
}

function columnMonument(scene, b) {
  scene.column(b.x, 0, b.z, Math.max(0.7, (b.w || 8) * 0.2), Math.max(6, b.h || 24), colourFor(b));
  scene.box(b.x, 0, b.z, Math.max(4, b.w || 8), 1.4, Math.max(4, b.d || 8), M.limestone, b.rot || 0);
  footprint(scene, b);
}

function statue(scene, b) {
  scene.box(b.x, 0, b.z, Math.max(1.5, b.w || 2), 1.2, Math.max(1.5, b.d || 2), M.marble, b.rot || 0);
  scene.box(b.x, 1.2, b.z, Math.max(0.6, (b.w || 2) * 0.45), Math.max(2.5, (b.h || 6) * 0.65), Math.max(0.6, (b.d || 2) * 0.45), M.bronze, b.rot || 0);
}

function palace(scene, b) {
  const c = colourFor(b), w = b.w || 110, d = b.d || 80, h = Math.max(12, b.h || 28), rot = b.rot || 0;
  scene.box(b.x, 0, b.z, w, h * 0.46, d, c, rot);
  for (const sx of [-0.34, 0, 0.34]) {
    for (const sz of [-0.3, 0.3]) {
      const p = scene.localPoint(b.x, b.z, sx * w, sz * d, rot);
      scene.box(p[0], h * 0.46, p[1], w * 0.22, h * 0.28, d * 0.22, M.plaster2, rot);
    }
  }
  footprint(scene, b);
}

function fort(scene, b) { wall(scene, { ...b, d: Math.max(8, b.d || 40), h: b.h || 18 }); }
function sanctuary(scene, b) { temple(scene, { ...b, h: Math.max(5, b.h || 8), w: b.w || 18, d: b.d || 14 }); }
function porch(scene, b) { basilica(scene, { ...b, h: Math.max(5, b.h || 7) }); }
function stoa(scene, b) { basilica(scene, { ...b, h: Math.max(5, b.h || 8), d: Math.max(8, b.d || 10) }); }
function arena(scene, b) { stadium(scene, { ...b, d: b.d || 70, w: b.w || 70 }); }
function mausoleum(scene, b) { round(scene, b); }
function aqueduct(scene, b) { arch(scene, { ...b, w: b.w || 80, d: b.d || 8, h: b.h || 18 }); }
function circus(scene, b) { stadium(scene, b); }
function gateway(scene, b) { gate(scene, b); }
function building(scene, b) { genericHouse(scene, b); }

function parthenon(scene, b) { temple(scene, { ...b, material: 'marbleLight', w: b.w || 46, d: b.d || 22, h: b.h || 16 }); }
function propylaea(scene, b) { gate(scene, { ...b, w: b.w || 30, d: b.d || 16, h: b.h || 12, material: 'marbleLight' }); }
function colosseum(scene, b) { amphitheatre(scene, { ...b, material: 'limestone' }); }
function pantheon(scene, b) { dome(scene, { ...b, material: 'brick' }); }
function templeOfZeus(scene, b) { temple(scene, { ...b, material: 'marbleLight', w: b.w || 55, d: b.d || 35, h: b.h || 18 }); }

const TYPE_BUILDERS = Object.freeze({
  'urban-fabric': genericHouse,
  house: genericHouse,
  shop,
  villa,
  building,
  temple,
  basilica,
  bath,
  theatre,
  stadium,
  amphitheatre,
  arena,
  dome,
  round,
  arch,
  wall,
  gate,
  gateway,
  terminal,
  tower,
  checkin,
  forecourt,
  apron,
  bridge,
  market,
  forum,
  church,
  cemetery,
  burial: cemetery,
  column: columnMonument,
  statue,
  palace,
  fort,
  sanctuary,
  porch,
  stoa,
  mausoleum,
  aqueduct,
  circus,
});

const HERO_BUILDERS = Object.freeze({
  parthenon,
  propylaea,
  colosseum,
  pantheon,
  'temple-of-zeus': templeOfZeus,
  temple: templeOfZeus,
});

export function createBlockyAssetLibrary(scene) {
  return Object.freeze({
    render(record) {
      if (!record) return;
      const hero = record.asset && HERO_BUILDERS[record.asset];
      if (hero) return hero(scene, record);
      const byId = HERO_BUILDERS[record.id];
      if (byId) return byId(scene, record);
      const builder = TYPE_BUILDERS[record.type] || genericHouse;
      return builder(scene, record);
    },
    renderMany(records = []) { for (const record of records) this.render(record); },
    has(type) { return !!TYPE_BUILDERS[type] || !!HERO_BUILDERS[type]; },
    types: Object.freeze([...Object.keys(TYPE_BUILDERS), ...Object.keys(HERO_BUILDERS)]),
  });
}

export const BLOCKY_ASSET_LIBRARY = Object.freeze({
  style: 'blocky-low-poly',
  trueVoxelEngine: false,
  flatGroundCompatible: true,
  sharedTypes: Object.freeze(Object.keys(TYPE_BUILDERS)),
  heroAssets: Object.freeze(Object.keys(HERO_BUILDERS)),
});