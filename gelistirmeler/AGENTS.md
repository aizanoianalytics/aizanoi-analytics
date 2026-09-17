# gelistirmeler — Agent Kuralları

Bu klasörde çalışırken önce buradaki `README.md`'yi, sonra repo kökündeki `AGENTS.md`'yi oku.
Kök ürün koduna (`frontend/`, `scripts/`, `content/`...) dokunacaksan kök `AGENTS.md` ve ilgili
sözleşmeler (`PRODUCT.md`, `CONTENT_POLICY.md`, `DESIGN.md`, `ARCHITECTURE.md`, `SECURITY.md`) zorunludur.

## Kurallar

1. **Her iş kendi klasöründe.** Yeni işe `YYYY-MM-DD-kisa-ad/` klasörü aç, `YENI-CALISMA-SABLONU.md` şablonunu kullan.
   Başka bir çalışmanın klasörüne yazma.
2. **Kökü kirletme.** Deneme/not/araç dosyalarını repo köküne koyma; ait olduğu çalışma klasörüne koy.
3. **`yerel-kurulum/` özeldir.** Bu bilgisayara özel güncelleyici ve başlatıcılar burada durur.
   - Silme, taşıma, yeniden adlandırma. Kısayollar ve dokümanlar bu yola bağlıdır.
   - Güncelleyici repo güncellemesinde bu klasörü korur; yine de elle yedek almadan büyük oynama.
   - `.gitignore` kapsamındadır — commit'e eklemeyi önerme, `git add` içine katma.
4. **Upstream klasörlere dokunma** (`2026-09-16-fly-world-prototype/` gibi) — sahibi/kararı olmadan değiştirme.
5. **"Yenileme yap" komutu** gelirse onay sormadan şunu çalıştır:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\husey\aizanoi-analytics\gelistirmeler\yerel-kurulum\Aizanoi-Guncelle.ps1" -Yes
   ```

   Sonucu ve `guncelleme.log`'daki son satırları özetle.
6. **Sırları asla yazma.** Token, parola, özel anahtar, kişisel veri — hiçbir çalışma klasörüne girmez (kök `AGENTS.md` kural 1).
7. **Doğrula, sonra bitir.** İlgili testi/komutu çalıştır (örn. güncelleyicide `-CheckOnly`, üründe `AGENTS.md`'deki Validation listesi).
   Yapılmamış doğrulamayı yapılmış gibi yazma (kök `AGENTS.md` kural 12).
