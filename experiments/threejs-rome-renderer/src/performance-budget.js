export const ROME_POC_COMPLEXITY_BUDGET = Object.freeze({
  // These are CI scene-complexity ceilings, not physical-device FPS claims.
  // Real hardware performance still requires device-level profiling.
  desktop: Object.freeze({
    maxTriangles: 220000,
    maxDrawCalls: 700,
  }),
  mobile: Object.freeze({
    maxTriangles: 220000,
    maxDrawCalls: 700,
  }),
});

export function assertComplexityBudget(metrics, budget, label = 'scene') {
  if (!metrics || !budget) throw new TypeError('metrics and budget are required');
  if (metrics.triangles > budget.maxTriangles) {
    throw new Error(`${label} triangle budget exceeded: ${metrics.triangles} > ${budget.maxTriangles}`);
  }
  if (metrics.calls > budget.maxDrawCalls) {
    throw new Error(`${label} draw-call budget exceeded: ${metrics.calls} > ${budget.maxDrawCalls}`);
  }
  return true;
}
