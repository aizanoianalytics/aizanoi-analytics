(() => {
  'use strict';

  const State = window.AIZANOI_OS_STATE;
  if (!State) return;

  const normalize = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const DISABLED_AI_COPY = /\b(?:open|ask)\s+aizanoi\s+ai\b|\baizanoi\s+ai\b/i;

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
    if (!query || DISABLED_AI_COPY.test(query)) return false;
    if (DIRECT_TERMS.has(query)) return true;
    if (ACTION_PREFIX.test(query)) return true;
    if (/^sound\s+(on|off|mute)\b/.test(query)) return true;
    if (/^theme\s+\w+\b/.test(query)) return true;
    return false;
  }

  function shouldAskAI() {
    return false;
  }

  function isDisabledAIResult(row) {
    if (!row) return false;
    const kind = row.querySelector('.az-result-kind')?.textContent?.trim().toUpperCase();
    const title = row.querySelector('.az-result-title')?.textContent?.trim() || row.textContent || '';
    return kind === 'AI' || DISABLED_AI_COPY.test(title);
  }

  function visibleCommandRows(panel = document.getElementById('az-command')) {
    return [...(panel?.querySelectorAll('.az-command-result') || [])].filter((row) => !row.hidden && !isDisabledAIResult(row));
  }

  function syncCommandResultIntent() {
    const panel = document.getElementById('az-command');
    if (!panel?.classList.contains('open')) return;
    const results = panel.querySelector('#az-command-results');
    const rows = [...panel.querySelectorAll('.az-command-result')];

    for (const row of rows) {
      const disabled = isDisabledAIResult(row);
      row.hidden = disabled;
      if (disabled) {
        row.classList.remove('selected');
        row.setAttribute('aria-selected','false');
        row.setAttribute('aria-hidden','true');
        row.tabIndex = -1;
      } else {
        row.removeAttribute('aria-hidden');
      }
    }

    const visible = visibleCommandRows(panel);
    if (!visible.some((row) => row.classList.contains('selected'))) {
      visible.forEach((row) => {
        row.classList.remove('selected');
        row.setAttribute('aria-selected','false');
      });
      const first = visible[0];
      first?.classList.add('selected');
      first?.setAttribute('aria-selected','true');
    }

    let empty = results?.querySelector('[data-ai-disabled-empty]');
    if (!visible.length && rows.length) {
      if (!empty && results) {
        empty = document.createElement('div');
        empty.className = 'az-activity-row';
        empty.dataset.aiDisabledEmpty = 'true';
        empty.innerHTML = '<b>No direct match</b><p>Try an application, historical world, landmark or system command.</p>';
        results.appendChild(empty);
      }
    } else {
      empty?.remove();
    }
  }

  function scheduleCommandResultSync() {
    queueMicrotask(syncCommandResultIntent);
    requestAnimationFrame(syncCommandResultIntent);
  }

  function executeVisibleSelection(event) {
    if (event.key !== 'Enter' || event.isComposing) return false;
    const input = event.target?.closest?.('#az-command-input');
    const panel = input?.closest?.('#az-command');
    if (!input || !panel?.classList.contains('open')) return false;

    syncCommandResultIntent();
    const selected = visibleCommandRows(panel).find((row) => row.classList.contains('selected')) || visibleCommandRows(panel)[0];
    if (!selected) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return true;
    }

    // os-shell keeps a private commandSelection index. Clicking the visible DOM
    // result is the authoritative safe path after disabled AI rows are filtered,
    // so Enter can never execute a hidden stale command.
    event.preventDefault();
    event.stopImmediatePropagation();
    selected.click();
    return true;
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
    if (executeVisibleSelection(event)) return;
    if (event.target?.closest?.('#az-command-input')) scheduleCommandResultSync();
  }, true);

  document.addEventListener('click', (event) => {
    const row = event.target?.closest?.('.az-command-result');
    if (!row || !isDisabledAIResult(row)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
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
    isDisabledAIResult,
  });
})();
