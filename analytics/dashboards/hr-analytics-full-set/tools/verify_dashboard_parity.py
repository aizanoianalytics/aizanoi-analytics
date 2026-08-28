#!/usr/bin/env python3
"""Compare original and synthetic dashboard interaction/DOM surfaces."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path


FILES = (
    "ik_takip_dashboard.html",
    "ik_takip_dashboard_2024_gunumuz.html",
    "ERD_P_admin.html",
    "magaza_takip_dosya.html",
    "turnover_dashboard.html",
    "magaza_uyum_dashboard.html",
    "akademi_dashboard.html",
    "performans_dashboard.html",
    "hedefler_dashboard.html",
    "pdks_takip_dashboard.html",
)


class SurfaceParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tags: Counter[str] = Counter()
        self.ids: set[str] = set()
        self.classes: set[str] = set()
        self.events: Counter[str] = Counter()
        self.controls: list[tuple[str, tuple[str, ...]]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.tags[tag] += 1
        attr_map = dict(attrs)
        if attr_map.get("id"):
            self.ids.add(str(attr_map["id"]))
        if attr_map.get("class"):
            self.classes.update(str(attr_map["class"]).split())
        for name, _ in attrs:
            if name.startswith("on"):
                self.events[name] += 1
        if tag in {"button", "select", "input", "textarea", "a"}:
            self.controls.append((tag, tuple(sorted(name for name, _ in attrs))))


def inspect(path: Path) -> dict[str, object]:
    parser = SurfaceParser()
    parser.feed(path.read_text(encoding="utf-8", errors="replace"))
    signature = json.dumps(
        {
            "tags": sorted(parser.tags.items()),
            "ids": sorted(parser.ids),
            "classes": sorted(parser.classes),
            "events": sorted(parser.events.items()),
            "controls": parser.controls,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return {
        "bytes": path.stat().st_size,
        "tags": dict(sorted(parser.tags.items())),
        "ids": sorted(parser.ids),
        "classes": sorted(parser.classes),
        "events": dict(sorted(parser.events.items())),
        "control_count": len(parser.controls),
        "surface_sha256": hashlib.sha256(signature).hexdigest(),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--original", required=True, type=Path)
    parser.add_argument("--synthetic", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()

    report: dict[str, object] = {"ok": True, "files": {}}
    for filename in FILES:
        original = inspect(args.original / filename)
        synthetic = inspect(args.synthetic / filename)
        original_ids = set(original["ids"])
        synthetic_ids = set(synthetic["ids"])
        original_classes = set(original["classes"])
        synthetic_classes = set(synthetic["classes"])
        comparison = {
            "surface_equal": original["surface_sha256"] == synthetic["surface_sha256"],
            "tag_counts_equal": original["tags"] == synthetic["tags"],
            "control_counts_equal": original["control_count"] == synthetic["control_count"],
            "id_coverage": 1.0 if not original_ids else len(original_ids & synthetic_ids) / len(original_ids),
            "class_coverage": 1.0 if not original_classes else len(original_classes & synthetic_classes) / len(original_classes),
            "missing_ids": sorted(original_ids - synthetic_ids),
            "missing_classes": sorted(original_classes - synthetic_classes),
            "original": original,
            "synthetic": synthetic,
        }
        comparison["ok"] = (
            comparison["control_counts_equal"]
            and comparison["id_coverage"] == 1.0
            and comparison["class_coverage"] == 1.0
        )
        report["files"][filename] = comparison
        report["ok"] = bool(report["ok"] and comparison["ok"])

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
