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
