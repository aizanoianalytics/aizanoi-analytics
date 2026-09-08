/**
 * water.js — Living Water System
 * Aizanoi Analytics unified worlds runtime
 *
 * Renders the Penkalas river (Aizanoi), Ilissos & Eridanos (Athens),
 * Tiber river (Rome), and freshwater springs/pools with bank-parallel
 * current animation, surface drift, solar shimmer, and proximity audio sampling.
 */

import * as THREE from '../vendor/three.module.js';

/* ── River surface shaders (bank-parallel flow & shimmer) ─── */

const WATER_VERTEX = /* glsl */`
  uniform float uTime;
  uniform float uAmplitude;
  uniform float uFlowSpeed;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vBankDamp;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Bank damping: exactly 0 at bank edges (uv.y == 0 or 1), 1 in mid-channel
    float bankDamp = sin(clamp(uv.y, 0.0, 1.0) * 3.14159265);
    vBankDamp = bankDamp;

    // Waves travel downstream along uv.x (bank-parallel current)
    float flowPhase = uv.x * 0.16 - uTime * (uFlowSpeed * 1.5);
    float wave1 = sin(flowPhase) * (uAmplitude * 0.55);
    float wave2 = sin(flowPhase * 2.1 + uv.y * 3.14159) * (uAmplitude * 0.3);
    float wave3 = cos(flowPhase * 0.8 - uv.y * 1.5) * (uAmplitude * 0.15);
    pos.y += (wave1 + wave2 + wave3) * bankDamp;

    // Perturbed surface normal matching wave slope
    float df = (cos(flowPhase) * 0.55 * 0.16 + cos(flowPhase * 2.1 + uv.y * 3.14159) * 0.3 * 0.336) * uAmplitude;
    float dw = (cos(flowPhase * 2.1 + uv.y * 3.14159) * 3.14159 * 0.3 - sin(flowPhase * 0.8 - uv.y * 1.5) * 1.5 * 0.15) * uAmplitude;
    vNormal = normalize(vec3(-df * bankDamp, 1.0, -dw * bankDamp));

    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const WATER_FRAGMENT = /* glsl */`
  uniform vec3 uWaterColor;
  uniform vec3 uSkyColor;
  uniform vec3 uSunDir;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uFlowSpeed;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vBankDamp;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 normal = normalize(vNormal);

    // Dual-layer bank-parallel surface drift & current ripples
    float streamU1 = vUv.x * 0.35 - uTime * uFlowSpeed;
    float streamU2 = vUv.x * 0.70 - uTime * (uFlowSpeed * 1.4) + sin(vUv.y * 4.0) * 0.35;
    float rip1 = sin(streamU1 + vUv.y * 3.5);
    float rip2 = cos(streamU2 - vUv.y * 4.2);
    float currentTexture = (rip1 + rip2) * 0.5;

    // Micro-normal perturbation for sun shimmer/sparkle drifting with current
    vec3 microNormal = normalize(normal + vec3(rip1 * 0.08, 0.0, rip2 * 0.08));

    // Fresnel reflection — grazing angles are more reflective
    float fresnel = pow(1.0 - max(0.0, dot(viewDir, microNormal)), 3.0);
    fresnel = mix(0.08, 0.88, fresnel);

    // Solar specular glint (subtle shimmer moving with waves)
    vec3 halfDir = normalize(viewDir + normalize(uSunDir));
    float spec = pow(max(0.0, dot(microNormal, halfDir)), 110.0);
    float sheen = pow(max(0.0, dot(microNormal, halfDir)), 22.0) * 0.22;

    // River depth color gradient: deeper in mid-channel, lighter near banks
    vec3 deepCol = uWaterColor * 0.8;
    vec3 shallowCol = uWaterColor * 1.18 + vec3(0.015, 0.035, 0.025);
    vec3 waterBase = mix(deepCol, shallowCol, 1.0 - vBankDamp * 0.5);
    waterBase += currentTexture * 0.035;

    vec3 reflection = uSkyColor * 0.75;
    vec3 color = mix(waterBase, reflection, fresnel);
    color += vec3(1.0, 0.96, 0.88) * (spec * 0.75 + sheen);

    // Gentle edge foam along the banks
    float edgeFoam = smoothstep(0.18, 0.02, vBankDamp) * 0.12 * (0.7 + 0.3 * sin(vUv.x * 0.8 + uTime * 1.8));
    color += vec3(edgeFoam);

    gl_FragColor = vec4(color, uOpacity * (0.65 + vBankDamp * 0.35));
  }
`;

/* ── Spring / Pool circular water shaders ─────────────────── */

const POOL_VERTEX = /* glsl */`
  uniform float uTime;
  uniform float uAmplitude;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Concentric ripples expanding outward from pool center
    vec2 fromCenter = (uv - vec2(0.5)) * 2.0;
    float dist = length(fromCenter);
    float ripple = sin(dist * 16.0 - uTime * 2.2) * uAmplitude * (1.0 - smoothstep(0.65, 1.0, dist));
    pos.y += ripple;

    float dr = cos(dist * 16.0 - uTime * 2.2) * uAmplitude * 16.0 * (1.0 - smoothstep(0.65, 1.0, dist));
    vec2 dir = dist > 0.001 ? fromCenter / dist : vec2(0.0);
    vNormal = normalize(vec3(-dir.x * dr, 1.0, -dir.y * dr));

    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const POOL_FRAGMENT = /* glsl */`
  uniform vec3 uWaterColor;
  uniform vec3 uSkyColor;
  uniform vec3 uSunDir;
  uniform float uOpacity;
  uniform float uTime;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 normal = normalize(vNormal);

    vec2 fromCenter = (vUv - vec2(0.5)) * 2.0;
    float dist = length(fromCenter);

    float fresnel = pow(1.0 - max(0.0, dot(viewDir, normal)), 3.0);
    fresnel = mix(0.06, 0.85, fresnel);

    vec3 halfDir = normalize(viewDir + normalize(uSunDir));
    float spec = pow(max(0.0, dot(normal, halfDir)), 96.0);

    float ripple = sin(dist * 18.0 - uTime * 2.2) * 0.04;
    float shimmer = sin(vWorldPos.x * 2.5 + uTime * 1.8) * cos(vWorldPos.z * 2.5 + uTime * 1.5) * 0.035;

    vec3 waterBase = uWaterColor + ripple + shimmer;
    vec3 reflection = uSkyColor * 0.75;
    vec3 color = mix(waterBase, reflection, fresnel);
    color += vec3(1.0, 0.96, 0.88) * spec * 0.7;

    float rim = smoothstep(0.98, 0.75, dist);
    gl_FragColor = vec4(color, uOpacity * rim);
  }
`;

/* ── Water body class (River / Stream) ────────────────────── */

class WaterBody {
  constructor(scene, points, width, options = {}) {
    this.scene = scene;
    this.points = points;
    this.width = width;
    this.yLevel = options.yLevel ?? 0.05;
    this.amplitude = options.amplitude ?? (width > 20 ? 0.11 : 0.06);
    this.flowSpeed = options.flowSpeed ?? (width > 20 ? 0.52 : 0.40);
    this.color = options.color ?? new THREE.Color(0x3a6a7a);
    this.mesh = null;
    this.material = null;
    this._build();
  }

  _build() {
    const halfW = this.width / 2;
    const verts = [];
    const indices = [];
    const uvs = [];

    let totalLength = 0;
    const segLengths = [0];

    for (let i = 1; i < this.points.length; i++) {
      const dx = this.points[i].x - this.points[i - 1].x;
      const dz = this.points[i].z - this.points[i - 1].z;
      totalLength += Math.hypot(dx, dz);
      segLengths.push(totalLength);
    }

    const SUBDIVS = 8;

    for (let i = 0; i < this.points.length - 1; i++) {
      const p0 = this.points[i];
      const p1 = this.points[i + 1];
      const dx = p1.x - p0.x;
      const dz = p1.z - p0.z;
      const len = Math.hypot(dx, dz);
      const nx = -dz / len;
      const nz = dx / len;

      for (let s = 0; s <= SUBDIVS; s++) {
        if (i > 0 && s === 0) continue;
        const t = s / SUBDIVS;
        const x = p0.x + dx * t;
        const z = p0.z + dz * t;
        const distAlongStream = segLengths[i] + len * t;

        // Left edge (uv.y = 0)
        verts.push(x + nx * halfW, this.yLevel, z + nz * halfW);
        uvs.push(distAlongStream, 0.0);

        // Right edge (uv.y = 1)
        verts.push(x - nx * halfW, this.yLevel, z - nz * halfW);
        uvs.push(distAlongStream, 1.0);
      }
    }

    const vertsPerCross = 2;
    const totalCross = verts.length / 3 / vertsPerCross;
    for (let i = 0; i < totalCross - 1; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    this.material = new THREE.ShaderMaterial({
      vertexShader: WATER_VERTEX,
      fragmentShader: WATER_FRAGMENT,
      uniforms: {
        uTime:       { value: 0 },
        uAmplitude:  { value: this.amplitude },
        uFlowSpeed:  { value: this.flowSpeed },
        uWaterColor: { value: this.color },
        uSkyColor:   { value: new THREE.Color(0.55, 0.72, 0.92) },
        uSunDir:     { value: new THREE.Vector3(0.4, 0.8, -0.3) },
        uOpacity:    { value: 0.75 },
      },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = 10;
    this.scene.add(this.mesh);
  }

  update(dt, sunDir, skyColor) {
    if (!this.material) return;
    this.material.uniforms.uTime.value += dt;
    if (sunDir) this.material.uniforms.uSunDir.value.copy(sunDir);
    if (skyColor) this.material.uniforms.uSkyColor.value.copy(skyColor);
  }

  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.material.dispose();
      this.scene.remove(this.mesh);
    }
  }
}

/* ── Spring/pool (circular water body) ────────────────────── */

class WaterPool {
  constructor(scene, center, radius, options = {}) {
    this.scene = scene;
    const geo = new THREE.CircleGeometry(radius, 24);
    geo.rotateX(-Math.PI / 2);
    geo.translate(center.x, options.yLevel ?? 0.05, center.z);

    this.material = new THREE.ShaderMaterial({
      vertexShader: POOL_VERTEX,
      fragmentShader: POOL_FRAGMENT,
      uniforms: {
        uTime:       { value: 0 },
        uAmplitude:  { value: options.amplitude ?? 0.035 },
        uWaterColor: { value: options.color ?? new THREE.Color(0x3a7a6a) },
        uSkyColor:   { value: new THREE.Color(0.55, 0.72, 0.92) },
        uSunDir:     { value: new THREE.Vector3(0.4, 0.8, -0.3) },
        uOpacity:    { value: 0.7 },
      },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = 10;
    this.scene.add(this.mesh);
  }

  update(dt, sunDir, skyColor) {
    this.material.uniforms.uTime.value += dt;
    if (sunDir) this.material.uniforms.uSunDir.value.copy(sunDir);
    if (skyColor) this.material.uniforms.uSkyColor.value.copy(skyColor);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.scene.remove(this.mesh);
  }
}

/* ── Dense Water Sample Points Generator for Audio Ambience ── */

/**
 * Computes dense sample points along all river polylines and pools
 * for smooth proximity-based water ambience audio without dropouts.
 * @param {Array} waters - WATERS array from city-data.js
 * @param {number} step - maximum spacing between sample points in world units (default 25)
 * @returns {Array<{x: number, z: number}>}
 */
export function buildWaterSamplePoints(waters, step = 25) {
  const pts = [];
  for (const w of (waters || [])) {
    if (Array.isArray(w.points) && w.points.length > 1) {
      for (let i = 0; i < w.points.length - 1; i++) {
        const p0 = w.points[i];
        const p1 = w.points[i + 1];
        const dx = p1.x - p0.x;
        const dz = p1.z - p0.z;
        const len = Math.hypot(dx, dz);
        const count = Math.max(1, Math.ceil(len / step));
        for (let s = 0; s < count; s++) {
          const t = s / count;
          pts.push({ x: p0.x + dx * t, z: p0.z + dz * t });
        }
      }
      const last = w.points[w.points.length - 1];
      pts.push({ x: last.x, z: last.z });
    } else if (typeof w.x === 'number' && typeof w.z === 'number') {
      pts.push({ x: w.x, z: w.z });
    }
  }
  return pts;
}

/* ── Water system manager ─────────────────────────────────── */

export class WaterSystem {
  constructor(scene) {
    this.scene = scene;
    this.bodies = [];
    this.pools = [];
  }

  /**
   * Add a river/stream from WATERS data.
   * @param {{ points: {x,z}[], width: number, flowSpeed?: number, color?: number }} waterData
   */
  addStream(waterData) {
    const points = waterData.points.map(p => ({ x: p.x, z: p.z }));
    const body = new WaterBody(this.scene, points, waterData.width, {
      amplitude: waterData.width > 20 ? 0.11 : 0.06,
      flowSpeed: waterData.flowSpeed ?? (waterData.width > 20 ? 0.52 : 0.40),
      color: new THREE.Color(waterData.color || 0x3a6a7a),
    });
    this.bodies.push(body);
    return body;
  }

  /**
   * Add a spring/pool.
   * @param {{ x: number, z: number, radius: number, color?: number }} poolData
   */
  addPool(poolData) {
    const pool = new WaterPool(this.scene, { x: poolData.x, z: poolData.z }, poolData.radius, {
      color: poolData.color ? new THREE.Color(poolData.color) : undefined,
    });
    this.pools.push(pool);
    return pool;
  }

  /**
   * Build all water features from city data.
   * @param {Array} waters - WATERS array from city-data.js
   */
  buildFromData(waters) {
    for (const w of waters) {
      if (w.type === 'pool' || w.type === 'spring') {
        this.addPool(w);
      } else {
        this.addStream(w);
      }
    }
  }

  update(dt, sunDir, skyColor) {
    for (const body of this.bodies) body.update(dt, sunDir, skyColor);
    for (const pool of this.pools) pool.update(dt, sunDir, skyColor);
  }

  dispose() {
    for (const body of this.bodies) body.dispose();
    for (const pool of this.pools) pool.dispose();
  }
}
