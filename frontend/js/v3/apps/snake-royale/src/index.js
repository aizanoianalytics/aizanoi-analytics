// First-party shell renderer; the standalone route remains an independent document.
const BASE = '/arcade/snake-royale/';

const scripts = new Map();
function loadScript(file) {
  if (!scripts.has(file)) {
    const script = document.createElement('script');
    script.src = BASE + file;
    scripts.set(file, new Promise((resolve, reject) => {
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => { scripts.delete(file); script.remove(); reject(new Error(`Could not load ${file}`)); }, { once: true });
      document.head.append(script);
    }));
  }
  return scripts.get(file);
}
const node = (tag, cls, text) => {
  const element = document.createElement(tag);
  if (cls) element.className = cls;
  if (text != null) element.textContent = text;
  return element;
};

export async function mount({ container }) {
  container.replaceChildren();
  const root = node('div', 'sr-app');
  root.innerHTML = `<div class="sr-app-head"><h2>AI Snake Royale</h2><a href="/arcade/snake-royale/" target="_blank" rel="noopener noreferrer">Full arena ↗</a></div>
    <p>Pick two AI-written bots and watch them fight live.</p>
    <form class="sr-app-form" aria-label="Choose fighters">
      <label>Fighter A <select name="a" aria-label="Fighter A"></select></label>
      <label>Fighter B <select name="b" aria-label="Fighter B"></select></label>
      <label>Series <select name="series"><option value="1">Single fight</option><option value="3">Best of 3</option><option value="5">Best of 5</option></select></label>
      <label>Speed <select name="speed"><option value="260">Slow</option><option value="140" selected>Normal</option><option value="60">Fast</option><option value="0">Instant</option></select></label>
      <div class="sr-app-actions"><button type="submit">Fight</button><button type="button" data-random>Random pair</button><button type="button" data-retry hidden>Retry</button></div>
    </form>
    <div class="sr-app-telemetry" aria-label="Arena status"><span data-turn>TURN 0</span><span data-storm>STORM IN 150</span><span>11 × 11 · DUEL</span></div>
    <div class="sr-app-stage"><canvas width="660" height="660" role="img" aria-label="Snake Royale arena"></canvas>
      <aside aria-live="polite"><div data-cards></div><p data-ticker>Loading fighters…</p><strong data-result hidden></strong></aside></div>
    <p class="sr-app-rules">11×11 board · 100 health · shrinking storm after turn 150 · 400 ms per bot move.</p>`;
  container.append(root);
  const cssLink = document.createElement('link');
  cssLink.rel = 'stylesheet'; cssLink.href = '/js/v3/apps/snake-royale/src/app.css';
  document.head.append(cssLink);
  const get = selector => root.querySelector(selector);
  const a = get('[name=a]'), b = get('[name=b]'), ticker = get('[data-ticker]');
  const result = get('[data-result]'), canvas = get('canvas');
  let renderer = null;
  const abort = new AbortController();
  let bots = [], active = null, generation = 0, closed = false;
  const timers = new Set();
  function wait(ms) {
    return new Promise(resolve => {
      const entry = { resolve, id: null };
      entry.id = setTimeout(() => { timers.delete(entry); resolve(); }, ms);
      timers.add(entry);
    });
  }
  function cancel() {
    generation++;
    active?.stop(); active = null;
    for (const entry of timers) { clearTimeout(entry.id); entry.resolve(); }
    timers.clear();
  }
  function draw(game, colors, fighters = [a.value, b.value]) {
    renderer.update(game, colors, { fighters, duration: Number(get('[name=speed]').value) });
    get('[data-turn]').textContent = `TURN ${game.turn}`;
    get('[data-storm]').textContent = `STORM IN ${Math.max(0, game.nextShrinkTurn - game.turn)} · RING ${game.hazard}`;
    const cards = get('[data-cards]'); cards.replaceChildren();
    for (const snake of game.snakes) {
      const card = node('div', 'sr-app-card');
      const name = bots.find(bot => bot.id === snake.id)?.name || snake.id;
      const label = fighters.indexOf(snake.id) === 0 ? 'A' : 'B';
      card.dataset.fighter = label;
      card.append(node('b', null, `${label} · ${name}`), node('small', null, `${snake.alive ? 'Length ' + snake.body.length + ' · Health ' + snake.health : 'Out'} · Turn ${game.turn}`));
      const health = node('progress', 'sr-app-health');
      health.max = 100; health.value = Math.max(0, snake.health);
      health.setAttribute('aria-label', `${label} health ${snake.health} of 100`);
      // HTML's SVG namespace transition needs no remote URL or inline CSS.
      const stripe = node('span', 'sr-app-color');
      stripe.setAttribute('aria-hidden', 'true');
      stripe.innerHTML = '<svg viewBox="0 0 100 4" preserveAspectRatio="none"><rect width="100" height="4"/></svg>';
      stripe.querySelector('rect').setAttribute('fill', colors[snake.id]);
      card.prepend(stripe); card.append(health);
      cards.append(card);
    }
  }
  function randomPair() {
    const first = Math.floor(Math.random() * bots.length);
    let second = Math.floor(Math.random() * (bots.length - 1));
    if (second >= first) second++;
    a.value = bots[first].id; b.value = bots[second].id;
  }
  async function fight(event) {
    event.preventDefault();
    cancel();
    result.hidden = true; result.textContent = '';
    const mine = generation;
    const first = bots.find(bot => bot.id === a.value), second = bots.find(bot => bot.id === b.value);
    if (!first || !second || first.id === second.id) { ticker.textContent = 'Pick two different fighters.'; return; }
    result.hidden = true; ticker.textContent = 'Fighting…';
    const count = Number(get('[name=series]').value), delay = Number(get('[name=speed]').value);
    const wins = { [first.id]: 0, [second.id]: 0 }, needed = Math.floor(count / 2) + 1;
    const seed = Math.floor(Math.random() * 1e6);
    try {
      for (let round = 0; round < count + 4 && wins[first.id] < needed && wins[second.id] < needed && mine === generation; round++) {
        const pair = round % 2 ? [second, first] : [first, second];
        const run = window.SnakeRunner.start(pair, { seed: seed + round });
        active = run;
        await run.loaded;
        if (mine !== generation) break;
        const colors = Object.fromEntries(pair.map(bot => [bot.id, bot.color]));
        draw(run.game, colors, [first.id, second.id]);
        while (!run.game.finished() && mine === generation) {
          const start = performance.now();
          const events = await run.turn();
          if (mine !== generation) break;
          for (const item of events) if (item.type === 'death') ticker.textContent = `${bots.find(bot => bot.id === item.id)?.name || item.id} is out (${item.cause}).`;
          draw(run.game, colors, [first.id, second.id]);
          if (delay) await wait(Math.max(0, delay - (performance.now() - start)));
        }
        run.stop(); if (active === run) active = null;
        if (mine !== generation) break;
        const places = run.game.placements();
        const tie = places.length > 1 && places[1].place === 1;
        if (!tie) wins[places[0].id]++;
        ticker.textContent = tie ? `Game ${round + 1}: draw` : `Game ${round + 1}: ${bots.find(bot => bot.id === places[0].id)?.name} wins`;
        if (count > 1) await wait(delay ? 1200 : 0);
      }
      if (mine !== generation) return;
      const winner = wins[first.id] === wins[second.id] ? null : wins[first.id] > wins[second.id] ? first : second;
      result.textContent = winner ? `${winner.name} wins ${wins[first.id]}–${wins[second.id]}!` : `Draw ${wins[first.id]}–${wins[second.id]}`;
      result.hidden = false;
    } catch (error) {
      if (mine === generation) ticker.textContent = `Match could not finish: ${error.message}`;
    } finally { if (mine === generation) { active?.stop(); active = null; } }
  }
  get('form').addEventListener('submit', fight, { signal: abort.signal });
  get('[data-random]').addEventListener('click', randomPair, { signal: abort.signal });
  const retry = get('[data-retry]');
  async function load() {
    retry.hidden = true;
    ticker.textContent = 'Loading fighters…';
    try {
      await loadScript('engine.js');
      await loadScript('runner.js');
      await loadScript('renderer.js');
      if (closed) return;
      if (!renderer) renderer = window.SnakeArenaRenderer.create(canvas);
      const response = await fetch(BASE + 'bots.json', { signal: abort.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (closed) return;
      bots = payload.bots;
      if (!Array.isArray(bots) || bots.length < 2) throw new Error('Fighter roster is incomplete');
      for (const select of [a, b]) select.replaceChildren();
      for (const bot of bots) for (const select of [a, b]) select.add(new Option(`${bot.name} · ${bot.lab}`, bot.id));
      for (const select of [a, b, get('[name=series]'), get('[name=speed]')]) select.disabled = false;
      get('[type=submit]').disabled = false;
      get('[data-random]').disabled = false;
      a.value = bots.some(bot => bot.id === 'opus') ? 'opus' : bots[0].id;
      b.value = bots.some(bot => bot.id === 'kimi-k31-pro') ? 'kimi-k31-pro' : bots[1].id;
      draw(window.SnakeEngine.create([a.value, b.value], { seed: 1 }), Object.fromEntries(bots.map(bot => [bot.id, bot.color])));
      ticker.textContent = 'Choose fighters and press Fight.';
    } catch (error) {
      if (closed || error.name === 'AbortError') return;
      ticker.textContent = `Fighters could not be loaded: ${error.message}`;
      get('[type=submit]').disabled = true;
      get('[data-random]').disabled = true;
      for (const select of [a, b]) select.disabled = true;
      retry.hidden = false;
    }
  }
  retry.addEventListener('click', load, { signal: abort.signal });
  await load();
  return () => {
    closed = true;
    cancel(); renderer?.destroy(); abort.abort(); cssLink.remove(); root.remove();
  };
}
