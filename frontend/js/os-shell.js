(() => {
  'use strict';

  const State = window.AIZANOI_OS_STATE;
  if (!State) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const LEGACY_DESKTOP_APPS = new Set(['mycomputer','recycle','c_drive','d_drive','control']);
  const OVERLAYS = ['az-index','az-command','az-system-panel','az-activity','az-switcher'];
  let commandSelection = 0;
  let renderedCommands = [];
  let bootNarrativeTimer = null;
  let audioContext = null;
  let restoreTimer = null;
  let shellMounted = false;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
  }

  function isMobileShell() {
    return matchMedia('(max-width:700px)').matches;
  }

  function windowsMap() {
    try { return typeof openWindows !== 'undefined' ? openWindows : null; } catch (_) { return null; }
  }

  function getActiveAppId() {
    const active = $('.win.active');
    const map = windowsMap();
    if (!active || !map) return null;
    for (const [appId, state] of map.entries()) if (state?.el === active) return appId;
    return null;
  }

  function getVisibleAppIds() {
    const map = windowsMap();
    if (!map) return [];
    const visible = [];
    for (const [appId, state] of map.entries()) {
      if (!State.findApp(appId) || !state?.el?.isConnected) continue;
      if (getComputedStyle(state.el).display === 'none') continue;
      visible.push(appId);
    }
    return visible;
  }

  function appIdForWindow(el) {
    const map = windowsMap();
    if (!el || !map) return null;
    for (const [appId, state] of map.entries()) if (state?.el === el) return appId;
    return null;
  }

  function applyPreferences() {
    const prefs = State.getState();
    document.body.classList.add('aizanoi-next');
    document.body.dataset.aizanoiTheme = prefs.theme || 'field';
    document.body.classList.toggle('aizanoi-reduce-motion', !!prefs.reduceMotion);
    document.documentElement.style.setProperty('--az-ui-scale', prefs.uiScale === 'large' ? '1.08' : prefs.uiScale === 'compact' ? '.94' : '1');
    const boot = document.getElementById('boot');
    if (boot && !prefs.boot) boot.style.display = 'none';
    renderSystemPanelState();
  }

  function playSound(kind = 'tick') {
    const prefs = State.getState();
    if (!prefs.sound) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      audioContext ||= new AudioCtx();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      const now = audioContext.currentTime;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const map = {
        tick:[360,.018,.028], open:[430,.023,.045], ai:[620,.018,.055], world:[220,.028,.09], close:[290,.018,.03], alert:[180,.025,.07]
      };
      const [freq, volume, duration] = map[kind] || map.tick;
      osc.type = kind === 'world' ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      if (kind === 'ai') osc.frequency.exponentialRampToValueAtTime(760, now + duration);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + .008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain); gain.connect(audioContext.destination);
      osc.start(now); osc.stop(now + duration + .012);
    } catch (_) {}
  }

  function mountShellMarkup() {
    if (shellMounted) return;
    shellMounted = true;

    const shell = document.createElement('div');
    shell.id = 'az-shell-layer';
    shell.innerHTML = `
      <aside id="az-field-card" aria-live="polite">
        <div class="az-eyebrow">Aizanoi Field System</div>
        <div class="az-context">Digital archaeology workspace</div>
        <div class="az-detail">ARCHIVE ONLINE · GRID 39°12′N 29°37′E</div>
      </aside>

      <div id="az-index" class="az-overlay" aria-hidden="true">
        <section class="az-panel" role="dialog" aria-modal="true" aria-labelledby="az-index-title">
          <header class="az-panel-header">
            <img class="az-panel-mark" src="/assets/branding/aizanoi-logo-mark.svg" alt="">
            <div><div id="az-index-title" class="az-panel-title">Aizanoi Index</div><div class="az-panel-kicker">Apps · worlds · recent field activity</div></div>
            <div class="az-panel-spacer"></div>
            <button class="az-system-button" data-az-action="command"><span>Search everything</span><span class="az-key">Ctrl K</span></button>
            <button class="az-close" data-az-close="az-index" aria-label="Close Aizanoi Index">×</button>
          </header>
          <div class="az-index-body">
            <section class="az-index-section"><div class="az-section-label">Applications</div><div id="az-index-apps" class="az-app-list"></div></section>
            <section class="az-index-section">
              <div class="az-section-label">Historical Worlds</div><div id="az-index-worlds" class="az-world-grid"></div>
              <div class="az-command-callout"><b>Command the workspace</b><p>Try “open Rome at Colosseum”, “show Athens”, “night theme” or ask Aizanoi AI anything from the same palette.</p></div>
            </section>
            <section class="az-index-section"><div class="az-section-label">Recent</div><div id="az-index-recent" class="az-recent-list"></div><div class="az-index-actions"><button class="az-system-button" data-az-action="system">System Panel</button><button class="az-system-button" data-az-action="switcher">Open Apps</button><button class="az-system-button" data-az-action="lock">Lock</button><button class="az-system-button" data-az-action="activity">Activity</button></div></section>
          </div>
        </section>
      </div>

      <div id="az-command" class="az-overlay" aria-hidden="true">
        <section class="az-panel" role="dialog" aria-modal="true" aria-labelledby="az-command-input">
          <div class="az-command-box"><div class="az-command-input-wrap"><span class="az-command-glyph">⌘</span><input id="az-command-input" autocomplete="off" spellcheck="false" aria-label="Search apps, worlds, monuments and commands" placeholder="Search apps, worlds, monuments, or ask Aizanoi AI…"><span class="az-command-shortcut">ESC</span></div></div>
          <div id="az-command-results" role="listbox"></div>
          <footer class="az-command-footer"><span>↑↓ Navigate</span><span>Enter Open</span><span>Esc Close</span><span>Natural language → Aizanoi AI</span></footer>
        </section>
      </div>

      <div id="az-system-panel" class="az-overlay" aria-hidden="true">
        <section class="az-panel" role="dialog" aria-modal="true" aria-labelledby="az-system-title">
          <header class="az-panel-header"><img class="az-panel-mark" src="/assets/branding/aizanoi-logo-mark.svg" alt=""><div><div id="az-system-title" class="az-panel-title">System Panel</div><div class="az-panel-kicker">Real workspace preferences</div></div><div class="az-panel-spacer"></div><button class="az-close" data-az-close="az-system-panel" aria-label="Close System Panel">×</button></header>
          <div class="az-settings-body">
            <section class="az-settings-group"><div class="az-settings-title">Field appearance</div><div class="az-theme-grid"><button class="az-theme-choice" data-theme="field"><b>Field</b><span>Stone, survey grid and muted landscape</span></button><button class="az-theme-choice" data-theme="archive"><b>Archive</b><span>Warmer paper, brass and collection-room tone</span></button><button class="az-theme-choice" data-theme="night"><b>Night</b><span>Lower luminance for focused research</span></button></div></section>
            <section class="az-settings-group"><div class="az-settings-title">Interaction</div>
              <label class="az-setting-row"><span><b>Interface sounds</b><small>Short local tones for shell actions. No autoplay audio.</small></span><input class="az-toggle" id="az-setting-sound" type="checkbox"></label>
              <label class="az-setting-row"><span><b>Reduce motion</b><small>Disables non-essential shell transitions and attention animation.</small></span><input class="az-toggle" id="az-setting-motion" type="checkbox"></label>
              <label class="az-setting-row"><span><b>Boot narrative</b><small>Show the short Field System initialization on future visits.</small></span><input class="az-toggle" id="az-setting-boot" type="checkbox"></label>
              <label class="az-setting-row"><span><b>Restore workspace</b><small>Reopen a small set of apps from the previous session on the desktop.</small></span><input class="az-toggle" id="az-setting-session" type="checkbox"></label>
            </section>
            <section class="az-settings-group"><div class="az-settings-title">Workspace</div><div class="az-setting-row"><span><b>Reset recent/session state</b><small>Keeps appearance preferences but clears recents, activity and saved window positions.</small></span><button class="az-system-button" data-az-action="reset-state">Reset</button></div></section>
          </div>
        </section>
      </div>

      <div id="az-activity" class="az-overlay" aria-hidden="true">
        <section class="az-panel" role="dialog" aria-modal="true" aria-labelledby="az-activity-title"><header class="az-panel-header"><div><div id="az-activity-title" class="az-panel-title">Activity</div><div class="az-panel-kicker">Local workspace events</div></div><div class="az-panel-spacer"></div><button class="az-system-button" data-az-action="clear-activity">Clear</button><button class="az-close" data-az-close="az-activity" aria-label="Close Activity">×</button></header><div id="az-activity-body" class="az-activity-body"></div></section>
      </div>

      <div id="az-switcher" class="az-overlay" aria-hidden="true">
        <section class="az-panel" role="dialog" aria-modal="true" aria-labelledby="az-switcher-title"><header class="az-panel-header"><div><div id="az-switcher-title" class="az-panel-title">Open Apps</div><div class="az-panel-kicker">Workspace switcher</div></div><div class="az-panel-spacer"></div><button class="az-close" data-az-close="az-switcher" aria-label="Close App Switcher">×</button></header><div id="az-switcher-body" class="az-switcher-body"></div></section>
      </div>

      <div id="az-context-menu" role="menu" aria-hidden="true"></div>

      <main id="az-mobile-home" aria-label="Aizanoi Field System home">
        <header class="az-mobile-header"><img src="/assets/branding/aizanoi-logo-mark.svg" alt=""><div><h1>Aizanoi</h1><p>FIELD SYSTEM · DIGITAL ARCHAEOLOGY + INTELLIGENCE</p></div><div class="az-mobile-clock"><b id="az-mobile-time">--:--</b><span id="az-mobile-date"></span></div></header>
        <section class="az-mobile-section"><div class="az-mobile-section-label">Applications</div><div id="az-mobile-apps" class="az-mobile-app-grid"></div></section>
        <section class="az-mobile-section"><div class="az-mobile-section-label">Historical Worlds</div><div id="az-mobile-worlds" class="az-mobile-worlds"></div></section>
        <section class="az-mobile-section"><div class="az-mobile-section-label">Recent</div><div id="az-mobile-recent" class="az-recent-list"></div></section>
      </main>
    `;
    document.body.appendChild(shell);
  }

  function setOverlay(id, open) {
    const overlay = document.getElementById(id);
    if (!overlay) return;
    if (open) {
      OVERLAYS.forEach((otherId) => {
        if (otherId === id) return;
        const other = document.getElementById(otherId);
        if (other) { other.classList.remove('open'); other.setAttribute('aria-hidden','true'); }
      });
    }
    overlay.classList.toggle('open', !!open);
    overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      const focusable = overlay.querySelector('input,button,[tabindex]:not([tabindex="-1"])');
      setTimeout(() => focusable?.focus(), 0);
    }
  }

  function closeAllOverlays() {
    OVERLAYS.forEach((id) => setOverlay(id, false));
    closeContextMenu();
  }

  function openIndex() {
    renderIndex();
    setOverlay('az-index', true);
    playSound('open');
  }

  function openSystemPanel() {
    renderSystemPanelState();
    setOverlay('az-system-panel', true);
    playSound('open');
  }

  function openActivity() {
    renderActivity();
    setOverlay('az-activity', true);
    playSound('open');
  }

  function openSwitcher() {
    renderSwitcher();
    setOverlay('az-switcher', true);
    playSound('open');
  }

  function launchApp(appId, options = {}) {
    if (appId === 'control') return openSystemPanel();
    const app = State.findApp(appId);
    if (!app || typeof window.openApp !== 'function') return false;
    closeAllOverlays();
    window.openApp(appId);
    State.markAppRecent(appId);
    State.setContext({ type:'app', label:app.label, appId, worldId:null, landmark:null });
    State.recordActivity(`Opened ${app.label}`, options.source === 'command' ? 'From Aizanoi Command' : 'Workspace application', 'app');
    playSound(appId === 'chatbot' ? 'ai' : 'open');
    updateShellState();
    return true;
  }

  function launchWorld(worldId, landmark = null) {
    const world = State.findWorld(worldId);
    if (!world) return false;
    State.pendingWorldCommand(worldId, landmark);
    const landmarkLabel = landmark ? (world.landmarks[landmark] || landmark) : '';
    State.recordActivity(`Opening ${world.label}${landmarkLabel ? ` · ${landmarkLabel}` : ''}`, world.era, 'world');
    playSound('world');
    const params = landmark ? `?jump=${encodeURIComponent(landmark)}` : '';
    location.href = `${world.route}${params}`;
    return true;
  }

  function contextPrompt() {
    const context = State.getContext();
    const label = State.contextLabel(context);
    if (!context || context.type === 'desktop') return '';
    return `Current Aizanoi OS workspace context: ${label}.`;
  }

  function askAi(query) {
    if (!query.trim()) return;
    closeAllOverlays();
    launchApp('chatbot', { source:'command' });
    const context = contextPrompt();
    const send = () => {
      if (window.__AIZANOI_CHAT__?.ask) {
        window.__AIZANOI_CHAT__.ask(query.trim(), context);
        return true;
      }
      const input = document.getElementById('chat-input');
      const button = document.getElementById('chat-send');
      if (!input || !button) return false;
      input.value = query.trim();
      input.dispatchEvent(new Event('input', { bubbles:true }));
      button.click();
      return true;
    };
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (send() || tries > 20) clearInterval(timer);
    }, 60);
    State.recordActivity('Asked Aizanoi AI', query.trim().slice(0, 120), 'ai');
    playSound('ai');
  }

  function landmarkMatch(world, query) {
    const q = query.toLowerCase();
    const aliases = {
      aızanoi:{},
      aizanói:{},
      theatre:['theatre','theater'],
      penkalas:['penkalas','river','riverfront'],
      bridge3:['bridge','central bridge'],
      greatbath:['great bath','bath','palaestra'],
      colosseum:['colosseum','coliseum'],
      forum:['forum','roman forum'],
      pantheon:['pantheon'],
      subura:['subura'],
      parthenon:['parthenon','acropolis'],
      agora:['agora'],
      pnyx:['pnyx'],
      hephaisteion:['hephaisteion','hephaestus','hephaestion'],
      temple:['temple','zeus'],
      stadium:['stadium'],
      macellum:['macellum','market'],
    };
    for (const id of Object.keys(world.landmarks || {})) {
      const terms = [id, String(world.landmarks[id]).toLowerCase(), ...(aliases[id] || [])];
      if (terms.some((term) => q.includes(String(term).toLowerCase()))) return id;
    }
    return null;
  }

  function handleNaturalCommand(raw) {
    const query = raw.trim();
    const q = query.toLowerCase();
    if (!q) return false;

    if (/^(settings|system|system panel|preferences|ayar)/.test(q)) { openSystemPanel(); return true; }
    if (/^(lock|lock system)/.test(q)) { window.doLock?.(); closeAllOverlays(); return true; }
    if (/^(home|desktop|show desktop)/.test(q)) { showDesktopHome(); closeAllOverlays(); return true; }
    if (/^(night|night theme|theme night|dark field)/.test(q)) { State.setPreference('theme','night'); applyPreferences(); closeAllOverlays(); return true; }
    if (/^(archive|archive theme|theme archive)/.test(q)) { State.setPreference('theme','archive'); applyPreferences(); closeAllOverlays(); return true; }
    if (/^(field|field theme|theme field)/.test(q)) { State.setPreference('theme','field'); applyPreferences(); closeAllOverlays(); return true; }
    if (/sound (off|mute)|^(mute|sound off)$/.test(q)) { State.setPreference('sound',false); applyPreferences(); closeAllOverlays(); return true; }
    if (/sound on|^unmute$/.test(q)) { State.setPreference('sound',true); applyPreferences(); playSound('open'); closeAllOverlays(); return true; }

    for (const world of State.worlds) {
      const worldTerms = [world.id, world.label.toLowerCase(), ...world.keywords];
      if (worldTerms.some((term) => q.includes(String(term).toLowerCase()))) {
        const landmark = landmarkMatch(world, q);
        launchWorld(world.id, landmark);
        return true;
      }
    }

    const cleaned = q.replace(/^(open|launch|show|go to|start)\s+/,'').trim();
    const app = State.apps.find((item) => {
      const terms = [item.id, item.label.toLowerCase(), item.short.toLowerCase(), ...item.keywords];
      return terms.some((term) => cleaned === String(term).toLowerCase() || cleaned.includes(String(term).toLowerCase()));
    });
    if (app) { launchApp(app.id, { source:'command' }); return true; }
    return false;
  }

  function commandCatalog(query = '') {
    const q = query.trim().toLowerCase();
    const commands = [];
    const add = (command) => commands.push(command);

    State.apps.forEach((app) => add({
      id:`app:${app.id}`, title:`Open ${app.label}`, subtitle:app.category, kind:'App', icon:app.icon,
      keywords:[app.id,app.label,app.short,...app.keywords].join(' '), action:() => launchApp(app.id,{source:'command'})
    }));

    State.worlds.forEach((world) => {
      add({ id:`world:${world.id}`, title:`Explore ${world.label}`, subtitle:`${world.era} · ${world.subtitle}`, kind:'World', icon:'/assets/icons/ancient-world.svg', keywords:[world.label,...world.keywords].join(' '), action:() => launchWorld(world.id) });
      Object.entries(world.landmarks).forEach(([landmark,label]) => add({ id:`world:${world.id}:${landmark}`, title:`${world.label} · ${label}`, subtitle:`Jump target · ${world.era}`, kind:'Place', icon:'/assets/icons/ancient-world.svg', keywords:`${world.label} ${label} ${landmark}`, action:() => launchWorld(world.id,landmark) }));
    });

    add({ id:'system:panel', title:'System Panel', subtitle:'Theme, sound, motion and workspace restore', kind:'System', icon:'/assets/icons/control-panel.svg', keywords:'settings system control panel preferences theme sound motion', action:openSystemPanel });
    add({ id:'system:switcher', title:'Open Apps', subtitle:'Switch between running workspace applications', kind:'System', icon:'/assets/icons/projects.svg', keywords:'switch windows open apps task switcher', action:openSwitcher });
    add({ id:'system:activity', title:'Activity', subtitle:'Recent local workspace events', kind:'System', icon:'/icons/Information.png', keywords:'activity notifications recent events', action:openActivity });
    add({ id:'system:lock', title:'Lock Field System', subtitle:'Hide the current workspace', kind:'System', icon:'/assets/icons/control-panel.svg', keywords:'lock system', action:() => window.doLock?.() });
    add({ id:'theme:field', title:'Use Field theme', subtitle:'Stone, survey grid and muted landscape', kind:'Theme', icon:'/assets/branding/aizanoi-logo-mark.svg', keywords:'field theme appearance', action:() => { State.setPreference('theme','field'); applyPreferences(); closeAllOverlays(); } });
    add({ id:'theme:archive', title:'Use Archive theme', subtitle:'Warmer research-room palette', kind:'Theme', icon:'/assets/branding/aizanoi-logo-mark.svg', keywords:'archive theme warm appearance', action:() => { State.setPreference('theme','archive'); applyPreferences(); closeAllOverlays(); } });
    add({ id:'theme:night', title:'Use Night theme', subtitle:'Low-luminance research mode', kind:'Theme', icon:'/assets/branding/aizanoi-logo-mark.svg', keywords:'night dark theme appearance', action:() => { State.setPreference('theme','night'); applyPreferences(); closeAllOverlays(); } });

    const scored = commands.map((command) => {
      if (!q) return { command, score:command.kind === 'App' ? 40 : command.kind === 'World' ? 35 : 10 };
      const title = command.title.toLowerCase();
      const haystack = `${title} ${command.subtitle || ''} ${command.keywords || ''}`.toLowerCase();
      let score = 0;
      if (title === q) score += 120;
      if (title.startsWith(q)) score += 75;
      if (title.includes(q)) score += 55;
      const words = q.split(/\s+/).filter(Boolean);
      words.forEach((word) => { if (haystack.includes(word)) score += 15; });
      return { command, score };
    }).filter((item) => !q || item.score > 0).sort((a,b) => b.score - a.score).map((item) => item.command);

    if (q) scored.unshift({
      id:'ai:ask', title:`Ask Aizanoi AI “${query.trim()}”`, subtitle:`Context: ${State.contextLabel()}`, kind:'AI', icon:'/assets/icons/aizanoi-ai.svg', keywords:q, action:() => askAi(query)
    });
    return scored.slice(0, 14);
  }

  function renderCommandResults(query = '') {
    const results = $('#az-command-results');
    if (!results) return;
    renderedCommands = commandCatalog(query);
    commandSelection = Math.max(0, Math.min(commandSelection, renderedCommands.length - 1));
    if (!renderedCommands.length) {
      results.innerHTML = '<div class="az-activity-row"><b>No direct match</b><p>Press Enter to ask Aizanoi AI.</p></div>';
      return;
    }
    results.innerHTML = renderedCommands.map((command,index) => `
      <button class="az-command-result${index === commandSelection ? ' selected' : ''}" role="option" aria-selected="${index === commandSelection}" data-command-index="${index}">
        <img src="${escapeHtml(command.icon || '/assets/branding/aizanoi-logo-mark.svg')}" alt=""><span><span class="az-result-title">${escapeHtml(command.title)}</span><span class="az-result-sub">${escapeHtml(command.subtitle || '')}</span></span><span class="az-result-kind">${escapeHtml(command.kind || '')}</span>
      </button>`).join('');
    results.querySelector('.selected')?.scrollIntoView({ block:'nearest' });
  }

  function openCommand(initial = '') {
    closeAllOverlays();
    setOverlay('az-command', true);
    const input = $('#az-command-input');
    if (!input) return;
    input.value = initial;
    commandSelection = 0;
    renderCommandResults(initial);
    input.focus();
    input.select();
    playSound('tick');
  }

  function executeSelectedCommand() {
    const input = $('#az-command-input');
    const query = input?.value || '';
    if (query.trim() && handleNaturalCommand(query)) return;
    const command = renderedCommands[commandSelection];
    if (command?.action) command.action();
    else if (query.trim()) askAi(query);
  }

  function renderIndex() {
    const apps = $('#az-index-apps');
    const worlds = $('#az-index-worlds');
    const recent = $('#az-index-recent');
    if (apps) apps.innerHTML = State.apps.slice(0,8).map((app) => `
      <button class="az-app-item" data-app="${app.id}"><img src="${app.icon}" alt=""><span><strong>${escapeHtml(app.label)}</strong><small>${escapeHtml(app.category)}</small></span><span class="az-arrow">›</span></button>`).join('');
    if (worlds) worlds.innerHTML = State.worlds.map((world) => `
      <button class="az-world-card" data-world="${world.id}"><span class="az-world-era">${escapeHtml(world.era)}</span><span class="az-world-name">${escapeHtml(world.label)}</span><span class="az-world-desc">${escapeHtml(world.subtitle)}</span></button>`).join('');
    if (recent) recent.innerHTML = recentMarkup(State.getState().recent, 8);
  }

  function recentMarkup(items, limit = 6) {
    if (!items?.length) return '<div class="az-activity-row"><b>No recent activity yet</b><p>Open an app or historical world and it will appear here.</p></div>';
    return items.slice(0,limit).map((item,index) => `
      <button class="az-recent-item" data-recent-index="${index}"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.type === 'world' ? 'Historical world' : 'Application')} · ${relativeTime(item.timestamp)}</small></button>`).join('');
  }

  function relativeTime(timestamp) {
    const delta = Math.max(0, Date.now() - Number(timestamp || 0));
    if (delta < 60000) return 'now';
    if (delta < 3600000) return `${Math.floor(delta/60000)}m ago`;
    if (delta < 86400000) return `${Math.floor(delta/3600000)}h ago`;
    return `${Math.floor(delta/86400000)}d ago`;
  }

  function openRecent(index) {
    const item = State.getState().recent[index];
    if (!item) return;
    if (item.type === 'world') launchWorld(item.worldId || item.id, item.landmark || null);
    else launchApp(item.appId || item.id);
  }

  function renderSystemPanelState() {
    const prefs = State.getState();
    $$('.az-theme-choice').forEach((button) => button.classList.toggle('active', button.dataset.theme === prefs.theme));
    const sound = $('#az-setting-sound'); if (sound) sound.checked = !!prefs.sound;
    const motion = $('#az-setting-motion'); if (motion) motion.checked = !!prefs.reduceMotion;
    const boot = $('#az-setting-boot'); if (boot) boot.checked = !!prefs.boot;
    const session = $('#az-setting-session'); if (session) session.checked = !!prefs.restoreSession;
  }

  function renderActivity() {
    const body = $('#az-activity-body');
    if (!body) return;
    const items = State.getState().activity;
    body.innerHTML = items.length ? items.map((item) => `<article class="az-activity-row"><b>${escapeHtml(item.title)}</b>${item.body ? `<p>${escapeHtml(item.body)}</p>` : ''}<time>${new Date(item.timestamp).toLocaleString([], { hour:'2-digit', minute:'2-digit', month:'short', day:'numeric' })}</time></article>`).join('') : '<div class="az-activity-row"><b>No workspace events yet</b><p>Application and world launches are kept locally in this browser.</p></div>';
  }

  function renderSwitcher() {
    const body = $('#az-switcher-body');
    if (!body) return;
    const ids = getVisibleAppIds();
    body.innerHTML = ids.length ? ids.map((id) => {
      const app = State.findApp(id);
      return `<button class="az-switch-card" data-switch-app="${id}"><img src="${app?.icon || '/assets/branding/aizanoi-logo-mark.svg'}" alt=""><span><strong>${escapeHtml(app?.label || id)}</strong><small>${id === getActiveAppId() ? 'Active' : 'Open'}</small></span><span>›</span></button>`;
    }).join('') : '<div class="az-activity-row"><b>No apps open</b><p>Use Aizanoi Index or Search to start a workspace application.</p></div>';
  }

  function renderMobileHome() {
    const apps = $('#az-mobile-apps');
    const worlds = $('#az-mobile-worlds');
    const recent = $('#az-mobile-recent');
    if (apps) apps.innerHTML = State.apps.slice(0,8).map((app) => `<button class="az-mobile-app" data-app="${app.id}"><img src="${app.icon}" alt=""><span>${escapeHtml(app.short)}</span></button>`).join('');
    if (worlds) worlds.innerHTML = State.worlds.map((world) => `<button class="az-mobile-world" data-world="${world.id}"><b>${escapeHtml(world.label)}</b><span>${escapeHtml(world.era)}</span></button>`).join('');
    if (recent) recent.innerHTML = recentMarkup(State.getState().recent,4);
  }

  function updateMobileClock() {
    const now = new Date();
    const time = $('#az-mobile-time'); const date = $('#az-mobile-date');
    if (time) time.textContent = now.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', hour12:false });
    if (date) date.textContent = now.toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' }).toUpperCase();
  }

  function showDesktopHome() {
    const map = windowsMap();
    if (isMobileShell()) {
      if (map) for (const state of map.values()) if (state?.el) state.el.style.display = 'none';
      $('#az-mobile-home')?.classList.remove('hidden');
    } else {
      if (map) for (const state of map.values()) if (state?.el) state.el.style.display = 'none';
    }
    State.setContext({ type:'desktop', label:'Aizanoi Field System', appId:null, worldId:null, landmark:null });
    updateShellState();
  }

  function updateMobileHomeVisibility() {
    const home = $('#az-mobile-home');
    if (!home) return;
    if (!isMobileShell()) { home.classList.add('hidden'); return; }
    home.classList.toggle('hidden', getVisibleAppIds().length > 0);
  }

  function updateFieldCard() {
    const card = $('#az-field-card');
    if (!card) return;
    const context = State.getContext();
    $('.az-context', card).textContent = State.contextLabel(context);
    const detail = $('.az-detail', card);
    if (detail) detail.textContent = context.type === 'app' ? 'WORKSPACE APPLICATION · LOCAL SESSION' : context.type === 'world' ? 'HISTORICAL WORLD · EVIDENCE-AWARE CONTEXT' : 'ARCHIVE ONLINE · GRID 39°12′N 29°37′E';
  }

  function updateSystemStatus() {
    const status = $('#az-system-status');
    if (status) status.textContent = State.contextLabel().toUpperCase().slice(0,32);
  }

  function updateShellState() {
    updateMobileHomeVisibility();
    renderMobileHome();
    renderIndex();
    updateFieldCard();
    updateSystemStatus();
    syncSessionState();
  }

  function syncSessionState() {
    State.setSessionApps(getVisibleAppIds(), getActiveAppId());
  }

  function storeWindowRects() {
    if (isMobileShell()) return;
    const map = windowsMap();
    if (!map) return;
    for (const [appId,state] of map.entries()) {
      const el = state?.el;
      if (!State.findApp(appId) || !el?.isConnected || el.classList.contains('maximized') || el.classList.contains('aizanoi-snap-left') || el.classList.contains('aizanoi-snap-right')) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 250 || rect.height < 150) continue;
      State.saveWindowRect(appId, rect);
    }
  }

  function restoreWindowRect(appId) {
    if (isMobileShell()) return;
    const map = windowsMap(); const state = map?.get(appId); const rect = State.getWindowRect(appId);
    if (!state?.el || !rect) return;
    const maxW = Math.max(280, innerWidth - 20); const maxH = Math.max(180, innerHeight - 70);
    state.el.style.width = `${Math.min(maxW, Math.max(280, rect.width))}px`;
    state.el.style.height = `${Math.min(maxH, Math.max(180, rect.height))}px`;
    state.el.style.left = `${Math.max(4, Math.min(innerWidth - 120, rect.left))}px`;
    state.el.style.top = `${Math.max(4, Math.min(innerHeight - 100, rect.top))}px`;
    window.__AIZANOI_OS_V2__?.clampWindows?.();
  }

  function snapActive(side) {
    if (isMobileShell()) return;
    const appId = getActiveAppId(); const map = windowsMap(); const state = map?.get(appId);
    if (!appId || !state?.el) return;
    if (state.maximized && typeof window.toggleMaximize === 'function') window.toggleMaximize(appId);
    state.el.classList.remove('aizanoi-snap-left','aizanoi-snap-right');
    state.el.classList.add(side === 'right' ? 'aizanoi-snap-right' : 'aizanoi-snap-left');
    State.recordActivity(`Snapped ${State.findApp(appId)?.label || appId}`, side === 'right' ? 'Right workspace' : 'Left workspace', 'window');
    playSound('tick');
  }

  function unsnapWindow(el) {
    if (!el?.classList.contains('aizanoi-snap-left') && !el?.classList.contains('aizanoi-snap-right')) return;
    el.classList.remove('aizanoi-snap-left','aizanoi-snap-right');
    const appId = appIdForWindow(el);
    if (appId) restoreWindowRect(appId);
  }

  function wrapWindowLifecycle() {
    if (window.openApp && !window.openApp.__aizanoiNext) {
      const coreOpen = window.openApp;
      const wrapped = function(appId, ...args) {
        if (appId === 'control') { openSystemPanel(); return; }
        const result = coreOpen.call(this, appId, ...args);
        const app = State.findApp(appId);
        if (app) {
          State.markAppRecent(appId);
          State.setContext({ type:'app', label:app.label, appId, worldId:null, landmark:null });
          setTimeout(() => restoreWindowRect(appId), 0);
          setTimeout(updateShellState, 30);
        }
        return result;
      };
      wrapped.__aizanoiNext = true;
      window.openApp = wrapped;
    }

    if (window.closeApp && !window.closeApp.__aizanoiNext) {
      const coreClose = window.closeApp;
      const wrapped = function(appId, ...args) {
        storeWindowRects();
        const result = coreClose.call(this, appId, ...args);
        const app = State.findApp(appId);
        if (app) State.recordActivity(`Closed ${app.label}`, '', 'app');
        setTimeout(() => {
          const active = getActiveAppId();
          const activeApp = State.findApp(active);
          State.setContext(activeApp ? { type:'app', label:activeApp.label, appId:activeApp.id, worldId:null, landmark:null } : { type:'desktop', label:'Aizanoi Field System', appId:null, worldId:null, landmark:null });
          updateShellState();
        }, 0);
        playSound('close');
        return result;
      };
      wrapped.__aizanoiNext = true;
      window.closeApp = wrapped;
    }

    if (window.bringToFront && !window.bringToFront.__aizanoiNext) {
      const coreFront = window.bringToFront;
      const wrapped = function(appId, ...args) {
        const result = coreFront.call(this, appId, ...args);
        const app = State.findApp(appId);
        if (app) State.setContext({ type:'app', label:app.label, appId, worldId:null, landmark:null });
        setTimeout(updateShellState, 0);
        return result;
      };
      wrapped.__aizanoiNext = true;
      window.bringToFront = wrapped;
    }

    window.addEventListener('mouseup', storeWindowRects, { passive:true });
    window.addEventListener('touchend', storeWindowRects, { passive:true });
    window.addEventListener('pagehide', () => { storeWindowRects(); syncSessionState(); });
    document.addEventListener('pointerdown', (event) => {
      const titlebar = event.target.closest('.win-titlebar');
      if (titlebar) unsnapWindow(titlebar.closest('.win'));
    }, true);
  }

  function restorePreviousSession() {
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(() => {
      const prefs = State.getState();
      if (!prefs.restoreSession || isMobileShell()) return;
      if (location.pathname !== '/' && location.pathname !== '/index.html') return;
      if (getVisibleAppIds().length) return;
      const apps = prefs.sessionApps.filter((id) => State.findApp(id)).slice(0,3);
      apps.forEach((id,index) => setTimeout(() => window.openApp?.(id), index * 90));
      if (prefs.lastActive && apps.includes(prefs.lastActive)) setTimeout(() => window.bringToFront?.(prefs.lastActive), apps.length * 100 + 80);
    }, 850);
  }

  function mountSystemBar() {
    const taskbar = $('#taskbar'); const start = $('#start-btn'); const sep = $('#taskbar-sep'); const items = $('#taskbar-items'); const tray = $('#tray');
    if (!taskbar || !start || !sep || !items || !tray) return;
    start.innerHTML = '<span id="start-icon"><img src="/assets/branding/aizanoi-logo-mark.svg" alt=""></span><span>Aizanoi</span>';
    start.setAttribute('aria-label','Open Aizanoi Index');
    start.title = 'Aizanoi Index';

    if (!$('#az-search-button')) {
      const search = document.createElement('button'); search.id = 'az-search-button'; search.className = 'az-system-button'; search.innerHTML = '<span>Search</span><span class="az-key">Ctrl K</span>'; search.setAttribute('aria-label','Search Aizanoi OS');
      sep.after(search);
    }
    if (!$('#az-ai-button')) {
      const ai = document.createElement('button'); ai.id = 'az-ai-button'; ai.className = 'az-system-button'; ai.textContent = 'AI'; ai.setAttribute('aria-label','Ask Aizanoi AI');
      items.after(ai);
    }
    if (!$('#az-activity-button')) {
      const activity = document.createElement('button'); activity.id = 'az-activity-button'; activity.className = 'az-system-button'; activity.textContent = 'Activity';
      $('#az-ai-button').after(activity);
    }
    if (!$('#az-system-status')) {
      const status = document.createElement('span'); status.id = 'az-system-status'; status.textContent = 'ARCHIVE ONLINE'; tray.prepend(status);
    }
    if (!$('#az-mobile-nav')) {
      const nav = document.createElement('nav'); nav.id = 'az-mobile-nav'; nav.setAttribute('aria-label','Aizanoi mobile navigation');
      nav.innerHTML = '<button class="az-mobile-nav-btn active" data-mobile-nav="home"><strong>⌂</strong><span>Home</span></button><button class="az-mobile-nav-btn" data-mobile-nav="search"><strong>⌕</strong><span>Search</span></button><button class="az-mobile-nav-btn" data-mobile-nav="ai"><strong>AI</strong><span>Ask</span></button><button class="az-mobile-nav-btn" data-mobile-nav="recent"><strong>▣</strong><span>Recent</span></button>';
      taskbar.appendChild(nav);
    }

    start.addEventListener('click', (event) => { event.preventDefault(); event.stopImmediatePropagation(); openIndex(); }, true);
    start.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopImmediatePropagation(); openIndex(); }
    }, true);
    $('#az-search-button')?.addEventListener('click', () => openCommand());
    $('#az-ai-button')?.addEventListener('click', () => openCommand('ask '));
    $('#az-activity-button')?.addEventListener('click', openActivity);
  }

  function pruneLegacyDesktop() {
    const update = () => {
      $$('.desktop-icon').forEach((icon) => {
        const id = icon.dataset.app;
        icon.hidden = LEGACY_DESKTOP_APPS.has(id);
        if (id === 'ancient') {
          const label = $('.icon-label',icon); if (label && label.textContent !== 'Historical Worlds') label.textContent = 'Historical Worlds';
        }
        if (id === 'terminal') {
          const label = $('.icon-label',icon); if (label && label.textContent !== 'Field Terminal') label.textContent = 'Field Terminal';
        }
        if (id === 'notes') {
          const label = $('.icon-label',icon); if (label && label.textContent !== 'Field Notes') label.textContent = 'Field Notes';
        }
      });
    };
    update();
    const layer = $('#icon-layer');
    if (layer) new MutationObserver(update).observe(layer,{childList:true,subtree:true});
  }

  function mountContextMenu() {
    const menu = $('#az-context-menu');
    if (!menu) return;
    document.addEventListener('contextmenu', (event) => {
      const inShellSurface = event.target.closest('#desktop,#taskbar,.desktop-icon');
      if (!inShellSurface || event.target.closest('.win-body')) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const icon = event.target.closest('.desktop-icon');
      const appId = icon?.dataset.app;
      const items = [];
      if (appId && State.findApp(appId)) items.push({ label:`Open ${State.findApp(appId).label}`, shortcut:'Enter', action:() => launchApp(appId) });
      items.push({ label:'Search workspace', shortcut:'Ctrl K', action:() => openCommand() });
      items.push({ label:'Ask Aizanoi AI', shortcut:'AI', action:() => openCommand('ask ') });
      items.push({ sep:true });
      items.push({ label:'System Panel', shortcut:'', action:openSystemPanel });
      items.push({ label:'Show desktop', shortcut:'', action:showDesktopHome });
      renderContextMenu(items, event.clientX, event.clientY);
    }, true);
    document.addEventListener('pointerdown', (event) => { if (!menu.contains(event.target)) closeContextMenu(); }, true);
  }

  function renderContextMenu(items, x, y) {
    const menu = $('#az-context-menu');
    if (!menu) return;
    menu.innerHTML = items.map((item,index) => item.sep ? '<div class="az-context-sep"></div>' : `<button class="az-context-item" data-context-index="${index}"><span>${escapeHtml(item.label)}</span><span>${escapeHtml(item.shortcut || '')}</span></button>`).join('');
    menu.classList.add('open'); menu.setAttribute('aria-hidden','false');
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(4,Math.min(innerWidth-rect.width-4,x))}px`;
    menu.style.top = `${Math.max(4,Math.min(innerHeight-rect.height-4,y))}px`;
    menu.onclick = (event) => {
      const button = event.target.closest('[data-context-index]'); if (!button) return;
      const item = items[Number(button.dataset.contextIndex)]; closeContextMenu(); item?.action?.();
    };
  }

  function closeContextMenu() {
    const menu = $('#az-context-menu');
    if (!menu) return;
    menu.classList.remove('open'); menu.setAttribute('aria-hidden','true');
  }

  function bootNarrative() {
    const boot = $('#boot'); const status = $('#boot-status');
    if (!boot || !status || getComputedStyle(boot).display === 'none') return;
    const steps = ['Initializing archive index…','Mounting historical worlds…','Calibrating field context…','Connecting Aizanoi AI…','Field System ready.'];
    let index = 0;
    status.textContent = steps[0];
    clearInterval(bootNarrativeTimer);
    bootNarrativeTimer = setInterval(() => {
      if (!boot.isConnected || getComputedStyle(boot).display === 'none' || boot.classList.contains('hide')) { clearInterval(bootNarrativeTimer); return; }
      index = Math.min(index + 1, steps.length - 1); status.textContent = steps[index];
    }, 430);
  }

  function interceptLegacyActions() {
    window.doSearch = () => openCommand();
    window.doRun = () => openCommand();
    window.openStartMenu = openIndex;
    window.toggleStartMenu = openIndex;
    window.closeStartMenu = () => setOverlay('az-index',false);

    document.addEventListener('keydown', (event) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); event.stopImmediatePropagation(); openCommand(); return;
      }
      if (!typing && event.altKey && event.key === 'ArrowLeft') { event.preventDefault(); event.stopImmediatePropagation(); snapActive('left'); return; }
      if (!typing && event.altKey && event.key === 'ArrowRight') { event.preventDefault(); event.stopImmediatePropagation(); snapActive('right'); return; }
      if (!typing && event.ctrlKey && event.key === '`') { event.preventDefault(); event.stopImmediatePropagation(); openSwitcher(); return; }
      if (!typing && event.ctrlKey && (event.key === 'o' || event.key === 'O')) { event.preventDefault(); event.stopImmediatePropagation(); openCommand(); return; }
      if (event.key === 'Escape' && OVERLAYS.some((id) => document.getElementById(id)?.classList.contains('open'))) { event.preventDefault(); closeAllOverlays(); return; }
    }, true);
  }

  function wireOverlayEvents() {
    document.addEventListener('click', (event) => {
      const close = event.target.closest('[data-az-close]');
      if (close) { setOverlay(close.dataset.azClose,false); playSound('close'); return; }
      const app = event.target.closest('[data-app]');
      if (app && app.closest('#az-shell-layer')) { launchApp(app.dataset.app); return; }
      const world = event.target.closest('[data-world]');
      if (world && world.closest('#az-shell-layer')) { launchWorld(world.dataset.world); return; }
      const recent = event.target.closest('[data-recent-index]');
      if (recent && recent.closest('#az-shell-layer')) { openRecent(Number(recent.dataset.recentIndex)); return; }
      const switchApp = event.target.closest('[data-switch-app]');
      if (switchApp) {
        const id = switchApp.dataset.switchApp; const map = windowsMap(); const state = map?.get(id);
        if (state?.el) state.el.style.display = 'flex';
        window.bringToFront?.(id); setOverlay('az-switcher',false); updateShellState(); return;
      }
      const action = event.target.closest('[data-az-action]')?.dataset.azAction;
      if (action === 'command') openCommand();
      if (action === 'system') openSystemPanel();
      if (action === 'switcher') openSwitcher();
      if (action === 'activity') openActivity();
      if (action === 'lock') { closeAllOverlays(); window.doLock?.(); }
      if (action === 'clear-activity') { State.clearActivity(); renderActivity(); }
      if (action === 'reset-state') { State.resetWorkspaceState(); applyPreferences(); renderIndex(); renderActivity(); renderMobileHome(); }
    });

    $$('.az-overlay').forEach((overlay) => overlay.addEventListener('pointerdown', (event) => { if (event.target === overlay) setOverlay(overlay.id,false); }));

    $('#az-command-input')?.addEventListener('input', (event) => { commandSelection = 0; renderCommandResults(event.target.value); });
    $('#az-command-input')?.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') { event.preventDefault(); commandSelection = Math.min(renderedCommands.length-1,commandSelection+1); renderCommandResults(event.currentTarget.value); }
      if (event.key === 'ArrowUp') { event.preventDefault(); commandSelection = Math.max(0,commandSelection-1); renderCommandResults(event.currentTarget.value); }
      if (event.key === 'Enter') { event.preventDefault(); executeSelectedCommand(); }
    });
    $('#az-command-results')?.addEventListener('click', (event) => {
      const row = event.target.closest('[data-command-index]'); if (!row) return;
      commandSelection = Number(row.dataset.commandIndex); renderedCommands[commandSelection]?.action?.();
    });

    $$('.az-theme-choice').forEach((button) => button.addEventListener('click', () => {
      State.setPreference('theme',button.dataset.theme); applyPreferences(); playSound('tick');
    }));
    $('#az-setting-sound')?.addEventListener('change', (event) => { State.setPreference('sound',event.target.checked); if (event.target.checked) playSound('open'); });
    $('#az-setting-motion')?.addEventListener('change', (event) => { State.setPreference('reduceMotion',event.target.checked); applyPreferences(); });
    $('#az-setting-boot')?.addEventListener('change', (event) => State.setPreference('boot',event.target.checked));
    $('#az-setting-session')?.addEventListener('change', (event) => State.setPreference('restoreSession',event.target.checked));

    $('#az-mobile-nav')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-mobile-nav]'); if (!button) return;
      $$('.az-mobile-nav-btn').forEach((item) => item.classList.remove('active')); button.classList.add('active');
      const action = button.dataset.mobileNav;
      if (action === 'home') showDesktopHome();
      if (action === 'search') openCommand();
      if (action === 'ai') openCommand('ask ');
      if (action === 'recent') openSwitcher();
    });
  }

  function wireOldNotificationBridge() {
    if (window.showBalloon && !window.showBalloon.__aizanoiNext) {
      const core = window.showBalloon;
      const wrapped = function(options = {}) {
        if (options?.title) State.recordActivity(options.title, String(options.body || '').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,180), 'notification');
        return core.call(this, options);
      };
      wrapped.__aizanoiNext = true;
      window.showBalloon = wrapped;
    }
  }

  function init() {
    mountShellMarkup();
    applyPreferences();
    mountSystemBar();
    pruneLegacyDesktop();
    mountContextMenu();
    wrapWindowLifecycle();
    interceptLegacyActions();
    wireOverlayEvents();
    wireOldNotificationBridge();
    renderIndex();
    renderMobileHome();
    updateMobileClock();
    setInterval(updateMobileClock,30000);
    bootNarrative();
    updateShellState();
    restorePreviousSession();

    State.subscribe(({ type }) => {
      if (['recent','activity','context','preference','session','reset'].includes(type)) updateShellState();
    });
    window.addEventListener('resize', () => { updateShellState(); window.__AIZANOI_OS_V2__?.clampWindows?.(); });

    State.recordActivity('Aizanoi Field System ready', 'Major shell redesign initialized locally in this browser.', 'system');

    window.AIZANOI_OS = Object.freeze({
      openIndex,
      openCommand,
      openSystemPanel,
      openActivity,
      openSwitcher,
      launchApp,
      launchWorld,
      askAi,
      snapActive,
      showDesktopHome,
      updateShellState,
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();