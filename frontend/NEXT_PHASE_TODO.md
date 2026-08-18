# NEXT_PHASE_TODO — Aizanoi Analytics

Bu dosya mevcut ürün yönünü yansıtır. Aizanoi Analytics **tek yayıncılı bir kişisel platform / interaktif portföy** olarak kalacaktır. Ziyaretçiler içerikleri kullanabilir ancak birbirleriyle etkileşime girmez.

## Ürün kapsamı — sabit

Aşağıdakiler yeni bir açık ürün kararı verilmedikçe **kapsam dışıdır**:

- ❌ User accounts / sign-in / profiles
- ❌ Multiplayer
- ❌ Comments, forums, chat rooms, community/social features
- ❌ Public/shared leaderboards
- ❌ Visitor-generated content / collaborative editing
- ❌ Visitor identity/social/shared-game-state için database
- ❌ Market / finance product area

Yerel browser tercihleri ve oyun skorlarının `localStorage` içinde tutulması uygundur.

---

## Tamamlanan ürün / kalite katmanları

### Aizanoi OS
- [x] Retro desktop / taskbar / Start menu / draggable-resizable windows
- [x] Custom Aizanoi branding, icons and wallpapers
- [x] Boot, lock, shutdown and screensaver flows
- [x] Control Panel themes and system preferences
- [x] Active/inactive window polish, safe viewport recovery and Show Desktop
- [x] Safe-area / `100dvh` mobile window sizing
- [x] Per-window drag-listener cleanup and interaction lifecycle hardening
- [x] ARIA/focus/context-menu/notification improvements
- [x] Stable low-risk runtime extraction: `os-core.css`, `chat.js`, `terminal.js`, `os-router.js`
- [x] Desktop/mobile real Chromium smoke coverage

### Aizanoi AI
- [x] HR & People Analytics scoped assistant
- [x] Groq primary + Google fallback backend
- [x] Server-side provider keys
- [x] Safe Markdown rendering
- [x] Auto-growing multiline composer; Enter send / Shift+Enter newline / IME protection
- [x] Per-answer copy, copy-last-answer, clear and retry UX
- [x] Abortable request lifecycle and 80-second browser guard aligned with reverse proxy
- [x] Starter prompts and loading/error states

### Games
- [x] Mines, Snake and Brick Breaker
- [x] Local-only score history (`localStorage['aizanoi-games']`)
- [x] Shared local best-score toolbar
- [x] Pause / resume and restart controls
- [x] Touch/mobile controls and lifecycle cleanup
- [x] Brick Breaker fixed-timestep `requestAnimationFrame` loop

### Ancient World
- [x] Aizanoi Historic World mature custom WebGL experience
- [x] Historic World presentation/runtime boundary extraction (`style.css` + `app.js`) without renderer rewrite
- [x] Shared traversal / collision / support-surface / teleport / lifecycle contracts
- [x] Shared analog mobile controller + drag-look + run controls
- [x] Shared Back to Aizanoi OS navigation
- [x] Shared historical evidence levels and adaptive-quality policy
- [x] Shared procedural surface shader, sky and animated water renderer
- [x] Late Antique Rome 410–476 experience
- [x] Classical Athens 450–430 BCE experience
- [x] Rome landmark/streetscape enrichment pass: Colosseum, forum/market corridors, district style, street detail
- [x] Athens district/hero enrichment pass: Acropolis/Agora vocabulary, Hephaisteion, Theatre of Dionysus, stoas and district style
- [x] Shared sightline-aware landmark framing + traversal/camera clearance
- [x] Rome/Athens real Chromium desktop/mobile movement + post-teleport regression tests
- [x] Reusable city manifest/template for future historical cities
- [x] Four-view screenshot capture / visual-review artifact in CI

### Platform / quality
- [x] SPA routes and deep links
- [x] `robots.txt` + `sitemap.xml` + canonical metadata foundation
- [x] 1200×630 Open Graph/Twitter social preview source + metadata
- [x] Market retired with 410 behavior
- [x] Custom 404 / 500 / 503 visitor-facing documents
- [x] Nginx reference: real 404 routing, CSP/security headers and 85-second API proxy timeout
- [x] GitHub Actions syntax/regression/browser smoke CI
- [x] Frontend modular file-size regression budgets
- [x] Lighthouse performance/accessibility/best-practices/SEO regression gate
- [x] Architecture/component ownership map (`ARCHITECTURE.md`)
- [x] Accessibility release checklist (`docs/ACCESSIBILITY.md`)

---

## Dış / manuel release adımları

Bunlar repository koduyla otomatik ve dürüst biçimde tamamlanamaz:

- [ ] **NVDA / VoiceOver gerçek cihaz smoke testi** — adımlar `docs/ACCESSIBILITY.md` içinde hazırdır.
- [ ] **Google Search Console doğrulama + sitemap submission** — site sahibinin Google hesabı gerekir.
- [ ] **Bing Webmaster Tools doğrulama + sitemap submission** — site sahibinin Bing/Microsoft hesabı gerekir.
- [ ] **Hetzner production deploy + aktif Nginx config güncellemesi** — Git merge canlı sunucuyu tek başına değiştirmez; `infra/README.md` deployment kontrol listesi kullanılmalıdır.

---

## Bundan sonrası: yalnız ölçüm veya yeni içerik ihtiyacı doğarsa

Aşağıdakiler mevcut üründe eksik/kırık sayılmaz; yeni değer kanıtlandığında yapılır:

- Historic World içindeki kalan büyük city-specific veri/render bloklarını daha ileri modülerleştirmek; davranış paritesi korunmadan ortak engine'e zorla taşımamak.
- Aizanoi / Rome / Athens için yeni reusable procedural building-builder katmanları eklemek; yalnız en az iki şehir aynı ihtiyacı gerçekten paylaşıyorsa.
- GLB/Three.js hero asset PoC; yalnız mevcut procedural hero geometrisinin belirgin kalite sınırı ölçülürse.
- Route bazlı statik pre-render; Search Console/Lighthouse gerçek production verisi SPA metadata'nın yetersiz olduğunu gösterirse.
- Daha fazla image optimization / critical CSS; network trace gerçek ağırlık problemi gösterirse.
- Staging, CDN, service worker/PWA/offline; ancak operasyonel veya kullanıcı değeri ölçülürse.
- TR/EN i18n; gerçek iki dilli içerik yayın akışı oluşursa.
- Yeni historical city / research ledger; yeni içerik projesi başladığında.
- Aizanoi TV feed/channel entegrasyonu; gerçek yayın içeriği geldiğinde.

---

## Bilinçli olarak yapılmayacaklar

Bu ürün için “daha fazla özellik = daha iyi ürün” yaklaşımı kullanılmayacak. Accounts, multiplayer, comments/community, shared leaderboards ve visitor social state ürün hedefi değildir. Öncelik **owner-published content, Aizanoi OS deneyimi, Aizanoi AI, games ve yüksek kaliteli historical worlds** olacaktır.
