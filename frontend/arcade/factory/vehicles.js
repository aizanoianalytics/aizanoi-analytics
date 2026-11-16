(() => {
  'use strict';

  function createSharedMaterials(THREE, mats) {
    // True deep dielectric jet-black clearcoat (never reflects sky into silver-grey)
    const paintBlackGloss = new THREE.MeshPhysicalMaterial({
      color: 0x030406,
      metalness: 0.08,
      roughness: 0.24,
      clearcoat: 0.92,
      clearcoatRoughness: 0.08,
      envMapIntensity: 0.42
    });

    const paintPorscheBlack = new THREE.MeshPhysicalMaterial({
      color: 0x020305,
      metalness: 0.10,
      roughness: 0.20,
      clearcoat: 0.96,
      clearcoatRoughness: 0.06,
      envMapIntensity: 0.45
    });

    const paintDodgeRed = new THREE.MeshPhysicalMaterial({
      color: 0x9e1410,
      metalness: 0.12,
      roughness: 0.24,
      clearcoat: 0.88,
      clearcoatRoughness: 0.10,
      envMapIntensity: 0.65
    });

    const trimBlack = new THREE.MeshStandardMaterial({
      color: 0x16181c,
      metalness: 0.08,
      roughness: 0.78
    });

    const chrome = new THREE.MeshStandardMaterial({
      color: 0xe6ecf2,
      metalness: 0.96,
      roughness: 0.12,
      envMapIntensity: 1.25
    });

    const alloyRim = new THREE.MeshStandardMaterial({
      color: 0xc2c9d1,
      metalness: 0.85,
      roughness: 0.22,
      envMapIntensity: 1.05
    });

    const tireMat = mats && mats.get ? mats.get('tire', { triplanar: true }) : new THREE.MeshStandardMaterial({
      color: 0x141518,
      roughness: 0.88,
      metalness: 0.04
    });

    const glassTint = new THREE.MeshPhysicalMaterial({
      color: 0x0c131a,
      metalness: 0.05,
      roughness: 0.06,
      transparent: true,
      opacity: 0.74,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      envMapIntensity: 0.85
    });

    const glassClear = new THREE.MeshPhysicalMaterial({
      color: 0xd0e4f0,
      metalness: 0.05,
      roughness: 0.05,
      transparent: true,
      opacity: 0.45,
      clearcoat: 1.0,
      envMapIntensity: 0.85
    });

    const leatherTan = new THREE.MeshStandardMaterial({
      color: 0x734a2d,
      roughness: 0.65,
      metalness: 0.04
    });

    const interiorDark = new THREE.MeshStandardMaterial({
      color: 0x20242a,
      roughness: 0.80,
      metalness: 0.06
    });

    const discBrake = new THREE.MeshStandardMaterial({
      color: 0x878f98,
      metalness: 0.80,
      roughness: 0.34
    });

    const caliperGold = new THREE.MeshStandardMaterial({
      color: 0xd69a24,
      metalness: 0.65,
      roughness: 0.30
    });

    const headLamp = new THREE.MeshStandardMaterial({
      color: 0xf6f3ea,
      emissive: 0xfff0cc,
      emissiveIntensity: 0.24,
      roughness: 0.12,
      metalness: 0.20
    });

    const tailLamp = new THREE.MeshStandardMaterial({
      color: 0x991014,
      emissive: 0xd9181c,
      emissiveIntensity: 0.28,
      roughness: 0.20,
      metalness: 0.12
    });

    const amberLamp = new THREE.MeshStandardMaterial({
      color: 0xd97814,
      emissive: 0xff8811,
      emissiveIntensity: 0.24,
      roughness: 0.22
    });

    return {
      paintBlackGloss,
      paintPorscheBlack,
      paintDodgeRed,
      trimBlack,
      chrome,
      alloyRim,
      tireMat,
      glassTint,
      glassClear,
      leatherTan,
      interiorDark,
      discBrake,
      caliperGold,
      headLamp,
      tailLamp,
      amberLamp
    };
  }

  function makePlateTexture(THREE, text, bg = '#f2f4f7', fg = '#111418', accent = '#1348a8') {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 52, 128);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TR', 26, 86);
    ctx.fillStyle = fg;
    ctx.font = '900 66px Impact, Arial Narrow, sans-serif';
    ctx.fillText(text, 282, 68);
    ctx.strokeStyle = '#1b1f24';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 506, 122);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.1 });
  }

  function makeBadgeMaterial(THREE, text, bg = '#0e1014', fg = '#d8dee4') {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 160;
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 160);
    ctx.strokeStyle = 'rgba(220,230,240,0.45)';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, 492, 140);
    ctx.fillStyle = fg;
    ctx.font = '900 72px Impact, Arial Narrow, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 84);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, metalness: 0.35 });
  }

  function addMesh(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, cast = true) {
    const m = new AZ_ENGINE.THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rx || ry || rz) m.rotation.set(rx, ry, rz);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  function buildWheel(THREE, matSet, { radius = 0.35, width = 0.23, style = '5spoke', dual = false } = {}) {
    const g = new THREE.Group();
    const makeSingle = (offsetX) => {
      const wg = new THREE.Group();
      wg.position.x = offsetX;

      const tireR = radius;
      const rimR = radius * 0.62;
      const treadGeo = new THREE.CylinderGeometry(tireR, tireR, width, 28);
      treadGeo.rotateZ(Math.PI / 2);
      addMesh(wg, treadGeo, matSet.tireMat, 0, 0, 0);

      const wallGeo = new THREE.TorusGeometry(tireR * 0.79, (tireR - rimR) * 0.56, 12, 28);
      wallGeo.rotateY(Math.PI / 2);
      addMesh(wg, wallGeo, matSet.tireMat, width * 0.28, 0, 0);
      addMesh(wg, wallGeo, matSet.tireMat, -width * 0.28, 0, 0);

      const rimGeo = new THREE.CylinderGeometry(rimR, rimR, width * 0.84, 24);
      rimGeo.rotateZ(Math.PI / 2);
      addMesh(wg, rimGeo, matSet.alloyRim, 0, 0, 0);

      const brakeGeo = new THREE.CylinderGeometry(rimR * 0.78, rimR * 0.78, 0.04, 20);
      brakeGeo.rotateZ(Math.PI / 2);
      addMesh(wg, brakeGeo, matSet.discBrake, offsetX >= 0 ? -0.02 : 0.02, 0, 0, 0, 0, 0, false);

      const hubGeo = new THREE.CylinderGeometry(rimR * 0.24, rimR * 0.24, width * 0.9, 14);
      hubGeo.rotateZ(Math.PI / 2);
      addMesh(wg, hubGeo, matSet.trimBlack, 0, 0, 0);

      const faceSign = offsetX >= 0 ? 1 : -1;
      if (style === 'phonedial') {
        const face = new THREE.CylinderGeometry(rimR * 0.94, rimR * 0.94, 0.03, 24);
        face.rotateZ(Math.PI / 2);
        addMesh(wg, face, matSet.alloyRim, faceSign * (width * 0.42), 0, 0);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const hole = new THREE.CylinderGeometry(rimR * 0.21, rimR * 0.21, 0.04, 14);
          hole.rotateZ(Math.PI / 2);
          addMesh(wg, hole, matSet.trimBlack, faceSign * (width * 0.43), Math.cos(a) * rimR * 0.56, Math.sin(a) * rimR * 0.56);
        }
        addMesh(wg, new THREE.BoxGeometry(0.05, 0.11, 0.07), matSet.caliperGold, faceSign * (width * 0.12), rimR * 0.42, rimR * 0.34);
      } else if (style === 'truck') {
        const dish = new THREE.CylinderGeometry(rimR * 0.92, rimR * 0.74, width * 0.32, 20);
        dish.rotateZ(Math.PI / 2);
        addMesh(wg, dish, matSet.alloyRim, faceSign * (width * 0.32), 0, 0);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const lug = new THREE.CylinderGeometry(0.018, 0.018, 0.05, 8);
          lug.rotateZ(Math.PI / 2);
          addMesh(wg, lug, matSet.chrome, faceSign * (width * 0.45), Math.cos(a) * rimR * 0.58, Math.sin(a) * rimR * 0.58);
        }
      } else {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const spoke = new THREE.BoxGeometry(0.035, rimR * 0.88, 0.058);
          const sm = addMesh(wg, spoke, matSet.alloyRim, faceSign * (width * 0.42), Math.cos(a) * rimR * 0.45, Math.sin(a) * rimR * 0.45);
          sm.rotation.x = -a;
        }
      }
      g.add(wg);
    };

    if (dual) {
      makeSingle(-width * 0.58);
      makeSingle(width * 0.58);
    } else {
      makeSingle(0);
    }
    return g;
  }

  // Extrude helper with wheel-arch cutouts along X-Z profile (+Z front)
  function extrudeProfile(THREE, pts, width, bevel = 0.04) {
    const s = new THREE.Shape();
    pts.forEach(([z, y], idx) => (idx === 0 ? s.moveTo(z, y) : s.lineTo(z, y)));
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, {
      depth: width,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel * 0.85,
      bevelSegments: 3
    });
    g.rotateY(-Math.PI / 2);
    g.translate(width / 2, 0, 0);
    return g;
  }

  // --------------------------------------------------------------------------
  // 1. 2005 Honda CR-V (Siyah) — 2nd Gen RD4/RD7 SUV with Contoured Tumblehome
  // --------------------------------------------------------------------------
  function buildHondaCRV2005(G, mats) {
    const THREE = G.THREE;
    const geo = G.geo;
    const m = createSharedMaterials(THREE, mats);
    const root = new THREE.Group();
    root.name = 'vehicle_honda_crv_2005';

    // Lower hull with sculpted wheel-arch cutouts (front wheel z=1.35, rear wheel z=-1.30)
    const lowerPts = [
      [-2.18, 0.46],
      [-1.72, 0.46],
      [-1.62, 0.72],
      [-1.30, 0.82],
      [-0.98, 0.72],
      [-0.88, 0.36],
      [0.93, 0.36],
      [1.03, 0.72],
      [1.35, 0.82],
      [1.67, 0.72],
      [1.77, 0.44],
      [2.18, 0.46],
      [2.24, 0.80],
      [2.12, 1.03],
      [1.24, 1.14],
      [-2.14, 1.14],
      [-2.22, 0.82]
    ];
    addMesh(root, extrudeProfile(THREE, lowerPts, 1.66, 0.055), m.paintBlackGloss, 0, 0, 0);

    // Tapered upper cabin greenhouse (narrower than waist for realistic SUV stance)
    const cabinPts = [
      [-2.10, 1.06],
      [1.22, 1.06],
      [0.64, 1.66],
      [-1.84, 1.67],
      [-2.12, 1.14]
    ];
    addMesh(root, extrudeProfile(THREE, cabinPts, 1.44, 0.045), m.paintBlackGloss, 0, 0, 0);

    // Inner dark wheel-well liners so daylight doesn't peek under arches
    addMesh(root, geo.box(1.38, 0.56, 3.60), m.trimBlack, 0, 0.62, 0.0);

    // Matte charcoal 2005 CR-V lower bumpers, side cladding & flared wheel arches
    addMesh(root, geo.bevelBox(1.78, 0.28, 0.38, 0.04), m.trimBlack, 0, 0.38, 2.08);
    addMesh(root, geo.bevelBox(1.78, 0.30, 0.36, 0.04), m.trimBlack, 0, 0.40, -2.08);
    addMesh(root, geo.bevelBox(1.78, 0.16, 1.88, 0.02), m.trimBlack, 0, 0.34, 0.02);

    for (const sx of [-0.84, 0.84]) {
      for (const wz of [1.35, -1.30]) {
        const arch = new THREE.TorusGeometry(0.41, 0.055, 10, 20, Math.PI);
        arch.rotateY(Math.PI / 2);
        addMesh(root, arch, m.trimBlack, sx, 0.38, wz);
      }
      // Side mirrors on A-pillar bases
      addMesh(root, geo.bevelBox(0.18, 0.12, 0.13, 0.025), m.paintBlackGloss, sx * 1.06, 1.15, 0.85);
      // Chrome door handles
      addMesh(root, geo.box(0.03, 0.04, 0.16), m.chrome, sx * 1.03, 0.96, 0.22);
      addMesh(root, geo.box(0.03, 0.04, 0.16), m.chrome, sx * 1.03, 0.96, -0.68);
      // Roof rack side rails
      addMesh(root, geo.bevelBox(0.055, 0.05, 2.15, 0.015), m.trimBlack, sx * 0.68, 1.72, -0.60);
    }
    addMesh(root, geo.box(1.14, 0.03, 0.07), m.trimBlack, 0, 1.74, -0.15);
    addMesh(root, geo.box(1.14, 0.03, 0.07), m.trimBlack, 0, 1.74, -1.25);

    // Tinted glass windows + A/B/C/D pillar accents & visible seats/steering wheel
    addMesh(root, new THREE.BoxGeometry(1.36, 0.56, 0.04), m.glassTint, 0, 1.38, 0.93, -0.78, 0, 0, false);
    addMesh(root, new THREE.BoxGeometry(1.34, 0.50, 0.04), m.glassTint, 0, 1.37, -1.96, 0.44, 0, 0, false);
    for (const sx of [-0.74, 0.74]) {
      addMesh(root, new THREE.BoxGeometry(0.03, 0.42, 0.70), m.glassTint, sx, 1.36, 0.25, 0, 0, 0, false);
      addMesh(root, new THREE.BoxGeometry(0.03, 0.42, 0.72), m.glassTint, sx, 1.36, -0.58, 0, 0, 0, false);
      addMesh(root, new THREE.BoxGeometry(0.03, 0.38, 0.54), m.glassTint, sx, 1.37, -1.38, 0, 0, 0, false);
    }
    addMesh(root, geo.box(1.24, 0.26, 0.40), m.interiorDark, 0, 1.02, 0.62, 0, 0, 0, false);
    addMesh(root, geo.box(0.44, 0.48, 0.15), m.interiorDark, 0.34, 1.12, 0.06, -0.15, 0, 0, false);
    addMesh(root, geo.box(0.44, 0.48, 0.15), m.interiorDark, -0.34, 1.12, 0.06, -0.15, 0, 0, false);

    // 2005 Honda CR-V 2-bar Chrome Grille + H Badge + Swept Multi-reflector Headlights
    addMesh(root, geo.box(0.88, 0.21, 0.06), m.trimBlack, 0, 0.90, 2.22);
    addMesh(root, geo.box(0.84, 0.03, 0.04), m.chrome, 0, 0.94, 2.24);
    addMesh(root, geo.box(0.84, 0.03, 0.04), m.chrome, 0, 0.86, 2.24);
    addMesh(root, geo.bevelBox(0.14, 0.12, 0.05, 0.01), m.chrome, 0, 0.90, 2.25);

    for (const sx of [-0.64, 0.64]) {
      addMesh(root, geo.bevelBox(0.32, 0.18, 0.12, 0.02), m.headLamp, sx, 0.91, 2.18);
      addMesh(root, new THREE.CylinderGeometry(0.068, 0.068, 0.06, 14).rotateX(Math.PI / 2), m.headLamp, sx * 0.96, 0.44, 2.26);
      // Iconic 2005 CR-V vertical stacked D-pillar tail-lights
      addMesh(root, geo.bevelBox(0.11, 0.56, 0.10, 0.02), m.tailLamp, sx * 1.10, 1.32, -2.06);
      addMesh(root, geo.bevelBox(0.11, 0.14, 0.10, 0.01), m.amberLamp, sx * 1.10, 1.08, -2.07);
    }

    // Iconic Tailgate-Mounted Spare Tire + Hard Shell Cover ("CR-V")
    const spareShell = new THREE.CylinderGeometry(0.37, 0.37, 0.23, 24);
    spareShell.rotateX(Math.PI / 2);
    addMesh(root, spareShell, m.paintBlackGloss, 0.12, 0.92, -2.23);
    const spareCap = new THREE.CylinderGeometry(0.25, 0.25, 0.25, 20);
    spareCap.rotateX(Math.PI / 2);
    addMesh(root, spareCap, m.chrome, 0.12, 0.92, -2.24);
    const crvBadge = makeBadgeMaterial(THREE, 'CR-V', '#0c0e12', '#e8edf2');
    addMesh(root, new THREE.CylinderGeometry(0.22, 0.22, 0.02, 20).rotateX(Math.PI / 2), crvBadge, 0.12, 0.92, -2.37);

    // Plates
    const plateMat = makePlateTexture(THREE, '43 AZN 205');
    addMesh(root, new THREE.BoxGeometry(0.52, 0.12, 0.02), plateMat, 0, 0.44, 2.28);
    addMesh(root, new THREE.BoxGeometry(0.52, 0.12, 0.02), plateMat, -0.44, 0.54, -2.28);

    for (const [wx, wz] of [[-0.81, 1.35], [0.81, 1.35], [-0.81, -1.30], [0.81, -1.30]]) {
      const w = buildWheel(THREE, m, { radius: 0.355, width: 0.22, style: '5spoke' });
      w.position.set(wx, 0.355, wz);
      root.add(w);
    }

    root.userData.size = [1.86, 1.78, 4.65];
    root.userData.colliders = [{ min: [-0.95, 0, -2.4], max: [0.95, 1.78, 2.35], surface: 'metal' }];
    root.userData.setLightsOn = (on) => {
      m.headLamp.emissiveIntensity = on ? 2.4 : 0.22;
      m.tailLamp.emissiveIntensity = on ? 1.8 : 0.28;
    };
    return root;
  }

  // --------------------------------------------------------------------------
  // 2. Massive Classic Red Dodge Heavy Truck (~9.4m long, Bed Y = 1.32m,
  //    Önünde iki direk olan model ve kırmızı)
  // --------------------------------------------------------------------------
  function buildDodgeTruck(G, mats) {
    const THREE = G.THREE;
    const geo = G.geo;
    const m = createSharedMaterials(THREE, mats);
    const root = new THREE.Group();
    root.name = 'vehicle_dodge_truck_red';

    const woodBed = mats && mats.get ? mats.get('wood_dark') : new THREE.MeshStandardMaterial({ color: 0x4b3321, roughness: 0.78 });
    const steelChassis = mats && mats.get ? mats.get('steel_dark') : m.trimBlack;

    // Massive Heavy-Duty Steel Ladder Chassis (9.2m long)
    addMesh(root, geo.box(1.18, 0.30, 8.95), steelChassis, 0, 0.88, -0.15);

    // Classic Sculpted Tapered Long Hood (+Z is front, Z: 1.50..3.95)
    const hoodPts = [
      [1.45, 1.15],
      [3.92, 1.15],
      [3.95, 1.98],
      [3.65, 2.22],
      [1.45, 2.36]
    ];
    addMesh(root, extrudeProfile(THREE, hoodPts, 1.62, 0.08), m.paintDodgeRed, 0, 0, 0);
    // Chrome center hood spear trim
    addMesh(root, geo.bevelBox(0.09, 0.06, 2.25, 0.015), m.chrome, 0, 2.34, 2.68);

    // Bulbous Classic Flared Front Fenders with Wheel Cutouts
    const fenderPts = [
      [1.48, 0.92],
      [2.10, 0.92],
      [2.28, 1.32],
      [2.78, 1.48],
      [3.28, 1.32],
      [3.42, 0.90],
      [3.94, 0.90],
      [3.96, 1.66],
      [3.45, 1.92],
      [2.15, 1.92],
      [1.48, 1.72]
    ];
    const fenderGeo = extrudeProfile(THREE, fenderPts, 0.50, 0.06);
    addMesh(root, fenderGeo, m.paintDodgeRed, -1.04, 0, 0);
    addMesh(root, fenderGeo, m.paintDodgeRed, 1.04, 0, 0);

    // High Red Commercial Truck Cab (Z: -0.20..1.50, Top Y: 3.42m)
    const cabLowerPts = [
      [-0.22, 0.94],
      [1.50, 0.94],
      [1.50, 2.28],
      [-0.22, 2.28]
    ];
    addMesh(root, extrudeProfile(THREE, cabLowerPts, 2.48, 0.06), m.paintDodgeRed, 0, 0, 0);

    // Upper Tapered Cab Greenhouse & Rounded Roof Cap
    const cabUpperPts = [
      [-0.20, 2.24],
      [1.48, 2.24],
      [1.28, 3.36],
      [-0.18, 3.38]
    ];
    addMesh(root, extrudeProfile(THREE, cabUpperPts, 2.28, 0.07), m.paintDodgeRed, 0, 0, 0);
    // Sun visor over windshield
    addMesh(root, geo.bevelBox(2.26, 0.10, 0.36, 0.02), m.paintDodgeRed, 0, 3.22, 1.44, 0.22, 0, 0);

    // Split Two-Piece Windshield with Heavy Red Center Pillar & Side Pillars
    addMesh(root, geo.box(0.11, 0.96, 0.10), m.paintDodgeRed, 0, 2.78, 1.42, -0.18, 0, 0);
    addMesh(root, new THREE.BoxGeometry(1.02, 0.88, 0.04), m.glassClear, -0.54, 2.78, 1.41, -0.18, 0, 0, false);
    addMesh(root, new THREE.BoxGeometry(1.02, 0.88, 0.04), m.glassClear, 0.54, 2.78, 1.41, -0.18, 0, 0, false);
    addMesh(root, new THREE.BoxGeometry(1.94, 0.72, 0.04), m.glassClear, 0, 2.82, -0.25, 0, 0, 0, false);

    // Saddle Fuel Tanks, Cab Running Steps, West-Coast Mirrors & Tall Chrome Exhaust Stacks
    for (const sx of [-1.20, 1.20]) {
      addMesh(root, geo.bevelBox(0.40, 0.08, 1.65, 0.02), steelChassis, sx * 1.04, 0.72, 0.72);
      addMesh(root, new THREE.CylinderGeometry(0.28, 0.28, 1.45, 16).rotateX(Math.PI / 2), steelChassis, sx * 0.95, 0.68, 0.55);
      addMesh(root, new THREE.BoxGeometry(0.03, 0.78, 1.12), m.glassClear, sx * 0.98, 2.78, 0.65, 0, 0, 0, false);
      // West-Coast Chrome Mirrors
      addMesh(root, geo.box(0.05, 0.52, 0.22), m.chrome, sx * 1.25, 2.58, 1.16);
      addMesh(root, geo.box(0.36, 0.035, 0.035), m.chrome, sx * 1.10, 2.80, 1.16);
      addMesh(root, geo.box(0.36, 0.035, 0.035), m.chrome, sx * 1.10, 2.36, 1.16);
      // Tall Vertical Chrome Exhaust Stacks behind cab
      addMesh(root, new THREE.CylinderGeometry(0.075, 0.075, 2.85, 14), m.chrome, sx * 1.06, 2.38, -0.42);
      addMesh(root, new THREE.CylinderGeometry(0.105, 0.105, 1.35, 14), steelChassis, sx * 1.06, 2.02, -0.42);
    }

    // Wide Chrome Horizontal Slatted Radiator Grille + DODGE Badge + Twin Chrome Round Headlamps
    addMesh(root, geo.bevelBox(1.48, 0.98, 0.12, 0.03), m.chrome, 0, 1.68, 3.98);
    addMesh(root, geo.box(1.34, 0.82, 0.08), m.trimBlack, 0, 1.68, 4.00);
    for (let gy = 1.32; gy <= 2.04; gy += 0.14) {
      addMesh(root, geo.box(1.32, 0.035, 0.10), m.chrome, 0, gy, 4.01);
    }
    const dodgeBadge = makeBadgeMaterial(THREE, 'DODGE', '#8f1410', '#f0f4f8');
    addMesh(root, new THREE.BoxGeometry(0.64, 0.15, 0.04), dodgeBadge, 0, 2.15, 4.02);

    for (const sx of [-1.06, 1.06]) {
      const bezel = new THREE.CylinderGeometry(0.17, 0.17, 0.14, 18).rotateX(Math.PI / 2);
      addMesh(root, bezel, m.chrome, sx, 1.38, 3.84);
      const bulb = new THREE.CylinderGeometry(0.135, 0.135, 0.15, 18).rotateX(Math.PI / 2);
      addMesh(root, bulb, m.headLamp, sx, 1.38, 3.85);
      addMesh(root, geo.bevelBox(0.12, 0.09, 0.24, 0.015), m.amberLamp, sx, 1.94, 3.55);
    }
    for (let cx = -0.72; cx <= 0.72; cx += 0.36) {
      addMesh(root, geo.bevelBox(0.10, 0.08, 0.12, 0.015), m.amberLamp, cx, 3.44, 1.15);
    }

    // Massive Chrome Front Bumper + TWO LONGER FRONT GUIDE POLES WITH BALLS ON TOP ("değnekler biraz daha uzun, uçlarında top")
    addMesh(root, geo.bevelBox(2.74, 0.36, 0.28, 0.04), m.chrome, 0, 0.80, 4.20);
    for (const px of [-1.14, 1.14]) {
      // Long slender vertical guide pole extending above bumper/fender line
      addMesh(root, new THREE.CylinderGeometry(0.036, 0.042, 1.92, 12), m.chrome, px, 1.76, 4.26);
      // Chrome collar base & shiny ball on top of each pole
      addMesh(root, new THREE.CylinderGeometry(0.065, 0.065, 0.08, 12), m.trimBlack, px, 0.98, 4.26);
      addMesh(root, new THREE.SphereGeometry(0.095, 16, 14), m.chrome, px, 2.74, 4.26);
      addMesh(root, new THREE.SphereGeometry(0.065, 12, 10), m.amberLamp, px, 2.83, 4.26);
    }

    // Normal Heavy Commercial Steel Cargo Bed (NO wooden slats/stakes — clean normal truck bed!)
    // Deck at Y = 1.32m, Z: -4.85..-0.55 (4.3m long x 2.74m wide)
    addMesh(root, geo.box(2.74, 0.16, 4.32), steelChassis, 0, 1.24, -2.70);
    addMesh(root, geo.bevelBox(2.78, 1.05, 0.12, 0.02), m.paintDodgeRed, 0, 1.82, -0.58);
    addMesh(root, geo.bevelBox(2.78, 0.88, 0.12, 0.02), m.paintDodgeRed, 0, 1.74, -4.82);
    for (const sx of [-1.34, 1.34]) {
      addMesh(root, geo.bevelBox(0.12, 0.88, 4.30, 0.02), m.paintDodgeRed, sx, 1.74, -2.70);
      addMesh(root, geo.box(0.14, 0.08, 4.26), m.chrome, sx * 1.01, 2.18, -2.70);
      for (let sz = -4.3; sz <= -1.1; sz += 1.06) {
        addMesh(root, geo.box(0.06, 0.84, 0.08), m.paintDodgeRed, sx * 1.03, 1.74, sz);
      }
    }
    // Cargo inside bed: 3 large wooden pallets of glass cartons
    const palletMat = mats && mats.get ? mats.get('wood_pallet') : woodBed;
    const boxMat = mats && mats.get ? mats.get('cardboard') : new THREE.MeshStandardMaterial({ color: 0x9b7e58, roughness: 0.82 });
    for (const pz of [-1.45, -2.75, -4.05]) {
      addMesh(root, geo.box(1.95, 0.16, 1.05), palletMat, 0, 1.40, pz);
      addMesh(root, geo.bevelBox(1.80, 0.95, 0.95, 0.025), boxMat, 0, 1.96, pz);
    }

    // Rear bumper, mudflaps, tail lamps & plates
    addMesh(root, geo.box(2.72, 0.18, 0.22), steelChassis, 0, 0.88, -4.90);
    for (const sx of [-1.05, 1.05]) {
      addMesh(root, geo.bevelBox(0.32, 0.14, 0.06, 0.01), m.tailLamp, sx, 1.02, -4.92);
      addMesh(root, geo.box(0.55, 0.50, 0.04), m.trimBlack, sx, 0.45, -4.75);
    }
    const plateMat = makePlateTexture(THREE, '43 DDG 78');
    addMesh(root, new THREE.BoxGeometry(0.64, 0.15, 0.02), plateMat, 0, 0.78, 4.36);
    addMesh(root, new THREE.BoxGeometry(0.64, 0.15, 0.02), plateMat, 0, 0.88, -5.02);

    // Front single wheels + Dual Rear Tandem Axles (Radius = 0.58m!)
    for (const [wx, wz, dual] of [
      [-1.14, 2.78, false],
      [1.14, 2.78, false],
      [-1.12, -2.10, true],
      [1.12, -2.10, true],
      [-1.12, -3.55, true],
      [1.12, -3.55, true]
    ]) {
      const w = buildWheel(THREE, m, { radius: 0.58, width: 0.30, style: 'truck', dual });
      w.position.set(wx, 0.58, wz);
      root.add(w);
    }

    root.userData.size = [2.90, 3.52, 9.45];
    root.userData.colliders = [{ min: [-1.45, 0, -5.0], max: [1.45, 3.52, 4.4], surface: 'metal' }];
    root.userData.setLightsOn = (on) => {
      m.headLamp.emissiveIntensity = on ? 2.6 : 0.24;
      m.tailLamp.emissiveIntensity = on ? 1.8 : 0.28;
      m.amberLamp.emissiveIntensity = on ? 1.6 : 0.24;
    };
    return root;
  }

  // --------------------------------------------------------------------------
  // 3. Real Black Porsche 928S — Multi-Section Sculpted Grand Tourer
  // --------------------------------------------------------------------------
  function buildPorsche928S(G, mats) {
    const THREE = G.THREE;
    const geo = G.geo;
    const m = createSharedMaterials(THREE, mats);
    const root = new THREE.Group();
    root.name = 'vehicle_porsche_928s_black';

    // 1. Sleek Lower Body Chassis with Wheel Arches & Wide Low Nose (+Z is front)
    const lowerPts = [
      [-2.16, 0.30],
      [-1.70, 0.30],
      [-1.56, 0.58],
      [-1.22, 0.68],
      [-0.88, 0.58],
      [-0.76, 0.22],
      [0.92, 0.22],
      [1.04, 0.58],
      [1.36, 0.68],
      [1.68, 0.58],
      [1.80, 0.30],
      [2.20, 0.32],
      [2.28, 0.50], // integrated polyurethane front nose cone
      [2.16, 0.66],
      [0.86, 0.87], // long V8 hood line
      [-1.90, 0.87], // beltline
      [-2.24, 0.68], // curved 928 tail
      [-2.22, 0.36]
    ];
    addMesh(root, extrudeProfile(THREE, lowerPts, 1.76, 0.075), m.paintPorscheBlack, 0, 0, 0);

    // Inner dark wheel well core
    addMesh(root, geo.box(1.42, 0.42, 3.60), m.trimBlack, 0, 0.44, 0.0);

    // 2. Narrower Tapered Fastback Coupe Greenhouse (gives authentic wide-hip GT silhouette!)
    const cabinPts = [
      [-1.92, 0.84],
      [0.74, 0.84],
      [0.14, 1.24], // steeply raked windshield
      [-0.74, 1.25], // short coupe roof crown
      [-1.92, 0.86]  // sweeping fastback glass hatch slope
    ];
    addMesh(root, extrudeProfile(THREE, cabinPts, 1.36, 0.055), m.paintPorscheBlack, 0, 0, 0);

    // Muscular wide front & rear haunch flares + teardrop side mirrors
    for (const sx of [-0.84, 0.84]) {
      addMesh(root, geo.bevelBox(0.24, 0.34, 1.38, 0.06), m.paintPorscheBlack, sx, 0.54, -1.26);
      addMesh(root, geo.bevelBox(0.18, 0.30, 1.22, 0.05), m.paintPorscheBlack, sx, 0.52, 1.36);
      addMesh(root, geo.bevelBox(0.16, 0.09, 0.12, 0.03), m.paintPorscheBlack, sx * 1.12, 0.90, 0.48);
      addMesh(root, geo.box(0.03, 0.03, 0.14), m.trimBlack, sx * 1.12, 0.72, -0.35);
    }

    // Lower polyurethane chin splitter & cooling intake grilles
    addMesh(root, geo.bevelBox(1.74, 0.08, 0.24, 0.02), m.trimBlack, 0, 0.22, 2.18);
    addMesh(root, geo.box(1.18, 0.11, 0.06), m.trimBlack, 0, 0.35, 2.26);

    // Iconic Black 928S Rear Wing Spoiler on tail
    addMesh(root, geo.bevelBox(1.66, 0.07, 0.24, 0.02), m.trimBlack, 0, 0.94, -1.98, -0.10, 0, 0);
    addMesh(root, geo.box(0.08, 0.12, 0.12), m.trimBlack, -0.74, 0.88, -1.98);
    addMesh(root, geo.box(0.08, 0.12, 0.12), m.trimBlack, 0.74, 0.88, -1.98);

    // Steep Windshield + Side Quarter Windows + Wraparound Glass Rear Hatch
    addMesh(root, new THREE.BoxGeometry(1.30, 0.52, 0.04), m.glassTint, 0, 1.05, 0.48, -0.96, 0, 0, false);
    addMesh(root, new THREE.BoxGeometry(1.24, 0.84, 0.04), m.glassTint, 0, 1.07, -1.33, 1.24, 0, 0, false);
    for (const sx of [-0.71, 0.71]) {
      addMesh(root, new THREE.BoxGeometry(0.03, 0.30, 0.72), m.glassTint, sx, 1.04, -0.18, 0, 0, 0, false);
      addMesh(root, new THREE.BoxGeometry(0.03, 0.24, 0.50), m.glassTint, sx * 0.97, 1.02, -0.92, 0, 0, 0, false);
    }

    // Detailed Tan Leather Bucket Seats & Console inside
    addMesh(root, geo.box(1.20, 0.18, 0.36), m.interiorDark, 0, 0.72, 0.30, 0, 0, 0, false);
    addMesh(root, geo.box(0.42, 0.42, 0.14), m.leatherTan, 0.32, 0.77, -0.26, -0.25, 0, 0, false);
    addMesh(root, geo.box(0.42, 0.42, 0.14), m.leatherTan, -0.32, 0.77, -0.26, -0.25, 0, 0, false);

    // Signature Porsche 928S Recessed Frog-Eye Circular Headlights + Nose Indicators
    for (const sx of [-0.66, 0.66]) {
      const pod = new THREE.CylinderGeometry(0.115, 0.115, 0.08, 18);
      pod.rotateX(Math.PI / 2 - 0.55);
      addMesh(root, pod, m.chrome, sx, 0.71, 2.02);
      const lens = new THREE.CylinderGeometry(0.095, 0.095, 0.09, 18);
      lens.rotateX(Math.PI / 2 - 0.55);
      addMesh(root, lens, m.headLamp, sx, 0.715, 2.025);
      // Lower nose cone recessed fog/turn clusters
      addMesh(root, geo.bevelBox(0.24, 0.08, 0.05, 0.01), m.amberLamp, sx * 0.94, 0.48, 2.26);
      // Wide flush rear tail lights
      addMesh(root, geo.bevelBox(0.44, 0.13, 0.06, 0.015), m.tailLamp, sx * 0.90, 0.63, -2.26);
      addMesh(root, geo.bevelBox(0.14, 0.13, 0.06, 0.015), m.amberLamp, sx * 1.18, 0.63, -2.25);
    }

    // Rear badge & twin dark-chrome exhaust tips
    const pBadge = makeBadgeMaterial(THREE, '928 S', '#040507', '#d5dce4');
    addMesh(root, new THREE.BoxGeometry(0.46, 0.12, 0.03), pBadge, 0, 0.63, -2.27);
    for (const ex of [-0.56, -0.44]) {
      const pipe = new THREE.CylinderGeometry(0.038, 0.038, 0.22, 12).rotateX(Math.PI / 2);
      addMesh(root, pipe, m.chrome, ex, 0.23, -2.26);
    }

    const plateMat = makePlateTexture(THREE, '43 P 928');
    addMesh(root, new THREE.BoxGeometry(0.50, 0.11, 0.02), plateMat, 0, 0.41, 2.29);
    addMesh(root, new THREE.BoxGeometry(0.50, 0.11, 0.02), plateMat, 0, 0.44, -2.28);

    // Porsche Phone-Dial Alloy Wheels
    for (const [wx, wz, width] of [
      [-0.86, 1.36, 0.22],
      [0.86, 1.36, 0.22],
      [-0.89, -1.22, 0.26],
      [0.89, -1.22, 0.26]
    ]) {
      const w = buildWheel(THREE, m, { radius: 0.325, width, style: 'phonedial' });
      w.position.set(wx, 0.325, wz);
      root.add(w);
    }

    root.userData.size = [1.94, 1.32, 4.62];
    root.userData.colliders = [{ min: [-0.97, 0, -2.35], max: [0.97, 1.32, 2.35], surface: 'metal' }];
    root.userData.setLightsOn = (on) => {
      m.headLamp.emissiveIntensity = on ? 2.5 : 0.24;
      m.tailLamp.emissiveIntensity = on ? 1.8 : 0.28;
    };
    return root;
  }

  window.AZ_VEHICLES = {
    buildHondaCRV2005,
    buildDodgeTruck,
    buildPorsche928S
  };
})();
