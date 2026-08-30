import { createWorkspaceApp } from './app.js';
import { resolveWorkspaceCapabilities } from './capabilities.js';

export async function mount({ container, capabilities, options }) {
  const app = createWorkspaceApp(resolveWorkspaceCapabilities({ capabilities }));
  return app.mount({ container, options });
}
