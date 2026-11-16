(() => {
  'use strict';

  const FLOOR_Y = 0.06;
  const WALL_H = 6.90;
  const RIDGE_Y = 9.00;

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
    ctx.fillStyle = isFloor ? '#4d4a44' : '#736f65'; // worn grout
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
        // subtle aged staining speckles
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
    const diamondPlate = L.M('diamond_plate');
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
    // 1. MAIN FACTORY FLOOR SLAB (Ground level: Y = 0.06m, X: 4..28, Z: -28..22)
    // ------------------------------------------------------------------------
    L.slab(concreteDirty, 3.9, -0.05, -28.1, 28.1, FLOOR_Y - 0.02, 22.1, { cast: false });
    L.slab(epoxyFloor, 4.05, FLOOR_Y - 0.02, -27.95, 27.95, FLOOR_Y, 21.95, { cast: false });
    L.col(4.0, -0.4, -28.0, 28.0, FLOOR_Y, 22.0, 'concrete');

    // ------------------------------------------------------------------------
    // 2. SOLID STEEP OUTWARD-RISING LOADING RAMP
    //    - Kapıdan çıkınca düz pay olmadan DİREKT yükselmeye başlar ve daha diktir (~19.2°)
    //    - En yüksek tarafında çıkış/merdiven YOK (1.52m kamyon yanaşma yüksekliği)
    //    - Altı tamamen dolu beton kütle (boşluk yok)
    //    - En düşük yeri (X: 2.6..4.0) kapıyla buluştuğu alanda yanlardan yürüyüp girilebilir
    // ------------------------------------------------------------------------
    {
      const DOCK_H = 1.52;
      const xIn = 4.0;          // rises IMMEDIATELY from factory doorway!
      const xSlopeTop = -0.2;   // 4.2m steep ramp rising from 0.06m -> 1.52m (~19.2 deg)
      const xDockOut = -1.3;    // outer truck-dock head X: -1.3..-0.2 at Y = 1.52m
      const slopeRun = xIn - xSlopeTop;
      const rise = DOCK_H - FLOOR_Y;
      const rampAngle = -Math.atan2(rise, slopeRun);
      const rampHyp = Math.hypot(slopeRun, rise);
      const midX = (xIn + xSlopeTop) / 2;
      const midY = (FLOOR_Y + DOCK_H) / 2;

      // Solid full-depth concrete ramp body (zero hollow space underneath!)
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
      const solidRampMesh = new THREE.Mesh(solidRampGeo, concreteDirty);
      solidRampMesh.castShadow = true;
      solidRampMesh.receiveShadow = true;
      stat.add(solidRampMesh);

      // Solid outer dock platform collider
      L.slab(concreteExt, xDockOut, 0.0, -3.1, xSlopeTop, DOCK_H, 3.1);
      L.col(xDockOut, -0.1, -3.1, xSlopeTop, DOCK_H, 3.1, 'concrete');

      // Anti-slip diamond-plate wheel/pallet-jack tracks directly up the steep slope
      for (const rz of [-1.45, 1.45]) {
        L.box(diamondPlate, rampHyp, 0.02, 1.25, midX, midY + 0.012, rz, { r: [0, 0, rampAngle] });
        L.box(diamondPlate, xSlopeTop - xDockOut, 0.02, 1.25, (xDockOut + xSlopeTop) / 2, DOCK_H + 0.01, rz);
      }

      // Rubber truck dock bumpers on outer high West face (X = -1.36)
      for (const bz of [-2.1, -0.7, 0.7, 2.1]) {
        L.box(rubberMat, 0.16, 0.42, 0.45, xDockOut - 0.06, DOCK_H - 0.20, bz);
      }

      // Side safety curbs & handrails ONLY on the elevated part (X: -1.3..2.5),
      // leaving the lowest door-threshold zone (X: 2.5..4.0) completely open on both sides!
      const railSlopeRun = 2.5 - xSlopeTop; // 2.7m
      const railLowY = FLOOR_Y + ((xIn - 2.5) / slopeRun) * rise;
      const railHyp = Math.hypot(railSlopeRun, DOCK_H - railLowY);
      const railMidX = (2.5 + xSlopeTop) / 2;
      const railMidY = (railLowY + DOCK_H) / 2;
      for (const sz of [-3.05, 3.05]) {
        L.box(hazardMat, railHyp, 0.18, 0.18, railMidX, railMidY + 0.06, sz, { r: [0, 0, rampAngle] });
        L.box(hazardMat, xSlopeTop - xDockOut, 0.18, 0.18, (xDockOut + xSlopeTop) / 2, DOCK_H + 0.06, sz);
        for (const px of [-1.2, -0.2, 1.15, 2.45]) {
          const py = px <= xSlopeTop ? DOCK_H : FLOOR_Y + ((xIn - px) / slopeRun) * rise;
          L.cyl(steelGalv, 0.032, 0.96, px, py + 0.48, sz);
        }
        L.box(paintYellow, railHyp, 0.05, 0.06, railMidX, railMidY + 0.96, sz, { r: [0, 0, rampAngle] });
        L.box(paintYellow, xSlopeTop - xDockOut, 0.05, 0.06, (xDockOut + xSlopeTop) / 2, DOCK_H + 0.96, sz);
        L.col(xDockOut, 0, sz - 0.16, 2.5, DOCK_H + 1.1, sz + 0.16, 'metal');
      }

      // 24 smooth stepped physics colliders starting immediately from X=4.0 up to X=-0.2
      const steps = 24;
      for (let s = 0; s < steps; s++) {
        const sx1 = xIn - (slopeRun * s) / steps;
        const sx0 = xIn - (slopeRun * (s + 1)) / steps;
        const syTop = FLOOR_Y + ((s + 1) / steps) * rise;
        L.col(sx0, -0.1, -3.0, sx1, syTop, 3.0, 'concrete');
      }

      // Overhead canopy above factory doorway + loading sign
      L.slab(steelDark, 2.5, 4.35, -3.3, 4.15, 4.55, 3.3);
      L.box(ledWarmMat, 0.18, 0.10, 4.4, 3.3, 4.32, 0);
      addSign(THREE, stat, 'YUKLEME RAMPASI', 'KAMYON SEVKIYAT KAPISI (1.52m)', 3.92, 5.15, 0, 4.4, 0.95, -Math.PI / 2);
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
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z += 3.2) {
          L.slab(steelDark, x0 - 0.02, yWin0, z - 0.06, x1 + 0.02, yWin1, z + 0.06);
        }
      } else {
        const zm = (z0 + z1) / 2;
        L.slab(glassMat, x0, yWin0, zm - 0.02, x1, yWin1, zm + 0.02, { cast: false });
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += 3.2) {
          L.slab(steelDark, x - 0.06, yWin0, z0 - 0.02, x + 0.06, yWin1, z1 + 0.02);
        }
      }
    }

    // West Exterior Wall (X: 4.0..4.32), single factory sliding door open at Z: -2.6..2.6
    buildWindowBandWall(4.0, -28.0, 4.32, -2.6, FLOOR_Y, 4.2, 5.9, WALL_H, 'z', wallExtMat);
    buildWindowBandWall(4.0, 2.6, 4.32, 22.0, FLOOR_Y, 4.2, 5.9, WALL_H, 'z', wallExtMat);
    L.slab(wallExtMat, 4.0, 3.85, -2.6, 4.32, WALL_H, 2.6);
    L.slab(paintGrey, 3.96, FLOOR_Y, -28.0, 4.02, FLOOR_Y + 1.15, -2.6);
    L.slab(paintGrey, 3.96, FLOOR_Y, 2.6, 4.02, FLOOR_Y + 1.15, 22.0);
    L.slab(paintYellow, 3.96, FLOOR_Y, -2.72, 4.36, 3.90, -2.56);
    L.slab(paintYellow, 3.96, FLOOR_Y, 2.56, 4.36, 3.90, 2.72);
    L.col(3.98, 0, -28.0, 4.34, WALL_H, -2.62, 'concrete');
    L.col(3.98, 0, 2.62, 4.34, WALL_H, 22.0, 'concrete');
    L.col(3.98, 3.85, -2.62, 4.34, WALL_H, 2.62, 'concrete');

    // North Exterior Wall (Z: -28.0..-27.68)
    buildWindowBandWall(4.0, -28.0, 28.0, -27.68, FLOOR_Y, 4.2, 5.9, WALL_H, 'x', wallExtMat);
    L.col(4.0, 0, -28.0, 28.0, WALL_H, -27.66, 'concrete');

    // South Exterior Wall (Z: 21.68..22.0) overlooking compact 4-post Garage
    buildWindowBandWall(4.0, 21.68, 28.0, 22.0, FLOOR_Y, 4.2, 5.9, WALL_H, 'x', wallExtMat);
    L.col(4.0, 0, 21.66, 28.0, WALL_H, 22.0, 'concrete');

    // East Exterior Wall (X: 27.68..28.0) with WIDE enterable WC doors (1.5m wide: 8.25..9.75 & 14.25..15.75)
    buildWindowBandWall(27.68, -28.0, 28.0, 8.25, FLOOR_Y, 4.2, 5.9, WALL_H, 'z', wallExtMat);
    L.slab(wallExtMat, 27.68, FLOOR_Y + 2.35, 8.25, 28.0, WALL_H, 9.75);
    buildWindowBandWall(27.68, 9.75, 28.0, 14.25, FLOOR_Y, 4.2, 5.9, WALL_H, 'z', wallExtMat);
    L.slab(wallExtMat, 27.68, FLOOR_Y + 2.35, 14.25, 28.0, WALL_H, 15.75);
    buildWindowBandWall(27.68, 15.75, 28.0, 22.0, FLOOR_Y, 4.2, 5.9, WALL_H, 'z', wallExtMat);
    L.col(27.66, 0, -28.0, 28.0, WALL_H, 8.23, 'concrete');
    L.col(27.66, FLOOR_Y + 2.35, 8.23, 28.0, WALL_H, 9.77, 'concrete');
    L.col(27.66, 0, 9.77, 28.0, WALL_H, 14.23, 'concrete');
    L.col(27.66, FLOOR_Y + 2.35, 14.23, 28.0, WALL_H, 15.77, 'concrete');
    L.col(27.66, 0, 15.77, 28.0, WALL_H, 22.0, 'concrete');

    // Gable ends & Skylight Pitched Roof
    for (const gz of [-27.84, 21.84]) {
      const gs = new THREE.Shape();
      gs.moveTo(-12.2, WALL_H);
      gs.lineTo(0, RIDGE_Y);
      gs.lineTo(12.2, WALL_H);
      gs.closePath();
      const gGeo = new THREE.ExtrudeGeometry(gs, { depth: 0.30, bevelEnabled: false });
      gGeo.translate(16.0, 0, gz - 0.15);
      const gm = new THREE.Mesh(gGeo, concreteExt);
      gm.castShadow = true;
      gm.receiveShadow = true;
      stat.add(gm);
    }

    const halfSpan = 12.6;
    const roofRise = RIDGE_Y - WALL_H;
    const roofAngle = Math.atan2(roofRise, halfSpan);
    const slopeLen = Math.hypot(halfSpan, roofRise);
    const roofBays = [
      [-28.4, -14.0, true],
      [-14.0, -9.2, false],
      [-9.2, 4.5, true],
      [4.5, 9.3, false],
      [9.3, 22.4, true]
    ];
    for (const [z0, z1, solid] of roofBays) {
      const lenZ = z1 - z0;
      const cz = (z0 + z1) / 2;
      for (const side of [-1, 1]) {
        const cx = 16.0 + side * (halfSpan * 0.5);
        const cy = (WALL_H + RIDGE_Y) * 0.5;
        if (solid) {
          L.box(roofExtMat, slopeLen, 0.10, lenZ, cx, cy + 0.05, cz, { r: [0, 0, -side * roofAngle] });
          L.box(roofIntMat, slopeLen, 0.06, lenZ, cx, cy - 0.03, cz, { r: [0, 0, -side * roofAngle] });
        } else {
          L.box(roofExtMat, slopeLen * 0.45, 0.10, lenZ, 16.0 + side * 9.5, WALL_H + 0.55, cz, { r: [0, 0, -side * roofAngle] });
          L.box(glassMat, slopeLen * 0.52, 0.04, lenZ, 16.0 + side * 3.4, RIDGE_Y - 0.58, cz, { r: [0, 0, -side * roofAngle], cast: false });
        }
      }
    }

    // Steel trusses & high-bay LED lighting
    for (let z = -25; z <= 19; z += 7.3) {
      L.ibeam(steelDarkInt, 'y', WALL_H - FLOOR_Y, 4.45, FLOOR_Y + (WALL_H - FLOOR_Y) / 2, z, { depth: 0.28, width: 0.18 });
      L.ibeam(steelDarkInt, 'y', WALL_H - FLOOR_Y, 27.55, FLOOR_Y + (WALL_H - FLOOR_Y) / 2, z, { depth: 0.28, width: 0.18 });
      L.box(steelDarkInt, 12.2, 0.22, 0.16, 10.1, WALL_H + 0.9, z, { r: [0, 0, roofAngle] });
      L.box(steelDarkInt, 12.2, 0.22, 0.16, 21.9, WALL_H + 0.9, z, { r: [0, 0, -roofAngle] });
      L.box(steelDarkInt, 23.2, 0.16, 0.14, 16.0, WALL_H - 0.1, z);

      for (const lx of [9.6, 21.6]) {
        L.box(steelDarkInt, 1.5, 0.08, 0.26, lx, 6.45, z);
        L.box(ledCoolMat, 1.38, 0.04, 0.18, lx, 6.40, z, { parent: dyn });
      }
    }

    addIntLight(0xfff1dc, 18, 22, 9.6, 5.9, -16.0);
    addIntLight(0xfff1dc, 18, 22, 9.6, 5.9, -1.0);
    addIntLight(0xffe6c4, 16, 20, 21.6, 5.9, -22.0);
    addIntLight(0xffe6c4, 14, 18, 21.6, 5.9, 16.0);

    // ------------------------------------------------------------------------
    // 4. ORTA BÖLME DUVARI & SÜRGÜLÜ KAPILAR
    // ------------------------------------------------------------------------
    buildWindowBandWall(15.42, -27.7, 15.68, -2.6, FLOOR_Y, 3.6, 5.3, WALL_H, 'z', wallIntMat);
    buildWindowBandWall(15.42, 2.6, 15.68, 21.7, FLOOR_Y, 3.6, 5.3, WALL_H, 'z', wallIntMat);
    L.slab(wallIntMat, 15.42, 3.85, -2.6, 15.68, WALL_H, 2.6);
    L.slab(paintYellow, 15.38, FLOOR_Y, -2.72, 15.72, 3.90, -2.56);
    L.slab(paintYellow, 15.38, FLOOR_Y, 2.56, 15.72, 3.90, 2.72);
    L.col(15.38, 0, -28.0, 15.72, WALL_H, -2.62, 'concrete');
    L.col(15.38, 0, 2.62, 15.72, WALL_H, 22.0, 'concrete');
    L.col(15.38, 3.85, -2.62, 15.72, WALL_H, 2.62, 'concrete');

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
      x: 15.26,
      railZ0: -8.6,
      railZ1: 3.2,
      closedZ: 0.0,
      openZ: -5.4,
      widthZ: 5.3,
      heightY: 3.55
    });

    // ------------------------------------------------------------------------
    // 5. SOL HOL: PALETLER & PAKETLEME MASASI
    // ------------------------------------------------------------------------
    function addLoadedPallet(px, pz, yaw = 0, stackH = 2) {
      const grp = new THREE.Group();
      grp.position.set(px, FLOOR_Y, pz);
      grp.rotation.y = yaw;
      stat.add(grp);

      const deck = new THREE.Mesh(geo.box(1.25, 0.04, 1.05), woodPallet);
      deck.position.y = 0.13;
      deck.castShadow = true;
      grp.add(deck);
      for (const bx of [-0.52, 0, 0.52]) {
        for (const bz of [-0.42, 0, 0.42]) {
          const block = new THREE.Mesh(geo.box(0.14, 0.11, 0.12), woodPallet);
          block.position.set(bx, 0.055, bz);
          grp.add(block);
        }
      }
      for (let tier = 0; tier < stackH; tier++) {
        for (const cx of [-0.30, 0.30]) {
          for (const cz of [-0.25, 0.25]) {
            const ctn = new THREE.Mesh(geo.bevelBox(0.54, 0.46, 0.44, 0.012), cardboard);
            ctn.position.set(cx, 0.38 + tier * 0.47, cz);
            ctn.rotation.y = ((tier + cx) % 2) * 0.03;
            ctn.castShadow = true;
            ctn.receiveShadow = true;
            grp.add(ctn);
          }
        }
      }
      const wrap = new THREE.Mesh(
        new THREE.BoxGeometry(1.16, stackH * 0.46, 0.96),
        new THREE.MeshPhysicalMaterial({ color: 0xeaf4fa, transparent: true, opacity: 0.16, roughness: 0.12 })
      );
      wrap.position.y = 0.16 + stackH * 0.23;
      grp.add(wrap);

      L.col(px - 0.65, FLOOR_Y, pz - 0.56, px + 0.65, FLOOR_Y + 0.2 + stackH * 0.48, pz + 0.56, 'wood');
    }

    // 14+ Loaded Wooden Pallets across Sol Hol storage rows
    const palletCoords = [
      [5.5, -25.8, 0.02, 3], [5.5, -23.4, -0.04, 2], [5.5, -21.0, 0.03, 3],
      [5.5, -18.5, -0.02, 2], [5.5, -16.0, 0.05, 3], [5.5, -13.5, 0.0, 2],
      [5.5, -11.0, -0.04, 3], [5.5, -8.5, 0.02, 2], [5.5, -6.0, 0.04, 2],
      [7.8, -25.6, -0.03, 3], [7.8, -23.1, 0.02, 2], [7.8, -20.5, -0.02, 3],
      [7.8, -17.8, 0.03, 2], [7.8, -15.0, 0.01, 2], [11.8, -21.5, 0.0, 2]
    ];
    for (const [px, pz, pyaw, pstack] of palletCoords) {
      addLoadedPallet(px, pz, pyaw, pstack);
    }

    // 2 Larger Industrial Packing Tables (2.3m wide x 5.2m long each)
    function buildPackingTable(tx, tz, idx) {
      const tw = 2.35, tl = 5.2, th = 0.90;
      L.box(woodPallet, tw, 0.06, tl, tx, FLOOR_Y + th, tz, { bevel: 0.01 });
      L.box(steelDarkInt, tw - 0.1, 0.06, tl - 0.1, tx, FLOOR_Y + th - 0.05, tz);
      for (const lx of [tx - 1.02, tx + 1.02]) {
        for (const lz of [tz - 2.35, tz, tz + 2.35]) {
          L.box(steelDarkInt, 0.08, th, 0.08, lx, FLOOR_Y + th * 0.5, lz);
        }
      }
      L.cyl(new THREE.MeshStandardMaterial({ color: 0x89c4e1, transparent: true, opacity: 0.65, roughness: 0.2 }), 0.24, 1.25, tx - 0.4, FLOOR_Y + th + 0.32, tz - 1.7, { axis: 'x' });
      L.box(paintBlue, 0.52, 0.08, 0.52, tx + 0.45, FLOOR_Y + th + 0.06, tz - 1.0);
      L.box(cardboard, 0.56, 0.40, 0.46, tx + 0.35, FLOOR_Y + th + 0.23, tz + 0.2);
      L.box(cardboard, 0.56, 0.40, 0.46, tx - 0.40, FLOOR_Y + th + 0.23, tz + 1.1);
      L.box(cardboard, 0.56, 0.40, 0.46, tx + 0.35, FLOOR_Y + th + 0.23, tz + 1.9);
      for (let gx = -0.26; gx <= 0.26; gx += 0.13) {
        for (let gz = -0.18; gz <= 0.18; gz += 0.12) {
          const cup = createGlassCup(THREE, glassMat, brassGold, true);
          cup.position.set(tx - 0.35 + gx, FLOOR_Y + th + 0.03, tz - 0.35 + gz);
          stat.add(cup);
        }
      }
      addSign(THREE, stat, `PAKETLEME MASASI ${idx}`, 'BUYUK SEVK HAZIRLIK MASASI', tx, FLOOR_Y + 2.35, tz, 2.3, 0.48, -Math.PI / 2);
      L.col(tx - tw / 2, FLOOR_Y, tz - tl / 2, tx + tw / 2, FLOOR_Y + th + 0.3, tz + tl / 2, 'wood');
    }
    buildPackingTable(11.8, -16.2, 1);
    buildPackingTable(11.8, -8.4, 2);

    // ------------------------------------------------------------------------
    // 6. SOL HOL ALT BÖLÜM: OFİS 1, OFİS 2 (BAĞLANTILI) & MUTFAK — TAM GİRİLEBİLİR
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

      // FIX: Use Math.abs(curA) so negative openAngle (-1.45) disables collider properly!
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

    const ceilY0 = FLOOR_Y + 3.20;
    const ceilY1 = FLOOR_Y + 3.40;
    L.slab(wallIntMat, 4.3, ceilY0, 9.0, 15.35, ceilY1, 21.7);
    L.col(4.3, ceilY0, 9.0, 15.35, ceilY1, 21.7, 'concrete');

    // Ofis & Mutfak Üstü — Merdiven YOK, yukarıya atılmış pis yatak/döşek ve eşya yığını
    {
      const dirtyMattressMat = new THREE.MeshStandardMaterial({ color: 0x877b68, roughness: 0.94 });
      const dirtyBlanketMat = new THREE.MeshStandardMaterial({ color: 0x4f4338, roughness: 0.92 });
      const dirtyPillowMat = new THREE.MeshStandardMaterial({ color: 0x9b8f74, roughness: 0.9 });
      const stainPatchMat = new THREE.MeshStandardMaterial({ color: 0x524533, roughness: 0.96 });
      // Stained old floor mattress & rumpled blanket/pillow
      L.box(dirtyMattressMat, 1.35, 0.20, 2.10, 7.6, ceilY1 + 0.10, 14.2, { r: [0, 0.16, 0], bevel: 0.04 });
      L.box(stainPatchMat, 0.55, 0.02, 0.72, 7.7, ceilY1 + 0.205, 14.0, { r: [0, 0.12, 0] });
      L.box(dirtyBlanketMat, 1.18, 0.11, 1.25, 7.45, ceilY1 + 0.24, 14.55, { r: [0.04, 0.22, -0.03], bevel: 0.03 });
      L.box(dirtyPillowMat, 0.68, 0.12, 0.42, 7.78, ceilY1 + 0.26, 13.38, { r: [0.05, 0.10, 0], bevel: 0.03 });
      // Rolled old rug, crushed cartons, dusty plastic crate & old bucket
      L.cyl(dirtyBlanketMat, 0.16, 1.95, 9.8, ceilY1 + 0.16, 12.6, { axis: 'x', r: [0, 0.25, Math.PI / 2] });
      L.box(cardboard, 0.85, 0.42, 0.75, 11.4, ceilY1 + 0.21, 16.5, { r: [0, 0.35, 0] });
      L.box(cardboard, 0.72, 0.22, 0.65, 11.9, ceilY1 + 0.11, 17.6, { r: [0, -0.4, 0.12] });
      L.box(paintBlue, 0.55, 0.35, 0.42, 12.8, ceilY1 + 0.175, 14.2, { r: [0, 0.6, 0] });
      L.cyl(rustPipeMat, 0.18, 0.38, 10.6, ceilY1 + 0.19, 18.8);
    }

    // North wall of Ofis 1 (Z = 9.0), WIDE doorway X: 7.0..8.5 (1.5m wide!)
    buildWindowBandWall(4.3, 8.92, 7.0, 9.10, FLOOR_Y, FLOOR_Y + 1.15, FLOOR_Y + 2.30, ceilY0, 'x', wallIntMat);
    L.slab(wallIntMat, 7.0, FLOOR_Y + 2.25, 8.92, 8.5, ceilY0, 9.10);
    buildWindowBandWall(8.5, 8.92, 10.6, 9.10, FLOOR_Y, FLOOR_Y + 1.15, FLOOR_Y + 2.30, ceilY0, 'x', wallIntMat);
    L.col(4.3, FLOOR_Y, 8.90, 6.98, ceilY0, 9.12, 'concrete');
    L.col(8.52, FLOOR_Y, 8.90, 10.6, ceilY0, 9.12, 'concrete');
    L.col(6.98, FLOOR_Y + 2.25, 8.90, 8.52, ceilY0, 9.12, 'concrete');
    createHingedDoor('ofis1_kapi', 'Ofis 1 Kapisi', 7.0, 9.0, 1.46, 'x', -1.45);
    addSign(THREE, stat, 'OFIS 1', 'IDARI & PLANLAMA', 9.45, FLOOR_Y + 2.65, 8.88, 1.4, 0.36, Math.PI);

    // North wall of Mutfak (Z = 9.0), WIDE doorway X: 12.1..13.6 (1.5m wide!)
    buildWindowBandWall(10.6, 8.92, 12.1, 9.10, FLOOR_Y, FLOOR_Y + 1.15, FLOOR_Y + 2.30, ceilY0, 'x', wallIntMat);
    L.slab(wallIntMat, 12.1, FLOOR_Y + 2.25, 8.92, 13.6, ceilY0, 9.10);
    buildWindowBandWall(13.6, 8.92, 15.35, 9.10, FLOOR_Y, FLOOR_Y + 1.15, FLOOR_Y + 2.30, ceilY0, 'x', wallIntMat);
    L.col(10.6, FLOOR_Y, 8.90, 12.08, ceilY0, 9.12, 'concrete');
    L.col(13.62, FLOOR_Y, 8.90, 15.35, ceilY0, 9.12, 'concrete');
    L.col(12.08, FLOOR_Y + 2.25, 8.90, 13.62, ceilY0, 9.12, 'concrete');
    createHingedDoor('mutfak_kapi', 'Mutfak Kapisi', 12.1, 9.0, 1.46, 'x', -1.45);
    addSign(THREE, stat, 'MUTFAK', 'YEMEK & DINLENME', 14.45, FLOOR_Y + 2.65, 8.88, 1.4, 0.36, Math.PI);

    // Shared wall between Offices & Mutfak (X = 10.6)
    L.slab(wallIntMat, 10.52, FLOOR_Y, 9.0, 10.68, ceilY0, 21.7);
    L.col(10.50, FLOOR_Y, 9.0, 10.70, ceilY0, 21.7, 'concrete');

    // Shared wall between Ofis 1 and Ofis 2 (Z = 15.2), WIDE connecting doorway X: 7.0..8.5!
    L.slab(wallIntMat, 4.3, FLOOR_Y, 15.12, 7.0, ceilY0, 15.28);
    L.slab(wallIntMat, 7.0, FLOOR_Y + 2.25, 15.12, 8.5, ceilY0, 15.28);
    L.slab(wallIntMat, 8.5, FLOOR_Y, 15.12, 10.6, ceilY0, 15.28);
    L.col(4.3, FLOOR_Y, 15.10, 6.98, ceilY0, 15.30, 'concrete');
    L.col(8.52, FLOOR_Y, 15.10, 10.6, ceilY0, 15.30, 'concrete');
    L.col(6.98, FLOOR_Y + 2.25, 15.10, 8.52, ceilY0, 15.30, 'concrete');
    createHingedDoor('ofis2_ara_kapi', 'Ofis 1-2 Ara Kapisi', 7.0, 15.2, 1.46, 'x', 1.45);
    addSign(THREE, stat, 'OFIS 2', 'YONETIM & SHOWROOM', 9.45, FLOOR_Y + 2.55, 15.08, 1.3, 0.34, Math.PI);

    // Ofis 1 Interior:
    // Masa sırtı batı duvarına dayalı (oturan Doğu +X yönüne bakar -> Fabrika kapısı SOLUNDA, İç Ofis kapısı SAĞINDA!)
    // Üstünde TEK MONİTÖR + yanında BİLGİSAYAR KASASI!
    {
      L.box(ledWarmMat, 1.2, 0.04, 0.5, 7.6, ceilY0 - 0.05, 12.1, { parent: dyn });
      addIntLight(0xffebd0, 6.5, 9.0, 7.6, ceilY0 - 0.3, 12.1);

      // Desk (Z: 11.1..13.1, X: 5.2..6.05) — Chair behind it at X=4.72 backed to West wall X=4.3!
      L.box(woodDark, 0.86, 0.05, 1.95, 5.62, FLOOR_Y + 0.76, 12.1);
      L.box(steelDarkInt, 0.06, 0.74, 1.85, 6.00, FLOOR_Y + 0.37, 12.1);
      L.box(steelDarkInt, 0.80, 0.74, 0.06, 5.62, FLOOR_Y + 0.37, 11.18);
      L.box(steelDarkInt, 0.80, 0.74, 0.06, 5.62, FLOOR_Y + 0.37, 13.02);
      L.col(5.15, FLOOR_Y, 11.1, 6.08, FLOOR_Y + 0.85, 13.1, 'wood');

      // Single Monitor + PC Tower Case right beside it
      const scrMat = L.G.mats.emissive(0x6eb6ff, 1.4);
      L.box(steelDarkInt, 0.05, 0.38, 0.64, 5.68, FLOOR_Y + 1.07, 12.15);
      L.box(scrMat, 0.04, 0.33, 0.58, 5.65, FLOOR_Y + 1.07, 12.15); // screen faces chair (-X)
      L.box(steelDarkInt, 0.14, 0.14, 0.14, 5.68, FLOOR_Y + 0.85, 12.15); // stand
      // PC Tower Case (Kasa) on desk right next to the monitor
      L.box(steelDarkInt, 0.44, 0.46, 0.22, 5.62, FLOOR_Y + 1.02, 11.42, { bevel: 0.01 });
      L.box(ledCoolMat, 0.02, 0.28, 0.03, 5.39, FLOOR_Y + 1.04, 11.42, { parent: dyn });
      // Keyboard & Mouse
      L.box(steelDarkInt, 0.16, 0.02, 0.44, 5.38, FLOOR_Y + 0.80, 12.15);
      L.box(steelDarkInt, 0.11, 0.02, 0.07, 5.38, FLOOR_Y + 0.80, 12.48);

      // Swivel chair with back against West wall (X=4.3)
      L.box(leatherDark, 0.50, 0.10, 0.52, 4.78, FLOOR_Y + 0.46, 12.1);
      L.box(leatherDark, 0.08, 0.64, 0.50, 4.55, FLOOR_Y + 0.78, 12.1);
      L.cyl(steelDarkInt, 0.04, 0.42, 4.78, FLOOR_Y + 0.21, 12.1);

      // Filing cabinet against East partition wall
      L.box(paintGrey, 0.55, 1.35, 0.65, 10.1, FLOOR_Y + 0.68, 13.9);
      L.col(9.8, FLOOR_Y, 13.55, 10.45, FLOOR_Y + 1.36, 14.25, 'metal');
    }

    // Ofis 2 Interior:
    // Masa Ofis 1 ile aynı yönde ama DAHA BÜYÜK; önünde İKİ TANE TEKLİ KOLTUK;
    // Kapıdan girildiğinde (Z=15.2) TAM KARŞINDA bir koltuk, SOLUNDA bir koltuk, ORTALARINDA masa!
    {
      L.box(ledWarmMat, 1.2, 0.04, 0.5, 7.6, ceilY0 - 0.05, 18.4, { parent: dyn });
      addIntLight(0xffe4bd, 7.2, 9.5, 7.6, ceilY0 - 0.3, 18.4);

      // Larger Executive Desk in same orientation (back to West wall, X: 5.2..6.2, Z: 17.2..19.6)
      L.box(woodDark, 1.02, 0.06, 2.38, 5.65, FLOOR_Y + 0.76, 18.4);
      L.box(woodDark, 0.92, 0.74, 2.28, 5.65, FLOOR_Y + 0.37, 18.4);
      L.col(5.12, FLOOR_Y, 17.2, 6.18, FLOOR_Y + 0.82, 19.6, 'wood');
      // Executive chair backed against West wall
      L.box(leatherDark, 0.54, 0.12, 0.56, 4.76, FLOOR_Y + 0.48, 18.4);
      L.box(leatherDark, 0.10, 0.74, 0.54, 4.52, FLOOR_Y + 0.85, 18.4);

      // Two Single Armchairs directly in front of the executive desk (facing West toward desk)
      for (const az of [17.75, 19.05]) {
        L.box(leatherDark, 0.66, 0.40, 0.68, 6.72, FLOOR_Y + 0.20, az, { bevel: 0.02 });
        L.box(leatherDark, 0.14, 0.48, 0.68, 7.00, FLOOR_Y + 0.58, az, { bevel: 0.02 });
        L.box(leatherDark, 0.64, 0.24, 0.10, 6.72, FLOOR_Y + 0.50, az - 0.29);
        L.box(leatherDark, 0.64, 0.24, 0.10, 6.72, FLOOR_Y + 0.50, az + 0.29);
        L.col(6.35, FLOOR_Y, az - 0.36, 7.12, FLOOR_Y + 0.85, az + 0.36, 'wood');
      }

      // Entering from doorway (Z=15.2, X~7.8) facing South (+Z):
      // 1) Directly ahead (Tam karşında) along South wall: Sofa facing North (-Z)
      L.box(leatherDark, 1.95, 0.42, 0.82, 8.35, FLOOR_Y + 0.21, 21.1, { bevel: 0.02 });
      L.box(leatherDark, 1.95, 0.46, 0.16, 8.35, FLOOR_Y + 0.60, 21.45, { bevel: 0.02 });
      L.col(7.35, FLOOR_Y, 20.65, 9.35, FLOOR_Y + 0.85, 21.55, 'wood');

      // 2) On the left (Solunda) along East wall: Sofa facing West (-X)
      L.box(leatherDark, 0.82, 0.42, 1.95, 10.0, FLOOR_Y + 0.21, 18.4, { bevel: 0.02 });
      L.box(leatherDark, 0.16, 0.46, 1.95, 10.35, FLOOR_Y + 0.60, 18.4, { bevel: 0.02 });
      L.col(9.55, FLOOR_Y, 17.4, 10.45, FLOOR_Y + 0.85, 19.4, 'wood');

      // 3) Center Table between the two sofas (Ortalarında da bir masa)
      L.box(woodDark, 1.05, 0.05, 1.05, 8.65, FLOOR_Y + 0.46, 19.2, { bevel: 0.01 });
      L.box(steelDarkInt, 0.85, 0.44, 0.85, 8.65, FLOOR_Y + 0.22, 19.2);
      L.col(8.10, FLOOR_Y, 18.65, 9.20, FLOOR_Y + 0.50, 19.75, 'wood');

      // Display Vitrine tucked on North-West wall (X: 4.5..6.0, Z: 15.7)
      L.box(woodDark, 1.5, 0.45, 0.50, 5.25, FLOOR_Y + 0.22, 15.75);
      L.box(glassMat, 1.46, 1.55, 0.46, 5.25, FLOOR_Y + 1.22, 15.75, { cast: false });
      L.box(ledWarmMat, 1.3, 0.03, 0.28, 5.25, FLOOR_Y + 1.96, 15.75, { parent: dyn });
      for (const sy of [FLOOR_Y + 0.72, FLOOR_Y + 1.28]) {
        L.box(glassMat, 1.38, 0.02, 0.38, 5.25, sy, 15.75, { cast: false });
        for (let sx = 4.7; sx <= 5.8; sx += 0.22) {
          const cup = createGlassCup(THREE, glassMat, brassGold, true);
          cup.position.set(sx, sy + 0.015, 15.75);
          stat.add(cup);
        }
      }
      L.col(4.48, FLOOR_Y, 15.48, 6.02, FLOOR_Y + 2.0, 16.02, 'wood');
    }

    // Mutfak Interior: El yıkama yeri + Buzdolabı + Tüp & Üstünde Büyük Kazan/Tencere + Yemek Masası
    {
      L.box(ledCoolMat, 1.2, 0.04, 0.45, 12.9, ceilY0 - 0.05, 15.5, { parent: dyn });
      addIntLight(0xfff4e0, 7.0, 9.5, 12.9, ceilY0 - 0.3, 15.5);

      // Tall Two-Door Refrigerator (Buzdolabı)
      const fridgeMat = L.MI('steel_bare');
      L.box(fridgeMat, 0.84, 2.02, 0.84, 14.82, FLOOR_Y + 1.01, 12.6, { bevel: 0.02 });
      L.box(steelDarkInt, 0.03, 1.96, 0.04, 14.39, FLOOR_Y + 1.01, 12.6);
      L.col(14.36, FLOOR_Y, 12.15, 15.28, FLOOR_Y + 2.05, 13.05, 'metal');

      // Dedicated Handwashing Sink Station (El Yıkama Yeri)
      L.box(paintWhite, 0.72, 0.88, 2.8, 14.85, FLOOR_Y + 0.44, 15.4);
      L.box(steelGalvInt, 0.74, 0.04, 2.82, 14.85, FLOOR_Y + 0.90, 15.4);
      // Recessed stainless sink basin, chrome faucet, mirror & soap bottle
      L.box(steelDarkInt, 0.48, 0.06, 0.62, 14.82, FLOOR_Y + 0.91, 15.4);
      L.cyl(steelGalvInt, 0.018, 0.28, 15.04, FLOOR_Y + 1.06, 15.4);
      L.cyl(steelGalvInt, 0.016, 0.16, 14.96, FLOOR_Y + 1.18, 15.4, { axis: 'x' });
      L.box(glassMat, 0.03, 0.74, 0.92, 15.22, FLOOR_Y + 1.55, 15.4, { cast: false });
      L.cyl(paintBlue, 0.04, 0.14, 14.98, FLOOR_Y + 0.99, 15.85);
      L.box(paintWhite, 0.04, 0.48, 0.30, 15.20, FLOOR_Y + 1.25, 14.65);
      L.col(14.46, FLOOR_Y, 13.95, 15.28, FLOOR_Y + 1.0, 16.85, 'wood');

      // LPG Gas Cylinder (Tüp) + Floor Gas Burner (Ocak) + Large Cooking Cauldron/Pot (Büyük Kazan/Tencere)
      const lpgTankMat = new THREE.MeshStandardMaterial({ color: 0x3f6e94, roughness: 0.45, metalness: 0.35 });
      const lpgX = 14.65, lpgZ = 18.2;
      L.cyl(lpgTankMat, 0.21, 0.62, lpgX, FLOOR_Y + 0.31, lpgZ);
      L.cyl(lpgTankMat, 0.16, 0.16, lpgX, FLOOR_Y + 0.68, lpgZ, { open: true });
      L.cyl(brassGold, 0.025, 0.08, lpgX, FLOOR_Y + 0.65, lpgZ);
      L.col(lpgX - 0.25, FLOOR_Y, lpgZ - 0.25, lpgX + 0.25, FLOOR_Y + 0.80, lpgZ + 0.25, 'metal');

      // Gas Burner Stand & Large Two-Handled Metal Cauldron / Big Pot sitting on the Burner
      const potX = 14.55, potZ = 19.65;
      L.box(steelDarkInt, 0.78, 0.34, 0.78, potX, FLOOR_Y + 0.17, potZ);
      L.cyl(L.G.mats.emissive(0x389bff, 2.2), 0.22, 0.04, potX, FLOOR_Y + 0.36, potZ, { parent: dyn });
      // Gas hose connecting cylinder to burner
      L.box(rubberMat, 0.03, 0.03, 1.3, potX, FLOOR_Y + 0.22, (lpgZ + potZ) / 2);
      // Giant Aluminium/Stainless Kazan (Cauldron) on top of burner
      const kazanMat = L.MI('aluminium');
      L.cyl(kazanMat, 0.37, 0.48, potX, FLOOR_Y + 0.62, potZ, { seg: 20 });
      L.cyl(kazanMat, 0.38, 0.05, potX, FLOOR_Y + 0.88, potZ, { seg: 20 }); // lid
      L.box(steelDarkInt, 0.16, 0.05, 0.06, potX, FLOOR_Y + 0.93, potZ); // lid handle
      L.box(steelDarkInt, 0.08, 0.04, 0.14, potX - 0.40, FLOOR_Y + 0.72, potZ);
      L.box(steelDarkInt, 0.08, 0.04, 0.14, potX + 0.40, FLOOR_Y + 0.72, potZ);
      L.col(potX - 0.45, FLOOR_Y, potZ - 0.45, potX + 0.45, FLOOR_Y + 0.96, potZ + 0.45, 'metal');

      // Staff Dining Table & 4 Chairs
      L.box(woodPallet, 1.15, 0.05, 1.75, 12.1, FLOOR_Y + 0.75, 16.0);
      L.box(steelDarkInt, 0.06, 0.74, 0.06, 11.6, FLOOR_Y + 0.37, 15.25);
      L.box(steelDarkInt, 0.06, 0.74, 0.06, 12.6, FLOOR_Y + 0.37, 15.25);
      L.box(steelDarkInt, 0.06, 0.74, 0.06, 11.6, FLOOR_Y + 0.37, 16.75);
      L.box(steelDarkInt, 0.06, 0.74, 0.06, 12.6, FLOOR_Y + 0.37, 16.75);
      L.col(11.5, FLOOR_Y, 15.1, 12.7, FLOOR_Y + 0.80, 16.9, 'wood');
      for (const [cx, cz] of [[11.2, 15.6], [11.2, 16.4], [13.0, 15.6], [13.0, 16.4]]) {
        L.box(paintGrey, 0.42, 0.05, 0.42, cx, FLOOR_Y + 0.45, cz);
        L.box(steelDarkInt, 0.38, 0.44, 0.38, cx, FLOOR_Y + 0.22, cz);
      }
    }

    // ------------------------------------------------------------------------
    // 7. SAĞ HOL ÜST: BARDAK YALDIZ TEZGAHLARI — YATAY & SAĞDAN DÖNEN ÇARKLAR
    //    Oturunca kişinin sağında (+X) motor kutusu, yatay (-X) mandrel & bardak
    // ------------------------------------------------------------------------
    const horizontalSpindles = [];
    let turntableSpeed = 1.0;
    {
      L.box(woodDark, 10.8, 0.06, 1.35, 21.8, FLOOR_Y + 0.86, -26.6, { bevel: 0.01 });
      L.box(steelDarkInt, 10.6, 0.82, 1.15, 21.8, FLOOR_Y + 0.41, -26.6);
      L.col(16.3, FLOOR_Y, -27.3, 27.3, FLOOR_Y + 1.0, -25.85, 'wood');
      L.box(steelGalvInt, 10.8, 0.38, 1.25, 21.8, FLOOR_Y + 2.45, -26.6);
      L.box(ledCoolMat, 10.4, 0.04, 0.16, 21.8, FLOOR_Y + 2.24, -26.1, { parent: dyn });
      addIntLight(0xfff6ea, 10, 12, 21.8, FLOOR_Y + 2.15, -25.5);

      for (let i = 0; i < 6; i++) {
        const sx = 17.2 + i * 1.75; // station center X
        const tz = -26.48;

        // Seated operator stool facing North (-Z): right side of operator is +X!
        L.cyl(steelDarkInt, 0.20, 0.04, sx, FLOOR_Y + 0.02, -25.45);
        L.cyl(steelDarkInt, 0.03, 0.48, sx, FLOOR_Y + 0.26, -25.45);
        L.cyl(leatherDark, 0.19, 0.07, sx, FLOOR_Y + 0.52, -25.45);

        // Horizontal Side-Mounted Motor Head on the RIGHT (+X) of seated operator
        const motorX = sx + 0.44;
        const spindleY = FLOOR_Y + 1.08;
        L.box(steelDarkInt, 0.26, 0.30, 0.28, motorX, FLOOR_Y + 1.02, tz);
        L.cyl(paintBlue, 0.10, 0.24, motorX + 0.04, spindleY, tz, { axis: 'x' });

        // Horizontal rotating chuck + glass cup mounted HORIZONTALLY extending leftward (-X)!
        const spindle = new THREE.Group();
        spindle.position.set(motorX - 0.14, spindleY, tz);
        dyn.add(spindle);

        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.20, 12).rotateZ(Math.PI / 2), steelGalvInt);
        shaft.position.x = -0.10;
        spindle.add(shaft);

        const chuck = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.036, 0.06, 16).rotateZ(Math.PI / 2), rubberMat);
        chuck.position.x = -0.20;
        spindle.add(chuck);

        // Glass cup attached horizontally (cup axis along X, open rim facing -X toward operator's brush)
        const cup = createGlassCup(THREE, glassMat, brassGold, true);
        cup.rotation.z = Math.PI / 2; // base sits in chuck at x=-0.22, open rim points -X!
        cup.position.x = -0.22;
        spindle.add(cup);

        horizontalSpindles.push(spindle);

        // Operator hand-rest bar, gold luster ink pot & brush on bench
        L.box(steelGalvInt, 0.36, 0.02, 0.03, sx + 0.08, FLOOR_Y + 0.96, tz + 0.30);
        L.cyl(brassGold, 0.042, 0.075, sx + 0.30, FLOOR_Y + 0.93, tz + 0.28);
        L.box(paintYellow, 0.07, 0.28, 0.07, sx - 0.38, FLOOR_Y + 1.02, tz - 0.24);
        L.box(ledCoolMat, 0.14, 0.03, 0.09, sx - 0.30, FLOOR_Y + 1.15, tz - 0.08, { parent: dyn });
      }

      // Drying rack behind operator aisle
      L.box(steelDarkInt, 7.6, 0.04, 0.90, 21.2, FLOOR_Y + 0.86, -24.0);
      L.box(steelDarkInt, 7.6, 0.04, 0.90, 21.2, FLOOR_Y + 1.38, -24.0);
      for (const lx of [17.5, 20.0, 22.5, 24.9]) {
        L.box(steelDarkInt, 0.06, 1.45, 0.85, lx, FLOOR_Y + 0.72, -24.0);
      }
      for (let gx = 17.8; gx <= 24.6; gx += 0.34) {
        for (const gz of [-24.2, -23.8]) {
          const c1 = createGlassCup(THREE, glassMat, brassGold, true);
          c1.position.set(gx, FLOOR_Y + 0.88, gz);
          stat.add(c1);
          const c2 = createGlassCup(THREE, glassMat, brassGold, false);
          c2.position.set(gx, FLOOR_Y + 1.40, gz);
          stat.add(c2);
        }
      }
      L.col(17.35, FLOOR_Y, -24.48, 25.05, FLOOR_Y + 1.5, -23.52, 'metal');
      addSign(THREE, stat, 'BARDAK YALDIZ TEZGAHLARI', 'YANDAN DONEN YATAY CARKLAR [E]', 21.8, FLOOR_Y + 3.05, -27.55, 4.6, 0.82, 0);

      interactives.push({
        id: 'yaldiz_carklari',
        pos: new THREE.Vector3(21.8, FLOOR_Y + 1.1, -25.8),
        range: 5.5,
        getLabel: () => turntableSpeed > 0.2 ? 'Yatay Yaldiz Carklarini Durdur' : 'Yatay Yaldiz Carklarini Calistir',
        trigger: () => {
          turntableSpeed = turntableSpeed > 0.2 ? 0 : 1.0;
          return turntableSpeed > 0.2 ? 'Yatay yaldiz carklari calistirildi' : 'Yatay yaldiz carklari durduruldu';
        }
      });
    }

    // ------------------------------------------------------------------------
    // 8. CAM TEZYİNAT FIRINI (DOLUM → TÜNEL → ÇIKIŞ)
    // ------------------------------------------------------------------------
    const kilnGlasses = [];
    let kilnRunning = true;
    {
      const kx = 23.6;
      const kw = 3.2;
      const convY = FLOOR_Y + 0.96;

      L.box(steelDarkInt, 2.2, 0.14, 4.6, kx, convY - 0.08, -17.25);
      L.box(steelGalvInt, 1.85, 0.03, 4.5, kx, convY, -17.25);
      for (const lx of [kx - 0.95, kx + 0.95]) {
        for (const lz of [-19.3, -17.3, -15.3]) {
          L.box(steelDarkInt, 0.08, 0.92, 0.08, lx, FLOOR_Y + 0.46, lz);
        }
        L.box(paintYellow, 0.05, 0.12, 4.5, lx, convY + 0.07, -17.25);
      }
      addSign(THREE, stat, 'DOLUM  -->', 'FIRIN GIRIS KONVEYORU', kx, FLOOR_Y + 2.35, -18.8, 2.4, 0.52, Math.PI, '#152028', '#fff', '#58c4b8');

      L.box(paintGrey, kw, 2.05, 23.5, kx, FLOOR_Y + 1.38, -3.25, { bevel: 0.03 });
      for (let lz = -14.5; lz <= 8.0; lz += 2.8) {
        L.box(steelDarkInt, kw + 0.14, 0.42, 0.24, kx, FLOOR_Y + 0.21, lz);
        L.box(steelDarkInt, kw + 0.12, 2.15, 0.18, kx, FLOOR_Y + 1.40, lz);
      }
      for (const cz of [-10.5, -2.5, 5.2]) {
        L.cyl(steelGalvInt, 0.34, WALL_H + 1.2, kx, FLOOR_Y + (WALL_H + 1.2) * 0.5 + 1.5, cz);
      }

      for (const wz of [-11.5, -7.5, -3.5, 0.5, 4.5]) {
        L.box(steelDarkInt, 0.08, 0.54, 1.35, kx - kw / 2 - 0.02, FLOOR_Y + 1.48, wz);
        L.box(kilnGlowMat, 0.05, 0.40, 1.18, kx - kw / 2 - 0.04, FLOOR_Y + 1.48, wz, { parent: dyn });
      }
      L.box(kilnGlowMat, 1.80, 0.55, 0.12, kx, convY + 0.32, -14.98, { parent: dyn });
      L.box(kilnGlowMat, 1.80, 0.55, 0.12, kx, convY + 0.32, 8.48, { parent: dyn });
      addIntLight(0xff7426, 9, 11, kx - 2.3, FLOOR_Y + 1.6, -7.5);
      addIntLight(0xff7426, 9, 11, kx - 2.3, FLOOR_Y + 1.6, 0.5);
      addIntLight(0xff8c42, 8, 10, kx, FLOOR_Y + 1.7, 10.5);

      L.box(paintGrey, 0.55, 1.85, 1.25, kx - kw / 2 - 0.32, FLOOR_Y + 0.94, -13.2);
      const pidMesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.72, 0.72), makePidScreenTexture(THREE));
      pidMesh.position.set(kx - kw / 2 - 0.60, FLOOR_Y + 1.45, -13.2);
      pidMesh.rotation.y = Math.PI;
      dyn.add(pidMesh);
      addSign(THREE, stat, 'CAM TEZYINAT FIRINI', '615 C TAV & YALDIZ PISIRME', kx - kw / 2 - 0.08, FLOOR_Y + 2.85, -3.5, 4.4, 0.78, -Math.PI / 2);

      L.box(steelDarkInt, 2.2, 0.14, 4.6, kx, convY - 0.08, 10.75);
      L.box(steelGalvInt, 1.85, 0.03, 4.5, kx, convY, 10.75);
      for (const lx of [kx - 0.95, kx + 0.95]) {
        for (const lz of [8.8, 10.8, 12.8]) {
          L.box(steelDarkInt, 0.08, 0.92, 0.08, lx, FLOOR_Y + 0.46, lz);
        }
        L.box(paintYellow, 0.05, 0.12, 4.5, lx, convY + 0.07, 10.75);
      }
      addSign(THREE, stat, 'CIKIS', 'SOGUTMA VE KONTROL', kx, FLOOR_Y + 2.35, 12.5, 2.2, 0.52, 0, '#152028', '#fff', '#ffb347');

      L.col(kx - kw / 2 - 0.55, FLOOR_Y, -19.6, kx + kw / 2 + 0.1, FLOOR_Y + 2.8, 13.1, 'metal');

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
        row.position.set(kx, convY + 0.02, isOut ? (8.6 + phase * 4.2) : (-19.3 + phase * 4.2));
        dyn.add(row);
        kilnGlasses.push({ mesh: row, phase, isOut });
      }

      updaters.push((dt) => {
        if (!kilnRunning) return;
        for (const item of kilnGlasses) {
          item.phase = (item.phase + dt * 0.12) % 1;
          item.mesh.position.z = item.isOut
            ? (8.6 + item.phase * 4.2)
            : (-19.3 + item.phase * 4.2);
        }
      });

      interactives.push({
        id: 'firin_konveyor',
        pos: new THREE.Vector3(kx - 1.9, FLOOR_Y + 1.2, -13.2),
        range: 4.5,
        getLabel: () => kilnRunning ? 'Firin Konveyorunu Durdur' : 'Firin Konveyorunu Baslat',
        trigger: () => {
          kilnRunning = !kilnRunning;
          return kilnRunning ? 'Cam Tezyinat Firini konveyoru calisiyor' : 'Cam Tezyinat Firini konveyoru durduruldu';
        }
      });
    }

    // ------------------------------------------------------------------------
    // 9. İLK PAKETLEME (X: 17.2..24.8, Z: 15.2..20.5)
    // ------------------------------------------------------------------------
    {
      L.box(steelDarkInt, 4.8, 0.88, 1.45, 21.0, FLOOR_Y + 0.44, 17.8);
      L.box(woodPallet, 4.9, 0.05, 1.55, 21.0, FLOOR_Y + 0.90, 17.8);
      L.box(ledCoolMat, 1.8, 0.02, 0.95, 22.0, FLOOR_Y + 0.935, 17.8, { parent: dyn });
      for (let gx = 21.25; gx <= 22.75; gx += 0.25) {
        for (const gz of [17.55, 18.05]) {
          const cup = createGlassCup(THREE, glassMat, brassGold, true);
          cup.position.set(gx, FLOOR_Y + 0.95, gz);
          stat.add(cup);
        }
      }
      L.box(cardboard, 0.56, 0.36, 0.46, 19.3, FLOOR_Y + 1.10, 17.8);
      L.box(cardboard, 0.56, 0.36, 0.46, 19.9, FLOOR_Y + 1.10, 17.8);
      addLoadedPallet(17.5, 19.5, 0.02, 2);
      addSign(THREE, stat, 'ILK PAKETLEME', 'KALITE KONTROL & AYIRMA', 21.0, FLOOR_Y + 2.25, 17.8, 2.5, 0.50, 0);
      L.col(18.5, FLOOR_Y, 17.0, 23.5, FLOOR_Y + 1.2, 18.6, 'wood');
    }

    // ------------------------------------------------------------------------
    // 10. VINTAGE & FULLY EQUIPPED ERKEK WC & KADIN WC (X: 28.0..32.8, Z: 6..18)
    //     Dışarıda WC yazısı YOK! Tam donanımlı ve eski fabrika tuvaletleri.
    // ------------------------------------------------------------------------
    {
      const wcX0 = 28.0, wcX1 = 32.8, wcH = FLOOR_Y + 3.25;
      L.slab(concreteDirty, wcX0, 0.0, 6.0, wcX1, FLOOR_Y - 0.02, 18.0);
      L.slab(wcFloorTile, wcX0, FLOOR_Y - 0.02, 6.0, wcX1 - 0.15, FLOOR_Y, 18.0);
      L.col(wcX0, -0.1, 6.0, wcX1, FLOOR_Y, 18.0, 'concrete');

      // Outer structural walls + tiled interior walls + frosted vasistas window band
      L.slab(concreteExt, wcX0, FLOOR_Y, 5.95, wcX1, wcH, 6.20);
      L.slab(wcWallTile, wcX0, FLOOR_Y, 6.20, wcX1 - 0.22, wcH, 6.24);
      L.slab(concreteExt, wcX0, FLOOR_Y, 11.88, wcX1, wcH, 12.12);
      L.slab(wcWallTile, wcX0, FLOOR_Y, 11.84, wcX1 - 0.22, wcH, 11.88);
      L.slab(wcWallTile, wcX0, FLOOR_Y, 12.12, wcX1 - 0.22, wcH, 12.16);
      L.slab(concreteExt, wcX0, FLOOR_Y, 17.80, wcX1, wcH, 18.05);
      L.slab(wcWallTile, wcX0, FLOOR_Y, 17.76, wcX1 - 0.22, wcH, 17.80);

      // East outer wall with high frosted vasistas windows (Y: 2.15..2.75)
      L.slab(concreteExt, wcX1 - 0.24, FLOOR_Y, 6.0, wcX1, FLOOR_Y + 2.15, 18.0);
      L.slab(concreteExt, wcX1 - 0.24, FLOOR_Y + 2.75, 6.0, wcX1, wcH, 18.0);
      L.slab(frostedGlass, wcX1 - 0.14, FLOOR_Y + 2.15, 6.2, wcX1 - 0.10, FLOOR_Y + 2.75, 17.8, { cast: false });
      L.slab(wcWallTile, wcX1 - 0.28, FLOOR_Y, 6.2, wcX1 - 0.24, FLOOR_Y + 2.15, 17.8);
      L.slab(roofExtMat, wcX0 - 0.1, wcH, 5.8, wcX1 + 0.3, wcH + 0.22, 18.2);

      L.col(wcX0, FLOOR_Y, 5.95, wcX1, wcH, 6.24, 'concrete');
      L.col(wcX0, FLOOR_Y, 11.84, wcX1, wcH, 12.16, 'concrete');
      L.col(wcX0, FLOOR_Y, 17.76, wcX1, wcH, 18.05, 'concrete');
      L.col(wcX1 - 0.28, FLOOR_Y, 6.0, wcX1, wcH, 18.0, 'concrete');

      // Helpers for old toilet hardware inside WCs
      function buildOldWashbasin(bx, bz) {
        // Aged pedestal & oval ceramic basin
        L.cyl(porcelainAged, 0.11, 0.68, bx, FLOOR_Y + 0.34, bz);
        L.box(porcelainAged, 0.46, 0.16, 0.54, bx, FLOOR_Y + 0.76, bz, { bevel: 0.03 });
        // Twin vintage metal faucets + drain pipe under sink
        L.cyl(rustPipeMat, 0.025, 0.35, bx + 0.14, FLOOR_Y + 0.56, bz);
        L.cyl(steelGalvInt, 0.015, 0.12, bx, FLOOR_Y + 0.89, bz - 0.21);
        L.cyl(brassGold, 0.014, 0.05, bx - 0.08, FLOOR_Y + 0.87, bz - 0.22);
        L.cyl(brassGold, 0.014, 0.05, bx + 0.08, FLOOR_Y + 0.87, bz - 0.22);
        // Old weathered mirror with rusted metal frame + soap dish
        L.box(rustPipeMat, 0.48, 0.64, 0.03, bx, FLOOR_Y + 1.48, bz - 0.26);
        L.box(glassMat, 0.42, 0.58, 0.035, bx, FLOOR_Y + 1.48, bz - 0.25);
        L.box(porcelainAged, 0.14, 0.04, 0.09, bx + 0.18, FLOOR_Y + 0.86, bz - 0.19);
      }

      function buildToiletStall(sx, sz, isAlaturka) {
        // Wooden aged stall walls & slightly ajar door (openable/walkable right inside!)
        L.box(woodDark, 1.55, 2.05, 0.05, sx, FLOOR_Y + 1.02, sz - 0.78);
        L.box(woodDark, 1.55, 2.05, 0.05, sx, FLOOR_Y + 1.02, sz + 0.78);
        // Ajar door angled outward so you see right in and can step inside
        L.box(woodDark, 0.05, 1.98, 0.78, sx - 0.88, FLOOR_Y + 0.99, sz - 0.44, { r: [0, 0.85, 0] });

        if (isAlaturka) {
          // Traditional Alaturka Hela Taşı + Raised Step + Ribbed Footrests
          L.box(porcelainAged, 0.68, 0.07, 0.74, sx + 0.22, FLOOR_Y + 0.035, sz, { bevel: 0.015 });
          L.box(rubberMat, 0.24, 0.02, 0.42, sx + 0.20, FLOOR_Y + 0.075, sz);
          L.box(porcelainAged, 0.16, 0.03, 0.34, sx + 0.20, FLOOR_Y + 0.08, sz - 0.22);
          L.box(porcelainAged, 0.16, 0.03, 0.34, sx + 0.20, FLOOR_Y + 0.08, sz + 0.22);
        } else {
          // Vintage Alafranga Klozet with porcelain tank & seat
          L.cyl(porcelainAged, 0.19, 0.40, sx + 0.26, FLOOR_Y + 0.20, sz);
          L.box(porcelainAged, 0.42, 0.05, 0.36, sx + 0.26, FLOOR_Y + 0.41, sz, { bevel: 0.02 });
          L.box(porcelainAged, 0.22, 0.44, 0.42, sx + 0.48, FLOOR_Y + 0.64, sz, { bevel: 0.02 });
        }

        // High-mounted old pull-chain cistern & chrome downpipe + brass taharet musluğu + plastic ibrik
        L.box(porcelainAged, 0.24, 0.34, 0.46, sx + 0.60, FLOOR_Y + 2.02, sz, { bevel: 0.02 });
        L.cyl(steelGalvInt, 0.018, 1.75, sx + 0.62, FLOOR_Y + 1.05, sz);
        L.cyl(steelGalvInt, 0.008, 0.65, sx + 0.50, FLOOR_Y + 1.62, sz + 0.24); // pull chain
        L.cyl(brassGold, 0.018, 0.14, sx + 0.58, FLOOR_Y + 0.42, sz + 0.38, { axis: 'x' }); // taharet musluğu
        // Plastic ibrik (water pitcher) + toilet paper holder + brush
        L.cyl(paintBlue, 0.08, 0.22, sx + 0.48, FLOOR_Y + 0.11, sz + 0.48);
        L.cyl(paintWhite, 0.055, 0.11, sx + 0.40, FLOOR_Y + 0.72, sz - 0.72, { axis: 'z' });
      }

      const zonesWC = [
        { label: 'ERKEK WC', zMin: 6.0, signCol: '#2a6cb8', hasUrinals: true },
        { label: 'KADIN WC', zMin: 12.0, signCol: '#b83c6a', hasUrinals: false }
      ];

      for (const wc of zonesWC) {
        const cz = wc.zMin + 3.0;
        // ONLY interior doorway sign (NO sign on outside East facade!)
        addSign(THREE, stat, wc.label, '', 27.64, FLOOR_Y + 2.55, cz, 1.4, 0.36, -Math.PI / 2, '#161b20', '#fff', wc.signCol);

        // Old industrial ceiling bulkhead lamp + exposed galvanized water & cast-iron drain pipes
        L.box(ledWarmMat, 0.42, 0.08, 0.24, 30.1, wcH - 0.08, cz, { parent: dyn });
        addIntLight(0xffdfb0, 5.2, 7.5, 30.1, wcH - 0.35, cz);
        L.cyl(rustPipeMat, 0.06, 3.2, 32.42, FLOOR_Y + 1.6, wc.zMin + 0.42); // cast-iron vertical stack
        L.cyl(steelGalvInt, 0.02, 4.4, 30.3, FLOOR_Y + 2.45, wc.zMin + 0.30, { axis: 'x' }); // water supply pipe

        // Twin aged pedestal sinks along North wall of each WC
        buildOldWashbasin(29.0, wc.zMin + 0.55);
        buildOldWashbasin(30.1, wc.zMin + 0.55);
        // Cleaning bucket, metal trash bin & hanging wall towel
        L.cyl(paintBlue, 0.14, 0.30, 28.35, FLOOR_Y + 0.15, wc.zMin + 0.55);
        L.cyl(steelGalvInt, 0.14, 0.42, 30.85, FLOOR_Y + 0.21, wc.zMin + 0.52);
        L.box(paintWhite, 0.04, 0.48, 0.28, 28.25, FLOOR_Y + 1.25, wc.zMin + 1.05);

        // 2 Enterable Old Stalls along East end (X = 31.75)
        buildToiletStall(31.75, wc.zMin + 2.25, true);
        buildToiletStall(31.75, wc.zMin + 4.15, false);

        // Erkek WC Urinals along South wall
        if (wc.hasUrinals) {
          for (const ux of [29.1, 30.1]) {
            L.box(porcelainAged, 0.34, 0.56, 0.26, ux, FLOOR_Y + 0.96, wc.zMin + 5.56, { bevel: 0.03 });
            L.cyl(brassGold, 0.02, 0.18, ux, FLOOR_Y + 1.34, wc.zMin + 5.65);
          }
          L.box(woodDark, 0.05, 1.15, 0.44, 29.6, FLOOR_Y + 1.05, wc.zMin + 5.52);
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
        min: new THREE.Vector3(4.0, FLOOR_Y, -28.0),
        max: new THREE.Vector3(28.0, 9.0, 22.0)
      },
      setNightFactor,
      update(dt) {
        // Rotate sideways-mounted glasses around their horizontal X axis
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
