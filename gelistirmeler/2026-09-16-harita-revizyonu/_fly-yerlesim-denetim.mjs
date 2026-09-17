// Fly House yerleşim denetimi — her heroObject oda sınırları içinde mi?
// Çalıştırma (repo kökünden): node gelistirmeler/2026-09-16-harita-revizyonu/_fly-yerlesim-denetim.mjs
// NOT: scene_spec.json içinde origin, X/Y için ODA MERKEZİ, Z için TABAN (min) olarak
// kullanılır. Kanıt: main-room origin [0,0,0] + hero'lar negatif koordinatlı (örn. old-tv
// -3.36) ve floor-main desteği [[-4.8,-4.0],[4.8,4.0]] merkezde simetriktir; Z ise 0..2.85
// taban-tavan aralığıdır. Bu yüzden sınırlar: X=ox±sx/2, Y=oy±sy/2, Z=oz..oz+sz.
// Görev metnindeki "(origin..origin+size)" ifadesi yalnızca Z için geçerlidir; X/Y için
// merkez yorumu kullanılmazsa tüm negatif konumlu hero'lar hatalı şekilde dışarıda çıkar.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  'gelistirmeler/2026-09-16-fly-world-prototype/scene_spec.json',
  resolve(here, '../2026-09-16-fly-world-prototype/scene_spec.json'),
];
const specPath = candidates.find((p) => existsSync(p));
if (!specPath) {
  console.error('FAIL: scene_spec.json bulunamadı. Denenen yollar:', candidates);
  process.exit(1);
}
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const EPS = 1e-9;

function roomBounds(room) {
  const [ox, oy, oz] = room.origin;
  const [sx, sy, sz] = room.size;
  return {
    min: [ox - sx / 2, oy - sy / 2, oz],
    max: [ox + sx / 2, oy + sy / 2, oz + sz],
  };
}

// Yaw (Z ekseni) için muhafazakar AABB genişletmesi.
// - 0°: boyut aynen; 90°/270°: X/Y takas; diğer (örn. blue-bag -9°, main-rug -4°):
//   w' = w*|cos| + d*|sin|, d' = w*|sin| + d*|cos|. Z değişmez (yaw Z'yi etkilemez).
function expandedSize(size, rotationDeg) {
  const [w, d, h] = size;
  const yaw = ((rotationDeg?.[2] ?? 0) * Math.PI) / 180;
  const deg = ((rotationDeg?.[2] ?? 0) % 360 + 360) % 360;
  const isZero = Math.abs(((deg + 180) % 360) - 180) < 1e-9 || Math.abs(deg) < 1e-9 || Math.abs(deg - 360) < 1e-9;
  if (isZero) return [w, d, h];
  const mod180 = ((deg % 180) + 180) % 180;
  if (Math.abs(mod180 - 90) < 1e-9) return [d, w, h];
  const c = Math.abs(Math.cos(yaw));
  const s = Math.abs(Math.sin(yaw));
  return [w * c + d * s, w * s + d * c, h];
}

const rooms = new Map(spec.rooms.map((r) => [r.id, { ...r, bounds: roomBounds(r) }]));
let pass = 0;
let fail = 0;
const failures = [];

console.log(`Spec: ${specPath}`);
for (const [id, r] of rooms) {
  console.log(
    `Oda ${id}: origin=[${r.origin}] size=[${r.size}] => X[${r.bounds.min[0].toFixed(3)}..${r.bounds.max[0].toFixed(3)}] ` +
      `Y[${r.bounds.min[1].toFixed(3)}..${r.bounds.max[1].toFixed(3)}] Z[${r.bounds.min[2].toFixed(3)}..${r.bounds.max[2].toFixed(3)}]`,
  );
}
console.log('--- hero kontrolleri ---');
for (const hero of spec.heroObjects) {
  const room = rooms.get(hero.room);
  if (!room) {
    console.log(`FAIL  ${hero.id}: bilinmeyen oda ${hero.room}`);
    fail++;
    failures.push(hero.id);
    continue;
  }
  const es = expandedSize(hero.size, hero.rotationDeg);
  const bmin = [
    hero.position[0] - es[0] / 2,
    hero.position[1] - es[1] / 2,
    hero.position[2] - es[2] / 2,
  ];
  const bmax = [
    hero.position[0] + es[0] / 2,
    hero.position[1] + es[1] / 2,
    hero.position[2] + es[2] / 2,
  ];
  const inside =
    bmin[0] >= room.bounds.min[0] - EPS &&
    bmin[1] >= room.bounds.min[1] - EPS &&
    bmin[2] >= room.bounds.min[2] - EPS &&
    bmax[0] <= room.bounds.max[0] + EPS &&
    bmax[1] <= room.bounds.max[1] + EPS &&
    bmax[2] <= room.bounds.max[2] + EPS;
  const rot = hero.rotationDeg?.[2] ?? 0;
  if (inside) {
    pass++;
    console.log(
      `PASS  ${hero.id} [${hero.room}] rotZ=${rot}° pos=[${hero.position}] size=[${hero.size}] ` +
        `genişletilmiş=[${es.map((v) => v.toFixed(4))}] bbox X[${bmin[0].toFixed(3)}..${bmax[0].toFixed(3)}] ` +
        `Y[${bmin[1].toFixed(3)}..${bmax[1].toFixed(3)}] Z[${bmin[2].toFixed(3)}..${bmax[2].toFixed(3)}]`,
    );
  } else {
    fail++;
    failures.push(hero.id);
    console.log(
      `FAIL  ${hero.id} [${hero.room}] rotZ=${rot}° pos=[${hero.position}] size=[${hero.size}] ` +
        `genişletilmiş=[${es.map((v) => v.toFixed(4))}] bbox X[${bmin[0].toFixed(3)}..${bmax[0].toFixed(3)}] ` +
        `Y[${bmin[1].toFixed(3)}..${bmax[1].toFixed(3)}] Z[${bmin[2].toFixed(3)}..${bmax[2].toFixed(3)}] ` +
        `oda X[${room.bounds.min[0]}..${room.bounds.max[0]}] Y[${room.bounds.min[1]}..${room.bounds.max[1]}] Z[${room.bounds.min[2]}..${room.bounds.max[2]}]`,
    );
  }
}

console.log('--- destek yüzeyleri ---');
let supportOk = true;
for (const s of spec.supportSurfaces ?? []) {
  const [[x0, y0, z0], [x1, y1, z1]] = s.bounds;
  const ordered = x0 <= x1 + EPS && y0 <= y1 + EPS && z0 <= z1 + EPS;
  let extra = 'genel sınırlar düzenli';
  if (s.id === 'floor-main') {
    const main = rooms.get('main-room');
    const match =
      Math.abs(x0 - main.bounds.min[0]) < EPS &&
      Math.abs(y0 - main.bounds.min[1]) < EPS &&
      Math.abs(x1 - main.bounds.max[0]) < EPS &&
      Math.abs(y1 - main.bounds.max[1]) < EPS &&
      Math.abs(z0) < EPS &&
      Math.abs(z1) < EPS;
    extra = match ? 'zemin düzlemi (z=0) ana oda XY ile birebir örtüşüyor' : 'UYUMSUZ: ana oda XY ile örtüşmüyor!';
    if (!match) supportOk = false;
  } else if (s.id === 'cabinet-top-support-shelf') {
    const main = rooms.get('main-room');
    const flat = Math.abs(z0 - z1) < EPS && z0 > 0;
    const insideMain =
      x0 >= main.bounds.min[0] - EPS &&
      x1 <= main.bounds.max[0] + EPS &&
      y0 >= main.bounds.min[1] - EPS &&
      y1 <= main.bounds.max[1] + EPS;
    extra = flat && insideMain ? `yükseltilmiş raf (z=${z0}) ana oda içinde` : 'UYUMSUZ: raf düzlemi/konumu hatalı!';
    if (!(flat && insideMain)) supportOk = false;
  }
  if (!ordered) supportOk = false;
  console.log(`${ordered && supportOk ? 'PASS ' : 'FAIL '} ${s.id}: [[${x0},${y0},${z0}],[${x1},${y1},${z1}]] — ${extra}`);
}

console.log('--- özet ---');
console.log(`Hero: ${pass} içerde, ${fail} dışarıda (toplam ${spec.heroObjects.length})`);
console.log(`Destek yüzeyleri: ${supportOk ? 'tutarlı' : 'TUTARSIZ'}`);
if (fail > 0) {
  console.log(`DIŞARIDAKİLER: ${failures.join(', ')}`);
  process.exit(1);
}
if (!supportOk) process.exit(1);
console.log('TÜM KONTROLLER GEÇTİ');
