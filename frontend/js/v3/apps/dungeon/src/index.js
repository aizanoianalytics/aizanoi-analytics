// Thin AizanoiOS module entry; runtime ownership lives in GameApp.
import { GameApp } from './runtime/GameApp.js';

export async function mount({ container, api }) {
  const app = new GameApp({ container, api });
  try {
    await app.start();
  } catch (error) {
    app.destroy();
    throw error;
  }
  return () => app.destroy();
}
