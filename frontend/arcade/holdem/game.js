(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const format = value => Number(value || 0).toLocaleString('en-US');
  const renderer = HoldemTable.create($('ph-table'));
  const defaults = ['human', 'sample-equity', 'sample-tight', 'sample-caller', 'sample-equity', 'sample-tight'];
  let bots = [];
  let byId = Object.create(null);
  let ready = false;
  let running = false;
  let activeRun = null;
  let activeSeats = null;
  let generation = 0;
  let revealFor = null;
  let waitingId = null;
  let lastAction = '';
  let standings = [];
  let logs = [];
  let delayCancel = null;
  let savedErrors = {};
  const lockedNodes = new Map();

  // Keep controls adjacent to the arena, including in mobile document flow.
  $('ph-table').after($('ph-actions'));

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function selects() {
    return [...$('ph-seats').querySelectorAll('select')];
  }

  function selectedSeats() {
    let humans = 0;
    const picks = selects().map(select => select.value);
    const copies = Object.create(null);
    const label = id => picks.filter(value => value === id).length > 1
      ? ` #${copies[id] = (copies[id] || 0) + 1}` : '';
    return selects().map((select, index) => {
      const human = select.value === 'human';
      const bot = byId[select.value];
      return {
        id: `s${index + 1}`, kind: human ? 'human' : 'bot', human,
        botId: human ? null : bot.id,
        name: human ? `Player ${++humans}` : bot.name + label(bot.id)
      };
    });
  }

  function humanSeats() {
    return (activeSeats || []).filter(seat => seat.human);
  }

  function lockBackground(locked) {
    if (!locked) {
      lockedNodes.forEach((value, node) => { node.inert = value; });
      lockedNodes.clear();
      return;
    }
    const pass = $('ph-pass');
    document.querySelectorAll('body > header, body > .hero, body > footer, .ph > :not(#ph-pass), #ph-table, #ph-form')
      .forEach(node => {
        if (node === pass || node.contains(pass)) return;
        if (!lockedNodes.has(node)) lockedNodes.set(node, node.inert);
        node.inert = true;
      });
  }

  function setControls() {
    $('ph-start').disabled = !ready || running;
    $('ph-start').textContent = running ? 'Playing…' : 'Start';
    $('ph-random').disabled = !ready || running;
    $('ph-add').disabled = !ready || running || selects().length >= 9;
    $('ph-form').querySelectorAll('select, .ph-remove').forEach(node => {
      node.disabled = running;
    });
    $('ph-seats').querySelectorAll('.ph-remove').forEach(node => {
      node.disabled = running || selects().length <= 2;
    });
  }

  function addSeat(value = 'human') {
    if (selects().length >= 9) return;
    const row = element('div', 'ph-seat-row');
    const label = element('label');
    const select = element('select');
    label.appendChild(element('span', null, 'Seat'));
    select.appendChild(new Option('Human', 'human'));
    bots.forEach(bot => select.appendChild(new Option(`${bot.name} · ${bot.lab}`, bot.id)));
    select.value = value === 'human' || byId[value] ? value : 'human';
    select.addEventListener('change', preview);
    label.appendChild(select);
    const remove = element('button', 'ph-remove', 'Remove');
    remove.type = 'button';
    remove.addEventListener('click', () => {
      if (running || selects().length <= 2) return;
      row.remove();
      preview();
    });
    row.append(label, remove);
    $('ph-seats').appendChild(row);
    setControls();
  }

  function updateStandings(state) {
    const ranked = state.seats.slice().sort((a, b) => {
      if (a.out !== b.out) return a.out ? 1 : -1;
      return b.stack - a.stack || (a.place || 0) - (b.place || 0);
    });
    standings = ranked.map(seat => ({ name: seat.name, chips: seat.stack }));
    $('ph-standings').replaceChildren(...ranked.map(seat => {
      const row = element('li');
      row.append(
        element('span', null, seat.name),
        element('b', null, seat.out ? `Out · #${seat.place || '—'}` : format(seat.stack))
      );
      return row;
    }));
  }

  function render() {
    if (!activeRun) return;
    const game = activeRun.game;
    const state = game.publicState();
    const humans = humanSeats();
    if (humans.length === 1) revealFor = humans[0].id;
    if (revealFor && !game.handOver() && game.handNumber > 0) {
      const seat = state.seats.find(entry => entry.id === revealFor);
      if (seat && !seat.out && !seat.cards) {
        seat.cards = game.botState(revealFor).you.cards.slice();
        seat.private = true;
      }
    }
    renderer.update(state, { revealFor, lastAction });
    $('ph-hand').textContent = `HAND ${state.handNumber}`;
    $('ph-blinds').textContent = `BLINDS ${format(state.blinds[0])}/${format(state.blinds[1])}`;
    $('ph-street').textContent = String(state.street || 'Ready').toUpperCase();
    updateStandings(state);
  }

  function preview() {
    if (!ready || running) return;
    setControls();
    const game = PokerEngine.create(selectedSeats().map(({ id, name }) => ({ id, name })), {
      seed: 1, stack: Number($('ph-stack').value), maxHands: Number($('ph-hands').value)
    });
    const state = game.publicState();
    renderer.update(state, { revealFor: null, highlight: null });
    updateStandings(state);
  }

  function log(text) {
    if (!text) return;
    logs.push(text);
    logs = logs.slice(-30);
    $('ph-log').replaceChildren(...logs.map(line => element('li', null, line)));
    $('ph-ticker').textContent = text;
    lastAction = text;
  }

  function nameFor(id) {
    const seat = (activeSeats || []).find(entry => entry.id === id);
    return seat ? seat.name : id;
  }

  function logAction(event, before) {
    const name = nameFor(event.id);
    let text;
    switch (event.action.type) {
      case 'fold': text = `${name} folds`; break;
      case 'check': text = `${name} checks`; break;
      case 'call': text = `${name} calls ${format(before.callAmount)}`; break;
      case 'raise': text = `${name} raises to ${format(event.action.amount)}`; break;
      default: text = `${name} goes all-in`;
    }
    if (event.error) text += ' (bot error: safe fallback)';
    log(text);
  }

  function logWinners(result) {
    if (!result) return;
    result.winners.forEach(winner => {
      const hand = typeof winner.hand === 'string' ? winner.hand : winner.hand && winner.hand.name;
      log(`${nameFor(winner.id)} wins ${format(winner.amount)}${hand ? ` with ${hand.toLowerCase()}` : ''}`);
    });
  }

  function hideActions() {
    waitingId = null;
    $('ph-actions').hidden = true;
    $('ph-pass').hidden = true;
    lockBackground(false);
    if (humanSeats().length > 1) revealFor = null;
  }

  function limits() {
    return activeRun && waitingId ? activeRun.game.legalActions(waitingId) : null;
  }

  function setAmount(value) {
    const legal = limits();
    if (!legal) return;
    const minimum = legal.minRaiseTo == null ? legal.maxRaiseTo : Math.min(legal.minRaiseTo, legal.maxRaiseTo);
    const amount = Math.max(minimum, Math.min(legal.maxRaiseTo, Math.round(Number(value))));
    if (!Number.isFinite(amount)) return;
    $('ph-amount').value = String(amount);
    $('ph-slider').value = String(amount);
  }

  function configureActions() {
    const legal = limits();
    if (!legal) return;
    const minimum = legal.minRaiseTo == null ? legal.maxRaiseTo : Math.min(legal.minRaiseTo, legal.maxRaiseTo);
    const canRaise = legal.minRaiseTo !== null;
    $('ph-fold').disabled = !legal.canFold;
    $('ph-check').disabled = false;
    $('ph-check').textContent = legal.canCheck ? 'Check' : `Call ${format(legal.callAmount)}`;
    for (const id of ['ph-amount', 'ph-slider']) {
      const input = $(id);
      input.min = String(minimum);
      input.max = String(legal.maxRaiseTo);
      input.step = '1';
      input.disabled = !canRaise;
    }
    $('ph-raise').disabled = !canRaise;
    $('ph-half').disabled = !canRaise;
    $('ph-pot').disabled = !canRaise;
    $('ph-allin').disabled = !legal.canAllIn;
    setAmount(minimum);
  }

  function prepareHuman(id) {
    waitingId = id;
    configureActions();
    if (humanSeats().length > 1) {
      revealFor = null;
      $('ph-actions').hidden = true;
      $('ph-pass-name').textContent = `Pass the device to ${nameFor(id)}`;
      $('ph-pass').hidden = false;
      lockBackground(true);
      $('ph-show').focus();
    } else {
      revealFor = id;
      $('ph-pass').hidden = true;
      $('ph-actions').hidden = false;
      $('ph-check').focus({ preventScroll: true });
    }
    render();
  }

  function showHuman() {
    if (!waitingId || !activeRun) return;
    revealFor = waitingId;
    $('ph-pass').hidden = true;
    lockBackground(false);
    $('ph-actions').hidden = false;
    render();
    $('ph-check').focus();
  }

  function submit(action) {
    if (!activeRun || !waitingId || !$('ph-pass').hidden) return;
    const result = activeRun.submitHuman(action);
    if (!result.ok) {
      $('ph-ticker').textContent = result.error || 'Choose a legal action.';
      return;
    }
    hideActions();
    render();
  }

  function raise() {
    const legal = limits();
    if (!legal) return;
    const amount = Number($('ph-amount').value);
    submit(amount === legal.maxRaiseTo ? { type: 'allin' } : { type: 'raise', amount });
  }

  function potAmount(multiplier) {
    if (!activeRun || !waitingId) return;
    const state = activeRun.game.publicState();
    const seat = state.seats.find(entry => entry.id === waitingId);
    const legal = limits();
    const pot = state.pots.reduce((sum, entry) => sum + entry.amount, 0);
    setAmount(seat.bet + legal.callAmount + (pot + legal.callAmount) * multiplier);
  }

  function delay(ms) {
    if (ms <= 0) return Promise.resolve();
    return new Promise(resolve => {
      const timer = setTimeout(finish, ms);
      function finish() {
        clearTimeout(timer);
        if (delayCancel === finish) delayCancel = null;
        resolve();
      }
      delayCancel = finish;
    });
  }

  function cleanup() {
    if (delayCancel) delayCancel();
    if (activeRun) {
      savedErrors = { ...activeRun.errors };
      activeRun.stop();
    }
    hideActions();
    activeRun = null;
    activeSeats = null;
    revealFor = null;
    running = false;
    setControls();
  }

  function verdict(game) {
    const result = game.result();
    const winners = result.placements.filter(entry => entry.place === 1);
    const text = winners.length === 1
      ? `${nameFor(winners[0].id)} wins the tournament after ${result.hands} hands`
      : `${winners.map(entry => nameFor(entry.id)).join(' and ')} share first place after ${result.hands} hands`;
    $('ph-result').textContent = text;
    $('ph-result').hidden = false;
    $('ph-ticker').textContent = text;
  }

  async function play() {
    if (!ready || running) return;
    const my = ++generation;
    const seats = selectedSeats();
    logs = [];
    lastAction = '';
    savedErrors = {};
    $('ph-log').replaceChildren();
    $('ph-result').hidden = true;
    $('ph-result').textContent = '';
    $('ph-ticker').textContent = 'Loading bots…';
    revealFor = null;
    activeSeats = seats;
    running = true;
    setControls();
    try {
      const run = HoldemRunner.start(seats, {
        seed: crypto.getRandomValues(new Uint32Array(1))[0],
        stack: Number($('ph-stack').value),
        maxHands: Number($('ph-hands').value)
      });
      activeRun = run;
      await run.loaded;
      if (my !== generation) return;
      const game = run.game;
      const speed = Number($('ph-speed').value);
      render();
      while (!game.finished() && my === generation) {
        const id = game.toAct();
        const actor = seats.find(seat => seat.id === id);
        const isDecision = id != null && !game.handOver();
        const before = isDecision ? game.legalActions(id) : null;
        const started = performance.now();
        const pending = run.next();
        if (isDecision && actor && actor.human) prepareHuman(id);
        const event = await pending;
        if (my !== generation || event.type === 'stopped') return;
        hideActions();
        if (event.type === 'hand') log(`Hand ${game.handNumber}`);
        else if (event.type === 'action') logAction(event, before);
        logWinners(event.handResult);
        render();
        if (event.handResult && speed > 0) {
          await delay(Math.max(900, speed));
        } else if (isDecision && actor && !actor.human) {
          await delay(Math.max(0, speed - (performance.now() - started)));
        }
      }
      if (my === generation) verdict(game);
    } catch (error) {
      if (my === generation) {
        $('ph-ticker').textContent = 'The tournament could not be completed. Please try again.';
        console.error('holdem: tournament failed', error);
      }
    } finally {
      if (my === generation) cleanup();
    }
  }

  function roster() {
    $('ph-list').replaceChildren(...bots.map(bot => {
      const item = element('li');
      item.style.setProperty('--bot-color', bot.color);
      item.append(
        element('b', null, bot.name),
        element('small', null, `${bot.lab} · ${bot.botName || bot.id}`),
        element('small', null, bot.note)
      );
      return item;
    }));
  }

  function validBot(bot) {
    return bot && typeof bot.id === 'string' &&
      /^[a-z0-9][a-z0-9.-]*$/.test(bot.id) && !bot.id.includes('..') &&
      bot.file === `bots/${bot.id}.js` &&
      typeof bot.name === 'string' && typeof bot.lab === 'string' &&
      /^#[0-9a-f]{6}$/i.test(bot.color);
  }

  async function init() {
    try {
      const response = await fetch('bots.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.version !== 1 || !Array.isArray(payload.bots) ||
          !payload.bots.length || !payload.bots.every(validBot) ||
          new Set(payload.bots.map(bot => bot.id)).size !== payload.bots.length) {
        throw new Error('Invalid bot roster');
      }
      bots = payload.bots;
      byId = Object.fromEntries(bots.map(bot => [bot.id, bot]));
      roster();
      const query = new URLSearchParams(location.search);
      const requested = (query.get('seats') || '').split(',');
      const values = requested.length >= 2 && requested.length <= 9 &&
        requested.every(value => value === 'human' || byId[value]) ? requested : defaults;
      ready = true;
      values.forEach(addSeat);
      preview();
      $('ph-ticker').textContent = 'Choose your seats, then start.';
      if (query.get('autostart') === '1') play();
    } catch (error) {
      ready = false;
      setControls();
      $('ph-ticker').textContent = 'The bots could not be loaded. Reload the page to try again.';
      console.error('holdem: roster failed', error);
    }
  }

  $('ph-form').addEventListener('submit', event => { event.preventDefault(); play(); });
  $('ph-add').addEventListener('click', () => {
    if (running) return;
    addSeat(bots[0].id);
    preview();
  });
  $('ph-random').addEventListener('click', () => {
    if (running || !ready) return;
    selects().forEach(select => {
      select.value = bots[Math.floor(Math.random() * bots.length)].id;
    });
    preview();
  });
  $('ph-stack').addEventListener('change', preview);
  $('ph-show').addEventListener('click', showHuman);
  $('ph-fold').addEventListener('click', () => submit({ type: 'fold' }));
  $('ph-check').addEventListener('click', () => {
    const legal = limits();
    if (legal) submit({ type: legal.canCheck ? 'check' : 'call' });
  });
  $('ph-raise').addEventListener('click', raise);
  $('ph-amount').addEventListener('change', event => setAmount(event.target.value));
  $('ph-slider').addEventListener('input', event => setAmount(event.target.value));
  $('ph-half').addEventListener('click', () => potAmount(0.5));
  $('ph-pot').addEventListener('click', () => potAmount(1));
  $('ph-allin').addEventListener('click', () => submit({ type: 'allin' }));

  document.addEventListener('keydown', event => {
    if (!$('ph-pass').hidden) {
      if (event.key === 'Tab') {
        event.preventDefault();
        $('ph-show').focus();
      }
      return;
    }
    if (!waitingId || $('ph-actions').hidden || event.repeat) return;
    if (event.target instanceof Element &&
        event.target.closest('input, select, textarea, [contenteditable]')) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const button = { f: 'ph-fold', c: 'ph-check', r: 'ph-raise' }[event.key.toLowerCase()];
    if (!button || $(button).disabled) return;
    event.preventDefault();
    $(button).click();
  });

  window.addEventListener('pagehide', event => {
    generation++;
    cleanup();
    if (!event.persisted) renderer.destroy();
  });

  window.__HOLDEM__ = () => {
    const state = activeRun ? activeRun.game.publicState() : null;
    return {
      bots: bots.length, running,
      seats: (activeSeats || (ready ? selectedSeats() : [])).map(seat => ({
        kind: seat.kind, id: seat.human ? 'human' : seat.botId
      })),
      hand: state ? state.handNumber : Number($('ph-hand').textContent.replace(/\D/g, '')) || 0,
      street: state ? state.street : $('ph-street').textContent.toLowerCase(),
      ticker: $('ph-ticker').textContent,
      result: $('ph-result').hidden ? null : $('ph-result').textContent,
      standings: standings.map(seat => ({ ...seat })),
      humanToAct: Boolean(waitingId && running),
      errors: { ...(activeRun ? activeRun.errors : savedErrors) }
    };
  };

  setControls();
  init();
})();
