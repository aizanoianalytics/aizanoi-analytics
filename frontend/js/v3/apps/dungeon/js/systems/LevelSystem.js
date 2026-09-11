// js/systems/LevelSystem.js
// Antik Aizanoi Prosedürel BSP Zindan Jeneratörü

export class LevelSystem {
  constructor(scene, levelConfig) {
    this.scene = scene;
    this.config = levelConfig;
    this.width = levelConfig.gridWidth || 40;
    this.height = levelConfig.gridHeight || 40;
    this.tileSize = 32;

    this.grid = []; // 0: void, 1: floor, 2: wall, 3: base_floor, 4: portal_floor
    this.rooms = [];
    this.baseArea = null;
    this.portalPos = null;
    this.spawnPoints = [];
  }

  generate() {
    // 1. Grid'i duvarlarla başlat
    this.grid = Array(this.height).fill(null).map(() => Array(this.width).fill(2));

    // 2. BSP ile odaları üret
    this.rooms = [];
    this.splitSpace(2, 2, this.width - 4, this.height - 4, 3);

    // 3. Odaları koridorlarla bağla
    for (let i = 0; i < this.rooms.length - 1; i++) {
      this.connectRooms(this.rooms[i], this.rooms[i + 1]);
    }

    // 4. İlk odayı Aizo Güvenli Üssü (Zeus Sunağı) yap
    const firstRoom = this.rooms[0];
    this.baseArea = {
      x: Math.floor(firstRoom.x + firstRoom.w / 2),
      y: Math.floor(firstRoom.y + firstRoom.h / 2),
      bounds: firstRoom,
    };
    for (let y = firstRoom.y; y < firstRoom.y + firstRoom.h; y++) {
      for (let x = firstRoom.x; x < firstRoom.x + firstRoom.w; x++) {
        this.grid[y][x] = 3; // Base zemin
      }
    }

    // 5. En uzak odayı Portal yap
    const lastRoom = this.rooms[this.rooms.length - 1];
    this.portalPos = {
      x: Math.floor(lastRoom.x + lastRoom.w / 2),
      y: Math.floor(lastRoom.y + lastRoom.h / 2),
    };
    this.grid[this.portalPos.y][this.portalPos.x] = 4;

    return {
      grid: this.grid,
      rooms: this.rooms,
      baseArea: this.baseArea,
      portalPos: this.portalPos,
      width: this.width,
      height: this.height,
    };
  }

  splitSpace(x, y, w, h, depth) {
    if (depth <= 0 || (w < 12 && h < 12)) {
      // Bir oda oluştur
      const rw = Math.max(5, Math.floor(w * (0.6 + Math.random() * 0.3)));
      const rh = Math.max(5, Math.floor(h * (0.6 + Math.random() * 0.3)));
      const rx = x + Math.floor(Math.random() * (w - rw));
      const ry = y + Math.floor(Math.random() * (h - rh));

      const room = { x: rx, y: ry, w: rw, h: rh };
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

    const splitH = w < h ? true : (w === h ? Math.random() > 0.5 : false);
    if (splitH) {
      const splitY = Math.floor(h * (0.4 + Math.random() * 0.2));
      this.splitSpace(x, y, w, splitY, depth - 1);
      this.splitSpace(x, y + splitY, w, h - splitY, depth - 1);
    } else {
      const splitX = Math.floor(w * (0.4 + Math.random() * 0.2));
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
      this.grid[y + 1][x] = 1; // 2 tile genişlik koridor
    }
  }

  getRandomWalkablePosition(excludeBase = true) {
    let attempts = 0;
    while (attempts < 1000) {
      attempts++;
      const r = Math.floor(Math.random() * this.height);
      const c = Math.floor(Math.random() * this.width);
      const tileType = this.grid[r][c];

      if (tileType === 1) {
        if (excludeBase && this.baseArea) {
          const dx = c - this.baseArea.x;
          const dy = r - this.baseArea.y;
          if (Math.sqrt(dx * dx + dy * dy) < 8) continue;
        }
        return { x: c * this.tileSize + 16, y: r * this.tileSize + 16 };
      }
    }
    return { x: this.width * 16, y: this.height * 16 };
  }
}
