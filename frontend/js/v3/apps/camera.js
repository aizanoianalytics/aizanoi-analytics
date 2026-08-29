/** AizanoiOS Camera — getUserMedia photo capture, stored in the Workspace or downloaded. */

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

export async function mount({ container, api }) {
  container.innerHTML = `
  <div class="az-app-shell"><div class="az-app-toolbar"><strong>Camera</strong><span class="az-system-spacer"></span><span class="az-app-caption">Local only · nothing leaves this device</span></div>
  <div class="az-camera">
    <div class="az-camera-stage">
      <video class="az-camera-video" data-cam-video autoplay playsinline muted></video>
      <canvas class="az-camera-canvas" data-cam-canvas hidden></canvas>
      <div class="az-camera-off" data-cam-off>
        <h3>Camera is off</h3>
        <p>Starting the camera will ask for your permission. The stream and any photos stay on this device.</p>
        <button class="az-button" type="button" data-cam-start>Start camera</button>
      </div>
    </div>
    <div class="az-camera-actions">
      <button class="az-button az-hr-primary" type="button" data-cam-shot disabled>Capture photo</button>
      <label class="az-camera-toggle"><input type="checkbox" data-cam-mirror checked> Mirror preview</label>
      <span class="az-system-spacer"></span>
      <span class="az-camera-status" data-cam-status></span>
    </div>
    <div class="az-camera-gallery" data-cam-gallery aria-label="Recent photos"></div>
  </div></div>`;

  const video = container.querySelector('[data-cam-video]');
  const canvas = container.querySelector('[data-cam-canvas]');
  const offPanel = container.querySelector('[data-cam-off]');
  const statusEl = container.querySelector('[data-cam-status]');
  const gallery = container.querySelector('[data-cam-gallery]');
  const shotBtn = container.querySelector('[data-cam-shot]');
  const mirrorToggle = container.querySelector('[data-cam-mirror]');

  const fs = await import('/js/v3/workspace/fs.js');
  let stream = null;

  async function refreshGallery() {
    // Revoke previous object URLs before rebuilding the gallery.
    gallery.querySelectorAll('img[data-photo-src]').forEach((img) => {
      if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
    });
    const items = await fs.childrenOf(fs.PICTURES_ID);
    const photos = items.filter((node) => node.kind === 'file' && (node.mime || '').startsWith('image/')).slice(-12).reverse();
    gallery.innerHTML = photos.length
      ? photos.map((node) => `<figure class="az-camera-thumb" data-photo-id="${esc(node.id)}"><img src="#" alt="${esc(node.name)}" data-photo-src="${esc(node.id)}"><figcaption>${esc(node.name)}<button class="az-button" type="button" data-photo-download="${esc(node.id)}">Download</button></figcaption></figure>`).join('')
      : '<p class="az-camera-empty">Photos you capture appear here (stored in Workspace · Pictures).</p>';
    for (const node of photos) {
      const blob = await fs.readFileBlob(node.id);
      const img = gallery.querySelector(`[data-photo-src="${node.id}"]`);
      if (blob && img) img.src = URL.createObjectURL(blob);
    }
  }

  async function start() {
    api.playSound('click');
    if (!navigator.mediaDevices?.getUserMedia) {
      statusEl.textContent = 'This browser does not support camera capture.';
      return;
    }
    try {
      // Owner requirement: the camera app should also request microphone
      // permission. The audio track is requested here but NOT recorded —
      // capture is photo-only; a future clip-recording mode can use it.
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
      video.srcObject = stream;
      offPanel.hidden = true;
      shotBtn.disabled = false;
      statusEl.textContent = 'Camera active';
      api.notify('Camera', 'Camera connected. Photos stay on this device.', 'system');
    } catch (error) {
      statusEl.textContent = error?.name === 'NotAllowedError' ? 'Permission denied — camera stays off.' : 'Camera unavailable.';
      api.playSound('error');
    }
  }

  function stop() {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
    offPanel.hidden = false;
    shotBtn.disabled = true;
    statusEl.textContent = '';
  }

  async function capture() {
    if (!stream) return;
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return;
    const mirror = mirrorToggle.checked;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0);
    canvas.hidden = false;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    canvas.hidden = true;
    if (!blob) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    await fs.createFile({ name: `photo-${stamp}.jpg`, parent: fs.PICTURES_ID, blob, mime: 'image/jpeg' });
    api.playSound('camera');
    statusEl.textContent = 'Photo saved to Workspace · Pictures';
    await refreshGallery();
  }

  async function download(id) {
    const blob = await fs.readFileBlob(id);
    if (!blob) return;
    const node = await fs.getNode(id);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = node.name;
    link.click();
    URL.revokeObjectURL(url);
  }

  const click = async (event) => {
    const startBtn = event.target.closest('[data-cam-start]');
    if (startBtn) { await start(); return; }
    if (event.target.closest('[data-cam-shot]')) { await capture(); return; }
    const dl = event.target.closest('[data-photo-download]')?.dataset.photoDownload;
    if (dl) { await download(dl); return; }
  };
  container.addEventListener('click', (event) => { click(event).catch((error) => api.notify('Camera', error.message, 'error')); });
  mirrorToggle.addEventListener('change', () => { video.dataset.mirrored = mirrorToggle.checked ? 'true' : 'false'; });
  video.dataset.mirrored = mirrorToggle.checked ? 'true' : 'false';

  await refreshGallery();
  window.addEventListener('pagehide', stop, { once: true });
  return () => stop();
}
