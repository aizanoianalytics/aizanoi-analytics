/**
 * tour.js — Guided Historical Tour System (per-world shared runtime)
 *
 * Provides a curated, step-by-step interactive walking/flying tour
 * through the architectural highlights of the active world; the title
 * and description for each stop are owned by the world's TOUR_STOPS array.
 */

import * as THREE from '../vendor/three.module.js';

// Human-readable names for the evidence classes the world declares. Kept as
// text rather than only a colour so the distinction is never colour-alone.
const EVIDENCE_LABELS = {
  archaeological: 'Standing archaeological fabric',
  documented: 'Documented in the excavation record'
};

const labelForEvidenceClass = (cls) =>
  EVIDENCE_LABELS[cls] || String(cls).replace(/_/g, ' ');

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
        <button type="button" id="btn-tour-close" class="tour-bar__close" aria-label="Skip and exit the guided tour">✖</button>
      </div>
      <div
        class="tour-bar__progress"
        role="progressbar"
        aria-valuemin="1"
        aria-valuemax="1"
        aria-valuenow="1"
        aria-label="Guided tour progress"
      >
        <div id="tour-progress-fill" class="tour-bar__progress-fill"></div>
      </div>
      <div>
        <h3 id="tour-title" class="tour-bar__title">Loading…</h3>
        <p id="tour-desc" class="tour-bar__desc"></p>
        <p id="tour-evidence" class="tour-bar__evidence"></p>
      </div>
      <div class="tour-bar__footer">
        <div class="tour-bar__actions">
          <button type="button" id="btn-tour-prev" class="tour-bar__button">◀ Prev</button>
          <button type="button" id="btn-tour-next" class="tour-bar__button tour-bar__button--primary">Next ▶</button>
          <button type="button" id="btn-tour-reset" class="tour-bar__button">↺ Restart</button>
        </div>
        <span id="tour-auto-timer" class="tour-bar__timer">Auto-advance: 30s</span>
      </div>
    `;

    document.body.appendChild(this.panel);

    // Bindings
    this.panel.querySelector('#btn-tour-close').addEventListener('click', () => this.stop());
    this.panel.querySelector('#btn-tour-prev').addEventListener('click', () => this.prev());
    this.panel.querySelector('#btn-tour-next').addEventListener('click', () => this.next());
    this.panel.querySelector('#btn-tour-reset').addEventListener('click', () => this.restart());

    this.badgeEl = this.panel.querySelector('#tour-step-badge');
    this.titleEl = this.panel.querySelector('#tour-title');
    this.descEl = this.panel.querySelector('#tour-desc');
    this.timerEl = this.panel.querySelector('#tour-auto-timer');
    this.evidenceEl = this.panel.querySelector('#tour-evidence');
    this.progressEl = this.panel.querySelector('.tour-bar__progress');
    this.progressFillEl = this.panel.querySelector('#tour-progress-fill');
    this.prevBtn = this.panel.querySelector('#btn-tour-prev');
    this.nextBtn = this.panel.querySelector('#btn-tour-next');
  }

  start() {
    if (!this.tourStops.length) return;
    // Remember what opened the tour, so exiting returns focus there instead of
    // dropping the visitor at the top of the document.
    if (!this.isActive) this._returnFocus = document.activeElement;
    this.isActive = true;
    this.panel.style.display = 'flex';
    this.goToStop(this.currentStop);
    // Accessible focus: the visitor is told they are in the tour and can leave.
    // The close button is the focus target rather than the panel itself, so a
    // keyboard or screen-reader user lands on the exit.
    this.closeBtn = this.panel.querySelector('#btn-tour-close');
    this.closeBtn?.focus({ preventScroll: true });
  }

  // Restart from the first stop. Separate from start() so "start" can be
  // resumed mid-tour without losing the visitor's place.
  restart() {
    this.currentStop = 0;
    this.start();
  }

  stop() {
    this.isActive = false;
    this._isFlying = false;
    this._activeFlight = null;
    this.panel.style.display = 'none';
    if (this.beacon) this.beacon.visible = false;
    this.controls.enable();
    // Return focus to whatever opened the tour, so exiting does not dump the
    // visitor at the top of the document.
    this._returnFocus?.focus?.({ preventScroll: true });
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
    const total = this.tourStops.length;
    this.badgeEl.textContent = `GUIDED TOUR · STOP ${index + 1} / ${total}`;
    this.titleEl.textContent = stop.title;
    this.descEl.textContent = stop.description;
    if (this.timerEl) this.timerEl.textContent = `Auto-advance: ${this._stopDuration}s`;

    // Clear progress: a bar that never resets between stops reads as broken.
    const pct = total > 1 ? (index / (total - 1)) * 100 : 100;
    if (this.progressFillEl) this.progressFillEl.style.width = `${pct}%`;
    if (this.progressEl) {
      this.progressEl.setAttribute('aria-valuemax', String(total));
      this.progressEl.setAttribute('aria-valuenow', String(index + 1));
      this.progressEl.setAttribute('aria-valuetext', `Stop ${index + 1} of ${total}: ${stop.title}`);
    }
    // Disable the edges instead of letting them do nothing, so the control set
    // describes what is actually possible here.
    if (this.prevBtn) this.prevBtn.disabled = index === 0;
    if (this.nextBtn) {
      this.nextBtn.textContent = index >= total - 1 ? 'Finish ✓' : 'Next ▶';
    }

    // Find landmark coords
    const building = this.uiSystem.cityData.BUILDINGS.find((b) => b.id === stop.id);
    if (!building) return;

    // Evidence context for this stop, drawn from the same source table the
    // inspection card uses, so a tour stop and a manual inspection never
    // disagree about what the evidence says.
    this.renderEvidence(stop, building);

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

  // Evidence context for the current stop. The stop may name its own evidence
  // class; otherwise the building's declared class is used. Both come from the
  // world's own data, so nothing here invents provenance.
  renderEvidence(stop, building) {
    if (!this.evidenceEl) return;
    // Evidence lives on the building as an object with a level, not a bare
    // string: the same field drives the minimap and inspection colours.
    const cls = stop.evidence || building.evidence?.level || null;
    // The source table is keyed by the same landmark id the stop uses, so the
    // link always corresponds to the monument the visitor is actually looking
    // at rather than to whatever happens to be first in the list.
    const sources = this.uiSystem.cityData?.SOURCES || [];
    const source = sources.find((src) => src.id === stop.id)
      || sources.find((src) => src.id === building.id);

    if (!cls && !source) {
      this.evidenceEl.textContent = '';
      this.evidenceEl.hidden = true;
      return;
    }

    const parts = [];
    if (cls) parts.push(`Evidence: ${labelForEvidenceClass(cls)}`);
    if (source?.title) parts.push(source.title);
    this.evidenceEl.textContent = parts.join(' · ');
    // Evidence classes are distinguished by name here rather than by colour
    // alone, so the distinction survives a monochrome or high-contrast display.
    this.evidenceEl.dataset.evidenceClass = cls || '';
    this.evidenceEl.hidden = false;
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
