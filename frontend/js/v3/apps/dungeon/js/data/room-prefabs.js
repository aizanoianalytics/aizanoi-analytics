// js/data/room-prefabs.js
// Chapter-bound room prefabs: shape/landmark identity on top of BSP rectangles.
// A prefab never changes connectivity; it reserves cells and declares anchors.

export const ROOM_PREFABS = {
  shrine_sanctum: {
    id: 'shrine_sanctum',
    roles: ['shrine'],
    shape: 'cruciform',
    landmark: 'altar',
    reserved: 'center-3x3',
    anchors: ['center'],
    description: 'Raised altar with a clear 3x3 prayer floor.',
  },
  merchant_bazaar: {
    id: 'merchant_bazaar',
    roles: ['merchant'],
    shape: 'arcade',
    landmark: 'stalls',
    reserved: 'stall-row',
    anchors: ['north-stalls', 'center-aisle'],
    description: 'Two stall rows with a walkable central aisle.',
  },
  vault_treasury: {
    id: 'vault_treasury',
    roles: ['treasure'],
    shape: 'vaulted',
    landmark: 'chests',
    reserved: 'chest-alcoves',
    anchors: ['alcove-north', 'alcove-south'],
    description: 'Chest alcoves on opposite walls, center kept clear.',
  },
  combat_arena: {
    id: 'combat_arena',
    roles: ['combat', 'event'],
    shape: 'arena',
    landmark: 'pillars',
    reserved: 'pillar-ring',
    anchors: ['n', 's', 'e', 'w'],
    description: 'Four-pillar arena with spawn anchors at cardinals.',
  },
  elite_duel: {
    id: 'elite_duel',
    roles: ['elite'],
    shape: 'octagon',
    landmark: 'duel-circle',
    reserved: 'center-circle',
    anchors: ['center-north', 'center-south'],
    description: 'Sunken duel circle, elites spawn on opposite edges.',
  },
  boss_throne: {
    id: 'boss_throne',
    roles: ['boss'],
    shape: 'throne-hall',
    landmark: 'throne',
    reserved: 'throne-dais',
    anchors: ['dais', 'hall-entry'],
    description: 'Long throne hall; boss on the dais, player enters far.',
  },
  passage_corridor: {
    id: 'passage_corridor',
    roles: ['transition', 'base'],
    shape: 'corridor',
    landmark: 'braziers',
    reserved: 'none',
    anchors: ['entry', 'exit'],
    description: 'Narrow braziers corridor, no reserved center.',
  },
};

const ROLE_FALLBACK = {
  shrine: 'shrine_sanctum',
  merchant: 'merchant_bazaar',
  treasure: 'vault_treasury',
  combat: 'combat_arena',
  event: 'combat_arena',
  elite: 'elite_duel',
  boss: 'boss_throne',
  base: 'passage_corridor',
  transition: 'passage_corridor',
};

/** Deterministic prefab pick for a room role. `rand` defaults to Math.random. */
export function selectRoomPrefab(role, rand = Math.random) {
  const fallback = ROLE_FALLBACK[role] || 'combat_arena';
  // Role pools are singletons today; rand keeps the signature stable for
  // chapter-specific pools (e.g. crypt vs sanctuary variants).
  void rand;
  return ROOM_PREFABS[fallback];
}

/** Reserved-cell contract: interaction cells must stay walkable + reachable. */
export function reservedCellsForPrefab(prefabId, room) {
  const cx = Math.floor(room.x + room.w / 2);
  const cy = Math.floor(room.y + room.h / 2);
  switch (prefabId) {
    case 'shrine_sanctum':
      return [{ x: cx, y: cy, kind: 'altar' }];
    case 'vault_treasury':
      return [
        { x: cx, y: room.y + 1, kind: 'chest' },
        { x: cx, y: room.y + room.h - 2, kind: 'chest' },
      ];
    case 'boss_throne':
      return [{ x: cx, y: room.y + 1, kind: 'throne' }];
    default:
      return [];
  }
}
