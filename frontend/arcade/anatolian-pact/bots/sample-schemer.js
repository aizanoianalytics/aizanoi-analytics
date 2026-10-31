(function () {
  'use strict';

  function own(state) {
    return state.units.filter(unit => unit.power === state.you);
  }

  function living(state) {
    return Object.keys(state.centresByPower).filter(power => power !== state.you &&
      (state.centresByPower[power] || state.units.some(unit => unit.power === power)));
  }

  function allies(state) {
    return new Set(state.accepted.filter(promise => ['peace', 'alliance'].includes(promise.type))
      .map(promise => promise.power === state.you ? promise.partner : promise.power));
  }

  function orders(state) {
    const friendly = allies(state);
    const forbidden = new Set(state.accepted.filter(promise => promise.type === 'dmz')
      .map(promise => promise.terms.province));
    const plan = Object.fromEntries(own(state).map(unit => [
      unit.at,
      { unit: unit.at, type: 'hold' }
    ]));
    const claimed = new Set();
    const promised = state.accepted.filter(promise =>
      promise.power === state.you && promise.type === 'support');

    promised.forEach(promise => {
      const supporter = own(state).find(unit => plan[unit.at].type === 'hold' &&
        state.legalOrders[unit.at].some(order => order.type === 'support' &&
          order.target === promise.terms.unit && order.targetDest === promise.terms.dest));
      if (supporter) {
        plan[supporter.at] = {
          unit: supporter.at,
          type: 'support',
          target: promise.terms.unit,
          targetDest: promise.terms.dest
        };
      }
    });

    const moves = own(state).flatMap(unit => state.legalOrders[unit.at]
      .filter(order => order.type === 'move').map(order => {
        const occupant = state.units.find(other => other.at === order.dest);
        const owner = state.owners[order.dest];
        const betrayal = state.year > 4 && friendly.has(owner) && !occupant;
        const partner = occupant ? occupant.power : owner;
        const blocked = forbidden.has(order.dest) || occupant && occupant.power === state.you ||
          friendly.has(partner) && !betrayal;
        const target = Object.hasOwn(state.owners, order.dest) && owner !== state.you;
        const enemy = state.accepted.some(promise =>
          promise.type === 'alliance' && promise.terms.target === partner);
        return {
          order,
          blocked,
          score: (betrayal ? 100 : 0) + (target ? 30 : 0) + (enemy ? 10 : 0) + (!occupant ? 5 : 0)
        };
      })).filter(move => !move.blocked).sort((a, b) => b.score - a.score ||
        a.order.unit.localeCompare(b.order.unit) || a.order.dest.localeCompare(b.order.dest));

    moves.forEach(({ order }) => {
      if (plan[order.unit].type !== 'hold' || claimed.has(order.dest)) return;
      const helper = own(state).find(unit => unit.at !== order.unit && unit.at !== order.dest &&
        plan[unit.at].type === 'hold' && state.legalOrders[unit.at].some(candidate =>
          candidate.type === 'support' && candidate.target === order.unit &&
          candidate.targetDest === order.dest));
      if (state.units.some(unit => unit.at === order.dest) && !helper) return;
      plan[order.unit] = order;
      claimed.add(order.dest);
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

  module.exports = {
    name: 'Sample Schemer',
    lab: 'Aizanoi sample',
    note: 'House sample; not an AI-model entry.',
    propose(state) {
      const neighbours = living(state).filter(power =>
        own(state).some(unit => state.map.adjacency[unit.at].some(at =>
          state.owners[at] === power || state.units.some(other => other.at === at && other.power === power))));
      const ranked = (neighbours.length ? neighbours : living(state))
        .sort((a, b) => state.centresByPower[b] - state.centresByPower[a] || a.localeCompare(b));
      const ally = ranked.find(power => state.trust[power].broken <= state.trust[power].kept);
      const enemy = living(state).filter(power => power !== ally)
        .sort((a, b) => state.centresByPower[a] - state.centresByPower[b] || a.localeCompare(b))[0];
      return ally && enemy ? [{ to: ally, type: 'alliance', terms: { target: enemy } }] : [];
    },
    answer(state) {
      return Object.fromEntries(state.inbox.map(proposal => {
        const honest = state.trust[proposal.from].broken <= state.trust[proposal.from].kept;
        let accept = ['peace', 'alliance', 'dmz'].includes(proposal.type);
        if (proposal.type === 'request-support') {
          accept = own(state).some(unit => state.legalOrders[unit.at].some(order =>
            order.type === 'support' && order.target === proposal.terms.unit &&
            order.targetDest === proposal.terms.dest));
        }
        if (proposal.type === 'support') accept = true;
        return [proposal.id, honest && accept ? 'accept' : 'reject'];
      }));
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
