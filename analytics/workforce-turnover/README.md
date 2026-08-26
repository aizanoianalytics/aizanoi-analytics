# Workforce Turnover Analytics

An open, static-first workforce planning demonstration for **Aizanoi Analytics**.

## Data safety

The public dataset is generated from scratch by `generate_data.py` with a fixed random seed. The generator:

- reads no external workbook, database, employee file or environment variable;
- emits aggregate region, department and contract-type totals only;
- contains no names, employee numbers, contact details or row-level people records;
- states its synthetic status in both the dataset and the interface.

This project is a clean public implementation of a general analytical pattern. It is not an anonymized or transformed employer dataset.

## Rebuild the data

From the repository root:

```bash
python analytics/workforce-turnover/generate_data.py
```

The command deterministically writes `frontend/analytics/workforce-turnover/data.json`.

## Metric

For any selected period and scope:

```text
turnover rate = total exits / sum of monthly average workforce × 100
monthly average workforce = (start headcount + end headcount) / 2
```

This keeps totals additive across filters while making the denominator explicit.

## Public files

- Application: `/analytics/workforce-turnover/`
- Dataset: `/analytics/workforce-turnover/data.json`
- Source: `analytics/workforce-turnover/`

The application uses browser-native HTML, CSS, JavaScript and SVG. It has no runtime dependency or backend.
