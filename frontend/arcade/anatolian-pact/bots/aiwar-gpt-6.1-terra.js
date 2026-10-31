(function () {
  'use strict';

  function ownUnits(state) {
    return state.units.filter(function (u) { return u.power === state.you; });
  }
  function living(state) {
    return Object.keys(state.centresByPower).filter(function (p) {
      return p !== state.you && (state.centresByPower[p] > 0 ||
        state.units.some(function (u) { return u.power === p; }));
    });
  }
  function alliesOf(state) {
    var s = {};
    (state.accepted || []).forEach(function (pr) {
      if (pr.type === 'peace' || pr.type === 'alliance') {
        s[pr.power === state.you ? pr.partner : pr.power] = true;
      }
    });
    return s;
  }
  function dmzOf(state) {
    var s = {};
    (state.accepted || []).forEach(function (pr) {
      if (pr.type === 'dmz') s[pr.terms.province] = true;
    });
    return s;
  }
  // A power that has ever broken a promise is untrustworthy:
  // defend against it fully and allow retaliation.
  function untrust(state, power) {
    var t = state.trust && state.trust[power];
    return !!t && (t.broken || 0) > 0;
  }
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Terrain-aware move legality approximation for enemy units
  // (we cannot see their legalOrders; use map plus unit type).
  function approxCanMove(unitType, from, dest, provById, adjacency) {
    var adj = adjacency[from] || [];
    if (adj.indexOf(dest) < 0) return false;
    var to = provById[dest];
    if (!to) return false;
    if (unitType === 'army') return to.type === 'land';
    if (to.type === 'sea') return true;
    if (!to.coastal) return false;
    var fp = provById[from];
    if (fp && fp.type === 'sea') return true;
    for (var i = 0; i < adj.length; i++) {
      var mid = provById[adj[i]];
      if (mid && mid.type === 'sea' && (adjacency[dest] || []).indexOf(adj[i]) >= 0) return true;
    }
    return false;
  }

  function canSupportLegal(state, from, target, dest) {
    var legal = state.legalOrders[from] || [];
    for (var i = 0; i < legal.length; i++) {
      var o = legal[i];
      if (o.type === 'support' && o.target === target && o.targetDest === dest) return true;
    }
    return false;
  }

  function destValue(state, dest, isAutumn) {
    var v = 0;
    var isSC = Object.hasOwn(state.owners, dest);
    var owner = isSC ? state.owners[dest] : undefined;
    var occ = null;
    for (var i = 0; i < state.units.length; i++) {
      if (state.units[i].at === dest) { occ = state.units[i]; break; }
    }
    if (isSC && owner !== state.you) {
      v += (owner === null || owner === undefined) ? 60 : 50;
      if (isAutumn) v += 40;
    } else if (isSC) {
      v += 2;
    } else {
      v += 1;
    }
    if (!occ) v += 8;
    return v;
  }

  function computeThreat(state, me, allies, unitByAt, provById) {
    var threat = {};
    var mine = state.units.filter(function (u) { return u.power === me; });
    mine.forEach(function (u) {
      var n = 0;
      var adj = state.map.adjacency[u.at] || [];
      adj.forEach(function (a) {
        var e = unitByAt[a];
        if (e && e.power !== me &&
            approxCanMove(e.type, a, u.at, provById, state.map.adjacency)) {
          n += (!allies[e.power] || untrust(state, e.power)) ? 1 : 0.5;
        }
      });
      threat[u.at] = n;
    });
    try {
      predictOthers(state, allies).forEach(function (po) {
        if (po.type === 'support') {
          var t = unitByAt[po.target];
          if (!t || t.power === me) return;
          var aims = unitByAt[po.targetDest === 'hold' ? po.target : po.targetDest];
          if (aims && aims.power === me) threat[aims.at] = (threat[aims.at] || 0) + 1;
        } else if (po.type === 'move') {
          var holder = unitByAt[po.dest];
          if (holder && holder.power === me) threat[holder.at] = (threat[holder.at] || 0) + 2;
        }
      });
    } catch (e) {}
    return threat;
  }

  // Final year or near-majority for us: promises stop constraining our attacks.
  function endgameNow(state, me) {
    if (state.year >= state.limits.maxYears) return true;
    if ((state.centresByPower[me] || 0) >= 10) return true;
    return false;
  }

  function greedyOrders(state) {
    var me = state.you;
    var mine = ownUnits(state);
    var allies = alliesOf(state);
    var dmz = dmzOf(state);
    var isAutumn = state.season === 'Autumn';
    var endgame = endgameNow(state, me);
    var unitByAt = {};
    state.units.forEach(function (u) { unitByAt[u.at] = u; });
    var provById = {};
    (state.map.provinces || []).forEach(function (p) { provById[p.id] = p; });
    var plan = {};
    mine.forEach(function (u) { plan[u.at] = { unit: u.at, type: 'hold' }; });

    var promised = (state.accepted || []).filter(function (pr) {
      return pr.power === me && pr.type === 'support';
    });
    promised.forEach(function (pr) {
      var t = pr.terms.unit;
      var d = pr.terms.dest;
      for (var i = 0; i < mine.length; i++) {
        var s = mine[i];
        if (plan[s.at].type !== 'hold') continue;
        if (canSupportLegal(state, s.at, t, d)) {
          plan[s.at] = { unit: s.at, type: 'support', target: t, targetDest: d };
          break;
        }
      }
    });

    var threat = computeThreat(state, me, allies, unitByAt, provById);

    var cands = [];
    var grudge = {};
    var hist = state.history || [];
    if (hist.length && hist[hist.length - 1].orders && hist[hist.length - 1].orders[me]) {
      hist[hist.length - 1].orders[me].forEach(function (ro) {
        if (ro.type === 'move' && (ro.outcome === 'bounce' || ro.outcome === 'standoff')) {
          grudge[ro.unit + '>' + ro.dest] = true;
        }
      });
    }
    mine.forEach(function (u) {
      if (plan[u.at].type !== 'hold') return;
      // Autumn: a unit sitting on a capturable SC stays (support allowed, moves not).
      if (isAutumn && !endgame && Object.hasOwn(state.owners, u.at) &&
          state.owners[u.at] !== me && state.owners[u.at] !== undefined) return;
      var legal = state.legalOrders[u.at] || [];
      legal.forEach(function (o) {
        if (o.type !== 'move') return;
        if (dmz[o.dest] && !endgame) return;
        var occ = unitByAt[o.dest];
        if (occ && occ.power === me) return;
        if (occ && allies[occ.power] && !endgame && !untrust(state, occ.power)) return;
        var def = 0;
        if (occ) {
          def = 1;
          var tadj = state.map.adjacency[o.dest] || [];
          tadj.forEach(function (a) {
            if (a === u.at) return;
            var s2 = unitByAt[a];
            if (s2 && s2.power === occ.power &&
                approxCanMove(s2.type, a, o.dest, provById, state.map.adjacency)) def++;
          });
        }
        var helpers = mine.filter(function (h) {
          return h.at !== u.at && h.at !== o.dest && plan[h.at].type === 'hold' &&
            canSupportLegal(state, h.at, u.at, o.dest);
        });
        var v = destValue(state, o.dest, isAutumn);
        if (occ) v += 6;
        if (grudge[u.at + '>' + o.dest] && helpers.length === 0) v -= 25;
        var stayBonus = 0;
        if (isAutumn && threat[u.at] > 0 && state.owners[u.at] === me) {
          stayBonus = 10 * threat[u.at];
        }
        cands.push({
          order: { unit: u.at, type: 'move', dest: o.dest },
          helpers: helpers,
          score: v - def * 9 - stayBonus,
          need: def,
          occupied: !!occ,
          ok: !occ || helpers.length >= def
        });
      });
    });
    cands.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.order.unit !== b.order.unit) return a.order.unit < b.order.unit ? -1 : 1;
      return a.order.dest < b.order.dest ? -1 : a.order.dest > b.order.dest ? 1 : 0;
    });

    var claimed = {};
    cands.forEach(function (c) {
      var o = c.order;
      if (plan[o.unit].type !== 'hold' || claimed[o.dest]) return;
      var use = c.helpers.filter(function (h) {
        return plan[h.at].type === 'hold' && h.at !== o.dest;
      }).slice(0, c.need);
      if (use.length < c.need) return;
      plan[o.unit] = o;
      claimed[o.dest] = true;
      use.forEach(function (h) {
        plan[h.at] = { unit: h.at, type: 'support', target: o.unit, targetDest: o.dest };
      });
    });

    // leftover hold units: reinforce planned attacks,
    // otherwise walk to the best empty province
    mine.forEach(function (u) {
      if (plan[u.at].type !== 'hold') return;
      var sitting = isAutumn && !endgame && Object.hasOwn(state.owners, u.at) &&
        state.owners[u.at] !== me && state.owners[u.at] !== undefined;
      var sup = null;
      Object.keys(plan).forEach(function (k) {
        var p = plan[k];
        if (p.type === 'move' && canSupportLegal(state, u.at, p.unit, p.dest) && u.at !== p.dest) sup = p;
      });
      if (sup) {
        plan[u.at] = { unit: u.at, type: 'support', target: sup.unit, targetDest: sup.dest };
        return;
      }
      var mv = null;
      var mvScore = -Infinity;
      if (!sitting) {
      (state.legalOrders[u.at] || []).forEach(function (o) {
        if (o.type !== 'move' || claimed[o.dest]) return;
        if (dmz[o.dest] && !endgame) return;
        var occ = unitByAt[o.dest];
        if (occ) return;
        var v = destValue(state, o.dest, isAutumn) +
          (threat[u.at] > 0 && state.owners[u.at] === me && isAutumn ? -15 : 0);
        if (v > mvScore) { mvScore = v; mv = o; }
      });
      }
      if (mv && mvScore > 4) {
        plan[u.at] = mv;
        claimed[mv.dest] = true;
      }
    });

    return mine.map(function (u) { return plan[u.at]; });
  }

  // Predict enemy orders from last season's history (repeat), else hold.
  // Allies included: a repeat attack from an ally is a stab we must see.
  // With no history (year 1), predict greedy expansion plus supported attacks.
  function predictOthers(state, allies) {
    var pred = [];
    var seasons = (state.history || []).filter(function (h) {
      return h.season === 'Spring' || h.season === 'Autumn';
    });
    var prev = seasons.length ? seasons[seasons.length - 1].orders : null;
    var unitByAt = {};
    state.units.forEach(function (u) { unitByAt[u.at] = u; });
    var provById = {};
    (state.map.provinces || []).forEach(function (p) { provById[p.id] = p; });
    var isAutumn = state.season === 'Autumn';
    state.units.forEach(function (u) {
      if (u.power === state.you) return;
      var o = { unit: u.at, type: 'hold' };
      if (prev) {
        if (prev[u.power]) {
          var old = null;
          for (var i = 0; i < prev[u.power].length; i++) {
            if (prev[u.power][i].unit === u.at) { old = prev[u.power][i]; break; }
          }
          if (old && (old.type === 'hold' || old.type === 'move' || old.type === 'support')) {
            o = { unit: u.at, type: old.type };
            if (old.type === 'move') o.dest = old.dest;
            if (old.type === 'support') { o.target = old.target; o.targetDest = old.targetDest; }
          }
        }
      }
      pred.push(o);
    });
    return pred;
  }

  function scoreResult(state, result, allies) {
    var me = state.you;
    var isAutumn = state.season === 'Autumn';
    var sea = {};
    var adjAll = state.map.adjacency || {};
    var typeOf = {};
    (state.map.provinces || []).forEach(function (p) { typeOf[p.id] = p.type; });
    Object.keys(adjAll).forEach(function (id) {
      if (typeOf[id] !== 'sea') return;
      for (var i = 0; i < adjAll[id].length; i++) {
        if (Object.hasOwn(state.owners, adjAll[id][i])) { sea[id] = true; break; }
      }
    });
    var pos = {};
    (result.units || []).forEach(function (u) { pos[u.at] = u; });
    var score = 0;
    Object.keys(pos).forEach(function (at) {
      var u = pos[at];
      var isSC = Object.hasOwn(state.owners, at);
      if (u.power === me) {
        if (isSC && state.owners[at] !== me) score += isAutumn ? 100 : 25;
        else if (isSC) score += 6;
        else score += sea[at] && u.type === 'fleet' ? 8 : 1;
      } else if (!allies[u.power]) {
        if (isSC && state.owners[at] === me) score -= isAutumn ? 90 : 10;
      }
    });
    (result.dislodged || []).forEach(function (d) {
      if (d.power === me) score -= 60;
      else if (!allies[d.power]) score += 15;
    });
    return score;
  }

  function improveOrders(state, seedPlan) {
    var engine = null;
    try {
      engine = typeof PactEngine !== 'undefined' ? PactEngine : null;
    } catch (e) { engine = null; }
    if (!engine || !engine.adjudicate) return seedPlan;
    var me = state.you;
    var mine = ownUnits(state);
    if (!mine.length) return seedPlan;
    var allies = alliesOf(state);
    var dmz = dmzOf(state);
    var endgame = endgameNow(state, me);
    var fixed = {};
    (state.accepted || []).forEach(function (pr) {
      if (pr.power === me && pr.type === 'support') fixed[pr.terms.unit + '>' + pr.terms.dest] = true;
    });
    var unitByAt = {};
    state.units.forEach(function (u) { unitByAt[u.at] = u; });
    var provById = {};
    (state.map.provinces || []).forEach(function (p) { provById[p.id] = p; });

    function legalFor(at) {
      var out = [];
      var stay = state.season === 'Autumn' && !endgame && Object.hasOwn(state.owners, at) &&
        state.owners[at] !== me && state.owners[at] !== undefined;
      (state.legalOrders[at] || []).forEach(function (o) {
        if (o.type === 'move') {
          if (stay) return;
          if (dmz[o.dest] && !endgame) return;
          var occ = unitByAt[o.dest];
          if (occ && occ.power === me) return;
          if (occ && allies[occ.power] && !endgame && !untrust(state, occ.power)) return;
          out.push(o);
        } else if (o.type === 'support') {
          // Only support our own units: foreign supports never help us
          // (accepted promise-supports are kept via the fixed set).
          var tu = unitByAt[o.target];
          if (tu && tu.power === me) out.push(o);
          else out.push({ unit: at, type: 'hold' });
        } else {
          out.push({ unit: at, type: 'hold' });
        }
      });
      return out;
    }

    var others = predictOthers(state, allies);
    var autumnKeep = state.season === 'Autumn' && !endgame;
    var threatH = computeThreat(state, me, allies, unitByAt, provById);
    function evaluate(orders) {
      var res;
      try {
        res = engine.adjudicate(state.units, orders.concat(others));
      } catch (e) { return -Infinity; }
      var s = scoreResult(state, res, allies);
      if (autumnKeep) {
        for (var k = 0; k < orders.length; k++) {
          var oo = orders[k];
          if ((oo.type === 'hold' || oo.type === 'support') &&
              Object.hasOwn(state.owners, oo.unit) && state.owners[oo.unit] !== me &&
              state.owners[oo.unit] !== undefined) s += 120;
        }
      }
      var seenMove = {};
      for (var m = 0; m < orders.length; m++) {
        if (orders[m].type === 'move' && (threatH[orders[m].unit] || 0) >= 2.5) s -= 40;
        if (orders[m].type === 'move') {
          if (seenMove[orders[m].dest]) s -= 50;
          seenMove[orders[m].dest] = true;
        }
      }
      return s;
    }

    var cur = seedPlan.slice();
    var curScore = evaluate(cur);
    var movable = [];
    mine.forEach(function (u) {
      var p = null;
      for (var i = 0; i < cur.length; i++) if (cur[i].unit === u.at) p = cur[i];
      if (!p || p.type === 'hold') { movable.push(u.at); return; }
      if (p.type === 'support' && fixed[p.target + '>' + p.targetDest]) return;
      movable.push(u.at);
    });

    // Deterministic best-improvement descent: each sweep tries every legal
    // single-unit change and takes the best (max 3 sweeps).
    var improved = true;
    var sweeps = 0;
    while (improved && sweeps < 3 && movable.length) {
      improved = false;
      sweeps++;
      var bestNext = null;
      for (var mi = 0; mi < movable.length; mi++) {
        var at = movable[mi];
        var idx = -1;
        for (var i = 0; i < cur.length; i++) if (cur[i].unit === at) idx = i;
        if (idx < 0) continue;
        var opts = legalFor(at);
        for (var oi = 0; oi < opts.length; oi++) {
          var next = cur.slice();
          next[idx] = opts[oi];
          var s = evaluate(next);
          if (s > curScore) { curScore = s; bestNext = next; }
        }
      }
      if (bestNext) { cur = bestNext; improved = true; }
    }
    return cur;
  }

  function orders(state) {
    var seedPlan = greedyOrders(state);
    try {
      return improveOrders(state, seedPlan);
    } catch (e) {
      return seedPlan;
    }
  }

  function bestRetreat(state, u) {
    var opts = u.options || [];
    if (!opts.length) return null;
    var allies = alliesOf(state);
    var me = state.you;
    function score(p) {
      var v = 0;
      if (Object.hasOwn(state.owners, p) && state.owners[p] !== me) v += 50;
      else if (Object.hasOwn(state.owners, p)) v += 10;
      var adj = state.map.adjacency[p] || [];
      var enemies = 0;
      adj.forEach(function (a) {
        var e = null;
        for (var i = 0; i < state.units.length; i++) {
          if (state.units[i].at === a) { e = state.units[i]; break; }
        }
        if (e && e.power !== me && (!allies[e.power] || untrust(state, e.power))) enemies++;
      });
      v -= enemies * 6;
      return v;
    }
    var srt = opts.slice().sort(function (a, b) {
      var d = score(b) - score(a);
      return d !== 0 ? d : (a < b ? -1 : a > b ? 1 : 0);
    });
    return srt[0] || null;
  }

  module.exports = {
    name: 'Anatolian Hammer',

    propose: function (state) {
      var out = [];
      var adjPowers = {};
      ownUnits(state).forEach(function (u) {
        (state.map.adjacency[u.at] || []).forEach(function (a) {
          var e = null;
          for (var i = 0; i < state.units.length; i++) {
            if (state.units[i].at === a) { e = state.units[i]; break; }
          }
          if (e && e.power !== state.you) adjPowers[e.power] = true;
          if (Object.hasOwn(state.owners, a) && state.owners[a] !== state.you && state.owners[a]) {
            adjPowers[state.owners[a]] = true;
          }
        });
      });
      var adj = Object.keys(adjPowers).filter(function (p) {
        return state.centresByPower[p] > 0 || state.units.some(function (u) { return u.power === p; });
      }).sort();
      var rest = living(state).filter(function (p) { return !adjPowers[p]; }).sort(function (a, b) {
        return (state.centresByPower[b] - state.centresByPower[a]) || (a < b ? -1 : 1);
      });
      adj.concat(rest).slice(0, 6).forEach(function (to) {
        out.push({ to: to, type: 'peace', terms: {} });
      });
      return out.slice(0, 6);
    },

    answer: function (state) {
      var res = {};
      (state.inbox || []).forEach(function (p) {
        var ok = false;
        var bad = untrust(state, p.from);
        if ((p.type === 'peace' || p.type === 'alliance' || p.type === 'dmz') && !bad) ok = true;
        else if (p.type === 'support') ok = true;
        else if (p.type === 'request-support' && !bad) {
          var found = false;
          ownUnits(state).forEach(function (u) {
            if (canSupportLegal(state, u.at, p.terms.unit, p.terms.dest)) found = true;
          });
          ok = found;
        }
        res[p.id] = ok ? 'accept' : 'reject';
      });
      return res;
    },

    orders: orders,

    retreats: function (state) {
      var res = {};
      (state.retreats || []).forEach(function (u) {
        if (u.power !== state.you) return;
        res[u.at] = bestRetreat(state, u);
      });
      return res;
    },

    builds: function (state) {
      var mine = ownUnits(state);
      var delta = (state.centresByPower[state.you] || 0) - mine.length;
      var provById = {};
      (state.map.provinces || []).forEach(function (p) { provById[p.id] = p; });
      if (delta > 0) {
        var fleets = mine.filter(function (u) { return u.type === 'fleet'; }).length;
        var spots = (state.map.provinces || []).filter(function (p) {
          return p.home === state.you && state.owners[p.id] === state.you &&
            !mine.some(function (u) { return u.at === p.id; });
        }).sort(function (a, b) { return a.id < b.id ? -1 : 1; }).slice(0, delta);
        return spots.map(function (p) {
          var wantFleet = p.coastal && fleets < Math.max(1, Math.ceil(mine.length / 3));
          if (wantFleet) fleets++;
          return { type: wantFleet ? 'fleet' : 'army', at: p.id };
        });
      }
      if (delta < 0) {
        var scored = mine.map(function (u) {
          var v = 0;
          if (state.owners[u.at] === state.you) v += 20;
          if (Object.hasOwn(state.owners, u.at)) v += 10;
          var p = provById[u.at];
          if (p && p.home === state.you) v += 5;
          return { u: u, v: v };
        }).sort(function (a, b) {
          if (a.v !== b.v) return a.v - b.v;
          return a.u.at < b.u.at ? -1 : 1;
        });
        return scored.slice(0, -delta).map(function (s) { return { disband: s.u.at }; });
      }
      return [];
    }
  };
})();
