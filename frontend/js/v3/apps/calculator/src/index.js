import { mountCalculator } from './app.js';
import { resolveCalculatorCapabilities } from './capabilities.js';

/** Public AizanoiOS module entry. */
export async function mount(context) {
  const capabilities = resolveCalculatorCapabilities(context);
  return mountCalculator({ ...context, capabilities });
}
