import * as THREE from '../../../../../../worlds/shared/vendor/three.module.js';
import { GLTFLoader } from '../../../../../../worlds/shared/vendor/GLTFLoader.js';
import { createGameState, stepGame, spawnWave, openChest, chooseBlessing, rerollChest, buyShopItem, savePersistedRun, loadPersistedRun, clearPersistedRun, BLESSING_LABELS, FINAL_CHAPTER, arenaObstacles, ARENA_IDS } from '../game/index.js';
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
  // First-person viewmodel weapons. They are the same sculpts the hero
  // carries, so the thing in the player's hands matches the thing on the
  // title screen instead of a generic placeholder.
  sword: 'weapon_sword.glb', bow: 'weapon_bow.glb',
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
// Eye height in metres: the hero sculpt is 1.9m tall, so the camera sits at
// human eye level and the avatar's body is hidden to avoid seeing its insides.
const EYE_HEIGHT = 1.62;
const LOOK_PITCH_LIMIT = Math.PI / 2 - 0.06;
const COLORS = Object.freeze({ bronze: 0xc28a45, ember: 0xff5a22, gold: 0xffcf5a, mist: 0xb8d8e8, blood: 0xb52d2b, arcane: 0x936dff });

function node(tag, className, text) {
  const value = document.createElement(tag);
  value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

/**
 * How far a sculpt's lowest point sits below its own origin, in metres.
 *
 * Assets are modelled around a centre, so `position.y = 0` can bury a model by
 * more than a metre. Measuring the bounding box once at load is cheaper and
 * more reliable than hand-tuning a per-asset constant that silently rots when
 * an asset is replaced.
 */
export function modelGroundOffset(root, { align = 'bottom' } = {}) {
  try {
    const box = new THREE.Box3().setFromObject(root);
    if (!Number.isFinite(box.min.y) || !Number.isFinite(box.max.y)) return 0;
    // 'bottom' rests the lowest point of the model on the floor; 'top' lifts
    // it until its highest point is the floor, which is what a slab needs.
    return align === 'top' ? -box.max.y : Math.max(0, -box.min.y);
  } catch (_) {
    return 0;
  }
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

const NATIVE_CONTROL = 'input, select, textarea, button, [contenteditable="true"]';
const TABBABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const osReducedMotion = () => { try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; } };

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
    // A fine pointer means a mouse: only then is pointer lock the right
    // first-person input. Touch devices drag to look.
    this.hasFinePointer = (() => { try { return Boolean(globalThis.matchMedia?.('(pointer: fine)').matches); } catch (_) { return !coarsePointer; } })();
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
    // Room-owned resources: everything a single arena build makes for itself
    // and releases again when the arena changes. The loaded sculpts are not
    // among them: they are shared by every arena and owned by the templates.
    this.roomGeometries = new Set();
    this.roomMaterials = new Set();
    this.roomFields = [];
    this.templates = new Map();
    this.particleResources = new Map();
    // First-person look state. Yaw/pitch are the source of truth for aiming;
    // the camera rotation is derived from them every frame.
    this.look = { yaw: 0, pitch: -0.04 };
    this.lookDelta = { x: 0, y: 0 };
    this.lookDrag = null;
    this.hadLookLock = false;
    this.lookLockReleasedAt = 0;
    this.pointerLockBlocked = false;
    this.walkPhase = 0;
    this.groundOffsets = new Map();
    this.lockLostAt = 0;
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
      this.buildViewmodel();
      this.installInput();
      this.resize();
      this.applySettings();
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
    this.releaseEnvironment();
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
    this.settingsFab = makeButton('az-dungeon-settings-fab', '⚙', () => this.showSettings());
    this.settingsFab.setAttribute('aria-label', 'Open dungeon settings');
    this.menu = node('section', 'az-dungeon-menu');
    this.menu.append(node('h1', 'az-dungeon-menu-title', 'Aizanoi Dungeon'));
    this.menu.append(node('p', 'az-dungeon-menu-sub', 'Aizo awakens beneath the temple. Survive the descent, claim the blessing, enter the portal.'));
    this.beginButton = makeButton('az-dungeon-begin', 'Begin', () => this.begin());
    this.menu.append(this.beginButton);
    this.dailyButton = makeButton('az-dungeon-menu-option az-dungeon-daily', `Daily descent · ${this.dailySeed}`, () => this.beginDaily());
    this.dailyButton.setAttribute('aria-label', `Start the daily descent, seed ${this.dailySeed}`);
    this.menu.append(this.dailyButton);
    this.newSeedButton = makeButton('az-dungeon-menu-option az-dungeon-new-seed', 'New descent', () => this.begin(`aizo-${Date.now()}`));
    this.newSeedButton.setAttribute('aria-label', 'Start a new descent with a fresh seed');
    this.menu.append(this.newSeedButton);
    this.settingsButton = makeButton('az-dungeon-menu-option az-dungeon-settings-open', 'Settings', () => this.showSettings());
    this.settingsButton.setAttribute('aria-label', 'Open dungeon settings');
    this.menu.append(this.settingsButton);
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
    this.root.append(this.stage, this.effectLayer, this.touchControls, this.exitButton, this.settingsFab, this.menu);
    this.container.append(this.root);
    this.hud = createHud({ container: this.root, onAssistMode: () => this.cycleAssistMode() });
    // The pause panel needs a button of its own: Escape is not an option on
    // a touch device, and a player who paused by losing the mouse pointer
    // must be able to come back without a keyboard.
    const resume = makeButton('az-hud-resume', 'Resume', () => this.togglePause());
    this.hud.elements.pause.append(resume);
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
    this.renderer.toneMappingExposure = 0.94;
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
    this.scene.background = new THREE.Color(0x070809);
    // First-person fog starts a few paces out: the arena falls into the dark
    // before its outer wall, which is what makes a dungeon read as enclosed
    // instead of as a diorama on a table.
    this.scene.fog = new THREE.Fog(0x0a0b0d, 11, 33);
    // A first-person field of view. 74° keeps the room readable without the
    // edge smear a 90° lens gives the colonnade.
    this.camera = new THREE.PerspectiveCamera(74, 1, 0.06, 90);
    // YXZ is the FPS order: yaw about world up, then pitch about the camera's
    // own right axis, so the horizon never rolls while both are applied.
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(7, 7, 9);
    this.cameraTarget = new THREE.Vector3();
    // The camera is part of the graph: the viewmodel, the torch and the sway
    // are its children, so it has to be in the scene to render them.
    this.scene.add(this.camera);
    // Cool sky fill against a warm ground bounce: the key/fill split gives the
    // stone a direction instead of a flat wash.
    this.scene.add(new THREE.HemisphereLight(0x6f7f9b, 0x140d07, 0.3));
    const moon = new THREE.DirectionalLight(0xffd9a4, 0.95);
    moon.position.set(7, 14, 5);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = -22;
    moon.shadow.camera.right = 22;
    moon.shadow.camera.top = 22;
    moon.shadow.camera.bottom = -22;
    moon.shadow.bias = -0.0012;
    this.scene.add(moon);
    // A cold rim from the opposite side separates the hero and the enemies
    // from the floor without washing the arena out.
    const rim = new THREE.DirectionalLight(0x7fa8d8, 0.3);
    rim.position.set(-9, 7, -8);
    this.scene.add(rim);
    // The player's own flame: a warm point light carried at hand height. It
    // is what makes doorways and walls pop as you walk past them in first
    // person, and it keeps the corridor ahead from being unreadable. It sits
    // slightly ahead of the lens so the weapon in view is not blown out by it.
    this.torch = new THREE.PointLight(0xffb070, 2.2, 16, 2);
    this.torch.position.set(0.22, -0.06, -0.35);
    this.camera.add(this.torch);
    this.room = new THREE.Group();
    this.dynamic = new THREE.Group();
    this.scene.add(this.room, this.dynamic);
    this.buildEnvironment();
    this.buildDust();
  }

  /**
   * A procedural sky/ember environment, generated into a canvas and filtered
   * with PMREM. No network request and no CDN: the dungeon has to keep
   * working under the CSP that forbids remote assets.
   */
  buildEnvironment() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const sky = ctx.createLinearGradient(0, 0, 0, 256);
      sky.addColorStop(0, '#1b2638');
      sky.addColorStop(0.42, '#2a2b33');
      sky.addColorStop(0.58, '#3a2a1c');
      sky.addColorStop(1, '#120c07');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, 512, 256);
      // Ember pools along the horizon stand in for the braziers, so polished
      // stone picks up a warm bounce from the right direction.
      const pools = [[90, 168, 46, 'rgba(255,138,48,0.55)'], [300, 172, 60, 'rgba(255,120,40,0.45)'], [430, 158, 38, 'rgba(255,170,80,0.4)']];
      for (const [x, y, r, tint] of pools) {
        const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
        glow.addColorStop(0, tint);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      pmrem.compileEquirectangularShader?.();
      const target = pmrem.fromEquirectangular(texture);
      pmrem.dispose();
      texture.dispose();
      // The render target owns the filtered environment texture, so the
      // target has to be kept: releasing only the texture would leave the
      // target's framebuffer on the GPU forever.
      this.environmentTarget = target;
      this.environment = target.texture;
      this.scene.environment = this.environment;
    } catch (error) {
      console.warn('[Aizanoi Dungeon] Environment map unavailable:', error);
    }
  }

  /**
   * Release the generated environment map.
   *
   * The PMREM render target is not owned by the renderer, so it has to be
   * released by hand together with the texture it carries.
   */
  releaseEnvironment() {
    this.environmentTarget?.dispose?.();
    this.environmentTarget = undefined;
    this.environment?.dispose?.();
    this.environment = undefined;
    if (this.scene) this.scene.environment = null;
  }

  /**
   * Slow dust in the air. A few hundred points are enough to make the volume
   * of the room visible and to sell the torch light, and they cost one draw.
   */
  buildDust() {
    const count = 260;
    const positions = new Float32Array(count * 3);
    const drift = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 34;
      positions[i * 3 + 1] = 0.15 + Math.random() * 4.4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 34;
      drift[i * 3] = (Math.random() - 0.5) * 0.09;
      drift[i * 3 + 1] = 0.03 + Math.random() * 0.07;
      drift[i * 3 + 2] = (Math.random() - 0.5) * 0.09;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const sprite = document.createElement('canvas');
    sprite.width = 32;
    sprite.height = 32;
    const ctx = sprite.getContext('2d');
    if (ctx) {
      const dot = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      dot.addColorStop(0, 'rgba(255,240,214,1)');
      dot.addColorStop(0.45, 'rgba(255,222,170,0.55)');
      dot.addColorStop(1, 'rgba(255,222,170,0)');
      ctx.fillStyle = dot;
      ctx.fillRect(0, 0, 32, 32);
    }
    const material = new THREE.PointsMaterial({
      color: 0xffe6c0, size: 0.055, map: new THREE.CanvasTexture(sprite),
      transparent: true, opacity: 0.38, depthWrite: false, sizeAttenuation: true,
    });
    material.map.colorSpace = THREE.SRGBColorSpace;
    const dust = new THREE.Points(geometry, material);
    dust.frustumCulled = false;
    this.scene.add(dust);
    this.dust = dust;
    this.dustDrift = drift;
    // The sprite is a texture the material carries: disposing the material
    // does not release it, so the dust keeps its own handle for teardown.
    this.dustTexture = material.map;
    this.geometries.add(geometry);
    this.materials.add(material);
  }

  /**
   * First-person viewmodel: the hero's own sword and bow held low-right.
   *
   * The weapon is drawn in its own scene with its own lights and a slightly
   * narrower lens, then composited over the world after the depth buffer is
   * cleared. That is the standard first-person arrangement: the flame in the
   * player's hand is a hand's breadth away from the blade, and a shared
   * light would either blow the weapon out to white or leave the world
   * pitch dark. Here the weapon is lit for the eye, not for the physics.
   */
  buildViewmodel() {
    this.viewScene = new THREE.Scene();
    this.viewCamera = new THREE.PerspectiveCamera(55, 1, 0.01, 6);
    const rig = new THREE.Group();
    rig.position.set(0.36, -0.34, -0.66);
    const sword = new THREE.Group();
    const blade = this.clone('sword');
    blade.scale.setScalar(0.33);
    blade.position.set(0.05, -0.02, 0.02);
    blade.rotation.set(-0.16, -0.25, 0.1);
    sword.add(blade);
    const bow = new THREE.Group();
    const arc = this.clone('bow');
    arc.scale.setScalar(0.7);
    arc.position.set(0.03, -0.03, -0.16);
    arc.rotation.set(0, 0.1, -0.28);
    bow.add(arc);
    bow.visible = false;
    // A simple wrapped forearm: procedural, so no extra asset has to load,
    // and dark enough that it never competes with the blade.
    const armGeometry = new THREE.BoxGeometry(0.06, 0.06, 0.32);
    const armMaterial = new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 0.92, metalness: 0.05 });
    const arm = new THREE.Mesh(armGeometry, armMaterial);
    arm.position.set(0.07, -0.12, 0.18);
    arm.rotation.set(0.44, -0.16, 0.16);
    sword.add(arm);
    this.geometries.add(armGeometry);
    this.materials.add(armMaterial);
    // The sculpt's own metal is nearly pure metal, which in a room this dark
    // reads as a black cut-out. Pulling the metalness back and lifting the
    // roughness keeps the blade legible without turning it into plastic.
    const refine = (root) => root.traverse((object) => {
      if (!object.isMesh) return;
      const source = Array.isArray(object.material) ? object.material[0] : object.material;
      if (!source) return;
      const material = source.clone();
      if (typeof material.metalness === 'number') material.metalness = Math.min(0.5, material.metalness);
      if (typeof material.roughness === 'number') material.roughness = Math.max(0.32, material.roughness);
      if ('envMapIntensity' in material) material.envMapIntensity = 0.3;
      object.material = material;
      this.materials.add(material);
    });
    refine(sword);
    refine(bow);
    rig.add(sword, bow);
    // The holder carries the camera's pose; the rig inside it keeps the
    // weapon's offset in camera space, so the blade stays in the player's
    // hand no matter where the player turns.
    this.viewHolder = new THREE.Group();
    this.viewHolder.add(rig);
    this.viewScene.add(this.viewHolder);
    // The weapon's own three-point rig: a warm key from the flame, a cold
    // rim from the dark and a soft fill so the leather keeps its form.
    const key = new THREE.DirectionalLight(0xfff4e2, 3);
    key.position.set(0.6, 0.9, 0.5);
    this.viewScene.add(key);
    const rim = new THREE.DirectionalLight(0x93a8c4, 0.9);
    rim.position.set(-0.9, 0.3, -0.7);
    this.viewScene.add(rim);
    const flame = new THREE.PointLight(0xffb070, 1.6, 3.5, 2);
    flame.position.set(0.24, -0.12, 0.1);
    this.viewScene.add(flame);
    this.viewScene.add(new THREE.HemisphereLight(0x7d8ea8, 0x241a12, 0.7));
    this.viewmodel = rig;
    this.viewmodelSword = sword;
    this.viewmodelBow = bow;
    this.viewmodelBase = rig.position.clone();
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
      // Measure the sculpt once: the height of its lowest point is the lift
      // that puts its feet on the floor (see clone()). The floor slab is the
      // exception — it is measured from the top, so the walking surface is
      // exactly y=0 and nothing sinks into the stone.
      this.groundOffsets.set(key, modelGroundOffset(gltf.scene, { align: key === 'floor' ? 'top' : 'bottom' }));
      this.normalizeMaterials(gltf.scene);
      this.templates.set(key, gltf.scene);
    }));
  }

  /**
   * Give every imported surface a common finish. The sculpts are hand-authored
   * and arrive with wildly different roughness, so a single pass lands them on
   * the same stone-with-candlelight look and lets the generated environment
   * map do the work instead of adding more lights.
   */
  normalizeMaterials(root) {
    const seen = new Set();
    root.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const list = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      for (const material of list) {
        if (!material || seen.has(material)) continue;
        seen.add(material);
        if ('envMapIntensity' in material) material.envMapIntensity = 0.6;
        if (typeof material.roughness === 'number') material.roughness = Math.max(0.44, Math.min(1, material.roughness));
        if (typeof material.metalness === 'number') material.metalness = Math.min(0.5, Math.max(0, material.metalness));
        material.dithering = true;
        material.needsUpdate = true;
      }
    });
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
    // Each sculpt is authored around its own origin, not its feet: the wall
    // block's centre sits 1.27m above its base, the column's 1.15m. Baking the
    // measured lift into an inner node keeps every call site honest — a
    // placement of y=0 now means "standing on the floor", not "half buried".
    const lift = this.groundOffsets.get(key) || 0;
    model.position.y += lift;
    const wrapper = new THREE.Group();
    wrapper.add(model);
    wrapper.userData.asset = key;
    wrapper.userData.groundY = lift;
    return wrapper;
  }

  buildRoom(arenaId = this.state?.arena || 'column-ring') {
    const arena = ARENA_IDS.includes(arenaId) ? arenaId : 'column-ring';
    // A new arena is a new room: drop the old one so layouts never stack,
    // and release everything the old one owned.
    this.disposeRoom();
    try {
      this.buildRoomContents(arena);
    } catch (error) {
      // A half-built room leaks with extra steps: release the partial build
      // so the next attempt starts from a clean slate instead of stacking a
      // broken room on top of a broken one.
      this.disposeRoom();
      this.arenaBuilt = undefined;
      throw error;
    }
    this.arenaBuilt = arena;
  }

  /**
   * Release everything one room build owns.
   *
   * A room owns the instanced fields it drew, the materials it cloned for
   * them and the geometry it generated itself (the vault, the beams, the
   * water, the dais). The loaded sculpts do not belong to the room: every
   * arena shares them and the templates own them, so they stay alive across
   * rebuilds and are never disposed here.
   */
  disposeRoom() {
    while (this.room?.children.length) this.room.children[0].removeFromParent();
    for (const field of this.roomFields) {
      // The field owns its instance buffers; the geometry it draws with
      // belongs to the template and stays.
      try { field.dispose(); } catch (_) {}
    }
    this.roomFields.length = 0;
    const shared = this.templateResources();
    for (const geometry of this.roomGeometries) {
      if (shared.geometries.has(geometry)) continue;
      geometry.dispose();
      this.geometries.delete(geometry);
    }
    this.roomGeometries.clear();
    for (const material of this.roomMaterials) {
      if (shared.materials.has(material)) continue;
      material.dispose();
      this.materials.delete(material);
    }
    this.roomMaterials.clear();
  }

  /**
   * Every geometry and material the loaded sculpts own.
   *
   * The room shares these resources, so nothing reachable from the templates
   * may be disposed with a room. The check is by identity: a material cloned
   * for a room is a different object and stays disposable.
   */
  templateResources() {
    const geometries = new Set();
    const materials = new Set();
    for (const template of this.templates.values()) {
      template.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        const owned = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
        owned.forEach((material) => materials.add(material));
      });
    }
    return { geometries, materials };
  }

  /** Build one arena's room: the instanced shell, the doorway, the ceiling and the arena's own set pieces. */
  buildRoomContents(arena) {
    // Floor value hierarchy: alternate two low-contrast tones so the room
    // reads as stone, not a buzzing checkerboard, with a per-arena cast.
    // Parity materials are shared across all tiles of a build (two clones per
    // source material), so a rebuild disposes a handful, not hundreds.
    const casts = {
      'column-ring': 0xffffff, 'broken-bridge': 0xbfd4dd,
      'brazier-court': 0xffd9b0, 'collapsing-tiles': 0xd8d2c4, 'ruined-stairs': 0xe2d6b8,
    };
    // Floor and walls are placed as instanced fields. Every floor plate is
    // ten meshes and every wall block is fifteen, so drawing them one by one
    // cost well over a thousand draw calls per room and stretched the sculpts
    // to twice their size to fit a wrong grid. Instancing keeps the original
    // proportions, tints every plate individually, and draws the whole shell
    // in a couple of dozen calls.
    const cast = new THREE.Color(casts[arena] || 0xffffff);
    const plateEven = new THREE.Color(0.78, 0.79, 0.83).lerp(cast, 0.12);
    const plateOdd = new THREE.Color(0.58, 0.6, 0.66).lerp(cast, 0.12);
    const plates = [];
    // The plate is 2.4m square; seventeen plates per side cover the 38m room.
    for (let x = -8; x <= 8; x += 1) {
      for (let z = -8; z <= 8; z += 1) {
        const jitter = Math.abs((x * 73856093) ^ (z * 19349663)) % 4;
        plates.push({
          x: x * 2.4, z: z * 2.4,
          rotation: jitter * (Math.PI / 2),
          y: (jitter % 3) * 0.004,
          color: (x + z) % 2 === 0 ? plateEven : plateOdd,
        });
      }
    }
    this.buildInstancedField('floor', plates);
    // The wall block is 2.55m wide and 2.55m tall, so the ring steps 2.55m
    // and the arcade is two tiers high: the room closes overhead instead of
    // opening onto a black void.
    const walls = [];
    for (let i = -7; i <= 7; i += 1) {
      for (const [x, z, rotation] of [[i * 2.55, -19.1, 0], [i * 2.55, 19.1, 0], [-19.1, i * 2.55, Math.PI / 2], [19.1, i * 2.55, Math.PI / 2]]) {
        if (z === -19.1 && Math.abs(x) < 1.3) continue;
        walls.push({ x, z, rotation });
        walls.push({ x, z, rotation, y: 2.55 });
      }
    }
    this.buildInstancedField('wall', walls);
    const doorway = this.clone('doorway');
    doorway.position.set(0, 0, -19.1);
    this.room.add(doorway);
    this.buildCeiling();
    // Obstacles follow the simulation's arena layout, kind by kind.
    // Point lights are capped: the brazier court fields twenty braziers and
    // a forward renderer cannot afford a light per flame.
    let fires = 0;
    for (const obstacle of arenaObstacles(arena)) {
      if (obstacle.kind === 'column') {
        const column = this.clone('column');
        column.position.set(obstacle.x, 0, obstacle.z);
        this.room.add(column);
      } else if (obstacle.kind === 'brazier') {
        const brazier = this.clone('brazier');
        brazier.position.set(obstacle.x, 0, obstacle.z);
        this.room.add(brazier);
        if (fires < 4) {
          fires += 1;
          // Tighter, warmer pools: the fire lights the brazier and its
          // immediate ring, and leaves the rest of the floor in shadow. The
          // flame sits just above the measured bowl height (1.3m).
          const fire = new THREE.PointLight(0xff7a2e, 3.6, 8.5, 2);
          fire.position.set(obstacle.x, 1.42, obstacle.z);
          this.room.add(fire);
        }
      } else if (obstacle.kind === 'rubble') {
        const block = this.clone('wall');
        block.position.set(obstacle.x, 0, obstacle.z);
        block.rotation.y = (obstacle.x + obstacle.z) * 0.7;
        block.scale.set(0.6, 0.34, 0.6);
        this.room.add(block);
      } else if (obstacle.kind === 'stair') {
        const step = this.clone('column');
        step.position.set(obstacle.x, 0, obstacle.z);
        step.scale.set(1.4, 0.45, 1.4);
        this.room.add(step);
      }
    }
    if (arena === 'broken-bridge') {
      // Slow water across the middle band.
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(36, 7),
        new THREE.MeshStandardMaterial({ color: 0x1d4e5f, transparent: true, opacity: 0.72, roughness: 0.25, metalness: 0.1 }),
      );
      water.rotation.x = -Math.PI / 2;
      water.position.set(0, 0.03, 0);
      water.receiveShadow = true;
      this.room.add(water);
      // The water belongs to this room: it is released with the room and
      // never outlives the arena that made it.
      this.roomGeometries.add(water.geometry);
      this.roomMaterials.add(water.material);
      this.geometries.add(water.geometry);
      this.materials.add(water.material);
    }
    if (arena === 'ruined-stairs') {
      // The central dais: high ground worth holding.
      const dais = new THREE.Mesh(
        new THREE.CylinderGeometry(4.5, 5, 0.5, 24),
        new THREE.MeshStandardMaterial({ color: 0x8a6f45, roughness: 0.8 }),
      );
      dais.position.set(0, 0.22, 0);
      dais.receiveShadow = true;
      this.room.add(dais);
      this.roomGeometries.add(dais.geometry);
      this.roomMaterials.add(dais.material);
      this.geometries.add(dais.geometry);
      this.materials.add(dais.material);
    }
  }

  /** Rebuild the room when the descent moves to a new arena. */
  rebuildRoom(arenaId) {
    if (!this.room || this.arenaBuilt === arenaId) return { rebuilt: false, arena: this.arenaBuilt };
    try {
      this.buildRoom(arenaId);
    } catch (error) {
      // A room that could not be built must not take the run down with it:
      // the failure is reported and the next arena change tries again.
      console.error('[Aizanoi Dungeon] Arena rebuild failed:', error);
      return { rebuilt: false, arena: this.arenaBuilt, failed: true };
    }
    return { rebuilt: true, arena: this.arenaBuilt };
  }

  /**
   * Place a room asset as an instanced field.
   *
   * The asset's own node transforms are baked into the instance matrices, so
   * the sculpt is drawn exactly as authored: no scaling, no stretching, no
   * lost detail. Each placement may carry its own colour, which is how the
   * floor keeps its checker of weathered stone without a second material.
   */
  buildInstancedField(key, placements) {
    const template = this.templates.get(key);
    if (!template || !placements.length) return 0;
    template.updateMatrixWorld(true);
    const rootInverse = new THREE.Matrix4().copy(template.matrixWorld).invert();
    const lift = this.groundOffsets.get(key) || 0;
    const parts = [];
    template.traverse((node) => {
      if (!node.isMesh || !node.geometry) return;
      const material = Array.isArray(node.material) ? node.material[0] : node.material;
      if (!material) return;
      parts.push({
        geometry: node.geometry,
        material,
        local: new THREE.Matrix4().multiplyMatrices(rootInverse, node.matrixWorld),
      });
    });
    for (const part of parts) {
      const material = part.material.clone();
      material.envMapIntensity = 0.6;
      // The clone belongs to the room and dies with it. The geometry it
      // draws with is the template's and outlives every rebuild.
      this.roomMaterials.add(material);
      this.materials.add(material);
      const field = new THREE.InstancedMesh(part.geometry, material, placements.length);
      field.castShadow = true;
      field.receiveShadow = true;
      field.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      const matrix = new THREE.Matrix4();
      const quaternion = new THREE.Quaternion();
      const euler = new THREE.Euler();
      const position = new THREE.Vector3();
      const scale = new THREE.Vector3();
      placements.forEach((placement, index) => {
        euler.set(0, placement.rotation || 0, 0);
        quaternion.setFromEuler(euler);
        position.set(placement.x || 0, (placement.y || 0) + lift, placement.z || 0);
        scale.set(placement.scaleX || 1, placement.scaleY || 1, placement.scaleZ || 1);
        matrix.compose(position, quaternion, scale);
        matrix.multiply(part.local);
        field.setMatrixAt(index, matrix);
        if (placement.color) field.setColorAt(index, placement.color);
      });
      field.instanceMatrix.needsUpdate = true;
      if (field.instanceColor) field.instanceColor.needsUpdate = true;
      this.room.add(field);
      // The field owns its instance buffers, so a rebuild has to release
      // them: dropping the mesh alone would leak the per-instance attributes.
      this.roomFields.push(field);
    }
    return parts.length;
  }

  /**
   * Close the room overhead. A first-person camera spends half its frame
   * looking up; without a ceiling that half is a black void with a hard edge
   * where the walls stop. The vault sits above the two-tier arcade and the
   * beams break the flat span.
   */
  buildCeiling() {
    const height = 5.1;
    const material = new THREE.MeshStandardMaterial({ color: 0x2e251c, roughness: 0.95, metalness: 0 });
    const vault = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), material);
    vault.rotation.x = Math.PI / 2;
    vault.position.y = height;
    // The vault must not shadow the room: the moon still reaches the floor,
    // and the braziers and the player's own flame do the rest.
    vault.castShadow = false;
    vault.receiveShadow = false;
    this.room.add(vault);
    // The vault and its beams are made in code, so the room owns them: they
    // are released with the room instead of piling up in the global sets.
    this.roomGeometries.add(vault.geometry);
    this.roomMaterials.add(material);
    this.geometries.add(vault.geometry);
    this.materials.add(material);
    const beamMaterial = new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: 0.85, metalness: 0.05 });
    const beamGeometry = new THREE.BoxGeometry(42, 0.42, 0.5);
    for (let i = -3; i <= 3; i += 1) {
      const beam = new THREE.Mesh(beamGeometry, beamMaterial);
      beam.position.set(0, height - 0.26, i * 6.4);
      beam.castShadow = true;
      beam.receiveShadow = true;
      this.room.add(beam);
    }
    this.roomGeometries.add(beamGeometry);
    this.roomMaterials.add(beamMaterial);
    this.geometries.add(beamGeometry);
    this.materials.add(beamMaterial);
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
      get seed() { return app.state.seed; },
      get dailySeed() { return app.dailySeed; },
      get settings() { return Object.freeze({ ...(app.settings || {}) }); },
      // The first-person look state, read-only. A browser test can check that
      // the camera answered the mouse without reaching into the runtime.
      get look() { return Object.freeze({ yaw: app.look.yaw, pitch: app.look.pitch, pointerLocked: document.pointerLockElement === app.renderer?.domElement }); },
      // Render counters, read-only. A browser test can check that the arena
      // still draws in a sane number of calls after the room was rebuilt.
      get render() { return Object.freeze({ calls: app.worldCalls ?? 0, triangles: app.worldTriangles ?? 0, geometries: app.renderer?.info?.memory?.geometries ?? 0, textures: app.renderer?.info?.memory?.textures ?? 0 }); },
      get arenaBuilt() { return app.arenaBuilt; },
      get slowMo() { return (app.slowMoUntil || 0) > performance.now(); },
      get spawnMarkers() { return app.spawnMeshes ? app.spawnMeshes.size : 0; },
      get hazardMarkers() { return app.hazardMeshes ? app.hazardMeshes.size : 0; },
      get eliteMarkers() { return app.eliteMeshes ? app.eliteMeshes.size : 0; },
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
      /** Walk toward a world coordinate with the real movement input. */
      qaWalkTo(x, z) {
        const player = app.state.player.position;
        const dx = x - player.x;
        const dz = z - player.z;
        const length = Math.hypot(dx, dz) || 1;
        if (length <= 0.6) { app.touchMove = null; app.qaWalkCoord = null; return { arrived: true, distance: length }; }
        const forward = new THREE.Vector3();
        app.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
        const worldX = dx / length;
        const worldZ = dz / length;
        const horizontal = worldX * right.x + worldZ * right.z;
        const vertical = worldX * forward.x + worldZ * forward.z;
        app.touchMove = { x: horizontal, z: -vertical };
        app.qaWalkCoord = { x, z, until: app.state.time + 12 };
        return { arrived: false, distance: length };
      },
      /**
       * The current interactable: the unopened chest's position, else the
       * portal's, else null. Read-only; the player still walks there for real.
       */
      get objective() {
        const chest = app.state.chests.find((item) => !item.opened);
        if (chest) {
          const position = app.chestPositions.get(chest.id) || chest.position;
          if (position) return { kind: 'chest', x: position.x, z: position.z };
        }
        if (app.portal) return { kind: 'portal', x: app.portal.position.x, z: app.portal.position.z };
        return null;
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
        // The exit portal is runtime state, not serialized: materialize it
        // the way the chest-open path does, or the run stalls between waves.
        if (result.opened && app.state.portal?.pending && app.state.portal.position) {
          app.spawnPortal(app.state.portal.position);
        }
        app.persistRun();
        app.syncWorld();
        app.updateHud();
        if (result.victory === true) app.showVictory();
        // openChest just emitted the victory event that the render loop would
        // otherwise consume on a later frame. The panel is already up, so drain
        // it now: the showVictory guard makes this a display no-op, and no
        // stale victory event can re-open the panel after the run continues.
        app.processEvents();
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
    try {
      const query = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
      if (query?.addEventListener) {
        const changed = () => this.applySettings();
        query.addEventListener('change', changed);
        this.disposers.push(() => query.removeEventListener('change', changed));
      }
    } catch (_) {}
    const hasFocus = () => this.root.contains(document.activeElement) || document.activeElement === this.root;
    const keydown = (event) => {
      if (!hasFocus()) return;
      // Modal surfaces own Tab: keep focus inside the topmost one.
      if (event.code === 'Tab' && this.modal) { this.trapTab(event); return; }
      if (!CONSUMED_KEYS.has(event.code)) return;
      // Native controls keep their own keys (range arrows, select options,
      // button Space/Enter). Only Escape and the modal shortcuts get through.
      const target = event.target instanceof Element ? event.target : null;
      const native = Boolean(target?.matches?.(NATIVE_CONTROL));
      if (native && (event.code === 'Space' || event.code === 'Enter')) return;
      if (native && event.code.startsWith('Arrow') && target.matches('input, select, textarea')) return;
      if (this.settingsPanel) {
        if (event.code === 'Escape' && !event.repeat) { event.preventDefault(); this.closeSettings(); }
        return;
      }
      if (this.pickPanel) {
        if (this.pickHidden) return;
        event.preventDefault();
        if (!event.repeat && (event.code === 'Digit1' || event.code === 'Numpad1')) { this.pickChoice(0); return; }
        if (!event.repeat && (event.code === 'Digit2' || event.code === 'Numpad2')) { this.pickChoice(1); return; }
        if (!event.repeat && (event.code === 'Digit3' || event.code === 'Numpad3')) { this.pickChoice(2); return; }
        if (!event.repeat && event.code === 'KeyR') { this.pickReroll(); return; }
        // Escape never sells the pending blessing: the draft owns the modal
        // until the player chooses, rerolls, or explicitly skips for gold.
        // It can only be set aside with "Decide later", which keeps it pending.
        if (event.code === 'Escape' && !event.repeat) {
          this.hud?.announce?.('Choose a blessing, reroll, Skip for gold, or Decide later');
          return;
        }
        return;
      }
      event.preventDefault();
      if (this.sceneState === 'defeat' && !event.repeat && event.code === 'KeyR') { this.retrySeed(); return; }
      if (event.code === 'Escape' && !event.repeat) {
        // The Escape that released the pointer lock also pauses the game.
        // If that same keypress is delivered to the page it must not undo the
        // pause, so it is swallowed inside a short window. A later Escape
        // always resumes. A modal owns its own Escape handling, so the
        // window never applies while one is open.
        if (!this.modal && performance.now() - (this.lockLostAt || 0) < 250) return;
        this.togglePause();
      }
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
      const target = event.target instanceof Element ? event.target : null;
      if (CONSUMED_KEYS.has(event.code) && hasFocus() && !target?.closest(NATIVE_CONTROL) && !this.settingsPanel) event.preventDefault();
      this.keys.delete(event.code);
      if (event.code === 'KeyJ') this.keys.delete('KeyJ');
      if (event.code === 'KeyK') this.keys.delete('KeyK');
      if (event.code === 'KeyL') this.keys.delete('KeyL');
    };
    const canvas = this.renderer.domElement;
    const isLocked = () => document.pointerLockElement === canvas;
    const mouseMove = (event) => {
      if (!isLocked() || this.sceneState !== 'playing' || this.paused || this.help || this.modal) return;
      // While locked the pointer is captured: movementX/Y is the whole input.
      this.applyLook(event.movementX || 0, event.movementY || 0);
    };
    const pointerMove = (event) => {
      const drag = this.lookDrag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      // A drag belongs to the running game: while an overlay owns the
      // screen the camera must not turn behind it.
      if (this.sceneState !== 'playing' || this.paused || this.help || this.modal) return;
      // Under pointer lock the cursor has no screen position: the only
      // meaningful delta is the movement the browser reports.
      const locked = isLocked();
      const dx = locked ? (event.movementX || 0) : event.clientX - drag.x;
      const dy = locked ? (event.movementY || 0) : event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.moved += Math.hypot(dx, dy);
      // Drag-look is the fallback when pointer lock is unavailable (iframes,
      // denied gesture). Touch gets a slightly faster constant because a thumb
      // travels a shorter distance than a mouse across the same view.
      if (drag.moved > 4) this.applyLook(dx, dy, drag.tap ? 1.5 : 1);
    };
    const pointerUp = (event) => {
      const drag = this.lookDrag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      this.lookDrag = null;
      try { canvas.releasePointerCapture?.(event.pointerId); } catch (_) {}
      // A tap is still an attack; a drag was a look and must not swing.
      if (drag.tap && drag.moved <= 4 && this.sceneState === 'playing' && !this.paused && !this.help && !this.modal) {
        this.pendingAttack = true;
        this.pendingInteract = true;
      }
    };
    const pointerCancel = (event) => {
      const drag = this.lookDrag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      // A cancelled pointer is never a tap: the gesture was taken away
      // (a system gesture, a context menu, the page losing focus), so it
      // must never swing the sword.
      this.lookDrag = null;
      try { canvas.releasePointerCapture?.(event.pointerId); } catch (_) {}
    };
    const pointer = (event) => {
      // An overlay owns the pointer while it is open: a click behind it must
      // not queue an attack or start a drag for a run that is not playing.
      if (this.sceneState !== 'playing' || this.modal || this.paused || this.help) return;
      this.root.focus();
      const mouse = event.pointerType === 'mouse';
      if (mouse && event.button === 2) {
        // Right button is the bow: the left hand swings, the right hand shoots.
        event.preventDefault();
        this.pendingShoot = true;
        return;
      }
      if (mouse && event.button !== 0) return;
      event.preventDefault();
      if (mouse) {
        this.pendingAttack = true;
        this.pendingInteract = true;
        if (isLocked()) return;
        if (this.requestLookLock()) return;
        // No pointer lock: hold the button and drag to turn.
        this.lookDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: 0, tap: false };
        try { canvas.setPointerCapture?.(event.pointerId); } catch (_) {}
        return;
      }
      this.lookDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: 0, tap: true };
      try { canvas.setPointerCapture?.(event.pointerId); } catch (_) {}
    };
    const contextMenu = (event) => event.preventDefault();
    const lockChange = () => {
      if (this.destroyed) return;
      const locked = isLocked();
      const wasLocked = Boolean(this.hadLookLock);
      this.hadLookLock = locked;
      this.root.classList.toggle('is-pointer-locked', locked);
      // A lock this game released on purpose (an overlay opened or closed)
      // is not the player losing the pointer: it must not pause the run on
      // top of the overlay that already owns the screen. The window keeps a
      // stale release from swallowing a genuine lock loss later on.
      const releasedAt = this.lookLockReleasedAt || 0;
      const deliberate = releasedAt > 0 && performance.now() - releasedAt < 1000;
      this.lookLockReleasedAt = 0;
      if (wasLocked && !locked && !deliberate && this.sceneState === 'playing' && !this.paused && !this.modal && !this.help) {
        // Escape released the pointer mid-run: pause instead of leaving the
        // player with a camera that no longer answers the mouse.
        this.lockLostAt = performance.now();
        this.togglePause();
      }
    };    const lockError = () => { this.pointerLockBlocked = true; };
    this.root.addEventListener('keydown', keydown);
    this.root.addEventListener('keyup', keyup);
    canvas.addEventListener('pointerdown', pointer);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', pointerCancel);
    canvas.addEventListener('contextmenu', contextMenu);
    document.addEventListener('mousemove', mouseMove);
    document.addEventListener('pointerlockchange', lockChange);
    document.addEventListener('pointerlockerror', lockError);
    this.installTouchPad();
    this.disposers.push(() => this.root.removeEventListener('keydown', keydown));
    this.disposers.push(() => this.root.removeEventListener('keyup', keyup));
    this.disposers.push(() => this.renderer?.domElement.removeEventListener('pointerdown', pointer));
    this.disposers.push(() => this.renderer?.domElement.removeEventListener('pointermove', pointerMove));
    this.disposers.push(() => this.renderer?.domElement.removeEventListener('pointerup', pointerUp));
    this.disposers.push(() => this.renderer?.domElement.removeEventListener('pointercancel', pointerCancel));
    this.disposers.push(() => this.renderer?.domElement.removeEventListener('contextmenu', contextMenu));
    this.disposers.push(() => document.removeEventListener('mousemove', mouseMove));
    this.disposers.push(() => document.removeEventListener('pointerlockchange', lockChange));
    this.disposers.push(() => document.removeEventListener('pointerlockerror', lockError));
  }

  /**
   * Ask the canvas for pointer lock. Returns false when the browser refuses
   * (sandboxed frame, missing user gesture, or a device without a mouse) so the
   * caller can fall back to drag-look instead of silently doing nothing.
   *
   * The lock belongs to the running game only. A paused, covered, helped or
   * finished run has no business holding the pointer, and asking for it there
   * would fight the overlay that just took the mouse.
   */
  requestLookLock() {
    // Pointer lock is a mouse contract. A touch device has no cursor to
    // lock, and asking for it there only freezes the touch coordinates the
    // drag-look fallback depends on.
    if (!this.hasFinePointer) return false;
    if (this.destroyed) return false;
    if (this.sceneState !== 'playing') return false;
    if (this.paused) return false;
    if (this.help) return false;
    if (this.modal) return false;
    if (this.state?.player?.dead) return false;
    const canvas = this.renderer?.domElement;
    if (!canvas || typeof canvas.requestPointerLock !== 'function' || this.pointerLockBlocked) return false;
    // A new lock supersedes any pending release: the next lock change is
    // about this lock, not about the one that was let go.
    this.lookLockReleasedAt = 0;
    try {
      const pending = canvas.requestPointerLock();
      if (pending && typeof pending.catch === 'function') {
        pending.catch(() => { this.pointerLockBlocked = true; });
        return true;
      }
      return true;
    } catch (_) {
      this.pointerLockBlocked = true;
      return false;
    }
  }

  /**
   * Release the pointer without toggling pause (used when a modal opens).
   *
   * Only the lock this game owns is released: another app may be holding the
   * pointer, and taking it from them would break their own input.
   *
   * The release is announced to the lock-change handler: a pointer this game
   * gave up on purpose (an overlay opened) must not be read as the player
   * losing the mouse.
   */
  exitLookLock() {
    const canvas = this.renderer?.domElement;
    if (!canvas) return false;
    try {
      if (document.pointerLockElement !== canvas) return false;
      // The release is announced to the lock-change handler: a pointer this
      // game gave up on purpose must not be read as the player losing it.
      this.lookLockReleasedAt = performance.now();
      document.exitPointerLock?.();
      return true;
    } catch (_) {
      this.lookLockReleasedAt = 0;
      return false;
    }
  }

  /**
   * Apply a raw mouse delta to the first-person camera.
   *
   * Yaw turns around world up; pitch is clamped short of straight up and down
   * so the horizon never flips. `boost` lets the touch drag feel as responsive
   * as a mouse without changing the player's saved sensitivity.
   */
  applyLook(dx, dy, boost = 1) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const sensitivity = Number(this.settings?.lookSensitivity) || 1;
    const scale = 0.0022 * sensitivity * boost;
    this.look.yaw -= dx * scale;
    this.look.pitch -= dy * scale * (this.settings?.invertY ? -1 : 1);
    if (this.look.yaw > Math.PI) this.look.yaw -= Math.PI * 2;
    if (this.look.yaw < -Math.PI) this.look.yaw += Math.PI * 2;
    this.look.pitch = Math.max(-LOOK_PITCH_LIMIT, Math.min(LOOK_PITCH_LIMIT, this.look.pitch));
    this.lookDelta.x += dx;
    this.lookDelta.y += dy;
  }

  /** Point the camera at the arena centre when a run starts. */
  faceArenaCentre() {
    const position = this.state?.player?.position || { x: 0, z: 0 };
    const dx = -position.x;
    const dz = -position.z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-4) { this.look.yaw = 0; this.look.pitch = -0.05; return; }
    // Camera forward is (-sin yaw, -cos yaw) under the YXZ order.
    this.look.yaw = Math.atan2(-dx / length, -dz / length);
    this.look.pitch = -0.05;
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
    this.faceArenaCentre();
    this.rebuildRoom(this.state.arena);
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
    const draft = this.state.chests.find((chest) => chest.draftPending && chest.choices?.length);
    if (draft) this.showPick(draft);
  }

  async begin(seed = 'aizo-awakens') {
    if (this.sceneState !== 'menu') return;
    this.sceneState = 'playing';
    // Audio unlock is best-effort and must never gate gameplay: resume() can
    // stay pending when the browser withholds user activation (or audio is
    // unavailable), so fire it without awaiting.
    this.audio.resume();
    if (this.destroyed || this.sceneState !== 'playing') return;
    if (seed !== 'aizo-awakens' || this.state.seed !== seed) {
      this.state = createGameState(seed);
      this.state.settings = { autoFireReserve: this.settings.autoFireReserve, heat: 0 };
      this.eventSeq = 0;
    }
    this.preview.removeFromParent();
    this.sceneState = 'playing';
    this.menu.remove();
    this.hud.setVisible(true);
    this.root.focus();
    this.faceArenaCentre();
    this.rebuildRoom(this.state.arena);
    spawnWave(this.state, 1);
    this.feedback.emit('portal', { position: { x: 0, y: 1, z: 0 } });
    this.syncWorld();
    this.updateHud();
    // The run starts under the player's hand: take the mouse immediately so
    // the first click is a swing, not a camera grab.
    this.requestLookLock();
  }

  /** The daily descent: one shared seed per local date, no server. */
  beginDaily() {
    return this.begin(dailySeed());
  }

  resetInput() {
    this.keys.clear();
    this.pendingAttack = false;
    this.pendingDash = false;
    this.pendingShoot = false;
    this.pendingGuard = false;
    this.pendingSpecial = false;
    this.pendingInteract = false;
    // A drag that outlives the overlay that interrupted it would keep the
    // pointer captured: the next click would be swallowed by the capture
    // instead of reaching the game.
    this.releaseLookDrag();
    this.touchMove = null;
    this.state.inputLatch.attack = false;
    this.state.inputLatch.dash = false;
    this.state.inputLatch.shoot = false;
    this.state.inputLatch.guard = false;
    this.state.inputLatch.special = false;
  }

  /** Drop the drag-look gesture and give the pointer back to the browser. */
  releaseLookDrag() {
    const drag = this.lookDrag;
    this.lookDrag = null;
    if (!drag) return;
    try { this.renderer?.domElement?.releasePointerCapture?.(drag.pointerId); } catch (_) {}
  }

  togglePause() {
    if (this.sceneState !== 'playing') return;
    this.paused = !this.paused;
    this.resetInput();
    // Pause and pointer lock are the same mode: the mouse must not keep
    // turning a camera nobody can see, and resuming must hand it back.
    if (this.paused) this.exitLookLock();
    this.hud.update({ paused: this.paused, help: this.help });
    // Resuming is a gesture the player made, so it may take the pointer
    // back. Every other path must wait for a click.
    if (!this.paused) this.requestLookLock();
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
    // The help card is an overlay: it needs the mouse back to be read.
    if (this.help) this.exitLookLock();
    this.hud.update({ paused: this.paused, help: this.help });
  }

  /**
   * Modal lifecycle for in-game dialogs: record the opener, make everything
   * behind the panel inert (except the live announcer), move focus inside and
   * remember how to hand focus back.
   *
   * The panel owns the mouse while it is open, so the pointer lock this game
   * holds is released here. The record is written first: the release fires a
   * lock change, and the run must already know that an overlay is on screen
   * so it does not pause on top of it.
   */
  openModal(panel, focusTarget, opener = document.activeElement) {
    this.resetInput();
    // Only one modal may own the screen at a time: an earlier panel that is
    // still open would keep the background inert and its own record alive.
    if (this.modal && this.modal.panel !== panel) this.closeModal(this.modal, { restore: false });
    const inerted = [];
    const hudRoot = this.hud?.root;
    const mark = (element) => {
      if (!element || element === panel || element.inert) return;
      element.inert = true;
      inerted.push(element);
    };
    for (const child of this.root.children) {
      if (child === panel) continue;
      if (child === hudRoot) {
        for (const part of child.children) {
          if (part !== this.hud?.elements?.announcer && part !== this.hud?.elements?.lootFeed) mark(part);
        }
      } else mark(child);
    }
    this.modal = { panel, opener, inerted };
    // Only the lock this game owns is released: another app may be holding
    // the pointer, and taking it from them would break their input.
    this.exitLookLock();
    const target = focusTarget || panel.querySelector(TABBABLE) || panel;
    if (target === panel) panel.tabIndex = -1;
    target.focus?.();
    return this.modal;
  }

  closeModal(record, { restore = true } = {}) {
    if (!record) return;
    for (const element of record.inerted) element.inert = false;
    // Closing an overlay hands the mouse back to the page: this game must
    // not keep the pointer while the player is reading the run again. The
    // lock is released while the modal record is still in place, so the
    // lock-change handler sees the overlay and does not pause on top of it.
    this.exitLookLock();
    if (this.modal === record) this.modal = undefined;
    if (!restore || this.destroyed) return;
    const opener = record.opener;
    const usable = opener && opener !== document.body && opener.isConnected && !opener.closest?.('[inert]');
    (usable ? opener : this.root)?.focus?.();
  }

  trapTab(event) {
    const panel = this.modal?.panel;
    if (!panel) return;
    const items = [...panel.querySelectorAll(TABBABLE)].filter((item) => !item.closest('[hidden]'));
    if (!items.length) { event.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (!panel.contains(active)) { event.preventDefault(); first.focus(); }
    else if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  }

  showSettings() {
    if (this.settingsPanel || this.modal) return { opened: false };
    this.settingsReturnToPaused = this.paused;
    const settingsOpener = document.activeElement;
    // A modal needs the mouse: the run pauses while the panel is open and
    // the pointer lock is released with it (openModal does the release).
    if (this.sceneState === 'playing' && !this.pickPanel) this.paused = true;
    const panel = node('section', 'az-hud-panel az-dungeon-settings');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Dungeon settings');
    panel.append(node('h2', 'az-hud-panel-title', 'Settings'));
    const rows = node('div', 'az-dungeon-settings-rows');
    const row = (labelText, control, readout) => {
      const wrapper = node('label', 'az-dungeon-settings-row', labelText);
      wrapper.append(control);
      if (readout) wrapper.append(readout);
      rows.append(wrapper);
      return wrapper;
    };
    const select = (className, options, current, onPick, key, label) => {
      const group = node('div', className);
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', label);
      group.dataset.setting = key;
      for (const value of options) {
        const button = node('button', `az-dungeon-settings-option${String(value) === String(current) ? ' is-selected' : ''}`, String(value));
        button.type = 'button';
        button.dataset.value = String(value);
        button.setAttribute('aria-pressed', String(String(value) === String(current)));
        button.addEventListener('click', () => onPick(value));
        group.append(button);
      }
      return group;
    };
    const assistLabel = node('span', 'az-dungeon-settings-label', 'Assist mode');
    assistLabel.setAttribute('aria-label', 'Assist mode');
    assistLabel.append(select('az-dungeon-settings-group', ['manual', 'assist', 'auto'], this.settings.assistMode, (value) => {
      this.settings.assistMode = value;
      this.assistMode = value;
      this.saveAndApplySettings();
      this.refreshSettings();
      this.hud?.announce?.(`Assist mode: ${value.toUpperCase()}`);
      this.updateHud();
    }, 'assistMode', 'Assist mode'));
    rows.append(assistLabel);
    const reserveLabel = node('span', 'az-dungeon-settings-label', 'Auto-fire reserve');
    reserveLabel.append(select('az-dungeon-settings-group', [0, 25, 50], this.settings.autoFireReserve, (value) => {
      this.settings.autoFireReserve = Number(value);
      this.state.settings = { ...this.state.settings, autoFireReserve: Number(value) };
      this.saveAndApplySettings();
      this.refreshSettings();
      this.updateHud();
    }, 'autoFireReserve', 'Auto-fire reserve'));
    rows.append(reserveLabel);
    for (const [key, label] of [['masterVolume', 'Master volume'], ['sfxVolume', 'Effects volume'], ['shake', 'Screen shake']]) {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.value = String(Math.round(Number(this.settings[key] ?? (key === 'shake' ? 100 : 0.7)) * (key === 'shake' ? 1 : 100)));
      input.setAttribute('aria-label', label);
      input.addEventListener('input', () => {
        const percent = Math.max(0, Math.min(100, Number(input.value)));
        this.settings[key] = key === 'shake' ? percent : percent / 100;
        this.saveAndApplySettings();
      });
      row(label, input);
    }
    const quality = document.createElement('select');
    quality.setAttribute('aria-label', 'Render quality');
    for (const value of ['low', 'medium', 'high', 'auto']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      if (this.settings.quality === value) option.selected = true;
      quality.append(option);
    }
    quality.addEventListener('change', () => {
      this.settings.quality = quality.value;
      this.saveAndApplySettings();
      this.hud?.announce?.(`Render quality: ${quality.value}`);
    });
    row('Render quality', quality);
    // First-person look controls. They live with the other comfort options
    // because a camera that fights the player is the fastest way to make a
    // good game feel broken.
    const sensitivity = document.createElement('input');
    sensitivity.type = 'range';
    sensitivity.min = '25';
    sensitivity.max = '250';
    sensitivity.step = '5';
    sensitivity.value = String(Math.round(Number(this.settings.lookSensitivity ?? 1) * 100));
    sensitivity.setAttribute('aria-label', 'Look sensitivity');
    const sensitivityValue = node('span', 'az-dungeon-settings-readout', `${sensitivity.value}%`);
    sensitivity.addEventListener('input', () => {
      this.settings.lookSensitivity = Math.max(0.25, Math.min(2.5, Number(sensitivity.value) / 100));
      sensitivityValue.textContent = `${sensitivity.value}%`;
      this.saveAndApplySettings();
    });
    row('Look sensitivity', sensitivity, sensitivityValue);
    for (const [key, label] of [['damageNumbers', 'Damage numbers'], ['highContrast', 'High contrast'], ['leftHanded', 'Left-handed layout'], ['reducedMotion', 'Reduced motion'], ['invertY', 'Invert vertical look']]) {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = Boolean(this.settings[key]);
      input.setAttribute('aria-label', label);
      input.addEventListener('change', () => {
        this.settings[key] = Boolean(input.checked);
        this.saveAndApplySettings();
      });
      row(label, input);
    }
    panel.append(rows);
    panel.append(makeButton('az-dungeon-begin', 'Done', () => this.closeSettings()));
    this.settingsPanel = panel;
    this.root.append(panel);
    this.hud?.update?.({ paused: this.paused && !this.pickPanel, help: this.help && !this.pickPanel });
    this.settingsModal = this.openModal(panel, null, settingsOpener);
    return { opened: true };
  }

  /** Update the segmented controls in place so focus and identity survive. */
  refreshSettings() {
    if (!this.settingsPanel) return;
    for (const group of this.settingsPanel.querySelectorAll('[data-setting]')) {
      const current = String(this.settings[group.dataset.setting]);
      for (const button of group.querySelectorAll('button')) {
        const on = button.dataset.value === current;
        button.classList.toggle('is-selected', on);
        button.setAttribute('aria-pressed', String(on));
      }
    }
  }

  closeSettings() {
    if (!this.settingsPanel) return { closed: false };
    this.settingsPanel.remove();
    this.settingsPanel = undefined;
    if (this.sceneState === 'playing' && !this.pickPanel) this.paused = Boolean(this.settingsReturnToPaused);
    const record = this.settingsModal;
    this.settingsModal = undefined;
    this.closeModal(record);
    this.hud?.update?.({ paused: this.paused && !this.pickPanel, help: this.help && !this.pickPanel });
    // The pointer is not taken back here: closing a panel is not a gesture
    // on the canvas, and a lock request without one is refused by the
    // browser anyway. The next click on the canvas takes it.
    return { closed: true };
  }

  saveAndApplySettings() {
    saveSettings(this.storage, this.settings);
    this.applySettings();
  }

  /** Apply persisted comfort settings to audio, feedback, layout and renderer. */
  applySettings() {
    const settings = this.settings || {};
    this.assistMode = settings.assistMode || this.assistMode || 'assist';
    if (this.state?.settings) this.state.settings.autoFireReserve = settings.autoFireReserve ?? 25;
    try { this.audio?.setVolumes?.({ master: Number(settings.masterVolume ?? 0.7), sfx: Number(settings.sfxVolume ?? 0.7) }); } catch (_) {}
    // Effective reduced motion is the OS preference OR the local toggle.
    this.reducedMotion = osReducedMotion() || Boolean(settings.reducedMotion);
    try { this.feedback?.setReducedMotion?.(this.reducedMotion); } catch (_) {}
    if (this.reducedMotion) { this.shake = null; this.hitStopUntil = 0; this.slowMoUntil = 0; }
    try {
      this.root?.classList?.toggle('is-reduced-motion', this.reducedMotion);
      this.root?.classList?.toggle('is-high-contrast', Boolean(settings.highContrast));
      this.root?.classList?.toggle('is-left-handed', Boolean(settings.leftHanded));
    } catch (_) {}
    try {
      if (this.renderer) {
        const dpr = window.devicePixelRatio || 1;
        const ratio = settings.quality === 'low' ? 1 : settings.quality === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
        this.renderer.setPixelRatio(ratio);
        this.resize();
      }
    } catch (_) {}
    return { applied: true };
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
    if (this.qaWalkCoord) {
      const gap = Math.hypot(this.qaWalkCoord.x - this.state.player.position.x, this.qaWalkCoord.z - this.state.player.position.z);
      if (gap <= 0.6 || this.state.time > this.qaWalkCoord.until) { this.qaWalkCoord = null; this.touchMove = null; }
    }
    const input = this.movementInput();
    // Looking is aiming. The simulation used to derive facing from the walk
    // vector, which in first person would swing the sword where the player
    // strafes; the camera's horizontal forward is the truth now.
    input.facing = { x: -Math.sin(this.look.yaw), z: -Math.cos(this.look.yaw) };
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
    if (event.type === 'melee-hit') {
      this.lastMeleeAt = performance.now();
      this.feedback.emit(event.chain === 3 ? 'crit' : 'hit', { damage: event.damage, position });
    }
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
    else if (event.type === 'bow-shot') { this.lastShootAt = performance.now(); this.feedback.emit('bow', { position }); }
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
    else if (event.type === 'arena') {
      const hazardCopy = {
        'slow-water': 'slow water drags',
        'burning-braziers': 'braziers burn',
        'falling-tiles': 'the floor gives way',
        'raised-platform': 'hold the dais',
        none: 'open ground',
      }[event.hazard] || 'open ground';
      this.rebuildRoom(event.id);
      this.hud.announce(`${event.id.replaceAll('-', ' ')} arena — ${hazardCopy}`);
    }
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
      const now = performance.now();
      // First person means the camera is inside the avatar: drawing it would
      // fill the screen with the back of its own head. It is the menu model.
      this.hero.visible = this.sceneState === 'menu';
      this.hero.position.set(this.state.player.position.x, 0, this.state.player.position.z);
      this.hero.rotation.y = Math.atan2(this.state.player.facing.x, this.state.player.facing.z);
      // Readable motion: a stride bob while moving and a lunge pulse on swing.
      const moving = Math.abs((this.lastHeroX ?? this.hero.position.x) - this.hero.position.x)
        + Math.abs((this.lastHeroZ ?? this.hero.position.z) - this.hero.position.z) > 1e-4;
      this.lastHeroX = this.hero.position.x;
      this.lastHeroZ = this.hero.position.z;
      this.heroStride = (this.heroStride || 0) + (moving ? 0.35 : 0.06);
      this.hero.position.y = this.reducedMotion ? 0 : moving ? Math.abs(Math.sin(this.heroStride)) * 0.09 : Math.sin(now / 900) * 0.02;
      const lunge = !this.reducedMotion && this.lastMeleeAt && now - this.lastMeleeAt < 180 ? 1.1 : 1;
      this.hero.scale.set(lunge, 1 / Math.sqrt(lunge), lunge);
      if (!this.heroRing) {
        this.heroRing = new THREE.Mesh(this.telegraphResources().geometry, this.heroRingMaterial());
        this.heroRing.rotation.x = -Math.PI / 2;
        this.heroRing.userData.heroMarker = true;
        this.dynamic.add(this.heroRing);
      }
      this.heroRing.position.set(this.state.player.position.x, 0.06, this.state.player.position.z);
      this.heroRing.scale.setScalar(1.2);
      this.heroRing.visible = this.sceneState === 'menu';
    }
    const alive = new Set();
    if (!this.eliteMeshes) this.eliteMeshes = new Map();
    const elitesAlive = new Set();
    for (const enemy of this.state.enemies) {
      if (enemy.dead) continue;
      alive.add(enemy.id);
      let mesh = this.enemyMeshes.get(enemy.id);
      if (!mesh) {
        mesh = this.clone(ENEMY_ASSET[enemy.archetype]);
        mesh.userData.entityId = enemy.id;
        // Silhouette identity: heavies loom, the boss towers, bombers squat.
        const stature = enemy.archetype === 'boss' ? 1.55
          : ['tank', 'shieldbearer', 'slimegolem'].includes(enemy.archetype) ? 1.18
          : enemy.archetype === 'bomber' ? 0.92 : 1;
        const eliteBoost = enemy.elite === 'armored' ? 1.1 : 1;
        mesh.scale.setScalar(stature * eliteBoost);
        this.enemyMeshes.set(enemy.id, mesh);
        this.dynamic.add(mesh);
      }
      mesh.position.set(enemy.x, this.reducedMotion ? 0 : Math.abs(Math.sin(this.frames / 9 + (enemy.spawnIndex || 0) * 1.7)) * 0.05, enemy.z);
      mesh.lookAt(this.state.player.position.x, 0, this.state.player.position.z);
      if (enemy.elite) {
        elitesAlive.add(enemy.id);
        let ring = this.eliteMeshes.get(enemy.id);
        if (!ring) {
          ring = new THREE.Mesh(this.telegraphResources().geometry, this.eliteMaterial(enemy.elite));
          ring.rotation.x = -Math.PI / 2;
          ring.userData.eliteMarker = enemy.elite;
          this.eliteMeshes.set(enemy.id, ring);
          this.dynamic.add(ring);
        }
        ring.position.set(enemy.x, 0.08, enemy.z);
        ring.scale.setScalar(1.5);
      } else {
        // Every enemy grounds itself: a dim ember ring so dark bodies never
        // merge with the floor, even where no windup telegraph is drawn.
        elitesAlive.add(enemy.id);
        let ring = this.eliteMeshes.get(enemy.id);
        if (!ring || ring.userData.eliteMarker) {
          ring?.removeFromParent?.();
          ring = new THREE.Mesh(this.telegraphResources().geometry, this.groundMaterial());
          ring.rotation.x = -Math.PI / 2;
          ring.userData.eliteMarker = '';
          this.eliteMeshes.set(enemy.id, ring);
          this.dynamic.add(ring);
        }
        ring.position.set(enemy.x, 0.05, enemy.z);
        ring.scale.setScalar(1.1);
      }
    }
    for (const [id, mesh] of this.enemyMeshes) {
      if (!alive.has(id)) { mesh.removeFromParent(); this.enemyMeshes.delete(id); }
    }
    for (const [id, mesh] of this.eliteMeshes) {
      if (!elitesAlive.has(id)) { mesh.removeFromParent(); this.eliteMeshes.delete(id); }
    }
    const shots = new Set();
    for (const projectile of this.state.projectiles) {
      shots.add(projectile.id);
      let mesh = this.projectileMeshes.get(projectile.id);
      if (!mesh) {
        mesh = this.clone('projectile');
        // The arrow sculpt is authored along its own Y axis. Lay it down so
        // the wrapper's yaw aims the tip at the velocity, instead of leaving
        // vertical arrows hopping across the floor.
        const inner = mesh.children[0];
        if (inner) {
          inner.position.set(0, 0, 0);
          inner.rotation.set(Math.PI / 2, 0, 0);
        }
        this.projectileMeshes.set(projectile.id, mesh);
        this.dynamic.add(mesh);
      }
      // The player's arrow flies level with the bow; enemy shots ride a little
      // higher so the two are never mistaken for each other on screen.
      const height = projectile.source === 'player' ? 0.9 : 1.15;
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
    this.syncSpawnPortals();
    this.syncHazardTiles();
    // The exit portal is walked into, so the camera ends up inside it. A
    // portal that fills the screen with its own vortex is not a portal the
    // player can read: it steps out of the way once they are inside it.
    if (this.portal) {
      const dx = this.portal.position.x - this.camera.position.x;
      const dz = this.portal.position.z - this.camera.position.z;
      this.portal.visible = Math.hypot(dx, dz) > 1.7;
    }
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

  /**
   * Elite identity: one grounding-ring color per elite kind, shared across
   * all elites of that kind. Armored bronze, swift mist, volatile ember,
   * vampiric blood — readable at a glance, subordinate to the silhouette.
   */
  eliteMaterial(kind) {
    if (!this.eliteMaterials) this.eliteMaterials = new Map();
    let material = this.eliteMaterials.get(kind);
    if (!material) {
      const colors = { armored: COLORS.bronze, swift: COLORS.mist, volatile: COLORS.ember, vampiric: COLORS.blood };
      material = new THREE.MeshBasicMaterial({
        color: colors[kind] ?? COLORS.gold, transparent: true, opacity: 0.7,
        side: THREE.DoubleSide, depthWrite: false,
      });
      this.eliteMaterials.set(kind, material);
      this.materials.add(material);
    }
    return material;
  }

  /** The shared dim grounding ring under ordinary enemies. */
  groundMaterial() {
    if (!this.groundShared) {
      this.groundShared = new THREE.MeshBasicMaterial({
        color: COLORS.ember, transparent: true, opacity: 0.35,
        side: THREE.DoubleSide, depthWrite: false,
      });
      this.materials.add(this.groundShared);
    }
    return this.groundShared;
  }

  /** The hero's own grounding ring: bright gold, so Aizo never gets lost. */
  heroRingMaterial() {
    if (!this.heroRingShared) {
      this.heroRingShared = new THREE.MeshBasicMaterial({
        color: COLORS.gold, transparent: true, opacity: 0.55,
        side: THREE.DoubleSide, depthWrite: false,
      });
      this.materials.add(this.heroRingShared);
    }
    return this.heroRingShared;
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

  syncSpawnPortals() {
    // Pending spawns are telegraphed in the world, not only in the announcer:
    // one portal ring per incoming enemy, capped so a large wave cannot flood
    // the scene graph.
    if (!this.spawnMeshes) this.spawnMeshes = new Map();
    const wanted = new Map();
    for (const spawn of (this.state.pendingSpawns || []).slice(0, 12)) {
      wanted.set(`${spawn.archetype}:${spawn.x.toFixed(2)},${spawn.z.toFixed(2)}`, spawn);
    }
    for (const [key, mesh] of this.spawnMeshes) {
      if (!wanted.has(key)) { mesh.removeFromParent(); this.spawnMeshes.delete(key); }
    }
    for (const [key, spawn] of wanted) {
      let mesh = this.spawnMeshes.get(key);
      if (!mesh) {
        mesh = this.clone('portal');
        mesh.scale.setScalar(0.55);
        mesh.userData.spawnMarker = true;
        // The marker is a warning, not a prop: the sculpt's own materials are
        // opaque stone and read as a pink slab in the dark. A soft ember shell
        // says "something arrives here" without hiding the floor.
        const shell = this.markerMaterial();
        mesh.traverse((object) => { if (object.isMesh) object.material = shell; });
        this.spawnMeshes.set(key, mesh);
        this.dynamic.add(mesh);
      }
      mesh.position.set(spawn.x, 0.1, spawn.z);
      if (!this.reducedMotion) mesh.rotation.y += 0.03;
    }
  }

  /** The shared glow used by spawn markers. */
  markerMaterial() {
    if (!this.markerShared) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xff7a2e, transparent: true, opacity: 0.28,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      this.markerShared = material;
      this.materials.add(material);
    }
    return this.markerShared;
  }

  syncHazardTiles() {
    // Collapsing tiles telegraph in the world: a danger ring where the floor
    // is about to give way, synced from the simulation's own hazard state.
    if (!this.hazardMeshes) this.hazardMeshes = new Map();
    const active = new Set();
    if (this.dynamic) {
      const { geometry, material } = this.telegraphResources();
      const tiles = this.state.arena === 'collapsing-tiles' ? (this.state.hazardTiles || []) : [];
      tiles.forEach((tile, index) => {
        const key = `tile-${index}`;
        active.add(key);
        let mesh = this.hazardMeshes.get(key);
        if (!mesh) {
          mesh = new THREE.Mesh(geometry, material);
          mesh.rotation.x = -Math.PI / 2;
          mesh.userData.hazardMarker = true;
          this.hazardMeshes.set(key, mesh);
          this.dynamic.add(mesh);
        }
        const urgency = this.reducedMotion ? 1 : 1 + 0.3 * Math.sin(performance.now() / 120);
        mesh.position.set(tile.x, 0.07, tile.z);
        mesh.scale.setScalar(1.6 * urgency);
      });
    }
    for (const [key, mesh] of this.hazardMeshes) {
      if (!active.has(key)) { mesh.removeFromParent(); this.hazardMeshes.delete(key); }
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
      const scale = Number(this.settings?.shake ?? 100) / 100;
      if (scale <= 0) return;
      this.shake = { x: effect.impulse.x * scale, y: effect.impulse.y * scale, until: performance.now() + effect.durationMs };
    } else if (effect.type === 'hit-stop') {
      this.hitStopUntil = Math.max(this.hitStopUntil || 0, performance.now() + effect.durationMs);
    } else if (effect.type === 'slow-mo') {
      // Parry and Phantom Step slow the world: the loop consumes this as a
      // time scale, so the dead 'slow-mo' output becomes rendered gameplay.
      this.slowMoUntil = Math.max(this.slowMoUntil || 0, performance.now() + effect.durationMs);
    } else if (effect.type === 'floating-damage') {
      if (this.settings?.damageNumbers === false) return;
      // Damage the player takes belongs to the player's own position, which in
      // first person is under the lens. The damage vignette already says it;
      // a number floating in the middle of the screen would only be noise.
      const eye = this.camera?.position;
      if (eye) {
        const dx = effect.position.x - eye.x;
        const dz = effect.position.z - eye.z;
        if (dx * dx + dz * dz < 2.25) return;
      }
      const { col, row } = this.projectToGrid(effect.position);
      const label = node('output', `az-floating-damage az-dmg-x${col} az-dmg-y${row}${effect.critical ? ' is-critical' : ''}`, String(Math.round(effect.value)));
      label.setAttribute('aria-hidden', 'true');
      this.effectLayer.append(label);
      const timer = setTimeout(() => label.remove(), 650);
      this.effects.push({ kind: 'dom', value: label, timer });
    } else if (effect.type === 'particle-burst') {
      // A burst at the player's own feet would sit on the lens and fill the
      // screen with a coloured lump. The first-person camera cannot show its
      // own impact, so a burst that close to the eye is not drawn at all.
      const eye = this.camera?.position;
      const dx = eye ? effect.position.x - eye.x : 0;
      const dz = eye ? effect.position.z - eye.z : 0;
      if (dx * dx + dz * dz < 2.25) return;
      const resourceKey = effect.color in COLORS ? effect.color : 'gold';
      let resources = this.particleResources.get(resourceKey);
      if (!resources) {
        resources = {
          geometry: new THREE.SphereGeometry(0.055, 6, 4),
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

  /**
   * Project a world position onto the screen and quantize it to the
   * damage-label grid. The route CSP bans inline styles, so labels are placed
   * by class name (az-dmg-x0..8, az-dmg-y0..6), never by coordinates: the
   * label lands on the victim's ninth of the screen instead of screen center.
   */
  projectToGrid(position = {}) {
    try {
      if (!this.camera) return { col: 4, row: 3 };
      const vector = new THREE.Vector3(Number(position.x) || 0, Number(position.y ?? 1) || 0, Number(position.z) || 0);
      vector.project(this.camera);
      const col = Math.max(0, Math.min(8, Math.floor(((vector.x + 1) / 2) * 9)));
      const row = Math.max(0, Math.min(6, Math.floor((1 - (vector.y + 1) / 2) * 7)));
      return { col, row };
    } catch (_) {
      return { col: 4, row: 3 };
    }
  }

  /** The loop's time scale: parry/phantom slow-mo eases the sim to 35%. */
  timeScale(now = performance.now()) {
    return (this.slowMoUntil || 0) > now ? 0.35 : 1;
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
  showPick(chest, { rebuild = false } = {}) {
     const keptOpener = rebuild ? this.pickModal?.opener : undefined;
     this.closePick({ restore: false });
     this.pickChestId = chest.id;
     chest.draftPending = true;
     this.persistRun();
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
     const later = makeButton('az-dungeon-pick-later', 'Decide later', () => this.hidePick());
     later.setAttribute('aria-label', 'Decide later: keep this blessing draft pending');
     actions.append(reroll, skip, later);
     panel.append(actions);
     panel.append(this.renderShop(chest));
     this.pickPanel = panel;
     this.root.append(panel);
     this.pickModal = this.openModal(panel, rebuild ? panel.querySelector('.az-dungeon-pick-reroll') : panel.querySelector('.az-dungeon-pick-card'), keptOpener ?? document.activeElement);
     this.hud?.announce?.('Choose 1 of 3 blessings');
     }

     /** Set the draft aside without spending or selling it; the sim stays paused. */
     hidePick() {
       if (!this.pickPanel || this.pickHidden) return;
       this.pickHidden = true;
       const record = this.pickModal;
       this.pickModal = undefined;
       this.pickPanel.hidden = true;
       this.closeModal(record, { restore: false });
       this.pickReopen = makeButton('az-dungeon-pick-reopen', 'Reopen blessings', () => this.showHiddenPick());
       this.pickReopen.setAttribute('aria-label', 'Reopen the pending blessing draft');
       this.pickReopenOpener = record?.opener;
       this.root.append(this.pickReopen);
       this.pickReopen.focus();
       this.hud?.announce?.('Blessing draft kept. Reopen it when ready');
     }

     showHiddenPick() {
       if (!this.pickPanel || !this.pickHidden) return;
       this.pickHidden = false;
       this.pickReopen?.remove();
       this.pickReopen = undefined;
       this.pickPanel.hidden = false;
       this.pickModal = this.openModal(this.pickPanel, this.pickPanel.querySelector('.az-dungeon-pick-card'), this.pickReopenOpener);
     }

     static SHOP_COPY = Object.freeze({
     heal: { name: 'Mend Wounds', hint: '+50 health now' },
     reroll: { name: 'Bribe the Fates', hint: '+1 blessing reroll' },
     relic: { name: 'Toll Relic', hint: '+5% damage, +10 max health' },
     });

     /** The Ferryman's Toll: spend run gold without leaving the reward screen. */
  renderShop(chest) {
    const shop = node('section', 'az-dungeon-shop');
    shop.setAttribute('aria-label', "Ferryman's Toll shop");
    shop.append(node('h3', 'az-dungeon-shop-title', "Ferryman's Toll"));
    this.shopGold = node('p', 'az-dungeon-shop-gold', `${Math.floor(this.state.player.gold)} gold to offer`);
    this.shopGold.setAttribute('aria-live', 'polite');
    shop.append(this.shopGold);
    const list = node('div', 'az-dungeon-shop-items');
    for (const item of (chest.shop || [])) {
      const copy = GameApp.SHOP_COPY[item.kind] || { name: item.kind, hint: '' };
      const card = node('div', 'az-dungeon-shop-item');
      card.append(node('strong', 'az-dungeon-shop-name', copy.name));
      card.append(node('span', 'az-dungeon-shop-hint', copy.hint));
      const buy = makeButton('az-dungeon-shop-buy', item.sold ? 'Paid' : `Offer ${item.price} gold`, () => this.pickShopBuy(item.slot));
      buy.setAttribute('aria-label', `${copy.name}, ${copy.hint}, costs ${item.price} gold`);
      if (item.sold) buy.disabled = true;
      buy.setAttribute('data-slot', String(item.slot));
      card.append(buy);
      list.append(card);
    }
    shop.append(list);
    return shop;
  }

  pickShopBuy(slot) {
    const chest = this.state.chests.find((item) => item.id === this.pickChestId);
    if (!chest) return { bought: false };
    const result = buyShopItem(this.state, chest.id, slot);
    if (result.bought) {
      this.feedback.emit('loot', { label: `Toll paid: ${result.kind}` });
      this.hud?.announce?.(`Toll paid: ${result.kind}`);
      this.persistRun();
      this.syncWorld();
      this.updateHud();
      // Refresh the shop in place: gold, sold states, nothing else moves.
      const fresh = this.state.chests.find((item) => item.id === this.pickChestId);
      const old = this.pickPanel?.querySelector('.az-dungeon-shop');
      if (old && fresh) {
        const hadFocus = old.contains(document.activeElement);
        old.replaceWith(this.renderShop(fresh));
        if (hadFocus) {
          const next = this.pickPanel.querySelector(`.az-dungeon-shop-buy[data-slot="${slot}"]`);
          (next && !next.disabled ? next : this.pickPanel.querySelector('.az-dungeon-shop-buy:not(:disabled), .az-dungeon-pick-card'))?.focus();
        }
      }
    } else {
      this.hud?.announce?.(result.reason === 'no-gold' ? 'Not enough gold for that toll' : 'That toll is already paid');
    }
    return result;
  }

   refreshPick() {
     const chest = this.state.chests.find((item) => item.id === this.pickChestId);
     if (!chest || !this.pickPanel) return;
     this.showPick(chest, { rebuild: true });
   }

   closePick({ restore = true } = {}) {
     this.pickPanel?.remove();
     this.pickPanel = undefined;
     this.pickReopen?.remove();
     this.pickReopen = undefined;
     this.pickHidden = false;
     const record = this.pickModal;
     this.pickModal = undefined;
     this.closeModal(record, { restore: false });
     this.pickChestId = undefined;
     if (this.sceneState === 'playing') this.paused = false;
     // The picked card had focus and is gone: return focus to the game root
     // so keyboard input (movement, Enter for the portal) keeps working for
     // mouse/touch players without an extra canvas click.
     if (restore && !this.destroyed) this.root?.focus?.();
   }

   pickChoice(index) {
     const chest = this.state.chests.find((item) => item.id === this.pickChestId);
     const choice = chest?.choices?.[index];
     if (!choice) return { chosen: false };
     const result = chooseBlessing(this.state, choice.id);
     if (result.chosen) {
       chest.draftPending = false;
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
       this.persistRun();
       this.feedback.emit('bow', { position: { x: 0, y: 1, z: 0 } });
       this.refreshPick();
       this.updateHud();
     } else {
       this.hud?.announce?.(result.reason === 'no-gold' ? 'Not enough gold to reroll' : 'No rerolls left');
     }
     return result;
   }

   pickSkip() {
     const chest = this.state.chests.find((item) => item.id === this.pickChestId);
     if (!chest?.draftPending) return { skipped: false };
     chest.draftPending = false;
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
    // The ledger is the last screen of the run: it is a modal, so it owns
    // the mouse and releases the pointer lock the game was holding.
    this.victoryModal = this.openModal(this.victory, null, document.activeElement);
  }

  /**
   * Tear down the end-of-run screen (defeat or victory) and give the shell
   * back. The screen is a modal, so closing it has to release the modal
   * record as well as the panel.
   */
  closeEndScreen() {
    const record = this.victoryModal || this.defeatModal;
    this.victoryModal = undefined;
    this.defeatModal = undefined;
    this.victory?.remove();
    this.victory = undefined;
    this.defeat?.remove();
    this.defeat = undefined;
    this.closeModal(record, { restore: false });
  }

  /**
   * Step off the victory screen and keep going. The run's chapter already
   * points past the final one, so this spawns the endless chapter the ledger
   * was won on.
   */
  continueEndless() {
    if (this.sceneState !== 'victory') return { resumed: false };
    this.closeEndScreen();
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
    // The fall is the last screen of the run: it is a modal, so it owns the
    // mouse and releases the pointer lock the game was holding.
    this.defeatModal = this.openModal(this.defeat, null, document.activeElement);
  }

  retrySeed() {
    const seed = this.state.seed;
    this.closeEndScreen();
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
    this.rebuildRoom(this.state.arena);
    this.root.focus();
    this.faceArenaCentre();
    this.syncWorld();
    this.updateHud();
    this.hud?.announce?.(`Same seed: ${seed}`);
    return { seed };
  }

  restart() {
    this.closeEndScreen();
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
    this.rebuildRoom(this.state.arena);
    this.root.focus();
    this.faceArenaCentre();
    this.syncWorld();
  }

  clearEntities() {
    for (const group of [this.enemyMeshes, this.projectileMeshes, this.chestMeshes, this.telegraphMeshes, this.spawnMeshes, this.hazardMeshes, this.eliteMeshes]) {
      if (!group) continue;
      for (const mesh of group.values()) mesh.removeFromParent();
      group.clear();
    }
    this.portal?.removeFromParent();
    this.portal = null;
    this.chestPositions.clear();
  }

  updateCamera(dt, time) {
    if (this.sceneState === 'menu') {
      // The attract camera swings slowly across the arena and looks past the
      // hero, so the character stands in the right of the frame while the
      // title card owns the left.
      const target = new THREE.Vector3(-2, 1, 1.3);
      const angle = this.reducedMotion ? 0.4 : Math.sin(time * 0.00008) * 0.5;
      const offset = new THREE.Vector3(Math.sin(angle) * 5, 2.3, Math.cos(angle) * 5);
      this.cameraTarget.lerp(target, Math.min(1, dt * 8));
      const desired = this.cameraTarget.clone().add(offset);
      this.camera.position.lerp(desired, Math.min(1, dt * 7));
      this.camera.lookAt(this.cameraTarget);
      this.camera.updateMatrixWorld();
      return;
    }
    // First person: the camera is the player's eyes, so it sits inside the
    // avatar (hidden from this view) at eye height and turns with the look
    // state. Nothing is smoothed onto a target — a lagged FPS camera reads as
    // input delay.
    const position = this.state.player.position;
    const previousX = this.lastCamX ?? position.x;
    const previousZ = this.lastCamZ ?? position.z;
    const moving = Math.hypot(position.x - previousX, position.z - previousZ) > 0.0015;
    this.lastCamX = position.x;
    this.lastCamZ = position.z;
    this.walkPhase = (this.walkPhase + dt * (moving ? 9.4 : 1.3)) % (Math.PI * 2);
    const bob = this.reducedMotion ? 0 : moving ? Math.sin(this.walkPhase * 2) * 0.026 : Math.sin(this.walkPhase) * 0.006;
    const roll = this.reducedMotion ? 0 : Math.cos(this.walkPhase) * 0.005;
    this.camera.position.set(position.x, EYE_HEIGHT + bob, position.z);
    if (this.shake && performance.now() < this.shake.until) {
      this.camera.position.x += this.shake.x;
      this.camera.position.y += this.shake.y;
    }
    this.camera.rotation.set(this.look.pitch, this.look.yaw, roll, 'YXZ');
    this.camera.updateMatrixWorld();
  }

  /** Drift the dust field and keep it wrapped around the player. */
  updateAtmosphere(dt) {
    if (!this.dust) return;
    const attribute = this.dust.geometry.attributes.position;
    const array = attribute.array;
    const drift = this.dustDrift;
    const px = this.state?.player?.position?.x ?? 0;
    const pz = this.state?.player?.position?.z ?? 0;
    for (let i = 0; i < array.length; i += 3) {
      array[i] += drift[i] * dt;
      array[i + 1] += drift[i + 1] * dt;
      array[i + 2] += drift[i + 2] * dt;
      // Motes rise, fade out at head height and respawn near the floor.
      if (array[i + 1] > 4.6) {
        array[i + 1] = 0.12;
        array[i] = px + (Math.random() - 0.5) * 26;
        array[i + 2] = pz + (Math.random() - 0.5) * 26;
      }
      // The field travels with the player instead of being left behind.
      if (Math.abs(array[i] - px) > 18) array[i] = px + (Math.random() - 0.5) * 26;
      if (Math.abs(array[i + 2] - pz) > 18) array[i + 2] = pz + (Math.random() - 0.5) * 26;
    }
    attribute.needsUpdate = true;
    // The torch breathes instead of reading as a flat spotlight.
    if (this.torch && !this.reducedMotion) {
      const t = performance.now() / 1000;
      const torchBase = 2.2;
    this.torch.intensity = torchBase + Math.sin(t * 7.3) * 0.12 + Math.sin(t * 3.1) * 0.09;
    }
  }

  /**
   * Animate the first-person weapon rig: walk bob, look sway, a melee swing
   * and a raised bow after a shot. Everything is procedural, so no animation
   * clips or extra assets are needed.
   */
  updateViewmodel(dt) {
    const rig = this.viewmodel;
    if (!rig) return;
    const playing = this.sceneState === 'playing' || this.sceneState === 'defeat' || this.sceneState === 'victory';
    rig.visible = playing;
    if (!playing) return;
    // The rig rides the camera: same place, same heading, drawn with its own
    // lens so the weapon never bends with the world's wide field of view.
    if (this.viewHolder) {
      this.viewHolder.position.copy(this.camera.position);
      this.viewHolder.quaternion.copy(this.camera.quaternion);
    }
    if (this.viewCamera) {
      this.viewCamera.position.copy(this.camera.position);
      this.viewCamera.quaternion.copy(this.camera.quaternion);
    }
    const now = performance.now();
    const bowUp = now - (this.lastShootAt || 0) < 850;
    if (this.viewmodelBow) this.viewmodelBow.visible = bowUp;
    if (this.viewmodelSword) this.viewmodelSword.visible = !bowUp;
    const swingAge = now - (this.lastMeleeAt || 0);
    const swing = swingAge < 240 ? Math.sin((swingAge / 240) * Math.PI) : 0;
    const base = this.viewmodelBase || { x: 0.36, y: -0.34, z: -0.66 };
    // A narrow screen crops the world, not the weapon, so the blade is pushed
    // further from the lens on a phone than on a desktop monitor.
    const reach = this.camera.aspect < 1.3 ? -0.98 : base.z;
    const bob = this.reducedMotion ? 0 : Math.sin(this.walkPhase * 2) * 0.011;
    const swayX = this.reducedMotion ? 0 : Math.max(-0.05, Math.min(0.05, -this.lookDelta.x * 0.0011));
    const swayY = this.reducedMotion ? 0 : Math.max(-0.04, Math.min(0.04, -this.lookDelta.y * 0.0011));
    const decay = Math.max(0, 1 - dt * 9);
    this.lookDelta.x *= decay;
    this.lookDelta.y *= decay;
    rig.position.set(
      base.x + swayX - swing * 0.16,
      base.y + bob + swayY - swing * 0.06,
      reach + swing * 0.24,
    );
    if (bowUp) {
      // The bow is presented across the view, string hand low.
      rig.rotation.set(-0.05, -0.16, -0.08);
    } else {
      rig.rotation.set(-0.16 - swing * 0.55, -0.14 - swing * 0.22, 0.1 + swing * 0.7);
    }
  }

  loop(time) {
    if (this.destroyed) return;
    const dt = frameDelta((time - this.lastTime) / 1000);
    this.lastTime = time;
    const hitStop = (this.hitStopUntil || 0) > performance.now();
    // Slow-mo scales the simulation delta, never the camera: the world slows
    // while the framing stays responsive.
    const scaledDt = dt * this.timeScale(time);
    if (!hitStop && this.sceneState === 'playing' && !this.paused && !this.help && !this.hiddenPause && !this.contextLost) {
      const { steps, accumulator } = consumeFixedSteps(this.accumulator, scaledDt);
      this.accumulator = accumulator;
      for (let i = 0; i < steps; i += 1) this.fixedTick();
    }
    this.updateEffects(scaledDt);
    this.updateAtmosphere(scaledDt);
    this.updateViewmodel(dt);
    if (this.portal && !this.reducedMotion) this.portal.rotation.y += dt * 0.7;
    this.updateCamera(dt, time);
    this.renderer.render(this.scene, this.camera);
    // The world's own draw counters, captured before the weapon pass resets
    // them. A browser test can read them to see the room's real cost.
    this.worldCalls = this.renderer.info.render.calls;
    this.worldTriangles = this.renderer.info.render.triangles;
    // The weapon is composited on top of the world with a cleared depth
    // buffer, so it can never be clipped by a wall the player stands behind.
    if (this.viewScene && this.viewCamera && this.viewmodel?.visible) {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.viewScene, this.viewCamera);
      this.renderer.autoClear = true;
    }
    this.frames += 1;
    this.raf = requestAnimationFrame((next) => this.loop(next));
  }

  resize() {
    if (!this.renderer) return;
    const width = Math.max(2, this.stage.clientWidth);
    const height = Math.max(2, this.stage.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.viewCamera) {
      this.viewCamera.aspect = this.camera.aspect;
      this.viewCamera.updateProjectionMatrix();
    }
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
    // The canvas is about to leave the page: give the pointer back instead of
    // leaving the browser locked to a canvas that no longer exists.
    this.closeModal(this.modal, { restore: false });
    this.modal = undefined;
    this.disposers.splice(0).forEach((dispose) => { try { dispose(); } catch (_) {} });
    this.effects.forEach((effect) => { clearTimeout(effect.timer); effect.value?.remove?.(); effect.value?.removeFromParent?.(); });
    this.feedback?.clear();
    this.audio?.destroy();
    this.hud?.destroy();
    this.releaseStylesheet();
    // The room owns part of the scene: release it first so its resources
    // leave the global sets before the sets are emptied.
    this.disposeRoom();
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
    this.geometries.clear();
    this.materials.clear();
    // The generated environment map is a render target the renderer does not
    // own, so it has to be released with everything else.
    this.releaseEnvironment();
    // The dust sprite is a texture carried by the dust material: disposing
    // the material does not release the texture itself.
    this.dustTexture?.dispose?.();
    this.dustTexture = undefined;
    this.renderer?.dispose();
    if (typeof window !== 'undefined' && window.AIZANOI_DUNGEON_GAME === this.qaHandle) window.AIZANOI_DUNGEON_GAME = undefined;
    this.root?.remove();
  }
}
