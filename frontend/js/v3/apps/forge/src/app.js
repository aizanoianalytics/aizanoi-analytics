const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

function shell(title, caption, body) {
  return `<div class="az-app-shell"><div class="az-app-toolbar"><strong>${esc(title)}</strong><span class="az-system-spacer"></span><span class="az-app-caption">${esc(caption)}</span></div>${body}</div>`;
}

function cards(items) {
  return `<div class="az-simple-grid">${items.map((item) => `<article class="az-simple-card"><p class="az-kicker">${esc(item.kicker || 'AIZANOI ANALYTICS')}</p><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p>${item.button ? `<button class="az-button" type="button" data-open-app="${esc(item.button)}">${esc(item.buttonLabel || 'Open')}</button>` : ''}${item.href ? `<a class="az-button" href="${esc(item.href)}" target="_blank" rel="noopener noreferrer">${esc(item.hrefLabel || 'Open link')}</a>` : ''}</article>`).join('')}</div>`;
}

export function createForgeApp({ apps }) {
  return {
    async mount(container) {
      container.innerHTML = shell('Aizanoi Forge', 'Source, builds & open projects', cards([
        { kicker:'SOURCE OF TRUTH', title:'aizanoianalytics/aizanoi-analytics', body:'GitHub remains canonical. Forge is the branded project catalog and mirror layer, not a second independent copy of source code.', href:'https://github.com/aizanoianalytics/aizanoi-analytics', hrefLabel:'Open GitHub' },
        { kicker:'PROJECT', title:'AizanoiOS', body:'Browser-native adaptive shell for Aizanoi Analytics media, data products, Historical Worlds and experiments.' },
        { kicker:'PROJECT', title:'Historical Worlds', body:'Shared runtime and city-local reconstructions for Aizanoi, Rome and Athens.', button:'worlds', buttonLabel:'Open Worlds' },
      ]));

      function handleClick(event) {
        const appId = event.target.closest('[data-open-app]')?.dataset.openApp;
        if (appId) apps.open(appId);
      }

      container.addEventListener('click', handleClick);
      return () => container.removeEventListener('click', handleClick);
    },
  };
}
