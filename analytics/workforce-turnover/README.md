# Workforce Turnover Analytics

A full-featured, static-first workforce analytics laboratory for **Aizanoi Analytics**.

## Data safety

`generate_data.py` creates the entire public dataset from scratch with fixed seed `410225`. It reads no workbook, database, employee file, environment variable or network source. It contains:

- fictional scopes, regions, sites and workforce dimensions;
- deterministic aggregate workforce cells;
- generated scenario-only profile labels such as `SIM-00001` and `RISK-0001`;
- no names, employer identifiers, employee numbers, contact details or real person records.

The profile rows exist only to demonstrate drill-down, early-tenure and risk workflows. They are not anonymised, transformed or derived records.

## Feature contract

The public product includes:

- global scope, exit-type, period and eight-dimension filtering;
- monthly and cumulative turnover, workforce movement and scope comparison;
- ranked breakdowns, monthly heat maps and role turnover matrices;
- entity/year comparison;
- six-month forecast, confidence intervals and annual backtesting;
- 30/60/90/180-day early-tenure analysis;
- searchable, sortable and paginated synthetic exit detail;
- regrettable turnover, survival analysis, location risk and synthetic risk profiles;
- browser-local exit-reason classification overrides;
- CSV export for analytical views and JSON import/export for reason settings.

## Rebuild the data

From the repository root:

```bash
python analytics/workforce-turnover/generate_data.py
```

The command deterministically writes `frontend/analytics/workforce-turnover/data.json`.

## Metrics

```text
monthly average workforce = (start headcount + end headcount) / 2
monthly turnover = monthly exits / monthly average workforce
cumulative turnover = period exits / average of monthly average workforce
```

Reason classification changes the selected exit numerator only. It never changes the workforce denominator.

## Public files

- Application: `/analytics/workforce-turnover/`
- Dataset: `/analytics/workforce-turnover/data.json`
- Source: `analytics/workforce-turnover/`

The application uses browser-native HTML, CSS, JavaScript and SVG. It has no runtime dependency or backend.
