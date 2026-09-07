/**
 * materials.js — Universal PBR Material Library with Procedural Canvas Textures
 * Shared Asset Engine · Aizanoi Analytics unified worlds runtime
 *
 * Supports Classical Greek, Imperial Roman, Aizanoi Phrygian,
 * and Contemporary Architectural (İGA) materials.
 * Generates zero-dependency procedural textures and bump maps on CanvasTexture.
 */

import * as THREE from '../vendor/three.module.js';

/* ── Procedural Canvas Texture Generators ─────────────────── */

const textureCache = new Map();

function createProceduralTexture(name, drawFn, size = 256) {
  if (textureCache.has(name)) return textureCache.get(name);
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  drawFn(ctx, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  textureCache.set(name, texture);
  return texture;
}

// 1. Pentelic / Classical Marble
function getMarbleTexture() {
  return createProceduralTexture('marble', (ctx, s) => {
    ctx.fillStyle = '#f6f0e4';
    ctx.fillRect(0, 0, s, s);

    // Subtle mineral veins
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(180, 160, 135, 0.28)' : 'rgba(130, 120, 110, 0.18)';
      let x = (i * 45) % s;
      let y = 0;
      ctx.moveTo(x, y);
      while (y < s) {
        x += (Math.sin(y * 0.04 + i) * 6) + (Math.cos(y * 0.015) * 3);
        y += 6;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}

function getMarbleBump() {
  return createProceduralTexture('marble_bump', (ctx, s) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, s, s);
    const imgData = ctx.getImageData(0, 0, s, s);
    for (let i = 0; i < imgData.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 16;
      imgData.data[i] = 128 + n;
      imgData.data[i + 1] = 128 + n;
      imgData.data[i + 2] = 128 + n;
    }
    ctx.putImageData(imgData, 0, 0);
  });
}

// 2. Travertine Stone Blocks
function getTravertineTexture() {
  return createProceduralTexture('travertine', (ctx, s) => {
    ctx.fillStyle = '#dfd5be';
    ctx.fillRect(0, 0, s, s);

    // Horizontal porous lacunae bands
    for (let y = 0; y < s; y += 8) {
      ctx.fillStyle = 'rgba(160, 145, 125, 0.22)';
      for (let x = 0; x < s; x += 12) {
        if (Math.random() > 0.45) {
          const w = 4 + Math.random() * 12;
          ctx.fillRect(x, y + Math.random() * 3, w, 2);
        }
      }
    }
    // Block joints (every 64px)
    ctx.strokeStyle = 'rgba(90, 80, 70, 0.4)';
    ctx.lineWidth = 2;
    for (let y = 0; y < s; y += 64) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke();
    }
    for (let x = 0; x < s; x += 64) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, s); ctx.stroke();
    }
  });
}

function getTravertineBump() {
  return createProceduralTexture('travertine_bump', (ctx, s) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#505050';
    for (let i = 0; i < 180; i++) {
      ctx.fillRect(Math.random() * s, Math.random() * s, Math.random() * 8 + 2, 2);
    }
    ctx.strokeStyle = '#202020';
    ctx.lineWidth = 3;
    for (let y = 0; y < s; y += 64) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke();
    }
  });
}

// 3. Roman Brick (Opus Testaceum)
function getRomanBrickTexture() {
  return createProceduralTexture('roman_brick', (ctx, s) => {
    ctx.fillStyle = '#dfd6c6'; // Mortar base
    ctx.fillRect(0, 0, s, s);

    const brickH = 16;
    const brickW = 48;
    const rows = s / brickH;

    for (let r = 0; r < rows; r++) {
      const y = r * brickH + 2;
      const offset = (r % 2) * (brickW / 2);
      for (let x = -brickW; x < s + brickW; x += brickW + 3) {
        const tone = Math.random() * 25 - 12;
        const rVal = Math.min(255, Math.max(0, 175 + tone));
        const gVal = Math.min(255, Math.max(0, 85 + tone * 0.6));
        const bVal = Math.min(255, Math.max(0, 55 + tone * 0.4));
        ctx.fillStyle = `rgb(${rVal},${gVal},${bVal})`;
        ctx.fillRect(x + offset, y, brickW, brickH - 3);
      }
    }
  });
}

function getRomanBrickBump() {
  return createProceduralTexture('roman_brick_bump', (ctx, s) => {
    ctx.fillStyle = '#404040'; // Low mortar
    ctx.fillRect(0, 0, s, s);

    const brickH = 16;
    const brickW = 48;
    ctx.fillStyle = '#c0c0c0'; // Raised brick face
    for (let r = 0; r < s / brickH; r++) {
      const y = r * brickH + 2;
      const offset = (r % 2) * (brickW / 2);
      for (let x = -brickW; x < s + brickW; x += brickW + 3) {
        ctx.fillRect(x + offset, y, brickW, brickH - 3);
      }
    }
  });
}

// 4. Terracotta Roof Tiles (Imbrex & Tegula)
function getRoofTileTexture() {
  return createProceduralTexture('roof_tile', (ctx, s) => {
    ctx.fillStyle = '#b86038';
    ctx.fillRect(0, 0, s, s);

    const tileW = 20;
    for (let x = 0; x < s; x += tileW) {
      const grad = ctx.createLinearGradient(x, 0, x + tileW, 0);
      grad.addColorStop(0, 'rgba(60, 25, 10, 0.45)');
      grad.addColorStop(0.3, 'rgba(230, 130, 80, 0.3)');
      grad.addColorStop(0.7, 'rgba(200, 100, 60, 0.1)');
      grad.addColorStop(1, 'rgba(40, 15, 5, 0.55)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, tileW, s);
    }
  });
}

// 5. Cobblestone / Roman Road Paving
function getRoadTexture() {
  return createProceduralTexture('road_stone', (ctx, s) => {
    ctx.fillStyle = '#3a342c'; // Dark soil/mortar between stones
    ctx.fillRect(0, 0, s, s);

    const blockSize = 32;
    for (let y = 0; y < s; y += blockSize) {
      for (let x = 0; x < s; x += blockSize) {
        const tone = Math.random() * 20 - 10;
        const gray = Math.min(240, Math.max(120, 185 + tone));
        ctx.fillStyle = `rgb(${gray},${gray - 10},${gray - 20})`;
        ctx.beginPath();
        // Slightly irregular polygon stones
        const pad = 3;
        ctx.roundRect(x + pad, y + pad, blockSize - pad * 2, blockSize - pad * 2, 4);
        ctx.fill();
      }
    }
  });
}

// 6. Airport Asphalt Tarmac
function getTarmacTexture() {
  return createProceduralTexture('tarmac', (ctx, s) => {
    ctx.fillStyle = '#222528';
    ctx.fillRect(0, 0, s, s);

    // Fine mineral bitumen speckles
    for (let i = 0; i < 600; i++) {
      const g = 60 + Math.random() * 80;
      ctx.fillStyle = `rgba(${g},${g},${g},0.35)`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5);
    }
  });
}

// 7. Wood Planks
function getWoodTexture() {
  return createProceduralTexture('wood', (ctx, s) => {
    ctx.fillStyle = '#654830';
    ctx.fillRect(0, 0, s, s);

    const plankH = 32;
    for (let y = 0; y < s; y += plankH) {
      // Plank seam
      ctx.fillStyle = 'rgba(20, 12, 6, 0.55)';
      ctx.fillRect(0, y, s, 2);

      // Grain fibers
      ctx.fillStyle = 'rgba(45, 30, 18, 0.2)';
      for (let j = 0; j < 8; j++) {
        ctx.fillRect(0, y + Math.random() * plankH, s, 1);
      }
    }
  });
}

/* ── Universal Material Definitions ──────────────────────── */

export const MATERIAL_DEFINITIONS = {
  // ──── Greek Classical Palette ────
  marble:          { roughness: 0.30, metalness: 0.05, color: 0xf4eee2, bumpScale: 0.02 },
  limestone:       { roughness: 0.65, metalness: 0.00, color: 0xdcd0b4, bumpScale: 0.04 },
  poros:           { roughness: 0.88, metalness: 0.00, color: 0xc8b894, bumpScale: 0.06 },
  plaster:         { roughness: 0.70, metalness: 0.00, color: 0xe8e0d4 },
  plasterAged:     { roughness: 0.82, metalness: 0.00, color: 0xc8bca6 },
  terracotta:      { roughness: 0.74, metalness: 0.00, color: 0xba663e },
  roofTile:        { roughness: 0.68, metalness: 0.00, color: 0xc46e42, bumpScale: 0.05 },
  bronze:          { roughness: 0.26, metalness: 0.88, color: 0xb58234 },
  bronzePatina:    { roughness: 0.52, metalness: 0.58, color: 0x628268 },
  goldLeaf:        { roughness: 0.16, metalness: 0.94, color: 0xd8aa38 },

  // ──── Roman Imperial Palette ────
  travertine:      { roughness: 0.58, metalness: 0.02, color: 0xdfd6c2, bumpScale: 0.04 },
  romanBrick:      { roughness: 0.78, metalness: 0.00, color: 0xb55c3c, bumpScale: 0.06 },
  porphyry:        { roughness: 0.35, metalness: 0.05, color: 0x6c2a38, bumpScale: 0.02 },
  tufa:            { roughness: 0.90, metalness: 0.00, color: 0x8a7862, bumpScale: 0.08 },
  concrete:        { roughness: 0.82, metalness: 0.00, color: 0x9e988e, bumpScale: 0.04 },
  marbleColosseum: { roughness: 0.55, metalness: 0.02, color: 0xdcd2be, bumpScale: 0.03 },
  frescoRed:       { roughness: 0.65, metalness: 0.00, color: 0x8c2824 },
  frescoYellow:    { roughness: 0.65, metalness: 0.00, color: 0xd2a842 },

  // ──── Contemporary Architectural / Aviation (İGA) ────
  glassCurtain:    { roughness: 0.08, metalness: 0.15, color: 0x82c6de, transparent: true, opacity: 0.45 },
  structuralSteel: { roughness: 0.32, metalness: 0.86, color: 0x4a5460 },
  aluminumAnodized:{ roughness: 0.22, metalness: 0.72, color: 0xc8d0d8 },
  tarmac:          { roughness: 0.90, metalness: 0.05, color: 0x24282c, bumpScale: 0.03 },
  apronConcrete:   { roughness: 0.76, metalness: 0.02, color: 0x7c8288, bumpScale: 0.02 },
  runwayMarking:   { roughness: 0.55, metalness: 0.00, color: 0xfcfcfc },
  runwayYellow:    { roughness: 0.55, metalness: 0.00, color: 0xf2b705 },
  jetFuselage:     { roughness: 0.18, metalness: 0.32, color: 0xffffff },
  jetLivery:       { roughness: 0.18, metalness: 0.32, color: 0xc8102e },
  atcShaft:        { roughness: 0.38, metalness: 0.40, color: 0xe2e2e2 },
  serviceVehicle:  { roughness: 0.35, metalness: 0.25, color: 0xf39c12 },
  sailFabric:      { roughness: 0.88, metalness: 0.00, color: 0xeae2cf },
  altarStone:      { roughness: 0.50, metalness: 0.02, color: 0xd6cbb8, bumpScale: 0.04 },

  // ──── Shared Environmental ────
  ground:          { roughness: 0.95, metalness: 0.00, color: 0xa49474, bumpScale: 0.05 },
  road:            { roughness: 0.85, metalness: 0.00, color: 0xb8a88a, bumpScale: 0.06 },
  wood:            { roughness: 0.75, metalness: 0.00, color: 0x624630, bumpScale: 0.04 },
  woodPlanks:      { roughness: 0.72, metalness: 0.00, color: 0x6e5238, bumpScale: 0.05 },
  foliage:         { roughness: 0.80, metalness: 0.00, color: 0x587844 },
  foliageDark:     { roughness: 0.82, metalness: 0.00, color: 0x244222 },
  trunk:           { roughness: 0.92, metalness: 0.00, color: 0x54402c, bumpScale: 0.06 },
  waterSurface:    { roughness: 0.08, metalness: 0.20, color: 0x3a6a7a, transparent: true, opacity: 0.75 },
};

const cache = new Map();

/**
 * Get or create a cached PBR MeshStandardMaterial with procedural textures applied.
 * @param {string} name
 * @param {object} [overrides]
 * @returns {THREE.MeshStandardMaterial}
 */
export function getMaterial(name, overrides = {}) {
  const cacheKey = overrides && Object.keys(overrides).length > 0 ? `${name}:${JSON.stringify(overrides)}` : name;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const def = MATERIAL_DEFINITIONS[name] || MATERIAL_DEFINITIONS.plaster;
  const mat = new THREE.MeshStandardMaterial({ ...def, ...overrides });

  // Attach procedural texture maps and bump maps where applicable
  if (name === 'marble' || name === 'limestone') {
    mat.map = getMarbleTexture();
    mat.bumpMap = getMarbleBump();
    mat.bumpScale = def.bumpScale || 0.02;
  } else if (name === 'travertine' || name === 'marbleColosseum') {
    mat.map = getTravertineTexture();
    mat.bumpMap = getTravertineBump();
    mat.bumpScale = def.bumpScale || 0.04;
  } else if (name === 'romanBrick') {
    mat.map = getRomanBrickTexture();
    mat.bumpMap = getRomanBrickBump();
    mat.bumpScale = def.bumpScale || 0.05;
  } else if (name === 'roofTile') {
    mat.map = getRoofTileTexture();
    mat.bumpScale = def.bumpScale || 0.05;
  } else if (name === 'road') {
    mat.map = getRoadTexture();
    mat.bumpScale = def.bumpScale || 0.06;
  } else if (name === 'wood' || name === 'woodPlanks') {
    mat.map = getWoodTexture();
    mat.bumpScale = def.bumpScale || 0.04;
  } else if (name === 'tarmac') {
    mat.map = getTarmacTexture();
    mat.bumpScale = def.bumpScale || 0.03;
  }

  if (mat.map) {
    mat.map.repeat.set(4, 4);
  }

  cache.set(cacheKey, mat);
  return mat;
}

// ──── Evidence Confidence Tints ────

export const EVIDENCE_COLORS = {
  archaeological: 0x77b989, // Green
  documented:     0xd2c678, // Ochre
  plausible:      0xd59a55, // Terracotta
  atmospheric:    0xc98778, // Neutral rose
  disputed:       0xc66b78, // Crimson
};

const evidenceCache = new Map();

/**
 * Get color-coded material for historical certainty layers.
 * @param {string} level
 * @returns {THREE.MeshStandardMaterial}
 */
export function getEvidenceMaterial(level) {
  if (evidenceCache.has(level)) return evidenceCache.get(level);

  const color = EVIDENCE_COLORS[level] || 0xffffff;
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.65,
    metalness: 0.10,
    transparent: true,
    opacity: 0.82,
  });
  evidenceCache.set(level, mat);
  return mat;
}
