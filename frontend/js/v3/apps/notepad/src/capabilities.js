function assertFunction(owner, name) {
  if (typeof owner?.[name] !== 'function') {
    throw new Error(`Notepad requires capability method: ${name}`);
  }
}

function validate(capabilities) {
  const { filesystem, dialog, notifications, sound } = capabilities || {};
  if (!filesystem?.documentsId) throw new Error('Notepad requires filesystem.documentsId');
  for (const name of ['getNode', 'readFileBlob', 'childrenOf', 'createFile', 'updateFileContent', 'formatSize']) {
    assertFunction(filesystem, name);
  }
  assertFunction(dialog, 'confirm');
  assertFunction(notifications, 'notify');
  assertFunction(sound, 'play');
  return capabilities;
}

/** Validate the capability surface injected by the canonical AizanoiOS shell. */
export function resolveNotepadCapabilities({ capabilities = {} } = {}) {
  return validate(capabilities);
}
