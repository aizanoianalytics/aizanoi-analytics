// AI Snake Royale page: fighter picker, canvas renderer, series logic. Engine: engine.js, bot hosting: runner.js.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const cv = $('sr-canvas'), renderer = SnakeArenaRenderer.create(cv);
  window.addEventListener('pagehide', event => { if (!event.persisted) renderer.destroy(); });
  const CAUSE = {
    'head-on': d => `${d.by} won the head-on against ${d.id}`, body: d => `${d.id} crashed into ${d.by}`, self: d => `${d.id} bit its own tail`,
    wall: d => `${d.id} hit the wall`, storm: d => `${d.id} was swallowed by the storm`, starved: d => `${d.id} starved`, 'load-error': d => `${d.id} failed to start`,
  };
  let BOTS = [], byId = {}, token = 0, running = false;
  const setRunning = on => { running = on; $('sr-fight').textContent = on ? 'Fighting…' : 'Fight'; };

  function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function fill(sel) { BOTS.forEach(b => { sel.appendChild(new Option(`${b.name}  ·  ${b.lab}`, b.id)); }); }
  function tint() {
    $('sr-form').querySelector('.sr-a').style.setProperty('--sr-a', byId[$('sr-a').value].color);
    $('sr-form').querySelector('.sr-b').style.setProperty('--sr-b', byId[$('sr-b').value].color);
  }
  function randomPair() {
    const i = Math.floor(Math.random() * BOTS.length);
    let j; do { j = Math.floor(Math.random() * BOTS.length); } while (j === i);
    $('sr-a').value = BOTS[i].id; $('sr-b').value = BOTS[j].id; tint();
  }
  function roster() {
    const ul = $('sr-list');
    BOTS.forEach(b => {
      const li = el('li'); li.style.setProperty('--c', b.color);
      li.appendChild(el('b', null, b.name)); li.appendChild(el('small', null, `${b.lab} · bot “${b.botName || b.id}” · ${(b.bytes / 1024).toFixed(1)} KB`));
      if (b.note) li.appendChild(el('small', null, b.note.replace(/^[^:]+:\s*/, '')));
      ul.appendChild(li);
    });
  }

  // ---------- drawing ----------
  function draw(game, colors, fighters = [$('sr-a').value, $('sr-b').value]) {
    renderer.update(game, colors, { fighters, duration: Number($('sr-speed').value) });
    $('sr-turn').textContent = `TURN ${game.turn}`;
    $('sr-storm').textContent = `STORM IN ${Math.max(0, game.nextShrinkTurn - game.turn)} · RING ${game.hazard}`;
  }
  function cards(snakes, series) {
    const box = $('sr-cards'); box.textContent = '';
    snakes.forEach(s => {
      const b = byId[s.id], c = el('div', 'sr-card' + (s.alive ? '' : ' dead')); c.style.setProperty('--c', b.color);
      c.appendChild(el('b', null, `${s.id === (series.fighters || [$('sr-a').value])[0] ? 'A' : 'B'} · ${b.name}`));
      c.appendChild(el('small', null, `${s.alive ? 'Length ' + s.length + ' · Health ' + s.health : 'Out'} · wins ${series.wins[s.id]}`));
      const bar = el('div', 'sr-bar'), i = el('i'); i.style.setProperty('--c', b.color); i.style.width = Math.max(0, s.health) + '%'; bar.appendChild(i); c.appendChild(bar);
      box.appendChild(c);
    });
  }
  const view = game => game.snakes.map(s => ({ id: s.id, alive: s.alive, length: s.body.length, health: s.health }));
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------- one game ----------
  async function playOne(a, b, seed, delay, series, my) {
    const order = series.n % 2 ? [b, a] : [a, b]; // alternate the start ring so neither side keeps the same spawn
    const entries = order.map(x => ({ id: x.id, name: x.name, file: x.file }));
    const colors = {}; order.forEach(x => { colors[x.id] = x.color; });
    const run = SnakeRunner.start(entries, { seed });
    await run.loaded;
    const game = run.game;
    const names = Object.fromEntries(BOTS.map(x => [x.id, x.name]));
    draw(game, colors, series.fighters); cards(view(game), series);
    try {
      while (!game.finished() && my === token) {
        const t0 = performance.now();
        const ev = await run.turn();
        ev.forEach(e => {
          if (e.type === 'death') $('sr-ticker').textContent = (CAUSE[e.cause] || (() => e.cause))({ id: names[e.id], by: names[e.by] });
          if (e.type === 'shrink') $('sr-ticker').textContent = 'The storm closes in!';
        });
        draw(game, colors, series.fighters); cards(view(game), series);
        if (delay) await sleep(Math.max(0, delay - (performance.now() - t0)));
      }
    } finally { run.stop(); }
    return my === token ? game.placements() : null;
  }

  async function fight() {
    const my = ++token; setRunning(true);   // pressing Fight again restarts: the old loop sees a new token and stops
    const a = byId[$('sr-a').value], b = byId[$('sr-b').value];
    const res = $('sr-result'); res.hidden = true; $('sr-ticker').textContent = '';
    if (a.id === b.id) { $('sr-ticker').textContent = 'Pick two different fighters.'; setRunning(false); return; }
    const bestOf = +$('sr-series').value, need = Math.floor(bestOf / 2) + 1, delay = +$('sr-speed').value;
    const base = Math.floor(Math.random() * 1e6);
    const series = { n: 0, fighters: [a.id, b.id], wins: { [a.id]: 0, [b.id]: 0 } };
    while (series.wins[a.id] < need && series.wins[b.id] < need && series.n < bestOf + 4 && my === token) {
      const pl = await playOne(a, b, base + series.n, delay, series, my);
      if (!pl) break;
      const tied = pl.length > 1 && pl[1].place === 1;
      if (!tied) series.wins[pl[0].id]++;
      series.n++;
      cards(pl.map(p => ({ id: p.id, alive: p.alive, length: p.length, health: 0 })), series);
      $('sr-ticker').textContent = tied ? `Game ${series.n}: draw` : `Game ${series.n}: ${byId[pl[0].id].name} wins`;
      if (bestOf > 1 && my === token) await sleep(delay ? 1200 : 0);
    }
    if (my !== token) return;
    setRunning(false);
    const wa = series.wins[a.id], wb = series.wins[b.id];
    res.textContent = wa === wb ? `Draw ${wa}–${wb}` : `${wa > wb ? a.name : b.name} wins${bestOf > 1 ? ` ${Math.max(wa, wb)}–${Math.min(wa, wb)}` : ''}!`;
    res.hidden = false;
  }

  async function init() {
    let payload;
    try {
      const r = await fetch('bots.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      payload = await r.json();
    } catch (err) {
      // Without the manifest there is nothing to pick: say it on the page, keep
      // the fight control disabled, and keep the reason in the console.
      $('sr-ticker').textContent = 'The fighters could not be loaded. Check your connection and reload the page.';
      $('sr-fight').disabled = true;
      $('sr-random').disabled = true;
      console.error('snake-royale: bots.json failed to load', err);
      return;
    }
    BOTS = payload.bots; BOTS.forEach(b => { byId[b.id] = b; });
    fill($('sr-a')); fill($('sr-b')); roster();
    const q = new URLSearchParams(location.search);
    $('sr-a').value = byId[q.get('a')] ? q.get('a') : 'opus';
    $('sr-b').value = byId[q.get('b')] ? q.get('b') : 'kimi-k31-pro';
    tint();
    $('sr-a').addEventListener('change', tint); $('sr-b').addEventListener('change', tint);
    $('sr-random').addEventListener('click', randomPair);
    $('sr-form').addEventListener('submit', e => { e.preventDefault(); fight(); });
    const preview = SnakeEngine.create([$('sr-a').value, $('sr-b').value], { seed: 1 });
    const colors = {}; BOTS.forEach(b => { colors[b.id] = b.color; });
    draw(preview, colors); cards(view(preview), { wins: { [$('sr-a').value]: 0, [$('sr-b').value]: 0 } });
    if (q.get('autostart') === '1') fight();
  }
  // Read-only QA handle: browser tests poll real state instead of timing canvas frames.
  window.__SNAKE_ROYALE__ = () => ({
    bots: BOTS.length, running, fighters: [$('sr-a').value, $('sr-b').value],
    ticker: $('sr-ticker').textContent, result: $('sr-result').hidden ? null : $('sr-result').textContent,
    cards: [...document.querySelectorAll('#sr-cards .sr-card')].map(card => card.textContent),
  });
  init();
})();
