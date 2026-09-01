import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';

test('Camera module requests camera first, microphone second, reveals live preview and stops all media on close', async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    permissions: ['camera', 'microphone'],
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  try {
    await page.addInitScript(() => {
      window.__cameraQa = { constraints: [], tracks: [], revoked: [] };
      const mediaDevices = navigator.mediaDevices;
      const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
      mediaDevices.getUserMedia = async (constraints) => {
        window.__cameraQa.constraints.push(structuredClone(constraints));
        const stream = await originalGetUserMedia(constraints);
        window.__cameraQa.tracks.push(...stream.getTracks());
        return stream;
      };
      const originalRevoke = URL.revokeObjectURL.bind(URL);
      URL.revokeObjectURL = (url) => {
        window.__cameraQa.revoked.push(url);
        return originalRevoke(url);
      };
    });

    await page.goto(`${base}/?camera-module-qa=${Date.now()}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      indexedDB.deleteDatabase('aizanoi-workspace');
      localStorage.clear();
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    await page.evaluate(async () => {
      const fs = await import('/js/v3/workspace/fs.js');
      const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (char) => char.charCodeAt(0));
      await fs.createFile({
        name: 'camera-module-qa.png',
        parent: fs.PICTURES_ID,
        blob: new Blob([bytes], { type: 'image/png' }),
        mime: 'image/png',
      });
      await window.AIZANOI_OS?.openApp?.('camera');
    });
    await page.waitForTimeout(800);

    const galleryUrls = await page.locator('img[data-photo-src]').count();
    assert.ok(galleryUrls > 0, 'Camera gallery must create at least one blob URL before teardown');

    await page.click('[data-cam-start]');
    await page.waitForTimeout(1100);

    const active = await page.evaluate(() => {
      const offPanel = document.querySelector('[data-cam-off]');
      const video = document.querySelector('[data-cam-video]');
      return {
        constraints: window.__cameraQa.constraints,
        liveTracks: window.__cameraQa.tracks.filter((track) => track.readyState === 'live').length,
        status: document.querySelector('[data-cam-status]')?.textContent || '',
        offPanelHidden: Boolean(offPanel?.hidden),
        offPanelDisplay: offPanel ? getComputedStyle(offPanel).display : null,
        offPanelHasDisplayClass: Boolean(offPanel?.classList.contains('az-camera-off')),
        videoWidth: video?.videoWidth || 0,
        videoHeight: video?.videoHeight || 0,
      };
    });
    assert.deepEqual(active.constraints.slice(0, 2), [
      { video: { facingMode: 'user' }, audio: false },
      { video: false, audio: true },
    ]);
    assert.ok(active.liveTracks > 0, 'Camera start must create live media tracks');
    assert.match(active.status, /^Camera active/);
    assert.equal(active.offPanelHidden, true, 'Camera off panel must carry the hidden state after the stream attaches');
    assert.equal(active.offPanelDisplay, 'none', 'Camera off panel must not cover the live preview');
    assert.equal(active.offPanelHasDisplayClass, false, 'Camera off display class must be removed while live');
    assert.ok(active.videoWidth > 0 && active.videoHeight > 0, 'Live camera preview must expose real video dimensions');

    await page.evaluate(() => window.AIZANOI_OS?.closeApp?.('camera'));
    await page.waitForTimeout(500);

    const closed = await page.evaluate(() => ({
      liveTracks: window.__cameraQa.tracks.filter((track) => track.readyState === 'live').length,
      revoked: window.__cameraQa.revoked.length,
      cameraDomPresent: Boolean(document.querySelector('[data-cam-video]')),
    }));
    assert.equal(closed.liveTracks, 0, 'Camera cleanup must stop every camera/microphone track');
    assert.ok(closed.revoked >= galleryUrls, 'Camera cleanup must revoke gallery object URLs');
    assert.equal(closed.cameraDomPresent, false, 'Camera window DOM must be removed after close');
    assert.deepEqual(errors, [], `page errors: ${JSON.stringify(errors)}`);
  } finally {
    await browser.close();
  }
});
