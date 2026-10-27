// Fighter picker, human controls, canvas renderer and series logic.
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const renderer = SnakeArenaRenderer.create($('sr-canvas'));
  const coarse = window.matchMedia('(pointer: coarse)');
  const MAX_SEATS = 12;
  const PLAYERS = [
    { id: 'player-1', name: 'Player 1', color: '#ffffff', control: 'sr-p1' },
    { id: 'player-2', name: 'Player 2', color: '#ffd84d', control: 'sr-p2' },
  ];
  const CAUSE = {
    'head-on': d => `${d.by} won the head-on against ${d.id}`,
    body: d => `${d.id} crashed into ${d.by}`,
    self: d => `${d.id} bit its own tail`,
    wall: d => `${d.id} hit the wall`,
    storm: d => `${d.id} was swallowed by the storm`,
    starved: d => `${d.id} starved`,
    'load-error': d => `${d.id} failed to start`,
  };

  let BOTS = [], byId = Object.create(null), token = 0, running = false;
  let activeRun = null, activeHumans = [], activeSeats = null, ready = false;

  function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  function botSelects() {
    return [$('sr-a'), $('sr-b'), ...document.querySelectorAll('.sr-extra')];
  }

  function selectedSeats() {
    const bots = botSelects().map(select => byId[select.value]).filter(Boolean);
    const humans = PLAYERS.filter(p => $(p.control).value !== 'off').map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      human: true,
      scheme: $(p.control).value,
    }));
    return [...bots, ...humans];
  }

  function fill(select) {
    BOTS.forEach(b => select.appendChild(new Option(`${b.name}  ·  ${b.lab}`, b.id)));
  }

  function tint() {
    const a = byId[$('sr-a').value], b = byId[$('sr-b').value];
    if (a) document.querySelector('.sr-a').style.setProperty('--sr-a', a.color);
    if (b) document.querySelector('.sr-b').style.setProperty('--sr-b', b.color);
    document.querySelectorAll('.sr-extra').forEach(select => {
      const bot = byId[select.value];
      if (bot) select.style.setProperty('--c', bot.color);
    });
  }

  function syncPad() {
    const p1 = running
      ? activeHumans.some(p => p.id === 'player-1')
      : $('sr-p1').value !== 'off';
    $('sr-pad').hidden = !(coarse.matches && p1);
    $('sr-pad').querySelectorAll('button').forEach(button => {
      button.disabled = !running || !activeHumans.some(p => p.id === 'player-1');
    });
  }

  function setRunning(on) {
    running = on;
    $('sr-fight').textContent = on ? 'Fighting…' : 'Fight';
    syncPad();
    syncMode();
  }

  function syncMode() {
    const count = running && activeSeats ? activeSeats.length : selectedSeats().length;
    $('sr-mode').textContent = count > 2 ? '19 × 19 · ROYALE' : '11 × 11 · DUEL';
  }

  function syncControls() {
    const seats = selectedSeats();
    $('sr-add').disabled = !ready || seats.length >= MAX_SEATS;
    PLAYERS.forEach(p => {
      const select = $(p.control);
      [...select.options].forEach(option => {
        option.disabled = option.value !== 'off' && select.value === 'off' && seats.length >= MAX_SEATS;
      });
    });
    tint();
    syncMode();
    syncPad();
  }

  function randomPair() {
    if (!BOTS.length) return;
    const i = Math.floor(Math.random() * BOTS.length);
    const alternatives = BOTS.filter((b, index) => index !== i);
    const b = alternatives[Math.floor(Math.random() * alternatives.length)] || BOTS[i];
    $('sr-a').value = BOTS[i].id;
    $('sr-b').value = b.id;
    syncControls();
  }

  function addBot() {
    if (!ready || selectedSeats().length >= MAX_SEATS) return;
    const used = new Set(botSelects().map(select => select.value));
    const available = BOTS.filter(b => !used.has(b.id));
    if (!available.length) {
      $('sr-ticker').textContent = 'Every available bot already has a seat.';
      return;
    }

    const row = el('div', 'sr-extra-row');
    const label = el('label', 'sr-opt');
    const select = el('select', 'sr-extra');
    label.appendChild(el('span', null, 'Extra bot'));
    fill(select);
    select.value = available[Math.floor(Math.random() * available.length)].id;
    label.appendChild(select);
    const remove = el('button', 'sr-remove', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Remove extra bot');
    remove.addEventListener('click', () => {
      row.remove();
      syncControls();
    });
    select.addEventListener('change', syncControls);
    row.append(label, remove);
    $('sr-extras').appendChild(row);
    syncControls();
  }

  function roster() {
    BOTS.forEach(b => {
      const li = el('li');
      li.style.setProperty('--c', b.color);
      li.appendChild(el('b', null, b.name));
      li.appendChild(el('small', null,
        `${b.lab} · bot “${b.botName || b.id}” · ${(b.bytes / 1024).toFixed(1)} KB`));
      if (b.note) li.appendChild(el('small', null, b.note.replace(/^[^:]+:\s*/, '')));
      $('sr-list').appendChild(li);
    });
  }

  function labelFor(id, fighters) {
    if (id === 'player-1') return 'P1';
    if (id === 'player-2') return 'P2';
    return String.fromCharCode(65 + fighters.indexOf(id));
  }

  function draw(game, colors, fighters, duration) {
    renderer.update(game, colors, { fighters, duration });
    $('sr-turn').textContent = `TURN ${game.turn}`;
    $('sr-storm').textContent =
      `STORM IN ${Math.max(0, game.nextShrinkTurn - game.turn)} · RING ${game.hazard}`;
  }

  function cards(snakes, series) {
    const box = $('sr-cards');
    box.textContent = '';
    const compact = series.fighters.length > 2;
    box.classList.toggle('sr-compact', compact);
    const ordered = snakes.slice();
    if (compact) ordered.sort((a, b) => Number(b.alive) - Number(a.alive) || b.length - a.length);

    ordered.forEach(s => {
      const entry = series.entries.find(e => e.id === s.id);
      const c = el('div', 'sr-card' + (s.alive ? '' : ' dead'));
      c.style.setProperty('--c', entry.color);
      c.appendChild(el('b', null, `${labelFor(s.id, series.fighters)} · ${entry.name}`));
      c.appendChild(el('small', null,
        `${s.alive ? 'Length ' + s.length + ' · Health ' + s.health : 'Out'} · wins ${series.wins[s.id]}`));
      const bar = el('div', 'sr-bar'), i = el('i');
      i.style.setProperty('--c', entry.color);
      i.style.setProperty('--health', Math.max(0, Math.min(100, s.health)) + '%');
      bar.appendChild(i);
      c.appendChild(bar);
      box.appendChild(c);
    });
  }

  const view = game => game.snakes.map(s => ({
    id: s.id, alive: s.alive, length: s.body.length, health: s.health,
  }));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function cleanup() {
    if (activeRun) activeRun.stop();
    activeRun = null;
    activeHumans.forEach(p => p.input.destroy());
    activeHumans = [];
  }

  function enableHumans(on) {
    activeHumans.forEach(p => p.input.enable(on));
    $('sr-pad').querySelectorAll('button').forEach(button => {
      button.disabled = !on || !activeHumans.some(p => p.id === 'player-1');
    });
  }

  async function countdown(my) {
    for (let n = 3; n > 0; n--) {
      if (my !== token) return false;
      $('sr-ticker').textContent = `${n}…`;
      await sleep(1000);
    }
    if (my !== token) return false;
    $('sr-ticker').textContent = 'Go!';
    return true;
  }

  async function playOne(entries, seed, delay, series, my) {
    const offset = series.n % entries.length;
    const order = [...entries.slice(offset), ...entries.slice(0, offset)];
    const colors = Object.fromEntries(entries.map(e => [e.id, e.color]));
    const options = entries.length > 2 ? { seed, width: 19, height: 19 } : { seed };
    const run = SnakeRunner.start(order, options);
    activeRun = run;

    try {
      await run.loaded;
      if (my !== token) return null;
      const game = run.game;
      const names = Object.fromEntries(entries.map(e => [e.id, e.name]));
      draw(game, colors, series.fighters, delay);
      cards(view(game), series);

      if (activeHumans.length) {
        if (!await countdown(my)) return null;
        enableHumans(true);
      }

      while (!game.finished() && my === token) {
        const t0 = performance.now();
        const events = await run.turn();
        if (my !== token) return null;
        events.forEach(e => {
          if (e.type === 'death') {
            $('sr-ticker').textContent = (CAUSE[e.cause] || (() => e.cause))({
              id: names[e.id], by: names[e.by],
            });
          }
          if (e.type === 'shrink') $('sr-ticker').textContent = 'The storm closes in!';
        });
        activeHumans.forEach(p => {
          p.input.enable(game.snakes.some(s => s.id === p.id && s.alive));
        });
        draw(game, colors, series.fighters, delay);
        cards(view(game), series);
        if (delay) await sleep(Math.max(0, delay - (performance.now() - t0)));
      }

      return my === token ? game.placements() : null;
    } finally {
      run.stop();
      if (activeRun === run) activeRun = null;
      if (my === token) enableHumans(false);
    }
  }

  function verdict(series, bestOf) {
    const ranked = series.entries.slice().sort((a, b) => series.wins[b.id] - series.wins[a.id]);
    const first = ranked[0], second = ranked[1];
    if (ranked.length === 2) {
      const wa = series.wins[series.fighters[0]], wb = series.wins[series.fighters[1]];
      return wa === wb ? `Draw ${wa}–${wb}` :
        `${first.name} wins${bestOf > 1 ? ` ${Math.max(wa, wb)}–${Math.min(wa, wb)}` : ''}!`;
    }
    const score = ranked.map(e => series.wins[e.id]).join('–');
    if (series.wins[first.id] === series.wins[second.id]) return `Draw ${score}`;
    return `${first.name} wins${bestOf > 1 ? ` · ${series.wins[first.id]} wins` : ''}!`;
  }

  async function fight() {
    if (!ready) return;
    const my = ++token;
    cleanup();
    activeSeats = null;
    setRunning(false);
    const res = $('sr-result');
    res.hidden = true;
    $('sr-ticker').textContent = '';

    const entries = selectedSeats();
    const humans = entries.filter(e => e.human);
    if (entries.length > MAX_SEATS) {
      $('sr-ticker').textContent = 'Choose at most 12 fighters.';
      return;
    }
    if (humans.length === 2 && humans[0].scheme === humans[1].scheme) {
      $('sr-ticker').textContent = 'Choose different keyboard controls for Player 1 and Player 2.';
      return;
    }
    if (new Set(entries.map(e => e.id)).size !== entries.length) {
      $('sr-ticker').textContent = entries.length === 2 ? 'Pick two different fighters.' :
        'Pick a different bot for every seat.';
      return;
    }

    const bestOf = Number($('sr-series').value);
    const need = Math.floor(bestOf / 2) + 1;
    const speed = Number($('sr-speed').value);
    const delay = humans.length ? Math.max(speed || 140, 120) : speed; // humans need a playable tick
    const base = Math.floor(Math.random() * 1e6);
    const series = {
      n: 0,
      entries,
      fighters: entries.map(e => e.id),
      wins: Object.fromEntries(entries.map(e => [e.id, 0])),
    };

    try {
      humans.forEach(p => {
        p.input = ArenaInput.create(p.scheme);
        activeHumans.push(p);
        if (p.id === 'player-1') p.input.attachPad($('sr-pad'));
      });
      activeSeats = entries;
      setRunning(true);

      while (!entries.some(e => series.wins[e.id] >= need) &&
             series.n < bestOf + 4 && my === token) {
        const placements = await playOne(entries, base + series.n, delay, series, my);
        if (!placements || my !== token) return;
        const winners = placements.filter(p => p.place === 1);
        const tied = winners.length !== 1;
        if (!tied) series.wins[winners[0].id]++;
        series.n++;
        cards(placements.map(p => ({
          id: p.id, alive: p.alive, length: p.length, health: 0,
        })), series);
        const winner = tied ? null : entries.find(e => e.id === winners[0].id);
        $('sr-ticker').textContent = tied ? `Game ${series.n}: draw` :
          `Game ${series.n}: ${winner.name} wins`;
        if (bestOf > 1 && my === token) await sleep(delay ? 1200 : 0);
      }

      if (my !== token) return;
      res.textContent = verdict(series, bestOf);
      res.hidden = false;
    } catch (err) {
      if (my === token) {
        $('sr-ticker').textContent = 'The match could not be completed. Please try again.';
        console.error('snake-royale: match failed', err);
      }
    } finally {
      if (my === token) {
        cleanup();
        activeSeats = null;
        setRunning(false);
      }
    }
  }

  async function init() {
    let payload;
    try {
      const response = await fetch('bots.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      payload = await response.json();
      if (!Array.isArray(payload.bots) || payload.bots.length < 2) {
        throw new Error('The roster must contain at least two bots');
      }
    } catch (err) {
      $('sr-ticker').textContent =
        'The fighters could not be loaded. Check your connection and reload the page.';
      $('sr-fight').disabled = true;
      $('sr-random').disabled = true;
      $('sr-add').disabled = true;
      console.error('snake-royale: bots.json failed to load', err);
      return;
    }

    BOTS = payload.bots;
    BOTS.forEach(b => { byId[b.id] = b; });
    fill($('sr-a'));
    fill($('sr-b'));
    roster();

    const q = new URLSearchParams(location.search);
    $('sr-a').value = byId[q.get('a')] ? q.get('a') : (byId.opus ? 'opus' : BOTS[0].id);
    $('sr-b').value = byId[q.get('b')] ? q.get('b') :
      (byId['kimi-k31-pro'] ? 'kimi-k31-pro' : BOTS[1].id);

    ready = true;
    $('sr-fight').disabled = false;
    $('sr-random').disabled = false;
    [$('sr-a'), $('sr-b'), $('sr-p1'), $('sr-p2')].forEach(select => {
      select.addEventListener('change', syncControls);
    });
    $('sr-add').addEventListener('click', addBot);
    $('sr-random').addEventListener('click', randomPair);
    $('sr-form').addEventListener('submit', event => {
      event.preventDefault();
      fight();
    });
    syncControls();

    const entries = selectedSeats(), fighters = entries.map(e => e.id);
    const preview = SnakeEngine.create(fighters, { seed: 1 });
    const colors = Object.fromEntries(entries.map(e => [e.id, e.color]));
    draw(preview, colors, fighters, Number($('sr-speed').value));
    cards(view(preview), {
      entries, fighters, wins: Object.fromEntries(fighters.map(id => [id, 0])),
    });
    if (q.get('autostart') === '1') fight();
  }

  if (coarse.addEventListener) coarse.addEventListener('change', syncPad);
  else coarse.addListener(syncPad);

  window.addEventListener('pagehide', event => {
    token++;
    cleanup();
    activeSeats = null;
    setRunning(false);
    if (!event.persisted) renderer.destroy();
  });

  window.__SNAKE_ROYALE__ = () => ({
    bots: BOTS.length,
    running,
    fighters: [$('sr-a').value, $('sr-b').value],
    ticker: $('sr-ticker').textContent,
    result: $('sr-result').hidden ? null : $('sr-result').textContent,
    cards: [...document.querySelectorAll('#sr-cards .sr-card')].map(card => card.textContent),
    seats: (running && activeSeats ? activeSeats : selectedSeats()).map(e => e.id),
    mode: $('sr-mode').textContent,
  });

  init();
})();
