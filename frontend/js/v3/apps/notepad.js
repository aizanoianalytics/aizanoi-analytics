/** AizanoiOS Notepad — text editor that saves plain-text documents into the Workspace VFS. */

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

export async function mount({ container, api, options }) {
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

  const fs = await import('/js/v3/workspace/fs.js');

  function renderTitle() {
    titleEl.textContent = `${dirty ? '*' : ''}${fileName} — Notepad`;
    statusEl.textContent = dirty ? 'Unsaved changes' : `Saved · ${new Date().toLocaleTimeString('en-GB')}`;
  }

  async function loadFile(id) {
    const node = await fs.getNode(id);
    if (!node || node.kind !== 'file') return;
    fileId = node.id;
    fileName = node.name;
    const blob = await fs.readFileBlob(id);
    textEl.value = blob ? await blob.text() : '';
    dirty = false;
    renderTitle();
  }

  async function refreshList() {
    const children = await fs.childrenOf(fs.DOCUMENTS_ID);
    const docs = children.filter((node) => node.kind === 'file' && (!node.mime || node.mime.startsWith('text/') || node.mime === 'application/json'));
    itemsEl.innerHTML = docs.length
      ? docs.map((node) => `<button class="az-button az-notepad-file" type="button" data-note-open="${esc(node.id)}">${esc(node.name)} <small>${fs.formatSize(node.size)}</small></button>`).join('')
      : '<p class="az-notepad-empty">No text documents yet. Save the current one first.</p>';
  }

  async function save(asNew) {
    const name = asNew || !fileId ? (window.prompt('Document name:', fileName) || '').trim() : fileName;
    if (!name) return;
    const blob = new Blob([textEl.value], { type: 'text/plain' });
    if (fileId && !asNew) {
      const node = await fs.getNode(fileId);
      if (node) { fileName = node.name = name; await fs.updateFileContent(fileId, blob); }
    } else {
      const node = await fs.createFile({ name, parent: fs.DOCUMENTS_ID, blob, mime: 'text/plain' });
      fileId = node.id;
      fileName = node.name;
    }
    dirty = false;
    api.playSound('notification');
    api.notify('Notepad', `${fileName} saved to Workspace Documents.`, 'system');
    renderTitle();
  }

  textEl.addEventListener('input', () => { dirty = true; renderTitle(); });

  const click = async (event) => {
    const action = event.target.closest('[data-note-action]')?.dataset.noteAction;
    const openId = event.target.closest('[data-note-open]')?.dataset.noteOpen;
    if (openId) { await loadFile(openId); listEl.hidden = true; return; }
    if (event.target.closest('[data-note-close-list]')) { listEl.hidden = true; return; }
    if (!action) return;
    api.playSound('click');
    if (action === 'save') await save(false);
    else if (action === 'saveas') await save(true);
    else if (action === 'open') { await refreshList(); listEl.hidden = false; }
    else if (action === 'download') {
      const url = URL.createObjectURL(new Blob([textEl.value], { type: 'text/plain' }));
      const link = document.createElement('a');
      link.href = url; link.download = fileName.endsWith('.txt') ? fileName : `${fileName}.txt`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };
  container.addEventListener('click', (event) => { click(event).catch((error) => api.notify('Notepad', error.message, 'error')); });

  if (fileId) await loadFile(fileId);
  renderTitle();
  textEl.focus();
  return () => {};
}
