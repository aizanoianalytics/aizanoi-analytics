#!/usr/bin/env python3
"""Embed the committed Recruitment dummy workbook into its public dashboard."""

from __future__ import annotations

import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
WORKBOOK = ROOT / "analytics/dashboards/new-hr-collection/sources/ise_alim_dummy_data.xlsx"
DASHBOARD = ROOT / "frontend/analytics/dashboards/new-hr-collection/recruitment-analytics/index.html"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}
CORE_NS = {"dcterms": "http://purl.org/dc/terms/"}


def column_index(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference)
    if not letters:
        raise ValueError(f"Invalid cell reference: {reference}")
    value = 0
    for char in letters.group(0):
        value = value * 26 + ord(char) - 64
    return value - 1


def cell_value(cell: ET.Element):
    kind = cell.get("t")
    if kind == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(".//m:t", NS))
    raw = cell.findtext("m:v", default="", namespaces=NS)
    if kind in {"str", "e"}:
        return raw
    if kind == "b":
        return raw == "1"
    if raw == "":
        return ""
    try:
        number = float(raw)
        return int(number) if number.is_integer() else number
    except ValueError:
        return raw


def read_workbook(path: Path) -> tuple[str, str, list[str], list[list[object]]]:
    with zipfile.ZipFile(path) as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        sheet = next((node for node in workbook.findall("m:sheets/m:sheet", NS) if node.get("name") == "db"), None)
        if sheet is None:
            raise ValueError("Workbook must contain a 'db' sheet")
        relation_id = sheet.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        relations = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        relation = next((node for node in relations.findall("r:Relationship", REL_NS) if node.get("Id") == relation_id), None)
        if relation is None:
            raise ValueError("Could not resolve the 'db' worksheet relationship")
        target = relation.get("Target", "").lstrip("/")
        sheet_path = target if target.startswith("xl/") else "xl/" + target
        sheet_path = str(Path(sheet_path))
        xml = ET.fromstring(archive.read(sheet_path))

        parsed_rows: list[list[object]] = []
        for row in xml.findall("m:sheetData/m:row", NS):
            values: list[object] = []
            for cell in row.findall("m:c", NS):
                index = column_index(cell.get("r", ""))
                while len(values) < index:
                    values.append("")
                values.append(cell_value(cell))
            parsed_rows.append(values)

        if not parsed_rows:
            raise ValueError("The 'db' sheet is empty")
        headers = [str(value) for value in parsed_rows[0]]
        rows = parsed_rows[1:]
        while rows and not any(value != "" for value in rows[-1]):
            rows.pop()

        core = ET.fromstring(archive.read("docProps/core.xml"))
        generated_at = core.findtext("dcterms:modified", default="", namespaces=CORE_NS)
        if not generated_at:
            raise ValueError("Workbook is missing deterministic modified metadata")
        if not generated_at.endswith("Z"):
            generated_at += "Z"
        return generated_at, sheet.get("name", "db"), headers, rows


def main() -> int:
    check = "--check" in sys.argv[1:]
    generated_at, sheet_name, headers, rows = read_workbook(WORKBOOK)
    payload = {
        "generatedAt": generated_at,
        "sourceFile": WORKBOOK.name,
        "sheetName": sheet_name,
        "headers": headers,
        "rows": rows,
    }
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    html = DASHBOARD.read_text(encoding="utf-8")
    pattern = re.compile(r'(<script id="igatsEmbeddedData" type="application/json">).*?(</script>)', re.DOTALL)
    updated, count = pattern.subn(lambda match: match.group(1) + encoded + match.group(2), html, count=1)
    if count != 1:
        raise ValueError("Expected exactly one igatsEmbeddedData carrier")

    # Keep visible static metadata accurate before DOMContentLoaded applies the payload.
    updated = re.sub(r'ise_alim_[^<]+\.xlsx · [\d,]+ Records', f'{WORKBOOK.name} · {len(rows):,} Records', updated, count=1)
    updated = re.sub(r'It parses and visualizes [\d,]+ historical and active requisition lifecycle records\.',
                     f'It parses and visualizes {len(rows):,} synthetic historical and active requisition lifecycle records.',
                     updated, count=1)

    if check:
        if updated != html:
            print(f"OUT OF DATE: {DASHBOARD.relative_to(ROOT)}")
            return 1
        print(f"Recruitment embedded dataset is current: {len(rows)} rows from {WORKBOOK.name}")
        return 0

    DASHBOARD.write_text(updated, encoding="utf-8")
    print(f"Embedded {len(rows)} rows from {WORKBOOK.relative_to(ROOT)} into {DASHBOARD.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
