"""Akademi Dashboard tek dosyalık HTML üreticisi."""

from __future__ import annotations

import argparse
import math
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from dashboard_build_common import (
    build_current_employees,
    clean_status,
    clean_text,
    employee_lookup,
    first_col,
    json_safe,
    log,
    month_key,
    normalize_key,
    numeric,
    parse_datetime,
    safe_ratio,
    score_band,
    sicil_key,
    weighted_available_score,
    write_single_file_html,
)
from dashboard_analytics_v2 import (
    EDUCATION_WEIGHTS,
    aggregate_learning_people_v2,
    build_action_center,
    build_funnel_payload,
    build_store_bridge,
    canonical_history_frame,
    canonical_hgo_frame,
    canonical_scorecard_frame,
    learning_rates,
    status_flags,
)
from academy_dashboard_template import HTML_TEMPLATE as HTML_TEMPLATE_V2
from dashboard_paths import AKADEMI_DASHBOARD, ICMAL_XLSX, PROJECT_ROOT


BASE_DIR = PROJECT_ROOT
DEFAULT_XLSX = ICMAL_XLSX
DEFAULT_OUTPUT = AKADEMI_DASHBOARD
STORE_WEIGHTS = {
    "academy": 25.0,
    "enocta": 20.0,
    "mandatory": 20.0,
    "isg": 15.0,
    "checklist": 10.0,
    "turnover": 10.0,
}
PERSON_WEIGHTS = {
    "academy": 20.0,
    "enocta": 25.0,
    "mandatory": 25.0,
    "isg": 15.0,
    "checklist": 15.0,
}
DISCIPLINE_CODE_MAP = {
    "C001": "Uyarı",
    "C002": "Kınama",
    "C003": "Ağır Kınama",
    "C004": "Ücret İndirimi",
    "C005": "Unvan İndirimi",
    "C006": "Tazminatsız İş Akdi Feshi",
    "C007": "Tazminatlı İş Akdi Feshi",
    "C008": "Mali Ceza",
    "C009": "Disiplin Cezası",
    "C010": "Yazılı Uyarı",
    "C011": "Sözlü Uyarı",
    "C012": "İhtar",
    "C019": "Savunma",
    "C999": "Diğer",
}


def read_selected(xl: pd.ExcelFile, sheet: str, keys: set[str] | None = None) -> pd.DataFrame:
    if sheet not in xl.sheet_names:
        log(f"UYARI: Sheet bulunamadı: {sheet}")
        return pd.DataFrame()
    log(f"Sheet okunuyor: {sheet}")
    if keys is None:
        frame = pd.read_excel(xl, sheet_name=sheet)
    else:
        frame = pd.read_excel(xl, sheet_name=sheet, usecols=lambda col: normalize_key(col) in keys)
    log(f"Sheet okundu: {sheet} ({len(frame):,} satır, {len(frame.columns):,} kolon)")
    return frame


def canonical_event_frame(source: pd.DataFrame, kind: str) -> pd.DataFrame:
    if source.empty:
        return pd.DataFrame()
    if kind == "enocta":
        candidates = {
            "sicil": ["sicil", "kullanıcı_sicil", "kullanıcı sicil"],
            "event": ["etkinlik_adi", "etkinlik adı"],
            "status": ["tamamlama_durumu", "tamamlama durumu"],
            "minutes": ["izleme_dk", "net deneyim süresi (dk)", "toplam deneyim süresi (dk)"],
            "completion_pct": ["etkinlik_tamamlama_yuzdesi", "etkinlik tamamlama yüzdesi"],
            "score": ["puan", "puanı"],
            "assigned_at": ["atanma_tarihi", "atanma tarihi"],
            "started_at": ["baslama_tarihi", "başlama tarihi"],
            "completed_at": ["tamamlama_tarihi", "tamamlama tarihi"],
        }
    else:
        candidates = {
            "sicil": ["kullanıcı sicil", "KULLANICI SİCİL", "kullanıcı_sicil", "sicil"],
            "event": ["ETKİNLİK ADI", "etkinlik_adi", "etkinlik adı"],
            "status": ["TAMAMLAMA DURUMU", "tamamlama_durumu", "tamamlama durumu"],
            "minutes": ["NET DENEYİM SÜRESİ (dk)", "TOPLAM DENEYİM SÜRESİ (dk)"],
            "completion_pct": ["ETKİNLİK TAMAMLAMA YÜZDESİ", "etkinlik_tamamlama_yuzdesi"],
            "score": ["PUANI", "puan"],
            "assigned_at": ["ATANMA TARİHİ", "atanma_tarihi"],
            "started_at": ["BAŞLAMA TARİHİ", "baslama_tarihi"],
            "completed_at": ["TAMAMLAMA TARİHİ", "tamamlama_tarihi"],
        }
    out = pd.DataFrame(index=source.index)
    for target, names in candidates.items():
        col = first_col(source, names)
        out[target] = source[col] if col else None
    out["sicil"] = out["sicil"].map(sicil_key)
    out = out[out["sicil"].ne("")].copy()
    out["event"] = out["event"].map(clean_text)
    out["status"] = out["status"].map(clean_status)
    for col in ["minutes", "completion_pct", "score"]:
        out[col] = numeric(out[col])
    for col in ["assigned_at", "started_at", "completed_at"]:
        out[col] = parse_datetime(out[col])
    out["activity_at"] = out[["completed_at", "started_at", "assigned_at"]].max(axis=1)
    return out


def aggregate_learning_people(events: pd.DataFrame, employees: pd.DataFrame, prefix: str) -> pd.DataFrame:
    return aggregate_learning_people_v2(events, employees, prefix)


def build_isg_people(source: pd.DataFrame, employees: pd.DataFrame) -> pd.DataFrame:
    if source.empty:
        return pd.DataFrame()
    sicil_col = first_col(source, ["P_NO", "sicil", "sicil_no"])
    status_col = first_col(source, ["Katılım Durumu", "katilim_durumu", "durum"])
    if not sicil_col:
        return pd.DataFrame()
    work = pd.DataFrame({"sicil": source[sicil_col].map(sicil_key)})
    work["status"] = source[status_col].map(clean_status) if status_col else "Belirsiz"
    work = work[work["sicil"].ne("")]
    priority = {"Tamamladı": 4, "Muaf": 3, "Devam Ediyor": 2, "Katılmadı": 1, "Belirsiz": 0}
    work["priority"] = work["status"].map(priority).fillna(0)
    work = work.sort_values(["sicil", "priority"]).drop_duplicates("sicil", keep="last")
    return employees.merge(work[["sicil", "status"]].rename(columns={"status": "isg_status"}), on="sicil", how="left")


def build_checklist_people(source: pd.DataFrame, employees: pd.DataFrame) -> pd.DataFrame:
    if source.empty:
        out = employees.copy()
        out["assigned"] = 0
        out["completed"] = 0
        return out
    sicil_col = first_col(source, ["Sicil Numarası", "sicil", "Kullanıcı Kodu"])
    status_col = first_col(source, ["Tamamlama Durumu", "tamamlama_durumu"])
    if not sicil_col:
        return pd.DataFrame()
    work = pd.DataFrame({"sicil": source[sicil_col].map(sicil_key)})
    work["status"] = source[status_col].map(clean_status) if status_col else "Belirsiz"
    work = work[work["sicil"].ne("")]
    flags = work["status"].map(status_flags)
    work["completed_flag"] = flags.map(lambda item: item[1])
    work["exempt_flag"] = flags.map(lambda item: item[2])
    grouped = work.groupby("sicil", as_index=False).agg(
        assigned=("status", "size"), completed=("completed_flag", "sum"), exempt=("exempt_flag", "sum")
    )
    rates = grouped.apply(lambda row: learning_rates(row.assigned, row.completed, row.exempt), axis=1)
    grouped["completion_rate"] = rates.map(lambda item: item[0])
    grouped["compliance_rate"] = rates.map(lambda item: item[1])
    return employees.merge(grouped, on="sicil", how="left")


def sales_eligible(employee: dict[str, Any]) -> bool:
    if employee.get("scope") != "Mağaza":
        return False
    kadro = normalize_key(employee.get("kadro"))
    unvan = normalize_key(employee.get("unvan"))
    engel = normalize_key(employee.get("engel"))
    return (
        any(token in kadro for token in ["belirsiz sureli", "part time personel", "part tme personel"])
        and "saglikli" in engel
        and unvan not in {"temizlik elemani", "eleman"}
        and "aurelia merkez" not in normalize_key(employee.get("magaza"))
    )


def build_sales_summary(rows: pd.DataFrame) -> dict[str, Any]:
    empty = {
        "latest_month": None,
        "selected_month": {"baslangic": [], "satis": [], "yonetici": []},
        "monthly": {"baslangic": [], "satis": [], "yonetici": []},
        "overall": {"baslangic": [], "satis": [], "yonetici": []},
    }
    if rows.empty:
        return empty

    work = rows.copy()
    status_col = first_col(work, ["katilim_durumu", "katılım durumu"])
    date_col = first_col(work, ["donem", "egitim_tarihi", "başlangıç tarihi"])
    education_col = first_col(work, ["egitim_donemi", "egitim_adi"])
    expert_col = first_col(work, ["uzman_yonetici", "uzman yönetici"])
    division_col = first_col(work, ["bolum_group", "bolum", "magaza_bayi_part"])
    employment_col = first_col(work, ["calisma_group", "calisma_durumu"])
    if not status_col or not date_col or not division_col or not employment_col:
        return empty

    work["__month"] = month_key(work[date_col])
    work["__status"] = work[status_col].map(normalize_key)
    work["__education"] = work[education_col].map(normalize_key) if education_col else ""
    work["__expert"] = work[expert_col].map(normalize_key) if expert_col else ""

    def classify_division(value: Any) -> str:
        key = normalize_key(value)
        if "magaza" in key:
            return "magaza"
        if "bayi" in key:
            return "bayi"
        return ""

    def classify_employment(value: Any) -> str:
        key = normalize_key(value)
        if "cikis" in key or "ayril" in key:
            return "cikis"
        if "calis" in key or "aktif" in key:
            return "calisiyor"
        return ""

    work["__division"] = work[division_col].map(classify_division)
    work["__employment"] = work[employment_col].map(classify_employment)
    work = work[
        work["__status"].eq("katildi")
        & work["__month"].notna()
        & work["__division"].ne("")
        & work["__employment"].ne("")
    ].copy()
    if work.empty:
        return empty

    def program_rows(program: str) -> pd.DataFrame:
        if program == "baslangic":
            return work[work["__education"].str.contains("baslangic", na=False)]
        if program == "satis":
            return work[
                work["__expert"].str.contains("satis akademisi", na=False)
                & ~work["__expert"].str.contains("yonetici", na=False)
            ]
        if program == "yonetici":
            return work[work["__expert"].str.contains("yonetici", na=False)]
        return work.iloc[0:0]

    def table_rows(source: pd.DataFrame) -> list[dict[str, Any]]:
        if source.empty:
            return []
        counts = source.groupby(["__division", "__employment"]).size().unstack(fill_value=0)
        result: list[dict[str, Any]] = []
        for key, label in [("bayi", "Bayi"), ("magaza", "Mağaza")]:
            if key not in counts.index:
                continue
            working = int(counts.loc[key].get("calisiyor", 0))
            exited = int(counts.loc[key].get("cikis", 0))
            total = working + exited
            result.append(
                {
                    "bolum": label,
                    "calisiyor": working,
                    "cikis": exited,
                    "toplam": total,
                    "cikis_pay": safe_ratio(exited, total) or 0.0,
                }
            )
        working = sum(row["calisiyor"] for row in result)
        exited = sum(row["cikis"] for row in result)
        total = working + exited
        result.append(
            {
                "bolum": "Toplam",
                "calisiyor": working,
                "cikis": exited,
                "toplam": total,
                "cikis_pay": safe_ratio(exited, total) or 0.0,
            }
        )
        return result

    months = sorted(work["__month"].dropna().unique())
    latest_month = months[-1] if months else None
    selected: dict[str, list[dict[str, Any]]] = {}
    monthly: dict[str, list[dict[str, Any]]] = {}
    overall: dict[str, list[dict[str, Any]]] = {}
    for program in ["baslangic", "satis", "yonetici"]:
        program_data = program_rows(program)
        overall[program] = table_rows(program_data)
        selected[program] = table_rows(program_data[program_data["__month"].eq(latest_month)]) if latest_month else []
        monthly[program] = []
        for month in months:
            for row in table_rows(program_data[program_data["__month"].eq(month)]):
                monthly[program].append({"month": month, **row})
    return {"latest_month": latest_month, "selected_month": selected, "monthly": monthly, "overall": overall}


def build_sales_data(
    sales: pd.DataFrame,
    non_attending: pd.DataFrame,
    long_no_training: pd.DataFrame,
    employees: pd.DataFrame,
) -> dict[str, Any]:
    emp_lookup = employee_lookup(employees)
    rows = sales.copy()
    uid_cols = [col for col in rows.columns if normalize_key(col) == "uid"]
    rows = rows.drop(columns=uid_cols, errors="ignore")
    if not rows.empty:
        sicil_col = first_col(rows, ["sicil", "sicil_no", "P_NO"])
        if sicil_col:
            rows["sicil"] = rows[sicil_col].map(sicil_key)
        for col in rows.select_dtypes(include=["object", "string"]).columns:
            rows[col] = rows[col].map(clean_text)
        status_col = first_col(rows, ["katilim_durumu", "katılım durumu"])
        mezun_col = first_col(rows, ["mezun", "mezuniyet"])
        if status_col:
            rows[status_col] = rows[status_col].map(clean_status)
    else:
        sicil_col = None
        status_col = None
        mezun_col = None

    summary = build_sales_summary(rows)
    registered: set[str] = set()
    attended: set[str] = set()
    graduated: set[str] = set()
    latest_any: dict[str, dict[str, Any]] = {}
    latest_attended: dict[str, dict[str, Any]] = {}
    if not rows.empty and sicil_col:
        date_col = first_col(rows, ["donem", "egitim_tarihi", "başlangıç tarihi"])
        channel_col = first_col(rows, ["bolum_group", "bolum", "magaza_bayi_part"])
        tracking_rows = rows.copy()
        if channel_col:
            channel_key = tracking_rows[channel_col].map(normalize_key)
            tracking_rows = tracking_rows[channel_key.str.contains("magaza", na=False)].copy()
        tracking_rows["__row_order"] = np.arange(len(tracking_rows))
        registered = set(tracking_rows["sicil"].dropna())
        if mezun_col:
            mezun_key = tracking_rows[mezun_col].map(normalize_key)
            mezun_mask = mezun_key.map(
                lambda value: ("mezun" in value or value in {"evet", "true", "1"})
                and "degil" not in value and "hayir" not in value and "false" not in value
            )
            graduated = set(tracking_rows.loc[mezun_mask, "sicil"].dropna())
        if date_col:
            tracking_rows["__date"] = parse_datetime(tracking_rows[date_col])
        else:
            tracking_rows["__date"] = pd.NaT
        for rec in (
            tracking_rows.sort_values(["sicil", "__date", "__row_order"], na_position="first")
            .drop_duplicates("sicil", keep="last")
            .to_dict("records")
        ):
            latest_any[rec.get("sicil", "")] = rec
        if status_col:
            tracking_rows["__status_key"] = tracking_rows[status_col].map(normalize_key)
            attended_rows = tracking_rows[tracking_rows["__status_key"].eq("katildi")].copy()
            attended = set(attended_rows["sicil"].dropna())
            for rec in (
                attended_rows.sort_values(["sicil", "__date", "__row_order"], na_position="first")
                .drop_duplicates("sicil", keep="last")
                .to_dict("records")
            ):
                latest_attended[rec.get("sicil", "")] = rec

    registry: list[dict[str, Any]] = []
    for employee in employees.to_dict("records"):
        if not sales_eligible(employee):
            continue
        key = employee["sicil"]
        latest = latest_attended.get(key, {})
        latest_registration = latest_any.get(key, {})
        if key in attended:
            status = "Katıldı"
            education_source = latest
        elif key in registered:
            status = "Kayıt var, katılım yok"
            education_source = latest_registration
        else:
            status = "Hiç Satış Akademisine Kayıt Olmadı"
            education_source = {}
        unvan_key = normalize_key(employee.get("unvan"))
        program = "Yönetici" if unvan_key in {"magaza muduru", "magaza mudur yardimcisi", "magaza ikinci muduru"} else "Satış Danışmanı"
        registry.append(
            {
                **{name: employee.get(name) for name in ["sicil", "ad_soyad", "scope", "ust_bolum", "departman", "magaza", "bolge", "il", "title", "gorev", "unvan", "kadro", "kidem_yili"]},
                "egitim_durumu": status,
                "mezuniyet": "Mezun" if key in graduated else "Mezun Değil",
                "program": program,
                "son_katildigi_egitim": education_source.get(first_col(rows, ["egitim_donemi", "egitim_adi"]) or ""),
                "son_katildigi_egitim_tarihi": education_source.get(first_col(rows, ["donem", "egitim_tarihi"]) or ""),
            }
        )

    long_rows: list[dict[str, Any]] = []
    if not long_no_training.empty:
        long_sicil = first_col(long_no_training, ["sicil", "sicil_no"])
        for rec in long_no_training.to_dict("records"):
            key = sicil_key(rec.get(long_sicil)) if long_sicil else ""
            emp = emp_lookup.get(key, {})
            long_rows.append({**rec, **{k: emp.get(k) for k in ["scope", "ust_bolum", "departman", "magaza", "bolge", "il", "title", "gorev", "unvan"]}, "sicil": key})

    hidden = {"__status_key", "__date", "__row_order", "month", "ay"}
    record_columns = [col for col in rows.columns if col not in hidden]
    record_rows = rows[record_columns].to_dict("records") if not rows.empty else []
    group_col = first_col(rows, ["grup_no", "grup"]) if not rows.empty else None
    education_col = first_col(rows, ["egitim_donemi", "egitim_adi"]) if not rows.empty else None
    group_options = sorted({clean_text(v) for v in rows[group_col].dropna()} if group_col else set(), key=normalize_key)
    education_names = sorted({clean_text(v) for v in rows[education_col].dropna()} if education_col else set(), key=education_order)
    if "7. Ay Eğitimi" not in education_names:
        education_names.append("7. Ay Eğitimi")
        education_names.sort(key=education_order)
    return {
        "records": record_rows,
        "record_columns": record_columns,
        "registry": registry,
        "summary": summary,
        "long_no_training": long_rows,
        "group_options": group_options,
        "education_names": education_names,
    }


def education_order(value: Any) -> tuple[int, str]:
    key = normalize_key(value)
    if "baslangic" in key:
        return (0, key)
    match = __import__("re").search(r"(\d+)\s*ay", key)
    return (int(match.group(1)) if match else 9000, key)


def build_turnover(source: pd.DataFrame) -> dict[str, Any]:
    if source.empty:
        return {"months": [], "rows": [], "latest_month": None}
    store_col = first_col(source, ["isletme_adi", "mağaza", "store"])
    month_col = first_col(source, ["donem", "month"])
    if not store_col or not month_col:
        return {"months": [], "rows": [], "latest_month": None}
    work = pd.DataFrame({"store": source[store_col].map(clean_text), "month": month_key(source[month_col])})
    for target, names in {
        "exits": ["cikis", "çıkış"], "start": ["donem_basi", "dönem başı"], "end": ["donem_sonu", "dönem sonu"]
    }.items():
        col = first_col(source, names)
        work[target] = numeric(source[col]).fillna(0) if col else 0.0
    work = work[work["store"].str.contains(".GS.", regex=False, na=False) & work["month"].notna()].copy()
    work = work[work["month"] >= "2025-01"].copy()
    grouped = work.groupby(["month", "store"], as_index=False)[["exits", "start", "end"]].sum()
    grouped["avg_headcount"] = (grouped["start"] + grouped["end"]) / 2
    grouped["turnover"] = np.where(grouped["avg_headcount"] > 0, grouped["exits"] / grouped["avg_headcount"], np.nan)
    months = sorted(grouped["month"].dropna().unique())
    return {"months": months, "latest_month": months[-1] if months else None, "rows": grouped.to_dict("records")}


def turnover_points(rate: float | None) -> float | None:
    if rate is None or not math.isfinite(float(rate)):
        return None
    if abs(float(rate)) < 1e-12:
        return 100.0
    if rate < 0.10:
        return 80.0
    if rate < 0.20:
        return 60.0
    return 40.0


def academy_title_group(value: Any, scope: Any = None) -> str:
    """Use scope-aware, stable business title groups in academy views."""
    key = normalize_key(value)
    scope_key = normalize_key(scope)

    if scope_key == "magaza":
        if "magaza mudur" in key and not any(token in key for token in ["yardim", "yardimci", "ikinci", "2"]):
            return "Mağaza Müdürü"
        if "magaza ikinci" in key or ("magaza mudur" in key and any(token in key for token in ["yardim", "yardimci", "ikinci", "2"])):
            return "Mağaza İkinci Müdürü"
        if "pasor" in key:
            return "Pasör Satış Danışmanı"
        if "part time" in key and "satis danismani" in key:
            return "Part Time Satış Danışmanı"
        if "satis danismani" in key or "corner" in key:
            return "Satış Danışmanı"
        if "kasiyer" in key:
            return "Kasiyer"
        if "magaza destek" in key or "depo" in key:
            return "Mağaza Destek Elemanı"
        if "temizlik" in key:
            return "Temizlik Elemanı"
        return "Diğer Mağaza"

    if "genel mudur" in key:
        return "Genel Müdür"
    if "direktor" in key:
        return "Direktör"
    if "mudur" in key:
        return "Müdür"
    if any(token in key for token in ["yonetici", "yonetmen", "sorumlu", "sef", "supervisor", "lead", "grup lider"]):
        return "Yönetici"
    if "kidemli uzman" in key:
        return "Kıdemli Uzman"
    if "uzman" in key:
        return "Uzman"
    if scope_key == "merkez":
        return "Uzman Yardımcısı / Memur / Eleman"
    if scope_key == "edirne":
        if "stajyer" in key:
            return "Stajyer"
        if any(token in key for token in ["operator", "teknisyen", "kalite", "modelist", "manken"]):
            return "Operatör / Teknik"
        return "Eleman / Diğer"
    if "eleman" in key or "memur" in key or "asistan" in key or "assistant" in key:
        return "Uzman Yardımcısı / Memur / Eleman"
    return clean_text(value) or "Diğer"




def build_scores(
    employees: pd.DataFrame,
    enocta_people: pd.DataFrame,
    mandatory_people: pd.DataFrame,
    isg_people: pd.DataFrame,
    checklist_people: pd.DataFrame,
    sales_registry: list[dict[str, Any]],
    turnover: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    enocta_map = enocta_people.set_index("sicil").to_dict("index") if not enocta_people.empty else {}
    mandatory_map = mandatory_people.set_index("sicil").to_dict("index") if not mandatory_people.empty else {}
    isg_map = isg_people.set_index("sicil").to_dict("index") if not isg_people.empty else {}
    checklist_map = checklist_people.set_index("sicil").to_dict("index") if not checklist_people.empty else {}
    sales_map = {str(row.get("sicil")): row for row in sales_registry}
    cutoff = pd.Timestamp("2024-12-10")
    person_rows: list[dict[str, Any]] = []
    for emp in employees.to_dict("records"):
        key = emp["sicil"]
        enocta = enocta_map.get(key, {})
        mandatory = mandatory_map.get(key, {})
        isg = isg_map.get(key, {})
        checklist = checklist_map.get(key, {})
        academy = sales_map.get(key)
        hire_date = parse_datetime(emp.get("ise_giris_tarihi"))
        checklist_applicable = bool(pd.notna(hire_date) and hire_date > cutoff)
        academy_score = None
        if academy:
            academy_score = 100.0 if normalize_key(academy.get("egitim_durumu")) == "katildi" else 0.0
        enocta_score = float(enocta.get("compliance_rate") * 100) if pd.notna(enocta.get("compliance_rate")) else None
        mandatory_score = float(mandatory.get("compliance_rate") * 100) if pd.notna(mandatory.get("compliance_rate")) else None
        isg_score = 100.0 if isg.get("isg_status") in {"Tamamladı", "Muaf"} else 0.0
        if checklist_applicable:
            checklist_score = float(checklist.get("compliance_rate") * 100) if pd.notna(checklist.get("compliance_rate")) else 0.0
        else:
            checklist_score = None
        components = {"academy": academy_score, "enocta": enocta_score, "mandatory": mandatory_score, "isg": isg_score, "checklist": checklist_score}
        total_score, metric_count = weighted_available_score(components, PERSON_WEIGHTS)
        available = [(label, value) for label, value in components.items() if value is not None]
        focus_key, focus_score = min(available, key=lambda item: item[1]) if available else ("", None)
        person_rows.append(
            {
                **{name: emp.get(name) for name in ["sicil", "ad_soyad", "scope", "ust_bolum", "departman", "magaza", "bolge", "il", "title", "gorev", "unvan", "kadro", "ise_giris_tarihi", "kidem_yili", "cinsiyet", "yaka"]},
                "academy_score": academy_score,
                "academy_status": academy.get("egitim_durumu") if academy else "Uygun değil / kayıt yok",
                "academy_graduate": academy.get("mezuniyet") if academy else "Mezun Değil",
                "academy_program": academy.get("program") if academy else None,
                "academy_last_training": academy.get("son_katildigi_egitim") if academy else None,
                "academy_last_training_date": academy.get("son_katildigi_egitim_tarihi") if academy else None,
                "enocta_score": enocta_score,
                "enocta_assigned": enocta.get("assigned", 0),
                "enocta_completed": enocta.get("completed", 0),
                "enocta_exempt": enocta.get("exempt", 0),
                "enocta_completion_rate": enocta.get("completion_rate"),
                "enocta_compliance_rate": enocta.get("compliance_rate"),
                "mandatory_score": mandatory_score,
                "mandatory_assigned": mandatory.get("assigned", 0),
                "mandatory_completed": mandatory.get("completed", 0),
                "mandatory_exempt": mandatory.get("exempt", 0),
                "mandatory_completion_rate": mandatory.get("completion_rate"),
                "mandatory_compliance_rate": mandatory.get("compliance_rate"),
                "isg_score": isg_score,
                "isg_status": isg.get("isg_status") or "Kayıt Yok",
                "checklist_score": checklist_score,
                "checklist_assigned": checklist.get("assigned", 0) if checklist_applicable else None,
                "checklist_completed": checklist.get("completed", 0) if checklist_applicable else None,
                "checklist_exempt": checklist.get("exempt", 0) if checklist_applicable else None,
                "academy_score_total": total_score,
                "metric_count": metric_count,
                "score_band": score_band(total_score),
                "focus": focus_key,
                "focus_score": focus_score,
            }
        )

    person_df = pd.DataFrame(person_rows)
    latest_month = turnover.get("latest_month")
    latest_turn = {
        normalize_key(row.get("store")): row
        for row in turnover.get("rows", [])
        if row.get("month") == latest_month
    }
    store_rows: list[dict[str, Any]] = []
    store_people = person_df[person_df["scope"].eq("Mağaza") & person_df["magaza"].astype(str).str.contains(".GS.", regex=False, na=False)].copy()
    for store, group in store_people.groupby("magaza", dropna=False):
        def ratio_from_counts(done_col: str, assigned_col: str, exempt_col: str | None = None) -> float | None:
            assigned = pd.to_numeric(group[assigned_col], errors="coerce").fillna(0).sum()
            done = pd.to_numeric(group[done_col], errors="coerce").fillna(0).sum()
            exempt = pd.to_numeric(group[exempt_col], errors="coerce").fillna(0).sum() if exempt_col and exempt_col in group else 0
            return safe_ratio(float(done + exempt), float(assigned))

        academy_values = pd.to_numeric(group["academy_score"], errors="coerce").dropna()
        academy_score = float(academy_values.mean()) if not academy_values.empty else None
        enocta_rate = ratio_from_counts("enocta_completed", "enocta_assigned", "enocta_exempt")
        mandatory_rate = ratio_from_counts("mandatory_completed", "mandatory_assigned", "mandatory_exempt")
        isg_score = float((group["isg_score"] >= 100).sum() / len(group) * 100) if len(group) else None
        checklist_rate = ratio_from_counts("checklist_completed", "checklist_assigned", "checklist_exempt")
        turn_row = latest_turn.get(normalize_key(store), {})
        turn_rate = turn_row.get("turnover")
        components = {
            "academy": academy_score,
            "enocta": None if enocta_rate is None else enocta_rate * 100,
            "mandatory": None if mandatory_rate is None else mandatory_rate * 100,
            "isg": isg_score,
            "checklist": None if checklist_rate is None else checklist_rate * 100,
            "turnover": turnover_points(turn_rate),
        }
        total_score, metric_count = weighted_available_score(components, STORE_WEIGHTS)
        available = [(label, value) for label, value in components.items() if value is not None]
        focus_key, focus_score = min(available, key=lambda item: item[1]) if available else ("", None)
        first = group.iloc[0]
        store_rows.append(
            {
                "magaza": store,
                "bolge": first.get("bolge"),
                "il": first.get("il"),
                "calisan": int(len(group)),
                "academy_score": academy_score,
                "enocta_score": components["enocta"],
                "mandatory_score": components["mandatory"],
                "isg_score": isg_score,
                "checklist_score": components["checklist"],
                "academy_assigned": int(group["academy_score"].notna().sum()),
                "academy_completed": int((group["academy_score"] >= 100).sum()),
                "enocta_assigned": float(pd.to_numeric(group["enocta_assigned"], errors="coerce").fillna(0).sum()),
                "enocta_completed": float(pd.to_numeric(group["enocta_completed"], errors="coerce").fillna(0).sum()),
                "enocta_exempt": float(pd.to_numeric(group["enocta_exempt"], errors="coerce").fillna(0).sum()),
                "mandatory_assigned": float(pd.to_numeric(group["mandatory_assigned"], errors="coerce").fillna(0).sum()),
                "mandatory_completed": float(pd.to_numeric(group["mandatory_completed"], errors="coerce").fillna(0).sum()),
                "mandatory_exempt": float(pd.to_numeric(group["mandatory_exempt"], errors="coerce").fillna(0).sum()),
                "checklist_assigned": float(pd.to_numeric(group["checklist_assigned"], errors="coerce").fillna(0).sum()),
                "checklist_completed": float(pd.to_numeric(group["checklist_completed"], errors="coerce").fillna(0).sum()),
                "checklist_exempt": float(pd.to_numeric(group["checklist_exempt"], errors="coerce").fillna(0).sum()),
                "turnover_rate": turn_rate,
                "turnover_score": components["turnover"],
                "academy_score_total": total_score,
                "metric_count": metric_count,
                "score_band": score_band(total_score),
                "focus": focus_key,
                "focus_score": focus_score,
            }
        )
    return store_rows, person_rows


def build_development_rows(gelisim_raw: pd.DataFrame, employees: pd.DataFrame) -> list[dict[str, Any]]:
    if gelisim_raw is None or gelisim_raw.empty or employees.empty:
        return []
    sicil_col = first_col(gelisim_raw, ["sicil", "sicil_no", "Kullanıcı Kodu", "Kullanici Kodu", "kullanıcı_kodu"])
    if not sicil_col:
        return []
    status_col = first_col(gelisim_raw, ["Tamamlama Durumu", "tamamlama_durumu", "durum"])
    oran_col = first_col(gelisim_raw, ["Durum Oran", "durum_oran", "durum oran", "Tamamlama Oranı", "tamamlama_orani"])
    event_col = first_col(gelisim_raw, ["Program", "Eğitim", "egitim_adi", "Etkinlik Adı", "etkinlik_adi"])
    performance_col = first_col(gelisim_raw, ["performans_notu", "performans notu"])
    completion_rate = numeric(gelisim_raw[oran_col]) if oran_col else pd.Series(np.nan, index=gelisim_raw.index)
    valid_rates = completion_rate.dropna()
    if not valid_rates.empty and float(valid_rates.abs().max()) <= 1.000001:
        completion_rate = completion_rate * 100
    work = pd.DataFrame({
        "sicil": gelisim_raw[sicil_col].map(sicil_key),
        "gelisim_yolculugu_durumu": gelisim_raw[status_col].map(clean_text) if status_col else "",
        "gelisim_yolculugu_oran": completion_rate.clip(lower=0, upper=100),
        "gelisim_yolculugu_program": gelisim_raw[event_col].map(clean_text) if event_col else "",
        "performans_notu": numeric(gelisim_raw[performance_col]) if performance_col else np.nan,
    })
    work["performans_harf_notu"] = work["performans_notu"].map(performance_letter_grade)
    work = work[work["sicil"].ne("")].drop_duplicates("sicil", keep="last")
    identity_cols = [
        "sicil", "ad_soyad", "scope", "ust_bolum", "magaza", "bolge", "il", "title",
        "gorev", "unvan", "kadro", "ise_giris_tarihi", "kidem_yili", "yas",
    ]
    identity = employees[[col for col in identity_cols if col in employees.columns]].drop_duplicates("sicil")
    out = work.merge(identity, on="sicil", how="left")
    return out.to_dict("records")


def performance_letter_grade(value: Any) -> str | None:
    score = pd.to_numeric(pd.Series([value]), errors="coerce").iloc[0]
    if pd.isna(score):
        return None
    score = float(score)
    if 0 <= score < 60:
        return "E"
    if 60 <= score < 70:
        return "D"
    if 70 <= score < 101:
        return "C"
    if 101 <= score < 110:
        return "B"
    if 110 <= score <= 120:
        return "A"
    return None


def build_latest_discipline_map(source: pd.DataFrame) -> dict[str, dict[str, Any]]:
    if source is None or source.empty:
        return {}
    sicil_col = first_col(source, ["PERNO", "perno", "sicil", "sicil_no"])
    date_col = first_col(source, ["ceza_tarihi", "TARIH", "tarih"])
    code_col = first_col(source, ["ceza_kodu", "OCKOD", "ockod"])
    type_col = first_col(source, ["ceza_adi", "ceza adı"])
    desc_col = first_col(source, ["ceza_aciklama", "ACIKLAMA", "açıklama"])
    if not sicil_col:
        return {}
    work = pd.DataFrame(index=source.index)
    work["sicil"] = source[sicil_col].map(sicil_key)
    work["ceza_tarihi"] = parse_datetime(source[date_col]) if date_col else pd.NaT
    work["ceza_kodu"] = source[code_col].map(lambda value: clean_text(value).upper()) if code_col else ""
    if type_col:
        work["ceza_turu"] = source[type_col].map(clean_text)
    else:
        work["ceza_turu"] = work["ceza_kodu"].map(DISCIPLINE_CODE_MAP).fillna("Diğer")
    work["ceza_aciklama"] = source[desc_col].map(clean_text) if desc_col else ""
    work = work[work["sicil"].ne("")].copy()
    if work.empty:
        return {}
    latest = (
        work.sort_values(["sicil", "ceza_tarihi"], na_position="first")
        .drop_duplicates("sicil", keep="last")
    )
    return {str(row["sicil"]): row for row in latest.to_dict("records")}


def build_promotion_readiness_rows(
    person_scores: list[dict[str, Any]],
    development_rows: list[dict[str, Any]],
    discipline_by_sicil: dict[str, dict[str, Any]] | None = None,
    reference_date: pd.Timestamp | None = None,
) -> list[dict[str, Any]]:
    if not person_scores:
        return []
    dev_by_sicil = {str(row.get("sicil")): row for row in development_rows}
    discipline_by_sicil = discipline_by_sicil or {}
    reference_date = pd.Timestamp(reference_date or pd.Timestamp.now()).normalize()
    rows: list[dict[str, Any]] = []
    for row in person_scores:
        if row.get("scope") != "Mağaza":
            continue
        title_key = normalize_key(row.get("title"))
        if not any(token in title_key for token in ["satis danismani", "pasor", "magaza ikinci", "magaza mudur"]):
            continue
        dev = dev_by_sicil.get(str(row.get("sicil")), {})
        academy_status = clean_text(row.get("academy_status"))
        academy_graduate = clean_text(row.get("academy_graduate"))
        academy_ready = normalize_key(academy_graduate) == "mezun"
        dev_rate = row.get("gelisim_yolculugu_oran", dev.get("gelisim_yolculugu_oran"))
        dev_status = clean_text(dev.get("gelisim_yolculugu_durumu"))
        dev_ready = (pd.notna(dev_rate) and float(dev_rate) >= 100) or ("tamam" in normalize_key(dev_status))
        performance_score = dev.get("performans_notu")
        performance_grade = clean_text(dev.get("performans_harf_notu")).upper()
        performance_ready = performance_grade in {"A", "B", "C"}
        tenure = row.get("kidem_yili")
        tenure_num = float(tenure) if tenure is not None and pd.notna(tenure) else np.nan
        current_title = clean_text(row.get("title"))
        target_role = "Mağaza Müdürü" if "magaza ikinci" in title_key or "mudur yardim" in title_key else "Mağaza İkinci Müdürü"
        min_tenure = 2.0 if target_role == "Mağaza Müdürü" else 1.0
        tenure_ready = pd.notna(tenure_num) and tenure_num >= min_tenure
        reasons = []
        if not tenure_ready:
            reasons.append(f"kıdem {min_tenure:g} yıl altında")
        if not dev_ready:
            reasons.append("Gelişim Yolculuğu tamamlanmadı")
        if not academy_ready:
            reasons.append("Satış Akademisi mezuniyet koşulu sağlanmıyor")
        if not performance_ready:
            reasons.append("performans harf notu C ve üzeri değil")
        discipline = discipline_by_sicil.get(str(row.get("sicil")), {})
        discipline_date = pd.to_datetime(discipline.get("ceza_tarihi"), errors="coerce") if discipline else pd.NaT
        if discipline and pd.isna(discipline_date):
            reasons.append("son ceza tarihi eksik")
        days_since_discipline = None
        if not pd.isna(discipline_date):
            days_since_discipline = int((reference_date - discipline_date.normalize()).days)
            if days_since_discipline < 365:
                reasons.append("son cezanın üzerinden 1 yıl geçmedi")
        status = "Uygun" if not reasons else "Uygun Değil"
        if discipline:
            discipline_parts = [
                clean_text(discipline.get("ceza_turu")),
                discipline_date.date().isoformat() if not pd.isna(discipline_date) else "",
                clean_text(discipline.get("ceza_aciklama")),
            ]
            discipline_note = "Son ceza/disiplin kaydı: " + " - ".join(part for part in discipline_parts if part)
            if days_since_discipline is not None:
                discipline_note += f" ({days_since_discipline} gün önce)"
        else:
            discipline_note = "Ceza/disiplin kaydı yok"
        rule_note = "; ".join(reasons) if reasons else "Kıdem, performans, Satış Akademisi mezuniyeti ve Gelişim Yolculuğu koşulları sağlanıyor"
        rows.append({
            "sicil": row.get("sicil"),
            "ad_soyad": row.get("ad_soyad"),
            "bolge": row.get("bolge") or row.get("ust_bolum"),
            "magaza": row.get("magaza"),
            "il": row.get("il"),
            "mevcut_title": current_title,
            "hedef_rol": target_role,
            "kidem_yili": tenure,
            "satis_akademisi": academy_graduate,
            "satis_akademisi_katilim": academy_status,
            "gelisim_yolculugu_durumu": dev_status,
            "gelisim_yolculugu_oran": dev_rate,
            "performans_notu": performance_score,
            "performans_harf_notu": performance_grade or None,
            "akademi_puani": row.get("academy_score_total"),
            "son_ceza_tarihi": discipline_date.date().isoformat() if not pd.isna(discipline_date) else None,
            "son_ceza_turu": discipline.get("ceza_turu") if discipline else None,
            "son_ceza_aciklama": discipline.get("ceza_aciklama") if discipline else None,
            "terfiye_uygunluk": status,
            "not": f"{rule_note} | {discipline_note}",
        })
    return rows


def canonical_sales_events(source: pd.DataFrame) -> pd.DataFrame:
    """Map Sales Academy attendance rows to the common learning-event schema."""
    if source is None or source.empty:
        return pd.DataFrame()
    sicil_col = first_col(source, ["sicil", "sicil_no", "P_NO"])
    event_col = first_col(source, ["egitim_donemi", "egitim_adi"])
    status_col = first_col(source, ["katilim_durumu", "katılım durumu"])
    mezun_col = first_col(source, ["mezun", "Mezun", "mezuniyet"])
    date_col = first_col(source, ["donem", "egitim_tarihi", "başlangıç tarihi"])
    if not sicil_col or not event_col:
        return pd.DataFrame()
    out = pd.DataFrame(index=source.index)
    out["sicil"] = source[sicil_col].map(sicil_key)
    out["event"] = source[event_col].map(clean_text)
    base_status = source[status_col].map(clean_status) if status_col else pd.Series("Belirsiz", index=source.index)
    if mezun_col:
        mezun_key = source[mezun_col].map(normalize_key)
        mezun_flag = mezun_key.map(lambda value: ("mezun" in value or value in {"evet", "true", "1"}) and "degil" not in value and "hayir" not in value and "false" not in value)
        attended_flag = base_status.map(normalize_key).isin(["katildi", "tamamladi", "tamamlandi"])
        out["status"] = np.where(mezun_flag, "Tamamladı", np.where(attended_flag, "Devam Ediyor", base_status))
    else:
        mezun_flag = base_status.map(normalize_key).isin(["katildi", "tamamladi", "tamamlandi"])
        out["status"] = base_status
    event_date = parse_datetime(source[date_col]) if date_col else pd.Series(pd.NaT, index=source.index)
    out["assigned_at"] = event_date
    out["started_at"] = event_date.where(mezun_flag | out["status"].map(normalize_key).isin(["devam ediyor", "devam"]))
    out["completed_at"] = event_date.where(mezun_flag)
    out["activity_at"] = event_date
    out["minutes"] = np.nan
    out["completion_pct"] = np.where(mezun_flag, 100.0, 0.0)
    out["score"] = np.nan
    return out[out["sicil"].ne("") & out["event"].ne("")]


def canonical_exam_name(value: Any) -> str:
    text = clean_text(value)
    key = normalize_key(text)
    match = pd.Series([key]).str.extract(r"(\d+)\s*\.?\s*ay", expand=False).iloc[0]
    if pd.notna(match):
        suffix = " Final" if "final" in key else ""
        return f"{int(match)}. Ay{suffix}"
    return text or "Belirsiz Sınav"


def exam_score_band(value: Any) -> str:
    if value is None or pd.isna(value):
        return "Girmedi"
    score = float(value)
    if score < 60:
        return "0-59"
    if score < 70:
        return "60-69"
    if score < 80:
        return "70-79"
    if score < 90:
        return "80-89"
    return "90-100"


def build_exam_score_data(
    source: pd.DataFrame,
    employees: pd.DataFrame,
    *,
    source_label: str = "icmal_sorgu_sonuc.xlsx / sinav_puanlari",
) -> dict[str, Any]:
    """Prepare transparent exam analytics without inventing a missing time axis."""

    empty = {
        "raw_record_count": 0,
        "analysis_record_count": 0,
        "exact_duplicate_count": 0,
        "unique_people": 0,
        "source_label": source_label,
        "records": [],
        "person_exam": [],
        "people": [],
        "exam_names": [],
        "score_bands": ["Girmedi", "0-59", "60-69", "70-79", "80-89", "90-100"],
        "notes": [
            "Kaynakta sınav tarihi bulunmadığı için aylık trend veya son sınav yorumu üretilmez.",
            "Birebir aynı kayıtların ilki hesaba alınır; sonraki kopyalar detay tabloda işaretlenir.",
        ],
    }
    if source is None or source.empty:
        return empty

    code_col = first_col(source, ["Kullanıcı Kodu", "Kullanici Kodu", "sicil", "sicil_no"])
    first_name_col = first_col(source, ["Adı", "Adi", "ad"])
    last_name_col = first_col(source, ["Soyadı", "Soyadi", "soyad"])
    score_col = first_col(source, ["Puanı", "Puani", "puan", "score"])
    exam_col = first_col(source, ["Sınav", "Sinav", "sınav adı", "sinav adi"])
    if not code_col or not score_col or not exam_col:
        missing = [
            label
            for label, col in [("Kullanıcı Kodu", code_col), ("Puanı", score_col), ("Sınav", exam_col)]
            if not col
        ]
        raise ValueError("sinav_puanlari kolonları eksik: " + ", ".join(missing))

    work = pd.DataFrame(index=source.index)
    work["kaynak_satir"] = np.arange(2, len(source) + 2)
    work["sicil"] = source[code_col].map(sicil_key)
    first_names = source[first_name_col].map(clean_text) if first_name_col else pd.Series("", index=source.index)
    last_names = source[last_name_col].map(clean_text) if last_name_col else pd.Series("", index=source.index)
    work["kaynak_ad_soyad"] = (
        first_names.fillna("").astype(str).str.strip() + " " + last_names.fillna("").astype(str).str.strip()
    ).str.strip()
    work["sinav"] = source[exam_col].map(canonical_exam_name)
    work["puan_raw"] = source[score_col].map(clean_text)
    score_text = work["puan_raw"].astype("string").str.replace(",", ".", regex=False).str.strip()
    work["puan"] = pd.to_numeric(score_text, errors="coerce")
    work["sinav_durumu"] = np.where(work["puan"].notna(), "Sınava Girdi", "Girmedi")
    work["puan_dilimi"] = work["puan"].map(exam_score_band)
    work = work[work["sicil"].ne("")].copy()

    duplicate_key = pd.DataFrame(
        {
            "sicil": work["sicil"],
            "ad": work["kaynak_ad_soyad"].map(normalize_key),
            "sinav": work["sinav"].map(normalize_key),
            "puan": work["puan_raw"].map(normalize_key),
        },
        index=work.index,
    )
    work["birebir_mukerrer"] = duplicate_key.duplicated(keep=False)
    work["hesaba_dahil"] = ~duplicate_key.duplicated(keep="first")

    profile_columns = [
        "sicil", "ad_soyad", "scope", "ust_bolum", "departman", "magaza",
        "bolge", "il", "title", "gorev", "unvan", "kadro", "kidem_yili",
    ]
    profile = employees[[col for col in profile_columns if col in employees.columns]].copy()
    if "ad_soyad" in profile.columns:
        profile = profile.rename(columns={"ad_soyad": "fiili_ad_soyad"})
    work = work.merge(profile, on="sicil", how="left")
    if "fiili_ad_soyad" not in work.columns:
        work["fiili_ad_soyad"] = ""
    work["ad_soyad"] = work["fiili_ad_soyad"].where(
        work["fiili_ad_soyad"].fillna("").astype(str).str.strip().ne(""),
        work["kaynak_ad_soyad"],
    )
    work["calisan_durumu"] = np.where(
        work["fiili_ad_soyad"].fillna("").astype(str).str.strip().ne(""),
        "Aktif",
        "Fiili Listede Yok",
    )
    for col in ["scope", "ust_bolum", "departman", "magaza", "bolge", "il", "title", "gorev", "unvan", "kadro"]:
        if col not in work.columns:
            work[col] = ""
        work[col] = work[col].fillna("").map(clean_text)

    analysis = work[work["hesaba_dahil"]].copy()
    person_exam_rows: list[dict[str, Any]] = []
    for (sicil, exam), group in analysis.groupby(["sicil", "sinav"], sort=False, dropna=False):
        numeric_scores = group["puan"].dropna()
        first = group.iloc[0]
        person_exam_rows.append(
            {
                "sicil": sicil,
                "ad_soyad": first["ad_soyad"],
                "scope": first.get("scope", ""),
                "ust_bolum": first.get("ust_bolum", ""),
                "departman": first.get("departman", ""),
                "magaza": first.get("magaza", ""),
                "bolge": first.get("bolge", ""),
                "il": first.get("il", ""),
                "title": first.get("title", ""),
                "sinav": exam,
                "kayit_sayisi": int(len(group)),
                "sinava_giris_sayisi": int(numeric_scores.size),
                "girmedi_sayisi": int(group["puan"].isna().sum()),
                "ortalama_puan": float(numeric_scores.mean()) if not numeric_scores.empty else None,
                "en_yuksek_puan": float(numeric_scores.max()) if not numeric_scores.empty else None,
                "en_dusuk_puan": float(numeric_scores.min()) if not numeric_scores.empty else None,
                "yetmis_ve_uzeri": bool((numeric_scores >= 70).any()) if not numeric_scores.empty else False,
                "doksan_ve_uzeri": bool((numeric_scores >= 90).any()) if not numeric_scores.empty else False,
                "sinav_durumu": "Sınava Girdi" if not numeric_scores.empty else "Girmedi",
                "calisan_durumu": first["calisan_durumu"],
            }
        )
    person_exam = pd.DataFrame(person_exam_rows)

    people_rows: list[dict[str, Any]] = []
    if not person_exam.empty:
        for sicil, group in person_exam.groupby("sicil", sort=False):
            first = group.iloc[0]
            scores = group["en_yuksek_puan"].dropna()
            people_rows.append(
                {
                    "sicil": sicil,
                    "ad_soyad": first["ad_soyad"],
                    "scope": first.get("scope", ""),
                    "ust_bolum": first.get("ust_bolum", ""),
                    "departman": first.get("departman", ""),
                    "magaza": first.get("magaza", ""),
                    "bolge": first.get("bolge", ""),
                    "il": first.get("il", ""),
                    "title": first.get("title", ""),
                    "sinav_sayisi": int(group["sinav"].nunique()),
                    "girdigi_sinav_sayisi": int(group["en_yuksek_puan"].notna().sum()),
                    "girmedigi_sinav_sayisi": int(group["en_yuksek_puan"].isna().sum()),
                    "ortalama_puan": float(scores.mean()) if not scores.empty else None,
                    "en_yuksek_puan": float(scores.max()) if not scores.empty else None,
                    "yetmis_ve_uzeri_sinav": int(group["yetmis_ve_uzeri"].sum()),
                    "doksan_ve_uzeri_sinav": int(group["doksan_ve_uzeri"].sum()),
                    "sinavlar": ", ".join(sorted(group["sinav"].dropna().astype(str).unique(), key=normalize_key)),
                    "calisan_durumu": first["calisan_durumu"],
                }
            )

    record_columns = [
        "kaynak_satir", "sicil", "ad_soyad", "sinav", "puan_raw", "puan",
        "sinav_durumu", "puan_dilimi", "calisan_durumu", "scope", "ust_bolum",
        "departman", "magaza", "bolge", "il", "title", "gorev", "unvan",
        "kadro", "kidem_yili", "birebir_mukerrer", "hesaba_dahil",
    ]
    records = work[[col for col in record_columns if col in work.columns]].copy()
    records["birebir_mukerrer"] = records["birebir_mukerrer"].map(lambda value: "Evet" if value else "Hayır")
    records["hesaba_dahil"] = records["hesaba_dahil"].map(lambda value: "Evet" if value else "Hayır")

    return {
        **empty,
        "raw_record_count": int(len(work)),
        "analysis_record_count": int(len(analysis)),
        "exact_duplicate_count": int(len(work) - len(analysis)),
        "unique_people": int(analysis["sicil"].nunique()),
        "records": records.to_dict("records"),
        "person_exam": person_exam_rows,
        "people": people_rows,
        "exam_names": sorted(analysis["sinav"].dropna().unique(), key=normalize_key),
    }


def build_dashboard_data(xlsx_path: Path) -> dict[str, Any]:
    log(f"Akademi Dashboard verisi hazırlanıyor: {xlsx_path.name}")
    xl = pd.ExcelFile(xlsx_path)
    fiili = read_selected(xl, "fiili_list")
    employees = build_current_employees(fiili)
    if not employees.empty and "title" in employees.columns:
        employees["title_raw"] = employees["title"]
        employees["title"] = [
            academy_title_group(title, scope)
            for title, scope in zip(employees["title_raw"].tolist(), employees["scope"].tolist())
        ]
    active_keys = set(employees["sicil"])

    enocta_keys = {normalize_key(v) for v in ["izleme_dk", "sicil", "kullanıcı_sicil", "kullanıcı_adi", "kullanıcı_soyadi", "tamamlama_durumu", "etkinlik_adi", "tamamlama_tarihi", "atanma_tarihi", "baslama_tarihi", "etkinlik_tamamlama_yuzdesi", "puan"]}
    mandatory_keys = {normalize_key(v) for v in ["KULLANICI SİCİL", "ETKİNLİK ADI", "TAMAMLAMA DURUMU", "PUANI", "NET DENEYİM SÜRESİ (dk)", "ETKİNLİK TAMAMLAMA YÜZDESİ", "ATANMA TARİHİ", "BAŞLAMA TARİHİ", "TAMAMLAMA TARİHİ"]}
    enocta_raw = read_selected(xl, "enocta_tum_veri", enocta_keys)
    mandatory_raw = read_selected(xl, "zorunlu_egitim", mandatory_keys)
    checklist_raw = read_selected(xl, "check_list")
    isg_raw = read_selected(xl, "isg_veri")
    sales_raw = read_selected(xl, "satis_akademisi_takip")
    non_raw = read_selected(xl, "katilmayanlar_listesi")
    long_raw = read_selected(xl, "uzun_sure_egitim_yok")
    development_raw = read_selected(xl, "gelisim_yolculuk")
    exam_source_label = "icmal_sorgu_sonuc.xlsx / sinav_puanlari"
    exam_raw = read_selected(xl, "sinav_puanlari")
    if exam_raw.empty:
        fallback_exam = PROJECT_ROOT / "sinav_puanlari.xlsx"
        if fallback_exam.exists():
            log("sinav_puanlari sheet'i henüz icmalde yok; kaynak Excel geçici fallback olarak okunuyor.")
            exam_raw = pd.read_excel(fallback_exam, sheet_name=0)
            exam_source_label = (
                "sinav_puanlari.xlsx (geçici kaynak; sonraki tam üretimde merkezi sheet kullanılacak)"
            )
    discipline_keys = {
        normalize_key(value)
        for value in ["PERNO", "sicil", "sicil_no", "TARIH", "ceza_tarihi", "OCKOD", "ceza_kodu", "ceza_adi", "ACIKLAMA", "ceza_aciklama"]
    }
    discipline_raw = read_selected(xl, "cezalar", discipline_keys)
    turnover_raw = read_selected(xl, "Turnover_isletme_adi")
    history_keys = {normalize_key(v) for v in [
        "donem", "sicil_no", "adi_soyadi", "ust_bolum", "departman", "departman_adi", "isletme_adi",
        "gorev", "unvan", "kadro_adi", "magaza_kırılım", "ise_giris_tarihi", "cikis_tarihi",
        "kidem_yil", "donem_basi", "donem_sonu", "cikis",
    ]}
    scorecard_keys = {normalize_key(v) for v in ["donem", "sicil", "toplam_yuzde"]}
    hgo_keys = {normalize_key(v) for v in ["donem", "mag_adi", "isletme_adi", "mağaza", "hgo", "magaza_hgo"]}
    history_raw = read_selected(xl, "Sonuc", history_keys)
    scorecard_raw = read_selected(xl, "kumule_karne", scorecard_keys)
    hgo_raw = read_selected(xl, "Magaza_hedef_ciro", hgo_keys)

    enocta_events = canonical_event_frame(enocta_raw, "enocta")
    mandatory_events = canonical_event_frame(mandatory_raw, "mandatory")
    enocta_events = enocta_events[enocta_events["sicil"].isin(active_keys)].copy()
    mandatory_events = mandatory_events[mandatory_events["sicil"].isin(active_keys)].copy()
    sales_events = canonical_sales_events(sales_raw)
    sales_events = sales_events[sales_events["sicil"].isin(active_keys)].copy()
    enocta_people = aggregate_learning_people(enocta_events, employees, "Enocta")
    mandatory_people = aggregate_learning_people(mandatory_events, employees, "Zorunlu Eğitim")
    isg_people = build_isg_people(isg_raw, employees)
    checklist_people = build_checklist_people(checklist_raw, employees)
    sales = build_sales_data(sales_raw, non_raw, long_raw, employees)
    turnover = build_turnover(turnover_raw)
    history = canonical_history_frame(history_raw)
    scorecard = canonical_scorecard_frame(scorecard_raw)
    hgo = canonical_hgo_frame(hgo_raw)
    store_scores, person_scores = build_scores(
        employees, enocta_people, mandatory_people, isg_people, checklist_people, sales["registry"], turnover
    )
    development_rows = build_development_rows(development_raw, employees)
    discipline_by_sicil = build_latest_discipline_map(discipline_raw)
    turnover_reference = (
        pd.Period(turnover["latest_month"], freq="M").to_timestamp(how="end")
        if turnover.get("latest_month")
        else pd.Timestamp.now()
    )
    promotion_readiness = build_promotion_readiness_rows(
        person_scores,
        development_rows,
        discipline_by_sicil=discipline_by_sicil,
        reference_date=turnover_reference,
    )
    exam_scores = build_exam_score_data(
        exam_raw,
        employees,
        source_label=exam_source_label,
    )
    funnel = build_funnel_payload(
        [("Enocta", enocta_events), ("Zorunlu Eğitim", mandatory_events), ("Satış Akademisi", sales_events)],
        employees,
    )
    bridge = build_store_bridge(store_scores, turnover, history, scorecard, hgo)
    action_center = build_action_center(store_scores, bridge.get("rows", []))
    def latest_event_month(events: pd.DataFrame) -> str | None:
        if events is None or events.empty:
            return None
        values = events[["assigned_at", "started_at", "completed_at"]].max(axis=1)
        months = values.dropna().dt.strftime("%Y-%m")
        return max(months) if not months.empty else None

    scorecard_months = scorecard["month"].dropna() if not scorecard.empty else pd.Series(dtype="string")
    source_periods = {
        "sales_academy": sales.get("summary", {}).get("latest_month"),
        "enocta": latest_event_month(enocta_events),
        "mandatory": latest_event_month(mandatory_events),
        "turnover": turnover.get("latest_month"),
        "scorecard": max(scorecard_months) if not scorecard_months.empty else None,
        "hgo": max(hgo["month"].dropna()) if not hgo.empty else None,
    }

    return json_safe(
        {
            "meta": {
                "title": "Akademi Dashboard",
                "generated_at": datetime.now().isoformat(timespec="seconds"),
                "source_file": xlsx_path.name,
                "employee_count": int(len(employees)),
                "store_count": int(len(store_scores)),
                "turnover_month": turnover.get("latest_month"),
                "source_periods": source_periods,
                "score_weights": {"store": STORE_WEIGHTS, "person": PERSON_WEIGHTS},
                "education_bridge_weights": EDUCATION_WEIGHTS,
            },
            "filters": {
                "scopes": sorted(employees["scope"].dropna().unique(), key=normalize_key),
                "upper_units": sorted(employees["ust_bolum"].dropna().unique(), key=normalize_key),
                "stores": sorted(employees["magaza"].dropna().unique(), key=normalize_key),
                "titles": sorted(employees["title"].dropna().unique(), key=normalize_key),
            },
            "enocta_people": enocta_people.to_dict("records"),
            "mandatory_people": mandatory_people.to_dict("records"),
            "isg_people": isg_people.to_dict("records"),
            "checklist_people": checklist_people.to_dict("records"),
            "sales": sales,
            "turnover": turnover,
            "store_scores": store_scores,
            "person_scores": person_scores,
            "development_rows": development_rows,
            "promotion_readiness": promotion_readiness,
            "exam_scores": exam_scores,
            "funnel": funnel,
            "education_bridge": bridge,
            "action_center": action_center,
        }
    )

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Akademi Dashboard üretir.")
    parser.add_argument("--xlsx", type=Path, default=DEFAULT_XLSX)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    data = build_dashboard_data(args.xlsx.resolve())
    write_single_file_html(args.output.resolve(), HTML_TEMPLATE_V2, data)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
