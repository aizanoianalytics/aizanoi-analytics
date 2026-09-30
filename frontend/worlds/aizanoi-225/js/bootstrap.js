const enterButton = document.getElementById('btn-enter');

const bootstrapState = {
  ready: true,
  started: false,
  loading: false,
  lastError: null,
};
window.__WORLD_BOOTSTRAP__ = bootstrapState;

async function waitForRuntime(timeoutMs = 30000) {
  const startedAt = performance.now();
  while (!window.__WORLD_DEBUG__?.ready) {
    if (performance.now() - startedAt > timeoutMs) {
      throw new Error('Aizanoi runtime did not become ready in time');
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 16);
    });
  }
}

async function enterWorld(event) {
  event.preventDefault();
  if (bootstrapState.started || !enterButton) return;

  bootstrapState.started = true;
  bootstrapState.loading = true;
  enterButton.disabled = true;
  enterButton.setAttribute('aria-busy', 'true');
  document.body.classList.remove('pre-entry');

  try {
    await import('./main.js');
    await waitForRuntime();
    bootstrapState.loading = false;
    enterButton.disabled = false;
    enterButton.removeAttribute('aria-busy');

    // main.js installs the cinematic-entry handler during runtime init.
    // Re-dispatch the click after that handler exists so the user's original
    // Enter action still leads into the normal cinematic sequence.
    enterButton.click();
  } catch (error) {
    console.error('Aizanoi runtime bootstrap failed:', error);
    bootstrapState.lastError = error?.message ? String(error.message).slice(0, 500) : String(error).slice(0, 500);
    bootstrapState.started = false;
    bootstrapState.loading = false;
    document.body.classList.add('pre-entry');
    enterButton.disabled = false;
    enterButton.removeAttribute('aria-busy');
    enterButton.textContent = 'Retry Entering Aizanoi';
  }
}

enterButton?.addEventListener('click', enterWorld);

// Exit behaviour. The world is reachable two ways: launched from a window in
// the AizanoiOS shell, or opened directly as a page. Those need different
// exits, and a single hard-coded href got one of the two wrong.
const exitButton = document.getElementById('btn-world-exit');

/** @returns {'shell'|'page'} where the visitor should land when leaving. */
function resolveExitTarget() {
  // The shell publishes a runtime facade when it mounts a world. Its presence
  // is the only reliable signal: a link, a query parameter or a referrer can
  // all be absent or spoofed, but the live facade cannot.
  return window.AIZANOI_OS?.closeApp ? 'shell' : 'page';
}

function leaveWorld() {
  const target = resolveExitTarget();
  if (target === 'shell') {
    try {
      window.AIZANOI_OS.closeApp('aizanoi');
      return;
    } catch (error) {
      // A failing shell close must never trap the visitor inside the world.
      console.warn('Shell close failed, falling back to the public landing page:', error);
    }
  }
  window.location.assign('/worlds/');
}

// Keep the control's accessible name honest about where it will go.
function refreshExitLabel() {
  if (!exitButton) return;
  const toShell = resolveExitTarget() === 'shell';
  const label = toShell ? 'Close Aizanoi and return to AizanoiOS' : 'Leave Aizanoi';
  exitButton.setAttribute('aria-label', label);
  exitButton.title = toShell ? 'Close (return to AizanoiOS)' : 'Leave Aizanoi';
}

refreshExitLabel();
exitButton?.addEventListener('click', leaveWorld);

// Escape is the keyboard way out of a fullscreen experience, and a visitor who
// entered with the keyboard expects it to work.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  // A modal owns Escape while it is open; only the bare world handles it.
  if (document.querySelector('.modal.is-open, [aria-modal="true"]')) return;
  leaveWorld();
});
