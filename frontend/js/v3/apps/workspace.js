/** AizanoiOS Workspace — file explorer over the virtual file system core.
 *
 *  Interaction contract:
 *    single click        → open (folders navigate, files open in their app / download)
 *    right-click / long  → rename
 *    Delete button (⋯ row action on touch, context menu action) → Recycle Bin
 */

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const ICONS = { folder: '📁', text: '📄', image: '🖼️', audio: '🎵', default: '📦' };

function iconFor(node) {
  if (node.kind === 'folder') return ICONS.folder;
  if ((node.mime || '').startsWith('text/') || node.mime === 'application/json') return ICONS.text;
  if ((node.mime || '').startsWith('image/')) return ICONS.image;
  if ((node.mime || '').startsWith('audio/')) return ICONS.audio;
  return ICONS.default;
}

export async function mount({ container, api, options }) {
  let cwd = options?.folderId || 'folder-documents';
  container.innerHTML = `
  <div class="az-app-shell"><div class="az-app-toolbar"><strong>Workspace</strong><span class="az-system-spacer"></span><span class="az-app-caption">Local files · stored in this browser</span></div>
  <div class="az-workspace">
    <div class="az-workspace-actions" role="toolbar" aria-label="Workspace actions">
      <button class="az-button" type="button" data-ws-up>Up</button>
      <button class="az-button" type="button" data-ws-newfolder>New folder</button>
      <button class="az-button" type="button" data-ws-import>Import files…</button>
      <input type="file" multiple hidden data-ws-file-input>
      <span class="az-system-spacer"></span>
      <span class="az-camera-status" data-ws-path></span>
    </div>
    <div class="az-workspace-grid" data-ws-grid role="list"></div>
  </div></div>`;

  const grid = container.querySelector('[data-ws-grid]');
  const pathEl = container.querySelector('[data-ws-path]');
  const fileInput = container.querySelector('[data-ws-file-input]');
  const fs = await import('/js/v3/workspace/fs.js');

  async function refresh() {
    const node = await fs.getNode(cwd);
    if (!node) { cwd = fs.DOCUMENTS_ID; return refresh(); }
    const map = await fs.allNodes();
    const crumbs = [];
    let cursor = node;
    while (cursor) { crumbs.unshift(cursor); cursor = cursor.parent ? map.get(cursor.parent) : null; }
    pathEl.textContent = crumbs.map((crumb) => crumb.name).join(' / ');
    const children = await fs.childrenOf(cwd);
    children.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1));
    grid.innerHTML = children.length
      ? children.map((child) => `
        <div class="az-workspace-item" role="listitem" data-ws-id="${esc(child.id)}" data-ws-kind="${child.kind}" tabindex="0" role="button" aria-label="${esc(child.name)}">
          <span class="az-workspace-icon">${iconFor(child)}</span>
          <strong>${esc(child.name)}</strong>
          <small>${child.kind === 'folder' ? `${(child.children || []).length} items` : fs.formatSize(child.size)}</small>
          <button class="az-workspace-more" type="button" data-ws-menu="${esc(child.id)}" aria-label="Actions for ${esc(child.name)}">⋯</button>
        </div>`).join('')
      : '<div class="az-empty-state"><div><h3>This folder is empty</h3><p>Import files, save something from Notepad, or capture a photo.</p></div></div>';
  }

  async function openNode(id) {
    const node = await fs.getNode(id);
    if (!node) return;
    if (node.kind === 'folder') { cwd = node.id; await refresh(); return; }
    const mime = node.mime || '';
    api.playSound('click');
    if (mime.startsWith('text/') || mime === 'application/json') {
      api.openApp('notepad', { fileId: node.id });
    } else if (mime.startsWith('image/')) {
      api.openApp('camera');
      api.notify('Workspace', `${node.name} — preview from Camera gallery or download below.`, 'system');
      await download(node);
    } else if (mime.startsWith('audio/')) {
      api.openApp('winamp', { trackId: node.id, name: node.name });
    } else {
      await download(node);
    }
  }

  async function download(node) {
    const blob = await fs.readFileBlob(node.id);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = node.name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function menu(id) {
    const node = await fs.getNode(id);
    if (!node) return;
    const choice = window.prompt(`Actions for "${node.name}"\n\nrename / trash / cancel:`, 'rename');
    if (!choice) return;
    const action = choice.trim().toLowerCase();
    try {
      if (action === 'rename') {
        const name = (window.prompt('New name:', node.name) || '').trim();
        if (name && name !== node.name) { await fs.renameNode(id, name); api.playSound('notification'); }
      } else if (action === 'trash' || action === 'delete') {
        await fs.trashNode(id);
        api.playSound('trash');
        api.notify('Workspace', `${node.name} moved to the Recycle Bin.`, 'system');
      }
      await refresh();
    } catch (error) { api.notify('Workspace', error.message, 'error'); }
  }

  const click = async (event) => {
    if (event.target.closest('[data-ws-up]')) {
      const node = await fs.getNode(cwd);
      if (node?.parent) { cwd = node.parent; await refresh(); }
      return;
    }
    if (event.target.closest('[data-ws-newfolder]')) {
      const name = (window.prompt('Folder name:', 'New folder') || '').trim();
      if (!name) return;
      await fs.createFolder({ name, parent: cwd });
      api.playSound('notification');
      return refresh();
    }
    if (event.target.closest('[data-ws-import]')) { fileInput.click(); return; }
    const menuId = event.target.closest('[data-ws-menu]')?.dataset.wsMenu;
    if (menuId) { event.stopPropagation(); return menu(menuId); }
    const target = event.target.closest('[data-ws-id]');
    if (target) return openNode(target.dataset.wsId);
  };

  fileInput.addEventListener('change', async () => {
    for (const file of fileInput.files || []) {
      const folderHint = file.type.startsWith('image/') ? fs.PICTURES_ID : file.type.startsWith('audio/') ? fs.MUSIC_ID : fs.DOCUMENTS_ID;
      await fs.createFile({ name: file.name, parent: folderHint, blob: file, mime: file.type });
    }
    fileInput.value = '';
    api.playSound('notification');
    api.notify('Workspace', 'Files imported into the Workspace.', 'system');
    await refresh();
  });

  container.addEventListener('click', (event) => { click(event).catch((error) => api.notify('Workspace', error.message, 'error')); });
  container.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target.closest('[data-ws-id]');
    if (target) { event.preventDefault(); openNode(target.dataset.wsId).catch((error) => api.notify('Workspace', error.message, 'error')); }
  });

  await refresh();
  return () => {};
}
