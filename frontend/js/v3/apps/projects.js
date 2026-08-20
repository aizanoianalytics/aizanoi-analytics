import { WORLDS } from '../registry.js';
import { getFieldSession } from '../store.js';

const PROJECTS=[
  {label:'Aizanoi Field System',status:'Active',kicker:'PRODUCT SYSTEM',body:'A browser-native digital archaeology workspace that keeps Historical Worlds, field records and local research tools in one coherent environment.',action:'archive',actionLabel:'Open Field Archive'},
  {label:'Historical Worlds',status:'Active',kicker:'INTERACTIVE HISTORY',body:'Three source-led walkable reconstructions — Aizanoi, Late Antique Rome and Classical Athens — with explicit evidence and uncertainty boundaries.',action:'worlds',actionLabel:'Open world index'},
  {label:'Research Workbench',status:'Local-first',kicker:'FIELD RESEARCH',body:'Archive, Notes, Data Lab, Source Reader and Artifact Viewer work on browser-local records without an account or visitor-facing backend.',action:'notes',actionLabel:'Open Field Notes'}
];

const escapeHtml=(value)=>String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export async function mount({container,api}) {
  const session=getFieldSession();
  container.innerHTML=`<div class="az-app-shell"><div class="az-app-toolbar"><strong>Projects</strong><span class="az-system-spacer"></span><span style="color:var(--az-text-3);font-size:11px">Current public work · no retired product surfaces</span></div><div class="az-projects"><div class="az-project-grid">${PROJECTS.map((project)=>`<article class="az-project-card"><p class="az-kicker">${escapeHtml(project.kicker)}</p><h3>${escapeHtml(project.label)}</h3><p>${escapeHtml(project.body)}</p><p style="color:var(--az-teal-hi);font:11px/1.4 var(--az-font-mono)">${escapeHtml(project.status)}</p><div class="az-project-actions"><button class="az-button az-button-primary" type="button" data-project-app="${escapeHtml(project.action)}">${escapeHtml(project.actionLabel)}</button></div></article>`).join('')}</div>${session?`<section class="az-simple-card" style="margin-top:12px"><p class="az-kicker">RECENT FIELD SESSION</p><h3>${escapeHtml(WORLDS.find((world)=>world.id===session.worldId)?.label||session.worldId)}</h3><p>Your most recent historical-world context is stored locally and can be resumed from Home or the World Index.</p><button class="az-button" type="button" data-continue>Continue session</button></section>`:''}</div></div>`;
  const click=(event)=>{const app=event.target.closest('[data-project-app]')?.dataset.projectApp;if(app)api.openApp(app);if(event.target.closest('[data-continue]')&&session)api.launchWorld(session.worldId,session.landmark);};
  container.addEventListener('click',click);return()=>container.removeEventListener('click',click);
}
