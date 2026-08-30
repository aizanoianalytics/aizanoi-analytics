import { createForgeApp } from './app.js';
import { resolveForgeCapabilities } from './capabilities.js';

/** Public AizanoiOS module entry. */
export async function mount(context) {
  const capabilities = resolveForgeCapabilities(context);
  const app = createForgeApp({ apps: capabilities.apps });
  return app.mount(context.container);
}
