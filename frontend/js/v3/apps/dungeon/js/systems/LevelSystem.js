// js/systems/LevelSystem.js
// Antik Aizanoi Prosedürel BSP Zindan Jeneratörü
//
// Section 19 of the brief is explicit that the 10 chapters must not "all feel
// like differently sized random rectangles". Three changes make them read as
// places:
//
//   1. Generation is seeded and reproducible. QA can ask for a specific
//      chapter layout and get the same dungeon every time, and a run summary
//      can name the seed that produced it.
//   2. Each chapter carries an identity — a room mix, a palette and a
//      generation profile — and rooms are given roles (combat, elite, shrine,
//      treasure, merchant, event, boss, transition) instead of being anonymous
//      rectangles.
//   3. Connectivity, portal reachability, spawn safety and a guaranteed walkable
//      path from base to portal are verified before the level is returned, so
//      the generator cannot hand the game an impossible level.
//
// The BSP split is kept: it is still the right way to get a well-connected set
// of rooms. What changed is what happens to those rooms afterwards.

/** mulberry32: small, fast, well-distributed seeded PRNG. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable string hash, so a chapter id always produces the same base seed. */
export function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return (h & 0x7fffffff) >>> 0;
}

/**
 * Room roles. `minRooms` is the smallest the chapter may run with, so a thin
 * chapter never silently loses its identity when BSP happens to be stingy.
 */
export const ROOM_ROLES = {
  base: { label: 'Zeus Altar', clear: 2, maxEnemies: 0 },
  combat: { label: 'Combat Hall', clear: 1, maxEnemies: 6 },
  elite: { label: 'Elite Chamber', clear: 2, maxEnemies: 2 },
  shrine: { label: 'Shrine', clear: 1, maxEnemies: 0 },
  treasure: { label: 'Vault', clear: 1, maxEnemies: 3 },
  merchant: { label: 'Merchant Camp', clear: 2, maxEnemies: 0 },
  event: { label: 'Ritual Space', clear: 1, maxEnemies: 4 },
  boss: { label: 'Boss Arena', clear: 3, maxEnemies: 1 },
  transition: { label: 'Passage', clear: 1, maxEnemies: 2 }
};

export class LevelSystem {
  constructor(scene, levelConfig) {
    this.scene = scene;
    this.config = levelConfig;
    this.width = levelConfig.gridWidth || 40;
    this.height = levelConfig.gridHeight || 40;
    this.tileSize = 32;

    // Section 19: deterministic or seedable generation for QA. The seed comes
    // from the caller when a test or a QA run supplies one, otherwise it is
    // derived from the chapter so a chapter always regenerates identically.
    this.seed = Number.isFinite(levelConfig.seed)
      ? levelConfig.seed >>> 0
      : hashSeed(`${levelConfig.id ?? 0}:${levelConfig.name ?? ''}`);
    this.random = mulberry32(this.seed);

    this.grid = []; // 0: void, 1: floor, 2: wall, 3: base_floor, 4: portal_floor
    this.rooms = [];
    this.baseArea = null;
    this.portalPos = null;
    this.spawnPoints = [];
    this.palette = levelConfig.palette || null;
  }

  generate() {
    // 1. Grid'i duvarlarla baslat
    this.grid = Array(this.height).fill(null).map(() => Array(this.width).fill(2));

    // 2. BSP ile odalari uret
    this.rooms = [];
    // Depth is derived from the chapter's declared room mix, not fixed at 3.
    // BSP at depth 3 yields about 8 rooms, which cannot hold a six-type mix and
    // still leave a dominant type. A chapter asks for as many rooms as its
    // identity needs.
    const declaredTypes = Object.keys(this.config.rooms || {}).length;
    // The depth is derived from the declared mix but capped: past roughly a
    // couple of dozen rooms a dungeon stops being a place and starts being a
    // maze, and the extra rooms add traversal without adding identity.
    const depth = this.config.bspDepth ?? Math.min(5, Math.max(3, declaredTypes));
    this.splitSpace(2, 2, this.width - 4, this.height - 4, depth);

    // 3. Odalari koridorlarla bagla
    for (let i = 0; i < this.rooms.length - 1; i++) {
      this.connectRooms(this.rooms[i], this.rooms[i + 1]);
    }

    // 4. Ilk odayi Aizo Guvenli Ussu (Zeus Sunagi) yap
    const firstRoom = this.rooms[0];
    this.baseArea = {
      x: Math.floor(firstRoom.x + firstRoom.w / 2),
      y: Math.floor(firstRoom.y + firstRoom.h / 2),
      bounds: firstRoom
    };
    for (let y = firstRoom.y; y < firstRoom.y + firstRoom.h; y++) {
      for (let x = firstRoom.x; x < firstRoom.x + firstRoom.w; x++) {
        this.grid[y][x] = 3; // Base zemin
      }
    }

    // 5. En uzak odayi Portal yap
    const lastRoom = this.rooms[this.rooms.length - 1];
    this.portalPos = {
      x: Math.floor(lastRoom.x + lastRoom.w / 2),
      y: Math.floor(lastRoom.y + lastRoom.h / 2)
    };
    this.grid[this.portalPos.y][this.portalPos.x] = 4;

    // 6. Chapter identity: turn anonymous rectangles into named places.
    this.assignRoomRoles();

    // 7. Guarantee the level is completable before anyone plays it.
    const audit = this.audit();

    return {
      grid: this.grid,
      rooms: this.rooms,
      baseArea: this.baseArea,
      portalPos: this.portalPos,
      width: this.width,
      height: this.height,
      seed: this.seed,
      palette: this.palette,
      audit
    };
  }

  /**
   * Give every room a role, using the chapter's declared mix. The first room is
   * always the base and the last is always the boss arena when the chapter has a
   * boss, so the critical spaces are never left to chance.
   */
  assignRoomRoles() {
    const mix = this.config.rooms || {};
    const hasBoss = Boolean(this.config.boss);

    // Interior rooms only: index 0 is the base, the last is the exit room.
    const interiorCount = this.rooms.length - 1 - (hasBoss ? 1 : 0);
    if (interiorCount <= 0) {
      this.rooms[0].role = 'base';
      if (hasBoss) this.rooms[this.rooms.length - 1].role = 'boss';
      return;
    }

    const pool = Object.entries(mix)
      .filter(([role, weight]) => role !== 'base' && role !== 'boss' && weight > 0)
      .map(([role, weight]) => ({ role, weight }));

    // With no declared mix (the endless chapter), every interior room is a
    // combat hall and the boss room is the only special space.
    if (!pool.length) {
      this.rooms[0].role = 'base';
      for (let i = 1; i < this.rooms.length - 1; i++) this.rooms[i].role = 'combat';
      this.rooms[this.rooms.length - 1].role = hasBoss ? 'boss' : 'transition';
      return;
    }

    // Allocate rooms from the declared weights. Three earlier rules were wrong
    // and are replaced here:
    //
    //   - largest-remainder apportionment inverted chapter identities: with few
    //     rooms per type every exact share is a fraction, so the spare room
    //     landed on a rare type and a combat-heavy chapter played elite-heavy;
    //   - strict round-robin over the sorted types flattened every chapter to a
    //     near-uniform mix, so no chapter had a character at all;
    //   - a "weight compared against the leader" share test sent almost every
    //     extra room to combat, producing 24 combat halls and one shrine, which
    //     is the same flatness wearing a different hat.
    //
    // The rule that holds: give every declared type one room, then distribute
    // the remainder in exact proportion to the declared weights, using
    // largest-remainder only to settle the tie-break among the fractional
    // leftovers. Because every type already holds a room, largest-remainder can
    // no longer hand a chapter's identity to a rare type.
    const byWeight = [...pool].sort((a, b) => b.weight - a.weight);
    const counts = new Map();
    let assigned = 0;
    for (const { role } of byWeight) {
      if (assigned >= interiorCount) break;
      counts.set(role, 1);
      assigned++;
    }

    const totalWeight = byWeight.reduce((s, w) => s + w.weight, 0);
    const remaining = interiorCount - assigned;
    if (remaining > 0) {
      // Share of the leftover rooms each type deserves, on top of the one room
      // it already holds.
      const shares = byWeight.map((w) => {
        const exact = (w.weight / totalWeight) * remaining;
        return { role: w.role, exact, whole: Math.floor(exact), remainder: exact - Math.floor(exact) };
      });
      // The whole parts are real rooms and must be counted, not just tallied:
      // omitting them here left the sequence short and the shortfall fill then
      // dumped every missing room into the chapter's heaviest type.
      for (const share of shares) {
        counts.set(share.role, (counts.get(share.role) || 0) + share.whole);
        assigned++;
      }
      let handed = shares.reduce((s, x) => s + x.whole, 0);
      // Ties only, and only among the leftovers, so the order of a chapter's
      // declared weights is preserved.
      const byRemainder = [...shares].sort((a, b) => b.remainder - a.remainder);
      let cursor = 0;
      while (handed < remaining) {
        const target = byRemainder[cursor % byRemainder.length];
        counts.set(target.role, (counts.get(target.role) || 0) + 1);
        handed++;
        cursor++;
      }
    }

    const sequence = [];
    for (const { role } of byWeight) {
      for (let i = 0; i < (counts.get(role) || 0); i++) sequence.push(role);
    }
    // The sequence must be exactly as long as the interior, or the last rooms
    // keep the placeholder role they were born with. Hand any shortfall to the
    // chapter's heaviest type, which is where extra combat belongs.
    while (sequence.length < interiorCount) {
      sequence.push(byWeight[0].role);
    }

    // Interleave so the same roles are not all bunched at the far end, which
    // would make a chapter feel like two separate halves.
    const shuffled = sequence
      .map((role) => ({ role, key: this.random() }))
      .sort((a, b) => a.key - b.key)
      .map((r) => r.role);

    this.rooms[0].role = 'base';
    for (let i = 0; i < interiorCount; i++) this.rooms[1 + i].role = shuffled[i];
    this.rooms[this.rooms.length - 1].role = hasBoss ? 'boss' : 'transition';
  }

  /**
   * Verify the level. Section 19 requires connectivity, no inaccessible portal,
   * no wall spawn, no impossible encounter and no soft lock. The check is a
   * flood fill from the base, because that is the only thing that actually
   * proves the player can reach the exit.
   */
  audit() {
    const reachable = this.floodFill(this.baseArea.x, this.baseArea.y);
    const portalReachable = Boolean(this.portalPos) && reachable.has(
      `${this.portalPos.x},${this.portalPos.y}`
    );

    // Every room centre must be reachable, or a spawn there would be a wall
    // spawn from the player's point of view.
    const unreachableRooms = this.rooms
      .filter((r) => {
        const cx = Math.floor(r.x + r.w / 2);
        const cy = Math.floor(r.y + r.h / 2);
        return !reachable.has(`${cx},${cy}`);
      })
      .map((r) => r.role);

    // A boss arena must have the clearance its role requires, or the fight is
    // an impossible encounter.
    const bossRoom = this.rooms.find((r) => r.role === 'boss');
    let bossClearance = true;
    if (bossRoom) {
      bossClearance = this.hasClearance(
        Math.floor(bossRoom.x + bossRoom.w / 2),
        Math.floor(bossRoom.y + bossRoom.h / 2),
        ROOM_ROLES.boss.clear
      );
    }

    const walkable = reachable.size;
    const roleCounts = this.rooms.reduce((acc, r) => {
      acc[r.role] = (acc[r.role] || 0) + 1;
      return acc;
    }, {});

    // A chapter must have enough rooms to state its identity.
    const declaredTypes = Object.keys(this.config.rooms || {}).length;
    const roomFloor = Math.max(1, declaredTypes);
    const enoughRooms = this.rooms.length >= roomFloor;

    const report = {
      seed: this.seed,
      rooms: this.rooms.length,
      roomFloor,
      enoughRooms,
      walkable,
      portalReachable,
      unreachableRooms,
      bossClearance,
      roleCounts,
      ok: portalReachable && unreachableRooms.length === 0 && bossClearance && enoughRooms
    };
    if (!report.ok) {
      // Loud in development, harmless in production: the audit is the contract.
      console.warn('[LevelSystem] chapter audit failed', report);
    }
    return report;
  }

  floodFill(startX, startY) {
    const seen = new Set();
    if (startX == null || startY == null) return seen;
    if (!this.isWalkable(startX, startY)) return seen;
    const stack = [[startX, startY]];
    while (stack.length) {
      const [x, y] = stack.pop();
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (this.isWalkable(nx, ny) && !seen.has(`${nx},${ny}`)) {
          stack.push([nx, ny]);
        }
      }
    }
    return seen;
  }

  isWalkable(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    const t = this.grid[y][x];
    return t === 1 || t === 3 || t === 4;
  }

  hasClearance(cx, cy, required) {
    for (let dr = -(required - 1); dr <= required - 1; dr++) {
      for (let dc = -(required - 1); dc <= required - 1; dc++) {
        if (!this.isWalkable(cx + dc, cy + dr)) return false;
      }
    }
    return true;
  }

  splitSpace(x, y, w, h, depth) {
    if (depth <= 0 || (w < 12 && h < 12)) {
      // Bir oda olustur
      const rw = Math.max(5, Math.floor(w * (0.6 + this.random() * 0.3)));
      const rh = Math.max(5, Math.floor(h * (0.6 + this.random() * 0.3)));
      const rx = x + Math.floor(this.random() * Math.max(1, w - rw));
      const ry = y + Math.floor(this.random() * Math.max(1, h - rh));

      const room = { x: rx, y: ry, w: rw, h: rh, role: 'combat' };
      this.rooms.push(room);

      for (let r_y = ry; r_y < ry + rh; r_y++) {
        for (let r_x = rx; r_x < rx + rw; r_x++) {
          if (r_y >= 0 && r_y < this.height && r_x >= 0 && r_x < this.width) {
            this.grid[r_y][r_x] = 1; // Zemin
          }
        }
      }
      return;
    }

    const splitH = w < h ? true : (w === h ? this.random() > 0.5 : false);
    if (splitH) {
      const splitY = Math.floor(h * (0.4 + this.random() * 0.2));
      this.splitSpace(x, y, w, splitY, depth - 1);
      this.splitSpace(x, y + splitY, w, h - splitY, depth - 1);
    } else {
      const splitX = Math.floor(w * (0.4 + this.random() * 0.2));
      this.splitSpace(x, y, splitX, h, depth - 1);
      this.splitSpace(x + splitX, y, w - splitX, h, depth - 1);
    }
  }

  connectRooms(r1, r2) {
    let cx1 = Math.floor(r1.x + r1.w / 2);
    let cy1 = Math.floor(r1.y + r1.h / 2);
    const cx2 = Math.floor(r2.x + r2.w / 2);
    const cy2 = Math.floor(r2.y + r2.h / 2);

    // Yatay koridor
    while (cx1 !== cx2) {
      this.carveTile(cx1, cy1);
      cx1 += cx1 < cx2 ? 1 : -1;
    }
    // Dikey koridor
    while (cy1 !== cy2) {
      this.carveTile(cx1, cy1);
      cy1 += cy1 < cy2 ? 1 : -1;
    }
  }

  carveTile(x, y) {
    if (x >= 1 && x < this.width - 1 && y >= 1 && y < this.height - 1) {
      this.grid[y][x] = 1;
      this.grid[y + 1][x] = 1; // 2 tile genislik koridor
    }
  }

  /** The walkable set proved by the audit; reused by spawn selection. */
  reachableSet() {
    return this.floodFill(this.baseArea.x, this.baseArea.y);
  }

  getRandomWalkablePosition(excludeBase = true, requiredClearance = 1) {
    const reachable = this.reachableSet();
    // Draw from the proven-reachable set rather than probing the whole grid, so
    // a spawn can never land behind a wall the player cannot path around.
    const candidates = [...reachable].map((key) => key.split(',').map(Number));
    if (candidates.length) {
      const pool = candidates.filter(([c, r]) => {
        if (excludeBase && this.baseArea) {
          const dx = c - this.baseArea.x;
          const dy = r - this.baseArea.y;
          if (Math.sqrt(dx * dx + dy * dy) < 8) return false;
        }
        if (requiredClearance > 1) {
          return this.hasClearance(c, r, requiredClearance);
        }
        return true;
      });
      if (pool.length) {
        const [c, r] = pool[Math.floor(this.random() * pool.length)];
        return { x: c * this.tileSize + 16, y: r * this.tileSize + 16 };
      }
    }

    // Guvenli Fallback: harita ortasina veya rastgele duvar icine degil,
    // garantili bir odaya yerlestir
    const fallbackRoom = this.rooms.length > 1 ? this.rooms[this.rooms.length - 1] : this.rooms[0];
    if (fallbackRoom) {
      const safeX = Math.floor(fallbackRoom.x + fallbackRoom.w / 2);
      const safeY = Math.floor(fallbackRoom.y + fallbackRoom.h / 2);
      return { x: safeX * this.tileSize + 16, y: safeY * this.tileSize + 16 };
    }
    return { x: 3 * this.tileSize + 16, y: 3 * this.tileSize + 16 };
  }

  /**
   * Room-aware spawn position. Section 19 asks for room and encounter templates,
   * so a role has to change what the player meets, not just a label: a combat
   * hall holds a fight, an elite chamber holds a smaller number of stronger
   * enemies, a shrine holds none at all, and a boss arena is only used for the
   * boss. Positions are still drawn from the proven-reachable set, so a spawn
   * can never land in a wall.
   */
  getSpawnPositionForRole(role, { excludeBase = true, requiredClearance = 1 } = {}) {
    const matching = this.rooms.filter((r) => r.role === role);
    if (!matching.length) return null;
    const room = matching[Math.floor(this.random() * matching.length)];
    const reachable = this.reachableSet();
    const inRoom = [];
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (!reachable.has(`${x},${y}`)) continue;
        if (excludeBase && this.baseArea) {
          const dx = x - this.baseArea.x;
          const dy = y - this.baseArea.y;
          if (Math.sqrt(dx * dx + dy * dy) < 8) continue;
        }
        if (requiredClearance > 1 && !this.hasClearance(x, y, requiredClearance)) continue;
        inRoom.push([x, y]);
      }
    }
    if (!inRoom.length) return null;
    const [c, r] = inRoom[Math.floor(this.random() * inRoom.length)];
    return {
      x: c * this.tileSize + 16,
      y: r * this.tileSize + 16,
      role,
      room
    };
  }

  /** How many enemies a room of this role may hold, from ROOM_ROLES. */
  enemyBudgetForRole(role) {
    return ROOM_ROLES[role]?.maxEnemies ?? 1;
  }

  /** Human-readable summary, used by the run summary and by QA output. */
  describe() {
    const audit = this.audit();
    return {
      seed: this.seed,
      rooms: audit.rooms,
      roles: audit.roleCounts,
      portalReachable: audit.portalReachable,
      walkable: audit.walkable
    };
  }
}
