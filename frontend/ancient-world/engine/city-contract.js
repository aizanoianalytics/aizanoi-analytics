import { normalizeEvidence } from './evidence.js';

export const CITY_CONTRACT_VERSION = 1;

const REQUIRED_ARRAYS = Object.freeze(['districts', 'roads', 'monuments', 'teleportTargets']);

function assertFinite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be a finite number.`);
  return value;
}

function normalizePoint(point, label = 'point') {
  if (!point || typeof point !== 'object') throw new TypeError(`${label} must be an object.`);
  return {
    x: assertFinite(point.x, `${label}.x`),
    y: Number.isFinite(point.y) ? point.y : undefined,
    z: assertFinite(point.z, `${label}.z`),
    yaw: Number.isFinite(point.yaw) ? point.yaw : undefined,
    pitch: Number.isFinite(point.pitch) ? point.pitch : undefined,
  };
}

function normalizeBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') throw new TypeError('city.bounds is required.');
  const normalized = {
    minX: assertFinite(bounds.minX, 'city.bounds.minX'),
    maxX: assertFinite(bounds.maxX, 'city.bounds.maxX'),
    minZ: assertFinite(bounds.minZ, 'city.bounds.minZ'),
    maxZ: assertFinite(bounds.maxZ, 'city.bounds.maxZ'),
  };
  if (normalized.minX >= normalized.maxX || normalized.minZ >= normalized.maxZ) {
    throw new RangeError('city.bounds min values must be smaller than max values.');
  }
  return normalized;
}

function insideBounds(point, bounds) {
  return point.x >= bounds.minX && point.x <= bounds.maxX && point.z >= bounds.minZ && point.z <= bounds.maxZ;
}

function ensureUniqueIds(records, label) {
  const seen = new Set();
  for (const [index, record] of records.entries()) {
    if (!record || typeof record !== 'object') throw new TypeError(`${label}[${index}] must be an object.`);
    if (!record.id || typeof record.id !== 'string') throw new TypeError(`${label}[${index}].id must be a non-empty string.`);
    if (seen.has(record.id)) throw new Error(`Duplicate ${label} id: ${record.id}`);
    seen.add(record.id);
  }
  return seen;
}

function normalizeEvidenceRecord(record, fallback = 'plausible') {
  return { ...record, evidence: normalizeEvidence(record.evidence, fallback) };
}

export function defineAncientCity(input) {
  if (!input || typeof input !== 'object') throw new TypeError('defineAncientCity requires a city object.');
  if (!input.id || typeof input.id !== 'string') throw new TypeError('city.id is required.');
  if (!input.title || typeof input.title !== 'string') throw new TypeError('city.title is required.');
  if (!input.period || typeof input.period !== 'string') throw new TypeError('city.period is required.');

  const bounds = normalizeBounds(input.bounds);
  const spawn = normalizePoint(input.spawn, 'city.spawn');
  if (!insideBounds(spawn, bounds)) throw new RangeError('city.spawn must be inside city.bounds.');

  for (const key of REQUIRED_ARRAYS) {
    if (!Array.isArray(input[key])) throw new TypeError(`city.${key} must be an array.`);
  }

  const districts = input.districts.map((record) => normalizeEvidenceRecord(record, 'documented'));
  const roads = input.roads.map((record) => normalizeEvidenceRecord(record, 'documented'));
  const monuments = input.monuments.map((record) => normalizeEvidenceRecord(record, record.state === 'inferred' ? 'plausible' : 'documented'));
  const teleportTargets = input.teleportTargets.map((record) => ({
    ...record,
    position: normalizePoint(record.position ?? record, `teleport target ${record.id || '?'}`),
  }));

  const districtIds = ensureUniqueIds(districts, 'districts');
  const roadIds = ensureUniqueIds(roads, 'roads');
  const monumentIds = ensureUniqueIds(monuments, 'monuments');
  ensureUniqueIds(teleportTargets, 'teleportTargets');

  for (const target of teleportTargets) {
    if (!insideBounds(target.position, bounds)) throw new RangeError(`teleport target ${target.id} is outside city.bounds.`);
    if (target.monumentId && !monumentIds.has(target.monumentId)) {
      throw new Error(`teleport target ${target.id} references missing monument ${target.monumentId}.`);
    }
  }

  const manifest = {
    contractVersion: CITY_CONTRACT_VERSION,
    id: input.id,
    title: input.title,
    period: input.period,
    description: input.description || '',
    language: input.language || 'en',
    spawn,
    bounds,
    districts,
    roads,
    monuments,
    teleportTargets,
    evidence: normalizeEvidence(input.evidence || 'documented'),
    terrain: input.terrain || null,
    ambience: input.ambience || null,
    performance: {
      mobileGeometryBudget: input.performance?.mobileGeometryBudget ?? null,
      desktopGeometryBudget: input.performance?.desktopGeometryBudget ?? null,
      maxPixelRatioMobile: input.performance?.maxPixelRatioMobile ?? 1.15,
      maxPixelRatioDesktop: input.performance?.maxPixelRatioDesktop ?? 1.55,
      ...input.performance,
    },
    metadata: { ...(input.metadata || {}) },
  };

  Object.defineProperty(manifest, '__indexes', {
    enumerable: false,
    value: Object.freeze({ districtIds, roadIds, monumentIds }),
  });

  return Object.freeze(manifest);
}

export function validateAncientCity(input) {
  try {
    const city = defineAncientCity(input);
    return { ok: true, errors: [], city };
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)], city: null };
  }
}

export function cityCapabilities(city) {
  const manifest = city?.contractVersion ? city : defineAncientCity(city);
  return Object.freeze({
    terrain: Boolean(manifest.terrain),
    ambience: Boolean(manifest.ambience),
    districts: manifest.districts.length,
    roads: manifest.roads.length,
    monuments: manifest.monuments.length,
    teleportTargets: manifest.teleportTargets.length,
    evidenceLevels: [...new Set([
      manifest.evidence.id,
      ...manifest.districts.map((item) => item.evidence.id),
      ...manifest.roads.map((item) => item.evidence.id),
      ...manifest.monuments.map((item) => item.evidence.id),
    ])],
  });
}
