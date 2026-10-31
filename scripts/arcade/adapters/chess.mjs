import { session, finish, snapshot, summarise as baseSummary } from '../bot-host.mjs';

export const name = 'chess';
export const timeoutMs = 1000;
export const defaultSeats = 2;

export function create(seats, seed, options = {}) {
  if (seats.length !== 2) throw new Error('Chess needs exactly two seats');
  const match = session(name, seats, seed, options, (engine, entries, opts) =>
    engine.create({ variant: opts.variant || 'standard', position960: opts.position960 })
  );
  match.seats.forEach((seat, index) => {
    seat.color = index === 0 ? 'w' : 'b';
  });
  match.workerSeeds = match.seats.map((seat, index) => {
    const participant = options.swapSeedSeats ? 1 - index : index;
    return (seed ^ Math.imul(participant + 1, 0x9e3779b9)) >>> 0;
  });
  return match;
}

function capture(match, events) {
  const frame = snapshot(match, events);
  frame.status = match.game.status();
  frame.turn = match.game.turn;
  return frame;
}

export async function play(match, ask, onFrame) {
  const game = match.game;
  const failed = match.loaded.map((ready, index) => ready ? null : index).filter(x => x !== null);
  if (failed.length === 2) game.forfeitBoth('Both bots failed to load');
  else if (failed.length === 1) {
    game.forfeit(failed[0] === 0 ? 'w' : 'b', 'load failed');
  }
  await onFrame(capture(match, []));
  while (!game.status().over) {
    const color = game.turn;
    const index = color === 'w' ? 0 : 1;
    const state = game.botState();
    const move = await ask(index, 'move', state);
    let event;
    if (typeof move !== 'string' || !state.legalMoves.includes(move)) {
      match.errors[index]++;
      game.forfeit(color, 'illegal move or unavailable bot');
      event = { type: 'forfeit', color };
    } else {
      event = game.move(move);
      if (!event.ok) {
        match.errors[index]++;
        game.forfeit(color, 'illegal move');
      }
    }
    await onFrame(capture(match, [event]));
  }
  const result = finish(match, game.status());
  result.seats.forEach((seat, index) => {
    seat.color = index === 0 ? 'w' : 'b';
  });
  return result;
}

export function summarise(result) {
  const rows = baseSummary(result);
  const status = result.result;
  // Chess reports '1-0' / '0-1' / '1/2-1/2' rather than a winner id, so map it to colours here.
  const winner = status.result === '1-0' ? 'w' : status.result === '0-1' ? 'b' : null;
  rows.forEach((row, index) => {
    const color = result.seats[index].color;
    row.wins = winner && color === winner ? 1 : 0;
    row.losses = winner && color !== winner ? 1 : 0;
    row.draws = status.over && !winner ? 1 : 0;
  });
  return rows;
}
