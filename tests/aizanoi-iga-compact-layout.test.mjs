import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS as IGA_BUILDINGS, BOUNDS as IGA_BOUNDS, compactAirportLayout } from '../frontend/worlds/iga-airport/js/airport-data.js';
import { BUILDINGS as AIZANOI_BUILDINGS, BOUNDS as AIZANOI_BOUNDS, compactAizanoiLayout } from '../frontend/worlds/aizanoi-225/js/city-data.js';
import { TERMINAL_ENTRY } from '../frontend/worlds/iga-airport/js/builders.js';

test('IGA compact layout reduces lateral extent without changing landmark contracts', () => {
  const compact = compactAirportLayout();
  const sourceWidth = IGA_BOUNDS.maxX - IGA_BOUNDS.minX;
  const compactWidth = compact.BOUNDS.maxX - compact.BOUNDS.minX;
  assert.ok(compactWidth / sourceWidth <= 0.82);
  assert.deepEqual(compact.BUILDINGS.map((b) => b.id), IGA_BUILDINGS.map((b) => b.id));
  assert.deepEqual(compact.BUILDINGS.map((b) => b.evidence.level), IGA_BUILDINGS.map((b) => b.evidence.level));
  assert.equal(compact.BUILDINGS.find((b) => b.id === 'terminal').x, 0);
  assert.ok(compact.BUILDINGS.find((b) => b.id === 'pier-west').w < 105);
  assert.ok(compact.STREETS.every((street) => street.points.length >= 2));
});

test('Aizanoi compact layout reduces survey whitespace and preserves evidence records', () => {
  const compact = compactAizanoiLayout();
  const sourceWidth = AIZANOI_BOUNDS.maxX - AIZANOI_BOUNDS.minX;
  const width = compact.BOUNDS.maxX - compact.BOUNDS.minX;
  assert.ok(width / sourceWidth <= 0.82);
  assert.deepEqual(compact.BUILDINGS.map((b) => b.id), AIZANOI_BUILDINGS.map((b) => b.id));
  assert.ok(compact.BUILDINGS.every((b) => b.evidence?.level));
  assert.equal(compact.WATERS[0].points[0].x, 58 * 0.39); // x0.39: 2026-09-16 harita yari genislik
});

test('compact airport layout preserves a clear entry and usable circulation scale', () => {
  const iga = compactAirportLayout();
  const terminal = iga.BUILDINGS.find((b) => b.id === 'terminal');
  const plaza = iga.BUILDINGS.find((b) => b.id === 'plaza');
  const security = iga.BUILDINGS.find((b) => b.id === 'security');
  assert.ok(terminal.w >= 300 && terminal.d >= 300, 'terminal remains a readable hall'); // esik yarisi: 2026-09-16 yari genislik
  assert.ok(plaza.z < terminal.z - terminal.d / 2, 'forecourt stays landside of terminal');
  assert.ok(security.z > terminal.z, 'security follows check-in along the central axis');
  assert.ok(iga.STREETS.find((s) => s.id === 'checkin-axis').width >= 15, 'central route remains walkable'); // esik yarisi: 2026-09-16 yari genislik
  assert.ok(TERMINAL_ENTRY.width >= 100 && TERMINAL_ENTRY.height >= 8, 'terminal has a human-scale clear entry');
});

test('compact transforms keep focal footprints separated and bridge paths inside bounds', () => {
  const a = compactAizanoiLayout();
  const temple = a.BUILDINGS.find((b) => b.id === 'temple');
  const macellum = a.BUILDINGS.find((b) => b.id === 'macellum');
  const bridge = a.BUILDINGS.find((b) => b.id === 'bridge2');
  assert.ok(Math.abs(temple.x - macellum.x) > (temple.w + macellum.w) / 2);
  assert.ok(bridge.x - bridge.w / 2 > a.BOUNDS.minX);
  assert.ok(bridge.x + bridge.w / 2 < a.BOUNDS.maxX);
  const iga = compactAirportLayout();
  const pier = iga.BUILDINGS.find((b) => b.id === 'pier-west');
  assert.ok(pier.x - pier.w / 2 > iga.BOUNDS.minX);
  assert.ok(pier.x + pier.w / 2 < iga.BOUNDS.maxX);
});
