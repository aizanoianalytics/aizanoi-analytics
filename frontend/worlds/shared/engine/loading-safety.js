/* loading-safety.js — Loading watchdog & fatal-init error surface
 * Aizanoi Analytics unified worlds runtime
 *
 * Two failure modes this module closes:
 *
 * 1. Silent init death. If init() throws (WebGL context loss, module error,
 *    OOM on a low device), the loading screen used to stay on its last
 *    "Entering <city>..." message forever with zero feedback — the exact
 *    "stuck at Entering city" report. showFatalInitError replaces the loading
 *    content with an honest error and a Try Again button that refreshes the
 *    service worker and cache-busts the navigation.
 *
 * 2. Very slow init. Nothing throws, but on a throttled phone the spinner can
 *    legitimately run 30s+. After the grace period the watchdog surfaces a
 *    "still working" note with a Try Again button so the player can refresh
 *    the SW and bypass a stale navigation cache instead of staying imprisoned
 *    behind a spinner. It never hides the loading screen or touches world
 *    state — worst case it adds an escape hatch.
 *
 * Dependency-free (DOM only), like the rest of the runtime.
 */

const WATCHDOG_POLL_MS = 1000;

export async function retryWorldEntry(button) {
  if (button) {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Refreshing…';
  }
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration('/');
      if (registration) await registration.update();
    }
  } catch (error) {
    // Recovery navigation must still happen if Safari rejects an SW update.
    console.warn('World entry service-worker refresh failed:', error);
  } finally {
    const url = new URL(window.location.href);
    url.searchParams.set('entryRetry', Date.now().toString(36));
    window.location.replace(url.href);
  }
}

export function showFatalInitError(err, worldName = 'this world') {
  const el = document.getElementById('loading-screen');
  if (!el) return;
  const message = (err && (err.stack || err.message)) ? String(err.stack || err.message).slice(0, 400) : String(err || 'Unknown error');
  el.innerHTML = `
    <div class="loading-content" role="alert">
      <h2 class="loading-title">${escapeHtml(worldName)} could not start</h2>
      <p style="color:#c8b894;margin:0 0 18px;font-size:0.95rem;">
        Your browser or device refused part of the 3D engine
        (graphics context, memory or a blocked resource).
      </p>
      <button type="button" id="btn-retry-entry" class="btn-primary" style="margin-bottom:16px;">Try Again</button>
      <details style="text-align:left;opacity:0.7;font-size:0.78rem;max-width:400px;">
        <summary style="cursor:pointer;">Technical details</summary>
        <pre style="white-space:pre-wrap;color:#9a8f82;">${escapeHtml(message)}</pre>
      </details>
    </div>`;
  const btn = document.getElementById('btn-retry-entry');
  if (btn) btn.addEventListener('click', () => retryWorldEntry(btn));
}

export function installLoadingWatchdog({ ready, worldName = 'This world', graceMs = 30000 } = {}) {
  if (typeof ready !== 'function') return { cancel() {} };
  const startedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const el = document.getElementById('loading-screen');
  let notified = false;
  const timer = setInterval(() => {
    let isReady = false;
    try { isReady = Boolean(ready()); } catch { isReady = false; }
    if (isReady) {
      clearInterval(timer);
      return;
    }
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
    if (elapsed >= graceMs && !notified && el) {
      notified = true;
      // Append a non-destructive note; the spinner/progress stay as they are.
      const note = document.createElement('div');
      note.id = 'loading-watchdog-note';
      note.setAttribute('style', 'margin-top:18px;text-align:center;');
      note.innerHTML = `
        <p style="color:#c8b894;font-size:0.9rem;margin:0 0 10px;">Still loading — this device is slower than expected.</p>
        <button type="button" id="btn-retry-entry" class="btn-primary" style="padding:10px 26px;font-size:1rem;">Try Again</button>`;
      el.appendChild(note);
      document.getElementById('btn-retry-entry')?.addEventListener('click', (event) => retryWorldEntry(event.currentTarget));
    }
  }, WATCHDOG_POLL_MS);
  return { cancel() { clearInterval(timer); } };
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
