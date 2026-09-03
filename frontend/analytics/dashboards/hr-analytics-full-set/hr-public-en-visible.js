(() => {
  'use strict';

  const SELECTOR = 'pre,code';

  function translator() {
    return globalThis.AizanoiHrEnglish?.translate;
  }

  function translateTextNode(node) {
    if (node.nodeType !== Node.TEXT_NODE) return;
    const translate = translator();
    if (typeof translate !== 'function') return;
    const next = translate(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
  }

  function translateSurface(root) {
    if (!(root instanceof Element)) return;
    const surfaces = root.matches(SELECTOR)
      ? [root]
      : [...root.querySelectorAll(SELECTOR)];

    for (const surface of surfaces) {
      const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT);
      let current;
      while ((current = walker.nextNode())) translateTextNode(current);
    }
  }

  function boot() {
    translateSurface(document.body);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'characterData') {
          if (record.target.parentElement?.closest(SELECTOR)) translateTextNode(record.target);
          continue;
        }
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            if (node.parentElement?.closest(SELECTOR)) translateTextNode(node);
          } else if (node instanceof Element) {
            translateSurface(node);
          }
        }
      }
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else queueMicrotask(boot);
})();
