"""PDKS calisma zamani takip dashboardu ureticisi.

Kaynak olarak yalnizca kok dizindeki ``1-11 pdks.xlsx`` dosyasini kullanir.
Ham turnike kayitlarini kisi-ay seviyesinde ozetler; boylece HTML hem hizli
kalir hem de departman bazli calisma / evden calisma matrisi denetlenebilir
bir bicimde sunulur.
"""

from __future__ import annotations

import argparse
import html
import json
import math
import os
import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from dashboard_paths import PDKS_DASHBOARD, PROJECT_ROOT
from typing import Any

import numpy as np
import pandas as pd


BASE_DIR = PROJECT_ROOT
DEFAULT_INPUT = BASE_DIR / "1-11 pdks.xlsx"
DEFAULT_FIILI = BASE_DIR / "fiili_list.xlsx"
DEFAULT_OUTPUT = PDKS_DASHBOARD
STANDARD_DAILY_HOURS = 9.75
DEFAULT_WORKDAY_START = "08:00"
DEFAULT_WORKDAY_END = "17:45"
AUTO_EXCLUDED_SICILS = {"2208", "14794", "10373", "10723", "1076"}
AUTO_EXCLUDED_UNVAN_TOKENS = ("direktor", "stajyer")
AUTO_EXCLUDED_POSITION_TOKENS = ("genc yetenek", "bekci", "prova mankeni", "corner satis danismani")

# Legacy Access workbook's ``keys`` page exposes these broad department keys.
# The dashboard starts with these names and keeps every mapping user-editable.
DEFAULT_DEPARTMENT_KEYS: tuple[str, ...] = (
    "Tedarik Zinciri",
    "Bilgi Teknolojileri&Lojistik",
    "Kreatif",
    "Yönetim Kurulu",
    "İdari İşler",
    "Alternatif Satış Kanalları",
    "Genel Müdürlük",
    "Mali İşler",
    "Perakende",
    "Yurtdışı Operasyon",
    "E-Ticaret",
    "Görsel Düzenleme",
    "İnsan Kaynakları",
    "İş Geliştirme",
    "Pazarlama",
    "Müşteri İlişkileri Yönetimi ve Strateji",
    "Hukuk",
    "İç Denetim & Risk Yönetimi",
    "İç Denetim",
)


@dataclass(frozen=True)
class CalendarRule:
    """A non-standard expected-hours rule for one day or date interval."""

    start: date
    end: date
    expected_hours: float
    category: str
    description: str


# These rules deliberately mirror the Access query supplied with the request.
# Weekends are handled separately and always have zero expected hours.
PDKS_CALENDAR_RULES: tuple[CalendarRule, ...] = (
    CalendarRule(date(2026, 1, 1), date(2026, 1, 1), 0.0, "Resmi tatil", "Yılbaşı"),
    CalendarRule(date(2026, 1, 19), date(2026, 1, 19), 8.0, "Erken çıkış", "Özel erken çıkış uygulaması"),
    CalendarRule(date(2026, 2, 19), date(2026, 2, 19), 9.25, "Erken çıkış", "30 dakika erken çıkış uygulaması"),
    CalendarRule(date(2026, 2, 20), date(2026, 2, 28), 9.0, "Erken çıkış", "Günlük 45 dakika erken çıkış uygulaması"),
    CalendarRule(date(2026, 3, 1), date(2026, 3, 18), 9.0, "Erken çıkış", "Günlük 45 dakika erken çıkış uygulaması"),
    CalendarRule(date(2026, 3, 19), date(2026, 3, 19), 4.875, "Yarım gün", "Arife yarım gün uygulaması"),
    CalendarRule(date(2026, 3, 20), date(2026, 3, 22), 0.0, "Resmi tatil", "Ramazan Bayramı"),
    CalendarRule(date(2026, 4, 23), date(2026, 4, 23), 0.0, "Resmi tatil", "23 Nisan"),
    CalendarRule(date(2026, 5, 1), date(2026, 5, 1), 0.0, "Resmi tatil", "1 Mayıs"),
    CalendarRule(date(2026, 5, 19), date(2026, 5, 19), 0.0, "Resmi tatil", "19 Mayıs"),
    CalendarRule(date(2026, 5, 25), date(2026, 5, 25), 4.875, "Yarım gün", "Arife yarım gün uygulaması"),
    CalendarRule(date(2026, 5, 27), date(2026, 5, 30), 0.0, "Resmi tatil", "Kurban Bayramı"),
    CalendarRule(date(2026, 7, 15), date(2026, 7, 15), 0.0, "Resmi tatil", "15 Temmuz"),
    CalendarRule(date(2026, 7, 17), date(2026, 7, 17), 8.0, "Erken çıkış", "Cuma erken çıkış uygulaması (08:00-16:00)"),
    CalendarRule(date(2026, 7, 24), date(2026, 7, 24), 8.0, "Erken çıkış", "Cuma erken çıkış uygulaması (08:00-16:00)"),
    CalendarRule(date(2026, 7, 31), date(2026, 7, 31), 8.0, "Erken çıkış", "Cuma erken çıkış uygulaması (08:00-16:00)"),
    CalendarRule(date(2026, 8, 7), date(2026, 8, 7), 8.0, "Erken çıkış", "Cuma erken çıkış uygulaması (08:00-16:00)"),
    CalendarRule(date(2026, 8, 14), date(2026, 8, 14), 8.0, "Erken çıkış", "Cuma erken çıkış uygulaması (08:00-16:00)"),
    CalendarRule(date(2026, 8, 21), date(2026, 8, 21), 8.0, "Erken çıkış", "Cuma erken çıkış uygulaması (08:00-16:00)"),
    CalendarRule(date(2026, 8, 28), date(2026, 8, 28), 8.0, "Erken çıkış", "Cuma erken çıkış uygulaması (08:00-16:00)"),
    CalendarRule(date(2026, 8, 30), date(2026, 8, 30), 0.0, "Resmi tatil", "30 Ağustos"),
    CalendarRule(date(2026, 10, 28), date(2026, 10, 28), 4.875, "Yarım gün", "29 Ekim arifesi"),
    CalendarRule(date(2026, 10, 29), date(2026, 10, 29), 0.0, "Resmi tatil", "29 Ekim"),
    CalendarRule(date(2026, 12, 31), date(2026, 12, 31), 8.0, "Erken çıkış", "Yıl sonu erken çıkış uygulaması"),
)

MONTH_NAMES = (
    "Ocak",
    "Şubat",
    "Mart",
    "Nisan",
    "Mayıs",
    "Haziran",
    "Temmuz",
    "Ağustos",
    "Eylül",
    "Ekim",
    "Kasım",
    "Aralık",
)


def log(message: str) -> None:
    print(f"[PDKS] {message}", flush=True)


def clean_text(value: object, default: str = "") -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return default
    text = str(value).strip()
    if not text or not text.strip("'\"") or text.lower() in {"nan", "none", "nat"}:
        return default
    return unicodedata.normalize("NFKC", text)


def key_text(value: object) -> str:
    text = clean_text(value).lower().replace("ı", "i")
    text = unicodedata.normalize("NFD", text)
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return re.sub(r"\s+", " ", text).strip()


def default_department_key(source_department: object) -> str:
    """Map a raw PDKS department to the legacy broad key list."""

    source = clean_text(source_department, "Belirsiz Departman")
    normalized = key_text(source)
    explicit_rules = (
        ("genel mudurluk-alternatif satis kanallari", "Alternatif Satış Kanalları"),
        ("genel mudurluk-bilgi teknolojileri", "Bilgi Teknolojileri&Lojistik"),
        ("genel mudurluk-e-ticaret", "E-Ticaret"),
        ("genel mudurluk-hukuk", "Hukuk"),
        ("genel mudurluk-kreatif", "Kreatif"),
        ("genel mudurluk-lojistik", "Bilgi Teknolojileri&Lojistik"),
        ("genel mudurluk-mali isler", "Mali İşler"),
        ("genel mudurluk-musteri iliskileri yonetimi ve strateji", "Müşteri İlişkileri Yönetimi ve Strateji"),
        ("genel mudurluk-pazarlama", "Pazarlama"),
        ("genel mudurluk-perakende", "Perakende"),
        ("genel mudurluk-tedarik zinciri", "Tedarik Zinciri"),
        ("genel mudurluk-yurtdisi operasyon", "Yurtdışı Operasyon"),
        ("genel mudurluk-is gelistirme", "İş Geliştirme"),
        ("genel mudurluk-ic denetim", "İç Denetim"),
        ("bilgi teknolojileri", "Bilgi Teknolojileri&Lojistik"),
        ("gorsel duzenleme", "Görsel Düzenleme"),
        ("muhasebe ve vergi", "Mali İşler"),
        ("organizasyonel gelisim", "İnsan Kaynakları"),
    )
    for token, target in explicit_rules:
        if normalized.startswith(token) or token in normalized:
            return target

    candidates = [key for key in DEFAULT_DEPARTMENT_KEYS if key_text(key) in normalized]
    if candidates:
        return max(candidates, key=lambda item: len(key_text(item)))
    return source


def auto_exclusion_reason(sicil: object, unvan: object, position: object) -> str:
    sicil_text = format_sicil(sicil)
    if sicil_text in AUTO_EXCLUDED_SICILS:
        return "Özel dışlama sicil listesi"
    unvan_key = key_text(unvan)
    position_key = key_text(position)
    if any(token in unvan_key for token in AUTO_EXCLUDED_UNVAN_TOKENS):
        return "Unvan: direktör / stajyer"
    if any(token in position_key for token in AUTO_EXCLUDED_POSITION_TOKENS):
        return "Pozisyon: özel takip dışı rol"
    return ""


def format_sicil(value: object) -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return ""
    if isinstance(value, (int, np.integer)):
        return str(int(value))
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    text = clean_text(value)
    if text.endswith(".0") and text[:-2].isdigit():
        return text[:-2]
    return text


def time_to_hours(value: object) -> float:
    """Read Excel time serials, time objects and HH:MM:SS strings as hours."""

    if value is None or (isinstance(value, float) and math.isnan(value)):
        return float("nan")
    if isinstance(value, pd.Timedelta):
        return value.total_seconds() / 3600
    if isinstance(value, timedelta):
        return value.total_seconds() / 3600
    if hasattr(value, "hour") and hasattr(value, "minute"):
        return float(value.hour) + float(value.minute) / 60 + float(getattr(value, "second", 0)) / 3600
    if isinstance(value, (int, float, np.number)):
        numeric_value = float(value)
        return numeric_value * 24 if 0 <= numeric_value <= 1.0 else numeric_value

    text = clean_text(value)
    if not text:
        return float("nan")
    match = re.fullmatch(r"\s*(\d{1,2}):(\d{2})(::(\d{2}))\s*", text)
    if match:
        hour, minute, second = (int(part or 0) for part in match.groups())
        return hour + minute / 60 + second / 3600
    try:
        numeric_value = float(text.replace(",", "."))
    except ValueError:
        return float("nan")
    return numeric_value * 24 if 0 <= numeric_value <= 1.0 else numeric_value


def expected_hours_for_day(day: date) -> tuple[float, str, str]:
    """Return required gross hours and the applied calendar rule for one date."""

    if day.weekday() >= 5:
        return 0.0, "Hafta sonu", "Hafta sonu"
    for rule in PDKS_CALENDAR_RULES:
        if rule.start <= day <= rule.end:
            return rule.expected_hours, rule.category, rule.description
    return STANDARD_DAILY_HOURS, "Normal çalışma", "Standart iş günü"


def date_range(start: date, end: date) -> list[date]:
    current = start
    days: list[date] = []
    while current <= end:
        days.append(current)
        current += timedelta(days=1)
    return days


def calendar_payload(years: list[int]) -> dict[str, list[dict[str, object]]]:
    result: dict[str, list[dict[str, object]]] = {}
    for year in years:
        entries: list[dict[str, object]] = []
        for rule in PDKS_CALENDAR_RULES:
            if rule.start.year > year or rule.end.year < year:
                continue
            start = max(rule.start, date(year, 1, 1))
            end = min(rule.end, date(year, 12, 31))
            for day in date_range(start, end):
                entries.append(
                    {
                        "date": day.isoformat(),
                        "expected_hours": rule.expected_hours,
                        "category": rule.category,
                        "description": rule.description,
                    }
                )
        result[str(year)] = entries
    return result


def require_columns(frame: pd.DataFrame, columns: set[str]) -> None:
    missing = sorted(column for column in columns if column not in frame.columns)
    if missing:
        raise ValueError("PDKS sayfasında zorunlu sütun(lar) bulunamadı: " + ", ".join(missing))


def load_pdks(input_path: Path) -> pd.DataFrame:
    if not input_path.exists():
        raise FileNotFoundError(f"PDKS kaynak dosyası bulunamadı: {input_path}")
    log(f"Kaynak okunuyor: {input_path.name}")
    required = {
        "Sicil No",
        "adi",
        "soyadi",
        "departmanadi",
        "bolum_adi",
        "pozisyon_adi",
        "giris_tarihi",
        "evdenlik",
    }
    usable_frames: list[pd.DataFrame] = []
    with pd.ExcelFile(input_path) as workbook:
        for sheet_name in workbook.sheet_names:
            frame = pd.read_excel(workbook, sheet_name=sheet_name)
            if frame.empty or not required.issubset(set(frame.columns)):
                log(f"Sheet atlandı: {sheet_name} (PDKS kolon seti yok)")
                continue
            frame = frame.copy()
            frame["_source_sheet"] = sheet_name
            usable_frames.append(frame)
            log(f"Sheet okundu: {sheet_name} ({len(frame):,} satır)")
    if not usable_frames:
        raise ValueError("PDKS kaynak dosyasında zorunlu kolonları içeren kullanılabilir sheet bulunamadı.")
    frame = pd.concat(usable_frames, ignore_index=True)
    require_columns(frame, required)
    return frame


def load_fiili(fiili_path: Path) -> pd.DataFrame:
    if not fiili_path.exists():
        log(f"UYARI: Fiili liste bulunamadı; aktif çalışan filtresi devre dışı kalacak: {fiili_path.name}")
        return pd.DataFrame()
    frame = pd.read_excel(fiili_path, sheet_name=0)
    if "P_NO" not in frame.columns:
        log("UYARI: Fiili listede P_NO sütunu yok; aktif çalışan filtresi devre dışı kalacak.")
        return pd.DataFrame()
    keep = [
        column
        for column in ["P_NO", "AD_SOYAD", "UST_BOLUM_ADI", "BOLUM_ADI", "POZISYON_ADI", "GOREV_ADI", "UNVAN_ADI"]
        if column in frame.columns
    ]
    fiili = frame[keep].copy()
    fiili["sicil"] = fiili["P_NO"].map(format_sicil)
    fiili = fiili[fiili["sicil"].ne("")].drop_duplicates("sicil", keep="last")
    log(f"Fiili liste eşleştirmeye hazır: {len(fiili):,} benzersiz sicil")
    return fiili


def prepare_records(frame: pd.DataFrame) -> pd.DataFrame:
    work = frame.copy()
    work["_source_order"] = np.arange(len(work), dtype=int)
    work["entry_date"] = pd.to_datetime(work["giris_tarihi"], errors="coerce").dt.normalize()
    work["sicil"] = work["Sicil No"].map(format_sicil)
    work["name"] = (work["adi"].map(clean_text) + " " + work["soyadi"].map(clean_text)).str.replace(r"\s+", " ", regex=True).str.strip()
    work["department"] = work["departmanadi"].map(clean_text)
    fallback_department = work["bolum_adi"].map(clean_text)
    work.loc[work["department"].eq(""), "department"] = fallback_department
    work["department"] = work["department"].replace("", "Belirsiz Departman")
    work["position"] = work["pozisyon_adi"].map(lambda value: clean_text(value, "Belirsiz Pozisyon"))
    work["entry_hour"] = work["giris_saati"].map(time_to_hours) if "giris_saati" in work.columns else np.nan
    work["exit_hour"] = work["cikis_saati"].map(time_to_hours) if "cikis_saati" in work.columns else np.nan
    work["month"] = work["entry_date"].dt.strftime("%Y-%m")

    work = work[work["entry_date"].notna() & work["sicil"].ne("")].copy()
    if work.empty:
        raise ValueError("PDKS kaynağında kullanılabilir giriş tarihi ve sicil kaydı bulunamadı.")

    if "gun_saat" in work.columns:
        actual_hours = pd.to_numeric(work["gun_saat"], errors="coerce")
    else:
        actual_hours = pd.Series(np.nan, index=work.index, dtype=float)
    if "calisma_saat_toplam" in work.columns:
        fallback_hours = work["calisma_saat_toplam"].map(time_to_hours)
        actual_hours = actual_hours.where(actual_hours.notna(), fallback_hours)
    work["actual_hours"] = actual_hours.fillna(0.0).clip(lower=0.0)
    work["expected_hours"] = work["entry_date"].dt.date.map(lambda day: expected_hours_for_day(day)[0])

    evden_key = work["evdenlik"].map(key_text)
    work["evden_days"] = (evden_key == "evden").astype(int)
    work["harici_evden_days"] = (evden_key == "harici evden").astype(int)
    work["total_evden_days"] = work["evden_days"] + work["harici_evden_days"]
    work["difference_hours"] = work["actual_hours"] - work["expected_hours"]
    return work


METRIC_KEYS = (
    "geldigi_gun",
    "evden_gun",
    "harici_evden_gun",
    "toplam_evden_gun",
    "calistigi_saat",
    "gereken_saat",
    "fark",
)


def aggregate_payload(work: pd.DataFrame, fiili: pd.DataFrame) -> dict[str, Any]:
    grouped = (
        work.groupby(["sicil", "month"], dropna=False, as_index=False)
        .agg(
            geldigi_gun=("sicil", "size"),
            evden_gun=("evden_days", "sum"),
            harici_evden_gun=("harici_evden_days", "sum"),
            toplam_evden_gun=("total_evden_days", "sum"),
            calistigi_saat=("actual_hours", "sum"),
            gereken_saat=("expected_hours", "sum"),
            fark=("difference_hours", "sum"),
        )
        .sort_values(["sicil", "month"])
    )
    months = sorted(clean_text(value) for value in grouped["month"].dropna().unique())
    years = sorted({int(month[:4]) for month in months if re.fullmatch(r"\d{4}-\d{2}", month)})

    latest = (
        work.sort_values(["entry_date", "_source_order"])
        .drop_duplicates("sicil", keep="last")
        .set_index("sicil", drop=False)
    )
    fiili_by_sicil: dict[str, dict[str, object]] = {}
    if not fiili.empty:
        fiili_by_sicil = fiili.set_index("sicil", drop=False).to_dict("index")

    daily = (
        work.groupby(["sicil", "entry_date"], as_index=False)
        .agg(
            record_count=("sicil", "size"),
            actual_hours=("actual_hours", "sum"),
            evden_days=("evden_days", "sum"),
            harici_evden_days=("harici_evden_days", "sum"),
            first_entry_hour=("entry_hour", "min"),
            last_exit_hour=("exit_hour", "max"),
        )
        .sort_values(["sicil", "entry_date"])
    )
    daily_by_sicil = {
        clean_text(sicil): [
            [
                item["entry_date"].strftime("%Y-%m-%d"),
                int(item["record_count"]),
                round(float(item["actual_hours"]), 3),
                int(item["evden_days"]),
                int(item["harici_evden_days"]),
                None if pd.isna(item.get("first_entry_hour")) else round(float(item["first_entry_hour"]), 3),
                None if pd.isna(item.get("last_exit_hour")) else round(float(item["last_exit_hour"]), 3),
            ]
            for _, item in person.iterrows()
        ]
        for sicil, person in daily.groupby("sicil", sort=False)
    }

    records: list[dict[str, Any]] = []
    for sicil, person in grouped.groupby("sicil", dropna=False, sort=False):
        sicil_key = clean_text(sicil)
        latest_row = latest.loc[sicil_key] if sicil_key in latest.index else None
        fiili_row = fiili_by_sicil.get(sicil_key, {})

        pdks_name = clean_text(latest_row.get("name") if latest_row is not None else "")
        pdks_position = clean_text(latest_row.get("position") if latest_row is not None else "", "Belirsiz Pozisyon")
        pdks_department = clean_text(latest_row.get("department") if latest_row is not None else "", "Belirsiz Departman")
        fiili_name = clean_text(fiili_row.get("AD_SOYAD"))
        fiili_position = clean_text(fiili_row.get("POZISYON_ADI")) or clean_text(fiili_row.get("GOREV_ADI"))
        fiili_unvan = clean_text(fiili_row.get("UNVAN_ADI"))
        fiili_department = clean_text(fiili_row.get("UST_BOLUM_ADI")) or clean_text(fiili_row.get("BOLUM_ADI"))
        source_department = fiili_department or pdks_department
        display_position = fiili_position or pdks_position
        auto_reason = auto_exclusion_reason(sicil_key, fiili_unvan, display_position)

        by_month: dict[str, dict[str, float]] = {}
        for _, item in person.iterrows():
            by_month[clean_text(item["month"])] = {
                "geldigi_gun": int(item["geldigi_gun"]),
                "evden_gun": int(item["evden_gun"]),
                "harici_evden_gun": int(item["harici_evden_gun"]),
                "toplam_evden_gun": int(item["toplam_evden_gun"]),
                "calistigi_saat": round(float(item["calistigi_saat"]), 3),
                "gereken_saat": round(float(item["gereken_saat"]), 3),
                "fark": round(float(item["fark"]), 3),
            }
        records.append(
            {
                "sicil": sicil_key,
                "name": fiili_name or pdks_name,
                "position": display_position,
                "fiili_unvan": fiili_unvan,
                "source_department": source_department,
                "pdks_department": pdks_department,
                "fiili_department": fiili_department,
                "is_in_fiili": bool(fiili_row),
                "auto_hidden": bool(auto_reason),
                "auto_hidden_reason": auto_reason,
                "months": by_month,
                "days": daily_by_sicil.get(sicil_key, []),
            }
        )

    source_departments = sorted({record["source_department"] for record in records}, key=key_text)
    default_mapping = {source: default_department_key(source) for source in source_departments}
    departments = sorted(set(default_mapping.values()), key=key_text)
    raw_month_counts = work.groupby("month", as_index=True).size().to_dict()
    source_sheet_counts = (
        work.groupby("_source_sheet", as_index=True).size().to_dict()
        if "_source_sheet" in work.columns
        else {}
    )
    fiili_matches = sum(1 for record in records if record["is_in_fiili"])
    return {
        "generated_at": datetime.now().strftime("%d.%m.%Y %H:%M"),
        "source": "1-11 pdks.xlsx",
        "fiili_source": "fiili_list.xlsx" if not fiili.empty else None,
        "rows_source": int(len(work)),
        "people_source": int(work["sicil"].nunique()),
        "people_in_fiili": fiili_matches,
        "people_not_in_fiili": len(records) - fiili_matches,
        "months": months,
        "years": years,
        "departments": departments,
        "source_departments": source_departments,
        "default_department_keys": list(DEFAULT_DEPARTMENT_KEYS),
        "default_department_mapping": default_mapping,
        "records": records,
        "metric_keys": list(METRIC_KEYS),
        "month_record_counts": {clean_text(key): int(value) for key, value in raw_month_counts.items()},
        "source_sheet_counts": {clean_text(key): int(value) for key, value in source_sheet_counts.items()},
        "calendar": calendar_payload(years),
        "standard_daily_hours": STANDARD_DAILY_HOURS,
        "default_workday": {"start": DEFAULT_WORKDAY_START, "end": DEFAULT_WORKDAY_END, "hours": STANDARD_DAILY_HOURS},
        "auto_hidden_people": [
            {"sicil": record["sicil"], "name": record["name"], "position": record["position"], "department": record["source_department"], "reason": record["auto_hidden_reason"]}
            for record in records
            if record.get("auto_hidden")
        ],
        "logic": {
            "arrival": "Geldiği gün, ilgili kişi-ay için PDKS listesindeki sicil geçişi satırlarının sayısıdır.",
            "home": "Toplam evden gün = Evden gün + Harici evden gün. Turnike, Tekno ve Arvato kayıtları evden gün hesabına dahil edilmez.",
            "actual": "Çalıştığı saat, kaynakta bulunan gun_saat alanından; alan boşsa calisma_saat_toplam saat bilgisinden alınır.",
            "expected": "Çalışılması gereken saat, yalnızca PDKS kaydı bulunan günler için hesaplanır. Hafta sonu 0 saat; resmi tatil, yarım gün ve erken çıkış istisnaları görünür takvim kurallarıyla uygulanır.",
            "difference": "Fark = Çalıştığı saat - Çalışılması gereken saat. Pozitif değer fazla, negatif değer eksik süreyi gösterir.",
        },
    }


HTML_TEMPLATE = r'''<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>PDKS Çalışma Zamanı Takibi</title>
  <style>
    :root {
      --ink: #0b1220;
      --ink-2: #334155;
      --paper: #f0f2f7;
      --paper-deep: #e4e8f1;
      --panel: #ffffff;
      --line: rgba(0, 32, 96, .11);
      --line-strong: rgba(30, 64, 175, .28);
      --blue: #2563eb;
      --blue-soft: #dbeafe;
      --teal: #0f766e;
      --teal-soft: #dff4ef;
      --amber: #b45309;
      --amber-soft: #fef3c7;
      --rose: #be123c;
      --rose-soft: #ffe4e6;
      --muted: #64748b;
      --shadow: 0 4px 24px rgba(0, 32, 96, .08), 0 1px 3px rgba(0, 0, 0, .04);
      --radius: 16px;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      min-width: 320px;
      color: var(--ink);
      background:
        radial-gradient(circle at 8% -10%, rgba(37, 99, 235, .13), transparent 28rem),
        radial-gradient(circle at 96% 2%, rgba(15, 118, 110, .10), transparent 26rem),
        var(--paper);
      font-family: Aptos, "Segoe UI Variable", "Segoe UI", sans-serif;
    }
    button, input, select { font: inherit; }
    .shell { width: min(1800px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 42px; }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 24px;
      align-items: end;
      padding: 30px 34px;
      color: #f8fbff;
      border-radius: 24px;
      overflow: hidden;
      position: relative;
      background: linear-gradient(128deg, #0f172a 0%, #1e40af 58%, #0f766e 100%);
      box-shadow: var(--shadow);
    }
    .hero::after {
      content: "";
      position: absolute;
      width: 360px; height: 360px;
      right: -110px; top: -210px;
      border: 1px solid rgba(255,255,255,.22);
      border-radius: 50%;
      box-shadow: 0 0 0 34px rgba(255,255,255,.05), 0 0 0 68px rgba(255,255,255,.035);
    }
    .eyebrow { margin: 0 0 9px; color: #bde2f4; font-size: 12px; letter-spacing: .14em; font-weight: 800; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(28px, 4vw, 46px); letter-spacing: -.045em; line-height: 1; }
    .hero p { max-width: 770px; margin: 12px 0 0; color: #dceafa; line-height: 1.5; }
    .source-chip { z-index: 1; display: grid; gap: 4px; min-width: 206px; padding: 14px 16px; border: 1px solid rgba(255,255,255,.22); border-radius: 14px; background: rgba(6,18,38,.27); }
    .source-chip span { font-size: 11px; color: #b9d1e9; text-transform: uppercase; letter-spacing: .09em; font-weight: 800; }
    .source-chip strong { font-size: 14px; }
    .toolbar {
      display: grid;
      grid-template-columns: minmax(240px, 1.05fr) minmax(135px, .38fr) minmax(210px, .7fr) auto auto;
      gap: 12px;
      align-items: end;
      margin: 22px 0 16px;
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: rgba(255,255,255,.88);
      box-shadow: 0 8px 24px rgba(43, 50, 61, .05);
    }
    .field { display: grid; gap: 6px; min-width: 0; }
    .field label { font-size: 11px; color: var(--muted); font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    select, input {
      width: 100%; min-height: 42px; border: 1px solid var(--line-strong); border-radius: 10px;
      color: var(--ink); background: #fff; outline: none; padding: 0 12px;
    }
    select:focus, input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(29,93,159,.15); }
    .button {
      min-height: 42px; border: 0; border-radius: 10px; padding: 0 16px; cursor: pointer;
      background: var(--ink); color: #fff; font-weight: 800; white-space: nowrap;
      transition: transform .16s ease, background .16s ease;
    }
    .button:hover { background: #1d5d9f; transform: translateY(-1px); }
    .view-tabs { display: flex; gap: 10px; flex-wrap: wrap; margin: 18px 0 0; }
    .view-tab { width: auto; min-height: 42px; border: 1px solid var(--line-strong); border-radius: 999px; padding: 0 18px; color: #1e3a8a; background: rgba(255,255,255,.92); font-weight: 850; cursor: pointer; }
    .view-tab.active { color: #fff; background: #0f172a; border-color: #0f172a; box-shadow: 0 7px 18px rgba(15,23,42,.16); }
    .view { display: block; }
    .view.hidden { display: none; }
    .toggle-field { min-height: 42px; display: flex; align-items: center; gap: 9px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 10px; background: #fff; color: var(--ink-2); font-size: 12px; font-weight: 750; white-space: nowrap; }
    .toggle-field input { width: 17px; min-height: 17px; margin: 0; padding: 0; accent-color: var(--blue); }
    .settings-intro { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px; align-items: center; margin: 22px 0 16px; padding: 22px; border: 1px solid var(--line); border-radius: var(--radius); background: linear-gradient(135deg, #fff, #edf5ff); box-shadow: var(--shadow); }
    .settings-intro h2 { margin: 0; font-size: 25px; letter-spacing: -.035em; }
    .settings-intro p { margin: 7px 0 0; color: var(--muted); font-size: 13px; line-height: 1.55; }
    .settings-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .settings-actions .button { width: auto; }
    .button.secondary { color: #1e3a8a; background: #fff; border: 1px solid var(--line-strong); }
    .button.danger { background: #9f1239; }
    .settings-grid { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); gap: 16px; align-items: start; }
    .settings-card { padding: 20px; }
    .settings-form { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr) auto; gap: 9px; align-items: end; margin: 16px 0; }
    .settings-form.calendar-form { grid-template-columns: minmax(135px, .55fr) minmax(150px, .65fr) minmax(105px, .4fr) minmax(210px, 1.2fr) auto; }
    .settings-form .button { width: auto; }
    .settings-table-wrap { max-height: 520px; overflow: auto; border: 1px solid var(--line); border-radius: 13px; }
    .settings-table { width: 100%; min-width: 0; font-size: 12px; }
    .settings-table th { position: sticky; top: 0; z-index: 2; background: #e8eef8; text-align: left; }
    .settings-table td { background: #fff; text-align: left; white-space: normal; }
    .settings-table button { width: auto; border: 0; border-radius: 8px; padding: 6px 8px; color: #9f1239; background: #ffe4e6; font-size: 11px; font-weight: 850; cursor: pointer; }
    .settings-table button.edit { color: #1e40af; background: #dbeafe; }
    .settings-status { margin: 10px 0 0; min-height: 18px; color: var(--teal); font-size: 12px; font-weight: 750; }
    .settings-help { margin: 0 0 12px; padding: 12px 14px; border-radius: 12px; color: #334155; background: #eef4ff; font-size: 12px; line-height: 1.55; }
    .hidden-people-form { grid-template-columns: minmax(260px, 1fr) auto; }
    .hidden-people-card { grid-column: 1 / -1; }
    .hidden-search-results { display: grid; gap: 7px; max-height: 240px; overflow: auto; margin: -2px 0 14px; }
    .hidden-result {
      width: 100%; min-height: 42px; border: 1px solid var(--line); border-radius: 11px; padding: 9px 11px;
      background: #fff; color: var(--ink); display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px;
      text-align: left; cursor: pointer;
    }
    .hidden-result:hover { border-color: var(--blue); background: #f7fbff; }
    .hidden-result strong { display: block; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .hidden-result span { display: block; color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .hidden-result em { align-self: center; color: #1e40af; font-style: normal; font-size: 11px; font-weight: 850; }
    .workday-card { margin: 16px 0; }
    .settings-form.workday-form { grid-template-columns: minmax(120px, .45fr) minmax(120px, .45fr) minmax(120px, .45fr) auto; }
    .person-toolbar { grid-template-columns: minmax(220px, .8fr) minmax(280px, 1.2fr) minmax(120px, .35fr) auto auto; }
    .person-overview { grid-template-columns: minmax(330px, .8fr) minmax(0, 1.2fr); }
    .profile-card { display: grid; gap: 10px; padding: 18px 20px 20px; }
    .profile-title { display: grid; gap: 4px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
    .profile-title strong { font-size: 22px; letter-spacing: -.025em; }
    .profile-title span { color: var(--muted); font-size: 12px; }
    .profile-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .profile-row { min-width: 0; padding: 10px 11px; border: 1px solid var(--line); border-radius: 12px; background: #f8fafc; }
    .profile-row b { display: block; color: var(--muted); font-size: 10px; letter-spacing: .07em; text-transform: uppercase; }
    .profile-row span { display: block; margin-top: 4px; color: var(--ink); font-size: 13px; font-weight: 800; overflow-wrap: anywhere; }
    .tracking-score { display: inline-flex; min-width: 54px; justify-content: center; border-radius: 999px; padding: 5px 9px; font-weight: 900; font-variant-numeric: tabular-nums; }
    .tracking-score.alarm { color: #fff; background: #7f1d1d; box-shadow: 0 0 0 3px rgba(127,29,29,.13); }
    .tracking-score.critical { color: #fff; background: #be123c; }
    .tracking-score.watch { color: #7c2d12; background: #fed7aa; }
    .tracking-score.control { color: #854d0e; background: #fef3c7; }
    .tracking-score.normal { color: #0f766e; background: #dff4ef; }
    .tracking-reasons { max-width: 460px; white-space: normal; line-height: 1.35; }
    .tracking-method { display: grid; gap: 10px; margin: 10px 20px 0; }
    .tracking-method-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .tracking-method-card { border: 1px solid var(--line); border-radius: 13px; background: #f8fafc; padding: 11px 12px; line-height: 1.35; }
    .tracking-method-card b { display: block; margin-bottom: 4px; color: #0f172a; font-size: 12px; }
    .tracking-method-card span { color: var(--muted); font-size: 11px; }
    .tracking-method-note { margin: 0; color: var(--muted); font-size: 11px; line-height: 1.45; }
    .tracking-method-note strong { color: var(--ink); }
    .tracking-table-tools { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 0 20px 12px; }
    .tracking-table-tools span { color: var(--muted); font-size: 12px; font-weight: 800; }
    .tracking-table-tools button { width: auto; min-height: 32px; padding: 0 11px; border: 1px solid var(--line-strong); border-radius: 10px; background: #fff; color: #1e3a8a; font-size: 11px; font-weight: 850; cursor: pointer; }
    .tracking-table-tools button:hover { background: #eff6ff; }
    .tracking-filter-cell { min-width: 92px; }
    .tracking-filter-label { display: block; line-height: 1.16; white-space: normal; }
    .tracking-filter-button { margin: 6px auto 0; width: 100%; max-width: 120px; min-height: 26px; border: 1px solid #cbd5e1; border-radius: 9px; background: #fff; color: #475569; font-size: 10px; font-weight: 850; display: flex; align-items: center; justify-content: space-between; gap: 6px; cursor: pointer; }
    .tracking-filter-button::after { content: "v"; color: #64748b; font-size: 8px; }
    .tracking-filter-button.active { color: #0f766e; background: #dff4ef; border-color: #5eead4; }
    .tracking-filter-menu { position: fixed; z-index: 9999; display: none; width: min(330px, calc(100vw - 24px)); max-height: min(430px, calc(100vh - 36px)); overflow: hidden; border: 1px solid #cbd5e1; border-radius: 15px; background: #fff; box-shadow: 0 24px 60px rgba(15,23,42,.20); padding: 10px; text-align: left; color: var(--ink); }
    .tracking-filter-menu.open { display: block; }
    .tracking-filter-menu-title { margin: 0 0 8px; color: #1e3a8a; font-size: 11px; font-weight: 950; white-space: normal; }
    .tracking-filter-search { width: 100%; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px 9px; background: #fff; color: var(--ink); font-size: 12px; margin-bottom: 8px; }
    .tracking-filter-actions, .tracking-filter-footer { display: flex; gap: 7px; flex-wrap: wrap; margin-bottom: 8px; }
    .tracking-filter-actions button, .tracking-filter-footer button { width: auto; border: 1px solid var(--line-strong); border-radius: 9px; background: #f8fafc; color: #1e3a8a; padding: 6px 8px; font-size: 11px; font-weight: 850; cursor: pointer; }
    .tracking-filter-actions button:hover, .tracking-filter-footer button:hover { background: #eff6ff; }
    .tracking-filter-list { max-height: 236px; overflow: auto; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; padding: 5px; }
    .tracking-filter-option { display: flex; align-items: center; gap: 7px; padding: 6px 7px; border-radius: 8px; font-size: 12px; font-weight: 750; cursor: pointer; white-space: normal; }
    .tracking-filter-option:hover { background: #eff6ff; }
    .tracking-filter-option input { width: 14px; height: 14px; accent-color: #2563eb; flex: 0 0 auto; }
    .tracking-filter-empty { display: none; padding: 12px; color: var(--muted); font-size: 12px; font-weight: 750; text-align: center; }
    .tracking-filter-footer { justify-content: flex-end; margin: 9px 0 0; }
    .tracking-filter-count { margin-right: auto; color: var(--muted); font-size: 11px; font-weight: 850; align-self: center; }
    .tracking-filter-compare { display: grid; grid-template-columns: minmax(0, 1fr) minmax(70px, .55fr) minmax(70px, .55fr); gap: 6px; align-items: center; margin: 0 0 8px; padding: 8px; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc; }
    .tracking-filter-compare label { grid-column: 1 / -1; color: #1e3a8a; font-size: 10px; font-weight: 950; letter-spacing: .04em; text-transform: uppercase; }
    .tracking-filter-compare select, .tracking-filter-compare input { width: 100%; min-height: 30px; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 9px; background: #fff; color: var(--ink); padding: 5px 7px; font-size: 11px; font-weight: 750; }
    .tracking-filter-compare input::placeholder { color: #94a3b8; }
    .filter-builder { display: grid; grid-template-columns: minmax(220px, .9fr) minmax(150px, .55fr) minmax(110px, .35fr) minmax(110px, .35fr) auto; gap: 9px; align-items: end; padding: 0 20px 16px; }
    .filter-helper-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 0 20px 16px; }
    .filter-helper-card { border: 1px solid var(--line); border-radius: 13px; background: #f8fafc; padding: 11px 12px; line-height: 1.35; }
    .filter-helper-card b { display: block; margin-bottom: 4px; color: #0f172a; font-size: 12px; }
    .filter-helper-card span { color: var(--muted); font-size: 11px; }
    .filter-rule-chips { display: flex; gap: 8px; flex-wrap: wrap; padding: 0 20px 14px; }
    .filter-rule-chip { display: inline-flex; align-items: center; gap: 8px; border: 1px solid #bfdbfe; border-radius: 999px; background: #eff6ff; color: #1e3a8a; padding: 7px 10px; font-size: 11px; font-weight: 850; }
    .filter-rule-chip button { width: auto; min-height: 20px; border: 0; border-radius: 999px; background: #dbeafe; color: #1e40af; padding: 0 7px; cursor: pointer; font-weight: 950; }
    .filter-empty-rules { color: var(--muted); font-size: 12px; font-weight: 750; }
    .filter-kpi-grid { grid-template-columns: repeat(8, minmax(0, 1fr)); }
    .filter-result-table th, .filter-result-table td { text-align: right; }
    .filter-result-table .cell-text { text-align: left; }
    .filter-result-table tbody tr { cursor: pointer; }
    .filter-result-table tbody tr:hover td { background: #eef6ff; }
    .filter-result-table tbody tr.row-selected td { background: #dbeafe !important; font-weight: 900; }
    .ignored-day td { color: #64748b; background: #f8fafc !important; }
    .ignored-day td:first-child { font-style: italic; }
    .status-chip { display: inline-flex; align-items: center; gap: 5px; border-radius: 999px; padding: 4px 8px; font-size: 10px; font-weight: 850; }
    .status-chip.active { color: #0f766e; background: #dff4ef; }
    .status-chip.inactive { color: #9f1239; background: #ffe4e6; }
    .status-chip.default { color: #475569; background: #e2e8f0; }
    .kpis { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
    .kpi { min-height: 112px; padding: 16px; border: 1px solid var(--line); border-radius: 15px; background: var(--panel); box-shadow: 0 8px 18px rgba(31,41,55,.04); }
    .kpi .label { color: var(--muted); font-size: 11px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; }
    .kpi .value { margin-top: 10px; font-size: clamp(22px, 2vw, 30px); font-weight: 800; letter-spacing: -.04em; line-height: 1; }
    .kpi .hint { display: block; margin-top: 7px; color: var(--muted); font-size: 12px; line-height: 1.25; }
    .kpi.positive .value { color: var(--teal); }
    .kpi.negative .value { color: var(--rose); }
    .overview { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(320px, .8fr); gap: 16px; margin: 16px 0; }
    .panel { min-width: 0; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); box-shadow: 0 10px 22px rgba(31,41,55,.045); }
    .panel-head { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; padding: 18px 20px 0; }
    .panel h2 { margin: 0; font-size: 18px; letter-spacing: -.025em; }
    .panel .subtext { margin: 5px 0 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
    .legend { display: flex; flex-wrap: wrap; gap: 8px 12px; color: var(--muted); font-size: 11px; }
    .legend span { display: inline-flex; align-items: center; gap: 5px; }
    .legend i { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
    .month-chart { min-height: 204px; padding: 20px; display: grid; grid-template-columns: repeat(var(--months), minmax(92px, 1fr)); gap: 12px; align-items: end; overflow-x: auto; }
    .month-card { min-width: 92px; display: grid; gap: 8px; }
    .month-bars { height: 118px; display: flex; align-items: end; gap: 6px; padding: 0 5px; border-bottom: 1px solid var(--line); background: repeating-linear-gradient(to top, transparent 0, transparent 28px, rgba(216,204,185,.45) 29px, transparent 30px); }
    .bar { min-width: 24px; flex: 1; border-radius: 7px 7px 2px 2px; position: relative; transition: filter .16s ease; }
    .bar:hover { filter: brightness(1.08); }
    .bar.actual { background: linear-gradient(180deg, #60a5fa, #2563eb); }
    .bar.expected { background: linear-gradient(180deg, #f59e0b, #b45309); }
    .month-card .month-label { font-size: 11px; color: var(--ink-2); font-weight: 800; text-align: center; }
    .month-card .month-diff { font-size: 11px; text-align: center; font-weight: 800; }
    .month-card .month-diff.positive { color: var(--teal); }
    .month-card .month-diff.negative { color: var(--rose); }
    .calendar-list { max-height: 270px; overflow: auto; margin: 15px 10px 12px 20px; padding: 0 10px 0 0; }
    .calendar-empty { padding: 28px 20px; color: var(--muted); font-size: 13px; }
    .calendar-row { display: grid; grid-template-columns: 82px 1fr auto; gap: 9px; align-items: center; padding: 10px 0; border-bottom: 1px solid #eee7db; }
    .calendar-row:last-child { border-bottom: 0; }
    .calendar-date { color: var(--ink-2); font-size: 12px; font-weight: 800; }
    .calendar-title { min-width: 0; display: grid; gap: 2px; }
    .calendar-title strong { font-size: 12px; }
    .calendar-title span { color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tag { display: inline-flex; align-items: center; justify-content: center; min-width: 58px; border-radius: 99px; padding: 4px 7px; font-size: 10px; font-weight: 800; white-space: nowrap; }
    .tag.holiday { color: #8d3037; background: var(--rose-soft); }
    .tag.partial { color: #8a5314; background: var(--amber-soft); }
    .tag.early { color: #15605b; background: var(--teal-soft); }
    .matrix-panel { overflow: hidden; }
    .matrix-head { padding-bottom: 16px; }
    .matrix-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
    .matrix-meta { color: var(--muted); font-size: 12px; white-space: nowrap; }
    .button.excel { min-height: 36px; padding: 0 13px; background: #047857; box-shadow: 0 6px 16px rgba(4,120,87,.16); }
    .button.excel:hover { background: #065f46; }
    .button:disabled { cursor: wait; opacity: .68; transform: none; }
    .matrix-scroll-top { height: 15px; overflow-x: auto; overflow-y: hidden; margin: 0 20px; border-top: 1px solid #eee7db; }
    .matrix-scroll-spacer { height: 1px; }
    .matrix-scroll { max-height: min(68vh, 840px); overflow: auto; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
    table { border-collapse: separate; border-spacing: 0; width: max-content; min-width: 100%; font-size: 12px; }
    th, td { padding: 9px 10px; border-right: 1px solid #e8dfd0; border-bottom: 1px solid #e8dfd0; vertical-align: middle; }
    thead th { color: var(--ink); text-align: center; font-weight: 800; white-space: nowrap; }
    thead .group { position: sticky; top: 0; z-index: 6; background: #dbeafe; border-bottom-color: #93c5fd; }
    thead .metric { position: sticky; top: 37px; z-index: 6; background: #edf2f7; font-size: 10px; line-height: 1.15; white-space: normal; min-width: 82px; }
    thead .base { background: #e2e8f0; }
    tbody td { background: rgba(255,255,255,.97); white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    tbody tr:hover td { background: #eff6ff; }
    tbody tr.clickable-row { cursor: pointer; }
    tbody tr.row-selected td { background: #dbeafe !important; color: #0f172a; font-weight: 850; }
    tbody tr.row-selected .sticky { background: #dbeafe !important; }
    tbody tr.not-fiili td { color: #7b8798; }
    tbody tr.not-fiili td:first-child::after { content: "Fiili dışı"; display: inline-flex; margin-left: 5px; padding: 2px 5px; border-radius: 99px; color: #9f1239; background: #ffe4e6; font-size: 8px; font-weight: 850; vertical-align: middle; }
    tfoot td { position: sticky; bottom: 0; z-index: 4; background: #1e3a8a; color: #fff; font-weight: 800; white-space: nowrap; text-align: right; }
    tfoot td:first-child { text-align: left; }
    .cell-text { text-align: left; }
    tbody td.cell-text { white-space: normal; overflow-wrap: anywhere; word-break: normal; line-height: 1.28; }
    .sticky { position: sticky; z-index: 5; }
    thead .sticky { z-index: 8; }
    .col-sicil { left: 0; min-width: 92px; max-width: 92px; }
    .col-name { left: 92px; min-width: 194px; max-width: 194px; }
    .col-department { left: 286px; min-width: 210px; max-width: 210px; }
    .col-position { left: 496px; min-width: 210px; max-width: 210px; box-shadow: 5px 0 8px rgba(16,35,63,.08); }
    tbody .sticky { background: #fff; }
    tbody tr:nth-child(even) .sticky { background: #f8fafc; }
    tbody tr:hover .sticky { background: #eff6ff; }
    .positive { color: var(--teal); font-weight: 800; }
    .negative { color: var(--rose); font-weight: 800; }
    .empty { color: #a6a19a; }
    .note { margin: 0; padding: 16px 20px 19px; color: var(--muted); font-size: 12px; line-height: 1.55; }
    .note strong { color: var(--ink-2); }
    .footer { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 14px; color: var(--muted); font-size: 11px; }
    .footer b { color: var(--ink-2); }
    @media (max-width: 1120px) {
      .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .overview { grid-template-columns: 1fr; }
      .toolbar { grid-template-columns: 1fr 1fr; }
      .settings-grid { grid-template-columns: 1fr; }
      .settings-form, .settings-form.calendar-form, .settings-form.workday-form { grid-template-columns: 1fr 1fr; }
      .person-toolbar { grid-template-columns: 1fr 1fr; }
      .tracking-method-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .filter-builder, .filter-helper-grid { grid-template-columns: 1fr 1fr; }
      .filter-kpi-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .col-department, .col-position { position: static; box-shadow: none; }
    }
    @media (max-width: 720px) {
      .shell { width: min(100% - 20px, 1800px); padding-top: 10px; }
      .hero { grid-template-columns: 1fr; padding: 24px; border-radius: 18px; }
      .source-chip { min-width: 0; }
      .toolbar, .kpis { grid-template-columns: 1fr; }
      .settings-intro { grid-template-columns: 1fr; }
      .settings-actions { justify-content: flex-start; }
      .settings-form, .settings-form.calendar-form, .settings-form.workday-form, .person-toolbar { grid-template-columns: 1fr; }
      .tracking-method-grid { grid-template-columns: 1fr; }
      .filter-builder, .filter-helper-grid, .filter-kpi-grid { grid-template-columns: 1fr; }
      .profile-grid { grid-template-columns: 1fr; }
      .button { width: 100%; }
      .panel-head { padding-inline: 15px; }
      .month-chart { padding: 15px; }
      .matrix-scroll-top { margin-inline: 12px; }
      .matrix-meta { display: none; }
      .col-name { position: static; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="hero">
      <div>
        <p class="eyebrow">PDKS · Çalışma zamanı kontrolü</p>
        <h1>Çalışma &amp; Evden Çalışma Takibi</h1>
        <p>Departman bazlı PDKS matrisi: turnike görünürlüğü, evden çalışma günleri, çalışılan saat, tanımlı çalışma takvimi ve saat farkı tek görünümde.</p>
      </div>
      <div class="source-chip"><span>Kaynak / üretim</span><strong id="sourceMeta">__SOURCE_META__</strong></div>
    </header>

    <nav class="view-tabs" aria-label="PDKS sayfaları">
      <button class="view-tab active" type="button" data-view="dashboardView">PDKS Takip</button>
      <button class="view-tab" type="button" data-view="personView">Kişi Detayı</button>
      <button class="view-tab" type="button" data-view="trackingView">Takip Listesi</button>
      <button class="view-tab" type="button" data-view="filterView">Filtreleme</button>
      <button class="view-tab" type="button" data-view="settingsView">Ayarlar</button>
    </nav>

    <div class="view" id="dashboardView">
      <section class="toolbar" aria-label="Filtreler">
        <div class="field"><label for="departmentSelect">Departman</label><select id="departmentSelect"></select></div>
        <div class="field"><label for="yearSelect">Yıl</label><select id="yearSelect"></select></div>
        <div class="field"><label for="searchInput">Sicil veya ad soyad ara</label><input id="searchInput" type="search" placeholder="Örn. 10007 veya Taner Kerti"></div>
        <label class="toggle-field"><input id="hideInactiveInput" type="checkbox"> Fiili listede olmayan kişileri gösterme</label>
        <label class="toggle-field"><input id="hideHiddenInput" type="checkbox"> Gizlenen kişileri gizle</label>
        <label class="toggle-field"><input id="ignoreWeekendInput" type="checkbox"> Hafta sonu çalışmalarını yoksay</label>
        <label class="toggle-field"><input id="ignoreHolidayInput" type="checkbox"> Resmi tatil çalışmalarını yoksay</label>
        <button class="button" id="downloadButton" type="button">Filtreleneni CSV İndir</button>
      </section>

      <section class="kpis" id="kpiGrid" aria-live="polite"></section>

      <section class="overview">
        <article class="panel">
          <div class="panel-head">
            <div><h2>Aylık Saat Dengesi</h2><p class="subtext">Mavi: çalışılan brüt saat · amber: çalışma takvimine göre gereken saat</p></div>
            <div class="legend"><span><i style="background:#2563eb"></i>Çalışılan</span><span><i style="background:#b45309"></i>Gereken</span></div>
          </div>
          <div class="month-chart" id="monthChart"></div>
        </article>
        <article class="panel">
          <div class="panel-head"><div><h2>Çalışma Takvimi İstisnaları</h2><p class="subtext">Resmi tatil, yarım gün ve erken çıkış kuralları hesaplamaya doğrudan dahildir.</p></div></div>
          <div class="calendar-list" id="calendarList"></div>
        </article>
      </section>

      <section class="panel matrix-panel">
        <div class="panel-head matrix-head">
          <div><h2>Departman PDKS Matrisi</h2><p class="subtext" id="matrixDescription"></p></div>
          <div class="matrix-actions">
            <div class="matrix-meta" id="matrixMeta"></div>
            <button class="button excel" id="excelDownloadButton" type="button" title="Mevcut filtrelerle, tema ve hücre biçimleri korunarak gerçek XLSX çalışma kitabı indirir.">Temalı Excel İndir (.xlsx)</button>
          </div>
        </div>
        <div class="matrix-scroll-top" id="matrixScrollTop" aria-label="Tabloyu yatay kaydır"><div class="matrix-scroll-spacer" id="matrixScrollSpacer"></div></div>
        <div class="matrix-scroll" id="matrixScroll"><table id="matrixTable"></table></div>
        <p class="note"><strong>Hesaplama notu:</strong> <span id="logicNote"></span></p>
      </section>
    </div>

    <section class="view hidden" id="personView">
      <section class="toolbar person-toolbar" aria-label="Kişi detayı filtreleri">
        <div class="field"><label for="personDetailSearch">Kişi ara</label><input id="personDetailSearch" type="search" placeholder="Sicil veya ad soyad"></div>
        <div class="field"><label for="personDetailSelect">Kişi</label><select id="personDetailSelect"></select></div>
        <div class="field"><label for="personYearSelect">Yıl</label><select id="personYearSelect"></select></div>
        <label class="toggle-field"><input id="personHideInactiveInput" type="checkbox"> Fiili listede olmayanları gizle</label>
        <label class="toggle-field"><input id="personHideHiddenInput" type="checkbox"> Gizlenen kişileri gizle</label>
        <label class="toggle-field"><input id="personIgnoreWeekendInput" type="checkbox"> Hafta sonu çalışmalarını yoksay</label>
        <label class="toggle-field"><input id="personIgnoreHolidayInput" type="checkbox"> Resmi tatil çalışmalarını yoksay</label>
      </section>
      <section class="kpis" id="personKpiGrid" aria-live="polite"></section>
      <section class="overview person-overview">
        <article class="panel">
          <div class="panel-head"><div><h2>Kişi Özeti</h2><p class="subtext" id="personDetailMeta">Seçilen kişinin organizasyon ve PDKS özeti.</p></div></div>
          <div id="personProfileCard"></div>
        </article>
        <article class="panel">
          <div class="panel-head"><div><h2>Aylık Denge</h2><p class="subtext">Seçilen kişinin ay bazlı çalışılan / gereken saat dengesi.</p></div></div>
          <div class="month-chart" id="personMonthChart"></div>
        </article>
      </section>
      <section class="panel matrix-panel">
        <div class="panel-head matrix-head"><div><h2>Günlük Kayıt Detayı</h2><p class="subtext">İlk giriş saati, çalışılan saat, gereken saat, fark ve evden çalışma işaretleri.</p></div></div>
        <div class="tracking-table-tools" id="personDayTableTools"></div>
        <div class="matrix-scroll"><table id="personDayTable"></table></div>
      </section>
    </section>

    <section class="view hidden" id="trackingView">
      <section class="toolbar" aria-label="Takip listesi filtreleri">
        <div class="field"><label for="trackingDepartmentSelect">Departman</label><select id="trackingDepartmentSelect"></select></div>
        <div class="field"><label for="trackingYearSelect">Yıl</label><select id="trackingYearSelect"></select></div>
        <div class="field"><label for="trackingLevelSelect">Liste kapsamı</label><select id="trackingLevelSelect">
          <option value="alarm">Sadece Alarm</option>
          <option value="action">Alarm + Kritik</option>
          <option value="watch">Alarm + Kritik + İzlemeli</option>
          <option value="all">Tümü</option>
        </select></div>
        <div class="field"><label for="trackingSearchInput">Sicil veya ad soyad ara</label><input id="trackingSearchInput" type="search" placeholder="Örn. 10007 veya Taner Kerti"></div>
        <label class="toggle-field"><input id="trackingHideInactiveInput" type="checkbox" checked> Fiili listede olmayanları gizle</label>
        <label class="toggle-field"><input id="trackingHideHiddenInput" type="checkbox" checked> Gizlenen kişileri gizle</label>
        <label class="toggle-field"><input id="trackingIgnoreWeekendInput" type="checkbox"> Hafta sonu çalışmalarını yoksay</label>
        <label class="toggle-field"><input id="trackingIgnoreHolidayInput" type="checkbox"> Resmi tatil çalışmalarını yoksay</label>
      </section>
      <section class="kpis" id="trackingKpiGrid" aria-live="polite"></section>
      <section class="panel matrix-panel">
        <div class="panel-head matrix-head"><div><h2>Takip Listesi</h2><p class="subtext">Düzenli geç giriş, yoğun evden çalışma ve kalıcı negatif saat sinyalleri tek skor altında izlenir.</p></div></div>
        <p class="settings-help" id="trackingFormulaNote"></p>
        <div class="tracking-method" id="trackingMethodInfo"></div>
        <div class="tracking-table-tools" id="trackingTableTools"></div>
        <div class="matrix-scroll"><table id="trackingTable"></table></div>
      </section>
    </section>

    <section class="view hidden" id="filterView">
      <section class="toolbar" aria-label="Gelişmiş filtreleme">
        <div class="field"><label for="filterDepartmentSelect">Departman</label><select id="filterDepartmentSelect"></select></div>
        <div class="field"><label for="filterStartDate">Başlangıç tarihi</label><input id="filterStartDate" type="date"></div>
        <div class="field"><label for="filterEndDate">Bitiş tarihi</label><input id="filterEndDate" type="date"></div>
        <div class="field"><label for="filterSearchInput">Sicil veya ad soyad ara</label><input id="filterSearchInput" type="search" placeholder="Örn. 10007 veya Taner Kerti"></div>
        <label class="toggle-field"><input id="filterHideInactiveInput" type="checkbox" checked> Fiili listede olmayanları gizle</label>
        <label class="toggle-field"><input id="filterHideHiddenInput" type="checkbox" checked> Gizlenen kişileri gizle</label>
        <label class="toggle-field"><input id="filterIgnoreWeekendInput" type="checkbox"> Hafta sonu çalışmalarını yoksay</label>
        <label class="toggle-field"><input id="filterIgnoreHolidayInput" type="checkbox"> Resmi tatil çalışmalarını yoksay</label>
        <button class="button" id="filterApplyButton" type="button">Filtrele</button>
        <button class="button secondary" id="filterResetButton" type="button">Sıfırla</button>
        <button class="button excel" id="filterDownloadButton" type="button">Sonucu CSV İndir</button>
      </section>

      <section class="kpis filter-kpi-grid" id="filterKpiGrid" aria-live="polite"></section>

      <section class="panel matrix-panel">
        <div class="panel-head matrix-head">
          <div><h2>Gelişmiş Kişi Filtreleme</h2><p class="subtext" id="filterDescription">Tarih aralığı ve metrik koşullarıyla kişileri harici evden gün, eksi saat, geç giriş, erken çıkış ve home kuralı sinyallerine göre süzün.</p></div>
        </div>
        <div class="filter-helper-grid" id="filterMetricInfo"></div>
        <div class="filter-builder">
          <div class="field"><label for="filterMetricSelect">Metrik</label><select id="filterMetricSelect"></select></div>
          <div class="field"><label for="filterOperatorSelect">Koşul</label><select id="filterOperatorSelect">
            <option value="gte">Büyük / eşit >=</option>
            <option value="gt">Büyüktür &gt;</option>
            <option value="lte">Küçük / eşit <=</option>
            <option value="lt">Küçüktür &lt;</option>
            <option value="eq">Eşittir =</option>
            <option value="between">Arasında</option>
          </select></div>
          <div class="field"><label for="filterValueInput">Değer</label><input id="filterValueInput" type="number" step="0.1" placeholder="Örn. 5"></div>
          <div class="field"><label for="filterValue2Input">Üst değer</label><input id="filterValue2Input" type="number" step="0.1" placeholder="Arasında"></div>
          <button class="button" id="filterAddRuleButton" type="button">Koşul Ekle</button>
        </div>
        <div class="filter-rule-chips" id="filterRuleChips"></div>
        <div class="tracking-table-tools" id="filterTableTools"></div>
        <div class="matrix-scroll"><table class="filter-result-table" id="filterResultTable"></table></div>
      </section>
    </section>

    <section class="view hidden" id="settingsView">
      <div class="settings-intro">
        <div><h2>PDKS Ayarları</h2><p>Departman key eşleştirmeleri ve çalışma takvimi istisnaları bu tarayıcıda saklanır. Ayar dosyasını dışa aktararak başka kullanıcı veya bilgisayara taşıyabilirsiniz.</p></div>
        <div class="settings-actions">
          <button class="button secondary" id="exportSettingsButton" type="button">Ayarları Dışa Aktar</button>
          <button class="button secondary" id="importSettingsButton" type="button">Ayarları İçe Aktar</button>
          <button class="button danger" id="resetSettingsButton" type="button">Tümünü Varsayılana Döndür</button>
          <input id="settingsFileInput" type="file" accept="application/json,.json" hidden>
        </div>
      </div>

      <article class="panel settings-card workday-card">
        <div><h2>Genel Çalışma Saati</h2><p class="subtext">Özel gün kuralı olmayan hafta içi günlerde gereken saat bu aralıktan hesaplanır.</p></div>
        <div class="settings-form workday-form">
          <div class="field"><label for="workdayStartInput">Başlangıç</label><input id="workdayStartInput" type="time" value="08:00"></div>
          <div class="field"><label for="workdayEndInput">Bitiş</label><input id="workdayEndInput" type="time" value="17:45"></div>
          <div class="field"><label for="workdayHoursInput">Gereken saat</label><input id="workdayHoursInput" type="number" min="0" max="24" step="0.125" value="9.75"></div>
          <button class="button" id="saveWorkdayButton" type="button">Standart Saati Güncelle</button>
        </div>
        <p class="settings-help">Örn. 08:00-17:45 = 9,75 saat. Resmi tatil, yarım gün ve erken çıkış kuralları bu genel ayarın üstüne özel istisna olarak çalışır.</p>
      </article>

      <div class="settings-grid">
        <article class="panel settings-card">
          <div><h2>Departman Key Eşleştirmeleri</h2><p class="subtext">PDKS/fiili kaynaktaki departman adını raporda kullanılacak üst seviye key ile eşleştirir.</p></div>
          <div class="settings-form">
            <div class="field"><label for="mappingSourceSelect">Kaynak departman</label><select id="mappingSourceSelect"></select></div>
            <div class="field"><label for="mappingTargetInput">Gösterilecek key / departman</label><input id="mappingTargetInput" list="departmentKeyList" placeholder="Örn. İnsan Kaynakları"><datalist id="departmentKeyList"></datalist></div>
            <button class="button" id="saveMappingButton" type="button">Ekle / Güncelle</button>
          </div>
          <p class="settings-help">Bir eşleştirme kaldırıldığında ilgili kaynak için üretimdeki varsayılan key yeniden kullanılır. Yeni key adları elle yazılabilir.</p>
          <div class="settings-table-wrap"><table class="settings-table"><thead><tr><th>Kaynak Departman</th><th>Etkin Key</th><th>Durum</th><th>İşlem</th></tr></thead><tbody id="mappingTableBody"></tbody></table></div>
        </article>

        <article class="panel settings-card">
          <div><h2>Özel Gün ve Çalışma Saati</h2><p class="subtext">Resmi tatil, yarım gün ve erken çıkış tarihlerini ekleyin, güncelleyin veya kaldırın.</p></div>
          <div class="settings-form calendar-form">
            <div class="field"><label for="calendarDateInput">Tarih</label><input id="calendarDateInput" type="date"></div>
            <div class="field"><label for="calendarCategorySelect">Tür</label><select id="calendarCategorySelect"><option>Resmi tatil</option><option>Yarım gün</option><option>Erken çıkış</option><option>Özel çalışma</option></select></div>
            <div class="field"><label for="calendarHoursInput">Gereken saat</label><input id="calendarHoursInput" type="number" min="0" max="24" step="0.125" value="0"></div>
            <div class="field"><label for="calendarDescriptionInput">Açıklama</label><input id="calendarDescriptionInput" placeholder="Örn. Şirket özel günü"></div>
            <button class="button" id="saveCalendarButton" type="button">Ekle / Güncelle</button>
          </div>
          <p class="settings-help">Hafta sonları her zaman 0 saattir. Burada tanımlanan tarih kuralları standart 9,75 saatlik iş gününün üzerine uygulanır.</p>
          <div class="settings-table-wrap"><table class="settings-table"><thead><tr><th>Tarih</th><th>Tür</th><th>Açıklama</th><th>Gereken</th><th>İşlem</th></tr></thead><tbody id="calendarTableBody"></tbody></table></div>
          <div class="settings-status" id="settingsStatus"></div>
        </article>

        <article class="panel settings-card hidden-people-card">
          <div><h2>Gizlenen Kişiler</h2><p class="subtext">Sicil, ad soyad, görev veya departman ile arayın; seçtiğiniz kişiler “Gizlenen kişileri gizle” filtresi açıkken PDKS matrisinden çıkarılır.</p></div>
          <div class="settings-form hidden-people-form">
            <div class="field"><label for="hiddenPersonSearch">Kişi ara</label><input id="hiddenPersonSearch" type="search" placeholder="Sicil, ad soyad, görev veya departman"></div>
            <button class="button secondary" id="clearHiddenPeopleButton" type="button">Manuel Listeyi Temizle</button>
          </div>
          <div class="hidden-search-results" id="hiddenSearchResults"></div>
          <div class="settings-table-wrap"><table class="settings-table"><thead><tr><th>Sicil</th><th>Ad Soyad</th><th>Pozisyon</th><th>Departman</th><th>Neden</th><th>İşlem</th></tr></thead><tbody id="hiddenPeopleTableBody"></tbody></table></div>
        </article>
      </div>
    </section>

    <footer class="footer"><span><b>Kaynak:</b> <span id="footerSource"></span></span><span><b>Fiili liste:</b> <span id="footerFiili"></span></span><span><b>Kapsam:</b> <span id="footerCoverage"></span></span><span><b>Çalışma saati standardı:</b> <span id="footerHours"></span></span></footer>
  </main>

  <script>
    const DATA = __PAYLOAD__;
    const METRICS = [
      ['geldigi_gun', 'Geldiği Gün', 'count'],
      ['evden_gun', 'Evden Gün', 'count'],
      ['harici_evden_gun', 'Harici Evden Gün', 'count'],
      ['toplam_evden_gun', 'Toplam Evden Gün', 'count'],
      ['calistigi_saat', 'Çalıştığı Saat', 'hour'],
      ['gereken_saat', 'Çalışılması Gereken Saat', 'hour'],
      ['fark', 'Fark', 'hour'],
    ];
    const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const $ = id => document.getElementById(id);
    const STORAGE_KEY = 'aizanoi_pdks_settings_v2';
    const state = {
      department: '', year: '', query: '', hideInactive: false, hideHidden: true, activeView: 'dashboardView',
      personQuery: '', personSicil: '', personYear: '', personHideInactive: false, personHideHidden: true,
      personDayFilters: {}, selectedPersonDayKey: '',
      trackingDepartment: '', trackingYear: '', trackingLevel: 'alarm', trackingQuery: '', trackingHideInactive: true, trackingHideHidden: true,
      trackingTableFilters: {}, trackingTableComparisons: {}, selectedTrackingSicil: '',
      filterDepartment: '', filterQuery: '', filterStart: '', filterEnd: '', filterHideInactive: true, filterHideHidden: true,
      filterRules: [], selectedFilterSicil: '',
      filterTableFilters: {}, filterTableComparisons: {}, filterTableSort: {},
      ignoreWeekendWork: false, ignoreHolidayWork: false,
    };
    const defaultCalendar = Object.fromEntries(
      Object.values(DATA.calendar || {}).flat().map(item => [item.date, { ...item }])
    );

    function emptySettings() {
      const defaults = DATA.default_workday || { start: '08:00', end: '17:45', hours: DATA.standard_daily_hours || 9.75 };
      return { version: 5, departmentOverrides: {}, calendarOverrides: {}, hiddenPeople: {}, autoHiddenVisible: {}, workday: { ...defaults } };
    }
    function normalizeSettings(value) {
      const result = emptySettings();
      if (!value || typeof value !== 'object') return result;
      if (value.departmentOverrides && typeof value.departmentOverrides === 'object') result.departmentOverrides = { ...value.departmentOverrides };
      if (value.calendarOverrides && typeof value.calendarOverrides === 'object') result.calendarOverrides = { ...value.calendarOverrides };
      if (value.hiddenPeople && typeof value.hiddenPeople === 'object') result.hiddenPeople = { ...value.hiddenPeople };
      if (value.autoHiddenVisible && typeof value.autoHiddenVisible === 'object') result.autoHiddenVisible = { ...value.autoHiddenVisible };
      if (value.workday && typeof value.workday === 'object') {
        result.workday = { ...result.workday, ...value.workday };
        if (!Number.isFinite(Number(result.workday.hours))) result.workday.hours = DATA.standard_daily_hours || 9.75;
      }
      return result;
    }
    function loadSettings() {
      try { return normalizeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); }
      catch (_error) { return emptySettings(); }
    }
    let settings = loadSettings();
    function saveSettings(message = 'Ayarlar kaydedildi.') {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
      catch (_error) { message = 'Tarayıcı yerel depolamasına yazılamadı; ayarları dışa aktarın.'; }
      if ($('settingsStatus')) $('settingsStatus').textContent = message;
    }
    function mappedDepartment(record) {
      const source = String(record.source_department || record.pdks_department || 'Belirsiz Departman');
      const override = settings.departmentOverrides[source];
      return String(override || (DATA.default_department_mapping || {})[source] || source);
    }
    function hiddenPeople() {
      if (!settings.hiddenPeople || typeof settings.hiddenPeople !== 'object') settings.hiddenPeople = {};
      return settings.hiddenPeople;
    }
    function autoHiddenVisible() {
      if (!settings.autoHiddenVisible || typeof settings.autoHiddenVisible !== 'object') settings.autoHiddenVisible = {};
      return settings.autoHiddenVisible;
    }
    function hiddenRecordKey(record) { return String(record.sicil || '').trim(); }
    function autoHiddenMap() {
      return Object.fromEntries((DATA.auto_hidden_people || []).map(person => [String(person.sicil || '').trim(), person]));
    }
    function autoHiddenRecord(record) {
      const key = hiddenRecordKey(record);
      return !autoHiddenVisible()[key] && (!!record.auto_hidden || !!autoHiddenMap()[key]);
    }
    function isHiddenRecord(record) { return !!hiddenPeople()[hiddenRecordKey(record)] || autoHiddenRecord(record); }
    function hiddenRecordLabel(record) {
      return `${record.sicil || ''} · ${record.name || ''} · ${record.position || ''} · ${mappedDepartment(record)}`;
    }
    function effectiveCalendar() {
      const merged = { ...defaultCalendar };
      Object.entries(settings.calendarOverrides || {}).forEach(([day, rule]) => {
        if (rule === null) delete merged[day];
        else merged[day] = { ...rule, date: day };
      });
      return merged;
    }
    function expectedHoursForDate(dateText, calendar = effectiveCalendar()) {
      const date = new Date(`${dateText}T12:00:00`);
      const day = date.getDay();
      if (day === 0 || day === 6) return 0;
      const rule = calendar[dateText];
      return Number(rule && rule.expected_hours != null ? rule.expected_hours : standardDailyHours());
    }
    function isWeekendDate(dateText) {
      const date = new Date(`${dateText}T12:00:00`);
      const day = date.getDay();
      return day === 0 || day === 6;
    }
    function isOfficialHoliday(dateText, calendar = effectiveCalendar()) {
      const item = calendar[dateText];
      return !!item && item.category === 'Resmi tatil' && Number(item.expected_hours || 0) === 0;
    }
    function shouldIgnoreWorkday(dateText, calendar = effectiveCalendar()) {
      return (state.ignoreWeekendWork && isWeekendDate(dateText)) || (state.ignoreHolidayWork && isOfficialHoliday(dateText, calendar));
    }
    function effectiveDayValues(day, calendar = effectiveCalendar()) {
      const [dateText, rawCount = 0, rawActual = 0, rawEvden = 0, rawHarici = 0, firstEntry = null, lastExit = null] = day;
      const ignored = shouldIgnoreWorkday(dateText, calendar);
      const count = ignored ? 0 : Number(rawCount || 0);
      const actual = ignored ? 0 : Number(rawActual || 0);
      const evden = ignored ? 0 : Number(rawEvden || 0);
      const harici = ignored ? 0 : Number(rawHarici || 0);
      const expected = ignored ? 0 : expectedHoursForDate(dateText, calendar) * count;
      return {
        dateText, count, actual, evden, harici,
        firstEntry: firstEntry == null ? null : Number(firstEntry),
        lastExit: lastExit == null ? null : Number(lastExit),
        expected,
        diff: actual - expected,
        ignored,
        isWeekend: isWeekendDate(dateText),
        isHoliday: isOfficialHoliday(dateText, calendar),
      };
    }
    function rebuildDerivedMetrics() {
      const calendar = effectiveCalendar();
      DATA.records.forEach(record => {
        Object.values(record.months || {}).forEach(month => {
          METRICS.forEach(([key]) => { month[key] = 0; });
        });
        (record.days || []).forEach(day => {
          const values = effectiveDayValues(day, calendar);
          const monthKey = String(values.dateText).slice(0, 7);
          const month = (record.months || {})[monthKey];
          if (!month) return;
          month.geldigi_gun += values.count;
          month.evden_gun += values.evden;
          month.harici_evden_gun += values.harici;
          month.toplam_evden_gun += values.evden + values.harici;
          month.calistigi_saat += values.actual;
          month.gereken_saat += values.expected;
        });
        Object.values(record.months || {}).forEach(month => {
          month.geldigi_gun = Math.round(Number(month.geldigi_gun || 0));
          month.evden_gun = Math.round(Number(month.evden_gun || 0));
          month.harici_evden_gun = Math.round(Number(month.harici_evden_gun || 0));
          month.toplam_evden_gun = Math.round(Number(month.toplam_evden_gun || 0));
          month.calistigi_saat = Math.round(Number(month.calistigi_saat || 0) * 1000) / 1000;
          month.gereken_saat = Math.round(Number(month.gereken_saat || 0) * 1000) / 1000;
          month.fark = Math.round((month.calistigi_saat - month.gereken_saat) * 1000) / 1000;
        });
      });
    }

    function syncCalculationToggles() {
      ['ignoreWeekendInput', 'personIgnoreWeekendInput', 'trackingIgnoreWeekendInput'].forEach(id => { if ($(id)) $(id).checked = state.ignoreWeekendWork; });
      ['ignoreHolidayInput', 'personIgnoreHolidayInput', 'trackingIgnoreHolidayInput'].forEach(id => { if ($(id)) $(id).checked = state.ignoreHolidayWork; });
    }
    function applyCalculationMode({ weekend = state.ignoreWeekendWork, holiday = state.ignoreHolidayWork } = {}) {
      state.ignoreWeekendWork = !!weekend;
      state.ignoreHolidayWork = !!holiday;
      syncCalculationToggles();
      rebuildDerivedMetrics();
      render();
      if (state.activeView === 'personView') renderPersonDetail();
      if (state.activeView === 'trackingView') renderTracking();
      if (state.activeView === 'filterView') renderFilterView();
    }
    function bindCalculationToggle(id, type) {
      const input = $(id);
      if (!input) return;
      input.checked = type === 'weekend' ? state.ignoreWeekendWork : state.ignoreHolidayWork;
      input.addEventListener('change', event => {
        applyCalculationMode(type === 'weekend' ? { weekend: event.target.checked } : { holiday: event.target.checked });
      });
    }
    function esc(value) {
      return String(value == null ? '' : value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
    }
    function num(value, digits = 0) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return 0;
      return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(parsed);
    }
    function hour(value) { return num(value, 1); }
    function monthLabel(month) {
      const [year, number] = String(month).split('-');
      return `${MONTHS_TR[Math.max(0, Number(number) - 1)] || month} ${year}`;
    }
    function monthSort(a, b) { return String(a).localeCompare(String(b), 'tr'); }
    function timeTextToHours(value) {
      const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
      if (!match) return NaN;
      return Number(match[1]) + Number(match[2]) / 60;
    }
    function hoursBetween(start, end) {
      const startHour = timeTextToHours(start);
      const endHour = timeTextToHours(end);
      if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) return DATA.standard_daily_hours || 9.75;
      return Math.round(((endHour >= startHour ? endHour - startHour : endHour + 24 - startHour) || 0) * 1000) / 1000;
    }
    function standardDailyHours() { return Number(settings.workday.hours || DATA.standard_daily_hours || 9.75); }
    function workdayStartHour() { return timeTextToHours(settings.workday.start || DATA.default_workday.start || '08:00'); }
    function workdayEndHour() { return timeTextToHours(settings.workday.end || DATA.default_workday.end || '17:45'); }
    function hourToText(value) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return '—';
      const h = Math.floor(parsed);
      const m = Math.round((parsed - h) * 60);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    function activeMonths() {
      const months = state.year ? DATA.months.filter(month => month.startsWith(`${state.year}-`)) : DATA.months;
      return [...months].sort(monthSort).reverse();
    }
    function metricValue(record, month, key) { return Number(((record.months || {})[month] || {})[key] || 0); }
    function metricsFor(record, months) {
      const result = Object.fromEntries(METRICS.map(([key]) => [key, 0]));
      months.forEach(month => METRICS.forEach(([key]) => { result[key] += metricValue(record, month, key); }));
      return result;
    }
    function filteredRows() {
      const query = state.query.trim().toLocaleLowerCase('tr-TR');
      return DATA.records.filter(record => {
        const department = mappedDepartment(record);
        if (state.department && department !== state.department) return false;
        if (state.hideInactive && !record.is_in_fiili) return false;
        if (state.hideHidden && isHiddenRecord(record)) return false;
        if (!query) return true;
        return `${record.sicil} ${record.name} ${record.position} ${record.fiili_unvan || ''} ${department} ${record.source_department}`.toLocaleLowerCase('tr-TR').includes(query);
      }).sort((a, b) => a.name.localeCompare(b.name, 'tr') || a.sicil.localeCompare(b.sicil, 'tr'));
    }
    function summary(rows, months) {
      const total = Object.fromEntries(METRICS.map(([key]) => [key, 0]));
      const monthly = Object.fromEntries(months.map(month => [month, Object.fromEntries(METRICS.map(([key]) => [key, 0]))]));
      rows.forEach(record => {
        const recordTotal = metricsFor(record, months);
        METRICS.forEach(([key]) => { total[key] += recordTotal[key]; });
        months.forEach(month => METRICS.forEach(([key]) => { monthly[month][key] += metricValue(record, month, key); }));
      });
      return { total, monthly };
    }
    function displayMetric(value, type, blankWhenZero = false) {
      if (blankWhenZero && !value) return '<span class="empty">—</span>';
      return type === 'hour' ? hour(value) : num(value);
    }
    function differenceCell(value, blankWhenZero = false) {
      if (blankWhenZero && !value) return '<span class="empty">—</span>';
      const className = value > 0.001 ? 'positive' : value < -0.001 ? 'negative' : '';
      return `<span class="${className}">${hour(value)}</span>`;
    }
    function updateKpis(rows, totals) {
      const uniquePeople = new Set(rows.map(row => row.sicil)).size;
      const cards = [
        ['Çalışan', num(uniquePeople), `${num(rows.filter(row => row.is_in_fiili).length)} fiili listede · ${num(rows.filter(row => !row.is_in_fiili).length)} fiili dışı`],
        ['Geldiği Gün', num(totals.geldigi_gun), 'PDKS kayıt satırı sayısı'],
        ['Toplam Evden Gün', num(totals.toplam_evden_gun), `${num(totals.evden_gun)} evden + ${num(totals.harici_evden_gun)} harici`],
        ['Çalıştığı Saat', hour(totals.calistigi_saat), 'Brüt süre toplamı'],
        ['Gereken Saat', hour(totals.gereken_saat), 'Takvim kuralları sonrası'],
        ['Saat Farkı', `${totals.fark >= 0 ? '+' : ''}${hour(totals.fark)}`, totals.fark >= 0 ? 'Pozitif denge' : 'Eksik süre', totals.fark >= 0 ? 'positive' : 'negative'],
      ];
      $('kpiGrid').innerHTML = cards.map(([label, value, hint, tone = '']) => `<article class="kpi ${tone}"><div class="label">${label}</div><div class="value">${value}</div><span class="hint">${hint}</span></article>`).join('');
    }
    function renderMonthChart(months, monthly) {
      const values = months.map(month => Math.max(monthly[month].calistigi_saat, monthly[month].gereken_saat));
      const maxValue = Math.max(...values, 1);
      $('monthChart').style.setProperty('--months', Math.max(months.length, 1));
      $('monthChart').innerHTML = months.slice().reverse().map(month => {
        const item = monthly[month];
        const actualHeight = Math.max(3, (item.calistigi_saat / maxValue) * 100);
        const expectedHeight = Math.max(3, (item.gereken_saat / maxValue) * 100);
        const diffClass = item.fark >= 0 ? 'positive' : 'negative';
        return `<div class="month-card" title="${esc(monthLabel(month))}: ${hour(item.calistigi_saat)} saat / ${hour(item.gereken_saat)} saat">
          <div class="month-bars"><div class="bar actual" style="height:${actualHeight}%"></div><div class="bar expected" style="height:${expectedHeight}%"></div></div>
          <div class="month-label">${esc(monthLabel(month))}</div>
          <div class="month-diff ${diffClass}">${item.fark >= 0 ? '+' : ''}${hour(item.fark)} sa.</div>
        </div>`;
      }).join('') || '<div class="calendar-empty">Seçili yıl için ay verisi bulunamadı.</div>';
    }
    function ruleClass(category) {
      if (category === 'Resmi tatil') return 'holiday';
      if (category === 'Yarım gün') return 'partial';
      return 'early';
    }
    function renderCalendar() {
      const years = state.year ? [state.year] : DATA.years.map(String);
      const yearSet = new Set(years.map(String));
      const entries = Object.values(effectiveCalendar())
        .filter(item => yearSet.has(String(item.date).slice(0, 4)))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      $('calendarList').innerHTML = entries.length ? entries.map(item => {
        const date = new Date(`${item.date}T12:00:00`);
        const dateLabel = `${String(date.getDate()).padStart(2, '0')} ${MONTHS_TR[date.getMonth()]}`;
        return `<div class="calendar-row"><span class="calendar-date">${dateLabel}</span><div class="calendar-title"><strong>${esc(item.description)}</strong><span>Gereken süre: ${hour(item.expected_hours)} saat</span></div><span class="tag ${ruleClass(item.category)}">${esc(item.category)}</span></div>`;
      }).join('') : '<div class="calendar-empty">Seçili yıl için tanımlı özel takvim istisnası yok. Hafta sonları otomatik olarak 0 saat kabul edilir.</div>';
    }
    function cell(metric, value, blankWhenZero) {
      const [key, , type] = metric;
      return `<td>${key === 'fark' ? differenceCell(value, blankWhenZero) : displayMetric(value, type, blankWhenZero)}</td>`;
    }
    function renderMatrix(rows, months, totals) {
      const baseHeader = `
        <th class="group base sticky col-sicil" rowspan="2">Sicil</th>
        <th class="group base sticky col-name" rowspan="2">Ad Soyad</th>
        <th class="group base sticky col-department" rowspan="2">Departman</th>
        <th class="group base sticky col-position" rowspan="2">Pozisyon</th>`;
      const groupHeader = `<th class="group" colspan="${METRICS.length}">Genel Toplam</th>` + months.map(month => `<th class="group" colspan="${METRICS.length}">${esc(monthLabel(month))}</th>`).join('');
      const metricHeader = METRICS.map(([, label]) => `<th class="metric">${label}</th>`).join('');
      const headers = `<thead><tr>${baseHeader}${groupHeader}</tr><tr>${metricHeader}${months.map(() => metricHeader).join('')}</tr></thead>`;
      const body = rows.map(record => {
        const total = metricsFor(record, months);
        const fiiliTitle = record.is_in_fiili ? 'Fiili listede mevcut' : 'Fiili listede bulunmuyor';
        const identity = `<td class="cell-text sticky col-sicil" title="${fiiliTitle}">${esc(record.sicil)}</td><td class="cell-text sticky col-name" title="${esc(record.name)}">${esc(record.name)}</td><td class="cell-text sticky col-department" title="Kaynak: ${esc(record.source_department)}">${esc(mappedDepartment(record))}</td><td class="cell-text sticky col-position" title="${esc(record.position)}">${esc(record.position)}</td>`;
        const allValues = METRICS.map(metric => cell(metric, total[metric[0]], false)).join('');
        const monthsValues = months.map(month => METRICS.map(metric => cell(metric, metricValue(record, month, metric[0]), true)).join('')).join('');
        return `<tr class="${record.is_in_fiili ? '' : 'not-fiili'}">${identity}${allValues}${monthsValues}</tr>`;
      }).join('') || `<tr><td colspan="${4 + METRICS.length * (months.length + 1)}" class="cell-text">Filtreye uygun kayıt bulunamadı.</td></tr>`;
      const footMetrics = METRICS.map(metric => cell(metric, totals[metric[0]], false)).join('');
      const footMonths = months.map(month => METRICS.map(metric => cell(metric, currentSummary.monthly[month][metric[0]], false)).join('')).join('');
      const footer = `<tfoot><tr><td colspan="4" class="cell-text">Filtrelenmiş Toplam</td>${footMetrics}${footMonths}</tr></tfoot>`;
      $('matrixTable').innerHTML = `${headers}<tbody>${body}</tbody>${footer}`;
      requestAnimationFrame(syncScrollWidth);
    }
    let currentRows = [];
    let currentMonths = [];
    let currentSummary = { total: {}, monthly: {} };
    function syncScrollWidth() { $('matrixScrollSpacer').style.width = `${$('matrixTable').scrollWidth}px`; }
    function render() {
      const months = activeMonths();
      const rows = filteredRows();
      const totals = summary(rows, months);
      currentRows = rows;
      currentMonths = months;
      currentSummary = totals;
      updateKpis(rows, totals.total);
      renderMonthChart(months, totals.monthly);
      renderCalendar();
      renderMatrix(rows, months, totals.total);
      const departmentLabel = state.department || 'Tüm departmanlar';
      const yearLabel = state.year || 'Tüm yıllar';
      $('matrixDescription').textContent = `${departmentLabel} · ${yearLabel} · ay grupları soldan sağa en güncel dönemden geçmişe sıralıdır.`;
      $('matrixMeta').textContent = `${num(rows.length)} satır · ${num(new Set(rows.map(row => row.sicil)).size)} çalışan`;
    }
    function csvValue(value) {
      const text = String(value == null ? '' : value);
      return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }
    function exportCsv() {
      const headers = ['Sicil', 'Ad Soyad', 'Departman', 'Kaynak Departman', 'Pozisyon', 'Fiili Listede'];
      const columns = [
        ...METRICS.map(([, label]) => `Genel Toplam - ${label}`),
        ...currentMonths.flatMap(month => METRICS.map(([, label]) => `${monthLabel(month)} - ${label}`)),
      ];
      const dataRows = currentRows.map(record => {
        const total = metricsFor(record, currentMonths);
        return [
          record.sicil, record.name, mappedDepartment(record), record.source_department, record.position, record.is_in_fiili ? 'Evet' : 'Hayır',
          ...METRICS.map(([key, , type]) => type === 'hour' ? hour(total[key]) : num(total[key])),
          ...currentMonths.flatMap(month => METRICS.map(([key, , type]) => {
            const value = metricValue(record, month, key);
            return type === 'hour' ? hour(value) : num(value);
          })),
        ];
      });
      const csv = [headers.concat(columns), ...dataRows].map(row => row.map(csvValue).join(';')).join('\r\n');
      const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      const scope = state.department ? state.department.replace(/[^\wğüşöçıİĞÜŞÖÇ-]+/gi, '_') : 'tum_departmanlar';
      link.href = url;
      link.download = `pdks_${scope}_${state.year || 'tum_yillar'}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }

    function xmlEscape(value) {
      return String(value == null ? '' : value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;' }[char]));
    }
    function safeFilePart(value, fallback = 'tum_departmanlar') {
      const ascii = String(value || fallback)
        .replace(/[ıİğĞüÜşŞöÖçÇ]/g, char => ({ 'ı': 'i', 'İ': 'I', 'ğ': 'g', 'Ğ': 'G', 'ü': 'u', 'Ü': 'U', 'ş': 's', 'Ş': 'S', 'ö': 'o', 'Ö': 'O', 'ç': 'c', 'Ç': 'C' }[char]))
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '');
      return ascii || fallback;
    }
    function xlsxColumnName(index) {
      let value = Number(index), out = '';
      while (value > 0) { value -= 1; out = String.fromCharCode(65 + (value % 26)) + out; value = Math.floor(value / 26); }
      return out;
    }
    function xlsxCellRef(row, column) { return `${xlsxColumnName(column)}${row}`; }
    function xlsxTextCell(row, column, value, style) {
      return `<c r="${xlsxCellRef(row, column)}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
    }
    function xlsxNumberCell(row, column, value, style, blankWhenZero = false) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || (blankWhenZero && Math.abs(parsed) < 1e-12)) return `<c r="${xlsxCellRef(row, column)}" s="${style}"/>`;
      return `<c r="${xlsxCellRef(row, column)}" s="${style}"><v>${parsed}</v></c>`;
    }
    function xlsxMetricStyle(value, metric, rowIndex, inactive = false) {
      const [key, , type] = metric, parsed = Number(value || 0);
      if (inactive) return type === 'hour' ? 14 : 11;
      if (key === 'fark' && parsed > 0) return 15;
      if (key === 'fark' && parsed < 0) return 16;
      if (type === 'hour') return rowIndex % 2 ? 13 : 12;
      return rowIndex % 2 ? 10 : 9;
    }
    function xlsxStylesXml() {
      const solidFill = color => `<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`;
      const thin = '<border><left style="thin"><color rgb="FFD9E2EC"/></left><right style="thin"><color rgb="FFD9E2EC"/></right><top style="thin"><color rgb="FFD9E2EC"/></top><bottom style="thin"><color rgb="FFD9E2EC"/></bottom><diagonal/></border>';
      return `<xml version="1.0" encoding="UTF-8" standalone="yes">
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2"><numFmt numFmtId="164" formatCode="0.0"/><numFmt numFmtId="165" formatCode="+0.0;-0.0;0.0"/></numFmts>
  <fonts count="9">
    <font><sz val="10"/><color rgb="FF0F172A"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
    <font><sz val="10"/><color rgb="FFDBEAFE"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FF0F172A"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FF1E3A8A"/><name val="Calibri"/><family val="2"/></font>
    <font><sz val="10"/><color rgb="FF7B8798"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FF047857"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FFBE123C"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="11"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${solidFill('0F172A')}${solidFill('1E3A8A')}${solidFill('E2E8F0')}${solidFill('DBEAFE')}${solidFill('EDF2F7')}${solidFill('F8FAFC')}${solidFill('ECFDF5')}${solidFill('FFF1F2')}${solidFill('1E3A8A')}</fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>${thin}</borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="20">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="5" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="5" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="7" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="5" fillId="7" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="165" fontId="6" fillId="8" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="165" fontId="7" fillId="9" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="8" fillId="10" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="8" fillId="10" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="8" fillId="10" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
    }
    function buildXlsxSheetXml() {
      const identityCount = 4, columnCount = identityCount + METRICS.length * (currentMonths.length + 1), lastColumn = xlsxColumnName(columnCount);
      const footerRowNumber = currentRows.length + 5, rows = [], merges = [`A1:${lastColumn}1`, `A2:${lastColumn}2`, 'A3:A4', 'B3:B4', 'C3:C4', 'D3:D4'];
      rows.push(`<row r="1" ht="32" customHeight="1">${xlsxTextCell(1, 1, 'Departman PDKS Matrisi', 1)}</row>`);
      const departmentLabel = state.department || 'Tüm departmanlar', yearLabel = state.year || 'Tüm yıllar';
      const fiiliLabel = state.hideInactive ? 'Yalnızca fiili listede bulunan çalışanlar' : 'Fiili liste filtresi uygulanmadı';
      const queryLabel = state.query.trim() ? ` · Arama: ${state.query.trim()}` : '';
      const meta = `${departmentLabel} · ${yearLabel} · ${fiiliLabel}${queryLabel} · ${currentRows.length} kayıt · Kaynak: ${DATA.source} · Üretim: ${DATA.generated_at}`;
      rows.push(`<row r="2" ht="30" customHeight="1">${xlsxTextCell(2, 1, meta, 2)}</row>`);
      let groupCells = ['Sicil', 'Ad Soyad', 'Departman', 'Pozisyon'].map((label, i) => xlsxTextCell(3, i + 1, label, 3)).join('');
      let groupColumn = identityCount + 1;
      [['Genel Toplam', null], ...currentMonths.map(month => [monthLabel(month), month])].forEach(([label]) => {
        groupCells += xlsxTextCell(3, groupColumn, label, 4);
        merges.push(`${xlsxCellRef(3, groupColumn)}:${xlsxCellRef(3, groupColumn + METRICS.length - 1)}`);
        groupColumn += METRICS.length;
      });
      rows.push(`<row r="3" ht="30" customHeight="1">${groupCells}</row>`);
      let metricCells = '', metricColumn = identityCount + 1;
      for (let block = 0; block < currentMonths.length + 1; block += 1) METRICS.forEach(([, label]) => { metricCells += xlsxTextCell(4, metricColumn++, label, 5); });
      rows.push(`<row r="4" ht="40" customHeight="1">${metricCells}</row>`);
      currentRows.forEach((record, rowIndex) => {
        const rowNumber = rowIndex + 5, inactive = !record.is_in_fiili, textStyle = inactive ? 8 : (rowIndex % 2 ? 7 : 6), total = metricsFor(record, currentMonths);
        let cells = [record.sicil, record.name, mappedDepartment(record), record.position].map((value, index) => xlsxTextCell(rowNumber, index + 1, value, textStyle)).join('');
        let column = identityCount + 1;
        METRICS.forEach(metric => { cells += xlsxNumberCell(rowNumber, column++, total[metric[0]], xlsxMetricStyle(total[metric[0]], metric, rowIndex, inactive)); });
        currentMonths.forEach(month => METRICS.forEach(metric => { const value = metricValue(record, month, metric[0]); cells += xlsxNumberCell(rowNumber, column++, value, xlsxMetricStyle(value, metric, rowIndex, inactive), true); }));
        rows.push(`<row r="${rowNumber}">${cells}</row>`);
      });
      let footerCells = xlsxTextCell(footerRowNumber, 1, 'Filtrelenmiş Toplam', 17), footerColumn = identityCount + 1;
      merges.push(`A${footerRowNumber}:D${footerRowNumber}`);
      METRICS.forEach(([key, , type]) => { footerCells += xlsxNumberCell(footerRowNumber, footerColumn++, currentSummary.total[key] || 0, type === 'hour' ? 19 : 18); });
      currentMonths.forEach(month => METRICS.forEach(([key, , type]) => { footerCells += xlsxNumberCell(footerRowNumber, footerColumn++, ((currentSummary.monthly || {})[month] || {})[key] || 0, type === 'hour' ? 19 : 18); }));
      rows.push(`<row r="${footerRowNumber}" ht="24" customHeight="1">${footerCells}</row>`);
      const columns = [12, 28, 30, 30].map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('') + `<col min="5" max="${columnCount}" width="12" customWidth="1"/>`;
      return `<xml version="1.0" encoding="UTF-8" standalone="yes">
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastColumn}${footerRowNumber}"/><sheetViews><sheetView workbookViewId="0"><pane xSplit="4" ySplit="4" topLeftCell="E5" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${columns}</cols><sheetData>${rows.join('')}</sheetData><mergeCells count="${merges.length}">${merges.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
    }
    function crc32(bytes) {
      if (!crc32.table) { crc32.table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); return c >>> 0; }); }
      let crc = 0xFFFFFFFF; for (const byte of bytes) crc = crc32.table[(crc ^ byte) & 0xFF] ^ (crc >>> 8); return (crc ^ 0xFFFFFFFF) >>> 0;
    }
    function zipDosDateTime(date = new Date()) {
      const year = Math.max(1980, date.getFullYear());
      return { time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2), date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate() };
    }
    function storedZipBlob(files) {
      const encoder = new TextEncoder(), localParts = [], centralParts = [], stamp = zipDosDateTime(); let offset = 0;
      Object.entries(files).forEach(([name, content]) => {
        const nameBytes = encoder.encode(name), data = content instanceof Uint8Array ? content : encoder.encode(content), checksum = crc32(data);
        const local = new Uint8Array(30 + nameBytes.length + data.length), lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034B50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true); lv.setUint16(10, stamp.time, true); lv.setUint16(12, stamp.date, true); lv.setUint32(14, checksum, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, nameBytes.length, true); lv.setUint16(28, 0, true); local.set(nameBytes, 30); local.set(data, 30 + nameBytes.length); localParts.push(local);
        const central = new Uint8Array(46 + nameBytes.length), cv = new DataView(central.buffer);
        cv.setUint32(0, 0x02014B50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true); cv.setUint16(12, stamp.time, true); cv.setUint16(14, stamp.date, true); cv.setUint32(16, checksum, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, nameBytes.length, true); cv.setUint16(30, 0, true); cv.setUint16(32, 0, true); cv.setUint16(34, 0, true); cv.setUint16(36, 0, true); cv.setUint32(38, 0, true); cv.setUint32(42, offset, true); central.set(nameBytes, 46); centralParts.push(central); offset += local.length;
      });
      const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
      ev.setUint32(0, 0x06054B50, true); ev.setUint16(4, 0, true); ev.setUint16(6, 0, true); ev.setUint16(8, centralParts.length, true); ev.setUint16(10, centralParts.length, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true); ev.setUint16(20, 0, true);
      return new Blob([...localParts, ...centralParts, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }
    function buildStyledXlsxBlob() {
      const created = new Date().toISOString();
      return storedZipBlob({
        '[Content_Types].xml': `<xml version="1.0" encoding="UTF-8" standalone="yes"><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
        '_rels/.rels': `<xml version="1.0" encoding="UTF-8" standalone="yes"><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
        'docProps/core.xml': `<xml version="1.0" encoding="UTF-8" standalone="yes"><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>Aizanoi Full Pack</dc:creator><dc:title>Departman PDKS Matrisi</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created></cp:coreProperties>`,
        'docProps/app.xml': `<xml version="1.0" encoding="UTF-8" standalone="yes"><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Aizanoi Full Pack</Application></Properties>`,
        'xl/workbook.xml': `<xml version="1.0" encoding="UTF-8" standalone="yes"><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="PDKS Matrisi" sheetId="1" r:id="rId1"/></sheets></workbook>`,
        'xl/_rels/workbook.xml.rels': `<xml version="1.0" encoding="UTF-8" standalone="yes"><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
        'xl/styles.xml': xlsxStylesXml(),
        'xl/worksheets/sheet1.xml': buildXlsxSheetXml(),
      });
    }
    async function exportStyledExcel() {
      const button = $('excelDownloadButton');
      const originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = 'Excel hazırlanıyor...';
      await new Promise(resolve => requestAnimationFrame(resolve));
      try {
        const url = URL.createObjectURL(buildStyledXlsxBlob());
        const link = document.createElement('a');
        link.href = url;
        link.download = `PDKS_Departman_Matrisi_${safeFilePart(state.department)}_${safeFilePart(state.year || 'tum_yillar', 'tum_yillar')}.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Temalı Excel dışa aktarımı başarısız:', error);
        alert('Temalı Excel dosyası hazırlanamadı. Lütfen tekrar deneyin.');
      } finally {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    }

    function setYearOptions(selectId, value, allLabel = 'Tüm yıllar') {
      const select = $(selectId);
      if (!select) return;
      select.innerHTML = `<option value="">${esc(allLabel)}</option>${DATA.years.map(year => `<option value="${year}" ${String(year) === String(value || '') ? 'selected' : ''}>${year}</option>`).join('')}`;
    }
    function departmentOptionsHtml(selected, allLabel = 'Tüm departmanlar') {
      const values = [...new Set(DATA.records.map(mappedDepartment).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
      return `<option value="">${esc(allLabel)}</option>${values.map(department => `<option value="${esc(department)}" ${department === selected ? 'selected' : ''}>${esc(department)}</option>`).join('')}`;
    }
    function renderWorkdaySettings() {
      if (!$('workdayStartInput')) return;
      const workday = settings.workday || DATA.default_workday || { start: '08:00', end: '17:45', hours: 9.75 };
      $('workdayStartInput').value = workday.start || '08:00';
      $('workdayEndInput').value = workday.end || '17:45';
      $('workdayHoursInput').value = Number(workday.hours != null ? workday.hours : hoursBetween(workday.start, workday.end)).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
    }
    function saveWorkdaySettings() {
      const start = $('workdayStartInput').value || '08:00';
      const end = $('workdayEndInput').value || '17:45';
      const hours = Number($('workdayHoursInput').value);
      if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
        $('settingsStatus').textContent = 'Genel çalışma saati için 0-24 arasında geçerli bir saat değeri girin.';
        return;
      }
      settings.workday = { start, end, hours };
      applySettingsChange(`Genel çalışma saati ${start}-${end} / ${hour(hours)} saat olarak güncellendi.`, true);
    }
    function updateWorkdayHoursFromTimes() {
      if (!$('workdayHoursInput')) return;
      const calculated = hoursBetween($('workdayStartInput').value, $('workdayEndInput').value);
      $('workdayHoursInput').value = Number(calculated).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
    }
    function personBaseRows() {
      const query = state.personQuery.trim().toLocaleLowerCase('tr-TR');
      return DATA.records.filter(record => {
        if (state.personHideInactive && !record.is_in_fiili) return false;
        if (state.personHideHidden && isHiddenRecord(record)) return false;
        if (!query) return true;
        const department = mappedDepartment(record);
        return `${record.sicil} ${record.name} ${record.position} ${record.fiili_unvan || ''} ${department}`.toLocaleLowerCase('tr-TR').includes(query);
      }).sort((a, b) => a.name.localeCompare(b.name, 'tr') || a.sicil.localeCompare(b.sicil, 'tr'));
    }
    function renderPersonOptions() {
      if (!$('personDetailSelect')) return;
      const baseRows = personBaseRows();
      let rows = baseRows.slice(0, 350);
      if (state.personSicil && !rows.some(row => row.sicil === state.personSicil)) {
        const selected = DATA.records.find(record => record.sicil === state.personSicil);
        if (selected) rows = [selected, ...rows.filter(row => row.sicil !== state.personSicil).slice(0, 349)];
      }
      if (state.personSicil && !rows.some(row => row.sicil === state.personSicil)) state.personSicil = '';
      if (!state.personSicil && rows.length) state.personSicil = rows[0].sicil;
      $('personDetailSelect').innerHTML = rows.length ? rows.map(record => `<option value="${esc(record.sicil)}" ${record.sicil === state.personSicil ? 'selected' : ''}>${esc(record.name || 'İsimsiz')} · ${esc(record.sicil)} · ${esc(mappedDepartment(record))}</option>`).join('') : '<option value="">Kişi bulunamadı</option>';
    }
    function selectedPersonRecord() { return DATA.records.find(record => record.sicil === state.personSicil) || null; }
    function personMonths(record) {
      const source = state.personYear ? DATA.months.filter(month => month.startsWith(`${state.personYear}-`)) : DATA.months;
      return [...source].filter(month => (record.months || {})[month]).sort(monthSort).reverse();
    }
    function renderPersonMonthChart(record, months) {
      if (!$('personMonthChart')) return;
      if (!record || !months.length) { $('personMonthChart').innerHTML = '<div class="calendar-empty">Seçili kişi için ay verisi bulunamadı.</div>'; return; }
      const monthly = Object.fromEntries(months.map(month => [month, record.months[month]]));
      const values = months.map(month => Math.max(monthly[month].calistigi_saat || 0, monthly[month].gereken_saat || 0));
      const maxValue = Math.max(...values, 1);
      $('personMonthChart').style.setProperty('--months', Math.max(months.length, 1));
      $('personMonthChart').innerHTML = months.slice().reverse().map(month => {
        const item = monthly[month];
        const actualHeight = Math.max(3, (Number(item.calistigi_saat || 0) / maxValue) * 100);
        const expectedHeight = Math.max(3, (Number(item.gereken_saat || 0) / maxValue) * 100);
        const diff = Number(item.fark || 0);
        return `<div class="month-card"><div class="month-bars"><div class="bar actual" style="height:${actualHeight}%"></div><div class="bar expected" style="height:${expectedHeight}%"></div></div><div class="month-label">${esc(monthLabel(month))}</div><div class="month-diff ${diff >= 0 ? 'positive' : 'negative'}">${diff >= 0 ? '+' : ''}${hour(diff)} sa.</div></div>`;
      }).join('');
    }
    function resetPersonDayTableState() {
      state.personDayFilters = {};
      state.selectedPersonDayKey = '';
      closePersonDayFilterMenus();
    }
    function personDayKey(item) {
      return `${item.dateText}|${item.firstEntry == null ? '' : item.firstEntry}|${item.lastExit == null ? '' : item.lastExit}`;
    }
    function personDayColumnDefs() {
      return [
        { key: 'date', label: 'Tarih', cls: 'cell-text', value: item => `${item.dateText}${item.ignored ? ' · Yok sayıldı' : ''}`, html: item => `${esc(item.dateText)}${item.ignored ? ' · Yok sayıldı' : ''}` },
        { key: 'month', label: 'Ay', cls: 'cell-text', value: item => item.monthName, html: item => esc(item.monthName) },
        { key: 'count', label: 'Kayıt', value: item => num(item.count), html: item => num(item.count) },
        { key: 'firstEntry', label: 'İlk Giriş', value: item => item.firstEntry == null ? '—' : hourToText(item.firstEntry), html: item => esc(item.firstEntry == null ? '—' : hourToText(item.firstEntry)) },
        { key: 'lastExit', label: 'Son Çıkış', value: item => item.lastExit == null ? '—' : hourToText(item.lastExit), html: item => esc(item.lastExit == null ? '—' : hourToText(item.lastExit)) },
        { key: 'actual', label: 'Çalıştığı Saat', value: item => hour(item.actual), html: item => hour(item.actual) },
        { key: 'expected', label: 'Gereken Saat', value: item => hour(item.expected), html: item => hour(item.expected) },
        { key: 'diff', label: 'Fark', value: item => `${item.diff >= 0 ? '+' : ''}${hour(item.diff)}`, html: item => differenceCell(item.diff) },
        { key: 'evden', label: 'Evden', value: item => num(item.evden), html: item => num(item.evden) },
        { key: 'harici', label: 'Harici Evden', value: item => num(item.harici), html: item => num(item.harici) },
        { key: 'status', label: 'Durum', cls: 'cell-text', value: item => item.ignored ? 'Yok sayıldı' : (item.diff < -0.001 ? 'Eksik süre' : (item.diff > 0.001 ? 'Pozitif denge' : 'Dengede')), html: item => esc(item.ignored ? 'Yok sayıldı' : (item.diff < -0.001 ? 'Eksik süre' : (item.diff > 0.001 ? 'Pozitif denge' : 'Dengede'))) },
      ];
    }
    function personDayColumnValue(item, column) {
      return trackingFilterText(column.value ? column.value(item) : item[column.key]);
    }
    function personDayFilterValues(rows, column) {
      return [...new Set(rows.map(item => personDayColumnValue(item, column)).filter(value => value !== '-'))]
        .sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }));
    }
    function applyPersonDayFilters(rows, columns) {
      const filters = state.personDayFilters || {};
      const activeEntries = Object.entries(filters).filter(([, values]) => Array.isArray(values) && values.length);
      if (!activeEntries.length) return rows;
      return rows.filter(item => activeEntries.every(([key, values]) => {
        const column = columns.find(col => col.key === key);
        return !column || values.includes(personDayColumnValue(item, column));
      }));
    }
    function renderPersonDayHeader(columns, rows) {
      const filters = state.personDayFilters || {};
      return `<thead><tr>${columns.map(column => {
        const values = personDayFilterValues(rows, column);
        const selected = Array.isArray(filters[column.key]) ? filters[column.key] : [];
        const summary = selected.length ? `${selected.length} seçili` : 'Tümü';
        const options = values.map(value => `<label class="tracking-filter-option"><input type="checkbox" value="${esc(value)}" ${!selected.length || selected.includes(value) ? 'checked' : ''}>${esc(value)}</label>`).join('') || '<div class="tracking-filter-empty" style="display:block">Seçenek yok</div>';
        return `<th class="tracking-filter-cell"><span class="tracking-filter-label">${esc(column.label)}</span><button type="button" class="tracking-filter-button${selected.length ? ' active' : ''}" data-person-day-filter-open data-column-key="${esc(column.key)}"><span>${esc(summary)}</span></button><div class="tracking-filter-menu" data-person-day-filter-menu data-column-key="${esc(column.key)}"><div class="tracking-filter-menu-title">${esc(column.label)} filtresi</div><input class="tracking-filter-search" type="search" placeholder="Ara, Enter ile görünenleri seç..." data-person-day-filter-search><div class="tracking-filter-actions"><button type="button" data-person-day-filter-all>Görünenleri Seç</button><button type="button" data-person-day-filter-none>Temizle</button></div><div class="tracking-filter-list">${options}</div><div class="tracking-filter-empty" data-person-day-filter-empty>Sonuç yok</div><div class="tracking-filter-footer"><span class="tracking-filter-count">${num(values.length)} seçenek</span><button type="button" data-person-day-filter-cancel>Vazgeç</button><button type="button" data-person-day-filter-apply>Uygula</button></div></div></th>`;
      }).join('')}</tr></thead>`;
    }
    function closePersonDayFilterMenus(except = null) {
      document.querySelectorAll('[data-person-day-filter-menu].open').forEach(menu => { if (menu !== except) menu.classList.remove('open'); });
    }
    function bindPersonDayFilterMenus() {
      const table = $('personDayTable');
      if (!table) return;
      table.querySelectorAll('[data-person-day-filter-open]').forEach(button => button.addEventListener('click', event => {
        event.stopPropagation();
        const menu = button.parentElement.querySelector('[data-person-day-filter-menu]');
        if (!menu) return;
        const open = !menu.classList.contains('open');
        closePersonDayFilterMenus(menu);
        menu.classList.toggle('open', open);
        if (open) {
          positionTrackingFilterMenu(menu, button);
          const search = menu.querySelector('[data-person-day-filter-search]');
          if (search) { search.value = ''; search.focus(); }
        }
      }));
      table.querySelectorAll('[data-person-day-filter-search]').forEach(input => input.addEventListener('input', event => {
        const menu = event.target.closest('[data-person-day-filter-menu]');
        const query = trackingFilterNorm(event.target.value);
        let visible = 0;
        menu.querySelectorAll('.tracking-filter-option').forEach(label => {
          const show = trackingFilterNorm(label.textContent).includes(query);
          label.style.display = show ? 'flex' : 'none';
          if (show) visible += 1;
        });
        const empty = menu.querySelector('[data-person-day-filter-empty]');
        if (empty) empty.style.display = visible ? 'none' : 'block';
      }));
      table.querySelectorAll('[data-person-day-filter-search]').forEach(input => input.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        event.target.closest('[data-person-day-filter-menu]').querySelectorAll('.tracking-filter-option').forEach(label => {
          if (label.style.display !== 'none') label.querySelector('input').checked = true;
        });
      }));
      table.querySelectorAll('[data-person-day-filter-all]').forEach(button => button.addEventListener('click', event => {
        event.stopPropagation();
        button.closest('[data-person-day-filter-menu]').querySelectorAll('.tracking-filter-option').forEach(label => {
          if (label.style.display !== 'none') label.querySelector('input').checked = true;
        });
      }));
      table.querySelectorAll('[data-person-day-filter-none]').forEach(button => button.addEventListener('click', event => {
        event.stopPropagation();
        button.closest('[data-person-day-filter-menu]').querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = false; });
      }));
      table.querySelectorAll('[data-person-day-filter-cancel]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); closePersonDayFilterMenus(); }));
      table.querySelectorAll('[data-person-day-filter-apply]').forEach(button => button.addEventListener('click', event => {
        event.stopPropagation();
        const menu = button.closest('[data-person-day-filter-menu]');
        const key = menu.dataset.columnKey;
        const allOptions = [...menu.querySelectorAll('input[type="checkbox"]')].map(input => input.value);
        const selected = [...menu.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
        if (!state.personDayFilters || typeof state.personDayFilters !== 'object') state.personDayFilters = {};
        if (selected.length && selected.length < allOptions.length) state.personDayFilters[key] = selected;
        else delete state.personDayFilters[key];
        closePersonDayFilterMenus();
        renderPersonDetail();
      }));
      table.querySelectorAll('tbody tr[data-person-day-key]').forEach(row => row.addEventListener('click', () => {
        const key = row.dataset.personDayKey || '';
        state.selectedPersonDayKey = state.selectedPersonDayKey === key ? '' : key;
        table.querySelectorAll('tbody tr[data-person-day-key]').forEach(item => item.classList.toggle('row-selected', item.dataset.personDayKey === state.selectedPersonDayKey));
      }));
      if (!window.__pdksPersonDayFilterBound) {
        window.__pdksPersonDayFilterBound = true;
        document.addEventListener('click', event => {
          if (!event.target.closest('[data-person-day-filter-menu]') && !event.target.closest('[data-person-day-filter-open]')) closePersonDayFilterMenus();
        });
        document.addEventListener('keydown', event => { if (event.key === 'Escape') closePersonDayFilterMenus(); });
        window.addEventListener('resize', () => closePersonDayFilterMenus());
      }
    }
    function renderPersonDetail() {
      if (!$('personProfileCard')) return;
      const record = selectedPersonRecord();
      const months = record ? personMonths(record) : [];
      const total = record ? metricsFor(record, months) : Object.fromEntries(METRICS.map(([key]) => [key, 0]));
      const cards = record ? [
        ['Geldiği Gün', num(total.geldigi_gun), 'Seçili kişi / dönem'],
        ['Evden Gün', num(total.toplam_evden_gun), `${num(total.evden_gun)} evden + ${num(total.harici_evden_gun)} harici`],
        ['Çalıştığı Saat', hour(total.calistigi_saat), 'Toplam brüt süre'],
        ['Gereken Saat', hour(total.gereken_saat), 'Takvim ve standart saat sonrası'],
        ['Saat Farkı', `${total.fark >= 0 ? '+' : ''}${hour(total.fark)}`, total.fark >= 0 ? 'Pozitif denge' : 'Eksik süre', total.fark >= 0 ? 'positive' : 'negative'],
        ['Ay Sayısı', num(months.length), state.personYear || 'Tüm yıllar'],
      ] : [['Kişi', '—', 'Kayıt bulunamadı']];
      $('personKpiGrid').innerHTML = cards.map(([label, value, hint, tone = '']) => `<article class="kpi ${tone}"><div class="label">${label}</div><div class="value">${value}</div><span class="hint">${hint}</span></article>`).join('');
      if (!record) {
        $('personProfileCard').innerHTML = '<div class="calendar-empty">Arama kriterine uygun kişi bulunamadı.</div>';
        $('personDayTable').innerHTML = '';
        if ($('personDayTableTools')) $('personDayTableTools').innerHTML = '';
        renderPersonMonthChart(null, []);
        return;
      }
      const hiddenReason = autoHiddenRecord(record) ? (record.auto_hidden_reason || autoHiddenMap()[record.sicil].reason || 'Otomatik dışlama') : (hiddenPeople()[record.sicil] ? 'Kullanıcı tarafından gizlendi' : 'Gizli değil');
      $('personDetailMeta').textContent = `${record.name || record.sicil} · ${mappedDepartment(record)} · ${months.length ? `${monthLabel(months[months.length - 1])} - ${monthLabel(months[0])}` : 'ay verisi yok'}`;
      $('personProfileCard').innerHTML = `<div class="profile-card"><div class="profile-title"><strong>${esc(record.name || 'İsimsiz')}</strong><span>${esc(record.sicil)} · ${esc(record.position || 'Pozisyon yok')}</span></div><div class="profile-grid">
        <div class="profile-row"><b>Departman</b><span>${esc(mappedDepartment(record))}</span></div>
        <div class="profile-row"><b>Kaynak Departman</b><span>${esc(record.source_department || '')}</span></div>
        <div class="profile-row"><b>Fiili Unvan</b><span>${esc(record.fiili_unvan || '—')}</span></div>
        <div class="profile-row"><b>Fiili Liste</b><span>${record.is_in_fiili ? 'Evet' : 'Hayır'}</span></div>
        <div class="profile-row"><b>Gizleme Durumu</b><span>${esc(hiddenReason)}</span></div>
        <div class="profile-row"><b>Kayıt Ayı</b><span>${num(Object.keys(record.months || {}).length)}</span></div>
      </div></div>`;
      renderPersonMonthChart(record, months);
      const calendar = effectiveCalendar();
      const allowedMonths = new Set(months);
      const dayRows = (record.days || []).filter(day => allowedMonths.has(String(day[0]).slice(0, 7))).sort((a, b) => String(b[0]).localeCompare(String(a[0])));
      const dayItems = dayRows.map(day => {
        const values = effectiveDayValues(day, calendar);
        const monthKey = String(values.dateText).slice(0, 7);
        return { ...values, monthKey, monthName: monthLabel(monthKey) };
      });
      const dayColumns = personDayColumnDefs();
      const displayedDayItems = applyPersonDayFilters(dayItems, dayColumns);
      const activeDayFilterCount = Object.values(state.personDayFilters || {}).filter(values => Array.isArray(values) && values.length).length;
      if ($('personDayTableTools')) {
        $('personDayTableTools').innerHTML = activeDayFilterCount
          ? `<span>${num(activeDayFilterCount)} günlük kayıt filtresi aktif · ${num(displayedDayItems.length)} kayıt gösteriliyor.</span><button type="button" id="clearPersonDayFilters">Günlük Filtreleri Temizle</button>`
          : `<span>Başlıklardaki Tümü düğmeleriyle günlük kayıtları Excel benzeri filtreleyebilirsiniz. Satıra tıklayınca satır vurgulanır.</span>`;
        const clearPersonDayButton = $('clearPersonDayFilters');
        if (clearPersonDayButton) clearPersonDayButton.addEventListener('click', () => { state.personDayFilters = {}; renderPersonDetail(); });
      }
      const header = renderPersonDayHeader(dayColumns, dayItems);
      const body = displayedDayItems.map(item => {
        const key = personDayKey(item);
        const rowClasses = [item.ignored ? 'ignored-day' : '', 'clickable-row', state.selectedPersonDayKey === key ? 'row-selected' : ''].filter(Boolean).join(' ');
        return `<tr class="${rowClasses}" data-person-day-key="${esc(key)}" title="Satırı vurgulamak için tıklayın">${dayColumns.map(column => `<td class="${column.cls || ''}">${column.html(item)}</td>`).join('')}</tr>`;
      }).join('') || `<tr><td colspan="${dayColumns.length}" class="cell-text">Seçili yıl ve tablo filtreleri için günlük kayıt bulunamadı.</td></tr>`;
      $('personDayTable').innerHTML = `${header}<tbody>${body}</tbody>`;
      bindPersonDayFilterMenus();
    }
    function trackingMonths() {
      const months = state.trackingYear ? DATA.months.filter(month => month.startsWith(`${state.trackingYear}-`)) : DATA.months;
      return [...months].sort(monthSort).reverse();
    }
    function trackingBaseRows() {
      const query = state.trackingQuery.trim().toLocaleLowerCase('tr-TR');
      return DATA.records.filter(record => {
        const department = mappedDepartment(record);
        if (state.trackingDepartment && department !== state.trackingDepartment) return false;
        if (state.trackingHideInactive && !record.is_in_fiili) return false;
        if (state.trackingHideHidden && isHiddenRecord(record)) return false;
        if (!query) return true;
        return `${record.sicil} ${record.name} ${record.position} ${record.fiili_unvan || ''} ${department}`.toLocaleLowerCase('tr-TR').includes(query);
      });
    }
    function maxConsecutiveNegativeMonths(record, months) {
      let current = 0, best = 0;
      [...months].sort(monthSort).forEach(month => {
        if (Number(((record.months || {})[month] || {}).fark || 0) < -1) {
          current += 1;
          best = Math.max(best, current);
        } else {
          current = 0;
        }
      });
      return best;
    }
    function weekKey(dateText) {
      const date = new Date(`${dateText}T12:00:00`);
      const first = new Date(date.getFullYear(), 0, 1);
      const dayIndex = Math.floor((date - first) / 86400000);
      return `${date.getFullYear()}-${Math.ceil((dayIndex + first.getDay() + 1) / 7)}`;
    }
    function rawTrackingMetrics(record, months) {
      const total = metricsFor(record, months);
      const monthSet = new Set(months);
      const calendar = effectiveCalendar();
      const days = (record.days || [])
        .filter(day => monthSet.has(String(day[0]).slice(0, 7)))
        .map(day => effectiveDayValues(day, calendar))
        .filter(day => !day.ignored);
      const startLimit = workdayStartHour() + 0.25;
      const endLimit = workdayEndHour() - 0.25;
      const workDays = days.filter(day => Number(day.count || 0) > 0);
      const officeDays = workDays.filter(day => Number(day.evden || 0) === 0 && Number(day.harici || 0) === 0);
      const lateDurations = officeDays
        .map(day => Math.max(0, Number(day.firstEntry) - startLimit))
        .filter(value => Number.isFinite(value) && value > 0);
      const earlyDurations = officeDays
        .map(day => Number(day.expected || 0) > 0 && Number.isFinite(Number(day.lastExit)) && Number(day.diff || 0) < -0.25 ? Math.max(0, endLimit - Number(day.lastExit)) : 0)
        .filter(value => Number.isFinite(value) && value > 0);
      const lateDays = lateDurations.length;
      const earlyExitDays = earlyDurations.length;
      const lateMinutes = lateDurations.reduce((sum, value) => sum + value * 60, 0);
      const earlyExitMinutes = earlyDurations.reduce((sum, value) => sum + value * 60, 0);
      const avgLateMinutes = lateDays ? lateMinutes / lateDays : 0;
      const avgEarlyExitMinutes = earlyExitDays ? earlyExitMinutes / earlyExitDays : 0;
      const maxLateMinutes = lateDurations.length ? Math.max(...lateDurations) * 60 : 0;
      const maxEarlyExitMinutes = earlyDurations.length ? Math.max(...earlyDurations) * 60 : 0;
      const dayCount = workDays.length;
      const denominatorDays = Math.max(dayCount, 1);
      const lateRatio = lateDays / denominatorDays;
      const earlyExitRatio = earlyExitDays / denominatorDays;
      const homeDays = Number(total.toplam_evden_gun || 0);
      const hariciHomeDays = Number(total.harici_evden_gun || 0);
      const homeRatio = homeDays / Math.max(Number(total.geldigi_gun || 0), 1);
      const hariciHomeRatio = hariciHomeDays / Math.max(Number(total.geldigi_gun || 0), 1);
      const homeWorkDays = workDays.filter(day => Number(day.evden || 0) + Number(day.harici || 0) > 0);
      const homeOutsideWednesdayDays = homeWorkDays.filter(day => new Date(`${day.dateText}T12:00:00`).getDay() !== 3).length;
      const weekBuckets = new Map();
      homeWorkDays.forEach(day => {
        const key = weekKey(day.dateText);
        weekBuckets.set(key, (weekBuckets.get(key) || 0) + 1);
      });
      const homeOverWeekDays = [...weekBuckets.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
      const homePolicyViolations = homeOutsideWednesdayDays + homeOverWeekDays;
      const homePolicyRatio = homePolicyViolations / denominatorDays;
      const negativeHours = Math.min(0, Number(total.fark || 0));
      const negativeAbs = Math.abs(negativeHours);
      const negativeMonths = months.filter(month => Number(((record.months || {})[month] || {}).fark || 0) < -1).length;
      const activeMonths = months.filter(month => (record.months || {})[month]).length;
      const negativeMonthRatio = negativeMonths / Math.max(activeMonths, 1);
      const consecutiveNegativeMonths = maxConsecutiveNegativeMonths(record, months);
      const sampleLabel = dayCount < 5 ? 'Düşük' : (dayCount < 15 ? 'Orta' : 'Yüksek');
      return {
        total, days, dayCount, lateDays, lateRatio, lateMinutes, avgLateMinutes, maxLateMinutes,
        earlyExitDays, earlyExitRatio, earlyExitMinutes, avgEarlyExitMinutes, maxEarlyExitMinutes,
        homeDays, homeRatio, hariciHomeDays, hariciHomeRatio, homeOutsideWednesdayDays,
        homeOverWeekDays, homePolicyViolations, homePolicyRatio, negativeHours,
        negativeAbs, negativeMonths, activeMonths, negativeMonthRatio,
        consecutiveNegativeMonths, sampleLabel,
      };
    }
    function departmentBenchmarks(rows, months) {
      const buckets = new Map();
      rows.forEach(record => {
        const department = mappedDepartment(record) || 'Belirsiz';
        const metrics = rawTrackingMetrics(record, months);
        if (!buckets.has(department)) buckets.set(department, { count: 0, negativeAbs: 0, lateRatio: 0, earlyExitRatio: 0, lateMinutes: 0, earlyExitMinutes: 0, homeRatio: 0, hariciHomeRatio: 0, homePolicyRatio: 0 });
        const bucket = buckets.get(department);
        bucket.count += 1;
        bucket.negativeAbs += metrics.negativeAbs;
        bucket.lateRatio += metrics.lateRatio;
        bucket.earlyExitRatio += metrics.earlyExitRatio;
        bucket.lateMinutes += metrics.lateMinutes;
        bucket.earlyExitMinutes += metrics.earlyExitMinutes;
        bucket.homeRatio += metrics.homeRatio;
        bucket.hariciHomeRatio += metrics.hariciHomeRatio;
        bucket.homePolicyRatio += metrics.homePolicyRatio;
      });
      const result = new Map();
      buckets.forEach((bucket, department) => {
        const count = Math.max(bucket.count, 1);
        result.set(department, {
          negativeAbs: bucket.negativeAbs / count,
          lateRatio: bucket.lateRatio / count,
          earlyExitRatio: bucket.earlyExitRatio / count,
          lateMinutes: bucket.lateMinutes / count,
          earlyExitMinutes: bucket.earlyExitMinutes / count,
          homeRatio: bucket.homeRatio / count,
          hariciHomeRatio: bucket.hariciHomeRatio / count,
          homePolicyRatio: bucket.homePolicyRatio / count,
          count,
        });
      });
      return result;
    }
    function clampScore(value, digits = 1) {
      const factor = 10 ** digits;
      return Math.max(0, Math.min(100, Math.round((Number(value) || 0) * factor) / factor));
    }
    function rampScore(value, warning, critical, extreme) {
      const v = Math.max(0, Number(value) || 0);
      if (v <= 0) return 0;
      if (v <= warning) return clampScore((v / Math.max(warning, 0.0001)) * 25, 1);
      if (v <= critical) return clampScore(25 + ((v - warning) / Math.max(critical - warning, 0.0001)) * 45, 1);
      if (v <= extreme) return clampScore(70 + ((v - critical) / Math.max(extreme - critical, 0.0001)) * 30, 1);
      return 100;
    }
    function weightedScore(parts) {
      const totalWeight = parts.reduce((sum, [, weight]) => sum + weight, 0) || 1;
      return clampScore(parts.reduce((sum, [value, weight]) => sum + value * weight, 0) / totalWeight, 1);
    }
    function signalPairs(scores) {
      return [
        ['Saat Açığı', scores.hourScore],
        ['Sürekli Geç Kalma', scores.lateScore],
        ['Erken Çıkış', scores.earlyScore],
        ['Home Kuralı Aşımı', scores.homePolicyScore],
        ['Harici Evden Çalışma', scores.offsiteScore],
        ['Süreklilik', scores.continuityScore],
        ['Departman Uyumsuzluğu', scores.deptScore],
      ].sort((a, b) => b[1] - a[1]);
    }
    function strongestSignal(scores) {
      const pairs = signalPairs(scores);
      if (pairs[0][1] >= 35 && pairs[1][1] >= pairs[0][1] - 10) return 'Karma Sinyal';
      return pairs[0][1] >= 20 ? pairs[0][0] : 'Normal';
    }
    function trackingLevelMatches(item, level) {
      if (level === 'all') return true;
      if (level === 'watch') return ['Alarm', 'Kritik', 'İzlemeli'].includes(item.severity);
      if (level === 'action') return ['Alarm', 'Kritik'].includes(item.severity);
      return item.severity === 'Alarm';
    }
    function actionForSignal(signal, item) {
      if (item.sampleLabel === 'Düşük') return 'Örneklem düşük; kişi detayından gün bazlı kayıt kontrol edilmeli.';
      if (signal === 'Saat Açığı') return 'Puantaj, izin ve özel gün kayıtları yöneticiyle birlikte kontrol edilmeli.';
      if (signal === 'Sürekli Geç Kalma') return 'Vardiya/mesai başlangıç düzeni ve düzenli geç giriş nedeni görüşülmeli.';
      if (signal === 'Erken Çıkış') return 'Son çıkış saatleri ve eksik süre yaratan günler kişi detayı üzerinden kontrol edilmeli.';
      if (signal === 'Home Kuralı Aşımı') return 'Home office kullanımının haftada 1 gün ve Çarşamba kuralıyla uyumu kontrol edilmeli.';
      if (signal === 'Harici Evden Çalışma') return 'Harici evden çalışma kayıtlarının onay ve açıklama gerekçesi kontrol edilmeli.';
      if (signal === 'Süreklilik') return 'Tek seferlik sapma değil; son aylar trendi ayrıca incelenmeli.';
      if (signal === 'Departman Uyumsuzluğu') return 'Kişi kendi departman ortalamasından belirgin ayrışıyor; departman içi kıyas yapılmalı.';
      if (signal === 'Karma Sinyal') return 'Birden fazla sinyal birlikte yükselmiş; kişi detay ekranından günlük kayıtlar incelenmeli.';
      return 'Normal izleme; aksiyon gerektiren güçlü sinyal yok.';
    }
    function trackingScore(record, months, benchmarks) {
      const base = rawTrackingMetrics(record, months);
      const department = mappedDepartment(record) || 'Belirsiz';
      const benchmark = benchmarks.get(department) || { negativeAbs: 0, lateRatio: 0, earlyExitRatio: 0, lateMinutes: 0, earlyExitMinutes: 0, homeRatio: 0, hariciHomeRatio: 0, homePolicyRatio: 0, count: 0 };
      const hourScore = weightedScore([
        [rampScore(base.negativeAbs, 8, 45, 160), 0.75],
        [rampScore(base.negativeMonths, 1, 3, 6), 0.25],
      ]);
      const lateScore = weightedScore([
        [rampScore(base.lateDays, 5, 35, 100), 0.40],
        [rampScore(base.lateRatio, 0.05, 0.30, 0.80), 0.25],
        [rampScore(base.lateMinutes, 60, 420, 1500), 0.25],
        [rampScore(base.avgLateMinutes, 20, 60, 180), 0.10],
      ]);
      const earlyScore = weightedScore([
        [rampScore(base.earlyExitDays, 4, 30, 90), 0.40],
        [rampScore(base.earlyExitRatio, 0.04, 0.25, 0.70), 0.25],
        [rampScore(base.earlyExitMinutes, 60, 420, 1500), 0.25],
        [rampScore(base.avgEarlyExitMinutes, 20, 60, 180), 0.10],
      ]);
      const homePolicyScore = weightedScore([
        [rampScore(base.homePolicyViolations, 2, 35, 140), 0.60],
        [rampScore(base.homePolicyRatio, 0.02, 0.25, 0.80), 0.25],
        [rampScore(base.homeOutsideWednesdayDays, 2, 30, 120), 0.15],
      ]);
      const offsiteScore = weightedScore([
        [rampScore(base.hariciHomeDays, 2, 30, 100), 0.70],
        [rampScore(base.hariciHomeRatio, 0.02, 0.20, 0.70), 0.30],
      ]);
      const continuityScore = weightedScore([
        [rampScore(base.negativeMonthRatio, 0.20, 0.75, 1.25), 0.55],
        [rampScore(base.consecutiveNegativeMonths, 2, 6, 12), 0.45],
      ]);
      const deptScore = weightedScore([
        [rampScore(Math.max(0, base.negativeAbs - benchmark.negativeAbs), 5, 35, 120), 0.25],
        [rampScore(Math.max(0, base.lateRatio - benchmark.lateRatio), 0.03, 0.20, 0.60), 0.12],
        [rampScore(Math.max(0, base.earlyExitRatio - benchmark.earlyExitRatio), 0.03, 0.18, 0.50), 0.12],
        [rampScore(Math.max(0, base.lateMinutes - benchmark.lateMinutes), 45, 300, 900), 0.06],
        [rampScore(Math.max(0, base.earlyExitMinutes - benchmark.earlyExitMinutes), 45, 300, 900), 0.06],
        [rampScore(Math.max(0, base.homeRatio - benchmark.homeRatio), 0.05, 0.25, 0.70), 0.14],
        [rampScore(Math.max(0, base.hariciHomeRatio - benchmark.hariciHomeRatio), 0.03, 0.20, 0.60), 0.13],
        [rampScore(Math.max(0, base.homePolicyRatio - benchmark.homePolicyRatio), 0.03, 0.20, 0.60), 0.12],
      ]);
      const scores = { hourScore, lateScore, earlyScore, homePolicyScore, offsiteScore, continuityScore, deptScore };
      let score = clampScore(hourScore * 0.22 + lateScore * 0.18 + earlyScore * 0.15 + homePolicyScore * 0.15 + offsiteScore * 0.10 + continuityScore * 0.10 + deptScore * 0.10, 1);
      const pairs = signalPairs(scores);
      const strongSignals = pairs.filter(([, value]) => value >= 65).length;
      const extremeSignals = pairs.filter(([, value]) => value >= 85).length;
      const enoughSample = base.dayCount >= 10;
      const rawExtreme =
        base.negativeHours <= -35 ||
        (base.consecutiveNegativeMonths >= 4 && base.negativeHours <= -15) ||
        (base.lateDays >= 10 && base.lateRatio >= 0.25) ||
        base.lateMinutes >= 480 ||
        (base.earlyExitDays >= 8 && base.earlyExitRatio >= 0.20) ||
        base.earlyExitMinutes >= 480 ||
        base.homePolicyViolations >= 6 ||
        base.hariciHomeDays >= 6;
      const rawCritical =
        base.negativeHours <= -20 ||
        base.consecutiveNegativeMonths >= 3 ||
        base.lateDays >= 8 ||
        base.earlyExitDays >= 6 ||
        base.homePolicyViolations >= 4 ||
        base.hariciHomeDays >= 4;
      const rawPressure = weightedScore([
        [rampScore(base.negativeAbs, 20, 70, 220), 0.24],
        [rampScore(base.lateDays, 8, 45, 130), 0.12],
        [rampScore(base.lateRatio, 0.10, 0.40, 0.85), 0.09],
        [rampScore(base.lateMinutes, 120, 720, 1800), 0.09],
        [rampScore(base.earlyExitDays, 6, 40, 110), 0.12],
        [rampScore(base.earlyExitRatio, 0.08, 0.32, 0.75), 0.09],
        [rampScore(base.earlyExitMinutes, 120, 720, 1800), 0.09],
        [rampScore(base.homePolicyViolations, 4, 45, 160), 0.10],
        [rampScore(base.hariciHomeDays, 4, 35, 110), 0.06],
      ]);
      if (rawCritical) score = clampScore(Math.max(score, 45 + rawPressure * 0.40), 1);
      if (base.dayCount < 5) score = Math.min(score, 55);
      const mainSignal = strongestSignal(scores);
      const isAlarm = enoughSample && (
        score >= 98 ||
        (score >= 95 && strongSignals >= 6 && extremeSignals >= 5) ||
        base.negativeHours <= -200 ||
        (base.lateDays >= 100 && base.lateRatio >= 0.85) ||
        (base.earlyExitDays >= 80 && base.earlyExitRatio >= 0.75)
      );
      const isCritical = !isAlarm && enoughSample && ((score >= 70 && strongSignals >= 1) || strongSignals >= 2 || rawCritical);
      const severity = isAlarm ? 'Alarm' : isCritical ? 'Kritik' : score >= 45 ? 'İzlemeli' : score >= 25 ? 'Kontrol' : 'Normal';
      const tone = isAlarm ? 'alarm' : isCritical ? 'critical' : score >= 45 ? 'watch' : score >= 25 ? 'control' : 'normal';
      const reasons = [];
      if (base.negativeHours < -0.5) reasons.push(`${hour(Math.abs(base.negativeHours))} saat negatif denge`);
      if (base.negativeMonths > 0) reasons.push(`${num(base.negativeMonths)} negatif ay / ${num(base.consecutiveNegativeMonths)} ardışık`);
      if (base.lateDays > 0) reasons.push(`${num(base.lateDays)} geç giriş günü · ${num(base.lateMinutes, 0)} dk toplam · ${num(base.avgLateMinutes, 1)} dk ortalama`);
      if (base.earlyExitDays > 0) reasons.push(`${num(base.earlyExitDays)} erken çıkış günü · ${num(base.earlyExitMinutes, 0)} dk toplam · ${num(base.avgEarlyExitMinutes, 1)} dk ortalama`);
      if (base.hariciHomeDays > 0) reasons.push(`${num(base.hariciHomeDays)} harici evden gün`);
      if (base.homeDays > 0) reasons.push(`${num(base.homeDays)} evden gün · %${num(base.homeRatio * 100, 1)}`);
      if (base.homeOutsideWednesdayDays > 0) reasons.push(`${num(base.homeOutsideWednesdayDays)} Çarşamba dışı home`);
      if (base.homeOverWeekDays > 0) reasons.push(`${num(base.homeOverWeekDays)} haftalık home aşımı`);
      if (deptScore >= 25) reasons.push(`Departman ortalamasından ayrışıyor (${num(benchmark.count)} kişi benchmark)`);
      if (strongSignals > 0) reasons.push(`${num(strongSignals)} güçlü sinyal`);
      if (extremeSignals > 0) reasons.push(`${num(extremeSignals)} uç sinyal`);
      if (state.ignoreWeekendWork || state.ignoreHolidayWork) reasons.push(`Yok sayma modu: ${state.ignoreWeekendWork ? 'hafta sonu' : ''}${state.ignoreWeekendWork && state.ignoreHolidayWork ? ' + ' : ''}${state.ignoreHolidayWork ? 'resmi tatil' : ''}`);
      if (base.sampleLabel === 'Düşük') reasons.push('Düşük örneklem');
      if (!reasons.length) reasons.push('Normal aralık');
      const action = actionForSignal(mainSignal, { ...base, sampleLabel: base.sampleLabel });
      return { ...base, ...scores, benchmark, department, score, reasons, severity, tone, mainSignal, action, strongSignals, extremeSignals, enoughSample, rawExtreme, rawCritical };
    }
    function trackingFilterText(value) {
      return String(value == null || value === '' ? '-' : value);
    }
    function trackingFilterNorm(value) {
      return trackingFilterText(value).toLocaleLowerCase('tr-TR').trim();
    }
    function parseFilterNumber(value) {
      const cleaned = String(value == null ? '' : value).trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : NaN;
    }
    function trackingComparisonSummary(rule) {
      if (!rule || !rule.op) return '';
      const v1 = Number(rule.value);
      const v2 = Number(rule.value2);
      if (rule.op === 'between' && Number.isFinite(v1) && Number.isFinite(v2)) return `${num(v1, 1)}-${num(v2, 1)}`;
      if (!Number.isFinite(v1)) return '';
      const labels = { gt: '>', gte: '>=', lt: '<', lte: '<=', eq: '=' };
      return `${labels[rule.op] || rule.op} ${num(v1, 1)}`;
    }
    function trackingComparisonMatches(value, rule) {
      if (!rule || !rule.op) return true;
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return false;
      const v1 = Number(rule.value);
      const v2 = Number(rule.value2);
      if (rule.op === 'gt') return Number.isFinite(v1) && parsed > v1;
      if (rule.op === 'gte') return Number.isFinite(v1) && parsed >= v1;
      if (rule.op === 'lt') return Number.isFinite(v1) && parsed < v1;
      if (rule.op === 'lte') return Number.isFinite(v1) && parsed <= v1;
      if (rule.op === 'eq') return Number.isFinite(v1) && Math.abs(parsed - v1) < 0.0001;
      if (rule.op === 'between') return Number.isFinite(v1) && Number.isFinite(v2) && parsed >= Math.min(v1, v2) && parsed <= Math.max(v1, v2);
      return true;
    }
    function trackingActiveFilterCount() {
      const exactCount = Object.values(state.trackingTableFilters || {}).filter(values => Array.isArray(values) && values.length).length;
      const comparisonCount = Object.values(state.trackingTableComparisons || {}).filter(rule => !!trackingComparisonSummary(rule)).length;
      return exactCount + comparisonCount;
    }
    function dataDateBounds() {
      const dates = [];
      DATA.records.forEach(record => (record.days || []).forEach(day => { if (day && day[0]) dates.push(String(day[0])); }));
      dates.sort();
      return { min: dates[0] || '', max: dates[dates.length - 1] || '' };
    }
    function filterMetricDefs() {
      return [
        { key: 'workDays', label: 'Geldiği Gün', type: 'count', help: 'Seçili tarih aralığında kişinin PDKS günlük kayıt adedi toplamıdır.' },
        { key: 'evdenDays', label: 'Evden Gün', type: 'count', help: 'Evdenlik alanı “EVDEN” olan günlerin toplamıdır.' },
        { key: 'hariciHomeDays', label: 'Harici Evden Gün', type: 'count', help: 'Evdenlik alanı “HARİCİ EVDEN” olan günlerin toplamıdır.' },
        { key: 'totalHomeDays', label: 'Toplam Evden Gün', type: 'count', help: 'Evden gün + harici evden gün toplamıdır.' },
        { key: 'actualHours', label: 'Çalıştığı Saat', type: 'hour', help: 'gun_saat, yoksa calisma_saat_toplam üzerinden gelen brüt çalışma saatidir.' },
        { key: 'expectedHours', label: 'Gereken Saat', type: 'hour', help: 'Standart çalışma saati ve özel takvim kurallarıyla hesaplanan gereken saattir.' },
        { key: 'diffHours', label: 'Saat Farkı', type: 'hourSigned', help: 'Çalıştığı saat - gereken saat. Negatif değer eksik süreyi gösterir.' },
        { key: 'negativeHours', label: 'Eksi Saat', type: 'hour', help: 'Saat farkı negatifse mutlak değeridir; pozitif dengede 0 olur.' },
        { key: 'lateDays', label: 'Geç Giriş Günü', type: 'count', help: 'Ofis günlerinde ilk girişin standart başlangıçtan 15 dakika fazla geç olduğu gün sayısıdır.' },
        { key: 'lateMinutes', label: 'Toplam Geç Dakika', type: 'minute', help: '15 dakikalık tolerans aşıldıktan sonra oluşan geç giriş sürelerinin toplamıdır.' },
        { key: 'avgLateMinutes', label: 'Ortalama Geç Dakika', type: 'minute', help: 'Toplam geç dakika / geç giriş günü olarak hesaplanır.' },
        { key: 'earlyExitDays', label: 'Erken Çıkış Günü', type: 'count', help: 'Ofis günlerinde son çıkışın standart bitişten 15 dakika fazla erken olduğu ve gün farkının negatif olduğu gün sayısıdır.' },
        { key: 'earlyExitMinutes', label: 'Toplam Erken Çıkış Dakika', type: 'minute', help: '15 dakikalık tolerans aşıldıktan sonra oluşan erken çıkış sürelerinin toplamıdır.' },
        { key: 'avgEarlyExitMinutes', label: 'Ortalama Erken Çıkış Dakika', type: 'minute', help: 'Toplam erken çıkış dakika / erken çıkış günü olarak hesaplanır.' },
        { key: 'homeOutsideWednesdayDays', label: 'Çarşamba Dışı Home', type: 'count', help: 'Evden/harici evden çalışmanın Çarşamba dışı günlere denk geldiği gün sayısıdır.' },
        { key: 'homeOverWeekDays', label: 'Haftalık Home Aşımı', type: 'count', help: 'Aynı hafta içinde bir günden fazla home kullanımının fazla kalan gün sayısıdır.' },
        { key: 'homePolicyViolations', label: 'Home Kural İhlali', type: 'count', help: 'Çarşamba dışı home + haftalık 1 gün üstü home aşımı toplamıdır.' },
        { key: 'negativeDays', label: 'Negatif Gün', type: 'count', help: 'Günlük farkı negatif olan gün sayısıdır.' },
        { key: 'negativeMonths', label: 'Negatif Ay', type: 'count', help: 'Seçili aralıkta toplam saat farkı negatif olan ay sayısıdır.' },
        { key: 'homeRatioPct', label: 'Home Oranı %', type: 'pctPoint', help: 'Toplam evden gün / geldiği gün oranıdır; ekranda yüzde puanı olarak gösterilir.' },
      ];
    }
    function filterMetricDef(key) {
      return filterMetricDefs().find(item => item.key === key) || filterMetricDefs()[0];
    }
    function filterFormatValue(value, type) {
      if (type === 'hour' || type === 'hourSigned') return `${type === 'hourSigned' && Number(value) > 0 ? '+' : ''}${hour(value)}`;
      if (type === 'pctPoint') return `%${num(value, 1)}`;
      if (type === 'minute') return `${num(value, 0)} dk`;
      return num(value);
    }
    function filterRuleSummary(rule) {
      const def = filterMetricDef(rule.metric);
      const base = trackingComparisonSummary(rule);
      return base ? `${def.label} ${base}` : '';
    }
    function dateInFilterRange(dateText) {
      const start = state.filterStart || dataDateBounds().min;
      const end = state.filterEnd || dataDateBounds().max;
      return (!start || dateText >= start) && (!end || dateText <= end);
    }
    function filterMetricsForRecord(record) {
      const calendar = effectiveCalendar();
      const days = (record.days || [])
        .filter(day => day && day[0] && dateInFilterRange(String(day[0])))
        .map(day => effectiveDayValues(day, calendar))
        .filter(day => !day.ignored);
      const startLimit = workdayStartHour() + 0.25;
      const endLimit = workdayEndHour() - 0.25;
      const workDays = days.filter(day => Number(day.count || 0) > 0);
      const officeDays = workDays.filter(day => Number(day.evden || 0) === 0 && Number(day.harici || 0) === 0);
      const totals = workDays.reduce((acc, day) => {
        acc.workDays += Number(day.count || 0);
        acc.evdenDays += Number(day.evden || 0);
        acc.hariciHomeDays += Number(day.harici || 0);
        acc.actualHours += Number(day.actual || 0);
        acc.expectedHours += Number(day.expected || 0);
        if (Number(day.diff || 0) < -0.001) acc.negativeDays += 1;
        return acc;
      }, { workDays: 0, evdenDays: 0, hariciHomeDays: 0, actualHours: 0, expectedHours: 0, negativeDays: 0 });
      totals.totalHomeDays = totals.evdenDays + totals.hariciHomeDays;
      totals.diffHours = Math.round((totals.actualHours - totals.expectedHours) * 1000) / 1000;
      totals.negativeHours = Math.max(0, -totals.diffHours);
      const lateDurations = officeDays.map(day => Math.max(0, Number(day.firstEntry) - startLimit)).filter(value => Number.isFinite(value) && value > 0);
      const earlyDurations = officeDays.map(day => Number(day.expected || 0) > 0 && Number.isFinite(Number(day.lastExit)) && Number(day.diff || 0) < -0.25 ? Math.max(0, endLimit - Number(day.lastExit)) : 0).filter(value => Number.isFinite(value) && value > 0);
      totals.lateDays = lateDurations.length;
      totals.earlyExitDays = earlyDurations.length;
      totals.lateMinutes = Math.round(lateDurations.reduce((sum, value) => sum + value * 60, 0));
      totals.earlyExitMinutes = Math.round(earlyDurations.reduce((sum, value) => sum + value * 60, 0));
      totals.avgLateMinutes = totals.lateDays ? totals.lateMinutes / totals.lateDays : 0;
      totals.avgEarlyExitMinutes = totals.earlyExitDays ? totals.earlyExitMinutes / totals.earlyExitDays : 0;
      const homeWorkDays = workDays.filter(day => Number(day.evden || 0) + Number(day.harici || 0) > 0);
      totals.homeOutsideWednesdayDays = homeWorkDays.filter(day => new Date(`${day.dateText}T12:00:00`).getDay() !== 3).length;
      const weekBuckets = new Map();
      homeWorkDays.forEach(day => {
        const key = weekKey(day.dateText);
        weekBuckets.set(key, (weekBuckets.get(key) || 0) + 1);
      });
      totals.homeOverWeekDays = [...weekBuckets.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
      totals.homePolicyViolations = totals.homeOutsideWednesdayDays + totals.homeOverWeekDays;
      const monthBuckets = new Map();
      workDays.forEach(day => {
        const month = String(day.dateText).slice(0, 7);
        monthBuckets.set(month, (monthBuckets.get(month) || 0) + Number(day.diff || 0));
      });
      totals.negativeMonths = [...monthBuckets.values()].filter(value => value < -1).length;
      totals.activeMonths = monthBuckets.size;
      totals.dayRows = workDays.length;
      totals.homeRatioPct = totals.workDays ? (totals.totalHomeDays / totals.workDays) * 100 : 0;
      totals.dateRange = `${state.filterStart || dataDateBounds().min} - ${state.filterEnd || dataDateBounds().max}`;
      return totals;
    }
    function filterBaseRows() {
      const query = state.filterQuery.trim().toLocaleLowerCase('tr-TR');
      return DATA.records.filter(record => {
        const department = mappedDepartment(record);
        if (state.filterDepartment && department !== state.filterDepartment) return false;
        if (state.filterHideInactive && !record.is_in_fiili) return false;
        if (state.filterHideHidden && isHiddenRecord(record)) return false;
        if (!query) return true;
        return `${record.sicil} ${record.name} ${record.position} ${record.fiili_unvan || ''} ${department} ${record.source_department}`.toLocaleLowerCase('tr-TR').includes(query);
      });
    }
    function advancedFilterItems() {
      return filterBaseRows()
        .map(record => ({ record, metrics: filterMetricsForRecord(record) }))
        .filter(item => item.metrics.dayRows > 0)
        .filter(item => (state.filterRules || []).every(rule => trackingComparisonMatches(item.metrics[rule.metric], rule)))
        .sort((a, b) => b.metrics.negativeHours - a.metrics.negativeHours || b.metrics.lateMinutes - a.metrics.lateMinutes || b.metrics.earlyExitMinutes - a.metrics.earlyExitMinutes || b.metrics.lateDays - a.metrics.lateDays || a.record.name.localeCompare(b.record.name, 'tr'));
    }
    function syncFilterInputs() {
      const bounds = dataDateBounds();
      if (!state.filterStart) state.filterStart = bounds.min;
      if (!state.filterEnd) state.filterEnd = bounds.max;
      if ($('filterDepartmentSelect')) $('filterDepartmentSelect').value = state.filterDepartment || '';
      if ($('filterStartDate')) $('filterStartDate').value = state.filterStart || '';
      if ($('filterEndDate')) $('filterEndDate').value = state.filterEnd || '';
      if ($('filterSearchInput')) $('filterSearchInput').value = state.filterQuery || '';
      if ($('filterHideInactiveInput')) $('filterHideInactiveInput').checked = state.filterHideInactive;
      if ($('filterHideHiddenInput')) $('filterHideHiddenInput').checked = state.filterHideHidden;
      if ($('filterIgnoreWeekendInput')) $('filterIgnoreWeekendInput').checked = state.ignoreWeekendWork;
      if ($('filterIgnoreHolidayInput')) $('filterIgnoreHolidayInput').checked = state.ignoreHolidayWork;
    }
    function readFilterControls() {
      state.filterDepartment = $('filterDepartmentSelect')?.value || '';
      state.filterStart = $('filterStartDate')?.value || dataDateBounds().min;
      state.filterEnd = $('filterEndDate')?.value || dataDateBounds().max;
      if (state.filterStart && state.filterEnd && state.filterStart > state.filterEnd) {
        const temp = state.filterStart;
        state.filterStart = state.filterEnd;
        state.filterEnd = temp;
      }
      state.filterQuery = $('filterSearchInput')?.value || '';
      state.filterHideInactive = !!$('filterHideInactiveInput')?.checked;
      state.filterHideHidden = !!$('filterHideHiddenInput')?.checked;
      syncFilterInputs();
    }
    function addAdvancedFilterRule() {
      const metric = $('filterMetricSelect')?.value || 'negativeHours';
      const op = $('filterOperatorSelect')?.value || 'gte';
      const value = parseFilterNumber($('filterValueInput')?.value);
      const value2 = parseFilterNumber($('filterValue2Input')?.value);
      if (!Number.isFinite(value) || (op === 'between' && !Number.isFinite(value2))) {
        alert('Koşul eklemek için geçerli değer girin. “Arasında” seçiliyse üst değer de gereklidir.');
        return;
      }
      state.filterRules = [...(state.filterRules || []), { metric, op, value, value2 }];
      $('filterValueInput').value = '';
      $('filterValue2Input').value = '';
      renderFilterView();
    }
    function removeAdvancedFilterRule(index) {
      state.filterRules = (state.filterRules || []).filter((_, itemIndex) => itemIndex !== index);
      renderFilterView();
    }
    function renderFilterRules() {
      const rules = state.filterRules || [];
      $('filterRuleChips').innerHTML = rules.length
        ? rules.map((rule, index) => `<span class="filter-rule-chip">${esc(filterRuleSummary(rule))}<button type="button" data-filter-rule-remove="${index}" title="Koşulu kaldır">x</button></span>`).join('')
        : '<span class="filter-empty-rules">Henüz metrik koşulu yok. Tarih/departman filtresiyle başlayabilir veya yukarıdan koşul ekleyebilirsiniz.</span>';
    }
    function renderFilterMetricInfo() {
      $('filterMetricInfo').innerHTML = [
        ['Eksi Saat', 'Saat farkı negatifse mutlak değer olarak okunur. Örn. -12,5 saat fark = 12,5 eksi saat.'],
        ['Geç Giriş', 'Sadece ofis günlerinde ilk giriş, standart başlangıç saatinden 15 dakika sonra ise sayılır.'],
        ['Erken Çıkış', 'Sadece ofis günlerinde son çıkış, standart bitiş saatinden 15 dakika önce ve gün farkı negatifse sayılır.'],
        ['Home Kuralı', 'Çarşamba dışı home + haftada 1 gün üstü home kullanımının toplam ihlal sayısıdır.'],
      ].map(([title, text]) => `<div class="filter-helper-card"><b>${esc(title)}</b><span>${esc(text)}</span></div>`).join('');
    }
    function renderFilterKpis(items) {
      const totals = items.reduce((acc, item) => {
        acc.workDays += item.metrics.workDays;
        acc.totalHomeDays += item.metrics.totalHomeDays;
        acc.hariciHomeDays += item.metrics.hariciHomeDays;
        acc.negativeHours += item.metrics.negativeHours;
        acc.lateDays += item.metrics.lateDays;
        acc.earlyExitDays += item.metrics.earlyExitDays;
        acc.lateMinutes += item.metrics.lateMinutes || 0;
        acc.earlyExitMinutes += item.metrics.earlyExitMinutes || 0;
        acc.homePolicyViolations += item.metrics.homePolicyViolations;
        acc.negativeDays += item.metrics.negativeDays;
        return acc;
      }, { workDays: 0, totalHomeDays: 0, hariciHomeDays: 0, negativeHours: 0, lateDays: 0, earlyExitDays: 0, lateMinutes: 0, earlyExitMinutes: 0, homePolicyViolations: 0, negativeDays: 0 });
      $('filterKpiGrid').innerHTML = [
        ['Kişi', num(items.length), 'Koşullardan geçen kişi'],
        ['Geldiği Gün', num(totals.workDays), 'Seçili tarih aralığı'],
        ['Toplam Evden', num(totals.totalHomeDays), `${num(totals.hariciHomeDays)} harici`],
        ['Eksi Saat', hour(totals.negativeHours), 'Negatif saat toplamı', totals.negativeHours > 0 ? 'negative' : ''],
        ['Geç Giriş', num(totals.lateDays), '15 dk+ geç ofis girişi'],
        ['Erken Çıkış', num(totals.earlyExitDays), '15 dk+ erken ofis çıkışı'],
        ['Home İhlali', num(totals.homePolicyViolations), 'Çarşamba dışı + haftalık aşım'],
        ['Negatif Gün', num(totals.negativeDays), 'Günlük eksik süre'],
      ].map(([label, value, hint, tone = '']) => `<article class="kpi ${tone}"><div class="label">${label}</div><div class="value">${value}</div><span class="hint">${hint}</span></article>`).join('');
    }
    function filterResultColumnDefs() {
      return [
        { key: 'sicil', label: 'Sicil', cls: 'cell-text', value: item => item.record.sicil, html: item => esc(item.record.sicil) },
        { key: 'name', label: 'Ad Soyad', cls: 'cell-text', value: item => item.record.name || '', html: item => esc(item.record.name || '') },
        { key: 'department', label: 'Departman', cls: 'cell-text', value: item => mappedDepartment(item.record), html: item => esc(mappedDepartment(item.record)) },
        { key: 'position', label: 'Pozisyon', cls: 'cell-text', value: item => item.record.position || '', html: item => esc(item.record.position || '') },
        { key: 'workDays', label: 'Geldiği Gün', number: item => item.metrics.workDays, value: item => num(item.metrics.workDays), html: item => num(item.metrics.workDays) },
        { key: 'totalHomeDays', label: 'Toplam Evden', number: item => item.metrics.totalHomeDays, value: item => num(item.metrics.totalHomeDays), html: item => num(item.metrics.totalHomeDays) },
        { key: 'hariciHomeDays', label: 'Harici Evden', number: item => item.metrics.hariciHomeDays, value: item => num(item.metrics.hariciHomeDays), html: item => num(item.metrics.hariciHomeDays) },
        { key: 'negativeHours', label: 'Eksi Saat', number: item => item.metrics.negativeHours, value: item => hour(item.metrics.negativeHours), html: item => hour(item.metrics.negativeHours) },
        { key: 'diffHours', label: 'Saat Farkı', number: item => item.metrics.diffHours, value: item => `${Number(item.metrics.diffHours || 0) >= 0 ? '+' : ''}${hour(item.metrics.diffHours)}`, html: item => differenceCell(item.metrics.diffHours) },
        { key: 'lateDays', label: 'Geç Giriş', number: item => item.metrics.lateDays, value: item => num(item.metrics.lateDays), html: item => num(item.metrics.lateDays) },
        { key: 'lateMinutes', label: 'Geç Kalma (Dk)', number: item => item.metrics.lateMinutes, value: item => num(item.metrics.lateMinutes, 0), html: item => num(item.metrics.lateMinutes, 0) },
        { key: 'avgLateMinutes', label: 'Ort. Geç (Dk)', number: item => item.metrics.avgLateMinutes, value: item => num(item.metrics.avgLateMinutes, 1), html: item => num(item.metrics.avgLateMinutes, 1) },
        { key: 'earlyExitDays', label: 'Erken Çıkış', number: item => item.metrics.earlyExitDays, value: item => num(item.metrics.earlyExitDays), html: item => num(item.metrics.earlyExitDays) },
        { key: 'earlyExitMinutes', label: 'Erken Çıkış (Dk)', number: item => item.metrics.earlyExitMinutes, value: item => num(item.metrics.earlyExitMinutes, 0), html: item => num(item.metrics.earlyExitMinutes, 0) },
        { key: 'avgEarlyExitMinutes', label: 'Ort. Erken (Dk)', number: item => item.metrics.avgEarlyExitMinutes, value: item => num(item.metrics.avgEarlyExitMinutes, 1), html: item => num(item.metrics.avgEarlyExitMinutes, 1) },
        { key: 'homeOutsideWednesdayDays', label: 'Çarşamba Dışı Home', number: item => item.metrics.homeOutsideWednesdayDays, value: item => num(item.metrics.homeOutsideWednesdayDays), html: item => num(item.metrics.homeOutsideWednesdayDays) },
        { key: 'homeOverWeekDays', label: 'Haftalık Home Aşımı', number: item => item.metrics.homeOverWeekDays, value: item => num(item.metrics.homeOverWeekDays), html: item => num(item.metrics.homeOverWeekDays) },
        { key: 'homePolicyViolations', label: 'Home İhlali', number: item => item.metrics.homePolicyViolations, value: item => num(item.metrics.homePolicyViolations), html: item => num(item.metrics.homePolicyViolations) },
        { key: 'negativeDays', label: 'Negatif Gün', number: item => item.metrics.negativeDays, value: item => num(item.metrics.negativeDays), html: item => num(item.metrics.negativeDays) },
        { key: 'negativeMonths', label: 'Negatif Ay', number: item => item.metrics.negativeMonths, value: item => num(item.metrics.negativeMonths), html: item => num(item.metrics.negativeMonths) },
        { key: 'homeRatioPct', label: 'Home Oranı', number: item => item.metrics.homeRatioPct, value: item => `%${num(item.metrics.homeRatioPct, 1)}`, html: item => `%${num(item.metrics.homeRatioPct, 1)}` },
      ];
    }
    function filterResultColumnValue(item, column) {
      return trackingFilterText(column.value ? column.value(item) : item[column.key]);
    }
    function filterResultFilterValues(rows, column) {
      return [...new Set(rows.map(item => filterResultColumnValue(item, column)).filter(value => value !== '-'))]
        .sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }));
    }
    function filterResultActiveFilterCount() {
      const exactCount = Object.values(state.filterTableFilters || {}).filter(values => Array.isArray(values) && values.length).length;
      const comparisonCount = Object.values(state.filterTableComparisons || {}).filter(rule => !!trackingComparisonSummary(rule)).length;
      const sortCount = state.filterTableSort && state.filterTableSort.key ? 1 : 0;
      return exactCount + comparisonCount + sortCount;
    }
    function filterResultSortSummary(column) {
      const sort = state.filterTableSort || {};
      if (!sort.key || sort.key !== column.key) return '';
      return sort.dir === 'desc' ? 'Azalan' : 'Artan';
    }
    function applyFilterResultTableControls(rows, columns) {
      const filters = state.filterTableFilters || {};
      const comparisons = state.filterTableComparisons || {};
      const activeEntries = Object.entries(filters).filter(([, values]) => Array.isArray(values) && values.length);
      const activeComparisons = Object.entries(comparisons).filter(([, rule]) => !!trackingComparisonSummary(rule));
      let out = rows.filter(item => {
        const exactOk = activeEntries.every(([key, values]) => {
          const column = columns.find(col => col.key === key);
          return !column || values.includes(filterResultColumnValue(item, column));
        });
        if (!exactOk) return false;
        return activeComparisons.every(([key, rule]) => {
          const column = columns.find(col => col.key === key);
          if (!column || !column.number) return true;
          return trackingComparisonMatches(column.number(item), rule);
        });
      });
      const sort = state.filterTableSort || {};
      const sortColumn = columns.find(col => col.key === sort.key);
      if (sortColumn) {
        const dir = sort.dir === 'desc' ? -1 : 1;
        out = [...out].sort((a, b) => {
          if (sortColumn.number) {
            const av = Number(sortColumn.number(a));
            const bv = Number(sortColumn.number(b));
            if (Number.isFinite(av) && Number.isFinite(bv) && av !== bv) return (av - bv) * dir;
            if (Number.isFinite(av) !== Number.isFinite(bv)) return Number.isFinite(av) ? -1 : 1;
          }
          const at = filterResultColumnValue(a, sortColumn);
          const bt = filterResultColumnValue(b, sortColumn);
          return at.localeCompare(bt, 'tr', { numeric: true }) * dir;
        });
      }
      return out;
    }
    function renderFilterResultHeader(columns, rows) {
      const filters = state.filterTableFilters || {};
      const comparisons = state.filterTableComparisons || {};
      return `<thead><tr>${columns.map(column => {
        const values = filterResultFilterValues(rows, column);
        const selected = Array.isArray(filters[column.key]) ? filters[column.key] : [];
        const comparison = comparisons[column.key] || {};
        const comparisonSummary = column.number ? trackingComparisonSummary(comparison) : '';
        const sortSummary = filterResultSortSummary(column);
        const summaryParts = [];
        if (selected.length) summaryParts.push(`${selected.length} seçili`);
        if (comparisonSummary) summaryParts.push(comparisonSummary);
        if (sortSummary) summaryParts.push(sortSummary);
        const summary = summaryParts.length ? summaryParts.join(' + ') : 'Tümü';
        const compareHtml = column.number ? `<div class="tracking-filter-compare"><label>Sayısal koşul</label><select data-filter-result-op><option value="" ${!comparison.op ? 'selected' : ''}>Koşul yok</option><option value="gt" ${comparison.op === 'gt' ? 'selected' : ''}>Büyüktür &gt;</option><option value="gte" ${comparison.op === 'gte' ? 'selected' : ''}>Büyük / eşit &gt;=</option><option value="lt" ${comparison.op === 'lt' ? 'selected' : ''}>Küçüktür &lt;</option><option value="lte" ${comparison.op === 'lte' ? 'selected' : ''}>Küçük / eşit &lt;=</option><option value="eq" ${comparison.op === 'eq' ? 'selected' : ''}>Eşittir =</option><option value="between" ${comparison.op === 'between' ? 'selected' : ''}>Arasında</option></select><input type="text" data-filter-result-value placeholder="Değer" value="${esc(comparison.value == null ? '' : comparison.value)}"><input type="text" data-filter-result-value2 placeholder="Üst" value="${esc(comparison.value2 == null ? '' : comparison.value2)}"></div>` : '';
        const sortHtml = `<div class="tracking-filter-actions"><button type="button" data-filter-result-sort="asc">${column.number ? 'Küçükten Büyüğe' : 'A-Z'}</button><button type="button" data-filter-result-sort="desc">${column.number ? 'Büyükten Küçüğe' : 'Z-A'}</button><button type="button" data-filter-result-sort-clear>Sıralamayı Temizle</button></div>`;
        const options = values.map(value => `<label class="tracking-filter-option"><input type="checkbox" value="${esc(value)}" ${!selected.length || selected.includes(value) ? 'checked' : ''}>${esc(value)}</label>`).join('') || '<div class="tracking-filter-empty" style="display:block">Seçenek yok</div>';
        return `<th class="tracking-filter-cell"><span class="tracking-filter-label">${esc(column.label)}</span><button type="button" class="tracking-filter-button${selected.length || comparisonSummary || sortSummary ? ' active' : ''}" data-filter-result-open data-column-key="${esc(column.key)}"><span>${esc(summary)}</span></button><div class="tracking-filter-menu" data-filter-result-menu data-column-key="${esc(column.key)}"><div class="tracking-filter-menu-title">${esc(column.label)} filtresi</div>${sortHtml}${compareHtml}<input class="tracking-filter-search" type="search" placeholder="Ara, Enter ile görünenleri seç..." data-filter-result-search><div class="tracking-filter-actions"><button type="button" data-filter-result-all>Görünenleri Seç</button><button type="button" data-filter-result-none>Temizle</button></div><div class="tracking-filter-list">${options}</div><div class="tracking-filter-empty" data-filter-result-empty>Sonuç yok</div><div class="tracking-filter-footer"><span class="tracking-filter-count">${num(values.length)} seçenek</span><button type="button" data-filter-result-cancel>Vazgeç</button><button type="button" data-filter-result-apply>Uygula</button></div></div></th>`;
      }).join('')}</tr></thead>`;
    }
    function closeFilterResultMenus(except = null) {
      document.querySelectorAll('[data-filter-result-menu].open').forEach(menu => { if (menu !== except) menu.classList.remove('open'); });
    }
    function bindFilterResultMenus() {
      const table = $('filterResultTable');
      if (!table) return;
      table.querySelectorAll('[data-filter-result-open]').forEach(button => button.addEventListener('click', event => {
        event.stopPropagation();
        const menu = button.parentElement.querySelector('[data-filter-result-menu]');
        if (!menu) return;
        const open = !menu.classList.contains('open');
        closeFilterResultMenus(menu);
        menu.classList.toggle('open', open);
        if (open) {
          positionTrackingFilterMenu(menu, button);
          const search = menu.querySelector('[data-filter-result-search]');
          if (search) { search.value = ''; search.focus(); }
        }
      }));
      table.querySelectorAll('[data-filter-result-search]').forEach(input => input.addEventListener('input', event => {
        const menu = event.target.closest('[data-filter-result-menu]');
        const query = trackingFilterNorm(event.target.value);
        let visible = 0;
        menu.querySelectorAll('.tracking-filter-option').forEach(label => {
          const show = trackingFilterNorm(label.textContent).includes(query);
          label.style.display = show ? 'flex' : 'none';
          if (show) visible += 1;
        });
        const empty = menu.querySelector('[data-filter-result-empty]');
        if (empty) empty.style.display = visible ? 'none' : 'block';
      }));
      table.querySelectorAll('[data-filter-result-search]').forEach(input => input.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        event.target.closest('[data-filter-result-menu]').querySelectorAll('.tracking-filter-option').forEach(label => {
          if (label.style.display !== 'none') label.querySelector('input').checked = true;
        });
      }));
      table.querySelectorAll('[data-filter-result-sort]').forEach(button => button.addEventListener('click', event => {
        event.stopPropagation();
        const menu = button.closest('[data-filter-result-menu]');
        state.filterTableSort = { key: menu.dataset.columnKey, dir: button.dataset.filterResultSort || 'asc' };
        closeFilterResultMenus();
        renderFilterView();
      }));
      table.querySelectorAll('[data-filter-result-sort-clear]').forEach(button => button.addEventListener('click', event => {
        event.stopPropagation();
        state.filterTableSort = {};
        closeFilterResultMenus();
        renderFilterView();
      }));
      table.querySelectorAll('[data-filter-result-all]').forEach(button => button.addEventListener('click', event => {
        event.stopPropagation();
        button.closest('[data-filter-result-menu]').querySelectorAll('.tracking-filter-option').forEach(label => {
          if (label.style.display !== 'none') label.querySelector('input').checked = true;
        });
      }));
      table.querySelectorAll('[data-filter-result-none]').forEach(button => button.addEventListener('click', event => {
        event.stopPropagation();
        const menu = button.closest('[data-filter-result-menu]');
        menu.querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = false; });
        const op = menu.querySelector('[data-filter-result-op]');
        const value = menu.querySelector('[data-filter-result-value]');
        const value2 = menu.querySelector('[data-filter-result-value2]');
        if (op) op.value = '';
        if (value) value.value = '';
        if (value2) value2.value = '';
      }));
      table.querySelectorAll('[data-filter-result-cancel]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); closeFilterResultMenus(); }));
      table.querySelectorAll('[data-filter-result-apply]').forEach(button => button.addEventListener('click', event => {
        event.stopPropagation();
        const menu = button.closest('[data-filter-result-menu]');
        const key = menu.dataset.columnKey;
        const allOptions = [...menu.querySelectorAll('input[type="checkbox"]')].map(input => input.value);
        const selected = [...menu.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
        if (!state.filterTableFilters || typeof state.filterTableFilters !== 'object') state.filterTableFilters = {};
        if (!state.filterTableComparisons || typeof state.filterTableComparisons !== 'object') state.filterTableComparisons = {};
        if (selected.length && selected.length < allOptions.length) state.filterTableFilters[key] = selected;
        else delete state.filterTableFilters[key];
        const op = menu.querySelector('[data-filter-result-op]')?.value || '';
        const value = parseFilterNumber(menu.querySelector('[data-filter-result-value]')?.value);
        const value2 = parseFilterNumber(menu.querySelector('[data-filter-result-value2]')?.value);
        if (op && Number.isFinite(value) && (op !== 'between' || Number.isFinite(value2))) {
          state.filterTableComparisons[key] = { op, value, value2 };
        } else {
          delete state.filterTableComparisons[key];
        }
        closeFilterResultMenus();
        renderFilterView();
      }));
      table.querySelectorAll('tbody tr[data-filter-sicil]').forEach(row => {
        row.addEventListener('click', () => {
          const sicil = row.dataset.filterSicil || '';
          state.selectedFilterSicil = state.selectedFilterSicil === sicil ? '' : sicil;
          table.querySelectorAll('tbody tr[data-filter-sicil]').forEach(item => item.classList.toggle('row-selected', item.dataset.filterSicil === state.selectedFilterSicil));
        });
        row.addEventListener('dblclick', () => openTrackingPerson(row.dataset.filterSicil || ''));
      });
      if (!window.__pdksFilterResultBound) {
        window.__pdksFilterResultBound = true;
        document.addEventListener('click', event => {
          if (!event.target.closest('[data-filter-result-menu]') && !event.target.closest('[data-filter-result-open]')) closeFilterResultMenus();
        });
        document.addEventListener('keydown', event => { if (event.key === 'Escape') closeFilterResultMenus(); });
        window.addEventListener('resize', () => closeFilterResultMenus());
      }
    }
    function renderFilterResultTable(items, columns = filterResultColumnDefs(), displayedItems = null) {
      const visibleItems = displayedItems || applyFilterResultTableControls(items, columns);
      const header = renderFilterResultHeader(columns, items);
      const body = visibleItems.map(item => {
        const selected = state.selectedFilterSicil === item.record.sicil;
        return `<tr class="${selected ? 'row-selected' : ''}" data-filter-sicil="${esc(item.record.sicil)}" title="Tek tık: vurgula · çift tık: kişi detayını aç">${columns.map(column => `<td class="${column.cls || ''}">${column.html(item)}</td>`).join('')}</tr>`;
      }).join('') || `<tr><td colspan="${columns.length}" class="cell-text">Seçili tarih aralığı, koşullar ve tablo filtreleri için kişi bulunamadı.</td></tr>`;
      $('filterResultTable').innerHTML = `${header}<tbody>${body}</tbody>`;
      bindFilterResultMenus();
    }
    function renderFilterView() {
      if (!$('filterResultTable')) return;
      syncFilterInputs();
      renderFilterMetricInfo();
      renderFilterRules();
      const items = advancedFilterItems();
      const columns = filterResultColumnDefs();
      const displayedItems = applyFilterResultTableControls(items, columns);
      renderFilterKpis(displayedItems);
      const rangeLabel = `${state.filterStart || dataDateBounds().min} - ${state.filterEnd || dataDateBounds().max}`;
      const depLabel = state.filterDepartment || 'Tüm departmanlar';
      const tableFilterCount = filterResultActiveFilterCount();
      $('filterDescription').textContent = `${depLabel} · ${rangeLabel} · ${num(displayedItems.length)} kişi. Koşullar AND mantığıyla birlikte çalışır.`;
      $('filterTableTools').innerHTML = `<span>${num(displayedItems.length)} / ${num(items.length)} kişi gösteriliyor · ${num((state.filterRules || []).length)} metrik koşulu · ${num(tableFilterCount)} tablo filtresi aktif.</span>${tableFilterCount ? '<button type="button" id="clearFilterTableControls">Tablo Filtrelerini Temizle</button>' : ''}`;
      const clearFilterTableButton = $('clearFilterTableControls');
      if (clearFilterTableButton) clearFilterTableButton.addEventListener('click', () => {
        state.filterTableFilters = {};
        state.filterTableComparisons = {};
        state.filterTableSort = {};
        renderFilterView();
      });
      renderFilterResultTable(items, columns, displayedItems);
    }
    function resetFilterView() {
      const bounds = dataDateBounds();
      state.filterDepartment = '';
      state.filterQuery = '';
      state.filterStart = bounds.min;
      state.filterEnd = bounds.max;
      state.filterHideInactive = true;
      state.filterHideHidden = true;
      state.filterRules = [];
      state.selectedFilterSicil = '';
      state.filterTableFilters = {};
      state.filterTableComparisons = {};
      state.filterTableSort = {};
      renderFilterView();
    }
    function exportFilterCsv() {
      readFilterControls();
      const columns = filterResultColumnDefs();
      const items = applyFilterResultTableControls(advancedFilterItems(), columns);
      const headers = ['Sicil','Ad Soyad','Departman','Pozisyon','Fiili Listede','Başlangıç','Bitiş','Geldiği Gün','Evden Gün','Harici Evden Gün','Toplam Evden Gün','Çalıştığı Saat','Gereken Saat','Saat Farkı','Eksi Saat','Geç Giriş Günü','Toplam Geç Dakika','Ortalama Geç Dakika','Erken Çıkış Günü','Toplam Erken Çıkış Dakika','Ortalama Erken Çıkış Dakika','Çarşamba Dışı Home','Haftalık Home Aşımı','Home Kural İhlali','Negatif Gün','Negatif Ay','Home Oranı %'];
      const rows = items.map(item => [
        item.record.sicil, item.record.name, mappedDepartment(item.record), item.record.position, item.record.is_in_fiili ? 'Evet' : 'Hayır',
        state.filterStart, state.filterEnd,
        num(item.metrics.workDays), num(item.metrics.evdenDays), num(item.metrics.hariciHomeDays), num(item.metrics.totalHomeDays),
        hour(item.metrics.actualHours), hour(item.metrics.expectedHours), hour(item.metrics.diffHours), hour(item.metrics.negativeHours),
        num(item.metrics.lateDays), num(item.metrics.lateMinutes, 0), num(item.metrics.avgLateMinutes, 1),
        num(item.metrics.earlyExitDays), num(item.metrics.earlyExitMinutes, 0), num(item.metrics.avgEarlyExitMinutes, 1),
        num(item.metrics.homeOutsideWednesdayDays), num(item.metrics.homeOverWeekDays),
        num(item.metrics.homePolicyViolations), num(item.metrics.negativeDays), num(item.metrics.negativeMonths), num(item.metrics.homeRatioPct, 1),
      ]);
      const csv = [headers, ...rows].map(row => row.map(csvValue).join(';')).join('\r\n');
      const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `pdks_gelismis_filtre_${state.filterStart || 'baslangic'}_${state.filterEnd || 'bitis'}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }
    function trackingColumnDefs() {
      return [
        { key: 'level', label: 'Seviye / Skor', number: item => item.score, value: item => `${item.severity} · ${num(item.score, 1)}`, html: item => `<span class="tracking-score ${item.tone}">${num(item.score, 1)}</span><br><small>${esc(item.severity)}</small>` },
        { key: 'sicil', label: 'Sicil', cls: 'cell-text', value: item => item.record.sicil, html: item => esc(item.record.sicil) },
        { key: 'name', label: 'Ad Soyad', cls: 'cell-text', value: item => item.record.name, html: item => esc(item.record.name) },
        { key: 'department', label: 'Departman', cls: 'cell-text', value: item => item.department, html: item => esc(item.department) },
        { key: 'position', label: 'Pozisyon', cls: 'cell-text', value: item => item.record.position || '', html: item => esc(item.record.position || '') },
        { key: 'mainSignal', label: 'Ana Sinyal', cls: 'cell-text', value: item => item.mainSignal, html: item => `<strong>${esc(item.mainSignal)}</strong>` },
        { key: 'signals', label: 'Güçlü / Uç', number: item => item.strongSignals, value: item => `${num(item.strongSignals)} / ${num(item.extremeSignals)}`, html: item => `${num(item.strongSignals)} / ${num(item.extremeSignals)}<br><small>güçlü / uç</small>` },
        { key: 'hourScore', label: 'Saat Açığı', number: item => item.hourScore, value: item => num(item.hourScore, 1), html: item => num(item.hourScore, 1) },
        { key: 'lateScore', label: 'Sürekli Geç', number: item => item.lateScore, value: item => `${num(item.lateScore, 1)} · ${num(item.lateDays)} gün · ${num(item.lateMinutes, 0)} dk`, html: item => `${num(item.lateScore, 1)}<br><small>${num(item.lateDays)} gün · ${num(item.lateMinutes, 0)} dk</small>` },
        { key: 'earlyScore', label: 'Erken Çıkış', number: item => item.earlyScore, value: item => `${num(item.earlyScore, 1)} · ${num(item.earlyExitDays)} gün · ${num(item.earlyExitMinutes, 0)} dk`, html: item => `${num(item.earlyScore, 1)}<br><small>${num(item.earlyExitDays)} gün · ${num(item.earlyExitMinutes, 0)} dk</small>` },
        { key: 'homePolicyScore', label: 'Home Kuralı', number: item => item.homePolicyScore, value: item => `${num(item.homePolicyScore, 1)} · ${num(item.homePolicyViolations)} ihlal`, html: item => `${num(item.homePolicyScore, 1)}<br><small>${num(item.homePolicyViolations)} ihlal</small>` },
        { key: 'offsiteScore', label: 'Harici Evden', number: item => item.offsiteScore, value: item => `${num(item.offsiteScore, 1)} · ${num(item.hariciHomeDays)} gün`, html: item => `${num(item.offsiteScore, 1)}<br><small>${num(item.hariciHomeDays)} gün</small>` },
        { key: 'continuityScore', label: 'Süreklilik', number: item => item.continuityScore, value: item => `${num(item.continuityScore, 1)} · ${num(item.consecutiveNegativeMonths)} ardışık`, html: item => `${num(item.continuityScore, 1)}<br><small>${num(item.consecutiveNegativeMonths)} ardışık</small>` },
        { key: 'deptScore', label: 'Departman Uyumsuzluğu', number: item => item.deptScore, value: item => `${num(item.deptScore, 1)} · ${num(item.benchmark.count)} kişi`, html: item => `${num(item.deptScore, 1)}<br><small>${num(item.benchmark.count)} kişi</small>` },
        { key: 'sample', label: 'Örneklem', cls: 'cell-text', number: item => item.dayCount, value: item => `${item.sampleLabel} · ${num(item.dayCount)} gün`, html: item => `${esc(item.sampleLabel)}<br><small>${num(item.dayCount)} gün</small>` },
        { key: 'action', label: 'Önerilen Aksiyon', cls: 'cell-text tracking-reasons', value: item => item.action, html: item => esc(item.action) },
        { key: 'reason', label: 'Gerekçe', cls: 'cell-text tracking-reasons', value: item => item.reasons.join(' · '), html: item => esc(item.reasons.join(' · ')) },
      ];
    }
    function trackingColumnValue(item, column) {
      return trackingFilterText(column.value ? column.value(item) : item[column.key]);
    }
    function trackingFilterValues(rows, column) {
      return [...new Set(rows.map(item => trackingColumnValue(item, column)).filter(value => value !== '-'))]
        .sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }));
    }
    function applyTrackingTableFilters(rows, columns) {
      const filters = state.trackingTableFilters || {};
      const comparisons = state.trackingTableComparisons || {};
      const activeEntries = Object.entries(filters).filter(([, values]) => Array.isArray(values) && values.length);
      const activeComparisons = Object.entries(comparisons).filter(([, rule]) => !!trackingComparisonSummary(rule));
      if (!activeEntries.length && !activeComparisons.length) return rows;
      return rows.filter(item => {
        const exactOk = activeEntries.every(([key, values]) => {
          const column = columns.find(col => col.key === key);
          return !column || values.includes(trackingColumnValue(item, column));
        });
        if (!exactOk) return false;
        return activeComparisons.every(([key, rule]) => {
          const column = columns.find(col => col.key === key);
          if (!column || !column.number) return true;
          return trackingComparisonMatches(column.number(item), rule);
        });
      });
    }
    function renderTrackingHeader(columns, rows) {
      const filters = state.trackingTableFilters || {};
      const comparisons = state.trackingTableComparisons || {};
      return `<thead><tr>${columns.map(column => {
        const values = trackingFilterValues(rows, column);
        const selected = Array.isArray(filters[column.key]) ? filters[column.key] : [];
        const comparison = comparisons[column.key] || {};
        const comparisonSummary = column.number ? trackingComparisonSummary(comparison) : '';
        const summaryParts = [];
        if (selected.length) summaryParts.push(`${selected.length} seçili`);
        if (comparisonSummary) summaryParts.push(comparisonSummary);
        const summary = summaryParts.length ? summaryParts.join(' + ') : 'Tümü';
        const compareHtml = column.number ? `<div class="tracking-filter-compare"><label>Sayısal koşul</label><select data-tracking-filter-op><option value="" ${!comparison.op ? 'selected' : ''}>Koşul yok</option><option value="gt" ${comparison.op === 'gt' ? 'selected' : ''}>Büyüktür &gt;</option><option value="gte" ${comparison.op === 'gte' ? 'selected' : ''}>Büyük / eşit &gt;=</option><option value="lt" ${comparison.op === 'lt' ? 'selected' : ''}>Küçüktür &lt;</option><option value="lte" ${comparison.op === 'lte' ? 'selected' : ''}>Küçük / eşit &lt;=</option><option value="eq" ${comparison.op === 'eq' ? 'selected' : ''}>Eşittir =</option><option value="between" ${comparison.op === 'between' ? 'selected' : ''}>Arasında</option></select><input type="text" data-tracking-filter-value placeholder="Değer" value="${esc(comparison.value == null ? '' : comparison.value)}"><input type="text" data-tracking-filter-value2 placeholder="Üst" value="${esc(comparison.value2 == null ? '' : comparison.value2)}"></div>` : '';
        const options = values.map(value => `<label class="tracking-filter-option"><input type="checkbox" value="${esc(value)}" ${!selected.length || selected.includes(value) ? 'checked' : ''}>${esc(value)}</label>`).join('') || '<div class="tracking-filter-empty" style="display:block">Seçenek yok</div>';
        return `<th class="tracking-filter-cell"><span class="tracking-filter-label">${esc(column.label)}</span><button type="button" class="tracking-filter-button${selected.length || comparisonSummary ? ' active' : ''}" data-tracking-filter-open data-column-key="${esc(column.key)}"><span>${esc(summary)}</span></button><div class="tracking-filter-menu" data-tracking-filter-menu data-column-key="${esc(column.key)}"><div class="tracking-filter-menu-title">${esc(column.label)} filtresi</div>${compareHtml}<input class="tracking-filter-search" type="search" placeholder="Ara, Enter ile görünenleri seç..." data-tracking-filter-search><div class="tracking-filter-actions"><button type="button" data-tracking-filter-all>Görünenleri Seç</button><button type="button" data-tracking-filter-none>Temizle</button></div><div class="tracking-filter-list">${options}</div><div class="tracking-filter-empty" data-tracking-filter-empty>Sonuç yok</div><div class="tracking-filter-footer"><span class="tracking-filter-count">${num(values.length)} seçenek</span><button type="button" data-tracking-filter-cancel>Vazgeç</button><button type="button" data-tracking-filter-apply>Uygula</button></div></div></th>`;
      }).join('')}</tr></thead>`;
    }
    function closeTrackingFilterMenus(except = null) {
      document.querySelectorAll('[data-tracking-filter-menu].open').forEach(menu => { if (menu !== except) menu.classList.remove('open'); });
    }
    function positionTrackingFilterMenu(menu, button) {
      const rect = button.getBoundingClientRect();
      const width = Math.min(330, window.innerWidth - 24);
      menu.style.width = `${width}px`;
      menu.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
      menu.style.top = `${Math.max(12, rect.bottom + 6)}px`;
    }
    function bindTrackingFilterMenus() {
      const table = $('trackingTable');
      if (!table) return;
      table.querySelectorAll('[data-tracking-filter-open]').forEach(button => button.addEventListener('click', event => {
        event.stopPropagation();
        const menu = button.parentElement.querySelector('[data-tracking-filter-menu]');
        if (!menu) return;
        const open = !menu.classList.contains('open');
        closeTrackingFilterMenus(menu);
        menu.classList.toggle('open', open);
        if (open) {
          positionTrackingFilterMenu(menu, button);
          const search = menu.querySelector('[data-tracking-filter-search]');
          if (search) { search.value = ''; search.focus(); }
        }
      }));
      table.querySelectorAll('[data-tracking-filter-search]').forEach(input => input.addEventListener('input', event => {
        const menu = event.target.closest('[data-tracking-filter-menu]');
        const query = trackingFilterNorm(event.target.value);
        let visible = 0;
        menu.querySelectorAll('.tracking-filter-option').forEach(label => {
          const show = trackingFilterNorm(label.textContent).includes(query);
          label.style.display = show ? 'flex' : 'none';
          if (show) visible += 1;
        });
        const empty = menu.querySelector('[data-tracking-filter-empty]');
        if (empty) empty.style.display = visible ? 'none' : 'block';
      }));
      table.querySelectorAll('[data-tracking-filter-search]').forEach(input => input.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        event.target.closest('[data-tracking-filter-menu]').querySelectorAll('.tracking-filter-option').forEach(label => {
          if (label.style.display !== 'none') label.querySelector('input').checked = true;
        });
      }));
      table.querySelectorAll('[data-tracking-filter-all]').forEach(button => button.addEventListener('click', event => {
        event.stopPropagation();
        button.closest('[data-tracking-filter-menu]').querySelectorAll('.tracking-filter-option').forEach(label => {
          if (label.style.display !== 'none') label.querySelector('input').checked = true;
        });
      }));
      table.querySelectorAll('[data-tracking-filter-none]').forEach(button => button.addEventListener('click', event => {
        event.stopPropagation();
        const menu = button.closest('[data-tracking-filter-menu]');
        menu.querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = false; });
        const op = menu.querySelector('[data-tracking-filter-op]');
        const value = menu.querySelector('[data-tracking-filter-value]');
        const value2 = menu.querySelector('[data-tracking-filter-value2]');
        if (op) op.value = '';
        if (value) value.value = '';
        if (value2) value2.value = '';
      }));
      table.querySelectorAll('[data-tracking-filter-cancel]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); closeTrackingFilterMenus(); }));
      table.querySelectorAll('[data-tracking-filter-apply]').forEach(button => button.addEventListener('click', event => {
        event.stopPropagation();
        const menu = button.closest('[data-tracking-filter-menu]');
        const key = menu.dataset.columnKey;
        const allOptions = [...menu.querySelectorAll('input[type="checkbox"]')].map(input => input.value);
        const selected = [...menu.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
        if (!state.trackingTableFilters || typeof state.trackingTableFilters !== 'object') state.trackingTableFilters = {};
        if (!state.trackingTableComparisons || typeof state.trackingTableComparisons !== 'object') state.trackingTableComparisons = {};
        if (selected.length && selected.length < allOptions.length) state.trackingTableFilters[key] = selected;
        else delete state.trackingTableFilters[key];
        const op = menu.querySelector('[data-tracking-filter-op]')?.value || '';
        const value = parseFilterNumber(menu.querySelector('[data-tracking-filter-value]')?.value);
        const value2 = parseFilterNumber(menu.querySelector('[data-tracking-filter-value2]')?.value);
        if (op && Number.isFinite(value) && (op !== 'between' || Number.isFinite(value2))) {
          state.trackingTableComparisons[key] = { op, value, value2 };
        } else {
          delete state.trackingTableComparisons[key];
        }
        closeTrackingFilterMenus();
        renderTracking();
      }));
      table.querySelectorAll('tbody tr[data-tracking-sicil]').forEach(row => {
        row.addEventListener('click', () => {
          const sicil = row.dataset.trackingSicil || '';
          state.selectedTrackingSicil = state.selectedTrackingSicil === sicil ? '' : sicil;
          table.querySelectorAll('tbody tr[data-tracking-sicil]').forEach(item => item.classList.toggle('row-selected', item.dataset.trackingSicil === state.selectedTrackingSicil));
        });
        row.addEventListener('dblclick', () => openTrackingPerson(row.dataset.trackingSicil || ''));
      });
      if (!window.__pdksTrackingFilterBound) {
        window.__pdksTrackingFilterBound = true;
        document.addEventListener('click', event => {
          if (!event.target.closest('[data-tracking-filter-menu]') && !event.target.closest('[data-tracking-filter-open]')) closeTrackingFilterMenus();
        });
        document.addEventListener('keydown', event => { if (event.key === 'Escape') closeTrackingFilterMenus(); });
        window.addEventListener('resize', () => closeTrackingFilterMenus());
      }
    }
    function openTrackingPerson(sicil) {
      const record = DATA.records.find(item => item.sicil === sicil);
      if (!record) return;
      state.selectedTrackingSicil = sicil;
      state.personSicil = sicil;
      state.personQuery = '';
      state.personHideInactive = false;
      state.personHideHidden = false;
      resetPersonDayTableState();
      if ($('personDetailSearch')) $('personDetailSearch').value = '';
      if ($('personHideInactiveInput')) $('personHideInactiveInput').checked = state.personHideInactive;
      if ($('personHideHiddenInput')) $('personHideHiddenInput').checked = state.personHideHidden;
      history.replaceState(null, '', '#person');
      showView('personView');
    }
    function renderTracking() {
      if (!$('trackingTable')) return;
      const months = trackingMonths();
      const baseRows = trackingBaseRows();
      const benchmarks = departmentBenchmarks(baseRows, months);
      const scored = baseRows.map(record => ({ record, ...trackingScore(record, months, benchmarks) })).sort((a, b) => b.score - a.score || a.record.name.localeCompare(b.record.name, 'tr'));
      const levelRows = scored.filter(item => trackingLevelMatches(item, state.trackingLevel));
      const columns = trackingColumnDefs();
      const displayed = applyTrackingTableFilters(levelRows, columns);
      const alarm = scored.filter(item => item.severity === 'Alarm').length;
      const critical = scored.filter(item => item.severity === 'Kritik').length;
      const watch = scored.filter(item => item.severity === 'İzlemeli').length;
      const avgScore = scored.length ? scored.reduce((sum, item) => sum + item.score, 0) / scored.length : 0;
      const latePeople = scored.filter(item => item.lateScore >= 35).length;
      const earlyPeople = scored.filter(item => item.earlyScore >= 35).length;
      const homePolicyPeople = scored.filter(item => item.homePolicyScore >= 35 || item.offsiteScore >= 35).length;
      const ignoreLabel = state.ignoreWeekendWork || state.ignoreHolidayWork
        ? `${state.ignoreWeekendWork ? 'Hafta sonu' : ''}${state.ignoreWeekendWork && state.ignoreHolidayWork ? ' + ' : ''}${state.ignoreHolidayWork ? 'Resmi tatil' : ''}`
        : 'Kapalı';
      $('trackingKpiGrid').innerHTML = [
        ['Kişi', num(scored.length), 'Filtrelenmiş kapsam'],
        ['Alarm', num(alarm), 'Aksiyon önceliği en yüksek kişiler', 'negative'],
        ['Kritik', num(critical), 'Alarm değil ama güçlü sinyal var'],
        ['İzlemeli', num(watch), 'Sinyal var, öncelik düşük'],
        ['Gösterilen', num(displayed.length), 'Liste + tablo filtresi sonrası'],
        ['Sürekli Geç', num(latePeople), 'Geç giriş sinyali 35+'],
        ['Erken Çıkış', num(earlyPeople), 'Erken çıkış sinyali 35+'],
        ['Home Uyumsuz', num(homePolicyPeople), 'Çarşamba/haftalık/harici kuralı'],
        ['Ortalama Skor', num(avgScore, 1), '0 iyi · 100 yüksek sinyal'],
        ['Yok Sayma', ignoreLabel, 'hesaplama modu'],
      ].map(([label, value, hint, tone = '']) => `<article class="kpi ${tone}"><div class="label">${label}</div><div class="value">${value}</div><span class="hint">${hint}</span></article>`).join('');
      $('trackingFormulaNote').innerHTML = '<strong>Takip skoru V3.2:</strong> Her alt skor ve ana seviye skoru 0-100 aralığındadır. 0-25 düşük sinyal, 25-70 izlenebilir sinyal, 70-100 güçlü/uç sinyal olarak okunur. Skorlar artık tek bir tabana sabitlenmez; davranış şiddetine göre 1 ondalık hassasiyetle dağılır.';
      $('trackingMethodInfo').innerHTML = `
        <div class="tracking-method-grid">
          <div class="tracking-method-card"><b>Saat Açığı</b><span>Negatif saat farkı ve negatif ay sayısıdır. 8 saat uyarı, 45 saat kritik, 160 saat uç eşiktir. Negatif ay sayısı destekleyici ağırlık taşır.</span></div>
          <div class="tracking-method-card"><b>Sürekli Geç</b><span>15 dakikaya kadar sapma toleranstır. Skor; geç gün sayısı (%40), gün oranı (%25), toplam geç dakika (%25) ve olay başına ortalama dakika (%10) ile hesaplanır.</span></div>
          <div class="tracking-method-card"><b>Erken Çıkış</b><span>15 dakikaya kadar sapma toleranstır. Skor; erken çıkış gün sayısı (%40), gün oranı (%25), toplam erken dakika (%25) ve olay başına ortalama dakika (%10) ile hesaplanır.</span></div>
          <div class="tracking-method-card"><b>Home Kuralı</b><span>Haftada 1 gün ve Çarşamba varsayımına göre ihlal sayısıdır. Çarşamba dışı home ve haftalık 1 gün üstü home ayrıca puan üretir.</span></div>
          <div class="tracking-method-card"><b>Harici Evden</b><span>Harici evden çalışma gün sayısı ve oranıdır. 2 gün uyarı, 30 gün kritik, 100 gün uç eşiktir; toplam güne oranı ayrıca etkiler.</span></div>
          <div class="tracking-method-card"><b>Süreklilik</b><span>Negatif farkın kaç aya yayıldığı ve ardışık negatif ay sayısıdır. 2 ardışık ay uyarı, 6 ardışık ay kritik, 12 ardışık ay uç eşiktir; kısa dönem veride herkesin 100’e çarpması engellenir.</span></div>
          <div class="tracking-method-card"><b>Departman Uyumsuzluğu</b><span>Kişinin saat açığı, geç kalma, erken çıkış ve home oranlarının kendi departman ortalamasından ne kadar saptığını ölçer.</span></div>
          <div class="tracking-method-card"><b>Toplam / Alarm</b><span>Toplam skor: Saat Açığı %22, Sürekli Geç %18, Erken Çıkış %15, Home %15, Harici %10, Süreklilik %10, Departman %10. Kritik davranışlar skoru 70’e sabitlemez; davranış baskısına göre kademeli ek puan verir.</span></div>
        </div>
        <p class="tracking-method-note"><strong>Okuma notu:</strong> Alt kolonlardaki puanlar davranışın şiddetidir; yanlarındaki küçük metin gerçek adet/oranı gösterir. Böylece 100 puan yalnızca uç eşiğe yaklaşan davranışlarda oluşur. Kapsam filtresiyle Alarm, Kritik, İzlemeli veya tüm kayıtlar açılabilir. Tek tık satırı vurgular; çift tık kişi detay ekranını açar.</p>`;
      const activeFilterCount = trackingActiveFilterCount();
      if ($('trackingTableTools')) {
        $('trackingTableTools').innerHTML = activeFilterCount
          ? `<span>${num(activeFilterCount)} tablo filtresi aktif · ${num(displayed.length)} kayıt gösteriliyor.</span><button type="button" id="clearTrackingTableFilters">Tablo Filtrelerini Temizle</button>`
          : `<span>Başlıklardaki Tümü düğmeleriyle Excel benzeri seçim veya sayısal koşul filtresi açabilirsiniz. Tek tık satırı vurgular, çift tık kişi detayına geçer.</span>`;
        const clearButton = $('clearTrackingTableFilters');
        if (clearButton) clearButton.addEventListener('click', () => { state.trackingTableFilters = {}; state.trackingTableComparisons = {}; renderTracking(); });
      }
      const header = renderTrackingHeader(columns, levelRows);
      const body = displayed.slice(0, 250).map(item => {
        const selected = state.selectedTrackingSicil === item.record.sicil;
        return `<tr class="clickable-row ${selected ? 'row-selected' : ''}" data-tracking-sicil="${esc(item.record.sicil)}" title="Tek tık: vurgula · Çift tık: kişi detayını aç">${columns.map(column => `<td class="${column.cls || ''}">${column.html(item)}</td>`).join('')}</tr>`;
      }).join('') || `<tr><td colspan="${columns.length}" class="cell-text">Seçili kapsam için takip kaydı bulunamadı. Kapsam filtresinden Kritik, İzlemeli veya Tümü seçebilirsiniz.</td></tr>`;
      $('trackingTable').innerHTML = `${header}<tbody>${body}</tbody>`;
      bindTrackingFilterMenus();
    }

    function refreshDepartmentOptions() {
      const values = [...new Set(DATA.records.map(mappedDepartment).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
      if (state.department && !values.includes(state.department)) state.department = '';
      if (state.trackingDepartment && !values.includes(state.trackingDepartment)) state.trackingDepartment = '';
      if (state.filterDepartment && !values.includes(state.filterDepartment)) state.filterDepartment = '';
      $('departmentSelect').innerHTML = departmentOptionsHtml(state.department, 'Tüm departmanlar');
      if ($('trackingDepartmentSelect')) $('trackingDepartmentSelect').innerHTML = departmentOptionsHtml(state.trackingDepartment, 'Tüm departmanlar');
      if ($('filterDepartmentSelect')) $('filterDepartmentSelect').innerHTML = departmentOptionsHtml(state.filterDepartment, 'Tüm departmanlar');
    }
    function showView(viewId) {
      state.activeView = viewId;
      document.querySelectorAll('.view').forEach(view => view.classList.toggle('hidden', view.id !== viewId));
      document.querySelectorAll('.view-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.view === viewId));
      if (viewId === 'settingsView') renderSettings();
      if (viewId === 'personView') { renderPersonOptions(); renderPersonDetail(); }
      if (viewId === 'trackingView') renderTracking();
      if (viewId === 'filterView') renderFilterView();
      if (viewId === 'dashboardView') requestAnimationFrame(syncScrollWidth);
    }
    function renderMappingSettings() {
      $('mappingSourceSelect').innerHTML = DATA.source_departments.map(source => `<option value="${esc(source)}">${esc(source)}</option>`).join('');
      $('departmentKeyList').innerHTML = [...new Set([...DATA.default_department_keys, ...Object.values(DATA.default_department_mapping || {}), ...Object.values(settings.departmentOverrides || {})])]
        .filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), 'tr'))
        .map(value => `<option value="${esc(value)}"></option>`).join('');
      $('mappingTableBody').innerHTML = DATA.source_departments.map(source => {
        const hasOverride = Object.prototype.hasOwnProperty.call(settings.departmentOverrides, source);
        const effective = settings.departmentOverrides[source] || (DATA.default_department_mapping || {})[source] || source;
        return `<tr><td>${esc(source)}</td><td><strong>${esc(effective)}</strong></td><td><span class="status-chip ${hasOverride ? 'active' : 'default'}">${hasOverride ? 'Kullanıcı ayarı' : 'Varsayılan'}</span></td><td><button class="edit" type="button" data-map-edit="${esc(source)}">Düzenle</button>${hasOverride ? ` <button type="button" data-map-reset="${esc(source)}">Sıfırla</button>` : ''}</td></tr>`;
      }).join('');
    }
    function renderCalendarSettings() {
      const calendar = effectiveCalendar();
      const entries = Object.values(calendar).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      $('calendarTableBody').innerHTML = entries.map(item => {
        const isOverride = Object.prototype.hasOwnProperty.call(settings.calendarOverrides, item.date) && settings.calendarOverrides[item.date] !== null;
        return `<tr><td>${esc(item.date)}</td><td>${esc(item.category)}</td><td>${esc(item.description)}</td><td>${hour(item.expected_hours)} sa.</td><td><button class="edit" type="button" data-calendar-edit="${esc(item.date)}">Düzenle</button> <button type="button" data-calendar-delete="${esc(item.date)}">Kaldır</button>${isOverride ? ' <span class="status-chip active">Özel</span>' : ''}</td></tr>`;
      }).join('') || '<tr><td colspan="5">Tanımlı özel gün bulunmuyor.</td></tr>';
    }
    function renderHiddenSearchResults() {
      const input = $('hiddenPersonSearch');
      if (!input) return;
      const query = input.value.trim().toLocaleLowerCase('tr-TR');
      const hidden = hiddenPeople();
      if (!query) {
        $('hiddenSearchResults').innerHTML = '<div class="calendar-empty">Sicil, ad soyad, görev veya departman yazarak kişi arayın.</div>';
        return;
      }
      const rows = DATA.records
        .filter(record => !isHiddenRecord(record))
        .filter(record => hiddenRecordLabel(record).toLocaleLowerCase('tr-TR').includes(query))
        .slice(0, 12);
      $('hiddenSearchResults').innerHTML = rows.length ? rows.map(record => {
        return `<button class="hidden-result" type="button" data-hidden-add="${esc(hiddenRecordKey(record))}"><span><strong>${esc(record.name || 'İsimsiz')}</strong><span>${esc(record.sicil || '')} · ${esc(record.position || '')} · ${esc(mappedDepartment(record))}</span></span><em>Gizle</em></button>`;
      }).join('') : '<div class="calendar-empty">Eşleşen aktif kayıt bulunamadı.</div>';
    }
    function renderHiddenPeopleSettings() {
      const visibleAuto = autoHiddenVisible();
      const autoEntries = (DATA.auto_hidden_people || [])
        .filter(person => !visibleAuto[String(person.sicil || '').trim()])
        .map(person => [String(person.sicil || ''), { ...person, automatic: true }]);
      const manualEntries = Object.entries(hiddenPeople()).map(([sicil, person]) => [sicil, { ...person, automatic: false }]);
      const entries = [...autoEntries, ...manualEntries]
        .filter(([sicil], index, all) => all.findIndex(([other]) => other === sicil) === index)
        .sort((a, b) => String(a[1].name || '').localeCompare(String(b[1].name || ''), 'tr'));
      $('hiddenPeopleTableBody').innerHTML = entries.length ? entries.map(([sicil, person]) => {
        const reason = person.automatic ? (person.reason || 'Otomatik dışlama') : 'Kullanıcı ekledi';
        const action = `<button type="button" data-hidden-remove="${esc(sicil)}">${person.automatic ? 'Kaldır' : 'Kaldır'}</button>`;
        return `<tr><td>${esc(sicil)}</td><td><strong>${esc(person.name || '')}</strong></td><td>${esc(person.position || '')}</td><td>${esc(person.department || '')}</td><td>${esc(reason)}</td><td>${action}</td></tr>`;
      }).join('') : '<tr><td colspan="6">Gizlenen kişi bulunmuyor.</td></tr>';
      renderHiddenSearchResults();
    }
    function renderSettings() {
      renderWorkdaySettings();
      renderMappingSettings();
      renderCalendarSettings();
      renderHiddenPeopleSettings();
    }
    function applySettingsChange(message, calendarChanged = false) {
      saveSettings(message);
      if (calendarChanged) rebuildDerivedMetrics();
      refreshDepartmentOptions();
      renderSettings();
      render();
      updateFooterHours();
      if (state.activeView === 'personView') { renderPersonOptions(); renderPersonDetail(); }
      if (state.activeView === 'trackingView') renderTracking();
      if (state.activeView === 'filterView') renderFilterView();
    }
    function saveMapping() {
      const source = $('mappingSourceSelect').value;
      const target = $('mappingTargetInput').value.trim();
      if (!source || !target) { $('settingsStatus').textContent = 'Kaynak departman ve hedef key zorunludur.'; return; }
      settings.departmentOverrides[source] = target;
      $('mappingTargetInput').value = '';
      applySettingsChange(`${source} → ${target} eşleştirmesi kaydedildi.`);
    }
    function saveCalendarRule() {
      const dateText = $('calendarDateInput').value;
      const expectedHours = Number($('calendarHoursInput').value);
      const category = $('calendarCategorySelect').value;
      const description = $('calendarDescriptionInput').value.trim() || category;
      if (!dateText || !Number.isFinite(expectedHours) || expectedHours < 0 || expectedHours > 24) {
        $('settingsStatus').textContent = 'Geçerli tarih ve 0-24 arasında gereken saat girin.';
        return;
      }
      settings.calendarOverrides[dateText] = { date: dateText, expected_hours: expectedHours, category, description };
      $('calendarDescriptionInput').value = '';
      applySettingsChange(`${dateText} özel gün kuralı kaydedildi.`, true);
    }
    function addHiddenPerson(sicil) {
      const record = DATA.records.find(item => hiddenRecordKey(item) === String(sicil || ''));
      if (!record) {
        $('settingsStatus').textContent = 'Gizlenecek kişi bulunamadı.';
        return;
      }
      hiddenPeople()[hiddenRecordKey(record)] = {
        sicil: hiddenRecordKey(record),
        name: record.name || '',
        position: record.position || '',
        department: mappedDepartment(record),
        added_at: new Date().toISOString(),
      };
      delete autoHiddenVisible()[hiddenRecordKey(record)];
      $('hiddenPersonSearch').value = '';
      applySettingsChange(`${record.name || record.sicil} gizlenen kişiler listesine eklendi.`);
    }
    function removeHiddenPerson(sicil) {
      const key = String(sicil || '').trim();
      const auto = autoHiddenMap()[key];
      if (auto) {
        autoHiddenVisible()[key] = { sicil: key, name: auto.name || '', removed_at: new Date().toISOString() };
        delete hiddenPeople()[key];
        applySettingsChange('Otomatik gizlenen kişi listeden kaldırıldı; bu tarayıcıda görünür bırakılacak.');
        return;
      }
      delete hiddenPeople()[key];
      applySettingsChange('Gizlenen kişi listeden kaldırıldı.');
    }
    function clearHiddenPeople() {
      if (!Object.keys(hiddenPeople()).length) return;
      if (!confirm('Manuel gizlenen kişiler listesi temizlensin mi Otomatik gizlenen kişiler etkilenmez.')) return;
      settings.hiddenPeople = {};
      applySettingsChange('Manuel gizlenen kişiler listesi temizlendi.');
    }
    function exportSettings() {
      const payload = { format: 'Aizanoi PDKS Settings', version: 4, exported_at: new Date().toISOString(), settings };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `pdks_ayarlari_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      $('settingsStatus').textContent = 'Ayar dosyası indirildi.';
    }
    async function importSettingsFile(file) {
      try {
        const parsed = JSON.parse(await file.text());
        settings = normalizeSettings(parsed.settings || parsed);
        applySettingsChange('Ayar dosyası içe aktarıldı.', true);
      } catch (error) {
        $('settingsStatus').textContent = `Ayar dosyası okunamadı: ${error.message}`;
      }
    }
    function resetSettings() {
      if (!confirm('Tüm departman ve özel gün ayarları varsayılana döndürülsün mü')) return;
      settings = emptySettings();
      applySettingsChange('Tüm PDKS ayarları varsayılana döndürüldü.', true);
    }
    function bindSettingsEvents() {
      $('saveWorkdayButton').addEventListener('click', saveWorkdaySettings);
      $('workdayStartInput').addEventListener('input', updateWorkdayHoursFromTimes);
      $('workdayEndInput').addEventListener('input', updateWorkdayHoursFromTimes);
      $('saveMappingButton').addEventListener('click', saveMapping);
      $('saveCalendarButton').addEventListener('click', saveCalendarRule);
      $('exportSettingsButton').addEventListener('click', exportSettings);
      $('importSettingsButton').addEventListener('click', () => $('settingsFileInput').click());
      $('settingsFileInput').addEventListener('change', event => {
        const file = (event.target.files && event.target.files[0]);
        if (file) importSettingsFile(file);
        event.target.value = '';
      });
      $('resetSettingsButton').addEventListener('click', resetSettings);
      $('mappingTableBody').addEventListener('click', event => {
        const edit = event.target.closest('[data-map-edit]');
        const reset = event.target.closest('[data-map-reset]');
        if (edit) {
          const source = edit.dataset.mapEdit;
          $('mappingSourceSelect').value = source;
          $('mappingTargetInput').value = mappedDepartment({ source_department: source });
          $('mappingTargetInput').focus();
        }
        if (reset) {
          delete settings.departmentOverrides[reset.dataset.mapReset];
          applySettingsChange(`${reset.dataset.mapReset} varsayılan eşleştirmeye döndürüldü.`);
        }
      });
      $('calendarTableBody').addEventListener('click', event => {
        const edit = event.target.closest('[data-calendar-edit]');
        const remove = event.target.closest('[data-calendar-delete]');
        if (edit) {
          const item = effectiveCalendar()[edit.dataset.calendarEdit];
          if (!item) return;
          $('calendarDateInput').value = item.date;
          $('calendarCategorySelect').value = item.category;
          $('calendarHoursInput').value = item.expected_hours;
          $('calendarDescriptionInput').value = item.description;
          $('calendarDescriptionInput').focus();
        }
        if (remove) {
          const day = remove.dataset.calendarDelete;
          if (defaultCalendar[day]) settings.calendarOverrides[day] = null;
          else delete settings.calendarOverrides[day];
          applySettingsChange(`${day} özel gün kuralı kaldırıldı.`, true);
        }
      });
      $('hiddenPersonSearch').addEventListener('input', renderHiddenSearchResults);
      $('hiddenSearchResults').addEventListener('click', event => {
        const add = event.target.closest('[data-hidden-add]');
        if (add) addHiddenPerson(add.dataset.hiddenAdd);
      });
      $('hiddenPeopleTableBody').addEventListener('click', event => {
        const remove = event.target.closest('[data-hidden-remove]');
        if (remove) removeHiddenPerson(remove.dataset.hiddenRemove);
      });
      $('clearHiddenPeopleButton').addEventListener('click', clearHiddenPeople);
    }
    function initFilterControls() {
      if (!$('filterMetricSelect')) return;
      const bounds = dataDateBounds();
      state.filterStart = state.filterStart || bounds.min;
      state.filterEnd = state.filterEnd || bounds.max;
      $('filterMetricSelect').innerHTML = filterMetricDefs().map(item => `<option value="${esc(item.key)}">${esc(item.label)}</option>`).join('');
      $('filterMetricSelect').value = 'negativeHours';
      syncFilterInputs();
      $('filterApplyButton').addEventListener('click', () => { readFilterControls(); renderFilterView(); });
      $('filterResetButton').addEventListener('click', resetFilterView);
      $('filterDownloadButton').addEventListener('click', exportFilterCsv);
      $('filterAddRuleButton').addEventListener('click', () => { readFilterControls(); addAdvancedFilterRule(); });
      ['filterDepartmentSelect', 'filterStartDate', 'filterEndDate', 'filterSearchInput', 'filterHideInactiveInput', 'filterHideHiddenInput'].forEach(id => {
        const el = $(id);
        if (!el) return;
        const eventName = id === 'filterSearchInput' ? 'input' : 'change';
        el.addEventListener(eventName, () => {
          readFilterControls();
          if (id === 'filterSearchInput') renderFilterView();
        });
      });
      bindCalculationToggle('filterIgnoreWeekendInput', 'weekend');
      bindCalculationToggle('filterIgnoreHolidayInput', 'holiday');
      $('filterRuleChips').addEventListener('click', event => {
        const button = event.target.closest('[data-filter-rule-remove]');
        if (button) removeAdvancedFilterRule(Number(button.dataset.filterRuleRemove));
      });
    }
    function updateFooterHours() {
      if ($('footerHours')) $('footerHours').textContent = `${hour(standardDailyHours())} saat / ${settings.workday.start || '08:00'}-${settings.workday.end || '17:45'} standart iş günü`;
    }
    function init() {
      $('sourceMeta').textContent = `${DATA.source} · ${DATA.generated_at}`;
      $('footerSource').textContent = DATA.source;
      $('footerFiili').textContent = DATA.fiili_source ? `${DATA.fiili_source} · ${num(DATA.people_in_fiili)} eşleşen / ${num(DATA.people_not_in_fiili)} eşleşmeyen sicil` : 'Kullanılamadı';
      $('footerCoverage').textContent = `${num(DATA.rows_source)} PDKS satırı · ${num(DATA.people_source)} benzersiz sicil · ${DATA.months.map(monthLabel).join(', ')}`;
      updateFooterHours();
      $('logicNote').textContent = `${DATA.logic.arrival} ${DATA.logic.home} ${DATA.logic.actual} ${DATA.logic.expected} ${DATA.logic.difference}`;
      setYearOptions('yearSelect', state.year, 'Tüm yıllar');
      setYearOptions('personYearSelect', state.personYear, 'Tüm yıllar');
      setYearOptions('trackingYearSelect', state.trackingYear, 'Tüm yıllar');
      rebuildDerivedMetrics();
      refreshDepartmentOptions();
      $('departmentSelect').addEventListener('change', event => { state.department = event.target.value; render(); });
      $('yearSelect').addEventListener('change', event => { state.year = event.target.value; render(); });
      $('searchInput').addEventListener('input', event => { state.query = event.target.value; render(); });
      $('hideInactiveInput').addEventListener('change', event => { state.hideInactive = event.target.checked; render(); });
      $('hideHiddenInput').checked = state.hideHidden;
      $('hideHiddenInput').addEventListener('change', event => { state.hideHidden = event.target.checked; render(); });
      bindCalculationToggle('ignoreWeekendInput', 'weekend');
      bindCalculationToggle('ignoreHolidayInput', 'holiday');
      $('downloadButton').addEventListener('click', exportCsv);
      $('excelDownloadButton').addEventListener('click', exportStyledExcel);
      $('personDetailSearch').addEventListener('input', event => { resetPersonDayTableState(); state.personQuery = event.target.value; renderPersonOptions(); renderPersonDetail(); });
      $('personDetailSelect').addEventListener('change', event => { resetPersonDayTableState(); state.personSicil = event.target.value; renderPersonDetail(); });
      $('personYearSelect').addEventListener('change', event => { resetPersonDayTableState(); state.personYear = event.target.value; renderPersonDetail(); });
      $('personHideInactiveInput').checked = state.personHideInactive;
      $('personHideHiddenInput').checked = state.personHideHidden;
      $('personHideInactiveInput').addEventListener('change', event => { resetPersonDayTableState(); state.personHideInactive = event.target.checked; renderPersonOptions(); renderPersonDetail(); });
      $('personHideHiddenInput').addEventListener('change', event => { resetPersonDayTableState(); state.personHideHidden = event.target.checked; renderPersonOptions(); renderPersonDetail(); });
      bindCalculationToggle('personIgnoreWeekendInput', 'weekend');
      bindCalculationToggle('personIgnoreHolidayInput', 'holiday');
      $('trackingDepartmentSelect').addEventListener('change', event => { state.trackingDepartment = event.target.value; renderTracking(); });
      $('trackingYearSelect').addEventListener('change', event => { state.trackingYear = event.target.value; renderTracking(); });
      $('trackingLevelSelect').value = state.trackingLevel;
      $('trackingLevelSelect').addEventListener('change', event => { state.trackingLevel = event.target.value; renderTracking(); });
      $('trackingSearchInput').addEventListener('input', event => { state.trackingQuery = event.target.value; renderTracking(); });
      $('trackingHideInactiveInput').checked = state.trackingHideInactive;
      $('trackingHideHiddenInput').checked = state.trackingHideHidden;
      $('trackingHideInactiveInput').addEventListener('change', event => { state.trackingHideInactive = event.target.checked; renderTracking(); });
      $('trackingHideHiddenInput').addEventListener('change', event => { state.trackingHideHidden = event.target.checked; renderTracking(); });
      bindCalculationToggle('trackingIgnoreWeekendInput', 'weekend');
      bindCalculationToggle('trackingIgnoreHolidayInput', 'holiday');
      initFilterControls();
      document.querySelectorAll('.view-tab').forEach(tab => tab.addEventListener('click', () => {
        const viewId = tab.dataset.view;
        const hashMap = { settingsView: '#settings', personView: '#person', trackingView: '#tracking', filterView: '#filter', dashboardView: '#pdks' };
        history.replaceState(null, '', hashMap[viewId] || '#pdks');
        showView(viewId);
      }));
      $('matrixScrollTop').addEventListener('scroll', event => { $('matrixScroll').scrollLeft = event.target.scrollLeft; });
      $('matrixScroll').addEventListener('scroll', event => { $('matrixScrollTop').scrollLeft = event.target.scrollLeft; });
      window.addEventListener('resize', syncScrollWidth);
      bindSettingsEvents();
      renderSettings();
      render();
      const initialView = location.hash === '#settings' ? 'settingsView' : (location.hash === '#person' ? 'personView' : (location.hash === '#tracking' ? 'trackingView' : (location.hash === '#filter' ? 'filterView' : 'dashboardView')));
      showView(initialView);
    }
    init();
  </script>
</body>
</html>'''


def write_dashboard(payload: dict[str, Any], output_path: Path) -> None:
    payload_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    source_meta = f"{payload['source']} · {payload['generated_at']}"
    page = HTML_TEMPLATE.replace("__PAYLOAD__", payload_json).replace("__SOURCE_META__", html.escape(source_meta))
    temp_path = output_path.with_name(f".{output_path.name}.{os.getpid()}.tmp")
    try:
        temp_path.write_text(page, encoding="utf-8")
        temp_path.replace(output_path)
    finally:
        if temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="PDKS çalışma zamanı takip dashboardu üretir.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="PDKS Excel kaynağı")
    parser.add_argument("--fiili", type=Path, default=DEFAULT_FIILI, help="Aktif çalışan eşleştirmesi için fiili liste")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Üretilecek HTML dosyası")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_path = args.input.resolve()
    fiili_path = args.fiili.resolve()
    output_path = args.output.resolve()
    frame = load_pdks(input_path)
    fiili = load_fiili(fiili_path)
    work = prepare_records(frame)
    payload = aggregate_payload(work, fiili)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    write_dashboard(payload, output_path)
    size_mb = output_path.stat().st_size / (1024 * 1024)
    log(f"Dashboard üretildi: {output_path.name} ({size_mb:.2f} MB)")
    log(f"Kapsam: {payload['rows_source']:,} PDKS satırı · {payload['people_source']:,} benzersiz sicil · {len(payload['months'])} ay")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
