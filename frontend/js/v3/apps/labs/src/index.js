import { createLabsApp } from './app.js';
import { resolveLabsCapabilities } from './capabilities.js';

/** Public AizanoiOS module entry. */
export async function mount(context) {
  const capabilities = resolveLabsCapabilities(context);
  const app = createLabsApp({ apps: capabilities.apps });
  return app.mount(context.container);
}
