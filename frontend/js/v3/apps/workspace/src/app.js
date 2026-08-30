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

export function createWorkspaceApp({ apps, filesystem: fs, notifications, sound }) {
  return {
    async mount({ container, options }) {
      let cwd = options?.folderId || fs.documentsId;
      let menuOpener = null;
      let focusRestoreTimer = null;
      const downloadResources = new Map();

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

      async function refresh() {
        const node = await fs.getNode(cwd);
        if (!node) { cwd = fs.documentsId; return refresh(); }
        const map = await fs.allNodes();
        const crumbs = [];
        let cursor = node;
        while (cursor) { crumbs.unshift(cursor); cursor = cursor.parent ? map.get(cursor.parent) : null; }
        pathEl.textContent = crumbs.map((crumb) => crumb.name).join(' / ');
        const children = await fs.childrenOf(cwd);
        children.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1));
        grid.innerHTML = children.length
          ? children.map((child) => `
            <div class="az-workspace-item" data-ws-id="${esc(child.id)}" data-ws-kind="${child.kind}" tabindex="0" role="button" aria-label="${esc(child.name)}">
              <span class="az-workspace-icon">${iconFor(child)}</span>
              <strong>${esc(child.name)}</strong>
              <small>${child.kind === 'folder' ? `${(child.children || []).length} items` : fs.formatSize(child.size)}</small>
              <button class="az-workspace-more" type="button" data-ws-menu="${esc(child.id)}" aria-label="Actions for ${esc(child.name)}">⋯</button>
            </div>`).join('')
          : '<div class="az-empty-state"><div><h3>This folder is empty</h3><p>Import files, save something from Notepad, or capture a photo.</p></div></div>';
      }

      function releaseDownloadUrl(url) {
        const timer = downloadResources.get(url);
        if (timer) clearTimeout(timer);
        downloadResources.delete(url);
        URL.revokeObjectURL(url);
      }

      async function download(node) {
        const blob = await fs.readFileBlob(node.id);
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = node.name;
        link.click();
        const timer = setTimeout(() => releaseDownloadUrl(url), 60000);
        downloadResources.set(url, timer);
      }

      async function openNode(id) {
        const node = await fs.getNode(id);
        if (!node) return;
        if (node.kind === 'folder') { cwd = node.id; await refresh(); return; }
        const mime = node.mime || '';
        sound.play('click');
        if (mime.startsWith('text/') || mime === 'application/json') {
          apps.open('notepad', { fileId: node.id });
        } else if (mime.startsWith('image/')) {
          apps.open('camera');
          notifications.notify('Workspace', `${node.name} — preview from Camera gallery or download below.`, 'system');
          await download(node);
        } else if (mime.startsWith('audio/')) {
          apps.open('winamp', { trackId: node.id, name: node.name });
        } else {
          await download(node);
        }
      }

      function closeMenu({ restoreFocus = true } = {}) {
        if (focusRestoreTimer) { clearTimeout(focusRestoreTimer); focusRestoreTimer = null; }
        const menu = document.querySelector('[data-ws-actionmenu]');
        const shouldRestoreFocus = Boolean(menu);
        menu?.remove();
        document.removeEventListener('click', onDocClick, true);
        document.removeEventListener('keydown', onMenuKey, true);
        if (restoreFocus && shouldRestoreFocus && menuOpener?.isConnected) {
          const opener = menuOpener;
          menuOpener = null;
          focusRestoreTimer = setTimeout(() => {
            focusRestoreTimer = null;
            if (opener.isConnected) opener.focus();
          }, 0);
        } else {
          menuOpener = null;
        }
      }

      function onDocClick(event) {
        if (!event.target.closest('[data-ws-actionmenu]')) closeMenu();
      }

      function onMenuKey(event) {
        if (event.key === 'Escape') { event.stopPropagation(); closeMenu(); }
      }

      function openMenu(id, anchor) {
        closeMenu();
        menuOpener = anchor;
        const menu = document.createElement('div');
        menu.className = 'az-w98-dialog az-ws-actionmenu';
        menu.dataset.wsActionmenu = id;
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'Actions for item');
        menu.innerHTML = `
          <div class="az-w98-titlebar"><span>Item actions</span><button class="az-w98-x" type="button" role="menuitem" data-ws-menu-close aria-label="Close menu">×</button></div>
          <div class="az-ws-actionmenu-body">
            <button class="az-button" type="button" role="menuitem" data-ws-act="rename">Rename</button>
            <button class="az-button" type="button" role="menuitem" data-ws-act="trash">Move to Recycle Bin</button>
            <button class="az-button" type="button" role="menuitem" data-ws-act="cancel">Cancel</button>
          </div>`;
        const rect = anchor.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`;
        menu.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - 190)}px`;
        menu.style.zIndex = '8600';
        document.body.appendChild(menu);
        menu.querySelector('[data-ws-act="rename"]').focus();

        menu.addEventListener('click', async (event) => {
          if (event.target.closest('[data-ws-menu-close]')) { closeMenu(); return; }
          const action = event.target.closest('[data-ws-act]')?.dataset.wsAct;
          if (!action) return;
          closeMenu();
          try {
            if (action === 'rename') {
              const name = (window.prompt('New name:', (await fs.getNode(id))?.name || '') || '').trim();
              if (name) { await fs.renameNode(id, name); sound.play('notification'); await refresh(); }
            } else if (action === 'trash') {
              await fs.trashNode(id);
              sound.play('trash');
              notifications.notify('Workspace', `${(await fs.getNode(id))?.name || 'Item'} moved to the Recycle Bin.`, 'system');
              await refresh();
            }
          } catch (error) {
            notifications.notify('Workspace', error.message, 'error');
          }
        });
        document.addEventListener('click', onDocClick, true);
        document.addEventListener('keydown', onMenuKey, true);
      }

      async function click(event) {
        if (event.target.closest('[data-ws-up]')) {
          const node = await fs.getNode(cwd);
          if (node?.parent) { cwd = node.parent; await refresh(); }
          return;
        }
        if (event.target.closest('[data-ws-newfolder]')) {
          const name = (window.prompt('Folder name:', 'New folder') || '').trim();
          if (!name) return;
          await fs.createFolder({ name, parent: cwd });
          sound.play('notification');
          return refresh();
        }
        if (event.target.closest('[data-ws-import]')) { fileInput.click(); return; }
        const menuAnchor = event.target.closest('[data-ws-menu]');
        if (menuAnchor) {
          event.stopPropagation();
          openMenu(menuAnchor.dataset.wsMenu, menuAnchor);
          return;
        }
        const target = event.target.closest('[data-ws-id]');
        if (target) return openNode(target.dataset.wsId);
      }

      async function handleFileChange() {
        for (const file of fileInput.files || []) {
          const folderHint = file.type.startsWith('image/') ? fs.picturesId : file.type.startsWith('audio/') ? fs.musicId : fs.documentsId;
          await fs.createFile({ name: file.name, parent: folderHint, blob: file, mime: file.type });
        }
        fileInput.value = '';
        sound.play('notification');
        notifications.notify('Workspace', 'Files imported into the Workspace.', 'system');
        await refresh();
      }

      function handleClick(event) {
        click(event).catch((error) => notifications.notify('Workspace', error.message, 'error'));
      }

      function handleKeydown(event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const target = event.target.closest('[data-ws-id]');
        if (target) {
          event.preventDefault();
          openNode(target.dataset.wsId).catch((error) => notifications.notify('Workspace', error.message, 'error'));
        }
      }

      fileInput.addEventListener('change', handleFileChange);
      container.addEventListener('click', handleClick);
      container.addEventListener('keydown', handleKeydown);

      await refresh();

      return () => {
        closeMenu({ restoreFocus: false });
        fileInput.removeEventListener('change', handleFileChange);
        container.removeEventListener('click', handleClick);
        container.removeEventListener('keydown', handleKeydown);
        for (const url of [...downloadResources.keys()]) releaseDownloadUrl(url);
      };
    },
  };
}
