'use strict';
const DIRS = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];
let lastDir = null;

function k(x, y) { return x + ',' + y; }

function move(state) {
  const { turn, width: W, height: H, you, snakes, food, hazards, nextShrinkTurn } = state;
  const hx = you.head.x, hy = you.head.y;
  const myLen = you.length, myHealth = you.health;

  const blocked = new Set();
  const hz = new Set();
  for (let i = 0; i < hazards.length; i++) {
    const p = hazards[i]; hz.add(k(p.x, p.y)); blocked.add(k(p.x, p.y));
  }

  const enemies = [];
  for (let i = 0; i < snakes.length; i++) {
    const s = snakes[i];
    if (s.id === you.id) continue;
    enemies.push({ x: s.head.x, y: s.head.y, len: s.body.length });
    for (let j = 0; j < s.body.length; j++) blocked.add(k(s.body[j].x, s.body[j].y));
  }
  const myTail = you.body[you.body.length - 1];
  for (let j = 0; j < you.body.length - 1; j++) blocked.add(k(you.body[j].x, you.body[j].y));
  // my own tail vacates this turn unless I eat on it

  const eReach = new Set();
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    for (let di = 0; di < 4; di++) {
      const nx = e.x + DIRS[di][1], ny = e.y + DIRS[di][2];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const kk = k(nx, ny);
      if (hz.has(kk) || blocked.has(kk)) continue;
      eReach.add(kk);
    }
  }

  const foodSet = new Set();
  for (let i = 0; i < food.length; i++) foodSet.add(k(food[i].x, food[i].y));

  const cand = [];
  for (let di = 0; di < 4; di++) {
    const nx = hx + DIRS[di][1], ny = hy + DIRS[di][2];
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const kk = k(nx, ny);
    if (hz.has(kk) || blocked.has(kk) || (kk === k(myTail.x, myTail.y) && foodSet.has(kk))) continue;
    let headOnDoom = false;
    for (let ei = 0; ei < enemies.length; ei++) {
      if (myLen <= enemies[ei].len && eReach.has(kk)) { headOnDoom = true; break; }
    }
    if (!headOnDoom) cand.push({ d: DIRS[di][0], nx: nx, ny: ny, k: kk, doom: false });
    else cand.push({ d: DIRS[di][0], nx: nx, ny: ny, k: kk, doom: true });
  }
  const safe = cand.filter(function (c) { return !c.doom; });
  const pickList = safe.length ? safe : cand;
  if (!pickList.length) {
    const fb = [];
    for (let di = 0; di < 4; di++) {
      const nx = hx + DIRS[di][1], ny = hy + DIRS[di][2];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const kk = k(nx, ny);
      if (hz.has(kk)) continue;
      fb.push({ d: DIRS[di][0], nx: nx, ny: ny, k: kk });
    }
    if (!fb.length) return lastDir || 'up';
    let bf = null, bs = -Infinity;
    for (let i = 0; i < fb.length; i++) {
      let s = flood(fb[i].nx, fb[i].ny);
      if (foodSet.has(fb[i].k)) s += 1000;
      if (s > bs) { bs = s; bf = fb[i]; }
    }
    lastDir = bf.d;
    return bf.d;
  }

  function flood(sx, sy) {
    const seen = new Set([k(sx, sy)]);
    const q = [[sx, sy]];
    let c = 0, qi = 0;
    while (qi < q.length) {
      const t = q[qi++]; c++;
      for (let di = 0; di < 4; di++) {
        const nx = t[0] + DIRS[di][1], ny = t[1] + DIRS[di][2];
        const kk = k(nx, ny);
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen.has(kk) || blocked.has(kk)) continue;
        seen.add(kk); q.push([nx, ny]);
      }
    }
    return c;
  }

  const turnUntil = nextShrinkTurn - turn;
  const storm = turn >= 130 && turnUntil <= 14;

  function margin(x, y) { return Math.min(x, y, W - 1 - x, H - 1 - y); }

  let best = null, bestScore = -Infinity;
  const foodW = myHealth < 50 ? 9 : (myHealth < 80 ? 5 : 2);

  for (let ci = 0; ci < pickList.length; ci++) {
    const c = pickList[ci];
    let score = flood(c.nx, c.ny) * 10;
    if (score < myLen * 10) score -= 4000;

    let fd = 0;
    if (food.length) {
      fd = Infinity;
      for (let fi = 0; fi < food.length; fi++) {
        const f = food[fi];
        const dd = Math.abs(f.x - c.nx) + Math.abs(f.y - c.ny);
        if (dd < fd) fd = dd;
      }
      score -= fd * foodW;
      if (foodSet.has(c.k)) score += 60;
    }

    for (let ei = 0; ei < enemies.length; ei++) {
      if (eReach.has(c.k)) {
        if (myLen > enemies[ei].len) score += 80;
        else { score -= 250; score += fd * 3; }
      }
    }

    if (storm) {
      const m = margin(c.nx, c.ny);
      score += m * (turnUntil <= 4 ? 8 : 3);
    }

    if (c.d === lastDir) score += 2;

    if (score > bestScore) { bestScore = score; best = c; }
  }

  lastDir = best.d;
  return best.d;
}

module.exports = { name: 'Sovereign', move };
