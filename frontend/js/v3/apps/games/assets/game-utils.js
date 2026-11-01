(() => {
  'use strict';
  const KEY = 'aizanoi-games';

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
    catch (_) { return {}; }
  }

  function list(game) {
    const scores = read();
    return Array.isArray(scores[game]) ? scores[game] : [];
  }

  function save(game, score) {
    try {
      const scores = read();
      if (!Array.isArray(scores[game])) scores[game] = [];
      scores[game].push({ score, at: new Date().toISOString() });
      scores[game] = scores[game].slice(-20);
      localStorage.setItem(KEY, JSON.stringify(scores));
    } catch (_) {}
  }

  function best(game, { lowerBetter = false } = {}) {
    const values = list(game).map((entry) => Number(entry?.score)).filter(Number.isFinite);
    if (!values.length) return null;
    return lowerBetter ? Math.min(...values) : Math.max(...values);
  }

  /** Controls row shared by every cabinet: personal best plus Pause / New game. */
  function toolbar({ game, lowerBetter = false, onPause, onRestart, paused = false, formatBest } = {}) {
    const bar = document.createElement('div');
    bar.className = 'ag-toolbar';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Game controls');
    const bestValue = best(game, { lowerBetter });
    const bestText = bestValue == null ? '—' : (formatBest ? formatBest(bestValue) : String(bestValue));
    bar.innerHTML = `<span class="ag-best"><b>Best</b> <span data-game-best>${bestText}</span></span><span class="ag-spacer"></span>`;
    const add = (action, label, handler, pressed) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ag-btn';
      button.dataset.gameAction = action;
      if (pressed != null) button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      button.textContent = label;
      button.addEventListener('click', () => handler());
      bar.appendChild(button);
    };
    if (onPause) add('pause', paused ? 'Resume' : 'Pause', onPause, paused);
    if (onRestart) add('restart', 'New game', onRestart);
    return bar;
  }

  function refreshToolbar(container, game, options = {}) {
    const node = container?.querySelector('[data-game-best]');
    if (!node) return;
    const value = best(game, options);
    node.textContent = value == null ? '—' : (options.formatBest ? options.formatBest(value) : String(value));
  }

  function setPauseButton(container, paused) {
    const button = container?.querySelector('[data-game-action="pause"]');
    if (!button) return;
    button.textContent = paused ? 'Resume' : 'Pause';
    button.setAttribute('aria-pressed', paused ? 'true' : 'false');
  }

  /** Write text only when it changed, so per-frame HUD updates never re-announce or re-layout. */
  function setText(node, text) {
    const value = String(text);
    if (node && node.textContent !== value) node.textContent = value;
  }

  function isEditable(target) {
    return target instanceof HTMLElement && (target.matches('input,textarea,select,[contenteditable=""],[contenteditable="true"]') || target.isContentEditable);
  }

  /**
   * True only when a key event may drive this game: the game is on screen, its window is the active
   * one, nothing editable has focus and no modifier is held. Space/Enter are left to focused buttons/links.
   */
  function acceptsKey(container, event, own) {
    if (!container?.isConnected || container.offsetParent === null) return false;
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return false;
    const target = event.target;
    if (isEditable(target)) return false;
    const gameWindow = container.closest('.az-window');
    if (gameWindow && !gameWindow.classList.contains('is-active')) return false;
    if (target instanceof Element && target !== own && !container.contains(target) && target !== document.body && target !== document.documentElement) {
      // Focus sits in another part of the page; ignore so other controls keep their keys.
      return false;
    }
    if ((event.key === ' ' || event.key === 'Enter') && target instanceof Element && target !== own && target.closest('button,a[href],[role="button"],summary')) return false;
    return true;
  }

  /** Visually hidden polite live region for concise milestones (paused, game over, cleared). */
  function liveRegion(container) {
    const node = document.createElement('p');
    node.className = 'ag-live';
    node.setAttribute('role', 'status');
    container.appendChild(node);
    let timer = 0;
    const say = (text) => {
      clearTimeout(timer);
      node.textContent = '';
      timer = setTimeout(() => { node.textContent = text; }, 40);
    };
    say.dispose = () => clearTimeout(timer);
    return say;
  }

  window.AizanoiGames = Object.freeze({ read, list, save, best, toolbar, refreshToolbar, setPauseButton, setText, isEditable, acceptsKey, liveRegion });
})();
