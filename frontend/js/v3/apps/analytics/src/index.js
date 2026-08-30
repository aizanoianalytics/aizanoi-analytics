import { createAnalyticsApp } from './app.js';

export async function mount({ container }) {
  const app = createAnalyticsApp();
  return app.mount(container);
}
