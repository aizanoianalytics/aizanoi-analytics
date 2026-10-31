(function () {
  'use strict';

  var POWERS = ['Phrygia', 'Lydia', 'Caria', 'Bithynia', 'Galatia', 'Cilicia'];

  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  function ownUnits(state) {
    return state.units.filter(function (u) { return u.power === state.you; });
  }

  function living(state, excludeMe) {
    return POWERS.filter(function (p) {
      if (excludeMe && p === state.you) return false;
      return (state.centresByPower[p] || 0) > 0 ||
        state.units.some(function (u) { return u.power === p; });
    });
  }

  function canMove(unit, dest) {
    try {
      if (typeof PactEngine !== 'undefined' && PactEngine.canMove) {
        return PactEngine.canMove(unit, dest);
      }
    } catch (e) { /* fall through */ }
    return false;
  }

  function bfsDist(state, unit, start, targets) {
    if (targets.has(start)) return 0;
    var seen = {};
    seen[start] = true;
    var queue = [[start, 0]];
    for (var i = 0; i < queue.length; i++) {
      var cur = queue[i][0], d = queue[i][1];
      var adj = state.map.adjacency[cur] || [];
      for (var j = 0; j < adj.length; j++) {
        var nx = adj[j];
        if (seen[nx]) continue;
        if (!canMove({ type: unit.type, at: cur }, nx)) continue;
        if (targets.has(nx)) return d + 1;
        seen[nx] = true;
        queue.push([nx, d + 1]);
      }
      if (queue.length > 400) break;
    }
    return 99;
  }

  function yearsLeft(state) {
    var max = (state.limits && state.limits.maxYears) || 12;
    return Math.max(1, max - state.year + 1);
  }

  function isLeader(state, power) {
    var my = state.centresByPower[state.you] || 0;
    return (state.centresByPower[power] || 0) > my;
  }

  function betrayOk(state, partner) {
    if (!partner || partner === state.you) return true;
    if (yearsLeft(state) <= 3) return true;
    if (isLeader(state, partner)) return true;
    try {
      if (state.trust[partner] && state.trust[partner].broken > 0) return true;
    } catch (e) { /* ignore */ }
    if (state.season === 'Autumn') return true;
    return false;
  }

  function peacePartners(state) {
    var set = {};
    (state.accepted || []).forEach(function (pr) {
      if (pr.type === 'peace' || pr.type === 'alliance') {
        var other = pr.power === state.you ? pr.partner : pr.power;
        set[other] = true;
      }
    });
    return set;
  }

  function dmzSet(state) {
    var set = {};
    (state.accepted || []).forEach(function (pr) {
      if (pr.type === 'dmz' && pr.terms && pr.terms.province) set[pr.terms.province] = true;
    });
    return set;
  }

  function enemiesThatCanEnter(state, prov, excludePower) {
    var out = [];
    state.units.forEach(function (u) {
      if (u.power === excludePower) return;
      if (u.at === prov) return;
      if (canMove(u, prov)) out.push(u);
    });
    return out;
  }

  function estimateSupport(state, defUnit) {
    var n = 0;
    state.units.forEach(function (u) {
      if (u.power !== defUnit.power || u.at === defUnit.at) return;
      if (canMove({ type: u.type, at: u.at }, defUnit.at)) n++;
    });
    return n;
  }

  function legalSupport(state, from, target, targetDest) {
    var list = state.legalOrders[from] || [];
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o.type === 'support' && o.target === target && o.targetDest === targetDest) return o;
    }
    return null;
  }

  function buildOrders(state) {
    var me = state.you;
    var own = ownUnits(state);
    var at = {};
    state.units.forEach(function (u) { at[u.at] = u; });
    var friends = peacePartners(state);
    var dmz = dmzSet(state);
    var autumn = state.season === 'Autumn';
    var endgame = yearsLeft(state) <= 3;

    var plan = {};
    own.forEach(function (u) { plan[u.at] = { unit: u.at, type: 'hold' }; });
    var busy = {};
    var supportedBy = {};
    function commit(order) {
      plan[order.unit] = order; busy[order.unit] = true;
      if (order.type === 'support') supportedBy[order.target] = true;
    }
    function isFree(a) { return !busy[a]; }
    var claimed = {};

    var threatOf = {};
    own.forEach(function (u) { threatOf[u.at] = enemiesThatCanEnter(state, u.at, me).length; });

    function freeHelpers(target, dest, exclude) {
      var out = [];
      own.forEach(function (h) {
        if (!isFree(h.at) || h.at === exclude) return;
        // berserk: everyone may support out
        if (false && autumn && state.owners[h.at] === me && threatOf[h.at] > 0 && h.at !== target) return;
        if (legalSupport(state, h.at, target, dest)) out.push(h);
      });
      out.sort(function (a, b) { return cmp(a.at, b.at); });
      return out;
    }

    // ---- 0. promised supports we owe ----
    (state.accepted || []).forEach(function (pr) {
      if (pr.power !== me || pr.type !== 'support' || !pr.terms) return;
      var t = pr.terms.unit, td = pr.terms.dest;
      if (!at[t]) return;
      var destProv = td === 'hold' ? t : td;
      var occDest = at[destProv];
      if (td !== 'hold' && occDest && occDest.power === me) return;
      for (var i = 0; i < own.length; i++) {
        var s = own[i];
        if (!isFree(s.at) || s.at === t) continue;
        if (legalSupport(state, s.at, t, td)) {
          if (autumn && state.owners[s.at] === me && threatOf[s.at] > 0) continue;
          commit({ unit: s.at, type: 'support', target: t, targetDest: td });
          break;
        }
      }
    });

    // ---- requested-support boosts ----
    var boost = {};
    (state.accepted || []).forEach(function (pr) {
      if (pr.type !== 'support' || !pr.terms || pr.power === me || pr.partner !== me) return;
      var mine = own.some(function (u) { return u.at === pr.terms.unit; });
      if (!mine) return;
      if (!boost[pr.terms.unit]) boost[pr.terms.unit] = {};
      boost[pr.terms.unit][pr.terms.dest] = (boost[pr.terms.unit][pr.terms.dest] || 0) + 60;
    });

    var targets = new Set();
    Object.keys(state.owners || {}).forEach(function (sc) {
      if (state.owners[sc] !== me) targets.add(sc);
    });

    // ---- 1. GARRISON: send someone back to own SCs left empty and reachable ----
    var garrisons = [];
    Object.keys(state.owners || {}).forEach(function (sc) {
      if (state.owners[sc] !== me) return;
      var occ = at[sc];
      if (occ && occ.power === me) return;
      var incomers = enemiesThatCanEnter(state, sc, me);
      if (!occ && incomers.length === 0) return; // safe, unreachable
      if (incomers.length >= 3) return; // overrun: save the unit
      garrisons.push(sc);
    });
    garrisons.sort(cmp);
    garrisons.forEach(function (sc) {
      var occ = at[sc];
      if (occ) return; // empty homes only: squatters are handled by normal attacks
      var gs = [];
      own.forEach(function (u) {
        if (!isFree(u.at)) return;
        if (autumn && state.owners[u.at] !== me) return; // capturing where it stands
        if (state.owners[u.at] === me && threatOf[u.at] > 0) return; // don't empty a threatened SC
        var legal = state.legalOrders[u.at] || [];
        var has = legal.some(function (o) { return o.type === 'move' && o.dest === sc; });
        if (!has) return;
        gs.push({ u: u, cost: (state.owners[u.at] === me) ? (autumn ? 60 : 20) : 0 });
      });
      gs.sort(function (a, b) { return (a.cost - b.cost) || cmp(a.u.at, b.u.at); });
      if (!gs.length) return;
      if (occ) {
        if (friends[occ.power] && !betrayOk(state, occ.power)) return;
        var mv = gs[0].u;
        var need = Math.min(4, 2 + estimateSupport(state, occ));
        var helpers = freeHelpers(mv.at, sc, mv.at);
        if (helpers.length + 1 < need - 1) return;
        if (threatOf[mv.at] > 0 && helpers.length + 1 < need) return;
        commit({ unit: mv.at, type: 'move', dest: sc });
        claimed[sc] = true;
        for (var i = 0; i < Math.min(helpers.length, need - 1); i++) {
          commit({ unit: helpers[i].at, type: 'support', target: mv.at, targetDest: sc });
        }
      } else {
        commit({ unit: gs[0].u.at, type: 'move', dest: sc });
        claimed[sc] = true;
      }
    });

    // ---- 2. candidate attacks / captures ----
    var cands = [];
    own.forEach(function (u) {
      if (!isFree(u.at)) return;
      var onOwnedSC = state.owners[u.at] === me;
      // Autumn consolidation: an owned SC is only ever vacated for a safe free capture.
      // (Safe = no enemy can walk in, or another of our moves backfills it.)
      var mayLeave = true;
      if (autumn && onOwnedSC) {
        mayLeave = enemiesThatCanEnter(state, u.at, me).length === 0 || claimed[u.at];
      }
      var legal = state.legalOrders[u.at] || [];
      var distBefore = bfsDist(state, u, u.at, targets);
      legal.forEach(function (o) {
        if (o.type !== 'move') return;
        var dest = o.dest;
        var occ = at[dest];
        if (occ && occ.power === me) return; // no chains
        if (dmz[dest] && !endgame) return;
        var owner = Object.hasOwnProperty.call(state.owners, dest) ? state.owners[dest] : undefined;
        var isSC = owner !== undefined;
        // Autumn: a unit sitting on a capturable SC stays to capture it.
        // Only exception: fleeing an overrun position for another free capture.
        if (autumn && Object.hasOwnProperty.call(state.owners, u.at) && state.owners[u.at] !== me) {
          if (!(isSC && owner !== me && !occ)) return;
        }
        if (false && autumn && onOwnedSC && !mayLeave) return; // berserk: fluid
        var score, need = 1;
        if (isSC && owner !== me) {
          if (!occ) {
            score = (autumn ? 200 : 120) + (owner === null ? 10 : 0);
            var contest = enemiesThatCanEnter(state, dest, me).length;
            if (contest > 0) {
              if (freeHelpers(u.at, dest, u.at).length) need = 2;
              else { need = 1; score -= 30; }
            }
            if (boost[u.at] && boost[u.at][dest]) { score += boost[u.at][dest]; need = 2; }
          } else {
            if (friends[occ.power] && !betrayOk(state, occ.power)) return;
            var est = estimateSupport(state, occ);
            score = (autumn ? 170 : 90) - 15 * est + (owner === null ? 10 : 0);
            if (boost[u.at] && boost[u.at][dest]) score += boost[u.at][dest];
            need = Math.min(4, 2 + est);
          }
        } else if (isSC && owner === me) {
          return; // own SCs handled by garrison logic
        } else {
          if (occ) return; // non-SC cuts handled in leftovers
          var distAfter = bfsDist(state, u, dest, targets);
          if (distAfter >= distBefore && !(boost[u.at] && boost[u.at][dest])) return;
          score = autumn ? (14 - 2 * distAfter) : (34 - 4 * distAfter);
          if (boost[u.at] && boost[u.at][dest]) score += boost[u.at][dest];
          if (score < 2) return;
        }
        // vacating in Spring: fluid (berserk)
        if (false && !autumn && onOwnedSC && !(isSC && owner !== me && !occ)) score -= 30;
        // Autumn: threatened units prefer to sit unless it is a free capture (berserk: off)
        if (false && autumn && threatOf[u.at] > 0 && !(isSC && owner !== me && !occ)) score -= 60;
        cands.push({ order: { unit: u.at, type: 'move', dest: dest }, score: score, need: need, threatened: threatOf[u.at] > 0 });
      });
    });
    cands.sort(function (a, b) {
      return (b.score - a.score) || cmp(a.order.unit, b.order.unit) || cmp(a.order.dest, b.order.dest);
    });

    // ---- 3. assign attacks, then defend Autumn SCs with what is left ----
    cands.forEach(function (c) {
      var m = c.order.unit, dest = c.order.dest;
      if (!isFree(m) || claimed[dest]) return;
      var helpers = freeHelpers(m, dest, m);
      if (at[dest] && at[dest].power !== me) {
        if (helpers.length + 1 < c.need - 1) return;
        if (false && c.threatened && helpers.length + 1 < c.need) return;
        if (!helpers.length && c.need >= 3 && !endgame) return;
        var take = Math.min(helpers.length, Math.max(0, c.need - 1));
        commit(c.order);
        claimed[dest] = true;
        for (var i = 0; i < take; i++) {
          commit({ unit: helpers[i].at, type: 'support', target: m, targetDest: dest });
        }
      } else {
        commit(c.order);
        claimed[dest] = true;
        if (c.need > 1 && helpers.length) {
          commit({ unit: helpers[0].at, type: 'support', target: m, targetDest: dest });
        }
      }
    });

    if (false && autumn) {
      var defs = own.filter(function (u) {
        return isFree(u.at) && plan[u.at].type === 'hold' && threatOf[u.at] > 0 &&
          Object.hasOwnProperty.call(state.owners, u.at);
      }).map(function (u) {
        var v = (state.owners[u.at] === me ? 150 : 120) + 12 * threatOf[u.at];
        return { u: u, v: v };
      }).sort(function (a, b) { return (b.v - a.v) || cmp(a.u.at, b.u.at); });
      defs.forEach(function (d) {
        if (!isFree(d.u.at)) return;
        var helpers = freeHelpers(d.u.at, 'hold', d.u.at);
        var want = Math.min(threatOf[d.u.at], helpers.length);
        if (want === 0 && state.owners[d.u.at] === me && helpers.length) want = 1;
        for (var i = 0; i < want; i++) {
          commit({ unit: helpers[i].at, type: 'support', target: d.u.at, targetDest: 'hold' });
        }
      });
    }

    // ---- 4. leftovers ----
    own.forEach(function (u) {
      if (!isFree(u.at)) return;
      // reinforce an unsupported own attack
      var best = null;
      own.forEach(function (m) {
        if (busy[m.at] && plan[m.at].type === 'move' && plan[m.at].dest) {
          if (!legalSupport(state, u.at, m.at, plan[m.at].dest)) return;
          var tgt = at[plan[m.at].dest];
          var es = tgt && tgt.power !== me ? estimateSupport(state, tgt) : 0;
          var cur = 0;
          own.forEach(function (h) {
            if (busy[h.at] && plan[h.at].type === 'support' && plan[h.at].target === m.at) cur++;
          });
          if (cur === 0 && es > 0 && (!best || cmp(m.at, best) < 0)) best = m.at;
        }
      });
      if (best) {
        commit({ unit: u.at, type: 'support', target: best, targetDest: plan[best].dest });
        return;
      }
      // Autumn: support-hold a threatened SC holder
      if (false && autumn) {
        var helped = null;
        own.forEach(function (m) {
          if (m.at === u.at || !isFree(m.at) || plan[m.at].type !== 'hold') return;
          if (threatOf[m.at] === 0) return;
          if (!Object.hasOwnProperty.call(state.owners, m.at)) return;
          if (legalSupport(state, u.at, m.at, 'hold')) {
            if (!helped || cmp(m.at, helped) < 0) helped = m.at;
          }
        });
        if (helped) {
          commit({ unit: u.at, type: 'support', target: helped, targetDest: 'hold' });
          return;
        }
      }
      // support-cut when engaged; never abandon a defended unit
      if (threatOf[u.at] > 0 && !supportedBy[u.at]) {
        var legal = state.legalOrders[u.at] || [];
        var cuts = [];
        legal.forEach(function (o) {
          if (o.type !== 'move') return;
          var occ = at[o.dest];
          if (!occ || occ.power === me) return;
          if (claimed[o.dest]) return;
          if (dmz[o.dest] && !endgame) return;
          if (friends[occ.power] && !betrayOk(state, occ.power)) return;
          cuts.push(o);
        });
        cuts.sort(function (a, b) { return cmp(a.dest, b.dest); });
        if (cuts.length) {
          commit(cuts[0]);
          claimed[cuts[0].dest] = true;
          return;
        }
      }
      // Spring: march toward the nearest non-owned SC; never abandon a defended unit
      if (!autumn && targets.size && !supportedBy[u.at]) {
        var distB = bfsDist(state, u, u.at, targets);
        var bestMove = null, bestD = distB;
        (state.legalOrders[u.at] || []).forEach(function (o) {
          if (o.type !== 'move') return;
          if (at[o.dest] || claimed[o.dest]) return;
          if (dmz[o.dest] && !endgame) return;
          var d = bfsDist(state, u, o.dest, targets);
          if (d < bestD || (d === bestD && bestMove && cmp(o.dest, bestMove.dest) < 0)) {
            bestMove = o; bestD = d;
          }
        });
        if (bestMove) { commit(bestMove); claimed[bestMove.dest] = true; return; }
      }
      // else hold
    });

    return own.map(function (u) { return plan[u.at]; });
  }

  module.exports = {
    name: 'Anatolian Pactbreaker',
    propose: function (state) {
      try {
        var others = living(state, true);
        if (!others.length) return [];
        var me = state.you;
        var myUnits = ownUnits(state);
        var adj = {};
        myUnits.forEach(function (u) {
          (state.map.adjacency[u.at] || []).forEach(function (n) {
            var occ = null;
            state.units.forEach(function (x) { if (x.at === n) occ = x; });
            var o = occ ? occ.power : state.owners[n];
            if (o && o !== me && others.indexOf(o) >= 0) adj[o] = true;
          });
        });
        var neigh = others.filter(function (p) { return adj[p]; });
        var pool = neigh.length ? neigh : others.slice();
        pool.sort(function (a, b) {
          return ((state.centresByPower[a] || 0) - (state.centresByPower[b] || 0)) || cmp(a, b);
        });
        var sorted = others.slice().sort(function (a, b) {
          return ((state.centresByPower[b] || 0) - (state.centresByPower[a] || 0)) || cmp(a, b);
        });
        var leader = sorted[0];
        var out = [];
        pool.slice(0, 4).forEach(function (p) {
          if (out.length >= 6) return;
          if (leader && p !== leader) out.push({ to: p, type: 'alliance', terms: { target: leader } });
          else out.push({ to: p, type: 'peace', terms: {} });
        });
        if (out.length < 6 && leader && pool.indexOf(leader) < 0) {
          out.push({ to: leader, type: 'peace', terms: {} });
        }
        return out.slice(0, 6);
      } catch (e) { return []; }
    },
    answer: function (state) {
      try {
        var res = {};
        (state.inbox || []).forEach(function (p) {
          var a = 'reject';
          if (p.type === 'peace' || p.type === 'alliance' || p.type === 'dmz') {
            a = 'accept';
          } else if (p.type === 'support' && p.terms) {
            var t = p.terms.unit, td = p.terms.dest;
            var bene = null;
            state.units.forEach(function (x) { if (x.at === t && x.power === p.from) bene = x; });
            var destProv = td === 'hold' ? t : td;
            var bad = false;
            state.units.forEach(function (x) {
              if (x.at === destProv && x.power === state.you) bad = true;
            });
            if (bene && !bad) {
              var ok = ownUnits(state).some(function (u) {
                return u.at !== t && legalSupport(state, u.at, t, td);
              });
              if (ok) a = 'accept';
            }
          } else if (p.type === 'request-support' && p.terms) {
            var mine = ownUnits(state).some(function (u) { return u.at === p.terms.unit; });
            if (mine) a = 'accept';
          }
          res[p.id] = a;
        });
        return res;
      } catch (e) { return {}; }
    },
    orders: function (state) {
      try {
        return buildOrders(state);
      } catch (e) {
        try {
          return ownUnits(state).map(function (u) { return { unit: u.at, type: 'hold' }; });
        } catch (e2) { return []; }
      }
    },
    retreats: function (state) {
      try {
        var res = {};
        (state.retreats || []).forEach(function (r) {
          var best = null, bestScore = -1e9;
          (r.options || []).forEach(function (o) {
            var isSC = Object.hasOwnProperty.call(state.owners, o);
            var owner = state.owners[o];
            var foes = 0;
            (state.map.adjacency[o] || []).forEach(function (n) {
              state.units.forEach(function (x) {
                if (x.at === n && x.power !== state.you) foes++;
              });
            });
            var s = (isSC ? (owner === state.you || owner === null || owner === undefined ? 50 : 40) : 0) - 4 * foes;
            if (s > bestScore || (s === bestScore && (best === null || cmp(o, best) < 0))) {
              bestScore = s; best = o;
            }
          });
          res[r.at] = best || null;
        });
        return res;
      } catch (e) { return {}; }
    },
    builds: function (state) {
      try {
        var me = state.you;
        var own = ownUnits(state);
        var delta = (state.centresByPower[me] || 0) - own.length;
        if (delta === 0) return [];
        var homes = state.map.provinces.filter(function (p) { return p.home === me; });
        if (delta > 0) {
          var free = homes.filter(function (h) {
            if (state.owners[h.id] !== me) return false;
            return !state.units.some(function (u) { return u.at === h.id; });
          });
          var targets = new Set();
          Object.keys(state.owners || {}).forEach(function (sc) {
            if (state.owners[sc] !== me) targets.add(sc);
          });
          var armies = own.filter(function (u) { return u.type === 'army'; }).length;
          var fleets = own.length - armies;
          free.sort(function (a, b) {
            var da = bfsDist(state, { type: 'army' }, a.id, targets);
            var db = bfsDist(state, { type: 'army' }, b.id, targets);
            return (da - db) || cmp(a.id, b.id);
          });
          var out = [];
          free.slice(0, delta).forEach(function (h) {
            var wantFleet = h.coastal && (fleets === 0 || fleets * 2 < armies);
            if (wantFleet) fleets++;
            else armies++;
            out.push({ type: wantFleet ? 'fleet' : 'army', at: h.id });
          });
          return out;
        }
        var ranked = own.map(function (u) {
          var isSC = Object.hasOwnProperty.call(state.owners, u.at);
          var home = state.map.provinces.some(function (p) { return p.id === u.at && p.home === me; });
          return { u: u, v: (isSC ? 10 : 0) + (home ? 2 : 0) + (u.type === 'fleet' ? 1 : 0) };
        }).sort(function (a, b) { return (a.v - b.v) || cmp(a.u.at, b.u.at); });
        return ranked.slice(0, -delta).map(function (r) { return { disband: r.u.at }; });
      } catch (e) { return []; }
    }
  };
})();
