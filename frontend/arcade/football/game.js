(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const renderer = FootballRenderer.create($('fb-canvas'));
  const coarse = matchMedia('(pointer: coarse)');
  const touch = { x: 0, y: 0, kick: false };
  const teams = { red: [], blue: [] };
  const controls = ['fb-size', 'fb-time', 'fb-limit', 'fb-speed', 'fb-series', 'fb-random'];
  let bots = [];
  let byId = new Map();
  let ready = false;
  let running = false;
  let picking = false;
  let customBot = null;
  let paused = false;
  let activeRun = null;
  let activeSeats = null;
  let snapshot = null;
  let cardData = [];
  let token = 0;
  let countdownTimer = null;
  let cancelCountdown = null;
  let stickPointer = null;
  let kickPointer = null;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function isEditing(target) {
    return target instanceof Element &&
      Boolean(target.closest('input, select, textarea, button, [contenteditable]:not([contenteditable="false"])'));
  }

  function firstBot(team) {
    return teams[team].find(value => byId.has(value)) || bots[0].id;
  }

  function customSeat() {
    return {
      id: 'custom',
      name: customBot.name,
      lab: 'You',
      color: '#2dd4bf',
      custom: { name: customBot.name, code: customBot.code }
    };
  }

  function selectedSeats() {
    return ['red', 'blue'].flatMap(team => teams[team].map((value, index) => {
      const human = value === 'p1' || value === 'p2';
      const bot = value === 'custom' && customBot ? customSeat() : byId.get(value);
      return {
        id: `${team === 'red' ? 'r' : 'b'}${index + 1}`,
        team,
        origin: team,
        kind: human ? 'human' : 'bot',
        human,
        keys: human ? value : null,
        botId: human ? null : value,
        name: human ? value === 'p1' ? 'Player 1' : 'Player 2' : bot.name,
        lab: human ? '' : bot.lab,
        ...(bot && bot.custom ? { custom: { ...bot.custom } } : {}),
        shortName: human ? value.toUpperCase() : `${team === 'red' ? 'R' : 'B'}${index + 1}`,
        input: value === 'p1' ? () => ({ ...touch }) : null
      };
    }));
  }

  function teamLabel(team) {
    const values = teams[team];
    if (values.length && values.every(value => value === values[0])) {
      if (values[0] === 'custom' && customBot) return `Team ${customBot.name}`;
      if (byId.has(values[0])) return `Team ${byId.get(values[0]).name}`;
    }
    return team === 'red' ? 'Red' : 'Blue';
  }

  function resetTouch() {
    touch.x = 0;
    touch.y = 0;
    touch.kick = false;
    stickPointer = null;
    kickPointer = null;
    $('fb-stick').style.setProperty('--stick-x', '0px');
    $('fb-stick').style.setProperty('--stick-y', '0px');
    $('fb-kick').classList.remove('is-down');
  }

  function syncTouch() {
    const seats = activeSeats || (ready ? selectedSeats() : []);
    const present = seats.some(seat => seat.human && seat.keys === 'p1');
    $('fb-touch').hidden = !(coarse.matches && present);
    const enabled = running && activeRun && !paused && present;
    $('fb-stick').disabled = !enabled;
    $('fb-kick').disabled = !enabled;
    if (!enabled) resetTouch();
  }

  function syncControls() {
    const human = ready && selectedSeats().some(seat => seat.human);
    if (human) $('fb-speed').value = '1';
    for (const option of $('fb-speed').options) {
      option.disabled = human && option.value !== '1';
    }
    for (const id of controls) $(id).disabled = !ready || running || picking;
    for (const team of ['red', 'blue']) {
      $(`fb-${team}-label`).textContent = teamLabel(team);
      $(`fb-add-${team}`).disabled = !ready || running || picking || teams[team].length >= 4;
      $(`fb-${team}`).querySelectorAll('select, button').forEach(node => {
        node.disabled = !ready || running || picking ||
          (node.tagName === 'BUTTON' && teams[team].length <= 1);
      });
    }
    $('fb-start').disabled = !ready || running || picking;
    $('fb-start').textContent = running ? 'Playing…' : 'Kick off';
    $('fb-pause').disabled = !running || !activeRun;
    $('fb-pause').textContent = paused ? 'Resume' : 'Pause';
    syncTouch();
  }

  function updateCustomOptions() {
    for (const team of ['red', 'blue']) {
      for (const select of $(`fb-${team}`).querySelectorAll('select')) {
        const option = [...select.options].find(entry => entry.value === 'custom');
        if (option) {
          option.textContent = customBot
            ? `Your bot: ${customBot.name}`
            : 'Your bot (upload…)';
        }
      }
    }
  }

  async function chooseSeat(event, team, index) {
    const select = event.currentTarget;
    const previous = teams[team][index];
    if (!ready || running || picking) {
      select.value = previous;
      return;
    }
    if (select.value !== 'custom') {
      teams[team][index] = select.value;
      syncControls();
      preview();
      return;
    }

    picking = true;
    syncControls();
    let errorMessage = '';
    try {
      // Invoke before the first await so the picker retains the user gesture.
      const chosen = await ArenaCustomBot.pick({ game: 'football' });
      if (chosen) {
        customBot = chosen;
        teams[team][index] = 'custom';
        updateCustomOptions();
      } else {
        select.value = previous;
      }
    } catch (error) {
      select.value = previous;
      errorMessage = String((error && error.message) || 'Could not read bot file');
    } finally {
      // The source is now in memory. Clear the retained file selection so
      // choosing the same file again emits change instead of only cancel.
      const fileInput = $('arena-custom-file');
      if (fileInput && fileInput.type === 'file') fileInput.value = '';
      picking = false;
      syncControls();
      preview();
      if (errorMessage) $('fb-ticker').textContent = errorMessage;
    }
  }

  function renderTeam(team) {
    const list = $(`fb-${team}`);
    list.replaceChildren();
    teams[team].forEach((value, index) => {
      const row = element('div', 'fb-seat');
      const label = element('label');
      label.append(element('span', 'fb-seat-label', `Seat ${index + 1}`));
      const select = element('select');
      select.setAttribute('aria-label', `${team === 'red' ? 'Red' : 'Blue'} seat ${index + 1}`);
      select.append(new Option('Player 1 (WASD + Space)', 'p1'));
      select.append(new Option('Player 2 (arrows + Enter)', 'p2'));
      select.append($('fb-custom-option').content.cloneNode(true));
      const customOption = select.querySelector('option[value="custom"]');
      if (customBot) customOption.textContent = `Your bot: ${customBot.name}`;
      bots.forEach(bot => select.append(new Option(`${bot.name} · ${bot.lab}`, bot.id)));
      select.value = value;
      select.addEventListener('change', event => chooseSeat(event, team, index));
      label.append(select);
      const remove = element('button', 'fb-remove', 'Remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove ${team} seat ${index + 1}`);
      remove.addEventListener('click', () => {
        if (!ready || running || picking || teams[team].length <= 1) return;
        teams[team].splice(index, 1);
        renderTeam(team);
        syncControls();
        preview();
      });
      row.append(label, remove);
      list.append(row);
    });
  }

  function resizeTeams(size) {
    if (!ready || running || picking) return;
    for (const team of ['red', 'blue']) {
      const fill = firstBot(team);
      teams[team] = teams[team].slice(0, size);
      while (teams[team].length < size) teams[team].push(fill);
      renderTeam(team);
    }
    syncControls();
    preview();
  }

  function clockText(seconds) {
    const value = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  }

  function drawHud(state) {
    $('fb-red-score').textContent = `RED ${state.score.red}`;
    $('fb-blue-score').textContent = `${state.score.blue} BLUE`;
    $('fb-clock').textContent = clockText(state.timeLeft);
  }

  function blankCards(seats) {
    return seats.map(seat => ({
      id: seat.id,
      team: seat.team,
      name: seat.name,
      lab: seat.lab,
      goals: 0,
      kicks: 0,
      touches: 0,
      ownGoals: 0,
      x: 0,
      y: 0,
      contact: false
    }));
  }

  function renderCards() {
    const box = $('fb-cards');
    box.replaceChildren();
    cardData.forEach(player => {
      const card = element('div', `fb-card fb-${player.team}`);
      card.dataset.id = player.id;
      card.append(element('b', null, player.name));
      if (player.lab) card.append(element('small', null, player.lab));
      card.append(element('small', null,
        `Goals ${player.goals} · Kicks ${player.kicks} · Touches ${player.touches}`));
      if (player.ownGoals) {
        card.append(element('small', null, `Own goals ${player.ownGoals}`));
      }
      box.append(card);
    });
  }

  function updateCards(state, events, result) {
    for (const card of cardData) {
      const player = state.players.find(item => item.id === card.id);
      if (!player) continue;
      card.x = player.x;
      card.y = player.y;
      const contact = Math.hypot(player.x - state.ball.x, player.y - state.ball.y) <= 25.5;
      if (contact && !card.contact && state.phase !== 'goal') card.touches++;
      card.contact = contact;
      for (const key of ['goals', 'kicks', 'touches', 'ownGoals']) {
        if (Number.isFinite(player[key])) card[key] = player[key];
      }
    }
    for (const event of events) {
      const id = event.playerId || event.id || event.player;
      const card = cardData.find(player => player.id === id);
      if (event.type === 'kick' && card &&
          !Number.isFinite(state.players.find(player => player.id === card.id)?.kicks)) {
        card.kicks++;
      }
    }
    if (result && Array.isArray(result.players)) {
      for (const player of result.players) {
        const card = cardData.find(item => item.id === player.id);
        if (!card) continue;
        for (const key of ['goals', 'kicks', 'touches', 'ownGoals']) {
          if (Number.isFinite(player[key])) card[key] = player[key];
        }
      }
    }
    renderCards();
  }

  function eventTicker(events) {
    for (const event of events) {
      if (event.type !== 'goal') continue;
      const scorerId = event.scorerId || event.scorer || event.playerId || event.player;
      const scorer = activeSeats.find(seat => seat.id === scorerId);
      const ownId = typeof event.ownGoal === 'string' ? event.ownGoal : scorerId;
      const own = activeSeats.find(seat => seat.id === ownId);
      const team = event.team || event.scoringTeam;
      const label = team === 'red' ? 'Red' : team === 'blue' ? 'Blue' : null;
      if ((event.ownGoal || event.ownGoalId) && own) {
        $('fb-ticker').textContent = `Own goal by ${own.name}`;
      } else if (scorer && label) {
        $('fb-ticker').textContent = `Goal! ${scorer.name} scores for ${label}`;
      } else {
        $('fb-ticker').textContent = label ? `Goal for ${label}!` : 'Goal!';
      }
    }
  }

  function preview() {
    if (!ready || running) return;
    const seats = selectedSeats();
    const game = FootballEngine.create(seats, {
      time: Number($('fb-time').value),
      scoreLimit: Number($('fb-limit').value)
    });
    snapshot = game.state();
    cardData = blankCards(seats);
    drawHud(snapshot);
    updateCards(snapshot, [], null);
    renderer.draw(snapshot, seats, { alpha: 1 });
  }

  function countdown(my) {
    return new Promise(resolve => {
      let number = 3;
      cancelCountdown = () => {
        clearTimeout(countdownTimer);
        countdownTimer = null;
        cancelCountdown = null;
        resolve(false);
      };
      function tick() {
        if (my !== token) {
          cancelCountdown();
          return;
        }
        if (!number) {
          countdownTimer = null;
          cancelCountdown = null;
          $('fb-countdown').hidden = true;
          $('fb-ticker').textContent = 'Play!';
          resolve(true);
          return;
        }
        $('fb-countdown').hidden = false;
        $('fb-countdown').textContent = String(number--);
        $('fb-ticker').textContent = 'Get ready';
        countdownTimer = setTimeout(tick, 1000);
      }
      tick();
    });
  }

  function cleanup() {
    if (cancelCountdown) cancelCountdown();
    $('fb-countdown').hidden = true;
    if (activeRun) activeRun.stop();
    activeRun = null;
    resetTouch();
  }

  function swapSeats(entries, swapped) {
    const counts = { red: 0, blue: 0 };
    return entries.map(entry => {
      const team = swapped ? entry.team === 'red' ? 'blue' : 'red' : entry.team;
      const number = ++counts[team];
      return {
        ...entry,
        team,
        id: `${team === 'red' ? 'r' : 'b'}${number}`,
        shortName: entry.human ? entry.keys.toUpperCase() : `${team === 'red' ? 'R' : 'B'}${number}`
      };
    });
  }

  function resultText(result) {
    const { red, blue } = result.score;
    if (!result.winner) return `Draw ${red}–${blue}`;
    return result.winner === 'red' ? `Red wins ${red}–${blue}` : `Blue wins ${blue}–${red}`;
  }

  function playMatch(seats, options, my) {
    return new Promise((resolve, reject) => {
      let run;
      try {
        run = FootballRunner.start(seats, options);
      } catch (error) {
        reject(error);
        return;
      }
      activeRun = run;
      paused = false;
      syncControls();
      run.start(frame => {
        if (my !== token) return;
        snapshot = frame.state;
        renderer.draw(frame.previous, seats, { alpha: 1 });
        renderer.draw(frame.state, seats, { alpha: frame.alpha });
        drawHud(frame.state);
        updateCards(frame.state, frame.events, frame.result);
        eventTicker(frame.events);
        if (frame.result) {
          run.stop();
          if (activeRun === run) activeRun = null;
          resolve(frame.result);
        }
      }).catch(reject);
    });
  }

  async function kickOff() {
    if (!ready || running || picking) return;
    if (['red', 'blue'].some(team => teams[team].includes('custom')) && !customBot) {
      $('fb-ticker').textContent = 'Choose Your bot (upload…) and load a JavaScript bot first.';
      return;
    }
    const entries = selectedSeats();
    const schemes = entries.filter(seat => seat.human).map(seat => seat.keys);
    if (new Set(schemes).size !== schemes.length) {
      $('fb-ticker').textContent = 'Each keyboard player can occupy only one seat.';
      return;
    }

    const my = ++token;
    cleanup();
    running = true;
    paused = false;
    activeSeats = entries;
    $('fb-result').hidden = true;
    $('fb-result').textContent = '';
    $('fb-series-tally').textContent = '';
    $('fb-ticker').textContent = '';
    syncControls();
    const count = Number($('fb-series').value);
    const wins = { red: 0, blue: 0, draws: 0 };
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];

    try {
      for (let index = 0; index < count && my === token; index++) {
        const swapped = index % 2 === 1;
        const seats = swapSeats(entries, swapped);
        activeSeats = seats;
        cardData = blankCards(seats);
        snapshot = FootballEngine.create(seats, {
          time: Number($('fb-time').value),
          scoreLimit: Number($('fb-limit').value)
        }).state();
        updateCards(snapshot, [], null);
        drawHud(snapshot);
        renderer.draw(snapshot, seats, { alpha: 1 });
        syncTouch();
        if (schemes.length && !await countdown(my)) return;

        const result = await playMatch(seats, {
          time: Number($('fb-time').value),
          scoreLimit: Number($('fb-limit').value),
          decisionEvery: 3,
          speed: schemes.length ? 1 : $('fb-speed').value,
          seed: (seed + index) >>> 0
        }, my);
        if (my !== token) return;
        const originalWinner = !result.winner ? null : swapped ?
          result.winner === 'red' ? 'blue' : 'red' : result.winner;
        if (originalWinner) wins[originalWinner]++;
        else wins.draws++;
        $('fb-result').textContent = resultText(result);
        $('fb-result').hidden = false;
        if (count > 1) {
          $('fb-series-tally').textContent =
            `Series ${index + 1}/${count} · Original Red ${wins.red} – ${wins.blue} Original Blue · Draws ${wins.draws}`;
        }
      }
    } catch (error) {
      if (my === token) {
        $('fb-ticker').textContent = 'The match could not be completed. Please try again.';
        console.error('football: match failed', error);
      }
    } finally {
      if (my === token) {
        cleanup();
        running = false;
        paused = false;
        activeSeats = null;
        syncControls();
      }
    }
  }

  function togglePause() {
    if (!running || !activeRun) return;
    paused = !paused;
    if (paused) activeRun.pause();
    else activeRun.resume();
    resetTouch();
    syncControls();
  }

  function installTouch() {
    const stick = $('fb-stick');
    const kick = $('fb-kick');

    function moveStick(event) {
      if (event.pointerId !== stickPointer) return;
      const box = stick.getBoundingClientRect();
      const dx = event.clientX - box.left - box.width / 2;
      const dy = event.clientY - box.top - box.height / 2;
      const radius = box.width / 2;
      const distance = Math.hypot(dx, dy);
      const scale = distance > radius ? radius / distance : 1;
      touch.x = dx * scale / radius;
      touch.y = dy * scale / radius;
      stick.style.setProperty('--stick-x', `${touch.x * 38}px`);
      stick.style.setProperty('--stick-y', `${touch.y * 38}px`);
    }

    stick.addEventListener('pointerdown', event => {
      if (stick.disabled || stickPointer !== null) return;
      event.preventDefault();
      stickPointer = event.pointerId;
      stick.setPointerCapture(event.pointerId);
      moveStick(event);
    });
    stick.addEventListener('pointermove', moveStick);
    const releaseStick = event => {
      if (event.pointerId !== stickPointer) return;
      stickPointer = null;
      touch.x = 0;
      touch.y = 0;
      stick.style.setProperty('--stick-x', '0px');
      stick.style.setProperty('--stick-y', '0px');
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      stick.addEventListener(type, releaseStick);
    }
    kick.addEventListener('pointerdown', event => {
      if (kick.disabled || kickPointer !== null) return;
      event.preventDefault();
      kickPointer = event.pointerId;
      kick.setPointerCapture(event.pointerId);
      touch.kick = true;
      kick.classList.add('is-down');
    });
    const releaseKick = event => {
      if (event.pointerId !== kickPointer) return;
      kickPointer = null;
      touch.kick = false;
      kick.classList.remove('is-down');
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      kick.addEventListener(type, releaseKick);
    }
    window.addEventListener('blur', resetTouch);
    document.addEventListener('visibilitychange', resetTouch);
  }

  function applyQuery() {
    const query = new URLSearchParams(location.search);
    for (const team of ['red', 'blue']) {
      // URLs cannot provide bot source or open an upload picker.
      const values = (query.get(team) || '').split(',').filter(value =>
        value === 'p1' || value === 'p2' || byId.has(value) ||
        (value === 'custom' && customBot)).slice(0, 4);
      if (values.length) teams[team] = values;
    }
    for (const key of ['time', 'limit', 'series', 'speed']) {
      const value = query.get(key);
      const select = $(`fb-${key}`);
      if (value && [...select.options].some(option => option.value === value)) {
        select.value = value;
      }
    }
    if (teams.red.length === teams.blue.length) {
      $('fb-size').value = String(teams.red.length);
    }
    return query.get('autostart') === '1';
  }

  async function init() {
    installTouch();
    $('fb-form').addEventListener('submit', event => {
      event.preventDefault();
      kickOff();
    });
    $('fb-pause').addEventListener('click', togglePause);
    document.addEventListener('keydown', event => {
      if (event.code !== 'KeyP' || event.repeat || isEditing(event.target)) return;
      if (running && activeRun) {
        event.preventDefault();
        togglePause();
      }
    });

    try {
      const response = await fetch('bots.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.version !== 1 || !Array.isArray(payload.bots) || !payload.bots.length) {
        throw new Error('Invalid bot manifest');
      }
      bots = payload.bots;
      byId = new Map();
      for (const bot of bots) {
        if (!/^[a-z0-9][a-z0-9.-]*$/.test(bot.id) || bot.id.includes('..') ||
            ['custom', 'p1', 'p2'].includes(bot.id) ||
            byId.has(bot.id) || typeof bot.name !== 'string' ||
            typeof bot.lab !== 'string' || !/^#[0-9a-f]{6}$/i.test(bot.color)) {
          throw new Error('Invalid bot entry');
        }
        byId.set(bot.id, bot);
      }
      customBot = ArenaCustomBot.get('football');
      teams.red = ['p1'];
      teams.blue = [byId.has('sample-striker') ? 'sample-striker' : bots[0].id];
      const autostart = applyQuery();
      for (const bot of bots) {
        const item = element('li');
        item.style.setProperty('--bot-color', bot.color);
        item.append(element('b', null, bot.name));
        item.append(element('small', null, `${bot.lab} · ${bot.botName || bot.id}`));
        item.append(element('small', null, bot.note));
        $('fb-list').append(item);
      }
      ready = true;
      renderTeam('red');
      renderTeam('blue');
      for (const team of ['red', 'blue']) {
        $(`fb-add-${team}`).addEventListener('click', () => {
          if (!ready || running || picking || teams[team].length >= 4) return;
          teams[team].push(firstBot(team));
          renderTeam(team);
          syncControls();
          preview();
        });
      }
      $('fb-size').addEventListener('change', () => resizeTeams(Number($('fb-size').value)));
      $('fb-time').addEventListener('change', preview);
      $('fb-limit').addEventListener('change', preview);
      $('fb-random').addEventListener('click', () => {
        if (!ready || running || picking) return;
        for (const team of ['red', 'blue']) {
          teams[team] = teams[team].map(() => bots[Math.floor(Math.random() * bots.length)].id);
          renderTeam(team);
        }
        syncControls();
        preview();
      });
      syncControls();
      preview();
      if (autostart) kickOff();
    } catch (error) {
      ready = false;
      $('fb-ticker').textContent = 'The players could not be loaded. Reload the page to try again.';
      $('fb-start').disabled = true;
      console.error('football: initialization failed', error);
    }
  }

  coarse.addEventListener('change', syncTouch);
  window.addEventListener('pagehide', event => {
    token++;
    cleanup();
    running = false;
    paused = false;
    activeSeats = null;
    syncControls();
    if (!event.persisted) renderer.destroy();
  });

  window.__FOOTBALL__ = () => ({
    bots: bots.length,
    running,
    paused,
    seats: (activeSeats || (ready ? selectedSeats() : [])).map(seat => ({
      team: seat.team,
      kind: seat.kind,
      id: seat.id,
      botId: seat.botId
    })),
    score: snapshot ? { ...snapshot.score } : { red: 0, blue: 0 },
    clock: $('fb-clock').textContent,
    timeLeft: snapshot ? snapshot.timeLeft : null,
    ticker: $('fb-ticker').textContent,
    result: $('fb-result').hidden ? null : $('fb-result').textContent,
    cards: cardData.map(({ contact, ...card }) => ({ ...card })),
    series: $('fb-series-tally').textContent
  });

  init();
})();
