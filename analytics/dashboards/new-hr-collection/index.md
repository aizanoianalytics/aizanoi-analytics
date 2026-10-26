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
  scrubbed from the public release by `scripts/deploy-public.sh`. Production
  rejects **every** `.xlsx`; no public spreadsheet is published, so a
  deliberate allow-list entry would have to be re-added rather than assumed.
- The in-dashboard Excel loader parses visitor-provided files locally in the
  browser; nothing is uploaded to the server.

Delivery contract

- Public copies live under `frontend/analytics/dashboards/new-hr-collection/`.
- Route-scoped security headers use the narrow self-contained-dashboard
  snippet
  (`infra/nginx/snippets/aizanoi-self-contained-dashboard-security-headers.conf.example`),
  which permits the embedded inline CSS/JS these self-contained exports need;
  the rest of the site keeps the strict default CSP.
- Registration points: `frontend/analytics/catalog.js` (`new-hr-collection`
  set), `frontend/sitemap.xml`, and `infra/nginx/aizanoianalytics.com.conf.example`.

Build / canonical ownership

- The Recruitment `index.html` is the hand-authored canonical portable application,
  including the owner's report, calendar, themes and browser-local import flows.
  There is no legacy `production-pipeline` or full-HR regeneration job for this collection.
- `python3 scripts/hr/embed-recruitment-dummy-data.py` updates only its embedded
  requisition payload from the committed synthetic workbook. Run it twice and
  `--check` after changes; never put a private portable export into Git.
- The owner portable export is a private input: its embedded requisition data,
  workbook metadata and portable settings must be replaced before publication.
  Candidate and internship workbooks remain local-only; the public sample must
  remain byte-equivalent to the committed synthetic workbook (the parity test).
- Reports aggregate the union of selected calendar months (including gaps and
  full quarters/years), not the enclosing date range. The comparison shifts the
  same month pattern backward by its calendar span. Requisition backlog uses the
  last selected month-end; internship activity counts unique rows overlapping any
  selected month. Existing report previews and PDF printing use the same aggregate.
- Both specialist labels are `İşe Alım Uzmanı`: requisitions use `responsible`
  in global filter state; candidate tracking uses its workbook's `Recruiter`
  column, normalized as `recruiter`, in separate candidate filter state.
  Neither filter selection persists across reloads; analysis exclusions and
  supported theme/manual internship settings retain their existing persistence.

The collection name is a placeholder; renaming requires updating the catalog,
routes, sitemap, tests and the Nginx route together.
