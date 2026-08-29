/** AizanoiOS Workspace — file explorer over the virtual file system core. */

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
      <span class="az-system-spacer"></span>
      <span class="az-camera-status" data-ws-path></span>
    </div>
    <div class="az-workspace-grid" data-ws-grid role="list"></div>
  </div></div>`;

  const grid = container.querySelector('[data-ws-grid]');
  const pathEl = container.querySelector('[data-ws-path]');
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
        <button class="az-workspace-item" type="button" role="listitem" data-ws-id="${esc(child.id)}" data-ws-kind="${child.kind}">
          <span class="az-workspace-icon">${iconFor(child)}</span>
          <strong>${esc(child.name)}</strong>
          <small>${child.kind === 'folder' ? `${(child.children || []).length} items` : fs.formatSize(child.size)}</small>
        </button>`).join('')
      : '<div class="az-empty-state"><div><h3>This folder is empty</h3><p>Save something from Notepad, capture a photo, or create a folder.</p></div></div>';
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
    const target = event.target.closest('[data-ws-id]');
    if (!target) return;
    const id = target.dataset.wsId;
    const node = await fs.getNode(id);
    if (!node) return;
    if (node.kind === 'folder') { cwd = node.id; await refresh(); return; }
    const mime = node.mime || '';
    api.playSound('click');
    if (mime.startsWith('text/') || mime === 'application/json') {
      api.openApp('notepad', { fileId: node.id });
    } else if (mime.startsWith('image/')) {
      const blob = await fs.readFileBlob(node.id);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const win = window.open(url, '_blank');
        if (!win) api.notify('Workspace', 'Allow pop-ups to preview images, or download them instead.', 'system');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } else if (mime.startsWith('audio/')) {
      api.openApp('winamp');
    } else {
      const blob = await fs.readFileBlob(node.id);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = node.name; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    }
  };

  const context = async (event) => {
    const target = event.target.closest('[data-ws-id]');
    if (!target) return;
    event.preventDefault();
    const id = target.dataset.wsId;
    const node = await fs.getNode(id);
    if (!node) return;
    const rename = window.prompt(`Rename "${node.name}" to:`, node.name);
    if (rename && rename.trim() && rename.trim() !== node.name) {
      try { await fs.renameNode(id, rename.trim()); api.playSound('notification'); } catch (error) { api.notify('Workspace', error.message, 'error'); }
    }
    await refresh();
  };
  const trash = async (event) => {
    const target = event.target.closest('[data-ws-id]');
    if (!target || target.dataset.wsKind !== 'file') return;
    event.preventDefault();
    const node = await fs.getNode(target.dataset.wsId);
    if (!node) return;
    if (!window.confirm(`Move "${node.name}" to the Recycle Bin?`)) return;
    try {
      await fs.trashNode(target.dataset.wsId);
      api.playSound('trash');
      await refresh();
    } catch (error) { api.notify('Workspace', error.message, 'error'); }
  };

  container.addEventListener('click', (event) => { click(event).catch((error) => api.notify('Workspace', error.message, 'error')); });
  container.addEventListener('contextmenu', (event) => { context(event).catch(() => {}); });
  container.addEventListener('dblclick', (event) => { trash(event).catch(() => {}); });

  await refresh();
  return () => {};
}
