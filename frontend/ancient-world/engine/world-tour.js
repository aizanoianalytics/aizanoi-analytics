/* World Tour — lightweight guided landmark experience for all Ancient Worlds.
   Reads real landmarks from __ANCIENT_WORLD_DEBUG__.landmarks, uses the runtime
   teleportTo API, and produces a clean DOM textContent card with progress and
   next/previous/close controls. No inline styles, no innerHTML for text. */
(function installWorldTour() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__WORLD_TOUR__) return;
  window.__WORLD_TOUR__ = true;

  const STYLE_ID = 'world-tour-style';
  const CARD_ID = 'world-tour-card';
  const TOUR_BTN_ID = 'world-tour-toggle';

  /* ---- curated landmark itineraries per world ---- */
  const ITINERARIES = Object.freeze({
    aizanoi: Object.freeze([
      'temple', 'agora', 'greatbath', 'stadium', 'theatre',
      'mosaicbath', 'odeon', 'macellum', 'bridge2', 'penkalas',
    ]),
    rome: Object.freeze([
      'colosseum', 'forum', 'pantheon', 'trajan-forum', 'peter',
      'caracalla', 'diocletian', 'maxentius', 'circus', 'palatine',
    ]),
    athens: Object.freeze([
      'parthenon', 'propylaea', 'athena-nike-early', 'old-athena-polias',
      'hephaisteion', 'theatre-dionysus', 'stoa-poikile',
      'bouleuterion', 'dipylon-gate', 'pnyx-bema',
    ]),
    iga: Object.freeze([
      'terminal', 'checkin-bcd', 'checkin-fgh', 'checkin-mps',
      'security', 'pier-west', 'pier-east', 'domestic-wing',
      'tower', 'apron-west',
    ]),
  });

  /* ---- contextual copy for each landmark, keyed by id ---- */
  const COPY = Object.freeze({
    /* Aizanoi */
    temple: 'The octastyle pseudodipteral Temple of Zeus — the largest structure in the city and one of the best-preserved Roman temples in Anatolia.',
    agora: 'The civic heart of Aizanoi: a colonnaded market square with the monumental Propylon gate connecting the Zeus sanctuary to the commercial district.',
    greatbath: 'A massive second-century bath and palaestra complex — one of the largest known in the Roman provincial world, with heated rooms and a vast exercise yard.',
    stadium: 'The southern half of the theatre–stadium complex, accommodating roughly 13,000 spectators along the shared spectacle axis.',
    theatre: 'A large imperial theatre sharing the stage-building axis with the stadium, its cavea rising above the Penkalas valley.',
    mosaicbath: 'A second–third century bathhouse preserving the celebrated satyr-and-maenad mosaic and hypocaust heating system.',
    odeon: 'The Bouleuterion / Odeon — a semicircular council and performance building at the northern edge of the civic core.',
    macellum: 'A circular food-market complex connected to the AD 301 Maximum Price Edict inscriptions found at Aizanoi.',
    bridge2: 'A Hadrianic bridge in the central urban river sequence, linking the market quarter to the sanctuary across the Penkalas.',
    penkalas: 'The Penkalas river — the organising water spine of Roman Aizanoi, channelled through quays and bridges across the urban core.',

    /* Rome */
    colosseum: 'The Flavian Amphitheatre — still used for venationes in the fifth century, with visible earthquake-repair marks from AD 443.',
    forum: 'The Roman Forum survives, but many temples and courts are silent, stripped or damaged after the decline of civic religion.',
    pantheon: 'Still an intact civic and religious monument with its revolutionary concrete dome, before its 609 CE conversion to a church.',
    'trajan-forum': 'The Forum of Trajan — column, market hemicycles and basilica retain their monumental silhouette despite spoliation.',
    peter: 'Old St. Peter\'s Basilica: the Constantinian basilica, atrium and Vatican pilgrimage approach on the Vatican slope.',
    caracalla: 'The Baths of Caracalla — still supplied with water in the fifth century; among the largest thermae ever built.',
    diocletian: 'The Baths of Diocletian — vast imperial baths still operational before later aqueduct cuts, with enormous service yards.',
    maxentius: 'The Basilica of Maxentius — three of the original four barrel-vaulted nave bays survive, towering over the Forum area.',
    circus: 'The Circus Maximus — a worn but active racing valley used at reduced intensity in late antique Rome.',
    palatine: 'The Palatine Palace shell — the imperial residence largely emptied after the court relocated to Ravenna.',

    /* Athens */
    parthenon: 'The octastyle Doric temple of Athena Parthenos, completed 432 BCE under Iktinos and Kallikrates with Phidias overseeing the sculptural programme.',
    propylaea: 'The monumental Doric gateway to the Acropolis by Mnesicles, begun ca. 437 BCE and completed 432 BCE.',
    'athena-nike-early': 'The tetrastyle amphiprostyle Temple of Athena Nike on the bastion west of the Propylaea, designed by Kallikrates.',
    'old-athena-polias': 'The Old Temple of Athena Polias — the pre-Parthenon cult shrine on the Acropolis, replaced by the Erechtheion building programme.',
    hephaisteion: 'Doric peripteral temple on Agoraios Kolonos hill, rededicated 449 BCE — the best-preserved Classical temple in Athens.',
    'theatre-dionysus': 'Theatre of Dionysus Eleuthereus on the south slope — a stone-seated cavea hosting the City Dionysia festival in this period.',
    'stoa-poikile': 'The Painted Stoa of the 460s BCE, adorned with paintings of the Marathon and mythological battles by Polygnotos and Micon.',
    bouleuterion: 'The Athenian Bouleuterion — the council chamber of the Five Hundred, anchoring the civic core near the Agora.',
    'dipylon-gate': 'The Dipylon Gate — the main western entry to the city through the Kerameikos district, beside the Sacred Gate.',
    'pnyx-bema': 'The Pnyx hill meeting-place of the Athenian assembly, with its carved bema (speaker\'s platform) overlooking the Agora.',

    /* İGA */
    terminal: 'A single 1.4-million-m² terminal volume with a vaulted roof grid and daylight-led passenger wayfinding — the world\'s largest LEED-certified building.',
    'checkin-bcd': 'Domestic check-in islands B through D — part of the rhythmic row of check-in counters beneath the terminal roof.',
    'checkin-fgh': 'International check-in islands F through H — the departure hall\'s long-hall rhythm and wayfinding cues.',
    'checkin-mps': 'International check-in islands M through S — the farthest check-in row, marking the terminal\'s vast scale.',
    security: 'A broad security and passport transition zone where skylight and signage pull the passenger journey onward into airside.',
    'pier-west': 'International Pier A–B with gate concourse, waiting zones and a continuous apron-facing window wall.',
    'pier-east': 'International Pier C–F with retail zones, quiet areas and a continuous apron-facing window wall.',
    'domestic-wing': 'Domestic gates, food-court rhythm and short onward routes in a distinct wing of the terminal.',
    tower: 'The tulip-inspired ATC tower — an original simplified silhouette referencing Istanbul Airport\'s signature control tower.',
    'apron-west': 'Western apron stands — compressed aircraft stands and taxiway atmosphere beyond the pier concourse.',
  });

  function detectWorld() {
    const path = location.pathname;
    if (path.includes('/historic-world/')) return 'aizanoi';
    if (path.includes('/rome-410-476/')) return 'rome';
    if (path.includes('/athens-450-430/')) return 'athens';
    if (path.includes('/iga/')) return 'iga';
    return null;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `/* world-tour */`;
    /* Load the external stylesheet */
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('./world-tour.css', import.meta.url).href;
    document.head.appendChild(link);
    document.head.appendChild(style);
  }

  function createCard() {
    const card = document.createElement('aside');
    card.id = CARD_ID;
    card.className = 'wt-card';
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'World Tour');
    card.hidden = true;

    const header = document.createElement('div');
    header.className = 'wt-header';

    const title = document.createElement('span');
    title.id = 'wt-title';
    title.className = 'wt-title';
    title.textContent = 'World Tour';

    const progress = document.createElement('span');
    progress.id = 'wt-progress';
    progress.className = 'wt-progress';
    progress.textContent = '1 / 10';

    header.appendChild(title);
    header.appendChild(progress);

    const body = document.createElement('div');
    body.className = 'wt-body';

    const landmark = document.createElement('div');
    landmark.id = 'wt-landmark';
    landmark.className = 'wt-landmark';

    const copy = document.createElement('p');
    copy.id = 'wt-copy';
    copy.className = 'wt-copy';

    landmark.appendChild(copy);
    body.appendChild(landmark);

    const controls = document.createElement('div');
    controls.className = 'wt-controls';

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.id = 'wt-prev';
    prev.className = 'wt-btn wt-prev';
    prev.textContent = '← Previous';
    prev.setAttribute('aria-label', 'Previous landmark');

    const next = document.createElement('button');
    next.type = 'button';
    next.id = 'wt-next';
    next.className = 'wt-btn wt-next';
    next.textContent = 'Next →';
    next.setAttribute('aria-label', 'Next landmark');

    const close = document.createElement('button');
    close.type = 'button';
    close.id = 'wt-close';
    close.className = 'wt-btn wt-close';
    close.textContent = 'Close';
    close.setAttribute('aria-label', 'Close tour');

    controls.appendChild(prev);
    controls.appendChild(next);
    controls.appendChild(close);

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(controls);
    return card;
  }

  let active = false;
  let currentIndex = 0;
  let itinerary = [];
  let card = null;
  let cleanupFns = [];

  function listen(target, type, handler, options) {
    if (!target?.addEventListener) return () => {};
    target.addEventListener(type, handler, options);
    cleanupFns.push(() => target.removeEventListener(type, handler, options));
    return handler;
  }

  function renderStop() {
    if (!card || !itinerary.length) return;
    const id = itinerary[currentIndex];
    const landmark = COPY[id] || id;
    const total = itinerary.length;

    const title = card.querySelector('#wt-title');
    const progress = card.querySelector('#wt-progress');
    const copy = card.querySelector('#wt-copy');
    const prev = card.querySelector('#wt-prev');
    const next = card.querySelector('#wt-next');

    if (title) title.textContent = 'World Tour';
    if (progress) progress.textContent = `${currentIndex + 1} / ${total}`;
    if (copy) copy.textContent = landmark;
    if (prev) prev.disabled = currentIndex === 0;
    if (next) next.disabled = currentIndex === total - 1;
  }

  function teleportStop(id) {
    const debug = window.__ANCIENT_WORLD_DEBUG__;
    if (debug?.teleportTo) {
      debug.teleportTo(id, { lock: false });
    }
  }

  function goNext() {
    if (currentIndex < itinerary.length - 1) {
      currentIndex++;
      renderStop();
      teleportStop(itinerary[currentIndex]);
    }
  }

  function goPrev() {
    if (currentIndex > 0) {
      currentIndex--;
      renderStop();
      teleportStop(itinerary[currentIndex]);
    }
  }

  function close() {
    active = false;
    if (card) card.hidden = true;
    const btn = document.getElementById(TOUR_BTN_ID);
    if (btn) btn.setAttribute('aria-pressed', 'false');
    teardown();
  }

  function teardown() {
    for (const fn of cleanupFns) {
      try { fn(); } catch (_) {}
    }
    cleanupFns = [];
  }

  function start() {
    const worldId = detectWorld();
    if (!worldId) return;

    const debug = window.__ANCIENT_WORLD_DEBUG__;
    const allLandmarks = debug?.landmarks;
    if (!Array.isArray(allLandmarks) || allLandmarks.length === 0) return;

    /* Resolve curated IDs against real landmarks */
    const curated = ITINERARIES[worldId] || [];
    const validIds = new Set(allLandmarks.map((l) => l.id));
    itinerary = curated.filter((id) => validIds.has(id));
    if (itinerary.length === 0) {
      /* Fallback: use first 10 real landmarks */
      itinerary = allLandmarks.slice(0, 10).map((l) => l.id);
    }

    ensureStyle();
    if (!card) {
      card = createCard();
      document.body.appendChild(card);
    }

    active = true;
    currentIndex = 0;
    renderStop();

    /* Show card and teleport to first stop */
    card.hidden = false;
    teleportStop(itinerary[0]);

    const btn = document.getElementById(TOUR_BTN_ID);
    if (btn) btn.setAttribute('aria-pressed', 'true');

    /* Bind controls */
    const prevBtn = card.querySelector('#wt-prev');
    const nextBtn = card.querySelector('#wt-next');
    const closeBtn = card.querySelector('#wt-close');

    listen(prevBtn, 'click', goPrev);
    listen(nextBtn, 'click', goNext);
    listen(closeBtn, 'click', close);

    /* Keyboard: left/right arrows, Escape to close */
    listen(document, 'keydown', (e) => {
      if (!active || !card || card.hidden) return;
      /* Do not trap input when user is typing in another control */
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });

    /* Touch: swipe left/right on the card */
    let touchStartX = 0;
    let touchStartY = 0;
    listen(card, 'touchstart', (e) => {
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    }, { passive: true });
    listen(card, 'touchend', (e) => {
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      /* Only trigger on horizontal swipe, not vertical scroll */
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) goNext();
        else goPrev();
      }
    }, { passive: true });
  }

  /* Wire into the world lifecycle: wait for the debug runtime to be available */
  function waitForDebug() {
    return new Promise((resolve) => {
      if (window.__ANCIENT_WORLD_DEBUG__) return resolve(true);
      const observer = new MutationObserver(() => {
        if (window.__ANCIENT_WORLD_DEBUG__) {
          observer.disconnect();
          resolve(true);
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      /* Fallback timeout */
      setTimeout(() => { observer.disconnect(); resolve(false); }, 12000);
    });
  }

  /* Install the toggle button */
  function installToggle() {
    if (document.getElementById(TOUR_BTN_ID)) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = TOUR_BTN_ID;
    btn.className = 'wt-toggle';
    btn.textContent = 'Tour';
    btn.setAttribute('aria-label', 'Start guided tour');
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      if (active) close();
      else start();
    });
    document.body.appendChild(btn);
  }

  /* Boot sequence */
  async function boot() {
    await waitForDebug();
    ensureStyle();
    installToggle();

    /* Check for ?tour=1 URL parameter */
    const params = new URL(location.href).searchParams;
    if (params.get('tour') === '1') {
      start();
      /* Clean URL */
      params.delete('tour');
      const clean = `${location.pathname}${params.toString() ? '?' + params.toString() : ''}${location.hash}`;
      history.replaceState(history.state, '', clean);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => boot(), { once: true });
  } else {
    boot();
  }
})();
