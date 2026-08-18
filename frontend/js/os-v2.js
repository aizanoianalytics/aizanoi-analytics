(() => {
  'use strict';

  const PRIMARY_APPS = ['Aizanoi AI','Ancient World','Games','Projects','Aizanoi TV'];
  const SECONDARY_HINTS = ['Control Panel','Run','Search','Recycle Bin','Log Off','Shut Down','Lock'];
  let desktopSnapshot = [];
  let desktopShown = false;

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
    const titlebar = win.querySelector('.win-titlebar');
    if (titlebar && !titlebar.dataset.osV2Dbl) {
      titlebar.dataset.osV2Dbl = '1';
      titlebar.addEventListener('dblclick', (event) => {
        if (event.target.closest('.win-controls')) return;
        win.querySelector('[data-act="max"]')?.click();
      });
    }
  }

  function clampWindows() {
    if (matchMedia('(max-width:700px)').matches) return;
    const taskbar = document.getElementById('taskbar');
    const taskbarHeight = taskbar?.getBoundingClientRect().height || 38;
    const rootStyle = getComputedStyle(document.documentElement);
    const safeTop = parseFloat(rootStyle.getPropertyValue('--os-safe-top')) || 0;
    const safeBottom = parseFloat(rootStyle.getPropertyValue('--os-safe-bottom')) || 0;
    const minVisibleX = 96;
    const maxY = Math.max(safeTop, innerHeight - taskbarHeight - safeBottom - 32);
    document.querySelectorAll('.win:not(.maximized)').forEach((win) => {
      const rect = win.getBoundingClientRect();
      const minX = -rect.width + minVisibleX;
      const maxX = innerWidth - minVisibleX;
      let left = Math.min(maxX, Math.max(minX, rect.left));
      let top = Math.min(maxY, Math.max(safeTop, rect.top));
      if (Math.abs(left - rect.left) > .5) win.style.left = `${left}px`;
      if (Math.abs(top - rect.top) > .5) win.style.top = `${top}px`;
      const width = Math.min(rect.width, innerWidth - 12);
      const height = Math.min(rect.height, Math.max(160, innerHeight - taskbarHeight - safeTop - safeBottom - 8));
      if (width < rect.width - .5) win.style.width = `${Math.max(280,width)}px`;
      if (height < rect.height - .5) win.style.height = `${height}px`;
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
    button.addEventListener('click', () => {
      const windows = [...document.querySelectorAll('.win')];
      if (!desktopShown) {
        desktopSnapshot = windows.filter((win) => getComputedStyle(win).display !== 'none');
        desktopSnapshot.forEach((win) => { win.dataset.osV2BeforeDesktop = win.style.display || ''; win.style.display = 'none'; });
        desktopShown = true;
        button.setAttribute('aria-pressed','true');
        announce('Desktop shown');
      } else {
        desktopSnapshot.forEach((win) => { if (win.isConnected) win.style.display = win.dataset.osV2BeforeDesktop || 'flex'; });
        desktopSnapshot = [];
        desktopShown = false;
        button.setAttribute('aria-pressed','false');
        announce('Windows restored');
      }
    });
    taskbar.appendChild(button);
  }

  function decorateTaskbar() {
    const taskbar = document.getElementById('taskbar');
    if (taskbar) taskbar.setAttribute('role','toolbar');
    document.querySelectorAll('.task-item').forEach((item) => {
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
      if (!item.hasAttribute('tabindex')) item.tabIndex = -1;
    });
  }

  function installChatToolbar() {
    const log = document.getElementById('chat-log');
    if (!log || document.querySelector('.os-v2-chat-toolbar')) return;
    log.setAttribute('role','log');
    log.setAttribute('aria-live','polite');
    log.setAttribute('aria-relevant','additions text');
    const bar = document.createElement('div');
    bar.className = 'os-v2-chat-toolbar';
    bar.innerHTML = '<strong>Aizanoi AI</strong><span class="spacer"></span><button type="button" data-chat-action="copy">Copy last answer</button><button type="button" data-chat-action="clear">Clear</button>';
    log.parentNode.insertBefore(bar, log);
    bar.addEventListener('click', async (event) => {
      const action = event.target.closest('button')?.dataset.chatAction;
      if (action === 'clear') {
        if (window.__AIZANOI_CHAT__?.clear) window.__AIZANOI_CHAT__.clear();
        else log.replaceChildren();
        announce('Chat cleared');
      }
      if (action === 'copy') {
        const answer = [...log.querySelectorAll('.chat-msg.bot .bubble')].pop();
        if (!answer) return announce('No assistant answer to copy');
        const clone = answer.cloneNode(true);
        clone.querySelectorAll('.chat-copy').forEach((node) => node.remove());
        try { await navigator.clipboard.writeText(clone.innerText.trim()); announce('Last answer copied'); }
        catch (_) { announce('Clipboard unavailable'); }
      }
    });
  }

  function decorateContextMenus() {
    document.querySelectorAll('.ctx-menu').forEach((menu) => {
      menu.setAttribute('role','menu');
      menu.querySelectorAll('.ctx-item:not(.disabled)').forEach((item) => { item.setAttribute('role','menuitem'); item.tabIndex = -1; });
    });
  }

  function markInteractive() {
    document.querySelectorAll('.desktop-icon').forEach((icon) => {
      icon.setAttribute('role','button');
      if (!icon.hasAttribute('tabindex')) icon.tabIndex = 0;
    });
    decorateTaskbar();
    decorateStartMenu();
    decorateContextMenus();
    installChatToolbar();
    document.querySelectorAll('.win').forEach(decorateWindow);
  }

  let observerFrame = 0;
  let observedMutations = 0;
  const observer = new MutationObserver((mutations) => {
    observedMutations += mutations.length;
    const relevant = mutations.some((mutation) => [...mutation.addedNodes].some((node) =>
      node?.nodeType === 1 && (node.matches?.('.win,.task-item,.ctx-menu,#chat-log') || node.querySelector?.('.win,.task-item,.ctx-menu,#chat-log'))
    ));
    if (!relevant || observerFrame) return;
    observerFrame = requestAnimationFrame(() => { observerFrame = 0; markInteractive(); });
  });

  function boot() {
    markInteractive();
    installShowDesktop();
    observer.observe(document.body, { childList: true, subtree: true });
    addEventListener('resize', () => requestAnimationFrame(clampWindows), { passive: true });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') document.querySelectorAll('.ctx-menu').forEach((menu) => menu.remove());
      if (event.altKey && event.key === 'Home') {
        event.preventDefault();
        document.querySelector('.os-v2-show-desktop')?.click();
      }
    });
    setTimeout(clampWindows, 350);
  }

  window.__AIZANOI_OS_V2__ = Object.freeze({
    clampWindows,
    announce,
    debug: () => ({ observedMutations, decoratedWindows: document.querySelectorAll('.win[data-os-v2-decorated]').length }),
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
