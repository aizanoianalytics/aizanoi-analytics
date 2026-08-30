import { mountNotepad } from './app.js';
import { resolveNotepadCapabilities } from './capabilities.js';

/** Public AizanoiOS module entry. */
export async function mount(context) {
  const capabilities = await resolveNotepadCapabilities(context);
  return mountNotepad({ ...context, capabilities });
}
