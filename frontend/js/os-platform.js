(() => {
  'use strict';

  const State = window.AIZANOI_OS_STATE;
  if (!State || window.AIZANOI_PLATFORM || window.AIZANOI_DISTRIBUTION) return;

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
