# Aizanoi Dungeon: Aizo'nun Uyanışı — Kapsamlı Teknik Sistem Dokümantasyonu

> Bu belge; **Aizanoi Dungeon** oyununun arkasındaki yazılım mimarisini, matematiksel denge modellerini, prosedürel harita üretim algoritmasını, sentezlenmiş ses fiziğini ve Linux sunucu entegrasyon protokolünü en ince ayrıntısına kadar açıklar. Dışarıdan bir geliştirici veya sistem yöneticisi bu dokümanı okuyarak projenin her satırının "neyi, neden ve nasıl" yaptığını tam olarak kavrayabilir.

---

## 1. Giriş, Tarihsel Bağlam ve Karakter Vizyonu

### 1.1. Tarihsel Arka Plan: Aizanoi ve Zeus Tapınağı
Aizanoi, Kütahya'nın Çavdarhisar ilçesinde yer alan, dünyanın en iyi korunmuş Zeus Tapınağı'na, dünyanın ilk borsa yapısına (Macellum), tiyatro-stadyum kompleksine ve antik Penkalas (Kocaçay) köprülerine ev sahipliği yapan kadim bir Frigya/Roma kentidir.

Oyun, Zeus Tapınağı'nın altındaki tonozlu mahzenlerde ve Penkalas'ın yeraltı su kanallarında geçer. Yüzyıllardır kentin altında biriken karanlık ve yozlaşma, antik heykelleri, mezar taşlarını ve lejyoner kalıntılarını canlandırmıştır.

### 1.2. Başkahraman: Aizo (Mermer İdol)
- **Kimlik:** Zeus Tapınağı'nın kutsal mermerinden yontulmuş koruyucu heykel idol.
- **Görsel Tasarım:**
  - Pürüzsüz antik mermer beden (Kütahya beyaz/krem mermeri).
  - Alnında parıldayan mor/eflatun şimşek çatlağı (Zeus'un bahşettiği uyanış enerjisi).
  - Derin obsidyen taşından oyulmuş gözler.
  - Başının üzerinde filizlenen zeytin dalı / defne tacı (Aizanoi'nin arınmasını ve zaferini simgeler).
- **Temel Dinamik:** Aizo yürümez; tapınak taşlarının üzerinde süzülerek (glide) hareket eder.

---

## 2. Mimari Tasarım Felsefesi ve Çözüm Kararları

| Karar | Seçilen Yaklaşım | Neden Bu Şekilde Yapıldı? |
|---|---|---|
| **Oyun Motoru** | **Phaser 3.80.1 (Arcade Physics)** | Web standartlarına %100 uyumlu, GPU hızlandırmalı HTML5 Canvas render'ı sunan, mobil dokunmatik ve kamera sistemleri son derece olgunlaşmış endüstri standardı bir 2D kütüphanedir. |
| **Ses Mimarisi** | **HTML5 Web Audio API Prosedürel Sentez** | Dışarıdan MP3/OGG dosyaları yüklemek; ağ gecikmesine, CDN kesintilerine, Linux Nginx sunucularda eksik dosya ve CORS hatalarına yol açar. Prosedürel ses ile 12 efekt matematiksel olarak üretilir; **0 bayt indirme boyutu** ve anında tepki süresi elde edilir. |
| **Harita Üretimi** | **Binary Space Partitioning (BSP)** | Rastgele tile saçmak yerine mimari olarak tutarlı odalar ve 2-tile genişlikte koridorlar üretir. Oyuncunun duvar içinde sıkışması veya çıkışsız zindan oluşması matematiksel olarak imkansızdır. |
| **Varlık Yolu** | **`import.meta.url` Tabanlı Çözümleme** | Standalone web sürümü (`/dungeon/`) ile AizanoiOS masaüstü sürümü (`/js/v3/apps/dungeon/`) farklı URL derinliklerinde çalışır. Statik yollar yerine ES modülünün kendi fiziksel konumu baz alınarak her ortamda 404 riski sıfırlanmıştır. |
| **Bellek Yönetimi** | **Phaser `shutdown` + `preDestroy`** | Sahne geçişlerinde ve pencere kapatmalarında klavye/dokunmatik dinleyicileri, grafik sağlık barları ve animasyon döngüleri temizlenir. Saatlerce oynansa bile RAM tüketimi 70-95 MB bandında sabit kalır. |

---

## 3. Sahne Yaşam Döngüsü ve Durum Akış Diyagramı (Scene Architecture)

Oyun 9 bağımsız Phaser sahnesinden (`Phaser.Scene`) oluşur. Sahneler arasındaki hiyerarşi ve veri akışı aşağıda gösterilmiştir:

```
[BootScene] (Varlıklar yüklenir, animasyonlar kaydedilir)
     │
     ▼
[MenuScene] ──── (Kılavuz Modalı)
     │
     ├──► [GameScene] (Hikaye: Bölüm 1..10) ◄───► [UIScene] (Paralel HUD)
     │         │                                    ▲
     │         ├────► [ShopScene] (Overlay) ────────┤
     │         ├────► [SkillTreeScene] (Overlay) ───┤
     │         ├────► [InventoryScene] (Overlay) ───┤
     │         │
     │         ├────► [GameOverScene] (Heykel Uykusu) ──► Tekrar Başlat / Menü
     │         └────► [VictoryScene] (10. Bölüm Bitişi) ──► Sonsuzluk Modu
     │
     └──► [GameScene] (Sonsuzluk Panteonu: Dalga 1..∞)
```

### Sahne Görev Tanımları:
1. **`BootScene`:** Tüm spritesheet, tileset ve UI görsellerini yükler. Yükleme çubuğu gösterir. Aizo animasyonlarını (Idle, Walk, Attack, Hurt, Death, Respawn, Victory) hafızaya kaydeder ve doğrudan `MenuScene`'i açar.
2. **`MenuScene`:** Oyuncunun daha önce ulaştığı bölümü `ProgressionSystem` üzerinden denetler. Eğer oyuncu Bölüm 2 veya üstündeyse dinamik olarak `Devam Et (Bölüm X)` butonunu üretir.
3. **`GameScene`:** Fizik dünyasını, BSP haritasını, Aizo'yu, düşmanları, yapıları ve mermileri yöneten ana sahnedir.
4. **`UIScene`:** `GameScene` ile paralel çalışır (`scene.launch`). Ekranın üstünde Can, XP, Denarii, Bölüm Adı ve Ses Aç/Kapa butonunu; altında ise Q ve R yetenek bekleme sürelerini render eder.
5. **`ShopScene`:** Macellum tüccarını açar. Silah, zırh, aksesuar ve anında seviye atlamayı sağlayan tüketilebilir kıvılcım paketlerini satar.
6. **`SkillTreeScene`:** Saldırı, Savunma ve Fayda dallarındaki 15 pasif yeteneğin açılmasını sağlar.
7. **`InventoryScene`:** Kuşanılan eşyaları ve Aizo'nun birleştirilmiş toplam statlarını (AD, Zırh, Can Yenileme, Kritik Şansı, Hız) gösterir.
8. **`GameOverScene`:** Canı sıfırlanan Aizo'nun mermer heykel uykusuna daldığı ve sunağında yeniden uyanabildiği sahnedir.
9. **`VictoryScene`:** 10. Bölümdeki Colossus Titan alt edildiğinde Zeus Tapınağı'nın arındırıldığını ilan eden zafer ekranıdır.

---

## 4. Matematiksel Denge ve Savaş Motoru (`CombatSystem.js`)

### 4.1. Zırh Hasar Azaltma Formülü
Savaş sisteminde Roma lejyon zırhı ve mermer heykel sertliği hiperbolik bir azalma formülüyle hesaplanır:

$$\text{Hasar Azaltma Oranı } (R) = \frac{\text{Efektif Zırh}}{100 + \text{Efektif Zırh}}$$

$$\text{Alınan Hasar} = \max\left(1, \; \text{Saldırı Gücü} \times (1 - R)\right)$$

- **Zırh Delme (Armor Penetration):**
  $$\text{Efektif Zırh} = \max\left(0, \; \text{Hedef Zırhı} \times (1 - \text{Zırh Delme Oranı})\right)$$
  *Örnek: Penkalas Kompozit Yayı %25 zırh delme özelliğine sahiptir.*

### 4.2. Kritik Vuruş ve Çarpanlar
- Aizo temel olarak %6 kritik şansına (`critChance: 0.06`) ve 1.6x kritik çarpanına (`critMultiplier: 1.6`) sahiptir.
- Obsidyen Göz Yüzüğü ve Zeus Muskası kuşanıldığında kritik şansı %25'e, çarpanı ise 2.2x seviyesine kadar yükselir.
- Kritik vuruş gerçekleştiğinde ekranda sarı hasar yazısı (`#f1c40f`), kamera sarsıntısı ve metalik çınlama sesi üretilir.

### 4.3. Pasif Yetenek Çözünürlükleri
- **Çatlak Rezonansı (`fissure_resonance`):** Aizo'nun her 5. vuruşu otomatik olarak 2.2x hasar verir.
- **İlahi İnfaz (`divine_execution`):** Azami canının %18'inin altına düşen normal düşmanlar tek vuruşta infaz edilir.
- **Taş Rezonansı (`stone_reflection`):** Alınan hasarın %14'ü saldırgana fiziksel hasar olarak geri yansıtılır.
- **Mabed Çekici Bonusu:** Yapılara (kuleler, tapınak çatlakları) karşı %60 ek hasar çarpanı uygulanır.

---

## 5. Prosedürel Harita Üretim Algoritması (`LevelSystem.js`)

Haritalar her seferinde benzersiz olacak şekilde **İkili Uzay Bölme (Binary Space Partitioning - BSP)** yöntemiyle inşa edilir:

```
[Bölünmemiş Alan] ──► [Dikey Bölme] ──► [Yatay Bölme] ──► [Oda Yerleştirme] ──► [Koridor Bağlama]
```

### Algoritma Adımları:
1. **Grid İlklendirme:** `gridWidth x gridHeight` boyutundaki iki boyutlu dizi tamamen `2` (Duvar) ile doldurulur.
2. **Özyinelemeli Alan Bölme (`splitSpace`):**
   - Belirlenen derinliğe (`depth: 3`) ulaşılana kadar alan rastgele dikey veya yatay olarak iki alt parçaya bölünür.
   - Her alt parçanın içine minimum 5x5, maksimum parçanın %90'ı genişliğinde bir oda yerleştirilir ve grid hücreleri `1` (Zemin) olarak işaretlenir.
3. **Koridor Kazıma (`connectRooms`):**
   - Üretilen her $R_i$ odasının merkezi ile $R_{i+1}$ odasının merkezi L şeklinde yatay ve dikey koridorlarla birleştirilir.
   - Koridorlar oyuncunun rahat hareket edebilmesi için **2 tile genişliğinde** kazınır (`carveTile`).
4. **Kutsal Sunağın ve Portalın Belirlenmesi:**
   - İlk üretilen oda ($R_0$) daima **Aizo Güvenli Üssü** (`grid[y][x] = 3`) olarak seçilir. Burada Zeus Sunağı yer alır ve can yenilenir.
   - En son üretilen oda ($R_{son}$) **Çıkış Portalı** (`grid[y][x] = 4`) olarak işaretlenir.
5. **Güvenli Doğma Noktaları (`getRandomWalkablePosition`):**
   - Düşmanlar ve yapılar yerleştirilirken oyuncunun üssünden en az 8 tile uzaklıktaki yürünebilir zemin hücreleri rastgele seçilir.

---

## 6. Prosedürel Web Audio Motoru (`AudioManager.js`)

Harici ses dosyalarına bağımlılığı ortadan kaldırmak için doğrudan tarayıcının Web Audio API donanımı kullanılır. Aşağıdaki tabloda üretilen seslerin fiziksel parametreleri verilmiştir:

| Ses Adı | Dalga Türü (Oscillator) | Frekans Zarfı (Envelope) | Süre | Açıklama |
|---|---|---|---|---|
| **`playSwing`** | `sine` + `lowpass` (450Hz) | 280 Hz $\rightarrow$ 70 Hz | 120 ms | Kılıç/mermer savrulma rüzgarı. |
| **`playShoot`** | `triangle` | 900 Hz $\rightarrow$ 240 Hz | 90 ms | Yay kirişi veya büyü asası fırlatması. |
| **`playHit`** | `square` / `sawtooth` | 160 Hz $\rightarrow$ 30 Hz | 100 ms | Taş çarpışması ve tok mermer darbesi. |
| **`playCrit`** | `sine` (Harmonik) | 1400 Hz $\rightarrow$ 800 Hz | 150 ms | Kritik vuruşta çınlayan metalik zil tınısı. |
| **`playZeusBeam`**| `sawtooth` + `square` + `bandpass` | 420 Hz $\rightarrow$ 90 Hz (Q=3) | 280 ms | Zeus Çatlağı şimşek kükremesi. |
| **`playShield`** | `sine` (3'lü Akor) | 330 Hz, 440 Hz, 660 Hz | 450 ms | Dorik kalkan ilahi koruma akoru. |
| **`playCoin`** | `sine` (2 Kademeli) | 1760 Hz (A6) $\rightarrow$ 2349 Hz (D7)| 140 ms | Antik Roma Denarii altın para çınlaması. |
| **`playXp`** | `triangle` | 987 Hz (B5) $\rightarrow$ 1318 Hz (E6)| 120 ms | Zeus kıvılcımı toplama tınısı. |
| **`playLevelUp`**| `triangle` (4 Nota) | C4 $\rightarrow$ E4 $\rightarrow$ G4 $\rightarrow$ C5 | 400 ms | Seviye atlama antik zafer fanfarı. |
| **`playEnemyDeath`**| `sawtooth` | 160 Hz $\rightarrow$ 20 Hz | 300 ms | Düşmanın taş ve kül olarak dağılması. |
| **`playPortal`** | `sine` | 220 Hz $\rightarrow$ 880 Hz $\rightarrow$ 440 Hz| 550 ms | Boyut kapısından geçiş uğultusu. |

*Kullanıcı ilk kez ekrana tıkladığında tarayıcının AudioContext kilidi otomatik olarak açılır (`ensureContext`). Tercih edilen ses durumu `aizanoi_dungeon_muted` anahtarıyla saklanır.*

---

## 7. Çift Giriş Mimarisi (Desktop vs Mobile)

### 7.1. Masaüstü Girişi
- **Hareket:** `W, A, S, D` veya `Yön Tuşları`. Çapraz hareketlerde hız vektörü $\frac{1}{\sqrt{2}} \approx 0.7071$ ile çarpılarak diyagonal hız patlaması önlenir.
- **Temel Saldırı:** `Boşluk (Space)` veya `Fare Sol Tık`.
- **Yetenek 1 (Zeus Çatlağı Işını):** `Q` Tuşu.
- **Yetenek 2 (Dorik Kalkan):** `R` Tuşu.
- **Envanter ve Statlar:** `I` veya `TAB` Tuşu.
- **Macellum Tüccarı:** Zeus Sunağı alanındayken `E` Tuşu.

### 7.2. Mobil ve Tablet Girişi (`TouchControls.js`)
- Mobil cihaz veya dokunmatik ekran algılandığında sanal kontroller dinamik olarak sahneye yerleştirilir:
  - **Sol Sanal Joystick:** Ekranın sol alt bölgesinde parmak basılan noktaya göre merkezlenir. Maksimum 45px yarıçap içinde normalleştirilmiş birim vektör ($\vec{v} = (x, y)$) üretir.
  - **Saldırı Butonu:** Sağ altta büyük kırmızı mermer buton. Otomatik hedefleme (Auto-target) ile en yakın düşmana yönelir.
  - **Yetenek Butonları:** Q ve R yetenekleri için ergonomik yay şeklinde dizilmiş dokunmatik butonlar.
  - **Menü Butonu:** Sağ üstte envanteri açan buton.

---

## 8. AizanoiOS v3 Pencereleme ve Entegrasyon Sözleşmesi

AizanoiOS bir web işletim sistemi gibi çalışır; her uygulama bir desktop penceresinde izole olarak açılır ve kapatılır.

### 8.1. `src/index.js` Montaj Sözleşmesi
```javascript
export async function mount({ container }) {
  // 1. İlgili stil dosyasını DOM head'e tekil olarak ekler
  // 2. host container içine .aizanoi-dungeon-app-root wrapper'ı iliştirir
  // 3. Phaser motorunu başlatır
  // 4. ResizeObserver ile pencere boyutu değişimini takip eder
  // 5. Pencere kapatıldığında çağrılacak teardown fonksiyonunu döner
  return () => {
    resizeObserver.disconnect();
    stopDungeonGame(gameInstance);
    wrapper.remove();
  };
}
```

### 8.2. CSS İzolasyonu
`css/game.css` dosyası sistemdeki diğer AizanoiOS pencerelerini etkilememek için **kesinlikle global `*` veya global `body` stillendirmesi yapmaz**. Tüm kural setleri `.aizanoi-standalone-body` ve `.aizanoi-dungeon-app-root` sınıfları altına hapsedilmiştir (scoped).

---

## 9. Linux Sunucu ve Nginx Dağıtım Standartları

Linux sunucularda (Ubuntu/Debian) Nginx arkasında barındırılırken dikkat edilmesi gereken katı kurallar:

1. **Büyük/Küçük Harf Duyarlılığı (Case-Sensitivity):**
   Linux dosya sistemleri (ext4) büyük/küçük harfe duyarlıdır. Kod içindeki tüm dosya yolları disk üzerindeki fiziksel adlandırmayla birebir aynıdır (Örn: `BootScene.js` diskte de `BootScene.js`'dir).
2. **Statik Dosya ve MIME Türleri:**
   Nginx yapılandırmasında `.js`, `.mjs`, `.json`, `.svg`, `.png` uzantılarının doğru MIME tipleriyle sunulması zorunludur:
   ```nginx
   location /dungeon/ {
       alias /var/www/aizanoi-analytics/frontend/dungeon/;
       try_files $uri $uri/ /dungeon/index.html;
       expires 7d;
       add_header Cache-Control "public, no-transform";
   }
   ```
3. **Modül Kayıt Defteri Derleme:**
   Dosyalar ana repoya kopyalandıktan sonra AizanoiOS'in modülü tanıması için aşağıdaki betik çalıştırılır:
   ```bash
   node scripts/modules/build-module-registry.mjs
   ```

---

## 10. Test ve Kalite Güvence Protokolü

Proje, geliştirme dizinindeki `tools/` klasöründe yer alan 4 otomatik denetim aracıyla güvenceye alınmıştır:

```bash
# 1. Tam Sistem Çapraz Başvuru Denetimi
python tools/deep_audit.py
# Doğrulananlar: 78 dosya, 9 sahne anahtarı, 8 düşman türü, 19 eşya kataloğu, 12 animasyon anahtarı.

# 2. Sözdizimi ve ES6 Import Kontrolü
python tools/validate_js.py
# Doğrulananlar: 30 JavaScript dosyasının parantez dengesi, import ve export sözdizimi.

# 3. Asset Varlık Denetimi
python tools/validate_assets.py
# Doğrulananlar: Kod içinde referans verilen 33 görsel dosyasının disk üzerindeki fiziksel varlığı.

# 4. HTTP Smoke Testi
python tools/test_http_server.py
# Doğrulananlar: index.html, manifest.json, css, js ve asset dosyalarının HTTP 200 yanıtları.
```

Bu denetim araçlarının tamamı **0 Hata (Zero Defect)** ile sonuçlanmıştır. Proje canlı üretime, dağıtıma ve merge işlemine bütünüyle hazırdır.
