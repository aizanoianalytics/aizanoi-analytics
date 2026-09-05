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

/* Historical Worlds evidence styles now live in
   `frontend/ancient-world/engine/evidence.css`, which is linked from every
   Historical World entry page. Previously this function created a runtime
   `<style>` element and assigned its `.textContent`; that pattern is blocked
   by `style-src 'self'`. Keep the exported no-op for callers that still
   invoke it (Rome methodology, Athens …) so the public API stays stable. */
export function installEvidenceStyles() {
  /* intentional no-op — see evidence.css */
}