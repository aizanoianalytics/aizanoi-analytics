const MOVE_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight']);

function lookAtMonument(player, monument) {
  if (!monument) return;
  player.yaw = Math.atan2(monument.x - player.x, -(monument.z - player.z));
  player.pitch = -0.03;
}

function safeSpawnNearMonument(simulation, monument) {
  const offsets = [
    [0, -monument.d * 0.72 - 8],
    [monument.w * 0.72 + 8, 0],
    [0, monument.d * 0.72 + 8],
    [-monument.w * 0.72 - 8, 0],
  ];
  for (const [ox, oz] of offsets) {
    const candidate = simulation.traversal.resolveSpawn(monument.x + ox, monument.z + oz, 22);
    if (!simulation.traversal.collide(candidate.x, candidate.z)) return candidate;
  }
  return simulation.traversal.resolveSpawn(monument.x, monument.z - monument.d * 0.72 - 8, 22);
}

export function installRomePocControls({ lifecycle, renderer, simulation, mobile = false }) {
  if (!lifecycle || !renderer?.domElement || !simulation?.traversal) {
    throw new TypeError('installRomePocControls requires lifecycle, renderer and simulation.');
  }

  const keys = new Set();
  const clearKeys = () => keys.clear();

  function teleportTarget(targetId) {
    const target = simulation.manifest.teleportTargets.find((item) => item.id === targetId);
    if (!target) return false;
    const monument = target.monumentId
      ? simulation.buildings.find((item) => item.id === target.monumentId)
      : null;
    const spawn = monument
      ? safeSpawnNearMonument(simulation, monument)
      : simulation.traversal.resolveSpawn(target.position.x, target.position.z, 22);
    const support = simulation.traversal.absoluteSupportAt(spawn.x, spawn.z);
    simulation.player.x = spawn.x;
    simulation.player.z = spawn.z;
    simulation.player.floorY = support.y;
    simulation.player.surfaceTag = support.tag;
    simulation.player.y = support.y + 1.68;
    clearKeys();
    lookAtMonument(simulation.player, monument);
    return true;
  }

  lifecycle.listen(window, 'keydown', (event) => {
    if (!MOVE_CODES.has(event.code)) return;
    keys.add(event.code);
    event.preventDefault();
  });
  lifecycle.listen(window, 'keyup', (event) => keys.delete(event.code));
  lifecycle.listen(window, 'blur', clearKeys);
  lifecycle.listen(document, 'visibilitychange', () => { if (document.hidden) clearKeys(); });

  lifecycle.listen(renderer.domElement, 'click', () => {
    if (!mobile) renderer.domElement.requestPointerLock?.();
  });
  lifecycle.listen(document, 'mousemove', (event) => {
    if (document.pointerLockElement !== renderer.domElement) return;
    simulation.player.yaw -= event.movementX * 0.0024;
    simulation.player.pitch = Math.max(-1.1, Math.min(0.8, simulation.player.pitch - event.movementY * 0.002));
  });

  document.querySelectorAll('[data-move]').forEach((button) => {
    const code = button.dataset.move;
    const down = (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      keys.add(code);
    };
    const up = (event) => {
      event.preventDefault();
      keys.delete(code);
    };
    lifecycle.listen(button, 'pointerdown', down);
    lifecycle.listen(button, 'pointerup', up);
    lifecycle.listen(button, 'pointercancel', up);
    lifecycle.listen(button, 'lostpointercapture', up);
  });

  const lookPad = document.querySelector('#lookPad');
  if (lookPad) {
    let pointerId = null;
    let lastX = 0;
    let lastY = 0;
    lifecycle.listen(lookPad, 'pointerdown', (event) => {
      event.preventDefault();
      pointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      lookPad.setPointerCapture?.(event.pointerId);
    });
    lifecycle.listen(lookPad, 'pointermove', (event) => {
      if (event.pointerId !== pointerId) return;
      event.preventDefault();
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      if (Math.hypot(dx, dy) < 1.5) return;
      simulation.player.yaw -= dx * 0.0052;
      simulation.player.pitch = Math.max(-1.1, Math.min(0.8, simulation.player.pitch - dy * 0.0042));
    });
    const stop = (event) => { if (event.pointerId === pointerId) pointerId = null; };
    lifecycle.listen(lookPad, 'pointerup', stop);
    lifecycle.listen(lookPad, 'pointercancel', stop);
    lifecycle.listen(lookPad, 'lostpointercapture', stop);
  }

  const jump = document.querySelector('#jump');
  if (jump) {
    jump.innerHTML = '<option value="">Jump to landmark…</option>' + simulation.manifest.teleportTargets
      .map((target) => `<option value="${target.id}">${target.name || target.monumentId || target.id}</option>`)
      .join('');
    lifecycle.listen(jump, 'change', (event) => {
      if (event.target.value) teleportTarget(event.target.value);
      event.target.value = '';
    });
  }

  lifecycle.addCleanup(clearKeys);
  return Object.freeze({ keys, clearKeys, teleportTarget });
}
