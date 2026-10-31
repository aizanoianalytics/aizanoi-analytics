'use strict';

const ACTIONS = ['up', 'down', 'left', 'right'];
const DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], stay: [0, 0] };

class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(d, v) {
    const a = this.a;
    a.push([d, v]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      const t = a[p]; a[p] = a[i]; a[i] = t;
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        const t = a[m]; a[m] = a[i]; a[i] = t;
        i = m;
      }
    }
    return top;
  }
}

const idKey = a => String(a.id);
const byId = (a, b) => {
  const x = String(a.id), y = String(b.id);
  return x < y ? -1 : x > y ? 1 : 0;
};

module.exports = {
  name: 'GLM-Phalanx',
  move(state) {
    try { return plan(state); } catch (err) { return 'stay'; }
  }
};

function plan(state) {
  const W = state.width, H = state.height, N = W * H;
  const border = state.border;
  const west = state.team === 'west';
  const me = state.you;
  if (!me || me.jailed || me.respawnIn > 0 || me.x === null || me.y === null) return 'stay';

  const isAlive = a => a && !a.jailed && a.respawnIn === 0 && a.x !== null && a.y !== null;
  const aliveMine = [me].concat(state.teammates || []).filter(isAlive);
  const foes = (state.enemies || []).filter(isAlive);
  const myTeam = state.team;
  const enemyTeam = west ? 'east' : 'west';

  const wall = new Uint8Array(N);
  for (let y = 0; y < H; y++) {
    const row = state.grid[y];
    for (let x = 0; x < W; x++) if (row.charCodeAt(x) === 35) wall[y * W + x] = 1;
  }
  const cellOf = a => a.y * W + a.x;

  const isEnemySide = x => (west ? x > border : x < border);
  const isMineSide = x => (west ? x < border : x > border);

  const warCost = new Float64Array(N);
  const attackCost = new Float64Array(N);
  const unit = new Float64Array(N).fill(1);
  for (let i = 0; i < N; i++) {
    if (wall[i]) { warCost[i] = Infinity; attackCost[i] = Infinity; continue; }
    const x = i % W, y = (i - x) / W;
    if (isEnemySide(x)) {
      let d = 99;
      for (const f of foes) {
        const dd = Math.abs(f.x - x) + Math.abs(f.y - y);
        if (dd < d) d = dd;
      }
      const heavy = d <= 1 ? 150 : d === 2 ? 25 : 0;
      const light = d <= 1 ? 25 : d === 2 ? 5 : 0;
      warCost[i] = 1 + heavy;
      attackCost[i] = 1 + light;
    } else {
      warCost[i] = 1;
      attackCost[i] = 1;
    }
  }

  function dijkstra(sources, cost) {
    const dist = new Float64Array(N).fill(Infinity);
    const heap = new MinHeap();
    for (const s of sources) {
      if (s == null || s < 0 || wall[s]) continue;
      dist[s] = 0;
      heap.push(0, s);
    }
    while (heap.size) {
      const top = heap.pop();
      const d = top[0], i = top[1];
      if (d > dist[i]) continue;
      const x = i % W, y = (i - x) / W;
      for (const a of ACTIONS) {
        const nx = x + DELTA[a][0], ny = y + DELTA[a][1];
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const j = ny * W + nx;
        if (wall[j]) continue;
        const nd = d + cost[j];
        if (nd < dist[j]) { dist[j] = nd; heap.push(nd, j); }
      }
    }
    return dist;
  }

  function stepTo(field, blocked) {
    let best = 'stay';
    let bestVal = field[cellOf(me)];
    if (bestVal === Infinity) bestVal = Infinity;
    for (const a of ACTIONS) {
      const nx = me.x + DELTA[a][0], ny = me.y + DELTA[a][1];
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const j = ny * W + nx;
      if (wall[j]) continue;
      if (blocked && blocked(nx, ny)) continue;
      const v = field[j];
      if (v < bestVal) { bestVal = v; best = a; }
    }
    return best;
  }

  const myHalfSources = [];
  for (let i = 0; i < N; i++) {
    if (wall[i]) continue;
    if (isMineSide(i % W)) myHalfSources.push(i);
  }
  const distHome = dijkstra(myHalfSources, warCost);

  if (me.carrying) {
    if (isMineSide(me.x)) return 'stay';
    return stepTo(distHome);
  }

  const taken = new Set();
  const chaserField = null;

  const eCarrier = foes.find(f => f.carrying) || null;
  if (eCarrier) {
    const dC = dijkstra([cellOf(eCarrier)], unit);
    let escape = Infinity;
    for (let y = 0;y < H;y++){
      const j = y * W + border;
      if (!wall[j] && dC[j] < escape) escape = dC[j];
    }
    const cands = aliveMine
      .filter(m => !m.carrying)
      .map(m => ({ m: m, d: dC[cellOf(m)] }))
      .filter(o => o.d + 1 <= escape)
      .sort((a, b) => (a.d - b.d) || byId(a.m, b.m));
    for (const o of cands.slice(0, 2)) {
      taken.add(idKey(o.m));
      if (o.m.id === me.id) return stepTo(dC, isEnemySide);
    }
  }

  if (state.flags[enemyTeam].carrier === null) {
    const flag = state.flags[enemyTeam];
    const dF = dijkstra([cellOf(flag)], attackCost);
    const cands = aliveMine
      .filter(m => !m.carrying && !taken.has(idKey(m)))
      .map(m => ({ m: m, d: dF[cellOf(m)] }))
      .filter(o => o.d < Infinity)
      .sort((a, b) => (a.d - b.d) || byId(a.m, b.m));
    for (const o of cands.slice(0, 2)) {
      taken.add(idKey(o.m));
      if (o.m.id === me.id) return stepTo(dF);
    }
  }

  const prisoners = (state.teammates || []).filter(m => m.jailed);
  if (prisoners.length && !eCarrier) {
    const jail = state.zones[enemyTeam].jail;
    const jSources = jail.map(p => p.y * W + p.x).filter(j => !wall[j]);
    if (jSources.length) {
      const dJ = dijkstra(jSources, warCost);
      const cands = aliveMine
        .filter(m => !m.carrying && !taken.has(idKey(m)))
        .map(m => ({ m: m, d: dJ[cellOf(m)] }))
        .filter(o => o.d < Infinity)
        .sort((a, b) => (a.d - b.d) || byId(a.m, b.m));
      if (cands.length && cands[0].d * 2 < 400) {
        taken.add(idKey(cands[0].m));
        if (cands[0].m.id === me.id) return stepTo(dJ);
      }
    }
  }

  const raiders = foes.filter(f => isMineSide(f.x));
  if (raiders.length) {
    let best = null, bestD = Infinity;
    for (const f of raiders) {
      const d = Math.abs(f.x - me.x) + Math.abs(f.y - me.y);
      if (d < bestD || (d === bestD && best && byId(f, best) < 0)) { best = f; bestD = d; }
    }
    const dR = dijkstra([cellOf(best)], unit);
    return stepTo(dR, isEnemySide);
  }

  const myStand = state.zones[myTeam].home[4];
  const sortedMates = aliveMine.filter(m => !m.carrying && !taken.has(idKey(m))).sort(byId);
  const myDefIndex = sortedMates.findIndex(m => m.id === me.id);
  if (myDefIndex >= 0) {
    const posts = [];
    for (let i = 0; i < N; i++) {
      if (wall[i]) continue;
      const x = i % W, y = (i - x) / W;
      if (!isMineSide(x)) continue;
      const dm = Math.abs(x - myStand.x) + Math.abs(y - myStand.y);
      if (dm < 2 || dm > 7) continue;
      posts.push({ i: i, x: x, y: y, key: (west ? -x : x) * 10000 + Math.abs(y - myStand.y) * 100 + (-y + 200) });
    }
    posts.sort((a, b) => a.key - b.key || a.i - b.i);
    if (posts.length) {
      const post = posts[myDefIndex % posts.length];
      const dPost = dijkstra([post.i], unit);
      return stepTo(dPost, isEnemySide);
    }
  }

  return 'stay';
}
