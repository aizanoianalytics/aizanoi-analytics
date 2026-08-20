import { WORLDS } from '../registry.js';
import { getFieldSession } from '../store.js';

const escapeHtml=(value)=>String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export async function mount({container,api}) {
  const session=getFieldSession();
  container.innerHTML=`<div class="az-app-shell"><div class="az-app-toolbar"><strong>Historical Worlds</strong><span class="az-system-spacer"></span>${session?`<button class="az-button az-button-primary" type="button" data-continue-world>Continue ${escapeHtml(session.worldId)}</button>`:''}</div><div class="az-projects"><div class="az-project-grid">${WORLDS.map((world)=>`<article class="az-project-card"><p class="az-kicker">${escapeHtml(world.era)}</p><h3>${escapeHtml(world.label)}</h3><p>${escapeHtml(world.summary)}</p><p style="color:var(--az-text-3);font-size:11px">${escapeHtml(world.evidence)} · ${escapeHtml(world.duration)}</p><div class="az-project-actions"><button class="az-button az-button-primary" type="button" data-open-world="${escapeHtml(world.id)}">Enter world</button></div></article>`).join('')}</div></div></div>`;
  const click=(event)=>{const world=event.target.closest('[data-open-world]')?.dataset.openWorld;if(world)api.launchWorld(world);if(event.target.closest('[data-continue-world]')){const current=getFieldSession();current&&api.launchWorld(current.worldId,current.landmark);}};
  container.addEventListener('click',click);
  return()=>container.removeEventListener('click',click);
}
