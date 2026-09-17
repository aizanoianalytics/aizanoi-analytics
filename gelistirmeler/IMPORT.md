# IMPORT — Sunucudaki ajana içe aktarma talimatı

Tarih: 2026-09-17. Kaynak makine: Windows, `C:\Users\husey\aizanoi-analytics` (git yok, ZIP kurulum).
Bu paket iki kısımdan oluşur:

```text
gelistirmeler/                  # çalışma bağlamı (aşağıdaki İSTİSNA ile tam kopya)
degisen-repo-dosyalari/         # repo köküne göreli yollarla değişen ürün dosyaları
```

## Kapsam dışı (BİLEREK zip'te YOK)

- `gelistirmeler/yerel-kurulum/` — kaynak makineye özel güncelleyici (içinde `C:\Users\husey`
  sabit yolları, Windows `.bat` dosyaları var). Proje kuralı gereği asla commitlenmez/
  gönderilmez (bkz. `gelistirmeler/AGENTS.md` kural 3, `.gitignore` YEREL bloğu).
  Hedef makinede gerekiyorsa sıfırdan, o makinenin yollarıyla kurulur.
- `node_modules/`, Playwright tarayıcıları — hedefte `npm i` + `npx playwright install` ile kurulur.

## İçe aktarma adımları (sırayla)

1. Hedef repo'nun TEMİZ bir kopyasını al (tercihen git commit/sha not et, geri dönüş noktan olsun).
2. `degisen-repo-dosyalari/` içindeki her dosyayı repo kökünden başlayarak AYNI yola kopyala
   (üzerine yaz). Liste eksiksizdir; kısmi kopyalama TUTARSIZLIK yaratır (özellikle
   `scene_spec.json` + `tests/fly-world-layout.test.mjs` + `frontend/labs/fly-world/*`
   bir bütündür; `city-data` + `main.js` + `builders.js` üçlüleri bir bütündür).
3. `gelistirmeler/` klasörünü hedef repodaki `gelistirmeler/` ile BİRLEŞTİR:
   - `2026-09-16-harita-revizyonu/` → olduğu gibi al (çalışma notları, yedekler, denetim
     scriptleri, asset arşivi, ekran görüntüleri).
   - `2026-09-16-fly-world-prototype/` → DİKKAT: bunun `scene_spec.json`, `review/*.png`,
     `build/*` dosyaları BU PAKETTE DEĞİŞTİRİLDİ (oda genişletme + Blender yeniden pişirme).
     Hedefteki aynı dosyaların üzerine yaz (bu, istenen iştir), ama önce hedefteki hallerini
     yedekle. Klasördeki diğer dosyalara dokunma.
   - `README.md`, `AGENTS.md`, `YENI-CALISMA-SABLONU.md`, bu `IMPORT.md` → olduğu gibi al.
   - `yerel-kurulum/` → OLUŞTURMA (yukarıdaki kapsam dışına bak).
4. Doğrulama (hedef repo kökünden, sırayla):
   ```bash
   node --check frontend/worlds/shared/engine/audio.js
   node --check frontend/labs/fly-world/glb-runtime-v3.js
   python scripts/fly-world/validate_project.py --strict-assets
   node --test tests/fly-world-layout.test.mjs tests/aizanoi-iga-compact-layout.test.mjs tests/classical-world-compact.test.mjs tests/worlds-wave2-systems.test.mjs tests/worlds-mobile-controls.test.mjs tests/worlds-intro-input.test.mjs
   node gelistirmeler/2026-09-16-harita-revizyonu/_harita-olcek-denetim.mjs
   node gelistirmeler/2026-09-16-harita-revizyonu/_fly-yerlesim-denetim.mjs
   node gelistirmeler/2026-09-16-harita-revizyonu/_audio-smoke.mjs
   ```
   Hepsi yeşil olmalı. Ardından tam süit: `node --test tests/*.test.mjs`
   (bilinen 10 önceden-var hata: deploy .sh ×5, nginx, dungeon path, markets python3,
   recruitment — Windows/Linux farkları, bu işle ilgisiz).
5. Tarayıcı duman testi (opsiyonel ama önerilir): `python -m http.server 4173 --directory frontend`
   + `node gelistirmeler/2026-09-16-harita-revizyonu/_tarayici-duman.mjs`
   (önce `npm i --no-save playwright@1.62.1` + `npx playwright install --only-shell chromium`).

## Hedef makine gereksinimleri

- Node.js ≥ 22, Python 3.x, statik dosya sunucusu.
- Blender (SADECE yeni GLB pişirme gerekiyorsa): `python scripts/fly-world/run_pipeline.py --strict-assets`
  (bu paketteki GLB'ler güncel, yeniden pişirme gerekmez).

## Bu paket ne içerir (özet)

- 4 dünyanın x-ekseni yarı genişliği (0.50x, z/y aynı), kanıt/id/kaynak korunarak.
- Ses motoru: konveyör + harabe uğultusu yatakları, flybuzz sürüşü, ölü alan temizliği;
  üretim yolu `glb-runtime-v3.js` ses bağlantısı.
- Fly House oda genişletme (9.6×8.0 + 5.0×6.2) + Blender 5.2.1 ile yeniden pişmiş GLB/renderlar.
- CC0 staging asset arşivi (`assetler/` + `ASSET_MANIFEST.json`, runtime'a bağlı DEĞİL).
- Orijinal dosya yedekleri (`2026-09-16-harita-revizyonu/yedek/`), denetim scriptleri,
  tarayıcı ekran görüntüleri, NOTLAR.md durum günlüğü.
