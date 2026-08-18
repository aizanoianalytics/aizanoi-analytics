(() => {
  'use strict';

  const PRIMARY_APPS = ['Aizanoi AI','Ancient World','Games','Projects','Aizanoi TV'];
  const SECONDARY_HINTS = ['Control Panel','Run','Search','Recycle Bin','Log Off','Shut Down','Lock'];
  const CHAT_TIMEOUT_MS = 45000;
  let desktopSnapshot = [];
  let desktopShown = false;
  let mutationFrame = 0;
  let chatController = null;
  let lastChatPrompt = '';

  function announce(text) {
    let live = document.getElementById('os-v2-live');
    if (!live) {
      live = document.createElement('div');
      live.id = 'os-v2-live';
      live.className = 'os-v2-sr-only';
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('aria-atomic', 'true');
      document.body.appendChild(live);
    }
    live.textContent = '';
    requestAnimationFrame(() => { live.textContent = text; });
  }

  function decorateWindow(win) {
    if (!win || win.dataset.osV2Decorated) return;
    win.dataset.osV2Decorated = '1';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-modal', 'false');
    win.tabIndex = -1;
    const title = win.querySelector('.win-title');
    if (title) {
      if (!title.id) title.id = `os-v2-title-${Math.random().toString(36).slice(2,9)}`;
      win.setAttribute('aria-labelledby', title.id);
    }
    win.querySelectorAll('.win-btn').forEach((button) => {
      if (!button.hasAttribute('type')) button.setAttribute('type', 'button');
      const act = button.dataset.act;
      if (act === 'min') button.setAttribute('aria-label','Minimize window');
      if (act === 'max') button.setAttribute('aria-label','Maximize or restore window');
      if (act === 'close') button.setAttribute('aria-label','Close window');
    });
    // Maximize-on-double-click is owned by the core window manager.
    // Do not bind a second handler here: two toggles cancel one another.
  }

  function viewportMetrics() {
    const viewportWidth = document.documentElement.clientWidth || innerWidth;
    const viewportHeight = document.documentElement.clientHeight || innerHeight;
    const taskbar = document.getElementById('taskbar');
    const taskbarTop = taskbar?.getBoundingClientRect().top || viewportHeight;
    return { viewportWidth, viewportHeight, taskbarTop };
  }

  function clampWindow(win) {
    if (!win || win.classList.contains('maximized') || matchMedia('(max-width:700px)').matches) return;
    const { viewportWidth, taskbarTop } = viewportMetrics();
    let rect = win.getBoundingClientRect();

    const maxWidth = Math.max(280, viewportWidth - 12);
    const maxHeight = Math.max(160, taskbarTop - 8);
    if (rect.width > maxWidth) win.style.width = `${maxWidth}px`;
    if (rect.height > maxHeight) win.style.height = `${maxHeight}px`;
    if (rect.width > maxWidth || rect.height > maxHeight) rect = win.getBoundingClientRect();

    // Keep enough titlebar visible to recover the window without requiring resize.
    const minVisibleX = Math.min(96, rect.width);
    const minLeft = Math.min(0, minVisibleX - rect.width);
    const maxLeft = Math.max(minLeft, viewportWidth - minVisibleX);
    const maxTop = Math.max(0, taskbarTop - Math.min(30, rect.height));
    const left = Math.min(maxLeft, Math.max(minLeft, rect.left));
    const top = Math.min(maxTop, Math.max(0, rect.top));

    if (Math.abs(left - rect.left) > .5) win.style.left = `${left}px`;
    if (Math.abs(top - rect.top) > .5) win.style.top = `${top}px`;
  }

  function clampWindows() {
    document.querySelectorAll('.win:not(.maximized)').forEach(clampWindow);
  }

  function installWindowLifecycleBridge() {
    const coreWireWindow = window.wireWindow;
    if (typeof coreWireWindow === 'function' && !coreWireWindow.__osV2Hardened) {
      const persistentTypes = new Set(['mousemove','touchmove','mouseup','touchend']);
      const hardenedWireWindow = function(appId, winEl) {
        const tracked = [];
        const nativeAdd = document.addEventListener;
        const hadOwnAdd = Object.prototype.hasOwnProperty.call(document, 'addEventListener');

        // The legacy core registers four document-level drag listeners per window.
        // Capture only those registrations while wireWindow executes so they can be
        // released when that window closes.
        document.addEventListener = function(type, listener, options) {
          nativeAdd.call(document, type, listener, options);
          if (persistentTypes.has(type)) tracked.push({ type, listener, options });
        };
        try {
          return coreWireWindow(appId, winEl);
        } finally {
          if (hadOwnAdd) document.addEventListener = nativeAdd;
          else delete document.addEventListener;

          const state = typeof openWindows !== 'undefined' ? openWindows.get(appId) : null;
          if (state) {
            const previousDetach = state.detachDrag;
            state.detachDrag = () => {
              if (typeof previousDetach === 'function') previousDetach();
              tracked.splice(0).forEach(({ type, listener, options }) => {
                document.removeEventListener(type, listener, options);
              });
            };
          }
        }
      };
      hardenedWireWindow.__osV2Hardened = true;
      window.wireWindow = hardenedWireWindow;
    }

    const coreCloseApp = window.closeApp;
    if (typeof coreCloseApp === 'function' && !coreCloseApp.__osV2Hardened) {
      const hardenedCloseApp = function(appId) {
        const state = typeof openWindows !== 'undefined' ? openWindows.get(appId) : null;
        state?.detachDrag?.();
        if (appId === 'chatbot') abortChatRequest();
        const result = coreCloseApp(appId);
        requestAnimationFrame(clampWindows);
        return result;
      };
      hardenedCloseApp.__osV2Hardened = true;
      window.closeApp = hardenedCloseApp;
    }
  }

  function abortChatRequest() {
    if (!chatController) return;
    try { chatController.abort(); } catch (_) {}
    chatController = null;
  }

  function installChatFetchGuard() {
    if (window.fetch?.__osV2ChatGuard) return;
    const nativeFetch = window.fetch.bind(window);

    const guardedFetch = function(resource, options = {}) {
      const url = typeof resource === 'string' ? resource : resource?.url;
      if (!url || !String(url).includes('/api/chat')) return nativeFetch(resource, options);

      abortChatRequest();
      const controller = new AbortController();
      chatController = controller;
      const upstream = options.signal;
      let detachUpstream = null;

      if (upstream) {
        if (upstream.aborted) controller.abort(upstream.reason);
        else {
          const relayAbort = () => controller.abort(upstream.reason);
          upstream.addEventListener('abort', relayAbort, { once: true });
          detachUpstream = () => upstream.removeEventListener('abort', relayAbort);
        }
      }

      const timer = setTimeout(() => {
        try { controller.abort(new DOMException('Chat request timed out', 'TimeoutError')); }
        catch (_) { controller.abort(); }
      }, CHAT_TIMEOUT_MS);

      return nativeFetch(resource, { ...options, signal: controller.signal }).finally(() => {
        clearTimeout(timer);
        detachUpstream?.();
        if (chatController === controller) chatController = null;
      });
    };
    guardedFetch.__osV2ChatGuard = true;
    window.fetch = guardedFetch;
  }

  function ensureChatTextarea() {
    let input = document.getElementById('chat-input');
    if (!input) return null;

    if (input.tagName !== 'TEXTAREA') {
      const textarea = document.createElement('textarea');
      [...input.attributes].forEach((attr) => {
        if (attr.name !== 'type') textarea.setAttribute(attr.name, attr.value);
      });
      textarea.value = input.value;
      textarea.rows = 1;
      textarea.maxLength = 4000;
      input.replaceWith(textarea);
      input = textarea;
    }

    if (input.dataset.osV2Textarea) return input;
    input.dataset.osV2Textarea = '1';
    input.setAttribute('aria-label', 'Message Aizanoi AI');
    input.setAttribute('placeholder', 'Type a message…  Shift+Enter for a new line');
    input.style.resize = 'none';
    input.style.overflowY = 'auto';
    input.style.maxHeight = '120px';
    input.style.lineHeight = '1.35';

    const grow = () => {
      input.style.height = 'auto';
      input.style.height = `${Math.min(120, Math.max(34, input.scrollHeight))}px`;
    };
    input.addEventListener('input', grow);

    // The core chat handler sends on any Enter. Capture Shift+Enter before it
    // reaches the core listener, while preventing a bare Enter from inserting
    // a newline after the send.
    input.addEventListener('keydown', (event) => {
      if (event.isComposing || event.key !== 'Enter') return;
      if (event.shiftKey) {
        event.stopImmediatePropagation();
        return;
      }
      lastChatPrompt = input.value.trim() || lastChatPrompt;
      event.preventDefault();
    }, true);
    grow();
    return input;
  }

  function installChatToolbar() {
    const log = document.getElementById('chat-log');
    const input = ensureChatTextarea();
    const send = document.getElementById('chat-send');
    if (!log || !input || !send) return;

    log.setAttribute('role','log');
    log.setAttribute('aria-live','polite');
    log.setAttribute('aria-relevant','additions text');

    if (!send.dataset.osV2PromptCapture) {
      send.dataset.osV2PromptCapture = '1';
      send.addEventListener('click', () => {
        const text = input.value.trim();
        if (text) lastChatPrompt = text;
      }, true);
    }

    let bar = document.querySelector('.os-v2-chat-toolbar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'os-v2-chat-toolbar';
      bar.innerHTML = '<strong>Aizanoi AI</strong><span class="spacer"></span><button type="button" data-chat-action="retry">Retry last</button><button type="button" data-chat-action="copy">Copy last answer</button><button type="button" data-chat-action="clear">Clear</button>';
      log.parentNode.insertBefore(bar, log);
    }
    if (bar.dataset.osV2Wired) return;
    bar.dataset.osV2Wired = '1';

    bar.addEventListener('click', async (event) => {
      const button = event.target.closest('button');
      const action = button?.dataset.chatAction;
      if (!action) return;

      if (action === 'clear') {
        abortChatRequest();
        lastChatPrompt = '';
        if (window.__AIZANOI_CHAT__?.clear) window.__AIZANOI_CHAT__.clear();
        else log.replaceChildren();
        announce('Chat cleared');
      }

      if (action === 'retry') {
        if (!lastChatPrompt) return announce('No message to retry');
        if (send.disabled) return announce('Aizanoi AI is still replying');
        input.value = lastChatPrompt;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        send.click();
      }

      if (action === 'copy') {
        const answer = [...log.querySelectorAll('.chat-msg.bot:not(.typing) .bubble')].pop();
        if (!answer) return announce('No assistant answer to copy');
        const clone = answer.cloneNode(true);
        clone.querySelectorAll('.chat-copy').forEach((node) => node.remove());
        try {
          await navigator.clipboard.writeText(clone.innerText.trim());
          announce('Last answer copied');
        } catch (_) {
          announce('Clipboard unavailable');
        }
      }
    });
  }

  function installShowDesktop() {
    const taskbar = document.getElementById('taskbar');
    if (!taskbar || taskbar.querySelector('.os-v2-show-desktop')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'os-v2-show-desktop';
    button.title = 'Show desktop';
    button.setAttribute('aria-label','Show desktop');
    button.setAttribute('aria-pressed','false');
    button.addEventListener('click', () => {
      const windows = [...document.querySelectorAll('.win')];
      if (!desktopShown) {
        desktopSnapshot = windows.filter((win) => getComputedStyle(win).display !== 'none');
        desktopSnapshot.forEach((win) => {
          win.dataset.osV2BeforeDesktop = win.style.display || '';
          win.style.display = 'none';
        });
        desktopShown = true;
        button.setAttribute('aria-pressed','true');
        announce('Desktop shown');
      } else {
        desktopSnapshot.forEach((win) => {
          if (win.isConnected) win.style.display = win.dataset.osV2BeforeDesktop || 'flex';
        });
        desktopSnapshot = [];
        desktopShown = false;
        button.setAttribute('aria-pressed','false');
        announce('Windows restored');
      }
    });
    taskbar.appendChild(button);
  }

  function decorateTaskbar(root = document) {
    const taskbar = document.getElementById('taskbar');
    if (taskbar) taskbar.setAttribute('role','toolbar');
    root.querySelectorAll?.('.task-item').forEach((item) => {
      item.setAttribute('role','button');
      item.tabIndex = item.tabIndex >= 0 ? item.tabIndex : 0;
      item.setAttribute('aria-pressed', item.classList.contains('active') ? 'true' : 'false');
    });
  }

  function decorateStartMenu() {
    const start = document.getElementById('start-menu');
    if (!start) return;
    start.setAttribute('role','menu');
    start.querySelectorAll('.sm-item').forEach((item) => {
      const text = item.textContent.replace(/\s+/g,' ').trim();
      item.classList.toggle('os-v2-featured', PRIMARY_APPS.some((label) => text.includes(label)));
      item.classList.toggle('os-v2-secondary', SECONDARY_HINTS.some((label) => text.includes(label)));
      item.setAttribute('role','menuitem');
    });

    if (start.dataset.osV2Keyboard) return;
    start.dataset.osV2Keyboard = '1';
    start.addEventListener('keydown', (event) => {
      const items = [...start.querySelectorAll('.sm-item:not(.disabled), .sm-foot-btn')];
      const current = event.target.closest('.sm-item, .sm-foot-btn');
      const index = Math.max(0, items.indexOf(current));
      let next = null;
      if (event.key === 'ArrowDown') next = items[(index + 1) % items.length];
      if (event.key === 'ArrowUp') next = items[(index - 1 + items.length) % items.length];
      if (event.key === 'Home') next = items[0];
      if (event.key === 'End') next = items[items.length - 1];
      if (next) {
        event.preventDefault();
        next.focus();
      }
    });
  }

  function decorateContextMenus(root = document) {
    root.querySelectorAll?.('.ctx-menu').forEach((menu) => {
      menu.setAttribute('role','menu');
      menu.querySelectorAll('.ctx-item:not(.disabled)').forEach((item) => {
        item.setAttribute('role','menuitem');
        if (!item.hasAttribute('tabindex')) item.tabIndex = -1;
      });
    });
  }

  function decorateBalloons(root = document) {
    root.querySelectorAll?.('.balloon').forEach((balloon) => {
      balloon.setAttribute('role','status');
      balloon.setAttribute('aria-live','polite');
      const close = balloon.querySelector('.b-close');
      if (close) {
        close.setAttribute('role','button');
        close.tabIndex = 0;
        close.setAttribute('aria-label','Close notification');
      }
    });
  }

  function markInteractive(root = document) {
    const scope = root.nodeType === Node.ELEMENT_NODE ? root : document;
    if (scope.matches?.('.desktop-icon')) {
      scope.setAttribute('role','button');
      if (!scope.hasAttribute('tabindex')) scope.tabIndex = 0;
    }
    scope.querySelectorAll?.('.desktop-icon').forEach((icon) => {
      icon.setAttribute('role','button');
      if (!icon.hasAttribute('tabindex')) icon.tabIndex = 0;
      if (!icon.hasAttribute('aria-label')) {
        const label = icon.textContent.replace(/\s+/g,' ').trim();
        if (label) icon.setAttribute('aria-label', `Open ${label}`);
      }
    });

    if (scope.matches?.('.win')) decorateWindow(scope);
    scope.querySelectorAll?.('.win').forEach(decorateWindow);
    decorateTaskbar(scope);
    decorateStartMenu();
    decorateContextMenus(scope);
    decorateBalloons(scope);
    if (scope.matches?.('#chat-log, #chat-input, #chat-send') || scope.querySelector?.('#chat-log, #chat-input, #chat-send')) {
      installChatToolbar();
    }
  }

  function scheduleInteractive(nodes) {
    if (mutationFrame) return;
    mutationFrame = requestAnimationFrame(() => {
      mutationFrame = 0;
      nodes.filter((node) => node?.nodeType === Node.ELEMENT_NODE).forEach(markInteractive);
    });
  }

  const observer = new MutationObserver((mutations) => {
    const added = [];
    let chatRemoved = false;
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => added.push(node));
      mutation.removedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE &&
            (node.id === 'chat-log' || node.querySelector?.('#chat-log'))) chatRemoved = true;
      });
    }
    if (chatRemoved) abortChatRequest();
    if (added.length) scheduleInteractive(added);
  });

  function boot() {
    installWindowLifecycleBridge();
    installChatFetchGuard();
    markInteractive();
    installShowDesktop();
    observer.observe(document.body, { childList: true, subtree: true });

    addEventListener('resize', () => requestAnimationFrame(clampWindows), { passive: true });
    document.addEventListener('mouseup', () => requestAnimationFrame(clampWindows), { passive: true });
    document.addEventListener('touchend', () => requestAnimationFrame(clampWindows), { passive: true });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') document.querySelectorAll('.ctx-menu').forEach((menu) => menu.remove());
      if (event.altKey && event.key === 'Home') {
        event.preventDefault();
        document.querySelector('.os-v2-show-desktop')?.click();
      }
    });
    setTimeout(clampWindows, 350);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
