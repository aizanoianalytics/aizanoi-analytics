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

## Tamamlanan temel ürün katmanları

### Aizanoi OS
- [x] Retro desktop / taskbar / Start menu / draggable-resizable windows
- [x] Custom Aizanoi branding, icons and wallpapers
- [x] Boot, lock, shutdown and screensaver flows
- [x] Control Panel themes and system preferences
- [x] Aizanoi OS V2 modular polish (`css/os-v2.css`, `js/os-v2.js`)
- [x] Active/inactive window polish and viewport clamping
- [x] Show Desktop control
- [x] Safe-area / `100dvh` mobile window sizing
- [x] ARIA/focus improvements and desktop/mobile Chromium smoke coverage

### Aizanoi AI
- [x] HR & People Analytics scoped assistant
- [x] Groq primary + Google fallback backend
- [x] Server-side provider keys
- [x] Safe Markdown rendering for assistant responses
- [x] Per-answer copy, copy-last-answer and clear-chat UX
- [x] Starter prompts and loading/error states

### Games
- [x] Mines, Snake and Brick Breaker
- [x] Local-only score history (`localStorage['aizanoi-games']`)
- [x] Shared local best-score toolbar
- [x] Pause / resume and restart controls
- [x] Touch/mobile controls and lifecycle timer cleanup

### Ancient World
- [x] Aizanoi Historic World mature custom WebGL experience
- [x] Shared traversal / collision / support-surface / teleport / lifecycle contracts
- [x] Shared analog mobile controller + drag-look + run controls
- [x] Shared Back to Aizanoi OS navigation
- [x] Shared historical evidence levels
- [x] Shared adaptive-quality policy
- [x] Shared procedural surface shader, sky and animated water renderer
- [x] Late Antique Rome 410–476 experience
- [x] Classical Athens 450–430 BCE experience
- [x] Rome/Athens real Chromium desktop/mobile movement tests
- [x] Reusable city manifest/template for future historical cities

### Platform / quality
- [x] SPA routes and deep links
- [x] robots.txt + sitemap.xml + canonical metadata foundation
- [x] Market retired with 410 behavior
- [x] GitHub Actions syntax/regression/browser smoke CI
- [x] Frontend lightweight file-size regression budgets

---

## Makul sonraki geliştirmeler

### Ancient World — en yüksek ürün değeri
- [ ] Rome'u landmark-by-landmark elle zenginleştir: Forum Romanum, Palatine, Baths, basilicas, gates/walls ve sokak çevresi
- [ ] Athens'i district-by-district zenginleştir: Acropolis, Agora, Theatre of Dionysus, Pnyx, Kerameikos ve residential streets
- [ ] Aizanoi / Rome / Athens için ortak procedural building-builder katmanını kontrollü biçimde genişlet
- [ ] Yeni şehir eklemeden önce mevcut ortak engine kontratını koru; şehir başına yeni movement/input engine yazma
- [ ] Hero monument asset pipeline için küçük GLB/Three.js PoC yalnız gerektiğinde; tüm renderer'ları bir anda migrate etme
- [ ] Görsel benchmark / screenshot regression yaklaşımını olgunlaştır

### Aizanoi OS / Frontend
- [ ] `frontend/index.html` monolitini düşük-risk sınırlar buldukça daha fazla modüle ayır
- [ ] Start/Search/Run gibi dekoratif XP davranışlarından gerçekten yararlı olanları iyileştir; gereksiz sahte işlevleri çoğaltma
- [ ] Full keyboard-navigation audit
- [ ] NVDA / VoiceOver manuel smoke
- [ ] WCAG 2.1 AA odaklı contrast/focus audit
- [ ] High-contrast tema ancak mevcut retro kimliği bozmadan

### SEO / distribution
- [ ] Gerçek 1200×630 Open Graph / Twitter image
- [ ] Route bazlı statik metadata / pre-render ihtiyacını ölç
- [ ] Search Console / Bing Webmaster doğrulama ve submission
- [ ] Lighthouse raporu ve performans bütçelerini gerçek production ölçümleriyle kalibre et
- [ ] TR/EN content/i18n ancak gerçek içerik ihtiyacı oluştuğunda

### Performance
- [ ] Lighthouse CI veya eşdeğer performans regression kapısı
- [ ] Image optimization yalnız gerçek ağırlık problemi olan assetlerde
- [ ] Critical CSS / further bundle splitting ölçümle doğrulanırsa
- [ ] Service worker/PWA/offline ancak gerçekten kullanım değeri yaratıyorsa

### Content / publishing
- [ ] Aizanoi TV gerçek yayın içeriği geldiğinde kanal/feed entegrasyonu
- [ ] Projects / Docs / Changelog içeriklerini yayın akışına göre güncel tut
- [ ] Owner-published historical research ledger'larını yeni şehirlerle birlikte standardize et

### Operations
- [ ] Custom 500 / 503 pages
- [ ] Staging ortamı yalnız production riskini anlamlı biçimde azaltacaksa
- [ ] CDN ancak ölçülen latency/bandwidth ihtiyacı varsa
- [ ] Formal architecture diagram ve güncel component/module map

---

## Bilinçli olarak yapılmayacaklar

Bu ürün için “daha fazla özellik = daha iyi ürün” yaklaşımı kullanılmayacak. Özellikle accounts, multiplayer, comments/community, shared leaderboards ve visitor social state ürün hedefi değildir. Öncelik **owner-published content, Aizanoi OS deneyimi, Aizanoi AI, games ve yüksek kaliteli historical worlds** olacaktır.
