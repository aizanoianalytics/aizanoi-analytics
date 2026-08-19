(() => {
  'use strict';

  const State = window.AIZANOI_OS_STATE;
  if (!State || window.AIZANOI_PLATFORM || window.AIZANOI_DISTRIBUTION) return;

  function appendScript(src, attribute) {
    const selector = `script[${attribute}="${src}"]`;
    if (document.querySelector(selector)) return;
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.setAttribute(attribute, src);
    script.addEventListener('error', () => console.error(`Aizanoi runtime module could not start: ${src}`), { once:true });
    document.body.appendChild(script);
  }

  // Presentation/interaction bridges only. Neither adds network, backend or
  // storage capabilities; the product-polish bridge owns final cross-app copy
  // and visual consistency while the unified bridge owns responsive structure.
  appendScript('/js/os-unified.js', 'data-aizanoi-unified-bootstrap');
  appendScript('/js/os-product-polish.js', 'data-aizanoi-product-polish-bootstrap');

  const loaderSrc = '/js/os-distribution-loader.js';
  const existing = document.querySelector(`script[data-aizanoi-platform-bootstrap="${loaderSrc}"]`);
  if (existing) return;

  const script = document.createElement('script');
  script.src = loaderSrc;
  script.async = false;
  script.dataset.aizanoiPlatformBootstrap = loaderSrc;
  script.addEventListener('error', () => {
    console.error('Aizanoi workstation loader could not start. Core Aizanoi OS remains available.');
  }, { once:true });
  document.body.appendChild(script);
})();
