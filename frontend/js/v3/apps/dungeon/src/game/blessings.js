import { BLESSINGS, BLESSING_IDS } from './config.js';

export function chooseBlessing(state, id) {
  if (!BLESSING_IDS.includes(id)) throw new Error(`Unknown blessing: ${id}`);
  if (state.blessings.includes(id)) return { chosen: false, reason: 'already-chosen', label: 'Bonus gold' };
  state.blessings.push(id);
  const player = state.player;
  if (id === 'vitality') { player.maxHp += 30; player.hp += 30; }
  else if (id === 'fury') player.damageMultiplier *= 1.2;
  else if (id === 'windstep') player.dashCooldownMax *= 0.75;
  else if (id === 'swiftstrike') player.attackSpeedMultiplier *= 1.18;
  else if (id === 'keeneye') player.critChance += 0.15;
  else if (id === 'honededge') player.critMultiplier += 0.35;
  else if (id === 'ironskin') player.damageTakenMultiplier *= 0.85;
  else if (id === 'vampiric') player.lifesteal += 0.18;
  else if (id === 'longrange') player.bowRangeMultiplier *= 1.3;
  else if (id === 'stormstep') player.speedMultiplier *= 1.12;
  else if (id === 'warmonger') { player.damageMultiplier *= 1.1; player.attackSpeedMultiplier *= 1.08; }
  else if (id === 'penkalasblood') player.bowStaminaMultiplier *= 0.75;
  state.eventSeq = (state.eventSeq || 0) + 1;
  state.events.push({ type: 'blessing', id, at: state.time, seq: state.eventSeq });
  if (state.events.length > 128) state.events.splice(0, state.events.length - 128);
  return { chosen: true, id, label: BLESSINGS[id].label, hint: BLESSINGS[id].hint };
}