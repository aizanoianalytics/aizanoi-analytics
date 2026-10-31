import { session, finish, snapshot, summarise } from '../bot-host.mjs';

export const name = 'anatolian-pact';
export const timeoutMs = 2000;
export const defaultSeats = 7;
export { summarise };

const calls = {
  'negotiate-propose': 'propose',
  'negotiate-answer': 'answer',
  orders: 'orders',
  retreats: 'retreats',
  builds: 'builds'
};
const methods = {
  propose: 'submitProposals',
  answer: 'submitAnswers',
  orders: 'submitOrders',
  retreats: 'submitRetreats',
  builds: 'submitBuilds'
};
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function valid(call, value) {
  if (call === 'answer') {
    return record(value) && Object.values(value).every(v => v === 'accept' || v === 'reject');
  }
  if (call === 'retreats') {
    return record(value) && Object.values(value).every(v => v === null || typeof v === 'string');
  }
  if (!Array.isArray(value)) return false;
  if (call === 'propose') {
    return value.length <= 6 && value.every(p => record(p) && typeof p.to === 'string' &&
      ['peace', 'alliance', 'support', 'dmz', 'request-support'].includes(p.type) &&
      record(p.terms));
  }
  if (call === 'orders') {
    return value.every(o => record(o) && typeof o.unit === 'string' &&
      ['hold', 'move', 'support'].includes(o.type) &&
      ['dest', 'target', 'targetDest'].every(key =>
        o[key] === undefined || typeof o[key] === 'string'));
  }
  return value.every(o => record(o) && (typeof o.disband === 'string' ||
    (['army', 'fleet'].includes(o.type) && typeof o.at === 'string')));
}

export function create(seats, seed, options = {}) {
  const match = session(name, seats, seed, options, (engine, entries, opts) => {
    const powers = engine.MAP?.powers?.map(power => power.id);
    if (!powers?.length) throw new Error('Pact engine has no canonical powers');
    if (entries.length !== powers.length) {
      throw new Error(`Anatolian Pact needs ${powers.length} seats in canonical power order`);
    }
    entries.forEach((seat, index) => {
      if (seat.role) throw new Error('Pact seats use canonical power order, not team roles');
      seat.id = powers[index];
    });
    return engine.create(opts);
  });
  match.workerSeeds = match.seats.map((seat, index) =>
    (Math.imul(seed, 31) + index) >>> 0
  );
  return match;
}

export async function play(match, ask, onFrame) {
  const game = match.game;
  const fallback = (call, power) => {
    if (call === 'answer') return {};
    if (call !== 'retreats') return [];
    return Object.fromEntries((game.botState(power).retreats || []).map(unit => [
      unit.at, [...(unit.options || [])].sort()[0] || null
    ]));
  };
  const living = power => game.units().some(unit => unit.power === power) ||
    Object.values(game.owners()).includes(power) ||
    Boolean(game.botState(power).retreats?.length);
  const apply = (call, power, payload) => {
    try {
      return game[methods[call]](power, payload);
    } catch {
      return { ok: false };
    }
  };
  await onFrame(snapshot(match));
  while (!game.finished()) {
    const call = calls[game.phase];
    if (!call) throw new Error(`Unknown game phase: ${game.phase}`);
    const requests = match.seats.map((seat, index) => living(seat.id) ? {
      seat, index, state: game.botState(seat.id)
    } : null).filter(Boolean);
    const submissions = await Promise.all(requests.map(async item => {
      const payload = await ask(item.index, call, item.state);
      const good = valid(call, payload);
      return {
        ...item,
        payload: good ? payload : fallback(call, item.seat.id),
        failed: !good
      };
    }));
    const notices = [];
    for (const item of submissions) {
      const result = apply(call, item.seat.id, item.payload);
      if (!result || result.ok === false) {
        apply(call, item.seat.id, fallback(call, item.seat.id));
        item.failed = true;
      }
      if (item.failed) {
        match.errors[item.index]++;
        notices.push({ type: 'bot-fallback', power: item.seat.id, call });
      }
    }
    const result = game.advance();
    await onFrame(snapshot(match, notices.concat(result.events || [])));
  }
  return finish(match, game.result());
}
