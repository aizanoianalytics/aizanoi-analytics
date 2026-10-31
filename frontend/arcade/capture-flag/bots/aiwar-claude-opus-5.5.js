'use strict';

// Opus Bastion: impregnable flag guard + risk-free hunters + provably-safe raiders.
(function () {
  const DIRV = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];
  const INF = 1e9;
  const GUARD_CHASE = false;
  let mem = null;

  function idStr(a) { return String(a.id); }
  function cmpId(a, b) { const x = idStr(a), y = idStr(b); return x < y ? -1 : x > y ? 1 : 0; }
  function manh(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function isActive(a) { return a && !a.jailed && a.respawnIn === 0 && a.x !== null && a.y !== null; }

  function decide(state) {
    const W = state.width, H = state.height, N = W * H;
    const grid = state.grid;
    const border = state.border;
    const me = state.you;
    if (!isActive(me)) return 'stay';
    const team = state.team;
    const enemyTeam = team === 'west' ? 'east' : 'west';
    const ownHalf = x => team === 'west' ? x < border : x > border;
    const enemyHalf = x => team === 'west' ? x > border : x < border;
    const open = (x, y) => x >= 0 && y >= 0 && x < W && y < H && grid[y][x] !== '#';
    const idx = (x, y) => y * W + x;

    // neighbor lists
    if (!mem || mem.W !== W || mem.H !== H || mem.gridKey !== grid.join('')) {
      const nb = new Array(N);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const l = [];
        if (open(x, y)) for (const d of DIRV) if (open(x + d[1], y + d[2])) l.push(idx(x + d[1], y + d[2]));
        nb[idx(x, y)] = l;
      }
      mem = { W, H, gridKey: grid.join(''), nb, distCache: new Map() };
    }
    const nb = mem.nb;

    function bfs(sx, sy) {
      const d = new Int32Array(N).fill(INF);
      if (!open(sx, sy)) return d;
      const q = new Int32Array(N);
      let h = 0, t = 0;
      const s = idx(sx, sy);
      d[s] = 0; q[t++] = s;
      while (h < t) {
        const c = q[h++];
        const nd = d[c] + 1;
        for (const n of nb[c]) if (d[n] > nd) { d[n] = nd; q[t++] = n; }
      }
      return d;
    }
    function distFrom(p) {
      const k = idx(p.x, p.y);
      let d = mem.distCache.get(k);
      if (!d) { d = bfs(p.x, p.y); mem.distCache.set(k, d); }
      return d;
    }

    const myFlag = state.flags[team];
    const enFlag = state.flags[enemyTeam];
    const myStand = myFlag.home;
    const enStand = enFlag.home;
    const myJail = state.zones[team].jail;       // where enemies are held (my half)
    const enJail = state.zones[enemyTeam].jail;  // where my mates are held

    const mates = [me].concat(state.teammates).sort(cmpId);
    const activeMates = mates.filter(isActive);
    const enemies = state.enemies.slice().sort(cmpId);

    // Enemy ETA maps: earliest time each enemy can be AT a cell.
    const enemyEta = [];
    for (const e of enemies) {
      let delay, src;
      if (isActive(e)) { delay = 0; src = e; }
      else if (e.jailed) { delay = Math.max(1, 40 - e.jailTicks) + 1; src = enStand; }
      else { delay = e.respawnIn + 1; src = enStand; }
      enemyEta.push({ e, delay, d: distFrom(src), active: isActive(e) });
    }
    // threatT[c]: earliest time an enemy can be in tag range of me standing at c (only in enemy half).
    const threatT = new Int32Array(N).fill(INF);
    for (let c = 0; c < N; c++) {
      const x = c % W, y = (c / W) | 0;
      if (!enemyHalf(x) || !open(x, y)) continue;
      let best = INF;
      for (const ee of enemyEta) {
        let m = ee.d[c];
        for (const n of nb[c]) if (ee.d[n] < m && enemyHalf(n % W)) m = ee.d[n];
        // also Manhattan-adjacent cells through walls
        const cand = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
        for (const [ax, ay] of cand) if (open(ax, ay) && enemyHalf(ax)) { const v = ee.d[idx(ax, ay)]; if (v < m) m = v; }
        m += ee.delay;
        if (m < best) best = m;
      }
      threatT[c] = best;
    }

    // Safe BFS: earliest arrival times under pessimistic interception model.
    function safeBfs(sx, sy, t0) {
      const arr = new Int32Array(N).fill(INF);
      const first = new Int32Array(N).fill(-1);
      const q = new Int32Array(N);
      let h = 0, t = 0;
      const s = idx(sx, sy);
      arr[s] = t0; q[t++] = s;
      while (h < t) {
        const c = q[h++];
        const nt = arr[c] + 1;
        for (const n of nb[c]) {
          if (arr[n] <= nt) continue;
          if (threatT[n] <= nt) continue;
          arr[n] = nt;
          first[n] = c === s ? n : first[c];
          q[t++] = n;
        }
      }
      return { arr, first };
    }
    function dirTo(n) {
      if (n < 0) return 'stay';
      const x = n % W, y = (n / W) | 0;
      for (const d of DIRV) if (me.x + d[1] === x && me.y + d[2] === y) return d[0];
      return 'stay';
    }
    const myIdx = idx(me.x, me.y);
    const myMoves = [myIdx].concat(nb[myIdx]);

    // Fallback mover: choose a neighbor that minimizes dist map value, avoiding danger.
    function stepToward(dmap, restrictOwn) {
      let best = null, bs = INF;
      for (const n of myMoves) {
        const x = n % W;
        if (restrictOwn && enemyHalf(x)) continue;
        let s = dmap[n] * 10;
        if (enemyHalf(x)) { if (threatT[n] <= 1) s += 100000; else if (threatT[n] <= 2) s += 30; }
        if (s < bs) { bs = s; best = n; }
      }
      return best === null ? 'stay' : dirTo(best === myIdx ? -1 : best);
    }
    function flee() {
      let best = myIdx, bs = -INF;
      for (const n of myMoves) {
        const x = n % W;
        let s = enemyHalf(x) ? threatT[n] : 500;
        s = s * 10 - (ownHalf(x) ? 0 : 1);
        if (s > bs) { bs = s; best = n; }
      }
      return dirTo(best === myIdx ? -1 : best);
    }

    const ownCellsDist = (function () {
      // multi-source: distance to nearest own-half cell
      const d = new Int32Array(N).fill(INF);
      const q = new Int32Array(N); let h = 0, t = 0;
      for (let c = 0; c < N; c++) { const x = c % W, y = (c / W) | 0; if (ownHalf(x) && open(x, y)) { d[c] = 0; q[t++] = c; } }
      while (h < t) { const c = q[h++]; for (const n of nb[c]) if (d[n] > d[c] + 1) { d[n] = d[c] + 1; q[t++] = n; } }
      return d;
    })();

    // ---------- carrier ----------
    if (me.carrying) {
      const sb = safeBfs(me.x, me.y, 0);
      let best = -1, bt = INF;
      for (let c = 0; c < N; c++) if (ownHalf(c % W) && sb.arr[c] < bt) { bt = sb.arr[c]; best = c; }
      if (best >= 0) return dirTo(sb.first[best]);
      // no guaranteed path: best effort
      let bm = myIdx, bs = INF;
      for (const n of myMoves) {
        const x = n % W;
        let s = ownCellsDist[n] * 10;
        if (enemyHalf(x)) { if (threatT[n] <= 1) s += 1000; else if (threatT[n] <= 2) s += 15; }
        if (s < bs) { bs = s; bm = n; }
      }
      return dirTo(bm === myIdx ? -1 : bm);
    }

    // ---------- role assignment ----------
    const myDistStand = distFrom(myStand);
    const enemyFlagCarried = myFlag.carrier !== null;
    // guard: active mate closest to own stand (stable by id)
    let guard = null;
    {
      let bd = INF;
      for (const a of activeMates) {
        if (a.carrying) continue;
        const d = myDistStand[idx(a.x, a.y)];
        const prevGuard = mem.guardId !== undefined && idStr(a) === mem.guardId;
        const score = d - (prevGuard ? 3 : 0);
        if (score < bd) { bd = score; guard = a; }
      }
    }
    mem.guardId = guard ? idStr(guard) : undefined;
    // enemy earliest time to my stand
    let enemyToStand = INF;
    for (const ee of enemyEta) enemyToStand = Math.min(enemyToStand, ee.d[idx(myStand.x, myStand.y)] + ee.delay);

    const intruders = enemies.filter(e => isActive(e) && ownHalf(e.x));

    // ---------- guard ----------
    const iAmGuard = guard && idStr(guard) === idStr(me);
    const myDS = myDistStand[myIdx];
    const guardFree = iAmGuard && !enemyFlagCarried && enemyToStand > myDS + 4 && activeMates.length === 1;
    if (iAmGuard && !guardFree && !enemyFlagCarried) {
      // move to a cell within Manhattan 1 of stand, maximizing tag chances
      let best = null, bs = -INF;
      for (const n of myMoves) {
        const x = n % W, y = (n / W) | 0;
        const p = { x, y };
        const dS = manh(p, myStand);
        let s = 0;
        const leashOk = dS <= 1 || myDistStand[n] <= enemyToStand - 1;
        if (!leashOk || !ownHalf(x)) s -= 1000 + myDistStand[n] * 10;
        if (dS === 0) s += 0.5;
        if (dS > 1) s -= 60 + 0.3 * myDistStand[n];
        for (const e of intruders.concat(enemies.filter(e => isActive(e) && e.x === border))) {
          const opts = [idx(e.x, e.y)].concat(nb[idx(e.x, e.y)]);
          let hit = 0, tot = 0;
          for (const o of opts) {
            tot++;
            const ox = o % W, oy = (o / W) | 0;
            if (ownHalf(ox) && Math.abs(ox - x) + Math.abs(oy - y) <= 1) hit++;
          }
          s += (hit === tot ? 50 : 0) + 10 * hit / tot - (GUARD_CHASE ? 1 : 0.1) * Math.min(distFrom(e)[n], 30);
        }
        if (s > bs) { bs = s; best = n; }
      }
      return dirTo(best === myIdx ? -1 : best);
    }

    // ---------- chase our stolen flag ----------
    if (enemyFlagCarried) {
      const carrier = enemies.find(e => String(e.id) === String(myFlag.carrier));
      if (carrier && isActive(carrier)) {
        return hunt(carrier, true);
      }
    }

    function hunt(e, allowBorder) {
      const ei = idx(e.x, e.y);
      const opts = [ei].concat(nb[ei]);
      const de = distFrom(e);
      let best = myIdx, bs = -INF;
      for (const n of myMoves) {
        const x = n % W, y = (n / W) | 0;
        if (enemyHalf(x)) continue;
        if (!allowBorder && x === border && !ownHalf(e.x)) continue;
        let hit = 0;
        if (ownHalf(x)) for (const o of opts) {
          const ox = o % W, oy = (o / W) | 0;
          if (ownHalf(ox) && Math.abs(ox - x) + Math.abs(oy - y) <= 1) hit++;
        }
        // prefer cutting off retreat: distance from e's escape (border) side
        let s = (hit === opts.length ? 100 : 0) + hit * 5 - de[n] * 3 - ownCellsDistEnemy(n) * 0.5;
        if (s > bs) { bs = s; best = n; }
      }
      return dirTo(best === myIdx ? -1 : best);
    }
    // distance to border column (encourage staying between intruder and border)
    function ownCellsDistEnemy(n) { return Math.abs((n % W) - border); }

    // ---------- non-guard ----------
    const others = activeMates.filter(a => !guard || idStr(a) !== idStr(guard) || guardFree);
    // Hunt intruders: assign each intruder to nearest non-guard in own half
    if (intruders.length && ownHalf(me.x) || (intruders.length && me.x === border)) {
      let bestE = null, bd = INF;
      for (const e of intruders) {
        const de = distFrom(e);
        // am I the closest non-guard hunter (or second for pincer)?
        const mine = de[myIdx];
        let closer = 0;
        for (const a of others) if (idStr(a) !== idStr(me) && !a.carrying && !enemyHalf(a.x) && de[idx(a.x, a.y)] < mine) closer++;
        if (closer < 2 && mine < bd && mine <= 12) { bd = mine; bestE = e; }
      }
      if (bestE) return hunt(bestE, false);
    }

    // Raider logic
    const sb = safeBfs(me.x, me.y, 0);
    const prisoners = mates.filter(a => a.jailed);
    // rescue
    if (prisoners.length) {
      let bt = INF, bc = -1;
      for (const j of enJail) for (let k = -1; k < nb[idx(j.x, j.y)].length; k++) {
        const c = k < 0 ? idx(j.x, j.y) : nb[idx(j.x, j.y)][k];
        if (sb.arr[c] < bt) { bt = sb.arr[c]; bc = c; }
      }
      // only rescue if jail time remaining is meaningful and I'm the closest
      const remaining = 40 - Math.min.apply(null, prisoners.map(p => p.jailTicks));
      if (bc >= 0 && bt + 4 < remaining) {
        if (bc === myIdx) return 'stay';
        return dirTo(sb.first[bc]);
      }
    }
    // capture attempt
    if (enFlag.carrier === null) {
      const fi = idx(enFlag.x, enFlag.y);
      if (sb.arr[fi] < INF) {
        const back = safeBfs(enFlag.x, enFlag.y, sb.arr[fi]);
        let ok = false;
        for (let c = 0; c < N; c++) if (ownHalf(c % W) && back.arr[c] < INF) { ok = true; break; }
        if (ok) return dirTo(sb.first[fi]);
      }
    }
    // enemy currently carried by teammate: escort? just pressure
    // Pressure: go to safe staging cell near enemy flag, with margin.
    const dF = distFrom(enStand);
    let target = -1, ts = INF;
    const myRank = others.findIndex(a => idStr(a) === idStr(me));
    for (let c = 0; c < N; c++) {
      if (sb.arr[c] >= INF) continue;
      const x = c % W;
      const margin = enemyHalf(x) ? threatT[c] - sb.arr[c] : 99;
      if (margin < 3) continue;
      // spread raiders vertically
      const y = (c / W) | 0;
      const pref = myRank % 2 === 0 ? 0 : 1;
      const s = dF[c] * 4 + (pref ? (y > enStand.y ? 0 : 2) : (y < enStand.y ? 0 : 2)) + sb.arr[c] * 0.1;
      if (s < ts) { ts = s; target = c; }
    }
    if (target === myIdx) {
      return 'stay';
    }
    if (target >= 0) return dirTo(sb.first[target]);
    return flee();
  }

  function move(state) {
    try {
      return decide(state);
    } catch (e) {
      return 'stay';
    }
  }

  module.exports = { name: 'Opus Bastion', move: move };
})();
