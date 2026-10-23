const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

function element(doc, tag, className, text) {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function meter(doc, name, className) {
  const wrapper = element(doc, 'div', `az-hud-meter ${className}`);
  const label = element(doc, 'span', 'az-hud-meter-label', name);
  const value = element(doc, 'progress', 'az-hud-meter-track');
  value.setAttribute('role', 'progressbar');
  value.setAttribute('aria-label', name);
  value.setAttribute('min', '0');
  value.setAttribute('max', '100');
  value.setAttribute('value', '100');
  value.setAttribute('aria-valuemin', '0');
  value.setAttribute('aria-valuemax', '100');
  value.setAttribute('aria-valuenow', '100');
  const readout = element(doc, 'span', 'az-hud-meter-value', '100 / 100');
  wrapper.append(label, value, readout);
  return { wrapper, value, readout };
}

function setMeter(meterNode, current, maximum) {
  const max = Math.max(1, Number(maximum) || 1);
  const value = clamp(current, 0, max);
  meterNode.value.setAttribute('max', String(max));
  meterNode.value.setAttribute('value', String(value));
  meterNode.value.setAttribute('aria-valuemin', '0');
  meterNode.value.setAttribute('aria-valuemax', String(max));
  meterNode.value.setAttribute('aria-valuenow', String(value));
  meterNode.readout.textContent = `${Math.round(value)} / ${Math.round(max)}`;
}

/** Build an independent, class-driven HUD. No inline styles are emitted. */
export function createHud({ container, document: doc = globalThis.document } = {}) {
  if (!container || !doc?.createElement) throw new TypeError('createHud requires a container and document');

  const root = element(doc, 'section', 'az-hud');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Dungeon status');
  // The HUD stays hidden behind the attract menu until the run begins.
  root.hidden = true;

  const top = element(doc, 'div', 'az-hud-top');
  const vitals = element(doc, 'div', 'az-hud-vitals');
  const health = meter(doc, 'Health', 'az-hud-health');
  const stamina = meter(doc, 'Stamina', 'az-hud-stamina');
  const xp = meter(doc, 'Experience', 'az-hud-xp');
  vitals.append(health.wrapper, stamina.wrapper, xp.wrapper);

  const run = element(doc, 'div', 'az-hud-run');
  const chapter = element(doc, 'p', 'az-hud-chapter', 'Chapter I');
  const wave = element(doc, 'p', 'az-hud-wave', 'Wave 1');
  const gold = element(doc, 'p', 'az-hud-gold', '0 gold');
  gold.setAttribute('aria-label', 'Gold: 0');
  run.append(chapter, wave, gold);
  top.append(vitals, run);

  const boss = meter(doc, 'Boss health', 'az-hud-boss');
  boss.wrapper.hidden = true;
  boss.wrapper.setAttribute('aria-hidden', 'true');
  const bossName = element(doc, 'strong', 'az-hud-boss-name', 'Boss');
  if (typeof boss.wrapper.prepend === 'function') boss.wrapper.prepend(bossName);
  else boss.wrapper.append(bossName);

  const combo = element(doc, 'output', 'az-hud-combo', '');
  combo.setAttribute('aria-label', 'Combo');
  combo.hidden = true;
  const assistChip = element(doc, 'p', 'az-hud-assist', 'ASSIST');
  assistChip.setAttribute('aria-label', 'Assist mode: Assist');
  const special = meter(doc, 'Wrath', 'az-hud-special');
  const crosshair = element(doc, 'div', 'az-hud-crosshair');
  crosshair.setAttribute('aria-hidden', 'true');
  const vignette = element(doc, 'div', 'az-hud-damage-vignette');
  vignette.setAttribute('aria-hidden', 'true');

  const lootFeed = element(doc, 'ol', 'az-hud-loot-feed');
  lootFeed.setAttribute('aria-live', 'polite');
  lootFeed.setAttribute('aria-label', 'Recent loot');
  const announcer = element(doc, 'div', 'az-hud-announcer');
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'assertive');
  announcer.setAttribute('aria-atomic', 'true');

  // The blessings the player has claimed. Without this the player cannot see
  // what their build actually does, which makes the 12 blessings unreadable.
  const blessings = element(doc, 'ul', 'az-hud-blessings');
  blessings.setAttribute('aria-label', 'Claimed blessings');
  blessings.hidden = true;

  const pause = element(doc, 'section', 'az-hud-panel az-hud-pause');
  pause.setAttribute('role', 'dialog');
  pause.setAttribute('aria-modal', 'true');
  pause.setAttribute('aria-label', 'Game paused');
  pause.hidden = true;
  pause.append(element(doc, 'h2', 'az-hud-panel-title', 'Paused'), element(doc, 'p', 'az-hud-panel-copy', 'Press Escape to return to the descent.'));

  const help = element(doc, 'aside', 'az-hud-panel az-hud-help');
  help.setAttribute('aria-label', 'Controls');
  help.hidden = true;
  help.append(element(doc, 'h2', 'az-hud-panel-title', 'Controls'), element(doc, 'p', 'az-hud-panel-copy', 'Move: WASD / arrows · Attack: click / J · Shoot: K · Dash: Space · Guard: L · Wrath: E · Lock: Q · Assist: T · Interact: Enter · Help: H · Pause: Escape'));

  root.append(top, boss.wrapper, combo, assistChip, special.wrapper, blessings, crosshair, vignette, lootFeed, announcer, pause, help);
  container.appendChild(root);

  const elements = {
    health: health.value, stamina: stamina.value, xp: xp.value,
    boss: boss.value, bossWrap: boss.wrapper, bossName,
    gold, combo, chapter, wave, crosshair, damageVignette: vignette,
    lootFeed, blessings, announcer, pause, help,
    assistChip, special: special.value, specialWrap: special.wrapper,
  };

  function update(state = {}) {
    if (state.health !== undefined || state.maxHealth !== undefined) setMeter(health, state.health ?? 100, state.maxHealth ?? 100);
    if (state.stamina !== undefined || state.maxStamina !== undefined) setMeter(stamina, state.stamina ?? 100, state.maxStamina ?? 100);
    if (state.xp !== undefined || state.xpToNext !== undefined) setMeter(xp, state.xp ?? 0, state.xpToNext ?? 100);
    if (state.gold !== undefined) {
      const amount = Math.max(0, Math.floor(Number(state.gold) || 0));
      gold.textContent = `${amount} gold`;
      gold.setAttribute('aria-label', `Gold: ${amount}`);
    }
    if (state.chapter !== undefined) chapter.textContent = `Chapter ${state.chapter}`;
    if (state.wave !== undefined) wave.textContent = `Wave ${state.wave}`;
    if (state.combo !== undefined) {
      const count = Math.max(0, Math.floor(Number(state.combo) || 0));
      combo.hidden = count < 2;
      combo.textContent = count < 2 ? '' : `${count}× COMBO`;
    }
    if (state.boss) {
      boss.wrapper.hidden = false;
      boss.wrapper.setAttribute('aria-hidden', 'false');
      bossName.textContent = state.boss.name || 'Boss';
      setMeter(boss, state.boss.health, state.boss.maxHealth);
    } else if (state.boss === null) {
      boss.wrapper.hidden = true;
      boss.wrapper.setAttribute('aria-hidden', 'true');
    }
    if (state.paused !== undefined) pause.hidden = !state.paused;
    if (state.help !== undefined) help.hidden = !state.help;
    if (state.blessings !== undefined) renderBlessings(state.blessings, state.blessingLabels, state.blessingLevels);
    if (state.assistMode !== undefined) {
      const mode = String(state.assistMode).toUpperCase();
      assistChip.textContent = mode;
      assistChip.setAttribute('aria-label', `Assist mode: ${state.assistMode}`);
      assistChip.setAttribute('data-mode', String(state.assistMode));
    }
    if (state.specialCharge !== undefined) {
      setMeter(special, state.specialCharge, 100);
      special.wrapper.classList.toggle('is-ready', Boolean(state.specialReady));
    }
    if (state.stamina !== undefined || state.maxStamina !== undefined || state.reserve !== undefined) {
      const max = Math.max(1, Number(state.maxStamina ?? 100));
      const reserve = Math.max(0, Math.min(max, Number(state.reserve ?? 25)));
      stamina.wrapper.classList.toggle('is-low-reserve', (state.stamina ?? 0) < reserve + 1);
      stamina.wrapper.setAttribute('data-reserve', reserve >= 50 ? '50' : reserve > 0 ? '25' : '0');
    }
    if (state.target !== undefined) {
      crosshair.classList.toggle('is-locked', Boolean(state.target?.locked));
      crosshair.setAttribute('aria-label', state.target ? `Target: ${state.target.hp}/${state.target.maxHp}` : 'No target');
    }
    return api;
  }

  /**
   * Render the claimed blessings. The list is rebuilt only when it actually
   * changes, so the HUD does not churn the DOM every frame.
   */
  let blessingSignature = '';
  function renderBlessings(list, labels, levels) {
    const items = Array.isArray(list) ? list : [];
    const signature = items.map((id) => `${id}:${levels?.[id] || 1}`).join('|');
    if (signature === blessingSignature) return;
    blessingSignature = signature;
    while (blessings.firstElementChild) blessings.firstElementChild.remove();
    blessings.hidden = items.length === 0;
    items.forEach((id) => {
      const label = labels?.[id]?.label || id;
      const hint = labels?.[id]?.hint || '';
      const level = levels?.[id] || 1;
      const item = element(doc, 'li', `az-hud-blessing-item az-hud-blessing--level-${level}`, `${label} ${'◆'.repeat(level)}`);
      if (hint) item.setAttribute('title', `${hint} · Level ${level}`);
      item.setAttribute('aria-label', hint ? `${label}, level ${level}: ${hint}` : `${label}, level ${level}`);
      item.setAttribute('data-blessing', id);
      item.setAttribute('data-level', String(level));
      blessings.appendChild(item);
    });
  }

  function addLoot(text) {
    if (!text) return;
    const item = element(doc, 'li', 'az-hud-loot-item', String(text));
    lootFeed.appendChild(item);
    // HTMLCollection has no shift(): drop the oldest via the DOM API.
    while (lootFeed.children.length > 4) lootFeed.firstElementChild.remove();
  }

  function setVisible(active = true) { root.hidden = !active; return api; }

  function announce(message) { announcer.textContent = String(message || ''); }
  function setDamage(active = true) { vignette.classList.toggle('is-active', Boolean(active)); }
  function destroy() { root.remove(); }

  const api = { root, elements, update, addLoot, announce, setDamage, setVisible, destroy };
  return api;
}
