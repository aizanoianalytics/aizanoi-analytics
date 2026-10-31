'use strict';
// Aegis: simultaneous adversarial search with temporal territory evaluation.
var botName = 'Aegis';
module.exports = (function () {
  const names = ['up', 'down', 'left', 'right'];
  let W, H, N, nb, edge, deadline, nodes, ring, cap, shrink, turn;
  let aborted;
  function moves(s, i) {
    const a = s.a[i];
    if (!a.alive) return [-1];
    const out = [];
    for (const p of nb[a.b[0]]) {
      if (edge[p] < s.r) continue;
      const eat = s.f.indexOf(p) >= 0;
      if (a.h <= 1 && !eat) continue;
      let blocked = false;
      for (let j = 0; j < s.a.length && !blocked; j++) {
        const b = s.a[j]; if (!b.alive) continue;
        // All old heads become body; tails normally leave.
        const end = b.b.length - ((j === i && eat) ? 0 : 1);
        for (let k = 0; k < end; k++) if (b.b[k] === p) { blocked = true; break; }
      }
      if (!blocked) out.push(p);
    }
    return out.length ? out : nb[a.b[0]].filter(p => edge[p] >= s.r);
  }
  function step(s, actions) {
    const a = s.a.map((v, i) => {
      if (!v.alive) return v;
      const p = actions[i]; const eat = s.f.indexOf(p) >= 0;
      const b = [p].concat(v.b); if (!eat) b.pop();
      return { b, h: eat ? 100 : v.h - 1, alive: true };
    });
    const alive = a.map((v, i) => {
      if (!v.alive) return false;
      const p = v.b[0];
      if (p < 0 || edge[p] < s.r || v.h <= 0) return false;
      for (let j = 0; j < a.length; j++) if (a[j].alive) {
        for (let k = 1; k < a[j].b.length; k++) if (a[j].b[k] === p) return false;
        if (i !== j && a[j].b[0] === p && a[j].b.length >= v.b.length) return false;
      }
      return true;
    });
    const f = s.f.filter(p => !a.some((v, i) => s.a[i].alive && v.b[0] === p));
    a.forEach((v, i) => { if (s.a[i].alive) { v.alive = alive[i]; if (!v.alive) v.deathTurn = s.t + 1; } });
    const t = s.t + 1;
    const r = s.r + (s.r < cap && t === shrink ? 1 : (s.r < cap && t > shrink && (t - shrink) % 20 === 0 ? 1 : 0));
    return { a, f: f.filter(p => edge[p] >= r), r, t };
  }
  function distances(s, idx, release) {
    const dist = new Int16Array(N); dist.fill(999);
    const q = new Int16Array(N); let lo = 0, hi = 0;
    const start = s.a[idx].b[0]; dist[start] = 0; q[hi++] = start;
    while (lo < hi) {
      const p = q[lo++], d = dist[p] + 1;
      for (const v of nb[p]) {
        if (dist[v] !== 999 || edge[v] < s.r || release[v] > d) continue;
        // The first expansion is exact; subsequent ones use the public default schedule.
        const rr = Math.min(cap, s.r + (s.t + d > shrink ? 1 + Math.floor((s.t + d - shrink - 1) / 20) : 0) - (s.t >= shrink ? 1 + Math.floor((s.t - shrink) / 20) : 0));
        if (edge[v] < rr) continue;
        dist[v] = d; q[hi++] = v;
      }
    }
    return dist;
  }
  function evaluate(s) {
    const me = s.a[0], living = s.a.filter(a => a.alive).length;
    if (!me.alive) {
      if (!living) {
        const rivals = s.a.slice(1).filter(a => a.deathTurn === me.deathTurn);
        const longest = rivals.length ? Math.max(...rivals.map(a => a.b.length)) : 0;
        if (me.b.length > longest) return 90000 - s.t * 10;
        if (me.b.length === longest) return -1000 + s.t;
        return -90000 + s.t * 10;
      }
      return -100000 + s.t * 10;
    }
    if (living === 1) return 100000 - s.t * 10;
    const release = new Int16Array(N);
    s.a.forEach(a => { if (a.alive) a.b.forEach((p, k) => { release[p] = Math.max(release[p], a.b.length - k); }); });
    const ds = s.a.map((a, i) => a.alive ? distances(s, i, release) : null);
    let area = 0, territory = 0, foodDist = 999, contestedFood = 999;
    const d = ds[0];
    for (let p = 0; p < N; p++) {
      if (d[p] === 999) continue;
      area++;
      let own = true;
      for (let i = 1; i < ds.length; i++) if (ds[i] && (ds[i][p] < d[p] || (ds[i][p] === d[p] && s.a[i].b.length >= me.b.length))) { own = false; break; }
      if (own) territory += 1;
      if (s.f.indexOf(p) >= 0) { contestedFood = Math.min(contestedFood, d[p]); if (own) foodDist = Math.min(foodDist, d[p]); }
    }
    const occ = new Uint8Array(N);
    s.a.forEach(a => { if (a.alive) for (let k = 0; k < a.b.length - 1; k++) occ[a.b[k]] = 1; });
    const seen = new Uint8Array(N), q = [me.b[0]]; seen[me.b[0]] = 1;
    for (let j = 0; j < q.length; j++) for (const p of nb[q[j]]) if (!seen[p] && !occ[p] && edge[p] >= s.r) { seen[p] = 1; q.push(p); }
    const length = me.b.length, maxEnemy = Math.max(...s.a.slice(1).filter(a => a.alive).map(a => a.b.length));
    let value = length * 10 + Math.min(4, length - maxEnemy) * 5 + territory * 1.0 + Math.min(area, length * 3) * 0.4;
    const deficit = Math.max(0, length + 2 - q.length);
    value -= deficit * deficit * 2.5;
    if (area < length) value -= (length - area) * 25;
    const fd = Math.min(foodDist, contestedFood + 2);
    if (fd < 999) {
      value += 28 / (fd + 1) - Math.min(fd, 30) * (me.h < 40 ? 2.5 : 1.2);
      if (me.h <= fd + 2) value -= 1500 + (fd + 2 - me.h) * 25;
    } else if (me.h < 35) value -= (35 - me.h) * 5;
    value += Math.min(me.h, 60) * 0.08;
    value += Math.min(edge[me.b[0]], 3) * 0.6;
    if (shrink - s.t <= 5 && s.r < cap && edge[me.b[0]] <= s.r) value -= 15 / Math.max(1, shrink - s.t);
    return value;
  }
  function combinations(s, lists) {
    let result = [[]];
    for (let i = 1; i < lists.length; i++) {
      let l = lists[i]; if (!l.length) l = [-1];
      // Distant snakes follow a food/space policy; nearby opponents branch.
      const h = s.a[i].b[0], m = s.a[0].b[0];
      const distance = Math.abs(h % W - m % W) + Math.abs(Math.floor(h / W) - Math.floor(m / W));
      if (lists.length > 3 && (distance > 4 || result.length * l.length > 27)) {
        l = l.slice().sort((x, y) => {
          function cost(p) { return p < 0 ? 1e6 : Math.min(15, ...s.f.map(f => Math.abs(p % W - f % W) + Math.abs(Math.floor(p / W) - Math.floor(f / W)))) - nb[p].filter(z => edge[z] >= s.r).length; }
          return cost(x) - cost(y);
        }).slice(0, 1);
      }
      const next = []; for (const r of result) for (const p of l) next.push(r.concat(p)); result = next;
    }
    return result;
  }
  function search(s, depth, alpha) {
    nodes++;
    if ((nodes & 31) === 0 && (Date.now() >= deadline || nodes > 6000)) { aborted = true; return 0; }
    if (!depth || !s.a[0].alive || s.a.filter(a => a.alive).length <= 1) return evaluate(s);
    const lists = s.a.map((a, i) => moves(s, i));
    if (!lists[0].length) return -100000 + s.t * 10;
    const combos = combinations(s, lists);
    let best = -Infinity;
    for (const p of lists[0]) {
      let worst = Infinity;
      for (const c of combos) {
        const score = search(step(s, [p].concat(c)), depth - 1, best);
        if (aborted) return 0;
        worst = Math.min(worst, score);
        if (worst <= best) break;
      }
      best = Math.max(best, worst);
    }
    return best;
  }
  function move(state) {
    if (!state || !state.you) return 'up';
    W = state.width; H = state.height; N = W * H;
    nb = Array.from({ length: N }, (_, p) => { const x = p % W, y = Math.floor(p / W); return [y ? p-W : -1, y+1<H ? p+W : -1, x ? p-1 : -1, x+1<W ? p+1 : -1].filter(v => v >= 0); });
    edge = Array.from({ length: N }, (_, p) => Math.min(p % W, W - 1 - p % W, Math.floor(p / W), H - 1 - Math.floor(p / W)));
    const hz = new Set(state.hazards.map(p => p.y * W + p.x));
    ring = 0; while (ring < Math.floor(Math.min(W,H)/2) && hz.has(ring * W + ring)) ring++;
    cap = Math.floor(Math.min(W,H)/2)-1; shrink = state.nextShrinkTurn; turn = state.turn;
    const snakes = [state.you].concat(state.snakes.filter(a => a.id !== state.you.id));
    const s = { a: snakes.map(a => ({ b: a.body.map(p => p.y * W + p.x), h: a.health, alive: true })), f: [...new Set(state.food.map(p => p.y * W + p.x))], r: ring, t: turn - 1 };
    deadline = Date.now() + 65; nodes = 0; aborted = false;
    const lists = s.a.map((a, i) => moves(s, i));
    let choices = lists[0];
    if (!choices.length) choices = nb[s.a[0].b[0]];
    let selected = choices[0];
    const combos = combinations(s, lists);
    // Never overlook an immediate head threat, even when distant branching is reduced.
    const risk = p => snakes.slice(1).some((a, i) => {
      const enemy = s.a[i+1];
      if (a.length >= state.you.length && nb[enemy.b[0]].includes(p)) return true;
      return enemy.b[enemy.b.length-1] === p && nb[enemy.b[0]].some(v => s.f.includes(v));
    });
    choices = choices.slice().sort((a,b) => Number(risk(a))-Number(risk(b)));
    selected = choices[0];
    for (let depth = 1; depth <= (snakes.length === 2 ? 5 : 3); depth++) {
      const scores = []; let best = -Infinity;
      for (const p of choices) {
        let worst = Infinity, sum = 0, count = 0;
        for (const c of combos) {
          const value = search(step(s, [p].concat(c)), depth - 1, best);
          if (aborted) break;
          worst = Math.min(worst, value); sum += value; count++;
          if (worst < best - 10) break;
        }
        if (aborted) break;
        let value = worst + (worst > -10000 && worst < 10000 ? 0.025 * sum / Math.max(1,count) : 0);
        if (snakes.length > 3 && risk(p)) value -= 100000;
        scores.push([p, value]); best = Math.max(best, worst);
      }
      if (aborted) break;
      scores.sort((a,b) => b[1]-a[1]); if (scores.length) selected = scores[0][0];
      choices = scores.map(a => a[0]);
      if (Date.now() >= deadline) break;
    }
    const h = s.a[0].b[0];
    return selected === h-W ? 'up' : selected === h+W ? 'down' : selected === h-1 ? 'left' : 'right';
  }
  move.botName = 'Aegis';
  return move;
})();
