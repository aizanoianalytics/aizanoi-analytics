"""Ortak veri hazırlama yardımcıları.

Akademi ve Performans dashboardları aynı sicil, metin, dönem ve aktif çalışan
kurallarını bu modülden kullanır. Hesaplama katmanının iki üreticide zamanla
farklılaşmasını önlemek için kaynak kolon eşleme burada merkezileştirilmiştir.
"""

from __future__ import annotations

import json
import math
import os
import re
import sys
import unicodedata
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import pandas as pd

from dashboard_paths import deterministic_build_time

__all__ = ["deterministic_build_time"]


def ensure_utf8_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)


ensure_utf8_stdio()


def log(message: str) -> None:
    stamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{stamp}] {message}", flush=True)


def clean_text(value: Any) -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return ""
    text = str(value).strip()
    if text.lower() in {"nan", "none", "nat", "<na>"}:
        return ""
    # Some legacy Excel exports carry Turkish CP1254 characters as their
    # Western-European lookalikes. Repeated question marks are also used by
    # the source systems as an invalid-character placeholder, not punctuation.
    text = text.translate(str.maketrans({"þ": "ş", "Þ": "Ş", "ý": "ı", "Ý": "İ"}))
    text = re.sub(r"\?{3,}", "", text)
    return " ".join(text.split())


def normalize_key(value: Any) -> str:
    text = clean_text(value).replace("ı", "i").replace("İ", "I").casefold()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char))
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text).split())


def sicil_key(value: Any) -> str:
    text = clean_text(value)
    if normalize_key(text) in {"", "nan", "none", "null", "n a", "yok"} or text in {"-", "—"}:
        return ""
    numeric_text = text.replace(" ", "").replace(",", ".")
    try:
        number = float(numeric_text)
        if math.isfinite(number) and number.is_integer():
            return str(int(number))
    except (TypeError, ValueError):
        pass
    return text


def first_col(frame: pd.DataFrame, candidates: Iterable[str]) -> str | None:
    if frame is None or frame.empty and len(frame.columns) == 0:
        return None
    direct = {str(col): str(col) for col in frame.columns}
    normalized = {normalize_key(col): str(col) for col in frame.columns}
    for candidate in candidates:
        if candidate in direct:
            return direct[candidate]
        match = normalized.get(normalize_key(candidate))
        if match:
            return match
    return None


def numeric(series: pd.Series | Any) -> pd.Series:
    if isinstance(series, pd.Series):
        if pd.api.types.is_numeric_dtype(series):
            return pd.to_numeric(series, errors="coerce")
        cleaned = series.astype("string").str.replace("\u00a0", "", regex=False).str.strip()
        comma_mask = cleaned.str.contains(",", na=False)
        cleaned = cleaned.where(
            ~comma_mask,
            cleaned.str.replace(".", "", regex=False).str.replace(",", ".", regex=False),
        )
        return pd.to_numeric(cleaned, errors="coerce")
    return pd.Series(dtype="float64")


def parse_datetime(values: Any) -> Any:
    """Parse mixed Excel/Turkish/ISO dates without ambiguous day-month warnings."""
    if isinstance(values, pd.Series):
        parsed = pd.to_datetime(values, errors="coerce", format="mixed", dayfirst=True)
        numeric_values = pd.to_numeric(values, errors="coerce")
        # Excel serial dates otherwise become nanoseconds after 1970 in pandas.
        excel_mask = numeric_values.between(20_000, 80_000, inclusive="both")
        if excel_mask.any():
            parsed = parsed.where(
                ~excel_mask,
                pd.to_datetime(numeric_values, unit="D", origin="1899-12-30", errors="coerce"),
            )
        return parsed
    if isinstance(values, (int, float, np.integer, np.floating)) and 20_000 <= float(values) <= 80_000:
        return pd.to_datetime(values, unit="D", origin="1899-12-30", errors="coerce")
    return pd.to_datetime(values, errors="coerce", format="mixed", dayfirst=True)


def month_key(values: pd.Series | Any) -> pd.Series:
    if isinstance(values, pd.Series):
        return parse_datetime(values).dt.strftime("%Y-%m")
    return pd.Series(dtype="string")


def safe_ratio(numerator: float, denominator: float) -> float | None:
    if denominator is None or not math.isfinite(float(denominator)) or float(denominator) <= 0:
        return None
    value = float(numerator) / float(denominator)
    return value if math.isfinite(value) else None


def read_sheet(xlsx_path: Path, sheet_name: str, **kwargs: Any) -> pd.DataFrame:
    log(f"Sheet okunuyor: {sheet_name}")
    try:
        return pd.read_excel(xlsx_path, sheet_name=sheet_name, **kwargs)
    except ValueError as exc:
        if "Worksheet named" in str(exc):
            log(f"UYARI: Sheet bulunamadı: {sheet_name}")
            return pd.DataFrame()
        raise


def canonical_scope(value: Any) -> str:
    key = normalize_key(value)
    if "magaza" in key:
        return "Mağaza"
    if "merkez" in key:
        return "Merkez"
    if "edirne" in key or "fabrika" in key:
        return "Edirne"
    return clean_text(value) or "Belirsiz"


def build_current_employees(fiili: pd.DataFrame) -> pd.DataFrame:
    columns = [
        "sicil", "ad_soyad", "tc_kimlik", "scope", "ust_bolum", "departman",
        "magaza", "bolge", "il", "title", "gorev", "unvan", "kadro",
        "engel", "ise_giris_tarihi", "dogum_tarihi", "yas", "kidem_yili", "cinsiyet", "yaka",
    ]
    if fiili is None or fiili.empty:
        return pd.DataFrame(columns=columns)

    mappings = {
        "sicil": ["P_NO", "sicil", "sicil_no", "Sicil No"],
        "ad_soyad": ["AD_SOYAD", "adi_soyadi", "Adı Soyadı", "ad_soyad"],
        "tc_kimlik": ["TC_KIMLIK", "tc_kimlik_no", "Tc Kimlik No"],
        "scope_raw": ["CALISAN_GRUP", "ust_bolum", "Üst Bölüm"],
        "ust_bolum": ["UST_BOLUM_ADI", "ust_bolum", "Üst Bölüm"],
        "departman": ["BOLUM_ADI", "departman", "Departman", "departman_adi"],
        "magaza": ["ISLETME_AD", "isletme_adi", "İşletme Adı", "LOKASYON"],
        "il": ["IL", "il", "Şehir"],
        "title": ["POZISYON_ADI", "pozisyon", "Pozisyon", "GOREV_ADI"],
        "gorev": ["GOREV_ADI", "gorev", "Görev", "POZISYON_ADI"],
        "unvan": ["UNVAN_ADI", "unvan", "Ünvan"],
        "kadro": ["kadro_adı", "kadro_adi", "Kadro Adı"],
        "engel": ["ENGEL_STATUSU", "engel_durumu", "Engel Durumu"],
        "ise_giris_tarihi": ["ILK_BASLAMA_TARIHI", "ise_giris_tarihi", "İşe Giriş Tarihi"],
        "dogum_tarihi": ["DOGUM_TARIHI", "dogum_tarihi", "Doğum Tarihi"],
        "kidem_yili": ["KIDEM_YILI", "kidem_yil", "kidem_yili"],
        "cinsiyet": ["CINSIYET", "cinsiyet"],
        "yaka": ["YAKA", "beyaz_mavi_yaka", "Beyaz/Mavi Yaka"],
    }
    source_cols = {key: first_col(fiili, candidates) for key, candidates in mappings.items()}
    if not source_cols["sicil"]:
        return pd.DataFrame(columns=columns)

    out = pd.DataFrame(index=fiili.index)
    for key, source_col in source_cols.items():
        out[key] = fiili[source_col] if source_col else None
    out["sicil"] = out["sicil"].map(sicil_key)
    out = out[out["sicil"].ne("")].copy()
    for col in ["ad_soyad", "ust_bolum", "departman", "magaza", "il", "title", "gorev", "unvan", "kadro", "engel", "cinsiyet", "yaka"]:
        out[col] = out[col].map(clean_text)
    out["scope"] = out["scope_raw"].map(canonical_scope)
    known_scope = out["scope"].isin({"Mağaza", "Merkez", "Edirne"})
    store_mask = (
        out["magaza"].str.casefold().str.contains(r"\.gs\.", regex=True, na=False)
        | out["ust_bolum"].map(normalize_key).str.startswith("bolge", na=False)
    )
    edirne_mask = (
        out["magaza"].map(normalize_key).str.contains(r"edirne|fabrika", regex=True, na=False)
        | out["ust_bolum"].map(normalize_key).str.contains(r"edirne|fabrika", regex=True, na=False)
    )
    center_mask = (
        out["magaza"].map(normalize_key).str.contains("merkez", regex=False, na=False)
        | out["ust_bolum"].map(normalize_key).str.contains("merkez", regex=False, na=False)
    )
    out.loc[~known_scope & store_mask, "scope"] = "Mağaza"
    out.loc[~known_scope & ~store_mask & edirne_mask, "scope"] = "Edirne"
    out.loc[~known_scope & ~store_mask & ~edirne_mask & center_mask, "scope"] = "Merkez"
    out.loc[~out["scope"].isin({"Mağaza", "Merkez", "Edirne"}), "scope"] = "Belirsiz"
    out["bolge"] = np.where(out["scope"].eq("Mağaza"), out["ust_bolum"], "")
    out["ise_giris_tarihi"] = parse_datetime(out["ise_giris_tarihi"])
    out["dogum_tarihi"] = parse_datetime(out["dogum_tarihi"])
    today = pd.Timestamp(deterministic_build_time()).tz_localize(None).normalize()
    out["yas"] = ((today - out["dogum_tarihi"]).dt.days / 365.25).where(out["dogum_tarihi"].notna())
    out["kidem_yili"] = numeric(out["kidem_yili"])
    out = out.sort_values(["sicil", "ise_giris_tarihi"], na_position="first").drop_duplicates("sicil", keep="last")
    return out[[col for col in columns if col in out.columns]].reset_index(drop=True)


def employee_lookup(employees: pd.DataFrame) -> dict[str, dict[str, Any]]:
    if employees is None or employees.empty:
        return {}
    return employees.set_index("sicil", drop=False).to_dict("index")


def clean_status(value: Any) -> str:
    key = normalize_key(value)
    # Muafiyet payda kuralını değiştirir; birleşik metinlerde tamamlanmadan önce değerlendirilmelidir.
    if "muaf" in key:
        return "Muaf"
    if "tamamladi" in key or key == "tamamlandi":
        return "Tamamladı"
    if "devam" in key:
        return "Devam Ediyor"
    if "baslamadi" in key or "baslanmadi" in key:
        return "Başlamadı"
    if "katilmadi" in key:
        return "Katılmadı"
    if "katildi" in key:
        return "Katıldı"
    return clean_text(value) or "Belirsiz"


def score_band(score: float | None) -> str:
    if score is None or not math.isfinite(float(score)):
        return "Hesaplanamadı"
    if score >= 85:
        return "Güçlü"
    if score >= 70:
        return "İzlemeli"
    return "Aksiyon"


def weighted_available_score(components: dict[str, float | None], weights: dict[str, float]) -> tuple[float | None, int]:
    usable = {
        key: max(0.0, min(100.0, float(value)))
        for key, value in components.items()
        if value is not None and math.isfinite(float(value)) and weights.get(key, 0) > 0
    }
    denominator = sum(weights[key] for key in usable)
    if denominator <= 0:
        return None, 0
    return sum(usable[key] * weights[key] for key in usable) / denominator, len(usable)


def json_safe(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [json_safe(item) for item in value]
    if isinstance(value, (pd.Timestamp, datetime, date)):
        if pd.isna(value):
            return None
        return value.isoformat()
    if isinstance(value, pd.Period):
        return str(value)
    if value is pd.NA or (isinstance(value, (float, np.floating)) and not math.isfinite(float(value))):
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    if isinstance(value, (np.bool_,)):
        return bool(value)
    return value


def escape_json_for_html_script(raw_json: str) -> str:
    """Make JSON safe inside a ``<script type="application/json">`` block.

    Escaping ``<`` is the important part: otherwise a value containing
    ``</script>`` can terminate the script tag early. Turkish characters stay
    untouched because ``ensure_ascii=False`` is still used by callers.
    """

    return (
        raw_json.replace("&", "\\u0026")
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("\u2028", "\\u2028")
        .replace("\u2029", "\\u2029")
    )


def json_for_html_script(value: Any) -> str:
    raw_json = json.dumps(json_safe(value), ensure_ascii=False, separators=(",", ":"))
    return escape_json_for_html_script(raw_json)


def write_single_file_html(output_path: Path, template: str, payload: dict[str, Any], marker: str = "__DATA__") -> None:
    data_json = json_for_html_script(payload)
    html = template.replace(marker, data_json)
    if marker in html:
        raise RuntimeError(f"HTML veri işaretçisi değiştirilemedi: {marker}")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = output_path.with_name(f".{output_path.name}.{os.getpid()}.tmp")
    temp_path.write_text(html, encoding="utf-8")
    if temp_path.stat().st_size < 10_000 or "</html>" not in html[-300:].lower():
        temp_path.unlink(missing_ok=True)
        raise RuntimeError(f"HTML çıktısı eksik görünüyor: {output_path.name}")
    os.replace(temp_path, output_path)
    log(f"Çıktı üretildi: {output_path.name} ({output_path.stat().st_size / (1024 * 1024):,.2f} MB)")
