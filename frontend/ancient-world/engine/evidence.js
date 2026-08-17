export const EVIDENCE_LEVELS = Object.freeze({
  archaeological: Object.freeze({ id: 'archaeological', label: 'Archaeologically supported', short: 'Archaeological', rank: 4 }),
  documented: Object.freeze({ id: 'documented', label: 'Historically / topographically documented', short: 'Documented', rank: 3 }),
  plausible: Object.freeze({ id: 'plausible', label: 'Plausible reconstruction', short: 'Plausible', rank: 2 }),
  atmospheric: Object.freeze({ id: 'atmospheric', label: 'Atmospheric / illustrative', short: 'Atmospheric', rank: 1 }),
});

export function normalizeEvidence(value, fallback = 'plausible') {
  if (!value) return EVIDENCE_LEVELS[fallback];
  if (typeof value === 'string') return EVIDENCE_LEVELS[value] || EVIDENCE_LEVELS[fallback];
  const base = EVIDENCE_LEVELS[value.level] || EVIDENCE_LEVELS[fallback];
  return { ...base, ...value, id: base.id, level: base.id };
}

export function evidenceForRecord(record = {}) {
  if (record.evidence) return normalizeEvidence(record.evidence);
  if (record.state === 'inferred') {
    return normalizeEvidence({
      level: 'plausible',
      note: 'The massing is an informed reconstruction rather than an individually excavated building restitution.',
    });
  }
  if (record.source) {
    return normalizeEvidence({
      level: 'documented',
      note: 'The place and historical context are source-led; exact fifth-century massing may remain partly reconstructed.',
    });
  }
  return normalizeEvidence('plausible');
}

export function evidenceBadgeHTML(value) {
  const evidence = normalizeEvidence(value);
  return `<span class="awEvidence awEvidence-${evidence.id}" data-evidence="${evidence.id}">${evidence.label}</span>`;
}

export function installEvidenceStyles() {
  if (document.getElementById('ancient-world-evidence-style')) return;
  const style = document.createElement('style');
  style.id = 'ancient-world-evidence-style';
  style.textContent = `.awEvidence{display:inline-flex;align-items:center;padding:5px 8px;border-radius:999px;border:1px solid rgba(235,197,125,.28);font:800 9px/1 system-ui;letter-spacing:.065em;text-transform:uppercase}.awEvidence-archaeological{color:#bde1c1;background:rgba(74,130,85,.18);border-color:rgba(111,178,126,.34)}.awEvidence-documented{color:#d8d2ae;background:rgba(124,116,72,.17)}.awEvidence-plausible{color:#e6c07d;background:rgba(174,126,54,.16)}.awEvidence-atmospheric{color:#d7aaa0;background:rgba(146,78,66,.15)}.awEvidenceNote{color:#c8b998;font-size:11px;border-left:2px solid rgba(211,166,90,.42);padding-left:9px}`;
  document.head.appendChild(style);
}
