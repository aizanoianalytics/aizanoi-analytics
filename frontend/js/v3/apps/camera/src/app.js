/** Private Camera implementation. Shared services arrive only as capabilities. */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[c]));

const CAMERA_ONLY_FALLBACK_ERRORS = new Set(['NotFoundError', 'OverconstrainedError']);

export async function mountCamera({ container, capabilities }) {
  const { filesystem, media, notifications, sound } = capabilities;
  container.innerHTML = `
  <div class="az-app-shell az-camera-shell">
  <div class="az-camera">
    <div class="az-camera-privacy"><strong>Local capture</strong><span>Camera and microphone permission are requested together. Audio is never recorded or uploaded.</span></div>
    <div class="az-camera-stage">
      <video class="az-camera-video" data-cam-video autoplay playsinline muted></video>
      <canvas class="az-camera-canvas" data-cam-canvas hidden></canvas>
      <div class="az-camera-off" data-cam-off>
        <h3>Camera is off</h3>
        <p>Starting the camera asks for device permission. Captured photos stay in Workspace · Pictures on this browser.</p>
        <button class="az-button" type="button" data-cam-start>Start camera</button>
      </div>
    </div>
    <div class="az-camera-actions">
      <button class="az-button az-hr-primary" type="button" data-cam-shot disabled>Capture photo</button>
      <label class="az-camera-toggle"><input type="checkbox" data-cam-mirror checked> Mirror preview</label>
      <span class="az-system-spacer"></span>
      <span class="az-camera-status" data-cam-status role="status" aria-live="polite"></span>
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
  const startBtn = container.querySelector('[data-cam-start]');

  let stream = null;
  let starting = false;

  function revokeGalleryUrls() {
    gallery.querySelectorAll('img[data-photo-src]').forEach((img) => {
      if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
    });
  }

  async function refreshGallery() {
    revokeGalleryUrls();
    const items = await filesystem.childrenOf(filesystem.picturesId);
    const photos = items.filter((node) => node.kind === 'file' && (node.mime || '').startsWith('image/')).slice(-12).reverse();
    gallery.innerHTML = photos.length
      ? photos.map((node) => `<figure class="az-camera-thumb" data-photo-id="${esc(node.id)}"><img src="#" alt="${esc(node.name)}" data-photo-src="${esc(node.id)}"><figcaption>${esc(node.name)}<button class="az-button" type="button" data-photo-download="${esc(node.id)}">Download</button></figcaption></figure>`).join('')
      : '<p class="az-camera-empty">Photos you capture appear here (stored in Workspace · Pictures).</p>';
    for (const node of photos) {
      const blob = await filesystem.readFileBlob(node.id);
      const img = gallery.querySelector(`[data-photo-src="${node.id}"]`);
      if (blob && img) img.src = URL.createObjectURL(blob);
    }
  }

  function waitForVideoReady() {
    if (video.readyState >= 1 && video.videoWidth && video.videoHeight) return Promise.resolve();
    return new Promise((resolve) => {
      let timer = null;
      const done = () => {
        if (timer) clearTimeout(timer);
        video.removeEventListener('loadedmetadata', done);
        video.removeEventListener('canplay', done);
        resolve();
      };
      video.addEventListener('loadedmetadata', done, { once:true });
      video.addEventListener('canplay', done, { once:true });
      timer = setTimeout(done, 2200);
    });
  }

  async function attachStream(nextStream, microphoneActive) {
    stream = nextStream;
    video.srcObject = stream;
    offPanel.hidden = true;
    shotBtn.disabled = true;
    await video.play().catch(() => {});
    await waitForVideoReady();
    const ready = Boolean(video.videoWidth && video.videoHeight);
    shotBtn.disabled = !ready;
    statusEl.textContent = ready
      ? (microphoneActive ? 'Camera active' : 'Camera active · microphone unavailable')
      : 'Camera connected, waiting for video…';
    return ready;
  }

  async function start() {
    if (starting || stream) return;
    sound.play('click');
    if (!media.isAvailable()) {
      statusEl.textContent = globalThis.isSecureContext === false
        ? 'Camera access requires HTTPS or localhost.'
        : 'This browser does not support camera capture.';
      return;
    }
    starting = true;
    startBtn.disabled = true;
    statusEl.textContent = 'Requesting camera and microphone permission…';
    try {
      // Owner requirement: request microphone permission alongside camera access.
      // Camera remains photo-only; the audio track is not recorded or uploaded.
      stream = await media.getUserMedia({ video: { facingMode: 'user' }, audio: true });
      await attachStream(stream, true);
      notifications.notify('Camera', 'Camera connected. Photos stay on this device; microphone audio is not recorded.', 'system');
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      video.srcObject = null;
      if (CAMERA_ONLY_FALLBACK_ERRORS.has(error?.name)) {
        try {
          const cameraOnly = await media.getUserMedia({ video: { facingMode: 'user' }, audio: false });
          await attachStream(cameraOnly, false);
          notifications.notify('Camera', 'Camera connected without microphone. Photos still stay on this device.', 'system');
          return;
        } catch (fallbackError) {
          stream?.getTracks().forEach((track) => track.stop());
          stream = null;
          video.srcObject = null;
          error = fallbackError;
        }
      }
      offPanel.hidden = false;
      shotBtn.disabled = true;
      statusEl.textContent = error?.name === 'NotAllowedError'
        ? 'Permission denied — allow camera and microphone access in the browser, then try again.'
        : error?.name === 'NotReadableError'
          ? 'Camera is busy or unavailable to this browser.'
          : 'Camera unavailable. Check the device and browser permission settings.';
      sound.play('error');
    } finally {
      starting = false;
      startBtn.disabled = false;
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
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      statusEl.textContent = 'Video is not ready yet. Try again in a moment.';
      return;
    }
    const mirror = mirrorToggle.checked;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.save();
    if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0);
    ctx.restore();
    canvas.hidden = false;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    canvas.hidden = true;
    if (!blob) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    await filesystem.createFile({
      name: `photo-${stamp}.jpg`,
      parent: filesystem.picturesId,
      blob,
      mime: 'image/jpeg',
    });
    sound.play('camera');
    statusEl.textContent = 'Photo saved to Workspace · Pictures';
    await refreshGallery();
  }

  async function download(id) {
    const blob = await filesystem.readFileBlob(id);
    if (!blob) return;
    const node = await filesystem.getNode(id);
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = node?.name || 'aizanoi-photo.jpg';
      link.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function handleAction(event) {
    if (event.target.closest('[data-cam-start]')) return start();
    if (event.target.closest('[data-cam-shot]')) return capture();
    const id = event.target.closest('[data-photo-download]')?.dataset.photoDownload;
    if (id) return download(id);
  }

  const handleClick = (event) => {
    handleAction(event).catch((error) => notifications.notify('Camera', error.message, 'error'));
  };

  function handleMirrorChange() {
    video.dataset.mirrored = mirrorToggle.checked ? 'true' : 'false';
  }

  function handlePageHide() {
    stop();
  }

  container.addEventListener('click', handleClick);
  mirrorToggle.addEventListener('change', handleMirrorChange);
  window.addEventListener('pagehide', handlePageHide, { once: true });
  handleMirrorChange();
  await refreshGallery();

  return {
    cleanup() {
      stop();
      revokeGalleryUrls();
      container.removeEventListener('click', handleClick);
      mirrorToggle.removeEventListener('change', handleMirrorChange);
      window.removeEventListener('pagehide', handlePageHide);
    },
  };
}
