/**
 * water.js — Animated Water System
 * Aizanoi Analytics unified worlds runtime (originally Athens 450-430 BCE reference implementation)
 *
 * Renders the Eridanos stream, Ilissos river, and Kallirrhoe spring
 * with animated vertex displacement and Fresnel reflective shading.
 */

import * as THREE from '../vendor/three.module.js';

/* ── Water surface shader ─────────────────────────────────── */

const WATER_VERTEX = /* glsl */`
  uniform float uTime;
  uniform float uAmplitude;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Multi-frequency wave displacement
    float wave1 = sin(pos.x * 0.8 + uTime * 1.2) * uAmplitude;
    float wave2 = sin(pos.z * 1.1 + uTime * 0.9) * uAmplitude * 0.7;
    float wave3 = sin((pos.x + pos.z) * 0.5 + uTime * 1.5) * uAmplitude * 0.4;
    pos.y += wave1 + wave2 + wave3;

    // Compute perturbed normal
    float dx = cos(pos.x * 0.8 + uTime * 1.2) * uAmplitude * 0.8
             + cos((pos.x + pos.z) * 0.5 + uTime * 1.5) * uAmplitude * 0.2;
    float dz = cos(pos.z * 1.1 + uTime * 0.9) * uAmplitude * 0.77
             + cos((pos.x + pos.z) * 0.5 + uTime * 1.5) * uAmplitude * 0.2;
    vNormal = normalize(vec3(-dx, 1.0, -dz));

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

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 normal = normalize(vNormal);

    // Fresnel effect — more reflective at grazing angles
    float fresnel = pow(1.0 - max(0.0, dot(viewDir, normal)), 3.0);
    fresnel = mix(0.05, 0.85, fresnel);

    // Sun specular highlight
    vec3 halfDir = normalize(viewDir + normalize(uSunDir));
    float spec = pow(max(0.0, dot(normal, halfDir)), 96.0);

    // Caustic-like pattern (animated noise)
    float caustic = sin(vWorldPos.x * 3.0 + uTime * 2.0)
                  * sin(vWorldPos.z * 3.0 + uTime * 1.7) * 0.08;

    // Depth fade at edges (simple y-based)
    float depth = smoothstep(-0.1, 0.6, vWorldPos.y + 0.3);

    // Final color blend
    vec3 waterBase = uWaterColor + caustic;
    vec3 reflection = uSkyColor * 0.7;
    vec3 color = mix(waterBase, reflection, fresnel);
    color += vec3(1.0, 0.95, 0.85) * spec * 0.6;

    // Slight foam at edges (bright rim)
    float foam = smoothstep(0.92, 1.0, sin(vUv.x * 20.0 + uTime) * 0.5 + 0.5) * 0.15;
    color += foam;

    gl_FragColor = vec4(color, uOpacity * (0.6 + depth * 0.4));
  }
`;

/* ── Water body class ─────────────────────────────────────── */

class WaterBody {
  constructor(scene, points, width, options = {}) {
    this.scene = scene;
    this.points = points;
    this.width = width;
    this.yLevel = options.yLevel ?? 0.05;
    this.amplitude = options.amplitude ?? 0.08;
    this.color = options.color ?? new THREE.Color(0x3a6a7a);
    this.mesh = null;
    this.material = null;
    this._build();
  }

  _build() {
    // Create a strip mesh along the polyline
    const shape = new THREE.Shape();
    const halfW = this.width / 2;

    // Build path segments
    const verts = [];
    const indices = [];
    const uvs = [];

    let totalLength = 0;
    const segLengths = [0];

    for (let i = 1; i < this.points.length; i++) {
      const dx = this.points[i].x - this.points[i - 1].x;
      const dz = this.points[i].z - this.points[i - 1].z;
      totalLength += Math.sqrt(dx * dx + dz * dz);
      segLengths.push(totalLength);
    }

    // Subdivide each segment for wave detail
    const SUBDIVS = 8;
    let vertIndex = 0;

    for (let i = 0; i < this.points.length - 1; i++) {
      const p0 = this.points[i];
      const p1 = this.points[i + 1];
      const dx = p1.x - p0.x;
      const dz = p1.z - p0.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      // Perpendicular direction
      const nx = -dz / len;
      const nz = dx / len;

      for (let s = 0; s <= SUBDIVS; s++) {
        if (i > 0 && s === 0) continue; // avoid duplicate vertices at joints
        const t = s / SUBDIVS;
        const x = p0.x + dx * t;
        const z = p0.z + dz * t;
        const u = (segLengths[i] + len * t) / totalLength;

        // Left edge
        verts.push(x + nx * halfW, this.yLevel, z + nz * halfW);
        uvs.push(u, 0);
        // Right edge
        verts.push(x - nx * halfW, this.yLevel, z - nz * halfW);
        uvs.push(u, 1);
      }
    }

    // Build triangle indices
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
      vertexShader: WATER_VERTEX,
      fragmentShader: WATER_FRAGMENT,
      uniforms: {
        uTime:       { value: 0 },
        uAmplitude:  { value: options.amplitude ?? 0.04 },
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

/* ── Water system manager ─────────────────────────────────── */

export class WaterSystem {
  constructor(scene) {
    this.scene = scene;
    this.bodies = [];
    this.pools = [];
  }

  /**
   * Add a river/stream from WATERS data.
   * @param {{ points: {x,z}[], width: number }} waterData
   */
  addStream(waterData) {
    const points = waterData.points.map(p => ({ x: p.x, z: p.z }));
    const body = new WaterBody(this.scene, points, waterData.width, {
      amplitude: waterData.width > 10 ? 0.12 : 0.06,
      color: new THREE.Color(waterData.color || 0x3a6a7a),
    });
    this.bodies.push(body);
    return body;
  }

  /**
   * Add a spring/pool.
   * @param {{ x: number, z: number, radius: number }} poolData
   */
  addPool(poolData) {
    const pool = new WaterPool(this.scene, { x: poolData.x, z: poolData.z }, poolData.radius);
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
