"""Performans Dashboard tek dosyalık HTML üreticisi."""

from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from dashboard_build_common import (
    canonical_scope,
    clean_status,
    clean_text,
    first_col,
    json_safe,
    log,
    month_key,
    normalize_key,
    numeric,
    parse_datetime,
    safe_ratio,
    sicil_key,
    write_single_file_html,
)
from dashboard_analytics_v2 import (
    build_hiring_quality,
    build_promotion_movements,
    canonical_hgo_frame,
    canonical_learning_event_frame,
    canonical_performance_frame,
    canonical_scorecard_frame,
    status_flags,
)
from hedefler_dashboard_common import build_hedefler_data
from performance_dashboard_template import HTML_TEMPLATE as HTML_TEMPLATE_V2
from dashboard_paths import ICMAL_XLSX, PERFORMANS_DASHBOARD, PROJECT_ROOT, deterministic_build_time


BASE_DIR = PROJECT_ROOT
DEFAULT_XLSX = ICMAL_XLSX
DEFAULT_OUTPUT = PERFORMANS_DASHBOARD
DEFAULT_TARGETS = BASE_DIR / "2026_hedefler.xlsx"


def read_selected(xl: pd.ExcelFile, sheet: str, keys: set[str] | None = None) -> pd.DataFrame:
    if sheet not in xl.sheet_names:
        log(f"UYARI: Sheet bulunamadı: {sheet}")
        return pd.DataFrame()
    log(f"Sheet okunuyor: {sheet}")
    if keys is None:
        return pd.read_excel(xl, sheet_name=sheet)
    return pd.read_excel(xl, sheet_name=sheet, usecols=lambda col: normalize_key(col) in keys)


def canonical_hiring(source: pd.DataFrame) -> pd.DataFrame:
    if source.empty:
        return pd.DataFrame()
    mappings = {
        "month": ["Dönem", "donem", "month"],
        "sicil": ["Sicil No", "sicil_no", "sicil"],
        "ad_soyad": ["Adı Soyadı", "adi_soyadi", "ad_soyad"],
        "scope": ["Üst Bölüm", "ust_bolum"],
        "departman": ["Departman", "Departman Adı", "departman_adi"],
        "magaza": ["İşletme Adı", "isletme_adi"],
        "title": ["Görev", "gorev", "Ünvan", "unvan"],
        "unvan": ["Ünvan", "unvan"],
        "kadro": ["Kadro Adı", "kadro_adi"],
        "entry_date": ["İşe Giriş Tarihi", "ise_giris_tarihi"],
        "open_date": ["Pozisyon Açılma Tarihi", "Pozisyon Açılma Tarihi  "],
        "offer_date": ["Teklif Tarihi"],
        "open_days": ["Pozisyon Açık Gün Sayısı"],
        "fill_days": ["Pozisyon Doldurma Süresi"],
    }
    out = pd.DataFrame(index=source.index)
    for target, candidates in mappings.items():
        col = first_col(source, candidates)
        out[target] = source[col] if col else None
    out["month"] = month_key(out["month"])
    out["sicil"] = out["sicil"].map(sicil_key)
    out["scope"] = out["scope"].map(canonical_scope)
    for col in ["ad_soyad", "departman", "magaza", "title", "unvan", "kadro"]:
        out[col] = out[col].map(clean_text)
    for col in ["entry_date", "open_date", "offer_date"]:
        out[col] = parse_datetime(out[col])
    for col in ["open_days", "fill_days"]:
        out[col] = numeric(out[col])
    out["title_group"] = out["title"].map(title_group)
    return out[out["month"].notna()].reset_index(drop=True)


def canonical_sonuc(source: pd.DataFrame) -> pd.DataFrame:
    if source.empty:
        return pd.DataFrame()
    mappings = {
        "month": ["donem", "month"],
        "sicil": ["sicil_no", "sicil"],
        "tc_kimlik": ["tc_kimlik_no", "tc kimlik no"],
        "ad_soyad": ["adi_soyadi", "ad soyad"],
        "scope": ["ust_bolum", "üst bölüm"],
        "departman": ["departman", "departman_adi"],
        "departman_adi": ["departman_adi", "departman"],
        "magaza": ["isletme_adi", "mağaza"],
        "gorev": ["gorev", "görev"],
        "unvan": ["unvan", "ünvan"],
        "kadro": ["kadro_adi", "kadro adı"],
        "magaza_title": ["magaza_kırılım", "magaza_title"],
        "entry_date": ["ise_giris_tarihi", "son_giris_tarihi"],
        "exit_date": ["cikis_tarihi", "çıkış tarihi"],
        "tenure_year": ["kidem_yil", "kıdem yıl"],
        "start": ["donem_basi", "dönem başı"],
        "end": ["donem_sonu", "dönem sonu"],
        "exit": ["cikis", "çıkış"],
    }
    out = pd.DataFrame(index=source.index)
    for target, candidates in mappings.items():
        col = first_col(source, candidates)
        out[target] = source[col] if col else None
    out["month"] = month_key(out["month"])
    out["sicil"] = out["sicil"].map(sicil_key)
    out = out[out["month"].notna() & out["sicil"].ne("")].copy()
    out["scope"] = out["scope"].map(canonical_scope)
    for col in ["ad_soyad", "departman", "departman_adi", "magaza", "gorev", "unvan", "kadro", "magaza_title"]:
        out[col] = out[col].map(clean_text)
    out["departman"] = out["departman"].where(out["departman"].ne(""), out["departman_adi"])
    for col in ["entry_date", "exit_date"]:
        out[col] = parse_datetime(out[col])
    for col in ["tenure_year", "start", "end", "exit"]:
        out[col] = numeric(out[col]).fillna(0)
    out["tenure_days"] = (out["exit_date"] - out["entry_date"]).dt.days
    out["tenure_days"] = out["tenure_days"].fillna(out["tenure_year"] * 365).clip(lower=0)
    out["title_group"] = out["gorev"].where(out["gorev"].ne(""), out["unvan"]).map(title_group)
    return out


def title_group(value: Any) -> str:
    key = normalize_key(value)
    if "direktor" in key or "director" in key:
        return "Direktör"
    if "magaza mudur" in key and not any(token in key for token in ["yardim", "ikinci", "2"]):
        return "Mağaza Müdürü"
    if "magaza mudur" in key and any(token in key for token in ["yardim", "ikinci", "2"]):
        return "Mağaza Müdür Yardımcısı"
    if "mudur" in key or "manager" in key:
        return "Müdür"
    if "yonetici" in key or "supervisor" in key or "lead" in key:
        return "Yönetici"
    if "uzman" in key or "specialist" in key or "expert" in key:
        return "Uzman"
    return "Diğer"


def build_turnover_aggregates(work: pd.DataFrame) -> dict[str, Any]:
    if work.empty:
        return {"months": [], "rows": []}
    grouped = work.groupby(["month", "scope", "departman", "title_group"], dropna=False, as_index=False).agg(
        exits=("exit", "sum"), start=("start", "sum"), end=("end", "sum")
    )
    grouped["avg_headcount"] = (grouped["start"] + grouped["end"]) / 2
    grouped["turnover"] = np.where(grouped["avg_headcount"] > 0, grouped["exits"] / grouped["avg_headcount"], np.nan)
    exit_rows = work[work["exit"] > 0].copy()
    if exit_rows.empty:
        early = pd.DataFrame(columns=["month", "scope", "departman", "title_group", "total_exits", "first_1", "first_2", "first_6"])
    else:
        exit_rows["first_1"] = np.where(exit_rows["tenure_days"] <= 31, exit_rows["exit"], 0)
        exit_rows["first_2"] = np.where(exit_rows["tenure_days"] <= 62, exit_rows["exit"], 0)
        exit_rows["first_6"] = np.where(exit_rows["tenure_days"] <= 183, exit_rows["exit"], 0)
        early = exit_rows.groupby(["month", "scope", "departman", "title_group"], dropna=False, as_index=False).agg(
            total_exits=("exit", "sum"), first_1=("first_1", "sum"), first_2=("first_2", "sum"), first_6=("first_6", "sum")
        )
    return {
        "months": sorted(work["month"].dropna().unique()),
        "rows": grouped.to_dict("records"),
        "early_rows": early.to_dict("records"),
        "scopes": sorted(work["scope"].dropna().unique(), key=normalize_key),
        "departments": sorted(work["departman"].dropna().unique(), key=normalize_key),
        "title_groups": sorted(work["title_group"].dropna().unique(), key=normalize_key),
    }


def center_level(value: Any) -> tuple[str, int]:
    key = normalize_key(value)
    rules = [
        (7, "Genel Müdür", ["genel mudur", "general manager"]),
        (6, "Direktör", ["direktor", "director"]),
        (5, "Müdür", ["mudur", "manager"]),
        (4, "Yönetici", ["yonetici", "supervisor", "lead"]),
        (3, "Kıdemli Uzman", ["kidemli uzman", "senior specialist", "senior expert", "senior"]),
        (1, "Uzman Yardımcısı / Memur / Eleman", ["uzman yardimcisi", "memur", "eleman", "staff"]),
        (2, "Uzman", ["uzman", "specialist", "expert"]),
    ]
    for rank, label, tokens in rules:
        if any(token in key for token in tokens):
            return label, rank
    return clean_text(value) or "Diğer", 0


def store_role(value: Any) -> tuple[str, int] | None:
    key = normalize_key(value)
    if "magaza mudur" in key and not any(token in key for token in ["yardim", "ikinci", "2"]):
        return "Mağaza Müdürü", 4
    if "magaza mudur" in key and any(token in key for token in ["yardim", "ikinci", "2"]):
        return "Mağaza Müdür Yardımcısı", 3
    if "pasor" in key:
        return "Pasör Satış Danışmanı", 2
    return None


def build_promotion_ratios(work: pd.DataFrame) -> dict[str, Any]:
    movements = build_promotion_movements(work)
    if not movements.get("rows"):
        return {"store": [], "center": [], **movements}

    def summarize(scope: str) -> list[dict[str, Any]]:
        frame = pd.DataFrame([row for row in movements["rows"] if row.get("scope") == scope])
        if frame.empty:
            return []
        result: list[dict[str, Any]] = []
        for (month, role), group in frame.groupby(["month", "target_role"], dropna=False):
            internal = int(group["movement"].eq("İç Terfi").sum())
            external = int(group["movement"].eq("Dış Aday").sum())
            total = internal + external
            result.append({
                "month": month, "role": role, "internal": internal, "external": external, "total": total,
                "internal_rate": safe_ratio(internal, total), "external_rate": safe_ratio(external, total),
            })
        return result

    return {"store": summarize("Mağaza"), "center": summarize("Merkez"), **movements}


def build_person_pool(work: pd.DataFrame) -> dict[str, Any]:
    if work.empty:
        return {"months": [], "people": [], "records": []}
    identity_candidates = [
        "sicil", "tc_kimlik", "ad_soyad", "scope", "departman", "magaza", "gorev", "unvan", "kadro",
        "title_group", "entry_date", "exit_date", "tenure_year", "tenure_days", "birth_date", "gender",
    ]
    identity_cols = [col for col in identity_candidates if col in work.columns]
    latest = work.sort_values(["sicil", "month"]).drop_duplicates("sicil", keep="last")[identity_cols].copy()
    latest = latest.sort_values(["ad_soyad", "sicil"], na_position="last").reset_index(drop=True)
    latest["person_index"] = latest.index
    index_map = dict(zip(latest["sicil"], latest["person_index"]))
    months = sorted(work["month"].unique())
    month_map = {month: idx for idx, month in enumerate(months)}
    grouped = work.groupby(["sicil", "month"], as_index=False).agg(start=("start", "sum"), end=("end", "sum"), exit=("exit", "sum"), tenure_days=("tenure_days", "max"))
    records: list[list[Any]] = []
    for row in grouped.itertuples(index=False):
        records.append([
            int(index_map[row.sicil]), int(month_map[row.month]), float(row.start), float(row.end), float(row.exit),
            float(row.tenure_days) if pd.notna(row.tenure_days) else None,
        ])
    people = latest.drop(columns=["person_index"]).to_dict("records")
    return {"months": months, "people": people, "records": records, "record_schema": ["person_index", "month_index", "start", "end", "exit", "tenure_days"]}


def build_mandatory_detail(source: pd.DataFrame, identities: pd.DataFrame) -> dict[str, Any]:
    if source.empty:
        return {"columns": [], "rows": []}
    mappings = {
        "sicil": ["KULLANICI SİCİL", "kullanıcı sicil", "sicil"],
        "source_first_name": ["KULLANICI ADI", "kullanıcı adı"],
        "source_last_name": ["KULLANICI SOYADI", "kullanıcı soyadı"],
        "event": ["ETKİNLİK ADI", "etkinlik adı"],
        "status": ["TAMAMLAMA DURUMU", "tamamlama durumu"],
        "score": ["PUANI", "puan"],
        "assigned_at": ["ATANMA TARİHİ", "atanma tarihi"],
        "completed_at": ["TAMAMLAMA TARİHİ", "tamamlama tarihi"],
        "source_location": ["LOKASYON", "lokasyon"],
        "source_department": ["DEPARTMAN", "departman"],
        "source_title": ["POZISYON", "pozisyon"],
        "source_region": ["BÖLGE", "bölge"],
        "duration_min": [
            "NET DENEYİM SÜRESİ (dk)",
            "TOPLAM DENEYİM SÜRESİ (dk)",
            "TOPLAM MOBİL DENEYİM SÜRESİ (dk)",
            "NET MOBİL DENEYİM SÜRESİ (dk)",
            "ETKİNLİK TAHMİNİ SÜRE (dk)",
            "süre dk",
            "sure dk",
            "dakika",
        ],
        "duration_hour": [
            "TOPLAM OTURUM SÜRESİ (saat)",
            "süre saat",
            "sure saat",
            "saat",
        ],
    }
    out = pd.DataFrame(index=source.index)
    for target, candidates in mappings.items():
        col = first_col(source, candidates)
        out[target] = source[col] if col else None
    out["sicil"] = out["sicil"].map(sicil_key)
    invalid_sicil_count = int(out["sicil"].eq("").sum())
    out = out[out["sicil"].ne("")].copy()
    out["source_name"] = (
        out["source_first_name"].map(clean_text).str.strip()
        + " "
        + out["source_last_name"].map(clean_text).str.strip()
    ).str.strip()
    out["event"] = out["event"].map(clean_text)
    out["status"] = out["status"].map(clean_status)
    out["score"] = numeric(out["score"])
    out["duration_min"] = numeric(out["duration_min"]).fillna(0)
    out["duration_hour"] = numeric(out["duration_hour"]).fillna(0)
    out["duration_min"] = out["duration_min"].where(out["duration_min"] > 0, out["duration_hour"] * 60)
    out["duration_hour"] = out["duration_hour"].where(out["duration_hour"] > 0, out["duration_min"] / 60)
    out["assigned_at"] = parse_datetime(out["assigned_at"])
    out["completed_at"] = parse_datetime(out["completed_at"])
    out["assignment_month"] = out["assigned_at"].dt.strftime("%Y-%m")
    out["__dedupe"] = (
        out["sicil"].astype(str) + "|" + out["event"].map(normalize_key) + "|"
        + out["assigned_at"].dt.strftime("%Y-%m-%d %H:%M:%S").fillna("")
    )
    out = out.sort_values(["__dedupe", "completed_at"], na_position="first").drop_duplicates("__dedupe", keep="last")
    flags = out["status"].map(status_flags)
    out["started"] = flags.map(lambda item: item[0])
    out["completed"] = flags.map(lambda item: item[1])
    out["exempt"] = flags.map(lambda item: item[2])
    for col in ["source_location", "source_department", "source_title", "source_region"]:
        out[col] = out[col].map(clean_text)
    identity = identities.sort_values(["sicil", "month"]).drop_duplicates("sicil", keep="last")[["sicil", "ad_soyad", "scope", "departman", "magaza", "gorev"]]
    out = out.merge(identity, on="sicil", how="left")
    out["ad_soyad"] = out["ad_soyad"].where(out["ad_soyad"].notna() & out["ad_soyad"].ne(""), out["source_name"])
    out["departman"] = out["departman"].where(out["departman"].notna() & out["departman"].ne(""), out["source_department"])
    out["magaza"] = out["magaza"].where(out["magaza"].notna() & out["magaza"].ne(""), out["source_location"])
    out["gorev"] = out["gorev"].where(out["gorev"].notna() & out["gorev"].ne(""), out["source_title"])
    recognized_scopes = {"Mağaza", "Merkez", "Edirne"}
    fallback_scope = out["source_region"].map(canonical_scope)
    fallback_scope = fallback_scope.where(fallback_scope.isin(recognized_scopes))
    for source_col in ["source_department", "source_location"]:
        candidate = out[source_col].map(canonical_scope)
        fallback_scope = fallback_scope.where(fallback_scope.notna(), candidate.where(candidate.isin(recognized_scopes)))
    store_source = (
        out["source_location"].map(clean_text).str.casefold().str.contains(r"\.gs\.", regex=True, na=False)
        | out["source_region"].map(normalize_key).str.startswith("bolge", na=False)
    )
    fallback_scope = fallback_scope.fillna("Belirsiz")
    fallback_scope.loc[store_source] = "Mağaza"
    missing_scope = out["scope"].isna() | out["scope"].eq("") | out["scope"].eq("Belirsiz")
    out.loc[missing_scope, "scope"] = fallback_scope.loc[missing_scope]
    unresolved_scope_count = int(out["scope"].isin(["", "Belirsiz", "99999"]).sum())
    unmatched_identity_count = int(out["ad_soyad"].isna().sum() + out["ad_soyad"].eq("").sum())
    columns = [
        "sicil", "ad_soyad", "scope", "departman", "magaza", "gorev", "event", "status", "score",
        "duration_min", "duration_hour", "assignment_month", "assigned_at", "completed_at", "started", "completed", "exempt",
    ]
    rows = [[json_safe(row.get(col)) for col in columns] for row in out[columns].to_dict("records")]
    return {
        "columns": columns,
        "rows": rows,
        "quality": {
            "source_rows": int(len(source)),
            "invalid_sicil": invalid_sicil_count,
            "unmatched_identity": unmatched_identity_count,
            "unresolved_scope": unresolved_scope_count,
        },
    }


def build_dashboard_data(xlsx_path: Path, targets_path: Path = DEFAULT_TARGETS) -> dict[str, Any]:
    log(f"Performans Dashboard verisi hazırlanıyor: {xlsx_path.name}")
    xl = pd.ExcelFile(xlsx_path)
    hiring_raw = read_selected(xl, "ise_alma_suresi")
    sonuc_keys = {normalize_key(v) for v in [
        "donem", "sicil_no", "tc_kimlik_no", "adi_soyadi", "ust_bolum", "departman", "departman_adi", "isletme_adi",
        "gorev", "unvan", "kadro_adi", "magaza_kırılım", "ise_giris_tarihi", "son_giris_tarihi", "cikis_tarihi",
        "kidem_yil", "donem_basi", "donem_sonu", "cikis",
    ]}
    mandatory_keys = {normalize_key(v) for v in [
        "KULLANICI SİCİL", "KULLANICI ADI", "KULLANICI SOYADI", "ETKİNLİK ADI", "TAMAMLAMA DURUMU", "PUANI", "ATANMA TARİHİ", "TAMAMLAMA TARİHİ",
        "LOKASYON", "DEPARTMAN", "POZISYON", "BÖLGE",
        "TOPLAM DENEYİM SÜRESİ (dk)", "NET DENEYİM SÜRESİ (dk)",
        "TOPLAM MOBİL DENEYİM SÜRESİ (dk)", "NET MOBİL DENEYİM SÜRESİ (dk)",
        "TOPLAM OTURUM SÜRESİ (saat)", "ETKİNLİK TAHMİNİ SÜRE (dk)",
    ]}
    sonuc_raw = read_selected(xl, "Sonuc", sonuc_keys)
    mandatory_raw = read_selected(xl, "zorunlu_egitim", mandatory_keys)
    scorecard_raw = read_selected(xl, "kumule_karne", {normalize_key(v) for v in ["donem", "sicil", "toplam_yuzde"]})
    hgo_raw = read_selected(xl, "Magaza_hedef_ciro", {normalize_key(v) for v in ["donem", "mag_adi", "hgo"]})
    performance_raw = read_selected(xl, "performans_magaza_verileri", {normalize_key(v) for v in ["donem", "sicil", "performans_notu"]})
    hiring = canonical_hiring(hiring_raw)
    sonuc = canonical_sonuc(sonuc_raw)
    turnover = build_turnover_aggregates(sonuc)
    promotions = build_promotion_ratios(sonuc)
    person_pool = build_person_pool(sonuc)
    mandatory = build_mandatory_detail(mandatory_raw, sonuc)
    mandatory_events = canonical_learning_event_frame(mandatory_raw, "mandatory")
    scorecard = canonical_scorecard_frame(scorecard_raw)
    hgo = canonical_hgo_frame(hgo_raw)
    performance = canonical_performance_frame(performance_raw)
    hiring_quality = build_hiring_quality(hiring, sonuc, performance, promotions.get("rows", []))
    mandatory_quality = mandatory.get("quality", {})
    source_count = int(mandatory_quality.get("source_rows") or 0)
    for check, key, severity, note in [
        ("Kaynak sicil geçersiz", "invalid_sicil", "Kritik", "Kişi bazlı metriklere dahil edilmedi."),
        ("Kimlik eşleşmesi eksik", "unmatched_identity", "Uyarı", "Kaynak ad-soyad ve çalışan geçmişi ile eşleşemedi."),
        ("Kapsam eşleşmesi eksik", "unresolved_scope", "Uyarı", "Üst bölüm kaynak alanlarından güvenle belirlenemedi."),
    ]:
        count = int(mandatory_quality.get(key) or 0)
        if count:
            log(f"UYARI: Performans dashboard veri kontrolü - {check}: {count}/{source_count}")
    source_periods = {
        "turnover": max(turnover.get("months") or [""]) or None,
        "hiring": max(hiring["month"].dropna()) if not hiring.empty else None,
        "mandatory": max(mandatory_events["assigned_at"].dropna().dt.strftime("%Y-%m")) if not mandatory_events.empty and mandatory_events["assigned_at"].notna().any() else None,
        "scorecard": max(scorecard["month"].dropna()) if not scorecard.empty else None,
        "hgo": max(hgo["month"].dropna()) if not hgo.empty else None,
    }
    return json_safe({
        "meta": {
            "title": "Performans Dashboard", "generated_at": deterministic_build_time().isoformat(timespec="seconds"),
            "source_file": xlsx_path.name, "latest_month": max(turnover.get("months") or [""]),
            "person_count": len(person_pool.get("people", [])), "mandatory_count": len(mandatory.get("rows", [])),
            "source_periods": source_periods,
        },
        "hiring": {
            "rows": hiring.to_dict("records"),
            "scopes": sorted(hiring["scope"].dropna().unique(), key=normalize_key),
            "departments": sorted(hiring["departman"].dropna().unique(), key=normalize_key),
            "title_groups": sorted(hiring["title_group"].dropna().unique(), key=normalize_key),
        },
        "turnover": turnover,
        "promotions": promotions,
        "mandatory": mandatory,
        "person_pool": person_pool,
        "hiring_quality": hiring_quality,
        "hedefler": build_hedefler_data(targets_path),
    })


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Performans Dashboard üretir.")
    parser.add_argument("--xlsx", type=Path, default=DEFAULT_XLSX)
    parser.add_argument("--targets", type=Path, default=DEFAULT_TARGETS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    data = build_dashboard_data(args.xlsx.resolve(), args.targets.resolve())
    write_single_file_html(args.output.resolve(), HTML_TEMPLATE_V2, data)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
