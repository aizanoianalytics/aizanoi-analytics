import { createFlowersellerApp } from './app.js';

export async function mount({ container }) {
  const app = createFlowersellerApp();
  return app.mount(container);
}
