function assertFunction(owner, name) {
  if (typeof owner?.[name] !== 'function') throw new Error(`Historical Worlds requires capability method: ${name}`);
}

/** Validate and narrow the capability surface injected by the canonical shell. */
export function resolveWorldCapabilities({ capabilities = {} } = {}) {
  const worlds = capabilities.worlds;
  for (const name of ['list', 'currentSession', 'launch']) assertFunction(worlds, name);
  return Object.freeze({ worlds });
}
