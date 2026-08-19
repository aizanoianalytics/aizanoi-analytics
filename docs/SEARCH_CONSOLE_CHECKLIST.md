# Aizanoi Analytics — Search Console Checklist

This document covers the **manual account-side SEO work** that cannot be completed from repository code alone.

Current public product identity is centered on Aizanoi Analytics, the Aizanoi Field System and Historical Worlds. The removed public AI product should not be treated as a current landing-page target.

## Before submitting to search engines

Verify the live production site, not only repository source:

- `https://aizanoianalytics.com/` loads successfully;
- HTTPS and canonical host redirects are correct;
- `https://aizanoianalytics.com/robots.txt` is reachable;
- `https://aizanoianalytics.com/sitemap.xml` is reachable;
- key historical-world routes return real `200` responses;
- retired/unknown routes return the intended redirect/410/404 behavior;
- page title, description, canonical and social-preview metadata reflect the current product.

### Repository SEO cleanup note

At the time this checklist was refreshed, the repository sitemap still contains a historical `/hr-analytics/` entry from the removed public AI product.

That is a **separate production/runtime SEO cleanup**, not a reason to restore the old AI route. Before the next sitemap deployment, remove retired product URLs and make the sitemap reflect only intentional current public routes.

## 1. Add the Google Search Console property

1. Open Google Search Console.
2. Prefer a **Domain** property for `aizanoianalytics.com`.
3. Complete the DNS verification challenge shown by Google through the domain's DNS provider.
4. Do not commit verification secrets or unrelated DNS credentials to this repository.

## 2. Submit the sitemap

After the live sitemap has been reviewed for current routes:

```text
https://aizanoianalytics.com/sitemap.xml
```

Submit it from **Indexing → Sitemaps**.

Re-submit after meaningful sitemap structure changes.

## 3. Inspect the important public pages

Prioritize the pages that represent the current project:

```text
https://aizanoianalytics.com/
https://aizanoianalytics.com/historic-world/
https://aizanoianalytics.com/ancient-cities/rome-410-476/
https://aizanoianalytics.com/ancient-cities/athens-450-430/
https://aizanoianalytics.com/projects/
https://aizanoianalytics.com/games/
https://aizanoianalytics.com/videos/
https://aizanoianalytics.com/about/
https://aizanoianalytics.com/docs/
```

For each important URL:

1. Use **URL Inspection**.
2. Confirm Google sees the intended canonical URL.
3. Request indexing when the URL is new or materially changed.
4. Do not repeatedly request indexing for unchanged pages.

## 4. Watch indexing quality

In the **Pages / Indexing** reports, watch for:

- accidental soft 404s;
- incorrect canonicals;
- retired URLs remaining indexed;
- important worlds marked crawled-but-not-indexed;
- redirects that still reference removed product areas;
- `www` / HTTP variants competing with the canonical HTTPS host.

A removed route should disappear through correct HTTP behavior, not by being reintroduced simply because an old index entry exists.

## 5. Retired / legacy URLs

If Google still shows old Aizanoi pages that no longer have a meaningful current equivalent:

- preserve truthful `404` / `410` behavior where appropriate;
- use a `301` only when there is a genuine replacement page;
- use Search Console removal tools when a temporary faster de-indexing request is useful;
- do not redirect unrelated retired pages to the homepage merely to avoid a 404.

The removed AI and Markets surfaces must not be resurrected solely for SEO continuity.

## 6. Historical Worlds

For Aizanoi, Rome and Athens, verify that each public world has:

- a unique title and description;
- a self-referencing canonical URL;
- useful visible explanatory text around the experience where appropriate;
- crawlable research/methodology context where the product exposes it;
- no accidental `noindex`;
- working mobile access.

The primary SEO value should come from distinct historical content and research context, not keyword duplication.

## 7. Social preview

The repository contains the Aizanoi social-preview asset:

```text
frontend/assets/branding/aizanoi-og.png
```

When checking production sharing behavior, verify the live page emits the intended Open Graph / Twitter metadata and that the image URL is publicly fetchable.

## 8. YouTube / Aizanoi TV

When the public channel exists:

- add the real channel URL to the relevant product surface;
- update structured/social metadata only where it accurately represents the official project account;
- add published video pages/links to the sitemap only when they are meaningful public routes;
- request indexing after the live production change is verified.

Do not add placeholder channel URLs or fake feeds.

## 9. Measure before adding SEO architecture

Do not introduce server rendering, route prerendering or a large framework solely because the site is a client-side application.

First measure:

- Search Console indexing behavior;
- actual search impressions/clicks;
- Lighthouse/HTML crawlability;
- whether historical-world content is discoverable as intended.

A heavier architecture should solve a demonstrated problem.

## 10. Code locations

| Signal | Repository location |
|---|---|
| Main shell metadata | `frontend/index.html` + Field System metadata bridge |
| Sitemap | `frontend/sitemap.xml` |
| Robots | `frontend/robots.txt` |
| Social-preview asset | `frontend/assets/branding/aizanoi-og.png` |
| Historical world pages | `frontend/historic-world/`, `frontend/ancient-cities/` |
| Production routing example | `infra/nginx/` |

Production Nginx and DNS configuration remain outside this public repository; verify live behavior before changing operational settings.
