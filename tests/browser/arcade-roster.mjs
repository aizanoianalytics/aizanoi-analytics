import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const arenas = {
  chess: { hook: '__CHESS_ARENA__', prefix: 'ch', selects: '#ch-white, #ch-black', special: ['human', 'custom'] },
  'maze-chase': { hook: '__MAZE_CHASE__', prefix: 'mc', selects: '#mc-runners select, #mc-ghosts select', special: ['p1', 'p2', 'custom'] },
  'capture-flag': { hook: '__CAPTURE_FLAG__', prefix: 'cf', selects: '#cf-west select, #cf-east select', special: ['p1', 'p2', 'custom'] },
  holdem: { hook: '__HOLDEM__', prefix: 'ph', selects: '#ph-seats select', special: ['human', 'custom'] },
  football: { hook: '__FOOTBALL__', prefix: 'fb', selects: '#fb-red select, #fb-blue select', special: ['p1', 'p2', 'custom'] },
  'anatolian-pact': { hook: '__ANATOLIAN_PACT__', prefix: 'ap', selects: '#ap-seats select', special: ['human', 'custom'] },
  'snake-royale': { hook: '__SNAKE_ROYALE__', prefix: 'sr', selects: '#sr-a, #sr-b', special: [] },
};

// Read the shipped manifest, not a duplicate count or the browser's own roster.
export async function assertFullRoster(page, game) {
  const manifest = JSON.parse(await readFile(
    new URL(`../../frontend/arcade/${game}/bots.json`, import.meta.url), 'utf8',
  ));
  const ids = manifest.bots.map(bot => bot.id);
  const arena = arenas[game];
  await page.waitForFunction(({ hook, count }) => {
    const bots = window[hook]?.().bots;
    return (Array.isArray(bots) ? bots.length : bots) === count;
  }, { hook: arena.hook, count: ids.length }, { timeout: 20000 });

  const actual = await page.evaluate(({ hook, selects, prefix }) => {
    const bots = window[hook]().bots;
    return {
      count: Array.isArray(bots) ? bots.length : bots,
      ids: Array.isArray(bots) ? bots.map(bot => bot.id) : null,
      pickers: [...document.querySelectorAll(selects)].map(select =>
        [...select.options].map(option => option.value)),
      listed: document.querySelectorAll(`#${prefix}-list > li`).length,
    };
  }, arena);
  assert.equal(actual.count, ids.length, `${game}: full manifest roster count`);
  if (actual.ids) assert.deepEqual(actual.ids, ids, `${game}: runtime roster IDs`);
  assert.equal(actual.listed, ids.length, `${game}: every manifest bot is listed`);
  assert.ok(actual.pickers.length > 0, `${game}: seat pickers exist`);
  for (const picker of actual.pickers) {
    assert.deepEqual(picker, [...arena.special, ...ids],
      `${game}: picker IDs must exactly match human/custom choices and the manifest`);
  }
  return ids.length;
}
