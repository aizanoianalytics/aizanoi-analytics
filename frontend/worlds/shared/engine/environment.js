/**
 * environment.js — Sky, Atmosphere, Lighting & Day/Night Cycle
 * Aizanoi Analytics unified worlds runtime (originally Athens 450-430 BCE reference implementation)
 *
 * Provides:
 *  - Procedural sky dome with gradient, sun disc, and FBM clouds
 *  - Mediterranean atmospheric fog
 *  - Orbital sun with directional light + shadow map
 *  - Ambient fill light (sky color)
 *  - Day/night cycle with smooth color transitions
 *  - Torch/lamp emissive points for nighttime
 */

import * as THREE from '../vendor/three.module.js';

/* ── Time-of-day palette ──────────────────────────────────── */

const PALETTES = {
  dawn:    { sky: [0.85, 0.55, 0.35], ambient: [0.45, 0.35, 0.30], sun: [1.0, 0.65, 0.35], fog: [0.75, 0.50, 0.35], intensity: 0.6 },
  morning: { sky: [0.55, 0.72, 0.92], ambient: [0.50, 0.48, 0.52], sun: [1.0, 0.90, 0.70], fog: [0.65, 0.70, 0.78], intensity: 0.9 },
  noon:    { sky: [0.40, 0.65, 0.95], ambient: [0.55, 0.55, 0.60], sun: [1.0, 0.97, 0.90], fog: [0.60, 0.68, 0.80], intensity: 1.0 },
  afternoon: { sky: [0.50, 0.68, 0.90], ambient: [0.52, 0.50, 0.50], sun: [1.0, 0.88, 0.68], fog: [0.62, 0.66, 0.74], intensity: 0.85 },
  dusk:    { sky: [0.90, 0.45, 0.25], ambient: [0.40, 0.28, 0.25], sun: [1.0, 0.50, 0.20], fog: [0.70, 0.40, 0.28], intensity: 0.5 },
  night:   { sky: [0.06, 0.09, 0.18], ambient: [0.22, 0.24, 0.35], sun: [0.30, 0.38, 0.55], fog: [0.06, 0.08, 0.15], intensity: 0.35 },
};

/*
 * Per-world art direction. Each Historical World gets its own tonal identity
 * instead of one shared "generic Mediterranean noon". A profile is merged over
 * PALETTES as multipliers, so the shared day/night cycle logic stays intact:
 *   - hue shift  : multiply-modifies sky/sun/fog colors (warm gold, cold marble…)
 *   - fogDensity : base + night fog density overrides
 *   - exposure   : renderer tone-mapping exposure bias for the world's mood
 */
const WORLD_MOODS = {
  // Warm Anatolian gold — dry plateau light, honeyed stone, long amber shadows.
  aizanoi: {
    skyTint: [1.06, 0.98, 0.86],
    sunTint: [1.10, 1.00, 0.82],
    fogTint: [1.08, 1.00, 0.88],
    fogDensityDay: 0.0014,
    fogDensityNight: 0.0026,
    exposure: 1.12,
    ambientBoost: 1.0,
  },
  // White marble + Aegean blue — crisp, high-key, strong blue sky bounce.
  athens: {
    skyTint: [0.92, 1.02, 1.12],
    sunTint: [1.04, 1.00, 0.94],
    fogTint: [0.96, 1.02, 1.10],
    fogDensityDay: 0.0012,
    fogDensityNight: 0.0024,
    exposure: 1.16,
    ambientBoost: 1.15,
  },
  // Decayed grandeur — bruised amber light, smokier air, heavier contrast.
  rome: {
    skyTint: [1.04, 0.94, 0.84],
    sunTint: [1.08, 0.92, 0.76],
    fogTint: [1.02, 0.92, 0.82],
    fogDensityDay: 0.0022,
    fogDensityNight: 0.0034,
    exposure: 1.06,
    ambientBoost: 0.88,
  },
  // Modern cold metal — desaturated steel-blue, glassy clean air, neutral sun.
  iga: {
    skyTint: [0.94, 0.98, 1.06],
    sunTint: [1.00, 1.00, 1.02],
    fogTint: [0.95, 0.97, 1.02],
    fogDensityDay: 0.0009,
    fogDensityNight: 0.0018,
    exposure: 1.10,
    ambientBoost: 1.05,
  },
};


const PHASE_TIMES = [
  { phase: 'dawn',      start: 0.20, end: 0.28 },
  { phase: 'morning',   start: 0.28, end: 0.40 },
  { phase: 'noon',      start: 0.40, end: 0.60 },
  { phase: 'afternoon', start: 0.60, end: 0.72 },
  { phase: 'dusk',      start: 0.72, end: 0.82 },
  { phase: 'night',     start: 0.82, end: 1.20 }, // wraps past 1.0
];

/* ── Sky dome shader ──────────────────────────────────────── */

const SKY_VERTEX = /* glsl */`
  varying vec3 vWorldPos;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const SKY_FRAGMENT = /* glsl */`
  uniform vec3 uSkyTop;
  uniform vec3 uSkyHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uTime;

  varying vec3 vWorldPos;

  // Fractional Brownian Motion for clouds
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = rot * p * 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vWorldPos);
    float y = dir.y;

    // Sky gradient
    float t = smoothstep(-0.02, 0.45, y);
    vec3 sky = mix(uSkyHorizon, uSkyTop, t);

    // Sun disc
    float sunDot = dot(dir, normalize(uSunDir));
    float sunDisc = smoothstep(0.9994, 0.9998, sunDot);
    float sunGlow = pow(max(0.0, sunDot), 128.0) * 0.4;
    float sunHalo = pow(max(0.0, sunDot), 8.0) * 0.15;
    sky += uSunColor * (sunDisc * 2.5 + sunGlow + sunHalo);

    // Clouds (FBM noise on a spherical UV)
    vec2 cloudUV = dir.xz / (dir.y + 0.15) * 1.5;
    float clouds = fbm(cloudUV + uTime * 0.008);
    clouds = smoothstep(0.42, 0.72, clouds);
    float cloudBrightness = mix(0.7, 1.0, dot(normalize(uSunDir), vec3(0.0, 1.0, 0.0)));
    vec3 cloudColor = mix(uSkyHorizon * 1.1, vec3(1.0), cloudBrightness);
    sky = mix(sky, cloudColor, clouds * 0.45 * smoothstep(0.0, 0.15, y));

    // Below horizon — ground haze
    if (y < 0.0) {
      sky = mix(uSkyHorizon, sky, smoothstep(-0.08, 0.0, y));
    }

    gl_FragColor = vec4(sky, 1.0);
  }
`;

/* ── Environment class ────────────────────────────────────── */

export class Environment {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.WebGLRenderer} renderer
   * @param {object} [options]
   */
  constructor(scene, renderer, options = {}) {
    this.scene = scene;
    this.renderer = renderer;
    this.timeOfDay = options.startTime ?? 0.42; // default: late morning
    this.cycleSpeed = options.cycleSpeed ?? 0.0; // 0 = static, 0.01 = slow cycle
    this.shadowMapSize = options.shadowMapSize ?? 2048;
    this.shadowRadius = options.shadowRadius ?? 2;
    this.paused = false;
    // Per-world tonal identity (falls back to neutral multipliers).
    this.mood = WORLD_MOODS[options.mood] || {
      skyTint: [1, 1, 1], sunTint: [1, 1, 1], fogTint: [1, 1, 1],
      fogDensityDay: 0.0018, fogDensityNight: 0.003, exposure: 1.1, ambientBoost: 1,
    };

    this._setupSky();
    this._setupLighting();
    this._setupFog();

    // Mood owns the tone-mapping exposure so a world's look is declared once.
    if (renderer && this.mood.exposure) {
      renderer.toneMappingExposure = this.mood.exposure;
    }

    this.torchLights = [];
    this.update(0);
  }

  /* ── Sky dome ─────────────────────────────────────────── */

  _setupSky() {
    const geo = new THREE.SphereGeometry(2000, 32, 16);
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: {
        uSkyTop:     { value: new THREE.Color() },
        uSkyHorizon: { value: new THREE.Color() },
        uSunColor:   { value: new THREE.Color() },
        uSunDir:     { value: new THREE.Vector3(0.4, 0.8, -0.3) },
        uTime:       { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.skyMesh = new THREE.Mesh(geo, mat);
    this.skyMesh.renderOrder = -1000;
    this.scene.add(this.skyMesh);
    this.skyUniforms = mat.uniforms;
  }

  /* ── Lighting ─────────────────────────────────────────── */

  _setupLighting() {
    // Directional sunlight with shadow map
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(this.shadowMapSize, this.shadowMapSize);
    this.sunLight.shadow.radius = this.shadowRadius;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 800;
    // Tight ortho volume around the player: a 300m frustum over 2048px maps
    // ~7cm/texel (parcel-y shadows + heavy acne). 90m ≈ 4.4cm/texel — monuments
    // cast clean shadows; farther scenery fades gracefully instead of strobing.
    this.sunLight.shadow.camera.left = -90;
    this.sunLight.shadow.camera.right = 90;
    this.sunLight.shadow.camera.top = 90;
    this.sunLight.shadow.camera.bottom = -90;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.6;
    this.scene.add(this.sunLight);

    // Shadow camera follows the player for quality
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sunTarget);
    this.sunLight.target = this.sunTarget;

    // Ambient hemisphere light (sky + ground bounce)
    this.hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x8B7355, 0.4);
    this.scene.add(this.hemiLight);

    // Soft ambient fill
    this.ambientLight = new THREE.AmbientLight(0x404050, 0.3);
    this.scene.add(this.ambientLight);
  }

  /* ── Fog ──────────────────────────────────────────────── */

  _setupFog() {
    this.scene.fog = new THREE.FogExp2(0x9AB0C8, 0.0018);
  }

  /* ── Sun orbital position ─────────────────────────────── */

  _sunPosition(t) {
    // t ∈ [0, 1) maps to 24h. Sun rises at ~0.25, sets at ~0.75
    const angle = (t - 0.25) * Math.PI * 2; // 0.25 = sunrise (angle=0)
    const x = Math.cos(angle * 0.7) * 400;
    const y = Math.max(5, Math.sin(angle) * 400);
    const z = -Math.sin(angle * 0.7) * 400;
    return new THREE.Vector3(x, y, z);
  }

  /* ── Palette interpolation ────────────────────────────── */

  _currentPalette(t) {
    // Normalize t to [0, 1)
    t = ((t % 1) + 1) % 1;

    for (let i = 0; i < PHASE_TIMES.length; i++) {
      const phase = PHASE_TIMES[i];
      const next = PHASE_TIMES[(i + 1) % PHASE_TIMES.length];
      let start = phase.start;
      let end = phase.end;

      // Handle wrap-around for night
      let tNorm = t;
      if (end > 1.0) {
        if (t < start) tNorm = t + 1.0;
        end = end; // keep as-is
      }

      if (tNorm >= start && tNorm < end) {
        const blend = (tNorm - start) / (end - start);
        const from = PALETTES[phase.phase];
        const toPhase = PHASE_TIMES[(i + 1) % PHASE_TIMES.length].phase;
        const to = PALETTES[toPhase];
        return this._lerpPalette(from, to, this._smoothStep(blend));
      }
    }

    return PALETTES.noon;
  }

  _lerpPalette(a, b, t) {
    const lerp3 = (a3, b3, t) => a3.map((v, i) => v + (b3[i] - v) * t);
    return {
      sky: lerp3(a.sky, b.sky, t),
      ambient: lerp3(a.ambient, b.ambient, t),
      sun: lerp3(a.sun, b.sun, t),
      fog: lerp3(a.fog, b.fog, t),
      intensity: a.intensity + (b.intensity - a.intensity) * t,
    };
  }

  _smoothStep(t) {
    return t * t * (3 - 2 * t);
  }

  /* ── Torch/lamp management ────────────────────────────── */

  /**
   * Add a torch point light at a world position.
   * These are dimmed during day and brightened at night.
   */
  addTorch(position, color = 0xff8830, intensity = 2.0, distance = 30) {
    const light = new THREE.PointLight(color, 0, distance);
    light.position.copy(position);
    light.castShadow = false;
    this.scene.add(light);
    this.torchLights.push({ light, baseIntensity: intensity });

    // Visual flame mesh
    const flameGeo = new THREE.ConeGeometry(0.15, 0.5, 6);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff6620 });
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.copy(position);
    flame.position.y += 0.3;
    this.scene.add(flame);
    return light;
  }

  /* ── Update (called every frame) ──────────────────────── */

  /**
   * @param {number} dt - Delta time in seconds
   * @param {THREE.Vector3} [playerPos] - Player position for shadow camera follow
   */
  update(dt, playerPos) {
    // Advance time of day
    if (!this.paused && this.cycleSpeed > 0) {
      this.timeOfDay = (this.timeOfDay + dt * this.cycleSpeed) % 1.0;
    }

    const t = this.timeOfDay;
    const palette = this._currentPalette(t);

    // Sun position
    const sunPos = this._sunPosition(t);
    this.sunLight.position.copy(sunPos);
    this.skyUniforms.uSunDir.value.copy(sunPos).normalize();

    // Shadow camera and sky dome follow player
    if (playerPos) {
      this.skyMesh.position.copy(playerPos);
      this.sunTarget.position.set(playerPos.x, 0, playerPos.z);
      this.sunLight.position.set(
        playerPos.x + sunPos.x * 0.5,
        sunPos.y,
        playerPos.z + sunPos.z * 0.5,
      );
    }

    // Apply palette through the world's tonal identity (mood tints multiply
    // the shared day/night palette, keeping the cycle logic in one place).
    const m = this.mood;
    const [sr, sg, sb] = palette.sky;
    const [ar, ag, ab] = palette.ambient;
    const [lr, lg, lb] = palette.sun;
    const [fr, fg, fb] = palette.fog;

    this.skyUniforms.uSkyTop.value.setRGB(sr * m.skyTint[0], sg * m.skyTint[1], sb * m.skyTint[2]);
    this.skyUniforms.uSkyHorizon.value.setRGB(
      (sr * 0.7 + fr * 0.3) * m.fogTint[0],
      (sg * 0.7 + fg * 0.3) * m.fogTint[1],
      (sb * 0.7 + fb * 0.3) * m.fogTint[2],
    );
    this.skyUniforms.uSunColor.value.setRGB(lr * m.sunTint[0], lg * m.sunTint[1], lb * m.sunTint[2]);
    this.skyUniforms.uTime.value += dt;

    // Lighting
    this.sunLight.color.setRGB(lr * m.sunTint[0], lg * m.sunTint[1], lb * m.sunTint[2]);
    this.sunLight.intensity = palette.intensity * 1.8;
    this.hemiLight.color.setRGB(sr * 0.8 * m.skyTint[0], sg * 0.8 * m.skyTint[1], sb * 0.8 * m.skyTint[2]);
    this.hemiLight.groundColor.setRGB(ar * 0.6, ag * 0.5, ab * 0.4);
    this.hemiLight.intensity = palette.intensity * 0.5 * m.ambientBoost;
    this.ambientLight.color.setRGB(ar, ag, ab);
    this.ambientLight.intensity = palette.intensity * 0.35 * m.ambientBoost;

    // Fog
    this.scene.fog.color.setRGB(
      Math.min(1, fr * m.fogTint[0]),
      Math.min(1, fg * m.fogTint[1]),
      Math.min(1, fb * m.fogTint[2]),
    );
    const isNight = t > 0.78 || t < 0.22;
    this.scene.fog.density = isNight ? m.fogDensityNight : m.fogDensityDay;

    // Torches
    const torchFactor = isNight ? 1.0 : (t > 0.7 || t < 0.25) ? 0.4 : 0.0;
    for (const torch of this.torchLights) {
      torch.light.intensity = torch.baseIntensity * torchFactor;
      // Subtle flicker
      if (torchFactor > 0) {
        torch.light.intensity *= 0.85 + Math.random() * 0.3;
      }
    }
  }

  /* ── Time controls ────────────────────────────────────── */

  setTimeOfDay(t) {
    this.timeOfDay = ((t % 1) + 1) % 1;
    this.update(0);
  }

  toggleCycle() {
    if (this.cycleSpeed > 0) {
      this._savedCycleSpeed = this.cycleSpeed;
      this.cycleSpeed = 0;
    } else {
      this.cycleSpeed = this._savedCycleSpeed || 0.008;
    }
  }

  jumpToNoon() { this.setTimeOfDay(0.50); }
  jumpToDusk() { this.setTimeOfDay(0.74); }
  jumpToNight() { this.setTimeOfDay(0.90); }
  jumpToDawn() { this.setTimeOfDay(0.22); }

  get isNight() {
    return this.timeOfDay > 0.78 || this.timeOfDay < 0.22;
  }

  /* ── Dispose ──────────────────────────────────────────── */

  dispose() {
    this.skyMesh.geometry.dispose();
    this.skyMesh.material.dispose();
    this.scene.remove(this.skyMesh);
    this.scene.remove(this.sunLight);
    this.scene.remove(this.sunTarget);
    this.scene.remove(this.hemiLight);
    this.scene.remove(this.ambientLight);
    for (const torch of this.torchLights) {
      this.scene.remove(torch.light);
      torch.light.dispose();
    }
  }
}
