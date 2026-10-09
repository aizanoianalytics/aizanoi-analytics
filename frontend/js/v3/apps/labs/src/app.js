const WORKSPACES = {
  grok: {
    id: 'grok',
    model: 'Grok 4.6 Fast',
    badge: 'MODEL · FAST',
    promptLabel: 'Grok 4.6 Fast prompt',
    promptUrl: '/js/v3/apps/labs/assets/roman-history-prompt.md',
    videoUrl: '/js/v3/apps/labs/assets/roman-history.mp4',
    description: 'A prepared prompt and an accompanying Roman-history video, kept together as one experiment.',
  },
  step5: {
    id: 'step5',
    model: 'Step 5 Preview',
    badge: 'MODEL · PREVIEW',
    promptLabel: 'Step 5 Preview prompt',
    promptUrl: '/js/v3/apps/labs/assets/istanbul-fethi-prompt.md',
    videoUrl: '/js/v3/apps/labs/assets/istanbul-fethi-1453.mp4',
    description: 'A second visual experiment based on the supplied hand-drawn reference videos.',
  },
};

function shell(body) {
  return `<div class="az-app-shell az-labs-shell">
    <header class="az-app-toolbar"><strong>Aizanoi Labs</strong><span class="az-system-spacer"></span><span class="az-app-caption">Experimental workspace</span></header>
    ${body}
  </div>`;
}

function renderWorkspace(workspace, active = false) {
  return `<main id="labs-workspace-${workspace.id}" class="az-labs-workspace" data-workspace-panel="${workspace.id}" aria-label="${workspace.model} workspace"${active ? '' : ' hidden'}>
    <header class="az-labs-hero">
      <div>
        <p class="az-kicker">AIZANOI LABS / PROTOTYPE</p>
        <h1>${workspace.model}</h1>
        <p class="az-labs-subtitle">${workspace.description}</p>
      </div>
      <span class="az-labs-model-badge">${workspace.badge}</span>
    </header>
    <section class="az-labs-grid">
      <article class="az-labs-panel az-labs-prompt-panel">
        <div class="az-labs-panel-heading"><div><p class="az-kicker">PROMPT</p><h2>Ready to send</h2></div><span class="az-labs-status" data-prompt-status="${workspace.id}">Awaiting input</span></div>
        <label class="az-labs-label" for="labs-prompt-${workspace.id}">${workspace.promptLabel}</label>
        <textarea id="labs-prompt-${workspace.id}" data-labs-prompt="${workspace.id}" rows="12" readonly placeholder="Loading prompt…"></textarea>
        <p class="az-labs-hint">The final prompt is loaded from this experiment’s provenance file.</p>
      </article>
      <article class="az-labs-panel az-labs-video-panel">
        <div class="az-labs-panel-heading"><div><p class="az-kicker">ATTACHMENT</p><h2>Reference video</h2></div><span class="az-labs-file-state">Attached · MP4</span></div>
        <div class="az-labs-video-slot" data-video-slot="${workspace.id}">
          <video data-labs-video="${workspace.id}" src="${workspace.videoUrl}" controls playsinline preload="metadata"></video>
          <div class="az-labs-video-empty" hidden><span class="az-labs-video-mark" aria-hidden="true">▶</span><strong>Video will appear here</strong><span>The experiment video could not be loaded.</span></div>
        </div>
        <p class="az-labs-hint">One local video attachment is reserved for this experiment.</p>
      </article>
    </section>
  </main>`;
}

function renderCards() {
  return `<section class="az-labs-footer-cards" aria-label="Aizanoi Labs notes">
    <article class="az-simple-card"><p class="az-kicker">SEPARATION</p><h3>Two model experiments</h3><p>Grok remains the original Roman-history workspace. Step 5 Preview is a separate visual experiment based on the supplied Istanbul references.</p></article>
    <article class="az-simple-card"><p class="az-kicker">SEPARATION</p><h3>Games live in Arcade</h3><p>Playable games are promoted to Aizanoi Arcade; Labs remains the place for prototypes and technical experiments.</p><button class="az-button" type="button" data-open-app="games">Open Arcade</button></article>
  </section>`;
}

export function createLabsApp({ apps }) {
  return {
    async mount(container) {
      container.replaceChildren();
      const tabs = Object.values(WORKSPACES).map((workspace, index) => `<button class="az-button${index === 0 ? ' is-active' : ''}" type="button" data-workspace-tab="${workspace.id}" aria-controls="labs-workspace-${workspace.id}" aria-selected="${index === 0}">${workspace.model}</button>`).join('');
      container.innerHTML = shell(`<nav class="az-labs-switcher" aria-label="Labs experiments">${tabs}</nav>${Object.values(WORKSPACES).map((workspace, index) => renderWorkspace(workspace, index === 0)).join('')}${renderCards()}`);
      Object.values(WORKSPACES).forEach((workspace) => {
        const promptField = container.querySelector(`[data-labs-prompt="${workspace.id}"]`);
        const promptStatus = container.querySelector(`[data-prompt-status="${workspace.id}"]`);
        const controller = new AbortController();
        fetch(workspace.promptUrl, { signal: controller.signal })
          .then((response) => { if (!response.ok) throw new Error(`Prompt request failed: ${response.status}`); return response.text(); })
          .then((prompt) => { promptField.value = prompt; promptStatus.textContent = 'Loaded'; })
          .catch((error) => { if (error.name !== 'AbortError') promptStatus.textContent = 'Unavailable'; });
        workspace.controller = controller;
      });

      function selectWorkspace(id) {
        Object.values(WORKSPACES).forEach((workspace) => {
          const panel = container.querySelector(`[data-workspace-panel="${workspace.id}"]`);
          const tab = container.querySelector(`[data-workspace-tab="${workspace.id}"]`);
          const selected = workspace.id === id;
          panel.hidden = !selected;
          tab.classList.toggle('is-active', selected);
          tab.setAttribute('aria-selected', String(selected));
        });
      }
      function handleClick(event) {
        const tab = event.target.closest('[data-workspace-tab]');
        if (tab) selectWorkspace(tab.dataset.workspaceTab);
        const appId = event.target.closest('[data-open-app]')?.dataset.openApp;
        if (appId) apps.open(appId);
      }
      container.addEventListener('click', handleClick);
      return () => {
        Object.values(WORKSPACES).forEach((workspace) => workspace.controller.abort());
        container.removeEventListener('click', handleClick);
      };
    },
  };
}
