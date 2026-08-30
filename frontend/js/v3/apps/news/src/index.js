import { createNewsApp } from './app.js';

export async function mount({ container }) {
  const app = createNewsApp();
  return app.mount(container);
}
