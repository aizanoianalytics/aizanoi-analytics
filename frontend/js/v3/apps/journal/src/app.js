const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

function shell(title, caption, body) {
  return `<div class="az-app-shell"><div class="az-app-toolbar"><strong>${esc(title)}</strong><span class="az-system-spacer"></span><span class="az-app-caption">${esc(caption)}</span></div>${body}</div>`;
}

export function mountJournal(container) {
  container.innerHTML = shell(
    'Aizanoi Journal',
    'Analysis, essays & commentary',
    '<div class="az-empty-state"><div><h3>Journal desk is ready</h3><p>Long-form AI, technology, markets, cinema, football and research writing will live here. News reports what happened; Journal explains what it means.</p></div></div>',
  );
  return () => {};
}
