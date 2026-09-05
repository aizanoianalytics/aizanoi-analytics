import {
  EVIDENCE_LEVELS,
  EVIDENCE_MODE_ORDER,
  evidenceForRecord,
  evidenceModeDefinition,
  evidenceModeId,
} from './evidence.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
})[char]);

function recordEvidence(record) {
  const raw = evidenceForRecord(record);
  const display = evidenceModeDefinition(raw);
  return { raw, display, modeId:evidenceModeId(raw) };
}

/* Historical Worlds Research Lens styles live in
   `frontend/ancient-world/engine/evidence-mode.css`. The previous version
   created a runtime `<style>` element and assigned its `.textContent`, which
   is blocked under `style-src 'self'`. Same-origin stylesheet links are
   allowed by that policy, so each Historical World entry HTML page links the
   file directly. */
function installStyles() {
  /* intentional no-op — see evidence-mode.css */
}

function renderLegendDot(item) {
  // Color is supplied by an attribute on the dot, then promoted to a CSS
  // custom property by `paintDotColors`. CSP `style-src 'self'` blocks inline
  // `style="..."` attributes but permits programmatic `style.setProperty`,
  // so we never bake the color into the markup string.
  return `<i class="awEvidenceDot" data-evidence-dot="${esc(item.id)}" aria-hidden="true"></i>`;
}

function renderNearbyButton(record, distance, display) {
  return `<button type="button" data-aw-evidence-visit="${esc(record.id)}"><i class="awEvidenceDot" data-evidence-dot="${esc(display.id)}" aria-hidden="true"></i><strong>${esc(record.name || record.id)}</strong><small>${esc(display.label)} · ${Math.round(distance)} m</small></button>`;
}

function paintDotColors(container, items) {
  if (!container) return;
  for (const dot of container.querySelectorAll('[data-evidence-dot]')) {
    const id = dot.dataset.evidenceDot;
    const item = items[id];
    if (!item) continue;
    dot.style.setProperty('--aw-dot-color', item.color);
  }
}

function countsFor(records) {
  const counts = Object.fromEntries(EVIDENCE_MODE_ORDER.map((id) => [id, 0]));
  for (const record of records) {
    const id = recordEvidence(record).modeId;
    if (counts[id] == null) counts[id] = 0;
    counts[id] += 1;
  }
  return counts;
}

export function installEvidenceMode({ runtime, city = {}, root = document.body } = {}) {
  if (!runtime?.debug || !root) return { destroy() {}, setEnabled() {}, get enabled() { return false; } };
  installStyles();

  const landmarks = Array.isArray(runtime.debug.landmarks) ? runtime.debug.landmarks : [];
  const counts = countsFor(landmarks);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'awResearchToggle';
  toggle.dataset.awEvidenceToggle = 'true';
  toggle.setAttribute('aria-controls', 'awResearchLens');
  toggle.setAttribute('aria-pressed', 'false');
  toggle.textContent = 'Evidence';

  const panel = document.createElement('aside');
  panel.id = 'awResearchLens';
  panel.className = 'awResearchPanel';
  panel.dataset.awEvidencePanel = 'true';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Historical reconstruction evidence mode');
  panel.innerHTML = `
    <h2>Research Lens</h2>
    <p>Evidence status describes the reconstruction claim, not visual quality. Every category is named in text; color is a secondary cue. “Plausible” legacy records are grouped as inferred.</p>
    <div class="awResearchLegend">
      ${EVIDENCE_MODE_ORDER.map((id) => {
        const item = EVIDENCE_LEVELS[id];
        const count = counts[id] || 0;
        return `<div data-evidence-group="${id}">${renderLegendDot(item)}<span class="awResearchLegendCopy"><b>${esc(item.short)}</b><small>${esc(item.label)}</small></span><span class="awResearchCount" aria-label="${count} labelled places">${count}</span></div>`;
      }).join('')}
    </div>
    <div class="awResearchFocus" data-aw-evidence-focus><b>${esc(city.title || 'Historical World')}</b><small>Move near a labelled monument to inspect its evidence status.</small></div>
    <div class="awResearchNearby" data-aw-evidence-nearby></div>
    <p class="awResearchKey">V toggles Research Lens · click a nearby place to move to its safe approach point</p>`;
  paintDotColors(panel, EVIDENCE_LEVELS);

  root.append(panel, toggle);
  let enabled = false;
  let destroyed = false;
  let timer = null;

  function setEnabled(next) {
    enabled = Boolean(next);
    panel.hidden = !enabled;
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.textContent = enabled ? 'Evidence: on' : 'Evidence';
    document.body.classList.toggle('awEvidenceModeActive', enabled);
    if (enabled && document.pointerLockElement) document.exitPointerLock?.();
    update();
  }

  function nearbyRecords() {
    const player = runtime.debug.player;
    if (!player) return [];
    return landmarks
      .filter((record) => Number.isFinite(record.x) && Number.isFinite(record.z))
      .map((record) => ({ record, distance:Math.hypot(player.x - record.x, player.z - record.z) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 6);
  }

  function update() {
    if (destroyed || !enabled) return;
    const nearby = nearbyRecords();
    const focus = nearby[0];
    const focusNode = panel.querySelector('[data-aw-evidence-focus]');
    const nearbyNode = panel.querySelector('[data-aw-evidence-nearby]');
    if (focus && focusNode) {
      const { raw, display } = recordEvidence(focus.record);
      document.documentElement.style.setProperty('--aw-evidence-focus', display.color);
      const detail = raw.note || focus.record.detail || focus.record.note || `${Math.round(focus.distance)} m away`;
      focusNode.innerHTML = `<b>${esc(focus.record.name || focus.record.id)} · ${esc(display.short)}</b><small>${esc(display.label)} · ${esc(detail)}</small>`;
    }
    if (nearbyNode) {
      nearbyNode.innerHTML = nearby.map(({ record, distance }) => {
        const { display } = recordEvidence(record);
        return renderNearbyButton(record, distance, display);
      }).join('') || '<small>No labelled monuments in this scene.</small>';
      // Paint the nearby-button dot colors via per-element style.setProperty;
      // CSP `style-src 'self'` blocks inline `style="..."` attributes but
      // permits programmatic property writes.
      const buttons = nearbyNode.querySelectorAll('[data-aw-evidence-visit]');
      nearby.forEach(({ record, distance }, index) => {
        const button = buttons[index];
        if (!button) return;
        const { display } = recordEvidence(record);
        const dot = button.querySelector('[data-evidence-dot]');
        if (dot) dot.style.setProperty('--aw-dot-color', display.color);
      });
    }
  }

  function onClick(event) {
    if (event.target.closest('[data-aw-evidence-toggle]')) {
      setEnabled(!enabled);
      return;
    }
    const visit = event.target.closest('[data-aw-evidence-visit]');
    if (visit?.dataset.awEvidenceVisit) {
      runtime.debug.teleportTo?.(visit.dataset.awEvidenceVisit, { lock:false });
      update();
    }
  }

  function onKey(event) {
    if (event.code !== 'KeyV' || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    const target = event.target;
    if (target && (target.matches?.('input,textarea,select') || target.isContentEditable)) return;
    event.preventDefault();
    setEnabled(!enabled);
  }

  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  timer = window.setInterval(update, 650);

  const api = Object.freeze({
    get enabled() { return enabled; },
    setEnabled,
    update,
    counts:Object.freeze({ ...counts }),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (timer != null) window.clearInterval(timer);
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('awEvidenceModeActive');
      document.documentElement.style.removeProperty('--aw-evidence-focus');
      panel.remove();
      toggle.remove();
    },
  });
  return api;
}

export default installEvidenceMode;