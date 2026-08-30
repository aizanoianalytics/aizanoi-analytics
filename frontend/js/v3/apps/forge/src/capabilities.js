function assertFunction(owner, name) {
  if (typeof owner?.[name] !== 'function') throw new Error(`Aizanoi Forge requires capability method: ${name}`);
}

export function resolveForgeCapabilities({ capabilities = {} } = {}) {
  assertFunction(capabilities.apps, 'open');
  return capabilities;
}
