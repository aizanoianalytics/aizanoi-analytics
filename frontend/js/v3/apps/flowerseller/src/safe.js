// Tiny HTML/SVG escape helpers + safe DOM helpers.
// Everything user-supplied is treated as untrusted. Templates interpolate via `esc()` and `attrEsc()`.

const ESC = { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

export function attrEsc(value) {
  // Same chars need escaping in attributes — but `value` may contain embedded " characters.
  return esc(value);
}

export function urlAttr(value) {
  const s = String(value ?? '');
  if (typeof s !== 'string') return '';
  // Block javascript:/data:/vbscript: schemes — never trust user input as a URL.
  if (/^\s*(javascript|data|vbscript):/i.test(s)) return '';
  return esc(s);
}

// Build a DOM element with strict text + attribute children, no innerHTML for user input.
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value ?? '');
    else if (key === 'dataset' && value && typeof value === 'object') {
      for (const [dk, dv] of Object.entries(value)) {
        if (dv == null) continue;
        node.dataset[dk] = String(dv);
      }
    }
    else if (key.startsWith('aria-') || key === 'role') {
      node.setAttribute(key, String(value));
    }
    else node.setAttribute(key, String(value));
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    if (typeof child === 'string') node.appendChild(document.createTextNode(child));
    else node.appendChild(child);
  }
  return node;
}

// Render a fragment from a pure-data spec. Only the structural skeleton is HTML; every text or
// attribute value is escaped first via `esc` so user-supplied strings cannot become markup.
export function renderHTML(template, data) {
  const escaped = {};
  for (const [key, value] of Object.entries(data)) {
    if (value == null) { escaped[key] = ''; continue; }
    if (key === 'image' || key === 'src') escaped[key] = urlAttr(value);
    else escaped[key] = esc(value);
  }
  return template(escaped);
}
