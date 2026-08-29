/** AizanoiOS Winamp-style music player. Playlist seeds come from the Workspace Music folder;
 *  users can also load local audio files (and later a shipped playlist file) without any upload. */

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

const PLAYLIST_KEY = 'aizanoi-winamp-playlist-v1';

function readPersisted() {
  try { return JSON.parse(localStorage.getItem(PLAYLIST_KEY)) || []; } catch (_) { return []; }
}

export async function mount({ container, api }) {
  container.innerHTML = `
  <div class="az-app-shell"><div class="az-app-toolbar"><strong>Winamp</strong><span class="az-system-spacer"></span><span class="az-app-caption">AizanoiOS audio player</span></div>
  <div class="az-winamp">
    <div class="az-winamp-display" data-wa-display>
      <div class="az-winamp-track" data-wa-track>— nothing playing —</div>
      <div class="az-winamp-time" data-wa-time>00:00</div>
    </div>
    <div class="az-winamp-progress"><input type="range" min="0" max="1000" value="0" data-wa-seek aria-label="Seek"></div>
    <div class="az-winamp-controls" role="toolbar" aria-label="Playback controls">
      <button class="az-button" type="button" data-wa-prev title="Previous">⏮</button>
      <button class="az-button" type="button" data-wa-play title="Play">▶</button>
      <button class="az-button" type="button" data-wa-pause title="Pause">⏸</button>
      <button class="az-button" type="button" data-wa-stop title="Stop">⏹</button>
      <button class="az-button" type="button" data-wa-next title="Next">⏭</button>
      <span class="az-system-spacer"></span>
      <label class="az-winamp-vol">Vol <input type="range" min="0" max="100" value="80" data-wa-vol aria-label="Volume"></label>
    </div>
    <div class="az-winamp-add">
      <button class="az-button" type="button" data-wa-add-local>Add local files…</button>
      <button class="az-button" type="button" data-wa-add-workspace>Load from Workspace · Music</button>
      <input type="file" accept="audio/*" multiple hidden data-wa-file-input>
    </div>
    <ol class="az-winamp-playlist" data-wa-playlist aria-label="Playlist"></ol>
    <audio data-wa-audio preload="metadata"></audio>
  </div></div>`;

  const audio = container.querySelector('[data-wa-audio]');
  const trackEl = container.querySelector('[data-wa-track]');
  const timeEl = container.querySelector('[data-wa-time]');
  const seekEl = container.querySelector('[data-wa-seek]');
  const playlistEl = container.querySelector('[data-wa-playlist]');
  const fileInput = container.querySelector('[data-wa-file-input]');

  /** playlist item: {name, blob?} — blobs live in-memory during the session; persistent
   *  items point at Workspace file ids resolved on demand. */
  let playlist = readPersisted(); // [{source:'workspace', id, name} | {source:'local', name}]
  let index = -1;
  const localBlobs = new Map(); // name -> File (session only)

  function persist() {
    try { localStorage.setItem(PLAYLIST_KEY, JSON.stringify(playlist.filter((item) => item.source === 'workspace'))); } catch (_) {}
  }

  function fmt(seconds) {
    if (!Number.isFinite(seconds)) return '00:00';
    const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function renderPlaylist() {
    playlistEl.innerHTML = playlist.length
      ? playlist.map((item, i) => `<li><button class="az-winamp-item${i === index ? ' is-active' : ''}" type="button" data-wa-item="${i}"><span>${i + 1}.</span> ${esc(item.name)}</button></li>`).join('')
      : '<li class="az-winamp-empty">Playlist empty — add local files or load the Workspace Music folder.</li>';
  }

  async function resolveSource(item) {
    if (item.source === 'local') return localBlobs.get(item.name) || null;
    const fs = await import('/js/v3/workspace/fs.js');
    return fs.readFileBlob(item.id);
  }

  async function play(i) {
    if (!playlist.length) return;
    index = (i + playlist.length) % playlist.length;
    const item = playlist[index];
    const blob = await resolveSource(item);
    if (!blob) { api.notify('Winamp', `Cannot load ${item.name}`, 'error'); return; }
    const url = URL.createObjectURL(blob);
    if (audio.dataset.blobUrl) URL.revokeObjectURL(audio.dataset.blobUrl);
    audio.dataset.blobUrl = url;
    audio.src = url;
    trackEl.textContent = `${index + 1}. ${item.name}`;
    audio.play().catch(() => api.notify('Winamp', 'Press play to start audio.', 'system'));
    renderPlaylist();
  }

  function tick() {
    timeEl.textContent = fmt(audio.currentTime);
    if (audio.duration) seekEl.value = String(Math.round((audio.currentTime / audio.duration) * 1000));
  }

  const click = async (event) => {
    const itemIdx = event.target.closest('[data-wa-item]')?.dataset.waItem;
    if (itemIdx !== undefined) return play(Number(itemIdx));
    const action = event.target.closest('[data-wa-action]')?.dataset.waAction
      || (event.target.closest('[data-wa-play]') ? 'play' : '')
      || (event.target.closest('[data-wa-pause]') ? 'pause' : '')
      || (event.target.closest('[data-wa-stop]') ? 'stop' : '')
      || (event.target.closest('[data-wa-prev]') ? 'prev' : '')
      || (event.target.closest('[data-wa-next]') ? 'next' : '')
      || (event.target.closest('[data-wa-add-local]') ? 'add-local' : '')
      || (event.target.closest('[data-wa-add-workspace]') ? 'add-ws' : '');
    api.playSound('click');
    if (action === 'play') audio.play().catch(() => {});
    else if (action === 'pause') audio.pause();
    else if (action === 'stop') { audio.pause(); audio.currentTime = 0; }
    else if (action === 'prev') play(index - 1);
    else if (action === 'next') play(index + 1);
    else if (action === 'add-local') fileInput.click();
    else if (action === 'add-ws') {
      const fs = await import('/js/v3/workspace/fs.js');
      const items = await fs.childrenOf(fs.MUSIC_ID);
      const tracks = items.filter((node) => node.kind === 'file' && (node.mime || '').startsWith('audio/'));
      if (!tracks.length) { api.notify('Winamp', 'No audio files in Workspace · Music yet. Add local files instead.', 'system'); return; }
      playlist = tracks.map((node) => ({ source: 'workspace', id: node.id, name: node.name }));
      persist(); renderPlaylist();
      play(0);
    }
  };

  fileInput.addEventListener('change', async () => {
    const fs = await import('/js/v3/workspace/fs.js');
    for (const file of fileInput.files || []) {
      // Import into the Workspace so the playlist survives reloads (blobs
      // cannot live in localStorage; IndexedDB is the durable home).
      try {
        const node = await fs.createFile({ name: file.name, parent: fs.MUSIC_ID, blob: file, mime: file.type || 'audio/mpeg' });
        playlist.push({ source: 'workspace', id: node.id, name: node.name });
      } catch (error) {
        localBlobs.set(file.name, file);
        playlist.push({ source: 'local', name: file.name });
      }
    }
    fileInput.value = '';
    persist();
    renderPlaylist();
    if (index === -1 && playlist.length) play(playlist.length - (fileInput.files?.length || 1));
    else renderPlaylist();
  });

  seekEl.addEventListener('input', () => {
    if (audio.duration) audio.currentTime = (Number(seekEl.value) / 1000) * audio.duration;
  });
  audio.addEventListener('timeupdate', tick);
  audio.addEventListener('ended', () => play(index + 1));

  const vol = container.querySelector('[data-wa-vol]');
  vol.addEventListener('input', () => { audio.volume = Number(vol.value) / 100; });
  audio.volume = 0.8;

  container.addEventListener('click', (event) => { click(event).catch((error) => api.notify('Winamp', error.message, 'error')); });
  renderPlaylist();
  function onOpen(newOptions) {
    const trackId = newOptions?.trackId;
    if (trackId) {
      const existing = playlist.findIndex((item) => item.source === 'workspace' && item.id === trackId);
      if (existing >= 0) play(existing);
      else { playlist.push({ source: 'workspace', id: trackId, name: newOptions?.name || 'Workspace track' }); persist(); renderPlaylist(); play(playlist.length - 1); }
    }
  }
  return {
    cleanup: () => { audio.pause(); if (audio.dataset.blobUrl) URL.revokeObjectURL(audio.dataset.blobUrl); },
    onOpen,
  };
}
