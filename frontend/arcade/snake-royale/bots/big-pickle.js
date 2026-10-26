const DIRS = [
  ['up', 0, -1],
  ['down', 0, 1],
  ['left', -1, 0],
  ['right', 1, 0]
];

function move(state) {
  const W = state.width;
  const H = state.height;
  const you = state.you;
  const snakes = state.snakes;
  const food = state.food;
  const hazards = state.hazards;
  const turn = state.turn;

  const key = (x, y) => x + ',' + y;
  const foodSet = new Set();
  for (let i = 0; i < food.length; i++) foodSet.add(key(food[i].x, food[i].y));
  const hazardSet = new Set();
  for (let i = 0; i < hazards.length; i++) hazardSet.add(key(hazards[i].x, hazards[i].y));

  let ring = 0;
  for (let i = 0; i < hazards.length; i++) {
    const p = hazards[i];
    const m = Math.min(p.x, p.y, W - 1 - p.x, H - 1 - p.y);
    if (m + 1 > ring) ring = m + 1;
  }
  const maxRing = Math.floor(Math.min(W, H) / 2) - 1;

  const infos = [];
  let me = null;
  for (let si = 0; si < snakes.length; si++) {
    const s = snakes[si];
    const body = s.body;
    const len = body.length;
    const def = new Set();
    for (let i = 0; i < len - 1; i++) def.add(key(body[i].x, body[i].y));
    const info = {
      body: body,
      len: len,
      head: body[0],
      tail: body[len - 1],
      def: def,
      isMe: s.id === you.id
    };
    infos.push(info);
    if (info.isMe) me = info;
  }

  const allDef = new Set();
  for (let i = 0; i < infos.length; i++) {
    infos[i].def.forEach(k => allDef.add(k));
  }

  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;

  function lifeAt(x, y) {
    const m = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (m >= maxRing) return Infinity;
    return 150 + 20 * m - turn;
  }

  function areaFrom(sx, sy, blocked) {
    const seen = new Set();
    const qx = [sx];
    const qy = [sy];
    const qd = [0];
    seen.add(key(sx, sy));
    let area = 0;
    let nearFood = Infinity;
    for (let qi = 0; qi < qx.length; qi++) {
      const x = qx[qi];
      const y = qy[qi];
      const dist = qd[qi];
      area++;
      if (dist < nearFood && foodSet.has(key(x, y))) nearFood = dist;
      for (let j = 0; j < 4; j++) {
        const nx = x + DIRS[j][1];
        const ny = y + DIRS[j][2];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nk = key(nx, ny);
        if (seen.has(nk) || hazardSet.has(nk) || blocked.has(nk)) continue;
        seen.add(nk);
        qx.push(nx);
        qy.push(ny);
        qd.push(dist + 1);
      }
    }
    return { area: area, food: nearFood };
  }

  const candidates = [];
  const fallback = [];

  for (let di = 0; di < 4; di++) {
    const d = DIRS[di];
    const nhx = me.head.x + d[1];
    const nhy = me.head.y + d[2];
    if (nhx < 0 || nhy < 0 || nhx >= W || nhy >= H) continue;
    const nk = key(nhx, nhy);
    if (hazardSet.has(nk)) continue;

    const eat = foodSet.has(nk);
    const newLen = me.len + (eat ? 1 : 0);

    if (allDef.has(nk)) {
      fallback.push({ name: d[0], x: nhx, y: nhy });
      continue;
    }

    const newBodySet = new Set();
    let selfHit = false;
    for (let i = 0; i < me.len; i++) {
      if (!eat && i === me.len - 1) break;
      const bk = key(me.body[i].x, me.body[i].y);
      if (bk === nk) selfHit = true;
      newBodySet.add(bk);
    }
    if (selfHit) {
      fallback.push({ name: d[0], x: nhx, y: nhy });
      continue;
    }
    newBodySet.add(nk);

    let tailRisk = 0;
    for (let i = 0; i < infos.length; i++) {
      const info = infos[i];
      if (info.isMe) continue;
      if (info.tail.x === nhx && info.tail.y === nhy) {
        let couldEat = false;
        for (let j = 0; j < 4; j++) {
          const ax = info.head.x + DIRS[j][1];
          const ay = info.head.y + DIRS[j][2];
          if (foodSet.has(key(ax, ay))) { couldEat = true; break; }
        }
        if (couldEat) tailRisk += 0.6;
      }
    }

    let headRisk = 0;
    for (let i = 0; i < infos.length; i++) {
      const info = infos[i];
      if (info.isMe) continue;
      const enemyLen = info.len + (foodSet.has(nk) ? 1 : 0);
      if (enemyLen < newLen) continue;
      for (let j = 0; j < 4; j++) {
        const ex = info.head.x + DIRS[j][1];
        const ey = info.head.y + DIRS[j][2];
        if (ex === nhx && ey === nhy) {
          headRisk += enemyLen > newLen ? 1.2 : 0.8;
          break;
        }
      }
    }

    const blocked = new Set(allDef);
    newBodySet.forEach(k => blocked.add(k));
    const blockedMe = new Set(blocked);
    for (let i = 0; i < infos.length; i++) {
      const info = infos[i];
      if (info.isMe) continue;
      for (let j = 0; j < 4; j++) {
        const ex = info.head.x + DIRS[j][1];
        const ey = info.head.y + DIRS[j][2];
        if (ex < 0 || ey < 0 || ex >= W || ey >= H) continue;
        const ek = key(ex, ey);
        if (!hazardSet.has(ek)) blockedMe.add(ek);
      }
    }
    const reach = areaFrom(nhx, nhy, blockedMe);
    const area = reach.area;
    const foodReach = areaFrom(nhx, nhy, blocked);
    const foodDist = foodReach.food;

    let score = area * 0.9;
    if (area < newLen) score -= (newLen - area) * 40 + 300;
    else {
      const want = Math.min(newLen * 2 + 3, (W * H) / 2);
      if (area < want) score -= (want - area) * 3;
    }
    score -= tailRisk * 20;

    if (foodDist !== Infinity) {
      let foodWeight = 1.4 + Math.max(0, 70 - you.health) * 0.06;
      if (you.health < 60) foodWeight += 1.0;
      if (you.health < 30) foodWeight += 2.0;
      score -= foodDist * foodWeight;
      if (you.health < 50) score += 8;
      if (you.health < 30) score += 12;
      if (foodDist === 0) score += 4;
    }

    const life = lifeAt(nhx, nhy);
    if (life !== Infinity) {
      if (life < 12) score -= (12 - life) * 3;
      if (turn > 80 && life < 40) score -= (40 - life) * 0.5;
    }
    const centerWeight = turn > 100 ? 1.5 : 0;
    score -= (Math.abs(nhx - cx) + Math.abs(nhy - cy)) * centerWeight;

    const edgeMargin = Math.min(nhx, nhy, W - 1 - nhx, H - 1 - nhy);
    if (edgeMargin === 0) score -= turn > 50 ? 8 : 3;
    else if (edgeMargin === 1) score -= 1;

    for (let i = 0; i < infos.length; i++) {
      const info = infos[i];
      if (info.isMe) continue;
      const md = Math.abs(info.head.x - nhx) + Math.abs(info.head.y - nhy);
      if (info.len >= newLen) {
        if (md <= 5) score -= (6 - md) * 6;
        if (edgeMargin === 0 && md <= 7) score -= 6;
      } else if (md <= 3) {
        score += (4 - md) * 1;
      }
      if (md > 9) continue;
      const eReach = areaFrom(info.head.x, info.head.y, blocked);
      if (eReach.area < info.len) {
        score += (info.len - eReach.area) * (info.len > me.len ? 4 : 2);
      } else if (eReach.area < info.len + 3) {
        score += info.len > me.len ? 4 : 2;
      }
    }

    candidates.push({ name: d[0], score: score, headRisk: headRisk, tailRisk: tailRisk });
  }

  if (candidates.length) {
    let safe = [];
    for (let i = 0; i < candidates.length; i++) {
      if (candidates[i].headRisk === 0 && candidates[i].tailRisk === 0) safe.push(candidates[i]);
    }
    if (safe.length) {
      safe.sort((a, b) => b.score - a.score);
      return safe[0].name;
    }
    candidates.sort((a, b) => {
      const ar = a.headRisk * 1000 + a.tailRisk * 300;
      const br = b.headRisk * 1000 + b.tailRisk * 300;
      if (ar !== br) return ar - br;
      return b.score - a.score;
    });
    return candidates[0].name;
  }

  if (fallback.length) {
    fallback.sort((a, b) => {
      const da = Math.abs(a.x - cx) + Math.abs(a.y - cy);
      const db = Math.abs(b.x - cx) + Math.abs(b.y - cy);
      return da - db;
    });
    return fallback[0].name;
  }

  const alive = [];
  for (let i = 0; i < 4; i++) {
    const d = DIRS[i];
    const nx = me.head.x + d[1];
    const ny = me.head.y + d[2];
    if (nx >= 0 && ny >= 0 && nx < W && ny < H && !hazardSet.has(key(nx, ny))) alive.push(d[0]);
  }
  return alive.length ? alive[0] : 'up';
}

module.exports = { name: 'SerpentMind', move };
