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
  function rollbackUnansweredUser(text) {
    const last = chatHistory[chatHistory.length - 1];
    if (last?.role === 'user' && last.content === text) chatHistory.pop();
  }
  function addRetry(text, reason) {
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
      input.value = text; resizeComposer();
      sendMessage();
    });
    bubble.append(message, retry); row.appendChild(bubble); log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }
  async function sendMessage() {
    const text = input.value.trim(); if (!text || input.disabled) return;
    const starters = document.getElementById('chat-starters');
    if (starters) starters.style.display = 'none';
    input.value = ''; resizeComposer(); input.disabled = true; sendBtn.disabled = true; log.setAttribute('aria-busy','true');
    addMessage('user', text); chatHistory.push({ role:'user', content:text });
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
        rollbackUnansweredUser(text); lastFailedMessage = text;
        addRetry(text, data.error || 'Unable to reply right now.'); flashTaskItem('chatbot');
      } else {
        addMessage('bot', data.reply); chatHistory.push({ role:'assistant', content:data.reply }); lastFailedMessage = null;
      }
    } catch (err) {
      typing.remove(); rollbackUnansweredUser(text); lastFailedMessage = text;
      const reason = err?.name === 'AbortError' || controller.signal.aborted ? 'The request took too long. You can retry.' : 'Connection error. You can retry.';
      addRetry(text, reason); flashTaskItem('chatbot');
    } finally {
      clearTimeout(timeout);
      if (chatRequestController === controller) chatRequestController = null;
      log.setAttribute('aria-busy','false');
      if (document.getElementById('chat-input') === input) { input.disabled = false; sendBtn.disabled = false; input.focus(); }
    }
  }
  sendBtn.addEventListener('click', sendMessage);
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
