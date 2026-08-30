function assertFunction(owner, name) {
  if (typeof owner?.[name] !== 'function') throw new Error(`Aizanoi Labs requires capability method: ${name}`);
}

export function resolveLabsCapabilities({ capabilities = {} } = {}) {
  assertFunction(capabilities.apps, 'open');
  return capabilities;
}
