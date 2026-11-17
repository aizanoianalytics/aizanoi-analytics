// The apartment runs in its own same-origin browsing context.
// Removing the iframe on close tears down its WebGL loop and listeners.
export async function mount({ container }) {
  container.replaceChildren();
  const root = document.createElement('div');
  root.className = 'az-daire-app';
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/js/v3/apps/daire/src/app.css';
  const frame = document.createElement('iframe');
  frame.src = '/arcade/daire/';
  frame.title = 'Ev';
  frame.allow = 'fullscreen; autoplay';
  frame.setAttribute('allowfullscreen', '');
  const footer = document.createElement('a');
  footer.href = '/arcade/daire/';
  footer.target = '_blank';
  footer.rel = 'noopener noreferrer';
  footer.textContent = 'Evi tam ekran aç ↗';
  frame.addEventListener('load', () => { try { frame.focus(); } catch {} });
  root.append(frame, footer);
  container.append(root);
  container.prepend(link);
  return () => { frame.remove(); root.remove(); link.remove(); };
}
