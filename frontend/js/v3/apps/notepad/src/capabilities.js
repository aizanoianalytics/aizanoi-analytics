function assertFunction(owner, name) {
  if (typeof owner?.[name] !== 'function') {
    throw new Error(`Notepad requires capability method: ${name}`);
  }
}

function validate(capabilities) {
  const { filesystem, dialog, notifications, sound } = capabilities;
  if (!filesystem?.documentsId) throw new Error('Notepad requires filesystem.documentsId');
  for (const name of ['getNode', 'readFileBlob', 'childrenOf', 'createFile', 'updateFileContent', 'formatSize']) {
    assertFunction(filesystem, name);
  }
  assertFunction(dialog, 'confirm');
  assertFunction(notifications, 'notify');
  assertFunction(sound, 'play');
  return capabilities;
}

async function currentSharedCapabilities() {
  const [fs, dialogs] = await Promise.all([
    import('../../../workspace/fs.js'),
    import('../../../workspace/dialog.js'),
  ]);

  return {
    filesystem: Object.freeze({
      documentsId: fs.DOCUMENTS_ID,
      getNode: fs.getNode,
      readFileBlob: fs.readFileBlob,
      childrenOf: fs.childrenOf,
      createFile: fs.createFile,
      updateFileContent: fs.updateFileContent,
      formatSize: fs.formatSize,
    }),
    dialog: Object.freeze({
      confirm: dialogs.win98Dialog,
    }),
  };
}

/**
 * Resolve the capability surface consumed by private Notepad code.
 *
 * The canonical shell can inject capabilities in the future without changing
 * Notepad internals. Until then this adapter is the only Notepad file allowed
 * to know the concrete Workspace filesystem/dialog implementation paths.
 */
export async function resolveNotepadCapabilities({ api, capabilities = {} } = {}) {
  let filesystem = capabilities.filesystem;
  let dialog = capabilities.dialog;

  if (!filesystem || !dialog) {
    const shared = await currentSharedCapabilities();
    filesystem ||= shared.filesystem;
    dialog ||= shared.dialog;
  }

  const notifications = capabilities.notifications || (typeof api?.notify === 'function'
    ? Object.freeze({ notify: (...args) => api.notify(...args) })
    : null);
  const sound = capabilities.sound || (typeof api?.playSound === 'function'
    ? Object.freeze({ play: (...args) => api.playSound(...args) })
    : null);

  return validate(Object.freeze({ filesystem, dialog, notifications, sound }));
}
