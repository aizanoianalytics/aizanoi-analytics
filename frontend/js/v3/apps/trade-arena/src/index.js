// One shared stylesheet link for all open Trade Arena windows; removed with the last one.
let styleUsers = 0;
function acquireStyles() {
  let link = document.head.querySelector('link[data-az-trade-arena-css]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = '/js/v3/apps/trade-arena/src/app.css';
    link.dataset.azTradeArenaCss = '';
    document.head.append(link);
  }
  styleUsers++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--styleUsers <= 0) { styleUsers = 0; document.head.querySelector('link[data-az-trade-arena-css]')?.remove(); }
  };
}

export async function mount({ container }) {
  const release = acquireStyles();
  const root = document.createElement('section'); root.className = 'ta-shell';
  const head = document.createElement('header'); head.className = 'ta-shell-head';
  const copy = document.createElement('div');
  const title = document.createElement('h2'); title.textContent = 'AI Trade Arena';
  const note = document.createElement('p'); note.textContent = 'Historical paper-trading simulation. No real money, no live markets.';
  copy.append(title, note);
  const link = document.createElement('a'); link.href = '/arcade/trade-arena/'; link.className = 'az-button';
  link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Open full Trade Arena ↗';
  head.append(copy, link);
  const status = document.createElement('p'); status.className = 'ta-shell-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-busy', 'true');
  status.textContent = 'Loading arena…';
  const frame = document.createElement('iframe');
  frame.title = 'AI Trade Arena'; frame.className = 'ta-shell-frame';
  frame.referrerPolicy = 'same-origin';
  const onLoad = () => { status.hidden = true; status.setAttribute('aria-busy', 'false'); };
  frame.addEventListener('load', onLoad, { once: true });
  frame.src = '/arcade/trade-arena/';
  root.append(head, status, frame); container.replaceChildren(root);
  return () => { frame.removeEventListener('load', onLoad); frame.src = 'about:blank'; frame.remove(); root.remove(); release(); };
}
