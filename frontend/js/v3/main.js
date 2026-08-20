import { mountShell } from './shell.js';
import { getState } from './store.js';

const VERSION = '3.0.0-field-system';
const BUILD = '2026.08.20';

function finishBoot() {
  const boot=document.getElementById('az-boot');
  if(!boot)return;
  const delay=getState().reduceMotion?0:Math.min(520,performance.now()<900?420:120);
  setTimeout(()=>{boot.classList.add('is-done');setTimeout(()=>boot.remove(),300);},delay);
}

async function registerServiceWorker() {
  if(!('serviceWorker' in navigator)||!/^https?:$/.test(location.protocol))return;
  const run=async()=>{try{await navigator.serviceWorker.register('/service-worker.js',{scope:'/'});}catch(error){console.warn('Aizanoi service worker registration skipped.',error);}};
  if('requestIdleCallback' in window) requestIdleCallback(run,{timeout:5000}); else setTimeout(run,2200);
}

function exposeRuntime(api) {
  window.AIZANOI_FIELD_SYSTEM=Object.freeze({VERSION,BUILD,...api});
  document.documentElement.dataset.azVersion=VERSION;
}

try {
  const api=mountShell();
  exposeRuntime(api);
  finishBoot();
  registerServiceWorker();
} catch(error) {
  console.error('Aizanoi Field System could not start.',error);
  const boot=document.getElementById('az-boot');
  if(boot)boot.innerHTML='<div class="az-boot-inner"><img src="/assets/branding/aizanoi-logo-mark.svg" alt="Aizanoi"><strong>Field System could not start</strong><span>Reload the page or use a Historical World directly.</span><a class="az-button" href="/historic-world/">Open Aizanoi</a></div>';
}
