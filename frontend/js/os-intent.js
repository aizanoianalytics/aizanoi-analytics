(() => {
  'use strict';

  const State = window.AIZANOI_OS_STATE;
  if (!State) return;

  const normalize = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

  function exactShellTerms() {
    const terms = new Set([
      'settings','system','system panel','preferences','ayar',
      'lock','lock system','home','desktop','show desktop',
      'night','night theme','theme night','dark field',
      'archive','archive theme','theme archive',
      'field','field theme','theme field','mute','sound off','sound on','unmute',
    ]);
    for (const app of State.apps || []) {
      terms.add(normalize(app.id));
      terms.add(normalize(app.label));
      terms.add(normalize(app.short));
      for (const keyword of app.keywords || []) {
        const term = normalize(keyword);
        if (term) terms.add(term);
      }
    }
    for (const world of State.worlds || []) {
      terms.add(normalize(world.id));
      terms.add(normalize(world.label));
      for (const keyword of world.keywords || []) terms.add(normalize(keyword));
      for (const [id, label] of Object.entries(world.landmarks || {})) {
        terms.add(normalize(id));
        terms.add(normalize(label));
      }
    }
    return terms;
  }

  const DIRECT_TERMS = exactShellTerms();
  const ACTION_PREFIX = /^(open|launch|show|go to|goto|start|switch to|explore|visit|jump to)\b/i;

  function isExplicitShellCommand(value) {
    const query = normalize(value);
    if (!query) return false;
    if (DIRECT_TERMS.has(query)) return true;
    if (ACTION_PREFIX.test(query)) return true;
    if (/^sound\s+(on|off|mute)\b/.test(query)) return true;
    if (/^theme\s+\w+\b/.test(query)) return true;
    return false;
  }

  function shouldAskAI(value) {
    const query = normalize(value);
    return Boolean(query && !isExplicitShellCommand(query));
  }

  function readWorldAIContext() {
    try {
      const raw = sessionStorage.getItem('aizanoi-world-ai-context');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || Date.now() - Number(parsed.timestamp || 0) > 120000) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function clearWorldAIContext() {
    try { sessionStorage.removeItem('aizanoi-world-ai-context'); } catch (_) {}
  }

  function submitContextualAI(query, historicalContext = null) {
    const shell = window.AIZANOI_OS;
    if (!shell?.launchApp || !query) return false;
    shell.launchApp('chatbot', { source:'historical-world' });
    const hiddenContext = historicalContext
      ? `Current Historical World context: ${historicalContext.worldLabel}${historicalContext.place ? ` · ${historicalContext.place}` : ''}. The visitor just returned from that interactive 3D view.`
      : '';
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (window.__AIZANOI_CHAT__?.ask) {
        clearInterval(timer);
        window.__AIZANOI_CHAT__.ask(query, hiddenContext);
      } else if (tries > 30) {
        clearInterval(timer);
      }
    }, 60);
    State.recordActivity('Asked Aizanoi AI from Historical World', historicalContext?.place || historicalContext?.worldLabel || query.slice(0, 100), 'ai');
    return true;
  }

  function consumeAskDeepLink() {
    if (location.pathname !== '/' && location.pathname !== '/index.html') return false;
    const url = new URL(location.href);
    const query = url.searchParams.get('ask')?.trim();
    if (!query) return false;
    const historicalContext = readWorldAIContext();
    url.searchParams.delete('ask');
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
    clearWorldAIContext();
    return submitContextualAI(query, historicalContext);
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    const input = event.target?.closest?.('#az-command-input');
    if (!input || !document.getElementById('az-command')?.classList.contains('open')) return;
    const query = input.value.trim();
    if (!shouldAskAI(query)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.AIZANOI_OS?.askAi?.(query);
  }, true);

  setTimeout(consumeAskDeepLink, 0);

  window.AIZANOI_OS_INTENT = Object.freeze({
    isExplicitShellCommand,
    shouldAskAI,
    consumeAskDeepLink,
    submitContextualAI,
  });
})();