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
    map.repeat.set(52, 52);
    map.anisotropy = 8;

    const bump = new THREE.CanvasTexture(b);
    bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
    bump.repeat.set(52, 52);
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
    ctx.fillStyle = '#5f5b53';
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
      ctx.fillStyle = shade < 0.33 ? '#243f1b' : shade < 0.72 ? '#365c27' : '#4f7a34';
      ctx.fillRect(x, y, 2 + rnd() * 3, 2 + rnd() * 5);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(12, 12);
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
  // Exterior Campus Builder (Expanded +25% Alan, +50% Genişletilmiş Yeşillikler
  // & Uzun Yabanıl Otlar, Tek Araçlık 3 Kapılı Taş Duvar, Direksiz Çardak)
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
    const wildWeedMat = new THREE.MeshStandardMaterial({ color: 0x4b6a2c, roughness: 0.90 });
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
    // 1. TOPRAK YOLLAR — Tek araçlık 3 kapı ile bağlantılı genişletilmiş yollar
    // ------------------------------------------------------------------------
    {
      // Main North-South dirt road (X: -19.6..-13.4, Z: -53..37.2) -> exits North through Gate 3 (Z=-48, X:-18.6..-14.4)
      L.box(dirtRoadMat, 6.2, 0.025, 90.2, -16.5, 0.012, -7.9, { cast: false });
      // Compacted dirt apron under Dodge Truck connecting smoothly to N-S road
      L.box(dirtRoadMat, 6.4, 0.025, 12.0, -22.2, 0.013, -21.5, { cast: false });
      // Branch road East around the longer Cement Ramp (X: -13.4..4.0, Z: -6.5..6.5) & Honda CR-V
      L.box(dirtRoadMat, 17.6, 0.025, 13.0, -4.6, 0.014, 0.0, { cast: false });
      // West gate apron connecting N-S road out through Gate 1 beside Çardak (X: -34..-19.4, Z: 26.6..31.4)
      L.box(dirtRoadMat, 14.6, 0.025, 4.8, -26.7, 0.013, 29.0, { cast: false });
      // South courtyard road running East in front of Garage (Z: 31.6..36.6) & out Rear Gate 2 (X=48)
      L.box(dirtRoadMat, 72.0, 0.025, 5.0, 16.5, 0.013, 34.1, { cast: false });
    }

    // ------------------------------------------------------------------------
    // 2. YEŞİLLİK ALANLARI (+50% Genişletilmiş En & Uzun Yabanıl Otlar)
    // ------------------------------------------------------------------------
    const greenZones = [
      // Üst Yeşillik (Kuzey)
      { x0: -4.5, z0: -47.2, x1: 47.2, z1: -35.5 },
      // Sağ Yeşillik Kuzey Parça (WC üstü — %50+ geniş)
      { x0: 34.4, z0: -35.5, x1: 47.2, z1: 6.7 },
      // Sağ Yeşillik WC Yan Şerit
      { x0: 39.6, z0: 6.7, x1: 47.2, z1: 21.3 },
      // Sağ Yeşillik Alt Parça (WC altı)
      { x0: 34.4, z0: 21.3, x1: 47.2, z1: 31.2 },
      // Alt Yeşillik (Güney — Ofise arkamızı döndüğümüzde solumuzda kalan yeşil alan, eni %65+ genişletildi!)
      { x0: -28.4, z0: 37.8, x1: 47.2, z1: 55.3 },
      // Duvar dibi Çardak & Ağaç yeşil şeridi (X: -28.4..-20.2, Z: 2.0..25.8, ~%50 daha geniş)
      { x0: -28.4, z0: 2.0, x1: -20.2, z1: 25.8 }
    ];

    for (const gz of greenZones) {
      const w = gz.x1 - gz.x0;
      const d = gz.z1 - gz.z0;
      const cx = (gz.x0 + gz.x1) / 2;
      const cz = (gz.z0 + gz.z1) / 2;
      L.slab(concreteDirty, gz.x0 - 0.12, 0.0, gz.z0 - 0.12, gz.x1 + 0.12, 0.09, gz.z1 + 0.12, { cast: false });
      L.box(grassMat, w, 0.10, d, cx, 0.05, cz, { cast: false });
    }

    // Instanced Tall Wild Grass & Weeds ("daha uzun yabanıl gibi otlar")
    const bladeCount = 12000;
    const bladeGeo = new THREE.BoxGeometry(0.042, 0.56, 0.014);
    bladeGeo.translate(0, 0.28, 0);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x4c7b32, roughness: 0.87 });
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
        dummy.rotation.set((rng() - 0.5) * 0.58, rng() * Math.PI, (rng() - 0.5) * 0.58);
        const scY = 0.78 + rng() * 1.25; // up to ~1.14m tall wild blades
        const scX = 0.8 + rng() * 0.7;
        dummy.scale.set(scX, scY, 1);
        dummy.updateMatrix();
        blades.setMatrixAt(placedBlades, dummy.matrix);
        // Wild olive, meadow green & dry wheat hues
        bColor.setHSL(0.18 + rng() * 0.14, 0.36 + rng() * 0.22, 0.22 + rng() * 0.18);
        blades.setColorAt(placedBlades, bColor);
        placedBlades++;
      }
    }
    blades.count = placedBlades;
    blades.instanceMatrix.needsUpdate = true;
    if (blades.instanceColor) blades.instanceColor.needsUpdate = true;
    stat.add(blades);

    // Extra tall wild weed/reed tufts across the green zones (especially wide South lawn)
    const tuftCount = 3200;
    const tuftGeo = new THREE.BoxGeometry(0.055, 0.92, 0.018);
    tuftGeo.translate(0, 0.46, 0);
    const tufts = new THREE.InstancedMesh(tuftGeo, wildWeedMat, tuftCount);
    tufts.receiveShadow = true;
    let placedTufts = 0;
    for (const gz of greenZones) {
      const share = Math.round((tuftCount * (gz.x1 - gz.x0) * (gz.z1 - gz.z0)) / totalArea);
      for (let i = 0; i < share && placedTufts < tuftCount; i++) {
        const bx = gz.x0 + 0.35 + rng() * (gz.x1 - gz.x0 - 0.7);
        const bz = gz.z0 + 0.35 + rng() * (gz.z1 - gz.z0 - 0.7);
        dummy.position.set(bx, 0.09, bz);
        dummy.rotation.set((rng() - 0.5) * 0.65, rng() * Math.PI, (rng() - 0.5) * 0.65);
        dummy.scale.set(0.8 + rng() * 0.7, 0.80 + rng() * 0.75, 1); // up to ~1.42m tall wild stalks
        dummy.updateMatrix();
        tufts.setMatrixAt(placedTufts, dummy.matrix);
        bColor.setHSL(0.15 + rng() * 0.14, 0.32 + rng() * 0.20, 0.24 + rng() * 0.16);
        tufts.setColorAt(placedTufts, bColor);
        placedTufts++;
      }
    }
    tufts.count = placedTufts;
    tufts.instanceMatrix.needsUpdate = true;
    if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
    stat.add(tufts);

    const cypressSpots = [
      [1.5, -43.0], [13.5, -43.5], [26.5, -43.2], [41.5, -42.0],
      [44.2, -26.0], [44.2, -10.5], [44.2, 4.0], [44.2, 26.5],
      [-23.5, 51.0], [-11.5, 51.4], [2.5, 51.2], [16.5, 51.4], [30.5, 51.0], [42.0, 50.8]
    ];
    for (const [cx, cz] of cypressSpots) {
      const c = buildCypress(cx, cz, 4.4 + rng() * 1.6);
      stat.add(c);
      L.col(cx - 0.4, 0, cz - 0.4, cx + 0.4, 4.5, cz + 0.4, 'wood');
    }
    for (let i = 0; i < 65; i++) {
      const gz = greenZones[i % 5];
      const sx = gz.x0 + 0.8 + rng() * Math.max(0.5, gz.x1 - gz.x0 - 1.6);
      const sz = gz.z0 + 0.8 + rng() * Math.max(0.5, gz.z1 - gz.z0 - 1.6);
      const bush = new THREE.Mesh(new THREE.SphereGeometry(0.50 + rng() * 0.42, 10, 8), shrubMat);
      bush.position.set(sx, 0.32, sz);
      bush.scale.set(1.25, 0.80, 1.15);
      bush.castShadow = true;
      bush.receiveShadow = true;
      stat.add(bush);
    }

    // ------------------------------------------------------------------------
    // 3. ÖNE ALINMIŞ KOMPAKT 4 DİREKLİ GARAJ (X: 4.5..11.2, Z: 27.6..31.3)
    // ------------------------------------------------------------------------
    {
      const gx0 = 4.5, gx1 = 11.2, gz0 = 27.6, gz1 = 31.3;
      const canopyH = 3.35;
      const gcx = (gx0 + gx1) / 2; // 7.85
      const gcz = (gz0 + gz1) / 2; // 29.45
      L.slab(concrete, gx0, 0.0, gz0, gx1, 0.04, gz1, { cast: false });
      L.col(gx0, -0.1, gz0, gx1, 0.04, gz1, 'concrete');

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

      L.box(steelDark, gx1 - gx0 + 0.16, 0.14, 0.14, gcx, canopyH, gz0 + 0.14);
      L.box(steelDark, gx1 - gx0 + 0.16, 0.14, 0.14, gcx, canopyH, gz1 - 0.14);
      for (const tx of [gx0 + 0.2, gcx, gx1 - 0.2]) {
        L.box(steelDark, 0.10, 0.12, gz1 - gz0, tx, canopyH + 0.06, gcz);
      }
      L.box(roofMat, gx1 - gx0 + 0.45, 0.07, gz1 - gz0 + 0.45, gcx, canopyH + 0.16, gcz, { r: [0.05, 0, 0] });
      // Climbable Garage Canopy Roof (#14)
      L.col(gx0 - 0.2, canopyH, gz0 - 0.2, gx1 + 0.2, canopyH + 0.22, gz1 + 0.2, 'metal');

      L.box(steelDark, 1.3, 0.05, 0.18, gcx, canopyH - 0.04, gcz);
      L.box(ledWarm, 1.20, 0.03, 0.12, gcx, canopyH - 0.07, gcz, { parent: dyn });
      addYardLight(0xffe7c2, 10, 12, gcx, canopyH - 0.2, gcz);
    }

    // ------------------------------------------------------------------------
    // 4. DUVARIN DİBİNDE AĞAÇ & ÇARDAK (X = -25.4, Taş Duvarın hemen önünde!)
    //    Yanındaki ışık direği KALDIRILDI!
    // ------------------------------------------------------------------------
    {
      const tree = buildTree(-25.4, 9.2, 1.22, 3);
      stat.add(tree);
      L.col(-25.95, 0, 8.65, -24.85, 3.8, 9.75, 'wood');
    }

    {
      const cx = -25.4, cz = 21.8;
      const cw = 4.8, cd = 5.2, deckH = 0.24, postH = 2.65;
      L.box(woodDark, cw, deckH, cd, cx, deckH / 2, cz, { bevel: 0.02 });
      // Step on East side
      L.box(woodDark, 0.55, 0.13, 1.8, cx + cw / 2 + 0.25, 0.065, cz, { bevel: 0.01 });
      L.col(cx + cw / 2, 0, cz - 0.9, cx + cw / 2 + 0.55, 0.13, cz + 0.9, 'wood');
      L.col(cx - cw / 2, 0, cz - cd / 2, cx + cw / 2, deckH, cz + cd / 2, 'wood');

      for (const sx of [-cw / 2 + 0.18, cw / 2 - 0.18]) {
        for (const sz of [-cd / 2 + 0.18, cd / 2 - 0.18]) {
          L.box(woodDark, 0.16, postH, 0.16, cx + sx, deckH + postH / 2, cz + sz);
          L.col(cx + sx - 0.12, deckH, cz + sz - 0.12, cx + sx + 0.12, deckH + postH, cz + sz + 0.12, 'wood');
        }
      }
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
        new THREE.ConeGeometry(4.0, 1.30, 4),
        new THREE.MeshStandardMaterial({ color: 0x4b2f21, roughness: 0.88 })
      );
      roofCone.position.set(cx, deckH + postH + 0.65, cz);
      roofCone.rotation.y = Math.PI / 4;
      roofCone.castShadow = true;
      roofCone.receiveShadow = true;
      stat.add(roofCone);
      // Climbable Çardak roof (#14)
      L.col(cx - cw / 2, deckH + postH, cz - cd / 2, cx + cw / 2, deckH + postH + 0.55, cz + cd / 2, 'wood');

      // Climbable Benches inside Çardak
      L.box(woodPallet, 0.54, 0.44, cd - 0.9, cx - cw / 2 + 0.55, deckH + 0.22, cz);
      L.col(cx - cw / 2 + 0.28, deckH, cz - (cd - 0.9) / 2, cx - cw / 2 + 0.82, deckH + 0.46, cz + (cd - 0.9) / 2, 'wood');
      L.box(woodPallet, cw - 1.2, 0.44, 0.54, cx - 0.1, deckH + 0.22, cz - cd / 2 + 0.55);
      L.col(cx - 0.1 - (cw - 1.2) / 2, deckH, cz - cd / 2 + 0.28, cx - 0.1 + (cw - 1.2) / 2, deckH + 0.46, cz - cd / 2 + 0.82, 'wood');
      L.box(woodPallet, cw - 1.2, 0.44, 0.54, cx - 0.1, deckH + 0.22, cz + cd / 2 - 0.55);
      L.col(cx - 0.1 - (cw - 1.2) / 2, deckH, cz + cd / 2 - 0.82, cx - 0.1 + (cw - 1.2) / 2, deckH + 0.46, cz + cd / 2 - 0.28, 'wood');

      // Climbable Table + Tea Tray & Çaydanlık
      L.box(woodDark, 1.25, 0.06, 1.60, cx, deckH + 0.74, cz, { bevel: 0.01 });
      for (const [lx, lz] of [[-0.4, -0.52], [0.4, -0.52], [-0.4, 0.52], [0.4, 0.52]]) {
        L.box(woodDark, 0.10, 0.72, 0.10, cx + lx, deckH + 0.36, cz + lz);
      }
      L.col(cx - 0.65, deckH, cz - 0.82, cx + 0.65, deckH + 0.80, cz + 0.82, 'wood');

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
    // 5. DIŞ SINIR TAŞ DUVARLARI — YALNIZCA 3 ADET TEK ARAÇLIK KAPI (4.2m),
    //    GERİ KALAN TÜM ÇEVRE KESİNTİSİZ TAŞ DUVAR!
    //    - #10: Çardak yanı Batı kapısı: X=-29.0, Z: 26.8..31.0 (4.2m)
    //    - #12: Fabrika arkası Doğu çıkış kapısı: X=48.0, Z: 31.9..36.1 (4.2m)
    //    - #13: Dodge kamyon arkası Kuzey kapısı: Z=-48.0, X: -18.6..-14.4 (4.2m)
    // ------------------------------------------------------------------------
    const wallSegments = [
      // Batı dış sınır taş duvarı (Çardak yanı tek araçlık kapı Z: 26.8..31.0 hariç kesintisiz)
      [-29.0, -48.0, -29.0, 26.8],
      [-29.0, 31.0, -29.0, 56.0],
      // Kuzey dış sınır taş duvarı (Dodge arkası tek araçlık kapı X: -18.6..-14.4 hariç kesintisiz)
      [-29.0, -48.0, -18.6, -48.0],
      [-14.4, -48.0, 48.0, -48.0],
      // Doğu dış sınır taş duvarı (Fabrika arkası tek araçlık kapı Z: 31.9..36.1 hariç kesintisiz)
      [48.0, -48.0, 48.0, 31.9],
      [48.0, 36.1, 48.0, 56.0],
      // Güney dış sınır taş duvarı (Tamamı kesintisiz duvar!)
      [-29.0, 56.0, 48.0, 56.0]
    ];

    for (const [x0, z0, x1, z1] of wallSegments) {
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const ang = Math.atan2(dx, dz);

      L.box(stoneWallMat, 0.52, 2.15, len, cx, 1.075, cz, { r: [0, ang, 0] });
      L.box(concreteDirty, 0.64, 0.14, len + 0.1, cx, 2.20, cz, { r: [0, ang, 0] });

      const piers = Math.max(2, Math.floor(len / 9));
      for (let p = 0; p <= piers; p++) {
        const t = p / piers;
        const px = x0 + dx * t;
        const pz = z0 + dz * t;
        L.box(stoneWallMat, 0.72, 2.45, 0.72, px, 1.225, pz);
        L.box(concreteDirty, 0.82, 0.14, 0.82, px, 2.52, pz);
      }

      const nx = Math.min(x0, x1) - 0.35, px = Math.max(x0, x1) + 0.35;
      const nz = Math.min(z0, z1) - 0.35, pz = Math.max(z0, z1) + 0.35;
      L.col(nx, 0, nz, px, 2.65, pz, 'concrete');
    }

    // Prominent stone gate pillars framing the 3 single-car (4.2m) openings
    const gatePillars = [
      [-29.0, 26.8], [-29.0, 31.0], // Gate 1 (Cardak side)
      [48.0, 31.9], [48.0, 36.1],   // Gate 2 (Rear Factory exit)
      [-18.6, -48.0], [-14.4, -48.0] // Gate 3 (Dodge rear passage)
    ];
    for (const [gx, gz] of gatePillars) {
      L.box(stoneWallMat, 0.95, 2.85, 0.95, gx, 1.425, gz);
      L.box(concreteDirty, 1.08, 0.16, 1.08, gx, 2.93, gz);
      L.col(gx - 0.50, 0, gz - 0.50, gx + 0.50, 3.02, gz + 0.50, 'concrete');
    }

    // Yard lamp posts — Çardak yanındaki direk (-21.4, 24) KALDIRILDI (#10)!
    const postSpots = [
      [-27.8, -34], [-27.8, -6], [-6, -46.8], [22, -46.8],
      [46.8, -20], [46.8, 18], [46.8, 46], [16, 54.8], [-16, 54.8]
    ];
    for (const [px, pz] of postSpots) {
      L.cyl(steelGalv, 0.11, 8.5, px, 4.25, pz);
      L.box(steelDark, 0.8, 0.18, 0.38, px, 8.5, pz);
      L.box(ledWarm, 0.65, 0.06, 0.28, px, 8.42, pz, { parent: dyn });
      addYardLight(0xffe1b0, 14, 26, px, 8.2, pz);
    }

    // Rolling distant green Anatolian countryside hills (pushed further out for expanded map)
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x2a3f22, roughness: 0.96, metalness: 0.0 });
    const hillCoords = [
      [-115, -115, 62, 18], [10, -130, 72, 24], [120, -110, 64, 20],
      [135, 10, 68, 21], [120, 125, 66, 19], [5, 138, 78, 22],
      [-125, 110, 68, 18], [-132, -5, 64, 17]
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
    { label: 'Genel Avlu & Uzun Cimento Rampa', pos: [-11.5, 0.0, 9.5], yaw: -0.96, pitch: -0.03 },
    { label: 'Honda CR-V (2005 Siyah)', pos: [-7.8, 0.0, -13.0], yaw: -1.10, pitch: -0.06 },
    { label: 'Kirmizi Dodge Kamyon & Kuzey Kapi', pos: [-15.8, 0.0, -29.0], yaw: 2.45, pitch: -0.04 },
    { label: 'Duvar Dibi Agac & Cardak', pos: [-16.5, 0.0, 21.8], yaw: 1.57, pitch: -0.04 },
    { label: '4 Direkli Garaj & Porsche 928S', pos: [-0.5, 0.0, 33.8], yaw: -1.08, pitch: -0.05 },
    { label: 'Palet Parkur & Paketleme Masasi', pos: [12.0, 0.06, -3.5], yaw: 0.45, pitch: -0.06 },
    { label: 'Ofis 1 · Ofis 2 (PC) · Mutfak', pos: [8.2, 0.06, 9.2], yaw: -3.12, pitch: -0.05 },
    { label: 'Bardak Yaldiz (Arka Gecis & Tepsiler)', pos: [26.0, 0.06, -21.5], yaw: 0.0, pitch: -0.08 },
    { label: 'Cam Tezyinat Firini', pos: [23.2, 0.06, -8.5], yaw: -2.10, pitch: -0.06 }
  ];

  function getZoneName(x, y, z) {
    if (x >= 34.0 && x <= 39.2 && z >= 7.0 && z <= 14.0) return 'Erkek WC';
    if (x >= 34.0 && x <= 39.2 && z > 14.0 && z <= 21.0) return 'Kadin WC';
    if (x >= 4.0 && x <= 34.0 && z >= -35.0 && z <= 27.5) {
      if (x < 18.5) {
        if (z >= 12.5 && z <= 19.8 && x < 11.8) return 'Ofis 1';
        if (z > 19.8 && z <= 27.15 && x < 11.8) return 'Ofis 2';
        if (z >= 12.5 && z <= 27.15 && x >= 11.8) return 'Mutfak';
        if (x >= 13.0 && z >= -22.5 && z <= -6.5) return 'Paketleme Masalari';
        return 'Sevkiyat & Palet Holu';
      } else {
        if (z <= -30.5) return 'Yaldiz Tezgahi Arka Alan';
        if (z <= -23.8) return 'Bardak Yaldiz & Tepsi Istifleri';
        if (x >= 26.0 && z >= -21.5 && z <= 17.5) return 'Cam Tezyinat Firini';
        if (z >= 18.5) return 'Ilk Paketleme Alani';
        return 'Uretim & Firin Holu';
      }
    }
    if (x >= -4.8 && x <= 4.0 && z >= -3.1 && z <= 3.1) return 'Yukleme Rampasi (Cimento)';
    if (x >= 4.5 && x <= 11.2 && z >= 27.6 && z <= 31.3) return 'Garaj (4 Direkli) · Porsche 928S';
    if (x >= -28.0 && x <= -22.8 && z >= 19.0 && z <= 24.6) return 'Cardak (Duvar Dibi)';
    if (x >= -28.0 && x <= -22.8 && z >= 6.5 && z <= 12.0) return 'Agac Golgeligi';
    if (x >= -19.6 && x <= -13.4 && z <= 37.2) return 'Toprak Yol';
    if (z <= -35.4 || x >= 34.3 || z >= 37.7 || (x <= -20.2 && z >= 2.0 && z <= 25.8)) return 'Yesillik & Yabanil Ot Alani';
    return 'Toprak Avlu';
  }

  function drawMinimap(px, pz, yaw) {
    if (!minimapCtx) return;
    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    const ctx = minimapCtx;
    ctx.clearRect(0, 0, w, h);

    const minX = -32, maxX = 51, minZ = -51, maxZ = 59;
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

    // Compacted dirt roads & single-car gates
    fillRectW(-19.6, -52, -13.4, 37.2, '#4d3e2e');
    fillRectW(-13.4, -6.5, 4.0, 6.5, '#4d3e2e');
    fillRectW(-33.5, 26.6, -19.4, 31.4, '#4d3e2e');
    fillRectW(-19.5, 31.6, 52.5, 36.6, '#4d3e2e');

    // Expanded Yeşillik zones
    fillRectW(-4.5, -47.2, 47.2, -35.5, '#244522', '#3a6c36');
    fillRectW(34.4, -35.5, 47.2, 31.2, '#244522', '#3a6c36');
    fillRectW(-28.4, 37.8, 47.2, 55.3, '#244522', '#3a6c36');
    fillRectW(-28.4, 2.0, -20.2, 25.8, '#244522', '#3a6c36');

    // Taş Çevre Duvarı (3 tek araçlık kapı hariç kesintisiz)
    ctx.strokeStyle = '#9b9182';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(sx(-29), sz(-48));
    ctx.lineTo(sx(-29), sz(26.8));
    ctx.moveTo(sx(-29), sz(31.0));
    ctx.lineTo(sx(-29), sz(56));
    ctx.lineTo(sx(48), sz(56));
    ctx.lineTo(sx(48), sz(36.1));
    ctx.moveTo(sx(48), sz(31.9));
    ctx.lineTo(sx(48), sz(-48));
    ctx.lineTo(sx(-14.4), sz(-48));
    ctx.moveTo(sx(-18.6), sz(-48));
    ctx.lineTo(sx(-29), sz(-48));
    ctx.stroke();

    // Main Factory (+25% expanded)
    fillRectW(4.0, -35.0, 34.0, 27.5, '#232930', '#9ea6ae');
    ctx.strokeStyle = '#d4cab6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx(18.5), sz(-35));
    ctx.lineTo(sx(18.5), sz(-2.6));
    ctx.moveTo(sx(18.5), sz(2.6));
    ctx.lineTo(sx(18.5), sz(27.5));
    ctx.stroke();

    // Longer All-Cement Rampa (no side guardrails)
    fillRectW(-4.8, -3.1, 4.0, 3.1, '#7a7d80', '#d0d4d8');

    // İç Bölümler
    fillRectW(4.3, 12.5, 11.8, 19.8, '#2c3642', '#708499');
    fillRectW(4.3, 19.8, 11.8, 27.15, '#2c3642', '#708499');
    fillRectW(11.8, 12.5, 18.35, 27.15, '#2c3f3b', '#5da699');
    fillRectW(4.7, -33.7, 10.3, -4.0, '#7a5938');
    fillRectW(13.2, -22.0, 15.6, -16.4, '#8f6940');
    fillRectW(13.2, -12.6, 15.6, -7.0, '#8f6940');
    fillRectW(20.6, -30.5, 31.4, -29.1, '#8b7433'); // Horizontal bench
    fillRectW(20.9, -26.9, 29.9, -24.4, '#a68b44'); // Stacked trays
    fillRectW(26.9, -16.2, 30.3, 12.2, '#9c431f', '#ff8c42'); // Kiln
    fillRectW(23.3, 21.7, 28.7, 23.5, '#4e5d6b');
    fillRectW(34.0, 7.0, 39.2, 14.0, '#2d4768', '#83a8d8');
    fillRectW(34.0, 14.0, 39.2, 21.0, '#5a314a', '#c97da8');

    // Front-Aligned Compact 4-Post Garage & Porsche 928S
    fillRectW(4.5, 27.6, 11.2, 31.3, '#2a2f35', '#ffb347');
    fillRectW(5.5, 28.5, 10.1, 30.4, '#08090c', '#ffffff');

    // Honda CR-V + Red Dodge Truck + Wall-Side Tree & Çardak
    fillRectW(-4.1, -19.8, -2.3, -15.2, '#0b0d10', '#d0d7de');
    fillRectW(-24.7, -26.0, -21.7, -16.6, '#a8211b', '#f2b8b5');
    ctx.fillStyle = '#3c7a33';
    ctx.beginPath();
    ctx.arc(sx(-25.4), sz(9.2), 6, 0, Math.PI * 2);
    ctx.fill();
    fillRectW(-27.8, 19.2, -23.0, 24.4, '#6e4e30', '#d8b282');

    ctx.fillStyle = 'rgba(235,230,220,0.88)';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PALET', sx(11.5), sz(-30.0));
    ctx.fillText('YALDIZ', sx(26.0), sz(-31.8));
    ctx.fillText('FIRIN', sx(28.6), sz(-2.0));
    ctx.fillText('OFIS 1', sx(8.0), sz(16.2));
    ctx.fillText('OFIS 2', sx(8.0), sz(23.5));
    ctx.fillText('MUTFAK', sx(15.0), sz(20.0));
    ctx.fillText('GARAJ', sx(7.8), sz(32.5));
    ctx.fillText('CARDAK', sx(-25.4), sz(25.8));
    ctx.fillText('YESIL', sx(10.0), sz(46.5));
    ctx.fillText('DODGE', sx(-23.2), sz(-27.8));
    ctx.fillText('CR-V', sx(-3.2), sz(-21.2));

    const ux = sx(px), uz = sz(pz);
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    ctx.fillStyle = 'rgba(255, 179, 71, 0.28)';
    ctx.beginPath();
    ctx.moveTo(ux, uz);
    const ang = Math.atan2(fz, fx);
    ctx.arc(ux, uz, 20, ang - 0.45, ang + 0.45);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffb347';
    ctx.strokeStyle = '#0b0d0f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ux, uz, 4.2, 0, Math.PI * 2);
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

    await setBoot('Genisletilmis fabrika binasi, firin ve ic bolumler insa ediliyor', 0.44);
    const interior = window.AZ_FACTORY_INTERIOR.buildFactoryBuilding(G, L, interactives);

    await setBoot('Tas duvarlar, genis yesillikler, garaj ve cardak kuruluyor', 0.62);
    const exterior = buildExteriorCampus(G, L, interactives);

    await setBoot('Honda CR-V, Iri Dodge Kamyon ve Porsche 928S hazirlaniyor', 0.78);
    // Honda CR-V with stepped climbable colliders (#14)
    const crv = window.AZ_VEHICLES.buildHondaCRV2005(G, G.mats);
    crv.position.set(-3.2, 0.0, -17.5);
    crv.rotation.y = 0.12;
    L.dynRoot.add(crv);
    L.col(-4.20, 0, -20.0, -2.20, 0.56, -19.50, 'metal');   // rear bumper step
    L.col(-4.18, 0, -19.85, -2.22, 1.06, -15.10, 'metal');  // hood & lower body
    L.col(-4.10, 0, -19.50, -2.30, 1.76, -16.40, 'metal');  // cabin roof

    // Red Dodge Truck with stepped climbable colliders (#14)
    const dodge = window.AZ_VEHICLES.buildDodgeTruck(G, G.mats);
    dodge.position.set(-23.2, 0.0, -21.0);
    dodge.rotation.y = 0.0;
    L.dynRoot.add(dodge);
    L.col(-24.62, 0, -26.25, -21.78, 0.90, -25.90, 'metal');    // rear bumper step
    L.col(-24.65, 0, -26.0, -21.75, 1.38, -21.25, 'metal');     // cargo bed
    L.col(-24.15, 0, -25.6, -22.25, 2.45, -21.9, 'wood');       // cargo pallets in bed (grounded min.y)
    L.col(-24.48, 0, -21.25, -21.92, 3.42, -19.50, 'metal');    // cab roof
    L.col(-24.55, 0, -19.50, -21.85, 2.28, -16.95, 'metal');    // long hood & fenders
    L.col(-24.65, 0, -16.95, -21.75, 0.96, -16.50, 'metal');    // front bumper & steps

    // Black Porsche 928S inside 4-post Garage with stepped climbable colliders (#14)
    const porsche = window.AZ_VEHICLES.buildPorsche928S(G, G.mats);
    porsche.position.set(7.85, 0.04, 29.45);
    porsche.rotation.y = -Math.PI / 2;
    L.dynRoot.add(porsche);
    L.col(5.45, 0.04, 28.42, 6.95, 0.88, 30.38, 'metal');  // front nose/hood
    L.col(6.95, 0.04, 28.55, 8.75, 1.32, 30.25, 'metal');  // coupe roof
    L.col(8.75, 0.04, 28.42, 10.15, 0.96, 30.38, 'metal'); // rear deck & wing

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
      playerStart: { pos: new THREE.Vector3(-11.5, 0.0, 9.5), yaw: -0.96 },
      interiorBoxes: [interior.interiorBox],
      groundSurfaceAt: () => 'concrete',
      update(dt) {
        interior.update(dt);
        for (const fn of L.updaters) fn(dt);
      }
    };

    await setBoot('Toprak zemin, golgeler ve yansimalar yukleniyor', 0.88);
    G.ground = await E.createGround(G);
    if (G.ground && G.ground.apron) {
      G.ground.apron.scale.set(1.6, 1, 1.6);
      G.ground.apron.updateMatrix();
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
    G.player.invulnerable = true;
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
    const dronePos = new THREE.Vector3(-11.5, 4.0, 9.5);
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
        const gx = Math.max(-90, Math.min(90, dronePos.x));
        const gz = Math.max(-85, Math.min(85, dronePos.z));
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

        const speed = G.input.sprint ? 21.0 : 9.5;
        const mx = G.input.move.x;
        const my = G.input.move.y;
        dronePos.addScaledVector(tmpFwd, my * speed * dt);
        dronePos.addScaledVector(tmpRight, mx * speed * dt);
        if (G.input.down('jump')) dronePos.y += speed * 0.75 * dt;
        if (G.input.down('crouch')) dronePos.y -= speed * 0.75 * dt;
        dronePos.y = Math.max(0.35, Math.min(42, dronePos.y));
        dronePos.x = Math.max(-90, Math.min(90, dronePos.x));
        dronePos.z = Math.max(-85, Math.min(85, dronePos.z));

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
