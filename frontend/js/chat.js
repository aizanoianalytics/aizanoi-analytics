/* === CHAT: SECURITY BUILD === */
let chatHistory = [];
let chatWired = false;
let chatRequestController = null;
let lastFailedMessage = null;

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
    addMessage('bot', 'Aizanoi AI is disabled in the security build. Local files, notes and datasets stay in this browser and are not sent to external AI providers.');
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
  input.placeholder = 'Aizanoi AI is disabled for security';
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

  // Keep the function present for compatibility, but never perform network I/O.
  window.__AIZANOI_CHAT_SEND_DISABLED__ = sendMessage;
}

function wireChatStartersIfNeeded() {
  document.body.dataset.chatStartersWired = '1';
  document.querySelectorAll('.chat-starter').forEach((button) => {
    button.hidden = true;
    button.disabled = true;
  });
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
      .then(function() { return loadScript('/js/os-shell.js'); })
      .then(function() { return loadScript('/js/os-intent.js'); })
      .catch(function(error) {
        console.error('Aizanoi Field System shell could not load; legacy shell remains available.', error);
      });
  }
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once:true });
})();