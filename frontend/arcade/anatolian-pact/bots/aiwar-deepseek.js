(function () {
  'use strict';

  var NAME = 'Anatolian Fox';
  var EPS = 1e-7;
  var lastTentative = null;

  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  function canMoveType(ctx, type, from, dest) {
    var to = ctx.prov[dest], fromP = ctx.prov[from];
    if (!to || !fromP) return false;
    if (ctx.adj[from].indexOf(dest) < 0) return false;
    if (type === 'army') return to.type === 'land';
    if (type === 'fleet') {
      if (to.type === 'land' && !to.coastal) return false;
      if (fromP.type === 'sea' || to.type === 'sea') return true;
      var a = ctx.adj[from], b = ctx.adj[dest];
      for (var i = 0; i < a.length; i++) {
        if (ctx.prov[a[i]].type === 'sea' && b.indexOf(a[i]) >= 0) return true;
      }
      return false;
    }
    return true;
  }

  function bfsGraph(ctx, sources) {
    var dist = {}, q = [], i;
    for (i = 0; i < sources.length; i++) {
      if (dist[sources[i]] === undefined) { dist[sources[i]] = 0; q.push(sources[i]); }
    }
    for (i = 0; i < q.length; i++) {
      var at = q[i], d = dist[at], nbrs = ctx.adj[at] || [];
      for (var j = 0; j < nbrs.length; j++) {
        var n = nbrs[j];
        if (dist[n] === undefined) { dist[n] = d + 1; q.push(n); }
      }
    }
    return dist;
  }

  function bfsType(ctx, sources, type) {
    var dist = {}, q = [], i;
    for (i = 0; i < sources.length; i++) {
      if (dist[sources[i]] === undefined) { dist[sources[i]] = 0; q.push(sources[i]); }
    }
    for (i = 0; i < q.length; i++) {
      var at = q[i], d = dist[at], nbrs = ctx.adj[at] || [];
      for (var j = 0; j < nbrs.length; j++) {
        var n = nbrs[j];
        if (dist[n] !== undefined) continue;
        if (!canMoveType(ctx, type, at, n)) continue;
        dist[n] = d + 1; q.push(n);
      }
    }
    return dist;
  }

  function buildContext(state) {
    var prov = {}, i;
    for (i = 0; i < state.map.provinces.length; i++) prov[state.map.provinces[i].id] = state.map.provinces[i];
    var adj = state.map.adjacency;
    var scs = [], scSet = {};
    for (i = 0; i < state.map.provinces.length; i++) {
      if (state.map.provinces[i].sc) {
        scs.push(state.map.provinces[i].id);
        scSet[state.map.provinces[i].id] = true;
      }
    }
    var unitAt = {};
    for (i = 0; i < state.units.length; i++) unitAt[state.units[i].at] = state.units[i];
    var me = state.you;
    var ownAt = {}, own = [];
    for (i = 0; i < state.units.length; i++) {
      if (state.units[i].power === me) {
        own.push(state.units[i]);
        ownAt[state.units[i].at] = true;
      }
    }
    var living = [];
    for (var pw in state.centresByPower) {
      if (pw === me) continue;
      if (state.centresByPower[pw] > 0 || state.units.some(function (u) { return u.power === pw; })) living.push(pw);
    }
    var nonOwned = scs.filter(function (s) { return state.owners[s] !== me; });
    var ctx = {
      state: state, me: me, prov: prov, adj: adj, scs: scs, scSet: scSet,
      unitAt: unitAt, ownAt: ownAt, own: own, living: living
    };
    ctx.distSC = bfsGraph(ctx, nonOwned);
    return ctx;
  }

  function evaluateRes(ctx, res) {
    var state = ctx.state, me = ctx.me;
    var autumn = state.season === 'Autumn';
    var occ = {}, i;
    for (i = 0; i < res.units.length; i++) occ[res.units[i].at] = res.units[i].power;
    var score = 0;
    for (i = 0; i < ctx.scs.length; i++) {
      var s = ctx.scs[i], o = occ[s];
      if (o === me) {
        if (state.owners[s] === me) score += 80;
        else score += autumn ? 132 : 112;
      } else if (o) {
        score -= 85;
      } else {
        var ow = state.owners[s];
        if (ow === me) score += 78;
        else if (ow == null) score += 14;
      }
    }
    var mine = 0, theirs = 0;
    for (i = 0; i < res.units.length; i++) {
      var u = res.units[i];
      if (u.power === me) {
        mine++;
        var d = ctx.distSC[u.at];
        if (d !== undefined) score += Math.max(0, 7 - d) * 3;
      } else theirs++;
    }
    score += mine * 16 - theirs * 5;
    for (i = 0; i < res.dislodged.length; i++) {
      if (res.dislodged[i].power === me) score -= 48;
      else score += 20;
    }
    for (i = 0; i < ctx.scs.length; i++) {
      var sc = ctx.scs[i];
      if (state.owners[sc] !== me) continue;
      var threat = 0;
      for (var j = 0; j < res.units.length; j++) {
        var eu = res.units[j];
        if (eu.power !== me && ctx.adj[sc].indexOf(eu.at) >= 0) threat++;
      }
      score -= threat * (occ[sc] === me ? 4 : 8);
    }
    return score;
  }

  function unitValue(ctx, u) {
    var v = 0;
    if (ctx.scSet[u.at] && ctx.state.owners[u.at] === ctx.me) v += 100;
    var d = ctx.distSC[u.at];
    if (d !== undefined) v += Math.max(0, 8 - d) * 4;
    if (u.type === 'fleet') v -= 3;
    return v;
  }

  function enemyBase(ctx, power, mode) {
    var state = ctx.state, me = ctx.me;
    var units = state.units.filter(function (u) { return u.power === power; });
    var orders = {}, i, j;
    var targets;
    if (mode === 'aggressive') {
      targets = [];
      for (i = 0; i < state.units.length; i++) if (state.units[i].power === me) targets.push(state.units[i].at);
      for (i = 0; i < ctx.scs.length; i++) if (state.owners[ctx.scs[i]] === me) targets.push(ctx.scs[i]);
    } else {
      targets = ctx.scs.filter(function (s) { return state.owners[s] !== power; });
    }
    for (i = 0; i < units.length; i++) {
      var u = units[i];
      var dist = bfsType(ctx, targets, u.type);
      var curD = dist[u.at] !== undefined ? dist[u.at] : 99;
      var best = null, bestScore = 0;
      var nbrs = ctx.adj[u.at] || [];
      for (j = 0; j < nbrs.length; j++) {
        var dest = nbrs[j];
        if (!canMoveType(ctx, u.type, u.at, dest)) continue;
        var occ = ctx.unitAt[dest];
        var dd = dist[dest] !== undefined ? dist[dest] : 99;
        var sc = (curD - dd) * 6;
        if (ctx.scSet[dest] && state.owners[dest] !== power) sc += 120;
        if (occ && occ.power !== power) sc += (mode === 'aggressive' ? 70 : 22);
        if (occ && occ.power === power) sc -= 1000;
        if (sc > bestScore) { bestScore = sc; best = dest; }
      }
      orders[u.at] = best ? { unit: u.at, type: 'move', dest: best } : { unit: u.at, type: 'hold' };
    }
    return orders;
  }

  function canSupport(ctx, supporter, targetAt, dest) {
    var target = ctx.unitAt[targetAt];
    if (!target) return false;
    if (!canMoveType(ctx, supporter.type, supporter.at, dest)) return false;
    if (dest === targetAt) return true;
    return canMoveType(ctx, target.type, targetAt, dest);
  }

  function addEnemySupports(ctx, power, orders) {
    var state = ctx.state, i, j;
    var units = state.units.filter(function (u) { return u.power === power; });
    for (i = 0; i < units.length; i++) {
      var u = units[i], o = orders[u.at];
      if (!o || o.type !== 'move') continue;
      var dest = o.dest, occ = ctx.unitAt[dest];
      var valuable = ctx.scSet[dest] || (occ && occ.power !== power);
      if (!valuable) continue;
      for (j = 0; j < units.length; j++) {
        var v = units[j];
        if (v.at === u.at) continue;
        if (!orders[v.at] || orders[v.at].type !== 'hold') continue;
        if (canSupport(ctx, v, u.at, dest)) {
          orders[v.at] = { unit: v.at, type: 'support', target: u.at, targetDest: dest };
          break;
        }
      }
    }
    for (i = 0; i < units.length; i++) {
      var hu = units[i];
      if (!orders[hu.at] || orders[hu.at].type !== 'hold') continue;
      if (!ctx.scSet[hu.at] || state.owners[hu.at] !== power) continue;
      var threatened = false;
      for (j = 0; j < state.units.length; j++) {
        var e = state.units[j];
        if (e.power !== power && ctx.adj[hu.at].indexOf(e.at) >= 0) { threatened = true; break; }
      }
      if (!threatened) continue;
      for (j = 0; j < units.length; j++) {
        var sv = units[j];
        if (sv.at === hu.at) continue;
        if (!orders[sv.at] || orders[sv.at].type !== 'hold') continue;
        if (canSupport(ctx, sv, hu.at, hu.at)) {
          orders[sv.at] = { unit: sv.at, type: 'support', target: hu.at, targetDest: 'hold' };
          break;
        }
      }
    }
    return orders;
  }

  function buildEnemyModels(ctx) {
    var state = ctx.state;
    var enemies = state.units.filter(function (u) { return u.power !== ctx.me; });
    var powers = [];
    for (var i = 0; i < enemies.length; i++) if (powers.indexOf(enemies[i].power) < 0) powers.push(enemies[i].power);
    var neutralCount = ctx.scs.filter(function (s) { return state.owners[s] == null; }).length;
    var models = [];
    models.push({ weight: 0.12, orders: enemies.map(function (u) { return { unit: u.at, type: 'hold' }; }) });
    var modes = [
      { mode: 'expand', weight: neutralCount > 0 ? 0.50 : 0.25 },
      { mode: 'aggressive', weight: neutralCount > 0 ? 0.38 : 0.63 }
    ];
    for (var m = 0; m < modes.length; m++) {
      var arr = [];
      for (var p = 0; p < powers.length; p++) {
        var o = addEnemySupports(ctx, powers[p], enemyBase(ctx, powers[p], modes[m].mode));
        for (var at in o) arr.push(o[at]);
      }
      models.push({ weight: modes[m].weight, orders: arr });
    }
    var sum = 0;
    for (var k = 0; k < models.length; k++) sum += models[k].weight;
    for (k = 0; k < models.length; k++) models[k].weight /= sum;
    return models;
  }

  function makeEvaluator(ctx, models) {
    var state = ctx.state, own = ctx.own;
    return function (plan) {
      var base = [], i;
      for (i = 0; i < own.length; i++) {
        var o = plan[own[i].at];
        if (o) base.push(o);
      }
      var total = 0, wsum = 0;
      for (i = 0; i < models.length; i++) {
        var arr = base.concat(models[i].orders);
        var res = null;
        try { res = PactEngine.adjudicate(state.units, arr); } catch (e) { res = null; }
        if (!res) continue;
        total += models[i].weight * evaluateRes(ctx, res);
        wsum += models[i].weight;
      }
      return wsum ? total / wsum : -1e9;
    };
  }

  function promiseConstraints(ctx) {
    var state = ctx.state, me = ctx.me;
    var peaceUnits = {}, dmz = {}, supportPromises = [];
    for (var i = 0; i < state.accepted.length; i++) {
      var p = state.accepted[i];
      if (p.power !== me) continue;
      if (p.type === 'peace' || p.type === 'alliance') {
        for (var j = 0; j < state.units.length; j++) {
          if (state.units[j].power === p.partner) peaceUnits[state.units[j].at] = true;
        }
      } else if (p.type === 'dmz') {
        dmz[p.terms.province] = true;
      } else if (p.type === 'support') {
        supportPromises.push(p);
      }
    }
    return { peaceUnits: peaceUnits, dmz: dmz, supportPromises: supportPromises };
  }

  function lockSupports(ctx, supportPromises) {
    var locked = {}, used = {};
    for (var i = 0; i < supportPromises.length; i++) {
      var p = supportPromises[i];
      var target = p.terms.unit, dest = p.terms.dest;
      var cands = [];
      for (var j = 0; j < ctx.own.length; j++) {
        var v = ctx.own[j];
        if (used[v.at]) continue;
        var legal = ctx.state.legalOrders[v.at] || [];
        for (var k = 0; k < legal.length; k++) {
          var o = legal[k];
          if (o.type === 'support' && o.target === target && o.targetDest === dest) {
            cands.push({ v: v, order: { unit: v.at, type: 'support', target: target, targetDest: dest } });
            break;
          }
        }
      }
      cands.sort(function (a, b) { return unitValue(ctx, a.v) - unitValue(ctx, b.v) || cmp(a.v.at, b.v.at); });
      if (cands.length) {
        locked[cands[0].v.at] = cands[0].order;
        used[cands[0].v.at] = true;
      }
    }
    return locked;
  }

  function adjacentToEnemy(ctx, province) {
    var nbrs = ctx.adj[province] || [];
    for (var i = 0; i < nbrs.length; i++) {
      var u = ctx.unitAt[nbrs[i]];
      if (u && u.power !== ctx.me) return true;
    }
    return false;
  }

  function makeCandidates(ctx, constraints, locked) {
    var map = {}, ownAt = ctx.ownAt;
    for (var i = 0; i < ctx.own.length; i++) {
      var u = ctx.own[i];
      if (locked[u.at]) continue;
      var list = [];
      var legal = ctx.state.legalOrders[u.at] || [];
      for (var j = 0; j < legal.length; j++) {
        var o = legal[j];
        if (o.type === 'hold') {
          list.push({ unit: u.at, type: 'hold' });
        } else if (o.type === 'move') {
          if (constraints.dmz[o.dest]) continue;
          if (constraints.peaceUnits[o.dest]) continue;
          list.push({ unit: u.at, type: 'move', dest: o.dest });
        } else if (o.type === 'support') {
          if (!ownAt[o.target]) continue;
          if (o.targetDest !== 'hold' && constraints.peaceUnits[o.targetDest]) continue;
          var useful;
          if (o.targetDest === 'hold') {
            useful = ctx.scSet[o.target] || adjacentToEnemy(ctx, o.target);
          } else {
            useful = ctx.scSet[o.targetDest] ||
              (ctx.unitAt[o.targetDest] && ctx.unitAt[o.targetDest].power !== ctx.me);
          }
          if (!useful) continue;
          list.push({ unit: u.at, type: 'support', target: o.target, targetDest: o.targetDest });
        }
      }
      if (!list.length) list.push({ unit: u.at, type: 'hold' });
      map[u.at] = list;
    }
    return map;
  }

  function supportIndex(cands) {
    var idx = {};
    for (var at in cands) {
      for (var i = 0; i < cands[at].length; i++) {
        var o = cands[at][i];
        if (o.type !== 'support') continue;
        var key = o.target + '|' + o.targetDest;
        (idx[key] = idx[key] || []).push({ at: at, order: o });
      }
    }
    return idx;
  }

  function normalizePlan(plan, locked) {
    for (var at in plan) {
      if (locked[at]) continue;
      var o = plan[at];
      if (o.type !== 'support') continue;
      var t = plan[o.target];
      var match;
      if (!t) match = false;
      else if (o.targetDest === 'hold') match = t.type !== 'move';
      else match = t.type === 'move' && t.dest === o.targetDest;
      if (!match) plan[at] = { unit: at, type: 'hold' };
    }
    return plan;
  }

  function computePlan(state, usePromises) {
    var ctx = buildContext(state);
    var constraints = usePromises
      ? promiseConstraints(ctx)
      : { peaceUnits: {}, dmz: {}, supportPromises: [] };
    var locked = usePromises ? lockSupports(ctx, constraints.supportPromises) : {};
    var cands = makeCandidates(ctx, constraints, locked);
    var idx = supportIndex(cands);
    var models = buildEnemyModels(ctx);
    var evaluate = makeEvaluator(ctx, models);

    var plan = {}, i, at;
    for (i = 0; i < ctx.own.length; i++) {
      at = ctx.own[i].at;
      plan[at] = locked[at] || { unit: at, type: 'hold' };
    }
    var free = [];
    for (i = 0; i < ctx.own.length; i++) if (!locked[ctx.own[i].at]) free.push(ctx.own[i].at);

    var best = evaluate(plan);
    var maxPasses = free.length > 8 ? 4 : free.length > 6 ? 5 : free.length > 4 ? 7 : 9;

    for (var pass = 0; pass < maxPasses; pass++) {
      var bestPlan = null, bestScore = best + EPS;
      var f, j, k, s, o;
      for (f = 0; f < free.length; f++) {
        at = free[f];
        var list = cands[at];
        for (j = 0; j < list.length; j++) {
          o = list[j];
          var cur = plan[at];
          if (cur.type === o.type && cur.dest === o.dest &&
              cur.target === o.target && cur.targetDest === o.targetDest) continue;
          var np = {};
          for (k in plan) np[k] = plan[k];
          np[at] = o;
          s = evaluate(np);
          if (s > bestScore) { bestScore = s; bestPlan = np; }
        }
      }
      for (f = 0; f < free.length; f++) {
        at = free[f];
        var moves = cands[at];
        for (j = 0; j < moves.length; j++) {
          o = moves[j];
          if (o.type !== 'move') continue;
          var key = at + '|' + o.dest;
          var sup = idx[key] || [];
          var usable = [];
          for (k = 0; k < sup.length; k++) {
            var sp = sup[k];
            if (sp.at === at) continue;
            if (!plan[sp.at] || plan[sp.at].type !== 'hold') continue;
            usable.push(sp);
          }
          usable.sort(function (a, b) {
            return unitValue(ctx, ctx.unitAt[a.at]) - unitValue(ctx, ctx.unitAt[b.at]) || cmp(a.at, b.at);
          });
          var maxS = usable.length > 3 ? 3 : usable.length;
          for (var a = 0; a < maxS; a++) {
            var np1 = {};
            for (k in plan) np1[k] = plan[k];
            np1[at] = o;
            np1[usable[a].at] = usable[a].order;
            s = evaluate(np1);
            if (s > bestScore) { bestScore = s; bestPlan = np1; }
          }
          if (usable.length >= 2 &&
              (ctx.scSet[o.dest] || (ctx.unitAt[o.dest] && ctx.unitAt[o.dest].power !== ctx.me))) {
            for (a = 0; a < maxS; a++) {
              for (var b = a + 1; b < maxS; b++) {
                var np2 = {};
                for (k in plan) np2[k] = plan[k];
                np2[at] = o;
                np2[usable[a].at] = usable[a].order;
                np2[usable[b].at] = usable[b].order;
                s = evaluate(np2);
                if (s > bestScore) { bestScore = s; bestPlan = np2; }
              }
            }
          }
        }
      }
      if (!bestPlan) break;
      plan = bestPlan;
      normalizePlan(plan, locked);
      best = evaluate(plan);
    }
    normalizePlan(plan, locked);
    for (i = 0; i < ctx.own.length; i++) {
      at = ctx.own[i].at;
      if (!plan[at]) plan[at] = { unit: at, type: 'hold' };
    }
    return { plan: plan, ctx: ctx };
  }

  function signature(state) {
    return state.you + '|' + state.year + '|' + state.season + '|' +
      JSON.stringify(state.units) + '|' + JSON.stringify(state.owners);
  }

  function tentativePlan(state) {
    var key = signature(state);
    if (lastTentative && lastTentative.key === key) return lastTentative;
    var r = computePlan(state, false);
    lastTentative = { key: key, plan: r.plan, ctx: r.ctx };
    return lastTentative;
  }

  function planConflictsWithPower(ctx, plan, power) {
    var partners = {};
    for (var i = 0; i < ctx.state.units.length; i++) {
      if (ctx.state.units[i].power === power) partners[ctx.state.units[i].at] = true;
    }
    for (var at in plan) {
      var o = plan[at];
      if (o.type === 'move' && partners[o.dest]) return true;
      if (o.type === 'support' && o.targetDest !== 'hold' && partners[o.targetDest]) return true;
    }
    return false;
  }

  function planEnters(plan, province) {
    for (var at in plan) {
      var o = plan[at];
      if (o.type === 'move' && o.dest === province) return true;
    }
    return false;
  }

  function shouldAcceptRequest(state, ctx, plan, proposal, accepted, spare) {
    if (accepted >= spare || accepted >= 2) return false;
    if (proposal.terms.dest === 'hold') return false;
    var dest = proposal.terms.dest;
    var occ = ctx.unitAt[dest];
    if (occ && occ.power === state.you) return false;
    if (state.owners[dest] === state.you) return false;
    if (planConflictsWithPower(ctx, plan, proposal.from)) return false;
    for (var at in plan) {
      var o = plan[at];
      if (o.type === 'move' && o.dest === dest) return false;
    }
    for (var j = 0; j < ctx.own.length; j++) {
      var v = ctx.own[j];
      if (!plan[v.at] || plan[v.at].type !== 'hold') continue;
      var legal = state.legalOrders[v.at] || [];
      for (var k = 0; k < legal.length; k++) {
        var o2 = legal[k];
        if (o2.type === 'support' && o2.target === proposal.terms.unit && o2.targetDest === proposal.terms.dest) return true;
      }
    }
    return false;
  }

  function propose(state) {
    if (typeof PactEngine === 'undefined' || !PactEngine.adjudicate) return fallbackPropose(state);
    var tp = tentativePlan(state);
    var plan = tp.plan, ctx = tp.ctx;
    var victims = {};
    for (var at in plan) {
      var o = plan[at];
      if (o.type === 'move') {
        var occ = ctx.unitAt[o.dest];
        if (occ && occ.power !== state.you) victims[occ.power] = true;
      } else if (o.type === 'support' && o.targetDest !== 'hold') {
        var occ2 = ctx.unitAt[o.targetDest];
        if (occ2 && occ2.power !== state.you) victims[occ2.power] = true;
      }
    }
    var out = [];
    var others = ctx.living;
    for (var i = 0; i < others.length; i++) {
      if (!victims[others[i]]) out.push({ to: others[i], type: 'peace', terms: {} });
    }
    var bestMove = null, bestVal = -1;
    for (at in plan) {
      var mv = plan[at];
      if (mv.type !== 'move') continue;
      if (!ctx.scSet[mv.dest]) continue;
      if (state.owners[mv.dest] === state.you) continue;
      var val = state.owners[mv.dest] == null ? 2 : 3;
      if (val > bestVal) { bestVal = val; bestMove = { unit: at, dest: mv.dest }; }
    }
    if (bestMove && out.length < state.limits.maxProposals) {
      var cands = [];
      for (i = 0; i < others.length; i++) {
        var P = others[i];
        if (victims[P]) continue;
        var units = state.units.filter(function (u) { return u.power === P; });
        for (var j = 0; j < units.length; j++) {
          var u = units[j];
          if (u.at === bestMove.unit) continue;
          if (canMoveType(ctx, u.type, u.at, bestMove.dest)) { cands.push(P); break; }
        }
      }
      if (cands.length) {
        cands.sort(function (a, b) {
          var ta = state.trust[a], tb = state.trust[b];
          return ((tb ? tb.kept - tb.broken : 0) - (ta ? ta.kept - ta.broken : 0)) || cmp(a, b);
        });
        out.push({ to: cands[0], type: 'request-support', terms: { unit: bestMove.unit, dest: bestMove.dest } });
      }
    }
    return out.slice(0, state.limits.maxProposals);
  }

  function answer(state) {
    if (typeof PactEngine === 'undefined' || !PactEngine.adjudicate) return fallbackAnswer(state);
    var tp = tentativePlan(state);
    var plan = tp.plan, ctx = tp.ctx;
    var spare = 0;
    for (var at in plan) if (plan[at].type === 'hold') spare++;
    var acceptedReq = 0;
    var ans = {};
    for (var i = 0; i < state.inbox.length; i++) {
      var p = state.inbox[i];
      var accept = false;
      if (p.type === 'support') {
        accept = true;
      } else if (p.type === 'peace' || p.type === 'alliance') {
        accept = !planConflictsWithPower(ctx, plan, p.from);
      } else if (p.type === 'dmz') {
        accept = !planEnters(plan, p.terms.province);
      } else if (p.type === 'request-support') {
        accept = shouldAcceptRequest(state, ctx, plan, p, acceptedReq, spare);
        if (accept) acceptedReq++;
      }
      ans[p.id] = accept ? 'accept' : 'reject';
    }
    return ans;
  }

  function orders(state) {
    if (typeof PactEngine === 'undefined' || !PactEngine.adjudicate) return fallbackOrders(state);
    var hasPromises = false;
    for (var i = 0; i < state.accepted.length; i++) {
      if (state.accepted[i].power === state.you) { hasPromises = true; break; }
    }
    var plan, ctx;
    if (!hasPromises) {
      var tp = tentativePlan(state);
      plan = tp.plan; ctx = tp.ctx;
    } else {
      var r = computePlan(state, true);
      plan = r.plan; ctx = r.ctx;
    }
    var out = [];
    for (var j = 0; j < ctx.own.length; j++) {
      var at = ctx.own[j].at;
      var o = plan[at] || { unit: at, type: 'hold' };
      if (o.type === 'move') out.push({ unit: at, type: 'move', dest: o.dest });
      else if (o.type === 'support') out.push({ unit: at, type: 'support', target: o.target, targetDest: o.targetDest });
      else out.push({ unit: at, type: 'hold' });
    }
    return out;
  }

  function retreats(state) {
    var ctx = buildContext(state);
    var units = (state.retreats || []).slice().sort(function (a, b) {
      return (a.options ? a.options.length : 0) - (b.options ? b.options.length : 0) || cmp(a.at, b.at);
    });
    var used = {}, out = {};
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      var options = u.options || [];
      var best = null, bestScore = -Infinity;
      for (var j = 0; j < options.length; j++) {
        var opt = options[j];
        if (used[opt]) continue;
        var score = 0;
        if (ctx.scSet[opt]) {
          if (state.owners[opt] === state.you) score += 40;
          else score += state.season === 'Autumn' ? 120 : 70;
        }
        if (state.owners[opt] === state.you) score += 10;
        var d = ctx.distSC[opt];
        if (d !== undefined) score += Math.max(0, 6 - d) * 3;
        var enemies = 0;
        for (var k = 0; k < state.units.length; k++) {
          var eu = state.units[k];
          if (eu.power !== state.you && ctx.adj[opt].indexOf(eu.at) >= 0) enemies++;
        }
        score -= enemies * 9;
        if (score > bestScore) { bestScore = score; best = opt; }
      }
      if (best) { out[u.at] = best; used[best] = true; }
      else out[u.at] = null;
    }
    return out;
  }

  function builds(state) {
    var ctx = buildContext(state);
    var me = state.you;
    var own = ctx.own;
    var delta = state.centresByPower[me] - own.length;
    var i, out = [];
    if (delta > 0) {
      var spots = [];
      for (i = 0; i < state.map.provinces.length; i++) {
        var p = state.map.provinces[i];
        if (p.home !== me) continue;
        if (state.owners[p.id] !== me) continue;
        var occupied = false;
        for (var j = 0; j < state.units.length; j++) if (state.units[j].at === p.id) { occupied = true; break; }
        if (!occupied) spots.push(p.id);
      }
      spots.sort(function (a, b) {
        var da = ctx.distSC[a], db = ctx.distSC[b];
        if (da === undefined) da = 99;
        if (db === undefined) db = 99;
        return da - db || cmp(a, b);
      });
      var count = Math.min(delta, spots.length);
      for (i = 0; i < count; i++) out.push({ type: 'army', at: spots[i] });
      return out;
    }
    if (delta < 0) {
      var excess = -delta;
      var sorted = own.slice().sort(function (a, b) {
        return unitValue(ctx, a) - unitValue(ctx, b) || cmp(a.at, b.at);
      });
      var remove = Math.min(excess, sorted.length);
      for (i = 0; i < remove; i++) out.push({ disband: sorted[i].at });
      return out;
    }
    return [];
  }

  function fallbackPropose(state) {
    var out = [];
    for (var pw in state.centresByPower) {
      if (pw === state.you) continue;
      if (state.centresByPower[pw] > 0 || state.units.some(function (u) { return u.power === pw; })) {
        out.push({ to: pw, type: 'peace', terms: {} });
      }
    }
    return out.slice(0, 6);
  }

  function fallbackAnswer(state) {
    var ans = {};
    for (var i = 0; i < state.inbox.length; i++) {
      var p = state.inbox[i];
      ans[p.id] = (p.type === 'peace' || p.type === 'alliance' || p.type === 'support') ? 'accept' : 'reject';
    }
    return ans;
  }

  function fallbackOrders(state) {
    var ctx = buildContext(state);
    var out = [];
    for (var i = 0; i < ctx.own.length; i++) {
      var u = ctx.own[i];
      var legal = state.legalOrders[u.at] || [];
      var best = null, bestD = 99;
      for (var j = 0; j < legal.length; j++) {
        var o = legal[j];
        if (o.type !== 'move') continue;
        var d = ctx.distSC[o.dest];
        if (d === undefined) d = 99;
        if (d < bestD) { bestD = d; best = o; }
      }
      out.push(best ? { unit: u.at, type: 'move', dest: best.dest } : { unit: u.at, type: 'hold' });
    }
    return out;
  }

  module.exports = {
    name: NAME,
    propose: propose,
    answer: answer,
    orders: orders,
    retreats: retreats,
    builds: builds
  };
})();
