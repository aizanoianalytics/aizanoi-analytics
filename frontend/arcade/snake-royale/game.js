// Fighter picker, human controls, accessible match feedback and series logic.
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
    'head-on': d => `${d.id} was eliminated head-on with ${d.by || 'another snake'}`,
    body: d => `${d.id} crashed into ${d.by || 'another snake'}`,
    self: d => `${d.id} hit its own body`,
    wall: d => `${d.id} hit the wall`,
    storm: d => `${d.id} was swallowed by the storm`,
    starved: d => `${d.id} starved`,
    'load-error': d => `${d.id} failed to start`,
  };
  let BOTS = [], byId = Object.create(null), token = 0, running = false;
  let activeRun = null, activeHumans = [], activeSeats = null, ready = false;

  function el(tag, cls, text) {
    const element = document.createElement(tag);
    if (cls) element.className = cls;
    if (text != null) element.textContent = text;
    return element;
  }

  function botSelects() {
    return [$('sr-a'), $('sr-b'), ...document.querySelectorAll('.sr-extra')];
  }

  function selectedSeats() {
    const bots = botSelects().map(select => byId[select.value]).filter(Boolean);
    const humans = PLAYERS.filter(p => $(p.control).value !== 'off').map(p => ({
      id: p.id, name: p.name, color: p.color, human: true, scheme: $(p.control).value,
    }));
    return [...bots, ...humans];
  }

  function fill(select) {
    BOTS.forEach(bot => select.appendChild(new Option(`${bot.name}  ·  ${bot.lab}`, bot.id)));
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
    const player = activeHumans.find(p => p.id === 'player-1');
    const selected = running ? !!player : $('sr-p1').value !== 'off';
    $('sr-pad').hidden = !(coarse.matches && selected);
    $('sr-pad').querySelectorAll('button').forEach(button => {
      button.disabled = !(running && player && player.enabled);
    });
  }

  function setRunning(on) {
    running = on;
    $('sr-fight').textContent = on ? 'Restart fight' : 'Fight';
    $('sr-canvas').setAttribute('aria-busy', String(on));
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
    PLAYERS.forEach(player => {
      const select = $(player.control);
      [...select.options].forEach(option => {
        option.disabled = option.value !== 'off' && select.value === 'off' &&
          seats.length >= MAX_SEATS;
      });
    });
    tint();
    syncMode();
    syncPad();
  }

  function randomPair() {
    if (!BOTS.length) return;
    const i = Math.floor(Math.random() * BOTS.length);
    const alternatives = BOTS.filter((bot, index) => index !== i);
    const b = alternatives[Math.floor(Math.random() * alternatives.length)] || BOTS[i];
    $('sr-a').value = BOTS[i].id;
    $('sr-b').value = b.id;
    syncControls();
  }

  function addBot() {
    if (!ready || selectedSeats().length >= MAX_SEATS) return;
    const used = new Set(botSelects().map(select => select.value));
    const available = BOTS.filter(bot => !used.has(bot.id));
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
      $('sr-add').focus();
    });
    select.addEventListener('change', syncControls);
    row.append(label, remove);
    $('sr-extras').appendChild(row);
    syncControls();
  }

  function roster() {
    BOTS.forEach(bot => {
      const li = el('li');
      li.style.setProperty('--c', bot.color);
      li.appendChild(el('b', null, bot.name));
      li.appendChild(el('small', null,
        `${bot.lab} · bot “${bot.botName || bot.id}” · ${(bot.bytes / 1024).toFixed(1)} KB`));
      if (bot.note) li.appendChild(el('small', null, bot.note.replace(/^[^:]+:\s*/, '')));
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
    const cap = Math.floor(Math.min(game.options.width, game.options.height) / 2) - 1;
    $('sr-storm').textContent = game.hazard >= cap
      ? `FINAL RING · ${game.hazard}`
      : `STORM IN ${Math.max(0, game.nextShrinkTurn - game.turn)} · RING ${game.hazard}`;
    const living = game.snakes.filter(snake => snake.alive);
    $('sr-canvas').setAttribute('aria-label',
      `Snake Royale, turn ${game.turn}. ${living.length} of ${game.snakes.length} fighters alive. ` +
      `Storm ring ${game.hazard}. See fighter cards for standings.`);
  }

  function cards(snakes, series, final = false) {
    const box = $('sr-cards');
    box.textContent = '';
    box.classList.toggle('sr-compact', series.fighters.length > 2);
    // Preserve seat identity and reading order, including after eliminations.
    series.fighters.forEach(id => {
      const snake = snakes.find(s => s.id === id);
      if (!snake) return;
      const entry = series.entries.find(e => e.id === id);
      const card = el('div', 'sr-card' + (snake.alive ? '' : ' dead'));
      card.style.setProperty('--c', entry.color);
      card.appendChild(el('b', null, `${labelFor(id, series.fighters)} · ${entry.name}`));
      const stats = el('div', 'sr-stats');
      stats.appendChild(el('span', null, final ? `Place ${snake.place}` :
        snake.alive ? 'Alive' : 'Out'));
      stats.appendChild(el('span', null, `Length ${snake.length}`));
      if (!final && snake.alive) stats.appendChild(el('span', null, `Health ${snake.health}`));
      stats.appendChild(el('span', null, `wins ${series.wins[id]}`));
      card.appendChild(stats);
      if (final) {
        card.appendChild(el('small', 'sr-outcome', snake.death
          ? `Turn ${snake.death.turn} · ${snake.death.cause}`
          : 'Survivor'));
      } else if (snake.alive) {
        const bar = el('div', 'sr-bar'), fillBar = el('i');
        bar.setAttribute('aria-hidden', 'true');
        fillBar.style.setProperty('--c', entry.color);
        fillBar.style.setProperty('--health',
          Math.max(0, Math.min(100, snake.health)) + '%');
        bar.appendChild(fillBar);
        card.appendChild(bar);
      } else if (snake.death) {
        card.appendChild(el('small', 'sr-outcome', snake.death.cause));
      }
      box.appendChild(card);
    });
  }

  const view = game => game.snakes.map(snake => ({
    id: snake.id, alive: snake.alive, length: snake.body.length,
    health: snake.health, death: snake.death,
  }));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function cleanup() {
    if (activeRun) activeRun.stop();
    activeRun = null;
    activeHumans.forEach(player => player.input.destroy());
    activeHumans = [];
  }

  function enableHumans(on, game) {
    activeHumans.forEach(player => {
      player.enabled = !!on && (!game ||
        game.snakes.some(snake => snake.id === player.id && snake.alive));
      player.input.enable(player.enabled);
    });
    syncPad();
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

  function deathMessage(event, names) {
    return (CAUSE[event.cause] || (d => `${d.id}: ${event.cause}`))({
      id: names[event.id] || event.id,
      by: names[event.by] || event.by,
    });
  }

  async function playOne(entries, seed, delay, series, my) {
    const offset = series.n % entries.length;
    const order = [...entries.slice(offset), ...entries.slice(0, offset)];
    const colors = Object.fromEntries(entries.map(entry => [entry.id, entry.color]));
    const options = entries.length > 2 ? { seed, width: 19, height: 19 } : { seed };
    const run = SnakeRunner.start(order, options);
    activeRun = run;
    try {
      await run.loaded;
      if (my !== token) return null;
      const game = run.game;
      const names = Object.fromEntries(entries.map(entry => [entry.id, entry.name]));
      const failures = game.snakes.filter(snake => snake.death?.cause === 'load-error');
      const startupNotice = failures.map(snake =>
        deathMessage({ id: snake.id, cause: 'load-error' }, names)).join(' · ');
      $('sr-ticker').textContent = startupNotice || 'Arena ready.';
      draw(game, colors, series.fighters, delay);
      cards(view(game), series);
      if (activeHumans.length && !game.finished()) {
        if (!await countdown(my)) return null;
        enableHumans(true, game);
      }
      while (!game.finished() && my === token) {
        const started = performance.now();
        const events = await run.turn();
        if (my !== token) return null;
        const messages = events.filter(event => event.type === 'death')
          .map(event => deathMessage(event, names));
        if (events.some(event => event.type === 'shrink')) messages.push('The storm closes in!');
        if (messages.length) $('sr-ticker').textContent = messages.join(' · ');
        enableHumans(true, game);
        draw(game, colors, series.fighters, delay);
        cards(view(game), series);
        if (delay) await sleep(Math.max(0, delay - (performance.now() - started)));
      }
      if (my !== token) return null;
      return { placements: game.placements(), startupNotice };
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
    const score = ranked.map(entry => series.wins[entry.id]).join('–');
    if (series.wins[first.id] === series.wins[second.id]) return `Draw ${score}`;
    return `${first.name} wins${bestOf > 1 ? ` · ${series.wins[first.id]} wins` : ''}!`;
  }

  async function fight() {
    if (!ready) return;
    const my = ++token;
    cleanup();
    activeSeats = null;
    setRunning(false);
    const result = $('sr-result');
    result.hidden = true;
    $('sr-ticker').textContent = '';
    const entries = selectedSeats(), humans = entries.filter(entry => entry.human);
    if (entries.length < 2 || entries.length > MAX_SEATS) {
      $('sr-ticker').textContent = 'Choose between 2 and 12 fighters.';
      return;
    }
    if (humans.length === 2 && humans[0].scheme === humans[1].scheme) {
      $('sr-ticker').textContent = 'Choose different keyboard controls for Player 1 and Player 2.';
      return;
    }
    if (new Set(entries.map(entry => entry.id)).size !== entries.length) {
      $('sr-ticker').textContent = entries.length === 2 ? 'Pick two different fighters.' :
        'Pick a different bot for every seat.';
      return;
    }

    const bestOf = Number($('sr-series').value);
    const need = Math.floor(bestOf / 2) + 1;
    const speed = Number($('sr-speed').value);
    const delay = humans.length ? Math.max(speed || 140, 120) : speed;
    const base = Math.floor(Math.random() * 1e6);
    const series = {
      n: 0, entries, fighters: entries.map(entry => entry.id),
      wins: Object.fromEntries(entries.map(entry => [entry.id, 0])),
    };
    try {
      humans.forEach(player => {
        player.input = ArenaInput.create(player.scheme);
        player.enabled = false;
        player.input.enable(false);
        activeHumans.push(player);
        if (player.id === 'player-1') player.input.attachPad($('sr-pad'));
      });
      activeSeats = entries;
      setRunning(true);
      while (!entries.some(entry => series.wins[entry.id] >= need) &&
             series.n < bestOf + 4 && my === token) {
        const completed = await playOne(entries, base + series.n, delay, series, my);
        if (!completed || my !== token) return;
        const { placements, startupNotice } = completed;
        const winners = placements.filter(placement => placement.place === 1);
        const tied = winners.length !== 1;
        if (!tied) series.wins[winners[0].id]++;
        series.n++;
        cards(placements, series, true);
        const winner = tied ? null : entries.find(entry => entry.id === winners[0].id);
        const gameNotice = tied ? `Game ${series.n}: draw` :
          `Game ${series.n}: ${winner.name} wins`;
        $('sr-ticker').textContent = [startupNotice, gameNotice].filter(Boolean).join(' · ');
        if (bestOf > 1 && my === token) await sleep(delay ? 1200 : 0);
      }
      if (my !== token) return;
      result.textContent = verdict(series, bestOf);
      result.hidden = false;
    } catch (error) {
      if (my === token) {
        $('sr-ticker').textContent = 'The match could not be completed. Please try again.';
        console.error('snake-royale: match failed', error);
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
      const ids = new Set();
      for (const bot of payload.bots) {
        if (!bot || typeof bot.id !== 'string' ||
            !/^[a-z0-9][a-z0-9.-]*$/.test(bot.id) || bot.id.includes('..') ||
            ids.has(bot.id) || PLAYERS.some(player => player.id === bot.id) ||
            typeof bot.name !== 'string' || typeof bot.lab !== 'string' ||
            !/^#[0-9a-f]{6}$/i.test(bot.color) ||
            !Number.isFinite(bot.bytes) || bot.bytes < 0 ||
            (bot.note != null && typeof bot.note !== 'string')) {
          throw new Error('Invalid fighter roster entry');
        }
        ids.add(bot.id);
      }
    } catch (error) {
      $('sr-ticker').textContent =
        'The fighters could not be loaded. Check your connection and reload the page.';
      ['sr-fight', 'sr-random', 'sr-add', 'sr-a', 'sr-b', 'sr-p1', 'sr-p2']
        .forEach(id => { $(id).disabled = true; });
      console.error('snake-royale: bots.json failed to load', error);
      return;
    }
    BOTS = payload.bots;
    BOTS.forEach(bot => { byId[bot.id] = bot; });
    fill($('sr-a'));
    fill($('sr-b'));
    roster();
    const query = new URLSearchParams(location.search);
    $('sr-a').value = byId[query.get('a')] ? query.get('a') :
      (byId.opus ? 'opus' : BOTS[0].id);
    $('sr-b').value = byId[query.get('b')] ? query.get('b') :
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
    const entries = selectedSeats(), fighters = entries.map(entry => entry.id);
    const preview = SnakeEngine.create(fighters, { seed: 1 });
    const colors = Object.fromEntries(entries.map(entry => [entry.id, entry.color]));
    draw(preview, colors, fighters, Number($('sr-speed').value));
    cards(view(preview), {
      entries, fighters, wins: Object.fromEntries(fighters.map(id => [id, 0])),
    });
    if (query.get('autostart') === '1') fight();
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
    bots: BOTS.length, running,
    fighters: [$('sr-a').value, $('sr-b').value],
    ticker: $('sr-ticker').textContent,
    result: $('sr-result').hidden ? null : $('sr-result').textContent,
    cards: [...document.querySelectorAll('#sr-cards .sr-card')].map(card => card.textContent),
    seats: (running && activeSeats ? activeSeats : selectedSeats()).map(entry => entry.id),
    mode: $('sr-mode').textContent,
  });
  init();
})();
