// The self-contained 3D space runs in its own same-origin browsing context.
// Removing the iframe on close tears down its WebGL loop, audio and listeners.
export async function mount({ container }) {
  container.replaceChildren();
  const root = document.createElement('div');
  root.className = 'az-factory-app';
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/js/v3/apps/factory/src/app.css';
  const frame = document.createElement('iframe');
  frame.src = '/arcade/factory/';
  frame.title = 'Aizanoi Factory 3D space';
  frame.allow = 'fullscreen; autoplay';
  frame.setAttribute('allowfullscreen', '');
  const footer = document.createElement('a');
  footer.href = '/arcade/factory/';
  footer.target = '_blank';
  footer.rel = 'noopener noreferrer';
  footer.textContent = 'Open Aizanoi Factory full screen ↗';
  frame.addEventListener('load', () => { try { frame.focus(); } catch {} });
  root.append(frame, footer);
  container.append(root);
  container.prepend(link);
  return () => { frame.remove(); root.remove(); link.remove(); };
}
