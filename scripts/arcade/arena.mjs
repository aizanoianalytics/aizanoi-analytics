#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, extname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BotHost, root, loadEngine, plain } from './bot-host.mjs';

const games = [
  'snake-royale', 'chess', 'maze-chase', 'capture-flag',
  'holdem', 'football', 'anatolian-pact'
];
const roles = new Set(['west', 'east', 'red', 'blue', 'runner', 'ghost']);

function integer(value, label, minimum, maximum) {
  if (!/^\d+$/.test(String(value))) throw new Error(`${label} must be an integer`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  }
  return number;
}

function parse(argv) {
  const config = {
    game: argv[0], seats: [], games: 10, seed: 1,
    swap: false, quiet: false, timeout: null, out: null, replays: null
  };
  if (!games.includes(config.game)) {
    throw new Error(`Game must be one of: ${games.join(', ')}`);
  }
  for (let index = 1; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--swap' || flag === '--quiet') {
      config[flag.slice(2)] = true;
      continue;
    }
    if (!['--seat', '--games', '--seed', '--timeout', '--out', '--replays'].includes(flag)) {
      throw new Error(`Unknown argument: ${flag}`);
    }
    const value = argv[++index];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${flag}`);
    }
    if (flag === '--seat') config.seats.push(value);
    else if (flag === '--games') config.games = integer(value, flag, 1, 1000000);
    else if (flag === '--seed') config.seed = integer(value, flag, 0, 0xffffffff);
    else if (flag === '--timeout') config.timeout = integer(value, flag, 1, 5000);
    else config[flag.slice(2)] = resolve(value);
  }
  return config;
}

function rosterSample(game) {
  const directory = resolve(root, 'frontend/arcade', game, 'bots');
  const ids = readdirSync(directory).filter(file => file.endsWith('.js'))
    .map(file => file.slice(0, -3)).sort();
  const id = ids.includes('sample-random') ? 'sample-random' :
    ids.find(value => value.startsWith('sample-'));
  if (!id) throw new Error(`No sample bot found for ${game}; supply --seat`);
  return id;
}

function defaultSpecs(game, count) {
  if (game === 'snake-royale') {
    const roster = JSON.parse(readFileSync(
      resolve(root, 'frontend/arcade', game, 'bots.json'), 'utf8'
    ));
    if (!Array.isArray(roster.bots)) {
      throw new Error('Snake roster must contain a bots array');
    }
    const ids = roster.bots.map(bot => bot.id);
    if (ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) {
      throw new Error('Snake roster must contain unique string ids');
    }
    if (ids.length < 2) throw new Error('Snake roster needs at least two bots');
    return ids.includes('opus') && ids.includes('kimi-k31-pro')
      ? ['opus', 'kimi-k31-pro']
      : ids.slice(0, 2);
  }
  if (game === 'capture-flag') {
    return [
      'sample-squad@west', 'sample-squad@west',
      'sample-rusher@east', 'sample-rusher@east'
    ];
  }
  return Array(count).fill(rosterSample(game));
}

function seatFrom(value, index, game) {
  let bot = value;
  let role;
  const at = value.lastIndexOf('@');
  if (at >= 0 && roles.has(value.slice(at + 1))) {
    bot = value.slice(0, at);
    role = value.slice(at + 1);
  }
  const roster = /^[a-z0-9][a-z0-9.-]*$/.test(bot) &&
    !bot.includes('..') && !bot.endsWith('.js');
  const file = roster
    ? resolve(root, 'frontend/arcade', game, 'bots', `${bot}.js`)
    : resolve(bot);
  if (!roster && extname(file) !== '.js') throw new Error('Bot paths must end in .js');
  readFileSync(file, 'utf8');
  return {
    id: `seat-${index + 1}`,
    participant: index,
    bot,
    file,
    role,
    name: roster ? bot : basename(file, '.js')
  };
}

function prepareSeats(entries, swapped) {
  if (!swapped) return entries.map(seat => ({ ...seat }));
  // Rotate participants through fixed board/role slots. For two seats this is
  // the usual colour/team swap. A full cycle covers multiplayer positions.
  return entries.map((slot, index) => ({
    ...entries[(index + swapped) % entries.length],
    id: slot.id,
    role: slot.role
  }));
}

function aggregate(all, seats, adapter) {
  const table = seats.map(seat => ({
    participant: seat.participant,
    bot: seat.bot,
    name: seat.name,
    games: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    averagePlace: null,
    points: null,
    errors: 0,
    placeTotal: 0,
    placeCount: 0,
    pointsCount: 0
  }));
  for (const result of all) {
    for (const row of adapter.summarise(result)) {
      const total = table[row.participant];
      const placed = Number.isFinite(row.place);
      total.games++;
      // Placement scoring: each place-1 finish is a win (including tied
      // firsts); other placements are losses, not inferred draws.
      // Non-placement games retain their adapter's W/D/L semantics.
      total.wins += placed ? Number(row.place === 1) : row.wins;
      total.draws += placed ? 0 : row.draws;
      total.losses += placed ? Number(row.place !== 1) : row.losses;
      total.errors += row.errors;
      if (placed) {
        total.placeTotal += row.place;
        total.placeCount++;
      }
      if (Number.isFinite(row.points)) {
        total.points = (total.points ?? 0) + row.points;
        total.pointsCount++;
      }
    }
  }
  // Placement games report mean place and mean points, not accumulated
  // bankrolls. For Holdem, the shared summariser takes the final stack/chips
  // field (after any explicit points/score), so points is average final chips,
  // not chip change. Missing values remain null and are not treated as zero.
  // Non-placement games retain summed points.
  return table.map(({ placeTotal, placeCount, pointsCount, ...row }) => ({
    ...row,
    averagePlace: placeCount ? placeTotal / placeCount : null,
    points: placeCount && pointsCount ? row.points / pointsCount : row.points
  }));
}

async function saveJSON(file, data) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function printTable(table) {
  const columns = ['seat', 'bot', 'W', 'D', 'L', 'avg place', 'points', 'errors'];
  const rows = table.map(row => [
    String(row.participant + 1), row.name, String(row.wins), String(row.draws),
    String(row.losses), row.averagePlace === null ? '-' : row.averagePlace.toFixed(2),
    row.points === null ? '-' : String(row.points), String(row.errors)
  ]);
  const widths = columns.map((column, index) =>
    Math.max(column.length, ...rows.map(row => row[index].length))
  );
  for (const row of [columns, ...rows]) {
    console.log(row.map((cell, index) => cell.padEnd(widths[index])).join('  ').trimEnd());
  }
}

export async function runArena(argv) {
  const config = parse(argv);
  const adapter = await import(`./adapters/${config.game}.mjs`);
  let count = adapter.defaultSeats;
  if (config.game === 'anatolian-pact') {
    count = loadEngine(config.game).engine.MAP.powers.length;
  }
  const specs = config.seats.length ? config.seats : defaultSpecs(config.game, count);
  const seats = specs.map((value, index) => seatFrom(value, index, config.game));
  if (config.game === 'capture-flag') {
    const counts = { west: 0, east: 0 };
    for (const [index, seat] of seats.entries()) {
      seat.role ??= index % 2 === 0 ? 'west' : 'east';
      if (!Object.hasOwn(counts, seat.role)) {
        throw new Error('Capture-flag roles must be west or east');
      }
      seat.id = `${seat.role === 'west' ? 'w' : 'e'}${++counts[seat.role]}`;
    }
  }
  if (config.game === 'chess' || config.game === 'snake-royale' ||
      config.game === 'holdem' || config.game === 'anatolian-pact') {
    if (seats.some(seat => seat.role)) throw new Error(`${config.game} has no team roles`);
  }
  const all = [];
  for (let index = 0; index < config.games; index++) {
    const rotation = config.swap ? index % seats.length : 0;
    // Every complete swap cycle shares the same engine seed.
    const seed = (config.seed + (config.swap ? Math.floor(index / seats.length) : index)) >>> 0;
    const entries = prepareSeats(seats, rotation);
    const match = adapter.create(entries, seed, {
      swapSeedSeats: config.game === 'chess' && rotation === 1
    });
    match.errors = match.seats.map(() => 0);
    const hosts = [];
    const frames = [];
    const replayFile = config.replays
      ? resolve(config.replays, `${config.game}-${String(index + 1).padStart(4, '0')}.json`)
      : null;
    let result;
    try {
      for (let seat = 0; seat < match.seats.length; seat++) {
        const initTimeout = ['chess', 'holdem'].includes(config.game) ? 1000 :
          config.game === 'anatolian-pact' ? 2000 : 5000;
        hosts.push(new BotHost(
          config.game, match.seats[seat], match.workerSeeds[seat],
          config.timeout ?? adapter.timeoutMs, initTimeout
        ));
      }
      match.loaded = await Promise.all(hosts.map(host => host.ready));
      result = await adapter.play(
        match,
        (seat, call, state) => hosts[seat].ask(call, state),
        frame => {
          if (replayFile) frames.push(plain(frame));
        }
      );
      // Errors count failed decisions once, while also including load failures.
      result.errors = hosts.map((host, seat) => Math.max(host.errors, match.errors[seat]));
      result.index = index + 1;
      result.seed = seed;
      result.swapped = rotation;
      if (result.placements) {
        result.placements = result.placements.map(placement => ({
          ...placement,
          errors: result.errors[match.seats.findIndex(seat => seat.id === placement.id)] || 0
        }));
      }
      if (replayFile) {
        const names = Object.fromEntries(match.seats.map(seat => [seat.id, seat.name]));
        const meta = {
          kind: config.game,
          seed,
          field: match.seats.map(seat => seat.id),
          turns: result.turns ?? frames.length - 1,
          placements: result.placements || [],
          winner: result.winner ?? result.result?.winner ?? null,
          file: replayFile
        };
        if (config.game === 'snake-royale') {
          await saveJSON(replayFile, { meta, opts: result.opts, names, frames });
        } else {
          await saveJSON(replayFile, {
            meta: {
              ...meta,
              schema: 'aizanoi-arena-replay-v1',
              seats: result.seats,
              result: result.result,
              errors: result.errors,
              botSeed: result.botSeed
            },
            opts: plain(match.options),
            names,
            frames
          });
        }
        result.replay = replayFile;
      }
      all.push(result);
      if (!config.quiet) {
        console.log(JSON.stringify({ game: config.game, ...result }));
      }
    } finally {
      await Promise.all(hosts.map(host => host.close()));
    }
  }
  const table = aggregate(all, seats, adapter);
  const output = {
    game: config.game,
    seed: config.seed,
    seats: seats.map(({ participant, bot, file, name, role }) => ({
      participant, bot, file, name, role
    })),
    games: all,
    table
  };
  if (config.out) await saveJSON(config.out, output);
  if (!config.quiet) printTable(table);
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runArena(process.argv.slice(2)).catch(error => {
    console.error(`arena: ${error.message}`);
    process.exitCode = 1;
  });
}
