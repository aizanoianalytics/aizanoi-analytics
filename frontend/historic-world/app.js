'use strict';

(async () => {
  try {
    const [
      { CITY, SOURCES, REGIONS, STREETS, BUILDINGS, WATERS, BOUNDS, SPAWN },
      { generateAizanoiFabric },
      { startAncientCity },
    ] = await Promise.all([
      import('./data/city.js'),
      import('./data/urban-fabric.js'),
      import('../ancient-world/engine/city-bootstrap.js'),
    ]);

    const { runtime } = startAncientCity({
      city:CITY,
      sources:SOURCES,
      regions:REGIONS,
      streets:STREETS,
      buildings:BUILDINGS,
      waters:WATERS,
      bounds:BOUNDS,
      spawn:SPAWN,
      compactionProfile:'aizanoi',
      approachWidth:9,
      frontageWidth:7,
      generateFabric:generateAizanoiFabric,
      ui:'aizanoi',
      era:225,
      cityRoute:'/historic-world/',
    });
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
