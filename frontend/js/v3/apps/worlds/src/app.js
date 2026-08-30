const escapeHtml=(value)=>String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createWorldsApp({ worlds }) {
  return {
    async mount(container) {
      const session = worlds.currentSession();
      const catalog = worlds.list();
      container.innerHTML=`<div class="az-app-shell"><div class="az-app-toolbar"><strong>Historical Worlds</strong><span class="az-system-spacer"></span>${session?`<button class="az-button az-button-primary" type="button" data-continue-world>Continue ${escapeHtml(session.worldId)}</button>`:''}</div><div class="az-projects"><div class="az-project-grid">${catalog.map((world)=>`<article class="az-project-card"><p class="az-kicker">${escapeHtml(world.era)}</p><h3>${escapeHtml(world.label)}</h3><p>${escapeHtml(world.summary)}</p><p class="az-reading-list-meta">${escapeHtml(world.evidence)} · ${escapeHtml(world.duration)}</p><div class="az-project-actions"><button class="az-button az-button-primary" type="button" data-open-world="${escapeHtml(world.id)}">Enter world</button></div></article>`).join('')}</div></div></div>`;

      function handleClick(event) {
        const worldId=event.target.closest('[data-open-world]')?.dataset.openWorld;
        if(worldId) {
          worlds.launch(worldId);
          return;
        }
        if(event.target.closest('[data-continue-world]')) {
          const current=worlds.currentSession();
          if(current) worlds.launch(current.worldId,current.landmark);
        }
      }

      container.addEventListener('click',handleClick);
      return()=>container.removeEventListener('click',handleClick);
    },
  };
}
