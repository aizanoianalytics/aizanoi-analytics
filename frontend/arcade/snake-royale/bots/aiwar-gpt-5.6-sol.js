'use strict';

// Crown Serpent: simultaneous-move search in duels, territory control otherwise.
const MOVES = [
  { name: 'up', dx: 0, dy: -1 },
  { name: 'down', dx: 0, dy: 1 },
  { name: 'left', dx: -1, dy: 0 },
  { name: 'right', dx: 1, dy: 0 }
];
const INF = 1000000000;

function key(x, y) { return x + ',' + y; }
function inside(g, x, y) { return x >= 0 && y >= 0 && x < g.w && y < g.h; }
function eq(a, b) { return a.x === b.x && a.y === b.y; }
function hasPoint(list, x, y) {
  for (let i = 0; i < list.length; i++) if (list[i].x === x && list[i].y === y) return true;
  return false;
}
function hazard(g, x, y) { return hasPoint(g.hazards, x, y); }

function copyGame(state) {
  return {
    w: state.width, h: state.height, turn: state.turn,
    nextShrink: typeof state.nextShrinkTurn === 'number' ? state.nextShrinkTurn : INF,
    hazards: (state.hazards || []).map(p => ({ x: p.x, y: p.y })),
    food: (state.food || []).map(p => ({ x: p.x, y: p.y })),
    snakes: (state.snakes || []).map(s => ({
      id: s.id, alive: true, health: s.health,
      body: s.body.map(p => ({ x: p.x, y: p.y }))
    }))
  };
}

// Exact collision order for a known set of simultaneous actions. Food spawning is
// intentionally omitted: it cannot affect the move being searched and its RNG is hidden.
function stepGame(g, actions) {
  const n = {
    w: g.w, h: g.h, turn: g.turn + 1,
    nextShrink: g.nextShrink, hazards: g.hazards.map(p => ({ x: p.x, y: p.y })),
    food: g.food.map(p => ({ x: p.x, y: p.y })),
    snakes: g.snakes.map(s => ({ id: s.id, alive: s.alive, health: s.health,
      body: s.body.map(p => ({ x: p.x, y: p.y })) }))
  };
  const ate = Object.create(null);
  for (const s of n.snakes) if (s.alive) {
    const d = MOVES[actions[s.id] == null ? 0 : actions[s.id]];
    s.body.unshift({ x: s.body[0].x + d.dx, y: s.body[0].y + d.dy });
    s.health--;
  }
  for (const s of n.snakes) if (s.alive) {
    let fi = -1;
    for (let i = 0; i < n.food.length; i++) if (eq(s.body[0], n.food[i])) { fi = i; break; }
    if (fi >= 0) { ate[s.id] = true; s.health = 100; }
    else s.body.pop();
  }
  if (Object.keys(ate).length) {
    n.food = n.food.filter(f => {
      for (const s of n.snakes) if (s.alive && ate[s.id] && eq(s.body[0], f)) return false;
      return true;
    });
  }
  const dead = [];
  for (const s of n.snakes) if (s.alive) {
    const q = s.body[0];
    let die = !inside(n, q.x, q.y) || hazard(n, q.x, q.y) || s.health <= 0;
    if (!die) outer: for (const t of n.snakes) if (t.alive) {
      for (let j = 1; j < t.body.length; j++) if (eq(q, t.body[j])) { die = true; break outer; }
    }
    if (!die) for (const t of n.snakes) if (t.alive && t.id !== s.id &&
      eq(q, t.body[0]) && t.body.length >= s.body.length) { die = true; break; }
    if (die) dead.push(s);
  }
  for (const s of dead) s.alive = false;

  // Expansion occurs after collisions. Cells covered now are survivable until next move.
  if (g.turn === g.nextShrink) {
    let ring = 0;
    if (n.hazards.length) {
      while (ring < Math.floor(Math.min(n.w, n.h) / 2) &&
        hasPoint(n.hazards, ring, ring)) ring++;
    }
    const nr = Math.min(Math.floor(Math.min(n.w, n.h) / 2) - 1, ring + 1);
    n.hazards = [];
    for (let y = 0; y < n.h; y++) for (let x = 0; x < n.w; x++)
      if (x < nr || y < nr || x >= n.w - nr || y >= n.h - nr) n.hazards.push({ x, y });
    n.food = n.food.filter(f => !hazard(n, f.x, f.y));
    n.nextShrink += 20;
  }
  return n;
}

function safeMoveIndices(g, s, conservative) {
  const out = [];
  if (!s || !s.alive) return out;
  for (let mi = 0; mi < 4; mi++) {
    const d = MOVES[mi], x = s.body[0].x + d.dx, y = s.body[0].y + d.dy;
    if (!inside(g, x, y) || hazard(g, x, y)) continue;
    const grows = hasPoint(g.food, x, y);
    let hit = false;
    for (const t of g.snakes) if (t.alive) {
      let lim = t.body.length;
      if (t.id === s.id && !grows) lim--; // our own tail certainly vacates
      else if (!conservative && t.id !== s.id) lim--; // optimistic territory calculation
      for (let j = 0; j < lim; j++) if (t.body[j].x === x && t.body[j].y === y) { hit = true; break; }
      if (hit) break;
    }
    if (!hit) out.push(mi);
  }
  return out;
}

function makeBlocked(g, ignoreHeads, releaseTails) {
  const b = new Uint8Array(g.w * g.h);
  for (const p of g.hazards) if (inside(g, p.x, p.y)) b[p.y * g.w + p.x] = 1;
  for (const s of g.snakes) if (s.alive) {
    const end = Math.max(ignoreHeads ? 1 : 0, s.body.length - (releaseTails ? 1 : 0));
    for (let i = ignoreHeads ? 1 : 0; i < end; i++) {
      const p = s.body[i]; if (inside(g, p.x, p.y)) b[p.y * g.w + p.x] = 1;
    }
  }
  return b;
}

function distances(g, starts, blocked) {
  const N = g.w * g.h, ds = new Int16Array(N); ds.fill(32767);
  const q = new Int16Array(N); let a = 0, z = 0;
  for (const p of starts) if (inside(g, p.x, p.y)) {
    const i = p.y * g.w + p.x;
    if (ds[i] === 32767) { ds[i] = 0; q[z++] = i; }
  }
  while (a < z) {
    const i = q[a++], x = i % g.w, y = (i / g.w) | 0, nd = ds[i] + 1;
    for (let k = 0; k < 4; k++) {
      const nx = x + MOVES[k].dx, ny = y + MOVES[k].dy;
      if (!inside(g, nx, ny)) continue;
      const j = ny * g.w + nx;
      if (!blocked[j] && ds[j] === 32767) { ds[j] = nd; q[z++] = j; }
    }
  }
  return ds;
}

function positional(g, myId, rich) {
  const me = g.snakes.find(s => s.id === myId);
  const foes = g.snakes.filter(s => s.id !== myId);
  const livingFoes = foes.filter(s => s.alive);
  if (!me || !me.alive) {
    if (!livingFoes.length) {
      const ml = me ? me.body.length : 0;
      let ol = 0; for (const s of foes) ol = Math.max(ol, s.body.length);
      return (ml - ol) * 1000;
    }
    return -1000000;
  }
  if (!livingFoes.length) return 1000000 + me.body.length * 100;

  const blocked = makeBlocked(g, true, true);
  const md = distances(g, [me.body[0]], blocked);
  const od = distances(g, livingFoes.map(s => s.body[0]), blocked);
  let mySpace = 0, territory = 0, contested = 0;
  for (let i = 0; i < md.length; i++) if (md[i] < 32767) {
    mySpace++;
    if (md[i] < od[i]) territory++;
    else if (md[i] === od[i]) contested++;
  }
  let oppSpace = 0;
  for (let i = 0; i < od.length; i++) if (od[i] < 32767) oppSpace++;
  const maxOppLen = livingFoes.reduce((m, s) => Math.max(m, s.body.length), 0);
  let score = (me.body.length - maxOppLen) * 170 + territory * 13 + contested * 2;
  score += Math.min(mySpace, me.body.length + 12) * 7 - Math.max(0, me.body.length - mySpace) * 400;
  score -= Math.max(0, oppSpace - mySpace) * 1.5;
  score += Math.min(me.health, 45) * 1.2;

  const edge = Math.min(me.body[0].x, me.body[0].y, g.w - 1 - me.body[0].x, g.h - 1 - me.body[0].y);
  const cx = (g.w - 1) / 2, cy = (g.h - 1) / 2;
  if (g.turn > 120 || g.hazards.length) score += edge * 8 - (Math.abs(me.body[0].x - cx) + Math.abs(me.body[0].y - cy)) * 2;

  let foodDist = 32767;
  for (const f of g.food) foodDist = Math.min(foodDist, md[f.y * g.w + f.x]);
  if (foodDist < 32767) {
    const urgency = me.health <= 18 ? 90 : me.health <= 35 ? 32 : me.body.length <= maxOppLen ? 16 : 5;
    score += urgency / (foodDist + 1);
    if (foodDist >= me.health) score -= 500;
  } else if (me.health < 20) score -= (20 - me.health) * 25;

  if (rich) {
    const exits = safeMoveIndices(g, me, true).length;
    score += exits * 18;
    if (!exits) score -= 20000;
  }
  return score;
}

function duelSearch(g, myId) {
  const me = g.snakes.find(s => s.id === myId);
  const opp = g.snakes.find(s => s.id !== myId && s.alive);
  if (!me || !opp) return 0;
  const mine = safeMoveIndices(g, me, false);
  const rootMoves = mine.length ? mine : [0, 1, 2, 3];
  let bestMove = rootMoves[0], best = -Infinity;

  // Three simultaneous plies: 4^6 worst case, with cheap leaf evaluation.
  function value(pos, depth) {
    if (depth === 0 || !pos.snakes.find(s => s.id === myId && s.alive) ||
        !pos.snakes.find(s => s.id === opp.id && s.alive)) return positional(pos, myId, depth === 0);
    const a = pos.snakes.find(s => s.id === myId && s.alive);
    const b = pos.snakes.find(s => s.id === opp.id && s.alive);
    let am = safeMoveIndices(pos, a, false), bm = safeMoveIndices(pos, b, false);
    if (!am.length) am = [0, 1, 2, 3];
    if (!bm.length) bm = [0, 1, 2, 3];
    let vmax = -Infinity;
    for (const ai of am) {
      let vmin = Infinity;
      for (const bi of bm) {
        const acts = Object.create(null); acts[myId] = ai; acts[opp.id] = bi;
        const v = value(stepGame(pos, acts), depth - 1);
        if (v < vmin) vmin = v;
        if (vmin <= vmax) break;
      }
      if (vmin > vmax) vmax = vmin;
    }
    return vmax;
  }

  const searchDepth = g.w * g.h <= 169 ? 2 : 1;
  const om = safeMoveIndices(g, opp, false).length ? safeMoveIndices(g, opp, false) : [0, 1, 2, 3];
  for (const ai of rootMoves) {
    let worst = Infinity, sum = 0, count = 0;
    for (const bi of om) {
      const acts = Object.create(null); acts[myId] = ai; acts[opp.id] = bi;
      const next = stepGame(g, acts);
      const v = value(next, searchDepth);
      worst = Math.min(worst, v); sum += v; count++;
    }
    // Worst case dominates; the tiny average term breaks equal defensive lines intelligently.
    const score = worst + (sum / count) * 0.0001;
    if (score > best) { best = score; bestMove = ai; }
  }
  return bestMove;
}

function multiplayerMove(g, myId) {
  const me = g.snakes.find(s => s.id === myId);
  let choices = safeMoveIndices(g, me, false);
  if (!choices.length) choices = [0, 1, 2, 3];
  let best = choices[0], bestScore = -Infinity;
  for (const mi of choices) {
    const acts = Object.create(null); acts[myId] = mi;
    // Use each rival's most space-seeking legal move as a plausible simultaneous forecast.
    for (const s of g.snakes) if (s.alive && s.id !== myId) {
      const ms = safeMoveIndices(g, s, false); acts[s.id] = ms.length ? ms[0] : 0;
    }
    const q = stepGame(g, acts);
    let score = positional(q, myId, true);
    const mine = q.snakes.find(s => s.id === myId);
    if (mine && mine.alive) {
      const p = mine.body[0];
      for (const r of g.snakes) if (r.alive && r.id !== myId) {
        const rms = safeMoveIndices(g, r, false);
        for (const ri of rms) {
          const d = MOVES[ri], x = r.body[0].x + d.dx, y = r.body[0].y + d.dy;
          if (x === p.x && y === p.y) {
            const myGrow = hasPoint(g.food, p.x, p.y) ? 1 : 0;
            const rGrow = hasPoint(g.food, x, y) ? 1 : 0;
            if (r.body.length + rGrow >= me.body.length + myGrow) score -= 200000;
            else score += 120;
          }
        }
      }
    }
    if (score > bestScore) { bestScore = score; best = mi; }
  }
  return best;
}

function move(state) {
  try {
    if (!state || !state.you || !state.you.head) return 'up';
    const g = copyGame(state);
    const living = g.snakes.filter(s => s.alive);
    const mi = living.length === 2 ? duelSearch(g, state.you.id) : multiplayerMove(g, state.you.id);
    return MOVES[mi] ? MOVES[mi].name : 'up';
  } catch (_) {
    return 'up';
  }
}

module.exports = { name: 'Crown Serpent', move };
