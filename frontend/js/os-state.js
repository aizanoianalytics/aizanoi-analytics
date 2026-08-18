(() => {
  'use strict';

  const STORAGE_KEY = 'aizanoi-os-next-state-v1';
  const MAX_RECENT = 18;
  const MAX_ACTIVITY = 32;

  const APPS = Object.freeze([
    {
      id:'chatbot', label:'Aizanoi AI', short:'AI', category:'Intelligence',
      icon:'/assets/icons/aizanoi-ai.svg', route:'/hr-analytics/', runtime:'legacy', featured:true,
      description:'Context-aware research and analytics assistant',
      keywords:['ai','assistant','hr','people','analytics','ask','research'],
      capabilities:['ai','context','text']
    },
    {
      id:'ancient', label:'Historical Worlds', short:'Worlds', category:'History',
      icon:'/assets/icons/ancient-world.svg', route:'/ancient-world/', runtime:'legacy', featured:true,
      description:'Aizanoi, Rome and Athens',
      keywords:['ancient','history','worlds','aizanoi','rome','athens','archaeology'],
      capabilities:['worlds','context','evidence']
    },
    {
      id:'archive', label:'Field Archive', short:'Archive', category:'Research',
      icon:'/assets/icons/field-archive.svg', route:null, runtime:'workbench', featured:true,
      description:'Local files, sources, datasets and captures',
      keywords:['archive','files','sources','datasets','screenshots','uploads','research'],
      accepts:['.csv','.json','.pdf','.md','.txt','.png','.jpg','.jpeg','.webp','.gif','.svg'],
      capabilities:['files','persistence','quick-look','send-to','local-folder']
    },
    {
      id:'notes', label:'Field Notes', short:'Notes', category:'Research',
      icon:'/assets/icons/notepad.svg', route:null, runtime:'workbench', featured:true,
      description:'Persistent research notes and exports',
      keywords:['notes','research','field notes','write','markdown'],
      accepts:['.md','.txt'],
      capabilities:['files','persistence','ai-context','export']
    },
    {
      id:'data-lab', label:'Data Lab', short:'Data', category:'Analytics',
      icon:'/assets/icons/data-lab.svg', route:null, runtime:'workbench', featured:true,
      description:'CSV and JSON inspection',
      keywords:['data','csv','json','table','analytics','profile','dataset'],
      accepts:['.csv','.json'],
      capabilities:['files','dataset','ai-context','export']
    },
    {
      id:'source-reader', label:'Source Reader', short:'Sources', category:'Research',
      icon:'/assets/icons/source-reader.svg', route:null, runtime:'workbench', featured:true,
      description:'PDF, Markdown and text research',
      keywords:['source','reader','pdf','markdown','text','research','document'],
      accepts:['.pdf','.md','.txt','.log'],
      capabilities:['files','reader','ai-context','send-to']
    },
    {
      id:'artifact-viewer', label:'Artifact Viewer', short:'Viewer', category:'Archive',
      icon:'/assets/icons/artifact-viewer.svg', route:null, runtime:'workbench', featured:true,
      description:'Visual records and screenshots',
      keywords:['image','viewer','artifact','screenshot','photo','visual'],
      accepts:['.png','.jpg','.jpeg','.webp','.gif','.svg'],
      capabilities:['files','image','quick-look','export']
    },
    {
      id:'projects', label:'Projects', short:'Projects', category:'Work',
      icon:'/assets/icons/projects.svg', route:'/projects/', runtime:'legacy', featured:true,
      description:'Analytics and digital experiments',
      keywords:['portfolio','analytics','projects','experiments'],
      capabilities:['context']
    },
    {
      id:'terminal', label:'Field Terminal', short:'Terminal', category:'System',
      icon:'/assets/icons/terminal.svg', route:null, runtime:'legacy', featured:true,
      description:'Command-line field utility',
      keywords:['terminal','shell','command','cli'],
      capabilities:['commands']
    },
    {
      id:'monitor', label:'Workspace Monitor', short:'Monitor', category:'System',
      icon:'/assets/icons/workspace-monitor.svg', route:null, runtime:'workbench', featured:true,
      description:'Session, storage, API and install status',
      keywords:['monitor','system','storage','api','pwa','install','performance','status'],
      capabilities:['system','storage','install']
    },
    {
      id:'videos', label:'Aizanoi TV', short:'TV', category:'Media',
      icon:'/assets/icons/aizanoi-tv.svg', route:'/videos/', runtime:'legacy', featured:true,
      description:'Curated video content',
      keywords:['video','tv','youtube','media'],
      capabilities:['media']
    },
    {
      id:'games', label:'Games', short:'Games', category:'Experiments',
      icon:'/assets/icons/games.svg', route:'/games/', runtime:'legacy', featured:true,
      description:'Local single-player experiments',
      keywords:['games','arcade','snake','mines','brick'],
      capabilities:['games']
    },
    {
      id:'docs', label:'Archive Docs', short:'Docs', category:'Archive',
      icon:'/icons/MyDocuments.png', route:'/docs/', runtime:'legacy', featured:false,
      description:'Legacy reference documents',
      keywords:['docs','documentation','archive','research'],
      capabilities:['documents']
    },
    {
      id:'about', label:'About Aizanoi', short:'About', category:'Archive',
      icon:'/assets/icons/about.svg', route:'/about/', runtime:'legacy', featured:false,
      description:'Project identity and release information',
      keywords:['about','aizanoi','project','version'],
      capabilities:['about']
    },
  ]);

  const WORLDS = Object.freeze([
    {
      id:'aizanoi', label:'Aizanoi', era:'Roman Phrygia', route:'/historic-world/',
      subtitle:'Temple, theatre–stadium, Penkalas riverfront and urban fabric',
      keywords:['aizanoi','zeus','temple','theatre','stadium','penkalas','bridge','macellum','bath'],
      landmarks:{ temple:'Temple of Zeus', theatre:'Theatre–Stadium', stadium:'Stadium', penkalas:'Penkalas riverfront', bridge3:'Central Roman Bridge', macellum:'Macellum', greatbath:'Great Bath–Palaestra' }
    },
    {
      id:'rome', label:'Rome', era:'AD 410–476', route:'/ancient-cities/rome-410-476/',
      subtitle:'Late Antique imperial capital during transformation',
      keywords:['rome','roman','colosseum','forum','pantheon','subura','vatican','late antique'],
      landmarks:{ colosseum:'Colosseum', forum:'Roman Forum', pantheon:'Pantheon', subura:'Subura' }
    },
    {
      id:'athens', label:'Athens', era:'c. 432–430 BCE', route:'/ancient-cities/athens-450-430/',
      subtitle:'Classical Athens from Acropolis to Agora and Piraeus',
      keywords:['athens','parthenon','acropolis','agora','pnyx','hephaisteion','classical'],
      landmarks:{ parthenon:'Parthenon', agora:'Agora', pnyx:'Pnyx', hephaisteion:'Hephaisteion' }
    }
  ]);

  const DEFAULTS = Object.freeze({
    theme:'field',
    sound:true,
    reduceMotion:false,
    boot:true,
    restoreSession:true,
    uiScale:'normal',
    recent:[],
    activity:[],
    sessionApps:[],
    lastActive:null,
    windowRects:{},
    context:{ type:'desktop', label:'Aizanoi Field System', appId:null, worldId:null, landmark:null },
  });

  function cloneDefaults() {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }

  function readState() {
    const fallback = cloneDefaults();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return {
        ...fallback,
        ...parsed,
        recent:Array.isArray(parsed.recent) ? parsed.recent.slice(0, MAX_RECENT) : [],
        activity:Array.isArray(parsed.activity) ? parsed.activity.slice(0, MAX_ACTIVITY) : [],
        sessionApps:Array.isArray(parsed.sessionApps) ? parsed.sessionApps : [],
        windowRects:parsed.windowRects && typeof parsed.windowRects === 'object' ? parsed.windowRects : {},
        context:parsed.context && typeof parsed.context === 'object' ? { ...fallback.context, ...parsed.context } : fallback.context,
      };
    } catch (_) {
      return fallback;
    }
  }

  let state = readState();
  const listeners = new Set();

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function notify(type, detail = null) {
    const snapshot = getState();
    listeners.forEach((listener) => {
      try { listener({ type, detail, state:snapshot }); } catch (_) {}
    });
    try { window.dispatchEvent(new CustomEvent('aizanoi:state', { detail:{ type, detail, state:snapshot } })); } catch (_) {}
  }

  function getState() {
    return JSON.parse(JSON.stringify(state));
  }

  function setPreference(key, value) {
    if (!['theme','sound','reduceMotion','boot','restoreSession','uiScale'].includes(key)) return false;
    if (state[key] === value) return true;
    state = { ...state, [key]:value };
    persist();
    notify('preference', { key, value });
    return true;
  }

  function findApp(id) {
    return APPS.find((app) => app.id === id) || null;
  }

  function findWorld(id) {
    return WORLDS.find((world) => world.id === id) || null;
  }

  function normalizeRecent(entry) {
    if (!entry || !entry.id || !entry.label) return null;
    return {
      id:String(entry.id),
      label:String(entry.label),
      type:entry.type || 'app',
      appId:entry.appId || null,
      worldId:entry.worldId || null,
      landmark:entry.landmark || null,
      route:entry.route || null,
      icon:entry.icon || null,
      timestamp:Date.now(),
    };
  }

  function markRecent(entry) {
    const item = normalizeRecent(entry);
    if (!item) return;
    const key = `${item.type}:${item.id}:${item.landmark || ''}`;
    const next = state.recent.filter((current) => `${current.type}:${current.id}:${current.landmark || ''}` !== key);
    next.unshift(item);
    state = { ...state, recent:next.slice(0, MAX_RECENT) };
    persist();
    notify('recent', item);
  }

  function markAppRecent(appId) {
    const app = findApp(appId);
    if (!app) return;
    markRecent({ id:app.id, label:app.label, type:'app', appId:app.id, route:app.route, icon:app.icon });
  }

  function markWorldRecent(worldId, landmark = null) {
    const world = findWorld(worldId);
    if (!world) return;
    const landmarkLabel = landmark ? (world.landmarks[landmark] || landmark) : null;
    markRecent({
      id:world.id,
      label:landmarkLabel ? `${world.label} · ${landmarkLabel}` : world.label,
      type:'world', worldId:world.id, landmark, route:world.route,
    });
  }

  function recordActivity(title, body = '', kind = 'system') {
    const item = {
      id:`${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      title:String(title),
      body:String(body || ''),
      kind,
      timestamp:Date.now()
    };
    state = { ...state, activity:[item, ...state.activity].slice(0, MAX_ACTIVITY) };
    persist();
    notify('activity', item);
    return item;
  }

  function clearActivity() {
    if (!state.activity.length) return;
    state = { ...state, activity:[] };
    persist();
    notify('activity-clear');
  }

  function setSessionApps(appIds, active = null) {
    const clean = [...new Set((appIds || []).filter((id) => findApp(id)))].slice(0, 10);
    const nextActive = findApp(active) ? active : null;
    const unchanged = nextActive === state.lastActive
      && clean.length === state.sessionApps.length
      && clean.every((id,index) => id === state.sessionApps[index]);
    if (unchanged) return false;
    state = { ...state, sessionApps:clean, lastActive:nextActive };
    persist();
    notify('session', { apps:state.sessionApps, active:state.lastActive });
    return true;
  }

  function saveWindowRect(appId, rect) {
    if (!findApp(appId) || !rect) return;
    const clean = {
      left:Number(rect.left), top:Number(rect.top), width:Number(rect.width), height:Number(rect.height),
    };
    if (!Object.values(clean).every(Number.isFinite)) return;
    const previous = state.windowRects?.[appId];
    if (previous && ['left','top','width','height'].every((key) => Math.abs(previous[key] - clean[key]) < .5)) return;
    state = { ...state, windowRects:{ ...state.windowRects, [appId]:clean } };
    persist();
  }

  function getWindowRect(appId) {
    const rect = state.windowRects?.[appId];
    return rect ? { ...rect } : null;
  }

  function setContext(context) {
    const next = { ...state.context, ...(context || {}) };
    const previous = state.context || {};
    const unchanged = ['type','label','appId','worldId','landmark'].every((key) => previous[key] === next[key]);
    if (unchanged) return { ...previous };
    state = { ...state, context:next };
    try { sessionStorage.setItem('aizanoi-os-context', JSON.stringify(next)); } catch (_) {}
    persist();
    notify('context', next);
    return next;
  }

  function getContext() {
    return { ...state.context };
  }

  function contextLabel(context = state.context) {
    if (!context) return 'Aizanoi Field System';
    if (context.landmark && context.worldId) {
      const world = findWorld(context.worldId);
      return `${world?.label || context.worldId} · ${world?.landmarks?.[context.landmark] || context.landmark}`;
    }
    if (context.worldId) return findWorld(context.worldId)?.label || context.worldId;
    if (context.appId) return findApp(context.appId)?.label || context.appId;
    return context.label || 'Aizanoi Field System';
  }

  function pendingWorldCommand(worldId, landmark = null) {
    const world = findWorld(worldId);
    if (!world) return null;
    const payload = { worldId, landmark, timestamp:Date.now() };
    try { sessionStorage.setItem('aizanoi-world-command', JSON.stringify(payload)); } catch (_) {}
    setContext({ type:'world', worldId, landmark, appId:null, label:contextLabel({ worldId, landmark }) });
    markWorldRecent(worldId, landmark);
    return payload;
  }

  function consumePendingWorldCommand(worldId) {
    try {
      const raw = sessionStorage.getItem('aizanoi-world-command');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.worldId !== worldId || Date.now() - parsed.timestamp > 120000) return null;
      sessionStorage.removeItem('aizanoi-world-command');
      return parsed;
    } catch (_) { return null; }
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function resetWorkspaceState() {
    const keep = {
      theme:state.theme,
      sound:state.sound,
      reduceMotion:state.reduceMotion,
      boot:state.boot,
      restoreSession:state.restoreSession,
      uiScale:state.uiScale
    };
    state = { ...cloneDefaults(), ...keep };
    persist();
    notify('reset');
  }

  window.AIZANOI_OS_STATE = Object.freeze({
    STORAGE_KEY,
    apps:APPS,
    worlds:WORLDS,
    getState,
    setPreference,
    findApp,
    findWorld,
    markRecent,
    markAppRecent,
    markWorldRecent,
    recordActivity,
    clearActivity,
    setSessionApps,
    saveWindowRect,
    getWindowRect,
    setContext,
    getContext,
    contextLabel,
    pendingWorldCommand,
    consumePendingWorldCommand,
    subscribe,
    resetWorkspaceState,
  });

  /* Distribution layer waits for the mature shell + intent contracts before mounting. */
  function bootstrapDistributionLayer() {
    if (window.__AIZANOI_DISTRIBUTION_BOOTSTRAP__) return;
    window.__AIZANOI_DISTRIBUTION_BOOTSTRAP__ = true;

    if (!document.querySelector('link[data-aizanoi-distribution="style"]')) {
      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = '/css/os-distribution.css';
      style.dataset.aizanoiDistribution = 'style';
      document.head.appendChild(style);
    }

    const loadScript = (src) => new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-aizanoi-distribution="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === '1') resolve();
        else {
          existing.addEventListener('load', resolve, { once:true });
          existing.addEventListener('error', reject, { once:true });
        }
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.dataset.aizanoiDistribution = src;
      script.addEventListener('load', () => { script.dataset.loaded = '1'; resolve(); }, { once:true });
      script.addEventListener('error', reject, { once:true });
      document.body.appendChild(script);
    });

    let attempts = 0;
    const waitForShell = setInterval(() => {
      attempts += 1;
      if (!window.AIZANOI_OS || !window.AIZANOI_OS_INTENT) {
        if (attempts < 250) return;
        clearInterval(waitForShell);
        console.warn('Aizanoi distribution layer skipped because shell contracts did not become ready.');
        return;
      }
      clearInterval(waitForShell);
      loadScript('/js/os-platform.js')
        .then(() => loadScript('/js/os-archive.js'))
        .then(() => loadScript('/js/os-workbench.js'))
        .then(() => loadScript('/js/os-workbench-archive.js'))
        .then(() => loadScript('/js/os-workbench-readers.js'))
        .then(() => loadScript('/js/os-workbench-data.js'))
        .then(() => loadScript('/js/os-workbench-shell.js'))
        .catch((error) => console.error('Aizanoi distribution layer could not mount.', error));
    }, 20);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrapDistributionLayer, { once:true });
    else bootstrapDistributionLayer();
  }
})();