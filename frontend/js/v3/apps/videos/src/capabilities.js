function assertFunction(owner, name) {
  if (typeof owner?.[name] !== 'function') throw new Error(`Aizanoi TV requires capability method: ${name}`);
}

/** Validate the capability surface injected by the canonical AizanoiOS shell. */
export function resolveVideoCapabilities({ capabilities = {} } = {}) {
  assertFunction(capabilities.apps, 'open');
  return capabilities;
}
