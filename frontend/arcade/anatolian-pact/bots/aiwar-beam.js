(function () {
  'use strict';

  function ownUnits(state) {
    return state.units.filter(u => u.power === state.you);
  }

  function livingPowers(state) {
    return Object.keys(state.centresByPower).filter(p => p !== state.you &&
      (state.centresByPower[p] > 0 || state.units.some(u => u.power === p)));
  }

  function allies(state) {
    const set = new Set();
    state.accepted.forEach(p => {
      if (['peace', 'alliance'].includes(p.type)) {
        const other = p.power === state.you ? p.partner : (p.partner === state.you ? p.power : null);
        if (other) set.add(other);
      }
    });
    return set;
  }

  function dmzs(state) {
    return new Set(state.accepted.filter(p => p.type === 'dmz').map(p => p.terms.province));
  }

  function hasLegalSupport(state, beneficiaryUnit, dest) {
    return Object.values(state.legalOrders).some(arr =>
      arr.some(o => o.type === 'support' && o.target === beneficiaryUnit && o.targetDest === dest));
  }

  function propose(state) {
    const proposals = [];
    const living = livingPowers(state);
    const counts = state.centresByPower;
    const all = living.concat([state.you]);
    const leader = all.slice().sort((a, b) => counts[b] - counts[a] || (a < b ? -1 : a > b ? 1 : 0))[0];
    const targetEnemy = leader === state.you
      ? living.slice().sort((a, b) => counts[b] - counts[a] || (a < b ? -1 : a > b ? 1 : 0))[0]
      : leader;

    const candidates = living.filter(p => p !== targetEnemy)
      .sort((a, b) => {
        const ta = state.trust[a].broken <= state.trust[a].kept ? 0 : 1;
        const tb = state.trust[b].broken <= state.trust[b].kept ? 0 : 1;
        return ta - tb || counts[b] - counts[a] || (a < b ? -1 : a > b ? 1 : 0);
      });

    for (const ally of candidates) {
      if (proposals.length >= 6) break;
      if (!targetEnemy || targetEnemy === ally) continue;
      proposals.push({ to: ally, type: 'alliance', terms: { target: targetEnemy } });
    }

    for (const p of living) {
      if (proposals.length >= 6) break;
      if (p === targetEnemy) continue;
      if (proposals.some(pr => pr.to === p)) continue;
      proposals.push({ to: p, type: 'peace', terms: {} });
    }

    return proposals.slice(0, 6);
  }

  function answer(state) {
    const result = {};
    state.inbox.forEach(proposal => {
      const from = proposal.from;
      const trust = state.trust[from] || { kept: 0, broken: 0 };
      const trustOk = trust.broken <= trust.kept + 1;
      let accept = false;
      if (['peace', 'alliance', 'dmz'].includes(proposal.type)) {
        if (proposal.type === 'alliance' && proposal.terms.target === state.you) accept = false;
        else accept = trustOk;
      } else if (proposal.type === 'support') {
        accept = trustOk;
      } else if (proposal.type === 'request-support') {
        const bu = proposal.terms.unit;
        const dest = proposal.terms.dest;
        const legal = hasLegalSupport(state, bu, dest);
        const occupantPower = (state.units.find(u => u.at === dest) || {}).power;
        const owner = state.owners[dest];
        const bad = (owner === state.you) || (occupantPower && allies(state).has(occupantPower));
        accept = trustOk && legal && !bad;
      }
      result[proposal.id] = accept ? 'accept' : 'reject';
    });
    return result;
  }

  function orders(state) {
    const own = ownUnits(state);
    const allySet = allies(state);
    const dmzSet = dmzs(state);
    const isAutumn = state.season === 'Autumn';
    const late = state.year >= state.limits.maxYears - 2;
    const ownedSCs = Object.keys(state.owners).filter(id => state.owners[id] === state.you);
    const targets = Object.keys(state.owners).filter(id => state.owners[id] !== state.you &&
      !state.units.some(u => u.power === state.you && u.at === id));

    const plan = Object.fromEntries(own.map(u => [u.at, { unit: u.at, type: 'hold' }]));
    const claimed = new Set();

    // promised supports first
    const promised = state.accepted.filter(p => p.power === state.you && p.type === 'support');
    promised.forEach(promise => {
      const bu = promise.terms.unit;
      const dest = promise.terms.dest;
      const supporter = own.find(u => plan[u.at].type === 'hold' &&
        (state.legalOrders[u.at] || []).some(o => o.type === 'support' && o.target === bu && o.targetDest === dest));
      if (supporter) {
        plan[supporter.at] = { unit: supporter.at, type: 'support', target: bu, targetDest: dest };
      }
    });

    // candidate moves
    const candidates = [];
    own.forEach(unit => {
      if (isAutumn && Object.prototype.hasOwnProperty.call(state.owners, unit.at) && state.owners[unit.at] !== state.you) return;
      const legal = state.legalOrders[unit.at] || [];
      legal.filter(o => o.type === 'move').forEach(order => {
        const dest = order.dest;
        if (state.units.some(u => u.at === dest && u.power === state.you)) return;
        const occupant = state.units.find(u => u.at === dest);
        const owner = state.owners[dest];
        const isSC = Object.prototype.hasOwnProperty.call(state.owners, dest);

        let blocked = dmzSet.has(dest);
        if (occupant && occupant.power === state.you) blocked = true;
        if (occupant && allySet.has(occupant.power) && state.year <= 4) blocked = true;
        if (isSC && owner && allySet.has(owner) && !occupant && state.year <= 4) blocked = true;
        if (blocked) return;

        let score = 0;
        if (isSC) {
          if (owner !== state.you) score += 40;
          if (owner === null) score += 10;
          if (owner && owner !== state.you) score += Math.min(20, (state.centresByPower[owner] || 0) * 2);
        } else {
          score += 5;
        }
        if (occupant) {
          if (occupant.power !== state.you) {
            score += 10;
            if (isSC && owner === state.you) score += 30;
          }
        } else {
          score += 5;
        }
        if (occupant && allySet.has(occupant.power)) score -= 40;
        if (isSC && owner && allySet.has(owner) && !occupant) score -= 30;
        const destProv = state.map.provinces.find(p => p.id === dest);
        if (unit.type === 'fleet') {
          if (destProv && destProv.type === 'sea') score += 15;
          else score -= 5;
        }

        if (ownedSCs.includes(unit.at)) score -= 20;

        const d = (function () {
          const seen = new Set([dest]);
          const q = [[dest, 0]];
          while (q.length) {
            const [at, depth] = q.shift();
            if (targets.includes(at)) return depth;
            for (const nx of (state.map.adjacency[at] || [])) {
              if (seen.has(nx)) continue;
              if (!PactEngine.canMove({ ...unit, at }, nx)) continue;
              seen.add(nx);
              q.push([nx, depth + 1]);
            }
          }
          return 99;
        })();
        score += Math.max(0, 12 - d) * 2;

        if (state.season === 'Spring') score = Math.round(score * 0.9);
        if (late && isSC && owner !== state.you) score += 20;

        candidates.push({ unit, order, score, dest, occupant });
      });
    });

    candidates.sort((a, b) => b.score - a.score ||
      a.order.unit.localeCompare(b.order.unit) ||
      a.order.dest.localeCompare(b.order.dest));

    let movesAssigned = 0;
    const multi = ['Phrygia', 'Lydia', 'Cilicia'].includes(state.you);
    const maxMoves = multi ? candidates.length : 1;
    for (const cand of candidates) {
      if (movesAssigned >= maxMoves) break;
      const unit = own.find(u => u.at === cand.unit.at);
      if (!unit || plan[unit.at].type !== 'hold') continue;
      if (claimed.has(cand.dest)) continue;
      let helper = null;
      if (cand.occupant && cand.occupant.power !== state.you) {
        helper = own.find(u => u.at !== unit.at && u.at !== cand.dest &&
          plan[u.at].type === 'hold' &&
          (state.legalOrders[u.at] || []).some(o => o.type === 'support' && o.target === unit.at && o.targetDest === cand.dest));
        if (!helper) continue;
      }
      plan[unit.at] = cand.order;
      claimed.add(cand.dest);
      if (helper) {
        plan[helper.at] = { unit: helper.at, type: 'support', target: unit.at, targetDest: cand.dest };
      }
      movesAssigned++;
    }

    // defense supports for idle units on owned SCs
    own.forEach(unit => {
      if (plan[unit.at].type !== 'hold') return;
      if (!ownedSCs.includes(unit.at)) return;
      const helper = own.find(u => u.at !== unit.at && plan[u.at].type === 'hold' &&
        (state.legalOrders[u.at] || []).some(o => o.type === 'support' && o.target === unit.at && o.targetDest === 'hold'));
      if (helper) {
        plan[helper.at] = { unit: helper.at, type: 'support', target: unit.at, targetDest: 'hold' };
      }
    });

    return Object.values(plan);
  }

  function retreats(state) {
    const result = {};
    state.retreats.forEach(u => {
      let best = null;
      let bestScore = -Infinity;
      (u.options || []).forEach(opt => {
        const sc = (function () {
          if (!Object.prototype.hasOwnProperty.call(state.owners, opt)) return 1;
          const owner = state.owners[opt];
          if (owner === null) return 10;
          if (owner !== state.you) return 15;
          return 5;
        })();
        if (sc > bestScore) {
          bestScore = sc;
          best = opt;
        }
      });
      result[u.at] = best;
    });
    return result;
  }

  function builds(state) {
    const delta = state.centresByPower[state.you] - ownUnits(state).length;
    if (delta <= 0) return [];
    const result = [];
    const emptyHomes = state.map.provinces.filter(p =>
      p.home === state.you && state.owners[p.id] === state.you &&
      !state.units.some(u => u.at === p.id));
    const fleetCount = ownUnits(state).filter(u => u.type === 'fleet').length;
    let builtFleet = 0;
    for (const p of emptyHomes) {
      if (result.length >= delta) break;
      let type = 'army';
      if (p.coastal && fleetCount + builtFleet < 2) {
        type = 'fleet';
        builtFleet++;
      }
      result.push({ type, at: p.id });
    }
    return result;
  }

  module.exports = {
    name: 'Anatolian Apex',
    propose,
    answer,
    orders,
    retreats,
    builds
  };
})();
