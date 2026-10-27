(function () {
  'use strict';

  const byId = id => document.getElementById(id);
  const elements = {
    form: byId('ch-form'), white: byId('ch-white'), black: byId('ch-black'),
    variant: byId('ch-variant'), series: byId('ch-series'), speed: byId('ch-speed'),
    start: byId('ch-start'), resign: byId('ch-resign'), flip: byId('ch-flip'),
    canvas: byId('ch-canvas'), cards: byId('ch-cards'), ticker: byId('ch-ticker'),
    result: byId('ch-result'), moves: byId('ch-moves'), score: byId('ch-score'),
    list: byId('ch-list'), promo: byId('ch-promo'),
    humanForm: byId('ch-human-form'), humanMove: byId('ch-human-move'),
    humanSubmit: byId('ch-human-submit')
  };
  const parameters = new URLSearchParams(location.search);
  const setupControls = [elements.white, elements.black, elements.variant, elements.series];
  const previousChoices = new Map();
  const seatSelects = [elements.white, elements.black];

  let bots = [];
  let ready = false;
  let running = false;
  let picking = false;
  let customBot = null;
  let runner = null;
  let game = ChessEngine.create();
  let seats = [humanSeat(), humanSeat()];
  let variant = 'standard';
  let flipped = false;
  let selected = null;
  let targets = [];
  let humanReady = false;
  let promotion = null;
  let generation = 0;
  let sleepTimer = null;
  let wake = null;

  const renderer = ChessBoardRenderer.create(elements.canvas, {
    onSquare,
    onCancel() {
      clearSelection();
      render();
    }
  });

  function humanSeat() {
    return {
      id: 'human', name: 'Human', human: true,
      lab: 'Click or use keyboard', color: '#8e9ab1'
    };
  }
  function seatFor(value) {
    if (value === 'human') return humanSeat();
    if (value === 'custom' && customBot) {
      return {
        id: 'custom', name: customBot.name, human: false,
        lab: 'You', color: '#2dd4bf',
        custom: { name: customBot.name, code: customBot.code }
      };
    }
    const bot = bots.find(entry => entry.id === value);
    return bot ? { ...bot, human: false } : humanSeat();
  }
  function sideName(color) { return color === 'w' ? 'White' : 'Black'; }
  function activeSeat() { return seats[game.turn === 'w' ? 0 : 1]; }
  function setTicker(text) { elements.ticker.textContent = text; }
  function clearSelection() { selected = null; targets = []; }
  function closePromotion() {
    promotion = null;
    if (elements.promo.open) elements.promo.close();
  }

  function setControls() {
    const over = game.status().over;
    elements.start.disabled = !ready || running || picking;
    elements.start.textContent = running ? 'Playing…' : 'Start';
    for (const control of setupControls) {
      control.disabled = !ready || running || picking;
    }
    elements.resign.disabled = !running || over || !activeSeat().human;
    const inputEnabled = running && humanReady && activeSeat().human && !over && !promotion;
    elements.humanMove.disabled = !inputEnabled;
    elements.humanSubmit.disabled = !inputEnabled;
  }

  function drawCards() {
    const fragment = document.createDocumentFragment();
    const over = game.status().over;
    seats.forEach((seat, index) => {
      const card = document.createElement('article');
      card.className = 'ch-card';
      card.style.setProperty('--c', seat.color || '#8e9ab1');
      const active = running && !over && index === (game.turn === 'w' ? 0 : 1);
      if (active) card.classList.add('is-active');
      const heading = document.createElement('h3');
      heading.textContent = `${index === 0 ? 'White' : 'Black'} · ${seat.name}`;
      const note = document.createElement('p');
      note.textContent = `${seat.human ? 'Human · touch or keyboard' : seat.lab}` +
        (active ? ' · TO MOVE' : '');
      card.append(heading, note);
      fragment.append(card);
    });
    elements.cards.replaceChildren(fragment);
  }

  function drawMoves() {
    const fragment = document.createDocumentFragment();
    const history = game.history;
    for (let index = 0; index < history.length; index += 2) {
      const item = document.createElement('li');
      const pair = document.createElement('div');
      pair.className = 'ch-move-pair';
      const white = document.createElement('span');
      white.textContent = history[index].san;
      const black = document.createElement('span');
      black.textContent = history[index + 1] ? history[index + 1].san : '—';
      pair.append(white, black);
      item.append(pair);
      fragment.append(item);
    }
    elements.moves.replaceChildren(fragment);
    elements.moves.scrollTop = elements.moves.scrollHeight;
  }

  function render() {
    renderer.update(game, {
      flipped, selected, targets, lastMove: game.lastMove, check: game.inCheck()
    });
    drawCards();
    drawMoves();
    setControls();
    elements.canvas.setAttribute('aria-label',
      `Chess board. ${sideName(game.turn)} to move.${game.inCheck() ? ' Check.' : ''}`);
  }

  function turnTicker(event) {
    const turn = `${sideName(game.turn)} to move`;
    const checked = game.inCheck() ? ' · Check!' : '';
    if (event && event.type === 'move') {
      const seat = seats[event.color === 'w' ? 0 : 1];
      setTicker(`${seat.name} played ${event.san} · ${turn}${checked}`);
    } else setTicker(`${turn}${checked}`);
  }

  function resultText() {
    const status = game.status();
    if (!status.over) return '';
    const drawReasons = {
      stalemate: 'stalemate', threefold: 'threefold repetition',
      'fifty-move': 'the fifty-move rule', insufficient: 'insufficient material',
      'max-plies': 'the move limit'
    };
    if (status.result === '1/2-1/2') {
      if (status.reason === 'forfeit') {
        return `Draw by double forfeit (${status.detail || 'both bots failed'})`;
      }
      return `Draw by ${drawReasons[status.reason] || 'adjudication'}`;
    }
    const winner = status.result === '1-0' ? 'White' : 'Black';
    if (status.reason === 'checkmate') return `${winner} wins by checkmate`;
    if (status.reason === 'forfeit') {
      if (status.detail === 'Human resigned') return `${winner} wins by resignation`;
      const loser = seats[status.result === '1-0' ? 1 : 0];
      return `${winner} wins: ${loser.name} forfeited (${status.detail || 'bot failed'})`;
    }
    return `${winner} wins`;
  }

  function showResult() {
    elements.result.textContent = resultText();
    elements.result.hidden = !elements.result.textContent;
  }

  function squarePiece(name) {
    return game.board()[8 - Number(name[1])][name.charCodeAt(0) - 97];
  }
  function castleDestination(uci) {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const king = squarePiece(from);
    const rook = squarePiece(to);
    if (!king || !rook || king[1] !== 'K' || rook !== `${king[0]}R`) return null;
    return `${to[0] > from[0] ? 'g' : 'c'}${from[1]}`;
  }
  function movesFrom(name) {
    return game.legalMoves().filter(move => move.slice(0, 2) === name);
  }
  function selectSquare(name) {
    selected = name;
    const squares = new Set();
    for (const move of movesFrom(name)) {
      squares.add(move.slice(2, 4));
      const castle = castleDestination(move);
      if (castle) squares.add(castle);
    }
    targets = [...squares];
    render();
  }
  function matchingMoves(name) {
    const moves = movesFrom(selected);
    // Canonical destinations always win. This preserves ordinary king steps
    // when Chess960 castling happens to finish on the same square.
    const direct = moves.filter(move => move.slice(2, 4) === name);
    if (direct.length) return direct;
    return moves.filter(move => castleDestination(move) === name);
  }

  function submitMove(uci) {
    if (!running || !humanReady || !runner) return false;
    const result = runner.submitHuman(uci);
    if (!result.ok) {
      setTicker(result.error || 'That move is not legal');
      return false;
    }
    humanReady = false;
    elements.humanMove.value = '';
    clearSelection();
    closePromotion();
    render();
    return true;
  }

  function askPromotion(moves) {
    promotion = { game, generation, moves: [...moves] };
    for (const button of elements.promo.querySelectorAll('[data-piece]')) {
      button.disabled = !moves.some(move => move[4] === button.dataset.piece);
    }
    setControls();
    elements.promo.showModal();
  }

  function onSquare(name) {
    if (!running || !humanReady || !activeSeat().human ||
        game.status().over || promotion) return;
    if (selected) {
      const candidates = matchingMoves(name);
      if (candidates.length) {
        if (candidates.some(move => move.length === 5)) askPromotion(candidates);
        else submitMove(candidates[0]);
        return;
      }
    }
    const piece = squarePiece(name);
    if (piece && piece[0] === game.turn) selectSquare(name);
    else { clearSelection(); render(); }
  }

  function choosePromotion(event) {
    const button = event.target.closest('button[data-piece]');
    if (!button || !promotion) return;
    const request = promotion;
    if (request.game !== game || request.generation !== generation) {
      closePromotion();
      return;
    }
    const move = request.moves.find(uci => uci[4] === button.dataset.piece);
    if (move) submitMove(move);
  }

  function sleep(milliseconds) {
    if (milliseconds <= 0) return Promise.resolve();
    return new Promise(resolve => {
      wake = () => {
        clearTimeout(sleepTimer);
        sleepTimer = null;
        wake = null;
        resolve();
      };
      sleepTimer = setTimeout(wake, milliseconds);
    });
  }

  function randomWord() {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return value[0];
  }
  function randomPosition() {
    const bound = 4294967296 - (4294967296 % 960);
    let value;
    do { value = randomWord(); } while (value >= bound);
    return value % 960;
  }

  function scoreText(base, points, completed, count) {
    elements.score.textContent =
      `Player 1 (${base[0].name}): ${points[0]} · ` +
      `Player 2 (${base[1].name}): ${points[1]} · Games ${completed}/${count}`;
  }

  async function playGame(token) {
    await runner.loaded;
    if (token !== generation) return;
    render();
    if (game.status().over) return;
    while (token === generation && !game.status().over) {
      const botTurn = !activeSeat().human;
      const started = performance.now();
      const request = runner.next();
      // advance() first resumes after loaded and installs its human waiter.
      await Promise.resolve();
      if (token !== generation) return;
      humanReady = !botTurn;
      turnTicker();
      render();
      const event = await request;
      humanReady = false;
      if (token !== generation) return;
      if (event.type === 'stopped' && !game.status().over) return;
      if (botTurn && event.type === 'move') {
        const minimum = Number(elements.speed.value);
        await sleep(Math.max(0, minimum - (performance.now() - started)));
        if (token !== generation) return;
      }
      clearSelection();
      closePromotion();
      render();
      turnTicker(event);
    }
  }

  async function startSeries(event) {
    if (event) event.preventDefault();
    if (!ready || running || picking) return;
    if (seatSelects.some(select => select.value === 'custom') && !customBot) {
      setTicker('Choose Your bot (upload…) and load a JavaScript bot first.');
      return;
    }
    const token = ++generation;
    const base = [seatFor(elements.white.value), seatFor(elements.black.value)];
    const count = Number(elements.series.value);
    const points = [0, 0];
    const pairs = [];
    variant = elements.variant.value;
    for (let index = 0; index < Math.ceil(count / 2); index++) {
      pairs.push({
        position: variant === 'chess960' ? randomPosition() : 518,
        seed: randomWord()
      });
    }
    running = true;
    elements.result.hidden = true;
    elements.result.textContent = '';
    scoreText(base, points, 0, count);
    setControls();

    try {
      for (let index = 0; index < count; index++) {
        if (token !== generation) return;
        if (runner) runner.stop();
        const swapped = index % 2 === 1;
        seats = swapped ? [base[1], base[0]] : [base[0], base[1]];
        flipped = !seats[0].human && seats[1].human;
        humanReady = false;
        clearSelection();
        closePromotion();
        elements.humanMove.value = '';
        const pair = pairs[Math.floor(index / 2)];
        runner = ChessRunner.start({
          white: seats[0], black: seats[1], variant,
          position960: pair.position, seed: pair.seed, swapSeedSeats: swapped
        });
        game = runner.game;
        elements.result.hidden = true;
        elements.result.textContent = '';
        setTicker(`Loading game ${index + 1}/${count}…`);
        render();
        await playGame(token);
        if (token !== generation) return;
        const status = game.status();
        if (!status.over) break;
        runner.stop();
        showResult();
        setTicker(elements.result.textContent);
        if (status.result === '1/2-1/2') {
          points[0] += 0.5;
          points[1] += 0.5;
        } else {
          const winnerSeat = status.result === '1-0' ? 0 : 1;
          points[swapped ? 1 - winnerSeat : winnerSeat] += 1;
        }
        scoreText(base, points, index + 1, count);
        if (index + 1 < count) {
          await sleep(Number(elements.speed.value) === 0 ? 0 : 650);
        }
      }
    } catch (error) {
      if (token === generation) {
        setTicker('The game could not continue. Please start a new game.');
        elements.result.textContent = 'Arena error';
        elements.result.hidden = false;
      }
    } finally {
      if (token === generation) {
        if (runner) runner.stop();
        running = false;
        humanReady = false;
        clearSelection();
        closePromotion();
        render();
      }
    }
  }

  function resign() {
    if (!running || game.status().over || !activeSeat().human) return;
    game.forfeit(game.turn, 'Human resigned');
    humanReady = false;
    clearSelection();
    closePromotion();
    runner.stop();
    if (wake) wake();
    showResult();
    setTicker(elements.result.textContent);
    render();
  }

  function preview() {
    if (running) return;
    seats = [seatFor(elements.white.value), seatFor(elements.black.value)];
    variant = elements.variant.value;
    flipped = !seats[0].human && seats[1].human;
    game = ChessEngine.create({
      variant, position960: variant === 'chess960' ? randomPosition() : 518
    });
    clearSelection();
    elements.humanMove.value = '';
    elements.result.hidden = true;
    elements.result.textContent = '';
    elements.score.textContent = '';
    setTicker('Choose your players and press Start');
    render();
  }

  function updateCustomOptions() {
    for (const select of seatSelects) {
      const option = [...select.options].find(entry => entry.value === 'custom');
      if (option) {
        option.textContent = customBot
          ? `Your bot: ${customBot.name}`
          : 'Your bot (upload…)';
      }
    }
  }

  async function chooseSeat(event) {
    const select = event.currentTarget;
    const previous = previousChoices.get(select) || 'human';
    if (running || picking) {
      select.value = previous;
      return;
    }
    if (select.value !== 'custom') {
      previousChoices.set(select, select.value);
      preview();
      return;
    }

    picking = true;
    setControls();
    let errorMessage = '';
    try {
      // Keep this call before the first await: the picker needs a user gesture.
      const chosen = await ArenaCustomBot.pick({ game: 'chess' });
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
      preview();
      if (errorMessage) setTicker(errorMessage);
    }
  }

  function buildSelect(select) {
    const fragment = document.createDocumentFragment();
    const human = document.createElement('option');
    human.value = 'human';
    human.textContent = 'Human (click to move)';
    const custom = document.createElement('option');
    custom.value = 'custom';
    custom.textContent = 'Your bot (upload…)';
    fragment.append(human, custom);
    for (const bot of bots) {
      const option = document.createElement('option');
      option.value = bot.id;
      option.textContent = `${bot.name} · ${bot.lab}`;
      fragment.append(option);
    }
    select.replaceChildren(fragment);
  }

  function buildRoster() {
    const fragment = document.createDocumentFragment();
    for (const bot of bots) {
      const item = document.createElement('li');
      item.style.setProperty('--c', bot.color);
      const name = document.createElement('strong');
      name.textContent = bot.name;
      const lab = document.createElement('span');
      lab.className = 'ch-roster-lab';
      lab.textContent = bot.lab;
      const note = document.createElement('p');
      note.textContent = bot.note || '';
      item.append(name, lab, note);
      fragment.append(item);
    }
    elements.list.replaceChildren(fragment);
  }

  function validateManifest(manifest) {
    if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.bots)) {
      throw new Error('Invalid bot manifest');
    }
    const ids = new Set();
    return manifest.bots.map(bot => {
      if (!bot || typeof bot.id !== 'string' ||
          !/^[a-z0-9][a-z0-9.-]*$/.test(bot.id) ||
          bot.id.includes('..') || bot.id === 'human' ||
          bot.id === 'custom' || ids.has(bot.id)) {
        throw new Error('Invalid or duplicate bot identifier');
      }
      if (bot.file !== `bots/${bot.id}.js` ||
          typeof bot.name !== 'string' || !bot.name.trim() ||
          typeof bot.lab !== 'string') throw new Error('Invalid bot entry');
      ids.add(bot.id);
      return {
        id: bot.id, name: bot.name,
        botName: typeof bot.botName === 'string' ? bot.botName : bot.name,
        lab: bot.lab,
        color: /^#[0-9a-f]{6}$/i.test(bot.color) ? bot.color : '#8e9ab1',
        file: bot.file,
        bytes: Number.isSafeInteger(bot.bytes) && bot.bytes >= 0 ? bot.bytes : 0,
        note: typeof bot.note === 'string' ? bot.note : ''
      };
    });
  }

  function chooseParameter(select, value) {
    // A URL cannot supply an in-memory bot or open a picker without a gesture.
    if (value === 'custom' && !customBot) return;
    if (value !== null && [...select.options].some(option => option.value === value)) {
      select.value = value;
    }
  }

  async function loadBots() {
    setTicker('Loading players…');
    try {
      const response = await fetch('bots.json', {
        credentials: 'same-origin', cache: 'no-cache'
      });
      if (!response.ok) throw new Error('Manifest request failed');
      bots = validateManifest(await response.json());
      customBot = ArenaCustomBot.get('chess');
      buildSelect(elements.white);
      buildSelect(elements.black);
      updateCustomOptions();
      buildRoster();
      elements.white.value = 'human';
      elements.black.value = bots.some(bot => bot.id === 'sample-minimax')
        ? 'sample-minimax' : (bots[0] ? bots[0].id : 'human');
      chooseParameter(elements.white, parameters.get('white'));
      chooseParameter(elements.black, parameters.get('black'));
      chooseParameter(elements.variant, parameters.get('variant'));
      for (const select of seatSelects) {
        previousChoices.set(select, select.value);
      }
      ready = true;
      preview();
      if (parameters.get('autostart') === '1') await startSeries();
    } catch (error) {
      ready = false;
      setTicker('The players could not be loaded… Please reload to try again.');
      setControls();
    }
  }

  function freeze(value) {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }

  Object.defineProperty(window, '__CHESS_ARENA__', {
    configurable: false, writable: false,
    value: Object.freeze(() => freeze({
      bots: bots.map(bot => ({ ...bot })), running,
      seats: seats.map(seat => ({
        ...seat,
        ...(seat.custom ? { custom: { ...seat.custom } } : {})
      })), variant,
      ticker: elements.ticker.textContent, result: elements.result.textContent,
      moves: game.history.map(entry => entry.san), fen: game.fen()
    }))
  });

  elements.form.addEventListener('submit', startSeries);
  elements.resign.addEventListener('click', resign);
  elements.flip.addEventListener('click', () => { flipped = !flipped; render(); });
  elements.humanForm.addEventListener('submit', event => {
    event.preventDefault();
    if (promotion) return;
    submitMove(elements.humanMove.value);
  });
  for (const select of seatSelects) select.addEventListener('change', chooseSeat);
  for (const control of [elements.variant, elements.series]) {
    control.addEventListener('change', preview);
  }
  elements.promo.addEventListener('click', choosePromotion);
  elements.promo.addEventListener('cancel', () => { promotion = null; setControls(); });
  elements.promo.addEventListener('close', () => { promotion = null; setControls(); });

  window.addEventListener('pagehide', () => {
    generation++;
    running = false;
    humanReady = false;
    if (runner) runner.stop();
    if (wake) wake();
    closePromotion();
    renderer.destroy();
  }, { once: true });

  render();
  loadBots();
})();
