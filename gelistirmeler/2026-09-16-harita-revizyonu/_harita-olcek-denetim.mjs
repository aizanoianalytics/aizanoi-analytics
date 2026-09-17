// Harita olcek denetimi: yedek vs guncel efektif geometri.
// Beklenen: x ve x-genislik orani 0.50, z orani 1.00. Cikis kodu: basari 0.
import * as curAiz from "../../frontend/worlds/aizanoi-225/js/city-data.js";
import * as oldAiz from "./yedek/aizanoi-225/city-data.js";
import * as curRome from "../../frontend/worlds/rome-410-476/js/city-data.js";
import * as oldRome from "./yedek/rome-410-476/city-data.js";
import * as curAth from "../../frontend/worlds/athens-450-430/js/city-data.js";
import * as oldAth from "./yedek/athens-450-430/city-data.js";
import * as curIga from "../../frontend/worlds/iga-airport/js/airport-data.js";
import * as oldIga from "./yedek/iga-airport/airport-data.js";

let fails = 0;
function check(name, actual, expected, tol = 0.011) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  if (!ok) {
    fails++;
    console.log(`  FAIL ${name}: ${actual} (beklenen ~${expected})`);
  }
  return ok;
}
function ratios(items, key = "x") {
  const rs = [];
  for (const [o, n] of items) {
    if (o?.[key] && n?.[key]) rs.push(n[key] / o[key]);
  }
  return rs;
}
function avg(a) {
  return a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
}
function wpts(points) {
  // [[x,z],...] veya [{x,z},...] normalize
  return points.map((p) => (Array.isArray(p) ? { x: p[0], z: p[1] } : p));
}

function auditWorld(label, cur, old) {
  console.log(`--- ${label} ---`);
  const byId = (arr) => new Map(arr.map((b) => [b.id, b]));
  const oB = byId(old.BUILDINGS),
    nB = new Map(cur.BUILDINGS.map((b) => [b.id, b]));
  console.log(`  bina: ${old.BUILDINGS.length} -> ${cur.BUILDINGS.length}`);
  check("bina sayisi", cur.BUILDINGS.length, old.BUILDINGS.length, 0);
  const pairs = [...oB].map(([id, o]) => [o, nB.get(id)]).filter(([, n]) => n);
  check("ort. bina x orani", avg(ratios(pairs, "x")), 0.5);
  check("ort. bina w orani", avg(ratios(pairs, "w")), 0.5);
  check("ort. bina z orani", avg(ratios(pairs, "z")), 1.0);
  const oR = old.REGIONS,
    nR = cur.REGIONS;
  const rp = oR.map((o, i) => [o, nR[i]]).filter(([, n]) => n);
  check("ort. bolge x orani", avg(ratios(rp, "x")), 0.5);
  check("ort. bolge w orani", avg(ratios(rp, "w")), 0.5);
  const oldW = (old.BOUNDS.maxX - old.BOUNDS.minX) || 1;
  const newW = (cur.BOUNDS.maxX - cur.BOUNDS.minX) || 1;
  check("BOUNDS genislik orani", newW / oldW, 0.5);
  check(
    "BOUNDS derinlik orani",
    (cur.BOUNDS.maxZ - cur.BOUNDS.minZ) / (old.BOUNDS.maxZ - old.BOUNDS.minZ),
    1.0
  );
  if (old.SPAWN.x && cur.SPAWN.x) check("SPAWN x orani", cur.SPAWN.x / old.SPAWN.x, 0.5);
  check("SPAWN z orani", cur.SPAWN.z / old.SPAWN.z, 1.0);
  // teleport/tur id cozumleme
  const ids = new Set(cur.BUILDINGS.map((b) => b.id));
  for (const t of cur.TELEPORTS || []) {
    const id = t.id || t.building || t.target;
    if (id && !ids.has(id)) {
      fails++;
      console.log(`  FAIL teleport cozulmedi: ${id}`);
    }
  }
  for (const t of cur.TOUR_STOPS || []) {
    const id = t.id || t.building || t.target;
    if (id && !ids.has(id)) {
      fails++;
      console.log(`  FAIL tur duragi cozulmedi: ${id}`);
    }
  }
  // bina merkezleri BOUNDS icinde mi (bilgi)
  const out = cur.BUILDINGS.filter(
    (b) => b.x < cur.BOUNDS.minX || b.x > cur.BOUNDS.maxX
  ).length;
  console.log(`  BOUNDS disi bina merkezi: ${out}`);
  console.log(`  teleport: ${(cur.TELEPORTS || []).length}, tur: ${(cur.TOUR_STOPS || []).length}`);
}

const A = curAiz.compactAizanoiLayout();
const Ao = oldAiz.compactAizanoiLayout();
auditWorld("aizanoi-225", { ...curAiz, ...A }, { ...oldAiz, ...Ao });
auditWorld("rome-410-476", curRome, oldRome);
auditWorld("athens-450-430", curAth, oldAth);
const I = curIga.compactAirportLayout();
const Io = oldIga.compactAirportLayout();
auditWorld("iga-airport", { ...curIga, ...I }, { ...oldIga, ...Io });

console.log(fails === 0 ? "TUM OLCEK KONTROLLERI GECTI" : `${fails} HATA`);
process.exit(fails === 0 ? 0 : 1);
