export async function mount({ container }) {
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = '/js/v3/apps/trade-arena/src/app.css';
  document.head.append(css);
  const root = document.createElement('section'); root.className = 'ta-shell';
  const link = document.createElement('a'); link.href = '/arcade/trade-arena/';
  link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Open full Trade Arena ↗';
  const frame = document.createElement('iframe'); frame.src = '/arcade/trade-arena/';
  frame.title = 'AI Trade Arena'; frame.className = 'ta-shell-frame';
  frame.referrerPolicy = 'same-origin';
  root.append(link, frame); container.replaceChildren(root);
  return () => { frame.src = 'about:blank'; frame.remove(); root.remove(); css.remove(); };
}
