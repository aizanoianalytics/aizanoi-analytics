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
      if (app.id === 'chatbot') continue;
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

  function shouldAskAI() {
    return false;
  }

  function syncCommandResultIntent() {
    const panel = document.getElementById('az-command');
    if (!panel?.classList.contains('open')) return;
    const rows = [...panel.querySelectorAll('.az-command-result')];
    for (const row of rows) {
      const isAI = row.querySelector('.az-result-kind')?.textContent?.trim().toUpperCase() === 'AI';
      if (!isAI) continue;
      row.hidden = true;
      row.classList.remove('selected');
      row.setAttribute('aria-selected','false');
    }
    if (!rows.some((row) => !row.hidden && row.classList.contains('selected'))) {
      const first = rows.find((row) => !row.hidden);
      first?.classList.add('selected');
      first?.setAttribute('aria-selected','true');
    }
  }

  function scheduleCommandResultSync() {
    queueMicrotask(syncCommandResultIntent);
    requestAnimationFrame(syncCommandResultIntent);
  }

  function clearWorldAIContext() {
    try { sessionStorage.removeItem('aizanoi-world-ai-context'); } catch (_) {}
  }

  function submitContextualAI() {
    clearWorldAIContext();
    return false;
  }

  function consumeAskDeepLink() {
    if (location.pathname !== '/' && location.pathname !== '/index.html') return false;
    const url = new URL(location.href);
    if (!url.searchParams.has('ask')) return false;
    url.searchParams.delete('ask');
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
    clearWorldAIContext();
    return false;
  }

  document.addEventListener('input', (event) => {
    if (event.target?.id === 'az-command-input') scheduleCommandResultSync();
  });
  document.addEventListener('keydown', (event) => {
    if (event.target?.closest?.('#az-command-input')) scheduleCommandResultSync();
  }, true);

  setTimeout(() => {
    consumeAskDeepLink();
    syncCommandResultIntent();
  }, 0);

  window.AIZANOI_OS_INTENT = Object.freeze({
    isExplicitShellCommand,
    shouldAskAI,
    syncCommandResultIntent,
    consumeAskDeepLink,
    submitContextualAI,
  });
})();