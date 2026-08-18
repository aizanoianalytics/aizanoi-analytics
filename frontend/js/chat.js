/* === CHAT === */
const CHAT_API_URL = '/api/chat';
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
  function addMessage(role, text) {
    const row = document.createElement('div');
    row.className = 'chat-msg ' + (role === 'user' ? 'user' : 'bot');
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    if (role === 'user') {
      bubble.textContent = text;
    } else {
      bubble.innerHTML = renderMarkdownSafe(text);
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'chat-copy';
      copy.textContent = 'Copy';
      copy.setAttribute('aria-label', 'Copy assistant answer');
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(text);
          copy.textContent = 'Copied'; copy.classList.add('copied');
          setTimeout(() => { copy.textContent = 'Copy'; copy.classList.remove('copied'); }, 1300);
        } catch (_) { copy.textContent = 'Unavailable'; }
      });
      bubble.appendChild(copy);
    }
    row.appendChild(bubble); log.appendChild(row); log.scrollTop = log.scrollHeight;
  }
  function resizeComposer() {
    input.style.height = 'auto';
    input.style.height = Math.min(120, Math.max(32, input.scrollHeight)) + 'px';
  }
  function rollbackUnansweredUser(payloadText) {
    const last = chatHistory[chatHistory.length - 1];
    if (last?.role === 'user' && last.content === payloadText) chatHistory.pop();
  }
  function addRetry(request, reason) {
    const row = document.createElement('div');
    row.className = 'chat-msg bot chat-error';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    const message = document.createElement('span');
    message.textContent = reason || 'Aizanoi AI could not reply.';
    const retry = document.createElement('button');
    retry.type = 'button'; retry.className = 'chat-retry'; retry.textContent = 'Retry';
    retry.addEventListener('click', () => {
      row.remove();
      sendMessage(request);
    });
    bubble.append(message, retry); row.appendChild(bubble); log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }
  async function sendMessage(request = null) {
    const isProgrammatic = request && typeof request === 'object';
    const visibleText = (isProgrammatic ? request.text : input.value).trim();
    if (!visibleText || input.disabled) return false;
    const context = isProgrammatic ? String(request.context || '').trim() : '';
    const payloadText = context ? `${context}\n\nUser request: ${visibleText}` : visibleText;
    const retryRequest = { text:visibleText, context };
    const starters = document.getElementById('chat-starters');
    if (starters) starters.style.display = 'none';
    input.value = ''; resizeComposer(); input.disabled = true; sendBtn.disabled = true; log.setAttribute('aria-busy','true');
    addMessage('user', visibleText); chatHistory.push({ role:'user', content:payloadText });
    const typing = document.createElement('div');
    typing.className = 'chat-msg bot typing';
    typing.innerHTML = '<div class="bubble"><span class="typing-dots" aria-label="Aizanoi AI is thinking"><i></i><i></i><i></i></span></div>';
    log.appendChild(typing); log.scrollTop = log.scrollHeight;
    chatRequestController?.abort();
    const controller = new AbortController();
    chatRequestController = controller;
    const timeout = setTimeout(() => controller.abort('timeout'), 80000);
    try {
      const res = await fetch(CHAT_API_URL, { method:'POST', headers:{'Content-Type':'application/json'}, signal:controller.signal, body: JSON.stringify({ history: chatHistory }) });
      const data = await res.json(); typing.remove();
      if (!res.ok || !data.reply) {
        rollbackUnansweredUser(payloadText); lastFailedMessage = retryRequest;
        addRetry(retryRequest, data.error || 'Unable to reply right now.'); flashTaskItem('chatbot');
      } else {
        addMessage('bot', data.reply); chatHistory.push({ role:'assistant', content:data.reply }); lastFailedMessage = null;
      }
    } catch (err) {
      typing.remove(); rollbackUnansweredUser(payloadText); lastFailedMessage = retryRequest;
      const reason = err?.name === 'AbortError' || controller.signal.aborted ? 'The request took too long. You can retry.' : 'Connection error. You can retry.';
      addRetry(retryRequest, reason); flashTaskItem('chatbot');
    } finally {
      clearTimeout(timeout);
      if (chatRequestController === controller) chatRequestController = null;
      log.setAttribute('aria-busy','false');
      if (document.getElementById('chat-input') === input) { input.disabled = false; sendBtn.disabled = false; input.focus(); }
    }
    return true;
  }
  sendBtn.addEventListener('click', () => sendMessage());
  input.addEventListener('input', resizeComposer);
  input.addEventListener('keydown', (e) => {
    if (!e.isComposing && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  window.__AIZANOI_CHAT__ = {
    clear() {
      chatRequestController?.abort(); chatRequestController = null; lastFailedMessage = null;
      chatHistory = [];
      log.replaceChildren();
      const starters = document.getElementById('chat-starters');
      if (starters) starters.style.display = 'grid';
      input.value = ''; input.disabled = false; sendBtn.disabled = false; input.focus();
    },
    ask(text, context = '') {
      return sendMessage({ text:String(text || ''), context:String(context || '') });
    },
    getContextSafeHistory() {
      return chatHistory.map((item) => ({ ...item }));
    }
  };
  input.focus();
}


function wireChatStartersIfNeeded() {
  if (document.body.dataset.chatStartersWired) return;
  document.body.dataset.chatStartersWired = '1';
  setTimeout(function() {
    document.querySelectorAll('.chat-starter').forEach(function(b) {
      if (b._wired) return;
      b._wired = true;
      b.addEventListener('click', function() {
        var q = b.dataset.q;
        var inp = document.getElementById('chat-input');
        var send = document.getElementById('chat-send');
        if (inp && send) {
          inp.value = q;
          var starters = document.getElementById('chat-starters');
          if (starters) starters.style.display = 'none';
          send.click();
        }
      });
    });
  }, 80);
}
window.wireChatStartersIfNeeded = wireChatStartersIfNeeded;

/* Major shell bootstrap stays isolated from the legacy SPA markup. */
(function bootstrapAizanoiFieldSystem() {
  if (window.__AIZANOI_FIELD_BOOTSTRAP__) return;
  window.__AIZANOI_FIELD_BOOTSTRAP__ = true;

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
