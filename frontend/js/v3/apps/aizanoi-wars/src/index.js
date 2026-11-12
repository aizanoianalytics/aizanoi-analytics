// The self-contained game runs in its own same-origin browsing context.
// Removing the iframe on close tears down its WebGL loop, audio and listeners.
export async function mount({ container }) {
  container.replaceChildren();
  const root = document.createElement('div');
  root.className = 'az-wars-app';
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/js/v3/apps/aizanoi-wars/src/app.css';
  const frame = document.createElement('iframe');
  frame.src = '/arcade/aizanoi-wars/';
  frame.title = 'Aizanoi Wars game';
  frame.allow = 'fullscreen; autoplay';
  frame.setAttribute('allowfullscreen', '');
  const footer = document.createElement('a');
  footer.href = '/arcade/aizanoi-wars/';
  footer.target = '_blank';
  footer.rel = 'noopener noreferrer';
  footer.textContent = 'Play Aizanoi Wars full screen ↗';
  root.append(frame, footer);
  container.append(root);
  container.prepend(link);
  return () => { frame.remove(); root.remove(); link.remove(); };
}
