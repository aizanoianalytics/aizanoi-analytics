/**
 * Aizanoi — flagship interactive historical reconstruction.
 * Opens the canonical runtime at /worlds/aizanoi-225/.
 *
 * AizanoiOS module contract: mount({ container }) navigates to the canonical
 * Aizanoi runtime. The world is a full standalone WebGL experience, not an
 * in-window widget, so mount performs a route navigation.
 */
export async function mount({ container } = {}) {
  // Clear any shell loading placeholder before navigating.
  if (container) container.replaceChildren();
  window.location.href = '/worlds/aizanoi-225/';
}

export default mount;
