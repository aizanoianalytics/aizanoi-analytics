(function () {
  'use strict';

  let G = null;
  const mem = { aggression: {}, attackedMe: {}, lastSeen: -1 };

  function init(state) {
    if (G) return G;
    const prov = Object.create(null);
    (state.map.provinces || []).forEach(function (p) { prov[p.id] = p; });
    const adj = state.map.adjacency || {};
    const ids = Object.keys(prov).sort();
    const scs = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (prov[id] && prov[id].sc) scs.push(id);
    }
    function canMoveT(type, from, to) {
      const a = prov[from];
      const b = prov[to];
      if (!a || !b) return false;
      if (type === 'army') {
        if (a.type !== 'land' || b.type !== 'land') return false;
        const list = adj[from];
        return !!(list && list.indexOf(to) >= 0);
      }
      if (type !== 'fleet') return false;
      if (b.type === 'land' && !b.coastal) return false;
      if (a.type === 'sea') return true;
      if (b.type === 'sea') return true;
      const fromList = adj[from] || [];
      const toList = adj[to] || [];
      for (let i = 0; i < fromList.length; i++) {
        const s = fromList[i];
        if (prov[s] && prov[s].type === 'sea' && toList.indexOf(s) >= 0) return true;
      }
      return false;
    }
    const dist = { army: {}, fleet: {} };
    const types = ['army', 'fleet'];
    for (let t = 0; t < types.length; t++) {
      const type = types[t];
      dist[type] = {};
      for (let i = 0; i < ids.length; i++) {
        const src = ids[i];
        const d = {};
        d[src] = 0;
        const q = [src];
        for (let j = 0; j < q.length; j++) {
          const x = q[j];
          const nxts = adj[x] || [];
          for (let k = 0; k < nxts.length; k++) {
            const y = nxts[k];
            if (d[y] === undefined && canMoveT(type, x, y)) { d[y] = d[x] + 1; q.push(y); }
          }
        }
        dist[type][src] = d;
      }
    }
    const gdist = {};
    for (let i = 0; i < ids.length; i++) {
      const src = ids[i];
      const d = {};
      d[src] = 0;
      const q = [src];
      for (let j = 0; j < q.length; j++) {
        const x = q[j];
        const nxts = adj[x] || [];
        for (let k = 0; k < nxts.length; k++) {
          const y = nxts[k];
          if (d[y] === undefined) { d[y] = d[x] + 1; q.push(y); }
        }
      }
      gdist[src] = d;
    }
    G = { prov, adj, ids, scs, dist, gdist, canMoveT };
    return G;
  }

  function myUnits(state) {
    return (state.units || []).filter(function (u) { return u.power === state.you; });
  }

  function livingOthers(state) {
    const me = state.you;
    const out = [];
    const keys = Object.keys(state.centresByPower || {});
    for (let i = 0; i < keys.length; i++) {
      const p = keys[i];
      if (p === me) continue;
      const c = state.centresByPower[p] || 0;
      const hasUnit = (state.units || []).some(function (u) { return u.power === p; });
      if (c > 0 || hasUnit) out.push(p);
    }
    return out;
  }

  function trustOf(state, p) {
    const t = state.trust && state.trust[p];
    if (!t) return 0.5;
    const made = t.promisesMade || 0;
    const kept = t.kept || 0;
    const broken = t.broken || 0;
    if (!made) return 0.5;
    return (kept + 1) / (made + broken * 2 + 2);
  }

  function distOf(g, type, from, to) {
    const d = g.dist[type] && g.dist[type][from];
    if (!d) return Infinity;
    const v = d[to];
    return v === undefined ? Infinity : v;
  }

  function occOf(state) {
    const occ = Object.create(null);
    const units = state.units || [];
    for (let i = 0; i < units.length; i++) occ[units[i].at] = units[i];
    return occ;
  }

  function scoreMove(state, me, g, u, m, occ) {
    const dest = m.dest;
    const occHere = occ[dest];
    const owner = state.owners[dest];
    if (owner === me) return -50;
    let s = 0;
    if (owner === null) s += 6;
    else s += 14;
    if (occHere) s += 9;
    const d = distOf(g, u.type, u.at, dest);
    s -= d * 2;
    if (occHere && occHere.power !== me) s += 4;
    return s;
  }

  function evaluatePlan(state, myOrders) {
    const res = PactEngine.adjudicate(state.units, myOrders);
    const me = state.you;
    const occ = {};
    const units = res.units || [];
    for (let i = 0; i < units.length; i++) occ[units[i].at] = units[i];
    const owners = state.owners || {};
    const autumn = state.season === 'Autumn';
    const counts = {};
    let score = 0;
    Object.keys(owners).forEach(function (id) {
      const occupant = occ[id];
      const owner = occupant ? occupant.power : owners[id];
      if (owner === me) { score += 10; counts[me] = (counts[me] || 0) + 1; }
      else { score -= 20; counts[owner || 'neutral'] = (counts[owner || 'neutral'] || 0) + 1; }
    });
    const dis = res.dislodged || [];
    for (let i = 0; i < dis.length; i++) {
      if (dis[i].power === me) score -= 8;
      else score += 2;
    }
    if (autumn) {
      Object.keys(owners).forEach(function (id) {
        const occupant = occ[id];
        if (occupant && occupant.power === me && owners[id] !== me) score += 25;
      });
    }
    return score;
  }

  function cmpOrder(a, b) {
    const ka = a.unit, kb = b.unit;
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return 0;
  }

  function chooseOrders(state) {
    const me = state.you;
    const g = init(state);
    const mine = myUnits(state);
    if (!mine.length) return [];
    const occ = occOf(state);
    const plan = {};
    for (let i = 0; i < mine.length; i++) plan[mine[i].at] = { unit: mine[i].at, type: 'hold' };

    const defended = Object.create(null);
    const units = state.units || [];
    for (let i = 0; i < mine.length; i++) {
      const u = mine[i];
      if (state.owners[u.at] !== me) continue;
      let threat = false;
      for (let j = 0; j < units.length; j++) {
        const e = units[j];
        if (e.power === me) continue;
        if (g.canMoveT(e.type, e.at, u.at)) { threat = true; break; }
      }
      if (threat) defended[u.at] = true;
    }
    const defendedUnits = mine.filter(function (u) { return defended[u.at]; });
    for (let i = 0; i < defendedUnits.length; i++) {
      const u = defendedUnits[i];
      let helper = null;
      let sup = null;
      for (let j = 0; j < mine.length; j++) {
        const h = mine[j];
        if (h.at === u.at) continue;
        if (plan[h.at].type !== 'hold') continue;
        const legal = state.legalOrders[h.at] || [];
        const found = legal.find(function (o) {
          return o.type === 'support' && o.target === u.at && o.targetDest === 'hold';
        });
        if (found) { helper = h; sup = found; break; }
      }
      if (helper) plan[helper.at] = sup;
    }

    const claimed = Object.create(null);
    const mineArr = mine.slice();
    for (let i = 0; i < mineArr.length; i++) {
      const u = mineArr[i];
      const order = plan[u.at];
      if (order.type !== 'hold') continue;
      const legal = state.legalOrders[u.at] || [];
      const cands = [];
      for (let j = 0; j < legal.length; j++) {
        const o = legal[j];
        if (o.type !== 'move') continue;
        if (claimed[o.dest]) continue;
        const occHere = occ[o.dest];
        if (occHere && occHere.power === me) continue;
        if (state.owners[o.dest] === me) continue;
        cands.push(o);
      }
      if (!cands.length) continue;
      let best = null;
      let bestScore = -Infinity;
      for (let j = 0; j < cands.length; j++) {
        const s = scoreMove(state, me, g, u, cands[j], occ);
        if (s > bestScore) { bestScore = s; best = cands[j]; }
      }
      if (best) { plan[u.at] = best; claimed[best.dest] = true; }
    }

    const moveUnits = mineArr.filter(function (u) { return plan[u.at] && plan[u.at].type === 'move'; });
    for (let i = 0; i < moveUnits.length; i++) {
      const u = moveUnits[i];
      const move = plan[u.at];
      const dest = move.dest;
      const occHere = occ[dest];
      if (!occHere) continue;
      if (occHere.power === me) continue;
      let helper = null;
      const helpers = mineArr.filter(function (h) { return h.at !== u.at && h.at !== dest; });
      for (let j = 0; j < helpers.length; j++) {
        const h = helpers[j];
        if (plan[h.at].type !== 'hold') continue;
        const legal = state.legalOrders[h.at] || [];
        const sup = legal.find(function (o) { return o.type === 'support' && o.target === u.at && o.targetDest === dest; });
        if (sup) { helper = h; break; }
      }
      if (helper) plan[helper.at] = sup;
    }

    let out = [];
    for (let i = 0; i < mine.length; i++) {
      const u = mine[i];
      const o = plan[u.at];
      const order = { unit: u.at, type: o.type };
      if (o.type === 'move') order.dest = o.dest;
      if (o.type === 'support') { order.target = o.target; order.targetDest = o.targetDest; }
      out.push(order);
    }

    let cur = evaluatePlan(state, out);
    const t0 = Date.now();
    let improved = true;
    let passes = 0;
    while (improved && passes < 3 && (Date.now() - t0) < 350) {
      improved = false;
      passes++;
      const fresh = myUnits(state);
      for (let i = 0; i < fresh.length; i++) {
        if ((Date.now() - t0) > 350) break;
        const u = fresh[i];
        const legal = state.legalOrders[u.at] || [];
        let current = null;
        for (let j = 0; j < out.length; j++) { if (out[j].unit === u.at) { current = out[j]; break; } }
        for (let j = 0; j < legal.length; j++) {
          const cand = legal[j];
          if (JSON.stringify(cand) === JSON.stringify(current)) continue;
          const trial = out.filter(function (o) { return o.unit !== u.at; });
          trial.push(cand);
          trial.sort(cmpOrder);
          const s = evaluatePlan(state, trial);
          if (s > cur + 1e-9) { cur = s; out = trial; improved = true; }
        }
      }
    }
    return out;
  }

  function chooseRetreats(state) {
    const me = state.you;
    const out = {};
    const taken = Object.create(null);
    const mine = (state.retreats || []).filter(function (u) { return u.power === me; });
    for (let i = 0; i < mine.length; i++) {
      const u = mine[i];
      const options = u.options || [];
      let best = null;
      let bs = -Infinity;
      for (let j = 0; j < options.length; j++) {
        const o = options[j];
        if (taken[o]) continue;
        let s = 0;
        if (state.owners[o] === me) s += 60;
        if (state.owners[o] !== me) s += 18;
        const units = state.units || [];
        for (let k = 0; k < units.length; k++) {
          const other = units[k];
          if (other.at === o) continue;
          const dd = distOf(init(state), other.type, other.at, o);
          if (isFinite(dd)) s -= dd * 2;
        }
        if (s > bs) { bs = s; best = o; }
      }
      if (best !== null) taken[best] = true;
      out[u.at] = best;
    }
    return out;
  }

  function chooseBuilds(state) {
    const me = state.you;
    const mine = myUnits(state);
    const delta = (state.centresByPower[me] || 0) - mine.length;
    if (delta > 0) {
      const candidates = (state.map.provinces || []).filter(function (p) {
        return p.home === me && state.owners[p.id] === me && !mine.some(function (u) { return u.at === p.id; });
      });
      const g = init(state);
      const near = function (p) {
        let bd = Infinity;
        for (let i = 0; i < mine.length; i++) {
          const d = distOf(g, mine[i].type, mine[i].at, p.id);
          if (d < bd) bd = d;
        }
        return bd;
      };
      candidates.sort(function (a, b) { return near(a) - near(b); });
      const picked = candidates.slice(0, delta);
      return picked.map(function (p) {
        let type = 'army';
        const hasFleet = mine.some(function (u) { return u.type === 'fleet'; });
        if (p.coastal && hasFleet) type = 'fleet';
        return { type: type, at: p.id };
      });
    }
    return [];
  }

  function choosePropose(state) {
    const me = state.you;
    const g = init(state);
    const mine = myUnits(state);
    const living = livingOthers(state);
    const out = [];
    for (let i = 0; i < living.length; i++) {
      const p = living[i];
      if (out.length >= 6) break;
      let adjacent = false;
      const units = state.units || [];
      for (let j = 0; j < units.length; j++) {
        const u = units[j];
        if (u.power !== p) continue;
        for (let k = 0; k < mine.length; k++) {
          if (g.canMoveT(mine[k].type, mine[k].at, u.at)) { adjacent = true; break; }
        }
        if (adjacent) break;
      }
      if (adjacent) continue;
      out.push({ to: p, type: 'peace', terms: {} });
    }
    return out;
  }

  function chooseAnswer(state) {
    const res = {};
    const inbox = state.inbox || [];
    const me = state.you;
    const g = init(state);
    const mine = myUnits(state);
    for (let i = 0; i < inbox.length; i++) {
      const p = inbox[i];
      let ok = false;
      if (p.type === 'peace') ok = true;
      else if (p.type === 'alliance') ok = true;
      else if (p.type === 'support') ok = true;
      else if (p.type === 'dmz') {
        ok = true;
        const prov = p.terms ? p.terms.province : null;
        if (prov) {
          for (let j = 0; j < mine.length; j++) {
            const legal = state.legalOrders[mine[j].at] || [];
            for (let k = 0; k < legal.length; k++) {
              const o = legal[k];
              if (o.type === 'move' && o.dest === prov) ok = false;
            }
          }
        }
      } else if (p.type === 'request-support') {
        ok = false;
        const maxYears = (state.limits && state.limits.maxYears) || 12;
        if (state.year < maxYears && p.terms) {
          const dest = p.terms.dest === 'hold' ? p.terms.unit : p.terms.dest;
          for (let j = 0; j < mine.length; j++) {
            const legal = state.legalOrders[mine[j].at] || [];
            for (let k = 0; k < legal.length; k++) {
              const o = legal[k];
              if (o.type === 'support' && o.target === p.terms.unit && o.targetDest === p.terms.dest) ok = true;
            }
          }
          void dest;
        }
      }
      res[p.id] = ok ? 'accept' : 'reject';
    }
    return res;
  }

  function safe(fn, fallback) {
    return function (state) {
      try {
        const r = fn(state);
        return r === undefined || r === null ? fallback(state) : r;
      } catch (e) {
        return fallback(state);
      }
    };
  }

  module.exports = {
    name: 'Pactan',
    propose: safe(choosePropose, function () { return []; }),
    answer: safe(chooseAnswer, function () { return {}; }),
    orders: safe(chooseOrders, function () { return []; }),
    retreats: safe(chooseRetreats, function () { return {}; }),
    builds: safe(chooseBuilds, function () { return []; })
  };
})();
