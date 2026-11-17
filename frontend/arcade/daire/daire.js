(() => {
  'use strict';
  const E = window.AZ_ENGINE;
  const bootEl = document.getElementById('boot');
  const bootMsg = document.getElementById('boot-msg');
  const fatalEl = document.getElementById('fatal');
  const zoneEl = document.getElementById('zone-name');
  const noteEl = document.getElementById('zone-note');
  const helpModal = document.getElementById('help-modal');
  const lockHint = document.getElementById('lock-hint');
  window.__frames = 0;
  window.__ready = false;
  window.__fatal = null;

  function fail(msg) {
    window.__fatal = msg;
    if (fatalEl) { fatalEl.hidden = false; fatalEl.textContent = msg; }
    if (bootEl) bootEl.hidden = true;
  }

  const NOTES = {
    salon: 'Salon. Karşıda boydan boya pencere. Sağda küçük televizyon. İki kirli kırmızı açık çekyat. Kapı yanında yataksız baza. Ötedeki koltuğun yanında tahta masa.',
    bed: 'Yatak odası. Solda duvara dayalı iki kişilik yatak. Ayak ucunda masa, arkasında cam. Kapı hizasında büyük dolap.',
    pouf: 'Mavi puf. Karşısında küçük dolap. Solunda balkon camının önünde plastik masa ve iki sandalye. Balkonda kombi. Koridora bakan gözde tek kişilik yatak.',
    desk: 'Çalışma masası tam karşıda. Sağda büyük dağınık yatak. Solda yukarıda havalandırmaya bakan küçük pencere. Oda küçük.',
    bath: 'Lavabo tam karşıda, üstünde küçük banyo dolabı. Diğer tarafta kabin yok, sadece duş başlığı ve duş alanı.',
    wc: 'Klozet kapının karşısında. Hareket edecek alan yok.',
    hall: 'Ayakkabı kartonu koridorda, üstünde bir sürü ayakkabı.',
    kitchen: 'İki buzdolabı solda: birinde ayakkabı, diğerinde yiyecek. Yanında sürgülü dolap, üstünde küçük enerji içeceği dolabı. Tezgahın buzdolabı tarafı boş. Ocak karşıda, ortada lavabo.',
    balcony: '4 · Balkon. Kombi burada. Oda 3 kapısının hizasındaki kapıdan çıkılır.'
  };

  function boot() {
    if (!E) { fail('Motor yüklenmedi'); return; }
    const THREE = E.THREE;
    const params = Object.fromEntries(new URLSearchParams(location.search));
    const G = {
      THREE,
      geo: E.geo,
      createRng: E.createRng,
      params,
      events: E.createEvents(),
      rng: E.createRng(11),
      time: { t: 0, dt: 0, frame: 0, real: 0 },
      quality: E.detectQuality('medium')
    };
    window.__G = G;

    E.createRender(G).then(async (render) => {
      G.render = render;
      G.renderer = render.renderer;
      G.scene = render.scene;
      G.camera = render.camera;
      G.scene.background = new THREE.Color(0x9aa4ab);
      G.scene.fog = null;
      G.mats = await E.createMaterials(G);
      G.physics = E.createPhysics(G);
      G.input = E.createInput(G);
      const L = E.createLevelHelper(G);
      buildApartment(G, L, THREE);
      const merged = E.mergeStatic(L.staticRoot);
      const levelRoot = new THREE.Group();
      levelRoot.name = 'ev-level';
      levelRoot.add(merged, L.dynRoot);
      G.scene.add(levelRoot);
      const start = { pos: new THREE.Vector3(0.62, 0, 0.42), yaw: 0 };
      G.level = {
        playerStart: start,
        groundSurfaceAt: (x, z) => (x > 1.25 && z < 3.9) || x > 4.15 ? 'tile' : 'wood',
        update() {}
      };
      G.physics.build();
      G.player = E.createPlayer(G);
      G.player.reset(start);
      G.player.invulnerable = true;
      G.player.enabled = true;
      G.input.setGameplay(true);
      if (bootEl) bootEl.hidden = true;
      wireHelp();
      let last = performance.now();
      G.renderer.setAnimationLoop(() => {
        const now = performance.now();
        const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
        last = now;
        G.time.dt = dt;
        G.time.t += dt;
        G.time.frame++;
        G.input.update(dt);
        if (helpModal.hidden) G.player.update(dt);
        else G.input.endFrame();
        const p = G.player.pos;
        const zone = zoneAt(p.x, p.z);
        if (zoneEl) zoneEl.textContent = zone.title;
        if (noteEl) noteEl.textContent = zone.note;
        if (lockHint) lockHint.classList.toggle('hidden', G.input.locked || G.input.touch || !helpModal.hidden);
        G.render.frame(dt);
        G.input.endFrame();
        window.__frames++;
        if (window.__frames === 2) window.__ready = true;
      });
    }).catch((error) => fail(String(error && error.stack || error)));
  }

  function wireHelp() {
    const toggle = (open) => { helpModal.hidden = !open; };
    document.getElementById('btn-help').addEventListener('click', () => toggle(true));
    document.getElementById('btn-help-close').addEventListener('click', () => toggle(false));
    window.addEventListener('keydown', (ev) => {
      if (ev.repeat || ev.code !== 'KeyH') return;
      toggle(helpModal.hidden);
    });
  }

  function zoneAt(x, z) {
    if (x > 4.15 && z >= 6.7 && z <= 9.5) return { title: '4 · Balkon', note: NOTES.balcony };
    if (x > 1.25 && z >= 6.45 && z < 10.1) return { title: '3 · Oda', note: NOTES.pouf };
    if (x > 1.25 && z >= 4.0 && z < 6.45) return { title: '5 · Küçük oda', note: NOTES.desk };
    if (x > 1.25 && z >= 1.5 && z < 4.0) return { title: '6 · Banyo', note: NOTES.bath };
    if (x > 1.25 && z >= 0.1 && z < 1.5) return { title: '7 · Tuvalet', note: NOTES.wc };
    if (x < 0 && z >= 8.2) return { title: '9 · Mutfak', note: NOTES.kitchen };
    if (x < 0 && z >= 4.5 && z < 8.2) return { title: '2 · Yatak odası', note: NOTES.bed };
    if (x < 0 && z < 4.5) return { title: '1 · Salon', note: NOTES.salon };
    return { title: '8 · Koridor', note: NOTES.hall };
  }

  // Entrance is the heavy mark at the south. Corridor runs north.
  // Large rooms are west. Small rooms and the balcony protrusion are east.
  // Factory outdoor ground is not used; it would bury the apartment.
  function buildApartment(G, L, THREE) {
    const plaster = new THREE.MeshStandardMaterial({ color: 0xd8d2c6, roughness: 0.92 });
    const floorWood = new THREE.MeshStandardMaterial({ color: 0x8b6840, roughness: 0.78 });
    const floorWorn = new THREE.MeshStandardMaterial({ color: 0x6e5234, roughness: 0.86 });
    const tile = new THREE.MeshStandardMaterial({ color: 0xd7d2c8, roughness: 0.42, metalness: 0.04 });
    const tileWet = new THREE.MeshStandardMaterial({ color: 0x8e8a84, roughness: 0.28, metalness: 0.08 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.72 });
    const woodOld = new THREE.MeshStandardMaterial({ color: 0x5a3e28, roughness: 0.84 });
    const fabric = new THREE.MeshStandardMaterial({ color: 0x7a3030, roughness: 0.94 });
    const stain = new THREE.MeshStandardMaterial({ color: 0x4a3028, roughness: 0.96 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x6d5a48, roughness: 0.9 });
    const white = new THREE.MeshStandardMaterial({ color: 0xe6e2da, roughness: 0.46, metalness: 0.04 });
    const fridgeMat = new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.32, metalness: 0.18 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x8e949b, roughness: 0.38, metalness: 0.72 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd5dde2, roughness: 0.22, metalness: 0.86 });
    const plastic = new THREE.MeshStandardMaterial({ color: 0xd9d4cc, roughness: 0.55 });
    const poufMat = new THREE.MeshStandardMaterial({ color: 0x2d628e, roughness: 0.82 });
    const card = new THREE.MeshStandardMaterial({ color: 0xb08a56, roughness: 0.9 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x2b2724, roughness: 0.7 });
    const food = new THREE.MeshStandardMaterial({ color: 0xc4a15a, roughness: 0.62 });
    const coolerMat = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.35, metalness: 0.42 });
    const canMat = new THREE.MeshStandardMaterial({ color: 0xff7a12, roughness: 0.32, metalness: 0.28, emissive: 0x5a2400, emissiveIntensity: 0.35 });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xe7f4ff, metalness: 0.04, roughness: 0.04, transparent: true, opacity: 0.28,
      clearcoat: 1, clearcoatRoughness: 0.05
    });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.4, metalness: 0.3 });
    const concrete = new THREE.MeshStandardMaterial({ color: 0x9a958c, roughness: 0.9 });
    const H = 2.52;
    const dyn = L.dynRoot;

    function solid(mat, w, h, d, x, y, z) {
      L.box(mat, w, h, d, x, y, z);
      L.col(x - w / 2, y - h / 2, z - d / 2, x + w / 2, y + h / 2, z + d / 2, 'wood');
    }
    function look(mat, w, h, d, x, y, z, ry) {
      const mesh = new THREE.Mesh(E.geo.box(w, h, d), mat);
      mesh.position.set(x, y, z);
      if (ry) mesh.rotation.y = ry;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      dyn.add(mesh);
    }
    function pane(w, h, x, y, z, ry) {
      const mesh = new THREE.Mesh(E.geo.box(w, h, 0.015), glass);
      mesh.position.set(x, y, z);
      if (ry) mesh.rotation.y = ry;
      dyn.add(mesh);
    }
    function lamp(x, y, z, color, intensity, dist) {
      const pl = new THREE.PointLight(color, intensity, dist || 7, 1.7);
      pl.position.set(x, y, z);
      G.scene.add(pl);
    }
    function floor(mat, x0, z0, x1, z1) {
      L.slab(mat, x0, 0.012, z0, x1, 0.03, z1, { cast: false });
    }
    function wallRun(axis, fixed, a0, a1, gaps, mat) {
      const parts = [];
      let c = a0;
      for (const [a, b] of (gaps || []).slice().sort((p, q) => p[0] - q[0])) {
        if (a > c + 0.04) parts.push([c, a]);
        c = Math.max(c, b);
      }
      if (a1 > c + 0.04) parts.push([c, a1]);
      for (const [a, b] of parts) {
        if (axis === 'x') solid(mat, 0.12, H, b - a, fixed, H / 2, (a + b) / 2);
        else solid(mat, b - a, H, 0.12, (a + b) / 2, H / 2, fixed);
      }
    }
    function jamb(x, z) {
      solid(woodOld, 0.08, 2.05, 0.14, x, 1.02, z);
    }
    function doorLeaf(x, z, ry) {
      look(wood, 0.04, 2.0, 0.78, x, 1.02, z, ry);
      look(chrome, 0.04, 0.1, 0.03, x, 1.0, z, ry);
    }
    function windowOnX(x, y, z, w, h) {
      solid(woodOld, 0.08, 0.06, w, x, y - h / 2, z);
      solid(woodOld, 0.08, 0.06, w, x, y + h / 2, z);
      solid(woodOld, 0.08, h, 0.06, x, y, z - w / 2);
      solid(woodOld, 0.08, h, 0.06, x, y, z + w / 2);
      pane(0.02, h - 0.08, x, y, z, Math.PI / 2);
    }
    function windowOnZ(z, y, x, w, h) {
      solid(woodOld, w, 0.06, 0.08, x, y - h / 2, z);
      solid(woodOld, w, 0.06, 0.08, x, y + h / 2, z);
      solid(woodOld, 0.06, h, 0.08, x - w / 2, y, z);
      solid(woodOld, 0.06, h, 0.08, x + w / 2, y, z);
      pane(w - 0.08, h - 0.08, x, y, z + 0.02, 0);
    }
    function sofaBed(x, z, openZ) {
      solid(woodOld, 2.05, 0.1, 0.55, x, 0.28, z);
      solid(fabric, 1.9, 0.14, 0.85, x, 0.16, z + openZ * 0.55);
      solid(fabric, 1.9, 0.5, 0.16, x, 0.58, z - openZ * 0.18);
      solid(fabric, 0.55, 0.14, 0.48, x - 0.6, 0.38, z);
      solid(fabric, 0.55, 0.14, 0.48, x, 0.38, z);
      solid(fabric, 0.55, 0.12, 0.48, x + 0.6, 0.37, z);
      look(stain, 0.28, 0.02, 0.2, x + 0.35, 0.46, z);
      look(stain, 0.22, 0.02, 0.16, x - 0.4, 0.24, z + openZ * 0.6);
    }
    function tvUnit(x, z) {
      solid(woodOld, 1.1, 0.46, 0.4, x, 0.28, z);
      look(dark, 0.3, 0.2, 0.08, x, 0.62, z);
      look(glass, 0.24, 0.14, 0.01, x, 0.62, z + 0.05);
    }
    function bedBase(x, z) {
      solid(woodOld, 0.9, 0.08, 1.85, x, 0.1, z);
      for (let i = -3; i <= 3; i++) look(wood, 0.7, 0.02, 0.05, x, 0.16, z + i * 0.22);
    }
    function woodTable(x, z, w, d) {
      solid(woodOld, w, 0.04, d, x, 0.74, z);
      solid(wood, 0.06, 0.7, 0.06, x - w / 2 + 0.05, 0.36, z - d / 2 + 0.05);
      solid(wood, 0.06, 0.7, 0.06, x + w / 2 - 0.05, 0.36, z - d / 2 + 0.05);
      solid(wood, 0.06, 0.7, 0.06, x - w / 2 + 0.05, 0.36, z + d / 2 - 0.05);
      solid(wood, 0.06, 0.7, 0.06, x + w / 2 - 0.05, 0.36, z + d / 2 - 0.05);
    }
    function plasticChair(x, z) {
      look(plastic, 0.36, 0.04, 0.36, x, 0.46, z);
      look(plastic, 0.34, 0.36, 0.04, x, 0.66, z - 0.15);
      look(metal, 0.03, 0.42, 0.03, x - 0.13, 0.22, z - 0.12);
      look(metal, 0.03, 0.42, 0.03, x + 0.13, 0.22, z + 0.12);
    }
    function messyBed(x, z) {
      solid(wood, 1.35, 0.28, 1.95, x, 0.18, z);
      look(cloth, 1.2, 0.1, 1.5, x, 0.36, z);
      look(stain, 0.95, 0.07, 0.8, x + 0.12, 0.44, z + 0.15, 0.4);
      look(white, 0.42, 0.08, 0.28, x + 0.3, 0.46, z - 0.5, 0.3);
    }
    function fridge(x, z, open) {
      solid(fridgeMat, 0.62, 1.7, 0.64, x, 0.88, z);
      look(metal, 0.03, 0.5, 0.03, x + 0.28, 1.05, z + 0.33);
      if (open) {
        look(fridgeMat, 0.06, 1.45, 0.55, x + 0.46, 0.92, z + 0.12, -0.85);
        look(shoeMat, 0.14, 0.08, 0.26, x, 0.42, z);
        look(shoeMat, 0.14, 0.08, 0.26, x + 0.05, 0.62, z + 0.04, 0.4);
        look(shoeMat, 0.14, 0.08, 0.26, x - 0.04, 0.82, z, -0.2);
      } else {
        look(food, 0.14, 0.1, 0.14, x - 0.06, 1.1, z);
        look(white, 0.12, 0.16, 0.1, x + 0.08, 0.7, z);
      }
    }
    function burnCooler(x, y, z) {
      solid(coolerMat, 0.4, 0.56, 0.36, x, y, z);
      pane(0.3, 0.38, x, y + 0.02, z + 0.19, 0);
      look(canMat, 0.07, 0.15, 0.07, x - 0.09, y - 0.04, z);
      look(canMat, 0.07, 0.15, 0.07, x, y - 0.04, z + 0.02);
      look(canMat, 0.07, 0.15, 0.07, x + 0.09, y - 0.04, z);
      lamp(x, y, z, 0xffb060, 0.55, 1.3);
    }
    function showerHead(x, y, z) {
      look(chrome, 0.04, 0.26, 0.04, x, y, z);
      look(chrome, 0.2, 0.04, 0.2, x, y - 0.16, z + 0.1);
      look(chrome, 0.025, 0.025, 0.26, x, y - 0.04, z + 0.06);
    }
    function toilet(x, z) {
      solid(white, 0.38, 0.38, 0.52, x, 0.26, z);
      look(white, 0.34, 0.1, 0.44, x, 0.48, z + 0.02);
      solid(white, 0.3, 0.36, 0.14, x, 0.7, z - 0.2);
      look(dark, 0.26, 0.02, 0.32, x, 0.54, z + 0.04);
    }

    floor(floorWood, -4.5, 0.15, 0, 12.05);
    floor(floorWorn, 0.06, 0.05, 1.2, 12.05);
    floor(tile, 1.25, 0.12, 3.2, 3.95);
    floor(floorWood, 1.25, 4.0, 4.15, 10.05);
    floor(concrete, 4.15, 6.7, 5.9, 9.45);
    L.slab(plaster, -4.5, 2.48, 0.1, 5.9, 2.54, 12.1, { cast: false });

    wallRun('x', 0, 0.15, 12.05, [[1.5, 2.4], [5.7, 6.6], [9.3, 10.2]], plaster);
    wallRun('x', 1.25, 0.12, 12.05, [[0.32, 1.12], [2.1, 3.0], [4.55, 5.45], [7.2, 8.1]], plaster);
    wallRun('x', -4.45, 0.2, 4.4, [], plaster);
    wallRun('x', -3.7, 4.55, 8.15, [], plaster);
    wallRun('x', -4.3, 8.25, 12.0, [], plaster);
    wallRun('x', 2.25, 0.15, 1.45, [], plaster);
    wallRun('x', 3.15, 1.55, 3.95, [], plaster);
    wallRun('x', 3.35, 4.05, 6.4, [], plaster);
    wallRun('x', 4.15, 6.5, 10.05, [[7.2, 8.1]], plaster);
    wallRun('z', 0.15, -4.45, 0, [], plaster);
    wallRun('z', 0.02, 0.2, 1.05, [], plaster);
    wallRun('z', 4.45, -4.45, 0, [], plaster);
    wallRun('z', 4.55, -3.7, 0, [], plaster);
    wallRun('z', 8.2, -3.7, 0, [], plaster);
    wallRun('z', 8.25, -4.3, 0, [], plaster);
    wallRun('z', 12.05, -4.3, 1.25, [], plaster);
    wallRun('z', 0.12, 1.25, 2.25, [], plaster);
    wallRun('z', 1.48, 1.25, 2.25, [], plaster);
    wallRun('z', 1.55, 1.25, 3.15, [], plaster);
    wallRun('z', 3.95, 1.25, 3.15, [], plaster);
    wallRun('z', 4.02, 1.25, 3.35, [], plaster);
    wallRun('z', 6.42, 1.25, 3.35, [], plaster);
    wallRun('z', 6.5, 1.25, 4.15, [], plaster);
    wallRun('z', 10.05, 1.25, 4.15, [], plaster);
    wallRun('z', 6.7, 4.15, 5.85, [], plaster);
    wallRun('z', 9.45, 4.15, 5.85, [], plaster);
    solid(concrete, 0.08, 1.02, 2.6, 5.85, 0.52, 8.05);
    look(metal, 0.04, 0.04, 2.4, 5.78, 1.02, 8.05);

    [[1.5, 2.4], [5.7, 6.6], [9.3, 10.2]].forEach(([a, b]) => { jamb(0.02, a); jamb(0.02, b); });
    [[0.32, 1.12], [2.1, 3.0], [4.55, 5.45], [7.2, 8.1]].forEach(([a, b]) => { jamb(1.23, a); jamb(1.23, b); });
    doorLeaf(-0.38, 1.95, 1.15);
    doorLeaf(-0.38, 6.15, 1.1);
    doorLeaf(-0.38, 9.75, 1.15);
    doorLeaf(1.62, 0.72, -1.05);
    doorLeaf(1.62, 2.55, -1.05);
    doorLeaf(1.62, 5.0, -1.1);
    doorLeaf(1.62, 7.65, -1.1);
    doorLeaf(3.75, 7.65, 1.05);

    // 1 Salon. Enter facing west: window opposite, TV on the right.
    windowOnX(-4.4, 1.4, 2.3, 2.4, 1.3);
    sofaBed(-2.2, 0.85, 1);
    sofaBed(-2.2, 3.7, -1);
    tvUnit(-1.15, 3.85);
    bedBase(-0.65, 1.55);
    woodTable(-3.85, 3.85, 0.85, 0.5);
    lamp(-2.2, 2.2, 2.2, 0xffe2b8, 1.45, 8);
    lamp(-4.1, 1.7, 2.3, 0xd7e6f2, 0.4, 5);
    solid(concrete, 0.16, 3.1, 3.6, -5.6, 1.55, 2.3);

    // 2 Yatak odası. Left on entry is south. Wardrobe sits on the door line.
    solid(wood, 1.55, 0.26, 2.0, -1.7, 0.18, 5.55);
    look(cloth, 1.4, 0.12, 1.85, -1.7, 0.36, 5.55);
    look(white, 0.5, 0.08, 0.32, -1.9, 0.46, 4.85);
    look(cloth, 1.15, 0.05, 1.0, -1.6, 0.44, 5.9);
    woodTable(-3.05, 6.55, 0.65, 0.42);
    windowOnX(-3.66, 1.35, 6.55, 0.7, 0.85);
    solid(woodOld, 0.55, 2.0, 1.2, -0.32, 1.04, 7.35);
    look(chrome, 0.03, 0.14, 0.03, -0.58, 1.05, 7.1);
    look(chrome, 0.03, 0.14, 0.03, -0.58, 1.05, 7.6);
    lamp(-1.8, 2.2, 6.2, 0xffe6c4, 1.1, 6);

    // 3 and 4. Balcony door lines up with the room door. Single bed in the corridor-side bay.
    L.cyl(poufMat, 0.3, 0.36, 2.45, 0.2, 8.2);
    L.col(2.15, 0, 7.9, 2.75, 0.38, 8.5, 'fabric');
    solid(wood, 0.5, 0.85, 0.38, 3.4, 0.46, 8.2);
    woodTable(3.2, 7.15, 0.7, 0.48);
    plasticChair(2.75, 7.15);
    plasticChair(3.6, 7.15);
    windowOnX(4.12, 1.3, 7.35, 0.85, 1.1);
    solid(cloth, 0.8, 0.26, 1.8, 1.62, 0.18, 6.95);
    look(white, 0.28, 0.07, 0.2, 1.62, 0.36, 6.2);
    solid(white, 0.4, 0.58, 0.26, 5.2, 1.15, 8.9);
    look(metal, 0.05, 0.5, 0.05, 5.2, 1.68, 8.9);
    lamp(2.7, 2.2, 8.0, 0xfff0d0, 1.15, 6);
    lamp(5.0, 2.05, 8.0, 0xd5e4ef, 0.35, 4);

    // 5. Desk opposite the door, messy bed on the right, high vent window on the left.
    woodTable(2.9, 5.05, 0.85, 0.48);
    messyBed(2.15, 4.55);
    windowOnZ(6.38, 1.95, 1.85, 0.4, 0.26);
    solid(concrete, 0.4, 0.9, 0.55, 1.85, 1.7, 6.75);
    lamp(2.2, 2.15, 5.1, 0xffe6c4, 0.85, 4.5);

    // 6. Sink opposite, cabinet above, shower head and wet floor, no cabin.
    solid(white, 0.52, 0.14, 0.4, 2.85, 0.8, 2.55);
    look(white, 0.1, 0.65, 0.1, 2.85, 0.4, 2.55);
    look(chrome, 0.04, 0.14, 0.06, 2.85, 0.95, 2.55);
    solid(white, 0.46, 0.38, 0.14, 2.85, 1.5, 2.55);
    look(glass, 0.38, 0.28, 0.01, 2.85, 1.5, 2.62);
    showerHead(1.7, 1.85, 1.85);
    floor(tileWet, 1.4, 1.65, 2.35, 2.2);
    look(metal, 0.1, 0.01, 0.1, 1.9, 0.04, 1.9);
    lamp(2.1, 2.25, 2.6, 0xf4f7fb, 1.05, 4);

    // 7. Toilet fills the closet.
    toilet(1.78, 0.85);
    lamp(1.7, 2.15, 0.7, 0xf2f2ea, 0.65, 2.2);

    // 8. Shoe box just inside the entrance, off the walk line.
    solid(card, 0.58, 0.14, 0.38, 0.32, 0.1, 0.7);
    [[0.16, 0.58, 0.2], [0.28, 0.66, -0.5], [0.4, 0.55, 0.8], [0.22, 0.74, 1.2], [0.46, 0.7, -0.7], [0.34, 0.6, 0.3], [0.18, 0.68, -0.2], [0.42, 0.64, 0.6]].forEach(([sx, sz, ry]) => {
      look(shoeMat, 0.1, 0.07, 0.22, sx, 0.2, sz, ry);
    });
    lamp(0.62, 2.25, 4.5, 0xfff1d8, 0.65, 9);

    // 9. Stove opposite the door. Fridges on the left. Empty counter beside them.
    solid(dark, 0.58, 0.1, 0.55, -3.7, 0.9, 9.75);
    solid(metal, 0.56, 0.7, 0.55, -3.7, 0.4, 9.75);
    look(dark, 0.1, 0.02, 0.1, -3.82, 0.97, 9.6);
    look(dark, 0.1, 0.02, 0.1, -3.58, 0.97, 9.9);
    solid(metal, 0.48, 0.16, 0.36, -3.7, 0.9, 9.05);
    look(white, 0.36, 0.1, 0.28, -3.7, 0.78, 9.05);
    look(chrome, 0.04, 0.12, 0.05, -3.7, 1.0, 9.05);
    fridge(-1.15, 8.7, true);
    fridge(-0.45, 8.7, false);
    solid(wood, 0.44, 0.58, 0.4, -1.85, 0.32, 8.7);
    look(woodOld, 0.38, 0.02, 0.34, -1.85, 0.4, 8.7);
    look(woodOld, 0.38, 0.02, 0.34, -1.85, 0.2, 8.7);
    burnCooler(-1.85, 0.9, 8.7);
    look(woodOld, 1.1, 0.04, 0.5, -3.55, 0.9, 8.55);
    lamp(-2.3, 2.2, 9.9, 0xffe8c8, 1.25, 6);

    G.scene.add(new THREE.HemisphereLight(0xf3efe6, 0x3c342c, 0.4));
    L.slab(concrete, -6.2, -0.05, -0.3, 7.2, -0.01, 12.6, { cast: false });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
