# Synthetic HR Demo Core

This directory contains the deterministic, synthetic-only source of truth for HR Analytics Full Set. It connects fictional organization, employee, workforce movement, learning, performance, goals and time-attendance events through explicit `SYN-` identifiers.

Generate the workbook with:

```powershell
node analytics/dashboards/hr-analytics-full-set/synthetic-core/generate_hr_demo_core.mjs analytics/dashboards/hr-analytics-full-set/synthetic-core/data/hr_demo_core_synthetic.xlsx
```

The generator requires `@oai/artifact-tool`. It creates 20 connected sheets, including the organization, employee-month bridge, hiring, exits, promotions, performance, learning, compliance, goals, attendance, turnover analysis and formula-driven QA controls. The workbook is generated from scratch and is not anonymized, masked, sampled or transformed from an employer workbook.

Generate the nine shared-core dashboards after the workbook:

```powershell
python analytics/dashboards/hr-analytics-full-set/generate_full_set_dashboards.py
```
