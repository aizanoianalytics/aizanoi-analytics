/**
 * Anatolian Pact Apex Bot
 * Enhanced expansion engine with multi-support, smart defence, and elite negotiation.
 */
(function () {
  'use strict';

  // --- PRECOMPUTED DISTANCES ---
  let DIST_MATRIX = null;

  function initDistances(map) {
    if (DIST_MATRIX) return DIST_MATRIX;
    const provs = Object.keys(map.provinces);
    const dist = { army: {}, fleet: {} };

    ['army', 'fleet'].forEach(type => {
      provs.forEach(src => {
        dist[type][src] = {};
        provs.forEach(dst => { dist[type][src][dst] = 99; });
        dist[type][src][src] = 0;
        const q = [src];
        while (q.length > 0) {
          const curr = q.shift();
          const d = dist[type][src][curr];
          const adj = map.adjacency[curr] || [];
          for (let i = 0; i < adj.length; i++) {
            const nxt = adj[i];
            if (dist[type][src][nxt] === 99 && PactEngine.canMove({ type, at: curr }, nxt)) {
              dist[type][src][nxt] = d + 1;
              q.push(nxt);
            }
          }
        }
      });
    });

    DIST_MATRIX = dist;
    return dist;
  }

  function getDist(distMatrix, type, from, to) {
    if (!distMatrix || !distMatrix[type] || !distMatrix[type][from]) return 99;
    return distMatrix[type][from][to] ?? 99;
  }

  function distanceToUnownedSCs(distMatrix, type, from, unownedSCs) {
    if (!unownedSCs || unownedSCs.length === 0) return 0;
    let minD = 99;
    for (let i = 0; i < unownedSCs.length; i++) {
      const d = getDist(distMatrix, type, from, unownedSCs[i]);
      if (d < minD) minD = d;
    }
    return minD;
  }

  // --- HELPERS ---
  function ownUnits(state) {
    return state.units.filter(u => u.power === state.you);
  }

  function enemyUnits(state) {
    return state.units.filter(u => u.power !== state.you);
  }

  function livingPowers(state) {
    return Object.keys(state.centresByPower).filter(p =>
      p !== state.you && (state.centresByPower[p] > 0 || state.units.some(u => u.power === p))
    );
  }

  // --- ORDERS ---
  function computeOrders(state, respectAllies) {
    const own = ownUnits(state);
    if (own.length === 0) return [];

    const distMatrix = initDistances(state.map);
    const isAutumn = state.season === 'Autumn';

    const allies = new Set(
      state.accepted
        .filter(p => ['peace', 'alliance'].includes(p.type))
        .map(p => (p.power === state.you ? p.partner : p.power))
    );
    const dmz = new Set(
      state.accepted
        .filter(p => p.type === 'dmz')
        .map(p => p.terms.province)
    );

    const allSCs = Object.keys(state.owners);
    const unownedSCs = allSCs.filter(sc => state.owners[sc] !== state.you);

    const plan = Object.fromEntries(own.map(u => [u.at, { unit: u.at, type: 'hold' }]));
    const reservedDestinations = new Set();

    // 1. AUTUMN DEFENCE of owned SCs:
    // If an enemy can walk into an owned SC in Autumn, we must defend it!
    if (isAutumn) {
      const ownedSCs = allSCs.filter(sc => state.owners[sc] === state.you);
      ownedSCs.forEach(sc => {
        const occ = own.find(u => u.at === sc);
        if (!occ) return;

        // Threatening enemies that can reach sc
        const threateningEnemies = enemyUnits(state).filter(e =>
          (state.map.adjacency[sc] || []).includes(e.at) && PactEngine.canMove(e, sc)
        );

        if (threateningEnemies.length > 0) {
          plan[sc] = { unit: sc, type: 'hold' };
          reservedDestinations.add(sc);

          // Support-hold if multiple enemies threaten
          if (threateningEnemies.length >= 2) {
            const helper = own.find(h =>
              h.at !== sc && plan[h.at].type === 'hold' &&
              (state.legalOrders[h.at] || []).some(o =>
                o.type === 'support' && o.target === sc && o.targetDest === 'hold'
              )
            );
            if (helper) {
              plan[helper.at] = { unit: helper.at, type: 'support', target: sc, targetDest: 'hold' };
              reservedDestinations.add(helper.at);
            }
          }
        }
      });
    }

    // 2. CANDIDATE MOVES:
    const candidates = own.flatMap(unit => {
      if (plan[unit.at].type !== 'hold' && reservedDestinations.has(unit.at)) return [];

      const legals = state.legalOrders[unit.at] || [];
      return legals.filter(order => order.type === 'move').map(order => {
        const occupant = state.units.find(other => other.at === order.dest);
        const helpers = own.filter(other =>
          other.at !== unit.at &&
          (state.legalOrders[other.at] || []).some(legal =>
            legal.type === 'support' && legal.target === unit.at && legal.targetDest === order.dest
          )
        );

        const target = Object.hasOwn(state.owners, order.dest) && state.owners[order.dest] !== state.you;
        const profitable = target && (!occupant || helpers.length > 0);

        // Friendly follow-through allowed: only blocked if friendly occupant is holding/reserved
        const blocked = (occupant && occupant.power === state.you && reservedDestinations.has(order.dest)) ||
          dmz.has(order.dest) ||
          (occupant && allies.has(occupant.power) && (respectAllies || !profitable));

        const dist = distanceToUnownedSCs(distMatrix, unit.type, order.dest, unownedSCs);

        return {
          order,
          helpers,
          blocked,
          score: (target ? 30 : 0) +
            (!occupant ? 4 : occupant.power !== state.you ? -5 : 2) -
            dist * 3 -
            (state.owners[unit.at] === state.you ? 1 : 0)
        };
      });
    }).filter(c => !c.blocked).sort((a, b) =>
      b.score - a.score ||
      a.order.unit.localeCompare(b.order.unit) ||
      a.order.dest.localeCompare(b.order.dest)
    );

    // 3. EXECUTE CANDIDATE MOVES:
    candidates.forEach(({ order, helpers }) => {
      if (plan[order.unit].type !== 'hold' || reservedDestinations.has(order.dest)) return;

      // Prevent 2-unit head-to-head bounce
      if (plan[order.dest] && plan[order.dest].type === 'move' && plan[order.dest].dest === order.unit) return;

      const occupant = state.units.find(u => u.at === order.dest);
      const freeHelpers = helpers.filter(h => plan[h.at].type === 'hold' && h.at !== order.dest);

      if (occupant && occupant.power !== state.you && freeHelpers.length === 0) return;

      plan[order.unit] = order;
      reservedDestinations.add(order.dest);

      // Multi-support: assign up to 2 helpers if available!
      if (freeHelpers.length > 0) {
        const numToAssign = (occupant && occupant.power !== state.you) ? Math.min(freeHelpers.length, 2) : 1;
        for (let i = 0; i < numToAssign; i++) {
          const h = freeHelpers[i];
          if (plan[h.at].type === 'hold' && !reservedDestinations.has(h.at)) {
            plan[h.at] = {
              unit: h.at,
              type: 'support',
              target: order.unit,
              targetDest: order.dest
            };
            reservedDestinations.add(h.at);
          }
        }
      }
    });

    return Object.values(plan);
  }

  // --- NEGOTIATION ---
  function propose(state) {
    const attacks = computeOrders(state, false)
      .filter(order => order.type === 'move')
      .map(order => state.units.find(u => u.at === order.dest))
      .filter(Boolean)
      .map(u => u.power);

    const living = livingPowers(state);
    return living
      .filter(to => !attacks.includes(to))
      .slice(0, 6)
      .map(to => ({ to, type: 'peace', terms: {} }));
  }

  function answer(state) {
    return Object.fromEntries(
      state.inbox.map(proposal => [
        proposal.id,
        ['peace', 'alliance', 'support'].includes(proposal.type) ? 'accept' : 'reject'
      ])
    );
  }

  // --- RETREATS ---
  function retreats(state) {
    const distMatrix = initDistances(state.map);
    const isAutumn = state.season === 'Autumn';
    const unownedSCs = Object.keys(state.owners).filter(sc => state.owners[sc] !== state.you);

    return Object.fromEntries(
      state.retreats.map(unit => {
        if (!unit.options || unit.options.length === 0) return [unit.at, null];

        // Prioritize:
        // 1. Autumn unowned SC (direct capture!)
        // 2. Safe province closest to target SCs
        let bestOpt = unit.options[0];
        let bestScore = -9999;

        unit.options.forEach(opt => {
          let score = 0;
          const isSC = Object.hasOwn(state.owners, opt);
          const owner = state.owners[opt];

          if (isSC) {
            if (owner !== state.you) {
              score += isAutumn ? 3000 : 500;
            } else {
              score += 200;
            }
          }

          const d = distanceToUnownedSCs(distMatrix, unit.type, opt, unownedSCs);
          score -= d * 10;

          if (score > bestScore) {
            bestScore = score;
            bestOpt = opt;
          }
        });

        return [unit.at, bestOpt];
      })
    );
  }

  // --- BUILDS ---
  function builds(state) {
    const distMatrix = initDistances(state.map);
    const delta = state.centresByPower[state.you] - ownUnits(state).length;

    if (delta > 0) {
      const emptyHomes = state.map.provinces.filter(p =>
        p.home === state.you &&
        state.owners[p.id] === state.you &&
        !state.units.some(u => u.at === p.id)
      );

      const unownedSCs = Object.keys(state.owners).filter(sc => state.owners[sc] !== state.you);
      emptyHomes.sort((a, b) => {
        const da = distanceToUnownedSCs(distMatrix, 'army', a.id, unownedSCs);
        const db = distanceToUnownedSCs(distMatrix, 'army', b.id, unownedSCs);
        return da - db;
      });

      const buildsList = [];
      const numBuilds = Math.min(delta, emptyHomes.length);
      const ownFleets = ownUnits(state).filter(u => u.type === 'fleet').length;

      for (let i = 0; i < numBuilds; i++) {
        const home = emptyHomes[i];
        // Build fleet only if coastal and currently 0 fleets
        const type = home.coastal && ownFleets === 0 ? 'fleet' : 'army';
        buildsList.push({ type, at: home.id });
      }
      return buildsList;
    } else if (delta < 0) {
      const excess = Math.abs(delta);
      const units = ownUnits(state).slice();
      const unownedSCs = Object.keys(state.owners).filter(sc => state.owners[sc] !== state.you);

      units.sort((a, b) => {
        const da = distanceToUnownedSCs(distMatrix, a.type, a.at, unownedSCs);
        const db = distanceToUnownedSCs(distMatrix, b.type, b.at, unownedSCs);
        return db - da; // Farthest from front line disbanded first
      });

      return units.slice(0, excess).map(u => ({ disband: u.at }));
    }

    return [];
  }

  // --- ORDERS ENTRY POINT ---
  function orders(state) {
    const raw = computeOrders(state, false);
    const own = ownUnits(state);

    return own.map(u => {
      const chosen = raw.find(o => o.unit === u.at) || { unit: u.at, type: 'hold' };
      const legals = state.legalOrders[u.at] || [];
      const isValid = legals.some(o => {
        if (o.type !== chosen.type) return false;
        if (o.type === 'hold') return true;
        if (o.type === 'move') return o.dest === chosen.dest;
        if (o.type === 'support') return o.target === chosen.target && o.targetDest === chosen.targetDest;
        return false;
      });
      return isValid ? chosen : { unit: u.at, type: 'hold' };
    });
  }

  module.exports = {
    name: 'Anatolian Pact Apex',
    propose,
    answer,
    orders,
    retreats,
    builds
  };
})();
