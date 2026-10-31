(function () {
  'use strict';

  var POWERS = ['Phrygia', 'Lydia', 'Caria', 'Bithynia', 'Galatia', 'Cilicia'];

  function livingPowers(state) {
    return POWERS.filter(function (p) {
      return p !== state.you &&
        ((state.centresByPower && state.centresByPower[p]) ||
         state.units.some(function (u) { return u.power === p; }));
    });
  }

  function provById(state) {
    var m = {};
    state.map.provinces.forEach(function (p) { m[p.id] = p; });
    return m;
  }

  function isSC(state, id) {
    return Object.prototype.hasOwnProperty.call(state.owners, id);
  }

  // Local terrain legality mirror (army: land only; fleet: sea or coastal land via shared sea).
  function canStep(state, provs, type, from, dest) {
    var adj = state.map.adjacency[from] || [];
    if (adj.indexOf(dest) < 0) return false;
    var a = provs[from], b = provs[dest];
    if (!a || !b) return false;
    if (type === 'army') return b.type === 'land';
    if (type !== 'fleet') return false;
    if (b.type === 'land' && !b.coastal) return false;
    if (a.type === 'sea' || b.type === 'sea') return true;
    return adj.some(function (s) {
      var sp = provs[s];
      return sp && sp.type === 'sea' && (state.map.adjacency[dest] || []).indexOf(s) >= 0;
    });
  }

  function alliesOf(state) {
    var s = new Set();
    (state.accepted || []).forEach(function (pr) {
      if (pr.type === 'peace' || pr.type === 'alliance') {
        s.add(pr.power === state.you ? pr.partner : pr.power);
      }
    });
    return s;
  }

  function dmzOf(state) {
    var s = new Set();
    (state.accepted || []).forEach(function (pr) {
      if (pr.type === 'dmz') s.add(pr.terms.province);
    });
    return s;
  }

  function untrustworthy(state, p) {
    var t = state.trust && state.trust[p];
    return t && (t.broken > t.kept || t.broken >= 2);
  }

  function leaderOf(state) {
    var best = null, bn = -1;
    POWERS.forEach(function (p) {
      if (p === state.you) return;
      var n = (state.centresByPower && state.centresByPower[p]) || 0;
      if (n > bn) { bn = n; best = p; }
    });
    return { power: best, centres: bn };
  }

  function yearsLeft(state) {
    var max = (state.limits && state.limits.maxYears) || 12;
    return Math.max(1, max - state.year + 1);
  }

  // Powers sharing a border (unit/SC adjacency) with me.
  function adjacentPowers(state) {
    var me = state.you, out = new Set();
    var unitAt = {};
    state.units.forEach(function (u) { unitAt[u.at] = u; });
    var mine = new Set();
    state.units.forEach(function (u) { if (u.power === me) mine.add(u.at); });
    Object.keys(state.owners).forEach(function (p) { if (state.owners[p] === me) mine.add(p); });
    mine.forEach(function (at) {
      ((state.map.adjacency[at]) || []).forEach(function (d) {
        var occ = unitAt[d];
        if (occ && occ.power !== me) out.add(occ.power);
        if (isSC(state, d) && state.owners[d] && state.owners[d] !== me) out.add(state.owners[d]);
      });
    });
    return out;
  }

  // Preferred long-term partner: weak, honest, adjacent, not the leader.
  function pickPartner(state) {
    var lead = leaderOf(state);
    var adj = adjacentPowers(state);
    var best = null, bs = 1e9;
    livingPowers(state).forEach(function (p) {
      if (!adj.has(p)) return;
      if (lead.power && p === lead.power) return;
      if (untrustworthy(state, p)) return;
      var c = (state.centresByPower && state.centresByPower[p]) || 0;
      if (c < bs) { bs = c; best = p; }
    });
    return best;
  }

  function ruthless(state) {
    var max = (state.limits && state.limits.maxYears) || 12;
    var yl = yearsLeft(state);
    if (yl > Math.max(2, Math.ceil(max / 6))) return false;
    var lead = leaderOf(state);
    var myC = (state.centresByPower && state.centresByPower[state.you]) || 0;
    return (lead.centres >= 10) || (myC + 2 >= lead.centres);
  }

  // Score each living enemy as an attack target (allies excluded unless endgame).
  function pickTarget(state) {
    var me = state.you, provs = provById(state);
    var allies = alliesOf(state);
    var ruth = ruthless(state);
    var lead = leaderOf(state);
    var mine = state.units.filter(function (u) { return u.power === me; });
    var unitAt = {};
    state.units.forEach(function (u) { unitAt[u.at] = u; });
    var yl = yearsLeft(state);
    var best = null, bs = -1e9;
    var cands = livingPowers(state).filter(function (p) { return ruth || !allies.has(p); });
    if (!cands.length) cands = livingPowers(state);
    cands.forEach(function (p) {
      var s = 0;
      mine.forEach(function (u) {
        ((state.map.adjacency[u.at]) || []).forEach(function (d) {
          var occ = unitAt[d];
          if (occ && occ.power === p) s += 4;
          if (isSC(state, d) && state.owners[d] === p) s += 3;
          if (isSC(state, d) && !state.owners[d]) s += 1;
        });
      });
      s += ((state.centresByPower && state.centresByPower[p]) || 0) * 1.5;
      if (lead.power === p) s += yl <= 3 ? 12 : 4;
      // vulture bonus: collapsing powers can't defend everything they own
      var punits = state.units.filter(function (u) { return u.power === p; }).length;
      if (punits < ((state.centresByPower && state.centresByPower[p]) || 0)) s += 12;
      var t = state.trust && state.trust[p];
      if (t && t.broken > 0) s += 5 + t.broken * 2;
      void provs;
      if (s > bs) { bs = s; best = p; }
    });
    return best;
  }

  // Exact legal-order lookup so returns always match state.legalOrders.
  function findLegal(state, at, pred) {
    var list = state.legalOrders[at] || [];
    for (var i = 0; i < list.length; i++) {
      if (pred(list[i])) {
        var o = list[i];
        var c = { unit: o.unit, type: o.type };
        if (o.dest !== undefined) c.dest = o.dest;
        if (o.target !== undefined) c.target = o.target;
        if (o.targetDest !== undefined) c.targetDest = o.targetDest;
        return c;
      }
    }
    return null;
  }

  // Enemy units (non-ally) able to step into dest, with their unit type accounted.
  function enemiesAble(state, provs, dest, excludePower) {    var allies = alliesOf(state);
    var out = [];
    state.units.forEach(function (u) {
      if (u.power === state.you || u.power === excludePower) return;
      if (allies.has(u.power)) return;
      if (u.at !== dest && canStep(state, provs, u.type, u.at, dest)) out.push(u);
    });
    return out;
  }

  // Max defence the occupant's power could mount on dest (occupant + same-power supports).
  function maxDefence(state, provs, dest) {
    var unitAt = {};
    state.units.forEach(function (u) { unitAt[u.at] = u; });
    var occ = unitAt[dest];
    if (!occ) return 0;
    var n = 1;
    state.units.forEach(function (u) {
      if (u.power !== occ.power || u.at === dest) return;
      if (canStep(state, provs, u.type, u.at, dest)) n++;
    });
    return n;
  }

  function threatOn(state, provs, at) {
    return enemiesAble(state, provs, at).length;
  }

  // Did anyone show hostile intent toward `at` recently? (enemy move or
  // support-attack aimed at it in the last two resolved seasons)
  function provenThreat(state, at) {
    var hist = state.history || [];
    for (var i = Math.max(0, hist.length - 2); i < hist.length; i++) {
      var orders = (hist[i].orders) || {};
      var found = Object.keys(orders).some(function (p) {
        if (p === state.you) return false;
        return (orders[p] || []).some(function (o) {
          if (o.type === 'move') return o.dest === at;
          if (o.type === 'support' && o.targetDest !== 'hold') return o.targetDest === at;
          return false;
        });
      });
      if (found) return true;
    }
    return false;
  }

  // Distinct non-ally powers with a unit next to my units or centres.
  function pressurers(state) {
    var out = new Set();
    var allies = alliesOf(state);
    var unitAt = {};
    state.units.forEach(function (u) { unitAt[u.at] = u; });
    var mine = new Set();
    state.units.forEach(function (u) { if (u.power === state.you) mine.add(u.at); });
    Object.keys(state.owners).forEach(function (p) {
      if (state.owners[p] === state.you) mine.add(p);
    });
    mine.forEach(function (at) {
      ((state.map.adjacency[at]) || []).forEach(function (d) {
        var occ = unitAt[d];
        if (occ && occ.power !== state.you && !allies.has(occ.power)) out.add(occ.power);
      });
    });
    return Array.from(out);
  }

  // Losing badly: stop defending, gamble everything on attacks.
  function desperate(state, lead) {
    var max = (state.limits && state.limits.maxYears) || 12;
    var myC = (state.centresByPower && state.centresByPower[state.you]) || 0;
    return lead.centres - myC >= 3 ||
      (yearsLeft(state) <= Math.ceil(max / 3) && myC < lead.centres);
  }

  // Ganged up on by 2+ powers: turtle and peel one attacker off.
  function sieged(state) {
    if (desperate(state, leaderOf(state)) || state.year < 3) return false;
    return pressurers(state).length >= 2;
  }

  // Could any of my other units support a move from->dest (static, ignores busyness)?
  function canBeSupported(state, from, dest) {
    var me = state.you;
    return state.units.some(function (u) {
      if (u.power !== me || u.at === from) return false;
      return (state.legalOrders[u.at] || []).some(function (o) {
        return o.type === 'support' && o.target === from && o.targetDest === dest;
      });
    });
  }

  function bestMoveScore(state, provs, unitAt, at, allies, dmz, lead, yl, autumn, respect) {
    var best = -1e9;
    var legals = state.legalOrders[at] || [];
    legals.forEach(function (o) {
      if (o.type !== 'move') return;
      var s = scoreDest(state, provs, unitAt, at, o.dest, allies, dmz, lead, yl, autumn, respect);
      if (s > best) best = s;
    });
    return best;
  }

  function scoreDest(state, provs, unitAt, from, d, allies, dmz, lead, yl, autumn, respect) {
    if (dmz.has(d)) return -1e9;
    var occ = unitAt[d];
    if (occ && occ.power === state.you) return -1e9;
    if (respect && occ && allies.has(occ.power)) return -1e9;
    var sc = isSC(state, d);
    var owner = sc ? state.owners[d] : undefined;
    var s = 0;
    if (sc && owner !== state.you) {
      s += 60;
      if (!owner) {
        s += 8 + (autumn ? 18 : 12); // race for neutrals first
      } else {
        if (autumn && !occ) s += 30;
        if (occ) s += 10;
        // enemy-owned ground: the owner will fight for it; don't throw tempo away solo
        var ownerReturns = !occ && state.units.some(function (u) {
          return u.power === owner && canStep(state, provs, u.type, u.at, d);
        });
        if (ownerReturns) s += canBeSupported(state, from, d) ? -10 : -40;
        if (lead.power && owner === lead.power) s += yl <= 3 ? 25 : 8;
        if (occ && lead.power && occ.power === lead.power) s += yl <= 3 ? 10 : 4;
      }
    } else if (occ && occ.power !== state.you) {
      s += 22;
      if (lead.power && occ.power === lead.power) s += yl <= 3 ? 10 : 4;
    } else if (!sc && !occ) {
      s += 2;
      // staging: only valuable right next to a capturable centre, else don't wander
      var dist = bfsDist(state, d, function (p) {
        return isSC(state, p) && state.owners[p] !== state.you;
      });
      if (dist === 1) s += 4;
      else s -= 12;
    } else if (sc && owner === state.you && !occ) {
      s -= 25;
    }
    if (autumn && sc && state.owners[from] === state.you && owner !== state.you) {
      // leaving a secure own centre to grab another is fine; mild risk otherwise
      s += 0;
    }
    return s;
  }

  function bfsDist(state, start, goal) {
    if (goal(start)) return 0;
    var seen = {}, q = [[start, 0]];
    seen[start] = 1;
    for (var i = 0; i < q.length && i < 400; i++) {
      var at = q[i][0], d = q[i][1];
      var adj = state.map.adjacency[at] || [];
      for (var j = 0; j < adj.length; j++) {
        if (seen[adj[j]]) continue;
        if (goal(adj[j])) return d + 1;
        seen[adj[j]] = 1;
        q.push([adj[j], d + 1]);
      }
    }
    return -1;
  }

  function orderPlan(state) {
    var me = state.you;
    var provs = provById(state);
    var myUnits = state.units.filter(function (u) { return u.power === me; });
    var plan = {};
    myUnits.forEach(function (u) { plan[u.at] = { unit: u.at, type: 'hold' }; });
    if (!myUnits.length) return [];
    var unitAt = {};
    state.units.forEach(function (u) { unitAt[u.at] = u; });
    var allies = alliesOf(state), dmz = dmzOf(state);
    var lead = leaderOf(state), yl = yearsLeft(state);
    var autumn = state.season === 'Autumn';
    var respect = !ruthless(state); // endgame: promises stop blocking captures
    var desp = desperate(state, lead); // losing: attack, don't turtle
    var underSiege = sieged(state); // ganged: turtle, don't overextend
    var busy = {};
    function isFree(at) { return plan[at] && plan[at].type === 'hold' && !busy[at]; }

    // 0. Autumn: units sitting on capturable centres stay to capture.
    var holders = {};
    if (autumn) myUnits.forEach(function (u) {
      if (isSC(state, u.at) && state.owners[u.at] !== me) holders[u.at] = 1;
    });

    // 1. Honour accepted support promises first (issuing keeps the promise).
    (state.accepted || []).filter(function (pr) {
      return pr.power === me && pr.type === 'support';
    }).forEach(function (pr) {
      var cands = myUnits.filter(function (u) {
        return isFree(u.at) && findLegal(state, u.at, function (o) {
          return o.type === 'support' && o.target === pr.terms.unit && o.targetDest === pr.terms.dest;
        });
      });
      cands.sort(function (a, b) {
        var ha = holders[a.at] ? 1 : 0, hb = holders[b.at] ? 1 : 0;
        if (ha !== hb) return ha - hb;
        var ta = threatOn(state, provs, a.at), tb = threatOn(state, provs, b.at);
        if (ta !== tb) return ta - tb; // spend the safest units first
        return a.at < b.at ? -1 : 1;
      });
      if (cands.length) {
        var o = findLegal(state, cands[0].at, function (x) {
          return x.type === 'support' && x.target === pr.terms.unit && x.targetDest === pr.terms.dest;
        });
        if (o) { plan[cands[0].at] = o; busy[cands[0].at] = 1; }
      }
    });

    // 2. Defence: units under real threat hold; bring support-hold help.
    var threat = {};
    myUnits.forEach(function (u) { threat[u.at] = threatOn(state, provs, u.at); });
    // attacker with adjacent same-power partner => supported attack possible
    function supportedThreat(at) {
      var list = enemiesAble(state, provs, at);
      if (list.length >= 2) return true;
      if (list.length === 1) {
        var a = list[0];
        return state.units.some(function (u) {
          return u.power === a.power && u.at !== a.at && canStep(state, provs, u.type, u.at, at);
        });
      }
      return false;
    }
    var needHelp = desp ? [] : myUnits.filter(function (u) {
      if (busy[u.at] || threat[u.at] === 0 || !supportedThreat(u.at)) return false;
      // Proven hostility always earns a guard; under siege any real threat does;
      // otherwise only guard own autumn centres with otherwise-idle helpers.
      if (provenThreat(state, u.at) || underSiege) return true;
      if (!(autumn && isSC(state, u.at) && state.owners[u.at] === me)) return false;
      return myUnits.some(function (h) {
        return h.at !== u.at && isFree(h.at) && !holders[h.at] &&
          bestMoveScore(state, provs, unitAt, h.at, allies, dmz, lead, yl, autumn, respect) < 45 &&
          findLegal(state, h.at, function (o) {
            return o.type === 'support' && o.target === u.at && o.targetDest === 'hold';
          });
      });
    });
    // least valuable free unit supports the most threatened holder
    needHelp.sort(function (a, b) { return threat[b.at] - threat[a.at] || (a.at < b.at ? -1 : 1); });
    needHelp.forEach(function (u) {
      if (busy[u.at]) return;
      var helpers = myUnits.filter(function (h) {
        return h.at !== u.at && isFree(h.at) && !holders[h.at] && findLegal(state, h.at, function (o) {
          return o.type === 'support' && o.target === u.at && o.targetDest === 'hold';
        });
      });
      helpers.sort(function (a, b) {
        var sa = bestMoveScore(state, provs, unitAt, a.at, allies, dmz, lead, yl, autumn, respect);
        var sb = bestMoveScore(state, provs, unitAt, b.at, allies, dmz, lead, yl, autumn, respect);
        return sa - sb || (a.at < b.at ? -1 : 1);
      });
      if (helpers.length) {
        var o = findLegal(state, helpers[0].at, function (x) {
          return x.type === 'support' && x.target === u.at && x.targetDest === 'hold';
        });
        if (o) { plan[helpers[0].at] = o; busy[helpers[0].at] = 1; busy[u.at] = 1; }
      }
    });

    // 3. Cover empty own centres in Autumn when an enemy can walk in.
    if (autumn) {
      var emptyMine = (state.map.provinces || []).filter(function (p) {
        return isSC(state, p.id) && state.owners[p.id] === me && !unitAt[p.id];
      });
      emptyMine.forEach(function (p) {
        if (enemiesAble(state, provs, p.id).length === 0) return;
        var guards = myUnits.filter(function (u) {
          return isFree(u.at) && !holders[u.at] && findLegal(state, u.at, function (o) {
            return o.type === 'move' && o.dest === p.id;
          });
        });
        guards.sort(function (a, b) {
          var sa = bestMoveScore(state, provs, unitAt, a.at, allies, dmz, lead, yl, autumn, respect);
          var sb = bestMoveScore(state, provs, unitAt, b.at, allies, dmz, lead, yl, autumn, respect);
          return sa - sb || (a.at < b.at ? -1 : 1);
        });
        if (guards.length) {
          var g = findLegal(state, guards[0].at, function (o) {
            return o.type === 'move' && o.dest === p.id;
          });
          if (g) { plan[guards[0].at] = g; busy[guards[0].at] = 1; }
        }
      });
    }

    // 4. Offence: scored moves with coordinated support, one mover per dest.
    var cands = [];
    myUnits.forEach(function (u) {
      if (busy[u.at] || holders[u.at]) return;
      if (plan[u.at].type !== 'hold') return;
      var legals = state.legalOrders[u.at] || [];
      legals.forEach(function (o) {
        if (o.type !== 'move') return;
        cands.push({
          from: u.at, dest: o.dest,
          score: scoreDest(state, provs, unitAt, u.at, o.dest, allies, dmz, lead, yl, autumn, respect)
        });
      });
    });
    cands = cands.filter(function (c) { return c.score > -1e8; });
    cands.sort(function (a, b) {
      return b.score - a.score || (a.from < b.from ? -1 : a.from > b.from ? 1 :
        a.dest < b.dest ? -1 : 1);
    });
    var reserved = {};
    cands.forEach(function (c) {
      if (!isFree(c.from) || reserved[c.dest]) return;
      var occ = unitAt[c.dest];
      var move = findLegal(state, c.from, function (o) {
        return o.type === 'move' && o.dest === c.dest;
      });
      if (!move) return;
      if (occ && occ.power !== me) {
        // occupied: never solo (would bounce); need at least one support
        var need = Math.max(1, maxDefence(state, provs, c.dest) - 0);
        void need;
        var helpers = myUnits.filter(function (h) {
          return h.at !== c.from && isFree(h.at) && !holders[h.at] && findLegal(state, h.at, function (o) {
            return o.type === 'support' && o.target === c.from && o.targetDest === c.dest;
          });
        });
        helpers.sort(function (a, b) {
          var sa = bestMoveScore(state, provs, unitAt, a.at, allies, dmz, lead, yl, autumn, respect);
          var sb = bestMoveScore(state, provs, unitAt, b.at, allies, dmz, lead, yl, autumn, respect);
          return sa - sb || (a.at < b.at ? -1 : 1);
        });
        // demand overwhelming force vs well-defended: skip hopeless attacks
        var def = maxDefence(state, provs, c.dest);
        var avail = helpers.length;
        if (!desp && def > avail + 2) return;
        if (c.score < 40 && def >= 3 && avail < 2) return;
        if (!helpers.length) return;
        // concentrate force: match the defence on anything valuable
        var take = c.score >= 40 ? Math.min(helpers.length, Math.max(1, def)) : 1;
        plan[c.from] = move; busy[c.from] = 1; reserved[c.dest] = 1;
        for (var i = 0; i < take; i++) {
          var s = findLegal(state, helpers[i].at, function (o) {
            return o.type === 'support' && o.target === c.from && o.targetDest === c.dest;
          });
          if (s) { plan[helpers[i].at] = s; busy[helpers[i].at] = 1; }
        }
      } else {
        var rivals = enemiesAble(state, provs, c.dest);
        var helps = myUnits.filter(function (h) {
          return h.at !== c.from && isFree(h.at) && !holders[h.at] && findLegal(state, h.at, function (o) {
            return o.type === 'support' && o.target === c.from && o.targetDest === c.dest;
          });
        });
        helps.sort(function (a, b) {
          var sa = bestMoveScore(state, provs, unitAt, a.at, allies, dmz, lead, yl, autumn, respect);
          var sb = bestMoveScore(state, provs, unitAt, b.at, allies, dmz, lead, yl, autumn, respect);
          return sa - sb || (a.at < b.at ? -1 : 1);
        });
        // don't strip defenders off threatened provinces except for big prizes
        // (siege: almost never)
        var moveOut = underSiege ? 75 : 55;
        if (!desp && threat[c.from] > 0 && c.score < moveOut) return;
        // unsupported walks into contested ground usually bounce and waste a supporter
        if (!desp && !helps.length && rivals.length >= 2) return;
        if (!desp && !helps.length && rivals.length === 1 && c.score < 60) return;
        plan[c.from] = move; busy[c.from] = 1; reserved[c.dest] = 1;
        if (rivals.length && helps.length && (c.score >= 30 || isSC(state, c.dest))) {
          var s2 = findLegal(state, helps[0].at, function (o) {
            return o.type === 'support' && o.target === c.from && o.targetDest === c.dest;
          });
          if (s2) { plan[helps[0].at] = s2; busy[helps[0].at] = 1; }
        }
      }
    });

    // 5. Leftover units: reinforce proven-threat neighbours, else cut/support-pressure.
    myUnits.forEach(function (u) {
      if (desp || !isFree(u.at) || holders[u.at]) return;
      var best = null;
      myUnits.forEach(function (v) {
        if (v.at === u.at || busy[v.at] || plan[v.at].type !== 'hold') return;
        if (!provenThreat(state, v.at)) return;
        if (findLegal(state, u.at, function (o) {
          return o.type === 'support' && o.target === v.at && o.targetDest === 'hold';
        })) {
          if (!best || threat[v.at] > threat[best.at]) best = v;
        }
      });
      if (best) {
        var o = findLegal(state, u.at, function (x) {
          return x.type === 'support' && x.target === best.at && x.targetDest === 'hold';
        });
        if (o) { plan[u.at] = o; busy[u.at] = 1; busy[best.at] = 1; }
      }
    });
    myUnits.forEach(function (u) {
      if (!isFree(u.at) || holders[u.at]) return;
      if (threat[u.at] > 0) return; // exposed: stay
      var legals = state.legalOrders[u.at] || [];
      var cuts = [];
      legals.forEach(function (o) {
        if (o.type !== 'move' || reserved[o.dest]) return;
        var occ = unitAt[o.dest];
        if (!occ || occ.power === me) return;
        if (respect && allies.has(occ.power)) return;
        // value: supports it could give to its neighbours (cut them) + general pressure
        var adjN = (state.map.adjacency[occ.at] || []).length;
        cuts.push({ dest: o.dest, v: adjN + (isSC(state, o.dest) ? 6 : 0) });
      });
      cuts.sort(function (a, b) { return b.v - a.v || (a.dest < b.dest ? -1 : 1); });
      if (cuts.length && cuts[0].v >= 3) {
        var m = findLegal(state, u.at, function (o) {
          return o.type === 'move' && o.dest === cuts[0].dest;
        });
        if (m) { plan[u.at] = m; busy[u.at] = 1; reserved[cuts[0].dest] = 1; }
      }
    });

    // 6. Regroup: idle units with no mission walk toward the main target's
    // territory (strict progress, empty safe staging only; not under siege).
    if (!desp && !underSiege) {
      var tgt = pickTarget(state);
      if (tgt) {
        var tgtSC = function (p) { return isSC(state, p) && state.owners[p] === tgt; };
        myUnits.forEach(function (u) {
          if (!isFree(u.at) || holders[u.at]) return;
          if (autumn && isSC(state, u.at) && state.owners[u.at] === me) return;
          if (threat[u.at] > 0) return;
          var here = bfsDist(state, u.at, tgtSC);
          if (here < 0) return;
          var bestD = null, bestDv = here;
          (state.legalOrders[u.at] || []).forEach(function (o) {
            if (o.type !== 'move' || reserved[o.dest]) return;
            if (unitAt[o.dest]) return;
            if (dmz.has(o.dest)) return;
            if (isSC(state, o.dest) && state.owners[o.dest] === me) return;
            var dd = bfsDist(state, o.dest, tgtSC);
            if (dd >= 0 && dd < bestDv && enemiesAble(state, provs, o.dest).length <= 1) {
              bestDv = dd; bestD = o.dest;
            }
          });
          if (bestD) {
            var mv = findLegal(state, u.at, function (o) {
              return o.type === 'move' && o.dest === bestD;
            });
            if (mv) { plan[u.at] = mv; busy[u.at] = 1; reserved[bestD] = 1; }
          }
        });
      }
    }

    return myUnits.map(function (u) { return plan[u.at]; });
  }

  module.exports = {
    name: 'Anatolian Falcon',

    propose: function (state) {
      try {
        var living = livingPowers(state);
        if (!living.length) return [];
        var target = pickTarget(state);
        var partner = pickPartner(state);
        var adj = adjacentPowers(state);
        var ruth = ruthless(state);
        var out = [];
        // peace only where there is no border friction (plus our chosen partner)
        var peaceSet = {};
        living.filter(function (p) {
          return p !== target && (p === partner || !adj.has(p));
        }).slice(0, 5).forEach(function (p) { peaceSet[p] = 1; });
        // under siege, also try to peel the weakest attacker off the gang
        if (sieged(state)) {
          var weak = pressurers(state).filter(function (p) {
            return p !== target && !peaceSet[p] && !untrustworthy(state, p);
          }).sort(function (a, b) {
            return (state.centresByPower[a] || 0) - (state.centresByPower[b] || 0) || (a < b ? -1 : 1);
          })[0];
          if (weak && Object.keys(peaceSet).length < 5) peaceSet[weak] = 1;
        }
        Object.keys(peaceSet).forEach(function (p) {
          out.push({ to: p, type: 'peace', terms: {} });
        });
        var lead = leaderOf(state);
        if (!ruth && out.length < 6 && partner && lead.power && lead.power !== partner &&
          living.indexOf(lead.power) >= 0) {
          out.push({ to: partner, type: 'alliance', terms: { target: lead.power } });
        }
        // one coordinated-attack request: my unit -> valuable dest the partner could support
        if (out.length < 6) {
          var me = state.you, provs = provById(state);
          var unitAt = {};
          state.units.forEach(function (u) { unitAt[u.at] = u; });
          var allies = alliesOf(state);
          var done = false;
          var mine = state.units.filter(function (u) { return u.power === me; });
          var cands = partner ? [partner] : [];
          living.forEach(function (p) { if (cands.indexOf(p) < 0) cands.push(p); });
          outer:
          for (var i = 0; i < mine.length && !done; i++) {
            var legals = state.legalOrders[mine[i].at] || [];
            for (var j = 0; j < legals.length; j++) {
              var o = legals[j];
              if (o.type !== 'move') continue;
              var d = o.dest, occ = unitAt[d];
              if (occ && (occ.power === me || allies.has(occ.power))) continue;
              if (!(isSC(state, d) && state.owners[d] !== me) && !(occ && occ.power !== me)) continue;
              for (var k = 0; k < cands.length && !done; k++) {
                var p = cands[k];
                if (p === target || untrustworthy(state, p)) continue;
                var can = state.units.some(function (u) {
                  return u.power === p && u.at !== mine[i].at &&
                    canStep(state, provs, u.type, u.at, d);
                });
                if (can) {
                  out.push({ to: p, type: 'request-support', terms: { unit: mine[i].at, dest: d } });
                  done = true;
                  break outer;
                }
              }
            }
          }
        }
        return out.slice(0, 6);
      } catch (e) { return []; }
    },

    answer: function (state) {
      try {
        var target = pickTarget(state);
        var partner = pickPartner(state);
        var adj = adjacentPowers(state);
        var ruth = ruthless(state);
        var allies = alliesOf(state), dmz = dmzOf(state);
        var provs = provById(state);
        // provinces we actually want to enter this season
        var want = {};
        (state.units || []).filter(function (u) { return u.power === state.you; }).forEach(function (u) {
          var legals = state.legalOrders[u.at] || [];
          legals.forEach(function (o) {
            if (o.type !== 'move') return;
            var unitAt = {};
            state.units.forEach(function (x) { unitAt[x.at] = x; });
            var s = scoreDest(state, provs, unitAt, u.at, o.dest, allies, dmz,
              leaderOf(state), yearsLeft(state), state.season === 'Autumn', !ruth);
            if (s >= 55) want[o.dest] = 1;
          });
        });
        var ans = {};
        (state.inbox || []).forEach(function (p) {
          var a = 'reject';
          if (p.type === 'support') {
            a = 'accept'; // free gift: obligation falls on the sender
          } else if (untrustworthy(state, p.from)) {
            a = 'reject';
          } else if (ruth && (p.type === 'peace' || p.type === 'alliance')) {
            a = 'reject'; // no new shackles at the death
          } else if (p.type === 'peace' || p.type === 'alliance') {
            var press = sieged(state) && pressurers(state).indexOf(p.from) >= 0;
            a = (!adj.has(p.from) || p.from === partner || press) &&
              p.from !== target ? 'accept' : 'reject';
          } else if (p.type === 'dmz') {
            a = want[p.terms.province] ? 'reject' : 'accept';
          } else if (p.type === 'request-support') {
            var ok = (state.legalOrders && state.units.some(function (u) {
              return u.power === state.you && (state.legalOrders[u.at] || []).some(function (o) {
                return o.type === 'support' && o.target === p.terms.unit && o.targetDest === p.terms.dest;
              });
            }));
            var unitAt2 = {};
            state.units.forEach(function (x) { unitAt2[x.at] = x; });
            var hit = unitAt2[p.terms.dest === 'hold' ? p.terms.unit : p.terms.dest];
            var hitsAlly = hit && (hit.power === state.you || allies.has(hit.power));
            a = (ok && !hitsAlly && p.from !== target) ? 'accept' : 'reject';
          }
          ans[p.id] = a;
        });
        return ans;
      } catch (e) {
        var fb = {};
        (state.inbox || []).forEach(function (p) { fb[p.id] = 'reject'; });
        return fb;
      }
    },

    orders: function (state) {
      try {
        return orderPlan(state);
      } catch (e) {
        return (state.units || []).filter(function (u) { return u.power === state.you; })
          .map(function (u) { return { unit: u.at, type: 'hold' }; });
      }
    },

    retreats: function (state) {
      try {
        var provs = provById(state);
        var unitAt = {};
        state.units.forEach(function (u) { unitAt[u.at] = u; });
        var taken = {};
        var out = {};
        (state.retreats || []).forEach(function (r) {
          var opts = (r.options || []).filter(function (d) { return !taken[d]; });
          if (!opts.length) { out[r.at] = null; return; }
          var autumn = state.season === 'Autumn';
          opts.sort(function (a, b) {
            function val(d) {
              var v = 0;
              if (isSC(state, d) && state.owners[d] !== state.you) v += 60;
              else if (isSC(state, d)) v += 15;
              var pr = provs[d];
              if (pr && pr.home === state.you) v += 20;
              var foes = 0;
              state.units.forEach(function (u) {
                if (u.power !== state.you && canStep(state, provs, u.type, u.at, d)) foes++;
              });
              v -= foes * 6;
              if (unitAt[d]) v -= 50;
              return v;
            }
            var d = val(b) - val(a);
            if (d) return d;
            return a < b ? -1 : 1;
          });
          var pick = opts[0];
          // in Spring, avoid retreating onto a capturable SC we cannot hold? retreats never hurt
          void autumn;
          taken[pick] = 1;
          out[r.at] = pick;
        });
        return out;
      } catch (e) {
        var fb = {};
        (state.retreats || []).forEach(function (r) { fb[r.at] = null; });
        return fb;
      }
    },

    builds: function (state) {
      try {
        var me = state.you;
        var mine = state.units.filter(function (u) { return u.power === me; });
        var delta = ((state.centresByPower && state.centresByPower[me]) || 0) - mine.length;
        var provs = provById(state);
        if (delta < 0) {
          var scored = mine.map(function (u) {
            var v = 0;
            if (isSC(state, u.at) && state.owners[u.at] === me) v += 20;
            var pr = provs[u.at];
            if (pr && pr.home === me) v += 8;
            if (isSC(state, u.at) && state.owners[u.at] !== me && state.owners[u.at]) v += 6;
            var foes = 0;
            state.units.forEach(function (x) {
              if (x.power !== me && (state.map.adjacency[x.at] || []).indexOf(u.at) >= 0) foes++;
            });
            v -= foes;
            return { at: u.at, v: v };
          });
          scored.sort(function (a, b) { return a.v - b.v || (a.at < b.at ? -1 : 1); });
          return scored.slice(0, -delta).map(function (s) { return { disband: s.at }; });
        }
        if (delta > 0) {
          var provs2 = state.map.provinces || [];
          var empty = provs2.filter(function (p) {
            return p.home === me && state.owners[p.id] === me &&
              !state.units.some(function (u) { return u.at === p.id; });
          });
          empty.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
          var fleets = mine.filter(function (u) { return u.type === 'fleet'; }).length;
          var res = [];
          empty.slice(0, delta).forEach(function (p) {
            var wantFleet = p.coastal && fleets === 0 && res.filter(function (r) { return r.type === 'fleet'; }).length === 0;
            res.push(wantFleet ? { type: 'fleet', at: p.id } : { type: 'army', at: p.id });
          });
          return res;
        }
        return [];
      } catch (e) { return []; }
    }
  };
})();
