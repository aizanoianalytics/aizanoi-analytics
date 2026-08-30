import { createWorldsApp } from './app.js';
import { resolveWorldCapabilities } from './capabilities.js';

export async function mount({ container, capabilities }) {
  const app = createWorldsApp(resolveWorldCapabilities({ capabilities }));
  return app.mount(container);
}
