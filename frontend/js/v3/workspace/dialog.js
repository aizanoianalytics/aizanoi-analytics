/** AizanoiOS application dialogs — modal, focus-safe and shell-consistent. */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

function focusables(root) {
  return [...root.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')]
    .filter((node) => !node.hidden && getComputedStyle(node).display !== 'none');
}

function mountModal({ title, message, kind = 'info', body, initialFocus, onReady }) {
  const id = `az-app-dialog-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const root = document.getElementById('az-root');
  const previousRootInert = Boolean(root?.inert);
  const overlay = document.createElement('div');
  overlay.className = 'az-overlay is-open';
  overlay.dataset.azAppDialog = '';
  overlay.innerHTML = `<section class="az-dialog az-window-menu-dialog" role="${kind === 'error' ? 'alertdialog' : 'dialog'}" aria-modal="true" aria-labelledby="${id}-title" aria-describedby="${id}-message">
    <header class="az-dialog-header"><strong id="${id}-title">${esc(title)}</strong><span class="az-system-spacer"></span><button class="az-icon-button" type="button" data-app-dialog-close aria-label="Close">×</button></header>
    <div class="az-dialog-body"><p id="${id}-message" class="az-app-dialog-message">${esc(message)}</p>${body}</div>
  </section>`;

  if (root) root.inert = true;
  document.body.appendChild(overlay);
  let settled = false;
  let settleValue = null;
  let resolver = null;

  const cleanup = () => {
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
    if (root) root.inert = previousRootInert;
    if (opener?.isConnected) opener.focus({ preventScroll:true });
  };
  const settle = (value) => {
    if (settled) return;
    settled = true;
    settleValue = value;
    cleanup();
    resolver?.(value);
  };
  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); settle(null); return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables(overlay); if (!items.length) return;
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey, true);
  overlay.querySelector('[data-app-dialog-close]').addEventListener('click', () => settle(null));
  overlay.addEventListener('click', (event) => { if (event.target === overlay) settle(null); });
  onReady?.({ overlay, settle });
  setTimeout(() => (initialFocus?.(overlay) || focusables(overlay)[0])?.focus(), 0);

  return new Promise((resolve) => {
    resolver = resolve;
    if (settled) resolve(settleValue);
  });
}

/** @returns Promise<'ok'|'secondary'|'cancel'> */
export function aizanoiDialog({ title = 'AizanoiOS', message = '', kind = 'info', confirmLabel = 'OK', secondaryLabel = null, cancelLabel = null }) {
  return mountModal({
    title, message, kind,
    body:`<div class="az-error-actions">
      ${cancelLabel ? `<button class="az-button" type="button" data-app-dialog-value="cancel">${esc(cancelLabel)}</button>` : ''}
      ${secondaryLabel ? `<button class="az-button" type="button" data-app-dialog-value="secondary">${esc(secondaryLabel)}</button>` : ''}
      <button class="az-button ${kind === 'danger' ? 'az-button-danger' : 'az-button-primary'}" type="button" data-app-dialog-value="ok">${esc(confirmLabel)}</button>
    </div>`,
    initialFocus:(overlay) => cancelLabel ? overlay.querySelector('[data-app-dialog-value="cancel"]') : overlay.querySelector('[data-app-dialog-value="ok"]'),
    onReady:({ overlay, settle }) => overlay.querySelectorAll('[data-app-dialog-value]').forEach((button) => button.addEventListener('click', () => settle(button.dataset.appDialogValue))),
  }).then((value) => value || 'cancel');
}

/** @returns Promise<string|null> */
export function aizanoiPrompt({ title = 'AizanoiOS', message = '', label = 'Name', defaultValue = '', confirmLabel = 'Save', cancelLabel = 'Cancel' }) {
  return mountModal({
    title, message, kind:'info',
    body:`<form data-app-prompt-form><label class="az-app-prompt-label">${esc(label)}<input class="az-app-prompt-input" data-app-prompt-input type="text" value="${esc(defaultValue)}" autocomplete="off"></label><div class="az-error-actions"><button class="az-button" type="button" data-app-prompt-cancel>${esc(cancelLabel)}</button><button class="az-button az-button-primary" type="submit" data-app-prompt-ok>${esc(confirmLabel)}</button></div></form>`,
    initialFocus:(overlay) => overlay.querySelector('[data-app-prompt-input]'),
    onReady:({ overlay, settle }) => {
      const input = overlay.querySelector('[data-app-prompt-input]');
      overlay.querySelector('[data-app-prompt-cancel]').addEventListener('click', () => settle(null));
      overlay.querySelector('[data-app-prompt-form]').addEventListener('submit', (event) => {
        event.preventDefault();
        const value = input.value.trim();
        if (value) settle(value); else input.focus();
      });
      setTimeout(() => input.select(), 0);
    },
  });
}

/** @deprecated compatibility alias for pre-AizanoiOS callers. */
export const win98Dialog = aizanoiDialog;
