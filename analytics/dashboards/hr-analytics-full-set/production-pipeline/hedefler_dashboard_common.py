"""2026 CEO ve şirket hedefleri için ortak veri ve puanlama sözleşmesi."""

from __future__ import annotations

import math
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd
from dashboard_paths import deterministic_build_time

from dashboard_build_common import clean_text, first_col, json_safe, normalize_key, numeric


PERIOD_DEFINITIONS = (
    {
        "key": "q1",
        "label": "Mart 2026",
        "short_label": "Q1",
        "range": "Q1 çeyrek verisi · Ocak-Mart",
        "tokens": ("31 mart", "q1"),
        "order": 1,
    },
    {
        "key": "q2",
        "label": "Haziran 2026",
        "short_label": "Q2",
        "range": "Q2 çeyrek verisi · Nisan-Haziran",
        "tokens": ("30 haziran", "q2"),
        "order": 2,
    },
    {
        "key": "q3",
        "label": "Eylül 2026",
        "short_label": "Q3",
        "range": "Q3 çeyrek verisi · Temmuz-Eylül",
        "tokens": ("30 eylul", "q3"),
        "order": 3,
    },
    {
        "key": "q4",
        "label": "Aralık 2026",
        "short_label": "Q4",
        "range": "Q4 çeyrek verisi · Ekim-Aralık",
        "tokens": ("31 aralik", "q4"),
        "order": 4,
    },
    {
        "key": "all",
        "label": "Tüm Yıl",
        "short_label": "Tüm Yıl",
        "range": "Dolu çeyrekler · toplanan KPI'da kümülatif, diğerinde son dönem",
        "tokens": (),
        "order": 5,
        "is_summary": True,
    },
)

QUARTER_KEYS = ("q1", "q2", "q3", "q4")

CATEGORY_ORDER = (
    "Büyüme & Finansal Performans",
    "Müşteri & Marka",
    "Operasyonel Verimlilik",
    "İnsan & Organizasyon",
    "Diğer Göstergeler",
)

STATUS_ORDER = ("Maksimum", "Hedef ve Üzeri", "Eşik-Hedef Arası", "Eşik Altı")

DISPLAY_COLUMN_LABELS = {
    "threshold": "%80 Eşik Hedef Değer",
    "target": "Hedef Değer",
    "maximum": "%120 Maksimum Hedef Değer",
    "quarters": {
        "q1": "Q1 Gerçekleşen Değer (1 Ocak-31 Mart)",
        "q2": "Q2 Gerçekleşen Değer (1 Nisan-30 Haziran)",
        "q3": "Q3 Gerçekleşen Değer (1 Temmuz-30 Eylül)",
        "q4": "Q4 Gerçekleşen Değer (1 Ekim-31 Aralık)",
    },
    "actual": "Kümüle Hedef Gerçekleşen Değer",
    "score": "Hedef Gerçekleşme",
    "projection": "Tahmini Yıl Sonu Hedef Gerçekleşen Değer",
}

SCORE_BANDS = (
    {
        "status": "Eşik Altı",
        "short_label": "Eşik altı",
        "range_label": "<80",
        "color_name": "Kırmızı",
        "color": "#dc2626",
        "minimum": None,
        "maximum_exclusive": 80,
    },
    {
        "status": "Eşik-Hedef Arası",
        "short_label": "Eşik-hedef arası",
        "range_label": "80–<100",
        "color_name": "Turuncu",
        "color": "#f59e0b",
        "minimum": 80,
        "maximum_exclusive": 100,
    },
    {
        "status": "Hedef ve Üzeri",
        "short_label": "Hedef ve üzeri",
        "range_label": "100–<120",
        "color_name": "Açık yeşil",
        "color": "#4ade80",
        "minimum": 100,
        "maximum_exclusive": 120,
    },
    {
        "status": "Maksimum",
        "short_label": "Maksimum",
        "range_label": "120 ve üzeri",
        "color_name": "Koyu yeşil",
        "color": "#047857",
        "minimum": 120,
        "maximum_exclusive": None,
    },
)

NON_PRORATED_METRIC_TOKENS = (
    "pazar payi",
    "marka performansi",
    "brut marj",
    "genel gider",
    "nps",
    "yeni musteri",
    "arvatoya",
    "stok devir",
    "cba",
)


def _finite_number(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def measurement_direction(value: Any) -> str:
    key = normalize_key(value)
    if "negatif" in key or "dusuk iyi" in key or "azalan" in key:
        return "Negatif"
    if "pozitif" in key or "yuksek iyi" in key or "artan" in key:
        return "Pozitif"
    return ""


def target_score(
    actual: Any,
    threshold: Any,
    target: Any,
    maximum: Any,
    direction: Any,
) -> float | None:
    """Map a KPI to the 0-120 target scale with piecewise interpolation.

    Threshold, target and maximum correspond to 80, 100 and 120 points.
    For positive KPIs higher values are better; for negative KPIs lower
    values are better. Values beyond the maximum target are capped at 120.
    """

    actual_num = _finite_number(actual)
    threshold_num = _finite_number(threshold)
    target_num = _finite_number(target)
    maximum_num = _finite_number(maximum)
    direction_name = measurement_direction(direction)
    if None in {actual_num, threshold_num, target_num, maximum_num} or not direction_name:
        return None

    assert actual_num is not None
    assert threshold_num is not None
    assert target_num is not None
    assert maximum_num is not None

    if direction_name == "Pozitif":
        if not threshold_num <= target_num <= maximum_num:
            return None
        if actual_num < threshold_num:
            if threshold_num <= 0:
                return 0.0
            return max(0.0, min(80.0, actual_num / threshold_num * 80.0))
        if actual_num == threshold_num:
            return 80.0
        if actual_num < target_num:
            width = target_num - threshold_num
            return 100.0 if width == 0 else 80.0 + (actual_num - threshold_num) / width * 20.0
        if actual_num == target_num:
            return 100.0
        if actual_num < maximum_num:
            width = maximum_num - target_num
            return 120.0 if width == 0 else 100.0 + (actual_num - target_num) / width * 20.0
        return 120.0

    if not threshold_num >= target_num >= maximum_num:
        return None
    if actual_num > threshold_num:
        width = threshold_num - target_num
        if width <= 0:
            return 0.0
        return max(0.0, 80.0 - (actual_num - threshold_num) / width * 20.0)
    if actual_num == threshold_num:
        return 80.0
    if actual_num > target_num:
        width = threshold_num - target_num
        return 100.0 if width == 0 else 80.0 + (threshold_num - actual_num) / width * 20.0
    if actual_num == target_num:
        return 100.0
    if actual_num > maximum_num:
        width = target_num - maximum_num
        return 120.0 if width == 0 else 100.0 + (target_num - actual_num) / width * 20.0
    return 120.0


def score_status(score: Any) -> str:
    value = _finite_number(score)
    if value is None:
        return "Veri Yok"
    if value >= 120 - 1e-9:
        return "Maksimum"
    if value >= 100:
        return "Hedef ve Üzeri"
    if value >= 80:
        return "Eşik-Hedef Arası"
    return "Eşik Altı"


def metric_category(value: Any) -> str:
    key = normalize_key(value)
    if any(
        token in key
        for token in (
            "ciro",
            "pazar payi",
            "marka performansi",
            "brut marj",
            "genel gider",
            "faaliyet kari",
            "serbest nakit",
        )
    ):
        return "Büyüme & Finansal Performans"
    if any(token in key for token in ("musteri", "nps")):
        return "Müşteri & Marka"
    if any(token in key for token in ("stok devir", "otif", "arvatoya", "depoya girme")):
        return "Operasyonel Verimlilik"
    if key.startswith("ik skoru") or any(token in key for token in ("calisan", "organizasyon", "insan")):
        return "İnsan & Organizasyon"
    return "Diğer Göstergeler"


def default_proration_rule(metric: Any) -> bool:
    """Return whether quarterly KPI values are additive by default.

    Additive KPI values are summed and their annual 80/100/120 targets are
    periodised by the number of populated quarters. Snapshot/rate KPI values
    use the latest populated quarter without summing or target periodisation.
    The browser can override this default per scope and KPI.
    """

    key = normalize_key(metric)
    return not any(token in key for token in NON_PRORATED_METRIC_TOKENS)


def _period_columns(frame: pd.DataFrame) -> dict[str, str]:
    result: dict[str, str] = {}
    for column in frame.columns:
        key = normalize_key(column)
        if "gerceklesen" not in key:
            continue
        for definition in PERIOD_DEFINITIONS:
            if definition["tokens"] and any(token in key for token in definition["tokens"]):
                result[str(definition["key"])] = str(column)
                break
    return result


def _source_quarter_contract(period_columns: dict[str, str]) -> str:
    """Detect the legacy year-to-date column contract from column labels."""

    later_headers = [
        normalize_key(period_columns[key])
        for key in ("q2", "q3", "q4")
        if key in period_columns
    ]
    return (
        "legacy_cumulative"
        if any("1 ocak" in header for header in later_headers)
        else "independent_quarters"
    )


def _normalise_independent_quarters(
    source_quarters: dict[str, float | None],
    *,
    source_contract: str,
) -> dict[str, float | None]:
    """Return independent quarter values regardless of the KPI rule.

    The independent representation must not depend on the default KPI setting:
    users can change a KPI from snapshot to additive (or back) in the browser.
    Keeping both ``source_quarters`` and this normalised representation lets
    that switch remain mathematically correct for legacy cumulative sources.
    """

    if source_contract != "legacy_cumulative":
        return dict(source_quarters)

    result: dict[str, float | None] = {}
    previous_cumulative: float | None = None
    for key in QUARTER_KEYS:
        current = _finite_number(source_quarters.get(key))
        if current is None:
            result[key] = None
            continue
        result[key] = (
            current - previous_cumulative
            if previous_cumulative is not None
            else current
        )
        previous_cumulative = current
    return result


def _period_point(
    raw_quarters: dict[str, float | None],
    period_key: str,
    *,
    prorated: bool,
    threshold: float | None,
    target: float | None,
    maximum: float | None,
    direction: str,
) -> dict[str, Any]:
    if period_key == "all":
        source_period = next(
            (
                key
                for key in reversed(QUARTER_KEYS)
                if _finite_number(raw_quarters.get(key)) is not None
            ),
            None,
        )
        if source_period is None:
            return {
                "raw_actual": None,
                "actual": None,
                "projection": None,
                "score": None,
                "projection_score": None,
                "status": "Veri Yok",
                "projection_status": "Veri Yok",
                "filled_quarters": 0,
                "source_period": None,
                "effective_threshold": None,
                "effective_target": None,
                "effective_maximum": None,
                "rule": "Topla ve orantıla" if prorated else "Son dolu çeyrek",
            }
        end_index = QUARTER_KEYS.index(source_period)
    else:
        if period_key not in QUARTER_KEYS or _finite_number(raw_quarters.get(period_key)) is None:
            return {
                "raw_actual": None,
                "actual": None,
                "projection": None,
                "score": None,
                "projection_score": None,
                "status": "Veri Yok",
                "projection_status": "Veri Yok",
                "filled_quarters": 0,
                "source_period": period_key if period_key in QUARTER_KEYS else None,
                "effective_threshold": None,
                "effective_target": None,
                "effective_maximum": None,
                "rule": "Topla ve orantıla" if prorated else "Son dolu çeyrek",
            }
        source_period = period_key
        end_index = QUARTER_KEYS.index(period_key)

    available_values = [
        float(value)
        for key in QUARTER_KEYS[: end_index + 1]
        if (value := _finite_number(raw_quarters.get(key))) is not None
    ]
    filled_quarters = len(available_values)
    if not available_values:
        return {
            "raw_actual": None,
            "actual": None,
            "projection": None,
            "score": None,
            "projection_score": None,
            "status": "Veri Yok",
            "projection_status": "Veri Yok",
            "filled_quarters": 0,
            "source_period": source_period,
            "effective_threshold": None,
            "effective_target": None,
            "effective_maximum": None,
            "rule": "Topla ve orantıla" if prorated else "Son dolu çeyrek",
        }

    actual = sum(available_values) if prorated else available_values[-1]
    period_factor = filled_quarters / 4 if prorated else 1.0
    effective_threshold = threshold * period_factor if threshold is not None else None
    effective_target = target * period_factor if target is not None else None
    effective_maximum = maximum * period_factor if maximum is not None else None
    projection = actual / filled_quarters * 4 if prorated else actual
    score = target_score(
        actual,
        effective_threshold,
        effective_target,
        effective_maximum,
        direction,
    )
    projection_score = target_score(projection, threshold, target, maximum, direction)
    return {
        "raw_actual": raw_quarters.get(source_period),
        "actual": actual,
        "projection": projection,
        "score": score,
        "projection_score": projection_score,
        "status": score_status(score),
        "projection_status": score_status(projection_score),
        "filled_quarters": filled_quarters,
        "source_period": source_period,
        "effective_threshold": effective_threshold,
        "effective_target": effective_target,
        "effective_maximum": effective_maximum,
        "rule": "Topla ve orantıla" if prorated else "Son dolu çeyrek",
    }


def _summary(rows: list[dict[str, Any]], period_key: str) -> dict[str, Any]:
    evaluated = [
        row
        for row in rows
        if _finite_number((row.get("periods") or {}).get(period_key, {}).get("score")) is not None
    ]
    scores = [
        float(row["periods"][period_key]["score"])
        for row in evaluated
    ]
    weighted = [
        (float(row["periods"][period_key]["score"]), float(row["weight"]))
        for row in evaluated
        if _finite_number(row.get("weight")) is not None and float(row["weight"]) > 0
    ]
    counts = {status: 0 for status in STATUS_ORDER}
    for row in evaluated:
        status = row["periods"][period_key]["status"]
        if status in counts:
            counts[status] += 1
    return {
        "total": len(rows),
        "evaluated": len(evaluated),
        "missing": len(rows) - len(evaluated),
        "average": sum(scores) / len(scores) if scores else None,
        "weighted_average": (
            sum(score * weight for score, weight in weighted) / sum(weight for _, weight in weighted)
            if weighted and sum(weight for _, weight in weighted) > 0
            else None
        ),
        "weighted_count": len(weighted),
        "weight_total": sum(weight for _, weight in weighted),
        "counts": counts,
    }


def _build_scope(sheet_name: str, frame: pd.DataFrame) -> dict[str, Any]:
    metric_col = first_col(frame, ["Gösterge Adı"])
    unit_col = first_col(frame, ["Ölçüm Birimi"])
    direction_col = first_col(frame, ["Ölçüm Yönü"])
    weight_col = first_col(frame, ["Ağırlık"])
    threshold_col = first_col(frame, ["%80-2026 Eşik Hedef"])
    target_col = first_col(frame, ["2026 Hedef"])
    maximum_col = first_col(frame, ["%120-2026 Max Hedef"])
    required = {
        "Gösterge Adı": metric_col,
        "Ölçüm Birimi": unit_col,
        "Ölçüm Yönü": direction_col,
        "%80 Eşik Hedef": threshold_col,
        "2026 Hedef": target_col,
        "%120 Maksimum Hedef": maximum_col,
    }
    missing_columns = [label for label, column in required.items() if column is None]
    if missing_columns:
        raise ValueError(f"{sheet_name} sheet'inde zorunlu kolonlar eksik: {missing_columns}")

    period_columns = _period_columns(frame)
    source_contract = _source_quarter_contract(period_columns)
    scope_key = "ceo" if "ceo" in normalize_key(sheet_name) else "company"
    rows: list[dict[str, Any]] = []
    warnings: list[str] = []
    for source_index, source in frame.iterrows():
        metric = clean_text(source.get(metric_col))
        if not metric:
            continue
        unit = clean_text(source.get(unit_col))
        direction = measurement_direction(source.get(direction_col))
        threshold = _finite_number(source.get(threshold_col))
        target = _finite_number(source.get(target_col))
        maximum = _finite_number(source.get(maximum_col))
        weight = _finite_number(source.get(weight_col)) if weight_col else None
        if not direction:
            warnings.append(f"{metric}: ölçüm yönü tanınamadı")
        if None in {threshold, target, maximum}:
            warnings.append(f"{metric}: hedef eşikleri eksik veya sayısal değil")

        prorated = default_proration_rule(metric)
        source_quarters = {
            period_key: (
                _finite_number(source.get(period_columns[period_key]))
                if period_key in period_columns
                else None
            )
            for period_key in QUARTER_KEYS
        }
        raw_quarters = _normalise_independent_quarters(
            source_quarters,
            source_contract=source_contract,
        )
        calculation_quarters = (
            raw_quarters
            if prorated or source_contract != "legacy_cumulative"
            else source_quarters
        )
        period_values: dict[str, dict[str, Any]] = {}
        for definition in PERIOD_DEFINITIONS:
            period_key = str(definition["key"])
            period_values[period_key] = _period_point(
                calculation_quarters,
                period_key,
                prorated=prorated,
                threshold=threshold,
                target=target,
                maximum=maximum,
                direction=direction,
            )
        rows.append(
            {
                "source_row": int(source_index) + 2,
                "setting_key": f"{scope_key}::{normalize_key(metric)}",
                "metric": metric,
                "category": metric_category(metric),
                "unit": unit,
                "direction": direction,
                "weight": weight,
                "threshold": threshold,
                "target": target,
                "maximum": maximum,
                "prorate_default": prorated,
                "source_quarter_contract": source_contract,
                "source_quarters": source_quarters,
                "raw_quarters": raw_quarters,
                "periods": period_values,
            }
        )

    summaries = {
        str(definition["key"]): _summary(rows, str(definition["key"]))
        for definition in PERIOD_DEFINITIONS
    }
    available_periods = [
        str(definition["key"])
        for definition in PERIOD_DEFINITIONS
        if summaries[str(definition["key"])]["evaluated"] > 0
    ]
    return {
        "key": scope_key,
        "sheet": sheet_name,
        "label": "CEO Hedefleri" if scope_key == "ceo" else "Şirket Hedefleri",
        "rows": rows,
        "summaries": summaries,
        "available_periods": available_periods,
        "categories": [
            category
            for category in CATEGORY_ORDER
            if any(row["category"] == category for row in rows)
        ],
        "warnings": warnings,
        "source_quarter_contract": source_contract,
    }


def build_hedefler_data(xlsx_path: Path) -> dict[str, Any]:
    if not xlsx_path.exists():
        raise FileNotFoundError(f"Hedef kaynak dosyası bulunamadı: {xlsx_path}")
    xl = pd.ExcelFile(xlsx_path)
    requested = ("Ceo Hedefleri", "Şirket Hedefleri")
    missing_sheets = [sheet for sheet in requested if sheet not in xl.sheet_names]
    if missing_sheets:
        raise ValueError(f"2026 hedef workbook'unda sheet eksik: {missing_sheets}")
    scopes = [
        _build_scope(sheet, pd.read_excel(xl, sheet_name=sheet))
        for sheet in requested
    ]
    available = {period for scope in scopes for period in scope["available_periods"]}
    latest_quarter = next((period for period in reversed(QUARTER_KEYS) if period in available), "q1")
    selected_period = "all" if "all" in available else latest_quarter
    return json_safe(
        {
            "meta": {
                "title": "2026 CEO & Şirket Hedefleri Dashboard",
                "source_file": xlsx_path.name,
                "generated_at": deterministic_build_time().isoformat(timespec="seconds"),
                "selected_period": selected_period,
                "latest_quarter": latest_quarter,
                "annual_rule": (
                    "Kaynak Q1-Q4 değerleri bağımsız çeyreklerdir. Ayarlarda orantılanan "
                    "KPI'lar dolu çeyrekler boyunca toplanır; dönem hedefleri yıllık hedef / "
                    "4 x dolu çeyrek sayısıdır. Diğer KPI'larda son dolu çeyrek kullanılır."
                ),
                "projection_rule": (
                    "Orantılanan KPI yıl sonu projeksiyonu = kümülatif gerçekleşen / dolu "
                    "çeyrek sayısı x 4. Diğer KPI'larda projeksiyon son dolu çeyrek değeridir."
                ),
                "source_contract_rule": (
                    "Yeni sözleşmede Q1-Q4 bağımsız çeyrek değerleridir. Eski 1 Ocak-... "
                    "kümülatif sütun başlıkları algılanırsa toplanan KPI'lar önce bağımsız "
                    "çeyreklere dönüştürülerek geriye dönük uyumluluk sağlanır."
                ),
                "settings_storage_key": "aizanoi_hedef_proration_v2",
                "scoring": {
                    "minimum": 0,
                    "threshold": 80,
                    "target": 100,
                    "maximum": 120,
                    "method": "Ölçüm yönüne göre 80-100-120 hedef noktaları arasında parçalı doğrusal interpolasyon",
                },
                "display": {
                    "columns": DISPLAY_COLUMN_LABELS,
                    "score_bands": SCORE_BANDS,
                    "color_rule": (
                        "<80 kırmızı; 80 ve üzeri ile 100 altı turuncu; "
                        "100 ve üzeri ile 120 altı açık yeşil; "
                        "120 ve üzeri koyu yeşil."
                    ),
                },
            },
            "periods": [
                {
                    key: value
                    for key, value in definition.items()
                    if key != "tokens"
                }
                for definition in PERIOD_DEFINITIONS
            ],
            "scopes": scopes,
        }
    )
