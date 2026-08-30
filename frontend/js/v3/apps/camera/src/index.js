import { mountCamera } from './app.js';
import { resolveCameraCapabilities } from './capabilities.js';

/** Public AizanoiOS module entry. */
export async function mount(context) {
  const capabilities = resolveCameraCapabilities(context);
  return mountCamera({ ...context, capabilities });
}
