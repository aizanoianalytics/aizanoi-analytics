import { createMarketsApp } from './app.js';

export async function mount({ container }) {
  const app = createMarketsApp();
  return app.mount(container);
}
