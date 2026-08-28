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

Install the locked Python dependencies, then use the repository orchestration script. It runs the ten-stage pipeline, maps all generated HTML to the canonical public routes, publishes the integrated synthetic workbook as the single allowed `.xlsx` download, and runs the HR audit contracts.

```bash
python -m pip install -r analytics/dashboards/hr-analytics-full-set/production-pipeline/requirements-dashboard-lock.txt
bash scripts/regenerate-hr-dashboards.sh
```

The 27 synthetic input workbooks are committed so the normal rebuild does not require the workbook-generation tool. Recreate those inputs only when intentionally changing the synthetic dataset and when `@oai/artifact-tool` is available:

```bash
REGENERATE_SYNTHETIC_INPUTS=1 bash scripts/regenerate-hr-dashboards.sh
```

The ten-stage entry point remains `production-pipeline/run_full_pipeline.py`. Its temporary HTML outputs are written under `production-pipeline/dashboardlar/`; the orchestration script copies them to the routes listed in [`pipeline-manifest.json`](pipeline-manifest.json). The generated integrated workbook is copied byte-for-byte to `frontend/analytics/dashboards/hr-analytics-full-set/downloads/hr-analytics-full-set-synthetic-output.xlsx`.

## Safety rule

Never replace the synthetic `.xlsx` inputs in this public directory with private or employer-provided workbooks. The public deploy boundary allows exactly one spreadsheet: the declared synthetic output download. A release is allowed only after source parity, dashboard parity, workbook validation, prohibited-identity scanning, a clean ten-stage CI rebuild and browser QA all pass.
