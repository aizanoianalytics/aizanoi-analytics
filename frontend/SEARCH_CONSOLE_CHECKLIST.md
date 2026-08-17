# Aizanoi Analytics — Search Console Checklist

This is the manual part of SEO. Code-level SEO (titles, meta, canonical, sitemap, robots, structured data, redirects) is already in place. These steps must be performed from a browser by someone with access to Google Search Console for the domain.

---

## 0. State of play — what is already done

Before starting Search Console work, the following code-side signals are live on `https://aizanoianalytics.com/`:

- `<title>` and `<meta name="description">` change per route (Homepage, Aizanoi AI, Ancient World, Games, Projects, Videos, About, Changelog, Privacy, Terms, Docs).
- `<link rel="canonical">` set per route.
- OpenGraph + Twitter Cards on every route.
- JSON-LD WebSite + Organization schema on the Homepage.
- `https://aizanoianalytics.com/sitemap.xml` lists the 11 public routes (no `/ai/`, no `/market/`).
- `https://aizanoianalytics.com/robots.txt` allows `/`, blocks `/api/` and `/market/`, references sitemap.
- HTTP→HTTPS, www→non-www canonical redirects.
- `/ai/` returns 301 to `/hr-analytics/`.
- `/market/*` returns 410 Gone.
- Per-route fallback for unknown URLs shows a balloon "File Not Found" with a "Return to Desktop" link. (A real HTTP 404 page is not yet a separate HTML file — JS handler only.)

---

## 1. Add the property

1. Go to https://search.google.com/search-console/.
2. Property type: **Domain** (preferred — covers all subdomains/protocols).
3. Domain: `aizanoianalytics.com`.
4. Verify ownership via **DNS TXT record**. The verification string Google gives will look something like `google-site-verification=xxxxxxxxx`.
5. Add a CNAME or TXT record to the domain DNS provider. The exact record name and value will be shown in Search Console.
6. Wait for verification (usually a few minutes, sometimes up to 24 hours).

---

## 2. Submit the sitemap

1. Open Search Console → **aizanoianalytics.com** → **Sitemaps** (left menu).
2. Enter sitemap URL: `https://aizanoianalytics.com/sitemap.xml`.
3. Click **Submit**.
4. Status will show "Success" once Google fetches it (within a day).
5. Re-submit if you ever change the sitemap.

---

## 3. URL Inspection — request indexing for key pages

For each important page, use **URL Inspection** to ask Google to crawl it:

| URL                                 | Reason                                  |
|-------------------------------------|-----------------------------------------|
| `https://aizanoianalytics.com/`     | Homepage (most important)               |
| `https://aizanoianalytics.com/hr-analytics/` | Aizanoi AI canonical route |
| `https://aizanoianalytics.com/ancient-world/` | New flagship project      |
| `https://aizanoianalytics.com/projects/`       | Portfolio               |
| `https://aizanoianalytics.com/videos/`        | Aizanoi TV               |
| `https://aizanoianalytics.com/about/`          | Brand + About            |
| `https://aizanoianalytics.com/changelog/`      | System updates           |
| `https://aizanoianalytics.com/privacy/`        | Required for trust       |
| `https://aizanoianalytics.com/terms/`          | Required for trust       |

For each:
1. Paste the URL into the URL Inspection bar at the top.
2. If the URL is **not** in the index yet, click **Request Indexing**.
3. Google may report the URL is on Google but with a different title/description. That is expected — Google will pick up the new metadata over the next crawl cycle.

---

## 4. Watch the Pages report

1. Search Console → **Pages** (under Indexing).
2. Inspect:
   - Pages that are indexed and have valid canonical.
   - Pages with soft 404, redirect, not indexed, etc.
3. For each `/hr-analytics/`, `/ancient-world/`, etc., confirm Google eventually shows them as indexed with the new title and description.
4. **Note:** Google does not update title/description immediately. Expect a 2–6 week delay between submitting and seeing the new snippet in SERPs.

---

## 5. Watch the Coverage / Indexing reports

Check **Indexing → Pages** and **Indexing → Sitemaps** over the next 4–8 weeks:

- Confirm `https://aizanoianalytics.com/` is the indexed canonical (not `www.`, not `http://`).
- Confirm `/ai/` either redirects or disappears (the 301 will register as a redirect over time).
- Confirm `/market/*` shows as **Soft 404 → Excluded** or **Crawled – not indexed** because of the 410. Eventually those old URLs should drop out of the index entirely.

---

## 6. Legacy Google index (from the previous server)

The old server was wiped and rebuilt. Some old URLs may still be cached in Google's index. We are not maintaining a 301 chain for them — they have no real equivalent now.

Recommended actions:

1. **Search Console → Removals → Temporary Removals** → use the **Outdated Content** tool to drop stale URLs (e.g. previous homepage, old `/market/` paths, anything from the old site).
2. Each request is valid for 6 months.
3. There is **no one-to-one redirect map** for old URLs. Adding redirects for URLs we no longer use would be misleading; instead let Google drop them via the 410 and removal tool.

---

## 7. YouTube setup (when channel opens)

When the Aizanoi Analytics YouTube channel is live:

1. Add the channel URL into the codebase:
   - Open `frontend/index.html` in the repository or the deployed website.
   - Find the Aizanoi TV window body.
   - Replace the placeholder "Subscribe" text with the actual channel URL (`https://www.youtube.com/@aizanoi` or whatever the handle is).
2. Update `frontend/IMPLEMENTATION_REPORT.md` and `frontend/pages/changelog.json` with the change.
3. Add the YouTube channel to the JSON-LD Organization `sameAs` field on the homepage. After change, no-cache-bust the page (`?v=…`) and re-request indexing.
4. (Optional, later) Replace the static "Coming Soon" with embedded videos via lazy iframe (thumbnail → click → iframe).

---

## 8. Re-crawl frequency

Search Console → **Settings → Crawl rate**. Default is fine; do not increase unless you observe crawling issues.

---

## 9. Quick reference — where the SEO lives in code

| What                  | File                                                                                                  |
|-----------------------|--------------------------------------------------------------------------------------------------------|
| Per-route title/desc  | `index.html` → `updateMetaForRoute()`                                                                  |
| Sitemap               | `frontend/sitemap.xml`                                                                                 |
| Robots                | `frontend/robots.txt`                                                                                 |
| JSON-LD               | `index.html` → `<script type="application/ld+json">` in `<head>`                                       |
| Canonical             | `index.html` → `updateMetaForRoute()` (sets `link[rel="canonical"]` href)                              |
| HR / People system prompt | `backend/server.js` → `SYSTEM_PROMPT`                                                |
| HTTP redirects        | Deployment configuration (outside this public repository)                                               |

---

## 10. What to do if Google does not pick up new titles

- Wait at least 2 weeks. Google is slow on title/description refresh.
- Make sure the page is **not** blocked by `robots.txt` or a `<meta name="robots" content="noindex">` tag.
- Confirm canonical points to the same URL you are inspecting in Search Console.
- If Google keeps showing the old title after 6 weeks, file a reconsideration request in Search Console.