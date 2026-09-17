# Harita Revizyonu — NOTLAR

- Tarih: 2026-09-16
- Durum: sürüyor
- İlgili alan: `frontend/worlds/*`, `frontend/labs/fly-world/`, `scripts/fly-world/`, `gelistirmeler/2026-09-16-fly-world-prototype/`

## Amaç (1-3 cümle)

4 tarihsel haritanın genişliğini yarıya indirmek, CC0 ücretsiz asset arşivi kurmak,
sesleri elden geçirmek, fly odalarını büyütüp eşya yerleşimini doğrulamak ve her fonksiyonu test etmek.

## Kapsam dışı

- `shared/` motoruna (audio.js hariç) dokunulmaz; kanıt seviyeleri, id'ler, kaynak linkleri değişmez.
- İndirilen assetler runtime'a bağlanmaz (mimari karar gerekir) — sadece arşiv + lisans.
- Görsel onay iddiası yok; sinek/connectome işi yok.

## Plan

1. Orijinalleri `yedek/<alan>/` altına al (git yok, geri dönüş için).
2. 4 dünyada x-eksenini yarıya indir (z ve y aynı).
3. CC0 assetleri `assetler/` altına indir + `LICENSES.md` yaz.
4. `audio.js` elden geçir (API uyumlu) + stub ile test.
5. Fly: `scene_spec.json` odaları büyüt, ilgili tüm dosyaları güncelle, yerleşim denetçisi yaz.
6. Doğrulama: `node --check`, `node --test`, veri tutarlılık scripti, sunucu smoke, manuel kontrol listesi.

## Durum günlüğü

- [2026-09-16] Klasör açıldı, plan yazıldı. Paralel kollar başlatıldı.
- [2026-09-16] 7 kol tamamlandı. Denetimde kritik bulgu: İGA'da ham+ölçek çift yarıya inmiş (0.25x),
  Rome/Athens'te mobilya literal+grup ölçeği çift inmiş (görsel 0.25x, çarpışma uyumsuz).
  Düzeltildi: yedekten geri yük + yalnız doğru değişiklikler yeniden uygulandı.
  Yan etki olarak mobilya çarpışmaları görsellerle hizalandı (orijinalde ~%19 kayıktı).
- [2026-09-16] 4 test beklentisi yeni ölçeğe güncellendi (ölçek sabitleri + eşikler yarıya).
- [2026-09-16] Fly art-pass: duvarla hareket etmeyen pencere/perde/kasa/saat/masa yeni duvarlara taşındı.
- [2026-09-17] BLENDER KURULDU + PIPELINE ÇALIŞTI:
  - `winget` ile Blender 5.2.1 LTS kuruldu (`C:\Program Files\Blender Foundation\Blender 5.2\`).
  - `python scripts/fly-world/run_pipeline.py --strict-assets` BAŞARILI (sıfır script
    değişikliği gerekti): `build/fly-house-v3.blend` (0.9 MB) + `build/fly-house-v3.glb`
    (3.16 MB) + 5 review PNG yenilendi + `frontend/labs/fly-world/assets/fly-house.glb`
    güncellendi. Yeni oda ölçüleriyle pişirildiği `01-reference-wide.png` ile gözle
    doğrulandı (divan/duvar, soba/baca, kapı kasası, mavi çanta etiketleri yerinde).
  - Üretim GLB yolu tarayıcıda doğrulandı: mode=glb, 414 mesh, 51.468 tri,
    56 collider root, ses bağlı (flyworld), 0 hata.
  - node --test: 475 pass / 10 fail (aynı 10 önceden-var hata, dokunulmayan alanlar).
- [2026-09-17] DERİN REVİZYON (2. tur):
  - Asset derlemesi: 9 dosya boyut/sha256/magic ile doğrulandı, lisanslar kaynaktan teyit
    edildi (AmbientCG + Poly Haven site geneli CC0), `assetler/ASSET_MANIFEST.json`
    yazıldı (4 dünya paketi; İGA paketi bilerek boş — allowlist'te modern havalimanı
    asseti yok). Runtime'a bağlanmadı (mimari karar + Blender gerekir).
  - Ses: ÖLÜ yataklar bulundu (conveyor üretilmeden sürülüyordu; flybuzz üretilip hiç
    sürülmüyordu; mill/chime/clock gain alanları ölüydü). `_setupConveyor` + `_setupRuin`
    eklendi, flybuzz flyworld'de sürülüyor, ölü alanlar silindi. Üretim yolu
    `glb-runtime-v3.js` tamamen SESSİZDİ (bootstrap GLB'yi seçiyor) — main-v3 ile aynı
    sözleşmeyle ses bağlandı. Smoke 89/89.
  - Tarayıcı: Playwright + headless Chromium kuruldu (node_modules gitignore'lı).
    6/6 rota: HTTP 200, WebGL var, 0 console/page error, Enter/intro/tur/teleport
    çalışıyor, ekran görüntüleri `ekran-goruntuleri/` altında. Atina giriş zamanlama
    yarışı ayrıca doğrulandı (buton geç beliriyor, tıklama sonrası modal kapanıyor).
  - Spawn incelemesi (Aizanoi): siyah duvanın tapınak köşesi yakın planı olduğu,
    geometrinin doğru çalıştığı (teleport/tur/yan adım kareleri sağlıklı), orijinal
    sürümle birebir karşılaştırılarak etkinin önceden-var tasarım + insan ölçeğinin
    sabit kalması olduğu kanıtlandı (`ekran-goruntuleri/aizanoi-ORIJINAL-spawn.png`
    karşılaştırma). Çeyrek-genişlik/çarpışma tutarsızlığı YOK (ölçek denetimi geçiyor).
  - Blender GLB pişirme YAPILAMADI (bu makinede Blender yok): `fly-house.glb` ve dünya
    kitleri genişleme öncesi ölçülerde kaldı; spec/test/fallback güncel. Blender olan
    makinede `run_pipeline.py --strict-assets` çalıştırılmalı.
  - node --test: 475 pass / 10 fail — 10'u da dokunulmayan alanlarda ve önceden var
    (deploy .sh ×5, nginx, dungeon path bug, markets python3, recruitment).

## Doğrulama

- `_harita-olcek-denetim.mjs`: 4 dünyada x/w oranı 0.50, z 1.00, teleport+tur id çözülüyor, BOUNDS dışı bina 0.
- `node --check`: tüm düzenlenen JS temiz. `py_compile`: detail_pass temiz.
- `node --test tests/*.test.mjs`: 475 pass, 10 fail — hepsi dokunulmayan alanlarda ve önceden var
  (deploy .sh ×5, nginx, dungeon path bug, markets python3, recruitment). Bağımsızlık grep ile kanıtlı.
- Sunucu smoke: 4 dünya + fly `/labs/fly-world/` → 200.
- Fly: validator OK (14/14 required), layout testi 7/7, yerleşim denetçisi 17/17 içerde.
- Ses: `_audio-smoke.mjs` 78/78. Assetler: 9 dosya ~18.7 MB + LICENSES.md.
