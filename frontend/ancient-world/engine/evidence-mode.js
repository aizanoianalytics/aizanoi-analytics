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

function installStyles() {
  if (document.getElementById('aw-research-lens-style')) return;
  const style = document.createElement('style');
  style.id = 'aw-research-lens-style';
  style.textContent = `
    .awResearchToggle{position:fixed;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));z-index:7990;min-width:44px;min-height:44px;padding:10px 13px;border:1px solid rgba(232,205,153,.35);border-radius:12px;background:rgba(22,20,16,.88);color:#f0dfbd;font:800 11px/1.2 system-ui;letter-spacing:.07em;text-transform:uppercase;backdrop-filter:blur(10px);cursor:pointer;box-shadow:0 10px 32px rgba(0,0,0,.28)}
    .awResearchToggle[aria-pressed="true"]{background:#f0dfbd;color:#211b13;border-color:#f0dfbd}
    .awResearchPanel{position:fixed;right:max(14px,env(safe-area-inset-right));bottom:70px;z-index:7989;width:min(390px,calc(100vw - 28px));max-height:min(620px,calc(100vh - 110px));overflow:auto;padding:15px;border:1px solid rgba(232,205,153,.28);border-radius:16px;background:rgba(20,18,14,.95);color:#eadfc9;font:13px/1.45 system-ui;box-shadow:0 24px 70px rgba(0,0,0,.42);backdrop-filter:blur(14px)}
    .awResearchPanel[hidden]{display:none!important}.awResearchPanel h2{margin:0 0 5px;font:800 18px/1.15 Georgia,serif}.awResearchPanel>p{margin:0 0 12px;color:#cbbd9f;font-size:12px}.awResearchLegend{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:10px 0 14px}.awResearchLegend div{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;padding:9px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.025)}.awEvidenceDot{width:10px;height:10px;border-radius:50%;flex:none;box-shadow:0 0 0 2px rgba(255,255,255,.05)}.awResearchLegendCopy{display:grid;gap:2px;min-width:0}.awResearchLegend b{font-size:11px;line-height:1.15;text-transform:uppercase;letter-spacing:.05em}.awResearchLegend small{color:#cbbd9f;font-size:10px;line-height:1.25}.awResearchCount{min-width:24px;padding:3px 5px;border-radius:999px;background:rgba(255,255,255,.055);color:#d7c9ac;font:800 10px/1 system-ui;text-align:center}.awResearchFocus{padding:10px 11px;margin:0 0 12px;border-left:3px solid var(--aw-evidence-focus,#d59a55);border-radius:8px;background:rgba(255,255,255,.035)}.awResearchFocus b{display:block}.awResearchFocus small{display:block;margin-top:3px;color:#bcae91}.awResearchNearby{display:grid;gap:6px}.awResearchNearby button{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:8px;width:100%;min-height:44px;padding:8px 9px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:rgba(255,255,255,.025);color:inherit;text-align:left;cursor:pointer}.awResearchNearby button:hover,.awResearchNearby button:focus-visible{background:rgba(240,223,189,.1);outline:1px solid rgba(240,223,189,.42)}.awResearchNearby strong{font-size:11px}.awResearchNearby small{color:#bcae91}.awResearchKey{margin-top:12px!important;font:700 10px/1.4 ui-monospace,monospace!important;color:#a99b80!important}.awEvidenceModeActive::before{content:"";position:fixed;inset:0;z-index:7975;pointer-events:none;border:3px solid color-mix(in srgb,var(--aw-evidence-focus,#d59a55) 65%,transparent);box-shadow:inset 0 0 80px rgba(0,0,0,.12)}
    @media(max-width:720px){.awResearchToggle{right:10px;bottom:max(10px,env(safe-area-inset-bottom));font-size:10px}.awResearchPanel{right:8px;bottom:64px;width:calc(100vw - 16px);max-height:56vh}.awResearchLegend{grid-template-columns:1fr 1fr}}
    @media(max-width:520px){.awResearchLegend{grid-template-columns:1fr}.awResearchPanel{padding:13px}.awResearchLegend div{padding:9px 10px}}
    @media(prefers-reduced-motion:reduce){.awResearchToggle,.awResearchPanel{scroll-behavior:auto}}
  `;
  document.head.appendChild(style);
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
        return `<div data-evidence-group="${id}"><i class="awEvidenceDot" aria-hidden="true" style="background:${item.color}"></i><span class="awResearchLegendCopy"><b>${esc(item.short)}</b><small>${esc(item.label)}</small></span><span class="awResearchCount" aria-label="${count} labelled places">${count}</span></div>`;
      }).join('')}
    </div>
    <div class="awResearchFocus" data-aw-evidence-focus><b>${esc(city.title || 'Historical World')}</b><small>Move near a labelled monument to inspect its evidence status.</small></div>
    <div class="awResearchNearby" data-aw-evidence-nearby></div>
    <p class="awResearchKey">V toggles Research Lens · click a nearby place to move to its safe approach point</p>`;

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
        return `<button type="button" data-aw-evidence-visit="${esc(record.id)}"><i class="awEvidenceDot" aria-hidden="true" style="background:${display.color}"></i><strong>${esc(record.name || record.id)}</strong><small>${esc(display.label)} · ${Math.round(distance)} m</small></button>`;
      }).join('') || '<small>No labelled monuments in this scene.</small>';
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
      toggle.remove();
      panel.remove();
    },
  });
  runtime.debug.evidenceMode = api;
  window.addEventListener('pagehide', () => api.destroy(), { once:true });
  return api;
}
