# HR Analytics Full Set

HR Analytics Full Set is the public, synthetic-data reconstruction of a ten-dashboard analytics production line. The objective is feature parity with the reference dashboards—not a reduced showcase—while excluding every former employer, employee, store, contact and operational record.

## Publishing status

| Dashboard | Folder | Status |
| --- | --- | --- |
| HR Executive Board — Full History | `hr-executive-board-full-history/` | Public, synthetic and reproducible |
| HR Executive Board — 2024 to Present | `hr-executive-board-current/` | Public, synthetic and reproducible |
| HR Administration & Deep Dive | `hr-administration-deep-dive/` | Public, synthetic and reproducible |
| Store Operations Tracking | `store-operations-tracking/` | Public, synthetic and reproducible |
| Workforce Turnover Analytics | `workforce-turnover/` | Public, synthetic and reproducible |
| Store Learning & Compliance | `store-learning-compliance/` | Public, synthetic and reproducible |
| Learning Academy Analytics | `learning-academy-analytics/` | Public, synthetic and reproducible |
| Performance, Hiring & Turnover | `performance-hiring-turnover/` | Public, synthetic and reproducible |
| Corporate Goals Dashboard | `corporate-goals/` | Public, synthetic and reproducible |
| Workforce Time & Attendance | `workforce-time-attendance/` | Public, synthetic and reproducible |

The machine-readable inventory is in [`pipeline-manifest.json`](pipeline-manifest.json). All ten dashboards are backed by the same deterministic 20-sheet Synthetic HR Demo Core so cross-product metrics reconcile without including reference HTML, source workbooks, real identifiers or production values.

## Safety contract

- Reference workbooks and HTML exports are never committed or copied into the public build.
- Public records are generated from scratch and must be visibly synthetic.
- A rebuild must preserve calculations, controls, drill-downs and exports wherever synthetic data can exercise them safely.
- A dashboard remains unavailable until automated scans and manual review confirm that its public assets contain no former employer or employee data.

## Public routes

- Catalog: <https://aizanoianalytics.com/analytics/dashboards/hr-analytics-full-set/>
- Dashboard routes are listed in [`pipeline-manifest.json`](pipeline-manifest.json); all ten are public from the catalog.

## Rebuild

Generate the shared workbook first, then the nine connected dashboard surfaces:

```powershell
node analytics/dashboards/hr-analytics-full-set/synthetic-core/generate_hr_demo_core.mjs
python analytics/dashboards/hr-analytics-full-set/generate_full_set_dashboards.py
```

The standalone Workforce Turnover package keeps its dedicated 14-sheet model and generator. The other nine surfaces share the full Synthetic HR Demo Core and the common interactive web engine.
