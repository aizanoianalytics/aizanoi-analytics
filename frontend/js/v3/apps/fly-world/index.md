# Fly World Modülü

> **Amaç:** Fly House ghost-observer deneyiminin (`/labs/fly-world/`) AizanoiOS v3 masaüstünde fullscreen app olarak açılması. Gelecekteki sinek simülasyonunun kullanıcıya açılan ana yüzü olacak; bu modül yalnızca ortamı gösterir, fly/connectome runtime içermez.

---

## 1. Kararlı Kimlik (Stable Identity)

- **Ürün Adı:** Fly World
- **Kararlı Modül Kimliği (App ID):** `fly-world`
- **Genel Çalışma Girişi (Runtime Entry):** `src/index.js`
- **Manifest Yolu:** `manifest.json` (`manifestVersion: 1`, `type: "desktop-app"`)
- **Bağımsız (Standalone) Web Girişi:** `/labs/fly-world/index.html`
- **Masaüstü & Favicon İkonu:** `assets/icons/fly-world.svg`

---

## 2. Bildirilen Yetenekler (Declared Capabilities)

- **Gereksinimler (`requires`):** `[]` (Sıfır dış yetenek bağımlılığı).

## 3. Pencere Davranışı

- Registry'de `fullscreen:true` — Dungeon ile aynı fullscreen yüzeyde açılır.
- İçerik, `/labs/fly-world/` sayfasını gösteren tam-boy iframe'dir (`allow="pointer-lock; fullscreen"`).
- Esc, iframe içinde pointer-lock çıkışına aittir; app'i kapatmaz.
- Kapatma: iframe `about:blank`'e alınır ve kaldırılır; yeniden açılış temiz başlar.
- Aynı app ikinci kez açılmak istenirse mevcut shell davranışı uygulanır (odaklanır, ikinci örnek açılmaz).
