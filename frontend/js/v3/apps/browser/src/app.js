const STYLE_SELECTOR = 'link[data-az-browser-style]';
const STYLE_HREF = '/js/v3/apps/browser/assets/browser.css';
const SEARCH_HOME = 'https://www.google.com/';

function acquireStylesheet() {
  let link = document.querySelector(STYLE_SELECTOR);
  if (!link) {
    link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_HREF;
    link.dataset.azBrowserStyle = 'true';
    link.dataset.azBrowserRefs = '0';
    document.head.append(link);
  }
  link.dataset.azBrowserRefs = String((Number(link.dataset.azBrowserRefs) || 0) + 1);
  return () => {
    const remaining = Math.max(0, (Number(link.dataset.azBrowserRefs) || 1) - 1);
    link.dataset.azBrowserRefs = String(remaining);
    if (!remaining) link.remove();
  };
}

export function resolveBrowserInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      url.protocol = 'https:';
      return url.href;
    } catch {
      // Fall through to a safe search URL.
    }
  }

  const looksLikeHost = /^(?:localhost(?::\d+)?|(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?|(?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/?#].*)?$/i.test(raw);
  if (looksLikeHost) {
    try {
      return new URL(`https://${raw}`).href;
    } catch {
      // Fall through to search.
    }
  }

  return `https://www.google.com/search?igu=1&q=${encodeURIComponent(raw)}`;
}

export function mountBrowser({ container }) {
  const releaseStylesheet = acquireStylesheet();
  container.innerHTML = `
    <div class="az-app-shell az-browser-shell">
      <section class="az-browser" aria-label="Web browser">
        <div class="az-browser-toolbar">
          <div class="az-browser-nav" aria-label="Browser navigation">
            <button class="az-browser-button" type="button" data-browser-back aria-label="Back" title="Back">←</button>
            <button class="az-browser-button" type="button" data-browser-forward aria-label="Forward" title="Forward">→</button>
            <button class="az-browser-button" type="button" data-browser-reload aria-label="Reload" title="Reload">↻</button>
            <button class="az-browser-button" type="button" data-browser-home aria-label="Home" title="Home">⌂</button>
          </div>
          <form class="az-browser-address-form" data-browser-form>
            <span class="az-browser-lock" aria-hidden="true">🔒</span>
            <input class="az-browser-address" data-browser-address type="text" inputmode="url" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="Search or enter address" placeholder="Search or enter address">
            <button class="az-browser-go" type="submit">Go</button>
          </form>
          <button class="az-browser-external" type="button" data-browser-external>Open external</button>
        </div>
        <div class="az-browser-info">
          <span data-browser-status role="status" aria-live="polite">Ready</span>
          <span>Sandboxed preview · some sites block embedded viewing</span>
        </div>
        <div class="az-browser-viewport">
          <section class="az-browser-home" data-browser-home-panel>
            <div class="az-browser-home-mark" aria-hidden="true">◎</div>
            <p class="az-browser-kicker">AIZANOIOS</p>
            <h2>Browser</h2>
            <p>Search the web or enter an HTTPS address above. If a website refuses to appear here, use <strong>Open external</strong>.</p>
            <div class="az-browser-home-actions">
              <button class="az-button az-hr-primary" type="button" data-browser-search-home>Open Google</button>
              <button class="az-button" type="button" data-browser-site-home>Open Aizanoi Analytics</button>
            </div>
          </section>
          <iframe class="az-browser-frame" data-browser-frame title="Browser page" sandbox="allow-downloads allow-forms allow-modals allow-popups allow-same-origin allow-scripts" referrerpolicy="no-referrer" hidden></iframe>
        </div>
      </section>
    </div>`;

  const frame = container.querySelector('[data-browser-frame]');
  const homePanel = container.querySelector('[data-browser-home-panel]');
  const form = container.querySelector('[data-browser-form]');
  const address = container.querySelector('[data-browser-address]');
  const backButton = container.querySelector('[data-browser-back]');
  const forwardButton = container.querySelector('[data-browser-forward]');
  const reloadButton = container.querySelector('[data-browser-reload]');
  const status = container.querySelector('[data-browser-status]');

  const history = [{ kind: 'home', url: '' }];
  let cursor = 0;
  let currentUrl = '';

  function updateNavigationButtons() {
    backButton.disabled = cursor <= 0;
    forwardButton.disabled = cursor >= history.length - 1;
    reloadButton.disabled = !currentUrl;
  }

  function showHome() {
    currentUrl = '';
    address.value = '';
    frame.hidden = true;
    frame.removeAttribute('src');
    homePanel.hidden = false;
    status.textContent = 'Ready';
    updateNavigationButtons();
  }

  function showUrl(url) {
    currentUrl = url;
    address.value = url;
    homePanel.hidden = true;
    frame.hidden = false;
    status.textContent = 'Loading…';
    frame.src = url;
    updateNavigationButtons();
  }

  function applyHistoryEntry(entry) {
    if (entry.kind === 'home') showHome();
    else showUrl(entry.url);
  }

  function pushEntry(entry) {
    history.splice(cursor + 1);
    history.push(entry);
    cursor = history.length - 1;
    applyHistoryEntry(entry);
  }

  function navigate(value) {
    const url = resolveBrowserInput(value);
    if (!url) return;
    pushEntry({ kind: 'url', url });
  }

  function openExternal() {
    const url = currentUrl || resolveBrowserInput(address.value) || SEARCH_HOME;
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (opened) opened.opener = null;
  }

  function handleSubmit(event) {
    event.preventDefault();
    navigate(address.value);
  }

  function handleClick(event) {
    if (event.target.closest('[data-browser-back]')) {
      if (cursor > 0) applyHistoryEntry(history[--cursor]);
      return;
    }
    if (event.target.closest('[data-browser-forward]')) {
      if (cursor < history.length - 1) applyHistoryEntry(history[++cursor]);
      return;
    }
    if (event.target.closest('[data-browser-reload]')) {
      if (currentUrl) {
        status.textContent = 'Reloading…';
        frame.src = currentUrl;
      }
      return;
    }
    if (event.target.closest('[data-browser-home]')) {
      pushEntry({ kind: 'home', url: '' });
      return;
    }
    if (event.target.closest('[data-browser-external]')) {
      openExternal();
      return;
    }
    if (event.target.closest('[data-browser-search-home]')) {
      navigate(SEARCH_HOME);
      return;
    }
    if (event.target.closest('[data-browser-site-home]')) navigate(window.location.origin);
  }

  function handleFrameLoad() {
    status.textContent = 'Request loaded · blank page? The site may block embedded viewing.';
  }

  function handleKeydown(event) {
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === 'l') {
      event.preventDefault();
      address.focus();
      address.select();
    }
  }

  form.addEventListener('submit', handleSubmit);
  container.addEventListener('click', handleClick);
  frame.addEventListener('load', handleFrameLoad);
  container.addEventListener('keydown', handleKeydown);
  updateNavigationButtons();

  return {
    cleanup() {
      form.removeEventListener('submit', handleSubmit);
      container.removeEventListener('click', handleClick);
      frame.removeEventListener('load', handleFrameLoad);
      container.removeEventListener('keydown', handleKeydown);
      frame.removeAttribute('src');
      releaseStylesheet();
    }
  };
}
