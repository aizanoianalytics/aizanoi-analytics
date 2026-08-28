from __future__ import annotations
import argparse
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import pandas as pd
import refresh_data as rd
from dashboard_build_common import deterministic_build_time, json_for_html_script
from dashboard_paths import ICMAL_XLSX, MAGAZA_DASHBOARD, PROJECT_ROOT
BASE_DIR = PROJECT_ROOT
DEFAULT_XLSX = ICMAL_XLSX
DEFAULT_OUTPUT = MAGAZA_DASHBOARD
DEFAULT_MIN_MONTH = "2025-01"
DEFAULT_MAX_MONTHS = 0
SENSITIVE_KEYS = {
    "telefon",
    "phone",
    "email",
    "e_posta",
    "tc",
    "tc_kimlik",
    "tc_kimlik_no",
    "ucret",
    "prim",
    "net_gelir",
    "temiz_net_gelir",
    "ceza_aciklama",
    "son_ceza_aciklama",
}
def log(message: str) -> None:
    rd.log_step(f"[MAGAZA TAKIP] {message}")
def safe_number(value: Any, default: float = 0.0) -> float:
    try:
        num = float(value)
    except Exception:
        return default
    return num if math.isfinite(num) else default
def clean_text(value: Any) -> Any:
    if isinstance(value, str):
        text = str(rd.fix_text(value)).replace("\xa0", " ")
        text = text.translate(str.maketrans({
            "ý": "ı",
            "Ý": "İ",
            "þ": "ş",
            "Þ": "Ş",
            "ð": "ğ",
            "Ð": "Ğ",
        }))
        return text.strip()
    return value
def is_actual_region_label(value: Any) -> bool:
    key = rd.normalize_key(clean_text(value))
    parts = str(key).split()
    return len(parts) == 2 and parts[0] == "bolge" and parts[1].isdigit()
def drop_unusable_mojibake_keys(obj: Any) -> Any:
    """Remove duplicate/unused keys that arrived from broken source headers.
    Values are still normalized later. This only drops keys such as
    ``son_katİl?m_tarihi`` when a clean key is already produced by the
    generator. Keeping them increases HTML size and can confuse downstream
    consumers that inspect raw JSON.
    """
    if isinstance(obj, dict):
        return {
            str(k): drop_unusable_mojibake_keys(v)
            for k, v in obj.items()
            if "?" not in str(k)
        }
    if isinstance(obj, list):
        return [drop_unusable_mojibake_keys(v) for v in obj]
    if isinstance(obj, tuple):
        return tuple(drop_unusable_mojibake_keys(v) for v in obj)
    return obj
def strip_sensitive_payload_keys(obj: Any) -> Any:
    """Remove hidden sensitive/obsolete fields from the static store report payload."""
    if isinstance(obj, dict):
        return {
            str(k): strip_sensitive_payload_keys(v)
            for k, v in obj.items()
            if str(k) not in SENSITIVE_KEYS and "net_gelir" not in str(k)
        }
    if isinstance(obj, list):
        return [strip_sensitive_payload_keys(v) for v in obj]
    if isinstance(obj, tuple):
        return tuple(strip_sensitive_payload_keys(v) for v in obj)
    return obj
def repair_template_mojibake(text: str) -> str:
    """Repair only mojibake in the HTML template, without touching ASCII keys/IDs."""
    out = text
    repairs = [
        ("Ã‡", "Ç"), ("Ã§", "ç"), ("Ã–", "Ö"), ("Ã¶", "ö"), ("Ãœ", "Ü"), ("Ã¼", "ü"),
        ("Ä°", "İ"), ("Ä±", "ı"), ("ÄŸ", "ğ"), ("ÄŽ", "Ğ"), ("Äž", "Ğ"), ("ÄŸ", "ğ"),
        ("ÅŸ", "ş"), ("Åž", "Ş"), ("Å", "ş"), ("Å", "Ş"),
        ("Ã‡", "Ç"), ("Ã§", "ç"), ("Äž", "Ğ"), ("ÄŸ", "ğ"), ("Ä°", "İ"), ("Ä±", "ı"),
        ("Ã–", "Ö"), ("Ã¶", "ö"), ("Åž", "Ş"), ("ÅŸ", "ş"), ("Ãœ", "Ü"), ("Ã¼", "ü"),
        ("Ã°", "ğ"), ("ð", "ğ"), ("Â·", "·"), ("â€”", "—"), ("â€“", "–"),
    ]
    repairs.extend([
        ("đ", "ğ"), ("Đ", "Ğ"), ("ý", "ı"), ("Ý", "İ"), ("ţ", "ş"), ("Ţ", "Ş"),
        ("Dosyas?", "Dosyası"), ("ba?ka", "başka"),
        ("Mağaza", "Mağaza"), ("ma?aza", "mağaza"), ("Ayl?k", "Aylık"), ("Haftal?k", "Haftalık"),
        ("Mağaza", "Ma\u011faza"),
        ("Bölge", "B\u00f6lge"),
        ("bölge", "b\u00f6lge"),
        ("kayna??ndaki", "kaynağındaki"), ("k?rİl?m?", "kırılımı"), ("se?ili", "seçili"),
        ("önceki", "önceki"), ("Doğum", "Doğum"), ("Çalışan", "Çalışan"), ("Şehir", "Şehir"),
        ("Bölge", "Bölge"), ("M?d?r", "Müdür"), ("Kadro Fark?", "Kadro Farkı"),
        ("Norm Kadro Toplamı", "Norm Kadro Toplam\u0131"), ("Fiili Kadro Toplamı", "Fiili Kadro Toplam\u0131"),
        ("Nihai Fiili Kadro Toplamı", "Nihai Fiili Kadro Toplam\u0131"), ("Nihai Kadro Farkı", "Nihai Kadro Fark\u0131"),
        ("Doğum İzni Bilgisi", "Do\u011fum \u0130zni Bilgisi"), ("İlk", "\u0130lk"),
        ("kay?t", "kay\u0131t"), ("g?steriliyor", "g\u00f6steriliyor"),
        ("kayna??ndan", "kayna\u011f\u0131ndan"), ("plan?", "plan\u0131"),
        ("say\u0130lar", "say\u0131lar"), ("say\u0130l?r", "say\u0131l\u0131r"), ("g?ncel", "g\u00fcncel"),
        ("fark?", "fark\u0131"), ("s?f?r", "s\u0131f\u0131r"), ("k?r\u0130l?mlar?", "k\u0131r\u0131l\u0131mlar\u0131"),
        ("Daha Fazla Göster", "Daha Fazla G\u00f6ster"), ("Daha Az G?ster", "Daha Az G\u00f6ster"),
        ("İl Bazl?", "\u0130l Bazl\u0131"), ("?htiyac?", "\u0130htiyac\u0131"),
        ("lokasyonlar?", "lokasyonlar\u0131"), ("hari?,", "hari\u00e7,"), ("Çalışanl?", "\u00c7al\u0131\u015fanl\u0131"),
        ("i?in", "i\u00e7in"), ("hesab?", "hesab\u0131"), ("??k?\u0130lar", "\u00c7\u0131k\u0131\u015flar"),
        ("i\u0130letmeler", "i\u015fletmeler"), ("art?k", "art\u0131k"), ("kay\u0131tlar?", "kay\u0131tlar\u0131"),
        ("?zerinden", "\u00fczerinden"), ("g?ncellenir", "g\u00fcncellenir"), ("Detay?", "Detay\u0131"),
        ("MA?AZA", "MA\u011eAZA"), ("s?reli", "s\u00fcreli"), ("kapsam?", "kapsam\u0131"),
        ("Se?ili Ay", "Se\u00e7ili Ay"), ("İşletme", "\u0130\u015fletme"),
        ("kayd?r", "kayd\u0131r"), ("Pozisyonlar?", "Pozisyonlar\u0131"), ("g?rmek", "g\u00f6rmek"),
        ("g?r?n?m", "g\u00f6r\u00fcn\u00fcm"), ("se?", "se\u00e7"), ("Se?ili", "Se\u00e7ili"),
        ("T?m", "T\u00fcm"), ("?zet", "\u00d6zet"), ("g?sterilir", "g\u00f6sterilir"),
        ("alanlar?", "alanlar\u0131"), ("kal?r", "kal\u0131r"), ("a??k", "a\u00e7\u0131k"),
        ("\u00c7al\u0131\u015fanl?", "\u00c7al\u0131\u015fanl\u0131"),
        ("\u0042\u00f6lge M\u00fcd\u00fcr?", "\u0042\u00f6lge M\u00fcd\u00fcr\u00fc"), ("M\u00fcd\u00fcr?", "M\u00fcd\u00fcr\u00fc"),
        ("Do\u011fum ?zni Bilgisi", "Do\u011fum \u0130zni Bilgisi"), ("?zni", "\u0130zni"),
        ("İl", "İl"), ("Olması Gereken", "Olması Gereken"), ("Dönem", "Dönem"),
        ("İşletme", "İşletme"), ("İşe Giriş", "İşe Giriş"), ("Çıkış", "Çıkış"),
        ("Ayrİlma", "Ayrılma"), ("Ad? Soyad?", "Adı Soyadı"), ("Biti?", "Bitiş"),
        ("?cretsiz", "Ücretsiz"), ("?zin", "İzin"), ("Ba?.Tar.", "Baş.Tar."), ("D?n??", "Dönüş"),
        ("A??klama", "Açıklama"), ("kadro_adı", "kadro_adı"), ("İLK BAŞLAMA TARİHİ", "İLK BAŞLAMA TARİHİ"),
    ])
    repairs = list(dict.fromkeys(repairs))
    for _ in range(4):
        before = out
        for bad, good in repairs:
            out = out.replace(bad, good)
        if out == before:
            break
    # A final pass cleans text that may be produced by broad "İl" / "?i"
    # repairs above. Keep this list exact so JS operators that contain "?"
    # are not touched.
    final_repairs = [
        ("Turnover Ge?mi?i", "Turnover Ge\u00e7mi\u015fi"),
        ("Sayfas?", "Sayfas\u0131"),
        ("Mağaza Müdürlüğü Terfisi Sonrası Turnover Etkisi", "Mağaza Müdürlüğü Terfisi Sonrası Etkiler"),
        ("Mağaza Müdürlüğü Terfisi Sonrası Turnover Etkisi", "Mağaza Müdürlüğü Terfisi Sonrası Etkiler"),
        ("Müdürlüğü", "Müdürlüğü"),
        ("Sonras?", "Sonrası"),
        ("Erken Dönem Turnover Özeti", "Erken D\u00f6nem Turnover \u00d6zeti"),
        ("Bölge Çıkış Listesi", "B\u00f6lge \u00c7\u0131k\u0131\u015f Listesi"),
        ("Bölge Turnover Tablosu", "B\u00f6lge Turnover Tablosu"),
        ("Title Bazl? Turnover Tablosu", "Title Bazl\u0131 Turnover Tablosu"),
        ("Şehir Bazlı Turnover Tablosu", "\u015eehir Bazl\u0131 Turnover Tablosu"),
        ("Mağaza Bazlı Turnover Tablosu", "Ma\u011faza Bazl\u0131 Turnover Tablosu"),
        ("Mağaza Detay Tablosu", "Ma\u011faza Detay Tablosu"),
        ("Mağaza Seçin", "Ma\u011faza Se\u00e7in"),
        ("Turnover Dönemi", "Turnover D\u00f6nemi"),
        ("Son Ay Çalışan", "Son Ay \u00c7al\u0131\u015fan"),
        ("Son Ay Çıkış", "Son Ay \u00c7\u0131k\u0131\u015f"),
        ("Erken Çıkış", "Erken \u00c7\u0131k\u0131\u015f"),
        ("ilk 6 ay i?inde", "ilk 6 ay i\u00e7inde"),
        ("kişi-dönem kaydı", "ki\u015fi-d\u00f6nem kayd\u0131"),
        ("Toplam Çıkış", "Toplam \u00c7\u0131k\u0131\u015f"),
        ("Çıkış", "\u00c7\u0131k\u0131\u015f"),
        (" ? Turnover ", " \u00b7 Turnover "),
        ("Oran?", "Oran\u0131"),
        ("İlk Ay Oranı", "\u0130lk Ay Oran\u0131"),
        ("İlk 2 Ay", "\u0130lk 2 Ay"),
        ("İlk 2 Ay Oranı", "\u0130lk 2 Ay Oran\u0131"),
        ("İlk 6 Ay", "\u0130lk 6 Ay"),
        ("İlk 6 Ay Oranı", "\u0130lk 6 Ay Oran\u0131"),
        ("İşe Giriş", "\u0130\u015fe Giri\u015f"),
        ("İşten Çıkış", "\u0130\u015ften \u00c7\u0131k\u0131\u015f"),
        ("??ten \u00c7\u0131k\u0131\u015f", "\u0130\u015ften \u00c7\u0131k\u0131\u015f"),
        ("D\u00f6nem Ba??", "D\u00f6nem Ba\u015f\u0131"),
        ("Şehir", "\u015eehir"),
        ("Doğum", "Do\u011fum"),
        ("Bölge", "B\u00f6lge"),
        ("Mağaza", "Ma\u011faza"),
        ("Görev", "G\u00f6rev"),
        ("Kıdem", "K\u0131dem"),
        ("T?r?", "T\u00fcr\u00fc"),
        ("Eğitim", "E\u011fitim"),
        ("Satış", "Satış"),
        ("Gelişim", "Gelişim"),
        ("Yolculu?u", "Yolculu\u011fu"),
        ("Katılım", "Kat\u0131l\u0131m"),
        ("Katİld?", "Kat\u0131ld\u0131"),
        ("Katİlmad?", "Kat\u0131lmad\u0131"),
        ("Kay?t", "Kay\u0131t"),
        ("kay?t", "kay\u0131t"),
        ("de?il", "de\u011fil"),
        ("De?il", "De\u011fil"),
        ("ba?arİl?", "ba\u015far\u0131l\u0131"),
        ("ba?ar?s?z", "ba\u015far\u0131s\u0131z"),
        ("eksik", "eksik"),
        ("b\u0130lge", "b\u00f6lge"),
        ("?i", "\u015fi"),
        ("ki?i", "ki\u015fi"),
        ("g?rev", "g\u00f6rev"),
        ("Yazd?r", "Yazd\u0131r"),
        ("Nabz?", "Nabz\u0131"),
        ("Ge?mi?i", "Ge\u00e7mi\u015fi"),
        ("Ge?mi\u015fi", "Ge\u00e7mi\u015fi"),
        ("bulunamad?", "bulunamad\u0131"),
        ("ge?mi\u015fi", "ge\u00e7mi\u015fi"),
        ("Ger?ekle?en", "Ger\u00e7ekle\u015fen"),
        ("Kart?", "Kart\u0131"),
        ("Is? Haritas?", "Is\u0131 Haritas\u0131"),
        ("Satış", "Satış"),
        ("Katİlmayanlar", "Kat\u0131lmayanlar"),
        ("Kat\u0130lmayanlar", "Kat\u0131lmayanlar"),
        ("Kat\u0130l?m", "Kat\u0131l\u0131m"),
        ("Katılım", "Kat\u0131l\u0131m"),
        ("Gelişim", "Gelişim"),
        ("Yolculu?u", "Yolculu\u011fu"),
        ("Bazl?", "Bazl\u0131"),
        ("?zleme", "\u0130zleme"),
        ("S?redir", "S\u00fcredir"),
        ("Eğitim", "E\u011fitim"),
        ("Çıkışlar", "\u00c7\u0131k\u0131\u015flar"),
        ("Çıkış", "\u00c7\u0131k\u0131\u015f"),
        ("İlgili", "\u0130lgili"),
        ("Dönem", "D\u00f6nem"),
        ("İşe Giriş", "\u0130\u015fe Giri\u015f"),
        ("Ayrİlma", "Ayr\u0131lma"),
        ("Ad? Soyad?", "Ad\u0131 Soyad\u0131"),
        ("İşletme", "\u0130\u015fletme"),
        ("Biti?", "Biti\u015f"),
        ("Ba?.Tar.", "Ba\u015f.Tar."),
        ("D?n??", "D\u00f6n\u00fc\u015f"),
        ("A??klama", "A\u00e7\u0131klama"),
        ("Kıdem", "K\u0131dem"),
        ("Görünüm", "G\u00f6r\u00fcn\u00fcm"),
        ("Görev", "G\u00f6rev"),
        ("E\u015fitim", "E\u011fitim"),
        ("g?steriliyor", "g\u00f6steriliyor"),
        ("kay?t", "kay\u0131t"),
        ("T?m", "T\u00fcm"),
        ("B?lge", "B\u00f6lge"), ("Ma?aza", "Ma\u011faza"),
        ("?al??an", "\u00c7al\u0131\u015fan"), ("Giri?", "Giri\u015f"), ("??k??", "\u00c7\u0131k\u0131\u015f"),
        ("Geli?im", "Geli\u015fim"), ("E?itim", "E\u011fitim"), ("Kat?l?m", "Kat\u0131l\u0131m"),
        ("?l", "\u0130l"), ("G?rev", "G\u00f6rev"), ("K?dem", "K\u0131dem"),
        ("Sat??", "Sat\u0131\u015f"), ("Yolculu?u", "Yolculu\u011fu"), ("Uygunlu?u", "Uygunlu\u011fu"),
        ("?zleme", "\u0130zleme"), ("T?m?", "T\u00fcm\u00fc"),
        ("Durumlar?", "Durumlar\u0131"),
        ("Uygunluklar?", "Uygunluklar\u0131"),
        ("Norm Mağaza", "Norm Ma\u011faza"),
        ("kayna??ndaki", "kayna\u011f\u0131ndaki"),
        ("k?rİl?m?", "k\u0131r\u0131l\u0131m\u0131"),
        ("se?ili", "se\u00e7ili"),
        ("önceki", "\u00f6nceki"),
        ("Doğum", "Do\u011fum"),
        ("Fiili Çalışan", "Fiili \u00c7al\u0131\u015fan"),
        ("mağaza grubu", "ma\u011faza grubu"),
        ("T\u00fcm \u00dcst B\u0130l\u00fcmler", "T\u00fcm \u00dcst B\u00f6l\u00fcmler"),
        ("?st b\u0130l?m", "\u00fcst b\u00f6l\u00fcm"),
        ("?st b\u0130l\u00fcm", "\u00fcst b\u00f6l\u00fcm"),
        ("Bölge", "B\u00f6lge"),
        ("Mağaza", "Ma\u011faza"),
        ("Şehir", "\u015eehir"),
        ("M?d?r", "M\u00fcd\u00fcr"),
        ("Toplam?", "Toplam\u0131"),
        ("Fark?", "Fark\u0131"),
        ("İlk", "\u0130lk"),
        ("ENGELLİ STATÜSÜ", "ENGELL\u0130 STAT\u00dcS\u00dc"),
        ("Olması Gereken", "Olmas\u0131 Gereken"),
        ("uygun de?il", "uygun de\u011fil"),
    ]
    for bad, good in final_repairs:
        out = out.replace(bad, good)
    return out
def normalize_months(values: pd.Series) -> list[str]:
    vals = [str(v) for v in values.dropna().astype(str).unique() if str(v) and str(v) != "NaT"]
    return sorted(vals, key=lambda x: pd.Period(x, freq="M"))
def last_n_months(months: list[str], max_months: int) -> list[str]:
    if max_months <= 0:
        return months
    return months[-max_months:]
def filter_store_scope(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame()
    out = df.copy()
    if "ust_bolum_key" in out.columns:
        return out[out["ust_bolum_key"].astype(str) == "magaza"].copy()
    if "ust_bolum_norm" in out.columns:
        return out[out["ust_bolum_norm"].apply(rd.normalize_key) == "magaza"].copy()
    if "ust_bolum" in out.columns:
        return out[out["ust_bolum"].apply(rd.normalize_ust_bolum).apply(rd.normalize_key) == "magaza"].copy()
    return out
def ensure_month(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame()
    out = df.copy()
    if "month" not in out.columns:
        month_col = rd.find_first_col(out, ["donem", "Dönem", "dönem", "Donem", "DONEM"])
        if month_col:
            out["month"] = rd.to_month(pd.to_datetime(out[month_col], errors="coerce"))
    return out
def add_sicil_key(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame()
    out = df.copy()
    if "sicil_key" in out.columns:
        return out
    sicil_col = rd.find_first_col(out, ["sicil_no", "sicil", "P_NO", "perno", "PERNO"])
    if sicil_col:
        out["sicil_key"] = out[sicil_col].apply(rd.normalize_sicil_key)
    return out
def canonical_region(value: Any) -> str:
    txt = clean_text(value)
    if txt is None or (isinstance(txt, float) and pd.isna(txt)):
        return "Bölge Belirsiz"
    txt = str(txt).strip()
    return txt if txt and txt.lower() not in {"nan", "none", "null"} else "Bölge Belirsiz"
def canonical_store(value: Any) -> str:
    txt = clean_text(value)
    if txt is None or (isinstance(txt, float) and pd.isna(txt)):
        return "Mağaza Belirsiz"
    txt = str(txt).strip()
    return txt if txt and txt.lower() not in {"nan", "none", "null"} else "Mağaza Belirsiz"


def is_gs_store(value: Any) -> bool:
    """Return True only for real store codes carrying the literal .GS. marker."""
    return ".gs." in str(value or "").strip().lower()


def store_work_type(row: dict[str, Any]) -> str:
    """Classify store rows consistently for turnover filters."""
    source = (
        row.get("magaza_kirilim")
        or row.get("magaza_kırılım")
        or row.get("magaza_kırılımı")
        or row.get("kadro_adi")
        or row.get("kadro_adı")
        or ""
    )
    return "Part Time" if "part time" in rd.normalize_key(source) else "Full Time"
def sanitize_table_rows(rows: list[dict[str, Any]], keep: list[str], limit: int | None = None) -> list[dict[str, Any]]:
    safe_rows: list[dict[str, Any]] = []
    for row in rows:
        item: dict[str, Any] = {}
        for key in keep:
            if key in SENSITIVE_KEYS:
                continue
            val = row.get(key)
            if isinstance(val, str):
                val = clean_text(val)
            item[key] = val
        safe_rows.append(item)
        if limit and len(safe_rows) >= limit:
            break
    return rd.sanitize(safe_rows)
def group_latest_turnover_sheet(sheet: pd.DataFrame, entity_col: str) -> dict[tuple[str, str], float]:
    if sheet is None or sheet.empty or entity_col not in sheet.columns:
        return {}
    src = ensure_month(sheet)
    if "month" not in src.columns or "turnover1" not in src.columns:
        return {}
    src = src.dropna(subset=["month"]).copy()
    src[entity_col] = src[entity_col].apply(clean_text)
    out: dict[tuple[str, str], float] = {}
    for rec in src[["month", entity_col, "turnover1"]].to_dict("records"):
        entity = canonical_region(rec.get(entity_col)) if entity_col == "departman_adi" else canonical_store(rec.get(entity_col))
        out[(str(rec.get("month")), entity)] = safe_number(rec.get("turnover1"), 0.0)
    return out


def group_turnover_detail_sheet(sheet: pd.DataFrame, entity_col: str) -> dict[tuple[str, str], dict[str, float]]:
    if sheet is None or sheet.empty or entity_col not in sheet.columns:
        return {}
    src = ensure_month(sheet)
    required = {"month", entity_col, "turnover1"}
    if not required.issubset(set(src.columns)):
        return {}
    src = src.dropna(subset=["month"]).copy()
    src[entity_col] = src[entity_col].apply(clean_text)
    for col in ["cikis", "donem_basi", "donem_sonu", "turnover1"]:
        if col in src.columns:
            src[col] = pd.to_numeric(src[col], errors="coerce")
    out: dict[tuple[str, str], dict[str, float]] = {}
    for rec in src.to_dict("records"):
        entity = canonical_region(rec.get(entity_col)) if entity_col == "departman_adi" else canonical_store(rec.get(entity_col))
        month = str(rec.get("month"))
        exits = safe_number(rec.get("cikis"), 0.0)
        start = safe_number(rec.get("donem_basi"), 0.0)
        end = safe_number(rec.get("donem_sonu"), 0.0)
        turnover = safe_number(rec.get("turnover1"), turnover_from_counts(exits, start, end, 0.0))
        out[(month, entity)] = {
            "exits": exits,
            "donem_basi": start,
            "donem_sonu": end,
            "turnover": turnover,
        }
    return out


def build_hgo_lookup(sheet: pd.DataFrame, latest_month: str) -> dict[str, float]:
    if sheet is None or sheet.empty:
        return {}
    src = ensure_month(sheet)
    store_col = rd.find_first_col(src, ["mag_adi", "isletme_adi", "magaza_adi", "magaza", "store"])
    if not store_col or "hgo" not in src.columns or "month" not in src.columns:
        return {}
    src = src.dropna(subset=["month", store_col]).copy()
    if src.empty:
        return {}
    months = [m for m in normalize_months(src["month"]) if not latest_month or m <= latest_month]
    selected_months = months[-12:]
    if not selected_months:
        return {}
    src = src[src["month"].astype(str).isin(selected_months)].copy()
    src[store_col] = src[store_col].apply(canonical_store)
    src["hgo"] = pd.to_numeric(src["hgo"], errors="coerce")
    out: dict[str, float] = {}
    for store, group in src.groupby(store_col, dropna=False):
        vals = group["hgo"].dropna()
        if not vals.empty:
            val = float(vals.mean())
            out[str(store)] = val
            out[rd.normalize_key(store)] = val
    return out


def build_store_ciro_lookup(sheet: pd.DataFrame, latest_month: str) -> dict[str, float]:
    if sheet is None or sheet.empty:
        return {}
    src = ensure_month(sheet)
    store_col = rd.find_first_col(src, ["mag_adi", "isletme_adi", "magaza_adi", "magaza", "store"])
    ciro_col = rd.find_first_col(src, ["omni_ciro", "ciro", "ciro_hedef"])
    if not store_col or not ciro_col or "month" not in src.columns:
        return {}
    src = src.dropna(subset=["month", store_col]).copy()
    months = [m for m in normalize_months(src["month"]) if not latest_month or m <= latest_month]
    selected_months = months[-12:]
    if not selected_months:
        return {}
    src = src[src["month"].astype(str).isin(selected_months)].copy()
    src[store_col] = src[store_col].apply(canonical_store)
    src[ciro_col] = pd.to_numeric(src[ciro_col], errors="coerce")
    out: dict[str, float] = {}
    for store, group in src.groupby(store_col, dropna=False):
        vals = group[ciro_col].dropna()
        if not vals.empty:
            val = float(vals.mean())
            out[str(store)] = val
            out[rd.normalize_key(store)] = val
    return out


def build_hiring_duration_lookups(sheet: pd.DataFrame, latest_month: str) -> tuple[dict[str, float], dict[str, float]]:
    """Return last-12-month average position closing duration by store and region."""
    if sheet is None or sheet.empty:
        return {}, {}
    src = ensure_month(sheet)
    duration_col = rd.find_first_col(src, ["Pozisyon Doldurma Süresi", "pozisyon_doldurma_suresi", "kapatma_suresi", "sure"])
    store_col = rd.find_first_col(src, ["İşletme Adı", "isletme_adi", "mağaza", "magaza", "store"])
    region_col = rd.find_first_col(src, ["Departman Adı", "departman_adi", "bolge", "bölge", "region"])
    scope_col = rd.find_first_col(src, ["Üst Bölüm", "ust_bolum", "ust_bolum_adi"])
    if not duration_col or "month" not in src.columns:
        return {}, {}
    src = src.dropna(subset=["month"]).copy()
    if src.empty:
        return {}, {}
    months = [m for m in normalize_months(src["month"]) if not latest_month or m <= latest_month]
    selected_months = months[-12:]
    if not selected_months:
        return {}, {}
    src = src[src["month"].astype(str).isin(selected_months)].copy()
    if scope_col:
        scope_key = src[scope_col].apply(rd.normalize_key)
        store_scope = scope_key.eq("magaza") | scope_key.str.contains("magaza", na=False)
        if store_scope.any():
            src = src[store_scope].copy()
    src["_duration"] = pd.to_numeric(src[duration_col], errors="coerce")
    src = src[src["_duration"].notna()]
    store_lookup: dict[str, float] = {}
    region_lookup: dict[str, float] = {}
    if store_col:
        src["_store"] = src[store_col].apply(canonical_store)
        for store, group in src.dropna(subset=["_store"]).groupby("_store", dropna=False):
            vals = group["_duration"].dropna()
            if not vals.empty:
                val = float(vals.mean())
                store_lookup[str(store)] = val
                store_lookup[rd.normalize_key(store)] = val
    if region_col:
        src["_region"] = src[region_col].apply(canonical_region)
        for region, group in src.dropna(subset=["_region"]).groupby("_region", dropna=False):
            vals = group["_duration"].dropna()
            if not vals.empty:
                val = float(vals.mean())
                region_lookup[str(region)] = val
                region_lookup[rd.normalize_key(region)] = val
    return store_lookup, region_lookup


def group_scope_turnover_sheet(sheet: pd.DataFrame, scope_label: str = "magaza") -> dict[str, float]:
    if sheet is None or sheet.empty or "turnover1" not in sheet.columns:
        return {}
    src = ensure_month(sheet)
    scope_col = rd.find_first_col(src, ["ust_bolum", "scope", "loc"])
    if not scope_col or "month" not in src.columns:
        return {}
    src = src.dropna(subset=["month"]).copy()
    src["turnover1"] = pd.to_numeric(src["turnover1"], errors="coerce")
    target = rd.normalize_key(scope_label)
    out: dict[str, float] = {}
    for rec in src[[scope_col, "month", "turnover1"]].to_dict("records"):
        key = rd.normalize_key(rec.get(scope_col))
        is_match = key == target or (target == "magaza" and key.startswith("ma") and key.endswith("aza"))
        if is_match and pd.notna(rec.get("turnover1")):
            out[str(rec.get("month"))] = float(rec.get("turnover1"))
    return out


def group_scope_turnover_detail_sheet(sheet: pd.DataFrame, scope_label: str = "magaza") -> dict[str, dict[str, float]]:
    if sheet is None or sheet.empty:
        return {}
    src = ensure_month(sheet)
    scope_col = rd.find_first_col(src, ["ust_bolum", "scope", "loc"])
    if not scope_col or "month" not in src.columns:
        return {}
    src = src.dropna(subset=["month"]).copy()
    for col in ["turnover1", "cikis", "ortalama1", "donem_basi", "donem_sonu"]:
        if col in src.columns:
            src[col] = pd.to_numeric(src[col], errors="coerce")
    target = rd.normalize_key(scope_label)
    out: dict[str, dict[str, float]] = {}
    for rec in src.to_dict("records"):
        key = rd.normalize_key(rec.get(scope_col))
        is_match = key == target or (target == "magaza" and key.startswith("ma") and key.endswith("aza"))
        if not is_match:
            continue
        month = str(rec.get("month") or "")
        if not month:
            continue
        avg = safe_number(rec.get("ortalama1"), 0.0)
        start = safe_number(rec.get("donem_basi"), 0.0)
        end = safe_number(rec.get("donem_sonu"), 0.0)
        if (start + end) <= 0 and avg > 0:
            start = avg
            end = avg
        exits = safe_number(rec.get("cikis"), 0.0)
        raw_turnover = rec.get("turnover1")
        out[month] = {
            "turnover": float(raw_turnover) if pd.notna(raw_turnover) else turnover_from_counts(exits, start, end, avg),
            "exits": float(exits),
            "donem_basi": float(start),
            "donem_sonu": float(end),
        }
    return out


def turnover_from_counts(exits: float, donem_basi: float | None, donem_sonu: float | None, fallback_headcount: float = 0.0) -> float:
    """Dashboard ile aynı turnover hesabı: çıkış / ((dönem başı + dönem sonu) / 2)."""
    start = safe_number(donem_basi, 0.0)
    end = safe_number(donem_sonu, 0.0)
    denom = ((start + end) / 2) if (start + end) > 0 else safe_number(fallback_headcount, 0.0)
    return float(exits / denom) if denom > 0 else 0.0


def apply_scorecard_fallback(scorecard: list[dict[str, Any]], store_monthly: list[dict[str, Any]], latest_month: str) -> list[dict[str, Any]]:
    """Eksik son ay karnesini önce mağazanın son 12 ayı, sonra tüm mağaza ortalaması ile doldurur."""
    if not scorecard:
        return scorecard
    months = sorted({str(r.get("month")) for r in store_monthly if r.get("month")})
    months = [m for m in months if not latest_month or m <= latest_month][-12:]
    recent = [r for r in store_monthly if str(r.get("month")) in set(months)]
    store_avg: dict[str, float] = {}
    all_vals: list[float] = []
    grouped_recent = pd.DataFrame(recent).groupby("store", dropna=False) if recent else []
    for store, rows in grouped_recent:
        vals = pd.to_numeric(rows.get("avg_scorecard", pd.Series(dtype="float")), errors="coerce").dropna()
        if vals.empty:
            continue
        val = float(vals.mean())
        store_avg[canonical_store(store)] = val
        all_vals.extend([float(v) for v in vals.tolist()])
    global_avg = float(pd.Series(all_vals).mean()) if all_vals else None
    for row in scorecard:
        current = pd.to_numeric(pd.Series([row.get("avg_scorecard")]), errors="coerce").iloc[0]
        if pd.notna(current):
            row["avg_scorecard_source"] = "Seçili ay karnesi"
            continue
        store = canonical_store(row.get("store"))
        if store in store_avg:
            row["avg_scorecard"] = store_avg[store]
            row["avg_scorecard_source"] = "Son 12 ay ortalaması"
        elif global_avg is not None:
            row["avg_scorecard"] = global_avg
            row["avg_scorecard_source"] = "Tüm mağazalar ortalaması"
        else:
            row["avg_scorecard_source"] = "Karne yok"
    return scorecard


def apply_region_scorecard_fallback(
    region_monthly: list[dict[str, Any]],
    store_scorecard: list[dict[str, Any]],
    latest_month: str,
) -> list[dict[str, Any]]:
    """Bölge son ay karnesi boşsa son 12 ay ve mağaza karnesi üzerinden doldurur."""
    if not region_monthly:
        return region_monthly

    months = sorted({str(r.get("month")) for r in region_monthly if r.get("month")})
    months = [m for m in months if not latest_month or m <= latest_month][-12:]
    recent = [r for r in region_monthly if str(r.get("month")) in set(months)]

    region_avg: dict[str, float] = {}
    all_vals: list[float] = []
    if recent:
        recent_df = pd.DataFrame(recent)
        if {"region", "avg_scorecard"}.issubset(recent_df.columns):
            for region, rows in recent_df.groupby("region", dropna=False):
                vals = pd.to_numeric(rows.get("avg_scorecard", pd.Series(dtype="float")), errors="coerce").dropna()
                if vals.empty:
                    continue
                val = float(vals.mean())
                region_avg[canonical_region(region)] = val
                all_vals.extend([float(v) for v in vals.tolist()])

    store_df = pd.DataFrame(store_scorecard)
    if not store_df.empty and {"region", "avg_scorecard"}.issubset(store_df.columns):
        for region, rows in store_df.groupby("region", dropna=False):
            region_key = canonical_region(region)
            if region_key in region_avg:
                continue
            vals = pd.to_numeric(rows.get("avg_scorecard", pd.Series(dtype="float")), errors="coerce").dropna()
            if vals.empty:
                continue
            val = float(vals.mean())
            region_avg[region_key] = val
            all_vals.extend([float(v) for v in vals.tolist()])

    global_avg = float(pd.Series(all_vals).mean()) if all_vals else None
    for row in region_monthly:
        current = pd.to_numeric(pd.Series([row.get("avg_scorecard")]), errors="coerce").iloc[0]
        if pd.notna(current):
            row["avg_scorecard_source"] = "Seçili ay karnesi"
            continue
        region = canonical_region(row.get("region"))
        if region in region_avg:
            row["avg_scorecard"] = region_avg[region]
            row["avg_scorecard_source"] = "Son 12 ay ortalaması"
        elif global_avg is not None:
            row["avg_scorecard"] = global_avg
            row["avg_scorecard_source"] = "Tüm bölgeler ortalaması"
        else:
            row["avg_scorecard_source"] = "Karne yok"
    return region_monthly


def aggregate_entity_monthly(
    df: pd.DataFrame,
    *,
    entity_col: str,
    entity_key: str,
    months: list[str],
    turnover_lookup: dict[tuple[str, str], float] | None = None,
    turnover_detail_lookup: dict[tuple[str, str], dict[str, float]] | None = None,
) -> list[dict[str, Any]]:
    if df.empty or "month" not in df.columns or entity_col not in df.columns:
        return []
    turnover_lookup = turnover_lookup or {}
    turnover_detail_lookup = turnover_detail_lookup or {}
    work = df[df["month"].astype(str).isin(months)].copy()
    if work.empty:
        return []
    work[entity_col] = work[entity_col].apply(canonical_region if entity_key == "region" else canonical_store)
    for col in ["calisan_sayisi", "reel_ise_giris", "cikis", "reel_isten_cikis", "donem_basi", "donem_sonu"]:
        if col in work.columns:
            work[col] = pd.to_numeric(work[col], errors="coerce").fillna(0)
    for col in ["toplam_yuzde", "toplam", "izleme_dk", "hgo"]:
        if col in work.columns:
            work[col] = pd.to_numeric(work[col], errors="coerce")
    rows: list[dict[str, Any]] = []
    grouped = work.groupby(["month", entity_col], dropna=False)
    for (month, entity), group in grouped:
        hc = safe_number(group["calisan_sayisi"].sum() if "calisan_sayisi" in group.columns else len(group), 0)
        entries = safe_number(group["reel_ise_giris"].sum() if "reel_ise_giris" in group.columns else 0, 0)
        exits = safe_number(group["cikis"].sum() if "cikis" in group.columns else (group["reel_isten_cikis"].sum() if "reel_isten_cikis" in group.columns else 0), 0)
        donem_basi = safe_number(group["donem_basi"].sum() if "donem_basi" in group.columns else 0, 0)
        donem_sonu = safe_number(group["donem_sonu"].sum() if "donem_sonu" in group.columns else 0, 0)
        score_col = "toplam_yuzde" if "toplam_yuzde" in group.columns else ("toplam" if "toplam" in group.columns else None)
        score_series = group[score_col].dropna() if score_col else pd.Series(dtype="float")
        enocta_series = group["izleme_dk"].dropna() if "izleme_dk" in group.columns else pd.Series(dtype="float")
        hgo_series = group["hgo"].dropna() if "hgo" in group.columns else pd.Series(dtype="float")
        turnover = turnover_lookup.get((str(month), str(entity)))
        if turnover is None:
            turnover = turnover_from_counts(exits, donem_basi, donem_sonu, hc)
        detail = turnover_detail_lookup.get((str(month), str(entity)))
        if detail:
            exits = safe_number(detail.get("exits"), exits)
            donem_basi = safe_number(detail.get("donem_basi"), donem_basi)
            donem_sonu = safe_number(detail.get("donem_sonu"), donem_sonu)
            turnover = safe_number(detail.get("turnover"), turnover)
        rows.append(
            {
                "month": str(month),
                entity_key: str(entity),
                "headcount": int(round(hc)),
                "entries": int(round(entries)),
                "exits": int(round(exits)),
                "donem_basi": int(round(donem_basi)),
                "donem_sonu": int(round(donem_sonu)),
                "turnover": float(turnover),
                "avg_scorecard": float(score_series.mean()) if not score_series.empty else None,
                "avg_enocta_dk": float(enocta_series.mean()) if not enocta_series.empty else None,
                "avg_hgo": float(hgo_series.mean()) if not hgo_series.empty else None,
            }
        )
    rows.sort(key=lambda r: (r["month"], r[entity_key]))
    return rows
def aggregate_total_monthly(
    store_df: pd.DataFrame,
    months: list[str],
    turnover_lookup: dict[str, float] | None = None,
    turnover_detail_lookup: dict[str, dict[str, float]] | None = None,
) -> list[dict[str, Any]]:
    if store_df.empty or "month" not in store_df.columns:
        return []
    turnover_lookup = turnover_lookup or {}
    turnover_detail_lookup = turnover_detail_lookup or {}
    work = store_df[store_df["month"].astype(str).isin(months)].copy()
    for col in ["calisan_sayisi", "reel_ise_giris", "cikis", "reel_isten_cikis", "donem_basi", "donem_sonu"]:
        if col in work.columns:
            work[col] = pd.to_numeric(work[col], errors="coerce").fillna(0)
    rows = []
    for month, group in work.groupby("month", dropna=False):
        hc = safe_number(group["calisan_sayisi"].sum() if "calisan_sayisi" in group.columns else len(group), 0)
        entries = safe_number(group["reel_ise_giris"].sum() if "reel_ise_giris" in group.columns else 0, 0)
        exits = safe_number(group["cikis"].sum() if "cikis" in group.columns else (group["reel_isten_cikis"].sum() if "reel_isten_cikis" in group.columns else 0), 0)
        donem_basi = safe_number(group["donem_basi"].sum() if "donem_basi" in group.columns else 0, 0)
        donem_sonu = safe_number(group["donem_sonu"].sum() if "donem_sonu" in group.columns else 0, 0)
        turnover = turnover_lookup.get(str(month))
        if turnover is None:
            turnover = turnover_from_counts(exits, donem_basi, donem_sonu, hc)
        detail = turnover_detail_lookup.get(str(month))
        if detail:
            exits = safe_number(detail.get("exits"), exits)
            donem_basi = safe_number(detail.get("donem_basi"), donem_basi)
            donem_sonu = safe_number(detail.get("donem_sonu"), donem_sonu)
            turnover = safe_number(detail.get("turnover"), turnover)
        rows.append(
            {
                "month": str(month),
                "headcount": int(round(hc)),
                "entries": int(round(entries)),
                "exits": int(round(exits)),
                "donem_basi": int(round(donem_basi)),
                "donem_sonu": int(round(donem_sonu)),
                "turnover": turnover,
            }
        )
    rows.sort(key=lambda r: r["month"])
    return rows
def turnover_month_window(all_months: list[str], latest_month: str) -> list[str]:
    """Return the selected reporting window through the latest month."""
    if not latest_month:
        return list(all_months)
    try:
        latest = pd.Period(str(latest_month), freq="M")
    except Exception:
        return list(all_months)
    out: list[str] = []
    for month in all_months:
        try:
            period = pd.Period(str(month), freq="M")
        except Exception:
            continue
        if period <= latest:
            out.append(str(period))
    return out
def date_iso_or_none(value: Any) -> str | None:
    dt = pd.to_datetime(value, errors="coerce", dayfirst=True)
    if pd.isna(dt):
        return None
    return dt.strftime("%Y-%m-%d")
def month_from_any(value: Any) -> str | None:
    dt = pd.to_datetime(value, errors="coerce", dayfirst=True)
    if pd.isna(dt):
        return None
    return str(dt.to_period("M"))
def store_brand_from_row(row: dict[str, Any]) -> str:
    explicit = clean_text(row.get("marka_indikator"))
    store_raw = str(clean_text(row.get("isletme_adi")) or "")
    def brand_from_store_code(value: object) -> str | None:
        raw = str(clean_text(value) or "").strip()
        if not raw:
            return None
        parts = raw.split(".")
        if len(parts) < 6:
            return None
        code = str(parts[5] or "").strip()
        if not code:
            return None
        first = code[0].upper()
        if first in {"I", "İ"}:
            return "Aurelia"
        if first == "O":
            return "Outlet"
        if first == "M":
            return "Borealis"
        if first == "T":
            return "Cyrene"
        return first
    # Mağaza kodu standardı: TUR.Ank.GS.mll.KUZUEFFECT.I -> 5. nokta sonrası marka kodu.
    # I/İ=Aurelia, O=Outlet, M=Borealis, T=Cyrene; başka kod gelirse ilk harfi rapora taşınır.
    code_brand = brand_from_store_code(store_raw)
    if code_brand:
        return code_brand
    key = rd.normalize_key(explicit)
    store_key = rd.normalize_key(store_raw)
    store_lower = store_raw.lower()
    if "cyrene" in key or key == "t" or ".t" in store_lower or " cyrene" in store_key:
        return "Cyrene"
    if "borealis" in key or "borealis" in str(explicit).lower() or key == "m" or ".m" in store_lower:
        return "Borealis"
    if "outlet" in key or "outlet" in store_key or key == "o" or ".o" in store_lower:
        return "Outlet"
    return "Aurelia"
def build_turnover_page(
    store_df: pd.DataFrame,
    all_months: list[str],
    latest_month: str,
    turnover_store_lookup: dict[tuple[str, str], float] | None = None,
    turnover_store_detail_lookup: dict[tuple[str, str], dict[str, float]] | None = None,
) -> dict[str, Any]:
    if store_df.empty or "month" not in store_df.columns:
        return {"months": [], "full_data": [], "exit_rows": [], "store_detail": []}
    turnover_store_lookup = turnover_store_lookup or {}
    turnover_store_detail_lookup = turnover_store_detail_lookup or {}
    months = turnover_month_window(all_months, latest_month)
    work = store_df[store_df["month"].astype(str).isin(months)].copy()
    if work.empty:
        return {"months": months, "full_data": [], "exit_rows": [], "store_detail": []}
    for col in [
        "calisan_sayisi",
        "reel_ise_giris",
        "cikis",
        "reel_isten_cikis",
        "donem_basi",
        "donem_sonu",
        "cikis",
        "kidem_yil",
    ]:
        if col in work.columns:
            work[col] = pd.to_numeric(work[col], errors="coerce").fillna(0)
    full_rows: list[dict[str, Any]] = []
    exit_rows: list[dict[str, Any]] = []
    for rec in work.to_dict("records"):
        month = str(rec.get("month") or "")
        store = canonical_store(rec.get("isletme_adi"))
        region = canonical_region(rec.get("departman_adi"))
        exits_flag = safe_number(rec.get("cikis") if rec.get("cikis") is not None else rec.get("reel_isten_cikis"), 0.0)
        is_exit = exits_flag > 0
        headcount = safe_number(rec.get("calisan_sayisi"), 0.0)
        donem_basi = safe_number(rec.get("donem_basi"), 0.0)
        donem_sonu = safe_number(rec.get("donem_sonu"), 0.0)
        if headcount <= 0 and not is_exit and donem_basi <= 0 and donem_sonu <= 0:
            # Keep active rows, actual exits and denominator-contributing rows.
            continue
        row = {
            "month": month,
            "sicil": rec.get("sicil_no"),
            "ad_soyad": clean_text(rec.get("adi_soyadi")),
            "store": store,
            "magaza_markasi": store_brand_from_row(rec),
            "region": region,
            "unvan": clean_text(rec.get("unvan")),
            "title": clean_text(
                rec.get("gorev")
                or rec.get("kisa_gorev")
                or rec.get("kısa_gorev")
                or rec.get("magaza_kırılım")
                or rec.get("magaza_kirilim")
                or rec.get("magaza_title")
                or rec.get("unvan")
            ),
            "kadro_adi": clean_text(rec.get("kadro_adi")),
            "magaza_kirilim": clean_text(rec.get("magaza_kirilim") or rec.get("magaza_kırılım") or rec.get("magaza_kırılımı")),
            "calisma_tipi": store_work_type(rec),
            "dogum_tarihi": date_iso_or_none(rec.get("dogum_tarihi") or rec.get("DOGUM_TARIHI")),
            "ise_giris_tarihi": date_iso_or_none(rec.get("ise_giris_tarihi") or rec.get("son_giris_tarihi")),
            "isten_cikis_tarihi": date_iso_or_none(rec.get("cikis_tarihi")) if is_exit else None,
            "kidem_yili": safe_number(rec.get("kidem_yil"), 0.0),
            "city": clean_text(rec.get("il")),
            "headcount": headcount if headcount > 0 else 0,
            "entry": safe_number(rec.get("reel_ise_giris"), 0.0),
            "exit": 1 if is_exit else 0,
            "donem_basi": donem_basi,
            "donem_sonu": donem_sonu,
        }
        full_rows.append(row)
        if is_exit:
            exit_rows.append(row)
    detail_rows: list[dict[str, Any]] = []
    if "isletme_adi" in work.columns:
        grouped = work.groupby(["month", "isletme_adi"], dropna=False)
        for (month, store_name), group in grouped:
            store = canonical_store(store_name)
            donem_basi = safe_number(group["donem_basi"].sum() if "donem_basi" in group.columns else 0, 0)
            donem_sonu = safe_number(group["donem_sonu"].sum() if "donem_sonu" in group.columns else 0, 0)
            exits = safe_number(group["cikis"].sum() if "cikis" in group.columns else (group["reel_isten_cikis"].sum() if "reel_isten_cikis" in group.columns else 0), 0)
            turnover = turnover_store_lookup.get((str(month), store))
            if turnover is None:
                fallback_hc = safe_number(group.get("calisan_sayisi", pd.Series(dtype="float")).sum(), 0)
                turnover = turnover_from_counts(exits, donem_basi, donem_sonu, fallback_hc)
            detail = turnover_store_detail_lookup.get((str(month), store))
            if detail:
                exits = safe_number(detail.get("exits"), exits)
                donem_basi = safe_number(detail.get("donem_basi"), donem_basi)
                donem_sonu = safe_number(detail.get("donem_sonu"), donem_sonu)
                turnover = safe_number(detail.get("turnover"), turnover)
            detail_rows.append(
                {
                    "month": str(month),
                    "store": store,
                    "donem_basi": int(round(donem_basi)),
                    "donem_sonu": int(round(donem_sonu)),
                    "cikis": int(round(exits)),
                    "turnover": float(turnover),
                }
            )
    detail_rows.sort(key=lambda r: (r["store"], r["month"]))
    full_rows.sort(key=lambda r: (r["month"], r["region"], r["store"], str(r.get("ad_soyad") or "")))
    exit_rows.sort(key=lambda r: (r["month"], r["region"], r["store"], str(r.get("ad_soyad") or "")))
    stores = sorted({r["store"] for r in detail_rows if r.get("store")})
    return rd.sanitize(
        {
            "months": months,
            "full_data": full_rows,
            "exit_rows": exit_rows,
            "store_detail": detail_rows,
            "stores": stores,
        }
    )
def build_latest_store_scorecard(
    store_monthly: list[dict[str, Any]],
    risk_df: pd.DataFrame,
    org_rows: list[dict[str, Any]],
    latest_month: str,
) -> list[dict[str, Any]]:
    latest = [r for r in store_monthly if r.get("month") == latest_month]
    risk_map: dict[str, dict[str, Any]] = {}
    risk_work = ensure_month(add_sicil_key(filter_store_scope(risk_df)))
    if not risk_work.empty and "month" in risk_work.columns:
        risk_work = risk_work[risk_work["month"].astype(str) == latest_month].copy()
        store_col = rd.find_first_col(risk_work, ["isletme_adi", "magaza_adi", "magaza"])
        if store_col and "risk_puani" in risk_work.columns:
            risk_work[store_col] = risk_work[store_col].apply(canonical_store)
            risk_work["risk_puani"] = pd.to_numeric(risk_work["risk_puani"], errors="coerce")
            for store, group in risk_work.groupby(store_col, dropna=False):
                scores = group["risk_puani"].dropna()
                risk_map[str(store)] = {
                    "avg_risk": float(scores.mean()) if not scores.empty else None,
                    "high_risk_count": int((scores >= 70).sum()) if not scores.empty else 0,
                    "risk_count": int(len(scores)),
                }
    org_map: dict[str, dict[str, Any]] = {}
    if org_rows:
        for store, rows in pd.DataFrame(org_rows).groupby("magaza", dropna=False):
            total = int(len(rows))
            completed = int(rows["gelisim_yolculugu_durumu"].apply(lambda x: "tamam" in rd.normalize_key(x)).sum()) if "gelisim_yolculugu_durumu" in rows else 0
            academy_grads = int(rows["satis_akademisi_mezun"].apply(lambda x: "mezun" in rd.normalize_key(x) and "degil" not in rd.normalize_key(x)).sum()) if "satis_akademisi_mezun" in rows else 0
            oran_series = pd.to_numeric(rows.get("gelisim_yolculugu_oran", pd.Series(dtype="float")), errors="coerce") if "gelisim_yolculugu_oran" in rows else pd.Series(dtype="float")
            avg_oran = float(oran_series.dropna().mean() / 100) if not oran_series.dropna().empty else None
            org_map[canonical_store(store)] = {
                "org_total": total,
                "development_completed": completed,
                "academy_graduates": academy_grads,
                "development_completion_rate": avg_oran if avg_oran is not None else (completed / total if total else None),
                "academy_graduation_rate": academy_grads / total if total else None,
            }
    scorecard = []
    for row in latest:
        store = canonical_store(row.get("store"))
        risk = risk_map.get(store, {})
        org = org_map.get(store, {})
        scorecard.append(
            {
                **row,
                "store": store,
                "avg_risk": risk.get("avg_risk"),
                "high_risk_count": risk.get("high_risk_count", 0),
                "risk_count": risk.get("risk_count", 0),
                **org,
            }
        )
    scorecard.sort(key=lambda r: (safe_number(r.get("turnover"), 0), safe_number(r.get("high_risk_count"), 0)), reverse=True)
    return scorecard
def build_forecast_rows(pages: dict[str, Any]) -> dict[str, Any]:
    src = pages.get("p016_forecasts", {}) if isinstance(pages, dict) else {}
    rows = []
    for row in src.get("rows", []) or []:
        loc = row.get("ust_bolum_adi") or row.get("scope") or row.get("ust_bolum")
        if rd.normalize_key(loc) != "magaza":
            continue
        item = dict(row)
        item["ust_bolum_adi"] = "Mağaza"
        rows.append(item)
    backtest = []
    for row in src.get("backtest", []) or []:
        loc = row.get("scope") or row.get("ust_bolum_adi") or row.get("ust_bolum")
        if rd.normalize_key(loc) == "magaza":
            backtest.append(row)
    return {"rows": rd.sanitize(rows), "backtest": rd.sanitize(backtest)}
def build_enocta_rows(
    pages: dict[str, Any],
    latest_month: str,
    employee_lookup: dict[str, dict[str, Any]],
    store_city_lookup: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    page = pages.get("p017_enocta", {}) if isinstance(pages, dict) else {}
    by_month = page.get("by_month", {}) if isinstance(page, dict) else {}
    month_payload = {}
    if by_month:
        month_payload = by_month.get(latest_month) or by_month.get(sorted(by_month.keys())[-1]) or {}
    rows = sanitize_table_rows(
        (month_payload or {}).get("top_users", []),
        ["sicil", "ad_soyad", "ust_bolum", "egitim_sayisi", "egitim_sure_saat", "izleme_dk"],
        limit=200,
    )
    enriched = enrich_person_rows(rows, employee_lookup, store_city_lookup)
    safe_rows: list[dict[str, Any]] = []
    for row in enriched:
        if rd.normalize_key(row.get("ust_bolum")) not in {"", "magaza"}:
            continue
        if canonical_store(row.get("magaza")) == "Mağaza Belirsiz":
            continue
        row["kisi_adi"] = row.get("kisi_adi") or clean_text(row.get("ad_soyad"))
        safe_rows.append(row)
    return rd.sanitize(safe_rows)
def simplify_org_tracking(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []

    def note_text(value: object) -> str:
        if value is None:
            return ""
        try:
            if pd.isna(value):
                return ""
        except Exception:
            pass
        return str(clean_text(value)).strip()

    for row in rows:
        eligibility_raw = str(row.get("terfiye_uygunluk") or "")
        eligibility_key = rd.normalize_key(eligibility_raw)
        eligibility = "Uygun" if "icin uygun" in eligibility_key or eligibility_key == "uygun" else "Uygun De\u011fil"
        base_note = note_text(row.get("terfi_uygunluk_notu"))
        tenure_value = pd.to_numeric(pd.Series([row.get("kidem_yili")]), errors="coerce").iloc[0]
        tenure_text = "" if pd.isna(tenure_value) else f"{float(tenure_value):.2f}".replace(".", ",")
        tenure_note = "Kıdem bilgisi yok" if pd.isna(tenure_value) else f"Kıdem {tenure_text} yıl"
        grade_note = f"performans {note_text(row.get('performans_harf_notu')) or 'bilinmiyor'}"
        development_note = f"Gelişim Yolculuğu {note_text(row.get('gelisim_yolculugu_durumu')) or 'kayıt yok'}"
        academy_note = f"Satış Akademisi {note_text(row.get('satis_akademisi_mezun')) or 'kayıt yok'}"
        ceza_turu = note_text(row.get("son_ceza_turu"))
        ceza_tarihi = note_text(row.get("son_ceza_tarihi"))
        ceza_aciklama = note_text(row.get("son_ceza_aciklama"))
        ceza_parts = [x for x in [ceza_turu, ceza_tarihi, ceza_aciklama] if x]
        ceza_note = f"Son ceza/disiplin kaydı: {' - '.join(ceza_parts)}" if ceza_parts else "Ceza/disiplin kaydı yok"
        current_state = "; ".join([tenure_note, grade_note, development_note, academy_note, ceza_note])
        if eligibility == "Uygun":
            target_note = eligibility_raw.strip() or "Terfi kriterleri için uygun"
            decision_note = f"Uygunluk nedeni: {target_note}. Mevcut durum: {current_state}"
        else:
            failure_note = eligibility_raw.split(":", 1)[1].strip() if ":" in eligibility_raw else eligibility_raw.strip()
            failure_note = (
                failure_note.replace("C ve uzeri", "C ve üzeri")
                .replace(" degil", " değil")
                .replace("MY/2.Müdür", "Mağaza Müdür Yardımcılığı / Mağaza 2.Müdürlüğü")
            )
            decision_note = (
                "Uygun olmama nedeni: "
                f"{failure_note or 'gerekli koşullardan biri veya birkaçı sağlanmıyor'}. "
                f"Mevcut durum: {current_state}"
            )
        full_note = f"{decision_note}. {base_note}" if base_note and base_note not in decision_note else decision_note
        out.append(
            {
                "sicil": row.get("sicil"),
                "isim_soyisim": row.get("isim_soyisim"),
                "bolge": canonical_region(row.get("bolge")),
                "magaza": canonical_store(row.get("magaza")),
                "il": clean_text(row.get("il")),
                "gorev": clean_text(row.get("gorev")),
                "son_satis_akademisi": clean_text(row.get("son_satis_akademisi")),
                "son_satis_akademisi_tarihi": row.get("son_satis_akademisi_tarihi"),
                "satis_akademisi_mezun": clean_text(row.get("satis_akademisi_mezun")),
                "gelisim_yolculugu_durumu": clean_text(row.get("gelisim_yolculugu_durumu")),
                "gelisim_yolculugu_oran": row.get("gelisim_yolculugu_oran"),
                "performans_notu": row.get("performans_notu"),
                "performans_harf_notu": row.get("performans_harf_notu"),
                "kidem_yili": row.get("kidem_yili"),
                "son_ceza_tarihi": row.get("son_ceza_tarihi"),
                "son_ceza_turu": ceza_turu,
                "son_ceza_aciklama": ceza_aciklama,
                "terfiye_uygunluk": eligibility,
                "terfi_uygunluk_notu": full_note,
            }
        )
    return rd.sanitize(out)
def latest_store_employee_lookup(store_df: pd.DataFrame, latest_month: str) -> dict[str, dict[str, Any]]:
    if store_df.empty or "month" not in store_df.columns:
        return {}
    work = add_sicil_key(store_df[store_df["month"].astype(str) == latest_month].copy())
    if work.empty or "sicil_key" not in work.columns:
        return {}
    if "calisan_sayisi" in work.columns:
        work = work[pd.to_numeric(work["calisan_sayisi"], errors="coerce").fillna(0) > 0].copy()
    lookup: dict[str, dict[str, Any]] = {}
    for rec in work.to_dict("records"):
        key = rec.get("sicil_key")
        if not key:
            continue
        lookup[str(key)] = {
            "sicil": rec.get("sicil_no"),
            "isim": clean_text(rec.get("adi_soyadi")),
            "bolge": canonical_region(rec.get("departman_adi")),
            "magaza": canonical_store(rec.get("isletme_adi")),
            "il": clean_text(rec.get("il")),
            "gorev": clean_text(rec.get("gorev") or rec.get("unvan")),
            "kidem_yili": rec.get("kidem_yil"),
        }
    return lookup
def build_store_city_lookup(store_df: pd.DataFrame) -> dict[str, str]:
    """Use the latest non-empty historical city for each store code."""
    if store_df.empty or not {"isletme_adi", "il"}.issubset(store_df.columns):
        return {}
    columns = ["isletme_adi", "il"] + (["month"] if "month" in store_df.columns else [])
    work = store_df[columns].copy()
    if "month" in work.columns:
        work = work.sort_values("month")
    lookup: dict[str, str] = {}
    for rec in work.to_dict("records"):
        store_key = rd.normalize_key(canonical_store(rec.get("isletme_adi")))
        city = clean_text(rec.get("il"))
        if store_key and city:
            lookup[store_key] = city
    return lookup


def enrich_person_rows(
    rows: list[dict[str, Any]],
    employee_lookup: dict[str, dict[str, Any]],
    store_city_lookup: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    store_city_lookup = store_city_lookup or {}
    enriched: list[dict[str, Any]] = []
    for row in rows:
        out = dict(row)
        sicil_key = rd.normalize_sicil_key(out.get("sicil") or out.get("sicil_no"))
        emp = employee_lookup.get(str(sicil_key)) if sicil_key else None
        if emp:
            out["sicil"] = out.get("sicil") or emp.get("sicil")
            out["kisi_adi"] = out.get("kisi_adi") or out.get("isim_soyisim") or out.get("adi_soyadi") or emp.get("isim")
            out["isim_soyisim"] = out.get("isim_soyisim") or out.get("kisi_adi") or emp.get("isim")
            out["bolge"] = canonical_region(out.get("bolge") or emp.get("bolge"))
            out["magaza"] = canonical_store(emp.get("magaza") or out.get("magaza"))
            out["il"] = out.get("il") or emp.get("il")
            out["gorev"] = out.get("gorev") or out.get("pozisyon") or out.get("unvan") or emp.get("gorev")
            out["kidem_yili"] = out.get("kidem_yili") or out.get("kıdem_yılı") or emp.get("kidem_yili")
        else:
            out["kisi_adi"] = out.get("kisi_adi") or out.get("isim_soyisim") or out.get("adi_soyadi") or out.get("ad_soyad")
            out["isim_soyisim"] = out.get("isim_soyisim") or out.get("kisi_adi") or out.get("adi_soyadi") or out.get("ad_soyad")
            out["gorev"] = out.get("gorev") or out.get("pozisyon") or out.get("unvan")
            out["bolge"] = canonical_region(out.get("bolge"))
            out["magaza"] = canonical_store(out.get("magaza"))
        if not out.get("il"):
            store_key = rd.normalize_key(out.get("magaza") or out.get("store"))
            out["il"] = store_city_lookup.get(store_key)
        enriched.append(out)
    return rd.sanitize(enriched)
def build_region_health(region_monthly: list[dict[str, Any]], store_scorecard: list[dict[str, Any]], latest_month: str) -> list[dict[str, Any]]:
    by_region: dict[str, dict[str, Any]] = {}
    latest_regions = [r for r in region_monthly if r.get("month") == latest_month]
    for row in latest_regions:
        region = canonical_region(row.get("region"))
        by_region[region] = {
            "region": region,
            "headcount": row.get("headcount", 0),
            "entries": row.get("entries", 0),
            "exits": row.get("exits", 0),
            "turnover": row.get("turnover", 0),
            "store_count": 0,
            "high_risk_count": 0,
            "avg_risk": None,
            "development_completion_rate": None,
            "academy_graduation_rate": None,
            "avg_scorecard": None,
            "avg_enocta_dk": None,
            "avg_hgo": None,
            "avg_ciro": None,
            "position_close_days": None,
            "norm_fiili_orani": None,
            "regrettable_turnover_rate": None,
        }
    store_df = pd.DataFrame(store_scorecard)
    if not store_df.empty and "region" in store_df.columns:
        for region, group in store_df.groupby("region", dropna=False):
            key = canonical_region(region)
            target = by_region.setdefault(key, {"region": key})
            target["store_count"] = int(group["store"].nunique()) if "store" in group.columns else int(len(group))
            target["high_risk_count"] = int(pd.to_numeric(group.get("high_risk_count", 0), errors="coerce").fillna(0).sum())
            if "avg_risk" in group:
                vals = pd.to_numeric(group["avg_risk"], errors="coerce").dropna()
                target["avg_risk"] = float(vals.mean()) if not vals.empty else None
            for col in ["development_completion_rate", "academy_graduation_rate"]:
                if col in group:
                    vals = pd.to_numeric(group[col], errors="coerce").dropna()
                    target[col] = float(vals.mean()) if not vals.empty else None
            for col in ["avg_scorecard", "avg_enocta_dk", "avg_hgo", "position_close_days", "norm_fiili_orani", "regrettable_turnover_rate"]:
                if col in group:
                    vals = pd.to_numeric(group[col], errors="coerce").dropna()
                    target[col] = float(vals.mean()) if not vals.empty else None
            if "avg_ciro" in group:
                vals = pd.to_numeric(group["avg_ciro"], errors="coerce").dropna()
                target["avg_ciro"] = float(vals.sum()) if not vals.empty else None
    rows = list(by_region.values())
    for row in rows:
        turnover_score = min(40, safe_number(row.get("turnover"), 0) * 250)
        risk_score = min(35, safe_number(row.get("avg_risk"), 0) * 0.35)
        training_gap = 1 - safe_number(row.get("academy_graduation_rate"), 0)
        dev_gap = 1 - safe_number(row.get("development_completion_rate"), 0)
        row["attention_score"] = round(turnover_score + risk_score + (training_gap * 15) + (dev_gap * 10), 1)
    rows.sort(key=lambda r: safe_number(r.get("attention_score"), 0), reverse=True)
    return rd.sanitize(rows)
def add_region_to_store_scorecard(scorecard: list[dict[str, Any]], store_df: pd.DataFrame, latest_month: str) -> list[dict[str, Any]]:
    if store_df.empty:
        return scorecard
    latest = store_df[store_df["month"].astype(str) == latest_month].copy() if "month" in store_df.columns else store_df.copy()
    if latest.empty:
        return scorecard
    store_region: dict[str, str] = {}
    if {"isletme_adi", "departman_adi"}.issubset(latest.columns):
        for store, group in latest.groupby("isletme_adi", dropna=False):
            vals = group["departman_adi"].dropna().astype(str)
            store_region[canonical_store(store)] = canonical_region(vals.iloc[0] if not vals.empty else None)
    for row in scorecard:
        row["region"] = store_region.get(canonical_store(row.get("store")), "Bölge Belirsiz")
    return scorecard
def _col_by_norm(df: pd.DataFrame, candidates: list[str]) -> str | None:
    if df is None or df.empty:
        return None
    lookup = {rd.normalize_key(c): c for c in df.columns}
    for candidate in candidates:
        col = lookup.get(rd.normalize_key(candidate))
        if col is not None:
            return col
    return None
def _safe_str(value: Any) -> str:
    value = clean_text(value)
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    text = str(value).strip()
    return "" if text.lower() in {"nan", "none", "nat", "null"} else text


def _parse_date_value(value: Any) -> pd.Timestamp:
    text = _safe_str(value)
    if not text:
        return pd.NaT
    # ISO-like source dates should not be parsed with dayfirst=True; pandas warns and may guess.
    if len(text) >= 10 and text[4:5] == "-" and text[7:8] == "-":
        return pd.to_datetime(text, errors="coerce", dayfirst=False)
    return pd.to_datetime(text, errors="coerce", dayfirst=True)


def _fmt_date(value: Any) -> str | None:
    dt = _parse_date_value(value)
    if pd.isna(dt):
        return None
    return dt.strftime("%d.%m.%Y")


def _month_from_value(value: Any) -> str | None:
    dt = _parse_date_value(value)
    if pd.isna(dt):
        return None
    return str(dt.to_period("M"))
def _previous_month(month: str | None) -> str | None:
    if not month:
        return None
    try:
        return str(pd.Period(str(month), freq="M") - 1)
    except Exception:
        return None
def _month_label_tr(month: str | None) -> str:
    if not month:
        return "-"
    try:
        period = pd.Period(str(month), freq="M")
    except Exception:
        return str(month)
    names = [
        "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
        "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
    ]
    return f"{names[period.month - 1]} {period.year}"
def _canonical_position_title(value: Any) -> str:
    text = _safe_str(value)
    key = rd.normalize_key(text)
    if "belirli sureli" in key and "part time" in key and "satis" in key:
        return "Belirli Süreli Part Time Satış Danışmanı"
    if "belirli sureli" in key and "satis" in key:
        return "Belirli Süreli Full Time Satış Danışmanı"
    if "corner" in key and "satis" in key:
        return "Corner Satış Danışmanı"
    if "part time" in key and "satis" in key:
        return "Part Time Satış Danışmanı"
    if "pasor" in key:
        return "Pasör Satış Danışmanı"
    if "ikinci" in key and "mudur" in key:
        return "Mağaza İkinci Müdürü / Mağaza Müdür Yardımcısı"
    if "mudur yard" in key:
        return "Mağaza İkinci Müdürü / Mağaza Müdür Yardımcısı"
    if "magaza mudur" in key:
        return "Mağaza Müdürü"
    if "magaza destek" in key:
        return "Mağaza Destek Elemanı"
    if "kasiyer" in key:
        return "Kasiyer"
    if "temizlik" in key:
        return "Temizlik Elemanı"
    if "satis danismani" in key or ("satis" in key and "danisman" in key):
        return "Satış Danışmanı"
    return text

def _position_title_sort_key(value: Any) -> tuple[int, str]:
    """Keep weekly norm/fiili titles in a store-operations order."""
    title = _canonical_position_title(value)
    key = rd.normalize_key(title)
    order_rules = [
        (10, lambda k: "magaza muduru" in k and "ikinci" not in k and "yard" not in k),
        (20, lambda k: "magaza ikinci muduru" in k or ("mudur" in k and "yard" in k)),
        (30, lambda k: "pasor" in k),
        (40, lambda k: k == "satis danismani"),
        (50, lambda k: "part time" in k and "satis" in k and "belirli sureli" not in k),
        (60, lambda k: "kasiyer" in k),
        (70, lambda k: "magaza destek" in k),
        (80, lambda k: "belirli sureli" in k and "part time" not in k and "satis" in k),
        (90, lambda k: "belirli sureli" in k and "part time" in k and "satis" in k),
        (100, lambda k: "corner" in k and "satis" in k),
        (110, lambda k: "temizlik" in k),
    ]
    for rank, predicate in order_rules:
        if predicate(key):
            return rank, str(title)
    return 200, str(title)
def build_weekly_fiili_rows(
    fiili_df: pd.DataFrame,
) -> tuple[list[dict[str, Any]], dict[tuple[str, str], int], dict[str, dict[str, Any]], set[str], dict[str, str]]:
    if fiili_df is None or fiili_df.empty:
        return [], {}, {}, set(), {}
    df = fiili_df.copy()
    group_col = _col_by_norm(df, ["CALISAN_GRUP", "calisan grup", "çalışan grup"])
    if group_col:
        df = df[df[group_col].apply(rd.normalize_key) == "magaza"].copy()
    pno_col = _col_by_norm(df, ["P_NO", "sicil", "sicil no"])
    name_col = _col_by_norm(df, ["AD_SOYAD", "ad soyad", "adı soyadı"])
    store_col = _col_by_norm(df, ["ISLETME_AD", "işletme", "mağaza"])
    loc_col = _col_by_norm(df, ["LOKASYON", "lokasyon"])
    bolum_col = _col_by_norm(df, ["BOLUM_ADI", "bölüm adı"])
    ust_col = _col_by_norm(df, ["UST_BOLUM_ADI", "üst bölüm adı"])
    pos_col = _col_by_norm(df, ["POZISYON_ADI", "pozisyon adı"])
    unvan_col = _col_by_norm(df, ["UNVAN_ADI", "unvan adı"])
    kadro_col = _col_by_norm(df, ["kadro_adı", "kadro adı", "kadro_adi"])
    engel_col = _col_by_norm(df, ["ENGEL_STATUSU", "engel durumu"])
    start_col = _col_by_norm(df, ["ILK_BASLAMA_TARIHI", "ilk başlama tarihi"])
    il_col = _col_by_norm(df, ["IL", "il"])
    rows: list[dict[str, Any]] = []
    counts: dict[tuple[str, str], int] = {}
    title_lookup: dict[str, str] = {}
    person_store: dict[str, dict[str, Any]] = {}
    active_sicils: set[str] = set()
    for rec in df.to_dict("records"):
        sicil_key = rd.normalize_sicil_key(rec.get(pno_col)) if pno_col else None
        if sicil_key:
            active_sicils.add(str(sicil_key))
        store = canonical_store(rec.get(store_col) if store_col else None)
        position = _safe_str(rec.get(pos_col) if pos_col else None)
        contract = _safe_str(rec.get(kadro_col) if kadro_col else None)
        if rd.normalize_key(contract) == "belirli sureli" and "belirli sureli" not in rd.normalize_key(position):
            position = f"Belirli Süreli {position}".strip()
        title = _canonical_position_title(position)
        if title:
            title_lookup[rd.normalize_key(title)] = title
        if store and title:
            key = (rd.normalize_key(store), rd.normalize_key(title))
            counts[key] = counts.get(key, 0) + 1
        row = {
            "region": canonical_region(rec.get(bolum_col) if bolum_col else None),
            "bolge": canonical_region(rec.get(bolum_col) if bolum_col else None),
            "store": store,
            "magaza": store,
            "P_NO": rec.get(pno_col) if pno_col else None,
            "AD_SOYAD": clean_text(rec.get(name_col)) if name_col else None,
            "ISLETME_AD": store,
            "LOKASYON": clean_text(rec.get(loc_col)) if loc_col else None,
            "BOLUM_ADI": clean_text(rec.get(bolum_col)) if bolum_col else None,
            "UST_BOLUM_ADI": clean_text(rec.get(ust_col)) if ust_col else None,
            "UNVAN_ADI": clean_text(rec.get(unvan_col)) if unvan_col else None,
            "kadro_adı": contract,
            "ENGEL DURUMU": clean_text(rec.get(engel_col)) if engel_col else None,
            "İLK BAŞLAMA TARİHİ": _fmt_date(rec.get(start_col)) if start_col else None,
            "POZISYON_ADI": position,
            "pozisyon_grubu": title,
            "IL": clean_text(rec.get(il_col)) if il_col else None,
        }
        rows.append(row)
        if sicil_key:
            person_store[str(sicil_key)] = {
                "sicil": rec.get(pno_col) if pno_col else None,
                "store": store,
                "region": row["region"],
                "il": row["IL"],
                "name": row["AD_SOYAD"],
                "gorev": position or row["UNVAN_ADI"],
            }
    rows.sort(key=lambda r: (str(r.get("region") or ""), str(r.get("store") or ""), str(r.get("AD_SOYAD") or "")))
    return rd.sanitize(rows), counts, person_store, active_sicils, title_lookup

def build_weekly_fiili_counts_from_rows(rows: list[dict[str, Any]]) -> tuple[dict[tuple[str, str], int], dict[str, str]]:
    counts: dict[tuple[str, str], int] = {}
    title_lookup: dict[str, str] = {}
    for row in rows or []:
        store = canonical_store(row.get("store") or row.get("magaza") or row.get("ISLETME_AD"))
        title = _canonical_position_title(row.get("pozisyon_grubu") or row.get("POZISYON_ADI"))
        if title:
            title_lookup[rd.normalize_key(title)] = title
        if store and title and store != "Mağaza Belirsiz":
            key = (rd.normalize_key(store), rd.normalize_key(title))
            counts[key] = counts.get(key, 0) + 1
    return counts, title_lookup

def build_norm_fiili_report(
    norm_df: pd.DataFrame,
    fiili_counts: dict[tuple[str, str], int],
    disabled_counts: dict[str, int] | None = None,
    birth_counts: dict[str, int] | None = None,
    fiili_title_lookup: dict[str, str] | None = None,
) -> dict[str, Any]:
    if norm_df is None or norm_df.empty or len(norm_df) < 2:
        return {"titles": [], "rows": [], "position_diffs": []}
    df = norm_df.copy()
    cols = list(df.columns)
    titles: list[dict[str, Any]] = []
    disabled_counts = disabled_counts or {}
    birth_counts = birth_counts or {}
    fiili_title_lookup = fiili_title_lookup or {}
    title_by_norm: dict[str, dict[str, Any]] = {}
    i = 5
    while i < len(cols) - 1:
        col = cols[i]
        next_col = cols[i + 1]
        raw_title = _safe_str(col)
        title = _canonical_position_title(raw_title)
        if (
            title
            and not title.lower().startswith("unnamed")
            and str(next_col).lower().startswith("unnamed")
        ):
            title_key = rd.normalize_key(title)
            if title_key in title_by_norm:
                title_by_norm[title_key].setdefault("norm_cols", []).append(col)
                title_by_norm[title_key].setdefault("fiili_cols", []).append(next_col)
            else:
                item = {
                    "key": f"p{len(titles)}",
                    "title": title,
                    "norm_cols": [col],
                    "fiili_cols": [next_col],
                }
                title_by_norm[title_key] = item
                titles.append(item)
            i += 2
            continue
        i += 1
    norm_title_keys = {rd.normalize_key(t["title"]) for t in titles}
    norm_store_keys: set[str] = set()
    for _, rec in df.iloc[1:].iterrows():
        store = canonical_store(rec.get(cols[1]) if len(cols) > 1 else None)
        if store and store != "Mağaza Belirsiz":
            norm_store_keys.add(rd.normalize_key(store))
    extra_title_keys = sorted({
        title_key
        for (store_key, title_key), count in fiili_counts.items()
        if count > 0 and store_key in norm_store_keys and title_key not in norm_title_keys
    })
    for title_key in extra_title_keys:
        display_title = clean_text(fiili_title_lookup.get(title_key) or title_key.replace("_", " ").title())
        titles.append({
            "key": f"p{len(titles)}",
            "title": display_title,
            "norm_cols": [],
            "fiili_cols": [],
            "extra_fiili": True,
        })
    titles.sort(key=lambda t: _position_title_sort_key(t.get("title")))
    rows: list[dict[str, Any]] = []
    diffs: list[dict[str, Any]] = []
    for _, rec in df.iloc[1:].iterrows():
        store = canonical_store(rec.get(cols[1]) if len(cols) > 1 else None)
        if store == "Mağaza Belirsiz":
            continue
        item: dict[str, Any] = {
            "magaza_kodu": clean_text(rec.get(cols[0])) if cols else None,
            "store": store,
            "magaza": store,
            "sehir": clean_text(rec.get(cols[2])) if len(cols) > 2 else None,
            "region": canonical_region(rec.get(cols[3]) if len(cols) > 3 else None),
            "bolge": canonical_region(rec.get(cols[3]) if len(cols) > 3 else None),
            "bolge_muduru": clean_text(rec.get(cols[4])) if len(cols) > 4 else None,
        }
        norm_total = 0
        fiili_total = 0
        belirli_norm_total = 0
        belirli_fiili_total = 0
        for title_def in titles:
            title = title_def["title"]
            norm_cols = title_def.get("norm_cols") or []
            norm_val = int(round(sum(safe_number(rec.get(norm_col), 0) for norm_col in norm_cols)))
            fiili_val = int(fiili_counts.get((rd.normalize_key(store), rd.normalize_key(title)), 0))
            fark = norm_val - fiili_val
            item[f"{title_def['key']}_norm"] = norm_val
            item[f"{title_def['key']}_fiili"] = fiili_val
            item[f"{title_def['key']}_fark"] = fark
            norm_total += norm_val
            fiili_total += fiili_val
            if "belirli sureli" in rd.normalize_key(title):
                belirli_norm_total += norm_val
                belirli_fiili_total += fiili_val
            if fark != 0:
                diffs.append({
                    "magaza_kodu": item["magaza_kodu"],
                    "region": item["region"],
                    "bolge": item["region"],
                    "store": store,
                    "magaza": store,
                    "sehir": item["sehir"],
                    "bolge_muduru": item["bolge_muduru"],
                    "pozisyon": title,
                    "norm_kadro": norm_val,
                    "fiili_kadro": fiili_val,
                    "fark": fark,
                    "durum": "Eksik" if fark > 0 else "Fazla",
                })
        item["norm_toplam"] = norm_total
        item["fiili_toplam"] = fiili_total
        item["kadro_farki"] = fiili_total - norm_total
        store_key = rd.normalize_key(store)
        engelli_sayisi = int(disabled_counts.get(store_key, 0))
        dogum_izni_sayisi = int(birth_counts.get(store_key, 0))
        nihai_norm = max(0, norm_total - belirli_norm_total)
        nihai_fiili = max(0, fiili_total - engelli_sayisi - belirli_fiili_total)
        item["belirli_sureli_norm_toplam"] = belirli_norm_total
        item["belirli_sureli_fiili_toplam"] = belirli_fiili_total
        item["engelli_sayisi"] = engelli_sayisi
        item["dogum_izni_calisan_sayisi"] = dogum_izni_sayisi
        item["nihai_norm_kadro_toplami"] = nihai_norm
        item["nihai_fiili_kadro_toplami"] = nihai_fiili
        item["nihai_kadro_farki"] = nihai_fiili - nihai_norm
        rows.append(item)
    active_store_keys = {
        rd.normalize_key(row.get("store") or row.get("magaza"))
        for row in rows
        if safe_number(row.get("fiili_toplam"), 0) > 0
    }
    rows = [
        row
        for row in rows
        if rd.normalize_key(row.get("store") or row.get("magaza")) in active_store_keys
    ]
    diffs = [
        row
        for row in diffs
        if rd.normalize_key(row.get("store") or row.get("magaza")) in active_store_keys
    ]
    diffs.sort(key=lambda r: abs(int(r.get("fark") or 0)), reverse=True)
    return {
        "titles": [{"key": t["key"], "title": t["title"], "extra_fiili": bool(t.get("extra_fiili"))} for t in titles],
        "rows": rd.sanitize(rows),
        "position_diffs": rd.sanitize(diffs),
    }

def build_prev_year_current_month_store_counts(store_df: pd.DataFrame) -> tuple[dict[str, int], str, str, int]:
    """Count store employees for the same calendar month one year before today.

    Weekly norm/fiili uses the current fiili list, so the fair historical
    comparison is not latest dashboard month - 12. It is today's year-month
    shifted back by one year, read from the historical Sonuc rows.
    """
    today = deterministic_build_time()
    current_month = f"{today.year}-{today.month:02d}"
    prev_year_month = f"{today.year - 1}-{today.month:02d}"
    if store_df is None or store_df.empty:
        return {}, current_month, prev_year_month, 0
    work = ensure_month(add_sicil_key(store_df))
    if work.empty or "month" not in work.columns:
        return {}, current_month, prev_year_month, 0
    work = work[work["month"].astype(str) == prev_year_month].copy()
    if work.empty:
        return {}, current_month, prev_year_month, 0
    store_col = rd.find_first_col(work, ["isletme_adi", "mağaza", "magaza", "store", "ISLETME_AD"])
    if not store_col:
        return {}, current_month, prev_year_month, 0
    work = work[work[store_col].apply(is_gs_store)].copy()
    if "calisan_sayisi" in work.columns:
        work = work[pd.to_numeric(work["calisan_sayisi"], errors="coerce").fillna(0) > 0].copy()
    if work.empty:
        return {}, current_month, prev_year_month, 0
    counts: dict[str, int] = {}
    for store, group in work.groupby(store_col, dropna=True):
        key = rd.normalize_key(canonical_store(store))
        if not key:
            continue
        if "sicil_key" in group.columns:
            count = int(group["sicil_key"].dropna().astype(str).replace("", pd.NA).dropna().nunique())
        else:
            count = int(len(group))
        counts[key] = counts.get(key, 0) + count
    return counts, current_month, prev_year_month, len(counts)

def build_disabled_city_report(fiili_df: pd.DataFrame) -> list[dict[str, Any]]:
    if fiili_df is None or fiili_df.empty:
        return []
    df = fiili_df.copy()
    unvan_col = _col_by_norm(df, ["UNVAN_ADI", "unvan adı"])
    loc_col = _col_by_norm(df, ["LOKASYON", "lokasyon"])
    city_col = _col_by_norm(df, ["IL", "il"])
    engel_col = _col_by_norm(df, ["ENGEL_STATUSU", "engel durumu"])
    if not city_col:
        return []
    if unvan_col:
        df = df[df[unvan_col].apply(rd.normalize_key) != "stajyer"].copy()
    if loc_col:
        excluded = {rd.normalize_key(x) for x in ["Ayaydın Merkez", "Aurelia Teknoloji Merkez", "Aurelia Teknoloji Teknopark"]}
        df = df[~df[loc_col].apply(rd.normalize_key).isin(excluded)].copy()
    df["_city"] = df[city_col].apply(lambda x: _safe_str(x) or "İl Belirsiz")
    rows: list[dict[str, Any]] = []
    for city, group in df.groupby("_city", dropna=False):
        total = int(len(group))
        if total <= 50:
            continue
        disabled = int(group[engel_col].apply(lambda x: rd.normalize_key(x) == "engelli").sum()) if engel_col else 0
        required = int(math.floor(total * 0.03 + 0.5))
        rows.append({
            "il": city,
            "calisan_sayisi": total,
            "engelli_calisan_sayisi": disabled,
            "olmasi_gereken_engelli_calisan_sayisi": required,
            "fark": required - disabled,
        })
    rows.sort(key=lambda r: (r["fark"], r["calisan_sayisi"]), reverse=True)
    return rd.sanitize(rows)
def build_store_disabled_counts(fiili_df: pd.DataFrame) -> dict[str, int]:
    if fiili_df is None or fiili_df.empty:
        return {}
    df = fiili_df.copy()
    group_col = _col_by_norm(df, ["CALISAN_GRUP", "calisan grup", "çalışan grup"])
    store_col = _col_by_norm(df, ["ISLETME_AD", "işletme", "mağaza"])
    engel_col = _col_by_norm(df, ["ENGEL_STATUSU", "engel durumu"])
    start_col = _col_by_norm(df, ["ILK_BASLAMA_TARIHI", "ilk başlama tarihi"])
    if not store_col or not engel_col or not start_col:
        return {}
    if group_col:
        df = df[df[group_col].apply(rd.normalize_key) == "magaza"].copy()
    start_dates = pd.to_datetime(df[start_col], errors="coerce", dayfirst=True)
    df = df[
        (df[engel_col].apply(rd.normalize_key) == "engelli")
        & (start_dates > pd.Timestamp("2023-01-01"))
    ].copy()
    counts: dict[str, int] = {}
    for store, group in df.groupby(store_col, dropna=False):
        counts[rd.normalize_key(canonical_store(store))] = int(len(group))
    return counts


def build_entry_report(
    fiili_df: pd.DataFrame,
    ayrilanlar_df: pd.DataFrame,
    person_store: dict[str, dict[str, Any]] | None = None,
    store_region_lookup: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Build current/previous calendar-month store entries from live employee sources."""
    selected_month = str(pd.Period(deterministic_build_time(), freq="M"))
    previous_month = _previous_month(selected_month)
    keep_months = {selected_month, previous_month}
    unique_rows: dict[tuple[str, str, str], dict[str, Any]] = {}

    def append_source(source: pd.DataFrame) -> None:
        if source is None or source.empty:
            return
        sicil_col = _col_by_norm(source, ["P_NO", "Sicil No", "sicil", "PERNO"])
        name_col = _col_by_norm(source, ["AD_SOYAD", "Adı Soyadı", "Adi Soyadi", "Ad, Soyad", "ad soyad"])
        store_col = _col_by_norm(source, ["ISLETME_AD", "İşletme", "Isletme", "isletme", "mağaza", "magaza"])
        entry_col = _col_by_norm(source, ["ILK_BASLAMA_TARIHI", "İşe Giriş Tarihi", "Ise Giris Tarihi", "ise giris tarihi"])
        position_col = _col_by_norm(source, ["POZISYON_ADI", "Pozisyon", "Görev Adı", "Gorev Adi", "pozisyon", "görev", "gorev"])
        if not store_col or not entry_col:
            return
        for rec in source.to_dict("records"):
            raw_store = rec.get(store_col)
            if not is_gs_store(raw_store):
                continue
            month = _month_from_value(rec.get(entry_col))
            if month not in keep_months:
                continue
            sicil_key = rd.normalize_sicil_key(rec.get(sicil_col)) if sicil_col else None
            emp = (person_store or {}).get(str(sicil_key)) if sicil_key else None
            store = canonical_store(emp.get("store") if emp else raw_store)
            region = canonical_region(emp.get("region") if emp else (store_region_lookup or {}).get(rd.normalize_key(store)))
            entry_date = _fmt_date(rec.get(entry_col))
            row_key = (str(sicil_key or clean_text(rec.get(name_col)) or ""), str(entry_date or ""), rd.normalize_key(store))
            unique_rows[row_key] = {
                "month": month,
                "period_label": _month_label_tr(month),
                "sicil_no": rec.get(sicil_col) if sicil_col else None,
                "ad_soyad": clean_text(rec.get(name_col)) if name_col else (emp or {}).get("name"),
                "region": region,
                "bolge": region,
                "store": store,
                "magaza": store,
                "pozisyon": clean_text(rec.get(position_col)) if position_col else None,
                "ise_giris_tarihi": entry_date,
            }

    append_source(ayrilanlar_df)
    append_source(fiili_df)
    rows = sorted(unique_rows.values(), key=lambda row: (str(row.get("month") or ""), str(row.get("ise_giris_tarihi") or "")), reverse=True)
    return {
        "selected_month": selected_month,
        "previous_month": previous_month,
        "selected_count": sum(1 for row in rows if row.get("month") == selected_month),
        "previous_count": sum(1 for row in rows if row.get("month") == previous_month),
        "rows": rd.sanitize(rows),
    }


def build_exit_report(
    ayrilanlar_df: pd.DataFrame,
    active_sicils: set[str],
    latest_month: str,
    person_store: dict[str, dict[str, Any]] | None = None,
    store_region_lookup: dict[str, str] | None = None,
) -> dict[str, Any]:
    selected_month = str(pd.Period(deterministic_build_time(), freq="M"))
    prev_month = _previous_month(selected_month)
    empty_payload = {
        "selected_month": selected_month,
        "previous_month": prev_month,
        "selected_count": 0,
        "previous_count": 0,
        "rows": [],
    }
    if ayrilanlar_df is None or ayrilanlar_df.empty:
        return empty_payload
    df = ayrilanlar_df.copy()
    sicil_col = _col_by_norm(df, ["Sicil No", "sicil", "PERNO"])
    name_col = _col_by_norm(df, ["Adı Soyadı", "Adi Soyadi", "Ad, Soyad", "ad soyad"])
    store_col = _col_by_norm(df, ["İşletme", "Isletme", "isletme", "mağaza", "magaza"])
    pos_col = _col_by_norm(df, ["Pozisyon", "Görev Adı", "Gorev Adi", "pozisyon", "görev", "gorev"])
    entry_col = _col_by_norm(df, ["İşe Giriş Tarihi", "Ise Giris Tarihi", "ise giris tarihi"])
    exit_col = _col_by_norm(df, ["Çıkış Tarihi", "Cikis Tarihi", "cikis tarihi"])
    group_col = _col_by_norm(df, ["Ayrılma Sebebi Grubu", "Ayrilma Sebebi Grubu", "ayrilma sebebi grubu"])
    reason_col = _col_by_norm(df, ["Ayrılma Sebebi", "Ayrilma Sebebi", "ayrilma sebebi"])
    if not store_col or not exit_col:
        return empty_payload
    df = df[df[store_col].astype(str).str.lower().str.contains(r"\.gs\.", na=False)].copy()
    df["_sicil_key"] = df[sicil_col].apply(rd.normalize_sicil_key) if sicil_col else None
    df = df[~df["_sicil_key"].astype(str).isin(active_sicils)].copy()
    df["_month"] = df[exit_col].apply(_month_from_value)
    keep_months = {m for m in [selected_month, prev_month] if m}
    df = df[df["_month"].isin(keep_months)].copy()
    rows: list[dict[str, Any]] = []
    for rec in df.to_dict("records"):
        sicil_key = rd.normalize_sicil_key(rec.get(sicil_col)) if sicil_col else None
        emp = (person_store or {}).get(str(sicil_key)) if sicil_key else None
        store = canonical_store(emp.get("store") if emp else rec.get(store_col))
        region_source = emp.get("region") if emp else None
        region = canonical_region(region_source) if region_source else ""
        if (not region or rd.normalize_key(region) in {"bolge belirsiz", "perakende"}) and store_region_lookup:
            region = canonical_region(store_region_lookup.get(rd.normalize_key(store)))
        rows.append({
            "month": rec.get("_month"),
            "period_label": _month_label_tr(rec.get("_month")),
            "sicil_no": rec.get(sicil_col) if sicil_col else None,
            "ad_soyad": clean_text(rec.get(name_col)) if name_col else None,
            "isletme": canonical_store(rec.get(store_col)),
            "store": store,
            "magaza": store,
            "region": region,
            "bolge": region,
            "pozisyon": clean_text(rec.get(pos_col)) if pos_col else None,
            "ise_giris_tarihi": _fmt_date(rec.get(entry_col)) if entry_col else None,
            "cikis_tarihi": _fmt_date(rec.get(exit_col)),
            "ayrilma_sebebi_grubu": clean_text(rec.get(group_col)) if group_col else None,
            "ayrilma_sebebi": clean_text(rec.get(reason_col)) if reason_col else None,
        })
    rows.sort(key=lambda r: (str(r.get("month") or ""), str(r.get("cikis_tarihi") or "")), reverse=True)
    return {
        "selected_month": selected_month,
        "previous_month": prev_month,
        "selected_count": sum(1 for r in rows if r.get("month") == selected_month),
        "previous_count": sum(1 for r in rows if r.get("month") == prev_month),
        "rows": rd.sanitize(rows),
    }
def build_last_training_lookup(enocta_df: pd.DataFrame) -> dict[str, dict[str, Any]]:
    if enocta_df is None or enocta_df.empty:
        return {}
    df = enocta_df.copy()
    sicil_col = _col_by_norm(df, ["sicil", "kullanıcı_sicil", "kullanici_sicil", "sicil_no"])
    training_col = _col_by_norm(df, ["etkinlik_adi", "eğitim adı", "egitim adi", "program_adi"])
    if not sicil_col or not training_col:
        return {}
    date_cols = [
        c for c in [
            _col_by_norm(df, ["tamamlama_tarihi"]),
            _col_by_norm(df, ["baslama_tarihi", "başlama_tarihi"]),
            _col_by_norm(df, ["atanma_tarihi"]),
            _col_by_norm(df, ["donem"]),
        ]
        if c
    ]
    if date_cols:
        df["_last_training_date"] = pd.to_datetime(df[date_cols[0]], errors="coerce", dayfirst=True)
        for col in date_cols[1:]:
            df["_last_training_date"] = df["_last_training_date"].combine_first(
                pd.to_datetime(df[col], errors="coerce", dayfirst=True)
            )
    else:
        df["_last_training_date"] = pd.NaT
    df["_sicil_key"] = df[sicil_col].apply(rd.normalize_sicil_key)
    df = df[df["_sicil_key"].notna()].copy()
    if df.empty:
        return {}
    df = df.sort_values(["_sicil_key", "_last_training_date"], na_position="first")
    lookup: dict[str, dict[str, Any]] = {}
    for key, group in df.groupby("_sicil_key", sort=False):
        rec = group.iloc[-1].to_dict()
        lookup[str(key)] = {
            "son_egitim_adi": clean_text(rec.get(training_col)),
            "son_katildigi_egitim_tarihi": _fmt_date(rec.get("_last_training_date")),
        }
    return lookup
def build_birth_list(dogum_df: pd.DataFrame, person_store: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    if dogum_df is None or dogum_df.empty:
        return []
    df = dogum_df.copy()
    sicil_col = _col_by_norm(df, ["Sicil", "sicil no"])
    name_col = _col_by_norm(df, ["Adı Soyadı", "ad soyad"])
    store_col = _col_by_norm(df, ["Mağaza", "magaza"])
    pos_col = _col_by_norm(df, ["Pozisyon", "pozisyon"])
    if store_col:
        df = df[df[store_col].astype(str).str.lower().str.contains(r"\.gs\.", na=False)].copy()
    rows: list[dict[str, Any]] = []
    for rec in df.to_dict("records"):
        sicil_key = rd.normalize_sicil_key(rec.get(sicil_col)) if sicil_col else None
        emp = person_store.get(str(sicil_key)) if sicil_key else None
        store = canonical_store(emp.get("store") if emp else rec.get(store_col) if store_col else None)
        rows.append({
            "sicil": rec.get(sicil_col) if sicil_col else None,
            "ad_soyad": clean_text(rec.get(name_col)) if name_col else None,
            "store": store,
            "magaza": store,
            "region": canonical_region(emp.get("region") if emp else None),
            "pozisyon": clean_text(rec.get(pos_col)) if pos_col else None,
            "cikis_tarihi": _fmt_date(rec.get("Çıkış Tar.")),
            "rapor_bitis_tarihi": _fmt_date(rec.get("Rapor Bitiş Tar.")),
            "ucretsiz_izin_baslangic": _fmt_date(rec.get("Ücretsiz İzin Baş.Tar.")),
            "ucretsiz_izin_bitis": _fmt_date(rec.get("Ücretsiz İzin Bit.Tar.")),
            "donus_tarihi": _fmt_date(rec.get("Dönüş tarihi")),
            "aciklama": clean_text(rec.get("Açıklama")),
        })
    rows.sort(key=lambda r: (str(r.get("region") or ""), str(r.get("store") or ""), str(r.get("ad_soyad") or "")))
    return rd.sanitize(rows)
def build_weekly_payload(sources: dict[str, Any], latest_month: str, store_df: pd.DataFrame | None = None) -> dict[str, Any]:
    fiili_rows, fiili_counts, person_store, active_sicils, fiili_title_lookup = build_weekly_fiili_rows(sources.get("fiili_df", pd.DataFrame()))
    disabled_store_counts = build_store_disabled_counts(sources.get("fiili_df", pd.DataFrame()))
    birth_list = build_birth_list(sources.get("dogum_listesi_df", pd.DataFrame()), person_store)
    birth_counts: dict[str, int] = {}
    for row in birth_list:
        key = rd.normalize_key(row.get("store") or row.get("magaza"))
        if key:
            birth_counts[key] = birth_counts.get(key, 0) + 1
    norm_report = build_norm_fiili_report(
        sources.get("norm_fiili_kadro_df", pd.DataFrame()),
        fiili_counts,
        disabled_store_counts,
        birth_counts,
        fiili_title_lookup,
    )
    store_region_lookup = {
        rd.normalize_key(row.get("store")): row.get("region")
        for row in norm_report.get("rows", [])
        if row.get("store") and row.get("region")
    }
    for row in fiili_rows:
        lookup_region = store_region_lookup.get(rd.normalize_key(row.get("store") or row.get("magaza")))
        if lookup_region:
            row["region"] = lookup_region
            row["bolge"] = lookup_region
    for emp in person_store.values():
        lookup_region = store_region_lookup.get(rd.normalize_key(emp.get("store")))
        if lookup_region:
            emp["region"] = lookup_region
    fiili_rows = [row for row in fiili_rows if is_actual_region_label(row.get("region"))]
    fiili_counts, fiili_title_lookup = build_weekly_fiili_counts_from_rows(fiili_rows)
    norm_report = build_norm_fiili_report(
        sources.get("norm_fiili_kadro_df", pd.DataFrame()),
        fiili_counts,
        disabled_store_counts,
        birth_counts,
        fiili_title_lookup,
    )
    store_region_lookup = {
        rd.normalize_key(row.get("store")): row.get("region")
        for row in norm_report.get("rows", [])
        if row.get("store") and row.get("region")
    }
    for row in fiili_rows:
        lookup_region = store_region_lookup.get(rd.normalize_key(row.get("store") or row.get("magaza")))
        if lookup_region:
            row["region"] = lookup_region
            row["bolge"] = lookup_region
    for emp in person_store.values():
        lookup_region = store_region_lookup.get(rd.normalize_key(emp.get("store")))
        if lookup_region:
            emp["region"] = lookup_region
    prev_year_counts, current_reference_month, prev_year_same_period_month, prev_year_store_count = build_prev_year_current_month_store_counts(
        store_df if isinstance(store_df, pd.DataFrame) else pd.DataFrame()
    )
    for row in norm_report.get("rows", []):
        store_key = rd.normalize_key(row.get("store") or row.get("magaza"))
        row["current_fiili_reference_month"] = current_reference_month
        row["prev_year_same_period_month"] = prev_year_same_period_month
        row["prev_year_same_period_fiili"] = int(prev_year_counts.get(store_key, 0))
        row["current_gs_store_count"] = 1 if is_gs_store(row.get("store") or row.get("magaza")) and safe_number(row.get("fiili_toplam"), 0) > 0 else 0
        row["prev_year_same_period_gs_store_count"] = 1 if prev_year_counts.get(store_key, 0) > 0 else 0
    prev_year_norm_scope_total = int(sum(safe_number(r.get("prev_year_same_period_fiili"), 0) for r in norm_report.get("rows", [])))
    current_store_count = int(sum(safe_number(r.get("current_gs_store_count"), 0) for r in norm_report.get("rows", [])))
    for row in birth_list:
        lookup_region = store_region_lookup.get(rd.normalize_key(row.get("store") or row.get("magaza")))
        if lookup_region:
            row["region"] = lookup_region
            row["bolge"] = lookup_region
    disabled_city = build_disabled_city_report(sources.get("fiili_df", pd.DataFrame()))
    exits = build_exit_report(
        sources.get("ayrilanlar_df", pd.DataFrame()),
        active_sicils,
        latest_month,
        person_store,
        store_region_lookup,
    )
    entries = build_entry_report(
        sources.get("fiili_df", pd.DataFrame()),
        sources.get("ayrilanlar_df", pd.DataFrame()),
        person_store,
        store_region_lookup,
    )
    return {
        "norm_titles": norm_report["titles"],
        "norm_rows": norm_report["rows"],
        "position_diffs": norm_report["position_diffs"],
        "disabled_city": disabled_city,
        "entries": entries,
        "exits": exits,
        "birth_list": birth_list,
        "fiili_rows": fiili_rows,
        "summary": {
            "norm_store_count": len(norm_report["rows"]),
            "position_gap_count": len([r for r in norm_report["position_diffs"] if r.get("durum") == "Eksik"]),
            "position_excess_count": len([r for r in norm_report["position_diffs"] if r.get("durum") == "Fazla"]),
            "disabled_gap_total": int(sum(max(0, safe_number(r.get("fark"), 0)) for r in disabled_city)),
            "birth_count": len(birth_list),
            "fiili_count": len(fiili_rows),
            "current_fiili_reference_month": current_reference_month,
            "prev_year_same_period_month": prev_year_same_period_month,
            "prev_year_same_period_fiili": prev_year_norm_scope_total,
            "current_gs_store_count": current_store_count,
            "prev_year_same_period_gs_store_count": int(prev_year_store_count),
        },
    }
def build_magaza_data(xlsx_path: Path, *, min_month: str = DEFAULT_MIN_MONTH, max_months: int = DEFAULT_MAX_MONTHS) -> dict[str, Any]:
    log(f"Kaynak okunuyor: {xlsx_path}")
    sources = rd.load_dashboard_sources(xlsx_path, allow_external_fallback=False)
    log("Mevcut dashboard hesap katmanı güvenli veri seçimi için kullanılıyor...")
    dash = rd.build_dashboard_data_from_sources(sources, min_month=min_month)
    pages = dash.get("pages", {})
    df = ensure_month(add_sicil_key(sources.get("df", pd.DataFrame())))
    store_df = filter_store_scope(df)
    if store_df.empty:
        raise RuntimeError("Mağaza kapsamı için veri bulunamadı.")
    all_months = normalize_months(store_df["month"])
    months = last_n_months([m for m in all_months if (not min_month or m >= min_month)], max_months)
    latest_month = months[-1] if months else None
    if not latest_month:
        raise RuntimeError("Mağaza raporu için geçerli dönem bulunamadı.")
    turnover_store_src = filter_store_scope(sources.get("turnover_store", pd.DataFrame()))
    turnover_region_src = filter_store_scope(sources.get("turnover_dept", pd.DataFrame()))
    turnover_store_lookup = group_latest_turnover_sheet(turnover_store_src, "isletme_adi")
    turnover_region_lookup = group_latest_turnover_sheet(turnover_region_src, "departman_adi")
    turnover_store_detail_lookup = group_turnover_detail_sheet(turnover_store_src, "isletme_adi")
    turnover_region_detail_lookup = group_turnover_detail_sheet(turnover_region_src, "departman_adi")
    turnover_total_lookup = group_scope_turnover_sheet(sources.get("turnover_ust", pd.DataFrame()), "magaza")
    turnover_total_detail_lookup = group_scope_turnover_detail_sheet(sources.get("turnover_ust", pd.DataFrame()), "magaza")
    store_total_monthly = aggregate_total_monthly(store_df, months, turnover_total_lookup, turnover_total_detail_lookup)
    store_monthly = aggregate_entity_monthly(
        store_df,
        entity_col="isletme_adi",
        entity_key="store",
        months=months,
        turnover_lookup=turnover_store_lookup,
        turnover_detail_lookup=turnover_store_detail_lookup,
    )
    region_monthly = aggregate_entity_monthly(
        store_df,
        entity_col="departman_adi",
        entity_key="region",
        months=months,
        turnover_lookup=turnover_region_lookup,
        turnover_detail_lookup=turnover_region_detail_lookup,
    )
    org_tracking_page = pages.get("p037_org_dev_employee_tracking", {})
    org_latest = org_tracking_page.get("latest_month") or latest_month
    org_rows = (
        (org_tracking_page.get("by_month") or {}).get(org_latest, {}).get("rows", [])
        if isinstance(org_tracking_page, dict)
        else []
    )
    employee_lookup = latest_store_employee_lookup(store_df, latest_month)
    store_city_lookup = build_store_city_lookup(store_df)
    _, _, fiili_employee_lookup, _, _ = build_weekly_fiili_rows(sources.get("fiili_df", pd.DataFrame()))
    for key, current in fiili_employee_lookup.items():
        previous = employee_lookup.get(str(key), {})
        employee_lookup[str(key)] = {
            **previous,
            "sicil": current.get("sicil") or previous.get("sicil"),
            "isim": current.get("name") or previous.get("isim"),
            "bolge": current.get("region") or previous.get("bolge"),
            "magaza": current.get("store") or previous.get("magaza"),
            "il": current.get("il") or previous.get("il"),
            "gorev": current.get("gorev") or previous.get("gorev"),
        }
    org_rows_safe = enrich_person_rows(simplify_org_tracking(org_rows), employee_lookup, store_city_lookup)
    enocta_rows = build_enocta_rows(pages, latest_month, employee_lookup, store_city_lookup)
    academy_page = pages.get("p036_academy_development_journey", {})
    academy_rows = (
        (academy_page.get("by_month") or {}).get(org_latest, {}).get("rows", [])
        if isinstance(academy_page, dict)
        else []
    )
    academy_rows_safe = enrich_person_rows(
        sanitize_table_rows(
            academy_rows,
            ["sicil", "isim_soyisim", "bolge", "magaza", "il", "gorev", "performans_notu", "kidem_yili", "tamamlama_durumu", "durum_oran"],
        ),
        employee_lookup,
        store_city_lookup,
    )
    non_attending_rows = enrich_person_rows(sanitize_table_rows(
        (pages.get("p019_katilimayanlar", {}) or {}).get("rows", []),
        [
            "sicil",
            "sicil_no",
            "kisi_adi",
            "isim_soyisim",
            "adi_soyadi",
            "ad_soyad",
            "magaza",
            "bolge",
            "gorev",
            "unvan",
            "pozisyon",
            "program",
            "kidem_yili",
            "egitim_durumu",
            "son_katildigi_egitim",
            "son_katildigi_egitim_tarihi",
            "katilim_durumu",
        ],
    ), employee_lookup, store_city_lookup)
    long_no_training_rows = enrich_person_rows(sanitize_table_rows(
        (pages.get("p020_uzun_sure", {}) or {}).get("rows", []),
        [
            "sicil",
            "sicil_no",
            "kisi_adi",
            "adi_soyadi",
            "magaza",
            "bolge",
            "uzman_yonetici",
            "son_katilim_egitim",
            "son_katİl?m_e?itim",
            "son_katilim_tarihi",
            "son_katİl?m_tarihi",
            "son_katildigi_egitim_tarihi",
            "son_egitim_adi",
            "program_adi",
            "kidem_yili",
            "k?dem_yİl?",
        ],
    ), employee_lookup, store_city_lookup)
    last_training_lookup = build_last_training_lookup(sources.get("enocta_raw_df", pd.DataFrame()))
    for row in long_no_training_rows:
        key = rd.normalize_sicil_key(row.get("sicil") or row.get("sicil_no"))
        last = last_training_lookup.get(str(key)) if key else None
        if last:
            row["son_egitim_adi"] = (
                row.get("son_egitim_adi")
                or row.get("son_katilim_egitim")
                or row.get("son_katİl?m_e?itim")
                or last.get("son_egitim_adi")
            )
            row["son_katildigi_egitim_tarihi"] = (
                row.get("son_katildigi_egitim_tarihi")
                or row.get("son_katilim_tarihi")
                or row.get("son_katİl?m_tarihi")
                or last.get("son_katildigi_egitim_tarihi")
            )
    store_scorecard = build_latest_store_scorecard(store_monthly, sources.get("risk_df", pd.DataFrame()), org_rows_safe, latest_month)
    store_scorecard = add_region_to_store_scorecard(store_scorecard, store_df, latest_month)
    store_scorecard = apply_scorecard_fallback(store_scorecard, store_monthly, latest_month)
    region_monthly = apply_region_scorecard_fallback(region_monthly, store_scorecard, latest_month)
    hgo_lookup = build_hgo_lookup(sources.get("magaza_hedef_ciro_df", pd.DataFrame()), latest_month)
    ciro_lookup = build_store_ciro_lookup(sources.get("magaza_hedef_ciro_df", pd.DataFrame()), latest_month)
    hiring_store_lookup, hiring_region_lookup = build_hiring_duration_lookups(sources.get("ise_alma_suresi_df", pd.DataFrame()), latest_month)
    weekly = build_weekly_payload(sources, latest_month, store_df)
    norm_lookup: dict[str, dict[str, Any]] = {}
    for row in weekly.get("norm_rows", []):
        raw_store = row.get("store") or row.get("magaza")
        if not raw_store:
            continue
        store_key = canonical_store(raw_store)
        for key in {store_key, rd.normalize_key(store_key), rd.normalize_key(raw_store)}:
            if key:
                norm_lookup[str(key)] = row
    regrettable_counts: dict[str, int] = {}
    regret_detail = ensure_month(sources.get("v2_regrettable_detail_df", pd.DataFrame()))
    if not regret_detail.empty and "month" in regret_detail.columns:
        available_regret_months = normalize_months(regret_detail["month"])
        regret_month = latest_month if latest_month in available_regret_months else (available_regret_months[-1] if available_regret_months else None)
        store_col = rd.find_first_col(regret_detail, ["isletme_adi", "magaza_adi", "magaza"])
        if regret_month and store_col:
            sub = regret_detail[regret_detail["month"].astype(str) == regret_month].copy()
            sub[store_col] = sub[store_col].apply(canonical_store)
            regrettable_counts = {str(store): int(len(group)) for store, group in sub.groupby(store_col, dropna=False)}
    for row in store_scorecard:
        store = canonical_store(row.get("store"))
        norm = norm_lookup.get(store) or norm_lookup.get(rd.normalize_key(store)) or {}
        norm_total = safe_number(norm.get("nihai_norm_kadro_toplami", norm.get("norm_toplam")), 0)
        fiili_total = safe_number(norm.get("nihai_fiili_kadro_toplami", norm.get("fiili_toplam")), 0)
        row["norm_toplam"] = int(round(norm_total)) if norm_total else None
        row["nihai_fiili_kadro_toplami"] = int(round(fiili_total)) if fiili_total else None
        row["norm_fiili_orani"] = float(fiili_total / norm_total) if norm_total > 0 else None
        hgo_val = hgo_lookup.get(store)
        if hgo_val is None:
            hgo_val = hgo_lookup.get(rd.normalize_key(store))
        if hgo_val is not None:
            row["avg_hgo"] = hgo_val
        ciro_val = ciro_lookup.get(store)
        if ciro_val is None:
            ciro_val = ciro_lookup.get(rd.normalize_key(store))
        if ciro_val is not None:
            row["avg_ciro"] = ciro_val
        hiring_val = hiring_store_lookup.get(store)
        if hiring_val is None:
            hiring_val = hiring_store_lookup.get(rd.normalize_key(store))
        if hiring_val is not None:
            row["position_close_days"] = hiring_val
        row["regrettable_cikis"] = int(regrettable_counts.get(store, 0))
        row["regrettable_turnover_rate"] = (
            float(regrettable_counts.get(store, 0) / safe_number(row.get("headcount"), 0))
            if safe_number(row.get("headcount"), 0) > 0
            else None
        )

    relation_metric_keys = [
        "headcount",
        "turnover",
        "avg_scorecard",
        "avg_enocta_dk",
        "avg_hgo",
        "avg_ciro",
        "position_close_days",
        "avg_risk",
        "norm_fiili_orani",
        "academy_graduation_rate",
        "development_completion_rate",
        "regrettable_turnover_rate",
    ]

    def build_store_relation_scorecard() -> list[dict[str, Any]]:
        """Metrik ilişki analizi için mağaza bazında son 12 ay ortalaması üretir."""
        profile_page = pages.get("p045_store_profile_compare", {}) if isinstance(pages, dict) else {}
        by_month = profile_page.get("by_month", {}) if isinstance(profile_page, dict) else {}
        relation_months = sorted(str(m) for m in by_month.keys() if str(m) <= str(latest_month))[-12:]
        base_by_store = {rd.normalize_key(row.get("store")): dict(row) for row in store_scorecard if row.get("store")}
        history: dict[str, list[dict[str, Any]]] = {key: [] for key in base_by_store}
        for month_key in relation_months:
            rows = (by_month.get(month_key) or {}).get("rows", []) if isinstance(by_month.get(month_key), dict) else []
            for rec in rows or []:
                store_key = rd.normalize_key(rec.get("store"))
                if store_key in history:
                    history[store_key].append(dict(rec))
        out: list[dict[str, Any]] = []
        for store_key, base in base_by_store.items():
            rows = history.get(store_key, [])
            item = dict(base)
            item["_metric_source"] = "Son 12 ay ortalamas\u0131" if rows else "G\u00fcncel skor kart\u0131"
            item["_metric_month_count"] = len(rows) if rows else 1
            for metric in relation_metric_keys:
                vals = pd.to_numeric(pd.Series([r.get(metric) for r in rows]), errors="coerce").dropna()
                if not vals.empty:
                    item[metric] = float(vals.mean())
            out.append(item)
        return rd.sanitize(out)

    store_relation_scorecard = build_store_relation_scorecard()
    region_health = [
        row for row in build_region_health(region_monthly, store_scorecard, latest_month)
        if is_actual_region_label(row.get("region"))
    ]
    for row in region_health:
        region_key = canonical_region(row.get("region"))
        hiring_val = hiring_region_lookup.get(region_key)
        if hiring_val is None:
            hiring_val = hiring_region_lookup.get(rd.normalize_key(region_key))
        if hiring_val is not None:
            row["position_close_days"] = hiring_val
    turnover_page = build_turnover_page(store_df, months, latest_month, turnover_store_lookup, turnover_store_detail_lookup)
    promotion_page = pages.get("p042_store_promotion_tracking", {}) if isinstance(pages, dict) else {}
    promotion_by_month = promotion_page.get("by_month", {}) if isinstance(promotion_page, dict) else {}
    promotion_month = latest_month if latest_month in promotion_by_month else (sorted(promotion_by_month)[-1] if promotion_by_month else latest_month)
    promotion_tracking = promotion_page.get("store_promotion_tracking_latest") or (promotion_by_month.get(promotion_month, {}) if isinstance(promotion_by_month, dict) else {})
    promotion_tracking = strip_sensitive_payload_keys(promotion_tracking)
    if isinstance(promotion_tracking, dict):
        for block_key in ["rows", "manager_turnover_rows"]:
            for row in promotion_tracking.get(block_key, []) or []:
                sicil_key = rd.normalize_sicil_key(row.get("sicil_no") or row.get("sicil"))
                employee = employee_lookup.get(str(sicil_key), {}) if sicil_key else {}
                store_key = rd.normalize_key(row.get("magaza") or row.get("store"))
                row["il"] = clean_text(row.get("il") or employee.get("il") or store_city_lookup.get(store_key))
    risk_tables = pages.get("p022_risk_tables", {}) if isinstance(pages, dict) else {}
    latest_total = next((r for r in store_total_monthly if r.get("month") == latest_month), {})
    prev_total = store_total_monthly[-2] if len(store_total_monthly) >= 2 else {}
    kpis = {
        "headcount": latest_total.get("headcount", 0),
        "headcount_delta": safe_number(latest_total.get("headcount"), 0) - safe_number(prev_total.get("headcount"), 0),
        "entries": latest_total.get("entries", 0),
        "exits": latest_total.get("exits", 0),
        "turnover": latest_total.get("turnover", 0),
        "turnover_delta": safe_number(latest_total.get("turnover"), 0) - safe_number(prev_total.get("turnover"), 0),
        "non_attending_count": len(non_attending_rows),
        "long_no_training_count": len(long_no_training_rows),
        "org_tracking_count": len(org_rows_safe),
        "store_count": len({row.get("store") for row in store_scorecard if row.get("store")}),
        "region_count": len({row.get("region") for row in region_health if is_actual_region_label(row.get("region"))}),
    }
    filter_regions = sorted(
        {r.get("region") for r in region_health if is_actual_region_label(r.get("region"))}
        | {r.get("region") for r in weekly.get("norm_rows", []) if is_actual_region_label(r.get("region"))}
    )
    filter_stores = sorted(
        {r.get("store") for r in store_scorecard if r.get("store")}
        | {r.get("store") for r in weekly.get("norm_rows", []) if r.get("store")}
    )
    payload = {
        "meta": {
            "title": "Mağaza Takip Dosyası",
            "subtitle": "Bölge müdürleri için mağaza operasyon, turnover ve gelişim takip raporu",
            "generated_at": deterministic_build_time().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "generated_week": int(deterministic_build_time().isocalendar().week),
            "source_file": xlsx_path.name,
            "min_month": min_month,
            "latest_month": latest_month,
            "months": months,
            "all_months": all_months,
        },
        "filters": {
            "regions": filter_regions,
            "stores": filter_stores,
        },
        "kpis": kpis,
        "store_total_monthly": store_total_monthly,
        "region_monthly": region_monthly,
        "store_monthly": store_monthly,
        "region_health": region_health,
        "store_scorecard": rd.sanitize(store_scorecard),
        "store_relation_scorecard": rd.sanitize(store_relation_scorecard),
        "forecast": build_forecast_rows(pages),
        "non_attending": non_attending_rows,
        "long_no_training": long_no_training_rows,
        "academy_development": academy_rows_safe,
        "org_tracking": org_rows_safe,
        "enocta_top_users": enocta_rows,
        "weekly": weekly,
        "turnover_page": turnover_page,
        "promotion_tracking": rd.sanitize(promotion_tracking),
        "risk_tables": rd.sanitize(risk_tables),
    }
    return rd.normalize_text_payload(drop_unusable_mojibake_keys(payload))
HTML_TEMPLATE = r"""<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mağaza Takip Dosyası</title>
  <style>
    :root{
      --canvas:#f3efe6;--canvas2:#ebe4d7;--paper:#fffaf0;--paper2:#fff6e6;
      --ink:#172033;--ink2:#334155;--muted:#6d7482;--line:#ded2bf;--line2:#eadfce;
      --navy:#17365d;--blue:#2778a8;--teal:#168578;--green:#168a5a;--amber:#c47f00;--rose:#ca4a54;--violet:#7656b7;
      --shadow:0 26px 70px rgba(56,40,20,.12);--radius:24px;
      font-family:"Aptos","Segoe UI","Helvetica Neue",Arial,sans-serif
    }
    *{box-sizing:border-box} html{scroll-behavior:smooth}
    body{margin:0;min-height:100vh;color:var(--ink);background:radial-gradient(circle at 10% -5%,rgba(39,120,168,.14),transparent 34%),radial-gradient(circle at 88% 3%,rgba(22,133,120,.12),transparent 30%),linear-gradient(135deg,var(--canvas),var(--canvas2));overflow-x:hidden}
    body:before{content:"";position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(rgba(23,32,51,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(23,32,51,.035) 1px,transparent 1px);background-size:36px 36px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.62),transparent 70%)}
    .wrap{width:min(1480px,calc(100vw - 36px));margin:0 auto;padding:28px 0 64px;position:relative}
    .hero{display:grid;grid-template-columns:1fr;gap:18px;align-items:stretch;margin-bottom:16px}
    .hero-main,.hero-side,.card,.filterbar{border:1px solid rgba(119,98,68,.18);background:linear-gradient(180deg,rgba(255,250,240,.96),rgba(255,246,230,.92));border-radius:28px;box-shadow:var(--shadow)}
    .hero-main{padding:28px 32px;position:relative;overflow:hidden;min-height:150px}.hero-main:after{content:"";position:absolute;right:-90px;top:-80px;width:310px;height:310px;border-radius:50%;background:radial-gradient(circle,rgba(39,120,168,.22),transparent 66%)}
    .eyebrow{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;background:#eef6f2;color:#17624f;font-size:12px;font-weight:800;border:1px solid #cfe3db;letter-spacing:.04em;text-transform:uppercase}
    h1{margin:0;font-size:clamp(40px,5.8vw,76px);line-height:.9;letter-spacing:-.07em;max-width:940px}.hero-copy{color:var(--ink2);font-size:16px;line-height:1.65;max-width:890px;margin:0}
    .hero-side{padding:22px;display:flex;flex-direction:column;gap:16px}.side-note{color:var(--muted);line-height:1.55;font-size:13px}
    .meta-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:auto}.meta-tile{border:1px solid var(--line2);background:rgba(255,255,255,.58);border-radius:18px;padding:13px}.meta-tile span{display:block;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;font-size:11px;font-weight:800}.meta-tile strong{display:block;margin-top:5px;font-size:17px;letter-spacing:-.025em}
    .filterbar{position:sticky;top:10px;z-index:20;display:grid;grid-template-columns:minmax(280px,1.35fr) minmax(180px,.7fr) minmax(220px,.9fr) auto auto;gap:10px;align-items:center;padding:13px;border-radius:22px;margin-bottom:16px;backdrop-filter:blur(10px)}
    input,select,button{width:100%;min-width:0;border:1px solid #d8cbb7;border-radius:14px;padding:11px 12px;color:var(--ink);background:#fffdf8;font:inherit;outline:none}input:focus,select:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(39,120,168,.13)}
    button{cursor:pointer;font-weight:850;background:var(--navy);color:white;border-color:transparent;white-space:nowrap}button.secondary{background:#fffdf8;color:var(--navy);border-color:#d8cbb7}button:hover{filter:brightness(.98);transform:translateY(-1px)}
    .grid{display:grid;gap:16px}.kpi-grid{grid-template-columns:repeat(6,minmax(0,1fr))}.two{grid-template-columns:minmax(0,1.08fr) minmax(0,.92fr)}.three{grid-template-columns:repeat(3,minmax(0,1fr))}.stack{grid-template-columns:1fr}.section{margin-top:16px}
    .card{padding:18px;border-radius:24px;min-width:0;overflow:hidden}.card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}.title-block h2,.title-block h3{margin:0;letter-spacing:-.03em}.title-block h2{font-size:21px}.muted{color:var(--muted)}.small{font-size:12px}
    .kpi-card{position:relative;min-height:136px;padding:17px;background:linear-gradient(180deg,rgba(255,253,248,.98),rgba(255,246,230,.9))}.kpi-label{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:850}.kpi-value{margin-top:11px;font-size:30px;line-height:1;font-weight:950;letter-spacing:-.055em;overflow-wrap:anywhere}.kpi-delta{margin-top:9px;color:var(--ink2);font-size:12px;font-weight:750;overflow-wrap:anywhere}.spark{position:absolute;left:14px;right:14px;bottom:11px;height:26px}
    .chart{min-height:360px}.mini-grid{display:grid;grid-template-columns:1fr;gap:12px}.mini-chart{border:1px solid var(--line2);border-radius:20px;background:#fffdf8;padding:14px;min-height:174px}.mini-top{display:flex;justify-content:space-between;gap:8px;align-items:baseline;margin-bottom:4px}.mini-top strong{font-size:13px}.mini-top span{color:var(--muted);font-size:12px;font-weight:800}
    .rank-list{display:grid;gap:10px}.rank-row{display:grid;grid-template-columns:38px 1fr auto;gap:12px;align-items:center;border:1px solid var(--line2);background:#fffdf8;border-radius:18px;padding:12px}.rank-num{width:31px;height:31px;border-radius:12px;display:grid;place-items:center;background:#e8f1ee;color:#17624f;font-weight:950}.bar-track{height:9px;border-radius:999px;background:#ece2d4;overflow:hidden;margin-top:8px}.bar-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--green),var(--amber),var(--rose))}
    .heat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:10px}.heat-tile{min-height:118px;border-radius:20px;padding:13px;border:1px solid rgba(119,98,68,.16);display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}.heat-tile:after{content:"";position:absolute;inset:auto -28px -34px auto;width:95px;height:95px;border-radius:50%;background:rgba(255,255,255,.32)}.heat-tile strong{position:relative;z-index:1;font-size:13px;line-height:1.25}.heat-tile .metric{position:relative;z-index:1;font-size:24px;font-weight:950;letter-spacing:-.05em}.heat-tile .sub{position:relative;z-index:1;color:rgba(23,32,51,.72);font-size:11px;font-weight:800}
    .badge{display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:5px 9px;border-radius:999px;background:#edf2f7;color:#334155;font-size:12px;font-weight:850;white-space:nowrap}.badge.good{background:#ddf4e8;color:#116342}.badge.warn,.badge.neutral{background:#fff0c7;color:#7c4a00}.badge.bad{background:#ffe1e4;color:#8a2430}
    .terfi-uygunluk-table-host .table-wrap th,.terfi-uygunluk-table-host .table-wrap td{padding:6px 7px;font-size:11px;line-height:1.25}.terfi-uygunluk-table-host .table-wrap th{font-size:10px}.table-note{margin:0 0 10px;color:var(--muted);font-size:12px}.table-tools{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:0 0 10px}.table-tools .hint{color:var(--muted);font-size:12px;font-weight:750}.table-tools select{width:auto;min-width:220px;padding:9px 11px;border-radius:12px;background:#fffdf8}.table-wrap{width:100%;overflow:auto;border:1px solid var(--line2);border-radius:18px;background:#fffdf8;max-height:620px;position:relative;overscroll-behavior:contain;scrollbar-color:#cbbba4 #fff6e6;scrollbar-width:thin}.table-wrap:focus-within{box-shadow:0 0 0 3px rgba(39,120,168,.10)}.table-wrap table{width:max-content;min-width:100%;border-collapse:separate;border-spacing:0}th,td{padding:10px 11px;border-bottom:1px solid #eee3d4;vertical-align:middle;text-align:left;font-size:13px;white-space:nowrap}th{position:sticky;top:0;z-index:3;background:#f4eadc;color:#344054;font-size:11px;text-transform:none;letter-spacing:.035em;font-weight:950}td{max-width:320px;overflow:hidden;text-overflow:ellipsis}td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}tbody tr:nth-child(even) td{background:rgba(244,234,220,.34)}tbody tr:hover td{background:#edf6f2}tbody tr.row-selected td{background:#dff0e8!important;color:#0f2f23;font-weight:850;box-shadow:inset 0 1px 0 rgba(22,133,120,.12),inset 0 -1px 0 rgba(22,133,120,.12)}tbody tr.row-selected .sticky-code,tbody tr.row-selected .sticky-store{background:#dff0e8!important}.norm-table-wrap{max-height:74vh}.norm-table{font-size:12px}.norm-table th,.norm-table td{padding:8px 8px;font-size:12px;vertical-align:middle}.norm-table td.num,.norm-table th.num{text-align:center!important;vertical-align:middle!important}.norm-table thead{position:sticky;top:0;z-index:20}.norm-table thead th{top:auto!important}.norm-table th.norm-group{text-align:center;vertical-align:middle!important;min-width:98px;background:#e9ddca;color:#17365d;border-left:1px solid #dbcbb7;border-right:1px solid #dbcbb7}.norm-table .norm-sub{font-size:10px;letter-spacing:.045em}.norm-filter-control{margin-top:6px;display:flex;justify-content:center}.norm-filter-button{width:100%;min-width:82px;max-width:160px;padding:5px 8px;border-radius:9px;border:1px solid #d8cbb7;background:#fffdf8;color:#172033;font-size:10px;font-weight:850;display:flex;align-items:center;justify-content:space-between;gap:6px;cursor:pointer}.norm-filter-button.active{background:#e7f7ef;border-color:#8dc9b3;color:#116342}.norm-filter-button:after{content:"v";font-size:8px;color:#667085}.norm-filter-menu{position:fixed;z-index:9999;display:none;width:min(330px,calc(100vw - 24px));max-height:min(430px,calc(100vh - 40px));overflow:hidden;border:1px solid #cdbda7;border-radius:16px;background:#fffdf8;box-shadow:0 22px 56px rgba(23,32,51,.22);padding:10px;text-align:left;color:#172033}.norm-filter-menu.open{display:block}.norm-filter-menu-title{font-size:11px;font-weight:950;color:#17365d;margin:0 0 8px;white-space:normal}.norm-filter-search{width:100%;box-sizing:border-box;border:1px solid #d8cbb7;border-radius:11px;padding:8px 9px;font-size:12px;background:#fff;color:#172033;margin-bottom:8px}.norm-filter-actions{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 8px}.norm-filter-actions button,.norm-filter-footer button{width:auto;padding:6px 8px;border-radius:9px;font-size:11px}.norm-filter-list{max-height:238px;overflow:auto;border:1px solid #eadfce;border-radius:12px;background:#fff;padding:5px;scrollbar-color:#cbbba4 #fff6e6;scrollbar-width:thin}.norm-filter-option{display:flex;align-items:center;gap:7px;padding:6px 7px;border-radius:8px;font-size:12px;font-weight:750;cursor:pointer;white-space:normal}.norm-filter-option:hover{background:#edf6f2}.norm-filter-option input{width:14px;height:14px;accent-color:#168578;flex:0 0 auto}.norm-filter-empty{display:none;padding:12px;color:#667085;font-size:12px;font-weight:750;text-align:center}.norm-filter-footer{display:flex;justify-content:flex-end;gap:8px;margin-top:9px}.norm-filter-count{margin-right:auto;color:#667085;font-size:11px;font-weight:850;align-self:center}.norm-head-label{display:block;white-space:normal;line-height:1.18}.norm-extra-badge{display:inline-flex;margin-left:5px;padding:2px 5px;border-radius:999px;background:#e7f7ef;color:#116342;font-size:9px;font-weight:900;vertical-align:middle}.norm-table .total-col{background:#fff3dc}.norm-table td.total-col{font-weight:900;color:#172033}.norm-table tfoot td{position:sticky;bottom:0;z-index:5;background:#eaf4ef!important;color:#10243d;font-weight:950;border-top:2px solid #9fb7aa}.norm-table tfoot td.total-col{background:#dff0e8!important}.norm-table .sticky-code,.norm-table .sticky-store{position:sticky;z-index:4;background:#fffdf8;box-shadow:1px 0 0 #eadfce}.norm-table th.sticky-code,.norm-table th.sticky-store{z-index:14;background:#f0e2cf}.norm-table tfoot .sticky-code,.norm-table tfoot .sticky-store{z-index:9;background:#eaf4ef!important}.norm-table .sticky-code{left:0;min-width:92px;max-width:92px}.norm-table .sticky-store{left:92px;min-width:230px;max-width:230px}.norm-table tbody tr:nth-child(even) .sticky-code,.norm-table tbody tr:nth-child(even) .sticky-store{background:#f9f1e6}.norm-table tbody tr:hover .sticky-code,.norm-table tbody tr:hover .sticky-store{background:#edf6f2}.table-wrap::-webkit-scrollbar{height:11px;width:11px}.table-wrap::-webkit-scrollbar-track{background:#fff6e6;border-radius:999px}.table-wrap::-webkit-scrollbar-thumb{background:#cbbba4;border-radius:999px;border:2px solid #fff6e6}
    .card-head .title-block .muted.small,.card>.title-block .muted.small{display:none!important}#weeklyReport .table-wrap th,#weeklyReport .table-wrap td{padding:5px 6px;font-size:10.5px}#weeklyReport .table-wrap{max-height:600px}#weeklyReport td{max-width:240px}.weekly-summary-card{background:linear-gradient(135deg,#f6efe3,#eaf3ef);padding:12px;border-radius:22px;overflow:hidden;border:1px solid #d6c8b5}.weekly-summary-card .card-head{display:none}.weekly-summary-board{display:grid;grid-template-columns:minmax(330px,1.12fr) minmax(330px,.92fr) minmax(300px,.9fr);gap:10px;background:transparent;align-items:start;overflow:auto}.weekly-summary-block{display:grid;gap:18px}.weekly-summary-table{width:100%;border-collapse:collapse;background:#fffdf8;color:#07152d;box-shadow:0 10px 26px rgba(56,40,20,.06)}.weekly-summary-table th,.weekly-summary-table td{border:2px solid #a8a29e;padding:12px 14px;font-size:23px;font-weight:950;white-space:normal;text-align:center;line-height:1.13}.weekly-summary-table th{background:#fffdf8;color:#07152d}.weekly-summary-table td.value{font-size:27px;letter-spacing:-.045em}.weekly-summary-table .sub{display:block;font-size:13px;font-weight:850;color:#667085;letter-spacing:0;line-height:1.2;margin:6px 0 0;vertical-align:baseline}.weekly-summary-table.compact th,.weekly-summary-table.compact td{padding:8px 12px;font-size:20px}.weekly-summary-table.flow th,.weekly-summary-table.flow td{padding:8px 12px;font-size:20px}.weekly-summary-table .negative{color:#b42318}.weekly-summary-table .positive{color:#047857}.weekly-summary-table .neutral{color:#07152d}.weekly-summary-table .emphasis-row th,.weekly-summary-table .emphasis-row td{background:#edf6f2}.weekly-yoy-panel{margin-top:12px;display:grid;grid-template-columns:minmax(320px,.9fr) minmax(360px,1.1fr);gap:12px;align-items:stretch}.weekly-yoy-table{width:100%;border-collapse:collapse;background:#fffdf8;color:#07152d;box-shadow:0 10px 26px rgba(56,40,20,.06)}.weekly-yoy-table th,.weekly-yoy-table td{border:2px solid #a8a29e;padding:9px 12px;text-align:center;font-weight:950;white-space:normal}.weekly-yoy-table th{font-size:17px}.weekly-yoy-table td{font-size:22px}.weekly-yoy-chart{border:2px solid #a8a29e;background:#fffdf8;padding:14px;display:grid;gap:12px}.weekly-yoy-title{font-size:17px;font-weight:950;text-align:center;color:#07152d}.weekly-yoy-row{display:grid;grid-template-columns:150px 1fr 64px;gap:10px;align-items:center;font-size:13px;font-weight:900;color:#344054}.weekly-yoy-track{height:18px;border-radius:999px;background:#eadfce;overflow:hidden}.weekly-yoy-fill{height:100%;border-radius:999px;background:#2778a8}.weekly-yoy-fill.current{background:#168a5a}.expand-cell{display:flex;align-items:center;gap:8px}.expand-btn{width:26px;min-width:26px;height:26px;padding:0;border-radius:9px;display:inline-grid;place-items:center;background:#fffdf8;color:var(--navy);border:1px solid #d8cbb7;font-weight:950}.child-row td{background:#fff9ed!important;color:#475467}.child-row .indent{padding-left:34px}.control-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.control-row button{width:auto;padding:9px 11px;font-size:12px}.pill-strip,.suggestion-strip{display:flex;gap:8px;flex-wrap:wrap;align-content:flex-start}.pill,.suggestion-chip{padding:9px 11px;border:1px solid var(--line2);background:#fffdf8;border-radius:999px;color:var(--ink2);font-size:12px;font-weight:850}.suggestion-chip{cursor:pointer}.suggestion-chip:hover{background:#edf6f2;border-color:#b8d8cd}.compare-tools{display:grid;grid-template-columns:repeat(2,minmax(180px,1fr));gap:8px;margin:8px 0 10px}.compare-tools select{width:100%;padding:9px 11px;border-radius:12px;background:#fffdf8}.empty{padding:30px;text-align:center;color:var(--muted);border:1px dashed #d8cbb7;border-radius:18px;background:#fffdf8}.footer{margin-top:22px;color:var(--muted);font-size:12px;line-height:1.6}svg text{font-family:inherit}.hidden{display:none!important}.report-tabs{display:flex;gap:10px;margin-top:20px;position:relative;z-index:2;flex-wrap:wrap}.report-tab{width:auto;border:1px solid #d8cbb7;background:#fffdf8;color:var(--navy);border-radius:999px;padding:11px 16px;font-weight:900}.report-tab.active{background:var(--navy);color:white;border-color:var(--navy)}#turnoverReport .table-wrap{max-height:640px}#turnoverReport .table-wrap th,#turnoverReport .table-wrap td{padding:7px 8px;font-size:11.5px}.turnover-grid{display:grid;grid-template-columns:1fr;gap:18px}.turnover-card-wide{grid-column:1/-1}.turnover-store-tools{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px}.turnover-store-tools select{width:auto;min-width:280px;padding:9px 11px;border-radius:12px;background:#fffdf8}#turnoverEarlyTable th:nth-child(3),#turnoverEarlyTable td:nth-child(3),#turnoverEarlyTable th:nth-child(4),#turnoverEarlyTable td:nth-child(4){background:#fff1d6!important;color:#7c4a00!important}#turnoverEarlyTable th:nth-child(5),#turnoverEarlyTable td:nth-child(5),#turnoverEarlyTable th:nth-child(6),#turnoverEarlyTable td:nth-child(6){background:#e8f3ff!important;color:#17365d!important}#turnoverEarlyTable th:nth-child(7),#turnoverEarlyTable td:nth-child(7),#turnoverEarlyTable th:nth-child(8),#turnoverEarlyTable td:nth-child(8){background:#e7f7ef!important;color:#116342!important}#turnoverEarlyTable td:nth-child(n+3):nth-child(-n+8){font-weight:900}#turnoverCityMatrix .table-wrap{overflow-x:hidden;max-height:none}#turnoverCityMatrix .table-wrap table{width:100%;min-width:0;table-layout:fixed}#turnoverCityMatrix th,#turnoverCityMatrix td{font-size:10px;padding:6px 4px;white-space:normal;text-align:center}#turnoverCityMatrix th:first-child,#turnoverCityMatrix td:first-child{text-align:left;width:120px}.analytics-split{display:grid;grid-template-columns:1fr 1fr;gap:16px}.analytics-split .card{margin-top:0}.section .subcard-title{margin:0 0 10px;font-size:17px;letter-spacing:-.025em}.brand-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.brand-card{position:relative;border:1px solid var(--line2);background:linear-gradient(180deg,#fffdf8,#fff4e4);border-radius:22px;padding:16px;overflow:hidden;min-height:174px}.brand-card:after{content:"";position:absolute;right:-35px;top:-35px;width:110px;height:110px;border-radius:50%;background:rgba(39,120,168,.12)}.brand-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.brand-name{font-size:20px;font-weight:950;letter-spacing:-.04em}.brand-value{font-size:32px;font-weight:950;letter-spacing:-.06em;margin-top:10px}.brand-sub{color:var(--muted);font-size:12px;font-weight:800}.brand-mini{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}.brand-mini span{border:1px solid var(--line2);border-radius:13px;padding:8px;background:rgba(255,255,255,.55);font-size:11px;font-weight:850}.viz-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.radar-pair{grid-template-columns:1fr 1fr}.viz-card{min-height:360px}.radar-wide{min-height:430px}.profile-head{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:start}.profile-head select{min-width:320px}.profile-summary{display:grid;grid-template-columns:1fr;gap:16px}.profile-radar-layout{display:grid;grid-template-columns:minmax(360px,.92fr) minmax(0,1.08fr);gap:14px;align-items:start}.profile-hero{border:1px solid var(--line2);border-radius:24px;background:linear-gradient(135deg,#fffdf8,#eef6f2);padding:20px}.profile-title{font-size:28px;font-weight:950;letter-spacing:-.055em;margin:0 0 8px}.metric-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:14px}.metric-pill{border:1px solid var(--line2);border-radius:16px;background:rgba(255,255,255,.62);padding:12px}.metric-pill span{display:block;color:var(--muted);font-size:10px;font-weight:900;letter-spacing:.07em;text-transform:uppercase}.metric-pill strong{display:block;font-size:22px;margin-top:4px}.hbar-list{display:grid;gap:10px}.hbar-row{display:grid;grid-template-columns:minmax(96px,160px) 1fr auto;gap:10px;align-items:center;font-size:12px;font-weight:850}.hbar-track{height:14px;border-radius:999px;background:#efe3d2;overflow:hidden}.hbar-fill{height:100%;border-radius:999px;background:var(--blue)}.chart-note{color:var(--muted);font-size:12px;font-weight:750;margin-top:8px}.scatter-legend{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;color:var(--muted);font-size:12px;font-weight:800}.legend-dot{width:10px;height:10px;border-radius:999px;display:inline-block;margin-right:4px}.radar-help{margin:0 0 8px;position:relative}.radar-help summary{width:28px;height:28px;border-radius:999px;display:grid;place-items:center;background:#fff7e8;border:1px solid #d8cbb7;color:var(--navy);font-weight:950;cursor:pointer;list-style:none}.radar-help summary::-webkit-details-marker{display:none}.radar-help div{margin-top:8px;border:1px solid var(--line2);background:#fffdf8;border-radius:16px;padding:12px;color:var(--ink2);font-size:12px;line-height:1.55;font-weight:750}.metric-relation-host,.metric-relation-host .rank-row,.metric-relation-host .table-wrap table{font-size:12px}.metric-relation-host .rank-row{line-height:1.35}.metric-relation-host .rank-row strong{font-size:12px}.metric-relation-host .muted.small,.metric-relation-host .small{font-size:11px}.metric-relation-host .table-wrap th,.metric-relation-host .table-wrap td{font-size:11px;padding:7px 8px}.metric-relation-host .subcard-title{font-size:15px}
    .turnover-compare-tools{display:grid;grid-template-columns:1.05fr 1.45fr .72fr 1.45fr .72fr;gap:10px;margin:0 0 12px}.turnover-compare-tools select{width:100%;padding:9px 11px;border-radius:12px;background:#fffdf8}
    .table-head-label{display:block;line-height:1.15;white-space:normal}.table-column-filter{margin-top:5px;display:flex;justify-content:center}.table-filter-button{width:100%;min-width:58px;max-width:130px;padding:4px 6px;border:1px solid #d8cbb7;border-radius:8px;background:#fffdf8;color:#475467;font-size:9px;font-weight:850;display:flex;align-items:center;justify-content:space-between;gap:5px;cursor:pointer}.table-filter-button:after{content:"v";font-size:7px}.table-filter-button.active{color:#116342;background:#e7f7ef;border-color:#8dc9b3}.turnover-scope-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 16px;padding:14px 16px;border:1px solid var(--line2);border-radius:18px;background:linear-gradient(135deg,#fffdf8,#edf6f2)}.turnover-scope-toolbar label{font-size:12px;font-weight:950;color:var(--navy)}.turnover-scope-toolbar select{width:auto;min-width:220px;padding:10px 12px;border-radius:12px;background:#fff}.turnover-scope-note{color:var(--muted);font-size:12px;font-weight:750}
    .norm-title-select{width:auto;min-width:260px;padding:9px 11px;border-radius:12px;background:#fffdf8;color:var(--navy);font-size:12px;font-weight:850}.cumule-turnover-wrap{overflow:auto;border:1px solid var(--line2);border-radius:18px;background:#fffdf8}.cumule-turnover-table{width:max-content;min-width:100%;border-collapse:separate;border-spacing:0}.cumule-turnover-table th,.cumule-turnover-table td{padding:10px 12px;text-align:center;border-bottom:1px solid #eadfce;border-right:1px solid #eadfce;font-size:13px;font-weight:850}.cumule-turnover-table thead th{background:#ffc20a;color:#10243d;font-size:14px;font-weight:950}.cumule-turnover-table thead th:first-child{background:#475b78;color:#fff}.cumule-turnover-table tbody th{position:sticky;left:0;background:#475b78;color:#fff;text-align:left;z-index:2}.cumule-turnover-table tbody tr.total-row th,.cumule-turnover-table tbody tr.total-row td{background:#f7c9a7!important;color:#10243d;font-weight:950}.cumule-turnover-table td.low{background:#e7f7ef;color:#116342}.cumule-turnover-table td.mid{background:#fff1d6;color:#7c4a00}.cumule-turnover-table td.high{background:#ffe1e4;color:#8a2430}.cumule-turnover-table td.empty{color:#98a2b3;background:#fffdf8}
    @media(max-width:1200px){.hero,.two,.three,.viz-grid,.profile-summary,.profile-radar-layout,.weekly-summary-board,.weekly-yoy-panel{grid-template-columns:1fr}.kpi-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.filterbar{grid-template-columns:1fr 1fr}.brand-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.weekly-summary-block{gap:18px}}@media(max-width:1000px){.turnover-compare-tools{grid-template-columns:1fr 1fr}}@media(max-width:760px){.wrap{width:min(100vw - 18px,1480px);padding-top:10px}.kpi-grid,.mini-grid,.brand-grid,.metric-strip{grid-template-columns:1fr}.filterbar{position:static;grid-template-columns:1fr}.hero-main,.hero-side,.card{border-radius:20px;padding:16px}h1{font-size:42px}.meta-grid{grid-template-columns:1fr}.profile-head{grid-template-columns:1fr}.profile-head select{min-width:0;width:100%}.report-tab{flex:1 1 44%;padding:10px}.turnover-compare-tools{grid-template-columns:1fr}.weekly-summary-card{padding:0}.weekly-summary-table th,.weekly-summary-table td,.weekly-yoy-table th,.weekly-yoy-table td{font-size:17px;padding:9px 8px}.weekly-summary-table td.value{font-size:20px}.weekly-summary-table .sub{display:block;margin-left:0;margin-top:3px;font-size:11px}.weekly-yoy-row{grid-template-columns:100px 1fr 48px}.table-wrap:not(.norm-table-wrap){overflow:visible;max-height:none;border:0;background:transparent}.table-wrap:not(.norm-table-wrap) table,.table-wrap:not(.norm-table-wrap) thead,.table-wrap:not(.norm-table-wrap) tbody,.table-wrap:not(.norm-table-wrap) th,.table-wrap:not(.norm-table-wrap) td,.table-wrap:not(.norm-table-wrap) tr{display:block;width:100%;min-width:0}.table-wrap:not(.norm-table-wrap) thead{display:none}.table-wrap:not(.norm-table-wrap) tr{border:1px solid var(--line2);border-radius:16px;margin:0 0 10px;padding:10px;background:#fffdf8;box-shadow:0 8px 24px rgba(56,40,20,.05)}.table-wrap:not(.norm-table-wrap) td{display:flex;justify-content:space-between;gap:12px;border:0;padding:7px 0;max-width:none;white-space:normal;text-align:right}.table-wrap:not(.norm-table-wrap) td:before{content:attr(data-label);font-weight:900;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;font-size:10px;text-align:left}.table-wrap:not(.norm-table-wrap) td.num{text-align:right}}@media print{body{background:white}.filterbar,button{display:none!important}.wrap{width:100%;padding:0}.card,.hero-main,.hero-side{box-shadow:none;break-inside:avoid;background:white}.table-wrap{max-height:none}}
  </style>
</head>
<body>
  <main class="wrap">
    <section class="hero"><div class="hero-main"><h1>Mağaza Takip Dosyası</h1><div class="report-tabs"><button class="report-tab" data-report="monthly" type="button">Aylık Rapor</button><button class="report-tab active" data-report="weekly" type="button">Haftalık Rapor</button><button class="report-tab" data-report="turnover" type="button">Turnover Sayfası</button><button class="report-tab" data-report="profile" type="button">Mağaza Profili</button></div></div><aside class="hero-side"><div class="meta-grid" id="reportMeta"></div></aside></section>
    <section class="filterbar"><input id="searchInput" type="search" placeholder="Mağaza, bölge, kişi veya görev ara..."><select id="regionSelect"></select><select id="storeSelect"></select><button id="resetBtn" class="secondary" type="button">Filtreleri Temizle</button><button id="printBtn" type="button">Yazdır / PDF</button></section>
    <section class="grid kpi-grid" id="kpiGrid"></section>
    <div id="monthlyReport" class="hidden">
      <section class="section grid two"><article class="card"><div class="card-head"><div class="title-block"><h2>Aylık Mağaza Nabzı</h2></div></div><div id="monthlyChart" class="chart"></div></article><article class="card"><div class="card-head"><div class="title-block"><h2>Bölge Dikkat Skoru</h2></div></div><div id="regionHealth" class="rank-list"></div></article></section>
      <section class="section"><article class="card"><div class="card-head"><div class="title-block"><h2>Marka Karnesi</h2></div></div><div id="brandScorecard"></div></article></section>
      <section class="section"><article class="card"><div class="card-head"><div class="title-block"><h2>Metrik İlişki Analizi</h2></div><div class="control-row"><select id="metricRelationScopeSelect" aria-label="Metrik ilişki kapsamı"><option value="region">Bölge Bazı</option><option value="store">Mağaza Bazı</option></select></div></div><div id="metricRelationship" class="metric-relation-host"></div></article></section>
      <section class="section"><article class="card viz-card"><div class="card-head"><div class="title-block"><h2>Yaş & Kıdem Dağılımı</h2></div></div><div id="ageTenurePyramid"></div></article></section><section class="section"><article class="card viz-card radar-wide"><div class="card-head"><div class="title-block"><h2>Bölge / Mağaza Karşılaştırma Radarı</h2></div></div><div id="comparisonRadar"></div></article></section>
      <section class="section"><article class="card"><div class="card-head"><div class="title-block"><h2>Mağaza Turnover Geçmişi</h2></div></div><div id="forecastChart" class="chart"></div></article></section>
      <section class="section"><article class="card"><div class="card-head"><div class="title-block"><h2>Mağaza Skor Kartı</h2></div><button class="secondary" id="exportScorecard">CSV</button></div><div id="storeScorecardTable"></div></article></section>
      <section class="section"><article class="card"><div class="card-head"><div class="title-block"><h2>Mağaza / Bölge Turnover Isı Haritası</h2></div></div><div class="table-tools"><select id="heatModeSelect" aria-label="Isı haritası dönem seçimi"></select></div><div id="storeHeatmap" class="heat-grid"></div></article></section>
      <section class="section grid stack"><article class="card"><div class="card-head"><div class="title-block"><h2>Satış Akademisine Katılmayanlar</h2></div><div class="control-row"><button class="secondary" data-toggle="nonAttending">Daha Fazla Göster</button><button class="secondary" data-export="nonAttending">CSV</button></div></div><div id="nonAttendingTable"></div></article></section>
      <section class="section grid stack"><article class="card"><div class="card-head"><div class="title-block"><h2>Akademi Gelişim Yolculuğu</h2></div><div class="control-row"><button class="secondary" data-toggle="academyDevelopment">Daha Fazla Göster</button><button class="secondary" data-export="academyDevelopment">CSV</button></div></div><div id="academyDevelopmentTable"></div></article><article class="card"><div class="card-head"><div class="title-block"><h2>Terfi Uygunluk Takip</h2></div><div class="control-row"><button class="secondary" data-toggle="orgTracking">Daha Fazla Göster</button><button class="secondary" data-export="orgTracking">CSV</button></div></div><div id="orgTrackingFilters" class="table-tools"></div><div id="orgTrackingTable" class="terfi-uygunluk-table-host"></div></article></section>
      <section class="section"><article class="card"><div class="card-head"><div class="title-block"><h2>Mağaza Terfi Takip Listesi</h2></div><div class="control-row"><select id="promotionRoleSelect" aria-label="Terfi pozisyonu filtresi"></select><button class="secondary" data-export="storePromotions">CSV</button></div></div><div id="promotionTrackingBlock"></div></article></section>
      <section class="section"><article class="card"><div class="card-head"><div class="title-block"><h2>Mağaza Müdürlüğü Terfisi Sonrası Etkiler</h2></div><button class="secondary" data-export="managerPromotionTurnover">CSV</button></div><div id="managerPromotionTurnoverBlock"></div></article></section>
      <section class="section"><article class="card"><div class="card-head"><div class="title-block"><h2>Erken / Geç Terfi Etki Analizi</h2></div><button class="secondary" data-export="managerPromotionCorrelation">CSV</button></div><div id="managerPromotionCorrelationBlock"></div></article></section>
      <section class="section analytics-split"><article class="card"><div class="card-head"><div class="title-block"><h2>Risk Tabloları (Bölge)</h2></div><button class="secondary" data-export="riskRegions">CSV</button></div><div id="riskRegionTable"></div></article><article class="card"><div class="card-head"><div class="title-block"><h2>Risk Tabloları (Mağaza)</h2></div><div class="control-row"><button class="secondary" data-toggle="riskStores">Daha Fazla Göster</button><button class="secondary" data-export="riskStores">CSV</button></div></div><div id="riskStoreTable"></div></article></section>
      <section class="section"><article class="card"><div class="title-block"><h2>Bölge Bazlı Son Ay</h2></div><div id="regionTable" style="margin-top:14px"></div></article></section>
      <section class="section"><article class="card"><div class="title-block"><h2>Enocta İzleme Liderleri</h2></div><div id="enoctaTable" style="margin-top:14px"></div></article></section>
    </div>
    <div id="weeklyReport">
      <section class="section"><article class="card weekly-summary-card"><div class="card-head"><div class="title-block"><h2>Norm / Fiili Kadro Özeti</h2></div></div><div id="weeklyNormSummary"></div></article></section>
      <section class="section"><article class="card"><div class="card-head"><div class="title-block"><h2>Norm / Fiili Kadro Takibi</h2></div><div class="control-row"><select id="normTitleSelect" class="norm-title-select" aria-label="Norm fiili title görünümü"></select><button class="secondary" data-export="weeklyNorm">CSV</button></div></div><div id="weeklyNormTable"></div></article></section>
      <section class="section"><article class="card"><div class="card-head"><div class="title-block"><h2>Fiili Mağaza Çalışan Detayı</h2></div><div class="control-row"><button class="secondary" data-toggle="weeklyFiili">Daha Fazla Göster</button><button class="secondary" data-export="weeklyFiili">CSV</button></div></div><div id="weeklyFiiliFilters" class="table-tools"></div><div id="weeklyFiiliTable"></div></article></section>
      <section class="section grid stack"><article class="card"><div class="card-head"><div class="title-block"><h2>Eksik ve Fazla Pozisyonlar</h2></div><div class="control-row"><button class="secondary" data-toggle="weeklyDiffs">Daha Fazla Göster</button><button class="secondary" data-export="weeklyDiffs">CSV</button></div></div><div id="weeklyDiffTable"></div></article><article class="card"><div class="card-head"><div class="title-block"><h2>İl Bazlı Engelli Kadro İhtiyacı</h2></div><button class="secondary" data-export="disabledCity">CSV</button></div><div id="disabledCityTable"></div></article></section>
      <section class="section"><article class="card"><div class="card-head"><div class="title-block"><h2>Çıkışlar</h2></div><button class="secondary" data-export="weeklyExits">CSV</button></div><div id="exitStats" class="grid kpi-grid" style="margin-bottom:12px"></div><div id="weeklyExitTable"></div></article></section>
      <section class="section grid stack"><article class="card"><div class="card-head"><div class="title-block"><h2>Doğum Listesi</h2></div><button class="secondary" data-export="birthList">CSV</button></div><div id="birthListTable"></div></article><article class="card"><div class="card-head"><div class="title-block"><h2>Uzun Süredir Eğitim Almayanlar</h2></div><div class="control-row"><button class="secondary" data-toggle="longNoTraining">Daha Fazla Göster</button><button class="secondary" data-export="longNoTraining">CSV</button></div></div><div id="longNoTrainingTable"></div></article></section>
    </div>
    <div id="turnoverReport" class="hidden">
      <section class="turnover-scope-toolbar" aria-label="Turnover çalışma tipi filtresi"><label for="turnoverWorkTypeSelect">Çalışma Tipi</label><select id="turnoverWorkTypeSelect"><option value="all">Hepsi</option><option value="part_time">Part Time</option><option value="full_time">Full Time</option></select><span class="turnover-scope-note">Tüm turnover oranları seçilen grubun çıkış / ((dönem başı + dönem sonu) / 2) hesabıyla yeniden üretilir.</span></section>
      <section class="section"><article class="card"><div class="card-head"><div class="title-block"><h2>Turnover Geçmişi</h2></div></div><div id="turnoverTrendChart" class="chart"></div></article></section>
      <section class="section"><article class="card"><div class="card-head"><div class="title-block"><h2>Kümüle Title Turnover Tablosu</h2><p class="hint" id="turnoverCumuleMetricHint">Turnover İçindeki Pay görünümü, title çıkışını tüm çalışanların ortak ortalama paydasına böler ve title'ın toplam turnover'a katkısını gösterir. Title Turnover Oranı görünümü, title çıkışını yalnızca ilgili title'ın ortalama çalışan sayısına böler. Pasör görevleri “Pasör Satış Danışmanı” altında birleştirilir; Toplam Turnover tüm title'ları kapsar.</p></div><div class="control-row"><select id="turnoverCumuleMetricSelect" aria-label="Kümüle title turnover hesaplama görünümü"><option value="contribution">Turnover İçindeki Pay</option><option value="title_rate">Title Turnover Oranı</option></select><select id="turnoverCumuleModeSelect" aria-label="Kümüle title turnover dönem seçimi"></select><button class="secondary" data-export="turnoverCumuleTitle">CSV</button></div></div><div id="turnoverCumuleTitleTable"></div></article></section>
      <section class="section"><article class="card"><div class="card-head"><div class="title-block"><h2>Turnover Kıyaslama</h2></div></div><div class="turnover-compare-tools"><select id="turnoverCompareType"></select><select id="turnoverCompareA"></select><select id="turnoverCompareYearA"></select><select id="turnoverCompareB"></select><select id="turnoverCompareYearB"></select></div><div id="turnoverCompareChart" class="chart" style="height:330px"></div><div id="turnoverCompareTable"></div></article></section>
      <section class="section"><article class="card"><div class="card-head"><div class="title-block"><h2>Erken Dönem Turnover Özeti</h2></div><div class="control-row"><select id="turnoverEarlyTitleSelect" aria-label="Erken dönem turnover title filtresi"></select><button class="secondary" data-export="turnoverEarly">CSV</button></div></div><div id="turnoverEarlyTable"></div></article></section>
      <section class="section"><article class="card"><div class="card-head"><div class="title-block"><h2>Bölge Çıkış Listesi</h2></div><button class="secondary" data-export="turnoverRegionExits">CSV</button></div><div class="turnover-store-tools"><select id="turnoverExitMonthSelect"></select></div><div id="turnoverRegionExitsTable"></div></article></section>
      <section class="section turnover-grid"><article class="card turnover-card-wide"><div class="card-head"><div class="title-block"><h2>Bölge Turnover Tablosu</h2></div></div><div id="turnoverRegionMatrix"></div></article><article class="card turnover-card-wide"><div class="card-head"><div class="title-block"><h2>Title Bazlı Turnover Tablosu</h2></div></div><div id="turnoverTitleMatrix"></div></article><article class="card turnover-card-wide"><div class="card-head"><div class="title-block"><h2>Şehir Bazlı Turnover Tablosu</h2></div></div><div id="turnoverCityMatrix"></div></article><article class="card turnover-card-wide"><div class="card-head"><div class="title-block"><h2>Mağaza Bazlı Turnover Tablosu</h2></div></div><div id="turnoverStoreMatrix"></div></article></section>
      <section class="section"><article class="card"><div class="card-head"><div class="title-block"><h2>Mağaza Detay Tablosu</h2></div><button class="secondary" data-export="turnoverStoreDetail">CSV</button></div><div class="turnover-store-tools"><select id="turnoverStoreSelect"></select></div><div id="turnoverStoreDetailChart" class="chart" style="height:300px"></div><div id="turnoverStoreDetailTable"></div></article></section>
      <section class="section"><article class="card"><div class="card-head"><div class="title-block"><h2>Full Data Tablosu</h2></div><button class="secondary" data-export="turnoverFullData">CSV</button></div><div id="turnoverFullDataTable"></div></article></section>
    </div>
    <div id="profileReport" class="hidden">
      <section class="section"><article class="card"><div class="card-head profile-head"><div class="title-block"><h2>Mağaza Detay Profil Kartı</h2></div><select id="profileStoreSelect"></select></div><div id="profileOverview"></div></article></section>
      <section class="section profile-summary"><article class="card"><div class="card-head"><div class="title-block"><h2>Mağaza Turnover & Kadro Akışı</h2></div></div><div id="profileTrendChart" class="chart" style="height:330px"></div></article><article class="card"><div class="card-head"><div class="title-block"><h2>Profil Radar</h2></div></div><div class="compare-tools"><select id="profileCompareA"></select><select id="profileCompareB"></select></div><div id="profileSuggestions" class="suggestion-strip"></div><div class="profile-radar-layout"><div id="profileRadar"></div><div id="profileCompareTable"></div></div></article></section>
      <section class="section grid stack"><article class="card"><div class="card-head"><div class="title-block"><h2>Çalışan Bazlı Bilgiler</h2></div><div class="control-row"><button class="secondary" data-toggle="profileEmployees">Daha Fazla Göster</button><button class="secondary" data-export="profileEmployees">CSV</button></div></div><div id="profileEmployeesTable"></div></article><article class="card"><div class="card-head"><div class="title-block"><h2>Gelişim / Akademi Durumu</h2></div><div class="control-row"><button class="secondary" data-toggle="profileOrg">Daha Fazla Göster</button><button class="secondary" data-export="profileOrg">CSV</button></div></div><div id="profileOrgTable"></div></article></section>
    </div>
  </main>
  <script id="magaza-data" type="application/json">__DATA__</script>
  <script>
    const DATA=JSON.parse(document.getElementById("magaza-data").textContent),STATE={report:"weekly",metricRelationScope:"region",region:"",store:"",search:"",normTitleMode:"all",normFilters:{},normSelectedKey:"",weeklyLoc:"",weeklyUst:"",weeklyFiiliSearch:"",weeklyFiiliFilters:{},tableFilters:{},tableSelectedRows:{},orgStatus:"",orgAcademy:"",orgEligibility:"",promotionRole:"",heatMode:"latest",turnoverCumuleMetric:"contribution",turnoverWorkType:"all",turnoverStore:"",turnoverExitMonth:"",turnoverEarlyTitle:"",turnoverCompareType:"region",turnoverCompareA:"",turnoverCompareB:"",turnoverCompareYearA:"",turnoverCompareYearB:"",profileStore:"",profileCompareA:"",profileCompareB:"",openDiffStores:new Set(),expanded:new Set()},COLORS={blue:"#2778a8",teal:"#168578",green:"#168a5a",amber:"#c47f00",rose:"#ca4a54",violet:"#7656b7"},$=id=>document.getElementById(id);
    const fmt=(n,d=0)=>Number(n||0).toLocaleString("tr-TR",{maximumFractionDigits:d,minimumFractionDigits:d}),pct=(n,d=1)=>Number(n||0).toLocaleString("tr-TR",{style:"percent",maximumFractionDigits:d,minimumFractionDigits:d}),esc=v=>String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch])),norm=v=>String(v??"").toLocaleLowerCase("tr-TR").trim();
    const monthName=m=>{const[y,mm]=String(m||"").split("-"),names=["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];return mm?`${names[Number(mm)-1]||mm} ${y}`:"-"},shortMonth=m=>monthName(m).split(" ")[0],shownLimit=key=>STATE.expanded.has(key)?999999:20;
    const asciiKey=v=>norm(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[\u0131\u0130]/g,"i").replace(/[\u011f\u011e]/g,"g").replace(/[\u00fc\u00dc]/g,"u").replace(/[\u015f\u015e]/g,"s").replace(/[\u00f6\u00d6]/g,"o").replace(/[\u00e7\u00c7]/g,"c");
    const escapeRegex=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),looseContains=(text,query)=>{const n=norm(text),a=asciiKey(text),q=norm(query),qa=asciiKey(query);if(!q)return true;if(n.includes(q)||a.includes(qa))return true;if(qa.includes("?")){try{return new RegExp(qa.split("?").map(escapeRegex).join("."),"i").test(a)}catch(_){return false}}return false};
    function fillSelect(sel,items,ph){sel.innerHTML=`<option value="">${esc(ph)}</option>`+(items||[]).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("")}
    function filteredRows(rows,fields){const q=norm(STATE.search);return(rows||[]).filter(row=>{if(STATE.region&&norm(row.region||row.bolge)!==norm(STATE.region))return false;if(STATE.store&&norm(row.store||row.magaza)!==norm(STATE.store))return false;return!q||fields.some(f=>norm(row[f]).includes(q))})}
    function selectedMonthlySeries(){let source=DATA.store_total_monthly||[];if(STATE.store)source=DATA.store_monthly.filter(r=>r.store===STATE.store);else if(STATE.region)source=DATA.region_monthly.filter(r=>r.region===STATE.region);return[...source].sort((a,b)=>String(a.month).localeCompare(String(b.month)))}
    function turnoverRateFromCounts(exits,donemBasi,donemSonu,headcount){const start=Number(donemBasi||0),end=Number(donemSonu||0),denom=(start+end)>0?((start+end)/2):Number(headcount||0);return denom>0?Number(exits||0)/denom:null}
    function initMeta(){
      fillSelect($("regionSelect"),DATA.filters.regions,"T\u00fcm B\u00f6lgeler");
      fillSelect($("storeSelect"),DATA.filters.stores,"T\u00fcm Ma\u011fazalar");
      const generated=new Date(DATA.meta.generated_at),generatedLabel=Number.isNaN(generated.getTime())?"-":generated.toLocaleString("tr-TR",{dateStyle:"long",timeStyle:"short"});
      $("reportMeta").innerHTML=`<div class="meta-tile"><span>Üretim Zamanı</span><strong>${esc(generatedLabel)}</strong></div><div class="meta-tile"><span>Takvim Haftası</span><strong>${fmt(DATA.meta.generated_week)}. Hafta</strong></div>`;
    }
    function sparkPath(vals,color){const nums=vals.map(Number).filter(Number.isFinite).slice(-16);if(nums.length<2)return"";const min=Math.min(...nums),max=Math.max(...nums),span=max-min||1,pts=nums.map((v,i)=>[i*(160/(nums.length-1)),28-((v-min)/span)*24]),d=pts.map((p,i)=>`${i?"L":"M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");return`<path d="${d}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`}
    function currentKpiContext(){
      const series=selectedMonthlySeries();
      const latest=series[series.length-1]||{};
      const prev=series[series.length-2]||{};
      const scoreRows=filteredRows(DATA.store_scorecard,["region","store"]);
      const nonRows=filteredRows(DATA.non_attending,["bolge","magaza","il","kisi_adi","isim_soyisim","unvan","program","egitim_durumu"]);
      const stores=[...new Set(scoreRows.map(r=>r.store).filter(Boolean))];
      const regions=[...new Set(scoreRows.map(r=>r.region).filter(Boolean))];
      return {series,latest,prev,nonRows,stores,regions};
    }
    function renderKpis(){if(STATE.report==="weekly")return renderWeeklyKpis();if(STATE.report==="turnover")return renderTurnoverKpis();if(STATE.report==="profile")return renderProfileKpis();
      const ctx=currentKpiContext(),latest=ctx.latest||{},prev=ctx.prev||{};
      const delta=(key)=>Number(latest[key]||0)-Number(prev[key]||0);
      const kpis=[
        {label:"\u00c7al\u0131\u015fan",value:fmt(latest.headcount||0),delta:`${delta("headcount")>=0?"+":""}${fmt(delta("headcount"))} \u00f6nceki aya g\u00f6re`,spark:"headcount",color:COLORS.blue},
        {label:"Giri\u015f",value:fmt(latest.entries||0),delta:"se\u00e7ili son d\u00f6nem",spark:"entries",color:COLORS.green},
        {label:"\u00c7\u0131k\u0131\u015f",value:fmt(latest.exits||0),delta:"se\u00e7ili son d\u00f6nem",spark:"exits",color:COLORS.rose},
        {label:"Turnover",value:pct(latest.turnover||0),delta:`${delta("turnover")>=0?"+":""}${pct(delta("turnover"))}`,spark:"turnover",color:COLORS.amber},
        {label:"Akademi Eksik",value:fmt(ctx.nonRows.length),delta:"kat\u0131lmayan kay\u0131t",spark:"headcount",color:COLORS.violet},
        {label:"Ma\u011faza",value:fmt(ctx.stores.length),delta:`${fmt(ctx.regions.length)} b\u00f6lge`,spark:"headcount",color:COLORS.teal}
      ];
      $("kpiGrid").innerHTML=kpis.map(k=>`<article class="card kpi-card"><div class="kpi-label">${esc(k.label)}</div><div class="kpi-value">${esc(k.value)}</div><div class="kpi-delta">${esc(k.delta)}</div><svg class="spark" viewBox="0 0 160 30">${sparkPath(ctx.series.map(x=>x[k.spark]),k.color)}</svg></article>`).join("");
    }
    function renderMonthlyChart(){const rows=selectedMonthlySeries();if(!rows.length)return empty($("monthlyChart"));const defs=[{key:"headcount",label:"Çalışan",color:COLORS.blue,fmt:v=>fmt(v)},{key:"entries",label:"Giriş",color:COLORS.green,fmt:v=>fmt(v)},{key:"exits",label:"Çıkış",color:COLORS.rose,fmt:v=>fmt(v)},{key:"turnover",label:"Turnover",color:COLORS.amber,fmt:v=>pct(v)}];$("monthlyChart").innerHTML=`<div class="mini-grid">${defs.map(d=>miniChart(rows,d)).join("")}</div>`}
    function miniChart(rows,def){const w=430,h=130,p={l:34,r:12,t:16,b:30},vals=rows.map(r=>Number(r[def.key]||0)),max=Math.max(.001,...vals)*1.08,x=i=>p.l+i*((w-p.l-p.r)/Math.max(1,rows.length-1)),y=v=>h-p.b-(Number(v||0)/max)*(h-p.t-p.b),d=rows.map((r,i)=>`${i?"L":"M"}${x(i).toFixed(1)} ${y(r[def.key]).toFixed(1)}`).join(" "),grid=[0,.5,1].map(t=>`<line x1="${p.l}" x2="${w-p.r}" y1="${y(max*t)}" y2="${y(max*t)}" stroke="#eadfce"/>`).join(""),labels=rows.map((r,i)=>(i===0||i===rows.length-1||i%6===0)?`<text x="${x(i)}" y="${h-8}" text-anchor="middle" fill="#6d7482" font-size="10">${shortMonth(r.month)}</text>`:"").join(""),last=rows[rows.length-1];return`<div class="mini-chart"><div class="mini-top"><strong>${esc(def.label)}</strong><span>${def.fmt(last?.[def.key]||0)}</span></div><svg viewBox="0 0 ${w} ${h}" width="100%" height="130">${grid}<path d="${d}" fill="none" stroke="${def.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${rows.map((r,i)=>`<circle cx="${x(i)}" cy="${y(r[def.key])}" r="3.2" fill="${def.color}"><title>${monthName(r.month)} · ${def.label}: ${def.fmt(r[def.key])}</title></circle>`).join("")}${labels}</svg></div>`}
    function renderRegionHealth(){const rows=filteredRows(DATA.region_health,["region"]).slice(0,10);if(!rows.length)return empty($("regionHealth"));const max=Math.max(1,...rows.map(r=>Number(r.attention_score||0)));$("regionHealth").innerHTML=rows.map((r,i)=>`<div class="rank-row"><div class="rank-num">${i+1}</div><div><strong>${esc(r.region)}</strong><div class="muted small">Çalışan ${fmt(r.headcount)} · Turnover ${pct(r.turnover)} · Risk ${r.avg_risk==null?"-":fmt(r.avg_risk,1)}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100,Number(r.attention_score||0)/max*100)}%"></div></div></div><span class="badge ${Number(r.attention_score||0)>45?"bad":Number(r.attention_score||0)>30?"warn":"good"}">${fmt(r.attention_score,1)}</span></div>`).join("")}
    function renderForecast(){
      const actualRows=selectedMonthlySeries().filter(r=>r.month&&Number.isFinite(Number(r.turnover))).slice(-18);
      if(!actualRows.length)return empty($("forecastChart"),"Mağaza turnover geçmişi bulunamadı.");
      historyChart($("forecastChart"),actualRows);
    }
    function historyChart(el,actualRows){
      const rows=[...(actualRows||[])].sort((a,b)=>String(a.month).localeCompare(String(b.month)));
      if(!rows.length)return empty(el,"Turnover geçmişi bulunamadı.");
      const w=900,h=350,p={l:54,r:24,t:24,b:54};
      const values=rows.map(r=>Number(r.turnover||0)).filter(Number.isFinite);
      const max=Math.max(.01,...values)*1.18;
      const min=Math.max(0,Math.min(...values)*.72);
      const span=max-min||.01;
      const x=i=>p.l+i*((w-p.l-p.r)/Math.max(1,rows.length-1));
      const y=v=>h-p.b-((Number(v)-min)/span)*(h-p.t-p.b);
      const pts=rows.map((r,i)=>({x:x(i),y:y(r.turnover),m:r.month,v:r.turnover}));
      const path=pts.map((pt,i)=>`${i?"L":"M"}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(" ");
      const grid=Array.from({length:5},(_,i)=>{const gy=p.t+i*((h-p.t-p.b)/4),val=max-i*(span/4);return`<line x1="${p.l}" y1="${gy}" x2="${w-p.r}" y2="${gy}" stroke="#eadfce"/><text x="10" y="${gy+4}" fill="#6d7482" font-size="11">${pct(val)}</text>`}).join("");
      const labels=rows.map((r,i)=>(i===0||i===rows.length-1||i%2===0)?`<text x="${x(i)}" y="${h-16}" text-anchor="middle" fill="#6d7482" font-size="11">${shortMonth(r.month)}</text>`:"").join("");
      const dots=pts.map(pt=>`<circle cx="${pt.x}" cy="${pt.y}" r="4.5" fill="#2456d6"><title>${monthName(pt.m)} · Turnover ${pct(pt.v)}</title></circle>`).join("");
      el.innerHTML=`<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%">${grid}<path d="${path}" fill="none" stroke="#2456d6" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>${dots}${labels}<g transform="translate(${p.l},${h-5})"><rect width="10" height="3" fill="#2456d6"/><text x="16" y="4" fill="#334155" font-size="11">Gerçekleşen turnover</text></g></svg>`;
    }
    function brandFromStore(store){
      const s=String(store||"");
      const parts=s.split(".");
      const token=(parts[5]||"").trim().toUpperCase();
      if(token.startsWith("I"))return "Aurelia";
      if(token.startsWith("T"))return "Cyrene";
      if(token.startsWith("M"))return "Borealis";
      if(token.startsWith("O"))return "Outlet";
      return token?token[0]:"Diğer";
    }
    function filteredScoreRows(){return filteredRows(DATA.store_scorecard||[],["region","store"])}
    function renderBrandScorecard(){
      const host=$("brandScorecard"),rows=filteredScoreRows();
      if(!rows.length)return empty(host);
      const allowedStores=new Set(rows.map(r=>r.store).filter(Boolean));
      const map=new Map(),latest=DATA.meta.latest_month;
      rows.forEach(r=>{const b=brandFromStore(r.store);const x=map.get(b)||{brand:b,stores:0,headcount:0,entries:0,exits:0,donem_basi:0,donem_sonu:0,riskSum:0,riskN:0,turnoverSeries:[]};x.stores+=1;if(Number.isFinite(Number(r.avg_risk))){x.riskSum+=Number(r.avg_risk);x.riskN+=1}map.set(b,x)});
      (DATA.store_monthly||[]).filter(r=>r.month===latest&&allowedStores.has(r.store)).forEach(r=>{const b=brandFromStore(r.store);const x=map.get(b)||{brand:b,stores:0,headcount:0,entries:0,exits:0,donem_basi:0,donem_sonu:0,riskSum:0,riskN:0,turnoverSeries:[]};x.headcount+=Number(r.headcount||0);x.entries+=Number(r.entries||0);x.exits+=Number(r.exits||0);x.donem_basi+=Number(r.donem_basi||0);x.donem_sonu+=Number(r.donem_sonu||0);map.set(b,x)});
      const brandSeries=brand=>{
        const grouped=new Map();
        (DATA.store_monthly||[]).forEach(r=>{if(!allowedStores.has(r.store)||brandFromStore(r.store)!==brand)return;const item=grouped.get(r.month)||{headcount:0,exits:0,donem_basi:0,donem_sonu:0};item.headcount+=Number(r.headcount||0);item.exits+=Number(r.exits||0);item.donem_basi+=Number(r.donem_basi||0);item.donem_sonu+=Number(r.donem_sonu||0);grouped.set(r.month,item)});
        return [...grouped.entries()].sort((a,b)=>String(a[0]).localeCompare(String(b[0]))).map(([_,v])=>turnoverRateFromCounts(v.exits,v.donem_basi,v.donem_sonu,v.headcount)||0);
      };
      const brands=[...map.values()].map(x=>({...x,turnover:turnoverRateFromCounts(x.exits,x.donem_basi,x.donem_sonu,x.headcount)||0,avgRisk:x.riskN?x.riskSum/x.riskN:null,series:brandSeries(x.brand)})).sort((a,b)=>b.headcount-a.headcount);
      const colorMap={"Aurelia":COLORS.green,"Cyrene":COLORS.violet,"Borealis":COLORS.amber,"Outlet":COLORS.blue};
      host.innerHTML=`<div class="brand-grid">${brands.map(b=>`<article class="brand-card"><div class="brand-top"><div><div class="brand-name">${esc(b.brand)}</div><div class="brand-sub">${fmt(b.stores)} mağaza</div></div><span class="badge ${b.turnover>.07?"bad":b.turnover>.04?"warn":"good"}">${pct(b.turnover,1)}</span></div><div class="brand-value">${fmt(b.headcount)}</div><div class="brand-sub">çalışan · giriş ${fmt(b.entries)} · çıkış ${fmt(b.exits)}</div><div class="brand-mini"><span>Risk<br><b>${b.avgRisk==null?"-":fmt(b.avgRisk,1)}</b></span><span>Turnover<br><b>${pct(b.turnover,1)}</b></span><span>Hacim<br><b>${fmt(b.headcount)}</b></span></div></article>`).join("")}</div>`;
    }
    function relationMetricDefs(){
      return [
        {key:"hgo",label:"HGO",fmt:v=>pct(relationPercent(v),1),val:r=>relationPercent(r.avg_hgo),good:"higher",desc:"Mağazanın hedef gerçekleştirme oranıdır; 100% ve üzeri daha iyi kabul edilir."},
        {key:"ciro",label:"Ciro",fmt:v=>fmt(v,0),val:r=>Number(r.avg_ciro),good:"higher",desc:"Mağaza veya bölgenin son 12 ay ciro/hacim göstergesidir."},
        {key:"kapatma",label:"Pozisyon Kapatma",fmt:v=>`${fmt(v,1)} gün`,val:r=>Number(r.position_close_days),good:"lower",desc:"Açık pozisyonun kapanması için geçen ortalama gün sayısıdır; düşük değer daha iyidir."},
        {key:"turnover",label:"Turnover",fmt:v=>pct(v,1),val:r=>Number(r.turnover),good:"lower",desc:"Çıkış / ((dönem başı + dönem sonu) / 2) formülüyle hesaplanan ayrılma oranıdır."},
        {key:"karne",label:"Karne",fmt:v=>Number(v)<=1.2?pct(v,1):fmt(v,1),val:r=>relationScore(r.avg_scorecard),good:"higher",desc:"Mağaza karne/performans skorudur; yüksek değer daha iyi performansı ifade eder."},
        {key:"enocta",label:"Enocta \u0130zleme",fmt:v=>`${fmt(v,0)} dk`,val:r=>Number(r.avg_enocta_dk),good:"higher",desc:"Ortalama Enocta izleme dakikas\u0131n\u0131n son 12 ay ortalamas\u0131d\u0131r; tek kay\u0131t varsa o de\u011fer kullan\u0131l\u0131r."},
        {key:"risk",label:"Risk",fmt:v=>fmt(v,1),val:r=>Number(r.avg_risk),good:"lower",desc:"Mağaza veya bölge çalışan risk skoru ortalamasıdır; düşük değer daha iyidir."},
        {key:"norm",label:"Norm/Fiili Yakınlık",fmt:v=>pct(v,1),val:r=>relationNormScore(r.norm_fiili_orani),good:"higher",desc:"Norm ve fiili kadronun birbirine yakınlığıdır; 100% seviyesine yakın olmak daha sağlıklıdır."},
        {key:"akademi",label:"Akademi Mezun",fmt:v=>pct(v,1),val:r=>Number(r.academy_graduation_rate),good:"higher",desc:"Satış Akademisi mezuniyet oranıdır."},
        {key:"gelisim",label:"Gelişim Yolculuğu",fmt:v=>pct(v,1),val:r=>Number(r.development_completion_rate),good:"higher",desc:"Gelişim Yolculuğu tamamlama oranıdır."},
        {key:"regrettable",label:"Regrettable",fmt:v=>pct(v,1),val:r=>Number(r.regrettable_turnover_rate),good:"lower",desc:"Performansı veya kritik katkısı yüksek çalışanlardaki istenmeyen ayrılma oranıdır."}
      ];
    }

    function relationWeightedMean(rows,key){let total=0,weight=0;(rows||[]).forEach(r=>{const v=Number(r&&r[key]);if(!Number.isFinite(v))return;const w=Math.max(1,Number(r.headcount||0));total+=v*w;weight+=w});return weight?total/weight:null}
    function relationSum(rows,key){return (rows||[]).reduce((s,r)=>s+(Number.isFinite(Number(r&&r[key]))?Number(r[key]):0),0)}
    const RELATION_AVERAGE_KEYS=["headcount","turnover","avg_scorecard","avg_enocta_dk","avg_hgo","avg_ciro","position_close_days","avg_risk","norm_fiili_orani","academy_graduation_rate","development_completion_rate","regrettable_turnover_rate"];
    function relationMean(rows,key){const vals=(rows||[]).map(r=>Number(r&&r[key])).filter(Number.isFinite);return vals.length?vals.reduce((s,v)=>s+v,0)/vals.length:null}
    function relationRecentMonths(){const months=[...new Set((DATA.store_monthly||[]).map(r=>String(r.month||"")).filter(Boolean))].sort(),latest=DATA.meta?.latest_month||months[months.length-1]||"";return months.filter(m=>!latest||String(m)<=String(latest)).slice(-12)}
    function relationAverageStoreRows(){
      const relationSource=(DATA.store_relation_scorecard&&DATA.store_relation_scorecard.length)?DATA.store_relation_scorecard:null;
      if(relationSource)return filteredRows(relationSource,["region","store"]).filter(r=>r&&r.store).map(r=>({entity:r.store,...r}));
      const baseRows=filteredScoreRows().filter(r=>r&&r.store);
      const baseMap=new Map();
      baseRows.forEach(r=>{const key=norm(r.store);if(key&&!baseMap.has(key))baseMap.set(key,{entity:r.store,...r})});
      const allowed=new Set(baseMap.keys()),months=new Set(relationRecentMonths()),history=new Map();
      (DATA.store_monthly||[]).forEach(r=>{const key=norm(r.store);if(!key||!allowed.has(key)||!months.has(String(r.month||"")))return;const list=history.get(key)||[];list.push(r);history.set(key,list)});
      return [...baseMap.entries()].map(([key,base])=>{
        const list=history.get(key)||[];
        const row={...base,_metric_source:list.length?"Son 12 ay ortalamas\u0131":"G\u00fcncel skor kart\u0131",_metric_month_count:list.length||1};
        RELATION_AVERAGE_KEYS.forEach(metric=>{const avg=relationMean(list,metric);if(avg!=null)row[metric]=avg});
        return row;
      });
    }
    function relationRegionRows(rows){
      const map=new Map();
      (rows||[]).forEach(r=>{const region=String(r.region||"").trim();if(!region)return;const list=map.get(region)||[];list.push(r);map.set(region,list)});
      return [...map.entries()].map(([region,list])=>({
        entity:region,region,store:region,
        headcount:relationSum(list,"headcount"),
        turnover:relationWeightedMean(list,"turnover"),
        avg_scorecard:relationWeightedMean(list,"avg_scorecard"),
        avg_hgo:relationWeightedMean(list,"avg_hgo"),
        avg_ciro:relationSum(list,"avg_ciro"),
        position_close_days:relationWeightedMean(list,"position_close_days"),
        avg_enocta_dk:relationWeightedMean(list,"avg_enocta_dk"),
        avg_risk:relationWeightedMean(list,"avg_risk"),
        norm_fiili_orani:relationWeightedMean(list,"norm_fiili_orani"),
        academy_graduation_rate:relationWeightedMean(list,"academy_graduation_rate"),
        development_completion_rate:relationWeightedMean(list,"development_completion_rate"),
        regrettable_turnover_rate:relationWeightedMean(list,"regrettable_turnover_rate")
      })).filter(r=>Number(r.headcount||0)>0);
    }
    function relationRows(scope){
      const base=relationAverageStoreRows();
      return scope==="region"?relationRegionRows(base):base;
    }

    function relationPercent(v){const n=Number(v);if(!Number.isFinite(n))return NaN;return n>1.2?n/100:n}
    function relationScore(v){const n=Number(v);if(!Number.isFinite(n))return NaN;return n<=1.2?n*100:n}
    function relationNormScore(v){const n=Number(v);if(!Number.isFinite(n)||n<=0)return NaN;return Math.min(n,1/n)}
    function pearsonFor(rows,a,b){
      const pairs=(rows||[]).map(r=>[a.val(r),b.val(r)]).filter(([x,y])=>Number.isFinite(x)&&Number.isFinite(y));
      const n=pairs.length;
      if(n<5)return {r:null,n,pairs};
      const mx=pairs.reduce((s,p)=>s+p[0],0)/n,my=pairs.reduce((s,p)=>s+p[1],0)/n;
      let num=0,dx=0,dy=0;
      pairs.forEach(([x,y])=>{const ax=x-mx,ay=y-my;num+=ax*ay;dx+=ax*ax;dy+=ay*ay});
      const den=Math.sqrt(dx*dy);
      if(!den)return {r:null,n,pairs};
      return {r:num/den,n,pairs};
    }
    function corrBg(v){
      if(!Number.isFinite(v))return "#fff8ed";
      const a=Math.min(1,Math.abs(v));
      return v>=0?`rgba(22,138,90,${.12+a*.56})`:`rgba(202,74,84,${.12+a*.56})`;
    }
    function corrText(v){
      if(!Number.isFinite(v))return "#667085";
      return Math.abs(v)>.55?"#fff":"#172033";
    }
    function relationStrength(r){const a=Math.abs(Number(r));if(!Number.isFinite(a))return"Yetersiz veri";if(a>=.7)return"G\u00fc\u00e7l\u00fc ili\u015fki";if(a>=.45)return"Orta ili\u015fki";if(a>=.25)return"Zay\u0131f ili\u015fki";return"Belirgin ili\u015fki yok"}
    function relationDirection(r){if(!Number.isFinite(Number(r)))return"Yetersiz veri";return Number(r)>=0?"ayn\u0131 y\u00f6nde":"ters y\u00f6nde"}
    function relationComment(a,b,r){
      const sign=r>=0?"ayn\u0131 y\u00f6nde":"ters y\u00f6nde";
      const strength=Math.abs(r)>=.7?"g\u00fc\u00e7l\u00fc":Math.abs(r)>=.45?"orta":"zay\u0131f";
      const base=`${a.label} ile ${b.label} aras\u0131nda ${strength} ${sign} hareket g\u00f6r\u00fcl\u00fcyor.`;
      const k=[a.key,b.key].sort().join("|");
      if(k==="hgo|turnover"&&r<0)return "HGO y\u00fckseldik\u00e7e turnover daha d\u00fc\u015f\u00fck seyretme e\u011filiminde.";
      if(k==="ciro|turnover"&&r<0)return "Ciro y\u00fcksek ma\u011faza/b\u00f6lgelerde turnover daha d\u00fc\u015f\u00fck seyretme e\u011filiminde.";
      if(k==="kapatma|turnover"&&r>0)return "Pozisyon kapatma s\u00fcresi uzad\u0131k\u00e7a turnover artma e\u011filimi g\u00f6steriyor.";
      if(k==="akademi|turnover"&&r<0)return "Akademi mezuniyeti y\u00fcksek olanlarda turnover daha d\u00fc\u015f\u00fck seyretme e\u011filiminde.";
      if(k==="gelisim|turnover"&&r<0)return "Geli\u015fim Yolculu\u011fu tamamlanmas\u0131 y\u00fcksek olanlarda turnover daha d\u00fc\u015f\u00fck seyretme e\u011filiminde.";
      if(k==="risk|turnover"&&r>0)return "Risk skoru y\u00fckseldik\u00e7e turnover da y\u00fckselme e\u011filimi g\u00f6steriyor.";
      return base;
    }
    function relationMetricStats(rows,def){const vals=(rows||[]).map(r=>def.val(r)).filter(v=>Number.isFinite(v));if(!vals.length)return{n:0,avg:null,min:null,max:null};return{n:vals.length,avg:vals.reduce((s,v)=>s+v,0)/vals.length,min:Math.min(...vals),max:Math.max(...vals)}}
    function relationMetricValue(def,v){const n=Number(v);if(!Number.isFinite(n))return"-";if(def.fmt)return def.fmt(n);return fmt(n,1)}
    function relationPairPanel(rows,defs){
      if(!STATE.metricRelationA||!defs.some(d=>d.key===STATE.metricRelationA))STATE.metricRelationA="turnover";
      if(!STATE.metricRelationB||!defs.some(d=>d.key===STATE.metricRelationB))STATE.metricRelationB="hgo";
      if(STATE.metricRelationA===STATE.metricRelationB)STATE.metricRelationB=(defs.find(d=>d.key!==STATE.metricRelationA)||defs[0]).key;
      const a=defs.find(d=>d.key===STATE.metricRelationA)||defs[0],b=defs.find(d=>d.key===STATE.metricRelationB)||defs.find(d=>d.key!==a.key)||defs[0],corr=pearsonFor(rows,a,b),sa=relationMetricStats(rows,a),sb=relationMetricStats(rows,b),score=corr.r==null?"-":corr.r.toFixed(2),comment=corr.r==null?`${a.label} ile ${b.label} aras\u0131nda yorum yapmaya yetecek ortak veri yok.`:relationComment(a,b,corr.r);
      return `<div class="rank-list" style="margin:12px 0"><div class="rank-row" style="grid-template-columns:minmax(220px,.8fr) minmax(220px,.8fr) minmax(300px,1.2fr)"><label><strong>1. metrik</strong><select id="metricRelationA" style="margin-top:6px">${defs.map(d=>`<option value="${esc(d.key)}" ${d.key===a.key?"selected":""}>${esc(d.label)}</option>`).join("")}</select><div class="muted small">${esc(a.desc)}</div><div class="muted small"><b>Ort:</b> ${relationMetricValue(a,sa.avg)} \u00b7 <b>Min:</b> ${relationMetricValue(a,sa.min)} \u00b7 <b>Maks:</b> ${relationMetricValue(a,sa.max)}</div></label><label><strong>2. metrik</strong><select id="metricRelationB" style="margin-top:6px">${defs.map(d=>`<option value="${esc(d.key)}" ${d.key===b.key?"selected":""}>${esc(d.label)}</option>`).join("")}</select><div class="muted small">${esc(b.desc)}</div><div class="muted small"><b>Ort:</b> ${relationMetricValue(b,sb.avg)} \u00b7 <b>Min:</b> ${relationMetricValue(b,sb.min)} \u00b7 <b>Maks:</b> ${relationMetricValue(b,sb.max)}</div></label><div><div class="rank-num" style="width:auto;padding:0 12px">r=${score}</div><strong>${relationStrength(corr.r)} \u00b7 ${relationDirection(corr.r)}</strong><div class="muted small" style="line-height:1.45;margin-top:6px">${esc(comment)} Pearson katsay\u0131s\u0131 -1 ile +1 aras\u0131nda okunur. Ortak \u00f6rneklem: ${fmt(corr.n||0)}.</div></div></div></div>`;
    }
    function renderMetricRelationships(){
      const host=$("metricRelationship"),sel=$("metricRelationScopeSelect");
      if(!host)return;
      host.classList.add("metric-relation-host");
      if(sel){
        sel.value=STATE.metricRelationScope||"region";
        if(!sel.dataset.bound){
          sel.addEventListener("change",e=>{STATE.metricRelationScope=e.target.value||"region";renderMetricRelationships()});
          sel.dataset.bound="1";
        }
      }
      const scope=STATE.metricRelationScope||"region",rows=relationRows(scope),defs=relationMetricDefs();
      if(rows.length<5)return empty(host,"\u0130li\u015fki analizi i\u00e7in en az 5 kay\u0131t gerekir.");
      const matrix=defs.map(a=>defs.map(b=>a.key===b.key?{r:1,n:rows.length}:pearsonFor(rows,a,b)));
      const insights=[];
      defs.forEach((a,i)=>defs.forEach((b,j)=>{if(j<=i)return;const cell=matrix[i][j];if(cell.r==null||cell.n<5||Math.abs(cell.r)<.35)return;insights.push({a,b,r:cell.r,n:cell.n,comment:relationComment(a,b,cell.r)})}));
      insights.sort((x,y)=>Math.abs(y.r)-Math.abs(x.r));
      const header=`<tr><th>Metrik</th>${defs.map(d=>`<th>${esc(d.label)}</th>`).join("")}</tr>`;
      const body=defs.map((d,i)=>`<tr><th>${esc(d.label)}</th>${defs.map((_,j)=>{const c=matrix[i][j],txt=c.r==null?"-":c.r.toFixed(2);return`<td class="num" style="background:${corrBg(c.r)};color:${corrText(c.r)}"><b>${txt}</b><br><span style="font-size:10px;opacity:.8">n=${c.n||0}</span></td>`}).join("")}</tr>`).join("");
      const cards=insights.slice(0,8).map(x=>`<div class="rank-row"><div class="rank-num">${Math.abs(x.r).toFixed(2)}</div><div><strong>${esc(x.a.label)} \u2194 ${esc(x.b.label)} \u00b7 r=${x.r.toFixed(2)}</strong><div class="muted small"><b>${relationStrength(x.r)} \u00b7 ${relationDirection(x.r)}</b> \u00b7 ${esc(x.comment)} \u00b7 Ortak \u00f6rneklem: ${fmt(x.n)}. ${esc(x.a.label)}: ${esc(x.a.desc)} ${esc(x.b.label)}: ${esc(x.b.desc)}</div></div><span class="badge ${Math.abs(x.r)>.7?"bad":Math.abs(x.r)>.5?"warn":"good"}">n=${x.n}</span></div>`).join("");
      host.innerHTML=`<div class="muted small" style="margin-bottom:10px">Pearson korelasyonu birlikte hareketi g\u00f6sterir, tek ba\u015f\u0131na neden-sonu\u00e7 kan\u0131t\u0131 de\u011fildir. Metrikler ay se\u00e7iminden ba\u011f\u0131ms\u0131zd\u0131r; mevcut son 12 ay ortalamas\u0131yla hesaplan\u0131r. Kapsam: ${scope==="region"?"b\u00f6lge":"ma\u011faza"} \u00b7 kay\u0131t: ${fmt(rows.length)}.</div><h3 class="subcard-title">En G\u00fc\u00e7l\u00fc \u0130li\u015fkiler</h3><div class="rank-list">${cards||'<div class="empty">Belirgin ili\u015fki bulunamad\u0131.</div>'}</div><h3 class="subcard-title" style="margin-top:16px">Seçili İki Metrik Özeti</h3>${relationPairPanel(rows,defs)}<div class="table-wrap"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>`;
      const aSel=$("metricRelationA"),bSel=$("metricRelationB");
      if(aSel)aSel.addEventListener("change",e=>{STATE.metricRelationA=e.target.value;renderMetricRelationships()});
      if(bSel)bSel.addEventListener("change",e=>{STATE.metricRelationB=e.target.value;renderMetricRelationships()});
    }
    function horizontalBars(host,data,opts={}){
      if(!host)return;
      const rows=(data||[]).filter(r=>Number(r.value||0)>0);
      if(!rows.length)return empty(host,opts.empty||"Dağılım verisi bulunamadı.");
      const max=Math.max(1,...rows.map(r=>Number(r.value||0))),total=rows.reduce((s,r)=>s+Number(r.value||0),0)||1;
      const palette=[COLORS.blue,COLORS.teal,COLORS.amber,COLORS.rose,COLORS.violet,COLORS.green];
      host.innerHTML=`<div class="hbar-list">${rows.map((r,i)=>{let pctText="";if(opts.showPct!==false){pctText=" · "+pct(Number(r.value||0)/total,1)}return`<div class="hbar-row"><span>${esc(r.label)}</span><div class="hbar-track"><div class="hbar-fill" style="width:${Math.max(4,Number(r.value||0)/max*100)}%;background:${r.color||palette[i%palette.length]}"></div></div><b>${fmt(r.value)}${pctText}</b></div>`}).join("")}</div>`;
    }
    function latestTurnoverRows(){
      const latest=DATA.meta.latest_month;
      return turnoverRows().filter(r=>r.month===latest);
    }
    function ageFromBirth(v){
      const d=parseIsoDate(v); if(!d)return null;
      const now=new Date(`${DATA.meta.latest_month||"2026-01"}-01T00:00:00`);
      return Math.max(0,(now-d)/(365.25*86400000));
    }
    function bucketCounts(rows,keyFn,buckets){
      const out=buckets.map(b=>({label:b.label,value:0,color:b.color}));
      rows.forEach(r=>{const v=keyFn(r);const idx=buckets.findIndex(b=>v!=null&&v>=b.min&&v<b.max);if(idx>=0)out[idx].value+=1});
      return out;
    }
    function renderAgeTenurePyramid(){
      const host=$("ageTenurePyramid"),rows=latestTurnoverRows();
      if(!rows.length)return empty(host);
      const ages=bucketCounts(rows,r=>ageFromBirth(r.dogum_tarihi),[{label:"18-24",min:0,max:25,color:COLORS.green},{label:"25-34",min:25,max:35,color:COLORS.blue},{label:"35-44",min:35,max:45,color:COLORS.teal},{label:"45+",min:45,max:999,color:COLORS.amber}]);
      const tenure=bucketCounts(rows,r=>Number(r.kidem_yili),[{label:"0-1 yıl",min:0,max:1,color:COLORS.rose},{label:"1-3 yıl",min:1,max:3,color:COLORS.amber},{label:"3-5 yıl",min:3,max:5,color:COLORS.teal},{label:"5-10 yıl",min:5,max:10,color:COLORS.blue},{label:"10+ yıl",min:10,max:999,color:COLORS.green}]);
      host.innerHTML=`<div class="viz-grid"><div><h3 class="subcard-title">Yaş Dağılımı</h3><div id="ageBars"></div></div><div><h3 class="subcard-title">Kıdem Dağılımı</h3><div id="tenureBars"></div></div></div><p class="chart-note">Dağılım seçili bölge/mağaza filtresi ve son dönem mağaza çalışan kayıtları üzerinden hesaplanır.</p>`;
      horizontalBars($("ageBars"),ages);
      horizontalBars($("tenureBars"),tenure);
    }
    function percentLikeScore(v){const n=Number(v);if(!Number.isFinite(n))return 0;const ratio=n>1.2?n/100:n;return Math.max(0,Math.min(1,ratio))}
    function inversePercentScore(v){return Math.max(0,1-percentLikeScore(v))}
    function radarQualityScore(row){
      const turnover=inversePercentScore(row.turnover);
      const risk=Math.max(0,1-Math.min(1,Number(row.risk||0)/100));
      const academy=Math.max(0,Math.min(1,Number(row.academy||0)));
      const development=Math.max(0,Math.min(1,Number(row.development||0)));
      const hgo=percentLikeScore(row.hgo);
      return turnover*.28+risk*.24+academy*.16+development*.14+hgo*.18;
    }
    function selectBestWorstRadarRows(rows){
      const valid=(rows||[]).filter(r=>r.label&&Number.isFinite(radarQualityScore(r)));
      if(valid.length<=6)return valid;
      const sorted=[...valid].sort((a,b)=>radarQualityScore(b)-radarQualityScore(a));
      return [...sorted.slice(0,3),...sorted.slice(-3).reverse()];
    }
    function radarMetricRows(type){
      if(type==="region"){
        const hgoByRegion=new Map();
        filteredScoreRows().forEach(r=>{const key=r.region||"";const arr=hgoByRegion.get(key)||[];if(Number.isFinite(Number(r.avg_hgo)))arr.push(Number(r.avg_hgo));hgoByRegion.set(key,arr)});
        const rows=filteredRows(DATA.region_health||[],["region"]).map(r=>{const arr=hgoByRegion.get(r.region)||[];return {label:r.region,turnover:Number(r.turnover||0),risk:Number(r.avg_risk||0),academy:.5,development:.5,hgo:arr.length?arr.reduce((s,x)=>s+x,0)/arr.length:0}});
        return selectBestWorstRadarRows(rows);
      }
      const rows=filteredScoreRows().map(r=>({label:r.store,turnover:Number(r.turnover||0),risk:Number(r.avg_risk||0),academy:Number(r.academy_graduation_rate||0),development:Number(r.development_completion_rate||0),hgo:Number(r.avg_hgo||0)}));
      return selectBestWorstRadarRows(rows);
    }
    function renderRadarSvg(host,rows,title){
      if(!host)return;
      if(!rows.length)return empty(host);
      const w=520,h=360,cx=260,cy=175,r=110,dims=[["Turnover",x=>inversePercentScore(x.turnover)],["Risk",x=>Math.max(0,1-Math.min(1,x.risk/100))],["Akademi",x=>Math.min(1,x.academy||0)],["Gelişim",x=>Math.min(1,x.development||0)],["HGO",x=>percentLikeScore(x.hgo)]];
      const ang=dims.map((_,i)=>Math.PI*2*i/dims.length-Math.PI/2),colors=[COLORS.blue,COLORS.teal,COLORS.amber,COLORS.rose,COLORS.violet];
      const ring=[.25,.5,.75,1].map(t=>`<polygon points="${ang.map(a=>`${cx+Math.cos(a)*r*t},${cy+Math.sin(a)*r*t}`).join(" ")}" fill="none" stroke="#eadfce"/>`).join("");
      const axes=ang.map((a,i)=>`<line x1="${cx}" y1="${cy}" x2="${cx+Math.cos(a)*r}" y2="${cy+Math.sin(a)*r}" stroke="#eadfce"/><text x="${cx+Math.cos(a)*(r+30)}" y="${cy+Math.sin(a)*(r+28)}" text-anchor="middle" fill="#334155" font-size="11" font-weight="850">${dims[i][0]}</text>`).join("");
      const polys=rows.map((row,i)=>{const pts=dims.map((d,j)=>{const val=Math.max(0,Math.min(1,d[1](row)));return `${cx+Math.cos(ang[j])*r*val},${cy+Math.sin(ang[j])*r*val}`}).join(" ");return`<polygon points="${pts}" fill="${colors[i%colors.length]}" fill-opacity=".13" stroke="${colors[i%colors.length]}" stroke-width="2.4"><title>${esc(row.label)}</title></polygon>`}).join("");
      const legend=rows.map((row,i)=>`<span><span class="legend-dot" style="background:${colors[i%colors.length]}"></span>${esc(row.label)}</span>`).join("");
      host.innerHTML=`<svg viewBox="0 0 ${w} ${h}" width="100%" height="310">${ring}${axes}${polys}</svg><div class="scatter-legend">${legend}</div><p class="chart-note">${esc(title)}</p>`;
    }
    function renderComparisonRadar(){
      const host=$("comparisonRadar");
      if(!host)return;
      host.innerHTML=`<div class="viz-grid radar-pair"><div id="regionRadar"></div><div id="storeRadar"></div></div><p class="chart-note">Radar sadece se\u00e7ili filtrelerdeki en iyi 3 ve dikkat gerektiren 3 kayd\u0131 g\u00f6sterir; b\u00f6ylece grafik okunabilir kal\u0131r.</p>`;
      renderRadarSvg($("regionRadar"),radarMetricRows("region"),"B\u00f6lge radar\u0131: en iyi ve en zay\u0131f u\u00e7lar.");
      renderRadarSvg($("storeRadar"),radarMetricRows("store"),"Ma\u011faza radar\u0131: en iyi ve en zay\u0131f u\u00e7lar.");
    }
    function renderWeeklyKpis(){
      const w=DATA.weekly||{};
      const normRows=filteredRows(w.norm_rows||[],["region","store","bolge_muduru","sehir"]);
      const diffRows=filteredRows(w.position_diffs||[],["region","store","pozisyon","durum"]);
      const birthRows=filteredRows(w.birth_list||[],["region","store","ad_soyad","pozisyon"]);
      const exitRows=filteredRows((w.exits||{}).rows||[],["region","store","ad_soyad","pozisyon","ayrilma_sebebi"]);
      const fiiliRows=filteredRows(w.fiili_rows||[],["region","store","AD_SOYAD","POZISYON_ADI"]);
      const cards=[
        {label:"Norm Mağaza",value:fmt(normRows.length),delta:"norm kaynağındaki mağaza",color:COLORS.blue},
        {label:"Eksik Pozisyon",value:fmt(diffRows.filter(r=>r.durum==="Eksik").length),delta:"pozisyon kırılımı",color:COLORS.rose},
        {label:"Fazla Pozisyon",value:fmt(diffRows.filter(r=>r.durum==="Fazla").length),delta:"pozisyon kırılımı",color:COLORS.amber},
        {label:"Çıkış",value:fmt(exitRows.length),delta:"seçili + önceki ay",color:COLORS.violet},
        {label:"Doğum Listesi",value:fmt(birthRows.length),delta:".gs. kapsamı",color:COLORS.green},
        {label:"Fiili Çalışan",value:fmt(fiiliRows.length),delta:"mağaza grubu",color:COLORS.teal}
      ];
      $("kpiGrid").innerHTML=cards.map(k=>`<article class="card kpi-card"><div class="kpi-label">${esc(k.label)}</div><div class="kpi-value">${esc(k.value)}</div><div class="kpi-delta">${esc(k.delta)}</div><svg class="spark" viewBox="0 0 160 30"><path d="M0 22 C35 5 65 28 95 12 S140 6 160 18" fill="none" stroke="${k.color}" stroke-width="2.8" stroke-linecap="round"/></svg></article>`).join("");
    }
    function profileStoreOptions(){
      const rows=STATE.region?(DATA.store_scorecard||[]).filter(r=>r.region===STATE.region):(DATA.store_scorecard||[]);
      return [...new Set(rows.map(r=>r.store).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"tr-TR"));
    }
    function activeProfileStore(){
      const opts=profileStoreOptions();
      if(STATE.profileStore&&opts.includes(STATE.profileStore))return STATE.profileStore;
      if(STATE.store&&opts.includes(STATE.store))return STATE.store;
      return opts[0]||"";
    }
    function renderProfileKpis(){
      const ctx=currentKpiContext(),latest=ctx.latest||{},prev=ctx.prev||{};
      const delta=(key)=>Number(latest[key]||0)-Number(prev[key]||0);
      const scopeLabel=STATE.store?STATE.store:(STATE.region?`${STATE.region} \u00b7 t\u00fcm ma\u011fazalar`:"T\u00fcm Ma\u011fazalar");
      const cards=[
        {label:"Kapsam",value:STATE.store?"Se\u00e7ili Ma\u011faza":fmt(ctx.stores.length),delta:STATE.store?STATE.store:`T\u00fcm ma\u011fazalar \u00b7 ${fmt(ctx.regions.length)} b\u00f6lge`,color:COLORS.blue},
        {label:"Çalışan",value:fmt(latest.headcount||0),delta:`${delta("headcount")>=0?"+":""}${fmt(delta("headcount"))} önceki aya göre`,color:COLORS.teal},
        {label:"Giriş",value:fmt(latest.entries||0),delta:"seçili son dönem",color:COLORS.green},
        {label:"Çıkış",value:fmt(latest.exits||0),delta:"seçili son dönem",color:COLORS.rose},
        {label:"Turnover",value:pct(latest.turnover||0,1),delta:`${delta("turnover")>=0?"+":""}${pct(delta("turnover"),1)}`,color:COLORS.amber},
        {label:"Akademi Eksik",value:fmt(ctx.nonRows.length),delta:scopeLabel,color:COLORS.violet}
      ];
      $("kpiGrid").innerHTML=cards.map(k=>`<article class="card kpi-card"><div class="kpi-label">${esc(k.label)}</div><div class="kpi-value">${esc(k.value)}</div><div class="kpi-delta">${esc(k.delta)}</div><svg class="spark" viewBox="0 0 160 30"><path d="M0 22 C35 5 65 28 95 12 S140 6 160 18" fill="none" stroke="${k.color}" stroke-width="2.8" stroke-linecap="round"/></svg></article>`).join("");
    }
    function last12StoreAverage(store,key){
      const rows=(DATA.store_monthly||[]).filter(r=>r.store===store&&Number.isFinite(Number(r[key]))).sort((a,b)=>String(a.month).localeCompare(String(b.month))).slice(-12);
      if(!rows.length)return null;
      return rows.reduce((s,r)=>s+Number(r[key]),0)/rows.length;
    }
    function storeScoreByName(store){
      const base=(DATA.store_scorecard||[]).find(r=>r.store===store)||{store};
      const avgScore=last12StoreAverage(store,"avg_scorecard");
      const hasBaseScore=base.avg_scorecard!=null&&Number.isFinite(Number(base.avg_scorecard));
      return {...base,avg_scorecard:hasBaseScore?base.avg_scorecard:avgScore??base.avg_scorecard,avg_scorecard_source:base.avg_scorecard_source||(avgScore!=null?"Son 12 ay ortalaması":"Karne yok")};
    }
    function ratioValue(v){const n=Number(v);return Number.isFinite(n)?n:null}
    function scoreValue(v){const n=Number(v);if(!Number.isFinite(n))return null;return n<=1.2?n:Math.min(1,n/100)}
    function normFiiliHealth(v){const n=Number(v);if(!Number.isFinite(n)||n<=0)return .5;return Math.min(n,1/n)}
    function profileSelectedStores(primary){return [...new Set([STATE.profileCompareA,STATE.profileCompareB].filter(Boolean).filter(s=>s!==""))].slice(0,2)}
    function recommendedStoresForProfile(store){
      const base=storeScoreByName(store);
      const candidates=(DATA.store_scorecard||[]).filter(r=>r.store&&r.store!==store).map(r=>storeScoreByName(r.store));
      const maxHead=Math.max(1,...candidates.map(r=>Number(r.headcount||0)),Number(base.headcount||0));
      const maxCiro=Math.max(1,...candidates.map(r=>Number(r.avg_ciro||0)),Number(base.avg_ciro||0));
      const score=(r)=>[
        Number(r.headcount||0)/maxHead,
        Number(r.avg_ciro||0)/maxCiro,
        percentLikeScore(r.turnover),
        normFiiliHealth(r.norm_fiili_orani),
        scoreValue(r.avg_scorecard)??0,
        percentLikeScore(r.avg_hgo),
        ratioValue(r.academy_graduation_rate)??0,
        ratioValue(r.development_completion_rate)??0,
        Math.min(1,Number(r.avg_risk||0)/100),
        Math.min(1,Number(r.regrettable_turnover_rate||0)/.08),
        brandFromStore(r.store)===brandFromStore(base.store)?1:0
      ];
      const b=score(base);
      return candidates.map(r=>{const v=score(r);const dist=Math.sqrt(v.reduce((s,x,i)=>s+Math.pow((x||0)-(b[i]||0),2),0));return {...r,_dist:dist}}).sort((a,b)=>a._dist-b._dist).slice(0,6);
    }
    function renderProfileCompareControls(store, opts){
      const a=$('profileCompareA'),b=$('profileCompareB'),suggest=$('profileSuggestions');
      const choices=(opts||[]).filter(x=>x!==store);
      if(a){fillSelect(a,choices,'Karşılaştırma mağazası 1');a.value=STATE.profileCompareA||'';if(!a.dataset.bound){a.addEventListener('change',e=>{STATE.profileCompareA=e.target.value;if(STATE.profileCompareB===STATE.profileCompareA)STATE.profileCompareB='';renderStoreProfile()});a.dataset.bound='1'}}
      if(b){fillSelect(b,choices.filter(x=>x!==STATE.profileCompareA),'Karşılaştırma mağazası 2');b.value=STATE.profileCompareB||'';if(!b.dataset.bound){b.addEventListener('change',e=>{STATE.profileCompareB=e.target.value;if(STATE.profileCompareA===STATE.profileCompareB)STATE.profileCompareA='';renderStoreProfile()});b.dataset.bound='1'}}
      if(suggest){
        if(!STATE.profileCompareA){suggest.innerHTML='';return}
        const recs=recommendedStoresForProfile(STATE.profileCompareA).filter(r=>r.store!==STATE.profileCompareB);
        suggest.innerHTML=recs.length?`<span class="muted" style="font-size:12px;font-weight:850;padding:9px 0">1. ma\u011fazaya benzer \u00f6neriler:</span>`+recs.map(r=>`<button type="button" class="suggestion-chip" data-store="${esc(r.store)}">${esc(r.store)}</button>`).join(''):'';
        suggest.querySelectorAll('[data-store]').forEach(btn=>btn.addEventListener('click',()=>{const s=btn.getAttribute('data-store');if(STATE.profileCompareA!==s)STATE.profileCompareB=s;renderStoreProfile()}));
      }
    }
    function profileRadarRows(stores){
      const rows=stores.map(storeScoreByName).filter(r=>r&&r.store);
      const maxHead=Math.max(1,...rows.map(r=>Number(r.headcount||0)));
      const maxEnocta=Math.max(1,...rows.map(r=>Number(r.avg_enocta_dk||0)));
      return rows.map(r=>{
        const academy=ratioValue(r.academy_graduation_rate)??0;
        const development=ratioValue(r.development_completion_rate)??0;
        const enocta=Math.min(1,Number(r.avg_enocta_dk||0)/maxEnocta);
        return {raw:r,label:r.store,values:[
          inversePercentScore(r.turnover),
          normFiiliHealth(r.norm_fiili_orani),
          scoreValue(r.avg_scorecard)??0,
          percentLikeScore(r.avg_hgo),
          Math.min(1,(academy+development+enocta)/3),
          Math.max(0,1-Math.min(1,Number(r.avg_risk||0)/100)),
          Math.max(0,1-Math.min(1,Number(r.regrettable_turnover_rate||0)/.08)),
        ]};
      });
    }
    function renderProfileCompareRadar(host,stores){
      if(!host)return;
      const rows=profileRadarRows(stores);
      if(!rows.length)return empty(host);
      const labels=['Turnover','Norm/Fiili','Karne','HGO','Eğitim','Risk','Regrettable'];
      const w=560,h=390,cx=280,cy=178,r=122,ang=labels.map((_,i)=>Math.PI*2*i/labels.length-Math.PI/2),colors=["#2563eb","#dc2626","#16a34a","#d97706","#7c3aed","#0891b2"];
      const ring=[.25,.5,.75,1].map(t=>`<polygon points="${ang.map(a=>`${cx+Math.cos(a)*r*t},${cy+Math.sin(a)*r*t}`).join(' ')}" fill="none" stroke="#eadfce"/>`).join('');
      const axes=ang.map((a,i)=>`<line x1="${cx}" y1="${cy}" x2="${cx+Math.cos(a)*r}" y2="${cy+Math.sin(a)*r}" stroke="#eadfce"/><text x="${cx+Math.cos(a)*(r+36)}" y="${cy+Math.sin(a)*(r+33)}" text-anchor="middle" fill="#334155" font-size="10.5" font-weight="900">${labels[i]}</text>`).join('');
      const polys=rows.map((row,i)=>{const pts=row.values.map((v,j)=>`${cx+Math.cos(ang[j])*r*Math.max(0,Math.min(1,v))},${cy+Math.sin(ang[j])*r*Math.max(0,Math.min(1,v))}`).join(' ');return`<polygon points="${pts}" fill="${colors[i%colors.length]}" fill-opacity=".12" stroke="${colors[i%colors.length]}" stroke-width="2.6"><title>${esc(row.label)}</title></polygon>`}).join('');
      const legend=rows.map((row,i)=>`<span><span class="legend-dot" style="background:${colors[i%colors.length]}"></span>${esc(row.label)}</span>`).join('');
      const help=`<details class="radar-help"><summary>?</summary><div><strong>Radar hesap mant\u0131\u011f\u0131</strong><br>Turnover: 0% = 100 puan, 100% ve \u00fcst\u00fc = 0 puan.<br>Norm/Fiili: fiili ve normdan k\u00fc\u00e7\u00fck olan b\u00fcy\u00fck olana b\u00f6l\u00fcn\u00fcr; 1'e yak\u0131nl\u0131k daha iyidir.<br>Karne: 0-100 \u00f6l\u00e7e\u011finde normal de\u011ferlendirilir.<br>HGO: 100% ve \u00fcst\u00fc 100 puan, alt\u0131 kendi oran\u0131 kadar puan al\u0131r.<br>E\u011fitim: Sat\u0131\u015f Akademisi mezun oran\u0131, Geli\u015fim Yolculu\u011fu oran\u0131 ve Enocta izleme normalize skorunun ortalamas\u0131d\u0131r.<br>Risk ve Regrettable: d\u00fc\u015f\u00fck de\u011fer daha iyi kabul edilir.<br><br><strong>Benzer ma\u011faza \u00f6nerileri</strong><br>\u00d6neriler; \u00e7al\u0131\u015fan say\u0131s\u0131, son 12 ay ciro ortalamas\u0131, turnover, norm/fiili denge, karne, HGO, akademi/geli\u015fim, risk, regrettable ve marka benzerli\u011fi birlikte de\u011ferlendirilerek olu\u015fturulur.</div></details>`;
      host.innerHTML=`${help}<svg viewBox="0 0 ${w} ${h}" width="100%" height="330">${ring}${axes}${polys}</svg><div class="scatter-legend">${legend}</div><p class="chart-note">Radar değerleri 0-100 karşılaştırma skoruna dönüştürülür; dış halka daha iyi skoru temsil eder.</p>`;
    }
    function renderStoreProfile(){
      const store=activeProfileStore(),sel=$('profileStoreSelect'),opts=profileStoreOptions();
      if(sel){fillSelect(sel,opts,'Mağaza seçin');sel.value=store;if(!sel.dataset.bound){sel.addEventListener('change',e=>{STATE.profileStore=e.target.value;STATE.profileCompareA='';STATE.profileCompareB='';renderStoreProfile()});sel.dataset.bound='1'}}
      if(!store){empty($('profileOverview'),'Profil için mağaza bulunamadı.');empty($('profileTrendChart'));empty($('profileRadar'));empty($('profileCompareTable'));empty($('profileEmployeesTable'));empty($('profileOrgTable'));return}
      renderProfileCompareControls(store,opts);
      const score=storeScoreByName(store),series=(DATA.store_monthly||[]).filter(r=>r.store===store).sort((a,b)=>String(a.month).localeCompare(String(b.month))),employees=(DATA.weekly?.fiili_rows||[]).filter(r=>r.store===store),non=(DATA.non_attending||[]).filter(r=>r.magaza===store),academy=(DATA.academy_development||[]).filter(r=>r.magaza===store),scopedEmployees=filteredRows(DATA.weekly?.fiili_rows||[],["region","store","AD_SOYAD","POZISYON_ADI","UNVAN_ADI","LOKASYON","UST_BOLUM_ADI"]),scopedOrg=filteredRows(DATA.org_tracking||[],["bolge","magaza","il","isim_soyisim","gorev","son_satis_akademisi","satis_akademisi_mezun","gelisim_yolculugu_durumu"]),scopeNote=STATE.store?STATE.store:(STATE.region?`${STATE.region} \u00b7 t\u00fcm ma\u011fazalar`:"T\u00fcm ma\u011fazalar");
      $('profileOverview').innerHTML=`<div class="profile-hero"><p class="profile-title">${esc(store)}</p><div class="muted">${esc(score.region||'-')} · ${esc(brandFromStore(store))}</div><div class="metric-strip"><div class="metric-pill"><span>Çalışan</span><strong>${fmt(score.headcount||employees.length)}</strong></div><div class="metric-pill"><span>Turnover</span><strong>${pct(score.turnover||0,1)}</strong></div><div class="metric-pill"><span>Gelişim</span><strong>${score.development_completion_rate==null?'-':pct(score.development_completion_rate,0)}</strong></div><div class="metric-pill"><span>Akademi Eksik</span><strong>${fmt(non.length)}</strong></div></div></div>`;
      historyChart($('profileTrendChart'),series.length?series:[]);
      const compareStores=profileSelectedStores(store);
      renderProfileCompareRadar($('profileRadar'),compareStores);
      const compareRows=compareStores.map(s=>storeScoreByName(s));
      renderTable($('profileCompareTable'),compareRows,[["store","Mağaza"],["region","Bölge"],["headcount","Çalışan",v=>fmt(v),"num"],["turnover","Turnover",v=>pct(v,1),"num"],["norm_fiili_orani","Norm/Fiili",v=>v==null?'-':pct(v,1),"num"],["avg_scorecard","Karne",v=>v==null?'-':(Number(v)<=1.2?pct(v,1):fmt(v,1)),"num"],["avg_scorecard_source","Karne Kaynak"],["avg_hgo","HGO (12 Ay)",v=>v==null?'-':pct(percentLikeScore(v),1),"num"],["academy_graduation_rate","Akademi",v=>v==null?'-':pct(v,1),"num"],["development_completion_rate","Gelişim",v=>v==null?'-':pct(v,1),"num"],["avg_enocta_dk","Enocta Dk",v=>v==null?'-':fmt(v,0),"num"],["avg_risk","Risk",v=>v==null?'-':fmt(v,1),"num"],["regrettable_turnover_rate","Regrettable",v=>v==null?'-':pct(v,1),"num"]],compareRows.length);
      renderTable($('profileEmployeesTable'),scopedEmployees.slice(0,shownLimit('profileEmployees')),[['P_NO','Sicil'],['AD_SOYAD','Ad Soyad'],['POZISYON_ADI','Pozisyon'],['UNVAN_ADI','Unvan'],['kadro_adı','Kadro'],['ENGEL DURUMU','Engel Durumu'],['İLK BAŞLAMA TARİHİ','İlk Başlama']],scopedEmployees.length);
      $('profileEmployeesTable')?.insertAdjacentHTML('afterbegin',`<p class="table-note">Kapsam: ${esc(scopeNote)}</p>`);
      renderTable($('profileOrgTable'),scopedOrg.slice(0,shownLimit('profileOrg')),[['sicil','Sicil'],['isim_soyisim','Ad Soyad'],['magaza','Mağaza'],['bolge','Bölge'],['il','Şehir'],['gorev','Görev'],['son_satis_akademisi','Son Satış Akademisi'],['satis_akademisi_mezun','Akademi'],['gelisim_yolculugu_durumu','Gelişim Yolculuğu'],['gelisim_yolculugu_oran','Gelişim Yolculuğu Tamamlama Oranı',v=>v==null?'-':pct(Number(v)/100),'num'],['performans_harf_notu','Harf Notu'],['terfiye_uygunluk','Terfiye Uygunluk']],scopedOrg.length);
      $('profileOrgTable')?.insertAdjacentHTML('afterbegin',`<p class="table-note">Kapsam: ${esc(scopeNote)}</p>`);
    }
    function updateGlobalFilterSelects(){
      const regionSel=$("regionSelect"),storeSel=$("storeSelect");
      if(regionSel)regionSel.value=STATE.region||"";
      if(storeSel){
        const stores=STATE.region?[...new Set(DATA.store_scorecard.filter(r=>r.region===STATE.region).map(r=>r.store).filter(Boolean))].sort():DATA.filters.stores;
        fillSelect(storeSel,stores,"Tüm Mağazalar");
        storeSel.value=STATE.store||"";
      }
    }
    function renderWeeklyNormSummary(rows,titles){
      const host=$("weeklyNormSummary");
      if(!host)return;
      if(!rows||!rows.length)return empty(host);
      const sum=key=>rows.reduce((s,r)=>s+Number(r[key]||0),0);
      const fixedTitles=(titles||[]).filter(t=>asciiKey(t.title).includes("belirli sureli"));
      const normTotal=sum("norm_toplam"),fiiliTotal=sum("fiili_toplam");
      const fixedNorm=fixedTitles.reduce((s,t)=>s+sum(`${t.key}_norm`),0);
      const fixedFiili=fixedTitles.reduce((s,t)=>s+sum(`${t.key}_fiili`),0);
      const disabled=sum("engelli_sayisi");
      const finalNorm=rows.some(r=>"nihai_norm_kadro_toplami" in r)?sum("nihai_norm_kadro_toplami"):Math.max(0,normTotal-fixedNorm);
      const finalFiili=rows.some(r=>"nihai_fiili_kadro_toplami" in r)?sum("nihai_fiili_kadro_toplami"):Math.max(0,fiiliTotal-disabled-fixedFiili);
      const normalDiff=fiiliTotal-normTotal,finalDiff=finalFiili-finalNorm;
      const totalDeductNorm=fixedNorm;
      const totalDeductFiili=disabled+fixedFiili;
      const prevYearFiili=sum("prev_year_same_period_fiili");
      const prevYearMonth=(rows.find(r=>r.prev_year_same_period_month)||{}).prev_year_same_period_month;
      const currentRefMonth=(rows.find(r=>r.current_fiili_reference_month)||{}).current_fiili_reference_month;
      const globalScope=!STATE.region&&!STATE.store&&!STATE.search;
      const currentStores=globalScope?Number(DATA.weekly?.summary?.current_gs_store_count||0):sum("current_gs_store_count");
      const prevYearStores=globalScope?Number(DATA.weekly?.summary?.prev_year_same_period_gs_store_count||0):sum("prev_year_same_period_gs_store_count");
      const yoyDiff=fiiliTotal-prevYearFiili;
      const yoyPct=prevYearFiili>0?yoyDiff/prevYearFiili:null;
      const maxYoy=Math.max(fiiliTotal,prevYearFiili,1);
      const weekly=DATA.weekly||{},entries=weekly.entries||{},exits=weekly.exits||{};
      const entryRows=filteredRows(entries.rows||[],["region","store","ad_soyad","pozisyon"]),exitRows=filteredRows(exits.rows||[],["region","store","ad_soyad","pozisyon","ayrilma_sebebi"]);
      const selectedFlowMonth=entries.selected_month||exits.selected_month,currentFlowMonth=selectedFlowMonth||currentRefMonth,previousFlowMonth=entries.previous_month||exits.previous_month;
      const countMonth=(items,month)=>items.filter(item=>item.month===month).length;
      const diffClass=v=>Number(v)<0?"negative":Number(v)>0?"positive":"";
      const note=(main,sub)=>`${esc(main)}${sub?`<span class="sub">${esc(sub)}</span>`:""}`;
      const row=(label,value,cls="")=>`<tr class="${cls}"><th>${esc(label)}</th><td class="value">${value}</td></tr>`;
      const leftRows=[
        row("Norm Kadro Toplamı",note(fmt(normTotal),`${fmt(fixedNorm)} belirli süreli norm dahil`)),
        row("Fiili Kadro Toplamı",note(fmt(fiiliTotal),`${fmt(fixedFiili)} kişi belirli süreli dahil`)),
        row("Kadro Farkı",`<span class="${diffClass(normalDiff)}">${fmt(normalDiff)}</span>`)
      ].join("");
      const deductionRows=[
        row("Düşülen Engelli Kadro",fmt(disabled)),
        row("Düşülen Belirli Süreli Norm",fmt(fixedNorm)),
        row("Düşülen Belirli Süreli Fiili",fmt(fixedFiili))
      ].join("");
      const deductionTotalRows=[
        row("Düşülen Toplam Norm",fmt(totalDeductNorm)),
        row("Düşülen Toplam Fiili",fmt(totalDeductFiili))
      ].join("");
      const flowRows=[
        row(previousFlowMonth?`${monthName(previousFlowMonth)} Giriş`:"Önceki Ay Giriş",fmt(countMonth(entryRows,previousFlowMonth))),
        row(previousFlowMonth?`${monthName(previousFlowMonth)} Çıkış`:"Önceki Ay Çıkış",fmt(countMonth(exitRows,previousFlowMonth))),
        row(currentFlowMonth?`${monthName(currentFlowMonth)} Giriş`:"Son Ay Giriş",fmt(countMonth(entryRows,currentFlowMonth))),
        row(currentFlowMonth?`${monthName(currentFlowMonth)} Çıkış`:"Son Ay Çıkış",fmt(countMonth(exitRows,currentFlowMonth)),"emphasis-row")
      ].join("");
      const finalRows=[
        row("Nihai Norm Kadro Toplamı",fmt(finalNorm)),
        row("Nihai Fiili Kadro Toplamı",fmt(finalFiili)),
        row("Nihai Kadro Farkı",`<span class="${diffClass(finalDiff)}">${fmt(finalDiff)}</span>`)
      ].join("");
      const yoyRows=[
        row(currentRefMonth?`${monthName(currentRefMonth)} Güncel Fiili`:"Güncel Fiili",fmt(fiiliTotal)),
        row(prevYearMonth?`${monthName(prevYearMonth)} Fiili`:"Geçen Yıl Aynı Dönem",prevYearFiili?fmt(prevYearFiili):"-"),
        row(currentRefMonth?`${monthName(currentRefMonth)} Mağaza`:"Güncel Mağaza",fmt(currentStores)),
        row(prevYearMonth?`${monthName(prevYearMonth)} Mağaza`:"Geçen Yıl Mağaza",prevYearStores?fmt(prevYearStores):"-"),
        row("Fark",`<span class="${diffClass(yoyDiff)}">${prevYearFiili?fmt(yoyDiff):"-"}</span>`),
        row("Değişim Oranı",yoyPct==null?"-":`<span class="${diffClass(yoyDiff)}">${pct(yoyPct,1)}</span>`)
      ].join("");
      const yoyChart=`
        <div class="weekly-yoy-chart">
          <div class="weekly-yoy-title">Geçen Yıl Aynı Dönem Fiili ve Mağaza Karşılaştırması</div>
          <div class="weekly-yoy-row"><span>${esc(prevYearMonth?monthName(prevYearMonth):"Geçen yıl")}</span><div class="weekly-yoy-track"><div class="weekly-yoy-fill" style="width:${prevYearFiili>0?Math.max(2,Math.round((prevYearFiili/maxYoy)*100)):0}%"></div></div><strong>${prevYearFiili?fmt(prevYearFiili):"-"}</strong></div>
          <div class="weekly-yoy-row"><span>${esc(currentRefMonth?monthName(currentRefMonth):"Güncel")}</span><div class="weekly-yoy-track"><div class="weekly-yoy-fill current" style="width:${Math.max(2,Math.round((fiiliTotal/maxYoy)*100))}%"></div></div><strong>${fmt(fiiliTotal)}</strong></div>
        </div>`;
      host.innerHTML=`
        <div class="weekly-summary-board">
          <table class="weekly-summary-table"><tbody>${leftRows}</tbody></table>
          <div class="weekly-summary-block">
            <table class="weekly-summary-table"><tbody>${deductionRows}</tbody></table>
            <table class="weekly-summary-table compact"><tbody>${deductionTotalRows}</tbody></table>
            <table class="weekly-summary-table flow"><tbody>${flowRows}</tbody></table>
          </div>
          <table class="weekly-summary-table"><tbody>${finalRows}</tbody></table>
        </div>
        <div class="weekly-yoy-panel">
          <table class="weekly-yoy-table"><tbody>${yoyRows}</tbody></table>
          ${yoyChart}
        </div>`;
    }
    function normTableBaseColumns(){return [
      {key:"magaza_kodu",label:"Ma\u011faza Kodu",cls:"sticky-code"},
      {key:"store",label:"Ma\u011faza",cls:"sticky-store"},
      {key:"sehir",label:"\u015eehir",cls:""},
      {key:"region",label:"B\u00f6lge Bilgisi",cls:""},
      {key:"bolge_muduru",label:"B\u00f6lge M\u00fcd\u00fcr\u00fc",cls:""}
    ]}
    function normTableTotalColumns(){return [
      {key:"norm_toplam",label:"Norm Kadro Toplam\u0131",num:true,total:true},
      {key:"fiili_toplam",label:"Fiili Kadro Toplam\u0131",num:true,total:true},
      {key:"engelli_sayisi",label:"Engelli Kadro",num:true,total:true},
      {key:"dogum_izni_calisan_sayisi",label:"Do\u011fum \u0130zni Bilgisi",num:true,total:true},
      {key:"nihai_fiili_kadro_toplami",label:"Nihai Fiili Kadro Toplam\u0131",num:true,total:true},
      {key:"nihai_kadro_farki",label:"Nihai Kadro Fark\u0131",num:true,total:true}
    ]}
    function normFilterValues(key){const raw=(STATE.normFilters||{})[key];if(Array.isArray(raw))return raw.map(v=>String(v)).filter(Boolean);if(raw==null||raw==="")return[];return[String(raw)]}
    function normCellFilterValue(row,key){const raw=row?.[key];if(raw==null||raw==="")return"";if(Number.isFinite(Number(raw))&&String(raw).trim()!=="")return String(Number(raw));return String(raw)}
    function normCellDisplay(row,key,col=null){const raw=row?.[key];if(raw==null||raw==="")return"";if(col?.num&&Number.isFinite(Number(raw)))return fmt(raw);return String(raw)}
    function normRowsWithTableFilters(rows,columns,ignoreKey=null){return(rows||[]).filter(row=>columns.every(col=>{if(col.key===ignoreKey)return true;const selected=normFilterValues(col.key).map(norm).filter(Boolean);if(!selected.length)return true;return selected.includes(norm(normCellFilterValue(row,col.key)))}))}
    function normTableFilterColumns(titles){const base=normTableBaseColumns();const titleCols=(titles||[]).flatMap(t=>[{key:`${t.key}_norm`,label:`${t.title} Norm`,num:true},{key:`${t.key}_fiili`,label:`${t.title} Fiili`,num:true}]);return base.concat(titleCols,normTableTotalColumns())}
    function normClearEmptyFilters(){Object.keys(STATE.normFilters||{}).forEach(k=>{if(!normFilterValues(k).length)delete STATE.normFilters[k]})}
    function normFilterControl(key,label,rows,columns,col){
      const selectedValues=normFilterValues(key),selectedNorms=new Set(selectedValues.map(norm)),source=normRowsWithTableFilters(rows||[],columns||[],key),options=new Map();
      source.forEach(row=>{const value=normCellFilterValue(row,key);if(value!=="")options.set(value,normCellDisplay(row,key,col))});
      const sorted=[...options.entries()].sort((a,b)=>{
        const an=Number(a[0]),bn=Number(b[0]);
        if(Number.isFinite(an)&&Number.isFinite(bn))return an-bn;
        return String(a[1]).localeCompare(String(b[1]),"tr-TR",{numeric:true,sensitivity:"base"});
      });
      const optionHtml=sorted.map(([value,text])=>`<label class="norm-filter-option"><input type="checkbox" value="${esc(value)}"${selectedNorms.has(norm(value))?" checked":""}> <span>${esc(text)}</span></label>`).join("");
      const summary=selectedValues.length?`${fmt(selectedValues.length)} se\u00e7ili`:"T\u00fcm\u00fc";
      return `<div class="norm-filter-control" data-norm-control="${esc(key)}"><button type="button" class="norm-filter-button${selectedValues.length?" active":""}" data-norm-open="${esc(key)}" title="${esc(label)} filtresi"><span>${esc(summary)}</span></button><div class="norm-filter-menu" data-norm-menu="${esc(key)}"><div class="norm-filter-menu-title">${esc(label)} filtresi</div><input class="norm-filter-search" type="search" placeholder="Ara, Enter ile görünenleri seç..." data-norm-search><div class="norm-filter-actions"><button type="button" class="secondary" data-norm-all>G\u00f6r\u00fcnenleri Se\u00e7</button><button type="button" class="secondary" data-norm-none>Temizle</button></div><div class="norm-filter-list">${optionHtml||'<div class="norm-filter-empty" style="display:block">Se\u00e7enek yok</div>'}</div><div class="norm-filter-empty" data-norm-empty>Sonu\u00e7 yok</div><div class="norm-filter-footer"><span class="norm-filter-count">${fmt(sorted.length)} se\u00e7enek</span><button type="button" class="secondary" data-norm-cancel>Vazge\u00e7</button><button type="button" data-norm-apply>Uygula</button></div></div></div>`;
    }
    function closeNormMenus(except=null){document.querySelectorAll(".norm-filter-menu.open").forEach(menu=>{if(menu!==except)menu.classList.remove("open")})}
    function positionNormMenu(menu,button){const rect=button.getBoundingClientRect();menu.style.display="block";const width=menu.offsetWidth||330;let left=Math.min(Math.max(8,rect.left),window.innerWidth-width-8),top=rect.bottom+6;menu.style.left=`${left}px`;menu.style.top=`${top}px`;menu.style.maxHeight=`${Math.max(180,window.innerHeight-top-8)}px`;menu.style.display=""}
    function bindNormFilterMenus(host){
      host.querySelectorAll("[data-norm-open]").forEach(btn=>btn.addEventListener("click",e=>{e.stopPropagation();const key=btn.getAttribute("data-norm-open"),menu=host.querySelector(`[data-norm-menu="${CSS.escape(key)}"]`);if(!menu)return;const willOpen=!menu.classList.contains("open");closeNormMenus(menu);menu.classList.toggle("open",willOpen);if(willOpen){positionNormMenu(menu,btn);const search=menu.querySelector("[data-norm-search]");if(search){search.value="";search.focus()}}}));
      host.querySelectorAll("[data-norm-search]").forEach(input=>input.addEventListener("input",e=>{const menu=e.target.closest(".norm-filter-menu"),query=e.target.value,labels=[...menu.querySelectorAll(".norm-filter-option")];let visible=0;labels.forEach(label=>{const show=looseContains(label.textContent,query);label.style.display=show?"flex":"none";if(show)visible+=1});const empty=menu.querySelector("[data-norm-empty]");if(empty)empty.style.display=visible?"none":"block"}));
      host.querySelectorAll("[data-norm-search]").forEach(input=>input.addEventListener("keydown",e=>{if(e.key!=="Enter")return;e.preventDefault();const menu=e.target.closest(".norm-filter-menu");menu.querySelectorAll(".norm-filter-option").forEach(label=>{if(label.style.display!=="none"){const cb=label.querySelector("input");if(cb)cb.checked=true}})}));
      host.querySelectorAll("[data-norm-all]").forEach(btn=>btn.addEventListener("click",e=>{e.stopPropagation();const menu=btn.closest(".norm-filter-menu");menu.querySelectorAll(".norm-filter-option").forEach(label=>{if(label.style.display!=="none"){const cb=label.querySelector("input");if(cb)cb.checked=true}})}));
      host.querySelectorAll("[data-norm-none]").forEach(btn=>btn.addEventListener("click",e=>{e.stopPropagation();btn.closest(".norm-filter-menu").querySelectorAll("input[type='checkbox']").forEach(cb=>cb.checked=false)}));
      host.querySelectorAll("[data-norm-cancel]").forEach(btn=>btn.addEventListener("click",e=>{e.stopPropagation();closeNormMenus()}));
      host.querySelectorAll("[data-norm-apply]").forEach(btn=>btn.addEventListener("click",e=>{e.stopPropagation();const menu=btn.closest(".norm-filter-menu"),key=menu.getAttribute("data-norm-menu"),values=[...menu.querySelectorAll("input[type='checkbox']:checked")].map(cb=>cb.value).filter(Boolean);if(values.length){STATE.normFilters[key]=values}else{delete STATE.normFilters[key]}closeNormMenus();renderWeekly()}));
      if(!window.__normFilterOutsideBound){window.__normFilterOutsideBound=true;document.addEventListener("click",e=>{if(!e.target.closest(".norm-filter-control")&&!e.target.closest(".norm-filter-menu"))closeNormMenus()});document.addEventListener("keydown",e=>{if(e.key==="Escape")closeNormMenus()});window.addEventListener("resize",()=>closeNormMenus())}
    }
    function normSum(rows,key){return(rows||[]).reduce((s,row)=>{const n=Number(row?.[key]);return s+(Number.isFinite(n)?n:0)},0)}
    function activeNormTitles(titles){return (STATE.normTitleMode&&STATE.normTitleMode!=="all")?(titles||[]).filter(t=>t.key===STATE.normTitleMode):(titles||[])}
    function bindNormTitleFilter(titles){
      const sel=$("normTitleSelect");if(!sel)return;
      const options=[{key:"all",title:"Tüm title'lar"}].concat(titles||[]);
      if(!options.some(o=>o.key===STATE.normTitleMode))STATE.normTitleMode="all";
      sel.innerHTML=options.map(o=>`<option value="${esc(o.key)}">${esc(o.title)}</option>`).join("");
      sel.value=STATE.normTitleMode||"all";
      if(!sel.dataset.bound){sel.addEventListener("change",e=>{STATE.normTitleMode=e.target.value||"all";STATE.normFilters={};STATE.normSelectedKey="";renderWeekly()});sel.dataset.bound="1"}
    }
    function renderNormFiiliTable(host,rows,titles,totalCount=null){
      if(!rows||!rows.length)return empty(host);
      normClearEmptyFilters();
      const shownTitles=titles||[];
      const base=normTableBaseColumns();
      const totals=normTableTotalColumns();
      const filterColumns=normTableFilterColumns(shownTitles);
      const tableRows=normRowsWithTableFilters(rows,filterColumns);
      const activeFilterCount=Object.keys(STATE.normFilters||{}).filter(k=>normFilterValues(k).length).length;
      const tools=`<div class="table-tools"><span class="hint">Ba\u015fl\u0131k h\u00fccrelerindeki se\u00e7imler Excel filtresi gibi \u00e7al\u0131\u015f\u0131r; alttaki toplam sat\u0131r\u0131 filtreye g\u00f6re dinamik g\u00fcncellenir. ${activeFilterCount?`${fmt(activeFilterCount)} aktif filtre var.`:""}</span>${activeFilterCount?`<button type="button" class="secondary" id="normClearFilters">Tablo Filtrelerini Temizle</button>`:""}</div>`;
      const rowSpan=shownTitles.length?2:1;
      const baseHead=base.map(c=>`<th rowspan="${rowSpan}" class="${c.cls||""}"><span class="norm-head-label">${esc(c.label)}</span>${normFilterControl(c.key,c.label,rows,filterColumns,c)}</th>`).join("");
      const titleHead=shownTitles.map(t=>`<th colspan="2" class="norm-group"><span class="norm-head-label">${esc(t.title)}${t.extra_fiili?'<span class="norm-extra-badge">Ek Fiili</span>':''}</span></th>`).join("");
      const totalsHead=totals.map(c=>`<th rowspan="${rowSpan}" class="num total-col"><span class="norm-head-label">${esc(c.label)}</span>${normFilterControl(c.key,c.label,rows,filterColumns,c)}</th>`).join("");
      const titleSubHead=shownTitles.map(t=>`<th class="num norm-sub">Norm Kadro${normFilterControl(`${t.key}_norm`,`${t.title} Norm Kadro`,rows,filterColumns,{key:`${t.key}_norm`,num:true})}</th><th class="num norm-sub">Fiili Kadro${normFilterControl(`${t.key}_fiili`,`${t.title} Fiili Kadro`,rows,filterColumns,{key:`${t.key}_fiili`,num:true})}</th>`).join("");
      const secondHead=shownTitles.length?`<tr>${titleSubHead}</tr>`:"";
      const baseCells=row=>base.map(c=>`<td class="${c.cls||""}">${esc(row[c.key]??"-")}</td>`).join("");
      const titleCells=row=>shownTitles.map(t=>`<td class="num">${fmt(row[`${t.key}_norm`])}</td><td class="num">${fmt(row[`${t.key}_fiili`])}</td>`).join("");
      const totalCells=row=>totals.map(c=>`<td class="num total-col">${fmt(row[c.key])}</td>`).join("");
      const body=tableRows.map(row=>{const rowKey=norm(row.store||row.magaza_kodu||"");return`<tr data-norm-row="${esc(rowKey)}" class="${STATE.normSelectedKey===rowKey?"row-selected":""}">${baseCells(row)}${titleCells(row)}${totalCells(row)}</tr>`}).join("");
      const footBase=base.map((c,idx)=>`<td class="${c.cls||""}">${idx===0?"Filtre Toplam\u0131":idx===1?`${fmt(tableRows.length)} ma\u011faza`:""}</td>`).join("");
      const footTitles=shownTitles.map(t=>`<td class="num">${fmt(normSum(tableRows,`${t.key}_norm`))}</td><td class="num">${fmt(normSum(tableRows,`${t.key}_fiili`))}</td>`).join("");
      const footTotals=totals.map(c=>`<td class="num total-col">${fmt(normSum(tableRows,c.key))}</td>`).join("");
      const footer=`<tfoot><tr>${footBase}${footTitles}${footTotals}</tr></tfoot>`;
      const note=`<p class="table-note">${fmt(tableRows.length)} / ${fmt(rows.length)} ma\u011faza g\u00f6steriliyor.</p>`;
      host.innerHTML=`${tools}${note}<div class="table-wrap norm-table-wrap" tabindex="0"><table class="norm-table"><thead><tr>${baseHead}${titleHead}${totalsHead}</tr>${secondHead}</thead><tbody>${body}</tbody>${footer}</table></div>`;
      bindNormFilterMenus(host);
      host.querySelectorAll("[data-norm-row]").forEach(tr=>tr.addEventListener("click",()=>{const key=tr.getAttribute("data-norm-row")||"";STATE.normSelectedKey=STATE.normSelectedKey===key?"":key;host.querySelectorAll("[data-norm-row]").forEach(row=>row.classList.toggle("row-selected",row.getAttribute("data-norm-row")===STATE.normSelectedKey))}));
      const clearBtn=host.querySelector("#normClearFilters");if(clearBtn)clearBtn.addEventListener("click",()=>{STATE.normFilters={};renderWeekly()});
    }
    function weeklyNormExportRows(rows,titles){const shown=normRowsWithTableFilters(rows||[],normTableFilterColumns(titles||[]));return shown.map(row=>{const out={"Ma\u011faza Kodu":row.magaza_kodu,"Ma\u011faza":row.store,"\u015eehir":row.sehir,"B\u00f6lge Bilgisi":row.region,"B\u00f6lge M\u00fcd\u00fcr\u00fc":row.bolge_muduru};(titles||[]).forEach(t=>{out[`${t.title} Norm Kadro`]=row[`${t.key}_norm`];out[`${t.title} Fiili Kadro`]=row[`${t.key}_fiili`];out[`${t.title} Fark`]=row[`${t.key}_fark`]});normTableTotalColumns().forEach(c=>{out[c.label]=row[c.key]});return out})}
    function weeklyFiiliColumns(){return [
      {key:"P_NO",label:"Sicil"},
      {key:"AD_SOYAD",label:"Ad Soyad"},
      {key:"ISLETME_AD",label:"Mağaza"},
      {key:"LOKASYON",label:"Lokasyon"},
      {key:"BOLUM_ADI",label:"Bölüm"},
      {key:"UST_BOLUM_ADI",label:"Üst Bölüm"},
      {key:"UNVAN_ADI",label:"Unvan"},
      {key:"kadro_adı",label:"Kadro"},
      {key:"ENGEL DURUMU",label:"Engel Durumu"},
      {key:"İLK BAŞLAMA TARİHİ",label:"İlk Başlama"},
      {key:"POZISYON_ADI",label:"Pozisyon"}
    ]}
    function fiiliFilterValues(key){const raw=(STATE.weeklyFiiliFilters||{})[key];if(Array.isArray(raw))return raw.map(v=>String(v)).filter(Boolean);if(raw==null||raw==="")return[];return[String(raw)]}
    function fiiliCellFilterValue(row,key){const raw=row?.[key];if(raw==null||raw==="")return"";if(Number.isFinite(Number(raw))&&String(raw).trim()!=="")return String(Number(raw));return String(raw)}
    function fiiliCellDisplay(row,key,col=null){const raw=row?.[key];if(raw==null||raw==="")return"";if(col?.num&&Number.isFinite(Number(raw)))return fmt(raw);return String(raw)}
    function weeklyFiiliBaseRows(){const w=DATA.weekly||{};return filteredRows(w.fiili_rows||[],["region","store","P_NO","AD_SOYAD","POZISYON_ADI","UNVAN_ADI","LOKASYON","UST_BOLUM_ADI","BOLUM_ADI","kadro_adı","ENGEL DURUMU"])}
    function weeklyFiiliRowsWithFilters(rows,columns,ignoreKey=null){return(rows||[]).filter(row=>columns.every(col=>{if(col.key===ignoreKey)return true;const selected=fiiliFilterValues(col.key).map(norm).filter(Boolean);if(!selected.length)return true;return selected.includes(norm(fiiliCellFilterValue(row,col.key)))}))}
    function weeklyFiiliFilteredRows(){const q=norm(STATE.weeklyFiiliSearch);const rows=weeklyFiiliBaseRows().filter(r=>!q||norm(`${r.P_NO||""} ${r.AD_SOYAD||""}`).includes(q));return weeklyFiiliRowsWithFilters(rows,weeklyFiiliColumns())}
    function fiiliClearEmptyFilters(){Object.keys(STATE.weeklyFiiliFilters||{}).forEach(k=>{if(!fiiliFilterValues(k).length)delete STATE.weeklyFiiliFilters[k]})}
    function fiiliFilterControl(key,label,rows,columns,col){
      const selectedValues=fiiliFilterValues(key),selectedNorms=new Set(selectedValues.map(norm)),source=weeklyFiiliRowsWithFilters(rows||[],columns||[],key),options=new Map();
      source.forEach(row=>{const value=fiiliCellFilterValue(row,key);if(value!=="")options.set(value,fiiliCellDisplay(row,key,col))});
      const sorted=[...options.entries()].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),"tr-TR",{numeric:true,sensitivity:"base"}));
      const optionHtml=sorted.map(([value,text])=>`<label class="norm-filter-option"><input type="checkbox" value="${esc(value)}"${selectedNorms.has(norm(value))?" checked":""}> <span>${esc(text)}</span></label>`).join("");
      const summary=selectedValues.length?`${fmt(selectedValues.length)} seçili`:"Tümü";
      return `<div class="norm-filter-control" data-fiili-control="${esc(key)}"><button type="button" class="norm-filter-button${selectedValues.length?" active":""}" data-fiili-open="${esc(key)}" title="${esc(label)} filtresi"><span>${esc(summary)}</span></button><div class="norm-filter-menu" data-fiili-menu="${esc(key)}"><div class="norm-filter-menu-title">${esc(label)} filtresi</div><input class="norm-filter-search" type="search" placeholder="Ara, Enter ile görünenleri seç..." data-fiili-search><div class="norm-filter-actions"><button type="button" class="secondary" data-fiili-all>Görünenleri Seç</button><button type="button" class="secondary" data-fiili-none>Temizle</button></div><div class="norm-filter-list">${optionHtml||'<div class="norm-filter-empty" style="display:block">Seçenek yok</div>'}</div><div class="norm-filter-empty" data-fiili-empty>Sonuç yok</div><div class="norm-filter-footer"><span class="norm-filter-count">${fmt(sorted.length)} seçenek</span><button type="button" class="secondary" data-fiili-cancel>Vazgeç</button><button type="button" data-fiili-apply>Uygula</button></div></div></div>`;
    }
    function closeFiiliMenus(except=null){document.querySelectorAll("[data-fiili-menu].open").forEach(menu=>{if(menu!==except)menu.classList.remove("open")})}
    function bindFiiliFilterMenus(host){
      host.querySelectorAll("[data-fiili-open]").forEach(btn=>btn.addEventListener("click",e=>{e.stopPropagation();const key=btn.getAttribute("data-fiili-open"),menu=host.querySelector(`[data-fiili-menu="${CSS.escape(key)}"]`);if(!menu)return;const willOpen=!menu.classList.contains("open");closeFiiliMenus(menu);menu.classList.toggle("open",willOpen);if(willOpen){positionNormMenu(menu,btn);const search=menu.querySelector("[data-fiili-search]");if(search){search.value="";search.focus()}}}));
      host.querySelectorAll("[data-fiili-search]").forEach(input=>input.addEventListener("input",e=>{const menu=e.target.closest(".norm-filter-menu"),query=e.target.value,labels=[...menu.querySelectorAll(".norm-filter-option")];let visible=0;labels.forEach(label=>{const show=looseContains(label.textContent,query);label.style.display=show?"flex":"none";if(show)visible+=1});const empty=menu.querySelector("[data-fiili-empty]");if(empty)empty.style.display=visible?"none":"block"}));
      host.querySelectorAll("[data-fiili-search]").forEach(input=>input.addEventListener("keydown",e=>{if(e.key!=="Enter")return;e.preventDefault();const menu=e.target.closest(".norm-filter-menu");menu.querySelectorAll(".norm-filter-option").forEach(label=>{if(label.style.display!=="none"){const cb=label.querySelector("input");if(cb)cb.checked=true}})}));
      host.querySelectorAll("[data-fiili-all]").forEach(btn=>btn.addEventListener("click",e=>{e.stopPropagation();const menu=btn.closest(".norm-filter-menu");menu.querySelectorAll(".norm-filter-option").forEach(label=>{if(label.style.display!=="none"){const cb=label.querySelector("input");if(cb)cb.checked=true}})}));
      host.querySelectorAll("[data-fiili-none]").forEach(btn=>btn.addEventListener("click",e=>{e.stopPropagation();btn.closest(".norm-filter-menu").querySelectorAll("input[type='checkbox']").forEach(cb=>cb.checked=false)}));
      host.querySelectorAll("[data-fiili-cancel]").forEach(btn=>btn.addEventListener("click",e=>{e.stopPropagation();closeFiiliMenus()}));
      host.querySelectorAll("[data-fiili-apply]").forEach(btn=>btn.addEventListener("click",e=>{e.stopPropagation();const menu=btn.closest(".norm-filter-menu"),key=menu.getAttribute("data-fiili-menu"),values=[...menu.querySelectorAll("input[type='checkbox']:checked")].map(cb=>cb.value).filter(Boolean);if(values.length){STATE.weeklyFiiliFilters[key]=values}else{delete STATE.weeklyFiiliFilters[key]}closeFiiliMenus();renderWeeklyFiiliTable()}));
      if(!window.__fiiliFilterOutsideBound){window.__fiiliFilterOutsideBound=true;document.addEventListener("click",e=>{if(!e.target.closest("[data-fiili-control]")&&!e.target.closest("[data-fiili-menu]"))closeFiiliMenus()});document.addEventListener("keydown",e=>{if(e.key==="Escape")closeFiiliMenus()});window.addEventListener("resize",()=>closeFiiliMenus())}
    }
    function renderWeeklyFiiliTable(){
      const host=$("weeklyFiiliTable"),columns=weeklyFiiliColumns(),baseRows=weeklyFiiliBaseRows();
      fiiliClearEmptyFilters();
      const rows=weeklyFiiliFilteredRows(),visible=rows.slice(0,shownLimit("weeklyFiili"));
      const activeFilterCount=Object.keys(STATE.weeklyFiiliFilters||{}).filter(k=>fiiliFilterValues(k).length).length;
      const tools=`<div class="table-tools"><span class="hint">Başlık hücrelerindeki filtrelerle sicil, ad soyad, mağaza, lokasyon, üst bölüm, unvan ve pozisyon kırılımlarını seçebilirsiniz. ${activeFilterCount?`${fmt(activeFilterCount)} aktif filtre var.`:""}</span>${activeFilterCount?`<button type="button" class="secondary" id="fiiliClearFilters">Tablo Filtrelerini Temizle</button>`:""}</div>`;
      const head=columns.map(c=>`<th><span class="norm-head-label">${esc(c.label)}</span>${fiiliFilterControl(c.key,c.label,baseRows,columns,c)}</th>`).join("");
      const selectedKey=STATE.tableSelectedRows.weeklyFiiliTable||"";
      const body=visible.map(row=>{const rowKey=[row.P_NO,row.AD_SOYAD,row.ISLETME_AD].map(v=>String(v??"")).join("¦");return`<tr data-fiili-row="${esc(rowKey)}" class="${selectedKey===rowKey?"row-selected":""}">${columns.map(c=>`<td data-label="${esc(c.label)}" title="${esc(row[c.key]??"")}">${esc(row[c.key]??"-")}</td>`).join("")}</tr>`}).join("");
      const note=`<p class="table-note">${fmt(visible.length)} / ${fmt(rows.length)} kayıt gösteriliyor${rows.length!==baseRows.length?` · ${fmt(baseRows.length)} toplam kayıt içinden filtrelendi`:""}.</p>`;
      host.innerHTML=`${tools}${note}<div class="table-wrap norm-table-wrap" tabindex="0"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
      bindFiiliFilterMenus(host);
      const clearBtn=host.querySelector("#fiiliClearFilters");if(clearBtn)clearBtn.addEventListener("click",()=>{STATE.weeklyFiiliFilters={};renderWeeklyFiiliTable()});
      host.querySelectorAll("[data-fiili-row]").forEach(tr=>tr.addEventListener("click",()=>{const key=tr.dataset.fiiliRow||"",next=STATE.tableSelectedRows.weeklyFiiliTable===key?"":key;STATE.tableSelectedRows.weeklyFiiliTable=next;host.querySelectorAll("[data-fiili-row]").forEach(row=>row.classList.toggle("row-selected",row.dataset.fiiliRow===next))}));
    }
    function renderWeeklyFiiliFilters(rows){const host=$("weeklyFiiliFilters");if(host)host.innerHTML=""}
    function renderWeeklyDiffGrouped(host, rows, totalCount){
      if(!host)return;
      if(!rows||!rows.length)return empty(host);
      const groups=new Map();
      rows.forEach(r=>{
        const key=`${r.region||""}||${r.store||""}`;
        if(!groups.has(key))groups.set(key,{key,region:r.region,store:r.store,positions:[],norm:0,fiili:0,fark:0,missing:0,excess:0});
        const g=groups.get(key);
        g.positions.push(r);
        g.norm+=Number(r.norm_kadro||0);
        g.fiili+=Number(r.fiili_kadro||0);
        g.fark+=Number(r.fark||0);
        if(String(r.durum)==="Eksik")g.missing+=1;
        if(String(r.durum)==="Fazla")g.excess+=1;
      });
      const grouped=[...groups.values()].map(g=>({...g,position_names:g.positions.map(p=>p.pozisyon).filter(Boolean).join(", "),durum:g.missing&&g.excess?"Eksik / Fazla":g.missing?"Eksik":"Fazla"})).sort((a,b)=>Math.abs(b.fark)-Math.abs(a.fark));
      const tableKey="weeklyDiffTable",columns=[["region","Bölge"],["store","Mağaza"],["position_names","Pozisyonlar"],["norm","Norm"],["fiili","Fiili"],["fark","Fark"],["durum","Durum"]],filteredGroups=tableRowsWithFilters(grouped,columns,tableKey),shown=filteredGroups.slice(0,shownLimit("weeklyDiffs"));
      const head=`<tr><th></th>${columns.map(c=>`<th class="${["norm","fiili","fark"].includes(c[0])?"num":""}"><span class="table-head-label">${esc(c[1])}</span>${tableFilterControl(tableKey,c,grouped)}</th>`).join("")}</tr>`;
      const body=shown.map(g=>{
        const isOpen=STATE.openDiffStores.has(g.key);
        const selected=STATE.tableSelectedRows[tableKey]===g.key;
        const main=`<tr data-diff-row="${esc(g.key)}" class="${selected?"row-selected":""}"><td><button type="button" class="expand-btn" data-diff-key="${esc(g.key)}">${isOpen?"-":"+"}</button></td><td>${esc(g.region||"-")}</td><td>${esc(g.store||"-")}</td><td title="${esc(g.position_names)}">${esc(g.position_names)}</td><td class="num">${fmt(g.norm)}</td><td class="num">${fmt(g.fiili)}</td><td class="num" style="${g.fark>0?"color:#b42318;font-weight:900":g.fark<0?"color:#047857;font-weight:900":"color:#475467"}">${fmt(g.fark)}</td><td><span class="badge ${g.missing?"bad":"warn"}">${esc(g.durum)}</span></td></tr>`;
        const children=!isOpen?"":g.positions.map(p=>`<tr class="child-row"><td></td><td></td><td></td><td class="indent">${esc(p.pozisyon||"-")}</td><td class="num">${fmt(p.norm_kadro)}</td><td class="num">${fmt(p.fiili_kadro)}</td><td class="num">${fmt(p.fark)}</td><td><span class="badge ${String(p.durum)==="Eksik"?"bad":"warn"}">${esc(p.durum||"")}</span></td></tr>`).join("");
        return main+children;
      }).join("");
      const activeFilters=Object.values(STATE.tableFilters[tableKey]||{}).filter(v=>Array.isArray(v)&&v.length).length,note=`<div class="table-tools"><span class="hint">${fmt(shown.length)} / ${fmt(filteredGroups.length)} mağaza gösteriliyor${filteredGroups.length!==grouped.length?` · ${fmt(grouped.length)} toplam mağazadan filtrelendi`:""}.</span>${activeFilters?'<button type="button" class="secondary" data-clear-diff-filters>Tablo Filtrelerini Temizle</button>':""}</div>`;
      host.innerHTML=`${note}<div class="table-wrap"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
      bindTableFilters(host);
      host.querySelector("[data-clear-diff-filters]")?.addEventListener("click",()=>{delete STATE.tableFilters[tableKey];renderWeekly()});
      host.querySelectorAll("[data-diff-row]").forEach(tr=>tr.addEventListener("click",()=>{const key=tr.dataset.diffRow||"",next=STATE.tableSelectedRows[tableKey]===key?"":key;STATE.tableSelectedRows[tableKey]=next;host.querySelectorAll("[data-diff-row]").forEach(row=>row.classList.toggle("row-selected",row.dataset.diffRow===next))}));
      host.querySelectorAll("[data-diff-key]").forEach(btn=>btn.addEventListener("click",event=>{event.stopPropagation();const key=btn.getAttribute("data-diff-key");if(STATE.openDiffStores.has(key))STATE.openDiffStores.delete(key);else STATE.openDiffStores.add(key);renderWeekly()}));
    }
    function renderWeekly(){
      const w=DATA.weekly||{};
      const normRows=filteredRows(w.norm_rows||[],["region","store","bolge_muduru","sehir"]),titles=w.norm_titles||[];
      renderWeeklyNormSummary(normRows,titles);
      bindNormTitleFilter(titles);
      const visibleNormTitles=activeNormTitles(titles);
      renderNormFiiliTable($("weeklyNormTable"),normRows,visibleNormTitles,normRows.length);
      const diffs=filteredRows(w.position_diffs||[],["region","store","pozisyon","durum"]);
      renderWeeklyDiffGrouped($("weeklyDiffTable"),diffs,diffs.length);
      renderTable($("disabledCityTable"),w.disabled_city||[],[["il","İl"],["calisan_sayisi","Çalışan",v=>fmt(v),"num"],["engelli_calisan_sayisi","ENGELLİ STATÜSÜ",v=>fmt(v),"num"],["olmasi_gereken_engelli_calisan_sayisi","Olması Gereken",v=>fmt(v),"num"],["fark","Fark",v=>fmt(v),"num"]]);
      const exits=filteredRows((w.exits||{}).rows||[],["region","store","ad_soyad","pozisyon","ayrilma_sebebi"]);
      const exitSelectedMonth=(w.exits||{}).selected_month,exitPreviousMonth=(w.exits||{}).previous_month;
      $("exitStats").innerHTML=[{label:monthName(exitSelectedMonth),value:fmt(exits.filter(row=>row.month===exitSelectedMonth).length),delta:"İlgili ay Çıkış"},{label:monthName(exitPreviousMonth),value:fmt(exits.filter(row=>row.month===exitPreviousMonth).length),delta:"Önceki ay Çıkış"}].map(k=>`<article class="card kpi-card"><div class="kpi-label">${esc(k.label)}</div><div class="kpi-value">${esc(k.value)}</div><div class="kpi-delta">${esc(k.delta)}</div></article>`).join("");
      renderTable($("weeklyExitTable"),exits,[["period_label","Dönem"],["region","Bölge"],["store","Mağaza"],["sicil_no","Sicil No"],["ad_soyad","Ad, Soyad"],["isletme","İşletme"],["pozisyon","Pozisyon"],["ise_giris_tarihi","İşe Giriş Tarihi"],["cikis_tarihi","Çıkış Tarihi"],["ayrilma_sebebi_grubu","Ayrılma Sebebi Grubu"],["ayrilma_sebebi","Ayrılma Sebebi"]],exits.length);
      const births=filteredRows(w.birth_list||[],["store","ad_soyad","pozisyon","aciklama"]);
      renderTable($("birthListTable"),births,[["sicil","Sicil"],["ad_soyad","Ad Soyad"],["store","Mağaza"],["pozisyon","Pozisyon"],["cikis_tarihi","Çıkış Tar."],["rapor_bitis_tarihi","Rapor Bitiş Tar."],["ucretsiz_izin_baslangic","Ücretsiz İzin Baş.Tar."],["ucretsiz_izin_bitis","Ücretsiz İzin Bit.Tar."],["donus_tarihi","Dönüş Tarihi"],["aciklama","Açıklama"]],births.length);
      const longRows=filteredRows(DATA.long_no_training,["bolge","magaza","il","kisi_adi","gorev","son_egitim_adi","program_adi"]);
      renderTable($("longNoTrainingTable"),longRows.slice(0,shownLimit("longNoTraining")),[["bolge","Bölge"],["magaza","Mağaza"],["il","Şehir"],["sicil","Sicil"],["kisi_adi","Ad Soyad"],["gorev","Görev"],["son_egitim_adi","Son Eğitim"],["son_katildigi_egitim_tarihi","Son Tarih"],["program_adi","Program"],["kidem_yili","Kıdem",v=>v==null?"-":fmt(v),"num"]],longRows.length);
      const allFiili=weeklyFiiliBaseRows();
      renderWeeklyFiiliFilters(allFiili);
      renderWeeklyFiiliTable();
    }
    function renderScorecard(){
      const rows=filteredScoreRows().sort((a,b)=>Number(b.turnover||0)-Number(a.turnover||0));
      renderTable($("storeScorecardTable"),rows.slice(0,shownLimit("storeScorecard")),[["region","Bölge"],["store","Mağaza"],["headcount","Çalışan",v=>fmt(v),"num"],["entries","Giriş",v=>fmt(v),"num"],["exits","Çıkış",v=>fmt(v),"num"],["turnover","Turnover",v=>pct(v,1),"num"],["avg_scorecard","Karne",v=>v==null?"-":(Number(v)<=1.2?pct(v,1):fmt(v,1)),"num"],["avg_scorecard_source","Karne Kaynak"],["avg_hgo","HGO",v=>v==null?"-":pct(percentLikeScore(v),1),"num"],["avg_ciro","Ciro (12 Ay)",v=>v==null?"-":fmt(v,0),"num"],["position_close_days","Pozisyon Kapatma",v=>v==null?"-":`${fmt(v,1)} gün`,"num"],["avg_risk","Risk",v=>v==null?"-":fmt(v,1),"num"],["academy_graduation_rate","Akademi",v=>v==null?"-":pct(v,1),"num"],["development_completion_rate","Gelişim",v=>v==null?"-":pct(v,1),"num"],["norm_fiili_orani","Norm/Fiili",v=>v==null?"-":pct(v,1),"num"],["regrettable_turnover_rate","Regrettable",v=>v==null?"-":pct(v,1),"num"]],rows.length);
    }
    function heatColor(v){const n=Number(v||0);if(n>.08)return "linear-gradient(135deg,#ffe0e0,#ffb7b7)";if(n>.045)return "linear-gradient(135deg,#fff0cf,#ffd88a)";return "linear-gradient(135deg,#e5f6ef,#bfe8d6)"}
    function heatModeOptions(){
      const months=[...new Set((DATA.store_monthly||[]).map(r=>r.month).filter(Boolean))].sort(),latest=months[months.length-1]||DATA.meta.latest_month||"",year=String(latest).slice(0,4);
      return [{value:"latest",label:`Son Ay (${monthName(latest)})`},{value:`year:${year}`,label:`${year} kümüle turnover`}].concat(months.map(m=>({value:`month:${m}`,label:monthName(m)})));
    }
    function cumulativeTurnover(rows){
      const valid=(rows||[]).filter(r=>Number.isFinite(Number(r.headcount))&&Number(r.headcount)>0);
      if(!valid.length)return null;
      const exits=valid.reduce((s,r)=>s+Number(r.exits||0),0);
      const denomSum=valid.reduce((s,r)=>s+(((Number(r.donem_basi||0)+Number(r.donem_sonu||0))>0)?((Number(r.donem_basi||0)+Number(r.donem_sonu||0))/2):Number(r.headcount||0)),0);
      const avgDenom=denomSum/valid.length;
      return avgDenom>0?exits/avgDenom:null;
    }
    function heatRowsForMode(){
      const latest=DATA.meta.latest_month||"",mode=STATE.heatMode||"latest",scoreRows=filteredScoreRows(),regionMap=new Map(scoreRows.map(r=>[r.store,r.region])),riskMap=new Map(scoreRows.map(r=>[r.store,r.avg_risk]));
      if(mode==="latest")return scoreRows.map(r=>({...r,_heat_label:monthName(latest)}));
      const monthly=DATA.store_monthly||[];
      if(mode.startsWith("month:")){
        const month=mode.slice(6);
        return monthly.filter(r=>r.month===month).map(r=>({...r,region:regionMap.get(r.store)||r.region,avg_risk:riskMap.get(r.store),_heat_label:monthName(month)})).filter(r=>(!STATE.region||r.region===STATE.region)&&(!STATE.store||r.store===STATE.store));
      }
      if(mode.startsWith("year:")){
        const year=mode.slice(5),by=new Map();
        monthly.filter(r=>String(r.month||"").startsWith(`${year}-`)).forEach(r=>{const arr=by.get(r.store)||[];arr.push(r);by.set(r.store,arr)});
        return [...by.entries()].map(([store,arr])=>({store,region:regionMap.get(store)||arr[0]?.region,headcount:arr[arr.length-1]?.headcount||0,turnover:cumulativeTurnover(arr),avg_risk:riskMap.get(store),_heat_label:`${year} kümüle`})).filter(r=>(!STATE.region||r.region===STATE.region)&&(!STATE.store||r.store===STATE.store));
      }
      return scoreRows;
    }
    function renderStoreHeatmap(){
      const sel=$("heatModeSelect"),options=heatModeOptions();
      if(sel){sel.innerHTML=options.map(o=>`<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("");if(!options.some(o=>o.value===STATE.heatMode))STATE.heatMode="latest";sel.value=STATE.heatMode;if(!sel.dataset.bound){sel.addEventListener("change",e=>{STATE.heatMode=e.target.value;renderStoreHeatmap();renderCumuleTitleTurnoverTable()});sel.dataset.bound="1"}}
      const host=$("storeHeatmap"),rows=heatRowsForMode().sort((a,b)=>Number(b.turnover||0)-Number(a.turnover||0)).slice(0,24);
      if(!rows.length)return empty(host);
      host.innerHTML=rows.map(r=>`<div class="heat-tile" style="background:${heatColor(r.turnover)}"><strong>${esc(r.store)}</strong><div class="metric">${r.turnover==null?"-":pct(r.turnover||0,1)}</div><div class="sub">${esc(r.region||'-')} · ${fmt(r.headcount||0)} çalışan · ${esc(r._heat_label||'')} · risk ${r.avg_risk==null?'-':fmt(r.avg_risk,1)}</div></div>`).join("");
    }
    function renderOrgTrackingFilters(rows){
      const host=$("orgTrackingFilters");if(!host)return;
      const statuses=[...new Set((rows||[]).map(r=>r.gelisim_yolculugu_durumu).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),"tr-TR"));
      const academies=[...new Set((rows||[]).map(r=>r.satis_akademisi_mezun).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),"tr-TR"));
      const elig=[...new Set((rows||[]).map(r=>r.terfiye_uygunluk).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),"tr-TR"));
      host.innerHTML=`<select id="orgStatusSelect"><option value="">Gelişim: Tümü</option>${statuses.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("")}</select><select id="orgAcademySelect"><option value="">Akademi: Tümü</option>${academies.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("")}</select><select id="orgEligibilitySelect"><option value="">Terfi Uygunluğu: Tümü</option>${elig.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("")}</select>`;
      const bindSel=(id,key)=>{const el=$(id);if(!el)return;el.value=STATE[key]||"";el.addEventListener("change",e=>{STATE[key]=e.target.value;renderTables()})};
      bindSel("orgStatusSelect","orgStatus");bindSel("orgAcademySelect","orgAcademy");bindSel("orgEligibilitySelect","orgEligibility");
    }
    function renderTables(){
      const nonRows=filteredRows(DATA.non_attending||[],["bolge","magaza","il","kisi_adi","isim_soyisim","unvan","program","egitim_durumu"]);
      renderTable($("nonAttendingTable"),nonRows.slice(0,shownLimit("nonAttending")),[["bolge","Bölge"],["magaza","Mağaza"],["il","Şehir"],["sicil","Sicil"],["isim_soyisim","Ad Soyad"],["gorev","Görev"],["unvan","Unvan"],["program","Program"],["egitim_durumu","Eğitim Durumu"],["katilim_durumu","Katılım"],["son_katildigi_egitim","Son Eğitim"],["son_katildigi_egitim_tarihi","Son Tarih"]],nonRows.length);
      const academyRows=filteredRows(DATA.academy_development||[],["bolge","magaza","il","isim_soyisim","gorev","tamamlama_durumu"]);
      renderTable($("academyDevelopmentTable"),academyRows.slice(0,shownLimit("academyDevelopment")),[["sicil","Sicil"],["isim_soyisim","Ad Soyad"],["bolge","Bölge"],["magaza","Mağaza"],["il","İl"],["gorev","Görev"],["tamamlama_durumu","Tamamlama"],["durum_oran","Durum Oran",v=>v==null?"-":pct(Number(v)/100),"num"],["performans_notu","Performans",v=>v==null?"-":fmt(v,1),"num"],["kidem_yili","Kıdem",v=>v==null?"-":fmt(v,1),"num"]],academyRows.length);
      let orgRows=filteredRows(DATA.org_tracking||[],["bolge","magaza","il","isim_soyisim","gorev","son_satis_akademisi","satis_akademisi_mezun","gelisim_yolculugu_durumu"]);
      renderOrgTrackingFilters(orgRows);
      orgRows=orgRows.filter(r=>(!STATE.orgStatus||String(r.gelisim_yolculugu_durumu||"")===STATE.orgStatus)&&(!STATE.orgAcademy||String(r.satis_akademisi_mezun||"")===STATE.orgAcademy)&&(!STATE.orgEligibility||String(r.terfiye_uygunluk||"")===STATE.orgEligibility));
      renderTable($("orgTrackingTable"),orgRows.slice(0,shownLimit("orgTracking")),[["sicil","Sicil"],["isim_soyisim","Ad Soyad"],["bolge","Bölge"],["magaza","Mağaza"],["il","İl"],["gorev","Görev"],["kidem_yili","Kıdem (Yıl)",v=>v==null?"-":fmt(v,2),"num"],["son_satis_akademisi","Son Satış Akademisi"],["satis_akademisi_mezun","Akademi"],["gelisim_yolculugu_durumu","Gelişim Yolculuğu"],["gelisim_yolculugu_oran","Gelişim Yolculuğu Tamamlama Oranı",v=>v==null?"-":pct(Number(v)/100),"num"],["performans_harf_notu","Harf"],["terfiye_uygunluk","Terfiye Uygunluk"],["terfi_uygunluk_notu","Not"]],orgRows.length);
    }
    function renderRegionTable(){
      const latest=DATA.meta.latest_month,rows=(DATA.region_monthly||[]).filter(r=>r.month===latest&&(!STATE.region||r.region===STATE.region));
      renderTable($("regionTable"),rows.sort((a,b)=>Number(b.turnover||0)-Number(a.turnover||0)),[["region","Bölge"],["headcount","Çalışan",v=>fmt(v),"num"],["entries","Giriş",v=>fmt(v),"num"],["exits","Çıkış",v=>fmt(v),"num"],["turnover","Turnover",v=>pct(v,1),"num"],["avg_scorecard","Karne",v=>v==null?"-":(Number(v)<=1.2?pct(v,1):fmt(v,1)),"num"],["avg_scorecard_source","Karne Kaynak"],["avg_enocta_dk","Enocta Dk",v=>v==null?"-":fmt(v,0),"num"]],rows.length);
    }
    function renderEnoctaTable(){
      const rows=filteredRows(DATA.enocta_top_users||[],["bolge","magaza","isim_soyisim","ad_soyad","gorev","il"]);
      renderTable($("enoctaTable"),rows.slice(0,20),[["sicil","Sicil"],["isim_soyisim","Ad Soyad"],["bolge","Bölge"],["magaza","Mağaza"],["il","İl"],["gorev","Görev"],["egitim_sayisi","Eğitim",v=>fmt(v),"num"],["izleme_dk","İzleme Dk",v=>fmt(v,0),"num"],["egitim_sure_saat","Saat",v=>fmt(v,1),"num"]],rows.length);
    }
    function promotionTenureGroup(v){const n=Number(v);if(!Number.isFinite(n))return "-";if(n<=6)return "0-6 Ay";if(n<=12)return "7-12 Ay";if(n<=24)return "13-24 Ay";return "25+ Ay"}
    function renderPromotionAndRisk(){
      const promo=DATA.promotion_tracking||{};
      const rows=filteredRows(promo.rows||[],["bolge","magaza","adi_soyadi","terfi_pozisyonu","onceki_unvan","yeni_unvan","gorev","unvan"]);
      const managerRows=filteredRows(promo.manager_turnover_rows||[],["bolge","magaza","il","adi_soyadi"]);
      const roleSel=$("promotionRoleSelect"),roles=[...new Set(rows.map(r=>r.terfi_pozisyonu).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),"tr-TR"));
      if(roleSel){fillSelect(roleSel,roles,"Terfi Pozisyonu: Hepsi");roleSel.value=STATE.promotionRole||"";if(!roleSel.dataset.bound){roleSel.addEventListener("change",e=>{STATE.promotionRole=e.target.value;renderPromotionAndRisk()});roleSel.dataset.bound="1"}}
      const filteredPromo=rows.filter(r=>!STATE.promotionRole||String(r.terfi_pozisyonu||"")===STATE.promotionRole);
      const statRows=(promo.summary||[]).filter(r=>!STATE.promotionRole||String(r.terfi_pozisyonu||"")===STATE.promotionRole);
      const fmtKarne=v=>Number.isFinite(Number(v))?(Number(v)<=1.2?pct(v,1):fmt(v,1)):"-";
      const fmtHgo=v=>{const n=Number(v);return Number.isFinite(n)?(n>1.2?pct(n/100,1):pct(n,1)):"-"};
      const fmtMoney=v=>Number.isFinite(Number(v))?fmt(Math.round(Number(v))):"-";
      const host=$("promotionTrackingBlock");
      if(host){
        const stats=document.createElement("div");stats.className="grid kpi-grid";stats.style.marginBottom="12px";
        stats.innerHTML=(statRows.length?statRows:promo.summary||[]).map(s=>`<article class="card kpi-card"><div class="kpi-label">${esc(s.terfi_pozisyonu||"-")}</div><div class="kpi-value">${fmt(s.ic_terfi_sayisi||0)}</div><div class="kpi-delta">Ort. kıdem: ${Number.isFinite(Number(s.ortalama_terfi_kidem_yil))?fmt(s.ortalama_terfi_kidem_yil,1)+" yıl":"-"}${Number.isFinite(Number(s.ortalama_terfi_kidem_ay))?" · "+fmt(s.ortalama_terfi_kidem_ay,0)+" ay":""}</div></article>`).join("");
        host.innerHTML="";host.appendChild(stats);
        const table=document.createElement("div");table.id="promotionTrackingTable";host.appendChild(table);
        renderTable(table,filteredPromo.slice(0,shownLimit("storePromotions")),[["terfi_ayi","Terfi Ayı",v=>monthName(v)],["terfi_yili","Terfi Yılı",(v,row)=>v||String(row?.terfi_ayi||"").slice(0,4)||"-"],["sicil_no","Sicil"],["adi_soyadi","Ad Soyad"],["bolge","Bölge"],["magaza","Mağaza"],["il","Şehir"],["terfi_pozisyonu","Terfi Pozisyonu"],["onceki_unvan","Önceki Unvan"],["yeni_unvan","Yeni Unvan"],["terfi_kidem_yil","Terfi Kıdemi",v=>Number.isFinite(Number(v))?`${fmt(v,1)} yıl`:"-","num"],["terfi_kidem_ay","Terfi Kıdemi (Ay)",v=>Number.isFinite(Number(v))?fmt(v,0):"-","num"],["terfi_kidem_ay","Kıdem Grubu",v=>promotionTenureGroup(v)],["onceki_terfi_ayi","Önceki Terfi Ayı",v=>v?monthName(v):"İlk Terfisi"],["onceki_terfiden_bu_terfiye","Önceki Terfiden Bu Terfiye"],["terfi_analiz_suresi_ay","Analiz Süresi (Ay)",v=>Number.isFinite(Number(v))?fmt(v,0):"-","num"],["terfi_analiz_suresi_kaynagi","Analiz Süresi Kaynağı"],["kadro_adi","Kadro"],["gorev","Görev"],["unvan","Unvan"],["hareket_ozeti","Nereden \u2192 Nereye"]],filteredPromo.length);
      }
      const managerTitleMatches=!STATE.promotionRole||norm(STATE.promotionRole).includes("magaza mudur");
      const shownManagerRows=managerTitleMatches?managerRows:[];
      renderTable($("managerPromotionTurnoverBlock"),shownManagerRows.slice(0,shownLimit("managerPromotionTurnover")),[["terfi_ayi","Terfi Ayı",v=>monthName(v)],["terfi_yili","Terfi Yılı",(v,row)=>v||String(row?.terfi_ayi||"").slice(0,4)||"-"],["sicil_no","Sicil"],["adi_soyadi","Ad Soyad"],["bolge","Bölge"],["magaza","Mağaza"],["il","Şehir"],["terfi_kidem_yil","Terfi Kıdemi",v=>Number.isFinite(Number(v))?`${fmt(v,1)} yıl`:"-","num"],["terfi_kidem_ay","Terfi Kıdemi (Ay)",v=>Number.isFinite(Number(v))?fmt(v,0):"-","num"],["onceki_terfi_ayi","Önceki Terfi Ayı",v=>v?monthName(v):"İlk Terfisi"],["onceki_terfiden_bu_terfiye","Önceki Terfiden Bu Terfiye"],["terfi_analiz_suresi_ay","Analiz Süresi (Ay)",v=>Number.isFinite(Number(v))?fmt(v,0):"-","num"],["terfi_analiz_suresi_kaynagi","Analiz Süresi Kaynağı"],["onceki_12_ay_turnover","Önceki 12 Ay Turnover",v=>Number.isFinite(Number(v))?pct(v,1):"-","num"],["terfi_sonrasi_ortalama_turnover","Terfi Sonrası Ort. Turnover",v=>Number.isFinite(Number(v))?pct(v,1):"-","num"],["turnover_farki","Turnover Farkı",v=>Number.isFinite(Number(v))?pct(v,1):"-","num"],["onceki_12_ay_karne_ortalama","Önceki Karne",fmtKarne,"num"],["terfi_sonrasi_karne_ortalama","Sonrası Karne",fmtKarne,"num"],["karne_farki","Karne Farkı",fmtKarne,"num"],["onceki_12_ay_enocta_ortalama_dk","Önceki Enocta Dk",v=>Number.isFinite(Number(v))?fmt(v,0):"-","num"],["terfi_sonrasi_enocta_ortalama_dk","Sonrası Enocta Dk",v=>Number.isFinite(Number(v))?fmt(v,0):"-","num"],["enocta_farki_dk","Enocta Farkı",v=>Number.isFinite(Number(v))?fmt(v,0):"-","num"],["onceki_12_ay_hgo_ortalama","Önceki HGO",fmtHgo,"num"],["terfi_sonrasi_hgo_ortalama","Sonrası HGO",fmtHgo,"num"],["hgo_farki","HGO Farkı",fmtHgo,"num"],["onceki_12_ay_ciro_ortalama","Önceki Ciro",fmtMoney,"num"],["terfi_sonrasi_ciro_ortalama","Sonrası Ciro",fmtMoney,"num"],["ciro_farki","Ciro Farkı",fmtMoney,"num"],["onceki_12_ay_ortalama_calisan","Önceki Ort. Çalışan",v=>Number.isFinite(Number(v))?fmt(v,1):"-","num"],["terfi_sonrasi_ortalama_calisan","Sonrası Ort. Çalışan",v=>Number.isFinite(Number(v))?fmt(v,1):"-","num"],["calisan_farki","Çalışan Farkı",v=>Number.isFinite(Number(v))?fmt(v,1):"-","num"],["terfi_sonrasi_cikis_sayisi","Sonrası Çıkış",v=>fmt(v),"num"]],shownManagerRows.length);
      const corrRows=promo.manager_effect_correlation||[];
      const corrHost=$("managerPromotionCorrelationBlock");
      if(corrHost){
        const metricFmt=(row,v)=>{const n=Number(v);if(!Number.isFinite(n))return"-";const label=norm(row.metrik||"");if(label.includes("turnover")||label.includes("hgo"))return n>1.2?pct(n/100,1):pct(n,1);if(label.includes("ciro"))return fmt(Math.round(n));if(label.includes("enocta"))return `${fmt(n)} dk`;if(label.includes("karne"))return n<=1.2?pct(n,1):fmt(n,1);if(label.includes("calisan"))return fmt(n,1);return fmt(n,2)};
        const toneConfig={good:{accent:"#16a34a",bg:"rgba(22,163,74,.12)",label:"Olumlu"},bad:{accent:"#dc2626",bg:"rgba(220,38,38,.12)",label:"Dikkat"},neutral:{accent:"#d97706",bg:"rgba(217,119,6,.12)",label:"N\u00f6tr"}};
        const toneForRow=r=>{const explicit=String(r?.renk_durumu||"").toLocaleLowerCase("tr-TR");if(explicit.includes("good")||explicit.includes("olum"))return"good";if(explicit.includes("bad")||explicit.includes("dikkat")||explicit.includes("risk"))return"bad";const c=Number(r?.korelasyon);if(!Number.isFinite(c)||Math.abs(c)<0.15)return"neutral";const dir=String(r?.iyi_yon||"").toLocaleLowerCase("tr-TR"),label=norm(r?.metrik||"");const lower=dir.includes("lower")||(!dir&&label.includes("turnover")),higher=dir.includes("higher")||(!dir&&(label.includes("karne")||label.includes("enocta")||label.includes("hgo")||label.includes("ciro")));if(lower)return c>0?"good":"bad";if(higher)return c<0?"good":"bad";return"neutral"};
        if(!corrRows.length){empty(corrHost,"Korelasyon i\u00e7in yeterli veri bulunamad\u0131.")}
        else{
          corrHost.innerHTML=`<div class="grid kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px">${corrRows.map(r=>{const c=Number(r.korelasyon),tone=toneConfig[toneForRow(r)]||toneConfig.neutral,accent=tone.accent,buckets=(r.dilimler&&r.dilimler.length?r.dilimler:[{dilim:"0-12 ay",ortalama:r.dilim_0_12_ortalama,ornek_sayisi:r.dilim_0_12_ornek},{dilim:"13-24 ay",ortalama:r.dilim_13_24_ortalama,ornek_sayisi:r.dilim_13_24_ornek},{dilim:"25-36 ay",ortalama:r.dilim_25_36_ortalama,ornek_sayisi:r.dilim_25_36_ornek},{dilim:"37+ ay",ortalama:r.dilim_37_plus_ortalama,ornek_sayisi:r.dilim_37_plus_ornek}]),bucketHtml=buckets.map(b=>`<div class="kpi-delta" style="display:flex;justify-content:space-between;gap:10px"><span>${esc(b.dilim||"")} <small>(${fmt(b.ornek_sayisi||0)} ör.)</small></span><strong>${metricFmt(r,b.ortalama)}</strong></div>`).join("");return`<article class="card kpi-card" style="min-height:230px;border-top:4px solid ${accent};background:linear-gradient(180deg, ${tone.bg}, transparent 78%), var(--card);padding:18px"><div class="kpi-label" style="display:flex;justify-content:space-between;gap:8px"><span>${esc(r.metrik||"-")}</span><strong style="color:${accent}">${tone.label}</strong></div><div class="kpi-value" style="color:${accent};font-size:30px">${Number.isFinite(c)?pct(c,1):"-"}</div><div class="kpi-delta"><strong>${esc(r.iliski||"-")}</strong> \u00b7 ${fmt(r.ornek_sayisi||0)} \u00f6rnek</div><div class="kpi-delta" style="font-weight:900">Analiz süresi dilimleri</div>${bucketHtml}<div class="kpi-delta" style="line-height:1.45;margin-top:8px">${esc(r.yorum||"")}</div></article>`}).join("")}</div>`;
        }
      }
      const risk=DATA.risk_tables||{},storeRegionMap=new Map((DATA.store_scorecard||[]).map(r=>[norm(r.store||r.isletme_adi),r.region]));
      let riskRegions=(risk.regions||[]).map(r=>({...r,ad:r.departman_adi||r.bolge||r.bolge_adi}));
      let riskStores=(risk.stores||[]).map(r=>({...r,ad:r.isletme_adi||r.magaza||r.magaza_adi,region:storeRegionMap.get(norm(r.isletme_adi||r.magaza||r.magaza_adi))||""}));
      if(STATE.region){riskRegions=riskRegions.filter(r=>norm(r.ad)===norm(STATE.region));riskStores=riskStores.filter(r=>norm(r.region)===norm(STATE.region))}
      if(STATE.store){riskStores=riskStores.filter(r=>norm(r.ad)===norm(STATE.store))}
      renderTable($("riskRegionTable"),riskRegions.slice(0,20),[["ad","Bölge"],["personel_sayisi","Personel",v=>fmt(v),"num"],["ortalama_risk_skoru","Ort. Risk",v=>fmt(v,1),"num"],["max_risk_skoru","Maks",v=>fmt(v,1),"num"],["min_risk_skoru","Min",v=>fmt(v,1),"num"]],riskRegions.length);
      renderTable($("riskStoreTable"),riskStores.slice(0,shownLimit("riskStores")),[["ad","Mağaza"],["region","Bölge"],["personel_sayisi","Personel",v=>fmt(v),"num"],["ortalama_risk_skoru","Ort. Risk",v=>fmt(v,1),"num"],["max_risk_skoru","Maks",v=>fmt(v,1),"num"],["min_risk_skoru","Min",v=>fmt(v,1),"num"]],riskStores.length);
    }

function statusBadgeClass(key,text){
      const ascii=v=>norm(v)
        .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
        .replace(/[\u0131\u0130]/g,"i").replace(/[\u011f\u011e]/g,"g").replace(/[\u00fc\u00dc]/g,"u")
        .replace(/[\u015f\u015e]/g,"s").replace(/[\u00f6\u00d6]/g,"o").replace(/[\u00e7\u00c7]/g,"c");
      const keyNorm=ascii(key), n=ascii(text);
      if(!n||n==="-")return "neutral";
      if(keyNorm.includes("engel"))return "";
      if(keyNorm.includes("oran")||keyNorm.includes("notu"))return "";
      const isStatus=keyNorm.includes("durum")||keyNorm.includes("katilim")||keyNorm.includes("mezun")||keyNorm.includes("uygun")||keyNorm.includes("yolculuk");
      if(!isStatus)return "";
      if(n.includes("uygun degil")||n.includes("katilmad")||n.includes("katilim yok")||n.includes("mezun degil")||n.includes("basarisiz")||n.includes("eksik"))return "bad";
      if(n.includes("kayit var")||n.includes("kayit yok")||n.includes("devam")||n.includes("bekle")||n.includes("bilinmiyor")||n.includes("fazla"))return "warn";
      if(n.includes("uygun")||n.includes("katildi")||n.includes("mezun")||n.includes("tamam")||n.includes("basarili"))return "good";
      return "neutral";
    }
    function tableCellText(column,row){const raw=row[column[0]],value=column[2]?column[2](raw,row):raw;return String(value??"-")}
    function tableHostKey(host){if(!host.dataset.tableKey)host.dataset.tableKey=host.id||`table_${++window.__tableKeyCounter}`;return host.dataset.tableKey}
    function tableColumnSelections(tableKey,columnKey){return((STATE.tableFilters?.[tableKey]||{})[columnKey]||[]).map(String)}
    function tableRowsWithFilters(rows,cols,tableKey){const active=STATE.tableFilters?.[tableKey]||{};return(rows||[]).filter(row=>cols.every(col=>{const selected=(active[col[0]]||[]).map(norm);return!selected.length||selected.includes(norm(tableCellText(col,row))) }))}
    function tableFilterControl(tableKey,column,rows){
      const columnKey=String(column[0]),selected=tableColumnSelections(tableKey,columnKey),selectedNorm=new Set(selected.map(norm)),options=new Map();
      (rows||[]).forEach(row=>{const text=tableCellText(column,row);options.set(norm(text),text)});
      const sorted=[...options.values()].sort((a,b)=>String(a).localeCompare(String(b),"tr-TR",{numeric:true,sensitivity:"base"}));
      const optionHtml=sorted.map(text=>`<label class="norm-filter-option"><input type="checkbox" value="${esc(text)}"${selectedNorm.has(norm(text))?" checked":""}> <span>${esc(text)}</span></label>`).join("");
      const summary=selected.length?`${fmt(selected.length)} seçili`:"Tümü";
      return `<div class="table-column-filter" data-table-filter-control><button type="button" class="table-filter-button${selected.length?" active":""}" data-table-filter-open title="${esc(column[1])} filtresi"><span>${esc(summary)}</span></button><div class="norm-filter-menu" data-table-filter-menu data-table-key="${esc(tableKey)}" data-column-key="${esc(columnKey)}"><div class="norm-filter-menu-title">${esc(column[1])} filtresi</div><input class="norm-filter-search" type="search" placeholder="Ara, Enter ile görünenleri seç..." data-table-filter-search><div class="norm-filter-actions"><button type="button" class="secondary" data-table-filter-all>Görünenleri Seç</button><button type="button" class="secondary" data-table-filter-none>Temizle</button></div><div class="norm-filter-list">${optionHtml||'<div class="norm-filter-empty" style="display:block">Seçenek yok</div>'}</div><div class="norm-filter-empty" data-table-filter-empty>Sonuç yok</div><div class="norm-filter-footer"><span class="norm-filter-count">${fmt(sorted.length)} seçenek</span><button type="button" class="secondary" data-table-filter-cancel>Vazgeç</button><button type="button" data-table-filter-apply>Uygula</button></div></div></div>`;
    }
    function closeTableFilterMenus(except=null){document.querySelectorAll("[data-table-filter-menu].open").forEach(menu=>{if(menu!==except)menu.classList.remove("open")})}
    function bindTableFilters(host){
      host.querySelectorAll("[data-table-filter-open]").forEach(button=>button.addEventListener("click",event=>{event.stopPropagation();const menu=button.parentElement.querySelector("[data-table-filter-menu]");if(!menu)return;const open=!menu.classList.contains("open");closeTableFilterMenus(menu);menu.classList.toggle("open",open);if(open){positionNormMenu(menu,button);const search=menu.querySelector("[data-table-filter-search]");if(search){search.value="";search.focus()}}}));
      host.querySelectorAll("[data-table-filter-search]").forEach(input=>input.addEventListener("input",event=>{const menu=event.target.closest("[data-table-filter-menu]"),query=event.target.value,labels=[...menu.querySelectorAll(".norm-filter-option")];let visible=0;labels.forEach(label=>{const show=looseContains(label.textContent,query);label.style.display=show?"flex":"none";if(show)visible+=1});menu.querySelector("[data-table-filter-empty]").style.display=visible?"none":"block"}));
      host.querySelectorAll("[data-table-filter-search]").forEach(input=>input.addEventListener("keydown",event=>{if(event.key!=="Enter")return;event.preventDefault();event.target.closest("[data-table-filter-menu]").querySelectorAll(".norm-filter-option").forEach(label=>{if(label.style.display!=="none")label.querySelector("input").checked=true})}));
      host.querySelectorAll("[data-table-filter-all]").forEach(button=>button.addEventListener("click",event=>{event.stopPropagation();button.closest("[data-table-filter-menu]").querySelectorAll(".norm-filter-option").forEach(label=>{if(label.style.display!=="none")label.querySelector("input").checked=true})}));
      host.querySelectorAll("[data-table-filter-none]").forEach(button=>button.addEventListener("click",event=>{event.stopPropagation();button.closest("[data-table-filter-menu]").querySelectorAll("input[type='checkbox']").forEach(input=>input.checked=false)}));
      host.querySelectorAll("[data-table-filter-cancel]").forEach(button=>button.addEventListener("click",event=>{event.stopPropagation();closeTableFilterMenus()}));
      host.querySelectorAll("[data-table-filter-apply]").forEach(button=>button.addEventListener("click",event=>{event.stopPropagation();const menu=button.closest("[data-table-filter-menu]"),tableKey=menu.dataset.tableKey,columnKey=menu.dataset.columnKey,values=[...menu.querySelectorAll("input[type='checkbox']:checked")].map(input=>input.value);STATE.tableFilters[tableKey]=STATE.tableFilters[tableKey]||{};if(values.length&&values.length<menu.querySelectorAll("input[type='checkbox']").length)STATE.tableFilters[tableKey][columnKey]=values;else delete STATE.tableFilters[tableKey][columnKey];if(!Object.keys(STATE.tableFilters[tableKey]).length)delete STATE.tableFilters[tableKey];closeTableFilterMenus();renderAll()}));
      if(!window.__tableFilterOutsideBound){window.__tableFilterOutsideBound=true;document.addEventListener("click",event=>{if(!event.target.closest("[data-table-filter-control]")&&!event.target.closest("[data-table-filter-menu]"))closeTableFilterMenus()});document.addEventListener("keydown",event=>{if(event.key==="Escape")closeTableFilterMenus()});window.addEventListener("resize",()=>closeTableFilterMenus())}
    }
    window.__tableKeyCounter=window.__tableKeyCounter||0;
    function renderTable(host,rows,cols,totalCount=null){
      if(!host)return;
      if(!rows||!rows.length)return empty(host);
      const tableKey=tableHostKey(host),sourceRows=rows,shownRows=tableRowsWithFilters(sourceRows,cols,tableKey),activeFilters=Object.keys(STATE.tableFilters?.[tableKey]||{}).length;
      const cellHtml=(c,row)=>{const text=tableCellText(c,row),cls=statusBadgeClass(String(c[0]||""),text);return cls?`<span class="badge ${cls}">${esc(text)}</span>`:esc(text)};
      const head=cols.map(c=>`<th class="${c[3]==="num"?"num":""}"><span class="table-head-label">${esc(c[1])}</span>${tableFilterControl(tableKey,c,sourceRows)}</th>`).join("");
      const body=shownRows.length?shownRows.map(row=>{const rowKey=cols.slice(0,4).map(c=>String(row[c[0]]??"")).join("¦"),selected=STATE.tableSelectedRows?.[tableKey]===rowKey;return`<tr data-table-row="${esc(rowKey)}" class="${selected?"row-selected":""}">${cols.map(c=>{const raw=row[c[0]],num=Number(raw),key=String(c[0]||"").toLocaleLowerCase("tr-TR");let tone="";if(key==="turnover_farki"&&Number.isFinite(num)){tone=num>0?"color:#b42318;font-weight:900":num<0?"color:#047857;font-weight:900":"color:#475467"}else if(key.includes("fark")&&Number.isFinite(num)){tone=num<0?"color:#b42318;font-weight:900":num>0?"color:#047857;font-weight:900":"color:#475467"}return`<td data-label="${esc(c[1])}" title="${esc(raw??"")}" class="${c[3]==="num"?"num":""}" style="${tone}">${cellHtml(c,row)}</td>`}).join("")}</tr>`}).join(""):`<tr><td colspan="${cols.length}">Aktif tablo filtrelerine uygun kayıt bulunamadı.</td></tr>`;
      const limitNote=totalCount&&totalCount>sourceRows.length?`İlk ${fmt(sourceRows.length)} / ${fmt(totalCount)} kayıt yüklendi. `:"",filterNote=activeFilters?`${fmt(shownRows.length)} / ${fmt(sourceRows.length)} satır tablo filtresine uyuyor.`:"";
      const tools=activeFilters?`<div class="table-tools"><span class="hint">${limitNote}${filterNote}</span><button type="button" class="secondary" data-clear-table-filters>Tablo Filtrelerini Temizle</button></div>`:(limitNote?`<p class="table-note">${limitNote}</p>`:"");
      host.innerHTML=`${tools}<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
      bindTableFilters(host);
      host.querySelectorAll("tbody tr[data-table-row]").forEach(row=>row.addEventListener("click",()=>{const key=row.dataset.tableRow||"",next=STATE.tableSelectedRows[tableKey]===key?"":key;STATE.tableSelectedRows[tableKey]=next;host.querySelectorAll("tbody tr[data-table-row]").forEach(item=>item.classList.toggle("row-selected",item.dataset.tableRow===next))}));
      host.querySelector("[data-clear-table-filters]")?.addEventListener("click",()=>{delete STATE.tableFilters[tableKey];renderAll()});
    }
    function empty(el,msg="Bu filtre için veri bulunamadı."){el.innerHTML=`<div class="empty">${esc(msg)}</div>`}
    function downloadCsv(name,rows){if(!rows||!rows.length)return;const cols=[...new Set(rows.flatMap(r=>Object.keys(r)))],csv=[cols.join(";")].concat(rows.map(r=>cols.map(c=>`"${String(r[c]??"").replace(/"/g,'""')}"`).join(";"))).join("\n"),blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}
    function turnoverPage(){return DATA.turnover_page||{months:[],full_data:[],exit_rows:[],store_detail:[],stores:[]}}
    function parseIsoDate(v){if(!v)return null;const d=new Date(`${v}T00:00:00`);return Number.isFinite(d.getTime())?d:null}
    function turnoverWorkTypeMatches(row){const type=String(row.calisma_tipi||"");if(STATE.turnoverWorkType==="part_time")return type==="Part Time";if(STATE.turnoverWorkType==="full_time")return type==="Full Time";return true}
    function turnoverWorkRows(applyGlobalFilters=true){const rows=(turnoverPage().full_data||[]).filter(turnoverWorkTypeMatches);return applyGlobalFilters?filteredRows(rows,["region","store","ad_soyad","title","unvan","city","magaza_markasi","calisma_tipi"]):rows}
    function turnoverRows(){return turnoverWorkRows(true)}
    function turnoverExitRows(){return turnoverRows().filter(row=>Number(row.exit||0)>0)}
    function aggregateTurnoverRows(rows,groupKey=null){
      const map=new Map();
      (rows||[]).forEach(row=>{const month=String(row.month||""),group=groupKey?String(row[groupKey]||"Bilinmiyor").trim()||"Bilinmiyor":"__total__";if(!month)return;const key=`${group}|||${month}`,item=map.get(key)||{group,month,headcount:0,entries:0,exits:0,donem_basi:0,donem_sonu:0};item.headcount+=Number(row.headcount||0);item.entries+=Number(row.entry||0);item.exits+=Number(row.exit||0);item.donem_basi+=Number(row.donem_basi||0);item.donem_sonu+=Number(row.donem_sonu||0);map.set(key,item)});
      return [...map.values()].map(item=>({...item,turnover:turnoverRateFromCounts(item.exits,item.donem_basi,item.donem_sonu,item.headcount)})).sort((a,b)=>String(a.month).localeCompare(String(b.month))||String(a.group).localeCompare(String(b.group),"tr-TR"))
    }
    function selectedTurnoverMonthlySeries(){return aggregateTurnoverRows(turnoverRows())}
    function turnoverLatestMonth(){const months=turnoverPage().months||[];return STATE.turnoverExitMonth||months[months.length-1]||DATA.meta.latest_month}
    function renderTurnoverKpis(){const rows=turnoverRows(),exits=turnoverExitRows(),latest=turnoverLatestMonth(),latestRows=rows.filter(r=>r.month===latest),latestExits=exits.filter(r=>r.month===latest),stores=new Set(rows.map(r=>r.store).filter(Boolean)),regions=new Set(rows.map(r=>r.region).filter(Boolean).filter(r=>/^bolge\s+\d+$/.test(asciiKey(r)))),early6=exits.filter(r=>turnoverTenureDays(r)<=183).length,early6Rate=exits.length?early6/exits.length:0,cards=[{label:"Turnover Dönemi",value:fmt((turnoverPage().months||[]).length),delta:`${monthName((turnoverPage().months||[])[0])} - ${monthName(latest)}`,color:COLORS.blue},{label:"Son Ay Çalışan",value:fmt(latestRows.reduce((s,r)=>s+Number(r.headcount||0),0)),delta:monthName(latest),color:COLORS.teal},{label:"Son Ay Çıkış",value:fmt(latestExits.length),delta:"seçili filtre",color:COLORS.rose},{label:"İlk 6 Ay Çıkış",value:fmt(early6),delta:`${pct(early6Rate,1)} · seçili dönem penceresi`,color:COLORS.amber},{label:"Mağaza",value:fmt(stores.size),delta:`${fmt(regions.size)} bölge`,color:COLORS.green},{label:"Full Data",value:fmt(rows.length),delta:"kişi-dönem kaydı",color:COLORS.violet}];$("kpiGrid").innerHTML=cards.map(k=>`<article class="card kpi-card"><div class="kpi-label">${esc(k.label)}</div><div class="kpi-value">${esc(k.value)}</div><div class="kpi-delta">${esc(k.delta)}</div><svg class="spark" viewBox="0 0 160 30"><path d="M0 21 C32 8 58 26 88 12 S136 5 160 17" fill="none" stroke="${k.color}" stroke-width="2.8" stroke-linecap="round"/></svg></article>`).join("")}
    function turnoverTenureDays(row){const s=parseIsoDate(row.ise_giris_tarihi),e=parseIsoDate(row.isten_cikis_tarihi);if(s&&e)return Math.max(0,(e-s)/86400000);const y=Number(row.kidem_yili);return Number.isFinite(y)?y*365:999999}
    function turnoverEarlyTitleOptions(){return [...new Set(turnoverRows().map(r=>String(r.title||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"tr-TR"))}
    function buildEarlyTurnoverRows(){const months=turnoverPage().months||[],exits=turnoverExitRows().filter(r=>!STATE.turnoverEarlyTitle||String(r.title||"").trim()===STATE.turnoverEarlyTitle),by=new Map();months.forEach(m=>by.set(m,{donem:m,total_cikis:0,ilk_1_ay:0,ilk_2_ay:0,ilk_6_ay:0}));exits.forEach(r=>{const m=r.month;if(!by.has(m))return;const d=turnoverTenureDays(r),x=by.get(m);x.total_cikis+=1;if(d<=31)x.ilk_1_ay+=1;if(d<=62)x.ilk_2_ay+=1;if(d<=183)x.ilk_6_ay+=1});return months.map(m=>{const r=by.get(m);return{...r,ilk_1_ay_oran:r.total_cikis?r.ilk_1_ay/r.total_cikis:0,ilk_2_ay_oran:r.total_cikis?r.ilk_2_ay/r.total_cikis:0,ilk_6_ay_oran:r.total_cikis?r.ilk_6_ay/r.total_cikis:0}})}
    function turnoverPeriodRate(monthItems, months){
      let exits=0, denomSum=0, n=0;
      (months||[]).forEach(m=>{const item=monthItems.get(m);if(!item)return;exits+=Number(item.exits||0);denomSum+=(((Number(item.donem_basi||0)+Number(item.donem_sonu||0))>0)?((Number(item.donem_basi||0)+Number(item.donem_sonu||0))/2):Number(item.headcount||0));n+=1});
      const avgDenom=n?denomSum/n:0;
      return avgDenom>0?exits/avgDenom:null;
    }
    function buildTurnoverMatrixRows(groupKey){
      const months=turnoverPage().months||[],map=new Map();
      const source=turnoverRows().map(r=>({group:String(r[groupKey]||"Bilinmiyor").trim()||"Bilinmiyor",month:r.month,headcount:r.headcount,exits:r.exit,donem_basi:r.donem_basi,donem_sonu:r.donem_sonu}));
      source.forEach(r=>{
        const g=String(r.group||"Bilinmiyor").trim()||"Bilinmiyor",m=r.month;
        if(!m||!months.includes(m))return;
        if(groupKey==="region"&&!/^bolge\s+\d+$/.test(asciiKey(g)))return;
        const key=`${g}|||${m}`,item=map.get(key)||{group:g,month:m,headcount:0,exits:0,donem_basi:0,donem_sonu:0,turnover:null};
        item.headcount+=Number(r.headcount||0);item.exits+=Number(r.exits||0);item.donem_basi+=Number(r.donem_basi||0);item.donem_sonu+=Number(r.donem_sonu||0);
        if(r.turnover!=null&&Number.isFinite(Number(r.turnover)))item.turnover=Number(r.turnover);
        map.set(key,item);
      });
      const latest=months[months.length-1]||DATA.meta.latest_month||"";
      const year=String(latest).slice(0,4);
      const last12=months.slice(-12),last6=months.slice(-6),yearMonths=months.filter(m=>String(m).startsWith(`${year}-`));
      const groups=[...new Set([...map.values()].map(x=>x.group))].sort((a,b)=>a.localeCompare(b,"tr-TR"));
      return groups.map(g=>{
        const out={group:g},monthItems=new Map();let sum=0,count=0;
        months.forEach(m=>{
          const item=map.get(`${g}|||${m}`);
          let rate=null;
          if(item){
            if(item.turnover!=null){
              rate=item.turnover;
            }else{
              rate=turnoverRateFromCounts(item.exits,item.donem_basi,item.donem_sonu,item.headcount);
            }
          }
          out[m]=rate;
          if(item)monthItems.set(m,item);
          if(rate!=null){sum+=rate;count+=1}
        });
        out._avg=count?sum/count:0;
        out.son_1_yil_turnover=turnoverPeriodRate(monthItems,last12);
        out.ilgili_yil_turnover=turnoverPeriodRate(monthItems,yearMonths);
        out.son_6_ay_turnover=turnoverPeriodRate(monthItems,last6);
        return out;
      }).sort((a,b)=>Number(b._avg||0)-Number(a._avg||0))
    }
    function renderTurnoverMatrix(host,groupKey,label,limit=999999){
      const months=turnoverPage().months||[],latest=months[months.length-1]||DATA.meta.latest_month||"",year=String(latest).slice(0,4);
      const allRows=buildTurnoverMatrixRows(groupKey),rows=allRows.slice(0,limit);
      const cols=[["group",label]].concat(months.map(m=>[m,shortMonth(m),v=>v==null?"-":pct(v,1),"num"])).concat([
        ["son_1_yil_turnover","Son 1 Yıl",v=>v==null?"-":pct(v,1),"num"],
        ["ilgili_yil_turnover",`${year} Yılı`,v=>v==null?"-":pct(v,1),"num"],
        ["son_6_ay_turnover","Son 6 Ay",v=>v==null?"-":pct(v,1),"num"]
      ]);
      renderTable(host,rows,cols,allRows.length)
    }
    function turnoverCompareEntities(type){
      const rows=turnoverWorkRows(false),key=type==="store"?"store":"region";
      const regionNum=v=>{const m=asciiKey(v).match(/^bolge\s+(\d+)$/);return m?Number(m[1]):9999};
      return [...new Set(rows.map(r=>r[key]).filter(Boolean).filter(v=>type!=="region"||/^bolge\s+\d+$/.test(asciiKey(v))))].sort((a,b)=>type==="region"?(regionNum(a)-regionNum(b)):String(a).localeCompare(String(b),"tr-TR"));
    }
    function turnoverCompareYears(){
      const rows=turnoverWorkRows(false);
      return [...new Set(rows.map(r=>String(r.month||"").slice(0,4)).filter(Boolean))].sort();
    }
    function fillValueSelect(sel,items,placeholder,value){if(!sel)return;sel.innerHTML=`<option value="">${esc(placeholder)}</option>`+(items||[]).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");sel.value=value||""}
    function turnoverCompareSeries(type,entity,year){
      const key=type==="store"?"store":"region",rows=turnoverWorkRows(false).filter(r=>String(r[key]||"")===String(entity||"")&&String(r.month||"").startsWith(`${year}-`));
      return aggregateTurnoverRows(rows);
    }
    function compareMonthNums(){return ["01","02","03","04","05","06","07","08","09","10","11","12"]}
    function renderTurnoverCompareChart(host,a,b,labelA,labelB){
      const monthNums=compareMonthNums();
      if(!(a||[]).length&&!(b||[]).length)return empty(host,"K\u0131yaslama i\u00e7in veri bulunamad\u0131.");
      const mapA=new Map((a||[]).map(r=>[String(r.month).slice(5,7),r.turnover])),mapB=new Map((b||[]).map(r=>[String(r.month).slice(5,7),r.turnover]));
      const vals=[...mapA.values(),...mapB.values()].filter(v=>v!=null&&Number.isFinite(Number(v)));
      if(!vals.length)return empty(host,"Se\u00e7ilen k\u0131r\u0131l\u0131m i\u00e7in turnover verisi bulunamad\u0131.");
      const w=900,h=320,p={l:54,r:26,t:24,b:56},max=Math.max(.01,...vals)*1.2,min=0,span=max-min||.01,x=i=>p.l+i*((w-p.l-p.r)/Math.max(1,monthNums.length-1)),y=v=>h-p.b-((Number(v)-min)/span)*(h-p.t-p.b);
      const line=(map,color,label)=>{const pts=monthNums.map((mm,i)=>({mm,x:x(i),v:map.get(mm)})).filter(pt=>pt.v!=null&&Number.isFinite(Number(pt.v)));const d=pts.map((pt,i)=>`${i?"L":"M"}${pt.x.toFixed(1)} ${y(pt.v).toFixed(1)}`).join(" ");const dots=pts.map(pt=>`<circle cx="${pt.x}" cy="${y(pt.v)}" r="4" fill="${color}"><title>${esc(label)} \u00b7 ${shortMonth(`2000-${pt.mm}`)} \u00b7 ${pct(pt.v,1)}</title></circle>`).join("");return `<path d="${d}" fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>${dots}`};
      const grid=Array.from({length:5},(_,i)=>{const gy=p.t+i*((h-p.t-p.b)/4),val=max-i*(span/4);return`<line x1="${p.l}" y1="${gy}" x2="${w-p.r}" y2="${gy}" stroke="#eadfce"/><text x="10" y="${gy+4}" fill="#6d7482" font-size="11">${pct(val,1)}</text>`}).join("");
      const labels=monthNums.map((mm,i)=>`<text x="${x(i)}" y="${h-16}" text-anchor="middle" fill="#6d7482" font-size="11">${shortMonth(`2000-${mm}`)}</text>`).join("");
      host.innerHTML=`<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%">${grid}${line(mapA,COLORS.blue,labelA)}${line(mapB,COLORS.rose,labelB)}${labels}<g transform="translate(${p.l},${h-5})"><rect width="10" height="3" fill="${COLORS.blue}"/><text x="16" y="4" fill="#334155" font-size="11">${esc(labelA)}</text><rect x="210" width="10" height="3" fill="${COLORS.rose}"/><text x="226" y="4" fill="#334155" font-size="11">${esc(labelB)}</text></g></svg>`;
    }
    function bindTurnoverComparisonControls(){
      const typeSel=$("turnoverCompareType"),aSel=$("turnoverCompareA"),bSel=$("turnoverCompareB"),yaSel=$("turnoverCompareYearA"),ybSel=$("turnoverCompareYearB");
      if(!typeSel||!aSel||!bSel||!yaSel||!ybSel)return;
      const years=turnoverCompareYears(),latestYear=years[years.length-1]||"",prevYear=years[Math.max(0,years.length-2)]||latestYear;
      typeSel.innerHTML=`<option value="region">B\u00f6lge K\u0131yasla</option><option value="store">Ma\u011faza K\u0131yasla</option>`;
      typeSel.value=STATE.turnoverCompareType||"region";
      const entities=turnoverCompareEntities(STATE.turnoverCompareType);
      if(!STATE.turnoverCompareA||!entities.includes(STATE.turnoverCompareA))STATE.turnoverCompareA=entities[0]||"";
      if(!STATE.turnoverCompareB||!entities.includes(STATE.turnoverCompareB))STATE.turnoverCompareB=entities[1]||entities[0]||"";
      if(!STATE.turnoverCompareYearA)STATE.turnoverCompareYearA=latestYear;
      if(!STATE.turnoverCompareYearB)STATE.turnoverCompareYearB=prevYear;
      fillValueSelect(aSel,entities,STATE.turnoverCompareType==="store"?"Ma\u011faza se\u00e7iniz":"B\u00f6lge se\u00e7iniz",STATE.turnoverCompareA);
      fillValueSelect(bSel,entities,STATE.turnoverCompareType==="store"?"K\u0131yaslanacak ma\u011faza se\u00e7iniz":"K\u0131yaslanacak b\u00f6lge se\u00e7iniz",STATE.turnoverCompareB);
      fillValueSelect(yaSel,years,"Y\u0131l se\u00e7iniz",STATE.turnoverCompareYearA);
      fillValueSelect(ybSel,years,"Y\u0131l se\u00e7iniz",STATE.turnoverCompareYearB);
      if(!typeSel.dataset.bound){typeSel.addEventListener("change",e=>{STATE.turnoverCompareType=e.target.value;STATE.turnoverCompareA="";STATE.turnoverCompareB="";renderTurnoverComparison()});typeSel.dataset.bound="1"}
      [[aSel,"turnoverCompareA"],[bSel,"turnoverCompareB"],[yaSel,"turnoverCompareYearA"],[ybSel,"turnoverCompareYearB"]].forEach(([sel,key])=>{if(!sel.dataset.bound){sel.addEventListener("change",e=>{STATE[key]=e.target.value;renderTurnoverComparison()});sel.dataset.bound="1"}});
    }
    function renderTurnoverComparison(){
      bindTurnoverComparisonControls();
      const a=turnoverCompareSeries(STATE.turnoverCompareType,STATE.turnoverCompareA,STATE.turnoverCompareYearA),b=turnoverCompareSeries(STATE.turnoverCompareType,STATE.turnoverCompareB,STATE.turnoverCompareYearB);
      renderTurnoverCompareChart($("turnoverCompareChart"),a,b,`${STATE.turnoverCompareA} ${STATE.turnoverCompareYearA}`,`${STATE.turnoverCompareB} ${STATE.turnoverCompareYearB}`);
      const monthNums=compareMonthNums(),byA=new Map(a.map(r=>[String(r.month).slice(5,7),r])),byB=new Map(b.map(r=>[String(r.month).slice(5,7),r]));
      const makeMetric=(label,reader,formatter)=>{const row={metric:label};monthNums.forEach(mm=>{row[`m${mm}`]={value:reader(byA.get(mm)||{},byB.get(mm)||{}),formatter}});return row};
      const rows=[
        makeMetric(`${STATE.turnoverCompareA} ${STATE.turnoverCompareYearA} Turnover`,(ra)=>ra.turnover,v=>v==null?"-":pct(v,1)),
        makeMetric(`${STATE.turnoverCompareB} ${STATE.turnoverCompareYearB} Turnover`,(_,rb)=>rb.turnover,v=>v==null?"-":pct(v,1)),
        makeMetric("Fark",(ra,rb)=>(ra.turnover!=null&&rb.turnover!=null)?ra.turnover-rb.turnover:null,v=>v==null?"-":pct(v,1)),
        makeMetric(`${STATE.turnoverCompareA} ${STATE.turnoverCompareYearA} \u00c7\u0131k\u0131\u015f`,(ra)=>ra.exits,v=>v==null?"-":fmt(v,0)),
        makeMetric(`${STATE.turnoverCompareB} ${STATE.turnoverCompareYearB} \u00c7\u0131k\u0131\u015f`,(_,rb)=>rb.exits,v=>v==null?"-":fmt(v,0)),
        makeMetric(`${STATE.turnoverCompareA} ${STATE.turnoverCompareYearA} D\u00f6nem Ba\u015f\u0131`,(ra)=>ra.donem_basi,v=>v==null?"-":fmt(v,0)),
        makeMetric(`${STATE.turnoverCompareA} ${STATE.turnoverCompareYearA} D\u00f6nem Sonu`,(ra)=>ra.donem_sonu,v=>v==null?"-":fmt(v,0)),
        makeMetric(`${STATE.turnoverCompareB} ${STATE.turnoverCompareYearB} D\u00f6nem Ba\u015f\u0131`,(_,rb)=>rb.donem_basi,v=>v==null?"-":fmt(v,0)),
        makeMetric(`${STATE.turnoverCompareB} ${STATE.turnoverCompareYearB} D\u00f6nem Sonu`,(_,rb)=>rb.donem_sonu,v=>v==null?"-":fmt(v,0))
      ];
      const cols=[["metric","Metrik"]].concat(monthNums.map(mm=>[`m${mm}`,shortMonth(`2000-${mm}`),cell=>cell&&cell.formatter?cell.formatter(cell.value):"-","num"]));
      renderTable($("turnoverCompareTable"),rows,cols,rows.length);
    }
    const CUMULE_TITLE_GROUPS=["Part Time","Pasör Satış Danışmanı","Depo","Satış Danışmanı","Kasiyer","Yönetici"];
    function cumuleTitleGroup(row){const k=asciiKey([row?.title,row?.magaza_kirilim,row?.unvan,row?.kadro_adi,row?.calisma_tipi].filter(Boolean).join(" "));if(k.includes("pasor"))return "Pasör Satış Danışmanı";if(k.includes("part time"))return "Part Time";if(k.includes("depo")||k.includes("destek"))return "Depo";if(k.includes("kasiyer"))return "Kasiyer";if(k.includes("mudur")||k.includes("yonetici")||k.includes("ikinci")||k.includes("yardimci"))return "Yönetici";if(k.includes("satis")||k.includes("danisman")||k.includes("corner"))return "Satış Danışmanı";return "Diğer"}
    function cumuleTitleMonths(){const months=turnoverPage().months||[],latest=months[months.length-1]||DATA.meta.latest_month||"",mode=STATE.heatMode||"latest";if(mode==="latest")return latest?[latest]:[];if(mode.startsWith("month:"))return [mode.slice(6)].filter(Boolean);if(mode.startsWith("year:")){const y=mode.slice(5);return months.filter(m=>String(m).startsWith(`${y}-`))}return latest?[latest]:[]}
    function cumuleRateFromItems(items){
      const monthly=new Map();
      (items||[]).forEach(item=>{
        const month=String(item.month||"");
        if(!month)return;
        const bucket=monthly.get(month)||{exits:0,donem_basi:0,donem_sonu:0,headcount:0};
        bucket.exits+=Number(item.exits||0);
        bucket.donem_basi+=Number(item.donem_basi||0);
        bucket.donem_sonu+=Number(item.donem_sonu||0);
        bucket.headcount+=Number(item.headcount||0);
        monthly.set(month,bucket);
      });
      let exits=0,denom=0,n=0;
      monthly.forEach(bucket=>{
        exits+=bucket.exits;
        const startEnd=bucket.donem_basi+bucket.donem_sonu;
        denom+=startEnd>0?startEnd/2:bucket.headcount;
        n+=1;
      });
      const avg=n?denom/n:0;
      return avg>0?exits/avg:null;
    }
    function cumuleSharedDenominator(items){
      const monthly=new Map();
      (items||[]).forEach(item=>{
        const month=String(item.month||"");
        if(!month)return;
        const bucket=monthly.get(month)||{donem_basi:0,donem_sonu:0,headcount:0};
        bucket.donem_basi+=Number(item.donem_basi||0);
        bucket.donem_sonu+=Number(item.donem_sonu||0);
        bucket.headcount+=Number(item.headcount||0);
        monthly.set(month,bucket);
      });
      let denominatorSum=0,monthCount=0;
      monthly.forEach(bucket=>{
        const startEnd=bucket.donem_basi+bucket.donem_sonu;
        denominatorSum+=startEnd>0?startEnd/2:bucket.headcount;
        monthCount+=1;
      });
      return monthCount?denominatorSum/monthCount:0;
    }
    function cumuleContributionRate(items,sharedDenominator){
      if(!(sharedDenominator>0))return null;
      const exits=(items||[]).reduce((sum,item)=>sum+Number(item.exits||0),0);
      return exits/sharedDenominator;
    }
    function cumuleTitleMetricRate(items,sharedDenominator){
      return STATE.turnoverCumuleMetric==="title_rate"
        ?cumuleRateFromItems(items)
        :cumuleContributionRate(items,sharedDenominator);
    }
    function buildCumuleTitleTurnoverRows(){
      const months=cumuleTitleMonths();
      const source=turnoverRows().filter(r=>months.includes(String(r.month||"")));
      const regions=[...new Set(source.map(r=>r.region).filter(r=>/^bolge\s+\d+$/.test(asciiKey(r))))].sort((a,b)=>{
        const an=Number((asciiKey(a).match(/\d+/)||[9999])[0]);
        const bn=Number((asciiKey(b).match(/\d+/)||[9999])[0]);
        return an-bn;
      });
      const result=[];
      const totals={region:"TOPLAM",_items:[],_groups:{}};
      regions.forEach(region=>{
        const row={region,_items:[],_groups:{}};
        source.filter(r=>r.region===region).forEach(r=>{
          const groupName=cumuleTitleGroup(r);
          const group=CUMULE_TITLE_GROUPS.includes(groupName)?groupName:null;
          const item={
            month:String(r.month||""),
            exits:Number(r.exit||0),
            headcount:Number(r.headcount||0),
            donem_basi:Number(r.donem_basi||0),
            donem_sonu:Number(r.donem_sonu||0)
          };
          row._items.push(item);
          totals._items.push(item);
          if(!group)return;
          row._groups[group]=row._groups[group]||[];
          row._groups[group].push(item);
          totals._groups[group]=totals._groups[group]||[];
          totals._groups[group].push(item);
        });
        const sharedDenominator=cumuleSharedDenominator(row._items);
        CUMULE_TITLE_GROUPS.forEach(group=>{
          row[group]=cumuleTitleMetricRate(row._groups[group]||[],sharedDenominator);
        });
        row["Toplam Turnover"]=cumuleRateFromItems(row._items);
        result.push(row);
      });
      const totalSharedDenominator=cumuleSharedDenominator(totals._items);
      CUMULE_TITLE_GROUPS.forEach(group=>{
        totals[group]=cumuleTitleMetricRate(totals._groups[group]||[],totalSharedDenominator);
      });
      totals["Toplam Turnover"]=cumuleRateFromItems(totals._items);
      if(result.length)result.push(totals);
      return result.map(({_items,_groups,...rest})=>rest);
    }
    function renderCumuleTitleTurnoverTable(){
      const periodSelect=$("turnoverCumuleModeSelect"),options=heatModeOptions();
      if(periodSelect){
        periodSelect.innerHTML=options.map(o=>`<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("");
        if(!options.some(o=>o.value===STATE.heatMode))STATE.heatMode="latest";
        periodSelect.value=STATE.heatMode;
        if(!periodSelect.dataset.bound){
          periodSelect.addEventListener("change",e=>{STATE.heatMode=e.target.value;renderCumuleTitleTurnoverTable();renderStoreHeatmap()});
          periodSelect.dataset.bound="1";
        }
      }
      const metricSelect=$("turnoverCumuleMetricSelect");
      if(metricSelect){
        metricSelect.value=STATE.turnoverCumuleMetric||"contribution";
        if(!metricSelect.dataset.bound){
          metricSelect.addEventListener("change",e=>{STATE.turnoverCumuleMetric=e.target.value||"contribution";renderCumuleTitleTurnoverTable()});
          metricSelect.dataset.bound="1";
        }
      }
      const hint=$("turnoverCumuleMetricHint");
      if(hint)hint.textContent=STATE.turnoverCumuleMetric==="title_rate"
        ?"Title Turnover Oranı = ilgili title çıkışı / seçili dönemde ilgili title'ın aylık ((dönem başı + dönem sonu) / 2) değerlerinin ortalaması. Toplam Turnover tüm title'ların kanonik toplam oranıdır."
        :"Turnover İçindeki Pay = ilgili title çıkışı / seçili dönemde tüm çalışanların aylık ((dönem başı + dönem sonu) / 2) değerlerinin ortak ortalaması. Title sütunları birlikte toplam turnover katkısını açıklar.";
      const host=$("turnoverCumuleTitleTable"),rows=buildCumuleTitleTurnoverRows();
      if(!rows.length)return empty(host,"Kümüle title turnover tablosu için veri bulunamadı.");
      const headers=["region"].concat(CUMULE_TITLE_GROUPS).concat(["Toplam Turnover"]);
      const tone=v=>v==null?"empty":Number(v)>=.18?"high":Number(v)>=.08?"mid":"low";
      host.innerHTML=`<div class="cumule-turnover-wrap"><table class="cumule-turnover-table"><thead><tr>${headers.map(h=>`<th>${esc(h==="region"?"BÖLGE":h)}</th>`).join("")}</tr></thead><tbody>${rows.map(row=>`<tr class="${row.region==="TOPLAM"?"total-row":""}"><th>${esc(row.region)}</th>${headers.slice(1).map(h=>`<td class="${tone(row[h])}">${row[h]==null?"-":pct(row[h],1)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    }
    function renderTurnoverTrend(){const rows=selectedTurnoverMonthlySeries().filter(r=>r.month&&Number.isFinite(Number(r.turnover)));historyChart($("turnoverTrendChart"),rows)}
    function renderTurnoverEarly(){const options=turnoverEarlyTitleOptions(),sel=$("turnoverEarlyTitleSelect");if(STATE.turnoverEarlyTitle&&!options.includes(STATE.turnoverEarlyTitle))STATE.turnoverEarlyTitle="";fillValueSelect(sel,options,"Tüm title'lar",STATE.turnoverEarlyTitle);if(sel&&!sel.dataset.bound){sel.addEventListener("change",e=>{STATE.turnoverEarlyTitle=e.target.value;renderTurnoverEarly()});sel.dataset.bound="1"}const rows=buildEarlyTurnoverRows();renderTable($("turnoverEarlyTable"),rows,[["donem","Dönem",v=>monthName(v)],["total_cikis","Toplam Çıkış",v=>fmt(v),"num"],["ilk_1_ay","İlk Ay",v=>fmt(v),"num"],["ilk_1_ay_oran","İlk Ay Oranı",v=>pct(v,1),"num"],["ilk_2_ay","İlk 2 Ay",v=>fmt(v),"num"],["ilk_2_ay_oran","İlk 2 Ay Oranı",v=>pct(v,1),"num"],["ilk_6_ay","İlk 6 Ay",v=>fmt(v),"num"],["ilk_6_ay_oran","İlk 6 Ay Oranı",v=>pct(v,1),"num"]],rows.length)}
    function renderTurnoverRegionExits(){const months=turnoverPage().months||[],sel=$("turnoverExitMonthSelect");if(sel){fillSelect(sel,months.map(m=>({value:m,label:monthName(m)})).map(x=>x.value),"Dönem Seçin");sel.innerHTML=`<option value="">Son Dönem</option>`+months.map(m=>`<option value="${esc(m)}">${esc(monthName(m))}</option>`).join("");sel.value=STATE.turnoverExitMonth||"";if(!sel.dataset.bound){sel.addEventListener("change",e=>{STATE.turnoverExitMonth=e.target.value;renderTurnoverKpis();renderTurnoverRegionExits()});sel.dataset.bound="1"}}const selectedMonth=STATE.turnoverExitMonth||turnoverLatestMonth(),rows=turnoverExitRows().filter(r=>r.month===selectedMonth);renderTable($("turnoverRegionExitsTable"),rows.slice(0,250),[["month","Dönem",v=>monthName(v)],["sicil","Sicil"],["ad_soyad","Ad Soyad"],["region","Bölge"],["store","Mağaza"],["city","Şehir"],["magaza_markasi","Marka"],["calisma_tipi","Çalışma Tipi"],["unvan","Unvan"],["title","Pozisyon"],["kadro_adi","Kadro"],["ise_giris_tarihi","İşe Giriş"],["isten_cikis_tarihi","Çıkış"],["kidem_yili","Kıdem",v=>fmt(v,1),"num"]],rows.length)}
    function turnoverStoreDetailRows(){return aggregateTurnoverRows(turnoverRows(),"store").map(row=>({...row,store:row.group,cikis:row.exits}))}
    function renderTurnoverStoreDetail(){const detail=turnoverStoreDetailRows(),options=[...new Set(detail.map(r=>r.store).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"tr-TR")),sel=$("turnoverStoreSelect");if(sel){fillSelect(sel,options,"Mağaza Seçin");if(STATE.store&&options.includes(STATE.store))STATE.turnoverStore=STATE.store;if(STATE.turnoverStore&&!options.includes(STATE.turnoverStore))STATE.turnoverStore="";if(!STATE.turnoverStore&&options.length)STATE.turnoverStore=options[0];sel.value=STATE.turnoverStore||"";if(!sel.dataset.bound){sel.addEventListener("change",e=>{STATE.turnoverStore=e.target.value;renderTurnoverStoreDetail()});sel.dataset.bound="1"}}const rows=detail.filter(r=>!STATE.turnoverStore||r.store===STATE.turnoverStore).sort((a,b)=>String(a.month).localeCompare(String(b.month)));if(!rows.length){empty($("turnoverStoreDetailChart"));return empty($("turnoverStoreDetailTable"))}historyChart($("turnoverStoreDetailChart"),rows);renderTable($("turnoverStoreDetailTable"),rows,[["month","Dönem",v=>monthName(v)],["store","Mağaza"],["donem_basi","Dönem Başı",v=>fmt(v),"num"],["donem_sonu","Dönem Sonu",v=>fmt(v),"num"],["cikis","Çıkış",v=>fmt(v),"num"],["turnover","Turnover",v=>pct(v,1),"num"]],rows.length)}
    function renderTurnoverFullData(){const rows=turnoverRows();renderTable($("turnoverFullDataTable"),rows.slice(0,300),[["month","Dönem",v=>monthName(v)],["sicil","Sicil"],["ad_soyad","Ad Soyad"],["store","Mağaza"],["magaza_markasi","Marka"],["region","Bölge"],["city","Şehir"],["calisma_tipi","Çalışma Tipi"],["unvan","Unvan"],["title","Pozisyon"],["kadro_adi","Kadro"],["dogum_tarihi","Doğum"],["ise_giris_tarihi","İşe Giriş"],["isten_cikis_tarihi","İşten Çıkış"],["kidem_yili","Kıdem",v=>fmt(v,1),"num"]],rows.length)}
    function bindTurnoverWorkType(){const select=$("turnoverWorkTypeSelect");if(!select)return;select.value=STATE.turnoverWorkType||"all";if(!select.dataset.bound){select.addEventListener("change",event=>{STATE.turnoverWorkType=event.target.value||"all";STATE.turnoverStore="";STATE.turnoverCompareA="";STATE.turnoverCompareB="";STATE.tableFilters={};renderAll()});select.dataset.bound="1"}}
    function renderTurnover(){bindTurnoverWorkType();renderTurnoverTrend();renderCumuleTitleTurnoverTable();renderTurnoverComparison();renderTurnoverEarly();renderTurnoverRegionExits();renderTurnoverMatrix($("turnoverRegionMatrix"),"region","Bölge");renderTurnoverMatrix($("turnoverTitleMatrix"),"title","Title");renderTurnoverMatrix($("turnoverCityMatrix"),"city","Şehir");renderTurnoverMatrix($("turnoverStoreMatrix"),"store","Mağaza");renderTurnoverStoreDetail();renderTurnoverFullData()}
    function bind(){$("regionSelect").addEventListener("change",e=>{STATE.region=e.target.value;STATE.store="";STATE.profileStore="";const stores=STATE.region?[...new Set(DATA.store_scorecard.filter(r=>r.region===STATE.region).map(r=>r.store).filter(Boolean))].sort():DATA.filters.stores;fillSelect($("storeSelect"),stores,"Tüm Mağazalar");renderAll()});$("storeSelect").addEventListener("change",e=>{STATE.store=e.target.value;STATE.profileStore=e.target.value;renderAll()});$("searchInput").addEventListener("input",e=>{STATE.search=e.target.value;renderAll()});$("resetBtn").addEventListener("click",()=>{STATE.region="";STATE.store="";STATE.profileStore="";STATE.search="";STATE.weeklyLoc="";STATE.weeklyUst="";STATE.weeklyFiiliSearch="";STATE.weeklyFiiliFilters={};STATE.normFilters={};STATE.normTitleMode="all";STATE.tableFilters={};STATE.tableSelectedRows={};STATE.normSelectedKey="";STATE.orgStatus="";STATE.orgAcademy="";STATE.orgEligibility="";STATE.promotionRole="";STATE.turnoverCumuleMetric="contribution";STATE.turnoverWorkType="all";STATE.turnoverStore="";STATE.turnoverExitMonth="";STATE.turnoverEarlyTitle="";STATE.turnoverCompareType="region";STATE.turnoverCompareA="";STATE.turnoverCompareB="";STATE.turnoverCompareYearA="";STATE.turnoverCompareYearB="";$("searchInput").value="";fillSelect($("regionSelect"),DATA.filters.regions,"Tüm Bölgeler");fillSelect($("storeSelect"),DATA.filters.stores,"Tüm Mağazalar");renderAll()});$("printBtn").addEventListener("click",()=>window.print());document.querySelectorAll("[data-toggle]").forEach(btn=>btn.addEventListener("click",()=>{const key=btn.getAttribute("data-toggle");if(STATE.expanded.has(key)){STATE.expanded.delete(key);btn.textContent="Daha Fazla Göster"}else{STATE.expanded.add(key);btn.textContent="Daha Az Göster"}renderAll()}));document.querySelectorAll("[data-export]").forEach(btn=>btn.addEventListener("click",()=>{const key=btn.getAttribute("data-export"),map={nonAttending:DATA.non_attending,longNoTraining:DATA.long_no_training,academyDevelopment:DATA.academy_development,orgTracking:DATA.org_tracking};if(map[key])downloadCsv(`${key}_${DATA.meta.latest_month}.csv`,filteredRows(map[key]||[],Object.keys((map[key]||[])[0]||{})))}));$("exportScorecard").addEventListener("click",()=>downloadCsv(`magaza_skor_karti_${DATA.meta.latest_month}.csv`,filteredRows(DATA.store_scorecard,["region","store"])))}
    function renderAll(){document.querySelectorAll(".report-tab").forEach(b=>b.classList.toggle("active",b.dataset.report===STATE.report));$("monthlyReport").classList.toggle("hidden",STATE.report!=="monthly");$("weeklyReport").classList.toggle("hidden",STATE.report!=="weekly");$("turnoverReport").classList.toggle("hidden",STATE.report!=="turnover");$("profileReport").classList.toggle("hidden",STATE.report!=="profile");renderKpis();if(STATE.report==="weekly"){renderWeekly();return}if(STATE.report==="turnover"){renderTurnover();return}if(STATE.report==="profile"){renderStoreProfile();return}renderMonthlyChart();renderRegionHealth();renderForecast();renderBrandScorecard();renderMetricRelationships();renderAgeTenurePyramid();renderComparisonRadar();renderScorecard();renderStoreHeatmap();renderTables();renderPromotionAndRisk();renderRegionTable();renderEnoctaTable()}
    initMeta();bind();document.querySelectorAll(".report-tab").forEach(btn=>btn.addEventListener("click",()=>{STATE.report=btn.dataset.report;renderAll()}));document.querySelectorAll("[data-export]").forEach(btn=>btn.addEventListener("click",()=>{const key=btn.getAttribute("data-export"),w=DATA.weekly||{},profileStore=activeProfileStore(),storeDetail=turnoverStoreDetailRows().filter(r=>!STATE.turnoverStore||r.store===STATE.turnoverStore),selectedExitMonth=STATE.turnoverExitMonth||turnoverLatestMonth(),map={weeklyNorm:weeklyNormExportRows(filteredRows(w.norm_rows||[],["region","store","bolge_muduru","sehir"]),activeNormTitles(w.norm_titles||[])),weeklyDiffs:filteredRows(w.position_diffs||[],["region","store","pozisyon"]),disabledCity:w.disabled_city||[],weeklyExits:filteredRows((w.exits||{}).rows||[],["store","ad_soyad","pozisyon"]),birthList:filteredRows(w.birth_list||[],["region","store","ad_soyad"]),weeklyFiili:weeklyFiiliFilteredRows(),turnoverEarly:buildEarlyTurnoverRows(),turnoverCumuleTitle:buildCumuleTitleTurnoverRows(),turnoverRegionExits:turnoverExitRows().filter(r=>r.month===selectedExitMonth),turnoverStoreDetail:storeDetail,turnoverFullData:turnoverRows(),storePromotions:filteredRows((DATA.promotion_tracking||{}).rows||[],["bolge","magaza","il","adi_soyadi","terfi_pozisyonu"]).filter(r=>!STATE.promotionRole||String(r.terfi_pozisyonu||"")===STATE.promotionRole),managerPromotionTurnover:((!STATE.promotionRole||norm(STATE.promotionRole).includes("magaza mudur"))?filteredRows((DATA.promotion_tracking||{}).manager_turnover_rows||[],["bolge","magaza","il","adi_soyadi"]):[]),managerPromotionCorrelation:(DATA.promotion_tracking||{}).manager_effect_correlation||[],riskRegions:(DATA.risk_tables||{}).regions||[],riskStores:(DATA.risk_tables||{}).stores||[],profileEmployees:filteredRows(DATA.weekly?.fiili_rows||[],["region","store","AD_SOYAD","POZISYON_ADI","UNVAN_ADI","LOKASYON","UST_BOLUM_ADI"]),profileOrg:filteredRows(DATA.org_tracking||[],["bolge","magaza","il","isim_soyisim","gorev","son_satis_akademisi","satis_akademisi_mezun","gelisim_yolculugu_durumu"])};if(map[key])downloadCsv(`${key}_${DATA.meta.latest_month}.csv`,map[key])}));renderAll();
  </script>
</body>
</html>
"""
def write_html(data: dict[str, Any], output_path: Path) -> None:
    json_text = json_for_html_script(data)
    html = repair_template_mojibake(HTML_TEMPLATE).replace("__DATA__", json_text)
    rd.atomic_write_text(output_path, html, encoding="utf-8")
    log(f"HTML üretildi: {output_path}")
def generate_magaza_takip_panel(
    xlsx_path: Path = DEFAULT_XLSX,
    output_path: Path = DEFAULT_OUTPUT,
    *,
    min_month: str = DEFAULT_MIN_MONTH,
    max_months: int = DEFAULT_MAX_MONTHS,
) -> Path:
    """Build the store follow-up panel through the shared production API."""
    xlsx_path = Path(xlsx_path)
    output_path = Path(output_path)
    if not xlsx_path.exists():
        raise FileNotFoundError(f"Excel bulunamadı: {xlsx_path}")
    data = build_magaza_data(xlsx_path, min_month=min_month, max_months=max_months)
    write_html(data, output_path)
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Bölge müdürleri için mağaza takip dashboard üreticisi")
    parser.add_argument("--xlsx", default=str(DEFAULT_XLSX), help="Kaynak icmal_sorgu_sonuc.xlsx yolu")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="Üretilecek HTML yolu")
    parser.add_argument("--min-month", default=DEFAULT_MIN_MONTH, help="Rapor veri başlangıç ayı, örn. 2025-01")
    parser.add_argument("--max-months", type=int, default=DEFAULT_MAX_MONTHS, help="Grafiklerde gösterilecek maksimum ay sayısı; 0 tüm 2025+ pencereyi kullanır")
    args = parser.parse_args()
    generate_magaza_takip_panel(
        Path(args.xlsx),
        Path(args.output),
        min_month=args.min_month,
        max_months=args.max_months,
    )
if __name__ == "__main__":
    main()
