(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const renderer = MazeRenderer.create($('mc-canvas'));
  const coarse = window.matchMedia('(pointer: coarse)');
  const PALETTES = {
    runner: ['#ffd84d', '#e8875b', '#ff6fb5', '#f4f6fb'],
    ghost: ['#ff4d4d', '#22d3ee', '#c99bff', '#10c08e', '#ffa94d', '#9fb3d1'],
  };
  const LIMITS = { runner: 4, ghost: 6 };
  const LISTS = { runner: 'mc-runners', ghost: 'mc-ghosts' };
  const PLAYERS = {
    p1: { name: 'Player 1', label: 'Player 1 (WASD)', scheme: 'wasd' },
    p2: { name: 'Player 2', label: 'Player 2 (arrows)', scheme: 'arrows' },
  };
  const waits = new Set();
  const previousChoices = new WeakMap();
  const tally = { runners: 0, ghosts: 0 };
  let bots = [];
  let byId = Object.create(null);
  let ready = false;
  let running = false;
  let picking = false;
  let customBot = null;
  let token = 0;
  let activeRun = null;
  let activeSeats = null;
  let activeHumans = [];
  let lastGame = null;
  let inputEnabled = false;
  let initialized = false;
  let pageGone = false;
  let loadController = null;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function selects(role) {
    return [...$(LISTS[role]).querySelectorAll('select')];
  }

  function allSeatSelects() {
    return ['runner', 'ghost'].flatMap(selects);
  }

  function selectedSeats() {
    return ['runner', 'ghost'].flatMap(role => selects(role).map((select, index) => {
      const player = PLAYERS[select.value];
      const custom = select.value === 'custom' && customBot;
      const bot = byId[select.value];
      return {
        id: `${role === 'runner' ? 'r' : 'g'}${index + 1}`,
        role,
        name: player ? player.name : custom ? custom.name : (bot ? bot.name : 'Unknown bot'),
        color: PALETTES[role][index],
        human: Boolean(player),
        playerId: player ? select.value : null,
        scheme: player ? player.scheme : null,
        botId: custom ? 'custom' : (bot ? bot.id : null),
        ...(custom ? {
          lab: 'You',
          custom: { name: custom.name, code: custom.code },
        } : {}),
      };
    }));
  }

  function duplicatePlayer(entries) {
    const used = new Set();
    for (const entry of entries) {
      if (!entry.human) continue;
      if (used.has(entry.playerId)) return entry.name;
      used.add(entry.playerId);
    }
    return null;
  }

  function padOwner(entries) {
    return entries.find(entry => entry.playerId === 'p1') ||
      entries.find(entry => entry.playerId === 'p2') || null;
  }

  function syncPad() {
    const entries = running && activeSeats ? activeSeats : selectedSeats();
    const owner = padOwner(entries);
    $('mc-pad').hidden = !(coarse.matches && owner);
    $('mc-pad').setAttribute('aria-label',
      `${owner ? owner.name : 'Player'} direction controls`);
    $('mc-pad').querySelectorAll('button').forEach(button => {
      button.disabled = !running || !inputEnabled || !owner;
    });
  }

  function syncControls() {
    ['runner', 'ghost'].forEach(role => {
      const rows = [...$(LISTS[role]).children];
      rows.forEach((row, index) => {
        row.style.setProperty('--seat-color', PALETTES[role][index]);
        row.querySelector('select').disabled = !ready || running || picking;
        row.querySelector('select').setAttribute('aria-label',
          `${role === 'runner' ? 'Runner' : 'Ghost'} ${index + 1}`);
        row.querySelector('button').disabled = !ready || running || picking || rows.length <= 1;
        row.querySelector('button').setAttribute('aria-label', `Remove ${role} ${index + 1}`);
      });
      $(`mc-add-${role}`).disabled = !ready || running || picking || rows.length >= LIMITS[role];
    });
    ['mc-layout', 'mc-speed', 'mc-series'].forEach(id => {
      $(id).disabled = running || picking;
    });
    $('mc-random').disabled = !ready || running || picking;
    $('mc-start').disabled = !ready || running || picking;
    $('mc-start').textContent = running ? 'Playing…' : 'Start';
    syncPad();
  }

  function updateCustomOptions() {
    allSeatSelects().forEach(select => {
      const option = [...select.options].find(entry => entry.value === 'custom');
      if (option) {
        option.textContent = customBot
          ? `Your bot: ${customBot.name}`
          : 'Your bot (upload…)';
      }
    });
  }

  async function chooseSeat(event) {
    const select = event.currentTarget;
    const previous = previousChoices.get(select) || bots[0].id;
    if (running || picking || pageGone) {
      select.value = previous;
      return;
    }
    if (select.value !== 'custom') {
      previousChoices.set(select, select.value);
      selectionChanged();
      return;
    }

    picking = true;
    syncControls();
    let errorMessage = '';
    try {
      // Call before the first await to preserve the selecting user gesture.
      const chosen = await ArenaCustomBot.pick({ game: 'maze-chase' });
      if (pageGone) {
        select.value = previous;
        return;
      }
      if (chosen) {
        customBot = chosen;
        previousChoices.set(select, 'custom');
        updateCustomOptions();
      } else {
        select.value = previous;
      }
    } catch (error) {
      select.value = previous;
      errorMessage = String((error && error.message) || 'Could not read bot file');
    } finally {
      picking = false;
      if (!pageGone) {
        selectionChanged();
        if (errorMessage) $('mc-ticker').textContent = errorMessage;
      }
    }
  }

  function addSeat(role, value) {
    if (selects(role).length >= LIMITS[role]) return;
    const row = element('li', 'mc-seat');
    const select = element('select');
    Object.entries(PLAYERS).forEach(([id, player]) => {
      select.appendChild(new Option(player.label, id));
    });
    const custom = $('mc-custom-option').content.firstElementChild.cloneNode(true);
    if (customBot) custom.textContent = `Your bot: ${customBot.name}`;
    select.appendChild(custom);
    bots.forEach(bot => {
      select.appendChild(new Option(`${bot.name} · ${bot.lab}`, bot.id));
    });
    select.value = value && (PLAYERS[value] || byId[value] ||
      (value === 'custom' && customBot)) ? value : bots[0].id;
    previousChoices.set(select, select.value);
    const remove = element('button', 'mc-remove', '×');
    remove.type = 'button';
    remove.addEventListener('click', () => {
      if (running || picking || selects(role).length <= 1) return;
      row.remove();
      selectionChanged();
    });
    select.addEventListener('change', chooseSeat);
    row.append(select, remove);
    $(LISTS[role]).appendChild(row);
  }

  function stateFor(game) {
    const agents = game.agents();
    return agents.length ? game.botState(agents[0].id) : null;
  }

  function drawCards(game, entries) {
    const fragment = document.createDocumentFragment();
    game.agents().forEach(agent => {
      const entry = entries.find(seat => seat.id === agent.id);
      const card = element('div', 'mc-card');
      if (!agent.alive && agent.lives === 0) card.classList.add('mc-out');
      card.style.setProperty('--seat-color', entry ? entry.color : '#f4f6fb');
      card.dataset.seat = agent.id;
      card.appendChild(element('span', 'mc-badge', `${agent.id.toUpperCase()} · ${agent.role.toUpperCase()}`));
      card.appendChild(element('b', null, entry ? entry.name : agent.name));
      if (entry && entry.custom) card.appendChild(element('small', null, entry.lab));
      card.appendChild(element('span', 'mc-score', `Score ${agent.score}`));
      if (agent.role === 'runner') {
        const lives = Math.max(0, Math.min(3, agent.lives));
        const status = agent.respawnIn > 0 ? ` · Respawn in ${agent.respawnIn}` :
          !agent.alive ? ' · Out' : agent.invulnerable ? ' · Protected' : '';
        const lifeLine = element('small', null,
          `Lives ${'♥'.repeat(lives)}${'♡'.repeat(3 - lives)}${status}`);
        lifeLine.setAttribute('aria-label', `${lives} lives remaining${status}`);
        card.appendChild(lifeLine);
      } else {
        const status = agent.inPen
          ? (agent.releaseIn > 0 ? ` · Release in ${agent.releaseIn}` : ' · In pen')
          : agent.frightened ? ' · Frightened' : ' · Hunting';
        card.appendChild(element('small', null, `Catches ${agent.catches}${status}`));
      }
      fragment.appendChild(card);
    });
    $('mc-cards').replaceChildren(fragment);
  }

  function draw(game, entries, duration) {
    lastGame = game;
    renderer.update(game, Object.fromEntries(entries.map(entry => [entry.id, entry.color])), { duration });
    const state = stateFor(game);
    $('mc-tick').textContent = `TICK ${game.tick} / ${state ? state.maxTicks : 1500}`;
    $('mc-pellets').textContent = `PELLETS ${state ? state.pellets : 0}`;
    const fright = state ? state.frightTicksLeft : 0;
    $('mc-fright').hidden = fright <= 0;
    $('mc-fright').textContent = `FRIGHT ${fright}t · ${(fright * 0.12).toFixed(1)}s @ Normal`;
    drawCards(game, entries);
  }

  function preview() {
    if (!ready || running) return;
    const entries = selectedSeats();
    const game = MazeEngine.create(entries.map(({ id, role, name }) => ({ id, role, name })), {
      seed: 1, layout: $('mc-layout').value, maxTicks: 1500, frightTicks: 60,
    });
    draw(game, entries, 0);
  }

  function selectionChanged() {
    if (running || picking || pageGone) return;
    const duplicate = duplicatePlayer(selectedSeats());
    $('mc-ticker').textContent = duplicate
      ? `${duplicate} may occupy only one seat.` : 'Choose your teams, then press Start.';
    $('mc-result').hidden = true;
    syncControls();
    preview();
  }

  function randomBots() {
    if (running || picking || !bots.length) return;
    ['runner', 'ghost'].forEach(role => {
      selects(role).forEach(select => {
        if (!PLAYERS[select.value]) select.value = bots[Math.floor(Math.random() * bots.length)].id;
        previousChoices.set(select, select.value);
      });
    });
    selectionChanged();
  }

  function roster() {
    $('mc-list').replaceChildren();
    bots.forEach(bot => {
      const item = element('li');
      item.style.setProperty('--bot-color', bot.color);
      item.appendChild(element('b', null, bot.name));
      item.appendChild(element('small', null,
        `${bot.lab} · bot “${bot.botName || bot.id}” · ${(bot.bytes / 1024).toFixed(1)} KB`));
      if (bot.note) item.appendChild(element('small', null, bot.note));
      $('mc-list').appendChild(item);
    });
  }

  function sleep(milliseconds) {
    return new Promise(resolve => {
      let timer;
      const cancel = () => {
        clearTimeout(timer);
        waits.delete(cancel);
        resolve(false);
      };
      waits.add(cancel);
      timer = setTimeout(() => {
        waits.delete(cancel);
        resolve(true);
      }, milliseconds);
    });
  }

  function cleanup() {
    if (activeRun) activeRun.stop();
    activeRun = null;
    activeHumans.forEach(entry => entry.input.destroy());
    activeHumans = [];
    inputEnabled = false;
    [...waits].forEach(cancel => cancel());
  }

  function enableHumans(on) {
    inputEnabled = on;
    activeHumans.forEach(entry => entry.input.enable(on));
    syncPad();
  }

  async function countdown(my) {
    enableHumans(false);
    for (let number = 3; number > 0; number--) {
      if (my !== token) return false;
      $('mc-ticker').textContent = `${number}…`;
      if (!await sleep(1000)) return false;
    }
    if (my !== token) return false;
    $('mc-ticker').textContent = 'Go!';
    enableHumans(true);
    return true;
  }

  function announce(events, game) {
    const agents = game.agents();
    const name = id => agents.find(agent => agent.id === id)?.name || id;
    const messages = [];
    events.forEach(event => {
      if (event.type === 'power') messages.push(`${name(event.id)}: power pellet!`);
      if (event.type === 'fright-end') messages.push('Ghosts are hunting again.');
      if (event.type === 'catch') messages.push(`${name(event.by)} caught ${name(event.id)}`);
      if (event.type === 'out') messages.push(`${name(event.id)} is out.`);
      if (event.type === 'respawn') messages.push(`${name(event.id)} is back.`);
      if (event.type === 'eaten') {
        messages.push(`${name(event.by)} ate ${name(event.id)}: +${event.points}`);
      }
    });
    if (messages.length) $('mc-ticker').textContent = messages.join(' · ');
  }

  function resultText(result) {
    if (result.reason === 'pellets') return 'Runners win: every pellet eaten';
    if (result.reason === 'caught') return 'Ghosts win: all runners caught';
    return 'Ghosts win: time ran out';
  }

  function drawTally(round, rounds) {
    $('mc-tally').textContent =
      `RUNNERS ${tally.runners} · GHOSTS ${tally.ghosts} · ROUND ${round} / ${rounds}`;
  }

  async function playRound(entries, seed, delay, my) {
    const run = MazeRunner.start(entries, {
      seed, layout: $('mc-layout').value, maxTicks: 1500, frightTicks: 60,
    });
    activeRun = run;
    try {
      await run.loaded;
      if (my !== token) return null;
      const game = run.game;
      draw(game, entries, 0);
      if (activeHumans.length && !await countdown(my)) return null;
      while (my === token && !game.finished()) {
        const started = performance.now();
        const events = await run.turn();
        if (my !== token) return null;
        announce(events, game);
        draw(game, entries, delay);
        if (delay > 0) {
          if (!await sleep(Math.max(0, delay - (performance.now() - started)))) return null;
        } else if (game.tick % 12 === 0) {
          if (!await sleep(0)) return null;
        }
      }
      return my === token ? game.result() : null;
    } finally {
      run.stop();
      if (activeRun === run) activeRun = null;
      if (my === token) enableHumans(false);
    }
  }

  async function start() {
    if (!ready || running || picking || pageGone) return;
    if (allSeatSelects().some(select => select.value === 'custom') && !customBot) {
      $('mc-ticker').textContent = 'Choose Your bot (upload…) and load a JavaScript bot first.';
      return;
    }
    const entries = selectedSeats();
    const duplicate = duplicatePlayer(entries);
    if (duplicate) {
      $('mc-ticker').textContent = `${duplicate} may occupy only one seat.`;
      return;
    }
    if (!entries.some(entry => entry.role === 'runner') ||
        !entries.some(entry => entry.role === 'ghost') ||
        entries.some(entry => !entry.human && !entry.botId && !entry.custom)) {
      $('mc-ticker').textContent = 'Choose at least one runner and one ghost.';
      return;
    }
    const my = ++token;
    cleanup();
    const humans = entries.filter(entry => entry.human);
    const speed = Number($('mc-speed').value);
    const delay = humans.length && speed === 0 ? 120 : speed;
    const rounds = Number($('mc-series').value);
    const seedData = new Uint32Array(1);
    crypto.getRandomValues(seedData);
    const baseSeed = seedData[0];
    tally.runners = 0;
    tally.ghosts = 0;
    $('mc-result').hidden = true;
    $('mc-ticker').textContent = 'Loading bots…';
    activeSeats = entries;
    running = true;
    syncControls();
    try {
      const owner = padOwner(entries);
      humans.forEach(entry => {
        entry.input = ArenaInput.create(entry.scheme);
        activeHumans.push(entry);
        if (owner && entry.id === owner.id) entry.input.attachPad($('mc-pad'));
      });
      for (let round = 1; round <= rounds && my === token; round++) {
        drawTally(round, rounds);
        const result = await playRound(entries, (baseSeed + round - 1) >>> 0, delay, my);
        if (!result || my !== token) return;
        tally[result.winner]++;
        drawTally(round, rounds);
        $('mc-result').textContent = resultText(result);
        $('mc-result').hidden = false;
        if (round < rounds) {
          $('mc-ticker').textContent = `Round ${round} complete. Next round…`;
          if (!await sleep(delay ? 1000 : 0)) return;
          $('mc-result').hidden = true;
        }
      }
      if (my === token && rounds > 1) {
        const winner = tally.runners > tally.ghosts ? 'Runners' : 'Ghosts';
        $('mc-result').textContent +=
          ` · Series: ${winner} win ${Math.max(tally.runners, tally.ghosts)}–${Math.min(tally.runners, tally.ghosts)}`;
      }
    } catch (error) {
      if (my === token) {
        $('mc-ticker').textContent = 'The match could not be completed. Please try again.';
        console.error('maze-chase: match failed', error);
      }
    } finally {
      if (my === token) {
        cleanup();
        activeSeats = null;
        running = false;
        syncControls();
      }
    }
  }

  function queryTeam(query, role, fallback) {
    const key = role === 'runner' ? 'runners' : 'ghosts';
    if (!query.has(key)) return fallback;
    // A URL cannot provide bot code or open a picker without a user gesture.
    const ids = query.get(key).split(',').filter(id =>
      PLAYERS[id] || byId[id] || (id === 'custom' && customBot));
    return ids.length ? ids.slice(0, LIMITS[role]) : fallback;
  }

  function validBot(bot) {
    return bot && typeof bot.id === 'string' &&
      /^[a-z0-9][a-z0-9.-]*$/.test(bot.id) && !bot.id.includes('..') &&
      !PLAYERS[bot.id] && bot.id !== 'custom' && typeof bot.name === 'string' &&
      typeof bot.lab === 'string' && /^#[a-f0-9]{6}$/i.test(bot.color) &&
      bot.file === `bots/${bot.id}.js` &&
      Number.isFinite(bot.bytes) && bot.bytes >= 0;
  }

  function bindControls() {
    $('mc-form').addEventListener('submit', event => {
      event.preventDefault();
      const focused = document.activeElement;
      if (focused instanceof HTMLElement) focused.blur();
      start();
    });
    ['runner', 'ghost'].forEach(role => {
      $(`mc-add-${role}`).addEventListener('click', () => {
        if (!ready || running || picking) return;
        addSeat(role, byId['sample-hunter'] ? 'sample-hunter' : bots[0].id);
        selectionChanged();
      });
    });
    $('mc-random').addEventListener('click', randomBots);
    $('mc-layout').addEventListener('change', selectionChanged);
    coarse.addEventListener('change', syncPad);
  }

  async function init() {
    loadController = new AbortController();
    try {
      const response = await fetch('bots.json', {
        cache: 'no-cache', signal: loadController.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (pageGone) return;
      if (payload.version !== 1 || !Array.isArray(payload.bots) ||
          !payload.bots.length || !payload.bots.every(validBot) ||
          new Set(payload.bots.map(bot => bot.id)).size !== payload.bots.length) {
        throw new Error('Invalid bot roster');
      }
      bots = payload.bots.map(bot => ({ ...bot }));
      byId = Object.fromEntries(bots.map(bot => [bot.id, bot]));
      customBot = ArenaCustomBot.get('maze-chase');
      const query = new URLSearchParams(location.search);
      const fallbackGhosts = ['sample-hunter', 'sample-tactician',
        'sample-wanderer', 'sample-hunter'].map(id => byId[id] ? id : bots[0].id);
      queryTeam(query, 'runner', ['p1']).forEach(id => addSeat('runner', id));
      queryTeam(query, 'ghost', fallbackGhosts).forEach(id => addSeat('ghost', id));
      roster();
      ready = true;
      initialized = true;
      bindControls();
      selectionChanged();
      if (query.get('autostart') === '1') start();
    } catch (error) {
      if (pageGone || error.name === 'AbortError') return;
      $('mc-ticker').textContent =
        'The bots could not be loaded. Check your connection and reload the page.';
      console.error('maze-chase: roster failed', error);
    } finally {
      loadController = null;
    }
  }

  window.__MAZE_CHASE__ = () => {
    const entries = running && activeSeats ? activeSeats : selectedSeats();
    const state = lastGame ? stateFor(lastGame) : null;
    return {
      bots: bots.length, running,
      seats: entries.map(entry => ({
        role: entry.role,
        kind: entry.human ? 'human' : 'bot',
        id: entry.human ? entry.playerId : entry.botId,
      })),
      tick: lastGame ? lastGame.tick : 0,
      pellets: state ? state.pellets : 0,
      ticker: $('mc-ticker').textContent,
      result: $('mc-result').hidden ? null : $('mc-result').textContent,
      cards: [...$('mc-cards').querySelectorAll('.mc-card')].map(card => card.textContent),
    };
  };

  window.addEventListener('pagehide', event => {
    pageGone = true;
    token++;
    if (loadController) loadController.abort();
    cleanup();
    activeSeats = null;
    running = false;
    syncControls();
    if (!event.persisted) {
      coarse.removeEventListener('change', syncPad);
      renderer.destroy();
    }
  });

  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    pageGone = false;
    if (!initialized) init();
    else syncControls();
  });

  init();
})();
