'use strict';

(async () => {
  try {
    const [
      { CITY, SOURCES, REGIONS, STREETS, BUILDINGS, WATERS, BOUNDS, SPAWN },
      { generateAizanoiFabric },
      { compactCityLayout, CITY_COMPACTION_PROFILES },
      { startFlatBlockyCity },
      { installCityCompatibility },
    ] = await Promise.all([
      import('./data/city.js'),
      import('./data/urban-fabric.js'),
      import('../ancient-world/assets/city-layout-tools.js'),
      import('../ancient-world/engine/flat-city-runtime.js'),
      import('../ancient-world/engine/city-compatibility.js'),
    ]);
    const TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || matchMedia('(pointer:coarse)').matches || innerWidth < 820;
    const layout = compactCityLayout({
      city: CITY,
      regions: REGIONS,
      streets: STREETS,
      buildings: BUILDINGS,
      waters: WATERS,
      bounds: BOUNDS,
      spawn: SPAWN,
    }, CITY_COMPACTION_PROFILES.aizanoi);
    const runtime = startFlatBlockyCity({
      city: layout.city,
      sources: SOURCES,
      regions: layout.regions,
      streets: layout.streets,
      buildings: layout.buildings,
      urbanFabric: generateAizanoiFabric({
        regions: layout.regions,
        buildings: layout.buildings,
        streets: layout.streets,
        waters: layout.waters,
        mobile: TOUCH,
      }),
      waters: layout.waters,
      bounds: layout.bounds,
      spawn: layout.spawn,
      ui: 'aizanoi',
      era: 225,
      cityRoute: '/historic-world/',
    });
    installCityCompatibility(runtime, { ui: 'aizanoi' });
    window.__AIZANOI_WORLD__ = runtime;
  } catch (error) {
    console.error('Aizanoi flat modular renderer failed:', error);
    const loading = document.getElementById('loading');
    const loadError = document.getElementById('loadError');
    if (loading) loading.classList.remove('hidden');
    if (loadError) {
      loadError.classList.remove('hidden');
      loadError.innerHTML = `<b>Initialization stopped.</b><br>${String(error?.message || error)}<br><br>The source atlas remains available.`;
    }
  }
})();
