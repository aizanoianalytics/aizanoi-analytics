import { mountWinamp } from './app.js';
import { resolveWinampCapabilities } from './capabilities.js';

/** Public AizanoiOS module entry. */
export async function mount(context) {
  const capabilities = resolveWinampCapabilities(context);
  return mountWinamp({ ...context, capabilities });
}
