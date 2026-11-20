(() => {
  'use strict';

  const E = window.AZ_ENGINE;
  if (!E) throw new Error('AZ_ENGINE failed to load');
  const THREE = E.THREE;

  const bootEl = document.getElementById('boot');
  const bootMsg = document.getElementById('boot-msg');
  const bootFill = document.getElementById('boot-fill');
  const brandKickerEl = document.getElementById('brand-kicker');
  const zoneEl = document.getElementById('zone-name');
  const coordsEl = document.getElementById('coords-readout');
  const compassEl = document.getElementById('compass-dir');
  const promptEl = document.getElementById('prompt');
  const promptText = document.getElementById('prompt-text');
  const toastEl = document.getElementById('toast');
  const lockHintEl = document.getElementById('lock-hint');
  const modeLabelEl = document.getElementById('mode-label');
  const gameModeLabelEl = document.getElementById('game-mode-label');
  const atmoLabelEl = document.getElementById('atmo-label');
  const btnGameMode = document.getElementById('btn-game-mode');
  const btnMode = document.getElementById('btn-mode');
  const btnAtmo = document.getElementById('btn-atmo');
  const btnFlash = document.getElementById('btn-flash');
  const btnMap = document.getElementById('btn-map');
  const btnHelp = document.getElementById('btn-help');
  const btnHelpClose = document.getElementById('btn-help-close');
  const helpModal = document.getElementById('help-modal');
  const modeModal = document.getElementById('mode-modal');
  const btnStartTour = document.getElementById('btn-start-tour');
  const btnStartCombat = document.getElementById('btn-start-combat');
  const combatHudEl = document.getElementById('combat-hud');
  const combatObjectivesEl = document.getElementById('combat-objectives');
  const combatObjectiveBarEl = document.getElementById('combat-objective-bar');
  const combatObjTagEl = document.getElementById('combat-obj-tag');
  const combatObjTextEl = document.getElementById('combat-obj-text');
  const combatObjDistEl = document.getElementById('combat-obj-dist');
  const combatWaveEl = document.getElementById('combat-wave');
  const combatHostilesEl = document.getElementById('combat-hostiles');
  const combatKillsEl = document.getElementById('combat-kills');
  const combatHpEl = document.getElementById('combat-hp');
  const combatHpFillEl = document.getElementById('combat-hp-fill');
  const combatHealthCardEl = document.querySelector('.combat-health-card');
  const combatWeaponEl = document.getElementById('combat-weapon');
  const combatAmmoEl = document.getElementById('combat-ammo');
  const combatReserveEl = document.getElementById('combat-reserve');
  const combatWeaponStateEl = document.getElementById('combat-weapon-state');
  const waveBannerEl = document.getElementById('wave-banner');
  const damageFlashEl = document.getElementById('damage-flash');
  const hitmarkerEl = document.getElementById('hitmarker');
  const combatOverModal = document.getElementById('combat-over-modal');
  const combatOverCard = document.getElementById('combat-over-card');
  const overKickerEl = document.getElementById('over-kicker');
  const overTitleEl = document.getElementById('over-title');
  const overSubEl = document.getElementById('over-sub');
  const overWaveEl = document.getElementById('over-wave');
  const overKillsEl = document.getElementById('over-kills');
  const overAccEl = document.getElementById('over-acc');
  const overTimeEl = document.getElementById('over-time');
  const btnCombatRetry = document.getElementById('btn-combat-retry');
  const btnCombatToTour = document.getElementById('btn-combat-to-tour');
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
    el.textContent = 'Aizanoi Factory failed to start:\n' + msg;
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
    const shrubMat = new THREE.MeshStandardMaterial({ color: 0x347028, roughness: 0.74 });
    const wildWeedMat = new THREE.MeshStandardMaterial({ color: 0x5d8234, roughness: 0.72 });
    const ledWarm = G.mats.emissive(0xffd796, 4.4);
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xffd56a, metalness: 0.96, roughness: 0.12, envMapIntensity: 2.1 });
    const glassCupMat = new THREE.MeshPhysicalMaterial({ color: 0xe7f6ff, transparent: true, opacity: 0.34, roughness: 0.035, clearcoat: 1, envMapIntensity: 1.8 });

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
        getLabel: () => 'Pour Fresh Tea at Gazebo',
        trigger: () => {
          if (G.fx && G.fx.smoke) {
            for (let s = 0; s < 5; s++) {
              G.fx.smoke([cx, deckH + 1.18, cz], [0, 0.4 + s * 0.08, 0], { size: 0.18, life: 1.5 });
            }
          }
          return 'Poured a fresh glass of hot tea at the gazebo. Enjoy the break!';
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
      name: 'Sunset',
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
      name: 'Midday Sun',
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
      name: 'Rainy',
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
      name: 'Night Shift',
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
    { label: 'Courtyard & Extended Cement Ramp', pos: [-11.5, 0.0, 9.5], yaw: -0.96, pitch: -0.03 },
    { label: 'Honda CR-V (2005 Black)', pos: [-7.8, 0.0, -13.0], yaw: -1.10, pitch: -0.06 },
    { label: 'Red Dodge Truck & North Gate', pos: [-15.8, 0.0, -29.0], yaw: 2.45, pitch: -0.04 },
    { label: 'Wall-Side Tree & Gazebo', pos: [-16.5, 0.0, 21.8], yaw: 1.57, pitch: -0.04 },
    { label: '4-Post Garage & Porsche 928S', pos: [-0.5, 0.0, 33.8], yaw: -1.08, pitch: -0.05 },
    { label: 'Pallet Climb & Packaging Table', pos: [12.0, 0.06, -3.5], yaw: 0.45, pitch: -0.06 },
    { label: 'Office 1 · Office 2 (PC) · Kitchen', pos: [8.2, 0.06, 9.2], yaw: -3.12, pitch: -0.05 },
    { label: 'Glass Gilding (Rear Walkway & Trays)', pos: [26.0, 0.06, -21.5], yaw: 0.0, pitch: -0.08 },
    { label: 'Glass Gilding Kiln', pos: [23.2, 0.06, -8.5], yaw: -2.10, pitch: -0.06 }
  ];

  function getZoneName(x, y, z) {
    if (x >= 34.0 && x <= 39.2 && z >= 7.0 && z <= 14.0) return "Men's WC";
    if (x >= 34.0 && x <= 39.2 && z > 14.0 && z <= 21.0) return "Women's WC";
    if (x >= 4.0 && x <= 34.0 && z >= -35.0 && z <= 27.5) {
      if (x < 18.5) {
        if (z >= 12.5 && z <= 19.8 && x < 11.8) return 'Office 1';
        if (z > 19.8 && z <= 27.15 && x < 11.8) return 'Office 2';
        if (z >= 12.5 && z <= 27.15 && x >= 11.8) return 'Kitchen';
        if (x >= 13.0 && z >= -22.5 && z <= -6.5) return 'Packaging Tables';
        return 'Shipping & Pallet Hall';
      } else {
        if (z <= -30.5) return 'Gilding Bench Rear Walkway';
        if (z <= -23.8) return 'Glass Gilding & Tray Stacks';
        if (x >= 26.0 && z >= -21.5 && z <= 17.5) return 'Glass Gilding Kiln';
        if (z >= 18.5) return 'Initial Packaging Area';
        return 'Production & Kiln Hall';
      }
    }
    if (x >= -4.8 && x <= 4.0 && z >= -3.1 && z <= 3.1) return 'Loading Ramp (Cement)';
    if (x >= 4.5 && x <= 11.2 && z >= 27.6 && z <= 31.3) return '4-Post Garage · Porsche 928S';
    if (x >= -28.0 && x <= -22.8 && z >= 19.0 && z <= 24.6) return 'Gazebo (Wall-Side)';
    if (x >= -28.0 && x <= -22.8 && z >= 6.5 && z <= 12.0) return 'Tree Shade';
    if (x >= -19.6 && x <= -13.4 && z <= 37.2) return 'Dirt Road';
    if (z <= -35.4 || x >= 34.3 || z >= 37.7 || (x <= -20.2 && z >= 2.0 && z <= 25.8)) return 'Lawn & Wild Grass';
    return 'Dirt Courtyard';
  }

  function drawMinimap(px, pz, yaw, enemiesList, missionMarkers) {
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
    ctx.fillText('PALLET', sx(11.5), sz(-30.0));
    ctx.fillText('GILDING', sx(26.0), sz(-31.8));
    ctx.fillText('KILN', sx(28.6), sz(-2.0));
    ctx.fillText('OFFICE 1', sx(8.0), sz(16.2));
    ctx.fillText('OFFICE 2', sx(8.0), sz(23.5));
    ctx.fillText('KITCHEN', sx(15.0), sz(20.0));
    ctx.fillText('GARAGE', sx(7.8), sz(32.5));
    ctx.fillText('GAZEBO', sx(-25.4), sz(25.8));
    ctx.fillText('LAWN', sx(10.0), sz(46.5));
    ctx.fillText('DODGE', sx(-23.2), sz(-27.8));
    ctx.fillText('CR-V', sx(-3.2), sz(-21.2));

    if (missionMarkers && missionMarkers.length) {
      for (const mk of missionMarkers) {
        const mx = sx(mk.x);
        const mz = sz(mk.z);
        ctx.save();
        ctx.translate(mx, mz);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = mk.kind === 'extract' ? '#3ee69a' : '#58c4b8';
        ctx.strokeStyle = '#0b0d0f';
        ctx.lineWidth = 1.5;
        ctx.fillRect(-4.5, -4.5, 9, 9);
        ctx.strokeRect(-4.5, -4.5, 9, 9);
        ctx.restore();
        ctx.fillStyle = '#0b0d0f';
        ctx.font = 'bold 7px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(mk.short, mx, mz + 2.5);
      }
    }

    if (enemiesList && enemiesList.length) {
      for (const en of enemiesList) {
        if (!en || !en.alive || !en.pos) continue;
        const ex = sx(en.pos.x);
        const ez = sz(en.pos.z);
        ctx.fillStyle = en.type === 'cyborg' ? '#e85dff' : en.type === 'gull' ? '#ff9f43' : '#ff4d42';
        ctx.strokeStyle = '#0b0d0f';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(ex, ez, en.type === 'cyborg' ? 3.8 : en.type === 'gull' ? 3.0 : 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

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
  function chooseFactoryQuality(detected, params) {
    const ladder = ['low', 'medium', 'high', 'ultra'];
    const labels = { low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra' };
    const forced = params.q && E.presets[params.q] ? params.q : '';
    let saved = '';
    try { saved = localStorage.getItem('aizanoi.factory.quality') || ''; } catch {}
    let name = forced || (E.presets[saved] ? saved : '');
    if (!name) {
      const idx = Math.max(0, ladder.indexOf(detected && detected.name));
      const automated = typeof navigator !== 'undefined' && navigator.webdriver;
      name = automated ? ((detected && detected.name) || 'high') : ladder[Math.min(ladder.length - 1, idx + 1)];
    }
    const preset = { ...E.presets[name] };
    if (name === 'ultra') {
      preset.shadow = Math.max(preset.shadow || 0, 8192);
      preset.tex = Math.max(preset.tex || 0, 2048);
      preset.volSteps = Math.max(preset.volSteps || 0, 48);
      preset.planar = 1;
      preset.ao = true;
      preset.bloom = true;
      preset.msaa = Math.max(preset.msaa || 0, 4);
      preset.scale = 1;
    }
    preset.name = name;
    preset.label = labels[name] || name;
    return preset;
  }

  function raiseSceneFinish(root, renderer) {
    const maxAniso = Math.min(16, (renderer.capabilities && renderer.capabilities.getMaxAnisotropy && renderer.capabilities.getMaxAnisotropy()) || 8);
    root.traverse((obj) => {
      const list = obj.material ? [].concat(obj.material) : [];
      for (const mat of list) {
        if (!mat || mat.userData.factoryFinish) continue;
        mat.userData.factoryFinish = true;
        if (mat.map && mat.map.anisotropy < maxAniso) mat.map.anisotropy = maxAniso;
        if (mat.isMeshPhysicalMaterial) {
          mat.envMapIntensity = Math.max(mat.envMapIntensity || 1, 1.45);
          if (typeof mat.clearcoat === 'number' && mat.clearcoat > 0) mat.clearcoat = Math.min(1, mat.clearcoat + 0.04);
        } else if ((mat.metalness || 0) >= 0.7) {
          mat.roughness = Math.max(0.07, (mat.roughness || 0.2) * 0.82);
          mat.envMapIntensity = Math.max(mat.envMapIntensity || 1, 1.85);
        }
        if (mat.emissiveIntensity) mat.emissiveIntensity = Math.min(8, mat.emissiveIntensity * 1.12);
      }
    });
  }

  // --------------------------------------------------------------------------
  // Half-Human / Half-Robot Cyborg Trooper Enemy System (Aizanoi Wars Compatible)
  // --------------------------------------------------------------------------
  function createCyborgSystem(G) {
    const root = new THREE.Group();
    root.name = 'factory-cyborgs';
    G.scene.add(root);

    const tracerRoot = new THREE.Group();
    tracerRoot.name = 'factory-cyborg-tracers';
    G.scene.add(tracerRoot);

    // Procedural hex-weave ballistic fabric texture for tactical suit
    function makeHexSuitTexture() {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 128;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#181e26';
      ctx.fillRect(0, 0, 128, 128);
      ctx.strokeStyle = '#28323e';
      ctx.lineWidth = 1.5;
      for (let y = 0; y < 128; y += 12) {
        for (let x = 0; x < 128; x += 14) {
          const ox = (Math.floor(y / 12) % 2) * 7;
          ctx.strokeRect(x + ox, y, 10, 8);
        }
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(3, 3);
      return tex;
    }

    const suitTex = makeHexSuitTexture();
    const suitMat = new THREE.MeshStandardMaterial({ map: suitTex, color: 0x262f3b, roughness: 0.68, metalness: 0.28 });
    const darkRubberMat = new THREE.MeshStandardMaterial({ color: 0x101318, roughness: 0.82, metalness: 0.12 });
    const armorMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.30, metalness: 0.82 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xb6c2ce, roughness: 0.16, metalness: 0.96 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xc99676, roughness: 0.64, metalness: 0.04 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x1a1715, roughness: 0.88, metalness: 0.05 });
    const cyberMetalMat = new THREE.MeshStandardMaterial({ color: 0x7b8794, roughness: 0.22, metalness: 0.92 });
    const rifleMat = new THREE.MeshStandardMaterial({ color: 0x15191f, roughness: 0.38, metalness: 0.72 });
    const coreMat = new THREE.MeshStandardMaterial({ color: 0xffa63d, emissive: 0xff7718, emissiveIntensity: 3.2, roughness: 0.2 });
    const tealLedMat = new THREE.MeshStandardMaterial({ color: 0x58c4b8, emissive: 0x32e0cc, emissiveIntensity: 2.6, roughness: 0.2 });
    const visorBaseMat = new THREE.MeshStandardMaterial({ color: 0xff263c, emissive: 0xff162e, emissiveIntensity: 4.2, roughness: 0.1 });
    const glassVisorMat = new THREE.MeshPhysicalMaterial({ color: 0x16090c, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.72, clearcoat: 1.0 });
    const laserMat = new THREE.MeshBasicMaterial({ color: 0xff2a38, transparent: true, opacity: 0.36, depthWrite: false });
    const tracerMat = new THREE.MeshBasicMaterial({ color: 0xff5a45, transparent: true, opacity: 0.94 });

    const list = [];
    const tracers = [];
    const tmpA = new THREE.Vector3();
    const tmpB = new THREE.Vector3();
    const tmpDir = new THREE.Vector3();
    const tmpSide = new THREE.Vector3();
    const upVec = new THREE.Vector3(0, 1, 0);

    function raySphere(origin, dir, center, radius, maxDist) {
      const ox = origin.x - center.x;
      const oy = origin.y - center.y;
      const oz = origin.z - center.z;
      const b = ox * dir.x + oy * dir.y + oz * dir.z;
      const c = ox * ox + oy * oy + oz * oz - radius * radius;
      const disc = b * b - c;
      if (disc < 0) return null;
      const t = -b - Math.sqrt(disc);
      if (t < 0 || t > maxDist) return null;
      const pt = new THREE.Vector3(
        origin.x + dir.x * t,
        origin.y + dir.y * t,
        origin.z + dir.z * t
      );
      const norm = pt.clone().sub(center).normalize();
      return { dist: t, point: pt, normal: norm };
    }

    function spawnTracer(fromPos, toPos) {
      const dist = fromPos.distanceTo(toPos);
      if (dist < 0.2) return;
      const geo = new THREE.CylinderGeometry(0.022, 0.022, Math.min(dist, 42), 5);
      geo.rotateX(Math.PI / 2);
      const mesh = new THREE.Mesh(geo, tracerMat);
      mesh.position.copy(fromPos).lerp(toPos, 0.5);
      mesh.lookAt(toPos);
      tracerRoot.add(mesh);
      tracers.push({ mesh, geo, life: 0.11 });
    }

    function buildCyborgMesh() {
      const grp = new THREE.Group();
      const visorMat = visorBaseMat.clone();

      // --- LEFT LEG (Armored Human Tactical Leg with Knee Pivot & Boot) ---
      const leftLeg = new THREE.Group();
      leftLeg.position.set(-0.15, 0.92, 0);
      const lHip = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), darkRubberMat);
      const lThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.082, 0.42, 10), suitMat);
      lThigh.position.y = -0.22;
      const lThighPlate = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.24, 0.16), armorMat);
      lThighPlate.position.set(-0.02, -0.20, 0.03);
      const leftKnee = new THREE.Group();
      leftKnee.position.y = -0.44;
      const lKneePad = new THREE.Mesh(new THREE.SphereGeometry(0.088, 10, 8), armorMat);
      lKneePad.position.z = 0.03;
      const lShin = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.068, 0.38, 10), armorMat);
      lShin.position.y = -0.20;
      const lBoot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.25), darkRubberMat);
      lBoot.position.set(0, -0.42, 0.05);
      leftKnee.add(lKneePad, lShin, lBoot);
      leftLeg.add(lHip, lThigh, lThighPlate, leftKnee);

      // --- RIGHT LEG (Exposed Skeletal Robotic Cyber-Leg with Hydraulic Piston) ---
      const rightLeg = new THREE.Group();
      rightLeg.position.set(0.15, 0.92, 0);
      const rHip = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.12, 10), chromeMat);
      rHip.rotation.z = Math.PI / 2;
      const rThighCore = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.048, 0.42, 10), cyberMetalMat);
      rThighCore.position.y = -0.22;
      const rPiston = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.36, 8), chromeMat);
      rPiston.position.set(0.055, -0.22, -0.04);
      const rThighGuard = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.26, 0.11), armorMat);
      rThighGuard.position.set(0.01, -0.19, 0.055);
      const rightKnee = new THREE.Group();
      rightKnee.position.y = -0.44;
      const rKneeDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.14, 12), darkRubberMat);
      rKneeDrum.rotation.z = Math.PI / 2;
      const rKneeGlow = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.014, 6, 14), coreMat);
      rKneeGlow.rotation.y = Math.PI / 2;
      rKneeGlow.position.x = 0.072;
      const rShinStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.056, 0.38, 10), cyberMetalMat);
      rShinStrut.position.y = -0.20;
      const rShinPiston = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.32, 8), chromeMat);
      rShinPiston.position.set(0, -0.20, -0.055);
      const rFoot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.26), cyberMetalMat);
      rFoot.position.set(0, -0.42, 0.05);
      rightKnee.add(rKneeDrum, rKneeGlow, rShinStrut, rShinPiston, rFoot);
      rightLeg.add(rHip, rThighCore, rPiston, rThighGuard, rightKnee);

      // --- SCULPTED TORSO, BALLISTIC ARMOR & SPINE POWER-PACK ---
      const body = new THREE.Group();
      body.position.y = 0.92;

      const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.17, 0.18, 10), darkRubberMat);
      pelvis.position.y = 0.06;
      const belt = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.08, 0.27), armorMat);
      belt.position.y = 0.15;
      for (const px of [-0.15, 0.15]) {
        const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.07), suitMat);
        pouch.position.set(px, 0.14, 0.15);
        body.add(pouch);
      }

      const abdomen = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.24, 10), suitMat);
      abdomen.position.y = 0.27;
      // Cybernetic rib cabling on right abdomen
      for (let r = 0; r < 3; r++) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.014, 6, 14, Math.PI * 0.75), chromeMat);
        rib.rotation.x = Math.PI / 2;
        rib.rotation.z = -0.4;
        rib.position.y = 0.22 + r * 0.055;
        body.add(rib);
      }

      const chestCore = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.26), suitMat);
      chestCore.position.y = 0.50;
      // Angled multi-plate ballistic breastplate
      const chestUpper = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.22, 0.30), armorMat);
      chestUpper.position.set(0, 0.55, 0.02);
      chestUpper.rotation.x = -0.10;
      const chestLower = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.28), cyberMetalMat);
      chestLower.position.set(0, 0.39, 0.015);
      // Recessed glowing reactor core in sternum
      const reactorBezel = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.078, 0.05, 12), darkRubberMat);
      reactorBezel.rotation.x = Math.PI / 2;
      reactorBezel.position.set(0, 0.53, 0.165);
      const reactorCore = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.056, 12), coreMat);
      reactorCore.rotation.x = Math.PI / 2;
      reactorCore.position.set(0, 0.53, 0.168);

      // Rear Cybernetic Spine Power-Pack with twin glowing cells
      const backPack = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.36, 0.16), armorMat);
      backPack.position.set(0, 0.49, -0.19);
      for (const bx of [-0.08, 0.08]) {
        const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.24, 10), tealLedMat);
        cell.position.set(bx, 0.50, -0.26);
        body.add(cell);
      }
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.036, 8, 14), armorMat);
      collar.rotation.x = Math.PI / 2;
      collar.position.set(0, 0.68, 0);

      // Asymmetric Pauldrons (Tactical Left + Heavy Cyber-Right with Antenna)
      const shoulderL = new THREE.Mesh(new THREE.SphereGeometry(0.135, 10, 8), armorMat);
      shoulderL.scale.set(1.0, 0.85, 1.15);
      shoulderL.position.set(-0.29, 0.60, 0);
      const shoulderR = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.19, 0.24), cyberMetalMat);
      shoulderR.position.set(0.30, 0.61, 0);
      shoulderR.rotation.z = -0.18;
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.34, 6), chromeMat);
      antenna.position.set(0.34, 0.84, -0.06);
      const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), visorMat);
      antennaTip.position.set(0.34, 1.02, -0.06);

      // --- HALF-HUMAN / HALF-TERMINATOR HEAD (WEAKSPOT) ---
      const head = new THREE.Group();
      head.position.set(0, 0.82, 0.01);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.078, 0.14, 10), darkRubberMat);
      neck.position.y = -0.10;
      const neckCable = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.15, 6), chromeMat);
      neckCable.position.set(0.06, -0.09, 0.02);
      // Organic human skull & jawline
      const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.125, 14, 12), skinMat);
      cranium.scale.set(0.92, 1.08, 1.0);
      const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.128, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.48), hairMat);
      hairCap.position.set(-0.01, 0.015, -0.01);
      // Right-side chrome-titanium cybernetic skull plate + mechanical jaw
      const cyberSkull = new THREE.Mesh(new THREE.SphereGeometry(0.132, 12, 10, -Math.PI * 0.25, Math.PI * 0.95), cyberMetalMat);
      cyberSkull.scale.set(0.96, 1.08, 1.02);
      const cyberJaw = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.16), chromeMat);
      cyberJaw.position.set(0.055, -0.065, 0.035);
      // Glowing crimson bionic eye + translucent wrap-around tactical visor
      const bionicEye = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), visorMat);
      bionicEye.position.set(0.048, 0.022, 0.112);
      const visorBand = new THREE.Mesh(new THREE.CylinderGeometry(0.134, 0.134, 0.062, 14, 1, true, -Math.PI * 0.38, Math.PI * 0.76), glassVisorMat);
      visorBand.position.set(0, 0.028, 0.008);
      const visorGlow = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.018, 0.02), visorMat);
      visorGlow.position.set(0.01, 0.026, 0.134);
      head.add(neck, neckCable, cranium, hairCap, cyberSkull, cyberJaw, bionicEye, visorBand, visorGlow);

      // --- ARMS & HIGH-DETAIL CYBER PULSE RIFLE ---
      const leftArm = new THREE.Group();
      leftArm.position.set(-0.29, 0.56, 0.02);
      const lUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.056, 0.30, 10), suitMat);
      lUpper.position.set(0.02, -0.14, 0.08);
      lUpper.rotation.x = -0.45;
      const lForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.048, 0.30, 10), armorMat);
      lForearm.position.set(0.16, -0.22, 0.26);
      lForearm.rotation.set(Math.PI / 2 - 0.15, 0, -0.58);
      leftArm.add(lUpper, lForearm);

      const rightArmGrp = new THREE.Group();
      rightArmGrp.position.set(0.28, 0.54, 0.04);
      const rUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.046, 0.28, 10), cyberMetalMat);
      rUpper.position.set(0, -0.12, 0.06);
      rUpper.rotation.x = -0.35;
      const rElbow = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), chromeMat);
      rElbow.position.set(0, -0.23, 0.13);
      const rForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.044, 0.28, 10), chromeMat);
      rForearm.rotation.x = Math.PI / 2;
      rForearm.position.set(-0.04, -0.21, 0.26);

      // Multi-part Tactical Pulse Rifle
      const rifleGrp = new THREE.Group();
      rifleGrp.position.set(-0.08, -0.19, 0.34);
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.12, 0.56), rifleMat);
      const barrelShroud = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.36, 10), armorMat);
      barrelShroud.rotation.x = Math.PI / 2;
      barrelShroud.position.set(0, 0.015, 0.42);
      const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.08, 8), chromeMat);
      muzzleBrake.rotation.x = Math.PI / 2;
      muzzleBrake.position.set(0, 0.015, 0.62);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.18, 0.09), darkRubberMat);
      mag.position.set(0, -0.13, 0.06);
      mag.rotation.x = 0.22;
      const optic = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.055, 0.16), armorMat);
      optic.position.set(0, 0.085, -0.02);
      const plasmaRail = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.022, 0.44), coreMat);
      plasmaRail.position.set(0, 0.052, 0.24);
      const muzzleFlash = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), coreMat);
      muzzleFlash.position.set(0, 0.015, 0.68);
      muzzleFlash.visible = false;
      const laserBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 16, 4), laserMat);
      laserBeam.rotation.x = Math.PI / 2;
      laserBeam.position.set(0, -0.01, 8.6);
      laserBeam.visible = false;
      rifleGrp.add(receiver, barrelShroud, muzzleBrake, mag, optic, plasmaRail, muzzleFlash, laserBeam);
      rightArmGrp.add(rUpper, rElbow, rForearm, rifleGrp);

      body.add(pelvis, belt, abdomen, chestCore, chestUpper, chestLower, reactorBezel, reactorCore, backPack, collar, shoulderL, shoulderR, antenna, antennaTip, head, leftArm, rightArmGrp);
      grp.add(leftLeg, rightLeg, body);

      grp.traverse((o) => {
        if (o.isMesh && o !== laserBeam) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });

      return { grp, leftLeg, rightLeg, leftKnee, rightKnee, body, head, rightArmGrp, rifleGrp, muzzleFlash, laserBeam, visorMat };
    }

    function spawn(pos) {
      const parts = buildCyborgMesh();
      const gy = G.physics && G.physics.groundHeight ? G.physics.groundHeight(pos.x, pos.z, Math.max(2.0, pos.y + 1.5)) : pos.y;
      const p = new THREE.Vector3(pos.x, Math.max(0, gy), pos.z);
      parts.grp.position.copy(p);
      root.add(parts.grp);

      const en = {
        type: 'cyborg',
        pos: p,
        hp: 105,
        maxHp: 105,
        alive: true,
        yaw: 0,
        strafeDir: Math.random() < 0.5 ? -1 : 1,
        strafeTimer: 1.5 + Math.random() * 2.0,
        fireCd: 0.9 + Math.random() * 1.2,
        burstLeft: 0,
        burstGap: 0,
        flashT: 0,
        hurtT: 0,
        walkPhase: Math.random() * Math.PI * 2,
        deadT: 0,
        fallDir: Math.random() < 0.5 ? 1 : -1,
        parts,
        damage(amount, hitPoint, hitDir, part) {
          if (!en.alive) return false;
          en.hp -= amount;
          en.hurtT = 0.14;
          if (G.fx && G.fx.sparks && hitPoint) {
            G.fx.sparks(hitPoint, hitDir ? hitDir.clone().negate() : upVec, part === 'weak' ? 12 : 6);
          }
          if (en.hp <= 0) {
            en.alive = false;
            en.deadT = 0;
            parts.muzzleFlash.visible = false;
            parts.laserBeam.visible = false;
            parts.visorMat.emissiveIntensity = 0.1;
            if (G.fx && G.fx.smoke) {
              G.fx.smoke(tmpA.set(en.pos.x, en.pos.y + 1.1, en.pos.z), { size: 0.75, life: 1.6, color: 0x22262b, rise: 1.2 });
            }
            if (G.fx && G.fx.sparks) {
              G.fx.sparks(tmpA.set(en.pos.x, en.pos.y + 1.2, en.pos.z), upVec, 16);
            }
            G.audio && G.audio.play && G.audio.play('impact_metal', { pos: [en.pos.x, en.pos.y + 1.2, en.pos.z], gain: 0.65 });
            G.events.emit('enemy:killed', { enemy: en, type: 'cyborg', part });
            return true;
          }
          return false;
        }
      };
      list.push(en);
      return en;
    }

    function clear() {
      for (const en of list) {
        root.remove(en.parts.grp);
      }
      list.length = 0;
      for (const tr of tracers) {
        tracerRoot.remove(tr.mesh);
        tr.geo.dispose();
      }
      tracers.length = 0;
    }

    function aliveCount() {
      let c = 0;
      for (const en of list) if (en.alive) c++;
      return c;
    }

    function raycast(origin, dir, maxDist) {
      let best = null;
      let bestDist = maxDist;
      for (const en of list) {
        if (!en.alive) continue;
        // Head weakspot sphere (2.2x headshot damage!)
        tmpA.set(en.pos.x, en.pos.y + 1.64, en.pos.z);
        const headHit = raySphere(origin, dir, tmpA, 0.26, bestDist);
        if (headHit) {
          bestDist = headHit.dist;
          best = { enemy: en, part: 'weak', dist: headHit.dist, point: headHit.point, normal: headHit.normal };
        }
        // Upper torso sphere
        tmpA.set(en.pos.x, en.pos.y + 1.18, en.pos.z);
        const chestHit = raySphere(origin, dir, tmpA, 0.38, bestDist);
        if (chestHit) {
          bestDist = chestHit.dist;
          best = { enemy: en, part: 'body', dist: chestHit.dist, point: chestHit.point, normal: chestHit.normal };
        }
        // Lower torso / legs sphere
        tmpA.set(en.pos.x, en.pos.y + 0.56, en.pos.z);
        const legHit = raySphere(origin, dir, tmpA, 0.34, bestDist);
        if (legHit) {
          bestDist = legHit.dist;
          best = { enemy: en, part: 'body', dist: legHit.dist, point: legHit.point, normal: legHit.normal };
        }
      }
      return best;
    }

    function update(dt) {
      // Fade tracers
      for (let i = tracers.length - 1; i >= 0; i--) {
        tracers[i].life -= dt;
        if (tracers[i].life <= 0) {
          tracerRoot.remove(tracers[i].mesh);
          tracers[i].geo.dispose();
          tracers.splice(i, 1);
        }
      }

      const player = G.player;
      const pPos = player ? player.pos : null;

      for (let i = list.length - 1; i >= 0; i--) {
        const en = list[i];
        if (!en.alive) {
          en.deadT += dt;
          const fall = Math.min(1, en.deadT * 3.4);
          en.parts.grp.rotation.x = fall * (Math.PI / 2) * en.fallDir;
          en.parts.grp.position.y = Math.max(0, en.pos.y + (1 - fall) * 0.08);
          if (en.deadT > 14) {
            root.remove(en.parts.grp);
            list.splice(i, 1);
          }
          continue;
        }

        if (en.flashT > 0) {
          en.flashT -= dt;
          if (en.flashT <= 0) en.parts.muzzleFlash.visible = false;
        }
        if (en.hurtT > 0) {
          en.hurtT -= dt;
          en.parts.visorMat.emissiveIntensity = en.hurtT > 0 ? 7.5 : 3.4;
        }

        if (!pPos || !player.alive) continue;

        const dx = pPos.x - en.pos.x;
        const dz = pPos.z - en.pos.z;
        const dist = Math.hypot(dx, dz) || 0.001;
        const targetYaw = Math.atan2(dx, dz);
        let diff = targetYaw - en.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        en.yaw += diff * Math.min(1, dt * 6.5);
        en.parts.grp.rotation.y = en.yaw;

        // Tactical movement: advance toward player or strafe at medium range
        en.strafeTimer -= dt;
        if (en.strafeTimer <= 0) {
          en.strafeDir = -en.strafeDir;
          en.strafeTimer = 1.6 + Math.random() * 2.2;
        }

        const speed = dist > 16 ? 4.2 : dist > 8.5 ? 2.8 : 1.7;
        tmpDir.set(dx / dist, 0, dz / dist);
        tmpSide.set(-tmpDir.z * en.strafeDir, 0, tmpDir.x * en.strafeDir);

        let moveX = 0;
        let moveZ = 0;
        if (dist > 11) {
          moveX = tmpDir.x * 0.82 + tmpSide.x * 0.35;
          moveZ = tmpDir.z * 0.82 + tmpSide.z * 0.35;
        } else if (dist < 5.5) {
          moveX = -tmpDir.x * 0.45 + tmpSide.x * 0.78;
          moveZ = -tmpDir.z * 0.45 + tmpSide.z * 0.78;
        } else {
          moveX = tmpSide.x * 0.85 + tmpDir.x * 0.2;
          moveZ = tmpSide.z * 0.85 + tmpDir.z * 0.2;
        }

        // Separation from other cyborgs
        for (const other of list) {
          if (other === en || !other.alive) continue;
          const sx = en.pos.x - other.pos.x;
          const sz = en.pos.z - other.pos.z;
          const sd = Math.hypot(sx, sz);
          if (sd > 0.01 && sd < 2.2) {
            moveX += (sx / sd) * (2.2 - sd) * 0.8;
            moveZ += (sz / sd) * (2.2 - sd) * 0.8;
          }
        }

        const mLen = Math.hypot(moveX, moveZ);
        let moved = false;
        if (mLen > 0.05) {
          const nx = moveX / mLen;
          const nz = moveZ / mLen;
          const step = speed * dt;
          tmpA.set(en.pos.x, en.pos.y + 0.9, en.pos.z);
          tmpB.set(nx, 0, nz);
          const blocked = G.physics && G.physics.raycast ? G.physics.raycast(tmpA, tmpB, step + 0.75) : null;
          if (!blocked) {
            const nextX = Math.max(-28.0, Math.min(46.5, en.pos.x + nx * step));
            const nextZ = Math.max(-46.5, Math.min(54.0, en.pos.z + nz * step));
            const nextY = G.physics && G.physics.groundHeight ? G.physics.groundHeight(nextX, nextZ, en.pos.y + 1.2) : en.pos.y;
            if (Math.abs(nextY - en.pos.y) < 1.2) {
              en.pos.set(nextX, Math.max(0, nextY), nextZ);
              en.parts.grp.position.copy(en.pos);
              moved = true;
            }
          } else {
            en.strafeDir = -en.strafeDir;
          }
        }

        // Articulated stride, knee bend & torso bob animation
        if (moved) {
          en.walkPhase += dt * speed * 2.5;
          const swing = Math.sin(en.walkPhase) * 0.56;
          en.parts.leftLeg.rotation.x = swing;
          en.parts.rightLeg.rotation.x = -swing;
          en.parts.leftKnee.rotation.x = Math.max(0, -swing) * 0.85;
          en.parts.rightKnee.rotation.x = Math.max(0, swing) * 0.85;
          en.parts.body.position.y = 0.92 + Math.abs(Math.cos(en.walkPhase)) * 0.045;
          en.parts.body.rotation.x = 0.08;
        } else {
          en.parts.leftLeg.rotation.x *= 0.85;
          en.parts.rightLeg.rotation.x *= 0.85;
          en.parts.leftKnee.rotation.x *= 0.85;
          en.parts.rightKnee.rotation.x *= 0.85;
          en.parts.body.position.y = 0.92 + Math.sin(G.time.t * 2.2 + en.walkPhase) * 0.012;
          en.parts.body.rotation.x *= 0.85;
        }
        en.parts.rifleGrp.position.z += (0.34 - en.parts.rifleGrp.position.z) * Math.min(1, dt * 14);

        // Line-of-sight pulse rifle bursts & tactical laser sight
        let hasSight = false;
        if (dist < 48) {
          tmpA.set(en.pos.x, en.pos.y + 1.48, en.pos.z);
          hasSight = G.physics && G.physics.lineOfSight ? G.physics.lineOfSight(tmpA, player.eye) : true;
        }
        en.parts.laserBeam.visible = hasSight && dist < 34;
        if (hasSight) {
          if (en.burstLeft > 0) {
            en.burstGap -= dt;
            if (en.burstGap <= 0) {
              en.burstLeft--;
              en.burstGap = 0.16;
              const muzzle = tmpA.clone().addScaledVector(tmpDir, 0.78);
              const aim = player.eye.clone();
              aim.y -= 0.18;
              aim.x += (Math.random() - 0.5) * (0.45 + dist * 0.025);
              aim.y += (Math.random() - 0.5) * (0.35 + dist * 0.018);
              aim.z += (Math.random() - 0.5) * (0.45 + dist * 0.025);
              const shotDir = aim.clone().sub(muzzle).normalize();
              en.parts.muzzleFlash.visible = true;
              en.parts.rifleGrp.position.z = 0.25;
              en.flashT = 0.06;
              spawnTracer(muzzle, aim);
              G.combat && G.combat.enemyShot && G.combat.enemyShot(muzzle, shotDir, { damage: 7, range: 110 });
              G.audio && G.audio.play && G.audio.play('impact_metal', { pos: [muzzle.x, muzzle.y, muzzle.z], gain: 0.22 });
            }
          } else {
            en.fireCd -= dt;
            if (en.fireCd <= 0) {
              en.burstLeft = 3;
              en.burstGap = 0;
              en.fireCd = 1.65 + Math.random() * 1.1;
            }
          }
        }
      }
    }

    return { list, spawn, clear, aliveCount, raycast, update };
  }

  async function boot() {
    const params = Object.fromEntries(new URLSearchParams(location.search));
    const quality = chooseFactoryQuality(E.detectQuality(params.q || ''), params);

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

    await setBoot('Initializing Ultra HD engine', 0.10);
    G.render = await E.createRender(G);
    G.renderer = G.render.renderer;
    G.scene = G.render.scene;
    G.camera = G.render.camera;
    G.viewCamera = G.render.viewCamera;

    await setBoot('Mixing procedural PBR textures', 0.25);
    G.mats = await E.createMaterials(G);
    G.physics = E.createPhysics(G);
    G.props = E.createProps(G);
    G.input = E.createInput(G);

    const L = E.createLevelHelper(G);
    const interactives = [];

    await setBoot('Constructing factory hall, kiln, and interior rooms', 0.44);
    const interior = window.AZ_FACTORY_INTERIOR.buildFactoryBuilding(G, L, interactives);

    await setBoot('Building perimeter stone walls, lawns, garage, and gazebo', 0.62);
    const exterior = buildExteriorCampus(G, L, interactives);

    await setBoot('Preparing Honda CR-V, Dodge Truck, and Porsche 928S', 0.74);
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
    raiseSceneFinish(levelRoot, G.renderer);

    const enemySpawns = [
      // Ground Hound spawns (courtyard roads, gates, factory halls)
      { type: 'ground', pos: new THREE.Vector3(-16.5, 0.0, -34.0) },
      { type: 'ground', pos: new THREE.Vector3(-16.5, 0.0, -12.0) },
      { type: 'ground', pos: new THREE.Vector3(-16.5, 0.0, 26.0) },
      { type: 'ground', pos: new THREE.Vector3(16.0, 0.0, 34.0) },
      { type: 'ground', pos: new THREE.Vector3(36.0, 0.0, 34.0) },
      { type: 'ground', pos: new THREE.Vector3(12.5, 0.06, -18.0) },
      { type: 'ground', pos: new THREE.Vector3(12.5, 0.06, 2.0) },
      { type: 'ground', pos: new THREE.Vector3(22.5, 0.06, -14.0) },
      { type: 'ground', pos: new THREE.Vector3(22.5, 0.06, 8.0) },
      { type: 'ground', pos: new THREE.Vector3(24.0, 0.06, 22.0) },
      // Air Gull drone spawns (courtyard skies & high-bay interior)
      { type: 'air', pos: new THREE.Vector3(-18.0, 7.5, -24.0) },
      { type: 'air', pos: new THREE.Vector3(-8.0, 8.5, -28.0) },
      { type: 'air', pos: new THREE.Vector3(-18.0, 7.0, 18.0) },
      { type: 'air', pos: new THREE.Vector3(12.0, 9.0, 34.0) },
      { type: 'air', pos: new THREE.Vector3(34.0, 8.0, 32.0) },
      { type: 'air', pos: new THREE.Vector3(11.5, 5.2, -14.0) },
      { type: 'air', pos: new THREE.Vector3(23.5, 5.2, -6.0) },
      { type: 'air', pos: new THREE.Vector3(23.5, 5.2, 12.0) }
    ];

    G.level = {
      playerStart: { pos: new THREE.Vector3(-11.5, 0.0, 9.5), yaw: -0.96 },
      interiorBoxes: [interior.interiorBox],
      enemySpawns,
      groundSurfaceAt: () => 'concrete',
      update(dt) {
        interior.update(dt);
        for (const fn of L.updaters) fn(dt);
      }
    };

    await setBoot('Loading terrain, shadows, and reflections', 0.82);
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

    // Aizanoi Wars Combat Modules (Weapon, Combat Hitscan, Gull & Hound + Cyborg Trooper Enemies)
    await setBoot('Arming PAC-9 rifle, Cyborg Troopers, and combat units', 0.90);
    G.combat = E.createCombat ? E.createCombat(G) : { stats: { shots: 0, hits: 0, kills: 0 }, reset() {} };
    try {
      G.weapon = E.createWeapon ? await E.createWeapon(G) : null;
    } catch (e) {
      console.warn('[factory] createWeapon:', e);
      G.weapon = null;
    }
    if (G.weapon && G.weapon.setVisible) G.weapon.setVisible(false);

    let baseEnemies = null;
    try {
      baseEnemies = E.createEnemies ? await E.createEnemies(G) : null;
    } catch (e) {
      console.warn('[factory] createEnemies:', e);
      baseEnemies = null;
    }
    const cyborgs = createCyborgSystem(G);

    // Unified enemy manager combining Aizanoi Wars Gulls/Hounds + Cyborg Troopers
    G.enemies = {
      get list() {
        const baseList = (baseEnemies && baseEnemies.list) || [];
        return baseList.concat(cyborgs.list);
      },
      spawn(type, pos, opts) {
        if (type === 'cyborg') return cyborgs.spawn(pos);
        return baseEnemies && baseEnemies.spawn ? baseEnemies.spawn(type, pos, opts) : null;
      },
      clear() {
        baseEnemies && baseEnemies.clear && baseEnemies.clear();
        cyborgs.clear();
      },
      alert(pos, radius) {
        baseEnemies && baseEnemies.alert && baseEnemies.alert(pos, radius);
      },
      aliveCount() {
        const b = baseEnemies && baseEnemies.aliveCount ? baseEnemies.aliveCount() : ((baseEnemies && baseEnemies.list) || []).filter((en) => en && en.alive).length;
        return b + cyborgs.aliveCount();
      },
      raycast(origin, dir, maxDist) {
        const bHit = baseEnemies && baseEnemies.raycast ? baseEnemies.raycast(origin, dir, maxDist) : null;
        const limit = bHit ? bHit.dist : maxDist;
        const cHit = cyborgs.raycast(origin, dir, limit);
        if (cHit && (!bHit || cHit.dist < bHit.dist)) return cHit;
        return bHit;
      },
      update(dt) {
        baseEnemies && baseEnemies.update && baseEnemies.update(dt);
        cyborgs.update(dt);
      }
    };

    // Mission Objectives: 3 Factory Security Terminals (A, B, C) + Garage Extraction Zone (EX)
    const missionGroup = new THREE.Group();
    missionGroup.name = 'factory-mission-objectives';
    missionGroup.visible = false;
    G.scene.add(missionGroup);

    const termBodyMat = new THREE.MeshStandardMaterial({ color: 0x1b252e, roughness: 0.45, metalness: 0.6 });
    const termLiveMat = new THREE.MeshStandardMaterial({ color: 0x58c4b8, emissive: 0x32d6c4, emissiveIntensity: 2.6, roughness: 0.2 });
    const termDoneMat = new THREE.MeshStandardMaterial({ color: 0x2f3b38, emissive: 0x11241f, emissiveIntensity: 0.3, roughness: 0.6 });
    const termBeamMat = new THREE.MeshBasicMaterial({ color: 0x58c4b8, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
    const extractRingMat = new THREE.MeshBasicMaterial({ color: 0x3ee69a, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const extractBeamMat = new THREE.MeshBasicMaterial({ color: 0x3ee69a, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide });

    const terminalSpecs = [
      { id: 'term_a', short: 'A', name: 'Terminal A · Shipping Hall', pos: [11.0, 0.06, -11.5] },
      { id: 'term_b', short: 'B', name: 'Terminal B · Office 2 Command', pos: [9.2, 0.06, 23.8] },
      { id: 'term_c', short: 'C', name: 'Terminal C · Kiln Control', pos: [23.2, 0.06, -13.0] }
    ];

    const missionTerminals = terminalSpecs.map((spec) => {
      const grp = new THREE.Group();
      grp.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.32, 0.48), termBodyMat);
      base.position.y = 0.66;
      base.castShadow = true;
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.42, 0.52), termLiveMat);
      screen.position.y = 1.06;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.42, 6.2, 12, 1, true), termBeamMat);
      beam.position.y = 3.1;
      grp.add(base, screen, beam);
      missionGroup.add(grp);

      const term = { ...spec, grp, screen, beam, done: false };
      interactives.push({
        id: spec.id,
        combatOnly: true,
        pos: new THREE.Vector3(spec.pos[0], spec.pos[1] + 1.1, spec.pos[2]),
        range: 3.4,
        getLabel: () => term.done ? `${spec.name} (Overridden)` : `Override ${spec.name} [E]`,
        trigger: () => {
          if (term.done) return `${spec.name} already overridden`;
          term.done = true;
          term.screen.material = termDoneMat;
          term.beam.visible = false;
          combatState.terminalsDone++;
          G.audio && G.audio.play && G.audio.play('impact_metal', { pos: spec.pos, gain: 0.6 });
          if (G.player && G.player.addShake) G.player.addShake(0.14);
          if (G.weapon && G.weapon.addAmmo) G.weapon.addAmmo(60);
          if (G.player && G.player.heal) G.player.heal(25);
          if (combatState.terminalsDone >= missionTerminals.length) {
            combatState.extractReady = true;
            extractGroup.visible = true;
            queueSquad(combatState.wave + 1, { cyborg: 5, hound: 3, gull: 3, banner: 'ALL TERMINALS OVERRIDDEN · EXTRACT AT GARAGE (PORSCHE 928S)!' });
            return 'All 3 Terminals Overridden! Fight to the 4-Post Garage Extraction Point!';
          }
          queueSquad(combatState.wave + 1, {
            cyborg: 4 + combatState.terminalsDone,
            hound: 3,
            gull: 3,
            banner: `TERMINAL ${spec.short} OVERRIDDEN (${combatState.terminalsDone}/3) · CYBORG SQUAD INBOUND!`
          });
          return `${spec.name} overridden (+60 Ammo, +25 HP) — Reinforcements inbound!`;
        }
      });
      return term;
    });

    const extractPos = new THREE.Vector3(7.85, 0.04, 33.4);
    const extractGroup = new THREE.Group();
    extractGroup.position.copy(extractPos);
    extractGroup.visible = false;
    const extractRing = new THREE.Mesh(new THREE.RingGeometry(1.4, 2.2, 28), extractRingMat);
    extractRing.rotation.x = -Math.PI / 2;
    extractRing.position.y = 0.08;
    const extractBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.8, 18.0, 16, 1, true), extractBeamMat);
    extractBeam.position.y = 9.0;
    extractGroup.add(extractRing, extractBeam);
    missionGroup.add(extractGroup);

    // Tactical Ammo & Medkit Resupply Crates (visible & active only in Battle Mode)
    const resupplyGroup = new THREE.Group();
    resupplyGroup.name = 'factory-resupply-crates';
    resupplyGroup.visible = false;
    G.scene.add(resupplyGroup);

    const crateMat = new THREE.MeshStandardMaterial({ color: 0x26313a, roughness: 0.55, metalness: 0.45 });
    const crateTrimReady = new THREE.MeshStandardMaterial({ color: 0x58c4b8, emissive: 0x2b9c8e, emissiveIntensity: 1.8, roughness: 0.3 });
    const crateTrimCool = new THREE.MeshStandardMaterial({ color: 0x4a525a, emissive: 0x111518, emissiveIntensity: 0.2, roughness: 0.6 });
    const resupplySpots = [
      { id: 'crate_ramp', label: 'Loading Ramp Supply Crate', pos: [-6.2, 0.0, 4.8] },
      { id: 'crate_garage', label: 'Garage Apron Supply Crate', pos: [2.0, 0.0, 32.5] },
      { id: 'crate_shipping', label: 'Shipping Hall Supply Crate', pos: [12.5, 0.06, 5.0] },
      { id: 'crate_kiln', label: 'Kiln Aisle Supply Crate', pos: [23.0, 0.06, -4.0] },
      { id: 'crate_gazebo', label: 'Gazebo Yard Supply Crate', pos: [-21.5, 0.0, 16.5] }
    ];
    const resupplyCrates = resupplySpots.map((sp) => {
      const grp = new THREE.Group();
      grp.position.set(sp.pos[0], sp.pos[1], sp.pos[2]);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.56, 0.62), crateMat);
      box.position.y = 0.28;
      box.castShadow = true;
      box.receiveShadow = true;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.09, 0.64), crateTrimReady);
      strip.position.y = 0.46;
      grp.add(box, strip);
      resupplyGroup.add(grp);
      const crate = { ...sp, grp, strip, cooldown: 0 };
      interactives.push({
        id: sp.id,
        combatOnly: true,
        pos: new THREE.Vector3(sp.pos[0], sp.pos[1] + 0.7, sp.pos[2]),
        range: 3.2,
        getLabel: () => crate.cooldown > 0
          ? `${sp.label} (Recharging ${Math.ceil(crate.cooldown)}s)`
          : `Resupply Ammo & Medkit (+90 Ammo, +45 HP)`,
        trigger: () => {
          if (crate.cooldown > 0) return `Crate recharging (${Math.ceil(crate.cooldown)}s remaining)`;
          crate.cooldown = 25;
          crate.strip.material = crateTrimCool;
          if (G.weapon && G.weapon.addAmmo) G.weapon.addAmmo(90);
          if (G.player && G.player.heal) G.player.heal(45);
          G.audio && G.audio.play && G.audio.play('impact_metal', { pos: sp.pos, gain: 0.45 });
          return 'Resupplied: +90 Reserve Ammo · +45 HP';
        }
      });
      return crate;
    });

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
      showToast('Atmosphere: ' + a.name);
    }
    applyAtmosphere(0);

    let gameMode = 'select'; // 'select' | 'tour' | 'combat'
    let droneMode = false;
    const dronePos = new THREE.Vector3(-11.5, 4.0, 9.5);
    let droneYaw = -1.10;
    let dronePitch = -0.15;

    // 3D Tactical Ram-Air Parachute Canopy & Suspension Rig (Gazebo -> Opposite Lawn Insertion)
    const parachuteRig = new THREE.Group();
    parachuteRig.name = 'factory-parachute-rig';
    parachuteRig.visible = false;
    G.scene.add(parachuteRig);

    {
      const canopyMainMat = new THREE.MeshStandardMaterial({ color: 0x26342c, roughness: 0.78, metalness: 0.05, side: THREE.DoubleSide });
      const canopyStripeMat = new THREE.MeshStandardMaterial({ color: 0xd98a2b, roughness: 0.72, metalness: 0.05, side: THREE.DoubleSide });
      const cordMat = new THREE.MeshBasicMaterial({ color: 0xd6cfc2 });
      const strapMat = new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: 0.85 });

      const canopyGrp = new THREE.Group();
      canopyGrp.position.set(0, 4.4, -0.35);
      const cells = 7;
      for (let c = 0; c < cells; c++) {
        const u = (c - (cells - 1) / 2) / ((cells - 1) / 2); // -1..1
        const cellX = u * 3.1;
        const cellY = -u * u * 0.72;
        const roll = -u * 0.42;
        const isStripe = c === 1 || c === cells - 2;
        const cell = new THREE.Mesh(
          new THREE.BoxGeometry(0.96, 0.28, 2.15),
          isStripe ? canopyStripeMat : canopyMainMat
        );
        cell.position.set(cellX, cellY, 0);
        cell.rotation.z = roll;
        canopyGrp.add(cell);

        // Suspension lines down to left/right shoulder risers
        const riserX = u < 0 ? -0.38 : 0.38;
        const topPt = new THREE.Vector3(cellX, cellY - 0.12, 0.75);
        const botPt = new THREE.Vector3(riserX, -3.55, 0.15);
        const len = topPt.distanceTo(botPt);
        const lineGeo = new THREE.CylinderGeometry(0.008, 0.008, len, 4);
        const line = new THREE.Mesh(lineGeo, cordMat);
        line.position.copy(topPt).lerp(botPt, 0.5);
        line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), botPt.clone().sub(topPt).normalize());
        canopyGrp.add(line);

        const topBack = new THREE.Vector3(cellX, cellY - 0.12, -0.75);
        const lenB = topBack.distanceTo(botPt);
        const lineGeoB = new THREE.CylinderGeometry(0.008, 0.008, lenB, 4);
        const lineB = new THREE.Mesh(lineGeoB, cordMat);
        lineB.position.copy(topBack).lerp(botPt, 0.5);
        lineB.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), botPt.clone().sub(topBack).normalize());
        canopyGrp.add(lineB);
      }
      // Twin shoulder risers visible at top edges of player view
      for (const rx of [-0.38, 0.38]) {
        const riser = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.95, 0.025), strapMat);
        riser.position.set(rx, 0.55, -0.2);
        parachuteRig.add(riser);
      }
      parachuteRig.add(canopyGrp);
      parachuteRig.userData.canopy = canopyGrp;
    }

    const parachuteDrop = {
      active: false,
      drifting: false,
      driftT: 0,
      t: 0,
      duration: 5.8,
      startPos: new THREE.Vector3(-25.4, 34.0, 21.8), // High above Gazebo (Çardak)
      endPos: new THREE.Vector3(24.5, 0.12, 43.5),    // Opposite South-East Lawn (Yeşillik)
      steerX: 0,
      steerZ: 0,
      yaw: -1.16,
      pitch: -0.34
    };

    // Combat Wave, Mission & Feedback State
    const combatState = {
      wave: 0,
      time: 0,
      queue: [],
      nextWaveTimer: 0,
      terminalsDone: 0,
      extractReady: false,
      victory: false,
      dead: false,
      maxAlive: 16,
      hitTimer: null,
      dmgTimer: null,
      bannerTimer: null
    };

    function showWaveBanner(text, dur = 3200) {
      if (!waveBannerEl) return;
      waveBannerEl.textContent = text;
      waveBannerEl.classList.add('on');
      clearTimeout(combatState.bannerTimer);
      combatState.bannerTimer = setTimeout(() => waveBannerEl.classList.remove('on'), dur);
    }

    function flashHitmarker(kind) {
      if (!hitmarkerEl) return;
      hitmarkerEl.classList.remove('on', 'weak', 'kill');
      void hitmarkerEl.offsetWidth;
      hitmarkerEl.classList.add('on');
      if (kind === 'kill') hitmarkerEl.classList.add('kill');
      else if (kind === 'weak') hitmarkerEl.classList.add('weak');
      clearTimeout(combatState.hitTimer);
      combatState.hitTimer = setTimeout(() => hitmarkerEl.classList.remove('on', 'weak', 'kill'), kind === 'kill' ? 280 : 160);
    }

    function flashDamage() {
      if (!damageFlashEl) return;
      damageFlashEl.classList.add('on');
      clearTimeout(combatState.dmgTimer);
      combatState.dmgTimer = setTimeout(() => damageFlashEl.classList.remove('on'), 220);
    }

    function fmtTime(sec) {
      const s = Math.max(0, Math.floor(sec));
      return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }

    function pickEnemySpawn(type) {
      const want = type === 'gull' ? 'air' : 'ground';
      const candidates = enemySpawns.filter((sp) => sp.type === want);
      let best = candidates[0] || enemySpawns[0];
      let bestScore = -1e9;
      for (const sp of candidates) {
        const d = Math.hypot(sp.pos.x - G.player.pos.x, sp.pos.z - G.player.pos.z);
        const score = (d >= 16 ? 4 : -(16 - d)) + Math.random() * 4.5;
        if (score > bestScore) {
          bestScore = score;
          best = sp;
        }
      }
      const p = best.pos.clone();
      p.x += (Math.random() - 0.5) * 2.4;
      p.z += (Math.random() - 0.5) * 2.4;
      return p;
    }

    function queueSquad(waveNum, { cyborg = 4, hound = 3, gull = 3, banner = '' } = {}) {
      combatState.wave = waveNum;
      const order = [];
      for (let i = 0; i < cyborg; i++) order.push('cyborg');
      for (let i = 0; i < hound; i++) order.splice(Math.min(order.length, 1 + i * 2), 0, 'hound');
      for (let i = 0; i < gull; i++) order.splice(Math.min(order.length, 2 + i * 2), 0, 'gull');
      order.forEach((type, idx) => {
        combatState.queue.push({
          type,
          at: combatState.time + 0.5 + idx * 0.55
        });
      });
      showWaveBanner(banner || `WAVE ${waveNum} · ${cyborg} CYBORGS · ${hound} HOUNDS · ${gull} GULLS`, 3800);
      G.audio && G.audio.setIntensity && G.audio.setIntensity(Math.min(1, 0.65 + waveNum * 0.1));
    }

    function aliveEnemyCount() {
      if (!G.enemies) return 0;
      if (typeof G.enemies.aliveCount === 'function') return G.enemies.aliveCount();
      return (G.enemies.list || []).filter((en) => en && en.alive).length;
    }

    function showDebrief(isVictory) {
      G.player.enabled = false;
      G.input.setGameplay && G.input.setGameplay(false);
      if (document.pointerLockElement) document.exitPointerLock();
      const stats = (G.combat && G.combat.stats) || { shots: 0, hits: 0, kills: 0 };
      const acc = stats.shots > 0 ? Math.round((stats.hits / stats.shots) * 100) + '%' : '—';
      if (combatOverCard) combatOverCard.classList.toggle('victory', !!isVictory);
      if (overKickerEl) overKickerEl.textContent = isVictory ? 'FACTORY COMBAT · MISSION COMPLETE' : 'FACTORY COMBAT · BREACHER DOWN';
      if (overTitleEl) overTitleEl.textContent = isVictory ? 'Extracted Safely' : 'Unit Offline';
      if (overSubEl) {
        overSubEl.textContent = isVictory
          ? 'All 3 security terminals overridden and Porsche 928S extraction reached. Outstanding breach!'
          : 'The cyborgs and machines overran the factory floor. Review your run and redeploy.';
      }
      if (overWaveEl) overWaveEl.textContent = `${combatState.terminalsDone} / ${missionTerminals.length}`;
      if (overKillsEl) overKillsEl.textContent = String(stats.kills || 0);
      if (overAccEl) overAccEl.textContent = acc;
      if (overTimeEl) overTimeEl.textContent = fmtTime(combatState.time);
      if (combatOverModal) combatOverModal.hidden = false;
      G.audio && G.audio.setIntensity && G.audio.setIntensity(0.15);
    }

    G.events.on('player:hitEnemy', ({ killed, weak }) => {
      if (gameMode !== 'combat') return;
      flashHitmarker(killed ? 'kill' : weak ? 'weak' : 'hit');
    });

    G.events.on('player:hit', () => {
      if (gameMode !== 'combat') return;
      flashDamage();
    });

    G.events.on('player:dead', () => {
      if (gameMode !== 'combat' || combatState.dead || combatState.victory) return;
      combatState.dead = true;
      showDebrief(false);
    });

    function openModeModal() {
      if (document.pointerLockElement) document.exitPointerLock();
      if (helpModal) helpModal.hidden = true;
      if (combatOverModal) combatOverModal.hidden = true;
      if (modeModal) modeModal.hidden = false;
      G.input.setGameplay && G.input.setGameplay(false);
    }

    function enterTourMode() {
      gameMode = 'tour';
      combatState.dead = false;
      combatState.victory = false;
      combatState.queue.length = 0;
      combatState.nextWaveTimer = 0;
      document.body.classList.remove('mode-combat', 'is-ads');
      if (modeModal) modeModal.hidden = true;
      if (combatOverModal) combatOverModal.hidden = true;
      if (combatHudEl) combatHudEl.hidden = true;
      if (brandKickerEl) brandKickerEl.textContent = '3D ARCHITECTURAL SPACE · ULTRA HD';
      if (gameModeLabelEl) gameModeLabelEl.textContent = 'Free Tour';
      if (G.enemies && G.enemies.clear) G.enemies.clear();
      if (G.weapon && G.weapon.setVisible) G.weapon.setVisible(false);
      resupplyGroup.visible = false;
      missionGroup.visible = false;
      extractGroup.visible = false;
      parachuteDrop.active = false;
      parachuteDrop.drifting = false;
      parachuteRig.visible = false;
      G.player.invulnerable = true;
      G.player.alive = true;
      G.player.health = G.player.maxHealth || 100;
      G.player.enabled = !droneMode;
      G.input.setGameplay && G.input.setGameplay(true);
      G.audio && G.audio.setIntensity && G.audio.setIntensity(0.15);
      showToast('Free Tour Mode — Explore freely');
    }

    function enterCombatMode({ requestLock = false } = {}) {
      gameMode = 'combat';
      droneMode = false;
      combatState.dead = false;
      combatState.victory = false;
      combatState.time = 0;
      combatState.nextWaveTimer = 0;
      combatState.terminalsDone = 0;
      combatState.extractReady = false;
      combatState.queue.length = 0;
      if (modeLabelEl) modeLabelEl.textContent = 'Walk Mode';
      btnMode && btnMode.classList.remove('active');
      document.body.classList.add('mode-combat');
      document.body.classList.remove('is-ads');
      if (modeModal) modeModal.hidden = true;
      if (combatOverModal) combatOverModal.hidden = true;
      if (helpModal) helpModal.hidden = true;
      if (combatHudEl) combatHudEl.hidden = false;
      if (brandKickerEl) brandKickerEl.textContent = 'AIZANOI WARS COMBAT · FACTORY BREACH';
      if (gameModeLabelEl) gameModeLabelEl.textContent = 'Battle Mode';

      if (G.enemies && G.enemies.clear) G.enemies.clear();
      if (G.combat && G.combat.reset) G.combat.reset();
      if (G.weapon) {
        G.weapon.reset && G.weapon.reset();
        G.weapon.setVisible && G.weapon.setVisible(false);
        if (combatWeaponEl && G.weapon.name) combatWeaponEl.textContent = G.weapon.name.toUpperCase();
      }
      for (const crate of resupplyCrates) {
        crate.cooldown = 0;
        crate.strip.material = crateTrimReady;
      }
      for (const term of missionTerminals) {
        term.done = false;
        term.screen.material = termLiveMat;
        term.beam.visible = true;
      }
      resupplyGroup.visible = true;
      missionGroup.visible = true;
      extractGroup.visible = false;

      // Start Parachute Drop from high above Gazebo -> Opposite South-East Lawn
      parachuteDrop.active = true;
      parachuteDrop.drifting = false;
      parachuteDrop.driftT = 0;
      parachuteDrop.t = 0;
      parachuteDrop.steerX = 0;
      parachuteDrop.steerZ = 0;
      parachuteDrop.yaw = -1.16;
      parachuteDrop.pitch = -0.34;
      parachuteRig.visible = true;
      parachuteRig.position.copy(parachuteDrop.startPos);
      parachuteRig.rotation.set(0, parachuteDrop.yaw, 0);

      G.player.reset({ pos: parachuteDrop.endPos.clone(), yaw: 0.38 });
      G.player.invulnerable = true;
      G.player.enabled = false;
      G.input.setGameplay && G.input.setGameplay(true);
      if (requestLock && G.input.requestLock) G.input.requestLock();
      try { G.audio && G.audio.resume && G.audio.resume(); } catch {}
      showWaveBanner('PARACHUTE INSERTION · GAZEBO → SOUTH-EAST LAWN', 4200);
    }

    window.__factory = {
      getMode: () => gameMode,
      enterTourMode,
      enterCombatMode,
      openModeModal
    };

    function toggleDroneMode(force) {
      if (gameMode === 'combat') {
        showToast('Drone camera is disabled in Battle Mode');
        return;
      }
      const next = typeof force === 'boolean' ? force : !droneMode;
      if (next === droneMode) return;
      droneMode = next;
      if (droneMode) {
        dronePos.copy(G.camera.position);
        droneYaw = G.player.yaw;
        dronePitch = G.player.pitch;
        G.player.enabled = false;
        showToast('Free Flight (Drone) Mode — Use Space / C to ascend and descend');
      } else {
        const gx = Math.max(-90, Math.min(90, dronePos.x));
        const gz = Math.max(-85, Math.min(85, dronePos.z));
        const gy = G.physics.groundHeight(gx, gz, Math.max(2.0, dronePos.y + 0.5));
        G.player.pos.set(gx, Math.max(0, gy), gz);
        G.player.vel.set(0, 0, 0);
        G.player.yaw = droneYaw;
        G.player.pitch = dronePitch;
        G.player.enabled = true;
        showToast('Walk Mode (FPS)');
      }
      if (modeLabelEl) modeLabelEl.textContent = droneMode ? 'Drone Flight' : 'Walk Mode';
      btnMode && btnMode.classList.toggle('active', droneMode);
    }

    function jumpToBookmark(idx) {
      if (gameMode === 'combat') return;
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

    const qualityLabel = document.getElementById('quality-label');
    const qualityLadder = ['low', 'medium', 'high', 'ultra'];
    const qualityNames = { low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra' };
    if (qualityLabel) qualityLabel.textContent = quality.label || qualityNames[quality.name] || 'Ultra';
    function applyQuality(name) {
      const next = E.presets[name] ? chooseFactoryQuality({ name }, { q: name }) : quality;
      try { G.render.setQuality(next); } catch {}
      G.quality = next;
      if (qualityLabel) qualityLabel.textContent = next.label || qualityNames[name] || name;
      try { localStorage.setItem('aizanoi.factory.quality', next.name); } catch {}
      showToast('Quality: ' + (next.label || next.name));
    }
    const btnQuality = document.getElementById('btn-quality');
    btnQuality && btnQuality.addEventListener('pointerup', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const idx = qualityLadder.indexOf(G.quality && G.quality.name);
      applyQuality(qualityLadder[(idx + 1) % qualityLadder.length]);
    });
    btnQuality && btnQuality.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const idx = qualityLadder.indexOf(G.quality && G.quality.name);
      applyQuality(qualityLadder[(idx + 1) % qualityLadder.length]);
    });

    btnGameMode && btnGameMode.addEventListener('click', () => openModeModal());
    btnStartTour && btnStartTour.addEventListener('click', () => enterTourMode());
    const startCombat = () => enterCombatMode({ requestLock: !(typeof navigator !== 'undefined' && navigator.webdriver) });
    btnStartCombat && btnStartCombat.addEventListener('pointerup', startCombat);
    btnCombatRetry && btnCombatRetry.addEventListener('click', () => enterCombatMode({ requestLock: true }));
    btnCombatToTour && btnCombatToTour.addEventListener('click', () => enterTourMode());

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
    btnHelp && btnHelp.addEventListener('pointerup', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (document.pointerLockElement) document.exitPointerLock();
      toggleHelp(true);
    });
    btnHelp && btnHelp.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      toggleHelp(true);
    });
    btnHelpClose && btnHelpClose.addEventListener('click', () => toggleHelp(false));
    document.querySelectorAll('.bm-btn').forEach((btn) => {
      btn.addEventListener('click', () => jumpToBookmark(+btn.dataset.bm));
    });

    window.addEventListener('keydown', (ev) => {
      if (ev.repeat) return;
      if (ev.code === 'KeyG') {
        if (modeModal && !modeModal.hidden && gameMode !== 'select') {
          modeModal.hidden = true;
          G.input.setGameplay && G.input.setGameplay(true);
        } else {
          openModeModal();
        }
        return;
      }
      if (modeModal && !modeModal.hidden) return;
      if (combatOverModal && !combatOverModal.hidden) return;

      if (ev.code === 'KeyV') toggleDroneMode();
      else if (ev.code === 'KeyT') applyAtmosphere(atmoIdx + 1);
      else if (ev.code === 'KeyF') setFlash(!flashOn);
      else if (ev.code === 'KeyM') btnMap && btnMap.click();
      else if (ev.code === 'KeyQ') {
        const idx = qualityLadder.indexOf(G.quality && G.quality.name);
        applyQuality(qualityLadder[(idx + 1) % qualityLadder.length]);
      }
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

    await setBoot('Compiling first frame', 0.96);
    try {
      await G.render.onLevelReady();
    } catch (e) {
      console.warn('[factory] onLevelReady:', e);
    }
    await setBoot('Ready', 1.0);
    if (bootEl) {
      bootEl.classList.add('done');
      setTimeout(() => { bootEl.hidden = true; }, 650);
    }

    if (params.mode === 'tour') {
      enterTourMode();
    } else if (params.mode === 'combat') {
      enterCombatMode({ requestLock: false });
    } else {
      openModeModal();
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
      const modalOpen = !helpModal.hidden || (modeModal && !modeModal.hidden) || (combatOverModal && !combatOverModal.hidden);
      lockHintEl && lockHintEl.classList.toggle('hidden', modalOpen || G.input.locked || G.input.touch);

      if (modalOpen) {
        G.level.update(dt);
        G.ground.update(dt);
        G.input.endFrame();
        G.render.frame(dt);
        window.__frames++;
        if (window.__frames === 2) window.__ready = true;
        return;
      }

      if (gameMode === 'combat') {
        if (parachuteDrop.drifting) {
          parachuteDrop.driftT += dt;
          parachuteRig.position.x += dt * 2.4;
          parachuteRig.position.y += dt * 1.1;
          parachuteRig.position.z += dt * 1.6;
          parachuteRig.rotation.z += dt * 0.25;
          if (parachuteDrop.driftT >= 3.2) {
            parachuteDrop.drifting = false;
            parachuteRig.visible = false;
          }
        }

        if (parachuteDrop.active) {
          parachuteDrop.t += dt;
          const u = Math.min(1, parachuteDrop.t / parachuteDrop.duration);
          // Smooth horizontal glide + flare-out descent curve
          const hEase = u * u * (3 - 2 * u);
          const vEase = 1 - Math.pow(1 - u, 1.45);

          parachuteDrop.yaw -= G.input.look.dx;
          parachuteDrop.pitch = Math.max(-1.45, Math.min(1.45, parachuteDrop.pitch - G.input.look.dy));

          // Subtle WASD air-steering within safe lawn landing bounds
          const steerSpeed = 4.2 * (1 - u * 0.65);
          parachuteDrop.steerX = Math.max(-6.5, Math.min(6.5, parachuteDrop.steerX + G.input.move.x * steerSpeed * dt));
          parachuteDrop.steerZ = Math.max(-5.5, Math.min(5.5, parachuteDrop.steerZ - G.input.move.y * steerSpeed * dt));

          const swayX = Math.sin(parachuteDrop.t * 2.1) * 0.55 * (1 - u);
          const swayRoll = Math.sin(parachuteDrop.t * 2.1) * 0.045 * (1 - u);

          const px = parachuteDrop.startPos.x + (parachuteDrop.endPos.x - parachuteDrop.startPos.x) * hEase + parachuteDrop.steerX * hEase + swayX;
          const pz = parachuteDrop.startPos.z + (parachuteDrop.endPos.z - parachuteDrop.startPos.z) * hEase + parachuteDrop.steerZ * hEase;
          const py = parachuteDrop.startPos.y + (parachuteDrop.endPos.y + 1.72 - parachuteDrop.startPos.y) * vEase;

          G.camera.position.set(px, py, pz);
          G.camera.rotation.set(parachuteDrop.pitch, parachuteDrop.yaw, swayRoll, 'YXZ');

          parachuteRig.position.set(px, py, pz);
          parachuteRig.rotation.set(0.08 * (1 - u), parachuteDrop.yaw, swayRoll * 1.4);

          if (combatObjectiveBarEl) {
            combatObjectiveBarEl.classList.remove('extract');
            if (combatObjTagEl) combatObjTagEl.textContent = 'AIRDROP';
            if (combatObjTextEl) combatObjTextEl.textContent = 'Parachute Insertion · Gazebo → South-East Lawn';
            if (combatObjDistEl) combatObjDistEl.textContent = `ALT ${Math.max(0, Math.round(py - 1.7))} m`;
          }
          if (combatHpEl) combatHpEl.textContent = '100';
          if (combatHpFillEl) combatHpFillEl.style.width = '100%';
          if (G.weapon) {
            if (combatAmmoEl) combatAmmoEl.textContent = String(G.weapon.ammo ?? 30);
            if (combatReserveEl) combatReserveEl.textContent = String(G.weapon.reserve ?? 120);
            if (combatWeaponStateEl) combatWeaponStateEl.textContent = 'INBOUND · STEER [WASD] · LOOK AROUND';
          }

          if (u >= 1) {
            parachuteDrop.active = false;
            parachuteDrop.drifting = true;
            parachuteDrop.driftT = 0;
            const lx = Math.max(12.0, Math.min(44.0, px));
            const lz = Math.max(38.5, Math.min(52.0, pz));
            const ly = G.physics && G.physics.groundHeight ? G.physics.groundHeight(lx, lz, 3.0) : 0.12;
            G.player.pos.set(lx, Math.max(0.05, ly), lz);
            G.player.vel.set(0, 0, 0);
            G.player.yaw = parachuteDrop.yaw;
            G.player.pitch = Math.max(-0.5, Math.min(0.5, parachuteDrop.pitch));
            G.player.invulnerable = false;
            G.player.enabled = true;
            G.player.addShake && G.player.addShake(0.24);
            G.weapon && G.weapon.setVisible && G.weapon.setVisible(true);
            G.audio && G.audio.play && G.audio.play('impact_concrete', { pos: [lx, ly, lz], gain: 0.55 });
            queueSquad(1, {
              cyborg: 5,
              hound: 3,
              gull: 3,
              banner: 'BOOTS ON GROUND · OVERRIDE 3 TERMINALS (A · B · C) · 11 HOSTILES DETECTED'
            });
          }
        } else if (!combatState.dead && !combatState.victory && G.player.alive) {
          combatState.time += dt;
          G.player.update(dt);
          G.weapon && G.weapon.update && G.weapon.update(dt);
          G.enemies && G.enemies.update && G.enemies.update(dt);
          document.body.classList.toggle('is-ads', !!(G.weapon && (G.weapon.ads || 0) > 0.35));

          // Update resupply crates cooldown
          for (const crate of resupplyCrates) {
            if (crate.cooldown > 0) {
              crate.cooldown = Math.max(0, crate.cooldown - dt);
              if (crate.cooldown === 0) crate.strip.material = crateTrimReady;
            }
          }

          // Animate extraction beacon & check mission extraction completion
          if (combatState.extractReady) {
            extractRing.rotation.z += dt * 1.4;
            const pulse = 0.85 + Math.sin(combatState.time * 4.5) * 0.15;
            extractRing.scale.set(pulse, pulse, 1);
            const exDist = Math.hypot(G.player.pos.x - extractPos.x, G.player.pos.z - extractPos.z);
            if (exDist <= 3.6 && Math.abs(G.player.pos.y - extractPos.y) < 3.0) {
              combatState.victory = true;
              showDebrief(true);
            }
          }

          // Staggered wave enemy spawner (Cyborgs, Hounds, Gulls)
          const alive = aliveEnemyCount();
          if (combatState.queue.length > 0 && alive < combatState.maxAlive) {
            const next = combatState.queue[0];
            if (combatState.time >= next.at && G.enemies && G.enemies.spawn) {
              combatState.queue.shift();
              const pos = pickEnemySpawn(next.type);
              try {
                G.enemies.spawn(next.type, pos, { state: 'alert', target: G.player.pos });
                G.enemies.alert && G.enemies.alert(G.player.pos, 95);
              } catch (e) {
                console.warn('[factory] enemy spawn failed:', e);
              }
            }
          } else if (combatState.queue.length === 0 && alive <= 2) {
            if (combatState.nextWaveTimer <= 0) {
              combatState.nextWaveTimer = 5.0;
              if (alive === 0) {
                if (G.player.heal) G.player.heal(25);
                if (G.weapon && G.weapon.addAmmo) G.weapon.addAmmo(60);
                showWaveBanner(`SECTOR CLEAR · +25 HP · +60 AMMO · PUSH TO OBJECTIVE`, 2600);
              }
            } else {
              combatState.nextWaveTimer -= dt;
              if (combatState.nextWaveTimer <= 0) {
                queueSquad(combatState.wave + 1, {
                  cyborg: 4 + Math.min(3, combatState.terminalsDone),
                  hound: 3,
                  gull: 3
                });
              }
            }
          }

          // Update Combat & Mission Objective HUD
          const remaining = alive + combatState.queue.length;
          const hp = Math.max(0, Math.round(G.player.health || 0));
          const maxHp = G.player.maxHealth || 100;
          if (combatObjectivesEl) combatObjectivesEl.textContent = `${combatState.terminalsDone} / ${missionTerminals.length}`;
          if (combatWaveEl) combatWaveEl.textContent = String(combatState.wave || 1);
          if (combatHostilesEl) combatHostilesEl.textContent = String(remaining);
          if (combatKillsEl) combatKillsEl.textContent = String((G.combat && G.combat.stats && G.combat.stats.kills) || 0);
          if (combatHpEl) combatHpEl.textContent = String(hp);
          if (combatHpFillEl) combatHpFillEl.style.width = Math.round((hp / maxHp) * 100) + '%';
          if (combatHealthCardEl) combatHealthCardEl.classList.toggle('low', hp <= 30);

          if (combatObjectiveBarEl) {
            combatObjectiveBarEl.classList.toggle('extract', combatState.extractReady);
            if (combatState.extractReady) {
              const exDist = Math.hypot(G.player.pos.x - extractPos.x, G.player.pos.z - extractPos.z);
              if (combatObjTagEl) combatObjTagEl.textContent = 'EXTRACT';
              if (combatObjTextEl) combatObjTextEl.textContent = 'Reach 4-Post Garage · Porsche 928S';
              if (combatObjDistEl) combatObjDistEl.textContent = `${Math.round(exDist)} m`;
            } else {
              let nearest = null;
              let nearD = Infinity;
              for (const term of missionTerminals) {
                if (term.done) continue;
                const d = Math.hypot(G.player.pos.x - term.pos[0], G.player.pos.z - term.pos[2]);
                if (d < nearD) {
                  nearD = d;
                  nearest = term;
                }
              }
              if (combatObjTagEl) combatObjTagEl.textContent = 'MISSION';
              if (nearest) {
                if (combatObjTextEl) combatObjTextEl.textContent = `Override ${nearest.name} [E]`;
                if (combatObjDistEl) combatObjDistEl.textContent = `${Math.round(nearD)} m`;
              }
            }
          }

          if (G.weapon) {
            if (combatAmmoEl) combatAmmoEl.textContent = String(G.weapon.ammo ?? 0);
            if (combatReserveEl) combatReserveEl.textContent = String(G.weapon.reserve ?? 0);
            if (combatWeaponStateEl) {
              if (G.weapon.state === 'reload') combatWeaponStateEl.textContent = 'RELOADING...';
              else if ((G.weapon.ammo ?? 0) === 0 && (G.weapon.reserve ?? 0) === 0) combatWeaponStateEl.textContent = 'EMPTY · FIND A SUPPLY CRATE [E]';
              else if ((G.weapon.ammo ?? 0) <= 6) combatWeaponStateEl.textContent = 'LOW AMMO · PRESS [R] TO RELOAD';
              else combatWeaponStateEl.textContent = 'READY · [R] RELOAD · RMB AIM';
            }
          }
        }
      } else if (droneMode) {
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
        if (item.combatOnly && gameMode !== 'combat') continue;
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

      const curYaw = parachuteDrop.active ? parachuteDrop.yaw : droneMode ? droneYaw : G.player.yaw;
      if (zoneEl) zoneEl.textContent = getZoneName(camPos.x, camPos.y, camPos.z);
      if (coordsEl) coordsEl.textContent = `X ${camPos.x.toFixed(1)} · Z ${camPos.z.toFixed(1)}`;
      if (compassEl) {
        let deg = Math.round(((-curYaw * 180) / Math.PI) % 360);
        if (deg < 0) deg += 360;
        const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        compassEl.textContent = `${dirs[Math.round(deg / 45) % 8]} ${deg}°`;
      }
      if (!minimapCard.classList.contains('hidden')) {
        let missionMarkers = null;
        if (gameMode === 'combat') {
          missionMarkers = missionTerminals
            .filter((t) => !t.done)
            .map((t) => ({ x: t.pos[0], z: t.pos[2], short: t.short, kind: 'terminal' }));
          if (combatState.extractReady) {
            missionMarkers.push({ x: extractPos.x, z: extractPos.z, short: 'EX', kind: 'extract' });
          }
        }
        drawMinimap(camPos.x, camPos.z, curYaw, gameMode === 'combat' && G.enemies ? G.enemies.list : null, missionMarkers);
      }

      G.render.frame(dt);
      G.input.endFrame();

      window.__frames++;
      if (window.__frames === 2) window.__ready = true;
    });
  }

  boot().catch(showFatal);
})();
