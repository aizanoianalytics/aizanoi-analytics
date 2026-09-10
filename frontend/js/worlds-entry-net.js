/* worlds-entry-net.js — Worlds entry safety net (classic script, CSP-safe).
 * Loads BEFORE any ES module on every world page so nothing can crash silently
 * again: device-reported "Enter does nothing / Try Again loops" previously died
 * inside module graph evaluation with zero visible output on phones.
 *
 *  - Records window 'error' / 'unhandledrejection' into window.__WORLDS_ENTRY_NET__
 *  - Probes WebGL2 (three.js r174 requires WebGL 2; WebGL 1 contexts crash init)
 *  - Reports service-worker controller state (stale-shell detection)
 *  - main.js init() catch handlers call recordInitCatch() for named world errors
 */
(function () {
  'use strict';
  var state = {
    ua: navigator.userAgent,
    startedAt: new Date().toISOString(),
    webgl2: null,
    errors: [],
    initCatches: [],
    sw: {},
  };

  function briefError(err) {
    if (!err) return 'unknown';
    var msg = err.message || String(err);
    var stack = err.stack ? String(err.stack).split('\n').slice(0, 4).join(' | ') : '';
    return (msg + (stack ? ' :: ' + stack : '')).slice(0, 600);
  }

  function record(kind, err) {
    var entry = { kind: kind, at: new Date().toISOString(), detail: briefError(err) };
    state.errors.push(entry);
    if (state.errors.length > 20) state.errors.shift();
    try { console.warn('[worlds-entry-net]', kind, entry.detail); } catch (e) { /* noop */ }
  }

  window.addEventListener('error', function (event) { record('error', event.error || event.message); }, true);
  window.addEventListener('unhandledrejection', function (event) { record('unhandledrejection', event.reason); });

  function probeWebGL2() {
    try {
      var gl = document.createElement('canvas').getContext('webgl2');
      state.webgl2 = Boolean(gl);
      if (gl) {
        state.glVersion = gl.getParameter ? gl.getParameter(gl.VERSION) : null;
        state.glRenderer = gl.getParameter ? gl.getParameter(gl.RENDERER) : null;
      }
    } catch (err) {
      state.webgl2 = false;
      state.glProbeError = briefError(err);
    }
  }

  function probeServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      state.sw = { supported: false };
      return;
    }
    state.sw.supported = true;
    state.sw.controller = navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : null;
    navigator.serviceWorker.register('/service-worker.js', { scope: '/', updateViaCache: 'none' }).then(function (reg) {
      state.sw.registration = {
        scope: reg.scope,
        installing: Boolean(reg.installing),
        waiting: Boolean(reg.waiting),
        active: reg.active ? reg.active.scriptURL : null,
      };
      return navigator.serviceWorker.getRegistrations();
    }).then(function (regs) {
      state.sw.registrations = regs.map(function (r) {
        return {
          scope: r.scope,
          installing: Boolean(r.installing),
          waiting: Boolean(r.waiting),
          active: r.active ? r.active.scriptURL : null,
        };
      });
    }).catch(function () { /* best effort */ });
  }

  function escapeHtml(s) {
    return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  }

  function renderWebGL2Message(worldName) {
    var el = document.getElementById('loading-screen');
    if (!el) return;
    var iosMatch = /OS (\d+)[._](\d+)/.exec(navigator.userAgent);
    var osHint = iosMatch ? 'Detected OS version: ' + iosMatch[1] + '.' + iosMatch[2] : '';
    el.innerHTML = `
      <div class="runtime-message" role="alert">
        <h2>This world needs WebGL 2</h2>
        <p>Your browser reported no WebGL 2 context. On iPhone or iPad, update iOS in
        Settings → General → Software Update (iOS 15 or newer). On desktop, update
        your browser or enable hardware acceleration.</p>
        <p style="opacity:0.7;font-size:0.8rem;">${escapeHtml(osHint || navigator.userAgent.slice(0, 140))}</p>
      </div>`;
    state.webgl2MessageShownFor = worldName || 'world';
  }

  window.__WORLDS_ENTRY_NET__ = {
    state: state,
    recordInitCatch: function (worldName, err) {
      var entry = { world: worldName, at: new Date().toISOString(), detail: briefError(err) };
      state.initCatches.push(entry);
      try { console.warn('[worlds-entry-net] init catch', worldName, entry.detail); } catch (e) { /* noop */ }
      return entry;
    },
    requireWebGL2: function (worldName) {
      if (state.webgl2 === null) probeWebGL2();
      if (!state.webgl2) renderWebGL2Message(worldName);
      return state.webgl2;
    },
    report: function () { return JSON.parse(JSON.stringify(state)); },
  };

  probeWebGL2();
  probeServiceWorker();
})();
