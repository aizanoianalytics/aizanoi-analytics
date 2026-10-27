import { session, finish, snapshot, summarise } from '../bot-host.mjs';

export const name = 'football';
export const timeoutMs = 50;
export const defaultSeats = 2;
export { summarise };

const empty = Object.freeze({ x: 0, y: 0, kick: false });

function sanitize(input) {
  if (!input || !Number.isFinite(input.x) || !Number.isFinite(input.y) ||
      typeof input.kick !== 'boolean') return null;
  return {
    x: Math.max(-1, Math.min(1, input.x)),
    y: Math.max(-1, Math.min(1, input.y)),
    kick: input.kick
  };
}

export function create(seats, seed, options = {}) {
  const counts = { red: 0, blue: 0 };
  const entries = seats.map((seat, index) => {
    const team = seat.role || (index % 2 === 0 ? 'red' : 'blue');
    if (!Object.hasOwn(counts, team)) throw new Error('Football roles are red and blue');
    const number = ++counts[team];
    return { ...seat, team, id: `${team === 'red' ? 'r' : 'b'}${number}` };
  });
  if (Object.values(counts).some(count => count < 1 || count > 4)) {
    throw new Error('Football teams need one to four players');
  }
  const match = session(name, entries, seed, options, (engine, items, opts) =>
    engine.create(items.map(({ id, team, name: label }) => ({
      id, team, name: label
    })), { ...opts, decisionEvery: 3 })
  );
  match.workerSeeds = seats.map((seat, index) =>
    ((seed || 1) + Math.imul(index + 1, 0x9e3779b9)) >>> 0
  );
  return match;
}

export async function play(match, ask, onFrame) {
  const game = match.game;
  const inputs = Object.fromEntries(match.seats.map(seat => [seat.id, empty]));
  await onFrame(snapshot(match));
  while (!game.finished()) {
    if (game.steps % 3 === 0) {
      const requests = match.seats.map((seat, index) => ({
        seat, index, state: game.botState(seat.id)
      }));
      await Promise.all(requests.map(async ({ seat, index, state }) => {
        const input = sanitize(await ask(index, 'decide', state));
        if (input) {
          inputs[seat.id] = match.engine.mirrorInput(input, seat.team);
        } else {
          match.errors[index]++;
          // Like the browser, retain the last accepted input.
        }
      }));
    }
    const events = game.step(inputs);
    await onFrame(snapshot(match, events));
  }
  return finish(match, game.result());
}
