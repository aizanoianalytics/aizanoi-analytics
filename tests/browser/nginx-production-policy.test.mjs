import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.AIZANOI_NGINX_BASE_URL || 'http://127.0.0.1:4174';

test('production-like Nginx permits explicit camera/microphone and blob media while keeping CSP active', async () => {
  const browser = await chromium.launch({
    headless:true,
    args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'],
  });
  const context = await browser.newContext({
    viewport:{ width:1280, height:860 },
    permissions:['camera','microphone'],
    serviceWorkers:'block',
  });
  const page = await context.newPage();
  try {
    const response = await page.goto(`${base}/?nginx-policy=${Date.now()}`, { waitUntil:'networkidle' });
    assert.ok(response?.ok(), `Nginx root returned ${response?.status()}`);
    const headers = response.headers();
    assert.match(headers['permissions-policy'] || '', /microphone=\(self\)/);
    assert.match(headers['permissions-policy'] || '', /camera=\(self\)/);
    assert.match(headers['content-security-policy'] || '', /media-src 'self' blob:/);

    const result = await page.evaluate(async () => {
      const violations = [];
      document.addEventListener('securitypolicyviolation', (event) => violations.push({ directive:event.violatedDirective, blocked:event.blockedURI }));
      let capture = false;
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video:true, audio:true });
        capture = stream.getVideoTracks().length > 0 && stream.getAudioTracks().length > 0;
      } finally {
        stream?.getTracks().forEach((track) => track.stop());
      }
      const audio = document.createElement('audio');
      const url = URL.createObjectURL(new Blob([new Uint8Array([0, 1, 2, 3])], { type:'audio/mpeg' }));
      audio.src = url;
      document.body.appendChild(audio);
      audio.load();
      await new Promise((resolve) => setTimeout(resolve, 150));
      audio.remove();
      URL.revokeObjectURL(url);
      return { capture, violations };
    });
    assert.equal(result.capture, true, 'same-origin Camera permission must survive the production policy');
    assert.equal(result.violations.some((item) => item.directive === 'media-src' && String(item.blocked).startsWith('blob:')), false, JSON.stringify(result.violations));
  } finally {
    await browser.close();
  }
});
