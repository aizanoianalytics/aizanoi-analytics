import { mountJournal } from './app.js';

/** Public AizanoiOS module entry. */
export async function mount({ container }) {
  return mountJournal(container);
}
