'use strict';
module.exports = {
  name: 'Anchor',
  move(state) {
    try { return decide(state); } catch (e) { return 'stay'; }
  }
};

const MV = [['stay', 0, 0], ['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];

function decide(state) {
  const me = state.you;
  const act = a => a.x !== null && !a.jailed && a.respawnIn === 0;
  if (!act(me)) return 'stay';
  const W = state.width, H = state.height, B = state.border, grid = state.grid;
  const team = state.team, opp = team === 'west' ? 'east' : 'west';
  const west = team === 'west';
  const mine = x => west ? x < B : x > B;
  const theirs = x => west ? x > B : x < B;
  const open = (x, y) => x >= 0 && x < W && y >= 0 && y < H && grid[y][x] !== '#';
  const man = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const enemies = state.enemies.filter(act);
  const mates = [me].concat(state.teammates.filter(act));
  const myFlag = state.flags[team], enFlag = state.flags[opp];
  const stand = myFlag.home;

  // danger map: cells where an enemy could tag me next tick (only in their half)
  const danger = new Uint8Array(W * H);
  for (const e of enemies) {
    for (const m of MV) {
      const ex = e.x + m[1], ey = e.y + m[2];
      if (!open(ex, ey) || !theirs(ex)) continue;
      for (const n of MV) {
        const cx = ex + n[1], cy = ey + n[2];
        if (cx >= 0 && cx < W && cy >= 0 && cy < H && theirs(cx)) danger[cy * W + cx] = 1;
      }
    }
  }
  const cost = i => 1 + (danger[i] ? 25 : 0);

  function dmap(targets, penal) {
    const D = new Float64Array(W * H).fill(1e9);
    const q = [];
    for (const t of targets) { D[t.y * W + t.x] = 0; q.push(t.y * W + t.x); }
    for (let h = 0; h < q.length; h++) {
      const n = q[h];
      const nx = n % W, ny = (n / W) | 0;
      const c = penal ? cost(n) : 1;
      for (let k = 1; k < 5; k++) {
        const x = nx + MV[k][1], y = ny + MV[k][2];
        if (!open(x, y)) continue;
        const i = y * W + x;
        if (D[n] + c < D[i]) { D[i] = D[n] + c; q.push(i); }
      }
      if (q.length > 40000) break;
    }
    return D;
  }
  const cur = me.y * W + me.x;

  // pick move by distance map. opts: safe (avoid danger), stayInHalf
  function pick(D, safeOnly, filt) {
    let best = null, bs = 1e18;
    let bestUnsafe = null, bu = 1e18;
    for (const m of MV) {
      const x = me.x + m[1], y = me.y + m[2];
      if (!open(x, y)) continue;
      if (filt && !filt(x, y)) continue;
      const i = y * W + x;
      const s = D[i] + (m[0] === 'stay' ? 0.01 : 0);
      if (!danger[i]) { if (s < bs) { bs = s; best = m[0]; } }
      else if (s < bu) { bu = s; bestUnsafe = m[0]; }
    }
    if (best) return best;
    if (safeOnly) {
      // all moves dangerous: maximise distance from enemies
      let far = 'stay', fs = -1;
      for (const m of MV) {
        const x = me.x + m[1], y = me.y + m[2];
        if (!open(x, y)) continue;
        let md = 99;
        for (const e of enemies) md = Math.min(md, Math.abs(e.x - x) + Math.abs(e.y - y));
        if (md > fs) { fs = md; far = m[0]; }
      }
      return far;
    }
    return bestUnsafe || 'stay';
  }

  const ownCells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (open(x, y) && mine(x)) ownCells.push({ x, y });

  // 1. carrier: run home
  if (me.carrying) {
    return pick(dmap(ownCells, true), false);
  }

  const myFlagStolen = myFlag.carrier !== null;
  const dStand = a => man(a, stand);
  // camper = non-carrier active mate closest to the stand
  let camper = null;
  for (const a of mates) {
    if (a.carrying) continue;
    if (!camper || dStand(a) < dStand(camper) || (dStand(a) === dStand(camper) && String(a.id) < String(camper.id))) camper = a;
  }
  const isCamper = camper && camper.id === me.id;

  // enemy carrying my flag: everyone in own half hunts it
  if (myFlagStolen) {
    const car = state.enemies.find(e => e.id === myFlag.carrier);
    if (car && act(car)) {
      const D = dmap([{ x: car.x, y: car.y }], false);
      if (mine(me.x)) return pick(D, false, (x) => mine(x));
    }
  }

  if (isCamper) {
    // pure camp: standing on the stand is untouchable and unpassable
    const D = dmap([stand], false);
    return pick(D, false, (x) => mine(x));
  }

  // attacker
  const targets = [];
  const jailed = state.teammates.filter(a => a.jailed);
  const mateCarry = mates.some(a => a.carrying);
  let goFlag = enFlag.carrier === null;
  if (goFlag) targets.push({ x: enFlag.x, y: enFlag.y });
  const jail = state.zones[opp].jail;
  if (jailed.length && (!goFlag || true)) {
    // consider rescue if it's closer than the flag
    const Dj = dmap(jail, true);
    const Df = goFlag ? dmap([enFlag], true) : null;
    const jd = Dj[cur] - 1;
    if (!Df || jd + 4 < Df[cur] - 0) {
      return pick(Dj, false);
    }
    return pick(Df, false);
  }
  if (goFlag) return pick(dmap(targets, true), false);
  // teammate carries: lurk at border near enemy stand
  const bt = [];
  for (let y = 0; y < H; y++) if (open(B, y)) bt.push({ x: B, y });
  const Ds = dmap([enFlag.home], false);
  bt.sort((a, b) => Ds[a.y * W + a.x] - Ds[b.y * W + b.x]);
  return pick(dmap([bt[0]], true), false);
}
