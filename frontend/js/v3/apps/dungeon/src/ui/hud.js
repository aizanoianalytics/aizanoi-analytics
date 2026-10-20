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
  boss.wrapper.children.unshift?.(bossName);
  if (!boss.wrapper.children.includes?.(bossName)) boss.wrapper.append(bossName);

  const combo = element(doc, 'output', 'az-hud-combo', '');
  combo.setAttribute('aria-label', 'Combo');
  combo.hidden = true;
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

  const pause = element(doc, 'section', 'az-hud-panel az-hud-pause');
  pause.setAttribute('role', 'dialog');
  pause.setAttribute('aria-modal', 'true');
  pause.setAttribute('aria-label', 'Game paused');
  pause.hidden = true;
  pause.append(element(doc, 'h2', 'az-hud-panel-title', 'Paused'), element(doc, 'p', 'az-hud-panel-copy', 'Press Escape to return to the descent.'));

  const help = element(doc, 'aside', 'az-hud-panel az-hud-help');
  help.setAttribute('aria-label', 'Controls');
  help.hidden = true;
  help.append(element(doc, 'h2', 'az-hud-panel-title', 'Controls'), element(doc, 'p', 'az-hud-panel-copy', 'Move: WASD · Attack: click · Dash: Space · Pause: Escape'));

  root.append(top, boss.wrapper, combo, crosshair, vignette, lootFeed, announcer, pause, help);
  container.appendChild(root);

  const elements = {
    health: health.value, stamina: stamina.value, xp: xp.value,
    boss: boss.value, bossWrap: boss.wrapper, bossName,
    gold, combo, chapter, wave, crosshair, damageVignette: vignette,
    lootFeed, announcer, pause, help,
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
    return api;
  }

  function addLoot(text) {
    if (!text) return;
    const item = element(doc, 'li', 'az-hud-loot-item', String(text));
    lootFeed.appendChild(item);
    while (lootFeed.children.length > 4) lootFeed.children.shift();
  }

  function announce(message) { announcer.textContent = String(message || ''); }
  function setDamage(active = true) { vignette.classList.toggle('is-active', Boolean(active)); }
  function destroy() { root.remove(); }

  const api = { root, elements, update, addLoot, announce, setDamage, destroy };
  return api;
}
