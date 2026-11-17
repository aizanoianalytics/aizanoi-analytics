(() => {
  'use strict';

  const FLOOR_Y = 0.06;
  const WALL_H = 6.90;
  const RIDGE_Y = 9.50;

  // Expanded +25% factory footprint: X: 4.0..34.0 (30m wide), Z: -35.0..27.5 (62.5m long)
  const FAC_X0 = 4.0;
  const FAC_X1 = 34.0;
  const FAC_Z0 = -35.0;
  const FAC_Z1 = 27.5;
  const MID_WALL_X = 18.5;

  function makeSignTexture(THREE, title, subtitle = '', bg = '#161b20', fg = '#f2ede2', accent = '#ffb347') {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 160;
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 160);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 512, 12);
    ctx.fillRect(0, 148, 512, 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 18, 492, 124);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = subtitle ? '900 48px Impact, Arial Narrow, sans-serif' : '900 58px Impact, Arial Narrow, sans-serif';
    ctx.fillText(title, 256, subtitle ? 68 : 82, 470);
    if (subtitle) {
      ctx.fillStyle = accent;
      ctx.font = '600 24px monospace';
      ctx.fillText(subtitle, 256, 114, 460);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0.12 });
  }

  function makePidScreenTexture(THREE) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0c1218';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#384856';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, 244, 244);
    ctx.fillStyle = '#ffb347';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('CAM TEZYINAT FIRINI', 18, 34);
    const zones = [
      ['BOLGE 1 (ISITMA)', '590 C', '#ff8c42'],
      ['BOLGE 2 (TAV)', '615 C', '#ff5a36'],
      ['BOLGE 3 (SOGUMA)', '460 C', '#ffd166'],
      ['CIKIS HAVA', '165 C', '#58c4b8']
    ];
    zones.forEach(([label, temp, col], idx) => {
      const y = 68 + idx * 44;
      ctx.fillStyle = '#9aa8b6';
      ctx.font = '13px monospace';
      ctx.fillText(label, 18, y);
      ctx.fillStyle = col;
      ctx.font = 'bold 24px monospace';
      ctx.fillText(temp, 162, y + 4);
    });
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: 0xffffff,
      emissiveIntensity: 0.9,
      roughness: 0.25
    });
  }

  // Procedural Vintage Factory Tile Material (Aged Cream Ceramic Tiles + Worn Grout)
  function makeVintageTileMaterial(THREE, isFloor = false) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = isFloor ? '#4d4a44' : '#736f65';
    ctx.fillRect(0, 0, 512, 512);
    const step = isFloor ? 32 : 64;
    let seed = isFloor ? 913 : 419;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let y = 0; y < 512; y += step) {
      for (let x = 0; x < 512; x += step) {
        const v = rnd();
        if (isFloor) {
          ctx.fillStyle = v < 0.35 ? '#8d877a' : v < 0.7 ? '#9c9689' : '#7d776b';
        } else {
          ctx.fillStyle = v < 0.3 ? '#cbc4b0' : v < 0.75 ? '#d4ceb9' : '#beb6a2';
        }
        ctx.fillRect(x + 2, y + 2, step - 4, step - 4);
        if (rnd() > 0.65) {
          ctx.fillStyle = 'rgba(72, 60, 44, 0.14)';
          ctx.fillRect(x + 4, y + step - 12, step - 8, 8);
        }
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(isFloor ? 3 : 4, isFloor ? 3 : 2.5);
    tex.anisotropy = 4;
    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: isFloor ? 0.68 : 0.42,
      metalness: 0.04
    });
  }

  function addSign(THREE, parent, title, subtitle, x, y, z, w, h, ry = 0, bg, fg, accent) {
    const mat = makeSignTexture(THREE, title, subtitle, bg, fg, accent);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = false;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  function createGlassCup(THREE, glassMat, goldMat, hasGold = true) {
    const g = new THREE.Group();
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.026, 0.095, 14), glassMat);
    cup.position.y = 0.048;
    cup.castShadow = true;
    g.add(cup);
    if (hasGold) {
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.0365, 0.012, 14), goldMat);
      rim.position.y = 0.09;
      g.add(rim);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.030, 0.008, 14), goldMat);
      band.position.y = 0.045;
      g.add(band);
    }
    return g;
  }

  // Taller spacer glass used between stacked drying trays ("daha uzun bardaklar")
  function createTallSpacerGlass(THREE, glassMat, goldMat) {
    const g = new THREE.Group();
    const tallH = 0.23;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.036, tallH, 14), glassMat);
    cup.position.y = tallH / 2;
    cup.castShadow = true;
    g.add(cup);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.046, 0.016, 14), goldMat);
    rim.position.y = tallH - 0.010;
    g.add(rim);
    const baseRing = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.037, 0.022, 14), glassMat);
    baseRing.position.y = 0.011;
    g.add(baseRing);
    return g;
  }

  function buildFactoryBuilding(G, L, interactives) {
    const THREE = G.THREE;
    const geo = G.geo;
    const dyn = L.dynRoot;
    const stat = L.staticRoot;
    const updaters = L.updaters;

    const concreteExt = L.M('concrete', { triplanar: true, scale: 0.35 });
    const concreteDirty = L.M('concrete_dirty', { triplanar: true, scale: 0.35 });
    const wallIntMat = L.MI('paint_white', { triplanar: true, scale: 0.45 });
    const wallExtMat = L.M('concrete', { triplanar: true, scale: 0.35 });
    const epoxyFloor = L.MI('floor_epoxy');
    const steelDark = L.M('steel_dark');
    const steelDarkInt = L.MI('steel_dark');
    const steelGalv = L.M('steel_galv');
    const steelGalvInt = L.MI('steel_galv');
    const roofExtMat = L.M('corrugated_roof');
    const roofIntMat = L.M('corrugated_roof');
    const woodPallet = L.MI('wood_pallet');
    const woodDark = L.MI('wood_dark');
    const cardboard = L.MI('cardboard');
    const hazardMat = L.M('hazard_stripes');
    const paintYellow = L.M('paint_yellow');
    const paintBlue = L.M('paint_blue');
    const paintGrey = L.M('paint_grey');
    const paintWhite = L.M('paint_white');
    const rubberMat = L.M('rubber');
    const porcelainAged = new THREE.MeshStandardMaterial({ color: 0xe6e1d3, roughness: 0.25, metalness: 0.05 });
    const rustPipeMat = new THREE.MeshStandardMaterial({ color: 0x4b4742, roughness: 0.72, metalness: 0.65 });
    const brassGold = new THREE.MeshStandardMaterial({
      color: 0xf4c44e,
      metalness: 0.94,
      roughness: 0.16,
      envMapIntensity: 1.5
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xd9eef8,
      metalness: 0.05,
      roughness: 0.06,
      transparent: true,
      opacity: 0.42,
      clearcoat: 1.0
    });
    const frostedGlass = new THREE.MeshPhysicalMaterial({
      color: 0xd2dce0,
      roughness: 0.55,
      transparent: true,
      opacity: 0.72
    });
    const kilnGlowMat = new THREE.MeshStandardMaterial({
      color: 0xff6e24,
      emissive: 0xff5a12,
      emissiveIntensity: 3.4,
      roughness: 0.3
    });
    const ledCoolMat = L.G.mats.emissive(0xf2f7ff, 4.2);
    const ledWarmMat = L.G.mats.emissive(0xffd79a, 3.6);
    const leatherDark = new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.58 });
    const wcWallTile = makeVintageTileMaterial(THREE, false);
    const wcFloorTile = makeVintageTileMaterial(THREE, true);

    const interiorLights = [];
    function addIntLight(color, intensity, distance, x, y, z, decay = 1.8) {
      const pl = new THREE.PointLight(color, intensity, distance, decay);
      pl.position.set(x, y, z);
      dyn.add(pl);
      interiorLights.push({ light: pl, baseIntensity: intensity });
      return pl;
    }

    // ------------------------------------------------------------------------
    // 1. MAIN FACTORY FLOOR SLAB (Expanded +25%: X: 4.0..34.0, Z: -35.0..27.5)
    // ------------------------------------------------------------------------
    L.slab(concreteDirty, FAC_X0 - 0.1, -0.05, FAC_Z0 - 0.1, FAC_X1 + 0.1, FLOOR_Y - 0.02, FAC_Z1 + 0.1, { cast: false });
    L.slab(epoxyFloor, FAC_X0 + 0.05, FLOOR_Y - 0.02, FAC_Z0 + 0.05, FAC_X1 - 0.05, FLOOR_Y, FAC_Z1 - 0.05, { cast: false });
    L.col(FAC_X0, -0.4, FAC_Z0, FAC_X1, FLOOR_Y, FAC_Z1, 'concrete');

    // ------------------------------------------------------------------------
    // 2. SOLID LONGER ALL-CEMENT LOADING RAMP (NO SIDE GUARDRAILS)
    //    - Uzun rampa: X: 4.0 -> -3.4 (egim), -3.4 -> -4.8 (duz baslik), toplam 8.8m
    //    - Tamami tek tip cimento rengi (concreteExt)
    //    - Saginda solunda korumalik, korkuluk, bariyer, lastik tampon YOK!
    // ------------------------------------------------------------------------
    {
      const DOCK_H = 1.52;
      const xIn = 4.0;
      const xSlopeTop = -3.4;
      const xDockOut = -4.8;
      const slopeRun = xIn - xSlopeTop; // 7.4m slope run

      // Solid full-depth cement/concrete ramp body
      const rampShape = new THREE.Shape();
      rampShape.moveTo(xDockOut, 0.0);
      rampShape.lineTo(xIn, 0.0);
      rampShape.lineTo(xIn, FLOOR_Y);
      rampShape.lineTo(xSlopeTop, DOCK_H);
      rampShape.lineTo(xDockOut, DOCK_H);
      rampShape.closePath();

      const solidRampGeo = new THREE.ExtrudeGeometry(rampShape, {
        depth: 6.2,
        bevelEnabled: false
      });
      solidRampGeo.translate(0, 0, -3.1);
      const solidRampMesh = new THREE.Mesh(solidRampGeo, concreteExt);
      solidRampMesh.castShadow = true;
      solidRampMesh.receiveShadow = true;
      stat.add(solidRampMesh);

      // Solid outer cement dock platform collider
      L.slab(concreteExt, xDockOut, 0.0, -3.1, xSlopeTop, DOCK_H, 3.1);
      L.col(xDockOut, -0.1, -3.1, xSlopeTop, DOCK_H, 3.1, 'concrete');

      // 36 smooth stepped concrete colliders starting immediately from X=4.0 up to X=-3.4
      const steps = 36;
      const rise = DOCK_H - FLOOR_Y;
      for (let s = 0; s < steps; s++) {
        const sx1 = xIn - (slopeRun * s) / steps;
        const sx0 = xIn - (slopeRun * (s + 1)) / steps;
        const syTop = FLOOR_Y + ((s + 1) / steps) * rise;
        L.col(sx0, -0.1, -3.1, sx1, syTop, 3.1, 'concrete');
      }

      // Overhead canopy above factory doorway + loading sign
      L.slab(steelDark, 2.5, 4.35, -3.3, 4.15, 4.55, 3.3);
      L.box(ledWarmMat, 0.18, 0.10, 4.4, 3.3, 4.32, 0);
      addSign(THREE, stat, 'YUKLEME RAMPASI', 'UZUN CIMENTO SEVKIYAT RAMPASI', 3.92, 5.15, 0, 4.4, 0.95, -Math.PI / 2);
    }

    // ------------------------------------------------------------------------
    // 3. EXTERIOR WALLS, CLERESTORY WINDOWS, ROOF TRUSSES & GABLE ROOF
    // ------------------------------------------------------------------------
    function buildWindowBandWall(x0, z0, x1, z1, y0, yWin0, yWin1, yTop, axis, wallMat = wallExtMat) {
      L.slab(wallMat, x0, y0, z0, x1, yWin0, z1, { bevel: 0.01 });
      L.slab(wallMat, x0, yWin1, z0, x1, yTop, z1, { bevel: 0.01 });
      if (axis === 'z') {
        const xm = (x0 + x1) / 2;
        L.slab(glassMat, xm - 0.02, yWin0, z0, xm + 0.02, yWin1, z1, { cast: false });
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z += 3.5) {
          L.slab(steelDark, x0 - 0.02, yWin0, z - 0.06, x1 + 0.02, yWin1, z + 0.06);
        }
      } else {
        const zm = (z0 + z1) / 2;
        L.slab(glassMat, x0, yWin0, zm - 0.02, x1, yWin1, zm + 0.02, { cast: false });
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += 3.5) {
          L.slab(steelDark, x - 0.06, yWin0, z0 - 0.02, x + 0.06, yWin1, z1 + 0.02);
        }
      }
    }

    // West Exterior Wall (X: 4.0..4.32), factory sliding door open at Z: -2.6..2.6
    buildWindowBandWall(FAC_X0, FAC_Z0, FAC_X0 + 0.32, -2.6, FLOOR_Y, 4.2, 5.9, WALL_H, 'z', wallExtMat);
    buildWindowBandWall(FAC_X0, 2.6, FAC_X0 + 0.32, FAC_Z1, FLOOR_Y, 4.2, 5.9, WALL_H, 'z', wallExtMat);
    L.slab(wallExtMat, FAC_X0, 3.85, -2.6, FAC_X0 + 0.32, WALL_H, 2.6);
    L.slab(paintGrey, FAC_X0 - 0.04, FLOOR_Y, FAC_Z0, FAC_X0 + 0.02, FLOOR_Y + 1.15, -2.6);
    L.slab(paintGrey, FAC_X0 - 0.04, FLOOR_Y, 2.6, FAC_X0 + 0.02, FLOOR_Y + 1.15, FAC_Z1);
    L.slab(paintYellow, FAC_X0 - 0.04, FLOOR_Y, -2.72, FAC_X0 + 0.36, 3.90, -2.56);
    L.slab(paintYellow, FAC_X0 - 0.04, FLOOR_Y, 2.56, FAC_X0 + 0.36, 3.90, 2.72);
    L.col(FAC_X0 - 0.02, 0, FAC_Z0, FAC_X0 + 0.34, WALL_H, -2.62, 'concrete');
    L.col(FAC_X0 - 0.02, 0, 2.62, FAC_X0 + 0.34, WALL_H, FAC_Z1, 'concrete');
    L.col(FAC_X0 - 0.02, 3.85, -2.62, FAC_X0 + 0.34, WALL_H, 2.62, 'concrete');

    // North Exterior Wall (Z: -35.0..-34.68)
    buildWindowBandWall(FAC_X0, FAC_Z0, FAC_X1, FAC_Z0 + 0.32, FLOOR_Y, 4.2, 5.9, WALL_H, 'x', wallExtMat);
    L.col(FAC_X0, 0, FAC_Z0, FAC_X1, WALL_H, FAC_Z0 + 0.34, 'concrete');

    // South Exterior Wall (Z: 27.18..27.5) overlooking compact 4-post Garage
    buildWindowBandWall(FAC_X0, FAC_Z1 - 0.32, FAC_X1, FAC_Z1, FLOOR_Y, 4.2, 5.9, WALL_H, 'x', wallExtMat);
    L.col(FAC_X0, 0, FAC_Z1 - 0.34, FAC_X1, WALL_H, FAC_Z1, 'concrete');

    // East Exterior Wall (X: 33.68..34.0) with WIDE enterable WC doors (9.75..11.25 & 16.75..18.25)
    buildWindowBandWall(FAC_X1 - 0.32, FAC_Z0, FAC_X1, 9.75, FLOOR_Y, 4.2, 5.9, WALL_H, 'z', wallExtMat);
    L.slab(wallExtMat, FAC_X1 - 0.32, FLOOR_Y + 2.35, 9.75, FAC_X1, WALL_H, 11.25);
    buildWindowBandWall(FAC_X1 - 0.32, 11.25, FAC_X1, 16.75, FLOOR_Y, 4.2, 5.9, WALL_H, 'z', wallExtMat);
    L.slab(wallExtMat, FAC_X1 - 0.32, FLOOR_Y + 2.35, 16.75, FAC_X1, WALL_H, 18.25);
    buildWindowBandWall(FAC_X1 - 0.32, 18.25, FAC_X1, FAC_Z1, FLOOR_Y, 4.2, 5.9, WALL_H, 'z', wallExtMat);
    L.col(FAC_X1 - 0.34, 0, FAC_Z0, FAC_X1, WALL_H, 9.73, 'concrete');
    L.col(FAC_X1 - 0.34, FLOOR_Y + 2.35, 9.73, FAC_X1, WALL_H, 11.27, 'concrete');
    L.col(FAC_X1 - 0.34, 0, 11.27, FAC_X1, WALL_H, 16.73, 'concrete');
    L.col(FAC_X1 - 0.34, FLOOR_Y + 2.35, 16.73, FAC_X1, WALL_H, 18.27, 'concrete');
    L.col(FAC_X1 - 0.34, 0, 18.27, FAC_X1, WALL_H, FAC_Z1, 'concrete');

    // Gable ends & Skylight Pitched Roof (centered at X = 19.0)
    const centerFacX = (FAC_X0 + FAC_X1) / 2; // 19.0
    const halfSpan = 15.6;
    const roofRise = RIDGE_Y - WALL_H; // 2.60
    const roofAngle = Math.atan2(roofRise, halfSpan);
    const slopeLen = Math.hypot(halfSpan, roofRise);

    for (const gz of [FAC_Z0 + 0.16, FAC_Z1 - 0.16]) {
      const gs = new THREE.Shape();
      gs.moveTo(-15.2, WALL_H);
      gs.lineTo(0, RIDGE_Y);
      gs.lineTo(15.2, WALL_H);
      gs.closePath();
      const gGeo = new THREE.ExtrudeGeometry(gs, { depth: 0.30, bevelEnabled: false });
      gGeo.translate(centerFacX, 0, gz - 0.15);
      const gm = new THREE.Mesh(gGeo, concreteExt);
      gm.castShadow = true;
      gm.receiveShadow = true;
      stat.add(gm);
    }

    const roofBays = [
      [FAC_Z0 - 0.4, -18.0, true],
      [-18.0, -12.0, false],
      [-12.0, 5.5, true],
      [5.5, 11.5, false],
      [11.5, FAC_Z1 + 0.4, true]
    ];
    for (const [z0, z1, solid] of roofBays) {
      const lenZ = z1 - z0;
      const cz = (z0 + z1) / 2;
      for (const side of [-1, 1]) {
        const cx = centerFacX + side * (halfSpan * 0.5);
        const cy = (WALL_H + RIDGE_Y) * 0.5;
        if (solid) {
          L.box(roofExtMat, slopeLen, 0.10, lenZ, cx, cy + 0.05, cz, { r: [0, 0, -side * roofAngle] });
          L.box(roofIntMat, slopeLen, 0.06, lenZ, cx, cy - 0.03, cz, { r: [0, 0, -side * roofAngle] });
        } else {
          const eaveDx = halfSpan * 0.775;
          const eaveY = RIDGE_Y - 0.775 * roofRise;
          const skyDx = halfSpan * 0.275;
          const skyY = RIDGE_Y - 0.275 * roofRise;
          L.box(roofExtMat, slopeLen * 0.45, 0.10, lenZ, centerFacX + side * eaveDx, eaveY + 0.05, cz, { r: [0, 0, -side * roofAngle] });
          L.box(glassMat, slopeLen * 0.55, 0.04, lenZ, centerFacX + side * skyDx, skyY + 0.02, cz, { r: [0, 0, -side * roofAngle], cast: false });
        }
      }
    }

    // Steel trusses & high-bay LED lighting across the 30m x 62.5m hall
    for (let z = -31.5; z <= 24.5; z += 8.0) {
      L.ibeam(steelDarkInt, 'y', WALL_H - FLOOR_Y, FAC_X0 + 0.45, FLOOR_Y + (WALL_H - FLOOR_Y) / 2, z, { depth: 0.28, width: 0.18 });
      L.ibeam(steelDarkInt, 'y', WALL_H - FLOOR_Y, FAC_X1 - 0.45, FLOOR_Y + (WALL_H - FLOOR_Y) / 2, z, { depth: 0.28, width: 0.18 });
      L.box(steelDarkInt, slopeLen - 0.4, 0.22, 0.16, centerFacX - halfSpan * 0.48, (WALL_H + RIDGE_Y) * 0.5 - 0.15, z, { r: [0, 0, roofAngle] });
      L.box(steelDarkInt, slopeLen - 0.4, 0.22, 0.16, centerFacX + halfSpan * 0.48, (WALL_H + RIDGE_Y) * 0.5 - 0.15, z, { r: [0, 0, -roofAngle] });
      L.box(steelDarkInt, 29.0, 0.16, 0.14, centerFacX, WALL_H - 0.1, z);

      for (const lx of [11.2, 26.2]) {
        L.box(steelDarkInt, 1.5, 0.08, 0.26, lx, 6.45, z);
        L.box(ledCoolMat, 1.38, 0.04, 0.18, lx, 6.40, z, { parent: dyn });
      }
    }

    addIntLight(0xfff1dc, 22, 28, 11.2, 5.9, -24.0);
    addIntLight(0xfff1dc, 22, 28, 11.2, 5.9, -6.0);
    addIntLight(0xfff1dc, 18, 24, 11.2, 5.9, 10.0);
    addIntLight(0xffe6c4, 20, 26, 26.2, 5.9, -28.0);
    addIntLight(0xffe6c4, 20, 26, 26.2, 5.9, -6.0);
    addIntLight(0xffe6c4, 18, 24, 26.2, 5.9, 18.0);

    // ------------------------------------------------------------------------
    // 4. ORTA BÖLME DUVARI (X = 18.5) & SÜRGÜLÜ KAPILAR
    // ------------------------------------------------------------------------
    buildWindowBandWall(MID_WALL_X - 0.13, FAC_Z0 + 0.3, MID_WALL_X + 0.13, -2.6, FLOOR_Y, 3.6, 5.3, WALL_H, 'z', wallIntMat);
    buildWindowBandWall(MID_WALL_X - 0.13, 2.6, MID_WALL_X + 0.13, FAC_Z1 - 0.3, FLOOR_Y, 3.6, 5.3, WALL_H, 'z', wallIntMat);
    L.slab(wallIntMat, MID_WALL_X - 0.13, 3.85, -2.6, MID_WALL_X + 0.13, WALL_H, 2.6);
    L.slab(paintYellow, MID_WALL_X - 0.17, FLOOR_Y, -2.72, MID_WALL_X + 0.17, 3.90, -2.56);
    L.slab(paintYellow, MID_WALL_X - 0.17, FLOOR_Y, 2.56, MID_WALL_X + 0.17, 3.90, 2.72);
    L.col(MID_WALL_X - 0.17, 0, FAC_Z0, MID_WALL_X + 0.17, WALL_H, -2.62, 'concrete');
    L.col(MID_WALL_X - 0.17, 0, 2.62, MID_WALL_X + 0.17, WALL_H, FAC_Z1, 'concrete');
    L.col(MID_WALL_X - 0.17, 3.85, -2.62, MID_WALL_X + 0.17, WALL_H, 2.62, 'concrete');

    function createSlidingDoor({ name, label, x, railZ0, railZ1, closedZ, openZ, widthZ, heightY }) {
      L.box(steelDark, 0.14, 0.14, railZ1 - railZ0, x, FLOOR_Y + heightY + 0.12, (railZ0 + railZ1) / 2);

      const doorGrp = new THREE.Group();
      doorGrp.position.set(x, FLOOR_Y, openZ);
      dyn.add(doorGrp);

      const panel = new THREE.Mesh(geo.bevelBox(0.14, heightY, widthZ, 0.02), paintGrey);
      panel.position.y = heightY / 2;
      panel.castShadow = true;
      panel.receiveShadow = true;
      doorGrp.add(panel);

      const frame = new THREE.Mesh(geo.box(0.16, 0.20, widthZ + 0.04), steelDarkInt);
      frame.position.y = 0.10;
      doorGrp.add(frame);
      const stripe = new THREE.Mesh(geo.box(0.165, 0.18, widthZ - 0.1), hazardMat);
      stripe.position.y = 1.05;
      doorGrp.add(stripe);

      for (const wz of [-1.2, 0, 1.2]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.72, 0.85), glassMat);
        win.position.set(0, 2.25, wz);
        doorGrp.add(win);
      }
      for (const hz of [-widthZ * 0.42, widthZ * 0.42]) {
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.18, 12).rotateZ(Math.PI / 2), steelGalv);
        r.position.set(0, heightY + 0.08, hz);
        doorGrp.add(r);
      }

      addSign(THREE, doorGrp, label, 'SURGULU KAPI [E]', -0.10, 2.95, 0, 2.2, 0.48, -Math.PI / 2);
      addSign(THREE, doorGrp, label, 'SURGULU KAPI [E]', 0.10, 2.95, 0, 2.2, 0.48, Math.PI / 2);

      const collider = L.col(x - 0.12, FLOOR_Y, openZ - widthZ / 2, x + 0.12, FLOOR_Y + heightY, openZ + widthZ / 2, 'metal');
      let isOpen = true;
      let t = 1;

      updaters.push((dt) => {
        const target = isOpen ? 1 : 0;
        t += (target - t) * Math.min(1, dt * 4.5);
        const curZ = closedZ + (openZ - closedZ) * t;
        doorGrp.position.z = curZ;
        collider.min.z = curZ - widthZ / 2;
        collider.max.z = curZ + widthZ / 2;
      });

      interactives.push({
        id: name,
        pos: new THREE.Vector3(x, FLOOR_Y + 1.4, 0),
        range: 4.5,
        getLabel: () => isOpen ? `${label} (Kapat)` : `${label} (Ac)`,
        trigger: () => {
          isOpen = !isOpen;
          G.audio && G.audio.play && G.audio.play('impact_metal', { pos: [x, FLOOR_Y + 1.5, 0], gain: 0.45 });
          return `${label} ${isOpen ? 'acildi' : 'kapandi'}`;
        }
      });
    }

    createSlidingDoor({
      name: 'dis_surgulu_kapi',
      label: 'DIS SURGULU KAPI',
      x: 3.90,
      railZ0: -8.6,
      railZ1: 3.2,
      closedZ: 0.0,
      openZ: -5.4,
      widthZ: 5.3,
      heightY: 3.65
    });

    createSlidingDoor({
      name: 'ic_surgulu_kapi',
      label: 'IC SURGULU KAPI',
      x: MID_WALL_X - 0.28,
      railZ0: -8.6,
      railZ1: 3.2,
      closedZ: 0.0,
      openZ: -5.4,
      widthZ: 5.3,
      heightY: 3.55
    });

    // ------------------------------------------------------------------------
    // 5. SOL HOL: ÇOK SAYIDA PALET & PARKUR TIRMANIŞ KULESİ + PAKETLEME MASALARI
    //    - 45+ palet bloğu (palet üstüne palet istifleri dahil)
    //    - En alçaktan en tepeye (Y = 5.4m) zıplayarak çıkılabilir parkur düzeni!
    // ------------------------------------------------------------------------
    function addLoadedPallet(px, pz, yaw = 0, stackH = 2, baseY = FLOOR_Y, addCollider = true) {
      const grp = new THREE.Group();
      grp.position.set(px, baseY, pz);
      grp.rotation.y = yaw;
      stat.add(grp);

      const deck = new THREE.Mesh(geo.box(1.36, 0.045, 1.16), woodPallet);
      deck.position.y = 0.135;
      deck.castShadow = true;
      deck.receiveShadow = true;
      grp.add(deck);
      for (const bx of [-0.56, 0, 0.56]) {
        for (const bz of [-0.46, 0, 0.46]) {
          const block = new THREE.Mesh(geo.box(0.14, 0.11, 0.12), woodPallet);
          block.position.set(bx, 0.055, bz);
          grp.add(block);
        }
      }
      for (let tier = 0; tier < stackH; tier++) {
        for (const cx of [-0.32, 0.32]) {
          for (const cz of [-0.27, 0.27]) {
            const ctn = new THREE.Mesh(geo.bevelBox(0.58, 0.46, 0.48, 0.012), cardboard);
            ctn.position.set(cx, 0.39 + tier * 0.47, cz);
            ctn.rotation.y = ((tier + cx) % 2) * 0.02;
            ctn.castShadow = true;
            ctn.receiveShadow = true;
            grp.add(ctn);
          }
        }
      }
      const wrap = new THREE.Mesh(
        new THREE.BoxGeometry(1.26, stackH * 0.46, 1.06),
        new THREE.MeshPhysicalMaterial({ color: 0xeaf4fa, transparent: true, opacity: 0.16, roughness: 0.12 })
      );
      wrap.position.y = 0.16 + stackH * 0.23;
      grp.add(wrap);

      const topY = baseY + 0.16 + stackH * 0.47;
      if (addCollider) {
        L.col(px - 0.69, FLOOR_Y, pz - 0.59, px + 0.69, topY, pz + 0.59, 'wood');
      }
      return topY;
    }

    // Helper: stack N wooden pallets vertically with a single grounded collider (prevents mid-air ceiling bonks)
    function addPalletTower(px, pz, yaw, tierList) {
      let curY = FLOOR_Y;
      for (const t of tierList) {
        curY = addLoadedPallet(px, pz, yaw, t, curY, false);
      }
      L.col(px - 0.69, FLOOR_Y, pz - 0.59, px + 0.69, curY, pz + 0.59, 'wood');
      return curY;
    }

    // Row 1 (West Wall side, X = 5.4): Stepped climbable parkour chain rising South->North
    // Top heights: 0.69 -> 1.16 -> 1.63 -> 2.10 -> 2.73 -> 3.36 -> 3.99 -> 4.62 -> 5.25 -> 5.25 -> 4.62 -> 3.99
    addPalletTower(5.4, -4.6, 0.02, [1]);            // 0.69m (entry step right beside door)
    addPalletTower(5.4, -6.5, -0.02, [2]);           // 1.16m
    addPalletTower(5.4, -8.4, 0.03, [3]);            // 1.63m
    addPalletTower(5.4, -10.3, -0.01, [2, 1]);       // 2.26m (2 pallets stacked)
    addPalletTower(5.4, -12.2, 0.02, [2, 2]);        // 2.89m
    addPalletTower(5.4, -14.1, -0.03, [2, 3]);       // 3.52m
    addPalletTower(5.4, -16.0, 0.01, [2, 2, 2]);     // 3.36m (3 pallets stacked)
    addPalletTower(5.4, -17.9, -0.02, [2, 2, 3]);    // 3.83m
    addPalletTower(5.4, -19.8, 0.02, [3, 3, 2]);     // 4.30m
    addPalletTower(5.4, -21.7, -0.01, [3, 3, 3]);    // 4.77m
    addPalletTower(5.4, -23.6, 0.03, [3, 3, 2, 2]);  // 5.40m (PEAK 4-PALLET TOWER!)
    addPalletTower(5.4, -25.5, -0.02, [3, 3, 3]);    // 4.77m
    addPalletTower(5.4, -27.4, 0.02, [2, 2, 2]);     // 3.36m
    addPalletTower(5.4, -29.3, -0.03, [2, 2]);       // 2.26m
    addPalletTower(5.4, -31.2, 0.01, [3]);           // 1.63m
    addPalletTower(5.4, -33.1, 0.0, [2]);            // 1.16m

    // Row 2 (X = 7.45): Cross-jumpable stepped stacks connecting to Row 1 and Row 3
    addPalletTower(7.45, -5.4, -0.02, [1]);          // 0.69m
    addPalletTower(7.45, -7.4, 0.03, [2]);           // 1.16m
    addPalletTower(7.45, -9.4, -0.01, [3]);          // 1.63m
    addPalletTower(7.45, -11.4, 0.02, [2, 2]);       // 2.89m
    addPalletTower(7.45, -13.4, -0.02, [3, 2]);      // 3.36m
    addPalletTower(7.45, -15.4, 0.01, [2, 2, 2]);    // 4.15m
    addPalletTower(7.45, -17.4, -0.03, [3, 2, 2]);   // 4.62m
    addPalletTower(7.45, -19.4, 0.02, [2, 3, 2]);    // 4.62m
    addPalletTower(7.45, -21.4, -0.01, [2, 2, 2]);   // 4.15m
    addPalletTower(7.45, -23.4, 0.02, [2, 3]);       // 3.52m
    addPalletTower(7.45, -25.4, -0.02, [2, 2]);      // 2.89m
    addPalletTower(7.45, -27.4, 0.03, [3]);          // 1.63m
    addPalletTower(7.45, -29.4, -0.01, [2]);         // 1.16m
    addPalletTower(7.45, -31.4, 0.02, [2]);          // 1.16m
    addPalletTower(7.45, -33.3, -0.02, [1]);         // 0.69m

    // Row 3 (X = 9.55): Additional pallet storage stacks & stepping blocks
    addPalletTower(9.55, -6.4, 0.01, [1]);
    addPalletTower(9.55, -8.8, -0.02, [2]);
    addPalletTower(9.55, -11.2, 0.02, [3]);
    addPalletTower(9.55, -13.8, -0.01, [2, 2]);
    addPalletTower(9.55, -16.4, 0.03, [2, 3]);
    addPalletTower(9.55, -19.0, -0.02, [3, 2]);
    addPalletTower(9.55, -21.6, 0.02, [2, 2]);
    addPalletTower(9.55, -24.2, -0.01, [3]);
    addPalletTower(9.55, -26.8, 0.02, [2]);
    addPalletTower(9.55, -29.4, -0.03, [2]);
    addPalletTower(9.55, -32.2, 0.01, [1]);

    // Extra pallets near North packing area & South approach (total 48+ pallet towers / 65+ wooden pallet units)
    addPalletTower(11.6, -28.0, 0.02, [2]);
    addPalletTower(11.6, -25.6, -0.02, [1]);
    addPalletTower(14.0, -28.5, 0.03, [2]);
    addPalletTower(14.0, -26.2, -0.01, [1]);
    // Stepped pallets on South side leading onto the Office/Mutfak mezzanine roof (Y = 3.46m at Z = 12.5)!
    addPalletTower(5.4, 6.2, 0.02, [1]);             // 0.69m
    addPalletTower(5.4, 8.1, -0.02, [2]);            // 1.16m
    addPalletTower(5.4, 10.0, 0.01, [2, 1]);         // 2.26m
    addPalletTower(5.4, 11.7, 0.0, [2, 2]);          // 2.89m -> jump right onto Office roof (3.46m)!

    // 2 Larger Industrial Packing Tables (2.4m wide x 5.6m long each) in expanded Sol Hol
    function buildPackingTable(tx, tz, idx) {
      const tw = 2.40, tl = 5.6, th = 0.90;
      L.box(woodPallet, tw, 0.06, tl, tx, FLOOR_Y + th, tz, { bevel: 0.01 });
      L.box(steelDarkInt, tw - 0.1, 0.06, tl - 0.1, tx, FLOOR_Y + th - 0.05, tz);
      for (const lx of [tx - 1.05, tx + 1.05]) {
        for (const lz of [tz - 2.5, tz, tz + 2.5]) {
          L.box(steelDarkInt, 0.08, th, 0.08, lx, FLOOR_Y + th * 0.5, lz);
        }
      }
      L.cyl(new THREE.MeshStandardMaterial({ color: 0x89c4e1, transparent: true, opacity: 0.65, roughness: 0.2 }), 0.24, 1.25, tx - 0.4, FLOOR_Y + th + 0.32, tz - 1.8, { axis: 'x' });
      L.box(paintBlue, 0.52, 0.08, 0.52, tx + 0.45, FLOOR_Y + th + 0.06, tz - 1.1);
      L.box(cardboard, 0.56, 0.40, 0.46, tx + 0.35, FLOOR_Y + th + 0.23, tz + 0.2);
      L.box(cardboard, 0.56, 0.40, 0.46, tx - 0.40, FLOOR_Y + th + 0.23, tz + 1.2);
      L.box(cardboard, 0.56, 0.40, 0.46, tx + 0.35, FLOOR_Y + th + 0.23, tz + 2.0);
      for (let gx = -0.26; gx <= 0.26; gx += 0.13) {
        for (let gz = -0.18; gz <= 0.18; gz += 0.12) {
          const cup = createGlassCup(THREE, glassMat, brassGold, true);
          cup.position.set(tx - 0.35 + gx, FLOOR_Y + th + 0.03, tz - 0.35 + gz);
          stat.add(cup);
        }
      }
      addSign(THREE, stat, `PAKETLEME MASASI ${idx}`, 'BUYUK SEVK HAZIRLIK MASASI', tx, FLOOR_Y + 2.35, tz, 2.3, 0.48, -Math.PI / 2);
      // Clean table top collider so player can jump onto packing tables (#14)
      L.col(tx - tw / 2, FLOOR_Y, tz - tl / 2, tx + tw / 2, FLOOR_Y + th + 0.04, tz + tl / 2, 'wood');
    }
    buildPackingTable(14.4, -19.2, 1);
    buildPackingTable(14.4, -9.8, 2);

    // ------------------------------------------------------------------------
    // 6. SOL HOL ALT BÖLÜM: OFİS 1, OFİS 2 (BİLGİSAYARLI) & MUTFAK
    //    Expanded footprint: X: 4.3..18.35, Z: 12.5..27.2
    // ------------------------------------------------------------------------
    function createHingedDoor(id, label, hx, hz, width, axis, openAngle = 1.45, mat = woodDark, startOpen = true) {
      const doorH = 2.22;
      const pivot = new THREE.Group();
      pivot.position.set(hx, FLOOR_Y, hz);
      dyn.add(pivot);

      const leaf = new THREE.Mesh(
        geo.bevelBox(axis === 'x' ? width : 0.06, doorH, axis === 'z' ? width : 0.06, 0.01),
        mat
      );
      leaf.position.set(axis === 'x' ? width / 2 : 0, doorH / 2, axis === 'z' ? width / 2 : 0);
      leaf.castShadow = true;
      pivot.add(leaf);

      const handle = new THREE.Mesh(geo.box(0.06, 0.04, 0.12), brassGold);
      handle.position.set(axis === 'x' ? width * 0.85 : 0.04, 1.02, axis === 'z' ? width * 0.85 : 0.04);
      pivot.add(handle);

      const cx = hx + (axis === 'x' ? width / 2 : 0);
      const cz = hz + (axis === 'z' ? width / 2 : 0);
      const col = L.col(
        cx - (axis === 'x' ? width / 2 : 0.08),
        FLOOR_Y,
        cz - (axis === 'z' ? width / 2 : 0.08),
        cx + (axis === 'x' ? width / 2 : 0.08),
        FLOOR_Y + doorH,
        cz + (axis === 'z' ? width / 2 : 0.08),
        'wood'
      );

      let isOpen = startOpen;
      let curA = isOpen ? openAngle : 0;
      pivot.rotation.y = curA;

      const syncCol = () => {
        if (Math.abs(curA) > 0.35) {
          col.min.y = -50;
          col.max.y = -49;
        } else {
          col.min.y = FLOOR_Y;
          col.max.y = FLOOR_Y + doorH;
        }
      };
      syncCol();

      updaters.push((dt) => {
        const target = isOpen ? openAngle : 0;
        curA += (target - curA) * Math.min(1, dt * 6);
        pivot.rotation.y = curA;
        syncCol();
      });

      interactives.push({
        id,
        pos: new THREE.Vector3(cx, FLOOR_Y + 1.2, cz),
        range: 3.0,
        getLabel: () => isOpen ? `${label} (Kapat)` : `${label} (Ac)`,
        trigger: () => {
          isOpen = !isOpen;
          G.audio && G.audio.play && G.audio.play('impact_wood', { pos: [cx, FLOOR_Y + 1.1, cz], gain: 0.45 });
          return `${label} ${isOpen ? 'acildi' : 'kapandi'}`;
        }
      });
    }

    const offZ0 = 12.5;
    const offZMid = 19.8;
    const offZ1 = 27.15;
    const offXMid = 11.8;
    const offXMax = 18.35;
    const ceilY0 = FLOOR_Y + 3.20;
    const ceilY1 = FLOOR_Y + 3.40;
    L.slab(wallIntMat, 4.3, ceilY0, offZ0, offXMax, ceilY1, offZ1);
    L.col(4.3, ceilY0, offZ0, offXMax, ceilY1, offZ1, 'concrete');

    // Ofis & Mutfak Üstü — eski pis yatak/döşek ve eşya yığını (hepsi üstüne çıkılabilir!)
    {
      const dirtyMattressMat = new THREE.MeshStandardMaterial({ color: 0x877b68, roughness: 0.94 });
      const dirtyBlanketMat = new THREE.MeshStandardMaterial({ color: 0x4f4338, roughness: 0.92 });
      const dirtyPillowMat = new THREE.MeshStandardMaterial({ color: 0x9b8f74, roughness: 0.9 });
      const stainPatchMat = new THREE.MeshStandardMaterial({ color: 0x524533, roughness: 0.96 });
      L.box(dirtyMattressMat, 1.35, 0.20, 2.10, 8.2, ceilY1 + 0.10, 17.5, { r: [0, 0.16, 0], bevel: 0.04 });
      L.box(stainPatchMat, 0.55, 0.02, 0.72, 8.3, ceilY1 + 0.205, 17.3, { r: [0, 0.12, 0] });
      L.box(dirtyBlanketMat, 1.18, 0.11, 1.25, 8.05, ceilY1 + 0.24, 17.85, { r: [0.04, 0.22, -0.03], bevel: 0.03 });
      L.box(dirtyPillowMat, 0.68, 0.12, 0.42, 8.38, ceilY1 + 0.26, 16.68, { r: [0.05, 0.10, 0], bevel: 0.03 });
      L.col(7.4, ceilY1, 16.3, 9.0, ceilY1 + 0.25, 18.7, 'wood');

      L.cyl(dirtyBlanketMat, 0.16, 1.95, 10.8, ceilY1 + 0.16, 15.6, { axis: 'x', r: [0, 0.25, Math.PI / 2] });
      L.box(cardboard, 0.85, 0.42, 0.75, 12.8, ceilY1 + 0.21, 20.5, { r: [0, 0.35, 0] });
      L.col(12.3, ceilY1, 20.0, 13.3, ceilY1 + 0.42, 21.0, 'wood');
      L.box(cardboard, 0.72, 0.22, 0.65, 13.4, ceilY1 + 0.11, 21.8, { r: [0, -0.4, 0.12] });
      L.box(paintBlue, 0.55, 0.35, 0.42, 14.5, ceilY1 + 0.175, 17.2, { r: [0, 0.6, 0] });
      L.cyl(rustPipeMat, 0.18, 0.38, 11.8, ceilY1 + 0.19, 23.0);
    }

    // North wall of Ofis 1 (Z = 12.5), WIDE doorway X: 7.4..8.9
    buildWindowBandWall(4.3, offZ0 - 0.08, 7.4, offZ0 + 0.10, FLOOR_Y, FLOOR_Y + 1.15, FLOOR_Y + 2.30, ceilY0, 'x', wallIntMat);
    L.slab(wallIntMat, 7.4, FLOOR_Y + 2.25, offZ0 - 0.08, 8.9, ceilY0, offZ0 + 0.10);
    buildWindowBandWall(8.9, offZ0 - 0.08, offXMid, offZ0 + 0.10, FLOOR_Y, FLOOR_Y + 1.15, FLOOR_Y + 2.30, ceilY0, 'x', wallIntMat);
    L.col(4.3, FLOOR_Y, offZ0 - 0.10, 7.38, ceilY0, offZ0 + 0.12, 'concrete');
    L.col(8.92, FLOOR_Y, offZ0 - 0.10, offXMid, ceilY0, offZ0 + 0.12, 'concrete');
    L.col(7.38, FLOOR_Y + 2.25, offZ0 - 0.10, 8.92, ceilY0, offZ0 + 0.12, 'concrete');
    createHingedDoor('ofis1_kapi', 'Ofis 1 Kapisi', 7.4, offZ0, 1.46, 'x', -1.45);
    addSign(THREE, stat, 'OFIS 1', 'IDARI & PLANLAMA', 10.25, FLOOR_Y + 2.65, offZ0 - 0.12, 1.4, 0.36, Math.PI);

    // North wall of Mutfak (Z = 12.5), WIDE doorway X: 14.2..15.7
    buildWindowBandWall(offXMid, offZ0 - 0.08, 14.2, offZ0 + 0.10, FLOOR_Y, FLOOR_Y + 1.15, FLOOR_Y + 2.30, ceilY0, 'x', wallIntMat);
    L.slab(wallIntMat, 14.2, FLOOR_Y + 2.25, offZ0 - 0.08, 15.7, ceilY0, offZ0 + 0.10);
    buildWindowBandWall(15.7, offZ0 - 0.08, offXMax, offZ0 + 0.10, FLOOR_Y, FLOOR_Y + 1.15, FLOOR_Y + 2.30, ceilY0, 'x', wallIntMat);
    L.col(offXMid, FLOOR_Y, offZ0 - 0.10, 14.18, ceilY0, offZ0 + 0.12, 'concrete');
    L.col(15.72, FLOOR_Y, offZ0 - 0.10, offXMax, ceilY0, offZ0 + 0.12, 'concrete');
    L.col(14.18, FLOOR_Y + 2.25, offZ0 - 0.10, 15.72, ceilY0, offZ0 + 0.12, 'concrete');
    createHingedDoor('mutfak_kapi', 'Mutfak Kapisi', 14.2, offZ0, 1.46, 'x', -1.45);
    addSign(THREE, stat, 'MUTFAK', 'YEMEK & DINLENME', 17.1, FLOOR_Y + 2.65, offZ0 - 0.12, 1.4, 0.36, Math.PI);

    // Shared wall between Offices & Mutfak (X = 11.8)
    L.slab(wallIntMat, offXMid - 0.08, FLOOR_Y, offZ0, offXMid + 0.08, ceilY0, offZ1);
    L.col(offXMid - 0.10, FLOOR_Y, offZ0, offXMid + 0.10, ceilY0, offZ1, 'concrete');

    // Shared wall between Ofis 1 and Ofis 2 (Z = 19.8), WIDE connecting doorway X: 7.4..8.9
    L.slab(wallIntMat, 4.3, FLOOR_Y, offZMid - 0.08, 7.4, ceilY0, offZMid + 0.08);
    L.slab(wallIntMat, 7.4, FLOOR_Y + 2.25, offZMid - 0.08, 8.9, ceilY0, offZMid + 0.08);
    L.slab(wallIntMat, 8.9, FLOOR_Y, offZMid - 0.08, offXMid, ceilY0, offZMid + 0.08);
    L.col(4.3, FLOOR_Y, offZMid - 0.10, 7.38, ceilY0, offZMid + 0.10, 'concrete');
    L.col(8.92, FLOOR_Y, offZMid - 0.10, offXMid, ceilY0, offZMid + 0.10, 'concrete');
    L.col(7.38, FLOOR_Y + 2.25, offZMid - 0.10, 8.92, ceilY0, offZMid + 0.10, 'concrete');
    createHingedDoor('ofis2_ara_kapi', 'Ofis 1-2 Ara Kapisi', 7.4, offZMid, 1.46, 'x', 1.45);
    addSign(THREE, stat, 'OFIS 2', 'YONETIM & SHOWROOM', 10.25, FLOOR_Y + 2.55, offZMid - 0.12, 1.3, 0.34, Math.PI);

    // Helper: Full Desktop Computer Set (Monitor + Glowing Screen + PC Tower Case + Keyboard & Mouse)
    const pcScrMat = L.G.mats.emissive(0x6eb6ff, 1.4);
    function addDesktopComputer(mx, my, mz) {
      L.box(steelDarkInt, 0.05, 0.38, 0.64, mx, my + 0.31, mz + 0.05);
      L.box(pcScrMat, 0.04, 0.33, 0.58, mx - 0.03, my + 0.31, mz + 0.05);
      L.box(steelDarkInt, 0.14, 0.14, 0.14, mx, my + 0.09, mz + 0.05);
      // PC Tower Case beside monitor
      L.box(steelDarkInt, 0.44, 0.46, 0.22, mx - 0.06, my + 0.26, mz - 0.68, { bevel: 0.01 });
      L.box(ledCoolMat, 0.02, 0.28, 0.03, mx - 0.29, my + 0.28, mz - 0.68, { parent: dyn });
      // Keyboard & Mouse
      L.box(steelDarkInt, 0.16, 0.02, 0.44, mx - 0.28, my + 0.04, mz + 0.05);
      L.box(steelDarkInt, 0.11, 0.02, 0.07, mx - 0.28, my + 0.04, mz + 0.38);
    }

    // Ofis 1 Interior (Z: 12.5..19.8)
    {
      L.box(ledWarmMat, 1.2, 0.04, 0.5, 8.0, ceilY0 - 0.05, 16.2, { parent: dyn });
      addIntLight(0xffebd0, 7.5, 11.0, 8.0, ceilY0 - 0.3, 16.2);

      // Desk (X: 5.15..6.08, Z: 15.2..17.2)
      L.box(woodDark, 0.86, 0.05, 1.95, 5.62, FLOOR_Y + 0.76, 16.2);
      L.box(steelDarkInt, 0.06, 0.74, 1.85, 6.00, FLOOR_Y + 0.37, 16.2);
      L.box(steelDarkInt, 0.80, 0.74, 0.06, 5.62, FLOOR_Y + 0.37, 15.28);
      L.box(steelDarkInt, 0.80, 0.74, 0.06, 5.62, FLOOR_Y + 0.37, 17.12);
      L.col(5.15, FLOOR_Y, 15.2, 6.08, FLOOR_Y + 0.80, 17.2, 'wood');

      addDesktopComputer(5.68, FLOOR_Y + 0.76, 16.2);

      // Climbable Swivel Chair backed against West wall
      L.box(leatherDark, 0.50, 0.10, 0.52, 4.78, FLOOR_Y + 0.46, 16.2);
      L.box(leatherDark, 0.08, 0.64, 0.50, 4.55, FLOOR_Y + 0.78, 16.2);
      L.cyl(steelDarkInt, 0.04, 0.42, 4.78, FLOOR_Y + 0.21, 16.2);
      L.col(4.50, FLOOR_Y, 15.92, 5.06, FLOOR_Y + 0.52, 16.48, 'wood');

      // Climbable Filing cabinet against East partition wall
      L.box(paintGrey, 0.55, 1.35, 0.65, 11.3, FLOOR_Y + 0.68, 18.2);
      L.col(11.0, FLOOR_Y, 17.85, 11.65, FLOOR_Y + 1.36, 18.55, 'metal');
    }

    // Ofis 2 Interior (Z: 19.8..27.15) — NOW WITH COMPUTER (#9) + Climbable Furniture (#14)
    {
      L.box(ledWarmMat, 1.2, 0.04, 0.5, 8.0, ceilY0 - 0.05, 23.5, { parent: dyn });
      addIntLight(0xffe4bd, 8.0, 11.5, 8.0, ceilY0 - 0.3, 23.5);

      // Larger Executive Desk (X: 5.12..6.18, Z: 22.3..24.7)
      L.box(woodDark, 1.02, 0.06, 2.38, 5.65, FLOOR_Y + 0.76, 23.5);
      L.box(woodDark, 0.92, 0.74, 2.28, 5.65, FLOOR_Y + 0.37, 23.5);
      L.col(5.12, FLOOR_Y, 22.3, 6.18, FLOOR_Y + 0.80, 24.7, 'wood');

      // Desktop Computer inside Ofis 2 (#9)!
      addDesktopComputer(5.74, FLOOR_Y + 0.76, 23.5);

      // Executive chair backed against West wall
      L.box(leatherDark, 0.54, 0.12, 0.56, 4.76, FLOOR_Y + 0.48, 23.5);
      L.box(leatherDark, 0.10, 0.74, 0.54, 4.52, FLOOR_Y + 0.85, 23.5);
      L.col(4.46, FLOOR_Y, 23.20, 5.06, FLOOR_Y + 0.55, 23.80, 'wood');

      // Two Single Armchairs directly in front of the executive desk
      for (const az of [22.85, 24.15]) {
        L.box(leatherDark, 0.66, 0.40, 0.68, 6.82, FLOOR_Y + 0.20, az, { bevel: 0.02 });
        L.box(leatherDark, 0.14, 0.48, 0.68, 7.10, FLOOR_Y + 0.58, az, { bevel: 0.02 });
        L.box(leatherDark, 0.64, 0.24, 0.10, 6.82, FLOOR_Y + 0.50, az - 0.29);
        L.box(leatherDark, 0.64, 0.24, 0.10, 6.82, FLOOR_Y + 0.50, az + 0.29);
        L.col(6.45, FLOOR_Y, az - 0.36, 7.22, FLOOR_Y + 0.45, az + 0.36, 'wood');
      }

      // Sofa 1 along South wall
      L.box(leatherDark, 2.05, 0.42, 0.82, 9.1, FLOOR_Y + 0.21, 26.5, { bevel: 0.02 });
      L.box(leatherDark, 2.05, 0.46, 0.16, 9.1, FLOOR_Y + 0.60, 26.85, { bevel: 0.02 });
      L.col(8.05, FLOOR_Y, 26.05, 10.15, FLOOR_Y + 0.45, 26.95, 'wood');

      // Sofa 2 along East wall
      L.box(leatherDark, 0.82, 0.42, 2.05, 11.15, FLOOR_Y + 0.21, 23.5, { bevel: 0.02 });
      L.box(leatherDark, 0.16, 0.46, 2.05, 11.50, FLOOR_Y + 0.60, 23.5, { bevel: 0.02 });
      L.col(10.70, FLOOR_Y, 22.45, 11.60, FLOOR_Y + 0.45, 24.55, 'wood');

      // Center Coffee Table between the two sofas
      L.box(woodDark, 1.05, 0.05, 1.05, 9.4, FLOOR_Y + 0.46, 24.4, { bevel: 0.01 });
      L.box(steelDarkInt, 0.85, 0.44, 0.85, 9.4, FLOOR_Y + 0.22, 24.4);
      L.col(8.85, FLOOR_Y, 23.85, 9.95, FLOOR_Y + 0.50, 24.95, 'wood');

      // Display Vitrine tucked on North-West wall
      L.box(woodDark, 1.5, 0.45, 0.50, 5.25, FLOOR_Y + 0.22, 20.4);
      L.box(glassMat, 1.46, 1.55, 0.46, 5.25, FLOOR_Y + 1.22, 20.4, { cast: false });
      L.box(ledWarmMat, 1.3, 0.03, 0.28, 5.25, FLOOR_Y + 1.96, 20.4, { parent: dyn });
      for (const sy of [FLOOR_Y + 0.72, FLOOR_Y + 1.28]) {
        L.box(glassMat, 1.38, 0.02, 0.38, 5.25, sy, 20.4, { cast: false });
        for (let sx = 4.7; sx <= 5.8; sx += 0.22) {
          const cup = createGlassCup(THREE, glassMat, brassGold, true);
          cup.position.set(sx, sy + 0.015, 20.4);
          stat.add(cup);
        }
      }
      L.col(4.48, FLOOR_Y, 20.12, 6.02, FLOOR_Y + 2.0, 20.68, 'wood');
    }

    // Mutfak Interior (X: 11.8..18.35, Z: 12.5..27.15)
    {
      L.box(ledCoolMat, 1.2, 0.04, 0.45, 15.0, ceilY0 - 0.05, 19.5, { parent: dyn });
      addIntLight(0xfff4e0, 8.0, 11.5, 15.0, ceilY0 - 0.3, 19.5);

      const fridgeMat = L.MI('steel_bare');
      L.box(fridgeMat, 0.84, 2.02, 0.84, 17.82, FLOOR_Y + 1.01, 16.5, { bevel: 0.02 });
      L.box(steelDarkInt, 0.03, 1.96, 0.04, 17.39, FLOOR_Y + 1.01, 16.5);
      L.col(17.36, FLOOR_Y, 16.05, 18.28, FLOOR_Y + 2.05, 16.95, 'metal');

      L.box(paintWhite, 0.72, 0.88, 2.8, 17.85, FLOOR_Y + 0.44, 19.4);
      L.box(steelGalvInt, 0.74, 0.04, 2.82, 17.85, FLOOR_Y + 0.90, 19.4);
      L.box(steelDarkInt, 0.48, 0.06, 0.62, 17.82, FLOOR_Y + 0.91, 19.4);
      L.cyl(steelGalvInt, 0.018, 0.28, 18.04, FLOOR_Y + 1.06, 19.4);
      L.cyl(steelGalvInt, 0.016, 0.16, 17.96, FLOOR_Y + 1.18, 19.4, { axis: 'x' });
      L.box(glassMat, 0.03, 0.74, 0.92, 18.22, FLOOR_Y + 1.55, 19.4, { cast: false });
      L.cyl(paintBlue, 0.04, 0.14, 17.98, FLOOR_Y + 0.99, 19.85);
      L.box(paintWhite, 0.04, 0.48, 0.30, 18.20, FLOOR_Y + 1.25, 18.65);
      L.col(17.46, FLOOR_Y, 17.95, 18.28, FLOOR_Y + 0.95, 20.85, 'wood');

      const lpgTankMat = new THREE.MeshStandardMaterial({ color: 0x3f6e94, roughness: 0.45, metalness: 0.35 });
      const lpgX = 17.65, lpgZ = 22.4;
      L.cyl(lpgTankMat, 0.21, 0.62, lpgX, FLOOR_Y + 0.31, lpgZ);
      L.cyl(lpgTankMat, 0.16, 0.16, lpgX, FLOOR_Y + 0.68, lpgZ, { open: true });
      L.cyl(brassGold, 0.025, 0.08, lpgX, FLOOR_Y + 0.65, lpgZ);
      L.col(lpgX - 0.25, FLOOR_Y, lpgZ - 0.25, lpgX + 0.25, FLOOR_Y + 0.80, lpgZ + 0.25, 'metal');

      const potX = 17.55, potZ = 23.95;
      L.box(steelDarkInt, 0.78, 0.34, 0.78, potX, FLOOR_Y + 0.17, potZ);
      L.cyl(L.G.mats.emissive(0x389bff, 2.2), 0.22, 0.04, potX, FLOOR_Y + 0.36, potZ, { parent: dyn });
      L.box(rubberMat, 0.03, 0.03, 1.3, potX, FLOOR_Y + 0.22, (lpgZ + potZ) / 2);
      const kazanMat = L.MI('aluminium');
      L.cyl(kazanMat, 0.37, 0.48, potX, FLOOR_Y + 0.62, potZ, { seg: 20 });
      L.cyl(kazanMat, 0.38, 0.05, potX, FLOOR_Y + 0.88, potZ, { seg: 20 });
      L.box(steelDarkInt, 0.16, 0.05, 0.06, potX, FLOOR_Y + 0.93, potZ);
      L.box(steelDarkInt, 0.08, 0.04, 0.14, potX - 0.40, FLOOR_Y + 0.72, potZ);
      L.box(steelDarkInt, 0.08, 0.04, 0.14, potX + 0.40, FLOOR_Y + 0.72, potZ);
      L.col(potX - 0.45, FLOOR_Y, potZ - 0.45, potX + 0.45, FLOOR_Y + 0.96, potZ + 0.45, 'metal');

      // Staff Dining Table & 4 Climbable Chairs
      L.box(woodPallet, 1.15, 0.05, 1.85, 14.3, FLOOR_Y + 0.75, 20.0);
      L.box(steelDarkInt, 0.06, 0.74, 0.06, 13.8, FLOOR_Y + 0.37, 19.2);
      L.box(steelDarkInt, 0.06, 0.74, 0.06, 14.8, FLOOR_Y + 0.37, 19.2);
      L.box(steelDarkInt, 0.06, 0.74, 0.06, 13.8, FLOOR_Y + 0.37, 20.8);
      L.box(steelDarkInt, 0.06, 0.74, 0.06, 14.8, FLOOR_Y + 0.37, 20.8);
      L.col(13.7, FLOOR_Y, 19.05, 14.9, FLOOR_Y + 0.80, 20.95, 'wood');
      for (const [cx, cz] of [[13.35, 19.6], [13.35, 20.4], [15.25, 19.6], [15.25, 20.4]]) {
        L.box(paintGrey, 0.42, 0.05, 0.42, cx, FLOOR_Y + 0.45, cz);
        L.box(steelDarkInt, 0.38, 0.44, 0.38, cx, FLOOR_Y + 0.22, cz);
        L.col(cx - 0.22, FLOOR_Y, cz - 0.22, cx + 0.22, FLOOR_Y + 0.48, cz + 0.22, 'metal');
      }
    }

    // ------------------------------------------------------------------------
    // 7. SAĞ HOL ÜST: BARDAK YALDIZ TEZGAHLARI & ÜST ÜSTE TEPSİ SİSTEMİ
    //    - #6: Sandalyeler yatay çarkların DİĞER (Kuzey/Arka) tarafında ve
    //          arka alana yanlardan rahatça geçilebilir!
    //    - #7: Uzun büyük kurutma standı YOK; yerine bir sürü üst üste TEPSİ var
    //          ve tepsileri bir altındakinden ayıran sistem DAHA UZUN BARDAKLAR!
    // ------------------------------------------------------------------------
    const horizontalSpindles = [];
    let turntableSpeed = 1.0;
    {
      const benchZ = -29.8; // Leaves 4.5m open rear corridor (Z: -34.7..-30.5) & wide side aisles!
      const benchX = 26.0;  // X: 20.6..31.4 (1.9m West aisle, 2.3m East aisle)
      L.box(woodDark, 10.8, 0.06, 1.35, benchX, FLOOR_Y + 0.86, benchZ, { bevel: 0.01 });
      L.box(steelDarkInt, 10.6, 0.82, 1.15, benchX, FLOOR_Y + 0.41, benchZ);
      L.col(benchX - 5.45, FLOOR_Y, benchZ - 0.68, benchX + 5.45, FLOOR_Y + 0.90, benchZ + 0.68, 'wood');
      L.box(steelGalvInt, 10.8, 0.38, 1.25, benchX, FLOOR_Y + 2.45, benchZ);
      L.box(ledCoolMat, 10.4, 0.04, 0.16, benchX, FLOOR_Y + 2.24, benchZ - 0.45, { parent: dyn });
      addIntLight(0xfff6ea, 12, 16, benchX, FLOOR_Y + 2.25, benchZ - 1.2);

      for (let i = 0; i < 6; i++) {
        const sx = 21.6 + i * 1.75;
        const tz = benchZ;

        // #6: Operator chairs on the OTHER (North/rear) side (Z = -31.15) facing South (+Z) toward bench
        const chairZ = benchZ - 1.35;
        L.cyl(steelDarkInt, 0.22, 0.04, sx, FLOOR_Y + 0.02, chairZ);
        L.cyl(steelDarkInt, 0.035, 0.48, sx, FLOOR_Y + 0.26, chairZ);
        L.box(leatherDark, 0.44, 0.08, 0.44, sx, FLOOR_Y + 0.50, chairZ, { bevel: 0.015 });
        // Backrest on North side (-Z) so seated operator faces South (+Z) toward the horizontal wheel
        L.box(steelDarkInt, 0.06, 0.38, 0.04, sx, FLOOR_Y + 0.68, chairZ - 0.21);
        L.box(leatherDark, 0.42, 0.28, 0.07, sx, FLOOR_Y + 0.82, chairZ - 0.21, { bevel: 0.015 });
        L.col(sx - 0.24, FLOOR_Y, chairZ - 0.25, sx + 0.24, FLOOR_Y + 0.56, chairZ + 0.23, 'metal');

        // Horizontal Side-Mounted Motor Head on the RIGHT (-X when facing +Z) of seated operator
        const motorX = sx - 0.44;
        const spindleY = FLOOR_Y + 1.08;
        L.box(steelDarkInt, 0.26, 0.30, 0.28, motorX, FLOOR_Y + 1.02, tz);
        L.cyl(paintBlue, 0.10, 0.24, motorX - 0.04, spindleY, tz, { axis: 'x' });

        // Horizontal rotating chuck + glass cup mounted HORIZONTALLY extending (+X)
        const spindle = new THREE.Group();
        spindle.position.set(motorX + 0.14, spindleY, tz);
        dyn.add(spindle);

        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.20, 12).rotateZ(Math.PI / 2), steelGalvInt);
        shaft.position.x = 0.10;
        spindle.add(shaft);

        const chuck = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.036, 0.06, 16).rotateZ(Math.PI / 2), rubberMat);
        chuck.position.x = 0.20;
        spindle.add(chuck);

        const cup = createGlassCup(THREE, glassMat, brassGold, true);
        cup.rotation.z = -Math.PI / 2;
        cup.position.x = 0.22;
        spindle.add(cup);

        horizontalSpindles.push(spindle);

        // Operator hand-rest bar, gold luster ink pot & brush on North/operator edge of bench
        L.box(steelGalvInt, 0.36, 0.02, 0.03, sx - 0.08, FLOOR_Y + 0.96, tz - 0.30);
        L.cyl(brassGold, 0.042, 0.075, sx - 0.30, FLOOR_Y + 0.93, tz - 0.28);
        L.box(paintYellow, 0.07, 0.28, 0.07, sx + 0.38, FLOOR_Y + 1.02, tz + 0.24);
        L.box(ledCoolMat, 0.14, 0.03, 0.09, sx + 0.30, FLOOR_Y + 1.15, tz + 0.08, { parent: dyn });
      }

      // #7: Stacked Trays separated by TALLER GLASSES (replaced the long drying rack stand!)
      // 8 multi-tier tray stacks (4, 5, 6, 7 trays high per stack)
      const trayW = 1.12;
      const trayD = 0.80;
      const trayBaseH = 0.025;
      const spacerH = 0.23; // prominent tall glass separator height
      const tierStep = trayBaseH + spacerH;

      function buildStackedTrayTower(tx, tz, numTrays = 6) {
        // Low wooden skid base on floor
        L.box(woodDark, trayW + 0.04, 0.12, trayD + 0.04, tx, FLOOR_Y + 0.06, tz);
        let curY = FLOOR_Y + 0.12;

        for (let tier = 0; tier < numTrays; tier++) {
          // Tray bottom + raised tray border edges
          L.box(woodPallet, trayW, trayBaseH, trayD, tx, curY + trayBaseH / 2, tz, { bevel: 0.005 });
          L.box(woodDark, trayW, 0.042, 0.025, tx, curY + 0.021, tz - trayD / 2 + 0.012);
          L.box(woodDark, trayW, 0.042, 0.025, tx, curY + 0.021, tz + trayD / 2 - 0.012);
          L.box(woodDark, 0.025, 0.042, trayD, tx - trayW / 2 + 0.012, curY + 0.021, tz);
          L.box(woodDark, 0.025, 0.042, trayD, tx + trayW / 2 - 0.012, curY + 0.021, tz);

          const traySurfaceY = curY + trayBaseH;

          // Regular gilded cups inside each tray
          for (let gx = -0.30; gx <= 0.30; gx += 0.15) {
            for (let gz = -0.22; gz <= 0.22; gz += 0.145) {
              const cup = createGlassCup(THREE, glassMat, brassGold, true);
              cup.position.set(tx + gx, traySurfaceY, tz + gz);
              stat.add(cup);
            }
          }

          // Taller upright spacer glasses separating each tray (plus corner spacer glasses on top tray)
          if (tier < numTrays - 1) {
            for (const sx of [-0.46, 0, 0.46]) {
              for (const sz of [-0.31, 0.31]) {
                const spacer = createTallSpacerGlass(THREE, glassMat, brassGold);
                spacer.position.set(tx + sx, traySurfaceY, tz + sz);
                stat.add(spacer);
              }
            }
          } else {
            for (const sx of [-0.46, 0.46]) {
              for (const sz of [-0.31, 0.31]) {
                const spacer = createTallSpacerGlass(THREE, glassMat, brassGold);
                spacer.position.set(tx + sx, traySurfaceY, tz + sz);
                stat.add(spacer);
              }
            }
          }

          curY += tierStep;
        }

        const totalTopY = curY - spacerH + 0.04;
        L.col(tx - trayW / 2 - 0.03, FLOOR_Y, tz - trayD / 2 - 0.03, tx + trayW / 2 + 0.03, totalTopY, tz + trayD / 2 + 0.03, 'wood');
      }

      const trayStacks = [
        [21.5, -26.5, 6], [24.1, -26.5, 7], [26.7, -26.5, 6], [29.3, -26.5, 5],
        [21.5, -24.8, 4], [24.1, -24.8, 5], [26.7, -24.8, 6], [29.3, -24.8, 5]
      ];
      for (const [tx, tz, nTrays] of trayStacks) {
        buildStackedTrayTower(tx, tz, nTrays);
      }

      addSign(THREE, stat, 'BARDAK YALDIZ TEZGAHLARI', 'ARKA GECISLI YATAY CARKLAR & TEPSI ISTIFLERI [E]', benchX, FLOOR_Y + 3.05, benchZ + 0.72, 5.2, 0.82, Math.PI);
      addSign(THREE, stat, 'BARDAK YALDIZ TEZGAHLARI', 'ARKA OTURMA KORIDORU & TEPSI ISTIFLERI [E]', benchX, FLOOR_Y + 3.05, benchZ - 0.72, 5.2, 0.82, 0);

      interactives.push({
        id: 'yaldiz_carklari',
        pos: new THREE.Vector3(benchX, FLOOR_Y + 1.1, benchZ),
        range: 6.0,
        getLabel: () => turntableSpeed > 0.2 ? 'Yatay Yaldiz Carklarini Durdur' : 'Yatay Yaldiz Carklarini Calistir',
        trigger: () => {
          turntableSpeed = turntableSpeed > 0.2 ? 0 : 1.0;
          return turntableSpeed > 0.2 ? 'Yatay yaldiz carklari calistirildi' : 'Yatay yaldiz carklari durduruldu';
        }
      });
    }

    // ------------------------------------------------------------------------
    // 8. CAM TEZYİNAT FIRINI (DOLUM → TÜNEL → ÇIKIŞ) — Expanded Sağ Hol (kx = 28.6)
    // ------------------------------------------------------------------------
    const kilnGlasses = [];
    let kilnRunning = true;
    {
      const kx = 28.6;
      const kw = 3.4;
      const convY = FLOOR_Y + 0.96;

      // Entry conveyor (Z: -21.2 .. -16.2)
      L.box(steelDarkInt, 2.2, 0.14, 5.0, kx, convY - 0.08, -18.7);
      L.box(steelGalvInt, 1.85, 0.03, 4.9, kx, convY, -18.7);
      for (const lx of [kx - 0.95, kx + 0.95]) {
        for (const lz of [-20.9, -18.7, -16.5]) {
          L.box(steelDarkInt, 0.08, 0.92, 0.08, lx, FLOOR_Y + 0.46, lz);
        }
        L.box(paintYellow, 0.05, 0.12, 4.9, lx, convY + 0.07, -18.7);
      }
      addSign(THREE, stat, 'DOLUM  -->', 'FIRIN GIRIS KONVEYORU', kx, FLOOR_Y + 2.35, -20.5, 2.4, 0.52, Math.PI, '#152028', '#fff', '#58c4b8');

      // Main Kiln Tunnel (Z: -16.2 .. 12.2, length = 28.4m)
      L.box(paintGrey, kw, 2.05, 28.4, kx, FLOOR_Y + 1.38, -2.0, { bevel: 0.03 });
      for (let lz = -15.6; lz <= 11.6; lz += 3.2) {
        L.box(steelDarkInt, kw + 0.14, 0.42, 0.24, kx, FLOOR_Y + 0.21, lz);
        L.box(steelDarkInt, kw + 0.12, 2.15, 0.18, kx, FLOOR_Y + 1.40, lz);
      }
      for (const cz of [-11.5, -2.0, 7.5]) {
        L.cyl(steelGalvInt, 0.36, WALL_H + 1.2, kx, FLOOR_Y + (WALL_H + 1.2) * 0.5 + 1.5, cz);
      }

      for (const wz of [-12.5, -7.5, -2.5, 2.5, 7.5]) {
        L.box(steelDarkInt, 0.08, 0.54, 1.35, kx - kw / 2 - 0.02, FLOOR_Y + 1.48, wz);
        L.box(kilnGlowMat, 0.05, 0.40, 1.18, kx - kw / 2 - 0.04, FLOOR_Y + 1.48, wz, { parent: dyn });
      }
      L.box(kilnGlowMat, 1.80, 0.55, 0.12, kx, convY + 0.32, -16.18, { parent: dyn });
      L.box(kilnGlowMat, 1.80, 0.55, 0.12, kx, convY + 0.32, 12.18, { parent: dyn });
      addIntLight(0xff7426, 10, 13, kx - 2.4, FLOOR_Y + 1.6, -8.5);
      addIntLight(0xff7426, 10, 13, kx - 2.4, FLOOR_Y + 1.6, 2.5);
      addIntLight(0xff8c42, 9, 12, kx, FLOOR_Y + 1.7, 14.5);

      // Control Cabinet & PID Screen
      L.box(paintGrey, 0.55, 1.85, 1.25, kx - kw / 2 - 0.32, FLOOR_Y + 0.94, -14.2);
      const pidMesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.72, 0.72), makePidScreenTexture(THREE));
      pidMesh.position.set(kx - kw / 2 - 0.60, FLOOR_Y + 1.45, -14.2);
      pidMesh.rotation.y = Math.PI;
      dyn.add(pidMesh);
      addSign(THREE, stat, 'CAM TEZYINAT FIRINI', '615 C TAV & YALDIZ PISIRME', kx - kw / 2 - 0.08, FLOOR_Y + 2.85, -2.0, 4.4, 0.78, -Math.PI / 2);

      // Exit conveyor (Z: 12.2 .. 17.2)
      L.box(steelDarkInt, 2.2, 0.14, 5.0, kx, convY - 0.08, 14.7);
      L.box(steelGalvInt, 1.85, 0.03, 4.9, kx, convY, 14.7);
      for (const lx of [kx - 0.95, kx + 0.95]) {
        for (const lz of [12.5, 14.7, 16.9]) {
          L.box(steelDarkInt, 0.08, 0.92, 0.08, lx, FLOOR_Y + 0.46, lz);
        }
        L.box(paintYellow, 0.05, 0.12, 4.9, lx, convY + 0.07, 14.7);
      }
      addSign(THREE, stat, 'CIKIS', 'SOGUTMA VE KONTROL', kx, FLOOR_Y + 2.35, 16.8, 2.2, 0.52, 0, '#152028', '#fff', '#ffb347');

      // Stepped colliders for kiln conveyors, control cabinet & kiln tunnel body (climbable #14!)
      L.col(kx - 1.1, FLOOR_Y, -21.2, kx + 1.1, convY + 0.05, -16.2, 'metal');
      L.col(kx - kw / 2 - 0.60, FLOOR_Y, -14.85, kx - kw / 2 - 0.05, FLOOR_Y + 1.88, -13.55, 'metal');
      L.col(kx - kw / 2 - 0.45, FLOOR_Y, -16.2, kx + kw / 2 + 0.1, FLOOR_Y + 2.42, 12.2, 'metal');
      L.col(kx - 1.1, FLOOR_Y, 12.2, kx + 1.1, convY + 0.05, 17.2, 'metal');

      for (let i = 0; i < 18; i++) {
        const row = new THREE.Group();
        for (let gx = -0.58; gx <= 0.58; gx += 0.29) {
          const isOut = i >= 9;
          const cup = createGlassCup(THREE, glassMat, brassGold, true);
          cup.position.x = gx;
          row.add(cup);
          if (isOut) cup.rotation.y = i * 0.4;
        }
        const phase = (i % 9) / 9;
        const isOut = i >= 9;
        row.position.set(kx, convY + 0.02, isOut ? (12.3 + phase * 4.6) : (-21.0 + phase * 4.6));
        dyn.add(row);
        kilnGlasses.push({ mesh: row, phase, isOut });
      }

      updaters.push((dt) => {
        if (!kilnRunning) return;
        for (const item of kilnGlasses) {
          item.phase = (item.phase + dt * 0.12) % 1;
          item.mesh.position.z = item.isOut
            ? (12.3 + item.phase * 4.6)
            : (-21.0 + item.phase * 4.6);
        }
      });

      interactives.push({
        id: 'firin_konveyor',
        pos: new THREE.Vector3(kx - 2.1, FLOOR_Y + 1.2, -14.2),
        range: 4.5,
        getLabel: () => kilnRunning ? 'Firin Konveyorunu Durdur' : 'Firin Konveyorunu Baslat',
        trigger: () => {
          kilnRunning = !kilnRunning;
          return kilnRunning ? 'Cam Tezyinat Firini konveyoru calisiyor' : 'Cam Tezyinat Firini konveyoru durduruldu';
        }
      });
    }

    // ------------------------------------------------------------------------
    // 9. İLK PAKETLEME (X: 21.0..30.0, Z: 19.5..26.0)
    // ------------------------------------------------------------------------
    {
      const ipx = 26.0, ipz = 22.6;
      L.box(steelDarkInt, 5.2, 0.88, 1.55, ipx, FLOOR_Y + 0.44, ipz);
      L.box(woodPallet, 5.3, 0.05, 1.65, ipx, FLOOR_Y + 0.90, ipz);
      L.box(ledCoolMat, 1.8, 0.02, 0.95, ipx + 1.0, FLOOR_Y + 0.935, ipz, { parent: dyn });
      for (let gx = ipx + 0.25; gx <= ipx + 1.75; gx += 0.25) {
        for (const gz of [ipz - 0.25, ipz + 0.25]) {
          const cup = createGlassCup(THREE, glassMat, brassGold, true);
          cup.position.set(gx, FLOOR_Y + 0.95, gz);
          stat.add(cup);
        }
      }
      L.box(cardboard, 0.56, 0.36, 0.46, ipx - 1.7, FLOOR_Y + 1.10, ipz);
      L.box(cardboard, 0.56, 0.36, 0.46, ipx - 1.1, FLOOR_Y + 1.10, ipz);
      addLoadedPallet(21.4, 24.4, 0.02, 2);
      addLoadedPallet(21.4, 22.2, -0.02, 1);
      addSign(THREE, stat, 'ILK PAKETLEME', 'KALITE KONTROL & AYIRMA', ipx, FLOOR_Y + 2.25, ipz, 2.5, 0.50, 0);
      L.col(ipx - 2.65, FLOOR_Y, ipz - 0.85, ipx + 2.65, FLOOR_Y + 0.95, ipz + 0.85, 'wood');
    }

    // ------------------------------------------------------------------------
    // 10. VINTAGE & FULLY EQUIPPED ERKEK WC & KADIN WC (X: 34.0..39.2, Z: 7.0..21.0)
    // ------------------------------------------------------------------------
    {
      const wcX0 = FAC_X1, wcX1 = FAC_X1 + 5.2, wcH = FLOOR_Y + 3.25;
      L.slab(concreteDirty, wcX0, 0.0, 7.0, wcX1, FLOOR_Y - 0.02, 21.0);
      L.slab(wcFloorTile, wcX0, FLOOR_Y - 0.02, 7.0, wcX1 - 0.15, FLOOR_Y, 21.0);
      L.col(wcX0, -0.1, 7.0, wcX1, FLOOR_Y, 21.0, 'concrete');

      L.slab(concreteExt, wcX0, FLOOR_Y, 6.95, wcX1, wcH, 7.20);
      L.slab(wcWallTile, wcX0, FLOOR_Y, 7.20, wcX1 - 0.22, wcH, 7.24);
      L.slab(concreteExt, wcX0, FLOOR_Y, 13.88, wcX1, wcH, 14.12);
      L.slab(wcWallTile, wcX0, FLOOR_Y, 13.84, wcX1 - 0.22, wcH, 13.88);
      L.slab(wcWallTile, wcX0, FLOOR_Y, 14.12, wcX1 - 0.22, wcH, 14.16);
      L.slab(concreteExt, wcX0, FLOOR_Y, 20.80, wcX1, wcH, 21.05);
      L.slab(wcWallTile, wcX0, FLOOR_Y, 20.76, wcX1 - 0.22, wcH, 20.80);

      L.slab(concreteExt, wcX1 - 0.24, FLOOR_Y, 7.0, wcX1, FLOOR_Y + 2.15, 21.0);
      L.slab(concreteExt, wcX1 - 0.24, FLOOR_Y + 2.75, 7.0, wcX1, wcH, 21.0);
      L.slab(frostedGlass, wcX1 - 0.14, FLOOR_Y + 2.15, 7.2, wcX1 - 0.10, FLOOR_Y + 2.75, 20.8, { cast: false });
      L.slab(wcWallTile, wcX1 - 0.28, FLOOR_Y, 7.2, wcX1 - 0.24, FLOOR_Y + 2.15, 20.8);
      L.slab(roofExtMat, wcX0 - 0.1, wcH, 6.8, wcX1 + 0.3, wcH + 0.22, 21.2);
      // Climbable WC roof
      L.col(wcX0 - 0.1, wcH, 6.8, wcX1 + 0.3, wcH + 0.22, 21.2, 'metal');

      L.col(wcX0, FLOOR_Y, 6.95, wcX1, wcH, 7.24, 'concrete');
      L.col(wcX0, FLOOR_Y, 13.84, wcX1, wcH, 14.16, 'concrete');
      L.col(wcX0, FLOOR_Y, 20.76, wcX1, wcH, 21.05, 'concrete');
      L.col(wcX1 - 0.28, FLOOR_Y, 7.0, wcX1, wcH, 21.0, 'concrete');

      function buildOldWashbasin(bx, bz) {
        L.cyl(porcelainAged, 0.11, 0.68, bx, FLOOR_Y + 0.34, bz);
        L.box(porcelainAged, 0.46, 0.16, 0.54, bx, FLOOR_Y + 0.76, bz, { bevel: 0.03 });
        L.cyl(rustPipeMat, 0.025, 0.35, bx + 0.14, FLOOR_Y + 0.56, bz);
        L.cyl(steelGalvInt, 0.015, 0.12, bx, FLOOR_Y + 0.89, bz - 0.21);
        L.cyl(brassGold, 0.014, 0.05, bx - 0.08, FLOOR_Y + 0.87, bz - 0.22);
        L.cyl(brassGold, 0.014, 0.05, bx + 0.08, FLOOR_Y + 0.87, bz - 0.22);
        L.box(rustPipeMat, 0.48, 0.64, 0.03, bx, FLOOR_Y + 1.48, bz - 0.26);
        L.box(glassMat, 0.42, 0.58, 0.035, bx, FLOOR_Y + 1.48, bz - 0.25);
        L.box(porcelainAged, 0.14, 0.04, 0.09, bx + 0.18, FLOOR_Y + 0.86, bz - 0.19);
        L.col(bx - 0.24, FLOOR_Y, bz - 0.28, bx + 0.24, FLOOR_Y + 0.86, bz + 0.28, 'concrete');
      }

      function buildToiletStall(sx, sz, isAlaturka) {
        L.box(woodDark, 1.55, 2.05, 0.05, sx, FLOOR_Y + 1.02, sz - 0.78);
        L.box(woodDark, 1.55, 2.05, 0.05, sx, FLOOR_Y + 1.02, sz + 0.78);
        L.box(woodDark, 0.05, 1.98, 0.78, sx - 0.88, FLOOR_Y + 0.99, sz - 0.44, { r: [0, 0.85, 0] });

        if (isAlaturka) {
          L.box(porcelainAged, 0.68, 0.07, 0.74, sx + 0.22, FLOOR_Y + 0.035, sz, { bevel: 0.015 });
          L.box(rubberMat, 0.24, 0.02, 0.42, sx + 0.20, FLOOR_Y + 0.075, sz);
          L.box(porcelainAged, 0.16, 0.03, 0.34, sx + 0.20, FLOOR_Y + 0.08, sz - 0.22);
          L.box(porcelainAged, 0.16, 0.03, 0.34, sx + 0.20, FLOOR_Y + 0.08, sz + 0.22);
        } else {
          L.cyl(porcelainAged, 0.19, 0.40, sx + 0.26, FLOOR_Y + 0.20, sz);
          L.box(porcelainAged, 0.42, 0.05, 0.36, sx + 0.26, FLOOR_Y + 0.41, sz, { bevel: 0.02 });
          L.box(porcelainAged, 0.22, 0.44, 0.42, sx + 0.48, FLOOR_Y + 0.64, sz, { bevel: 0.02 });
          L.col(sx + 0.05, FLOOR_Y, sz - 0.22, sx + 0.60, FLOOR_Y + 0.45, sz + 0.22, 'concrete');
        }

        L.box(porcelainAged, 0.24, 0.34, 0.46, sx + 0.60, FLOOR_Y + 2.02, sz, { bevel: 0.02 });
        L.cyl(steelGalvInt, 0.018, 1.75, sx + 0.62, FLOOR_Y + 1.05, sz);
        L.cyl(steelGalvInt, 0.008, 0.65, sx + 0.50, FLOOR_Y + 1.62, sz + 0.24);
        L.cyl(brassGold, 0.018, 0.14, sx + 0.58, FLOOR_Y + 0.42, sz + 0.38, { axis: 'x' });
        L.cyl(paintBlue, 0.08, 0.22, sx + 0.48, FLOOR_Y + 0.11, sz + 0.48);
        L.cyl(paintWhite, 0.055, 0.11, sx + 0.40, FLOOR_Y + 0.72, sz - 0.72, { axis: 'z' });
      }

      const zonesWC = [
        { label: 'ERKEK WC', zMin: 7.0, signCol: '#2a6cb8', hasUrinals: true },
        { label: 'KADIN WC', zMin: 14.0, signCol: '#b83c6a', hasUrinals: false }
      ];

      for (const wc of zonesWC) {
        const cz = wc.zMin + 3.5;
        addSign(THREE, stat, wc.label, '', wcX0 - 0.36, FLOOR_Y + 2.55, cz, 1.4, 0.36, -Math.PI / 2, '#161b20', '#fff', wc.signCol);

        L.box(ledWarmMat, 0.42, 0.08, 0.24, wcX0 + 2.3, wcH - 0.08, cz, { parent: dyn });
        addIntLight(0xffdfb0, 5.2, 8.0, wcX0 + 2.3, wcH - 0.35, cz);
        L.cyl(rustPipeMat, 0.06, 3.2, wcX1 - 0.38, FLOOR_Y + 1.6, wc.zMin + 0.42);
        L.cyl(steelGalvInt, 0.02, 4.4, wcX0 + 2.5, FLOOR_Y + 2.45, wc.zMin + 0.30, { axis: 'x' });

        buildOldWashbasin(wcX0 + 1.0, wc.zMin + 0.55);
        buildOldWashbasin(wcX0 + 2.1, wc.zMin + 0.55);
        L.cyl(paintBlue, 0.14, 0.30, wcX0 + 0.35, FLOOR_Y + 0.15, wc.zMin + 0.55);
        L.cyl(steelGalvInt, 0.14, 0.42, wcX0 + 2.85, FLOOR_Y + 0.21, wc.zMin + 0.52);
        L.box(paintWhite, 0.04, 0.48, 0.28, wcX0 + 0.25, FLOOR_Y + 1.25, wc.zMin + 1.05);

        buildToiletStall(wcX1 - 1.1, wc.zMin + 2.5, true);
        buildToiletStall(wcX1 - 1.1, wc.zMin + 4.7, false);

        if (wc.hasUrinals) {
          for (const ux of [wcX0 + 1.1, wcX0 + 2.1]) {
            L.box(porcelainAged, 0.34, 0.56, 0.26, ux, FLOOR_Y + 0.96, wc.zMin + 6.56, { bevel: 0.03 });
            L.cyl(brassGold, 0.02, 0.18, ux, FLOOR_Y + 1.34, wc.zMin + 6.65);
          }
          L.box(woodDark, 0.05, 1.15, 0.44, wcX0 + 1.6, FLOOR_Y + 1.05, wc.zMin + 6.52);
        }
      }
    }

    function setNightFactor(nightFactor) {
      const mult = 0.65 + nightFactor * 1.15;
      for (const item of interiorLights) {
        item.light.intensity = item.baseIntensity * mult;
      }
    }

    return {
      interiorBox: {
        min: new THREE.Vector3(FAC_X0, FLOOR_Y, FAC_Z0),
        max: new THREE.Vector3(FAC_X1, 9.5, FAC_Z1)
      },
      setNightFactor,
      update(dt) {
        for (let i = 0; i < horizontalSpindles.length; i++) {
          horizontalSpindles[i].rotation.x += dt * 2.5 * turntableSpeed;
        }
      }
    };
  }

  window.AZ_FACTORY_INTERIOR = {
    FLOOR_Y,
    buildFactoryBuilding
  };
})();
