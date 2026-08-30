function assertFunction(owner, name) {
  if (typeof owner?.[name] !== 'function') throw new Error(`Winamp requires capability method: ${name}`);
}

function validate(capabilities) {
  const { filesystem, notifications, sound } = capabilities || {};
  if (!filesystem?.musicId) throw new Error('Winamp requires filesystem.musicId');
  for (const name of ['readFileBlob', 'childrenOf', 'createFile']) assertFunction(filesystem, name);
  assertFunction(notifications, 'notify');
  assertFunction(sound, 'play');
  return capabilities;
}

/** Validate the capability surface injected by the canonical AizanoiOS shell. */
export function resolveWinampCapabilities({ capabilities = {} } = {}) {
  return validate(capabilities);
}
