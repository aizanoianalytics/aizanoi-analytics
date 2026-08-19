/* === CHAT: RETIRED SECURITY COMPATIBILITY === */
let chatHistory = [];
let chatWired = false;
let chatRequestController = null;
let lastFailedMessage = null;

/*
 * Aizanoi AI is a retired public product surface. The static shell still keeps
 * a small fail-closed compatibility module so old cached markup or deep links
 * cannot turn into a network-capable chat feature. Retire the UI before the
 * modern Field System shell mounts and keep removing any legacy nodes that an
 * older cached shell may re-create.
 */
function retireAizanoiAiSurfaces(root = document) {
  const scope = root instanceof Element ? root : document;
  const selectors = [
    '[data-app="chatbot"]',
    '#az-ai-button',
    '[data-mobile-nav="ai"]',
    '.chat-starter',
    'a[href="/hr-analytics/"]',
    'a[href="/hr-analytics"]'
  ];

  for (const selector of selectors) {
    const nodes = scope.matches?.(selector) ? [scope] : [...scope.querySelectorAll?.(selector) || []];
    nodes.forEach((node) => node.remove());
  }

  const interactive = scope.matches?.('button,a,.sm-item,.desktop-icon,.az-app-item,.az-mobile-app,.az-recent-item,.az-command-result')
    ? [scope]
    : [...scope.querySelectorAll?.('button,a,.sm-item,.desktop-icon,.az-app-item,.az-mobile-app,.az-recent-item,.az-command-result') || []];
  interactive.forEach((node) => {
    const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
    if (/\bAizanoi AI\b/i.test(text) || node.querySelector?.('.az-result-kind')?.textContent?.trim() === 'AI') node.remove();
  });

  const commandInput = document.getElementById('az-command-input');
  if (commandInput && /Aizanoi AI/i.test(commandInput.placeholder || '')) {
    commandInput.placeholder = 'Search apps, worlds, monuments or commands…';
  }
  const footer = document.querySelector('.az-command-footer');
  if (footer && /Aizanoi AI|Natural language/i.test(footer.textContent || '')) {
    footer.innerHTML = '<span>↑↓ Navigate</span><span>Enter Open</span><span>Esc Close</span>';
  }
  const callout = document.querySelector('.az-command-callout p');
  if (callout && /Aizanoi AI/i.test(callout.textContent || '')) {
    callout.textContent = 'Open apps, historical worlds and landmarks from the same searchable palette.';
  }
}
window.retireAizanoiAiSurfaces = retireAizanoiAiSurfaces;

(function installRetiredAiGuard() {
  window.AIZANOI_AI_DISABLED = true;

  if (/^\/hr-analytics\/?$/i.test(location.pathname)) {
    history.replaceState({}, '', '/');
  }

  function guardOpenApp() {
    const current = window.openApp;
    if (typeof current !== 'function' || current.__aizanoiRetiredAiGuard) return;
    const guarded = function(appId, ...args) {
      if (appId === 'chatbot') return false;
      return current.call(this, appId, ...args);
    };
    guarded.__aizanoiRetiredAiGuard = true;
    window.openApp = guarded;
  }

  function clean() {
    guardOpenApp();
    retireAizanoiAiSurfaces();
  }

  clean();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', clean, { once:true });
  window.addEventListener('load', clean, { once:true });
  window.addEventListener('aizanoi:distribution-ready', clean);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) retireAizanoiAiSurfaces(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });
})();

function wireChatIfNeeded() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  const log = document.getElementById('chat-log');
  if (!input || !sendBtn || !log || chatWired) return;
  chatWired = true;

  const addMessage = (role, text) => {
    const row = document.createElement('div');
    row.className = 'chat-msg ' + (role === 'user' ? 'user' : 'bot');
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = String(text || '');
    row.appendChild(bubble);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  };

  function showDisabledNotice() {
    addMessage('bot', 'This retired compatibility surface is disabled. Local files, notes and datasets stay in this browser and are not sent to external AI providers.');
  }

  function sendMessage() {
    const visibleText = input.value.trim();
    if (!visibleText) return false;
    input.value = '';
    addMessage('user', visibleText);
    showDisabledNotice();
    return false;
  }

  sendBtn.disabled = true;
  input.disabled = true;
  input.placeholder = 'Retired feature';
  const starters = document.getElementById('chat-starters');
  if (starters) starters.hidden = true;
  showDisabledNotice();

  window.__AIZANOI_CHAT__ = Object.freeze({
    clear() {
      chatHistory = [];
      log.replaceChildren();
      showDisabledNotice();
    },
    ask() {
      showDisabledNotice();
      return false;
    },
    getContextSafeHistory() {
      return [];
    }
  });

  // Compatibility only: never perform network I/O.
  window.__AIZANOI_CHAT_SEND_DISABLED__ = sendMessage;
}

function wireChatStartersIfNeeded() {
  document.body.dataset.chatStartersWired = '1';
  document.querySelectorAll('.chat-starter').forEach((button) => button.remove());
}
window.wireChatStartersIfNeeded = wireChatStartersIfNeeded;

/* Major shell bootstrap stays isolated from the legacy SPA markup. */
(function bootstrapAizanoiFieldSystem() {
  if (window.__AIZANOI_FIELD_BOOTSTRAP__) return;
  window.__AIZANOI_FIELD_BOOTSTRAP__ = true;

  function preload(href, as, priority) {
    if (document.querySelector('link[data-aizanoi-preload="' + href + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'preload';
    link.href = href;
    link.as = as;
    if (priority) link.fetchPriority = priority;
    link.dataset.aizanoiPreload = href;
    document.head.appendChild(link);
  }
  preload('/assets/wallpapers/aizanoi-synthesis.svg', 'image', 'high');
  preload('/css/os-aizanoi-next.css', 'style');
  preload('/css/os-distribution.css', 'style');
  preload('/css/os-distribution-polish.css', 'style');
  preload('/css/os-distribution-panels.css', 'style');

  function loadStyle(href) {
    if (document.querySelector('link[data-aizanoi-shell-style="' + href + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.aizanoiShellStyle = href;
    document.head.appendChild(link);
  }
  loadStyle('/css/os-aizanoi-next.css');
  loadStyle('/css/os-field-bridges.css');

  function loadScript(src) {
    return new Promise(function(resolve, reject) {
      var existing = document.querySelector('script[data-aizanoi-shell="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded === '1') resolve();
        else {
          existing.addEventListener('load', resolve, { once:true });
          existing.addEventListener('error', reject, { once:true });
        }
        return;
      }
      var script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.dataset.aizanoiShell = src;
      script.addEventListener('load', function() { script.dataset.loaded = '1'; resolve(); }, { once:true });
      script.addEventListener('error', reject, { once:true });
      document.body.appendChild(script);
    });
  }

  function start() {
    Promise.all([
      loadScript('/js/os-state.js'),
      loadScript('/js/os-legacy-sanitizer.js')
    ])
      .then(function() { retireAizanoiAiSurfaces(); return loadScript('/js/os-shell.js'); })
      .then(function() { return loadScript('/js/os-intent.js'); })
      .then(function() { retireAizanoiAiSurfaces(); })
      .catch(function(error) {
        console.error('Aizanoi Field System shell could not load; legacy shell remains available.', error);
      });
  }
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once:true });
})();