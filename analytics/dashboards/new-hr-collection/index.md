# New HR Collection (working name)

Standalone HR analytics surfaces delivered as full-featured self-contained
HTML documents with embedded CSS/JavaScript and synthetic sample data.

| Dashboard | Public route | Source workbook (held-out) |
|---|---|---|
| Personnel Attendance Control System (PACS) | `/analytics/dashboards/new-hr-collection/pacs/` | `sources/pacs_sample_data.xlsx` |
| Recruitment Analytics Dashboard | `/analytics/dashboards/new-hr-collection/recruitment-analytics/` | `sources/ise_alim_dummy_data.xlsx` |

Data boundary

- Both dashboards embed only synthetic/fictional sample data generated for QA.
- No real employer, employee or applicant records are published.
- The workbook sources under `sources/` are versioned for provenance but are
  scrubbed from the public release by `scripts/deploy-public.sh` (denylisted
  `*.xlsx` except the declared HR Full Set synthetic output).
- The in-dashboard Excel loader parses visitor-provided files locally in the
  browser; nothing is uploaded to the server.

Delivery contract

- Public copies live under `frontend/analytics/dashboards/new-hr-collection/`.
- Route-scoped security headers reuse the narrow HR Analytics snippet
  (`infra/nginx/snippets/aizanoi-hr-analytics-security-headers.conf.example`);
  the rest of the site keeps the strict default CSP.
- Registration points: `frontend/analytics/catalog.js` (`new-hr-collection`
  set), `frontend/sitemap.xml`, and `infra/nginx/aizanoianalytics.com.conf.example`.

The collection name is a placeholder; renaming requires updating the catalog,
routes, sitemap, tests and the Nginx route together.
