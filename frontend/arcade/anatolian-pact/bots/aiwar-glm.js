(function () {
  'use strict';

  const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  function sortedIds(obj) { return Object.keys(obj).sort(compare); }

  function makeCtx(state) {
    const C = {};
    C.s = state;
    C.you = state.you;
    C.P = {};
    state.map.provinces.forEach(p => { C.P[p.id] = p; });
    C.ADJ = state.map.adjacency;
    C.scList = sortedIds(C.P).filter(id => C.P[id].sc);
    C.units = state.units;
    C.at = {};
    C.units.forEach(u => { C.at[u.at] = u; });
    C.owners = state.owners;
    C.myUnits = C.units.filter(u => u.power === C.you);
    C.powerNames = Object.keys(state.centresByPower);
    C.alive = {};
    C.powerNames.forEach(p => {
      C.alive[p] = (state.centresByPower[p] || 0) > 0 || C.units.some(u => u.power === p);
    });
    C.foes = C.powerNames.filter(p => p !== C.you && C.alive[p]);
    return C;
  }

  function canMove(C, unit, dest) {
    const to = C.P[dest];
    const from = C.P[unit.at];
    if (!to || !from || !C.ADJ[unit.at] || !C.ADJ[unit.at].includes(dest)) return false;
    if (unit.type === 'army') return to.type === 'land';
    if (unit.type !== 'fleet' || (to.type === 'land' && !to.coastal)) return false;
    return from.type === 'sea' || to.type === 'sea' ||
      C.ADJ[unit.at].some(id => C.P[id].type === 'sea' && C.ADJ[dest].includes(id));
  }

  function normalize(C, units, submitted) {
    const at = {};
    units.forEach(unit => { at[unit.at] = unit; });
    return units.map(unit => {
      const entries = (Array.isArray(submitted) ? submitted : [])
        .filter(order => order && order.unit === unit.at);
      const order = entries[0];
      let valid = entries.length <= 1;
      let normalized = { unit: unit.at, type: 'hold' };
      if (order && order.type === 'move' && canMove(C, unit, order.dest)) {
        normalized = { unit: unit.at, type: 'move', dest: order.dest };
      } else if (order && order.type === 'support' && at[order.target] && order.target !== unit.at) {
        const holding = order.targetDest === 'hold' || order.targetDest === undefined;
        const dest = holding ? order.target : order.targetDest;
        if (canMove(C, unit, dest) && (holding || canMove(C, at[order.target], dest))) {
          normalized = {
            unit: unit.at, type: 'support', target: order.target,
            targetDest: holding ? 'hold' : dest
          };
        } else valid = false;
      } else if (order && order.type !== 'hold') valid = false;
      if (!valid) normalized = { unit: unit.at, type: 'hold' };
      return Object.assign({}, normalized, { power: unit.power, valid });
    });
  }

  function adjudicate(C, units, submitted) {
    const orders = normalize(C, units, submitted);
    const at = {};
    units.forEach(unit => { at[unit.at] = unit; });
    const byUnit = {};
    orders.forEach(order => { byUnit[order.unit] = order; });
    const moves = orders.filter(order => order.type === 'move');
    const supports = orders.filter(order => {
      if (order.type !== 'support') return false;
      const target = byUnit[order.target];
      return order.targetDest === 'hold' ?
        target.type !== 'move' :
        target.type === 'move' && target.dest === order.targetDest;
    });

    function calculate(removed) {
      const liveMoves = moves.filter(move => !removed[move.unit] || removed[move.unit] !== move.dest);
      const isCut = support => liveMoves.some(move =>
        move.power !== support.power && move.dest === support.unit &&
        move.unit !== (support.targetDest === 'hold' ? support.target : support.targetDest));
      const active = supports.filter(support => !removed[support.unit] && !isCut(support));
      const helpers = order => active.filter(support => support.target === order.unit);
      const strength = (order, excluding) =>
        1 + helpers(order).filter(support => support.power !== excluding).length;
      const incoming = dest => liveMoves.filter(move => move.dest === dest);
      const candidates = {};
      sortedIds(C.P).forEach(dest => {
        const attacks = incoming(dest);
        if (!attacks.length) return;
        const best = Math.max.apply(null, attacks.map(move => strength(move)));
        const winners = attacks.filter(move => strength(move) === best);
        if (winners.length === 1) candidates[winners[0].unit] = winners[0];
      });
      const success = {};
      const visiting = new Set();

      function succeeds(move) {
        if (Object.prototype.hasOwnProperty.call(success, move.unit)) return success[move.unit];
        if (!candidates[move.unit]) return false;
        if (visiting.has(move.unit)) return true;
        visiting.add(move.unit);
        const defender = at[move.dest];
        let ok = !defender;
        if (defender) {
          const other = byUnit[defender.at];
          const head = other.type === 'move' && other.dest === move.unit;
          const vacates = !head && other.type === 'move' && succeeds(other);
          if (vacates) ok = true;
          else if (defender.power !== move.power) {
            const attack = strength(move, defender.power);
            const defence = head ? strength(other) : other.type === 'move' ? 1 : strength(other);
            ok = attack > defence && incoming(move.dest).every(rival =>
              rival.unit === move.unit || attack > strength(rival));
          }
        }
        visiting.delete(move.unit);
        success[move.unit] = ok;
        return ok;
      }

      moves.forEach(succeeds);
      const dislodged = {};
      moves.filter(move => success[move.unit]).forEach(move => {
        if (at[move.dest] && !success[move.dest]) dislodged[move.dest] = move.unit;
      });
      return { success, dislodged, active, liveMoves, strength, isCut };
    }

    let removed = {}, solved;
    const seen = new Set();
    for (;;) {
      solved = calculate(removed);
      const key = JSON.stringify(Object.entries(solved.dislodged).sort());
      if (key === JSON.stringify(Object.entries(removed).sort())) break;
      if (seen.has(key)) break;
      seen.add(key);
      removed = solved.dislodged;
    }
    const standoffs = sortedIds(C.P).filter(dest => {
      const attacks = solved.liveMoves.filter(move => move.dest === dest);
      if (attacks.length < 2) return false;
      const best = Math.max.apply(null, attacks.map(move => solved.strength(move)));
      return attacks.filter(move => solved.strength(move) === best).length > 1 &&
        !attacks.some(move => solved.success[move.unit]);
    });
    const displaced = units.filter(unit => solved.dislodged[unit.at])
      .map(unit => Object.assign({}, unit, { attacker: solved.dislodged[unit.at] }));
    const survivors = units.filter(unit => !solved.dislodged[unit.at]).map(unit => ({
      power: unit.power, type: unit.type,
      at: solved.success[unit.at] ? byUnit[unit.at].dest : unit.at
    }));
    return { survivors, displaced, standoffs, success: solved.success };
  }

  function musterAgainst(C, power, dest) {
    let n = 0;
    C.units.forEach(e => {
      if (e.power !== power && e.at !== dest && canMove(C, e, dest)) n++;
    });
    return n;
  }

  function predictFor(C, power, aggressive) {
    const own = C.units.filter(u => u.power === power);
    const plan = {};
    own.forEach(u => { plan[u.at] = { unit: u.at, type: 'hold' }; });
    const ownerOf = pid => (Object.prototype.hasOwnProperty.call(C.owners, pid) ? C.owners[pid] : null);

    own.forEach(u => {
      const a = u.at;
      if (!C.P[a].sc) return;
      const muster = musterAgainst(C, power, a);
      const sup = own.find(v => v.at !== a && plan[v.at].type === 'hold' && canMove(C, v, a));
      if (muster >= 2 && sup && aggressive && supportersPossible(C, power, a, a) > 0) {
        plan[sup.at] = { unit: sup.at, type: 'support', target: a, targetDest: 'hold' };
      }
      plan[a] = { unit: a, type: 'hold' };
    });

    const freeCap = [];
    const attacks = [];
    C.scList.forEach(p => {
      const occ = C.at[p];
      const owner = ownerOf(p);
      if (occ && occ.power === power) return;
      if (!occ) freeCap.push({ p, v: owner === power ? 4 : 6 });
    });
    C.scList.forEach(p => {
      const occ = C.at[p];
      if (occ && occ.power !== power) {
        attacks.push({ p, v: ownerOf(p) === power ? 8 : 4 });
      }
    });
    freeCap.sort((a, b) => b.v - a.v || compare(a.p, b.p));
    freeCap.forEach(({ p }) => {
      const mover = own.find(u => plan[u.at].type === 'hold' && u.at !== p && canMove(C, u, p));
      if (mover) plan[mover.at] = { unit: mover.at, type: 'move', dest: p };
    });
    if (aggressive) {
      attacks.sort((a, b) => b.v - a.v || compare(a.p, b.p));
      attacks.forEach(({ p }) => {
        const attacker = own.find(u => plan[u.at].type === 'hold' && u.at !== p && canMove(C, u, p));
        if (!attacker) return;
        const sup = own.find(u => u.at !== p && u.at !== attacker.at &&
          plan[u.at].type === 'hold' && canMove(C, u, p));
        if (!sup) return;
        plan[attacker.at] = { unit: attacker.at, type: 'move', dest: p };
        plan[sup.at] = { unit: sup.at, type: 'support', target: attacker.at, targetDest: p };
      });
    }

    const supUsed = new Set();
    own.forEach(u => {
      if (plan[u.at].type !== 'hold') return;
      const target = own.find(v => v.at !== u.at && !supUsed.has(v.at) && C.P[v.at].sc &&
        ownerOf(v.at) === power && canMove(C, u, v.at));
      if (target) {
        plan[u.at] = { unit: u.at, type: 'support', target: target.at, targetDest: 'hold' };
        supUsed.add(target.at);
      }
    });
    return sortedIds(plan).map(k => plan[k]);
  }

  function supportersPossible(C, power, dest, excludeAt) {
    let n = 0;
    C.units.filter(u => u.power === power).forEach(u => {
      if (u.at !== dest && u.at !== excludeAt && canMove(C, u, dest)) n++;
    });
    return n;
  }

  function promiseConstraints(state, C) {
    const noMove = {};
    const noInto = {};
    const pins = [];
    (state.accepted || []).forEach(promise => {
      if (promise.power !== C.you) return;
      if (promise.type === 'peace' || promise.type === 'alliance') {
        C.units.forEach(u => {
          if (u.power === promise.partner) { noMove[u.at] = true; noInto[u.at] = true; }
        });
      } else if (promise.type === 'dmz') {
        noMove[promise.terms.province] = true;
      } else if (promise.type === 'support') {
        pins.push({ unit: promise.terms.unit, dest: promise.terms.dest });
      }
    });
    return { noMove, noInto, pins };
  }

  function seasonIntel(state, C) {
    const guilt = {};
    const pressure = {};
    C.foes.forEach(f => { guilt[f] = 0; pressure[f] = 0; });
    C.foes.forEach(f => {
      const t = state.trust[f];
      if (t && t.brokenPromises) {
        t.brokenPromises.forEach(bp => {
          if (bp.partner === C.you) guilt[f] += (bp.type === 'peace' || bp.type === 'alliance') ? 2 : 1;
        });
      }
    });
    C.units.forEach(e => {
      if (e.power === C.you) return;
      C.ADJ[e.at].forEach(nx => {
        const myUnit = C.at[nx];
        const myOwner = C.owners[nx];
        if (((myUnit && myUnit.power === C.you) || myOwner === C.you) && canMove(C, e, nx)) {
          pressure[e.power] = (pressure[e.power] || 0) + 1;
        }
      });
    });
    return { guilt, pressure };
  }

  function countOwned(C, power) {
    let n = 0;
    for (const p in C.owners) if (C.owners[p] === power) n++;
    return n;
  }

  function evalPlanValue(C, E, mineOrders) {
    const sim = adjudicate(C, C.units, E.concat(mineOrders));
    const season = C.s.season;
    let v = 0;
    const occAt = {};
    sim.survivors.forEach(u => { occAt[u.at] = u.power; });
    C.scList.forEach(p => {
      const ow = C.owners[p];
      const top = occAt[p];
      if (ow === C.you) {
        if (top === C.you) v += season === 'Autumn' ? 6 : 5;
        else if (!top) {
          let risk = 0;
          C.units.forEach(e => {
            if (e.power !== C.you && canMove(C, e, p)) risk++;
          });
          v -= season === 'Autumn' ? (1 + 1.4 * Math.min(risk, 2)) : 3;
        }
        else v -= season === 'Autumn' ? 12 : 7;
      } else if (!ow) {
        if (top === C.you) v += season === 'Autumn' ? 8 : 4.5;
        else if (top) v -= season === 'Autumn' ? 2 : 1;
      } else if (top === C.you) {
        v += season === 'Autumn' ? 10 : 5.5;
        if (!sim.survivors.some(u => u.power === ow) && countOwned(C, ow) <= 1) v += 4;
      } else if (top === ow) {
      } else if (top) {
        v -= season === 'Autumn' ? 1.2 : 0.55;
      }
    });
    sim.displaced.forEach(u => {
      v += u.power === C.you ? -7.5 : 4.5;
    });
    const elim = {};
    sim.survivors.forEach(u => { elim[u.power] = (elim[u.power] || 0) + 1; });
    C.foes.forEach(f => {
      if (!elim[f] && countOwned(C, f) === 0) v += 5;
    });
    let myOwned = 0;
    for (const p in C.owners) if (C.owners[p] === C.you) myOwned++;
    if (!sim.survivors.some(u => u.power === C.you) && myOwned === 0) v -= 60;
    return v;
  }

  const CAND_MAX = 11;

  function planOrders(state) {
    const C = makeCtx(state);
    if (!C.myUnits.length) return [];
    const cons = promiseConstraints(state, C);
    const intel = seasonIntel(state, C);
    void intel;

    const locks = {};
    cons.pins.forEach(pin => {
      let best = null;
      C.myUnits.forEach(u => {
        const legal = state.legalOrders[u.at] || [];
        legal.forEach(o => {
          if (o.type !== 'support') return;
          const match = o.target === pin.unit &&
            ((pin.dest === 'hold' && o.targetDest === 'hold') || o.targetDest === pin.dest);
          if (match && (!best || u.at < best.at)) best = { at: u.at, order: o };
        });
      });
      if (best) locks[best.at] = best.order;
    });

    const destinations = {};
    C.myUnits.forEach(u => {
      const legal = state.legalOrders[u.at] || [];
      legal.forEach(o => {
        if (o.type !== 'move' || cons.noMove[o.dest]) return;
        const occ = C.at[o.dest];
        const sc = C.P[o.dest].sc;
        if (sc && (!occ || occ.power !== C.you)) destinations[o.dest] = true;
        else if (!sc && !occ) destinations[o.dest] = true;
      });
    });

    const unitIds = C.myUnits.map(u => u.at).sort(compare);
    const choices = {};
    const locked = {};
    unitIds.forEach(a => {
      const legal = state.legalOrders[a] || [];
      const cand = [];
      const hold = legal.find(o => o.type === 'hold');
      if (hold) cand.push(hold);
      const moves = [];
      const sups = [];
      legal.forEach(o => {
        if (o.type === 'move') {
          if (cons.noMove[o.dest]) return;
          const occ = C.at[o.dest];
          let cls = -1;
          if (C.P[o.dest].sc && (!occ || occ.power !== C.you)) cls = 0;
          else if (!C.P[o.dest].sc && !occ) cls = 3;
          if (cls >= 0) moves.push({ o, cls });
        } else if (o.type === 'support') {
          const t = C.at[o.target];
          if (!t) return;
          const isMine = t.power === C.you;
          let pinMatch = false;
          if (!isMine) {
            const pin = cons.pins.find(pn => pn.unit === o.target);
            pinMatch = pin && (o.targetDest === pin.dest ||
              (pin.dest === 'hold' && o.targetDest === 'hold'));
            if (!pinMatch) return;
          }
          if (o.targetDest !== 'hold' && cons.noInto[o.targetDest]) return;
          let cls = -1;
          if (o.targetDest === 'hold') cls = isMine ? 1 : -1;
          else if (destinations[o.targetDest]) cls = 2;
          if (cls >= 0) sups.push({ o, cls });
        }
      });
      moves.sort((x, y) => x.cls - y.cls || compare(x.o.dest, y.o.dest));
      sups.sort((x, y) => x.cls - y.cls || compare(x.o.target, y.o.target) ||
        compare(x.o.targetDest, y.o.targetDest));
      moves.filter(m => m.cls === 0).slice(0, 5).forEach(m => cand.push(m.o));
      moves.filter(m => m.cls === 3).slice(0, 2).forEach(m => cand.push(m.o));
      sups.filter(s => s.cls === 1).slice(0, 4).forEach(s => cand.push(s.o));
      sups.filter(s => s.cls === 2).slice(0, 6).forEach(s => cand.push(s.o));
      choices[a] = cand;
      locked[a] = locks[a] || null;
    });

    const scCons = [];
    const scAgg = [];
    C.foes.forEach(f => {
      predictFor(C, f, false).forEach(o => scCons.push(o));
      predictFor(C, f, true).forEach(o => scAgg.push(o));
    });

    const scenarios = [{ list: scCons, w: 0.25 }, { list: scAgg, w: 0.25 }];
    const unitByAt = {};
    C.units.forEach(u => { unitByAt[u.at] = u; });
    const histEntries = (state.history || []).slice().reverse();
    histEntries.some(entry => {
      const per = (entry && entry.orders) || {};
      const board = [];
      C.foes.forEach(f => {
        (per[f] || []).forEach(o => {
          const u = unitByAt[o.unit];
          if (!u || u.power !== f) return;
          if (o.type === 'move' && !canMove(C, u, o.dest)) return;
          if (o.type === 'support') {
            const t = unitByAt[o.target];
            if (!t || (o.targetDest !== 'hold' && !canMove(C, u, o.targetDest))) return;
          }
          board.push(o);
        });
      });
      if (board.length) scenarios.push({ list: board, w: 0.5 });
      return false;
    });

    const plan = {};
    const planArr = () => unitIds.map(a => plan[a]).filter(Boolean);
    const planKey = () => unitIds.map(a => {
      const o = plan[a];
      if (!o) return 'H';
      if (o.type === 'move') return 'M' + o.dest;
      if (o.type === 'support') return 'S' + o.target + (o.targetDest === 'hold' ? 'H' : 'M' + o.targetDest);
      return 'X';
    }).join(',');

    unitIds.forEach(a => {
      plan[a] = locks[a] && choices[a].indexOf(locks[a]) >= 0 ? locks[a] :
        (choices[a][0] || null);
    });

    const cache = new Map();
    function evalAll() {
      const key = planKey();
      let val = cache.get(key);
      if (val === undefined) {
        val = 0;
        scenarios.forEach(s => { val += s.w * evalPlanValue(C, s.list, planArr()); });
        cache.set(key, val);
      }
      return val;
    }

    const supportIndex = {};
    unitIds.forEach(b => {
      choices[b].forEach(o => {
        if (o.type === 'support') {
          const key = o.target + '>' + o.targetDest;
          (supportIndex[key] = supportIndex[key] || []).push(b);
        }
      });
    });

    function singleVarSweep() {
      let improved = false;
      for (const a of unitIds) {
        if (locked[a]) continue;
        const cur = plan[a];
        let bestV = evalAll();
        let bestC = cur;
        for (const c of choices[a]) {
          if (c === cur) continue;
          plan[a] = c;
          const v = evalAll();
          if (v > bestV + 1e-9) { bestV = v; bestC = c; improved = true; }
        }
        plan[a] = bestC;
      }
      return improved;
    }

    function pairSweep() {
      let improved = false;
      const applyPair = (a, mA, b, sup) => {
        const before = evalPlanValue(C, scCons, planArr()) * 0.5 +
          evalPlanValue(C, scAgg, planArr()) * 0.5;
        const prevA = plan[a], prevB = plan[b];
        plan[a] = mA; plan[b] = sup;
        const after = evalPlanValue(C, scCons, planArr()) * 0.5 +
          evalPlanValue(C, scAgg, planArr()) * 0.5;
        if (after > before + 1e-9) return true;
        plan[a] = prevA; plan[b] = prevB;
        return false;
      };
      for (const a of unitIds) {
        if (locked[a]) continue;
        for (const mA of choices[a]) {
          if (mA.type !== 'move') continue;
          const key = a + '>' + mA.dest;
          const supporters = supportIndex[key] || [];
          for (const b of supporters) {
            if (locked[b] || b === a) continue;
            const sup = choices[b].find(o => o.type === 'support' && o.target === a &&
              o.targetDest === mA.dest);
            if (!sup) continue;
            if (applyPair(a, mA, b, sup)) { improved = true; break; }
          }
          if (improved) break;
        }
        if (improved) break;
      }
      return improved;
    }

    let sweeps = 8;
    while (sweeps-- > 0) {
      const imp1 = singleVarSweep();
      const imp2 = singleVarSweep();
      const impP = pairSweep();
      if (!imp1 && !imp2 && !impP) break;
    }
    evalAll();
    return unitIds.map(a => plan[a]).filter(Boolean);
  }

  function retreatOptionsFor(C, unit, unitsAll, standoffs) {
    return C.ADJ[unit.at].filter(dest => canMove(C, unit, dest) &&
      dest !== unit.attacker && !standoffs.includes(dest) &&
      !unitsAll.some(other => other.at === dest));
  }

  function planRetreats(state) {
    const C = makeCtx(state);
    if (!state.retreats.length) return {};
    const season = state.season;
    const cands = [];
    state.retreats.forEach(u => {
      const opts = u.options || retreatOptionsFor(C, u, C.units, []);
      const scored = opts.map(d => {
        let sc = 0.5;
        const owner = C.owners[d];
        if (C.P[d].sc) {
          if (owner === C.you) sc += season === 'Spring' ? 4 : 3;
          else if (!owner) sc += season === 'Autumn' ? 40 : 6;
          else sc += season === 'Autumn' ? 36 : 5;
        }
        let threat = 0;
        C.units.forEach(e => {
          if (e.power !== C.you && e.at !== d && canMove(C, e, d)) threat++;
        });
        sc -= (season === 'Spring' ? 2 : 1) * threat;
        return { d, sc };
      }).sort((a, b) => b.sc - a.sc || compare(a.d, b.d));
      cands.push({ at: u.at, scored });
    });
    cands.sort((a, b) => a.scored.length - b.scored.length || compare(a.at, b.at));
    const used = {};
    const res = {};
    cands.forEach(c => {
      const pick = c.scored.find(s => !used[s.d]);
      if (pick) { used[pick.d] = true; res[c.at] = pick.d; }
      else res[c.at] = null;
    });
    return res;
  }

  function bfsLand(C, from) {
    const dist = {};
    dist[from] = 0;
    const q = [from];
    for (let i = 0; i < q.length; i++) {
      const id = q[i];
      C.ADJ[id].forEach(nx => {
        if (C.P[nx].type !== 'land') return;
        if (dist[nx] === undefined) { dist[nx] = dist[id] + 1; q.push(nx); }
      });
    }
    return dist;
  }

  function planBuilds(state) {
    const C = makeCtx(state);
    const own = C.myUnits;
    const delta = (state.centresByPower[C.you] || 0) - own.length;
    if (delta === 0) return [];
    if (delta > 0) {
      const list = [];
      sortedIds(C.P).forEach(id => {
        const p = C.P[id];
        if (p.home !== C.you || C.owners[id] !== C.you) return;
        if (C.at[id]) return;
        let pressure = 0;
        C.units.forEach(e => {
          if (e.power !== C.you && canMove(C, e, id)) pressure++;
        });
        const dist = bfsLand(C, id);
        let closest = 99;
        C.scList.forEach(sc => {
          const ow = C.owners[sc];
          if (ow === C.you && C.at[sc]) return;
          if (dist[sc] !== undefined && dist[sc] < closest) closest = dist[sc];
        });
        list.push({ at: id, score: 2.2 * pressure + Math.max(0, 8 - closest) });
      });
      list.sort((a, b) => b.score - a.score || compare(a.at, b.at));
      return list.slice(0, delta).map(h => ({ type: 'army', at: h.at }));
    }
    const need = -delta;
    const ranked = own.map(u => {
      let sc = 0;
      if (C.P[u.at].sc) sc += C.owners[u.at] === C.you ? 10 : 7;
      let pressure = 0;
      C.units.forEach(e => {
        if (e.power !== C.you && e.at !== u.at && canMove(C, e, u.at)) pressure++;
      });
      sc += Math.min(2, pressure);
      if (u.type === 'fleet') sc -= 2;
      const dist = bfsLand(C, u.at);
      let closest = 99;
      C.scList.forEach(scp => {
        const ow = C.owners[scp];
        if (ow === C.you && C.at[scp]) return;
        if (dist[scp] !== undefined && dist[scp] < closest) closest = dist[scp];
      });
      sc += Math.min(closest, 8) * 0.55;
      return { at: u.at, sc };
    }).sort((a, b) => a.sc - b.sc || compare(a.at, b.at));
    return ranked.slice(0, need).map(r => ({ disband: r.at }));
  }

  function planTargets(state) {
    const C = makeCtx(state);
    const moveDests = {};
    const targets = {};
    let plan = null;
    try {
      plan = planOrders(state);
      plan.forEach(o => {
        if (o.type === 'move') {
          moveDests[o.dest] = true;
          const occ = C.at[o.dest];
          if (occ && occ.power !== C.you) targets[occ.power] = true;
        } else if (o.type === 'support' && o.targetDest !== 'hold') {
          moveDests[o.targetDest] = true;
          const occ = C.at[o.targetDest];
          if (occ && occ.power !== C.you) targets[occ.power] = true;
        }
      });
    } catch (err) {
    }
    return { targets, moveDests, plan, C };
  }

  function myValidProposal(C, p) {
    const me = C.you;
    if (!p || !p.to || p.to === me || !C.alive[p.to]) return false;
    if (!p.terms || typeof p.terms !== 'object' || Array.isArray(p.terms)) return false;
    const fields = {
      peace: [], alliance: ['target'], dmz: ['province'],
      support: ['dest', 'unit'], 'request-support': ['dest', 'unit']
    };
    const fkeys = Object.keys(p.terms).sort(compare);
    if (!Object.prototype.hasOwnProperty.call(fields, p.type)) return false;
    if (JSON.stringify(fkeys) !== JSON.stringify(fields[p.type])) return false;
    if (p.type === 'peace') return true;
    if (p.type === 'alliance') {
      return !!C.alive[p.terms.target] && p.terms.target !== me && p.terms.target !== p.to;
    }
    if (p.type === 'dmz') return !!C.P[p.terms.province];
    const beneficiary = p.type === 'support' ? p.to : me;
    const supporter = p.type === 'support' ? me : p.to;
    const target = C.units.find(u => u.at === p.terms.unit && u.power === beneficiary);
    if (!target) return false;
    if (p.terms.dest !== 'hold' && !canMove(C, target, p.terms.dest)) return false;
    const dest = p.terms.dest === 'hold' ? p.terms.unit : p.terms.dest;
    return C.units.some(u => u.power === supporter && u.at !== p.terms.unit && canMove(C, u, dest));
  }

  function planPropose(state) {
    const C = makeCtx(state);
    const out = [];
    const info = planTargets(state);
    const intel = seasonIntel(state, C);
    const warm = [];
    C.foes.forEach(f => {
      const t = state.trust[f] || { kept: 0, broken: 0 };
      const warmth = 2 * (t.kept || 0) - 3 * (t.broken || 0) - 2 * (intel.guilt[f] || 0) +
        0.5 * Math.max(0, 6 - (state.centresByPower[f] || 0)) + 2 * (intel.pressure[f] || 0);
      warm.push({ f, warmth });
    });
    warm.sort((a, b) => b.warmth - a.warmth || compare(a.f, b.f));
    warm.filter(w => !info.targets[w.f]).slice(0, 2).forEach(w =>
      out.push({ to: w.f, type: 'peace', terms: {} }));

    const scary = threatList(C);
    scary.slice(0, 2).forEach(thr => {
      const foe = thr.attacker;
      if (info.targets[foe]) return;
      if (out.some(p => p.to === foe)) return;
      out.push({ to: foe, type: 'dmz', terms: { province: thr.province } });
    });

    let bestFoe = null, bestScore = 0.4;
    C.foes.forEach(f => {
      if (info.targets[f]) return;
      const sc = (intel.guilt[f] || 0) + 0.6 * Math.max(0, (state.centresByPower[f] || 0) -
        (state.centresByPower[C.you] || 0)) + ((state.centresByPower[f] || 0) >= 7 ? 1 : 0);
      if (sc > bestScore) { bestScore = sc; bestFoe = f; }
    });
    if (bestFoe) {
      const partner = warm.find(w => !info.targets[w.f] && w.f !== bestFoe &&
        !out.some(p => p.to === w.f));
      if (partner) out.push({ to: partner.f, type: 'alliance', terms: { target: bestFoe } });
    }
    return out.filter(p => myValidProposal(C, p)).slice(0, 6);
  }

  function threatList(C) {
    const threats = [];
    C.foes.forEach(f => {
      C.units.forEach(e => {
        if (e.power !== f) return;
        C.ADJ[e.at].forEach(nx => {
          if (C.owners[nx] === C.you && C.P[nx].sc && (!C.at[nx] || C.at[nx].power !== C.you)) {
            threats.push({ province: nx, attacker: f });
          }
        });
      });
    });
    const seen = new Set();
    return threats.filter(t => {
      const key = t.province + ',' + t.attacker;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function planAnswer(state) {
    const C = makeCtx(state);
    const res = {};
    if (!state.inbox.length) return res;
    const info = planTargets(state);
    const intel = seasonIntel(state, C);
    const planMoves = info.moveDests;
    state.inbox.forEach(p => {
      if (!p || !p.id) return;
      let answer = 'reject';
      if (p.type === 'peace') {
        answer = state.trust[p.from] && state.trust[p.from].broken > 4 ? 'reject' :
          info.targets[p.from] ? 'reject' : 'accept';
      } else if (p.type === 'alliance') {
        const t = p.terms && p.terms.target;
        const ok = t && t !== C.you && t !== p.from && C.alive[t] && !info.targets[p.from];
        answer = ok ? 'accept' : 'reject';
      } else if (p.type === 'dmz') {
        const prov = p.terms ? p.terms.province : null;
        const touchesMyPlan = planMoves[prov];
        const wanted = C.owners[prov] === C.you || !C.at[prov];
        answer = !touchesMyPlan && wanted && !info.targets[p.from] ? 'accept' : 'reject';
      } else if (p.type === 'support') {
        answer = 'accept';
      } else if (p.type === 'request-support') {
        const terms = p.terms || {};
        const capable = [];
        C.myUnits.forEach(u => {
          const legal = state.legalOrders[u.at] || [];
          legal.forEach(o => {
            if (o.type === 'support' && o.target === terms.unit &&
              ((terms.dest === 'hold' && o.targetDest === 'hold') || o.targetDest === terms.dest)) {
              capable.push(u.at);
            }
          });
        });
        const dangerous = terms.dest !== 'hold' && C.at[terms.dest] &&
          C.at[terms.dest].power === C.you;
        const planByUnit = {};
        (info.plan || []).forEach(o => { planByUnit[o.unit] = o; });
        let minCost = 99;
        capable.forEach(a => {
          const po = planByUnit[a];
          let costC = 0;
          if (po) {
            if (po.type === 'move') costC = C.P[po.dest] && C.P[po.dest].sc ? 4 : 1;
            else if (po.type === 'support') costC = 1;
          }
          minCost = Math.min(minCost, costC);
        });
        answer = capable.length && !dangerous && !info.targets[p.from] && minCost <= 1 ?
          'accept' : 'reject';
      }
      res[p.id] = answer;
    });
    return res;
  }

  module.exports = {
    name: 'Artemis',
    propose(state) {
      try { return planPropose(state); } catch (err) { return []; }
    },
    answer(state) {
      try { return planAnswer(state); } catch (err) { return {}; }
    },
    orders(state) {
      try { return planOrders(state); } catch (err) {
        try {
          const C = makeCtx(state);
          return C.myUnits.map(u => ({ unit: u.at, type: 'hold' }));
        } catch (err2) { return []; }
      }
    },
    retreats(state) {
      try { return planRetreats(state); } catch (err) {
        try {
          const out = {};
          state.retreats.forEach(u => { out[u.at] = (u.options && u.options[0]) || null; });
          return out;
        } catch (err2) { return {}; }
      }
    },
    builds(state) {
      try { return planBuilds(state); } catch (err) { return []; }
    },
    _dbg: { makeCtx, canMove, adjudicate, predictFor, planOrders, evalPlanValue }
  };
})();
