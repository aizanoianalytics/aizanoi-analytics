import { mountShell } from './shell.js';
import { getState } from './store.js';
import { installAizanoiOS } from './aizanoi-os.js';
import { installBrandPlatform } from './brand-platform.js';

const VERSION = '4.3.0-platform-completion';
const BUILD = '2026.08.22';

function finishBoot() {
  const boot=document.getElementById('az-boot');
  if(!boot)return;
  const delay=getState().reduceMotion?0:Math.min(460,performance.now()<900?340:90);
  setTimeout(()=>{boot.classList.add('is-done');setTimeout(()=>boot.remove(),280);},delay);
}

async function registerServiceWorker() {
  if(!('serviceWorker' in navigator)||!/^https?:$/.test(location.protocol))return;
  const run=async()=>{try{await navigator.serviceWorker.register('/service-worker.js',{scope:'/'});}catch(error){console.warn('AizanoiOS service worker registration skipped.',error);}};
  if('requestIdleCallback' in window) requestIdleCallback(run,{timeout:5000}); else setTimeout(run,2200);
}

function exposeRuntime(api) {
  const runtime=Object.freeze({VERSION,BUILD,...api});
  window.AIZANOI_OS=runtime;
  window.AIZANOI_FIELD_SYSTEM=runtime;
  document.documentElement.dataset.azVersion=VERSION;
}

try {
  const api=mountShell();
  installAizanoiOS(api);
  installBrandPlatform(api);
  exposeRuntime(api);
  finishBoot();
  registerServiceWorker();
} catch(error) {
  console.error('AizanoiOS could not start.',error);
  const boot=document.getElementById('az-boot');
  if(boot)boot.innerHTML='<div class="az-boot-inner"><img src="/assets/branding/aizanoi-logo-mark.svg" alt="AizanoiOS"><strong>AizanoiOS could not start</strong><span>Reload the page or open a Historical World directly.</span><a class="az-button" href="/historic-world/">Open Aizanoi</a></div>';
}
