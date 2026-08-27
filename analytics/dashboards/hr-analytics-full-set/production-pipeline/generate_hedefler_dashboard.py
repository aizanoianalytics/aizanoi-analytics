"""2026 CEO ve şirket hedefleri dashboard üreticisi."""

from __future__ import annotations

import argparse
from pathlib import Path

from dashboard_build_common import log, write_single_file_html
from dashboard_paths import HEDEFLER_DASHBOARD, PROJECT_ROOT
from hedefler_dashboard_common import build_hedefler_data
from hedefler_dashboard_template import HTML_TEMPLATE


DEFAULT_INPUT = PROJECT_ROOT / "2026_hedefler.xlsx"
DEFAULT_OUTPUT = HEDEFLER_DASHBOARD


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="2026 CEO ve şirket hedefleri dashboardunu üretir.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source = args.input.resolve()
    output = args.output.resolve()
    log(f"Hedefler Dashboard verisi hazırlanıyor: {source.name}")
    payload = build_hedefler_data(source)
    write_single_file_html(output, HTML_TEMPLATE, payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
