function safeUrl() {
  try { return new URL(location.href); } catch { return null; }
}

function replaceUrl(url) {
  if (!url) return;
  const next = `${url.pathname}${url.search}${url.hash}`;
  history.replaceState(history.state, '', next);
}

function activateWithoutPointerLock(button, canvas) {
  if (!button) return;
  if (!canvas || typeof canvas.requestPointerLock !== 'function') {
    button.click();
    return;
  }
  const hadOwn = Object.prototype.hasOwnProperty.call(canvas, 'requestPointerLock');
  const previous = hadOwn ? Object.getOwnPropertyDescriptor(canvas, 'requestPointerLock') : null;
  let shadowed = false;
  try {
    Object.defineProperty(canvas, 'requestPointerLock', { configurable:true, writable:true, value:() => undefined });
    shadowed = true;
  } catch (_) {}
  try { button.click(); }
  finally {
    if (!shadowed) return;
    try {
      if (previous) Object.defineProperty(canvas, 'requestPointerLock', previous);
      else delete canvas.requestPointerLock;
    } catch (_) {}
  }
}

function canonicalPeriod(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.trunc(number)) : null;
}

/**
 * Canonical share contract for Historical Worlds.
 *
 * `?at=<landmark-id>` opens a safe landmark approach.
 * `?period=<era>` activates only a city-declared shareable era.
 * Legacy `?jump=` remains owned by city-compatibility.js.
 */
export function installShareableLocation(runtime, { ui = 'standard', periods = [] } = {}) {
  const debug = runtime?.debug;
  if (!debug) return Object.freeze({ destroy() {}, sync() {} });

  const canvas = document.querySelector('#glCanvas');
  const entry = document.querySelector(ui === 'aizanoi' ? '#enterBtn' : '#enter');
  const allowedPeriods = new Set(periods.map(canonicalPeriod).filter(Boolean));
  let destroyed = false;
  const listeners = [];

  function setParam(name, value) {
    const url = safeUrl();
    if (!url) return;
    if (value == null || value === '') url.searchParams.delete(name);
    else url.searchParams.set(name, String(value));
    if (name === 'at') url.searchParams.delete('jump');
    replaceUrl(url);
  }

  const rawTeleport = typeof debug.teleportTo === 'function' ? debug.teleportTo.bind(debug) : null;
  if (rawTeleport) {
    debug.teleportTo = (id, options = {}) => {
      const ok = rawTeleport(id, options);
      if (ok && options?.updateShareUrl !== false) setParam('at', id);
      return ok;
    };
    debug.teleport = (...args) => debug.teleportTo(...args);
  }

  function applyPeriod(period) {
    const canonical = canonicalPeriod(period);
    if (!canonical || !allowedPeriods.has(canonical)) return false;
    const button = [...document.querySelectorAll('.eraBtn[data-era]')]
      .find((node) => canonicalPeriod(node.dataset.era) === canonical);
    if (!button) return false;
    button.click();
    setParam('period', canonical);
    return true;
  }

  for (const button of document.querySelectorAll('.eraBtn[data-era]')) {
    const canonical = canonicalPeriod(button.dataset.era);
    if (!canonical || !allowedPeriods.has(canonical)) continue;
    const handler = () => setParam('period', canonical);
    button.addEventListener('click', handler);
    listeners.push([button, handler]);
  }

  function applyInitialLocation() {
    const url = safeUrl();
    if (!url) return;
    const period = url.searchParams.get('period');
    if (period) applyPeriod(period);
    const at = url.searchParams.get('at');
    if (!at || !debug.landmarks?.some((record) => record.id === at)) return;
    activateWithoutPointerLock(entry, canvas);
    debug.teleportTo?.(at, { lock:false, updateShareUrl:false });
  }

  applyInitialLocation();

  return Object.freeze({
    setLocation(id) { if (id) debug.teleportTo?.(id); },
    setPeriod:applyPeriod,
    periods:Object.freeze([...allowedPeriods]),
    sync() {
      const url = safeUrl();
      return Object.freeze({ at:url?.searchParams.get('at') || null, period:url?.searchParams.get('period') || null });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const [node, handler] of listeners) node.removeEventListener('click', handler);
      if (rawTeleport) {
        debug.teleportTo = rawTeleport;
        debug.teleport = (...args) => debug.teleportTo(...args);
      }
    },
  });
}
