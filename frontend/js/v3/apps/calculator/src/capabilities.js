function assertFunction(owner, name) {
  if (typeof owner?.[name] !== 'function') throw new Error(`Calculator requires capability method: ${name}`);
}

/** Validate the capability surface injected by the canonical AizanoiOS shell. */
export function resolveCalculatorCapabilities({ capabilities = {} } = {}) {
  assertFunction(capabilities.sound, 'play');
  return capabilities;
}
