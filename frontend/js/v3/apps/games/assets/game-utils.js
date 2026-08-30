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

  function toolbar({ game, lowerBetter = false, onPause, onRestart, paused = false, formatBest } = {}) {
    const bar = document.createElement('div');
    bar.className = 'game-v2-toolbar';
    const bestValue = best(game, { lowerBetter });
    const bestText = bestValue == null ? '—' : (formatBest ? formatBest(bestValue) : String(bestValue));
    bar.innerHTML = `<span class="game-v2-best"><b>Best:</b> <span data-game-best>${bestText}</span></span>`;
    if (onPause) {
      const pause = document.createElement('button');
      pause.type = 'button';
      pause.dataset.gameAction = 'pause';
      pause.setAttribute('aria-pressed', paused ? 'true' : 'false');
      pause.textContent = paused ? 'Resume' : 'Pause';
      pause.addEventListener('click', () => onPause());
      bar.appendChild(pause);
    }
    if (onRestart) {
      const restart = document.createElement('button');
      restart.type = 'button';
      restart.dataset.gameAction = 'restart';
      restart.textContent = 'Restart';
      restart.addEventListener('click', () => onRestart());
      bar.appendChild(restart);
    }
    return bar;
  }

  function refreshToolbar(container, game, options = {}) {
    const node = container?.querySelector('[data-game-best]');
    if (!node) return;
    const value = best(game, options);
    node.textContent = value == null ? '—' : (options.formatBest ? options.formatBest(value) : String(value));
  }

  window.AizanoiGames = Object.freeze({ read, list, save, best, toolbar, refreshToolbar });
})();
