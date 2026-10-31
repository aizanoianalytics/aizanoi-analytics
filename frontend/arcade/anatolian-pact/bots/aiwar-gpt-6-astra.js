(function () {
  'use strict';

  // Anatolian Grinder: greedy expansion tactician with coordinated supports.
  //
  // - Autumn captures are the only thing that changes ownership: Autumn is
  //   for seizing (and denying) supply centres, Spring for racing into
  //   them. Races are always joined; worst case is a bounce.
  // - Attacks on held provinces always bring at least one support;
  //   defenders rarely coordinate, so superiority is assumed, not awaited.
  // - Promises are negotiation theater: accepted for calm, never obeyed as
  //   movement constraints (honoring them unilaterally loses). DMZ offers
  //   are refused outright; promised supports are still issued (they are
  //   cheap and keep the lottery of foreign help alive).
  // - Stray units march toward the nearest ongoing attack so the army
  //   masses; threatened homes are held in Autumn, raced from in Spring.
  // - Fully deterministic, no randomness, no I/O, well under the limit.

  function less(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  function ownUnits(state) {
    return state.units.filter(function (u) { return u.power === state.you; });
  }

  function livingPowers(state) {
    return Object.keys(state.centresByPower).filter(function (p) {
      return p !== state.you &&
        ((state.centresByPower[p] || 0) > 0 ||
          state.units.some(function (u) { return u.power === p; }));
    }).sort(less);
  }

  function engine() {
    try {
      if (typeof PactEngine !== 'undefined' && PactEngine) return PactEngine;
    } catch (e) { /* fall through */ }
    return null;
  }

  // Terrain legality, mirroring the engine (used only if PactEngine missing).
  function canMoveTo(state, unit, dest) {
    var eng = engine();
    if (eng && eng.canMove) {
      try { return eng.canMove(unit, dest); } catch (e) { /* fall through */ }
    }
    var adj = state.map.adjacency[unit.at] || [];
    if (adj.indexOf(dest) < 0) return false;
    var byId = {};
    state.map.provinces.forEach(function (p) { byId[p.id] = p; });
    var to = byId[dest], from = byId[unit.at];
    if (!to || !from) return false;
    if (unit.type === 'army') return to.type === 'land';
    if (unit.type !== 'fleet' || (to.type === 'land' && !to.coastal)) return false;
    if (from.type === 'sea' || to.type === 'sea') return true;
    var destAdj = state.map.adjacency[dest] || [];
    return adj.some(function (id) {
      var q = byId[id];
      return q && q.type === 'sea' && destAdj.indexOf(id) >= 0;
    });
  }

  // BFS distance for a unit type from `from` to the nearest target province.
  function bfsDist(state, type, from, isTarget) {
    if (isTarget(from)) return 0;
    var seen = {};
    seen[from] = 0;
    var queue = [from];
    var head = 0;
    while (head < queue.length) {
      var cur = queue[head++];
      var d = seen[cur];
      if (d >= 9) continue;
      var adj = state.map.adjacency[cur] || [];
      for (var k = 0; k < adj.length; k++) {
        var nx = adj[k];
        if (seen[nx] !== undefined) continue;
        if (!canMoveTo(state, { at: cur, type: type }, nx)) continue;
        seen[nx] = d + 1;
        if (isTarget(nx)) return d + 1;
        queue.push(nx);
      }
    }
    return 99;
  }

  function myBurdens(state) {
    var peace = {}, dmz = {}, sup = [];
    (state.accepted || []).forEach(function (pr) {
      if (pr.power !== state.you) return;
      if (pr.type === 'peace' || pr.type === 'alliance') peace[pr.partner] = 1;
      else if (pr.type === 'dmz' && pr.terms && pr.terms.province) {
        dmz[pr.terms.province] = 1;
      } else if (pr.type === 'support' && pr.terms) {
        sup.push({ unit: pr.terms.unit, dest: pr.terms.dest });
      }
    });
    return { peace: peace, dmz: dmz, sup: sup };
  }

  function leaderOf(state, powers) {
    var best = null, bestC = -1;
    powers.forEach(function (p) {
      var c = state.centresByPower[p] || 0;
      if (c > bestC || (c === bestC && (best === null || p < best))) {
        best = p; bestC = c;
      }
    });
    return best;
  }

  // How often did my own move to `dest` bounce recently?
  function myFailures(state, dest) {
    var n = 0;
    (state.history || []).forEach(function (h) {
      var mine = (h.orders && h.orders[state.you]) || [];
      mine.forEach(function (o) {
        if (o.type === 'move' && o.dest === dest &&
          (o.outcome === 'bounce' || o.outcome === 'dislodged')) n++;
      });
    });
    return n;
  }

  // Powers whose units recently dislodged mine.
  function bloodiedBy(state) {
    var set = {};
    (state.history || []).forEach(function (h) {
      var mine = (h.orders && h.orders[state.you]) || [];
      mine.forEach(function (o) {
        if (o.outcome !== 'dislodged') return;
        Object.keys(h.orders || {}).forEach(function (p) {
          if (p === state.you) return;
          (h.orders[p] || []).forEach(function (e) {
            if (e.type === 'move' && e.dest === o.unit &&
              e.outcome === 'success') {
              set[p] = 1;
            }
          });
        });
      });
    });
    return set;
  }

  function buildContext(state) {
    var me = state.you;
    var at = {};
    state.units.forEach(function (u) { at[u.at] = u; });
    var owners = state.owners || {};
    function isSC(p) { return Object.hasOwn(owners, p); }
    var others = livingPowers(state);
    var myC = state.centresByPower[me] || 0;
    var maxOther = 0;
    others.forEach(function (p) {
      maxOther = Math.max(maxOther, state.centresByPower[p] || 0);
    });
    var autumn = state.season === 'Autumn';
    var lastSeason = autumn && state.year >= state.limits.maxYears;
    var betray = lastSeason || myC >= 11 || maxOther >= 11;
    var burdens = myBurdens(state);
    var trustBroken = {};
    Object.keys(state.trust || {}).forEach(function (p) {
      trustBroken[p] = (state.trust[p] && state.trust[p].broken) || 0;
    });
    var blood = bloodiedBy(state);
    var lead = leaderOf(state, others);
    function restrained(p) {
      // Nothing is restrained: paper promises never block attacks.
      // (Peace proposals are still exchanged as negotiation theater, but
      // honoring them unilaterally against breakers is suicide.)
      return false;
    }
    function isForeignSC(p) { return isSC(p) && owners[p] !== me; }
    function threatOn(prov) {
      var n = 0;
      state.units.forEach(function (u) {
        if (u.power === me) return;
        if (restrained(u.power)) return;
        if (u.at !== prov && canMoveTo(state, u, prov)) n++;
      });
      return n;
    }
    // Enemies that could race us to an empty province.
    function rivals(dest) {
      var n = 0;
      state.units.forEach(function (u) {
        if (u.power === me || u.at === dest) return;
        if (n >= 3) return;
        if (canMoveTo(state, u, dest)) n++;
      });
      return n;
    }
    return {
      me: me, at: at, owners: owners, isSC: isSC, isForeignSC: isForeignSC,
      others: others, myC: myC, maxOther: maxOther,
      leader: lead,
      autumn: autumn, betray: betray, burdens: burdens,
      restrained: restrained,
      trustBroken: trustBroken, threatOn: threatOn, rivals: rivals
    };
  }

  // Score a legal move. Returns {val, need} or null.
  // need = supporters required (0 = can go alone).
  function scoreMove(state, ctx, u, dest, potCount) {
    var me = ctx.me;
    var occ = ctx.at[dest];
    var owner = ctx.owners[dest];
    var sc = ctx.isSC(dest);
    if (occ && occ.power === me) return null;
    if (ctx.burdens.dmz[dest] && !ctx.betray) return null;
    if (occ && occ.power !== me && ctx.restrained(occ.power)) return null;
    var fails = myFailures(state, dest);
    var v, need = 0;
    if (sc && owner !== me) {
      v = owner == null ? 100 : 92;
      if (owner != null) {
        v += Math.min(24, (state.centresByPower[owner] || 0) * 3);
        if (owner === ctx.leader) v += ctx.autumn ? 20 : 10;
        v += Math.min(12, (ctx.trustBroken[owner] || 0) * 2);
      }
      v += ctx.autumn ? 60 : 22;
      v += occ ? -12 : 8;
      v -= fails * 15; // proven resistance: deprioritise, don't forbid
    } else if (sc && owner === me) {
      if (!occ || occ.power === me) return null; // nothing to recapture
      // Recapture: deny the squatter, regain a build slot. Top priority.
      v = 110;
      v += ctx.autumn ? 60 : 22;
      v += Math.min(12, (ctx.trustBroken[occ.power] || 0) * 2);
      if (occ.power === ctx.leader) v += 10;
      v -= fails * 15;
    } else {
      var d0 = bfsDist(state, u.type, u.at, ctx.isForeignSC);
      var d1 = bfsDist(state, u.type, dest, ctx.isForeignSC);
      v = (d0 - d1) * 12 - 4;
      if (d0 >= 99) return null;
      if (v <= 2) return null;
    }
    if (occ && occ.power !== me) {
      // Lone 1v1s never dislodge: only go with at least one supporter.
      // Defenders rarely coordinate, so one helper is usually enough;
      // the value (not the gate) reflects the estimated defence.
      if (potCount < 1) return null;
      var def = defEst(state, ctx, occ, dest, u.at);
      var atk = 1 + potCount;
      if (atk > def) v += (atk - def) * 20;
      else v -= (def - atk + 1) * 30;
      need = 1;
    } else if (!occ) {
      // Races are always joined: worst case we bounce (Spring) and
      // deny the rival a capture (Autumn). Never cede a centre unopposed.
      if (sc && owner !== me && ctx.autumn) {
        v += 15;
        if (potCount > 0) v += 20;
      }
    }
    if (ctx.isSC(u.at) && ctx.owners[u.at] === me) {
      var threat = ctx.threatOn(u.at);
      // Vacating a threatened home in Autumn gifts a capture. In Spring
      // the worst case is an occupier to dislodge later: keep expanding.
      if (threat > 0 && ctx.autumn) v -= 1000;
    }
    if (v <= 4) return null;
    return { val: v, need: need };
  }

  // Estimated defence strength of an occupied province. Rivals almost
  // always spend their units expanding rather than supporting defence,
  // so assume a lone holder until bounce history proves otherwise.
  function defEst(state, ctx, occ, dest, excludeAt) {
    return 1 + Math.min(2, myFailures(state, dest));
  }
  function enemySupport(state, ctx, occ, defAt, excludeAt) {
    var n = 0;
    state.units.forEach(function (s) {
      if (s.power !== occ.power || s.at === occ.at || s.at === excludeAt) return;
      if (n >= 2) return;
      if (canMoveTo(state, s, defAt)) n++;
    });
    return n;
  }

  function legalSupporters(state, mine, legal, busy, tAt, tDest) {
    return mine.filter(function (v) {
      if (busy[v.at] || v.at === tAt || v.at === tDest) return false;
      return (legal[v.at] || []).some(function (o) {
        return o.type === 'support' && o.target === tAt && o.targetDest === tDest;
      });
    });
  }

  function copyOrder(o) {
    var c = { unit: o.unit, type: o.type };
    if (o.dest !== undefined) c.dest = o.dest;
    if (o.target !== undefined) c.target = o.target;
    if (o.targetDest !== undefined) c.targetDest = o.targetDest;
    return c;
  }

  function computePlan(state) {
    var ctx = buildContext(state);
    var me = ctx.me;
    var mine = ownUnits(state);
    var legal = state.legalOrders || {};
    var plan = {};
    var busy = {};
    var claimed = {};
    mine.forEach(function (u) { plan[u.at] = { unit: u.at, type: 'hold' }; });

    function supportersFor(tAt, tDest) {
      return legalSupporters(state, mine, legal, busy, tAt, tDest);
    }

    function potentialFor(uAt, dest) {
      // Supporters available in principle (ignores current busyness).
      return mine.filter(function (vv) {
        if (vv.at === uAt || vv.at === dest) return false;
        return (legal[vv.at] || []).some(function (o) {
          return o.type === 'support' && o.target === uAt &&
            o.targetDest === dest;
        });
      }).length;
    }

    // ---- candidate attacks on supply centres; best-first gets supporters
    var cands = [];
    var bestVal = {};
    mine.forEach(function (u) { bestVal[u.at] = -1000000; });
    mine.forEach(function (u) {
      (legal[u.at] || []).forEach(function (o) {
        if (o.type !== 'move') return;
        var oc = ctx.at[o.dest];
        var foreign = ctx.isSC(o.dest) && ctx.owners[o.dest] !== ctx.me;
        var recapture = ctx.isSC(o.dest) && ctx.owners[o.dest] === ctx.me &&
          oc && oc.power !== ctx.me;
        if (!(foreign || recapture)) return;
        var s = scoreMove(state, ctx, u, o.dest, potentialFor(u.at, o.dest));
        if (!s) return;
        cands.push({ unit: u.at, dest: o.dest, val: s.val, need: s.need });
        if (s.val > bestVal[u.at]) bestVal[u.at] = s.val;
      });
    });
    cands.sort(function (a, b) {
      return (b.val - a.val) || less(a.unit, b.unit) || less(a.dest, b.dest);
    });

    // 1. Honour promised supports first (cheapest supporter).
    ctx.burdens.sup.forEach(function (s) {
      if (ctx.at[s.unit] && busy[s.unit]) return;
      var helpers = supportersFor(s.unit, s.dest).sort(function (a, b) {
        return (bestVal[a.at] - bestVal[b.at]) || less(a.at, b.at);
      });
      for (var i = 0; i < helpers.length; i++) {
        var match = (legal[helpers[i].at] || []).filter(function (o) {
          return o.type === 'support' && o.target === s.unit && o.targetDest === s.dest;
        })[0];
        if (match) {
          plan[helpers[i].at] = copyOrder(match);
          busy[helpers[i].at] = 1;
          break;
        }
      }
    });

    // 2. Attacks in value order; supporters drafted, cheapest first.
    cands.forEach(function (c) {
      if (busy[c.unit] || claimed[c.dest]) return;
      var occ = ctx.at[c.dest];
      if (occ && occ.power === me) return;
      var helpers = supportersFor(c.unit, c.dest).sort(function (a, b) {
        return (bestVal[a.at] - bestVal[b.at]) || less(a.at, b.at);
      });
      if (helpers.length < c.need) return;
      // Re-check winnability with actually-free supporters.
      var defFull = 0;
      if (occ && occ.power !== me) {
        defFull = defEst(state, ctx, occ, c.dest, c.unit);
        if (1 + helpers.length <= defFull) return;
      }
      var mv = (legal[c.unit] || []).filter(function (o) {
        return o.type === 'move' && o.dest === c.dest;
      })[0];
      if (!mv) return;
      plan[c.unit] = copyOrder(mv);
      busy[c.unit] = 1;
      claimed[c.dest] = 1;
      var take = occ ?
        Math.min(helpers.length, defFull) :
        Math.min(helpers.length, Math.max(c.need,
          ctx.autumn ? ctx.rivals(c.dest) : 0));
      for (var i = 0; i < take; i++) {
        var m2 = (legal[helpers[i].at] || []).filter(function (o) {
          return o.type === 'support' && o.target === c.unit &&
            o.targetDest === c.dest;
        })[0];
        if (!m2) continue;
        plan[helpers[i].at] = copyOrder(m2);
        busy[helpers[i].at] = 1;
      }
    });

    // 3. Shield threatened units with support-hold.
    mine.forEach(function (u) {
      if (busy[u.at]) return;
      var threat = ctx.threatOn(u.at);
      var valuable = ctx.isSC(u.at) && ctx.owners[u.at] === me;
      if (threat <= 0 || (!valuable && threat < 2)) return;
      var helpers = supportersFor(u.at, 'hold');
      var want = valuable ? Math.min(threat, helpers.length) : 1;
      for (var i = 0; i < want && i < helpers.length; i++) {
        var match = (legal[helpers[i].at] || []).filter(function (o) {
          return o.type === 'support' && o.target === u.at &&
            o.targetDest === 'hold';
        })[0];
        if (!match) continue;
        plan[helpers[i].at] = copyOrder(match);
        busy[helpers[i].at] = 1;
      }
    });

    // 4. Leftover units: reposition toward the nearest foreign centre.
    mine.forEach(function (u) {
      if (busy[u.at]) return;
      var best = null;
      (legal[u.at] || []).forEach(function (o) {
        if (o.type !== 'move') return;
        var occ0 = ctx.at[o.dest];
        if (claimed[o.dest] || (occ0 && occ0.power === ctx.me)) {
          return;
        }
        if (occ0 && occ0.power !== ctx.me) return; // no pointless deep strikes
        if (ctx.isSC(o.dest)) return; // SC moves handled in phase 2
        if (ctx.burdens.dmz[o.dest] && !ctx.betray) return;
        var d0 = bfsDist(state, u.type, u.at, ctx.isForeignSC);
        var d1 = bfsDist(state, u.type, o.dest, ctx.isForeignSC);
        var vv = (d0 - d1) * 12 - 4;
        if (vv <= 2 || d0 >= 99) return;
        if (!best || vv > best.val ||
          (vv === best.val && o.dest < best.order.dest)) {
          best = { val: vv, order: copyOrder(o) };
        }
      });
      if (!best) {
        // No frontier approach: march toward the nearest ongoing attack
        // so the army masses instead of sitting scattered.
        var attackers = [];
        mine.forEach(function (w) {
          var pw = plan[w.at];
          if (pw && pw.type === 'move') attackers.push(pw.dest);
        });
        if (attackers.length) {
          var curD = 99;
          attackers.forEach(function (a) {
            if (a === u.at) { curD = 0; return; }
            curD = Math.min(curD, bfsDist(state, u.type, u.at,
              function (p) { return p === a; }));
          });
          var bestC = null, bestCD = curD;
          (legal[u.at] || []).forEach(function (o) {
            if (o.type !== 'move' || claimed[o.dest]) return;
            var occ2 = ctx.at[o.dest];
            if (occ2) return; // mass toward the battle, don't start new ones
            var dd = 99;
            attackers.forEach(function (a) {
              if (a === o.dest) { dd = 0; return; }
              dd = Math.min(dd, bfsDist(state, u.type, o.dest,
                function (p) { return p === a; }));
            });
            if (dd < bestCD ||
              (bestC && dd === bestCD && o.dest < bestC.order.dest)) {
              bestC = { order: copyOrder(o) };
              bestCD = dd;
            }
          });
          if (bestC && bestCD < curD) best = bestC;
        }
      }
      if (best) {
        plan[u.at] = best.order;
        busy[u.at] = 1;
        claimed[best.order.dest] = 1;
      }
    });

    // 5. Safety net: simulate vs holding enemies, undo doomed Spring attacks.
    try {
      var eng = engine();
      if (eng && eng.adjudicate) {
        var submitted = mine.map(function (u) { return plan[u.at]; });
        var battle = eng.adjudicate(state.units, submitted);
        var byUnit = {};
        (battle.resolution || []).forEach(function (r) { byUnit[r.unit] = r; });
        mine.forEach(function (u) {
          var r = byUnit[u.at];
          if (!r || r.power !== me) return;
          if (r.type === 'move' && r.outcome === 'bounce' && ctx.at[r.dest] &&
              ctx.at[r.dest].power !== me && !ctx.autumn) {
            // Spring wall: fall back instead of bleeding again.
            plan[u.at] = { unit: u.at, type: 'hold' };
            delete busy[u.at];
            mine.forEach(function (v) {
              var p = plan[v.at];
              if (p && p.type === 'support' && p.target === u.at) {
                plan[v.at] = { unit: v.at, type: 'hold' };
                delete busy[v.at];
              }
            });
            delete claimed[r.dest];
          }
          if (r.outcome === 'dislodged') {
            var helpers = supportersFor(u.at, 'hold');
            if (helpers.length) {
              var match = (legal[helpers[0].at] || []).filter(function (o) {
                return o.type === 'support' && o.target === u.at &&
                  o.targetDest === 'hold';
              })[0];
              if (match) {
                plan[helpers[0].at] = copyOrder(match);
                busy[helpers[0].at] = 1;
              }
            }
          }
        });
      }
    } catch (e) { /* keep heuristic plan */ }

    return mine.map(function (u) { return plan[u.at]; });
  }

  function propose(state) {
    var ctx = buildContext(state);
    var me = ctx.me;
    var out = [];
    var mine = ownUnits(state);
    if (!mine.length) return out;
    // Adjacent rival powers.
    var adjPowers = {};
    mine.forEach(function (u) {
      ((state.map.adjacency[u.at]) || []).forEach(function (q) {
        var occ = ctx.at[q];
        if (occ && occ.power !== me && livingPowers(state).indexOf(occ.power) >= 0) {
          adjPowers[occ.power] = 1;
        }
        var owner = ctx.owners[q];
        if (owner && owner !== me && livingPowers(state).indexOf(owner) >= 0) {
          adjPowers[owner] = 1;
        }
      });
    });
    var adj = Object.keys(adjPowers).sort(function (a, b) {
      return ((state.centresByPower[a] || 0) - (state.centresByPower[b] || 0)) ||
        less(a, b);
    });
    adj.slice(0, 4).forEach(function (to) {
      if (out.length < 6) out.push({ to: to, type: 'peace', terms: {} });
    });
    // One alliance: weakest neighbour (or weakest rival) vs the leader.
    if (out.length < 6 && ctx.others.length >= 2 && ctx.leader) {
      var pool = adj.length ? adj : ctx.others.filter(function (p) {
        return p !== ctx.leader;
      }).sort(function (a, b) {
        return ((state.centresByPower[a] || 0) - (state.centresByPower[b] || 0)) ||
          less(a, b);
      });
      var ally = null;
      for (var i = 0; i < pool.length; i++) {
        if (pool[i] !== ctx.leader) { ally = pool[i]; break; }
      }
      if (ally) {
        out.push({ to: ally, type: 'alliance', terms: { target: ctx.leader } });
      }
    }
    // Request support for our best unsupported attack on a held centre.
    if (out.length < 6) {
      var legal = state.legalOrders || {};
      var tried = {};
      mine.forEach(function (u) {
        if (out.length >= 6) return;
        (legal[u.at] || []).forEach(function (o) {
          if (out.length >= 6 || o.type !== 'move') return;
          var occ = ctx.at[o.dest];
          if (!occ || occ.power === me || !ctx.isSC(o.dest)) return;
          if (tried[u.at + o.dest]) return;
          tried[u.at + o.dest] = 1;
          ctx.others.forEach(function (p) {
            if (out.length >= 6 || p === occ.power) return;
            var can = state.units.some(function (s) {
              return s.power === p && s.at !== u.at &&
                canMoveTo(state, s, o.dest);
            });
            if (can) {
              out.push({
                to: p, type: 'request-support',
                terms: { unit: u.at, dest: o.dest }
              });
            }
          });
        });
      });
    }
    return out.slice(0, 6);
  }

  function answer(state) {
    var ctx = buildContext(state);
    var res = {};
    var legal = state.legalOrders || {};
    var mine = ownUnits(state);
    (state.inbox || []).forEach(function (p) {
      var verdict = 'reject';
      if (p.type === 'peace' || p.type === 'alliance') {
        // Cheap theater: accepting costs nothing (promises never gate
        // our orders) and may calm honest neighbors. Refuse only when
        // betraying the leader outright.
        verdict = (ctx.betray && p.from === ctx.leader) ? 'reject' : 'accept';
      } else if (p.type === 'dmz') {
        verdict = 'reject'; // never accept movement leashes
      } else if (p.type === 'support') {
        verdict = mine.some(function (u) { return u.at === p.terms.unit; }) ?
          'accept' : 'reject';
      } else if (p.type === 'request-support') {
        var helper = mine.filter(function (v) {
          return (legal[v.at] || []).some(function (o) {
            return o.type === 'support' && o.target === p.terms.unit &&
              o.targetDest === p.terms.dest;
          });
        })[0];
        if (helper && mine.length >= 2) {
          var occ = ctx.at[p.terms.dest];
          var aligned = p.terms.dest === 'hold' ||
            (ctx.isSC(p.terms.dest) && ctx.owners[p.terms.dest] !== ctx.me) ||
            (occ && occ.power === ctx.leader);
          verdict = aligned ? 'accept' : 'reject';
        }
      }
      res[p.id] = verdict;
    });
    return res;
  }

  function retreats(state) {
    var ctx = buildContext(state);
    var res = {};
    (state.retreats || []).forEach(function (r) {
      var best = null, bestV = -1000000000;
      (r.options || []).forEach(function (opt) {
        var v = 0;
        if (ctx.isSC(opt) && ctx.owners[opt] !== ctx.me) {
          v += ctx.autumn ? 150 : 100;
        } else if (ctx.isSC(opt)) {
          v += 30;
        } else {
          v += 10;
        }
        v += (9 - bfsDist(state, r.type, opt, ctx.isForeignSC)) * 3;
        var foes = 0, friends = 0;
        state.units.forEach(function (u) {
          if (u.at === opt) return;
          if (u.power === ctx.me) {
            friends++;
            return;
          }
          if (canMoveTo(state, u, opt)) foes++;
        });
        v += friends * 4 - foes * 6;
        if (best === null || v > bestV || (v === bestV && opt < best)) {
          best = opt; bestV = v;
        }
      });
      res[r.at] = best || null;
    });
    return res;
  }

  function builds(state) {
    var me = state.you;
    var mine = ownUnits(state);
    var delta = (state.centresByPower[me] || 0) - mine.length;
    if (delta === 0) return [];
    var at = {};
    state.units.forEach(function (u) { at[u.at] = u; });
    if (delta > 0) {
      // Every supply centre is land and army-reachable; fleets built
      // mid-game tend to idle in seas. Armies always.
      var spots = state.map.provinces.filter(function (p) {
        return p.home === me && (state.owners[p.id] === me) && !at[p.id];
      }).map(function (p) { return p.id; }).sort(less).slice(0, delta);
      return spots.map(function (id) {
        return { type: 'army', at: id };
      });
    }
    var need = -delta;
    function homeDist(provId) {
      var homes = state.map.provinces.filter(function (p) {
        return p.home === me;
      }).map(function (p) { return p.id; });
      var seen = {};
      var queue = homes.slice();
      homes.forEach(function (h) { seen[h] = 0; });
      if (seen[provId] !== undefined) return 0;
      var head = 0;
      while (head < queue.length) {
        var cur = queue[head++];
        var adj = state.map.adjacency[cur] || [];
        for (var i = 0; i < adj.length; i++) {
          if (seen[adj[i]] !== undefined) continue;
          seen[adj[i]] = seen[cur] + 1;
          if (adj[i] === provId) return seen[adj[i]];
          queue.push(adj[i]);
        }
      }
      return 99;
    }
    function keepValue(u) {
      var v = 0;
      if (ctx_isSC(state, u.at)) v += 30;
      state.units.forEach(function (o) {
        if (o.power === me || o.at === u.at) return;
        if ((state.map.adjacency[u.at] || []).indexOf(o.at) >= 0) v += 6;
      });
      if (u.type === 'fleet') v += 1;
      return v;
    }
    function ctx_isSC(st, p) { return Object.hasOwn(st.owners, p); }
    var ordered = mine.slice().sort(function (a, b) {
      return (keepValue(a) - keepValue(b)) ||
        (homeDist(b.at) - homeDist(a.at)) ||
        less(a.at, b.at);
    });
    return ordered.slice(0, need).map(function (u) { return { disband: u.at }; });
  }

  module.exports = {
    name: 'Anatolian Grinder',
    propose: propose,
    answer: answer,
    orders: function (state) { return computePlan(state); },
    retreats: retreats,
    builds: builds
  };
})();
