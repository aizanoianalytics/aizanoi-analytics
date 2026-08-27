"""Mağaza eğitim, uyum ve turnover skor kartı üreticisi.

Bu üretici yalnızca ``icmal_sorgu_sonuc.xlsx`` dosyasını okur. Çalışan
seviyesindeki kaynaklar hesaplama sırasında sicil bazında tekilleştirilir;
çıktı HTML'ine ad, sicil veya başka bir kişisel veri gömülmez.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import pandas as pd

import refresh_data as rd
from dashboard_paths import ICMAL_XLSX, MAGAZA_UYUM_DASHBOARD, PROJECT_ROOT


BASE_DIR = PROJECT_ROOT
DEFAULT_XLSX = ICMAL_XLSX
DEFAULT_OUTPUT = MAGAZA_UYUM_DASHBOARD
CHECKLIST_HIRE_CUTOFF = pd.Timestamp("2024-12-10")


def ensure_utf8_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)


ensure_utf8_stdio()


def log(message: str) -> None:
    print(f"[MAĞAZA UYUM] {message}", flush=True)


def clean_text(value: object, default: str = "") -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return default
    fixed = rd.fix_text(value)
    text = str(fixed).strip()
    if not text or text.lower() in {"nan", "nat", "none", "null"}:
        return default
    return " ".join(text.split())


def finite_or_none(value: object) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def mode_text(values: Iterable[object], default: str) -> str:
    cleaned = [clean_text(value) for value in values]
    cleaned = [value for value in cleaned if value]
    if not cleaned:
        return default
    counts = pd.Series(cleaned, dtype="object").value_counts()
    return str(counts.index[0])


def require_columns(df: pd.DataFrame, required: Iterable[str], sheet_name: str) -> None:
    missing = [column for column in required if column not in df.columns]
    if missing:
        raise ValueError(
            f"'{sheet_name}' sheet'inde zorunlu kolonlar eksik: {', '.join(missing)}"
        )


def read_sheet(
    xlsx_path: Path,
    sheet_name: str,
    columns: Iterable[str],
) -> pd.DataFrame:
    wanted = set(columns)
    frame = pd.read_excel(
        xlsx_path,
        sheet_name=sheet_name,
        usecols=lambda column: column in wanted,
    )
    require_columns(frame, wanted, sheet_name)
    log(f"{sheet_name}: {len(frame):,} satır okundu")
    return frame


def turnover_score(rate: float | None) -> float | None:
    """Map a 0-1 turnover ratio to the approved 40/60/80/100 scale."""

    if rate is None or not math.isfinite(rate) or rate < 0:
        return None
    if abs(rate) <= 1e-12:
        return 100.0
    if rate < 0.10:
        return 80.0
    if rate < 0.20:
        return 60.0
    return 40.0


def score_band(value: float | None) -> str:
    if value is None:
        return "Eksik Metrik"
    if value >= 85:
        return "Güçlü"
    if value >= 70:
        return "İzlemeli"
    return "Aksiyon"


def build_dashboard_data(xlsx_path: Path) -> dict[str, Any]:
    if not xlsx_path.exists():
        raise FileNotFoundError(xlsx_path)

    required_sheets = {
        "fiili_list",
        "katilmayanlar_listesi",
        "isg_veri",
        "zorunlu_egitim",
        "check_list",
        "Turnover_isletme_adi",
    }
    with pd.ExcelFile(xlsx_path) as workbook:
        missing_sheets = sorted(required_sheets.difference(workbook.sheet_names))
    if missing_sheets:
        raise ValueError(
            "Mağaza uyum dashboardu için icmal sheet'leri eksik: "
            + ", ".join(missing_sheets)
        )

    fiili = read_sheet(
        xlsx_path,
        "fiili_list",
        [
            "P_NO",
            "ISLETME_AD",
            "CALISAN_GRUP",
            "UST_BOLUM_ADI",
            "IL",
            "ILK_BASLAMA_TARIHI",
        ],
    )
    academy = read_sheet(
        xlsx_path,
        "katilmayanlar_listesi",
        ["sicil"],
    )
    isg = read_sheet(
        xlsx_path,
        "isg_veri",
        ["P_NO", "Katılım Durumu"],
    )
    mandatory = read_sheet(
        xlsx_path,
        "zorunlu_egitim",
        ["LOKASYON", "TAMAMLAMA DURUMU"],
    )
    checklist = read_sheet(
        xlsx_path,
        "check_list",
        ["Sicil Numarası", "Kullanıcı Kodu", "Tamamlama Durumu"],
    )
    turnover = read_sheet(
        xlsx_path,
        "Turnover_isletme_adi",
        ["donem", "isletme_adi", "cikis", "donem_basi", "donem_sonu", "turnover1"],
    )

    fiili["sicil_key"] = fiili["P_NO"].map(rd.normalize_sicil_key)
    fiili["store_key"] = fiili["ISLETME_AD"].map(rd.normalize_key)
    fiili["group_key"] = fiili["CALISAN_GRUP"].map(rd.normalize_key)
    fiili["hire_date"] = pd.to_datetime(
        fiili["ILK_BASLAMA_TARIHI"], errors="coerce", dayfirst=True
    )
    store_marker = fiili["ISLETME_AD"].astype(str).str.contains(
        ".gs.", case=False, regex=False, na=False
    )
    active = fiili[
        fiili["group_key"].eq("magaza")
        & store_marker
        & fiili["sicil_key"].notna()
        & fiili["store_key"].ne("")
    ].copy()
    active = active.drop_duplicates(subset=["sicil_key"], keep="last")
    if active.empty:
        raise RuntimeError(
            "Fiili listede CALISAN_GRUP=MAĞAZA ve ISLETME_AD içinde .GS. olan çalışan bulunamadı."
        )

    store_keys = set(active["store_key"])
    academy_nonattendee_ids = set(
        academy["sicil"].map(rd.normalize_sicil_key).dropna()
    )

    isg["sicil_key"] = isg["P_NO"].map(rd.normalize_sicil_key)
    isg["status_key"] = isg["Katılım Durumu"].map(rd.normalize_key)
    isg_completed_ids = set(
        isg.loc[isg["status_key"].eq("tamamladi"), "sicil_key"].dropna()
    )

    checklist["sicil_key"] = checklist["Sicil Numarası"].map(rd.normalize_sicil_key)
    fallback_ids = checklist["Kullanıcı Kodu"].map(rd.normalize_sicil_key)
    checklist["sicil_key"] = checklist["sicil_key"].fillna(fallback_ids)
    checklist["status_key"] = checklist["Tamamlama Durumu"].map(rd.normalize_key)
    checklist_completed_ids = set(
        checklist.loc[
            checklist["status_key"].eq("tamamlandi"), "sicil_key"
        ].dropna()
    )

    active["academy_nonattendee"] = active["sicil_key"].isin(academy_nonattendee_ids)
    active["isg_completed"] = active["sicil_key"].isin(isg_completed_ids)
    active["checklist_eligible"] = active["hire_date"].gt(CHECKLIST_HIRE_CUTOFF)
    active["checklist_completed"] = (
        active["checklist_eligible"]
        & active["sicil_key"].isin(checklist_completed_ids)
    )

    grouped_people = (
        active.groupby("store_key", as_index=False)
        .agg(
            headcount=("sicil_key", "nunique"),
            academy_nonattendee=("academy_nonattendee", "sum"),
            isg_completed=("isg_completed", "sum"),
            checklist_eligible=("checklist_eligible", "sum"),
            checklist_completed=("checklist_completed", "sum"),
        )
    )

    store_meta_rows: list[dict[str, str]] = []
    for store_key, group in active.groupby("store_key", sort=True):
        store_meta_rows.append(
            {
                "store_key": store_key,
                "store": mode_text(group["ISLETME_AD"], "Mağaza Belirsiz"),
                "region": mode_text(group["UST_BOLUM_ADI"], "Bölge Belirsiz"),
                "city": mode_text(group["IL"], "İl Belirsiz"),
            }
        )
    store_meta = pd.DataFrame(store_meta_rows)

    mandatory["store_key"] = mandatory["LOKASYON"].map(rd.normalize_key)
    mandatory["completed"] = mandatory["TAMAMLAMA DURUMU"].map(rd.normalize_key).eq(
        "tamamladi"
    )
    mandatory_scope = mandatory[mandatory["store_key"].isin(store_keys)].copy()
    mandatory_grouped = (
        mandatory_scope.groupby("store_key", as_index=False)
        .agg(
            mandatory_assigned=("store_key", "size"),
            mandatory_completed=("completed", "sum"),
        )
    )

    turnover["store_key"] = turnover["isletme_adi"].map(rd.normalize_key)
    turnover["month"] = pd.to_datetime(turnover["donem"], errors="coerce")
    turnover_scope = turnover[
        turnover["store_key"].isin(store_keys) & turnover["month"].notna()
    ].copy()
    if turnover_scope.empty:
        latest_turnover_month = None
        latest_turnover = pd.DataFrame(columns=["store_key"])
    else:
        latest_month_value = turnover_scope["month"].max()
        latest_turnover_month = latest_month_value.strftime("%Y-%m")
        latest_turnover = turnover_scope[
            turnover_scope["month"].eq(latest_month_value)
        ].copy()
        for column in ["cikis", "donem_basi", "donem_sonu", "turnover1"]:
            latest_turnover[column] = pd.to_numeric(
                latest_turnover[column], errors="coerce"
            )
        latest_turnover["turnover_avg_headcount"] = (
            latest_turnover["donem_basi"] + latest_turnover["donem_sonu"]
        ) / 2.0
        latest_turnover["turnover_rate"] = np.where(
            latest_turnover["turnover_avg_headcount"].gt(0),
            latest_turnover["cikis"] / latest_turnover["turnover_avg_headcount"],
            np.nan,
        )
        formula_delta = (
            latest_turnover["turnover_rate"] - latest_turnover["turnover1"]
        ).abs()
        formula_mismatch_count = int(formula_delta.gt(1e-9).sum())
        if formula_mismatch_count:
            raise RuntimeError(
                f"En güncel turnover sheet'inde {formula_mismatch_count} formül uyuşmazlığı bulundu."
            )
        latest_turnover = latest_turnover[
            [
                "store_key",
                "cikis",
                "donem_basi",
                "donem_sonu",
                "turnover_avg_headcount",
                "turnover_rate",
            ]
        ].drop_duplicates("store_key", keep="last")

    combined = store_meta.merge(grouped_people, on="store_key", how="left")
    combined = combined.merge(mandatory_grouped, on="store_key", how="left")
    combined = combined.merge(latest_turnover, on="store_key", how="left")
    combined["mandatory_assigned"] = combined["mandatory_assigned"].fillna(0).astype(int)
    combined["mandatory_completed"] = combined["mandatory_completed"].fillna(0).astype(int)

    rows: list[dict[str, Any]] = []
    for record in combined.to_dict("records"):
        headcount = int(record["headcount"])
        academy_nonattendee = int(record["academy_nonattendee"])
        isg_completed = int(record["isg_completed"])
        checklist_eligible = int(record["checklist_eligible"])
        checklist_completed = int(record["checklist_completed"])
        mandatory_assigned = int(record["mandatory_assigned"])
        mandatory_completed = int(record["mandatory_completed"])
        turnover_rate = finite_or_none(record.get("turnover_rate"))

        academy_rate = max(0.0, min(1.0, 1.0 - academy_nonattendee / headcount))
        isg_rate = max(0.0, min(1.0, isg_completed / headcount))
        mandatory_rate = (
            max(0.0, min(1.0, mandatory_completed / mandatory_assigned))
            if mandatory_assigned > 0
            else None
        )
        checklist_rate = (
            max(0.0, min(1.0, checklist_completed / checklist_eligible))
            if checklist_eligible > 0
            else None
        )
        turnover_points = turnover_score(turnover_rate)

        component_scores = [
            academy_rate * 100.0,
            isg_rate * 100.0,
            mandatory_rate * 100.0 if mandatory_rate is not None else None,
            turnover_points,
            checklist_rate * 100.0 if checklist_rate is not None else None,
        ]
        finite_scores = [value for value in component_scores if value is not None]
        average_score = (
            float(sum(finite_scores) / len(finite_scores)) if finite_scores else None
        )
        missing_components = [
            label
            for label, value in zip(
                ["Akademi", "İSG", "Zorunlu Eğitim", "Turnover", "Checklist"],
                component_scores,
            )
            if value is None
        ]

        rows.append(
            {
                "store": record["store"],
                "region": record["region"],
                "city": record["city"],
                "headcount": headcount,
                "turnover_rate": turnover_rate,
                "academy_rate": academy_rate,
                "isg_rate": isg_rate,
                "mandatory_rate": mandatory_rate,
                "turnover_score": turnover_points,
                "checklist_rate": checklist_rate,
                "average_score": average_score,
                "score_band": score_band(average_score),
                "metric_count": len(finite_scores),
                "missing_components": missing_components,
                "academy_nonattendee": academy_nonattendee,
                "isg_completed": isg_completed,
                "mandatory_assigned": mandatory_assigned,
                "mandatory_completed": mandatory_completed,
                "checklist_eligible": checklist_eligible,
                "checklist_completed": checklist_completed,
                "turnover_exits": finite_or_none(record.get("cikis")),
                "turnover_period_start": finite_or_none(record.get("donem_basi")),
                "turnover_period_end": finite_or_none(record.get("donem_sonu")),
                "turnover_avg_headcount": finite_or_none(
                    record.get("turnover_avg_headcount")
                ),
            }
        )

    rows.sort(
        key=lambda row: (
            row["average_score"] is None,
            row["average_score"] if row["average_score"] is not None else 999.0,
            rd.normalize_key(row["store"]),
        )
    )

    invariant_errors: list[str] = []
    if len({rd.normalize_key(row["store"]) for row in rows}) != len(rows):
        invariant_errors.append("Mağaza satırları benzersiz değil")
    for row in rows:
        if row["academy_nonattendee"] > row["headcount"]:
            invariant_errors.append(f"Akademi payı fiili sayıyı aşıyor: {row['store']}")
        if row["isg_completed"] > row["headcount"]:
            invariant_errors.append(f"İSG payı fiili sayıyı aşıyor: {row['store']}")
        if row["mandatory_completed"] > row["mandatory_assigned"]:
            invariant_errors.append(f"Zorunlu eğitim payı paydayı aşıyor: {row['store']}")
        if row["checklist_completed"] > row["checklist_eligible"]:
            invariant_errors.append(f"Checklist payı paydayı aşıyor: {row['store']}")
        if row["average_score"] is not None and not 0 <= row["average_score"] <= 100:
            invariant_errors.append(f"Ortalama skor aralık dışında: {row['store']}")
    if invariant_errors:
        raise RuntimeError("; ".join(invariant_errors[:10]))

    source_counts = {
        "fiili_rows": int(len(fiili)),
        "active_store_employees": int(len(active)),
        "academy_nonattendee_rows": int(len(academy)),
        "isg_rows": int(len(isg)),
        "mandatory_rows": int(len(mandatory)),
        "checklist_rows": int(len(checklist)),
    }
    coverage = {
        "turnover_store_count": int(sum(row["turnover_rate"] is not None for row in rows)),
        "mandatory_store_count": int(sum(row["mandatory_rate"] is not None for row in rows)),
        "checklist_store_count": int(sum(row["checklist_rate"] is not None for row in rows)),
    }

    data = {
        "meta": {
            "title": "Mağaza Eğitim ve Uyum Skor Kartı",
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "source_file": xlsx_path.name,
            "source_modified_at": datetime.fromtimestamp(
                xlsx_path.stat().st_mtime
            ).isoformat(timespec="seconds"),
            "latest_turnover_month": latest_turnover_month,
            "checklist_hire_cutoff": CHECKLIST_HIRE_CUTOFF.strftime("%d.%m.%Y"),
            "store_count": len(rows),
            "employee_count": int(len(active)),
        },
        "rows": rows,
        "quality": {
            "source_counts": source_counts,
            "coverage": coverage,
            "invariant_errors": [],
        },
    }
    log(
        f"Kapsam: {len(rows)} mağaza, {len(active):,} tekil aktif çalışan, "
        f"turnover dönemi {latest_turnover_month or 'yok'}"
    )
    return rd.sanitize(data)


HTML_TEMPLATE = r'''<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Mağaza Eğitim ve Uyum Skor Kartı</title>
  <style>
    :root {
      --ink:#10243d; --muted:#607087; --paper:#f6f2e9; --panel:#fffdf8;
      --line:#d8d3c7; --navy:#16324f; --teal:#1e7568; --teal-soft:#dceee8;
      --amber:#c77b19; --amber-soft:#fff0d4; --red:#ba433f; --red-soft:#f9dfdc;
      --blue:#3266a8; --blue-soft:#e3edf8; --shadow:0 18px 55px rgba(28,42,56,.10);
      --radius:20px;
    }
    *{box-sizing:border-box}
    html{scroll-behavior:smooth}
    body{margin:0;color:var(--ink);font-family:"Aptos","Segoe UI",sans-serif;background:
      radial-gradient(circle at 8% -4%,rgba(30,117,104,.16),transparent 30rem),
      radial-gradient(circle at 94% 5%,rgba(199,123,25,.13),transparent 28rem),var(--paper)}
    button,input,select{font:inherit}
    button{cursor:pointer}
    .shell{width:min(1760px,calc(100% - 32px));margin:0 auto;padding:28px 0 54px}
    .hero{position:relative;overflow:hidden;border-radius:28px;background:linear-gradient(120deg,#102c49,#174d59 58%,#7b5b2e);color:#fff;padding:30px 34px;box-shadow:var(--shadow)}
    .hero:after{content:"";position:absolute;width:330px;height:330px;border:1px solid rgba(255,255,255,.16);border-radius:50%;right:-72px;top:-155px;box-shadow:0 0 0 48px rgba(255,255,255,.035),0 0 0 96px rgba(255,255,255,.025)}
    .eyebrow{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#bce4da;font-weight:800}
    h1{position:relative;z-index:1;margin:8px 0 8px;font-family:Georgia,"Times New Roman",serif;font-size:clamp(30px,4vw,54px);font-weight:600;letter-spacing:-.035em}
    .hero p{position:relative;z-index:1;margin:0;max-width:920px;color:#d7e3e8;line-height:1.55}
    .hero-meta{position:relative;z-index:1;display:flex;flex-wrap:wrap;gap:8px;margin-top:19px}
    .hero-meta span{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);padding:7px 10px;border-radius:999px;font-size:12px}
    .filters{position:sticky;top:8px;z-index:30;display:grid;grid-template-columns:minmax(220px,1.4fr) repeat(3,minmax(150px,.65fr)) auto;gap:10px;margin:16px 0;padding:12px;background:rgba(255,253,248,.92);border:1px solid rgba(216,211,199,.9);border-radius:18px;box-shadow:0 10px 35px rgba(28,42,56,.08);backdrop-filter:blur(14px)}
    .field{display:grid;gap:5px}.field label{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
    .control{width:100%;height:42px;border:1px solid var(--line);background:#fff;border-radius:11px;padding:0 12px;color:var(--ink);outline:none}
    .control:focus{border-color:var(--teal);box-shadow:0 0 0 3px rgba(30,117,104,.12)}
    .btn{align-self:end;height:42px;border:0;border-radius:11px;padding:0 15px;background:var(--navy);color:#fff;font-weight:750}
    .btn.secondary{background:#e8e4da;color:var(--ink)}
    .kpis{display:grid;grid-template-columns:repeat(6,minmax(150px,1fr));gap:12px;margin:16px 0}
    .kpi{min-height:126px;padding:17px;border:1px solid var(--line);border-radius:17px;background:rgba(255,253,248,.94);box-shadow:0 10px 32px rgba(28,42,56,.06)}
    .kpi .label{font-size:11px;text-transform:uppercase;letter-spacing:.085em;color:var(--muted);font-weight:800}
    .kpi .value{font-family:Georgia,"Times New Roman",serif;font-size:34px;line-height:1;margin-top:13px}
    .kpi .sub{font-size:11px;color:var(--muted);margin-top:9px;line-height:1.35}
    .grid{display:grid;grid-template-columns:1.2fr .8fr;gap:14px;margin:14px 0}
    .panel{border:1px solid var(--line);border-radius:var(--radius);background:var(--panel);box-shadow:var(--shadow);padding:20px;min-width:0}
    .panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:16px}
    .panel h2{margin:0;font-size:18px}.panel .desc{margin:5px 0 0;font-size:12px;color:var(--muted);line-height:1.45}
    .metric-bars{display:grid;gap:12px}.metric-row{display:grid;grid-template-columns:150px 1fr 54px;gap:12px;align-items:center}.metric-row .name{font-size:12px;font-weight:750}.track{height:12px;border-radius:999px;background:#e9e5dc;overflow:hidden}.fill{height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--blue),var(--teal));transition:width .45s ease}.metric-row .score{text-align:right;font-variant-numeric:tabular-nums;font-weight:800}
    .distribution{display:grid;gap:10px}.dist-row{display:grid;grid-template-columns:92px 1fr 34px;gap:10px;align-items:center;font-size:12px}.dist-track{height:26px;border-radius:8px;background:#eee9df;overflow:hidden}.dist-fill{height:100%;min-width:2px;display:flex;align-items:center;padding-left:8px;color:#fff;font-weight:800}.dist-fill.good{background:var(--teal)}.dist-fill.watch{background:var(--amber)}.dist-fill.risk{background:var(--red)}.dist-fill.missing{background:#8b96a5}
    .actions{display:grid;gap:8px}.action{display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:12px;padding:11px 12px;border:1px solid var(--line);border-radius:12px;background:#fff}.action b{font-size:12px}.action small{display:block;color:var(--muted);margin-top:3px}.score-pill{align-self:center;padding:6px 9px;border-radius:999px;font-weight:850;font-size:12px}
    .table-panel{padding:0;overflow:hidden}.table-title{padding:20px 20px 14px}.table-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.result-count{font-size:12px;color:var(--muted);font-weight:700}
    .table-wrap{overflow:auto;max-height:70vh;border-top:1px solid var(--line);scrollbar-color:#7890a4 #ece8df;scrollbar-width:auto}
    table{width:100%;border-collapse:separate;border-spacing:0;min-width:1420px;font-size:12px}
    th{position:sticky;top:0;z-index:6;background:#e9dfcf;color:#18304b;text-align:left;padding:12px 10px;border-bottom:1px solid #cbbfae;white-space:nowrap;cursor:pointer;user-select:none}
    th:first-child{left:0;z-index:8}td:first-child{position:sticky;left:0;z-index:3;background:#fffdf8;min-width:270px}
    td{padding:10px;border-bottom:1px solid #ece7de;vertical-align:middle;background:#fffdf8}
    tbody tr:hover td{background:#f1f6f2}tbody tr:hover td:first-child{background:#f1f6f2}
    tbody tr.selected td{background:#e6f0ed;font-weight:650}tbody tr.selected td:first-child{background:#e6f0ed}
    .store-name{font-weight:800;color:#173b56}.store-sub{display:block;color:var(--muted);font-size:10px;margin-top:3px}
    .metric{display:inline-grid;gap:3px;min-width:86px;padding:7px 8px;border-radius:10px;font-variant-numeric:tabular-nums}.metric strong{font-size:13px}.metric small{font-size:9px;color:inherit;opacity:.78;white-space:nowrap}.good{background:var(--teal-soft);color:#155b51}.watch{background:var(--amber-soft);color:#87510d}.risk{background:var(--red-soft);color:#8e302d}.missing{background:#e9edf1;color:#607087}
    .number{text-align:right;font-variant-numeric:tabular-nums}.center{text-align:center}.sort-mark{opacity:.5;margin-left:4px}
    details.guide{margin-top:14px;border:1px solid var(--line);border-radius:16px;background:var(--panel);box-shadow:0 8px 24px rgba(28,42,56,.05)}
    details.guide summary{cursor:pointer;padding:16px 18px;font-weight:850;list-style:none}details.guide summary::-webkit-details-marker{display:none}.guide-body{padding:0 18px 18px;display:grid;grid-template-columns:repeat(2,minmax(260px,1fr));gap:12px}.formula{padding:13px;border-radius:12px;background:#f1eee7}.formula b{display:block;margin-bottom:5px}.formula code{font-size:11px;white-space:normal;color:#27465f}.formula p{font-size:11px;color:var(--muted);line-height:1.45;margin:6px 0 0}
    footer{padding:20px 4px 0;color:var(--muted);font-size:11px;text-align:center}
    @media(max-width:1180px){.filters{grid-template-columns:repeat(2,minmax(0,1fr))}.kpis{grid-template-columns:repeat(3,1fr)}.grid{grid-template-columns:1fr}}
    @media(max-width:680px){.shell{width:min(100% - 16px,1760px);padding-top:8px}.hero{padding:23px 20px;border-radius:20px}.filters{position:relative;top:auto;grid-template-columns:1fr}.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.kpi{min-height:110px}.kpi .value{font-size:28px}.panel{padding:15px}.guide-body{grid-template-columns:1fr}.metric-row{grid-template-columns:112px 1fr 45px}.table-title{padding:15px}td:first-child{min-width:220px}}
    @media print{body{background:#fff}.filters,.table-actions,details.guide{display:none}.shell{width:100%;padding:0}.hero{box-shadow:none}.panel{box-shadow:none}.table-wrap{max-height:none;overflow:visible}table{min-width:0;font-size:8px}th,td{position:static!important;padding:5px}.kpis{grid-template-columns:repeat(6,1fr)}}
  </style>
</head>
<body>
  <main class="shell">
    <header class="hero">
      <div class="eyebrow">İK Operasyon Kontrolü</div>
      <h1>Mağaza Eğitim ve Uyum Skor Kartı</h1>
      <p>Fiili çalışan kapsamını; Satış Akademisi, İSG, zorunlu eğitim, checklist ve kanonik turnover hesabıyla aynı mağaza satırında birleştiren karar ekranı.</p>
      <div class="hero-meta" id="heroMeta"></div>
    </header>

    <section class="filters" aria-label="Mağaza filtreleri">
      <div class="field"><label for="search">Mağaza Ara</label><input class="control" id="search" type="search" placeholder="Mağaza kodu veya adı"></div>
      <div class="field"><label for="region">Bölge</label><select class="control" id="region"></select></div>
      <div class="field"><label for="city">İl</label><select class="control" id="city"></select></div>
      <div class="field"><label for="band">Skor Durumu</label><select class="control" id="band"></select></div>
      <button class="btn secondary" id="reset" type="button">Filtreleri Temizle</button>
    </section>

    <section class="kpis" id="kpis"></section>

    <section class="grid">
      <article class="panel"><div class="panel-head"><div><h2>Metrik Nabzı</h2><p class="desc">Seçili mağazaların toplu pay/payda sonuçları.</p></div></div><div class="metric-bars" id="metricBars"></div></article>
      <article class="panel"><div class="panel-head"><div><h2>Skor Dağılımı</h2><p class="desc">Görsel bantlar resmi eşik değil, aksiyon önceliği göstergesidir.</p></div></div><div class="distribution" id="distribution"></div></article>
    </section>

    <section class="panel" style="margin-bottom:14px"><div class="panel-head"><div><h2>Öncelikli Mağazalar</h2><p class="desc">Seçili kapsamda ortalama skoru en düşük mağazalar.</p></div></div><div class="actions" id="actions"></div></section>

    <section class="panel table-panel">
      <div class="table-title panel-head">
        <div><h2>Mağaza Skor Kartı</h2><p class="desc">Her hücrede oranla birlikte hesaplamanın pay/payda karşılığı gösterilir.</p></div>
        <div class="table-actions"><span class="result-count" id="resultCount"></span><button class="btn" id="export" type="button">Filtreleneni CSV İndir</button></div>
      </div>
      <div class="table-wrap"><table><thead><tr id="headRow"></tr></thead><tbody id="tableBody"></tbody></table></div>
    </section>

    <details class="guide">
      <summary>Hesaplama Rehberi ve Veri Kapsamı</summary>
      <div class="guide-body">
        <div class="formula"><b>Akademi Katılım Oranı</b><code>1 - (Katılmayan tekil sicil / Fiili mağaza çalışanı)</code><p>Katılmayanlar listesi mevcut doğrulanmış Satış Akademisi uygunluk ve tarihsel katılım mantığından gelir.</p></div>
        <div class="formula"><b>İSG Oranı</b><code>İSG durumu "Tamamladı" olan aktif tekil sicil / Fiili mağaza çalışanı</code><p>Tekrarlı İSG kayıtları kişiyi birden fazla saymaz.</p></div>
        <div class="formula"><b>Zorunlu Eğitim</b><code>Mağazanın "Tamamladı" atama satırı / Mağazanın tüm zorunlu eğitim atama satırı</code><p>Bu metrik kişi değil eğitim ataması bazındadır.</p></div>
        <div class="formula"><b>Turnover ve Puanı</b><code>Çıkış / ((Dönem Başı + Dönem Sonu) / 2)</code><p>%0 = 100 puan; %0'dan büyük ve %10'dan küçük = 80; %10-%20 arası = 60; %20 ve üzeri = 40.</p></div>
        <div class="formula"><b>Checklist</b><code>Tamamlayan uygun tekil sicil / 10.12.2024 sonrası işe giren aktif tekil sicil</code><p>Payda sıfırsa metrik hesaplanamaz ve ortalamaya girmez.</p></div>
        <div class="formula"><b>Ortalama</b><code>Hesaplanabilen beş 0-100 skorun aritmetik ortalaması</code><p>Null metrikler dışarıda bırakılır; "n/5 metrik" bilgisi kapsamı açıklar.</p></div>
      </div>
    </details>
    <footer id="footer"></footer>
  </main>
  <script>
  const DATA=__DATA__;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const trSort=(a,b)=>String(a??'').localeCompare(String(b??''),'tr',{numeric:true,sensitivity:'base'});
  const nfmt=(v,d=0)=>Number(v).toLocaleString('tr-TR',{minimumFractionDigits:d,maximumFractionDigits:d});
  const ratio100=v=>v==null?'—':nfmt(Number(v)*100,1);
  const monthLabel=v=>{if(!v)return 'Veri yok';const [y,m]=v.split('-').map(Number);return new Intl.DateTimeFormat('tr-TR',{month:'long',year:'numeric'}).format(new Date(y,m-1,1));};
  const state={query:'',region:'Tümü',city:'Tümü',band:'Tümü',sort:'average_score',dir:'asc',selected:null};
  const columns=[
    ['store','Mağaza','text'],['turnover_rate','Son Turnover (0-100)','metric'],['academy_rate','Akademi Katılım (0-100)','metric'],
    ['isg_rate','İSG Oranı (0-100)','metric'],['mandatory_rate','Zorunlu Eğitim (0-100)','metric'],['turnover_score','Turnover Puanı','number'],
    ['checklist_rate','Checklist (0-100)','metric'],['average_score','Ortalama','number'],['headcount','Fiili Çalışan','number'],
    ['region','Bölge','text'],['city','İl','text']
  ];
  function fillSelect(id,values,label){const el=$(id);el.innerHTML=`<option value="Tümü">${label}</option>`+values.map(v=>`<option>${esc(v)}</option>`).join('');}
  function init(){
    fillSelect('region',[...new Set(DATA.rows.map(r=>r.region))].sort(trSort),'Tüm Bölgeler');
    fillSelect('city',[...new Set(DATA.rows.map(r=>r.city))].sort(trSort),'Tüm İller');
    fillSelect('band',['Güçlü','İzlemeli','Aksiyon','Eksik Metrik'],'Tüm Skorlar');
    $('heroMeta').innerHTML=`<span>${nfmt(DATA.meta.store_count)} mağaza</span><span>${nfmt(DATA.meta.employee_count)} aktif çalışan</span><span>Turnover: ${esc(monthLabel(DATA.meta.latest_turnover_month))}</span><span>Üretim: ${esc(new Date(DATA.meta.generated_at).toLocaleString('tr-TR'))}</span>`;
    $('footer').textContent=`Kaynak: ${DATA.meta.source_file} · Çalışan düzeyi kişisel veri bu HTML'e gömülmemiştir.`;
    $('search').addEventListener('input',e=>{state.query=e.target.value.trim().toLocaleLowerCase('tr-TR');render();});
    ['region','city','band'].forEach(id=>$(id).addEventListener('change',e=>{state[id]=e.target.value;render();}));
    $('reset').addEventListener('click',()=>{state.query='';state.region=state.city=state.band='Tümü';$('search').value='';['region','city','band'].forEach(id=>$(id).value='Tümü');render();});
    $('export').addEventListener('click',exportCsv);
    renderHead();render();
  }
  function filtered(){return DATA.rows.filter(r=>(!state.query||`${r.store} ${r.region} ${r.city}`.toLocaleLowerCase('tr-TR').includes(state.query))&&(state.region==='Tümü'||r.region===state.region)&&(state.city==='Tümü'||r.city===state.city)&&(state.band==='Tümü'||r.score_band===state.band));}
  function sortedRows(){const rows=[...filtered()];const key=state.sort,dir=state.dir==='asc'?1:-1;rows.sort((a,b)=>{const av=a[key],bv=b[key];if(av==null&&bv==null)return trSort(a.store,b.store);if(av==null)return 1;if(bv==null)return -1;if(typeof av==='number'&&typeof bv==='number')return (av-bv)*dir;return trSort(av,bv)*dir;});return rows;}
  function aggregate(rows){
    const sum=k=>rows.reduce((s,r)=>s+(Number(r[k])||0),0), ratio=(a,b)=>b>0?a/b:null;
    const hc=sum('headcount'),mand=sum('mandatory_assigned'),eligible=sum('checklist_eligible'),turnBase=sum('turnover_avg_headcount'),scored=rows.filter(r=>r.average_score!=null),turnScored=rows.filter(r=>r.turnover_score!=null);
    return {stores:rows.length,hc,academy:hc?1-sum('academy_nonattendee')/hc:null,isg:ratio(sum('isg_completed'),hc),mandatory:ratio(sum('mandatory_completed'),mand),checklist:ratio(sum('checklist_completed'),eligible),turnover:ratio(sum('turnover_exits'),turnBase),turnoverPoints:turnScored.length?turnScored.reduce((s,r)=>s+r.turnover_score,0)/turnScored.length:null,avg:scored.length?scored.reduce((s,r)=>s+r.average_score,0)/scored.length:null,academyGap:sum('academy_nonattendee'),isgDone:sum('isg_completed'),mandDone:sum('mandatory_completed'),mand,checkDone:sum('checklist_completed'),eligible};
  }
  function scoreClass(v){return v==null?'missing':v>=85?'good':v>=70?'watch':'risk';}
  function renderKpis(rows){const a=aggregate(rows);const cards=[
    ['Mağaza',nfmt(a.stores),'seçili kapsam'],['Fiili Çalışan',nfmt(a.hc),'tekil aktif sicil'],['Mağaza Skoru Ort.',a.avg==null?'—':nfmt(a.avg,1),`${rows.filter(r=>r.average_score!=null).length} hesaplanabilir mağaza`],
    ['Toplu Turnover (0-100)',ratio100(a.turnover),monthLabel(DATA.meta.latest_turnover_month)],['Akademi Açığı',nfmt(a.academyGap),`katılmayan tekil çalışan`],['Checklist Açığı',nfmt(Math.max(0,a.eligible-a.checkDone)),`${nfmt(a.eligible)} uygun çalışan`]
    ];$('kpis').innerHTML=cards.map(([l,v,s])=>`<article class="kpi"><div class="label">${esc(l)}</div><div class="value">${esc(v)}</div><div class="sub">${esc(s)}</div></article>`).join('');}
  function renderMetricBars(rows){const a=aggregate(rows);const metrics=[['Akademi',a.academy],['İSG',a.isg],['Zorunlu Eğitim',a.mandatory],['Checklist',a.checklist],['Turnover Puanı',a.turnoverPoints==null?null:a.turnoverPoints/100]];$('metricBars').innerHTML=metrics.map(([name,v])=>`<div class="metric-row"><span class="name">${esc(name)}</span><div class="track"><div class="fill" style="width:${v==null?0:Math.max(0,Math.min(100,v*100))}%"></div></div><span class="score">${v==null?'—':nfmt(v*100,1)}</span></div>`).join('');}
  function renderDistribution(rows){const bands=[['Güçlü','good'],['İzlemeli','watch'],['Aksiyon','risk'],['Eksik Metrik','missing']],max=Math.max(1,...bands.map(([b])=>rows.filter(r=>r.score_band===b).length));$('distribution').innerHTML=bands.map(([b,c])=>{const count=rows.filter(r=>r.score_band===b).length;return `<div class="dist-row"><b>${b}</b><div class="dist-track"><div class="dist-fill ${c}" style="width:${count/max*100}%"></div></div><strong>${count}</strong></div>`;}).join('');}
  function weakLabels(r){const vals=[['Akademi',r.academy_rate==null?null:r.academy_rate*100],['İSG',r.isg_rate==null?null:r.isg_rate*100],['Zorunlu Eğitim',r.mandatory_rate==null?null:r.mandatory_rate*100],['Turnover',r.turnover_score],['Checklist',r.checklist_rate==null?null:r.checklist_rate*100]].filter(x=>x[1]!=null).sort((a,b)=>a[1]-b[1]);return vals.slice(0,2).map(x=>`${x[0]} ${nfmt(x[1],1)}`).join(' · ');}
  function renderActions(rows){const action=[...rows].filter(r=>r.average_score!=null).sort((a,b)=>a.average_score-b.average_score).slice(0,8);$('actions').innerHTML=action.length?action.map(r=>`<div class="action"><div><b>${esc(r.store)}</b><small>${esc(r.region)} · ${esc(weakLabels(r))}</small></div><span class="score-pill ${scoreClass(r.average_score)}">${nfmt(r.average_score,1)}</span></div>`).join(''):'<div class="desc">Seçili kapsamda hesaplanabilir mağaza yok.</div>';}
  function renderHead(){$('headRow').innerHTML=columns.map(([key,label])=>`<th data-key="${key}">${esc(label)}<span class="sort-mark" id="sort-${key}"></span></th>`).join('');$('headRow').querySelectorAll('th').forEach(th=>th.addEventListener('click',()=>{const k=th.dataset.key;if(state.sort===k)state.dir=state.dir==='asc'?'desc':'asc';else{state.sort=k;state.dir=k==='store'?'asc':'desc';}render();}));}
  function metricHtml(value,detail,scoreValue){if(value==null)return '<span class="metric missing"><strong>—</strong><small>Hesaplanamadı</small></span>';return `<span class="metric ${scoreClass(scoreValue)}"><strong>${ratio100(value)}</strong><small>${esc(detail)}</small></span>`;}
  function scoreHtml(value,detail=''){if(value==null)return '<span class="metric missing"><strong>—</strong><small>Hesaplanamadı</small></span>';return `<span class="metric ${scoreClass(value)}"><strong>${nfmt(value,1)}</strong><small>${esc(detail)}</small></span>`;}
  function renderTable(rows){$('resultCount').textContent=`${nfmt(rows.length)} / ${nfmt(DATA.rows.length)} mağaza gösteriliyor`;$('tableBody').innerHTML=rows.map((r,i)=>`<tr data-id="${esc(r.store)}" class="${state.selected===r.store?'selected':''}"><td><span class="store-name">${esc(r.store)}</span><span class="store-sub">${esc(r.region)} · ${esc(r.city)}</span></td><td>${metricHtml(r.turnover_rate,r.turnover_rate==null?'':`${nfmt(r.turnover_exits)} çıkış / ${nfmt(r.turnover_avg_headcount,1)} ort.`,r.turnover_score)}</td><td>${metricHtml(r.academy_rate,`${nfmt(r.academy_nonattendee)} eksik / ${nfmt(r.headcount)} fiili`,r.academy_rate==null?null:r.academy_rate*100)}</td><td>${metricHtml(r.isg_rate,`${nfmt(r.isg_completed)} tamamladı / ${nfmt(r.headcount)} fiili`,r.isg_rate==null?null:r.isg_rate*100)}</td><td>${metricHtml(r.mandatory_rate,`${nfmt(r.mandatory_completed)} / ${nfmt(r.mandatory_assigned)} atama`,r.mandatory_rate==null?null:r.mandatory_rate*100)}</td><td>${scoreHtml(r.turnover_score,'0/10/20% eşikleri')}</td><td>${metricHtml(r.checklist_rate,`${nfmt(r.checklist_completed)} / ${nfmt(r.checklist_eligible)} uygun`,r.checklist_rate==null?null:r.checklist_rate*100)}</td><td>${scoreHtml(r.average_score,`${r.metric_count}/5 metrik`)}</td><td class="number"><b>${nfmt(r.headcount)}</b></td><td>${esc(r.region)}</td><td>${esc(r.city)}</td></tr>`).join('');$('tableBody').querySelectorAll('tr').forEach(tr=>tr.addEventListener('click',()=>{state.selected=state.selected===tr.dataset.id?null:tr.dataset.id;renderTable(sortedRows());}));columns.forEach(([k])=>{const el=$(`sort-${k}`);if(el)el.textContent=state.sort===k?(state.dir==='asc'?'▲':'▼'):'';});}
  function render(){const rows=sortedRows();renderKpis(rows);renderMetricBars(rows);renderDistribution(rows);renderActions(rows);renderTable(rows);}
  function csvCell(v){const s=String(v??'').replace(/"/g,'""');return `"${s}"`;}
  function csvNumber(v,d=2){return v==null?'':Number(v).toFixed(d).replace('.',',');}
  function exportCsv(){const rows=sortedRows(),headers=['Mağaza','Turnover (0-100)','Akademi Katılım (0-100)','İSG (0-100)','Zorunlu Eğitim (0-100)','Turnover Puanı','Checklist (0-100)','Ortalama','Fiili Çalışan','Bölge','İl','Hesaplanan Metrik'];const body=rows.map(r=>[csvCell(r.store),csvNumber(r.turnover_rate==null?null:r.turnover_rate*100),csvNumber(r.academy_rate==null?null:r.academy_rate*100),csvNumber(r.isg_rate==null?null:r.isg_rate*100),csvNumber(r.mandatory_rate==null?null:r.mandatory_rate*100),csvNumber(r.turnover_score),csvNumber(r.checklist_rate==null?null:r.checklist_rate*100),csvNumber(r.average_score),csvNumber(r.headcount,0),csvCell(r.region),csvCell(r.city),csvCell(`${r.metric_count}/5`)].join(';'));const csv='\ufeff'+[headers.map(csvCell).join(';'),...body].join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`magaza_uyum_skor_karti_${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);}
  init();
  </script>
</body>
</html>'''


def write_html(data: dict[str, Any], output_path: Path) -> None:
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace(
        "</", "<\\/"
    )
    html = HTML_TEMPLATE.replace("__DATA__", payload)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = output_path.with_name(f".{output_path.name}.{os.getpid()}.tmp")
    temp_path.write_text(html, encoding="utf-8")
    if temp_path.stat().st_size <= 10_000 or "</html>" not in html[-200:]:
        temp_path.unlink(missing_ok=True)
        raise RuntimeError("Mağaza uyum dashboardu çıktısı eksik veya beklenenden küçük.")
    os.replace(temp_path, output_path)
    log(f"Çıktı üretildi: {output_path.name} ({output_path.stat().st_size / 1024:,.1f} KB)")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Mağaza eğitim ve uyum skor kartı dashboardunu üretir."
    )
    parser.add_argument("--xlsx", type=Path, default=DEFAULT_XLSX)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    data = build_dashboard_data(args.xlsx.resolve())
    write_html(data, args.output.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
