# NEXT_PHASE_TODO — Aizanoi Analytics

Bu turda kota sınırlı olduğu için **PRIORITY 1-10** tamamlandı. Büyük işler sonraki turlara bırakıldı.

## Yapılmayan / Ertelenen Büyük İşler

### Historic World — V8 integrated
- [x] Self-contained WebGL engine at `frontend/historic-world/index.html`
- [x] Roman Aizanoi city reconstruction with Temple, Agora, Baths, Theatre, Stadium, bridges and river
- [x] WASD/touch movement, mouse look, collision grid, terrain/elevation support and tread-by-tread stairs
- [x] Archaeological atlas, Texier survey, sources and evidence/uncertainty labels
- [x] Historical layers AD 225 / AD 301 / AD 425
- [x] `/historic-world/` route linked from the legacy Ancient World launcher
- [ ] Add a real jump mechanic only after an explicit design decision and vertical-state test plan
- [ ] Split the monolithic renderer into modules only when a low-risk boundary is proven

### Ancient World — Legacy launcher

### Games — Gelişmiş
- [ ] Daha iyi grafikler ve animasyonlar
- [ ] Yüksek skor sistemi (gerçek localStorage'a kayıt)
- [ ] Yeni oyunlar: Tetris, Sudoku, Pinball, Chess Titans
- [ ] Multiplayer (ileride)

### SEO — Kapsamlı
- [ ] Tüm route'lar için statik HTML üretme (pre-render)
- [ ] Per-route meta tags (zaten JS ile yapılıyor, statik de gerekli)
- [ ] Yapısal veri genişletme (BreadcrumbList, FAQPage, HowTo)
- [ ] hreflang çoklu dil desteği (TR/EN)
- [ ] Open Graph image üretme (aizanoi-classic wallpaper'dan)
- [ ] Twitter Card image
- [ ] Google Search Console submission
- [ ] Bing Webmaster Tools
- [ ] Lighthouse raporları ve optimizasyon

### Performance — Kapsamlı
- [ ] Lighthouse CI kurulumu
- [ ] Performance budget
- [ ] Image optimization pipeline (SVG → WebP)
- [ ] Critical CSS extraction
- [ ] Service worker / PWA
- [ ] Offline mode
- [ ] Bundle splitting (JS modules)

### Accessibility — Kapsamlı
- [ ] Full keyboard navigation
- [ ] Screen reader testleri (NVDA, VoiceOver)
- [ ] WCAG 2.1 AA audit
- [ ] Focus management
- [ ] aria-live regions
- [ ] High contrast mode

### Documentation
- [ ] OpenAPI / Swagger spec for /api endpoints
- [ ] Architecture diagram
- [ ] Component library
- [ ] Contribution guide
- [ ] CHANGELOG (formal)

### Video / YouTube
- [ ] Aizanoi Analytics YouTube channel
- [ ] Video feed integration (YouTube Data API)
- [ ] First videos: intro, Aizanoi AI demo, Ancient World teaser

### Advanced Features
- [ ] Search gelişmiş (fuzzy match, history)
- [ ] Run dialog gelişmiş (command palette)
- [ ] Notifications system
- [ ] Multi-window management
- [ ] Drag & drop file support
- [ ] User accounts (ileride, opsiyonel)
- [ ] Database backend (ileride)

### Frameworks / Migration
- [ ] React / Vue / Next.js değerlendirmesi (büyük refactor)
- [ ] TypeScript migration
- [ ] Tailwind CSS
- [ ] Vite build pipeline

### Analytics
- [ ] Privacy-friendly analytics (Plausible / Umami)
- [ ] Custom event tracking
- [ ] Conversion funnels

### Internationalization
- [ ] TR dil desteği (UI strings)
- [ ] Multi-language content

### Domain & Deployment
- [ ] Custom error pages (500, 503)
- [ ] CDN setup
- [ ] Staging environment
- [ ] CI/CD pipeline (GitHub Actions)

### Database / Backend
- [ ] Database integration (şu an sadece localStorage)
- [ ] User preferences sync
- [ ] Game high scores global leaderboard
- [ ] Comments / community features

### Yapılmayan — Kapsam Dışı
- ❌ Market (Yahoo Finance, stocks) — KALDIRILDI
- ❌ User accounts (zorunlu) — gerekmiyor
- ❌ File upload — gerekmiyor
- ❌ Database — gerekmiyor

---

## Bu Turda Yapılan (Referans)

✅ **PRIORITY 1** — Market UI tamamen kaldırıldı (icon, start menu, app registry, metinler)
✅ **PRIORITY 2** — Aizanoi AI kısa system prompt + 6 starter prompt kartı
✅ **PRIORITY 3** — Aizanoi logo SVG (`/assets/branding/aizanoi-logo.svg` + mark)
✅ **PRIORITY 4** — 10 özgün desktop icon SVG (antik + retro konsept)
✅ **PRIORITY 5** — Aizanoi Classic wallpaper SVG
✅ **PRIORITY 6** — Lock screen (full screen, Aizanoi OS) + screensaver (Ancient Stars)
✅ **PRIORITY 7** — Control Panel: 4 tema, 2 wallpaper, 3 sistem switch
✅ **PRIORITY 8** — Boot screen (Aizanoi mark + wordmark) + Shutdown screen
✅ **PRIORITY 9** — Aizanoi Night wallpaper SVG
✅ **PRIORITY 10** — SEO kontrol (title, canonical, description, robots, sitemap, 410)
✅ **PRIORITY 15** — Icon hover/selected CSS