"""Canonical data preparation for the standalone turnover dashboard.

The exit-reason classification changes only the numerator. Every view uses
the same denominator and formula as the existing production dashboards:

    turnover = exits / ((period_start + period_end) / 2)
"""

from __future__ import annotations

import math
import re
import unicodedata
from typing import Any, Iterable

import numpy as np
import pandas as pd

from dashboard_build_common import numeric, parse_datetime, sicil_key


UNMATCHED_REASON = "Eşleşmeyen / boş ayrılma sebebi"
EXIT_TYPES = ("İstifa", "Fesih")
TURNOVER_DIMENSIONS = (
    "scope",
    "ust_bolum",
    "bolge",
    "magaza",
    "departman",
    "bolum",
    "il",
    "cinsiyet",
    "sozlesme_turu",
    "title",
    "calisma_tipi",
)

# Legacy Excel exports contain Turkish CP1254 bytes decoded as Latin-1.
# Repair those characters before comparisons and before exporting new sheets.
_LEGACY_TR_MAP = str.maketrans(
    {
        "ð": "ğ",
        "Ð": "Ğ",
        "ý": "ı",
        "Ý": "İ",
        "þ": "ş",
        "Þ": "Ş",
    }
)


def _text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (float, np.floating)) and math.isnan(float(value)):
        return ""
    text = str(value).strip()
    if text.casefold() in {"", "nan", "none", "nat", "<na>"}:
        return ""
    text = text.translate(_LEGACY_TR_MAP)
    # Repair the common UTF-8-as-Latin-1 layers without risking arbitrary text.
    for _ in range(3):
        if not any(marker in text for marker in ("Ã", "Ä", "Å", "Â")):
            break
        try:
            repaired = text.encode("latin1").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            break
        if repaired == text:
            break
        text = repaired
    text = re.sub(r"\?{3,}", "", text)
    return " ".join(text.split())


def _key(value: Any) -> str:
    text = _text(value).replace("ı", "i").replace("İ", "I").casefold()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char))
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text).split())


def clean_turnover_text(value: Any) -> str:
    """Public text repair helper shared by the generator."""

    return _text(value)


def normalize_turnover_key(value: Any) -> str:
    """Public comparison key shared by the generator."""

    return _key(value)


def _first_col(frame: pd.DataFrame, candidates: Iterable[str]) -> str | None:
    if frame is None or len(frame.columns) == 0:
        return None
    direct = {str(column): str(column) for column in frame.columns}
    normalized = {_key(column): str(column) for column in frame.columns}
    for candidate in candidates:
        if candidate in direct:
            return direct[candidate]
        match = normalized.get(_key(candidate))
        if match:
            return match
    return None


def _series(
    frame: pd.DataFrame,
    candidates: Iterable[str],
    *,
    default: Any = "",
) -> pd.Series:
    column = _first_col(frame, candidates)
    if column:
        return frame[column]
    return pd.Series(default, index=frame.index, dtype="object")


def _clean_series(series: pd.Series) -> pd.Series:
    return series.map(_text)


def _canonical_scope(value: Any) -> str:
    key = _key(value)
    if "magaza" in key:
        return "Mağaza"
    if "edirne" in key or "fabrika" in key:
        return "Edirne"
    if "merkez" in key:
        return "Merkez"
    return _text(value) or "Belirsiz"


def _canonical_store_title(value: Any) -> str:
    text = _text(value)
    key = _key(text)
    if not key or key in {"yanlis", "magaza degil", "diger"}:
        return ""
    if "magaza mudur yardimcisi" in key or "magaza ikinci muduru" in key:
        return "Mağaza İkinci Müdürü / Mağaza Müdür Yardımcısı"
    if "magaza muduru" in key:
        return "Mağaza Müdürü"
    if "pasor" in key:
        return "Pasör Satış Danışmanı"
    if "belirli sureli" in key and "part time" in key and "satis danismani" in key:
        return "Belirli Süreli Part Time Satış Danışmanı"
    if "belirli sureli" in key and "satis danismani" in key:
        return "Belirli Süreli Full Time Satış Danışmanı"
    if "part time" in key and "satis danismani" in key:
        return "Part Time Satış Danışmanı"
    if "corner" in key and "satis danismani" in key:
        return "Corner Satış Danışmanı"
    if "satis danismani" in key:
        return "Satış Danışmanı"
    if "kasiyer" in key:
        return "Kasiyer"
    if "magaza destek" in key or key == "depo":
        return "Mağaza Destek Elemanı"
    if "temizlik" in key:
        return "Temizlik Elemanı"
    return text


def _canonical_title(
    scope: pd.Series,
    store_title: pd.Series,
    center_title: pd.Series,
    task: pd.Series,
    position: pd.Series,
) -> pd.Series:
    result: list[str] = []
    for scope_value, store_value, center_value, task_value, position_value in zip(
        scope,
        store_title,
        center_title,
        task,
        position,
    ):
        if scope_value == "Mağaza":
            candidate = (
                _canonical_store_title(store_value)
                or _canonical_store_title(task_value)
                or _canonical_store_title(position_value)
            )
        else:
            center_key = _key(center_value)
            candidate = "" if center_key in {"", "yanlis"} else _text(center_value)
            candidate = candidate or _text(position_value) or _text(task_value)
        result.append(candidate or "Belirsiz")
    return pd.Series(result, index=scope.index, dtype="object")


def _store_region_lookup(fiili_list: pd.DataFrame | None) -> dict[str, str]:
    if fiili_list is None or fiili_list.empty:
        return {}
    store_col = _first_col(
        fiili_list,
        ["ISLETME_AD", "İşletme Adı", "isletme_adi", "LOKASYON", "Mağaza"],
    )
    region_col = _first_col(
        fiili_list,
        ["UST_BOLUM_ADI", "Üst Bölüm Adı", "bolge", "Bölge", "departman_adi"],
    )
    if not store_col or not region_col:
        return {}
    pairs = fiili_list[[store_col, region_col]].dropna().drop_duplicates()
    output: dict[str, str] = {}
    for store, region in pairs.itertuples(index=False, name=None):
        store_key = _key(store)
        region_text = _text(region)
        if store_key and _key(region_text).startswith("bolge"):
            output[store_key] = region_text
    return output


def base_exit_type(reason: Any) -> str:
    """Return the editable default voluntary/involuntary classification."""

    key = _key(reason)
    if not key:
        return "İstifa"

    # Evaluate forced markers first so "işçi feshi (İkale)" is not treated as
    # a resignation. This is a two-way management classification, not a legal
    # opinion about the termination.
    forced_markers = (
        "ikale",
        "isverence",
        "isveren feshi",
        "isveren tarafindan",
        "isveren iscinin",
        "disiplin",
        "devamsizlik",
        "hirsizlik",
        "satasmasi",
        "cinsel taciz",
        "gorevleri kendisine hatirlatildigi halde yapmamak",
        "guvenligini tehlikeye",
        "isyerinin kapanmasi",
        "isin sona ermesi",
        "sozlesmesinin sona ermesi",
        "olum",
    )
    if any(marker in key for marker in forced_markers):
        return "Fesih"

    voluntary_markers = (
        "istifa",
        "isci feshi",
        "isci tarafindan",
        "kadin iscinin evlenmesi",
        "emeklilik",
        "askerlik",
        "malulen",
        "isci saglik nedeniyle",
        "isci zorunlu",
    )
    if any(marker in key for marker in voluntary_markers):
        return "İstifa"

    # Explicit business rule: unmatched reasons default to voluntary turnover.
    return "İstifa"


def _latest_exit_reason_table(
    ayrilanlar: pd.DataFrame | None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    lookup_columns = [
        "sicil_key",
        "ayrilanlar_cikis_tarihi",
        "ayrilma_sebebi_grubu",
        "ayrilma_sebebi",
        "reason_key",
        "turnover_turu_base",
    ]
    settings_columns = [
        "reason_key",
        "ayrilma_sebebi",
        "ayrilma_sebebi_grubu",
        "kayit_sayisi",
        "turnover_turu_base",
    ]
    if ayrilanlar is None or ayrilanlar.empty:
        return pd.DataFrame(columns=lookup_columns), pd.DataFrame(columns=settings_columns)

    sicil_col = _first_col(ayrilanlar, ["Sicil No", "sicil_no", "sicil"])
    date_col = _first_col(ayrilanlar, ["Çıkış Tarihi", "Cikis Tarihi", "cikis_tarihi"])
    group_col = _first_col(
        ayrilanlar,
        ["Ayrılma Sebebi Grubu", "Ayrilma Sebebi Grubu", "ayrilma_sebebi_grubu"],
    )
    reason_col = _first_col(
        ayrilanlar,
        ["Ayrılma Sebebi", "Ayrilma Sebebi", "ayrilma_sebebi"],
    )
    if not sicil_col:
        return pd.DataFrame(columns=lookup_columns), pd.DataFrame(columns=settings_columns)

    work = pd.DataFrame(index=ayrilanlar.index)
    work["sicil_key"] = ayrilanlar[sicil_col].map(sicil_key)
    work["ayrilanlar_cikis_tarihi"] = (
        parse_datetime(ayrilanlar[date_col]) if date_col else pd.NaT
    )
    work["ayrilma_sebebi_grubu"] = (
        _clean_series(ayrilanlar[group_col]) if group_col else ""
    )
    work["ayrilma_sebebi"] = (
        _clean_series(ayrilanlar[reason_col]) if reason_col else ""
    )
    work["ayrilma_sebebi"] = work["ayrilma_sebebi"].replace("", UNMATCHED_REASON)
    work["reason_key"] = work["ayrilma_sebebi"].map(_key)
    work["turnover_turu_base"] = work["ayrilma_sebebi"].map(base_exit_type)
    work["_row_order"] = np.arange(len(work))
    work = work[work["sicil_key"].ne("")].copy()

    latest = (
        work.sort_values(
            ["sicil_key", "ayrilanlar_cikis_tarihi", "_row_order"],
            na_position="first",
        )
        .drop_duplicates("sicil_key", keep="last")[lookup_columns]
        .reset_index(drop=True)
    )

    settings = (
        work.groupby(["reason_key", "ayrilma_sebebi"], as_index=False, dropna=False)
        .agg(
            ayrilma_sebebi_grubu=(
                "ayrilma_sebebi_grubu",
                lambda values: " / ".join(
                    sorted({_text(value) for value in values if _text(value)})
                ),
            ),
            kayit_sayisi=("sicil_key", "size"),
            turnover_turu_base=("turnover_turu_base", "first"),
        )
        .sort_values(
            ["turnover_turu_base", "kayit_sayisi", "ayrilma_sebebi"],
            ascending=[True, False, True],
        )
        .reset_index(drop=True)
    )
    return latest, settings[settings_columns]


def build_turnover_analysis_tables(
    sonuc: pd.DataFrame,
    ayrilanlar: pd.DataFrame | None,
    fiili_list: pd.DataFrame | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Build the denominator cube, exit detail and editable reason map."""

    monthly_columns = [
        "donem",
        *TURNOVER_DIMENSIONS,
        "giris",
        "cikis",
        "donem_basi",
        "donem_sonu",
        "ortalama_calisan",
        "turnover",
    ]
    exit_columns = [
        "donem",
        "sicil_no",
        "adi_soyadi",
        *TURNOVER_DIMENSIONS,
        "ise_giris_tarihi",
        "cikis_tarihi",
        "kidem_gun",
        "kidem_yil",
        "cikis",
        "ayrilanlar_cikis_tarihi",
        "ayrilma_sebebi_grubu",
        "ayrilma_sebebi",
        "reason_key",
        "turnover_turu_base",
        "reason_match_status",
    ]
    if sonuc is None or sonuc.empty:
        _, settings = _latest_exit_reason_table(ayrilanlar)
        return (
            pd.DataFrame(columns=monthly_columns),
            pd.DataFrame(columns=exit_columns),
            settings,
        )

    work = pd.DataFrame(index=sonuc.index)
    work["donem"] = parse_datetime(
        _series(sonuc, ["donem", "Dönem", "Donem"], default=pd.NaT)
    ).dt.strftime("%Y-%m")
    work["sicil_no"] = _series(sonuc, ["sicil_no", "Sicil No", "sicil"]).map(
        sicil_key
    )
    work["sicil_key"] = work["sicil_no"]
    work["adi_soyadi"] = _clean_series(
        _series(sonuc, ["adi_soyadi", "Adı Soyadı", "ad_soyad"])
    )
    work["ust_bolum"] = _clean_series(
        _series(sonuc, ["ust_bolum", "Üst Bölüm", "UST_BOLUM_ADI"])
    )
    work["scope"] = work["ust_bolum"].map(_canonical_scope)
    work["ust_bolum"] = work["scope"]
    work["magaza"] = _clean_series(
        _series(sonuc, ["isletme_adi", "İşletme Adı", "ISLETME_AD"])
    ).where(work["scope"].eq("Mağaza"), "")

    raw_department = _clean_series(
        _series(sonuc, ["departman", "Departman", "departman_adi"])
    )
    raw_department_name = _clean_series(
        _series(sonuc, ["departman_adi", "Departman Adı", "bolge", "Bölge"])
    )
    work["departman"] = raw_department.where(raw_department.ne(""), raw_department_name)
    work["bolum"] = _clean_series(
        _series(sonuc, ["bolum_adi", "Bölüm Adı", "BOLUM_ADI"])
    )
    work["il"] = _clean_series(
        _series(sonuc, ["il", "İl", "IL", "sehir", "Şehir"])
    )
    work["cinsiyet"] = _clean_series(
        _series(sonuc, ["cinsiyet", "Cinsiyet", "CINSIYET"])
    )
    kadro = _clean_series(
        _series(sonuc, ["kadro_adi", "Kadro Adı", "kadro_adı"])
    )
    work["sozlesme_turu"] = kadro

    store_regions = _store_region_lookup(fiili_list)
    candidate_region = raw_department_name.where(
        raw_department_name.map(_key).str.startswith("bolge", na=False),
        "",
    )
    department_region = raw_department.where(
        raw_department.map(_key).str.startswith("bolge", na=False),
        "",
    )
    work["bolge"] = candidate_region.where(candidate_region.ne(""), department_region)
    # Historical records may omit the region while later/earlier records of the
    # same store contain it. Fill within each store in chronological order
    # before falling back to the current fiili-list mapping. This preserves
    # explicit region changes whenever a dated value exists.
    work["_store_key"] = work["magaza"].map(_key)
    store_order = work.loc[
        work["scope"].eq("Mağaza") & work["_store_key"].ne("")
    ].sort_values(["_store_key", "donem"])
    if not store_order.empty:
        filled_regions = (
            store_order["bolge"].astype("string")
            .replace("", pd.NA)
            .groupby(store_order["_store_key"])
            .transform(lambda values: values.ffill().bfill())
            .fillna("")
        )
        work.loc[store_order.index, "bolge"] = filled_regions
    missing_region = work["scope"].eq("Mağaza") & work["bolge"].eq("")
    work.loc[missing_region, "bolge"] = work.loc[missing_region, "magaza"].map(
        lambda value: store_regions.get(_key(value), "")
    )
    work["bolge"] = work["bolge"].where(work["scope"].eq("Mağaza"), "")
    work.drop(columns=["_store_key"], inplace=True)

    work["calisma_tipi"] = np.where(
        work["scope"].eq("Mağaza"),
        np.where(
            kadro.map(_key).str.contains("part time", na=False),
            "Part Time",
            "Full Time",
        ),
        "",
    )
    store_title = _clean_series(
        _series(
            sonuc,
            [
                "magaza_kırılım",
                "magaza_kirilim",
                "magaza_kırılımı",
                "magaza_title",
            ],
        )
    )
    center_title = _clean_series(
        _series(sonuc, ["merkez_title", "merkez_seviye"])
    )
    task = _clean_series(_series(sonuc, ["gorev", "Görev", "GOREV_ADI"]))
    position = _clean_series(_series(sonuc, ["unvan", "Ünvan", "UNVAN_ADI"]))
    work["title"] = _canonical_title(
        work["scope"],
        store_title,
        center_title,
        task,
        position,
    )

    for metric in ["giris", "cikis", "donem_basi", "donem_sonu"]:
        work[metric] = numeric(_series(sonuc, [metric])).fillna(0.0)
    work["ise_giris_tarihi"] = parse_datetime(
        _series(sonuc, ["ise_giris_tarihi", "İşe Giriş Tarihi", "son_giris_tarihi"])
    )
    work["cikis_tarihi"] = parse_datetime(
        _series(sonuc, ["cikis_tarihi", "Çıkış Tarihi"])
    )
    work["kidem_gun"] = numeric(
        _series(sonuc, ["kidem_gun", "Kıdem Gün"])
    )
    work["kidem_yil"] = numeric(
        _series(sonuc, ["kidem_yil", "kidem_yili", "Kıdem Yılı"])
    )

    metric_total = work[["giris", "cikis", "donem_basi", "donem_sonu"]].sum(axis=1)
    work = work[work["donem"].notna() & metric_total.gt(0)].copy()
    for dimension in TURNOVER_DIMENSIONS:
        work[dimension] = _clean_series(work[dimension])
    store_rows = work["scope"].eq("Mağaza")
    work.loc[store_rows & work["bolge"].eq(""), "bolge"] = "Belirsiz"
    work.loc[store_rows & work["magaza"].eq(""), "magaza"] = "Belirsiz"
    work.loc[work["departman"].eq(""), "departman"] = "Belirsiz"
    work.loc[work["bolum"].eq(""), "bolum"] = "Belirsiz"
    work.loc[work["il"].eq(""), "il"] = "Belirsiz"
    work.loc[work["cinsiyet"].eq(""), "cinsiyet"] = "Belirsiz"
    work.loc[work["sozlesme_turu"].eq(""), "sozlesme_turu"] = "Belirsiz"
    work.loc[work["title"].eq(""), "title"] = "Belirsiz"
    work.loc[~store_rows, ["bolge", "magaza", "calisma_tipi"]] = ""

    monthly = (
        work.groupby(["donem", *TURNOVER_DIMENSIONS], as_index=False, dropna=False)
        .agg(
            giris=("giris", "sum"),
            cikis=("cikis", "sum"),
            donem_basi=("donem_basi", "sum"),
            donem_sonu=("donem_sonu", "sum"),
        )
        .sort_values(["donem", "scope", "bolge", "magaza", "title"])
        .reset_index(drop=True)
    )
    monthly["ortalama_calisan"] = (
        monthly["donem_basi"] + monthly["donem_sonu"]
    ) / 2
    monthly["turnover"] = np.where(
        monthly["ortalama_calisan"].gt(0),
        monthly["cikis"] / monthly["ortalama_calisan"],
        np.nan,
    )

    latest_reason, reason_settings = _latest_exit_reason_table(ayrilanlar)
    exits = work[work["cikis"].gt(0)].copy()
    exits = exits.merge(latest_reason, on="sicil_key", how="left")
    matched = exits["ayrilma_sebebi"].notna()
    exits["ayrilma_sebebi"] = exits["ayrilma_sebebi"].fillna(UNMATCHED_REASON)
    exits["ayrilma_sebebi_grubu"] = exits["ayrilma_sebebi_grubu"].fillna("")
    exits["reason_key"] = exits["ayrilma_sebebi"].map(_key)
    exits["turnover_turu_base"] = exits["turnover_turu_base"].fillna("İstifa")
    exits["reason_match_status"] = np.where(
        matched,
        "Ayrılanlar Listesi · son tarihli çıkış",
        "Eşleşme yok · varsayılan İstifa",
    )

    source_exit_date = parse_datetime(exits["cikis_tarihi"])
    reason_exit_date = parse_datetime(exits["ayrilanlar_cikis_tarihi"])
    exits["cikis_tarihi"] = source_exit_date.fillna(
        reason_exit_date
    )
    exits["ise_giris_tarihi"] = parse_datetime(exits["ise_giris_tarihi"])
    computed_days = (
        exits["cikis_tarihi"] - exits["ise_giris_tarihi"]
    ).dt.days.clip(lower=0)
    exits["kidem_gun"] = exits["kidem_gun"].where(
        exits["kidem_gun"].notna(),
        computed_days,
    )
    exits["kidem_yil"] = exits["kidem_yil"].where(
        exits["kidem_yil"].notna(),
        exits["kidem_gun"] / 365.25,
    )
    for date_column in [
        "ise_giris_tarihi",
        "cikis_tarihi",
        "ayrilanlar_cikis_tarihi",
    ]:
        exits[date_column] = parse_datetime(exits[date_column]).dt.normalize()

    exits = exits[exit_columns].sort_values(
        ["donem", "scope", "bolge", "magaza", "adi_soyadi"],
        ascending=[False, True, True, True, True],
    )

    if UNMATCHED_REASON not in set(reason_settings.get("ayrilma_sebebi", [])):
        reason_settings = pd.concat(
            [
                reason_settings,
                pd.DataFrame(
                    [
                        {
                            "reason_key": _key(UNMATCHED_REASON),
                            "ayrilma_sebebi": UNMATCHED_REASON,
                            "ayrilma_sebebi_grubu": "",
                            "kayit_sayisi": int((~matched).sum()),
                            "turnover_turu_base": "İstifa",
                        }
                    ]
                ),
            ],
            ignore_index=True,
        )

    return (
        monthly[monthly_columns],
        exits.reset_index(drop=True),
        reason_settings.reset_index(drop=True),
    )
