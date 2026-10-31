(function () {
  'use strict';

  function ownUnits(state) {
    return state.units.filter(function (u) { return u.power === state.you; });
  }

  function living(state) {
    return Object.keys(state.centresByPower).filter(function (p) {
      return p !== state.you &&
        (state.centresByPower[p] > 0 || state.units.some(function (u) { return u.power === p; }));
    });
  }

  function isSC(state, id) {
    return Object.hasOwn(state.owners, id);
  }

  function myPromises(state) {
    return state.accepted.filter(function (pr) { return pr.power === state.you; });
  }

  function peacePartners(state) {
    var s = {};
    myPromises(state).forEach(function (pr) {
      if (pr.type === 'peace' || pr.type === 'alliance') s[pr.partner] = true;
    });
    return s;
  }

  function dmzSet(state) {
    var s = {};
    myPromises(state).forEach(function (pr) {
      if (pr.type === 'dmz') s[pr.terms.province] = true;
    });
    return s;
  }

  // Powers that betrayed us (broken promise where we were the partner), from
  // public trust records plus this season's accepted context.
  function grudges(state) {
    var g = {};
    Object.keys(state.trust).forEach(function (p) {
      if (p === state.you) return;
      var t = state.trust[p];
      (t.brokenPromises || []).forEach(function (o) {
        if (o.partner === state.you) g[p] = true;
      });
      // Serial betrayers are treated as hostile too.
      if (t.broken > t.kept + 2 && t.broken >= 3) g[p] = true;
    });
    // Recent history: anyone whose orders attacked our units' provinces.
    var mine = {};
    ownUnits(state).forEach(function (u) { mine[u.at] = true; });
    (state.history || []).forEach(function (h) {
      Object.keys(h.orders || {}).forEach(function (p) {
        if (p === state.you) return;
        (h.orders[p] || []).forEach(function (o) {
          if (o.type === 'move' && mine[o.dest]) g[p] = true;
          if (o.type === 'support' && o.targetDest !== 'hold' && mine[o.targetDest]) g[p] = true;
        });
      });
    });
    return g;
  }

  // Pick the power we most want to take centres from.
  function pickTarget(state) {
    var live = living(state);
    if (!live.length) return null;
    var gr = grudges(state);
    var adj = {};
    ownUnits(state).forEach(function (u) {
      (state.map.adjacency[u.at] || []).forEach(function (n) {
        var occ = null;
        for (var i = 0; i < state.units.length; i++) {
          if (state.units[i].at === n) { occ = state.units[i]; break; }
        }
        var owner = isSC(state, n) ? state.owners[n] : null;
        [occ ? occ.power : null, owner].forEach(function (p) {
          if (p && p !== state.you) adj[p] = (adj[p] || 0) + 1;
        });
      });
    });
    var best = null, bestScore = -1e9;
    live.forEach(function (p) {
      var s = (adj[p] || 0) * 4 + (state.centresByPower[p] || 0) * 0.6 + (gr[p] ? 6 : 0);
      if (s > bestScore || (s === bestScore && best !== null && p < best)) {
        bestScore = s; best = p;
      }
    });
    return best;
  }

  function canSupport(state, from, target, dest) {
    var legals = state.legalOrders[from] || [];
    for (var i = 0; i < legals.length; i++) {
      var o = legals[i];
      if (o.type === 'support' && o.target === target && o.targetDest === dest) return o;
    }
    return null;
  }

  function occupantAt(state, dest) {
    for (var i = 0; i < state.units.length; i++) {
      if (state.units[i].at === dest) return state.units[i];
    }
    return null;
  }

  // Enemies (non-peace) sitting next to a province: rough defence/support estimate.
  function adjEnemies(state, prov, peace, exclude) {
    var n = 0;
    (state.map.adjacency[prov] || []).forEach(function (a) {
      if (a === exclude) return;
      var o = occupantAt(state, a);
      if (o && o.power !== state.you && !peace[o.power]) n++;
    });
    return n;
  }

  function moveValue(state, unit, dest, occ, peace, gr) {
    var v = 0;
    var sc = isSC(state, dest);
    var owner = sc ? state.owners[dest] : null;
    if (sc && owner !== state.you) {
      v += 120;
      if (owner === null || owner === undefined) v += 25; // easy neutral
      else {
        v += (state.centresByPower[owner] || 0) * 3; // hit the leader
        if (gr[owner]) v += 30;
      }
      if (state.season === 'Autumn') v += 45; // immediate capture
    } else if (!sc) {
      // Staging value: positions that threaten several centres.
      var threat = 0;
      (state.map.adjacency[dest] || []).forEach(function (a) {
        if (isSC(state, a) && state.owners[a] !== state.you) threat++;
      });
      v += 8 + threat * 12;
      if (unit.type === 'fleet' && state.map.provinces) {
        for (var i = 0; i < state.map.provinces.length; i++) {
          var pr = state.map.provinces[i];
          if (pr.id === dest && pr.type === 'sea') { v += 6; break; }
        }
      }
    } else {
      v += 2; // own SC shuffle, almost never useful
    }
    if (occ && occ.power !== state.you) v -= 12; // occupied: risk of bounce
    // Autumn: leaving a centre you sit on forfeits its capture (Spring
    // occupation alone captures nothing, Autumn occupation captures).
    if (state.season === 'Autumn' && isSC(state, unit.at)) {
      if (state.owners[unit.at] !== state.you) v -= 160; // abandoning a capture
      else v -= 55; // risking an owned centre
    }
    // Shuffling onto our own centres is almost never useful.
    if (sc && owner === state.you) v -= 30;
    // Small nudge to keep fleets at sea/coast and armies inland.
    if (unit.type === 'army' && !sc) v -= 2;
    return v;
  }

  function buildPlan(state) {
    var own = ownUnits(state);
    var peace = peacePartners(state);
    var dmz = dmzSet(state);
    var gr = grudges(state);
    var plan = {};
    own.forEach(function (u) { plan[u.at] = { unit: u.at, type: 'hold' }; });
    var locked = {};   // at -> true when given a non-hold order
    var reserved = {}; // dest -> true

    function freeSupporter(target, dest, skipDest) {
      var best = null;
      for (var i = 0; i < own.length; i++) {
        var u = own[i];
        if (locked[u.at] || u.at === target || u.at === skipDest) continue;
        if (canSupport(state, u.at, target, dest)) {
          if (best === null || u.at < best.at) best = u;
        }
      }
      return best;
    }

    // 1. Honour our accepted support obligations first.
    myPromises(state).forEach(function (pr) {
      if (pr.type !== 'support') return;
      var s = freeSupporter(pr.terms.unit, pr.terms.dest, pr.terms.dest === 'hold' ? pr.terms.unit : pr.terms.dest);
      if (s) {
        plan[s.at] = { unit: s.at, type: 'support', target: pr.terms.unit, targetDest: pr.terms.dest };
        locked[s.at] = true;
      }
    });

    // 2. Candidate attacks, best first.
    var cands = [];
    own.forEach(function (u) {
      if (locked[u.at]) return;
      (state.legalOrders[u.at] || []).forEach(function (o) {
        if (o.type !== 'move') return;
        if (dmz[o.dest]) return;
        var occ = occupantAt(state, o.dest);
        if (occ && occ.power === state.you) return;
        if (occ && peace[occ.power]) return;
        cands.push({ unit: u, order: o, occ: occ, v: moveValue(state, u, o.dest, occ, peace, gr) });
      });
    });
    cands.sort(function (a, b) {
      return (b.v - a.v) || (a.order.unit < b.order.unit ? -1 : 1) ||
        (a.order.dest < b.order.dest ? -1 : a.order.dest > b.order.dest ? 1 : 0);
    });

    cands.forEach(function (c) {
      if (c.v <= 0) return;
      if (locked[c.unit.at] || reserved[c.order.dest]) return;
      if (plan[c.unit.at].type !== 'hold') return;
      var helpers = [];
      if (c.occ) {
        // Occupied: bring at least one support, two if freely available.
        for (var k = 0; k < 2; k++) {
          var s = freeSupporter(c.unit.at, c.order.dest, c.order.dest);
          if (!s) break;
          helpers.push(s);
          locked[s.at] = 'temp';
        }
        helpers.forEach(function (h) { delete locked[h.at]; });
        if (!helpers.length) {
          // Unsupported attack on a held centre: only worth it for high value.
          if (c.v < 150) return;
        }
      } else {
        // Empty province: add one support if rivals lurk nearby, to win standoffs.
        if (adjEnemies(state, c.order.dest, peace, c.unit.at) > 0) {
          var g = freeSupporter(c.unit.at, c.order.dest, c.order.dest);
          if (g) helpers.push(g);
        }
      }
      plan[c.unit.at] = c.order;
      locked[c.unit.at] = true;
      reserved[c.order.dest] = true;
      helpers.forEach(function (h) {
        plan[h.at] = { unit: h.at, type: 'support', target: c.unit.at, targetDest: c.order.dest };
        locked[h.at] = true;
      });
    });

    // 3. Defend what we hold: support-hold threatened units with free units.
    var threatened = [];
    own.forEach(function (u) {
      if (locked[u.at]) return;
      var n = adjEnemies(state, u.at, peace, null);
      if (n > 0) {
        var w = (isSC(state, u.at) && state.owners[u.at] === state.you ? 100 : 10) + n * 10;
        threatened.push({ unit: u, n: n, w: w });
      }
    });
    threatened.sort(function (a, b) {
      return (b.w - a.w) || (a.unit.at < b.unit.at ? -1 : 1);
    });
    threatened.forEach(function (t) {
      var s = freeSupporter(t.unit.at, 'hold', t.unit.at);
      if (s) {
        plan[s.at] = { unit: s.at, type: 'support', target: t.unit.at, targetDest: 'hold' };
        locked[s.at] = true;
      }
    });

    return Object.keys(plan).map(function (k) { return plan[k]; });
  }

  function answerInbox(state) {
    var out = {};
    var target = pickTarget(state);
    var yearsLeft = state.limits.maxYears - state.year + (state.season === 'Spring' ? 1 : 0);
    var endgame = yearsLeft <= 1;
    state.inbox.forEach(function (p) {
      var t = state.trust[p.from] || { kept: 0, broken: 0 };
      var shady = t.broken > t.kept + 1 && t.broken >= 2;
      var ans = 'reject';
      if (p.type === 'support') {
        ans = 'accept'; // free help, no obligation on us
      } else if (p.type === 'request-support') {
        var feasible = ownUnits(state).some(function (u) {
          return canSupport(state, u.at, p.terms.unit, p.terms.dest) !== null;
        });
        if (feasible && p.from !== target && !shady) ans = 'accept';
      } else if (p.type === 'dmz') {
        var touches = ownUnits(state).some(function (u) {
          return (state.map.adjacency[u.at] || []).indexOf(p.terms.province) !== -1 ||
            u.at === p.terms.province;
        });
        if (!touches && !shady) ans = 'accept';
      } else { // peace, alliance
        if (p.from !== target && !shady) {
          if (endgame) {
            // Last season: only tie down powers far from our objectives.
            var near = ownUnits(state).some(function (u) {
              return (state.map.adjacency[u.at] || []).some(function (a) {
                var o = occupantAt(state, a);
                return (o && o.power === p.from) ||
                  (isSC(state, a) && state.owners[a] === p.from);
              });
            });
            ans = near ? 'reject' : 'accept';
          } else ans = 'accept';
        }
      }
      out[p.id] = ans;
    });
    return out;
  }

  function proposeDeals(state) {
    var target = pickTarget(state);
    var live = living(state).filter(function (p) { return p !== target; });
    // Prefer calming neighbours first (they can hurt us), then everyone else.
    var gr = grudges(state);
    live.sort(function (a, b) {
      var na = ownUnits(state).some(function (u) {
        return (state.map.adjacency[u.at] || []).some(function (x) {
          var o = occupantAt(state, x);
          return (o && o.power === a) || (isSC(state, x) && state.owners[x] === a);
        });
      }) ? 0 : 1;
      var nb = ownUnits(state).some(function (u) {
        return (state.map.adjacency[u.at] || []).some(function (x) {
          var o = occupantAt(state, x);
          return (o && o.power === b) || (isSC(state, x) && state.owners[x] === b);
        });
      }) ? 0 : 1;
      if (na !== nb) return na - nb;
      if ((gr[a] ? 1 : 0) !== (gr[b] ? 1 : 0)) return (gr[a] ? 1 : 0) - (gr[b] ? 1 : 0);
      return a < b ? -1 : 1;
    });
    return live.slice(0, state.limits.maxProposals || 6).map(function (to) {
      return { to: to, type: 'peace', terms: {} };
    });
  }

  function retreatChoices(state) {
    var out = {};
    state.retreats.forEach(function (u) {
      var best = null, bestScore = -1e9;
      (u.options || []).forEach(function (opt) {
        var s = 0;
        if (isSC(state, opt) && state.owners[opt] !== null &&
            state.owners[opt] !== undefined && state.owners[opt] !== state.you) s -= 30;
        else if (isSC(state, opt)) s += 50;
        var foes = 0;
        (state.map.adjacency[opt] || []).forEach(function (a) {
          var o = occupantAt(state, a);
          if (o && o.power !== state.you) foes++;
        });
        s -= foes * 8;
        if (best === null || s > bestScore || (s === bestScore && opt < best)) {
          bestScore = s; best = opt;
        }
      });
      out[u.at] = best || null;
    });
    return out;
  }

  function buildOrders(state) {
    var own = ownUnits(state);
    var delta = (state.centresByPower[state.you] || 0) - own.length;
    if (delta < 0) {
      // Disband least useful units: off-centre first, then far from homes.
      var scored = own.map(function (u) {
        var onMine = isSC(state, u.at) && state.owners[u.at] === state.you;
        var depth = 0;
        var seen = {};
        var q = [u.at];
        seen[u.at] = true;
        var found = -1;
        var homes = state.map.provinces.filter(function (p) { return p.home === state.you; })
          .map(function (p) { return p.id; });
        var homeSet = {};
        homes.forEach(function (h) { homeSet[h] = true; });
        var d = 0, qi = 0;
        var levels = [1];
        while (qi < q.length && found < 0) {
          var cur = q[qi++];
          if (homeSet[cur]) { found = d; break; }
          (state.map.adjacency[cur] || []).forEach(function (n) {
            if (!seen[n]) { seen[n] = true; q.push(n); }
          });
          levels[0]--;
          if (levels[0] === 0) { d++; levels[0] = q.length - qi; }
          if (d > 12) { found = 99; break; }
        }
        if (found < 0) found = 99;
        return { u: u, s: (onMine ? 0 : 100) - found };
      });
      scored.sort(function (a, b) {
        return (a.s - b.s) || (a.u.at < b.u.at ? -1 : 1);
      });
      return scored.slice(0, -delta).map(function (e) { return { disband: e.u.at }; });
    }
    if (delta === 0) return [];
    var fleets = own.filter(function (u) { return u.type === 'fleet'; }).length;
    var spots = state.map.provinces.filter(function (p) {
      return p.home === state.you && state.owners[p.id] === state.you &&
        !occupantAt(state, p.id);
    });
    // Build first where the neighbourhood is richest in open centres.
    spots.sort(function (a, b) {
      var ca = 0, cb = 0;
      (state.map.adjacency[a.id] || []).forEach(function (x) {
        if (isSC(state, x) && state.owners[x] !== state.you) ca++;
      });
      (state.map.adjacency[b.id] || []).forEach(function (x) {
        if (isSC(state, x) && state.owners[x] !== state.you) cb++;
      });
      return (cb - ca) || (a.id < b.id ? -1 : 1);
    });
    var out = [];
    spots.slice(0, delta).forEach(function (p) {
      var wantFleet = p.coastal && fleets < 2 && own.length >= 2;
      out.push(wantFleet ? { type: 'fleet', at: p.id } : { type: 'army', at: p.id });
      if (wantFleet) fleets++;
    });
    return out;
  }

  module.exports = {
    name: 'Anatolian Fox',
    propose: proposeDeals,
    answer: answerInbox,
    orders: function (state) {
      try { return buildPlan(state); }
      catch (e) {
        return ownUnits(state).map(function (u) { return { unit: u.at, type: 'hold' }; });
      }
    },
    retreats: retreatChoices,
    builds: function (state) {
      try { return buildOrders(state); }
      catch (e) { return []; }
    }
  };
})();
