/** Private Recycle Bin implementation. Shared services arrive only as capabilities. */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[c]));

export async function mountRecycleBin({ container, capabilities }) {
  const { filesystem, dialog, notifications, sound } = capabilities;
  container.innerHTML = `
  <div class="az-app-shell az-utility-shell az-recycle-shell">
  <div class="az-recycle">
    <div class="az-recycle-actions">
      <strong tabindex="-1" data-bin-title>Deleted Workspace items</strong>
      <button class="az-button" type="button" data-bin-refresh>Refresh</button>
      <button class="az-button" type="button" data-bin-empty disabled>Empty Recycle Bin</button>
      <span class="az-system-spacer"></span>
      <span class="az-camera-status" data-bin-count></span>
    </div>
    <p class="az-sr-only" role="status" data-bin-status></p>
    <div class="az-recycle-list" data-bin-list role="list"></div>
  </div></div>`;

  const listEl = container.querySelector('[data-bin-list]');
  const countEl = container.querySelector('[data-bin-count]');
  const emptyButton = container.querySelector('[data-bin-empty]');
  const statusEl = container.querySelector('[data-bin-status]');
  const titleEl = container.querySelector('[data-bin-title]');
  let closed = false;
  let refreshSeq = 0;

  async function refresh() {
    const seq = ++refreshSeq;
    const items = await filesystem.childrenOf(filesystem.recycleId);
    if (closed || seq !== refreshSeq) return;
    emptyButton.disabled = items.length === 0;
    countEl.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;
    listEl.innerHTML = items.length
      ? items.map((node) => `
        <div class="az-recycle-row" role="listitem">
          <span class="az-recycle-kind">${node.kind === 'folder' ? 'Folder' : 'File'}</span>
          <strong>${esc(node.name)}</strong>
          <small>${node.kind === 'file' ? filesystem.formatSize(node.size) : `${(node.children || []).length} items`} · deleted ${node.updatedAt ? new Date(node.updatedAt).toLocaleDateString('en-GB') : ''}</small>
          <span class="az-system-spacer"></span>
          <button class="az-button" type="button" data-bin-restore="${esc(node.id)}" aria-label="Restore ${esc(node.name)}">Restore</button>
          <button class="az-button" type="button" data-bin-delete="${esc(node.id)}" aria-label="Permanently delete ${esc(node.name)}">Delete</button>
        </div>`).join('')
      : '<div class="az-empty-state" role="listitem"><div><h3>Recycle Bin is empty</h3><p>Items you move to the Recycle Bin from Workspace land here first, so you can restore them.</p></div></div>';
  }

  /** After a mutation, keep keyboard focus on the next logical row (or the heading when none is left). */
  function focusSuccessor(attr, index) {
    if (closed) return;
    const buttons = [...listEl.querySelectorAll(`[${attr}]`)];
    const target = buttons[Math.min(index, buttons.length - 1)] || (listEl.querySelector('[data-bin-restore]') || titleEl);
    target?.focus({ preventScroll: true });
  }
  const announce = (text) => { statusEl.textContent = ''; setTimeout(() => { if (!closed) statusEl.textContent = text; }, 30); };

  async function handleAction(event) {
    if (event.target.closest('[data-bin-refresh]')) return refresh();
    if (event.target.closest('[data-bin-empty]')) {
      const choice = await dialog.confirm({
        title: 'Recycle Bin',
        message: 'This permanently deletes every item in the Recycle Bin. It cannot be undone.',
        kind: 'danger',
        confirmLabel: 'Delete everything',
        cancelLabel: 'Cancel',
      });
      if (choice !== 'ok') return;
      await filesystem.emptyRecycleBin();
      sound.play('trash');
      notifications.notify('Recycle Bin', 'All items permanently deleted.', 'system');
      await refresh();
      announce('Recycle Bin emptied.');
      titleEl.focus({ preventScroll: true });
      return;
    }
    const restoreId = event.target.closest('[data-bin-restore]')?.dataset.binRestore;
    if (restoreId) {
      const node = await filesystem.getNode(restoreId);
      const index = [...listEl.querySelectorAll('[data-bin-restore]')].findIndex((b) => b.dataset.binRestore === restoreId);
      await filesystem.restoreNode(restoreId);
      sound.play('notification');
      await refresh();
      announce(`${node?.name || 'Item'} restored to Workspace.`);
      return focusSuccessor('data-bin-restore', index);
    }
    const deleteId = event.target.closest('[data-bin-delete]')?.dataset.binDelete;
    if (deleteId) {
      const node = await filesystem.getNode(deleteId);
      const choice = await dialog.confirm({
        title: 'Recycle Bin',
        message: `This permanently deletes "${node?.name || 'this item'}". It cannot be undone.`,
        kind: 'danger',
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
      });
      if (choice !== 'ok') return;
      const index = [...listEl.querySelectorAll('[data-bin-delete]')].findIndex((b) => b.dataset.binDelete === deleteId);
      await filesystem.deleteNode(deleteId);
      sound.play('trash');
      await refresh();
      announce(`${node?.name || 'Item'} permanently deleted.`);
      return focusSuccessor('data-bin-delete', index);
    }
  }

  const handleClick = (event) => {
    handleAction(event).catch((error) => notifications.notify('Recycle Bin', error.message, 'error'));
  };

  container.addEventListener('click', handleClick);
  await refresh();

  return {
    cleanup() {
      closed = true;
      container.removeEventListener('click', handleClick);
    },
  };
}
