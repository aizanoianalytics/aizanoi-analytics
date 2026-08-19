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

  // The unified shell bridge is a presentation/interaction layer only. It does
  // not add network, backend or storage capabilities.
  appendScript('/js/os-unified.js', 'data-aizanoi-unified-bootstrap');

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
