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

  // Room notes are the owner's words, not invented props.
  const NOTES = {
    salon: 'Salon. Karşıda boydan boya pencere. Sağda küçük televizyon. İki kirli kırmızı açık çekyat. Kapı yanında yataksız baza. Ötedeki koltuğun yanında tahta masa.',
    bed: 'Yatak odası. Solda duvara dayalı iki kişilik yatak. Ayak ucunda masa, arkasında cam. Kapı hizasında büyük dolap.',
    pouf: 'Mavi puf. Karşısında küçük dolap. Solunda balkon camının önünde plastik masa ve iki sandalye. Balkonda kombi. Koridora bakan gözde tek kişilik yatak.',
    desk: 'Çalışma masası tam karşıda. Sağda büyük dağınık yatak. Solda yukarıda havalandırmaya bakan küçük pencere. Oda küçük.',
    bath: 'Lavabo tam karşıda, üstünde küçük banyo dolabı. Diğer tarafta kabin yok, sadece duş başlığı ve duş alanı.',
    wc: 'Klozet kapının karşısında. Hareket edecek alan yok.',
    hall: 'Ayakkabı kartonu koridorda, üstünde bir sürü ayakkabı.',
    kitchen: 'İki buzdolabı solda: birinde ayakkabı, diğerinde yiyecek. Yanında sürgülü dolap, üstünde küçük burn dolabı. Tezgahın buzdolabı tarafı boş. Ocak karşıda, ortada lavabo.',
    empty: '4 anlatılmadı. Bu oda boş bırakıldı.'
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
      G.mats = await E.createMaterials(G);
      G.physics = E.createPhysics(G);
      G.input = E.createInput(G);
      const L = E.createLevelHelper(G);
      buildApartment(G, L, THREE);
      G.physics.build();
      G.player = E.createPlayer(G);
      G.player.reset({ pos: new THREE.Vector3(0.58, 0, 11.35), yaw: 0 });
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
    if (x < 0 && z >= 8.55 && z <= 12.25) return { title: '9 · Mutfak', note: NOTES.kitchen };
    if (x < 0 && z >= 3.55 && z < 8.55) return { title: '1 · Salon', note: NOTES.salon };
    if (x < 0 && z >= 0.15 && z < 3.55) return { title: '2 · Yatak odası', note: NOTES.bed };
    if (x > 1.15 && z >= 10.55 && z <= 12.25) return { title: '7 · Tuvalet', note: NOTES.wc };
    if (x > 1.15 && z >= 8.15 && z < 10.55) return { title: '6 · Banyo', note: NOTES.bath };
    if (x > 1.15 && z >= 4.95 && z < 8.15) return { title: '3 · Oda', note: NOTES.pouf };
    if (x > 1.15 && z >= 2.35 && z < 4.95) return { title: '5 · Küçük oda', note: NOTES.desk };
    if (x > 1.15 && z >= 0.15 && z < 2.35) return { title: '4 · Boş', note: NOTES.empty };
    return { title: '8 · Koridor', note: NOTES.hall };
  }

  function buildApartment(G, L, THREE) {
    const plaster = new THREE.MeshStandardMaterial({ color: 0xe7dfd2, roughness: 0.86 });
    const dirty = new THREE.MeshStandardMaterial({ color: 0xcbbfaa, roughness: 0.92 });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x8d7356, roughness: 0.9 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.78 });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x3e2a1c, roughness: 0.8 });
    const red = new THREE.MeshStandardMaterial({ color: 0x8d2b2b, roughness: 0.92 });
    const stain = new THREE.MeshStandardMaterial({ color: 0x5c2420, roughness: 0.95 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xc5e4f2, roughness: 0.08, transparent: true, opacity: 0.28 });
    const metal = new THREE.MeshStandardMaterial({ color: 0xb9b3aa, metalness: 0.7, roughness: 0.35 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.45 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x2f6fbf, roughness: 0.7 });
    const plastic = new THREE.MeshStandardMaterial({ color: 0xd7d2c8, roughness: 0.55 });
    const shoe = new THREE.MeshStandardMaterial({ color: 0x2b241c, roughness: 0.8 });
    const food = new THREE.MeshStandardMaterial({ color: 0xc45a2a, roughness: 0.6 });
    const card = new THREE.MeshStandardMaterial({ color: 0xa78455, roughness: 0.9 });
    const outside = new THREE.MeshStandardMaterial({ color: 0x9ec7ea, roughness: 1 });
    const vent = new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 1 });

    const box = (mat, w, h, d, x, y, z) => {
      L.box(mat, w, h, d, x, y, z);
      L.col(x - w / 2, y - h / 2, z - d / 2, x + w / 2, y + h / 2, z + d / 2, 'plaster');
    };
    const slab = (mat, x0, z0, x1, z1, y = 0.02) => {
      L.box(mat, x1 - x0, 0.04, z1 - z0, (x0 + x1) / 2, y, (z0 + z1) / 2, { cast: false });
    };
    const wallX = (x, z0, z1, gaps = []) => {
      const cuts = gaps.slice().sort((a, b) => a[0] - b[0]);
      let c = z0;
      for (const [a, b] of cuts) {
        if (a - c > 0.04) box(plaster, 0.12, 2.5, a - c, x, 1.25, (c + a) / 2);
        c = Math.max(c, b);
      }
      if (z1 - c > 0.04) box(plaster, 0.12, 2.5, z1 - c, x, 1.25, (c + z1) / 2);
    };
    const wallZ = (z, x0, x1, gaps = []) => {
      const cuts = gaps.slice().sort((a, b) => a[0] - b[0]);
      let c = x0;
      for (const [a, b] of cuts) {
        if (a - c > 0.04) box(plaster, a - c, 2.5, 0.12, (c + a) / 2, 1.25, z);
        c = Math.max(c, b);
      }
      if (x1 - c > 0.04) box(plaster, x1 - c, 2.5, 0.12, (c + x1) / 2, 1.25, z);
    };
    const light = (x, y, z, color, intensity) => {
      const lamp = new THREE.PointLight(color, intensity, 7, 2);
      lamp.position.set(x, y, z);
      G.scene.add(lamp);
    };
    const windowPane = (x, y, z, w, h, rotY = 0) => {
      const pane = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), glass);
      pane.position.set(x, y, z);
      pane.rotation.y = rotY;
      L.dynRoot.add(pane);
    };

    slab(floorMat, -5.5, 0.1, 5.5, 12.3, 0.02);
    slab(outside, -6.2, 3.2, -5.5, 8.8, 0.01);
    slab(dirty, 4.05, 5.3, 5.55, 7.7, 0.03);

    wallX(0, 0.15, 12.25, [[1.55, 2.4], [5.55, 6.4], [9.35, 10.2]]);
    wallX(1.15, 0.15, 12.25, [[0.7, 1.45], [3.15, 4.0], [6.15, 7.0], [8.75, 9.6], [10.95, 11.55]]);
    wallX(-5.4, 3.55, 8.55);
    wallX(-3.8, 0.15, 3.55);
    wallX(-3.4, 8.55, 12.25);
    wallX(3.3, 2.35, 4.95);
    wallX(4.0, 4.95, 8.15, [[6.15, 7.0]]);
    wallX(5.45, 5.3, 7.7);
    wallX(3.4, 0.15, 2.35);
    wallX(2.15, 10.55, 12.25);
    wallX(3.3, 8.15, 10.55);
    wallZ(0.15, -3.8, 3.4);
    wallZ(2.35, 1.15, 3.3);
    wallZ(3.55, -5.4, 0);
    wallZ(4.95, 1.15, 3.3);
    wallZ(8.15, 1.15, 4.0);
    wallZ(8.55, -5.4, 0);
    wallZ(10.55, 1.15, 2.15);
    wallZ(12.25, -3.4, 2.15, [[0.25, 1.05]]);
    wallZ(5.3, 4.0, 5.45);
    wallZ(7.7, 4.0, 5.45);
    box(plaster, 6.6, 0.12, 12.2, 0, 2.52, 6.2);

    // 1 Salon
    windowPane(-5.34, 1.45, 6.05, 0.04, 1.7, Math.PI / 2);
    box(darkWood, 0.42, 0.55, 1.3, -1.15, 0.28, 7.55);
    box(metal, 0.28, 0.16, 0.2, -1.15, 0.64, 7.55);
    box(red, 1.7, 0.42, 0.85, -2.5, 0.28, 7.7);
    box(stain, 0.7, 0.08, 0.4, -2.2, 0.5, 7.7);
    box(red, 1.7, 0.42, 0.85, -2.5, 0.28, 4.3);
    box(stain, 0.55, 0.08, 0.35, -2.8, 0.5, 4.35);
    box(wood, 0.9, 0.28, 1.9, -0.7, 0.16, 4.55);
    box(wood, 0.7, 0.74, 1.15, -3.6, 0.4, 7.55);
    light(-2.6, 2.2, 6.0, 0xffe2b8, 1.4);

    // 2 Yatak odası
    box(white, 1.5, 0.45, 2.0, -1.7, 0.28, 0.85);
    box(wood, 0.55, 0.72, 0.7, -1.7, 0.4, 2.55);
    windowPane(-1.7, 1.45, 3.48, 0.9, 1.1, 0);
    box(darkWood, 0.55, 2.05, 1.15, -0.4, 1.05, 2.7);
    light(-1.8, 2.15, 1.8, 0xfff0d2, 1.1);

    // 9 Mutfak — İki buzdolabı
    box(white, 0.7, 1.7, 0.68, -1.0, 0.88, 11.55);
    box(shoe, 0.18, 0.12, 0.28, -1.35, 0.7, 11.35);
    box(white, 0.7, 1.7, 0.68, -1.75, 0.88, 11.55);
    box(food, 0.2, 0.16, 0.22, -2.05, 1.05, 11.3);
    box(wood, 0.42, 0.7, 0.55, -2.45, 0.4, 11.15);
    box(wood, 0.4, 0.32, 0.5, -2.45, 1.55, 11.15);
    box(metal, 0.6, 0.16, 0.6, -3.05, 0.9, 10.2);
    box(white, 0.5, 0.2, 0.4, -3.05, 0.9, 9.35);
    box(dirty, 1.6, 0.9, 0.6, -3.05, 0.48, 9.7);
    light(-1.8, 2.2, 10.3, 0xfff6e8, 1.2);

    // 7 Klozet
    box(white, 0.4, 0.42, 0.55, 1.62, 0.28, 11.85);
    light(1.6, 2.1, 11.4, 0xfff6e8, 0.6);

    // 6 Lavabo and open shower
    box(white, 0.55, 0.85, 0.42, 2.7, 0.5, 9.3);
    box(white, 0.4, 0.28, 0.2, 2.7, 1.55, 9.3);
    box(metal, 0.08, 0.2, 0.08, 1.45, 1.9, 10.15);
    slab(dirty, 1.2, 9.7, 2.0, 10.45, 0.03);
    light(2.2, 2.2, 9.3, 0xfff6e8, 0.9);

    // 3 Mavi puf, balcony, single bed in the corridor alcove
    box(blue, 0.55, 0.38, 0.55, 2.3, 0.2, 6.5);
    box(darkWood, 0.4, 1.5, 0.7, 3.55, 0.78, 7.45);
    box(plastic, 0.7, 0.72, 0.5, 3.15, 0.4, 5.7);
    box(plastic, 0.35, 0.78, 0.35, 2.75, 0.4, 5.55);
    box(plastic, 0.35, 0.78, 0.35, 3.55, 0.4, 5.55);
    windowPane(3.96, 1.35, 5.85, 0.04, 1.3, Math.PI / 2);
    box(white, 0.45, 0.7, 0.28, 5.05, 0.9, 7.25);
    box(white, 0.9, 0.4, 1.9, 1.55, 0.28, 5.35);
    light(2.6, 2.2, 6.4, 0xfff0d0, 1.0);
    light(4.7, 2.1, 6.4, 0xd7e7f6, 0.45);

    // 5 Çalışma masası, messy bed, high vent window
    box(wood, 1.1, 0.74, 0.55, 2.85, 0.4, 3.65);
    box(red, 1.15, 0.4, 1.9, 2.15, 0.28, 4.35);
    box(stain, 0.4, 0.1, 0.5, 2.0, 0.5, 4.5);
    windowPane(2.2, 2.05, 2.4, 0.42, 0.28, 0);
    box(vent, 0.3, 0.5, 0.3, 2.2, 2.05, 2.15);
    light(2.2, 2.15, 3.6, 0xffe6c4, 0.7);

    // 8 Ayakkabı kartonu
    box(card, 0.7, 0.14, 0.45, 0.58, 0.1, 10.7);
    for (let i = 0; i < 7; i++) box(shoe, 0.12, 0.08, 0.22, 0.38 + (i % 4) * 0.14, 0.2, 10.58 + Math.floor(i / 4) * 0.16);

    // 4 anlatılmadı — no furniture
    light(2.2, 2.1, 1.2, 0x888078, 0.35);
    const hemi = new THREE.HemisphereLight(0xf2efe6, 0x3a3228, 0.55);
    G.scene.add(hemi);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
