'use strict';

// Survival-first Snake Royale bot.
// Flood-fill space, Voronoi territory, head-on threat handling, food urgency, storm awareness.

const DIRS = [
  ['up', 0, -1],
  ['down', 0, 1],
  ['left', -1, 0],
  ['right', 1, 0]
];
const DIRNAMES = ['up', 'down', 'left', 'right'];

let lastMove = 'up';

function move(state) {
  const W = state.width;
  const H = state.height;
  const N = W * H;
  const you = state.you;
  const snakes = state.snakes;
  const turn = state.turn;

  let youIdx = 0;
  for (let i = 0; i < snakes.length; i++) {
    if (snakes[i].id === you.id) { youIdx = i; break; }
  }

  const hz = new Uint8Array(N);
  for (let i = 0; i < state.hazards.length; i++) {
    const p = state.hazards[i];
    hz[p.y * W + p.x] = 1;
  }
  const food = new Uint8Array(N);
  const foodKeys = [];
  for (let i = 0; i < state.food.length; i++) {
    const p = state.food[i];
    const k = p.y * W + p.x;
    food[k] = 1;
    foodKeys.push(k);
  }

  let ring = 0;
  const lim = Math.min(W, H);
  while (ring < lim && hz[ring * W + ring]) ring++;
  const turnsToShrink = state.nextShrinkTurn - turn;

  const bodies = [];
  const heads = [];
  const lens = [];
  for (let i = 0; i < snakes.length; i++) {
    const s = snakes[i];
    const arr = new Array(s.body.length);
    for (let j = 0; j < s.body.length; j++) arr[j] = s.body[j].y * W + s.body[j].x;
    bodies.push(arr);
    heads.push(s.head.y * W + s.head.x);
    lens.push(s.body.length);
  }

  // A snake with food next to its head may not vacate its tail this turn.
  const eatRisk = new Uint8Array(snakes.length);
  for (let i = 0; i < snakes.length; i++) {
    const s = snakes[i], x = s.head.x, y = s.head.y;
    let risk = 0;
    if (x > 0 && food[y * W + x - 1]) risk = 1;
    else if (x < W - 1 && food[y * W + x + 1]) risk = 1;
    else if (y > 0 && food[(y - 1) * W + x]) risk = 1;
    else if (y < H - 1 && food[(y + 1) * W + x]) risk = 1;
    eatRisk[i] = risk;
  }

  const myLen = lens[youIdx];

  function blockedForMe(k) {
    if (hz[k]) return true;
    for (let i = 0; i < snakes.length; i++) {
      const L = lens[i];
      if (i === youIdx) {
        for (let j = 1; j < L - 1; j++) if (bodies[i][j] === k) return true;
      } else {
        if (heads[i] === k) return true;
        const tb = eatRisk[i] === 1;
        for (let j = 1; j < L; j++) {
          if (j === L - 1 && !tb) continue;
          if (bodies[i][j] === k) return true;
        }
      }
    }
    return false;
  }

  function oppCands(i) {
    const L = lens[i];
    const h = heads[i];
    const x0 = h % W, y0 = (h / W) | 0;
    const res = [];
    for (let di = 0; di < 4; di++) {
      const x = x0 + DIRS[di][1], y = y0 + DIRS[di][2];
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const k = y * W + x;
      if (hz[k]) continue;
      let ok = true;
      for (let j = 0; j < snakes.length && ok; j++) {
        if (j === i) {
          for (let q = 1; q < L - 1; q++) {
            if (bodies[j][q] === k) { ok = false; break; }
          }
        } else {
          if (heads[j] === k) { ok = false; break; }
          const tb = eatRisk[j] === 1;
          for (let q = 1; q < lens[j]; q++) {
            if (q === lens[j] - 1 && !tb) continue;
            if (bodies[j][q] === k) { ok = false; break; }
          }
        }
      }
      if (ok) res.push(k);
    }
    return res;
  }

  const oCands = new Array(snakes.length);
  for (let i = 0; i < snakes.length; i++) {
    if (i !== youIdx) oCands[i] = oppCands(i);
  }

  const closeRing = turnsToShrink <= 1;
  const futureCells = [];
  if (closeRing && ring < lim) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = Math.min(x, y, W - 1 - x, H - 1 - y);
        if (d === ring) futureCells.push(y * W + x);
      }
    }
  }

  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  let bestScore = -Infinity;
  let bestDir = lastMove;

  for (let di = 0; di < 4; di++) {
    const nx = you.head.x + DIRS[di][1];
    const ny = you.head.y + DIRS[di][2];
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const k = ny * W + nx;
    if (blockedForMe(k)) continue;

    const eating = food[k] === 1;
    const myNewLen = myLen + (eating ? 1 : 0);

    // Head-on collision analysis.
    let danger = 0;
    let kill = 0;
    for (let i = 0; i < snakes.length; i++) {
      if (i === youIdx) continue;
      const cs = oCands[i];
      if (cs.length && cs.indexOf(k) >= 0) {
        const oNewLen = lens[i] + (food[k] ? 1 : 0);
        if (myNewLen > oNewLen) {
          kill += 16 + 5 * (myNewLen - oNewLen);
        } else {
          const opts = Math.max(1, cs.length);
          const sev = 2400 + 600 * (oNewLen - myNewLen);
          danger += sev * (0.5 + 0.5 / opts);
        }
      }
    }

    // Occupancy for flood fills.
    const b = new Uint8Array(N);
    for (let q = 0; q < N; q++) if (hz[q]) b[q] = 1;
    for (let q = 0; q < futureCells.length; q++) b[futureCells[q]] = 1;

    for (let i = 0; i < snakes.length; i++) {
      const L = lens[i];
      for (let j = 0; j < L; j++) {
        let block;
        if (i === youIdx) {
          if (j === L - 1) block = eating;
          else block = true;
        } else {
          if (j === L - 1) block = eatRisk[i] === 1;
          else block = true;
        }
        if (block) b[bodies[i][j]] = 1;
      }
    }
    // Cells rivals can step into next turn are not reliable escape routes.
    for (let i = 0; i < snakes.length; i++) {
      if (i === youIdx) continue;
      const cs = oCands[i];
      for (let q = 0; q < cs.length; q++) b[cs[q]] = 1;
    }
    b[k] = 0;

    // Reachable space from the candidate head.
    const dist = new Int16Array(N);
    dist.fill(-1);
    const q = new Int32Array(N);
    let qh = 0, qt = 0;
    dist[k] = 0;
    q[qt++] = k;
    let area = 1;
    while (qh < qt) {
      const c = q[qh++];
      const x = c % W, y = (c / W) | 0;
      const nd = dist[c] + 1;
      if (x > 0) {
        const nk = c - 1;
        if (!b[nk] && dist[nk] < 0) { dist[nk] = nd; q[qt++] = nk; area++; }
      }
      if (x < W - 1) {
        const nk = c + 1;
        if (!b[nk] && dist[nk] < 0) { dist[nk] = nd; q[qt++] = nk; area++; }
      }
      if (y > 0) {
        const nk = c - W;
        if (!b[nk] && dist[nk] < 0) { dist[nk] = nd; q[qt++] = nk; area++; }
      }
      if (y < H - 1) {
        const nk = c + W;
        if (!b[nk] && dist[nk] < 0) { dist[nk] = nd; q[qt++] = nk; area++; }
      }
    }

    // Territory from all heads (multi-source BFS).
    const mdist = new Int16Array(N);
    mdist.fill(-1);
    const owner = new Int8Array(N);
    owner.fill(-1);
    const mq = new Int32Array(N);
    let mqh = 0, mqt = 0;
    const counts = new Int16Array(snakes.length);
    for (let i = 0; i < snakes.length; i++) {
      const s = i === youIdx ? k : heads[i];
      if (mdist[s] < 0) {
        mdist[s] = 0;
        owner[s] = i;
        mq[mqt++] = s;
        counts[i]++;
      }
    }
    while (mqh < mqt) {
      const c = mq[mqh++];
      const x = c % W, y = (c / W) | 0;
      const nd = mdist[c] + 1;
      const own = owner[c];
      if (x > 0) {
        const nk = c - 1;
        if (!b[nk] && mdist[nk] < 0) { mdist[nk] = nd; owner[nk] = own; counts[own]++; mq[mqt++] = nk; }
      }
      if (x < W - 1) {
        const nk = c + 1;
        if (!b[nk] && mdist[nk] < 0) { mdist[nk] = nd; owner[nk] = own; counts[own]++; mq[mqt++] = nk; }
      }
      if (y > 0) {
        const nk = c - W;
        if (!b[nk] && mdist[nk] < 0) { mdist[nk] = nd; owner[nk] = own; counts[own]++; mq[mqt++] = nk; }
      }
      if (y < H - 1) {
        const nk = c + W;
        if (!b[nk] && mdist[nk] < 0) { mdist[nk] = nd; owner[nk] = own; counts[own]++; mq[mqt++] = nk; }
      }
    }

    const myCount = counts[youIdx];
    let bestOpp = 0, sumOpp = 0;
    for (let i = 0; i < snakes.length; i++) {
      if (i === youIdx) continue;
      const c = counts[i];
      if (c > bestOpp) bestOpp = c;
      sumOpp += c;
    }
    const terr = (myCount / N) * 75 - (bestOpp / N) * 30 - (Math.max(0, sumOpp - bestOpp) / N) * 6;

    const need = Math.max(5, myLen + 2);
    let space;
    if (area < need) {
      const short = need - area;
      space = -short * short * 6;
    } else {
      space = (Math.min(area, N) / N) * 85 + Math.min(area, myLen * 4) * 0.8;
    }

    let bestD = 1000000, bestFk = -1;
    for (let fi = 0; fi < foodKeys.length; fi++) {
      const fk = foodKeys[fi];
      const d = dist[fk];
      if (d >= 0 && d < bestD) { bestD = d; bestFk = fk; }
    }
    let foodScore = 0;
    if (bestD < 1000000) {
      const h = you.health;
      let base = 20 + (myLen < 10 ? 8 : 0);
      if (h < 50) base += (50 - h) * 1.6;
      if (h < 25) base += (25 - h) * 3;
      foodScore = base * Math.exp(-bestD / 7);
      if (bestFk >= 0 && owner[bestFk] !== youIdx) foodScore *= 0.65;
      if (eating) foodScore += 18 + (h < 50 ? (50 - h) : 0);
    }

    let storm = 0;
    const dEdge = Math.min(nx, ny, W - 1 - nx, H - 1 - ny);
    if (turn >= 140) {
      const after = ring + (turnsToShrink <= 0 ? 1 : 0);
      if (dEdge < after) storm -= 300;
      else if (turnsToShrink <= 2 && dEdge <= ring + 1) storm -= 35;
      const cd = Math.abs(nx - cx) + Math.abs(ny - cy);
      storm -= cd * (turn > 200 ? 1.5 : 0.5);
    } else if (turn > 100) {
      const cd = Math.abs(nx - cx) + Math.abs(ny - cy);
      storm -= cd * 0.15;
    }

    let s = space + terr + foodScore + kill - danger + storm;
    if (DIRNAMES[di] === lastMove && s) s += 2;

    if (s > bestScore) {
      bestScore = s;
      bestDir = DIRNAMES[di];
    }
  }

  lastMove = bestDir;
  return bestDir;
}

module.exports = { name: 'Serpentine', move };
