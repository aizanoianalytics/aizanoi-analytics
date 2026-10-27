(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const TEAMS = ['west', 'east'];
  const COLORS = { west: '#e8875b', east: '#22d3ee' };
  const TITLES = { west: 'West', east: 'East' };
  const PLAYERS = {
    p1: { name: 'Player 1', label: 'Player 1 (WASD)', scheme: 'wasd' },
    p2: { name: 'Player 2', label: 'Player 2 (arrows)', scheme: 'arrows' },
  };
  const renderer = FlagRenderer.create($('cf-canvas'));
  const coarse = window.matchMedia('(pointer: coarse)');

  let bots = [];
  let byId = Object.create(null);
  let ready = false;
  let running = false;
  let token = 0;
  let activeRun = null;
  let activeHumans = [];
  let controller = null;
  let displayedSeats = [];
  let lastGame = null;
  let lastScore = { west: 0, east: 0 };

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function selects(team) {
    return [...$(`cf-${team}`).querySelectorAll('.cf-seat select')];
  }
  function values(team) {
    return selects(team).map(select => select.value);
  }
  function fallbackBot() {
    return byId['sample-squad'] ? 'sample-squad' : bots[0].id;
  }
  function firstBot(team) {
    return values(team).find(value => byId[value]) || fallbackBot();
  }
  function selectedSeats() {
    return TEAMS.flatMap(team => values(team).map((value, index) => {
      const player = PLAYERS[value];
      return {
        id: `${team === 'west' ? 'w' : 'e'}${index + 1}`,
        team, choice: value,
        name: player ? player.name : byId[value].name,
        human: Boolean(player), scheme: player ? player.scheme : null,
        botId: player ? null : value, origin: team,
      };
    }));
  }
  function fill(select) {
    Object.entries(PLAYERS).forEach(([id, player]) => {
      select.appendChild(new Option(player.label, id));
    });
    bots.forEach(bot => {
      select.appendChild(new Option(`${bot.name} · ${bot.lab}`, bot.id));
    });
  }
  function addSeat(team, choice, refresh = true) {
    if (selects(team).length >= 4) return;
    const row = element('div', 'cf-seat');
    const label = element('label', 'cf-seat-label');
    const text = element('span', 'cf-seat-number');
    const select = element('select');
    fill(select);
    select.value = PLAYERS[choice] || byId[choice] ? choice : fallbackBot();
    label.append(text, select);
    const remove = element('button', 'cf-remove', '×');
    remove.type = 'button';
    remove.addEventListener('click', () => {
      if (running || selects(team).length <= 1) return;
      row.remove();
      syncControls(true);
    });
    select.addEventListener('change', () => syncControls(true));
    row.append(label, remove);
    $(`cf-${team}`).appendChild(row);
    if (refresh) syncControls(true);
  }
  function replaceTeam(team, choices) {
    $(`cf-${team}`).replaceChildren();
    choices.slice(0, 4).forEach(choice => addSeat(team, choice, false));
  }
  function resizeTeams(size) {
    TEAMS.forEach(team => {
      const choice = firstBot(team);
      while (selects(team).length < size) addSeat(team, choice, false);
      while (selects(team).length > size) $(`cf-${team}`).lastElementChild.remove();
    });
    syncControls(true);
  }
  function teamTitle(team) {
    const choices = values(team);
    const same = choices.length && byId[choices[0]] &&
      choices.every(choice => choice === choices[0]);
    return same ? `${TITLES[team]} · Team ${byId[choices[0]].name}` : TITLES[team];
  }

  function syncPad() {
    const humans = running ? activeHumans : selectedSeats().filter(seat => seat.human);
    const selector = $('cf-touch-player');
    const choices = humans.map(seat => seat.choice);
    const signature = choices.join(',');
    if (selector.dataset.choices !== signature) {
      const prior = selector.value;
      selector.replaceChildren(...humans.map(seat =>
        new Option(PLAYERS[seat.choice].name, seat.choice)));
      selector.value = choices.includes(prior) ? prior : (choices[0] || '');
      selector.dataset.choices = signature;
    }
    $('cf-pad').hidden = !(coarse.matches && humans.length);
    const player = activeHumans.find(seat => seat.choice === selector.value);
    const agent = player && lastGame &&
      lastGame.agents().find(item => item.id === player.id);
    selector.disabled = humans.length < 2;
    $('cf-pad').querySelectorAll('button').forEach(button => {
      button.disabled = !running || !player || !agent ||
        agent.jailed || agent.respawnIn > 0 || !player.enabled;
    });
    $('cf-pad').setAttribute('aria-label',
      `${PLAYERS[selector.value] ? PLAYERS[selector.value].name : 'Human'} direction controls`);
  }

  function syncControls(preview = false) {
    if (!ready) return;
    const seats = selectedSeats();
    const humans = seats.filter(seat => seat.human);
    const used = new Set(humans.map(seat => seat.choice));
    if (humans.length && $('cf-speed').value === '0') $('cf-speed').value = '130';
    [...$('cf-speed').options].forEach(option => {
      option.disabled = option.value === '0' && humans.length > 0;
    });
    TEAMS.forEach(team => {
      const rows = [...$(`cf-${team}`).children];
      rows.forEach((row, index) => {
        row.querySelector('.cf-seat-number').textContent = `Seat ${index + 1}`;
        const select = row.querySelector('select');
        select.disabled = running;
        select.setAttribute('aria-label', `${TITLES[team]} seat ${index + 1}`);
        [...select.options].forEach(option => {
          option.disabled = Boolean(PLAYERS[option.value] &&
            used.has(option.value) && select.value !== option.value);
        });
        const remove = row.querySelector('button');
        remove.disabled = running || rows.length <= 1;
        remove.setAttribute('aria-label', `Remove ${TITLES[team]} seat ${index + 1}`);
      });
      $(`cf-add-${team}`).disabled = running || rows.length >= 4;
      $(`cf-${team}-title`).textContent = teamTitle(team);
    });
    const westSize = selects('west').length;
    const eastSize = selects('east').length;
    $('cf-size').value = westSize === eastSize ? String(westSize) : '';
    ['cf-size', 'cf-speed', 'cf-series', 'cf-random', 'cf-start'].forEach(id => {
      $(id).disabled = running;
    });
    $('cf-start').textContent = running ? 'Playing…' : 'Start';
    syncPad();
    if (preview && !running) showPreview();
  }

  function scoreOf(game) {
    const first = game.agents()[0];
    if (!first) return { west: 0, east: 0 };
    const score = game.botState(first.id).score;
    return { west: score.west, east: score.east };
  }
  function statusOf(agent) {
    if (agent.respawnIn > 0) return `respawning in ${agent.respawnIn}`;
    if (agent.jailed) return `in jail · ${40 - agent.jailTicks} ticks left`;
    if (agent.carrying) return 'carrying flag';
    return 'active';
  }
  function paintCards(game) {
    const cards = game.agents().map(agent => {
      const card = element('div', `cf-card cf-card-${agent.team}`);
      card.dataset.agent = agent.id;
      card.style.setProperty('--team-color', COLORS[agent.team]);
      card.append(
        element('b', null, `${agent.id.toUpperCase()} · ${agent.name}`),
        element('small', null, `${agent.tags} tags · ${agent.captures} captures`),
        element('span', 'cf-status', statusOf(agent)),
      );
      return card;
    });
    $('cf-cards').replaceChildren(...cards);
  }
  function paint(game, seats, duration) {
    lastGame = game;
    displayedSeats = seats;
    lastScore = scoreOf(game);
    renderer.update(game, COLORS, { duration });
    $('cf-score').textContent = `WEST ${lastScore.west} – ${lastScore.east} EAST`;
    $('cf-tick').textContent = `TICK ${game.tick} / 1200`;
    paintCards(game);
    syncPad();
  }
  function showPreview() {
    const seats = selectedSeats();
    const game = FlagEngine.create(
      seats.map(({ id, team, name }) => ({ id, team, name })),
      { seed: 1, width: 33, height: 21, maxTicks: 1200, capturesToWin: 3 },
    );
    $('cf-result').hidden = true;
    $('cf-result').textContent = '';
    $('cf-ticker').textContent = 'Ready · First to 3 captures';
    $('cf-series-tally').textContent = '';
    paint(game, seats, 0);
  }
  function randomTeams() {
    TEAMS.forEach(team => {
      const bot = bots[Math.floor(Math.random() * bots.length)];
      selects(team).forEach(select => { select.value = bot.id; });
    });
    syncControls(true);
  }
  function renderRoster() {
    const items = bots.map(bot => {
      const item = element('li');
      item.style.setProperty('--bot-color', bot.color);
      item.append(
        element('b', null, bot.name),
        element('small', null, `${bot.lab} · bot “${bot.botName || bot.id}”`),
        element('small', null, bot.note),
      );
      return item;
    });
    $('cf-list').replaceChildren(...items);
  }
  function sleep(ms, signal) {
    if (signal.aborted) return Promise.resolve(false);
    return new Promise(resolve => {
      let timer;
      const finish = value => {
        clearTimeout(timer);
        signal.removeEventListener('abort', cancel);
        resolve(value);
      };
      const cancel = () => finish(false);
      signal.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(() => finish(true), ms);
    });
  }
  function enableHumans(enabled) {
    activeHumans.forEach(seat => {
      const agent = lastGame && lastGame.agents().find(item => item.id === seat.id);
      seat.enabled = Boolean(enabled && agent && !agent.jailed && !agent.respawnIn);
      seat.input.enable(seat.enabled);
    });
    syncPad();
  }
  function cleanup() {
    if (controller) controller.abort();
    controller = null;
    if (activeRun) activeRun.stop();
    activeRun = null;
    activeHumans.forEach(seat => seat.input.destroy());
    activeHumans = [];
  }
  async function countdown(signal) {
    for (let number = 3; number > 0; number--) {
      $('cf-ticker').textContent = `${number}…`;
      if (!await sleep(1000, signal)) return false;
    }
    $('cf-ticker').textContent = 'Go!';
    return true;
  }

  function announce(events, before, after) {
    const names = new Map([...before, ...after].map(a =>
      [a.id, `${String(a.id).toUpperCase()} · ${a.name}`]));
    const name = id => names.get(id) || String(id);
    const messages = events.map(event => {
      switch (event.type) {
        case 'tag': return `${name(event.by)} tagged ${name(event.id)}`;
        case 'pickup': return `${name(event.id)} grabbed the ${TITLES[event.flag]} flag`;
        case 'capture': return `${TITLES[event.team]} captures! ${name(event.id)}`;
        case 'free': return `${name(event.by)} freed ${event.ids.length} ${TITLES[event.team]} teammate${event.ids.length === 1 ? '' : 's'}`;
        case 'release': return event.automatic
          ? `${name(event.id)} served jail time`
          : `${name(event.id)} respawned`;
        case 'drop': return `${TITLES[event.flag]} flag returned to its stand`;
        default: return '';
      }
    }).filter(Boolean);
    if (messages.length) $('cf-ticker').textContent = messages.join(' · ');
  }

  function roundSeats(entries, swapped) {
    const counters = { west: 0, east: 0 };
    return entries.map(entry => {
      const team = swapped ? (entry.origin === 'west' ? 'east' : 'west') : entry.origin;
      counters[team]++;
      return { ...entry, team, id: `${team === 'west' ? 'w' : 'e'}${counters[team]}` };
    });
  }
  async function playOne(entries, seed, delay, signal) {
    let run = null;
    try {
      activeHumans = [];
      entries.forEach(seat => {
        if (!seat.human) return;
        seat.input = ArenaInput.create(seat.scheme);
        seat.enabled = false;
        seat.pad = $('cf-pad');
        seat.touchSelected = () => $('cf-touch-player').value === seat.choice;
        activeHumans.push(seat);
      });
      run = FlagRunner.start(entries, {
        seed, width: 33, height: 21, maxTicks: 1200, capturesToWin: 3,
      });
      activeRun = run;
      await run.loaded;
      if (signal.aborted) return null;
      paint(run.game, entries, 0);
      if (activeHumans.length) {
        if (!await countdown(signal)) return null;
        enableHumans(true);
      } else {
        $('cf-ticker').textContent = 'Go!';
      }
      while (!run.game.finished() && !signal.aborted) {
        const started = performance.now();
        const before = run.game.agents();
        const events = await run.turn();
        if (signal.aborted) return null;
        announce(events, before, run.game.agents());
        paint(run.game, entries, delay);
        enableHumans(true);
        if (delay && !run.game.finished()) {
          if (!await sleep(Math.max(0, delay - (performance.now() - started)), signal)) return null;
        }
      }
      return signal.aborted ? null : run.game.result();
    } finally {
      enableHumans(false);
      if (run) run.stop();
      activeHumans.forEach(seat => seat.input.destroy());
      activeHumans = [];
      if (activeRun === run) activeRun = null;
      syncPad();
    }
  }
  function matchVerdict(result) {
    const score = `${result.score.west}–${result.score.east}`;
    if (!result.winner) return `Draw ${score}`;
    return `${TITLES[result.winner]} wins ${score}${result.score.west === result.score.east ? ' on tags' : ''}`;
  }
  function seriesTally(wins, draws, played, total) {
    return `Series ${played} / ${total} · West lineup ${wins.west} – ` +
      `${wins.east} East lineup · ${draws} ${draws === 1 ? 'draw' : 'draws'}`;
  }
  async function start() {
    if (!ready || running) return;
    const entries = selectedSeats();
    const humans = entries.filter(seat => seat.human);
    if (new Set(humans.map(seat => seat.choice)).size !== humans.length) {
      $('cf-ticker').textContent = 'Each player may occupy only one seat.';
      return;
    }
    const my = ++token;
    cleanup();
    const session = new AbortController();
    controller = session;
    const signal = session.signal;
    const total = Number($('cf-series').value);
    const requestedDelay = Number($('cf-speed').value);
    const delay = humans.length && requestedDelay === 0 ? 130 : requestedDelay;
    const seed = Math.floor(Math.random() * 4294967296);
    const wins = { west: 0, east: 0 };
    let draws = 0;
    let lastResult = null;
    $('cf-result').hidden = true;
    $('cf-result').textContent = '';
    $('cf-ticker').textContent = 'Loading teams…';
    $('cf-series-tally').textContent = '';
    running = true;
    syncControls();
    try {
      for (let index = 0; index < total; index++) {
        if (signal.aborted) return;
        const swapped = index % 2 === 1;
        lastResult = await playOne(
          roundSeats(entries, swapped),
          (seed + Math.floor(index / 2)) >>> 0, delay, signal,
        );
        if (!lastResult || signal.aborted || my !== token) return;
        if (lastResult.winner) {
          const origin = swapped
            ? (lastResult.winner === 'west' ? 'east' : 'west') : lastResult.winner;
          wins[origin]++;
        } else draws++;
        $('cf-ticker').textContent = `Game ${index + 1}: ${matchVerdict(lastResult)}`;
        $('cf-series-tally').textContent = seriesTally(wins, draws, index + 1, total);
        if (index + 1 < total && delay && !await sleep(1000, signal)) return;
      }
      if (my !== token || signal.aborted) return;
      let verdict = matchVerdict(lastResult);
      if (total > 1) {
        verdict = wins.west === wins.east
          ? `Draw series ${wins.west}–${wins.east}`
          : `${wins.west > wins.east ? 'West' : 'East'} lineup wins series ${wins.west}–${wins.east}`;
      }
      $('cf-result').textContent = verdict;
      $('cf-result').hidden = false;
    } catch (error) {
      if (my === token && !signal.aborted) {
        $('cf-ticker').textContent = 'The match could not be completed. Please try again.';
        console.error('capture-flag: match failed', error);
      }
    } finally {
      if (my === token) {
        cleanup();
        running = false;
        syncControls();
      }
    }
  }
  function queryTeam(query, team, defaults, claimed) {
    const raw = query.get(team);
    const choices = raw === null ? defaults : raw.split(',').slice(0, 4);
    return (choices.length ? choices : defaults).map(value => {
      if (byId[value]) return value;
      if (PLAYERS[value] && !claimed.has(value)) {
        claimed.add(value);
        return value;
      }
      return fallbackBot();
    });
  }

  async function init() {
    try {
      const response = await fetch('bots.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.version !== 1 || !Array.isArray(payload.bots) || !payload.bots.length) {
        throw new Error('Invalid bot roster');
      }
      const ids = new Set();
      payload.bots.forEach(bot => {
        if (!bot || !/^[a-z0-9][a-z0-9.-]*$/.test(bot.id) ||
            bot.id.includes('..') || ids.has(bot.id) || PLAYERS[bot.id] ||
            typeof bot.name !== 'string' || typeof bot.lab !== 'string' ||
            typeof bot.note !== 'string' || !/^#[a-f0-9]{6}$/i.test(bot.color) ||
            bot.file !== `bots/${bot.id}.js`) {
          throw new Error('Invalid bot entry');
        }
        ids.add(bot.id);
      });
      bots = payload.bots;
      byId = Object.create(null);
      bots.forEach(bot => { byId[bot.id] = bot; });
      const query = new URLSearchParams(location.search);
      const claimed = new Set();
      replaceTeam('west', queryTeam(query, 'west', ['p1', fallbackBot()], claimed));
      replaceTeam('east', queryTeam(query, 'east', [fallbackBot(), fallbackBot()], claimed));
      renderRoster();
      ready = true;
      $('cf-form').addEventListener('submit', event => {
        event.preventDefault();
        start();
      });
      TEAMS.forEach(team => {
        $(`cf-add-${team}`).addEventListener('click', () => addSeat(team, firstBot(team)));
      });
      $('cf-size').addEventListener('change', () => {
        const size = Number($('cf-size').value);
        if (size >= 1 && size <= 4) resizeTeams(size);
      });
      $('cf-speed').addEventListener('change', () => syncControls());
      $('cf-touch-player').addEventListener('change', syncPad);
      $('cf-random').addEventListener('click', randomTeams);
      syncControls(true);
      if (query.get('autostart') === '1') start();
    } catch (error) {
      ready = false;
      ['cf-start', 'cf-random', 'cf-add-west', 'cf-add-east'].forEach(id => {
        $(id).disabled = true;
      });
      $('cf-ticker').textContent = 'The teams could not be loaded. Check your connection and reload the page.';
      console.error('capture-flag: initialization failed', error);
    }
  }

  coarse.addEventListener('change', syncPad);
  window.addEventListener('pagehide', event => {
    token++;
    cleanup();
    running = false;
    if (ready) syncControls();
    if (!event.persisted) {
      coarse.removeEventListener('change', syncPad);
      renderer.destroy();
    }
  });
  window.__CAPTURE_FLAG__ = () => ({
    bots: bots.length, running,
    seats: displayedSeats.map(seat => ({
      team: seat.team, kind: seat.human ? 'human' : 'bot', id: seat.id,
    })),
    tick: lastGame ? lastGame.tick : 0,
    score: { ...lastScore },
    ticker: $('cf-ticker').textContent,
    result: $('cf-result').hidden ? null : $('cf-result').textContent,
    cards: [...document.querySelectorAll('#cf-cards .cf-card')].map(card => card.textContent),
  });
  init();
})();
