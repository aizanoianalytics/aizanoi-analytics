/**
 * ui.js — Comprehensive HUD, Minimap, Evidence Lens, Teleport Menu, & Source Dialogs
 * Athens 450-430 BCE · AAA Rebuild
 */

export class UISystem {
  constructor(cityData, camera, collisionSystem) {
    this.cityData = cityData;
    this.camera = camera;
    this.collisionSystem = collisionSystem;

    this.evidenceActive = false;
    this.minimapVisible = true;
    this.onTeleport = null; // callback set by main.js

    this.evidenceColors = {
      archaeological: '#77b989',
      documented: '#d2c678',
      plausible: '#d59a55',
      atmospheric: '#c98778',
      disputed: '#c66b78',
    };

    this._cacheDOM();
    this._bindDOMEvents();
    this._populateEvidenceList();
    this._populateTeleportMenu();
  }

  _cacheDOM() {
    this.minimapWrapper = document.getElementById('minimap-wrapper');
    this.minimapCanvas = document.getElementById('minimap');
    if (this.minimapCanvas) {
      this.minimapCanvas.width = 220;
      this.minimapCanvas.height = 220;
      this.minimapCtx = this.minimapCanvas.getContext('2d');
    }

    this.placeNameEl = document.getElementById('place-name');
    this.placeDetailEl = document.getElementById('place-detail');

    this.evidencePanel = document.getElementById('evidence-panel');
    this.monumentsList = document.getElementById('monuments-list');
    this.btnCloseEvidence = document.getElementById('btn-close-evidence');

    this.teleportMenu = document.getElementById('teleport-menu');
    this.teleportList = document.getElementById('teleport-list');
    this.teleportSearch = document.getElementById('teleport-search');
    this.btnCloseTeleport = document.getElementById('btn-close-teleport');

    this.researchModal = document.getElementById('research-modal');
    this.modalBody = document.getElementById('modal-body');
    this.btnCloseModal = document.getElementById('btn-close-modal');

    this.infoCard = document.getElementById('info-card');
    this.infoCardTimer = null;
  }

  _bindDOMEvents() {
    // Evidence panel close
    if (this.btnCloseEvidence) {
      this.btnCloseEvidence.addEventListener('click', () => this.hideEvidencePanel());
    }

    // Teleport close & search filter
    if (this.btnCloseTeleport) {
      this.btnCloseTeleport.addEventListener('click', () => this.hideTeleportMenu());
    }
    if (this.teleportSearch) {
      this.teleportSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const items = this.teleportList ? this.teleportList.querySelectorAll('li') : [];
        items.forEach((item) => {
          const text = item.textContent.toLowerCase();
          item.style.display = text.includes(query) ? 'flex' : 'none';
        });
      });
    }

    // Research / Sources modal close
    if (this.btnCloseModal) {
      this.btnCloseModal.addEventListener('click', () => this.hideSourcesModal());
    }

    // Close overlays with Escape
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        this.hideTeleportMenu();
        this.hideEvidencePanel();
        this.hideSourcesModal();
        this.hideInfoCard();
      }
    });
  }

  /* ── Minimap ────────────────────────────────────────────── */

  initMinimap() {
    if (!this.minimapWrapper) return;
    this.minimapWrapper.style.display = 'block';
  }

  toggleMinimap() {
    this.minimapVisible = !this.minimapVisible;
    if (this.minimapWrapper) {
      this.minimapWrapper.style.display = this.minimapVisible ? 'block' : 'none';
    }
  }

  updateMinimap(playerX, playerZ, playerAngle) {
    if (!this.minimapVisible || !this.minimapCtx) return;

    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const scale = 0.42; // world units to canvas pixels

    ctx.clearRect(0, 0, w, h);

    // Save clip to circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    ctx.clip();

    // Background terrain fill
    ctx.fillStyle = '#1c1813';
    ctx.fillRect(0, 0, w, h);

    // Center and rotate canvas to match player heading
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-playerAngle);

    // 1. Draw Waters
    if (this.cityData.WATERS) {
      ctx.strokeStyle = '#4a7a8a';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (const water of this.cityData.WATERS) {
        if (water.points && water.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo((water.points[0].x - playerX) * scale, (water.points[0].z - playerZ) * scale);
          for (let i = 1; i < water.points.length; i++) {
            ctx.lineTo((water.points[i].x - playerX) * scale, (water.points[i].z - playerZ) * scale);
          }
          ctx.stroke();
        } else if (water.radius) {
          ctx.fillStyle = '#3a6a7a';
          ctx.beginPath();
          ctx.arc((water.x - playerX) * scale, (water.z - playerZ) * scale, water.radius * scale, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 2. Draw Streets
    if (this.cityData.STREETS) {
      ctx.strokeStyle = 'rgba(210, 190, 150, 0.45)';
      ctx.lineCap = 'round';
      for (const street of this.cityData.STREETS) {
        ctx.lineWidth = Math.max(2, (street.width || 14) * scale * 0.5);
        ctx.beginPath();
        const pts = street.points;
        ctx.moveTo((pts[0][0] - playerX) * scale, (pts[0][1] - playerZ) * scale);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo((pts[i][0] - playerX) * scale, (pts[i][1] - playerZ) * scale);
        }
        ctx.stroke();
      }
    }

    // 3. Draw Buildings
    if (this.cityData.BUILDINGS) {
      for (const b of this.cityData.BUILDINGS) {
        const bx = (b.x - playerX) * scale;
        const bz = (b.z - playerZ) * scale;
        const bw = Math.max(3, (b.w || 10) * scale);
        const bd = Math.max(3, (b.d || 10) * scale);

        // Don't render out-of-bounds
        if (Math.abs(bx) > cx + 40 || Math.abs(bz) > cy + 40) continue;

        if (this.evidenceActive && b.evidence) {
          ctx.fillStyle = this.evidenceColors[b.evidence.level] || '#c69a4b';
        } else if (b.id === 'parthenon') {
          ctx.fillStyle = '#f0e6d2';
        } else {
          ctx.fillStyle = '#8f7e65';
        }

        ctx.save();
        ctx.translate(bx, bz);
        if (b.rot) ctx.rotate(b.rot);
        ctx.fillRect(-bw / 2, -bd / 2, bw, bd);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-bw / 2, -bd / 2, bw, bd);
        ctx.restore();
      }
    }

    ctx.restore(); // Restore world transform

    // 4. Player Marker (fixed at center pointing UP)
    ctx.fillStyle = '#d3a65a';
    ctx.strokeStyle = '#12100c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx + 6, cy + 6);
    ctx.lineTo(cx, cy + 3);
    ctx.lineTo(cx - 6, cy + 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore(); // Restore circular clip

    // Circular gold bezel border
    ctx.strokeStyle = '#d3a65a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  /* ── Evidence Mode ──────────────────────────────────────── */

  toggleEvidence() {
    this.evidenceActive = !this.evidenceActive;
    if (this.evidencePanel) {
      if (this.evidenceActive) {
        this.evidencePanel.classList.remove('hidden');
      } else {
        this.evidencePanel.classList.add('hidden');
      }
    }
    return this.evidenceActive;
  }

  hideEvidencePanel() {
    if (this.evidencePanel) this.evidencePanel.classList.add('hidden');
  }

  _populateEvidenceList() {
    if (!this.monumentsList || !this.cityData.BUILDINGS) return;
    this.monumentsList.innerHTML = '';

    const sorted = [...this.cityData.BUILDINGS].sort((a, b) => a.name.localeCompare(b.name));
    for (const b of sorted) {
      const item = document.createElement('div');
      item.className = 'monument-item';
      const level = b.evidence?.level || 'plausible';
      const levelShort = level.substring(0, 4);

      item.innerHTML = `
        <div class="monument-item__header">
          <span class="monument-item__name">${b.name}</span>
          <span class="badge evidence-${level} ${levelShort}">${level}</span>
        </div>
        <div class="monument-item__detail">${b.detail || ''}</div>
      `;
      this.monumentsList.appendChild(item);
    }
  }

  /* ── Teleport / Fast Travel ─────────────────────────────── */

  toggleTeleportMenu() {
    if (!this.teleportMenu) return;
    if (this.teleportMenu.classList.contains('hidden')) {
      this.teleportMenu.classList.remove('hidden');
      if (this.teleportSearch) {
        this.teleportSearch.value = '';
        this.teleportSearch.focus();
      }
    } else {
      this.hideTeleportMenu();
    }
  }

  hideTeleportMenu() {
    if (this.teleportMenu) this.teleportMenu.classList.add('hidden');
  }

  _populateTeleportMenu() {
    if (!this.teleportList) return;
    this.teleportList.innerHTML = '';

    const list = this.cityData.TELEPORTS || [];
    for (const item of list) {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="teleport-list__name">${item.name}</span>
        <span class="teleport-list__action">Fast Travel ➔</span>
      `;

      li.addEventListener('mouseenter', () => { li.style.background = 'rgba(211, 166, 90, 0.15)'; });
      li.addEventListener('mouseleave', () => { li.style.background = 'transparent'; });
      li.addEventListener('click', () => {
        if (this.onTeleport) {
          this.onTeleport(item.id);
        }
      });

      this.teleportList.appendChild(li);
    }
  }

  /* ── Research / Sources Dialog ──────────────────────────── */

  showSourcesModal() {
    if (!this.researchModal || !this.modalBody) return;
    this.researchModal.classList.remove('hidden');

    let html = `
      <h2 class="sources-title">Sources & Reconstruction Notes</h2>
      <p class="sources-note">
        These references support the documented context used by this reconstruction. Schematic, plausible and atmospheric geometry remains explicitly labeled rather than presented as verified fact.
      </p>
      <div class="sources-list">
    `;

    const sources = this.cityData.SOURCES || [];
    for (const src of sources) {
      html += `
        <div class="source-row">
          <a href="${src.url}" target="_blank" rel="noopener noreferrer" class="source-row__link">
            <span>${src.title}</span>
            <span class="source-row__kind">↗ Reference</span>
          </a>
        </div>
      `;
    }

    html += `</div>`;
    this.modalBody.innerHTML = html;
  }

  hideSourcesModal() {
    if (this.researchModal) this.researchModal.classList.add('hidden');
  }

  /* ── Info Card (Monument Inspection) ────────────────────── */

  showInfoCard(building, sources = []) {
    if (!this.infoCard || !building) return;

    const titleEl = this.infoCard.querySelector('.info-title');
    const metaEl = this.infoCard.querySelector('.info-meta');
    const descEl = this.infoCard.querySelector('.info-desc');
    const linkEl = this.infoCard.querySelector('.info-link');

    if (titleEl) titleEl.textContent = building.name;

    const level = building.evidence?.level || 'plausible';
    if (metaEl) {
      metaEl.innerHTML = `
        <span>${building.type ? building.type.toUpperCase() : 'STRUCTURE'}</span> ·
        <span>${building.state || 'standing'}</span>
        <span class="badge evidence-${level}">${level}</span>
      `;
    }

    if (descEl) descEl.textContent = building.detail || 'Source-led reconstruction element.';

    if (linkEl) {
      const srcObj = sources.find((s) => s.id === building.source);
      if (srcObj && srcObj.url) {
        linkEl.href = srcObj.url;
        linkEl.target = '_blank';
        linkEl.rel = 'noopener noreferrer';
        linkEl.hidden = false;
        linkEl.style.display = 'inline-block';
        linkEl.textContent = `View Source: ${srcObj.title} ➔`;
      } else {
        linkEl.hidden = true;
        linkEl.style.display = 'none';
        linkEl.removeAttribute('href');
      }
    }

    this.infoCard.classList.remove('hidden');

    if (this.infoCardTimer) clearTimeout(this.infoCardTimer);
    this.infoCardTimer = setTimeout(() => {
      this.hideInfoCard();
    }, 9000);
  }

  hideInfoCard() {
    if (this.infoCard) this.infoCard.classList.add('hidden');
  }

  /* ── Place Name HUD ─────────────────────────────────────── */

  updatePlaceName(playerX, playerZ) {
    if (!this.placeNameEl && !this.placeDetailEl) return;

    // 1. Detect District
    let currentRegion = null;
    if (this.cityData.REGIONS) {
      for (const r of this.cityData.REGIONS) {
        const halfW = r.w / 2;
        const halfD = r.d / 2;
        if (
          playerX >= r.x - halfW && playerX <= r.x + halfW &&
          playerZ >= r.z - halfD && playerZ <= r.z + halfD
        ) {
          currentRegion = r;
          break;
        }
      }
    }

    // 2. Nearest Landmark
    let nearest = null;
    let minDist = Infinity;
    if (this.cityData.BUILDINGS) {
      for (const b of this.cityData.BUILDINGS) {
        const dx = b.x - playerX;
        const dz = b.z - playerZ;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < minDist) {
          minDist = dist;
          nearest = b;
        }
      }
    }

    if (this.placeNameEl) {
      this.placeNameEl.textContent = currentRegion ? currentRegion.name : (this.cityData.CITY?.title || 'Unknown Region');
    }

    if (this.placeDetailEl && nearest) {
      const distM = Math.round(minDist * 0.7); // 1 unit ≈ 0.7m
      this.placeDetailEl.textContent = `Near ${nearest.name} (${distM}m)`;
    }
  }

  updateCompass(angle) {
    const compassEl = document.getElementById('compass');
    if (!compassEl) return;
    const deg = Math.round((-angle * 180 / Math.PI + 360) % 360);
    let card = 'N';
    if (deg >= 45 && deg < 135) card = 'E';
    else if (deg >= 135 && deg < 225) card = 'S';
    else if (deg >= 225 && deg < 315) card = 'W';
    compassEl.textContent = `${card} ${deg}°`;
  }
}
