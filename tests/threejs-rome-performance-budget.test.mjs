import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROME_POC_COMPLEXITY_BUDGET,
  assertComplexityBudget,
} from '../experiments/threejs-rome-renderer/src/performance-budget.js';

test('Rome Three.js complexity budgets accept representative scenes below ceiling', () => {
  assert.equal(
    assertComplexityBudget({ triangles: 100000, calls: 300 }, ROME_POC_COMPLEXITY_BUDGET.desktop, 'desktop'),
    true,
  );
});

test('Rome Three.js complexity budgets reject triangle explosions', () => {
  assert.throws(
    () => assertComplexityBudget(
      { triangles: ROME_POC_COMPLEXITY_BUDGET.desktop.maxTriangles + 1, calls: 10 },
      ROME_POC_COMPLEXITY_BUDGET.desktop,
      'desktop',
    ),
    /triangle budget exceeded/,
  );
});

test('Rome Three.js complexity budgets reject draw-call explosions', () => {
  assert.throws(
    () => assertComplexityBudget(
      { triangles: 10, calls: ROME_POC_COMPLEXITY_BUDGET.mobile.maxDrawCalls + 1 },
      ROME_POC_COMPLEXITY_BUDGET.mobile,
      'mobile',
    ),
    /draw-call budget exceeded/,
  );
});
