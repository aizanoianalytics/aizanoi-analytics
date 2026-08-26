# HR Analytics Full Set

HR Analytics Full Set is the public, synthetic-data reconstruction of a ten-dashboard analytics production line. The objective is feature parity with the reference dashboards—not a reduced showcase—while excluding every former employer, employee, store, contact and operational record.

## Publishing status

| Dashboard | Folder | Status |
| --- | --- | --- |
| HR Executive Board — Full History | `hr-executive-board-full-history/` | Synthetic rebuild pending |
| HR Executive Board — 2024 to Present | `hr-executive-board-current/` | Synthetic rebuild pending |
| HR Administration & Deep Dive | `hr-administration-deep-dive/` | Synthetic rebuild pending |
| Store Operations Tracking | `store-operations-tracking/` | Synthetic rebuild pending |
| Workforce Turnover Analytics | `workforce-turnover/` | Public, synthetic and reproducible |
| Store Learning & Compliance | `store-learning-compliance/` | Synthetic rebuild pending |
| Learning Academy Analytics | `learning-academy-analytics/` | Synthetic rebuild pending |
| Performance, Hiring & Turnover | `performance-hiring-turnover/` | Synthetic rebuild pending |
| Corporate Goals Dashboard | `corporate-goals/` | Synthetic rebuild pending |
| Workforce Time & Attendance | `workforce-time-attendance/` | Synthetic rebuild pending |

The machine-readable inventory is in [`pipeline-manifest.json`](pipeline-manifest.json). It records the intended public outputs and capabilities without including reference HTML, source workbooks, real identifiers or production values.

## Safety contract

- Reference workbooks and HTML exports are never committed or copied into the public build.
- Public records are generated from scratch and must be visibly synthetic.
- A rebuild must preserve calculations, controls, drill-downs and exports wherever synthetic data can exercise them safely.
- A dashboard remains unavailable until automated scans and manual review confirm that its public assets contain no former employer or employee data.

## Public routes

- Catalog: <https://aizanoianalytics.com/analytics/dashboards/hr-analytics-full-set/>
- Live dashboard: <https://aizanoianalytics.com/analytics/dashboards/hr-analytics-full-set/workforce-turnover/>
