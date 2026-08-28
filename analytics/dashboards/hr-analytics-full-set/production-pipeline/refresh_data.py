from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import time
import unicodedata
from decimal import Decimal, InvalidOperation
from datetime import date, datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Iterable

from dashboard_paths import ICMAL_XLSX, IK_DASHBOARD, LOG_DIR, PROJECT_ROOT

import numpy as np
import pandas as pd


BASE_DIR = PROJECT_ROOT
DEFAULT_XLSX = ICMAL_XLSX
TEMPLATE_HTML = BASE_DIR / "aylik_sunum.html"
OUTPUT_HTML = IK_DASHBOARD
PROGRESS_LOG = LOG_DIR / "refresh_data_progress.log"


def atomic_write_text(path: Path, text: str, *, encoding: str = "utf-8") -> None:
    """Write a large text artifact without exposing a partially written target."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        temp_path.write_text(text, encoding=encoding)
        temp_path.replace(path)
    finally:
        if temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass


MOJIBAKE_MAP = {
    "MaÃ°aza": "Mağaza",
    "maÃ°aza": "mağaza",
    "Maðaza": "Mağaza",
    "maðaza": "mağaza",
    "MAÐAZA": "MAĞAZA",
    "þ": "ş",
    "Þ": "Ş",
    "ð": "ğ",
    "Ð": "Ğ",
    "ý": "ı",
    "Ý": "İ",
    "Ä°": "İ",
    "Ä±": "ı",
    "ÄŸ": "ğ",
    "ÅŸ": "ş",
    "Ã‡": "Ç",
    "Ã§": "ç",
    "Ã–": "Ö",
    "Ã¶": "ö",
    "Ãœ": "Ü",
    "Ã¼": "ü",
}

TEXT_PHRASE_FIXES = [
    ("cret ve Yan Haklar", "Ücret ve Yan Haklar"),
    ("cret ve yan haklar", "Ücret ve Yan Haklar"),
    ("Belirsiz Sureli", "Belirsiz Süreli"),
    ("Belirli Sureli", "Belirli Süreli"),
    ("Belirsiz Sreli", "Belirsiz Süreli"),
    ("Belirli Sreli", "Belirli Süreli"),
    ("Sozlesme", "Sözleşme"),
    ("Ayrilma", "Ayrılma"),
    ("Secili", "Seçili"),
    ("Aurelia", "Aurelia"),
    ("Hangi Sektore Gecmeyi Planliyorsunuz?", "Hangi Sektöre Geçmeyi Planlıyorsunuz?"),
    ("Yeni pozisyonunuz, su anki pozisyonunuza gore hangi seviyededir?", "Yeni pozisyonunuz, şu anki pozisyonunuza göre hangi seviyededir?"),
    ("Aurelia'u cevrenize tavsiye eder misiniz?", "Aurelia'u çevrenize tavsiye eder misiniz?"),
    ("Gelecekte yeniden calisma firsatiniz olsa, Aurelia ile tekrar calismayi tercih eder misiniz?", "Gelecekte yeniden çalışma fırsatınız olsa, Aurelia ile tekrar çalışmayı tercih eder misiniz?"),
    ("Secili Ay - Top 3 nedenin detay seenekleri", "Seçili Ay - Top 3 nedenin detay seçenekleri"),
    ("Seili Ay", "Seçili Ay"),
    ("nceki Ay", "Önceki Ay"),
    ("nceki Yıl", "Önceki Yıl"),
    ("Genel - Top 3 nedenin detay seenekleri", "Genel - Top 3 nedenin detay seçenekleri"),
    ("Alt Kademe Ynetici", "Alt Düzey"),
    ("Orta Kademe Ynetici", "Orta Düzey"),
    ("st Kademe Ynetici", "Üst Düzey"),
    ("Ust Kademe Yonetici", "Üst Düzey"),
    ("Ynetici", "Yönetici"),
    ("Ynetim Seviyesi", "Yönetim Seviyesi"),
    ("st Blm", "Üst Bölüm"),
    ("st Blm Detayi", "Üst Bölüm Detayı"),
    ("st Blm Detayı", "Üst Bölüm Detayı"),
    ("10 Gnden Az", "10 Günden Az"),
    ("10 Gn - 2 Ay", "10 Gün - 2 Ay"),
    ("Yneticiden Kaynaklanan Nedenler", "Yöneticiden Kaynaklanan Nedenler"),
    ("Title secin", "Title seçin"),
    ("Title sein", "Title seçin"),
    ("Gun secin", "Gün seçin"),
    ("Temiz Net Gelir", "Net Gelir"),
    ("temiz net gelir", "net gelir"),
    ("Ortalama Temiz Net Gelir", "Ortalama Net Gelir"),
]

TEXT_WORD_FIXES = [
    ("magaza", "mağaza"),
    ("bolge", "bölge"),
    ("blge", "bölge"),
    ("cret", "ücret"),
    ("ucret", "ücret"),
    ("sozlesme", "sözleşme"),
    ("sureli", "süreli"),
    ("sreli", "süreli"),
    ("cikis", "çıkış"),
    ("ayrilma", "ayrılma"),
    ("secili", "seçili"),
    ("seili", "seçili"),
    ("secenek", "seçenek"),
    ("seenek", "seçenek"),
    ("seenekleri", "seçenekleri"),
    ("yonetici", "yönetici"),
    ("ynetici", "yönetici"),
    ("gecmeyi", "geçmeyi"),
    ("sektore", "sektöre"),
    ("calisma", "çalışma"),
    ("calismayi", "çalışmayı"),
    ("calisan", "çalışan"),
    ("cevrenize", "çevrenize"),
    ("firsatiniz", "fırsatınız"),
    ("gore", "göre"),
    ("mudur", "müdür"),
    ("muduru", "müdürü"),
    ("yardimci", "yardımcı"),
    ("yardimcisi", "yardımcısı"),
    ("planliyorsunuz", "planlıyorsunuz"),
    ("kumulatif", "kümülatif"),
    ("duzey", "düzey"),
    ("yonetim", "yönetim"),
    ("yoneticiden", "yöneticiden"),
    ("tumu", "tümü"),
    ("kmlatif", "kümülatif"),
    ("kmlatid", "kümülatif"),
    ("nceki", "önceki"),
]

TEXT_FIX_TRIGGER_RE = re.compile(
    r"(Ã|Ä|Å|Â|ð|Ð|þ|Þ|ý|Ý|magaza|aurelia|ucret|cret|sozlesme|sureli|sreli|cikis|ayrilma|secili|seili|secenek|seenek|yonetici|ynetici|gecmeyi|sektore|calisma|calismayi|calisan|cevrenize|firsatiniz|gore|mudur|muduru|yardimci|yardimcisi|planliyorsunuz|kumulatif|duzey|kmlatif|kmlatid|nceki|st\s+kademe|temiz\s+net\s+gelir)",
    re.IGNORECASE,
)

HTML_MOJIBAKE_MAP = {
    **MOJIBAKE_MAP,
    "Â·": "·",
    "âœ¦": "✦",
    "â€”": "—",
    "â€“": "–",
    "Â": "",
    "Ã‚": "",
}

TURKISH_ASCII_MAP = str.maketrans(
    {
        "ı": "i",
        "İ": "i",
        "ğ": "g",
        "Ğ": "g",
        "ş": "s",
        "Ş": "s",
        "ç": "c",
        "Ç": "c",
        "ö": "o",
        "Ö": "o",
        "ü": "u",
        "Ü": "u",
        "ð": "g",
        "Ð": "g",
    }
)

MAGAZA_KIRILIM_COL = "magaza_kırılım"

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

MONTH_NAMES_TR = [
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
]

TR_LOWER_MAP = str.maketrans({"I": "ı", "İ": "i"})
TR_UPPER_MAP = str.maketrans({"i": "İ", "ı": "I"})

def _repair_utf8_mojibake(text: str) -> str:
    out = text
    # Some source files arrive as UTF-8 bytes decoded as cp1252/cp1254.
    for _ in range(2):
        if not any(ch in out for ch in ("Ã", "Ä", "Å")):
            break
        try:
            repaired = out.encode("latin1").decode("utf-8")
        except Exception:
            break
        if repaired == out:
            break
        out = repaired
    return out


def _tr_lower(text: str) -> str:
    return text.translate(TR_LOWER_MAP).lower()


def _tr_upper(text: str) -> str:
    return text.translate(TR_UPPER_MAP).upper()


def _tr_title(text: str) -> str:
    parts = re.split(r"(\s+)", text)
    out: list[str] = []
    for part in parts:
        if not part or part.isspace():
            out.append(part)
            continue
        lower = _tr_lower(part)
        out.append(_tr_upper(lower[:1]) + lower[1:])
    return "".join(out)


def _is_upper_word(text: str) -> bool:
    letters = [ch for ch in text if ch.isalpha()]
    return bool(letters) and all(ch == _tr_upper(ch) for ch in letters)


def _is_title_text(text: str) -> bool:
    words = [w for w in text.split() if any(ch.isalpha() for ch in w)]
    if not words:
        return False
    for word in words:
        lower = _tr_lower(word)
        if _tr_upper(lower[:1]) + lower[1:] != word:
            return False
    return True


def _match_case(src: str, repl: str) -> str:
    if not src:
        return repl
    if _is_upper_word(src):
        return _tr_upper(repl)
    if _is_title_text(src):
        return _tr_title(repl)
    if src[:1] == _tr_upper(src[:1]):
        return _tr_upper(repl[:1]) + repl[1:]
    return repl


WORD_BOUNDARY_CHARS = r"A-Za-z0-9_ÇĞİIÖŞÜçğıöşü"


def _word_boundary_pattern(term: str) -> re.Pattern[str]:
    return re.compile(rf"(?<![{WORD_BOUNDARY_CHARS}]){re.escape(term)}(?![{WORD_BOUNDARY_CHARS}])", re.IGNORECASE)


def _normalize_display_text(text: str) -> str:
    out = unicodedata.normalize("NFC", text).replace("\xa0", " ")
    # Kaynak Excel'lerde bazen bozuk encoding artığı olarak "??????" kalıyor.
    # Tek soru işaretlerine dokunmuyoruz; yalnızca placeholder gibi duran tekrarları temizliyoruz.
    if "???" in out:
        out = re.sub(r"\?{3,}", "", out)
        out = re.sub(r"\s{2,}", " ", out).strip()
    return out


def _repair_common_turkish_text(text: str) -> str:
    out = text
    for bad, good in TEXT_PHRASE_FIXES:
        pattern = _word_boundary_pattern(bad)
        out = pattern.sub(lambda m: _match_case(m.group(0), good), out)
    out = _word_boundary_pattern("st Kademe").sub("Üst Kademe", out)
    out = _word_boundary_pattern("st kademe").sub("üst kademe", out)
    for bad, good in TEXT_WORD_FIXES:
        pattern = _word_boundary_pattern(bad)
        out = pattern.sub(lambda m: _match_case(m.group(0), good), out)
    return out


@lru_cache(maxsize=50000)
def _fix_text_cached(val: str) -> str:
    out = _repair_utf8_mojibake(val)
    for bad, good in MOJIBAKE_MAP.items():
        if bad in out:
            out = out.replace(bad, good)
    out = _repair_common_turkish_text(out)
    return _normalize_display_text(out)


def fix_text(val: object) -> object:
    if not isinstance(val, str):
        return val
    return _fix_text_cached(val)


def normalize_person_name(val: object) -> str | None:
    if _is_null(val):
        return None
    text = re.sub(r"\s+", " ", str(fix_text(val))).strip()
    if not text:
        return None

    token_fixes = {
        "cakmak": "\u00e7akmak",
        "gunduz": "g\u00fcnd\u00fcz",
        "gndz": "g\u00fcnd\u00fcz",
        "yucel": "y\u00fccel",
        "ycel": "y\u00fccel",
        "ozturk": "\u00f6zt\u00fcrk",
        "oztas": "\u00f6zta\u015f",
        "hasturk": "hast\u00fcrk",
        "demir": "demir",
        "demiriz": "demiriz",
        "naile": "naile",
        "rabia": "rabia",
        "adile": "adile",
        "akile": "akile",
        "didar": "didar",
        "ors": "\u00f6rs",
    }

    token_pattern = re.compile(
        r"^([^\w\u00C7\u011E\u0130I\u00D6\u015E\u00DC\u00E7\u011F\u0131\u00F6\u015F\u00FC]*)"
        r"([A-Za-z\u00C7\u011E\u0130I\u00D6\u015E\u00DC\u00E7\u011F\u0131\u00F6\u015F\u00FC]+)"
        r"([^\w\u00C7\u011E\u0130I\u00D6\u015E\u00DC\u00E7\u011F\u0131\u00F6\u015F\u00FC]*)$"
    )

    def normalize_token(token: str) -> str:
        if not token or token.isspace():
            return token
        match = token_pattern.match(token)
        if not match:
            return token
        prefix, core, suffix = match.groups()
        key = normalize_key(core)
        canonical = token_fixes.get(key)
        letters = "".join(ch for ch in core if ch.isalpha())
        if canonical:
            if letters and (letters == _tr_upper(letters) or letters == _tr_lower(letters)):
                fixed = _tr_title(canonical)
            else:
                fixed = _match_case(core, canonical)
            return prefix + fixed + suffix
        if letters and (letters == _tr_upper(letters) or letters == _tr_lower(letters)):
            return prefix + _tr_title(core) + suffix
        return token

    text = "".join(normalize_token(part) if not part.isspace() else part for part in re.split(r"(\s+)", text))
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return None
    letters = "".join(ch for ch in text if ch.isalpha())
    if letters and (letters == _tr_upper(letters) or letters == _tr_lower(letters)):
        return _tr_title(text)
    return text


def _display_text_score(val: object) -> int:
    if _is_null(val):
        return -1
    text = str(val).strip()
    if not text:
        return -1
    turkish_bonus = sum(ch in "\u00c7\u011e\u0130I\u00d6\u015e\u00dc\u00e7\u011f\u0131i\u00f6\u015f\u00fc" for ch in text) * 4
    alpha_score = sum(ch.isalpha() for ch in text)
    penalty = text.count("?") * 6 + text.count("\ufffd") * 8
    return alpha_score + turkish_bonus - penalty


def choose_preferred_display_text(current: object, candidate: object) -> str | None:
    current_text = normalize_person_name(current)
    candidate_text = normalize_person_name(candidate)
    if not current_text:
        return candidate_text
    if not candidate_text:
        return current_text
    return candidate_text if _display_text_score(candidate_text) >= _display_text_score(current_text) else current_text


def clean_html_mojibake(html: str) -> str:
    out = html
    for _ in range(2):
        repaired = _repair_utf8_mojibake(out)
        if repaired == out:
            break
        out = repaired
    for bad, good in HTML_MOJIBAKE_MAP.items():
        out = out.replace(bad, good)
    return out


def normalize_ust_bolum(val: object) -> str | None:
    if pd.isna(val):
        return None
    text = normalize_key(val)
    if "magaza" in text:
        return "Mağaza"
    if "merkez" in text:
        return "Merkez"
    if "edirne" in text:
        return "Edirne"
    return str(fix_text(val)).strip().title()


def normalize_gender(val: object) -> str | None:
    if pd.isna(val):
        return None
    text = normalize_key(val)
    if text in {"k", "kadin", "bayan"}:
        return "Kadın"
    if text in {"e", "erkek"}:
        return "Erkek"
    return str(fix_text(val)).strip().title()


def normalize_collar(val: object) -> str | None:
    if pd.isna(val):
        return None
    fixed = str(fix_text(val)).strip()
    text = fixed.lower()
    key = normalize_key(fixed)
    if "beyaz" in text or key == "memur":
        return "Beyaz Yaka"
    if "mavi" in text or key == "isci":
        return "Mavi Yaka"
    return fixed.title()


def normalize_contract(val: object) -> str | None:
    if pd.isna(val):
        return None
    text = normalize_key(val)
    if text == "memur":
        return "Beyaz Yaka"
    if text == "isci":
        return "Mavi Yaka"
    if "belirsiz" in text:
        return "Belirsiz Süreli"
    if "belirli" in text:
        return "Belirli Süreli"
    if "part" in text:
        return "Part Time Personel"
    if "uretim" in text:
        return "Üretim"
    return str(fix_text(val)).strip().title()


def normalize_key(val: object) -> str:
    if pd.isna(val):
        return ""
    text = str(fix_text(val)).strip()
    text = text.translate(TURKISH_ASCII_MAP)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower()
    return " ".join(text.split())


def fixed_term_mask(frame: pd.DataFrame, columns: Iterable[str]) -> pd.Series:
    """Identify fixed-term staff from every available role/staff descriptor."""
    available = [col for col in columns if col in frame.columns]
    if not available:
        return pd.Series(False, index=frame.index)
    combined = (
        frame[available]
        .fillna("")
        .astype(str)
        .agg(" ".join, axis=1)
        .apply(normalize_key)
    )
    return combined.str.contains(r"\bbelirli sureli\b", regex=True, na=False)


def normalize_common_label(text: str) -> str:
    key = normalize_key(text)
    common_map = {
        "cret ve yan haklar": "Ücret ve Yan Haklar",
        "ucret ve yan haklar": "Ücret ve Yan Haklar",
        "kisisel nedenler": "Kişisel Nedenler",
        "yoneticiden kaynaklanan nedenler": "Yöneticiden Kaynaklanan Nedenler",
        "sozlesme turu": "Sözleşme Türü",
        "yonetim seviyesi": "Yönetim Seviyesi",
        "ust bolum": "Üst Bölüm",
        "st blm": "Üst Bölüm",
        "10 gunden az": "10 Günden Az",
        "10 gun 2 ay": "10 Gün - 2 Ay",
        "bolge": "Bölge",
        "blge": "Bölge",
        "belirsiz sreli": "Belirsiz Süreli",
        "belirli sreli": "Belirli Süreli",
        "alt kademe ynetici": "Alt Düzey",
        "orta kademe ynetici": "Orta Düzey",
        "st kademe ynetici": "Üst Düzey",
        "ust kademe yonetici": "Üst Düzey",
        "orta kademe yonetici": "Orta Düzey",
        "alt kademe yonetici": "Alt Düzey",
    }
    if key in common_map:
        return common_map[key]
    return text


def find_first_col(df: pd.DataFrame, candidates: list[str]) -> str | None:
    for c in candidates:
        if c in df.columns:
            return c
    return None


def to_month(series: pd.Series) -> pd.Series:
    dt = pd.to_datetime(series, errors="coerce")
    period = dt.dt.to_period("M")
    # Keep nulls as nulls instead of leaking "NaT" strings.
    return period.astype("string").where(period.notna(), None)


def prev_month(month_str: str) -> str:
    try:
        return str(pd.Period(month_str, freq="M") - 1)
    except Exception:
        return month_str


def add_month(month_str: str, offset: int) -> str:
    try:
        return str(pd.Period(month_str, freq="M") + offset)
    except Exception:
        return month_str


def numeric(series: pd.Series) -> pd.Series:
    if isinstance(series, pd.Series):
        raw = series.copy()
    else:
        raw = pd.Series(series)

    if pd.api.types.is_numeric_dtype(raw):
        return pd.to_numeric(raw, errors="coerce")

    as_text = (
        raw.astype("string")
        .str.replace("\xa0", "", regex=False)
        .str.replace("TL", "", regex=False)
        .str.replace("₺", "", regex=False)
        .str.replace("%", "", regex=False)
        .str.replace(" ", "", regex=False)
    )

    both_mask = as_text.str.contains(r"\.", na=False) & as_text.str.contains(",", na=False)
    comma_only_mask = ~both_mask & as_text.str.contains(",", na=False)

    normalized = as_text.copy()
    normalized.loc[both_mask] = (
        normalized.loc[both_mask]
        .str.replace(".", "", regex=False)
        .str.replace(",", ".", regex=False)
    )
    normalized.loc[comma_only_mask] = normalized.loc[comma_only_mask].str.replace(",", ".", regex=False)

    return pd.to_numeric(normalized, errors="coerce")


def safe_sum(series: pd.Series) -> float:
    return float(numeric(series).fillna(0).sum())


def safe_div(num: float, denom: float) -> float | None:
    if denom in (0, 0.0, None) or pd.isna(denom):
        return None
    return float(num) / float(denom)


def filter_df_from_month(df: pd.DataFrame, min_month: str | None) -> pd.DataFrame:
    if df is None or df.empty or not min_month:
        return df
    work = df.copy()
    if "month" in work.columns:
        month_series = work["month"].astype("string")
        return work[month_series >= str(min_month)].copy()
    if "donem" in work.columns:
        month_series = to_month(pd.to_datetime(work["donem"], errors="coerce"))
        return work[month_series >= str(min_month)].copy()
    return work


def pick_denominator(group: pd.DataFrame) -> tuple[float, str]:
    """Preferred denominator order: unique sicil -> sum(calisan_sayisi) -> row_count."""
    if "sicil_no" in group.columns:
        sicil_cnt = float(group["sicil_no"].dropna().nunique())
        if sicil_cnt > 0:
            return sicil_cnt, "sicil_no"
    if "calisan_sayisi" in group.columns:
        calisan_sum = safe_sum(group["calisan_sayisi"])
        if calisan_sum > 0:
            return float(calisan_sum), "calisan_sayisi"
    return float(len(group)), "row_count"


def normalize_store_breakdown(val: object) -> str:
    if pd.isna(val):
        return "Diğer"
    txt = str(fix_text(val)).strip()
    return txt if txt else "Diğer"


def is_part_time_label(val: object) -> bool:
    key = normalize_key(val)
    return "part" in key and "time" in key


def income_denominator(group: pd.DataFrame, label: object = None) -> tuple[float, str]:
    if "sgk_gun" in group.columns:
        sgk_total = safe_sum(group["sgk_gun"])
        if is_part_time_label(label):
            part_time_equiv = safe_div(sgk_total, 16)
            if part_time_equiv and part_time_equiv > 0:
                return float(part_time_equiv), "sgk_gun/16"
        full_time_equiv = safe_div(sgk_total, 30)
        if full_time_equiv and full_time_equiv > 0:
            return float(full_time_equiv), "sgk_gun/30"
    return pick_denominator(group)


def wage_hakedis_total(group: pd.DataFrame, label: object = None) -> float:
    """
    `ucret` alanı bazı rollerde saatlik/günlük, bazı rollerde aylık geliyor.
    Tek formül kullanmak özellikle mağaza rollerinde ücret hakedişini yapay biçimde
    düşürebildiği için hesap mantığını ücret türüne göre seçiyoruz.
    """
    if "ucret" not in group.columns or "sgk_gun" not in group.columns:
        return 0.0
    return float(_compute_wage_hakedis_series(group, label).sum())


def _compute_wage_hakedis_series(group: pd.DataFrame, label: object = None) -> pd.Series:
    if group is None or group.empty:
        return pd.Series(dtype=float)

    work = group.copy()
    work["ucret"] = numeric(work.get("ucret", 0)).fillna(0)
    work["sgk_gun"] = numeric(work.get("sgk_gun", 0)).fillna(0)
    work["kasa_tazminati"] = numeric(work.get("kasa_tazminati", 0)).fillna(0)

    type_key = ""
    if "ucret_turu" in work.columns:
        type_samples = (
            work["ucret_turu"]
            .dropna()
            .astype(str)
            .map(normalize_key)
            .loc[lambda s: s != ""]
        )
        if not type_samples.empty:
            type_key = type_samples.mode().iat[0]

    positive_ucret = work.loc[work["ucret"] > 0, "ucret"]
    median_ucret = float(positive_ucret.median()) if not positive_ucret.empty else 0.0

    if "saat" in type_key or is_part_time_label(label):
        basis = "hourly"
    elif 0 < median_ucret < 1000:
        basis = "daily"
    elif "gun" in type_key:
        basis = "daily"
    elif any(token in type_key for token in ("ay", "aylik", "maas", "monthly")):
        basis = "monthly"
    else:
        basis = "monthly"

    if basis == "hourly":
        return (work["ucret"] * 8 * work["sgk_gun"]).fillna(0)
    if basis == "daily":
        return ((work["ucret"] * work["sgk_gun"]) + work["kasa_tazminati"]).fillna(0)
    return (((work["ucret"] / 30) * work["sgk_gun"]) + work["kasa_tazminati"]).fillna(0)


def management_level_order(level: object) -> tuple[int, str]:
    if pd.isna(level):
        return (999, "")
    txt = str(fix_text(level)).strip()
    key = normalize_key(txt)
    order_rules = [
        ("ust duzey", 10),
        ("ust kademe", 10),
        ("direktor", 10),
        ("genel mudur", 10),
        ("orta duzey", 20),
        ("orta kademe", 20),
        ("mudur", 20),
        ("alt duzey", 30),
        ("alt kademe", 30),
        ("yonetici", 30),
        ("uzman", 40),
        ("stajyer", 50),
        ("asistan", 50),
        ("sorumlu", 50),
        ("supervisor", 50),
        ("sef", 50),
        ("yonetim kurulu", 60),
    ]
    for token, idx in order_rules:
        if token in key:
            return (idx, key)
    return (900, key)


def dist_table(df: pd.DataFrame, group_col: str, value_col: str, key: str) -> list[dict]:
    if group_col not in df.columns or value_col not in df.columns:
        return []
    grp = df.groupby(group_col)[value_col].sum(min_count=1)
    grp = grp.dropna()
    total = float(grp[grp > 0].sum()) if not grp.empty else 0.0
    out = []
    for label, value in grp.items():
        if pd.isna(label) or str(label).strip() == "":
            continue
        count = float(value) if not pd.isna(value) else 0.0
        share = count / total if total else 0.0
        out.append({key: fix_text(label), "count": count, "share": share})
    out.sort(key=lambda x: x.get("count", 0), reverse=True)
    return out


def _is_null(obj: object) -> bool:
    if obj is None:
        return True
    try:
        return bool(pd.isna(obj))
    except (TypeError, ValueError):
        return False


def sanitize(obj: object) -> object:
    if _is_null(obj):
        return None
    if isinstance(obj, str):
        return _normalize_display_text(str(obj))
    if isinstance(obj, dict):
        return {str(k): sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize(v) for v in obj]
    if isinstance(obj, (np.integer, np.int64)):
        return int(obj)
    if isinstance(obj, (np.floating, np.float64)):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return float(obj)
    if isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    if isinstance(obj, float):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return obj
    if isinstance(obj, (np.datetime64,)):
        try:
            return pd.to_datetime(obj).strftime("%Y-%m-%d")
        except Exception:
            return None
    if isinstance(obj, pd.Timestamp):
        return obj.strftime("%Y-%m-%d")
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, pd.Period):
        return str(obj)
    return obj


def normalize_text_payload(obj: object) -> object:
    if isinstance(obj, str):
        return fix_text(obj)
    if isinstance(obj, dict):
        return {k: normalize_text_payload(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [normalize_text_payload(v) for v in obj]
    if isinstance(obj, tuple):
        return tuple(normalize_text_payload(v) for v in obj)
    return obj


_TECHNICAL_COL_RE = re.compile(r"^[A-Za-z0-9_ığüşöçİĞÜŞÖÇ]+$")


def normalize_column_name(col: object) -> str:
    text = str(col or "").strip()
    if not text:
        return ""
    repaired = _repair_utf8_mojibake(text).replace("\xa0", " ").strip()
    if _TECHNICAL_COL_RE.fullmatch(repaired):
        return unicodedata.normalize("NFC", repaired)
    return str(fix_text(repaired))


def fix_dataframe_turkish(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        return df
    fixed = df.copy()
    fixed.columns = [normalize_column_name(col) for col in fixed.columns]
    for col in fixed.columns:
        if not (pd.api.types.is_object_dtype(fixed[col]) or pd.api.types.is_string_dtype(fixed[col])):
            continue
        needs_fix = False
        try:
            series = fixed[col].dropna().astype(str)
            if not series.empty:
                checkpoints = list(range(0, len(series), 2000)) or [0]
                for start in checkpoints:
                    sample = series.iloc[start:start + 120].str.cat(sep=" ")
                    if sample and TEXT_FIX_TRIGGER_RE.search(sample):
                        needs_fix = True
                        break
        except Exception:
            needs_fix = False
        if needs_fix:
            fixed[col] = fixed[col].apply(fix_text)
        else:
            fixed[col] = fixed[col].apply(
                lambda v: _normalize_display_text(v) if isinstance(v, str) else v
            )
    return fixed


def read_sheet(xl: pd.ExcelFile, name: str, usecols: list[str] | None = None) -> pd.DataFrame:
    if name not in xl.sheet_names:
        log_step(f"  UYARI: '{name}' sheet'i bulunamadı.")
        return pd.DataFrame()
    try:
        df = pd.read_excel(xl, sheet_name=name, usecols=usecols)
        return fix_dataframe_turkish(df)
    except (FileNotFoundError, PermissionError, ValueError, pd.errors.EmptyDataError) as exc:
        log_step(f"  HATA: '{name}' sheet'i okunamadı ({type(exc).__name__}): {exc}")
        return pd.DataFrame()
    except Exception as exc:
        log_step(f"  BEKLENMEYEN HATA: '{name}' sheet'i okunamadı ({type(exc).__name__}): {exc}")
        return pd.DataFrame()


def read_external_first_sheet(path: Path) -> pd.DataFrame:
    if not path.exists():
        log_step(f"  UYARI: '{path.name}' bulunamadı; harici kaynak atlandı.")
        return pd.DataFrame()
    try:
        df = pd.read_excel(path, sheet_name=0)
        return fix_dataframe_turkish(df)
    except (FileNotFoundError, PermissionError, ValueError, pd.errors.EmptyDataError) as exc:
        log_step(f"  HATA: '{path.name}' okunamadı ({type(exc).__name__}): {exc}")
        return pd.DataFrame()
    except Exception as exc:
        log_step(f"  BEKLENMEYEN HATA: '{path.name}' okunamadı ({type(exc).__name__}): {exc}")
        return pd.DataFrame()


def normalize_sicil_key(value: object) -> str | None:
    if _is_null(value):
        return None
    text = str(value).strip()
    if not text or text.lower() in {"nan", "nat", "none"}:
        return None
    if isinstance(value, (int, np.integer)):
        return str(int(value))
    if isinstance(value, (float, np.floating)):
        if not np.isfinite(value):
            return None
        if float(value).is_integer():
            return str(int(value))
    try:
        normalized = text.replace(" ", "").replace(",", ".")
        dec = Decimal(normalized)
        if dec == dec.to_integral_value():
            return str(dec.quantize(Decimal(1)))
    except (InvalidOperation, ValueError):
        pass
    return text


def load_contact_phone_map(base_dir: Path) -> dict[str, str]:
    path = base_dir / "calisan_iletisim_bilgileri.xlsx"
    if not path.exists():
        log_step("İletişim dosyası bulunamadı, telefon fallback atlanıyor.")
        return {}
    try:
        contact_df = fix_dataframe_turkish(pd.read_excel(path, sheet_name=0))
    except Exception as exc:
        log_step(f"İletişim dosyası okunamadı: {exc}")
        return {}

    if contact_df.empty:
        return {}

    col_map = {normalize_key(col): col for col in contact_df.columns}
    sicil_col = (
        col_map.get("sicil no")
        or col_map.get("sicil_no")
        or col_map.get("sicil")
    )
    phone_col = (
        col_map.get("cep telefonu")
        or col_map.get("cep_telefonu")
        or col_map.get("mobil telefonu")
        or col_map.get("telefon")
        or col_map.get("gsm")
    )
    if not sicil_col or not phone_col:
        log_step("İletişim dosyasında sicil/telefon kolonları bulunamadı.")
        return {}

    phone_map: dict[str, str] = {}
    sub = contact_df[[sicil_col, phone_col]].dropna(subset=[sicil_col]).copy()
    for sicil_raw, phone_raw in zip(sub[sicil_col], sub[phone_col]):
        sicil_key = normalize_sicil_key(sicil_raw)
        if not sicil_key:
            continue
        phone_val = phone_raw
        if _is_null(phone_val):
            continue
        phone_text = str(phone_val).strip()
        if not phone_text or phone_text.lower() in {"nan", "none"}:
            continue
        phone_map[sicil_key] = phone_text

    log_step(f"İletişim fallback haritası hazırlandı: {len(phone_map):,} kişi")
    return phone_map


def sheet_usecols(xl: pd.ExcelFile, name: str, candidates: list[str]) -> list[str] | None:
    if name not in xl.sheet_names:
        return None
    try:
        header_cols = list(xl.parse(name, nrows=0).columns)
    except Exception:
        return None
    selected = [c for c in candidates if c in header_cols]
    return selected or None


def load_person_name_map(xl: pd.ExcelFile) -> dict[str, str]:
    source_defs = [
        ("fiili_list", ["P_NO", "AD_SOYAD"]),
        ("Calisan_Bilgisi_Raporu", ["Sicil No", "Adı Soyadı", "Adi Soyadi"]),
        ("Ayrılanlar_Listesi", ["Sicil No", "Adı Soyadı", "Adi Soyadi"]),
    ]
    person_map: dict[str, str] = {}
    for sheet_name, candidates in source_defs:
        usecols = sheet_usecols(xl, sheet_name, candidates)
        if not usecols:
            continue
        frame = read_sheet(xl, sheet_name, usecols=usecols)
        if frame.empty:
            continue
        col_map = {normalize_key(col): col for col in frame.columns}
        sicil_col = col_map.get("sicil no") or col_map.get("sicil_no") or col_map.get("sicil") or col_map.get("p_no")
        name_col = col_map.get("adı soyadı") or col_map.get("adi soyadi") or col_map.get("ad_soyad") or col_map.get("adi_soyadi") or col_map.get("ad soyad") or col_map.get("ad? soyad?") or col_map.get("ad?_soyad?")
        if not sicil_col or not name_col:
            continue
        sub = frame[[sicil_col, name_col]].dropna(subset=[sicil_col]).copy()
        for sicil_raw, name_raw in zip(sub[sicil_col], sub[name_col]):
            sicil_key = normalize_sicil_key(sicil_raw)
            if not sicil_key:
                continue
            preferred = choose_preferred_display_text(person_map.get(sicil_key), name_raw)
            if preferred:
                person_map[sicil_key] = preferred
    log_step(f"Kişi ad soyad fallback haritası hazırlandı: {len(person_map):,} kişi")
    return person_map


def ensure_utf8_stdout() -> None:
    """Avoid UnicodeEncodeError on CP1254/CP1252 consoles."""
    try:
        enc = (sys.stdout.encoding or "").lower()
        if "utf" not in enc and hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        # Non-fatal. Output still continues with the default console encoding.
        pass


def log_step(message: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {message}"
    print(line, flush=True)
    try:
        PROGRESS_LOG.parent.mkdir(parents=True, exist_ok=True)
        encoding = "utf-8-sig" if not PROGRESS_LOG.exists() else "utf-8"
        with PROGRESS_LOG.open("a", encoding=encoding) as fh:
            fh.write(f"{line}\n")
    except Exception:
        pass


def timed_step(name: str, fn):
    started = time.perf_counter()
    result = fn()
    log_step(f"  -> {name}: {time.perf_counter() - started:.2f} sn")
    return result


def build_pages(
    df: pd.DataFrame,
    turnover_ust: pd.DataFrame,
    turnover_genel: pd.DataFrame,
    turnover_dept: pd.DataFrame,
    turnover_store: pd.DataFrame,
    cikis_sebepleri_df: pd.DataFrame,
    tahmin_df: pd.DataFrame,
    tahmin_backtest_ozet_df: pd.DataFrame,
    tahmin_yillik_backtest_df: pd.DataFrame,
    risk_df: pd.DataFrame,
    risk_region: pd.DataFrame,
    risk_store: pd.DataFrame,
    satis_df: pd.DataFrame,
    satis_full_df: pd.DataFrame,
    fiili_df: pd.DataFrame,
    katilmayan_df: pd.DataFrame,
    uzun_df: pd.DataFrame,
    enocta_raw_df: pd.DataFrame,
    enocta_ozet_df: pd.DataFrame,
    isgucu_kaybi_df: pd.DataFrame,
    izin_yuku_df: pd.DataFrame,
    yurtdisi_df: pd.DataFrame,
    gelisim_yolculuk_df: pd.DataFrame,
    performans_magaza_df: pd.DataFrame,
    magaza_hedef_ciro_df: pd.DataFrame,
    norm_fiili_kadro_df: pd.DataFrame,
    cezalar_df: pd.DataFrame,
    ise_alma_suresi_df: pd.DataFrame,
    v2_regrettable_df: pd.DataFrame,
    v2_regrettable_detail_df: pd.DataFrame,
    v2_burnout_df: pd.DataFrame,
    v2_survival_curve_df: pd.DataFrame,
    v2_survival_summary_df: pd.DataFrame,
    v2_survival_base_df: pd.DataFrame,
    contact_phone_map: dict[str, str] | None = None,
    person_name_map: dict[str, str] | None = None,
    promotion_history_df: pd.DataFrame | None = None,
    promotion_turnover_store_df: pd.DataFrame | None = None,
) -> dict:
    pages: dict = {}
    contact_phone_map = contact_phone_map or {}
    person_name_map = person_name_map or {}
    promotion_history_source = (
        promotion_history_df
        if isinstance(promotion_history_df, pd.DataFrame) and not promotion_history_df.empty
        else df
    )
    promotion_turnover_store_source = (
        promotion_turnover_store_df
        if isinstance(promotion_turnover_store_df, pd.DataFrame) and not promotion_turnover_store_df.empty
        else turnover_store
    )

    months = (
        sorted(df["month"].dropna().unique(), key=lambda m: pd.Period(m, freq="M"))
        if "month" in df.columns
        else []
    )
    years = sorted(df["year"].dropna().unique()) if "year" in df.columns else []

    # Pre-calculate normalized columns to avoid repeating .apply() inside loops
    if MAGAZA_KIRILIM_COL in df.columns:
        df["store_breakdown_norm"] = df[MAGAZA_KIRILIM_COL].apply(normalize_store_breakdown)
    if "il" in df.columns:
        df["il"] = df["il"].apply(lambda x: fix_text(x).strip() if isinstance(x, str) else x)

    locations = ["Edirne", "Mağaza", "Merkez"]
    group_label = "Aurelia Group"
    empty_df = df.iloc[0:0].copy()
    month_cache = (
        {str(month): group.copy() for month, group in df.groupby("month", dropna=True)}
        if "month" in df.columns
        else {}
    )
    year_cache = (
        {int(year): group.copy() for year, group in df.groupby("year", dropna=True)}
        if "year" in df.columns
        else {}
    )
    store_month_cache = (
        {
            month: group[group["ust_bolum_key"] == "magaza"].copy()
            for month, group in month_cache.items()
            if "ust_bolum_key" in group.columns
        }
        if month_cache
        else {}
    )

    merkez_month_cache = (
        {
            month: group[group["ust_bolum_key"] == "merkez"].copy()
            for month, group in month_cache.items()
            if "ust_bolum_key" in group.columns
        }
        if month_cache
        else {}
    )

    def month_data(month: str) -> pd.DataFrame:
        return month_cache.get(str(month), empty_df)

    def preferred_person_name(sicil_value: object, fallback: object = None) -> str | None:
        sicil_key = normalize_sicil_key(sicil_value)
        mapped = person_name_map.get(sicil_key) if sicil_key else None
        return choose_preferred_display_text(mapped, fallback)

    def apply_person_name_overrides(frame: pd.DataFrame, sicil_candidates: list[str], name_candidates: list[str]) -> pd.DataFrame:
        if frame.empty or not person_name_map:
            return frame
        sicil_col = find_first_col(frame, sicil_candidates)
        name_col = find_first_col(frame, name_candidates)
        if not sicil_col or not name_col:
            return frame
        out = frame.copy()
        mapped = out[sicil_col].apply(normalize_sicil_key).map(person_name_map)
        out[name_col] = mapped.where(mapped.notna(), out[name_col])
        return out

    def year_data(year: int) -> pd.DataFrame:
        return year_cache.get(int(year), empty_df)

    def store_month_data(month: str) -> pd.DataFrame:
        return store_month_cache.get(str(month), empty_df)

    def merkez_month_data(month: str) -> pd.DataFrame:
        return merkez_month_cache.get(str(month), empty_df)

    def turnover_exit_series(frame: pd.DataFrame) -> pd.Series:
        """Turnover icin tek cikis standardi: cikis; eski veride yoksa reel_isten_cikis fallback."""
        if frame is None or frame.empty:
            return pd.Series(dtype="float64")
        if "cikis" in frame.columns:
            return numeric(frame["cikis"]).fillna(0)
        if "reel_isten_cikis" in frame.columns:
            return numeric(frame["reel_isten_cikis"]).fillna(0)
        return pd.Series(0.0, index=frame.index, dtype="float64")

    def turnover_exit_sum(frame: pd.DataFrame) -> float:
        series = turnover_exit_series(frame)
        return safe_sum(series) if len(series) else 0.0

    def turnover_exit_mask(frame: pd.DataFrame) -> pd.Series:
        series = turnover_exit_series(frame)
        if len(series) == len(frame):
            return series > 0
        return pd.Series(False, index=frame.index)

    magaza_all_df = (
        df[df["ust_bolum_key"] == "magaza"].copy()
        if "ust_bolum_key" in df.columns
        else empty_df.copy()
    )

    def page1_for_month(month: str) -> dict:
        sub = month_data(month)
        metrics = {
            "calisan_sayisi": {},
            "girisler": {},
            "cikislar": {},
            "turnover_oran": {},
            "_donem_basi": {},
            "_donem_sonu": {},
        }
        for loc in locations:
            sub_loc = sub[sub["ust_bolum_norm"] == loc]
            metrics["calisan_sayisi"][loc] = safe_sum(sub_loc["calisan_sayisi"]) if "calisan_sayisi" in sub_loc else 0
            metrics["girisler"][loc] = safe_sum(sub_loc["reel_ise_giris"]) if "reel_ise_giris" in sub_loc else 0
            metrics["cikislar"][loc] = turnover_exit_sum(sub_loc)
            metrics["_donem_basi"][loc] = safe_sum(sub_loc["donem_basi"]) if "donem_basi" in sub_loc else 0
            metrics["_donem_sonu"][loc] = safe_sum(sub_loc["donem_sonu"]) if "donem_sonu" in sub_loc else 0

        metrics["calisan_sayisi"][group_label] = sum(metrics["calisan_sayisi"].get(loc, 0) for loc in locations)
        metrics["girisler"][group_label] = sum(metrics["girisler"].get(loc, 0) for loc in locations)
        metrics["cikislar"][group_label] = sum(metrics["cikislar"].get(loc, 0) for loc in locations)
        metrics["_donem_basi"][group_label] = sum(metrics["_donem_basi"].get(loc, 0) for loc in locations)
        metrics["_donem_sonu"][group_label] = sum(metrics["_donem_sonu"].get(loc, 0) for loc in locations)

        if not turnover_ust.empty and "month" in turnover_ust.columns:
            tsub = turnover_ust[turnover_ust["month"] == month]
            for loc in locations:
                val = tsub.loc[tsub["ust_bolum_norm"] == loc, "turnover1"]
                metrics["turnover_oran"][loc] = float(val.iloc[0]) if not val.empty else None

        if not turnover_genel.empty and "month" in turnover_genel.columns:
            gval = turnover_genel.loc[turnover_genel["month"] == month, "turnover1"]
            metrics["turnover_oran"][group_label] = float(gval.iloc[0]) if not gval.empty else None

        # Fallback: hesaplanan turnover yoksa standart formülle türet.
        for loc in [group_label] + locations:
            if metrics["turnover_oran"].get(loc) is None:
                exit_val = metrics["cikislar"].get(loc, 0)
                start = metrics["_donem_basi"].get(loc, 0)
                end = metrics["_donem_sonu"].get(loc, 0)
                fallback_hc = metrics["calisan_sayisi"].get(loc, 0)
                denom = ((start + end) / 2) if (start + end) > 0 else fallback_hc
                metrics["turnover_oran"][loc] = safe_div(exit_val, denom) if denom else None

        metrics.pop("_donem_basi", None)
        metrics.pop("_donem_sonu", None)

        return {
            "locations": [group_label] + locations,
            "metrics": metrics,
        }

    pages["p001_matrix"] = {"by_month": {m: page1_for_month(m) for m in months}}

    def page2_for_year(year: int) -> dict:
        sub = year_data(year)
        if sub.empty or "calisan_sayisi" not in sub.columns:
            return {}
        pivot = (
            sub.pivot_table(
                index="ust_bolum_norm",
                columns="month_num",
                values="calisan_sayisi",
                aggfunc="sum",
                fill_value=0,
            )
            if "ust_bolum_norm" in sub.columns
            else pd.DataFrame()
        )
        months_cols = [f"{m:02d}" for m in range(1, 13)]
        rows = []
        for loc in locations:
            if loc in pivot.index:
                values = [float(pivot.loc[loc].get(m, 0)) for m in range(1, 13)]
                rows.append({"ust_bolum": loc, "values": values})
        if rows:
            group_vals = [sum(r["values"][i] for r in rows) for i in range(12)]
            rows.insert(0, {"ust_bolum": group_label, "values": group_vals})
        return {"months": months_cols, "rows": rows}

    page2_by_year = {str(y): page2_for_year(y) for y in years}

    def page2_pick_year_headcount(values: list[object] | None) -> int | None:
        if not isinstance(values, list):
            return None
        nums = [float(v) for v in values if pd.notna(v)]
        if not nums:
            return None
        valid = [n for n in nums if n > 0]
        base = valid if valid else nums
        return int(round(sum(base) / len(base))) if base else None

    order_map = {"Aurelia Group": 1, "Merkez": 2, "Mağaza": 3, "Edirne": 4}

    def page2_sort_key(row: dict) -> tuple[int, str]:
        ust = str(row.get("ust_bolum") or "")
        return (order_map.get(ust, 999), ust)

    year_summary_map: dict[str, dict] = {}
    for year_key, year_payload in page2_by_year.items():
        for row in year_payload.get("rows", []):
            ust = str(row.get("ust_bolum") or "").strip()
            if not ust:
                continue
            year_summary_map.setdefault(ust, {"ust_bolum": ust})
            year_summary_map[ust][year_key] = page2_pick_year_headcount(row.get("values"))

    year_summary_rows = sorted(year_summary_map.values(), key=page2_sort_key)
    group_row = next(
        (
            row
            for row in year_summary_rows
            if normalize_key(row.get("ust_bolum")) == normalize_key(group_label)
        ),
        year_summary_rows[0] if year_summary_rows else None,
    )
    group_chart = []
    if group_row:
        for year_key in sorted(page2_by_year.keys(), key=int):
            value = group_row.get(year_key)
            if value is None:
                continue
            value_num = float(value)
            if value_num <= 0:
                continue
            group_chart.append({"label": year_key, "value": round(value_num)})

    pages["p002_headcount_matrix"] = {
        "by_year": page2_by_year,
        "years": sorted(page2_by_year.keys(), key=int),
        "year_summary": {
            "rows": year_summary_rows,
            "group_chart": group_chart,
        },
    }

    def contract_mix_for_month(month: str) -> dict:
        sub = month_data(month)

        def build(subset: pd.DataFrame) -> list[dict]:
            if subset.empty or "kadro_norm" not in subset.columns:
                return []
            grp = subset.groupby("kadro_norm")["calisan_sayisi"].sum(min_count=1)
            grp = grp.dropna()
            total = float(grp.sum()) if not grp.empty else 0.0
            out = []
            for label, value in grp.items():
                if pd.isna(label) or str(label).strip() == "":
                    continue
                count = float(value) if not pd.isna(value) else 0.0
                if count <= 0:
                    continue
                share = count / total if total else 0.0
                out.append({"type": fix_text(label), "count": count, "share": share})
            out.sort(key=lambda x: x.get("count", 0), reverse=True)
            return out

        data = {}
        loc_key_map = {"Edirne": "edirne", "Mağaza": "magaza", "Merkez": "merkez"}
        for loc in locations:
            data[loc_key_map[loc]] = build(sub[sub["ust_bolum_norm"] == loc])
        data["aurelia_group"] = build(sub)
        return data

    pages["p003_contract_mix"] = {"by_month": {m: contract_mix_for_month(m) for m in months}}

    def distributions_for_month(month: str) -> dict:
        sub = month_data(month)
        return {
            "location": dist_table(sub, "ust_bolum_norm", "calisan_sayisi", "loc"),
            "gender": dist_table(sub, "cinsiyet_norm", "calisan_sayisi", "gender"),
            "collar": dist_table(sub, "yaka_norm", "calisan_sayisi", "collar"),
        }

    pages["p004_distributions"] = {"by_month": {m: distributions_for_month(m) for m in months}}

    def group_age_tenure_for_month(month: str) -> dict:
        sub = month_data(month)
        generation = dist_table(sub, "kusak_aralik", "calisan_sayisi", "gen")
        avg_age = float(numeric(sub["yas"]).mean()) if "yas" in sub.columns else None
        avg_tenure = float(numeric(sub["kidem_yil"]).mean()) if "kidem_yil" in sub.columns else None
        loc_rows = []
        for loc in locations:
            loc_sub = sub[sub["ust_bolum_norm"] == loc]
            if loc_sub.empty:
                continue
            loc_rows.append(
                {
                    "loc": loc,
                    "avg_age": float(numeric(loc_sub["yas"]).mean()) if "yas" in loc_sub.columns else None,
                    "avg_tenure": float(numeric(loc_sub["kidem_yil"]).mean()) if "kidem_yil" in loc_sub.columns else None,
                }
            )
        return {
            "generation": generation,
            "avg": {"group": {"avg_age": avg_age, "avg_tenure": avg_tenure}, "locations": loc_rows},
        }

    pages["p005_group_age_tenure"] = {"by_month": {m: group_age_tenure_for_month(m) for m in months}}

    def ust_bolum_detail_for_month(month: str) -> dict:
        sub = month_data(month)
        data = {}

        def build_loc_block(source: pd.DataFrame) -> dict:
            gen = dist_table(source, "kusak_aralik", "calisan_sayisi", "gen")
            rows = []
            if "yonetim_seviye" in source.columns:
                source = source.copy()
                source["yonetim_seviye_norm"] = source["yonetim_seviye"].apply(
                    lambda x: normalize_common_label(str(fix_text(x)).strip()) if isinstance(x, str) else x
                )
                for level, group in source.groupby("yonetim_seviye_norm", dropna=False):
                    if pd.isna(level) or str(level).strip() == "":
                        continue
                    rows.append(
                        {
                            "yonetim_seviye": normalize_common_label(str(level).strip()),
                            "avg_age": float(numeric(group["yas"]).mean()) if "yas" in group.columns else None,
                            "avg_tenure": float(numeric(group["kidem_yil"]).mean()) if "kidem_yil" in group.columns else None,
                            "count": float(numeric(group["calisan_sayisi"]).sum()) if "calisan_sayisi" in group.columns else 0,
                        }
                    )
            rows.sort(key=lambda r: management_level_order(r.get("yonetim_seviye")))
            return {"generation": gen, "by_management": rows}

        if not sub.empty:
            data[group_label] = build_loc_block(sub)

        for loc in locations:
            loc_sub = sub[sub["ust_bolum_norm"] == loc]
            if loc_sub.empty:
                continue
            payload = build_loc_block(loc_sub)
            payload["selected_collar"] = "Tümü"
            data[loc] = payload
        return {"ust_bolum": data}

    pages["p006_ust_bolum_detail"] = {"by_month": {m: ust_bolum_detail_for_month(m) for m in months}}

    def store_income_ratio_for_month(month: str) -> dict:
        def ratio_map_for(target_month: str) -> dict[str, float | None]:
            sub = store_month_data(target_month)
            if sub.empty:
                return {}
            sub = sub.copy()
            if "store_breakdown_norm" not in sub.columns:
                return {}
            out: dict[str, float | None] = {}
            for key, group in sub.groupby("store_breakdown_norm"):
                temiz = safe_sum(group["temiz_net_gelir"]) if "temiz_net_gelir" in group else 0
                denom, _ = income_denominator(group, key)
                out[str(key)] = safe_div(temiz, denom)
            return out

        prev = prev_month(month)
        prev_year_month = add_month(month, -12)
        cur_map = ratio_map_for(month)
        prev_map = ratio_map_for(prev) if prev != month else {}
        prev_year_map = ratio_map_for(prev_year_month) if prev_year_month != month else {}

        labels = sorted(set(cur_map) | set(prev_map) | set(prev_year_map), key=normalize_key)
        rows = []
        for label in labels:
            current_val = cur_map.get(label)
            rows.append(
                {
                    "label": label,
                    "value": current_val,
                    "current": current_val,
                    "prev_month": prev_map.get(label),
                    "prev_year": prev_year_map.get(label),
                }
            )
        rows.sort(key=lambda x: (x.get("current") is None, -(x.get("current") or 0)))
        return {
            "prev_month": prev,
            "prev_year_month": prev_year_month,
            "items": rows,
        }

    pages["p007_store_net_income_ratio"] = {"by_month": {m: store_income_ratio_for_month(m) for m in months}}

    def store_income_radar_for_month(month: str) -> dict:
        sub = store_month_data(month)
        data = {}
        if sub.empty or MAGAZA_KIRILIM_COL not in sub.columns or "il" not in sub.columns:
            return {"by_breakdown": data}
        work = sub.copy()
        if "store_breakdown_norm" not in work.columns:
            return {"by_breakdown": data}
        if "temiz_net_gelir" in work.columns:
            work["temiz_net_gelir"] = numeric(work["temiz_net_gelir"]).fillna(0)
        else:
            return {"by_breakdown": data}
        if "sgk_gun" in work.columns:
            work["sgk_gun"] = numeric(work["sgk_gun"]).fillna(0)
        if "calisan_sayisi" in work.columns:
            work["calisan_sayisi_num"] = numeric(work["calisan_sayisi"]).fillna(0)
        else:
            work["calisan_sayisi_num"] = 0.0
        work = work[work["il"].notna() & (work["il"].astype(str).str.strip() != "")]
        all_cities = sorted({str(x).strip() for x in work["il"].dropna().tolist() if str(x).strip()}, key=normalize_key)
        all_breakdowns = sorted(
            {str(x).strip() for x in work["store_breakdown_norm"].dropna().tolist() if str(x).strip()},
            key=normalize_key,
        )
        agg_kwargs: dict[str, tuple[str, str]] = {
            "total_temiz_net_gelir": ("temiz_net_gelir", "sum"),
            "sgk_gun_sum": ("sgk_gun", "sum"),
            "calisan_sayisi_sum": ("calisan_sayisi_num", "sum"),
            "row_count": ("il", "size"),
        }
        if "sicil_no" in work.columns:
            agg_kwargs["person_count"] = ("sicil_no", "nunique")
        grouped = (
            work.groupby(["store_breakdown_norm", "il"], dropna=False)
            .agg(**agg_kwargs)
            .reset_index()
        )
        grouped_map = {}
        for record in grouped.to_dict("records"):
            grouped_map[(str(record.get("store_breakdown_norm", "")).strip(), str(record.get("il", "")).strip())] = record
        for key in all_breakdowns:
            items: list[dict] = []
            for il_name in all_cities:
                row = grouped_map.get((key, il_name))
                total_temiz = float(row["total_temiz_net_gelir"]) if row is not None and pd.notna(row["total_temiz_net_gelir"]) else 0.0
                sgk_sum = float(row["sgk_gun_sum"]) if row is not None and pd.notna(row["sgk_gun_sum"]) else 0.0
                person_count = float(row["person_count"]) if row is not None and "person_count" in row and pd.notna(row["person_count"]) else 0.0
                calisan_sum = float(row["calisan_sayisi_sum"]) if row is not None and pd.notna(row["calisan_sayisi_sum"]) else 0.0
                row_count = float(row["row_count"]) if row is not None and pd.notna(row["row_count"]) else 0.0

                if sgk_sum > 0:
                    if is_part_time_label(key):
                        denom = safe_div(sgk_sum, 16)
                        denom_type = "sgk_gun/16" if denom > 0 else "none"
                    else:
                        denom = safe_div(sgk_sum, 30)
                        denom_type = "sgk_gun/30" if denom > 0 else "none"
                elif person_count > 0:
                    denom, denom_type = person_count, "sicil_no"
                elif calisan_sum > 0:
                    denom, denom_type = calisan_sum, "calisan_sayisi"
                elif row_count > 0:
                    denom, denom_type = row_count, "row_count"
                else:
                    denom, denom_type = 0.0, "none"

                avg_temiz = safe_div(total_temiz, denom) if denom > 0 else 0.0
                avg_safe = float(avg_temiz) if avg_temiz is not None else 0.0
                avg_rounded = float(round(avg_safe))
                items.append(
                    {
                        "label": fix_text(il_name),
                        "value_raw": avg_rounded,
                        # Radar negatif değerleri sağlıklı gösteremediği için 0 altını kırp.
                        "value": max(avg_rounded, 0.0),
                        "total_temiz_net_gelir": float(total_temiz),
                        "denom": float(denom),
                        "denom_type": denom_type,
                        "person_count": person_count,
                    }
                )
            items.sort(key=lambda x: normalize_key(x.get("label", "")))
            data[fix_text(str(key))] = items
        return {"by_breakdown": data}

    pages["p008_store_income_radar"] = timed_step(
        "p008_store_income_radar",
        lambda: {"by_month": {m: store_income_radar_for_month(m) for m in months}},
    )

    def store_income_components_for_month(month: str) -> dict:
        sub = store_month_data(month)
        items = []
        if sub.empty or MAGAZA_KIRILIM_COL not in sub.columns:
            return {"items": []}
        sub = sub.copy()
        sub["store_breakdown_norm"] = sub[MAGAZA_KIRILIM_COL].apply(normalize_store_breakdown)
        prim_col = find_first_col(sub, ["prim_toplam", "prim_toplami"])
        # User formula: "diğer = temiz_net_gelir - ücret hakedişi - prim".
        net_col = find_first_col(sub, ["temiz_net_gelir", "net_gelir"])
        for key, group in sub.groupby("store_breakdown_norm"):
            calc = group.copy()
            for col in ["ucret", "sgk_gun", "kasa_tazminati", "ucret_turu"]:
                if col in calc.columns:
                    if col == "ucret_turu":
                        calc[col] = calc[col].astype(str)
                    else:
                        calc[col] = numeric(calc[col]).fillna(0)
                else:
                    calc[col] = "" if col == "ucret_turu" else 0
            calc["ucret_hakedis"] = _compute_wage_hakedis_series(calc, key)
            denom, denom_type = income_denominator(calc, key)
            if denom <= 0:
                continue

            ucret_hakedis_total = float(numeric(calc["ucret_hakedis"]).fillna(0).sum())
            prim_total = safe_sum(calc[prim_col]) if prim_col else 0
            net_toplam = safe_sum(calc[net_col]) if net_col else 0
            # Kullanıcı tanımı: diğer = net - ücret hakedişi - prim
            diger_total = net_toplam - ucret_hakedis_total - prim_total

            # Ortalama gelirler (kişi başı)
            ucret_hakedis = safe_div(ucret_hakedis_total, denom) or 0.0
            prim = safe_div(prim_total, denom) or 0.0
            diger = safe_div(diger_total, denom) or 0.0
            net_ortalama = safe_div(net_toplam, denom) or 0.0

            # Görselleştirme payları için negatif segmentleri 0'a kırpıyoruz.
            display_ucret = max(ucret_hakedis, 0.0)
            display_prim = max(prim, 0.0)
            display_diger = max(diger, 0.0)
            display_total = display_ucret + display_prim + display_diger

            if display_total == 0:
                u_share = p_share = d_share = 0
            else:
                u_share = display_ucret / display_total
                p_share = display_prim / display_total
                d_share = display_diger / display_total
            items.append(
                {
                    "label": key,
                    "ucret": u_share,
                    "prim": p_share,
                    "diger": d_share,
                    "amounts": {
                        "ucret": ucret_hakedis,
                        "prim": prim,
                        "diger": diger,
                        "total": net_ortalama,
                        "denom": denom,
                        "denom_type": denom_type,
                        "person_count": float(calc["sicil_no"].dropna().nunique()) if "sicil_no" in calc.columns else None,
                        "total_net": net_toplam,
                        "total_ucret_hakedis": ucret_hakedis_total,
                        "total_prim": prim_total,
                        "total_diger": diger_total,
                    },
                }
            )
        items.sort(key=lambda x: x.get("amounts", {}).get("total", 0.0), reverse=True)
        return {"items": items}

    pages["p009_store_income_components"] = {
        "by_month": {m: store_income_components_for_month(m) for m in months}
    }
    log_step("Sayfa 1-9 tamamlandı")

    def overtime_for_month(month: str) -> dict:
        prev = prev_month(month)
        prev_year_month = add_month(month, -12)
        result = {"prev_month": prev, "prev_year_month": prev_year_month, "departments": []}
        dept_rules = [
            ("Tedarik Zinciri", ["tedarik zinciri"]),
            ("İnsan Kaynakları", ["insan kaynak"]),
        ]
        for dept, contains_rules in dept_rules:
            row = {"dept": dept}
            for label, m in [("current", month), ("prev", prev), ("prev_year", prev_year_month)]:
                sub = merkez_month_data(m)
                dep_series = None
                if "departman" in sub.columns and sub["departman"].notna().any():
                    dep_series = sub["departman"].apply(normalize_key)
                elif "departman_adi" in sub.columns and sub["departman_adi"].notna().any():
                    dep_series = sub["departman_adi"].apply(normalize_key)

                if dep_series is not None:
                    mask = pd.Series(False, index=sub.index)
                    for token in contains_rules:
                        mask = mask | dep_series.str.contains(token, na=False)
                    sub = sub[mask]
                if sub.empty:
                    row[label] = None
                    continue
                fm = safe_sum(sub["fazla_mesai_toplam"]) if "fazla_mesai_toplam" in sub else 0
                sgk = safe_sum(sub["sgk_gun"]) if "sgk_gun" in sub else 0
                regular_hours = sgk * 7.5
                if not regular_hours:
                    row[label] = None
                    continue
                row[label] = safe_div(fm, regular_hours)
            result["departments"].append(row)
        return result

    pages["p010_overtime"] = {"by_month": {m: overtime_for_month(m) for m in months}}

    def build_promotion_transition_tables() -> dict[str, list[dict]]:
        if df.empty or "month" not in df.columns or "sicil_no" not in df.columns:
            return {"manager": [], "assistant": [], "pasor": []}
        title_cols = [
            col
            for col in ["gorev", "magaza_title", MAGAZA_KIRILIM_COL, "kısa_gorev", "kisa_gorev", "unvan"]
            if col in df.columns
        ]
        if not title_cols:
            return {"manager": [], "assistant": [], "pasor": []}

        work = df.copy()
        work = work[work["month"].notna()].copy()
        if work.empty:
            return {"manager": [], "assistant": [], "pasor": []}
        work["sicil_no_num"] = numeric(work["sicil_no"]).astype("Int64")
        work = work[work["sicil_no_num"].notna()].copy()
        if work.empty:
            return {"manager": [], "assistant": [], "pasor": []}
        if "ust_bolum_norm" in work.columns:
            work = work[work["ust_bolum_norm"] == "Mağaza"].copy()
        if work.empty:
            return {"manager": [], "assistant": [], "pasor": []}
        fixed_term_cols = [
            "kadro_adi",
            "gorev",
            "unvan",
            "magaza_title",
            "merkez_title",
            MAGAZA_KIRILIM_COL,
            "kÄ±sa_gorev",
            "kisa_gorev",
        ]
        work = work[~fixed_term_mask(work, fixed_term_cols)].copy()
        if work.empty:
            return {"manager": [], "assistant": [], "pasor": []}
        work["title_norm"] = (
            work[title_cols]
            .fillna("")
            .astype(str)
            .agg(" ".join, axis=1)
            .apply(normalize_key)
        )
        work["month"] = work["month"].astype("string")

        all_months = sorted(work["month"].dropna().astype(str).unique(), key=lambda m: pd.Period(m, freq="M"))
        if not all_months:
            return {"manager": [], "assistant": [], "pasor": []}

        company_by_month: dict[str, set[int]] = {}
        for month_key, month_group in work.groupby("month", dropna=False):
            m = str(month_key)
            company_by_month[m] = {int(v) for v in month_group["sicil_no_num"].dropna().astype(int).tolist()}

        def role_sets(role_key: str) -> dict[str, set[int]]:
            if role_key == "manager":
                mask = work["title_norm"].str.contains("magaza mudur", na=False)
                mask &= ~work["title_norm"].str.contains("yardimci|ikinci|2\\.", regex=True, na=False)
            elif role_key == "assistant":
                mask = (
                    work["title_norm"].str.contains("magaza mudur yardim", na=False)
                    | work["title_norm"].str.contains("magaza ikinci mudur", na=False)
                    | work["title_norm"].str.contains("magaza mudur yrd", na=False)
                )
            elif role_key == "pasor":
                mask = (
                    work["title_norm"].str.contains("pasor satis danismani", na=False)
                    | work["title_norm"].str.contains("pasor", na=False)
                )
            else:
                mask = pd.Series(False, index=work.index)
            role_df = work[mask].copy()
            out: dict[str, set[int]] = {}
            for month_key, month_group in role_df.groupby("month", dropna=False):
                m = str(month_key)
                out[m] = {int(v) for v in month_group["sicil_no_num"].dropna().astype(int).tolist()}
            return out

        def build_rows(role_key: str, label: str) -> list[dict]:
            role_by_month = role_sets(role_key)
            rows: list[dict] = []
            for idx, month_key in enumerate(all_months):
                prev = all_months[idx - 1] if idx > 0 else None
                current_role = role_by_month.get(month_key, set())
                prev_role = role_by_month.get(prev, set()) if prev else set()
                prev_company = company_by_month.get(prev, set()) if prev else set()
                dis_aday = 0
                ic_terfi = 0
                for sicil in current_role:
                    if prev and sicil not in prev_company:
                        dis_aday += 1
                    elif prev and sicil not in prev_role:
                        ic_terfi += 1
                toplam_hareket = int(ic_terfi + dis_aday)
                rows.append(
                    {
                        "month": month_key,
                        "role": label,
                        "ic_terfi": int(ic_terfi),
                        "dis_aday": int(dis_aday),
                        "toplam_hareket": toplam_hareket,
                        "ic_terfi_orani": safe_div(ic_terfi, toplam_hareket),
                        "dis_aday_orani": safe_div(dis_aday, toplam_hareket),
                        "toplam_rol_kisi": int(len(current_role)),
                    }
                )
            return rows

        return {
            "manager": build_rows("manager", "Mağaza Müdürü"),
            "assistant": build_rows("assistant", "Mağaza Müdürü Yardımcısı"),
            "pasor": build_rows("pasor", "Pasör Satış Danışmanı"),
        }

    promotion_transition_tables = build_promotion_transition_tables()

    def first_nonempty_text_series(frame: pd.DataFrame, candidates: list[str]) -> pd.Series:
        out = pd.Series(pd.NA, index=frame.index, dtype="object")
        for col in candidates:
            if col not in frame.columns:
                continue
            vals = frame[col]
            valid_mask = (
                vals.notna()
                & vals.astype(str).str.strip().ne("")
                & vals.astype(str).str.strip().ne("YANLIŞ")
            )
            cleaned = vals.where(valid_mask, pd.NA)
            out = out.where(out.notna(), cleaned)
        return out

    center_level_rules = [
        (7, "Genel Müdür", ["genel mudur", "general manager"]),
        (6, "Direktör", ["direktor", "director"]),
        (5, "Müdür", ["mudur", "manager"]),
        (4, "Yönetici", ["yonetici", "supervisor", "lead"]),
        (
            3,
            "Kıdemli Uzman",
            [
                "kidemli uzman",
                "senior specialist",
                "senior expert",
                "kidemli",
                "senior",
                "senıor",
                "sr ",
                "sr.",
            ],
        ),
        (
            1,
            "Uzman Yardımcısı / Memur / Eleman",
            [
                "uzman yardimcisi",
                "assistant specialist",
                "assistant expert",
                "memur",
                "officer",
                "clerk",
                "eleman",
                "staff",
            ],
        ),
        (2, "Uzman", ["uzman", "specialist", "expert"]),
    ]

    store_level_rules = [
        (4, "Mağaza Müdürü", ["magaza muduru", "store manager"]),
        (
            3,
            "Mağaza Müdür Yardımcısı",
            [
                "magaza mudur yardim",
                "magaza ikinci mudur",
                "magaza mudur yrd",
                "assistant store manager",
                "deputy store manager",
            ],
        ),
        (2, "Pasör Satış Danışmanı", ["pasor satis danismani", "pasor", "passor"]),
        (
            1,
            "Satış Danışmanı / Diğer",
            [
                "satis danismani",
                "sales advisor",
                "sales consultant",
                "kasiyer",
                "cashier",
                "diger",
                "eleman",
            ],
        ),
    ]

    def classify_level(raw_title: object, rules: list[tuple[int, str, list[str]]], default_label: str) -> tuple[str, int]:
        text = fix_text(raw_title).strip() if isinstance(raw_title, str) else ""
        key = normalize_key(text)
        for rank, label, tokens in rules:
            if any(token in key for token in tokens):
                return label, rank
        return (text or default_label, 0)

    def build_promotion_movement_page() -> dict:
        if promotion_history_source.empty or "month" not in promotion_history_source.columns or "sicil_no" not in promotion_history_source.columns:
            return {"by_month": {}}

        needed_cols = [
            "month",
            "sicil_no",
            "adi_soyadi",
            "ust_bolum_key",
            "ust_bolum",
            "departman_adi",
            "isletme_adi",
            "reel_ise_giris",
            "ise_giris_tarihi",
            "terfi_durumu",
            "kadro_adi",
            "kidem_yil",
            "merkez_title",
            "magaza_title",
            "kısa_gorev",
            "kisa_gorev",
            "unvan",
            "gorev",
            MAGAZA_KIRILIM_COL,
        ]
        work = promotion_history_source[[col for col in needed_cols if col in promotion_history_source.columns]].copy()
        work = work[work["month"].notna()].copy()
        if work.empty:
            return {"by_month": {}}

        work["month"] = work["month"].astype("string")
        work["sicil_key"] = work["sicil_no"].apply(normalize_sicil_key)
        work = work[work["sicil_key"].notna()].copy()
        if work.empty:
            return {"by_month": {}}

        work = work.sort_values(["month", "sicil_key"])
        work = work.drop_duplicates(subset=["month", "sicil_key"], keep="last")

        work["scope_key"] = (
            work["ust_bolum_key"]
            if "ust_bolum_key" in work.columns
            else work["ust_bolum"].apply(normalize_key)
        )
        work = work[work["scope_key"].isin(["merkez", "magaza"])].copy()
        if work.empty:
            return {"by_month": {}}

        work["scope_display"] = work["scope_key"].map({"merkez": "Merkez", "magaza": "Mağaza"})
        fixed_term_cols = [
            "kadro_adi",
            "gorev",
            "unvan",
            "magaza_title",
            "merkez_title",
            MAGAZA_KIRILIM_COL,
            "kÄ±sa_gorev",
            "kisa_gorev",
        ]
        work = work[~fixed_term_mask(work, fixed_term_cols)].copy()
        if work.empty:
            return {"by_month": {}}
        mapped_names = work["sicil_key"].map(person_name_map)
        work["adi_soyadi"] = (
            mapped_names.where(mapped_names.notna(), work.get("adi_soyadi"))
            if "adi_soyadi" in work.columns
            else mapped_names
        )
        work["adi_soyadi"] = work["adi_soyadi"].apply(lambda x: fix_text(x).strip() if isinstance(x, str) else x)
        work["departman_adi"] = work["departman_adi"].apply(lambda x: fix_text(x).strip() if isinstance(x, str) else x) if "departman_adi" in work.columns else None
        work["isletme_adi"] = work["isletme_adi"].apply(lambda x: fix_text(x).strip() if isinstance(x, str) else x) if "isletme_adi" in work.columns else None
        if "kadro_adi" in work.columns:
            work["kadro_adi"] = work["kadro_adi"].apply(lambda x: fix_text(x).strip() if isinstance(x, str) else x)
        if "gorev" in work.columns:
            work["gorev"] = work["gorev"].apply(lambda x: fix_text(x).strip() if isinstance(x, str) else x)
        if "unvan" in work.columns:
            work["unvan"] = work["unvan"].apply(lambda x: fix_text(x).strip() if isinstance(x, str) else x)
        work["reel_ise_giris_num"] = numeric(work["reel_ise_giris"]).fillna(0) if "reel_ise_giris" in work.columns else 0.0
        work["ise_giris_month"] = to_month(pd.to_datetime(work["ise_giris_tarihi"], errors="coerce")) if "ise_giris_tarihi" in work.columns else None

        merkez_title_raw = first_nonempty_text_series(work, ["gorev", "unvan", "merkez_title", "kısa_gorev", "kisa_gorev"])
        store_title_raw = first_nonempty_text_series(work, ["gorev", "magaza_title", MAGAZA_KIRILIM_COL, "kısa_gorev", "kisa_gorev", "unvan"])
        work["current_title_raw"] = store_title_raw
        merkez_mask = work["scope_key"] == "merkez"
        work.loc[merkez_mask, "current_title_raw"] = merkez_title_raw[merkez_mask]
        work.loc[work["current_title_raw"].isna(), "current_title_raw"] = first_nonempty_text_series(work, ["unvan", "gorev"])[work["current_title_raw"].isna()]

        current_levels = [
            classify_level(title, center_level_rules if scope == "merkez" else store_level_rules, "Diğer")
            for scope, title in zip(work["scope_key"].tolist(), work["current_title_raw"].tolist())
        ]
        work["current_level"] = [lvl for lvl, _ in current_levels]
        work["current_rank"] = [rank for _, rank in current_levels]

        work["prev_month"] = work["month"].apply(prev_month)
        lookup_cols = [
            "month",
            "sicil_key",
            "scope_display",
            "departman_adi",
            "isletme_adi",
            "current_title_raw",
            "current_level",
            "current_rank",
        ]
        prev_lookup = work[lookup_cols].rename(
            columns={
                "month": "prev_lookup_month",
                "scope_display": "prev_scope_display",
                "departman_adi": "prev_departman_adi",
                "isletme_adi": "prev_isletme_adi",
                "current_title_raw": "prev_title_raw",
                "current_level": "prev_level",
                "current_rank": "prev_rank",
            }
        )
        merged = work.merge(
            prev_lookup,
            left_on=["prev_month", "sicil_key"],
            right_on=["prev_lookup_month", "sicil_key"],
            how="left",
        )

        if "terfi_durumu" in merged.columns:
            terfi_norm = merged["terfi_durumu"].apply(normalize_key)
        else:
            terfi_norm = pd.Series("", index=merged.index)

        prev_exists = merged["prev_scope_display"].notna()
        external_flag = ~prev_exists
        internal_flag = prev_exists & (
            (numeric(merged["current_rank"]).fillna(0) > numeric(merged["prev_rank"]).fillna(0))
            | (
                terfi_norm.str.contains("ic terfi|terfi", na=False)
                & ~terfi_norm.str.contains("devam|dis aday|dış aday|external", na=False)
            )
        )

        merged["hareket_tipi"] = np.where(
            external_flag,
            "Dış Aday",
            np.where(internal_flag, "İç Terfi", None),
        )
        merged = merged[merged["hareket_tipi"].notna()].copy()
        # Store movement ratios exclude the operational catch-all target role.
        if not merged.empty:
            store_other_level_key = merged["current_level"].apply(
                lambda value: " ".join(normalize_key(value).replace("/", " ").split())
            )
            store_other_mask = (merged["scope_key"] == "magaza") & (store_other_level_key == "satis danismani diger")
            merged = merged[~store_other_mask].copy()
        if merged.empty:
            return {"by_month": {m: {"merkez_rows": [], "merkez_summary": [], "store_rows": [], "store_summary": [], "store_promotion_tracking": {"rows": [], "summary": [], "manager_turnover_rows": []}} for m in months}}

        merged["onceki_lokasyon"] = merged["prev_scope_display"].fillna("Dış Aday")
        merged["onceki_birim"] = merged["prev_isletme_adi"].where(
            merged["prev_scope_display"] == "Mağaza",
            merged["prev_departman_adi"],
        )
        merged["yeni_lokasyon"] = merged["scope_display"]
        merged["yeni_birim"] = merged["isletme_adi"].where(
            merged["scope_display"] == "Mağaza",
            merged["departman_adi"],
        )
        merged["onceki_unvan"] = merged["prev_level"].where(
            merged["prev_level"].notna() & merged["prev_level"].astype(str).str.strip().ne(""),
            merged["prev_title_raw"],
        )
        merged["yeni_unvan"] = merged["current_level"].where(
            merged["current_level"].notna() & merged["current_level"].astype(str).str.strip().ne(""),
            merged["current_title_raw"],
        )
        merged["hareket_ozeti"] = np.where(
            merged["hareket_tipi"] == "Dış Aday",
            "Dış Aday → " + merged["yeni_unvan"].fillna(""),
            merged["onceki_unvan"].fillna("—") + " → " + merged["yeni_unvan"].fillna(""),
        )


        turnover_work = pd.DataFrame()
        if isinstance(promotion_turnover_store_source, pd.DataFrame) and not promotion_turnover_store_source.empty:
            store_col = find_first_col(promotion_turnover_store_source, ["isletme_adi", "ma\u011faza", "magaza", "store"])
            if store_col and "turnover1" in promotion_turnover_store_source.columns and "donem" in promotion_turnover_store_source.columns:
                turnover_work = promotion_turnover_store_source[["donem", store_col, "turnover1"]].copy()
                turnover_work["month_period"] = pd.to_datetime(turnover_work["donem"], errors="coerce").dt.to_period("M")
                turnover_work["store_key"] = turnover_work[store_col].apply(normalize_key)
                turnover_work["turnover1"] = numeric(turnover_work["turnover1"])
                turnover_work = turnover_work.dropna(subset=["month_period", "store_key", "turnover1"])

        store_metric_work = pd.DataFrame()
        if not promotion_history_source.empty and {"month", "isletme_adi"}.issubset(promotion_history_source.columns):
            store_metric_work = promotion_history_source[
                promotion_history_source.get("ust_bolum_key", pd.Series("", index=promotion_history_source.index)) == "magaza"
            ].copy()
            if not store_metric_work.empty:
                store_metric_work["month_period"] = pd.to_datetime(store_metric_work["month"].astype(str) + "-01", errors="coerce").dt.to_period("M")
                store_metric_work["store_key"] = store_metric_work["isletme_adi"].apply(normalize_key)
                for col in [
                    "toplam_yuzde",
                    "toplam",
                    "izleme_dk",
                    "calisan_sayisi",
                    "cikis",
                    "reel_isten_cikis",
                    "temiz_net_gelir",
                    "net_gelir",
                ]:
                    if col in store_metric_work.columns:
                        store_metric_work[col] = numeric(store_metric_work[col])
                store_metric_work = store_metric_work.dropna(subset=["month_period", "store_key"])

        store_target_lookup: dict[tuple[pd.Period, str], dict[str, float | None]] = {}
        if isinstance(magaza_hedef_ciro_df, pd.DataFrame) and not magaza_hedef_ciro_df.empty:
            target_src = magaza_hedef_ciro_df.copy()
            if "month" not in target_src.columns and "donem" in target_src.columns:
                target_src["month"] = to_month(target_src["donem"])
            target_store_col = find_first_col(target_src, ["mag_adi", "isletme_adi", "magaza_adi", "magaza", "store"])
            target_ciro_col = find_first_col(target_src, ["omni_ciro", "ciro", "ciro_hedef"])
            if target_store_col and "month" in target_src.columns:
                target_src["month_period"] = pd.to_datetime(target_src["month"].astype(str) + "-01", errors="coerce").dt.to_period("M")
                target_src["store_key"] = target_src[target_store_col].apply(normalize_key)
                if "hgo" in target_src.columns:
                    target_src["hgo"] = numeric(target_src["hgo"])
                if target_ciro_col:
                    target_src[target_ciro_col] = numeric(target_src[target_ciro_col])
                target_src = target_src.dropna(subset=["month_period", "store_key"])
                for (period_key, store_key), group in target_src.groupby(["month_period", "store_key"], dropna=False):
                    hgo_vals = group["hgo"].dropna() if "hgo" in group.columns else pd.Series(dtype="float")
                    ciro_vals = group[target_ciro_col].dropna() if target_ciro_col and target_ciro_col in group.columns else pd.Series(dtype="float")
                    store_target_lookup[(period_key, store_key)] = {
                        "hgo_ortalama": float(hgo_vals.mean()) if not hgo_vals.empty else None,
                        "ciro_ortalama": float(ciro_vals.mean()) if not ciro_vals.empty else None,
                    }

        def canonical_store_promotion_target(value: object) -> str | None:
            key = normalize_key(value)
            if "magaza mudur" in key and not any(token in key for token in ["yardim", "ikinci", "yrd", "2"]):
                return "Mağaza Müdürü"
            if "magaza mudur" in key and any(token in key for token in ["yardim", "ikinci", "yrd", "2"]):
                return "Mağaza Müdür Yardımcısı"
            if "pasor" in key:
                return "Pasör Satış Danışmanı"
            return None

        def avg_store_turnover(store_name: object, start_period: pd.Period, end_period: pd.Period) -> tuple[float | None, int]:
            if turnover_work.empty or pd.isna(store_name):
                return None, 0
            store_key = normalize_key(store_name)
            if not store_key:
                return None, 0
            sub = turnover_work[
                (turnover_work["store_key"] == store_key)
                & (turnover_work["month_period"] >= start_period)
                & (turnover_work["month_period"] <= end_period)
            ]
            if sub.empty:
                return None, 0
            return float(sub["turnover1"].mean()), int(sub["turnover1"].notna().sum())

        def store_window_metrics(store_name: object, start_period: pd.Period, end_period: pd.Period) -> dict[str, float | int | None]:
            if store_metric_work.empty or pd.isna(store_name):
                return {
                    "karne_ortalama": None,
                    "enocta_ortalama_dk": None,
                    "ortalama_calisan": None,
                    "toplam_cikis": 0,
                    "net_gelir_kisi_basi": None,
                    "hgo_ortalama": None,
                    "ciro_ortalama": None,
                    "ay_sayisi": 0,
                }
            store_key = normalize_key(store_name)
            if not store_key:
                return {
                    "karne_ortalama": None,
                    "enocta_ortalama_dk": None,
                    "ortalama_calisan": None,
                    "toplam_cikis": 0,
                    "net_gelir_kisi_basi": None,
                    "hgo_ortalama": None,
                    "ciro_ortalama": None,
                    "ay_sayisi": 0,
                }
            sub = store_metric_work[
                (store_metric_work["store_key"] == store_key)
                & (store_metric_work["month_period"] >= start_period)
                & (store_metric_work["month_period"] <= end_period)
            ].copy()
            if sub.empty:
                return {
                    "karne_ortalama": None,
                    "enocta_ortalama_dk": None,
                    "ortalama_calisan": None,
                    "toplam_cikis": 0,
                    "net_gelir_kisi_basi": None,
                    "hgo_ortalama": None,
                    "ciro_ortalama": None,
                    "ay_sayisi": 0,
                }

            karne_col = "toplam_yuzde" if "toplam_yuzde" in sub.columns else ("toplam" if "toplam" in sub.columns else None)
            karne_series = sub[karne_col].dropna() if karne_col else pd.Series(dtype="float")
            enocta_series = sub["izleme_dk"].dropna() if "izleme_dk" in sub.columns else pd.Series(dtype="float")
            target_vals = [
                store_target_lookup[(period_key, store_key)]
                for period_key in pd.period_range(start_period, end_period, freq="M")
                if (period_key, store_key) in store_target_lookup
            ]
            hgo_vals = pd.Series(
                [row.get("hgo_ortalama") for row in target_vals if row.get("hgo_ortalama") is not None],
                dtype="float",
            )
            ciro_vals = pd.Series(
                [row.get("ciro_ortalama") for row in target_vals if row.get("ciro_ortalama") is not None],
                dtype="float",
            )

            sub["__turnover_cikis"] = turnover_exit_series(sub).reindex(sub.index).fillna(0)
            monthly = sub.groupby("month_period", dropna=False).agg(
                calisan=("calisan_sayisi", "sum") if "calisan_sayisi" in sub.columns else ("store_key", "size"),
                cikis=("__turnover_cikis", "sum"),
                net=("temiz_net_gelir", "sum") if "temiz_net_gelir" in sub.columns else (("net_gelir", "sum") if "net_gelir" in sub.columns else ("store_key", "size")),
            )
            monthly["net_per_head"] = monthly.apply(
                lambda row: safe_div(row.get("net", 0), row.get("calisan", 0)) if row.get("calisan", 0) else np.nan,
                axis=1,
            )
            return {
                "karne_ortalama": float(karne_series.mean()) if not karne_series.empty else None,
                "enocta_ortalama_dk": float(enocta_series.mean()) if not enocta_series.empty else None,
                "ortalama_calisan": float(monthly["calisan"].mean()) if "calisan" in monthly else None,
                "toplam_cikis": int(round(float(monthly["cikis"].sum()))) if "cikis" in monthly else 0,
                "net_gelir_kisi_basi": float(monthly["net_per_head"].dropna().mean()) if "net_per_head" in monthly and not monthly["net_per_head"].dropna().empty else None,
                "hgo_ortalama": float(hgo_vals.mean()) if not hgo_vals.empty else None,
                "ciro_ortalama": float(ciro_vals.mean()) if not ciro_vals.empty else None,
                "ay_sayisi": int(monthly.shape[0]),
            }

        def manager_effect_label(before_turnover: object, after_turnover: object, before_score: object, after_score: object) -> str:
            bt = float(before_turnover) if before_turnover is not None and pd.notna(before_turnover) else np.nan
            at = float(after_turnover) if after_turnover is not None and pd.notna(after_turnover) else np.nan
            bs = float(before_score) if before_score is not None and pd.notna(before_score) else np.nan
            ass = float(after_score) if after_score is not None and pd.notna(after_score) else np.nan
            turnover_delta = at - bt if np.isfinite(at) and np.isfinite(bt) else np.nan
            score_delta = ass - bs if np.isfinite(ass) and np.isfinite(bs) else np.nan
            if np.isfinite(turnover_delta) and turnover_delta <= -0.005 and (not np.isfinite(score_delta) or score_delta >= -0.01):
                return "Olumlu"
            if np.isfinite(turnover_delta) and turnover_delta >= 0.005 and (not np.isfinite(score_delta) or score_delta <= 0.01):
                return "Dikkat"
            return "Nötr"

        def build_store_promotion_tracking(selected_month: str) -> dict:
            try:
                selected_period = pd.Period(str(selected_month), freq="M")
            except Exception:
                return {"rows": [], "summary": [], "manager_turnover_rows": []}
            rows = merged[(merged["scope_key"] == "magaza") & (merged["hareket_tipi"] == "İç Terfi")].copy()
            if rows.empty:
                return {"rows": [], "summary": [], "manager_turnover_rows": []}
            rows["terfi_pozisyonu"] = rows["yeni_unvan"].apply(canonical_store_promotion_target)
            rows = rows[rows["terfi_pozisyonu"].notna()].copy()
            if rows.empty:
                return {"rows": [], "summary": [], "manager_turnover_rows": []}
            rows["event_period"] = rows["month"].apply(lambda value: pd.Period(str(value), freq="M"))
            rows["event_year"] = rows["event_period"].apply(lambda period: period.year)
            all_target_rows = rows.copy()
            rows = rows[rows["event_period"] <= selected_period].copy()
            if rows.empty:
                return {"rows": [], "summary": [], "manager_turnover_rows": []}
            def promotion_tenure_months(rec: pd.Series) -> float:
                event_period = rec.get("event_period")
                if not isinstance(event_period, pd.Period):
                    try:
                        event_period = pd.Period(str(rec.get("month")), freq="M")
                    except Exception:
                        event_period = None

                hire_date = pd.to_datetime(rec.get("ise_giris_tarihi"), errors="coerce")
                if event_period is not None and pd.notna(hire_date):
                    hire_period = hire_date.to_period("M")
                    return float(max(0, (event_period.year - hire_period.year) * 12 + (event_period.month - hire_period.month)))

                fallback_year = pd.to_numeric(pd.Series([rec.get("kidem_yil")]), errors="coerce").iloc[0]
                return float(fallback_year * 12) if pd.notna(fallback_year) else np.nan

            rows["terfi_kidem_ay"] = rows.apply(promotion_tenure_months, axis=1)
            rows["terfi_kidem_yil"] = rows["terfi_kidem_ay"] / 12
            target_order = {"Pasör Satış Danışmanı": 1, "Mağaza Müdür Yardımcısı": 2, "Mağaza Müdürü": 3}

            def previous_promotion_info(rec: dict | pd.Series) -> dict[str, object]:
                sicil_key = rec.get("sicil_key")
                event_period = rec.get("event_period")
                if not sicil_key or not isinstance(event_period, pd.Period) or all_target_rows.empty:
                    return {
                        "onceki_terfi_ayi": None,
                        "onceki_terfi_pozisyonu": None,
                        "onceki_terfiden_bu_terfiye_ay": None,
                        "onceki_terfiden_bu_terfiye": "İlk Terfisi",
                    }
                prior = all_target_rows[
                    (all_target_rows["sicil_key"] == sicil_key)
                    & (all_target_rows["event_period"] < event_period)
                ].copy()
                if prior.empty:
                    return {
                        "onceki_terfi_ayi": None,
                        "onceki_terfi_pozisyonu": None,
                        "onceki_terfiden_bu_terfiye_ay": None,
                        "onceki_terfiden_bu_terfiye": "İlk Terfisi",
                    }
                prev = prior.sort_values("event_period", ascending=False).iloc[0]
                prev_period = prev.get("event_period")
                elapsed_months = (
                    (event_period.year - prev_period.year) * 12 + (event_period.month - prev_period.month)
                    if isinstance(prev_period, pd.Period)
                    else None
                )
                elapsed_label = (
                    f"{int(elapsed_months)} ay"
                    if elapsed_months is not None and pd.notna(elapsed_months)
                    else "İlk Terfisi"
                )
                return {
                    "onceki_terfi_ayi": str(prev.get("month") or "") or None,
                    "onceki_terfi_pozisyonu": prev.get("terfi_pozisyonu"),
                    "onceki_terfiden_bu_terfiye_ay": float(elapsed_months) if elapsed_months is not None else None,
                    "onceki_terfiden_bu_terfiye": elapsed_label,
                }

            def promotion_analysis_duration(rec: dict | pd.Series, prev_info: dict[str, object]) -> tuple[float | None, str]:
                prev_months = pd.to_numeric(
                    pd.Series([prev_info.get("onceki_terfiden_bu_terfiye_ay")]),
                    errors="coerce",
                ).iloc[0]
                if pd.notna(prev_months):
                    return float(prev_months), "Önceki Terfiden Bu Terfiye"
                tenure_months = pd.to_numeric(
                    pd.Series([rec.get("terfi_kidem_ay")]),
                    errors="coerce",
                ).iloc[0]
                if pd.notna(tenure_months):
                    return float(tenure_months), "Terfi Kıdemi (İlk Terfi)"
                return None, "Belirsiz"

            detail_rows: list[dict] = []
            for rec in rows.sort_values(["event_period", "terfi_pozisyonu", "adi_soyadi"], ascending=[False, True, True]).to_dict("records"):
                prev_info = previous_promotion_info(rec)
                analysis_months, analysis_source = promotion_analysis_duration(rec, prev_info)
                detail_rows.append(
                    {
                        "terfi_ayi": str(rec.get("month") or ""),
                        "terfi_yili": int(rec.get("event_year")) if pd.notna(rec.get("event_year")) else None,
                        "sicil_no": rec.get("sicil_no"),
                        "adi_soyadi": rec.get("adi_soyadi"),
                        "bolge": rec.get("departman_adi"),
                        "magaza": rec.get("isletme_adi"),
                        "store_key": normalize_key(rec.get("isletme_adi")),
                        "terfi_pozisyonu": rec.get("terfi_pozisyonu"),
                        "onceki_unvan": rec.get("onceki_unvan"),
                        "yeni_unvan": rec.get("yeni_unvan"),
                        "kadro_adi": rec.get("kadro_adi"),
                        "gorev": rec.get("gorev"),
                        "unvan": rec.get("unvan"),
                        "terfi_kidem_yil": rec.get("terfi_kidem_yil"),
                        "terfi_kidem_ay": rec.get("terfi_kidem_ay"),
                        "terfi_analiz_suresi_ay": analysis_months,
                        "terfi_analiz_suresi_kaynagi": analysis_source,
                        **prev_info,
                        "hareket_ozeti": rec.get("hareket_ozeti"),
                    }
                )
            summary_rows: list[dict] = []
            for role in ["Pasör Satış Danışmanı", "Mağaza Müdür Yardımcısı", "Mağaza Müdürü"]:
                sub = rows[rows["terfi_pozisyonu"] == role]
                avg_tenure = float(sub["terfi_kidem_yil"].mean()) if not sub.empty and sub["terfi_kidem_yil"].notna().any() else None
                summary_rows.append(
                    {
                        "terfi_pozisyonu": role,
                        "ic_terfi_sayisi": int(len(sub)),
                        "ortalama_terfi_kidem_yil": avg_tenure,
                        "ortalama_terfi_kidem_ay": float(sub["terfi_kidem_ay"].mean()) if not sub.empty and sub["terfi_kidem_ay"].notna().any() else None,
                        "order": target_order.get(role, 99),
                    }
                )
            manager_rows: list[dict] = []
            managers = rows[rows["terfi_pozisyonu"] == "Mağaza Müdürü"].copy()
            for rec in managers.sort_values(["event_period", "adi_soyadi"], ascending=[False, True]).to_dict("records"):
                prev_info = previous_promotion_info(rec)
                analysis_months, analysis_source = promotion_analysis_duration(rec, prev_info)
                event_period = rec.get("event_period")
                if not isinstance(event_period, pd.Period):
                    event_period = pd.Period(str(rec.get("month")), freq="M")
                before_avg, before_n = avg_store_turnover(rec.get("isletme_adi"), event_period - 12, event_period - 1)
                after_avg, after_n = avg_store_turnover(rec.get("isletme_adi"), event_period, selected_period)
                before_metrics = store_window_metrics(rec.get("isletme_adi"), event_period - 12, event_period - 1)
                after_metrics = store_window_metrics(rec.get("isletme_adi"), event_period, selected_period)
                turnover_delta = (after_avg - before_avg) if before_avg is not None and after_avg is not None else None
                karne_delta = (
                    after_metrics.get("karne_ortalama") - before_metrics.get("karne_ortalama")
                    if before_metrics.get("karne_ortalama") is not None and after_metrics.get("karne_ortalama") is not None
                    else None
                )
                enocta_delta = (
                    after_metrics.get("enocta_ortalama_dk") - before_metrics.get("enocta_ortalama_dk")
                    if before_metrics.get("enocta_ortalama_dk") is not None and after_metrics.get("enocta_ortalama_dk") is not None
                    else None
                )
                net_delta = (
                    after_metrics.get("net_gelir_kisi_basi") - before_metrics.get("net_gelir_kisi_basi")
                    if before_metrics.get("net_gelir_kisi_basi") is not None and after_metrics.get("net_gelir_kisi_basi") is not None
                    else None
                )
                hgo_delta = (
                    after_metrics.get("hgo_ortalama") - before_metrics.get("hgo_ortalama")
                    if before_metrics.get("hgo_ortalama") is not None and after_metrics.get("hgo_ortalama") is not None
                    else None
                )
                ciro_delta = (
                    after_metrics.get("ciro_ortalama") - before_metrics.get("ciro_ortalama")
                    if before_metrics.get("ciro_ortalama") is not None and after_metrics.get("ciro_ortalama") is not None
                    else None
                )
                manager_rows.append(
                    {
                        "terfi_ayi": str(rec.get("month") or ""),
                        "terfi_yili": int(rec.get("event_year")) if pd.notna(rec.get("event_year")) else None,
                        "sicil_no": rec.get("sicil_no"),
                        "adi_soyadi": rec.get("adi_soyadi"),
                        "bolge": rec.get("departman_adi"),
                        "magaza": rec.get("isletme_adi"),
                        "store_key": normalize_key(rec.get("isletme_adi")),
                        "terfi_kidem_yil": rec.get("terfi_kidem_yil"),
                        "terfi_kidem_ay": rec.get("terfi_kidem_ay"),
                        "terfi_analiz_suresi_ay": analysis_months,
                        "terfi_analiz_suresi_kaynagi": analysis_source,
                        **prev_info,
                        "onceki_12_ay_turnover": before_avg,
                        "onceki_12_ay_ay_sayisi": before_n,
                        "terfi_sonrasi_ortalama_turnover": after_avg,
                        "terfi_sonrasi_ay_sayisi": after_n,
                        "turnover_farki": turnover_delta,
                        "onceki_12_ay_karne_ortalama": before_metrics.get("karne_ortalama"),
                        "terfi_sonrasi_karne_ortalama": after_metrics.get("karne_ortalama"),
                        "karne_farki": karne_delta,
                        "onceki_12_ay_enocta_ortalama_dk": before_metrics.get("enocta_ortalama_dk"),
                        "terfi_sonrasi_enocta_ortalama_dk": after_metrics.get("enocta_ortalama_dk"),
                        "enocta_farki_dk": enocta_delta,
                        "onceki_12_ay_ortalama_calisan": before_metrics.get("ortalama_calisan"),
                        "terfi_sonrasi_ortalama_calisan": after_metrics.get("ortalama_calisan"),
                        "calisan_farki": (
                            after_metrics.get("ortalama_calisan") - before_metrics.get("ortalama_calisan")
                            if before_metrics.get("ortalama_calisan") is not None and after_metrics.get("ortalama_calisan") is not None
                            else None
                        ),
                        "terfi_sonrasi_cikis_sayisi": after_metrics.get("toplam_cikis"),
                        "onceki_12_ay_net_gelir_kisi_basi": before_metrics.get("net_gelir_kisi_basi"),
                        "terfi_sonrasi_net_gelir_kisi_basi": after_metrics.get("net_gelir_kisi_basi"),
                        "net_gelir_kisi_basi_farki": net_delta,
                        "onceki_12_ay_hgo_ortalama": before_metrics.get("hgo_ortalama"),
                        "terfi_sonrasi_hgo_ortalama": after_metrics.get("hgo_ortalama"),
                        "hgo_farki": hgo_delta,
                        "onceki_12_ay_ciro_ortalama": before_metrics.get("ciro_ortalama"),
                        "terfi_sonrasi_ciro_ortalama": after_metrics.get("ciro_ortalama"),
                        "ciro_farki": ciro_delta,
                        "etki_yorumu": manager_effect_label(before_avg, after_avg, before_metrics.get("karne_ortalama"), after_metrics.get("karne_ortalama")),
                    }
                )

            def manager_effect_correlation_rows(effect_rows: list[dict]) -> list[dict]:
                if not effect_rows:
                    return []
                frame = pd.DataFrame(effect_rows).copy()

                def numeric_frame_col(col: str) -> pd.Series:
                    if col in frame.columns:
                        return pd.to_numeric(frame[col], errors="coerce")
                    return pd.Series(np.nan, index=frame.index, dtype="float")

                prev_tenure = numeric_frame_col("onceki_terfiden_bu_terfiye_ay")
                promotion_tenure = numeric_frame_col("terfi_kidem_ay")
                frame["terfi_analiz_suresi_ay"] = prev_tenure.where(prev_tenure.notna(), promotion_tenure)
                tenure = frame["terfi_analiz_suresi_ay"]
                valid_tenure = tenure.dropna()
                threshold = float(valid_tenure.median()) if not valid_tenure.empty else None
                metrics = [
                    ("turnover_farki", "Turnover Fark\u0131", "lower"),
                    ("karne_farki", "Karne Fark\u0131", "higher"),
                    ("enocta_farki_dk", "Enocta Fark\u0131", "higher"),
                    ("hgo_farki", "HGO Fark\u0131", "higher"),
                    ("ciro_farki", "Ciro Fark\u0131", "higher"),
                    ("calisan_farki", "\u00c7al\u0131\u015fan Fark\u0131", "neutral"),
                ]
                bucket_defs = [
                    (0, 12, "0-12 ay"),
                    (13, 24, "13-24 ay"),
                    (25, 36, "25-36 ay"),
                    (37, None, "37+ ay"),
                ]
                out: list[dict] = []
                for key, label, better_direction in metrics:
                    if key not in frame.columns:
                        continue
                    metric = pd.to_numeric(frame[key], errors="coerce")
                    pair = pd.DataFrame({"tenure": tenure, "metric": metric}).dropna()
                    if len(pair) < 3 or pair["tenure"].nunique() < 2 or pair["metric"].nunique() < 2:
                        corr = None
                    else:
                        corr = float(pair["tenure"].corr(pair["metric"]))
                    early_avg = late_avg = None
                    if threshold is not None:
                        early_vals = pair[pair["tenure"] <= threshold]["metric"].dropna()
                        late_vals = pair[pair["tenure"] > threshold]["metric"].dropna()
                        early_avg = float(early_vals.mean()) if not early_vals.empty else None
                        late_avg = float(late_vals.mean()) if not late_vals.empty else None

                    bucket_rows: list[dict] = []
                    for start, end, bucket_label in bucket_defs:
                        if end is None:
                            vals = pair[pair["tenure"] >= start]["metric"].dropna()
                        else:
                            vals = pair[(pair["tenure"] >= start) & (pair["tenure"] <= end)]["metric"].dropna()
                        bucket_rows.append(
                            {
                                "dilim": bucket_label,
                                "min_ay": start,
                                "max_ay": end,
                                "ornek_sayisi": int(len(vals)),
                                "ortalama": float(vals.mean()) if not vals.empty else None,
                            }
                        )

                    if corr is None or not np.isfinite(corr) or abs(corr) < 0.15:
                        relation = "Zayıf / belirgin değil"
                        note = f"{label} ile terfi analiz süresi arasında belirgin bir korelasyon görünmüyor."
                    elif corr < 0:
                        relation = "Ters korelasyon"
                        note = f"Terfi analiz süresi ile {label} arasında ters korelasyon var; daha erken terfi alanlarda bu metrik daha yüksek/eğilimli olabilir."
                    else:
                        relation = "Pozitif korelasyon"
                        note = f"Terfi analiz süresi ile {label} arasında pozitif korelasyon var; daha geç terfi alanlarda bu metrik daha yüksek/eğilimli olabilir."
                    if better_direction == "lower":
                        note += " Bu metrikte düşük değer daha olumlu kabul edilir."
                    elif better_direction == "higher":
                        note += " Bu metrikte yüksek değer daha olumlu kabul edilir."

                    tone = "neutral"
                    if early_avg is not None and late_avg is not None and np.isfinite(early_avg) and np.isfinite(late_avg):
                        delta = early_avg - late_avg
                        epsilon = max(abs(late_avg) * 0.005, 0.0001)
                        if abs(delta) >= epsilon:
                            if better_direction == "lower":
                                tone = "good" if delta < 0 else "bad"
                            elif better_direction == "higher":
                                tone = "good" if delta > 0 else "bad"
                    elif corr is not None and np.isfinite(corr) and abs(corr) >= 0.15:
                        if better_direction == "lower":
                            tone = "good" if corr > 0 else "bad"
                        elif better_direction == "higher":
                            tone = "good" if corr < 0 else "bad"
                    out.append(
                        {
                            "metrik": label,
                            "korelasyon": corr,
                            "ornek_sayisi": int(len(pair)),
                            "erken_gec_esik_ay": threshold,
                            "erken_grup_ortalama": early_avg,
                            "gec_grup_ortalama": late_avg,
                            "dilimler": bucket_rows,
                            "dilim_0_12_ortalama": bucket_rows[0]["ortalama"],
                            "dilim_0_12_ornek": bucket_rows[0]["ornek_sayisi"],
                            "dilim_13_24_ortalama": bucket_rows[1]["ortalama"],
                            "dilim_13_24_ornek": bucket_rows[1]["ornek_sayisi"],
                            "dilim_25_36_ortalama": bucket_rows[2]["ortalama"],
                            "dilim_25_36_ornek": bucket_rows[2]["ornek_sayisi"],
                            "dilim_37_plus_ortalama": bucket_rows[3]["ortalama"],
                            "dilim_37_plus_ornek": bucket_rows[3]["ornek_sayisi"],
                            "iliski": relation,
                            "yorum": note,
                            "iyi_yon": better_direction,
                            "renk_durumu": tone,
                        }
                    )
                return out

            def build_store_metric_monthly(effect_rows: list[dict]) -> list[dict]:
                store_keys = {
                    str(row.get("store_key") or normalize_key(row.get("magaza"))).strip()
                    for row in effect_rows
                    if str(row.get("store_key") or normalize_key(row.get("magaza"))).strip()
                }
                if not store_keys:
                    return []

                out_by_key: dict[tuple[pd.Period, str], dict[str, object]] = {}

                def ensure_row(period_key: pd.Period, store_key: str) -> dict[str, object]:
                    return out_by_key.setdefault(
                        (period_key, store_key),
                        {
                            "month": str(period_key),
                            "store_key": store_key,
                            "turnover": None,
                            "karne_ortalama": None,
                            "enocta_ortalama_dk": None,
                            "ortalama_calisan": None,
                            "toplam_cikis": 0,
                            "net_gelir_kisi_basi": None,
                            "hgo_ortalama": None,
                            "ciro_ortalama": None,
                        },
                    )

                if not turnover_work.empty:
                    turnover_sub = turnover_work[turnover_work["store_key"].isin(store_keys)].copy()
                    for (period_key, store_key), group in turnover_sub.groupby(["month_period", "store_key"], dropna=False):
                        vals = numeric(group.get("turnover1", pd.Series(dtype="float"))).dropna()
                        if not vals.empty:
                            ensure_row(period_key, store_key)["turnover"] = float(vals.mean())

                if not store_metric_work.empty:
                    metric_sub = store_metric_work[store_metric_work["store_key"].isin(store_keys)].copy()
                    karne_col = "toplam_yuzde" if "toplam_yuzde" in metric_sub.columns else ("toplam" if "toplam" in metric_sub.columns else None)
                    net_col = "temiz_net_gelir" if "temiz_net_gelir" in metric_sub.columns else ("net_gelir" if "net_gelir" in metric_sub.columns else None)
                    for (period_key, store_key), group in metric_sub.groupby(["month_period", "store_key"], dropna=False):
                        row = ensure_row(period_key, store_key)
                        karne_vals = numeric(group[karne_col]).dropna() if karne_col else pd.Series(dtype="float")
                        enocta_vals = numeric(group["izleme_dk"]).dropna() if "izleme_dk" in group.columns else pd.Series(dtype="float")
                        calisan = safe_sum(group["calisan_sayisi"]) if "calisan_sayisi" in group.columns else float(len(group))
                        cikis = turnover_exit_sum(group)
                        net_total = safe_sum(group[net_col]) if net_col else 0.0
                        row.update(
                            {
                                "karne_ortalama": float(karne_vals.mean()) if not karne_vals.empty else row.get("karne_ortalama"),
                                "enocta_ortalama_dk": float(enocta_vals.mean()) if not enocta_vals.empty else row.get("enocta_ortalama_dk"),
                                "ortalama_calisan": float(calisan) if calisan else row.get("ortalama_calisan"),
                                "toplam_cikis": int(round(float(cikis))) if cikis else int(row.get("toplam_cikis") or 0),
                                "net_gelir_kisi_basi": safe_div(net_total, calisan) if calisan else row.get("net_gelir_kisi_basi"),
                            }
                        )

                for (period_key, store_key), target_vals in store_target_lookup.items():
                    if store_key not in store_keys:
                        continue
                    row = ensure_row(period_key, store_key)
                    if target_vals.get("hgo_ortalama") is not None:
                        row["hgo_ortalama"] = target_vals.get("hgo_ortalama")
                    if target_vals.get("ciro_ortalama") is not None:
                        row["ciro_ortalama"] = target_vals.get("ciro_ortalama")

                return [
                    row
                    for (_period_key, _store_key), row in sorted(out_by_key.items(), key=lambda item: (str(item[0][0]), item[0][1]))
                ]

            summary_rows.sort(key=lambda r: r.get("order", 99))
            for row in summary_rows:
                row.pop("order", None)
            return {
                "rows": detail_rows,
                "summary": summary_rows,
                "manager_turnover_rows": manager_rows,
                "manager_effect_correlation": manager_effect_correlation_rows(manager_rows),
                "store_metric_monthly": build_store_metric_monthly(manager_rows),
                "analysis_month": str(selected_period),
            }

        def summarize_levels(frame: pd.DataFrame) -> list[dict]:
            if frame.empty:
                return []
            grp = (
                frame.groupby(["yeni_unvan", "hareket_tipi"], dropna=False)
                .size()
                .unstack(fill_value=0)
                .reset_index()
            )
            order_map = frame.groupby("yeni_unvan")["current_rank"].max().to_dict()
            rows: list[dict] = []
            for rec in grp.to_dict("records"):
                ic = int(rec.get("İç Terfi", 0) or 0)
                dis = int(rec.get("Dış Aday", 0) or 0)
                toplam = ic + dis
                rows.append(
                    {
                        "seviye": rec.get("yeni_unvan"),
                        "ic_terfi": ic,
                        "dis_aday": dis,
                        "toplam": toplam,
                        "ic_terfi_orani": safe_div(ic, toplam),
                        "dis_aday_orani": safe_div(dis, toplam),
                        "order_rank": int(order_map.get(rec.get("yeni_unvan"), 0) or 0),
                    }
                )
            rows.sort(key=lambda r: (-r.get("order_rank", 0), normalize_key(r.get("seviye"))))
            for row in rows:
                row.pop("order_rank", None)
            return rows

        month_payload: dict[str, dict] = {}
        for month_key in months:
            month_rows = merged[merged["month"] == month_key].copy()
            merkez_rows = month_rows[month_rows["scope_key"] == "merkez"].copy()
            store_rows = month_rows[month_rows["scope_key"] == "magaza"].copy()

            merkez_rows = merkez_rows.sort_values(
                ["hareket_tipi", "current_rank", "adi_soyadi"],
                ascending=[True, False, True],
            )
            store_rows = store_rows.sort_values(
                ["isletme_adi", "hareket_tipi", "current_rank", "adi_soyadi"],
                ascending=[True, True, False, True],
            )

            keep_cols = [
                "sicil_no",
                "adi_soyadi",
                "hareket_tipi",
                "hareket_ozeti",
                "kadro_adi",
                "gorev",
                "unvan",
                "onceki_lokasyon",
                "onceki_birim",
                "onceki_unvan",
                "yeni_lokasyon",
                "yeni_birim",
                "yeni_unvan",
                "departman_adi",
                "isletme_adi",
            ]
            month_payload[month_key] = {
                "merkez_rows": merkez_rows[keep_cols].to_dict("records"),
                "merkez_summary": summarize_levels(merkez_rows),
                "store_rows": store_rows[keep_cols].to_dict("records"),
                "store_summary": summarize_levels(store_rows),
            }
        latest_tracking_month = months[-1] if months else None
        latest_store_promotion_tracking = (
            build_store_promotion_tracking(latest_tracking_month)
            if latest_tracking_month
            else {"rows": [], "summary": [], "manager_turnover_rows": [], "manager_effect_correlation": []}
        )
        return {
            "by_month": month_payload,
            "store_promotion_tracking_latest": latest_store_promotion_tracking,
        }

    def hires_dist_for_month(month: str) -> dict:
        sub = month_data(month)
        def nonzero(items: list[dict]) -> list[dict]:
            out = []
            for row in items:
                count = row.get("count")
                count_num = float(count) if count is not None and not pd.isna(count) else 0.0
                if count_num > 0:
                    out.append(row)
            return out
        promotion_rows = nonzero(dist_table(sub, "terfi_durumu", "reel_ise_giris", "promotion"))
        promotion_rows = [
            row
            for row in promotion_rows
            if normalize_key(row.get("promotion")) != "devam"
        ]

        return {
            "location": nonzero(dist_table(sub, "ust_bolum_norm", "reel_ise_giris", "loc")),
            "gender": nonzero(dist_table(sub, "cinsiyet_norm", "reel_ise_giris", "gender")),
            "contract": nonzero(dist_table(sub, "kadro_norm", "reel_ise_giris", "type")),
            "promotion_source": promotion_rows,
            "manager_promo_monthly": promotion_transition_tables.get("manager", []),
            "assistant_promo_monthly": promotion_transition_tables.get("assistant", []),
            "pasor_promo_monthly": promotion_transition_tables.get("pasor", []),
        }

    def build_hiring_time_page() -> dict:
        src = ise_alma_suresi_df.copy() if isinstance(ise_alma_suresi_df, pd.DataFrame) else pd.DataFrame()
        if src.empty:
            return {"by_month": {}, "trend": [], "overall": {}}

        def pick(candidates: list[str]) -> str | None:
            return find_first_col(src, candidates)

        month_col = pick(["Dönem", "Donem", "donem", "month"])
        sicil_col = pick(["Sicil No", "sicil_no", "sicil"])
        name_col = pick(["Adı Soyadı", "Adi Soyadi", "adi_soyadi", "ad_soyad"])
        scope_col = pick(["Üst Bölüm", "Ust Bolum", "ust_bolum"])
        dept_col = pick(["Departman", "Departman Adı", "Departman Adi", "departman_adi", "departman"])
        store_col = pick(["İşletme Adı", "Isletme Adi", "isletme_adi", "Mağaza", "Magaza"])
        unit_col = pick(["Bölüm Adı", "Bolum Adi", "bolum_adi"])
        role_col = pick(["Görev", "Gorev", "gorev"])
        title_col = pick(["Ünvan", "Unvan", "unvan"])
        kadro_col = pick(["Kadro Adı", "Kadro Adi", "kadro_adi"])
        gender_col = pick(["Cinsiyet", "cinsiyet"])
        yaka_col = pick(["Beyaz/Mavi Yaka", "beyaz_mavi_yaka"])
        entry_col = pick(["İşe Giriş Tarihi", "Ise Giris Tarihi", "ise_giris_tarihi"])
        exit_col = pick(["Çıkış Tarihi", "Cikis Tarihi", "cikis_tarihi"])
        open_date_col = pick(["Pozisyon Açılma Tarihi  ", "Pozisyon Açılma Tarihi", "Pozisyon Acilma Tarihi"])
        offer_col = pick(["Teklif Tarihi", "teklif_tarihi"])
        open_days_col = pick(["Pozisyon Açık Gün Sayısı", "Pozisyon Acik Gun Sayisi"])
        fill_days_col = pick(["Pozisyon Doldurma Süresi", "Pozisyon Doldurma Suresi"])

        work = src.copy()
        if month_col:
            work["month"] = to_month(pd.to_datetime(work[month_col], errors="coerce"))
        elif entry_col:
            work["month"] = to_month(pd.to_datetime(work[entry_col], errors="coerce"))
        else:
            return {"by_month": {}, "trend": [], "overall": {}}

        for out_col, source_col in [
            ("ise_giris_tarihi", entry_col),
            ("cikis_tarihi", exit_col),
            ("pozisyon_acilma_tarihi", open_date_col),
            ("teklif_tarihi", offer_col),
        ]:
            if source_col:
                work[out_col] = pd.to_datetime(work[source_col], errors="coerce")
            else:
                work[out_col] = pd.NaT

        work["pozisyon_acik_gun_sayisi"] = numeric(work[open_days_col]) if open_days_col else pd.Series(index=work.index, dtype="float64")
        work["pozisyon_doldurma_suresi"] = numeric(work[fill_days_col]) if fill_days_col else pd.Series(index=work.index, dtype="float64")

        if scope_col:
            work["ust_bolum"] = work[scope_col].apply(lambda v: fix_text(v).strip() if isinstance(v, str) else v)
        else:
            work["ust_bolum"] = None
        if dept_col:
            work["departman"] = work[dept_col].apply(lambda v: fix_text(v).strip() if isinstance(v, str) else v)
        else:
            work["departman"] = None
        if store_col:
            work["isletme_adi"] = work[store_col].apply(lambda v: fix_text(v).strip() if isinstance(v, str) else v)
        else:
            work["isletme_adi"] = None
        if unit_col:
            work["bolum_adi"] = work[unit_col].apply(lambda v: fix_text(v).strip() if isinstance(v, str) else v)
        else:
            work["bolum_adi"] = None
        if role_col:
            work["gorev"] = work[role_col].apply(lambda v: fix_text(v).strip() if isinstance(v, str) else v)
        else:
            work["gorev"] = None
        if title_col:
            work["unvan"] = work[title_col].apply(lambda v: fix_text(v).strip() if isinstance(v, str) else v)
        else:
            work["unvan"] = None
        if kadro_col:
            work["kadro_adi"] = work[kadro_col].apply(lambda v: fix_text(v).strip() if isinstance(v, str) else v)
        else:
            work["kadro_adi"] = None
        if name_col:
            work["adi_soyadi"] = work[name_col].apply(lambda v: fix_text(v).strip() if isinstance(v, str) else v)
        else:
            work["adi_soyadi"] = None
        if sicil_col:
            work["sicil_no"] = work[sicil_col].apply(normalize_sicil_key)
        else:
            work["sicil_no"] = None
        work["cinsiyet"] = work[gender_col].apply(lambda v: fix_text(v).strip() if isinstance(v, str) else v) if gender_col else None
        work["beyaz_mavi_yaka"] = work[yaka_col].apply(lambda v: fix_text(v).strip() if isinstance(v, str) else v) if yaka_col else None

        work = work[work["month"].notna()].copy()
        source_months = sorted(work["month"].dropna().astype(str).unique(), key=lambda m: pd.Period(m, freq="M"))
        dashboard_months = [m for m in months if m in set(source_months)] or source_months

        def metric_summary(sub: pd.DataFrame) -> dict:
            if sub.empty:
                return {
                    "hire_count": 0,
                    "avg_open_days": None,
                    "avg_fill_days": None,
                    "median_fill_days": None,
                    "p90_fill_days": None,
                    "over_30_share": None,
                    "over_45_share": None,
                }
            fill = numeric(sub["pozisyon_doldurma_suresi"]).dropna()
            open_days = numeric(sub["pozisyon_acik_gun_sayisi"]).dropna()
            return {
                "hire_count": int(len(sub)),
                "avg_open_days": float(open_days.mean()) if not open_days.empty else None,
                "avg_fill_days": float(fill.mean()) if not fill.empty else None,
                "median_fill_days": float(fill.median()) if not fill.empty else None,
                "p90_fill_days": float(fill.quantile(0.90)) if not fill.empty else None,
                "over_30_share": safe_div(float((fill > 30).sum()), float(len(fill))) if len(fill) else None,
                "over_45_share": safe_div(float((fill > 45).sum()), float(len(fill))) if len(fill) else None,
            }

        def group_summary(sub: pd.DataFrame, group_col: str, label_key: str) -> list[dict]:
            if sub.empty or group_col not in sub.columns:
                return []
            rows = []
            for label, group in sub.dropna(subset=[group_col]).groupby(group_col):
                row = {label_key: fix_text(label), **metric_summary(group)}
                rows.append(row)
            rows.sort(key=lambda r: ((r.get("avg_fill_days") or 0), r.get("hire_count") or 0), reverse=True)
            return rows

        trend = []
        by_month: dict[str, dict] = {}
        keep_cols = [
            "month",
            "sicil_no",
            "adi_soyadi",
            "ust_bolum",
            "departman",
            "isletme_adi",
            "bolum_adi",
            "gorev",
            "unvan",
            "kadro_adi",
            "cinsiyet",
            "beyaz_mavi_yaka",
            "ise_giris_tarihi",
            "cikis_tarihi",
            "pozisyon_acilma_tarihi",
            "teklif_tarihi",
            "pozisyon_acik_gun_sayisi",
            "pozisyon_doldurma_suresi",
        ]

        for month_key in dashboard_months:
            sub = work[work["month"].astype(str) == str(month_key)].copy()
            summary = metric_summary(sub)
            trend.append({"month": month_key, **summary})
            rows = sub.sort_values(["pozisyon_doldurma_suresi", "pozisyon_acik_gun_sayisi"], ascending=[False, False], na_position="last")
            by_month[month_key] = {
                "summary": summary,
                "scope_summary": group_summary(sub, "ust_bolum", "ust_bolum"),
                "department_summary": group_summary(sub, "departman", "departman"),
                "store_summary": group_summary(sub, "isletme_adi", "isletme_adi")[:30],
                "role_summary": group_summary(sub, "gorev", "gorev")[:30],
                "rows": rows[[c for c in keep_cols if c in rows.columns]].to_dict("records"),
                "filters": {
                    "scopes": sorted([fix_text(v) for v in sub["ust_bolum"].dropna().unique()]) if "ust_bolum" in sub.columns else [],
                    "departments": sorted([fix_text(v) for v in sub["departman"].dropna().unique()]) if "departman" in sub.columns else [],
                    "stores": sorted([fix_text(v) for v in sub["isletme_adi"].dropna().unique()]) if "isletme_adi" in sub.columns else [],
                },
            }

        overall = metric_summary(work)
        return normalize_text_payload({"by_month": by_month, "trend": trend, "overall": overall})

    pages["p011_hires_distribution"] = {"by_month": {m: hires_dist_for_month(m) for m in months}}
    pages["p043_hiring_time"] = timed_step("p043_hiring_time", build_hiring_time_page)
    promotion_movements_page = timed_step(
        "p033_promotion_movements",
        build_promotion_movement_page,
    )
    pages["p033_promotion_movements"] = promotion_movements_page
    pages["p042_store_promotion_tracking"] = {
        "by_month": {
            month_key: {"rows": [], "summary": [], "manager_turnover_rows": [], "manager_effect_correlation": []}
            for month_key in months
        },
        "store_promotion_tracking_latest": promotion_movements_page.get(
            "store_promotion_tracking_latest",
            {"rows": [], "summary": [], "manager_turnover_rows": [], "manager_effect_correlation": []},
        ),
    }

    def build_store_profile_compare_page() -> dict:
        turnover_lookup: dict[tuple[str, str], float] = {}
        if isinstance(turnover_store, pd.DataFrame) and not turnover_store.empty:
            store_col = find_first_col(turnover_store, ["isletme_adi", "mağaza", "magaza", "store"])
            if store_col and "turnover1" in turnover_store.columns:
                tw = turnover_store.copy()
                if "month" not in tw.columns and "donem" in tw.columns:
                    tw["month"] = to_month(tw["donem"])
                if "month" in tw.columns:
                    tw[store_col] = tw[store_col].apply(fix_text)
                    tw["turnover1"] = numeric(tw["turnover1"])
                    for rec in tw.dropna(subset=["month", store_col]).to_dict("records"):
                        turnover_lookup[(str(rec.get("month")), normalize_key(rec.get(store_col)))] = rec.get("turnover1")

        risk_lookup: dict[tuple[str, str], dict] = {}
        if isinstance(risk_df, pd.DataFrame) and not risk_df.empty and "risk_puani" in risk_df.columns:
            rw = risk_df.copy()
            if "month" not in rw.columns and "donem" in rw.columns:
                rw["month"] = to_month(rw["donem"])
            store_col = find_first_col(rw, ["isletme_adi", "magaza_adi", "mağaza", "magaza", "store"])
            if store_col and "month" in rw.columns:
                rw[store_col] = rw[store_col].apply(normalize_key)
                rw["risk_puani"] = numeric(rw["risk_puani"])
                for (month_key, store_key), group in rw.dropna(subset=["month", store_col]).groupby(["month", store_col], dropna=False):
                    scores = group["risk_puani"].dropna()
                    risk_lookup[(str(month_key), str(store_key))] = {
                        "avg_risk": float(scores.mean()) if not scores.empty else None,
                        "high_risk_count": int((scores >= 70).sum()) if not scores.empty else 0,
                    }

        regrettable_lookup: dict[tuple[str, str], int] = {}
        if isinstance(v2_regrettable_detail_df, pd.DataFrame) and not v2_regrettable_detail_df.empty:
            reg = v2_regrettable_detail_df.copy()
            if "month" not in reg.columns and "donem" in reg.columns:
                reg["month"] = to_month(reg["donem"])
            store_col = find_first_col(reg, ["isletme_adi", "magaza_adi", "mağaza", "magaza", "store"])
            if store_col and "month" in reg.columns:
                reg[store_col] = reg[store_col].apply(normalize_key)
                for (month_key, store_key), group in reg.dropna(subset=["month", store_col]).groupby(["month", store_col], dropna=False):
                    regrettable_lookup[(str(month_key), str(store_key))] = int(len(group))

        org_lookup: dict[tuple[str, str], dict] = {}
        org_page = pages.get("p037_org_dev_employee_tracking", {})
        org_month = (org_page.get("latest_month") if isinstance(org_page, dict) else None) or (months[-1] if months else None)
        org_payload = ((org_page.get("by_month", {}) or {}).get(org_month, {}) if isinstance(org_page, dict) else {})
        org_rows = org_payload.get("rows", []) if isinstance(org_payload, dict) else []
        if org_rows:
            org_df = pd.DataFrame(org_rows)
            if not org_df.empty and "magaza" in org_df.columns:
                org_df["store_key"] = org_df["magaza"].apply(normalize_key)
                for store_key, group in org_df.groupby("store_key", dropna=False):
                    total = int(len(group))
                    if total <= 0:
                        continue
                    academy = group["satis_akademisi_mezun"].apply(lambda value: "mezun" in normalize_key(value) and "degil" not in normalize_key(value)).mean() if "satis_akademisi_mezun" in group.columns else np.nan
                    if "gelisim_yolculugu_oran" in group.columns:
                        dev_series = numeric(group["gelisim_yolculugu_oran"]).dropna()
                        development = float(dev_series.mean() / 100) if not dev_series.empty else np.nan
                    elif "gelisim_yolculugu_durumu" in group.columns:
                        development = group["gelisim_yolculugu_durumu"].apply(lambda value: "tamam" in normalize_key(value)).mean()
                    else:
                        development = np.nan
                    org_lookup[(str(org_month), str(store_key))] = {
                        "academy_graduation_rate": float(academy) if pd.notna(academy) else None,
                        "development_completion_rate": float(development) if pd.notna(development) else None,
                    }

        def org_metrics_for_store(month_key: str, store_key: str) -> dict:
            return org_lookup.get((month_key, store_key)) or org_lookup.get((str(org_month), store_key)) or {}

        norm_total_lookup: dict[str, float] = {}
        if isinstance(norm_fiili_kadro_df, pd.DataFrame) and not norm_fiili_kadro_df.empty and len(norm_fiili_kadro_df.columns) > 6:
            norm_cols = list(norm_fiili_kadro_df.columns)
            title_norm_cols: list[str] = []
            i = 5
            while i < len(norm_cols) - 1:
                col = str(norm_cols[i])
                next_col = str(norm_cols[i + 1])
                if col and not col.lower().startswith("unnamed") and next_col.lower().startswith("unnamed"):
                    title_norm_cols.append(norm_cols[i])
                    i += 2
                else:
                    i += 1
            if len(norm_cols) > 1 and title_norm_cols:
                for _, rec in norm_fiili_kadro_df.iloc[1:].iterrows():
                    store_key = normalize_key(rec.get(norm_cols[1]))
                    if not store_key:
                        continue
                    norm_total = sum(float(pd.to_numeric(pd.Series([rec.get(col)]), errors="coerce").fillna(0).iloc[0]) for col in title_norm_cols)
                    if norm_total > 0:
                        norm_total_lookup[store_key] = norm_total

        hgo_lookup: dict[tuple[str, str], float] = {}
        if isinstance(magaza_hedef_ciro_df, pd.DataFrame) and not magaza_hedef_ciro_df.empty:
            hgo_src = magaza_hedef_ciro_df.copy()
            if "month" not in hgo_src.columns and "donem" in hgo_src.columns:
                hgo_src["month"] = to_month(hgo_src["donem"])
            store_col = find_first_col(hgo_src, ["mag_adi", "isletme_adi", "magaza_adi", "magaza", "store"])
            if store_col and "hgo" in hgo_src.columns and "month" in hgo_src.columns:
                hgo_src[store_col] = hgo_src[store_col].apply(normalize_key)
                hgo_src["hgo"] = numeric(hgo_src["hgo"])
                for (month_key, store_key), group in hgo_src.dropna(subset=["month", store_col]).groupby(["month", store_col], dropna=False):
                    vals = group["hgo"].dropna()
                    if not vals.empty:
                        hgo_lookup[(str(month_key), str(store_key))] = float(vals.mean())

        ciro_lookup: dict[tuple[str, str], float] = {}
        if isinstance(magaza_hedef_ciro_df, pd.DataFrame) and not magaza_hedef_ciro_df.empty:
            ciro_src = magaza_hedef_ciro_df.copy()
            if "month" not in ciro_src.columns and "donem" in ciro_src.columns:
                ciro_src["month"] = to_month(ciro_src["donem"])
            store_col = find_first_col(ciro_src, ["mag_adi", "isletme_adi", "magaza_adi", "magaza", "store"])
            ciro_col = find_first_col(ciro_src, ["omni_ciro", "ciro", "ciro_hedef"])
            if store_col and ciro_col and "month" in ciro_src.columns:
                ciro_src[store_col] = ciro_src[store_col].apply(normalize_key)
                ciro_src[ciro_col] = numeric(ciro_src[ciro_col])
                for (month_key, store_key), group in ciro_src.dropna(subset=["month", store_col]).groupby(["month", store_col], dropna=False):
                    vals = group[ciro_col].dropna()
                    if not vals.empty:
                        ciro_lookup[(str(month_key), str(store_key))] = float(vals.mean())

        hiring_duration_lookup: dict[tuple[str, str], float] = {}
        if isinstance(ise_alma_suresi_df, pd.DataFrame) and not ise_alma_suresi_df.empty:
            hiring_src = ise_alma_suresi_df.copy()
            if "month" not in hiring_src.columns and "Dönem" in hiring_src.columns:
                hiring_src["month"] = to_month(hiring_src["Dönem"])
            elif "month" not in hiring_src.columns and "donem" in hiring_src.columns:
                hiring_src["month"] = to_month(hiring_src["donem"])
            store_col = find_first_col(hiring_src, ["İşletme Adı", "isletme_adi", "magaza_adi", "mağaza", "magaza", "store"])
            scope_col = find_first_col(hiring_src, ["Üst Bölüm", "ust_bolum", "ust_bolum_adi"])
            duration_col = find_first_col(hiring_src, ["Pozisyon Doldurma Süresi", "pozisyon_doldurma_suresi", "kapatma_suresi", "sure"])
            if store_col and duration_col and "month" in hiring_src.columns:
                if scope_col:
                    scope_key = hiring_src[scope_col].apply(normalize_key)
                    store_scope = scope_key.eq("magaza") | scope_key.str.contains("magaza", na=False)
                    if store_scope.any():
                        hiring_src = hiring_src[store_scope].copy()
                hiring_src[store_col] = hiring_src[store_col].apply(normalize_key)
                hiring_src[duration_col] = numeric(hiring_src[duration_col])
                for (month_key, store_key), group in hiring_src.dropna(subset=["month", store_col]).groupby(["month", store_col], dropna=False):
                    vals = group[duration_col].dropna()
                    if not vals.empty:
                        hiring_duration_lookup[(str(month_key), str(store_key))] = float(vals.mean())

        score_lookup: dict[tuple[str, str], float] = {}
        if isinstance(magaza_all_df, pd.DataFrame) and not magaza_all_df.empty and "isletme_adi" in magaza_all_df.columns:
            score_src = magaza_all_df.copy()
            if "month" not in score_src.columns and "donem" in score_src.columns:
                score_src["month"] = to_month(score_src["donem"])
            score_col_hist = "toplam_yuzde" if "toplam_yuzde" in score_src.columns else ("toplam" if "toplam" in score_src.columns else None)
            if score_col_hist and "month" in score_src.columns:
                score_src["store_key"] = score_src["isletme_adi"].apply(normalize_key)
                score_src[score_col_hist] = numeric(score_src[score_col_hist])
                for (month_hist, store_hist), group in score_src.dropna(subset=["month", "store_key"]).groupby(["month", "store_key"], dropna=False):
                    vals = group[score_col_hist].dropna()
                    if not vals.empty:
                        score_lookup[(str(month_hist), str(store_hist))] = float(vals.mean())

        def last_12_month_keys(month_key: str) -> list[str]:
            try:
                end = pd.Period(str(month_key), freq="M")
            except Exception:
                return []
            out = []
            for step in range(11, -1, -1):
                out.append(str(end - step))
            return out

        def score_value_for_store(month_key: str, store_key: str, current_series: pd.Series) -> tuple[float | None, str]:
            vals = current_series.dropna()
            if not vals.empty:
                return float(vals.mean()), "Seçili ay karnesi"
            window = last_12_month_keys(month_key)
            store_vals = [score_lookup[(m, store_key)] for m in window if (m, store_key) in score_lookup]
            if store_vals:
                return float(pd.Series(store_vals).mean()), "Son 12 ay ortalaması"
            global_vals = [val for (m, _), val in score_lookup.items() if m in window]
            if global_vals:
                return float(pd.Series(global_vals).mean()), "Tüm mağazalar ortalaması"
            return None, "Karne yok"

        def hgo_value_for_store(month_key: str, store_key: str) -> float | None:
            window = last_12_month_keys(month_key)
            vals = [hgo_lookup[(m, store_key)] for m in window if (m, store_key) in hgo_lookup]
            return float(pd.Series(vals).mean()) if vals else None

        def ciro_value_for_store(month_key: str, store_key: str) -> float | None:
            window = last_12_month_keys(month_key)
            vals = [ciro_lookup[(m, store_key)] for m in window if (m, store_key) in ciro_lookup]
            return float(pd.Series(vals).mean()) if vals else None

        def hiring_duration_for_store(month_key: str, store_key: str) -> float | None:
            window = last_12_month_keys(month_key)
            vals = [hiring_duration_lookup[(m, store_key)] for m in window if (m, store_key) in hiring_duration_lookup]
            return float(pd.Series(vals).mean()) if vals else None

        by_month: dict[str, dict] = {}
        for month_key in months:
            sub = month_data(month_key).copy()
            if sub.empty or "isletme_adi" not in sub.columns:
                by_month[month_key] = {"rows": [], "stores": []}
                continue
            if "ust_bolum_key" in sub.columns:
                sub = sub[sub["ust_bolum_key"] == "magaza"].copy()
            elif "ust_bolum" in sub.columns:
                sub = sub[sub["ust_bolum"].apply(normalize_key) == "magaza"].copy()
            if sub.empty:
                by_month[month_key] = {"rows": [], "stores": []}
                continue
            for col in [
                "calisan_sayisi",
                "reel_ise_giris",
                "cikis",
                "cikis",
                "reel_isten_cikis",
                "donem_basi",
                "donem_sonu",
                "temiz_net_gelir",
                "net_gelir",
                "toplam_yuzde",
                "toplam",
                "izleme_dk",
                "hgo",
            ]:
                if col in sub.columns:
                    sub[col] = numeric(sub[col])
            sub["store_key"] = sub["isletme_adi"].apply(normalize_key)
            rows: list[dict] = []
            for store_key, group in sub.groupby("store_key", dropna=False):
                if not store_key:
                    continue
                store_name = str(group["isletme_adi"].dropna().iloc[0]) if group["isletme_adi"].notna().any() else str(store_key)
                region_name = str(group["departman_adi"].dropna().iloc[0]) if "departman_adi" in group.columns and group["departman_adi"].notna().any() else ""
                headcount = safe_sum(group["calisan_sayisi"]) if "calisan_sayisi" in group.columns else len(group)
                entries = safe_sum(group["reel_ise_giris"]) if "reel_ise_giris" in group.columns else 0
                exits = turnover_exit_sum(group)
                net_col = "temiz_net_gelir" if "temiz_net_gelir" in group.columns else ("net_gelir" if "net_gelir" in group.columns else None)
                score_col = "toplam_yuzde" if "toplam_yuzde" in group.columns else ("toplam" if "toplam" in group.columns else None)
                net_total = safe_sum(group[net_col]) if net_col else 0
                score_series = group[score_col].dropna() if score_col else pd.Series(dtype="float")
                score_value, score_source = score_value_for_store(month_key, store_key, score_series)
                enocta_series = group["izleme_dk"].dropna() if "izleme_dk" in group.columns else pd.Series(dtype="float")
                turnover_value = turnover_lookup.get((month_key, store_key))
                if pd.isna(turnover_value) or turnover_value is None:
                    denom = ((safe_sum(group["donem_basi"]) + safe_sum(group["donem_sonu"])) / 2) if {"donem_basi", "donem_sonu"}.issubset(group.columns) else headcount
                    turnover_value = safe_div(exits, denom) if denom else 0
                risk = risk_lookup.get((month_key, store_key), {})
                regret_count = regrettable_lookup.get((month_key, store_key), 0)
                org = org_metrics_for_store(month_key, store_key)
                norm_total = norm_total_lookup.get(store_key)
                hgo_value = hgo_value_for_store(month_key, store_key)
                ciro_value = ciro_value_for_store(month_key, store_key)
                hiring_duration = hiring_duration_for_store(month_key, store_key)
                rows.append(
                    {
                        "store": fix_text(store_name),
                        "region": fix_text(region_name),
                        "headcount": int(round(headcount)),
                        "entries": int(round(entries)),
                        "exits": int(round(exits)),
                        "turnover": float(turnover_value or 0),
                        "avg_scorecard": score_value,
                        "avg_scorecard_source": score_source,
                        "net_gelir_kisi_basi": float(net_total / headcount) if headcount else None,
                        "norm_toplam": float(norm_total) if norm_total else None,
                        "norm_fiili_orani": float(headcount / norm_total) if norm_total and norm_total > 0 else None,
                        "avg_hgo": hgo_value,
                        "avg_ciro": ciro_value,
                        "position_close_days": hiring_duration,
                        "academy_graduation_rate": org.get("academy_graduation_rate"),
                        "development_completion_rate": org.get("development_completion_rate"),
                        "avg_enocta_dk": float(enocta_series.mean()) if not enocta_series.empty else None,
                        "avg_risk": risk.get("avg_risk"),
                        "high_risk_count": risk.get("high_risk_count", 0),
                        "regrettable_cikis": int(regret_count),
                        "regrettable_turnover_rate": float(regret_count / headcount) if headcount else None,
                    }
                )
            rows.sort(key=lambda r: (str(r.get("region") or ""), str(r.get("store") or "")))
            by_month[month_key] = {"rows": rows, "stores": [r["store"] for r in rows if r.get("store")]}
        return normalize_text_payload({"by_month": by_month})

    # p045, Organizasyonel Gelişim çalışan takibi hazırlandıktan sonra üretilir.
    # Aksi halde Akademi/Gelişim oranları henüz pages sözlüğünde bulunmadığı için
    # tüm mağazalarda boş kalır.

    def generation_hires_for_month(month: str) -> dict:
        sub = month_data(month)
        if sub.empty:
            return {"rows": []}
        total_hires = safe_sum(sub["reel_ise_giris"]) if "reel_ise_giris" in sub else 0
        rows = []
        if "kusak_aralik" in sub.columns:
            for gen, group in sub.groupby("kusak_aralik"):
                headcount = safe_sum(group["calisan_sayisi"]) if "calisan_sayisi" in group else 0
                hires = safe_sum(group["reel_ise_giris"]) if "reel_ise_giris" in group else 0
                rows.append(
                    {
                        "gen": fix_text(gen),
                        "headcount": headcount,
                        "hires": hires,
                        "hire_rate": safe_div(hires, headcount) if headcount else 0,
                        "hire_share": safe_div(hires, total_hires) if total_hires else 0,
                    }
                )
        rows.sort(key=lambda x: x.get("hires", 0), reverse=True)
        return {"rows": rows}

    pages["p012_generation_hires"] = {"by_month": {m: generation_hires_for_month(m) for m in months}}

    def build_turnover_trends() -> dict:
        loc_key_map = {"Edirne": "edirne", "Mağaza": "magaza", "Merkez": "merkez"}
        turnover_locations = [
            group_label,
            "Mağaza",
            "Merkez",
            "Edirne",
            "Mağaza Part",
            "Mağaza Full",
        ]

        def prep_turnover_sheet(src: pd.DataFrame) -> pd.DataFrame:
            if src.empty:
                return src
            out = src.copy()
            for col in ["turnover1", "cikis", "ortalama1"]:
                if col in out.columns:
                    out[col] = numeric(out[col])
            if "donem" in out.columns:
                dt = pd.to_datetime(out["donem"], errors="coerce")
                if "year" not in out.columns:
                    out["year"] = dt.dt.year
                if "month_num" not in out.columns:
                    out["month_num"] = dt.dt.month
            if "year" in out.columns:
                out["year"] = numeric(out["year"]).round().astype("Int64")
            if "month_num" in out.columns:
                out["month_num"] = numeric(out["month_num"]).round().astype("Int64")
            return out

        ust_sheet = prep_turnover_sheet(turnover_ust)
        genel_sheet = prep_turnover_sheet(turnover_genel)

        src_cols = [
            c
            for c in [
                "year",
                "month_num",
                "ust_bolum_norm",
                "cikis",
                "reel_isten_cikis",
                "calisan_sayisi",
                "donem_basi",
                "donem_sonu",
                "kadro_adi",
            ]
            if c in df.columns
        ]
        src_turn = df[src_cols].copy()
        src_turn["kadro_key"] = (
            src_turn["kadro_adi"].map(normalize_key)
            if "kadro_adi" in src_turn.columns
            else ""
        )
        src_turn["cikis_num"] = turnover_exit_series(src_turn).reindex(src_turn.index).fillna(0)
        src_turn["calisan_sayisi_num"] = numeric(src_turn["calisan_sayisi"]).fillna(0) if "calisan_sayisi" in src_turn.columns else 0.0
        src_turn["donem_basi_num"] = numeric(src_turn["donem_basi"]).fillna(0) if "donem_basi" in src_turn.columns else 0.0
        src_turn["donem_sonu_num"] = numeric(src_turn["donem_sonu"]).fillna(0) if "donem_sonu" in src_turn.columns else 0.0

        def fallback_monthly_for_loc(loc: str) -> pd.DataFrame:
            if loc == group_label:
                sub = src_turn.copy()
            elif loc == "Mağaza Part":
                sub = src_turn[
                    (src_turn["ust_bolum_norm"] == "Mağaza")
                    & src_turn["kadro_key"].str.contains("part time", na=False)
                ].copy()
            elif loc == "Mağaza Full":
                sub = src_turn[
                    (src_turn["ust_bolum_norm"] == "Mağaza")
                    & ~src_turn["kadro_key"].str.contains("part time", na=False)
                ].copy()
            else:
                sub = src_turn[src_turn["ust_bolum_norm"] == loc].copy()
            if sub.empty:
                return pd.DataFrame(columns=["year", "month_num", "cikis", "ortalama1", "turnover1"])
            agg = (
                sub.groupby(["year", "month_num"], as_index=False)
                .agg(
                    cikis=("cikis_num", "sum"),
                    donem_basi=("donem_basi_num", "sum"),
                    donem_sonu=("donem_sonu_num", "sum"),
                    headcount_fallback=("calisan_sayisi_num", "sum"),
                )
            )
            agg["ortalama1"] = np.where(
                (agg["donem_basi"] + agg["donem_sonu"]) > 0,
                (agg["donem_basi"] + agg["donem_sonu"]) / 2,
                agg["headcount_fallback"],
            )
            agg["turnover1"] = np.where(agg["ortalama1"] > 0, agg["cikis"] / agg["ortalama1"], np.nan)
            return agg

        fallback_cache = {loc: fallback_monthly_for_loc(loc) for loc in turnover_locations}

        def get_month_value(year_src: pd.DataFrame, month_num: int, col: str) -> float | None:
            if year_src.empty or col not in year_src.columns:
                return None
            if "month_num" not in year_src.columns:
                return None
            month_series = numeric(year_src["month_num"]).round()
            val = year_src.loc[month_series == month_num, col]
            if val.empty:
                return None
            num = numeric(val).iloc[0]
            return float(num) if pd.notna(num) else None

        def build_loc_series(loc: str, year: int) -> dict:
            if loc == group_label:
                sheet_src = genel_sheet
                key_col = None
                key_val = None
            elif loc in {"Mağaza Part", "Mağaza Full"}:
                # Part/Full üst bölüm özetinde ayrı kolonlar değildir; kişi
                # satırlarından oluşturulan standart formül sonucu kullanılır.
                sheet_src = pd.DataFrame()
                key_col = None
                key_val = None
            else:
                sheet_src = ust_sheet
                key_col = "ust_bolum_key" if "ust_bolum_key" in ust_sheet.columns else "ust_bolum_norm"
                key_val = loc_key_map.get(loc, normalize_key(loc)) if key_col == "ust_bolum_key" else loc

            if "year" in sheet_src.columns:
                year_mask = numeric(sheet_src["year"]).round() == year
                year_sheet = sheet_src[year_mask.fillna(False)].copy()
            else:
                year_sheet = pd.DataFrame()
            if key_col and key_col in year_sheet.columns:
                year_sheet = year_sheet[year_sheet[key_col] == key_val]
            elif key_col:
                year_sheet = pd.DataFrame()

            fb_src = fallback_cache.get(loc, pd.DataFrame())
            if not fb_src.empty and "year" in fb_src.columns:
                fb_year_mask = numeric(fb_src["year"]).round() == year
                year_fb = fb_src[fb_year_mask.fillna(False)].copy()
            else:
                year_fb = pd.DataFrame()

            monthly: list[float | None] = []
            running_turnover = 0.0
            cum: list[float | None] = []

            for m in range(1, 13):
                monthly_val = get_month_value(year_sheet, m, "turnover1")
                if monthly_val is None:
                    monthly_val = get_month_value(year_fb, m, "turnover1")
                monthly.append(monthly_val)
                if monthly_val is not None:
                    running_turnover += monthly_val
                    cum.append(running_turnover)
                else:
                    cum.append(None)

            prev_years: dict[str, list[float | None]] = {}
            prev_years_cum: dict[str, list[float | None]] = {}
            for offset in [1, 2]:
                prev_year = year - offset
                if "year" in sheet_src.columns:
                    prev_mask = numeric(sheet_src["year"]).round() == prev_year
                    prev_sheet = sheet_src[prev_mask.fillna(False)].copy()
                else:
                    prev_sheet = pd.DataFrame()
                if key_col and key_col in prev_sheet.columns:
                    prev_sheet = prev_sheet[prev_sheet[key_col] == key_val]
                elif key_col:
                    prev_sheet = pd.DataFrame()
                if not fb_src.empty and "year" in fb_src.columns:
                    fb_prev_mask = numeric(fb_src["year"]).round() == prev_year
                    prev_fb = fb_src[fb_prev_mask.fillna(False)].copy()
                else:
                    prev_fb = pd.DataFrame()
                prev_vals: list[float | None] = []
                running_prev = 0.0
                prev_cum: list[float | None] = []
                for m in range(1, 13):
                    pv = get_month_value(prev_sheet, m, "turnover1")
                    if pv is None:
                        pv = get_month_value(prev_fb, m, "turnover1")
                    prev_vals.append(pv)
                    if pv is not None:
                        running_prev += pv
                        prev_cum.append(running_prev)
                    else:
                        prev_cum.append(None)
                prev_years[str(prev_year)] = prev_vals
                prev_years_cum[str(prev_year)] = prev_cum

            return {"monthly": monthly, "cum": cum, "prev_years": prev_years, "prev_years_cum": prev_years_cum}

        years_general = genel_sheet.get("year", pd.Series(dtype=int)).dropna().astype(int).tolist()
        years_ust = ust_sheet.get("year", pd.Series(dtype=int)).dropna().astype(int).tolist()
        years_sonuc = df.get("year", pd.Series(dtype=int)).dropna().astype(int).tolist()
        all_years = sorted(set(years_general + years_ust + years_sonuc))

        data_by_year: dict[str, dict] = {}
        diagnostics: dict[str, dict] = {}
        for year in all_years:
            year_str = str(year)
            loc_data = {}
            diagnostics[year_str] = {}
            for loc in turnover_locations:
                series = build_loc_series(loc, year)
                loc_data[loc] = series
                diagnostics[year_str][loc] = {
                    "monthly_points": int(sum(1 for v in series["monthly"] if v is not None)),
                    "cum_points": int(sum(1 for v in series["cum"] if v is not None)),
                }
            data_by_year[year_str] = {"months": [f"{m:02d}" for m in range(1, 13)], "locations": loc_data}

        return {"by_year": data_by_year, "diagnostics": diagnostics}

    pages["p013_turnover_trends"] = timed_step("p013_turnover_trends", build_turnover_trends)

    def exits_dist_for_month(month: str) -> dict:
        sub = month_data(month)
        exit_work = sub.assign(_turnover_cikis=turnover_exit_series(sub)) if not sub.empty else sub
        return {
            "location": dist_table(exit_work, "ust_bolum_norm", "_turnover_cikis", "loc"),
            "gender": dist_table(exit_work, "cinsiyet_norm", "_turnover_cikis", "gender"),
            "contract": dist_table(exit_work, "kadro_norm", "_turnover_cikis", "type"),
        }

    pages["p014_exits_distribution"] = {"by_month": {m: exits_dist_for_month(m) for m in months}}

    def exit_summary_for_year(year: int, month: str) -> dict:
        selected_month_num = int(str(month)[5:7]) if len(str(month)) >= 7 else 12
        selected_year = int(year)
        year_df = year_data(selected_year)
        month_df = month_data(month)
        rows = []
        dist = {}

        def part_time_mask(frame: pd.DataFrame) -> pd.Series:
            if frame.empty:
                return pd.Series(False, index=frame.index)
            if "kadro_adi" in frame.columns:
                key = frame["kadro_adi"].map(normalize_key)
            elif "kadro_norm" in frame.columns:
                key = frame["kadro_norm"].map(normalize_key)
            else:
                key = pd.Series("", index=frame.index)
            return key.str.contains("part time", na=False)

        def scope_frame(frame: pd.DataFrame, scope: str) -> pd.DataFrame:
            if frame.empty:
                return frame.copy()
            if scope == group_label:
                return frame.copy()
            magaza_label = "Ma\u011faza"
            upper = frame["ust_bolum_norm"] if "ust_bolum_norm" in frame.columns else pd.Series("", index=frame.index)
            if scope == f"{magaza_label} Part":
                return frame[(upper == magaza_label) & part_time_mask(frame)].copy()
            if scope == f"{magaza_label} Full":
                return frame[(upper == magaza_label) & ~part_time_mask(frame)].copy()
            if "ust_bolum_norm" in frame.columns:
                return frame[frame["ust_bolum_norm"] == scope].copy()
            return frame.iloc[0:0].copy()

        def period_frame(source_year: int, through_month: int | None = None) -> pd.DataFrame:
            base = year_data(source_year).copy()
            if base.empty:
                return base
            if through_month is not None and "month_num" in base.columns:
                month_nums = numeric(base["month_num"])
                base = base[month_nums <= through_month].copy()
            return base

        def month_frame_for(source_year: int, month_num: int) -> pd.DataFrame:
            return month_data(f"{source_year}-{month_num:02d}").copy()

        def exit_rows_with_tenure(frame: pd.DataFrame) -> pd.DataFrame:
            if frame.empty:
                return frame.assign(_turnover_cikis=pd.Series(dtype="float64"), _tenure_days=pd.Series(dtype="float64"))
            out = frame.copy()
            out["_turnover_cikis"] = turnover_exit_series(out).reindex(out.index).fillna(0)
            out = out[out["_turnover_cikis"] > 0].copy()
            if out.empty:
                out["_tenure_days"] = pd.Series(dtype="float64")
                return out
            exit_dt = pd.to_datetime(out["cikis_tarihi"], errors="coerce") if "cikis_tarihi" in out.columns else pd.Series(pd.NaT, index=out.index)
            if "month" in out.columns:
                month_end = pd.to_datetime(out["month"].astype(str) + "-01", errors="coerce") + pd.offsets.MonthEnd(0)
                exit_dt = exit_dt.fillna(month_end)
            start_col = next((col for col in ["ise_giris_tarihi", "son_giris_tarihi", "ilk_baslama_tarihi"] if col in out.columns), None)
            start_dt = pd.to_datetime(out[start_col], errors="coerce") if start_col else pd.Series(pd.NaT, index=out.index)
            tenure_days = (exit_dt - start_dt).dt.days.astype("float64")
            if "kidem_yil" in out.columns:
                tenure_days = tenure_days.fillna(numeric(out["kidem_yil"]) * 365)
            out["_tenure_days"] = tenure_days.where(tenure_days >= 0)
            return out

        def weighted_exit_count(frame: pd.DataFrame) -> float:
            return float(turnover_exit_sum(frame))

        def avg_tenure_days(frame: pd.DataFrame) -> float | None:
            exits = exit_rows_with_tenure(frame)
            if exits.empty or "_tenure_days" not in exits.columns:
                return None
            valid = exits.dropna(subset=["_tenure_days"])
            if valid.empty:
                return None
            weights = numeric(valid["_turnover_cikis"]).fillna(0)
            days = numeric(valid["_tenure_days"])
            weight_sum = float(weights.sum())
            if weight_sum <= 0:
                return float(days.mean()) if not days.dropna().empty else None
            return float((days * weights).sum() / weight_sum)

        def tenure_label(days: float | None) -> str:
            if days is None or pd.isna(days):
                return "Belirsiz"
            if days < 10:
                return "10 G\u00fcnden Az"
            if days < 60:
                return "10 G\u00fcn - 2 Ay"
            if days < 180:
                return "2-6 Ay"
            if days < 365:
                return "6 Ay - 1 Y\u0131l"
            if days < 730:
                return "1 - 2 Y\u0131l"
            return "2 Y\u0131l ve \u00dcst\u00fc"

        tenure_buckets = ["10 G\u00fcnden Az", "10 G\u00fcn - 2 Ay", "2-6 Ay", "6 Ay - 1 Y\u0131l", "1 - 2 Y\u0131l", "2 Y\u0131l ve \u00dcst\u00fc"]
        magaza_label = "Ma\u011faza"
        comparison_scopes = [group_label, "Edirne", "Merkez", f"{magaza_label} Part", f"{magaza_label} Full", magaza_label]

        for loc in [group_label] + locations:
            year_loc = scope_frame(year_df, loc)
            month_loc = scope_frame(month_df, loc)
            year_exits = turnover_exit_sum(year_loc)
            month_exits = turnover_exit_sum(month_loc)
            avg_days = avg_tenure_days(year_loc)
            rows.append(
                {
                    "loc": loc,
                    "year_exits": year_exits,
                    "month_exits": month_exits,
                    "avg_tenure_days": avg_days,
                    "avg_tenure_years": avg_days / 365 if avg_days else None,
                }
            )
            if "kidem_gun" in year_loc.columns:
                year_loc_with_exit = year_loc.assign(_turnover_cikis=turnover_exit_series(year_loc))
                dist_vals = (
                    year_loc_with_exit[year_loc_with_exit["_turnover_cikis"] > 0]
                    .groupby("kidem_gun")["_turnover_cikis"]
                    .sum(min_count=1)
                )
                dist_vals = dist_vals.dropna()
                order_map = {label: idx for idx, label in enumerate(tenure_buckets, start=1)}
                rows_dist = [{"label": fix_text(k), "value": float(v)} for k, v in dist_vals.items()]
                rows_dist.sort(key=lambda r: order_map.get(str(r.get("label", "")).strip(), 999))
                dist[loc] = rows_dist

        tenure_analysis: list[dict] = []
        prev_year = selected_year - 1
        current_ytd = period_frame(selected_year, selected_month_num)
        prev_ytd = period_frame(prev_year, selected_month_num)
        prev_month = month_frame_for(prev_year, selected_month_num)
        for scope in comparison_scopes:
            current_month_scope = scope_frame(month_df, scope)
            current_ytd_scope = scope_frame(current_ytd, scope)
            prev_month_scope = scope_frame(prev_month, scope)
            prev_ytd_scope = scope_frame(prev_ytd, scope)
            exits = exit_rows_with_tenure(current_month_scope)
            bucket_counts = {label: 0.0 for label in tenure_buckets}
            if not exits.empty:
                exits["_bucket"] = exits["_tenure_days"].apply(tenure_label)
                bucket_series = exits.groupby("_bucket")["_turnover_cikis"].sum(min_count=1).dropna()
                for label, value in bucket_series.items():
                    if label in bucket_counts:
                        bucket_counts[label] += float(value)
            tenure_analysis.append(
                {
                    "scope": scope,
                    "month": month,
                    "prev_year_month": f"{prev_year}-{selected_month_num:02d}",
                    "buckets": [{"label": label, "value": float(bucket_counts.get(label, 0.0))} for label in tenure_buckets],
                    "summary": {
                        "current_ytd_exits": weighted_exit_count(current_ytd_scope),
                        "current_month_exits": weighted_exit_count(current_month_scope),
                        "current_ytd_avg_tenure_days": avg_tenure_days(current_ytd_scope),
                        "prev_ytd_exits": weighted_exit_count(prev_ytd_scope),
                        "prev_month_exits": weighted_exit_count(prev_month_scope),
                        "prev_ytd_avg_tenure_days": avg_tenure_days(prev_ytd_scope),
                    },
                }
            )

        return {"rows": rows, "distributions": dist, "tenure_analysis": tenure_analysis}

    pages["p015_exit_summary"] = {
        "by_month": {m: exit_summary_for_year(int(m[:4]), m) for m in months}
    }
    log_step("Sayfa 10-15 tamamlandı")
    def early_turnover_summary_for_month(selected_month: str) -> dict:
        try:
            selected_period = pd.Period(str(selected_month), freq="M")
        except Exception:
            selected_period = None

        def month_in_window(month_key: str) -> bool:
            if selected_period is None:
                return True
            try:
                return pd.Period(str(month_key), freq="M") <= selected_period
            except Exception:
                return False

        window_months = [m for m in months if month_in_window(m)]
        if not window_months:
            return {"scopes": locations, "window_months": [], "scope_tables": {}}

        source = df[df["month"].astype(str).isin(window_months)].copy() if "month" in df.columns else empty_df.copy()

        def with_tenure_days(exit_rows: pd.DataFrame) -> pd.DataFrame:
            out = exit_rows.copy()
            if out.empty:
                out["_tenure_days"] = pd.Series(dtype="float64")
                return out
            exit_dt = pd.to_datetime(out["cikis_tarihi"], errors="coerce") if "cikis_tarihi" in out.columns else pd.Series(pd.NaT, index=out.index)
            start_col = "ise_giris_tarihi" if "ise_giris_tarihi" in out.columns else ("son_giris_tarihi" if "son_giris_tarihi" in out.columns else None)
            start_dt = pd.to_datetime(out[start_col], errors="coerce") if start_col else pd.Series(pd.NaT, index=out.index)
            tenure_days = (exit_dt - start_dt).dt.days
            if "kidem_yil" in out.columns:
                tenure_days = tenure_days.fillna(numeric(out["kidem_yil"]) * 365)
            out["_tenure_days"] = tenure_days.fillna(np.inf).clip(lower=0)
            return out

        def count_by_threshold(frame: pd.DataFrame, threshold_days: int) -> float:
            if frame.empty or "_turnover_cikis" not in frame.columns:
                return 0.0
            return safe_sum(frame.loc[frame["_tenure_days"] <= threshold_days, "_turnover_cikis"])

        def empty_month_row(month_key: str) -> dict:
            return {
                "month": month_key,
                "donem": month_key,
                "total_cikis": 0,
                "ilk_1_ay": 0,
                "ilk_1_ay_oran": 0,
                "ilk_2_ay": 0,
                "ilk_2_ay_oran": 0,
                "ilk_6_ay": 0,
                "ilk_6_ay_oran": 0,
            }

        def build_scope(scope_name: str) -> dict:
            sub = source[source["ust_bolum_norm"] == scope_name].copy() if "ust_bolum_norm" in source.columns else empty_df.copy()
            exit_rows = sub[turnover_exit_mask(sub)].copy() if not sub.empty else sub.copy()
            if not exit_rows.empty:
                exit_rows["_turnover_cikis"] = turnover_exit_series(exit_rows).reindex(exit_rows.index).fillna(0)
                exit_rows = with_tenure_days(exit_rows)
            monthly_rows = []
            for month_key in window_months:
                if exit_rows.empty or "month" not in exit_rows.columns:
                    monthly_rows.append(empty_month_row(month_key))
                    continue
                msub = exit_rows[exit_rows["month"].astype(str) == str(month_key)].copy()
                total = turnover_exit_sum(msub)
                first_1 = count_by_threshold(msub, 31)
                first_2 = count_by_threshold(msub, 62)
                first_6 = count_by_threshold(msub, 183)
                monthly_rows.append(
                    {
                        "month": month_key,
                        "donem": month_key,
                        "total_cikis": int(round(total)),
                        "ilk_1_ay": int(round(first_1)),
                        "ilk_1_ay_oran": safe_div(first_1, total) if total else 0,
                        "ilk_2_ay": int(round(first_2)),
                        "ilk_2_ay_oran": safe_div(first_2, total) if total else 0,
                        "ilk_6_ay": int(round(first_6)),
                        "ilk_6_ay_oran": safe_div(first_6, total) if total else 0,
                    }
                )

            year_summary = []
            rows_df = pd.DataFrame(monthly_rows)
            if not rows_df.empty:
                rows_df["year"] = rows_df["month"].astype(str).str[:4]
                for year_key, group in rows_df.groupby("year", sort=True):
                    total = safe_sum(group["total_cikis"])
                    first_1 = safe_sum(group["ilk_1_ay"])
                    first_2 = safe_sum(group["ilk_2_ay"])
                    first_6 = safe_sum(group["ilk_6_ay"])
                    year_summary.append(
                        {
                            "year": str(year_key),
                            "total_cikis": int(round(total)),
                            "ilk_1_ay": int(round(first_1)),
                            "ilk_1_ay_oran": safe_div(first_1, total) if total else 0,
                            "ilk_2_ay": int(round(first_2)),
                            "ilk_2_ay_oran": safe_div(first_2, total) if total else 0,
                            "ilk_6_ay": int(round(first_6)),
                            "ilk_6_ay_oran": safe_div(first_6, total) if total else 0,
                        }
                    )
            return {"rows": monthly_rows, "year_summary": year_summary}

        return {
            "scopes": locations,
            "window_months": window_months,
            "scope_tables": {scope: build_scope(scope) for scope in locations},
            "notes": [
                "Cikis standardi: cikis kolonu kullanilir.",
                "Ilk ay <= 31 gun, ilk 2 ay <= 62 gun, ilk 6 ay <= 183 gun olarak hesaplanir.",
            ],
        }

    def build_early_turnover_summary_page() -> dict:
        latest_month = months[-1] if months else ""
        data = early_turnover_summary_for_month(latest_month)
        scope_tables = data.get("scope_tables", {}) if isinstance(data, dict) else {}
        return {
            "scopes": data.get("scopes", locations) if isinstance(data, dict) else locations,
            "rows_by_scope": {
                scope: (scope_tables.get(scope, {}) or {}).get("rows", [])
                for scope in locations
            },
            "notes": data.get("notes", []) if isinstance(data, dict) else [],
        }

    pages["p051_early_turnover_summary"] = timed_step(
        "p051_early_turnover_summary",
        build_early_turnover_summary_page,
    )

    def departed_people_for_month(month: str) -> dict:
        sub = month_data(month)
        base_result = {"filters": [group_label], "summary": [], "rows": []}
        if sub.empty:
            return base_result

        work = sub.copy()
        if "cikis" in work.columns or "reel_isten_cikis" in work.columns:
            work = work[turnover_exit_mask(work)].copy()
        elif "cikis_tarihi" in work.columns:
            work["cikis_month"] = to_month(pd.to_datetime(work["cikis_tarihi"], errors="coerce"))
            work = work[work["cikis_month"] == month].copy()
        if work.empty:
            return base_result

        if "cikis_tarihi" in work.columns:
            work["cikis_tarihi"] = pd.to_datetime(work["cikis_tarihi"], errors="coerce")
        if "ise_giris_tarihi" in work.columns:
            work["ise_giris_tarihi"] = pd.to_datetime(work["ise_giris_tarihi"], errors="coerce")

        if "sicil_no" in work.columns:
            work["sicil_no_num"] = numeric(work["sicil_no"]).astype("Int64")
            work = work.sort_values(
                by=["cikis_tarihi", "ise_giris_tarihi"],
                ascending=[False, False],
                na_position="last",
            )
            if work["sicil_no_num"].notna().any():
                work = work.drop_duplicates(subset=["sicil_no_num"], keep="first")

        dept_col = find_first_col(work, ["departman_adi", "departman", "bolum_adi"])
        phone_col = find_first_col(work, ["cep_telefonu", "cep telefonu", "telefon", "gsm", "mobile_phone"])
        rows: list[dict] = []
        ordered_records = work.sort_values(
            by=["cikis_tarihi", "adi_soyadi"],
            ascending=[False, True],
            na_position="last",
        ).to_dict("records")
        for rec in ordered_records:
            loc = rec.get("ust_bolum_norm") or normalize_ust_bolum(rec.get("ust_bolum")) or group_label
            dept_val = rec.get(dept_col) if dept_col else None
            phone_val = rec.get(phone_col) if phone_col else None
            sicil_key = None
            if "sicil_no_num" in rec and pd.notna(rec["sicil_no_num"]):
                sicil_key = str(int(rec["sicil_no_num"]))
            elif pd.notna(rec.get("sicil_no")):
                sicil_key = normalize_sicil_key(rec.get("sicil_no"))
            if pd.notna(phone_val):
                phone_val = str(phone_val).strip()
            if (not phone_val or str(phone_val).lower() in {"nan", "none"}) and sicil_key:
                phone_val = contact_phone_map.get(sicil_key)
            rows.append(
                {
                    "sicil_no": int(rec["sicil_no_num"]) if "sicil_no_num" in rec and pd.notna(rec["sicil_no_num"]) else rec.get("sicil_no"),
                    "adi_soyadi": preferred_person_name(sicil_key or rec.get("sicil_no"), rec.get("adi_soyadi")),
                    "iletisim_numarasi": fix_text(phone_val) if isinstance(phone_val, str) else phone_val,
                    "ust_bolum": loc,
                    "departman": fix_text(dept_val) if isinstance(dept_val, str) else dept_val,
                    "isletme_adi": fix_text(rec.get("isletme_adi")) if isinstance(rec.get("isletme_adi"), str) else rec.get("isletme_adi"),
                    "unvan": fix_text(rec.get("unvan")) if isinstance(rec.get("unvan"), str) else rec.get("unvan"),
                    "cinsiyet": rec.get("cinsiyet_norm"),
                    "ise_giris_tarihi": rec.get("ise_giris_tarihi"),
                    "cikis_tarihi": rec.get("cikis_tarihi"),
                    "kidem_yil": float(rec.get("kidem_yil")) if pd.notna(rec.get("kidem_yil")) else None,
                }
            )

        filters = [group_label] + [loc for loc in locations if any(r.get("ust_bolum") == loc for r in rows)]
        summary = [{"loc": loc, "count": sum(1 for r in rows if loc == group_label or r.get("ust_bolum") == loc)} for loc in filters]
        return {"filters": filters, "summary": summary, "rows": rows}

    pages["p030_departed_people"] = {"by_month": {m: departed_people_for_month(m) for m in months}}

    def build_exit_reasons_page() -> dict:
        src = cikis_sebepleri_df.copy()
        if src.empty:
            return {"by_month": {m: {"selected_month": {}, "overall": {}} for m in months}}

        def norm_cell(val: object) -> str | None:
            if pd.isna(val):
                return None
            txt = str(fix_text(val)).replace("\xa0", " ").strip()
            if not txt:
                return None
            return normalize_common_label(txt)

        def find_col_by_norm(candidates: list[str]) -> str | None:
            col_map = {normalize_key(c): c for c in src.columns}
            for candidate in candidates:
                found = col_map.get(normalize_key(candidate))
                if found:
                    return found
            return None

        def count_answers(frame: pd.DataFrame, col: str | None, top_n: int | None = None) -> list[dict]:
            if frame.empty or col is None or col not in frame.columns:
                return []
            vals = frame[col].map(norm_cell).dropna()
            if vals.empty:
                return []
            counts = vals.value_counts(dropna=False)
            total = int(counts.sum())
            rows = [
                {
                    "label": str(label),
                    "count": int(cnt),
                    "share": safe_div(int(cnt), total) if total else 0.0,
                }
                for label, cnt in counts.items()
            ]
            return rows[:top_n] if top_n else rows

        ayrilma_col = find_col_by_norm(["Ayrılma Nedeni 1", "Ayrilma Nedeni 1"])
        sektor_col = find_col_by_norm(["Hangi Sektöre Geçmeyi Planlıyorsunuz?", "Hangi Sektore Gecmeyi Planliyorsunuz?"])
        pozisyon_seviye_col = find_col_by_norm(
            [
                "Yeni pozisyonunuz, şu anki pozisyonunuza göre hangi seviyededir?",
                "Yeni pozisyonunuz, su anki pozisyonunuza gore hangi seviyededir?",
            ]
        )
        tavsiye_col = find_col_by_norm(["Aurelia'u çevrenize tavsiye eder misiniz?", "Aurelia'u cevrenize tavsiye eder misiniz?"])
        yeniden_calisma_col = find_col_by_norm(
            [
                "Gelecekte yeniden çalışma fırsatınız olsa, Aurelia ile tekrar çalışmayı tercih eder misiniz?",
                "Gelecekte yeniden calisma firsatiniz olsa, Aurelia ile tekrar calismayi tercih eder misiniz?",
            ]
        )
        upper_scope_col = find_col_by_norm(["Üst Bölüm", "Ust Bolum", "ust_bolum"])
        contract_col = find_col_by_norm(["Sözleşme Türü", "Sozlesme Turu", "Kadro Adı", "Kadro Adi", "kadro_adi"])
        scope_options = [
            {"value": "all", "label": "Tümü"},
            {"value": "magaza_part", "label": "Mağaza Part"},
            {"value": "magaza_full", "label": "Mağaza Full"},
            {"value": "merkez", "label": "Merkez"},
        ]

        def filter_survey_scope(frame: pd.DataFrame, scope_key: str) -> pd.DataFrame:
            if frame.empty or scope_key == "all":
                return frame
            if upper_scope_col is None or upper_scope_col not in frame.columns:
                return frame.iloc[0:0].copy()
            upper_key = frame[upper_scope_col].map(normalize_key)
            if scope_key == "merkez":
                return frame[upper_key == "merkez"].copy()
            store_mask = upper_key == "magaza"
            if contract_col is None or contract_col not in frame.columns:
                return frame[store_mask].copy() if scope_key == "magaza_full" else frame.iloc[0:0].copy()
            part_mask = frame[contract_col].map(normalize_key).str.contains("part time", na=False)
            if scope_key == "magaza_part":
                return frame[store_mask & part_mask].copy()
            return frame[store_mask & ~part_mask].copy()

        def filter_employee_scope(frame: pd.DataFrame, scope_key: str) -> pd.DataFrame:
            if frame.empty or scope_key == "all":
                return frame
            if "ust_bolum_norm" in frame.columns:
                upper_key = frame["ust_bolum_norm"].map(normalize_key)
            elif "ust_bolum" in frame.columns:
                upper_key = frame["ust_bolum"].map(normalize_key)
            else:
                return frame.iloc[0:0].copy()
            if scope_key == "merkez":
                return frame[upper_key == "merkez"].copy()
            store_mask = upper_key == "magaza"
            if "kadro_adi" not in frame.columns:
                return frame[store_mask].copy() if scope_key == "magaza_full" else frame.iloc[0:0].copy()
            part_mask = frame["kadro_adi"].map(normalize_key).str.contains("part time", na=False)
            if scope_key == "magaza_part":
                return frame[store_mask & part_mask].copy()
            return frame[store_mask & ~part_mask].copy()

        detail_cols_by_reason: dict[str, str] = {}
        for col in src.columns:
            key = normalize_key(col)
            if key.startswith("ayrilma nedeni"):
                continue
            if key.endswith(" 1"):
                base_key = key.rsplit(" ", 1)[0].strip()
                base_label = normalize_common_label(str(fix_text(base_key)))
                detail_cols_by_reason[normalize_key(base_label)] = col

        src_month = src.copy()
        month_col = find_col_by_norm(["month", "Dönem", "Donem", "donem"])
        if month_col and month_col in src_month.columns:
            if month_col != "month":
                src_month["month"] = to_month(pd.to_datetime(src_month[month_col], errors="coerce"))
            src_month["month"] = src_month["month"].astype("string")

        empty_snapshot_frame = src_month.iloc[0:0].copy()

        def reason_detail_snapshot(frame: pd.DataFrame, top_reasons: list[dict]) -> dict:
            if not top_reasons or ayrilma_col is None or ayrilma_col not in frame.columns or frame.empty:
                return {"groups": [], "flat": []}
            ayrilma_norm = frame[ayrilma_col].map(norm_cell).map(normalize_key)
            groups: list[dict] = []
            flat: list[dict] = []
            for top in top_reasons:
                reason_label = top.get("label")
                reason_key = normalize_key(normalize_common_label(str(reason_label)))
                detail_col = detail_cols_by_reason.get(reason_key)
                if detail_col is None:
                    for known_key, known_col in detail_cols_by_reason.items():
                        if reason_key in known_key or known_key in reason_key:
                            detail_col = known_col
                            break
                reason_frame = frame[ayrilma_norm == reason_key]
                detail_rows = count_answers(reason_frame, detail_col, top_n=3)
                if not detail_rows:
                    detail_rows = [{"label": "Detay bulunamadı", "count": 0, "share": 0.0}]
                groups.append(
                    {
                        "reason": reason_label,
                        "count": top.get("count", 0),
                        "detail_column": detail_col,
                        "items": detail_rows,
                    }
                )
                for item in detail_rows:
                    flat.append(
                        {
                            "reason": reason_label,
                            "option": item.get("label"),
                            "count": item.get("count", 0),
                            "share_within_reason": item.get("share", 0.0),
                        }
                    )
            return {"groups": groups, "flat": flat}

        def build_snapshot(frame: pd.DataFrame) -> dict:
            top_reasons = count_answers(frame, ayrilma_col, top_n=3)
            return {
                "sample_size": int(len(frame)),
                "top_ayrilma_nedeni_1": top_reasons,
                "top_ayrilma_nedeni_1_detay": reason_detail_snapshot(frame, top_reasons),
                "sektor_gecis": count_answers(frame, sektor_col),
                "yeni_pozisyon_seviye": count_answers(frame, pozisyon_seviye_col),
                "tavsiye": count_answers(frame, tavsiye_col),
                "yeniden_calisma": count_answers(frame, yeniden_calisma_col),
            }

        def count_filled(frame: pd.DataFrame, col: str | None) -> int:
            if frame.empty or col is None or col not in frame.columns:
                return 0
            return int(frame[col].map(norm_cell).notna().sum())

        def exits_magaza_merkez(frame: pd.DataFrame) -> float:
            if frame.empty:
                return 0.0
            sub = frame.copy()
            if "ust_bolum_norm" in sub.columns:
                sub = sub[sub["ust_bolum_norm"].isin(["Mağaza", "Merkez"])]
            return float(turnover_exit_sum(sub))

        def coverage_metrics(
            month_key: str,
            selected_frame: pd.DataFrame,
            year_frame: pd.DataFrame,
            selected_survey_frame: pd.DataFrame,
            year_survey_frame: pd.DataFrame,
        ) -> dict:
            year_str = str(month_key)[:4] if month_key else None
            month_exit = exits_magaza_merkez(selected_frame)
            year_exit = exits_magaza_merkez(year_frame)
            month_filled = count_filled(selected_survey_frame, ayrilma_col)
            year_filled = count_filled(year_survey_frame, ayrilma_col)
            return {
                "month": {
                    "month": month_key,
                    "year": year_str,
                    "magaza_merkez_exit_count": month_exit,
                    "filled_ayrilma_nedeni_1_count": month_filled,
                    "interview_rate": safe_div(month_filled, month_exit) if month_exit > 0 else None,
                },
                "year_total": {
                    "year": year_str,
                    "magaza_merkez_exit_count": year_exit,
                    "filled_ayrilma_nedeni_1_count": year_filled,
                    "interview_rate": safe_div(year_filled, year_exit) if year_exit > 0 else None,
                },
            }

        overall = build_snapshot(src_month)
        overall_by_scope = {
            option["value"]: build_snapshot(filter_survey_scope(src_month, option["value"]))
            for option in scope_options
        }
        survey_month_cache = (
            {str(month): group.copy() for month, group in src_month.groupby("month", dropna=True)}
            if "month" in src_month.columns
            else {}
        )

        by_month: dict[str, dict] = {}
        for month in months:
            selected = survey_month_cache.get(str(month), empty_snapshot_frame)
            year_key = int(str(month)[:4]) if month else None
            year_src = year_data(year_key) if year_key else empty_df
            selected_survey = selected
            year_survey = (
                src_month[src_month["month"].astype(str).str.startswith(f"{year_key}-", na=False)]
                if year_key and "month" in src_month.columns
                else empty_snapshot_frame
            )
            scoped_payload: dict[str, dict] = {}
            for option in scope_options:
                scope_key = option["value"]
                scoped_selected_survey = filter_survey_scope(selected_survey, scope_key)
                scoped_year_survey = filter_survey_scope(year_survey, scope_key)
                scoped_selected_frame = filter_employee_scope(month_data(month), scope_key)
                scoped_year_frame = filter_employee_scope(year_src, scope_key)
                scoped_payload[scope_key] = {
                    "selected_month": build_snapshot(scoped_selected_survey),
                    "overall": overall_by_scope[scope_key],
                    "interview_coverage": coverage_metrics(
                        str(month),
                        year_frame=scoped_year_frame,
                        selected_frame=scoped_selected_frame,
                        selected_survey_frame=scoped_selected_survey,
                        year_survey_frame=scoped_year_survey,
                    ),
                }
            by_month[month] = {
                "selected_month": build_snapshot(selected),
                "overall": overall,
                "interview_coverage": coverage_metrics(
                    str(month), year_frame=year_src, selected_frame=month_data(month), selected_survey_frame=selected_survey, year_survey_frame=year_survey
                ),
                "scopes": scoped_payload,
                "scope_options": scope_options,
            }
        return {"by_month": by_month}

    pages["p031_cikis_sebepleri"] = build_exit_reasons_page()

    def normalize_forecast_loc(val: object) -> object:
        if pd.isna(val):
            return val
        key = normalize_key(val)
        if key in {"genel", "aurelia group", "group"}:
            return group_label
        if key == "magaza":
            return "Mağaza"
        if key in {"magaza part", "magaza_part"}:
            return "Mağaza Part"
        if key in {"magaza full", "magaza_full"}:
            return "Mağaza Full"
        if key == "merkez":
            return "Merkez"
        if key == "edirne":
            return "Edirne"
        return fix_text(val)

    if not tahmin_df.empty:
        tahmin_df = tahmin_df.copy()
        tahmin_df["donem"] = to_month(tahmin_df["donem"])
        if "ust_bolum_adi" in tahmin_df.columns:
            tahmin_df["ust_bolum_adi"] = tahmin_df["ust_bolum_adi"].apply(normalize_forecast_loc)
        rows = tahmin_df.to_dict(orient="records")
    else:
        rows = []
    if not tahmin_backtest_ozet_df.empty:
        tahmin_backtest_ozet_df = tahmin_backtest_ozet_df.copy()
        if "scope" in tahmin_backtest_ozet_df.columns:
            tahmin_backtest_ozet_df["scope"] = tahmin_backtest_ozet_df["scope"].apply(normalize_forecast_loc)
        backtest_rows = tahmin_backtest_ozet_df.to_dict(orient="records")
    else:
        backtest_rows = []
    pages["p016_forecasts"] = {"rows": rows, "backtest": backtest_rows}

    stable_year_values = pd.to_numeric(
        df.get("year", pd.Series(dtype="float64")), errors="coerce"
    ).dropna()
    stable_data_year = int(stable_year_values.max()) if not stable_year_values.empty else 1970

    if not tahmin_yillik_backtest_df.empty:
        annual_backtest = tahmin_yillik_backtest_df.copy()
        for date_col in ["hedef_donem", "egitim_bitis_donemi"]:
            if date_col in annual_backtest.columns:
                annual_backtest[date_col] = to_month(annual_backtest[date_col])
        if "scope" in annual_backtest.columns:
            annual_backtest["scope"] = annual_backtest["scope"].apply(normalize_forecast_loc)
        annual_rows = annual_backtest.to_dict(orient="records")
        year_values = (
            pd.to_numeric(annual_backtest["hedef_yil"], errors="coerce").dropna()
            if "hedef_yil" in annual_backtest.columns
            else pd.Series(dtype="float64")
        )
        annual_year = int(year_values.max()) if not year_values.empty else stable_data_year
    else:
        annual_rows = []
        annual_year = stable_data_year
    pages["p052_turnover_forecast_backtest"] = {
        "year": annual_year,
        "rows": annual_rows,
        "notes": [
            "Backtest satirlarinda her hedef ay yalnizca bir onceki aya kadar bilinen verilerle tahmin edilir.",
            "Ileri tahmin satirlarinda son bilinen gerceklesen aya kadar olan veri kullanilir.",
        ],
    }

    def build_enocta_cache() -> dict[str, dict]:
        if enocta_raw_df.empty and enocta_ozet_df.empty:
            return {}

        if not enocta_raw_df.empty:
            src = enocta_raw_df.copy()
            sicil_col = find_first_col(src, ["sicil", "sicil_no", "kullanıcı_sicil"])
            event_col = find_first_col(src, ["etkinlik_adi"])
            duration_col = find_first_col(src, ["toplam_deneyim_suresi_dk", "net_deneyim_suresi_dk", "izleme_dk"])
            bayi_col = find_first_col(src, ["bayi_adi"])
            lok_col = find_first_col(src, ["lokasyon"])
            ad_col = find_first_col(src, ["kullanıcı_adi", "kisi_adi", "adi"])
            soyad_col = find_first_col(src, ["kullanıcı_soyadi", "soyadi"])

            if sicil_col and event_col and duration_col and "donem" in src.columns:
                src["month"] = to_month(src["donem"])
                valid = src[src["month"].notna()].copy()
                if not valid.empty:
                    valid["month"] = valid["month"].astype("string")
                    valid = valid[valid["month"] != "2000-01"]
                    valid[duration_col] = numeric(valid[duration_col]).fillna(0)
                    valid["event_present"] = valid[event_col].apply(
                        lambda x: bool(str(fix_text(x)).strip()) if isinstance(x, str) else pd.notna(x)
                    )
                    valid["lokasyon_norm"] = (
                        valid[lok_col].apply(normalize_key)
                        if lok_col and lok_col in valid.columns
                        else ""
                    )
                    valid["bayi_adi_norm"] = (
                        valid[bayi_col].apply(normalize_key)
                        if bayi_col and bayi_col in valid.columns
                        else ""
                    )

                    bayi_key = normalize_key("BAYİ ÇALIŞANLARI")
                    aurelia_key = normalize_key("AURELIA")
                    merkez_key = normalize_key("Aurelia Merkez")
                    edirne_fabrika_key = normalize_key("Edirne Fabrika")

                    def scope_mask(frame: pd.DataFrame, scope_key: str) -> pd.Series:
                        bayi_vals = frame["bayi_adi_norm"] if "bayi_adi_norm" in frame.columns else ""
                        lok_vals = frame["lokasyon_norm"] if "lokasyon_norm" in frame.columns else ""
                        if scope_key == "bayi":
                            return bayi_vals == bayi_key
                        if scope_key == "edirne_fabrika":
                            return lok_vals == edirne_fabrika_key
                        if scope_key == "merkez":
                            return lok_vals == merkez_key
                        if scope_key == "magaza":
                            return (bayi_vals == aurelia_key) & (~lok_vals.isin([merkez_key, edirne_fabrika_key]))
                        return pd.Series(False, index=frame.index)

                    scope_defs = [
                        ("Bayi", "bayi"),
                        ("Mağaza", "magaza"),
                        ("Merkez", "merkez"),
                        ("Edirne Fabrika", "edirne_fabrika"),
                    ]

                    def build_summary_rows(frame: pd.DataFrame) -> list[dict]:
                        if frame.empty:
                            return []

                        def metric_row(label: str, scope_frame: pd.DataFrame) -> dict:
                            person_count = int(scope_frame[sicil_col].dropna().nunique()) if not scope_frame.empty else 0
                            egitim_count = int(scope_frame["event_present"].sum()) if not scope_frame.empty else 0
                            toplam_dk = float(scope_frame[duration_col].sum()) if not scope_frame.empty else 0.0
                            toplam_saat = toplam_dk / 60.0
                            return {
                                "ust_bolum": label,
                                "kisi_sayisi": person_count,
                                "egitim_sayisi": egitim_count,
                                "kisi_basi_egitim": safe_div(egitim_count, person_count) if person_count else 0.0,
                                "egitim_sure_saat": toplam_saat,
                                "kisi_basi_sure_saat": safe_div(toplam_saat, person_count) if person_count else 0.0,
                                # Geri uyumluluk alanları
                                "tekil_kisi": person_count,
                                "toplam_egitim_sayisi": egitim_count,
                                "toplam_izleme_dk": toplam_dk,
                                "kisi_basi_izleme_dk": safe_div(toplam_dk, person_count) if person_count else 0.0,
                            }

                        rows = [metric_row(label, frame[scope_mask(frame, scope_key)].copy()) for label, scope_key in scope_defs]
                        rows.insert(0, metric_row(group_label, frame))
                        return rows

                    cache: dict[str, dict] = {}
                    for source_month, sub in valid.groupby("month", dropna=False):
                        key = str(source_month)
                        if pd.isna(source_month) or sub.empty:
                            continue

                        summary_rows = build_summary_rows(sub)
                        user_work = sub.copy()
                        loc_series = (
                            user_work[lok_col].apply(normalize_key)
                            if lok_col and lok_col in user_work.columns
                            else pd.Series("", index=user_work.index, dtype="string")
                        )
                        bayi_series = (
                            user_work[bayi_col].apply(normalize_key)
                            if bayi_col and bayi_col in user_work.columns
                            else pd.Series("", index=user_work.index, dtype="string")
                        )
                        user_work["ust_bolum_calc"] = group_label
                        user_work.loc[bayi_series == bayi_key, "ust_bolum_calc"] = "Bayi"
                        user_work.loc[
                            (bayi_series == aurelia_key)
                            & ~loc_series.isin({merkez_key, edirne_fabrika_key}),
                            "ust_bolum_calc",
                        ] = "Mağaza"
                        user_work.loc[loc_series == merkez_key, "ust_bolum_calc"] = "Merkez"
                        user_work.loc[loc_series == edirne_fabrika_key, "ust_bolum_calc"] = "Edirne Fabrika"
                        user_work["egitim_count"] = user_work["event_present"].astype(int)
                        user_agg = user_work.groupby(sicil_col, as_index=False).agg(
                            egitim_sayisi=("egitim_count", "sum"),
                            toplam_deneyim_dk=(duration_col, "sum"),
                            ust_bolum=("ust_bolum_calc", lambda x: x.dropna().iloc[0] if len(x.dropna()) else group_label),
                        )
                        if ad_col and ad_col in user_work.columns:
                            user_agg = user_agg.merge(
                                user_work.groupby(sicil_col, as_index=False)[ad_col].first(),
                                on=sicil_col,
                                how="left",
                            )
                        if soyad_col and soyad_col in user_work.columns:
                            user_agg = user_agg.merge(
                                user_work.groupby(sicil_col, as_index=False)[soyad_col].first(),
                                on=sicil_col,
                                how="left",
                            )

                        top_users = []
                        for row in user_agg.sort_values("toplam_deneyim_dk", ascending=False).head(50).to_dict("records"):
                            full_name = " ".join(
                                [
                                    str(row.get(ad_col, "")).strip() if ad_col else "",
                                    str(row.get(soyad_col, "")).strip() if soyad_col else "",
                                ]
                            ).strip()
                            top_users.append(
                                {
                                    "sicil": row.get(sicil_col),
                                    "ad_soyad": preferred_person_name(row.get(sicil_col), full_name if full_name else None),
                                    "ust_bolum": row.get("ust_bolum"),
                                    "egitim_sayisi": float(row.get("egitim_sayisi", 0) or 0),
                                    "egitim_sure_saat": float(row.get("toplam_deneyim_dk", 0) or 0) / 60.0,
                                    "izleme_dk": float(row.get("toplam_deneyim_dk", 0) or 0),
                                }
                            )

                        cache[key] = {"source_month": key, "summary": summary_rows, "top_users": top_users}
                    if cache:
                        return cache

        if enocta_ozet_df.empty:
            return {}

        src = enocta_ozet_df.copy()
        sicil_col = find_first_col(src, ["sicil", "sicil_no", "kullanıcı_sicil"])
        izleme_col = find_first_col(src, ["izleme_dk"])
        egitim_col = find_first_col(src, ["egitim_sayisi"])
        ust_col = find_first_col(src, ["ust_bolum"])
        ad_col = find_first_col(src, ["kullanıcı_adi", "kisi_adi", "adi"])
        soyad_col = find_first_col(src, ["kullanıcı_soyadi", "soyadi"])
        if sicil_col is None or izleme_col is None:
            return {}

        src["month"] = to_month(src["donem"]) if "donem" in src.columns else None
        valid = src[src["month"].notna()].copy()
        if valid.empty:
            return {}
        valid["month"] = valid["month"].astype("string")
        valid = valid[valid["month"] != "2000-01"]
        if valid.empty:
            return {}

        valid[izleme_col] = numeric(valid[izleme_col]).fillna(0)
        if ust_col:
            valid["ust_bolum_norm"] = valid[ust_col].apply(normalize_ust_bolum).fillna("Diğer")
        else:
            valid["ust_bolum_norm"] = "Diğer"

        cache: dict[str, dict] = {}
        for source_month, sub in valid.groupby("month", dropna=False):
            key = str(source_month)
            if pd.isna(source_month) or sub.empty:
                continue

            egitim_agg = sub.groupby([sicil_col, "ust_bolum_norm"], as_index=False).agg(
                egitim_sayisi=(egitim_col, "sum") if egitim_col else (izleme_col, "size"),
                izleme_dk=(izleme_col, "sum"),
            )

            summary_rows = []
            for loc in locations:
                loc_sub = egitim_agg[egitim_agg["ust_bolum_norm"] == loc]
                if loc_sub.empty:
                    continue
                person_count = int(loc_sub[sicil_col].nunique())
                toplam_dk = float(loc_sub["izleme_dk"].sum())
                toplam_egitim = float(numeric(loc_sub["egitim_sayisi"]).fillna(0).sum())
                summary_rows.append(
                    {
                        "ust_bolum": loc,
                        "kisi_sayisi": person_count,
                        "egitim_sayisi": toplam_egitim,
                        "kisi_basi_egitim": safe_div(toplam_egitim, person_count) if person_count else 0.0,
                        "egitim_sure_saat": toplam_dk / 60.0,
                        "kisi_basi_sure_saat": safe_div(toplam_dk / 60.0, person_count) if person_count else 0.0,
                        "tekil_kisi": person_count,
                        "toplam_egitim_sayisi": toplam_egitim,
                        "toplam_izleme_dk": toplam_dk,
                        "kisi_basi_izleme_dk": safe_div(toplam_dk, person_count) if person_count else 0.0,
                    }
                )
            if summary_rows:
                total_person = sum(r["kisi_sayisi"] for r in summary_rows)
                toplam_dk = sum(r["toplam_izleme_dk"] for r in summary_rows)
                toplam_egitim = sum(r["egitim_sayisi"] for r in summary_rows)
                summary_rows.insert(
                    0,
                    {
                        "ust_bolum": group_label,
                        "kisi_sayisi": total_person,
                        "egitim_sayisi": toplam_egitim,
                        "kisi_basi_egitim": safe_div(toplam_egitim, total_person) if total_person else 0.0,
                        "egitim_sure_saat": toplam_dk / 60.0,
                        "kisi_basi_sure_saat": safe_div(toplam_dk / 60.0, total_person) if total_person else 0.0,
                        "tekil_kisi": total_person,
                        "toplam_egitim_sayisi": toplam_egitim,
                        "toplam_izleme_dk": toplam_dk,
                        "kisi_basi_izleme_dk": safe_div(toplam_dk, total_person) if total_person else 0.0,
                    },
                )

            user_agg = sub.groupby(sicil_col, as_index=False).agg(
                egitim_sayisi=(egitim_col, "sum") if egitim_col else (izleme_col, "size"),
                izleme_dk=(izleme_col, "sum"),
                ust_bolum_norm=("ust_bolum_norm", lambda x: x.dropna().iloc[0] if len(x.dropna()) else None),
            )
            if ad_col and ad_col in sub.columns:
                user_agg = user_agg.merge(
                    sub.groupby(sicil_col, as_index=False)[ad_col].first(),
                    on=sicil_col,
                    how="left",
                )
            if soyad_col and soyad_col in sub.columns:
                user_agg = user_agg.merge(
                    sub.groupby(sicil_col, as_index=False)[soyad_col].first(),
                    on=sicil_col,
                    how="left",
                )

            top_users = []
            for row in user_agg.sort_values("izleme_dk", ascending=False).head(50).to_dict("records"):
                full_name = " ".join(
                    [
                        str(row.get(ad_col, "")).strip() if ad_col else "",
                        str(row.get(soyad_col, "")).strip() if soyad_col else "",
                    ]
                ).strip()
                top_users.append(
                    {
                        "sicil": row.get(sicil_col),
                        "ad_soyad": preferred_person_name(row.get(sicil_col), full_name if full_name else None),
                        "ust_bolum": row.get("ust_bolum_norm"),
                        "egitim_sayisi": float(row.get("egitim_sayisi", 0) or 0),
                        "egitim_sure_saat": float(row.get("izleme_dk", 0) or 0) / 60.0,
                        "izleme_dk": float(row.get("izleme_dk", 0) or 0),
                    }
                )

            cache[key] = {"source_month": key, "summary": summary_rows, "top_users": top_users}
        return cache

    enocta_cache = build_enocta_cache()
    enocta_available = sorted(enocta_cache.keys(), key=lambda m: pd.Period(m, freq="M")) if enocta_cache else []
    enocta_by_month = {}
    for month in months:
        source_month = month if month in enocta_cache else (enocta_available[-1] if enocta_available else None)
        enocta_by_month[month] = (
            enocta_cache.get(source_month, {"source_month": source_month, "summary": [], "top_users": []})
            if source_month
            else {"source_month": None, "summary": [], "top_users": []}
        )

    pages["p017_enocta"] = {"by_month": enocta_by_month}

    def build_sales_table(sub: pd.DataFrame) -> list[dict]:
        if sub.empty:
            return []

        work = sub.copy()
        if "bolum_group" not in work.columns:
            if "bolum" not in work.columns:
                return []
            def classify_bolum(value: object) -> str:
                key = normalize_key(value)
                if "magaza" in key:
                    return "magaza"
                if "bayi" in key:
                    return "bayi"
                return ""

            work["bolum_group"] = work["bolum"].apply(classify_bolum)

        if "calisma_group" not in work.columns:
            if "calisma_durumu" not in work.columns:
                return []
            def classify_calisma(value: object) -> str:
                key = normalize_key(value)
                if "cikis" in key or "ayril" in key:
                    return "cikis"
                if "calis" in key or "aktif" in key:
                    return "calisiyor"
                return ""

            work["calisma_group"] = work["calisma_durumu"].apply(classify_calisma)

        work = work[(work["bolum_group"] != "") & (work["calisma_group"] != "")]
        if work.empty:
            return []

        group = work.groupby(["bolum_group", "calisma_group"]).size().unstack(fill_value=0)
        rows = []
        for bolum_key, bolum_label in [("bayi", "Bayi"), ("magaza", "Mağaza")]:
            if bolum_key not in group.index:
                continue
            calis = int(group.loc[bolum_key].get("calisiyor", 0))
            cikis = int(group.loc[bolum_key].get("cikis", 0))
            toplam = calis + cikis
            rows.append(
                {
                    "bolum": bolum_label,
                    "calisiyor": calis,
                    "cikis": cikis,
                    "toplam": toplam,
                    "cikis_pay": safe_div(cikis, toplam) if toplam else 0,
                }
            )

        total_calis = sum(r["calisiyor"] for r in rows)
        total_cikis = sum(r["cikis"] for r in rows)
        total_toplam = total_calis + total_cikis
        rows.append(
            {
                "bolum": "Toplam",
                "calisiyor": total_calis,
                "cikis": total_cikis,
                "toplam": total_toplam,
                "cikis_pay": safe_div(total_cikis, total_toplam) if total_toplam else 0,
            }
        )
        return rows

    if not satis_df.empty:
        satis_df = satis_df.copy()
        if "donem" in satis_df.columns:
            satis_df["month"] = to_month(satis_df["donem"])

    def build_training_cache() -> dict[str, dict]:
        default_result = {
            "selected_month": {"baslangic": [], "satis": [], "yonetici": []},
            "monthly": {"baslangic": [], "satis": [], "yonetici": []},
            "overall": {"baslangic": [], "satis": [], "yonetici": []},
        }
        if satis_df.empty or "month" not in satis_df.columns:
            return {m: default_result for m in months}

        work = satis_df.copy()
        month_list = sorted(work["month"].dropna().astype(str).unique(), key=lambda m: pd.Period(m, freq="M"))

        def filter_attended(df_in: pd.DataFrame) -> pd.DataFrame:
            if "katilim_durumu_norm" in df_in.columns:
                return df_in[df_in["katilim_durumu_norm"].str.contains("katildi", na=False)]
            if "katilim_durumu" in df_in.columns:
                mask = df_in["katilim_durumu"].apply(normalize_key).str.contains("katildi", na=False)
                return df_in[mask]
            return df_in

        def filter_program(df_in: pd.DataFrame, program: str) -> pd.DataFrame:
            egitim_norm = (
                df_in["egitim_donemi_norm"]
                if "egitim_donemi_norm" in df_in.columns
                else df_in["egitim_donemi"].apply(normalize_key)
                if "egitim_donemi" in df_in.columns
                else pd.Series("", index=df_in.index, dtype="string")
            )
            uzman_norm = (
                df_in["uzman_yonetici_norm"]
                if "uzman_yonetici_norm" in df_in.columns
                else df_in["uzman_yonetici"].apply(normalize_key)
                if "uzman_yonetici" in df_in.columns
                else pd.Series("", index=df_in.index, dtype="string")
            )

            if program == "baslangic":
                return df_in[egitim_norm.str.contains("baslangic", na=False)]
            if program == "satis":
                return df_in[
                    uzman_norm.str.contains("satis akademisi", na=False)
                    & ~uzman_norm.str.contains("yonetici", na=False)
                ]
            if program == "yonetici":
                return df_in[
                    uzman_norm.str.contains("yonetici", na=False)
                    | uzman_norm.str.contains("satis akademisi / yonetici programi", na=False)
                ]
            return df_in.iloc[0:0]

        attended = filter_attended(work)
        selected_month_tables: dict[str, dict[str, list[dict]]] = {
            "baslangic": {},
            "satis": {},
            "yonetici": {},
        }
        monthly_tables: dict[str, list[dict]] = {"baslangic": [], "satis": [], "yonetici": []}
        overall_tables: dict[str, list[dict]] = {"baslangic": [], "satis": [], "yonetici": []}

        for key in ["baslangic", "satis", "yonetici"]:
            p_df = filter_program(attended, key)
            overall_tables[key] = build_sales_table(p_df)
            if not p_df.empty:
                for m, group in p_df.groupby("month", dropna=False):
                    month_key = str(m)
                    month_tbl = build_sales_table(group)
                    selected_month_tables[key][month_key] = month_tbl
                for m in month_list:
                    for row in selected_month_tables[key].get(m, []):
                        monthly_tables[key].append({"month": m, **row})

        cache = {}
        for month in months:
            cache[month] = {
                "selected_month": {
                    key: selected_month_tables[key].get(month, [])
                    for key in ["baslangic", "satis", "yonetici"]
                },
                "monthly": monthly_tables,
                "overall": overall_tables,
            }
        return cache

    pages["p018_sales_academy"] = {"by_month": build_training_cache()}
    log_step("Sayfa 16-18 tamamlandı")

    def build_sales_academy_registry_rows() -> list[dict]:
        if fiili_df.empty:
            return []

        work = fiili_df.copy()
        sicil_col = find_first_col(work, ["P_NO", "sicil", "sicil_no", "Sicil No"])
        name_col = find_first_col(work, ["AD_SOYAD", "Adı Soyadı", "adi_soyadi", "kisi_adi"])
        store_col = find_first_col(work, ["ISLETME_AD", "Lokasyon", "LOKASYON", "magaza", "isletme_adi"])
        region_col = find_first_col(work, ["UST_BOLUM_ADI", "Üst Bölüm", "ust_bolum", "bolge"])
        unvan_col = find_first_col(work, ["UNVAN_ADI", "Unvan", "unvan"])
        kadro_col = find_first_col(work, ["kadro_adı", "kadro_adi", "Kadro", "kadro"])
        grup_col = find_first_col(work, ["CALISAN_GRUP", "alan", "ALAN", "bolum"])
        engel_col = find_first_col(work, ["ENGEL_STATUSU", "engel_durumu"])
        kidem_col = find_first_col(work, ["KIDEM_YILI", "kidem_yili"])

        if not sicil_col or not name_col:
            return []

        def norm_series(col: str | None) -> pd.Series:
            if not col or col not in work.columns:
                return pd.Series("", index=work.index, dtype="string")
            return work[col].apply(normalize_key)

        grup_norm = norm_series(grup_col)
        kadro_norm = norm_series(kadro_col)
        engel_norm = norm_series(engel_col)
        unvan_norm = norm_series(unvan_col)
        store_norm = norm_series(store_col)

        magaza_mask = grup_norm.str.contains("magaza", na=False)
        kadro_mask = kadro_norm.str.contains("belirsiz sureli|part time personel|part tme personel", na=False)
        engel_mask = engel_norm.str.contains("saglikli", na=False)
        unvan_mask = ~unvan_norm.isin(["temizlik elemani", "eleman"])
        store_mask = ~store_norm.str.contains("aurelia merkez", na=False)

        base = work[magaza_mask & kadro_mask & engel_mask & unvan_mask & store_mask].copy()
        if base.empty:
            return []

        base["sicil_key"] = base[sicil_col].apply(normalize_sicil_key)
        base = base[base["sicil_key"].notna()].copy()
        if base.empty:
            return []

        academy_history = satis_full_df if not satis_full_df.empty else satis_df
        if academy_history.empty:
            latest_attended = pd.DataFrame()
            latest_any = pd.DataFrame()
        else:
            # Katılım geçmişi dashboardun min_month penceresiyle kesilmez. Aksi
            # halde eski yıllarda eğitim alan aktif çalışanlar yanlışlıkla
            # "katılmayan" olarak sınıflandırılır.
            track = academy_history.copy()
            track_sicil_col = find_first_col(track, ["sicil_num", "sicil", "sicil_no"])
            if not track_sicil_col:
                latest_attended = pd.DataFrame()
                latest_any = pd.DataFrame()
            else:
                track["sicil_key"] = track[track_sicil_col].apply(normalize_sicil_key)
                track = track[track["sicil_key"].notna()].copy()
                if "donem" in track.columns:
                    track["donem"] = pd.to_datetime(track["donem"], errors="coerce")
                kanal_series = (
                    track["bolum_group"]
                    if "bolum_group" in track.columns
                    else track["bolum"].apply(normalize_key) if "bolum" in track.columns
                    else pd.Series("", index=track.index, dtype="string")
                )
                track = track[kanal_series.astype("string").str.contains("magaza", na=False)].copy()

                katilim_series = (
                    track["katilim_durumu_norm"]
                    if "katilim_durumu_norm" in track.columns
                    else track["katilim_durumu"].apply(normalize_key) if "katilim_durumu" in track.columns
                    else pd.Series("", index=track.index, dtype="string")
                )
                latest_any = (
                    track.sort_values(["sicil_key", "donem"], ascending=[True, False], na_position="last")
                    .drop_duplicates(subset=["sicil_key"], keep="first")
                )
                latest_attended = (
                    track[katilim_series.astype("string").str.contains("katildi", na=False)]
                    .sort_values(["sicil_key", "donem"], ascending=[True, False], na_position="last")
                    .drop_duplicates(subset=["sicil_key"], keep="first")
                )

        attended_map = latest_attended.set_index("sicil_key").to_dict("index") if not latest_attended.empty else {}
        any_map = latest_any.set_index("sicil_key").to_dict("index") if not latest_any.empty else {}

        rows: list[dict] = []
        base_records = (
            base.sort_values(
                by=[store_col or name_col, name_col],
                ascending=[True, True],
                na_position="last",
            )
            .drop_duplicates(subset=["sicil_key"], keep="first")
            .to_dict("records")
        )
        for rec in base_records:
            sicil_key = rec.get("sicil_key")
            attended = attended_map.get(sicil_key)
            any_reg = any_map.get(sicil_key)
            if attended:
                status = "Kat\u0131ld\u0131"
                egitim_adi = attended.get("egitim_donemi")
                egitim_tarihi = attended.get("donem")
            elif any_reg:
                status = "Kay\u0131t var, kat\u0131l\u0131m yok"
                egitim_adi = any_reg.get("egitim_donemi")
                egitim_tarihi = any_reg.get("donem")
            else:
                status = "Hi\u00e7 Sat\u0131\u015f Akademisine Kay\u0131t Olmad\u0131"
                egitim_adi = None
                egitim_tarihi = None

            unvan_val = rec.get(unvan_col) if unvan_col else None
            program = "Y\u00f6netici" if normalize_key(unvan_val) in {"magaza muduru", "magaza mudur yardimcisi", "magaza ikinci muduru"} else "Sat\u0131\u015f Dan\u0131\u015fman\u0131"
            rows.append(
                {
                    "sicil": rec.get(sicil_col),
                    "kisi_adi": preferred_person_name(sicil_key or rec.get(sicil_col), rec.get(name_col)),
                    "magaza": fix_text(rec.get(store_col)) if store_col and isinstance(rec.get(store_col), str) else rec.get(store_col),
                    "bolge": fix_text(rec.get(region_col)) if region_col and isinstance(rec.get(region_col), str) else rec.get(region_col),
                    "unvan": fix_text(unvan_val) if isinstance(unvan_val, str) else unvan_val,
                    "kadro": fix_text(rec.get(kadro_col)) if kadro_col and isinstance(rec.get(kadro_col), str) else rec.get(kadro_col),
                    "program": program,
                    "kidem_yili": float(rec.get(kidem_col)) if kidem_col and pd.notna(rec.get(kidem_col)) else None,
                    "egitim_durumu": status,
                    "son_katildigi_egitim": fix_text(egitim_adi) if isinstance(egitim_adi, str) else egitim_adi,
                    "son_katildigi_egitim_tarihi": egitim_tarihi,
                }
            )
        return rows

    def build_sales_academy_non_attending_rows(rows: list[dict]) -> list[dict]:
        non_attending: list[dict] = []
        for row in rows:
            status = str(row.get("egitim_durumu") or "")
            if status == "Katıldı":
                continue
            katilim_durumu = (
                "Katılmadı"
                if status == "Kayıt var, katılım yok"
                else "Hiç kayıt olmadı"
            )
            non_attending.append(
                {
                    **row,
                    "katilim_durumu": katilim_durumu,
                }
            )
        return non_attending

    uzun_view = apply_person_name_overrides(uzun_df, ["sicil", "sicil_no"], ["kisi_adi", "adi_soyadi", "ad_soyad"])
    academy_registry_rows = build_sales_academy_registry_rows()
    academy_non_attending_rows = build_sales_academy_non_attending_rows(academy_registry_rows)

    pages["p019_katilimayanlar"] = {
        "rows": academy_non_attending_rows,
    }
    pages["p020_uzun_sure"] = {
        "rows": uzun_view.to_dict(orient="records") if not uzun_view.empty else []
    }
    pages["p032_sales_academy_registry"] = {
        "rows": academy_registry_rows,
    }

    def build_sales_academy_records_page() -> dict:
        source = satis_full_df if isinstance(satis_full_df, pd.DataFrame) and not satis_full_df.empty else satis_df
        if source is None or source.empty:
            return {
                "rows": [],
                "columns": [],
                "group_options": [],
                "education_names": [],
                "education_order": {},
            }

        work = source.copy()
        uid_cols = [col for col in work.columns if normalize_key(col) == "uid"]
        if uid_cols:
            work = work.drop(columns=uid_cols)

        if "month" not in work.columns and "donem" in work.columns:
            work["month"] = to_month(pd.to_datetime(work["donem"], errors="coerce"))

        for col in work.columns:
            if pd.api.types.is_object_dtype(work[col]) or pd.api.types.is_string_dtype(work[col]):
                work[col] = work[col].apply(lambda x: fix_text(x).strip() if isinstance(x, str) else x)

        def education_order(value: object) -> int:
            key = normalize_key(value)
            if not key:
                return 9999
            if "baslangic" in key:
                return 0
            match = re.search(r"(\d+)\s*\.?\s*ay", key)
            if match:
                return int(match.group(1))
            return 9000

        education_col = find_first_col(work, ["egitim_donemi", "egitim_adi", "program_adi"])
        group_name_col = find_first_col(work, ["grup_adi", "grup_adı", "egitim_grubu"])
        group_no_col = find_first_col(work, ["grup_no", "grup"])

        education_names: list[str] = []
        education_order_map: dict[str, int] = {}
        if education_col:
            edu_df = (
                work[[education_col]]
                .dropna()
                .assign(_label=lambda d: d[education_col].astype(str).map(lambda x: fix_text(x).strip()))
            )
            edu_df = edu_df[edu_df["_label"].ne("")]
            education_names = sorted(edu_df["_label"].drop_duplicates().tolist(), key=lambda x: (education_order(x), normalize_key(x)))
            required_education_names = ["7. Ay Eğitimi"]
            existing_education_keys = {normalize_key(name) for name in education_names}
            for required_name in required_education_names:
                required_key = normalize_key(required_name)
                if required_key not in existing_education_keys:
                    education_names.append(required_name)
                    existing_education_keys.add(required_key)
            education_names = sorted(education_names, key=lambda x: (education_order(x), normalize_key(x)))
            education_order_map = {name: education_order(name) for name in education_names}

        group_options: list[dict] = []
        if group_name_col or group_no_col:
            group_cols = [c for c in [group_no_col, group_name_col] if c]
            group_df = work[group_cols].copy()
            for col in group_cols:
                group_df[col] = group_df[col].apply(lambda x: fix_text(x).strip() if isinstance(x, str) else x)
            if group_no_col:
                group_df["_group_value"] = group_df[group_no_col].astype(str).str.strip()
            else:
                group_df["_group_value"] = group_df[group_name_col].astype(str).str.strip()
            if group_name_col:
                group_df["_group_label"] = group_df[group_name_col].astype(str).str.strip()
            else:
                group_df["_group_label"] = group_df["_group_value"]
            group_df = group_df[group_df["_group_value"].ne("")]
            for value, group in group_df.groupby("_group_value", dropna=False):
                label_parts = [str(value)]
                name_sample = next((str(v).strip() for v in group["_group_label"].dropna().tolist() if str(v).strip()), "")
                if name_sample and normalize_key(name_sample) != normalize_key(value):
                    label_parts.append(name_sample)
                group_options.append(
                    {
                        "value": value,
                        "label": str(value),
                        "title": " · ".join(label_parts),
                        "count": int(len(group)),
                    }
                )
            group_options.sort(key=lambda x: normalize_key(x.get("label")))

        sort_cols = [c for c in ["month", "donem", "sicil"] if c in work.columns]
        if sort_cols:
            work = work.sort_values(sort_cols, ascending=[False] + [True] * (len(sort_cols) - 1), na_position="last")

        return {
            "rows": work.to_dict(orient="records"),
            "columns": list(work.columns),
            "group_options": group_options,
            "education_names": education_names,
            "education_order": education_order_map,
        }

    pages["p046_sales_academy_records"] = timed_step(
        "p046_sales_academy_records",
        build_sales_academy_records_page,
    )

    gelisim_work = gelisim_yolculuk_df.copy() if isinstance(gelisim_yolculuk_df, pd.DataFrame) else pd.DataFrame()
    if not gelisim_work.empty:
        gelisim_sicil_col = find_first_col(gelisim_work, ["sicil", "sicil_no", "Kullanıcı Kodu", "Kullanici Kodu", "kullanıcı_kodu"])
        gelisim_status_col = find_first_col(gelisim_work, ["Tamamlama Durumu", "tamamlama_durumu", "durum"])
        gelisim_oran_col = find_first_col(gelisim_work, ["Durum Oran", "durum_oran", "durum oran", "Tamamlama Oranı", "tamamlama_orani"])
        if gelisim_sicil_col:
            gelisim_work["sicil_key"] = gelisim_work[gelisim_sicil_col].apply(normalize_sicil_key)
            gelisim_work = gelisim_work[gelisim_work["sicil_key"].notna()].copy()
        else:
            gelisim_work = pd.DataFrame()
        if gelisim_status_col and not gelisim_work.empty:
            gelisim_work["gelisim_yolculugu_durumu"] = gelisim_work[gelisim_status_col].apply(
                lambda x: fix_text(x).strip() if isinstance(x, str) else x
            )
        elif not gelisim_work.empty:
            gelisim_work["gelisim_yolculugu_durumu"] = None
        if gelisim_oran_col and not gelisim_work.empty:
            oran = numeric(gelisim_work[gelisim_oran_col])
            if oran.notna().any() and bool(oran.dropna().le(1).all()):
                oran = oran * 100
            gelisim_work["durum_oran"] = oran.clip(lower=0, upper=100)
        elif not gelisim_work.empty:
            gelisim_work["durum_oran"] = np.nan

    gelisim_latest = (
        gelisim_work.drop_duplicates(subset=["sicil_key"], keep="last")
        if not gelisim_work.empty and "sicil_key" in gelisim_work.columns
        else pd.DataFrame()
    )
    gelisim_status_map = (
        gelisim_latest.set_index("sicil_key")["gelisim_yolculugu_durumu"].to_dict()
        if not gelisim_latest.empty and "gelisim_yolculugu_durumu" in gelisim_latest.columns
        else {}
    )
    gelisim_oran_map = (
        gelisim_latest.set_index("sicil_key")["durum_oran"].to_dict()
        if not gelisim_latest.empty and "durum_oran" in gelisim_latest.columns
        else {}
    )
    gelisim_sicil_keys = sorted(set(gelisim_status_map.keys()) | set(gelisim_oran_map.keys()))

    perf_work = performans_magaza_df.copy() if isinstance(performans_magaza_df, pd.DataFrame) else pd.DataFrame()
    if not perf_work.empty:
        perf_sicil_col = find_first_col(perf_work, ["sicil", "sicil_no", "Kullanıcı Kodu", "Kullanici Kodu"])
        perf_donem_col = find_first_col(perf_work, ["donem", "Dönem", "Donem"])
        if perf_sicil_col:
            perf_work["sicil_key"] = perf_work[perf_sicil_col].apply(normalize_sicil_key)
        if perf_donem_col:
            perf_work["donem"] = pd.to_datetime(perf_work[perf_donem_col], errors="coerce")
            perf_work["month"] = to_month(perf_work["donem"])
        if "performans_notu" in perf_work.columns:
            perf_work["performans_notu"] = perf_work["performans_notu"].apply(
                lambda x: fix_text(x).strip() if isinstance(x, str) else x
            )
        if "sonuc_notu" in perf_work.columns:
            perf_work["sonuc_notu"] = perf_work["sonuc_notu"].apply(
                lambda x: fix_text(x).strip() if isinstance(x, str) else x
            )
        if "sicil_key" in perf_work.columns:
            perf_work = perf_work[perf_work["sicil_key"].notna()].copy()

    perf_months = (
        sorted(perf_work["month"].dropna().astype(str).unique(), key=lambda m: pd.Period(m, freq="M"))
        if not perf_work.empty and "month" in perf_work.columns
        else []
    )

    def performance_map_for_month(month: str) -> tuple[dict[str, dict], str | None]:
        if perf_work.empty or not perf_months:
            return {}, None
        month_period = pd.Period(month, freq="M")
        valid_months = [m for m in perf_months if pd.Period(m, freq="M") <= month_period]
        source_month = valid_months[-1] if valid_months else perf_months[-1]
        sub = perf_work[perf_work["month"].astype(str) == source_month].copy()
        if sub.empty:
            return {}, source_month
        keep_cols = [c for c in ["sicil_key", "performans_notu", "sonuc_notu"] if c in sub.columns]
        return (
            sub.sort_values("sicil_key").drop_duplicates(subset=["sicil_key"], keep="last")[keep_cols].set_index("sicil_key").to_dict("index"),
            source_month,
        )

    def employee_snapshot_for_month(month: str, *, only_active: bool = False) -> dict[str, dict]:
        sub = month_cache.get(month, empty_df)
        if sub.empty or "sicil_no" not in sub.columns:
            return {}
        work = sub.copy()
        if only_active and "calisan_sayisi" in work.columns:
            work = work[numeric(work["calisan_sayisi"]).fillna(0) > 0].copy()
        work["sicil_key"] = work["sicil_no"].apply(normalize_sicil_key)
        work = work[work["sicil_key"].notna()].copy()
        if work.empty:
            return {}
        cols = [
            "sicil_key", "sicil_no", "adi_soyadi", "isletme_adi", "departman_adi",
            "il", "gorev", "kidem_yil", "ust_bolum", "ust_bolum_norm", "ust_bolum_key",
        ]
        cols = [c for c in cols if c in work.columns]
        return work[cols].drop_duplicates(subset=["sicil_key"], keep="last").set_index("sicil_key").to_dict("index")

    latest_employee_month = months[-1] if months else None
    latest_employee_snapshot = (
        employee_snapshot_for_month(latest_employee_month, only_active=True)
        if latest_employee_month
        else {}
    )

    discipline_work = cezalar_df.copy() if isinstance(cezalar_df, pd.DataFrame) else pd.DataFrame()
    if not discipline_work.empty:
        if "sicil_key" not in discipline_work.columns:
            sicil_col = find_first_col(discipline_work, ["PERNO", "perno", "sicil", "sicil_no"])
            if sicil_col:
                discipline_work["sicil_key"] = discipline_work[sicil_col].apply(normalize_sicil_key)
        if "ceza_tarihi" not in discipline_work.columns:
            date_col = find_first_col(discipline_work, ["TARIH", "Tarih", "tarih"])
            if date_col:
                discipline_work["ceza_tarihi"] = pd.to_datetime(discipline_work[date_col], errors="coerce")
        if "ceza_adi" not in discipline_work.columns:
            code_col = find_first_col(discipline_work, ["OCKOD", "ockod", "ceza_kodu"])
            if code_col:
                discipline_work["ceza_kodu"] = discipline_work[code_col].astype(str).str.strip().str.upper()
                discipline_work["ceza_adi"] = discipline_work["ceza_kodu"].map(DISCIPLINE_CODE_MAP).fillna("Diğer")
        if "ceza_aciklama" not in discipline_work.columns:
            desc_col = find_first_col(discipline_work, ["ACIKLAMA", "Açıklama", "aciklama", "açıklama"])
            if desc_col:
                discipline_work["ceza_aciklama"] = discipline_work[desc_col]
        if "sicil_key" in discipline_work.columns:
            discipline_work = discipline_work[discipline_work["sicil_key"].notna()].copy()

    latest_discipline_map = (
        discipline_work.sort_values(["sicil_key", "ceza_tarihi"], na_position="first")
        .drop_duplicates(subset=["sicil_key"], keep="last")
        .set_index("sicil_key")
        .to_dict("index")
        if not discipline_work.empty and {"sicil_key", "ceza_tarihi"}.issubset(discipline_work.columns)
        else {}
    )

    def performance_letter_grade(value: object) -> str | None:
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

    def is_completed_status(value: object) -> bool:
        return "tamam" in normalize_key(value)

    def is_graduated_status(value: object) -> bool:
        key = normalize_key(value)
        return "mezun" in key and "degil" not in key

    def promotion_eligibility(
        *,
        kidem_yili: object,
        gelisim_durumu: object,
        sales_academy_mezun: bool,
        performans_harf_notu: object,
        last_discipline: dict | None,
        reference_month: str,
    ) -> tuple[str, str]:
        reasons: list[str] = []
        tenure = pd.to_numeric(pd.Series([kidem_yili]), errors="coerce").iloc[0]
        tenure_val = float(tenure) if not pd.isna(tenure) else None
        grade = str(performans_harf_notu or "").strip().upper()
        if tenure_val is None:
            reasons.append("kıdem bilgisi yok")
        if grade not in {"A", "B", "C"}:
            reasons.append("performans harf notu C ve uzeri degil")
        if not is_completed_status(gelisim_durumu):
            reasons.append("gelişim yolculuğu tamamlanmadı")
        if not sales_academy_mezun:
            reasons.append("Satış Akademisi mezun değil")

        ref_date = pd.Period(reference_month, freq="M").to_timestamp(how="end") if reference_month else pd.Timestamp.now()
        discipline_note = ""
        if last_discipline:
            last_date = pd.to_datetime(last_discipline.get("ceza_tarihi"), errors="coerce")
            if pd.isna(last_date):
                reasons.append("son ceza tarihi eksik")
            else:
                days_since = int((ref_date.normalize() - last_date.normalize()).days)
                discipline_note = f"son ceza üzerinden {days_since} gün geçti"
                if days_since < 365:
                    reasons.append("son cezanın üzerinden 1 yıl geçmedi")

        common_ok = not reasons
        eligible_mdy = common_ok and tenure_val is not None and tenure_val > 1
        eligible_manager = common_ok and tenure_val is not None and tenure_val >= 2
        if common_ok and eligible_manager:
            return "Mağaza Müdürlüğü ve Mağaza Müdür Yardımcılığı / Mağaza 2.Müdürlüğü için uygun", discipline_note
        if common_ok and eligible_mdy:
            return "Mağaza Müdür Yardımcılığı / Mağaza 2.Müdürlüğü için uygun", discipline_note
        if common_ok and tenure_val is not None:
            if tenure_val <= 1:
                reasons.append("MY/2.Müdür için kıdem 1 yıl üstü değil")
            if tenure_val < 2:
                reasons.append("Mağaza Müdürü için kıdem en az 2 yıl değil")
        return "Uygun değil: " + "; ".join(reasons), discipline_note

    def is_latest_store_employee(sicil_key: str) -> bool:
        emp = latest_employee_snapshot.get(sicil_key) or {}
        if not emp:
            return False
        loc_key = normalize_key(emp.get("ust_bolum_key") or emp.get("ust_bolum_norm") or emp.get("ust_bolum"))
        return loc_key == "magaza"

    def fill_employee_from_latest(emp: dict, sicil_key: str) -> dict:
        latest_emp = latest_employee_snapshot.get(sicil_key) or {}
        if not latest_emp:
            return emp or {}
        out = dict(emp or {})
        for key in ["sicil_no", "adi_soyadi", "isletme_adi", "departman_adi", "il", "gorev", "kidem_yil", "ust_bolum", "ust_bolum_norm", "ust_bolum_key"]:
            if _is_null(out.get(key)) or str(out.get(key) or "").strip() == "":
                out[key] = latest_emp.get(key)
        return out

    def sales_academy_latest_map_for_month(month: str) -> dict[str, dict]:
        if satis_df.empty:
            return {}
        track = satis_df.copy()
        sicil_col = find_first_col(track, ["sicil_num", "sicil", "sicil_no"])
        if not sicil_col:
            return {}
        track["sicil_key"] = track[sicil_col].apply(normalize_sicil_key)
        track = track[track["sicil_key"].notna()].copy()
        if "month" in track.columns:
            track = track[track["month"].astype(str) <= str(month)].copy()
        if track.empty:
            return {}

        katilim_series = (
            track["katilim_durumu_norm"]
            if "katilim_durumu_norm" in track.columns
            else track["katilim_durumu"].apply(normalize_key)
            if "katilim_durumu" in track.columns
            else pd.Series("", index=track.index, dtype="string")
        )
        track = track[katilim_series.astype("string").str.contains("katildi", na=False)].copy()
        if track.empty:
            return {}

        egitim_norm = (
            track["egitim_donemi_norm"]
            if "egitim_donemi_norm" in track.columns
            else track["egitim_donemi"].apply(normalize_key)
            if "egitim_donemi" in track.columns
            else pd.Series("", index=track.index, dtype="string")
        )
        uzman_norm = (
            track["uzman_yonetici_norm"]
            if "uzman_yonetici_norm" in track.columns
            else track["uzman_yonetici"].apply(normalize_key)
            if "uzman_yonetici" in track.columns
            else pd.Series("", index=track.index, dtype="string")
        )
        academy_mask = (
            egitim_norm.astype("string").str.contains("satis|akademi", na=False)
            | uzman_norm.astype("string").str.contains("satis akademisi", na=False)
        )
        if academy_mask.any():
            track = track[academy_mask].copy()

        sort_cols = ["sicil_key"]
        if "donem" in track.columns:
            track["donem_sort"] = pd.to_datetime(track["donem"], errors="coerce")
            sort_cols.append("donem_sort")
        elif "month" in track.columns:
            sort_cols.append("month")
        mezun_col = find_first_col(track, ["mezun", "Mezun"])
        mezun_by_sicil = {}
        if mezun_col:
            mezun_by_sicil = (
                track.groupby("sicil_key")[mezun_col]
                .apply(lambda s: any(is_graduated_status(v) for v in s.dropna()))
                .to_dict()
            )

        latest = track.sort_values(sort_cols, ascending=[True] + [False] * (len(sort_cols) - 1), na_position="last")
        latest = latest.drop_duplicates(subset=["sicil_key"], keep="first")
        keep_cols = [c for c in ["sicil_key", "egitim_donemi", "donem", "month", "katilim_durumu", "mezun"] if c in latest.columns]
        out = latest[keep_cols].set_index("sicil_key").to_dict("index")
        for key, rec in out.items():
            rec["satis_akademisi_mezun"] = bool(mezun_by_sicil.get(key, False))
        return out

    def academy_development_for_month(month: str) -> dict:
        snapshot = employee_snapshot_for_month(month)
        perf_map, perf_source_month = performance_map_for_month(month)
        rows: list[dict] = []
        for sicil_key in gelisim_sicil_keys:
            if not is_latest_store_employee(sicil_key):
                continue
            emp = fill_employee_from_latest(snapshot.get(sicil_key, {}), sicil_key)
            perf = perf_map.get(sicil_key, {})
            rows.append(
                {
                    "sicil": emp.get("sicil_no") or sicil_key,
                    "isim_soyisim": preferred_person_name(sicil_key, emp.get("adi_soyadi")),
                    "magaza": emp.get("isletme_adi"),
                    "bolge": emp.get("departman_adi"),
                    "il": emp.get("il"),
                    "gorev": emp.get("gorev"),
                    "performans_notu": perf.get("performans_notu"),
                    "kidem_yili": emp.get("kidem_yil"),
                    "tamamlama_durumu": gelisim_status_map.get(sicil_key),
                    "durum_oran": gelisim_oran_map.get(sicil_key),
                }
            )
        if rows:
            status_series = pd.Series([r.get("tamamlama_durumu") for r in rows], dtype="object").fillna("Bilinmiyor")
            status_counts = [
                {"label": str(label), "count": int(count)}
                for label, count in status_series.value_counts().items()
            ]
        else:
            status_counts = []
        rows.sort(key=lambda r: (str(r.get("tamamlama_durumu") or ""), str(r.get("bolge") or ""), str(r.get("magaza") or ""), str(r.get("isim_soyisim") or "")))
        return {"rows": rows, "status_counts": status_counts, "performance_source_month": perf_source_month}

    def org_development_tracking_for_month(month: str) -> dict:
        snapshot = employee_snapshot_for_month(month, only_active=True)
        perf_map, perf_source_month = performance_map_for_month(month)
        sales_map = sales_academy_latest_map_for_month(month)
        rows: list[dict] = []
        for sicil_key, emp in snapshot.items():
            if not is_latest_store_employee(sicil_key):
                continue
            perf = perf_map.get(sicil_key, {})
            sales = sales_map.get(sicil_key, {})
            last_discipline = latest_discipline_map.get(sicil_key)
            gelisim_durumu = gelisim_status_map.get(sicil_key, "Kayıt Yok")
            perf_letter = performance_letter_grade(perf.get("performans_notu"))
            uygunluk, uygunluk_notu = promotion_eligibility(
                kidem_yili=emp.get("kidem_yil"),
                gelisim_durumu=gelisim_durumu,
                sales_academy_mezun=bool(sales.get("satis_akademisi_mezun")),
                performans_harf_notu=perf_letter,
                last_discipline=last_discipline,
                reference_month=month,
            )
            last_discipline_date = (
                pd.to_datetime(last_discipline.get("ceza_tarihi"), errors="coerce")
                if last_discipline
                else pd.NaT
            )
            rows.append(
                {
                    "sicil": emp.get("sicil_no") or sicil_key,
                    "isim_soyisim": preferred_person_name(sicil_key, emp.get("adi_soyadi")),
                    "magaza": emp.get("isletme_adi"),
                    "bolge": emp.get("departman_adi"),
                    "il": emp.get("il"),
                    "gorev": emp.get("gorev"),
                    "son_satis_akademisi": sales.get("egitim_donemi"),
                    "son_satis_akademisi_tarihi": sales.get("donem") or sales.get("month"),
                    "satis_akademisi_mezun": "Mezun" if sales.get("satis_akademisi_mezun") else "Mezun Değil",
                    "gelisim_yolculugu_durumu": gelisim_durumu,
                    "gelisim_yolculugu_oran": gelisim_oran_map.get(sicil_key),
                    "performans_notu": perf.get("performans_notu"),
                    "performans_harf_notu": perf_letter,
                    "kidem_yili": emp.get("kidem_yil"),
                    "son_ceza_tarihi": last_discipline_date.date().isoformat() if not pd.isna(last_discipline_date) else None,
                    "son_ceza_turu": last_discipline.get("ceza_adi") if last_discipline else None,
                    "son_ceza_aciklama": last_discipline.get("ceza_aciklama") if last_discipline else None,
                    "terfiye_uygunluk": uygunluk,
                    "terfi_uygunluk_notu": uygunluk_notu,
                }
            )
        rows.sort(key=lambda r: (str(r.get("bolge") or ""), str(r.get("magaza") or ""), str(r.get("isim_soyisim") or "")))
        return {"rows": rows, "performance_source_month": perf_source_month}

    def org_dev_employee_master_page() -> dict:
        if fiili_df.empty:
            return {"rows": [], "source_month": latest_org_month}
        rows: list[dict] = []
        work = fiili_df.copy()
        for rec in work.to_dict("records"):
            sicil_key = normalize_sicil_key(rec.get("P_NO"))
            rows.append(
                {
                    "sicil_no": rec.get("P_NO"),
                    "adi_soyadi": preferred_person_name(sicil_key, rec.get("AD_SOYAD")) if sicil_key else rec.get("AD_SOYAD"),
                    "departman": rec.get("BOLUM_ADI"),
                    "ust_bolum": rec.get("UST_BOLUM_ADI"),
                    "magaza_birim": rec.get("ISLETME_AD"),
                    "lokasyon": rec.get("LOKASYON"),
                    "gorev": rec.get("GOREV_ADI") if "GOREV_ADI" in rec else rec.get("POZISYON_ADI"),
                    "pozisyon": rec.get("POZISYON_ADI"),
                    "unvan": rec.get("UNVAN_ADI"),
                    "kadro_adi": rec.get("kadro_adı"),
                    "cinsiyet": rec.get("CINSIYET"),
                    "beyaz_mavi_yaka": rec.get("YAKA"),
                    "ise_giris_tarihi": rec.get("ILK_BASLAMA_TARIHI"),
                    "isyeri_baslama_tarihi": rec.get("İŞYERİ_BAŞLAMA_TARİHİ"),
                    "DOGUM_TARIHI": rec.get("DOGUM_TARIHI"),
                    "yas": rec.get("YAS"),
                    "kidem_yili": rec.get("KIDEM_YILI"),
                    "OGRENIM_DURUMU": rec.get("OGRENIM_DURUMU"),
                    "IL": rec.get("IL"),
                    "calisan_grup": rec.get("CALISAN_GRUP"),
                    "engel_statusu": rec.get("ENGEL_STATUSU"),
                    "email": rec.get("EMAIL"),
                    "telefon": rec.get("TELEFON"),
                }
            )
        rows.sort(key=lambda r: (str(r.get("ust_bolum") or ""), str(r.get("departman") or ""), str(r.get("adi_soyadi") or "")))
        return {"rows": rows, "source_month": latest_org_month}

    pages["p036_academy_development_journey"] = {
        "by_month": {m: academy_development_for_month(m) for m in months},
    }
    latest_org_month = months[-1] if months else None
    pages["p037_org_dev_employee_tracking"] = {
        "latest_month": latest_org_month,
        "source_month_by_month": {m: latest_org_month for m in months} if latest_org_month else {},
        "by_month": {
            latest_org_month: org_development_tracking_for_month(latest_org_month)
        } if latest_org_month else {},
    }
    pages["p045_store_profile_compare"] = timed_step(
        "p045_store_profile_compare",
        build_store_profile_compare_page,
    )
    pages["p041_org_dev_employee_master"] = org_dev_employee_master_page()

    def prepare_risk_rows(raw_df: pd.DataFrame) -> list[dict]:
        if raw_df.empty:
            return []
        col_candidates = {
            "sicil_no": ["sicil_no", "sicil", "sicilno"],
            "adi_soyadi": ["adi_soyadi", "ad_soyad", "kisi_adi"],
            "departman_adi": ["departman_adi", "departman"],
            "isletme_adi": ["isletme_adi", "magaza_adi", "magaza"],
            "risk_puani": ["risk_puani", "risk_score"],
            "risk_seviyesi": ["risk_seviyesi", "risk_level"],
            "risk_olasilik": ["risk_olasilik", "risk_olasilik_calibrated", "risk_probability"],
            "risk_aciklama": ["risk_aciklama", "risk_explanation"],
        }
        out = pd.DataFrame(index=raw_df.index)
        for target_col, candidates in col_candidates.items():
            src = next((c for c in candidates if c in raw_df.columns), None)
            out[target_col] = raw_df[src] if src else None

        out["risk_puani"] = numeric(out["risk_puani"])
        out["risk_olasilik"] = numeric(out["risk_olasilik"])
        out["risk_seviyesi"] = out["risk_seviyesi"].apply(
            lambda x: fix_text(x).strip() if isinstance(x, str) else x
        )
        out["risk_aciklama"] = out["risk_aciklama"].apply(
            lambda x: fix_text(x).strip() if isinstance(x, str) else x
        )
        if person_name_map and "sicil_no" in out.columns and "adi_soyadi" in out.columns:
            mapped_names = out["sicil_no"].apply(normalize_sicil_key).map(person_name_map)
            out["adi_soyadi"] = mapped_names.where(mapped_names.notna(), out["adi_soyadi"])
        out = out.sort_values("risk_puani", ascending=False, na_position="last")
        return out.to_dict(orient="records")

    risk_rows_by_month: dict[str, list[dict]] = {}
    risk_segment_matrix_by_month: dict[str, dict] = {}
    risk_months: list[str] = []
    latest_risk_month: str | None = None
    source_month_by_month: dict[str, str | None] = {}
    risk_src_full = pd.DataFrame()

    def build_risk_segment_matrix(risk_month: str, raw_df: pd.DataFrame) -> dict:
        """Risk x performans segmentleri: dashboard baloncuk grafiği için özet."""
        if raw_df is None or raw_df.empty:
            return {
                "bubbles": [],
                "thresholds": {"risk": 60, "performance": None},
                "performance_source_month": None,
                "points_count": 0,
                "total_risk_count": 0,
                "missing_performance_count": 0,
            }

        perf_map, perf_source_month = performance_map_for_month(str(risk_month))
        if not perf_map:
            return {
                "bubbles": [],
                "thresholds": {"risk": 60, "performance": None},
                "performance_source_month": perf_source_month,
                "points_count": 0,
                "total_risk_count": int(len(raw_df)),
                "missing_performance_count": int(len(raw_df)),
            }

        work = raw_df.copy()
        sicil_col = find_first_col(work, ["sicil_no", "sicil", "sicilno"])
        if not sicil_col or "risk_puani" not in work.columns:
            return {
                "bubbles": [],
                "thresholds": {"risk": 60, "performance": None},
                "performance_source_month": perf_source_month,
                "points_count": 0,
                "total_risk_count": 0,
                "missing_performance_count": 0,
            }

        work["sicil_key"] = work[sicil_col].apply(normalize_sicil_key)
        work["risk_puani_num"] = numeric(work["risk_puani"])
        work = (
            work[work["sicil_key"].notna()]
            .sort_values("risk_puani_num", ascending=False, na_position="last")
            .drop_duplicates("sicil_key", keep="first")
        )
        total_risk_count = int(work["risk_puani_num"].notna().sum())

        def perf_value(sicil_key: object) -> float | None:
            row = perf_map.get(str(sicil_key))
            if not row:
                return None
            val = row.get("performans_notu")
            parsed = numeric(pd.Series([val])).iloc[0]
            return float(parsed) if pd.notna(parsed) else None

        work["performans_bilesik"] = work["sicil_key"].map(perf_value)
        valid = work.dropna(subset=["risk_puani_num", "performans_bilesik"]).copy()
        if valid.empty:
            return {
                "bubbles": [],
                "thresholds": {"risk": 60, "performance": None},
                "performance_source_month": perf_source_month,
                "points_count": 0,
                "total_risk_count": total_risk_count,
                "missing_performance_count": total_risk_count,
            }

        risk_threshold = 60.0
        perf_threshold = float(numeric(valid["performans_bilesik"]).quantile(0.60))

        def segment_label(row: pd.Series) -> str:
            high_perf = float(row["performans_bilesik"]) >= perf_threshold
            high_risk = float(row["risk_puani_num"]) >= risk_threshold
            if high_perf and not high_risk:
                return "Star Performer"
            if high_perf and high_risk:
                return "Flight Risk"
            if (not high_perf) and not high_risk:
                return "Gelişim Fırsatı"
            return "Kritik Takip"

        valid["segment"] = valid.apply(segment_label, axis=1)
        order = {
            "Flight Risk": 0,
            "Star Performer": 1,
            "Kritik Takip": 2,
            "Gelişim Fırsatı": 3,
        }
        bubbles: list[dict] = []
        for segment, group in valid.groupby("segment", dropna=False):
            count = int(len(group))
            avg_risk = float(numeric(group["risk_puani_num"]).mean())
            avg_perf = float(numeric(group["performans_bilesik"]).mean())
            avg_tenure = None
            if "kidem_yil" in group.columns:
                tenure_val = numeric(group["kidem_yil"]).mean()
                avg_tenure = float(tenure_val) if pd.notna(tenure_val) else None
            bubbles.append(
                {
                    "segment": str(segment),
                    "count": count,
                    "avg_risk": round(avg_risk, 1),
                    "avg_performance": round(avg_perf, 1),
                    "avg_tenure": round(avg_tenure, 1) if avg_tenure is not None else None,
                    "share": safe_div(count, len(valid)),
                    "order": order.get(str(segment), 9),
                }
            )

        bubbles = sorted(bubbles, key=lambda row: (row.get("order", 9), str(row.get("segment", ""))))
        for row in bubbles:
            row.pop("order", None)

        return {
            "bubbles": sanitize(bubbles),
            "thresholds": {"risk": risk_threshold, "performance": round(perf_threshold, 1)},
            "performance_source_month": perf_source_month,
            "points_count": int(len(valid)),
            "total_risk_count": total_risk_count,
            "missing_performance_count": max(0, total_risk_count - int(len(valid))),
        }

    if not risk_df.empty:
        risk_src = risk_df.copy()
        if "donem" in risk_src.columns:
            risk_src["month"] = to_month(risk_src["donem"])
        elif "month" not in risk_src.columns:
            risk_src["month"] = None

        risk_src = risk_src[risk_src["month"].notna()].copy()
        if "ust_bolum" in risk_src.columns:
            risk_src["ust_bolum_norm"] = risk_src["ust_bolum"].apply(normalize_ust_bolum)
        risk_src_full = risk_src.copy()
        if not risk_src.empty:
            risk_months = sorted(
                risk_src["month"].dropna().astype(str).unique(),
                key=lambda m: pd.Period(m, freq="M"),
            )
            latest_risk_month = risk_months[-1] if risk_months else None
            for risk_month, group in risk_src.groupby("month", dropna=False):
                key = str(risk_month)
                risk_rows_by_month[key] = prepare_risk_rows(group)
                risk_segment_matrix_by_month[key] = build_risk_segment_matrix(key, group)

    if months:
        for m in months:
            if m in risk_rows_by_month:
                source_month_by_month[m] = m
            else:
                # Risk hesapları genelde en güncel ay için üretildiği için,
                # seçili ayda veri yoksa en güncel risk ayı gösterilir.
                source_month_by_month[m] = latest_risk_month

    pages["p021_risk_summary"] = {
        "by_month": risk_rows_by_month,
        "available_months": risk_months,
        "latest_month": latest_risk_month,
        "source_month_by_month": source_month_by_month,
        "segment_matrix": {
            "by_month": risk_segment_matrix_by_month,
            "source_month_by_month": source_month_by_month,
        },
    }

    pages["p022_risk_tables"] = {
        "regions": risk_region.to_dict(orient="records") if not risk_region.empty else [],
        "stores": risk_store.to_dict(orient="records") if not risk_store.empty else [],
    }

    def turnover_region_store_for_month(month: str) -> dict:
        region_rows: list[dict] = []
        store_rows: list[dict] = []

        def build_ust_map(col_name: str) -> dict[str, str]:
            if col_name not in df.columns or "ust_bolum_norm" not in df.columns:
                return {}
            src = month_data(month)[[col_name, "ust_bolum_norm"]].dropna()
            if src.empty:
                return {}
            grp = (
                src.groupby([col_name, "ust_bolum_norm"], as_index=False)
                .size()
                .sort_values(["size"], ascending=False)
            )
            top = grp.drop_duplicates(subset=[col_name]).set_index(col_name)["ust_bolum_norm"]
            return top.to_dict()

        def keep_store_scope(sub: pd.DataFrame, name_col: str, lookup: dict[str, str]) -> pd.DataFrame:
            if sub.empty or name_col not in sub.columns:
                return sub
            scoped = sub.copy()
            scoped["ust_bolum_norm"] = scoped[name_col].map(lookup).apply(normalize_ust_bolum)
            scoped["ust_bolum_key"] = scoped["ust_bolum_norm"].apply(normalize_key)
            filtered = scoped[scoped["ust_bolum_key"] == "magaza"].copy()
            if not filtered.empty:
                return filtered
            # Turnover sheets are sometimes grouped without the original ust_bolum
            # column. In that case use the entity naming convention instead of
            # returning an empty dashboard block.
            entity_key = scoped[name_col].apply(normalize_key)
            if name_col == "departman_adi":
                return scoped[
                    entity_key.str.contains("bolge", na=False)
                    | entity_key.str.contains("yurtici satis", na=False)
                    | entity_key.str.contains("perakende", na=False)
                ].copy()
            if name_col == "isletme_adi":
                return scoped[
                    entity_key.str.contains(".gs.", regex=False, na=False)
                    | entity_key.str.contains("gs", na=False)
                ].copy()
            return filtered

        dept_to_ust = build_ust_map("departman_adi")
        store_to_ust = build_ust_map("isletme_adi")

        if not turnover_dept.empty:
            sub = turnover_dept[turnover_dept["month"] == month]
            sub = keep_store_scope(sub, "departman_adi", dept_to_ust)
            region_rows = sub.sort_values("turnover1", ascending=False).to_dict(orient="records")
        if not turnover_store.empty:
            sub = turnover_store[turnover_store["month"] == month]
            sub = keep_store_scope(sub, "isletme_adi", store_to_ust)
            store_rows = sub.sort_values("turnover1", ascending=False).head(20).to_dict(orient="records")

        return {"regions": region_rows, "stores": store_rows, "filters": ["Mağaza"]}

    pages["p023_turnover_region_store"] = timed_step(
        "p023_turnover_region_store",
        lambda: {"by_month": {m: turnover_region_store_for_month(m) for m in months}},
    )

    compensation_base = magaza_all_df.copy()
    if not compensation_base.empty:
        for col in ["prim_toplam", "temiz_net_gelir"]:
            if col in compensation_base.columns:
                compensation_base[col] = numeric(compensation_base[col]).fillna(0)
            else:
                compensation_base[col] = 0
        if "sgk_gun" in compensation_base.columns:
            compensation_base["sgk_gun_num"] = numeric(compensation_base["sgk_gun"]).fillna(0)
        else:
            compensation_base["sgk_gun_num"] = 0
        if "calisan_sayisi" in compensation_base.columns:
            compensation_base["calisan_sayisi_num"] = numeric(compensation_base["calisan_sayisi"]).fillna(0)
        else:
            compensation_base["calisan_sayisi_num"] = 0
        position_col = find_first_col(
            compensation_base,
            [MAGAZA_KIRILIM_COL, "magaza_title", "kısa_gorev", "kisa_gorev", "gorev", "unvan"],
        )
        if position_col:
            compensation_base["position_filter"] = compensation_base[position_col].apply(
                lambda x: fix_text(x).strip() if isinstance(x, str) else x
            )
        else:
            compensation_base["position_filter"] = None
        # Talep edilen tanım: ücret+diğer = temiz net gelir - prim
        compensation_base["ucret_diger"] = (
            compensation_base["temiz_net_gelir"] - compensation_base["prim_toplam"]
        )
        if {"isletme_adi", "departman_adi"}.issubset(turnover_store.columns):
            region_lookup = (
                turnover_store[["isletme_adi", "departman_adi"]]
                .dropna(subset=["isletme_adi", "departman_adi"])
                .drop_duplicates(subset=["isletme_adi"], keep="first")
            )
            if not region_lookup.empty:
                compensation_base = compensation_base.merge(
                    region_lookup.rename(columns={"departman_adi": "comp_region"}),
                    on="isletme_adi",
                    how="left",
                )
        elif "departman_adi" in compensation_base.columns:
            compensation_base["comp_region"] = compensation_base["departman_adi"]

    def build_compensation_group_table(entity_col: str) -> pd.DataFrame:
        if compensation_base.empty or entity_col not in compensation_base.columns:
            return pd.DataFrame()
        group_cols = [entity_col, MAGAZA_KIRILIM_COL, "position_filter", "month"]
        if entity_col == "isletme_adi" and "comp_region" in compensation_base.columns:
            group_cols.append("comp_region")
        group_cols = [c for c in group_cols if c in compensation_base.columns]
        agg_dict: dict[str, tuple[str, str]] = {
            "prim_toplam": ("prim_toplam", "sum"),
            "temiz_net_gelir": ("temiz_net_gelir", "sum"),
            "ucret_diger": ("ucret_diger", "sum"),
            "sgk_total": ("sgk_gun_num", "sum"),
            "denom_calisan": ("calisan_sayisi_num", "sum"),
            "row_count": ("prim_toplam", "size"),
        }
        if "sicil_no" in compensation_base.columns:
            agg_dict["denom_sicil"] = ("sicil_no", "nunique")
        grp = compensation_base.groupby(group_cols, as_index=False).agg(**agg_dict)
        if "denom_sicil" not in grp.columns:
            grp["denom_sicil"] = np.nan
        grp["is_part_time"] = (
            grp["position_filter"].apply(is_part_time_label) if "position_filter" in grp.columns else False
        )
        grp["part_time_equiv_denom"] = grp["sgk_total"] / 16
        grp["full_time_equiv_denom"] = grp["sgk_total"] / 30
        is_part_time = pd.Series(grp["is_part_time"], index=grp.index).fillna(False).astype(bool)
        denom_conditions = [
            is_part_time & (grp["part_time_equiv_denom"] > 0),
            grp["full_time_equiv_denom"] > 0,
            grp["denom_sicil"] > 0,
            grp["denom_calisan"] > 0,
        ]
        denom_choices = [
            grp["part_time_equiv_denom"],
            grp["full_time_equiv_denom"],
            grp["denom_sicil"],
            grp["denom_calisan"],
        ]
        grp["denom"] = np.select(denom_conditions, denom_choices, default=grp["row_count"])
        grp["denom_type"] = np.where(
            is_part_time & (grp["part_time_equiv_denom"] > 0),
            "sgk_gun/16",
            np.where(
                grp["full_time_equiv_denom"] > 0,
                "sgk_gun/30",
                np.where(
                    grp["denom_sicil"] > 0,
                    "sicil_no",
                    np.where(grp["denom_calisan"] > 0, "calisan_sayisi", "row_count"),
                ),
            ),
        )
        grp["ucret_diger_pp"] = grp["ucret_diger"] / grp["denom"]
        grp["prim_pp"] = grp["prim_toplam"] / grp["denom"]
        grp["temiz_pp"] = grp["temiz_net_gelir"] / grp["denom"]
        return grp

    def best_populated_col(frame: pd.DataFrame, candidates: list[str]) -> str | None:
        best_col = None
        best_count = -1
        for col in candidates:
            if col not in frame.columns:
                continue
            populated = int(frame[col].notna().sum())
            if populated > best_count:
                best_col = col
                best_count = populated
        return best_col if best_count > 0 else None

    compensation_store_grp = build_compensation_group_table("isletme_adi")
    compensation_region_col = best_populated_col(
        compensation_base,
        ["bolge", "comp_region", "departman", "departman_adi", "bolum_adi"],
    )
    compensation_region_grp = build_compensation_group_table(compensation_region_col) if compensation_region_col else pd.DataFrame()
    compensation_positions = (
        sorted({str(v).strip() for v in compensation_base["position_filter"].dropna().tolist() if str(v).strip()})
        if not compensation_base.empty and "position_filter" in compensation_base.columns
        else []
    )

    compensation_target_months = [months[-1]] if months else []

    def prepare_compensation_scope_cache(
        scope_label: str,
        entity_col: str,
        grp: pd.DataFrame,
        target_months: list[str],
    ) -> dict[str, list[dict]]:
        rows_by_month = {m: [] for m in target_months}
        if grp.empty or entity_col not in grp.columns:
            return rows_by_month

        key_cols: list[str] = []
        for col in [entity_col, "comp_region", MAGAZA_KIRILIM_COL, "position_filter"]:
            if col in grp.columns and col not in key_cols:
                key_cols.append(col)

        month_index = pd.Index(months, name="month")
        metric_cols = ["ucret_diger_pp", "prim_pp", "temiz_pp", "denom", "denom_type"]
        prepared_items: list[dict] = []

        for key, data in grp.groupby(key_cols, sort=False):
            key_vals = key if isinstance(key, tuple) else (key,)
            key_dict = {col: fix_text(val) for col, val in zip(key_cols, key_vals)}
            entity_name = key_dict.get(entity_col)
            if not entity_name:
                continue
            deduped = (
                data.sort_values("month")
                .drop_duplicates(subset=["month"], keep="last")
                .set_index("month")
                .reindex(month_index)
            )
            if deduped[["ucret_diger_pp", "prim_pp", "temiz_pp"]].notna().sum().sum() <= 0:
                continue
            rolling_avg = deduped[["ucret_diger_pp", "prim_pp", "temiz_pp"]].rolling(window=12, min_periods=1).mean()
            rolling_denom = deduped["denom"].rolling(window=12, min_periods=1).mean()
            prepared_items.append(
                {
                    "key_dict": key_dict,
                    "entity_name": entity_name,
                    "metrics": deduped[metric_cols],
                    "rolling": rolling_avg,
                    "rolling_denom": rolling_denom,
                }
            )

        for target_month in target_months:
            prev = prev_month(target_month)
            if prev == target_month:
                continue
            prev_year_month = add_month(prev, -12)
            bucket = rows_by_month[target_month]

            for item in prepared_items:
                metrics = item["metrics"]
                prev_row = metrics.loc[prev] if prev in metrics.index else None
                if prev_row is None:
                    continue
                if pd.isna(prev_row["ucret_diger_pp"]) and pd.isna(prev_row["prim_pp"]) and pd.isna(prev_row["temiz_pp"]):
                    continue

                prev_year_row = metrics.loc[prev_year_month] if prev_year_month in metrics.index else None
                avg_vals = item["rolling"].loc[prev] if prev in item["rolling"].index else pd.Series(dtype=float)
                avg_denom = item["rolling_denom"].loc[prev] if prev in item["rolling_denom"].index else None
                key_dict = item["key_dict"]
                entity_name = item["entity_name"]

                bucket.append(
                    {
                        "scope": scope_label,
                        "entity": entity_name,
                        "isletme_adi": entity_name if scope_label == "Mağaza" else None,
                        "departman_adi": entity_name if scope_label == "Bölge" else key_dict.get("comp_region"),
                        "comp_region": entity_name if scope_label == "B\u00f6lge" else key_dict.get("comp_region"),
                        "region_key": entity_name if scope_label == "B\u00f6lge" else key_dict.get("comp_region"),
                        MAGAZA_KIRILIM_COL: key_dict.get(MAGAZA_KIRILIM_COL),
                        "position_filter": key_dict.get("position_filter"),
                        "ucret_diger_prev": float(prev_row["ucret_diger_pp"]) if pd.notna(prev_row["ucret_diger_pp"]) else 0.0,
                        "ucret_diger_prev_year": (
                            float(prev_year_row["ucret_diger_pp"])
                            if prev_year_row is not None and pd.notna(prev_year_row["ucret_diger_pp"])
                            else None
                        ),
                        "ucret_diger_avg": float(avg_vals["ucret_diger_pp"]) if pd.notna(avg_vals.get("ucret_diger_pp")) else None,
                        "prim_prev": float(prev_row["prim_pp"]) if pd.notna(prev_row["prim_pp"]) else 0.0,
                        "prim_prev_year": (
                            float(prev_year_row["prim_pp"])
                            if prev_year_row is not None and pd.notna(prev_year_row["prim_pp"])
                            else None
                        ),
                        "prim_avg": float(avg_vals["prim_pp"]) if pd.notna(avg_vals.get("prim_pp")) else None,
                        "temiz_prev": float(prev_row["temiz_pp"]) if pd.notna(prev_row["temiz_pp"]) else 0.0,
                        "temiz_prev_year": (
                            float(prev_year_row["temiz_pp"])
                            if prev_year_row is not None and pd.notna(prev_year_row["temiz_pp"])
                            else None
                        ),
                        "temiz_avg": float(avg_vals["temiz_pp"]) if pd.notna(avg_vals.get("temiz_pp")) else None,
                        "denom_prev": float(prev_row["denom"]) if pd.notna(prev_row["denom"]) else None,
                        "denom_prev_year": (
                            float(prev_year_row["denom"])
                            if prev_year_row is not None and pd.notna(prev_year_row["denom"])
                            else None
                        ),
                        "denom_avg": float(avg_denom) if avg_denom is not None and pd.notna(avg_denom) else None,
                        "denom_type": str(prev_row["denom_type"]) if pd.notna(prev_row["denom_type"]) else None,
                    }
                )

        for month_rows in rows_by_month.values():
            month_rows.sort(key=lambda x: x.get("temiz_prev", 0.0), reverse=True)
        return rows_by_month

    compensation_store_rows_by_month = prepare_compensation_scope_cache(
        "Mağaza",
        "isletme_adi",
        compensation_store_grp,
        compensation_target_months,
    )
    compensation_region_rows_by_month = (
        prepare_compensation_scope_cache(
            "Bölge",
            compensation_region_col,
            compensation_region_grp,
            compensation_target_months,
        )
        if compensation_region_col
        else {m: [] for m in compensation_target_months}
    )

    def compensation_for_month(month: str) -> dict:
        prev = prev_month(month)
        prev_year_month = add_month(prev, -12)
        if prev == month:
            return {
                "prev_month": month,
                "prev_year_month": prev_year_month,
                "stores": [],
                "regions": [],
                "rows_combined": [],
                "scopes": [],
                "positions": compensation_positions,
                "summary": {},
            }
        if compensation_base.empty:
            return {
                "prev_month": prev,
                "prev_year_month": prev_year_month,
                "stores": [],
                "regions": [],
                "rows_combined": [],
                "scopes": [],
                "positions": compensation_positions,
                "summary": {},
            }

        stores = list(compensation_store_rows_by_month.get(month, []))
        regions = list(compensation_region_rows_by_month.get(month, []))
        rows_combined = stores + regions
        rows_combined.sort(key=lambda x: x.get("temiz_prev", 0), reverse=True)
        scopes = sorted({r["scope"] for r in rows_combined})

        def summarize_rows(source_rows: list[dict]) -> dict:
            if not source_rows:
                return {}

            def weight_key_for_metric(key: str) -> str:
                if key.endswith("_prev_year"):
                    return "denom_prev_year"
                if key.endswith("_avg"):
                    return "denom_avg"
                return "denom_prev"

            def weighted_mean(key: str) -> float | None:
                weighted_total = 0.0
                total_weight = 0.0
                weight_key = weight_key_for_metric(key)
                for row in source_rows:
                    val = row.get(key)
                    weight = row.get(weight_key) or row.get("denom_prev")
                    if val is None or pd.isna(val):
                        continue
                    weight_num = float(weight) if weight is not None and not pd.isna(weight) else 1.0
                    if weight_num <= 0:
                        weight_num = 1.0
                    weighted_total += float(val) * weight_num
                    total_weight += weight_num
                if total_weight <= 0:
                    return None
                return float(weighted_total / total_weight)

            return {
                "count": len(source_rows),
                "ucret_diger_prev": weighted_mean("ucret_diger_prev"),
                "ucret_diger_prev_year": weighted_mean("ucret_diger_prev_year"),
                "ucret_diger_avg": weighted_mean("ucret_diger_avg"),
                "prim_prev": weighted_mean("prim_prev"),
                "prim_prev_year": weighted_mean("prim_prev_year"),
                "prim_avg": weighted_mean("prim_avg"),
                "temiz_prev": weighted_mean("temiz_prev"),
                "temiz_prev_year": weighted_mean("temiz_prev_year"),
                "temiz_avg": weighted_mean("temiz_avg"),
                "denom_prev": weighted_mean("denom_prev"),
                "denom_prev_year": weighted_mean("denom_prev_year"),
                "denom_avg": weighted_mean("denom_avg"),
            }

        def summarize_scope(scope_label: str) -> dict:
            scope_rows = [r for r in rows_combined if r["scope"] == scope_label]
            return summarize_rows(scope_rows)

        summary = {scope: summarize_scope(scope) for scope in scopes}
        position_summaries = {}
        for position in compensation_positions:
            position_rows = [r for r in rows_combined if r.get("position_filter") == position]
            position_summary = summarize_rows(position_rows)
            if not position_summary:
                continue
            position_summaries[position] = {
                "summary": position_summary,
                "aggregate_row": {
                    "scope": "Genel",
                    "entity": "Genel Ortalama",
                    "position_filter": position,
                    "ucret_diger_prev": position_summary.get("ucret_diger_prev"),
                    "ucret_diger_prev_year": position_summary.get("ucret_diger_prev_year"),
                    "ucret_diger_avg": position_summary.get("ucret_diger_avg"),
                    "prim_prev": position_summary.get("prim_prev"),
                    "prim_prev_year": position_summary.get("prim_prev_year"),
                    "prim_avg": position_summary.get("prim_avg"),
                    "temiz_prev": position_summary.get("temiz_prev"),
                    "temiz_prev_year": position_summary.get("temiz_prev_year"),
                    "temiz_avg": position_summary.get("temiz_avg"),
                    "denom_prev": position_summary.get("denom_prev"),
                    "denom_prev_year": position_summary.get("denom_prev_year"),
                    "denom_avg": position_summary.get("denom_avg"),
                },
            }
        return {
            "prev_month": prev,
            "prev_year_month": prev_year_month,
            "stores": stores,
            "regions": regions,
            "rows_combined": rows_combined,
            "scopes": scopes,
            "positions": compensation_positions,
            "summary": summary,
            "position_summaries": position_summaries,
        }

    def build_compensation_page() -> dict:
        latest_month = compensation_target_months[-1] if compensation_target_months else None
        if latest_month is None:
            return {"latest_month": None, "source_month_by_month": {}, "by_month": {}}
        return {
            "latest_month": latest_month,
            "source_month_by_month": {m: latest_month for m in months},
            "by_month": {latest_month: compensation_for_month(latest_month)},
        }

    pages["p024_compensation"] = timed_step(
        "p024_compensation",
        build_compensation_page,
    )

    def build_isgucu_kaybi_page() -> dict:
        if isgucu_kaybi_df.empty:
            return {"timeline": [], "by_month": {m: {"rows": []} for m in months}}

        src = isgucu_kaybi_df.copy()
        if "donem" in src.columns:
            src["donem"] = pd.to_datetime(src["donem"], errors="coerce")
            src["month"] = to_month(src["donem"])
        if "ust_bolum" in src.columns:
            src["ust_bolum"] = src["ust_bolum"].apply(normalize_ust_bolum)
        for col in ["tekil_kisi", "toplam_izin", "toplam_sgk_gun", "isgucu_kaybi"]:
            if col in src.columns:
                src[col] = numeric(src[col])
        src = src[src.get("ust_bolum", pd.Series(index=src.index)).isin(["Mağaza", "Merkez"])].copy()

        timeline = []
        month_cache = {str(month): group.copy() for month, group in src.groupby("month", dropna=True)} if "month" in src.columns else {}
        for month in months:
            sub = month_cache.get(str(month), src.iloc[0:0].copy())
            row = {"month": month}
            for loc in ["Mağaza", "Merkez"]:
                val = sub.loc[sub["ust_bolum"] == loc, "isgucu_kaybi"] if ("ust_bolum" in sub.columns and "isgucu_kaybi" in sub.columns) else pd.Series(dtype=float)
                row[loc] = float(val.iloc[0]) if not val.empty and pd.notna(val.iloc[0]) else None
            timeline.append(row)

        by_month: dict[str, dict] = {}
        for month in months:
            prev = prev_month(month)
            prev_year_month = add_month(month, -12)
            cur = month_cache.get(str(month), src.iloc[0:0].copy())
            prev_sub = month_cache.get(str(prev), src.iloc[0:0].copy())
            prev_year_sub = month_cache.get(str(prev_year_month), src.iloc[0:0].copy())
            rows = []
            for loc in ["Mağaza", "Merkez"]:
                cur_row = cur[cur["ust_bolum"] == loc].head(1)
                prev_row = prev_sub[prev_sub["ust_bolum"] == loc].head(1)
                prev_year_row = prev_year_sub[prev_year_sub["ust_bolum"] == loc].head(1)
                rows.append(
                    {
                        "ust_bolum": loc,
                        "isgucu_kaybi": float(cur_row["isgucu_kaybi"].iloc[0]) if not cur_row.empty and pd.notna(cur_row["isgucu_kaybi"].iloc[0]) else None,
                        "onceki_ay": float(prev_row["isgucu_kaybi"].iloc[0]) if not prev_row.empty and pd.notna(prev_row["isgucu_kaybi"].iloc[0]) else None,
                        "onceki_yil": float(prev_year_row["isgucu_kaybi"].iloc[0]) if not prev_year_row.empty and pd.notna(prev_year_row["isgucu_kaybi"].iloc[0]) else None,
                        "toplam_izin": float(cur_row["toplam_izin"].iloc[0]) if not cur_row.empty and "toplam_izin" in cur_row.columns and pd.notna(cur_row["toplam_izin"].iloc[0]) else None,
                        "toplam_sgk_gun": float(cur_row["toplam_sgk_gun"].iloc[0]) if not cur_row.empty and "toplam_sgk_gun" in cur_row.columns and pd.notna(cur_row["toplam_sgk_gun"].iloc[0]) else None,
                        "tekil_kisi": float(cur_row["tekil_kisi"].iloc[0]) if not cur_row.empty and "tekil_kisi" in cur_row.columns and pd.notna(cur_row["tekil_kisi"].iloc[0]) else None,
                    }
                )
            by_month[month] = {"prev_month": prev, "prev_year_month": prev_year_month, "rows": rows}
        return {"timeline": timeline, "by_month": by_month}

    pages["p025_isgucu_kaybi"] = timed_step(
        "p025_isgucu_kaybi",
        build_isgucu_kaybi_page,
    )

    def build_izin_yuku_page() -> dict:
        metric_defs = [
            {"key": "kisi_basina_gun", "label": "Kişi Başına Gün", "format": "number"},
            {"key": "kisi_basina_brut_tl", "label": "Kişi Başına Brüt TL", "format": "currency"},
            {"key": "ortalama_gun", "label": "Ortalama Gün", "format": "number"},
            {"key": "ortalama_bakiye", "label": "Ortalama Bakiye", "format": "currency"},
            {"key": "gun_toplam_payi", "label": "Gün Toplam Payı", "format": "percent"},
            {"key": "brut_tl_toplam_payi", "label": "Brüt TL Toplam Payı", "format": "percent"},
        ]
        if izin_yuku_df.empty:
            return {"metrics": metric_defs, "trend": [], "by_month": {m: {"rows": []} for m in months}}

        src = izin_yuku_df.copy()
        if "donem" in src.columns:
            src["donem"] = pd.to_datetime(src["donem"], errors="coerce")
            src["month"] = to_month(src["donem"])
        if "alan" in src.columns:
            src["alan"] = src["alan"].apply(lambda x: fix_text(x).strip() if isinstance(x, str) else x)
            src["alan_norm"] = src["alan"].apply(normalize_key)
        for col in ["kisi_sayisi", "toplam_gun", "toplam_brut_tl", "kisi_basina_gun", "kisi_basina_brut_tl", "ortalama_gun", "ortalama_bakiye"]:
            if col in src.columns:
                src[col] = numeric(src[col])

        kisi_denom = numeric(src["kisi_sayisi"]).replace(0, np.nan) if "kisi_sayisi" in src.columns else pd.Series(np.nan, index=src.index)
        toplam_gun = numeric(src["toplam_gun"]).fillna(0) if "toplam_gun" in src.columns else pd.Series(0.0, index=src.index)
        toplam_brut = numeric(src["toplam_brut_tl"]).fillna(0) if "toplam_brut_tl" in src.columns else pd.Series(0.0, index=src.index)
        src["kisi_basina_gun"] = toplam_gun / kisi_denom
        src["kisi_basina_brut_tl"] = toplam_brut / kisi_denom
        src["ortalama_gun"] = src["kisi_basina_gun"]
        if "ortalama_bakiye" in src.columns and src["ortalama_bakiye"].notna().any():
            src["ortalama_bakiye"] = numeric(src["ortalama_bakiye"])
        else:
            src["ortalama_bakiye"] = src["kisi_basina_brut_tl"]

        month_cache = {str(month): group.copy() for month, group in src.groupby("month", dropna=True)} if "month" in src.columns else {}
        trend = []
        for month in months:
            sub = month_cache.get(str(month), src.iloc[0:0].copy())
            detail_sub = sub[sub["alan_norm"] != "genel toplam"].copy() if "alan_norm" in sub.columns else sub.copy()
            calc_base = detail_sub if not detail_sub.empty else sub
            overall = calc_base.iloc[0:0].copy()
            if not calc_base.empty:
                total_people = numeric(calc_base["kisi_sayisi"]).sum() if "kisi_sayisi" in calc_base.columns else 0
                total_days = numeric(calc_base["toplam_gun"]).sum() if "toplam_gun" in calc_base.columns else 0
                total_gross = numeric(calc_base["toplam_brut_tl"]).sum() if "toplam_brut_tl" in calc_base.columns else 0
                avg_days = numeric(calc_base["ortalama_gun"]).dropna() if "ortalama_gun" in calc_base.columns else pd.Series(dtype=float)
                avg_balance = numeric(calc_base["ortalama_bakiye"]).dropna() if "ortalama_bakiye" in calc_base.columns else pd.Series(dtype=float)
                overall = pd.DataFrame([{
                    "kisi_basina_gun": float(total_days / total_people) if total_people > 0 else None,
                    "kisi_basina_brut_tl": float(total_gross / total_people) if total_people > 0 else None,
                    "ortalama_gun": float(avg_days.mean()) if not avg_days.empty else (float(total_days / total_people) if total_people > 0 else None),
                    "ortalama_bakiye": float(avg_balance.mean()) if not avg_balance.empty else (float(total_gross / total_people) if total_people > 0 else None),
                    "gun_toplam_payi": 1.0 if total_days > 0 else None,
                    "brut_tl_toplam_payi": 1.0 if total_gross > 0 else None,
                }])
            row = {"month": month}
            for metric in metric_defs:
                val = overall[metric["key"]].iloc[0] if not overall.empty and metric["key"] in overall.columns else None
                row[metric["key"]] = float(val) if val is not None and not pd.isna(val) else None
            trend.append(row)

        by_month: dict[str, dict] = {}
        for month in months:
            sub = month_cache.get(str(month), src.iloc[0:0].copy())
            rows = []
            if not sub.empty:
                if "alan_norm" not in sub.columns and "alan" in sub.columns:
                    sub = sub.copy()
                    sub["alan_norm"] = sub["alan"].apply(normalize_key)
                share_base = (
                    sub[
                        ~sub.get("alan_norm", pd.Series("", index=sub.index)).isin(
                            ["genel toplam", "yonetim kurulu", "perakende"]
                        )
                    ].copy()
                    if "alan_norm" in sub.columns
                    else sub.copy()
                )
                share_total_days = float(numeric(share_base["toplam_gun"]).fillna(0).sum()) if "toplam_gun" in share_base.columns else 0.0
                share_total_gross = float(numeric(share_base["toplam_brut_tl"]).fillna(0).sum()) if "toplam_brut_tl" in share_base.columns else 0.0
                for rec in sub.sort_values(["alan"], key=lambda s: s.map(normalize_key)).to_dict("records"):
                    kisi = float(rec.get("kisi_sayisi")) if pd.notna(rec.get("kisi_sayisi")) else None
                    toplam_g = float(rec.get("toplam_gun")) if pd.notna(rec.get("toplam_gun")) else None
                    toplam_b = float(rec.get("toplam_brut_tl")) if pd.notna(rec.get("toplam_brut_tl")) else None
                    kisi_gun = (toplam_g / kisi) if (kisi and kisi > 0 and toplam_g is not None) else (float(rec.get("kisi_basina_gun")) if pd.notna(rec.get("kisi_basina_gun")) else None)
                    kisi_brut = (toplam_b / kisi) if (kisi and kisi > 0 and toplam_b is not None) else (float(rec.get("kisi_basina_brut_tl")) if pd.notna(rec.get("kisi_basina_brut_tl")) else None)
                    rows.append(
                        {
                            "alan": rec.get("alan"),
                            "kisi_sayisi": kisi,
                            "toplam_gun": toplam_g,
                            "toplam_brut_tl": toplam_b,
                            "kisi_basina_gun": kisi_gun,
                            "kisi_basina_brut_tl": kisi_brut,
                            "ortalama_gun": kisi_gun if kisi_gun is not None else (float(rec.get("ortalama_gun")) if pd.notna(rec.get("ortalama_gun")) else None),
                            "ortalama_bakiye": float(rec.get("ortalama_bakiye")) if pd.notna(rec.get("ortalama_bakiye")) else kisi_brut,
                            "gun_toplam_payi": safe_div(toplam_g, share_total_days) if share_total_days and toplam_g is not None else None,
                            "brut_tl_toplam_payi": safe_div(toplam_b, share_total_gross) if share_total_gross and toplam_b is not None else None,
                        }
                    )
            by_month[month] = {"rows": rows}
        return {"metrics": metric_defs, "trend": trend, "by_month": by_month}

    pages["p026_izin_yuku"] = timed_step(
        "p026_izin_yuku",
        build_izin_yuku_page,
    )

    def build_yurtdisi_page():
        if yurtdisi_df.empty:
            return {
                "latest_month": None,
                "source_month_by_month": {},
                "by_month": {},
            }

        src = yurtdisi_df.copy()
        if "donem" in src.columns:
            src["donem"] = pd.to_datetime(src["donem"], errors="coerce")
            src["month"] = to_month(src["donem"])
        else:
            src["month"] = months[-1] if months else None

        for col in ["COUNTRY", "GENDER", "NATIONALITY"]:
            if col in src.columns:
                src[col] = src[col].apply(lambda x: fix_text(x).strip() if isinstance(x, str) else x)

        if "AGE" in src.columns:
            src["AGE"] = numeric(src["AGE"])
        if "SENIORITY_YEARS" in src.columns:
            src["SENIORITY_YEARS"] = numeric(src["SENIORITY_YEARS"])
        if "ACTUAL_COUNT" in src.columns:
            src["ACTUAL_COUNT"] = numeric(src["ACTUAL_COUNT"])

        if "COUNTRY" in src.columns:
            src["COUNTRY"] = src["COUNTRY"].astype("string").str.strip().str.upper()
        if "GENDER" in src.columns:
            src["GENDER"] = (
                src["GENDER"]
                .astype("string")
                .str.strip()
                .str.title()
            )

        # Boş budget/vacancy satırlarını gerçek çalışan analizinden çıkar.
        if "GENDER" in src.columns:
            src = src[src["GENDER"].isin(["Female", "Male"])].copy()
        if "NAME" in src.columns:
            src = src[src["NAME"].notna()].copy()

        available_months = (
            sorted(src["month"].dropna().astype(str).unique(), key=lambda m: pd.Period(m, freq="M"))
            if "month" in src.columns
            else []
        )
        latest_month = available_months[-1] if available_months else None
        if not latest_month:
            return {
                "latest_month": None,
                "source_month_by_month": {},
                "by_month": {},
            }

        def build_month_payload(df_curr: pd.DataFrame) -> dict:
            gender_chart_data: list[dict[str, object]] = []
            gender_table_data: list[dict[str, object]] = []
            if {"COUNTRY", "GENDER"}.issubset(df_curr.columns):
                g_dist = df_curr.groupby(["COUNTRY", "GENDER"]).size().unstack(fill_value=0)
                countries = [c for c in ["KUWAIT", "UAE"] if c in g_dist.index] + [
                    c for c in g_dist.index.tolist() if c not in {"KUWAIT", "UAE"}
                ]
                total_female = 0
                total_male = 0
                for country in countries:
                    female = int(g_dist.at[country, "Female"]) if "Female" in g_dist.columns else 0
                    male = int(g_dist.at[country, "Male"]) if "Male" in g_dist.columns else 0
                    total_female += female
                    total_male += male
                    row = {"country": country, "Female": female, "Male": male}
                    gender_chart_data.append(row)
                    gender_table_data.append(row.copy())
                gender_table_data.append({"country": "Total", "Female": total_female, "Male": total_male})

            averages: list[dict[str, object]] = []
            if "COUNTRY" in df_curr.columns:
                age_avg = df_curr.groupby("COUNTRY")["AGE"].mean() if "AGE" in df_curr.columns else pd.Series(dtype=float)
                sen_avg = (
                    df_curr.groupby("COUNTRY")["SENIORITY_YEARS"].mean()
                    if "SENIORITY_YEARS" in df_curr.columns
                    else pd.Series(dtype=float)
                )
                countries = [c for c in ["KUWAIT", "UAE"] if c in df_curr["COUNTRY"].dropna().unique()]
                countries += [c for c in df_curr["COUNTRY"].dropna().unique() if c not in {"KUWAIT", "UAE"}]
                for country in countries:
                    age_val = age_avg.get(country)
                    sen_val = sen_avg.get(country)
                    averages.append(
                        {
                            "country": country,
                            "age": float(round(age_val, 2)) if pd.notna(age_val) else None,
                            "seniority": float(round(sen_val, 2)) if pd.notna(sen_val) else None,
                        }
                    )

            nationality: list[dict[str, object]] = []
            if "NATIONALITY" in df_curr.columns:
                nat_counts = df_curr["NATIONALITY"].dropna().astype(str).str.strip()
                nat_counts = nat_counts[nat_counts != ""].value_counts()
                for nat, cnt in nat_counts.items():
                    nationality.append({"nationality": fix_text(str(nat)), "count": int(cnt)})

            return {
                "gender": gender_chart_data,
                "gender_table": gender_table_data,
                "averages": averages,
                "nationality": nationality,
            }

        month_payloads: dict[str, dict] = {}
        for month in available_months:
            sub = src[src["month"].astype(str) == str(month)].copy()
            month_payloads[str(month)] = build_month_payload(sub)

        source_month_by_month: dict[str, str | None] = {}
        available_periods = [pd.Period(m, freq="M") for m in available_months]
        for month in months:
            month_period = pd.Period(month, freq="M")
            valid = [str(period) for period in available_periods if period <= month_period]
            source_month_by_month[str(month)] = valid[-1] if valid else None

        return {
            "latest_month": latest_month,
            "source_month_by_month": source_month_by_month,
            "by_month": month_payloads,
        }

    pages["p034_yurtdisi"] = timed_step(
        "p034_yurtdisi",
        build_yurtdisi_page,
    )

    def _v2_source_month_map(available_months: list[str]) -> dict[str, str | None]:
        if not available_months:
            return {str(month): None for month in months}
        available_periods = [pd.Period(m, freq="M") for m in available_months]
        out: dict[str, str | None] = {}
        for month in months:
            month_period = pd.Period(month, freq="M")
            valid = [str(period) for period in available_periods if period <= month_period]
            out[str(month)] = valid[-1] if valid else None
        return out

    def _v2_monthly_frame(src: pd.DataFrame) -> pd.DataFrame:
        if src is None or src.empty or "donem" not in src.columns:
            return pd.DataFrame()
        work = src.copy()
        work["month"] = to_month(work["donem"])
        work = work[work["month"].notna()].copy()
        return work

    def build_v2_regrettable_turnover_page():
        src = _v2_monthly_frame(v2_regrettable_df)
        detail = _v2_monthly_frame(v2_regrettable_detail_df)
        if src.empty:
            return {"latest_month": None, "source_month_by_month": {}, "timeline": [], "by_month": {}}
        month_list = sorted(src["month"].dropna().astype(str).unique(), key=lambda m: pd.Period(m, freq="M"))
        latest_month = month_list[-1] if month_list else None
        by_month: dict[str, dict] = {}
        for month in month_list:
            sub = src[src["month"].astype(str) == month].copy()
            sub = sub.sort_values(["scope"], key=lambda s: s.map(lambda x: normalize_key(str(x))))
            det = detail[detail["month"].astype(str) == month].copy() if not detail.empty else pd.DataFrame()
            if not det.empty:
                sort_cols = [c for c in ["ust_bolum", "performans_percentile", "adi_soyadi"] if c in det.columns]
                det = det.sort_values(sort_cols, ascending=[True, False, True][:len(sort_cols)])
            by_month[month] = {
                "rows": sanitize(sub.to_dict("records")),
                "detail": sanitize(det.to_dict("records")),
            }
        return {
            "latest_month": latest_month,
            "source_month_by_month": _v2_source_month_map(month_list),
            "timeline": sanitize(src.sort_values(["month", "scope"]).to_dict("records")),
            "by_month": by_month,
            "notes": [
                "V2 paralel metriktir; mevcut turnover sayfalarının yerine geçmez.",
                "Kapsam: sadece Mağaza üst bölümündeki çalışanlar.",
                "Regrettable sinyal: Mağaza çalışanları içinde performans percentile değeri ilk %25 içinde olan çalışan çıkışı.",
            ],
        }

    pages["p038_regrettable_turnover_v2"] = timed_step(
        "p038_regrettable_turnover_v2",
        build_v2_regrettable_turnover_page,
    )

    def build_v2_burnout_page():
        src = _v2_monthly_frame(v2_burnout_df)
        if src.empty:
            return {"latest_month": None, "source_month_by_month": {}, "timeline": [], "by_month": {}}
        month_list = sorted(src["month"].dropna().astype(str).unique(), key=lambda m: pd.Period(m, freq="M"))
        latest_month = month_list[-1] if month_list else None
        by_month: dict[str, dict] = {}
        for month in month_list:
            sub = src[src["month"].astype(str) == month].copy()
            sub = sub.sort_values("operasyonel_yuk_skoru", ascending=False) if "operasyonel_yuk_skoru" in sub.columns else sub
            by_month[month] = {"rows": sanitize(sub.to_dict("records"))}
        return {
            "latest_month": latest_month,
            "source_month_by_month": _v2_source_month_map(month_list),
            "timeline": sanitize(src.sort_values(["month", "ust_bolum"]).to_dict("records")),
            "by_month": by_month,
            "notes": [
                "V2 operasyonel yük skoru klinik tükenmişlik tanısı değildir.",
                "Skor fazla mesai, izin yükü ve eksik SGK gün proxy bileşenlerinden percentile bazlı üretilir.",
            ],
        }

    pages["p039_operational_load_v2"] = timed_step(
        "p039_operational_load_v2",
        build_v2_burnout_page,
    )

    def build_v2_survival_page():
        curve = v2_survival_curve_df.copy() if isinstance(v2_survival_curve_df, pd.DataFrame) else pd.DataFrame()
        summary = v2_survival_summary_df.copy() if isinstance(v2_survival_summary_df, pd.DataFrame) else pd.DataFrame()
        base = v2_survival_base_df.copy() if isinstance(v2_survival_base_df, pd.DataFrame) else pd.DataFrame()
        for frame in [curve, summary, base]:
            if frame.empty:
                continue
            for col in frame.columns:
                if pd.api.types.is_object_dtype(frame[col]) or pd.api.types.is_string_dtype(frame[col]):
                    frame[col] = frame[col].apply(lambda x: fix_text(x).strip() if isinstance(x, str) else x)
        if not curve.empty and "tenure_month" in curve.columns:
            curve["tenure_month"] = numeric(curve["tenure_month"])
        if not curve.empty and "survival_probability" in curve.columns:
            curve["survival_probability"] = numeric(curve["survival_probability"])
        if not summary.empty:
            for col in summary.columns:
                if col != "scope":
                    summary[col] = numeric(summary[col]) if col in summary.columns else summary[col]
        base_count = int(len(base)) if not base.empty else 0
        return {
            "curve": sanitize(curve.to_dict("records")) if not curve.empty else [],
            "summary": sanitize(summary.to_dict("records")) if not summary.empty else [],
            "base_count": base_count,
            "notes": [
                "V2 Kaplan-Meier tipi elde kalma analizidir; CoxPH modeli değildir.",
                "CoxPH için aynı temel tablo Excel'deki V2_Survival_Base sheet'inde tutulur.",
            ],
        }

    pages["p040_survival_analysis_v2"] = timed_step(
        "p040_survival_analysis_v2",
        build_v2_survival_page,
    )

    log_step("Sayfa 19-41 tamamlandı")
    log_step("Sayfa 27-29 not alanları frontend tarafında istemci içi olarak hazırlanıyor")

    risk_factor_col_map = {
        "ml_risk_component": "Model riski",
        "performance_risk_component": "Son dönem performans düşüşü",
        "engagement_risk_component": "Düşük eğitim/bağlılık",
        "tenure_risk_component": "Kıdem risk dönemi",
        "dept_risk_component": "Departman etkisi",
        "momentum_risk_component": "Momentum bozulması",
        "demographic_risk_component": "Demografik hassasiyet",
    }

    def risk_month_for(month: str) -> str | None:
        if not risk_months:
            return None
        if month in risk_months:
            return month
        lower = [m for m in risk_months if m <= month]
        return lower[-1] if lower else risk_months[-1]

    def turnover_series_for_loc(loc: str, month: str, window: int = 12) -> tuple[list[str], list[float]]:
        month_hist = [m for m in months if m <= month][-window:]
        vals: list[float] = []
        used_months: list[str] = []
        for m in month_hist:
            sub = month_data(m)
            if loc != group_label:
                sub = sub[sub["ust_bolum_norm"] == loc]
            cikis = turnover_exit_sum(sub)
            hc = safe_sum(sub["calisan_sayisi"]) if "calisan_sayisi" in sub.columns else 0
            ratio = safe_div(cikis, hc)
            if ratio is None:
                continue
            used_months.append(m)
            vals.append(float(ratio))
        return used_months, vals

    def top_risk_factors(month: str, loc: str, top_n: int = 3) -> list[str]:
        source_month = risk_month_for(month)
        if source_month is None or risk_src_full.empty:
            return ["Eğitim katılımı düşüşü", "Performans dalgalanması", "Kıdem kırılma dönemi"]
        sub = risk_src_full[risk_src_full["month"] == source_month].copy()
        if loc != group_label and "ust_bolum_norm" in sub.columns:
            sub = sub[sub["ust_bolum_norm"] == loc]
        if sub.empty:
            return ["Eğitim katılımı düşüşü", "Performans dalgalanması", "Kıdem kırılma dönemi"]

        scores = []
        for col, label in risk_factor_col_map.items():
            if col in sub.columns:
                val = numeric(sub[col]).mean()
                if pd.notna(val):
                    scores.append((float(val), label))
        scores.sort(key=lambda x: x[0], reverse=True)
        return [x[1] for x in scores[:top_n]] if scores else ["Eğitim katılımı düşüşü", "Performans dalgalanması", "Kıdem kırılma dönemi"]

    log_step("V2 sonrası yardımcı risk fonksiyonları hazırlandı")

    return pages


def load_dashboard_sources(
    xlsx_path: Path,
    *,
    exclude_stajyer: bool = False,
    allow_external_fallback: bool = True,
) -> dict:
    started_at = time.perf_counter()
    xl = pd.ExcelFile(xlsx_path)
    log_step("Workbook açıldı, ana veri okunuyor...")

    needed_cols = [
        "donem",
        "sicil_no",
        "adi_soyadi",
        "ust_bolum",
        "departman",
        "departman_adi",
        "isletme_adi",
        "calisan_sayisi",
        "reel_ise_giris",
        "cikis",
        "reel_isten_cikis",
        "donem_basi",
        "donem_sonu",
        "kadro_adi",
        "cinsiyet",
        "beyaz_mavi_yaka",
        "terfi_durumu",
        "kusak_aralik",
        "yas",
        "kidem_yil",
        "yonetim_seviye",
        MAGAZA_KIRILIM_COL,
        "temiz_net_gelir",
        "toplam_yuzde",
        "toplam",
        "izleme_dk",
        "hgo",
        "satis_akademisi_katilim_sayisi",
        "sgk_gun",
        "ucret",
        "kasa_tazminati",
        "prim_toplam",
        "net_gelir",
        "fazla_mesai_toplam",
        "gorev",
        "unvan",
        "kısa_gorev",
        "kisa_gorev",
        "magaza_title",
        "kidem_gun",
        "dogum_tarihi",
        "ise_giris_tarihi",
        "son_giris_tarihi",
        "cikis_tarihi",
        "il",
    ]

    usecols = sheet_usecols(xl, "Sonuc", needed_cols) or []
    df = read_sheet(xl, "Sonuc", usecols=usecols if usecols else None)
    if df.empty:
        df = read_sheet(xl, "Sonuc")

    if df.empty:
        raise RuntimeError("Sonuc sheet'i bulunamadı veya boş.")

    log_step(f"Ana veri okundu: {len(df):,} satır")

    for col in ["donem", "dogum_tarihi", "ise_giris_tarihi", "son_giris_tarihi", "cikis_tarihi"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")

    if MAGAZA_KIRILIM_COL not in df.columns:
        for alt in ["magaza_kirilim", "magaza_kirlim"]:
            if alt in df.columns:
                df[MAGAZA_KIRILIM_COL] = df[alt]
                break

    df["month"] = to_month(df["donem"]) if "donem" in df.columns else None
    df["year"] = pd.to_datetime(df["donem"], errors="coerce").dt.year if "donem" in df.columns else None
    df["month_num"] = pd.to_datetime(df["donem"], errors="coerce").dt.month if "donem" in df.columns else None

    if exclude_stajyer and "unvan" in df.columns:
        mask = df["unvan"].astype(str).str.strip().str.lower().str.contains("stajyer", na=False)
        df = df[~mask].copy()

    if "ust_bolum" in df.columns:
        df["ust_bolum_norm"] = df["ust_bolum"].apply(normalize_ust_bolum)
    if "ust_bolum_norm" in df.columns:
        df["ust_bolum_key"] = df["ust_bolum_norm"].apply(normalize_key)
    if "cinsiyet" in df.columns:
        df["cinsiyet_norm"] = df["cinsiyet"].apply(normalize_gender)
    if "beyaz_mavi_yaka" in df.columns:
        df["yaka_norm"] = df["beyaz_mavi_yaka"].apply(normalize_collar)
    if "terfi_durumu" in df.columns:
        df["terfi_durumu"] = df["terfi_durumu"].apply(
            lambda x: fix_text(x).strip() if isinstance(x, str) else x
        )
    if "kadro_adi" in df.columns:
        df["kadro_norm"] = df["kadro_adi"].apply(normalize_contract)
    if MAGAZA_KIRILIM_COL in df.columns:
        df[MAGAZA_KIRILIM_COL] = df[MAGAZA_KIRILIM_COL].apply(
            lambda x: fix_text(x).strip() if isinstance(x, str) else x
        )
    if "departman_adi" in df.columns:
        df["departman_adi"] = df["departman_adi"].apply(
            lambda x: fix_text(x).strip() if isinstance(x, str) else x
        )
        df["departman_norm"] = df["departman_adi"].apply(normalize_key)
    if "isletme_adi" in df.columns:
        df["isletme_adi"] = df["isletme_adi"].apply(
            lambda x: fix_text(x).strip() if isinstance(x, str) else x
        )
    if "il" in df.columns:
        df["il"] = df["il"].apply(lambda x: fix_text(x).strip() if isinstance(x, str) else x)

    log_step("Yardımcı sheet'ler okunuyor...")
    turnover_cols = [
        "donem",
        "year",
        "month_num",
        "ust_bolum",
        "departman_adi",
        "isletme_adi",
        "turnover1",
        "cikis",
        "donem_basi",
        "donem_sonu",
        "ortalama1",
    ]
    turnover_ust = read_sheet(xl, "Turnover_ust_bolum", usecols=sheet_usecols(xl, "Turnover_ust_bolum", turnover_cols))
    turnover_genel = read_sheet(
        xl,
        "Turnover_genel",
        usecols=sheet_usecols(
            xl,
            "Turnover_genel",
            ["donem", "year", "month_num", "turnover1", "cikis", "donem_basi", "donem_sonu", "ortalama1"],
        ),
    )
    turnover_dept = read_sheet(xl, "Turnover_departman_adi", usecols=sheet_usecols(xl, "Turnover_departman_adi", turnover_cols))
    turnover_store = read_sheet(xl, "Turnover_isletme_adi", usecols=sheet_usecols(xl, "Turnover_isletme_adi", turnover_cols))
    cikis_sebepleri_df = read_sheet(xl, "cikis_sebepleri")
    tahmin_df = read_sheet(xl, "Sadece_Tahmin_Aylari")
    tahmin_backtest_ozet_df = read_sheet(xl, "Tahmin_Backtest_Ozet")
    tahmin_yillik_backtest_df = read_sheet(xl, "Tahmin_Yillik_Backtest")
    risk_usecols = sheet_usecols(
        xl,
        "Magaza_ML_risk",
        [
            "donem",
            "ust_bolum",
            "sicil_no",
            "sicil",
            "sicilno",
            "adi_soyadi",
            "ad_soyad",
            "kisi_adi",
            "departman_adi",
            "departman",
            "isletme_adi",
            "magaza_adi",
            "magaza",
            "risk_puani",
            "risk_score",
            "risk_seviyesi",
            "risk_level",
            "risk_olasilik",
            "risk_olasilik_calibrated",
            "risk_probability",
            "risk_aciklama",
            "ml_risk_component",
            "performance_risk_component",
            "engagement_risk_component",
            "tenure_risk_component",
            "dept_risk_component",
            "momentum_risk_component",
            "trend_risk_component",
            "demographic_risk_component",
        ],
    )
    risk_df = read_sheet(xl, "Magaza_ML_risk", usecols=risk_usecols)
    risk_region = read_sheet(xl, "riski_yuksek_bolgeler")
    risk_store = read_sheet(xl, "riski_yuksek_magazalar")
    satis_df = read_sheet(
        xl,
        "satis_akademisi_takip",
        usecols=sheet_usecols(
            xl,
            "satis_akademisi_takip",
            [
                "donem",
                "sicil",
                "bolum",
                "calisma_durumu",
                "egitim_donemi",
                "katilim_durumu",
                "uzman_yonetici",
                "terfi_durumu",
                "mezun",
            ],
        ),
    )
    satis_full_df = read_sheet(xl, "satis_akademisi_takip")
    fiili_df = read_sheet(
        xl,
        "fiili_list",
        usecols=sheet_usecols(
            xl,
            "fiili_list",
            [
                "P_NO",
                "AD_SOYAD",
                "ISLETME_AD",
                "CALISAN_GRUP",
                "BOLUM_ADI",
                "UST_BOLUM_ADI",
                "POZISYON_ADI",
                "UNVAN_ADI",
                "GOREV_ADI",
                "kadro_adı",
                "CINSIYET",
                "DOGUM_TARIHI",
                "YAS",
                "ILK_BASLAMA_TARIHI",
                "İŞYERİ_BAŞLAMA_TARİHİ",
                "KIDEM_YILI",
                "OGRENIM_DURUMU",
                "YAKA",
                "ENGEL_STATUSU",
                "LOKASYON",
                "EMAIL",
                "TELEFON",
                "IL",
                "SGK_BELGE_TUR",
            ],
        ),
    )
    katilmayan_df = read_sheet(xl, "katilmayanlar_listesi")
    uzun_df = read_sheet(xl, "uzun_sure_egitim_yok")
    isgucu_kaybi_df = read_sheet(xl, "isgucu_kaybi_ozet")
    izin_yuku_df = read_sheet(xl, "izin_yuku_ozet")
    magaza_hedef_ciro_df = read_sheet(xl, "Magaza_hedef_ciro")
    gelisim_yolculuk_df = read_sheet(xl, "gelisim_yolculuk")
    if gelisim_yolculuk_df.empty and allow_external_fallback:
        gelisim_yolculuk_df = read_external_first_sheet(BASE_DIR / "gelisim_yolculuk.xlsx")
        if not gelisim_yolculuk_df.empty:
            log_step("gelisim_yolculuk dış dosyadan okundu.")
    performans_magaza_df = read_sheet(xl, "performans_magaza_verileri")
    if performans_magaza_df.empty and allow_external_fallback:
        performans_magaza_df = read_external_first_sheet(BASE_DIR / "performans_magaza_verileri.xlsx")
        if not performans_magaza_df.empty:
            log_step("performans_magaza_verileri dış dosyadan okundu.")
    cezalar_df = read_sheet(xl, "cezalar")
    if cezalar_df.empty and allow_external_fallback:
        cezalar_df = read_external_first_sheet(BASE_DIR / "cezalar.xlsx")
        if not cezalar_df.empty:
            log_step("cezalar dış dosyadan okundu.")
    norm_fiili_kadro_df = read_sheet(xl, "norm_fiili_kadro")
    if norm_fiili_kadro_df.empty and allow_external_fallback:
        norm_fiili_kadro_df = read_external_first_sheet(BASE_DIR / "norm_fiili_kadro.xlsx")
        if not norm_fiili_kadro_df.empty:
            log_step("norm_fiili_kadro dış dosyadan okundu.")
    dogum_listesi_df = read_sheet(xl, "dogum_listesi")
    if dogum_listesi_df.empty and allow_external_fallback:
        dogum_listesi_df = read_external_first_sheet(BASE_DIR / "dogum_listesi.xlsx")
        if not dogum_listesi_df.empty:
            log_step("dogum_listesi dış dosyadan okundu.")
    ise_alma_suresi_df = read_sheet(xl, "ise_alma_suresi")
    if ise_alma_suresi_df.empty and allow_external_fallback:
        ise_alma_suresi_df = read_external_first_sheet(BASE_DIR / "ise_alma_suresi.xlsx")
        if not ise_alma_suresi_df.empty:
            log_step("ise_alma_suresi dış dosyadan okundu.")
    ayrilanlar_df = read_sheet(xl, "Ayrılanlar_Listesi")
    v2_regrettable_df = read_sheet(xl, "V2_Regrettable_Turnover")
    v2_regrettable_detail_df = read_sheet(xl, "V2_Regrettable_Detail")
    v2_burnout_df = read_sheet(xl, "V2_Burnout_Index")
    v2_survival_curve_df = read_sheet(xl, "V2_Survival_Curve")
    v2_survival_summary_df = read_sheet(xl, "V2_Survival_Summary")
    v2_survival_base_df = read_sheet(xl, "V2_Survival_Base")
    enocta_ozet_df = read_sheet(
        xl,
        "enocta_donem_sicil_ozet",
        usecols=sheet_usecols(
            xl,
            "enocta_donem_sicil_ozet",
            [
                "donem",
                "sicil",
                "sicil_no",
                "kullanıcı_sicil",
                "izleme_dk",
                "egitim_sayisi",
                "ust_bolum",
                "kullanıcı_adi",
                "kisi_adi",
                "adi",
                "kullanıcı_soyadi",
                "soyadi",
            ],
        ),
    )
    enocta_raw_df = read_sheet(
        xl,
        "enocta_tum_veri",
        usecols=sheet_usecols(
            xl,
            "enocta_tum_veri",
            [
                "donem",
                "sicil",
                "sicil_no",
                "kullanıcı_sicil",
                "izleme_dk",
                "net_deneyim_suresi_dk",
                "toplam_deneyim_suresi_dk",
                "etkinlik_adi",
                "ust_bolum",
                "lokasyon",
                "bayi_adi",
                "kullanıcı_adi",
                "kisi_adi",
                "kullanıcı_soyadi",
                "soyadi",
            ],
        ),
    )
    yurtdisi_df = read_sheet(xl, "yurtdisi_veri_icmal")
    contact_phone_map = load_contact_phone_map(BASE_DIR)
    person_name_map = load_person_name_map(xl)

    for table in [turnover_ust, turnover_genel, turnover_dept, turnover_store]:
        if not table.empty and "donem" in table.columns:
            table["month"] = to_month(table["donem"])
            table["year"] = pd.to_datetime(table["donem"], errors="coerce").dt.year
            table["month_num"] = pd.to_datetime(table["donem"], errors="coerce").dt.month
        if "ust_bolum" in table.columns:
            table["ust_bolum_norm"] = table["ust_bolum"].apply(normalize_ust_bolum)
            table["ust_bolum_key"] = table["ust_bolum_norm"].apply(normalize_key)
        if "departman_adi" in table.columns:
            table["departman_adi"] = table["departman_adi"].apply(
                lambda x: fix_text(x).strip() if isinstance(x, str) else x
            )
        if "isletme_adi" in table.columns:
            table["isletme_adi"] = table["isletme_adi"].apply(
                lambda x: fix_text(x).strip() if isinstance(x, str) else x
            )

    if not cikis_sebepleri_df.empty:
        cikis_sebepleri_df = cikis_sebepleri_df.copy()
        donem_col = find_first_col(cikis_sebepleri_df, ["Dönem", "Donem", "donem"])
        if donem_col:
            cikis_sebepleri_df[donem_col] = pd.to_datetime(cikis_sebepleri_df[donem_col], errors="coerce")
            cikis_sebepleri_df["month"] = to_month(cikis_sebepleri_df[donem_col])
        for col in cikis_sebepleri_df.columns:
            if pd.api.types.is_object_dtype(cikis_sebepleri_df[col]):
                cikis_sebepleri_df[col] = cikis_sebepleri_df[col].apply(
                    lambda x: str(fix_text(x)).replace("\xa0", " ").strip() if isinstance(x, str) else x
                )
        log_step(f"Çıkış sebepleri okundu: {len(cikis_sebepleri_df):,} satır")
    else:
        log_step("cikis_sebepleri sheet'i bulunamadı veya boş.")

    if not satis_df.empty:
        if "donem" in satis_df.columns:
            satis_df["month"] = to_month(pd.to_datetime(satis_df["donem"], errors="coerce"))
        if "sicil" in satis_df.columns:
            satis_df["sicil_num"] = numeric(satis_df["sicil"]).astype("Int64")
        if "bolum" in satis_df.columns:
            satis_df["bolum"] = satis_df["bolum"].apply(fix_text)
            satis_df["bolum_norm"] = satis_df["bolum"].apply(normalize_key)
            satis_df["bolum_group"] = satis_df["bolum_norm"].apply(
                lambda x: "magaza" if "magaza" in x else ("bayi" if "bayi" in x else "")
            )
        if "calisma_durumu" in satis_df.columns:
            satis_df["calisma_durumu"] = satis_df["calisma_durumu"].apply(fix_text)
            satis_df["calisma_norm"] = satis_df["calisma_durumu"].apply(normalize_key)
            satis_df["calisma_group"] = satis_df["calisma_norm"].apply(
                lambda x: "cikis" if ("cikis" in x or "ayril" in x) else ("calisiyor" if ("calis" in x or "aktif" in x) else "")
            )
        if "egitim_donemi" in satis_df.columns:
            satis_df["egitim_donemi"] = satis_df["egitim_donemi"].apply(fix_text)
            satis_df["egitim_donemi_norm"] = satis_df["egitim_donemi"].apply(normalize_key)
        if "katilim_durumu" in satis_df.columns:
            satis_df["katilim_durumu"] = satis_df["katilim_durumu"].apply(fix_text)
            satis_df["katilim_durumu_norm"] = satis_df["katilim_durumu"].apply(normalize_key)
        if "uzman_yonetici" in satis_df.columns:
            satis_df["uzman_yonetici"] = satis_df["uzman_yonetici"].apply(fix_text)
            satis_df["uzman_yonetici_norm"] = satis_df["uzman_yonetici"].apply(normalize_key)
        if "terfi_durumu" in satis_df.columns:
            satis_df["terfi_durumu"] = satis_df["terfi_durumu"].apply(
                lambda x: fix_text(x).strip() if isinstance(x, str) else x
            )

    if not satis_full_df.empty:
        if "donem" in satis_full_df.columns:
            satis_full_df["month"] = to_month(pd.to_datetime(satis_full_df["donem"], errors="coerce"))
        for txt_col in satis_full_df.columns:
            if pd.api.types.is_object_dtype(satis_full_df[txt_col]) or pd.api.types.is_string_dtype(satis_full_df[txt_col]):
                satis_full_df[txt_col] = satis_full_df[txt_col].apply(
                    lambda x: fix_text(x).strip() if isinstance(x, str) else x
                )

    if not fiili_df.empty:
        for txt_col in [
            "AD_SOYAD",
            "ISLETME_AD",
            "CALISAN_GRUP",
            "BOLUM_ADI",
            "UST_BOLUM_ADI",
            "POZISYON_ADI",
            "UNVAN_ADI",
            "GOREV_ADI",
            "kadro_adı",
            "CINSIYET",
            "OGRENIM_DURUMU",
            "YAKA",
            "ENGEL_STATUSU",
            "LOKASYON",
            "EMAIL",
            "IL",
            "SGK_BELGE_TUR",
        ]:
            if txt_col in fiili_df.columns:
                fiili_df[txt_col] = fiili_df[txt_col].apply(
                    lambda x: fix_text(x).strip() if isinstance(x, str) else x
                )

    if not cezalar_df.empty:
        cezalar_df = cezalar_df.copy()
        sicil_col = find_first_col(cezalar_df, ["PERNO", "perno", "sicil", "sicil_no"])
        code_col = find_first_col(cezalar_df, ["OCKOD", "ockod", "ceza_kodu"])
        date_col = find_first_col(cezalar_df, ["TARIH", "Tarih", "tarih", "ceza_tarihi"])
        desc_col = find_first_col(cezalar_df, ["ACIKLAMA", "Açıklama", "aciklama", "açıklama"])
        if sicil_col:
            cezalar_df["sicil_key"] = cezalar_df[sicil_col].apply(normalize_sicil_key)
        if code_col:
            cezalar_df["ceza_kodu"] = cezalar_df[code_col].astype(str).str.strip().str.upper()
            cezalar_df["ceza_adi"] = cezalar_df["ceza_kodu"].map(DISCIPLINE_CODE_MAP).fillna("Diğer")
        if date_col:
            cezalar_df["ceza_tarihi"] = pd.to_datetime(cezalar_df[date_col], errors="coerce")
            cezalar_df["month"] = to_month(cezalar_df["ceza_tarihi"])
        if desc_col:
            cezalar_df["ceza_aciklama"] = cezalar_df[desc_col].apply(
                lambda x: fix_text(x).strip() if isinstance(x, str) else x
            )
        for col in cezalar_df.columns:
            if pd.api.types.is_object_dtype(cezalar_df[col]) or pd.api.types.is_string_dtype(cezalar_df[col]):
                cezalar_df[col] = cezalar_df[col].apply(lambda x: fix_text(x).strip() if isinstance(x, str) else x)
        if "sicil_key" in cezalar_df.columns:
            cezalar_df = cezalar_df[cezalar_df["sicil_key"].notna()].copy()

    need_terfi_backfill = ("terfi_durumu" not in df.columns) or (
        "terfi_durumu" in df.columns and df["terfi_durumu"].isna().all()
    )
    if need_terfi_backfill and not satis_df.empty:
        if {"month", "sicil_num", "terfi_durumu"}.issubset(satis_df.columns) and {"month", "sicil_no"}.issubset(df.columns):
            terfi_lookup = (
                satis_df[["month", "sicil_num", "terfi_durumu"]]
                .dropna(subset=["month", "sicil_num"])
                .drop_duplicates(subset=["month", "sicil_num"], keep="first")
            )
            if not terfi_lookup.empty:
                terfi_lookup = terfi_lookup.rename(columns={"terfi_durumu": "terfi_durumu_lookup"})
                df = df.copy()
                df["sicil_no_num"] = numeric(df["sicil_no"]).astype("Int64")
                df = df.merge(
                    terfi_lookup,
                    left_on=["month", "sicil_no_num"],
                    right_on=["month", "sicil_num"],
                    how="left",
                )
                if "sicil_num" in df.columns:
                    df = df.drop(columns=["sicil_num"])
                if "terfi_durumu" in df.columns:
                    df["terfi_durumu"] = df["terfi_durumu"].combine_first(df["terfi_durumu_lookup"])
                else:
                    df["terfi_durumu"] = df["terfi_durumu_lookup"]
                if "terfi_durumu_lookup" in df.columns:
                    df = df.drop(columns=["terfi_durumu_lookup"])

    if not risk_df.empty:
        if "donem" in risk_df.columns:
            risk_df["donem"] = pd.to_datetime(risk_df["donem"], errors="coerce")
        if "risk_puani" in risk_df.columns:
            risk_df["risk_puani"] = numeric(risk_df["risk_puani"])
        if "risk_olasilik" in risk_df.columns:
            risk_df["risk_olasilik"] = numeric(risk_df["risk_olasilik"])

    for enocta_df in [enocta_raw_df, enocta_ozet_df]:
        if enocta_df.empty:
            continue
        if "donem" in enocta_df.columns:
            enocta_df["donem"] = pd.to_datetime(enocta_df["donem"], errors="coerce")
        for txt_col in ["ust_bolum", "isletme_adi", "bolum_adi", "lokasyon", "bayi_adi", "etkinlik_adi", "kullanıcı_adi", "kullanıcı_soyadi"]:
            if txt_col in enocta_df.columns:
                enocta_df[txt_col] = enocta_df[txt_col].apply(
                    lambda x: fix_text(x).strip() if isinstance(x, str) else x
                )

    for extra_df in [
        gelisim_yolculuk_df,
        performans_magaza_df,
        v2_regrettable_df,
        v2_regrettable_detail_df,
        v2_burnout_df,
        v2_survival_curve_df,
        v2_survival_summary_df,
        v2_survival_base_df,
        norm_fiili_kadro_df,
        magaza_hedef_ciro_df,
        dogum_listesi_df,
        ise_alma_suresi_df,
        ayrilanlar_df,
    ]:
        if extra_df.empty:
            continue
        for col in extra_df.columns:
            if pd.api.types.is_object_dtype(extra_df[col]) or pd.api.types.is_string_dtype(extra_df[col]):
                extra_df[col] = extra_df[col].apply(lambda x: fix_text(x).strip() if isinstance(x, str) else x)

    log_step(f"Kaynak veriler hazırlandı ({time.perf_counter() - started_at:.1f} sn)")
    return {
        "exclude_stajyer": exclude_stajyer,
        "df": df,
        "turnover_ust": turnover_ust,
        "turnover_genel": turnover_genel,
        "turnover_dept": turnover_dept,
        "turnover_store": turnover_store,
        "cikis_sebepleri_df": cikis_sebepleri_df,
        "tahmin_df": tahmin_df,
        "tahmin_backtest_ozet_df": tahmin_backtest_ozet_df,
        "tahmin_yillik_backtest_df": tahmin_yillik_backtest_df,
        "risk_df": risk_df,
        "risk_region": risk_region,
        "risk_store": risk_store,
        "satis_df": satis_df,
        "satis_full_df": satis_full_df,
        "fiili_df": fiili_df,
        "katilmayan_df": katilmayan_df,
        "uzun_df": uzun_df,
        "enocta_raw_df": enocta_raw_df,
        "enocta_ozet_df": enocta_ozet_df,
        "isgucu_kaybi_df": isgucu_kaybi_df,
        "izin_yuku_df": izin_yuku_df,
        "yurtdisi_df": yurtdisi_df,
        "gelisim_yolculuk_df": gelisim_yolculuk_df,
        "performans_magaza_df": performans_magaza_df,
        "magaza_hedef_ciro_df": magaza_hedef_ciro_df,
        "cezalar_df": cezalar_df,
        "norm_fiili_kadro_df": norm_fiili_kadro_df,
        "dogum_listesi_df": dogum_listesi_df,
        "ise_alma_suresi_df": ise_alma_suresi_df,
        "ayrilanlar_df": ayrilanlar_df,
        "v2_regrettable_df": v2_regrettable_df,
        "v2_regrettable_detail_df": v2_regrettable_detail_df,
        "v2_burnout_df": v2_burnout_df,
        "v2_survival_curve_df": v2_survival_curve_df,
        "v2_survival_summary_df": v2_survival_summary_df,
        "v2_survival_base_df": v2_survival_base_df,
        "contact_phone_map": contact_phone_map,
        "person_name_map": person_name_map,
    }


def clone_dashboard_frame(df: pd.DataFrame, min_month: str | None = None) -> pd.DataFrame:
    if df is None:
        return pd.DataFrame()
    if min_month:
        return filter_df_from_month(df, min_month)
    return df.copy()


def build_dashboard_data_from_sources(
    sources: dict,
    *,
    min_month: str | None = None,
) -> dict:
    started_at = time.perf_counter()
    df_all = clone_dashboard_frame(sources.get("df"), None)
    df = clone_dashboard_frame(sources.get("df"), min_month)
    turnover_ust = clone_dashboard_frame(sources.get("turnover_ust"), min_month)
    turnover_genel = clone_dashboard_frame(sources.get("turnover_genel"), min_month)
    turnover_dept = clone_dashboard_frame(sources.get("turnover_dept"), min_month)
    turnover_store = clone_dashboard_frame(sources.get("turnover_store"), min_month)
    promotion_turnover_store_all = clone_dashboard_frame(sources.get("turnover_store"), None)
    cikis_sebepleri_df = clone_dashboard_frame(sources.get("cikis_sebepleri_df"), min_month)
    tahmin_df = clone_dashboard_frame(sources.get("tahmin_df"), min_month)
    tahmin_backtest_ozet_df = clone_dashboard_frame(sources.get("tahmin_backtest_ozet_df"), min_month)
    tahmin_yillik_backtest_df = clone_dashboard_frame(sources.get("tahmin_yillik_backtest_df"), None)
    risk_df = clone_dashboard_frame(sources.get("risk_df"), min_month)
    risk_region = clone_dashboard_frame(sources.get("risk_region"), min_month)
    risk_store = clone_dashboard_frame(sources.get("risk_store"), min_month)
    satis_df = clone_dashboard_frame(sources.get("satis_df"), min_month)
    satis_full_df = clone_dashboard_frame(sources.get("satis_full_df"), None)
    fiili_df = clone_dashboard_frame(sources.get("fiili_df"), None)
    katilmayan_df = clone_dashboard_frame(sources.get("katilmayan_df"), min_month)
    uzun_df = clone_dashboard_frame(sources.get("uzun_df"), min_month)
    enocta_raw_df = clone_dashboard_frame(sources.get("enocta_raw_df"), min_month)
    enocta_ozet_df = clone_dashboard_frame(sources.get("enocta_ozet_df"), min_month)
    isgucu_kaybi_df = clone_dashboard_frame(sources.get("isgucu_kaybi_df"), min_month)
    izin_yuku_df = clone_dashboard_frame(sources.get("izin_yuku_df"), min_month)
    yurtdisi_df = clone_dashboard_frame(sources.get("yurtdisi_df"), min_month)
    gelisim_yolculuk_df = clone_dashboard_frame(sources.get("gelisim_yolculuk_df"), None)
    performans_magaza_df = clone_dashboard_frame(sources.get("performans_magaza_df"), None)
    # Promotion-impact windows may need pre-2024 target/HGO history even in the 2024+ dashboard.
    magaza_hedef_ciro_df = clone_dashboard_frame(sources.get("magaza_hedef_ciro_df"), None)
    norm_fiili_kadro_df = clone_dashboard_frame(sources.get("norm_fiili_kadro_df"), None)
    cezalar_df = clone_dashboard_frame(sources.get("cezalar_df"), None)
    ise_alma_suresi_df = clone_dashboard_frame(sources.get("ise_alma_suresi_df"), min_month)
    v2_regrettable_df = clone_dashboard_frame(sources.get("v2_regrettable_df"), min_month)
    v2_regrettable_detail_df = clone_dashboard_frame(sources.get("v2_regrettable_detail_df"), min_month)
    v2_burnout_df = clone_dashboard_frame(sources.get("v2_burnout_df"), min_month)
    v2_survival_curve_df = clone_dashboard_frame(sources.get("v2_survival_curve_df"), None)
    v2_survival_summary_df = clone_dashboard_frame(sources.get("v2_survival_summary_df"), None)
    v2_survival_base_df = clone_dashboard_frame(sources.get("v2_survival_base_df"), None)

    months_sorted = sorted(df["month"].dropna().unique(), key=lambda m: pd.Period(m, freq="M"))
    meta = {
        "report_title": "İK Takip E-Board",
        "available_months": months_sorted,
        "available_years": sorted(df["year"].dropna().unique()),
        "default_month": months_sorted[-1] if months_sorted else None,
        # Static build metadata follows the latest dataset snapshot so identical inputs
        # always produce identical tracked HTML across machines and calendar time.
        "generated_at": (f"{months_sorted[-1]}-01T00:00:00Z" if months_sorted else "1970-01-01T00:00:00Z"),
        "notes": ([f"Veri kapsamı {min_month} ve sonrası."] if min_month else []),
    }

    log_step("Sayfa datasetleri oluşturuluyor...")
    pages = build_pages(
        df=df,
        turnover_ust=turnover_ust,
        turnover_genel=turnover_genel,
        turnover_dept=turnover_dept,
        turnover_store=turnover_store,
        cikis_sebepleri_df=cikis_sebepleri_df,
        tahmin_df=tahmin_df,
        tahmin_backtest_ozet_df=tahmin_backtest_ozet_df,
        tahmin_yillik_backtest_df=tahmin_yillik_backtest_df,
        risk_df=risk_df,
        risk_region=risk_region,
        risk_store=risk_store,
        satis_df=satis_df,
        satis_full_df=satis_full_df,
        fiili_df=fiili_df,
        katilmayan_df=katilmayan_df,
        uzun_df=uzun_df,
        enocta_raw_df=enocta_raw_df,
        enocta_ozet_df=enocta_ozet_df,
        isgucu_kaybi_df=isgucu_kaybi_df,
        izin_yuku_df=izin_yuku_df,
        yurtdisi_df=yurtdisi_df,
        gelisim_yolculuk_df=gelisim_yolculuk_df,
        performans_magaza_df=performans_magaza_df,
        magaza_hedef_ciro_df=magaza_hedef_ciro_df,
        norm_fiili_kadro_df=norm_fiili_kadro_df,
        cezalar_df=cezalar_df,
        ise_alma_suresi_df=ise_alma_suresi_df,
        v2_regrettable_df=v2_regrettable_df,
        v2_regrettable_detail_df=v2_regrettable_detail_df,
        v2_burnout_df=v2_burnout_df,
        v2_survival_curve_df=v2_survival_curve_df,
        v2_survival_summary_df=v2_survival_summary_df,
        v2_survival_base_df=v2_survival_base_df,
        contact_phone_map=sources.get("contact_phone_map", {}),
        person_name_map=sources.get("person_name_map", {}),
        promotion_history_df=df_all,
        promotion_turnover_store_df=promotion_turnover_store_all,
    )

    payload = normalize_text_payload({"meta": meta, "pages": pages})
    log_step(f"Dashboard verisi hazırlandı ({time.perf_counter() - started_at:.1f} sn)")
    return payload


def build_dashboard_data(
    xlsx_path: Path,
    *,
    exclude_stajyer: bool = False,
    min_month: str | None = None,
) -> dict:
    sources = load_dashboard_sources(xlsx_path, exclude_stajyer=exclude_stajyer)
    return build_dashboard_data_from_sources(sources, min_month=min_month)


def validate_dashboard_data(data: dict) -> list[str]:
    warnings: list[str] = []
    meta = data.get("meta", {}) if isinstance(data, dict) else {}
    pages = data.get("pages", {}) if isinstance(data, dict) else {}
    def _as_float(val: object) -> float | None:
        try:
            num = float(val)
        except Exception:
            return None
        return num if math.isfinite(num) else None
    if not meta.get("available_months"):
        warnings.append("UYARI: Hiç ay verisi bulunamadı.")
    for page_key in [
        "p001_matrix",
        "p013_turnover_trends",
        "p025_isgucu_kaybi",
        "p026_izin_yuku",
        "p031_cikis_sebepleri",
        "p033_promotion_movements",
        "p034_yurtdisi",
        "p036_academy_development_journey",
        "p037_org_dev_employee_tracking",
        "p041_org_dev_employee_master",
    ]:
        if page_key not in pages:
            warnings.append(f"UYARI: {page_key} sayfası oluşturulamadı.")

    latest_month = None
    try:
        latest_month = list(meta.get("available_months", []))[-1]
    except Exception:
        latest_month = None

    suspicious_patterns = {
        "tm": r"(?<=\")tm(?=\")",
        "st blm": r"(?<![a-z\u00e7\u011f\u0131\u00f6\u015f\u00fc])st\s+blm(?![a-z\u00e7\u011f\u0131\u00f6\u015f\u00fc])",
        "cret": r"(?<![a-z\u00e7\u011f\u0131\u00f6\u015f\u00fc])cret(?![a-z\u00e7\u011f\u0131\u00f6\u015f\u00fc])",
        "kmlatif": r"(?<![a-z\u00e7\u011f\u0131\u00f6\u015f\u00fc])kmlatif(?![a-z\u00e7\u011f\u0131\u00f6\u015f\u00fc])",
        "ynetim seviyesi": r"ynetim\s+seviyesi",
        "gnden az": r"gnden\s+az",
        "yneticiden": "yneticiden",
        "title sein": r"title\s+sein",
        "gun secin": r"gun\s+secin",
        "blge 4": r"blge\s+4",
        "blge 5": r"blge\s+5",
    }
    try:
        payload_text = json.dumps(pages, ensure_ascii=False).lower()
        found_tokens = [label for label, pattern in suspicious_patterns.items() if re.search(pattern, payload_text)]
        if found_tokens:
            warnings.append("UYARI: Dashboard verisinde şüpheli Türkçe bozulmaları kaldı: " + ", ".join(found_tokens))
    except Exception:
        pass

    if latest_month:
        p009 = (((pages.get("p009_store_income_components") or {}).get("by_month") or {}).get(latest_month) or {})
        items = list(p009.get("items") or [])
        if items:
            positive_totals = [
                item for item in items
                if (_as_float(item.get("amounts", {}).get("total")) or 0) > 0
            ]
            positive_wages = [
                item for item in positive_totals
                if (_as_float(item.get("amounts", {}).get("ucret")) or 0) > 0
            ]
            if positive_totals and not positive_wages:
                warnings.append(
                    f"UYARI: {latest_month} için Tahmini Gelir sayfasında ücret hakedişi tüm satırlarda sıfır görünüyor."
                )

        p024 = (((pages.get("p024_compensation") or {}).get("by_month") or {}).get(latest_month) or {})
        if p024:
            region_rows = list(p024.get("regions") or [])
            store_rows = list(p024.get("stores") or [])
            if not region_rows:
                warnings.append(f"UYARI: {latest_month} için Tahmini Gelir sayfasında bölge verisi oluşmadı.")
            if not store_rows:
                warnings.append(f"UYARI: {latest_month} için Tahmini Gelir sayfasında mağaza verisi oluşmadı.")

        p025 = pages.get("p025_isgucu_kaybi") or {}
        timeline = list(p025.get("timeline") or [])
        if timeline:
            last_timeline = timeline[-1]
            keys = {str(k) for k in last_timeline.keys()}
            if "Mağaza" not in keys or "Merkez" not in keys:
                warnings.append("UYARI: İşgücü Kaybı timeline anahtarları beklenen kırılımı taşımıyor.")
    return warnings


def json_for_html_script(value: object) -> str:
    raw_json = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return (
        raw_json.replace("&", "\\u0026")
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("\u2028", "\\u2028")
        .replace("\u2029", "\\u2029")
    )


def inject_data_into_html(template_path: Path, output_path: Path, data: dict) -> None:
    html = template_path.read_text(encoding="utf-8")
    html = clean_html_mojibake(html)
    clean_data = sanitize(data)
    meta_payload = json_for_html_script(clean_data.get("meta", {}))

    page_blocks: list[str] = []
    for page_key, page_data in clean_data.get("pages", {}).items():
        page_payload = json_for_html_script(page_data)
        page_blocks.append(f'<script id="dash-page-{page_key}" type="application/json">{page_payload}</script>')

    html = html.replace("/*__DASH_META__*/", meta_payload)
    html = html.replace("<!--__DASH_PAGE_DATA__-->", "\n".join(page_blocks))
    atomic_write_text(output_path, html, encoding="utf-8")




def generate_dashboard_outputs(
    xlsx_path: Path = DEFAULT_XLSX,
    template_path: Path = TEMPLATE_HTML,
    output_path: Path = OUTPUT_HTML,
    *,
    output_2024: Path | None = None,
    exclude_stajyer: bool = False,
) -> tuple[Path, Path]:
    """Build both E-Board dashboard files from one already prepared Excel file.

    This is the in-process production API used by ``run_full_pipeline.py``.
    Keeping the calculation path here means the CLI, the EXE and a direct Python
    invocation always use exactly the same dashboard logic.
    """
    ensure_utf8_stdout()
    xlsx_path = Path(xlsx_path)
    template_path = Path(template_path)
    output_path = Path(output_path)

    try:
        PROGRESS_LOG.write_text("", encoding="utf-8-sig")
    except OSError:
        pass

    if not xlsx_path.exists():
        raise FileNotFoundError(f"Excel bulunamadı: {xlsx_path}")
    if not template_path.exists():
        raise FileNotFoundError(f"Şablon HTML bulunamadı: {template_path}")

    log_step(f"Excel okunuyor ve dashboard verisi hesaplanıyor: {xlsx_path}")
    sources = load_dashboard_sources(xlsx_path, exclude_stajyer=exclude_stajyer)
    data = build_dashboard_data_from_sources(sources)
    for warning in validate_dashboard_data(data):
        log_step(warning)

    log_step(f"HTML şablonuna veri gömülüyor: {template_path}")
    inject_data_into_html(template_path, output_path, data)
    log_step(f"HTML üretildi: {output_path}")

    output_2024 = Path(output_2024) if output_2024 else output_path.with_name(
        f"{output_path.stem}_2024_gunumuz{output_path.suffix}"
    )
    log_step("2024 ve sonrası dashboard verisi hazırlanıyor...")
    data_2024 = build_dashboard_data_from_sources(sources, min_month="2024-01")
    for warning in validate_dashboard_data(data_2024):
        log_step(warning)
    inject_data_into_html(template_path, output_2024, data_2024)
    log_step(f"2024+ HTML üretildi: {output_2024}")
    return output_path, output_2024


def main() -> None:
    ensure_utf8_stdout()
    try:
        PROGRESS_LOG.write_text("", encoding="utf-8-sig")
    except Exception:
        pass
    parser = argparse.ArgumentParser(description="İK dashboard verisini hazırlar ve HTML üretir.")
    parser.add_argument("--xlsx", default=str(DEFAULT_XLSX), help="Kaynak Excel dosyası (icmal_sorgu_sonuc.xlsx)")
    parser.add_argument("--template", default=str(TEMPLATE_HTML), help="HTML şablon dosyası")
    parser.add_argument("--output", default=str(OUTPUT_HTML), help="Çıktı HTML dosyası")
    parser.add_argument(
        "--output-2024",
        "--output-2023",
        dest="output_2024",
        default="",
        help="2024 ve sonrası için üretilecek ikinci HTML dosyası. Boşsa ana çıktı adından türetilir.",
    )
    parser.add_argument(
        "--exclude-stajyer",
        action="store_true",
        help="Stajyer unvanlı satırları dashboard hesaplamasından çıkar.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Veriyi hesapla ama HTML dosyasını yazma.",
    )
    args = parser.parse_args()

    if args.dry_run:
        xlsx_path = Path(args.xlsx)
        if not xlsx_path.exists():
            raise FileNotFoundError(f"Excel bulunamadı: {xlsx_path}")
        sources = load_dashboard_sources(xlsx_path, exclude_stajyer=args.exclude_stajyer)
        data = build_dashboard_data_from_sources(sources)
        for warning in validate_dashboard_data(data):
            log_step(warning)
        log_step("Dry-run tamamlandı; HTML dosyası yazılmadı.")
        return
    generate_dashboard_outputs(
        Path(args.xlsx),
        Path(args.template),
        Path(args.output),
        output_2024=Path(args.output_2024) if args.output_2024 else None,
        exclude_stajyer=args.exclude_stajyer,
    )


if __name__ == "__main__":
    main()
