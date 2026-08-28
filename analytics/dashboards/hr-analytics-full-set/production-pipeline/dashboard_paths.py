"""Central filesystem contract for Aizanoi Full Pack production artifacts."""

from __future__ import annotations

import os
import re
import zipfile
from datetime import datetime, timezone
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


def deterministic_build_time() -> datetime:
    """Wall-clock-independent build time for generated artifacts.

    Derived from the committed synthetic source workbooks under PROJECT_ROOT:
    the newest timestamp found in docProps/core.xml or, for minimal bundles
    without core.xml, the newest zip entry mtime. All candidates live inside
    the committed bytes, so a rebuild stamps outputs with a value that is a
    pure function of the committed inputs — never the current wall clock.
    Two rebuilds of the same tree therefore produce byte-identical artifacts.
    Override explicitly with AIZANOI_BUILD_TIME (ISO 8601) only for a
    deliberate one-shot rebaseline.
    """
    override = os.environ.get("AIZANOI_BUILD_TIME", "").strip()
    if override:
        parsed = datetime.fromisoformat(override.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    epoch = datetime(1980, 1, 1, tzinfo=timezone.utc)
    latest: datetime | None = None

    def consider(candidate: datetime) -> None:
        nonlocal latest
        if latest is None or candidate > latest:
            latest = candidate

    for path in sorted(PROJECT_ROOT.glob("*.xlsx")):
        try:
            with zipfile.ZipFile(path) as bundle:
                try:
                    core = bundle.read("docProps/core.xml").decode("utf-8", "replace")
                except KeyError:
                    core = ""
                for raw in re.findall(
                    r"<dcterms:(?:created|modified)[^>]*>([^<]+)</dcterms:", core
                ):
                    try:
                        stamp = datetime.fromisoformat(raw.strip().replace("Z", "+00:00"))
                    except ValueError:
                        continue
                    consider(stamp if stamp.tzinfo else stamp.replace(tzinfo=timezone.utc))
                for info in bundle.infolist():
                    dt = info.date_time
                    if len(dt) == 6 and (1980, 1, 2) <= dt[:3] <= (2107, 12, 31):
                        consider(datetime(*dt, tzinfo=timezone.utc))
        except (OSError, zipfile.BadZipFile):
            continue
    return latest or epoch

def canonicalize_xlsx(path: Path, stamp: datetime) -> None:
    """Rewrite an openpyxl-written xlsx with fixed zip/docProps timestamps.

    openpyxl stamps every save with the wall clock (docProps/core.xml
    created/modified + zip entry mtimes), which breaks byte-level rebuild
    reproducibility. This rewrites the container deterministically: every zip
    entry gets the fixed 1980 epoch mtime and core.xml gets the given stamp.
    """
    import shutil
    import tempfile

    fixed_dt = (1980, 1, 1, 0, 0, 0)
    iso = stamp.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    fd, tmp_name = tempfile.mkstemp(suffix=".xlsx", dir=str(path.parent))
    import os
    os.close(fd)
    try:
        with zipfile.ZipFile(path) as src, zipfile.ZipFile(
            tmp_name, "w", zipfile.ZIP_DEFLATED
        ) as dst:
            for info in src.infolist():
                data = src.read(info.filename)
                if info.filename == "docProps/core.xml":
                    text = data.decode("utf-8", "replace")
                    text = re.sub(
                        r"(<dcterms:created[^>]*>)[^<]*(</dcterms:created>)",
                        r"\g<1>" + iso + r"\g<2>",
                        text,
                    )
                    text = re.sub(
                        r"(<dcterms:modified[^>]*>)[^<]*(</dcterms:modified>)",
                        r"\g<1>" + iso + r"\g<2>",
                        text,
                    )
                    data = text.encode("utf-8")
                out = zipfile.ZipInfo(info.filename, date_time=fixed_dt)
                out.compress_type = zipfile.ZIP_DEFLATED
                out.external_attr = info.external_attr
                dst.writestr(out, data)
        Path(tmp_name).replace(path)
    finally:
        if Path(tmp_name).exists():
            Path(tmp_name).unlink()
