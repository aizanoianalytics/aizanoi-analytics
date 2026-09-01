import { mountShell } from './shell.js';
import { getState } from './store.js';
import { installAizanoiOS } from './aizanoi-os.js';
import { installBrandPlatform } from './brand-platform.js';

const RELEASE=globalThis.AIZANOI_RELEASE;
if(!RELEASE)throw new Error('AizanoiOS release metadata is missing.');
const {VERSION,BUILD}=RELEASE;

const UTILITY_WINDOW_PREFS=Object.freeze({
  calculator:Object.freeze({width:470,height:640,migrateWidth:620,migrateHeight:700}),
  winamp:Object.freeze({width:620,height:520,migrateWidth:760,migrateHeight:650}),
  camera:Object.freeze({width:760,height:620,migrateWidth:900,migrateHeight:720}),
  games:Object.freeze({width:920,height:700,migrateWidth:1040,migrateHeight:800}),
  'recycle-bin':Object.freeze({width:860,height:560,migrateWidth:940,migrateHeight:660})
});

function finishBoot(){const boot=document.getElementById('az-boot');if(!boot)return;const delay=getState().reduceMotion?0:Math.min(460,performance.now()<900?340:90);setTimeout(()=>{boot.classList.add('is-done');setTimeout(()=>boot.remove(),280);},delay);}
async function registerServiceWorker(){if(!('serviceWorker'in navigator)||!/^https?:$/.test(location.protocol))return;const run=async()=>{try{await navigator.serviceWorker.register('/service-worker.js',{scope:'/'});}catch(error){console.warn('AizanoiOS service worker registration skipped.',error);}};if('requestIdleCallback'in window)requestIdleCallback(run,{timeout:5000});else setTimeout(run,2200);}
function exposeRuntime(api){const runtime=Object.freeze({VERSION,BUILD,...api});window.AIZANOI_OS=runtime;/* One-release compatibility alias. Remove after the v5 migration window. */Object.defineProperty(window,'AIZANOI_FIELD_SYSTEM',{configurable:true,get:()=>runtime});document.documentElement.dataset.azVersion=VERSION;}

function preferredUtilityRect(pref){
  const width=Math.min(pref.width,innerWidth-32),height=Math.min(pref.height,innerHeight-132);
  const left=Math.max(12,(innerWidth-width)/2);
  const maxTop=Math.max(8,innerHeight-height-88);
  const top=Math.min(Math.max(8,(innerHeight-height)/2-24),maxTop);
  return {left,top,width,height};
}
function shouldApplyUtilityPreference(api,appId,pref){
  const saved=api.store.windowRect?.(appId);
  if(!saved)return true;
  return Number(saved.width)>pref.migrateWidth||Number(saved.height)>pref.migrateHeight;
}
function applyUtilityWindowPreference(api,windowEl){
  if(innerWidth<1200||windowEl.classList.contains('is-maximized')||windowEl.dataset.azPreferredRectApplied)return;
  const appId=windowEl.dataset.appId,pref=UTILITY_WINDOW_PREFS[appId];
  if(!pref)return;
  if(!shouldApplyUtilityPreference(api,appId,pref)){windowEl.dataset.azPreferredRectApplied='preserved';return;}
  const rect=preferredUtilityRect(pref);
  Object.assign(windowEl.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});
  windowEl.dataset.azPreferredRectApplied='true';
  api.store.saveWindowRect?.(appId,rect);
}
function installUtilityWindowPreferences(api){
  const layer=document.querySelector('.az-window-layer');if(!layer)return;
  const scan=()=>layer.querySelectorAll('.az-window[data-app-id]').forEach((windowEl)=>applyUtilityWindowPreference(api,windowEl));
  scan();
  new MutationObserver(()=>queueMicrotask(scan)).observe(layer,{childList:true});
}
function installReducedMotionSync(api){
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  const sync=()=>document.body.classList.toggle('az-reduce-motion',Boolean(api.store.getState().reduceMotion||media.matches));
  const schedule=()=>queueMicrotask(sync);
  sync();
  api.store.subscribe((event)=>{if(event.type==='preference'||event.type==='reset')schedule();});
  if(typeof media.addEventListener==='function')media.addEventListener('change',sync);
  else media.addListener?.(sync);
}

try{const api=mountShell();installReducedMotionSync(api);installAizanoiOS(api);installBrandPlatform(api);installUtilityWindowPreferences(api);exposeRuntime(api);finishBoot();registerServiceWorker();}catch(error){console.error('AizanoiOS could not start.',error);const boot=document.getElementById('az-boot');if(boot)boot.innerHTML='<div class="az-boot-inner"><img src="/assets/branding/aizanoi-logo-mark.svg" alt="AizanoiOS"><strong>AizanoiOS could not start</strong><span>Reload the page or open a Historical World directly.</span><a class="az-button" href="/historic-world/">Open Aizanoi</a></div>';}
