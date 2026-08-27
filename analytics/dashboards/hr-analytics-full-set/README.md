# HR Analytics Full Set

This directory publishes the complete ten-dashboard HR analytics production line with synthetic-only inputs.

The public version is not a simplified reimplementation. The 22 Python modules preserve the original algorithms, functions, pipeline order, dashboard templates, controls, exports, filters and visual structure. Public-safe changes are limited to identity-bearing product labels and two module filenames. All workbook content is generated from scratch.

## Verified contract

- 27 source workbooks are fully synthetic.
- 144 synthetic people use reserved test identifiers, fictional organization names, placeholder phone numbers and `example.test` email addresses.
- The integrated workbook contains 9,497 synthetic monthly workforce rows.
- The original ten-stage pipeline completes successfully without calculation or control removal.
- All 22 Python modules pass normalized text and AST parity checks against the private reference code.
- All ten generated dashboards pass exact DOM interaction-surface comparison: tag counts, IDs, classes, controls and scripts.
- Private workbooks, private HTML exports, real employer names and real employee records are not included.

## Directory map

- `production-pipeline/`: parity-preserved Python source, sanitized HTML template, dependency locks, 27 synthetic input workbooks and the generated integrated workbook.
- `tools/generate_synthetic_source_workbooks.mjs`: deterministic synthetic workbook generator.
- `tools/verify_dashboard_parity.py`: original-versus-synthetic dashboard surface verification.
- Per-dashboard folders: product notes and public route mapping.

## Production order

1. Build the integrated analytical workbook.
2. Build the full-history and 2024+ executive boards.
3. Build the administration deep dive.
4. Build store operations tracking.
5. Build turnover analytics.
6. Build store learning and compliance.
7. Build academy analytics.
8. Build performance, hiring and turnover.
9. Build corporate goals.
10. Build time and attendance.

## Rebuild

Install the locked Python dependencies, regenerate the sources if required, then run the original production entry point:

```powershell
python -m pip install -r analytics/dashboards/hr-analytics-full-set/production-pipeline/requirements-dashboard-lock.txt
node analytics/dashboards/hr-analytics-full-set/tools/generate_synthetic_source_workbooks.mjs analytics/dashboards/hr-analytics-full-set/production-pipeline
python analytics/dashboards/hr-analytics-full-set/production-pipeline/run_full_pipeline.py
```

The integrated workbook and generated HTML files are written to `production-pipeline/dashboardlar/`. The website publishes those same ten HTML outputs at the routes listed in [`pipeline-manifest.json`](pipeline-manifest.json).

## Safety rule

Never replace the synthetic `.xlsx` inputs in this public directory with private or employer-provided workbooks. A release is allowed only after source parity, dashboard parity, workbook validation, repository-wide prohibited-identity scanning and browser QA all pass.
