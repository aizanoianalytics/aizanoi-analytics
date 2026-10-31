import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const counts = { 'snake-royale': 22, chess: 22, 'maze-chase': 22, 'capture-flag': 22, holdem: 22, football: 21, 'anatolian-pact': 22 };
test('all 153 AI WAR entries are present with unique arena colors, valid scripts and exact byte metadata', () => {
  let total = 0;
  for (const [game, count] of Object.entries(counts)) {
    const base = new URL(`../frontend/arcade/${game}/`, import.meta.url);
    const { bots } = JSON.parse(readFileSync(new URL('bots.json', base), 'utf8'));
    assert.equal(bots.filter(bot => bot.id.startsWith('aiwar-')).length, count, game);
    total += count;
    assert.equal(new Set(bots.map(bot => bot.id)).size, bots.length, `${game}: unique IDs`);
    assert.equal(new Set(bots.map(bot => bot.color.toLowerCase())).size, bots.length, `${game}: unique colors across old and new bots`);
    for (const bot of bots) {
      assert.equal(bot.file, `bots/${bot.id}.js`);
      const code = readFileSync(new URL(bot.file, base));
      assert.equal(code.length, bot.bytes, `${game}/${bot.id}: bytes`);
      assert.doesNotThrow(() => new vm.Script(code.toString('utf8'), { filename: `${game}/${bot.id}` }));
    }
  }
  assert.equal(total, 153);
});

test('Beam chess packaging repair preserves the normalized executable submission prefix', () => {
  // Imported raw response SHA256: aab930b0d5f69bead3e2bc29c11f6c0e59cba910f1dffc6082643a8e19c39c31.
  // Only the Markdown/non-JavaScript response tail was removed; trailing line whitespace was normalized.
  const code = readFileSync(new URL('../frontend/arcade/chess/bots/aiwar-beam.js', import.meta.url));
  assert.equal(createHash('sha256').update(code).digest('hex'), 'f1755ad8702c31ef6ce9b5ffab5f0fca1570ce58fee767a11e4cea4cfa5da030');
  const context = vm.createContext({ module: { exports: {} } });
  new vm.Script(code.toString()).runInContext(context, { timeout: 1000 });
  assert.equal(typeof context.module.exports, 'function');
  assert.equal(typeof context.module.exports.move, 'function');
});
