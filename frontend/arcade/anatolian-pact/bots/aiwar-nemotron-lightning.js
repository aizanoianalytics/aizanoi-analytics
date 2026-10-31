(function () {
  'use strict';

  module.exports = {
    name: 'Anatolian Strategist',

    propose(state) {
      const you = state.you;
      const living = Object.keys(state.centresByPower).filter(p => p !== you);
      const proposals = [];
      const myCentres = state.centresByPower[you] || 0;

      // 1. Offer peace to all living powers (up to 6 proposals)
      let idx = 0;
      for (const power of living) {
        if (idx >= 6) break;
        proposals.push({ to: power, type: 'peace', terms: {} });
        idx++;
      }

      // 2. If room, offer alliance targeting the strongest opponent
      if (proposals.length < 6) {
        const sorted = living.sort((a, b) =>
          (state.centresByPower[b] || 0) - (state.centresByPower[a] || 0)
        );
        const strongest = sorted[0];
        const candidates = sorted.slice(1).filter(t => t !== strongest);
        if (strongest && candidates.length > 0 && proposals.length < 6) {
          proposals.push({
            to: strongest,
            type: 'alliance',
            terms: { target: candidates[0] }
          });
        }
      }

      // 3. If still room, offer DMZs on strategic provinces
      if (proposals.length < 6) {
        const strategic = ['S', 'U', 'B', 'D', 'J', 'K'];
        for (const prov of strategic) {
          if (proposals.length >= 6) break;
          const provData = state.map.provinces.find(p => p.id === prov);
          if (provData && provData.type === 'land') {
            const others = living.filter(p => p !== you);
            if (others.length > 0) {
              proposals.push({
                to: others[0],
                type: 'dmz',
                terms: { province: prov }
              });
            }
          }
        }
      }

      return proposals.length > 0 ? proposals : [];
    },

    answer(state) {
      const you = state.you;
      const answers = {};

      if (!state.inbox || state.inbox.length === 0) return {};

      for (const proposal of state.inbox) {
        let answer = 'reject';

        try {
          switch (proposal.type) {
            case 'peace': {
              const propTrust = state.trust[proposal.from] || { kept: 0, broken: 0 };
              const accept = propTrust.kept >= propTrust.broken ||
                (state.centresByPower[proposal.from] || 0) <= (myCentres + 2);
              answer = accept ? 'accept' : 'reject';
              break;
            }

            case 'alliance': {
              const propTrust = state.trust[proposal.from] || { kept: 0, broken: 0 };
              const targetValid =
                proposal.terms.target &&
                proposal.terms.target !== you &&
                proposal.terms.target !== proposal.from;
              const accept = targetValid && propTrust.kept >= propTrust.broken;
              answer = accept ? 'accept' : 'reject';
              break;
            }

            case 'dmz': {
              const prov = state.map.provinces.find(
                p => p.id === proposal.terms.province
              );
              if (prov) {
                const provOwned = (state.owners || {})[prov.id];
                answer = provOwned !== you ? 'accept' : 'reject';
              } else {
                answer = 'reject';
              }
              break;
            }

            case 'support':
              answer = 'accept';
              break;

            case 'request-support':
              answer = 'accept';
              break;
          }
        } catch (e) {
          answer = 'reject';
        }

        answers[proposal.id] = answer;
      }

      return answers;
    },

    orders(state) {
      const you = state.you;
      const legal = state.legalOrders[you] || {};
      const ownUnits = state.units.filter(u => u.power === you);
      const owners = state.owners || {};
      const map = state.map || {};
      const provinces = map.provinces || [];
      const adjacency = map.adjacency || {};

      const scProvinces = new Set();
      for (const p of provinces) {
        if (p.sc) scProvinces.add(p.id);
      }

      const plan = {};

      for (const unit of ownUnits) {
        const unitId = unit.at;
        const options = legal[unitId] || [{ unit: unitId, type: 'hold' }];

        let chosen = null;

        // Priority 1: Move to unowned/empty supply centre
        const moveOpts = options.filter(o => o.type === 'move');
        const centreMoves = moveOpts.filter(dest =>
          scProvinces.has(dest) &&
          (owners[dest] === null || owners[dest] === you)
        );

        if (centreMoves.length > 0) {
          chosen = { unit: unitId, type: 'move', dest: centreMoves[0] };
        } else {
          // Priority 2: Move with implicit support from nearby units
          for (const move of moveOpts) {
            const dest = move.dest;
            const hasSupporter = ownUnits.some(other =>
              other.at !== unitId &&
              adjacency[other.at].includes(dest)
            );
            if (hasSupporter) {
              chosen = { unit: unitId, type: 'move', dest };
              break;
            }
          }
        }

        // Priority 3: Any legal move
        if (!chosen && moveOpts.length > 0) {
          chosen = { unit: unitId, type: 'move', dest: moveOpts[0].dest };
        }

        // Priority 4: Support order
        if (!chosen && options.some(o => o.type === 'support')) {
          const supportOpts = options.filter(o => o.type === 'support');
          if (supportOpts.length > 0) {
            chosen = {
              unit: unitId,
              type: 'support',
              target: supportOpts[0].target,
              targetDest: supportOpts[0].targetDest
            };
          }
        }

        // Priority 5: Hold
        if (!chosen) {
          chosen = { unit: unitId, type: 'hold' };
        }

        plan[unitId] = chosen;
      }

      // Fill in any of my units not in plan with hold
      for (const unit of ownUnits) {
        if (!plan[unit.at]) {
          plan[unit.at] = { unit: unit.at, type: 'hold' };
        }
      }

      return Object.values(plan);
    },

    retreats(state) {
      const choices = {};
      if (state.retreats && state.retreats.length > 0) {
        for (const unit of state.retreats) {
          choices[unit.at] = unit.options[0] || null;
        }
      }
      return choices;
    },

    builds(state) {
      const you = state.you;
      const myUnits = state.units.filter(u => u.power === you);
      const myCentres = state.centresByPower[you] || 0;
      const delta = myCentres - myUnits.length;

      if (delta <= 0) return [];

      const homeProvinces = (state.map.provinces || [])
        .filter(p => p.home === you && p.sc)
        .map(p => p.id);

      const built = [];

      for (const province of homeProvinces) {
        if (built.length >= delta) break;
        const provData = state.map.provinces.find(p => p.id === province);
        if (provData.coastal) {
          built.push({ type: 'fleet', at: province });
        } else {
          built.push({ type: 'army', at: province });
        }
      }

      if (built.length < delta) {
        for (const province of homeProvinces) {
          if (built.length >= delta) break;
          if (!myUnits.some(u => u.at === province)) {
            built.push({ type: 'army', at: province });
          }
        }
      }

      return built.length > 0 ? built : [];
    }
  };
})();