(function () {
  'use strict';

  var MEM = { target: null };

  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  function eng() {
    try {
      if (typeof PactEngine !== 'undefined' && PactEngine) return PactEngine;
    } catch (e) { /* no engine */ }
    return null;
  }

  function ownUnits(state) {
    return state.units.filter(function (u) { return u.power === state.you; });
  }

  function living(state) {
    return Object.keys(state.centresByPower).filter(function (p) {
      if (p === state.you) return false;
      if ((state.centresByPower[p] || 0) > 0) return true;
      return state.units.some(function (u) { return u.power === p; });
    });
  }

  function provById(state) {
    var m = {};
    state.map.provinces.forEach(function (p) { m[p.id] = p; });
    return m;
  }

  function occMap(state) {
    var m = {};
    state.units.forEach(function (u) { m[u.at] = u; });
    return m;
  }

  function indexLegal(state) {
    var idx = {};
    Object.keys(state.legalOrders).forEach(function (at) {
      var e = { moves: [], sup: [], supSet: {} };
      state.legalOrders[at].forEach(function (o) {
        if (o.type === 'move') e.moves.push(o.dest);
        else if (o.type === 'support') {
          e.sup.push({ target: o.target, dest: o.targetDest });
          e.supSet[o.target + '>' + o.targetDest] = true;
        }
      });
      idx[at] = e;
    });
    return idx;
  }

  function canSupport(idx, from, target, dest) {
    return Boolean(idx[from] && idx[from].supSet[target + '>' + dest]);
  }

  function canMoveH(state, provs, unit, dest) {
    var E = eng();
    if (E && E.canMove) {
      try { if (E.canMove(unit, dest)) return true; } catch (e) { /* fall through */ }
    }
    var adj = state.map.adjacency[unit.at] || [];
    if (adj.indexOf(dest) < 0) return false;
    var to = provs[dest], from = provs[unit.at];
    if (!to || !from) return false;
    if (unit.type === 'army') return to.type === 'land';
    if (unit.type !== 'fleet') return false;
    if (to.type === 'land' && !to.coastal) return false;
    if (from.type === 'sea' || to.type === 'sea') return true;
    return (state.map.adjacency[unit.at] || []).some(function (id) {
      return provs[id] && provs[id].type === 'sea' &&
        (state.map.adjacency[dest] || []).indexOf(id) >= 0;
    });
  }

  function grudgesOf(state) {
    var g = {};
    Object.keys(state.trust).forEach(function (p) {
      var t = state.trust[p];
      if (!t || !t.brokenPromises) return;
      for (var i = 0; i < t.brokenPromises.length; i++) {
        if (t.brokenPromises[i].partner === state.you) { g[p] = true; break; }
      }
    });
    return g;
  }

  function myObligations(state) {
    return (state.accepted || []).filter(function (p) { return p.power === state.you; });
  }

  function peacePartners(state, hardball, grudges) {
    var s = {};
    if (hardball) return s;
    myObligations(state).forEach(function (p) {
      if ((p.type === 'peace' || p.type === 'alliance') && !grudges[p.partner]) s[p.partner] = true;
    });
    return s;
  }

  function dmzBlocked(state, hardball) {
    var s = {};
    if (hardball) return s;
    myObligations(state).forEach(function (p) {
      if (p.type === 'dmz' && p.terms && p.terms.province) s[p.terms.province] = true;
    });
    return s;
  }

  function supportObls(state) {
    var out = [], seen = {};
    myObligations(state).forEach(function (p) {
      if (p.type !== 'support' || !p.terms) return;
      var key = p.terms.unit + '>' + p.terms.dest;
      if (seen[key]) return;
      seen[key] = true;
      out.push({ unit: p.terms.unit, dest: p.terms.dest, partner: p.partner });
    });
    return out;
  }

  function isLeader(state, p) {
    var best = -1, lead = null, tie = false;
    Object.keys(state.centresByPower).forEach(function (q) {
      var c = state.centresByPower[q] || 0;
      if (c > best) { best = c; lead = q; tie = false; }
      else if (c === best) tie = true;
    });
    return lead === p && !tie;
  }

  function pickTarget(state, peace, grudges, hardball) {
    var me = state.you;
    var idx = indexLegal(state);
    var mine = ownUnits(state);
    var reach = {}, capturable = {};
    living(state).forEach(function (p) { reach[p] = 0; capturable[p] = 0; });
    mine.forEach(function (u) {
      var seenP = {};
      (idx[u.at] ? idx[u.at].moves : []).forEach(function (d) {
        var o = null;
        for (var i = 0; i < state.units.length; i++) {
          if (state.units[i].at === d) { o = state.units[i]; break; }
        }
        var owner = Object.hasOwn(state.owners, d) ? state.owners[d] : undefined;
        var ps = {};
        if (o && o.power !== me) ps[o.power] = true;
        if (owner && owner !== me && Object.hasOwn(capturable, owner)) {
          capturable[owner]++;
          ps[owner] = true;
        }
        Object.keys(ps).forEach(function (p) { if (!seenP[p + d]) { seenP[p + d] = 1; reach[p] = (reach[p] || 0) + 1; } });
      });
    });
    var best = null, bestScore = -1e12;
    living(state).forEach(function (p) {
      var units = state.units.filter(function (u) { return u.power === p; }).length;
      var centres = state.centresByPower[p] || 0;
      var s = 0;
      s += (reach[p] || 0) * 8;
      s += (capturable[p] || 0) * 12;
      s += 20 - centres * 3 - units * 2;
      if (isLeader(state, p)) s += (state.year * 2 >= state.limits.maxYears ? 22 : -12);
      var t = state.trust[p];
      if (t && t.broken > t.kept) s += 8 + t.broken * 2;
      if (grudges[p]) s += 30;
      if (peace[p] && !hardball && !grudges[p]) s -= 500;
      if (p === MEM.target) s += 6;
      if (s > bestScore || (s === bestScore && (best === null || cmp(p, best) < 0))) {
        bestScore = s; best = p;
      }
    });
    return best;
  }

  function moveValue(state, provs, occ, unit, dest, target, peace, hardball, bad) {
    var owner = Object.hasOwn(state.owners, dest) ? state.owners[dest] : undefined;
    var isSC = Object.hasOwn(state.owners, dest);
    var o = occ[dest] || null;
    var autumn = state.season === 'Autumn';
    var v = 0;
    if (o && o.power === state.you) return -10000;
    if (bad) {
      var pen = bad[unit.at + '>' + dest];
      if (pen) v -= pen;
    }
    var late = state.year >= state.limits.maxYears - 1;
    var partnerUnit = !hardball && o && peace[o.power];
    var partnerSC = !hardball && isSC && owner !== state.you && peace[owner] && !o;
    if (partnerUnit) {
      // opportunistic endgame betrayal only for high-value Autumn captures
      if (!(late && autumn && isSC)) return -10000;
    }
    if (isSC && owner !== state.you) {
      if (owner === null || owner === undefined) v += autumn ? 62 : 34;
      else {
        v += autumn ? 72 : 42;
        if (owner === target) v += 16;
        if (o) v += 26;
        else v += 8;
      }
    } else if (isSC) {
      v += 1;
      // garrison: own empty SC threatened in Autumn
      if (autumn && !o) {
        var thr = false;
        var adj2 = state.map.adjacency[dest] || [];
        for (var gi = 0; gi < adj2.length; gi++) {
          var w = occ[adj2[gi]] || null;
          if (w && w.power !== state.you) { thr = true; break; }
        }
        if (thr) v += 58;
      }
    } else if (o && o.power !== state.you) {
      // Spring attacks on occupied ground only waste tempo (no captures):
      // never preferred over positioning, supports or holds.
      if (!autumn) return -10000;
      v += 22;
      if (o.power === target) v += 10;
    } else if (!o) {
      v += 6;
      // racing: contested empty ground often standoffs; prefer safer grabs
      var adjE = state.map.adjacency[dest] || [];
      var contest = 0, approach = 0;
      for (var ci = 0; ci < adjE.length; ci++) {
        var w = occ[adjE[ci]] || null;
        if (w && w.power !== state.you) {
          contest++;
          if (w.power === target) approach++;
        } else if (!w && Object.hasOwn(state.owners, adjE[ci]) && state.owners[adjE[ci]] === target) {
          approach++;
        }
      }
      if (autumn && isSC) v -= Math.min(contest, 3) * 8;
      if (approach) v += 4;
    }
    // staging: adjacent SCs not mine
    var adj = state.map.adjacency[dest] || [];
    var stage = 0;
    for (var i = 0; i < adj.length; i++) {
      if (Object.hasOwn(state.owners, adj[i]) && state.owners[adj[i]] !== state.you) stage++;
    }
    v += Math.min(stage, 4) * 2;
    // hold-ground penalty in Autumn when sitting on a capturable SC
    if (autumn && Object.hasOwn(state.owners, unit.at) && state.owners[unit.at] !== state.you) v -= 70;
    // leaving own SC in Autumn is risky
    if (autumn && Object.hasOwn(state.owners, unit.at) && state.owners[unit.at] === state.you) v -= 12;
    if (state.year >= state.limits.maxYears && isSC && owner !== state.you) v += 30;
    return v;
  }

  function bestMoveFor(state, provs, occ, idx, unit, target, peace, hardball, dmz, bad) {
    var best = null, bestV = -1e12;
    (idx[unit.at] ? idx[unit.at].moves : []).forEach(function (d) {
      if (dmz[d] && !hardball) return;
      var v = moveValue(state, provs, occ, unit, d, target, peace, hardball, bad);
      if (v > bestV || (v === bestV && (best === null || cmp(d, best) < 0))) { bestV = v; best = d; }
    });
    return { dest: best, value: bestV };
  }

  function bounceMemory(state) {
    // destinations where our moves bounced recently: try something else
    var bad = {};
    try {
      var h = state.history;
      if (!h || !h.length) return bad;
      for (var d = h.length - 1; d >= 0 && d >= h.length - 3; d--) {
        var pen = d === h.length - 1 ? 30 : 15;
        var mine = (h[d].orders && h[d].orders[state.you]) || [];
        mine.forEach(function (o) {
          if (o.type === 'move' && (o.outcome === 'bounce' || o.outcome === 'invalid') && o.dest) {
            var k = o.unit + '>' + o.dest;
            if (!bad[k] || pen > bad[k]) bad[k] = pen;
          }
        });
      }
    } catch (e) { /* ignore */ }
    return bad;
  }

  function threatCount(state, at) {
    var n = 0;
    (state.map.adjacency[at] || []).forEach(function (nb) {
      for (var i = 0; i < state.units.length; i++) {
        if (state.units[i].at === nb && state.units[i].power !== state.you) { n++; break; }
      }
    });
    return n;
  }

  function planOrders(state) {
    var me = state.you;
    var provs = provById(state);
    var occ = occMap(state);
    var idx = indexLegal(state);
    var mine = ownUnits(state);
    var hardball = state.year >= state.limits.maxYears;
    var grudges = grudgesOf(state);
    var peace = peacePartners(state, hardball, grudges);
    var dmz = dmzBlocked(state, hardball);
    var target = pickTarget(state, peace, grudges, hardball);
    if (target) MEM.target = target;
    var bad = bounceMemory(state);

    var plan = {};
    mine.forEach(function (u) { plan[u.at] = { unit: u.at, type: 'hold' }; });
    function isFree(at) { return plan[at] && plan[at].type === 'hold'; }
    function moveCost(at) {
      var u = null;
      for (var i = 0; i < mine.length; i++) if (mine[i].at === at) u = mine[i];
      if (!u) return 1e9;
      var b = bestMoveFor(state, provs, occ, idx, u, target, peace, hardball, dmz, bad);
      return b.value;
    }

    // 1) promised supports first
    var obls = supportObls(state);
    obls.forEach(function (obl) {
      // never help an attack on a peace partner's unit
      var ben = occ[obl.unit] || null;
      void ben;
      // find cheapest supporter
      var cands = mine.filter(function (u) {
        return isFree(u.at) && canSupport(idx, u.at, obl.unit, obl.dest);
      }).sort(function (a, b) { return moveCost(a.at) - moveCost(b.at) || cmp(a.at, b.at); });
      if (cands.length) {
        plan[cands[0].at] = { unit: cands[0].at, type: 'support', target: obl.unit, targetDest: obl.dest };
      }
    });

    // 2) defence: only critical cases (others handled with leftovers later)
    var autumn = state.season === 'Autumn';
    var defOrder = mine.filter(function (u) { return isFree(u.at); }).map(function (u) {
      var t = threatCount(state, u.at);
      var ownSC = Object.hasOwn(state.owners, u.at) && state.owners[u.at] === me;
      var holder = autumn && Object.hasOwn(state.owners, u.at) && state.owners[u.at] !== me;
      // early uncoordinated attacks are 1v1: bare holds suffice. Only massed
      // threats and critical Autumn positions earn dedicated support.
      var critical = t >= 3 || ((ownSC || holder) && autumn && t >= 2);
      if (!critical) return null;
      var val = (ownSC ? 90 : holder ? 70 : 40) + t * 10;
      return { u: u, t: t, val: val, ownSC: ownSC };
    }).filter(function (x) { return x; })
      .sort(function (a, b) { return b.val - a.val || cmp(a.u.at, b.u.at); });
    defOrder.forEach(function (item) {
      var need = Math.min(item.t, 2) || 1;
      var helpers = mine.filter(function (w) {
        return w.at !== item.u.at && isFree(w.at) && canSupport(idx, w.at, item.u.at, 'hold');
      }).sort(function (a, b) { return moveCost(a.at) - moveCost(b.at) || cmp(a.at, b.at); });
      // spare only low-opportunity units, unless critical home SC in Autumn
      var use = helpers.filter(function (h) { return moveCost(h.at) < 30; }).slice(0, need);
      if (!use.length && item.ownSC && autumn && helpers.length) use = helpers.slice(0, 1);
      use.forEach(function (h) {
        plan[h.at] = { unit: h.at, type: 'support', target: item.u.at, targetDest: 'hold' };
      });
    });

    // 3) offence: greedy moves with support concentration
    var reserved = {};
    Object.keys(plan).forEach(function (at) {
      if (plan[at].type === 'support' && plan[at].targetDest !== 'hold') reserved[plan[at].targetDest] = true;
    });
    var cands = [];
    mine.forEach(function (u) {
      if (!isFree(u.at)) return;
      (idx[u.at] ? idx[u.at].moves : []).forEach(function (d) {
        if (dmz[d] && !hardball) return;
        if (reserved[d]) return;
        var v = moveValue(state, provs, occ, u, d, target, peace, hardball, bad);
        if (v < -1000) return;
        cands.push({ u: u, dest: d, v: v });
      });
    });
    cands.sort(function (a, b) { return b.v - a.v || cmp(a.u.at, b.u.at) || cmp(a.dest, b.dest); });

    function estDefence(dest) {
      var o = occ[dest] || null;
      if (!o) return 0;
      var n = 1;
      (state.map.adjacency[dest] || []).forEach(function (nb) {
        var w = occ[nb] || null;
        if (w && w.power === o.power && nb !== dest && idx[nb] && idx[nb].supSet[dest + '>hold']) n++;
      });
      return n;
    }

    cands.forEach(function (c) {
      if (!isFree(c.u.at) || reserved[c.dest]) return;
      var o = occ[c.dest] || null;
      if (o && o.power === me) return;
      // don't march a unit that is designated as a supported holder
      var held = Object.keys(plan).some(function (at) {
        return plan[at].type === 'support' && plan[at].target === c.u.at && plan[at].targetDest === 'hold';
      });
      if (held && c.v < 70) return;
      if (c.v < 4 && o) return; // low-value attacks need support math below
      if (c.v < -1000) return;
      var def = estDefence(c.dest);
      var helpers = [];
      if (o) {
        helpers = mine.filter(function (w) {
          return w.at !== c.u.at && isFree(w.at) && canSupport(idx, w.at, c.u.at, c.dest);
        }).sort(function (a, b) { return moveCost(a.at) - moveCost(b.at) || cmp(a.at, b.at); });
        var need = def; // need strength = def+1 => need `def` supporters
        if (c.dest && o && o.power === target) need = Math.max(need, 1);
        // Bouncing is cheap (attacker stays put) while defenders often move:
        // only skip low-value long shots, never rich Autumn captures.
        if (helpers.length < need && c.v < 40) return;
        var use = helpers.slice(0, Math.min(need, helpers.length));
        // high-value: overkill with one extra if cheap
        if (c.v >= 60 && helpers.length > use.length && moveCost(helpers[use.length].at) < 10) {
          use.push(helpers[use.length]);
        }
        plan[c.u.at] = { unit: c.u.at, type: 'move', dest: c.dest };
        reserved[c.dest] = true;
        use.forEach(function (h) {
          plan[h.at] = { unit: h.at, type: 'support', target: c.u.at, targetDest: c.dest };
        });
      } else {
        if (c.v < 2) return;
        plan[c.u.at] = { unit: c.u.at, type: 'move', dest: c.dest };
        reserved[c.dest] = true;
      }
    });

    // 3b) mass fallback: if nothing moves but a rich target exists, pile on
    var moved = mine.some(function (u) { return plan[u.at].type === 'move'; });
    if (!moved) {
      var best = null;
      cands.forEach(function (c) {
        if (!isFree(c.u.at)) return;
        var o = occ[c.dest] || null;
        if (!o || o.power === me) return;
        if (c.v < 45) return;
        var helpers = mine.filter(function (w) {
          return w.at !== c.u.at && isFree(w.at) && canSupport(idx, w.at, c.u.at, c.dest);
        });
        var score = c.v + helpers.length * 12;
        if (!best || score > best.score) best = { c: c, helpers: helpers, score: score };
      });
      if (best && best.helpers.length) {
        plan[best.c.u.at] = { unit: best.c.u.at, type: 'move', dest: best.c.dest };
        reserved[best.c.dest] = true;
        best.helpers.slice(0, 3).forEach(function (h) {
          plan[h.at] = { unit: h.at, type: 'support', target: best.c.u.at, targetDest: best.c.dest };
        });
      }
    }

    // 4) verify with adjudicator vs holding enemies; repair bounces
    var E = eng();
    if (E && E.adjudicate) {
      try {
        var allUnits = state.units.map(function (u) { return { power: u.power, type: u.type, at: u.at }; });
        var enemyHold = allUnits.filter(function (u) { return u.power !== me; }).map(function (u) {
          return { unit: u.at, type: 'hold' };
        });
        var simOrders = function () {
          return allUnits.map(function (u) {
            if (u.power === me) return plan[u.at] || { unit: u.at, type: 'hold' };
            return { unit: u.at, type: 'hold' };
          });
        };
        var res = E.adjudicate(allUnits, simOrders());
        var byUnit = {};
        (res.resolution || []).forEach(function (r) { byUnit[r.unit] = r; });
        var bounced = [];
        Object.keys(plan).forEach(function (at) {
          var o = plan[at];
          if (o.type === 'move' && byUnit[at] && byUnit[at].outcome === 'bounce' && occ[o.dest]) {
            var uFake = null;
            for (var i = 0; i < mine.length; i++) if (mine[i].at === at) uFake = mine[i];
            var vv = uFake ? moveValue(state, provs, occ, uFake, o.dest, target, peace, hardball, bad) : 0;
            bounced.push({ at: at, dest: o.dest, v: vv });
          }
        });
        bounced.sort(function (a, b) { return b.v - a.v || cmp(a.at, b.at); });
        // enemy supports propping up the defence
        var supByTarget = {};
        (res.resolution || []).forEach(function (r) {
          if (r.type === 'support' && r.power !== me && r.outcome !== 'cut' && r.outcome !== 'dislodged' &&
            r.outcome !== 'invalid' && r.effective) {
            var key = r.targetDest === 'hold' ? r.target : r.targetDest;
            (supByTarget[key] = supByTarget[key] || []).push(r.unit);
          }
        });
        bounced.forEach(function (b) {
          if (b.v < 45) {
            if (moveCost(b.at) < 0) plan[b.at] = { unit: b.at, type: 'hold' };
            return;
          }
          var helpers = mine.filter(function (w) {
            return isFree(w.at) && canSupport(idx, w.at, b.at, b.dest);
          }).sort(function (a, b2) { return moveCost(a.at) - moveCost(b2.at) || cmp(a.at, b2.at); });
          if (helpers.length && moveCost(helpers[0].at) < 30) {
            plan[helpers[0].at] = { unit: helpers[0].at, type: 'support', target: b.at, targetDest: b.dest };
            return;
          }
          // cut the defender's support instead
          var cutters = supByTarget[b.dest] || [];
          for (var ci = 0; ci < cutters.length; ci++) {
            var sAt = cutters[ci];
            if (reserved[sAt] || (occ[sAt] && occ[sAt].power === me)) continue;
            var src = mine.filter(function (w) {
              return isFree(w.at) && (idx[w.at] ? idx[w.at].moves : []).indexOf(sAt) >= 0;
            }).sort(function (a, b2) { return moveCost(a.at) - moveCost(b2.at) || cmp(a.at, b2.at); });
            if (src.length && moveCost(src[0].at) < 25) {
              var leavingCap = autumn && Object.hasOwn(state.owners, src[0].at) &&
                state.owners[src[0].at] !== me;
              if (leavingCap) continue;
              plan[src[0].at] = { unit: src[0].at, type: 'move', dest: sAt };
              reserved[sAt] = true;
              break;
            }
          }
        });
      } catch (e) { /* keep greedy plan */ }
    }

    // 5) leftover holds: reinforce assigned attacks / threatened holds
    mine.forEach(function (u) {
      if (!isFree(u.at)) return;
      var best = null;
      Object.keys(plan).forEach(function (at) {
        var o = plan[at];
        if (o.type === 'move' && canSupport(idx, u.at, at, o.dest)) {
          var v = moveValue(state, provs, occ, { at: at }, o.dest, target, peace, hardball, bad) + 0.5;
          if (!best || v > best.v) best = { target: at, dest: o.dest, v: v };
        } else if ((o.type === 'hold') && canSupport(idx, u.at, at, 'hold') && threatCount(state, at) > 0) {
          var v2 = 15 + threatCount(state, at) * 5;
          if (!best || v2 > best.v) best = { target: at, dest: 'hold', v: v2 };
        }
      });
      if (best && (best.dest !== 'hold' ? best.v > 20 : best.v > 15) && moveCost(u.at) < best.v - 5) {
        plan[u.at] = { unit: u.at, type: 'support', target: best.target, targetDest: best.dest };
      }
    });

    return mine.map(function (u) { return plan[u.at]; });
  }

  function scoreRetreat(state, r, opt) {
    var owner = Object.hasOwn(state.owners, opt) ? state.owners[opt] : undefined;
    var s = 0;
    if (Object.hasOwn(state.owners, opt) && owner !== state.you) s += state.season === 'Autumn' ? 60 : 25;
    if (owner === state.you) s += 12;
    var provs = provById(state);
    if (provs[opt] && provs[opt].home === state.you) s += 15;
    var foe = 0, friend = 0;
    (state.map.adjacency[opt] || []).forEach(function (nb) {
      for (var i = 0; i < state.units.length; i++) {
        if (state.units[i].at === nb) {
          if (state.units[i].power === state.you) friend++;
          else foe++;
          break;
        }
      }
    });
    s += friend * 4 - foe * 8;
    return s;
  }

  function bfsDist(state, from, goals) {
    var q = [[from, 0]], seen = {};
    seen[from] = true;
    for (var i = 0; i < q.length && i < 400; i++) {
      var cur = q[i][0], d = q[i][1];
      if (goals[cur]) return d;
      (state.map.adjacency[cur] || []).forEach(function (nb) {
        if (!seen[nb]) { seen[nb] = true; q.push([nb, d + 1]); }
      });
    }
    return 99;
  }

  var api = {
    name: 'Strategos',
    propose: function (state) {
      try {
        var out = [];
        var liv = living(state);
        if (!liv.length) return [];
        var hardball = state.year >= state.limits.maxYears;
        var grudges = grudgesOf(state);
        var peace = peacePartners(state, hardball, grudges);
        var target = pickTarget(state, peace, grudges, hardball);
        // peace with adjacent non-targets (secures flanks, keeps trust clean)
        var idx = indexLegal(state);
        var mine = ownUnits(state);
        function adjacencyTo(p) {
          var n = 0;
          mine.forEach(function (u) {
            ((idx[u.at] || {}).moves || []).forEach(function (d) {
              var o = null, owner = null;
              for (var i = 0; i < state.units.length; i++) if (state.units[i].at === d) o = state.units[i];
              if (Object.hasOwn(state.owners, d)) owner = state.owners[d];
              if ((o && o.power === p) || owner === p) n++;
            });
          });
          return n;
        }
        var friends = liv.filter(function (p) { return p !== target && !grudges[p]; })
          .sort(function (a, b) {
            var t = state.trust[b], s = state.trust[a];
            var sb = (t ? t.kept - t.broken : 0), sa = (s ? s.kept - s.broken : 0);
            return adjacencyTo(b) - adjacencyTo(a) || sb - sa || cmp(a, b);
          });
        friends.slice(0, 3).forEach(function (p) {
          if (out.length < 6) out.push({ to: p, type: 'peace', terms: {} });
        });
        // alliance vs leader with strongest friend
        var lead = null;
        liv.forEach(function (p) { if (isLeader(state, p) && p !== target) lead = p; });
        if (lead && friends.length && out.length < 6) {
          var ally = friends.filter(function (p) { return p !== lead; })
            .sort(function (a, b) { return (state.centresByPower[b] || 0) - (state.centresByPower[a] || 0) || cmp(a, b); })[0];
          if (ally) out.push({ to: ally, type: 'alliance', terms: { target: lead } });
        }
        // request-support for best attack (no obligation on us)
        if (out.length < 6 && target) {
          var provs = provById(state);
          var occ = occMap(state);
          var peaceT = {};
          peaceT[target] = false;
          var bc = null;
          mine.forEach(function (u) {
            ((idx[u.at] || {}).moves || []).forEach(function (d) {
              var v = moveValue(state, provs, occ, u, d, target, {}, false);
              if (v > 40 && (!bc || v > bc.v)) bc = { u: u, dest: d, v: v };
            });
          });
          if (bc) {
            var dest = bc.dest;
            var helpers = liv.filter(function (p) {
              return p !== target && state.units.some(function (w) {
                return w.power === p && canMoveH(state, provs, w, dest);
              });
            }).sort(function (a, b) {
              var t = state.trust[b], s = state.trust[a];
              return ((t ? t.kept - t.broken : 0) - (s ? s.kept - s.broken : 0)) || cmp(a, b);
            });
            if (helpers.length) {
              out.push({ to: helpers[0], type: 'request-support', terms: { unit: bc.u.at, dest: dest } });
            }
          }
        }
        return out.slice(0, 6);
      } catch (e) { return []; }
    },
    answer: function (state) {
      try {
        var res = {};
        var liv = living(state);
        if (!state.inbox.length) return res;
        var hardball = state.year >= state.limits.maxYears;
        var grudges = grudgesOf(state);
        var peace = peacePartners(state, hardball, grudges);
        var target = pickTarget(state, peace, grudges, hardball) || MEM.target;
        var idx = indexLegal(state);
        var mine = ownUnits(state);
        var provs = provById(state);
        var occ = occMap(state);
        // intended destinations (light)
        var want = {};
        mine.forEach(function (u) {
          var b = bestMoveFor(state, provs, occ, idx, u, target, peace, hardball, dmzBlocked(state, hardball));
          if (b.dest && b.value > 8) want[b.dest] = true;
        });
        var pendingSupport = supportObls(state).length;
        state.inbox.forEach(function (p) {
          var a = 'reject';
          if (p.type === 'support') a = 'accept';
          else if (p.type === 'peace' || p.type === 'alliance') {
            var t = state.trust[p.from];
            var honest = !t || t.broken <= t.kept + 1;
            if (!hardball && p.from !== target && honest && liv.indexOf(p.from) >= 0) a = 'accept';
          } else if (p.type === 'dmz') {
            if (!hardball && p.from !== target && !want[p.terms.province]) a = 'accept';
          } else if (p.type === 'request-support') {
            var aligned = false;
            var bo = occ[p.terms.unit] || null;
            void bo;
            // their requested support target should be our target's asset or neutral
            var destProv = p.terms.dest === 'hold' ? p.terms.unit : p.terms.dest;
            var holder = occ[destProv] || null;
            var holderPower = holder ? holder.power :
              (Object.hasOwn(state.owners, destProv) ? state.owners[destProv] : null);
            if (!holder || holder.power !== state.you) aligned = true;
            if (holderPower && peace[holderPower] && holder) aligned = false;
            if ((holderPower === target) || holderPower === null || holderPower === undefined) aligned = true;
            var can = mine.some(function (u) { return canSupport(idx, u.at, p.terms.unit, p.terms.dest); });
            if (can && aligned && pendingSupport < Math.max(0, mine.length - 1) && p.from !== target) {
              a = 'accept'; pendingSupport++;
            }
          }
          res[p.id] = a;
        });
        return res;
      } catch (e) {
        try {
          return Object.fromEntries(state.inbox.map(function (p) { return [p.id, 'reject']; }));
        } catch (e2) { return {}; }
      }
    },
    orders: function (state) {
      try {
        return planOrders(state);
      } catch (e) {
        try {
          return ownUnits(state).map(function (u) { return { unit: u.at, type: 'hold' }; });
        } catch (e2) { return []; }
      }
    },
    retreats: function (state) {
      try {
        var out = {};
        (state.retreats || []).forEach(function (r) {
          var best = null, bestS = -1e12;
          (r.options || []).forEach(function (o) {
            var s = scoreRetreat(state, r, o);
            if (s > bestS || (s === bestS && (best === null || cmp(o, best) < 0))) { bestS = s; best = o; }
          });
          out[r.at] = best || null;
        });
        return out;
      } catch (e) { return {}; }
    },
    builds: function (state) {
      try {
        var me = state.you;
        var mine = ownUnits(state);
        var provs = provById(state);
        var delta = (state.centresByPower[me] || 0) - mine.length;
        if (delta === 0) return [];
        if (delta < 0) {
          var goals = {};
          Object.keys(state.owners).forEach(function (id) { if (state.owners[id] !== me) goals[id] = true; });
          var scored = mine.map(function (u) {
            var keep = 0;
            if (Object.hasOwn(state.owners, u.at)) keep += state.owners[u.at] === me ? 30 : 26;
            if (provs[u.at] && provs[u.at].home === me) keep += 8;
            var adj = state.map.adjacency[u.at] || [];
            var front = 0;
            adj.forEach(function (nb) { if (goals[nb]) front++; });
            keep += Math.min(front, 4) * 2;
            keep -= Math.min(bfsDist(state, u.at, goals), 8);
            return { u: u, keep: keep };
          }).sort(function (a, b) { return a.keep - b.keep || cmp(a.u.at, b.u.at); });
          return scored.slice(0, -delta).map(function (x) { return { disband: x.u.at }; });
        }
        var homes = state.map.provinces.filter(function (p) {
          return p.home === me && state.owners[p.id] === me &&
            !state.units.some(function (u) { return u.at === p.id; });
        });
        var coastalHomes = state.map.provinces.filter(function (p) { return p.home === me && p.coastal; }).length;
        var wantFleet = coastalHomes >= 2 ? 2 : coastalHomes >= 1 ? 1 : 0;
        var fleets = mine.filter(function (u) { return u.type === 'fleet'; }).length;
        homes.sort(function (a, b) {
          function front(p) {
            var n = 0;
            (state.map.adjacency[p.id] || []).forEach(function (nb) {
              if (Object.hasOwn(state.owners, nb) && state.owners[nb] !== me) n++;
            });
            return n;
          }
          return front(b) - front(a) || cmp(a.id, b.id);
        });
        var res = [];
        homes.slice(0, delta).forEach(function (p) {
          var type = (p.coastal && fleets < wantFleet) ? 'fleet' : 'army';
          if (type === 'fleet') fleets++;
          res.push({ type: type, at: p.id });
        });
        return res;
      } catch (e) { return []; }
    }
  };

  module.exports = api;
})();
