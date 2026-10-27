import { session, finish, snapshot, summarise } from '../bot-host.mjs';

export const name = 'holdem';
export const timeoutMs = 1000;
export const defaultSeats = 2;
export { summarise };

const types = new Set(['fold', 'check', 'call', 'raise', 'allin']);

function normalize(value) {
  const action = typeof value === 'string' ? { type: value } : value;
  if (!action || !types.has(action.type)) return null;
  if (action.type === 'raise') {
    if (!Number.isSafeInteger(action.amount) || action.amount < 0) return null;
    return { type: 'raise', amount: action.amount };
  }
  return { type: action.type };
}

export function create(seats, seed, options = {}) {
  if (seats.length < 2 || seats.length > 9) throw new Error('Choose between 2 and 9 seats');
  const entries = seats.map((seat, index) => ({ ...seat, id: `s${index + 1}` }));
  const match = session(name, entries, seed, options, (engine, items, opts) =>
    engine.create(items.map(({ id, name: label }) => ({ id, name: label })), opts)
  );
  // A reproducible public bot seed, distinct from the private deck seed.
  const botSeed = options.botSeed ?? ((seed ^ 0xa511e9b3) >>> 0);
  const random = match.engine.rng(botSeed);
  match.botSeed = botSeed;
  match.workerSeeds = seats.map(() => Math.floor(random() * 4294967296));
  return match;
}

export async function play(match, ask, onFrame) {
  const game = match.game;
  let begun = false;
  await onFrame(snapshot(match));
  while (!game.finished()) {
    if (!begun || game.handOver()) {
      begun = true;
      const events = game.startHand() || [];
      await onFrame(snapshot(match, events));
      continue;
    }
    const id = game.toAct();
    const index = match.seats.findIndex(seat => seat.id === id);
    if (index < 0) throw new Error('Engine has no acting seat in an active hand');
    let action = normalize(await ask(index, 'act', game.botState(id)));
    let result = action ? game.act(id, action) : null;
    const failed = !result || !result.ok;
    if (failed) {
      match.errors[index]++;
      action = { type: game.legalActions(id).canCheck ? 'check' : 'fold' };
      result = game.act(id, action);
    }
    if (!result?.ok) throw new Error('Engine rejected its safe fallback');
    await onFrame(snapshot(match, [{
      type: 'action',
      id,
      action,
      events: result.events || [],
      error: failed,
      handNumber: game.handNumber,
      handResult: game.handOver() ? game.handResult() : null
    }]));
  }
  return finish(match, game.result(), { botSeed: match.botSeed });
}
