# Aizanoi Dungeon Modülü (Aizo'nun Uyanışı)

> **Amaç:** Antik Kütahya/Çavdarhisar Aizanoi Zeus Tapınağı ve Penkalas Çayı yeraltı mahzenlerinde geçen; AizanoiOS v3 masaüstü pencereleme sistemiyle tam entegre, bağımsız (standalone) web olarak da çalışabilen, retro 2D Top-Down Dungeon-Crawler RPG oyunu ve varlık deposu.

---

## 1. Kararlı Kimlik (Stable Identity)

- **Ürün / Oyun Adı:** Aizanoi Dungeon: Aizo'nun Uyanışı
- **Kararlı Modül Kimliği (App ID):** `dungeon`
- **Genel Çalışma Girişi (Runtime Entry):** `src/index.js`
- **Manifest Yolu:** `manifest.json` (`manifestVersion: 1`, `type: "desktop-app"`)
- **Bağımsız (Standalone) Web Girişi:** `/dungeon/index.html`
- **Masaüstü & Favicon İkonu:** `assets/icons/aizanoi-dungeon.svg`

---

## 2. Bildirilen Yetenekler (Declared Capabilities)

- **Gereksinimler (`requires`):** `[]` (Sıfır dış yetenek bağımlılığı).
- **Sağlanan (`provides`):** `["desktop-app"]`.
- **Çalışma Modeli:** %100 istemci tarafı (client-side static execution). HTML5 Canvas, Phaser 3.80.1, Web Audio API ve yerel DOM kullanır; backend servisine veya harici veritabanına ihtiyaç duymaz.

---

## 3. Sahip Olunan Dosyalar ve Bileşen Haritası (Owned Implementation & Assets)

```
gelistirmeler/2026-09-11-dungeon-crawler-game/
├── index.md                 # Bu mimari ve sahiplik belgesi
├── DOCUMENTATION.md         # A'dan Z'ye derin teknik ve matematiksel sistem dokümantasyonu
├── README.md                # Merge & Deploy entegrasyon kılavuzu
├── manifest.json            # AizanoiOS v1 modül kayıt manifestosu
├── index.html               # Bağımsız tam ekran oynanabilir HTML5 sayfası
│
├── src/
│   └── index.js             # AizanoiOS pencere yaşam döngüsü: mount({ container }) & teardown
│
├── css/
│   └── game.css             # Yalıtılmış (scoped) AizanoiOS cam (glassmorphism) & antik pirinç teması
│
├── js/
│   ├── main.js              # Phaser 3 konfigürasyonu, başlatıcı ve motor kontrolcüsü
│   ├── constants.js         # Denge katsayıları, Aizo temel statları, renk paleti
│   │
│   ├── data/                # Oyun veritabanı (Modüler statik veri tabloları)
│   │   ├── levels.js        # 10 Kutsal Bölüm + Sonsuzluk Panteonu harita konfigürasyonları
│   │   ├── enemies.js       # 8 Düşman ve Boss türü (statlar, animasyon satırları, davranışlar)
│   │   ├── items.js         # Silahlar, zırhlar, tılsımlar ve tüketilebilir XP paketleri
│   │   ├── skills.js        # 3 Dallı (Saldırı, Savunma, Fayda) Kutsal Yetenek Ağacı
│   │   └── shop-catalog.js  # Antik Macellum tüccarının dinamik satış kataloğu
│   │
│   ├── entities/            # Oyun Varlıkları (Phaser Physics Arcade Nesneleri)
│   │   ├── Aizo.js          # Oyuncu karakteri (hareket, saldırı, menzilli atış, can yenileme)
│   │   ├── Enemy.js         # Düşman yapay zekası (takip, saldırı menzili, can barı, ganimet)
│   │   ├── Projectile.js    # Şimşek arkları, kemik okları ve büyü mermileri
│   │   ├── Structure.js     # Zeus Sunağı, Savunma Kuleleri, Mezar Çatlakları, Yozlaşmış Mabedler
│   │   └── Portal.js        # Seviye tamamlama ve sonraki bölüme geçiş kapısı
│   │
│   ├── scenes/              # Phaser 3 Sahne Yöneticisi (9 Ayrı Sahne)
│   │   ├── BootScene.js     # Varlık ön-yükleyici (Asset Loader) ve animasyon kayıt defteri
│   │   ├── MenuScene.js     # Ana Menü (Hikaye, Devam Et, Sonsuzluk, Kılavuz)
│   │   ├── GameScene.js     # Ana oyun döngüsü (Fizik, harita render, çarpışma, kamera)
│   │   ├── UIScene.js       # Paralel HUD (Can, XP, Bölüm, Denarii, Cooldownlar, Ses Butonu)
│   │   ├── ShopScene.js     # Macellum tüccarı overlay arayüzü
│   │   ├── SkillTreeScene.js# Yetenek ağacı açma overlay arayüzü
│   │   ├── InventoryScene.js# Yadigarlar sandığı ve detaylı stat özeti overlay arayüzü
│   │   ├── GameOverScene.js # Mermer heykel uykusu ve dirilme ekranı
│   │   └── VictoryScene.js  # 10. Bölüm Titan Colossus zafer kutlama ekranı
│   │
│   ├── systems/             # Temel Oyun Motoru Sistemleri
│   │   ├── CombatSystem.js  # Zırh absorbsiyonu, kritik hasar, can çalma ve infaz matematiği
│   │   ├── ProgressionSystem.js # XP, Seviye atlama, Denarii, Bölüm kaydı ve kalıcılık
│   │   ├── InventorySystem.js   # Kuşanılan eşyalar ve stat birleştirici (Stat Aggregator)
│   │   ├── LevelSystem.js   # BSP (Binary Space Partitioning) prosedürel zindan üreticisi
│   │   ├── TouchControls.js # Mobil sanal joystick, auto-target ve dokunmatik butonlar
│   │   └── AudioManager.js  # Web Audio API ile sıfır harici dosya sentezli ses motoru
│   │
│   └── utils/               # Yardımcı Fonksiyonlar
│       ├── math-helpers.js  # Açı, mesafe, clamp ve olasılık fonksiyonları
│       └── ui-helpers.js    # Cam efektli butonlar ve prosedürel stat barları
│
├── assets/                  # 100% Modüle Özel Üretilmiş Piksel Sanatı ve Grafikler
│   ├── sprites/             # aizo.png, enemies.png, bosses.png, items-*.png, projectiles.png
│   ├── tilesets/            # aizanoi-floor.png, aizanoi-walls.png, aizanoi-decor.png
│   ├── ui/                  # Butonlar, paneller, barlar, joystick, skill node ikonları
│   └── icons/               # aizanoi-dungeon.svg (Vektörel Aizo maskotu)
│
└── tools/                   # Doğrulama, Denetim ve Test Araçları
    ├── deep_audit.py        # 78 dosyanın çapraz başvuru, casing ve katalog bütünlük denetimi
    ├── validate_js.py       # 30 JS dosyasının sözdizimi ve import geçerlilik kontrolü
    ├── validate_assets.py   # Disk üzerindeki asset varlık denetimi
    └── test_http_server.py  # Yerel HTTP sunucusu üzerinden 200 OK duman testi
```

---

## 4. Mimari ve Çalışma Prensipleri (How & Why It Works)

### A. Çift-Çalışma Modeli (Dual Execution Mode)
1. **AizanoiOS Entegrasyonu (`src/index.js`):**
   - AizanoiOS masaüstü kabuğu modülü dinamik olarak içe aktarır (`import(...)`).
   - `mount({ container })` çağrıldığında host pencereye yalıtılmış bir wrapper yerleştirir, Phaser motorunu başlatır ve pencere boyutu değişimlerini `ResizeObserver` ile takip eder.
   - Pencere kapatıldığında `teardown()` tetiklenerek Phaser instance'ı `destroy(true)` ile tamamen imha edilir, bellek sızıntısı engellenir.
2. **Bağımsız Web Sürümü (`index.html`):**
   - Doğrudan `/dungeon/` URL'si üzerinden açılır.
   - Cihaz mobil ise dikey ekran uyarısı (`orientation-overlay`) gösterir, landscape modda tam ekran oyun deneyimi sunar.

### B. Prosedürel Web Audio Mimarisi (Neden Harici Ses Dosyası Yok?)
- **Gerekçe:** Web oyunlarında harici MP3/OGG dosyaları; yavaş ağlarda gecikmeye, Linux/Nginx sunucularda MIME type uyumsuzluğuna veya 404 hatalarına yol açar.
- **Çözüm (`AudioManager.js`):** HTML5 Web Audio API'nin dahili `OscillatorNode`, `GainNode` ve `BiquadFilterNode` birimleri kullanılarak kılıç savurmasından gök gürültüsüne, Roma parası tınlamasından kalkan ilahi akoruna kadar 12 ses matematiksel olarak sentezlenir. Boyut: **0 bayt ağ yükü**, %100 çevrimdışı çalışma.

### C. Prosedürel BSP Harita Üretimi (`LevelSystem.js`)
- Her bölüm başladığında zindan alanı `Binary Space Partitioning (BSP)` algoritması ile özyinelemeli olarak odalara bölünür.
- Odalar 2 karo genişliğindeki koridorlarla bağlanır. İlk oda Aizo'nun kutsal güvenli üssü (Zeus Sunağı) ilan edilir, en uzak oda ise çıkış portalı yapılır.
- Oyuncunun veya düşmanların duvar içinde doğması matematiksel olarak imkansızdır.

### D. Dinamik Varlık Yolu Çözümleme (`import.meta.url`)
- Standalone `/dungeon/` ile AizanoiOS `/js/v3/apps/dungeon/` farklı klasör derinliklerindedir.
- `BootScene.js`, varlık taban yolunu `new URL('../../assets/', import.meta.url).href` ile çalışma anında belirler. Oyun ister alt klasörde ister ana dizinde olsun, varlıklar her zaman doğru URL'den çekilir.

---

## 5. Depolama ve Kalıcılık (Storage & State Persistence)

Modül, kullanıcı ilerlemesini tarayıcının `localStorage` alanında 3 anahtarla yönetir:

| Depolama Anahtarı | Sahip Sistem | İçerik ve Amaç |
|---|---|---|
| `aizanoi_dungeon_save_v1` | `ProgressionSystem` | Oyuncu seviyesi, mevcut XP, toplam Denarii, açılan yetenekler seti, en yüksek dalga, ulaşılan bölüm ve istatistikler. |
| `aizanoi_inventory_v1` | `InventorySystem` | Kuşanılmış silah ID'si, zırh ID'si ve 2 adet aksesuar ID'si. |
| `aizanoi_dungeon_muted` | `AudioManager` | Ses açık/kapalı kullanıcı tercihi (`true` / `false`). |

*Not: Özel tarayıcı modunda veya depolama kısıtlamasında sistem `try/catch` bloklarıyla sessizce belleğe (in-memory) düşer, oyunun çökmesine izin vermez.*

---

## 6. Yaşam Döngüsü ve Bellek Temizliği (Cleanup Contract)

- `GameScene` sahnesi her seviye geçişinde (`handleEnterPortal`) veya yeniden başlatmada `shutdown` olayı yayar.
- Sanal Joystick (`TouchControls`) DOM ve canvas referanslarını serbest bırakır (`destroy()`).
- Sahne seviyesindeki tüm klavye ve işaretçi dinleyicileri `removeAllListeners()` ile tahliye edilir.
- Düşmanlar yok olduğunda üzerlerindeki grafik sağlık barları `preDestroy()` ile sahne ağacından temizlenir.
- Pencere kapatıldığında `stopDungeonGame` çağrılarak Phaser döngüsü, requestAnimationFrame çağrıları ve Web Audio bağlamı güvenle sonlandırılır.

---

## 7. Doğrulama ve Testler (Verification Suite)

Proje kökünde yer alan 4 test betiği ile doğrulanır:

```powershell
# 1. Çapraz başvuru, Linux casing, sahne ve eşya bütünlüğü kontrolü (0 hata)
python tools/deep_audit.py

# 2. 30 JS dosyasının sözdizimi ve import geçerliliği kontrolü (0 hata)
python tools/validate_js.py

# 3. Disk üzerindeki 33 asset dosya yolunun varlık doğrulaması (%100 başarı)
python tools/validate_assets.py

# 4. Yerel HTTP sunucusunda tüm uç noktaların 200 OK yanıt kontrolü (15/15 OK)
python tools/test_http_server.py
```

Detaylı matematiksel formüller, seviye denge tabloları, yetenek ağacı mimarisi ve Nginx yapılandırma kılavuzu için lütfen **`DOCUMENTATION.md`** dosyasını inceleyin.
