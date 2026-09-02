export const EVIDENCE_LEVELS = Object.freeze({
  archaeological: Object.freeze({ id:'archaeological', label:'Archaeologically supported', short:'Archaeological', rank:5, color:'#77b989' }),
  documented: Object.freeze({ id:'documented', label:'Historically / topographically documented', short:'Documented', rank:4, color:'#d2c678' }),
  inferred: Object.freeze({ id:'inferred', label:'Inferred reconstruction', short:'Inferred', rank:3, color:'#d59a55' }),
  // `plausible` remains a first-class legacy label because existing city data
  // uses it extensively. Research Lens groups it with inferred reconstruction
  // without silently rewriting historical records.
  plausible: Object.freeze({ id:'plausible', label:'Plausible reconstruction', short:'Plausible', rank:3, color:'#d59a55' }),
  atmospheric: Object.freeze({ id:'atmospheric', label:'Atmospheric / illustrative', short:'Atmospheric', rank:2, color:'#c98778' }),
  disputed: Object.freeze({ id:'disputed', label:'Disputed / contested', short:'Disputed', rank:1, color:'#c66b78' }),
});

export const EVIDENCE_MODE_ORDER = Object.freeze([
  'archaeological',
  'documented',
  'inferred',
  'atmospheric',
  'disputed',
]);

export function normalizeEvidence(value, fallback = 'plausible') {
  if (!value) return EVIDENCE_LEVELS[fallback] || EVIDENCE_LEVELS.plausible;
  if (typeof value === 'string') return EVIDENCE_LEVELS[value] || EVIDENCE_LEVELS[fallback] || EVIDENCE_LEVELS.plausible;
  const base = EVIDENCE_LEVELS[value.level] || EVIDENCE_LEVELS[fallback] || EVIDENCE_LEVELS.plausible;
  return { ...base, ...value, id:base.id, level:base.id };
}

export function evidenceForRecord(record = {}) {
  if (record.evidence) return normalizeEvidence(record.evidence);
  if (record.state === 'disputed') {
    return normalizeEvidence({
      level:'disputed',
      note:'The represented identification or restitution is contested and should be read as a disputed interpretation.',
    });
  }
  if (record.state === 'inferred') {
    return normalizeEvidence({
      level:'inferred',
      note:'The massing is an informed reconstruction rather than an individually excavated building restitution.',
    });
  }
  if (record.source) {
    return normalizeEvidence({
      level:'documented',
      note:'The place and historical context are source-led; exact restitution may remain partly reconstructed.',
    });
  }
  return normalizeEvidence('plausible');
}

export function evidenceModeId(value) {
  const evidence = normalizeEvidence(value);
  return evidence.id === 'plausible' ? 'inferred' : evidence.id;
}

export function evidenceModeDefinition(value) {
  const id = evidenceModeId(value);
  return id === 'inferred' ? EVIDENCE_LEVELS.inferred : EVIDENCE_LEVELS[id] || EVIDENCE_LEVELS.inferred;
}

export function evidenceBadgeHTML(value) {
  const evidence = normalizeEvidence(value);
  return `<span class="awEvidence awEvidence-${evidence.id}" data-evidence="${evidence.id}">${evidence.label}</span>`;
}

export function installEvidenceStyles() {
  if (document.getElementById('ancient-world-evidence-style')) return;
  const style = document.createElement('style');
  style.id = 'ancient-world-evidence-style';
  style.textContent = `.awEvidence{display:inline-flex;align-items:center;padding:5px 8px;border-radius:999px;border:1px solid rgba(235,197,125,.28);font:800 9px/1 system-ui;letter-spacing:.065em;text-transform:uppercase}.awEvidence-archaeological{color:#bde1c1;background:rgba(74,130,85,.18);border-color:rgba(111,178,126,.34)}.awEvidence-documented{color:#e3dca6;background:rgba(124,116,72,.17)}.awEvidence-inferred,.awEvidence-plausible{color:#e6c07d;background:rgba(174,126,54,.16)}.awEvidence-atmospheric{color:#d7aaa0;background:rgba(146,78,66,.15)}.awEvidence-disputed{color:#efb0ba;background:rgba(153,58,77,.18);border-color:rgba(209,92,113,.36)}.awEvidenceNote{color:#c8b998;font-size:11px;border-left:2px solid rgba(211,166,90,.42);padding-left:9px}`;
  document.head.appendChild(style);
}
