import { session, finish, plain, summarise } from '../bot-host.mjs';

export const name = 'snake-royale';
export const timeoutMs = 400;
export const defaultSeats = 2;
export { summarise };

export function create(seats, seed, options = {}) {
  if (seats.length < 2 || seats.length > 12) {
    throw new Error('Choose between 2 and 12 fighters');
  }
  // Duels retain the engine's 11x11 defaults. Multiplayer uses the browser's
  // 19x19 board, while allowing explicit adapter options to override sizing.
  const boardOptions = seats.length > 2
    ? { width: 19, height: 19, ...options }
    : { ...options };
  const match = session(name, seats, seed, boardOptions, (engine, entries, opts) => {
    const game = engine.create(entries.map(seat => seat.id), opts);
    game.snakes.forEach((snake, index) => {
      snake.name = entries[index].name;
    });
    return game;
  });
  match.workerSeeds = seats.map((seat, index) => match.game.options.seed * 31 + index);
  return match;
}

function frame(game, events) {
  const state = typeof game.state === 'function' ? game.state() :
    typeof game.snapshot === 'function' ? game.snapshot() : game;
  const food = state.food ?? game.food;
  if (!food || !state.snakes) {
    throw new Error('Snake engine does not expose food and snakes for replay');
  }
  const cells = [...food].map(cell => {
    if (Array.isArray(cell)) return cell.slice();
    if (typeof cell === 'string') return cell.split(',').map(Number);
    return [cell.x, cell.y];
  });
  return plain({
    turn: state.turn ?? game.turn,
    hazard: state.hazard ?? game.hazard,
    food: cells,
    snakes: state.snakes.map(snake => ({
      id: snake.id,
      body: snake.body.map(cell => Array.isArray(cell) ? cell.slice() : [cell.x, cell.y]),
      health: snake.health,
      alive: snake.alive
    })),
    events
  });
}

export async function play(match, ask, onFrame) {
  const game = match.game;
  match.loaded.forEach((ready, index) => {
    if (!ready) {
      game.snakes[index].alive = false;
      game.snakes[index].death = { turn: 0, cause: 'load-error', by: null };
    }
  });
  await onFrame(frame(game, []));
  while (!game.finished()) {
    const requests = game.snakes.filter(snake => snake.alive).map(snake => ({
      id: snake.id,
      index: match.seats.findIndex(seat => seat.id === snake.id),
      state: game.botState(snake.id)
    }));
    const moves = Object.create(null);
    await Promise.all(requests.map(async request => {
      const move = await ask(request.index, 'move', request.state);
      moves[request.id] = typeof move === 'string' ? move : null;
    }));
    const events = game.step(moves);
    await onFrame(frame(game, events));
  }
  const placements = plain(game.placements());
  // The engine owns normalization/fallback errors, including successful worker
  // responses that contain invalid moves. Preserve those before CLI accounting
  // combines adapter and transport failures without double-counting a timeout.
  for (const placement of placements) {
    const index = match.seats.findIndex(seat => seat.id === placement.id);
    match.errors[index] = Math.max(match.errors[index] || 0, placement.errors || 0);
  }
  const winner = placements.find(item => (item.place ?? item.rank) === 1)?.id ??
    (placements.length ? placements[0].id : null);
  return finish(match, { winner }, {
    winner, placements, turns: game.turn, opts: plain(game.options)
  });
}
