export const EVIDENCE_LEVELS = Object.freeze({
  archaeological: Object.freeze({
    id: 'archaeological',
    label: 'Archaeologically supported',
    short: 'Archaeological',
    rank: 4,
  }),
  documented: Object.freeze({
    id: 'documented',
    label: 'Historically / topographically documented',
    short: 'Documented',
    rank: 3,
  }),
  plausible: Object.freeze({
    id: 'plausible',
    label: 'Plausible reconstruction',
    short: 'Plausible',
    rank: 2,
  }),
  atmospheric: Object.freeze({
    id: 'atmospheric',
    label: 'Atmospheric / illustrative',
    short: 'Atmospheric',
    rank: 1,
  }),
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
