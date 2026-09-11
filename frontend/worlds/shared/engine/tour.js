/**
 * tour.js — Guided Historical Tour System (per-world shared runtime)
 *
 * Provides a curated, step-by-step interactive walking/flying tour
 * through the architectural highlights of the active world; the title
 * and description for each stop are owned by the world's TOUR_STOPS array.
 */

import * as THREE from '../vendor/three.module.js';

export class TourSystem {
  /**
   * @param {Array} tourStops - world-owned stop definitions
   * @param {Controls} controls
   * @param {UISystem} uiSystem
   * @param {THREE.Scene} [scene] - when provided, the stop beacon is added to
   *        the world automatically; otherwise set `tour.beaconVisible` hosts.
   */
  constructor(tourStops, controls, uiSystem, scene = null) {
    this.tourStops = tourStops || [];
    this.controls = controls;
    this.uiSystem = uiSystem;
    this._scene = scene;

    this.isActive = false;
    this.currentStop = 0;
    this._isFlying = false;
    this._activeFlight = null;
    this._timer = 0;
    this._stopDuration = 30;

    this._createTourUI();
    this._createStopBeacon();
  }

  /**
   * World-space marker for the current tour stop so visitors can see WHERE
   * the flight is heading and how far away it is — the panel text alone gives
   * no orientation. A flat pulsing ring on the ground plus a faint vertical
   * light shaft (depthWrite off so it never occludes the monument).
   */
  _createStopBeacon() {
    this.beacon = new THREE.Group();

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(7.2, 8.4, 64),
      new THREE.MeshBasicMaterial({
        color: 0xe8b45a,
        transparent: true,
        opacity: 1.0,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(4.2, 5.4, 30, 24, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xe8b45a,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      })
    );
    shaft.position.y = 15;

    this.beacon.add(ring, shaft);
    this._beaconRing = ring;
    this.beacon.visible = false;
    if (this._scene) this._scene.add(this.beacon);
  }

  _createTourUI() {
    this.panel = document.createElement('div');
    this.panel.id = 'tour-bar';

    this.panel.className = 'tour-bar';
    this.panel.innerHTML = `
      <div class="tour-bar__header">
        <span id="tour-step-badge" class="tour-bar__badge">GUIDED TOUR</span>
        <button type="button" id="btn-tour-close" class="tour-bar__close" aria-label="Close guided tour">✖</button>
      </div>
      <div>
        <h3 id="tour-title" class="tour-bar__title">Loading…</h3>
        <p id="tour-desc" class="tour-bar__desc"></p>
      </div>
      <div class="tour-bar__footer">
        <div class="tour-bar__actions">
          <button type="button" id="btn-tour-prev" class="tour-bar__button">◀ Prev</button>
          <button type="button" id="btn-tour-next" class="tour-bar__button tour-bar__button--primary">Next ▶</button>
        </div>
        <span id="tour-auto-timer" class="tour-bar__timer">Auto-advance: 30s</span>
      </div>
    `;

    document.body.appendChild(this.panel);

    // Bindings
    this.panel.querySelector('#btn-tour-close').addEventListener('click', () => this.stop());
    this.panel.querySelector('#btn-tour-prev').addEventListener('click', () => this.prev());
    this.panel.querySelector('#btn-tour-next').addEventListener('click', () => this.next());

    this.badgeEl = this.panel.querySelector('#tour-step-badge');
    this.titleEl = this.panel.querySelector('#tour-title');
    this.descEl = this.panel.querySelector('#tour-desc');
    this.timerEl = this.panel.querySelector('#tour-auto-timer');
  }

  start() {
    if (!this.tourStops.length) return;
    this.isActive = true;
    this.currentStop = 0;
    this.panel.style.display = 'flex';
    this.goToStop(this.currentStop);
  }

  stop() {
    this.isActive = false;
    this._isFlying = false;
    this._activeFlight = null;
    this.panel.style.display = 'none';
    if (this.beacon) this.beacon.visible = false;
    this.controls.enable();
  }

  next() {
    if (this.currentStop < this.tourStops.length - 1) {
      this.currentStop++;
      this.goToStop(this.currentStop);
    } else {
      this.stop();
    }
  }

  prev() {
    if (this.currentStop > 0) {
      this.currentStop--;
      this.goToStop(this.currentStop);
    }
  }

  goToStop(index) {
    const stop = this.tourStops[index];
    if (!stop) return;

    this._stopDuration = stop.duration || 30;
    this._timer = this._stopDuration;

    // Update UI
    this.badgeEl.textContent = `GUIDED TOUR · STOP ${index + 1} / ${this.tourStops.length}`;
    this.titleEl.textContent = stop.title;
    this.descEl.textContent = stop.description;
    if (this.timerEl) this.timerEl.textContent = `Auto-advance: ${this._stopDuration}s`;

    // Find landmark coords
    const building = this.uiSystem.cityData.BUILDINGS.find((b) => b.id === stop.id);
    if (!building) return;

    // Calculate scenic camera point
    const viewDist = Math.max(30, Math.sqrt((building.w || 20) ** 2 + (building.d || 20) ** 2) * 1.2);
    const targetX = building.x - viewDist * 0.7;
    const targetZ = building.z + viewDist * 0.7;
    const angle = Math.atan2(building.x - targetX, building.z - targetZ);

    // Park the marker on the view line between the scenic viewpoint and the
    // monument, ~35% of the way in from the viewpoint — close enough to read
    // clearly on screen, never inside the monument's own footprint where its
    // floor geometry would bury the ring.
    if (this.beacon) {
      this.beacon.position.set(
        building.x + (targetX - building.x) * 0.35,
        (building.y || 0) + 0.15,
        building.z + (targetZ - building.z) * 0.35
      );
      this.beacon.visible = true;
    }

    this._isFlying = true;
    this._activeFlight = this.controls.smoothMoveTo(targetX, targetZ, angle, 2.0);

    // Show info card for additional historical depth
    this.uiSystem.showInfoCard(building, this.uiSystem.cityData.SOURCES);
  }

  update(dt) {
    if (!this.isActive) return;

    // Update camera flight interpolation
    if (this._isFlying && this._activeFlight) {
      const stillFlying = this._activeFlight.update(dt);
      if (!stillFlying) {
        this._isFlying = false;
        this._activeFlight = null;
      }
    }

    // Gentle pulse so the marker reads as "the place we're going", not static clutter
    if (this.beacon?.visible) {
      const s = 1 + Math.sin(performance.now() * 0.003) * 0.06;
      this.beacon.scale.set(s, 1, s);
    }

    // Auto-advance countdown
    if (!this._isFlying) {
      this._timer -= dt;
      if (this.timerEl) {
        this.timerEl.textContent = `Auto-advance: ${Math.max(0, Math.ceil(this._timer))}s`;
      }
      if (this._timer <= 0) {
        this.next();
      }
    }
  }
}
