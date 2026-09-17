# CC0 Asset Arşivi — Lisans Tablosu

Klasör: `gelistirmeler/2026-09-16-harita-revizyonu/assetler/` (staging — runtime'a bağlı DEĞİL)
Tarih: 2026-09-16
Kaynak kısıtı: Yalnızca `frontend/worlds/tools/blender/ASSET_SOURCES.md` allowlist'i
(Poly Haven + AmbientCG). Tümü CC0. NC/ND/editoryal/belirsiz lisans YOK.
İndirme aracı: `C:\Windows\System32\curl.exe -L --retry 3` (Invoke-WebRequest kullanılmadı).

## Dosyalar

| filename | source URL | author | license | retrieved | intended use (world/material) |
|---|---|---|---|---|---|
| Travertine001_2K-JPG_Color.jpg | https://ambientcg.com/view?id=Travertine001 (zip: https://ambientcg.com/get?file=Travertine001_2K-JPG.zip, içinden yalnızca orijinal isimli Color JPG alındı) | ambientCG (Lennart Demes) | CC0 | 2026-09-16 | aizanoi-225 + rome-410-476 — traverten: tapınak podyumu, köprüler (ilk alım listesi: `travertine_2k`) |
| Marble001_2K-JPG_Color.jpg | https://ambientcg.com/view?id=Marble001 (zip: https://ambientcg.com/get?file=Marble001_2K-JPG.zip, içinden yalnızca Color JPG) | ambientCG (Lennart Demes) | CC0 | 2026-09-16 | athens-450-430 + aizanoi-225 — mermer albedo: sütun şaftları, entablature (ilk alım listesi: `marble_02_2k` karşılığı) |
| RoofingTiles006_2K-JPG_Color.jpg | https://ambientcg.com/view?id=RoofingTiles006 (zip: https://ambientcg.com/get?file=RoofingTiles006_2K-JPG.zip, içinden yalnızca Color JPG) | ambientCG (Lennart Demes) | CC0 | 2026-09-16 | rome-410-476 + aizanoi-225 — pişmiş toprak çatı kiremiti: çatılar, portiko (ilk alım listesi: `terracotta_tiles_2k`) |
| PavingStones001_2K-JPG_Color.jpg | https://ambientcg.com/view?id=PavingStones001 (zip: https://ambientcg.com/get?file=PavingStones001_2K-JPG.zip, içinden yalnızca Color JPG) | ambientCG (Lennart Demes) | CC0 | 2026-09-16 | aizanoi-225 + rome-410-476 — taş döşeme: sütunlu cadde tabanı (ilk alım listesi: `cobblestone_2k`) |
| Plaster001_2K-JPG_Color.jpg | https://ambientcg.com/view?id=Plaster001 (zip: https://ambientcg.com/get?file=Plaster001_2K-JPG.zip, içinden yalnızca Color JPG) | ambientCG (Lennart Demes) | CC0 | 2026-09-16 | athens-450-430 + agora yapıları — duvar sıvası |
| Wood001_2K-JPG_Color.jpg | https://ambientcg.com/view?id=Wood001 (zip: https://ambientcg.com/get?file=Wood001_2K-JPG.zip, içinden yalnızca Color JPG) | ambientCG (Lennart Demes) | CC0 | 2026-09-16 | tüm dünyalar — ahşap: kiriş, pazar tezgâhı, kapı |
| ceramic_pot_1k.fbx | https://polyhaven.com/a/ceramic_pot (dosya: https://dl.polyhaven.org/file/ph-assets/Models/fbx/1k/ceramic_pot/ceramic_pot_1k.fbx) | Aron Łyczek | CC0 | 2026-09-16 | agora/macellum dolgu — amphora benzeri kap (ilk alım listesi: `amphora_low` karşılığı, 3,6k tri) |
| planter_pot_clay_1k.fbx | https://polyhaven.com/a/planter_pot_clay (dosya: https://dl.polyhaven.org/file/ph-assets/Models/fbx/1k/planter_pot_clay/planter_pot_clay_1k.fbx) | Amal Kumar | CC0 | 2026-09-16 | sokak/agora dolgu — terracotta saksı (3k tri) |
| antique_ceramic_vase_01_1k.fbx | https://polyhaven.com/a/antique_ceramic_vase_01 (dosya: https://dl.polyhaven.org/file/ph-assets/Models/fbx/1k/antique_ceramic_vase_01/antique_ceramic_vase_01_1k.fbx) | James Ray Cock | CC0 | 2026-09-16 | villa/iç mekân dekor — antik seramik vazo (9k tri) |

## Doğrulama (2026-09-16)

- Tüm dosyalar `size > 0`.
- 6× JPG: ilk baytlar `FF D8 FF E0` (JPEG/JFIF) ✔
- 3× FBX: ilk baytlar `4B 61 79 64 61 72 61 20` = ASCII `Kaydara ` (FBX binary başlığı) ✔
  (Görevdeki GLB sihri `glTF` bu sette yok; alt-seçenekte FBX'e izin veriliyor — bkz. not 3.)
- Toplam: 19.641.777 bayt ≈ **18,7 MB** (bütçe ~60 MB altında).

## Notlar — başarısız kaynaklar ve alternatifler

1. `api.polyhaven.org/files` → HTTP 522 (API çalışmıyor). Alternatif: sayfa gömülü
   `__NEXT_DATA__` JSON'undaki `dl.polyhaven.org` dosya URL'leri + AmbientCG
   `api/v2/downloads_csv` kullanıldı. Her iki alan da allowlist içinde.
2. Poly Haven'da `travertine` dokusu yok (katalogda slug bulunamadı). Alternatif:
   AmbientCG `Travertine001` (CC0) kullanıldı.
3. Poly Haven modellerde tek dosya GLB sunmuyor (yalnızca `.gltf`+`.bin` split,
   `.fbx`, `.blend`). Görevin izin verdiği yedek kullanıldı: 1k `.fbx`
   (her biri < 0,25 MB, limit ~5 MB). GLB aranması belgelendi, bulunamadı.
4. AmbientCG 3D kataloğu yalnızca yiyecek (ekmek/meyve) içeriyor (34 model) —
   tarihi dünyalara uymuyor. Alternatif: Poly Haven kap/vazo prop'ları (CC0).
5. 6 malzemenin 2K full-PBR ZIP setleri toplam ~127 MB → 60 MB bütçeyi aşıyor.
   Bu yüzden ZIP'ler geçici `_dl/` klasörüne indirilip içlerinden yalnızca
   orijinal isimli `*_Color.jpg` (2K albedo) `assetler/` köküne alındı, ZIP ve
   diğer haritalar silindi, `_dl/` kaldırıldı. Nihai arşiv ≈ 18,7 MB.
6. Sketchfab/Turbosquid/CGTrader/Pinterest/ArtStation dump'larına
   dokunulmadı (ASSET_SOURCES.md yasağı).
7. `frontend/`, `scripts/`, oyun kodu değiştirilmedi. Yazım yalnızca bu
   `assetler/` klasörü + bu dosya ile sınırlı.
