// src/index.js — Aizanoi Dungeon 3D (Three.js) module entry.
// AizanoiOS Module Entry Contract: export mount({container, api}) -> teardown.
//
// Boot: attract scene (kit floor grid + column row + hero + enemy + chest +
// portal, slow auto-orbit) renders immediately behind a title/menu overlay.
// Begin dismisses the overlay, enables input, and flips the QA scene flag.
//
// Worlds rules: no CDN, no new Three copy — single vendored r174 under
// frontend/worlds/shared/vendor/. Asset URLs resolve via import.meta.url.

import * as THREE from '../../../../../worlds/shared/vendor/three.module.js';
import { GLTFLoader } from '../../../../../worlds/shared/vendor/GLTFLoader.js';

const APP_ID = 'dungeon';
const GLB_BASE = new URL('../assets/glb/', import.meta.url);

const KIT_FILES = {
  floor: 'floor_tile.glb',
  wall: 'wall_block.glb',
  column: 'column.glb',
  hero: 'hero_knight.glb',
  enemy: 'enemy_slime_golem.glb',
  chest: 'treasure_chest.glb',
  portal: 'portal_ring.glb',
};

function hasWebGL2() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    return Boolean(gl);
  } catch (_) {
    return false;
  }
}

function showCard(container, title, detail) {
  container.replaceChildren();
  const card = document.createElement('div');
  card.className = 'aizanoi-dungeon3d-card';
  card.setAttribute('role', 'alert');
  const h = document.createElement('strong');
  h.textContent = title;
  const p = document.createElement('p');
  p.textContent = detail;
  card.append(h, p);
  container.appendChild(card);
  return card;
}

// Minimal orbit + WASD-fly camera (no OrbitControls in shared vendor).
// Input is gated by isEnabled: while the title overlay is up the scene
// auto-orbits as an attract loop and ignores pointer/keyboard input.
function attachCameraControls(camera, dom, onDispose, isEnabled) {
  const target = new THREE.Vector3(0, 1, 0);
  const spherical = new THREE.Spherical(12, Math.PI / 3.2, Math.PI / 4);
  const keys = new Set();
  let dragging = false;
  let px = 0;
  let py = 0;
  let disposed = false;

  function apply() {
    camera.position.set(
      target.x + spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta),
      target.y + spherical.radius * Math.cos(spherical.phi),
      target.z + spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta),
    );
    camera.lookAt(target);
  }

  const onPointerDown = (e) => {
    if (!isEnabled()) return;
    dragging = true; px = e.clientX; py = e.clientY;
  };
  const onPointerMove = (e) => {
    if (!dragging || !isEnabled()) return;
    spherical.theta -= (e.clientX - px) * 0.005;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi - (e.clientY - py) * 0.005, 0.15, Math.PI / 2 - 0.05);
    px = e.clientX; py = e.clientY;
    apply();
  };
  const onPointerUp = () => { dragging = false; };
  const onWheel = (e) => {
    if (!isEnabled()) return;
    e.preventDefault();
    spherical.radius = THREE.MathUtils.clamp(spherical.radius + e.deltaY * 0.01, 4, 30);
    apply();
  };
  // Touch: single-finger orbit, pinch zoom.
  let pinchD = 0;
  const startTouch = (e) => {
    if (!isEnabled()) return;
    if (e.touches.length === 1) { dragging = true; px = e.touches[0].clientX; py = e.touches[0].clientY; }
    else if (e.touches.length === 2) {
      dragging = false;
      pinchD = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }
  };
  const onTouchMove = (e) => {
    if (!isEnabled()) return;
    if (e.touches.length === 1 && dragging) {
      spherical.theta -= (e.touches[0].clientX - px) * 0.006;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi - (e.touches[0].clientY - py) * 0.006, 0.15, Math.PI / 2 - 0.05);
      px = e.touches[0].clientX; py = e.touches[0].clientY;
      apply();
    } else if (e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      spherical.radius = THREE.MathUtils.clamp(spherical.radius - (d - pinchD) * 0.02, 4, 30);
      pinchD = d;
      apply();
    }
    if (e.cancelable) e.preventDefault();
  };
  const endTouch = () => { dragging = false; };
  const onKeyDown = (e) => { if (isEnabled()) keys.add(e.code); };
  const onKeyUp = (e) => keys.delete(e.code);

  dom.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  dom.addEventListener('wheel', onWheel, { passive: false });
  dom.addEventListener('touchstart', startTouch, { passive: true });
  dom.addEventListener('touchmove', onTouchMove, { passive: false });
  dom.addEventListener('touchend', endTouch);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // WASD/arrows fly the orbit target across the floor plane.
  // Disabled (menu/attract): slow auto-orbit instead.
  const tick = (dt) => {
    if (disposed) return;
    if (!isEnabled()) {
      spherical.theta += dt * 0.15;
      apply();
      return;
    }
    const speed = 6 * dt;
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).negate();
    if (keys.has('KeyW') || keys.has('ArrowUp')) target.addScaledVector(fwd, speed);
    if (keys.has('KeyS') || keys.has('ArrowDown')) target.addScaledVector(fwd, -speed);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) target.addScaledVector(right, -speed);
    if (keys.has('KeyD') || keys.has('ArrowRight')) target.addScaledVector(right, speed);
    target.x = THREE.MathUtils.clamp(target.x, -14, 14);
    target.z = THREE.MathUtils.clamp(target.z, -14, 14);
    apply();
  };

  apply();
  const dispose = () => {
    disposed = true;
    dom.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    dom.removeEventListener('wheel', onWheel);
    dom.removeEventListener('touchstart', startTouch);
    dom.removeEventListener('touchmove', onTouchMove);
    dom.removeEventListener('touchend', endTouch);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  };
  onDispose(dispose);
  return { tick, getTarget: () => target };
}

async function loadKit() {
  const loader = new GLTFLoader();
  const entries = await Promise.all(
    Object.entries(KIT_FILES).map(async ([key, file]) => {
      const url = new URL(file, GLB_BASE).href;
      const gltf = await loader.loadAsync(url);
      return [key, gltf.scene];
    }),
  );
  return Object.fromEntries(entries);
}

function buildMenuOverlay(onBegin) {
  const overlay = document.createElement('div');
  overlay.className = 'az-dungeon-menu';
  const title = document.createElement('h1');
  title.className = 'az-dungeon-menu-title';
  title.textContent = 'Aizanoi Dungeon';
  const sub = document.createElement('p');
  sub.className = 'az-dungeon-menu-sub';
  sub.textContent = 'A 3D descent beneath the Zeus Temple — drag to look, WASD to roam.';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'az-dungeon-begin';
  btn.textContent = 'Begin';
  btn.addEventListener('click', onBegin);
  overlay.append(title, sub, btn);
  return { overlay, beginBtn: btn };
}

/**
 * Public AizanoiOS module entry point.
 * Mirrors the old 2D src/index.js mount/teardown shape (exit button,
 * QA handle, ResizeObserver, teardown).
 */
export async function mount({ container, api }) {
  // Clear the shell's "Opening application…" placeholder like the 2D entry did.
  container.replaceChildren();
  // Inject the module stylesheet (route CSP forbids inline styles).
  if (typeof document !== 'undefined' && !document.getElementById('aizanoi-dungeon-css')) {
    const styleLink = document.createElement('link');
    styleLink.id = 'aizanoi-dungeon-css';
    styleLink.rel = 'stylesheet';
    styleLink.href = new URL('../css/game.css', import.meta.url).href;
    document.head.appendChild(styleLink);
  }

  // QA contract: set on mount, cleared on teardown.
  const qaHandle = { started: true, engine: 'three', scene: 'menu' };
  if (typeof window !== 'undefined') {
    window.AIZANOI_DUNGEON_GAME = qaHandle;
  }

  if (!hasWebGL2()) {
    showCard(
      container,
      'Aizanoi Dungeon 3D needs WebGL2',
      'Your browser or device reported no WebGL2 context (Three.js r174 requires it). ' +
        'Update your browser/GPU drivers and try again.',
    );
    return () => {
      if (typeof window !== 'undefined' && window.AIZANOI_DUNGEON_GAME === qaHandle) {
        window.AIZANOI_DUNGEON_GAME = undefined;
      }
    };
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'aizanoi-dungeon3d-app-root';

  const exitBtn = document.createElement('button');
  exitBtn.type = 'button';
  exitBtn.className = 'az-dungeon-exit';
  exitBtn.setAttribute('aria-label', 'Return to AizanoiOS');
  const exitArrow = document.createElement('span');
  exitArrow.setAttribute('aria-hidden', 'true');
  exitArrow.className = 'az-dungeon-exit-arrow';
  exitArrow.textContent = '←';
  const exitLabel = document.createElement('span');
  exitLabel.className = 'az-dungeon-exit-label';
  exitLabel.textContent = 'AizanoiOS';
  exitBtn.append(exitArrow, exitLabel);
  exitBtn.addEventListener('click', () => {
    try { api?.closeApp?.(APP_ID); } catch (_) {}
  });
  wrapper.appendChild(exitBtn);
  container.appendChild(wrapper);

  const canvasHost = document.createElement('div');
  canvasHost.className = 'az-dungeon3d-stage';
  wrapper.appendChild(canvasHost);

  // Input stays disabled behind the menu overlay; the attract scene
  // renders immediately on load.
  let inputEnabled = false;
  const isEnabled = () => inputEnabled;
  const { overlay } = buildMenuOverlay(() => {
    inputEnabled = true;
    qaHandle.scene = 'active';
    overlay.remove();
  });
  wrapper.appendChild(overlay);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (err) {
    console.error('[Aizanoi Dungeon3D] Renderer init failed:', err);
    showCard(container, 'Aizanoi Dungeon 3D could not start', 'The 3D engine (Three.js) failed to initialize on this device.');
    throw err;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(canvasHost.clientWidth || 2, canvasHost.clientHeight || 2);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  canvasHost.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e1a);
  scene.fog = new THREE.Fog(0x0b0e1a, 18, 46);

  const camera = new THREE.PerspectiveCamera(
    60,
    (canvasHost.clientWidth || 16) / (canvasHost.clientHeight || 9),
    0.1,
    200,
  );

  scene.add(new THREE.HemisphereLight(0xbfc8ff, 0x1a1428, 0.9));
  const sun = new THREE.DirectionalLight(0xfff2d9, 1.6);
  sun.position.set(6, 10, 4);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x7aa2ff, 0.5);
  rim.position.set(-6, 4, -6);
  scene.add(rim);

  const disposers = [];
  const onDispose = (fn) => disposers.push(fn);
  const controls = attachCameraControls(camera, renderer.domElement, onDispose, isEnabled);

  // Boot scene composition: floor grid + column row + hero + enemy + chest + portal.
  try {
    const kit = await loadKit();

    const GRID = 7; // 7x7 floor tiles (~14m)
    const TILE = 2;
    for (let ix = 0; ix < GRID; ix++) {
      for (let iz = 0; iz < GRID; iz++) {
        const tile = kit.floor.clone();
        tile.position.set((ix - (GRID - 1) / 2) * TILE, 0, (iz - (GRID - 1) / 2) * TILE);
        scene.add(tile);
      }
    }

    // Column row along the north edge.
    for (let i = -2; i <= 2; i++) {
      const col = kit.column.clone();
      col.position.set(i * 2.6, 0, -6);
      scene.add(col);
    }

    const hero = kit.hero;
    hero.position.set(-2, 0, 2);
    scene.add(hero);

    const enemy = kit.enemy;
    enemy.position.set(2.5, 0, -1.5);
    enemy.rotation.y = -0.6;
    scene.add(enemy);

    const chest = kit.chest;
    chest.position.set(4.5, 0, 3.5);
    scene.add(chest);

    const portal = kit.portal;
    portal.position.set(-4.5, 0, -3.5);
    scene.add(portal);
  } catch (err) {
    console.error('[Aizanoi Dungeon3D] Kit load failed:', err);
    showCard(container, 'Aizanoi Dungeon 3D could not load', 'A 3D asset failed to load. Close the window and try again.');
    throw err;
  }

  // (QA handle is set on mount per the contract above; no scene leak here.)

  let rafId = 0;
  let tornDown = false;
  let last = performance.now();
  const loop = (now) => {
    if (tornDown) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    controls.tick(dt);
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);

  let resizeObserver = null;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      const w = canvasHost.clientWidth || 2;
      const h = canvasHost.clientHeight || 2;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(canvasHost);
  }

  return () => {
    if (tornDown) return;
    tornDown = true;
    try {
      cancelAnimationFrame(rafId);
      if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
      for (const fn of disposers) { try { fn(); } catch (_) {} }
      scene.traverse((obj) => {
        if (obj.geometry) { try { obj.geometry.dispose(); } catch (_) {} }
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) { try { m.dispose(); } catch (_) {} }
        }
      });
      renderer.dispose();
      if (typeof window !== 'undefined' && window.AIZANOI_DUNGEON_GAME === qaHandle) {
        window.AIZANOI_DUNGEON_GAME = undefined;
      }
    } catch (err) {
      console.warn('[Aizanoi Dungeon3D] Error during teardown:', err);
    }
    wrapper.remove();
  };
}
