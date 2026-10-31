(function () {
  'use strict';

  function ownUnits(state) {
    return state.units.filter(unit => unit.power === state.you);
  }

  function unitAt(state, province) {
    return state.units.find(unit => unit.at === province);
  }

  function livingPowers(state) {
    return Object.keys(state.centresByPower).filter(power =>
      power !== state.you && (state.centresByPower[power] > 0 ||
        state.units.some(unit => unit.power === power)));
  }

  function alliedPowers(state) {
    const set = new Set();
    for (const promise of state.accepted) {
      if (promise.type === 'peace' || promise.type === 'alliance') {
        set.add(promise.power === state.you ? promise.partner : promise.power);
      }
    }
    return set;
  }

  function dmzProvinces(state) {
    const set = new Set();
    for (const promise of state.accepted) {
      if (promise.type === 'dmz') set.add(promise.terms.province);
    }
    return set;
  }

  function buildProvLookup(state) {
    const prov = {};
    for (const p of state.map.provinces) prov[p.id] = p;
    return prov;
  }

  function isSC(prov, province) {
    const p = prov[province];
    return Boolean(p && p.sc);
  }

  function isNeutralSC(prov, owners, province) {
    const p = prov[province];
    return Boolean(p && p.sc && !owners[province]);
  }

  function isEnemySC(prov, owners, you, province) {
    const p = prov[province];
    const owner = owners[province] || null;
    return Boolean(p && p.sc && owner && owner !== you);
  }

  function neighbourPowers(state, prov) {
    const set = new Set();
    for (const unit of ownUnits(state)) {
      const adj = state.map.adjacency[unit.at] || [];
      for (const id of adj) {
        const occ = unitAt(state, id);
        if (occ && occ.power !== state.you) set.add(occ.power);
        const owner = state.owners[id] || null;
        if (owner && owner !== state.you) set.add(owner);
      }
    }
    return set;
  }

  function focusEnemy(state, prov, owners) {
    const allies = alliedPowers(state);
    const nbs = neighbourPowers(state, prov);
    const candidates = livingPowers(state).filter(p => nbs.has(p) && !allies.has(p));
    if (!candidates.length) return null;
    return candidates.slice().sort((a, b) =>
      state.centresByPower[b] - state.centresByPower[a] &&
      0 || state.centresByPower[a] - state.centresByPower[b] ||
      state.units.filter(u => u.power === b).length - state.units.filter(u => u.power === a).length ||
      a.localeCompare(b))[0];
  }

  function supportOrder(state, supporterAt, attackerAt, dest) {
    const legal = state.legalOrders[supporterAt] || [];
    return legal.find(o => o.type === 'support' && o.target === attackerAt && o.targetDest === dest);
  }

  function canMoveInto(state, unit, dest) {
    return (state.legalOrders[unit.at] || []).some(o => o.type === 'move' && o.dest === dest);
  }

  function buildPlan(state) {
    const prov = buildProvLookup(state);
    const owners = state.owners;
    const you = state.you;
    const own = ownUnits(state);
    const allies = alliedPowers(state);
    const dmz = dmzProvinces(state);
    const enemy = focusEnemy(state, prov, owners);

    const plan = {};
    for (const unit of own) plan[unit.at] = { unit: unit.at, type: 'hold' };
    const usedUnit = new Set();
    const homeSC = {};
    for (const unit of own) homeSC[unit.at] = isSC(prov, unit.at) && owners[unit.at] === you;

    function moveCandidates(unit, excludeUsed) {
      const out = [];
      const h = homeSC[unit.at];
      const orders = state.legalOrders[unit.at] || [];
      for (const o of orders) {
        if (o.type !== 'move') continue;
        const dest = o.dest;
        if (dmz.has(dest)) continue;
        const occ = unitAt(state, dest);
        const owner = owners[dest] || null;
        if (occ && occ.power === you) continue;
        if (occ && allies.has(occ.power)) continue;
        if (isSC(prov, dest) && owner && allies.has(owner)) continue;
        let score = 0;
        if (isNeutralSC(prov, owners, dest)) score += 320;
        else if (isEnemySC(prov, owners, you, dest)) { score += 260; if (enemy && owner === enemy) score += 50; }
        else if (occ && occ.power !== you) { score += 100; if (enemy && occ.power === enemy) score += 30; }
        else if (!occ && !isSC(prov, dest)) score += 15;
        else continue;
        out.push({ unit, order: o, score, vacatesHome: h });
      }
      return out;
    }

    // ---- step 1: commit one supported assault on an enemy centre ----
    let homeBudget = 2;
    const enemyCentres = Object.keys(owners).filter(p =>
      isEnemySC(prov, owners, you, p) &&
      own.some(u => (state.map.adjacency[u.at] || []).includes(p)));
    enemyCentres.sort((a, b) => {
      const oa = owners[a], ob = owners[b];
      const fa = enemy === oa ? 0 : 1, fb = enemy === ob ? 0 : 1;
      const ea = !!unitAt(state, a), eb = !!unitAt(state, b);
      return fa - fb || (ea ? 0 : 1) - (eb ? 0 : 1) ||
        state.centresByPower[oa] - state.centresByPower[ob] || a.localeCompare(b);
    });
    function canMoveInto(unit, dest) {
      return (state.legalOrders[unit.at] || []).some(o => o.type === 'move' && o.dest === dest);
    }
    for (const target of enemyCentres) {
      const occ = unitAt(state, target);
      if (occ && allies.has(occ.power)) continue;
      const attackers = own.filter(u => !usedUnit.has(u.at) && canMoveInto(u, target));
      let picked = null;
      for (const a of attackers) {
        if (!occ) { picked = { move: a, support: null }; break; }
        for (const s of own) {
          if (s.at === a.at || usedUnit.has(s.at)) continue;
          if (supportOrder(state, s.at, a.at, target)) { picked = { move: a, support: s }; break; }
        }
        if (picked) break;
      }
      if (picked) {
        plan[picked.move.at] = { unit: picked.move.at, type: 'move', dest: target };
        usedUnit.add(picked.move.at);
        if (picked.support) {
          plan[picked.support.at] = supportOrder(state, picked.support.at, picked.move.at, target);
          usedUnit.add(picked.support.at);
        }
        if (homeSC[picked.move.at]) homeBudget--;
        break;
      }
    }

    // ---- step 2: remaining units expand within home-vacation budget ----
    const allCands = [];
    for (const unit of own) {
      if (usedUnit.has(unit.at)) continue;
      const h = homeSC[unit.at];
      allCands.push({ unit, order: { unit: unit.at, type: 'hold' }, score: h ? 200 : 10, vacatesHome: false });
      allCands.push(...moveCandidates(unit, true));
    }
    allCands.sort((a, b) => b.score - a.score ||
      (a.unit.at < b.unit.at ? -1 : a.unit.at > b.unit.at ? 1 : 0) ||
      (a.order.dest || '').localeCompare(b.order.dest || ''));
    const chosen = [];
    const usedDest = new Set();
    for (const cand of allCands) {
      if (usedUnit.has(cand.unit.at)) continue;
      if (cand.order.type === 'move' && usedDest.has(cand.order.dest)) continue;
      if (cand.order.type === 'move') usedDest.add(cand.order.dest);
      usedUnit.add(cand.unit.at);
      chosen.push(cand);
      plan[cand.unit.at] = cand.order;
    }
    function vacantHomes() {
      return chosen.filter(c => c.vacatesHome &&
        !chosen.some(o => o.order.type === 'move' && o.order.dest === c.unit.at)).length;
    }
    while (vacantHomes() > homeBudget) {
      let worst = null, worstIdx = -1;
      for (let i = 0; i < chosen.length; i++) {
        const c = chosen[i];
        if (!c.vacatesHome) continue;
        if (chosen.some(o => o.order.type === 'move' && o.order.dest === c.unit.at)) continue;
        if (worst === null || c.score < worst.score) { worst = c; worstIdx = i; }
      }
      if (!worst) break;
      chosen.splice(worstIdx, 1);
      usedUnit.delete(worst.unit.at);
      usedDest.delete(worst.order.dest);
      plan[worst.unit.at] = { unit: worst.unit.at, type: 'hold' };
    }

    // ---- step 3: support remaining centre captures ----
    const attacks = Object.values(plan).filter(o => o.type === 'move' &&
      (isNeutralSC(prov, owners, o.dest) || isEnemySC(prov, owners, you, o.dest)));
    attacks.sort((a, b) => {
      let sa = isNeutralSC(prov, owners, a.dest) ? 320 : 260;
      let sb = isNeutralSC(prov, owners, b.dest) ? 320 : 260;
      if (enemy) { if (owners[a.dest] === enemy) sa += 50; if (owners[b.dest] === enemy) sb += 50; }
      return sb - sa;
    });
    const supported = new Set();
    for (const attack of attacks) {
      if (supported.has(attack.unit)) continue;
      const supporter = own.find(u => u.at !== attack.unit && !usedUnit.has(u.at) &&
        supportOrder(state, u.at, attack.unit, attack.dest));
      if (supporter) {
        plan[supporter.at] = supportOrder(state, supporter.at, attack.unit, attack.dest);
        usedUnit.add(supporter.at);
        supported.add(attack.unit);
      }
    }

    return Object.values(plan);
  }

  function orders(state) { return buildPlan(state); }

  function propose(state) { return []; }

  function answer(state) {
    const answers = {};
    for (const proposal of state.inbox) {
      answers[proposal.id] = (proposal.type === 'dmz') ? 'accept' : 'reject';
    }
    return answers;
  }

  function retreats(state) {
    const result = {};
    for (const unit of state.retreats) {
      const options = unit.options || [];
      let pick = null;
      for (const opt of options) {
        const occ = unitAt(state, opt);
        const p = state.map.provinces.find(x => x.id === opt);
        const owner = state.owners[opt] || null;
        if (!occ && (!p || !p.sc || owner === state.you || owner === null)) { pick = opt; break; }
      }
      if (pick === null && options.length) pick = options[0];
      result[unit.at] = pick === null ? null : pick;
    }
    return result;
  }

  function builds(state) {
    const delta = (state.centresByPower[state.you] || 0) - ownUnits(state).length;
    if (delta <= 0) return [];
    const prov = buildProvLookup(state);
    const homes = state.map.provinces.filter(p =>
      p.home === state.you && state.owners[p.id] === state.you &&
      !state.units.some(u => u.at === p.id));
    const buildable = homes.slice().sort((a, b) => {
      if (a.coastal === b.coastal) return a.id < b.id ? -1 : 1;
      return b.coastal ? 1 : -1;
    });
    const out = [];
    for (let i = 0; i < Math.min(delta, buildable.length); i++) {
      out.push({ type: buildable[i].coastal ? 'fleet' : 'army', at: buildable[i].id });
    }
    return out;
  }

  module.exports = { name: 'Anatolian Vanguard', propose, answer, orders, retreats, builds };
})();
