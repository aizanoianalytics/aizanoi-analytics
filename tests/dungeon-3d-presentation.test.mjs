import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createHud } from '../frontend/js/v3/apps/dungeon/src/ui/hud.js';
import { createAudioManager } from '../frontend/js/v3/apps/dungeon/src/ui/audio.js';
import { createFeedbackBus } from '../frontend/js/v3/apps/dungeon/src/ui/feedback.js';

class FakeClassList {
  constructor(owner) { this.owner = owner; }
  toggle(name, force) {
    const names = new Set(this.owner.className.split(/\s+/).filter(Boolean));
    const present = force === undefined ? !names.has(name) : force;
    if (present) names.add(name); else names.delete(name);
    this.owner.className = [...names].join(' ');
    return present;
  }
  add(...names) { names.forEach((name) => this.toggle(name, true)); }
  remove(...names) { names.forEach((name) => this.toggle(name, false)); }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.className = '';
    this.attributes = new Map();
    this.children = [];
    this.textContent = '';
    this.hidden = false;
    this.classList = new FakeClassList(this);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = nodes; }
  remove() { this.removed = true; }
  querySelector(selector) {
    const match = (node) => selector.startsWith('.')
      ? node.className.split(/\s+/).includes(selector.slice(1))
      : node.tagName.toLowerCase() === selector.toLowerCase();
    const visit = (node) => node.children.find((child) => match(child) || visit(child));
    return visit(this) || null;
  }
}

function fakeDocument() { return { createElement: (tag) => new FakeElement(tag) }; }

test('HUD factory exposes an update API and semantic status regions', () => {
  const container = new FakeElement('div');
  const hud = createHud({ container, document: fakeDocument() });

  assert.equal(hud.root.getAttribute('role'), 'group');
  assert.equal(hud.root.getAttribute('aria-label'), 'Dungeon status');
  assert.equal(hud.elements.lootFeed.getAttribute('aria-live'), 'polite');
  assert.equal(hud.elements.announcer.getAttribute('aria-live'), 'assertive');
  assert.equal(hud.elements.health.getAttribute('role'), 'progressbar');
  assert.equal(hud.elements.health.getAttribute('aria-valuenow'), '100');
  assert.equal(typeof hud.update, 'function');
  assert.equal(typeof hud.destroy, 'function');
});

test('audio manager is a safe silent fallback without WebAudio', async () => {
  const audio = createAudioManager({ AudioContext: null });
  assert.equal(audio.available, false);
  assert.equal(await audio.resume(), false);
  assert.doesNotThrow(() => audio.play('crit'));
  assert.doesNotThrow(() => audio.play('unknown'));
  assert.doesNotThrow(() => audio.destroy());
});

test('feedback bus maps combat events to renderer-neutral effects', () => {
  const bus = createFeedbackBus({ reducedMotion: false, random: () => 0.75 });
  const seen = [];
  const unsubscribe = bus.on('effect', (effect) => seen.push(effect));
  const effects = bus.emit('crit', { damage: 42, position: { x: 1, y: 2, z: 3 } });

  assert.deepEqual(effects.map((effect) => effect.type), ['screen-shake', 'hit-stop', 'floating-damage', 'particle-burst']);
  assert.equal(effects.find((effect) => effect.type === 'hit-stop').durationMs, 85);
  assert.equal(effects.find((effect) => effect.type === 'floating-damage').value, 42);
  assert.equal(seen.length, 4);
  unsubscribe();
  bus.emit('hit', { damage: 2 });
  assert.equal(seen.length, 4);
});

test('HUD update covers vitals, progression, boss, combo, panels and loot', () => {
  const container = new FakeElement('div');
  const hud = createHud({ container, document: fakeDocument() });
  hud.update({ health: 37, maxHealth: 80, stamina: 45, maxStamina: 60, xp: 9, xpToNext: 25, gold: 1234, combo: 6, wave: 4, chapter: 'II', boss: { name: 'The Warden', health: 300, maxHealth: 500 }, paused: true, help: true });
  hud.addLoot('Gilded key');
  hud.setDamage(true);

  assert.equal(hud.elements.health.getAttribute('aria-valuenow'), '37');
  assert.equal(hud.elements.gold.getAttribute('aria-label'), 'Gold: 1234');
  assert.equal(hud.elements.combo.textContent, '6× COMBO');
  assert.equal(hud.elements.bossName.textContent, 'The Warden');
  assert.equal(hud.elements.bossWrap.hidden, false);
  assert.equal(hud.elements.pause.hidden, false);
  assert.equal(hud.elements.help.hidden, false);
  assert.equal(hud.elements.lootFeed.children[0].textContent, 'Gilded key');
  assert.match(hud.elements.damageVignette.className, /is-active/);
});

test('WebAudio starts only after resume and exposes every required cue', async () => {
  const calls = [];
  const parameter = () => ({ value: 0, setValueAtTime: (...args) => calls.push(['set', ...args]), exponentialRampToValueAtTime: (...args) => calls.push(['ramp', ...args]) });
  class FakeAudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 2; this.destination = {}; calls.push(['construct']); }
    createGain() { return { gain: parameter(), connect() {}, disconnect() {} }; }
    createOscillator() { return { frequency: parameter(), type: '', connect() {}, start: () => calls.push(['start']), stop: () => calls.push(['stop']) }; }
    async resume() { this.state = 'running'; calls.push(['resume']); }
    async close() { this.state = 'closed'; }
  }
  const audio = createAudioManager({ AudioContext: FakeAudioContext });
  assert.deepEqual(audio.cues, ['swing', 'hit', 'crit', 'dash', 'hurt', 'loot', 'portal', 'boss']);
  assert.equal(calls.length, 0);
  assert.equal(audio.play('swing'), false);
  assert.equal(await audio.resume(), true);
  assert.equal(audio.play('swing'), true);
  assert.ok(calls.some(([name]) => name === 'start'));
  await audio.destroy();
});

test('reduced motion removes shake and hit-stop and limits particle bursts', () => {
  const bus = createFeedbackBus({ reducedMotion: true });
  const effects = bus.emit('boss', { damage: 99 });
  assert.equal(effects.some(({ type }) => type === 'screen-shake'), false);
  assert.equal(effects.some(({ type }) => type === 'hit-stop'), false);
  assert.equal(effects.find(({ type }) => type === 'particle-burst').count, 3);
  assert.equal(effects.find(({ type }) => type === 'floating-damage').value, 99);
  bus.setReducedMotion(false);
  assert.equal(bus.emit('hurt', { damage: 1 }).some(({ type }) => type === 'screen-shake'), true);
});

test('presentation source is CSP-safe and CSS covers HUD, touch, safe areas and motion', () => {
  const base = 'frontend/js/v3/apps/dungeon/';
  const sources = ['src/ui/hud.js', 'src/ui/audio.js', 'src/ui/feedback.js'].map((file) => readFileSync(base + file, 'utf8')).join('\n');
  const css = readFileSync(base + 'css/game.css', 'utf8');
  assert.doesNotMatch(sources, /\bstyle\s*=|\.style\b|\bon(?:click|pointerdown|touchstart)\s*=/i);
  for (const selector of ['.az-hud', '.az-hud-health', '.az-hud-stamina', '.az-hud-xp', '.az-hud-boss', '.az-hud-combo', '.az-hud-crosshair', '.az-hud-damage-vignette', '.az-hud-loot-feed', '.az-touch-joystick', '.az-touch-action']) {
    assert.ok(css.includes(selector), `missing ${selector}`);
  }
  assert.match(css, /env\(safe-area-inset-(?:top|right|bottom|left)/);
  assert.match(css, /@media\s*\(orientation:\s*portrait\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /font-size:\s*(?:1rem|16px)/);
  assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|1[0-5])px/);
});
