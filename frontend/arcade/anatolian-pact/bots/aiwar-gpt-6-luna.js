(function () {
  'use strict';

  // Persistent seat-local memory. Reset whenever a new match seed appears.
  var MEM = { seed: null, hostile: {}, seenHist: {}, seenTrust: {} };

  function resetMem(seed) {
    MEM = { seed: seed, hostile: {}, seenHist: {}, seenTrust: {}, failed: {}, target: null };
  }

  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  function isLiving(state, power) {
    if (power === state.you) return true;
    if ((state.centresByPower[power] || 0) > 0) return true;
    for (var i = 0; i < state.units.length; i++) {
      if (state.units[i].power === power) return true;
    }
    return false;
  }

  function livingOthers(state) {
    return Object.keys(state.centresByPower).filter(function (p) {
      return p !== state.you && isLiving(state, p);
    });
  }

  function lastSeason(state) {
    return state.year >= state.limits.maxYears && state.season === 'Autumn';
  }

  function endgame(state) {
    return (state.limits.maxYears - state.year) <= 1;
  }

  function leaderOf(state) {
    var best = null, bestN = -1;
    livingOthers(state).forEach(function (p) {
      var n = state.centresByPower[p] || 0;
      if (n > bestN || (n === bestN && best !== null && cmp(p, best) < 0)) {
        best = p; bestN = n;
      }
    });
    return { power: best, centres: bestN };
  }

  // Learn who attacks our units and which of our attacks bounced.
  // Bounced raids get a cooldown so we stop grinding the same fort.
  function updateMemory(state) {
    if (MEM.seed !== state.seed) resetMem(state.seed);
    var idx = state.year * 2 + (state.season === 'Autumn' ? 1 : 0);
    Object.keys(MEM.failed).forEach(function (k) {
      if (idx - MEM.failed[k] > 4) delete MEM.failed[k];
    });
    (state.history || []).forEach(function (h) {
      var key = h.year + '/' + h.season;
      if (MEM.seenHist[key]) return;
      MEM.seenHist[key] = true;
      var hidx = h.year * 2 + (h.season === 'Autumn' ? 1 : 0);
      var mine = {};
      var myOrders = (h.orders && h.orders[state.you]) || [];
      myOrders.forEach(function (o) {
        if (o && o.unit) mine[o.unit] = true;
        if (o && o.type === 'move' && o.outcome === 'bounce' && o.dest) {
          MEM.failed[o.unit + '>' + o.dest] = hidx;
        }
      });
      if (!Object.keys(mine).length) return;
      Object.keys(h.orders || {}).forEach(function (p) {
        if (p === state.you) return;
        (h.orders[p] || []).forEach(function (o) {
          if (o && o.type === 'move' && o.dest && mine[o.dest]) {
            MEM.hostile[p] = (MEM.hostile[p] || 0) + 1;
          }
        });
      });
    });
    Object.keys(state.trust || {}).forEach(function (p) {
      if (p === state.you) return;
      (state.trust[p].brokenPromises || []).forEach(function (pr) {
        if (pr.partner === state.you && pr.outcome === 'broken' && !MEM.seenTrust[pr.id]) {
          MEM.seenTrust[pr.id] = true;
          MEM.hostile[p] = (MEM.hostile[p] || 0) + 2;
        }
      });
    });
  }

  function betrayAllowed(state, power, lead) {
    if (lastSeason(state)) return true;
    if ((MEM.hostile[power] || 0) > 0) return true;
    if (endgame(state)) return true;
    if (lead.power === power && lead.centres >= 9) return true;
    return false;
  }

  // Terrain-aware passability for one unit type between adjacent provinces.
  function passableFn(state, unitType) {
    var byId = {};
    state.map.provinces.forEach(function (p) { byId[p.id] = p; });
    return function (a, b) {
      var A = byId[a], B = byId[b];
      if (!A || !B) return false;
      if (unitType === 'army') return B.type === 'land';
      if (B.type === 'sea' || A.type === 'sea') return true;
      if (!B.coastal) return false;
      var adjA = state.map.adjacency[a] || [];
      var adjB = state.map.adjacency[b] || [];
      for (var i = 0; i < adjA.length; i++) {
        var s = adjA[i];
        if (byId[s] && byId[s].type === 'sea' && adjB.indexOf(s) >= 0) return true;
      }
      return false;
    };
  }

  // Multi-source BFS distances to the nearest valuable SC for one unit.
  function distMap(state, unit, targets) {
    var pass = passableFn(state, unit.type);
    var dist = {};
    var queue = targets.slice();
    queue.forEach(function (t) { dist[t] = 0; });
    var head = 0;
    while (head < queue.length) {
      var cur = queue[head++];
      var adj = state.map.adjacency[cur] || [];
      for (var i = 0; i < adj.length; i++) {
        var nx = adj[i];
        if (nx in dist) continue;
        // edge usable if passable in either direction (heuristic)
        if (!pass(cur, nx) && !pass(nx, cur)) continue;
        dist[nx] = dist[cur] + 1;
        queue.push(nx);
      }
    }
    return dist;
  }

  function ownUnits(state) {
    return state.units.filter(function (u) { return u.power === state.you; });
  }

  function alliesOf(state) {
    var s = new Set();
    (state.accepted || []).forEach(function (p) {
      if (p.type === 'peace' || p.type === 'alliance') {
        s.add(p.power === state.you ? p.partner : p.power);
      }
    });
    return s;
  }

  function dmzOf(state) {
    var s = new Set();
    (state.accepted || []).forEach(function (p) {
      if (p.type === 'dmz') s.add(p.terms.province);
    });
    return s;
  }

  function owedSupports(state) {
    var out = [];
    (state.accepted || []).forEach(function (p) {
      if (p.type === 'support' && p.power === state.you) {
        out.push({ unit: p.terms.unit, dest: p.terms.dest });
      }
    });
    return out;
  }

  function legalSupporter(state, plan, free, target, targetDest, excludeDest) {
    var best = null;
    for (var i = 0; i < free.length; i++) {
      var at = free[i];
      if (plan[at].type !== 'hold') continue;
      if (excludeDest && at === excludeDest) continue;
      var legal = state.legalOrders[at] || [];
      for (var j = 0; j < legal.length; j++) {
        var o = legal[j];
        if (o.type === 'support' && o.target === target && o.targetDest === targetDest) {
          best = at;
          break;
        }
      }
      if (best) break;
    }
    return best;
  }

  // How likely is this unit to support the victim's defence, based on
  // what it did last season? History orders are the only tell we get.
  function supporterWeight(state, power, at, dest) {
    var hist = state.history || [];
    var h = hist.length ? hist[hist.length - 1] : null;
    var arr = (h && h.orders && h.orders[power]) || [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].unit === at) {
        if (arr[i].type === 'support' && arr[i].target === dest) return 1;
        return 0.4;
      }
    }
    return 0.5;
  }

  // Adjacency pressure per power: my units/SCs touching their units/SCs.
  function pressureMap(state, occ) {
    var mine = ownUnits(state);
    var pressure = {};
    mine.forEach(function (u) {
      (state.map.adjacency[u.at] || []).forEach(function (nx) {
        var e = occ[nx];
        if (e && e.power !== state.you) pressure[e.power] = (pressure[e.power] || 0) + 2;
        var o = Object.hasOwn(state.owners, nx) ? state.owners[nx] : undefined;
        if (o && o !== state.you) pressure[o] = (pressure[o] || 0) + 1;
      });
    });
    return pressure;
  }

  // Primary victim. Sticky across seasons: no flip-flopping between marks.
  function currentTarget(state, occ, lead) {
    var pressure = pressureMap(state, occ);
    var cands = Object.keys(pressure).filter(function (p) { return isLiving(state, p); });
    // Powers squatting on stealable frontier (non-home SCs next to my units)
    // are prime marks: they hold what should be mine.
    var prizeHolders = {};
    Object.keys(state.owners).forEach(function (id) {
      var o = state.owners[id];
      if (!o || o === state.you) return;
      var provHome = null;
      for (var i = 0; i < state.map.provinces.length; i++) {
        if (state.map.provinces[i].id === id) { provHome = state.map.provinces[i].home; break; }
      }
      if (provHome === o) return; // their home: a fortress, not a prize
      var adj = state.map.adjacency[id] || [];
      for (var j = 0; j < adj.length; j++) {
        var u = occ[adj[j]];
        if (u && u.power === state.you) { prizeHolders[o] = true; break; }
      }
    });
    var pick = null;
    if (cands.length) {
      if (lead.power && lead.centres >= 9 && cands.indexOf(lead.power) >= 0) {
        pick = lead.power;
      } else {
        pick = cands.sort(function (a, b) {
          return (((MEM.hostile[b] || 0) > 0) - ((MEM.hostile[a] || 0) > 0)) ||
            ((prizeHolders[b] ? 1 : 0) - (prizeHolders[a] ? 1 : 0)) ||
            ((state.centresByPower[a] || 0) - (state.centresByPower[b] || 0)) ||
            ((pressure[b] || 0) - (pressure[a] || 0)) || cmp(a, b);
        })[0];
      }
    }
    if (MEM.target && MEM.target !== pick && isLiving(state, MEM.target) &&
        ((pressure[MEM.target] || 0) > 0 || (MEM.hostile[MEM.target] || 0) > 0)) {
      // Drop a mark that has outgrown us: contain them, go eat the weak.
      // A rival squatting on stealable frontier also steals our attention.
      // (An existential runaway, or a blood grudge, keeps priority.)
      var myC = state.centresByPower[state.you] || 0;
      var tC = state.centresByPower[MEM.target] || 0;
      var existential = (lead.power === MEM.target && lead.centres >= 9);
      var grudge = (MEM.hostile[MEM.target] || 0) > 0;
      var shinyPick = prizeHolders[pick] && !prizeHolders[MEM.target];
      if (existential || grudge) return MEM.target;
      if ((tC < myC + 3) && !shinyPick) return MEM.target;
    }
    MEM.target = pick;
    return pick;
  }

  // Did this power move anything last season? Statues do not steal SCs.
  // Returns null when there is no history yet (early caution: assume mobile).
  function movedLastSeason(state, power) {
    var hist = state.history || [];
    if (!hist.length) return null;
    var h = hist[hist.length - 1];
    var arr = (h.orders && h.orders[power]) || [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i].type === 'move') return true;
    }
    return false;
  }

  function computeOrders(state) {
    var me = state.you;
    var mine = ownUnits(state);
    var occ = {};
    state.units.forEach(function (u) { occ[u.at] = u; });
    var allies = alliesOf(state);
    // Squatters forfeit protection: an ally unit sitting on our SC has
    // already voided the peace, even though the letter of the promise stands.
    state.units.forEach(function (u) {
      if (u.power !== me && allies.has(u.power) && state.owners[u.at] === me) {
        allies.delete(u.power);
      }
    });
    var dmz = dmzOf(state);
    var owed = owedSupports(state);
    var lead = leaderOf(state);
    var myCentres = state.centresByPower[me] || 0;
    var ls = lastSeason(state);
    var isAutumn = state.season === 'Autumn';
    // Primary victim (sticky): attacked whatever the diplomats say.
    var target = currentTarget(state, occ, lead);

    var plan = {};
    mine.forEach(function (u) { plan[u.at] = { unit: u.at, type: 'hold' }; });
    var free = mine.map(function (u) { return u.at; });
    var homeById = {};
    var typeById = {};
    state.map.provinces.forEach(function (p) { homeById[p.id] = p.home; typeById[p.id] = p.type; });

    function unfree(at) {
      var i = free.indexOf(at);
      if (i >= 0) free.splice(i, 1);
    }

    // 1. Honour promised supports first (keeps us alliance-worthy),
    //    unless fulfilling would break our own peace/alliance.
    owed.forEach(function (ow) {
      var sup = legalSupporter(state, plan, free.slice().sort(cmp), ow.unit, ow.dest, null);
      if (!sup) return;
      if (!ls) {
        var destProv = ow.dest === 'hold' ? ow.unit : ow.dest;
        var victim = occ[destProv];
        if (victim && victim.power !== me && victim.power !== target &&
            allies.has(victim.power) && !betrayAllowed(state, victim.power, lead)) {
          return;
        }
      }
      plan[sup] = { unit: sup, type: 'support', target: ow.unit, targetDest: ow.dest };
      unfree(sup);
    });

    // 2. Units pinned on defence: Autumn holders of owned SCs facing enemies.
    var pinned = {};
    if (isAutumn && !ls) {
      mine.forEach(function (u) {
        if (state.owners[u.at] !== me) return;
        var adj = state.map.adjacency[u.at] || [];
        for (var i = 0; i < adj.length; i++) {
          var e = occ[adj[i]];
          if (e && e.power !== me) { pinned[u.at] = true; break; }
        }
      });
    }

    // 4. Valuable SC set for distance heuristic. Enemy homes are excluded:
    // fortresses are approached deliberately, never drifted toward.
    var prizeSC = Object.keys(state.owners).filter(function (id) {
      return state.owners[id] !== me &&
        !(state.owners[id] && homeById[id] === state.owners[id]);
    });

    // 5. Candidate moves.
    var cands = [];
    var nowIdx0 = state.year * 2 + (isAutumn ? 1 : 0);
    var lastMoves = {};
    var hist0 = (state.history || [])[(state.history || []).length - 1];
    ((hist0 && hist0.orders && hist0.orders[me]) || []).forEach(function (o) {
      if (o && o.type === 'move' && o.outcome === 'success' && o.dest) {
        lastMoves[o.unit + '>' + o.dest] = true;
      }
    });
    mine.forEach(function (u) {
      if (plan[u.at].type !== 'hold' || pinned[u.at]) return;
      // Autumn capture-hold: sitting on a prize through Autumn takes it.
      // No raid is worth abandoning a certain capture.
      if (isAutumn) {
        var under = Object.hasOwn(state.owners, u.at) ? state.owners[u.at] : undefined;
        if (under !== undefined && under !== me) return;
      }
      var dmap = distMap(state, u, prizeSC);
      var d0 = (dmap[u.at] === undefined) ? 50 : dmap[u.at];
      (state.legalOrders[u.at] || []).forEach(function (o) {
        if (o.type !== 'move') return;
        if (occ[o.dest] && occ[o.dest].power === me) return;
        if (dmz.has(o.dest) && !ls) return;
        var victim = occ[o.dest] || null;
        if (victim && victim.power !== me && victim.power !== target &&
            allies.has(victim.power) && !betrayAllowed(state, victim.power, lead)) return;
        // Spring discipline: never strand an owned SC next to enemies with
        // nobody left to come back. (Failed attacks stay home; successful
        // ones must not gift the province behind them.)
        if (!isAutumn && state.owners[u.at] === me) {
          var adjNow = state.map.adjacency[u.at] || [];
          var foeNear = false, cover = false;
          for (var ai = 0; ai < adjNow.length; ai++) {
            var ae = occ[adjNow[ai]];
            if (!ae) continue;
            if (ae.power === me) { cover = true; continue; }
            if (adjNow[ai] === o.dest) continue; // marching on the threat itself
            foeNear = true;
          }
          if (foeNear && !cover) return;
        }
        var oOwner = Object.hasOwn(state.owners, o.dest) ? state.owners[o.dest] : undefined;
        var isSC = oOwner !== undefined;
        if (isSC && oOwner === me && !victim) {
          // Our own SC, unoccupied: move back in only if something mobile
          // threatens it. Marching home to a safe province wastes a capture.
          // (Statues never move: no need to guard against them.)
          var endangered = (state.map.adjacency[o.dest] || []).some(function (nx) {
            var ne = occ[nx];
            if (!ne || ne.power === me) return false;
            if ((MEM.hostile[ne.power] || 0) > 0) return true;
            return movedLastSeason(state, ne.power) !== false;
          });
          // Homes are build sites: returning beats frontier grabs in Autumn.
          var back = endangered ? (isAutumn ? 110 : 40) : 5;
          cands.push({ unit: u.at, dest: o.dest, score: back, victim: null, recapture: true });
          return;
        }
        if (isSC && oOwner === me) {
          // Enemy sits on our SC: throw them out. Always. No promise covers
          // squatters: a partner who walks into our homes has no peace to keep.
          var rs = isAutumn ? 130 : 70;
          cands.push({ unit: u.at, dest: o.dest, score: rs, victim: victim ? victim.power : null, recapture: true });
          return;
        }
        var s = 0;
        if (isSC) {
          if (oOwner === null) s += 60;
          else {
            s += 55;
            if (oOwner === lead.power && lead.power !== null) s += 20;
            s += Math.min(MEM.hostile[oOwner] || 0, 3) * 10;
            if (oOwner === target) s += 10;
          }
          if (isAutumn) s += 30;
          else s += 12; // Spring: arrive early, hold through Autumn
          // Certainty premium: an empty SC is a sure capture; a raid may bounce.
          if (!victim) s += 10;
        } else {
          var d1 = (dmap[o.dest] === undefined) ? 50 : dmap[o.dest];
          s += (d0 - d1) * 6 + 2;
          // Staging: sit next to takable prizes, friends and fights -- not
          // next to fortresses. Parking by an enemy home achieves nothing.
          var stage = 0;
          (state.map.adjacency[o.dest] || []).forEach(function (nx) {
            if (nx === u.at) return;
            var no = Object.hasOwn(state.owners, nx) ? state.owners[nx] : undefined;
            if (no === null || (no !== undefined && no !== me && homeById[nx] !== no)) stage += 3;
            var ne = occ[nx];
            if (ne && ne.power === me) stage += 2;
            else if (ne) stage += 1;
          });
          s += Math.min(stage, 12);
        }
        // Fleet discipline: open water is only worth entering to fight or
        // to land. Aimless voyages end disbanded in a far sea. Fortresses
        // do not count as a reason: a lone fleet never cracks a home.
        if (u.type === 'fleet' && typeById[o.dest] === 'sea') {
          var action = false;
          (state.map.adjacency[o.dest] || []).forEach(function (nx) {
            var ne = occ[nx];
            if (ne && ne.power !== me) action = true;
            var no2 = Object.hasOwn(state.owners, nx) ? state.owners[nx] : undefined;
            if (no2 === null || (no2 !== undefined && no2 !== me && homeById[nx] !== no2)) action = true;
          });
          if (!action) s -= 50;
        }
        if (victim) {
          s += 6;
          if (victim.power === target) s += 6;
          // Only chase a real lead: tied early "leaders" earn no bonus.
          if (victim.power === lead.power && lead.power !== null) {
            s += Math.max(0, lead.centres - myCentres) * 4;
          }
          // Don't poke stronger powers: hitting up invites retaliation.
          var vc = state.centresByPower[victim.power] || 0;
          if (!endgame(state) && vc > myCentres) s -= (vc - myCentres) * 2;
        }
        // Spring solo raids into occupied enemy homes are tempo traps:
        // need a backer, a grudge, a weak victim -- unless they are the mark.
        if (victim && victim.power !== target && !isAutumn && homeById[o.dest] === victim.power) {
          var vc2 = state.centresByPower[victim.power] || 0;
          var justified = (MEM.hostile[victim.power] || 0) > 0 ||
            vc2 * 2 <= myCentres || endgame(state);
          if (!justified) {
            var backer = false;
            for (var bi = 0; bi < mine.length && !backer; bi++) {
              var bu = mine[bi];
              if (bu.at === u.at || bu.at === o.dest) continue;
              var bl = state.legalOrders[bu.at] || [];
              for (var bj = 0; bj < bl.length; bj++) {
                if (bl[bj].type === 'support' && bl[bj].target === u.at &&
                    bl[bj].targetDest === o.dest) { backer = true; break; }
              }
            }
            if (!backer) return;
          }
        }
        // Endgame urgency: centres now matter more than positioning.
        if (endgame(state) && isSC && oOwner !== me) s += 20;
        // Don't strip our own Autumn SC bare without reason; Spring
        // leavers risk Autumn theft, so prefer covered expansions.
        if (state.owners[u.at] === me) s -= isAutumn ? 12 : 6;
        // Cooldown on raids that just bounced: hold the ground instead of
        // re-grinding the same fort.
        var nowIdx = state.year * 2 + (isAutumn ? 1 : 0);
        var failIdx = MEM.failed[u.at + '>' + o.dest];
        if (failIdx !== undefined && nowIdx - failIdx <= 2) s -= 45;
        // No ping-pong: going straight back where I came from wastes seasons.
        if (lastMoves[o.dest + '>' + u.at]) s -= 30;
        // Avoid walking into a trap (empty province ringed by enemies).
        if (!victim) {
          var ring = 0;
          (state.map.adjacency[o.dest] || []).forEach(function (nx) {
            var e2 = occ[nx];
            if (e2 && e2.power !== me) ring++;
          });
          s -= ring * 4;
        }
        cands.push({ unit: u.at, dest: o.dest, score: s, victim: victim ? victim.power : null });
      });
    });
    cands.sort(function (a, b) {
      return b.score - a.score || cmp(a.unit, b.unit) || cmp(a.dest, b.dest);
    });

    var claimed = {};
    cands.forEach(function (c) {
      if (plan[c.unit].type !== 'hold' || claimed[c.dest]) return;
      var helpers = [];
      if (c.victim || c.recapture) {
        // Defence estimate: 1 + likely supporting neighbours. Units that
        // supported this victim last season count full; others are maybes.
        var def = 1;
        if (c.victim) {
          (state.map.adjacency[c.dest] || []).forEach(function (nx) {
            var e = occ[nx];
            if (e && e.power === c.victim && nx !== c.unit) {
              def += supporterWeight(state, c.victim, nx, c.dest);
            }
          });
        }
        var cands2 = free.slice().sort(cmp);
        // Empty-province walks need no escort in the main pass; contested
        // grabs get one backer afterwards. Only real fights mass up here.
        var maxHelp = !c.victim ? 0 : ((isAutumn || c.recapture) ? def : Math.min(def, 1));
        for (var h = 0; h < cands2.length && helpers.length < maxHelp; h++) {
          var at = cands2[h];
          if (at === c.unit || at === c.dest) continue;
          var legal = state.legalOrders[at] || [];
          for (var j = 0; j < legal.length; j++) {
            var so = legal[j];
            if (so.type === 'support' && so.target === c.unit && so.targetDest === c.dest) {
              helpers.push(at);
              break;
            }
          }
        }
        var atk = 1 + helpers.length;
        var destIsSC = Object.hasOwn(state.owners, c.dest);
        if (c.recapture) {
          if (!(atk >= def)) return; // must throw them out for sure
        } else if (destIsSC) {
          // Spring raids are free (no ownership change); Autumn SC
          // attacks are worth a fair fight. Non-SC scraps are not.
          if (isAutumn && !(atk >= def)) return;
        } else {
          if (!(atk > def)) return;
        }
      } else {
        if (c.score < -20) return; // nowhere worth going
      }
      plan[c.unit] = { unit: c.unit, type: 'move', dest: c.dest };
      unfree(c.unit);
      claimed[c.dest] = true;
      helpers.forEach(function (helper) {
        plan[helper] = { unit: helper, type: 'support', target: c.unit, targetDest: c.dest };
        unfree(helper);
      });
    });

    // 6. Leftover units: back up contested SC grabs, then shield
    //    owned-SC holders that face real pressure. Walks back to our own
    //    SCs need no escort: a bounce there just preserves the status quo.
    Object.keys(plan).forEach(function (at) {
      var o = plan[at];
      if (o.type !== 'move') return;
      if (!Object.hasOwn(state.owners, o.dest) || occ[o.dest]) return;
      if (state.owners[o.dest] === me) return;
      var contested = (state.map.adjacency[o.dest] || []).some(function (nx) {
        var e = occ[nx];
        return e && e.power !== me;
      });
      if (!contested) return;
      var sup = legalSupporter(state, plan, free.slice().sort(cmp), o.unit, o.dest, o.dest);
      if (sup) {
        plan[sup] = { unit: sup, type: 'support', target: o.unit, targetDest: o.dest };
        unfree(sup);
      }
    });
    mine.forEach(function (u) {
      if (plan[u.at].type !== 'hold') return;
      if (state.owners[u.at] !== me) return; // only shield owned-SC holders
      var foePowers = {};
      (state.map.adjacency[u.at] || []).forEach(function (nx) {
        var e = occ[nx];
        if (e && e.power !== me) foePowers[e.power] = true;
      });
      var foes = Object.keys(foePowers);
      if (!foes.length) return;
      // Spring holding is free; shield only against proven attackers
      // or overwhelming rings. Autumn holders get steadier cover.
      var need = foes.some(function (p) { return (MEM.hostile[p] || 0) > 0; });
      if (!need) need = isAutumn ? foes.length >= 2 : foes.length >= 3;
      if (!need) return;
      var sup2 = legalSupporter(state, plan, free.slice().sort(cmp), u.at, 'hold', null);
      if (sup2) {
        plan[sup2] = { unit: sup2, type: 'support', target: u.at, targetDest: 'hold' };
        unfree(sup2);
      }
    });

    return mine.map(function (u) { return plan[u.at]; });
  }

  function computeRetreats(state) {
    var occ = {};
    state.units.forEach(function (u) { occ[u.at] = u; });
    var isAutumn = state.season === 'Autumn';
    var scored = state.retreats
      .filter(function (r) { return r.power === state.you; })
      .map(function (r) {
        var opts = (r.options || []).map(function (dest) {
          var s = 0;
          var o = Object.hasOwn(state.owners, dest) ? state.owners[dest] : undefined;
          if (o !== undefined && o !== state.you) s += isAutumn ? 90 : 60;
          else if (o === state.you) s += 5;
          var foes = 0, friends = 0;
          (state.map.adjacency[dest] || []).forEach(function (nx) {
            var e = occ[nx];
            if (e && e.power !== state.you) foes++;
            else if (e && e.power === state.you) friends++;
          });
          s -= foes * 8;
          s += friends * 4;
          return { dest: dest, score: s };
        }).sort(function (a, b) { return b.score - a.score || cmp(a.dest, b.dest); });
        return { at: r.at, opts: opts };
      })
      .sort(function (a, b) {
        return a.opts.length - b.opts.length || cmp(a.at, b.at);
      });
    var out = {};
    var taken = {};
    scored.forEach(function (r) {
      var pick = null;
      for (var i = 0; i < r.opts.length; i++) {
        if (!taken[r.opts[i].dest]) { pick = r.opts[i].dest; break; }
      }
      if (pick === null) pick = r.opts.length ? r.opts[0].dest : null;
      // If even the best collides, disband rather than double-disband... a
      // collision disbands both, so taking a free worse option is better.
      // pick above already prefers free; no null fallback unless no options.
      if (pick !== null && taken[pick]) {
        var freeOpt = null;
        for (var k = 0; k < r.opts.length; k++) {
          if (!taken[r.opts[k].dest]) { freeOpt = r.opts[k].dest; break; }
        }
        pick = freeOpt; // null only when no options at all
        if (pick === null) {
          // every option taken: choose least-bad anyway (both disband) --
          // keep the top option.
          pick = r.opts[0].dest;
        }
      }
      if (pick !== null) taken[pick] = true;
      out[r.at] = pick;
    });
    return out;
  }

  function computeBuilds(state) {
    var me = state.you;
    var mine = ownUnits(state);
    var delta = (state.centresByPower[me] || 0) - mine.length;
    if (delta < 0) {
      var occ = {};
      state.units.forEach(function (u) { occ[u.at] = u; });
      var prizeSC = Object.keys(state.owners).filter(function (id) {
        return state.owners[id] !== me;
      });
      var ranked = mine.map(function (u) {
        var keep = 0;
        if (state.owners[u.at] === me) keep += 100;
        else if (Object.hasOwn(state.owners, u.at)) keep += 30;
        var foes = 0;
        (state.map.adjacency[u.at] || []).forEach(function (nx) {
          if (occ[nx] && occ[nx].power !== me) foes++;
        });
        keep += Math.min(foes, 2) * 10;
        var dmap = distMap(state, u, prizeSC.length ? prizeSC : [u.at]);
        var d = dmap[u.at];
        if (d === undefined || d === Infinity) keep -= 50;
        else keep -= d;
        return { at: u.at, keep: keep };
      }).sort(function (a, b) { return a.keep - b.keep || cmp(a.at, b.at); });
      return ranked.slice(0, -delta).map(function (r) { return { disband: r.at }; });
    }
    if (delta === 0) return [];
    var occ2 = {};
    state.units.forEach(function (u) { occ2[u.at] = u; });
    var fleets = mine.filter(function (u) { return u.type === 'fleet'; }).length;
    var spots = state.map.provinces
      .filter(function (p) {
        return p.home === me && state.owners[p.id] === me && !occ2[p.id];
      })
      .map(function (p) {
        var foes = 0;
        (state.map.adjacency[p.id] || []).forEach(function (nx) {
          if (occ2[nx] && occ2[nx].power !== me) foes++;
        });
        return { p: p, foes: foes };
      })
      .sort(function (a, b) { return a.foes - b.foes || cmp(a.p.id, b.p.id); });
    var out = [];
    for (var i = 0; i < spots.length && out.length < delta; i++) {
      var type = 'army';
      if (spots[i].p.coastal && fleets < mine.length / 3 && fleets < 2) {
        type = 'fleet';
        fleets++;
      }
      out.push({ type: type, at: spots[i].p.id });
    }
    return out;
  }

  function computePropose(state) {
    updateMemory(state);
    var others = livingOthers(state);
    if (!others.length) return [];
    var occ = {};
    state.units.forEach(function (u) { occ[u.at] = u; });
    var lead = leaderOf(state);
    var target = currentTarget(state, occ, lead);
    var pressure = pressureMap(state, occ);
    var out = [];
    // Peace with everyone except the mark: hands stay free where it counts.
    var friends = others
      .filter(function (p) { return p !== target && (MEM.hostile[p] || 0) === 0; })
      .sort(function (a, b) {
        return ((pressure[b] || 0) - (pressure[a] || 0)) || cmp(a, b);
      });
    friends.slice(0, 5).forEach(function (p) {
      out.push({ to: p, type: 'peace', terms: {} });
    });
    // Aim a rival at the mark (or the runaway leader): no obligation, and
    // sometimes their greed does our work.
    var aim = target || (lead.power && lead.power !== state.you && lead.centres >= 5 ? lead.power : null);
    if (aim && out.length < 6) {
      var hammer = others
        .filter(function (p) { return p !== aim; })
        .sort(function (a, b) {
          return ((state.centresByPower[b] || 0) - (state.centresByPower[a] || 0)) || cmp(a, b);
        })[0];
      if (hammer) out.push({ to: hammer, type: 'alliance', terms: { target: aim } });
    }
    return out.slice(0, 6);
  }

  function computeAnswer(state) {
    updateMemory(state);
    var occ = {};
    state.units.forEach(function (u) { occ[u.at] = u; });
    var target = currentTarget(state, occ, leaderOf(state));
    var out = {};
    (state.inbox || []).forEach(function (p) {
      var verdict = 'reject';
      if (p.from === target) {
        // Never promise the mark anything: we hit them regardless.
        verdict = p.type === 'support' ? 'accept' : 'reject';
      } else if (p.type === 'dmz') {
        // A DMZ I cannot physically reach this season is free trust.
        var prov = p.terms.province;
        var reachable = ownUnits(state).some(function (u) {
          return (state.map.adjacency[u.at] || []).indexOf(prov) >= 0;
        });
        if (!reachable) verdict = 'accept';
      } else if (p.type === 'peace' || p.type === 'alliance') {
        if (isLiving(state, p.from) && (MEM.hostile[p.from] || 0) === 0) verdict = 'accept';
      } else if (p.type === 'support') {
        verdict = 'accept'; // their promise to help us: free value
      } else if (p.type === 'request-support') {
        // Accept only if we can actually issue the matching support.
        var ok = ownUnits(state).some(function (u) {
          return (state.legalOrders[u.at] || []).some(function (o) {
            return o.type === 'support' && o.target === p.terms.unit &&
              o.targetDest === p.terms.dest;
          });
        });
        if (ok) verdict = 'accept';
      }
      // dmz: always reject -- it only restricts our expansion.
      out[p.id] = verdict;
    });
    return out;
  }

  module.exports = {
    name: 'Pact Fox',
    propose: function (state) {
      try { return computePropose(state); } catch (e) { return []; }
    },
    answer: function (state) {
      try { return computeAnswer(state); } catch (e) { return {}; }
    },
    orders: function (state) {
      try {
        updateMemory(state);
        return computeOrders(state);
      } catch (e) {
        try {
          return ownUnits(state).map(function (u) { return { unit: u.at, type: 'hold' }; });
        } catch (e2) { return []; }
      }
    },
    retreats: function (state) {
      try { return computeRetreats(state); } catch (e) { return {}; }
    },
    builds: function (state) {
      try { return computeBuilds(state); } catch (e) { return []; }
    }
  };
})();
