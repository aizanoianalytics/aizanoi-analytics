(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(typeof PactMapData !== 'undefined' ? PactMapData : globalThis.PactMapData);
  } else root.PactEngine = factory(root.PactMapData);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (mapData) {
  'use strict';

  if (!mapData || !Array.isArray(mapData.rows) || !Array.isArray(mapData.provinces)) {
    throw new Error('Load generated map-data.js before engine.js.');
  }
  const copy = value => JSON.parse(JSON.stringify(value));
  const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  const ids = value => Object.keys(value).sort(compare);
  const rows = mapData.rows.slice();
  const hexSize = 16;
  const powers = mapData.powers.map(power => ({
    id: power.name,
    color: power.colour,
    homes: power.homes.slice(),
    fleet: power.units.find(unit => unit.type === 'fleet')?.at || null
  }));
  const metadata = Object.fromEntries(mapData.provinces.map(p => [p.id, p]));

  function neighbours(col, row) {
    const side = row & 1 ? 1 : -1;
    return [[col - 1, row], [col + 1, row], [col, row - 1],
      [col + side, row - 1], [col, row + 1], [col + side, row + 1]];
  }

  function pixel(col, row) {
    return [hexSize * Math.sqrt(3) * (col + (row & 1) / 2 + 1), hexSize * (1.5 * row + 1)];
  }

  const provinces = {};
  const adjacency = {};
  rows.forEach((row, y) => Array.from(row).forEach((id, x) => {
    if (id === '~' || id === ' ') return;
    const data = metadata[id];
    if (!data) throw new Error('Undefined map province: ' + id);
    if (!provinces[id]) {
      provinces[id] = {
        id, name: data.name, type: data.type, coastal: false,
        sc: Boolean(data.sc), home: data.home || null, hexes: [], centre: [0, 0]
      };
      adjacency[id] = [];
    }
    provinces[id].hexes.push([x, y]);
  }));
  Object.values(provinces).forEach(province => {
    const adjacent = new Set();
    province.hexes.forEach(([x, y]) => {
      const point = pixel(x, y);
      province.centre[0] += point[0] / province.hexes.length;
      province.centre[1] += point[1] / province.hexes.length;
      neighbours(x, y).forEach(([nx, ny]) => {
        const other = rows[ny] && rows[ny][nx];
        if (other && other !== province.id && provinces[other]) adjacent.add(other);
      });
    });
    adjacency[province.id] = Array.from(adjacent).sort(compare);
    province.coastal = province.type === 'land' &&
      adjacency[province.id].some(id => provinces[id].type === 'sea');
  });

  function freeze(value) {
    Object.values(value).forEach(item => {
      if (item && typeof item === 'object') freeze(item);
    });
    return Object.freeze(value);
  }
  const MAP = freeze({
    rows, provinces, adjacency, powers, hexSize, neighbours, pixel,
    rules: 'No convoys. Armies cannot cross the straits or reach Thrace or Cyprus from the mainland. ' +
      'Fleets may sail between these land components through adjoining seas. ' +
      'Fleets cross adjoining coasts only when both touch the same sea province.'
  });

  function rng(seed) {
    let a = Number(seed) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function canMove(unit, dest) {
    const to = provinces[dest];
    if (!to || !provinces[unit.at] || !adjacency[unit.at].includes(dest)) return false;
    if (unit.type === 'army') return to.type === 'land';
    if (unit.type !== 'fleet' || (to.type === 'land' && !to.coastal)) return false;
    const from = provinces[unit.at];
    return from.type === 'sea' || to.type === 'sea' || adjacency[unit.at].some(id =>
      provinces[id].type === 'sea' && adjacency[dest].includes(id));
  }

  function normalize(units, submitted) {
    const at = Object.fromEntries(units.map(unit => [unit.at, unit]));
    return units.map(unit => {
      const entries = (Array.isArray(submitted) ? submitted : [])
        .filter(order => order && order.unit === unit.at);
      const order = entries[0];
      let valid = entries.length <= 1;
      let normalized = { unit: unit.at, type: 'hold' };
      if (order && order.type === 'move' && canMove(unit, order.dest)) {
        normalized = { unit: unit.at, type: 'move', dest: order.dest };
      } else if (order && order.type === 'support' && at[order.target] && order.target !== unit.at) {
        const holding = order.targetDest === 'hold' || order.targetDest === undefined;
        const dest = holding ? order.target : order.targetDest;
        if (canMove(unit, dest) && (holding || canMove(at[order.target], dest))) {
          normalized = {
            unit: unit.at, type: 'support', target: order.target,
            targetDest: holding ? 'hold' : dest
          };
        } else valid = false;
      } else if (order && order.type !== 'hold') valid = false;
      if (!valid) normalized = { unit: unit.at, type: 'hold' };
      return { ...normalized, power: unit.power, valid };
    });
  }

  function adjudicate(units, submitted) {
    const orders = normalize(units, submitted);
    const at = Object.fromEntries(units.map(unit => [unit.at, unit]));
    const byUnit = Object.fromEntries(orders.map(order => [order.unit, order]));
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
      ids(provinces).forEach(dest => {
        const attacks = incoming(dest);
        if (!attacks.length) return;
        const best = Math.max(...attacks.map(move => strength(move)));
        const winners = attacks.filter(move => strength(move) === best);
        if (winners.length === 1) candidates[winners[0].unit] = winners[0];
      });
      const success = {};
      const visiting = new Set();

      function succeeds(move) {
        if (Object.hasOwn(success, move.unit)) return success[move.unit];
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
      if (seen.has(key)) throw new Error('Non-convergent adjudication');
      seen.add(key);
      removed = solved.dislodged;
    }
    const standoffs = ids(provinces).filter(dest => {
      const attacks = solved.liveMoves.filter(move => move.dest === dest);
      if (attacks.length < 2) return false;
      const best = Math.max(...attacks.map(move => solved.strength(move)));
      return attacks.filter(move => solved.strength(move) === best).length > 1 &&
        !attacks.some(move => solved.success[move.unit]);
    });
    const displaced = units.filter(unit => solved.dislodged[unit.at])
      .map(unit => ({ ...unit, attacker: solved.dislodged[unit.at] }));
    const survivors = units.filter(unit => !solved.dislodged[unit.at]).map(unit => ({
      ...unit, at: solved.success[unit.at] ? byUnit[unit.at].dest : unit.at
    }));
    const resolution = orders.map(order => ({
      ...order,
      ...(order.type === 'support' ? { effective: solved.active.includes(order) } : {}),
      outcome: !order.valid ? 'invalid' : solved.dislodged[order.unit] ? 'dislodged' :
        order.type === 'move' ? solved.success[order.unit] ? 'success' : 'bounce' :
          order.type === 'support' && solved.isCut(order) ? 'cut' : 'success'
    }));
    return { units: survivors, dislodged: displaced, standoffs, resolution };
  }

  function retreatOptions(unit, units, standoffs) {
    return adjacency[unit.at].filter(dest => canMove(unit, dest) && dest !== unit.attacker &&
      !standoffs.includes(dest) && !units.some(other => other.at === dest));
  }

  function resolveRetreats(units, dislodged, standoffs, choices) {
    const attempts = dislodged.map(unit => {
      const options = retreatOptions(unit, units, standoffs);
      const specified = choices[unit.power];
      const dest = specified && Object.hasOwn(specified, unit.at) ?
        specified[unit.at] : options[0] || null;
      return { unit, dest: options.includes(dest) ? dest : null };
    });
    const survivors = attempts.filter(attempt => attempt.dest &&
      attempts.filter(other => other.dest === attempt.dest).length === 1);
    return {
      units: units.concat(survivors.map(({ unit, dest }) => ({
        power: unit.power, type: unit.type, at: dest
      }))),
      events: attempts.map(({ unit, dest }) => ({
        type: 'retreat', power: unit.power, from: unit.at,
        to: survivors.some(attempt => attempt.unit === unit) ? dest : null
      }))
    };
  }

  function create(options) {
    options = options || {};
    const seed = Number(options.seed) >>> 0;
    const maxYears = Number.isInteger(options.maxYears) && options.maxYears > 0 ? options.maxYears : 12;
    const setup = options.setup || {};
    let phase = setup.phase || 'negotiate-propose';
    let year = setup.year || 1;
    let season = setup.season || 'Spring';
    let units = copy(setup.units || powers.flatMap(power => power.homes.map(at => ({
      power: power.id, type: power.fleet === at ? 'fleet' : 'army', at
    }))));
    let owners = Object.fromEntries(Object.values(provinces).filter(province => province.sc)
      .map(province => [province.id, province.home]));
    if (setup.owners) owners = { ...owners, ...copy(setup.owners) };
    let proposals = [], promises = [], submissions = {}, dislodged = [], standoffs = [];
    let history = [], pending = null, final = null, serial = 0;
    const eliminated = [];
    const eliminationCohort = {};
    let cohort = 0;
    const trust = Object.fromEntries(powers.map(power => [power.id, {
      promisesMade: 0, kept: 0, broken: 0, brokenPromises: []
    }]));
    const known = power => powers.some(item => item.id === power);
    const centres = () => Object.fromEntries(powers.map(power => [
      power.id, Object.values(owners).filter(owner => owner === power.id).length
    ]));
    const living = power => known(power) && !eliminated.includes(power);
    const allowed = (power, expected) => phase === expected && living(power);

    function legalOrders(power) {
      return Object.fromEntries(units.filter(unit => unit.power === power).map(unit => {
        const legal = [{ unit: unit.at, type: 'hold' }];
        adjacency[unit.at].filter(dest => canMove(unit, dest)).forEach(dest =>
          legal.push({ unit: unit.at, type: 'move', dest }));
        units.filter(target => target.at !== unit.at).forEach(target => {
          if (canMove(unit, target.at)) {
            legal.push({ unit: unit.at, type: 'support', target: target.at, targetDest: 'hold' });
          }
          adjacency[target.at].filter(dest => canMove(target, dest) && canMove(unit, dest))
            .forEach(dest => legal.push({
              unit: unit.at, type: 'support', target: target.at, targetDest: dest
            }));
        });
        return [unit.at, legal];
      }));
    }

    function validProposal(power, proposal) {
      if (!proposal || !living(proposal.to) || proposal.to === power) return false;
      const terms = proposal.terms;
      if (!terms || typeof terms !== 'object' || Array.isArray(terms)) return false;
      const fields = {
        peace: [], alliance: ['target'], dmz: ['province'],
        support: ['dest', 'unit'], 'request-support': ['dest', 'unit']
      };
      if (!Object.hasOwn(fields, proposal.type) || JSON.stringify(Object.keys(terms).sort()) !==
        JSON.stringify(fields[proposal.type])) return false;
      if (proposal.type === 'peace') return true;
      if (proposal.type === 'alliance') {
        return living(terms.target) && ![power, proposal.to].includes(terms.target);
      }
      if (proposal.type === 'dmz') return Object.hasOwn(provinces, terms.province);
      const beneficiary = proposal.type === 'support' ? proposal.to : power;
      const supporter = proposal.type === 'support' ? power : proposal.to;
      const target = units.find(unit => unit.at === terms.unit && unit.power === beneficiary);
      if (!target || !(terms.dest === 'hold' || canMove(target, terms.dest))) return false;
      const dest = terms.dest === 'hold' ? terms.unit : terms.dest;
      return units.some(unit => unit.power === supporter && canMove(unit, dest) && unit.at !== terms.unit);
    }

    function submitProposals(power, list) {
      if (!allowed(power, 'negotiate-propose')) return { ok: false, errors: ['Wrong phase or power'] };
      if (!Array.isArray(list) || list.length > 6) {
        return { ok: false, errors: ['At most six proposals are allowed'] };
      }
      const errors = list.flatMap((proposal, index) =>
        validProposal(power, proposal) ? [] : ['Invalid proposal ' + index]);
      if (errors.length) return { ok: false, errors };
      submissions[power] = list.map(({ to, type, terms }) => ({ to, type, terms: copy(terms) }));
      return { ok: true, errors: [] };
    }

    function submitAnswers(power, answers) {
      if (!allowed(power, 'negotiate-answer') || !answers ||
        typeof answers !== 'object' || Array.isArray(answers)) return { ok: false };
      const inbox = proposals.filter(proposal => proposal.to === power);
      if (Object.entries(answers).some(([id, answer]) =>
        !inbox.some(proposal => proposal.id === id) || !['accept', 'reject'].includes(answer))) {
        return { ok: false };
      }
      submissions[power] = copy(answers);
      return { ok: true };
    }

    function submitOrders(power, list) {
      if (!allowed(power, 'orders') || !Array.isArray(list)) return { ok: false, normalized: [] };
      const own = units.filter(unit => unit.power === power);
      const normalized = normalize(own.concat(units.filter(unit => unit.power !== power)), list)
        .filter(order => order.power === power);
      submissions[power] = normalized.map(({ power: ignored, valid, ...order }) => ({
        ...order, _invalid: !valid
      }));
      return { ok: true, normalized: copy(normalized) };
    }

    function submitRetreats(power, choices) {
      if (!allowed(power, 'retreats') || !choices ||
        typeof choices !== 'object' || Array.isArray(choices)) return { ok: false };
      const own = dislodged.filter(unit => unit.power === power);
      if (Object.entries(choices).some(([from, dest]) => !own.some(unit => unit.at === from &&
        (dest === null || retreatOptions(unit, units, standoffs).includes(dest))))) return { ok: false };
      submissions[power] = copy(choices);
      return { ok: true };
    }

    function submitBuilds(power, list) {
      if (!allowed(power, 'builds') || !Array.isArray(list)) return { ok: false };
      const delta = centres()[power] - units.filter(unit => unit.power === power).length;
      const seen = new Set();
      const valid = list.length <= Math.abs(delta) && list.every(order => {
        if (!order || typeof order !== 'object') return false;
        const at = delta < 0 ? order.disband : order.at;
        if (seen.has(at)) return false;
        seen.add(at);
        if (delta < 0) return units.some(unit => unit.power === power && unit.at === at);
        const province = provinces[at];
        return delta > 0 && province && province.home === power && owners[at] === power &&
          !units.some(unit => unit.at === at) &&
          (order.type === 'army' || order.type === 'fleet' && province.coastal);
      });
      if (!valid) return { ok: false };
      submissions[power] = copy(list);
      return { ok: true };
    }

    function accept(proposal) {
      let makers = [proposal.from, proposal.to];
      if (proposal.type === 'support') makers = [proposal.from];
      if (proposal.type === 'request-support') makers = [proposal.to];
      makers.forEach(power => {
        promises.push({
          id: proposal.id, power, partner: power === proposal.from ? proposal.to : proposal.from,
          type: proposal.type === 'request-support' ? 'support' : proposal.type,
          terms: copy(proposal.terms)
        });
        trust[power].promisesMade++;
      });
    }

    function evaluate(orders, before) {
      return promises.map(promise => {
        const own = orders.filter(order => order.power === promise.power);
        let broken = false;
        if (promise.type === 'peace' || promise.type === 'alliance') {
          broken = own.some(order => {
            const dest = order.type === 'move' ? order.dest :
              order.type === 'support' && order.targetDest !== 'hold' ? order.targetDest : null;
            return dest && before.some(unit => unit.at === dest && unit.power === promise.partner);
          });
        } else if (promise.type === 'dmz') {
          broken = own.some(order => order.type === 'move' && order.dest === promise.terms.province);
        } else {
          broken = !own.some(order => order.type === 'support' && order.target === promise.terms.unit &&
            order.targetDest === promise.terms.dest && order.valid);
        }
        const outcome = { ...promise, year, season, outcome: broken ? 'broken' : 'kept' };
        trust[promise.power][broken ? 'broken' : 'kept']++;
        if (broken) trust[promise.power].brokenPromises.push(copy(outcome));
        return outcome;
      });
    }

    function updateEliminated() {
      const counts = centres();
      const newly = powers.filter(({ id }) =>
        !counts[id] && !units.some(unit => unit.power === id) && !eliminated.includes(id));
      if (!newly.length) return;
      cohort++;
      newly.forEach(({ id }) => {
        eliminated.push(id);
        eliminationCohort[id] = cohort;
      });
    }

    function endGame() {
      const counts = centres();
      updateEliminated();
      const majority = powers.filter(power => counts[power.id] >= 13).map(power => power.id);
      if (!majority.length && year < maxYears) return false;
      const best = Math.max(...Object.values(counts));
      const winners = majority.length ? majority :
        powers.filter(power => counts[power.id] === best).map(power => power.id);
      const ranked = powers.map(power => power.id).sort((a, b) => {
        const ea = eliminationCohort[a] || 0, eb = eliminationCohort[b] || 0;
        if (ea || eb) return !ea ? -1 : !eb ? 1 : eb - ea || compare(a, b);
        return counts[b] - counts[a] || compare(a, b);
      });
      const placements = ranked.map((power, index) => ({
        power, rank: index + 1, centres: counts[power], eliminated: eliminated.includes(power)
      }));
      placements.forEach((entry, index) => {
        if (!index) return;
        const previous = placements[index - 1];
        const tied = entry.eliminated && previous.eliminated ?
          eliminationCohort[entry.power] === eliminationCohort[previous.power] :
          !entry.eliminated && !previous.eliminated && entry.centres === previous.centres;
        if (tied) entry.rank = previous.rank;
      });
      final = {
        winner: winners.length === 1 ? winners[0] : null,
        shared: winners.length > 1 ? winners : [],
        reason: majority.length ? 'majority' : 'years', year, centres: counts,
        trust: Object.fromEntries(powers.map(({ id }) => [id, {
          made: trust[id].promisesMade, kept: trust[id].kept, broken: trust[id].broken
        }])),
        placements
      };
      phase = 'over';
      return true;
    }

    function nextSeason() {
      history.push(pending);
      history = history.slice(-6);
      pending = null;
      updateEliminated();
      if (season === 'Spring') {
        season = 'Autumn';
        phase = 'negotiate-propose';
      } else {
        units.forEach(unit => {
          if (Object.hasOwn(owners, unit.at)) owners[unit.at] = unit.power;
        });
        if (!endGame()) phase = 'builds';
      }
      proposals = [];
      promises = [];
    }

    function distance(at, power) {
      const queue = powers.find(item => item.id === power).homes.map(id => [id, 0]);
      const seen = new Set();
      for (let index = 0; index < queue.length; index++) {
        const [id, depth] = queue[index];
        if (id === at) return depth;
        if (seen.has(id)) continue;
        seen.add(id);
        adjacency[id].forEach(next => {
          if (!seen.has(next)) queue.push([next, depth + 1]);
        });
      }
      return Infinity;
    }

    function advance() {
      const events = [];
      let resolution = null;
      if (phase === 'over') return { events, resolution };
      if (phase === 'negotiate-propose') {
        powers.forEach(({ id }) => (submissions[id] || []).forEach(proposal => proposals.push({
          ...proposal, id: 'p' + (++serial), from: id, status: 'pending'
        })));
        phase = 'negotiate-answer';
      } else if (phase === 'negotiate-answer') {
        proposals.forEach(proposal => {
          proposal.status = submissions[proposal.to] &&
            submissions[proposal.to][proposal.id] === 'accept' ? 'accepted' : 'rejected';
          if (proposal.status === 'accepted') accept(proposal);
        });
        phase = 'orders';
      } else if (phase === 'orders') {
        const before = copy(units);
        const submitted = Object.values(submissions).flat();
        const battle = adjudicate(units, submitted);
        battle.resolution.forEach(order => {
          if (submitted.some(original => original.unit === order.unit && original._invalid)) {
            order.valid = false;
            order.outcome = 'invalid';
          }
        });
        units = battle.units;
        dislodged = battle.dislodged;
        standoffs = battle.standoffs;
        resolution = battle.resolution;
        const outcomes = evaluate(resolution, before);
        events.push(...outcomes.map(outcome => ({
          ...outcome, promiseType: outcome.type, type: 'promise'
        })));
        pending = {
          year, season,
          orders: Object.fromEntries(powers.map(({ id }) => [
            id, resolution.filter(order => order.power === id)
          ])),
          resolution: copy(resolution), promises: outcomes
        };
        if (dislodged.length) phase = 'retreats';
        else nextSeason();
      } else if (phase === 'retreats') {
        const retreat = resolveRetreats(units, dislodged, standoffs, submissions);
        units = retreat.units;
        events.push(...retreat.events);
        pending.retreats = copy(retreat.events);
        dislodged = [];
        nextSeason();
      } else if (phase === 'builds') {
        const counts = centres();
        powers.forEach(({ id }) => {
          const own = units.filter(unit => unit.power === id);
          const excess = own.length - counts[id];
          if (excess > 0) {
            const selected = (submissions[id] || []).map(order => order.disband);
            own.sort((a, b) => {
              const da = distance(a.at, id), db = distance(b.at, id);
              return (da === db ? 0 : db > da ? 1 : -1) || compare(a.at, b.at);
            });
            const remove = selected.concat(own.map(unit => unit.at)
              .filter(at => !selected.includes(at))).slice(0, excess);
            units = units.filter(unit => unit.power !== id || !remove.includes(unit.at));
            remove.forEach(at => events.push({ type: 'disband', power: id, at }));
          } else {
            (submissions[id] || []).slice(0, -excess).forEach(order => {
              units.push({ power: id, type: order.type, at: order.at });
              events.push({ type: 'build', power: id, ...order });
            });
          }
        });
        updateEliminated();
        year++;
        season = 'Spring';
        phase = 'negotiate-propose';
      }
      submissions = {};
      return { events: copy(events), resolution: copy(resolution) };
    }

    function botState(power) {
      return copy({
        phase, year, season, seed, you: power,
        map: { provinces: Object.values(provinces), adjacency },
        units, owners, centresByPower: centres(),
        inbox: proposals.filter(proposal => proposal.to === power && proposal.status === 'pending'),
        accepted: promises.filter(promise => promise.power === power || promise.partner === power),
        trust, history,
        retreats: dislodged.filter(unit => unit.power === power).map(unit => ({
          ...unit, options: retreatOptions(unit, units, standoffs)
        })),
        legalOrders: legalOrders(power),
        limits: { maxProposals: 6, timeLimitMs: 2000, maxYears }
      });
    }

    return {
      get phase() { return phase; },
      get year() { return year; },
      get season() { return season; },
      units: () => copy(units),
      owners: () => copy(owners),
      proposals: () => copy(proposals),
      submitProposals, submitAnswers, submitOrders, submitRetreats, submitBuilds,
      advance, botState, legalOrders,
      finished: () => phase === 'over',
      result: () => copy(final)
    };
  }

  return { MAP, rng, create, canMove, adjudicate, retreatOptions, resolveRetreats };
});
