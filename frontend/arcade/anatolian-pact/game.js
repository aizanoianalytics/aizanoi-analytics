(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const map = PactEngine.MAP;
  const provinces = Object.values(map.provinces);
  const powers = map.powers;
  const names = powers.map(p => p.id);
  const province = id => map.provinces[id];
  const place = id => province(id)?.name || id || 'unknown province';
  const defaults = [
    'human', 'sample-schemer', 'sample-expander',
    'sample-turtle', 'sample-schemer', 'sample-expander'
  ];
  const phaseNames = {
    'negotiate-propose': 'Negotiation · Proposals',
    'negotiate-answer': 'Negotiation · Answers',
    orders: 'Secret orders',
    retreats: 'Retreats',
    builds: 'Builds and disbands',
    over: 'Finished'
  };
  let bots = [], match = null, running = false, seats = {}, active = null;
  let draft = [], selected = null, support = null, picker = null, inspected = null;
  let replay = [], sleepTimer = null, wake = null, generation = 0;
  let picking = false, customBot = null;
  const selects = new Map();
  const previousChoices = new Map();
  let unitInput = null, actionInput = null;
  const renderer = PactMap.create($('ap-canvas'), { onProvince: pickProvince });

  function node(tag, text, className) {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (className) e.className = className;
    return e;
  }

  function button(text, action) {
    const b = node('button', text);
    b.type = 'button';
    b.addEventListener('click', action);
    return b;
  }

  function selectField(parent, label, choices) {
    const wrap = node('label', label);
    const input = node('select');
    input.setAttribute('aria-label', label);
    choices.forEach(([value, text]) => input.add(new Option(text, value)));
    wrap.append(input);
    parent.append(wrap);
    return input;
  }

  function provinceField(parent, label, choices = provinces) {
    const input = selectField(parent, label, choices.map(p => [p.id, `${p.id} · ${p.name}`]));
    input.addEventListener('focus', () => { picker = input; });
    return input;
  }

  const legend = node('p',
    '★ supply centre · ring = home · shield = army · sail = fleet · dashed arrow = support · × = failed order. Narrow maps use province codes.',
    'ap-map-legend');
  const inspectorWrap = node('div', undefined, 'ap-inspector');
  const inspectInput = provinceField(inspectorWrap, 'Inspect province');
  const inspectText = node('p', 'Choose a province here or on the map.');
  inspectText.setAttribute('role', 'status');
  inspectorWrap.append(inspectText);
  $('ap-canvas').after(legend, inspectorWrap);
  inspectInput.addEventListener('change', () => {
    inspected = inspectInput.value;
    describeProvince();
    draw();
  });
  const editor = node('div', undefined, 'ap-fields');
  $('ap-order-hint').after(editor);
  const cancelSelection = button('Clear selection', () => {
    selected = null;
    support = null;
    showOrders();
  });
  $('ap-support').after(cancelSelection);

  function counts() {
    const result = Object.fromEntries(names.map(p => [p, 0]));
    if (match) Object.values(match.game.owners()).forEach(p => {
      if (Object.hasOwn(result, p)) result[p]++;
    });
    return result;
  }

  function trust() {
    return match ? match.game.botState(names[0]).trust : {};
  }

  function describeProvince() {
    if (!inspected) return;
    const p = province(inspected);
    const owner = match?.game.owners()[p.id];
    const unit = match?.game.units().find(u => u.at === p.id);
    inspectInput.value = p.id;
    inspectText.textContent = [
      `${p.id} · ${p.name}`,
      p.type === 'sea' ? 'Sea' : p.coastal ? 'Coastal land' : 'Inland',
      p.sc ? `Supply centre: ${owner || 'neutral'}${p.home ? `; home of ${p.home}` : ''}` : '',
      unit ? `${unit.power} ${unit.type}` : 'No unit'
    ].filter(Boolean).join(' · ');
  }

  function legal(power, at) {
    return match?.game.legalOrders(power)[at] || [];
  }

  function draw(arrows = []) {
    let highlight = [];
    if (active && selected) {
      const list = legal(active, selected);
      highlight = support ?
        list.filter(o => o.type === 'support' && (!support.target || o.target === support.target))
          .map(o => support.target ? o.targetDest === 'hold' ? o.target : o.targetDest : o.target) :
        list.filter(o => o.type === 'move').map(o => o.dest);
    }
    renderer.update(match?.game || null, {
      selected, inspected, highlight, arrows, fog: $('ap-pass').open
    });
  }

  function ticker(text) {
    $('ap-ticker').textContent = text;
  }

  function log(text, broken = false) {
    $('ap-log').prepend(node('li', text, broken ? 'ap-betrayal' : ''));
    while ($('ap-log').children.length > 180) $('ap-log').lastElementChild.remove();
  }

  function status() {
    if (!match) return;
    const game = match.game, c = counts(), t = trust(), units = game.units();
    $('ap-season').textContent = `${game.season}, Year ${game.year}`;
    $('ap-phase').textContent = phaseNames[game.phase];
    $('ap-standings').replaceChildren();
    [...names].sort((a, b) => c[b] - c[a] || names.indexOf(a) - names.indexOf(b)).forEach(power => {
      const row = node('li');
      row.style.setProperty('--power-color', powers.find(p => p.id === power).color);
      const record = t[power];
      const seat = seats[power];
      const controller = seat.human ? 'Human' :
        seat.custom ? `${seat.name} · ${seat.lab}` : seat.name;
      row.append(
        node('strong', power),
        node('span', `${c[power]} / 13 centres · ${units.filter(u => u.power === power).length} units`),
        node('span', controller),
        node('small', `kept ${record.kept} · broken ${record.broken} · made ${record.promisesMade}`)
      );
      $('ap-standings').append(row);
    });
    describeProvince();
  }

  function orderText(o) {
    if (o.type === 'hold') return `${place(o.unit)} holds`;
    if (o.type === 'move') return `${place(o.unit)} → ${place(o.dest)}`;
    return `${place(o.unit)} supports ${place(o.target)} ${
      o.targetDest === 'hold' ? 'holding' : `→ ${place(o.targetDest)}`}`;
  }

  function orderArrow(o, power, outcome) {
    return {
      from: o.unit,
      to: o.type === 'move' ? o.dest :
        o.type === 'support' ? o.targetDest === 'hold' ? o.target : o.targetDest : o.unit,
      kind: o.type === 'support' ? o.targetDest === 'hold' ? 'support-hold' : 'support' : o.type,
      power, outcome
    };
  }

  function syncEditor() {
    if (!unitInput || !actionInput) return;
    unitInput.value = selected || '';
    actionInput.replaceChildren();
    actionInput.add(new Option('Choose an order', ''));
    legal(active, selected).forEach((o, i) => actionInput.add(new Option(orderText(o), String(i))));
    actionInput.disabled = !selected;
  }

  function showOrders() {
    $('ap-orders').replaceChildren();
    draft.forEach((o, i) => {
      const row = node('li', orderText(o));
      row.append(button('Remove', () => {
        draft.splice(i, 1);
        showOrders();
      }));
      $('ap-orders').append(row);
    });
    $('ap-order-hint').textContent = support ?
      support.target ? 'Choose a highlighted destination; choose the target again to support its hold.' :
        'Choose a highlighted unit to support.' :
      selected ? 'Choose a highlighted destination, Hold or Support; or use the order selector.' :
        'Select your unit on the map or below. Unordered units hold.';
    $('ap-hold').disabled = !selected;
    $('ap-support').disabled = !selected || !legal(active, selected).some(o => o.type === 'support');
    cancelSelection.disabled = !selected;
    syncEditor();
    draw(draft.map(o => orderArrow(o, active)));
  }

  function addOrder(order) {
    draft = draft.filter(o => o.unit !== order.unit);
    draft.push({ ...order });
    selected = null;
    support = null;
    showOrders();
  }

  function pickProvince(id) {
    if ($('ap-pass').open) return;
    inspected = id;
    describeProvince();
    if (!active || match.game.phase !== 'orders') {
      if (active && picker?.isConnected && [...picker.options].some(o => o.value === id)) {
        picker.value = id;
        picker.dispatchEvent(new Event('change'));
      }
      draw();
      return;
    }
    const list = legal(active, selected);
    if (support && !support.target) {
      if (!list.some(o => o.type === 'support' && o.target === id)) {
        ticker('Choose one of the highlighted support targets, or clear the selection.');
        draw(draft.map(o => orderArrow(o, active)));
        return;
      }
      support.target = id;
      showOrders();
      return;
    }
    if (support) {
      const order = list.find(o => o.type === 'support' && o.target === support.target &&
        (id === support.target ? o.targetDest === 'hold' : o.targetDest === id));
      if (order) addOrder(order);
      else {
        ticker('That support is not legal. Choose a highlighted destination or clear the selection.');
        draw(draft.map(o => orderArrow(o, active)));
      }
      return;
    }
    if (selected) {
      const move = list.find(o => o.type === 'move' && o.dest === id);
      if (move) return addOrder(move);
    }
    if (match.game.units().some(u => u.at === id && u.power === active)) selected = id;
    showOrders();
  }

  function clearPrivate() {
    active = null;
    draft = [];
    selected = null;
    support = null;
    picker = null;
    unitInput = null;
    actionInput = null;
    editor.replaceChildren();
    for (const id of ['ap-negotiate', 'ap-order-panel', 'ap-adjust']) $(id).hidden = true;
    for (const id of ['ap-neg-body', 'ap-adjust-body', 'ap-orders', 'ap-promises']) $(id).replaceChildren();
    draw();
  }

  function commit(payload) {
    const result = match.submitHuman(active, payload);
    if (!result.ok) {
      ticker((result.errors || ['Invalid selection.']).join(' '));
      return;
    }
    clearPrivate();
    presentHuman();
  }

  function describeProposal(p) {
    const t = p.terms;
    const detail = p.type === 'alliance' ? `against ${t.target}` :
      p.type === 'dmz' ? place(t.province) :
        ['support', 'request-support'].includes(p.type) ?
          `${place(t.unit)} → ${t.dest === 'hold' ? 'hold' : place(t.dest)}` : 'no attacks this season';
    return `${p.from || active} → ${p.to}: ${p.type} (${detail})`;
  }

  function negotiation() {
    $('ap-negotiate').hidden = false;
    const body = $('ap-neg-body'), state = match.game.botState(active);
    body.append(node('h3', `${active}: ${phaseNames[state.phase]}`));
    if (state.phase === 'negotiate-answer') {
      const answers = {};
      if (!state.inbox.length) body.append(node('p', 'No incoming proposals.'));
      state.inbox.forEach(p => {
        const row = node('div', undefined, 'ap-deal');
        row.append(node('p', describeProposal(p)));
        const input = selectField(row, 'Response', [['reject', 'Reject'], ['accept', 'Accept']]);
        answers[p.id] = 'reject';
        input.addEventListener('change', () => { answers[p.id] = input.value; });
        body.append(row);
      });
      body.append(button('Done', () => commit(answers)));
      return;
    }
    body.append(node('p', 'Send up to six proposals. Accepted deals are promises, not enforced rules.'));
    const fields = node('div', undefined, 'ap-fields');
    body.append(fields);
    const type = selectField(fields, 'Deal type',
      ['peace', 'alliance', 'support', 'dmz', 'request-support'].map(t => [t, t]));
    const living = names.filter(p => p !== active &&
      (state.centresByPower[p] || state.units.some(u => u.power === p)));
    const partner = selectField(fields, 'Partner', living.map(p => [p, p]));
    const terms = node('div', undefined, 'ap-fields');
    body.append(terms);
    let readTerms = () => ({});
    function changeType() {
      terms.replaceChildren();
      picker = null;
      if (type.value === 'alliance') {
        const target = selectField(terms, 'Common enemy',
          living.filter(p => p !== partner.value).map(p => [p, p]));
        readTerms = () => ({ target: target.value });
      } else if (type.value === 'dmz') {
        const area = provinceField(terms, 'Demilitarized province');
        readTerms = () => ({ province: area.value });
      } else if (['support', 'request-support'].includes(type.value)) {
        const beneficiary = type.value === 'support' ? partner.value : active;
        const origin = provinceField(terms, 'Unit province',
          state.units.filter(u => u.power === beneficiary).map(u => province(u.at)));
        const dest = selectField(terms, 'Destination', []);
        function destinations() {
          dest.replaceChildren();
          dest.add(new Option('Hold', 'hold'));
          const unit = state.units.find(u => u.at === origin.value);
          if (unit) map.adjacency[unit.at].filter(id => PactEngine.canMove(unit, id))
            .forEach(id => dest.add(new Option(`${id} · ${place(id)}`, id)));
        }
        origin.addEventListener('change', destinations);
        destinations();
        dest.addEventListener('focus', () => { picker = dest; });
        readTerms = () => ({ unit: origin.value, dest: dest.value });
      } else readTerms = () => ({});
    }
    type.addEventListener('change', changeType);
    partner.addEventListener('change', changeType);
    changeType();
    const list = node('ol');
    const add = button('Add proposal', () => {
      const values = readTerms();
      if (draft.length >= 6 || !partner.value || Object.values(values).some(v => !v)) {
        ticker('Choose a living partner and all required terms.');
        return;
      }
      draft.push({ to: partner.value, type: type.value, terms: values });
      show();
    });
    function show() {
      list.replaceChildren();
      draft.forEach((p, i) => {
        const row = node('li', describeProposal(p));
        row.append(button('Remove', () => {
          draft.splice(i, 1);
          show();
        }));
        list.append(row);
      });
      add.disabled = draft.length >= 6;
    }
    body.append(add, list, button('Done', () => commit(structuredClone(draft))));
  }

  function adjustment() {
    $('ap-adjust').hidden = false;
    const body = $('ap-adjust-body'), game = match.game, state = game.botState(active);
    body.append(node('h3', `${active}: ${phaseNames[game.phase]}`));
    if (game.phase === 'retreats') {
      const payload = {};
      state.retreats.forEach(u => {
        const input = selectField(body, `Retreat from ${place(u.at)}`, [
          ['', 'Disband'], ...u.options.map(id => [id, `${id} · ${place(id)}`])
        ]);
        payload[u.at] = null;
        input.addEventListener('change', () => { payload[u.at] = input.value || null; });
      });
      if (!state.retreats.length) body.append(node('p', 'No retreats to select.'));
      body.append(button('Submit retreats', () => commit(payload)));
      return;
    }
    const own = state.units.filter(u => u.power === active);
    const delta = state.centresByPower[active] - own.length;
    body.append(node('p', delta >= 0 ?
      `You may build up to ${delta} units in empty owned home centres.` :
      `Disband ${-delta} units, or leave blank for the farthest-from-home rule.`));
    const inputs = [];
    if (delta > 0) {
      provinces.filter(p => p.home === active && state.owners[p.id] === active &&
        !state.units.some(u => u.at === p.id)).forEach(p => {
        const choices = [['', 'No build'], ['army', 'Army']];
        if (p.coastal) choices.push(['fleet', 'Fleet']);
        inputs.push({ at: p.id, input: selectField(body, p.name, choices) });
      });
    } else if (delta < 0) {
      own.forEach(u => inputs.push({
        at: u.at, input: selectField(body, place(u.at), [['', 'Keep'], ['disband', 'Disband']])
      }));
    }
    body.append(button('Submit adjustments', () => {
      const chosen = inputs.filter(x => x.input.value);
      if (chosen.length > Math.abs(delta)) return ticker('Too many adjustments selected.');
      commit(chosen.map(x => delta >= 0 ?
        { at: x.at, type: x.input.value } : { disband: x.at }));
    }));
  }

  function revealHuman(power) {
    active = power;
    ticker(`${power}: enter your private ${phaseNames[match.game.phase].toLowerCase()}.`);
    if (match.game.phase.startsWith('negotiate')) negotiation();
    else if (match.game.phase === 'orders') {
      $('ap-order-panel').hidden = false;
      $('ap-order-title').textContent = `${power}: Secret orders`;
      match.game.botState(power).accepted.forEach(p => {
        const t = p.terms;
        const detail = t.province ? place(t.province) :
          t.unit ? `${place(t.unit)} → ${t.dest === 'hold' ? 'hold' : place(t.dest)}` :
            t.target || 'no attacks';
        $('ap-promises').append(node('li', `${p.power} → ${p.partner}: ${p.type} (${detail})`));
      });
      unitInput = selectField(editor, 'Your unit', [
        ['', 'Choose a unit'],
        ...match.game.units().filter(u => u.power === active)
          .map(u => [u.at, `${u.at} · ${place(u.at)} · ${u.type}`])
      ]);
      actionInput = selectField(editor, 'Legal order', []);
      unitInput.addEventListener('change', () => {
        selected = unitInput.value || null;
        support = null;
        showOrders();
      });
      actionInput.addEventListener('change', () => {
        if (actionInput.value === '') return;
        const order = legal(active, selected)[Number(actionInput.value)];
        if (order) addOrder(order);
      });
      showOrders();
    } else adjustment();
    draw(draft.map(o => orderArrow(o, active)));
    const panel = match.game.phase.startsWith('negotiate') ? $('ap-neg-body') :
      match.game.phase === 'orders' ? editor : $('ap-adjust-body');
    panel.querySelector('select, button')?.focus({ preventScroll: true });
  }

  function presentHuman() {
    const next = match.waitingFor()[0];
    if (!next) {
      ticker('Waiting for strategists…');
      return;
    }
    if (Object.values(seats).filter(s => s.human).length > 1) {
      $('ap-pass-title').textContent = `Pass the device to ${next}`;
      $('ap-pass-confirm').textContent = `I am ${next}`;
      $('ap-pass-confirm').onclick = () => {
        $('ap-pass').close();
        revealHuman(next);
      };
      if (!$('ap-pass').open) $('ap-pass').showModal();
      draw();
    } else revealHuman(next);
  }

  function report(result, season, oldOwners) {
    for (const event of result.events || []) {
      if (event.type === 'promise') {
        const broken = event.outcome === 'broken';
        log(`${event.power} ${broken ? 'broke' : 'kept'} ${event.promiseType} with ${event.partner}.`, broken);
      } else if (event.type === 'bot-fallback') {
        log(`${event.power}: safe ${event.call} defaults (${event.reason}).`);
      } else if (event.type === 'retreat') {
        log(`${event.power}: ${place(event.from)} ${event.to ? `retreats to ${place(event.to)}` : 'is disbanded'}.`);
      } else if (event.type === 'build' || event.type === 'disband') {
        log(`${event.power}: ${event.type} at ${place(event.at)}.`);
      }
    }
    for (const order of result.resolution || []) {
      if (order.type === 'move' || order.outcome === 'dislodged' || order.outcome === 'cut' ||
          order.outcome === 'invalid') {
        log(`${season}: ${order.power} — ${orderText(order)} · ${order.outcome}.`);
      }
    }
    const owners = match.game.owners();
    Object.keys(owners).forEach(id => {
      if (owners[id] && owners[id] !== oldOwners[id]) log(`${owners[id]} captures ${place(id)}.`);
    });
  }

  function pause(ms) {
    return new Promise(resolve => {
      wake = resolve;
      sleepTimer = setTimeout(() => {
        wake = null;
        sleepTimer = null;
        resolve();
      }, ms);
    });
  }

  function finish() {
    const result = match.game.result();
    if (!result) return;
    $('ap-result').textContent = result.shared.length ?
      `Shared victory: ${result.shared.join(', ')} · Year ${result.year}` :
      `${result.winner} wins with ${result.centres[result.winner]} centres · Year ${result.year}`;
    $('ap-result').hidden = false;
    ticker('The pact is settled. Start another game to change history.');
    match.stop();
  }

  function lock(value) {
    selects.forEach(input => { input.disabled = value; });
    for (const id of ['ap-years', 'ap-random', 'ap-start']) $(id).disabled = value;
    $('ap-start').textContent = running ? 'Playing…' : 'Start';
  }

  function seatFor(id) {
    if (id === 'human') return { human: true };
    if (id === 'custom' && customBot) {
      return {
        id: 'custom',
        name: customBot.name,
        human: false,
        lab: 'You',
        custom: { name: customBot.name, code: customBot.code }
      };
    }
    const bot = bots.find(b => b.id === id);
    if (!bot) throw new Error('Choose an available strategist for every power.');
    return { id: bot.id, name: bot.name };
  }

  function updateCustomOptions() {
    selects.forEach(input => {
      const option = [...input.options].find(entry => entry.value === 'custom');
      if (option) {
        option.textContent = customBot ?
          `Your bot: ${customBot.name}` : 'Your bot (upload…)';
      }
    });
  }

  async function chooseSeat(event) {
    const input = event.currentTarget;
    const previous = previousChoices.get(input) || 'human';
    if (running || picking) {
      input.value = previous;
      return;
    }
    if (input.value !== 'custom') {
      previousChoices.set(input, input.value);
      return;
    }

    picking = true;
    lock(true);
    let errorMessage = '';
    try {
      // Open the picker before the first await, while handling the user gesture.
      const chosen = await ArenaCustomBot.pick({ game: 'anatolian-pact' });
      if (chosen) {
        customBot = chosen;
        previousChoices.set(input, 'custom');
        updateCustomOptions();
      } else {
        input.value = previous;
      }
    } catch (error) {
      input.value = previous;
      errorMessage = String((error && error.message) || 'Could not read bot file');
    } finally {
      picking = false;
      lock(running);
      ticker(errorMessage || 'Choose who controls each power, then press Start.');
    }
  }

  async function start() {
    if (running || picking) return;
    if ([...selects.values()].some(input => input.value === 'custom') && !customBot) {
      ticker('Choose Your bot (upload…) and load a JavaScript bot first.');
      return;
    }
    const token = ++generation;
    running = true;
    lock(true);
    match?.stop();
    $('ap-log').replaceChildren();
    $('ap-result').hidden = true;
    replay = [];
    try {
      seats = Object.fromEntries(names.map(power => [
        power, seatFor(selects.get(power).value)
      ]));
      match = PactRunner.start(seats, {
        seed: crypto.getRandomValues(new Uint32Array(1))[0],
        maxYears: Number($('ap-years').value)
      });
      clearPrivate();
      ticker('Loading strategists…');
      await match.loaded;
      while (running && token === generation && !match.game.finished()) {
        status();
        const oldPhase = match.game.phase;
        const season = `${match.game.season}, Year ${match.game.year}`;
        const oldOwners = match.game.owners();
        const next = match.next();
        presentHuman();
        const result = await next;
        if (!running || token !== generation) return;
        clearPrivate();
        report(result, season, oldOwners);
        if (oldPhase === 'negotiate-answer') {
          match.game.proposals().filter(p => p.status === 'accepted')
            .forEach(p => log(`Accepted: ${describeProposal(p)}`));
        }
        status();
        if (oldPhase === 'orders') {
          replay = (result.resolution || []).map(o => orderArrow(o, o.power, o.outcome));
          draw(replay);
          ticker(`${season}: orders revealed.`);
          await pause(Number($('ap-speed').value));
        } else {
          draw();
          await pause(0);
        }
      }
      if (token === generation) {
        status();
        finish();
      }
    } catch (error) {
      if (token !== generation) return;
      match?.stop();
      clearPrivate();
      ticker(`Match stopped: ${error.message}`);
    } finally {
      if (token === generation) {
        running = false;
        lock(false);
      }
    }
  }

  function makeSeats() {
    const params = new URLSearchParams(location.search);
    const requested = (params.get('powers') || '').split(',');
    powers.forEach((power, i) => {
      const row = node('tr'), label = node('th'), cell = node('td');
      label.scope = 'row';
      const swatch = node('span', '', 'ap-swatch');
      swatch.style.setProperty('--power-color', power.color);
      label.append(swatch, document.createTextNode(power.id));
      const input = node('select');
      input.setAttribute('aria-label', `${power.id} controller`);
      input.append($('ap-seat-options').content.cloneNode(true));
      bots.forEach(bot => input.add(new Option(`${bot.name} · ${bot.lab}`, bot.id)));
      const choice = requested[i] || defaults[i];
      // URL parameters cannot upload code or open a file picker.
      input.value = choice === 'human' || (choice === 'custom' && customBot) ||
        bots.some(b => b.id === choice) ? choice : defaults[i];
      previousChoices.set(input, input.value);
      input.addEventListener('change', chooseSeat);
      cell.append(input);
      row.append(label, cell);
      $('ap-seats').append(row);
      selects.set(power.id, input);
    });
    updateCustomOptions();
    if (['6', '9', '12'].includes(params.get('years'))) $('ap-years').value = params.get('years');
    if (params.get('speed') === '0') $('ap-speed').value = '0';
    bots.forEach(bot => {
      const li = node('li');
      li.append(node('strong', bot.name), node('span', ` · ${bot.lab} · ${bot.botName}`), node('p', bot.note));
      $('ap-list').append(li);
    });
    $('ap-start').disabled = false;
    $('ap-random').disabled = false;
    ticker('Choose who controls each power, then press Start.');
    if (params.get('autostart') === '1') start();
  }

  $('ap-form').addEventListener('submit', event => {
    event.preventDefault();
    start();
  });
  $('ap-random').addEventListener('click', () => {
    if (running || picking) return;
    const random = PactEngine.rng(crypto.getRandomValues(new Uint32Array(1))[0]);
    selects.forEach(input => {
      input.value = bots[Math.floor(random() * bots.length)].id;
      previousChoices.set(input, input.value);
    });
  });
  $('ap-hold').addEventListener('click', () => {
    if (selected) addOrder({ unit: selected, type: 'hold' });
  });
  $('ap-support').addEventListener('click', () => {
    if (selected) {
      support = {};
      showOrders();
    }
  });
  $('ap-submit-orders').addEventListener('click', () => commit(structuredClone(draft)));
  $('ap-pass').addEventListener('cancel', event => event.preventDefault());
  $('ap-order-panel').addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      selected = null;
      support = null;
      showOrders();
    }
  });

  window.addEventListener('pagehide', event => {
    running = false;
    generation++;
    match?.stop();
    clearTimeout(sleepTimer);
    wake?.();
    sleepTimer = null;
    wake = null;
    $('ap-pass').close();
    $('ap-pass-confirm').onclick = null;
    clearPrivate();
    // The old generation's finally must not unlock a later match.
    lock(picking);
    if (!event.persisted) renderer.destroy();
  });

  window.__ANATOLIAN_PACT__ = () => ({
    bots: bots.map(b => ({ ...b })),
    running,
    powers: names.map(power => {
      const seat = seats[power];
      const id = seat ? seat.human ? 'human' : seat.id :
        selects.get(power)?.value || defaults[names.indexOf(power)];
      return { power, kind: id === 'human' ? 'human' : 'bot', id: id === 'human' ? null : id };
    }),
    year: match?.game.year || 1,
    season: match?.game.season || 'Spring',
    phase: match?.game.phase || 'setup',
    waitingFor: match ? match.waitingFor() : [],
    ticker: $('ap-ticker').textContent,
    result: match?.game.finished() ? match.game.result() : null,
    centres: counts(),
    trust: structuredClone(trust())
  });

  fetch('bots.json', { cache: 'no-cache' }).then(response => {
    if (!response.ok) throw new Error('The bot roster could not be loaded.');
    return response.json();
  }).then(manifest => {
    const seen = new Set();
    bots = manifest.bots.filter(bot => {
      if (!/^[a-z0-9][a-z0-9.-]*$/.test(bot.id) || bot.id.includes('..') ||
          bot.id === 'human' || bot.id === 'custom' || seen.has(bot.id)) return false;
      seen.add(bot.id);
      return true;
    });
    if (!bots.length) throw new Error('No valid strategists are available.');
    customBot = ArenaCustomBot.get('anatolian-pact');
    makeSeats();
  }).catch(error => ticker(error.message));
})();
