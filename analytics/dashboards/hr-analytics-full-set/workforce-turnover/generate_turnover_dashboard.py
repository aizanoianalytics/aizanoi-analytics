"""Generate the standalone Aizanoi workforce turnover analytics dashboard."""

from __future__ import annotations

import argparse
import json
import math
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import pandas as pd

from dashboard_paths import ICMAL_XLSX, TURNOVER_DASHBOARD, ensure_dashboard_dir
from turnover_analytics_common import (
    UNMATCHED_REASON,
    build_turnover_analysis_tables,
    clean_turnover_text,
    normalize_turnover_key,
)
from turnover_dashboard_template import HTML_TEMPLATE


def log(message: str) -> None:
    print(f"[TURNOVER] {message}", flush=True)


def _sheet_name(excel: pd.ExcelFile, candidates: Iterable[str]) -> str | None:
    by_key = {
        normalize_turnover_key(name): name
        for name in excel.sheet_names
    }
    for candidate in candidates:
        match = by_key.get(normalize_turnover_key(candidate))
        if match:
            return match
    return None


def _read_sheet(
    excel: pd.ExcelFile,
    candidates: Iterable[str],
    *,
    required: bool = False,
) -> pd.DataFrame:
    name = _sheet_name(excel, candidates)
    if not name:
        if required:
            raise RuntimeError(
                "Zorunlu sheet bulunamadı: " + " / ".join(candidates)
            )
        return pd.DataFrame()
    log(f"Sheet okunuyor: {name}")
    return pd.read_excel(excel, sheet_name=name)


def _clean_frame(frame: pd.DataFrame) -> pd.DataFrame:
    if frame is None or frame.empty:
        return pd.DataFrame(columns=list(frame.columns) if frame is not None else [])
    output = frame.copy()
    output.columns = [clean_turnover_text(column) for column in output.columns]
    for column in output.columns:
        if pd.api.types.is_object_dtype(output[column]) or pd.api.types.is_string_dtype(
            output[column]
        ):
            output[column] = output[column].map(clean_turnover_text)
    return output


def _json_number(value: Any) -> int | float | None:
    if value is None or pd.isna(value):
        return None
    number = float(value)
    if not math.isfinite(number):
        return None
    if number.is_integer():
        return int(number)
    return round(number, 10)


def _date_string(value: Any, *, month_only: bool = False) -> str | None:
    if value is None or pd.isna(value):
        return None
    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        text = clean_turnover_text(value)
        return text or None
    return parsed.strftime("%Y-%m" if month_only else "%Y-%m-%d")


def compact_frame(
    frame: pd.DataFrame,
    *,
    month_columns: Iterable[str] = ("donem",),
    date_columns: Iterable[str] = (),
) -> dict[str, Any]:
    """Dictionary-encode strings while keeping the dashboard fully offline."""

    if frame is None:
        frame = pd.DataFrame()
    work = _clean_frame(frame)
    columns = [str(column) for column in work.columns]
    month_set = set(month_columns)
    date_set = set(date_columns)
    dictionaries: dict[str, list[str | None]] = {}
    encoded_columns: dict[str, list[Any]] = {}

    for column in columns:
        series = work[column]
        if column in month_set:
            prepared = series.map(lambda value: _date_string(value, month_only=True))
            values = list(dict.fromkeys(prepared.tolist()))
            dictionaries[column] = values
            lookup = {value: index for index, value in enumerate(values)}
            encoded_columns[column] = [lookup[value] for value in prepared]
            continue
        if column in date_set or pd.api.types.is_datetime64_any_dtype(series):
            prepared = series.map(_date_string)
            values = list(dict.fromkeys(prepared.tolist()))
            dictionaries[column] = values
            lookup = {value: index for index, value in enumerate(values)}
            encoded_columns[column] = [lookup[value] for value in prepared]
            continue
        if pd.api.types.is_numeric_dtype(series):
            encoded_columns[column] = [_json_number(value) for value in series]
            continue

        prepared = series.map(lambda value: clean_turnover_text(value) or None)
        prepared_values = [
            None if value is None or pd.isna(value) else value
            for value in prepared.astype(object).tolist()
        ]
        values = list(dict.fromkeys(prepared_values))
        dictionaries[column] = values
        lookup = {value: index for index, value in enumerate(values)}
        encoded_columns[column] = [lookup[value] for value in prepared_values]

    rows = [
        [encoded_columns[column][row_index] for column in columns]
        for row_index in range(len(work))
    ]
    return {
        "columns": columns,
        "dictionaries": dictionaries,
        "rows": rows,
        "row_count": len(rows),
    }


def records(
    frame: pd.DataFrame,
    *,
    month_columns: Iterable[str] = ("donem",),
    date_columns: Iterable[str] = (),
) -> list[dict[str, Any]]:
    if frame is None or frame.empty:
        return []
    work = _clean_frame(frame)
    month_set = set(month_columns)
    date_set = set(date_columns)
    output: list[dict[str, Any]] = []
    for row in work.to_dict(orient="records"):
        clean_row: dict[str, Any] = {}
        for key, value in row.items():
            if key in month_set:
                clean_row[key] = _date_string(value, month_only=True)
            elif key in date_set or isinstance(value, (pd.Timestamp, datetime)):
                clean_row[key] = _date_string(value)
            elif isinstance(value, (np.integer, int)):
                clean_row[key] = int(value)
            elif isinstance(value, (np.floating, float)):
                clean_row[key] = _json_number(value)
            else:
                clean_row[key] = clean_turnover_text(value) or None
        output.append(clean_row)
    return output


def _latest_risk_rows(frame: pd.DataFrame) -> pd.DataFrame:
    if frame is None or frame.empty:
        return pd.DataFrame()
    work = _clean_frame(frame)
    period_col = next(
        (column for column in ["donem", "Dönem"] if column in work.columns),
        None,
    )
    if period_col:
        parsed = pd.to_datetime(work[period_col], errors="coerce")
        if parsed.notna().any():
            work = work.loc[parsed.eq(parsed.max())].copy()
    keep = [
        column
        for column in [
            "donem",
            "sicil_no",
            "adi_soyadi",
            "departman_adi",
            "isletme_adi",
            "gorev",
            "unvan",
            "kadro_adi",
            "risk_puani",
            "risk_seviyesi",
            "risk_aciklama",
        ]
        if column in work.columns
    ]
    if "risk_puani" in work.columns:
        work["risk_puani"] = pd.to_numeric(work["risk_puani"], errors="coerce")
        work = work.sort_values("risk_puani", ascending=False)
    return work[keep].reset_index(drop=True)


def _fallback_core_tables(
    excel: pd.ExcelFile,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    log("Kompakt turnover sheet'leri yok; Sonuc üzerinden güvenli fallback çalışıyor.")
    sonuc = _read_sheet(excel, ["Sonuc"], required=True)
    ayrilanlar = _read_sheet(
        excel,
        ["Ayrılanlar_Listesi", "Ayrilanlar_Listesi"],
    )
    fiili = _read_sheet(excel, ["fiili_list", "Fiili List"])
    return build_turnover_analysis_tables(sonuc, ayrilanlar, fiili)


def build_payload(xlsx_path: Path) -> dict[str, Any]:
    log(f"Kaynak açılıyor: {xlsx_path}")
    excel = pd.ExcelFile(xlsx_path)

    monthly = _read_sheet(excel, ["Turnover_Analiz_Aylik"])
    exits = _read_sheet(excel, ["Turnover_Cikis_Detay"])
    reasons = _read_sheet(excel, ["Turnover_Neden_Ayarlari"])
    if monthly.empty or exits.empty or reasons.empty:
        monthly, exits, reasons = _fallback_core_tables(excel)

    monthly = _clean_frame(monthly)
    exits = _clean_frame(exits)
    reasons = _clean_frame(reasons)

    forecasts = _read_sheet(excel, ["Sadece_Tahmin_Aylari"])
    backtest_summary = _read_sheet(excel, ["Tahmin_Backtest_Ozet"])
    backtest_detail = _read_sheet(excel, ["Tahmin_Backtest_Detay"])
    annual_backtest = _read_sheet(excel, ["Tahmin_Yillik_Backtest"])
    regrettable = _read_sheet(excel, ["V2_Regrettable_Turnover"])
    regrettable_detail = _read_sheet(excel, ["V2_Regrettable_Detail"])
    survival_curve = _read_sheet(excel, ["V2_Survival_Curve"])
    survival_summary = _read_sheet(excel, ["V2_Survival_Summary"])
    risk_regions = _read_sheet(excel, ["riski_yuksek_bolgeler"])
    risk_stores = _read_sheet(excel, ["riski_yuksek_magazalar"])
    risk_people = _latest_risk_rows(_read_sheet(excel, ["Magaza_ML_risk"]))

    months = sorted(
        {
            _date_string(value, month_only=True)
            for value in monthly.get("donem", pd.Series(dtype="object"))
            if _date_string(value, month_only=True)
        }
    )
    reason_counts = pd.to_numeric(
        reasons.loc[
            reasons.get("ayrilma_sebebi", pd.Series(index=reasons.index, dtype="object"))
            .ne(UNMATCHED_REASON),
            "kayit_sayisi",
        ]
        if "kayit_sayisi" in reasons.columns
        else pd.Series(dtype="float64"),
        errors="coerce",
    ).fillna(0)
    editable_reasons = reasons.loc[
        reasons.get(
            "ayrilma_sebebi",
            pd.Series(index=reasons.index, dtype="object"),
        ).ne(UNMATCHED_REASON)
    ].copy()
    exit_match = (
        exits.get("reason_match_status", pd.Series(dtype="object"))
        .map(clean_turnover_text)
        .str.startswith("Source list", na=False)
    )
    exit_weights = pd.to_numeric(
        exits.get("cikis", pd.Series(1, index=exits.index)),
        errors="coerce",
    ).fillna(0)

    payload = {
        "meta": {
            "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "source_file": xlsx_path.name,
            "min_month": months[0] if months else None,
            "latest_month": months[-1] if months else None,
            "month_count": len(months),
            "monthly_row_count": len(monthly),
            "exit_row_count": len(exits),
            "exit_reason_count": len(editable_reasons),
            "classified_source_count": int(exit_weights.loc[exit_match].sum())
            if len(exit_match)
            else 0,
            "unmatched_exit_count": int(exit_weights.loc[~exit_match].sum())
            if len(exit_match)
            else 0,
            "reason_record_count": int(reason_counts.sum()),
            "formula": "Exits / ((Opening Workforce + Closing Workforce) / 2)",
            "exit_metric": "cikis",
            "classification_default": "Unmatched reasons default to Voluntary.",
            "classification_note": (
                "The latest source-list exit reason is used for each synthetic ID. "
                "Settings change only the numerator; the denominator remains fixed."
            ),
            "scopes": [
                "Aizanoi Demo Group",
                "Retail",
                "Retail Part-Time",
                "Retail Full-Time",
                "Head Office",
                "Operations",
            ],
        },
        "monthly": compact_frame(monthly),
        "exits": compact_frame(
            exits,
            date_columns=(
                "ise_giris_tarihi",
                "cikis_tarihi",
                "ayrilanlar_cikis_tarihi",
            ),
        ),
        "reasons": records(editable_reasons, month_columns=()),
        "forecasts": records(
            forecasts,
            date_columns=("tahmin_tarihi",),
        ),
        "backtest_summary": records(backtest_summary, month_columns=()),
        "backtest_detail": records(backtest_detail),
        "annual_backtest": records(
            annual_backtest,
            month_columns=("hedef_donem", "egitim_bitis_donemi"),
        ),
        "regrettable": records(regrettable),
        "regrettable_detail": compact_frame(
            regrettable_detail,
            date_columns=("cikis_tarihi", "ise_giris_tarihi", "performans_donem"),
        ),
        "survival_curve": records(survival_curve, month_columns=()),
        "survival_summary": records(survival_summary, month_columns=()),
        "risk_regions": records(risk_regions, month_columns=()),
        "risk_stores": records(risk_stores, month_columns=()),
        "risk_people": compact_frame(risk_people),
    }
    return payload


def write_dashboard(payload: dict[str, Any], output_path: Path) -> Path:
    ensure_dashboard_dir()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    json_payload = json.dumps(
        payload,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
    ).replace("</", "<\\/")
    html = HTML_TEMPLATE.replace("__TURNOVER_DATA__", json_payload)
    style_match = re.search(r"<style>([\s\S]*?)</style>", html)
    script_matches = list(re.finditer(r"<script>([\s\S]*?)</script>", html))
    if not style_match or not script_matches:
        raise RuntimeError("Dashboard CSS or application script could not be extracted.")
    app_match = script_matches[-1]
    stylesheet = style_match.group(1).strip() + "\n"
    application = app_match.group(1).strip() + "\n"
    html = html[: app_match.start()] + '<script src="./app.js" defer></script>' + html[app_match.end() :]
    html = html[: style_match.start()] + '<link rel="stylesheet" href="./style.css">' + html[style_match.end() :]
    html = html.replace(
        '<script id="turnover-data" type="application/json">',
        '<div id="turnover-data" hidden>',
    ).replace("</script>\n  <script src=\"./app.js\"", "</div>\n  <script src=\"./app.js\"")
    (output_path.parent / "style.css").write_text(
        stylesheet,
        encoding="utf-8",
        newline="\n",
    )
    (output_path.parent / "app.js").write_text(
        application,
        encoding="utf-8",
        newline="\n",
    )
    temp_path = output_path.with_suffix(output_path.suffix + ".tmp")
    temp_path.write_text(html, encoding="utf-8", newline="\n")
    temp_path.replace(output_path)
    log(
        f"Dashboard yazıldı: {output_path} "
        f"({output_path.stat().st_size / 1024 / 1024:.2f} MB)"
    )
    return output_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--xlsx", type=Path, default=ICMAL_XLSX)
    parser.add_argument("--output", type=Path, default=TURNOVER_DASHBOARD)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    xlsx_path = args.xlsx.resolve()
    output_path = args.output.resolve()
    if not xlsx_path.exists():
        raise FileNotFoundError(f"Kaynak Excel bulunamadı: {xlsx_path}")
    payload = build_payload(xlsx_path)
    write_dashboard(payload, output_path)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        log(f"HATA: {exc}")
        raise
