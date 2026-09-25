const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

function shell(body) {
  return `<div class="az-app-shell az-labs-shell">
    <header class="az-app-toolbar"><strong>Aizanoi Labs</strong><span class="az-system-spacer"></span><span class="az-app-caption">Experimental workspace</span></header>
    ${body}
  </div>`;
}

function renderWorkspace() {
  return `<main class="az-labs-workspace" aria-label="Grok 4.6 Fast workspace">
    <header class="az-labs-hero">
      <div>
        <p class="az-kicker">AIZANOI LABS / PROTOTYPE</p>
        <h1>Grok 4.6 Fast</h1>
        <p class="az-labs-subtitle">A prepared prompt and an accompanying video, kept together as one experiment.</p>
      </div>
      <span class="az-labs-model-badge">MODEL · FAST</span>
    </header>
    <section class="az-labs-grid">
      <article class="az-labs-panel az-labs-prompt-panel">
        <div class="az-labs-panel-heading"><div><p class="az-kicker">PROMPT</p><h2>Ready to send</h2></div><span class="az-labs-status">Awaiting input</span></div>
        <label class="az-labs-label" for="labs-prompt">Grok 4.6 Fast prompt</label>
        <textarea id="labs-prompt" data-labs-prompt rows="12" readonly placeholder="Loading prompt…"></textarea>
        <p class="az-labs-hint">The final prompt will be inserted here when provided.</p>
      </article>
      <article class="az-labs-panel az-labs-video-panel">
        <div class="az-labs-panel-heading"><div><p class="az-kicker">ATTACHMENT</p><h2>Reference video</h2></div><span class="az-labs-file-state">Attached · MP4</span></div>
        <div class="az-labs-video-slot" data-video-slot>
          <video data-labs-video src="/js/v3/apps/labs/assets/roman-history.mp4" controls playsinline preload="metadata"></video>
          <div class="az-labs-video-empty" hidden><span class="az-labs-video-mark" aria-hidden="true">▶</span><strong>Video will appear here</strong><span>Send the video file to attach it to this experiment.</span></div>
        </div>
        <p class="az-labs-hint">One video attachment slot is reserved for the supplied file.</p>
      </article>
    </section>
  </main>`;
}

function renderCards() {
  return `<section class="az-labs-footer-cards" aria-label="Aizanoi Labs notes">
    <article class="az-simple-card"><p class="az-kicker">EXPERIMENTAL</p><h3>Prototype shelf</h3><p>Small WebGL, WebGPU, UI, audio, physics and generative experiments belong here even when they are intentionally unfinished.</p></article>
    <article class="az-simple-card"><p class="az-kicker">SEPARATION</p><h3>Games live in Arcade</h3><p>Playable games are promoted to Aizanoi Arcade; Labs remains the place for prototypes and technical experiments.</p><button class="az-button" type="button" data-open-app="games">Open Arcade</button></article>
  </section>`;
}

export function createLabsApp({ apps }) {
  return {
    async mount(container) {
      container.replaceChildren();
      container.innerHTML = shell(`${renderWorkspace()}${renderCards()}`);

      const promptField = container.querySelector('[data-labs-prompt]');
      const promptStatus = container.querySelector('.az-labs-status');
      const controller = new AbortController();
      fetch('/js/v3/apps/labs/assets/roman-history-prompt.md', { signal: controller.signal })
        .then((response) => { if (!response.ok) throw new Error(`Prompt request failed: ${response.status}`); return response.text(); })
        .then((prompt) => { promptField.value = prompt; promptStatus.textContent = 'Loaded'; })
        .catch((error) => { if (error.name !== 'AbortError') promptStatus.textContent = 'Unavailable'; });

      function handleClick(event) {
        const appId = event.target.closest('[data-open-app]')?.dataset.openApp;
        if (appId) apps.open(appId);
      }

      container.addEventListener('click', handleClick);
      return () => {
        controller.abort();
        container.removeEventListener('click', handleClick);
      };
    },
  };
}