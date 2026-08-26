"""Filesystem contract for the public Aizanoi turnover dashboard."""

from __future__ import annotations

from pathlib import Path


PY_DIR = Path(__file__).resolve().parent
HR_SET_DIR = PY_DIR.parent
PROJECT_ROOT = PY_DIR.parents[3]
PUBLIC_SET_DIR = (
    PROJECT_ROOT
    / "frontend"
    / "analytics"
    / "dashboards"
    / "hr-analytics-full-set"
)
DASHBOARD_DIR = PUBLIC_SET_DIR / "workforce-turnover"

BASE_DIR = PROJECT_ROOT
LOG_DIR = DASHBOARD_DIR / "logs"

ICMAL_XLSX = PY_DIR / "data" / "turnover_analytics_synthetic.xlsx"
TURNOVER_DASHBOARD = DASHBOARD_DIR / "index.html"

HTML_OUTPUTS = (TURNOVER_DASHBOARD,)

PRODUCTION_OUTPUTS = (ICMAL_XLSX, *HTML_OUTPUTS)


def ensure_dashboard_dir() -> Path:
    DASHBOARD_DIR.mkdir(parents=True, exist_ok=True)
    return DASHBOARD_DIR


def ensure_log_dir() -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    return LOG_DIR
