/** Private Winamp-style player. Shared services arrive only as capabilities. */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[c]));

const PLAYLIST_KEY = 'aizanoi-winamp-playlist-v1';

function readPersisted() {
  try { return JSON.parse(localStorage.getItem(PLAYLIST_KEY)) || []; } catch (_) { return []; }
}

export async function mountWinamp({ container, capabilities }) {
  const { filesystem, notifications, sound } = capabilities;
  container.innerHTML = `
  <div class="az-app-shell az-utility-shell az-winamp-shell">
  <div class="az-winamp">
    <div class="az-winamp-brand"><strong>WINAMP</strong><span>Local + Workspace audio</span></div>
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
  const vol = container.querySelector('[data-wa-vol]');

  let playlist = readPersisted();
  let index = -1;
  const localBlobs = new Map();

  function persist() {
    try {
      localStorage.setItem(PLAYLIST_KEY, JSON.stringify(playlist.filter((item) => item.source === 'workspace')));
    } catch (_) {}
  }

  function fmt(seconds) {
    if (!Number.isFinite(seconds)) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function renderPlaylist() {
    playlistEl.innerHTML = playlist.length
      ? playlist.map((item, i) => `<li><button class="az-winamp-item${i === index ? ' is-active' : ''}" type="button" data-wa-item="${i}"><span>${i + 1}.</span> ${esc(item.name)}</button></li>`).join('')
      : '<li class="az-winamp-empty">Playlist empty — add local files or load the Workspace Music folder.</li>';
  }

  async function resolveSource(item) {
    if (item.source === 'local') return localBlobs.get(item.name) || null;
    return filesystem.readFileBlob(item.id);
  }

  function revokeActiveUrl() {
    if (!audio.dataset.blobUrl) return;
    URL.revokeObjectURL(audio.dataset.blobUrl);
    delete audio.dataset.blobUrl;
  }

  async function play(i) {
    if (!playlist.length) {
      notifications.notify('Winamp', 'Playlist is empty. Add an audio file first.', 'system');
      return;
    }
    index = (i + playlist.length) % playlist.length;
    const item = playlist[index];
    const blob = await resolveSource(item);
    if (!blob) {
      notifications.notify('Winamp', `Cannot load ${item.name}. It may have been removed from Workspace.`, 'error');
      return;
    }
    const url = URL.createObjectURL(blob);
    revokeActiveUrl();
    audio.dataset.blobUrl = url;
    audio.src = url;
    trackEl.textContent = `${index + 1}. ${item.name}`;
    try {
      await audio.play();
    } catch (_) {
      notifications.notify('Winamp', 'Press play to start audio.', 'system');
    }
    renderPlaylist();
  }

  async function resumePlayback() {
    if (!playlist.length) {
      notifications.notify('Winamp', 'Playlist is empty. Add an audio file first.', 'system');
      return;
    }
    if (index < 0 || !audio.getAttribute('src')) return play(index < 0 ? 0 : index);
    try {
      await audio.play();
    } catch (_) {
      notifications.notify('Winamp', 'The browser blocked playback. Press play again after interacting with the page.', 'system');
    }
  }

  function handleTimeUpdate() {
    timeEl.textContent = fmt(audio.currentTime);
    if (audio.duration) seekEl.value = String(Math.round((audio.currentTime / audio.duration) * 1000));
  }

  async function handleAction(event) {
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
    sound.play('click');
    if (action === 'play') return resumePlayback();
    else if (action === 'pause') audio.pause();
    else if (action === 'stop') { audio.pause(); audio.currentTime = 0; }
    else if (action === 'prev') return play(index < 0 ? playlist.length - 1 : index - 1);
    else if (action === 'next') return play(index < 0 ? 0 : index + 1);
    else if (action === 'add-local') fileInput.click();
    else if (action === 'add-ws') {
      const items = await filesystem.childrenOf(filesystem.musicId);
      const tracks = items.filter((node) => node.kind === 'file' && (node.mime || '').startsWith('audio/'));
      if (!tracks.length) {
        notifications.notify('Winamp', 'No audio files in Workspace · Music yet. Add local files instead.', 'system');
        return;
      }
      playlist = tracks.map((node) => ({ source:'workspace', id:node.id, name:node.name }));
      persist();
      renderPlaylist();
      return play(0);
    }
  }

  const handleClick = (event) => {
    handleAction(event).catch((error) => notifications.notify('Winamp', error.message, 'error'));
  };

  async function handleFileChange() {
    const files = [...(fileInput.files || [])];
    const firstAddedIndex = playlist.length;
    for (const file of files) {
      try {
        const node = await filesystem.createFile({
          name:file.name,
          parent:filesystem.musicId,
          blob:file,
          mime:file.type || 'audio/mpeg',
        });
        playlist.push({ source:'workspace', id:node.id, name:node.name });
      } catch (_) {
        localBlobs.set(file.name, file);
        playlist.push({ source:'local', name:file.name });
      }
    }
    fileInput.value = '';
    persist();
    renderPlaylist();
    if (index === -1 && files.length) await play(firstAddedIndex);
  }

  function handleSeekInput() {
    if (audio.duration) audio.currentTime = (Number(seekEl.value) / 1000) * audio.duration;
  }

  function handleEnded() {
    play(index + 1).catch((error) => notifications.notify('Winamp', error.message, 'error'));
  }

  function handleVolumeInput() {
    audio.volume = Number(vol.value) / 100;
  }

  container.addEventListener('click', handleClick);
  fileInput.addEventListener('change', handleFileChange);
  seekEl.addEventListener('input', handleSeekInput);
  audio.addEventListener('timeupdate', handleTimeUpdate);
  audio.addEventListener('ended', handleEnded);
  vol.addEventListener('input', handleVolumeInput);
  audio.volume = 0.8;
  renderPlaylist();

  function onOpen(newOptions) {
    const trackId = newOptions?.trackId;
    if (!trackId) return;
    const existing = playlist.findIndex((item) => item.source === 'workspace' && item.id === trackId);
    if (existing >= 0) {
      play(existing).catch((error) => notifications.notify('Winamp', error.message, 'error'));
      return;
    }
    playlist.push({ source:'workspace', id:trackId, name:newOptions?.name || 'Workspace track' });
    persist();
    renderPlaylist();
    play(playlist.length - 1).catch((error) => notifications.notify('Winamp', error.message, 'error'));
  }

  return {
    cleanup() {
      container.removeEventListener('click', handleClick);
      fileInput.removeEventListener('change', handleFileChange);
      seekEl.removeEventListener('input', handleSeekInput);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      vol.removeEventListener('input', handleVolumeInput);
      audio.pause();
      revokeActiveUrl();
    },
    onOpen,
  };
}
