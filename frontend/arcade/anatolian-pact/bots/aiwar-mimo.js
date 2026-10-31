(function () {
  'use strict';

  var HAS_ENGINE = typeof PactEngine !== 'undefined';

  var mem = { opinion: {}, processed: {} };

  var POWERS = ['Phrygia', 'Lydia', 'Caria', 'Bithynia', 'Galatia', 'Cilicia'];

  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function has(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function ownUnits(state) {
    return state.units.filter(function (u) { return u.power === state.you; });
  }

  function livingOthers(state) {
    return Object.keys(state.centresByPower).filter(function (p) {
      return p !== state.you && (state.centresByPower[p] > 0 ||
        state.units.some(function (u) { return u.power === p; }));
    });
  }

  var _provs = null, _provsKey = '';
  function provMapCache(state) {
    var key = state.map.provinces.length + ':' + state.map.adjacency[state.map.provinces[0].id].length;
    if (key !== _provsKey || !_provs) {
      _provs = {};
      state.map.provinces.forEach(function (p) { _provs[p.id] = p; });
      _provsKey = key;
    }
    return _provs;
  }

  function canMoveProv(state, unit, dest) {
    var provs = provMapCache(state);
    var to = provs[dest];
    var from = provs[unit.at];
    if (!to || !from || !state.map.adjacency[unit.at] ||
      state.map.adjacency[unit.at].indexOf(dest) < 0) return false;
    if (unit.type === 'army') return to.type === 'land';
    if (unit.type !== 'fleet' || (to.type === 'land' && !to.coastal)) return false;
    if (from.type === 'sea' || to.type === 'sea') return true;
    return state.map.adjacency[unit.at].some(function (id) {
      return provs[id].type === 'sea' && state.map.adjacency[dest].indexOf(id) >= 0;
    });
  }

  function bfs(state, sources, armyOnly) {
    var dist = {};
    var queue = [];
    sources.forEach(function (s) { dist[s] = 0; queue.push(s); });
    for (var i = 0; i < queue.length; i++) {
      var cur = queue[i];
      var adj = state.map.adjacency[cur] || [];
      for (var j = 0; j < adj.length; j++) {
        var nxt = adj[j];
        if (dist[nxt] !== undefined) continue;
        if (armyOnly && provMapCache(state)[nxt].type === 'sea') continue;
        dist[nxt] = dist[cur] + 1;
        queue.push(nxt);
      }
    }
    return dist;
  }

  function myHomes(state) {
    return state.map.provinces.filter(function (p) { return p.home === state.you; })
      .map(function (p) { return p.id; });
  }

  function neighboursOf(state, power) {
    var mine = state.units.filter(function (u) { return u.power === state.you; })
      .map(function (u) { return u.at; });
    myHomes(state).forEach(function (h) { mine.push(h); });
    var set = {};
    state.units.forEach(function (u) { if (u.power === power) set[u.at] = 1; });
    Object.keys(state.owners).forEach(function (sc) {
      if (state.owners[sc] === power) set[sc] = 1;
    });
    for (var i = 0; i < mine.length; i++) {
      var adj = state.map.adjacency[mine[i]] || [];
      for (var j = 0; j < adj.length; j++) if (set[adj[j]]) return true;
      if (set[mine[i]]) return true;
    }
    return false;
  }

  function partnersAtPeace(state) {
    var s = {};
    state.accepted.forEach(function (pr) {
      if ((pr.type === 'peace' || pr.type === 'alliance') &&
        (pr.power === state.you || pr.partner === state.you)) {
        s[pr.power === state.you ? pr.partner : pr.power] = true;
      }
    });
    return s;
  }

  function dmzSet(state) {
    var s = {};
    state.accepted.forEach(function (pr) {
      if (pr.type === 'dmz' && (pr.power === state.you || pr.partner === state.you)) {
        s[pr.terms.province] = true;
      }
    });
    return s;
  }

  function updateOpinions(state) {
    if (!mem.opinion[state.you]) {
      mem.opinion = {};
      POWERS.forEach(function (p) { mem.opinion[p] = 0; });
    }
    state.history.forEach(function (h) {
      var key = h.year + ':' + h.season;
      if (mem.processed[key]) return;
      mem.processed[key] = true;
      var myOrigins = {};
      (h.orders[state.you] || []).forEach(function (o) { myOrigins[o.unit] = true; });
      var myDislodged = {};
      (h.orders[state.you] || []).forEach(function (o) {
        if (o.outcome === 'dislodged') myDislodged[o.unit] = true;
      });
      Object.keys(h.orders).forEach(function (power) {
        if (power === state.you) return;
        var attacked = false, dislodgedMe = false;
        h.orders[power].forEach(function (o) {
          if (o.type === 'move') {
            if (myOrigins[o.dest]) {
              attacked = true;
              if (o.outcome === 'success' && myDislodged[o.dest]) dislodgedMe = true;
            }
          } else if (o.type === 'support' && o.targetDest && o.targetDest !== 'hold') {
            if (myOrigins[o.targetDest]) attacked = true;
          }
        });
        if (attacked) mem.opinion[power] = clamp(mem.opinion[power] - (dislodgedMe ? 30 : 12), -100, 60);
        else mem.opinion[power] = clamp(mem.opinion[power] + 2, -100, 60);
      });
      (h.promises || []).forEach(function (pr) {
        if (pr.power !== state.you && pr.partner === state.you) {
          if (pr.outcome === 'broken') mem.opinion[pr.power] = clamp(mem.opinion[pr.power] - 35, -100, 60);
          else mem.opinion[pr.power] = clamp(mem.opinion[pr.power] + 6, -100, 60);
        }
      });
    });
    Object.keys(state.trust).forEach(function (power) {
      if (power === state.you) return;
      (state.trust[power].brokenPromises || []).forEach(function (pr) {
        if (pr.partner === state.you) mem.opinion[power] = clamp(mem.opinion[power] - 10, -100, 60);
      });
    });
  }

  function endgameFlag(state) {
    return state.year >= Math.max(1, state.limits.maxYears - 1);
  }

  function betrayalOK(state, power) {
    if (endgameFlag(state)) return true;
    if ((mem.opinion[power] || 0) <= -40) return true;
    var c = state.centresByPower[power] || 0;
    var mine = state.centresByPower[state.you] || 0;
    if (c >= 11) return true;
    if (c >= 8 && c >= mine + 2) return true;
    if (mine >= 10) return true;
    return false;
  }

  function leaderPower(state) {
    var best = null;
    livingOthers(state).forEach(function (p) {
      if (!best || state.centresByPower[p] > state.centresByPower[best]) best = p;
    });
    return best;
  }

  function buildCtx(state) {
    var unitsByAt = {};
    state.units.forEach(function (u) { unitsByAt[u.at] = u; });
    var my = ownUnits(state);
    var homes = myHomes(state);
    var scs = state.map.provinces.filter(function (p) { return p.sc; }).map(function (p) { return p.id; });
    var distToAnySc = bfs(state, scs, true);
    var distToMyHomes = bfs(state, homes, true);
    var myFront = my.map(function (u) { return u.at; }).concat(homes);
    var distToMe = bfs(state, myFront, true);
    return {
      state: state, me: state.you, provs: provMapCache(state), unitsByAt: unitsByAt,
      my: my, homes: homes, scs: scs, leader: leaderPower(state),
      atPeace: partnersAtPeace(state), dmz: dmzSet(state),
      distToAnySc: distToAnySc, distToMyHomes: distToMyHomes, distToMe: distToMe,
      promises: state.accepted.filter(function (pr) {
        return pr.power === state.you && pr.type === 'support';
      }),
      opinion: (function () {
        var o = {};
        POWERS.forEach(function (p) { o[p] = mem.opinion[p] || 0; });
        return o;
      })(),
      autumn: state.season === 'Autumn', endgame: endgameFlag(state)
    };
  }

  function isSC(ctx, id) { return ctx.provs[id] && ctx.provs[id].sc; }

  function scStrategicValue(ctx, id) {
    var p = ctx.provs[id];
    if (!p || !p.sc) return 0;
    var owner = ctx.state.owners[id];
    var v = p.home ? 90 : 75;
    if (owner === ctx.me) v = 12;
    else if (p.home === ctx.me) v = 130;
    if (owner && owner !== ctx.me) {
      var c = ctx.state.centresByPower[owner] || 0;
      var mine = ctx.state.centresByPower[ctx.me] || 0;
      if (owner === ctx.leader) v += 35;
      else if (c > mine) v += 15;
      else if (c + 3 < mine) v -= 25;
    }
    var near = 0;
    ctx.state.units.forEach(function (u) {
      if (u.power === ctx.me) return;
      if ((ctx.state.map.adjacency[id] || []).indexOf(u.at) >= 0) near++;
    });
    v -= near * 10;
    return v;
  }

  function betrayalTargetBonus(ctx, power) {
    var c = ctx.state.centresByPower[power] || 0;
    var mine = ctx.state.centresByPower[ctx.me] || 0;
    var b = 0;
    if (c >= mine + 3) b += 40;
    if (ctx.opinion[power] <= -30) b += 30;
    if (c >= 10) b += 50;
    return b;
  }

  function moveScore(ctx, unit, dest) {
    var state = ctx.state;
    var p = ctx.provs[dest];
    if (!p) return -9999;
    if (ctx.dmz[dest]) return ctx.endgame ? -100 : -9999;
    var occ = ctx.unitsByAt[dest];
    if (occ && occ.power === ctx.me) {
      if (!occ || occ.at === unit.at) return -9999;
      return -9999;
    }
    var owner = state.owners[dest];
    var s = 0;
    var hostile = occ && occ.power !== ctx.me;
    if (hostile && ctx.atPeace[occ.power] && !betrayalOK(state, occ.power)) return -9999;
    if (hostile && ctx.atPeace[occ.power]) s += betrayalTargetBonus(ctx, occ.power);
    if (p.sc) {
      if (owner === ctx.me) {
        s += 18;
      } else {
        s += scStrategicValue(ctx, dest);
        if (ctx.autumn) s += 40;
        if (occ) s += 18;
        if (owner && owner !== ctx.me && !occ && ctx.atPeace[owner]) {
          s += betrayalOK(state, owner) ? 55 : (owner === ctx.leader ? 45 : 25);
        }
      }
    } else {
      if (p.home === ctx.me && !occ) s += 30;
      var d = ctx.distToAnySc[dest];
      if (d !== undefined) s -= d * 5;
      var dm = ctx.distToMyHomes[dest];
      if (dm !== undefined) s -= dm * 2;
    }
    if (unit.type === 'fleet' && p.type === 'land' && !p.sc) s -= 8;
    if (p.type === 'sea') {
      var useful = false;
      ctx.scs.forEach(function (sc) {
        if ((state.map.adjacency[dest] || []).indexOf(sc) >= 0 && state.owners[sc] !== ctx.me) useful = true;
      });
      s += useful ? 8 : -8;
    }
    return s;
  }

  function canSupport(state, supporterAt, targetAt, dest) {
    var legal = state.legalOrders[supporterAt];
    if (!legal) return false;
    return legal.some(function (o) {
      return o.type === 'support' && o.target === targetAt &&
        (dest === 'hold' ? o.targetDest === 'hold' : o.targetDest === dest);
    });
  }

  function promiseBreaks(state, plan) {
    var penalty = 0;
    state.accepted.forEach(function (pr) {
      if (pr.power !== state.you) return;
      var broken = false;
      if (pr.type === 'peace' || pr.type === 'alliance') {
        broken = plan.some(function (o) {
          var dest = o.type === 'move' ? o.dest :
            o.type === 'support' && o.targetDest !== 'hold' ? o.targetDest : null;
          return dest && state.units.some(function (u) {
            return u.at === dest && u.power === pr.partner;
          });
        });
      } else if (pr.type === 'dmz') {
        broken = plan.some(function (o) {
          return o.type === 'move' && o.dest === pr.terms.province;
        });
      } else if (pr.type === 'support') {
        broken = !plan.some(function (o) {
          return o.type === 'support' && o.target === pr.terms.unit &&
            o.targetDest === pr.terms.dest;
        });
      }
      if (broken) penalty += betrayalOK(state, pr.partner) ? 30 : 220;
    });
    return penalty;
  }

  function buildGreedyPlan(ctx) {
    var state = ctx.state;
    var plan = {};
    var reserved = {};
    var cands = [];
    ctx.my.forEach(function (u) {
      var legal = state.legalOrders[u.at] || [];
      legal.forEach(function (o) {
        if (o.type !== 'move') return;
        var s = moveScore(ctx, u, o.dest);
        if (s >= 8) cands.push({ unit: u, order: o, s: s });
      });
    });
    cands.sort(function (a, b) {
      return b.s - a.s || cmp(a.unit.at, b.unit.at) || cmp(a.order.dest, b.order.dest);
    });
    cands.forEach(function (c) {
      if (plan[c.unit.at] || reserved[c.order.dest]) return;
      var occ = ctx.unitsByAt[c.order.dest];
      if (occ && occ.power === ctx.me) return;
      var helper = null;
      if (occ) {
        helper = ctx.my.find(function (h) {
          return !plan[h.at] && h.at !== c.unit.at && canSupport(state, h.at, c.unit.at, c.order.dest);
        });
        if (!helper) return;
      }
      plan[c.unit.at] = { unit: c.unit.at, type: 'move', dest: c.order.dest };
      reserved[c.order.dest] = true;
      if (helper) {
        plan[helper.at] = {
          unit: helper.at, type: 'support', target: c.unit.at, targetDest: c.order.dest
        };
      }
    });
    ctx.promises.forEach(function (pr) {
      var busy = Object.keys(plan).some(function (at) {
        return plan[at].type === 'support' && plan[at].target === pr.terms.unit &&
          plan[at].targetDest === pr.terms.dest;
      });
      if (busy) return;
      var supporter = ctx.my.find(function (h) {
        return !plan[h.at] && canSupport(state, h.at, pr.terms.unit, pr.terms.dest);
      });
      if (supporter) {
        plan[supporter.at] = {
          unit: supporter.at, type: 'support', target: pr.terms.unit, targetDest: pr.terms.dest
        };
      }
    });
    ctx.my.forEach(function (u) {
      if (plan[u.at]) return;
      var best = null, bestVal = -1;
      (state.legalOrders[u.at] || []).forEach(function (o) {
        if (o.type !== 'support' || o.targetDest !== 'hold') return;
        var tgt = ctx.unitsByAt[o.target];
        if (!tgt || tgt.power !== ctx.me) return;
        if (plan[o.target] && plan[o.target].type === 'move') return;
        var danger = state.units.filter(function (e) {
          return e.power !== ctx.me && (state.map.adjacency[o.target] || []).indexOf(e.at) >= 0;
        }).length;
        var val = danger * 18 + (isSC(ctx, o.target) ? 25 : 0);
        if (val > bestVal) { bestVal = val; best = o; }
      });
      if (best && bestVal >= 18) {
        plan[u.at] = { unit: u.at, type: 'support', target: best.target, targetDest: 'hold' };
        return;
      }
      plan[u.at] = { unit: u.at, type: 'hold' };
    });
    return plan;
  }

  function planOrdersList(plan) {
    return Object.keys(plan).sort(cmp).map(function (at) { return plan[at]; });
  }

  function assumeEnemyOrders(state, mode, ctx) {
    var orders = [];
    var myEmptyHomes = ctx.homes.filter(function (h) { return !ctx.unitsByAt[h]; });
    var moves = {};
    var assigned = {};
    var enemies = state.units.filter(function (u) { return u.power !== state.you; });
    enemies.forEach(function (u) {
      if (mode === 'calm') {
        orders.push({ unit: u.at, type: 'hold' });
        assigned[u.at] = true;
        return;
      }
      var best = null, bestS = -1e9;
      (state.map.adjacency[u.at] || []).forEach(function (dest) {
        if (!canMoveProv(state, u, dest)) return;
        var occ = ctx.unitsByAt[dest];
        if (occ && occ.power === u.power) return;
        var s = 0;
        if (mode === 'hostile') {
          if (occ && occ.power === state.you) s = 100;
          else if (myEmptyHomes.indexOf(dest) >= 0) s = 75;
          else if (state.owners[dest] === state.you && !occ) s = 60;
          else {
            var d = ctx.distToMe[dest];
            s = d === undefined ? -20 : -d * 8;
            if (ctx.provs[dest].sc && state.owners[dest] !== u.power) s += 25;
          }
        } else {
          var owner = state.owners[dest];
          if (ctx.provs[dest].sc && owner !== u.power) {
            s = 60 + (owner && owner !== u.power ? 15 : 0);
            if (occ) s -= 25;
          } else {
            var dd = ctx.distToAnySc[dest];
            s = dd === undefined ? -15 : -dd * 5;
          }
        }
        if (occ && occ.power !== state.you) s -= 15;
        if (s > bestS) { bestS = s; best = dest; }
      });
      if (best !== null && bestS > -15) {
        moves[u.at] = best;
        assigned[u.at] = true;
        orders.push({ unit: u.at, type: 'move', dest: best });
      }
    });
    enemies.forEach(function (u) {
      if (assigned[u.at]) return;
      var helper = null, helperDest = null, hs = 0;
      Object.keys(moves).forEach(function (from) {
        var dest = moves[from];
        var target = ctx.unitsByAt[dest];
        if (!target || target.power !== state.you) return;
        if (!canSupport(state, u.at, from, dest)) return;
        var v = 20 + (isSC(ctx, dest) ? 10 : 0);
        if (v > hs) { hs = v; helper = from; helperDest = dest; }
      });
      if (helper) {
        orders.push({ unit: u.at, type: 'support', target: helper, targetDest: helperDest });
        assigned[u.at] = true;
        return;
      }
      orders.push({ unit: u.at, type: 'hold' });
    });
    return orders;
  }

  function applySimRetreats(state, result, ctx) {
    if (!HAS_ENGINE || !result.dislodged.length) {
      return { units: result.units };
    }
    var choices = {};
    result.dislodged.forEach(function (u) {
      if (u.power !== state.you) return;
      var opts = PactEngine.retreatOptions(u, result.units, result.standoffs);
      var best = opts.length ? opts[0] : null, bestS = -1e9;
      opts.forEach(function (o) {
        var s = 10;
        if (isSC(ctx, o)) s += state.owners[o] === state.you ? 20 : 85;
        if (ctx.homes.indexOf(o) >= 0) s += 50;
        var d = ctx.distToAnySc[o];
        if (d !== undefined) s -= d * 4;
        var enemyAdj = state.units.filter(function (u2) {
          return u2.power !== u.power && (state.map.adjacency[o] || []).indexOf(u2.at) >= 0;
        }).length;
        s -= enemyAdj * 12;
        if (s > bestS) { bestS = s; best = o; }
      });
      choices[u.power] = choices[u.power] || {};
      choices[u.power][u.at] = best;
    });
    var out = PactEngine.resolveRetreats(result.units, result.dislodged, result.standoffs, choices);
    return { units: out.units };
  }

  function scorePosition(state, unitsAfter, myDislodged, ctx) {
    var me = state.you;
    var mine = unitsAfter.filter(function (u) { return u.power === me; });
    var others = unitsAfter.filter(function (u) { return u.power !== me; });
    var score = mine.length * 130 - myDislodged * 70;
    var proj = {};
    Object.keys(state.owners).forEach(function (k) { proj[k] = state.owners[k]; });
    unitsAfter.forEach(function (u) { if (has(proj, u.at)) proj[u.at] = u.power; });
    var myNow = state.centresByPower[me];
    var myAfter = 0;
    Object.keys(proj).forEach(function (k) { if (proj[k] === me) myAfter++; });
    if (ctx.autumn) score += (myAfter - myNow) * 210;
    mine.forEach(function (u) {
      if (isSC(ctx, u.at) && proj[u.at] !== me) score += ctx.autumn ? 60 : 95;
    });
    ctx.homes.forEach(function (h) {
      if (state.owners[h] !== me) return;
      var occupier = others.find(function (e) { return e.at === h; });
      if (occupier) { score -= 220; return; }
      var hasMe = mine.some(function (u) { return u.at === h; });
      if (hasMe) { score += 15; return; }
      var adjacentEnemy = others.some(function (e) {
        return (state.map.adjacency[h] || []).indexOf(e.at) >= 0;
      });
      score -= adjacentEnemy ? 55 : 12;
    });
    mine.forEach(function (u) {
      var adjE = others.filter(function (e) {
        return (state.map.adjacency[u.at] || []).indexOf(e.at) >= 0;
      }).length;
      score -= adjE * 10;
    });
    return score;
  }

  function evalPlan(state, plan, ctx, enemyByMode) {
    var myOrders = planOrdersList(plan);
    var all = myOrders.concat(enemyByMode);
    var result = PactEngine.adjudicate(state.units, all);
    var myDislodged = result.dislodged.filter(function (u) { return u.power === state.you; }).length;
    var after = applySimRetreats(state, result, ctx);
    var s = scorePosition(state, after.units, myDislodged, ctx);
    s -= promiseBreaks(state, myOrders);
    return s;
  }

  function evalAll(state, plan, ctx, enemyCache) {
    var host = evalPlan(state, plan, ctx, enemyCache.hostile);
    var greedy = evalPlan(state, plan, ctx, enemyCache.greedy);
    return host * 0.5 + greedy * 0.5;
  }

  function planValid(state, plan, ctx) {
    var seen = {};
    var dests = {};
    for (var i = 0; i < plan.length; i++) {
      var o = plan[i];
      if (seen[o.unit]) return false;
      seen[o.unit] = true;
      if (o.type === 'move') {
        if (dests[o.dest]) return false;
        dests[o.dest] = true;
      }
    }
    return true;
  }

  function repairPlan(plan) {
    var byAt = {};
    plan.forEach(function (o) { byAt[o.unit] = o; });
    return plan.map(function (o) {
      if (o.type !== 'support') return o;
      var t = byAt[o.target];
      if (o.targetDest === 'hold') {
        if (!t || t.type === 'move') return { unit: o.unit, type: 'hold' };
        return o;
      }
      if (!t || t.type !== 'move' || t.dest !== o.targetDest) {
        return { unit: o.unit, type: 'hold' };
      }
      return o;
    });
  }

  function hillClimb(state, plan, ctx, enemyCache) {
    var best = plan;
    var bestScore = evalAll(state, best, ctx, enemyCache);
    for (var pass = 0; pass < 2; pass++) {
      var improved = false;
      for (var i = 0; i < ctx.my.length; i++) {
        var u = ctx.my[i];
        var legal = state.legalOrders[u.at] || [];
        var scored = [];
        for (var j = 0; j < legal.length; j++) {
          var o = legal[j];
          if (o.type === 'move') {
            var ms = moveScore(ctx, u, o.dest);
            var occ = ctx.unitsByAt[o.dest];
            if (occ && occ.power === ctx.me) {
              var planned = null;
              for (var b = 0; b < best.length; b++) if (best[b].unit === occ.at) planned = best[b];
              if (!planned || planned.type !== 'move') continue;
              ms -= 20;
            }
            if (ms < 8) continue;
            scored.push({ o: o, s: ms });
          } else if (o.type === 'hold') {
            scored.push({ o: o, s: 5 });
          } else if (o.type === 'support' && ctx.unitsByAt[o.target] &&
            ctx.unitsByAt[o.target].power === ctx.me) {
            if (o.targetDest === 'hold') {
              var danger = state.units.filter(function (e) {
                return e.power !== ctx.me && (state.map.adjacency[o.target] || []).indexOf(e.at) >= 0;
              }).length;
              scored.push({ o: o, s: danger * 15 + (isSC(ctx, o.target) ? 20 : 0) });
            } else if (isSC(ctx, o.targetDest) || ctx.provs[o.targetDest].home === ctx.me) {
              scored.push({ o: o, s: 25 });
            }
          }
        }
        scored.sort(function (a, b) { return b.s - a.s || cmp(a.o.unit, b.o.unit); });
        if (scored.length > 8) scored = scored.slice(0, 8);
        for (var k = 0; k < scored.length; k++) {
          var cand = [];
          for (var m = 0; m < best.length; m++) {
            cand.push(best[m].unit === u.at ? scored[k].o : best[m]);
          }
          cand = repairPlan(cand);
          if (!planValid(state, cand, ctx)) continue;
          var sc = evalAll(state, cand, ctx, enemyCache);
          if (sc > bestScore + 0.5) {
            bestScore = sc;
            best = cand;
            improved = true;
          }
        }
      }
      if (!improved) break;
    }
    return best;
  }

  function chooseOrders(state) {
    updateOpinions(state);
    var ctx = buildCtx(state);
    if (!HAS_ENGINE) return planOrdersList(buildGreedyPlan(ctx));
    var enemyCache = {
      hostile: assumeEnemyOrders(state, 'hostile', ctx),
      greedy: assumeEnemyOrders(state, 'greedy', ctx)
    };
    var base = buildGreedyPlan(ctx);
    var list = planOrdersList(base);
    list = hillClimb(state, list, ctx, enemyCache);
    list = repairPlan(list);
    return list;
  }

  function victimsFromPlan(state, plan) {
    var v = {};
    plan.forEach(function (o) {
      var dest = o.type === 'move' ? o.dest :
        o.type === 'support' && o.targetDest !== 'hold' ? o.targetDest : null;
      if (!dest) return;
      state.units.forEach(function (u) {
        if (u.at === dest && u.power !== state.you) v[u.power] = true;
      });
    });
    return v;
  }

  function doPropose(state) {
    updateOpinions(state);
    var ctx = buildCtx(state);
    var plan = planOrdersList(buildGreedyPlan(ctx));
    var victims = victimsFromPlan(state, plan);
    var living = livingOthers(state);
    var neighbours = living.filter(function (p) { return neighboursOf(state, p); });
    var atPeace = ctx.atPeace;
    var opinion = {};
    living.forEach(function (p) { opinion[p] = mem.opinion[p] || 0; });
    var proposals = [];
    var peaceTargets = neighbours.filter(function (p) {
      return !victims[p] && !atPeace[p];
    }).sort(function (a, b) {
      return opinion[b] - opinion[a] ||
        state.centresByPower[a] - state.centresByPower[b] || cmp(a, b);
    });
    for (var i = 0; i < peaceTargets.length && proposals.length < 3; i++) {
      proposals.push({ to: peaceTargets[i], type: 'peace', terms: {} });
    }
    var leader = living.slice().sort(function (a, b) {
      return state.centresByPower[b] - state.centresByPower[a] || cmp(a, b);
    })[0];
    if (leader && state.centresByPower[leader] >= state.centresByPower[state.you] + 2 &&
      state.centresByPower[leader] >= 5) {
      var partner = neighbours.concat(living).filter(function (p) {
        return p !== leader && !victims[p] && (opinion[p] || 0) >= -20;
      }).sort(function (a, b) {
        return opinion[b] - opinion[a] || cmp(a, b);
      })[0];
      if (partner) proposals.push({ to: partner, type: 'alliance', terms: { target: leader } });
    }
    var keyAttack = plan.filter(function (o) {
      if (o.type !== 'move') return false;
      var occ = ctx.unitsByAt[o.dest];
      return occ && occ.power !== state.you && isSC(ctx, o.dest);
    })[0];
    if (keyAttack) {
      var helperP = living.filter(function (p) {
        return !victims[p] && p !== (ctx.unitsByAt[keyAttack.dest] || {}).power &&
          state.units.some(function (u) {
            return u.power === p && canSupport(state, u.at, keyAttack.unit, keyAttack.dest);
          }) && (opinion[p] || 0) >= -10;
      }).sort(function (a, b) { return opinion[b] - opinion[a] || cmp(a, b); })[0];
      if (helperP) {
        proposals.push({
          to: helperP, type: 'request-support',
          terms: { unit: keyAttack.unit, dest: keyAttack.dest }
        });
      }
    }
    var mostThreatened = ctx.homes.slice().sort(function (a, b) {
      var ta = state.units.filter(function (u) {
        return u.power !== state.you && (state.map.adjacency[a] || []).indexOf(u.at) >= 0;
      }).length;
      var tb = state.units.filter(function (u) {
        return u.power !== state.you && (state.map.adjacency[b] || []).indexOf(u.at) >= 0;
      }).length;
      return tb - ta || cmp(a, b);
    })[0];
    if (mostThreatened && proposals.length < 6) {
      var borderP = living.filter(function (p) {
        return !victims[p] && !atPeace[p] && state.units.some(function (u) {
          return u.power === p && (state.map.adjacency[mostThreatened] || []).indexOf(u.at) >= 0;
        });
      }).sort(function (a, b) { return opinion[b] - opinion[a] || cmp(a, b); })[0];
      if (borderP) proposals.push({ to: borderP, type: 'dmz', terms: { province: mostThreatened } });
    }
    var offerTo = living.filter(function (p) {
      return !victims[p] && (atPeace[p] || (opinion[p] || 0) >= 0);
    }).sort(function (a, b) { return opinion[b] - opinion[a] || cmp(a, b); })[0];
    if (offerTo && proposals.length < 6) {
      var theirUnits = state.units.filter(function (u) { return u.power === offerTo; });
      for (var t = 0; t < theirUnits.length && proposals.length < 6; t++) {
        var tu = theirUnits[t];
        var moves = (state.legalOrders[tu.at] || []).filter(function (o) {
          return o.type === 'move' && ctx.provs[o.dest] && ctx.provs[o.dest].sc &&
            state.owners[o.dest] !== offerTo && state.owners[o.dest] !== state.you;
        });
        for (var mi = 0; mi < moves.length; mi++) {
          var canHelp = ctx.my.some(function (h) {
            return canSupport(state, h.at, tu.at, moves[mi].dest);
          });
          if (canHelp) {
            proposals.push({
              to: offerTo, type: 'support',
              terms: { unit: tu.at, dest: moves[mi].dest }
            });
            break;
          }
        }
      }
    }
    return proposals.slice(0, 6);
  }

  function doAnswer(state) {
    updateOpinions(state);
    var ctx = buildCtx(state);
    var plan = planOrdersList(buildGreedyPlan(ctx));
    var victims = victimsFromPlan(state, plan);
    var out = {};
    state.inbox.forEach(function (pr) {
      var from = pr.from;
      var op = mem.opinion[from] || 0;
      var honest = op > -50 && state.trust[from].broken <= Math.max(2, state.trust[from].kept);
      var accept = false;
      if (pr.type === 'peace' || pr.type === 'alliance') {
        accept = honest && !victims[from];
        if (state.centresByPower[from] >= state.centresByPower[state.you] + 3) accept = honest;
        if (pr.type === 'alliance') {
          var target = pr.terms.target;
          var targetEnemy = (mem.opinion[target] || 0) <= -15 ||
            state.centresByPower[target] >= state.centresByPower[state.you] + 2;
          accept = accept && targetEnemy && target !== state.you;
        }
      } else if (pr.type === 'dmz') {
        var plannedInto = plan.some(function (o) {
          return o.type === 'move' && o.dest === pr.terms.province;
        });
        accept = honest && !plannedInto;
      } else if (pr.type === 'request-support') {
        var can = ctx.my.some(function (h) {
          return canSupport(state, h.at, pr.terms.unit, pr.terms.dest);
        });
        var hurtsMe = state.units.some(function (u) {
          return u.at === pr.terms.dest && u.power === state.you;
        }) || (ctx.provs[pr.terms.dest] && ctx.provs[pr.terms.dest].home === state.you &&
          state.owners[pr.terms.dest] === state.you);
        var busy = plan.some(function (o) {
          return o.type === 'move' && pr.terms.unit === o.unit;
        }) || plan.some(function (o) {
          return o.type === 'support' && o.targetDest !== 'hold' && o.target === pr.terms.unit;
        });
        accept = honest && can && !hurtsMe && !busy;
      } else if (pr.type === 'support') {
        accept = honest || op > -20;
      }
      out[pr.id] = accept ? 'accept' : 'reject';
    });
    return out;
  }

  function bestRetreat(state, unit, opts, ctx) {
    if (!opts.length) return null;
    var best = opts[0], bestS = -1e9;
    opts.forEach(function (o) {
      var s = 10;
      if (isSC(ctx, o)) s += state.owners[o] === state.you ? 20 : 85;
      if (ctx.homes.indexOf(o) >= 0) s += 55;
      var d = ctx.distToAnySc[o];
      if (d !== undefined) s -= d * 4;
      var enemyAdj = state.units.filter(function (u) {
        return u.power !== unit.power && (state.map.adjacency[o] || []).indexOf(u.at) >= 0;
      }).length;
      s -= enemyAdj * 12;
      if (s > bestS) { bestS = s; best = o; }
    });
    return best;
  }

  function doRetreats(state) {
    updateOpinions(state);
    var ctx = buildCtx(state);
    var out = {};
    state.retreats.forEach(function (u) {
      out[u.at] = bestRetreat(state, u, u.options || [], ctx);
    });
    return out;
  }

  function doBuilds(state) {
    updateOpinions(state);
    var me = state.you;
    var mine = ownUnits(state);
    var delta = state.centresByPower[me] - mine.length;
    if (delta === 0) return [];
    if (delta > 0) {
      var emptyHomes = state.map.provinces.filter(function (p) {
        return p.home === me && state.owners[p.id] === me &&
          !state.units.some(function (u) { return u.at === p.id; });
      });
      var ctx = buildCtx(state);
      emptyHomes.sort(function (a, b) {
        var threatA = state.units.filter(function (u) {
          return u.power !== me && (state.map.adjacency[a.id] || []).indexOf(u.at) >= 0;
        }).length;
        var threatB = state.units.filter(function (u) {
          return u.power !== me && (state.map.adjacency[b.id] || []).indexOf(u.at) >= 0;
        }).length;
        var dA = ctx.distToAnySc[a.id] === undefined ? 9 : ctx.distToAnySc[a.id];
        var dB = ctx.distToAnySc[b.id] === undefined ? 9 : ctx.distToAnySc[b.id];
        return threatA - threatB || dA - dB || cmp(a.id, b.id);
      });
      return emptyHomes.slice(0, delta).map(function (p) {
        return { type: 'army', at: p.id };
      });
    }
    var need = -delta;
    var ctx2 = buildCtx(state);
    var dists = bfs(state, myHomes(state), false);
    var scored = mine.map(function (u) {
      var onSc = isSC(ctx2, u.at) && state.owners[u.at] !== me ? 1 : 0;
      var d = dists[u.at] === undefined ? 99 : dists[u.at];
      var fleetPen = u.type === 'fleet' && !onSc ? 1 : 0;
      return { at: u.at, s: onSc * 100 - d * 10 - fleetPen, d: d };
    });
    scored.sort(function (a, b) { return a.s - b.s || b.d - a.d || cmp(a.at, b.at); });
    return scored.slice(0, need).map(function (x) { return { disband: x.at }; });
  }

  module.exports = {
    name: 'Anatolian Thunder',
    propose: function (state) {
      try { return doPropose(state); } catch (e) { return []; }
    },
    answer: function (state) {
      try { return doAnswer(state); } catch (e) {
        return Object.fromEntries(state.inbox.map(function (p) { return [p.id, 'reject']; }));
      }
    },
    orders: function (state) {
      try { return chooseOrders(state); } catch (e) {
        return ownUnits(state).map(function (u) { return { unit: u.at, type: 'hold' }; });
      }
    },
    retreats: function (state) {
      try { return doRetreats(state); } catch (e) {
        return Object.fromEntries(state.retreats.map(function (u) {
          return [u.at, (u.options && u.options[0]) || null];
        }));
      }
    },
    builds: function (state) {
      try { return doBuilds(state); } catch (e) { return []; }
    }
  };
})();
