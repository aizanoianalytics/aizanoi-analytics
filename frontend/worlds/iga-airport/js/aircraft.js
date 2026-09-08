/**
 * aircraft.js — Dynamic Airport Traffic & Aircraft Simulation
 * Aizanoi Analytics unified worlds runtime · İGA Istanbul Airport
 *
 * Implements:
 * 1. Pushback & Tug interaction at Gate stand
 * 2. Taxiway ground traffic navigation
 * 3. Takeoff roll, rotation, climb-out and respawn cycle on Runway 34L
 * 4. Final approach, flare, touchdown and rollout on Runway 35R
 * 5. Safe collision clearance: walk-safe runways/taxiways, zero-clipping push protection
 * 6. Night mode navigation, strobe, and beacon illumination
 */

import * as THREE from '../../shared/vendor/three.module.js';
import { buildModernAirliner, buildBaggageTug } from '../../shared/assets/props.js';

export class AirportTrafficSystem {
  constructor(scene, collision) {
    this.scene = scene;
    this.collision = collision;
    this.group = new THREE.Group();
    this.group.name = 'airport-traffic-system';

    this.time = 0;
    this.entities = [];
    this.pushbackState = null;
    this.taxiState = null;
    this.takeoffState = null;
    this.landingState = null;
  }

  init() {
    this._initPushback();
    this._initTaxiing();
    this._initTakeoff();
    this._initLanding();
    this.scene.add(this.group);
  }

  /* ── 1. Pushback & Tug Interaction ─────────────────────── */
  _initPushback() {
    // Gate Pier West A1 Stand: parked facing East (rot = -Math.PI / 2)
    const standX = -555;
    const standZ = 420;
    const standRot = -Math.PI / 2;

    const airliner = buildModernAirliner(standX, standZ, standRot);
    this.group.add(airliner);

    // Tow tug positioned at airliner nose wheel (nose wheel is ~24m forward)
    const tug = buildBaggageTug(standX + 26, standZ, standRot + Math.PI);
    this.group.add(tug);

    this.pushbackState = {
      airliner,
      tug,
      standX,
      standZ,
      standRot,
      cycleDuration: 60,
    };
    this.entities.push({ id: 'pushback-airliner', group: airliner });
  }

  _updatePushback(t) {
    const s = this.pushbackState;
    if (!s) return;

    const cycle = t % s.cycleDuration;
    const { airliner, tug, standX, standZ } = s;

    // Phase 0 (0-10s): Parked at gate, tug hooked
    if (cycle < 10) {
      airliner.position.set(standX, 0, standZ);
      airliner.rotation.set(0, s.standRot, 0);
      tug.position.set(standX + 26, 0, standZ);
      tug.rotation.set(0, s.standRot + Math.PI, 0);
      tug.visible = true;
    }
    // Phase 1 (10-24s): Straight pushback reverse away from terminal
    else if (cycle < 24) {
      const p = (cycle - 10) / 14;
      const ease = p * p * (3 - 2 * p); // smoothstep
      const curX = standX + ease * 45; // moves West away from pier
      airliner.position.set(curX, 0, standZ);
      airliner.rotation.set(0, s.standRot, 0);
      tug.position.set(curX + 26, 0, standZ);
      tug.rotation.set(0, s.standRot + Math.PI, 0);
      tug.visible = true;
    }
    // Phase 2 (24-38s): Pivot turn 90 degrees to align North on taxiway
    else if (cycle < 38) {
      const p = (cycle - 24) / 14;
      const ease = p * p * (3 - 2 * p);
      const curX = standX + 45 + ease * 15;
      const curZ = standZ + ease * 35;
      const curRot = s.standRot + ease * (Math.PI / 2); // -PI/2 to 0 (North)

      airliner.position.set(curX, 0, curZ);
      airliner.rotation.set(0, curRot, 0);

      // Tug stays attached to nose wheel during turn
      const noseOffset = 26;
      const tugX = curX - Math.sin(curRot) * noseOffset;
      const tugZ = curZ + Math.cos(curRot) * noseOffset;
      tug.position.set(tugX, 0, tugZ);
      tug.rotation.set(0, curRot + Math.PI, 0);
      tug.visible = true;
    }
    // Phase 3 (38-46s): Tug disconnects and pulls forward to safety zone
    else if (cycle < 46) {
      const p = (cycle - 38) / 8;
      const ease = p * p * (3 - 2 * p);

      const airX = standX + 60;
      const airZ = standZ + 35;
      airliner.position.set(airX, 0, airZ);
      airliner.rotation.set(0, 0, 0);

      // Tug clears to the side
      const tugX = airX + 26 + ease * 25;
      const tugZ = airZ + ease * 12;
      tug.position.set(tugX, 0, tugZ);
      tug.rotation.set(0, Math.PI * 0.75, 0);
      tug.visible = true;
    }
    // Phase 4 (46-56s): Airliner taxis forward under engine power
    else if (cycle < 56) {
      const p = (cycle - 46) / 10;
      const ease = p * p;
      const airX = standX + 60;
      const airZ = standZ + 35 + ease * 95; // rolls North along taxiway

      airliner.position.set(airX, 0, airZ);
      airliner.rotation.set(0, 0, 0);

      tug.position.set(standX + 85, 0, standZ + 47);
      tug.visible = true;
    }
    // Phase 5 (56-60s): Reset back to stand
    else {
      airliner.position.set(standX, 0, standZ);
      airliner.rotation.set(0, s.standRot, 0);
      tug.position.set(standX + 26, 0, standZ);
      tug.rotation.set(0, s.standRot + Math.PI, 0);
    }
  }

  /* ── 2. Active Taxiing Aircraft ─────────────────────────── */
  _initTaxiing() {
    const airliner = buildModernAirliner(0, 960, 0);
    this.group.add(airliner);

    // Waypoint network along the apron and cross-taxiway
    const waypoints = [
      new THREE.Vector3(450, 0, 960),
      new THREE.Vector3(450, 0, 1140),
      new THREE.Vector3(150, 0, 1140),
      new THREE.Vector3(-150, 0, 1140),
      new THREE.Vector3(-380, 0, 1140),
      new THREE.Vector3(-380, 0, 960),
      new THREE.Vector3(-150, 0, 960),
      new THREE.Vector3(150, 0, 960),
    ];

    // Compute cumulative segment lengths for uniform speed navigation
    const segLengths = [0];
    let totalLen = 0;
    for (let i = 0; i < waypoints.length; i++) {
      const p0 = waypoints[i];
      const p1 = waypoints[(i + 1) % waypoints.length];
      totalLen += p0.distanceTo(p1);
      segLengths.push(totalLen);
    }

    this.taxiState = {
      airliner,
      waypoints,
      segLengths,
      totalLen,
      speed: 15.5, // 15.5 m/s (~30 knots taxi speed)
    };
    this.entities.push({ id: 'taxi-airliner', group: airliner });
  }

  _updateTaxiing(dt) {
    const s = this.taxiState;
    if (!s) return;

    if (s.dist === undefined) s.dist = 0;
    s.dist = (s.dist + s.speed * dt) % s.totalLen;

    // Find current segment
    let segIdx = 0;
    for (let i = 0; i < s.segLengths.length - 1; i++) {
      if (s.dist >= s.segLengths[i] && s.dist < s.segLengths[i + 1]) {
        segIdx = i;
        break;
      }
    }

    const p0 = s.waypoints[segIdx];
    const p1 = s.waypoints[(segIdx + 1) % s.waypoints.length];
    const segDist = s.segLengths[segIdx + 1] - s.segLengths[segIdx];
    const t = (s.dist - s.segLengths[segIdx]) / segDist;

    // Position interpolation
    const curX = p0.x + (p1.x - p0.x) * t;
    const curZ = p0.z + (p1.z - p0.z) * t;

    // Heading calculation: tangent along segment
    const dx = p1.x - p0.x;
    const dz = p1.z - p0.z;
    const targetAngle = Math.atan2(dx, dz);

    s.airliner.position.set(curX, 0, curZ);

    // Smooth heading rotation
    const curY = s.airliner.rotation.y;
    let diff = targetAngle - curY;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    s.airliner.rotation.y += diff * Math.min(dt * 3.5, 1.0);
  }

  /* ── 3. Takeoff Roll + Climb-Out + Respawn ──────────────── */
  _initTakeoff() {
    const airliner = buildModernAirliner(-650, 260, 0);
    this.group.add(airliner);

    this.takeoffState = {
      airliner,
      runwayX: -650, // Runway 34L centerline
      startZ: 260,
      liftoffZ: 960,
      cycleDuration: 44,
    };
    this.entities.push({ id: 'departure-airliner', group: airliner });
  }

  _updateTakeoff(t) {
    const s = this.takeoffState;
    if (!s) return;

    const cycle = t % s.cycleDuration;
    const { airliner, runwayX, startZ, liftoffZ } = s;

    // Phase 0 (0-4s): Line up & hold at threshold
    if (cycle < 4) {
      airliner.position.set(runwayX, 0, startZ);
      airliner.rotation.set(0, 0, 0);
      airliner.visible = true;
    }
    // Phase 1 (4-16s): Takeoff roll on tarmac accelerating down runway
    else if (cycle < 16) {
      const p = (cycle - 4) / 12;
      const rollProgress = Math.pow(p, 1.4); // accelerating
      const curZ = startZ + rollProgress * (liftoffZ - startZ);

      airliner.position.set(runwayX, 0, curZ);
      airliner.rotation.set(0, 0, 0);
      airliner.visible = true;
    }
    // Phase 2 (16-22s): Rotation & initial climb-out
    else if (cycle < 22) {
      const p = (cycle - 16) / 6;
      const ease = p * p;

      const curZ = liftoffZ + p * 320;
      const curY = ease * 38; // liftoff into air
      const pitch = -p * 0.19; // ~11 degrees nose up

      airliner.position.set(runwayX, curY, curZ);
      airliner.rotation.set(pitch, 0, 0);
      airliner.visible = true;
    }
    // Phase 3 (22-38s): High-speed climb-out into departure corridor
    else if (cycle < 38) {
      const p = (cycle - 22) / 16;
      const curZ = liftoffZ + 320 + p * 1350;
      const curY = 38 + p * 210; // climbs to 248m
      const curX = runwayX + Math.sin(p * Math.PI * 0.5) * 65; // gentle right turn

      const pitch = -0.19 * (1.0 - p * 0.35); // settles to 7 degrees climb
      const roll = -0.07 * Math.sin(p * Math.PI); // right bank

      airliner.position.set(curX, curY, curZ);
      airliner.rotation.set(pitch, 0.04 * p, roll);
      airliner.visible = true;
    }
    // Phase 4 (38-44s): Fade out in distance and respawn at threshold
    else {
      airliner.position.set(runwayX, 0, startZ);
      airliner.rotation.set(0, 0, 0);
      airliner.visible = true;
    }
  }

  /* ── 4. Landing Approach, Flare & Rollout ───────────────── */
  _initLanding() {
    const airliner = buildModernAirliner(650, -750, 0);
    this.group.add(airliner);

    this.landingState = {
      airliner,
      runwayX: 650, // Runway 35R centerline
      touchdownZ: 380,
      exitZ: 1040,
      cycleDuration: 42,
    };
    this.entities.push({ id: 'arrival-airliner', group: airliner });
  }

  _updateLanding(t) {
    const s = this.landingState;
    if (!s) return;

    const cycle = t % s.cycleDuration;
    const { airliner, runwayX, touchdownZ, exitZ } = s;

    // Phase 0 (0-17s): Final approach descending on 3-degree glideslope
    if (cycle < 17) {
      const p = cycle / 17;
      const startZ = -750;
      const startY = 185;

      const curZ = startZ + p * (touchdownZ - startZ);
      const curY = startY * (1.0 - p);
      const pitch = -0.05; // slight nose-up flare attitude

      airliner.position.set(runwayX, Math.max(0, curY), curZ);
      airliner.rotation.set(pitch, 0, 0);
      airliner.visible = true;
    }
    // Phase 1 (17-19s): Main gear touchdown & nosewheel touchdown
    else if (cycle < 19) {
      const p = (cycle - 17) / 2;
      const curZ = touchdownZ + p * 80;
      const pitch = -0.05 * (1.0 - p); // nose lowers to tarmac

      airliner.position.set(runwayX, 0, curZ);
      airliner.rotation.set(pitch, 0, 0);
      airliner.visible = true;
    }
    // Phase 2 (19-32s): Deceleration rollout along runway
    else if (cycle < 32) {
      const p = (cycle - 19) / 13;
      const ease = 1.0 - Math.pow(1.0 - p, 1.6); // braking curve
      const curZ = touchdownZ + 80 + ease * (exitZ - touchdownZ - 80);

      airliner.position.set(runwayX, 0, curZ);
      airliner.rotation.set(0, 0, 0);
      airliner.visible = true;
    }
    // Phase 3 (32-38s): High-speed exit turn onto taxiway
    else if (cycle < 38) {
      const p = (cycle - 32) / 6;
      const ease = p * p * (3 - 2 * p);
      const curZ = exitZ + p * 45;
      const curX = runwayX - ease * 85; // turns West onto exit taxiway
      const yaw = -ease * (Math.PI * 0.25);

      airliner.position.set(curX, 0, curZ);
      airliner.rotation.set(0, yaw, 0);
      airliner.visible = true;
    }
    // Phase 4 (38-42s): Reset back to approach start
    else {
      airliner.position.set(runwayX, 185, -750);
      airliner.rotation.set(-0.05, 0, 0);
      airliner.visible = true;
    }
  }

  /* ── 5. Safe Player Proximity & Clearance Handling ──────── */
  _handlePlayerClearance(playerPos) {
    if (!playerPos || !this.collision) return;

    // Check clearance against ground aircraft
    const groundPlanes = [
      this.pushbackState?.airliner,
      this.taxiState?.airliner,
      this.takeoffState?.airliner,
      this.landingState?.airliner,
    ];

    for (const plane of groundPlanes) {
      if (!plane || !plane.visible || plane.position.y > 4.0) continue;
      const dx = playerPos.x - plane.position.x;
      const dz = playerPos.z - plane.position.z;
      const dist = Math.hypot(dx, dz);

      // Safe clearance bubble: 8m from fuselage
      const minClearance = 8.0;
      if (dist > 0.01 && dist < minClearance) {
        const overlap = minClearance - dist;
        const nx = dx / dist;
        const nz = dz / dist;
        const stepDist = Math.min(overlap, 0.45);

        const targetX = playerPos.x + nx * stepDist;
        const targetZ = playerPos.z + nz * stepDist;

        // Safety check: ensure nudge does NOT push player into static geometry
        const wouldCollide = typeof this.collision._checkCollision === 'function'
          ? this.collision._checkCollision(targetX, targetZ, playerPos.y)
          : null;
        if (!wouldCollide) {
          playerPos.x = targetX;
          playerPos.z = targetZ;
        }
      }
    }
  }

  /* ── 6. Master Update Loop ──────────────────────────────── */
  update(dt, isNight = false, playerPos = null) {
    this.time += dt;

    this._updatePushback(this.time);
    this._updateTaxiing(dt);
    this._updateTakeoff(this.time);
    this._updateLanding(this.time);

    // Update aviation navigation and strobe lights on all traffic entities
    for (const e of this.entities) {
      if (typeof e.group?.userData?.updateLights === 'function') {
        e.group.userData.updateLights(this.time, isNight);
      }
    }

    // Protect player collision boundaries
    if (playerPos) {
      this._handlePlayerClearance(playerPos);
    }
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
