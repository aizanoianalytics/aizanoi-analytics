from __future__ import annotations

import argparse
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

import refresh_data as rd
from dashboard_build_common import json_for_html_script
from dashboard_paths import ADMIN_DASHBOARD, ICMAL_XLSX, PROJECT_ROOT

BASE_DIR = PROJECT_ROOT
DEFAULT_XLSX = ICMAL_XLSX
DEFAULT_OUTPUT = ADMIN_DASHBOARD


def log(msg: str) -> None:
    rd.log_step(f"[ADMIN] {msg}")


def frame_with_sicil(df: pd.DataFrame, candidates: list[str]) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame()
    work = df.copy()
    sicil_col = rd.find_first_col(work, candidates)
    if not sicil_col:
        return pd.DataFrame()
    work["sicil_key"] = work[sicil_col].apply(rd.normalize_sicil_key)
    return work[work["sicil_key"].notna()].copy()


def records(df: pd.DataFrame, cols: list[str], limit: int | None = None) -> list[dict]:
    if df is None or df.empty:
        return []
    keep = [c for c in cols if c in df.columns]
    if not keep:
        return []
    out = df[keep].copy()
    if limit is not None:
        out = out.head(limit)
    return rd.sanitize(out.to_dict("records"))


def compact_by_sicil(
    df: pd.DataFrame,
    cols: list[str],
    sort_cols: list[str] | None = None,
    *,
    max_records_per_sicil: int | None = None,
    max_months: int | None = None,
) -> dict[str, list[list]]:
    if df is None or df.empty or "sicil_key" not in df.columns:
        return {}
    keep = [c for c in cols if c in df.columns]
    if not keep:
        return {}
    work = df[["sicil_key", *keep]].copy()
    if max_months and "month" in work.columns:
        months = safe_months(work)
        if len(months) > max_months:
            work = work[work["month"].astype(str).isin(months[-max_months:])].copy()
    usable_sort = [c for c in (sort_cols or []) if c in work.columns]
    if usable_sort:
        work = work.sort_values(usable_sort, na_position="last")
    out: dict[str, list[list]] = {}
    for sicil_key, group in work.groupby("sicil_key", sort=False):
        if max_records_per_sicil and len(group) > max_records_per_sicil:
            group = group.tail(max_records_per_sicil)
        out[str(sicil_key)] = rd.sanitize(group[keep].to_numpy(dtype=object).tolist())
    return out


def safe_months(df: pd.DataFrame) -> list[str]:
    if df is None or df.empty or "month" not in df.columns:
        return []
    return sorted(df["month"].dropna().astype(str).unique(), key=lambda m: pd.Period(m, freq="M"))


def latest_sicil_frame(df: pd.DataFrame, sort_col: str = "month") -> pd.DataFrame:
    if df is None or df.empty or "sicil_key" not in df.columns:
        return pd.DataFrame()
    work = df.copy()
    if sort_col not in work.columns and "donem" in work.columns:
        work[sort_col] = rd.to_month(pd.to_datetime(work["donem"], errors="coerce"))
    sort_cols = ["sicil_key"] + ([sort_col] if sort_col in work.columns else [])
    return work.sort_values(sort_cols, na_position="last").drop_duplicates("sicil_key", keep="last").copy()


def first_existing_numeric(df: pd.DataFrame, candidates: list[str]) -> pd.Series:
    if df is None or df.empty:
        return pd.Series(dtype="float64")
    for col in candidates:
        if col in df.columns:
            return rd.numeric(df[col])
    return pd.Series([None] * len(df), index=df.index, dtype="float64")


def safe_float(value: object) -> float | None:
    if value is None or pd.isna(value):
        return None
    try:
        out = float(value)
    except Exception:
        return None
    return out if pd.notna(out) else None


def numeric_mean(series: object) -> float | None:
    if series is None:
        return None
    mean_value = rd.numeric(series).dropna().mean()
    return safe_float(mean_value)


def read_optional_karne_data(xlsx_path: Path) -> pd.DataFrame:
    """Kümüle karne verisi yalnızca icmal workbook içinden okunur."""
    for sheet in ["kumule_karne", "Kumule_Karne", "Kümüle_Karne"]:
        try:
            if not xlsx_path.exists():
                log(f"Kümüle karne kaynağı bulunamadı: {xlsx_path}")
                continue
            df = pd.read_excel(xlsx_path, sheet_name=sheet)
            if isinstance(df, pd.DataFrame) and not df.empty:
                return rd.fix_dataframe_turkish(df)
        except (FileNotFoundError, PermissionError, ValueError, pd.errors.EmptyDataError) as exc:
            log(f"'{sheet}' karne sheet'i okunamadı ({type(exc).__name__}): {exc}")
        except Exception as exc:
            log(f"'{sheet}' karne sheet'i okunurken beklenmeyen hata oluştu ({type(exc).__name__}): {exc}")
    return pd.DataFrame()


def build_admin_data(xlsx_path: Path) -> dict:
    started = time.perf_counter()
    log("Kaynaklar okunuyor")
    sources = rd.load_dashboard_sources(xlsx_path, allow_external_fallback=False)
    log("Dashboard sayfa verileri admin için hazırlanıyor")
    dash = rd.build_dashboard_data_from_sources(sources)
    pages = dash.get("pages", {})

    df = sources.get("df", pd.DataFrame()).copy()
    if "month" not in df.columns and "donem" in df.columns:
        df["month"] = rd.to_month(df["donem"])
    if "year" not in df.columns and "donem" in df.columns:
        df["year"] = pd.to_datetime(df["donem"], errors="coerce").dt.year
    df["sicil_key"] = df["sicil_no"].apply(rd.normalize_sicil_key)
    df = df[df["sicil_key"].notna()].copy()
    months = safe_months(df)
    latest_month = months[-1] if months else None
    person_name_map = sources.get("person_name_map", {}) or {}
    phone_map = sources.get("contact_phone_map", {}) or {}

    latest = df.sort_values(["sicil_key", "month"], na_position="last").drop_duplicates("sicil_key", keep="last").copy()
    profile_cols = [
        "sicil_no","tc_kimlik_no","adi_soyadi","cep_telefonu","sirket_eposta","ozel_eposta","month","donem",
        "ust_bolum","departman","departman_adi","bolum_adi","isletme_kodu","isletme_adi","il","gorev","unvan",
        "kadro_adi","cinsiyet","beyaz_mavi_yaka","dogum_tarihi","dogum_yili","yas","kusak_aralik",
        "ise_giris_tarihi","son_giris_tarihi","cikis_tarihi","kidem_yil","kidem_gun","calisan_sayisi",
        "reel_ise_giris","reel_isten_cikis","yonetim_seviye","merkez_title","merkez_seviye","magaza_title",
        "magaza_kırılım","kısa_gorev","calısma_sekli","ucret","ucret_turu","sgk_gun","fazla_mesai_toplam",
        "prim_toplam","kasa_tazminati","net_gelir","temiz_net_gelir","toplam","satis_akademisi_katilim_sayisi",
        "izleme_dk","mezun"
    ]
    timeline_cols = [
        "month","donem","ust_bolum","departman_adi","bolum_adi","isletme_adi","il","gorev","unvan","kadro_adi",
        "yonetim_seviye","magaza_title","merkez_title","kidem_yil","yas","calisan_sayisi","reel_ise_giris",
        "reel_isten_cikis","sgk_gun","fazla_mesai_toplam","ucret","prim_toplam","kasa_tazminati","net_gelir",
        "temiz_net_gelir","toplam","izleme_dk","satis_akademisi_katilim_sayisi","sd_satis","sd_adet","sd_upt",
        "sd_tds","sd_fatura","magaza_hgo","magaza_nps","genel_turnover","ust_bolum_turnover","bolum_turnover"
    ]

    def add_month_column(work: pd.DataFrame) -> pd.DataFrame:
        if work is None or work.empty:
            return pd.DataFrame()
        out = work.copy()
        if "month" not in out.columns:
            month_col = rd.find_first_col(out, ["donem", "Dönem", "Donem", "month"])
            if month_col:
                out["month"] = rd.to_month(pd.to_datetime(out[month_col], errors="coerce"))
        return out

    profile_keep = [c for c in profile_cols if c in latest.columns]
    employees: dict[str, dict] = {}
    employee_search_blobs: dict[str, str] = {}
    for sicil_key, rec in latest[["sicil_key", *profile_keep]].set_index("sicil_key").to_dict("index").items():
        sicil_str = str(sicil_key)
        name = person_name_map.get(sicil_str) or rec.get("adi_soyadi") or rec.get("isim_soyisim")
        phone = phone_map.get(sicil_str) or rec.get("cep_telefonu")
        rec["sicil_key"] = sicil_str
        rec["display_name"] = name
        rec["telefon"] = phone
        search_parts = [
            sicil_str, name, phone, rec.get("tc_kimlik_no"), rec.get("sirket_eposta"), rec.get("ozel_eposta"),
            rec.get("isletme_adi"), rec.get("departman_adi"), rec.get("bolum_adi"), rec.get("il"), rec.get("gorev"),
            rec.get("unvan"), rec.get("kadro_adi"), rec.get("ust_bolum"), rec.get("magaza_title"), rec.get("merkez_title"),
            rec.get("kidem_yil"), rec.get("yonetim_seviye")
        ]
        employee_search_blobs[sicil_str] = rd.normalize_key(" ".join(str(v) for v in search_parts if v is not None))
        employees[sicil_str] = rd.sanitize(rec)

    def prep_named_frame(name: str, sicil_candidates: list[str]) -> pd.DataFrame:
        work = add_month_column(sources.get(name, pd.DataFrame()))
        return frame_with_sicil(work, sicil_candidates)

    timeline = frame_with_sicil(add_month_column(df), ["sicil_no", "sicil"])
    risk = prep_named_frame("risk_df", ["sicil_no", "sicil"])
    perf = prep_named_frame("performans_magaza_df", ["sicil", "sicil_no"])
    scorecard = frame_with_sicil(add_month_column(read_optional_karne_data(xlsx_path)), ["sicil", "sicil_no"])
    academy = prep_named_frame("satis_df", ["sicil", "sicil_no", "sicil_num"])
    enocta = prep_named_frame("enocta_raw_df", ["sicil", "kullanıcı_sicil", "kullanici_sicil", "sicil_no"])
    enocta_summary = prep_named_frame("enocta_ozet_df", ["sicil", "sicil_no"])
    development = prep_named_frame("gelisim_yolculuk_df", ["sicil", "sicil_no", "Kullanıcı Kodu", "Kullanici Kodu"])
    hiring_time = prep_named_frame("ise_alma_suresi_df", ["Sicil No", "sicil_no", "sicil", "P_NO"])
    uzun = prep_named_frame("uzun_df", ["sicil", "sicil_no"])
    katilmayan = prep_named_frame("katilmayan_df", ["sicil", "sicil_no"])
    exit_survey = prep_named_frame("cikis_sebepleri_df", ["Sicil", "sicil", "sicil_no"])
    discipline = prep_named_frame("cezalar_df", ["PERNO", "perno", "sicil", "sicil_no"])
    regrettable_detail = prep_named_frame("v2_regrettable_detail_df", ["sicil_no", "sicil"])
    survival_base = prep_named_frame("v2_survival_base_df", ["sicil_no", "sicil"])

    risk_cols = [
        "month","donem","risk_puani","risk_olasilik","risk_seviyesi","risk_aciklama",
        "ml_risk_component","performance_risk_component","engagement_risk_component","tenure_risk_component",
        "dept_risk_component","momentum_risk_component","trend_risk_component","demographic_risk_component",
        "ust_bolum","departman_adi","isletme_adi","gorev","unvan","kadro_adi"
    ]
    perf_cols = ["month","donem","performans_notu","sonuc_notu","not","yetkinlik_puani","120_li_yetkinlik_puani","dengeli_karne_puani","yetkinlik_puani_25","dengeli_karne_puani_75"]
    scorecard_cols = ["month","donem","sicil","isim_soyisim","sd_satis","sd_adet","sd_upt","sd_tds","sd_fatura","magaza_hgo","magaza_nps","magaza_kart_verme","magaza_yeni_musteri","toplam","karne_kisi_sayisi","karne_satir_sayisi","karne_bilesen_sayisi","sd_satis_yuzde","sd_adet_yuzde","sd_upt_yuzde","sd_tds_yuzde","sd_fatura_yuzde","magaza_hgo_yuzde","magaza_nps_yuzde","magaza_kart_verme_yuzde","magaza_yeni_musteri_yuzde","toplam_yuzde"]
    academy_cols = ["donem","month","egitim_donemi","uzman_yonetici","grup_adi","kisi_adi","katilim_durumu","terfi_durumu","mezun","magaza","bolge","pozisyon","kadro","unvan","marka","calisma_durumu","kidem_yili"]
    enocta_cols = ["donem","month","etkinlik_adi","tamamlama_durumu","puan","izleme_dk","toplam_deneyim_suresi_dk","atanma_tarihi","tamamlama_tarihi","basari_durumu","lokasyon","departman","pozisyon","unvan","bolge","bayi_adi"]
    enocta_summary_cols = ["donem","month","egitim_sayisi","izleme_dk","ust_bolum","isletme_adi","bolum_adi"]
    dev_cols = ["sicil","isim_soyisim","mağaza","bölge","il","gorev","performans_notu","kıdem_yılı","Kullanıcı Kodu","Tamamlama Durumu","Durum Oran","durum_oran"]
    hiring_cols = ["month","D\u00f6nem","Sicil No","Ad\u0131 Soyad\u0131","\u00dcst B\u00f6l\u00fcm","Departman","\u0130\u015fletme Ad\u0131","Departman Ad\u0131","B\u00f6l\u00fcm Ad\u0131","G\u00f6rev","\u00dcnvan","Kadro Ad\u0131","Cinsiyet","Beyaz/Mavi Yaka","\u0130\u015fe Giri\u015f Tarihi","\u00c7\u0131k\u0131\u015f Tarihi","Pozisyon A\u00e7\u0131lma Tarihi  ","Pozisyon A\u00e7\u0131lma Tarihi","Teklif Tarihi","Pozisyon A\u00e7\u0131k G\u00fcn Say\u0131s\u0131","Pozisyon Doldurma S\u00fcresi","Y\u0131l"]
    exit_survey_cols = list(exit_survey.columns) if not exit_survey.empty else []
    discipline_cols = ["ceza_tarihi", "month", "ceza_kodu", "ceza_adi", "ceza_aciklama", "ACIKLAMA", "TARIH", "PERNO", "OCKOD"]
    regrettable_cols = ["donem","month","adi_soyadi","ust_bolum","departman_adi","isletme_adi","gorev","unvan","kadro_adi","cikis_tarihi","ise_giris_tarihi","kidem_yil","performans_skoru","performans_percentile","performans_kaynak","performans_donem"]
    survival_cols = ["adi_soyadi","ust_bolum","departman_adi","isletme_adi","gorev","unvan","ise_giris_tarihi","cikis_tarihi","observation_end","event_exit","duration_months","kidem_yil","yas","kusak_aralik"]

    employee_data = {
        "timeline": {"columns": [c for c in timeline_cols if c in timeline.columns], "by_sicil": compact_by_sicil(timeline, timeline_cols, ["sicil_key", "month"], max_months=24)},
        "risk": {"columns": [c for c in risk_cols if c in risk.columns], "by_sicil": compact_by_sicil(risk, risk_cols, ["sicil_key", "month"])},
        "performance": {"columns": [c for c in perf_cols if c in perf.columns], "by_sicil": compact_by_sicil(perf, perf_cols, ["sicil_key", "month"])},
        "scorecard": {"columns": [c for c in scorecard_cols if c in scorecard.columns], "by_sicil": compact_by_sicil(scorecard, scorecard_cols, ["sicil_key", "month"], max_records_per_sicil=24)},
        "academy": {"columns": [c for c in academy_cols if c in academy.columns], "by_sicil": compact_by_sicil(academy, academy_cols, ["sicil_key", "donem"])},
        "enocta": {"columns": [c for c in enocta_cols if c in enocta.columns], "by_sicil": compact_by_sicil(enocta, enocta_cols, ["sicil_key", "month"], max_records_per_sicil=20)},
        "enocta_summary": {"columns": [c for c in enocta_summary_cols if c in enocta_summary.columns], "by_sicil": compact_by_sicil(enocta_summary, enocta_summary_cols, ["sicil_key", "month"], max_months=24)},
        "development": {"columns": [c for c in dev_cols if c in development.columns], "by_sicil": compact_by_sicil(development, dev_cols, ["sicil_key"])},
        "hiring_time": {"columns": [c for c in hiring_cols if c in hiring_time.columns], "by_sicil": compact_by_sicil(hiring_time, hiring_cols, ["sicil_key", "month"])},
        "long_no_training": {"columns": [c for c in uzun.columns if c != "sicil_key"], "by_sicil": compact_by_sicil(uzun, [c for c in uzun.columns if c != "sicil_key"], ["sicil_key"])},
        "non_attending": {"columns": [c for c in katilmayan.columns if c != "sicil_key"], "by_sicil": compact_by_sicil(katilmayan, [c for c in katilmayan.columns if c != "sicil_key"], ["sicil_key"])},
        "exit_survey": {"columns": [c for c in exit_survey_cols if c != "sicil_key"], "by_sicil": compact_by_sicil(exit_survey, [c for c in exit_survey_cols if c != "sicil_key"], ["sicil_key"])},
        "discipline": {"columns": [c for c in discipline_cols if c in discipline.columns], "by_sicil": compact_by_sicil(discipline, discipline_cols, ["sicil_key", "ceza_tarihi"])},
        "regrettable": {"columns": [c for c in regrettable_cols if c in regrettable_detail.columns], "by_sicil": compact_by_sicil(regrettable_detail, regrettable_cols, ["sicil_key", "donem"])},
        "survival": {"columns": [c for c in survival_cols if c in survival_base.columns], "by_sicil": compact_by_sicil(survival_base, survival_cols, ["sicil_key"])},
    }

    for sicil_key, emp in employees.items():
        emp["has_risk"] = sicil_key in employee_data["risk"]["by_sicil"]
        emp["has_exit"] = sicil_key in employee_data["exit_survey"]["by_sicil"] or sicil_key in employee_data["regrettable"]["by_sicil"]
        emp["has_training"] = sicil_key in employee_data["academy"]["by_sicil"] or sicil_key in employee_data["enocta"]["by_sicil"]
        emp["has_scorecard"] = sicil_key in employee_data["scorecard"]["by_sicil"]
        emp["has_discipline"] = sicil_key in employee_data["discipline"]["by_sicil"]
        emp["has_hiring_time"] = sicil_key in employee_data["hiring_time"]["by_sicil"]

    def latest_month_frame(work: pd.DataFrame) -> pd.DataFrame:
        if work is None or work.empty or "month" not in work.columns:
            return pd.DataFrame()
        months_local = safe_months(work)
        if not months_local:
            return pd.DataFrame()
        return work[work["month"].astype(str) == months_local[-1]].copy()

    active_latest = latest_month_frame(timeline)
    if not active_latest.empty and "calisan_sayisi" in active_latest.columns:
        active_latest = active_latest[rd.numeric(active_latest["calisan_sayisi"]).fillna(0) > 0].copy()
    elif not active_latest.empty and "cikis_tarihi" in active_latest.columns:
        active_latest = active_latest[active_latest["cikis_tarihi"].isna()].copy()

    headcount_trend = []
    if not timeline.empty and "month" in timeline.columns:
        for month, group in timeline.groupby("month", dropna=True):
            row = {"month": str(month), "count": int(group["sicil_key"].nunique())}
            if "ust_bolum" in group.columns:
                for loc, loc_group in group.groupby("ust_bolum", dropna=False):
                    row[str(rd.fix_text(loc))] = int(loc_group["sicil_key"].nunique())
            headcount_trend.append(row)
        headcount_trend.sort(key=lambda r: pd.Period(r["month"], freq="M"))

    scope_breakdown = []
    if not active_latest.empty and "ust_bolum" in active_latest.columns:
        scope_breakdown = [
            {"label": str(rd.fix_text(label)), "count": int(group["sicil_key"].nunique())}
            for label, group in active_latest.groupby("ust_bolum", dropna=False)
        ]
        scope_breakdown.sort(key=lambda r: -r["count"])

    latest_risk = latest_month_frame(risk)
    risk_dist = []
    top_risk = []
    if not latest_risk.empty:
        if "risk_seviyesi" in latest_risk.columns:
            risk_dist = [{"label": str(rd.fix_text(k)), "count": int(v)} for k, v in latest_risk["risk_seviyesi"].fillna("Bilinmiyor").value_counts().items()]
        if "risk_puani" in latest_risk.columns:
            top_cols = [c for c in ["sicil_no","adi_soyadi","ust_bolum","departman_adi","isletme_adi","gorev","unvan","risk_puani","risk_olasilik","risk_seviyesi","risk_aciklama"] if c in latest_risk.columns]
            top_risk = records(latest_risk.sort_values("risk_puani", ascending=False, na_position="last"), top_cols, 100)

    v2_burnout = add_month_column(sources.get("v2_burnout_df", pd.DataFrame()))
    latest_burnout = latest_month_frame(v2_burnout)
    burnout_rows = records(latest_burnout.sort_values("operasyonel_yuk_skoru", ascending=False, na_position="last") if "operasyonel_yuk_skoru" in latest_burnout.columns else latest_burnout, ["donem","ust_bolum","ortalama_headcount","fazla_mesai_saat","fazla_mesai_kisi_basi","izin_yuku_orani","eksik_sgk_gun","operasyonel_yuk_skoru","risk_seviyesi","veri_kapsam_agirligi"], 100)

    v2_reg = add_month_column(sources.get("v2_regrettable_df", pd.DataFrame()))
    v2_reg_rows = records(v2_reg.sort_values("donem") if "donem" in v2_reg.columns else v2_reg, ["donem","scope","ortalama_headcount","toplam_cikis","regrettable_cikis","high_perf_headcount","regrettable_turnover_rate","high_perf_attrition_rate","regrettable_share_of_exits","performans_verisi_olan","data_quality"], None)

    survival_summary = records(sources.get("v2_survival_summary_df", pd.DataFrame()), ["scope","n","events","censored","survival_3m","survival_6m","survival_12m","survival_24m","survival_36m","survival_60m","median_duration_months"], None)
    survival_curve = records(sources.get("v2_survival_curve_df", pd.DataFrame()), ["scope","tenure_month","at_risk","events","censored","survival_probability"], None)

    latest_risk_person = latest_sicil_frame(risk)
    latest_perf_person = latest_sicil_frame(perf)
    latest_score_person = latest_sicil_frame(scorecard)
    active_analysis_cols = [
        c for c in [
            "sicil_key", "sicil_no", "adi_soyadi", "ust_bolum", "departman_adi", "bolum_adi",
            "isletme_adi", "il", "gorev", "unvan", "kadro_adi", "kidem_yil", "yas",
            "satis_akademisi_katilim_sayisi", "izleme_dk", "prim_toplam", "fazla_mesai_toplam",
            "net_gelir", "temiz_net_gelir", "toplam", "toplam_yuzde", "genel_turnover", "ust_bolum_turnover", "bolum_turnover"
        ] if c in active_latest.columns
    ]
    analysis = active_latest[active_analysis_cols].drop_duplicates("sicil_key").copy() if active_analysis_cols and "sicil_key" in active_latest.columns else pd.DataFrame()
    if not analysis.empty:
        if not latest_risk_person.empty and "risk_puani" in latest_risk_person.columns:
            risk_small = latest_risk_person[["sicil_key", "risk_puani", "risk_seviyesi"]].copy()
            risk_small["risk_puani"] = rd.numeric(risk_small["risk_puani"])
            analysis = analysis.merge(risk_small, on="sicil_key", how="left")
        if not latest_perf_person.empty:
            perf_small = latest_perf_person[["sicil_key"]].copy()
            perf_small["performans_skoru"] = first_existing_numeric(
                latest_perf_person,
                ["performans_notu", "yetkinlik_puani", "dengeli_karne_puani", "sonuc_notu"],
            )
            analysis = analysis.merge(perf_small, on="sicil_key", how="left")
        if not latest_score_person.empty:
            score_small = latest_score_person[["sicil_key"]].copy()
            score_small["karne_toplam"] = first_existing_numeric(latest_score_person, ["toplam_yuzde", "toplam"])
            analysis = analysis.merge(score_small, on="sicil_key", how="left")
        analysis["performans_bilesik"] = rd.numeric(analysis.get("performans_skoru", pd.Series(index=analysis.index))).combine_first(
            rd.numeric(analysis.get("karne_toplam", pd.Series(index=analysis.index)))
        )

    active_sicils = set(active_latest["sicil_key"].astype(str)) if not active_latest.empty and "sicil_key" in active_latest.columns else set(employees.keys())
    score_sicils = set(scorecard["sicil_key"].astype(str)) if not scorecard.empty and "sicil_key" in scorecard.columns else set()
    perf_sicils = set(perf["sicil_key"].astype(str)) if not perf.empty and "sicil_key" in perf.columns else set()
    risk_sicils = set(risk["sicil_key"].astype(str)) if not risk.empty and "sicil_key" in risk.columns else set()
    academy_sicils = set(academy["sicil_key"].astype(str)) if not academy.empty and "sicil_key" in academy.columns else set()
    enocta_sicils = set(enocta["sicil_key"].astype(str)) if not enocta.empty and "sicil_key" in enocta.columns else set()
    active_count = len(active_sicils)

    def pct_count(num: int, denom: int) -> float | None:
        return rd.safe_div(float(num), float(denom)) if denom else None

    phone_missing = sum(1 for key in active_sicils if not employees.get(str(key), {}).get("telefon"))
    region_missing = 0
    store_missing = 0
    if not active_latest.empty:
        if "departman_adi" in active_latest.columns:
            region_missing = int(active_latest[active_latest["sicil_key"].astype(str).isin(active_sicils)]["departman_adi"].isna().sum())
        if "isletme_adi" in active_latest.columns:
            store_missing = int(active_latest[active_latest["sicil_key"].astype(str).isin(active_sicils)]["isletme_adi"].isna().sum())

    data_quality_cards = [
        {"label": "Aktif çalışan", "value": active_count, "detail": "Son aktif dönemde tekil sicil"},
        {"label": "Risk eşleşmesi", "value": len(active_sicils & risk_sicils), "ratio": pct_count(len(active_sicils & risk_sicils), active_count)},
        {"label": "Performans eşleşmesi", "value": len(active_sicils & perf_sicils), "ratio": pct_count(len(active_sicils & perf_sicils), active_count)},
        {"label": "Karne eşleşmesi", "value": len(active_sicils & score_sicils), "ratio": pct_count(len(active_sicils & score_sicils), active_count)},
        {"label": "Eğitim eşleşmesi", "value": len(active_sicils & (academy_sicils | enocta_sicils)), "ratio": pct_count(len(active_sicils & (academy_sicils | enocta_sicils)), active_count)},
        {"label": "Telefon eksik", "value": phone_missing, "ratio": pct_count(phone_missing, active_count)},
        {"label": "Bölge eksik", "value": region_missing, "ratio": pct_count(region_missing, active_count)},
        {"label": "Mağaza/Birim eksik", "value": store_missing, "ratio": pct_count(store_missing, active_count)},
    ]
    data_quality_issues = [
        {"kontrol": "Karne eşleşmeyen aktif çalışan", "adet": active_count - len(active_sicils & score_sicils), "oran": pct_count(active_count - len(active_sicils & score_sicils), active_count), "aksiyon": "Mağaza karne kapsamı ve sicil eşleşmesi kontrol edilmeli."},
        {"kontrol": "Performans eşleşmeyen aktif çalışan", "adet": active_count - len(active_sicils & perf_sicils), "oran": pct_count(active_count - len(active_sicils & perf_sicils), active_count), "aksiyon": "performans_magaza_verileri sheet kapsamı kontrol edilmeli."},
        {"kontrol": "Risk eşleşmeyen aktif çalışan", "adet": active_count - len(active_sicils & risk_sicils), "oran": pct_count(active_count - len(active_sicils & risk_sicils), active_count), "aksiyon": "Magaza_ML_risk üretim kapsamı kontrol edilmeli."},
        {"kontrol": "Telefon eksik", "adet": phone_missing, "oran": pct_count(phone_missing, active_count), "aksiyon": "Calisan_Bilgisi_Raporu / iletişim fallback alanları kontrol edilmeli."},
    ]

    segment_summary: list[dict] = []
    segment_rows: list[dict] = []
    segment_by_sicil: dict[str, str] = {}
    if not analysis.empty and "risk_puani" in analysis.columns and "performans_bilesik" in analysis.columns:
        perf_valid = rd.numeric(analysis["performans_bilesik"]).dropna()
        perf_threshold = float(perf_valid.quantile(0.60)) if len(perf_valid) else None

        def segment_label(row: pd.Series) -> str:
            risk_val = float(row.get("risk_puani")) if pd.notna(row.get("risk_puani")) else None
            perf_val = float(row.get("performans_bilesik")) if pd.notna(row.get("performans_bilesik")) else None
            if risk_val is None or perf_val is None or perf_threshold is None:
                return "Veri Eksik"
            high_perf = perf_val >= perf_threshold
            high_risk = risk_val >= 60
            if high_perf and not high_risk:
                return "Star Performer"
            if high_perf and high_risk:
                return "Flight Risk"
            if (not high_perf) and not high_risk:
                return "Gelişim Fırsatı"
            return "Kritik Takip"

        analysis["segment"] = analysis.apply(segment_label, axis=1)
        segment_by_sicil = analysis.set_index("sicil_key")["segment"].astype(str).to_dict()
        segment_summary = [
            {"segment": str(seg), "count": int(len(group)), "avg_risk": numeric_mean(group.get("risk_puani")) if "risk_puani" in group.columns else None, "avg_performance": numeric_mean(group.get("performans_bilesik")) if "performans_bilesik" in group.columns else None}
            for seg, group in analysis.groupby("segment", dropna=False)
        ]
        segment_order = {"Flight Risk": 0, "Kritik Takip": 1, "Star Performer": 2, "Gelişim Fırsatı": 3, "Veri Eksik": 4}
        segment_rows = records(
            analysis.sort_values(
                by=["segment", "risk_puani", "performans_bilesik"],
                key=lambda s: s.map(segment_order).fillna(9) if s.name == "segment" else s,
                ascending=[True, False, False],
                na_position="last",
            ),
            ["sicil_no", "adi_soyadi", "ust_bolum", "departman_adi", "isletme_adi", "gorev", "segment", "risk_puani", "risk_seviyesi", "performans_bilesik", "karne_toplam"],
            300,
        )

    alerts: list[dict] = []
    if not latest_risk_person.empty and "risk_puani" in latest_risk_person.columns:
        high_risk = latest_risk_person.copy()
        high_risk["risk_puani"] = rd.numeric(high_risk["risk_puani"])
        high_risk = high_risk[high_risk["risk_puani"] >= 75].sort_values("risk_puani", ascending=False).head(50)
        for row in high_risk.to_dict("records"):
            key = str(row.get("sicil_key"))
            emp = employees.get(key, {})
            alerts.append({"tip": "Kritik Risk", "öncelik": "Yüksek", "sicil_no": emp.get("sicil_no") or row.get("sicil_no"), "ad_soyad": emp.get("display_name") or row.get("adi_soyadi"), "birim": emp.get("isletme_adi") or emp.get("departman_adi"), "değer": row.get("risk_puani"), "aksiyon": "Risk görüşmesi ve bağlılık nedenleri incelenmeli."})
    if not risk.empty and {"sicil_key", "risk_puani"}.issubset(risk.columns):
        risk_work = risk[["sicil_key", "month", "risk_puani"]].copy()
        risk_work["risk_puani"] = rd.numeric(risk_work["risk_puani"])
        for key, group in risk_work.dropna(subset=["risk_puani"]).sort_values(["sicil_key", "month"]).groupby("sicil_key"):
            if len(group) < 2:
                continue
            prev, cur = group.iloc[-2], group.iloc[-1]
            delta = float(cur["risk_puani"] - prev["risk_puani"])
            if delta >= 20:
                emp = employees.get(str(key), {})
                alerts.append({"tip": "Risk Sıçraması", "öncelik": "Yüksek", "sicil_no": emp.get("sicil_no") or key, "ad_soyad": emp.get("display_name"), "birim": emp.get("isletme_adi") or emp.get("departman_adi"), "değer": round(delta, 1), "aksiyon": "Son iki dönem risk artış nedeni kontrol edilmeli."})
    if not latest_burnout.empty and "operasyonel_yuk_skoru" in latest_burnout.columns:
        burn = latest_burnout.copy()
        burn["operasyonel_yuk_skoru"] = rd.numeric(burn["operasyonel_yuk_skoru"])
        burn = burn[burn["operasyonel_yuk_skoru"] >= 65].sort_values("operasyonel_yuk_skoru", ascending=False).head(20)
        for row in burn.to_dict("records"):
            alerts.append({"tip": "Burnout", "öncelik": "Orta/Yüksek", "sicil_no": "", "ad_soyad": "", "birim": row.get("ust_bolum"), "değer": row.get("operasyonel_yuk_skoru"), "aksiyon": "Fazla mesai, izin yükü ve eksik kadro birlikte değerlendirilmeli."})
    alerts = rd.sanitize(alerts[:120])

    correlations: list[dict] = []
    if not analysis.empty:
        corr_source = pd.DataFrame(index=analysis.index)
        metric_map = {
            "Risk Puanı": "risk_puani",
            "Performans": "performans_bilesik",
            "Karne": "karne_toplam",
            "Eğitim Katılım": "satis_akademisi_katilim_sayisi",
            "İzleme Dk": "izleme_dk",
            "Prim": "prim_toplam",
            "Fazla Mesai": "fazla_mesai_toplam",
            "Kıdem": "kidem_yil",
            "Net Gelir": "net_gelir",
        }
        for label, col in metric_map.items():
            if col in analysis.columns:
                corr_source[label] = rd.numeric(analysis[col])
        corr_pairs = [
            ("Eğitim Katılım", "Performans"),
            ("İzleme Dk", "Performans"),
            ("Kıdem", "Risk Puanı"),
            ("Fazla Mesai", "Risk Puanı"),
            ("Prim", "Performans"),
            ("Net Gelir", "Risk Puanı"),
            ("Karne", "Risk Puanı"),
            ("Karne", "Performans"),
        ]
        for left, right in corr_pairs:
            if left not in corr_source.columns or right not in corr_source.columns:
                continue
            pair = corr_source[[left, right]].dropna()
            if len(pair) < 30:
                continue
            if pair[left].nunique(dropna=True) < 2 or pair[right].nunique(dropna=True) < 2:
                continue
            corr = safe_float(pair[left].corr(pair[right]))
            if corr is None:
                continue
            strength = "Güçlü" if abs(corr) >= 0.50 else "Orta" if abs(corr) >= 0.30 else "Zayıf"
            direction = "Pozitif" if corr > 0 else "Negatif" if corr < 0 else "Nötr"
            correlations.append({"metrik_1": left, "metrik_2": right, "korelasyon": corr, "n": int(len(pair)), "yorum": f"{strength} {direction}"})

    effectiveness_rows: list[dict] = []
    heatmap_rows: list[dict] = []
    if not analysis.empty:
        analysis["risk_high_flag"] = rd.numeric(analysis.get("risk_puani", pd.Series(index=analysis.index))) >= 60
        training_raw = rd.numeric(analysis.get("satis_akademisi_katilim_sayisi", pd.Series(index=analysis.index))).fillna(0)
        watch_raw = rd.numeric(analysis.get("izleme_dk", pd.Series(index=analysis.index))).fillna(0)
        analysis["training_flag"] = (training_raw > 0) | (watch_raw > 0)
        for group_type, group_col in [("Mağaza", "isletme_adi"), ("Bölge", "departman_adi")]:
            if group_col not in analysis.columns:
                continue
            for group_name, group in analysis.dropna(subset=[group_col]).groupby(group_col):
                hc = int(group["sicil_key"].nunique())
                if hc < 3:
                    continue
                row = {
                    "tip": group_type,
                    "birim": str(rd.fix_text(group_name)),
                    "headcount": hc,
                    "avg_risk": numeric_mean(group.get("risk_puani")) if "risk_puani" in group.columns else None,
                    "high_risk_pct": safe_float(group["risk_high_flag"].mean()) if "risk_high_flag" in group.columns else None,
                    "avg_performance": numeric_mean(group.get("performans_bilesik")) if "performans_bilesik" in group.columns else None,
                    "avg_scorecard": numeric_mean(group.get("karne_toplam")) if "karne_toplam" in group.columns else None,
                    "training_rate": safe_float(group["training_flag"].mean()) if "training_flag" in group.columns else None,
                    "avg_overtime": numeric_mean(group.get("fazla_mesai_toplam")) if "fazla_mesai_toplam" in group.columns else None,
                    "turnover": numeric_mean(group.get("bolum_turnover")) if "bolum_turnover" in group.columns else None,
                }
                effectiveness_rows.append(row)
                heatmap_rows.append(row.copy())
        effectiveness_rows = sorted(effectiveness_rows, key=lambda r: (r.get("avg_risk") if r.get("avg_risk") is not None else -1), reverse=True)[:300]
        heatmap_rows = sorted(heatmap_rows, key=lambda r: (r.get("high_risk_pct") if r.get("high_risk_pct") is not None else -1), reverse=True)[:120]

    for sicil_key, emp in employees.items():
        key = str(sicil_key)
        emp["has_performance"] = key in perf_sicils
        emp["segment"] = segment_by_sicil.get(key)
        emp["missing_scorecard"] = key in active_sicils and key not in score_sicils
        emp["missing_performance"] = key in active_sicils and key not in perf_sicils
        emp["missing_risk"] = key in active_sicils and key not in risk_sicils

    # Dashboard tarafında üretilen hazır satırları admin panelde de kullanıyoruz.
    latest_page_month = latest_month or (dash.get("months") or [None])[-1]
    def page_month_rows(page_key: str, row_path: list[str], month: str | None = None) -> list[dict]:
        page = pages.get(page_key, {}) or {}
        month = month or latest_page_month
        obj = page.get("by_month", {}).get(month, {}) if isinstance(page.get("by_month"), dict) else page
        for key in row_path:
            if isinstance(obj, dict):
                obj = obj.get(key, [])
            else:
                return []
        return obj if isinstance(obj, list) else []

    promo_page = pages.get("p033_promotion_movements", {}) or {}
    promotions_latest = {}
    if latest_page_month and isinstance(promo_page.get("by_month"), dict):
        promotions_latest = promo_page.get("by_month", {}).get(latest_page_month, {}) or {}

    departed_rows = page_month_rows("p030_departed_people", ["rows"])
    academy_registry_rows = (pages.get("p032_sales_academy_registry", {}) or {}).get("rows", [])
    academy_non_attending_rows = (pages.get("p019_katilimayanlar", {}) or {}).get("rows", [])
    long_training_rows = (pages.get("p020_uzun_sure", {}) or {}).get("rows", [])
    org_dev_latest = (pages.get("p037_org_dev_employee_tracking", {}) or {}).get("by_month", {}).get((pages.get("p037_org_dev_employee_tracking", {}) or {}).get("latest_month"), {}) if pages.get("p037_org_dev_employee_tracking") else {}
    academy_dev_latest = page_month_rows("p036_academy_development_journey", ["rows"])
    discipline_recent = (
        discipline.sort_values("ceza_tarihi", ascending=False, na_position="last")
        if not discipline.empty and "ceza_tarihi" in discipline.columns
        else discipline
    )

    tables = {
        "top_risk": top_risk,
        "burnout": burnout_rows,
        "regrettable": v2_reg_rows,
        "survival_summary": survival_summary,
        "departed": departed_rows,
        "merkez_promotion_rows": promotions_latest.get("merkez_rows", []) if promotions_latest else [],
        "magaza_promotion_rows": promotions_latest.get("store_rows", []) if promotions_latest else [],
        "merkez_promotion_summary": promotions_latest.get("merkez_summary", []) if promotions_latest else [],
        "magaza_promotion_summary": promotions_latest.get("store_summary", []) if promotions_latest else [],
        "academy_registry": academy_registry_rows,
        "academy_non_attending": academy_non_attending_rows,
        "long_training": long_training_rows,
        "org_dev_tracking": org_dev_latest.get("rows", []) if isinstance(org_dev_latest, dict) else [],
        "academy_development": academy_dev_latest,
        "discipline_recent": records(discipline_recent, [c for c in discipline_cols if c in discipline_recent.columns], 500),
        "hiring_time_latest": records(
            hiring_time.sort_values("month", ascending=False, na_position="last") if not hiring_time.empty and "month" in hiring_time.columns else hiring_time,
            [c for c in hiring_cols if c in hiring_time.columns],
            500,
        ),
        "regrettable_detail": records(regrettable_detail, [c for c in regrettable_cols if c in regrettable_detail.columns], 500),
        "scorecard_latest": records(
            latest_month_frame(scorecard).sort_values(
                "toplam_yuzde" if "toplam_yuzde" in scorecard.columns else "toplam",
                ascending=False,
                na_position="last",
            ) if not scorecard.empty and ("toplam_yuzde" in scorecard.columns or "toplam" in scorecard.columns) else latest_month_frame(scorecard),
            [c for c in scorecard_cols if c in scorecard.columns],
            250,
        ),
        "data_quality_cards": data_quality_cards,
        "data_quality_issues": data_quality_issues,
        "segment_summary": segment_summary,
        "segment_rows": segment_rows,
        "alerts": alerts,
        "correlations": correlations,
        "effectiveness": rd.sanitize(effectiveness_rows),
        "heatmap": rd.sanitize(heatmap_rows),
    }

    charts = {
        "headcount_trend": headcount_trend,
        "scope_breakdown": scope_breakdown,
        "risk_distribution": risk_dist,
        "survival_curve": survival_curve,
    }

    search_index = [
        {
            "sicil_key": key,
            "sicil_no": emp.get("sicil_no") or key,
            "name": emp.get("display_name") or emp.get("adi_soyadi"),
            "unit": emp.get("isletme_adi") or emp.get("departman_adi") or emp.get("bolum_adi"),
            "title": emp.get("gorev") or emp.get("unvan") or emp.get("kadro_adi"),
            "scope": emp.get("ust_bolum"),
            "search_blob": employee_search_blobs.get(key),
            "has_risk": emp.get("has_risk"),
            "has_exit": emp.get("has_exit"),
            "has_training": emp.get("has_training"),
            "has_scorecard": emp.get("has_scorecard"),
            "has_discipline": emp.get("has_discipline"),
            "has_hiring_time": emp.get("has_hiring_time"),
            "has_performance": emp.get("has_performance"),
            "missing_scorecard": emp.get("missing_scorecard"),
            "missing_performance": emp.get("missing_performance"),
            "missing_risk": emp.get("missing_risk"),
            "segment": emp.get("segment"),
        }
        for key, emp in employees.items()
    ]
    search_index.sort(key=lambda r: str(r.get("name") or ""))

    payload = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source_xlsx": str(xlsx_path.name),
            "latest_month": latest_month,
            "months": months,
            "employee_count": len(employees),
            "build_seconds": round(time.perf_counter() - started, 2),
            "note": "Statik admin panel. Maskeleme yoktur; dosya erişimi olan kişi tüm gömülü veriyi görebilir.",
        },
        "employees": employees,
        "search_index": search_index,
        "employee_data": employee_data,
        "charts": charts,
        "tables": tables,
        "dashboard_pages_available": sorted(pages.keys()),
    }
    return rd.normalize_text_payload(payload)

ADMIN_TEMPLATE = r'''<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ERD P Admin Panel</title>
  <style>
    :root {
      --bg: #08111f;
      --bg-2: #0d1728;
      --panel: rgba(17, 28, 48, 0.88);
      --panel-2: rgba(24, 38, 62, 0.92);
      --text: #eef4ff;
      --muted: #95a5bd;
      --soft: #c8d5e8;
      --border: rgba(148, 163, 184, 0.18);
      --blue: #3b82f6;
      --cyan: #06b6d4;
      --green: #22c55e;
      --amber: #f59e0b;
      --rose: #fb7185;
      --red: #ef4444;
      --violet: #8b5cf6;
      --shadow: 0 24px 70px rgba(0,0,0,0.34);
      --radius: 22px;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; max-width: 100%; overflow-x: hidden; }
    body {
      margin: 0;
      min-height: 100vh;
      max-width: 100%;
      overflow-x: hidden;
      color: var(--text);
      background:
        radial-gradient(circle at 12% 8%, rgba(59,130,246,0.22), transparent 34%),
        radial-gradient(circle at 92% 12%, rgba(6,182,212,0.16), transparent 32%),
        linear-gradient(135deg, #07101e 0%, #0b1220 55%, #111827 100%);
    }
    button, input, select { font: inherit; }
    .app { display: grid; grid-template-columns: 310px minmax(0, 1fr); width: 100%; min-width: 0; max-width: 100%; min-height: 100vh; }
    .sidebar {
      position: sticky; top: 0; height: 100vh; overflow: auto;
      min-width: 0; max-width: 100%;
      padding: 22px 18px; background: rgba(4, 10, 22, 0.78);
      border-right: 1px solid var(--border); backdrop-filter: blur(18px);
    }
    .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
    .mark {
      width: 44px; height: 44px; border-radius: 16px;
      background: conic-gradient(from 210deg, var(--blue), var(--cyan), var(--green), var(--blue));
      box-shadow: 0 12px 30px rgba(59,130,246,0.28);
      position: relative;
    }
    .mark:after { content: ""; position: absolute; inset: 10px; border-radius: 10px; background: rgba(8,17,31,0.86); }
    .brand h1 { font-size: 17px; margin: 0; letter-spacing: .04em; }
    .brand p { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
    .nav-title { color: var(--muted); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; margin: 22px 0 8px; }
    .nav a {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      color: var(--soft); text-decoration: none; padding: 10px 12px; border-radius: 14px;
      border: 1px solid transparent; margin: 3px 0; font-size: 13px;
    }
    .nav a:hover, .nav a.active { background: rgba(59,130,246,.12); border-color: rgba(59,130,246,.25); color: white; }
    .nav .pill { color: var(--muted); font-size: 11px; }
    .content { padding: 24px; max-width: 1760px; width: 100%; min-width: 0; margin: 0 auto; }
    .hero {
      display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(340px, .8fr); gap: 18px;
      align-items: stretch; margin-bottom: 18px;
    }
    .hero-card, .card {
      min-width: 0;
      background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius);
      box-shadow: var(--shadow); backdrop-filter: blur(16px);
    }
    .hero-card { padding: 24px; position: relative; overflow: hidden; }
    .hero-card:before {
      content: ""; position: absolute; right: -80px; top: -120px; width: 320px; height: 320px;
      background: radial-gradient(circle, rgba(6,182,212,.24), transparent 62%); pointer-events: none;
    }
    .eyebrow { color: var(--cyan); text-transform: uppercase; letter-spacing: .14em; font-weight: 800; font-size: 11px; }
    h2 { margin: 8px 0 8px; font-size: clamp(28px, 4vw, 48px); line-height: 1.02; }
    h3 { margin: 0 0 12px; font-size: 17px; }
    h4 { margin: 0 0 10px; font-size: 14px; color: var(--soft); }
    .muted { color: var(--muted); }
    .tiny { font-size: 12px; color: var(--muted); }
    .grid { display: grid; gap: 16px; }
    .grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .admin-stack { display: grid; grid-template-columns: 1fr; gap: 16px; }
    .card { padding: 18px; overflow: hidden; }
    .kpi { padding: 16px; border-radius: 18px; background: linear-gradient(145deg, rgba(255,255,255,.07), rgba(255,255,255,.025)); border: 1px solid var(--border); }
    .kpi .label { color: var(--muted); font-size: 12px; }
    .kpi .value { font-weight: 850; font-size: 28px; margin-top: 4px; }
    .kpi .sub { color: var(--soft); font-size: 12px; margin-top: 6px; }
    section { scroll-margin-top: 20px; margin: 18px 0; }
    .section-head { display: flex; justify-content: space-between; gap: 12px; align-items: end; margin: 4px 0 12px; }
    .section-head h2 { font-size: 24px; margin: 0; }
    .search-box { display: flex; gap: 10px; margin-top: 16px; }
    .search-box input, .select, .input {
      width: 100%; background: rgba(15, 23, 42, .88); color: var(--text);
      border: 1px solid var(--border); border-radius: 14px; padding: 12px 14px; outline: none;
    }
    .search-box input:focus, .select:focus, .input:focus { border-color: rgba(59,130,246,.65); box-shadow: 0 0 0 4px rgba(59,130,246,.12); }
    .btn {
      border: 1px solid rgba(59,130,246,.35); color: white; background: linear-gradient(135deg, rgba(59,130,246,.94), rgba(6,182,212,.82));
      border-radius: 14px; padding: 11px 14px; cursor: pointer; white-space: nowrap; font-weight: 750;
    }
    .btn.ghost { background: rgba(255,255,255,.04); border-color: var(--border); color: var(--soft); }
    .results { max-height: 360px; overflow: auto; padding-right: 4px; }
    .result {
      display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 10px; padding: 11px 12px; border-radius: 14px;
      border: 1px solid transparent; cursor: pointer; margin-bottom: 6px; background: rgba(255,255,255,.035);
    }
    .result:hover, .result.active { border-color: rgba(6,182,212,.38); background: rgba(6,182,212,.10); }
    .result strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; }
    .badge { font-size: 11px; padding: 4px 8px; border-radius: 999px; background: rgba(148,163,184,.13); border: 1px solid rgba(148,163,184,.16); color: var(--soft); }
    .badge.risk { background: rgba(251,113,133,.14); color: #fecdd3; }
    .badge.training { background: rgba(34,197,94,.13); color: #bbf7d0; }
    .filter-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .chip { border: 1px solid var(--border); background: rgba(255,255,255,.04); color: var(--soft); border-radius: 999px; padding: 7px 10px; cursor: pointer; font-size: 12px; font-weight: 750; }
    .chip.active { color: white; border-color: rgba(6,182,212,.55); background: rgba(6,182,212,.18); }
    .profile-head { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 16px; align-items: start; }
    .profile-name { font-size: 26px; font-weight: 900; margin-bottom: 4px; }
    .profile-sub { color: var(--muted); }
    .kv { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
    .kv div { background: rgba(255,255,255,.04); border: 1px solid var(--border); border-radius: 14px; padding: 10px; min-width: 0; }
    .kv span { display: block; font-size: 11px; color: var(--muted); margin-bottom: 4px; }
    .kv b { display: block; font-size: 13px; overflow-wrap: anywhere; }
    .tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 12px; }
    .tab { border: 1px solid var(--border); background: rgba(255,255,255,.045); color: var(--soft); border-radius: 999px; padding: 8px 11px; cursor: pointer; font-weight: 700; font-size: 12px; }
    .tab.active { color: white; border-color: rgba(59,130,246,.45); background: rgba(59,130,246,.16); }
    .table-wrap { overflow: auto; max-height: 620px; border: 1px solid var(--border); border-radius: 16px; background: rgba(5, 10, 20, .28); }
    table { width: max-content; min-width: 100%; border-collapse: collapse; }
    th, td { padding: 9px 10px; border-bottom: 1px solid rgba(148,163,184,.12); text-align: left; font-size: 11.5px; vertical-align: top; white-space: nowrap; }
    th { position: sticky; top: 0; z-index: 1; background: rgba(13,23,41,.96); color: #dbeafe; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; cursor: pointer; user-select: none; }
    th .sort-mark { color: var(--cyan); margin-left: 5px; font-size: 10px; }
    td { color: #d7e1f1; max-width: 360px; overflow: hidden; text-overflow: ellipsis; }
    td:hover { white-space: normal; overflow: visible; background: rgba(15, 23, 42, .96); position: relative; z-index: 2; }
    tr:hover td { background: rgba(59,130,246,.06); }
    .table-actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 10px 0 0; }
    .mini-chart { width: 100%; min-height: 260px; }
    .profile-chart { margin: 4px 0 14px; padding: 12px; border: 1px solid var(--border); border-radius: 16px; background: rgba(255,255,255,.035); }
    .profile-chart .mini-chart { min-height: 220px; }
    .event-timeline { display: grid; gap: 10px; margin: 0 0 14px; }
    .event { display: grid; grid-template-columns: 98px minmax(0,1fr); gap: 12px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 14px; background: rgba(255,255,255,.035); }
    .event-date { color: var(--cyan); font-size: 12px; font-weight: 850; }
    .event-title { font-weight: 850; }
    .event-desc { color: var(--muted); font-size: 12px; margin-top: 3px; }
    .compare-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; }
    .compare-card { border: 1px solid var(--border); border-radius: 16px; padding: 14px; background: rgba(255,255,255,.04); }
    .insight-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; }
    .insight-card { border: 1px solid var(--border); border-radius: 18px; padding: 14px; background: rgba(255,255,255,.04); }
    .insight-card b { display:block; font-size: 24px; margin-top: 4px; }
    .heat-cell { border-radius: 10px; padding: 7px 9px; display: inline-block; min-width: 74px; text-align: right; font-weight: 850; color: white; }
    .visual-grid { display: grid; grid-template-columns: minmax(0,1.05fr) minmax(0,1fr) minmax(0,.95fr); gap: 16px; }
    .quick-insights { display: grid; gap: 10px; }
    .quick-card { border: 1px solid var(--border); border-radius: 16px; padding: 12px; background: rgba(255,255,255,.045); display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 10px; align-items: center; }
    .quick-card strong { font-size: 22px; letter-spacing: -.03em; }
    .quick-card span { color: var(--muted); font-size: 12px; }
    .quadrant-svg { width: 100%; min-height: 330px; display: block; }
    .corr-list { display: grid; gap: 10px; }
    .corr-row { display: grid; grid-template-columns: minmax(150px,1fr) minmax(0,1.2fr) 58px; align-items: center; gap: 10px; font-size: 12px; }
    .corr-track { height: 10px; border-radius: 999px; background: rgba(255,255,255,.08); overflow: hidden; }
    .corr-fill { height: 100%; border-radius: 999px; }
    .table-toolbar { display:flex; gap: 10px; align-items:center; justify-content:space-between; flex-wrap:wrap; margin: 0 0 10px; }
    .table-filter { max-width: 360px; background: rgba(15,23,42,.78); color: var(--text); border: 1px solid var(--border); border-radius: 12px; padding: 9px 11px; outline: none; }
    .table-filter:focus { border-color: rgba(6,182,212,.58); box-shadow: 0 0 0 3px rgba(6,182,212,.12); }
    .column-picker { position: relative; }
    .column-picker summary { list-style: none; cursor: pointer; border: 1px solid var(--border); border-radius: 12px; padding: 9px 11px; background: rgba(255,255,255,.05); font-weight: 800; color: var(--text); }
    .column-picker summary::-webkit-details-marker { display: none; }
    .column-menu { position: absolute; z-index: 20; right: 0; top: calc(100% + 8px); width: min(420px, 82vw); max-height: 320px; overflow: auto; padding: 12px; border: 1px solid var(--border); border-radius: 16px; background: rgba(15,23,42,.98); box-shadow: var(--shadow); display: grid; gap: 8px; }
    .column-menu label { display: grid; grid-template-columns: 18px minmax(0,1fr); gap: 8px; align-items: center; font-size: 12px; color: var(--muted); }
    .column-menu-actions { display: flex; gap: 8px; flex-wrap: wrap; border-top: 1px solid var(--border); padding-top: 8px; margin-top: 4px; }
    .column-menu-actions button { width: auto; padding: 6px 9px; border-radius: 10px; font-size: 11px; }
    .table-wrap::-webkit-scrollbar { width: 10px; height: 10px; }
    .table-wrap::-webkit-scrollbar-track { background: rgba(255,255,255,.04); border-radius: 999px; }
    .table-wrap::-webkit-scrollbar-thumb { background: rgba(148,163,184,.38); border-radius: 999px; }
    .bars { display: grid; gap: 10px; }
    .bar-row { display: grid; grid-template-columns: 150px minmax(0,1fr) 74px; gap: 10px; align-items: center; font-size: 12px; }
    .bar-track { height: 12px; border-radius: 999px; background: rgba(255,255,255,.08); overflow: hidden; }
    .bar-fill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--blue), var(--cyan)); }
    .split { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 16px; }
    .footer { color: var(--muted); font-size: 12px; padding: 30px 0; text-align: center; }
    .empty { padding: 18px; border-radius: 16px; border: 1px dashed rgba(148,163,184,.24); color: var(--muted); text-align: center; }
    @media (max-width: 1180px) { .app { grid-template-columns: 1fr; } .sidebar { position: relative; height: auto; } .hero, .split { grid-template-columns: 1fr; } .grid-4, .grid-3, .grid-2 { grid-template-columns: 1fr; } .kv { grid-template-columns: repeat(2, minmax(0,1fr)); } }
    @media (max-width: 1180px) { .insight-grid, .compare-grid, .visual-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
    @media (max-width: 640px) { .content { padding: 14px; } .kv { grid-template-columns: 1fr; } .profile-head, .insight-grid, .compare-grid, .visual-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <script id="admin-data" type="application/json">__ADMIN_DATA__</script>
  <div class="app">
    <aside class="sidebar">
      <div class="brand"><div class="mark"></div><div><h1>Aizanoi Analytics Studio</h1><p>ERD P statik admin paneli</p></div></div>
      <nav class="nav">
        <div class="nav-title">Ana</div>
        <a href="#overview">Genel Özet <span class="pill">KPI</span></a>
        <a href="#employee360">Çalışan 360 <span class="pill">Arama</span></a>
        <a href="#v2analytics">V2 Analitik <span class="pill">Risk</span></a>
        <a href="#dataquality">Veri Kalitesi <span class="pill">DQ</span></a>
        <a href="#discipline">Ceza / Disiplin <span class="pill">Yeni</span></a>
        <a href="#segments">Segment Matrisi <span class="pill">4Q</span></a>
        <a href="#alerts">Erken Uyarı <span class="pill">Alarm</span></a>
        <a href="#effectiveness">Etkinlik Raporu <span class="pill">Mağaza</span></a>
        <a href="#correlations">Korelasyon <span class="pill">Analiz</span></a>
        <a href="#heatmap">Isı Haritası <span class="pill">Heat</span></a>
      </nav>
    </aside>
    <main class="content">
      <section class="hero" id="overview">
        <div class="hero-card">
          <div class="eyebrow">Aizanoi Analytics Studio</div>
          <h2>Kişi, risk, eğitim, hareket ve V2 analitik için tek ekran.</h2>
          <p class="muted">Bu panel ayrı bir statik HTML çıktısıdır. Mevcut dashboard akışını değiştirmez; Excel çıktısındaki tüm ilgili sheetleri kişi bazında birleştirir.</p>
          <div class="search-box">
            <input id="globalSearch" placeholder="Ad soyad, sicil, mağaza, departman, görev, telefon veya e-posta ara..." autocomplete="off" />
            <button class="btn ghost" id="exportSearch">Sonu&#231;lar&#305; CSV</button>
            <button class="btn" id="clearSearch">Temizle</button>
          </div>
          <div id="filterChips" class="filter-chips"></div>
        </div>
        <div class="card">
          <h3>Panel Bilgisi</h3>
          <div class="kv" id="metaKv"></div>
        </div>
      </section>
      <section><div class="grid grid-4" id="kpis"></div></section>
      <section class="split">
        <div class="card"><h3>Çalışan Sayısı Trendi (Son 12 Ay)</h3><div id="headcountTrend" class="mini-chart"></div></div>
        <div class="card"><h3>Son Dönem Üst Bölüm Dağılımı</h3><div id="scopeBars" class="bars"></div></div>
      </section>
      <section class="visual-grid">
        <div class="card"><h3>Yönetici Özeti</h3><div id="quickInsights" class="quick-insights"></div></div>
        <div class="card"><h3>Risk x Performans Haritası</h3><div id="segmentVisual"></div></div>
        <div class="card"><h3>Korelasyon Nabzı</h3><div id="correlationVisual"></div></div>
      </section>
      <section id="employee360">
        <div class="section-head"><div><h2>Çalışan 360</h2><p class="muted">Kişi seçildiğinde tüm kaynaklardaki geçmiş, risk, eğitim, performans ve çıkış verisi aynı profilde açılır.</p></div></div>
        <div class="admin-stack">
          <div class="card"><h3>Arama Sonuçları</h3><div id="searchResults" class="results"></div></div>
          <div class="card" id="profileCard"><div class="empty">Bir kişi seçerek 360 profilini görüntüleyin.</div></div>
          <div class="card"><h3>Çalışan Karşılaştırma</h3><p class="tiny">Profildeki “Karşılaştırmaya ekle” butonuyla iki kişiyi yan yana kıyaslayın.</p><div id="comparePanel"></div></div>
        </div>
      </section>
      <section id="v2analytics">
        <div class="section-head"><div><h2>V2 Analitik</h2><p class="muted">Yeni modeller eski yapıyı bozmadan ayrı V2 çıktılar olarak izlenir.</p></div></div>
        <div class="card"><h3>Risk Dağılımı</h3><div id="riskDist" class="bars"></div></div>
        <div class="card" style="margin-top:16px"><h3>Survival Summary</h3><div id="survivalSummary"></div></div>
        <div class="card" style="margin-top:16px"><h3>Burnout Index</h3><div id="burnoutTable"></div></div>
        <div class="card" style="margin-top:16px"><h3>Regrettable Turnover V2</h3><p class="tiny">Sadece mağaza çalışanları kapsamındadır.</p><div id="regrettableTable"></div></div>
      </section>
      <section id="dataquality">
        <div class="section-head"><div><h2>Veri Kalite Paneli</h2><p class="muted">Kaynak sheet eşleşmeleri, eksik alanlar ve hızlı veri sağlığı kontrolleri.</p></div></div>
        <div id="dataQualityCards" class="insight-grid"></div>
        <div class="card" style="margin-top:16px"><h3>Veri Kalite Aksiyonları</h3><div id="dataQualityIssues"></div></div>
      </section>
      <section id="discipline">
        <div class="section-head"><div><h2>Ceza / Disiplin Kayıtları</h2><p class="muted">Ceza kodu eşleştirilmiş son disiplin kayıtları. Çalışan 360 profilindeki Ceza / Disiplin sekmesi kişi bazında detay verir.</p></div></div>
        <div class="card"><div id="disciplineRecentTable"></div></div>
      </section>
      <section id="segments">
        <div class="section-head"><div><h2>Segment Matrisi</h2><p class="muted">Performans ve risk kombinasyonuna göre Star Performer, Flight Risk ve kritik takip grupları.</p></div></div>
        <div class="grid grid-2">
          <div class="card"><h3>Segment Özeti</h3><div id="segmentSummary"></div></div>
          <div class="card"><h3>Segment Kişi Listesi</h3><div id="segmentRows"></div></div>
        </div>
      </section>
      <section id="alerts">
        <div class="section-head"><div><h2>Erken Uyarı Sistemi</h2><p class="muted">Kritik risk, risk sıçraması ve operasyonel yük uyarıları.</p></div></div>
        <div class="card"><div id="alertsTable"></div></div>
      </section>
      <section id="effectiveness">
        <div class="section-head"><div><h2>Yönetici / Mağaza Etkinlik Raporu</h2><p class="muted">Mağaza ve bölge bazında risk, performans, eğitim ve operasyonel yük göstergeleri.</p></div></div>
        <div class="card"><div id="effectivenessTable"></div></div>
      </section>
      <section id="correlations">
        <div class="section-head"><div><h2>Korelasyon Analizi</h2><p class="muted">Eğitim, performans, karne, prim, kıdem ve risk ilişkileri.</p></div></div>
        <div class="card"><div id="correlationTable"></div></div>
      </section>
      <section id="heatmap">
        <div class="section-head"><div><h2>Mağaza / Bölge Isı Haritası</h2><p class="muted">Birimleri risk, performans, eğitim, fazla mesai ve turnover göstergeleriyle birlikte okuyun.</p></div></div>
        <div class="card"><div id="heatmapTable"></div></div>
      </section>
      <div class="footer">ERD P Admin Panel - statik çıktı. Dosya hassas veri içerir, paylaşımını kontrollü tutun.</div>
    </main>
  </div>
  <script>
  const DATA = JSON.parse(document.getElementById('admin-data').textContent);
  const COLORS = ['#3b82f6','#06b6d4','#22c55e','#f59e0b','#fb7185','#8b5cf6','#14b8a6','#f97316'];
  const tableState = new Map();
  const tableSortState = new Map();
  const tableFilterState = new Map();
  const tableColumnState = new Map();
  let selectedSicil = null;
  let activeTab = 'timeline';
  let currentSearchRows = [];
  const activeFilters = new Set();
  const compareSicils = [];

  function $(id){ return document.getElementById(id); }
  function esc(v){ return String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function norm(v){ return String(v ?? '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/[^a-z0-9]+/g,' ').trim(); }
  function fmt(v, d=0){ const n = Number(v); return Number.isFinite(n) ? n.toLocaleString('tr-TR',{maximumFractionDigits:d, minimumFractionDigits:d}) : (v ?? ''); }
  function pct(v, d=1){ const n = Number(v); if(!Number.isFinite(n)) return ''; return (n*100).toLocaleString('tr-TR',{maximumFractionDigits:d, minimumFractionDigits:d}) + '%'; }
  function monthLabel(m){ if(!m) return ''; const [y, mo] = String(m).split('-').map(Number); const names=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']; return `${names[(mo||1)-1]} ${y}`; }
  function inferFormat(key, val){
    const k = String(key||'').toLocaleLowerCase('tr-TR');
    const n = Number(val);
    if(k.includes('sicil') || k.includes('tc_kimlik')) return val ?? '';
    if(k.includes('tarih') || k.endsWith('_at')) return val ?? '';
    if(k.includes('karne_toplam') || k.includes('rate') || k.includes('share') || k.includes('oran') || k.includes('yuzde') || k.includes('yüzde') || k.includes('probability')) return pct(val, 1);
    if(k.includes('ucret') || k.includes('\u00fccret') || k.includes('gelir') || k.includes('prim') || k.includes('kasa') || k.includes('tl') || k.includes('hakedi')) return Number.isFinite(n) ? fmt(n, 0) : (val ?? '');
    if(k.includes('risk_puani') || k.includes('skoru') || k.includes('score')) return fmt(val, 1);
    if(typeof val === 'number') return fmt(val, Math.abs(val) < 10 && val !== Math.round(val) ? 2 : 0);
    return val ?? '';
  }
  function asObjects(columns, rows){ return (rows || []).map(row => Object.fromEntries((columns||[]).map((c,i)=>[c,row[i]]))); }
  function setHTML(el, html){ if(el) el.innerHTML = html; }
  function empty(msg='Veri yok'){ return `<div class="empty">${esc(msg)}</div>`; }

  function renderKV(host, items){
    setHTML(host, items.map(([k,v]) => `<div><span>${esc(k)}</span><b>${esc(v ?? '-')}</b></div>`).join(''));
  }
  function renderKPIs(){
    const highRisk = (DATA.tables.top_risk || []).filter(r => Number(r.risk_puani) >= 60).length;
    const burnHigh = (DATA.tables.burnout || []).filter(r => String(r.risk_seviyesi||'').toLowerCase().includes('yüksek') || Number(r.operasyonel_yuk_skoru) >= 65).length;
    const lastReg = (DATA.tables.regrettable || []).slice(-1)[0] || {};
    const disciplineCount = (DATA.tables.discipline_recent || []).length;
    const cards = [
      ['Çalışan Profili', fmt(DATA.meta.employee_count,0), 'Admin arama indeksindeki kişi sayısı'],
      ['Son Dönem', monthLabel(DATA.meta.latest_month), 'Excel kaynaklarından gelen en güncel dönem'],
      ['Yüksek Risk Kaydı', fmt(highRisk,0), 'Son risk döneminde 60+ puanlı kayıt'],
      ['Regrettable V2', pct(lastReg.regrettable_turnover_rate,2), 'Mağaza çalışanları kapsamı'],
      ['Ceza / Disiplin', fmt(disciplineCount,0), 'Ceza sheetinden gelen son kayıtlar']
    ];
    setHTML($('kpis'), cards.map(c => `<div class="kpi"><div class="label">${esc(c[0])}</div><div class="value">${esc(c[1])}</div><div class="sub">${esc(c[2])}</div></div>`).join(''));
  }
  function renderBars(host, items, opts={}){
    if(!host) return;
    const data = (items||[]).filter(x => Number(x.count ?? x.value) > 0).slice(0, opts.limit || 12);
    if(!data.length){ host.innerHTML = empty(); return; }
    const max = Math.max(...data.map(x => Number(x.count ?? x.value) || 0), 1);
    host.innerHTML = data.map((x,i) => {
      const val = Number(x.count ?? x.value) || 0;
      return `<div class="bar-row"><div title="${esc(x.label)}">${esc(x.label)}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(1,val/max*100)}%;background:linear-gradient(90deg,${COLORS[i%COLORS.length]},${COLORS[(i+1)%COLORS.length]})"></div></div><b>${fmt(val,0)}</b></div>`;
    }).join('');
  }
  function renderInsightCards(host, rows){
    if(!host) return;
    const data = rows || [];
    if(!data.length){ host.innerHTML = empty(); return; }
    host.innerHTML = data.map(r => {
      const value = r.ratio != null ? `${fmt(r.value,0)} · ${pct(r.ratio,1)}` : fmt(r.value,0);
      return `<div class="insight-card"><span class="tiny">${esc(r.label)}</span><b>${esc(value)}</b><div class="tiny">${esc(r.detail || '')}</div></div>`;
    }).join('');
  }
  function heatColor(value, reverse=false){
    const n = Number(value);
    if(!Number.isFinite(n)) return 'rgba(148,163,184,.22)';
    const clamped = Math.max(0, Math.min(1, n));
    const score = reverse ? 1 - clamped : clamped;
    if(score >= .67) return 'rgba(239,68,68,.82)';
    if(score >= .34) return 'rgba(245,158,11,.82)';
    return 'rgba(34,197,94,.78)';
  }
  function renderHeatmap(host, rows){
    if(!host) return;
    const data = (rows || []).slice(0, 80);
    if(!data.length){ host.innerHTML = empty(); return; }
    const cols = ['avg_risk','high_risk_pct','avg_performance','training_rate','avg_overtime','turnover'];
    const labels = {avg_risk:'Risk', high_risk_pct:'Yüksek Risk', avg_performance:'Performans', training_rate:'Eğitim', avg_overtime:'Fazla Mesai', turnover:'Turnover'};
    const cell = (key, val) => {
      const scaled = key === 'avg_risk' ? Number(val)/100 : key === 'avg_performance' ? Number(val)/100 : key === 'avg_overtime' ? Number(val)/50 : Number(val);
      const reverse = ['avg_performance','training_rate'].includes(key);
      const text = key.includes('pct') || key === 'training_rate' || key === 'turnover' ? pct(val,1) : fmt(val,1);
      return `<span class="heat-cell" style="background:${heatColor(scaled, reverse)}">${esc(text)}</span>`;
    };
    host.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Tip</th><th>Birim</th>${cols.map(c=>`<th>${esc(labels[c])}</th>`).join('')}</tr></thead><tbody>${data.map(r => `<tr><td>${esc(r.tip)}</td><td>${esc(r.birim)}</td>${cols.map(c => `<td>${cell(c, r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function renderQuickInsights(){
    const host = $('quickInsights');
    if(!host) return;
    const topRisk = DATA.tables.top_risk || [];
    const alerts = DATA.tables.alerts || [];
    const dq = DATA.tables.data_quality_cards || [];
    const seg = DATA.tables.segment_summary || [];
    const flight = seg.find(r => String(r.segment||'').toLocaleLowerCase('tr-TR') === 'flight risk') || {};
    const star = seg.find(r => String(r.segment||'').toLocaleLowerCase('tr-TR') === 'star performer') || {};
    const highRiskCount = topRisk.filter(r => Number(r.risk_puani) >= 60).length;
    const criticalAlerts = alerts.filter(r => String(r["öncelik"]||r.oncelik||'').toLocaleLowerCase('tr-TR').includes('yüksek')).length;
    const missingCard = dq.find(r => String(r.label||'').toLocaleLowerCase('tr-TR').includes('karne')) || {};
    const rows = [
      ['Yüksek risk odağı', fmt(highRiskCount,0), 'Son risk tablosunda 60+ puan'],
      ['Flight risk', fmt(flight.count || 0,0), 'Yüksek performans + yüksek risk'],
      ['Star performer', fmt(star.count || 0,0), 'Korunması gereken güçlü grup'],
      ['Kritik uyarı', fmt(criticalAlerts,0), 'Yüksek öncelikli alarm'],
      ['Veri kalitesi', missingCard.ratio != null ? pct(missingCard.ratio,1) : '-', missingCard.label || 'Eşleşme kontrolü']
    ];
    host.innerHTML = rows.map((r,i)=>`<div class="quick-card"><div><span>${esc(r[0])}</span><div class="tiny">${esc(r[2])}</div></div><strong style="color:${COLORS[i%COLORS.length]}">${esc(r[1])}</strong></div>`).join('');
  }
  function renderSegmentVisual(){
    const host = $('segmentVisual');
    if(!host) return;
    const rows = (DATA.tables.segment_rows || []).filter(r => Number.isFinite(Number(r.risk_puani)) && Number.isFinite(Number(r.performans_bilesik))).slice(0, 220);
    if(!rows.length){ host.innerHTML = empty('Segment görseli için risk ve performans eşleşmesi yok'); return; }
    const w=720,h=360,p={l:54,r:26,t:30,b:48},cw=w-p.l-p.r,ch=h-p.t-p.b;
    const perfVals=rows.map(r=>Number(r.performans_bilesik));
    const pMin=60, pMax=Math.max(...perfVals,120);
    const riskCut=60, perfCut=80;
    const x=v=>p.l+((Math.max(pMin,Math.min(pMax,Number(v)||pMin))-pMin)/(pMax-pMin||1))*cw;
    const y=v=>p.t+(1-Math.max(0,Math.min(100,Number(v)))/100)*ch;
    const color=seg=>String(seg||'').includes('Flight')?'#fb7185':String(seg||'').includes('Star')?'#22c55e':String(seg||'').includes('Kritik')?'#f59e0b':'#3b82f6';
    const xCut=x(perfCut), yCut=y(riskCut);
    const bg=[[p.l,p.t,xCut-p.l,yCut-p.t,'rgba(245,158,11,.10)'],[xCut,p.t,p.l+cw-xCut,yCut-p.t,'rgba(251,113,133,.10)'],[p.l,yCut,xCut-p.l,p.t+ch-yCut,'rgba(59,130,246,.08)'],[xCut,yCut,p.l+cw-xCut,p.t+ch-yCut,'rgba(34,197,94,.10)']].map(r=>`<rect x="${r[0]}" y="${r[1]}" width="${Math.max(0,r[2])}" height="${Math.max(0,r[3])}" rx="12" fill="${r[4]}"/>`).join('');
    const pts=rows.map((r,i)=>`<circle cx="${x(r.performans_bilesik)}" cy="${y(r.risk_puani)}" r="${4+Math.min(7,Number(r.karne_toplam||0)*7)}" fill="${color(r.segment)}" opacity=".72"><title>${esc(r.adi_soyadi||r.sicil_no||'')} ? ${esc(r.segment||'')} ? Risk ${fmt(r.risk_puani,1)} ? Performans ${fmt(r.performans_bilesik,1)}</title></circle>`).join('');
    host.innerHTML=`<svg class="quadrant-svg" viewBox="0 0 ${w} ${h}" role="img">${bg}<line x1="${p.l}" x2="${p.l+cw}" y1="${yCut}" y2="${yCut}" stroke="rgba(148,163,184,.45)" stroke-dasharray="5 6"/><line x1="${xCut}" x2="${xCut}" y1="${p.t}" y2="${p.t+ch}" stroke="rgba(148,163,184,.45)" stroke-dasharray="5 6"/><path d="M${p.l} ${p.t}V${p.t+ch}H${p.l+cw}" fill="none" stroke="rgba(148,163,184,.42)"/><text x="${p.l+cw/2}" y="${h-12}" fill="#95a5bd" font-size="12" text-anchor="middle">Performans</text><text x="16" y="${p.t+ch/2}" fill="#95a5bd" font-size="12" text-anchor="middle" transform="rotate(-90 16 ${p.t+ch/2})">Risk</text><text x="${xCut+12}" y="${p.t+20}" fill="#fb7185" font-size="12" font-weight="800">Flight Risk</text><text x="${xCut+12}" y="${p.t+ch-12}" fill="#22c55e" font-size="12" font-weight="800">Star</text>${pts}</svg>`;
  }
  function renderCorrelationVisual(){
    const host = $('correlationVisual');
    if(!host) return;
    const rows = (DATA.tables.correlations || []).filter(r => Number.isFinite(Number(r.korelasyon))).sort((a,b)=>Math.abs(Number(b.korelasyon))-Math.abs(Number(a.korelasyon))).slice(0,8);
    if(!rows.length){ host.innerHTML = empty('Korelasyon verisi yok'); return; }
    host.innerHTML = `<div class="corr-list">${rows.map(r=>{const val=Number(r.korelasyon); const w=Math.min(100,Math.abs(val)*100); const col=val>=0?'#22c55e':'#fb7185'; return `<div class="corr-row"><div title="${esc(r.metrik_1)} / ${esc(r.metrik_2)}">${esc(r.metrik_1)} ↔ ${esc(r.metrik_2)}</div><div class="corr-track"><div class="corr-fill" style="width:${w}%;background:${col}"></div></div><b style="color:${col}">${fmt(val,2)}</b></div>`;}).join('')}</div>`;
  }

  function renderTrend(host, rows){
    if(!host) return;
    const data = (rows||[]).slice(-12).map(r => ({label: monthLabel(r.month), value: Number(r.count)||0}));
    if(data.length < 2){ host.innerHTML = empty(); return; }
    const w = 900, h = 260, p = 34;
    const max = Math.max(...data.map(d=>d.value), 1), min = Math.min(...data.map(d=>d.value));
    const y = v => h-p-((v-min)/(max-min || 1))*(h-p*2);
    const x = i => p + i*((w-p*2)/(data.length-1));
    const pts = data.map((d,i)=>`${x(i)},${y(d.value)}`).join(' ');
    const circles = data.map((d,i)=>`<circle cx="${x(i)}" cy="${y(d.value)}" r="4" fill="#60a5fa"><title>${esc(d.label)}: ${fmt(d.value,0)}</title></circle>`).join('');
    const grid = [0,1,2,3,4].map(i=>{ const yy=p+i*((h-p*2)/4); return `<line x1="${p}" x2="${w-p}" y1="${yy}" y2="${yy}" stroke="rgba(148,163,184,.16)"/>`; }).join('');
    host.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img">${grid}<polyline points="${pts}" fill="none" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${circles}<text x="${p}" y="${h-6}" fill="#94a3b8" font-size="11">${esc(data[0].label)}</text><text x="${w-p}" y="${h-6}" fill="#94a3b8" font-size="11" text-anchor="end">${esc(data[data.length-1].label)}</text></svg>`;
  }
  function renderTable(host, rows, options={}){
    if(!host) return;
    const id = options.id || host.id || Math.random().toString(36).slice(2);
    const source = Array.isArray(rows) ? rows : [];
    if(!source.length){ host.innerHTML = empty(options.empty || 'Kayıt yok'); return; }
    const filterText = tableFilterState.get(id) || '';
    const filterKey = norm(filterText);
    const data = filterKey
      ? source.filter(row => norm(Object.values(row || {}).join(' ')).includes(filterKey))
      : source;
    const limit = options.limit || 20;
    const expanded = tableState.get(id) || false;
    const preferred = options.columns || Object.keys(source[0] || {});
    const cols = preferred.filter(c => source.some(r => r && r[c] !== undefined && r[c] !== null && r[c] !== ''));
    const defaultCols = options.defaultColumns || (cols.length > 12 ? cols.slice(0, 10) : cols);
    const activeCols = tableColumnState.has(id) ? tableColumnState.get(id) : defaultCols;
    const activeSet = new Set((activeCols || []).filter(c => cols.includes(c)));
    if(!activeSet.size && cols[0]) activeSet.add(cols[0]);
    const shownCols = cols.filter(c => activeSet.has(c));
    const sort = tableSortState.get(id) || {};
    const sorted = data.slice();
    if(sort.key){
      sorted.sort((a,b) => {
        const av = a?.[sort.key], bv = b?.[sort.key];
        const an = Number(av), bn = Number(bv);
        let cmp;
        if(Number.isFinite(an) && Number.isFinite(bn)) cmp = an - bn;
        else cmp = String(av ?? '').localeCompare(String(bv ?? ''), 'tr', {numeric:true, sensitivity:'base'});
        return sort.dir === 'desc' ? -cmp : cmp;
      });
    }
    const visible = expanded ? sorted : sorted.slice(0, limit);
    const head = shownCols.map(c => {
      const label = (options.labels && options.labels[c]) || c;
      const mark = sort.key === c ? (sort.dir === 'desc' ? '\u25bc' : '\u25b2') : '';
      return `<th data-sort-col="${esc(c)}">${esc(label)}${mark ? `<span class="sort-mark">${mark}</span>` : ''}</th>`;
    }).join('');
    const body = visible.map(r => `<tr>${shownCols.map(c => `<td title="${esc(inferFormat(c, r[c]))}">${esc(inferFormat(c, r[c]))}</td>`).join('')}</tr>`).join('');
    const more = data.length > limit ? `<button class="btn ghost" data-table-toggle="${esc(id)}">${expanded ? 'Daha az g\u00f6ster' : `Daha fazla g\u00f6ster (${data.length-limit})`}</button>` : '';
    const csv = `<button class="btn ghost" data-table-csv="${esc(id)}">CSV indir</button>`;
    const columnMenu = cols.length > 8 ? `<details class="column-picker"><summary>Kolonlar (${shownCols.length}/${cols.length})</summary><div class="column-menu">${cols.map(c => { const label = (options.labels && options.labels[c]) || c; return `<label><input type="checkbox" data-column-toggle="${esc(c)}" ${activeSet.has(c) ? 'checked' : ''}> <span>${esc(label)}</span></label>`; }).join('')}<div class="column-menu-actions"><button class="btn ghost" type="button" data-columns-default="${esc(id)}">Sade g\u00f6r\u00fcn\u00fcm</button><button class="btn ghost" type="button" data-columns-all="${esc(id)}">T\u00fcm kolonlar</button></div></div></details>` : '';
    host.innerHTML = `<div class="table-toolbar"><input class="table-filter" data-table-filter="${esc(id)}" value="${esc(filterText)}" placeholder="Bu tabloda ara..."><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="tiny">${filterText ? `${fmt(data.length,0)} / ${fmt(source.length,0)} kay\u0131t` : `${fmt(source.length,0)} kay\u0131t`}</span>${columnMenu}</div></div><div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div><div class="table-actions"><span class="tiny">${fmt(visible.length,0)} sat\u0131r g\u00f6steriliyor</span><div style="display:flex;gap:8px;flex-wrap:wrap">${csv}${more}</div></div>`;
    const filterInput = host.querySelector('[data-table-filter]');
    if(filterInput){
      filterInput.addEventListener('input', e => {
        tableFilterState.set(id, e.target.value);
        renderTable(host, rows, options);
        const next = host.querySelector('[data-table-filter]');
        if(next){ next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
      });
    }
    const btn = host.querySelector('[data-table-toggle]');
    if(btn) btn.addEventListener('click', () => { tableState.set(id, !expanded); renderTable(host, rows, options); });
    const csvBtn = host.querySelector('[data-table-csv]');
    if(csvBtn) csvBtn.addEventListener('click', () => downloadCsv(`${id}.csv`, sorted, shownCols));
    host.querySelectorAll('[data-column-toggle]').forEach(input => input.addEventListener('change', () => {
      const selected = [...host.querySelectorAll('[data-column-toggle]:checked')].map(el => el.getAttribute('data-column-toggle')).filter(Boolean);
      tableColumnState.set(id, selected.length ? selected : [cols[0]]);
      renderTable(host, rows, options);
    }));
    host.querySelector('[data-columns-default]')?.addEventListener('click', () => {
      tableColumnState.set(id, defaultCols);
      renderTable(host, rows, options);
    });
    host.querySelector('[data-columns-all]')?.addEventListener('click', () => {
      tableColumnState.set(id, cols);
      renderTable(host, rows, options);
    });
    host.querySelectorAll('[data-sort-col]').forEach(th => th.addEventListener('click', () => {
      const key = th.getAttribute('data-sort-col');
      const cur = tableSortState.get(id) || {};
      tableSortState.set(id, {key, dir: cur.key === key && cur.dir !== 'desc' ? 'desc' : 'asc'});
      renderTable(host, rows, options);
    }));
  }


  function downloadCsv(filename, rows, cols){
    const escapeCsv = v => {
      const s = String(v ?? '').replace(/\r?\n/g, ' ');
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
    };
    const lines = [cols.map(escapeCsv).join(';'), ...rows.map(r => cols.map(c => escapeCsv(inferFormat(c, r[c]))).join(';'))];
    const blob = new Blob(["\ufeff" + lines.join('\n')], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function initMeta(){
    renderKV($('metaKv'), [
      ['Kaynak', DATA.meta.source_xlsx],
      ['Son dönem', monthLabel(DATA.meta.latest_month)],
      ['Üretim zamanı', new Date(DATA.meta.generated_at).toLocaleString('tr-TR')],
      ['Çalışma süresi', `${DATA.meta.build_seconds} sn`]
    ]);
  }
  function renderOverview(){
    renderKPIs();
    renderTrend($('headcountTrend'), DATA.charts.headcount_trend || []);
    renderBars($('scopeBars'), DATA.charts.scope_breakdown || []);
    renderQuickInsights();
    renderSegmentVisual();
    renderCorrelationVisual();
    renderBars($('riskDist'), DATA.charts.risk_distribution || []);
    renderTable($('survivalSummary'), DATA.tables.survival_summary || [], {id:'survivalSummary', limit:1});
    renderTable($('burnoutTable'), DATA.tables.burnout || [], {id:'burnoutTable', limit:1});
    renderTable($('regrettableTable'), DATA.tables.regrettable || [], {id:'regrettableTable', limit:10});
    renderInsightCards($('dataQualityCards'), DATA.tables.data_quality_cards || []);
    renderTable($('dataQualityIssues'), DATA.tables.data_quality_issues || [], {id:'dataQualityIssues', limit:10});
    renderTable($('disciplineRecentTable'), DATA.tables.discipline_recent || [], {id:'disciplineRecentTable', limit:25});
    renderTable($('segmentSummary'), DATA.tables.segment_summary || [], {id:'segmentSummary', limit:10});
    renderTable($('segmentRows'), DATA.tables.segment_rows || [], {id:'segmentRows', limit:20});
    renderTable($('alertsTable'), DATA.tables.alerts || [], {id:'alertsTable', limit:25});
    renderTable($('effectivenessTable'), DATA.tables.effectiveness || [], {id:'effectivenessTable', limit:25});
    renderTable($('correlationTable'), DATA.tables.correlations || [], {id:'correlationTable', limit:20});
    renderHeatmap($('heatmapTable'), DATA.tables.heatmap || []);
    renderTable($('orgDevTable'), DATA.tables.org_dev_tracking || [], {id:'orgDevTable', limit:15});
    renderTable($('academyDevTable'), DATA.tables.academy_development || [], {id:'academyDevTable', limit:15});
    renderTable($('nonAttendTable'), DATA.tables.academy_non_attending || [], {id:'nonAttendTable', limit:15});
    renderTable($('longTrainingTable'), DATA.tables.long_training || [], {id:'longTrainingTable', limit:15});
    renderTable($('merkezPromotionTable'), DATA.tables.merkez_promotion_rows || [], {id:'merkezPromotionTable', limit:15});
    renderTable($('magazaPromotionTable'), DATA.tables.magaza_promotion_rows || [], {id:'magazaPromotionTable', limit:15});
    renderTable($('departedTable'), DATA.tables.departed || [], {id:'departedTable', limit:15});
    renderTable($('regrettableDetailTable'), DATA.tables.regrettable_detail || [], {id:'regrettableDetailTable', limit:15});
    renderTable($('topRiskTable'), DATA.tables.top_risk || [], {id:'topRiskTable', limit:25});
    renderTable($('scorecardLatestTable'), DATA.tables.scorecard_latest || [], {id:'scorecardLatestTable', limit:25});
    if($('hiringTimeLatestTable')) renderTable($('hiringTimeLatestTable'), DATA.tables.hiring_time_latest || [], {id:'hiringTimeLatestTable', limit:25});
  }
  const FILTER_DEFS = [
    ['risk','Risk var'], ['cikis','Çıkış var'], ['egitim','Eğitim var'], ['karne','Karne var'],
    ['perf','Performans var'], ['ceza','Ceza var'], ['no-karne','Karne yok'], ['no-perf','Performans yok'],
    ['flight','Flight Risk'], ['star','Star Performer'], ['kritik','Kritik Takip']
  ];
  function renderFilterChips(){
    const host = $('filterChips');
    if(!host) return;
    host.innerHTML = FILTER_DEFS.map(([key,label]) => `<button type="button" class="chip ${activeFilters.has(key)?'active':''}" data-filter="${key}">${esc(label)}</button>`).join('');
    host.querySelectorAll('[data-filter]').forEach(btn => btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-filter');
      if(activeFilters.has(key)) activeFilters.delete(key); else activeFilters.add(key);
      renderFilterChips();
      const rows = search($('globalSearch').value);
      renderResults(rows);
    }));
  }
  function passesFilter(r, key){
    if(key === 'risk') return !!r.has_risk;
    if(key === 'cikis' || key === 'exit') return !!r.has_exit;
    if(key === 'egitim') return !!r.has_training;
    if(key === 'karne') return !!r.has_scorecard;
    if(key === 'perf') return !!r.has_performance;
    if(key === 'ceza') return !!r.has_discipline;
    if(key === 'no-karne') return !!r.missing_scorecard;
    if(key === 'no-perf') return !!r.missing_performance;
    if(key === 'no-risk') return !!r.missing_risk;
    if(key === 'flight') return String(r.segment || '').toLocaleLowerCase('tr-TR') === 'flight risk';
    if(key === 'star') return String(r.segment || '').toLocaleLowerCase('tr-TR') === 'star performer';
    if(key === 'kritik') return String(r.segment || '').toLocaleLowerCase('tr-TR') === 'kritik takip';
    return true;
  }
  function search(query){
    const q = norm(query);
    const base = DATA.search_index || [];
    const selectedFilters = new Set(activeFilters);
    if(!q && !selectedFilters.size) return base.slice(0, 40);
    const rawTokens = q.split(/\s+/).filter(Boolean);
    const filters = new Set([...selectedFilters, ...rawTokens.filter(t => ['risk','cikis','exit','egitim','karne','perf','ceza','no-karne','no-perf','no-risk','flight','star','kritik'].includes(t))]);
    const tokens = rawTokens.filter(t => !filters.has(t));
    return base
      .filter(r => {
        for(const f of filters){ if(!passesFilter(r, f)) return false; }
        return tokens.every(t => String(r.search_blob||'').includes(t));
      })
      .map(r => {
        const name = norm(r.name || '');
        const sicil = norm(r.sicil_no || '');
        const score = tokens.reduce((sum,t) => sum + (sicil === t ? 100 : name.startsWith(t) ? 40 : String(r.search_blob||'').includes(t) ? 5 : 0), 0);
        return {...r, _score: score};
      })
      .sort((a,b) => Number(b._score||0) - Number(a._score||0) || String(a.name||'').localeCompare(String(b.name||''), 'tr'))
      .slice(0, 80);
  }
  function renderResults(rows){
    currentSearchRows = rows || [];
    const host = $('searchResults');
    if(!rows.length){ host.innerHTML = empty('Arama sonucu yok'); return; }
    host.innerHTML = rows.map(r => `<div class="result ${selectedSicil===r.sicil_key?'active':''}" data-sicil="${esc(r.sicil_key)}"><div><strong>${esc(r.name || r.sicil_no)}</strong><div class="tiny">${esc(r.sicil_no)} · ${esc(r.scope || '')} · ${esc(r.unit || '')}</div><div class="badges">${r.segment?`<span class="badge">${esc(r.segment)}</span>`:''}${r.has_risk?'<span class="badge risk">Risk</span>':''}${r.has_training?'<span class="badge training">Eğitim</span>':''}${r.has_scorecard?'<span class="badge">Karne</span>':''}${r.has_discipline?'<span class="badge risk">Ceza</span>':''}${r.has_exit?'<span class="badge">Çıkış</span>':''}<span class="badge">${esc(r.title||'-')}</span></div></div><span class="pill">Aç</span></div>`).join('');
    host.querySelectorAll('[data-sicil]').forEach(el => el.addEventListener('click', () => selectEmployee(el.getAttribute('data-sicil'))));
  }
  function rowsFor(kind, sicil){
    const block = DATA.employee_data[kind] || {columns:[], by_sicil:{}};
    return asObjects(block.columns || [], (block.by_sicil || {})[sicil] || []);
  }
  function rowPeriodKey(row){
    const raw = row?.date || row?.month || row?.donem || row?.egitim_donemi || row?.atanma_tarihi || row?.tamamlama_tarihi || row?.cikis_tarihi || '';
    const text = String(raw || '');
    const match = text.match(/^(\d{4})[-.\/]?(\d{2})?[-.\/]?(\d{2})?/);
    if(match) return Number(`${match[1]}${match[2] || '00'}${match[3] || '00'}`);
    return 0;
  }
  function newestFirst(rows){
    return (rows || []).slice().sort((a,b) => rowPeriodKey(b) - rowPeriodKey(a));
  }
  function metricValue(row, keys){
    for(const key of keys){
      const n = Number(row?.[key]);
      if(Number.isFinite(n)) return n;
    }
    return null;
  }
  function renderMetricTrend(host, rows, keys, title){
    const points = newestFirst(rows).slice().reverse()
      .map(r => ({month: r.month || r.donem || '', count: metricValue(r, keys)}))
      .filter(r => Number.isFinite(r.count));
    if(points.length < 2) return;
    const box = document.createElement('div');
    box.className = 'profile-chart';
    box.innerHTML = `<h4>${esc(title)}</h4><div class="mini-chart"></div>`;
    host.appendChild(box);
    renderTrend(box.querySelector('.mini-chart'), points.slice(-12));
  }
  function latestRow(rows){ return rows && rows.length ? rows[rows.length-1] : null; }
  function riskBadge(score){
    const n = Number(score);
    if(!Number.isFinite(n)) return '';
    const color = n >= 75 ? 'var(--red)' : n >= 60 ? 'var(--rose)' : n >= 40 ? 'var(--amber)' : 'var(--green)';
    return `<span class="badge" style="border-color:${color};color:${color}">Risk ${fmt(n,1)}</span>`;
  }
  function employeeSnapshot(sicil){
    const emp = DATA.employees[sicil] || {};
    const risk = latestRow(rowsFor('risk', sicil)) || {};
    const perf = latestRow(rowsFor('performance', sicil)) || {};
    const score = latestRow(rowsFor('scorecard', sicil)) || {};
    const comp = latestRow(rowsFor('timeline', sicil)) || {};
    return {emp, risk, perf, score, comp};
  }
  function addCompare(sicil){
    if(!sicil) return;
    const idx = compareSicils.indexOf(sicil);
    if(idx >= 0) compareSicils.splice(idx, 1);
    compareSicils.unshift(sicil);
    while(compareSicils.length > 2) compareSicils.pop();
    renderCompare();
  }
  function renderCompare(){
    const host = $('comparePanel');
    if(!host) return;
    if(!compareSicils.length){ host.innerHTML = empty('Karşılaştırma için en az bir çalışan ekleyin.'); return; }
    host.innerHTML = `<div class="compare-grid">${compareSicils.map(sicil => {
      const {emp, risk, perf, score, comp} = employeeSnapshot(sicil);
      return `<div class="compare-card"><h3>${esc(emp.display_name || emp.adi_soyadi || sicil)}</h3><div class="tiny">${esc(emp.sicil_no || sicil)} · ${esc(emp.ust_bolum || '')} · ${esc(emp.isletme_adi || emp.departman_adi || '')}</div><div class="kv" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        <div><span>Risk</span><b>${esc(risk.risk_puani != null ? fmt(risk.risk_puani,1) : '-')}</b></div>
        <div><span>Performans</span><b>${esc(perf.performans_notu ?? perf.yetkinlik_puani ?? '-')}</b></div>
        <div><span>Karne</span><b>${esc(score.toplam != null ? fmt(score.toplam,0) : '-')}</b></div>
        <div><span>Toplam Kazanç</span><b>${esc(comp.toplam != null ? fmt(comp.toplam,0) : '-')}</b></div>
        <div><span>Kıdem</span><b>${esc(emp.kidem_yil != null ? fmt(emp.kidem_yil,1)+' yıl' : '-')}</b></div>
        <div><span>Segment</span><b>${esc(emp.segment || '-')}</b></div>
      </div><button class="btn ghost" data-remove-compare="${esc(sicil)}" style="margin-top:10px">Çıkar</button></div>`;
    }).join('')}</div>`;
    host.querySelectorAll('[data-remove-compare]').forEach(btn => btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-remove-compare');
      const idx = compareSicils.indexOf(key);
      if(idx >= 0) compareSicils.splice(idx, 1);
      renderCompare();
    }));
  }
  function downloadProfileReport(sicil){
    const emp = DATA.employees[sicil] || {};
    const blocks = ['timeline','risk','performance','scorecard','academy','enocta','development','hiring_time','discipline','movement'].map(kind => {
      const rows = kind === 'movement'
        ? [...rowsFor('exit_survey', sicil), ...rowsFor('regrettable', sicil), ...rowsFor('survival', sicil)]
        : rowsFor(kind, sicil);
      return {kind, rows: newestFirst(rows).slice(0, 50)};
    });
    const payload = {employee: emp, generated_at: new Date().toISOString(), blocks};
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `profil_${emp.sicil_no || sicil}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function renderEmployeeTimeline(host, sicil){
    const events = [];
    rowsFor('timeline', sicil).forEach(r => events.push({date:r.month || r.donem, title:'Çalışan Kaydı', desc:[r.ust_bolum, r.isletme_adi || r.departman_adi, r.gorev || r.unvan].filter(Boolean).join(' · ')}));
    rowsFor('risk', sicil).forEach(r => events.push({date:r.month || r.donem, title:`Risk ${r.risk_puani != null ? fmt(r.risk_puani,1) : ''}`, desc:r.risk_seviyesi || r.risk_aciklama || ''}));
    rowsFor('performance', sicil).forEach(r => events.push({date:r.month || r.donem, title:'Performans', desc:[r.performans_notu, r.sonuc_notu].filter(Boolean).join(' · ')}));
    rowsFor('scorecard', sicil).forEach(r => events.push({date:r.month || r.donem, title:'Karne Puanı', desc:r.toplam_yuzde != null ? pct(r.toplam_yuzde,1) : (r.toplam != null ? fmt(r.toplam,0) : '')}));
    rowsFor('academy', sicil).forEach(r => events.push({date:r.month || r.donem || r.egitim_donemi, title:'Satış Akademisi', desc:[r.grup_adi, r.katilim_durumu, r.mezun].filter(Boolean).join(' · ')}));
    rowsFor('enocta', sicil).forEach(r => events.push({date:r.month || r.donem || r.tamamlama_tarihi, title:'Enocta', desc:[r.etkinlik_adi, r.tamamlama_durumu].filter(Boolean).join(' · ')}));
    rowsFor('discipline', sicil).forEach(r => events.push({date:r.ceza_tarihi || r.month || r.TARIH, title:'Ceza / Disiplin', desc:[r.ceza_adi, r.ceza_kodu, r.ceza_aciklama || r.ACIKLAMA].filter(Boolean).join(' · ')}));
    [...rowsFor('exit_survey', sicil), ...rowsFor('regrettable', sicil)].forEach(r => events.push({date:r.month || r.donem || r.cikis_tarihi, title:'Hareket / Çıkış', desc:[r.cikis_tarihi, r.performans_kaynak, r.risk_seviyesi].filter(Boolean).join(' · ')}));
    const sorted = newestFirst(events).slice(0, 20);
    if(!sorted.length) return;
    const box = document.createElement('div');
    box.className = 'event-timeline';
    box.innerHTML = sorted.map(e => `<div class="event"><div class="event-date">${esc(monthLabel(e.date) || e.date || '-')}</div><div><div class="event-title">${esc(e.title)}</div><div class="event-desc">${esc(e.desc || '')}</div></div></div>`).join('');
    host.appendChild(box);
  }
  function renderProfile(){
    const host = $('profileCard');
    const emp = DATA.employees[selectedSicil];
    if(!emp){ host.innerHTML = empty('Kişi seçilmedi'); return; }
    const riskRows = rowsFor('risk', selectedSicil);
    const perfRows = rowsFor('performance', selectedSicil);
    const tlRows = rowsFor('timeline', selectedSicil);
    const disciplineRows = rowsFor('discipline', selectedSicil);
    const lr = latestRow(riskRows) || {};
    const lp = latestRow(perfRows) || {};
    const lt = latestRow(tlRows) || {};
    const ld = latestRow(disciplineRows) || {};
    const tabs = [
      ['timeline','Zaman \u00c7izgisi'], ['risk','Risk'], ['performance','Performans Verisi'], ['scorecard','Karne Puan\u0131'], ['academy','Sat\u0131\u015f Akademisi'],
      ['enocta','Enocta'], ['development','Geli\u015fim'], ['hiring_time','\u0130\u015fe Alma'], ['discipline','Ceza / Disiplin'], ['compensation','Kazan\u00e7'], ['movement','Hareket / \u00c7\u0131k\u0131\u015f'], ['raw','Ham Profil']
    ];
    host.innerHTML = `
      <div class="profile-head">
        <div><div class="profile-name">${esc(emp.display_name || emp.adi_soyadi || selectedSicil)}</div><div class="profile-sub">${esc(emp.sicil_no || selectedSicil)} · ${esc(emp.ust_bolum || '')} · ${esc(emp.isletme_adi || emp.departman_adi || '')}</div><div class="badges">${riskBadge(lr.risk_puani)}<span class="badge">${esc(emp.gorev || emp.unvan || emp.kadro_adi || '-')}</span><span class="badge">${esc(emp.telefon || '-')}</span></div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
          <button class="btn ghost" id="addCompare">Karşılaştırmaya ekle</button>
          <button class="btn ghost" id="downloadProfile">Profil raporu indir</button>
          <button class="btn ghost" id="copyProfile">Bilgiyi kopyala</button>
        </div>
      </div>
      <div class="kv" id="profileKv"></div>
      <div class="tabs">${tabs.map(t => `<button class="tab ${activeTab===t[0]?'active':''}" data-tab="${t[0]}">${esc(t[1])}</button>`).join('')}</div>
      <div id="profileTab"></div>`;
    renderKV($('profileKv'), [
      ['Telefon', emp.telefon], ['E-posta', emp.sirket_eposta || emp.ozel_eposta], ['Bölüm', emp.departman_adi || emp.bolum_adi], ['İl', emp.il],
      ['Görev', emp.gorev], ['Unvan', emp.unvan], ['Kadro', emp.kadro_adi], ['Kıdem', emp.kidem_yil != null ? fmt(emp.kidem_yil,1)+' yıl' : ''],
      ['Yaş', emp.yas], ['Kuşak', emp.kusak_aralik], ['Son performans', lp.performans_notu || lp.sonuc_notu], ['Son risk', lr.risk_seviyesi], ['Son ceza', ld.ceza_adi || '']
    ]);
    host.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => { activeTab = btn.getAttribute('data-tab'); renderProfile(); updateHash(); }));
    $('copyProfile')?.addEventListener('click', () => navigator.clipboard?.writeText(`${emp.display_name || ''}\nSicil: ${emp.sicil_no || selectedSicil}\nTelefon: ${emp.telefon || ''}\nBirim: ${emp.isletme_adi || emp.departman_adi || ''}\nGörev: ${emp.gorev || emp.unvan || ''}`));
    $('addCompare')?.addEventListener('click', () => addCompare(selectedSicil));
    $('downloadProfile')?.addEventListener('click', () => downloadProfileReport(selectedSicil));
    renderProfileTab();
  }
  function renderProfileTab(){
    const host = $('profileTab');
    const sicil = selectedSicil;
    if(activeTab === 'timeline') {
      const rows = newestFirst(rowsFor('timeline', sicil));
      host.innerHTML = '';
      renderEmployeeTimeline(host, sicil);
      const table = document.createElement('div');
      host.appendChild(table);
      return renderTable(table, rows, {id:'personTimeline', limit:14});
    }
    if(activeTab === 'compensation') {
      const compCols = ['month','donem','ucret','prim_toplam','kasa_tazminati','net_gelir','temiz_net_gelir','toplam','sgk_gun','fazla_mesai_toplam'];
      const rows = newestFirst(rowsFor('timeline', sicil)).map(r => Object.fromEntries(compCols.filter(c => r[c] !== undefined).map(c => [c, r[c]])));
      host.innerHTML = '';
      renderMetricTrend(host, rows, ['toplam','net_gelir','temiz_net_gelir'], 'Kazanç Trendi');
      const table = document.createElement('div');
      host.appendChild(table);
      return renderTable(table, rows, {id:'personCompensation', limit:14, columns: compCols});
    }
    if(activeTab === 'risk') return renderTable(host, newestFirst(rowsFor('risk', sicil)), {id:'personRisk', limit:12});
    if(activeTab === 'performance') {
      const rows = newestFirst(rowsFor('performance', sicil));
      host.innerHTML = '';
      renderMetricTrend(host, rows, ['performans_notu','yetkinlik_puani','dengeli_karne_puani'], 'Performans Trendi');
      const table = document.createElement('div');
      host.appendChild(table);
      return renderTable(table, rows, {id:'personPerf', limit:12});
    }
    if(activeTab === 'scorecard') {
      const rows = newestFirst(rowsFor('scorecard', sicil));
      if(!rows.length) return setHTML(host, empty('Bu kişi için kümüle karne eşleşmesi bulunamadı. Karne puanı ağırlıklı olarak mağaza çalışanlarında oluşur.'));
      host.innerHTML = '';
      renderMetricTrend(host, rows, ['toplam_yuzde','toplam'], 'Karne Puanı Trendi');
      const table = document.createElement('div');
      host.appendChild(table);
      return renderTable(table, rows, {id:'personScorecard', limit:12});
    }
    if(activeTab === 'academy') return renderTable(host, newestFirst(rowsFor('academy', sicil)), {id:'personAcademy', limit:12});
    if(activeTab === 'enocta') {
      const rows = newestFirst([...rowsFor('enocta_summary', sicil), ...rowsFor('enocta', sicil)]);
      return renderTable(host, rows, {id:'personEnocta', limit:16});
    }
    if(activeTab === 'development') {
      const rows = newestFirst([...rowsFor('development', sicil), ...rowsFor('long_no_training', sicil), ...rowsFor('non_attending', sicil)]);
      return renderTable(host, rows, {id:'personDevelopment', limit:12});
    }
    if(activeTab === 'discipline') return renderTable(host, newestFirst(rowsFor('discipline', sicil)), {id:'personDiscipline', limit:12});
    if(activeTab === 'hiring_time') {
      const rows = newestFirst(rowsFor('hiring_time', sicil));
      if(!rows.length) return setHTML(host, empty('Bu ki\u015fi i\u00e7in i\u015fe alma s\u00fcresi kayd\u0131 bulunamad\u0131.'));
      return renderTable(host, rows, {id:'personHiringTime', limit:12});
    }
    if(activeTab === 'movement') {
      const rows = newestFirst([...rowsFor('exit_survey', sicil), ...rowsFor('regrettable', sicil), ...rowsFor('survival', sicil)]);
      return renderTable(host, rows, {id:'personMovement', limit:12});
    }
    if(activeTab === 'raw') {
      return renderTable(host, [DATA.employees[sicil]], {id:'personRaw', limit:1});
    }
  }
  function updateHash(){
    const params = new URLSearchParams();
    if(selectedSicil) params.set('sicil', selectedSicil);
    if(activeTab) params.set('tab', activeTab);
    history.replaceState(null, '', '#' + params.toString());
  }
  function readHash(){
    const params = new URLSearchParams(location.hash.slice(1));
    return {sicil: params.get('sicil'), tab: params.get('tab')};
  }
  function restoreWindowScroll(top){
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, Math.max(0, Number(top) || 0));
    root.style.scrollBehavior = previous;
  }
  function selectEmployee(sicil, opts={}){
    const preservedScrollY = Number.isFinite(Number(opts.scrollY)) ? Number(opts.scrollY) : window.scrollY;
    selectedSicil = sicil;
    renderResults(search($('globalSearch').value));
    renderProfile();
    if(!opts.skipHash) updateHash();
    requestAnimationFrame(() => restoreWindowScroll(preservedScrollY));
  }
  function initSearch(){
    const input = $('globalSearch');
    renderFilterChips();
    renderCompare();
    const hash = readHash();
    if(hash.tab) activeTab = hash.tab;
    const initial = search('');
    renderResults(initial);
    if(hash.sicil && DATA.employees[hash.sicil]) selectEmployee(hash.sicil, {skipHash:true});
    else if(initial[0]) selectEmployee(initial[0].sicil_key, {skipHash:true});
    input.addEventListener('input', () => {
      const preservedScrollY = window.scrollY;
      const rows = search(input.value);
      renderResults(rows);
      if(rows.length && input.value.trim().length >= 3) selectEmployee(rows[0].sicil_key, {scrollY: preservedScrollY});
      else requestAnimationFrame(() => restoreWindowScroll(preservedScrollY));
    });
    $('clearSearch').addEventListener('click', () => { input.value = ''; renderResults(search('')); input.focus(); });
    $('exportSearch')?.addEventListener('click', () => downloadCsv('admin_arama_sonuclari.csv', currentSearchRows, ['sicil_no','name','scope','unit','title','has_risk','has_training','has_scorecard','has_discipline','has_exit']));
    document.addEventListener('keydown', e => {
      if((e.ctrlKey || e.metaKey) && String(e.key || '').toLowerCase() === 'k'){
        e.preventDefault(); input.focus(); input.select();
      }
    });
  }
  function initNav(){
    const links = [...document.querySelectorAll('.nav a')];
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if(e.isIntersecting){
          links.forEach(a => {
            const active = a.getAttribute('href') === '#'+e.target.id;
            a.classList.toggle('active', active);
          });
        }
      });
    }, {rootMargin:'-20% 0px -65% 0px', threshold:0.01});
    document.querySelectorAll('section[id]').forEach(s => obs.observe(s));
  }
  initMeta();
  renderOverview();
  initSearch();
  initNav();
  </script>
</body>
</html>'''


def json_payload(data: dict) -> str:
    return json_for_html_script(rd.sanitize(data))


def repair_admin_output_text(html: str) -> str:
    """Final exact UI text cleanup for replacement-character artifacts."""
    replacements = [
        ("Kay?t yok", "Kayıt yok"),
        ("kay\u0131t", "kayıt"),
        ("sat\u0131r", "satır"),
        ("g\u00f6steriliyor", "gösteriliyor"),
        ("Daha az g\u00f6ster", "Daha az göster"),
        ("Daha fazla g\u00f6ster", "Daha fazla göster"),
        ("g\u00f6steriliyor", "gösteriliyor"),
        ("Sade g\u00f6r\u00fcn\u00fcm", "Sade görünüm"),
        ("T\u00fcm kolonlar", "Tüm kolonlar"),
        ("Y?ksek", "Yüksek"),
        ("oda??", "odağı"),
        ("Korunmas?", "Korunması"),
        ("g??l?", "güçlü"),
        ("uyar?", "uyarı"),
        ("?ncelikli", "öncelikli"),
        ("E?le?me", "Eşleşme"),
        ("kontrol?", "kontrolü"),
        ("g?rseli", "görseli"),
        ("i?in", "için"),
        ("e?le?mesi", "eşleşmesi"),
        ("?al??an", "Çalışan"),
        ("B?lge", "Bölge"),
        ("Ma?aza", "Mağaza"),
    ]
    for bad, good in replacements:
        html = html.replace(bad, good)
    return html


def write_admin_html(data: dict, output_path: Path) -> None:
    html = ADMIN_TEMPLATE.replace("__ADMIN_DATA__", json_payload(data))
    html = rd.clean_html_mojibake(html)
    html = repair_admin_output_text(html)
    rd.atomic_write_text(output_path, html, encoding="utf-8")


def generate_admin_panel(
    xlsx_path: Path = DEFAULT_XLSX,
    output_path: Path = DEFAULT_OUTPUT,
) -> Path:
    """Build the static admin panel through the shared production API."""
    xlsx_path = Path(xlsx_path)
    output_path = Path(output_path)
    if not xlsx_path.exists():
        raise FileNotFoundError(f"Excel bulunamadı: {xlsx_path}")
    data = build_admin_data(xlsx_path)
    write_admin_html(data, output_path)
    log(f"Admin panel üretildi: {output_path}")
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="ERD P statik admin panel üreticisi")
    parser.add_argument("--xlsx", type=Path, default=DEFAULT_XLSX, help="Kaynak icmal_sorgu_sonuc.xlsx yolu")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Üretilecek admin HTML yolu")
    args = parser.parse_args()
    generate_admin_panel(args.xlsx, args.output)


if __name__ == "__main__":
    main()
