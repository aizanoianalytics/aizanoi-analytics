(function () {
  'use strict';

  const DIRECTIONS = new Set(['up', 'down', 'left', 'right']);
  const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const KEYS = {
    wasd: { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', Space: 'action' },
    arrows: { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'action' },
  };

  function create(scheme) {
    if (!Object.prototype.hasOwnProperty.call(KEYS, scheme)) {
      throw new TypeError('Unknown input scheme: ' + scheme);
    }

    let direction = 'up', committed = 'up', enabled = false, destroyed = false;
    const callbacks = new Set(), pads = new Map();

    function set(dir) {
      if (!destroyed && DIRECTIONS.has(dir) && dir !== OPPOSITE[committed]) {
        direction = dir;
      }
    }

    function reset(dir) {
      if (!destroyed && DIRECTIONS.has(dir)) {
        direction = dir;
        committed = dir;
      }
    }

    function dispatch(action, event) {
      if (DIRECTIONS.has(action)) set(action);
      callbacks.forEach(fn => fn(action, event));
    }

    function keydown(event) {
      if (!enabled || destroyed || event.defaultPrevented || event.isComposing) return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;

      const target = event.target;
      if (target instanceof Element &&
          target.closest('select, input, textarea, [contenteditable]:not([contenteditable="false"])')) return;

      const action = KEYS[scheme][event.code];
      if (!action) return;
      if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
      dispatch(action, event);
    }

    function attachPad(rootEl) {
      if (destroyed || !rootEl || pads.has(rootEl)) return;

      const handler = event => {
        const target = event.target instanceof Element ? event.target.closest('button[data-dir]') : null;
        if (!enabled || !target || !rootEl.contains(target)) return;
        const action = target.dataset.dir;
        if (DIRECTIONS.has(action)) dispatch(action, event);
      };

      rootEl.addEventListener('click', handler);
      pads.set(rootEl, handler);
    }

    function onKey(fn) {
      if (typeof fn !== 'function') throw new TypeError('Expected a callback');
      if (!destroyed) callbacks.add(fn);
      return () => callbacks.delete(fn);
    }

    function enable(on) {
      enabled = !destroyed && Boolean(on);
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      enabled = false;
      window.removeEventListener('keydown', keydown);
      pads.forEach((handler, rootEl) => rootEl.removeEventListener('click', handler));
      pads.clear();
      callbacks.clear();
    }

    window.addEventListener('keydown', keydown);

    return {
      get dir() { return direction; },
      set,
      reset,
      attachPad,
      onKey,
      enable,
      destroy,
    };
  }

  window.ArenaInput = { create };
})();
