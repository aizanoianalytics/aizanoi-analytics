import { storageEstimate } from '../archive-store.js';
import { getState, getFieldSession } from '../store.js';

const formatBytes=(bytes)=>{const n=Math.max(0,Number(bytes)||0);if(n<1024)return`${n} B`;if(n<1024*1024)return`${(n/1024).toFixed(1)} KB`;if(n<1024*1024*1024)return`${(n/1024/1024).toFixed(1)} MB`;return`${(n/1024/1024/1024).toFixed(2)} GB`;};
const esc=(v)=>String(v??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export async function mount({container,api}) {
  let stopped=false;
  async function draw(){
    if(stopped)return;const estimate=await storageEstimate();const state=getState();const session=getFieldSession();let sw='Not registered';
    try{if('serviceWorker'in navigator){const reg=await navigator.serviceWorker.getRegistration('/');sw=reg?.active?`Active · ${reg.active.state}`:reg?.waiting?'Waiting':'Available, not active';}}catch(_){}
    const standalone=matchMedia('(display-mode: standalone)').matches||Boolean(navigator.standalone);
    const cards=[
      ['Archive storage',formatBytes(estimate.usage),estimate.quota?`${(estimate.percent||0).toFixed(1)}% of ${formatBytes(estimate.quota)} browser quota`:'Browser quota unavailable'],
      ['Open apps',String(api.openWindows.length),api.activeApp?`Active: ${api.activeApp}`:'Home is active'],
      ['Service worker',sw,'Static shell cache; API routes are never handled here'],
      ['Connectivity',navigator.onLine?'Online':'Offline',navigator.onLine?'Network available; workspace records remain local':'Offline; local records remain available'],
      ['Viewport',`${innerWidth} × ${innerHeight}`,`${devicePixelRatio||1}× DPR · ${matchMedia('(pointer:coarse)').matches?'coarse':'fine'} pointer`],
      ['Install mode',standalone?'Installed':'Browser tab',standalone?'Running as installed web app':'Use browser install/add-to-home-screen when supported'],
      ['Field session',session?session.worldId:'None',session?`Last updated ${new Date(session.updatedAt).toLocaleString()}`:'Open a Historical World to create session context'],
      ['Runtime privacy','Local-first','No visitor account, server terminal or visitor-facing AI/backend runtime']
    ];
    container.innerHTML=`<div class="az-app-shell"><div class="az-app-toolbar"><strong>Workspace Monitor</strong><span class="az-system-spacer"></span><span style="color:var(--az-text-3);font-size:11px">Measured from this browser · ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span></div><div class="az-monitor"><div class="az-monitor-grid">${cards.map(([label,value,detail])=>`<article class="az-monitor-card"><span>${esc(label)}</span><strong>${esc(value)}</strong><p>${esc(detail)}</p></article>`).join('')}</div></div></div>`;
  }
  const refresh=()=>draw();window.addEventListener('online',refresh);window.addEventListener('offline',refresh);window.addEventListener('resize',refresh);await draw();
  return()=>{stopped=true;window.removeEventListener('online',refresh);window.removeEventListener('offline',refresh);window.removeEventListener('resize',refresh);};
}
