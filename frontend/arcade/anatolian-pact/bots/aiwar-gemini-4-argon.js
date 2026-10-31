(function () {
  'use strict';

  let distCache = null;
  let provById = null;
  let scList = null;

  function ensureCache(state) {
    if (distCache) return;
    provById = {};
    scList = [];
    for (const p of state.map.provinces) {
      provById[p.id] = p;
      if (p.sc) scList.push(p.id);
    }
    distCache = { army: {}, fleet: {}, any: {} };
    const ids = Object.keys(provById);

    for (const uType of ['army', 'fleet']) {
      for (const start of ids) {
        const dMap = {};
        for (const id of ids) dMap[id] = 99;
        dMap[start] = 0;
        const queue = [start];
        for (let i = 0; i < queue.length; i++) {
          const cur = queue[i];
          const curD = dMap[cur];
          const neighbors = state.map.adjacency[cur] || [];
          for (const nxt of neighbors) {
            if (dMap[nxt] !== 99) continue;
            if (PactEngine.canMove({ type: uType, at: cur }, nxt)) {
              dMap[nxt] = curD + 1;
              queue.push(nxt);
            }
          }
        }
        distCache[uType][start] = dMap;
      }
    }

    for (const start of ids) {
      const dMap = {};
      for (const id of ids) dMap[id] = 99;
      dMap[start] = 0;
      const queue = [start];
      for (let i = 0; i < queue.length; i++) {
        const cur = queue[i];
        const curD = dMap[cur];
        for (const nxt of (state.map.adjacency[cur] || [])) {
          if (dMap[nxt] === 99) {
            dMap[nxt] = curD + 1;
            queue.push(nxt);
          }
        }
      }
      distCache.any[start] = dMap;
    }
  }

  function getLivingPowers(state) {
    return Object.keys(state.centresByPower).filter(p =>
      p !== state.you && (state.centresByPower[p] > 0 || state.units.some(u => u.power === p))
    );
  }

  function getTrustScore(state, power) {
    const t = state.trust[power];
    if (!t || t.promisesMade === 0) return 0.75;
    const brokeToUs = (t.brokenPromises || []).some(bp => bp.partner === state.you);
    const base = (t.kept + 1) / (t.kept + t.broken * 2.5 + 1.5);
    return brokeToUs ? base * 0.35 : base;
  }

  // Analyze history for recent attacks against us and bounce/turtle patterns
  function analyzeHistory(state) {
    const agg = {};
    const bouncedAt = {}; // dest -> count of times our attack on dest failed recently
    const staticUnits = new Set(); // enemy units that held or supported hold last turn

    const histLen = state.history.length;
    if (histLen > 0) {
      const lastH = state.history[histLen - 1];
      for (const ord of lastH.resolution) {
        if (ord.power !== state.you && (ord.type === 'hold' || (ord.type === 'support' && ord.targetDest === 'hold'))) {
          staticUnits.add(ord.unit);
        }
        if (ord.power === state.you && ord.type === 'move' && ord.outcome !== 'success') {
          bouncedAt[ord.dest] = (bouncedAt[ord.dest] || 0) + 1;
        }
      }
      if (histLen > 1) {
        const prevH = state.history[histLen - 2];
        for (const ord of prevH.resolution) {
          if (ord.power === state.you && ord.type === 'move' && ord.outcome !== 'success') {
            bouncedAt[ord.dest] = (bouncedAt[ord.dest] || 0) + 1;
          }
        }
      }
    }

    for (const h of state.history) {
      for (const ord of h.resolution) {
        if (ord.power === state.you) continue;
        if (ord.type === 'move' && state.owners[ord.dest] === state.you) {
          agg[ord.power] = (agg[ord.power] || 0) + 2;
        }
      }
    }
    return { agg, bouncedAt, staticUnits };
  }

  function evaluateNegotiation(state) {
    ensureCache(state);
    const living = getLivingPowers(state);
    const myUnits = state.units.filter(u => u.power === state.you);
    const myCentres = state.centresByPower[state.you] || 0;
    const { agg, bouncedAt, staticUnits } = analyzeHistory(state);

    let maxEnemyCentres = 0;
    let leader = null;
    for (const p of living) {
      if (state.centresByPower[p] > maxEnemyCentres) {
        maxEnemyCentres = state.centresByPower[p];
        leader = p;
      }
    }

    const targetScores = {};
    const borderThreat = {};

    for (const p of living) {
      let reachableSCs = 0;
      let vulnerableSCs = 0;
      let minDist = 99;
      let adjEnemyUnits = 0;

      for (const sc of scList) {
        if (state.owners[sc] === p) {
          const occ = state.units.find(u => u.at === sc);
          const isUnoccupied = !occ;
          for (const u of myUnits) {
            const d = distCache[u.type][u.at][sc];
            if (d <= 2) {
              reachableSCs += (3 - d);
              if (isUnoccupied) vulnerableSCs += (3 - d);
            }
            if (d < minDist) minDist = d;
          }
        }
      }

      for (const eu of state.units) {
        if (eu.power !== p) continue;
        for (const sc of scList) {
          if (state.owners[sc] === state.you) {
            const d = distCache[eu.type][eu.at][sc];
            if (d <= 2) adjEnemyUnits += (3 - d);
          }
        }
      }

      borderThreat[p] = adjEnemyUnits;
      const leaderBonus = (state.centresByPower[p] >= 6 && state.centresByPower[p] >= myCentres) ? 14 : 0;
      const weakBonus = (state.centresByPower[p] <= 3 && vulnerableSCs > 0) ? 10 : 0;
      const aggBonus = (agg[p] || 0) * 3;
      const trustPenalty = getTrustScore(state, p) * 4;

      targetScores[p] = reachableSCs * 5 + vulnerableSCs * 4 + leaderBonus + weakBonus + aggBonus - trustPenalty - (minDist * 2);
    }

    const sortedTargets = living.slice().sort((a, b) => targetScores[b] - targetScores[a]);
    const primaryTarget = sortedTargets[0] || null;

    return { living, targetScores, borderThreat, primaryTarget, leader, maxEnemyCentres, bouncedAt, staticUnits };
  }

  function propose(state) {
    ensureCache(state);
    const { living, primaryTarget, leader, maxEnemyCentres } = evaluateNegotiation(state);
    const proposals = [];

    if (!living.length) return proposals;

    const stopTarget = (leader && maxEnemyCentres >= 6) ? leader : primaryTarget;

    for (const p of living) {
      if (proposals.length >= 6) break;
      if (p === primaryTarget && living.length > 1) continue;

      const trust = getTrustScore(state, p);
      if (trust < 0.3) continue;

      if (stopTarget && stopTarget !== p && living.includes(stopTarget)) {
        proposals.push({
          to: p,
          type: 'alliance',
          terms: { target: stopTarget }
        });
      } else {
        proposals.push({
          to: p,
          type: 'peace',
          terms: {}
        });
      }
    }

    // If we have room for more proposals, request support for an attack against primaryTarget
    if (proposals.length < 6 && primaryTarget) {
      const myUnits = state.units.filter(u => u.power === state.you);
      for (const u of myUnits) {
        if (proposals.length >= 6) break;
        const adj = state.map.adjacency[u.at] || [];
        for (const dest of adj) {
          if (proposals.length >= 6) break;
          if (!PactEngine.canMove(u, dest)) continue;
          if (state.owners[dest] !== primaryTarget) continue;
          // Find a third power that has a unit able to support u -> dest
          for (const ally of living) {
            if (ally === primaryTarget) continue;
            const canSup = state.units.some(au => au.power === ally && au.at !== u.at && PactEngine.canMove(au, dest));
            if (canSup && !proposals.some(pr => pr.to === ally && pr.type === 'request-support')) {
              proposals.push({
                to: ally,
                type: 'request-support',
                terms: { unit: u.at, dest }
              });
              break;
            }
          }
        }
      }
    }

    return proposals.slice(0, 6);
  }

  function answer(state) {
    ensureCache(state);
    const { primaryTarget, targetScores } = evaluateNegotiation(state);
    const myUnits = state.units.filter(u => u.power === state.you);
    const responses = {};

    for (const prop of state.inbox) {
      const from = prop.from;
      const trust = getTrustScore(state, from);
      let decision = 'reject';

      if (prop.type === 'peace' || prop.type === 'alliance') {
        const isMainTarget = (from === primaryTarget && targetScores[from] > 10);
        if (!isMainTarget && trust >= 0.3) {
          decision = 'accept';
        }
      } else if (prop.type === 'support') {
        decision = 'accept';
      } else if (prop.type === 'dmz') {
        const prov = prop.terms && prop.terms.province;
        if (prov && state.owners[prov] !== state.you) {
          const isTargetSC = Object.hasOwn(state.owners, prov) &&
            (state.owners[prov] === null || state.owners[prov] === primaryTarget) &&
            myUnits.some(u => distCache[u.type][u.at][prov] <= 2);
          if (!isTargetSC && trust >= 0.4) {
            decision = 'accept';
          }
        }
      } else if (prop.type === 'request-support') {
        const dest = prop.terms.dest;
        const targetOwner = dest !== 'hold' ? state.owners[dest] : null;
        if (trust >= 0.65 && targetOwner && targetOwner !== state.you && targetOwner === primaryTarget && myUnits.length >= 6) {
          decision = 'accept';
        }
      }

      responses[prop.id] = decision;
    }

    return responses;
  }

  // Predict opponent orders under different styles: 'greedy', 'defensive', 'noisy'
  function predictOpponentOrders(state, power, style) {
    const pUnits = state.units.filter(u => u.power === power);
    if (!pUnits.length) return [];

    // Defensive / Turtle style: hold on SCs and support adjacent friendly SCs
    if (style === 'defensive') {
      const res = pUnits.map(u => ({ unit: u.at, type: 'hold' }));
      for (let i = 0; i < res.length; i++) {
        const u = pUnits[i];
        const supTarget = pUnits.find(other =>
          other.at !== u.at &&
          state.owners[other.at] === power &&
          PactEngine.canMove(u, other.at)
        );
        if (supTarget) {
          res[i] = { unit: u.at, type: 'support', target: supTarget.at, targetDest: 'hold' };
        }
      }
      return res;
    }

    const plan = {};
    for (const u of pUnits) plan[u.at] = { unit: u.at, type: 'hold' };
    const claimed = new Set();

    const candidates = [];
    for (const u of pUnits) {
      const adj = state.map.adjacency[u.at] || [];
      for (const dest of adj) {
        if (!PactEngine.canMove(u, dest)) continue;
        const occ = state.units.find(other => other.at === dest);
        if (occ && occ.power === power) continue;

        const isSC = Object.hasOwn(state.owners, dest);
        const owner = state.owners[dest];
        const isTargetSC = isSC && owner !== power;
        const isUnownedSC = isSC && owner === null;

        let minDist = 99;
        for (const sc of scList) {
          if (state.owners[sc] !== power) {
            const d = distCache[u.type][dest][sc];
            if (d < minDist) minDist = d;
          }
        }

        let score = (isTargetSC ? 35 : 0) + (isUnownedSC ? 15 : 0) + (!occ ? 6 : -4) - minDist * 3;
        if (state.owners[u.at] === power && state.season === 'Autumn') {
          const threatened = state.units.some(eu => eu.power !== power && PactEngine.canMove(eu, u.at));
          if (threatened) score -= 20;
        }
        // In Spring, if opponent is already on a foreign or neutral SC, they will almost certainly hold to capture it in Autumn
        if (state.season === 'Spring' && Object.hasOwn(state.owners, u.at) && state.owners[u.at] !== power) {
          score -= 35;
        }
        if (style === 'noisy') {
          score += (Math.random() - 0.5) * 20;
        }

        const helpers = pUnits.filter(other => other.at !== u.at && PactEngine.canMove(other, dest));
        candidates.push({ u, dest, occ, helpers, score });
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    for (const c of candidates) {
      if (plan[c.u.at].type !== 'hold' || claimed.has(c.dest)) continue;
      if (c.occ) {
        const helper = c.helpers.find(h => plan[h.at].type === 'hold' && h.at !== c.dest);
        if (!helper) continue;
        plan[c.u.at] = { unit: c.u.at, type: 'move', dest: c.dest };
        claimed.add(c.dest);
        plan[helper.at] = { unit: helper.at, type: 'support', target: c.u.at, targetDest: c.dest };
      } else {
        if (c.score < -10) continue;
        plan[c.u.at] = { unit: c.u.at, type: 'move', dest: c.dest };
        claimed.add(c.dest);
        const contested = state.units.some(eu => eu.power !== power && eu.at !== c.dest && PactEngine.canMove(eu, c.dest));
        if (contested && Object.hasOwn(state.owners, c.dest) && state.owners[c.dest] !== power) {
          const helper = c.helpers.find(h => plan[h.at].type === 'hold' && h.at !== c.dest);
          if (helper) {
            plan[helper.at] = { unit: helper.at, type: 'support', target: c.u.at, targetDest: c.dest };
          }
        }
      }
    }

    for (const u of pUnits) {
      if (plan[u.at].type !== 'hold') continue;
      for (const other of pUnits) {
        if (other.at === u.at) continue;
        const oPlan = plan[other.at];
        if (oPlan.type === 'move' && PactEngine.canMove(u, oPlan.dest)) {
          plan[u.at] = { unit: u.at, type: 'support', target: other.at, targetDest: oPlan.dest };
          break;
        } else if (oPlan.type !== 'move' && PactEngine.canMove(u, other.at) && Object.hasOwn(state.owners, other.at)) {
          plan[u.at] = { unit: u.at, type: 'support', target: other.at, targetDest: 'hold' };
          break;
        }
      }
    }

    return Object.values(plan);
  }

  function evaluateBoard(state, adjResult, myOrders, dipInfo, peacePartners, dmzProvs, supportPromises) {
    const you = state.you;
    const isAutumn = state.season === 'Autumn';
    const isFinalYear = state.year >= state.limits.maxYears && isAutumn;
    const { primaryTarget, bouncedAt } = dipInfo;

    let score = 0;

    // 1. Check promise breaking penalties
    let brokenCount = 0;
    for (const ord of myOrders) {
      if (ord.type === 'move') {
        if (dmzProvs.has(ord.dest)) brokenCount++;
        const occ = state.units.find(u => u.at === ord.dest);
        if (occ && peacePartners.has(occ.power)) brokenCount++;
      } else if (ord.type === 'support' && ord.targetDest !== 'hold') {
        const occ = state.units.find(u => u.at === ord.targetDest);
        if (occ && peacePartners.has(occ.power)) brokenCount++;
      }
    }
    for (const sp of supportPromises) {
      const kept = myOrders.some(o => o.type === 'support' && o.target === sp.terms.unit && o.targetDest === sp.terms.dest);
      if (!kept) brokenCount++;
    }

    if (brokenCount > 0 && !isFinalYear) {
      // Allow opportunistic betrayal in mid/late game if it captures multiple centers, otherwise penalize
      score -= brokenCount * (state.year <= 3 ? 45 : 30);
    }

    // 2. Dislodgements
    for (const d of adjResult.dislodged) {
      if (d.power === you) {
        score -= isAutumn ? 50 : 35;
      } else {
        score += 20;
        if (d.power === primaryTarget) score += 8;
      }
    }

    // 3. Penalize wasted/bounced moves & invalid supports
    const myOrderByUnit = {};
    for (const o of myOrders) myOrderByUnit[o.unit] = o;
    for (const r of adjResult.resolution) {
      if (r.power !== you) continue;
      if (r.type === 'move' && r.outcome === 'bounce') {
        score -= 4;
        if (bouncedAt[r.dest]) score -= bouncedAt[r.dest] * 6; // Stop repeating futile bounces!
      } else if (r.type === 'support' && !r.effective) {
        // Check if it was unmatched because our own unit didn't make the supported move/hold
        const tOrd = myOrderByUnit[r.target];
        if (tOrd) {
          const matched = (r.targetDest === 'hold') ? (tOrd.type !== 'move') : (tOrd.type === 'move' && tOrd.dest === r.targetDest);
          if (!matched) score -= 18; // Never waste a unit on mismatched self-support!
        }
      }
    }

    // 4. Supply center ownership / occupation
    const newOwners = { ...state.owners };
    const unitAt = {};
    for (const u of adjResult.units) {
      unitAt[u.at] = u;
      if (isAutumn && Object.hasOwn(newOwners, u.at)) {
        newOwners[u.at] = u.power;
      }
    }

    const mySurvivors = adjResult.units.filter(u => u.power === you);
    let mySCs = 0;
    const enemySCs = {};
    for (const sc of scList) {
      const owner = newOwners[sc];
      const occ = unitAt[sc];
      if (isAutumn) {
        if (owner === you) {
          mySCs++;
          score += 110;
          if (provById[sc].home === you) score += 20;
        } else if (owner) {
          enemySCs[owner] = (enemySCs[owner] || 0) + 1;
        }
      } else {
        if (owner === you) {
          if (occ && occ.power !== you) {
            score -= 85;
            enemySCs[occ.power] = (enemySCs[occ.power] || 0) + 1;
          } else {
            mySCs++;
            score += 75;
          }
        } else {
          if (occ && occ.power === you) {
            mySCs++;
            score += (owner === null) ? 85 : 80;
            if (owner === primaryTarget) score += 10;
          } else if (owner) {
            enemySCs[owner] = (enemySCs[owner] || 0) + 1;
          }
        }
      }
    }

    // Count empty owned home SCs for upcoming builds!
    if (isAutumn) {
      const currentOwnedSCs = state.centresByPower[you] || 0;
      const expectedGain = mySCs - mySurvivors.length;
      if (expectedGain > 0) {
        let openHomes = 0;
        for (const sc of scList) {
          if (provById[sc].home === you && newOwners[sc] === you && !unitAt[sc]) {
            openHomes++;
          }
        }
        const buildable = Math.min(expectedGain, openHomes);
        const waived = expectedGain - buildable;
        // Waiving builds because all homes are clogged by our own units is a huge tempo loss!
        score -= waived * 45;
      }
    }

    if (isAutumn && mySCs >= 13) {
      score += 10000;
    }

    const maxOppSCs = Math.max(0, ...Object.values(enemySCs));
    score += (mySCs - maxOppSCs) * 28;

    // 5. Unit positioning, spread, and proximity to unowned / enemy SCs
    const targetedSCs = new Set();

    for (const u of mySurvivors) {
      // Find closest 2 non-owned SCs, strongly preferring unowned neutral SCs!
      let bestTargetVal = -999;
      let bestTargetSc = null;
      let secondTargetVal = -999;

      for (const sc of scList) {
        const effectivelyMine = isAutumn ? (newOwners[sc] === you) : (state.owners[sc] === you || (unitAt[sc] && unitAt[sc].power === you));
        if (!effectivelyMine) {
          const d = distCache[u.type][u.at][sc];
          if (d >= 99) continue;
          const isUnowned = state.owners[sc] === null;
          const scOcc = unitAt[sc];
          // Prefer unowned or unoccupied SCs over heavily fortified enemy SCs
          let val = -d * 9 + (isUnowned ? 16 : 0) + (!scOcc ? 8 : 0);
          if (bouncedAt[sc]) val -= bouncedAt[sc] * 10;
          if (val > bestTargetVal) {
            secondTargetVal = bestTargetVal;
            bestTargetVal = val;
            bestTargetSc = sc;
          } else if (val > secondTargetVal) {
            secondTargetVal = val;
          }
        }
      }
      if (bestTargetVal > -999) {
        score += bestTargetVal;
        if (bestTargetSc && targetedSCs.has(bestTargetSc) && distCache[u.type][u.at][bestTargetSc] === 0) {
          // fine
        }
        if (bestTargetSc) targetedSCs.add(bestTargetSc);
      }
      if (secondTargetVal > -999) {
        score += secondTargetVal * 0.25;
      }

      // Reward keeping fleets on sea or coastal SCs where they have mobility
      if (u.type === 'fleet') {
        const deg = (state.map.adjacency[u.at] || []).filter(n => PactEngine.canMove(u, n)).length;
        score += deg * 1.5;
      }
    }

    // Reward threatening multiple distinct non-owned SCs
    score += targetedSCs.size * 6;

    // Penalize leaving owned SCs undefended when an enemy unit is adjacent and can walk in
    for (const sc of scList) {
      if (state.owners[sc] === you && (!unitAt[sc] || unitAt[sc].power !== you)) {
        const adjEnemy = adjResult.units.filter(eu => eu.power !== you && PactEngine.canMove(eu, sc));
        if (adjEnemy.length > 0) {
          // Check if we have a unit adjacent that can contest or retake in Autumn
          const adjFriend = mySurvivors.some(fu => PactEngine.canMove(fu, sc));
          if (isAutumn) {
            score -= 20;
          } else {
            score -= adjFriend ? 30 : 65;
          }
        }
      }
    }

    return score;
  }

  function orders(state) {
    ensureCache(state);
    const myUnits = state.units.filter(u => u.power === state.you);
    if (!myUnits.length) return [];

    const dipInfo = evaluateNegotiation(state);
    const { living, primaryTarget, bouncedAt } = dipInfo;

    const peacePartners = new Set();
    const dmzProvs = new Set();
    const supportPromises = [];

    for (const prom of state.accepted) {
      if (prom.power === state.you) {
        if (prom.type === 'peace' || prom.type === 'alliance') peacePartners.add(prom.partner);
        else if (prom.type === 'dmz') dmzProvs.add(prom.terms.province);
        else if (prom.type === 'support') supportPromises.push(prom);
      }
    }

    const scenarios = [];
    const scenGreedy = [];
    for (const p of living) scenGreedy.push(...predictOpponentOrders(state, p, 'greedy'));
    scenarios.push({ weight: 0.65, orders: scenGreedy });

    const scenDef = [];
    for (const p of living) scenDef.push(...predictOpponentOrders(state, p, 'defensive'));
    scenarios.push({ weight: 0.35, orders: scenDef });

    function scoreCandidatePlan(myOrderList) {
      let total = 0;
      for (const scen of scenarios) {
        const combined = myOrderList.concat(scen.orders);
        const res = PactEngine.adjudicate(state.units, combined);
        total += scen.weight * evaluateBoard(state, res, myOrderList, dipInfo, peacePartners, dmzProvs, supportPromises);
      }
      return total;
    }

    const candidatePlans = [];

    function generateHeuristicPlan(aggressiveness, respectPromises, randomNoise) {
      const plan = {};
      for (const u of myUnits) plan[u.at] = { unit: u.at, type: 'hold' };
      const claimed = new Set();

      if (respectPromises) {
        for (const sp of supportPromises) {
          const supporter = myUnits.find(u => plan[u.at].type === 'hold' &&
            (state.legalOrders[u.at] || []).some(o => o.type === 'support' && o.target === sp.terms.unit && o.targetDest === sp.terms.dest));
          if (supporter) {
            plan[supporter.at] = { unit: supporter.at, type: 'support', target: sp.terms.unit, targetDest: sp.terms.dest };
          }
        }
      }

      const moveOptions = [];
      for (const u of myUnits) {
        const legals = state.legalOrders[u.at] || [];
        for (const ord of legals) {
          if (ord.type !== 'move') continue;
          const dest = ord.dest;
          const occ = state.units.find(other => other.at === dest);
          if (occ && occ.power === state.you) continue;

          if (respectPromises) {
            if (dmzProvs.has(dest)) continue;
            if (occ && peacePartners.has(occ.power)) continue;
          }

          const isSC = Object.hasOwn(state.owners, dest);
          const owner = state.owners[dest];
          const isUnownedSC = isSC && owner === null;
          const isEnemySC = isSC && owner !== null && owner !== state.you;

          // Distance from dest to nearest target SC (strongly weighting unowned SCs)
          let minEffectiveDist = 99;
          for (const sc of scList) {
            if (state.owners[sc] !== state.you) {
              const d = distCache[u.type][dest][sc];
              const bonus = (state.owners[sc] === null) ? -0.6 : (!state.units.some(x => x.at === sc) ? -0.3 : 0);
              if (d + bonus < minEffectiveDist) minEffectiveDist = d + bonus;
            }
          }

          const helpers = myUnits.filter(other => other.at !== u.at &&
            (state.legalOrders[other.at] || []).some(l => l.type === 'support' && l.target === u.at && l.targetDest === dest));

          // How many enemy units of the defender can support a hold at dest?
          const defPower = occ ? occ.power : null;
          const defSupporters = defPower ? state.units.filter(eu =>
            eu.power === defPower && eu.at !== dest && eu.at !== u.at && PactEngine.canMove(eu, dest)
          ).length : 0;

          const enemyThreatsToDest = state.units.filter(eu => eu.power !== state.you && eu.at !== dest && PactEngine.canMove(eu, dest)).length;
          const enemyThreatsToOrigin = state.units.filter(eu => eu.power !== state.you && PactEngine.canMove(eu, u.at)).length;

          let scVal = 0;
          if (isUnownedSC) scVal = 55;
          else if (isEnemySC) scVal = (owner === primaryTarget ? 42 : 35);
          else if (isSC && owner === state.you && state.season === 'Autumn' && enemyThreatsToDest > 0) scVal = 30;

          let s = scVal - minEffectiveDist * 8 + (!occ ? 12 : -8 - defSupporters * 12) + helpers.length * 6 * aggressiveness;
          if (bouncedAt[dest]) s -= bouncedAt[dest] * 15;
          if (state.owners[u.at] === state.you && enemyThreatsToOrigin > 0) {
            s -= (state.season === 'Autumn' ? 40 : 22);
          }
          if (state.season === 'Autumn' && isSC && owner === state.you && occ && occ.power !== state.you) {
            s += 55;
          }
          if (state.season === 'Spring' && Object.hasOwn(state.owners, u.at) && state.owners[u.at] !== state.you) {
            s -= 65; // Stay on captured SC until Autumn!
          }
          if (randomNoise > 0) {
            s += (Math.random() - 0.5) * randomNoise;
          }

          moveOptions.push({ u, ord, dest, occ, helpers, defSupporters, score: s, enemyThreatsToDest });
        }
      }

      moveOptions.sort((a, b) => b.score - a.score);

      for (const m of moveOptions) {
        if (plan[m.u.at].type !== 'hold' || claimed.has(m.dest)) continue;
        const availHelpers = m.helpers.filter(h => plan[h.at].type === 'hold' && h.at !== m.dest);
        if (m.occ) {
          const neededHelpers = Math.max(1, m.defSupporters);
          if (availHelpers.length < neededHelpers) continue;
          plan[m.u.at] = m.ord;
          claimed.add(m.dest);
          for (let k = 0; k < Math.min(availHelpers.length, neededHelpers + 1); k++) {
            const hk = availHelpers[k];
            plan[hk.at] = { unit: hk.at, type: 'support', target: m.u.at, targetDest: m.dest };
          }
        } else {
          if (m.score < -8) continue;
          plan[m.u.at] = m.ord;
          claimed.add(m.dest);
          if (m.enemyThreatsToDest > 0 && availHelpers.length > 0 && Object.hasOwn(state.owners, m.dest)) {
            const h1 = availHelpers[0];
            plan[h1.at] = { unit: h1.at, type: 'support', target: m.u.at, targetDest: m.dest };
          }
        }
      }

      // Check if any holding unit can step into a province being vacated by a friendly unit
      for (const u of myUnits) {
        if (plan[u.at].type !== 'hold') continue;
        if (state.season === 'Spring' && Object.hasOwn(state.owners, u.at) && state.owners[u.at] !== state.you) continue;
        const legals = state.legalOrders[u.at] || [];
        for (const l of legals) {
          if (l.type !== 'move' || claimed.has(l.dest)) continue;
          if (respectPromises && dmzProvs.has(l.dest)) continue;
          const occ = state.units.find(o => o.at === l.dest);
          if (occ && occ.power === state.you && plan[occ.at].type === 'move') {
            let dNow = 99, dNext = 99;
            for (const sc of scList) {
              if (state.owners[sc] !== state.you) {
                dNow = Math.min(dNow, distCache[u.type][u.at][sc]);
                dNext = Math.min(dNext, distCache[u.type][l.dest][sc]);
              }
            }
            const vacatingThreatenedHome = state.owners[l.dest] === state.you &&
              state.units.some(eu => eu.power !== state.you && PactEngine.canMove(eu, l.dest));
            if (dNext < dNow || vacatingThreatenedHome) {
              plan[u.at] = l;
              claimed.add(l.dest);
              break;
            }
          }
        }
      }

      // Assign remaining holding units to support adjacent friendly moves or threatened friendly holds
      for (const u of myUnits) {
        if (plan[u.at].type !== 'hold') continue;
        const legals = state.legalOrders[u.at] || [];
        let bestSup = null;
        let bestSupScore = 0;

        for (const l of legals) {
          if (l.type !== 'support') continue;
          const targetUnit = state.units.find(tu => tu.at === l.target);
          if (!targetUnit || targetUnit.power !== state.you) continue;
          const tPlan = plan[targetUnit.at];

          if (l.targetDest !== 'hold' && tPlan.type === 'move' && tPlan.dest === l.targetDest) {
            const occ = state.units.find(o => o.at === l.targetDest);
            const contested = state.units.some(eu => eu.power !== state.you && PactEngine.canMove(eu, l.targetDest));
            const val = (occ ? 30 : 0) + (contested ? 20 : 5) + (Object.hasOwn(state.owners, l.targetDest) ? 15 : 0);
            if (val > bestSupScore) { bestSupScore = val; bestSup = l; }
          } else if (l.targetDest === 'hold' && tPlan.type !== 'move') {
            const threatened = state.units.some(eu => eu.power !== state.you && PactEngine.canMove(eu, targetUnit.at));
            if (threatened) {
              const val = (Object.hasOwn(state.owners, targetUnit.at) ? 25 : 10);
              if (val > bestSupScore) { bestSupScore = val; bestSup = l; }
            }
          }
        }
        if (bestSup) plan[u.at] = bestSup;
      }

      return Object.values(plan);
    }

    candidatePlans.push(generateHeuristicPlan(1.0, true, 0));
    candidatePlans.push(generateHeuristicPlan(1.5, true, 0));
    candidatePlans.push(generateHeuristicPlan(0.5, true, 0));
    candidatePlans.push(generateHeuristicPlan(1.2, false, 0));
    for (let i = 0; i < 6; i++) {
      candidatePlans.push(generateHeuristicPlan(1.0, true, 25));
    }

    let bestPlan = candidatePlans[0];
    let bestScore = scoreCandidatePlan(bestPlan);

    for (let i = 1; i < candidatePlans.length; i++) {
      const sc = scoreCandidatePlan(candidatePlans[i]);
      if (sc > bestScore) {
        bestScore = sc;
        bestPlan = candidatePlans[i];
      }
    }

    // Coordinate ascent (hill-climbing) over individual unit orders, coordinated pairs, and vacate-chains
    let evalCount = 0;
    const maxEvals = 100;
    for (let pass = 0; pass < 2; pass++) {
      let improved = false;
      for (let idx = 0; idx < myUnits.length; idx++) {
        if (evalCount >= maxEvals) break;
        const u = myUnits[idx];
        const legals = state.legalOrders[u.at] || [];

        // Filter legals to relevant orders (holds, moves to non-friendly-occupied or vacating, and supports of OUR OWN units)
        const relevant = legals.filter(l => {
          if (l.type === 'hold') return true;
          if (l.type === 'move') {
            const occ = state.units.find(tu => tu.at === l.dest);
            // Only consider moving into a friendly unit's province if that friendly unit is currently ordered to move
            if (occ && occ.power === state.you) {
              const occIdx = myUnits.findIndex(mu => mu.at === occ.at);
              return occIdx >= 0 && bestPlan[occIdx].type === 'move' && bestPlan[occIdx].dest !== u.at;
            }
            return true;
          }
          if (l.type === 'support') {
            const tUnit = state.units.find(tu => tu.at === l.target);
            if (tUnit && tUnit.power === state.you) {
              const tIdx = myUnits.findIndex(mu => mu.at === tUnit.at);
              if (tIdx >= 0) {
                const tOrd = bestPlan[tIdx];
                if (l.targetDest === 'hold') return tOrd.type !== 'move';
                return tOrd.type === 'move' && tOrd.dest === l.targetDest;
              }
            }
            if (supportPromises.some(sp => sp.terms.unit === l.target && sp.terms.dest === l.targetDest)) return true;
          }
          return false;
        });

        for (const candOrder of relevant) {
          if (evalCount >= maxEvals) break;
          const testPlan = bestPlan.slice();
          testPlan[idx] = candOrder;

          evalCount++;
          const sc = scoreCandidatePlan(testPlan);
          if (sc > bestScore + 0.01) {
            bestScore = sc;
            bestPlan = testPlan;
            improved = true;
          }

          if (candOrder.type === 'move') {
            for (let hIdx = 0; hIdx < myUnits.length; hIdx++) {
              if (hIdx === idx || evalCount >= maxEvals) continue;
              const hUnit = myUnits[hIdx];
              // 1) Try supporting candOrder
              const supOrder = (state.legalOrders[hUnit.at] || []).find(l =>
                l.type === 'support' && l.target === u.at && l.targetDest === candOrder.dest
              );
              if (supOrder) {
                const pairPlan = testPlan.slice();
                pairPlan[hIdx] = supOrder;
                evalCount++;
                const pairSc = scoreCandidatePlan(pairPlan);
                if (pairSc > bestScore + 0.01) {
                  bestScore = pairSc;
                  bestPlan = pairPlan;
                  improved = true;
                }
              }
              // 2) Try moving hUnit into u.at (vacate chain: u moves to dest, hUnit moves to u.at)
              const followOrder = (state.legalOrders[hUnit.at] || []).find(l =>
                l.type === 'move' && l.dest === u.at
              );
              if (followOrder) {
                const chainPlan = testPlan.slice();
                chainPlan[hIdx] = followOrder;
                evalCount++;
                const chainSc = scoreCandidatePlan(chainPlan);
                if (chainSc > bestScore + 0.01) {
                  bestScore = chainSc;
                  bestPlan = chainPlan;
                  improved = true;
                }
              }
            }
          }
        }
      }
      if (!improved) break;
    }

    // Final cleanup: convert any unmatched self-support orders into useful holds/supports
    const orderByUnit = {};
    for (const o of bestPlan) orderByUnit[o.unit] = o;
    for (let i = 0; i < bestPlan.length; i++) {
      const o = bestPlan[i];
      if (o.type === 'support') {
        const tOrd = orderByUnit[o.target];
        if (tOrd) {
          const matched = (o.targetDest === 'hold') ? (tOrd.type !== 'move') : (tOrd.type === 'move' && tOrd.dest === o.targetDest);
          if (!matched) {
            bestPlan[i] = { unit: o.unit, type: 'hold' };
          }
        }
      }
    }

    return bestPlan;
  }

  function retreats(state) {
    ensureCache(state);
    const result = {};
    const chosen = new Set();

    for (const rUnit of state.retreats) {
      const opts = rUnit.options || [];
      if (!opts.length) {
        result[rUnit.at] = null;
        continue;
      }

      let bestOpt = opts[0];
      let bestScore = -9999;

      for (const dest of opts) {
        let score = 0;
        if (chosen.has(dest)) score -= 500;

        const isSC = Object.hasOwn(state.owners, dest);
        const owner = state.owners[dest];
        if (state.season === 'Autumn' && isSC && owner !== state.you) {
          score += 120;
        } else if (isSC && owner !== state.you) {
          score += 45;
        } else if (isSC && owner === state.you) {
          score += 30;
        }

        let minDist = 99;
        for (const sc of scList) {
          if (state.owners[sc] !== state.you) {
            const d = distCache[rUnit.type][dest][sc];
            if (d < minDist) minDist = d;
          }
        }
        score -= minDist * 6;

        if (score > bestScore) {
          bestScore = score;
          bestOpt = dest;
        }
      }

      chosen.add(bestOpt);
      result[rUnit.at] = bestOpt;
    }

    return result;
  }

  function builds(state) {
    ensureCache(state);
    const myUnits = state.units.filter(u => u.power === state.you);
    const delta = (state.centresByPower[state.you] || 0) - myUnits.length;

    if (delta > 0) {
      const availHomes = state.map.provinces.filter(p =>
        p.home === state.you &&
        state.owners[p.id] === state.you &&
        !state.units.some(u => u.at === p.id)
      );

      availHomes.sort((a, b) => {
        let da = 99, db = 99;
        for (const sc of scList) {
          if (state.owners[sc] !== state.you) {
            da = Math.min(da, distCache.army[a.id][sc]);
            db = Math.min(db, distCache.army[b.id][sc]);
          }
        }
        return da - db || (a.id < b.id ? -1 : 1);
      });

      const currentFleets = myUnits.filter(u => u.type === 'fleet').length;
      const currentArmies = myUnits.filter(u => u.type === 'army').length;

      const buildOrders = [];
      let fleetsAdded = 0;

      for (const home of availHomes.slice(0, delta)) {
        let type = 'army';
        if (home.coastal) {
          const totalFleets = currentFleets + fleetsAdded;
          if (totalFleets === 0 && ['Lydia', 'Caria', 'Bithynia', 'Cilicia'].includes(state.you) && currentArmies >= 2) {
            type = 'fleet';
          } else if (totalFleets < 2 && currentArmies >= 4) {
            const usefulFleet = scList.some(sc =>
              state.owners[sc] !== state.you &&
              provById[sc].coastal &&
              distCache.fleet[home.id][sc] <= 3
            );
            if (usefulFleet) type = 'fleet';
          }
        }
        if (type === 'fleet') fleetsAdded++;
        buildOrders.push({ type, at: home.id });
      }
      return buildOrders;
    } else if (delta < 0) {
      const needDisband = -delta;
      const scored = myUnits.map(u => {
        let minEnemyScDist = 99;
        let minOwnScDist = 99;
        for (const sc of scList) {
          const d = distCache[u.type][u.at][sc];
          if (state.owners[sc] === state.you) minOwnScDist = Math.min(minOwnScDist, d);
          else minEnemyScDist = Math.min(minEnemyScDist, d);
        }
        const onSc = Object.hasOwn(state.owners, u.at) ? 20 : 0;
        const fleetPenalty = u.type === 'fleet' ? -6 : 0;
        const keepValue = onSc + fleetPenalty - minEnemyScDist * 3 - minOwnScDist * 2;
        return { at: u.at, keepValue };
      });
      scored.sort((a, b) => a.keepValue - b.keepValue || (a.at < b.at ? -1 : 1));
      return scored.slice(0, needDisband).map(s => ({ disband: s.at }));
    }

    return [];
  }

  module.exports = {
    name: 'Argon',
    propose,
    answer,
    orders,
    retreats,
    builds
  };
})();
