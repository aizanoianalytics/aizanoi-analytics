function assertFunction(owner, name) {
  if (typeof owner?.[name] !== 'function') throw new Error(`Camera requires capability method: ${name}`);
}

function validate(capabilities) {
  const { filesystem, media, notifications, sound } = capabilities || {};
  if (!filesystem?.picturesId) throw new Error('Camera requires filesystem.picturesId');
  for (const name of ['childrenOf', 'readFileBlob', 'createFile', 'getNode']) assertFunction(filesystem, name);
  assertFunction(media, 'isAvailable');
  assertFunction(media, 'getUserMedia');
  assertFunction(notifications, 'notify');
  assertFunction(sound, 'play');
  return capabilities;
}

/** Validate the capability surface injected by the canonical AizanoiOS shell. */
export function resolveCameraCapabilities({ capabilities = {} } = {}) {
  return validate(capabilities);
}
