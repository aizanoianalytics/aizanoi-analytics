// Static/unit contracts for the Dungeon UX fixes (audit A13, A14, A16, A20, A21).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAudioManager } from '../frontend/js/v3/apps/dungeon/src/ui/audio.js';

const base = new URL('../frontend/js/v3/apps/dungeon/', import.meta.url);
const read = (path) => readFileSync(new URL(path, base), 'utf8');

test('reduced-motion CSS is scoped to the dungeon root and standalone body, never the global universal selector', () => {
  const css = read('css/game.css');
  const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  const rule = block.split('\n').find((line) => line.includes('animation-duration'));
  assert.ok(rule, 'reduced-motion rule exists');
  const first = block.slice(0, block.indexOf('{', block.indexOf('{') + 1));
  const bare = first.split(',').map((part) => part.trim().replace(/^@media[^{]*\{\s*/, '')).filter((part) => part.startsWith('*'));
  assert.deepEqual(bare, [], 'no bare * selector');
  assert.match(block, /\.aizanoi-dungeon3d-app-root \*/);
  assert.match(block, /\.aizanoi-standalone-body \*/);
});

// Typography floor: every HUD readout the player must read stays at or above
// 12px (0.75rem) in the base sheet and in every breakpoint override.
const CSS_FONT_FLOOR_REM = 0.75;
const CSS_FONT_TARGETS = ['az-hud-meter-label', 'az-hud-meter-value', 'az-hud-wave', 'az-hud-assist'];

const parseCssRules = (css) => {
  const rules = [];
  const walk = (text, media) => {
    let index = 0;
    while (index < text.length) {
      const open = text.indexOf('{', index);
      if (open === -1) break;
      const prelude = text.slice(index, open).trim();
      let depth = 1;
      let cursor = open + 1;
      while (cursor < text.length && depth > 0) {
        const char = text[cursor];
        if (char === '{') depth += 1;
        else if (char === '}') depth -= 1;
        cursor += 1;
      }
      const body = text.slice(open + 1, cursor - 1);
      if (prelude.startsWith('@media')) walk(body, prelude);
      else if (!prelude.startsWith('@')) rules.push({ selector: prelude, body, media });
      index = cursor;
    }
  };
  walk(css.replace(/\/\*[\s\S]*?\*\//g, ''), null);
  return rules;
};

const selectorClasses = (selector) => selector
  .split(',')
  .flatMap((part) => (part.match(/\.[A-Za-z0-9_-]+/g) || []).map((token) => token.slice(1)));

const lengthRem = (body, property) => {
  const match = new RegExp(`${property}:\\s*([0-9]*\\.?[0-9]+)(rem|px)\\b`).exec(body);
  if (!match) return null;
  return match[2] === 'px' ? Number(match[1]) / 16 : Number(match[1]);
};

test('HUD readouts never drop below the 12px typography floor in any breakpoint', () => {
  const rules = parseCssRules(read('css/game.css'));
  for (const target of CSS_FONT_TARGETS) {
    const sizes = rules
      .filter((rule) => selectorClasses(rule.selector).includes(target))
      .map((rule) => ({ media: rule.media, size: lengthRem(rule.body, 'font-size') }))
      .filter((entry) => entry.size !== null);
    assert.ok(sizes.length > 0, `${target} must declare a font-size`);
    for (const { media, size } of sizes) {
      assert.ok(size >= CSS_FONT_FLOOR_REM,
        `${target} renders at ${size}rem in ${media || 'base'} — below the ${CSS_FONT_FLOOR_REM}rem (12px) floor`);
    }
  }
});

test('the narrow-screen meter grid keeps room for the 12px labels and values', () => {
  const rules = parseCssRules(read('css/game.css'));
  const narrow = rules.filter((rule) => rule.media && rule.media.includes('max-width: 840px'));
  const meter = narrow.find((rule) => selectorClasses(rule.selector).includes('az-hud-meter'));
  assert.ok(meter, 'the max-width: 840px block must restyle the meter grid');
  const columns = /grid-template-columns:\s*([^;]+)/.exec(meter.body);
  assert.ok(columns, 'the narrow meter grid declares grid-template-columns');
  const [label, , value] = columns[1].trim().split(/\s+/);
  assert.ok(lengthRem(`width: ${label}`, 'width') >= 4,
    `the narrow label column (${label}) is too narrow for 12px labels`);
  assert.ok(lengthRem(`width: ${value}`, 'width') >= 3.5,
    `the narrow value column (${value}) is too narrow for 12px values`);
});

test('effective reduced motion is the OS preference OR the local toggle', () => {
  const source = read('src/runtime/GameApp.js');
  assert.match(source, /osReducedMotion\(\) \|\| Boolean\(settings\.reducedMotion\)/);
  assert.match(source, /query\.addEventListener\('change'/);
  assert.match(source, /query\.removeEventListener\('change'/);
});

test('game keydown leaves native controls alone and settings only consumes Escape', () => {
  const source = read('src/runtime/GameApp.js');
  assert.match(source, /NATIVE_CONTROL/);
  assert.match(source, /trapTab/);
  const keydown = source.slice(source.indexOf('const keydown = (event)'), source.indexOf('this.root.addEventListener(\'keydown\''));
  assert.ok(keydown.indexOf('NATIVE_CONTROL') < keydown.indexOf('event.preventDefault()'), 'native check precedes the first preventDefault');
});

test('audio: deferred master/effects levels reach the live synth gain graph', async () => {
  const created = [];
  class FakeGain { constructor() { this.gain = { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }; this.out = []; } connect(node) { this.out.push(node); } disconnect() {} }
  class FakeContext {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = { id: 'dest' }; created.push(this); this.gains = []; }
    createGain() { const gain = new FakeGain(); this.gains.push(gain); return gain; }
    createOscillator() { return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
    async resume() {}
    async close() {}
  }
  const audio = createAudioManager({ AudioContext: FakeContext });
  assert.equal(audio.setVolumes({ master: 0.2, sfx: 0.4 }), true, 'accepted before the context exists');
  assert.deepEqual(audio.volumes, { master: 0.2, sfx: 0.4 });
  assert.equal(created.length, 0);
  assert.equal(await audio.resume(), true);
  const [master, sfx] = created[0].gains;
  assert.equal(master.gain.value, 0.2);
  assert.equal(sfx.gain.value, 0.4);
  assert.ok(sfx.out.includes(master) && master.out.includes(created[0].destination));
  assert.equal(audio.play('hit'), true);
  assert.ok(created[0].gains[2].out.includes(sfx), 'cue envelope routes through the effects bus');
  audio.setVolumes({ sfx: 0.9 });
  assert.equal(sfx.gain.value, 0.9);
  assert.equal(master.gain.value, 0.2, 'master untouched by an sfx change');
  assert.equal(audio.setVolumes({ master: NaN, sfx: Infinity }), false);
  audio.setVolumes({ master: -1, sfx: 2 });
  assert.deepEqual(audio.volumes, { master: 0, sfx: 1 });
  await audio.destroy();
});
