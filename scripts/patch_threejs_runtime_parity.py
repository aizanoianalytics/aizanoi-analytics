from pathlib import Path

path = Path('experiments/threejs-rome-renderer/src/main.js')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one patch target, found {count}')
    text = text.replace(old, new, 1)


replace_once(
    "import { createAdaptiveQualityController } from '../../../frontend/ancient-world/engine/performance.js';\nimport { createRomeSimulation } from './rome-adapter.js';",
    "import { createAdaptiveQualityController } from '../../../frontend/ancient-world/engine/performance.js';\nimport { createLifecycle } from '../../../frontend/ancient-world/engine/lifecycle.js';\nimport { createRomeSimulation } from './rome-adapter.js';\nimport { installRomePocControls } from './runtime-controls.js';",
    'imports',
)

replace_once(
    "  const quality = createAdaptiveQualityController({\n    mobile,\n    highPixelRatio: simulation.manifest.performance.maxPixelRatioDesktop,\n    balancedPixelRatio: mobile ? simulation.manifest.performance.maxPixelRatioMobile : 1.30,\n    lowPixelRatio: mobile ? 0.85 : 1.0,\n  });\n\n  const renderer = new THREE.WebGLRenderer",
    "  const quality = createAdaptiveQualityController({\n    mobile,\n    highPixelRatio: simulation.manifest.performance.maxPixelRatioDesktop,\n    balancedPixelRatio: mobile ? simulation.manifest.performance.maxPixelRatioMobile : 1.30,\n    lowPixelRatio: mobile ? 0.85 : 1.0,\n  });\n  const lifecycle = createLifecycle();\n\n  const renderer = new THREE.WebGLRenderer",
    'lifecycle creation',
)

old_input = """  const keys = new Set();
  let last = performance.now();
  let lastMetrics = 0;
  let currentCap = -1;

  const clearKeys = () => keys.clear();
  window.addEventListener('keydown', (event) => {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
      keys.add(event.code);
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', clearKeys);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearKeys(); });
  renderer.domElement.addEventListener('click', () => renderer.domElement.requestPointerLock?.());
  document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement !== renderer.domElement) return;
    simulation.player.yaw -= event.movementX * 0.0024;
    simulation.player.pitch = Math.max(-1.1, Math.min(0.8, simulation.player.pitch - event.movementY * 0.002));
  });
"""
new_input = """  const controls = installRomePocControls({ lifecycle, renderer, simulation, mobile });
  const { keys } = controls;
  let last = performance.now();
  let lastMetrics = 0;
  let currentWidth = 0;
  let currentHeight = 0;
  let currentDpr = -1;

  lifecycle.addCleanup(() => {
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
    const geometries = new Set();
    const materials = new Set();
    scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      const material = object.material;
      if (Array.isArray(material)) material.forEach((item) => item && materials.add(item));
      else if (material) materials.add(material);
    });
    geometries.forEach((geometry) => geometry.dispose?.());
    materials.forEach((material) => material.dispose?.());
    renderer.dispose();
    renderer.forceContextLoss?.();
    renderer.domElement.remove();
  });
  lifecycle.listen(window, 'pagehide', () => lifecycle.destroy(), { once: true });
"""
replace_once(old_input, new_input, 'input/runtime block')

old_resize = """  function resize() {
    const cap = quality.pixelRatioCap();
    if (cap !== currentCap) {
      currentCap = cap;
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, cap));
    }
    const width = innerWidth;
    const height = innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }
"""
new_resize = """  function resize() {
    const cap = quality.pixelRatioCap();
    const dpr = Math.min(devicePixelRatio || 1, cap);
    const width = Math.max(1, innerWidth);
    const height = Math.max(1, innerHeight);
    if (width === currentWidth && height === currentHeight && dpr === currentDpr) return;
    currentWidth = width;
    currentHeight = height;
    currentDpr = dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
"""
replace_once(old_resize, new_resize, 'resize')

replace_once(
    "    requestAnimationFrame(frame);\n  }\n\n  window.__ROME_THREE_POC__ = {",
    "    lifecycle.frame(frame);\n  }\n\n  window.__ROME_THREE_POC__ = {",
    'frame scheduling',
)

replace_once(
    "    quality,\n    contract: simulation.manifest,\n  };",
    "    quality,\n    controls,\n    lifecycle,\n    contract: simulation.manifest,\n    destroy: () => lifecycle.destroy(),\n  };",
    'debug lifecycle exposure',
)

replace_once(
    "  statusEl.textContent = `Shared contract v${simulation.manifest.contractVersion} loaded · ${simulation.buildings.length} named records · ${simulation.urbanFabric.length} inferred blocks`;\n  requestAnimationFrame(frame);",
    "  statusEl.textContent = `Shared contract v${simulation.manifest.contractVersion} loaded · ${simulation.buildings.length} named records · ${simulation.urbanFabric.length} inferred blocks`;\n  resize();\n  lifecycle.frame(frame);",
    'initial scheduling',
)

path.write_text(text, encoding='utf-8')
print('Patched Three.js PoC lifecycle, controls, resize and teardown parity.')
