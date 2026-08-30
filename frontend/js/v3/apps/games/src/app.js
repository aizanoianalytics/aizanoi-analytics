const ASSET_ROOT = '/js/v3/apps/games/assets';
const GAMES = {
  snake:{label:'Signal Snake',description:'Keyboard/touch grid arcade game',container:'game-snake-container',script:`${ASSET_ROOT}/snake.js`},
  mines:{label:'Survey Mines',description:'Local logic game',container:'game-mines-container',script:`${ASSET_ROOT}/mines.js`},
  brick:{label:'Strata Breaker',description:'Canvas timing arcade game',container:'game-brick-container',script:`${ASSET_ROOT}/brick.js`},
  blockfall:{label:'Blockfall',description:'Stack falling blocks and clear lines',container:'game-blockfall-container',script:`${ASSET_ROOT}/blockfall.js`,mount:'AizanoiArcadeBlocks'}
};
let utilsPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve(script);
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.body.appendChild(script);
  });
}

async function ensureUtils() {
  if (window.AizanoiGames) return;
  if (!utilsPromise) utilsPromise = loadScript(`${ASSET_ROOT}/game-utils.js`);
  await utilsPromise;
}

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export async function mountArcade(container) {
  let active = null;
  let scriptNode = null;
  let gameCleanup = null;

  container.innerHTML = `<div class="az-app-shell"><div class="az-app-toolbar"><strong>Aizanoi Arcade</strong><span class="az-system-spacer"></span><span class="az-app-caption">Small playable browser games</span></div><div class="az-games"><div class="az-simple-grid">${Object.entries(GAMES).map(([id,game])=>`<article class="az-simple-card"><p class="az-kicker">ARCADE</p><h3>${esc(game.label)}</h3><p>${esc(game.description)}</p><button class="az-button" type="button" data-play-game="${id}">Play</button></article>`).join('')}</div><div class="az-game-stage" data-game-stage></div></div></div>`;
  const stage = container.querySelector('[data-game-stage]');

  function teardownGame() {
    try { gameCleanup?.(); } catch (_) {}
    gameCleanup = null;
  }

  async function play(id) {
    const game = GAMES[id];
    if (!game) return;
    active = id;
    teardownGame();
    stage.innerHTML = `<section class="az-simple-card"><div class="az-game-stage-head"><h3>${esc(game.label)}</h3><span class="az-system-spacer"></span><button class="az-button" type="button" data-close-game>Close game</button></div><div id="${game.container}"></div></section>`;
    await ensureUtils();
    scriptNode?.remove();
    scriptNode = await loadScript(game.script);
    // Module-owned legacy game assets may self-initialize; Blockfall exposes
    // an explicit mount/cleanup factory through its compatibility global.
    const factory = game.mount ? window[game.mount] : null;
    if (factory && typeof factory.mount === 'function') {
      const host = stage.querySelector(`#${CSS.escape(game.container)}`);
      gameCleanup = factory.mount(host, () => {
        active = null;
        stage.innerHTML = '';
        teardownGame();
        scriptNode?.remove();
        scriptNode = null;
      }) || null;
    }
  }

  const closeGame = () => {
    active = null;
    stage.innerHTML = '';
    teardownGame();
    scriptNode?.remove();
    scriptNode = null;
  };

  const click = (event) => {
    const id = event.target.closest('[data-play-game]')?.dataset.playGame;
    if (id) play(id).catch((error) => {
      teardownGame();
      stage.innerHTML = `<div class="az-empty-state"><div><h3>Game unavailable</h3><p>${esc(error.message)}</p></div></div>`;
    });
    if (event.target.closest('[data-close-game]')) closeGame();
  };

  container.addEventListener('click', click);
  return () => {
    container.removeEventListener('click', click);
    closeGame();
  };
}
