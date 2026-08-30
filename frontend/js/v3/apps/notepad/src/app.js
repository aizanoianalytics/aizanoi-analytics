/** Private Notepad implementation. Shared services arrive only as capabilities. */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[c]));

export async function mountNotepad({ container, options, capabilities }) {
  const { filesystem, dialog, notifications, sound } = capabilities;
  let fileId = options?.fileId || null;
  let fileName = fileId ? '' : 'Untitled.txt';
  let dirty = false;

  container.innerHTML = `
  <div class="az-app-shell"><div class="az-app-toolbar"><strong data-notepad-title>Notepad</strong><span class="az-system-spacer"></span><span class="az-app-caption">Text documents · saved to Workspace</span></div>
  <div class="az-notepad">
    <div class="az-notepad-menu" role="toolbar" aria-label="Notepad actions">
      <button class="az-button" type="button" data-note-action="open">Open…</button>
      <button class="az-button" type="button" data-note-action="save">Save</button>
      <button class="az-button" type="button" data-note-action="saveas">Save as…</button>
      <button class="az-button" type="button" data-note-action="download">Download</button>
      <span class="az-system-spacer"></span>
      <span class="az-notepad-status" data-note-status>New document</span>
    </div>
    <textarea class="az-notepad-text" data-note-text spellcheck="false" aria-label="Text editor"></textarea>
    <div class="az-notepad-files" data-note-list hidden>
      <div class="az-notepad-files-head"><strong>Open document</strong><button class="az-button" type="button" data-note-close-list>Close</button></div>
      <div data-note-items></div>
    </div>
  </div></div>`;

  const titleEl = container.querySelector('[data-notepad-title]');
  const statusEl = container.querySelector('[data-note-status]');
  const textEl = container.querySelector('[data-note-text]');
  const listEl = container.querySelector('[data-note-list]');
  const itemsEl = container.querySelector('[data-note-items]');

  function renderTitle() {
    titleEl.textContent = `${dirty ? '*' : ''}${fileName} — Notepad`;
    statusEl.textContent = dirty ? 'Unsaved changes' : `Saved · ${new Date().toLocaleTimeString('en-GB')}`;
  }

  async function confirmDiscard() {
    if (!dirty) return true;
    const choice = await dialog.confirm({
      title: 'Notepad',
      message: `Do you want to save changes to ${fileName}?`,
      kind: 'warn',
      confirmLabel: 'Save',
      cancelLabel: 'Discard',
    });
    if (choice === 'ok') {
      await save(false);
      return !dirty;
    }
    return window.confirm('Discard unsaved changes?');
  }

  async function loadFile(id) {
    if (!(await confirmDiscard())) return false;
    const node = await filesystem.getNode(id);
    if (!node || node.kind !== 'file') return false;
    fileId = node.id;
    fileName = node.name;
    const blob = await filesystem.readFileBlob(id);
    textEl.value = blob ? await blob.text() : '';
    dirty = false;
    renderTitle();
    return true;
  }

  async function refreshList() {
    const children = await filesystem.childrenOf(filesystem.documentsId);
    const docs = children.filter((node) => node.kind === 'file' && (
      !node.mime || node.mime.startsWith('text/') || node.mime === 'application/json'
    ));
    itemsEl.innerHTML = docs.length
      ? docs.map((node) => `<button class="az-button az-notepad-file" type="button" data-note-open="${esc(node.id)}">${esc(node.name)} <small>${filesystem.formatSize(node.size)}</small></button>`).join('')
      : '<p class="az-notepad-empty">No text documents yet. Save the current one first.</p>';
  }

  async function save(asNew) {
    const name = asNew || !fileId ? (window.prompt('Document name:', fileName) || '').trim() : fileName;
    if (!name) return;
    const blob = new Blob([textEl.value], { type: 'text/plain' });
    if (fileId && !asNew) {
      const node = await filesystem.getNode(fileId);
      if (node) {
        fileName = node.name = name;
        await filesystem.updateFileContent(fileId, blob);
      }
    } else {
      const node = await filesystem.createFile({
        name,
        parent: filesystem.documentsId,
        blob,
        mime: 'text/plain',
      });
      fileId = node.id;
      fileName = node.name;
    }
    dirty = false;
    sound.play('notification');
    notifications.notify('Notepad', `${fileName} saved to Workspace Documents.`, 'system');
    renderTitle();
  }

  const handleInput = () => {
    dirty = true;
    renderTitle();
  };

  const handleClick = async (event) => {
    const openId = event.target.closest('[data-note-open]')?.dataset.noteOpen;
    if (openId) {
      await loadFile(openId).catch((error) => notifications.notify('Notepad', error.message, 'error'));
      listEl.hidden = true;
      return;
    }
    if (event.target.closest('[data-note-close-list]')) {
      listEl.hidden = true;
      return;
    }
    const action = event.target.closest('[data-note-action]')?.dataset.noteAction;
    if (!action) return;
    sound.play('click');
    try {
      if (action === 'save') await save(false);
      else if (action === 'saveas') await save(true);
      else if (action === 'open') {
        await refreshList();
        listEl.hidden = false;
      } else if (action === 'download') {
        const url = URL.createObjectURL(new Blob([textEl.value], { type: 'text/plain' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName.endsWith('.txt') ? fileName : `${fileName}.txt`;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      notifications.notify('Notepad', error.message, 'error');
    }
  };

  textEl.addEventListener('input', handleInput);
  container.addEventListener('click', handleClick);

  function onOpen(newOptions) {
    const id = newOptions?.fileId;
    if (id && id !== fileId) {
      loadFile(id).catch((error) => notifications.notify('Notepad', error.message, 'error'));
    }
  }

  function beforeClose() {
    if (!dirty) return true;
    return window.confirm(`${fileName} has unsaved changes. Close anyway?`);
  }

  if (fileId) await loadFile(fileId);
  renderTitle();
  textEl.focus();

  return {
    cleanup() {
      textEl.removeEventListener('input', handleInput);
      container.removeEventListener('click', handleClick);
    },
    onOpen,
    beforeClose,
  };
}
