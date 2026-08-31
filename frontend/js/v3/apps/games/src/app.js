const ASSET_ROOT = '/js/v3/apps/games/assets';
const GAMES = {
  snake:{label:'Signal Snake',description:'Collect glowing signals without crossing your own trail.',meta:'Reflex · Keyboard + touch',container:'game-snake-container',script:`${ASSET_ROOT}/snake.js`},
  mines:{label:'Survey Mines',description:'Clear the field by reading the numbers and marking hazards.',meta:'Logic · Mouse + touch',container:'game-mines-container',script:`${ASSET_ROOT}/mines.js`},
  brick:{label:'Strata Breaker',description:'Keep the signal in play and break through every layer.',meta:'Arcade · Keyboard + pointer',container:'game-brick-container',script:`${ASSET_ROOT}/brick.js`},
  blockfall:{label:'Blockfall',description:'Stack falling forms, clear lines and keep the field open.',meta:'Puzzle · Keyboard + touch',container:'game-blockfall-container',script:`${ASSET_ROOT}/blockfall.js`,mount:'AizanoiArcadeBlocks'}
};
let utilsPromise = null;

function loadScript(src) {
  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  const promise = new Promise((resolve, reject) => {
    script.onload = () => resolve(script);
    script.onerror = () => reject(new Error(`Could not load ${src}`));
  });
  document.body.appendChild(script);
  return { script, promise };
}

async function ensureUtils() {
  if (window.AizanoiGames) return;
  if (!utilsPromise) utilsPromise = loadScript(`${ASSET_ROOT}/game-utils.js`).promise;
  await utilsPromise;
}

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export async function mountArcade(container) {
  let scriptNode = null;
  let pendingScriptNode = null;
  let gameCleanup = null;
  let lifecycleVersion = 0;
  let disposed = false;

  container.innerHTML = `<div class="az-arcade"><header class="az-arcade-head"><div><p class="az-kicker">AIZANOI ARCADE</p><h2>Pick a cabinet.</h2><p>Four small browser games. No account, no network scoreboards, no clutter.</p></div><span class="az-arcade-count">04 games</span></header><div class="az-arcade-library" data-arcade-library>${Object.entries(GAMES).map(([id,game],index)=>`<button class="az-arcade-tile" type="button" data-play-game="${id}" aria-label="Play ${esc(game.label)}"><span class="az-arcade-number">0${index+1}</span><span class="az-arcade-tile-copy"><strong>${esc(game.label)}</strong><small>${esc(game.meta)}</small><span>${esc(game.description)}</span></span><span class="az-arcade-enter" aria-hidden="true">→</span></button>`).join('')}</div><div class="az-game-stage" data-game-stage hidden></div></div>`;
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
    stage.innerHTML = '';
    library.hidden = false;
  }

  async function play(id) {
    const game = GAMES[id];
    if (!game || disposed) return;
    const requestVersion = ++lifecycleVersion;
    teardownGame();
    cancelPendingScript();
    scriptNode?.remove();
    scriptNode = null;
    library.hidden = true;
    stage.hidden = false;
    stage.innerHTML = `<section class="az-arcade-session"><header class="az-arcade-session-head"><button class="az-arcade-back" type="button" data-close-game aria-label="Back to Arcade">← Arcade</button><div><p class="az-kicker">NOW PLAYING</p><h3>${esc(game.label)}</h3></div><span>${esc(game.meta)}</span></header><div class="az-arcade-cabinet" id="${game.container}"></div></section>`;

    await ensureUtils();
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

    const factory = game.mount ? window[game.mount] : null;
    if (factory && typeof factory.mount === 'function') {
      const host = stage.querySelector(`#${CSS.escape(game.container)}`);
      if (!host) return;
      gameCleanup = factory.mount(host, closeGame) || null;
    }
  }

  function closeGame() {
    lifecycleVersion++;
    teardownGame();
    cancelPendingScript();
    scriptNode?.remove();
    scriptNode = null;
    showLibrary();
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
        stage.innerHTML = `<div class="az-empty-state"><div><h3>Game unavailable</h3><p>${esc(error.message)}</p><button class="az-button" type="button" data-close-game>Back to Arcade</button></div></div>`;
      });
    }
    if (event.target.closest('[data-close-game]')) closeGame();
  };

  container.addEventListener('click', click);
  return () => {
    disposed = true;
    container.removeEventListener('click', click);
    closeGame();
  };
}
