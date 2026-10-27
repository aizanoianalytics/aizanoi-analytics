(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const map = PactEngine.MAP;
  const provinces = Array.isArray(map.provinces) ? map.provinces : Object.values(map.provinces);
  const powers = Array.isArray(map.powers) ? map.powers :
    Object.entries(map.powers).map(([id, p]) => ({ id, ...p }));
  const names = powers.map(p => p.id || p.name);
  const province = id => provinces.find(p => p.id === id);
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

  let bots = [];
  let match = null;
  let running = false;
  let seats = {};
  let active = null;
  let draft = [];
  let selected = null;
  let support = null;
  let picker = null;
  let replay = [];
  let battle = [];
  let beforeUnits = [];
  let sleepTimer = null;
  let wake = null;
  let generation = 0;
  const selects = new Map();
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
    const select = node('select');
    choices.forEach(([value, text]) => select.add(new Option(text, value)));
    wrap.append(select);
    parent.append(wrap);
    return select;
  }

  function provinceField(parent, label, choices = provinces) {
    const select = selectField(parent, label, choices.map(p => [p.id, p.name]));
    select.addEventListener('focus', () => { picker = select; });
    return select;
  }

  function counts() {
    const centres = Object.fromEntries(names.map(p => [p, 0]));
    if (match) {
      Object.values(match.game.owners()).forEach(p => {
        if (p in centres) centres[p]++;
      });
    }
    return centres;
  }

  function trust() {
    if (!match) return {};
    return match.game.botState(names[0]).trust;
  }

  function draw(arrows = []) {
    const highlight = selected ?
      legal(active, selected).filter(o => o.type === 'move').map(o => o.dest) : [];
    renderer.update(match?.game || null, {
      selected,
      highlight,
      arrows,
      fog: $('ap-pass').open
    });
  }

  function ticker(text) {
    $('ap-ticker').textContent = text;
  }

  function log(text, broken = false) {
    const li = node('li', text, broken ? 'ap-betrayal' : '');
    $('ap-log').prepend(li);
    while ($('ap-log').children.length > 180) $('ap-log').lastElementChild.remove();
  }

  function status() {
    if (!match) return;
    const game = match.game;
    $('ap-season').textContent = `${game.season}, Year ${game.year}`;
    $('ap-phase').textContent = phaseNames[game.phase] || game.phase;
    const c = counts();
    const t = trust();
    const units = game.units();
    $('ap-standings').replaceChildren();
    [...names].sort((a, b) => c[b] - c[a] || names.indexOf(a) - names.indexOf(b)).forEach(power => {
      const row = node('li');
      const record = t[power] || {};
      row.append(
        node('strong', power),
        node('span', `${c[power]} centres · ${units.filter(u => u.power === power).length} units`),
        node('span', seats[power].human ? 'Human' : seats[power].name),
        node('small', `kept ${record.kept || 0} / broken ${record.broken || 0}`)
      );
      $('ap-standings').append(row);
    });
  }

  function legal(power, at) {
    const orders = match.game.legalOrders(power);
    if (Array.isArray(orders)) {
      if (orders.every(o => typeof o.type === 'string')) {
        return orders.filter(o => o.unit === at);
      }
      const entry = orders.find(o => o.unit === at || o.at === at);
      return entry ? entry.orders || entry.legal || [] : [];
    }
    return orders[at] || [];
  }

  function orderText(o) {
    if (o.type === 'hold') return `${place(o.unit)} holds`;
    if (o.type === 'move') return `${place(o.unit)} → ${place(o.dest)}`;
    const holding = !o.targetDest || o.targetDest === 'hold' || o.targetDest === o.target;
    return `${place(o.unit)} supports ${place(o.target)} ${holding ? 'holding' : `→ ${place(o.targetDest)}`}`;
  }

  function orderArrow(o, power, outcome) {
    const hold = !o.targetDest || o.targetDest === 'hold' || o.targetDest === o.target;
    return {
      from: o.unit,
      to: o.type === 'move' ? o.dest :
        o.type === 'support' ? hold ? o.target : o.targetDest : o.unit,
      kind: o.type === 'support' ? hold ? 'support-hold' : 'support' : o.type,
      power,
      outcome
    };
  }

  function showOrders() {
    const list = $('ap-orders');
    list.replaceChildren();
    draft.forEach((o, i) => {
      const row = node('li', orderText(o));
      row.append(button('Remove', () => {
        draft.splice(i, 1);
        showOrders();
      }));
      list.append(row);
    });
    $('ap-order-hint').textContent = support ?
      support.target ?
        'Choose the supported destination; click its origin to support a hold.' :
        'Choose the unit to support.' :
      selected ?
        'Choose a highlighted destination, Hold, or Support.' :
        'Select one of your units. Unordered units hold.';
    draw(draft.map(o => orderArrow(o, active)));
  }

  function addOrder(order) {
    draft = draft.filter(o => o.unit !== order.unit);
    draft.push(order);
    support = null;
    selected = null;
    showOrders();
  }

  function pickProvince(id) {
    if (!active || $('ap-pass').open) return;
    if (match.game.phase !== 'orders') {
      if (picker && [...picker.options].some(o => o.value === id)) {
        picker.value = id;
        picker.dispatchEvent(new Event('change'));
      }
      return;
    }
    const units = match.game.units();
    if (support && !support.target) {
      if (id === selected || !units.some(u => u.at === id)) return;
      support.target = id;
      $('ap-order-hint').textContent =
        'Choose a destination, or click this unit again to support its hold.';
      return;
    }
    if (support) {
      const candidates = legal(active, selected)
        .filter(o => o.type === 'support' && o.target === support.target);
      const order = candidates.find(o => id === support.target ?
        !o.targetDest || o.targetDest === 'hold' || o.targetDest === id :
        o.targetDest === id);
      if (order) addOrder(order);
      else ticker('That support is not legal. Choose another destination or select Hold.');
      return;
    }
    if (selected) {
      const move = legal(active, selected).find(o => o.type === 'move' && o.dest === id);
      if (move) {
        addOrder(move);
        return;
      }
    }
    if (units.some(u => u.at === id && u.power === active)) {
      selected = id;
      showOrders();
    }
  }

  function clearPrivate() {
    active = null;
    draft = [];
    selected = null;
    support = null;
    picker = null;
    $('ap-negotiate').hidden = true;
    $('ap-order-panel').hidden = true;
    $('ap-adjust').hidden = true;
    $('ap-neg-body').replaceChildren();
    $('ap-adjust-body').replaceChildren();
    $('ap-orders').replaceChildren();
    $('ap-promises').replaceChildren();
    draw();
  }

  function commit(payload) {
    const result = match.submitHuman(active, payload);
    if (!result.ok) {
      ticker(result.errors.join(' '));
      return;
    }
    clearPrivate();
    presentHuman();
  }

  function describeProposal(p) {
    const terms = p.terms || {};
    const detail = p.type === 'alliance' ? `against ${terms.target}` :
      p.type === 'dmz' ? place(terms.province) :
        ['support', 'request-support'].includes(p.type) ?
          `${place(terms.unit)} → ${terms.dest === 'hold' ? 'hold' : place(terms.dest)}` :
          'no attacks this season';
    return `${p.from || active} → ${p.to}: ${p.type} (${detail})`;
  }

  function negotiation() {
    $('ap-negotiate').hidden = false;
    const body = $('ap-neg-body');
    const state = match.game.botState(active);
    body.append(node('h3', `${active}: ${phaseNames[state.phase]}`));
    if (state.phase === 'negotiate-answer') {
      const answers = {};
      if (!state.inbox.length) body.append(node('p', 'No incoming proposals.'));
      state.inbox.forEach(p => {
        const row = node('div', undefined, 'ap-deal');
        row.append(node('p', describeProposal(p)));
        const input = selectField(row, 'Response', [
          ['reject', 'Reject'], ['accept', 'Accept']
        ]);
        answers[p.id] = 'reject';
        input.addEventListener('change', () => { answers[p.id] = input.value; });
        body.append(row);
      });
      body.append(button('Done', () => commit(answers)));
      return;
    }

    body.append(node('p',
      'Send up to six structured proposals. Acceptance is answered in the next round.'));
    const fields = node('div', undefined, 'ap-fields');
    body.append(fields);
    const type = selectField(fields, 'Deal type',
      ['peace', 'alliance', 'support', 'dmz', 'request-support'].map(t => [t, t]));
    const partner = selectField(fields, 'Partner',
      names.filter(p => p !== active).map(p => [p, p]));
    const terms = node('div', undefined, 'ap-fields');
    body.append(terms);
    let readTerms = () => ({});

    function changeType() {
      terms.replaceChildren();
      picker = null;
      if (type.value === 'alliance') {
        const target = selectField(terms, 'Common enemy',
          names.filter(p => p !== active && p !== partner.value).map(p => [p, p]));
        readTerms = () => ({ target: target.value });
      } else if (type.value === 'dmz') {
        const area = provinceField(terms, 'Demilitarized province');
        readTerms = () => ({ province: area.value });
      } else if (['support', 'request-support'].includes(type.value)) {
        const unitPower = type.value === 'support' ? partner.value : active;
        const locations = match.game.units()
          .filter(u => u.power === unitPower).map(u => province(u.at));
        const origin = provinceField(terms, 'Unit province', locations);
        const dest = selectField(terms, 'Destination', [
          ['hold', 'Hold'], ...provinces.map(p => [p.id, p.name])
        ]);
        dest.addEventListener('focus', () => { picker = dest; });
        readTerms = () => ({ unit: origin.value, dest: dest.value });
      } else {
        readTerms = () => ({});
      }
    }

    type.addEventListener('change', changeType);
    partner.addEventListener('change', changeType);
    changeType();
    const list = node('ol');
    const add = button('Add proposal', () => {
      if (draft.length >= 6) return;
      const values = readTerms();
      if (Object.values(values).some(v => !v)) {
        ticker('Choose all required terms.');
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

    body.append(add, list, button('Done', () =>
      commit(draft.map(p => ({ ...p, terms: { ...p.terms } })))));
  }

  function canEnter(unit, dest) {
    const a = province(unit.at);
    const b = province(dest);
    if (!a || !b || !(map.adjacency[a.id] || []).includes(b.id)) return false;
    if (unit.type === 'army') return b.type === 'land';
    if (b.type === 'land' && !b.coastal) return false;
    return a.type !== 'land' || b.type !== 'land' ||
      map.adjacency[a.id].some(id =>
        province(id).type === 'sea' && map.adjacency[b.id].includes(id));
  }

  function adjustment() {
    $('ap-adjust').hidden = false;
    const body = $('ap-adjust-body');
    const game = match.game;
    body.append(node('h3', `${active}: ${phaseNames[game.phase]}`));
    if (game.phase === 'retreats') {
      const payload = {};
      const current = game.units();
      const state = game.botState(active);
      const inferred = beforeUnits.filter(u => u.power === active &&
        current.some(v => v.at === u.at && v.power !== active) &&
        !battle.some(r => r.unit === u.at && r.outcome === 'success' && r.type === 'move'));
      const dislodged = state.retreats || inferred;
      dislodged.forEach(u => {
        const attack = battle.find(r =>
          r.type === 'move' && r.dest === u.at && r.outcome === 'success');
        const candidates = u.options ? u.options.map(province) :
          provinces.filter(p => canEnter(u, p.id) &&
            !current.some(v => v.at === p.id) && p.id !== attack?.unit &&
            battle.filter(r =>
              r.type === 'move' && r.dest === p.id && r.outcome === 'bounce').length < 2);
        const input = selectField(body, `Retreat from ${place(u.at)}`, [
          ['', 'Disband'], ...candidates.map(p => [p.id, p.name])
        ]);
        payload[u.at] = null;
        input.addEventListener('change', () => { payload[u.at] = input.value || null; });
      });
      if (!dislodged.length) {
        body.append(node('p',
          'No retreats to select. Unspecified retreats use the engine default.'));
      }
      body.append(button('Submit retreats', () => commit(payload)));
      return;
    }

    const ownUnits = game.units().filter(u => u.power === active);
    const delta = counts()[active] - ownUnits.length;
    body.append(node('p', delta >= 0 ?
      `You may build ${delta} units in empty owned home centres.` :
      `Disband ${-delta} units, or leave blank for the farthest-from-home rule.`));
    const inputs = [];
    if (delta > 0) {
      provinces.filter(p => p.home === active && game.owners()[p.id] === active &&
        !game.units().some(u => u.at === p.id)).forEach(p => {
        const choices = [['', 'No build'], ['army', 'Army']];
        if (p.coastal) choices.push(['fleet', 'Fleet']);
        inputs.push({ at: p.id, input: selectField(body, p.name, choices) });
      });
    } else if (delta < 0) {
      ownUnits.forEach(u => inputs.push({
        at: u.at,
        input: selectField(body, place(u.at), [['', 'Keep'], ['disband', 'Disband']])
      }));
    }
    body.append(button('Submit adjustments', () => {
      const chosen = inputs.filter(x => x.input.value);
      if (delta >= 0 && chosen.length > delta || delta < 0 && chosen.length > -delta) {
        ticker('Too many adjustments selected.');
        return;
      }
      commit(chosen.map(x => delta >= 0 ?
        { at: x.at, type: x.input.value } : { disband: x.at }));
    }));
  }

  function revealHuman(power) {
    active = power;
    ticker(`${power}: enter your private ${phaseNames[match.game.phase].toLowerCase()}.`);
    if (match.game.phase.startsWith('negotiate')) {
      negotiation();
    } else if (match.game.phase === 'orders') {
      $('ap-order-panel').hidden = false;
      $('ap-order-title').textContent = `${power}: Secret orders`;
      match.game.botState(power).accepted.forEach(p => {
        const t = p.terms || {};
        const detail = t.province ? place(t.province) :
          t.unit ? `${place(t.unit)} → ${t.dest === 'hold' ? 'hold' : place(t.dest)}` :
            t.target || 'no attacks';
        $('ap-promises').append(node('li',
          `${p.power || p.from} → ${p.partner || p.to}: ${p.type} (${detail})`));
      });
      showOrders();
    } else {
      adjustment();
    }
    draw();
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
      $('ap-pass').showModal();
      draw();
    } else {
      revealHuman(next);
    }
  }

  function resolutionRows(value) {
    const list = Array.isArray(value) ? value : value?.orders || [];
    return list.map(r => ({
      ...(r.order || r),
      outcome: r.outcome,
      power: r.power || r.order?.power ||
        beforeUnits.find(u => u.at === (r.order?.unit || r.unit))?.power
    }));
  }

  function report(result, season, oldOwners) {
    for (const event of result.events || []) {
      if (typeof event === 'string') {
        log(event, /broke|betray|broken/i.test(event));
      } else {
        const message = event.message || event.text;
        if (message) {
          log(message, /broke|betray|broken/i.test(message));
        } else if (event.type === 'promise') {
          const broken = event.outcome === 'broken';
          const attack = battle.find(o => o.power === event.power &&
            (o.type === 'move' || o.type === 'support') &&
            beforeUnits.some(u =>
              u.at === (o.dest || o.targetDest) && u.power === event.partner));
          const detail = attack ? ` (${place(attack.dest || attack.targetDest)} attack)` : '';
          log(`${event.power} ${broken ? 'broke' : 'kept'} ${event.promiseType || 'a promise'} with ${event.partner}${broken ? detail : ''}.`, broken);
        } else if (event.type) {
          const broken = /broke|betray|broken/.test(event.type) || event.outcome === 'broken';
          const detail = [
            event.power,
            event.type,
            event.partner || event.to,
            event.province ? place(event.province) : ''
          ].filter(Boolean).join(' ');
          log(`${season}: ${detail}`, broken);
        }
      }
    }
    const owners = match.game.owners();
    Object.keys(owners).forEach(id => {
      if (owners[id] !== oldOwners[id] && owners[id]) {
        log(`${owners[id]} captures ${place(id)}.`);
      }
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
    const c = result.centres;
    $('ap-result').textContent = result.shared?.length > 1 ?
      `Shared victory: ${result.shared.join(', ')} after ${result.year} years` :
      result.reason === 'majority' ?
        `${result.winner} wins with ${c[result.winner]} centres` :
        `${result.winner} wins with ${c[result.winner]} centres after ${result.year} years`;
    $('ap-result').hidden = false;
    ticker('The pact is settled. Start another game to change history.');
    match.stop();
  }

  function lock(value) {
    selects.forEach(s => { s.disabled = value; });
    $('ap-years').disabled = value;
    $('ap-random').disabled = value;
    $('ap-start').disabled = value;
    $('ap-start').textContent = value ? 'Playing…' : 'Start';
  }

  async function start() {
    if (running) return;
    const token = ++generation;
    running = true;
    lock(true);
    if (match) match.stop();
    seats = Object.fromEntries(names.map(power => {
      const id = selects.get(power).value;
      const bot = bots.find(b => b.id === id);
      return [power, id === 'human' ? { human: true } : { id, name: bot.name }];
    }));
    $('ap-log').replaceChildren();
    $('ap-result').hidden = true;
    replay = [];
    battle = [];
    try {
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
        const oldOwners = { ...match.game.owners() };
        const proposed = structuredClone(match.game.proposals());
        if (oldPhase === 'orders') {
          beforeUnits = match.game.units().map(u => ({ ...u }));
        }
        const next = match.next();
        presentHuman();
        const result = await next;
        if (!running || token !== generation) return;
        clearPrivate();
        if (oldPhase === 'orders') battle = resolutionRows(result.resolution);
        report(result, season, oldOwners);
        if (oldPhase === 'negotiate-answer') {
          const accepted = match.game.proposals()
            .filter(p => p.status === 'accepted' || p.status === 'accept');
          const fallback = proposed
            .filter(p => p.status === 'accepted' || p.status === 'accept');
          (accepted.length ? accepted : fallback).forEach(p =>
            log(`Accepted: ${describeProposal(p)}`));
        }
        if (oldPhase === 'orders') {
          battle = resolutionRows(result.resolution);
          replay = battle.map(r => orderArrow(r, r.power, r.outcome));
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
      if (match) match.stop();
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
    const body = $('ap-seats');
    powers.forEach((power, i) => {
      const id = power.id || power.name;
      const row = node('tr');
      const label = node('th');
      label.scope = 'row';
      const swatch = node('span', '', 'ap-swatch');
      swatch.style.setProperty('--power-color', power.color);
      label.append(swatch, document.createTextNode(id));
      const cell = node('td');
      const select = node('select');
      select.setAttribute('aria-label', `${id} controller`);
      select.add(new Option('Human', 'human'));
      bots.forEach(bot => select.add(new Option(`${bot.name} · ${bot.lab}`, bot.id)));
      const choice = requested[i] || defaults[i];
      select.value = choice === 'human' || bots.some(b => b.id === choice) ?
        choice : defaults[i];
      cell.append(select);
      row.append(label, cell);
      body.append(row);
      selects.set(id, select);
    });
    if (['6', '9', '12'].includes(params.get('years'))) {
      $('ap-years').value = params.get('years');
    }
    if (params.get('speed') === '0') $('ap-speed').value = '0';
    bots.forEach(bot => {
      const li = node('li');
      li.append(
        node('strong', bot.name),
        node('span', ` · ${bot.lab} · ${bot.botName}`),
        node('p', bot.note)
      );
      $('ap-list').append(li);
    });
    $('ap-start').disabled = false;
    $('ap-random').disabled = false;
    if (params.get('autostart') === '1') start();
  }

  $('ap-form').addEventListener('submit', event => {
    event.preventDefault();
    start();
  });
  $('ap-random').addEventListener('click', () => {
    const rng = PactEngine.rng(crypto.getRandomValues(new Uint32Array(1))[0]);
    selects.forEach(select => {
      select.value = bots[Math.floor(rng() * bots.length)].id;
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
  $('ap-submit-orders').addEventListener('click', () =>
    commit(draft.map(o => ({ ...o }))));
  $('ap-pass').addEventListener('cancel', event => event.preventDefault());

  window.addEventListener('pagehide', () => {
    running = false;
    generation++;
    if (match) match.stop();
    clearTimeout(sleepTimer);
    if (wake) wake();
    renderer.destroy();
  }, { once: true });

  window.__ANATOLIAN_PACT__ = () => ({
    bots: bots.map(b => ({ ...b })),
    running,
    powers: names.map(power => {
      const seat = seats[power];
      const id = seat ? seat.human ? 'human' : seat.id :
        selects.get(power)?.value || defaults[names.indexOf(power)];
      return {
        power,
        kind: id === 'human' ? 'human' : 'bot',
        id: id === 'human' ? null : id
      };
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
      if (!/^[a-z0-9][a-z0-9.-]*$/.test(bot.id) ||
        bot.id.includes('..') || seen.has(bot.id)) return false;
      seen.add(bot.id);
      return true;
    });
    if (!bots.length) throw new Error('No valid strategists are available.');
    makeSeats();
  }).catch(error => ticker(error.message));
})();
