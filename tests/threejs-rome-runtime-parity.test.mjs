import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { installRomePocControls } from '../experiments/threejs-rome-renderer/src/runtime-controls.js';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const main = read('experiments/threejs-rome-renderer/src/main.js');
const index = read('experiments/threejs-rome-renderer/index.html');
const controlsSource = read('experiments/threejs-rome-renderer/src/runtime-controls.js');

test('Three.js PoC owns RAF/listeners through shared lifecycle and disposes renderer resources', () => {
  assert.match(main, /createLifecycle/);
  assert.match(main, /lifecycle\.listen\(window, 'pagehide'/);
  assert.match(main, /lifecycle\.frame\(frame\)/);
  assert.match(main, /renderer\.dispose\(\)/);
  assert.match(main, /forceContextLoss/);
  assert.doesNotMatch(main, /requestAnimationFrame\(frame\)/);
});

test('Three.js PoC resizes only when viewport or DPR changes', () => {
  assert.match(main, /width === currentWidth && height === currentHeight && dpr === currentDpr/);
  assert.match(main, /renderer\.setPixelRatio\(dpr\)/);
  assert.match(main, /renderer\.setSize\(width, height, false\)/);
});

test('Three.js PoC exposes mobile movement, look and landmark controls', () => {
  assert.match(index, /data-move="KeyW"/);
  assert.match(index, /id="lookPad"/);
  assert.match(index, /id="jump"/);
  assert.match(controlsSource, /setPointerCapture/);
  assert.match(controlsSource, /teleportTarget/);
});

test('teleport parity resolves a safe spawn, support height and orientation', () => {
  class FakeDocument extends EventTarget {
    constructor(jump) {
      super();
      this.jump = jump;
      this.hidden = false;
      this.pointerLockElement = null;
    }
    querySelectorAll() { return []; }
    querySelector(selector) { return selector === '#jump' ? this.jump : null; }
    exitPointerLock() { this.pointerLockElement = null; }
  }

  const jump = new EventTarget();
  jump.innerHTML = '';
  jump.value = '';
  const domElement = new EventTarget();
  domElement.requestPointerLock = () => {};

  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  const fakeWindow = new EventTarget();
  const fakeDocument = new FakeDocument(jump);
  globalThis.window = fakeWindow;
  globalThis.document = fakeDocument;

  try {
    const listeners = [];
    const lifecycle = {
      listen(target, type, handler) {
        target.addEventListener(type, handler);
        listeners.push([target, type, handler]);
        return handler;
      },
      addCleanup() {},
    };
    const simulation = {
      manifest: {
        teleportTargets: [
          { id: 'forum-target', name: 'Forum', monumentId: 'forum', position: { x: 10, z: 20 } },
        ],
      },
      buildings: [
        { id: 'forum', x: 10, z: 20, w: 10, d: 10 },
      ],
      player: { x: 0, y: 1.68, z: 0, yaw: 0, pitch: 0, floorY: 0, surfaceTag: 'ground' },
      traversal: {
        resolveSpawn(x, z) { return { x, z }; },
        collide() { return false; },
        absoluteSupportAt() { return { y: 3, tag: 'road' }; },
      },
    };

    const controls = installRomePocControls({
      lifecycle,
      renderer: { domElement },
      simulation,
      mobile: false,
    });

    assert.equal(controls.teleportTarget('forum-target'), true);
    assert.equal(simulation.player.x, 10);
    assert.ok(simulation.player.z < 20);
    assert.equal(simulation.player.floorY, 3);
    assert.equal(simulation.player.surfaceTag, 'road');
    assert.equal(simulation.player.y, 4.68);
    assert.notEqual(simulation.player.yaw, 0);
    assert.equal(simulation.player.pitch, -0.03);
    assert.match(jump.innerHTML, /Forum/);

    for (const [target, type, handler] of listeners) target.removeEventListener(type, handler);
  } finally {
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  }
});
