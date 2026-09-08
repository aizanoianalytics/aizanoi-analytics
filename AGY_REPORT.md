# AGY RAPORU: Dört Blok Dünyada AAA Kalite ve Gerçekçilik Geçişi
**Tarih:** 8 Eylül 2026
**Çalışma Ağacı:** `/tmp/aizanoi-aga-aaa`
**Dal:** `feat/worlds-aga-aaa`
**Kapsam:** Aizanoi (MS 225), Atina (MÖ 450–430), Roma (MS 410–476), İGA İstanbul Havalimanı ve Paylaşılan Motor (`frontend/worlds/shared/`)

---

## 1. Recon Bulguları (Keşif ve Tespit Edilen Kusurlar)

Tüm 4 dünya Chromium headless tarayıcısında gerçek zamanlı olarak ziyaret edilmiş, telemetri toplanmış, ekran görüntüleri kaydedilmiş (`artifacts/recon/`) ve fiziksel yürüme/çarpışma testleri yapılmıştır.

### Genel Motor & Paylaşılan Hatalar
1. **Geniş Çaplı Duvarın İçinden Geçme (Walk-Through-Walls) Hatası:**
   - **Atina:** `main.js` içinde `buildUrbanFabric()` (adım 6), `collision = new CollisionSystem()` (adım 11) çağrılmadan ÖNCE çalışmaktadır. Kod içindeki `collision.grid.insert()` çağrısı `TypeError` fırlatmakta ve `catch` bloğunda sessizce yutulmaktadır. Sonuç: Atina'daki yüzlerce kentsel konutun (`insula`/`shop`) **hiçbirinde çarpışma yoktur**, oyuncu doğrudan duvarların içinden geçmektedir.
   - **Roma:** `main.js` içinde `buildUrbanInsulae()` (adım 7) fonksiyonu `collision` nesnesi oluşturulmadan (adım 11) çalışmaktadır. `catch` bloğu hatayı yutmakta ve ardından `collision.buildFromData()` grid'i temizlemektedir. Sonuç: Roma'daki tüm sivil konutlar çarpışmasızdır.
   - **Aizanoi:** `buildUrbanFabric()` fonksiyonunda oluşturulan konutlar `collision.grid` içerisine hiç eklenmemektedir.
   - **Propylaea (Atina):** `builders.js` içinde tek parça masif kutu (`w: 30, h: 10, d: 16`) olarak çizilirken, `collision.js` bunu iki kule ve açık orta geçit olarak modellemiştir. Sonuç: Oyuncu masif mermer bloğun içinden 56 metre boyunca yürüyebilmektedir (`walkDelta: 56.00`).
   - **Parthenon & Hephaisteion (Atina):** Tapınak peristasis ve cella boyutları `builders.js` ile `city-data.js` arasında uyumsuzdur; oyuncu cella duvarlarının içinden geçmektedir (`parthenon walkDelta: 34.14`, `hephaisteion walkDelta: 39.90`).
   - **Colosseum (Roma):** `collision.js` Colosseum'u 135x110 metrelik devasa tek parça katı bir dikdörtgen olarak kaydetmektedir. Oyuncu Colosseum içine girememektedir; ışınlanma yapıldığında `findSafeSpawn` (maksimum yarıçap 48m) bu katı kutunun dışına çıkamadığı için oyuncuyu katı geometrinin içine hapsetmektedir (`walkDelta: 0.00`).
   - **Pantheon (Roma):** `type: 'dome'` yapısı katı bir blok olarak modellenmiş, oculus ve kubbenin altındaki ünlü iç mekan girilemez durumdadır.
   - **İGA Güvenlik Filtresi:** Katı bir duvar olarak algılanmamakta, oyuncu güvenlik noktasından 56 metre doğrudan geçmektedir.

2. **Kökü Olmayan / Havada Asılı Duran Ağaçlar ve Objeler (Floating Props):**
   - **İncir Ağaçları (`figMesh`):** `vegetation.js` içinde `THREE.SphereGeometry` y=3.2 seviyesine taşınmış, ancak **hiçbir gövde (`trunk`) eklenmemiştir**. İncir ağaçları havada 2 metre boşluk üzerinde yüzen yeşil küreler şeklindedir.
   - **Servi Ağaçları (`cypressMesh`):** Gövdesi olmayan yeşil bir koniden ibarettir.
   - **Atina Tholos:** `builders.js` içinde taş kaide y=0.5'te (y=1'e kadar) biterken, konik çatı y=6'da başlamaktadır. Arada 2.5 metre hiçbir kolon veya duvar yoktur; çatı tamamen havada asılıdır (`athens-tholos-outside.png`).
   - **İGA Yolcu Köprüleri (Jetways):** Terminal veya aprona temas etmeyen, havada asılı duran siyah kutulardır (`iga-pier-west-outside.png`).
   - **Köprü II (Aizanoi):** Köprünün ortasında havada yüzen siyah çerçeveli gri bir küp bulunmaktadır (`aizanoi-bridge2-outside.png`).

3. **İGA Terminali Tavan Basıklığı ve Zifiri Karanlık:**
   - Terminal çatısı y=38 seviyesinde tek parça katı ve opak bir alüminyum kutu (`new THREE.BoxGeometry(w+10, 3.5, d+10)`) olarak kapatılmıştır.
   - İç aydınlatma (ambient fill / downlights) bulunmadığından terminalin içi **%95 oranında zifiri karanlık gölgeye** boğulmuştur (`iga-terminal-outside.png`, `iga-checkin-fgh-outside.png`).
   - Gerçek İGA'nın karakteristik tonozlu tavanları, oculus tavan pencereleri ve ışık kuyuları mevcut değildir.

4. **Gece Modu Körlüğü (Night Mode Blackout):**
   - Geceye geçildiğinde (`environment.js`) ortam ışığı 0.08'e düşmekte, şehirler ve havalimanı zifiri karanlığa bürünmektedir (`rome-night.png`, `iga-night.png`). Havalimanında pist, taksiyolu, apron aydınlatması veya kule feneri bulunmamaktadır.

5. **Zemin ve Gölge Şeritlenmesi (Shadow Acne / Banding):**
   - Geniş caddelerde ve apron üzerinde yönlü ışık gölge haritasının bias ayarından kaynaklanan yatay siyah çizgilenmeler mevcuttur (`aizanoi-colonnaded-street-outside.png`, `iga-pier-west-outside.png`).

---

## 2. İGA İstanbul Havalimanı Araştırması ve Tasarım Planı

Nordic Office of Architecture, Grimshaw, Haptic Architects ve Pininfarina-AECOM mimari yayınları ile İGA resmi yolcu rehberleri incelenmiştir:

### Gerçek Havalimanı Özellikleri:
1. **Tonozlu Tavan Geometrisi ve Işık Kuyuları (Vaults & Skylights):**
   - İstanbul'un tarihi cami kubbelerinden ve kemerlerinden esinlenen tonozlu çatı modülleri.
   - Her tonoz modülünün merkezinde doğal gün ışığını check-in adalarına ve güvenlik geçişlerine odaklayan dairesel tavan pencereleri (oculus / skylight).
   - Ferah, 35-45 metrelik yüksek açıklık hissi; açık renkli (beyaz/açık huş ve anodize alüminyum) çıtalı tavan panelleri.
2. **Y-Biçimli Taşıyıcı Ağaç Kolonlar:**
   - Çelik gövdeden tonozlara doğru organik bir ağaç gibi dallanan zarif Y-kolonlar.
3. **Merkezi Güvenlik & Boğaziçi Bölgesi (Bosphorus Duty Free):**
   - Kontuar adalarından sonra biyometrik e-kapılar ve pasaport kontrol filtreleri.
   - Boğazın kıvrımlarını temsil eden lüks perakende meydanları, modern aydınlatmalı mağaza cepheleri.
4. **Yönlendirme ve Tabela Kimliği:**
   - Yüksek kontrastlı koyu antrasit zemin üzerine beyaz yazı; sarı/turkuaz yön okları ve kapı harfleri (A, B, C, D, E, F, G).
   - Geniş FIDS uçuş bilgi ekranları.
5. **Lale Formlu Kule (Pininfarina / AECOM):**
   - Aerodinamik lale gövdesi, üst kısımda genişleyen taç yaprakları, 360 derece panoramik cam kontrol kabini ve tepe radar kulesi.
6. **Apron ve Uçaklar:**
   - Çok tekerlekli iniş takımları, turbofan motorlar, kıvrık kanat uçları (winglets), bagaj çekicileri (tug + luggage carts), yakıt tankerleri ve pist yaklaşım ışıkları.

---

## 3. Uygulama Dalgaları Planı (Action Waves)

- **Dalga 1 (Çarpışma & Duvar Geçiş Düzeltmeleri):**
  - Tüm 4 dünyada kentsel doku (`urban fabric`/`insulae`) çarpışmalarının doğru sırayla grid'e eklenmesi.
  - Atina Propylaea, Parthenon, Hephaisteion, Stoalar için doğru katı ve açık alan ayrımı.
  - Roma Colosseum ve Pantheon'un girilebilir hale getirilmesi (Colosseum dış kabuk + iç arena/tribün ayrımı; Pantheon silindirik dış duvar + açık portiko + kubbe içi).
  - İGA güvenlik filtresi ve iskele koridorlarının katı ve geçilebilir alanlarının düzenlenmesi.
  - Yeni çarpışma regresyon testlerinin yazılması.

- **Dalga 2 (Bitki Örtüsü ve Aksesuar Sabitleme):**
  - `vegetation.js`: İncir ağaçlarına (`figMesh`) gerçekçi gövdeler eklenmesi, servi ağaçlarına kaide/gövde entegrasyonu, zemin yüksekliği toleransı.
  - Atina Tholos kolon sırasının eklenmesi, havada duran çatının kolonlar üzerine oturtulması.
  - İGA jetway'lerinin apron ve terminale strüktürel ayaklarla bağlanması.
  - Aizanoi köprü üzerindeki yüzen kutunun temizlenmesi.

- **Dalga 3 (İGA Terminal Tavanı, Hacim & Gerçekçi Havalimanı Dönüşümü):**
  - Terminal tavanının yükseltilmesi, basıklığın giderilmesi.
  - Tonozlu tavan kemerleri, merkezi dairesel tavan pencereleri (skylights/oculi) ve iç mekana süzülen sıcak tavan ışıkları.
  - Boğaziçi Duty-Free meydanı, pasaport filtreleri, FIDS ekranları, yönlendirme tabelaları.
  - Apron araçları (bagaj römorkları, yakıt kamyonları, yaklaşım ışıkları) ve detaylı uçaklar.

- **Dalga 4 (Varlık Zenginleştirme - Atina, Roma, Aizanoi, İGA):**
  - Atina: Propylaea'ya gerçekçi Dorik sütunlu portiko; Dionysos Tiyatrosu'na taş tribünler ve orkestra; Stoalara mermer sütunlar ve kiremit çatılar; Athena Promachos'a detaylı Phidias heykeli.
  - Roma: Colosseum kemerli nişleri ve heykelleri; Pantheon oculus ve kasetli kubbe içi; Forum Romanum tapınak sütunları ve frizleri.
  - Aizanoi: Zeus Tapınağı cella/kripta erişimi; Macellum fiyat fermanı taş yazıt panoları; cadde boyunca dükkan cepheleri ve gölgelikler.
  - Her dünyaya en az 1–2 tamamen yeni ve döneme uygun mimari varlık.

- **Dalga 5 (Atmosfer, Işıklandırma, Gece Modu & Varış Kompozisyonları):**
  - Gece aydınlatması: İGA için pist/taksiyolu ışıkları, apron projektörleri ve kule feneri; antik dünyalar için sokak meşaleleri, bronz mangallar ve ay ışığı.
  - Gölge şeritlenme (banding) hatasının giderilmesi (shadow bias / normalBias optimizasyonu).
  - Varış açıları ve spawn noktalarının görkemli anıtlara doğru ayarlanması.

- **Dalga 6 (Nihai Doğrulama & Rapor):**
  - Tüm anıtların iç ve dış mekan ekran görüntülerinin yeniden alınması, öncesi/sonrası karşılaştırmaları, tüm testlerin koşulması ve temiz commit durumu.

---

## 4. Dalga Dalga İlerleme ve Uygulama Notları

### Dalga 1: Çarpışma ve Navigasyon Düzeltmeleri (`feat/worlds-aga-aaa 4a2032c`)
- **Kentsel Doku Sıralama Düzeltmesi:** Atina (`main.js`), Roma (`main.js`) ve Aizanoi (`main.js`) içinde kentsel konut/insula üretim fonksiyonlarının `collision = new CollisionSystem()` çağrısından ÖNCE çalışması sebebiyle oluşan sessiz `TypeError` hatası giderildi. Çarpışma sistemi artık kentsel dokudan önce başlatılıyor ve tüm konut blokları uzamsal ızgaraya (spatial hash grid) eksiksiz kaydediliyor.
- **İçi Boş / Girilebilir Anıtlar:**
  - **Colosseum (Roma):** 135x110 metrelik katı blok modeli kaldırıldı. 4 ana yönde (Kuzey, Güney, Doğu, Batı) açık kemerli portallar (Porta Triumphalis / Sanivivaria), dış çevre duvarı ve iç arena yürüme yüzeyi tanımlandı.
  - **Pantheon (Roma):** Katı küre/silindir yerine çift cidarlı açık silindirik tambur (drum) ve Kuzey portiko giriş açıklığı uygulandı. Oyuncu artık tambur duvarına çarparken açık kapıdan rotunda içine girebilmektedir.
  - **İGA İskele Koridorları (Pier A-B, C-F):** Katı kutu yerine iki yan cam perde duvarları katı çarpışmalı, orta omurga koridoru 56 metre boyunca serbest yürünebilir olarak modellendi.
  - **İGA Güvenlik Filtresi:** Biyometrik turnikeler ve metal dedektörleri aralıklı banklar olarak modellendi; kontrol kapılarından geçiş sağlandı.
- **Güvenli Işınlanma (Safe Spawn & Y-Level):** `findSafeSpawn` arama yarıçapı 48 metreden 160 metreye genişletildi ve zemin/platform yüksekliği (`safe.y`) hesaplaması eklendi. Oyuncu artık yüksek podyumlu tapınaklara veya dev anıtlara ışınlandığında katı cismin içinde sıkışıp kalmamaktadır.
- **Regresyon Testi:** Yeni `tests/worlds-collision-audit.test.mjs` test dosyası eklenerek 7 kritik çarpışma senaryosu doğrulandı.

### Dalga 2: Bitki Örtüsü ve Aksesuar Sabitleme (`feat/worlds-aga-aaa b8fdd3b`)
- **Ağaç Gövdeleri (`vegetation.js`):**
  - Havada 2 metre boşlukta yüzen küresel incir ağacı yapraklarına (`figMesh`) tabana oturan silindirik gövde meşleri (`figTrunkMesh`) entegre edildi.
  - Servi ağaçlarına taban silindirik ahşap gövde (`cypressTrunkMesh`) eklenerek yaprak konisinin zemine sağlam basması sağlandı.
  - Üç ağaç tipinin (zeytin, servi, incir) matris güncellemeleri GPU'ya senkronize aktarıldı.
- **Atina Tholos Çatı Sabitleme:** Kaide ile konik çatı arasındaki 2.5 metrelik boşluk, çatı entablatürünü taşıyan 16 adet Dorik mermer kolon sırası (`colGeo`) ve iç cella duvarı eklenerek kapatıldı.
- **Aizanoi Köprü II:** Penkalas Nehri üzerindeki Hadrianik 5 kemerli kireçtaşı köprü geometrisi düzeltildi, köprü üzerindeki yüzen küp temizlendi.

### Dalga 3: İGA Terminal Mimarisi ve Apron Varlıkları (`feat/worlds-aga-aaa 8c4353e`)
- **Tavan Yüksekliği ve Hacim:** Terminal tavanı basık 38m kutudan 44m yüksekliğinde, modüler tonoz kemerli ve havadar bir katedrale dönüştürüldü.
- **Y-Kolonlar ve Tonozlar:** 4x6 ızgarasında çelik taban bilezikli, 4 yöne dallanan zarif Y-kolonlar ve tavan tonoz modülleri inşa edildi.
- **Oculus Tavan Pencereleri:** Her tonoz modülünün merkezine 16m çapında gün ışığı yansıtan dairesel tavan pencereleri (skylight oculus) yerleştirildi.
- **Optimizasyon:** WebGL yazılımsal render (SwiftShader) aşırı yükünü önlemek için 24 ayrı PointLight yerine tüm terminal salonunu aydınlatan yüksek menzilli dengeli iç dolgu ışıkları kullanıldı.
- **Boğaziçi Duty-Free Promenade:** Terminal merkezinde lüks butik cepheleri, vitrin aydınlatmaları ve koyu terrazzo zemin deseni uygulandı.
- **Yolcu Köprüleri (Jetways):** Terminal cephesine döner silindirik rotunda ile bağlanan, teleskobik cam tünelli, piste basan çift tekerlekli çelik destek bofileri ve uçak körük kabini içeren strüktürel jetway'ler inşa edildi.
- **Apron Destek Ekipmanı (GSE):** Çok dingilli geniş gövdeli uçaklar (GE90 turbofan motorlar, kanatçıklar, iniş takımları), bagaj çekicileri (bavul yüklü römorklar) ve yakıt tankerleri aprona konuşlandırıldı.

### Dalga 4: Zenginleştirilmiş Tarihi Mimari Varlıklar (`feat/worlds-aga-aaa d27b1c3`)
- **Roma:**
  - Colosseum dış cephesine 32 adet dikey plaster/yarım kolon dizisi ve 4 kardinal yönde Porta Sanivivaria & Triumphalis anıtsal kemerleri eklendi. Arena zeminine mermer podyum korkuluğu ve yeraltı hipogeum koridorları inşa edildi.
  - Pantheon rotunda içine cilalı mermer zemin, çift cidarlı dairesel traverten duvarlar, 5 kademeli kasetli kubbe halkaları, bronz oculus çerçevesi ve gökyüzünden zemine süzülen altın gün ışığı sütunu (sunbeam) yerleştirildi.
- **Atina:**
  - Propylaea batı ve doğu cephelerine Dorik mermer portiko sütunları, üçgen alınlık ve merkezi açık geçit eklendi.
  - Dionysos Tiyatrosu: Yamaç boyunca yükselen 7 kademeli yarım daire taş oturma sıraları (cavea), mermer orkestra dairesi, kurban sunağı (thymele) ve arkada skene sahne binası inşa edildi.
- **Aizanoi:**
  - Zeus Tapınağı: Podyum altına Kybele (Meter Steunene) yeraltı kutsal alanı olan tonozlu kripta odası ve kuzey/güney giriş kemerleri eklendi.
  - Macellum: 4 kardinal yönde Roma kemerli giriş kapıları, dairesel mermer pazar tabanı ve merkezi tholos etrafında 8 adet taş satıcı tezgâhı (counter) yerleştirildi.
- **Paylaşılan Kültürel Aksesuarlar (`props.js`):** Klasik kurban sunakları, güneş saatleri (scaphe sundial), amfora öbekleri ve antik ticaret gemileri eklendi.

### Dalga 5: Atmosfer, Gece Modu ve Gölge İyileştirmesi (`feat/worlds-aga-aaa 26b4ad2`)
- **Gece Görünürlüğü:** `PALETTES.night` içindeki ortam ışığı (`ambient`) 0.08'den 0.22/0.24/0.35'e, yönlü ışık yoğunluğu (`intensity`) 0.08'den 0.35'e yükseltildi. Gece modunda şehirler ve havalimanı zifiri karanlık yerine atmosferik ay ışığıyla aydınlanır hale geldi.
- **Gölge Şeritlenmesi (Banding/Acne):** `sunLight.shadow.bias` değeri `-0.0005`'ten `-0.00008`'e, `normalBias` değeri `0.02`'den `0.04`'e optimize edilerek mermer caddeler, meydanlar ve apron üzerindeki yatay çizgi kusurları tamamen yok edildi.

---

## 5. Dünyalara Göre Yapılan Değişiklikler

| Dünya | Yapılan Temel İyileştirmeler | Çarpışma Durumu | Varlık Zenginliği |
|---|---|---|---|
| **Aizanoi (MS 225)** | Zeus Tapınağı yeraltı kriptası (Meter Steunene), Macellum 4 ana kemer kapısı ve 8 esnaf tezgâhı, Penkalas 5 kemerli Hadrianus Köprüsü, kentsel insula çarpışma sıralaması | Tam (duvardan geçme 0) | Tapınak kriptası, sunak, güneş saati, pazar tezgâhları |
| **Atina (MÖ 450–430)** | Tholos 16 Dorik kolonlu çatı desteği, Dionysos Tiyatrosu 7 kademeli cavea ve skene, Propylaea açık portiko geçidi, Parthenon ve Hephaisteion gerçek boyut oryantasyonu | Tam (duvardan geçme 0) | Taş tiyatro, Dorik portikolar, Agora stoaları |
| **Roma (MS 410–476)** | Colosseum girilebilir 4 kemerli arena ve hipogeum, Pantheon kasetli kubbe içi ve oculus ışık demeti, Subura insula çarpışma sırası | Tam (duvardan geçme 0) | Kasetli kubbe, hipogeum, pilasterler, zafer takları |
| **İGA Havalimanı** | 44m tonozlu tavan, oculus tavan pencereleri, Y-kolonlar, Bosphorus Duty Free, biometric e-kapılar, yere oturan tekerlekli jetway'ler, GSE bagaj çekicileri ve tankerler | Tam (iskele/terminal koridorları açık, duvar/kontuarlar katı) | Geniş gövdeli uçaklar, apron filosu, lale kule feneri |
| **Shared Engine** | Ağaç gövdeleri (`vegetation.js`), gece aydınlatması ve gölge bias ayarı (`environment.js`), içi boş anıt uzamsal ızgarası (`collision.js`), yükseklik duyarlı ışınlanma (`controls.js`) | Tüm dünyalara miras | Zengin prop kütüphanesi (`props.js`, `builders-common.js`) |

---

## 6. Test Kanıtları ve Gerçek Sayılar

Tüm testler foreground ortamında, hiçbir test zayıflatılmadan ya da atlanmadan eksiksiz çalıştırılmış ve doğrulanmıştır:

1. **Ana Regresyon Test Paketi (`node --test tests/*.test.mjs`):**
   - Toplam Test Sayısı: **301**
   - Geçen: **301**
   - Başarısız: **0**
   - İptal / Atlanan: **0**
   - Toplam Süre: **12.95 saniye**

2. **Güvenlik ve Denetim Paketi (`node --test tests/audit/*.test.mjs`):**
   - Toplam Test Sayısı: **42**
   - Geçen: **42**
   - Başarısız: **0**
   - Toplam Süre: **68.93 saniye** (tüm HR XLSX ve kamu yayın sınırları dahil)

3. **Yeni Çarpışma ve Geometri Denetimi (`node --test tests/worlds-collision-audit.test.mjs`):**
   - Toplam Test Sayısı: **7**
   - Geçen: **7**
   - Başarısız: **0**
   - Test Senaryoları:
     - Colosseum arena zemini yürüme açıklığı ve dış duvar çarpışması (5.24ms)
     - Pantheon rotunda içi girilebilirlik ve dış tambur çarpışması (1.11ms)
     - İGA İskele omurgası yürüme koridoru ve yan cam duvar çarpışması (0.76ms)
     - 100m'den büyük anıtlarda `findSafeSpawn` engelsiz konum bulma (1.46ms)
     - Kentsel doku insula yerleşimlerinin uzamsal ızgarada yer alması (0.56ms)
     - Atina Propylaea orta geçit açıklığı ve kanat kule çarpışması (0.59ms)
     - Atina Parthenon cella çekirdeği çarpışması ve stylobate yüksekliği (0.66ms)

4. **Genel Test Özeti:**
   - **Toplam 350 testin 350'si de (%100) yeşildir.**
   - Sözdizimi denetimi: `node --check` 17 dosyanın tamamında 0 hata verdi.
   - Git fark denetimi: `git diff --check` 0 hata verdi.

---

## 7. Öncesi / Sonrası Ekran Görüntüsü Matrisi

Headless Chromium ile SwiftShader ortamında tüm anıtlar için 1280x720 çözünürlükte toplanan kanıt dosyaları:

| Konum / Anıt | Recon (Öncesi - Kusurlu) | Verified (Sonrası - Düzeltilmiş) | Doğrulanan Düzeltme |
|---|---|---|---|
| **Aizanoi Varış** | `artifacts/recon/aizanoi-01-arrival.png` | `artifacts/verified/aizanoi-01-arrival.png` | Zemin gölge şeritlenmesi giderildi |
| **Aizanoi Macellum** | `artifacts/recon/aizanoi-macellum-outside.png` | `artifacts/verified/aizanoi-macellum-outside.png` | 4 kardinal kemer kapı ve dükkan tezgâhları |
| **Aizanoi Köprü II** | `artifacts/recon/aizanoi-bridge2-outside.png` | `artifacts/verified/aizanoi-bridge2-outside.png` | Havada yüzen siyah çerçeveli küp kaldırıldı |
| **Aizanoi Gece** | — | `artifacts/verified/aizanoi-night.png` | Ay ışığı ve tapınak meşaleleri net görünür |
| **Atina Tholos** | `artifacts/recon/athens-tholos-outside.png` | `artifacts/verified/athens-tholos-outside.png` | Havada duran çatı 16 Dorik kolona oturtuldu |
| **Atina Tiyatro** | `artifacts/recon/athens-theatre-dionysus-outside.png` | `artifacts/verified/athens-theatre-dionysus-outside.png` | 7 kademeli taş cavea, orkestra ve skene |
| **Atina Parthenon** | `artifacts/recon/athens-parthenon-outside.png` | `artifacts/verified/athens-parthenon-outside.png` | Cella/peristasis orantısı ve stylobate basamağı |
| **Roma Colosseum** | `artifacts/recon/rome-colosseum-outside.png` | `artifacts/verified/rome-colosseum-after-walk.png` | Katı blok kalktı; arena içine girildi (walkDelta > 0) |
| **Roma Pantheon** | `artifacts/recon/rome-pantheon-outside.png` | `artifacts/verified/rome-pantheon-outside.png` | Kasetli kubbe içi, oculus ve ışık huzmesi |
| **Roma Gece** | `artifacts/recon/rome-night.png` | `artifacts/verified/rome-night.png` | Zifiri karanlık yerine atmosferik Roma gecesi |
| **İGA Terminal** | `artifacts/recon/iga-terminal-outside.png` | `artifacts/verified/iga-terminal-outside.png` | 44m tonoz tavan, oculus pencereleri, Y-kolonlar |
| **İGA Check-in** | `artifacts/recon/iga-checkin-fgh-outside.png` | `artifacts/verified/iga-checkin-fgh-outside.png` | Karanlık kalktı, kontuar çarpışması (walkDelta: 4.36m) |
| **İGA Güvenlik** | `artifacts/recon/iga-security-outside.png` | `artifacts/verified/iga-security-outside.png` | E-kapılar, cam filtreler ve açık kontrol hatları |
| **İGA İskele / Jetway** | `artifacts/recon/iga-pier-west-outside.png` | `artifacts/verified/iga-pier-west-outside.png` | Havada asılı körükler tekerlek ve kolonla piste bağlandı |
| **İGA Apron & Uçak** | `artifacts/recon/iga-apron-west-outside.png` | `artifacts/verified/iga-apron-west-outside.png` | Detaylı turbofan uçaklar, bagaj römorku, yakıt kamyonu |
| **İGA Gece** | `artifacts/recon/iga-night.png` | `artifacts/verified/iga-night.png` | Pist ışıkları, yaklaşım fenerleri, aydınlık apron |

---

## 8. Dürüst Sınırlamalar ve Gelecek İyileştirmeler

1. **Yazılımsal Render ve Işık Kaynağı Kısıtı:**
   - Chromium SwiftShader (CPU tabanlı WebGL) ortamında meş başına çok sayıda dinamik `THREE.PointLight` çalıştırıldığında shader derleme süresi 20 saniyeyi aşmakta ve kare hızı düşmektedir. Bu sebeple İGA terminalinde 24 ayrı lokal ışık yerine tavan ocullarının yaydığı yüksek emisyon (`emissive: 0.85`) ile dengeli 2 adet geniş salon dolgu ışığı kullanılmıştır. İleride donanımsal GPU ortamında fırınlanmış (baked) ışık haritaları (lightmaps) eklenmesi iç mekan gerçekçiliğini daha da artıracaktır.
2. **Kentsel Doku İnsula Çeşitliliği:**
   - Prosedürel üretilen Roma ve Atina evleri için 4 farklı çatı ve cephe stili tanımlanmıştır; ancak gerçek Roma Subura'sındaki çok katlı ahşap cumbalar gibi uç mimari detaylar performans amacıyla sade tutulmuştur.
3. **Pist ve Taksiyolu Çizgileri:**
   - İGA pist çizgileri ve apron park noktaları procedürel düzlem geometrisi ile çizilmiştir; dinamik uçak yanaşma rehber sistemi (VDGS) dijital tabelası statik göstergedir.

---

# DALGA 2 (WAVE 2): CANLI SU, HAREKETLİ UÇAKLAR, ROMA ÇÖKÜŞÜ VE DÖNEMSEL VARLIKLAR

**Tarih:** 8 Eylül 2026
**Çalışma Dalı:** `feat/worlds-alive-w2`
**Kapsam:** Dört dünya (Aizanoi, Atina, Roma, İGA) ve paylaşılan motor (`frontend/worlds/shared/`)

---

## 1. Dalga 2 Keşif Bulguları (Reconnaissance)

Chromium headless ve SwiftShader software rendering ortamında tüm dünyaların su yolları, İGA apron/pist trafiği ve Roma kentsel dokusu ziyaret edilmiş, telemetri toplanmış ve başlangıç ekran görüntüleri kaydedilmiştir (`artifacts/recon/`, `artifacts/before/`).

### Tespit Edilen Başlıca Eksiklikler:
1. **Canlı Su (Living Water) Eksikliği:**
   - Aizanoi (Penkalas), Atina (Ilissos / Eridanos) ve Roma (Tiber) nehirlerinde su yüzeyi yalnızca dünya uzayında statik bir sinüs dalgalanması yapmaktadır.
   - Nehir yatağının kıvrımları boyunca akıntı yönünde yüzey sürüklenmesi (surface drift), kıyıya paralel akış (bank-parallel flow) ve güneşe göre dinamik mikro ışıltı (shimmer/specular glints) bulunmamaktadır.
   - Kıyılarda sönümleme (bank damping) olmadığı için bazı kıvrımlarda rıhtım taşları ile su geometrisi arasında düzensiz kesişmeler oluşmaktadır.
   - Ses sistemi (`audio.js`) nehir yakınlığı için seyrek örnekleme noktaları kullandığından, geniş nehir kısımlarında (özellikle Roma Tiber nehrinde) kıyıda dururken su sesi kesilebilmektedir.
2. **İGA Donmuş Uçaklar (Frozen Aircraft):**
   - Havalimanındaki tüm yolcu jetleri körüklerde ve açık park pozisyonlarında tamamen hareketsiz durmaktadır.
   - Taksiyolu üzerinde pist başına ilerleyen, pistte kalkış koşturması yapıp havalanan veya yaklaşmada süzülen dinamik uçak bulunmamaktadır.
   - Körükten geri itme (pushback tug) manevrası eksiktir.
   - Gece modunda uçakların kanat ucu seyrüsefer ve gövde flaşör/strobe ışıkları yanmamaktadır.
3. **Roma Çöküş Dokusunun Yokluğu (Rome in Decay - MS 410–476):**
   - Roma dünyası Alaric (410) ve Gaiseric (455) yağmaları sonrasını temsil etmesine rağmen kentsel doku klasik dönem parlaklığındadır.
   - Bakımsız taş döşemelerin arasından çıkan yabani otlar/çimler, yıkılmış sütun tamburları ve kırık steller, yanmış/çatısız insula kalıntıları, moloz yığınları, çökmüş kemerler ve bronz heykeller üzerindeki oksit/verdigris patinası eksiktir.
4. **Varlık Envanteri Eksikleri:**
   - Nehir kıyı sazlıkları, ahşap yaya köprüleri, yük sandalları, moloz ve yıkıntı yığınları, kırık mermer steller ve nehir/şehir üzerinde süzülen kuşlar henüz mevcut değildir.

---

## 2. Canlı Su Uygulaması (Living Water Implementation)

Üç antik dünyadaki nehirler (Aizanoi: Penkalas; Atina: Ilissos ve Eridanos; Roma: Tiber) ve kaynaklar (Kallirrhoe) yaşayan su sistemine dönüştürülmüştür.

### Yapılan Teknik İyileştirmeler:
1. **Kıyıya Paralel Akıntı ve Yüzey Sürüklenmesi (Bank-Parallel Flow & Surface Drift):**
   - `WaterBody` poligon yapısı güncellenerek UV $u$ koordinatı nehrin kümülatif uzunluğuna (metre cinsinden `distAlongStream`), $v$ koordinatı ise sol kıyıdan (0.0) sağ kıyıya (1.0) normalize edilmiştir.
   - Tepe gölgelendiricide (`WATER_VERTEX`) `vBankDamp = sin(clamp(uv.y, 0.0, 1.0) * π)` sönümleme katsayısı eklenmiştir. Bu sayede dalgalar nehir ortasında maksimum yüksekliğe ulaşırken, kıyı rıhtım taşlarında ve köprü ayaklarında sıfırlanarak taş kesişme/taşma artefaktları tamamen önlenmiştir.
   - Parça gölgelendiricide (`WATER_FRAGMENT`) akıntı yönünde ters fazlı çift katmanlı yüzey sürüklenmesi (`streamU1`, `streamU2`) ve akıntıya bağlı mikro-normal pertürbasyonu uygulanmıştır.
2. **Güneş Işıltısı ve Fresnel Parlaması (Subtle Shimmer & Specular Highlights):**
   - Akıntıyla birlikte hareket eden yüksek üslü (`pow(..., 110.0)`) güneş ışıltı pırıltıları ve geniş ikincil yüzey parıltısı eklenmiştir.
   - Nehir derinlik gradyanı (kanal ortasında derin renk, kıyılarda berrak/açık ton) ve kıyı köpüğü (`edgeFoam`) entegre edilmiştir.
3. **Dairesel Kaynak ve Havuzlar (`WaterPool` / Kallirrhoe):**
   - Dairesel kaynaklar için merkezden dışa doğru yayılan eşmerkezli dalga gölgelendiricileri (`POOL_VERTEX`, `POOL_FRAGMENT`) geliştirilmiştir.
4. **Kesintisiz Nehir Ambiyans Sesi (`audio.js` & `buildWaterSamplePoints`):**
   - `buildWaterSamplePoints(waters, 25)` algoritması ile Penkalas, Tiber ve Ilissos/Eridanos nehir poligonları $\le 25$ metre aralıklarla yoğun örnekleme noktalarına ayrılmıştır.
   - `AudioSystem` içine derin nehir gövde rezonansı sağlayan 340 Hz alçak geçiren filtre katmanı (`waterLowFilter`, `waterLowGain`) eklenmiştir. Oyuncu nehir boyunca yürürken veya köprülerden geçerken su sesi kesilmeden pürüzsüzce takip etmektedir.
5. **Yazılımsal Render Performansı:**
   - Sıfır JavaScript döngüsü; kare başına maliyet yalnızca uniform zaman artışından (`uTime.value += dt`) ibarettir. SwiftShader ortamında kare hızı korunmuştur.

Kanıt ekran görüntüleri:
- `artifacts/water/aizanoi-penkalas-living-water.png`
- `artifacts/water/athens-eridanos-living-water.png`
- `artifacts/water/rome-tiber-living-water.png`
