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
        // Tiny abbreviations such as “ai” are safe as exact commands but must
        // never be treated as arbitrary substrings inside natural sentences.
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

  // Capture Enter before the palette's target-level handler. Explicit commands
  // continue through the normal shell parser; conversational language is routed
  // to AI regardless of incidental substrings such as “ai” inside “explain”.
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

  window.AIZANOI_OS_INTENT = Object.freeze({ isExplicitShellCommand, shouldAskAI });
})();