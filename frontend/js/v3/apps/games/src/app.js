const ASSET_ROOT = '/js/v3/apps/games/assets';
const GAMES = {
  snake:{label:'Signal Snake',description:'Collect glowing signals without crossing your own trail.',meta:'Reflex · Keyboard + touch',container:'game-snake-container',script:`${ASSET_ROOT}/snake.js`,mount:'AizanoiArcadeSnake'},
  mines:{label:'Survey Mines',description:'Clear the field by reading the numbers and marking hazards.',meta:'Logic · Mouse + touch',container:'game-mines-container',script:`${ASSET_ROOT}/mines.js`,mount:'AizanoiArcadeMines'},
  brick:{label:'Strata Breaker',description:'Keep the signal in play and break through every layer.',meta:'Arcade · Keyboard + pointer',container:'game-brick-container',script:`${ASSET_ROOT}/brick.js`,mount:'AizanoiArcadeBrick'},
  blockfall:{label:'Blockfall',description:'Stack falling forms, clear lines and keep the field open.',meta:'Puzzle · Keyboard + touch',container:'game-blockfall-container',script:`${ASSET_ROOT}/blockfall.js`,mount:'AizanoiArcadeBlocks'}
};
let utilsPromise = null;
let cssUsers = 0;

/** Ref-counted, idempotent stylesheet: one <link> shared by open Arcade instances, removed with the last. */
function acquireStyles() {
  let link = document.head.querySelector('link[data-az-arcade-css]');
  let ready;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${ASSET_ROOT}/arcade.css`;
    link.dataset.azArcadeCss = '';
    ready = new Promise((resolve) => { link.addEventListener('load', resolve, { once: true }); link.addEventListener('error', resolve, { once: true }); setTimeout(resolve, 2500); });
    document.head.appendChild(link);
  } else ready = Promise.resolve();
  cssUsers++;
  let released = false;
  return { ready, release() {
    if (released) return;
    released = true;
    if (--cssUsers <= 0) { cssUsers = 0; document.head.querySelector('link[data-az-arcade-css]')?.remove(); }
  } };
}

function loadScript(src) {
  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  const promise = new Promise((resolve, reject) => {
    script.onload = () => resolve(script);
    script.onerror = () => { script.remove(); reject(new Error(`Could not load ${src.split('/').pop()}. Check your connection and try again.`)); };
  });
  document.body.appendChild(script);
  return { script, promise };
}

async function ensureUtils() {
  if (window.AizanoiGames) return;
  if (!utilsPromise) {
    utilsPromise = loadScript(`${ASSET_ROOT}/game-utils.js`).promise.catch((error) => { utilsPromise = null; throw error; });
  }
  await utilsPromise;
}

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export async function mountArcade(container) {
  let scriptNode = null;
  let pendingScriptNode = null;
  let gameCleanup = null;
  let lifecycleVersion = 0;
  let disposed = false;
  let lastGame = '';
  const styles = acquireStyles();

  container.innerHTML = `<div class="az-arcade"><header class="az-arcade-head"><div><p class="az-kicker">AIZANOI ARCADE</p><h2>Pick a cabinet.</h2><p>Four small browser games. No account, no network scoreboards, no clutter.</p></div><span class="az-arcade-count">04 games</span></header><nav class="az-arcade-links" aria-label="AI arenas"><a href="/?app=trade-arena"><strong>AI Trade Arena</strong><span>Historical paper-trading simulation</span></a><a href="/?app=snake-royale"><strong>Snake Royale</strong><span>AI models fight on one board</span></a></nav><div class="az-arcade-library" data-arcade-library>${Object.entries(GAMES).map(([id,game],index)=>`<button class="az-arcade-tile" type="button" data-play-game="${id}" aria-label="Play ${esc(game.label)}"><span class="az-arcade-number">0${index+1}</span><span class="az-arcade-tile-copy"><strong>${esc(game.label)}</strong><small>${esc(game.meta)}</small><span>${esc(game.description)}</span></span><span class="az-arcade-enter" aria-hidden="true">→</span></button>`).join('')}</div><div class="az-game-stage" data-game-stage hidden></div></div>`;
  const stage = container.querySelector('[data-game-stage]');
  const library = container.querySelector('[data-arcade-library]');

  function teardownGame() {
    try { gameCleanup?.(); } catch (_) {}
    gameCleanup = null;
  }

  function cancelPendingScript() {
    pendingScriptNode?.remove();
    pendingScriptNode = null;
  }

  function showLibrary() {
    stage.hidden = true;
    stage.removeAttribute('data-active-game');
    stage.innerHTML = '';
    library.hidden = false;
  }

  async function play(id) {
    const game = GAMES[id];
    if (!game || disposed) return;
    const requestVersion = ++lifecycleVersion;
    lastGame = id;
    teardownGame();
    cancelPendingScript();
    scriptNode?.remove();
    scriptNode = null;
    library.hidden = true;
    stage.hidden = false;
    stage.dataset.activeGame = id;
    stage.innerHTML = `<section class="az-arcade-session" aria-label="${esc(game.label)} game session"><header class="az-arcade-session-head"><button class="az-arcade-back" type="button" data-arcade-back aria-label="Back to Arcade">← Arcade</button><div class="az-arcade-session-title"><p class="az-kicker">NOW PLAYING</p><h3>${esc(game.label)}</h3></div><div class="az-arcade-session-actions"><span class="az-arcade-session-meta">${esc(game.meta)}</span><button class="az-arcade-session-close" type="button" data-close-game aria-label="Close ${esc(game.label)}">×</button></div></header><div class="az-arcade-cabinet" id="${game.container}"><p class="ag-loading" role="status" aria-busy="true">Loading ${esc(game.label)}…</p></div></section>`;

    await Promise.all([ensureUtils(), styles.ready]);
    if (disposed || requestVersion !== lifecycleVersion) return;

    const load = loadScript(game.script);
    pendingScriptNode = load.script;
    await load.promise;
    if (pendingScriptNode === load.script) pendingScriptNode = null;
    if (disposed || requestVersion !== lifecycleVersion) {
      load.script.remove();
      return;
    }
    scriptNode = load.script;

    const factory = window[game.mount];
    const host = stage.querySelector(`#${CSS.escape(game.container)}`);
    if (!host || typeof factory?.mount !== 'function') throw new Error(`${game.label} did not start.`);
    host.innerHTML = '';
    gameCleanup = factory.mount(host, closeGame) || null;
    host.querySelector('canvas,button.ag-cell')?.focus?.({ preventScroll: true });
  }

  function closeGame() {
    lifecycleVersion++;
    teardownGame();
    cancelPendingScript();
    scriptNode?.remove();
    scriptNode = null;
    showLibrary();
    (library.querySelector(`[data-play-game="${lastGame}"]`) || library.querySelector('[data-play-game]'))?.focus({ preventScroll:true });
  }

  const click = (event) => {
    const id = event.target.closest('[data-play-game]')?.dataset.playGame;
    if (id) {
      const requestVersion = lifecycleVersion + 1;
      play(id).catch((error) => {
        if (disposed || requestVersion !== lifecycleVersion) return;
        teardownGame();
        cancelPendingScript();
        library.hidden = true;
        stage.hidden = false;
        stage.innerHTML = `<div class="az-empty-state" role="alert"><div><h3>Game unavailable</h3><p>${esc(error.message)}</p><button class="az-button" type="button" data-play-game="${esc(id)}">Try again</button> <button class="az-button" type="button" data-arcade-back>Back to Arcade</button></div></div>`;
        stage.querySelector('[data-play-game]')?.focus();
      });
    }
    if (event.target.closest('[data-close-game],[data-arcade-back]')) closeGame();
  };
  const keydown = (event) => {
    if (event.key !== 'Escape' || stage.hidden) return;
    event.preventDefault();
    closeGame();
  };

  container.addEventListener('click', click);
  container.addEventListener('keydown', keydown);
  return () => {
    disposed = true;
    container.removeEventListener('click', click);
    container.removeEventListener('keydown', keydown);
    closeGame();
    styles.release();
  };
}
