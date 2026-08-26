# Workforce Turnover Analytics

This directory contains the full standalone turnover analytics engine used by the public Aizanoi Analytics demonstration.

## Architecture

The dashboard keeps the original analytical structure and behavior:

- eight analytical views;
- global scope, exit-type, period, region, store, department, city, gender, contract, and title filters;
- monthly and cumulative turnover, flow, exit mix, scope trends, heat maps, and title matrices;
- region/store/year comparisons;
- forecasts, confidence intervals, rolling-origin backtests, and annual backtests;
- early-tenure analysis and exit drill-down;
- regrettable turnover, survival analysis, entity risk, and synthetic profile risk detail;
- browser-local reason classification with CSV and JSON import/export.

`generate_turnover_dashboard.py` reads the workbook, injects its compact payload into the offline HTML template, and emits CSP-compatible `index.html`, `app.js`, and `style.css` assets. The published page has no runtime backend or network data dependency.

## Data safety

The committed workbook at `data/turnover_analytics_synthetic.xlsx` was created from scratch with deterministic fictional scenarios. It is not an anonymized, masked, sampled, or transformed employer workbook.

- all IDs use explicit `SYN-` prefixes;
- profile labels use `Synthetic Employee` placeholders;
- business units and locations are fictional demo labels;
- no former employer workbook is read by the public build;
- no real employee, contact, payroll, or employer identifier is present.

Row-level records exist because the original exit-detail and risk features require them. Every such record is synthetic.

## Rebuild the dashboard

Install Python with `numpy`, `pandas`, and `openpyxl`, then run from the repository root:

```bash
python analytics/dashboards/hr-analytics-full-set/workforce-turnover/generate_turnover_dashboard.py
```

The command reads only the committed synthetic workbook and writes the public assets under `frontend/analytics/dashboards/hr-analytics-full-set/workforce-turnover/`.

## Workbook contract

The workbook preserves all 14 sheets consumed by the engine: monthly analysis, exit detail, reason settings, forecasts, monthly and annual backtests, regrettable turnover, survival curves, and entity/profile risk outputs.
