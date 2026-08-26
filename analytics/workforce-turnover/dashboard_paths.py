"""Filesystem contract for the public Aizanoi turnover dashboard."""

from __future__ import annotations

from pathlib import Path


PY_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = PY_DIR.parents[1]
DASHBOARD_DIR = PROJECT_ROOT / "frontend" / "analytics" / "workforce-turnover"

BASE_DIR = PROJECT_ROOT
LOG_DIR = DASHBOARD_DIR / "logs"

ICMAL_XLSX = PY_DIR / "data" / "turnover_analytics_synthetic.xlsx"
IK_DASHBOARD = DASHBOARD_DIR / "ik_takip_dashboard.html"
IK_DASHBOARD_2024 = DASHBOARD_DIR / "ik_takip_dashboard_2024_gunumuz.html"
ADMIN_DASHBOARD = DASHBOARD_DIR / "ERD_P_admin.html"
MAGAZA_DASHBOARD = DASHBOARD_DIR / "magaza_takip_dosya.html"
MAGAZA_UYUM_DASHBOARD = DASHBOARD_DIR / "magaza_uyum_dashboard.html"
AKADEMI_DASHBOARD = DASHBOARD_DIR / "akademi_dashboard.html"
PERFORMANS_DASHBOARD = DASHBOARD_DIR / "performans_dashboard.html"
HEDEFLER_DASHBOARD = DASHBOARD_DIR / "hedefler_dashboard.html"
PDKS_DASHBOARD = DASHBOARD_DIR / "pdks_takip_dashboard.html"
TURNOVER_DASHBOARD = DASHBOARD_DIR / "index.html"

HTML_OUTPUTS = (
    IK_DASHBOARD,
    IK_DASHBOARD_2024,
    ADMIN_DASHBOARD,
    MAGAZA_DASHBOARD,
    MAGAZA_UYUM_DASHBOARD,
    AKADEMI_DASHBOARD,
    PERFORMANS_DASHBOARD,
    HEDEFLER_DASHBOARD,
    PDKS_DASHBOARD,
    TURNOVER_DASHBOARD,
)

PRODUCTION_OUTPUTS = (ICMAL_XLSX, *HTML_OUTPUTS)


def ensure_dashboard_dir() -> Path:
    DASHBOARD_DIR.mkdir(parents=True, exist_ok=True)
    return DASHBOARD_DIR


def ensure_log_dir() -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    return LOG_DIR
