import { createWorkspaceApp } from './app.js';
import { resolveWorkspaceCapabilities } from './capabilities.js';

export async function mount({ container, capabilities, options }) {
  const app = createWorkspaceApp(resolveWorkspaceCapabilities({ capabilities }));
  container.dataset.appMounting = 'true';
  container.setAttribute('aria-busy', 'true');
  container.inert = true;
  try {
    return await app.mount({ container, options });
  } finally {
    container.inert = false;
    container.removeAttribute('aria-busy');
    delete container.dataset.appMounting;
  }
}
