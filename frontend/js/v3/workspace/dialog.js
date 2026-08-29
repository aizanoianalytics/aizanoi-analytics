/** AizanoiOS Win98-style error dialog — reusable replacement for window.alert in app flows. */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

/**
 * Show a modal Win98-style dialog.
 * @returns Promise<'ok'|'cancel'> resolved when dismissed.
 */
export function win98Dialog({ title = 'AizanoiOS', message = '', kind = 'error', confirmLabel = 'OK', cancelLabel = null }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'az-w98-overlay';
    overlay.innerHTML = `
      <div class="az-w98-dialog" role="alertdialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="az-w98-titlebar"><span>${esc(title)}</span><button class="az-w98-x" type="button" aria-label="Close">×</button></div>
        <div class="az-w98-body">
          <span class="az-w98-icon az-w98-icon--${esc(kind)}" aria-hidden="true">${kind === 'error' ? '✖' : kind === 'warn' ? '⚠️' : 'ℹ️'}</span>
          <p>${esc(message)}</p>
        </div>
        <div class="az-w98-actions">
          ${cancelLabel ? `<button class="az-button" type="button" data-w98-cancel>${esc(cancelLabel)}</button>` : ''}
          <button class="az-button" type="button" data-w98-ok>${esc(confirmLabel)}</button>
        </div>
      </div>`;
    const done = (value) => { overlay.remove(); document.removeEventListener('keydown', onKey, true); resolve(value); };
    const onKey = (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); done('cancel'); }
      if (event.key === 'Enter') { event.stopPropagation(); done('ok'); }
    };
    overlay.querySelector('[data-w98-ok]').addEventListener('click', () => done('ok'));
    const cancelBtn = overlay.querySelector('[data-w98-cancel]');
    if (cancelBtn) cancelBtn.addEventListener('click', () => done('cancel'));
    overlay.querySelector('.az-w98-x').addEventListener('click', () => done('cancel'));
    overlay.addEventListener('click', (event) => { if (event.target === overlay) done('cancel'); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    overlay.querySelector('[data-w98-ok]').focus();
  });
}
