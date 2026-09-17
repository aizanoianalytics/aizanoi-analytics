# gelistirmeler — Çalışma Alanı

Bu klasör, bu repo üzerinde **yaptığımız ve yapacağımız tüm çalışmaların** toplandığı yerdir.
Repo kökündeki ürün kodu (`frontend/`, `scripts/`, `content/`...) ile karışmasın diye her iş kendi klasöründe yürür.

## Yapı

```text
gelistirmeler/
├── README.md                  # bu dosya: klasörün kılavuzu
├── AGENTS.md                  # bu klasörde çalışanlar (insan + AI) için kurallar
├── YENI-CALISMA-SABLONU.md    # yeni çalışma klasörü açarken kullanılacak şablon
├── 2026-09-16-fly-world-prototype/  # upstream'den gelen prototip (örnek, dokunma)
└── yerel-kurulum/             # BU BİLGİSAYARA ÖZEL: güncelleyici + başlatıcılar
    ├── Aizanoi-Guncelle.ps1   # asıl güncelleyici scripti
    ├── Guncelle.bat           # çift tıkla güncelle
    ├── Baslat.bat             # çift tıkla yerel önizleme
    ├── README.md              # güncelleyici kılavuzu
    ├── .last-update.json      # son güncelleme durumu (otomatik)
    └── guncelleme.log         # log (otomatik)
```

## İki tür çalışma vardır

1. **Upstream işler** (`YYYY-MM-DD-kisa-ad/`): Repo'nun kendi düzenine uygun, tari *hli prototip/deneme klasörleri.
   Örnek: `2026-09-16-fly-world-prototype/`. Bunlar ileride GitHub'a gönderilebilir niteliktedir.
2. **Yerel işler** (`yerel-kurulum/`): Sadece bu bilgisayara özel araçlar (Windows `.bat`, `C:\Users\husey` yolu içerir).
   **Asla GitHub'a gönderilmez** — `.gitignore` ile kapalıdır. Güncelleyici, repo güncellemelerinde bu klasöre dokunmaz
   (üzerine kopyalama yapar ama silmez; emniyet için ayrıca yedekler ve geri yükler).

## Yeni çalışma açma

1. `YENI-CALISMA-SABLONU.md` dosyasını kopyala, `YYYY-MM-DD-kisa-ad/` ismiyle yeni klasör aç.
   (Bugünün işleri için örnek: `2026-09-16-yerel-guncelleyici/`.)
2. Klasörün içindeki `NOTLAR.md` dosyasına amaç + plan + durum yaz.
3. Bitince durumu güncelle, doğrula.

## Güncelleme ("yenileme yap")

- Çift tık: `yerel-kurulum/Guncelle.bat` (veya masaüstündeki `Aizanoi Guncelle` kısayolu).
- Bana **"yenileme yap"** yazman da yeterli; ben şunu çalıştırırım:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\husey\aizanoi-analytics\gelistirmeler\yerel-kurulum\Aizanoi-Guncelle.ps1" -Yes
```

Detay: [`yerel-kurulum/README.md`](yerel-kurulum/README.md)
