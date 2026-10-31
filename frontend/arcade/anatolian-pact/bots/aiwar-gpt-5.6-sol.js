(function () {
  'use strict';

  var POWERS = ['Phrygia', 'Lydia', 'Caria', 'Bithynia', 'Galatia', 'Cilicia'];

  function ownUnits(state) {
    return state.units.filter(function (u) { return u.power === state.you; });
  }
  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function occMap(state) {
    var m = {};
    state.units.forEach(function (u) { m[u.at] = u; });
    return m;
  }
  function isSC(state, id) { return Object.hasOwn(state.owners, id); }
  function living(state, p) {
    return p !== state.you &&
      (state.centresByPower[p] > 0 || state.units.some(function (u) { return u.power === p; }));
  }
  function leader(state) {
    var best = null, bestN = -1;
    POWERS.forEach(function (p) {
      var n = state.centresByPower[p] || 0;
      if (n > bestN || (n === bestN && best !== null && cmp(p, best) < 0)) { best = p; bestN = n; }
    });
    return { power: best, centres: bestN };
  }
  function weakest(state) {
    var worst = null, worstN = 1e9;
    POWERS.forEach(function (p) {
      if (p === state.you) return;
      if (!living(state, p)) return;
      var n = state.centresByPower[p] || 0;
      if (n < worstN || (n === worstN && worst !== null && cmp(p, worst) < 0)) { worst = p; worstN = n; }
    });
    return worst;
  }
  function endgame(state) {
    var maxY = (state.limits && state.limits.maxYears) || 12;
    return state.year >= maxY - 1;
  }
  // BFS distance (adjacency graph) from province to nearest province satisfying pred.
  function bfsDist(state, from, pred) {
    if (pred(from)) return 0;
    var seen = {}, q = [[from, 0]], i = 0;
    seen[from] = true;
    while (i < q.length) {
      var cur = q[i][0], d = q[i][1]; i++;
      var adj = state.map.adjacency[cur] || [];
      for (var k = 0; k < adj.length; k++) {
        var nx = adj[k];
        if (seen[nx]) continue;
        seen[nx] = true;
        if (pred(nx)) return d + 1;
        q.push([nx, d + 1]);
      }
    }
    return 99;
  }

  function grudges(state) {
    var me = state.you, g = {};
    POWERS.forEach(function (p) {
      if (p === me) return;
      var t = state.trust[p];
      if (t && t.broken > 0) g[p] = true;
    });
    // powers that dislodged my current retreaters
    (state.retreats || []).forEach(function (r) {
      (state.history || []).forEach(function (h) {
        (h.resolution || []).forEach(function (o) {
          if (o.power !== me && o.type === 'move' && o.dest === r.at &&
            (o.outcome === 'success' || o.outcome === 'dislodged')) g[o.power] = true;
        });
      });
    });
    // powers that moved into my currently-held provinces or my homes
    var mine = {};
    state.units.forEach(function (u) { if (u.power === me) mine[u.at] = true; });
    (state.history || []).forEach(function (h) {
      Object.keys(h.orders || {}).forEach(function (p) {
        if (p === me) return;
        (h.orders[p] || []).forEach(function (o) {
          if (o.type === 'move' && (mine[o.dest] || homeOf(state, o.dest) === me)) g[p] = true;
        });
      });
    });
    return g;
  }
  // max effective supports this power has ever stacked on one attack (history).
  // Samples never stack more than one; default assumption is str <= 2.
  function maxStack(state, power) {
    var m = 0;
    (state.history || []).forEach(function (h) {
      var byTarget = {};
      (h.resolution || []).forEach(function (r) {
        if (r && r.power === power && r.type === 'support' && r.effective) {
          var k = r.target + '>' + r.targetDest;
          byTarget[k] = (byTarget[k] || 0) + 1;
          if (byTarget[k] > m) m = byTarget[k];
        }
      });
    });
    return Math.max(m, 1);
  }
  function homeOf(state, id) {
    var provs = state.map.provinces || [];
    for (var i = 0; i < provs.length; i++) if (provs[i].id === id) return provs[i].home;
    return null;
  }
  // restraint penalty for attacking power p's units: 0 = fair game
  // recapture of my own squatted centres is handled separately (never penalised)
  function restraint(state, p, G, L, end, meCentres) {
    if (p === state.you) return 1000;
    if (end || G[p]) return 0;
    if (L.power !== state.you && p === L.power && L.centres >= 10) return 0;
    if (state.year <= 1) {
      var theirs = state.centresByPower[p] || 0;
      return theirs > meCentres ? 20 : 50; // year 1: honour, but may punch up
    }
    if (state.year <= 2) return 25;
    return 12; // mid-game: prefer but do not forbid profitable attacks
  }
  // destinations where my identical move bounced last season (likely standoff)
  function contestedDests(state) {
    var hs = state.history || [];
    var h = hs[hs.length - 1];
    var s = {};
    if (!h) return s;
    var bounced = {};
    (h.resolution || []).forEach(function (r) {
      if (r && r.power === state.you && r.type === 'move' && r.outcome === 'bounce') {
        bounced[r.unit + '|' + r.dest] = true;
      }
    });
    ((h.orders || {})[state.you] || []).forEach(function (o) {
      if (o && o.type === 'move' && bounced[o.unit + '|' + o.dest]) s[o.dest + '|' + o.unit] = true;
    });
    return s;
  }
  function myPromises(state) {
    var peace = {}, dmz = {}, sup = [];
    (state.accepted || []).forEach(function (pr) {
      if (pr.power !== state.you) return;
      if (pr.type === 'peace' || pr.type === 'alliance') peace[pr.partner] = true;
      else if (pr.type === 'dmz') dmz[pr.terms.province] = true;
      else if (pr.type === 'support') sup.push(pr);
    });
    return { peace: peace, dmz: dmz, sup: sup };
  }

  var MEM = { backtrack: {} }; // dest exclusions keyed by origin, from our last orders

  function orders(state) {
    var me = state.you;
    var mine = ownUnits(state);
    var occ = occMap(state);
    var P = myPromises(state);
    var L = leader(state);
    var end = endgame(state);
    var G = grudges(state);
    var autumn = state.season === 'Autumn';
    var meCentres = state.centresByPower[me] || 0;
    var contested = contestedDests(state);
    // my centres occupied by the enemy (need recapture)
    var squatted = {};
    Object.keys(state.owners).forEach(function (sc) {
      if (state.owners[sc] === me && occ[sc] && occ[sc].power !== me) squatted[sc] = true;
    });
    // provinces next to my held centres: attacking an enemy there disrupts
    // assaults on my homes (head-to-head meets bounce, saving the centre)
    var ward = {};
    mine.forEach(function (u) {
      if (isSC(state, u.at) && state.owners[u.at] === me) {
        (state.map.adjacency[u.at] || []).forEach(function (nx) {
          var o = occ[nx];
          if (o && o.power !== me) ward[nx] = true;
        });
      }
    });

    var plan = {};
    mine.forEach(function (u) { plan[u.at] = { unit: u.at, type: 'hold' }; });
    var reserved = {};

    function free(at) { return plan[at] && plan[at].type === 'hold'; }
    function canSupport(supporterAt, targetAt, dest) {
      var legals = state.legalOrders[supporterAt] || [];
      for (var i = 0; i < legals.length; i++) {
        var o = legals[i];
        if (o.type === 'support' && o.target === targetAt &&
          (o.targetDest === dest || (dest === targetAt && o.targetDest === 'hold'))) return true;
      }
      return false;
    }
    function supportersFor(targetAt, dest, exclude) {
      return mine.filter(function (u) {
        return u.at !== targetAt && u.at !== exclude && free(u.at) && !mustHold(u) && canSupport(u.at, targetAt, dest);
      });
    }

    // ---- 1. Offense pass 1: walk into UNOCCUPIED capturable centres ----
    function dCapFrom(p) {
      return bfsDist(state, p, function (q) {
        // centres to take: not mine and not held by me, plus squatted homes
        return squatted[q] ||
          (isSC(state, q) && state.owners[q] !== me && (!occ[q] || occ[q].power !== me));
      });
    }
    function dLeadFrom(p) {
      if (L.power === me) return 0;
      return bfsDist(state, p, function (q) {
        return isSC(state, q) && state.owners[q] === L.power;
      });
    }
    // Cyprus (Ξ) is reachable only by fleet and samples never build fleets:
    // an uncontested centre for a committed fleet once we can spare one.
    var cyprusMission = state.owners['Ξ'] !== me && mine.length >= 4 &&
      Object.keys(squatted).length === 0;
    function moveValue(unit, dest) {
      var occU = occ[dest] || null;
      var owner = isSC(state, dest) ? state.owners[dest] : undefined;
      var sc = isSC(state, dest);
      var ownersMine = sc && owner === me;
      var v = 0;
      if (sc && owner !== me) {
        if (!occU) v += (owner === null || owner === undefined ? 60 : 45);
        else if (occU.power !== me) v += 30;
        else v -= 100;
      } else if (sc && owner === me) {
        if (!occU) v -= 8; // avoid shuffling onto own held SC
        else if (occU.power === me) v -= 100;
        else v += 55; // recapture: enemy squatting on my centre
      } else {
        v += occU ? -100 : 2;
      }
      if (occU && occU.power !== me) {
        if (P.peace[occU.power] && ownersMine) { /* recapture: no penalty */ }
        else if (P.peace[occU.power]) v -= restraint(state, occU.power, G, L, end, meCentres);
        // gang up on the leader
        if (occU.power === L.power && L.power !== me) v += 12;
        // vulture the weakest while no one threatens a solo (grow first)
        if (L.centres < 9 && occU.power === weakest(state)) v += 8;
        // disruption: meet enemies massing next to my held centres
        if (ward[dest]) v += 40;
        // retaliate and punish serial betrayers
        if (G[occU.power]) v += 15;
        var t = state.trust[occU.power];
        if (t && t.broken > t.kept + 1) v += 6;
      }
      if (!occU && owner !== undefined && owner !== me && owner !== null && P.peace[owner] &&
        state.year <= 2 && !end && !G[owner]) v -= 20;
      if (P.dmz[dest] && !end) return -1000; // honor DMZ except endgame
      // positioning: closer to capturable SCs is better
      v += Math.max(0, 8 - dCapFrom(dest));
      // path home: stage next to squatted centres for recapture
      v += stagingBonus(dest);
      // blob: stay within mutual-support distance of other own units
      var nearFriend = state.units.some(function (e) {
        return e.power === me && e.at !== unit.at && (state.map.adjacency[dest] || []).indexOf(e.at) >= 0;
      });
      if (nearFriend) v += 4;
      // drift toward the leader's territory late / when idle
      if (!sc || occU) {
        var dl0 = dLeadFrom(unit.at), dl1 = dLeadFrom(dest);
        if (dl1 < dl0) v += 4;
        else if (dl1 > dl0) v -= 2;
      }
      // Cyprus mission: fleets approach the uncontested island centre
      if (cyprusMission && unit.type === 'fleet') {
        var dc0 = bfsDist(state, unit.at, function (q) { return q === 'Ξ'; });
        var dc1 = bfsDist(state, dest, function (q) { return q === 'Ξ'; });
        if (dc1 < dc0) v += 25;
      }
      // Autumn: leaving a held owned SC is costly unless capturing
      if (autumn && isSC(state, unit.at) && state.owners[unit.at] === me && !(sc && owner !== me)) v -= 15;
      return v;
    }

    var cands = [];
    mine.forEach(function (u) {
      if (!free(u.at)) return;
      var legals = state.legalOrders[u.at] || [];
      legals.forEach(function (o) {
        if (o.type !== 'move') return;
        if (occ[o.dest] && occ[o.dest].power === me) return;
        var v = moveValue(u, o.dest);
        if (v <= -1000) return;
        cands.push({ unit: u, dest: o.dest, value: v, occupied: !!(occ[o.dest]) });
      });
    });
    cands.sort(function (a, b) {
      return (b.value - a.value) || cmp(a.unit.at, b.unit.at) || cmp(a.dest, b.dest);
    });

    // In Autumn, a unit sitting on a capturable SC stays unless a big prize calls.
    function shouldStay(unit) {
      return autumn && isSC(state, unit.at) && state.owners[unit.at] !== me;
    }
    // In Autumn, vacating an owned SC with an enemy next to it gifts the
    // centre: the enemy walks in the same season. Hold instead.
    function mustHold(unit) {
      if (!autumn || !isSC(state, unit.at) || state.owners[unit.at] !== me) return false;
      var adj = state.map.adjacency[unit.at] || [];
      return state.units.some(function (e) { return e.power !== me && adj.indexOf(e.at) >= 0; });
    }

    // ---- 0. Shared scouting: staging helper (squatted computed above) ----
    function stagingBonus(dest) {
      var adj = state.map.adjacency[dest] || [];
      for (var i = 0; i < adj.length; i++) if (squatted[adj[i]]) return 10;
      return 0;
    }

    function ownThreatened(unit) {
      if (!isSC(state, unit.at) || state.owners[unit.at] !== me) return false;
      var adj = state.map.adjacency[unit.at] || [];
      return state.units.some(function (e) { return e.power !== me && adj.indexOf(e.at) >= 0; });
    }

    // ---- A. Counterattacks: recapture squatted centres, disrupt adjacent foes ----
    cands.forEach(function (c) {
      if (!c.occupied) return;
      if (!free(c.unit.at)) return;
      if (mustHold(c.unit)) return;
      if (reserved[c.dest]) return;
      var recapture = !!squatted[c.dest];
      var disrupt = !!(occ[c.dest] && occ[c.dest].power !== me && ward[c.dest]);
      if (!recapture && !disrupt) return;
      if (c.value < 10 && !recapture) return;
      if (shouldStay(c.unit)) return;
      var defender = occ[c.dest];
      if (!defender || defender.power === me) return;
      var adj = state.map.adjacency[c.dest] || [];
      var defSup = state.units.filter(function (e) {
        return e.power === defender.power && e.at !== c.dest && adj.indexOf(e.at) >= 0;
      }).length;
      var defence = 1 + Math.min(defSup, maxStack(state, defender.power));
      var helpers = supportersFor(c.unit.at, c.dest, c.dest);
      var myStr = 1 + helpers.length;
      // recapture needs strict superiority (a bounce leaves the squatter in
      // place); disruption works on parity through head-to-head bounces.
      // Only same-power supporters are counted: sample bots never cross-support.
      // Stacking is capped by observed behaviour (default str <= 2).
      if (recapture ? (myStr > defence) : (myStr >= defence)) {
        plan[c.unit.at] = { unit: c.unit.at, type: 'move', dest: c.dest };
        reserved[c.dest] = true;
        var need = recapture ? defence : Math.max(0, defence - 1);
        for (var i = 0; i < need && i < helpers.length; i++) {
          plan[helpers[i].at] = { unit: helpers[i].at, type: 'support', target: c.unit.at, targetDest: c.dest };
        }
      }
    });

    // Pass B: unoccupied destinations only.
    cands.forEach(function (c) {
      if (c.occupied) return;
      if (!free(c.unit.at)) return;
      if (mustHold(c.unit)) return;
      if (reserved[c.dest]) return;
      if (c.value < 3) return;
      if (shouldStay(c.unit) && c.value < 70) return;
      if (MEM.backtrack[c.unit.at] === c.dest) return; // no immediate ping-pong
      var sc = isSC(state, c.dest);
      if (!sc && dCapFrom(c.dest) > dCapFrom(c.unit.at)) return; // wandering must approach a target
      // cohesion: a threatened home is only left to capture another centre;
      // a safe one may also stage through open ground toward a target.
      // Pointless garrison shuffles between my own centres are never useful.
      var fromOwned = isSC(state, c.unit.at) && state.owners[c.unit.at] === me;
      if (fromOwned && sc && state.owners[c.dest] === me && !occ[c.dest]) return;
      if (fromOwned && ownThreatened(c.unit) && !(sc && state.owners[c.dest] !== me)) return;
      if (contested[c.dest + '|' + c.unit.at]) {
        // walked into a standoff last season: only retry with a supporter ready
        var help = supportersFor(c.unit.at, c.dest, c.dest);
        if (!help.length) return;
        plan[c.unit.at] = { unit: c.unit.at, type: 'move', dest: c.dest };
        reserved[c.dest] = true;
        plan[help[0].at] = { unit: help[0].at, type: 'support', target: c.unit.at, targetDest: c.dest };
        return;
      }
      plan[c.unit.at] = { unit: c.unit.at, type: 'move', dest: c.dest };
      reserved[c.dest] = true;
    });

    // ---- 2. Defense: support the stayers facing supported attacks.
    // Pass 1 already moved capture-bound holders; supporting an emptied
    // province is useless, so only holders still at home are defended.
    // Every supporter of an attack on my SC must stand adjacent to it, so
    // 2+ adjacent enemies exactly means a supported (str 2+) attack is possible.
    (function () {
      var bestMove = {};
      mine.forEach(function (u) {
        var b = -1e9;
        (state.legalOrders[u.at] || []).forEach(function (o) {
          if (o.type !== 'move' || (occ[o.dest] && occ[o.dest].power === me)) return;
          var v = moveValue(u, o.dest);
          if (v > b) b = v;
        });
        bestMove[u.at] = b;
      });
      var stayers = mine.filter(function (u) {
        return free(u.at) && isSC(state, u.at) && state.owners[u.at] === me;
      }).map(function (u) {
        var adj = state.map.adjacency[u.at] || [];
        var foes = state.units.filter(function (e) { return e.power !== me && adj.indexOf(e.at) >= 0; });
        return { unit: u, threats: foes.length, foes: foes };
      }).filter(function (h) { return h.threats >= 2; })
        .sort(function (a, b) { return (b.threats - a.threats) || cmp(a.unit.at, b.unit.at); });
      stayers.forEach(function (h) {
        var credible = autumn || state.year <= 2 ||
          h.foes.some(function (f) { return G[f.power]; });
        if (!credible) return;
        var helpers = mine.filter(function (u) {
          return u.at !== h.unit.at && free(u.at) && !mustHold(u) && canSupport(u.at, h.unit.at, h.unit.at);
        }).sort(function (a, b) { return (bestMove[a.at] - bestMove[b.at]) || cmp(a.at, b.at); });
        var need = Math.min(h.threats - 1, helpers.length);
        for (var i = 0; i < need; i++) {
          plan[helpers[i].at] = { unit: helpers[i].at, type: 'support', target: h.unit.at, targetDest: 'hold' };
        }
      });
    })();

    // ---- C. Remaining attacks on occupied provinces (strict superiority) ----
    cands.forEach(function (c) {
      if (!c.occupied) return;
      if (!free(c.unit.at)) return;
      if (mustHold(c.unit)) return;
      if (reserved[c.dest]) return;
      if (c.value < 10) return;
      if (shouldStay(c.unit)) return;
      var defender = occ[c.dest];
      if (!defender || defender.power === me) return;
      var adj = state.map.adjacency[c.dest] || [];
      var defSup = state.units.filter(function (e) {
        return e.power === defender.power && e.at !== c.dest && adj.indexOf(e.at) >= 0;
      }).length;
      var defence = 1 + Math.min(defSup, maxStack(state, defender.power));
      var helpers = supportersFor(c.unit.at, c.dest, c.dest);
      if (1 + helpers.length > defence) {
        plan[c.unit.at] = { unit: c.unit.at, type: 'move', dest: c.dest };
        reserved[c.dest] = true;
        for (var i = 0; i < defence && i < helpers.length; i++) {
          plan[helpers[i].at] = { unit: helpers[i].at, type: 'support', target: c.unit.at, targetDest: c.dest };
        }
      }
    });

    // ---- 4. Honor outgoing support promises with leftover units ----
    P.sup.forEach(function (pr) {
      var t = pr.terms.unit, d = pr.terms.dest;
      var dest = (d === 'hold') ? t : d;
      var cand = mine.filter(function (u) { return free(u.at) && !mustHold(u) && canSupport(u.at, t, dest); });
      if (cand.length) {
        cand.sort(function (a, b) { return cmp(a.at, b.at); });
        plan[cand[0].at] = { unit: cand[0].at, type: 'support', target: t, targetDest: d };
      }
    });

    // ---- 5. Reinforce our own planned attacks on occupied provinces ----
    mine.forEach(function (u) {
      if (!free(u.at) || mustHold(u)) return;
      var best = null;
      mine.forEach(function (m) {
        var po = plan[m.at];
        if (!po || po.type !== 'move' || !occ[po.dest]) return;
        if (canSupport(u.at, m.at, po.dest)) {
          if (best === null || cmp(po.dest, best) < 0) best = po.dest;
        }
      });
      if (best !== null) {
        var mover = mine.filter(function (m) {
          var po = plan[m.at];
          return po && po.type === 'move' && po.dest === best;
        })[0];
        var mo = plan[mover.at];
        plan[u.at] = { unit: u.at, type: 'support', target: mover.at, targetDest: mo.dest };
      }
    });

    var result = mine.map(function (u) { return plan[u.at]; });
    var bt = {};
    result.forEach(function (o) {
      if (o && o.type === 'move') bt[o.dest] = o.unit;
    });
    MEM.backtrack = bt;
    return result;
  }

  function retreats(state) {
    var out = {};
    state.retreats.forEach(function (u) {
      var best = null, bestScore = -1e9;
      (u.options || []).forEach(function (opt) {
        var s = 0;
        if (isSC(state, opt)) s += (state.owners[opt] === state.you ? 12 : 8);
        var provs = state.map.provinces || [];
        var home = null;
        for (var i = 0; i < provs.length; i++) if (provs[i].id === opt) { home = provs[i].home; break; }
        if (home === state.you) s += 5;
        var enemies = state.units.filter(function (e) {
          return e.power !== state.you && (state.map.adjacency[e.at] || []).indexOf(opt) >= 0;
        }).length;
        s -= enemies * 4;
        var dHome = bfsDist(state, opt, function (p) {
          for (var j = 0; j < provs.length; j++) {
            if (provs[j].id === p && provs[j].home === state.you) return true;
          }
          return false;
        });
        s -= Math.min(dHome, 10);
        if (s > bestScore || (s === bestScore && (best === null || cmp(opt, best) < 0))) {
          bestScore = s; best = opt;
        }
      });
      out[u.at] = best || null;
    });
    return out;
  }

  function builds(state) {
    var me = state.you;
    var mine = ownUnits(state);
    var delta = (state.centresByPower[me] || 0) - mine.length;
    if (delta === 0) return [];
    if (delta < 0) {
      // Disband least useful: off-SC, far from homes, exposed first.
      var provs = state.map.provinces || [];
      function homeOf(id) {
        for (var i = 0; i < provs.length; i++) if (provs[i].id === id) return provs[i].home;
        return null;
      }
      var scored = mine.map(function (u) {
        var s = 0;
        if (isSC(state, u.at) && state.owners[u.at] === me) s += 20;
        else if (isSC(state, u.at)) s += 8;
        if (homeOf(u.at) === me) s += 5;
        var friends = state.units.filter(function (e) {
          return e.power === me && e.at !== u.at && (state.map.adjacency[e.at] || []).indexOf(u.at) >= 0;
        }).length;
        s += friends;
        return { at: u.at, s: s };
      });
      scored.sort(function (a, b) { return (a.s - b.s) || cmp(a.at, b.at); });
      return scored.slice(0, -delta).map(function (x) { return { disband: x.at }; });
    }
    // Builds: only empty still-owned homes.
    var provById = {};
    (state.map.provinces || []).forEach(function (p) { provById[p.id] = p; });
    var occ = occMap(state);
    var fleets = mine.filter(function (u) { return u.type === 'fleet'; }).length;
    var spots = (state.map.provinces || []).filter(function (p) {
      return p.home === me && state.owners[p.id] === me && !occ[p.id];
    }).sort(function (a, b) { return cmp(a.id, b.id); }).slice(0, delta);
    return spots.map(function (p) {
      var wantFleet = !!p.coastal && fleets < Math.ceil(mine.length / 3);
      if (wantFleet) fleets++;
      return { type: wantFleet ? 'fleet' : 'army', at: p.id };
    });
  }

  function propose(state) {
    var me = state.you;
    var out = [];
    var mine = ownUnits(state);
    // neighbours: powers owning or occupying adjacent provinces
    var occ = occMap(state);
    var adj = {};
    mine.forEach(function (u) {
      (state.map.adjacency[u.at] || []).forEach(function (nx) {
        var o = occ[nx];
        if (o && o.power !== me) adj[o.power] = true;
        if (isSC(state, nx) && state.owners[nx] && state.owners[nx] !== me) adj[state.owners[nx]] = true;
      });
    });
    var L = leader(state);
    var foes = POWERS.filter(function (p) { return living(state, p); });
    var allies = foes.filter(function (p) { return adj[p]; })
      .sort(function (a, b) { return cmp(a, b); });
    // From year 3 on we will attack when profitable: make no new peace
    // promises we would break. Only coordinate against a runaway leader.
    if (state.year > 2) {
      if (L.power !== me && L.centres >= 8 && allies.length) {
        var partner = null;
        for (var i = 0; i < allies.length; i++) {
          if (allies[i] !== L.power) { partner = allies[i]; break; }
        }
        if (partner) out.push({ to: partner, type: 'alliance', terms: { target: L.power } });
      }
      return out;
    }
    // alliance with a neighbour against the leader (not against ourselves / non-living)
    if (L.power !== me && L.centres >= 4 && allies.length) {
      var partner = null;
      for (var i = 0; i < allies.length; i++) {
        if (allies[i] !== L.power) { partner = allies[i]; break; }
      }
      if (partner) out.push({ to: partner, type: 'alliance', terms: { target: L.power } });
    }
    // peace with the rest of the neighbours (max 6 total)
    foes.filter(function (p) { return adj[p]; }).sort(function (a, b) { return cmp(a, b); })
      .forEach(function (p) {
        if (out.length >= 6) return;
        if (out.some(function (o) { return o.to === p; })) return;
        out.push({ to: p, type: 'peace', terms: {} });
      });
    return out.slice(0, 6);
  }

  function answer(state) {
    var out = {};
    var P = myPromises(state);
    var early = state.year <= 2;
    state.inbox.forEach(function (pr) {
      var ok = false;
      if (pr.type === 'peace' || pr.type === 'alliance') ok = early;
      else if (pr.type === 'dmz') {
        // reject DMZ on anything we might want: our provinces or any
        // capturable centre (a DMZ there would block expansion or be broken)
        var mine = ownUnits(state).some(function (u) { return u.at === pr.terms.province; });
        var owned = state.owners[pr.terms.province] === state.you;
        var target = isSC(state, pr.terms.province) && state.owners[pr.terms.province] !== state.you;
        ok = early && !(mine || owned || target);
      } else if (pr.type === 'support' || pr.type === 'request-support') {
        var beneficiary = pr.type === 'support' ? pr.from : state.you;
        var maker = pr.type === 'support' ? state.you : pr.to;
        void beneficiary; void maker;
        // accept if the promised support is currently legal for the maker
        var t = pr.terms.unit, d = pr.terms.dest;
        var dest = (d === 'hold') ? t : d;
        var units = state.units;
        var target = units.filter(function (u) { return u.at === t; })[0];
        var canDo = false;
        if (target) {
          var supporters = units.filter(function (u) {
            return pr.type === 'support' ? (u.power === state.you) : (u.power === pr.to);
          });
          canDo = supporters.some(function (s) {
            var legals = state.legalOrders[s.at] || [];
            if (pr.type !== 'support') return false; // request-support: maker is them; check roughly via adjacency
            return legals.some(function (o) {
              return o.type === 'support' && o.target === t &&
                (o.targetDest === d || (d === 'hold' && o.targetDest === 'hold'));
            });
          }) || pr.type === 'request-support';
        }
        void dest;
        // never support an attack into our own units, nor a hold we will break
        var suicide = target && target.power !== state.you &&
          ((d !== 'hold' && occMap(state)[d] && occMap(state)[d].power === state.you));
        ok = canDo && !P.dmz[t] && !suicide;
      }
      // don't stack duplicate peace obligations with same partner
      if ((pr.type === 'peace' || pr.type === 'alliance') && P.peace[pr.from]) ok = false;
      out[pr.id] = ok ? 'accept' : 'reject';
    });
    return out;
  }

  module.exports = {
    name: 'Anatolian Fox',
    propose: propose,
    answer: answer,
    orders: orders,
    retreats: retreats,
    builds: builds
  };
})();
