// Thin AizanoiOS module entry; runtime ownership lives in GameApp.
import { GameApp } from './runtime/GameApp.js';

export async function mount({ container, api }) {
  const app = new GameApp({ container, api });
  await app.start();
  return () => app.destroy();
}
