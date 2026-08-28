"""Akademi ve performans dashboardlari icin ortak V2 analitik katmani.

Bu modul hesaplari HTML/JavaScript katmanina birakmaz. Ayni metrik iki farkli
dashboardda kullanildiginda ayni pay, payda, donem ve durum kuraliyla uretilir.
"""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Any, Iterable

import numpy as np
import pandas as pd

from dashboard_build_common import (
    canonical_scope,
    clean_text,
    first_col,
    json_safe,
    month_key,
    normalize_key,
    numeric,
    parse_datetime,
    safe_ratio,
    sicil_key,
)


EDUCATION_WEIGHTS = {
    "academy": 25.0,
    "enocta": 20.0,
    "mandatory": 20.0,
    "isg": 15.0,
    "checklist": 10.0,
}


def canonical_history_frame(source: pd.DataFrame) -> pd.DataFrame:
    """Minimal canonical employee-month history shared by V2 analyses."""
    columns = [
        "month", "sicil", "ad_soyad", "scope", "departman", "magaza", "gorev", "unvan", "kadro",
        "magaza_title", "entry_date", "exit_date", "tenure_year", "start", "end", "exit",
    ]
    if source is None or source.empty:
        return pd.DataFrame(columns=columns)
    mapping = {
        "month": ["donem", "month"], "sicil": ["sicil_no", "sicil"], "ad_soyad": ["adi_soyadi", "ad soyad"],
        "scope": ["ust_bolum", "üst bölüm"], "departman": ["departman", "departman_adi"],
        "magaza": ["isletme_adi", "mağaza"], "gorev": ["gorev", "görev"], "unvan": ["unvan", "ünvan"],
        "kadro": ["kadro_adi", "kadro adı"], "magaza_title": ["magaza_kırılım", "magaza_title"],
        "entry_date": ["ise_giris_tarihi", "son_giris_tarihi"], "exit_date": ["cikis_tarihi", "çıkış tarihi"],
        "tenure_year": ["kidem_yil", "kıdem yıl"], "start": ["donem_basi", "dönem başı"],
        "end": ["donem_sonu", "dönem sonu"], "exit": ["cikis", "çıkış"],
    }
    out = pd.DataFrame(index=source.index)
    for target, candidates in mapping.items():
        col = first_col(source, candidates)
        out[target] = source[col] if col else None
    out["month"] = month_key(out["month"])
    out["sicil"] = out["sicil"].map(sicil_key)
    out = out[out["month"].notna() & out["sicil"].ne("")].copy()
    out["scope"] = out["scope"].map(canonical_scope)
    for col in ["ad_soyad", "departman", "magaza", "gorev", "unvan", "kadro", "magaza_title"]:
        out[col] = out[col].map(clean_text)
    for col in ["entry_date", "exit_date"]:
        out[col] = parse_datetime(out[col])
    for col in ["tenure_year", "start", "end", "exit"]:
        out[col] = numeric(out[col]).fillna(0)
    out["tenure_days"] = (out["exit_date"] - out["entry_date"]).dt.days
    out["tenure_days"] = out["tenure_days"].fillna(out["tenure_year"] * 365).clip(lower=0)
    return out[columns + ["tenure_days"]]


def canonical_scorecard_frame(source: pd.DataFrame) -> pd.DataFrame:
    if source is None or source.empty:
        return pd.DataFrame(columns=["month", "sicil", "score"])
    month_col = first_col(source, ["donem", "month"])
    sicil_col = first_col(source, ["sicil", "sicil_no"])
    score_col = first_col(source, ["toplam_yuzde", "performans_notu", "toplam"])
    if not month_col or not sicil_col or not score_col:
        return pd.DataFrame(columns=["month", "sicil", "score"])
    out = pd.DataFrame({
        "month": month_key(source[month_col]), "sicil": source[sicil_col].map(sicil_key), "score": numeric(source[score_col]),
    })
    # toplam_yuzde is stored as 0-1.xx; performance_notu is already 0-120.
    non_null = out["score"].dropna()
    if not non_null.empty and non_null.quantile(0.9) <= 2:
        out["score"] = out["score"] * 100
    return out[out["month"].notna() & out["sicil"].ne("")]


def canonical_performance_frame(source: pd.DataFrame) -> pd.DataFrame:
    if source is None or source.empty:
        return pd.DataFrame(columns=["month", "sicil", "performance"])
    month_col = first_col(source, ["donem", "month"])
    sicil_col = first_col(source, ["sicil", "sicil_no"])
    value_col = first_col(source, ["performans_notu", "toplam_yuzde", "sonuc_notu"])
    if not month_col or not sicil_col or not value_col:
        return pd.DataFrame(columns=["month", "sicil", "performance"])
    return pd.DataFrame({
        "month": month_key(source[month_col]), "sicil": source[sicil_col].map(sicil_key), "performance": numeric(source[value_col]),
    }).dropna(subset=["month"])


def canonical_learning_event_frame(source: pd.DataFrame, kind: str) -> pd.DataFrame:
    if source is None or source.empty:
        return pd.DataFrame()
    if kind == "sales":
        candidates = {
            "sicil": ["sicil", "sicil_no"], "event": ["egitim_donemi", "egitim_adi"],
            "status": ["katilim_durumu", "katılım durumu"], "assigned_at": ["donem", "egitim_tarihi"],
        }
    else:
        candidates = {
            "sicil": ["KULLANICI SİCİL", "kullanıcı_sicil", "sicil"],
            "event": ["ETKİNLİK ADI", "etkinlik_adi", "etkinlik adı"],
            "status": ["TAMAMLAMA DURUMU", "tamamlama_durumu", "tamamlama durumu"],
            "minutes": ["NET DENEYİM SÜRESİ (dk)", "izleme_dk", "net deneyim süresi (dk)"],
            "completion_pct": ["ETKİNLİK TAMAMLAMA YÜZDESİ", "etkinlik_tamamlama_yuzdesi"],
            "score": ["PUANI", "puan"], "assigned_at": ["ATANMA TARİHİ", "atanma_tarihi"],
            "started_at": ["BAŞLAMA TARİHİ", "baslama_tarihi"], "completed_at": ["TAMAMLAMA TARİHİ", "tamamlama_tarihi"],
        }
    out = pd.DataFrame(index=source.index)
    for target, names in candidates.items():
        col = first_col(source, names)
        out[target] = source[col] if col else None
    out["sicil"] = out["sicil"].map(sicil_key)
    out["event"] = out["event"].map(clean_text)
    status_source = out["status"].map(clean_text)
    out["status"] = status_source
    for col in ["minutes", "completion_pct", "score"]:
        if col not in out:
            out[col] = np.nan
        out[col] = numeric(out[col])
    out["assigned_at"] = parse_datetime(out["assigned_at"])
    if kind == "sales":
        done = status_source.map(lambda value: status_flags(value)[1] == 1)
        out["started_at"] = out["assigned_at"].where(done)
        out["completed_at"] = out["assigned_at"].where(done)
    else:
        for col in ["started_at", "completed_at"]:
            out[col] = parse_datetime(out[col])
    out["activity_at"] = out[["completed_at", "started_at", "assigned_at"]].max(axis=1)
    return out[out["sicil"].ne("") & out["event"].ne("")]


def canonical_hgo_frame(source: pd.DataFrame) -> pd.DataFrame:
    if source is None or source.empty:
        return pd.DataFrame(columns=["month", "store", "hgo"])
    month_col = first_col(source, ["donem", "month"])
    store_col = first_col(source, ["mag_adi", "isletme_adi", "mağaza"])
    hgo_col = first_col(source, ["hgo", "magaza_hgo"])
    if not month_col or not store_col or not hgo_col:
        return pd.DataFrame(columns=["month", "store", "hgo"])
    out = pd.DataFrame({"month": month_key(source[month_col]), "store": source[store_col].map(clean_text), "hgo": numeric(source[hgo_col])})
    values = out["hgo"].dropna()
    if not values.empty and values.quantile(0.9) <= 2:
        out["hgo"] *= 100
    return out.dropna(subset=["month"])


def month_add(month: str, offset: int) -> str:
    if not month:
        return ""
    try:
        return str(pd.Period(month, freq="M") + offset)
    except (TypeError, ValueError):
        return ""


def month_distance(start: str, end: str) -> int | None:
    try:
        first = pd.Period(start, freq="M")
        last = pd.Period(end, freq="M")
    except (TypeError, ValueError):
        return None
    return (last.year - first.year) * 12 + (last.month - first.month)


def finite(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def weighted_score(components: dict[str, Any], weights: dict[str, float], minimum: int = 1) -> tuple[float | None, int]:
    usable = {
        key: max(0.0, min(100.0, float(value)))
        for key, value in components.items()
        if finite(value) is not None and weights.get(key, 0) > 0
    }
    if len(usable) < minimum:
        return None, len(usable)
    denominator = sum(weights[key] for key in usable)
    if denominator <= 0:
        return None, len(usable)
    return sum(usable[key] * weights[key] for key in usable) / denominator, len(usable)


def status_flags(status: Any) -> tuple[int, int, int, int, int]:
    """Return started, completed, exempt, ongoing, not_started flags."""
    key = normalize_key(status)
    exempt = int("muaf" in key)
    completed = int(not exempt and ("tamamladi" in key or key == "tamamlandi" or key == "katildi"))
    ongoing = int("devam" in key)
    not_started = int("baslamadi" in key or "baslanmadi" in key or key == "katilmadi")
    started = int(completed or exempt or ongoing)
    return started, completed, exempt, ongoing, not_started


def dedupe_learning_events(events: pd.DataFrame, source_name: str) -> pd.DataFrame:
    """Deduplicate an assignment by person, event and assignment timestamp.

    When assignment date is missing, the latest activity row is retained for the
    person-event pair. This avoids duplicate exports inflating the funnel.
    """
    if events is None or events.empty:
        return pd.DataFrame()
    work = events.copy()
    work["source"] = source_name
    work["sicil"] = work["sicil"].map(sicil_key)
    work["event"] = work["event"].map(clean_text)
    for col in ["assigned_at", "started_at", "completed_at", "activity_at"]:
        if col not in work:
            work[col] = pd.NaT
        work[col] = parse_datetime(work[col])
    work["assigned_key"] = work["assigned_at"].dt.strftime("%Y-%m-%d %H:%M:%S").fillna("")
    work["dedupe_key"] = (
        work["source"].astype(str) + "|" + work["sicil"].astype(str) + "|"
        + work["event"].map(normalize_key) + "|" + work["assigned_key"]
    )
    missing_date = work["assigned_key"].eq("")
    work.loc[missing_date, "dedupe_key"] = (
        work.loc[missing_date, "source"].astype(str) + "|"
        + work.loc[missing_date, "sicil"].astype(str) + "|"
        + work.loc[missing_date, "event"].map(normalize_key)
    )
    work = work.sort_values(["dedupe_key", "activity_at", "completed_at"], na_position="first")
    return work.drop_duplicates("dedupe_key", keep="last").reset_index(drop=True)


def learning_rates(assigned: float, completed: float, exempt: float) -> tuple[float | None, float | None]:
    """Completion excludes exemptions; compliance counts exemptions as compliant."""
    assigned_value = max(0.0, float(assigned or 0))
    exempt_value = min(assigned_value, max(0.0, float(exempt or 0)))
    eligible = assigned_value - exempt_value
    completed_value = min(eligible, max(0.0, float(completed or 0)))
    completion = safe_ratio(completed_value, eligible)
    compliance = safe_ratio(completed_value + exempt_value, assigned_value)
    return completion, compliance


def aggregate_learning_people_v2(events: pd.DataFrame, employees: pd.DataFrame, source_name: str) -> pd.DataFrame:
    base_cols = [
        "sicil", "ad_soyad", "scope", "ust_bolum", "departman", "magaza", "bolge",
        "il", "title", "gorev", "unvan", "kadro", "ise_giris_tarihi",
    ]
    identity = employees[[col for col in base_cols if col in employees.columns]].drop_duplicates("sicil").copy()
    if identity.empty:
        return pd.DataFrame(columns=base_cols)

    work = dedupe_learning_events(events, source_name)
    if work.empty:
        grouped = identity.copy()
        for col in ["assigned", "started", "completed", "exempt", "ongoing", "not_started", "watch_minutes"]:
            grouped[col] = 0
        grouped["avg_completion_pct"] = np.nan
        grouped["avg_score"] = np.nan
        grouped["completion_rate"] = np.nan
        grouped["compliance_rate"] = np.nan
        grouped["last_event"] = ""
        grouped["last_status"] = "Kayıt Yok"
        grouped["last_activity"] = pd.NaT
        grouped["source"] = source_name
        return grouped

    flags = work["status"].map(status_flags)
    for idx, col in enumerate(["started", "completed", "exempt", "ongoing", "not_started"]):
        work[col] = flags.map(lambda item, i=idx: item[i])
    grouped = work.groupby("sicil", as_index=False).agg(
        assigned=("event", "size"), started=("started", "sum"), completed=("completed", "sum"),
        exempt=("exempt", "sum"), ongoing=("ongoing", "sum"), not_started=("not_started", "sum"),
        watch_minutes=("minutes", "sum"), avg_completion_pct=("completion_pct", "mean"), avg_score=("score", "mean"),
    )
    assigned = numeric(grouped["assigned"]).clip(lower=0)
    exempt = numeric(grouped["exempt"]).clip(lower=0).where(lambda values: values <= assigned, assigned)
    eligible = assigned - exempt
    completed = numeric(grouped["completed"]).clip(lower=0).where(lambda values: values <= eligible, eligible)
    grouped["completion_rate"] = completed.div(eligible.where(eligible > 0))
    grouped["compliance_rate"] = (completed + exempt).div(assigned.where(assigned > 0))
    latest = (
        work.sort_values(["sicil", "activity_at", "completed_at", "assigned_at"], na_position="first")
        .drop_duplicates("sicil", keep="last")[["sicil", "event", "status", "activity_at"]]
        .rename(columns={"event": "last_event", "status": "last_status", "activity_at": "last_activity"})
    )
    grouped = identity.merge(grouped, on="sicil", how="left").merge(latest, on="sicil", how="left")
    for col in ["assigned", "started", "completed", "exempt", "ongoing", "not_started", "watch_minutes"]:
        grouped[col] = numeric(grouped[col]).fillna(0)
    grouped["last_event"] = grouped["last_event"].fillna("")
    grouped["last_status"] = grouped["last_status"].fillna("Kayıt Yok")
    grouped["source"] = source_name
    return grouped


def build_funnel_payload(event_sets: Iterable[tuple[str, pd.DataFrame]], employees: pd.DataFrame) -> dict[str, Any]:
    """Dictionary-encode event rows to preserve interactive filters compactly."""
    frames: list[pd.DataFrame] = []
    identity_cols = ["sicil", "ad_soyad", "scope", "ust_bolum", "magaza", "bolge", "title"]
    identity = employees[[col for col in identity_cols if col in employees.columns]].drop_duplicates("sicil")
    for source_name, events in event_sets:
        work = dedupe_learning_events(events, source_name)
        if work.empty:
            continue
        flags = work["status"].map(status_flags)
        work["started"] = flags.map(lambda item: item[0])
        work["completed"] = flags.map(lambda item: item[1])
        work["exempt"] = flags.map(lambda item: item[2])
        work["month"] = work["assigned_at"].dt.strftime("%Y-%m")
        work["month"] = work["month"].fillna(work["activity_at"].dt.strftime("%Y-%m")).fillna("Belirsiz")
        work = work.merge(identity, on="sicil", how="left")
        frames.append(work[["source", "event", "status", "month", *identity_cols, "started", "completed", "exempt"]])
    if not frames:
        return {"dimensions": {}, "schema": [], "rows": []}
    data = pd.concat(frames, ignore_index=True)
    dim_cols = ["source", "event", "status", "month", "sicil", "ad_soyad", "scope", "ust_bolum", "magaza", "bolge", "title"]
    dimensions: dict[str, list[str]] = {}
    encoded: dict[str, pd.Series] = {}
    for col in dim_cols:
        values = sorted({clean_text(value) or "Belirsiz" for value in data[col]}, key=normalize_key)
        dimensions[col] = values
        index = {value: idx for idx, value in enumerate(values)}
        encoded[col] = data[col].map(lambda value: index[clean_text(value) or "Belirsiz"])
    schema = [*dim_cols, "started", "completed", "exempt"]
    rows = np.column_stack([
        *[encoded[col].to_numpy(dtype=np.int32) for col in dim_cols],
        data["started"].to_numpy(dtype=np.int8), data["completed"].to_numpy(dtype=np.int8), data["exempt"].to_numpy(dtype=np.int8),
    ]).tolist()
    return {"dimensions": dimensions, "schema": schema, "rows": rows}


def cumulative_turnover(rows: Iterable[dict[str, Any]], months: Iterable[str] | None = None) -> dict[str, Any]:
    source = list(rows)
    if months is not None:
        month_set = set(months)
        source = [row for row in source if row.get("month") in month_set]
    exits = sum(float(row.get("exits") or 0) for row in source)
    bases = [finite(row.get("avg_headcount")) for row in source]
    valid_bases = [value for value in bases if value is not None and value > 0]
    average_base = sum(valid_bases) / len(valid_bases) if valid_bases else None
    return {
        "exits": exits,
        "average_headcount": average_base,
        "turnover": safe_ratio(exits, average_base) if average_base else None,
        "month_count": len({row.get("month") for row in source if row.get("month")}),
    }


def build_store_bridge(
    store_scores: list[dict[str, Any]],
    turnover: dict[str, Any],
    history: pd.DataFrame | None = None,
    scorecard: pd.DataFrame | None = None,
    hgo: pd.DataFrame | None = None,
) -> dict[str, Any]:
    months = sorted(turnover.get("months") or [])
    last12 = months[-12:]
    by_store: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in turnover.get("rows", []):
        if row.get("month") in last12:
            by_store[normalize_key(row.get("store"))].append(row)

    score_by_store: dict[str, dict[str, Any]] = {}
    if (
        history is not None and not history.empty
        and scorecard is not None and not scorecard.empty
        and last12
    ):
        identity = history[["sicil", "month", "magaza"]].dropna(subset=["sicil", "month"]).copy()
        score_work = scorecard[scorecard["month"].isin(last12)].merge(identity, on=["sicil", "month"], how="left")
        score_work = score_work[score_work["magaza"].map(clean_text).ne("") & score_work["score"].notna()].copy()
        if not score_work.empty:
            score_work["_store_key"] = score_work["magaza"].map(normalize_key)
            grouped_score = score_work.groupby("_store_key", as_index=False).agg(
                avg_scorecard_12m=("score", "mean"),
                scorecard_n=("score", "count"),
            )
            score_by_store = grouped_score.set_index("_store_key").to_dict("index")

    hgo_by_store: dict[str, dict[str, Any]] = {}
    if hgo is not None and not hgo.empty and last12:
        hgo_work = hgo[hgo["month"].isin(last12)].copy()
        hgo_work = hgo_work[hgo_work["store"].map(clean_text).ne("") & hgo_work["hgo"].notna()].copy()
        if not hgo_work.empty:
            hgo_work["_store_key"] = hgo_work["store"].map(normalize_key)
            grouped_hgo = hgo_work.groupby("_store_key", as_index=False).agg(
                avg_hgo_12m=("hgo", "mean"),
                hgo_n=("hgo", "count"),
            )
            hgo_by_store = grouped_hgo.set_index("_store_key").to_dict("index")

    rows: list[dict[str, Any]] = []
    for store in store_scores:
        components = {key: store.get(f"{key}_score") for key in EDUCATION_WEIGHTS}
        education_score, component_count = weighted_score(components, EDUCATION_WEIGHTS, minimum=4)
        store_key = normalize_key(store.get("magaza"))
        turn = cumulative_turnover(by_store.get(store_key, []))
        if education_score is None or turn["turnover"] is None:
            continue
        score_stats = score_by_store.get(store_key, {})
        hgo_stats = hgo_by_store.get(store_key, {})
        rows.append({
            "magaza": store.get("magaza"), "bolge": store.get("bolge"), "il": store.get("il"),
            "education_score": education_score, "component_count": component_count,
            "turnover_12m": turn["turnover"], "exits_12m": turn["exits"],
            "avg_headcount_12m": turn["average_headcount"], "calisan": store.get("calisan"),
            "avg_scorecard_12m": finite(score_stats.get("avg_scorecard_12m")),
            "scorecard_n": int(score_stats.get("scorecard_n") or 0),
            "avg_hgo_12m": finite(hgo_stats.get("avg_hgo_12m")),
            "hgo_n": int(hgo_stats.get("hgo_n") or 0),
            **{f"{key}_score": components[key] for key in components},
        })
    frame = pd.DataFrame(rows)

    def corr_payload(metric: str, label: str, expected: str) -> dict[str, Any]:
        if frame.empty or metric not in frame.columns:
            subset = pd.DataFrame()
        else:
            subset = frame[["education_score", metric]].dropna()
        if len(subset) >= 3:
            pearson_value = subset["education_score"].corr(subset[metric], method="pearson")
            spearman_value = subset["education_score"].corr(subset[metric], method="spearman")
        else:
            pearson_value = spearman_value = np.nan
        return {
            "metric": metric,
            "label": label,
            "n": int(len(subset)),
            "pearson": finite(pearson_value),
            "spearman": finite(spearman_value),
            "expected": expected,
        }

    correlations = [
        corr_payload("turnover_12m", "Son 12 Ay Turnover", "Negatif ilişki daha iyidir"),
        corr_payload("avg_scorecard_12m", "Ortalama Karne", "Pozitif ilişki daha iyidir"),
        corr_payload("avg_hgo_12m", "Ortalama HGO", "Pozitif ilişki daha iyidir"),
    ]

    if not frame.empty:
        education_high = float(frame["education_score"].quantile(0.75))
        turnover_high = float(frame["turnover_12m"].quantile(0.75))
        score_low = float(frame["avg_scorecard_12m"].dropna().quantile(0.25)) if frame["avg_scorecard_12m"].notna().any() else None
        hgo_low = float(frame["avg_hgo_12m"].dropna().quantile(0.25)) if frame["avg_hgo_12m"].notna().any() else None
        for row in rows:
            flags: list[str] = []
            if finite(row.get("education_score")) is not None and row["education_score"] >= education_high:
                if finite(row.get("turnover_12m")) is not None and row["turnover_12m"] >= turnover_high:
                    flags.append("Eğitim güçlü, turnover yüksek")
                if score_low is not None and finite(row.get("avg_scorecard_12m")) is not None and row["avg_scorecard_12m"] <= score_low:
                    flags.append("Eğitim güçlü, karne düşük")
                if hgo_low is not None and finite(row.get("avg_hgo_12m")) is not None and row["avg_hgo_12m"] <= hgo_low:
                    flags.append("Eğitim güçlü, HGO düşük")
            row["anomaly_flags"] = flags
            row["anomaly_count"] = len(flags)
            row["anomaly_main"] = " · ".join(flags) if flags else ""
    else:
        for row in rows:
            row["anomaly_flags"] = []
            row["anomaly_count"] = 0
            row["anomaly_main"] = ""

    turnover_corr = next((item for item in correlations if item["metric"] == "turnover_12m"), {})
    return {
        "months": last12,
        "rows": rows,
        "pearson": turnover_corr.get("pearson"),
        "spearman": turnover_corr.get("spearman"),
        "correlations": correlations,
        "anomalies": sorted(
            [row for row in rows if row.get("anomaly_count")],
            key=lambda row: (-int(row.get("anomaly_count") or 0), -float(row.get("education_score") or 0), -float(row.get("turnover_12m") or 0)),
        ),
        "formula": "Eğitim bileşik puanı turnover hariç beş bileşenden hesaplanır; karne ve HGO son 12 ay ortalamasıdır.",
    }


def build_action_center(store_scores: list[dict[str, Any]], bridge_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Build a selective store action list, not a generic low-score dump.

    Critical stores are marked only when the signal is strong enough:
    very low total score, very low focus component, top-decile turnover combined
    with a weak score, or multiple weak education/compliance components.
    """
    bridge = {normalize_key(row.get("magaza")): row for row in bridge_rows}
    turnover_values = [finite(row.get("turnover_12m")) for row in bridge_rows]
    turnover_values = [value for value in turnover_values if value is not None]
    turnover_high = float(np.quantile(turnover_values, 0.75)) if turnover_values else None
    turnover_critical = float(np.quantile(turnover_values, 0.90)) if turnover_values else None
    labels = {
        "academy": "Satış Akademisi", "enocta": "Enocta", "mandatory": "Zorunlu Eğitim",
        "isg": "İSG", "checklist": "Checklist", "turnover": "Turnover",
    }
    suggestions = {
        "academy": "Katılmayan çalışanları eğitim grubuna planla; düşük örneklem varsa önce kişi listesini doğrula.",
        "enocta": "Başlamayan atamaları yönetici takibine al; tamamlanan ve muaf ayrımını kontrol et.",
        "mandatory": "Eksik zorunlu eğitimleri son tarih ve sorumlu ile yeniden ata.",
        "isg": "İSG tamamlamayan çalışanlara mağaza bazlı aksiyon aç.",
        "checklist": "Yeni başlayan checklist sorumlusu belirle; 10.12.2024 sonrası girişleri ayrıca izle.",
        "turnover": "Çıkış nedenleri, norm/fiili yük ve yönetici değişimi birlikte incelenmeli.",
    }
    component_keys = ["academy", "enocta", "mandatory", "isg", "checklist", "turnover"]
    output: list[dict[str, Any]] = []
    for row in store_scores:
        score = finite(row.get("academy_score_total"))
        focus = clean_text(row.get("focus"))
        focus_score = finite(row.get("focus_score"))
        bridge_row = bridge.get(normalize_key(row.get("magaza")), {})
        turn = finite(bridge_row.get("turnover_12m"))
        components = {key: finite(row.get(f"{key}_score")) for key in component_keys}
        weak_components = [key for key, value in components.items() if value is not None and value < 60]
        very_weak_components = [key for key, value in components.items() if value is not None and value < 45]
        missing_components = [key for key, value in components.items() if value is None]

        severity_rank = -1
        severity = ""
        reasons: list[str] = []
        if score is None:
            severity_rank, severity = 1, "Veri Eksik"
            reasons.append("Toplam puan hesaplanamadı")
        elif score < 55:
            severity_rank, severity = 3, "Kritik"
            reasons.append(f"Toplam puan {score:.1f}")
        elif score < 68 and len(weak_components) >= 2:
            severity_rank, severity = 2, "Yüksek"
            reasons.append(f"{len(weak_components)} zayıf bileşen")
        elif score < 72 and focus_score is not None and focus_score < 55:
            severity_rank, severity = 1, "Orta"
            reasons.append(f"Odak bileşen {focus_score:.1f}")
        if focus_score is not None and focus_score < 45:
            severity_rank, severity = max(severity_rank, 2), "Yüksek" if severity_rank < 3 else severity
            reasons.append(f"Çok zayıf odak bileşen: {labels.get(focus, focus)} {focus_score:.1f}")
        if turn is not None and turnover_critical is not None and turn >= turnover_critical and (score is None or score < 78):
            severity_rank, severity = 3, "Kritik"
            focus, focus_score = "turnover", components.get("turnover")
            reasons.append(f"Turnover üst %10: %{turn * 100:.1f}")
        elif turn is not None and turnover_high is not None and turn >= turnover_high and (score is None or score < 72) and severity_rank < 2:
            severity_rank, severity = 2, "Yüksek"
            focus, focus_score = "turnover", components.get("turnover")
            reasons.append(f"Turnover üst %25: %{turn * 100:.1f}")
        if len(very_weak_components) >= 2:
            severity_rank, severity = 3, "Kritik"
            reasons.append(f"{len(very_weak_components)} bileşen 45 altı")
        if severity_rank < 0:
            continue

        evidence_parts = []
        if focus_score is not None:
            evidence_parts.append(f"{labels.get(focus, focus or 'Odak')}: {focus_score:.1f}")
        if score is not None:
            evidence_parts.append(f"Toplam: {score:.1f}")
        if turn is not None:
            evidence_parts.append(f"Son 12 ay turnover %{turn * 100:.1f}")
        if missing_components:
            evidence_parts.append("Eksik: " + ", ".join(labels.get(key, key) for key in missing_components))
        output.append({
            "magaza": row.get("magaza"), "bolge": row.get("bolge"), "il": row.get("il"),
            "calisan": row.get("calisan"), "ana_problem": labels.get(focus, focus),
            "kanit": " · ".join(evidence_parts) if evidence_parts else "Bileşen verisi eksik",
            "siddet": severity, "neden": " · ".join(dict.fromkeys(reasons)),
            "onerilen_aksiyon": suggestions.get(focus, "Veri kaynağını ve sorumlu süreci incele"),
            "sorumlu": "", "son_tarih": "", "puan": score,
            "academy_score": components.get("academy"), "enocta_score": components.get("enocta"),
            "mandatory_score": components.get("mandatory"), "isg_score": components.get("isg"),
            "checklist_score": components.get("checklist"), "turnover_score": components.get("turnover"),
            "turnover_12m": turn, "metric_count": row.get("metric_count"),
        })
    order = {"Kritik": 0, "Yüksek": 1, "Orta": 2, "Veri Eksik": 3}
    return sorted(output, key=lambda row: (order.get(row["siddet"], 9), row.get("puan") if row.get("puan") is not None else 999, normalize_key(row.get("magaza"))))


def store_role(value: Any) -> tuple[str, int]:
    key = normalize_key(value)
    if "magaza mudur" in key and not any(token in key for token in ["yardim", "ikinci", "2"]):
        return "Mağaza Müdürü", 5
    if "magaza mudur" in key and any(token in key for token in ["yardim", "ikinci", "2"]):
        return "Mağaza Müdür Yardımcısı", 4
    if "pasor" in key:
        return "Pasör Satış Danışmanı", 3
    if "satis danismani" in key:
        return "Satış Danışmanı", 2
    if "kasiyer" in key:
        return "Kasiyer", 1
    return clean_text(value) or "Diğer", 0


def center_role(value: Any) -> tuple[str, int]:
    key = normalize_key(value)
    rules = [
        (7, "Genel Müdür", ["genel mudur", "general manager"]),
        (6, "Direktör", ["direktor", "director"]),
        (5, "Müdür", ["mudur", "manager"]),
        (4, "Yönetici", ["yonetici", "supervisor", "lead"]),
        (3, "Kıdemli Uzman", ["kidemli uzman", "senior specialist", "senior expert", "senior"]),
        (2, "Uzman", ["uzman", "specialist", "expert"]),
        (1, "Uzman Yardımcısı / Memur / Eleman", ["uzman yardimcisi", "memur", "eleman", "staff"]),
    ]
    for rank, label, tokens in rules:
        if any(token in key for token in tokens):
            return label, rank
    return clean_text(value) or "Diğer", 0


def build_promotion_movements(work: pd.DataFrame) -> dict[str, Any]:
    """Create true previous-known-role movements instead of previous-month-only changes."""
    if work is None or work.empty:
        return {"rows": [], "edges": [], "years": []}
    base = work.sort_values(["sicil", "month"]).drop_duplicates(["sicil", "month"], keep="last").copy()
    if "kadro" in base.columns:
        fixed_term = base["kadro"].map(normalize_key).str.contains("belirli sureli", na=False)
        base = base[~fixed_term].copy()
    if base.empty:
        return {"rows": [], "edges": [], "years": []}
    rows: list[dict[str, Any]] = []
    for sicil, history in base.groupby("sicil", sort=False):
        history = history.sort_values("month")
        previous: dict[str, Any] | None = None
        for current in history.to_dict("records"):
            scope = current.get("scope")
            text = " ".join(clean_text(current.get(key)) for key in ["gorev", "magaza_title", "unvan"])
            target, target_rank = store_role(text) if scope == "Mağaza" else center_role(text)
            if previous is None:
                entry_month = parse_datetime(current.get("entry_date"))
                entry_key = entry_month.strftime("%Y-%m") if pd.notna(entry_month) else ""
                if entry_key == current.get("month") and target_rank > 0:
                    rows.append(_movement_row(current, None, target, target_rank, "Dış Aday"))
                previous = {**current, "role": target, "rank": target_rank}
                continue
            source_role = previous.get("role") or "Diğer"
            source_rank = int(previous.get("rank") or 0)
            if target_rank > source_rank and target != source_role:
                rows.append(_movement_row(current, previous, target, target_rank, "İç Terfi"))
            previous = {**current, "role": target, "rank": target_rank}
    edges_map: dict[tuple[str, str, str, str], int] = defaultdict(int)
    for row in rows:
        edges_map[(row["scope"], row["movement"], row["source_role"], row["target_role"])] += 1
    edges = [
        {"scope": key[0], "movement": key[1], "source": key[2], "target": key[3], "count": count}
        for key, count in edges_map.items()
    ]
    return {"rows": rows, "edges": edges, "years": sorted({row["year"] for row in rows})}


def _movement_row(current: dict[str, Any], previous: dict[str, Any] | None, target: str, target_rank: int, movement: str) -> dict[str, Any]:
    month = clean_text(current.get("month"))
    source_role = previous.get("role") if previous else "Dış Aday"
    previous_month = previous.get("month") if previous else ""
    gap = None
    if previous_month and month:
        gap = month_distance(previous_month, month)
    return {
        "month": month, "year": int(month[:4]) if month[:4].isdigit() else None,
        "sicil": current.get("sicil"), "ad_soyad": current.get("ad_soyad"), "scope": current.get("scope"),
        "departman": current.get("departman"), "magaza": current.get("magaza"), "source_role": source_role or "Diğer",
        "target_role": target, "target_rank": target_rank, "movement": movement,
        "gorev": current.get("gorev"), "unvan": current.get("unvan"), "kadro": current.get("kadro"),
        "magaza_title": current.get("magaza_title"), "entry_date": json_safe(current.get("entry_date")),
        "previous_role_month": previous_month,
        "tenure_year": finite(current.get("tenure_year")), "months_since_previous_role": gap,
    }


def build_training_promotion_sankey(
    event_sets: Iterable[tuple[str, pd.DataFrame]],
    promotion_rows: list[dict[str, Any]],
    window_months: int = 12,
    observation_end: str | None = None,
) -> dict[str, Any]:
    promotions: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in promotion_rows:
        if row.get("movement") == "İç Terfi":
            promotions[str(row.get("sicil"))].append(row)
    counts: dict[tuple[str, str], int] = defaultdict(int)
    detail: list[dict[str, Any]] = []
    for source_name, events in event_sets:
        work = dedupe_learning_events(events, source_name)
        if work.empty:
            continue
        work = work[work["status"].map(lambda value: status_flags(value)[1] == 1)].copy()
        work["completion_month"] = work["completed_at"].dt.strftime("%Y-%m")
        work = work[work["completion_month"].notna()]
        latest = work.sort_values(["sicil", "completed_at"]).drop_duplicates("sicil", keep="last")
        for rec in latest.to_dict("records"):
            start = rec["completion_month"]
            window_end = month_add(start, window_months)
            observed_end = min(window_end, observation_end) if observation_end else window_end
            candidates = [row for row in promotions.get(str(rec.get("sicil")), []) if start < row.get("month", "") <= observed_end]
            if candidates:
                target = min(candidates, key=lambda row: row["month"])["target_role"]
            elif observation_end and observation_end < window_end:
                target = "12 Ay Gözlem Süresi Dolmadı"
            else:
                target = "12 Ayda Terfi Yok"
            source = f"{source_name}: {clean_text(rec.get('event'))}"
            counts[(source, target)] += 1
            detail.append({"source": source, "target": target, "sicil": rec.get("sicil"), "completion_month": start})
    # Keep the diagram readable while retaining totals in the detail table.
    source_totals: dict[str, int] = defaultdict(int)
    for (source, _target), count in counts.items():
        source_totals[source] += count
    keep = {source for source, _ in sorted(source_totals.items(), key=lambda item: item[1], reverse=True)[:14]}
    compact: dict[tuple[str, str], int] = defaultdict(int)
    for (source, target), count in counts.items():
        compact[(source if source in keep else "Diğer Eğitimler", target)] += count
    links = [{"source": source, "target": target, "count": count} for (source, target), count in compact.items()]
    return {"window_months": window_months, "links": links, "detail": detail}


def build_training_cohorts(
    event_sets: Iterable[tuple[str, pd.DataFrame]], history: pd.DataFrame, promotion_rows: list[dict[str, Any]], scorecard: pd.DataFrame | None = None
) -> list[dict[str, Any]]:
    if history is None or history.empty:
        return []
    person_month = history.groupby(["sicil", "month"], as_index=False).agg(end=("end", "sum"), exit=("exit", "sum"))
    end_map = {(str(row.sicil), row.month): float(row.end) for row in person_month.itertuples(index=False)}
    exit_map = {(str(row.sicil), row.month): float(row.exit) for row in person_month.itertuples(index=False)}
    promo_map: dict[str, list[str]] = defaultdict(list)
    for row in promotion_rows:
        if row.get("movement") == "İç Terfi":
            promo_map[str(row.get("sicil"))].append(row.get("month"))
    score_map: dict[tuple[str, str], float] = {}
    if scorecard is not None and not scorecard.empty:
        for row in scorecard.itertuples(index=False):
            value = finite(getattr(row, "score", None))
            if value is not None:
                score_map[(str(row.sicil), row.month)] = value
    cohort_people: dict[tuple[str, str], set[str]] = defaultdict(set)
    for source_name, events in event_sets:
        work = dedupe_learning_events(events, source_name)
        if work.empty:
            continue
        done = work[work["status"].map(lambda value: status_flags(value)[1] == 1)].copy()
        done["cohort"] = done["completed_at"].dt.strftime("%Y-%m")
        done = done[done["cohort"].notna()].sort_values(["sicil", "completed_at"]).drop_duplicates(["sicil", "cohort"])
        for row in done.itertuples(index=False):
            cohort_people[(source_name, row.cohort)].add(str(row.sicil))
    output: list[dict[str, Any]] = []
    latest_month = max(history["month"].dropna()) if not history.empty else ""
    for (source, cohort), people in sorted(cohort_people.items()):
        active3_values: list[int] = []
        active6_values: list[int] = []
        exit6_values: list[int] = []
        promoted_values: list[int] = []
        score_changes: list[float] = []
        for sicil in people:
            m3, m6 = month_add(cohort, 3), month_add(cohort, 6)
            if m3 <= latest_month:
                active3_values.append(int(end_map.get((sicil, m3), 0) > 0))
            if m6 <= latest_month:
                active6_values.append(int(end_map.get((sicil, m6), 0) > 0))
                exit6_values.append(int(any(exit_map.get((sicil, month_add(cohort, i)), 0) > 0 for i in range(1, 7))))
                promoted_values.append(int(any(cohort < month <= m6 for month in promo_map.get(sicil, []))))
            before = score_map.get((sicil, cohort))
            after = score_map.get((sicil, m6))
            if before is not None and after is not None:
                score_changes.append(after - before)
        output.append({
            "source": source, "cohort": cohort, "completed_people": len(people),
            "active_3m": safe_ratio(sum(active3_values), len(active3_values)) if active3_values else None,
            "active_3m_n": len(active3_values), "active_6m": safe_ratio(sum(active6_values), len(active6_values)) if active6_values else None,
            "active_6m_n": len(active6_values), "promotion_6m": safe_ratio(sum(promoted_values), len(promoted_values)) if promoted_values else None,
            "promotion_6m_n": len(promoted_values),
            "exit_6m": safe_ratio(sum(exit6_values), len(exit6_values)) if exit6_values else None,
            "exit_6m_n": len(exit6_values),
            "score_change_6m": sum(score_changes) / len(score_changes) if score_changes else None,
            "score_n": len(score_changes),
        })
    return output


def build_hiring_quality(
    hiring: pd.DataFrame,
    history: pd.DataFrame,
    performance: pd.DataFrame | None = None,
    promotion_rows: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    if hiring is None or hiring.empty or history is None or history.empty:
        return []
    work = hiring.copy().reset_index(drop=True)
    work["entry_date"] = pd.to_datetime(work["entry_date"], errors="coerce").dt.normalize()
    work["_row_id"] = np.arange(len(work))
    spell_source = history[history["entry_date"].notna()].copy()
    spell_source["spell_entry_date"] = pd.to_datetime(spell_source["entry_date"], errors="coerce").dt.normalize()
    spells = spell_source.groupby(["sicil", "spell_entry_date"], as_index=False).agg(
        exit_date=("exit_date", "max"), exited=("exit", "max"), spell_tenure_days=("tenure_days", "max")
    )
    valid_hires = work[work["entry_date"].notna() & work["sicil"].ne("")][["_row_id", "sicil", "entry_date"]]
    if not valid_hires.empty and not spells.empty:
        matched = pd.merge_asof(
            valid_hires.sort_values(["entry_date", "sicil"]),
            spells.sort_values(["spell_entry_date", "sicil"]),
            left_on="entry_date", right_on="spell_entry_date", by="sicil",
            direction="nearest", tolerance=pd.Timedelta(days=45),
        )
        work = work.merge(matched[["_row_id", "exit_date", "exited", "spell_tenure_days"]], on="_row_id", how="left")
    else:
        work[["exit_date", "exited", "spell_tenure_days"]] = np.nan
    work["exit_date"] = pd.to_datetime(work["exit_date"], errors="coerce").dt.normalize()
    work["exit_days"] = (work["exit_date"] - work["entry_date"]).dt.days
    missing_exit_days = work["exit_days"].isna() & work["exited"].fillna(0).gt(0)
    work.loc[missing_exit_days, "exit_days"] = numeric(work.loc[missing_exit_days, "spell_tenure_days"])
    latest_month = max(history["month"].dropna())
    observation_end = pd.Period(latest_month, freq="M").end_time.normalize()
    work["observed_days"] = (observation_end - work["entry_date"]).dt.days
    for days, output_col in [(62, "first_2_exit"), (183, "first_6_exit")]:
        observable = work["exit_days"].notna() | work["observed_days"].ge(days)
        work[output_col] = np.where(
            observable,
            np.where(work["exit_days"].notna() & work["exit_days"].le(days), 1.0, 0.0),
            np.nan,
        )
    perf_by_person: dict[str, list[tuple[str, float]]] = defaultdict(list)
    if performance is not None and not performance.empty:
        for row in performance.itertuples(index=False):
            value = finite(row.performance)
            if value is not None and row.month:
                perf_by_person[str(row.sicil)].append((str(row.month), value))
    performance_values: list[float | None] = []
    for row in work.itertuples(index=False):
        if pd.isna(row.entry_date):
            performance_values.append(None)
            continue
        start = row.entry_date.strftime("%Y-%m")
        end = month_add(start, 11)
        values = [value for month, value in perf_by_person.get(str(row.sicil), []) if start <= month <= end]
        performance_values.append(sum(values) / len(values) if values else None)
    work["performance"] = performance_values
    promotion_by_person: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in promotion_rows or []:
        if row.get("movement") == "İç Terfi" and row.get("sicil") and row.get("month"):
            promotion_by_person[str(row.get("sicil"))].append(row)
    promotion_values: list[float | None] = []
    for row in work.itertuples(index=False):
        if pd.isna(row.entry_date):
            promotion_values.append(None)
            continue
        start = row.entry_date.strftime("%Y-%m")
        end = month_add(start, 12)
        if observation_end.strftime("%Y-%m") < end:
            promotion_values.append(None)
            continue
        has_promotion = any(start < clean_text(item.get("month")) <= end for item in promotion_by_person.get(str(row.sicil), []))
        promotion_values.append(1.0 if has_promotion else 0.0)
    work["internal_promotion_12m"] = promotion_values
    work["fill_bucket"] = pd.cut(work["fill_days"], bins=[-np.inf, 15, 30, 45, np.inf], labels=["0-15 Gün", "16-30 Gün", "31-45 Gün", "46+ Gün"])
    rows: list[dict[str, Any]] = []
    for (scope, bucket), group in work.groupby(["scope", "fill_bucket"], observed=True, dropna=False):
        promoted = group["internal_promotion_12m"].dropna()
        rows.append({
            "scope": scope, "fill_bucket": str(bucket), "hires": len(group),
            "avg_fill_days": finite(group["fill_days"].mean()),
            "first_2_exit": finite(group["first_2_exit"].mean()), "first_6_exit": finite(group["first_6_exit"].mean()),
            "first_2_n": int(group["first_2_exit"].notna().sum()), "first_6_n": int(group["first_6_exit"].notna().sum()),
            "avg_performance": finite(group["performance"].mean()), "performance_n": int(group["performance"].notna().sum()),
            "internal_promotion_12m": finite(promoted.mean()) if not promoted.empty else None,
            "internal_promotion_12m_n": int(group["internal_promotion_12m"].notna().sum()),
            "internal_promotion_12m_count": int(promoted.sum()) if not promoted.empty else 0,
        })
    return rows


def build_promotion_quality(
    movements: list[dict[str, Any]],
    history: pd.DataFrame,
    scorecard: pd.DataFrame | None = None,
    hgo: pd.DataFrame | None = None,
    mandatory_events: pd.DataFrame | None = None,
) -> list[dict[str, Any]]:
    """Measure retention and before/after outcomes for each promotion/hire movement."""
    if not movements or history is None or history.empty:
        return []
    person_month = history.groupby(["sicil", "month"], as_index=False).agg(end=("end", "sum"), exit=("exit", "sum"))
    end_map = {(str(row.sicil), row.month): float(row.end) for row in person_month.itertuples(index=False)}
    exit_map = {(str(row.sicil), row.month): float(row.exit) for row in person_month.itertuples(index=False)}
    latest_month = max(history["month"].dropna())
    store_month = history[history["scope"].eq("Mağaza")].groupby(["magaza", "month"], as_index=False).agg(
        exits=("exit", "sum"), start=("start", "sum"), end=("end", "sum")
    )
    store_month["avg_headcount"] = (store_month["start"] + store_month["end"]) / 2
    turnover_by_store: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in store_month.to_dict("records"):
        turnover_by_store[normalize_key(row["magaza"])].append(row)
    score_by_person: dict[str, list[dict[str, Any]]] = defaultdict(list)
    if scorecard is not None and not scorecard.empty:
        for row in scorecard.to_dict("records"):
            score_by_person[str(row.get("sicil"))].append(row)
    hgo_by_store: dict[str, list[dict[str, Any]]] = defaultdict(list)
    if hgo is not None and not hgo.empty:
        for row in hgo.to_dict("records"):
            hgo_by_store[normalize_key(row.get("store"))].append(row)
    mandatory_by_person: dict[str, list[dict[str, Any]]] = defaultdict(list)
    if mandatory_events is not None and not mandatory_events.empty:
        for row in dedupe_learning_events(mandatory_events, "Zorunlu Eğitim").to_dict("records"):
            mandatory_by_person[str(row.get("sicil"))].append(row)

    def average_between(rows: list[dict[str, Any]], value_key: str, start: str, end: str) -> float | None:
        values = [finite(row.get(value_key)) for row in rows if start <= str(row.get("month") or "") <= end]
        valid = [value for value in values if value is not None]
        return sum(valid) / len(valid) if valid else None

    output: list[dict[str, Any]] = []
    for movement in movements:
        month = str(movement.get("month") or "")
        sicil = str(movement.get("sicil") or "")
        store = str(movement.get("magaza") or "")
        before_start, before_end = month_add(month, -12), month_add(month, -1)
        after_start, after_end = month, min(latest_month, month_add(month, 11))
        turn_rows = turnover_by_store.get(normalize_key(store), [])
        before_turn = cumulative_turnover([row for row in turn_rows if before_start <= row.get("month", "") <= before_end])
        after_turn = cumulative_turnover([row for row in turn_rows if after_start <= row.get("month", "") <= after_end])
        score_rows = score_by_person.get(sicil, [])
        before_score = average_between(score_rows, "score", before_start, before_end)
        after_score = average_between(score_rows, "score", after_start, after_end)
        hgo_rows = hgo_by_store.get(normalize_key(store), [])
        before_hgo = average_between(hgo_rows, "hgo", before_start, before_end)
        after_hgo = average_between(hgo_rows, "hgo", after_start, after_end)
        m6, m12 = month_add(month, 6), month_add(month, 12)
        retained6 = int(end_map.get((sicil, m6), 0) > 0) if m6 <= latest_month else None
        retained12 = int(end_map.get((sicil, m12), 0) > 0) if m12 <= latest_month else None
        exited_months = [m for m in [month_add(month, idx) for idx in range(0, 13)] if exit_map.get((sicil, m), 0) > 0]
        role_tenure = None
        if exited_months:
            role_tenure = month_distance(month, min(exited_months))
        mandatory_rows = [
            row for row in mandatory_by_person.get(sicil, [])
            if month <= (row.get("assigned_at").strftime("%Y-%m") if pd.notna(row.get("assigned_at")) else "") <= month_add(month, 12)
        ]
        completed = sum(status_flags(row.get("status"))[1] for row in mandatory_rows)
        exempt = sum(status_flags(row.get("status"))[2] for row in mandatory_rows)
        _completion, compliance = learning_rates(len(mandatory_rows), completed, exempt)
        output.append({
            **movement,
            "retained_6m": retained6, "retained_12m": retained12, "role_tenure_months": role_tenure,
            "turnover_before_12m": before_turn["turnover"], "turnover_after_12m": after_turn["turnover"],
            "turnover_change": (after_turn["turnover"] - before_turn["turnover"]) if after_turn["turnover"] is not None and before_turn["turnover"] is not None else None,
            "score_before_12m": before_score, "score_after_12m": after_score,
            "score_change": (after_score - before_score) if after_score is not None and before_score is not None else None,
            "hgo_before_12m": before_hgo, "hgo_after_12m": after_hgo,
            "hgo_change": (after_hgo - before_hgo) if after_hgo is not None and before_hgo is not None else None,
            "mandatory_compliance_12m": compliance, "mandatory_assigned_12m": len(mandatory_rows),
        })
    return output


def build_data_quality(hiring: pd.DataFrame, history: pd.DataFrame, mandatory: pd.DataFrame) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    def add(area: str, check: str, bad: int, total: int, severity: str, note: str) -> None:
        rows.append({"area": area, "check": check, "issue_count": int(bad), "total": int(total), "rate": safe_ratio(bad, total), "severity": severity, "note": note})

    if hiring is not None and not hiring.empty:
        add("İşe Alım", "Negatif doldurma süresi", int((hiring["fill_days"] < 0).sum()), len(hiring), "Kritik", "Teklif/açılış tarihi sırasını kontrol edin.")
        add("İşe Alım", "180 gün üstü doldurma süresi", int((hiring["fill_days"] > 180).sum()), len(hiring), "Uyarı", "Gerçek uzun süre veya kaynak tarih anomalisi olabilir.")
        add("İşe Alım", "Sicil eksik", int(hiring["sicil"].eq("").sum()), len(hiring), "Kritik", "Kişi eşleştirmesi yapılamaz.")
    if history is not None and not history.empty:
        add("Çalışan", "Ad soyad eksik", int(history["ad_soyad"].eq("").sum()), len(history), "Uyarı", "Profil ve hareket listelerinde boş görünür.")
        add("Turnover", "Negatif dönem başı/sonu", int(((history["start"] < 0) | (history["end"] < 0)).sum()), len(history), "Kritik", "Turnover paydası bozulur.")
    if mandatory is not None and not mandatory.empty:
        allowed = {"Tamamladı", "Muaf", "Devam Ediyor", "Başlamadı", "Katıldı", "Katılmadı"}
        add("Zorunlu Eğitim", "Tanımsız durum", int((~mandatory["status"].isin(allowed)).sum()), len(mandatory), "Uyarı", "Durum eşleme sözlüğünü gözden geçirin.")
        add("Zorunlu Eğitim", "Sicil eksik", int(mandatory["sicil"].eq("").sum()), len(mandatory), "Kritik", "Aktif çalışan eşleşmesi yapılamaz.")
    return rows
