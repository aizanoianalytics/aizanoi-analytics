(function () {
  'use strict';

  function own(state) { return state.units.filter(u => u.power === state.you); }
  function unitAt(state, at) { return state.units.find(u => u.at === at); }
  function isSC(state, id) { return Object.prototype.hasOwnProperty.call(state.owners, id); }
  function canMove(unit, dest) {
    try { return PactEngine.canMove(unit, dest); } catch (e) { return false; }
  }

  // BFS distance for a unit type from start to nearest centre not owned by me.
  function distMap(state, type, start) {
    const seen = {};
    seen[start] = 0;
    const q = [start];
    for (let i = 0; i < q.length; i++) {
      const at = q[i];
      if (at !== start && isSC(state, at) && state.owners[at] !== state.you) return seen[at];
      const adj = state.map.adjacency[at] || [];
      for (const d of adj) {
        if (seen[d] !== undefined) continue;
        if (!canMove({ power: state.you, type: type, at: at }, d)) continue;
        seen[d] = seen[at] + 1;
        q.push(d);
      }
    }
    return 30;
  }

  function peaceSet(state) {
    const s = new Set();
    for (const p of state.accepted || []) {
      if (p.type === 'peace' || p.type === 'alliance') s.add(p.power === state.you ? p.partner : p.power);
    }
    return s;
  }
  function dmzSet(state) {
    return new Set((state.accepted || []).filter(p => p.type === 'dmz').map(p => p.terms.province));
  }

  function enemyThreat(state, at) {
    let n = 0;
    for (const e of state.units) {
      if (e.power === state.you) continue;
      if ((state.map.adjacency[at] || []).includes(e.at) && canMove(e, at)) n++;
    }
    return n;
  }

  function planOrders(state) {
    const mine = own(state);
    const peace = peaceSet(state);
    const dmz = dmzSet(state);
    const plan = {};
    mine.forEach(u => { plan[u.at] = { unit: u.at, type: 'hold' }; });
    const reserved = {};

    const cands = [];
    for (const u of mine) {
      const legal = state.legalOrders[u.at] || [];
      const d0 = distMap(state, u.type, u.at);
      const onOwnSC = isSC(state, u.at) && state.owners[u.at] === state.you;
      for (const o of legal) {
        if (o.type !== 'move') continue;
        const occ = unitAt(state, o.dest);
        if (dmz.has(o.dest)) continue;
        if (occ && occ.power === state.you) continue;
        if (occ && peace.has(occ.power)) continue;
        const sc = isSC(state, o.dest);
        const notMine = sc && state.owners[o.dest] !== state.you;
        const helpers = mine.filter(h => h.at !== u.at && (state.legalOrders[h.at] || []).some(l =>
          l.type === 'support' && l.target === u.at && l.targetDest === o.dest));
        if (occ && helpers.length === 0) continue;
        const dd = distMap(state, u.type, o.dest);
        let score = 0;
        if (notMine) score += state.owners[o.dest] === null ? 40 : 36;
        if (occ) score += 4;
        score -= (notMine ? 0 : dd * 3);
        if (!notMine && dd >= d0) score -= 6;
        if (onOwnSC && !notMine) score -= 3;
        if (onOwnSC && enemyThreat(state, u.at) > 0) score -= 18;
        const th = enemyThreat(state, o.dest);
        score -= th >= 2 ? th * 6 : th * 1.5;
        const ow = state.owners[o.dest];
        if (ow && peace.has(ow)) score -= 5;
        cands.push({ o: o, u: u, score: score, helpers: helpers, occ: occ });
      }
    }
    cands.sort((a, b) => b.score - a.score || (a.o.unit < b.o.unit ? -1 : a.o.unit > b.o.unit ? 1 : 0) ||
      (a.o.dest < b.o.dest ? -1 : 1));

    const moved = new Set();
    for (const c of cands) {
      if (moved.has(c.o.unit) || reserved[c.o.dest]) continue;
      if (c.score < -12) continue;
      let helper = null;
      if (c.occ) {
        helper = c.helpers.find(h => plan[h.at].type === 'hold' && !moved.has(h.at));
        if (!helper) continue;
      }
      plan[c.o.unit] = c.o;
      moved.add(c.o.unit);
      reserved[c.o.dest] = true;
      if (helper) {
        plan[helper.at] = { unit: helper.at, type: 'support', target: c.o.unit, targetDest: c.o.dest };
        moved.add(helper.at);
      }
    }
    // Idle units: support a neighbour's move, or support-hold a threatened owned centre.
    for (const u of mine) {
      if (moved.has(u.at)) continue;
      const legal = state.legalOrders[u.at] || [];
      let best = null;
      for (const l of legal) {
        if (l.type !== 'support') continue;
        const tp = plan[l.target];
        if (!tp) continue;
        if (l.targetDest === 'hold') {
          if (tp.type === 'hold' && enemyThreat(state, l.target) > 0 &&
              isSC(state, l.target) && state.owners[l.target] === state.you && !best) best = l;
        } else if (tp.type === 'move' && tp.dest === l.targetDest) {
          const occ = unitAt(state, l.targetDest);
          if (!(occ && occ.power === state.you)) best = l;
        }
      }
      if (best) plan[u.at] = { unit: u.at, type: 'support', target: best.target, targetDest: best.targetDest };
    }
    return mine.map(u => plan[u.at]);
  }

  function genLegal(state, power) {
    const units = state.units;
    const res = {};
    for (const u of units) {
      if (u.power !== power) continue;
      const adj = state.map.adjacency[u.at] || [];
      const l = [{ unit: u.at, type: 'hold' }];
      for (const d of adj) if (canMove(u, d)) l.push({ unit: u.at, type: 'move', dest: d });
      for (const t of units) {
        if (t.at === u.at) continue;
        if (canMove(u, t.at)) l.push({ unit: u.at, type: 'support', target: t.at, targetDest: 'hold' });
        for (const d of state.map.adjacency[t.at] || []) {
          if (canMove(t, d) && canMove(u, d)) {
            l.push({ unit: u.at, type: 'support', target: t.at, targetDest: d });
          }
        }
      }
      res[u.at] = l;
    }
    return res;
  }

  let dcache = {};
  function dist1(state, type, at) {
    const k = type + at;
    if (dcache[k] === undefined) dcache[k] = distMap(state, type, at);
    return dcache[k];
  }

  function refine(state, base, t0) {
    dcache = {};
    const me = state.you;
    const powers = {};
    state.units.forEach(u => { powers[u.power] = true; });
    let all = [];
    for (const p of Object.keys(powers)) {
      if (p === me) continue;
      const shadow = Object.assign({}, state, { you: p, accepted: [], legalOrders: genLegal(state, p) });
      all = all.concat(planOrders(shadow));
    }
    const mine = own(state);
    const autumn = state.season === 'Autumn';
    const cur = {};
    base.forEach(o => { cur[o.unit] = o; });
    const enemyOrders = all;

    function evaluate(plan) {
      const orders = enemyOrders.concat(mine.map(u => plan[u.at]));
      const r = PactEngine.adjudicate(state.units, orders);
      let s = 0;
      const occ = {};
      r.units.forEach(u => { occ[u.at] = u; });
      for (const u of r.units) {
        if (u.power === me) {
          const sc = isSC(state, u.at);
          if (sc && state.owners[u.at] !== me) s += autumn ? 12 : 4;
          else if (sc) s += autumn ? 2 : 1;
          else s -= 0.4 * dist1(state, u.type, u.at);
        } else if (isSC(state, u.at) && state.owners[u.at] === me) s -= autumn ? 12 : 3;
      }
      for (const d of r.dislodged || []) s += d.power === me ? -10 : 3;
      // keep a unit count of mine alive
      return s;
    }

    let best = evaluate(cur);
    for (let pass = 0; pass < 3; pass++) {
      let improved = false;
      for (const u of mine) {
        if (Date.now() - t0 > 1000) return mine.map(x => cur[x.at]);
        const legal = state.legalOrders[u.at] || [];
        for (const o of legal) {
          if (o.type === 'support') {
            const t = cur[o.target];
            const enemyT = !t; // target is not mine
            if (enemyT) continue;
            if (o.targetDest === 'hold' ? t.type === 'move' : !(t.type === 'move' && t.dest === o.targetDest)) continue;
          }
          const prev = cur[u.at];
          if (JSON.stringify(prev) === JSON.stringify(o)) continue;
          cur[u.at] = o;
          const sc = evaluate(cur);
          if (sc > best + 1e-9) { best = sc; improved = true; } else cur[u.at] = prev;
        }
      }
      if (!improved) break;
    }
    return mine.map(x => cur[x.at]);
  }

  function nearestRivals(state) {
    const res = {};
    const others = Object.keys(state.centresByPower).filter(p => p !== state.you);
    for (const p of others) res[p] = 99;
    for (const u of own(state)) {
      const seen = {};
      seen[u.at] = 0;
      const q = [u.at];
      for (let i = 0; i < q.length; i++) {
        const at = q[i];
        const ow = state.owners[at];
        if (ow && ow !== state.you && res[ow] !== undefined) res[ow] = Math.min(res[ow], seen[at]);
        for (const d of state.map.adjacency[at] || []) {
          if (seen[d] !== undefined || !canMove(u, d)) continue;
          seen[d] = seen[at] + 1; q.push(d);
        }
      }
    }
    return res;
  }

  function alive(state, p) {
    return state.centresByPower[p] > 0 || state.units.some(u => u.power === p);
  }

  module.exports = {
    name: 'Claude Sonnet 5.5 Pact',
    propose(state) {
      try {
        const dist = nearestRivals(state);
        const others = Object.keys(dist).filter(p => alive(state, p));
        others.sort((a, b) => (dist[a] - dist[b]) ||
          (state.centresByPower[a] - state.centresByPower[b]) || (a < b ? -1 : 1));
        const victim = others[0];
        return others.filter(p => p !== victim).slice(0, 6)
          .map(to => ({ to: to, type: 'peace', terms: {} }));
      } catch (e) { return []; }
    },
    answer(state) {
      const r = {};
      for (const p of state.inbox || []) {
        r[p.id] = (p.type === 'peace' || p.type === 'alliance') ? 'accept' : 'reject';
      }
      return r;
    },
    orders(state) {
      try {
        const t0 = Date.now();
        let base = planOrders(state);
        try { base = refine(state, base, t0); } catch (e) { /* keep greedy */ }
        return base;
      } catch (e) {
        return own(state).map(u => ({ unit: u.at, type: 'hold' }));
      }
    },
    retreats(state) {
      const out = {};
      try {
        const taken = new Set();
        for (const u of state.retreats) {
          let best = null, bs = -1e9;
          for (const o of u.options) {
            if (taken.has(o)) continue;
            let s = 0;
            if (isSC(state, o) && state.owners[o] !== state.you) s += 10;
            s -= enemyThreat(state, o);
            if (s > bs) { bs = s; best = o; }
          }
          if (best) taken.add(best);
          out[u.at] = best;
        }
      } catch (e) {
        return {};
      }
      return out;
    },
    builds(state) {
      try {
        const delta = state.centresByPower[state.you] - own(state).length;
        if (delta <= 0) return [];
        const homes = state.map.provinces.filter(p => p.home === state.you &&
          state.owners[p.id] === state.you && !unitAt(state, p.id));
        homes.sort((a, b) => distMap(state, 'army', a.id) - distMap(state, 'army', b.id) ||
          (a.id < b.id ? -1 : 1));
        return homes.slice(0, delta).map(p => ({ type: 'army', at: p.id }));
      } catch (e) { return []; }
    }
  };
})();
