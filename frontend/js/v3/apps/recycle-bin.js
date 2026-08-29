/** AizanoiOS Recycle Bin — restore or permanently delete items trashed from the Workspace. */

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

export async function mount({ container, api }) {
  container.innerHTML = `
  <div class="az-app-shell"><div class="az-app-toolbar"><strong>Recycle Bin</strong><span class="az-system-spacer"></span><span class="az-app-caption">Deleted Workspace items</span></div>
  <div class="az-recycle">
    <div class="az-recycle-actions">
      <button class="az-button" type="button" data-bin-refresh>Refresh</button>
      <button class="az-button" type="button" data-bin-empty>Empty Recycle Bin</button>
      <span class="az-system-spacer"></span>
      <span class="az-camera-status" data-bin-count></span>
    </div>
    <div class="az-recycle-list" data-bin-list role="list"></div>
  </div></div>`;

  const listEl = container.querySelector('[data-bin-list]');
  const countEl = container.querySelector('[data-bin-count]');
  const fs = await import('/js/v3/workspace/fs.js');

  async function refresh() {
    const items = await fs.childrenOf(fs.RECYCLE_ID);
    countEl.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;
    listEl.innerHTML = items.length
      ? items.map((node) => `
        <div class="az-recycle-row" role="listitem">
          <span class="az-recycle-kind">${node.kind === 'folder' ? 'Folder' : 'File'}</span>
          <strong>${esc(node.name)}</strong>
          <small>${node.kind === 'file' ? fs.formatSize(node.size) : `${(node.children || []).length} items`} · deleted ${node.updatedAt ? new Date(node.updatedAt).toLocaleDateString('en-GB') : ''}</small>
          <span class="az-system-spacer"></span>
          <button class="az-button" type="button" data-bin-restore="${esc(node.id)}">Restore</button>
          <button class="az-button" type="button" data-bin-delete="${esc(node.id)}">Delete</button>
        </div>`).join('')
      : '<div class="az-empty-state"><div><h3>Recycle Bin is empty</h3><p>Items deleted from Workspace files land here first.</p></div></div>';
  }

  const click = async (event) => {
    if (event.target.closest('[data-bin-refresh]')) return refresh();
    if (event.target.closest('[data-bin-empty]')) {
      if (!window.confirm('Permanently delete everything in the Recycle Bin?')) return;
      await fs.emptyRecycleBin();
      api.playSound('trash');
      api.notify('Recycle Bin', 'All items permanently deleted.', 'system');
      return refresh();
    }
    const restoreId = event.target.closest('[data-bin-restore]')?.dataset.binRestore;
    if (restoreId) {
      await fs.restoreNode(restoreId);
      api.playSound('notification');
      return refresh();
    }
    const deleteId = event.target.closest('[data-bin-delete]')?.dataset.binDelete;
    if (deleteId) {
      await fs.deleteNode(deleteId);
      api.playSound('trash');
      return refresh();
    }
  };
  container.addEventListener('click', (event) => { click(event).catch((error) => api.notify('Recycle Bin', error.message, 'error')); });

  await refresh();
  return () => {};
}
