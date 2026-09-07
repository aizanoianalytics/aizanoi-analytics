const enterButton = document.getElementById('btn-enter');

const bootstrapState = {
  ready: true,
  started: false,
  loading: false,
};
window.__WORLD_BOOTSTRAP__ = bootstrapState;

async function waitForRuntime(timeoutMs = 30000) {
  const startedAt = performance.now();
  while (!window.__WORLD_DEBUG__?.ready) {
    if (performance.now() - startedAt > timeoutMs) {
      throw new Error('Aizanoi runtime did not become ready in time');
    }
    await new Promise((resolve) => setTimeout(resolve, 16));
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
    bootstrapState.started = false;
    bootstrapState.loading = false;
    document.body.classList.add('pre-entry');
    enterButton.disabled = false;
    enterButton.removeAttribute('aria-busy');
    enterButton.textContent = 'Retry Entering Aizanoi';
  }
}

enterButton?.addEventListener('click', enterWorld);
