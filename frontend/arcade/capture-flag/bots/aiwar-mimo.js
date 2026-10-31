'use strict';

module.exports = (function () {
  const ORDER = ['up', 'right', 'down', 'left'];
  const DX = [0, 1, 0, -1];
  const DY = [-1, 0, 1, 0];
  const cmpId = (a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
  const md = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);

  function move(state) {
    const you = state.you;
    if (you.jailed || you.respawnIn > 0 || you.x === null || you.y === null) return 'stay';

    const team = state.team;
    const enemy = team === 'west' ? 'east' : 'west';
    const border = state.border;
    const W = state.width;
    const H = state.height;
    const N = W * H;
    const grid = state.grid;
    const isOwn = x => (team === 'west' ? x < border : x > border);
    const isFoe = x => (team === 'west' ? x > border : x < border);
    const isNeutral = x => x === border;

    const roster = [you].concat(state.teammates).slice().sort(cmpId);
    const idx = roster.findIndex(a => a.id === you.id);
    const n = roster.length;
    const garrison = n > 1 ? Math.max(1, (n / 2) | 0) : 0;
    const isGuard = n > 1 && idx >= n - garrison;
    const isPrimaryGuard = isGuard && idx === n - garrison;

    const alive = a => !a.jailed && a.respawnIn === 0 && a.x !== null && a.y !== null;
    const enemies = state.enemies.filter(alive);
    const activeTeammates = roster.filter(alive);
    const myFlag = state.flags[team];
    const enemyFlag = state.flags[enemy];
    const enemyJail = state.zones[enemy].jail;
    const jailmates = state.teammates.filter(a => a.jailed && a.respawnIn === 0);

    let ourCarrier = null;
    if (enemyFlag.carrier !== null) {
      for (const a of roster) if (a.id === enemyFlag.carrier) { ourCarrier = a; break; }
    }
    let theirCarrier = null;
    if (myFlag.carrier !== null) {
      for (const a of state.enemies) if (a.id === myFlag.carrier) { theirCarrier = a; break; }
    }

    // ---- BFS distance field ----
    function bfsField(sx, sy) {
      const d = new Int32Array(N).fill(-1);
      const s = sy * W + sx;
      d[s] = 0;
      let frontier = [s];
      let dist = 0;
      while (frontier.length) {
        dist++;
        const next = [];
        for (let fi = 0; fi < frontier.length; fi++) {
          const i = frontier[fi];
          const x = i % W;
          const y = (i / W) | 0;
          for (let k = 0; k < 4; k++) {
            const nx = x + DX[k];
            const ny = y + DY[k];
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const ni = ny * W + nx;
            if (d[ni] !== -1 || grid[ny][nx] === '#') continue;
            d[ni] = dist;
            next.push(ni);
          }
        }
        frontier = next;
      }
      return d;
    }

    const myField = bfsField(you.x, you.y);

    // Enemies that can threaten me operate from their half (incl. border stance).
    const threatAgents = [];
    const threatFields = [];
    for (const e of enemies) {
      if (isFoe(e.x) || isNeutral(e.x)) {
        threatAgents.push(e);
        threatFields.push(bfsField(e.x, e.y));
      }
    }

    function makeRisk(carrying) {
      const base = carrying ? 34 : 14;
      const zone = carrying ? 90 : 28;
      return function (x, y) {
        if (isOwn(x) || isNeutral(x)) return 0;
        const i = y * W + x;
        const t = myField[i];
        let r = 0;
        for (let ei = 0; ei < threatAgents.length; ei++) {
          const e = threatAgents[ei];
          const de = threatFields[ei][i];
          if (de >= 0 && de <= t + 1) {
            let slack = t + 1 - de;
            if (slack > 3) slack = 3;
            r += (base * (1 + slack)) | 0;
          }
          if (md(x, y, e.x, e.y) <= 1) r += zone;
        }
        return r;
      };
    }

    function search(sx, sy, goalFn, riskFn, restrictOwn) {
      if (goalFn(sx, sy)) return { action: 'stay', arrived: true };
      const costs = new Float64Array(N).fill(Infinity);
      const first = new Int8Array(N).fill(-1);
      const done = new Uint8Array(N);
      const s = sy * W + sx;
      costs[s] = 0;
      const heapC = [0];
      const heapI = [s];
      const push = (c, i) => {
        heapC.push(c);
        heapI.push(i);
        let k = heapC.length - 1;
        while (k > 0) {
          const p = (k - 1) >> 1;
          if (heapC[p] <= heapC[k]) break;
          const tc = heapC[p];
          const ti = heapI[p];
          heapC[p] = heapC[k];
          heapI[p] = heapI[k];
          heapC[k] = tc;
          heapI[k] = ti;
          k = p;
        }
      };
      const pop = () => {
        const topC = heapC[0];
        const topI = heapI[0];
        const lc = heapC.pop();
        const li = heapI.pop();
        if (heapC.length) {
          heapC[0] = lc;
          heapI[0] = li;
          let k = 0;
          for (;;) {
            const l = k * 2 + 1;
            const r = l + 1;
            let m = k;
            if (l < heapC.length && heapC[l] < heapC[m]) m = l;
            if (r < heapC.length && heapC[r] < heapC[m]) m = r;
            if (m === k) break;
            const tc = heapC[k];
            const ti = heapI[k];
            heapC[k] = heapC[m];
            heapI[k] = heapI[m];
            heapC[m] = tc;
            heapI[m] = ti;
            k = m;
          }
        }
        return [topC, topI];
      };
      while (heapC.length) {
        const [c, i] = pop();
        if (done[i]) continue;
        done[i] = 1;
        const x = i % W;
        const y = (i / W) | 0;
        if (goalFn(x, y)) return { action: ORDER[first[i]], arrived: false };
        for (let k = 0; k < 4; k++) {
          const nx = x + DX[k];
          const ny = y + DY[k];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (grid[ny][nx] === '#') continue;
          if (restrictOwn && !isOwn(nx)) continue;
          const ni = ny * W + nx;
          if (done[ni]) continue;
          const nc = c + 1 + (riskFn ? riskFn(nx, ny) : 0);
          if (nc < costs[ni]) {
            costs[ni] = nc;
            first[ni] = first[i] === -1 ? k : first[i];
            push(nc, ni);
          }
        }
      }
      return null;
    }

    function pathList(field, sx, sy, goalFn) {
      const out = [];
      let x = sx;
      let y = sy;
      let steps = 0;
      while (!goalFn(x, y) && steps < N) {
        const i = y * W + x;
        const cur = field[i];
        let bx = -1;
        let by = -1;
        let best = cur;
        for (let k = 0; k < 4; k++) {
          const nx = x + DX[k];
          const ny = y + DY[k];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (field[ni] >= 0 && field[ni] < best) {
            best = field[ni];
            bx = nx;
            by = ny;
          }
        }
        if (bx < 0) break;
        x = bx;
        y = by;
        steps++;
        out.push({ x, y, t: steps });
      }
      return out;
    }

    function jailAdjacent(x, y) {
      for (const p of enemyJail) if (md(x, y, p.x, p.y) <= 1) return true;
      return false;
    }

    // ---- interception against enemy carrier in our half ----
    function planIntercept(field) {
      if (!theirCarrier || !isOwn(theirCarrier.x) || isNeutral(theirCarrier.x)) return null;
      const goalFn = x => isFoe(x); // carrier scores by reaching their own half
      const carrierPath = pathList(field, theirCarrier.x, theirCarrier.y, goalFn);
      let bestK = Infinity;
      let bestCell = null;
      for (const step of carrierPath) {
        if (!isOwn(step.x)) continue;
        if (myField[step.y * W + step.x] <= step.t) {
          if (step.t < bestK) {
            bestK = step.t;
            bestCell = { x: step.x, y: step.y };
          }
        }
        for (let k = 0; k < 4; k++) {
          const nx = step.x + DX[k];
          const ny = step.y + DY[k];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || !isOwn(nx)) continue;
          if (grid[ny][nx] === '#') continue;
          if (myField[ny * W + nx] <= step.t && step.t < bestK) {
            bestK = step.t;
            bestCell = { x: nx, y: ny };
          }
        }
      }
      return bestCell ? { x: bestCell.x, y: bestCell.y, at: bestK } : null;
    }

    const carrierField = theirCarrier && isOwn(theirCarrier.x) ? bfsField(theirCarrier.x, theirCarrier.y) : null;

    // ---- role decisions ----

    // 0. If I can trivially tag an enemy in my half (adjacent or one step), do it.
    if (!you.carrying) {
      let tagTarget = null;
      let tagBest = Infinity;
      for (const e of enemies) {
        if (!isOwn(e.x) || isNeutral(e.x)) continue;
        const d = md(you.x, you.y, e.x, e.y);
        const urgent = e.id === (theirCarrier && theirCarrier.id);
        const reach = urgent ? 2 : 1;
        if (d <= reach && d < tagBest) {
          tagBest = d;
          tagTarget = e;
        }
      }
      if (tagTarget) {
        const r = search(you.x, you.y, (x, y) => x === tagTarget.x && y === tagTarget.y, null, true);
        if (r && !r.arrived) return r.action;
      }
    }

    // 1. Carrying: sprint home with time-aware risk.
    if (you.carrying) {
      const r = search(you.x, you.y, x => isOwn(x), makeRisk(true), false);
      if (r) return r.action;
      return 'stay';
    }

    // 2. Guard: intercept carrier / chase intruders / patrol.
    if (isGuard) {
      if (theirCarrier && isOwn(theirCarrier.x) && !isNeutral(theirCarrier.x)) {
        if (md(you.x, you.y, theirCarrier.x, theirCarrier.y) <= 2) {
          const r = search(you.x, you.y, (x, y) => x === theirCarrier.x && y === theirCarrier.y, null, true);
          if (r) return r.action;
        }
        if (isPrimaryGuard && carrierField) {
          const plan = planIntercept(carrierField);
          if (plan) {
            const r = search(you.x, you.y, (x, y) => x === plan.x && y === plan.y, null, true);
            if (r) return r.action;
          }
        }
      }
      const intruders = enemies.filter(e => isOwn(e.x) && !isNeutral(e.x));
      if (intruders.length > 0) {
        intruders.sort((a, b) => {
          const ca = a.carrying ? 0 : 1;
          const cb = b.carrying ? 0 : 1;
          if (ca !== cb) return ca - cb;
          const da = md(a.x, a.y, myFlag.home.x, myFlag.home.y);
          const db = md(b.x, b.y, myFlag.home.x, myFlag.home.y);
          return da - db || cmpId(a, b);
        });
        const t = intruders[0];
        const nearFlag = md(t.x, t.y, myFlag.home.x, myFlag.home.y) <= 3;
        const close = md(you.x, you.y, t.x, t.y) <= 6;
        const dHome = md(you.x, you.y, myFlag.home.x, myFlag.home.y);
        if (t.carrying || nearFlag || close || dHome <= 4) {
          const r = search(you.x, you.y, (x, y) => x === t.x && y === t.y, null, true);
          if (r) return r.action;
        }
      }
      const cells = state.zones[team].home;
      const slot = cells[(state.tick >> 3) % cells.length];
      const r = search(you.x, you.y, (x, y) => x === slot.x && y === slot.y, null, true);
      return r && !r.arrived ? r.action : 'stay';
    }

    // 3. Non-guard, not carrying.
    // 3a. Teammate already carrying: meet them near the border on their return corridor,
    //     or intercept their carrier if I am the one who can.
    if (ourCarrier && ourCarrier.id !== you.id) {
      if (theirCarrier && isOwn(theirCarrier.x) && !isNeutral(theirCarrier.x)) {
        if (carrierField) {
          const plan = planIntercept(carrierField);
          // only take over if the guard cannot (guard is farther)
          if (plan && md(you.x, you.y, plan.x, plan.y) <= 5) {
            const r = search(you.x, you.y, (x, y) => x === plan.x && y === plan.y, null, true);
            if (r) return r.action;
          }
        }
      }
      // escort: stand on our-half cell of carrier's path nearest their half (the gate)
      const cField = bfsField(ourCarrier.x, ourCarrier.y);
      const path = pathList(cField, ourCarrier.x, ourCarrier.y, x => isOwn(x));
      let gate = null;
      for (const step of path) {
        if (isOwn(step.x)) gate = { x: step.x, y: step.y };
        else break;
      }
      if (gate) {
        const r = search(you.x, you.y, (x, y) => x === gate.x && y === gate.y, null, true);
        if (r) return r.action;
      }
      // fallback: head home
      const r = search(you.x, you.y, x => isOwn(x), makeRisk(false), false);
      return r ? r.action : 'stay';
    }

    // 3b. Rescue: closest eligible non-guard goes when nobody carries our flag.
    if (jailmates.length > 0 && !ourCarrier) {
      let rescuer = null;
      let bestD = Infinity;
      for (const a of activeTeammates) {
        if (a.carrying) continue;
        const aGuard = n > 1 && roster.findIndex(t => t.id === a.id) >= n - garrison;
        if (aGuard) continue;
        let jd = Infinity;
        for (const p of enemyJail) jd = Math.min(jd, md(a.x, a.y, p.x, p.y));
        if (jd < bestD || (jd === bestD && rescuer && cmpId(a, rescuer) < 0)) {
          bestD = jd;
          rescuer = a;
        }
      }
      if (rescuer && rescuer.id === you.id) {
        if (jailAdjacent(you.x, you.y)) return 'stay';
        const r = search(you.x, you.y, (x, y) => jailAdjacent(x, y), makeRisk(false), false);
        if (r) return r.action;
      }
    }

    // 3c. Standard rush to enemy flag (with race-aware behaviour near their defenders).
    const risk = makeRisk(false);
    const r = search(you.x, you.y, (x, y) => x === enemyFlag.x && y === enemyFlag.y, risk, false);
    if (r) return r.action;

    // Fallback: step toward own half if stranded.
    const h = search(you.x, you.y, x => isOwn(x), null, false);
    if (h && !h.arrived) return h.action;
    return 'stay';
  }

  return { name: 'MimoCTF', move: move };
})();
