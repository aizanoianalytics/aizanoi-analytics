/** AizanoiOS application dialog — modal, focus-safe and shell-consistent. */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

function focusables(root) {
  return [...root.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')]
    .filter((node) => !node.hidden && getComputedStyle(node).display !== 'none');
}

/**
 * Show a canonical AizanoiOS confirmation dialog.
 *
 * The legacy export name is kept temporarily so existing capability wiring does
 * not break while callers migrate. Enter is deliberately left to the focused
 * control instead of being globally promoted to confirmation.
 * @returns Promise<'ok'|'cancel'> resolved when dismissed.
 */
export function win98Dialog({ title = 'AizanoiOS', message = '', kind = 'info', confirmLabel = 'OK', cancelLabel = null }) {
  return new Promise((resolve) => {
    const dialogId = `az-app-dialog-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.getElementById('az-root');
    const previousRootInert = Boolean(root?.inert);
    const overlay = document.createElement('div');
    overlay.className = 'az-overlay is-open';
    overlay.dataset.azAppDialog = '';
    overlay.innerHTML = `
      <section class="az-dialog az-window-menu-dialog" role="${kind === 'error' ? 'alertdialog' : 'dialog'}" aria-modal="true" aria-labelledby="${dialogId}-title" aria-describedby="${dialogId}-message">
        <header class="az-dialog-header">
          <strong id="${dialogId}-title">${esc(title)}</strong>
          <span class="az-system-spacer"></span>
          <button class="az-icon-button" type="button" data-app-dialog-cancel aria-label="Close">×</button>
        </header>
        <div class="az-dialog-body">
          <p id="${dialogId}-message">${esc(message)}</p>
          <div class="az-error-actions">
            ${cancelLabel ? `<button class="az-button" type="button" data-app-dialog-cancel>${esc(cancelLabel)}</button>` : ''}
            <button class="az-button ${kind === 'danger' ? 'az-button-danger' : 'az-button-primary'}" type="button" data-app-dialog-ok>${esc(confirmLabel)}</button>
          </div>
        </div>
      </section>`;

    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (root) root.inert = previousRootInert;
      if (opener?.isConnected) opener.focus({ preventScroll:true });
      resolve(value);
    };

    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        done('cancel');
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables(overlay);
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    overlay.querySelector('[data-app-dialog-ok]').addEventListener('click', () => done('ok'));
    overlay.querySelectorAll('[data-app-dialog-cancel]').forEach((button) => button.addEventListener('click', () => done('cancel')));
    overlay.addEventListener('click', (event) => { if (event.target === overlay) done('cancel'); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    if (root) root.inert = true;

    const safeDefault = cancelLabel
      ? overlay.querySelector('[data-app-dialog-cancel]:not(.az-icon-button)')
      : overlay.querySelector('[data-app-dialog-ok]');
    setTimeout(() => safeDefault?.focus(), 0);
  });
}
