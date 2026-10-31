(function () {
  'use strict';

  function own(state) {
    return state.units.filter(unit => unit.power === state.you);
  }

  function orders(state) {
    const result = own(state).map(unit => ({ unit: unit.at, type: 'hold' }));
    result.forEach((order, index) => {
      const legal = state.legalOrders[order.unit];
      const support = legal.find(candidate => candidate.type === 'support' &&
        candidate.targetDest === 'hold' &&
        own(state).some(unit => unit.at === candidate.target) &&
        state.owners[candidate.target] === state.you);
      if (support) result[index] = support;
    });
    return result;
  }

  module.exports = {
    name: 'Sample Turtle',
    lab: 'Aizanoi sample',
    note: 'House sample; not an AI-model entry.',
    propose(state) {
      return Object.keys(state.centresByPower).filter(power => power !== state.you &&
        (state.centresByPower[power] || state.units.some(unit => unit.power === power)))
        .map(to => ({ to, type: 'peace', terms: {} }));
    },
    answer(state) {
      return Object.fromEntries(state.inbox.map(proposal => [
        proposal.id,
        ['peace', 'alliance', 'dmz'].includes(proposal.type) ? 'accept' : 'reject'
      ]));
    },
    orders,
    retreats(state) {
      return Object.fromEntries(state.retreats.map(unit => [unit.at, unit.options[0] || null]));
    },
    builds(state) {
      const delta = state.centresByPower[state.you] - own(state).length;
      if (delta < 0) return [];
      return state.map.provinces.filter(province => province.home === state.you &&
        state.owners[province.id] === state.you &&
        !state.units.some(unit => unit.at === province.id))
        .slice(0, delta).map(province => ({ type: 'army', at: province.id }));
    }
  };
})();
