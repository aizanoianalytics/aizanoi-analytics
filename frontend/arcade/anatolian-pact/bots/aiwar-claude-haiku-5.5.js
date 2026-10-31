(function () {
  'use strict';

  // Haiku Sentinel: greedy scored movement with support, honours accepted
  // peace/DMZ/support promises, defensive retreats and home-centred builds.

  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  function bfs(adj, sources) {
    const dist = {};
    const queue = [];
    sources.forEach(s => {
      if (!(s in dist)) { dist[s] = 0; queue.push(s); }
    });
    for (let i = 0; i < queue.length; i++) {
      const cur = queue[i];
      (adj[cur] || []).forEach(n => {
        if (!(n in dist)) { dist[n] = dist[cur] + 1; queue.push(n); }
      });
    }
    return dist;
  }

  function provIndex(state) {
    const prov = {};
    ((state.map && state.map.provinces) || []).forEach(p => { prov[p.id] = p; });
    return prov;
  }

  function livingOthers(state) {
    const centres = state.centresByPower || {};
    const units = state.units || [];
    return Object.keys(centres).filter(p => p !== state.you &&
      (centres[p] > 0 || units.some(u => u.power === p)));
  }

  // Promises this power has accepted (obligations where I am the promisor).
  function obligations(state) {
    const me = state.you;
    const out = { partners: {}, dmz: {}, supports: [] };
    (state.accepted || []).forEach(r => {
      if (r.power !== me) return;
      if (r.type === 'peace' || r.type === 'alliance') out.partners[r.partner] = true;
      else if (r.type === 'dmz' && r.terms && r.terms.province) out.dmz[r.terms.province] = true;
      else if (r.type === 'support' && r.terms) out.supports.push(r.terms);
    });
    return out;
  }

  function analyse(state) {
    const me = state.you;
    const prov = provIndex(state);
    const adj = (state.map && state.map.adjacency) || {};
    const owners = state.owners || {};
    const centres = state.centresByPower || {};
    const units = state.units || [];
    const legal = state.legalOrders || {};
    const oblig = obligations(state);

    const occupant = {};
    units.forEach(u => { occupant[u.at] = u; });
    const mine = units.filter(u => u.power === me);

    const enemyAdj = {};
    units.forEach(u => {
      if (u.power === me) return;
      (adj[u.at] || []).forEach(n => { enemyAdj[n] = (enemyAdj[n] || 0) + 1; });
    });

    const targets = Object.keys(prov).filter(id => prov[id].sc && owners[id] !== me);
    const distT = bfs(adj, targets);
    const dT = id => (distT[id] === undefined ? 10 : distT[id]);

    function scValue(id) {
      const p = prov[id];
      if (!p || !p.sc) return 0;
      const o = owners[id];
      if (o === me) return 2 + (enemyAdj[id] ? 1 : 0);
      if (o === null || o === undefined) return 5;
      return 4 + ((centres[o] || 0) <= 3 ? 1 : 0);
    }

    function enemyAt(id) {
      const u = occupant[id];
      return u && u.power !== me ? u : null;
    }

    function forbiddenDest(id) {
      if (oblig.dmz[id]) return true;
      const u = occupant[id];
      return Boolean(u && u.power !== me && oblig.partners[u.power]);
    }

    function holdScore(at) {
      return scValue(at) - 1.5 * (enemyAdj[at] || 0) - 0.7 * dT(at) + 0.5;
    }

    function moveScore(d) {
      let s = scValue(d) - 1.5 * (enemyAdj[d] || 0) - 0.7 * dT(d);
      if (enemyAt(d)) s -= 1.5;
      return s;
    }

    // 1) Greedy unit assignment over all legal holds/moves.
    const cands = [];
    mine.forEach(u => {
      (legal[u.at] || []).forEach(o => {
        if (o.type === 'hold') {
          cands.push({ unit: u.at, order: o, dest: u.at, score: holdScore(u.at) });
        } else if (o.type === 'move') {
          if (forbiddenDest(o.dest)) return;
          cands.push({ unit: u.at, order: o, dest: o.dest, score: moveScore(o.dest) });
        }
      });
    });
    cands.sort((a, b) => (b.score - a.score) || cmp(a.unit, b.unit) || cmp(a.dest, b.dest));

    const assigned = {};
    const claimed = {};
    cands.forEach(c => {
      if (assigned[c.unit] || claimed[c.dest]) return;
      assigned[c.unit] = c.order.type === 'hold' ? { type: 'hold', unit: c.unit }
        : { type: 'move', unit: c.unit, dest: c.dest };
      claimed[c.dest] = c.unit;
    });
    mine.forEach(u => {
      if (!assigned[u.at]) assigned[u.at] = { type: 'hold', unit: u.at };
    });

    // 2) Repair: moves into own holding units, and head-to-head own swaps.
    for (let pass = 0; pass < 3; pass++) {
      let changed = false;
      mine.forEach(u => {
        const a = assigned[u.at];
        if (a.type !== 'move') return;
        const blocker = occupant[a.dest];
        if (blocker && blocker.power === me) {
          const b = assigned[blocker.at];
          const swap = b && b.type === 'move' && b.dest === u.at;
          if (!swap && b && b.type === 'hold') {
            assigned[u.at] = { type: 'hold', unit: u.at };
            changed = true;
          } else if (swap) {
            assigned[u.at] = { type: 'hold', unit: u.at };
            assigned[blocker.at] = { type: 'hold', unit: blocker.at };
            changed = true;
          }
        }
      });
      if (!changed) break;
    }

    // 3) Supports: holders back a move, or hold a threatened neighbour.
    const supportCount = {};
    const supportOrders = {};
    const forcedSupports = [];
    // Honour accepted support promises when the terms are legal for me.
    oblig.supports.forEach(t => {
      const pick = mine.find(u => assigned[u.at].type === 'hold' &&
        (legal[u.at] || []).some(o => o.type === 'support' && o.target === t.unit &&
          o.targetDest === t.dest));
      if (pick) forcedSupports.push({ from: pick.at, target: t.unit, targetDest: t.dest });
    });
    forcedSupports.forEach(f => {
      if (assigned[f.from].type !== 'hold') return;
      const o = (legal[f.from] || []).find(x => x.type === 'support' && x.target === f.target &&
        x.targetDest === f.targetDest);
      if (!o) return;
      assigned[f.from] = { type: 'support', unit: f.from, target: f.target, targetDest: f.targetDest };
      supportCount[f.target] = (supportCount[f.target] || 0) + 1;
    });

    mine.forEach(u => {
      if (assigned[u.at].type !== 'hold') return;
      let best = null;
      let bestScore = -Infinity;
      (legal[u.at] || []).forEach(o => {
        if (o.type !== 'support') return;
        const tgt = assigned[o.target];
        if (!tgt || occupant[o.target] === undefined) return;
        if (occupant[o.target].power !== me) return;
        let s;
        if (tgt.type === 'move' && tgt.dest === o.targetDest) {
          if (forbiddenDest(o.targetDest)) return;
          s = moveScore(o.targetDest) + 2 - 1.5 * (supportCount[o.target] || 0);
          if (enemyAt(o.targetDest)) s += 1;
        } else if (tgt.type === 'hold' && o.targetDest === 'hold') {
          if (!enemyAdj[o.target]) return;
          s = 0.5 * scValue(o.target) + enemyAdj[o.target] * 0.5 - 1.5 * (supportCount[o.target] || 0);
        } else {
          return;
        }
        if (s > bestScore) { bestScore = s; best = o; }
      });
      if (best && bestScore > 0) {
        assigned[u.at] = { type: 'support', unit: u.at, target: best.target, targetDest: best.targetDest };
        supportCount[best.target] = (supportCount[best.target] || 0) + 1;
      }
    });

    // 4) Attacks into enemy-held provinces without support would just bounce: hold.
    mine.forEach(u => {
      const a = assigned[u.at];
      if (a.type === 'move' && enemyAt(a.dest) && !supportCount[u.at]) {
        assigned[u.at] = { type: 'hold', unit: u.at };
      }
    });

    return { mine, assigned, prov, adj, owners, centres, occupant, enemyAdj, distT, legal, oblig };
  }

  function toOrder(a) {
    if (a.type === 'move') return { unit: a.unit, type: 'move', dest: a.dest };
    if (a.type === 'support') return { unit: a.unit, type: 'support', target: a.target, targetDest: a.targetDest };
    return { unit: a.unit, type: 'hold' };
  }

  module.exports = {
    name: 'Haiku Sentinel',

    propose(state) {
      try {
        return livingOthers(state).slice(0, 6).map(to => ({ to, type: 'peace', terms: {} }));
      } catch (e) {
        return [];
      }
    },

    answer(state) {
      try {
        const a = analyse(state);
        const res = {};
        (state.inbox || []).forEach(p => {
          let v = 'reject';
          if (p.type === 'peace' || p.type === 'alliance' || p.type === 'support') {
            v = 'accept';
          } else if (p.type === 'dmz') {
            const pr = p.terms && p.terms.province;
            const wanted = pr && a.prov[pr] && a.prov[pr].sc && a.owners[pr] !== state.you &&
              a.mine.some(u => (a.adj[u.at] || []).includes(pr));
            v = wanted ? 'reject' : 'accept';
          }
          res[p.id] = v;
        });
        return res;
      } catch (e) {
        return {};
      }
    },

    orders(state) {
      try {
        const a = analyse(state);
        return a.mine.map(u => toOrder(a.assigned[u.at]));
      } catch (e) {
        return (state.units || []).filter(u => u.power === state.you)
          .map(u => ({ unit: u.at, type: 'hold' }));
      }
    },

    retreats(state) {
      try {
        const me = state.you;
        const owners = state.owners || {};
        const occupied = {};
        (state.units || []).forEach(u => { occupied[u.at] = true; });
        const claimed = {};
        const res = {};
        const list = (state.retreats || []).slice().sort((x, y) => cmp(x.at, y.at));
        list.forEach(u => {
          let best = null;
          let bestScore = -Infinity;
          (u.options || []).forEach(d => {
            if (claimed[d] || occupied[d]) return;
            const s = owners[d] === null || owners[d] === undefined ? 3 : owners[d] === me ? 1.5 : 2;
            if (s > bestScore) { bestScore = s; best = d; }
          });
          if (best !== null) claimed[best] = true;
          res[u.at] = best;
        });
        return res;
      } catch (e) {
        return {};
      }
    },

    builds(state) {
      try {
        const me = state.you;
        const prov = provIndex(state);
        const adj = (state.map && state.map.adjacency) || {};
        const owners = state.owners || {};
        const units = state.units || [];
        const mine = units.filter(u => u.power === me);
        const delta = (state.centresByPower || {})[me] - mine.length;
        const homes = Object.keys(prov).filter(id => prov[id].home === me).sort(cmp);

        if (delta > 0) {
          const occupied = {};
          units.forEach(u => { occupied[u.at] = true; });
          const enemyAdj = {};
          units.forEach(u => {
            if (u.power === me) return;
            (adj[u.at] || []).forEach(n => { enemyAdj[n] = (enemyAdj[n] || 0) + 1; });
          });
          const open = homes.filter(h => owners[h] === me && !occupied[h])
            .sort((x, y) => ((enemyAdj[x] || 0) - (enemyAdj[y] || 0)) || cmp(x, y));
          let armies = mine.filter(u => u.type === 'army').length;
          let fleets = mine.filter(u => u.type === 'fleet').length;
          const out = [];
          open.forEach(h => {
            if (out.length >= delta) return;
            const p = prov[h];
            if (p.coastal && fleets * 2 < armies) {
              out.push({ type: 'fleet', at: h }); fleets++;
            } else {
              out.push({ type: 'army', at: h }); armies++;
            }
          });
          return out;
        }

        if (delta < 0) {
          const dist = bfs(adj, homes);
          const d = id => (dist[id] === undefined ? 1e9 : dist[id]);
          const ordered = mine.slice().sort((x, y) => (d(y.at) - d(x.at)) || cmp(x.at, y.at));
          return ordered.slice(0, -delta).map(u => ({ disband: u.at }));
        }
        return [];
      } catch (e) {
        return [];
      }
    }
  };
})();
