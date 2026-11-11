import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from '../frontend/worlds/shared/vendor/three.module.js';
import { GameApp } from '../frontend/js/v3/apps/dungeon/src/runtime/GameApp.js';

const base = 'frontend/js/v3/apps/dungeon/';
const read = (file) => readFileSync(base + file, 'utf8');

test('dungeon entry is a thin mount delegating to the runtime', () => {
  const entry = read('src/index.js');
  assert.ok(entry.split('\n').length <= 80, 'src/index.js must stay a thin module mount');
  assert.match(entry, /import\s+\{\s*GameApp\s*\}\s+from\s+['"]\.\/runtime\/GameApp\.js['"]/);
  assert.match(entry, /export\s+async\s+function\s+mount/);
  assert.match(entry, /await\s+app\.start\(\)/);
  assert.match(entry, /return\s+\(\)\s*=>\s*app\.destroy\(\)/);
});

test('runtime integrates simulation, HUD, audio and feedback', () => {
  assert.ok(existsSync(base + 'src/runtime/GameApp.js'));
  const source = read('src/runtime/GameApp.js');
  for (const name of ['createGameState', 'stepGame', 'spawnWave', 'openChest', 'chooseBlessing']) {
    assert.match(source, new RegExp(`\\b${name}\\b`), `runtime must use ${name}`);
  }
  assert.match(source, /createHud/);
  assert.match(source, /createAudioManager/);
  assert.match(source, /createFeedbackBus/);
  assert.match(source, /az-dungeon-exit-label/);
  assert.match(source, /FIXED_STEP\s*=\s*1\s*\/\s*60/);
  assert.match(source, /MAX_FRAME_DELTA/);
});

test('runtime owns focused controls and lifecycle guards', () => {
  const source = read('src/runtime/GameApp.js');
  for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyJ', 'Escape', 'KeyH', 'Enter']) {
    assert.ok(source.includes(code), `missing ${code} control`);
  }
  assert.match(source, /root\.contains\(document\.activeElement\)|document\.activeElement\s*===\s*this\.root/);
  assert.match(source, /preventDefault\(\)/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /document\.hidden/);
  assert.match(source, /(?:blur|focusout)/);
  assert.match(source, /relatedTarget/);
  assert.match(source, /webglcontextlost/);
  assert.match(source, /AbortController|loadGeneration|destroyed/);
  assert.match(source, /devicePixelRatio[^\n]+2/);
  assert.match(source, /ACESFilmicToneMapping/);
  assert.match(source, /shadowMap\.enabled\s*=\s*true/);
});

test('directional keys and touch pad move in the on-screen direction', () => {
  const app = new GameApp({ container: {} });
  app.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 80);
  app.camera.position.set(10, 10, 12);
  app.camera.lookAt(0, 0, 0);
  app.camera.updateMatrixWorld();
  const projected = (movement) => {
    const point = new THREE.Vector3(movement.moveX, 0, movement.moveZ).project(app.camera);
    return { x: point.x, y: point.y };
  };
  for (const [code, axis, sign] of [
    ['ArrowUp', 'y', 1], ['ArrowDown', 'y', -1],
    ['ArrowLeft', 'x', -1], ['ArrowRight', 'x', 1],
    ['KeyA', 'x', -1], ['KeyD', 'x', 1],
  ]) {
    app.keys.clear();
    app.keys.add(code);
    const screen = projected(app.movementInput());
    assert.ok(screen[axis] * sign > 0.01, `${code} moved ${JSON.stringify(screen)}`);
  }
  app.keys.clear();
  for (const [x, z, axis, sign] of [[-1, 0, 'x', -1], [1, 0, 'x', 1], [0, -1, 'y', 1], [0, 1, 'y', -1]]) {
    app.touchMove = { x, z };
    const screen = projected(app.movementInput());
    assert.ok(screen[axis] * sign > 0.01, `touch ${x},${z} moved ${JSON.stringify(screen)}`);
  }
  app.destroy();
});

test('touch movement pad shows all four directional arrows', () => {
  const source = read('src/runtime/GameApp.js');
  const css = read('css/game.css');
  for (const [direction, glyph] of [['up', '↑'], ['down', '↓'], ['left', '←'], ['right', '→']]) {
    assert.ok(source.includes(`['${direction}', '${glyph}']`), `${direction} arrow missing from the pad`);
    assert.ok(css.includes(`.az-touch-direction--${direction}`), `${direction} arrow lacks a position`);
  }
});

test('runtime hardens mount, teardown, telegraphs, hit-stop, joystick and context loss', () => {
  const source = read('src/runtime/GameApp.js');
  assert.match(source, /this\.started/, 'startup boundary must guard double-start');
  assert.match(source, /rollbackScene/, 'renderer/scene failure must roll back');
  assert.match(source, /stylesheetRefs/, 'stylesheet must be reference counted');
  assert.match(source, /setVisible\(true\)/, 'HUD must be revealed on begin');
  assert.match(source, /attack-telegraph/, 'telegraph events must be wired to runtime feedback');
  assert.match(source, /syncTelegraphs|telegraphMeshes/, 'telegraphs need ground-ring visuals');
  assert.match(source, /hitStopUntil/, 'hit-stop effects must pause the simulation');
  assert.match(source, /pointerId/, 'joystick must track pointer ownership');
  assert.match(source, /setPointerCapture/, 'joystick must capture its pointer');
  assert.match(source, /webglcontextrestored/, 'context loss must recover');
  assert.match(source, /result\.fallback/, 'blessing fallback must be messaged truthfully');
});

test('mount rolls back an app whose start fails', () => {
  const entry = read('src/index.js');
  assert.match(entry, /try\s*\{[\s\S]*await\s+app\.start\(\)[\s\S]*\}\s*catch/, 'mount must catch start failures');
  assert.match(entry, /app\.destroy\(\)/, 'mount must destroy the failed app');
});

test('runtime maps every gameplay archetype and visible entity', () => {
  const source = read('src/runtime/GameApp.js');
  const requiredAssets = [
    'hero_aizo.glb', 'enemy_gargoyle.glb', 'enemy_skeletal_archer.glb',
    'enemy_armored_centurion.glb', 'enemy_cult_sorcerer.glb',
    'enemy_styx_ferryman.glb',
    'boss_marble_minotaur.glb', 'projectile_arrow.glb',
    'treasure_chest.glb', 'portal_ring.glb', 'floor_tile.glb',
    'wall_block.glb', 'arch_doorway.glb', 'column.glb', 'brazier.glb',
  ];
  requiredAssets.forEach((asset) => assert.ok(source.includes(asset), `missing asset ${asset}`));
  for (const role of ['chaser', 'archer', 'tank', 'summoner', 'flanker', 'boss']) {
    assert.match(source, new RegExp(`${role}\\s*:\\s*['"]`), `missing ${role} asset mapping`);
  }
  assert.match(source, /state\.projectiles/);
  assert.match(source, /state\.chests/);
  assert.match(source, /enemy-death/);
  assert.match(source, /particleResources/);
  assert.match(source, /disposeLoaded/);
});

test('windup state drives ground-ring telegraphs that clear on resolve', () => {
  const app = new GameApp({ container: {} });
  app.dynamic = new THREE.Group();
  app.state.enemies = [{
    id: 'e1', archetype: 'chaser', x: 1, z: 0, dead: false,
    windup: { kind: 'melee', remaining: 0.2, duration: 0.25, range: 1.4 },
  }];
  app.syncTelegraphs();
  assert.equal(app.telegraphMeshes.size, 1);
  const ring = app.telegraphMeshes.get('e1');
  assert.ok(ring, 'ring mesh exists during windup');
  assert.equal(Math.round(ring.position.x * 100), 100);
  assert.ok(ring.scale.x > 1, 'ring spans the strike range');

  app.state.enemies[0].windup = null;
  app.syncTelegraphs();
  assert.equal(app.telegraphMeshes.size, 0, 'ring clears when the windup resolves');
  assert.equal(ring.parent, null);
  app.destroy();
});

test('hit-stop effects pause simulation stepping', () => {
  const app = new GameApp({ container: {} });
  app.renderEffect({ type: 'hit-stop', durationMs: 85 });
  assert.ok((app.hitStopUntil || 0) > performance.now(), 'hit-stop window is armed');
  app.destroy();
});

test('runtime exposes truthful read-only QA state and remains CSP safe', () => {
  const runtime = read('src/runtime/GameApp.js');
  const entry = read('src/index.js');
  const combined = `${runtime}\n${entry}`;
  for (const field of ['state', 'chapter', 'enemyCount', 'enemyHp', 'player', 'hp', 'frames']) {
    assert.match(runtime, new RegExp(`\\b${field}\\b`), `QA state missing ${field}`);
  }
  assert.match(runtime, /get\s+state\(\)\s*\{[^}]*paused[^}]*['"]paused['"]/);
  assert.match(runtime, /AIZANOI_DUNGEON_GAME/);
  assert.doesNotMatch(runtime, /AIZANOI_DUNGEON_GAME\s*=\s*[^;]*(?:spawn|kill|damage|teleport)/i);
  assert.doesNotMatch(combined, /\bstyle\s*=|\.style\b|\bon(?:click|pointerdown|touchstart)\s*=/i);
});

test('settings persist separately and drive assist defaults', () => {
  const source = read('src/runtime/GameApp.js');
  const settings = readFileSync(base + 'src/game/settings.js', 'utf8');
  assert.match(source, /from\s+['"]\.\.\/game\/settings\.js['"]/);
  assert.match(source, /loadSettings\(this\.storage,\s*\{\s*coarsePointer\s*\}\)/);
  assert.match(source, /saveSettings\(this\.storage,\s*this\.settings\)/);
  assert.match(source, /cycleAssistMode\(\)/);
  assert.match(settings, /aizanoi\.dungeon\.settings\.v1/);
  assert.match(source, /dailySeed/);
});

test('blessing pick screen offers 3 cards with reroll and skip', () => {
  const source = read('src/runtime/GameApp.js');
  assert.match(source, /showPick\(chest\b/);
  assert.match(source, /pickChoice\(index\)/);
  assert.match(source, /pickReroll\(\)/);
  assert.match(source, /pickSkip\(\)/);
  assert.match(source, /rerollChest/);
  assert.match(source, /chooseBlessing\(this\.state,\s*choice\.id\)/);
  assert.match(source, /Digit1/);
  assert.match(source, /az-dungeon-pick-card/);
  assert.match(source, /az-dungeon-rarity-/);
});

test('defeat offers retry-same-seed and victory offers share text', () => {
  const source = read('src/runtime/GameApp.js');
  assert.match(source, /retrySeed\(\)/);
  assert.match(source, /Retry same seed/);
  assert.match(source, /createGameState\(seed\)/);
  assert.match(source, /az-dungeon-share/);
  assert.match(source, /clipboard/);
});

test('gamepad input and haptics are wired without breaking keyboard', () => {
  const source = read('src/runtime/GameApp.js');
  assert.match(source, /pollGamepad/);
  assert.match(source, /getGamepads/);
  assert.match(source, /navigator\.vibrate/);
  assert.match(source, /KeyJ/);
});

test('hit-stop tiers and slow-mo follow the juice table', () => {
  const feedback = readFileSync(base + 'src/ui/feedback.js', 'utf8');
  assert.match(feedback, /stop:\s*30/);
  assert.match(feedback, /stop:\s*60/);
  assert.match(feedback, /stop:\s*100/);
  assert.match(feedback, /stop:\s*120/);
  assert.match(feedback, /slow-mo/);
  const runtime = read('src/runtime/GameApp.js');
  assert.match(runtime, /feedback\.emit\('parry'/);
  assert.match(runtime, /feedback\.emit\('special'/);
});

test('audio carries distinct cues with variants and a volume bus', () => {
  const audio = readFileSync(base + 'src/ui/audio.js', 'utf8');
  for (const cue of ['parry', 'special', 'rhythm', 'focus-shot']) {
    assert.ok(audio.includes(cue), `missing cue ${cue}`);
  }
  assert.match(audio, /variant/);
  assert.match(audio, /setVolumes/);
});

test('arena variants and local marks meta are wired to the runtime', () => {
  const source = read('src/runtime/GameApp.js');
  assert.match(source, /loadMeta\(this\.storage\)/);
  assert.match(source, /recordRun\(this\.meta/);
  assert.match(source, /saveMeta\(this\.storage,\s*this\.meta\)/);
  assert.match(source, /event\.type === 'arena'/);
  const game = read('src/game/index.js');
  assert.match(game, /broken-bridge/);
  assert.match(game, /ruined-stairs/);
  assert.match(game, /chooseArena/);
});

const bareApp = () => {
  const app = new GameApp({ container: { append() {} } });
  app.root = { focus() {}, contains() { return false; } };
  app.hud = { announce() {}, update() {}, setVisible() {}, addLoot() {} };
  app.syncWorld = () => {};
  app.updateHud = () => {};
  return app;
};

test('every new run records its own result in the local meta', () => {
  const app = bareApp();
  app.runRecorded = true;
  const marksBefore = app.meta.marks;
  app.restart();
  assert.equal(app.runRecorded, false, 'starting a new run must clear the recorded flag');
  app.state.player.gold = 400;
  app.state.chapter = 10;
  app.recordMetaRun(true);
  assert.ok(app.meta.marks > marksBefore,
    `the second run must be recorded, marks stayed at ${app.meta.marks}`);

  const retried = bareApp();
  retried.runRecorded = true;
  retried.retrySeed();
  assert.equal(retried.runRecorded, false, 'retrying the same seed must clear the recorded flag');
});

test('the victory screen also offers the endless descent', () => {
  const source = readFileSync(
    new URL('../frontend/js/v3/apps/dungeon/src/runtime/GameApp.js', import.meta.url), 'utf8');
  assert.match(source, /Continue the descent/, 'the victory screen must offer the endless descent');
  assert.match(source, /continueEndless\s*\(/, 'the endless descent must have its own code path');
  assert.match(source, /continueEndless\(\)\s*\{[\s\S]{0,700}spawnWave\(/,
    'the endless descent must clear the victory panel and spawn the next chapter');
});

test('the ground telegraph uses the attack marker, not the enemy reach', () => {
  const source = readFileSync(
    new URL('../frontend/js/v3/apps/dungeon/src/runtime/GameApp.js', import.meta.url), 'utf8');
  assert.match(source, /windup\.telegraph/, 'the telegraph ring must read the attack marker');
  assert.doesNotMatch(source, /Math\.max\(0\.6, enemy\.windup\.range \|\| 1\.5\)/,
    'the ring must no longer be sized from the attack reach');
});

// --- Owned pointer-lock lifecycle -------------------------------------------
// The dungeon owns the pointer lock only while it owns the canvas. Every
// overlay (pick screen, settings, help, defeat, victory) has to take the
// pointer back, and nothing may steal the lock from another app.

class StubClassList {
  constructor(owner) { this.owner = owner; }
  toggle(name, force) {
    const names = new Set(String(this.owner.className).split(/\s+/).filter(Boolean));
    const present = force === undefined ? !names.has(name) : force;
    if (present) names.add(name); else names.delete(name);
    this.owner.className = [...names].join(' ');
    return present;
  }
  add(...names) { names.forEach((name) => this.toggle(name, true)); }
  remove(...names) { names.forEach((name) => this.toggle(name, false)); }
  contains(name) { return String(this.owner.className).split(/\s+/).includes(name); }
}

const stripPseudo = (selector) => selector.replace(/:[a-z-]+(\([^)]*\))?/gi, '');

const selectorMatches = (element, selector) => stripPseudo(selector).split(',').some((raw) => {
  const part = raw.trim();
  if (!part) return false;
  const tokens = part.split(/(?=[.#[])/).filter(Boolean);
  const head = tokens.shift() || '';
  if (head && head !== '*' && element.tagName !== head.toUpperCase()) return false;
  for (const token of tokens) {
    if (token.startsWith('.')) {
      if (!String(element.className).split(/\s+/).includes(token.slice(1))) return false;
    } else if (token.startsWith('[')) {
      const match = token.match(/^\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]/);
      if (!match) return false;
      const actual = element.getAttribute(match[1]);
      if (actual === null) return false;
      if (match[2] !== undefined && actual !== match[2]) return false;
    }
  }
  return true;
});

class StubElement {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.className = '';
    this.textContent = '';
    this.dataset = {};
    this.attributes = new Map();
    this.children = [];
    this.parent = null;
    this.listeners = new Map();
    this.hidden = false;
    this.inert = false;
    this.tabIndex = -1;
    this.disabled = false;
    this.checked = false;
    this.selected = false;
    this.value = '';
    this.type = '';
    this.classList = new StubClassList(this);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  hasAttribute(name) { return this.attributes.has(name); }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  remove() {
    if (this.parent) {
      const index = this.parent.children.indexOf(this);
      if (index >= 0) this.parent.children.splice(index, 1);
      this.parent = null;
    }
    this.removed = true;
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  dispatch(type, event = {}) {
    const payload = { type, preventDefault() {}, stopPropagation() {}, ...event };
    for (const handler of [...(this.listeners.get(type) || [])]) handler(payload);
  }
  focus() { if (globalThis.document) globalThis.document.activeElement = this; }
  contains(node) {
    if (node === this) return true;
    return this.children.some((child) => child.contains(node));
  }
  closest() { return null; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const found = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (selectorMatches(child, selector)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
  setPointerCapture() {}
  releasePointerCapture() {}
}

const restoreDom = () => {
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.Element;
};

const stubDom = () => {
  const listeners = new Map();
  const document = {
    activeElement: null,
    pointerLockElement: null,
    exitPointerLockCalls: 0,
    hidden: false,
    body: new StubElement('body'),
    head: new StubElement('head'),
    createElement: (tag) => new StubElement(tag),
    getElementById: () => null,
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
    dispatch(type, event = {}) {
      for (const handler of [...(listeners.get(type) || [])]) handler({ type, ...event });
    },
    exitPointerLock() {
      document.exitPointerLockCalls += 1;
      document.pointerLockElement = null;
      document.dispatch('pointerlockchange');
    },
  };
  document.activeElement = document.body;
  const window = { devicePixelRatio: 1, localStorage: null, addEventListener() {}, removeEventListener() {} };
  globalThis.document = document;
  globalThis.window = window;
  globalThis.Element = StubElement;
  return { document, window };
};

const stubApp = () => {
  const dom = stubDom();
  const app = new GameApp({ container: { append() {}, replaceChildren() {} } });
  const canvas = new StubElement('canvas');
  canvas.requestPointerLock = () => { dom.document.pointerLockElement = canvas; };
  canvas.requestLockCalls = 0;
  canvas.releasedPointers = [];
  const originalRequest = canvas.requestPointerLock;
  canvas.requestPointerLock = () => { canvas.requestLockCalls += 1; return originalRequest(); };
  canvas.releasePointerCapture = (id) => { canvas.releasedPointers.push(id); };
  app.renderer = { domElement: canvas, dispose() {}, info: { render: { calls: 0, triangles: 0 } } };
  app.root = new StubElement('div');
  app.hud = {
    root: new StubElement('div'),
    elements: {},
    announce() {},
    update() {},
    setVisible() {},
    addLoot() {},
    destroy() {},
  };
  app.touchControls = { querySelector: () => new StubElement('div') };
  app.feedback = { emit() {}, clear() {} };
  app.syncWorld = () => {};
  app.updateHud = () => {};
  // The stub stands in for a desktop with a mouse: pointer lock is a
  // fine-pointer contract.
  app.hasFinePointer = true;
  return { app, dom, canvas };
};

const playableApp = () => {
  const harness = stubApp();
  harness.app.sceneState = 'playing';
  harness.app.paused = false;
  harness.app.help = false;
  harness.dom.document.pointerLockElement = harness.canvas;
  return harness;
};

test('pointer lock is only requested by a live, unpaused, unlocked run', (t) => {
  const { app, canvas } = stubApp();
  t.after(restoreDom);
  app.sceneState = 'playing';

  assert.equal(app.requestLookLock(), true, 'a running game may take the pointer');
  assert.equal(canvas.requestLockCalls, 1);

  app.sceneState = 'menu';
  assert.equal(app.requestLookLock(), false, 'the menu must not take the pointer');
  app.sceneState = 'playing';

  app.paused = true;
  assert.equal(app.requestLookLock(), false, 'a paused game must not take the pointer');
  app.paused = false;

  app.help = true;
  assert.equal(app.requestLookLock(), false, 'the help card must not take the pointer');
  app.help = false;

  app.modal = { panel: new StubElement('section') };
  assert.equal(app.requestLookLock(), false, 'an open modal must not take the pointer');
  app.modal = undefined;

  app.destroyed = true;
  assert.equal(app.requestLookLock(), false, 'a destroyed app must not take the pointer');
  app.destroyed = false;

  app.state.player.dead = true;
  assert.equal(app.requestLookLock(), false, 'a fallen player must not take the pointer');
  app.state.player.dead = false;

  app.hasFinePointer = false;
  assert.equal(app.requestLookLock(), false, 'a touch device must not take the pointer');

  assert.equal(canvas.requestLockCalls, 1, 'refused requests must never reach the canvas');
});

test('the pointer lock check keeps the fine-pointer gate first', () => {
  const source = read('src/runtime/GameApp.js');
  const start = source.indexOf('requestLookLock() {');
  assert.ok(start > 0, 'requestLookLock must exist');
  const body = source.slice(start, source.indexOf('\n  }', start));
  assert.ok(body.includes('hasFinePointer'), 'the fine-pointer gate must exist');
  assert.ok(body.indexOf('hasFinePointer') < body.indexOf('sceneState'),
    'the fine-pointer gate must be checked before the run state');
});

test('the pointer lock is released only when this canvas owns it', (t) => {
  const { app, dom, canvas } = stubApp();
  t.after(restoreDom);
  const foreign = new StubElement('canvas');

  dom.document.pointerLockElement = foreign;
  app.exitLookLock();
  assert.equal(dom.document.exitPointerLockCalls, 0, 'another app keeps its pointer lock');

  dom.document.pointerLockElement = canvas;
  app.exitLookLock();
  assert.equal(dom.document.exitPointerLockCalls, 1, 'the owning canvas releases its lock');
});

test('opening a modal records the modal before it releases the pointer lock', (t) => {
  const { app, dom, canvas } = stubApp();
  t.after(restoreDom);
  const seen = [];
  dom.document.exitPointerLock = () => {
    seen.push(app.modal ? app.modal.panel : null);
    dom.document.pointerLockElement = null;
  };
  dom.document.pointerLockElement = canvas;
  const panel = new StubElement('section');
  app.openModal(panel);

  assert.equal(seen.length, 1, 'the modal must take the pointer back');
  assert.equal(seen[0], panel, 'the modal record must exist before the lock is released');
  assert.equal(app.modal.panel, panel);
});

test('an overlay takes the pointer lock away from the run it owns', (t) => {
  const { app, dom, canvas } = stubApp();
  t.after(restoreDom);
  app.sceneState = 'playing';

  dom.document.pointerLockElement = canvas;
  app.toggleHelp();
  assert.equal(dom.document.exitPointerLockCalls, 1, 'the help card takes the pointer back');
  assert.equal(app.help, true);
});

test('the pick screen takes the pointer lock and the choice never takes it back', (t) => {
  const { app, dom, canvas } = stubApp();
  t.after(restoreDom);
  app.sceneState = 'playing';
  const chest = {
    id: 'chest-1',
    choices: [{ id: 'fury', rarity: 'common', level: 1 }],
    shop: [],
    rerolls: 1,
    gold: 10,
    draftPending: false,
    position: { x: 0, y: 0, z: 0 },
  };
  app.state.chests.push(chest);
  dom.document.pointerLockElement = canvas;

  app.showPick(chest);
  assert.equal(dom.document.exitPointerLockCalls, 1, 'the pick screen takes the pointer back');
  assert.ok(app.modal, 'the pick screen is a modal');

  const before = canvas.requestLockCalls;
  app.pickSkip();
  assert.equal(canvas.requestLockCalls, before, 'closing the pick screen must not take the pointer back');
});

test('the settings panel takes the pointer lock and closing it never takes it back', (t) => {
  const { app, dom, canvas } = stubApp();
  t.after(restoreDom);
  app.sceneState = 'playing';
  dom.document.pointerLockElement = canvas;

  app.showSettings();
  assert.equal(dom.document.exitPointerLockCalls, 1, 'the settings panel takes the pointer back');
  assert.ok(app.modal, 'the settings panel is a modal');

  const before = canvas.requestLockCalls;
  app.closeSettings();
  assert.equal(canvas.requestLockCalls, before, 'closing the settings must not take the pointer back');
});

test('the settings panel never steals the pointer lock of another app', (t) => {
  const { app, dom } = stubApp();
  t.after(restoreDom);
  app.sceneState = 'playing';
  dom.document.pointerLockElement = new StubElement('canvas');

  app.showSettings();
  assert.equal(dom.document.exitPointerLockCalls, 0, 'another app keeps its pointer lock');
});

test('the defeat and the victory screen take the pointer lock away', (t) => {
  const defeat = stubApp();
  t.after(restoreDom);
  defeat.app.sceneState = 'playing';
  defeat.dom.document.pointerLockElement = defeat.canvas;
  defeat.app.showDefeat();
  assert.equal(defeat.dom.document.exitPointerLockCalls, 1, 'the defeat screen takes the pointer back');
  assert.ok(defeat.app.modal, 'the defeat screen is a modal');

  restoreDom();
  const victory = stubApp();
  victory.app.sceneState = 'playing';
  victory.dom.document.pointerLockElement = victory.canvas;
  victory.app.showVictory();
  assert.equal(victory.dom.document.exitPointerLockCalls, 1, 'the victory screen takes the pointer back');
  assert.ok(victory.app.modal, 'the victory screen is a modal');
});

test('losing the pointer lock pauses a live run once and never over an overlay', (t) => {
  const { app, dom } = stubApp();
  t.after(restoreDom);
  app.installInput();
  app.sceneState = 'playing';

  app.hadLookLock = true;
  dom.document.pointerLockElement = null;
  dom.document.dispatch('pointerlockchange');
  assert.equal(app.paused, true, 'a live run pauses when the pointer is taken away');

  app.paused = false;
  app.help = true;
  app.hadLookLock = true;
  dom.document.pointerLockElement = null;
  dom.document.dispatch('pointerlockchange');
  assert.equal(app.paused, false, 'the help card owns the pointer: no second pause');

  app.help = false;
  app.modal = { panel: new StubElement('section') };
  app.hadLookLock = true;
  dom.document.pointerLockElement = null;
  dom.document.dispatch('pointerlockchange');
  assert.equal(app.paused, false, 'a modal owns the pointer: no second pause');
});

test('a lock the game released on purpose never pauses the run', (t) => {
  const { app, dom, canvas } = playableApp();
  t.after(restoreDom);
  app.installInput();
  app.hadLookLock = true;

  app.openModal(new StubElement('section'));
  assert.equal(dom.document.exitPointerLockCalls, 1, 'the overlay takes the pointer back');

  // The browser reports the release a tick later: the run must stay as it is.
  app.hadLookLock = true;
  dom.document.dispatch('pointerlockchange');
  assert.equal(app.paused, false, 'a deliberate release must not pause the run');
});

test('resuming a paused run is the only path that may take the pointer back', (t) => {
  const { app, canvas } = playableApp();
  t.after(restoreDom);
  app.paused = true;
  app.togglePause();
  assert.equal(app.paused, false);
  assert.equal(canvas.requestLockCalls, 1, 'the resume gesture may take the pointer back');
});

test('resetting the input drops the drag, the pending flags, the touch move and the latches', (t) => {
  const { app, canvas } = stubApp();
  t.after(restoreDom);
  app.lookDrag = { pointerId: 9, x: 1, y: 2, moved: 3, tap: true };
  app.pendingAttack = true;
  app.pendingDash = true;
  app.pendingShoot = true;
  app.pendingGuard = true;
  app.pendingSpecial = true;
  app.pendingInteract = true;
  app.touchMove = { x: 1, z: 1 };
  app.keys.add('KeyW');
  for (const latch of Object.keys(app.state.inputLatch)) app.state.inputLatch[latch] = true;

  app.resetInput();

  assert.equal(app.lookDrag, null, 'the drag must be dropped');
  assert.deepEqual(canvas.releasedPointers, [9], 'the drag must release its pointer capture');
  assert.equal(app.pendingAttack, false);
  assert.equal(app.pendingDash, false);
  assert.equal(app.pendingShoot, false);
  assert.equal(app.pendingGuard, false);
  assert.equal(app.pendingSpecial, false);
  assert.equal(app.pendingInteract, false);
  assert.equal(app.touchMove, null);
  assert.equal(app.keys.size, 0);
  for (const latch of Object.keys(app.state.inputLatch)) {
    assert.equal(app.state.inputLatch[latch], false, `${latch} latch must be cleared`);
  }
});

test('a cancelled pointer never swings the sword', (t) => {
  const { app, canvas } = playableApp();
  t.after(restoreDom);
  app.installInput();

  canvas.dispatch('pointerdown', { pointerId: 3, pointerType: 'touch', clientX: 40, clientY: 40, buttons: 1 });
  assert.ok(app.lookDrag, 'the touch starts a drag');
  canvas.dispatch('pointercancel', { pointerId: 3 });

  assert.equal(app.pendingAttack, false, 'a cancelled pointer must not attack');
  assert.equal(app.pendingInteract, false, 'a cancelled pointer must not interact');
  assert.equal(app.lookDrag, null, 'a cancelled pointer must drop the drag');
});

test('the drag look is ignored while the run is paused, helped or covered', (t) => {
  const { app, dom, canvas } = playableApp();
  t.after(restoreDom);
  app.installInput();
  app.hasFinePointer = false;
  // Without pointer lock the drag is the only way to turn, so this is the
  // path the guards have to cover.
  dom.document.pointerLockElement = null;

  const drag = () => {
    canvas.dispatch('pointerdown', { pointerId: 4, pointerType: 'mouse', button: 0, clientX: 100, clientY: 100 });
    const yaw = app.look.yaw;
    canvas.dispatch('pointermove', { pointerId: 4, clientX: 160, clientY: 100 });
    const turned = app.look.yaw !== yaw;
    canvas.dispatch('pointerup', { pointerId: 4, clientX: 160, clientY: 100 });
    return turned;
  };

  assert.equal(drag(), true, 'a live run turns with the drag');

  app.paused = true;
  assert.equal(drag(), false, 'a paused run must not turn');
  app.paused = false;

  app.help = true;
  assert.equal(drag(), false, 'the help card must not turn the camera');
  app.help = false;

  app.modal = { panel: new StubElement('section') };
  assert.equal(drag(), false, 'a modal must not turn the camera');
});

// --- Room resource ownership ------------------------------------------------
// A room owns everything one arena build makes for itself: the instanced
// fields, the materials cloned for them and the geometry generated in code
// (the vault, the beams, the water, the dais). The loaded sculpts are shared
// by every arena and belong to the templates, so a rebuild may never dispose
// them.

const roomApp = () => {
  const app = new GameApp({ container: { append() {}, replaceChildren() {} } });
  app.room = new THREE.Group();
  app.dynamic = new THREE.Group();
  for (const key of ['floor', 'wall', 'doorway', 'column', 'brazier']) {
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial();
    group.add(new THREE.Mesh(geometry, material));
    app.templates.set(key, group);
    app.groundOffsets.set(key, 0);
    app.geometries.add(geometry);
    app.materials.add(material);
  }
  return app;
};

test('a room rebuild disposes the instanced fields it replaces', () => {
  const app = roomApp();
  app.buildRoom('column-ring');
  const fields = app.room.children.filter((child) => child.isInstancedMesh);
  assert.ok(fields.length > 0, 'the room shell is drawn as instanced fields');
  const disposed = [];
  for (const field of fields) field.addEventListener('dispose', () => disposed.push(field));

  app.buildRoom('column-ring');

  assert.equal(disposed.length, fields.length, 'every replaced field must be disposed');
  app.destroy();
});

test('a room rebuild releases the geometry the room owns and keeps the shared sculpts', () => {
  const app = roomApp();
  app.buildRoom('column-ring');
  const owned = [...app.roomGeometries];
  assert.ok(owned.length >= 2, 'the room owns its procedural ceiling geometry');
  const disposed = new Set();
  for (const geometry of owned) geometry.addEventListener('dispose', () => disposed.add(geometry));

  const templateGeometry = app.templates.get('floor').children[0].geometry;
  let templateDisposed = false;
  templateGeometry.addEventListener('dispose', () => { templateDisposed = true; });

  app.buildRoom('column-ring');

  assert.equal(disposed.size, owned.length, 'the room-owned geometry must be disposed');
  assert.equal(templateDisposed, false, 'the shared sculpt geometry must survive the rebuild');
  assert.equal(app.roomGeometries.has(templateGeometry), false,
    'a shared sculpt may never be registered as a room resource');
  app.destroy();
});

test('repeated rebuilds of the same arena keep the global resource sets bounded', () => {
  const app = roomApp();
  app.buildRoom('column-ring');
  const geometries = app.geometries.size;
  const materials = app.materials.size;
  const roomGeometries = app.roomGeometries.size;
  const roomMaterials = app.roomMaterials.size;
  assert.ok(roomGeometries >= 2, 'the room tracks the geometry it generated');

  for (let index = 0; index < 4; index += 1) app.buildRoom('column-ring');

  assert.equal(app.geometries.size, geometries, 'the global geometry set must not grow per rebuild');
  assert.equal(app.materials.size, materials, 'the global material set must not grow per rebuild');
  assert.equal(app.roomGeometries.size, roomGeometries, 'the room tracks only its own geometry');
  assert.equal(app.roomMaterials.size, roomMaterials, 'the room tracks only its own materials');
  app.destroy();
});

test('a room that fails to build releases the half-built room', () => {
  const app = roomApp();
  app.buildRoom('column-ring');
  const ceiling = app.buildCeiling.bind(app);
  app.buildCeiling = () => { throw new Error('the vault could not be built'); };

  assert.throws(() => app.buildRoom('column-ring'), /the vault could not be built/);
  app.buildCeiling = ceiling;

  const shared = app.templateResources();
  assert.equal(app.geometries.size, shared.geometries.size, 'the failed room must not leak geometry');
  assert.equal(app.materials.size, shared.materials.size, 'the failed room must not leak materials');
  assert.equal(app.roomGeometries.size, 0, 'the failed room keeps no geometry');
  assert.equal(app.roomMaterials.size, 0, 'the failed room keeps no material');
  app.destroy();
});

test('teardown releases the environment render target and the dust sprite', () => {
  const app = new GameApp({ container: {} });
  let targetDisposed = false;
  let textureDisposed = false;
  let dustDisposed = false;
  app.environmentTarget = { texture: {}, dispose() { targetDisposed = true; } };
  app.environment = { dispose() { textureDisposed = true; } };
  app.dustTexture = { dispose() { dustDisposed = true; } };

  app.destroy();

  assert.equal(targetDisposed, true, 'the PMREM render target must be released');
  assert.equal(textureDisposed, true, 'the environment texture must be released');
  assert.equal(dustDisposed, true, 'the dust sprite must be released');
});

test('the runtime keeps the environment render target and the room resource sets', () => {
  const source = read('src/runtime/GameApp.js');
  assert.match(source, /this\.environmentTarget\s*=/, 'the PMREM render target must be kept');
  assert.match(source, /this\.dustTexture\s*=/, 'the dust sprite must be kept for teardown');
  assert.match(source, /this\.roomGeometries\s*=\s*new Set\(\)/, 'the room must own its geometry');
  assert.match(source, /this\.roomMaterials\s*=\s*new Set\(\)/, 'the room must own its materials');
});
