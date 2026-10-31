import { session, finish, snapshot, summarise } from '../bot-host.mjs';

export const name = 'capture-flag';
export const timeoutMs = 150;
export const defaultSeats = 4;
export { summarise };

const directions = new Set(['up', 'down', 'left', 'right']);

export function create(seats, seed, options = {}) {
  const entries = seats.map((seat, index) => ({
    ...seat, team: seat.role ?? (index % 2 === 0 ? 'west' : 'east')
  }));
  if (entries.some(seat => !['west', 'east'].includes(seat.team)) ||
      !entries.some(seat => seat.team === 'west') ||
      !entries.some(seat => seat.team === 'east')) {
    throw new Error('Capture-flag needs west and east teams');
  }
  const match = session(name, entries, seed, options, (engine, items, opts) =>
    engine.create(items.map(({ id, team, name: label }) => ({
      id, team, name: label
    })), opts)
  );
  match.workerSeeds = seats.map((seat, index) =>
    (seed + Math.imul(index + 1, 0x9e3779b9)) >>> 0
  );
  return match;
}

export async function play(match, ask, onFrame) {
  const game = match.game;
  await onFrame(snapshot(match));
  while (!game.finished()) {
    const agents = game.agents();
    const requests = match.seats.map((seat, index) => {
      const agent = agents.find(item => item.id === seat.id);
      if (!agent || agent.jailed || agent.respawnIn > 0) return null;
      return { seat, index, state: game.botState(seat.id) };
    }).filter(Boolean);
    const moves = Object.create(null);
    await Promise.all(requests.map(async ({ seat, index, state }) => {
      const move = await ask(index, 'move', state);
      // 'stay' is the browser fallback, including an explicit bot 'stay'.
      if (!directions.has(move) && move !== 'stay') match.errors[index]++;
      moves[seat.id] = directions.has(move) ? move : 'stay';
    }));
    const events = game.step(moves);
    await onFrame(snapshot(match, events));
  }
  return finish(match, game.result());
}
