'use strict';
// Snake Royale bot: exact simultaneous-resolution simulator, adversarial screening of
// opponent move combinations, flood-fill space + Voronoi territory, storm forecasting,
// health-scaled food seeking, and trade-win logic when strictly longer.

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

module.exports = function move(state) {
  try {
    return decide(state);
  } catch (e) {
    return emergency(state);
  }
};

function emergency(state) {
  try {
    const me = state.you;
    const W = state.width, H = state.height;
    const occ = new Set();
    for (const s of state.snakes) for (const b of s.body) occ.add(b.y * W + b.x);
    let best = null, bestS = -Infinity;
    for (const d in DIRS) {
      const v = DIRS[d];
      const nx = me.head.x + v[0], ny = me.head.y + v[1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      let s = occ.has(ny * W + nx) ? -100 : 0;
      s += ((nx * 7 + ny * 13) % 3);
      if (s > bestS) { bestS = s; best = d; }
    }
    if (best) return best;
  } catch (e) { /* fall through */ }
  return 'up';
}

function decide(state) {
  const W = state.width, H = state.height, N = W * H;
  const me = state.you;
  const opps = (state.snakes || []).filter(s => s.id !== me.id);
  const myLen = me.body.length;
  const myBody = me.body.map(b => [b.x, b.y]);
  const foods = (state.food || []).map(f => f.y * W + f.x);
  const foodSet = new Set(foods);
  const turn = state.turn;

  // ---- storm ----
  const ring = ringFromHazards(state, W, H);
  const cap = Math.floor(Math.min(W, H) / 2) - 1;
  const ringF = Math.min(cap, state.nextShrinkTurn === turn ? ring + 1 : ring);
  const futureHazard = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (x < ringF || y < ringF || x >= W - ringF || y >= H - ringF) futureHazard[y * W + x] = 1;
  const activeHazard = new Set();
  for (const h of state.hazards || []) activeHazard.add(h.y * W + h.x);

  // ---- my candidate moves ----
  const myMoves = [];
  for (const name in DIRS) {
    const v = DIRS[name];
    const nx = me.head.x + v[0], ny = me.head.y + v[1];
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    if (myBody[1] && me.head.x - myBody[1][0] === -v[0] && me.head.y - myBody[1][1] === -v[1]) continue;
    myMoves.push({ name, dx: v[0], dy: v[1], nx, ny });
  }
  if (!myMoves.length) return emergency(state);

  // ---- opponent legal moves ----
  const oppData = opps.map(o => {
    const body = o.body.map(b => [b.x, b.y]);
    const neck = body[1];
    const moves = [];
    for (const name in DIRS) {
      const v = DIRS[name];
      const nx = body[0][0] + v[0], ny = body[0][1] + v[1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (neck && body[0][0] - neck[0] === -v[0] && body[0][1] - neck[1] === -v[1]) continue;
      moves.push({ dx: v[0], dy: v[1], nx, ny });
    }
    return {
      len: body.length, health: o.health, body,
      moves: moves.length ? moves : [{ dx: 0, dy: 0, nx: body[0][0], ny: body[0][1] }],
    };
  });

  // ---- opponent move-product (capped) ----
  let combos = [[]];
  for (const od of oppData) {
    const next = [];
    for (const pre of combos) {
      for (const mv of od.moves) {
        if (next.length >= 48) break;
        next.push(pre.concat([mv]));
      }
      if (next.length >= 48) break;
    }
    combos = next;
  }

  const maxOppLen = oppData.reduce((m, o) => Math.max(m, o.len), 0);
  const iLonger = myLen > maxOppLen;
  const iShorter = myLen < maxOppLen;
  const health = me.health;
  const foodUrg = health <= 30 ? 10 : health <= 55 ? 4.5 : 1.7;

  // ---- exact simultaneous-resolution simulation for one candidate + combo ----
  function simulate(myMv, combo) {
    // move all heads
    const movers = [];
    {
      const hx = myBody[0][0] + myMv.dx, hy = myBody[0][1] + myMv.dy;
      const eats = foodSet.has(hy * W + hx);
      const b2 = [[hx, hy]];
      const keep = myLen - (eats ? 0 : 1);
      for (let i = 0; i < keep; i++) b2.push(myBody[i]);
      movers.push({ body: b2, health: eats ? 100 : me.health - 1 });
    }
    for (let i = 0; i < oppData.length; i++) {
      const od = oppData[i], mv = combo[i];
      const hx = od.body[0][0] + mv.dx, hy = od.body[0][1] + mv.dy;
      const eats = foodSet.has(hy * W + hx);
      const b2 = [[hx, hy]];
      const keep = od.len - (eats ? 0 : 1);
      for (let j = 0; j < keep; j++) b2.push(od.body[j]);
      movers.push({ body: b2, health: eats ? 100 : od.health - 1 });
    }
    // elimination pass
    const mort = new Array(movers.length).fill(false);
    for (let i = 0; i < movers.length; i++) {
      const a = movers[i];
      const hx = a.body[0][0], hy = a.body[0][1];
      let dead = false;
      if (hx < 0 || hy < 0 || hx >= W || hy >= H) dead = true;
      else if (activeHazard.has(hy * W + hx)) dead = true;
      else if (a.health <= 0) dead = true;
      if (!dead) {
        for (let j = 0; j < movers.length && !dead; j++) {
          const b = movers[j].body;
          for (let k = 1; k < b.length; k++) {
            if (b[k][0] === hx && b[k][1] === hy) { dead = true; break; }
          }
        }
      }
      if (!dead) {
        for (let j = 0; j < movers.length && !dead; j++) {
          if (i === j) continue;
          const b = movers[j].body;
          if (b[0][0] === hx && b[0][1] === hy && b.length >= a.body.length) dead = true;
        }
      }
      mort[i] = dead;
    }
    return { movers, mort };
  }

  // BFS over a wall grid; returns Int32Array of distances (-1 unreachable)
  function bfsSource(sx, sy, walls) {
    const dist = new Int32Array(N).fill(-1);
    const q = new Int32Array(N);
    let qh = 0, qt = 0;
    dist[sy * W + sx] = 0;
    q[qt++] = sy * W + sx;
    while (qh < qt) {
      const i = q[qh++];
      const d = dist[i] + 1;
      const x = i % W, y = (i - x) / W;
      for (let t = 0; t < 4; t++) {
        const nx = x + (t === 0 ? 1 : t === 1 ? -1 : 0);
        const ny = y + (t === 2 ? 1 : t === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (dist[j] !== -1 || walls[j] || futureHazard[j]) continue;
        dist[j] = d;
        q[qt++] = j;
      }
    }
    return dist;
  }

  let bestName = null, bestScore = -Infinity;
  const comboN = Math.max(combos.length, 1);
  const DBG = typeof globalThis !== 'undefined' && globalThis.__SR_DEBUG;
  const dbg = DBG && turn === globalThis.__SR_DEBUG_TURN ? [] : null;

  for (const c of myMoves) {
    const myMv = { dx: c.dx, dy: c.dy, nx: c.nx, ny: c.ny };
    let score = 0;
    let riskDeaths = 0, mutualWinAll = true, hadSurv = false;
    let bestBranchScore = -Infinity;
    let oppDiedBranches = 0, oppDiedAll = true;

    for (const combo of combos) {
      const { movers, mort } = simulate(myMv, combo);
      if (mort[0]) {
        riskDeaths++;
        // mutual death outcomes: sole winner is the strictly longer final length
        let anyOppAlive = false, longest = true;
        for (let i = 1; i < movers.length; i++) {
          if (!mort[i]) anyOppAlive = true;
          else if (movers[i].body.length >= movers[0].body.length) longest = false;
        }
        if (!anyOppAlive && longest && iLonger && opps.length === 1) {
          score += 2200; // mutual kill, I finish strictly longest: sole first place
        } else if (!anyOppAlive) {
          score += 200; // equal-length mutual kill: shared first (draw, not a loss)
        } else {
          mutualWinAll = false;
          score -= 24000;
        }
        continue;
      }
      hadSurv = true;
      mutualWinAll = false;
      let someOppDead = false;
      for (let i = 1; i < mort.length; i++) if (mort[i]) someOppDead = true;
      if (someOppDead) oppDiedBranches++; else oppDiedAll = false;

      // walls: my body (keep tail last seg free) + living rivals' bodies
      const walls = new Uint8Array(N);
      {
        const b = movers[0].body;
        for (let k = 0; k < b.length - 1; k++) walls[b[k][1] * W + b[k][0]] = 1;
      }
      for (let i = 1; i < movers.length; i++) {
        if (mort[i]) continue;
        const b = movers[i].body;
        for (let k = 0; k < b.length - 1; k++) walls[b[k][1] * W + b[k][0]] = 1;
      }
      if (futureHazard[c.ny * W + c.nx]) { /* still legal this turn; flood treats it blocked */ }
      const myDist = bfsSource(c.nx, c.ny, walls);

      // flood area
      let area = 0;
      for (let i = 0; i < N; i++) if (myDist[i] >= 0) area++;

      // territory vs living rivals
      let terr = area;
      if (opps.length === 1 && !mort[1]) {
        const od = oppData[0];
        const oppDist = bfsSource(od.body[0][0] + combo[0].dx, od.body[0][1] + combo[0].dy, walls);
        terr = 0;
        for (let i = 0; i < N; i++) {
          if (myDist[i] >= 0 && (oppDist[i] < 0 || myDist[i] < oppDist[i])) terr++;
        }
      }

      // nearest reachable food
      let fd = Infinity;
      for (const f of foods) if (myDist[f] >= 0) fd = Math.min(fd, myDist[f]);

      let branchScore = 10 * area + 4 * terr;
      if (fd < Infinity) branchScore -= Math.min(fd, 24) * foodUrg * 2.0;
      else branchScore -= (health < 40 ? 300 : 50);
      bestBranchScore = Math.max(bestBranchScore, branchScore);
    }

    if (!hadSurv) {
      if (mutualWinAll && opps.length === 1) {
        // every branch is a mutual kill: strictly longest = sole first, equal = shared first
        const guaranteed = iLonger ? 3000 : 800;
        if (guaranteed > bestScore) { bestScore = guaranteed; bestName = c.name; }
      }
      continue;
    }

    // at least one opponent choice kills me -> they may take it
    if (riskDeaths > 0) score -= 2600 * (riskDeaths / comboN);
    if (bestBranchScore > -Infinity) score += bestBranchScore;

    if (oppDiedBranches > 0) {
      const frac = oppDiedBranches / comboN;
      score += (iShorter ? 80 : 700) * frac;
      if (oppDiedAll) score += 800;
    }

    score += ((c.nx * 7 + c.ny * 13 + turn * 5) % 7) * 0.25;

    if (dbg) dbg.push({ dir: c.name, score, riskDeaths, combos: combos.length });
    if (score > bestScore) { bestScore = score; bestName = c.name; }
  }

  if (dbg && dbg.length) {
    const line = `DBG t${turn}@(${me.head.x},${me.head.y}) len=${myLen} hp=${health}` +
      ` cands=${candsStr(myMoves)} -> ` + dbg.map(d => `${d.dir}:${d.score.toFixed(0)}(risk${d.riskDeaths}/${combos.length})`).join(' ');
    if (typeof globalThis !== 'undefined' && globalThis.__SR_HOOK) globalThis.__SR_HOOK.push(line);
    else console.log(line);
  }

  if (bestName) return bestName;

  // desperate fallback: maximize raw reachable area, avoid storm
  let db = null, dbs = -Infinity;
  for (const c of myMoves) {
    let s = activeHazard.has(c.ny * W + c.nx) ? -1000 : 100;
    s -= futureHazard[c.ny * W + c.nx] * 50;
    const seen = new Uint8Array(N);
    const q = new Int32Array(N);
    let qh = 0, qt = 0, area = 0;
    seen[c.ny * W + c.nx] = 1; q[qt++] = c.ny * W + c.nx;
    while (qh < qt) {
      const i = q[qh++]; area++;
      const x = i % W, y = (i - x) / W;
      for (let t = 0; t < 4; t++) {
        const nx = x + (t === 0 ? 1 : t === 1 ? -1 : 0);
        const ny = y + (t === 2 ? 1 : t === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (seen[j]) continue;
        seen[j] = 1; q[qt++] = j;
      }
    }
    s += area;
    if (s > dbs) { dbs = s; db = c.name; }
  }
  return db || myMoves[0].name;
}

function candsStr(myMoves, me) {
  return myMoves.map(m => `${m.name}(${m.nx},${m.ny})`).join('|');
}

function ringFromHazards(state, W, H) {  if (!state.hazards || state.hazards.length === 0) return 0;
  const set = new Set();
  for (const h of state.hazards) set.add(h.y * W + h.x);
  const cy = Math.floor(H / 2);
  for (let r = 1; r <= Math.floor(Math.min(W, H) / 2); r++) {
    if (set.has(cy * W + (r - 1)) && !set.has(cy * W + r)) return r;
  }
  return Math.floor(Math.min(W, H) / 2) - 1;
}
