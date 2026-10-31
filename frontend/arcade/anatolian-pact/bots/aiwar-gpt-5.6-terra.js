(function () {
  'use strict';

  var POWERS = ['Phrygia', 'Lydia', 'Caria', 'Bithynia', 'Galatia', 'Cilicia'];

  function ownUnits(state) {
    return state.units.filter(function (u) { return u.power === state.you; });
  }

  function living(state) {
    return POWERS.filter(function (p) {
      return p !== state.you &&
        (state.centresByPower[p] > 0 || state.units.some(function (u) { return u.power === p; }));
    });
  }

  function unitAt(state, at) {
    for (var i = 0; i < state.units.length; i++) {
      if (state.units[i].at === at) return state.units[i];
    }
    return null;
  }

  // Local terrain legality mirror (engine: armies land-only; fleets need shared sea for coast-to-coast).
  function canMoveAs(map, type, from, dest) {
    var adj = map.adjacency[from];
    if (!adj || adj.indexOf(dest) < 0) return false;
    var fromP = null, toP = null, i;
    for (i = 0; i < map.provinces.length; i++) {
      if (map.provinces[i].id === from) fromP = map.provinces[i];
      if (map.provinces[i].id === dest) toP = map.provinces[i];
    }
    if (!fromP || !toP) return false;
    if (type === 'army') return toP.type === 'land';
    if (toP.type === 'land' && !toP.coastal) return false;
    if (fromP.type === 'sea' || toP.type === 'sea') return true;
    for (i = 0; i < adj.length; i++) {
      var mid = null, j;
      for (j = 0; j < map.provinces.length; j++) {
        if (map.provinces[j].id === adj[i]) mid = map.provinces[j];
      }
      if (mid && mid.type === 'sea' && map.adjacency[dest].indexOf(adj[i]) >= 0) return true;
    }
    return false;
  }

  function bfsDist(map, type, from, isGoal) {
    if (isGoal(from)) return 0;
    var seen = {}, q = [[from, 0]];
    seen[from] = true;
    for (var i = 0; i < q.length; i++) {
      var at = q[i][0], d = q[i][1];
      var adj = map.adjacency[at] || [];
      for (var k = 0; k < adj.length; k++) {
        if (seen[adj[k]]) continue;
        if (!canMoveAs(map, type, at, adj[k])) continue;
        if (isGoal(adj[k])) return d + 1;
        seen[adj[k]] = true;
        q.push([adj[k], d + 1]);
      }
    }
    return 99;
  }

  function scValue(state, dest) {
    if (!Object.hasOwnProperty.call(state.owners, dest)) return 0; // not a supply centre
    var owner = state.owners[dest];
    if (owner === state.you) return -50;
    if (owner === null || owner === undefined) return 120; // unowned neutral SC
    return 100;
  }

  function supportOptionsFor(state, supporterAt, targetAt, targetDest) {
    var legals = state.legalOrders[supporterAt] || [];
    for (var i = 0; i < legals.length; i++) {
      var o = legals[i];
      if (o.type === 'support' && o.target === targetAt && o.targetDest === targetDest) return o;
    }
    return null;
  }

  function bounceStats(state) {
    var cur = state.year * 2 + (state.season === 'Autumn' ? 1 : 0);
    var m = {};
    (state.history || []).forEach(function (h) {
      var ago = cur - (h.year * 2 + (h.season === 'Autumn' ? 1 : 0));
      var mine = (h.orders && h.orders[state.you]) || [];
      mine.forEach(function (o) {
        if (o.type === 'move' && o.outcome === 'bounce' && typeof o.dest === 'string') {
          var e = m[o.dest] || { count: 0, ago: 99 };
          e.count++;
          if (ago < e.ago) e.ago = ago;
          m[o.dest] = e;
        }
      });
    });
    return m;
  }

  function pickVictim(state) {
    var best = null;
    living(state).forEach(function (p) {
      var units = state.units.filter(function (u) { return u.power === p; }).length;
      var c = state.centresByPower[p] || 0;
      var adjacent = state.units.some(function (u) {
        return u.power === state.you && (state.map.adjacency[u.at] || []).some(function (at) {
          var occ = unitAt(state, at);
          return (occ && occ.power === p) || state.owners[at] === p;
        });
      });
      var score = units * 100 + c - (adjacent ? 50 : 0);
      if (!best || score < best.score || (score === best.score && p < best.p)) {
        best = { p: p, score: score };
      }
    });
    return best && best.p;
  }

  function incomingStats(state) {
    var cur = state.year * 2 + (state.season === 'Autumn' ? 1 : 0);
    var m = {};
    (state.history || []).forEach(function (h) {
      var ago = cur - (h.year * 2 + (h.season === 'Autumn' ? 1 : 0));
      if (ago > 2) return;
      POWERS.forEach(function (p) {
        if (p === state.you) return;
        ((h.orders && h.orders[p]) || []).forEach(function (o) {
          if (o.type === 'move' && typeof o.dest === 'string') {
            var e = m[o.dest] || { count: 0, ago: 99 };
            e.count++;
            if (ago < e.ago) e.ago = ago;
            m[o.dest] = e;
          }
        });
      });
    });
    return m;
  }

  function orders(state) {
    var own = ownUnits(state);
    var plan = {};
    var free = {};
    own.forEach(function (u) {
      plan[u.at] = { unit: u.at, type: 'hold' };
      free[u.at] = true;
    });
    function take(at) { free[at] = false; }
    function isFree(at) { return !!free[at]; }

    var claimed = {};
    var i, k;

    // 1. Autumn locks. Sitters on capturable SCs must hold to convert;
    // holders of threatened owned SCs stay (vacating gifts the SC).
    // Spring occupation changes nothing, so Spring has no locks: expand freely.
    function enemiesAbleToEnter(dest) {
      var out = [];
      for (var i = 0; i < state.units.length; i++) {
        var e = state.units[i];
        if (e.power === state.you) continue;
        if (canMoveAs(state.map, e.type, e.at, dest)) out.push(e);
      }
      return out;
    }

    if (state.season === 'Autumn') {
      var incoming = incomingStats(state);
      own.forEach(function (u) {
        if (!isFree(u.at)) return;
        // Sitters on capturable SCs hold to convert.
        if (scValue(state, u.at) > 0) { take(u.at); return; }
        // Holders with demonstrated incoming attacks stay; hypothetical
        // threats are met by counter-attack, not by turtling.
        if (state.owners[u.at] === state.you && incoming[u.at] && incoming[u.at].ago <= 2) {
          take(u.at);
        }
      });
    }

    // 2. Offence: only SC targets. Empty SCs are walked into (with a
    // supporter when a rival could contest); occupied SCs need mass.
    var cands = [];
    var bounces = bounceStats(state);
    var counts = state.centresByPower;
    var leader = POWERS.filter(function (p) { return p !== state.you; })
      .sort(function (a, b) { return (counts[b] - counts[a]) || (a < b ? -1 : 1); })[0];
    var myC = counts[state.you] || 0;
    var contain = leader && ((counts[leader] || 0) >= 11 ||
      ((counts[leader] || 0) - myC >= 5 && (counts[leader] || 0) >= 8));
    var victim = contain ? leader : pickVictim(state);
    own.forEach(function (u) {
      if (!isFree(u.at)) return;
      var legals = state.legalOrders[u.at] || [];
      for (var i = 0; i < legals.length; i++) {
        var o = legals[i];
        if (o.type !== 'move' || scValue(state, o.dest) <= 0) continue;
        var occ = unitAt(state, o.dest);
        if (occ && occ.power === state.you) continue;
        if (contain && occ && occ.power !== state.you && occ.power !== leader) continue;
        var s;
        if (!occ) {
          s = scValue(state, o.dest) + (state.season === 'Autumn' ? 60 : 35) +
            (enemiesAbleToEnter(o.dest).length > 0 ? 10 : 0);
          if (state.owners[o.dest] === victim) s += 30;
        } else {
          var es = 0;
          for (var e = 0; e < state.units.length; e++) {
            var foe = state.units[e];
            if (foe.power === state.you || foe.power === occ.power || foe.at === o.dest) continue;
            if (canMoveAs(state.map, foe.type, foe.at, occ.at)) { es = 1; break; }
          }
          if (es > 1) continue;
          s = 100 + 25 - es * 15;
          if (occ.power === victim) s += 30;
          var foeUnits = state.units.filter(function (x) { return x.power === occ.power; }).length;
          if (foeUnits <= 2) s += 50;
          var rb = bounces[o.dest];
          if (rb && rb.ago <= 2) s -= 10 * rb.count; // stale front: deprioritise
        }
        cands.push({ unit: u.at, type: u.type, dest: o.dest, score: s });
      }
    });
    cands.sort(function (a, b) {
      return b.score - a.score || (a.unit < b.unit ? -1 : a.unit > b.unit ? 1 : 0) ||
        (a.dest < b.dest ? -1 : 1);
    });

    cands.forEach(function (c) {
      if (!isFree(c.unit) || claimed[c.dest]) return;
      var occ = unitAt(state, c.dest);
      if (occ && occ.power === state.you) return;
      var enemySupport = 0;
      if (occ && occ.power !== state.you) {
        for (var i = 0; i < state.units.length; i++) {
          var e = state.units[i];
          if (e.power === state.you || e.power === occ.power || e.at === c.dest) continue;
          if (canMoveAs(state.map, e.type, e.at, occ.at)) { enemySupport = 1; break; }
        }
      }
      var contested = !occ && enemiesAbleToEnter(c.dest).length > 0;
      var rb2 = bounces[c.dest];
      var stale = rb2 && rb2.ago <= 2 ? Math.min(rb2.count, 2) : 0;
      // Spring defenders are almost never supported (everyone is moving), so a
      // single support usually suffices; Autumn holders dig in, so mass up.
      var base = occ ? (state.season === 'Spring' ? 1 : 1 + enemySupport) : 0;
      var need = occ ? base + stale : (contested ? 1 + stale : 0);
      if (need > 3) return;
      var helpers = [];
      var helperAt = function (at) {
        if (at === c.unit || at === c.dest || !isFree(at)) return false;
        var so = supportOptionsFor(state, at, c.unit, c.dest);
        if (so) helpers.push(at);
        return !!so;
      };
      for (var j = 0; j < own.length && helpers.length < need; j++) helperAt(own[j].at);
      if (occ && helpers.length < need && enemySupport > 0) {
        // Try to cut the third-party support: attack the supporter's province
        // with a spare unit (even a bounce cuts). Then re-check the numbers.
        var cut = false;
        outer:
        for (var x = 0; x < state.units.length; x++) {
          var sx = state.units[x];
          if (sx.power === state.you || sx.power === occ.power || sx.at === c.dest) continue;
          if (!canMoveAs(state.map, sx.type, sx.at, occ.at)) continue;
          for (var y = 0; y < own.length; y++) {
            var cu = own[y].at;
            if (cu === c.unit || !isFree(cu)) continue;
            var legals = state.legalOrders[cu] || [];
            for (var z = 0; z < legals.length; z++) {
              if (legals[z].type === 'move' && legals[z].dest === sx.at && !claimed[sx.at]) {
                plan[cu] = { unit: cu, type: 'move', dest: sx.at };
                take(cu);
                claimed[sx.at] = true;
                cut = true;
                break outer;
              }
            }
          }
        }
        if (cut) {
          enemySupport = 0;
          need = 1 + stale;
          for (var w = 0; w < own.length && helpers.length < need; w++) helperAt(own[w].at);
        }
      }
      if (occ && helpers.length < need && (enemySupport > 0 || helpers.length < 1)) return;
      plan[c.unit] = { unit: c.unit, type: 'move', dest: c.dest };
      take(c.unit);
      claimed[c.dest] = true;
      helpers.forEach(function (h) {
        plan[h] = { unit: h, type: 'support', target: c.unit, targetDest: c.dest };
        take(h);
      });
    });

    // 3. Honour accepted support promises with leftover units, then prop up
    // Autumn holders of threatened owned SCs with support-hold.
    var promised = (state.accepted || []).filter(function (p) {
      return p.power === state.you && p.type === 'support';
    });
    promised.forEach(function (p) {
      for (var i = 0; i < own.length; i++) {
        var at = own[i].at;
        if (!isFree(at) || at === p.terms.unit) continue;
        var so = supportOptionsFor(state, at, p.terms.unit, p.terms.dest);
        if (so) {
          var beneficiary = unitAt(state, p.terms.unit);
          if (beneficiary && beneficiary.power === p.partner) {
            plan[at] = { unit: at, type: 'support', target: so.target, targetDest: so.targetDest };
            take(at);
            break;
          }
        }
      }
    });

    if (state.season === 'Autumn') {
      var held = [];
      own.forEach(function (u) {
        if (!isFree(u.at) && plan[u.at].type === 'hold' &&
          state.owners[u.at] === state.you && enemiesAbleToEnter(u.at).length > 0) held.push(u.at);
      });
      held.sort().forEach(function (h) {
        for (var i = 0; i < own.length; i++) {
          var at = own[i].at;
          if (!isFree(at)) continue;
          var so = supportOptionsFor(state, at, h, 'hold');
          if (so) {
            plan[at] = { unit: at, type: 'support', target: h, targetDest: 'hold' };
            take(at);
          }
        }
      });
    }

    // 4. Leftovers: support a neighbouring committed action, else step toward nearest prize.
    own.forEach(function (u) {
      if (!isFree(u.at)) return;
      var legals = state.legalOrders[u.at] || [];
      var best = null;
      for (var i = 0; i < legals.length; i++) {
        var o = legals[i];
        if (o.type !== 'support') continue;
        var tgt = plan[o.target];
        if (!tgt) continue;
        if (tgt.type === 'move' && tgt.dest === o.targetDest) {
          best = o; break;
        }
      }
      if (best) {
        plan[u.at] = { unit: u.at, type: 'support', target: best.target, targetDest: best.targetDest };
        take(u.at);
        return;
      }
      // step toward nearest capturable SC: only empty, unclaimed dests that
      // strictly approach a prize (or are one). Never shuffle onto own SCs.
      var goal = function (p) {
        return scValue(state, p) > 0 && (!unitAt(state, p) || unitAt(state, p).power !== state.you);
      };
      var curD = bfsDist(state.map, u.type, u.at, goal);
      var steps = [];
      for (var k = 0; k < legals.length; k++) {
        var m = legals[k];
        if (m.type !== 'move' || claimed[m.dest]) continue;
        if (state.owners[m.dest] === state.you) continue;
        var occ = unitAt(state, m.dest);
        if (occ) continue; // unsupported leftover should not attack
        var d = bfsDist(state.map, u.type, m.dest, goal);
        if (d < curD || (scValue(state, m.dest) > 60 && d <= curD)) {
          steps.push({ dest: m.dest, d: d });
        }
      }
      steps.sort(function (a, b) { return a.d - b.d || (a.dest < b.dest ? -1 : 1); });
      if (steps.length && steps[0].d < 90) {
        plan[u.at] = { unit: u.at, type: 'move', dest: steps[0].dest };
        take(u.at);
        claimed[steps[0].dest] = true;
      }
    });

    return own.map(function (u) { return plan[u.at]; });
  }

  function retreats(state) {
    var used = {};
    var out = {};
    var list = state.retreats.slice().sort(function (a, b) { return a.at < b.at ? -1 : 1; });
    list.forEach(function (r) {
      var scored = r.options.map(function (opt) {
        var s = 0;
        if (Object.hasOwnProperty.call(state.owners, opt)) {
          if (state.owners[opt] === state.you) s += 20;
          else if (state.owners[opt] === null || state.owners[opt] === undefined) s += 60;
          else s += 40;
        }
        for (var i = 0; i < state.units.length; i++) {
          var u = state.units[i];
          if (!(state.map.adjacency[opt] || []).includes(u.at) && u.at !== opt) continue;
          if (u.power === state.you) s += 6;
          else s -= 8;
        }
        if (used[opt]) s -= 1000;
        return { opt: opt, s: s };
      });
      scored.sort(function (a, b) { return b.s - a.s || (a.opt < b.opt ? -1 : 1); });
      var pick = scored.length ? scored[0].opt : null;
      if (pick && !used[pick]) { out[r.at] = pick; used[pick] = true; }
      else out[r.at] = null;
    });
    return out;
  }

  function builds(state) {
    var own = ownUnits(state);
    var delta = (state.centresByPower[state.you] || 0) - own.length;
    if (delta === 0) return [];
    if (delta < 0) {
      var scored = own.map(function (u) {
        var s = 0;
        if (state.owners[u.at] === state.you) s += 50;
        else if (Object.hasOwnProperty.call(state.owners, u.at)) s += 20;
        var adjOwn = 0;
        for (var i = 0; i < own.length; i++) {
          if (own[i].at !== u.at && (state.map.adjacency[u.at] || []).indexOf(own[i].at) >= 0) adjOwn++;
        }
        s += adjOwn * 5;
        return { at: u.at, s: s };
      });
      scored.sort(function (a, b) { return a.s - b.s || (a.at < b.at ? -1 : 1); });
      return scored.slice(0, -delta).map(function (x) { return { disband: x.at }; });
    }
    var fleets = own.filter(function (u) { return u.type === 'fleet'; }).length;
    var spots = state.map.provinces.filter(function (p) {
      return p.home === state.you && state.owners[p.id] === state.you &&
        !unitAt(state, p.id);
    }).sort(function (a, b) { return a.id < b.id ? -1 : 1; });
    var res = [];
    var wantFleet = fleets * 3 < own.length + delta;
    for (var i = 0; i < spots.length && res.length < delta; i++) {
      var type = (spots[i].coastal && wantFleet) ? 'fleet' : 'army';
      if (type === 'fleet') wantFleet = false;
      res.push({ type: type, at: spots[i].id });
    }
    return res;
  }

  function propose(state) {
    var out = [];
    var live = living(state);
    if (!live.length) return [];
    var counts = state.centresByPower;
    var leader = live.slice().sort(function (a, b) {
      return (counts[b] - counts[a]) || (a < b ? -1 : 1);
    })[0];
    var allies = live.filter(function (p) { return p !== leader; }).sort(function (a, b) {
      return (counts[b] - counts[a]) || (a < b ? -1 : 1);
    });
    // neighbours: powers owning or occupying provinces adjacent to us
    var adjPowers = {};
    ownUnits(state).forEach(function (u) {
      (state.map.adjacency[u.at] || []).forEach(function (at) {
        var occ = unitAt(state, at);
        if (occ && occ.power !== state.you) adjPowers[occ.power] = true;
        var ow = Object.hasOwnProperty.call(state.owners, at) ? state.owners[at] : undefined;
        if (ow && ow !== state.you && ow !== null) adjPowers[ow] = true;
      });
    });
    if (leader && allies.length && counts[leader] >= counts[state.you]) {
      out.push({ to: allies[0], type: 'alliance', terms: { target: leader } });
    }
    Object.keys(adjPowers).sort().forEach(function (p) {
      if (out.length >= 6 || p === state.you || live.indexOf(p) < 0) return;
      if (out.some(function (o) { return o.to === p; })) return;
      out.push({ to: p, type: 'peace', terms: {} });
    });
    return out.slice(0, 6);
  }

  function answer(state) {
    var out = {};
    (state.inbox || []).forEach(function (p) { out[p.id] = 'accept'; });
    return out;
  }

  module.exports = {
    name: 'Anatolian Grinder',
    propose: propose,
    answer: answer,
    orders: orders,
    retreats: retreats,
    builds: builds
  };
})();
