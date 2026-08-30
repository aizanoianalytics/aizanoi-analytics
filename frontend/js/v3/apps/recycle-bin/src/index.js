import { mountRecycleBin } from './app.js';
import { resolveRecycleBinCapabilities } from './capabilities.js';

/** Public AizanoiOS module entry. */
export async function mount(context) {
  const capabilities = resolveRecycleBinCapabilities(context);
  return mountRecycleBin({ ...context, capabilities });
}
