import { mountVideos } from './app.js';
import { resolveVideoCapabilities } from './capabilities.js';

/** Public AizanoiOS module entry. */
export async function mount(context) {
  const capabilities = resolveVideoCapabilities(context);
  return mountVideos({ ...context, capabilities });
}
