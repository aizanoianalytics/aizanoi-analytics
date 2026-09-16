# Hazır asset kaynakları (lisans-güvenli)

Kural: runtime'a giren her harici asset CC0 olmalı, kaynak + yazar + URL
`COPYING.assets` dosyasında belirtilmeli.

## Önerilen (CC0, optimize gerçekçi hedefe uygun)

1. Poly Haven — https://polyhaven.com
   - Textures: `Marble 02`, `Travertine`, `Sandstone`, `Terracotta Tiles`,
     `Cobblestone`, `Forest Floor` (2k JPEG, sRGB albedo + bump olarak kullan).
   - Models: `Roman Column`, `Marble Statue`, `Amphora`, `Market Stall`
     (quads, <10k tri olanları seç; Decimate değil, yazarın low varyantı).
   - HDRI: `Sunset` / `Midday` (Blender lookdev + ışık referansı için;
     runtime'a gömülmez — `environment.js` paleti referans alır).
2. Quicksand / AmbientCG — https://ambientcg.com (CC0, PBR setler)
   - `Stone Pavement`, `Plaster`, `Roof Tiles` — procedural canvas
     texture'ların yerine geçecek ilk adaylar.
3. Sketchfab — SADECE `CC0` filtreli olanlar. CC-BY/NC olanlar YASAK
   (atıf zinciri + ticari kısıt runtime sözleşmesini bozar).

## Yasak
- Turbosquid / CGTrader ücretli veya editoryal lisanslı modeller.
- Fotoğraf tabanlı纹理 kaynağı belirsiz Pinterest/ArtStation dump'ları.
- 4k+ texture (mobil DPR + SwiftShader bütçesini patlatır).

## Aizanoi-225 ilk alım listesi (hibrit faz 1)
- [ ] `travertine_2k` albedo+bump (tapınak podyumu, köprüler)
- [ ] `marble_02_2k` albedo (sütun şaftları, entablature)
- [ ] `terracotta_tiles_2k` (çatılar, portiko)
- [ ] `cobblestone_2k` (colonnaded street tabanı)
- [ ] `amphora_low` CC0 model ×3 varyant (agora/macellum dolgu)
- [ ] `roman_column_ionic_low` (oran referansı — builder ölçülerine kalibre et)
