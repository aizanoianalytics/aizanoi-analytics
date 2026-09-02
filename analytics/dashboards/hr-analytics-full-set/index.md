# HR Analytics Full Set Index

Scope: deterministic synthetic-only source pipeline for the public HR Analytics Full Set.

## Route by task

- Product/pipeline overview and rebuild instructions → [`README.md`](README.md)
- Stage orchestration and parity-preserved Python source → `production-pipeline/`
- Deterministic synthetic input generation and parity verification → `tools/`
- Source-to-public route mapping → `pipeline-manifest.json`
- Per-dashboard source notes → the corresponding dashboard directory in this folder
- Generated visitor-facing dashboards → `../../../frontend/analytics/dashboards/hr-analytics-full-set/`
- Repository rebuild orchestration → `../../../scripts/regenerate-hr-dashboards.sh`

## Boundary

Only synthetic/public-safe inputs belong here. Never replace committed synthetic workbooks with employer-provided or private data. Generated frontend output is downstream of this source pipeline and must remain reproducible through the repository rebuild contract.
