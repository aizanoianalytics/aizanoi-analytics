(function () {
  'use strict';

  function own(state) {
    return state.units.filter(unit => unit.power === state.you);
  }

  function distance(state, unit, start) {
    const queue = [[start, 0]];
    const seen = new Set();
    for (let index = 0; index < queue.length; index++) {
      const [at, depth] = queue[index];
      if (seen.has(at)) continue;
      seen.add(at);
      if (Object.hasOwn(state.owners, at) && state.owners[at] !== state.you) return depth;
      state.map.adjacency[at].filter(dest => PactEngine.canMove({ ...unit, at }, dest))
        .forEach(dest => queue.push([dest, depth + 1]));
    }
    return 99;
  }

  function orders(state, respect) {
    const allies = new Set(state.accepted.filter(promise => ['peace', 'alliance'].includes(promise.type))
      .map(promise => promise.power === state.you ? promise.partner : promise.power));
    const dmz = new Set(state.accepted.filter(promise => promise.type === 'dmz')
      .map(promise => promise.terms.province));
    const plan = Object.fromEntries(own(state).map(unit => [
      unit.at,
      { unit: unit.at, type: 'hold' }
    ]));
    const reserved = new Set();
    const candidates = own(state).flatMap(unit => state.legalOrders[unit.at]
      .filter(order => order.type === 'move').map(order => {
        const occupant = state.units.find(other => other.at === order.dest);
        const helpers = own(state).filter(other => other.at !== unit.at &&
          state.legalOrders[other.at].some(legal =>
            legal.type === 'support' && legal.target === unit.at && legal.targetDest === order.dest));
        const target = Object.hasOwn(state.owners, order.dest) && state.owners[order.dest] !== state.you;
        const profitable = target && (!occupant || helpers.length > 0);
        const blocked = occupant && occupant.power === state.you || dmz.has(order.dest) ||
          occupant && allies.has(occupant.power) && (respect || !profitable);
        return {
          order,
          helpers,
          blocked,
          score: (target ? 30 : 0) + (!occupant ? 4 : -5) -
            distance(state, unit, order.dest) * 3 - (state.owners[unit.at] === state.you ? 1 : 0)
        };
      })).filter(candidate => !candidate.blocked).sort((a, b) => b.score - a.score ||
        a.order.unit.localeCompare(b.order.unit) || a.order.dest.localeCompare(b.order.dest));

    candidates.forEach(({ order, helpers }) => {
      if (plan[order.unit].type !== 'hold' || reserved.has(order.dest)) return;
      const occupant = state.units.find(unit => unit.at === order.dest);
      const helper = helpers.find(unit => plan[unit.at].type === 'hold' && unit.at !== order.dest);
      if (occupant && !helper) return;
      plan[order.unit] = order;
      reserved.add(order.dest);
      if (helper) {
        plan[helper.at] = {
          unit: helper.at,
          type: 'support',
          target: order.unit,
          targetDest: order.dest
        };
      }
    });
    return Object.values(plan);
  }

  function builds(state) {
    const delta = state.centresByPower[state.you] - own(state).length;
    if (delta < 0) return [];
    return state.map.provinces.filter(province => province.home === state.you &&
      state.owners[province.id] === state.you &&
      !state.units.some(unit => unit.at === province.id))
      .slice(0, delta).map(province => ({ type: 'army', at: province.id }));
  }

  module.exports = {
    name: 'Sample Expander',
    lab: 'Aizanoi sample',
    note: 'House sample; not an AI-model entry.',
    propose(state) {
      const attacks = orders(state, false).filter(order => order.type === 'move').map(order =>
        state.units.find(unit => unit.at === order.dest)).filter(Boolean).map(unit => unit.power);
      return Object.keys(state.centresByPower).filter(to => to !== state.you && !attacks.includes(to) &&
        (state.centresByPower[to] || state.units.some(unit => unit.power === to)))
        .map(to => ({ to, type: 'peace', terms: {} }));
    },
    answer(state) {
      return Object.fromEntries(state.inbox.map(proposal => [
        proposal.id,
        proposal.type === 'peace' ? 'accept' : 'reject'
      ]));
    },
    orders(state) {
      return orders(state, false);
    },
    retreats(state) {
      return Object.fromEntries(state.retreats.map(unit => [unit.at, unit.options[0] || null]));
    },
    builds
  };
})();
