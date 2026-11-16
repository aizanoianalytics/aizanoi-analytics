(() => {
  'use strict';

  const E = window.AZ_ENGINE;
  if (!E) throw new Error('AZ_ENGINE yuklenemedi');
  const THREE = E.THREE;

  const bootEl = document.getElementById('boot');
  const bootMsg = document.getElementById('boot-msg');
  const bootFill = document.getElementById('boot-fill');
  const zoneEl = document.getElementById('zone-name');
  const coordsEl = document.getElementById('coords-readout');
  const compassEl = document.getElementById('compass-dir');
  const promptEl = document.getElementById('prompt');
  const promptText = document.getElementById('prompt-text');
  const toastEl = document.getElementById('toast');
  const lockHintEl = document.getElementById('lock-hint');
  const modeLabelEl = document.getElementById('mode-label');
  const atmoLabelEl = document.getElementById('atmo-label');
  const btnMode = document.getElementById('btn-mode');
  const btnAtmo = document.getElementById('btn-atmo');
  const btnFlash = document.getElementById('btn-flash');
  const btnMap = document.getElementById('btn-map');
  const btnHelp = document.getElementById('btn-help');
  const btnHelpClose = document.getElementById('btn-help-close');
  const helpModal = document.getElementById('help-modal');
  const minimapCard = document.getElementById('minimap-card');
  const minimapCanvas = document.getElementById('minimap');
  const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

  window.__frames = 0;
  window.__ready = false;
  window.__fatal = null;
  window.__errors = [];

  window.addEventListener('error', (ev) => {
    window.__errors.push(String(ev.message || ev.error || 'Unknown error'));
  });

  function showFatal(err) {
    const msg = String(err && err.stack ? err.stack : err);
    window.__fatal = msg;
    let el = document.getElementById('fatal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'fatal';
      document.getElementById('app').appendChild(el);
    }
    el.textContent = 'Aizanoi Factory baslatilamadi:\n' + msg;
  }

  const nextFrame = () => new Promise((r) => setTimeout(r, 0));
  async function setBoot(msg, pct) {
    if (bootMsg) bootMsg.textContent = msg;
    if (bootFill) bootFill.style.width = Math.round(pct * 100) + '%';
    await nextFrame();
  }

  let toastTimer = null;
  function showToast(text, dur = 2600) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), dur);
  }

  // Disable asphalt markings (yard is now 100% natural dirt & greenery)
  window.__AZ_DRAW_MARKS = () => {};

  // --------------------------------------------------------------------------
  // Procedural Materials: Natural Toprak Zemin, Dirt Road, Taş Duvar, Grass
  // --------------------------------------------------------------------------
  function makeEarthGroundMaterial() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#5c4b37';
    ctx.fillRect(0, 0, 512, 512);

    const b = document.createElement('canvas');
    b.width = 512;
    b.height = 512;
    const bctx = b.getContext('2d');
    bctx.fillStyle = '#808080';
    bctx.fillRect(0, 0, 512, 512);

    let seed = 8841;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

    for (let i = 0; i < 24000; i++) {
      const x = rnd() * 512;
      const y = rnd() * 512;
      const r = 1 + rnd() * 3.8;
      const v = rnd();
      ctx.fillStyle = v < 0.25 ? '#4a3a28' : v < 0.55 ? '#69553e' : v < 0.82 ? '#786248' : '#534330';
      ctx.fillRect(x, y, r, r);
      const gv = Math.round(90 + rnd() * 90);
      bctx.fillStyle = `rgb(${gv},${gv},${gv})`;
      bctx.fillRect(x, y, r, r);
    }
    // Small natural gravel pebbles
    for (let i = 0; i < 1600; i++) {
      const x = rnd() * 512;
      const y = rnd() * 512;
      const sz = 1.5 + rnd() * 2.5;
      ctx.fillStyle = rnd() < 0.5 ? '#857766' : '#403428';
      ctx.fillRect(x, y, sz, sz);
    }

    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(34, 34);
    map.anisotropy = 8;

    const bump = new THREE.CanvasTexture(b);
    bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
    bump.repeat.set(34, 34);
    bump.anisotropy = 4;

    return new THREE.MeshStandardMaterial({
      map,
      bumpMap: bump,
      bumpScale: 0.08,
      roughness: 0.94,
      metalness: 0.0
    });
  }

  function makeDirtRoadMaterial() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#735e46';
    ctx.fillRect(0, 0, 512, 512);

    let seed = 2317;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 20000; i++) {
      const x = rnd() * 512;
      const y = rnd() * 512;
      const s = 1 + rnd() * 3.5;
      ctx.fillStyle = rnd() < 0.4 ? '#634f3a' : rnd() < 0.78 ? '#7b664d' : '#8d785e';
      ctx.fillRect(x, y, s, s);
    }

    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(0.16, 0.16);
    map.anisotropy = 8;
    return new THREE.MeshStandardMaterial({
      map,
      roughness: 0.88,
      metalness: 0.0
    });
  }

  function makeStoneWallMaterial() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#5f5b53'; // mortar
    ctx.fillRect(0, 0, 512, 512);

    const b = document.createElement('canvas');
    b.width = 512;
    b.height = 512;
    const bctx = b.getContext('2d');
    bctx.fillStyle = '#404040';
    bctx.fillRect(0, 0, 512, 512);

    let seed = 5109;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const palette = ['#8f8779', '#7d7669', '#9c9384', '#6d665b', '#a49b8c', '#827a6d'];

    const rows = 8;
    const rowH = 512 / rows;
    for (let r = 0; r < rows; r++) {
      let x = (r % 2) * -38;
      while (x < 512) {
        const sw = 58 + rnd() * 64;
        const y = r * rowH;
        const pad = 4;
        ctx.fillStyle = palette[Math.floor(rnd() * palette.length)];
        ctx.fillRect(x + pad, y + pad, sw - pad * 2, rowH - pad * 2);
        // subtle stone speckle
        for (let k = 0; k < 28; k++) {
          ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,250,240,0.09)' : 'rgba(25,22,18,0.14)';
          ctx.fillRect(x + pad + rnd() * (sw - pad * 2), y + pad + rnd() * (rowH - pad * 2), 4, 3);
        }
        const bv = Math.round(160 + rnd() * 75);
        bctx.fillStyle = `rgb(${bv},${bv},${bv})`;
        bctx.fillRect(x + pad, y + pad, sw - pad * 2, rowH - pad * 2);
        x += sw;
      }
    }

    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(0.28, 0.46);
    map.anisotropy = 8;

    const bump = new THREE.CanvasTexture(b);
    bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
    bump.repeat.set(0.28, 0.46);
    bump.anisotropy = 4;

    return new THREE.MeshStandardMaterial({
      map,
      bumpMap: bump,
      bumpScale: 0.12,
      roughness: 0.88,
      metalness: 0.02
    });
  }

  function makeGrassMaterial() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#2d4d22';
    ctx.fillRect(0, 0, 512, 512);
    let seed = 4207;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 18000; i++) {
      const x = rnd() * 512;
      const y = rnd() * 512;
      const shade = rnd();
      ctx.fillStyle = shade < 0.33 ? '#243f1b' : shade < 0.72 ? '#365c27' : '#4b7333';
      ctx.fillRect(x, y, 2 + rnd() * 3, 2 + rnd() * 5);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 8);
    tex.anisotropy = 4;
    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.92,
      metalness: 0.0
    });
  }

  function buildTree(x, z, scale = 1.0, seed = 1) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const barkMat = new THREE.MeshStandardMaterial({ color: 0x4b382a, roughness: 0.92 });
    const leafMats = [
      new THREE.MeshStandardMaterial({ color: 0x2d5824, roughness: 0.84 }),
      new THREE.MeshStandardMaterial({ color: 0x3b6c2c, roughness: 0.82 }),
      new THREE.MeshStandardMaterial({ color: 0x497c35, roughness: 0.80 })
    ];

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24 * scale, 0.42 * scale, 3.4 * scale, 12), barkMat);
    trunk.position.y = 1.7 * scale;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    g.add(trunk);

    for (let b = 0; b < 4; b++) {
      const ang = (b / 4) * Math.PI * 2 + seed * 0.7;
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * scale, 0.16 * scale, 2.1 * scale, 8), barkMat);
      br.position.set(Math.cos(ang) * 0.62 * scale, 3.2 * scale, Math.sin(ang) * 0.62 * scale);
      br.rotation.set(Math.sin(ang) * 0.55, 0, -Math.cos(ang) * 0.55);
      br.castShadow = true;
      g.add(br);
    }

    const puffs = [
      [0, 5.1, 0, 2.1, 0],
      [1.35, 4.3, 0.7, 1.45, 1],
      [-1.3, 4.4, -0.6, 1.5, 2],
      [0.6, 4.2, -1.35, 1.4, 1],
      [-0.7, 4.1, 1.35, 1.45, 0],
      [0.3, 5.7, 0.3, 1.35, 2]
    ];
    for (const [px, py, pz, pr, mi] of puffs) {
      const crown = new THREE.Mesh(new THREE.SphereGeometry(pr * scale, 14, 10), leafMats[mi]);
      crown.position.set(px * scale, py * scale, pz * scale);
      crown.scale.y = 0.78;
      crown.castShadow = true;
      crown.receiveShadow = true;
      g.add(crown);
    }
    return g;
  }

  function buildCypress(x, z, h = 4.6) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.17, 1.0, 8),
      new THREE.MeshStandardMaterial({ color: 0x453427, roughness: 0.92 })
    );
    trunk.position.y = 0.5;
    g.add(trunk);
    const coneMat = new THREE.MeshStandardMaterial({ color: 0x254822, roughness: 0.86 });
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.82, h * 0.65, 12), coneMat);
    c1.position.y = h * 0.44;
    c1.castShadow = true;
    g.add(c1);
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.58, h * 0.55, 12), coneMat);
    c2.position.y = h * 0.72;
    c2.castShadow = true;
    g.add(c2);
    return g;
  }

  // --------------------------------------------------------------------------
  // Exterior Campus Builder (Yeşillik, Toprak Yol, Kompakt 4 Direkli Garaj,
  // Duvar Dibi Ağaç & Çardak, Taş Çevre Duvarları)
  // --------------------------------------------------------------------------
  function buildExteriorCampus(G, L, interactives) {
    const stat = L.staticRoot;
    const dyn = L.dynRoot;

    const concrete = L.M('concrete', { triplanar: true, scale: 0.4 });
    const concreteDirty = L.M('concrete_dirty', { triplanar: true, scale: 0.4 });
    const steelDark = L.M('steel_dark');
    const steelGalv = L.M('steel_galv');
    const roofMat = L.M('corrugated_roof');
    const woodDark = L.M('wood_dark');
    const woodPallet = L.MI('wood_pallet');
    const grassMat = makeGrassMaterial();
    const dirtRoadMat = makeDirtRoadMaterial();
    const stoneWallMat = makeStoneWallMaterial();
    const shrubMat = new THREE.MeshStandardMaterial({ color: 0x2f5a26, roughness: 0.88 });
    const ledWarm = G.mats.emissive(0xffd796, 3.8);
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xdca83c, metalness: 0.9, roughness: 0.22 });
    const glassCupMat = new THREE.MeshPhysicalMaterial({ color: 0xe6f4fb, transparent: true, opacity: 0.5, roughness: 0.08 });

    const exteriorNightLights = [];
    const addYardLight = (col, int, dist, x, y, z) => {
      const pl = new THREE.PointLight(col, int, dist, 1.8);
      pl.position.set(x, y, z);
      dyn.add(pl);
      exteriorNightLights.push({ light: pl, base: int });
      return pl;
    };

    // ------------------------------------------------------------------------
    // 1. TOPRAK YOL — Çizimdeki girişlerden geçip Çardak yanından, Rampadan ve Garaj önünden uzanan yol
    // ------------------------------------------------------------------------
    {
      // Main North-South dirt road immediately East of the wall-side Çardak & Ağaç (X: -16.5 .. -10.7)
      // Connects South-West entrance (Z = 42) all the way through North entrance (Z = -40)
      L.box(dirtRoadMat, 5.8, 0.025, 82.0, -13.6, 0.012, 1.0, { cast: false });
      // Branch road East around the Ramp low threshold (X: 1.5..4.0) and Honda CR-V
      L.box(dirtRoadMat, 14.5, 0.025, 11.0, -3.5, 0.014, 0.0, { cast: false });
      // South courtyard road running East in front of the front-aligned Garage (Z: 26.2..31.0)
      L.box(dirtRoadMat, 48.0, 0.025, 4.8, 10.5, 0.013, 28.6, { cast: false });
    }

    // ------------------------------------------------------------------------
    // 2. YEŞİLLİK ALANLARI (Üst Kuzey, Sağ Doğu, Alt Güney + Çardak Altı Çim)
    // ------------------------------------------------------------------------
    const greenZones = [
      // Üst Yeşillik (Kuzey)
      { x0: -2.5, z0: -37.2, x1: 36.8, z1: -28.4 },
      // Sağ Yeşillik Kuzey Parça (WC üstü)
      { x0: 28.4, z0: -28.4, x1: 36.8, z1: 5.7 },
      // Sağ Yeşillik WC Yan Şerit
      { x0: 33.1, z0: 5.7, x1: 36.8, z1: 18.3 },
      // Sağ Yeşillik Alt Parça (WC altı)
      { x0: 28.4, z0: 18.3, x1: 36.8, z1: 24.8 },
      // Alt Yeşillik (Güney — çizimdeki alt yeşil blok)
      { x0: -10.2, z0: 31.8, x1: 33.5, z1: 42.2 },
      // Duvar dibi Çardak & Ağaç yeşil şeridi (X: -22.2 .. -16.6, Z: 3.0 .. 21.0)
      { x0: -22.1, z0: 3.0, x1: -16.6, z1: 21.0 }
    ];

    for (const gz of greenZones) {
      const w = gz.x1 - gz.x0;
      const d = gz.z1 - gz.z0;
      const cx = (gz.x0 + gz.x1) / 2;
      const cz = (gz.z0 + gz.z1) / 2;
      L.slab(concreteDirty, gz.x0 - 0.12, 0.0, gz.z0 - 0.12, gz.x1 + 0.12, 0.09, gz.z1 + 0.12, { cast: false });
      L.box(grassMat, w, 0.10, d, cx, 0.05, cz, { cast: false });
    }

    // Instanced 3D Grass Blades scattered across all Yeşillik zones
    const bladeCount = 6500;
    const bladeGeo = new THREE.BoxGeometry(0.028, 0.22, 0.010);
    bladeGeo.translate(0, 0.11, 0);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x42752e, roughness: 0.85 });
    const blades = new THREE.InstancedMesh(bladeGeo, bladeMat, bladeCount);
    blades.receiveShadow = true;
    const dummy = new THREE.Object3D();
    const bColor = new THREE.Color();
    const rng = G.createRng(7711);
    let placedBlades = 0;
    const totalArea = greenZones.reduce((s, g) => s + (g.x1 - g.x0) * (g.z1 - g.z0), 0);
    for (const gz of greenZones) {
      const share = Math.round((bladeCount * (gz.x1 - gz.x0) * (gz.z1 - gz.z0)) / totalArea);
      for (let i = 0; i < share && placedBlades < bladeCount; i++) {
        const bx = gz.x0 + 0.25 + rng() * (gz.x1 - gz.x0 - 0.5);
        const bz = gz.z0 + 0.25 + rng() * (gz.z1 - gz.z0 - 0.5);
        dummy.position.set(bx, 0.09, bz);
        dummy.rotation.set((rng() - 0.5) * 0.28, rng() * Math.PI, (rng() - 0.5) * 0.28);
        const sc = 0.65 + rng() * 0.9;
        dummy.scale.set(1, sc, 1);
        dummy.updateMatrix();
        blades.setMatrixAt(placedBlades, dummy.matrix);
        bColor.setHSL(0.27 + (rng() - 0.5) * 0.04, 0.48, 0.25 + rng() * 0.14);
        blades.setColorAt(placedBlades, bColor);
        placedBlades++;
      }
    }
    blades.count = placedBlades;
    blades.instanceMatrix.needsUpdate = true;
    if (blades.instanceColor) blades.instanceColor.needsUpdate = true;
    stat.add(blades);

    const cypressSpots = [
      [1.5, -34.2], [11.5, -34.6], [21.5, -34.4], [33.4, -33.5],
      [34.6, -20.0], [34.6, -8.5], [34.6, 2.0], [34.6, 21.5],
      [-7.5, 39.2], [2.5, 39.5], [12.5, 39.2], [22.5, 39.4], [29.5, 39.0]
    ];
    for (const [cx, cz] of cypressSpots) {
      const c = buildCypress(cx, cz, 4.2 + rng() * 1.4);
      stat.add(c);
      L.col(cx - 0.4, 0, cz - 0.4, cx + 0.4, 4.5, cz + 0.4, 'wood');
    }
    for (let i = 0; i < 40; i++) {
      const gz = greenZones[i % 5];
      const sx = gz.x0 + 0.8 + rng() * Math.max(0.5, gz.x1 - gz.x0 - 1.6);
      const sz = gz.z0 + 0.8 + rng() * Math.max(0.5, gz.z1 - gz.z0 - 1.6);
      const bush = new THREE.Mesh(new THREE.SphereGeometry(0.45 + rng() * 0.35, 10, 8), shrubMat);
      bush.position.set(sx, 0.28, sz);
      bush.scale.set(1.2, 0.72, 1.1);
      bush.castShadow = true;
      bush.receiveShadow = true;
      stat.add(bush);
    }

    // ------------------------------------------------------------------------
    // 3. ÖNE ALINMIŞ KOMPAKT 4 DİREKLİ GARAJ — Fabrikanın ön-alt köşesinde (X: 4.1..10.5, Z: 22.05..25.75)
    // ------------------------------------------------------------------------
    {
      const gx0 = 4.1, gx1 = 10.5, gz0 = 22.05, gz1 = 25.75;
      const canopyH = 2.55;
      const gcx = (gx0 + gx1) / 2; // 7.3
      const gcz = (gz0 + gz1) / 2; // 23.9
      L.slab(concrete, gx0, 0.0, gz0, gx1, 0.04, gz1, { cast: false });
      L.col(gx0, -0.1, gz0, gx1, 0.04, gz1, 'concrete');

      // STRICTLY 4 SLIM CORNER STEEL POSTS (4 direk) — Completely open sides!
      const posts = [
        [gx0 + 0.14, gz0 + 0.14],
        [gx1 - 0.14, gz0 + 0.14],
        [gx0 + 0.14, gz1 - 0.14],
        [gx1 - 0.14, gz1 - 0.14]
      ];
      for (const [px, pz] of posts) {
        L.ibeam(steelDark, 'y', canopyH, px, 0.04 + canopyH / 2, pz, { depth: 0.16, width: 0.14 });
        L.box(steelDark, 0.14, canopyH, 0.14, px, 0.04 + canopyH / 2, pz);
        L.box(steelDark, 0.28, 0.06, 0.28, px, 0.07, pz);
        L.col(px - 0.12, 0, pz - 0.12, px + 0.12, canopyH + 0.1, pz + 0.12, 'metal');
      }

      // Canopy beams & corrugated roof
      L.box(steelDark, gx1 - gx0 + 0.16, 0.14, 0.14, gcx, canopyH, gz0 + 0.14);
      L.box(steelDark, gx1 - gx0 + 0.16, 0.14, 0.14, gcx, canopyH, gz1 - 0.14);
      for (const tx of [gx0 + 0.2, gcx, gx1 - 0.2]) {
        L.box(steelDark, 0.10, 0.12, gz1 - gz0, tx, canopyH + 0.06, gcz);
      }
      L.box(roofMat, gx1 - gx0 + 0.45, 0.07, gz1 - gz0 + 0.45, gcx, canopyH + 0.16, gcz, { r: [0.05, 0, 0] });

      // Compact ceiling LED strip directly over Porsche 928S
      L.box(steelDark, 1.3, 0.05, 0.18, gcx, canopyH - 0.04, gcz);
      L.box(ledWarm, 1.20, 0.03, 0.12, gcx, canopyH - 0.07, gcz, { parent: dyn });
      addYardLight(0xffe7c2, 10, 12, gcx, canopyH - 0.2, gcz);
    }

    // ------------------------------------------------------------------------
    // 4. DUVARIN DİBİNDE AĞAÇ & ÇARDAK (X = -19.5, Taş Duvarın hemen önünde!)
    //    Çardakın hemen yanından (X: -16.4..-10.8) toprak yol geçiyor!
    // ------------------------------------------------------------------------
    // Large Shade Tree right next to the West Stone Wall
    {
      const tree = buildTree(-19.4, 7.2, 1.15, 3);
      stat.add(tree);
      L.col(-19.9, 0, 6.7, -18.9, 3.6, 7.7, 'wood');
    }

    // Cozy Wooden Çardak right up against the West Stone Wall (X = -19.5, Z = 15.0)
    {
      const cx = -19.5, cz = 15.0;
      const cw = 4.6, cd = 5.0, deckH = 0.24, postH = 2.65;
      L.box(woodDark, cw, deckH, cd, cx, deckH / 2, cz, { bevel: 0.02 });
      // Step directly onto the adjacent dirt road on the East side (X = -17.0)
      L.box(woodDark, 0.55, 0.13, 1.7, cx + cw / 2 + 0.25, 0.065, cz, { bevel: 0.01 });
      L.col(cx - cw / 2, 0, cz - cd / 2, cx + cw / 2, deckH, cz + cd / 2, 'wood');

      for (const sx of [-cw / 2 + 0.18, cw / 2 - 0.18]) {
        for (const sz of [-cd / 2 + 0.18, cd / 2 - 0.18]) {
          L.box(woodDark, 0.16, postH, 0.16, cx + sx, deckH + postH / 2, cz + sz);
          L.col(cx + sx - 0.12, deckH, cz + sz - 0.12, cx + sx + 0.12, deckH + postH, cz + sz + 0.12, 'wood');
        }
      }
      // Railings on back (wall side) + North/South ends, open East side facing the road
      L.box(woodPallet, 0.10, 0.07, cd - 0.3, cx - cw / 2 + 0.18, deckH + 0.88, cz);
      L.box(woodPallet, 0.10, 0.07, cd - 0.3, cx - cw / 2 + 0.18, deckH + 0.45, cz);
      L.box(woodPallet, cw - 0.3, 0.07, 0.10, cx, deckH + 0.88, cz - cd / 2 + 0.18);
      L.box(woodPallet, cw - 0.3, 0.07, 0.10, cx, deckH + 0.45, cz - cd / 2 + 0.18);
      L.box(woodPallet, cw - 0.3, 0.07, 0.10, cx, deckH + 0.88, cz + cd / 2 - 0.18);
      L.box(woodPallet, cw - 0.3, 0.07, 0.10, cx, deckH + 0.45, cz + cd / 2 - 0.18);
      L.col(cx - cw / 2, deckH, cz - cd / 2, cx - cw / 2 + 0.35, deckH + 1.0, cz + cd / 2, 'wood');
      L.col(cx - cw / 2, deckH, cz - cd / 2, cx + cw / 2, deckH + 1.0, cz - cd / 2 + 0.35, 'wood');
      L.col(cx - cw / 2, deckH, cz + cd / 2 - 0.35, cx + cw / 2, deckH + 1.0, cz + cd / 2, 'wood');

      const roofCone = new THREE.Mesh(
        new THREE.ConeGeometry(3.9, 1.30, 4),
        new THREE.MeshStandardMaterial({ color: 0x4b2f21, roughness: 0.88 })
      );
      roofCone.position.set(cx, deckH + postH + 0.65, cz);
      roofCone.rotation.y = Math.PI / 4;
      roofCone.castShadow = true;
      roofCone.receiveShadow = true;
      stat.add(roofCone);

      L.box(woodPallet, 0.54, 0.44, cd - 0.9, cx - cw / 2 + 0.55, deckH + 0.22, cz);
      L.box(woodPallet, cw - 1.2, 0.44, 0.54, cx - 0.1, deckH + 0.22, cz - cd / 2 + 0.55);
      L.box(woodPallet, cw - 1.2, 0.44, 0.54, cx - 0.1, deckH + 0.22, cz + cd / 2 - 0.55);

      // Table + Tea Tray & Çaydanlık
      L.box(woodDark, 1.25, 0.06, 1.60, cx, deckH + 0.74, cz, { bevel: 0.01 });
      for (const [lx, lz] of [[-0.4, -0.52], [0.4, -0.52], [-0.4, 0.52], [0.4, 0.52]]) {
        L.box(woodDark, 0.10, 0.72, 0.10, cx + lx, deckH + 0.36, cz + lz);
      }
      L.col(cx - 0.65, deckH, cz - 0.82, cx + 0.65, deckH + 0.8, cz + 0.82, 'wood');

      L.cyl(brassMat, 0.28, 0.02, cx, deckH + 0.78, cz);
      L.cyl(steelGalv, 0.10, 0.22, cx, deckH + 0.90, cz);
      L.cyl(steelGalv, 0.075, 0.14, cx, deckH + 1.07, cz);
      for (const [gx, gz] of [[-0.22, -0.35], [0.22, -0.35], [-0.22, 0.35], [0.22, 0.35]]) {
        L.cyl(glassCupMat, 0.032, 0.09, cx + gx, deckH + 0.82, cz + gz);
      }

      L.box(steelDark, 0.03, 0.45, 0.03, cx, deckH + postH - 0.22, cz);
      L.box(ledWarm, 0.16, 0.20, 0.16, cx, deckH + postH - 0.48, cz, { parent: dyn });
      addYardLight(0xffcf88, 7.5, 9.5, cx, deckH + postH - 0.65, cz);

      interactives.push({
        id: 'cardak_cay',
        pos: new THREE.Vector3(cx, deckH + 0.9, cz),
        range: 3.4,
        getLabel: () => 'Cardakta Taze Cay Doldur',
        trigger: () => {
          if (G.fx && G.fx.smoke) {
            for (let s = 0; s < 5; s++) {
              G.fx.smoke([cx, deckH + 1.18, cz], [0, 0.4 + s * 0.08, 0], { size: 0.18, life: 1.5 });
            }
          }
          return 'Cardakta demli bir bardak cay dolduruldu. Keyifli dinlenmeler!';
        }
      });
    }

    // ------------------------------------------------------------------------
    // 5. DIŞ SINIR TAŞ DUVARLARI — İçeriye dönük duvar parçaları OLMADAN düz sınır duvarları
    // ------------------------------------------------------------------------
    const wallSegments = [
      // Batı dış sınır taş duvarı (Dodge, Ağaç, Çardak arkası)
      [-22.5, -36.0, -22.5, 22.0],
      // Kuzey dış sınır taş duvarı (Üst yeşillik dış kenarı)
      [-3.2, -37.8, 37.5, -37.8],
      // Doğu dış sınır taş duvarı (Sağ yeşillik dış kenarı)
      [37.5, -37.8, 37.5, 25.5],
      // Güney dış sınır taş duvarı (Alt yeşillik dış kenarı)
      [-10.5, 42.8, 34.0, 42.8]
    ];

    for (const [x0, z0, x1, z1] of wallSegments) {
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const ang = Math.atan2(dx, dz);

      // Coursed stone masonry wall + top stone coping cap
      L.box(stoneWallMat, 0.52, 2.15, len, cx, 1.075, cz, { r: [0, ang, 0] });
      L.box(concreteDirty, 0.64, 0.14, len + 0.1, cx, 2.20, cz, { r: [0, ang, 0] });

      // Periodic stone piers along wall
      const piers = Math.max(2, Math.floor(len / 9));
      for (let p = 0; p <= piers; p++) {
        const t = p / piers;
        const px = x0 + dx * t;
        const pz = z0 + dz * t;
        L.box(stoneWallMat, 0.72, 2.40, 0.72, px, 1.20, pz);
        L.box(concreteDirty, 0.82, 0.12, 0.82, px, 2.46, pz);
      }

      const nx = Math.min(x0, x1) - 0.35, px = Math.max(x0, x1) + 0.35;
      const nz = Math.min(z0, z1) - 0.35, pz = Math.max(z0, z1) + 0.35;
      L.col(nx, 0, nz, px, 2.8, pz, 'concrete');
    }

    // Yard lamp posts
    const postSpots = [[-21.4, -26], [-21.4, -4], [-21.4, 24], [-4, -38.8], [20, -38.8], [37.8, -10], [37.8, 22]];
    for (const [px, pz] of postSpots) {
      L.cyl(steelGalv, 0.11, 8.5, px, 4.25, pz);
      L.box(steelDark, 0.8, 0.18, 0.38, px, 8.5, pz);
      L.box(ledWarm, 0.65, 0.06, 0.28, px, 8.42, pz, { parent: dyn });
      addYardLight(0xffe1b0, 14, 24, px, 8.2, pz);
    }

    // Rolling distant green Anatolian countryside hills
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x2a3f22, roughness: 0.96, metalness: 0.0 });
    const hillCoords = [
      [-95, -95, 55, 16], [0, -110, 65, 22], [95, -90, 58, 18],
      [110, 10, 62, 19], [95, 100, 60, 17], [-5, 115, 70, 20],
      [-105, 90, 62, 16], [-112, -5, 58, 15]
    ];
    for (const [hx, hz, hr, hh] of hillCoords) {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(hr, 20, 12), hillMat);
      hill.position.set(hx, -hr * 0.52 + hh, hz);
      hill.scale.set(1.3, 0.42, 1.2);
      hill.receiveShadow = true;
      stat.add(hill);
    }

    return {
      setNightFactor(nf) {
        for (const l of exteriorNightLights) {
          l.light.intensity = l.base * (0.08 + nf * 1.35);
        }
      }
    };
  }

  // --------------------------------------------------------------------------
  // Atmosphere Presets
  // --------------------------------------------------------------------------
  const ATMOSPHERES = [
    {
      name: 'Gun Batimi',
      dir: [0.88, 0.25, 0.36],
      sunCol: 0xffba75,
      sunInt: 8.6,
      zenith: 0x101c2d,
      horizon: 0xf48c46,
      horizonAway: 0x2c3c4f,
      fog: 0x6f7c86,
      envInt: 1.8,
      wet: 0.0,
      rain: 0.0,
      night: 0.0
    },
    {
      name: 'Ogle Gunesi',
      dir: [0.42, 0.84, 0.32],
      sunCol: 0xfff5e4,
      sunInt: 10.5,
      zenith: 0x1e4d88,
      horizon: 0xaad0ee,
      horizonAway: 0x5c85ae,
      fog: 0x9bb7cb,
      envInt: 2.1,
      wet: 0.0,
      rain: 0.0,
      night: 0.0
    },
    {
      name: 'Yagmurlu',
      dir: [0.65, 0.34, 0.25],
      sunCol: 0xd8c8b6,
      sunInt: 4.4,
      zenith: 0x1a222b,
      horizon: 0x5a6570,
      horizonAway: 0x2a333d,
      fog: 0x454e56,
      envInt: 1.4,
      wet: 0.7,
      rain: 0.82,
      night: 0.25
    },
    {
      name: 'Gece Vardiyasi',
      dir: [-0.45, 0.35, -0.75],
      sunCol: 0x4b6ba8,
      sunInt: 1.15,
      zenith: 0x03060d,
      horizon: 0x111a2e,
      horizonAway: 0x070b14,
      fog: 0x0a101d,
      envInt: 0.50,
      wet: 0.1,
      rain: 0.0,
      night: 1.0
    }
  ];

  // --------------------------------------------------------------------------
  // Quick-Jump Bookmarks [1]-[9]
  // --------------------------------------------------------------------------
  const BOOKMARKS = [
    { label: 'Genel Avlu & Rampa', pos: [-9.2, 0.0, 8.2], yaw: -0.96, pitch: -0.03 },
    { label: 'Honda CR-V (2005 Siyah)', pos: [-5.8, 0.0, -9.8], yaw: -0.97, pitch: -0.06 },
    { label: 'Kirmizi Dodge Kamyon', pos: [-11.5, 0.0, -23.5], yaw: 2.50, pitch: -0.04 },
    { label: 'Duvar Dibi Agac & Cardak', pos: [-12.0, 0.0, 14.8], yaw: 1.55, pitch: -0.04 },
    { label: '4 Direkli Garaj & Porsche 928S', pos: [0.2, 0.0, 27.6], yaw: -1.12, pitch: -0.05 },
    { label: 'Paletler & Paketleme Masasi', pos: [9.5, 0.06, -2.5], yaw: -0.15, pitch: -0.06 },
    { label: 'Ofis 1 · Ofis 2 · Mutfak', pos: [7.75, 0.06, 6.2], yaw: -3.05, pitch: -0.05 },
    { label: 'Bardak Yaldiz (Yatay Carklar)', pos: [21.5, 0.06, -22.5], yaw: -0.06, pitch: -0.10 },
    { label: 'Cam Tezyinat Firini', pos: [18.5, 0.06, -8.5], yaw: -2.23, pitch: -0.06 }
  ];

  function getZoneName(x, y, z) {
    if (x >= 28.0 && x <= 33.0 && z >= 6.0 && z <= 12.0) return 'Erkek WC';
    if (x >= 28.0 && x <= 33.0 && z >= 12.0 && z <= 18.0) return 'Kadin WC';
    if (x >= 4.0 && x <= 28.0 && z >= -28.0 && z <= 22.0) {
      if (x < 15.5) {
        if (z >= 9.0 && z <= 15.2 && x < 10.6) return 'Ofis 1';
        if (z > 15.2 && z <= 21.8 && x < 10.6) return 'Ofis 2';
        if (z >= 9.0 && z <= 21.8 && x >= 10.6) return 'Mutfak';
        if (x >= 10.4 && z >= -19.2 && z <= -5.5) return 'Paketleme Masalari';
        return 'Sevkiyat & Palet Holu';
      } else {
        if (z <= -22.5) return 'Bardak Yaldiz Tezgahlari';
        if (x >= 21.0 && z >= -20.0 && z <= 13.5) return 'Cam Tezyinat Firini';
        if (z >= 13.6) return 'Ilk Paketleme Alani';
        return 'Uretim & Firin Holu';
      }
    }
    if (x >= -1.5 && x <= 4.0 && z >= -3.5 && z <= 3.5) return 'Yukleme Rampasi (Dik & Dolu)';
    if (x >= 4.0 && x <= 10.6 && z >= 22.0 && z <= 25.9) return 'Garaj (4 Direkli) · Porsche 928S';
    if (x >= -22.2 && x <= -16.8 && z >= 12.0 && z <= 18.2) return 'Cardak (Duvar Dibi)';
    if (x >= -22.2 && x <= -16.8 && z >= 4.5 && z <= 10.0) return 'Agac Golgeligi';
    if (x >= -16.6 && x <= -10.8) return 'Toprak Yol';
    if (z <= -28.2 || x >= 28.2 || z >= 32.5) return 'Yesillik Alani';
    return 'Toprak Avlu';
  }

  function drawMinimap(px, pz, yaw) {
    if (!minimapCtx) return;
    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    const ctx = minimapCtx;
    ctx.clearRect(0, 0, w, h);

    const minX = -25, maxX = 40, minZ = -41, maxZ = 47;
    const sx = (x) => ((x - minX) / (maxX - minX)) * w;
    const sz = (z) => ((z - minZ) / (maxZ - minZ)) * h;
    const fillRectW = (x0, z0, x1, z1, col, stroke) => {
      const rx = sx(x0), rz = sz(z0), rw = sx(x1) - rx, rh = sz(z1) - rz;
      ctx.fillStyle = col;
      ctx.fillRect(rx, rz, rw, rh);
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(rx, rz, rw, rh);
      }
    };

    // Earth dirt ground
    ctx.fillStyle = '#33291f';
    ctx.fillRect(0, 0, w, h);

    // Compacted dirt road beside Çardak & front of Garage
    fillRectW(-16.5, -40, -10.7, 42, '#4d3e2e');
    fillRectW(-11.0, -5.5, 4.0, 5.5, '#4d3e2e');
    fillRectW(-13.5, 26.2, 34.0, 31.0, '#4d3e2e');

    // Yeşillik
    fillRectW(-2.5, -37.2, 36.8, -28.4, '#244522', '#3a6c36');
    fillRectW(28.4, -28.4, 36.8, 24.8, '#244522', '#3a6c36');
    fillRectW(-10.2, 31.8, 33.5, 42.2, '#244522', '#3a6c36');
    fillRectW(-22.1, 3.0, -16.6, 21.0, '#244522', '#3a6c36');

    // Taş Çevre Duvarı (İçeri dönük parçalar olmadan dış sınırlar)
    ctx.strokeStyle = '#9b9182';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(sx(-22.5), sz(-36));
    ctx.lineTo(sx(-22.5), sz(22));
    ctx.moveTo(sx(-3.2), sz(-37.8));
    ctx.lineTo(sx(37.5), sz(-37.8));
    ctx.lineTo(sx(37.5), sz(25.5));
    ctx.moveTo(sx(-10.5), sz(42.8));
    ctx.lineTo(sx(34.0), sz(42.8));
    ctx.stroke();

    // Main Factory
    fillRectW(4.0, -28.0, 28.0, 22.0, '#232930', '#9ea6ae');
    ctx.strokeStyle = '#d4cab6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx(15.55), sz(-28));
    ctx.lineTo(sx(15.55), sz(-2.6));
    ctx.moveTo(sx(15.55), sz(2.6));
    ctx.lineTo(sx(15.55), sz(22));
    ctx.stroke();

    // Outward-rising Rampa (dik ve hemen yükselen)
    fillRectW(-1.3, -3.1, 4.0, 3.1, '#495057', '#ffb347');

    // İç Bölümler
    fillRectW(4.3, 9.0, 10.6, 15.2, '#2c3642', '#708499');
    fillRectW(4.3, 15.2, 10.6, 21.7, '#2c3642', '#708499');
    fillRectW(10.6, 9.0, 15.35, 21.7, '#2c3f3b', '#5da699');
    fillRectW(4.9, -26.5, 8.6, -5.5, '#7a5938');
    fillRectW(10.6, -18.8, 13.0, -13.6, '#8f6940');
    fillRectW(10.6, -11.0, 13.0, -5.8, '#8f6940');
    fillRectW(16.2, -27.3, 27.2, -25.4, '#8b7433');
    fillRectW(22.0, -19.5, 25.2, 13.0, '#9c431f', '#ff8c42');
    fillRectW(18.5, 16.8, 23.5, 18.8, '#4e5d6b');
    fillRectW(28.0, 6.0, 32.8, 12.0, '#2d4768', '#83a8d8');
    fillRectW(28.0, 12.0, 32.8, 18.0, '#5a314a', '#c97da8');

    // Front-Aligned Compact 4-Post Garage & Porsche 928S
    fillRectW(4.1, 22.05, 10.5, 25.75, '#2a2f35', '#ffb347');
    fillRectW(5.0, 23.0, 9.6, 24.8, '#08090c', '#ffffff');

    // Honda CR-V + Massive Dodge Truck + Wall-Side Tree & Çardak
    fillRectW(-1.3, -15.8, 0.5, -11.2, '#0b0d10', '#d0d7de');
    fillRectW(-19.7, -20.2, -16.7, -10.8, '#a8211b', '#f2b8b5');
    ctx.fillStyle = '#3c7a33';
    ctx.beginPath();
    ctx.arc(sx(-19.4), sz(7.2), 7, 0, Math.PI * 2);
    ctx.fill();
    fillRectW(-21.8, 12.5, -17.2, 17.5, '#6e4e30', '#d8b282');

    ctx.fillStyle = 'rgba(235,230,220,0.88)';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PALET', sx(9.8), sz(-22.5));
    ctx.fillText('YALDIZ', sx(21.8), sz(-25.8));
    ctx.fillText('FIRIN', sx(23.6), sz(-3.5));
    ctx.fillText('OFIS 1', sx(7.2), sz(12.2));
    ctx.fillText('OFIS 2', sx(7.2), sz(18.6));
    ctx.fillText('MUTFAK', sx(12.8), sz(15.6));
    ctx.fillText('GARAJ', sx(7.3), sz(27.5));
    ctx.fillText('CARDAK', sx(-19.2), sz(19.6));
    ctx.fillText('YOL', sx(-13.6), sz(26.5));
    ctx.fillText('DODGE', sx(-18.2), sz(-21.6));
    ctx.fillText('CR-V', sx(-0.4), sz(-16.8));

    const ux = sx(px), uz = sz(pz);
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    ctx.fillStyle = 'rgba(255, 179, 71, 0.28)';
    ctx.beginPath();
    ctx.moveTo(ux, uz);
    const ang = Math.atan2(fz, fx);
    ctx.arc(ux, uz, 22, ang - 0.45, ang + 0.45);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffb347';
    ctx.strokeStyle = '#0b0d0f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ux, uz, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // --------------------------------------------------------------------------
  // Main Bootstrap
  // --------------------------------------------------------------------------
  async function boot() {
    const params = Object.fromEntries(new URLSearchParams(location.search));
    const quality = E.detectQuality(params.q || '');

    const G = {
      THREE,
      geo: E.geo,
      createRng: E.createRng,
      params,
      events: E.createEvents(),
      rng: E.createRng(+(params.seed || 4207)),
      time: { t: 0, dt: 0, frame: 0, real: 0 },
      quality
    };
    window.__G = G;

    await setBoot('Ultra HD motor baslatiliyor', 0.10);
    G.render = await E.createRender(G);
    G.renderer = G.render.renderer;
    G.scene = G.render.scene;
    G.camera = G.render.camera;
    G.viewCamera = G.render.viewCamera;

    await setBoot('Prosedurel PBR dokular karistiriliyor', 0.25);
    G.mats = await E.createMaterials(G);
    G.physics = E.createPhysics(G);
    G.props = E.createProps(G);
    G.input = E.createInput(G);

    const L = E.createLevelHelper(G);
    const interactives = [];

    await setBoot('Fabrika binasi, firin ve ic bolumler insa ediliyor', 0.44);
    const interior = window.AZ_FACTORY_INTERIOR.buildFactoryBuilding(G, L, interactives);

    await setBoot('Tas duvarlar, toprak yol, garaj ve cardak kuruluyor', 0.62);
    const exterior = buildExteriorCampus(G, L, interactives);

    await setBoot('Honda CR-V, Iri Dodge Kamyon ve Porsche 928S hazirlaniyor', 0.78);
    const crv = window.AZ_VEHICLES.buildHondaCRV2005(G, G.mats);
    crv.position.set(-0.4, 0.0, -13.5);
    crv.rotation.y = 0.12;
    L.dynRoot.add(crv);
    L.col(-1.45, 0, -15.9, 0.65, 1.82, -11.1, 'metal');

    const dodge = window.AZ_VEHICLES.buildDodgeTruck(G, G.mats);
    dodge.position.set(-18.2, 0.0, -15.5);
    dodge.rotation.y = 0.0;
    L.dynRoot.add(dodge);
    L.col(-19.8, 0, -20.5, -16.6, 3.6, -10.8, 'metal');

    const porsche = window.AZ_VEHICLES.buildPorsche928S(G, G.mats);
    porsche.position.set(7.3, 0.04, 23.90);
    porsche.rotation.y = -Math.PI / 2;
    L.dynRoot.add(porsche);
    L.col(4.9, 0.04, 22.90, 9.7, 1.38, 24.90, 'metal');

    L.staticRoot.updateMatrixWorld(true);
    L.staticRoot.traverse((o) => {
      if (o.isMesh && !Array.isArray(o.material)) {
        const trans = !!o.material.transparent;
        o.castShadow = !trans && !o.material.isMeshBasicMaterial && o.castShadow !== false;
        o.receiveShadow = !o.material.isMeshBasicMaterial;
      }
    });
    const mergedLevel = E.mergeStatic(L.staticRoot);
    const levelRoot = new THREE.Group();
    levelRoot.name = 'factory-level';
    levelRoot.add(mergedLevel, L.dynRoot);
    G.scene.add(levelRoot);

    G.level = {
      playerStart: { pos: new THREE.Vector3(-9.2, 0.0, 8.2), yaw: -0.96 },
      interiorBoxes: [interior.interiorBox],
      groundSurfaceAt: () => 'concrete',
      update(dt) {
        interior.update(dt);
        for (const fn of L.updaters) fn(dt);
      }
    };

    await setBoot('Toprak zemin, golgeler ve yansimalar yukleniyor', 0.88);
    G.ground = await E.createGround(G);
    // Replace asphalt ground material with natural compacted earth / dirt ground (NO ASPHALT!)
    if (G.ground && G.ground.apron) {
      G.ground.apron.material = makeEarthGroundMaterial();
      G.ground.apron.receiveShadow = true;
    }

    G.physics.build();
    try {
      G.fx = await E.createFX(G);
    } catch {
      G.fx = { update() {} };
    }
    G.audio = params.noaudio ? { update() {}, play() {}, resume() {}, setInterior() {}, setIntensity() {} } : E.createAudio(G);

    G.player = E.createPlayer(G);
    G.player.reset(G.level.playerStart);
    G.player.enabled = true;
    G.input.setGameplay(true);

    const flashlight = new THREE.SpotLight(0xfff4de, 0, 32, Math.PI / 5.5, 0.45, 1.4);
    const flashTarget = new THREE.Object3D();
    flashTarget.position.set(0, 0, -10);
    G.camera.add(flashlight);
    G.camera.add(flashTarget);
    flashlight.target = flashTarget;
    G.scene.add(G.camera);

    let flashOn = false;
    function setFlash(on) {
      flashOn = !!on;
      flashlight.intensity = flashOn ? 24 : 0;
      btnFlash && btnFlash.classList.toggle('active', flashOn);
    }

    let atmoIdx = 0;
    function applyAtmosphere(idx) {
      atmoIdx = ((idx % ATMOSPHERES.length) + ATMOSPHERES.length) % ATMOSPHERES.length;
      const a = ATMOSPHERES[atmoIdx];
      G.render.setAtmosphere(a);
      if (G.mats && G.mats.uniforms && G.mats.uniforms.wet) {
        G.mats.uniforms.wet.value = a.wet;
      }
      if (G.ground && G.ground.setRain) {
        G.ground.setRain(a.rain);
      }
      interior.setNightFactor(a.night);
      exterior.setNightFactor(a.night);
      const lightsOn = a.night > 0.5;
      crv.userData.setLightsOn && crv.userData.setLightsOn(lightsOn);
      dodge.userData.setLightsOn && dodge.userData.setLightsOn(lightsOn);
      porsche.userData.setLightsOn && porsche.userData.setLightsOn(lightsOn);
      if (atmoLabelEl) atmoLabelEl.textContent = a.name;
      showToast('Atmosfer: ' + a.name);
    }
    applyAtmosphere(0);

    let droneMode = false;
    const dronePos = new THREE.Vector3(-9.2, 4.0, 8.2);
    let droneYaw = -1.10;
    let dronePitch = -0.15;

    function toggleDroneMode(force) {
      const next = typeof force === 'boolean' ? force : !droneMode;
      if (next === droneMode) return;
      droneMode = next;
      if (droneMode) {
        dronePos.copy(G.camera.position);
        droneYaw = G.player.yaw;
        dronePitch = G.player.pitch;
        G.player.enabled = false;
        showToast('Serbest Ucus (Drone) Modu — Space/C ile yukselip alcalabilirsiniz');
      } else {
        const gx = Math.max(-52, Math.min(52, dronePos.x));
        const gz = Math.max(-48, Math.min(48, dronePos.z));
        const gy = G.physics.groundHeight(gx, gz, Math.max(2.0, dronePos.y + 0.5));
        G.player.pos.set(gx, Math.max(0, gy), gz);
        G.player.vel.set(0, 0, 0);
        G.player.yaw = droneYaw;
        G.player.pitch = dronePitch;
        G.player.enabled = true;
        showToast('Yuruyus Modu (FPS)');
      }
      if (modeLabelEl) modeLabelEl.textContent = droneMode ? 'Drone Ucus Modu' : 'Yuruyus Modu';
      btnMode && btnMode.classList.toggle('active', droneMode);
    }

    function jumpToBookmark(idx) {
      const bm = BOOKMARKS[idx];
      if (!bm) return;
      if (droneMode) {
        dronePos.set(bm.pos[0], bm.pos[1] + 2.1, bm.pos[2]);
        droneYaw = bm.yaw;
        dronePitch = bm.pitch;
      } else {
        G.player.pos.set(bm.pos[0], bm.pos[1], bm.pos[2]);
        G.player.vel.set(0, 0, 0);
        G.player.yaw = bm.yaw;
        G.player.pitch = bm.pitch;
      }
      document.querySelectorAll('.bm-btn').forEach((b, i) => b.classList.toggle('active', i === idx));
      showToast(bm.label);
    }

    btnMode && btnMode.addEventListener('click', () => toggleDroneMode());
    btnAtmo && btnAtmo.addEventListener('click', () => applyAtmosphere(atmoIdx + 1));
    btnFlash && btnFlash.addEventListener('click', () => setFlash(!flashOn));
    btnMap && btnMap.addEventListener('click', () => {
      const hidden = minimapCard.classList.toggle('hidden');
      btnMap.classList.toggle('active', !hidden);
    });
    const toggleHelp = (show) => {
      const open = typeof show === 'boolean' ? show : helpModal.hidden;
      helpModal.hidden = !open;
      if (open && document.pointerLockElement) document.exitPointerLock();
    };
    btnHelp && btnHelp.addEventListener('click', () => toggleHelp(true));
    btnHelpClose && btnHelpClose.addEventListener('click', () => toggleHelp(false));
    document.querySelectorAll('.bm-btn').forEach((btn) => {
      btn.addEventListener('click', () => jumpToBookmark(+btn.dataset.bm));
    });

    window.addEventListener('keydown', (ev) => {
      if (ev.repeat) return;
      if (ev.code === 'KeyV') toggleDroneMode();
      else if (ev.code === 'KeyT') applyAtmosphere(atmoIdx + 1);
      else if (ev.code === 'KeyF') setFlash(!flashOn);
      else if (ev.code === 'KeyM') btnMap && btnMap.click();
      else if (ev.code === 'KeyH') toggleHelp();
      else if (ev.code === 'KeyE') {
        if (activeInteract) {
          const msg = activeInteract.trigger();
          if (msg) showToast(msg);
        }
      } else if (ev.code.startsWith('Digit')) {
        const n = +ev.code.replace('Digit', '');
        if (n >= 1 && n <= BOOKMARKS.length) jumpToBookmark(n - 1);
      }
    });

    const resumeAudio = () => {
      try { G.audio && G.audio.resume && G.audio.resume(); } catch {}
    };
    window.addEventListener('pointerdown', resumeAudio, { once: true });
    window.addEventListener('keydown', resumeAudio, { once: true });

    await setBoot('Ilk kare derleniyor', 0.96);
    try {
      await G.render.onLevelReady();
    } catch (e) {
      console.warn('[factory] onLevelReady:', e);
    }
    await setBoot('Hazir', 1.0);
    if (bootEl) {
      bootEl.classList.add('done');
      setTimeout(() => { bootEl.hidden = true; }, 650);
    }

    let activeInteract = null;
    let lastT = performance.now();
    const tmpFwd = new THREE.Vector3();
    const tmpRight = new THREE.Vector3();
    const tmpEul = new THREE.Euler(0, 0, 0, 'YXZ');

    G.renderer.setAnimationLoop(() => {
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - lastT) / 1000));
      lastT = now;

      G.time.dt = dt;
      G.time.t += dt;
      G.time.real = now / 1000;
      G.time.frame++;

      G.input.update(dt);
      lockHintEl && lockHintEl.classList.toggle('hidden', G.input.locked || G.input.touch);

      if (!helpModal.hidden) {
        G.input.endFrame();
        G.render.frame(dt);
        return;
      }

      if (droneMode) {
        droneYaw -= G.input.look.dx;
        dronePitch = Math.max(-1.52, Math.min(1.52, dronePitch - G.input.look.dy));
        tmpEul.set(dronePitch, droneYaw, 0, 'YXZ');
        tmpFwd.set(0, 0, -1).applyEuler(tmpEul);
        tmpRight.set(1, 0, 0).applyEuler(tmpEul);

        const speed = G.input.sprint ? 19.0 : 8.5;
        const mx = G.input.move.x;
        const my = G.input.move.y;
        dronePos.addScaledVector(tmpFwd, my * speed * dt);
        dronePos.addScaledVector(tmpRight, mx * speed * dt);
        if (G.input.down('jump')) dronePos.y += speed * 0.75 * dt;
        if (G.input.down('crouch')) dronePos.y -= speed * 0.75 * dt;
        dronePos.y = Math.max(0.35, Math.min(34, dronePos.y));
        dronePos.x = Math.max(-55, Math.min(55, dronePos.x));
        dronePos.z = Math.max(-50, Math.min(50, dronePos.z));

        G.camera.position.copy(dronePos);
        G.camera.rotation.set(dronePitch, droneYaw, 0, 'YXZ');
      } else {
        G.player.update(dt);
      }

      G.level.update(dt);
      G.ground.update(dt);
      G.fx && G.fx.update && G.fx.update(dt);
      G.audio && G.audio.update && G.audio.update(dt);
      G.mats && G.mats.update && G.mats.update(dt);

      const camPos = G.camera.position;
      let best = null;
      let bestD = Infinity;
      for (const item of interactives) {
        const d = camPos.distanceTo(item.pos);
        if (d <= item.range && d < bestD) {
          best = item;
          bestD = d;
        }
      }
      activeInteract = best;
      if (best) {
        promptText.textContent = best.getLabel();
        promptEl.classList.add('on');
        G.input.setPrompt && G.input.setPrompt(true);
      } else {
        promptEl.classList.remove('on');
        G.input.setPrompt && G.input.setPrompt(false);
      }

      const curYaw = droneMode ? droneYaw : G.player.yaw;
      if (zoneEl) zoneEl.textContent = getZoneName(camPos.x, camPos.y, camPos.z);
      if (coordsEl) coordsEl.textContent = `X ${camPos.x.toFixed(1)} · Z ${camPos.z.toFixed(1)}`;
      if (compassEl) {
        let deg = Math.round(((-curYaw * 180) / Math.PI) % 360);
        if (deg < 0) deg += 360;
        const dirs = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];
        compassEl.textContent = `${dirs[Math.round(deg / 45) % 8]} ${deg}°`;
      }
      if (!minimapCard.classList.contains('hidden')) {
        drawMinimap(camPos.x, camPos.z, curYaw);
      }

      G.render.frame(dt);
      G.input.endFrame();

      window.__frames++;
      if (window.__frames === 2) window.__ready = true;
    });
  }

  boot().catch(showFatal);
})();
