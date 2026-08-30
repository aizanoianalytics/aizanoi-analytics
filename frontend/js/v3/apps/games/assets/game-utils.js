(() => {
  'use strict';
  const KEY = 'aizanoi-games';
  const read = () => {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
    catch (_) { return {}; }
  };
  const list = (game) => {
    const scores = read();
    return Array.isArray(scores[game]) ? scores[game] : [];
  };
  const save = (game, score) => {
    try {
      const scores = read();
      if (!Array.isArray(scores[game])) scores[game] = [];
      scores[game].push({ score, at: new Date().toISOString() });
      scores[game] = scores[game].slice(-20);
      localStorage.setItem(KEY, JSON.stringify(scores));
    } catch (_) {}
  };
  const best = (game, { lowerBetter = false } = {}) => {
    const values = list(game).map((entry) => Number(entry?.score)).filter(Number.isFinite);
    if (!values.length) return null;
    return lowerBetter ? Math.min(...values) : Math.max(...values);
  };
  const toolbar = ({ game, lowerBetter = false, onPause, onRestart, paused = false, formatBest } = {}) => {
    const bar = document.createElement('div');
    bar.className = 'game-v2-toolbar';
    const value = best(game, { lowerBetter });
    bar.innerHTML = `<span class="game-v2-best"><b>Best:</b> <span data-game-best>${value == null ? '—' : (formatBest ? formatBest(value) : String(value))}</span></span>`;
    if (onPause) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.gameAction = 'pause';
      button.setAttribute('aria-pressed', paused ? 'true' : 'false');
      button.textContent = paused ? 'Resume' : 'Pause';
      button.addEventListener('click', onPause);
      bar.appendChild(button);
    }
    if (onRestart) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.gameAction = 'restart';
      button.textContent = 'Restart';
      button.addEventListener('click', onRestart);
      bar.appendChild(button);
    }
    return bar;
  };
  const refreshToolbar = (container, game, options = {}) => {
    const node = container?.querySelector('[data-game-best]');
    if (!node) return;
    const value = best(game, options);
    node.textContent = value == null ? '—' : (options.formatBest ? options.formatBest(value) : String(value));
  };
  window.AizanoiGames = Object.freeze({ read, list, save, best, toolbar, refreshToolbar });
})();
