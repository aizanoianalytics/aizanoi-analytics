import * as THREE from '../../../../../../worlds/shared/vendor/three.module.js';
import { GLTFLoader } from '../../../../../../worlds/shared/vendor/GLTFLoader.js';
import { createGameState, stepGame, spawnWave, openChest, chooseBlessing, rerollChest, buyShopItem, savePersistedRun, loadPersistedRun, clearPersistedRun, BLESSING_LABELS, FINAL_CHAPTER } from '../game/index.js';
import { loadSettings, saveSettings, dailySeed } from '../game/settings.js';
import { loadMeta, saveMeta, recordRun } from '../game/meta.js';
import { createHud } from '../ui/hud.js';
import { createAudioManager } from '../ui/audio.js';
import { createFeedbackBus } from '../ui/feedback.js';

const FIXED_STEP = 1 / 60;
const MAX_FRAME_DELTA = 0.1;
const MAX_CATCH_UP_STEPS = 6;

/**
 * The frame delta the loop is allowed to use.
 *
 * A long stall is clamped: without it the camera would jump and the effects
 * would skip, and the simulation would be asked to catch up on time that has
 * already passed. This is the runtime's own arithmetic, extracted so it can
 * be checked directly instead of being re-implemented in a test.
 */
export function frameDelta(elapsedSeconds) {
  return Math.min(MAX_FRAME_DELTA, Math.max(0, elapsedSeconds));
}

/**
 * Consume a frame delta in fixed steps.
 *
 * The number of catch-up steps is bounded: once the budget is spent the
 * leftover accumulator is dropped, because carrying it forward would make
 * the next frame worse.
 */
export function consumeFixedSteps(accumulator, deltaSeconds) {
  let rest = accumulator + deltaSeconds;
  let steps = 0;
  while (rest >= FIXED_STEP && steps < MAX_CATCH_UP_STEPS) {
    rest -= FIXED_STEP;
    steps += 1;
  }
  if (steps === MAX_CATCH_UP_STEPS) rest = 0;
  return { steps, accumulator: rest };
}
const APP_ID = 'dungeon';
const ASSET_BASE = new URL('../../assets/glb/', import.meta.url);
const ASSETS = Object.freeze({
  floor: 'floor_tile.glb', wall: 'wall_block.glb', doorway: 'arch_doorway.glb',
  column: 'column.glb', brazier: 'brazier.glb', hero: 'hero_aizo.glb',
  chest: 'treasure_chest.glb', portal: 'portal_ring.glb', projectile: 'projectile_arrow.glb',
  chaser: 'enemy_gargoyle.glb', archer: 'enemy_skeletal_archer.glb',
  tank: 'enemy_armored_centurion.glb', summoner: 'enemy_cult_sorcerer.glb',
  flanker: 'enemy_styx_ferryman.glb',
  boss: 'boss_marble_minotaur.glb',
});
const ENEMY_ASSET = Object.freeze({
  chaser: 'chaser', archer: 'archer', tank: 'tank', summoner: 'summoner',
  flanker: 'flanker', boss: 'boss', shieldbearer: 'tank', gargoyle: 'flanker',
  sorcerer: 'summoner', slimegolem: 'tank', bomber: 'archer',
});
const CONSUMED_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'KeyJ', 'KeyK', 'KeyL', 'KeyE', 'KeyR', 'Escape', 'KeyH', 'Enter', 'KeyT', 'KeyQ',
  'Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3',
]);
let stylesheetRefs = 0;
const MOVE_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const COLORS = Object.freeze({ bronze: 0xc28a45, ember: 0xff5a22, gold: 0xffcf5a, mist: 0xb8d8e8, blood: 0xb52d2b, arcane: 0x936dff });

function node(tag, className, text) {
  const value = document.createElement(tag);
  value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

function makeButton(className, label, action) {
  const button = node('button', className, label);
  button.type = 'button';
  button.addEventListener('click', action);
  return button;
}

/**
 * A touch action button must fire on the action finger's own pointerdown,
 * not on click: a second finger tapping Dash while the movement pad holds
 * its pointer never produces a click, so click-only buttons ignore it. The
 * click listener stays for mouse/keyboard activation, with a short
 * suppression window so a touch tap does not fire twice.
 */
function makeTouchButton(className, label, action) {
  const button = node('button', className, label);
  button.type = 'button';
  let touchFiredAt = 0;
  button.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') return;
    touchFiredAt = Date.now();
    action(event);
  });
  button.addEventListener('click', (event) => {
    if (Date.now() - touchFiredAt < 750) return;
    action(event);
  });
  return button;
}

export class GameApp {
  constructor({ container, api } = {}) {
    if (!container) throw new TypeError('GameApp requires a container');
    this.container = container;
    this.api = api;
    this.destroyed = false;
    this.loadGeneration = 0;
    this.frames = 0;
    this.state = createGameState('aizo-awakens');
    // Restore the previous run if there is one. The 2D build persisted the run
    // between sessions; without this the 3D build started from scratch every
    // time and the save/load code was unreachable.
    this.storage = this.readStorage();
    const restored = this.storage ? loadPersistedRun(this.storage, 'aizo-awakens') : null;
    this.restoredRun = restored?.restored ? restored.state : null;
    this.saveAnnouncement = restored?.announcement || null;
    // Settings persist separately from the run so a reset never wipes them.
    const coarsePointer = (() => { try { return Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches); } catch (_) { return false; } })();
    this.settings = loadSettings(this.storage, { coarsePointer });
    this.meta = loadMeta(this.storage);
    this.assistMode = this.settings.assistMode;
    this.state.settings = { autoFireReserve: this.settings.autoFireReserve, heat: this.state.settings?.heat || 0 };
    this.dailySeed = dailySeed();
    this.sceneState = 'menu';
    this.paused = false;
    this.help = false;
    this.hiddenPause = false;
    this.accumulator = 0;
    this.eventSeq = 0;
    this.runRecorded = false;
    this.keys = new Set();
    this.pendingAttack = false;
    this.pendingDash = false;
    this.pendingShoot = false;
    this.pendingGuard = false;
    this.pendingSpecial = false;
    if (!this.assistMode) this.assistMode = 'assist';
    this.lockedTarget = null;
    this.pendingInteract = false;
    this.enemyMeshes = new Map();
    this.projectileMeshes = new Map();
    this.chestMeshes = new Map();
    this.chestPositions = new Map();
    this.telegraphMeshes = new Map();
    this.effects = [];
    this.disposers = [];
    this.geometries = new Set();
    this.materials = new Set();
    this.templates = new Map();
    this.particleResources = new Map();
    this.lastTime = performance.now();
  }

  async start() {
    // Startup boundary: start exactly once; a destroy() that lands before or
    // during startup must leave no live scene behind.
    if (this.started) return;
    this.started = true;
    const generation = ++this.loadGeneration;
    this.container.replaceChildren();
    this.installStylesheet();
    this.buildDom();
    this.installQaHandle();
    this.installLifecycle();
    if (this.destroyed || generation !== this.loadGeneration) return;
    if (!this.hasWebGL2()) {
      this.showRepair('Aizanoi Dungeon needs WebGL2', 'Update your browser or graphics driver, then reopen the dungeon.');
      return;
    }
    try {
      this.buildRenderer();
      this.buildScene();
    } catch (error) {
      console.error('[Aizanoi Dungeon] Scene setup failed:', error);
      this.rollbackScene();
      if (!this.destroyed && generation === this.loadGeneration) {
        this.showRepair('The dungeon could not start', 'The 3D scene failed to initialise. Reopen the dungeon to try again.');
      }
      return;
    }
    try {
      await this.loadAssets(generation);
      if (this.destroyed || generation !== this.loadGeneration) return;
      this.buildRoom();
      this.buildAttractScene();
      this.installInput();
      this.resize();
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.stage);
      this.raf = requestAnimationFrame((time) => this.loop(time));
      this.beginButton.focus();
    } catch (error) {
      if (this.destroyed || generation !== this.loadGeneration) return;
      console.error('[Aizanoi Dungeon] Asset load failed:', error);
      this.showRepair('The dungeon could not load', 'A 3D asset failed to load. Check your connection and reopen the dungeon.');
    }
  }

  installStylesheet() {
    stylesheetRefs += 1;
    this.stylesheetRef = true;
    if (document.getElementById('aizanoi-dungeon-css')) return;
    const link = document.createElement('link');
    link.id = 'aizanoi-dungeon-css';
    link.rel = 'stylesheet';
    link.href = new URL('../../css/game.css', import.meta.url).href;
    document.head.appendChild(link);
  }

  releaseStylesheet() {
    if (!this.stylesheetRef) return;
    this.stylesheetRef = false;
    stylesheetRefs = Math.max(0, stylesheetRefs - 1);
    if (stylesheetRefs === 0) document.getElementById('aizanoi-dungeon-css')?.remove();
  }

  rollbackScene() {
    try { this.renderer?.dispose(); } catch (_) {}
    this.renderer = null;
    this.scene = null;
    this.camera = null;
  }

  buildDom() {
    this.root = node('div', 'aizanoi-dungeon3d-app-root');
    this.root.tabIndex = 0;
    this.root.setAttribute('aria-label', 'Aizanoi Dungeon game');
    this.stage = node('div', 'az-dungeon3d-stage');
    this.effectLayer = node('div', 'az-dungeon-effects');
    this.touchControls = node('div', 'az-touch-controls');
    this.touchControls.setAttribute('aria-label', 'Touch controls');
    const pad = node('div', 'az-touch-joystick');
    pad.setAttribute('role', 'group');
    pad.setAttribute('aria-label', 'Movement pad');
    pad.append(node('span', 'az-touch-joystick-knob'));
    for (const [direction, glyph] of [['up', '↑'], ['down', '↓'], ['left', '←'], ['right', '→']]) {
      const arrow = node('span', `az-touch-direction az-touch-direction--${direction}`, glyph);
      arrow.setAttribute('aria-hidden', 'true');
      pad.append(arrow);
    }
    const actions = node('div', 'az-touch-actions');
    const attack = makeTouchButton('az-touch-action az-touch-action--primary', 'Attack', () => { this.pendingAttack = true; this.root.focus(); });
    const shoot = makeTouchButton('az-touch-action', 'Shoot', () => { this.pendingShoot = true; this.root.focus(); });
    const dash = makeTouchButton('az-touch-action', 'Dash', () => { this.pendingDash = true; this.root.focus(); });
    const guard = makeTouchButton('az-touch-action', 'Guard', () => { this.pendingGuard = true; this.root.focus(); });
    const wrath = makeTouchButton('az-touch-action', 'Wrath', () => { this.pendingSpecial = true; this.root.focus(); });
    actions.append(attack, shoot, dash, guard, wrath);
    this.touchControls.append(pad, actions);
    this.exitButton = makeButton('az-dungeon-exit', '', () => this.api?.closeApp?.(APP_ID));
    this.exitButton.setAttribute('aria-label', 'Return to AizanoiOS');
    const exitArrow = node('span', 'az-dungeon-exit-arrow', '←');
    exitArrow.setAttribute('aria-hidden', 'true');
    this.exitButton.append(exitArrow, node('span', 'az-dungeon-exit-label', 'AizanoiOS'));
    this.menu = node('section', 'az-dungeon-menu');
    this.menu.append(node('h1', 'az-dungeon-menu-title', 'Aizanoi Dungeon'));
    this.menu.append(node('p', 'az-dungeon-menu-sub', 'Aizo awakens beneath the temple. Survive the descent, claim the blessing, enter the portal.'));
    this.beginButton = makeButton('az-dungeon-begin', 'Begin', () => this.begin());
    this.menu.append(this.beginButton);
    // The 2D build offered "Continue" on the menu. If a saved run exists,
    // offer it again rather than silently starting over.
    if (this.restoredRun) {
      const chapter = this.restoredRun.chapter || 1;
      this.continueButton = makeButton('az-dungeon-begin az-dungeon-continue', `Continue · Chapter ${chapter}`, () => this.continueRun());
      this.menu.append(this.continueButton);
    }
    if (this.saveAnnouncement) {
      this.menu.append(node('p', 'az-dungeon-menu-note', this.saveAnnouncement));
    }
    this.root.append(this.stage, this.effectLayer, this.touchControls, this.exitButton, this.menu);
    this.container.append(this.root);
    this.hud = createHud({ container: this.root, onAssistMode: () => this.cycleAssistMode() });
    this.audio = createAudioManager();
    this.feedback = createFeedbackBus({ audio: this.audio, hud: this.hud });
    this.disposers.push(this.feedback.on('effect', (effect) => this.renderEffect(effect)));
  }

  hasWebGL2() {
    try { return Boolean(document.createElement('canvas').getContext('webgl2')); } catch (_) { return false; }
  }

  buildRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.stage.append(this.renderer.domElement);
    const contextLost = (event) => {
      event.preventDefault();
      this.contextLost = true;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.paused = true;
      this.showRepair('Graphics context lost', 'The graphics context was lost. It resumes automatically when the GPU recovers; reopen the dungeon if the scene stays dark.');
    };
    const contextRestored = () => {
      if (this.destroyed) return;
      this.contextLost = false;
      this.repair?.remove();
      this.repair = null;
      this.paused = false;
      this.lastTime = performance.now();
      if (!this.raf) this.raf = requestAnimationFrame((time) => this.loop(time));
    };
    this.renderer.domElement.addEventListener('webglcontextlost', contextLost, false);
    this.renderer.domElement.addEventListener('webglcontextrestored', contextRestored, false);
    this.disposers.push(() => this.renderer?.domElement.removeEventListener('webglcontextlost', contextLost));
    this.disposers.push(() => this.renderer?.domElement.removeEventListener('webglcontextrestored', contextRestored));
  }

  buildScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080a0b);
    this.scene.fog = new THREE.Fog(0x080a0b, 22, 48);
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 80);
    this.camera.position.set(10, 10, 12);
    this.cameraTarget = new THREE.Vector3();
    this.scene.add(new THREE.HemisphereLight(0x8fa0bd, 0x160e08, 0.75));
    const moon = new THREE.DirectionalLight(0xffdfb0, 2.4);
    moon.position.set(7, 14, 5);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = -22;
    moon.shadow.camera.right = 22;
    moon.shadow.camera.top = 22;
    moon.shadow.camera.bottom = -22;
    this.scene.add(moon);
    this.room = new THREE.Group();
    this.dynamic = new THREE.Group();
    this.scene.add(this.room, this.dynamic);
  }

  async loadAssets(generation) {
    const loader = new GLTFLoader();
    await Promise.all(Object.entries(ASSETS).map(async ([key, file]) => {
      const gltf = await loader.loadAsync(new URL(file, ASSET_BASE).href);
      if (this.destroyed || generation !== this.loadGeneration) {
        this.disposeLoaded(gltf.scene);
        return;
      }
      this.collectResources(gltf.scene);
      this.templates.set(key, gltf.scene);
    }));
  }

  disposeLoaded(root) {
    const geometries = new Set();
    const materials = new Set();
    root.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      const owned = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      owned.forEach((material) => materials.add(material));
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  }

  collectResources(root) {
    root.traverse((object) => {
      if (object.geometry) this.geometries.add(object.geometry);
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      materials.forEach((material) => this.materials.add(material));
    });
  }

  clone(key) {
    const model = this.templates.get(key)?.clone(true);
    if (!model) throw new Error(`Missing dungeon asset: ${key}`);
    model.traverse((object) => {
      if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
    });
    return model;
  }

  buildRoom() {
    const tileSize = 4;
    for (let x = -5; x <= 5; x += 1) {
      for (let z = -5; z <= 5; z += 1) {
        const tile = this.clone('floor');
        tile.position.set(x * tileSize, 0, z * tileSize);
        tile.scale.set(2, 1, 2);
        this.room.add(tile);
      }
    }
    for (let i = -9; i <= 9; i += 1) {
      for (const [x, z, rotation] of [[i * 2, -19, 0], [i * 2, 19, 0], [-19, i * 2, Math.PI / 2], [19, i * 2, Math.PI / 2]]) {
        if (z === -19 && Math.abs(x) < 2.1) continue;
        const wall = this.clone('wall');
        wall.position.set(x, 0, z);
        wall.rotation.y = rotation;
        this.room.add(wall);
      }
    }
    const doorway = this.clone('doorway');
    doorway.position.set(0, 0, -19);
    this.room.add(doorway);
    for (const x of [-12, -6, 6, 12]) {
      for (const z of [-12, 12]) {
        const column = this.clone('column');
        column.position.set(x, 0, z);
        this.room.add(column);
      }
    }
    for (const x of [-8, 8]) {
      const brazier = this.clone('brazier');
      brazier.position.set(x, 0, -15);
      this.room.add(brazier);
      const fire = new THREE.PointLight(0xff6b21, 8, 12, 2);
      fire.position.set(x, 2.1, -15);
      this.room.add(fire);
    }
  }

  buildAttractScene() {
    this.hero = this.clone('hero');
    this.hero.position.set(0, 0, 2);
    this.dynamic.add(this.hero);
    this.preview = new THREE.Group();
    const enemy = this.clone('chaser');
    enemy.position.set(4, 0, -3);
    const chest = this.clone('chest');
    chest.position.set(-4, 0, -2);
    const portal = this.clone('portal');
    portal.position.set(0, 0, -10);
    this.preview.add(enemy, chest, portal);
    this.dynamic.add(this.preview);
  }

  installQaHandle() {
    const app = this;
    this.qaHandle = Object.freeze({
      engine: 'three',
      get state() { return app.sceneState === 'playing' && (app.paused || app.hiddenPause || app.help) ? 'paused' : app.sceneState; },
      get chapter() { return app.state.chapter; },
      get enemyCount() { return app.state.enemies.filter((enemy) => !enemy.dead).length; },
      get enemyHp() { return Object.freeze(app.state.enemies.filter((enemy) => !enemy.dead).map((enemy) => Object.freeze({ id: enemy.id, hp: enemy.hp, maxHp: enemy.maxHp, x: enemy.x, z: enemy.z, archetype: enemy.archetype }))); },
      get player() { return Object.freeze({ x: app.state.player.position.x, z: app.state.player.position.z, hp: app.state.player.hp }); },
      get hp() { return app.state.player.hp; },
      get stamina() { return app.state.player.stamina; },
      get maxStamina() { return app.state.player.maxStamina; },
      get frames() { return app.frames; },
      // The run ledger, read-only. The victory screen shows these numbers, and
      // a QA surface that can read them lets a browser test check that the
      // screen and the state agree without reaching into the runtime.
      get ledger() { return Object.freeze({ ...app.state.stats, chapter: app.state.chapter, gold: app.state.player.gold, blessings: app.state.blessings.length }); },
      get victory() { return app.sceneState === 'victory'; },
      get portalReady() { return Boolean(app.portal); },
      get runStatus() { return app.state.status; },
      get assist() { return { mode: app.assistMode, target: app.state.assistTarget, locked: app.lockedTarget }; },
      get target() { const t = app.state.enemies.find((unit) => unit.id === (app.lockedTarget || app.state.assistTarget)); return t ? { id: t.id, archetype: t.archetype, hp: t.hp, maxHp: t.maxHp } : null; },
      get buffs() { return { blessings: [...app.state.blessings], levels: { ...(app.state.blessingLevels || {}) }, duos: [...(app.state.duos || [])], specialCharge: app.state.player.specialCharge }; },
      get status() { return { pendingSpawns: (app.state.pendingSpawns || []).length, live: app.state.enemies.filter((e) => !e.dead).length, guardUntil: app.state.player.guardUntil, time: app.state.time, arena: app.state.arena, marks: app.meta?.marks || 0 }; },
      qaRetrySeed() { const seed = app.state.seed; app.state = createGameState(seed); app.syncWorld(); app.updateHud(); return { seed }; },
      // QA affordance: clear the current wave and open its chest, using the
      // game's own code path, so a browser test can reach a late-game state
      // without playing ten chapters by hand. It is a test hook on a handle
      // that exists for QA; it changes no gameplay.
      /**
       * Walk the player toward an enemy using the real movement input, so
       * the next swing has a target the way it would in play. The direction
       * is held for a moment and then released.
       */
      qaWalkToward(enemyId) {
        const enemy = app.state.enemies.find((unit) => unit.id === enemyId);
        if (!enemy) return { moved: false };
        const player = app.state.player.position;
        const dx = enemy.x - player.x;
        const dz = enemy.z - player.z;
        const length = Math.hypot(dx, dz) || 1;
        // The touch stick is the runtime's own movement input, and it is
        // camera-relative, so the direction is expressed in the same frame
        // the game uses.
        const forward = new THREE.Vector3();
        app.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
        const worldX = dx / length;
        const worldZ = dz / length;
        // Solve for the stick vector that yields the wanted world direction.
        const horizontal = worldX * right.x + worldZ * right.z;
        const vertical = worldX * forward.x + worldZ * forward.z;
        app.touchMove = { x: horizontal, z: -vertical };
        app.qaWalk = { targetId: enemyId, until: app.state.time + 12 };
        return { moved: true, distance: length };
      },
      /**
       * Keep walking toward the target until it is in melee reach, so a
       * browser test can land a real swing the way a player would.
       */
      qaCloseIn() {
        const walk = app.qaWalk;
        if (!walk) return { closed: false };
        const enemy = app.state.enemies.find((unit) => unit.id === walk.targetId);
        if (!enemy) { app.qaWalk = null; app.touchMove = null; return { closed: false }; }
        const player = app.state.player.position;
        const distance = Math.hypot(enemy.x - player.x, enemy.z - player.z);
        if (distance <= 1.6) { app.qaWalk = null; app.touchMove = null; return { closed: true, distance }; }
        if (app.state.time > walk.until) { app.qaWalk = null; app.touchMove = null; return { closed: false, distance }; }
        app.qaHandle.qaWalkToward(walk.targetId);
        return { closed: false, distance };
      },
      /**
       * Advance the game's own fixed-step simulation by a number of ticks.
       *
       * The render loop is driven by requestAnimationFrame, and in a headless
       * browser with a software WebGL implementation it runs at well under
       * one frame per second. A test that has to wait for real frames would
       * take minutes, so it drives the same fixedTick() the render loop uses
       * instead. The game logic that runs is exactly the game's own.
       */
      qaAdvance(ticks = 60) {
        for (let i = 0; i < ticks; i += 1) app.fixedTick();
        return { ticks, frames: app.frames, time: app.state.time };
      },
      qaClearWave() {
        app.state.enemies = [];
        app.state.pendingSpawns = [];
        app.state.wave = { active: true, complete: false, rewarded: false, chapter: app.state.chapter, scale: 1 };
        stepGame(app.state, {}, 1 / 60);
        const chest = app.state.chests.at(-1);
        if (!chest) return { opened: false };
        // The chest is opened through the runtime's own path, not by calling
        // openChest() behind its back: the runtime has to see the
        // 'wave-complete' event to learn where the chest is, and it has to
        // run its own open-and-reward flow for the victory screen to appear.
        app.processEvents();
        const position = app.chestPositions.get(chest.id) || chest.position;
        app.chestPositions.set(chest.id, position);
        app.state.player.position.x = position.x;
        app.state.player.position.z = position.z;
        const result = openChest(app.state, chest.id);
        if (result.blessing) chooseBlessing(app.state, result.blessing);
        app.persistRun();
        app.syncWorld();
        app.updateHud();
        if (result.victory === true) app.showVictory();
        return { opened: true, victory: result.victory === true };
      },
    });
    window.AIZANOI_DUNGEON_GAME = this.qaHandle;
  }

  installLifecycle() {
    const focusout = (event) => {
      if (!event.relatedTarget || !this.root.contains(event.relatedTarget)) this.resetInput();
    };
    const reset = () => this.resetInput();
    const visibility = () => {
      this.hiddenPause = document.hidden;
      if (document.hidden) this.resetInput();
      this.lastTime = performance.now();
    };
    this.root.addEventListener('focusout', focusout);
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', visibility);
    this.disposers.push(() => this.root.removeEventListener('focusout', focusout));
    this.disposers.push(() => window.removeEventListener('blur', reset));
    this.disposers.push(() => document.removeEventListener('visibilitychange', visibility));
  }

  installInput() {
    const hasFocus = () => this.root.contains(document.activeElement) || document.activeElement === this.root;
    const keydown = (event) => {
      if (!hasFocus() || !CONSUMED_KEYS.has(event.code)) return;
      event.preventDefault();
      if (this.pickPanel) {
        if (!event.repeat && (event.code === 'Digit1' || event.code === 'Numpad1')) { this.pickChoice(0); return; }
        if (!event.repeat && (event.code === 'Digit2' || event.code === 'Numpad2')) { this.pickChoice(1); return; }
        if (!event.repeat && (event.code === 'Digit3' || event.code === 'Numpad3')) { this.pickChoice(2); return; }
        if (!event.repeat && event.code === 'KeyR') { this.pickReroll(); return; }
        // Escape never sells the pending blessing: the draft owns the modal
        // until the player chooses, rerolls, or explicitly skips for gold.
        if (event.code === 'Escape' && !event.repeat) {
          this.hud?.announce?.('Choose a blessing, reroll, or Skip for gold');
          return;
        }
        return;
      }
      if (this.sceneState === 'defeat' && !event.repeat && event.code === 'KeyR') { this.retrySeed(); return; }
      if (event.code === 'Escape' && !event.repeat) this.togglePause();
      else if (event.code === 'KeyH' && !event.repeat) this.toggleHelp();
      else if (event.code === 'KeyT' && !event.repeat) this.cycleAssistMode();
      else if (event.code === 'KeyQ' && !event.repeat) {
        // cycle lock target
        const alive = this.state.enemies.filter((e)=>!e.dead);
        if (!alive.length) this.lockedTarget = null;
        else {
          const idx = alive.findIndex((e)=>e.id===this.lockedTarget);
          this.lockedTarget = alive[(idx+1)%alive.length].id;
        }
      }
      else if (event.code === 'Space' && !event.repeat) this.pendingDash = true;
      else if (event.code === 'KeyJ') { this.pendingAttack = true; this.keys.add('KeyJ'); }
      else if (event.code === 'KeyK') { this.pendingShoot = true; this.keys.add('KeyK'); }
      else if (event.code === 'KeyL' && !event.repeat) { this.pendingGuard = true; this.keys.add('KeyL'); }
      else if (event.code === 'KeyE' && !event.repeat) this.pendingSpecial = true;
      else if (event.code === 'Enter' && !event.repeat) this.pendingInteract = true;
      else if (MOVE_CODES.has(event.code)) this.keys.add(event.code);
    };
    const keyup = (event) => {
      if (CONSUMED_KEYS.has(event.code) && hasFocus()) event.preventDefault();
      this.keys.delete(event.code);
      if (event.code === 'KeyJ') this.keys.delete('KeyJ');
      if (event.code === 'KeyK') this.keys.delete('KeyK');
      if (event.code === 'KeyL') this.keys.delete('KeyL');
    };
    const pointer = (event) => {
      if (this.sceneState !== 'playing') return;
      event.preventDefault();
      this.root.focus();
      this.pendingInteract = true;
      this.pendingAttack = true;
    };
    this.root.addEventListener('keydown', keydown);
    this.root.addEventListener('keyup', keyup);
    this.renderer.domElement.addEventListener('pointerdown', pointer);
    this.installTouchPad();
    this.disposers.push(() => this.root.removeEventListener('keydown', keydown));
    this.disposers.push(() => this.root.removeEventListener('keyup', keyup));
    this.disposers.push(() => this.renderer?.domElement.removeEventListener('pointerdown', pointer));
  }

  installTouchPad() {
    const pad = this.touchControls.querySelector('.az-touch-joystick');
    let owner = null;
    const update = (event) => {
      // A second finger owns nothing until the first lifts: ignore it.
      if (owner !== null && event.pointerId !== owner) return;
      owner = event.pointerId ?? owner;
      try { pad.setPointerCapture?.(event.pointerId); } catch (_) {}
      const rect = pad.getBoundingClientRect();
      this.touchMove = {
        x: THREE.MathUtils.clamp((event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2), -1, 1),
        z: THREE.MathUtils.clamp((event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2), -1, 1),
      };
      pad.classList.toggle('is-active', true);
      if (event.cancelable) event.preventDefault();
      this.root.focus();
    };
    const clear = (event) => {
      if (event && event.pointerId !== undefined && owner !== null && event.pointerId !== owner) return;
      owner = null;
      this.touchMove = null;
      pad.classList.toggle('is-active', false);
    };
    pad.addEventListener('pointerdown', update);
    pad.addEventListener('pointermove', (event) => { if (event.buttons || event.pressure) update(event); });
    pad.addEventListener('pointerup', clear);
    pad.addEventListener('pointercancel', clear);
    this.disposers.push(() => clear());
  }

  /**
   * The persistence helpers are best-effort: a browser with storage disabled
   * (private mode, blocked third-party context) must still get a playable
   * game, so every failure here degrades to "no save" rather than an error.
   */
  readStorage() {
    try {
      const storage = window.localStorage;
      if (!storage) return null;
      // Touch the storage: Safari in private mode throws only on write.
      const probe = '__aizanoi_dungeon_probe__';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      return storage;
    } catch (_) {
      return null;
    }
  }

  persistRun() {
    if (!this.storage) return { saved: false };
    return savePersistedRun(this.storage, this.state);
  }

  continueRun() {
    if (!this.restoredRun || this.sceneState !== 'menu') return;
    this.state = this.restoredRun;
    this.restoredRun = null;
    // The restored run's events already carry sequence numbers, so the
    // runtime has to start from the state's counter, not from zero.
    this.eventSeq = Number.isInteger(this.state.eventSeq) ? this.state.eventSeq : 0;
    this.sceneState = 'playing';
    this.audio.resume();
    this.preview.removeFromParent();
    this.menu.remove();
    this.hud.setVisible(true);
    this.root.focus();
    this.syncWorld();
    this.updateHud();

    // A real save is written immediately after a chest opens. At that point
    // the state owns a pending portal, but the Three.js portal mesh is runtime
    // state and is not serialized. Recreate it or the restored run is stuck
    // between waves with no way to continue.
    const pendingPortal = this.state.portal?.pending && this.state.portal.position;

    // A completed run must resume at its ledger, not as a chapter-11 playing
    // state with its victory event suppressed by the restored event cursor.
    if (this.state.chapter > FINAL_CHAPTER) this.showVictory();
    else if (pendingPortal) this.spawnPortal(pendingPortal);
  }

  async begin() {
    if (this.sceneState !== 'menu') return;
    this.sceneState = 'playing';
    // Audio unlock is best-effort and must never gate gameplay: resume() can
    // stay pending when the browser withholds user activation (or audio is
    // unavailable), so fire it without awaiting.
    this.audio.resume();
    if (this.destroyed || this.sceneState !== 'playing') return;
    this.preview.removeFromParent();
    this.sceneState = 'playing';
    this.menu.remove();
    this.hud.setVisible(true);
    this.root.focus();
    spawnWave(this.state, 1);
    this.feedback.emit('portal', { position: { x: 0, y: 1, z: 0 } });
    this.syncWorld();
    this.updateHud();
  }

  resetInput() {
    this.keys.clear();
    this.pendingAttack = false;
    this.pendingDash = false;
    this.pendingShoot = false;
    this.pendingGuard = false;
    this.pendingSpecial = false;
    this.pendingInteract = false;
    this.touchMove = null;
    this.state.inputLatch.attack = false;
    this.state.inputLatch.dash = false;
    this.state.inputLatch.shoot = false;
    this.state.inputLatch.guard = false;
    this.state.inputLatch.special = false;
  }

  togglePause() {
    if (this.sceneState !== 'playing') return;
    this.paused = !this.paused;
    this.resetInput();
    this.hud.update({ paused: this.paused, help: this.help });
  }

  /**
   * The single touch-mode switch: keyboard T, gamepad Y and the tappable HUD
   * assist chip all cycle manual → assist → auto and persist the choice, so
   * a saved preference always wins over the coarse-pointer default.
   */
  cycleAssistMode() {
    const modes = ['manual', 'assist', 'auto'];
    this.assistMode = modes[(modes.indexOf(this.assistMode) + 1) % modes.length];
    this.settings.assistMode = this.assistMode;
    saveSettings(this.storage, this.settings);
    this.hud?.announce?.(`Assist mode: ${this.assistMode.toUpperCase()}`);
    if (this.hud) this.updateHud();
    return { mode: this.assistMode };
  }

  toggleHelp() {
    if (this.sceneState === 'menu') return;
    this.help = !this.help;
    this.hud.update({ paused: this.paused, help: this.help });
  }

  pollGamepad(input) {
    let pad = null;
    try { pad = navigator.getGamepads?.()?.[0] || null; } catch (_) { pad = null; }
    if (!pad?.connected) return input;
    const dz = (value) => (Math.abs(value) < 0.22 ? 0 : value);
    const lx = dz(pad.axes?.[0] || 0);
    const ly = dz(pad.axes?.[1] || 0);
    if (lx || ly) { input.moveX = (input.moveX || 0) + lx; input.moveZ = (input.moveZ || 0) + ly; }
    const buttons = pad.buttons || [];
    const pressed = (index) => Boolean(buttons[index]?.pressed);
    if (pressed(0)) this.pendingDash = true;      // A/cross: dash
    if (pressed(1)) this.pendingGuard = true;     // B/circle: guard
    if (pressed(4) || pressed(5)) this.pendingAttack = true; // bumpers: melee
    if (pressed(6) || pressed(7)) input.shoot = true;        // triggers: bow
    if (pressed(3) && !this.gamepadToggleLatched) this.cycleAssistMode(); // Y/triangle: assist
    this.gamepadToggleLatched = pressed(3);
    try { if ((pressed(0) || pressed(1)) && navigator.vibrate) navigator.vibrate(12); } catch (_) {}
    return input;
  }

  movementInput() {
    let horizontal = 0;
    let vertical = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) horizontal -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) horizontal += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) vertical += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) vertical -= 1;
    if (this.touchMove) { horizontal += this.touchMove.x; vertical -= this.touchMove.z; }
    const length = Math.hypot(horizontal, vertical);
    if (length > 1) { horizontal /= length; vertical /= length; }
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
    return {
      moveX: forward.x * vertical + right.x * horizontal,
      moveZ: forward.z * vertical + right.z * horizontal,
    };
  }

  fixedTick() {
    // A QA walk keeps steering the player toward its target until the target
    // is in reach or the walk times out.
    if (this.qaWalk) this.qaHandle.qaCloseIn();
    const input = this.movementInput();
    this.pollGamepad(input);
    input.attack = this.pendingAttack || this.keys.has('KeyJ');
    input.dash = this.pendingDash;
    input.shoot = this.pendingShoot || this.keys.has('KeyK');
    input.guard = this.pendingGuard || this.keys.has('KeyL');
    input.special = this.pendingSpecial || this.keys.has('KeyE');
    input.autoAttack = this.assistMode === 'assist' || this.assistMode === 'auto';
    input.autoShoot = this.assistMode === 'auto';
    input.lockTarget = this.lockedTarget;
    this.pendingAttack = false;
    this.pendingDash = false;
    this.pendingShoot = false;
    this.pendingGuard = false;
    this.pendingSpecial = false;
    if (this.pendingInteract) {
      this.pendingInteract = false;
      if (this.tryInteract()) input.attack = false;
    }
    stepGame(this.state, input, FIXED_STEP);
    this.processEvents();
    this.syncWorld();
    this.updateHud();
    if (this.state.player.dead && this.sceneState !== 'defeat') this.showDefeat();
  }

  tryInteract() {
    const player = this.state.player.position;
    const chest = this.state.chests.find((item) => !item.opened);
    if (chest) {
      const position = this.chestPositions.get(chest.id);
      if (position && Math.hypot(position.x - player.x, position.z - player.z) <= 3) {
        const result = openChest(this.state, chest.id);
        if (result.opened) {
          this.feedback.emit('loot', { label: `${result.gold} gold` });
          this.spawnPortal(position);
          this.persistRun();
          this.syncWorld();
          // A chest with choices opens the pick screen; exhausted pools carry
          // a fallback reward instead — label exactly what was granted.
          const full = this.state.chests.find((item) => item.id === chest.id);
          if (full?.choices?.length) this.showPick(full);
          else {
            const chosen = result.blessing ? chooseBlessing(this.state, result.blessing) : null;
            const reward = chosen?.chosen ? chosen.label : (result.fallback?.label || `${result.gold} gold`);
            this.feedback.emit('loot', { label: reward });
          }
          return true;
        }
      }
    }
    if (this.portal && Math.hypot(this.portal.position.x - player.x, this.portal.position.z - player.z) <= 3) {
      this.portal.removeFromParent();
      this.portal = null;
      spawnWave(this.state, this.state.chapter);
      this.feedback.emit(this.state.chapter % 5 === 0 ? 'boss' : 'portal', { label: `Chapter ${this.state.chapter}` });
      return true;
    }
    return false;
  }

  /**
   * Consume the events the runtime has not seen yet.
   *
   * The event ring is trimmed from the front, so an index into it drifts
   * every time the ring shifts. The runtime therefore remembers the last
   * SEQUENCE NUMBER it processed and picks up every event with a higher
   * sequence, which is correct no matter how the ring is trimmed. Before
   * this, the cursor drifted one event per emission and eventually stopped
   * seeing events altogether: the chest positions were never recorded, so
   * the reward chest could never be opened and the run deadlocked.
   */
  processEvents() {
    for (const event of this.state.events) {
      if (typeof event.seq !== 'number') continue;
      if (event.seq <= this.eventSeq) continue;
      this.eventSeq = event.seq;
      this.handleEvent(event);
    }
  }

  handleEvent(event) {
    const enemy = event.id ? this.state.enemies.find((unit) => unit.id === event.id) : null;
    const position = enemy ? { x: enemy.x, y: 1.2, z: enemy.z } : { x: this.state.player.position.x, y: 1, z: this.state.player.position.z };
    if (event.type === 'melee-hit') this.feedback.emit(event.chain === 3 ? 'crit' : 'hit', { damage: event.damage, position });
    else if (event.type === 'bow-hit') this.feedback.emit(event.crit ? 'crit' : 'bow-hit', { damage: event.damage, position });
    else if (event.type === 'bow-missed') {
      // The bow did nothing, and the player is told why instead of the input
      // looking broken.
      const reason = {
        'no-target': 'No target in range',
        stamina: 'Not enough stamina',
        cooldown: 'The bow is not ready',
        dead: 'Aizo has fallen',
      }[event.reason] || 'The bow did not fire';
      this.hud.announce(reason);
    }
    else if (event.type === 'enemy-death') this.feedback.emit('crit', { position });
    else if (event.type === 'player-hit') {
      this.feedback.emit('hurt', { damage: event.amount, position });
      this.hud.setDamage(true);
      clearTimeout(this.damageTimer);
      this.damageTimer = setTimeout(() => this.hud?.setDamage(false), 280);
    } else if (event.type === 'dash') this.feedback.emit('dash', { position });
    else if (event.type === 'bow-shot') this.feedback.emit('bow', { position });
    else if (event.type === 'attack-telegraph') {
      // Audible windup cue; the ground ring is synced from live windup state.
      this.feedback.emit('swing', { position, intensity: 0.6 });
    }
    else if (event.type === 'spawn-portal') {
      this.hud.announce('Enemies approach');
      this.feedback.emit('swing', { position: { x: event.x, y: 0.5, z: event.z }, intensity: 0.4 });
    }
    else if (event.type === 'enemy-spawn') this.feedback.emit('bow', { position });
    else if (event.type === 'parry') { this.feedback.emit('parry', { position }); this.hud.announce('Parried'); }
    else if (event.type === 'guard-block') this.feedback.emit('hurt', { damage: event.damage, position });
    else if (event.type === 'phantom-step') { this.feedback.emit('parry', { position }); this.hud.announce('Phantom Step'); }
    else if (event.type === 'guard') this.feedback.emit('dash', { position });
    else if (event.type === 'special') { this.feedback.emit('special', { position }); this.hud.announce(`Wrath of the Temple — ${event.stunned} stunned`); }
    else if (event.type === 'crescent') this.feedback.emit('swing', { position, intensity: 1 });
    else if (event.type === 'shield-block') this.feedback.emit('hit', { position });
    else if (event.type === 'bomber-detonate') {
      // The blast is the loudest thing in the room; the player has to feel it
      // to learn that the fuse is a deadline.
      this.feedback.emit('boss', { position });
      this.hud.announce('The bomber detonates');
    } else if (event.type === 'dash-trail') {
      this.feedback.emit('hit', { damage: event.damage, position });
    } else if (event.type === 'vampiric-drain') {
      this.hud.announce('The elite drinks deep');
    } else if (event.type === 'bloodrite') {
      this.feedback.emit('loot', { label: `Bloodrite +${event.healed}`, position });
    }
    else if (event.type === 'rhythm') this.hud.announce('Rhythm strike');
    else if (event.type === 'focus-shot') this.hud.announce('Focus shot loosed');
    else if (event.type === 'reroll') this.hud.announce('Blessings rerolled');
    else if (event.type === 'shop-buy') this.feedback.emit('loot', { label: `Toll paid: ${event.kind}`, position });
    else if (event.type === 'arena') this.hud.announce(`${event.id.replaceAll('-', ' ')} arena`);
    else if (event.type === 'wave-start') this.hud.announce(`Chapter ${event.chapter}`);
    else if (event.type === 'wave-complete') {
      this.hud.announce('Wave cleared — claim your blessing');
      const chest = this.state.chests.find((item) => item.id === event.chest);
      if (chest?.position) this.chestPositions.set(chest.id, { x: chest.position.x, z: chest.position.z });
      this.feedback.emit('loot', { label: 'Reward chest revealed', position });
    }
    else if (event.type === 'victory') {
      this.hud.announce('The descent is complete');
      this.feedback.emit('portal', { position });
      this.showVictory();
    }
  }

  syncWorld() {
    if (this.hero) {
      this.hero.position.set(this.state.player.position.x, 0, this.state.player.position.z);
      this.hero.rotation.y = Math.atan2(this.state.player.facing.x, this.state.player.facing.z);
    }
    const alive = new Set();
    for (const enemy of this.state.enemies) {
      if (enemy.dead) continue;
      alive.add(enemy.id);
      let mesh = this.enemyMeshes.get(enemy.id);
      if (!mesh) {
        mesh = this.clone(ENEMY_ASSET[enemy.archetype]);
        mesh.userData.entityId = enemy.id;
        this.enemyMeshes.set(enemy.id, mesh);
        this.dynamic.add(mesh);
      }
      mesh.position.set(enemy.x, 0, enemy.z);
      mesh.lookAt(this.state.player.position.x, 0, this.state.player.position.z);
    }
    for (const [id, mesh] of this.enemyMeshes) {
      if (!alive.has(id)) { mesh.removeFromParent(); this.enemyMeshes.delete(id); }
    }
    const shots = new Set();
    for (const projectile of this.state.projectiles) {
      shots.add(projectile.id);
      let mesh = this.projectileMeshes.get(projectile.id);
      if (!mesh) { mesh = this.clone('projectile'); this.projectileMeshes.set(projectile.id, mesh); this.dynamic.add(mesh); }
      // The player's arrow flies level with the bow; enemy shots ride higher
      // so the two are never mistaken for each other on screen.
      const height = projectile.source === 'player' ? 0.8 : 1.1;
      mesh.position.set(projectile.x, height, projectile.z);
      mesh.rotation.y = Math.atan2(projectile.vx, projectile.vz);
    }
    for (const [id, mesh] of this.projectileMeshes) {
      if (!shots.has(id)) { mesh.removeFromParent(); this.projectileMeshes.delete(id); }
    }
    const available = new Set();
    for (const chest of this.state.chests) {
      if (chest.opened) continue;
      available.add(chest.id);
      let mesh = this.chestMeshes.get(chest.id);
      if (!mesh) { mesh = this.clone('chest'); this.chestMeshes.set(chest.id, mesh); this.dynamic.add(mesh); }
      const position = this.chestPositions.get(chest.id) || chest.position || { x: 0, z: 0 };
      mesh.position.set(position.x, 0, position.z);
    }
    for (const [id, mesh] of this.chestMeshes) {
      if (!available.has(id)) { mesh.removeFromParent(); this.chestMeshes.delete(id); }
    }
    this.syncTelegraphs();
  }

  telegraphResources() {
    if (!this.telegraphShared) {
      const geometry = new THREE.RingGeometry(0.86, 1, 48);
      const material = new THREE.MeshBasicMaterial({ color: COLORS.ember, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
      this.telegraphShared = { geometry, material };
      this.geometries.add(geometry);
      this.materials.add(material);
    }
    return this.telegraphShared;
  }

  syncTelegraphs() {
    const active = new Set();
    if (this.dynamic) {
      const { geometry, material } = this.telegraphResources();
      for (const enemy of this.state.enemies) {
        if (enemy.dead || !enemy.windup) continue;
        active.add(enemy.id);
        let mesh = this.telegraphMeshes.get(enemy.id);
        if (!mesh) {
          mesh = new THREE.Mesh(geometry, material);
          mesh.rotation.x = -Math.PI / 2;
          mesh.userData.entityId = enemy.id;
          this.telegraphMeshes.set(enemy.id, mesh);
          this.dynamic.add(mesh);
        }
        const progress = 1 - enemy.windup.remaining / Math.max(1e-6, enemy.windup.duration);
        // The marker is the attack's danger area, not its reach: a bowman's
        // ten-unit reach would otherwise paint a ring across the arena.
        const radius = Math.max(0.6, enemy.windup.telegraph ?? enemy.windup.range ?? 1.5);
        mesh.position.set(enemy.x, 0.06, enemy.z);
        mesh.scale.setScalar(radius * (1.12 - 0.28 * Math.min(1, Math.max(0, progress))));
      }
    }
    for (const [id, mesh] of this.telegraphMeshes) {
      if (!active.has(id)) { mesh.removeFromParent(); this.telegraphMeshes.delete(id); }
    }
  }

  spawnPortal(position) {
    if (this.portal) this.portal.removeFromParent();
    this.portal = this.clone('portal');
    this.portal.position.set(position.x, 0, position.z);
    this.dynamic.add(this.portal);
    this.feedback.emit('portal', { position: { x: position.x, y: 1, z: position.z } });
  }

  updateHud() {
    const player = this.state.player;
    const boss = this.state.enemies.find((enemy) => enemy.archetype === 'boss' && !enemy.dead);
    const target = this.state.enemies.find((unit) => unit.id === (this.lockedTarget || this.state.assistTarget));
    this.hud.update({
      health: player.hp, maxHealth: player.maxHp, stamina: player.stamina, maxStamina: player.maxStamina,
      xp: player.xp, xpToNext: player.xpToNext, gold: player.gold, combo: player.combo,
      chapter: this.state.chapter, wave: this.state.wave.chapter,
      boss: boss ? { name: 'Marble Minotaur', health: boss.hp, maxHealth: boss.maxHp } : null,
      blessings: this.state.blessings, blessingLabels: BLESSING_LABELS,
      blessingLevels: { ...(this.state.blessingLevels || {}) },
      assistMode: this.assistMode, specialCharge: player.specialCharge || 0,
      specialReady: (player.specialCharge || 0) >= 100,
      reserve: this.state.settings?.autoFireReserve ?? 25,
      target: target ? { id: target.id, hp: target.hp, maxHp: target.maxHp, locked: target.id === this.lockedTarget } : null,
      paused: this.paused && !this.pickPanel, help: this.help && !this.pickPanel,
    });
  }

  renderEffect(effect) {
    if (effect.type === 'screen-shake') {
      this.shake = { ...effect.impulse, until: performance.now() + effect.durationMs };
    } else if (effect.type === 'hit-stop') {
      this.hitStopUntil = Math.max(this.hitStopUntil || 0, performance.now() + effect.durationMs);
    } else if (effect.type === 'floating-damage') {
      const label = node('output', `az-floating-damage${effect.critical ? ' is-critical' : ''}`, String(Math.round(effect.value)));
      this.effectLayer.append(label);
      const timer = setTimeout(() => label.remove(), 650);
      this.effects.push({ kind: 'dom', value: label, timer });
    } else if (effect.type === 'particle-burst') {
      const resourceKey = effect.color in COLORS ? effect.color : 'gold';
      let resources = this.particleResources.get(resourceKey);
      if (!resources) {
        resources = {
          geometry: new THREE.SphereGeometry(0.07, 4, 3),
          material: new THREE.MeshBasicMaterial({ color: COLORS[resourceKey] }),
        };
        this.particleResources.set(resourceKey, resources);
        this.geometries.add(resources.geometry);
        this.materials.add(resources.material);
      }
      for (let i = 0; i < effect.count; i += 1) {
        const particle = new THREE.Mesh(resources.geometry, resources.material);
        particle.position.set(effect.position.x, effect.position.y, effect.position.z);
        this.scene.add(particle);
        this.effects.push({ kind: 'particle', value: particle, velocity: new THREE.Vector3((Math.random() - 0.5) * effect.spread * 7, Math.random() * 3 + 1, (Math.random() - 0.5) * effect.spread * 7), life: effect.lifetimeMs / 1000 });
      }
    }
  }

  updateEffects(dt) {
    for (const effect of this.effects) {
      if (effect.kind !== 'particle') continue;
      effect.life -= dt;
      effect.velocity.y -= 7 * dt;
      effect.value.position.addScaledVector(effect.velocity, dt);
      if (effect.life <= 0) effect.value.removeFromParent();
    }
    this.effects = this.effects.filter((effect) => effect.kind === 'dom' ? effect.value.isConnected : effect.life > 0);
  }

  /**
   * Blessing pick screen: choice of 3 with rarity, one paid reroll, and a
   * skip-for-gold exit. The sim pauses while the screen is open; every grant
   * goes through chooseBlessing/rerollChest so the QA handle stays truthful.
   */
  showPick(chest) {
     this.closePick();
     this.pickChestId = chest.id;
     this.paused = true;
     const panel = node('section', 'az-hud-panel az-dungeon-pick');
     panel.setAttribute('role', 'dialog');
     panel.setAttribute('aria-modal', 'true');
     panel.setAttribute('aria-label', 'Choose a blessing');
     panel.append(node('h2', 'az-hud-panel-title', 'Choose a blessing'));
     const rerollCost = 20 + this.state.chapter * 5;
     const list = node('div', 'az-dungeon-pick-cards');
     (chest.choices || []).forEach((choice, index) => {
       const info = BLESSING_LABELS[choice.id];
       const card = node('button', `az-dungeon-pick-card az-dungeon-rarity-${choice.rarity}`, '');
       card.setAttribute('aria-label', `${info.label}, level ${choice.level}, ${choice.rarity}. ${info.hint}. Press ${index + 1}.`);
       card.append(node('strong', 'az-dungeon-pick-name', `${index + 1}. ${info.label}`));
       card.append(node('span', 'az-dungeon-pick-meta', `${choice.rarity} · level ${choice.level}`));
       card.append(node('span', 'az-dungeon-pick-hint', info.hint));
       card.addEventListener('click', () => this.pickChoice(index));
       list.append(card);
     });
     panel.append(list);
     const actions = node('div', 'az-dungeon-pick-actions');
     const reroll = makeButton('az-dungeon-pick-reroll', `Reroll (${rerollCost} gold)`, () => this.pickReroll());
     reroll.setAttribute('aria-label', `Reroll blessings for ${rerollCost} gold`);
     const skip = makeButton('az-dungeon-pick-skip', 'Skip for gold', () => this.pickSkip());
     actions.append(reroll, skip);
     panel.append(actions);
     this.pickPanel = panel;
     this.root.append(panel);
     this.hud?.announce?.('Choose 1 of 3 blessings');
   }

   refreshPick() {
     const chest = this.state.chests.find((item) => item.id === this.pickChestId);
     if (!chest || !this.pickPanel) return;
     this.showPick(chest);
   }

   closePick() {
     this.pickPanel?.remove();
     this.pickPanel = undefined;
     this.pickChestId = undefined;
     if (this.sceneState === 'playing') this.paused = false;
     // The picked card had focus and is gone: return focus to the game root
     // so keyboard input (movement, Enter for the portal) keeps working for
     // mouse/touch players without an extra canvas click.
     if (!this.destroyed) this.root?.focus?.();
   }

   pickChoice(index) {
     const chest = this.state.chests.find((item) => item.id === this.pickChestId);
     const choice = chest?.choices?.[index];
     if (!choice) return { chosen: false };
     const result = chooseBlessing(this.state, choice.id);
     if (result.chosen) {
       this.feedback.emit('loot', { label: `${result.label} ${'◆'.repeat(result.level)}` });
       this.hud?.announce?.(`${result.label}, level ${result.level}`);
       this.closePick();
       this.persistRun();
       this.syncWorld();
       this.updateHud();
     }
     return result;
   }

   pickReroll() {
     const result = rerollChest(this.state, this.pickChestId);
     if (result.rerolled) {
       this.feedback.emit('bow', { position: { x: 0, y: 1, z: 0 } });
       this.refreshPick();
       this.updateHud();
     } else {
       this.hud?.announce?.(result.reason === 'no-gold' ? 'Not enough gold to reroll' : 'No rerolls left');
     }
     return result;
   }

   pickSkip() {
     const bonus = 10 + this.state.chapter * 2;
     this.state.player.gold += bonus;
     this.feedback.emit('loot', { label: `Skipped · +${bonus} gold` });
     this.closePick();
     this.persistRun();
     this.updateHud();
     return { skipped: true, bonus };
   }

   /** The run ledger. The 2D build showed this on its victory screen: what the
    * run amounted to. The 3D build had no win condition, so there was never a
    * moment where this could be shown.
    */
  recordMetaRun(won) {
    if (this.runRecorded) return this.meta;
    this.runRecorded = true;
    this.meta = recordRun(this.meta, {
      seed: this.state.seed, chapters: Math.min(FINAL_CHAPTER, this.state.chapter),
      bosses: this.state.stats?.bossKills || 0, heat: this.state.heat || 0,
      gold: this.state.player.gold || 0, won, blessings: [...this.state.blessings],
    });
    saveMeta(this.storage, this.meta);
    return this.meta;
  }

  showVictory() {
    this.recordMetaRun(true);
    this.sceneState = 'victory';
    this.paused = true;
    // The screen is rebuilt only once: appending a second panel would leave
    // two identical buttons stacked on top of each other, and the one on top
    // would no longer be the one the player aimed at.
    if (this.victory) return;
    const stats = this.state.stats || {};
    this.victory = node('section', 'az-hud-panel az-dungeon-victory');
    this.victory.setAttribute('role', 'dialog');
    this.victory.append(node('h2', 'az-hud-panel-title', 'The descent is complete'));
    this.victory.append(node('p', 'az-hud-panel-copy', `Aizo claims the temple floor after ${FINAL_CHAPTER} chapters.`));
    const ledger = node('dl', 'az-dungeon-ledger');
    const rows = [
      ['Chapters cleared', FINAL_CHAPTER],
      ['Enemies slain', stats.kills ?? 0],
      ['Bosses beaten', stats.bossKills ?? 0],
      ['Chests opened', stats.chestCount ?? 0],
      ['Blessings claimed', this.state.blessings.length],
      ['Melee swings', stats.meleeSwings ?? 0],
      ['Arrows loosed', stats.shotsFired ?? 0],
      ['Gold gathered', this.state.player.gold],
      ['Damage taken', stats.damageTaken ?? 0],
    ];
    rows.forEach(([label, value]) => {
      ledger.append(node('dt', 'az-dungeon-ledger-label', label));
      ledger.append(node('dd', 'az-dungeon-ledger-value', String(value)));
    });
    this.victory.append(ledger);
    const share = `Aizo cleared the descent — ${FINAL_CHAPTER} chapters, ${stats.kills ?? 0} slain, ${this.state.blessings.length} blessings (seed ${this.state.seed})`;
    const shareNode = node('p', 'az-hud-panel-copy az-dungeon-share', share);
    shareNode.setAttribute('aria-label', `Share text: ${share}`);
    this.victory.append(shareNode);
    const copy = makeButton('az-dungeon-begin', 'Copy share text', () => {
      try { navigator.clipboard?.writeText?.(share); } catch (_) {}
      this.hud?.announce?.('Share text copied');
    });
    this.victory.append(copy);
    // The descent does not end at chapter ten: what is behind the tenth door is
    // more dungeon. The docs promised an endless descent, but the only way off
    // this screen was a brand new run, so the mode was unreachable.
    this.victory.append(makeButton('az-dungeon-begin', 'Continue the descent', () => this.continueEndless()));
    this.victory.append(makeButton('az-dungeon-begin', 'Descend again', () => this.restart()));
    this.root.append(this.victory);
  }

  /**
   * Step off the victory screen and keep going. The run's chapter already
   * points past the final one, so this spawns the endless chapter the ledger
   * was won on.
   */
  continueEndless() {
    if (this.sceneState !== 'victory') return { resumed: false };
    this.victory?.remove();
    this.victory = undefined;
    this.paused = false;
    this.sceneState = 'playing';
    // The endless leg is its own run as far as the local meta is concerned.
    this.runRecorded = false;
    this.portal?.removeFromParent();
    this.portal = null;
    const chapter = Math.max(FINAL_CHAPTER + 1, this.state.chapter);
    this.state.mode = 'endless';
    this.state.status = 'between-waves';
    spawnWave(this.state, chapter);
    this.root.focus();
    this.syncWorld();
    this.updateHud();
    this.hud?.announce?.(`Endless descent — chapter ${chapter}`);
    return { resumed: true, chapter };
  }

  showDefeat() {
    this.recordMetaRun(false);
    this.sceneState = 'defeat';
    this.paused = true;
    this.closePick();
    this.defeat = node('section', 'az-hud-panel az-dungeon-defeat');
    this.defeat.setAttribute('role', 'dialog');
    this.defeat.append(node('h2', 'az-hud-panel-title', 'Aizo has fallen'));
    const stats = this.state.stats || {};
    this.defeat.append(node('p', 'az-hud-panel-copy',
      `Chapter ${this.state.chapter} · seed ${this.state.seed} · ${stats.kills ?? 0} slain · ${this.state.blessings.length} blessings`));
    this.defeat.append(node('p', 'az-hud-panel-copy', `Gold carried: ${this.state.player.gold}`));
    const actions = node('div', 'az-dungeon-pick-actions');
    actions.append(makeButton('az-dungeon-begin', 'Retry same seed (R)', () => this.retrySeed()));
    actions.append(makeButton('az-dungeon-begin', 'New descent', () => this.restart()));
    this.defeat.append(actions);
    this.root.append(this.defeat);
  }

  retrySeed() {
    const seed = this.state.seed;
    this.defeat?.remove();
    this.victory?.remove();
    this.defeat = undefined;
    this.victory = undefined;
    this.closePick();
    this.state = createGameState(seed);
    this.state.settings = { autoFireReserve: this.settings.autoFireReserve, heat: 0 };
    this.eventSeq = 0;
    this.lockedTarget = null;
    this.runRecorded = false;
    this.paused = false;
    this.sceneState = 'playing';
    this.clearEntities();
    spawnWave(this.state, 1);
    this.root.focus();
    this.syncWorld();
    this.updateHud();
    this.hud?.announce?.(`Same seed: ${seed}`);
    return { seed };
  }

  restart() {
    this.defeat?.remove();
    this.victory?.remove();
    this.defeat = undefined;
    this.victory = undefined;
    this.closePick();
    this.state = createGameState(`aizo-${Date.now()}`);
    this.eventSeq = 0;
    // A new run is a new result: without clearing this, every run after the
    // first one finished was silently missing from the local meta.
    this.runRecorded = false;
    this.lockedTarget = null;
    this.paused = false;
    this.sceneState = 'playing';
    // A fresh run invalidates the saved one.
    if (this.storage) clearPersistedRun(this.storage);
    this.restoredRun = null;
    this.clearEntities();
    spawnWave(this.state, 1);
    this.root.focus();
    this.syncWorld();
  }

  clearEntities() {
    for (const group of [this.enemyMeshes, this.projectileMeshes, this.chestMeshes, this.telegraphMeshes]) {
      for (const mesh of group.values()) mesh.removeFromParent();
      group.clear();
    }
    this.portal?.removeFromParent();
    this.portal = null;
    this.chestPositions.clear();
  }

  updateCamera(dt, time) {
    const target = this.sceneState === 'menu' ? new THREE.Vector3(0, 0.8, 0) : new THREE.Vector3(this.state.player.position.x, 0.8, this.state.player.position.z);
    const angle = this.sceneState === 'menu' ? time * 0.00012 : 0.72;
    const offset = new THREE.Vector3(Math.sin(angle) * 12, 10, Math.cos(angle) * 12);
    this.cameraTarget.lerp(target, Math.min(1, dt * 8));
    const desired = this.cameraTarget.clone().add(offset);
    this.camera.position.lerp(desired, Math.min(1, dt * 7));
    if (this.shake && performance.now() < this.shake.until) {
      this.camera.position.x += this.shake.x;
      this.camera.position.y += this.shake.y;
    }
    this.camera.lookAt(this.cameraTarget);
  }

  loop(time) {
    if (this.destroyed) return;
    const dt = frameDelta((time - this.lastTime) / 1000);
    this.lastTime = time;
    const hitStop = (this.hitStopUntil || 0) > performance.now();
    if (!hitStop && this.sceneState === 'playing' && !this.paused && !this.help && !this.hiddenPause && !this.contextLost) {
      const { steps, accumulator } = consumeFixedSteps(this.accumulator, dt);
      this.accumulator = accumulator;
      for (let i = 0; i < steps; i += 1) this.fixedTick();
    }
    this.updateEffects(dt);
    if (this.portal) this.portal.rotation.y += dt * 0.7;
    this.updateCamera(dt, time);
    this.renderer.render(this.scene, this.camera);
    this.frames += 1;
    this.raf = requestAnimationFrame((next) => this.loop(next));
  }

  resize() {
    if (!this.renderer) return;
    const width = Math.max(2, this.stage.clientWidth);
    const height = Math.max(2, this.stage.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  showRepair(title, detail) {
    this.repair?.remove();
    this.repair = node('section', 'aizanoi-dungeon3d-card');
    this.repair.setAttribute('role', 'alert');
    this.repair.append(node('strong', '', title), node('p', '', detail));
    this.root?.append(this.repair);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.loadGeneration += 1;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    clearTimeout(this.damageTimer);
    this.resizeObserver?.disconnect();
    this.resetInput();
    this.disposers.splice(0).forEach((dispose) => { try { dispose(); } catch (_) {} });
    this.effects.forEach((effect) => { clearTimeout(effect.timer); effect.value?.remove?.(); effect.value?.removeFromParent?.(); });
    this.feedback?.clear();
    this.audio?.destroy();
    this.hud?.destroy();
    this.releaseStylesheet();
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
    this.geometries.clear();
    this.materials.clear();
    this.renderer?.dispose();
    if (typeof window !== 'undefined' && window.AIZANOI_DUNGEON_GAME === this.qaHandle) window.AIZANOI_DUNGEON_GAME = undefined;
    this.root?.remove();
  }
}
