import { session, finish, snapshot, summarise } from '../bot-host.mjs';

export const name = 'maze-chase';
export const timeoutMs = 150;
export const defaultSeats = 2;
export { summarise };

const directions = new Set(['up', 'down', 'left', 'right', 'stay']);

export function create(seats, seed, options = {}) {
  const entries = seats.map((seat, index) => ({
    ...seat, role: seat.role || (index === 0 ? 'runner' : 'ghost')
  }));
  if (!entries.some(seat => seat.role === 'runner') ||
      !entries.some(seat => seat.role === 'ghost') ||
      entries.some(seat => !['runner', 'ghost'].includes(seat.role))) {
    throw new Error('Maze seats require runner and ghost roles');
  }
  const match = session(name, entries, seed, options, (engine, items, opts) =>
    engine.create(items.map(({ id, role, name: label }) => ({
      id, role, name: label
    })), opts)
  );
  match.workerSeeds = seats.map((seat, index) => (Math.imul(seed, 31) + index) >>> 0);
  return match;
}

export async function play(match, ask, onFrame) {
  const game = match.game;
  await onFrame(snapshot(match));
  while (!game.finished()) {
    const agents = game.agents();
    const requests = match.seats.map((seat, index) => {
      const agent = agents.find(item => item.id === seat.id);
      if (!agent || !agent.alive || agent.respawnIn > 0) return null;
      return { seat, index, state: game.botState(seat.id) };
    }).filter(Boolean);
    const moves = Object.create(null);
    await Promise.all(requests.map(async ({ seat, index, state }) => {
      const move = await ask(index, 'move', state);
      if (!directions.has(move)) match.errors[index]++;
      moves[seat.id] = directions.has(move) ? move : null;
    }));
    const events = game.step(moves);
    await onFrame(snapshot(match, events));
  }
  return finish(match, game.result());
}
