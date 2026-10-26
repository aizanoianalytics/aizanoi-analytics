const D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
function move(state) {
  const t0 = Date.now();
  const W = state.width, H = state.height, me = state.you;
  const N = W * H;
  const idx = (x, y) => y * W + x;
  const blocked = new Uint8Array(N);
  let ring = 0;
  for (const h of state.hazards) { blocked[idx(h.x, h.y)] = 1; }
  while (ring < W / 2 && state.hazards.length && state.hazards.some(h => h.x === ring || h.y === ring) ) ring++;
  const soonRing = state.nextShrinkTurn - state.turn; // turns until next ring closes
  const nextRing = state.hazards.length || state.turn >= 150 ? ring : (state.turn < 150 ? 0 : ring);
  const others = state.snakes.filter(s => s.id !== me.id);
  for (const s of state.snakes) {
    const b = s.body, grow = b.length > 1 && b[b.length - 1].x === b[b.length - 2].x && b[b.length - 1].y === b[b.length - 2].y;
    for (let i = 0; i < b.length; i++) {
      if (i === b.length - 1 && !grow && b.length > 1) continue;
      blocked[idx(b[i].x, b[i].y)] = 1;
    }
  }
  const foodSet = new Set(state.food.map(f => idx(f.x, f.y)));
  const edgeDist = (x, y) => Math.min(x, y, W - 1 - x, H - 1 - y);
  // opponent threatened cells
  const threat = new Map(); // cell -> max length of opponent that can reach
  for (const o of others) for (const k in D) {
    const x = o.head.x + D[k][0], y = o.head.y + D[k][1];
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const c = idx(x, y);
    threat.set(c, Math.max(threat.get(c) || 0, o.length));
  }
  // multi-source BFS territory
  function territory(startCell, myLen) {
    const dist = new Int16Array(N).fill(-1), owner = new Int8Array(N).fill(-1);
    // sources: 0 = me, i+1 = others
    let q = [], qi = 0;
    dist[startCell] = 0; owner[startCell] = 0; q.push(startCell);
    const heads = [];
    others.forEach((o, i) => { const c = idx(o.head.x, o.head.y); if (dist[c] < 0) { dist[c] = 0; owner[c] = i + 1; q.push(c); } });
    let mine = 0, theirs = 0, myFood = 0;
    while (qi < q.length) {
      const c = q[qi++], x = c % W, y = (c / W) | 0, d = dist[c];
      for (const k in D) {
        const nx = x + D[k][0], ny = y + D[k][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = idx(nx, ny);
        if (blocked[n] || dist[n] >= 0) continue;
        if (soonRing <= d + 1 && edgeDist(nx, ny) < ring + 1 && state.turn >= 130) continue;
        dist[n] = d + 1; owner[n] = owner[c]; q.push(n);
        if (owner[c] === 0) { mine++; if (foodSet.has(n)) myFood += 1 / (d + 1); } else theirs++;
      }
    }
    return { mine, theirs, myFood };
  }
  // reachable space ignoring opponents
  function flood(start) {
    const seen = new Uint8Array(N); const q = [start]; seen[start] = 1; let qi = 0;
    while (qi < q.length) {
      const c = q[qi++], x = c % W, y = (c / W) | 0;
      for (const k in D) {
        const nx = x + D[k][0], ny = y + D[k][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = idx(nx, ny);
        if (blocked[n] || seen[n]) continue;
        seen[n] = 1; q.push(n);
      }
    }
    return q.length;
  }
  let best = 'up', bs = -Infinity;
  for (const k in D) {
    const x = me.head.x + D[k][0], y = me.head.y + D[k][1];
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const c = idx(x, y);
    if (blocked[c]) continue;
    let s = 0;
    const space = flood(c);
    if (space < me.length) s -= 5000 - space * 10;
    const tr = territory(c, me.length);
    s += tr.mine * 3 - tr.theirs * 1.5;
    s += Math.min(space, 60);
    const th = threat.get(c);
    if (th !== undefined) {
      if (th >= me.length) s -= 3000; else s += 40;
    }
    // exits count (avoid dead-end squeezes)
    let exits = 0;
    for (const k2 in D) {
      const ex = x + D[k2][0], ey = y + D[k2][1];
      if (ex < 0 || ey < 0 || ex >= W || ey >= H) continue;
      if (!blocked[idx(ex, ey)]) exits++;
    }
    if (exits === 0) s -= 800; else if (exits === 1) s -= 20;
    // food
    if (foodSet.has(c)) s += me.health < 40 ? 150 : (others.every(o => o.length < me.length + 2) ? 60 : 30);
    let fd = Infinity;
    for (const f of state.food) fd = Math.min(fd, Math.abs(f.x - x) + Math.abs(f.y - y));
    const hungry = me.health < 70 || me.length <= Math.max(...others.map(o => o.length), 0) + 1;
    if (fd < Infinity) s -= fd * (me.health < 35 ? 15 : hungry ? 5 : 1);
    // edge / storm
    const ed = edgeDist(x, y);
    if (state.turn >= 100) s += Math.min(ed, 5) * 8 - 0;
    else s += Math.min(ed, 2) * 3;
    if (state.turn >= 130) { const cx = Math.abs(x - (W - 1) / 2) + Math.abs(y - (H - 1) / 2); s -= cx * 2; }
    if (ed < ring) s -= 100000;
    if (s > bs) { bs = s; best = k; }
  }
  return best;
}
module.exports = { name: 'VoronoiViper', move };
