"""Central filesystem contract for Aizanoi Full Pack production artifacts."""

from __future__ import annotations

from pathlib import Path


PY_DIR = Path(__file__).resolve().parent
if PY_DIR.name.casefold() == "py" and PY_DIR.parent.name.casefold() == "dashboardlar":
    DASHBOARD_DIR = PY_DIR.parent
    PROJECT_ROOT = DASHBOARD_DIR.parent
else:
    # Backward-compatible during source migration and direct legacy execution.
    PROJECT_ROOT = PY_DIR
    DASHBOARD_DIR = PROJECT_ROOT / "dashboardlar"

BASE_DIR = PROJECT_ROOT
LOG_DIR = DASHBOARD_DIR / "logs"

ICMAL_XLSX = DASHBOARD_DIR / "icmal_sorgu_sonuc.xlsx"
IK_DASHBOARD = DASHBOARD_DIR / "ik_takip_dashboard.html"
IK_DASHBOARD_2024 = DASHBOARD_DIR / "ik_takip_dashboard_2024_gunumuz.html"
ADMIN_DASHBOARD = DASHBOARD_DIR / "ERD_P_admin.html"
MAGAZA_DASHBOARD = DASHBOARD_DIR / "magaza_takip_dosya.html"
MAGAZA_UYUM_DASHBOARD = DASHBOARD_DIR / "magaza_uyum_dashboard.html"
AKADEMI_DASHBOARD = DASHBOARD_DIR / "akademi_dashboard.html"
PERFORMANS_DASHBOARD = DASHBOARD_DIR / "performans_dashboard.html"
HEDEFLER_DASHBOARD = DASHBOARD_DIR / "hedefler_dashboard.html"
PDKS_DASHBOARD = DASHBOARD_DIR / "pdks_takip_dashboard.html"
TURNOVER_DASHBOARD = DASHBOARD_DIR / "turnover_dashboard.html"

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
