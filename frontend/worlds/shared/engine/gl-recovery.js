/* gl-recovery.js — WebGL context-loss handling
 * Aizanoi Analytics unified worlds runtime
 *
 * iOS Safari and memory-pressured Android kill WebGL contexts without asking
 * (background the tab, open another heavy site, thermal pressure). The canvas
 * then goes black and every control dies silently — users report it as
 * "the world won't open". The WEBGL_lose_context extension aside, a lost
 * context on mobile Safari almost never restores cleanly, so the honest
 * recovery is: detect it, stop the loop, and surface a clear reload surface.
 *
 * Dependency-free (DOM + renderer duck-type).
 */

/**
 * Wire context-loss handlers onto the renderer's canvas.
 * @param {object} renderer - WebGLRenderer (reads .domElement)
 * @param {object} [opts] { onLost?: () => void }
 * @returns {() => void} detach function
 */
export function installContextLossGuard(renderer, opts = {}) {
  const canvas = renderer?.domElement || (typeof document !== 'undefined' ? document.getElementById('viewport') : null);
  if (!canvas) return () => {};

  const onLost = (event) => {
    // We never restore in place: pose blending, textures and GPU programs are
    // gone; a half-restored context renders garbage. Reload is the fix.
    event.preventDefault();
    const el = document.getElementById('loading-screen');
    if (el && el.style.display !== 'none') {
      // Reuse the loading surface if it is still up.
      el.style.display = 'flex';
      showLost(el);
    } else {
      const overlay = document.createElement('div');
      overlay.id = 'gl-lost-overlay';
      overlay.setAttribute('style',
        'position:fixed;inset:0;z-index:120;background:rgba(10,8,6,0.92);display:flex;align-items:center;justify-content:center;color:#e8ddc4;font-family:Georgia,serif;text-align:center;');
      showLost(overlay);
      document.body.appendChild(overlay);
    }
    opts.onLost?.();
  };

  const showLost = (container) => {
    container.innerHTML = `
      <div role="alert" style="max-width:420px;padding:32px;">
        <h2 style="margin:0 0 12px;font-weight:normal;letter-spacing:1px;">Graphics session ended</h2>
        <p style="margin:0 0 20px;opacity:0.8;font-size:0.95rem;">The browser reclaimed the 3D context (memory or backgrounding). Reload to continue exploring.</p>
        <button type="button" id="btn-gl-reload" class="btn-primary">Reload World</button>
      </div>`;
    container.querySelector('#btn-gl-reload')?.addEventListener('click', () => window.location.reload());
  };

  canvas.addEventListener('webglcontextlost', onLost, false);
  return () => canvas.removeEventListener('webglcontextlost', onLost, false);
}
