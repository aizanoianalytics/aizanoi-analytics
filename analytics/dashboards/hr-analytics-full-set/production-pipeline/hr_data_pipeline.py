import pandas as pd
import numpy as np
from pathlib import Path
import os
import sys
import re
import time
import zipfile
import warnings
import unicodedata
from dashboard_paths import ICMAL_XLSX, PROJECT_ROOT, ensure_dashboard_dir
from turnover_analytics_common import build_turnover_analysis_tables
from sklearn.exceptions import ConvergenceWarning
from datetime import datetime, timedelta

# Opsiyonel: scikit-learn (mağaza risk skoru için)
try:
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import OneHotEncoder
    from sklearn.compose import ColumnTransformer
    from sklearn.pipeline import Pipeline
    from sklearn.impute import SimpleImputer
    from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
    from sklearn.calibration import CalibratedClassifierCV
    from sklearn.metrics import roc_auc_score
    SKLEARN_AVAILABLE = True
except ImportError:
    RandomForestClassifier = None
    GradientBoostingClassifier = None
    CalibratedClassifierCV = None
    SKLEARN_AVAILABLE = False

# Opsiyonel: statsmodels (turnover tahmini için)
try:
    import statsmodels.api as sm
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    STATSMODELS_AVAILABLE = True
except ImportError:
    sm = None
    ExponentialSmoothing = None
    STATSMODELS_AVAILABLE = False

warnings.filterwarnings("ignore", category=ConvergenceWarning)
pd.set_option('display.max_columns', None)


def ensure_utf8_stdio():
    """Windows konsolunda emoji/Türkçe loglar yüzünden scriptin çökmesini engelle."""
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


TR_ASCII_MAP = str.maketrans(
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
    }
)


def repair_mojibake_text(value):
    if not isinstance(value, str):
        return value
    out = value
    replacements = [
        ("þ", "ş"), ("Þ", "Ş"),
        ("ý", "ı"), ("Ý", "İ"),
        ("Ã§", "ç"), ("Ã‡", "Ç"),
        ("ÄŸ", "ğ"), ("Äž", "Ğ"), ("Ã°", "ğ"), ("Ã", "Ğ"), ("ð", "ğ"), ("Ð", "Ğ"),
        ("Ä°", "İ"), ("Ä±", "ı"),
        ("ÅŸ", "ş"), ("Åž", "Ş"),
        ("Ã¶", "ö"), ("Ã–", "Ö"),
        ("Ã¼", "ü"), ("Ãœ", "Ü"),
        ("Â·", "·"), ("Â", ""),
    ]
    for bad, good in replacements:
        if bad in out:
            out = out.replace(bad, good)
    # Three or more question marks are source-system replacement artifacts.
    # Preserve normal punctuation such as a single question mark.
    out = re.sub(r"\?{3,}", "", out)
    return re.sub(r"\s{2,}", " ", out).strip()


def normalize_text_key(value):
    if pd.isna(value):
        return ""
    text = str(repair_mojibake_text(value)).strip()
    text = text.translate(TR_ASCII_MAP)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return " ".join(text.lower().split())


def resolve_existing_path(base_dir: Path, primary_name: str, patterns=None, exclude_names=None) -> Path:
    """
    Dosyayi once beklenen isimle, yoksa verilen glob pattern'lariyla bul.
    """
    p = base_dir / primary_name
    if p.exists():
        return p
    excluded = {
        normalize_text_key(name)
        for name in (exclude_names or [])
        if name
    }
    primary_key = normalize_text_key(Path(primary_name).name)
    primary_tokens = [tok for tok in re.split(r"[^a-z0-9]+", primary_key) if tok]
    candidates: list[Path] = []
    for pattern in (patterns or []):
        for match in sorted(base_dir.glob(pattern)):
            match_key = normalize_text_key(match.name)
            if match_key in excluded:
                continue
            candidates.append(match)
    if candidates:
        def _score(path: Path):
            name_key = normalize_text_key(path.name)
            token_hits = sum(1 for tok in primary_tokens if tok and tok in name_key)
            exact_name = int(name_key == primary_key)
            return (-exact_name, -token_hits, len(path.name), path.name)

        return sorted(candidates, key=_score)[0]
    raise FileNotFoundError(f"Dosya bulunamadi: {primary_name}")


def ensure_sicil_type(df, col="sicil_no"):
    if col in df.columns:
        df[col] = pd.to_numeric(df[col], errors="coerce").astype("Int64")
    return df

def hesapla_turnover_tablosu(df, group_col):
    """
    df: icmal_sorgu_sonuc (sonuc DataFrame'i)
    group_col: 'ust_bolum', 'departman_adi', 'isletme_adi' veya 'bolum_adi'
    Basit turnover hesaplama (ust_bolum sütunu olmadan)
    """
    gruplanmis = (
        df
        .groupby(["donem", group_col], dropna=False)[
            ["cikis", "donem_basi", "donem_sonu", "cikis2", "donem_basi_2", "donem_sonu_2"]
        ]
        .sum()
        .reset_index()
    )

    # 1. yöntem: cikis / ((donem_basi + donem_sonu)/2)
    gruplanmis["ortalama1"] = (gruplanmis["donem_basi"] + gruplanmis["donem_sonu"]) / 2
    gruplanmis["turnover1"] = np.where(
        gruplanmis["ortalama1"] != 0,
        gruplanmis["cikis"] / gruplanmis["ortalama1"],
        np.nan,
    )

    # 2. yöntem: cikis2 / ((donem_basi_2 + donem_sonu_2)/2)
    gruplanmis["ortalama2"] = (gruplanmis["donem_basi_2"] + gruplanmis["donem_sonu_2"]) / 2
    gruplanmis["turnover2"] = np.where(
        gruplanmis["ortalama2"] != 0,
        gruplanmis["cikis2"] / gruplanmis["ortalama2"],
        np.nan,
    )

    kolonlar = [
        "donem", group_col, "cikis", "donem_basi", "donem_sonu", "ortalama1", "turnover1",
        "cikis2", "donem_basi_2", "donem_sonu_2", "ortalama2", "turnover2",
    ]
    kolonlar = [c for c in kolonlar if c in gruplanmis.columns]
    return gruplanmis[kolonlar].sort_values(["donem", group_col])


def hesapla_turnover_tablosu_with_ust_bolum(df, group_col):
    """
    df: icmal_sorgu_sonuc (sonuc DataFrame'i)
    group_col: 'departman_adi', 'isletme_adi' veya 'bolum_adi'
    Her grup için ust_bolum bilgisi de eklenir
    """
    # Önce her grup için ust_bolum mapping'i oluştur
    if "ust_bolum" in df.columns:
        ust_bolum_map = (
            df[[group_col, "ust_bolum"]]
            .dropna(subset=[group_col])
            .drop_duplicates(subset=[group_col])
            .set_index(group_col)["ust_bolum"]
            .to_dict()
        )
    else:
        ust_bolum_map = {}

    # Turnover hesapla
    gruplanmis = (
        df
        .groupby(["donem", group_col], dropna=False)[
            ["cikis", "donem_basi", "donem_sonu", "cikis2", "donem_basi_2", "donem_sonu_2"]
        ]
        .sum()
        .reset_index()
    )

    # ust_bolum sütununu ekle
    if ust_bolum_map:
        gruplanmis["ust_bolum"] = gruplanmis[group_col].map(ust_bolum_map)
    else:
        gruplanmis["ust_bolum"] = np.nan

    # 1. yöntem: cikis / ((donem_basi + donem_sonu)/2)
    gruplanmis["ortalama1"] = (gruplanmis["donem_basi"] + gruplanmis["donem_sonu"]) / 2
    gruplanmis["turnover1"] = np.where(
        gruplanmis["ortalama1"] != 0,
        gruplanmis["cikis"] / gruplanmis["ortalama1"],
        np.nan,
    )

    # 2. yöntem: cikis2 / ((donem_basi_2 + donem_sonu_2)/2)
    gruplanmis["ortalama2"] = (gruplanmis["donem_basi_2"] + gruplanmis["donem_sonu_2"]) / 2
    gruplanmis["turnover2"] = np.where(
        gruplanmis["ortalama2"] != 0,
        gruplanmis["cikis2"] / gruplanmis["ortalama2"],
        np.nan,
    )

    # Kolon sıralaması (ust_bolum ilk sıralarda)
    kolonlar = [
        "donem", group_col, "ust_bolum", "cikis", "donem_basi", "donem_sonu", "ortalama1", "turnover1",
        "cikis2", "donem_basi_2", "donem_sonu_2", "ortalama2", "turnover2",
    ]
    kolonlar = [c for c in kolonlar if c in gruplanmis.columns]
    return gruplanmis[kolonlar].sort_values(["donem", group_col])


def forecast_turnover_series(df_ts, steps=3, value_col="turnover1"):
    """
    Turnover oranı için daha dayanıklı tahminleme.
    - Robust lineer trend
    - Basit ETS
    - 12+ ayda mevsimsel ayrıştırma
    - 24+ ayda Holt-Winters (statsmodels varsa)
    - Bootstrap benzeri güven aralığı
    """
    if df_ts is None or df_ts.empty or value_col not in df_ts.columns:
        return pd.DataFrame()

    try:
        ts = df_ts.copy()
        ts = ts.dropna(subset=["donem", value_col])
        if ts.empty:
            return pd.DataFrame()

        ts["donem"] = pd.to_datetime(ts["donem"], errors="coerce")
        ts = ts.dropna(subset=["donem"])
        if ts.empty:
            return pd.DataFrame()

        ts["donem_month"] = ts["donem"].dt.to_period("M").dt.to_timestamp()
        y = (
            ts.groupby("donem_month", as_index=True)[value_col]
            .mean()
            .sort_index()
            .asfreq("MS")
        )
        y_clean = y.dropna()
        n = len(y_clean)
        if n == 0:
            return pd.DataFrame()

        last_date = y_clean.index.max()
        fc_index = [last_date + pd.offsets.MonthBegin(h) for h in range(1, steps + 1)]

        q1, q3 = y_clean.quantile(0.25), y_clean.quantile(0.75)
        iqr = q3 - q1
        lower_fence = max(0.0, float(q1 - 1.5 * iqr)) if pd.notna(iqr) else 0.0
        upper_fence = float(q3 + 1.5 * iqr) if pd.notna(iqr) else float(y_clean.max())
        y_robust = y_clean.clip(lower=lower_fence, upper=upper_fence)

        forecasts = {
            "linear": _forecast_linear_robust(y_robust, fc_index),
        }
        if n >= 6:
            forecasts["ets"] = _forecast_ets_simple(y_robust, steps)
        if n >= 12:
            forecasts["seasonal"] = _forecast_seasonal(y_robust, fc_index)
            recent_profile = _forecast_recent_seasonal_profile(y_robust, fc_index)
            if recent_profile:
                forecasts["seasonal_profile"] = recent_profile
        if n >= 24 and STATSMODELS_AVAILABLE:
            hw = _forecast_holtwinters(y_robust, steps)
            if hw:
                forecasts["holtwinters"] = hw

        weights = {
            "linear": 0.8,
            "ets": 1.2,
            "seasonal": 1.8,
            "seasonal_profile": 2.0,
            "holtwinters": 2.2,
        }
        point_forecast = _weighted_ensemble(forecasts, weights, steps)
        lower_ci, upper_ci = _bootstrap_confidence(
            y_robust,
            point_forecast,
            confidence=0.80,
            n_boot=120,
        )

        hist_max = float(y_robust.max())
        hist_min = float(y_robust.min())
        reasonable_upper = min(max(hist_max * 1.5, hist_max + 0.02), 1.0)
        reasonable_lower = max(0.005, min(hist_min * 0.6, hist_min))

        point_forecast = [float(np.clip(v, reasonable_lower, reasonable_upper)) for v in point_forecast]
        lower_ci = [float(np.clip(v, reasonable_lower, 1.0)) for v in lower_ci]
        upper_ci = [float(np.clip(v, 0.0, 1.0)) for v in upper_ci]

        method_label = "+".join(sorted(forecasts.keys()))
        out = pd.DataFrame(
            {
                "donem": fc_index,
                f"tahmin_{value_col}": point_forecast,
                f"alt_sinir_{value_col}": lower_ci,
                f"ust_sinir_{value_col}": upper_ci,
                "yontem": method_label,
                "n_veri": n,
            }
        )
        return out

    except Exception as e:
        print("forecast_turnover_series genel hata:", e)
        return pd.DataFrame()


def _forecast_linear_robust(y, fc_index):
    y_vals = y.values.astype(float)
    n = len(y_vals)
    if n == 0:
        return [0.0 for _ in fc_index]
    if n == 1:
        return [float(y_vals[0]) for _ in fc_index]

    x = np.arange(n)
    if n >= 4:
        slopes = []
        step = max(1, n // 20)
        for i in range(0, n - 1, step):
            for j in range(i + 1, n, step):
                if x[j] != x[i]:
                    slopes.append((y_vals[j] - y_vals[i]) / (x[j] - x[i]))
        slope = float(np.median(slopes)) if slopes else 0.0
    else:
        coeffs = np.polyfit(x, y_vals, 1)
        slope = float(coeffs[0])

    last_val = float(y_vals[-1])
    damping = 0.85
    result = []
    for h, _ in enumerate(fc_index, 1):
        damped_slope = slope * (damping ** h)
        result.append(float(last_val + damped_slope * h))
    return result


def _forecast_ets_simple(y, steps):
    y_vals = y.values.astype(float)
    n = len(y_vals)
    if n == 0:
        return [0.0] * steps
    if n == 1:
        return [float(y_vals[0])] * steps

    best_alpha, best_beta, best_mse = 0.3, 0.1, float("inf")
    for alpha in [0.15, 0.25, 0.35, 0.45, 0.55, 0.65]:
        for beta in [0.05, 0.1, 0.15, 0.2]:
            level = y_vals[0]
            trend = y_vals[1] - y_vals[0]
            errs = []
            for i in range(1, n):
                pred = level + trend
                errs.append((y_vals[i] - pred) ** 2)
                new_level = alpha * y_vals[i] + (1 - alpha) * (level + trend)
                trend = beta * (new_level - level) + (1 - beta) * trend
                level = new_level
            mse = float(sum(errs) / len(errs)) if errs else float("inf")
            if mse < best_mse:
                best_alpha, best_beta, best_mse = alpha, beta, mse

    level = y_vals[0]
    trend = y_vals[1] - y_vals[0]
    for i in range(1, n):
        new_level = best_alpha * y_vals[i] + (1 - best_alpha) * (level + trend)
        trend = best_beta * (new_level - level) + (1 - best_beta) * trend
        level = new_level

    damping = 0.90
    result = []
    for h in range(1, steps + 1):
        damped_trend = trend * sum(damping ** i for i in range(1, h + 1))
        result.append(float(level + damped_trend))
    return result


def _forecast_seasonal(y, fc_index):
    y_vals = y.values.astype(float)
    n = len(y_vals)
    if n == 0:
        return [0.0 for _ in fc_index]

    months = y.index.month
    overall_mean = float(np.mean(y_vals)) if n else 0.0
    seasonal_indices = np.ones(12)
    if overall_mean > 0:
        month_buckets = {m: [] for m in range(1, 13)}
        for val, month in zip(y_vals, months):
            month_buckets[month].append(val / overall_mean)
        for month in range(1, 13):
            if month_buckets[month]:
                seasonal_indices[month - 1] = float(np.median(month_buckets[month]))
        seasonal_mean = float(np.mean(seasonal_indices))
        if seasonal_mean > 0:
            seasonal_indices = seasonal_indices / seasonal_mean

    deseasonalized = np.array([
        val / seasonal_indices[month - 1] for val, month in zip(y_vals, months)
    ], dtype=float)
    x = np.arange(n)
    if n >= 3:
        coeffs = np.polyfit(x, deseasonalized, 1)
        slope, intercept = float(coeffs[0]), float(coeffs[1])
    else:
        slope, intercept = 0.0, float(np.mean(deseasonalized))

    damping = 0.88
    base_last = intercept + slope * max(n - 1, 0)
    result = []
    for h, date in enumerate(fc_index, 1):
        trend_val = base_last + (slope * (damping ** h) * h)
        seasonal_factor = seasonal_indices[date.month - 1]
        result.append(float(trend_val * seasonal_factor))
    return result


def _forecast_recent_seasonal_profile(y, fc_index):
    if y is None or len(y) < 12:
        return None

    hist = y.iloc[-min(len(y), 36):].copy()
    if hist.empty:
        return None

    hist_vals = hist.values.astype(float)
    recent_level = float(hist.iloc[-min(len(hist), 6):].mean())
    overall_level = float(hist.mean()) if len(hist) else recent_level
    if not np.isfinite(recent_level) or recent_level <= 0:
        recent_level = float(hist.iloc[-1]) if len(hist) else 0.0
    if not np.isfinite(overall_level) or overall_level <= 0:
        overall_level = recent_level if recent_level > 0 else 1.0

    monthly_factor = np.ones(12, dtype=float)
    for month in range(1, 13):
        same_month = hist[hist.index.month == month]
        if not same_month.empty:
            monthly_factor[month - 1] = float(np.median(same_month.values.astype(float))) / overall_level
    factor_mean = float(np.mean(monthly_factor)) if len(monthly_factor) else 1.0
    if factor_mean > 0:
        monthly_factor = monthly_factor / factor_mean

    month_deltas = {m: [] for m in range(1, 13)}
    for i in range(1, len(hist_vals)):
        current_month = int(hist.index[i].month)
        month_deltas[current_month].append(float(hist_vals[i] - hist_vals[i - 1]))
    month_delta_median = {
        m: (float(np.median(vals)) if vals else 0.0)
        for m, vals in month_deltas.items()
    }

    prev_val = float(hist_vals[-1])
    prev_factor = float(monthly_factor[int(hist.index[-1].month) - 1]) or 1.0
    result = []
    for date in fc_index:
        season_factor = float(monthly_factor[int(date.month) - 1])
        seasonal_target = max(0.0, recent_level * season_factor)
        transition_target = max(0.0, prev_val + month_delta_median.get(int(date.month), 0.0))
        same_month_hist = hist[hist.index.month == int(date.month)]

        anchors = [seasonal_target, transition_target]
        weights = [0.45, 0.35]
        if not same_month_hist.empty:
            anchors.append(float(np.median(same_month_hist.tail(3).values.astype(float))))
            weights.append(0.20)

        total_weight = sum(weights) or 1.0
        pred = sum(val * (w / total_weight) for val, w in zip(anchors, weights))
        relative_shift = season_factor / max(prev_factor, 1e-6)
        pred = max(0.0, pred * (0.88 + 0.12 * relative_shift))
        result.append(float(pred))
        prev_val = pred
        prev_factor = season_factor

    return result


def _forecast_holtwinters(y, steps):
    if not STATSMODELS_AVAILABLE or ExponentialSmoothing is None or len(y) < 24:
        return None
    try:
        idx = pd.date_range(start=y.index.min(), end=y.index.max(), freq="MS")
        y_regular = y.reindex(idx)
        if y_regular.isna().all():
            return None
        y_regular = y_regular.interpolate(method="time", limit_direction="both")
        y_regular = y_regular.ffill().bfill()
        seasonal_type = "mul" if float(y.min()) > 0 else "add"
        model = ExponentialSmoothing(
            y_regular,
            trend="add",
            seasonal=seasonal_type,
            seasonal_periods=12,
            damped_trend=True,
            initialization_method="estimated",
        )
        fit = model.fit(optimized=True, use_brute=False)
        fc = fit.forecast(steps)
        return [float(v) for v in fc.values]
    except Exception as exc:
        print(f"Holt-Winters hatası: {exc}")
        return None


def _weighted_ensemble(forecasts, weights, steps):
    if not forecasts:
        return [0.0] * steps
    total_weight = sum(weights.get(name, 1.0) for name in forecasts)
    result = [0.0] * steps
    for name, values in forecasts.items():
        w = weights.get(name, 1.0) / total_weight
        for i in range(min(steps, len(values))):
            if pd.notna(values[i]):
                result[i] += float(values[i]) * w
    return result


def _bootstrap_confidence(y, point_forecast, confidence=0.80, n_boot=200):
    y_vals = y.values.astype(float)
    steps = len(point_forecast)
    if len(y_vals) < 4:
        lower = [max(0.0, v * 0.70) for v in point_forecast]
        upper = [min(1.0, v * 1.30) for v in point_forecast]
        return lower, upper

    rolling_std = float(pd.Series(y_vals).rolling(window=min(6, len(y_vals)), min_periods=2).std().mean())
    if np.isnan(rolling_std) or rolling_std == 0:
        rolling_std = float(np.std(y_vals)) * 0.5
    if np.isnan(rolling_std) or rolling_std == 0:
        rolling_std = 0.01

    rng = np.random.default_rng(42)
    sims = np.zeros((n_boot, steps))
    for b in range(n_boot):
        noise_scale = rolling_std * np.sqrt(np.arange(1, steps + 1))
        noise = rng.normal(0, noise_scale, size=steps)
        sims[b] = np.array(point_forecast) + noise

    alpha = (1 - confidence) / 2
    lower = np.quantile(sims, alpha, axis=0).tolist()
    upper = np.quantile(sims, 1 - alpha, axis=0).tolist()
    return [float(v) for v in lower], [float(v) for v in upper]


def evaluate_turnover_forecast_quality(df_ts, scope_label, value_col="turnover1", test_months=3):
    """
    Son N ayı test seti kabul ederek geriye dönük tahmin kalitesi ölç.
    Dönüş:
    - summary: tek satırlık özet dict
    - detail : ay bazlı karşılaştırma DataFrame
    """
    empty_summary = {
        "scope": scope_label,
        "n_train": 0,
        "n_test": 0,
        "mae": None,
        "rmse": None,
        "mape": None,
        "band_coverage_pct": None,
        "model_versiyonu": None,
        "note": "Yeterli veri yok",
    }
    if df_ts is None or df_ts.empty or value_col not in df_ts.columns:
        return empty_summary, pd.DataFrame()

    ts = df_ts.copy()
    ts["donem"] = pd.to_datetime(ts["donem"], errors="coerce")
    ts = ts.dropna(subset=["donem", value_col])
    if ts.empty:
        return empty_summary, pd.DataFrame()

    ts["donem_month"] = ts["donem"].dt.to_period("M").dt.to_timestamp()
    y = (
        ts.groupby("donem_month", as_index=True)[value_col]
        .mean()
        .sort_index()
        .asfreq("MS")
        .dropna()
    )
    n = len(y)
    if n <= test_months + 6:
        summary = dict(empty_summary)
        summary["n_train"] = max(0, n - test_months)
        summary["n_test"] = min(test_months, n)
        return summary, pd.DataFrame()

    train = y.iloc[:-test_months]
    test = y.iloc[-test_months:]
    train_df = pd.DataFrame({"donem": train.index, value_col: train.values})
    fc = forecast_turnover_series(train_df, steps=test_months, value_col=value_col)
    pred_col = f"tahmin_{value_col}"
    low_col = f"alt_sinir_{value_col}"
    up_col = f"ust_sinir_{value_col}"
    if fc.empty or pred_col not in fc.columns:
        summary = dict(empty_summary)
        summary["n_train"] = len(train)
        summary["n_test"] = len(test)
        summary["note"] = "Tahmin üretilemedi"
        return summary, pd.DataFrame()

    fc = fc.sort_values("donem").head(test_months).copy()
    actual = test.values.astype(float)
    pred = fc[pred_col].values[: len(actual)].astype(float)
    lower = fc[low_col].values[: len(actual)].astype(float) if low_col in fc.columns else np.full(len(actual), np.nan)
    upper = fc[up_col].values[: len(actual)].astype(float) if up_col in fc.columns else np.full(len(actual), np.nan)

    mae = float(np.mean(np.abs(actual - pred)))
    rmse = float(np.sqrt(np.mean((actual - pred) ** 2)))
    nonzero = actual != 0
    mape = float(np.mean(np.abs((actual[nonzero] - pred[nonzero]) / actual[nonzero])) * 100) if nonzero.any() else None
    inside = ((actual >= lower) & (actual <= upper)) if len(lower) else np.array([], dtype=bool)
    coverage = float(np.mean(inside) * 100) if inside.size else None

    detail = pd.DataFrame(
        {
            "scope": scope_label,
            "donem": test.index,
            "gerceklesen": actual,
            "tahmin": pred,
            "alt_guven": lower,
            "ust_guven": upper,
            "abs_hata": np.abs(actual - pred),
            "sq_hata": (actual - pred) ** 2,
            "ape_pct": np.where(nonzero, np.abs((actual - pred) / actual) * 100, np.nan),
            "guven_bandi_icinde": inside,
        }
    )
    model_version = str(fc["yontem"].iloc[0]) if "yontem" in fc.columns and not fc["yontem"].empty else None
    summary = {
        "scope": scope_label,
        "n_train": len(train),
        "n_test": len(test),
        "mae": round(mae, 4),
        "rmse": round(rmse, 4),
        "mape": round(mape, 2) if mape is not None else None,
        "band_coverage_pct": round(coverage, 1) if coverage is not None else None,
        "model_versiyonu": model_version,
        "note": None,
    }
    return summary, detail


def build_current_year_turnover_backtest(
    df_ts,
    scope_label,
    value_col="turnover1",
    target_year=None,
):
    """
    Cari yil icindeki her hedef ay icin zaman sizintisiz tahmin uretir.

    - Gerceklesmis hedef ay: yalnizca hedef aydan onceki verilerle 1+ adim
      tahmin uretilir ve gerceklesen degerle karsilastirilir.
    - Gelecek hedef ay: son bilinen aya kadar tum verilerle ileri tahmin uretilir.
    """
    columns = [
        "scope",
        "hedef_yil",
        "hedef_donem",
        "egitim_bitis_donemi",
        "durum",
        "ufuk_ay",
        "gerceklesen",
        "tahmin",
        "alt_guven",
        "ust_guven",
        "hata",
        "abs_hata",
        "ape_pct",
        "guven_bandi_icinde",
        "model_versiyonu",
        "n_veri",
        "not",
    ]
    if df_ts is None or df_ts.empty or value_col not in df_ts.columns:
        return pd.DataFrame(columns=columns)

    target_year = int(target_year or pd.Timestamp.now().year)
    ts = df_ts.copy()
    ts["donem"] = pd.to_datetime(ts["donem"], errors="coerce")
    ts[value_col] = pd.to_numeric(ts[value_col], errors="coerce")
    ts = ts.dropna(subset=["donem", value_col])
    if ts.empty:
        return pd.DataFrame(columns=columns)

    ts["donem_month"] = ts["donem"].dt.to_period("M").dt.to_timestamp()
    y = (
        ts.groupby("donem_month", as_index=True)[value_col]
        .mean()
        .sort_index()
        .asfreq("MS")
    )
    actual_series = y.dropna()
    if actual_series.empty:
        return pd.DataFrame(columns=columns)

    latest_actual = actual_series.index.max()
    rows = []
    for month_num in range(1, 13):
        target = pd.Timestamp(year=target_year, month=month_num, day=1)
        actual_value = actual_series.get(target, np.nan)
        is_realized = target <= latest_actual and pd.notna(actual_value)

        if target <= latest_actual:
            train = actual_series[actual_series.index < target]
        else:
            train = actual_series[actual_series.index <= latest_actual]

        if train.empty:
            rows.append(
                {
                    "scope": scope_label,
                    "hedef_yil": target_year,
                    "hedef_donem": target,
                    "egitim_bitis_donemi": None,
                    "durum": "Backtest" if target <= latest_actual else "\u0130leri Tahmin",
                    "ufuk_ay": None,
                    "gerceklesen": float(actual_value) if pd.notna(actual_value) else None,
                    "not": "E\u011fitim verisi yok",
                }
            )
            continue

        train_end = train.index.max()
        horizon = (target.year - train_end.year) * 12 + (target.month - train_end.month)
        if horizon <= 0:
            horizon = 1
        train_df = pd.DataFrame({"donem": train.index, value_col: train.values})
        forecast = forecast_turnover_series(train_df, steps=horizon, value_col=value_col)
        pred_col = f"tahmin_{value_col}"
        low_col = f"alt_sinir_{value_col}"
        high_col = f"ust_sinir_{value_col}"

        if forecast.empty or pred_col not in forecast.columns:
            rows.append(
                {
                    "scope": scope_label,
                    "hedef_yil": target_year,
                    "hedef_donem": target,
                    "egitim_bitis_donemi": train_end,
                    "durum": "Backtest" if target <= latest_actual else "\u0130leri Tahmin",
                    "ufuk_ay": horizon,
                    "gerceklesen": float(actual_value) if pd.notna(actual_value) else None,
                    "n_veri": int(len(train)),
                    "not": "Tahmin \u00fcretilemedi",
                }
            )
            continue

        forecast = forecast.copy()
        forecast["hedef_period"] = pd.to_datetime(forecast["donem"], errors="coerce").dt.to_period("M")
        selected = forecast[forecast["hedef_period"] == target.to_period("M")]
        if selected.empty:
            selected = forecast.sort_values("donem").tail(1)
        prediction_row = selected.iloc[0]
        prediction = pd.to_numeric(pd.Series([prediction_row.get(pred_col)]), errors="coerce").iloc[0]
        lower = pd.to_numeric(pd.Series([prediction_row.get(low_col)]), errors="coerce").iloc[0]
        upper = pd.to_numeric(pd.Series([prediction_row.get(high_col)]), errors="coerce").iloc[0]

        error = float(prediction - actual_value) if pd.notna(prediction) and pd.notna(actual_value) else None
        abs_error = abs(error) if error is not None else None
        ape = (
            abs(error / float(actual_value)) * 100
            if error is not None and float(actual_value) != 0
            else None
        )
        band_inside = (
            bool(float(lower) <= float(actual_value) <= float(upper))
            if pd.notna(actual_value) and pd.notna(lower) and pd.notna(upper)
            else None
        )
        rows.append(
            {
                "scope": scope_label,
                "hedef_yil": target_year,
                "hedef_donem": target,
                "egitim_bitis_donemi": train_end,
                "durum": "Backtest" if is_realized else ("Ger\u00e7ekle\u015fen Yok" if target <= latest_actual else "\u0130leri Tahmin"),
                "ufuk_ay": int(horizon),
                "gerceklesen": float(actual_value) if pd.notna(actual_value) else None,
                "tahmin": float(prediction) if pd.notna(prediction) else None,
                "alt_guven": float(lower) if pd.notna(lower) else None,
                "ust_guven": float(upper) if pd.notna(upper) else None,
                "hata": error,
                "abs_hata": abs_error,
                "ape_pct": ape,
                "guven_bandi_icinde": band_inside,
                "model_versiyonu": prediction_row.get("yontem"),
                "n_veri": int(prediction_row.get("n_veri")) if pd.notna(prediction_row.get("n_veri")) else int(len(train)),
                "not": None,
            }
        )

    return pd.DataFrame(rows, columns=columns)


def normalize_store_code(s):
    """
    Mağaza kodlarını merge için normalize eder:
    - string'e çevirir
    - baştaki/sondaki boşlukları temizler
    - 123.0 gibi float görünümleri 123'e çevirir
    - 00123, 0123 gibi kodları 123'e çevirir
    """
    s = s.astype(str).str.strip()
    # 123.0 => 123
    s = s.str.replace(r"\.0$", "", regex=True)
    # 00123 => 123
    s = s.str.lstrip("0")
    # Tamamen boş kalanları NaN yap
    s = s.replace({"": np.nan})
    return s

def normalize_id_series(s):
    """
    ID/sicil kolonlarını tek formatta normalize eder:
    - string'e çevirir
    - baştaki/sondaki boşlukları temizler
    - 123.0 gibi float görünümleri 123'e çevirir
    - boş değerleri NaN yapar
    """
    s = s.astype("string").str.strip()
    s = s.str.replace(r"\.0$", "", regex=True)
    s = s.replace({"": pd.NA, "nan": pd.NA, "None": pd.NA})
    return s


def find_first_existing_col(df, candidates):
    for col in candidates:
        if col in df.columns:
            return col
    return None


def build_gelisim_yolculuk_sheet(gelisim_yolculuk_raw, sonuc_df, performans_df):
    """Gelişim Yolculuğu ham verisini son dönem özlük/performance bilgisiyle zenginleştirir."""
    if gelisim_yolculuk_raw is None or gelisim_yolculuk_raw.empty:
        return pd.DataFrame()

    out = gelisim_yolculuk_raw.copy()
    sicil_col = find_first_existing_col(out, ["sicil", "sicil_no", "Kullanıcı Kodu", "Kullanici Kodu", "kullanıcı_kodu"])
    if not sicil_col:
        return out

    out["sicil"] = normalize_id_series(out[sicil_col])
    durum_oran_col = find_first_existing_col(out, ["Durum Oran", "durum_oran", "durum oran", "Tamamlama Oranı", "tamamlama_orani"])
    if durum_oran_col:
        durum_oran = pd.to_numeric(out[durum_oran_col], errors="coerce")
        if durum_oran.notna().any() and bool(durum_oran.dropna().le(1).all()):
            durum_oran = durum_oran * 100
        out["durum_oran"] = durum_oran.clip(lower=0, upper=100)

    if sonuc_df is not None and not sonuc_df.empty and {"donem", "sicil_no"}.issubset(sonuc_df.columns):
        latest_donem = pd.to_datetime(sonuc_df["donem"], errors="coerce").max()
        latest = sonuc_df[pd.to_datetime(sonuc_df["donem"], errors="coerce") == latest_donem].copy()
        latest["sicil"] = normalize_id_series(latest["sicil_no"])
        keep_cols = [
            "sicil", "adi_soyadi", "isletme_adi", "departman_adi",
            "il", "gorev", "kidem_yil",
        ]
        keep_cols = [c for c in keep_cols if c in latest.columns]
        if keep_cols:
            latest = latest[keep_cols].drop_duplicates(subset=["sicil"], keep="last")
            latest = latest.rename(
                columns={
                    "adi_soyadi": "isim_soyisim",
                    "isletme_adi": "mağaza",
                    "departman_adi": "bölge",
                    "kidem_yil": "kıdem_yılı",
                }
            )
            out = out.merge(latest, on="sicil", how="left")

    if performans_df is not None and not performans_df.empty:
        perf = performans_df.copy()
        perf_sicil_col = find_first_existing_col(perf, ["sicil", "sicil_no", "Kullanıcı Kodu", "Kullanici Kodu"])
        if perf_sicil_col and "performans_notu" in perf.columns:
            perf["sicil"] = normalize_id_series(perf[perf_sicil_col])
            if "donem" in perf.columns:
                perf["donem"] = pd.to_datetime(perf["donem"], errors="coerce")
                if sonuc_df is not None and not sonuc_df.empty and "donem" in sonuc_df.columns:
                    latest_donem = pd.to_datetime(sonuc_df["donem"], errors="coerce").max()
                    valid_perf = perf[perf["donem"] <= latest_donem].copy()
                    if not valid_perf.empty:
                        perf = valid_perf
                perf = perf.sort_values(["sicil", "donem"], ascending=[True, False], na_position="last")
            else:
                perf = perf.sort_values(["sicil"], na_position="last")
            perf = perf.drop_duplicates(subset=["sicil"], keep="first")[["sicil", "performans_notu"]]
            out = out.merge(perf, on="sicil", how="left")

    ordered_cols = [
        "sicil", "isim_soyisim", "mağaza", "bölge", "il",
        "gorev", "performans_notu", "kıdem_yılı", "durum_oran",
    ]
    remaining_cols = [c for c in out.columns if c not in ordered_cols]
    return out[[c for c in ordered_cols if c in out.columns] + remaining_cols]

def normalize_ust_bolum_series(s):
    """
    ust_bolum benzeri kolonlardaki bozuk Turkce metinleri duzeltir
    ve Magaza / Merkez / Edirne degerlerini standartlastirir.
    """
    out = s.astype("string").str.strip().map(repair_mojibake_text)

    def _compact_key(value):
        key = normalize_text_key(value)
        key = (
            key.replace("?", "g")
            .replace("?", "g")
            .replace("?", "g")
            .replace("??", "g")
            .replace("??", "g")
        )
        return re.sub(r"[^a-z0-9]+", "", key)

    key = out.map(_compact_key)
    out = out.where(~key.isin(["magaza", "maaza", "maggaza"]), "Ma\u011faza")
    out = out.where(~key.isin(["merkez"]), "Merkez")
    out = out.where(~key.isin(["edirne"]), "Edirne")
    return out

def parse_mixed_date(series, dayfirst=True):
    """
    Karma tarih formatlarını güvenli parse eder.
    - ISO (YYYY-MM-DD ...) formatlarını dayfirst olmadan parse eder
    - Diğer formatları dayfirst parametresiyle parse eder
    """
    if series is None:
        return series
    if pd.api.types.is_datetime64_any_dtype(series):
        return series
    s = series.astype("string").str.strip()
    # Date kolonlarında görülen metin işaretlerini parse öncesi null yap
    # (örn: yok / N/A / -) -> NaT, böylece infer uyarıları azalır.
    null_tokens = {"", "nan", "none", "nat", "n/a", "na", "-", "--", "yok"}
    s_lower = s.str.lower()
    s = s.mask(s_lower.isin(null_tokens))
    iso_mask = s.str.match(r"^\d{4}-\d{2}-\d{2}", na=False)
    # Pandas'in tek-format infer davranisi bazi mikrosaniyeli ISO degerleri NaT'a dusurebiliyor.
    # Bu nedenle mixed parse denenir; destek yoksa klasik parse'a geri donulur.
    try:
        parsed_iso = pd.to_datetime(
            s.where(iso_mask),
            errors="coerce",
            format="mixed",
        )
        parsed_other = pd.to_datetime(
            s.where(~iso_mask),
            dayfirst=dayfirst,
            errors="coerce",
            format="mixed",
        )
    except TypeError:
        parsed_iso = pd.to_datetime(s.where(iso_mask), errors="coerce")
        parsed_other = pd.to_datetime(s.where(~iso_mask), dayfirst=dayfirst, errors="coerce")
    return parsed_iso.fillna(parsed_other)

def standardize_output_df(df):
    """
    Çıktı tablolarında aynı anlama gelen kolonları aynı formatta tutar.
    - sicil/id alanlarını normalize eder
    - tarih alanlarını datetime yapar
    - metin alanlarındaki baş/son boşlukları temizler
    """
    if df is None or df.empty:
        return df

    for col in df.columns:
        col_lower = str(col).lower()
        if "sicil" in col_lower or "tc_kimlik" in col_lower:
            df[col] = normalize_id_series(df[col])
            continue
        if col_lower == "donem" or "tarih" in col_lower:
            df[col] = parse_mixed_date(df[col], dayfirst=True)
            continue
        if pd.api.types.is_object_dtype(df[col]) or pd.api.types.is_string_dtype(df[col]):
            # kod/ID gibi metin alanları zorla string kalsın
            if any(k in col_lower for k in ["kodu", "code", "no", "id", "telefon", "eposta", "email"]):
                df[col] = df[col].astype("string").str.strip()
                continue

            # numeric'e benziyorsa numeric olarak bırak
            numeric = pd.to_numeric(df[col], errors="coerce")
            ratio = numeric.notna().mean()
            if ratio >= 0.85:
                df[col] = numeric
            else:
                df[col] = df[col].astype("string").map(repair_mojibake_text).str.strip()

    return df


def _v2_safe_rate(numerator, denominator):
    numerator = pd.to_numeric(numerator, errors="coerce")
    denominator = pd.to_numeric(denominator, errors="coerce")
    return np.where(denominator > 0, numerator / denominator, np.nan)


def _v2_month_start(series):
    parsed = parse_mixed_date(series, dayfirst=True)
    return parsed.dt.to_period("M").dt.to_timestamp()


def _v2_series(df: pd.DataFrame, col: str, default=np.nan) -> pd.Series:
    if isinstance(df, pd.DataFrame) and col in df.columns:
        return df[col]
    return pd.Series(default, index=df.index if isinstance(df, pd.DataFrame) else None)


def _v2_perf_rank(frame: pd.DataFrame, score_col: str = "performans_skoru") -> pd.Series:
    score = pd.to_numeric(frame.get(score_col), errors="coerce")
    month_rank = score.groupby(frame["donem"]).rank(pct=True)
    return month_rank.fillna(score.rank(pct=True))


KARNE_SCORE_COLS = [
    "sd_satis",
    "sd_adet",
    "sd_upt",
    "sd_tds",
    "sd_fatura",
    "magaza_hgo",
    "magaza_nps",
    "magaza_kart_verme",
    "magaza_yeni_musteri",
]
KARNE_PERCENT_COLS = [f"{col}_yuzde" for col in KARNE_SCORE_COLS]
KARNE_OUTPUT_COLS = ["toplam_yuzde", "karne_kisi_sayisi", "karne_satir_sayisi", "karne_bilesen_sayisi"] + KARNE_PERCENT_COLS


def add_karne_yuzde_columns(kumule_df: pd.DataFrame) -> pd.DataFrame:
    """
    Rank puanli kumule karne alanlarini ay icindeki karne kisi sayisina bolerek
    0-1 arasi yuzdelik skora cevirir. Ham puan kolonlari korunur.

    Ornek: ayda 1250 karne kaydi varsa birinci kisi 1250/1250 = 1.0,
    ikinci kisi 1249/1250 = 0.9992 alir. Bazi dallarda bonus/agirlikli puan
    varsa oran 1.0 ustune cikabilir; bu degerleri audit edilebilir kalsin diye
    kirpmiyoruz. toplam_yuzde, toplam ham puanin kisi sayisi x bilesen sayisina
    bolunmus halidir.
    """
    if kumule_df is None or kumule_df.empty:
        return kumule_df

    out = kumule_df.copy()
    if "donem" not in out.columns:
        for col in KARNE_OUTPUT_COLS:
            if col not in out.columns:
                out[col] = np.nan
        return out

    month = parse_mixed_date(out["donem"], dayfirst=True).dt.to_period("M").dt.to_timestamp()
    out["_karne_month"] = month

    if "sicil" in out.columns:
        sicil_key = normalize_id_series(out["sicil"])
        out["_karne_sicil_key"] = sicil_key
        row_count = out.groupby("_karne_month")["_karne_sicil_key"].transform(
            lambda s: int(s.dropna().nunique())
        )
    else:
        row_count = out.groupby("_karne_month")["_karne_month"].transform("size")

    row_count = pd.to_numeric(row_count, errors="coerce").replace(0, np.nan)
    out["karne_satir_sayisi"] = row_count

    month_count = row_count
    out["karne_kisi_sayisi"] = month_count

    for col in KARNE_SCORE_COLS:
        pct_col = f"{col}_yuzde"
        if col in out.columns:
            out[pct_col] = pd.to_numeric(out[col], errors="coerce") / month_count
        elif pct_col not in out.columns:
            out[pct_col] = np.nan

    existing_pct_cols = [c for c in KARNE_PERCENT_COLS if c in out.columns]
    if existing_pct_cols:
        component_count = out[existing_pct_cols].notna().sum(axis=1).replace(0, np.nan)
        out["karne_bilesen_sayisi"] = component_count
        component_avg = out[existing_pct_cols].mean(axis=1)
    else:
        out["karne_bilesen_sayisi"] = np.nan
        component_avg = pd.Series(np.nan, index=out.index)

    if "toplam" in out.columns:
        total_denom = month_count * pd.to_numeric(out["karne_bilesen_sayisi"], errors="coerce")
        total_pct = (pd.to_numeric(out["toplam"], errors="coerce") / total_denom).clip(0, 1)
        out["toplam_yuzde"] = total_pct.combine_first(component_avg)
    else:
        out["toplam_yuzde"] = component_avg

    out = out.drop(columns=[c for c in ["_karne_month", "_karne_sicil_key"] if c in out.columns])
    return out


def build_regrettable_turnover_v2(sonuc_df: pd.DataFrame, performans_df: pd.DataFrame | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    V2: Yüksek performanslı çalışan çıkışlarını ayrı izler.

    Tanım:
    - Kapsam: sadece ust_bolum = "Mağaza"
    - Çıkış: cikis > 0
    - Performans skoru: performans_magaza_verileri.performans_notu varsa kişinin ilgili aya
      kadar bilinen son performans notu, yoksa Sonuc.toplam
    - Regrettable sinyal: Mağaza kapsamında aynı ay içindeki performans percentile >= %75
    """
    if sonuc_df is None or sonuc_df.empty or "donem" not in sonuc_df.columns:
        return pd.DataFrame(), pd.DataFrame()

    work_cols = [
        "donem", "sicil_no", "adi_soyadi", "ust_bolum", "departman_adi", "isletme_adi",
        "gorev", "unvan", "kadro_adi", "cikis", "reel_isten_cikis", "calisan_sayisi",
        "cikis_tarihi", "ise_giris_tarihi", "kidem_yil", "toplam_yuzde", "toplam",
    ]
    work_cols = [c for c in work_cols if c in sonuc_df.columns]
    work = sonuc_df[work_cols].copy()
    work["donem"] = _v2_month_start(work["donem"])
    work = work[work["donem"].notna()].copy()
    if work.empty:
        return pd.DataFrame(), pd.DataFrame()
    work["sicil_key"] = normalize_id_series(work.get("sicil_no", pd.Series(index=work.index, dtype="object")))
    work["ust_bolum"] = normalize_ust_bolum_series(work.get("ust_bolum", pd.Series(index=work.index, dtype="object")))
    # Kullanıcı kararı: Regrettable Turnover V2 sadece mağaza çalışanlarını kapsar.
    # Eski turnover/risk sayfalarına dokunmuyoruz; bu filtre yalnızca V2 sheet ve V2 dashboard sayfası içindir.
    work = work[work["ust_bolum"].eq("Mağaza")].copy()
    if work.empty:
        return pd.DataFrame(), pd.DataFrame()
    work["cikis"] = pd.to_numeric(
        _v2_series(work, "cikis", _v2_series(work, "reel_isten_cikis", 0)),
        errors="coerce",
    ).fillna(0)
    work["calisan_sayisi"] = pd.to_numeric(_v2_series(work, "calisan_sayisi", 0), errors="coerce").fillna(0)
    work["performans_skoru"] = pd.to_numeric(_v2_series(work, "toplam_yuzde", np.nan), errors="coerce")
    work["performans_kaynak"] = np.where(work["performans_skoru"].notna(), "Sonuc.toplam_yuzde", pd.NA)
    if "toplam" in work.columns:
        raw_score = pd.to_numeric(work["toplam"], errors="coerce")
        raw_missing = work["performans_skoru"].isna() & raw_score.notna()
        work.loc[raw_missing, "performans_skoru"] = raw_score[raw_missing]
        work.loc[raw_missing, "performans_kaynak"] = "Sonuc.toplam"

    if performans_df is not None and not performans_df.empty:
        perf = performans_df.copy()
        sicil_col = find_first_existing_col(perf, ["sicil", "sicil_no", "Sicil"])
        if sicil_col and "performans_notu" in perf.columns:
            perf["sicil_key"] = normalize_id_series(perf[sicil_col])
            if "donem" in perf.columns:
                perf["donem"] = _v2_month_start(perf["donem"])
                perf = perf.dropna(subset=["donem", "sicil_key"]).copy()
                perf["performans_notu"] = pd.to_numeric(perf["performans_notu"], errors="coerce")
                perf = (
                    perf.sort_values(["sicil_key", "donem"])
                    .drop_duplicates(subset=["donem", "sicil_key"], keep="last")
                )
                perf = perf[["donem", "sicil_key", "performans_notu"]].dropna(subset=["performans_notu"])
                if not perf.empty:
                    # Performans notu her ay gelmeyebilir. V2 için aynı ay yoksa kişinin
                    # ilgili aya kadar bilinen son performans notunu kullanıyoruz.
                    left = (
                        work.reset_index()
                        .sort_values(["donem", "sicil_key"])
                        [["index", "donem", "sicil_key"]]
                    )
                    right = (
                        perf.rename(columns={"donem": "performans_donem"})
                        .sort_values(["performans_donem", "sicil_key"])
                    )
                    asof = pd.merge_asof(
                        left,
                        right,
                        left_on="donem",
                        right_on="performans_donem",
                        by="sicil_key",
                        direction="backward",
                        allow_exact_matches=True,
                    ).set_index("index")
                    perf_score = pd.to_numeric(asof["performans_notu"], errors="coerce").reindex(work.index)
                    work["performans_donem"] = asof["performans_donem"].reindex(work.index)
                    work["performans_skoru"] = perf_score.combine_first(work["performans_skoru"])
                    work["performans_kaynak"] = np.where(
                        perf_score.notna(),
                        "performans_magaza_verileri.son_bilinen_performans_notu",
                        work["performans_kaynak"],
                    )

    work["performans_percentile"] = _v2_perf_rank(work, "performans_skoru")
    work["is_high_performer"] = work["performans_percentile"] >= 0.75
    work["is_exit"] = work["cikis"] > 0
    work["is_regrettable_exit"] = work["is_exit"] & work["is_high_performer"]

    def summarize_scope(src: pd.DataFrame, scope: str) -> pd.DataFrame:
        if src.empty:
            return pd.DataFrame()
        out = (
            src.groupby(["donem"], dropna=False)
            .agg(
                ortalama_headcount=("calisan_sayisi", "sum"),
                toplam_cikis=("is_exit", "sum"),
                regrettable_cikis=("is_regrettable_exit", "sum"),
                high_perf_headcount=("is_high_performer", "sum"),
                performans_verisi_olan=("performans_skoru", lambda s: int(s.notna().sum())),
            )
            .reset_index()
        )
        out["scope"] = scope
        out["regrettable_turnover_rate"] = _v2_safe_rate(out["regrettable_cikis"], out["ortalama_headcount"])
        out["high_perf_attrition_rate"] = _v2_safe_rate(out["regrettable_cikis"], out["high_perf_headcount"])
        out["regrettable_share_of_exits"] = _v2_safe_rate(out["regrettable_cikis"], out["toplam_cikis"])
        out["data_quality"] = _v2_safe_rate(out["performans_verisi_olan"], out["ortalama_headcount"])
        return out

    summary_parts = [summarize_scope(work, "Mağaza")]
    summary = pd.concat([p for p in summary_parts if p is not None and not p.empty], ignore_index=True) if summary_parts else pd.DataFrame()
    if not summary.empty:
        summary["year"] = summary["donem"].dt.year
        summary["month_num"] = summary["donem"].dt.month
        summary = summary[
            [
                "donem", "year", "month_num", "scope", "ortalama_headcount",
                "toplam_cikis", "regrettable_cikis", "high_perf_headcount",
                "regrettable_turnover_rate", "high_perf_attrition_rate",
                "regrettable_share_of_exits", "performans_verisi_olan", "data_quality",
            ]
        ].sort_values(["donem", "scope"])

    detail = work[work["is_regrettable_exit"]].copy()
    detail_cols = [
        "donem", "sicil_no", "adi_soyadi", "ust_bolum", "departman_adi", "isletme_adi",
        "gorev", "unvan", "kadro_adi", "cikis_tarihi", "ise_giris_tarihi", "kidem_yil",
        "performans_skoru", "performans_percentile", "performans_kaynak", "performans_donem",
    ]
    detail_cols = [c for c in detail_cols if c in detail.columns]
    detail = detail[detail_cols].sort_values(["donem", "ust_bolum", "performans_percentile"], ascending=[True, True, False])
    return summary, detail


def build_burnout_index_v2(sonuc_df: pd.DataFrame, isgucu_kaybi_ozet: pd.DataFrame | None = None) -> pd.DataFrame:
    """
    V2: Bireysel tanı değil, lokasyon seviyesinde operasyonel yük sinyali.

    Skor = fazla mesai kişi başı * 0.40 + izin yükü oranı * 0.40 + eksik SGK gün proxy'si * 0.20.
    Bileşenler percentile rank ile 0-1 aralığına çekilir.
    """
    if sonuc_df is None or sonuc_df.empty or "donem" not in sonuc_df.columns:
        return pd.DataFrame()
    work_cols = ["donem", "ust_bolum", "calisan_sayisi", "fazla_mesai_toplam", "sgk_gun"]
    work_cols = [c for c in work_cols if c in sonuc_df.columns]
    work = sonuc_df[work_cols].copy()
    work["donem"] = _v2_month_start(work["donem"])
    work["ust_bolum"] = normalize_ust_bolum_series(work.get("ust_bolum", pd.Series(index=work.index, dtype="object")))
    work = work[work["donem"].notna() & work["ust_bolum"].notna()].copy()
    if work.empty:
        return pd.DataFrame()
    work["calisan_sayisi"] = pd.to_numeric(_v2_series(work, "calisan_sayisi", 0), errors="coerce").fillna(0)
    work["fazla_mesai_toplam"] = pd.to_numeric(_v2_series(work, "fazla_mesai_toplam", 0), errors="coerce").fillna(0)
    work["sgk_gun"] = pd.to_numeric(_v2_series(work, "sgk_gun", 0), errors="coerce").fillna(0)

    grouped = (
        work.groupby(["donem", "ust_bolum"], dropna=False, as_index=False)
        .agg(
            ortalama_headcount=("calisan_sayisi", "sum"),
            fazla_mesai_saat=("fazla_mesai_toplam", "sum"),
            toplam_sgk_gun=("sgk_gun", "sum"),
        )
    )
    grouped["fazla_mesai_kisi_basi"] = _v2_safe_rate(grouped["fazla_mesai_saat"], grouped["ortalama_headcount"])
    expected_sgk = grouped["ortalama_headcount"] * 30
    grouped["eksik_sgk_gun"] = np.maximum(expected_sgk - grouped["toplam_sgk_gun"], 0)
    grouped["eksik_kadro_proxy"] = _v2_safe_rate(grouped["eksik_sgk_gun"], expected_sgk)

    if isgucu_kaybi_ozet is not None and not isgucu_kaybi_ozet.empty and {"donem", "ust_bolum", "isgucu_kaybi"}.issubset(isgucu_kaybi_ozet.columns):
        leave = isgucu_kaybi_ozet[["donem", "ust_bolum", "isgucu_kaybi"]].copy()
        leave["donem"] = _v2_month_start(leave["donem"])
        leave["ust_bolum"] = normalize_ust_bolum_series(leave["ust_bolum"])
        leave["izin_yuku_orani"] = pd.to_numeric(leave["isgucu_kaybi"], errors="coerce")
        leave = leave.drop_duplicates(subset=["donem", "ust_bolum"], keep="last")[["donem", "ust_bolum", "izin_yuku_orani"]]
        grouped = grouped.merge(leave, on=["donem", "ust_bolum"], how="left")
    else:
        grouped["izin_yuku_orani"] = np.nan

    genel = (
        grouped.groupby("donem", as_index=False)
        .agg(
            ortalama_headcount=("ortalama_headcount", "sum"),
            fazla_mesai_saat=("fazla_mesai_saat", "sum"),
            toplam_sgk_gun=("toplam_sgk_gun", "sum"),
            eksik_sgk_gun=("eksik_sgk_gun", "sum"),
            izin_yuku_orani=("izin_yuku_orani", "mean"),
        )
    )
    genel["ust_bolum"] = "Aurelia Group"
    genel["fazla_mesai_kisi_basi"] = _v2_safe_rate(genel["fazla_mesai_saat"], genel["ortalama_headcount"])
    expected_genel = genel["ortalama_headcount"] * 30
    genel["eksik_kadro_proxy"] = _v2_safe_rate(genel["eksik_sgk_gun"], expected_genel)

    out = pd.concat([grouped, genel], ignore_index=True, sort=False)
    for src, dst in [
        ("fazla_mesai_kisi_basi", "fazla_mesai_skoru"),
        ("izin_yuku_orani", "izin_yuku_skoru"),
        ("eksik_kadro_proxy", "eksik_kadro_skoru"),
    ]:
        out[dst] = pd.to_numeric(out[src], errors="coerce").rank(pct=True)

    component_defs = [("fazla_mesai_skoru", 0.40), ("izin_yuku_skoru", 0.40), ("eksik_kadro_skoru", 0.20)]
    weighted_sum = pd.Series(0.0, index=out.index)
    used_weight = pd.Series(0.0, index=out.index)
    for col, weight in component_defs:
        vals = pd.to_numeric(out[col], errors="coerce")
        mask = vals.notna()
        weighted_sum.loc[mask] += vals.loc[mask] * weight
        used_weight.loc[mask] += weight
    out["operasyonel_yuk_skoru"] = np.where(used_weight > 0, weighted_sum / used_weight * 100, np.nan)
    out["veri_kapsam_agirligi"] = used_weight
    out["risk_seviyesi"] = pd.cut(
        out["operasyonel_yuk_skoru"],
        bins=[-np.inf, 30, 55, 75, np.inf],
        labels=["Düşük", "Orta", "Yüksek", "Kritik"],
    ).astype("string")
    out["year"] = out["donem"].dt.year
    out["month_num"] = out["donem"].dt.month
    keep_cols = [
        "donem", "year", "month_num", "ust_bolum", "ortalama_headcount",
        "fazla_mesai_saat", "fazla_mesai_kisi_basi", "izin_yuku_orani",
        "eksik_sgk_gun", "eksik_kadro_proxy", "fazla_mesai_skoru",
        "izin_yuku_skoru", "eksik_kadro_skoru", "operasyonel_yuk_skoru",
        "risk_seviyesi", "veri_kapsam_agirligi",
    ]
    return out[keep_cols].sort_values(["donem", "operasyonel_yuk_skoru"], ascending=[True, False])


def _km_curve_for_group(src: pd.DataFrame, label: str, max_month: int = 120) -> tuple[pd.DataFrame, dict]:
    if src.empty:
        return pd.DataFrame(), {"scope": label, "n": 0}
    durations = pd.to_numeric(src["duration_months"], errors="coerce").clip(lower=0)
    events = pd.to_numeric(src["event_exit"], errors="coerce").fillna(0).astype(int)
    valid = durations.notna()
    durations = durations[valid]
    events = events[valid]
    if durations.empty:
        return pd.DataFrame(), {"scope": label, "n": 0}
    time_bin = np.ceil(durations).astype(int).clip(lower=0, upper=max_month)
    survival = 1.0
    rows = [{"scope": label, "tenure_month": 0, "at_risk": int(len(time_bin)), "events": 0, "censored": 0, "survival_probability": 1.0}]
    event_times = sorted(set(time_bin[events == 1].tolist()))
    for t in event_times:
        at_risk = int((time_bin >= t).sum())
        event_count = int(((time_bin == t) & (events == 1)).sum())
        censored_count = int(((time_bin == t) & (events == 0)).sum())
        if at_risk > 0:
            survival *= max(0.0, 1.0 - (event_count / at_risk))
        rows.append(
            {
                "scope": label,
                "tenure_month": int(t),
                "at_risk": at_risk,
                "events": event_count,
                "censored": censored_count,
                "survival_probability": float(survival),
            }
        )
    curve = pd.DataFrame(rows)

    def survival_at(month: int) -> float:
        eligible = curve[curve["tenure_month"] <= month]
        return float(eligible["survival_probability"].iloc[-1]) if not eligible.empty else 1.0

    summary = {
        "scope": label,
        "n": int(len(time_bin)),
        "events": int(events.sum()),
        "censored": int((events == 0).sum()),
        "survival_3m": survival_at(3),
        "survival_6m": survival_at(6),
        "survival_12m": survival_at(12),
        "survival_24m": survival_at(24),
        "survival_36m": survival_at(36),
        "survival_60m": survival_at(60),
        "median_duration_months": float(durations.median()),
    }
    return curve, summary


def build_survival_analysis_v2(sonuc_df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """V2 Kaplan-Meier tipi elde kalma analizi. CoxPH için hazır temel tablo da üretir."""
    if sonuc_df is None or sonuc_df.empty or not {"sicil_no", "donem"}.issubset(sonuc_df.columns):
        return pd.DataFrame(), pd.DataFrame(), pd.DataFrame()
    cols = [
        "sicil_no", "adi_soyadi", "donem", "ust_bolum", "departman_adi", "isletme_adi",
        "gorev", "unvan", "ise_giris_tarihi", "cikis_tarihi", "cikis", "reel_isten_cikis",
        "kidem_yil", "yas", "kusak_aralik",
    ]
    cols = [c for c in cols if c in sonuc_df.columns]
    work = sonuc_df[cols].copy()
    work["sicil_key"] = normalize_id_series(work["sicil_no"])
    work["donem"] = _v2_month_start(work["donem"])
    work = work[work["sicil_key"].notna() & work["donem"].notna()].copy()
    if work.empty:
        return pd.DataFrame(), pd.DataFrame(), pd.DataFrame()
    work["ise_giris_tarihi"] = parse_mixed_date(_v2_series(work, "ise_giris_tarihi", pd.NaT), dayfirst=True)
    work["cikis_tarihi"] = parse_mixed_date(_v2_series(work, "cikis_tarihi", pd.NaT), dayfirst=True)
    work["cikis"] = pd.to_numeric(
        _v2_series(work, "cikis", _v2_series(work, "reel_isten_cikis", 0)),
        errors="coerce",
    ).fillna(0)
    work["ust_bolum"] = normalize_ust_bolum_series(work.get("ust_bolum", pd.Series(index=work.index, dtype="object")))

    latest_period = work["donem"].max()
    observation_end = latest_period + pd.offsets.MonthEnd(1)
    base_rows = []
    for _sicil, group in work.sort_values(["sicil_key", "donem"]).groupby("sicil_key", sort=False):
        start = group["ise_giris_tarihi"].dropna().min()
        if pd.isna(start):
            start = group["donem"].min()
        exit_rows = group[group["cikis"] > 0].copy()
        event_exit = int(not exit_rows.empty)
        if event_exit:
            exit_date = exit_rows["cikis_tarihi"].dropna().min()
            if pd.isna(exit_date):
                exit_date = exit_rows["donem"].min() + pd.offsets.MonthEnd(1)
            end_date = exit_date
        else:
            exit_date = pd.NaT
            end_date = observation_end
        if pd.isna(start) or pd.isna(end_date) or end_date < start:
            continue
        latest = group.iloc[-1]
        duration_months = max(0.0, (end_date - start).days / 30.4375)
        base_rows.append(
            {
                "sicil_no": latest.get("sicil_no"),
                "adi_soyadi": latest.get("adi_soyadi"),
                "ust_bolum": latest.get("ust_bolum"),
                "departman_adi": latest.get("departman_adi"),
                "isletme_adi": latest.get("isletme_adi"),
                "gorev": latest.get("gorev"),
                "unvan": latest.get("unvan"),
                "ise_giris_tarihi": start,
                "cikis_tarihi": exit_date,
                "observation_end": observation_end,
                "event_exit": event_exit,
                "duration_months": duration_months,
                "kidem_yil": latest.get("kidem_yil"),
                "yas": latest.get("yas"),
                "kusak_aralik": latest.get("kusak_aralik"),
            }
        )
    base = pd.DataFrame(base_rows)
    if base.empty:
        return pd.DataFrame(), pd.DataFrame(), pd.DataFrame()

    curves = []
    summaries = []
    curve, summary = _km_curve_for_group(base, "Aurelia Group")
    curves.append(curve)
    summaries.append(summary)
    for scope, group in base.groupby("ust_bolum", dropna=False):
        scope_name = str(scope).strip()
        if not scope_name or scope_name.lower() == "nan":
            continue
        curve, summary = _km_curve_for_group(group, scope_name)
        curves.append(curve)
        summaries.append(summary)

    curve_df = pd.concat([c for c in curves if c is not None and not c.empty], ignore_index=True) if curves else pd.DataFrame()
    summary_df = pd.DataFrame(summaries)
    return curve_df, summary_df, base


def analyze_missing_data(df, kumule_cols, threshold=0.3):
    """
    Eksik veri oranlarını raporlar ve önerilen stratejiyi döner.
    """
    missing_report = {}
    total = len(df)
    if total == 0:
        return missing_report

    print("📊 Eksik Veri Analizi:")
    print("-" * 70)
    for col in kumule_cols:
        if col not in df.columns:
            continue
        missing = df[col].isna().sum()
        missing_ratio = missing / total
        strategy = "hiyerarşik" if missing_ratio < threshold else "knn"
        missing_report[col] = {
            "toplam_kayit": total,
            "eksik_kayit": missing,
            "eksik_oran": missing_ratio,
            "strateji": strategy,
        }
        print(f"{col:30s} | Eksik: {missing:4d} ({missing_ratio*100:5.1f}%) | Strateji: {strategy}")
    print("-" * 70)
    return missing_report

def hierarchical_fill(score_df, reference_df, col):
    """
    Hiyerarşik doldurma: Kişi → Mağaza+Dönem → Departman+Dönem → Şirket+Dönem → Genel.
    """
    initial_missing = score_df[col].isna().sum()
    if initial_missing == 0:
        return score_df

    print(f"\n🔄 {col} dolduruluyor (Hiyerarşik)...")
    print(f"   Başlangıç eksik: {initial_missing}")
    filled_count = 0
    original_missing = initial_missing

    # 1) Kişi ortalaması
    if "sicil_no" in score_df.columns and "sicil_no" in reference_df.columns:
        person_avg = reference_df.groupby("sicil_no")[col].mean()
        mask = score_df[col].isna()
        score_df.loc[mask, col] = score_df.loc[mask, "sicil_no"].map(person_avg)
        filled = original_missing - score_df[col].isna().sum()
        filled_count += filled
        print(f"   ✅ Seviye 1 (Kişi): {filled} kayıt dolduruldu")
        original_missing = score_df[col].isna().sum()

    # 2) Mağaza + Dönem ortalaması
    if {"donem", "isletme_adi"}.issubset(score_df.columns) and {"donem", "isletme_adi"}.issubset(reference_df.columns):
        store_avg = reference_df.groupby(["donem", "isletme_adi"])[col].mean()
        mask = score_df[col].isna()
        if mask.any():
            key = pd.MultiIndex.from_frame(score_df.loc[mask, ["donem", "isletme_adi"]])
            score_df.loc[mask, col] = store_avg.reindex(key).to_numpy()
            filled = original_missing - score_df[col].isna().sum()
            filled_count += filled
            print(f"   ✅ Seviye 2 (Mağaza+Dönem): {filled} kayıt dolduruldu")
            original_missing = score_df[col].isna().sum()

    # 3) Departman + Dönem ortalaması
    if {"donem", "departman_adi"}.issubset(score_df.columns) and {"donem", "departman_adi"}.issubset(reference_df.columns):
        dept_avg = reference_df.groupby(["donem", "departman_adi"])[col].mean()
        mask = score_df[col].isna()
        if mask.any():
            key = pd.MultiIndex.from_frame(score_df.loc[mask, ["donem", "departman_adi"]])
            score_df.loc[mask, col] = dept_avg.reindex(key).to_numpy()
            filled = original_missing - score_df[col].isna().sum()
            filled_count += filled
            print(f"   ✅ Seviye 3 (Departman+Dönem): {filled} kayıt dolduruldu")
            original_missing = score_df[col].isna().sum()

    # 3b) Bölüm + Dönem ortalaması (varsa)
    if {"donem", "bolum_adi"}.issubset(score_df.columns) and {"donem", "bolum_adi"}.issubset(reference_df.columns):
        bolum_avg = reference_df.groupby(["donem", "bolum_adi"])[col].mean()
        mask = score_df[col].isna()
        if mask.any():
            key = pd.MultiIndex.from_frame(score_df.loc[mask, ["donem", "bolum_adi"]])
            score_df.loc[mask, col] = bolum_avg.reindex(key).to_numpy()
            filled = original_missing - score_df[col].isna().sum()
            filled_count += filled
            print(f"   ✅ Seviye 3b (Bölüm+Dönem): {filled} kayıt dolduruldu")
            original_missing = score_df[col].isna().sum()

    # 4) Şirket + Dönem ortalaması
    if "donem" in score_df.columns and "donem" in reference_df.columns:
        company_avg = reference_df.groupby("donem")[col].mean()
        mask = score_df[col].isna()
        if mask.any():
            score_df.loc[mask, col] = score_df.loc[mask, "donem"].map(company_avg)
            filled = original_missing - score_df[col].isna().sum()
            filled_count += filled
            print(f"   ✅ Seviye 4 (Şirket+Dönem): {filled} kayıt dolduruldu")
            original_missing = score_df[col].isna().sum()

    # 5) Genel ortalama
    global_avg = reference_df[col].mean()
    if not pd.isna(global_avg):
        mask = score_df[col].isna()
        if mask.any():
            score_df.loc[mask, col] = global_avg
            filled = original_missing - score_df[col].isna().sum()
            filled_count += filled
            print(f"   ✅ Seviye 5 (Genel): {filled} kayıt dolduruldu")

    final_missing = score_df[col].isna().sum()
    print(f"   📊 Toplam dolduruldu: {filled_count} / {initial_missing}")
    print(f"   📊 Kalan eksik: {final_missing}")
    return score_df

def knn_fill(score_df, reference_df, col, n_neighbors=5, max_rows=5000, max_categories=20):
    """
    KNN ile doldurma: benzer çalışanlardan öğren.
    """
    if not SKLEARN_AVAILABLE:
        print("⚠️ KNN için scikit-learn bulunamadı, hiyerarşik doldurma uygulanacak.")
        return hierarchical_fill(score_df, reference_df, col)

    if len(reference_df) > max_rows or len(score_df) > max_rows:
        print(f"⚠️ KNN için veri çok büyük (ref={len(reference_df)}, score={len(score_df)}). Hiyerarşik doldurma uygulanacak.")
        return hierarchical_fill(score_df, reference_df, col)

    original_missing = score_df[col].isna().sum()
    if original_missing == 0:
        return score_df

    print(f"\n🤖 {col} dolduruluyor (KNN)...")
    print(f"   Başlangıç eksik: {original_missing}")

    try:
        from sklearn.impute import KNNImputer
    except Exception:
        print("⚠️ KNNImputer import edilemedi, hiyerarşik doldurma uygulanacak.")
        return hierarchical_fill(score_df, reference_df, col)

    # KNN için kullanılacak sayısal özellikler
    feature_cols = [
        "kidem_yil", "yas", "ucret_ve_kasa_tazminati",
        "satis_akademisi_katilim_sayisi", "toplam", "prim_toplam"
    ]
    feature_cols = [c for c in feature_cols if c in score_df.columns and c in reference_df.columns]

    if not feature_cols:
        print("⚠️ KNN için yeterli özellik yok, hiyerarşik doldurma uygulanacak.")
        return hierarchical_fill(score_df, reference_df, col)

    # Kategorik özellikler
    categorical_cols = ["gorev", "unvan", "cinsiyet", "kusak_aralik", "magaza_kırılım", "kısa_gorev", "calısma_sekli"]
    categorical_cols = [c for c in categorical_cols if c in score_df.columns and c in reference_df.columns]

    def _prepare_matrix(df_local):
        df_num = df_local[feature_cols].copy()
        for c in feature_cols:
            s = pd.to_numeric(df_num[c], errors="coerce")
            med = s.median()
            iqr = s.quantile(0.75) - s.quantile(0.25)
            if pd.isna(iqr) or iqr == 0:
                df_num[c] = s - med
            else:
                df_num[c] = (s - med) / iqr

        if categorical_cols:
            df_cat = df_local[categorical_cols].astype("string").fillna("MISSING")
            for c in categorical_cols:
                top = df_cat[c].value_counts().head(max_categories).index
                df_cat[c] = df_cat[c].where(df_cat[c].isin(top), "OTHER")
            dummies = pd.get_dummies(df_cat, prefix=categorical_cols, drop_first=False)
            return pd.concat([df_num, dummies], axis=1)

        return df_num

    ref_matrix = _prepare_matrix(reference_df)
    score_matrix = _prepare_matrix(score_df)

    # Hedef kolonu ekle
    ref_matrix[col] = pd.to_numeric(reference_df[col], errors="coerce")
    score_matrix[col] = pd.to_numeric(score_df[col], errors="coerce")

    # Kolon hizalama
    ref_matrix, score_matrix = ref_matrix.align(score_matrix, join="outer", axis=1)

    imputer = KNNImputer(n_neighbors=n_neighbors, weights="distance", metric="nan_euclidean")
    imputer.fit(ref_matrix)
    imputed = imputer.transform(score_matrix)

    col_idx = list(score_matrix.columns).index(col)
    score_df[col] = imputed[:, col_idx]

    # Negatif değerleri engelle (performans metrikleri negatif olmamalı)
    score_df[col] = score_df[col].clip(lower=0)

    final_missing = score_df[col].isna().sum()
    filled = original_missing - final_missing
    print(f"   ✅ KNN ile dolduruldu: {filled} kayıt")
    print(f"   📊 Kalan eksik: {final_missing}")
    return score_df

def smart_fill_kumule_values(score_df, reference_df, kumule_cols, threshold=0.3):
    """
    Eksik veri oranına göre hiyerarşik veya KNN doldurma uygular.
    """
    if score_df is None or score_df.empty:
        return score_df

    if reference_df is None or reference_df.empty:
        print("⚠️ Referans veri boş. Basit hiyerarşik doldurma uygulanacak.")
        for col in kumule_cols:
            if col in score_df.columns:
                score_df = hierarchical_fill(score_df, score_df, col)
        return score_df

    missing_report = analyze_missing_data(score_df, kumule_cols, threshold=threshold)

    # Dinamik n_neighbors seçimi
    ref_size = len(reference_df)
    if ref_size < 100:
        n_neighbors = 3
    elif ref_size < 500:
        n_neighbors = 5
    else:
        n_neighbors = 7

    for col in kumule_cols:
        if col not in score_df.columns:
            continue
        if col not in missing_report:
            continue

        missing_ratio = missing_report[col]["eksik_oran"]
        if missing_ratio == 0:
            print(f"\n✅ {col}: Eksik veri yok, atlanıyor")
            continue

        if missing_ratio < threshold:
            score_df = hierarchical_fill(score_df, reference_df, col)
        else:
            score_df = knn_fill(score_df, reference_df, col, n_neighbors=n_neighbors)

    print("\n" + "=" * 70)
    print("📊 DOLDURMA SONUÇLARI")
    print("=" * 70)
    for col in kumule_cols:
        if col not in score_df.columns or col not in missing_report:
            continue
        final_missing = score_df[col].isna().sum()
        original_missing = missing_report[col]["eksik_kayit"]
        filled = original_missing - final_missing
        success_rate = (filled / original_missing * 100) if original_missing > 0 else 100
        print(f"{col:30s} | Dolduruldu: {filled:4d}/{original_missing:4d} ({success_rate:5.1f}%) | Kalan: {final_missing:4d}")
    print("=" * 70)

    return score_df

def add_turnover_ratios_to_result(df, turnover_ust_bolum, turnover_bolum_adi, genel_turnover):
    """Sonuç DataFrame'ine turnover oranlarını ekler"""
    df = df.copy()

    # Dönem bazlı genel turnover
    genel_turnover_map = genel_turnover.set_index("donem")["turnover1"].to_dict()
    df.loc[:, "genel_turnover"] = df["donem"].map(genel_turnover_map)

    # Üst bölüm bazlı turnover
    if "ust_bolum" in df.columns and not turnover_ust_bolum.empty:
        ust_lookup_df = turnover_ust_bolum[["donem", "ust_bolum", "turnover1"]].dropna(subset=["donem", "ust_bolum"])
        if not ust_lookup_df.empty:
            ust_lookup_df = ust_lookup_df.copy()
            ust_lookup_df["lookup_key"] = (
                ust_lookup_df["donem"].astype(str).str.strip()
                + "__"
                + ust_lookup_df["ust_bolum"].astype(str).str.strip()
            )
            ust_lookup = ust_lookup_df.drop_duplicates("lookup_key").set_index("lookup_key")["turnover1"]
            ust_key = (
                df["donem"].astype(str).str.strip()
                + "__"
                + df["ust_bolum"].fillna("").astype(str).str.strip()
            )
            df.loc[:, "ust_bolum_turnover"] = ust_key.map(ust_lookup)

    # Bölüm bazlı turnover
    if "bolum_adi" in df.columns and not turnover_bolum_adi.empty:
        bolum_lookup_df = turnover_bolum_adi[["donem", "bolum_adi", "turnover1"]].dropna(subset=["donem", "bolum_adi"])
        if not bolum_lookup_df.empty:
            bolum_lookup_df = bolum_lookup_df.copy()
            bolum_lookup_df["lookup_key"] = (
                bolum_lookup_df["donem"].astype(str).str.strip()
                + "__"
                + bolum_lookup_df["bolum_adi"].astype(str).str.strip()
            )
            bolum_lookup = bolum_lookup_df.drop_duplicates("lookup_key").set_index("lookup_key")["turnover1"]
            bolum_key = (
                df["donem"].astype(str).str.strip()
                + "__"
                + df["bolum_adi"].fillna("").astype(str).str.strip()
            )
            df.loc[:, "bolum_turnover"] = bolum_key.map(bolum_lookup)

    return df

def calculate_store_risk_scores(magaza_2025, latest_donem, target_col="cikis"):
    """Magaza calisanlari icin aciklanabilir risk skoru hesapla."""
    if magaza_2025 is None or magaza_2025.empty:
        return None

    # Sadece belirsiz sureli calisanlari skora dahil et.
    if "kadro_adi" in magaza_2025.columns:
        kadro_norm = magaza_2025["kadro_adi"].apply(normalize_text_key)
        magaza_ml = magaza_2025[kadro_norm == "belirsiz sureli"].copy()
    else:
        magaza_ml = magaza_2025.copy()

    if magaza_ml.empty:
        print("Uyari: Magaza ML icin 'Belirsiz Sureli' kaydi bulunamadi.")
        return None

    if "donem" in magaza_ml.columns:
        magaza_ml["donem"] = parse_mixed_date(magaza_ml["donem"], dayfirst=True)
    magaza_2025 = magaza_2025.copy()
    if "donem" in magaza_2025.columns:
        magaza_2025["donem"] = parse_mixed_date(magaza_2025["donem"], dayfirst=True)

    if target_col not in magaza_ml.columns:
        target_col = "cikis" if "cikis" in magaza_ml.columns else None
        if target_col is None:
            print("Uyari: Magaza riski icin hedef kolon bulunamadi.")
            return None

    magaza_ml[target_col] = pd.to_numeric(magaza_ml[target_col], errors="coerce").fillna(0).astype(int)

    latest_donem = pd.to_datetime(latest_donem, errors="coerce")
    if pd.isna(latest_donem):
        latest_donem = magaza_ml["donem"].max()

    train_df = magaza_ml[magaza_ml["donem"] < latest_donem].copy()
    score_df = magaza_ml[magaza_ml["donem"] == latest_donem].copy()
    if score_df.empty:
        latest_donem = magaza_ml["donem"].max()
        score_df = magaza_ml[magaza_ml["donem"] == latest_donem].copy()
        train_df = magaza_ml[magaza_ml["donem"] < latest_donem].copy()
    if score_df.empty:
        print("Uyari: Skorlama donemi verisi bulunamadi.")
        return None

    numeric_features = [
        c for c in [
            "yas", "kidem_yil", "ucret_ve_kasa_tazminati",
            "prim_toplam", "izleme_dk", "toplam_yuzde", "toplam2_yuzde",
            "satis_akademisi_katilim_sayisi",
            "sd_satis_yuzde", "sd_adet_yuzde", "sd_upt_yuzde", "sd_tds_yuzde", "sd_fatura_yuzde",
            "magaza_hgo_yuzde", "magaza_nps_yuzde", "magaza_kart_verme_yuzde", "magaza_yeni_musteri_yuzde",
            "ciro_hedef", "omni_ciro", "hgo",
        ] if c in magaza_ml.columns
    ]
    categorical_feature_candidates = [
        ["cinsiyet"],
        ["il"],
        ["gorev"],
        ["unvan"],
        ["magaza_title"],
        ["magaza_kırılım", "magaza_kirilim", "magaza_kirlim"],
        ["kısa_gorev", "kisa_gorev"],
        ["çalışma_sekli", "calisma_sekli", "calısma_sekli", "çalisma_sekli"],
        ["kusak_aralik"],
        ["aralik"],
        ["mezun"],
        ["departman_adi"],
        ["bolum_adi"],
    ]
    categorical_features = []
    for candidates in categorical_feature_candidates:
        picked = next((c for c in candidates if c in magaza_ml.columns), None)
        if picked:
            categorical_features.append(picked)
    feature_cols = numeric_features + categorical_features

    min_train_rows = 50
    has_two_classes = train_df[target_col].nunique() >= 2 if not train_df.empty else False
    can_train_ml = bool(SKLEARN_AVAILABLE and len(train_df) >= min_train_rows and has_two_classes and feature_cols)
    base_rate = float(train_df[target_col].mean()) if not train_df.empty else 0.15

    print("Risk skoru modeli hazirlaniyor...")
    print(f"   -> Numerik ozellik: {len(numeric_features)}")
    print(f"   -> Kategorik ozellik: {len(categorical_features)}")
    print(f"   -> Egitim verisi: {len(train_df)} kayit")
    print(f"   -> Skorlama verisi: {len(score_df)} kayit")

    if can_train_ml:
        ml_raw, ml_calibrated = _train_and_score_ml(
            train_df,
            score_df,
            feature_cols,
            numeric_features,
            categorical_features,
            target_col,
        )
    else:
        if not SKLEARN_AVAILABLE:
            print("Uyari: scikit-learn kurulu degil, ML bileseni baz orana sabitlendi.")
        else:
            print("Uyari: ML modeli icin veri yetersiz, kural tabanli bilesenler one cikacak.")
        ml_raw = pd.Series(base_rate, index=score_df.index, dtype=float)
        ml_calibrated = pd.Series(base_rate, index=score_df.index, dtype=float)

    score_df["risk_olasilik_raw"] = ml_raw.clip(0, 1)
    score_df["risk_olasilik_calibrated"] = ml_calibrated.clip(0, 1)
    ml_risk = score_df["risk_olasilik_calibrated"].fillna(base_rate).clip(0, 1)

    # Kumule performans bosluklarini tarihsel veri ile doldur.
    kumule_cols_to_fill = [
        "sd_satis_yuzde", "sd_adet_yuzde", "sd_upt_yuzde", "sd_tds_yuzde", "sd_fatura_yuzde",
        "magaza_hgo_yuzde", "magaza_nps_yuzde", "magaza_kart_verme_yuzde", "magaza_yeni_musteri_yuzde",
    ]
    magaza_2023_plus = magaza_2025[magaza_2025["donem"].dt.year >= 2023].copy() if "donem" in magaza_2025.columns else magaza_2025.copy()
    magaza_ref = magaza_2023_plus[magaza_2023_plus["donem"] < latest_donem].copy() if "donem" in magaza_2023_plus.columns else magaza_2023_plus.copy()
    if magaza_ref.empty:
        magaza_ref = magaza_2023_plus.copy()
    score_df = smart_fill_kumule_values(
        score_df=score_df,
        reference_df=magaza_ref,
        kumule_cols=kumule_cols_to_fill,
        threshold=0.3,
    )

    performance_risk, perf_data_quality = _calculate_performance_risk_v2(score_df)
    engagement_risk = _calculate_engagement_risk_v2(score_df)
    tenure_risk = _calculate_tenure_risk_v2(score_df)
    dept_risk = _calculate_dept_risk_v2(score_df, magaza_2025, latest_donem, base_rate)
    momentum_risk = _calculate_momentum_risk_v2(score_df, magaza_2025)
    demographic_risk = _calculate_demographic_risk_v2(score_df)

    weights = _calculate_dynamic_weights(
        ml_available=can_train_ml,
        perf_data_quality=perf_data_quality,
        n_train=len(train_df),
    )

    composite = (
        ml_risk.fillna(base_rate) * weights["ml"] +
        performance_risk.fillna(0.5) * weights["performance"] +
        engagement_risk.fillna(0.5) * weights["engagement"] +
        tenure_risk.fillna(0.5) * weights["tenure"] +
        dept_risk.fillna(0.5) * weights["dept"] +
        momentum_risk.fillna(0.5) * weights["momentum"] +
        demographic_risk.fillna(0.5) * weights["demographic"]
    ).clip(0, 1)

    score_df["risk_puani_ham"] = (composite * 100).round(1)
    score_df["risk_puani"] = _calibrate_scores(score_df["risk_puani_ham"], historical_exit_rate=base_rate)
    score_df["risk_olasilik_ml"] = ml_risk.clip(0, 1)
    score_df["risk_olasilik"] = (score_df["risk_puani"] / 100.0).clip(0, 1)
    score_df["risk_seviyesi"] = score_df["risk_puani"].apply(_risk_label_v2)

    score_df["ml_risk_component"] = (ml_risk * 100).round(1)
    score_df["performance_risk_component"] = (performance_risk * 100).round(1)
    score_df["engagement_risk_component"] = (engagement_risk * 100).round(1)
    score_df["tenure_risk_component"] = (tenure_risk * 100).round(1)
    score_df["dept_risk_component"] = (dept_risk * 100).round(1)
    score_df["momentum_risk_component"] = (momentum_risk * 100).round(1)
    score_df["trend_risk_component"] = score_df["momentum_risk_component"]
    score_df["demographic_risk_component"] = (demographic_risk * 100).round(1)

    for key, value in weights.items():
        score_df[f"agirlik_{key}"] = round(value, 3)

    score_df["risk_aciklama"] = _generate_risk_explanations(
        score_df,
        {
            "ML Modeli": (ml_risk, weights.get("ml", 0)),
            "Performans": (performance_risk, weights.get("performance", 0)),
            "Bağlılık": (engagement_risk, weights.get("engagement", 0)),
            "Kıdem": (tenure_risk, weights.get("tenure", 0)),
            "Departman": (dept_risk, weights.get("dept", 0)),
            "Momentum": (momentum_risk, weights.get("momentum", 0)),
            "Demografik": (demographic_risk, weights.get("demographic", 0)),
        },
    )

    _print_risk_distribution(score_df, weights)
    return score_df


def _make_one_hot_encoder(dense_output=False):
    kwargs = {"handle_unknown": "ignore"}
    if dense_output:
        try:
            return OneHotEncoder(sparse_output=False, **kwargs)
        except TypeError:
            return OneHotEncoder(sparse=False, **kwargs)
    return OneHotEncoder(**kwargs)


def _train_and_score_ml(train_df, score_df, feature_cols, numeric_features, categorical_features, target_col):
    X_train = train_df[feature_cols].copy()
    y_train = train_df[target_col].astype(int)
    X_score = score_df[feature_cols].copy()

    for frame in (X_train, X_score):
        frame.replace({pd.NA: np.nan}, inplace=True)
        if numeric_features:
            existing_num = [c for c in numeric_features if c in frame.columns]
            frame[existing_num] = frame[existing_num].apply(pd.to_numeric, errors="coerce")
        if categorical_features:
            existing_cat = [c for c in categorical_features if c in frame.columns]
            frame[existing_cat] = frame[existing_cat].astype(object)
            frame[existing_cat] = frame[existing_cat].where(pd.notna(frame[existing_cat]), None)

    dense_output = not categorical_features or len(train_df) >= 800
    num_pipe = Pipeline([("imputer", SimpleImputer(strategy="median"))])
    cat_pipe = Pipeline([
        ("imputer", SimpleImputer(strategy="constant", fill_value="Bilinmiyor")),
        ("encoder", _make_one_hot_encoder(dense_output=dense_output)),
    ])
    preprocessor = ColumnTransformer(
        transformers=[
            ("num", num_pipe, [c for c in numeric_features if c in feature_cols]),
            ("cat", cat_pipe, [c for c in categorical_features if c in feature_cols]),
        ],
        remainder="drop",
        sparse_threshold=0.0 if dense_output else 0.3,
    )

    use_gbm = bool(GradientBoostingClassifier is not None and len(train_df) >= 800 and not categorical_features)
    if use_gbm:
        base_model = GradientBoostingClassifier(
            n_estimators=120,
            learning_rate=0.06,
            max_depth=3,
            subsample=0.85,
            random_state=42,
        )
    else:
        base_model = RandomForestClassifier(
            n_estimators=300,
            max_depth=8,
            min_samples_leaf=5,
            class_weight="balanced_subsample",
            random_state=42,
            n_jobs=-1,
        )

    base_pipeline = Pipeline([
        ("preprocessor", preprocessor),
        ("model", base_model),
    ])

    if len(train_df) >= 100 and y_train.nunique() >= 2:
        try:
            X_tr, X_val, y_tr, y_val = train_test_split(
                X_train,
                y_train,
                test_size=0.2,
                stratify=y_train,
                random_state=42,
            )
            eval_pipeline = Pipeline([
                ("preprocessor", preprocessor),
                ("model", base_model),
            ])
            eval_pipeline.fit(X_tr, y_tr)
            y_pred = eval_pipeline.predict_proba(X_val)[:, 1]
            auc = roc_auc_score(y_val, y_pred)
            print(f"   -> ML validation AUC: {auc:.3f}")
        except Exception as exc:
            print(f"   -> ML validation AUC hesaplanamadi: {exc}")

    base_pipeline.fit(X_train, y_train)
    raw = pd.Series(base_pipeline.predict_proba(X_score)[:, 1], index=score_df.index, dtype=float)

    calibrated = raw.copy()
    if CalibratedClassifierCV is not None and len(train_df) >= 60:
        class_counts = y_train.value_counts()
        min_class = int(class_counts.min()) if not class_counts.empty else 0
        if min_class >= 3:
            try:
                cv_folds = 5 if min_class >= 5 and len(train_df) >= 200 else 3
                calibrated_model = CalibratedClassifierCV(base_pipeline, method="sigmoid", cv=cv_folds)
                calibrated_model.fit(X_train, y_train)
                calibrated = pd.Series(calibrated_model.predict_proba(X_score)[:, 1], index=score_df.index, dtype=float)
            except Exception as exc:
                print(f"   -> Olasilik kalibrasyonu basarisiz, ham skor kullanilacak: {exc}")

    return raw.clip(0, 1), calibrated.clip(0, 1)


def _calculate_tenure_risk_v2(score_df):
    if "kidem_yil" not in score_df.columns:
        return pd.Series(0.45, index=score_df.index, dtype=float)
    kidem = pd.to_numeric(score_df["kidem_yil"], errors="coerce").fillna(0)
    risk = np.select(
        [
            kidem < 0.25,
            kidem < 0.5,
            kidem < 1.0,
            kidem < 2.0,
            kidem < 3.0,
            kidem < 5.0,
            kidem < 8.0,
            kidem < 12.0,
        ],
        [0.85, 0.75, 0.60, 0.45, 0.55, 0.35, 0.25, 0.20],
        default=0.15,
    )
    return pd.Series(risk, index=score_df.index, dtype=float)


def _calculate_performance_risk_v2(score_df):
    perf_defs = [
        (["toplam_yuzde", "toplam"], 0.30),
        (["sd_satis_yuzde", "sd_satis"], 0.20),
        (["prim_toplam"], 0.20),
        (["magaza_hgo_yuzde", "magaza_hgo"], 0.15),
        (["satis_akademisi_katilim_sayisi"], 0.15),
    ]
    available = {}
    for candidates, weight in perf_defs:
        picked = next((col for col in candidates if col in score_df.columns), None)
        if picked:
            available[picked] = weight
    if not available:
        return pd.Series(0.5, index=score_df.index, dtype=float), 0.0

    data_quality = len(available) / len(perf_defs)
    total_weight = sum(available.values())
    components = []
    for col, weight in available.items():
        series = pd.to_numeric(score_df[col], errors="coerce")
        non_null_ratio = float(series.notna().mean())
        if non_null_ratio < 0.10:
            continue
        filled = series.fillna(series.median())
        pct_rank = filled.rank(pct=True)
        risk_component = 1 / (1 + np.exp(5 * (pct_rank - 0.4)))
        components.append(risk_component * (weight / total_weight))

    if not components:
        return pd.Series(0.5, index=score_df.index, dtype=float), 0.0
    combined = sum(components)
    return pd.Series(combined, index=score_df.index, dtype=float).clip(0, 1), data_quality


def _calculate_engagement_risk_v2(score_df):
    signals = []
    if "satis_akademisi_katilim_sayisi" in score_df.columns:
        katilim = pd.to_numeric(score_df["satis_akademisi_katilim_sayisi"], errors="coerce").fillna(0)
        eng1 = 1 / (1 + np.exp(katilim - 2))
        signals.append((eng1, 0.5))
    if "izleme_dk" in score_df.columns:
        izleme = pd.to_numeric(score_df["izleme_dk"], errors="coerce").fillna(0)
        izleme_pct = izleme.rank(pct=True)
        signals.append((1 - izleme_pct, 0.3))
    if "fazla_mesai_saat" in score_df.columns:
        mesai = pd.to_numeric(score_df["fazla_mesai_saat"], errors="coerce").fillna(0)
        burnout_risk = (mesai / 40).clip(0, 1) * 0.3
        signals.append((burnout_risk, 0.2))

    if not signals:
        return pd.Series(0.5, index=score_df.index, dtype=float)
    total_weight = sum(w for _, w in signals)
    combined = sum(signal * w / total_weight for signal, w in signals)
    return pd.Series(combined, index=score_df.index, dtype=float).clip(0, 1)


def _calculate_dept_risk_v2(score_df, magaza_2025, latest_donem, base_rate):
    default = pd.Series(0.5, index=score_df.index, dtype=float)
    group_col = None
    for candidate in ["departman_adi", "bolum_adi", "isletme_adi"]:
        if candidate in score_df.columns and candidate in magaza_2025.columns:
            group_col = candidate
            break
    exit_col = next((c for c in ["cikis", "reel_isten_cikis"] if c in magaza_2025.columns), None)
    if group_col is None or exit_col is None:
        return default

    results = []
    for window_months, weight in [(3, 0.6), (6, 0.4)]:
        start = latest_donem - pd.DateOffset(months=window_months)
        recent = magaza_2025[magaza_2025["donem"] >= start].copy()
        if recent.empty:
            continue
        if "sicil_no" in recent.columns:
            denom = recent.groupby(group_col)["sicil_no"].nunique().replace(0, np.nan)
        else:
            denom = recent.groupby(group_col).size().replace(0, np.nan)
        numer = recent.groupby(group_col)[exit_col].sum()
        group_turnover = (numer / denom).fillna(base_rate)
        risk_map = group_turnover.apply(lambda t: min(1.0, max(0.0, (float(t) - 0.05) / 0.15)))
        mapped = score_df[group_col].map(risk_map).fillna(0.5)
        results.append((mapped, weight))

    if not results:
        return default
    total_weight = sum(weight for _, weight in results)
    combined = sum(series * weight / total_weight for series, weight in results)
    return pd.Series(combined, index=score_df.index, dtype=float).clip(0, 1)


def _calculate_momentum_risk_v2(score_df, magaza_2025):
    default = pd.Series(0.5, index=score_df.index, dtype=float)
    if "sicil_no" not in score_df.columns or "donem" not in magaza_2025.columns:
        return default
    perf_col = next((c for c in ["toplam_yuzde", "sd_satis_yuzde", "prim_toplam", "toplam", "sd_satis"] if c in magaza_2025.columns), None)
    if perf_col is None:
        return default

    try:
        hist = magaza_2025.copy()
        hist["donem"] = pd.to_datetime(hist["donem"], errors="coerce")
        hist = hist.dropna(subset=["donem", "sicil_no", perf_col])
        hist[perf_col] = pd.to_numeric(hist[perf_col], errors="coerce")
        hist = hist.sort_values(["sicil_no", "donem"])
        latest = hist["donem"].max()
        recent_start = latest - pd.DateOffset(months=3)
        earlier_start = latest - pd.DateOffset(months=6)

        recent_avg = hist[hist["donem"] >= recent_start].groupby("sicil_no")[perf_col].mean()
        earlier_avg = hist[(hist["donem"] >= earlier_start) & (hist["donem"] < recent_start)].groupby("sicil_no")[perf_col].mean()
        change = (recent_avg - earlier_avg) / (earlier_avg.abs() + 1e-9)
        momentum_map = change.apply(
            lambda v: max(0.1, min(0.9, 0.5 - float(v) * 1.5)) if pd.notna(v) else 0.5
        )
        return score_df["sicil_no"].map(momentum_map).fillna(0.5).astype(float)
    except Exception as exc:
        print(f"Momentum riski hesaplanamadi: {exc}")
        return default


def _calculate_demographic_risk_v2(score_df):
    risk = pd.Series(0.5, index=score_df.index, dtype=float)
    if "yas" in score_df.columns:
        yas = pd.to_numeric(score_df["yas"], errors="coerce").fillna(30)
        age_risk = np.select(
            [yas < 22, yas < 26, yas < 30, yas < 40, yas < 50],
            [0.75, 0.65, 0.50, 0.30, 0.25],
            default=0.20,
        )
        risk = risk * 0.5 + pd.Series(age_risk, index=score_df.index, dtype=float) * 0.5
    if "kusak_aralik" in score_df.columns:
        kusak = score_df["kusak_aralik"].apply(normalize_text_key)
        kusak_map = {"z": 0.70, "y": 0.55, "x": 0.35}
        kusak_risk = kusak.map(kusak_map).fillna(0.5).astype(float)
        risk = risk * 0.7 + kusak_risk * 0.3
    return risk.clip(0, 1)


def _calculate_dynamic_weights(ml_available, perf_data_quality, n_train):
    base = {
        "ml": 0.35,
        "performance": 0.20,
        "engagement": 0.15,
        "tenure": 0.12,
        "dept": 0.08,
        "momentum": 0.07,
        "demographic": 0.03,
    }
    if not ml_available:
        ml_weight = base["ml"]
        base["ml"] = 0.0
        base["performance"] += ml_weight * 0.35
        base["tenure"] += ml_weight * 0.25
        base["engagement"] += ml_weight * 0.20
        base["dept"] += ml_weight * 0.12
        base["momentum"] += ml_weight * 0.08
    elif n_train < 200:
        base = {
            "ml": 0.20,
            "performance": 0.20,
            "engagement": 0.18,
            "tenure": 0.20,
            "dept": 0.12,
            "momentum": 0.07,
            "demographic": 0.03,
        }
    if perf_data_quality < 0.5:
        deficit = base["performance"] * (1 - perf_data_quality)
        base["performance"] -= deficit
        base["tenure"] += deficit * 0.4
        base["engagement"] += deficit * 0.4
        base["dept"] += deficit * 0.2
    total = sum(base.values()) or 1.0
    return {k: float(v / total) for k, v in base.items()}


def _calibrate_scores(raw_scores, historical_exit_rate, target_high_risk_pct=0.15):
    if raw_scores is None or raw_scores.empty:
        return raw_scores
    raw = pd.to_numeric(raw_scores, errors="coerce")
    if raw.nunique(dropna=True) <= 1:
        return raw.clip(0, 100).round(1)

    pct_score = raw.rank(pct=True) * 100
    target_high_risk_pct = max(0.14, min(0.24, historical_exit_rate * 1.4 + 0.10))
    center = (1 - target_high_risk_pct) * 100
    steepness = 0.09
    sigmoid_score = 100 / (1 + np.exp(-steepness * (pct_score - center)))

    lo = raw.quantile(0.05)
    hi = raw.quantile(0.95)
    if pd.isna(lo) or pd.isna(hi) or hi <= lo:
        lo = raw.min()
        hi = raw.max()
    if pd.isna(lo) or pd.isna(hi) or hi <= lo:
        raw_norm = pct_score
    else:
        raw_norm = ((raw - lo) / (hi - lo)).clip(0, 1) * 100

    calibrated = (
        raw_norm.fillna(raw_norm.median()) * 0.50
        + pct_score.fillna(50) * 0.15
        + sigmoid_score.fillna(sigmoid_score.median()) * 0.35
    )
    return pd.Series(calibrated, index=raw.index).clip(0, 100).round(1)


def _risk_label_v2(score):
    if pd.isna(score):
        return "Bilinmiyor"
    if score >= 75:
        return "Kritik Risk"
    if score >= 60:
        return "Yüksek Risk"
    if score >= 40:
        return "Orta Risk"
    if score >= 25:
        return "Düşük Risk"
    return "Çok Düşük Risk"


def _generate_risk_explanations(score_df, components):
    explanations = []
    for idx in score_df.index:
        contributions = {}
        for name, (series, weight) in components.items():
            value = float(series.get(idx, 0.5)) if hasattr(series, "get") else 0.5
            contributions[name] = value * weight
        top3 = sorted(contributions.items(), key=lambda item: item[1], reverse=True)[:3]
        parts = []
        for name, _ in top3:
            series = components[name][0]
            raw_val = float(series.get(idx, 0.5)) if hasattr(series, "get") else 0.5
            level = "Yüksek" if raw_val > 0.65 else "Orta" if raw_val > 0.40 else "Düşük"
            parts.append(f"{name}: {level}")
        explanations.append(" | ".join(parts))
    return pd.Series(explanations, index=score_df.index)


def _print_risk_distribution(score_df, weights):
    if score_df is None or score_df.empty or "risk_seviyesi" not in score_df.columns:
        return
    print("=" * 60)
    print("Risk skoru dagilimi")
    print("=" * 60)
    dist = score_df["risk_seviyesi"].value_counts()
    total = len(score_df)
    for level in ["Kritik Risk", "Yüksek Risk", "Orta Risk", "Düşük Risk", "Çok Düşük Risk"]:
        count = int(dist.get(level, 0))
        pct = (count / total * 100) if total else 0
        print(f"  {level:<18}: {count:4d} (%{pct:5.1f})")
    print("Kullanilan agirliklar:")
    for key, value in sorted(weights.items(), key=lambda item: item[1], reverse=True):
        print(f"  {key:<15}: %{value * 100:.1f}")
    if "risk_puani" in score_df.columns:
        print(f"Ortalama risk puani : {score_df['risk_puani'].mean():.1f}")
        print(f"Medyan risk puani   : {score_df['risk_puani'].median():.1f}")
        print(f"Std sapma           : {score_df['risk_puani'].std():.1f}")
    print("=" * 60)

def hesapla_kusak_aralik(dogum_tarihi):
    """Kuşak aralığını hesaplar"""
    if pd.isna(dogum_tarihi):
        return np.nan

    dogum_yil = dogum_tarihi.year
    if 2000 <= dogum_yil <= 2018:
        return "Z"
    elif 1980 <= dogum_yil <= 1999:
        return "Y"
    elif 1946 <= dogum_yil <= 1979:
        return "X"
    return "X"
def olustur_satis_akademisi_takip_tablosu(satis_akademisi_kaynak, fiili_list, ayrilanlar_listesi, calisan_bilgisi, eski_kaynak, sonuc_df):
    """
    Satis Akademisi kaynak tablosuna dayalı satis_akademisi_takip_tablosu oluşturur
    """
    if satis_akademisi_kaynak is None or satis_akademisi_kaynak.empty:
        print("Satis Akademisi kaynak tablosu boş, satis_akademisi_takip_tablosu oluşturulamadı.")
        return None

    # Temel tabloyu kopyala
    takip_tablosu = satis_akademisi_kaynak.copy()

    # Sicil kolonunu normalize et
    takip_tablosu["sicil"] = takip_tablosu["sicil"].astype(str).str.strip()

    # Tüm kaynaklardaki sicilleri normalize et
    if "P_NO" in fiili_list.columns:
        fiili_list["P_NO"] = fiili_list["P_NO"].astype(str).str.strip()
    if "Sicil No" in ayrilanlar_listesi.columns:
        ayrilanlar_listesi["Sicil No"] = ayrilanlar_listesi["Sicil No"].astype(str).str.strip()
    if "Sicil No" in calisan_bilgisi.columns:
        calisan_bilgisi["Sicil No"] = calisan_bilgisi["Sicil No"].astype(str).str.strip()
    if "sicil" in eski_kaynak.columns:
        eski_kaynak["sicil"] = eski_kaynak["sicil"].astype(str).str.strip()
    if "sicil_no" in sonuc_df.columns:
        sonuc_df["sicil_no"] = sonuc_df["sicil_no"].astype(str).str.strip()

    def build_preferred_map(*specs):
        lookup = {}
        for source_df, key_col, value_col in specs:
            if key_col not in source_df.columns or value_col not in source_df.columns:
                continue
            subset = source_df[[key_col, value_col]].copy()
            subset[key_col] = subset[key_col].astype(str).str.strip()
            subset = subset.dropna(subset=[key_col])
            subset = subset[subset[key_col].ne("")]
            subset = subset.drop_duplicates(subset=[key_col], keep="first")
            for key, value in zip(subset[key_col], subset[value_col]):
                if key in lookup:
                    continue
                if pd.isna(value):
                    continue
                if isinstance(value, str) and not value.strip():
                    continue
                lookup[key] = value
        return lookup

    # 1. magaza sütunu (YENİ MANTIK: fiili_list > ayrilanlar > calisan_bilgisi > eski_kaynak)
    print("magaza sütunu hesaplanıyor...")

    # Öncelik 1: fiili_list → BOLUM_ADI
    fiili_magaza_map = {}
    if "P_NO" in fiili_list.columns and "BOLUM_ADI" in fiili_list.columns:
        fiili_magaza_map = fiili_list.set_index("P_NO")["BOLUM_ADI"].to_dict()

    # Öncelik 2: ayrilanlar_listesi → İşletme
    ayrilan_magaza_map = {}
    if "Sicil No" in ayrilanlar_listesi.columns and "İşletme" in ayrilanlar_listesi.columns:
        ayrilan_magaza_map = ayrilanlar_listesi.set_index("Sicil No")["İşletme"].dropna().to_dict()

    # Öncelik 3: calisan_bilgisi → Lokasyon
    calisan_magaza_map = {}
    if "Sicil No" in calisan_bilgisi.columns and "Lokasyon" in calisan_bilgisi.columns:
        calisan_magaza_map = calisan_bilgisi.set_index("Sicil No")["Lokasyon"].dropna().to_dict()

    # Öncelik 4: eski_kaynak → magaza
    eski_magaza_map = {}
    if "sicil" in eski_kaynak.columns and "magaza" in eski_kaynak.columns:
        eski_magaza_map = eski_kaynak.set_index("sicil")["magaza"].dropna().to_dict()

    def bul_magaza(sicil):
        if pd.isna(sicil):
            return "Bazı sıkıntılarımız var."

        sicil_str = str(sicil).strip()

        # 1. Öncelik: fiili_list → BOLUM_ADI
        if sicil_str in fiili_magaza_map and pd.notna(fiili_magaza_map[sicil_str]):
            return fiili_magaza_map[sicil_str]

        # 2. Öncelik: ayrilanlar_listesi → İşletme
        if sicil_str in ayrilan_magaza_map and pd.notna(ayrilan_magaza_map[sicil_str]):
            return ayrilan_magaza_map[sicil_str]

        # 3. Öncelik: calisan_bilgisi → Lokasyon
        if sicil_str in calisan_magaza_map and pd.notna(calisan_magaza_map[sicil_str]):
            return calisan_magaza_map[sicil_str]

        # 4. Öncelik: eski_kaynak → magaza
        if sicil_str in eski_magaza_map and pd.notna(eski_magaza_map[sicil_str]):
            return eski_magaza_map[sicil_str]

        return "Bazı sıkıntılarımız var."

    takip_tablosu["magaza"] = takip_tablosu["sicil"].apply(bul_magaza)

    # .GS. patternine göre kanal sınıflaması (Mağaza / Bayi)
    magaza_str = takip_tablosu["magaza"].astype("string").str.lower()
    takip_tablosu["kanal_gs"] = np.where(
        magaza_str.str.contains(r"\.gs\.", na=False),
        "Mağaza",
        "Bayi",
    )

    # 2. bolge sütunu (YENİ MANTIK: magaza değerini fiili_list > calisan_bilgisi > eski_kaynak'ta ara)
    print("bolge sütunu hesaplanıyor...")

    # Öncelik 1: fiili_list → ISLETME_AD → UST_BOLUM_ADI
    fiili_bolge_map = {}
    if "ISLETME_AD" in fiili_list.columns and "UST_BOLUM_ADI" in fiili_list.columns:
        fiili_bolge_map = (
            fiili_list[["ISLETME_AD", "UST_BOLUM_ADI"]]
            .dropna(subset=["UST_BOLUM_ADI"])
            .drop_duplicates(subset=["ISLETME_AD"])
            .set_index("ISLETME_AD")["UST_BOLUM_ADI"]
            .to_dict()
        )
        print(f"   → fiili_list'ten {len(fiili_bolge_map)} mağaza için bölge bulundu")

    # Öncelik 2: calisan_bilgisi → Lokasyon → Üst Bölüm
    calisan_bolge_map = {}
    if "Lokasyon" in calisan_bilgisi.columns and "Üst Bölüm" in calisan_bilgisi.columns:
        calisan_bolge_map = (
            calisan_bilgisi[["Lokasyon", "Üst Bölüm"]]
            .dropna(subset=["Üst Bölüm"])
            .drop_duplicates(subset=["Lokasyon"])
            .set_index("Lokasyon")["Üst Bölüm"]
            .to_dict()
        )
        print(f"   → calisan_bilgisi'nden {len(calisan_bolge_map)} mağaza için bölge bulundu")

    # Öncelik 3: eski_kaynak → magaza → bolge
    eski_bolge_map = {}
    if "magaza" in eski_kaynak.columns and "bolge" in eski_kaynak.columns:
        eski_bolge_map = (
            eski_kaynak[["magaza", "bolge"]]
            .dropna(subset=["bolge"])
            .drop_duplicates(subset=["magaza"])
            .set_index("magaza")["bolge"]
            .to_dict()
        )
        print(f"   → eski_kaynak'tan {len(eski_bolge_map)} mağaza için bölge bulundu")

    def bul_bolge(magaza):
        if pd.isna(magaza) or magaza == "Bazı sıkıntılarımız var.":
            return "Bayi"

        magaza_str = str(magaza).strip()

        # 1. Öncelik: fiili_list
        if magaza_str in fiili_bolge_map:
            return fiili_bolge_map[magaza_str]

        # 2. Öncelik: calisan_bilgisi
        if magaza_str in calisan_bolge_map:
            return calisan_bolge_map[magaza_str]

        # 3. Öncelik: eski_kaynak
        if magaza_str in eski_bolge_map:
            return eski_bolge_map[magaza_str]

        return "Bayi"

    takip_tablosu["bolge"] = takip_tablosu["magaza"].apply(bul_bolge)

    # Debug: Bölge dağılımı
    bolge_dagilim = takip_tablosu["bolge"].value_counts()
    print(f"   → Toplam {len(bolge_dagilim)} farklı bölge bulundu")
    print("   → En çok tekrar edenler:")
    for bolge_adi, sayi in bolge_dagilim.head(5).items():
        print(f"      • {bolge_adi}: {sayi} kişi")
    kanal_dagilim = takip_tablosu["kanal_gs"].value_counts(dropna=False)
    bayi_sayisi = kanal_dagilim.get("Bayi", 0)
    magaza_sayisi = kanal_dagilim.get("Mağaza", 0)
    print(f"   → Bayi: {bayi_sayisi} kişi")
    print(f"   → Mağaza (genel): {magaza_sayisi} kişi")

    # 3. bolge_muduru sütunu (YENİ: bolge değerini fiili_list'te BOLUM_ADI'da ara)
    print("bolge_muduru sütunu hesaplanıyor...")

    # fiili_list'ten bölge-müdür mapping'i oluştur
    bolge_mudur_map = {}

    if "BOLUM_ADI" in fiili_list.columns and "AD_SOYAD" in fiili_list.columns and "UNVAN_ADI" in fiili_list.columns:
        # Unvan normalizasyonu (Türkçe karakter + küçük harf)
        fiili_mudur = fiili_list.copy()
        fiili_mudur["unvan_norm"] = (
            fiili_mudur["UNVAN_ADI"]
            .astype(str)
            .str.lower()
            .str.replace("ü", "u", regex=False)
            .str.replace("ö", "o", regex=False)
            .str.replace("ş", "s", regex=False)
            .str.replace("ı", "i", regex=False)
            .str.replace("ğ", "g", regex=False)
            .str.replace("ç", "c", regex=False)
            .str.strip()
        )

        # Sadece müdür unvanlarını filtrele
        mudur_filter = fiili_mudur["unvan_norm"].str.contains("mudur", case=False, na=False)
        bolge_mudur_df = fiili_mudur[mudur_filter].copy()

        # Her BOLUM_ADI için ilk müdürü al
        bolge_mudur_map = bolge_mudur_df.groupby("BOLUM_ADI")["AD_SOYAD"].first().to_dict()

        print(f"   → {len(bolge_mudur_map)} bölge müdürü bulundu")
    else:
        print("   ⚠️ fiili_list'te gerekli kolonlar bulunamadı")

    def bul_bolge_muduru(bolge):
        if pd.isna(bolge) or bolge == "Bayi":
            return "Bayi"

        bolge_str = str(bolge).strip()

        # Tam eşleşme ara
        if bolge_str in bolge_mudur_map:
            return bolge_mudur_map[bolge_str]

        # Türkçe karakter normalizasyonu ile tekrar ara
        bolge_norm = (
            bolge_str.lower()
            .replace("ö", "o")
            .replace("ü", "u")
            .replace("ş", "s")
            .replace("ı", "i")
            .replace("ğ", "g")
            .replace("ç", "c")
            .strip()
        )

        for bolum_adi, mudur_adi in bolge_mudur_map.items():
            bolum_norm = (
                str(bolum_adi).lower()
                .replace("ö", "o")
                .replace("ü", "u")
                .replace("ş", "s")
                .replace("ı", "i")
                .replace("ğ", "g")
                .replace("ç", "c")
                .strip()
            )

            if bolge_norm == bolum_norm:
                return mudur_adi

        return "Bilinmiyor"

    takip_tablosu["bolge_muduru"] = takip_tablosu["bolge"].apply(bul_bolge_muduru)

    # Debug: Bölge müdürü dağılımı
    mudur_dagilim = takip_tablosu["bolge_muduru"].value_counts()
    print(f"   → {len(mudur_dagilim)} farklı değer")
    bilinmiyor_sayisi = mudur_dagilim.get("Bilinmiyor", 0)
    bayi_sayisi = mudur_dagilim.get("Bayi", 0)
    print(f"   → Bilinmiyor: {bilinmiyor_sayisi}")
    print(f"   → Bayi: {bayi_sayisi}")

    # 4. pozisyon sütunu
    print("pozisyon sütunu hesaplanıyor...")

    # sonuc_df'ten pozisyon mapping
    if "sicil_no" in sonuc_df.columns and "gorev" in sonuc_df.columns:
        sonuc_pozisyon_map = sonuc_df.groupby("sicil_no")["gorev"].last().to_dict()
    else:
        sonuc_pozisyon_map = {}

    # fiili_list'ten
    if "P_NO" in fiili_list.columns and "POZISYON_ADI" in fiili_list.columns:
        fiili_pozisyon_map = fiili_list.set_index("P_NO")["POZISYON_ADI"].to_dict()
    else:
        fiili_pozisyon_map = {}

    # calisan_bilgisi'nden
    if "Sicil No" in calisan_bilgisi.columns and "Pozisyon" in calisan_bilgisi.columns:
        calisan_pozisyon_map = calisan_bilgisi.set_index("Sicil No")["Pozisyon"].to_dict()
    else:
        calisan_pozisyon_map = {}

    # ayrilanlar'dan
    if "Sicil No" in ayrilanlar_listesi.columns and "Pozisyon" in ayrilanlar_listesi.columns:
        ayrilan_pozisyon_map = ayrilanlar_listesi.set_index("Sicil No")["Pozisyon"].to_dict()
    else:
        ayrilan_pozisyon_map = {}

    def bul_pozisyon(sicil):
        if pd.isna(sicil):
            return "Satış Danışmanı"

        sicil_str = str(sicil).strip()

        # 1. sonuc_df'ten
        if sicil_str in sonuc_pozisyon_map and pd.notna(sonuc_pozisyon_map[sicil_str]):
            return sonuc_pozisyon_map[sicil_str]

        # 2. fiili_list'ten
        if sicil_str in fiili_pozisyon_map and pd.notna(fiili_pozisyon_map[sicil_str]):
            return fiili_pozisyon_map[sicil_str]

        # 3. calisan_bilgisi'nden
        if sicil_str in calisan_pozisyon_map and pd.notna(calisan_pozisyon_map[sicil_str]):
            return calisan_pozisyon_map[sicil_str]

        # 4. ayrilanlar'dan
        if sicil_str in ayrilan_pozisyon_map and pd.notna(ayrilan_pozisyon_map[sicil_str]):
            return ayrilan_pozisyon_map[sicil_str]

        return "Satış Danışmanı"

    takip_tablosu["pozisyon"] = takip_tablosu["sicil"].apply(bul_pozisyon)

    # 5. kadro sütunu (DÜZELTİLMİŞ: Belirsiz Süreli veya Part Tıme Personel değilse "Belirsiz Süreli" yap)
    print("kadro sütunu hesaplanıyor...")

    # sonuc_df'ten kadro mapping
    if "sicil_no" in sonuc_df.columns and "kadro_adi" in sonuc_df.columns:
        sonuc_kadro_map = sonuc_df.groupby("sicil_no")["kadro_adi"].last().to_dict()
    else:
        sonuc_kadro_map = {}

    # fiili_list'ten
    if "P_NO" in fiili_list.columns and "kadro_adı" in fiili_list.columns:
        fiili_kadro_map = fiili_list.set_index("P_NO")["kadro_adı"].to_dict()
    else:
        fiili_kadro_map = {}

    # calisan_bilgisi'nden
    if "Sicil No" in calisan_bilgisi.columns and "Kadro" in calisan_bilgisi.columns:
        calisan_kadro_map = calisan_bilgisi.set_index("Sicil No")["Kadro"].to_dict()
    else:
        calisan_kadro_map = {}

    def bul_kadro(sicil):
        if pd.isna(sicil):
            return "Belirsiz Süreli"

        sicil_str = str(sicil).strip()
        kadro_degeri = None

        # 1. sonuc_df'ten
        if sicil_str in sonuc_kadro_map and pd.notna(sonuc_kadro_map[sicil_str]):
            kadro_degeri = sonuc_kadro_map[sicil_str]

        # 2. fiili_list'ten
        elif sicil_str in fiili_kadro_map and pd.notna(fiili_kadro_map[sicil_str]):
            kadro_degeri = fiili_kadro_map[sicil_str]

        # 3. calisan_bilgisi'nden
        elif sicil_str in calisan_kadro_map and pd.notna(calisan_kadro_map[sicil_str]):
            kadro_degeri = calisan_kadro_map[sicil_str]

        # Eğer bulunamadıysa "Belirsiz Süreli"
        if kadro_degeri is None:
            return "Belirsiz Süreli"

        # Normalizasyon (küçük harf + boşluk temizle)
        kadro_norm = str(kadro_degeri).strip().lower()

        # Sadece "belirsiz süreli" veya "part tıme personel" ise olduğu gibi döndür
        if "belirsiz" in kadro_norm and "süreli" in kadro_norm:
            return kadro_degeri
        elif "part" in kadro_norm and ("time" in kadro_norm or "tıme" in kadro_norm):
            return kadro_degeri
        else:
            # Diğer tüm durumlar "Belirsiz Süreli"
            return "Belirsiz Süreli"

    takip_tablosu["kadro"] = takip_tablosu["sicil"].apply(bul_kadro)

    # 6. magaza_bayi_part sütunu (DÜZELTİLDİ: "Mağaza Part", "Bayi Part" eklendi)
    print("magaza_bayi_part sütunu hesaplanıyor...")

    magaza_series = takip_tablosu.get("magaza", pd.Series(index=takip_tablosu.index, dtype="object"))
    kadro_series = takip_tablosu.get("kadro", pd.Series(index=takip_tablosu.index, dtype="object"))
    is_part_time = kadro_series.astype("string").str.lower().str.contains("part", na=False)
    is_magaza = magaza_series.astype("string").str.lower().str.contains(r"\.gs\.", na=False, regex=True)

    takip_tablosu["magaza_bayi_part"] = "Bayi"
    takip_tablosu.loc[is_part_time, "magaza_bayi_part"] = "Bayi Part"
    takip_tablosu.loc[is_magaza, "magaza_bayi_part"] = "Mağaza"
    takip_tablosu.loc[is_magaza & is_part_time, "magaza_bayi_part"] = "Mağaza Part"

    # 7. unvan sütunu
    print("unvan sütunu hesaplanıyor...")

    # sonuc_df'ten unvan mapping
    if "sicil_no" in sonuc_df.columns and "unvan" in sonuc_df.columns:
        sonuc_unvan_map = sonuc_df.groupby("sicil_no")["unvan"].last().to_dict()
    else:
        sonuc_unvan_map = {}

    # fiili_list'ten
    if "P_NO" in fiili_list.columns and "UNVAN_ADI" in fiili_list.columns:
        fiili_unvan_map = fiili_list.set_index("P_NO")["UNVAN_ADI"].to_dict()
    else:
        fiili_unvan_map = {}

    # calisan_bilgisi'nden
    if "Sicil No" in calisan_bilgisi.columns and "Unvan" in calisan_bilgisi.columns:
        calisan_unvan_map = calisan_bilgisi.set_index("Sicil No")["Unvan"].to_dict()
    else:
        calisan_unvan_map = {}

    def bul_unvan(sicil):
        if pd.isna(sicil):
            return "Satış Danışmanı"

        sicil_str = str(sicil).strip()

        # 1. sonuc_df'ten
        if sicil_str in sonuc_unvan_map and pd.notna(sonuc_unvan_map[sicil_str]):
            return sonuc_unvan_map[sicil_str]

        # 2. fiili_list'ten
        if sicil_str in fiili_unvan_map and pd.notna(fiili_unvan_map[sicil_str]):
            return fiili_unvan_map[sicil_str]

        # 3. calisan_bilgisi'nden
        if sicil_str in calisan_unvan_map and pd.notna(calisan_unvan_map[sicil_str]):
            return calisan_unvan_map[sicil_str]

        return "Satış Danışmanı"

    takip_tablosu["unvan"] = takip_tablosu["sicil"].apply(bul_unvan)

    # 8. engel_durumu sütunu
    print("engel_durumu sütunu hesaplanıyor...")

    if "P_NO" in fiili_list.columns and "ENGEL_STATUSU" in fiili_list.columns:
        engel_map = fiili_list.set_index("P_NO")["ENGEL_STATUSU"].to_dict()
    else:
        engel_map = {}

    def bul_engel_durumu(sicil):
        if pd.isna(sicil):
            return "SAĞLIKLI"

        sicil_str = str(sicil).strip()

        if sicil_str in engel_map and pd.notna(engel_map[sicil_str]):
            return engel_map[sicil_str]

        return "SAĞLIKLI"

    takip_tablosu["engel_durumu"] = takip_tablosu["sicil"].apply(bul_engel_durumu)

    # 9. marka sütunu (DÜZELTİLDİ: NULL olanlar "I" olsun)
    print("marka sütunu hesaplanıyor...")

    def bul_marka(magaza):
        if pd.isna(magaza):
            return "I"  # NULL ise "I"

        s = str(magaza).strip()

        # Marka kodları genelde mağaza adının sonunda yer alır
        parts = s.split(".")

        # Son parça genelde marka kodu
        if len(parts) >= 2:
            last_part = parts[-1].strip()
            # Tek harf ise marka kodudur
            if len(last_part) == 1 and last_part.isalpha():
                return last_part.upper()

            # Sondan ikinci parça da kontrol et
            if len(parts) >= 3:
                second_last = parts[-2].strip()
                if len(second_last) == 1 and second_last.isalpha():
                    return second_last.upper()

        # Alternatif: 5. index'ten sonraki ilk harf
        if len(parts) > 5 and len(parts[5]) > 0:
            first_char = parts[5][0]
            if first_char.isalpha():
                return first_char.upper()

        return "I"  # Bulunamazsa "I"

    takip_tablosu["marka"] = takip_tablosu["magaza"].apply(bul_marka)

    # 10-11. dogum_tarihi ve dogum_yil sütunları
    print("dogum_tarihi ve dogum_yil sütunları hesaplanıyor...")

    dogum_map = build_preferred_map(
        (fiili_list, "P_NO", "DOGUM_TARIHI"),
        (eski_kaynak, "sicil", "dogum_tarihi"),
    )
    takip_tablosu["dogum_tarihi"] = takip_tablosu["sicil"].map(dogum_map)
    if "dogum_tarihi" in eski_kaynak.columns:
        ortalama_tarih = eski_kaynak["dogum_tarihi"].dropna().mean()
        takip_tablosu["dogum_tarihi"] = takip_tablosu["dogum_tarihi"].fillna(ortalama_tarih)
    takip_tablosu["dogum_tarihi"] = parse_mixed_date(takip_tablosu["dogum_tarihi"], dayfirst=True)
    takip_tablosu["dogum_yil"] = takip_tablosu["dogum_tarihi"].dt.year

    # 12. kusak sütunu
    print("kusak sütunu hesaplanıyor...")
    takip_tablosu["kusak"] = takip_tablosu["dogum_tarihi"].apply(hesapla_kusak_aralik)

    # 13. ogrenim_durumu sütunu
    print("ogrenim_durumu sütunu hesaplanıyor...")

    ogrenim_map = build_preferred_map(
        (fiili_list, "P_NO", "OGRENIM_DURUMU"),
        (eski_kaynak, "sicil", "ogrenim_durumu"),
    )
    takip_tablosu["ogrenim_durumu"] = takip_tablosu["sicil"].map(ogrenim_map).fillna("Lise")

    # 14. bolum sütunu
    print("bolum sütunu hesaplanıyor...")
    magaza_lower = takip_tablosu["magaza"].fillna("").astype(str).str.lower()
    takip_tablosu["bolum"] = np.where(
        magaza_lower.str.contains(".gs.", regex=False),
        "Mağaza",
        "Bayi",
    )

    # 15. giris_tarihi sütunu (GELİŞTİRİLMİŞ)
    print("giris_tarihi sütunu hesaplanıyor...")

    # Ortalama giriş tarihlerini hesapla
    ortalama_giris_tarihi = None
    if "ILK_BASLAMA_TARIHI" in fiili_list.columns:
        ortalama_giris_tarihi = parse_mixed_date(fiili_list["ILK_BASLAMA_TARIHI"], dayfirst=True).mean()
    elif "İşe Giriş Tarihi" in ayrilanlar_listesi.columns:
        ortalama_giris_tarihi = parse_mixed_date(ayrilanlar_listesi["İşe Giriş Tarihi"], dayfirst=True).mean()
    elif "giris_tarihi" in eski_kaynak.columns:
        ortalama_giris_tarihi = parse_mixed_date(eski_kaynak["giris_tarihi"], dayfirst=True).mean()

    giris_map = build_preferred_map(
        (fiili_list, "P_NO", "ILK_BASLAMA_TARIHI"),
        (calisan_bilgisi, "Sicil No", "İlk Başlama Tarihi"),
        (ayrilanlar_listesi, "Sicil No", "İşe Giriş Tarihi"),
        (eski_kaynak, "sicil", "giris_tarihi"),
    )
    takip_tablosu["giris_tarihi"] = takip_tablosu["sicil"].map(giris_map)
    if ortalama_giris_tarihi is not None:
        takip_tablosu["giris_tarihi"] = takip_tablosu["giris_tarihi"].fillna(ortalama_giris_tarihi)
    takip_tablosu["giris_tarihi"] = parse_mixed_date(takip_tablosu["giris_tarihi"], dayfirst=True)

    # 16. cikis_tarihi sütunu (GELİŞTİRİLMİŞ)
    print("cikis_tarihi sütunu hesaplanıyor...")

    # Ortalama çıkış tarihlerini hesapla
    ortalama_cikis_tarihi = None
    if "Çıkış Tarihi" in ayrilanlar_listesi.columns:
        ortalama_cikis_tarihi = parse_mixed_date(ayrilanlar_listesi["Çıkış Tarihi"], dayfirst=True).mean()
    elif "cikis_tarihi" in eski_kaynak.columns:
        ortalama_cikis_tarihi = parse_mixed_date(eski_kaynak["cikis_tarihi"], dayfirst=True).mean()

    aktif_siciller = set()
    if "P_NO" in fiili_list.columns:
        aktif_siciller.update(fiili_list["P_NO"].dropna().astype(str).str.strip())
    if "Sicil No" in calisan_bilgisi.columns:
        aktif_siciller.update(calisan_bilgisi["Sicil No"].dropna().astype(str).str.strip())

    cikis_map = build_preferred_map(
        (ayrilanlar_listesi, "Sicil No", "Çıkış Tarihi"),
        (eski_kaynak, "sicil", "cikis_tarihi"),
    )
    takip_tablosu["cikis_tarihi"] = takip_tablosu["sicil"].map(cikis_map)
    takip_tablosu["cikis_tarihi"] = takip_tablosu["cikis_tarihi"].astype("object")
    aktif_mask = takip_tablosu["sicil"].isin(aktif_siciller)
    takip_tablosu.loc[aktif_mask, "cikis_tarihi"] = "N/A"
    if ortalama_cikis_tarihi is not None:
        takip_tablosu["cikis_tarihi"] = takip_tablosu["cikis_tarihi"].fillna(ortalama_cikis_tarihi)

    def is_cikis_marker(val):
        if pd.isna(val):
            return True
        v = str(val).strip().lower()
        return v in {"n/a", "na", "yok", "nan", "none", ""}

    # 17. Çıkış tarihi giriş tarihinden küçükse düzeltme (DÜZELTİLDİ: Çıkış tarihini giriş tarihine eşitle)
    print("Çıkış tarihi giriş tarihinden küçük olanlar düzeltiliyor...")
    giris_dt = pd.to_datetime(takip_tablosu["giris_tarihi"], dayfirst=True, errors="coerce")
    cikis_marker_mask = takip_tablosu["cikis_tarihi"].apply(is_cikis_marker)
    cikis_dt = pd.to_datetime(takip_tablosu["cikis_tarihi"], dayfirst=True, errors="coerce")
    bad_date_mask = (~cikis_marker_mask) & giris_dt.notna() & cikis_dt.notna() & (cikis_dt < giris_dt)
    takip_tablosu.loc[bad_date_mask, "cikis_tarihi"] = giris_dt[bad_date_mask]
    cikis_dt = pd.to_datetime(takip_tablosu["cikis_tarihi"], dayfirst=True, errors="coerce")

    # 18. kidem_gun sütunu (DÜZELTİLDİ: Negatif değerleri engelle)
    print("kidem_gun sütunu hesaplanıyor...")
    kidem_days = (cikis_dt - giris_dt).dt.days
    kidem_days = kidem_days.where(kidem_days.isna(), kidem_days.clip(lower=0))
    takip_tablosu["kidem_gun"] = np.where(cikis_marker_mask, "N/A", kidem_days)

    # 19. calisma_durumu sütunu
    print("calisma_durumu sütunu hesaplanıyor...")

    def bul_calisma_durumu(cikis_tarihi):
        if is_cikis_marker(cikis_tarihi):
            return "Çalışıyor"
        return "Çıkış"

    takip_tablosu["calisma_durumu"] = takip_tablosu["cikis_tarihi"].apply(bul_calisma_durumu)

    # 20. kidem_yili sütunu (DÜZELTİLDİ: NULL ise hesapla, mükerrer veriyi engelle)
    print("kidem_yili sütunu hesaplanıyor...")

    kidem_fiili_map: dict[str, object] = {}
    if "P_NO" in fiili_list.columns and "KIDEM_YILI" in fiili_list.columns:
        kidem_fiili_map = (
            fiili_list.dropna(subset=["P_NO"])
            .assign(P_NO=fiili_list["P_NO"].astype(str).str.strip())
            .drop_duplicates(subset=["P_NO"], keep="first")
            .set_index("P_NO")["KIDEM_YILI"]
            .to_dict()
        )

    kidem_eski_map: dict[str, object] = {}
    if "sicil" in eski_kaynak.columns and "kidem_yil" in eski_kaynak.columns:
        kidem_eski_map = (
            eski_kaynak.dropna(subset=["sicil"])
            .assign(sicil=eski_kaynak["sicil"].astype(str).str.strip())
            .drop_duplicates(subset=["sicil"], keep="first")
            .set_index("sicil")["kidem_yil"]
            .to_dict()
        )

    sicil_series = takip_tablosu.get("sicil", pd.Series(index=takip_tablosu.index, dtype="object")).astype("string").str.strip()
    kidem_from_maps = sicil_series.map(kidem_fiili_map)
    kidem_from_old = sicil_series.map(kidem_eski_map)

    giris_calc_dt = pd.to_datetime(takip_tablosu["giris_tarihi"], dayfirst=True, errors="coerce")
    cikis_calc_dt = pd.to_datetime(takip_tablosu["cikis_tarihi"], dayfirst=True, errors="coerce")
    active_now = pd.Timestamp.now()
    cikis_calc_dt = cikis_calc_dt.where(~cikis_marker_mask, active_now)
    kidem_calc = ((cikis_calc_dt - giris_calc_dt).dt.days // 365).where(giris_calc_dt.notna())
    kidem_calc = kidem_calc.where(kidem_calc.isna() | (kidem_calc >= 0))

    fallback_mean = fiili_list["KIDEM_YILI"].dropna().mean() if "KIDEM_YILI" in fiili_list.columns else np.nan
    takip_tablosu["kidem_yili"] = kidem_from_maps.fillna(kidem_from_old).fillna(kidem_calc).fillna(fallback_mean)

    print("✅ satis_akademisi_takip_tablosu başarıyla oluşturuldu!")
    return takip_tablosu

def olustur_katilmayanlar_listesi(fiili_list, satis_akademisi_takip_tablosu):
    """
    Aktif ve uygun mağaza çalışanlarından Satış Akademisi geçmişinde hiç
    ``Katıldı`` kaydı bulunmayanları döndürür. Yalnızca kayıt açılmış olması
    katılım sayılmaz; ``Katılmadı`` kayıtları da eksik katılım kapsamındadır.
    """
    if fiili_list.empty or satis_akademisi_takip_tablosu is None or satis_akademisi_takip_tablosu.empty:
        print("katılmayanlar_listesi oluşturulamadı: gerekli veriler eksik")
        return None

    required = {"CALISAN_GRUP", "kadro_adı", "ENGEL_STATUSU", "UNVAN_ADI", "ISLETME_AD", "P_NO", "AD_SOYAD"}
    if not required.issubset(fiili_list.columns) or "sicil" not in satis_akademisi_takip_tablosu.columns:
        print("katılmayanlar_listesi oluşturulamadı: gerekli sütunlar eksik")
        return None

    grup_norm = fiili_list["CALISAN_GRUP"].apply(normalize_text_key)
    kadro_norm = fiili_list["kadro_adı"].apply(normalize_text_key)
    engel_norm = fiili_list["ENGEL_STATUSU"].apply(normalize_text_key)
    unvan_norm = fiili_list["UNVAN_ADI"].apply(normalize_text_key)
    isletme_norm = fiili_list["ISLETME_AD"].apply(normalize_text_key)
    magaza_calisanlar = fiili_list[
        grup_norm.str.contains("magaza", na=False)
        & kadro_norm.str.contains("part time personel|belirsiz sureli", na=False, regex=True)
        & engel_norm.str.contains("saglikli", na=False)
        & ~unvan_norm.isin(["temizlik elemani", "eleman"])
        & ~isletme_norm.str.contains("aurelia merkez", na=False)
    ].copy()

    if magaza_calisanlar.empty:
        print("katılmayanlar_listesi oluşturulamadı: filtreleme kriterlerine uyan kayıt bulunamadı")
        print(f"CALISAN_GRUP unique değerler: {fiili_list['CALISAN_GRUP'].unique()}")
        print(f"kadro_adı unique değerler: {fiili_list['kadro_adı'].unique()}")
        print(f"ENGEL_STATUSU unique değerler: {fiili_list['ENGEL_STATUSU'].unique()}")
        print(f"UNVAN_ADI unique değerler: {fiili_list['UNVAN_ADI'].unique()[:10]}")  # İlk 10 örnek
        print(f"ISLETME_AD unique değerler: {fiili_list['ISLETME_AD'].unique()[:10]}")  # İlk 10 örnek
        return None

    def normalize_sicil(series: pd.Series) -> pd.Series:
        return series.astype("string").str.replace(r"\.0$", "", regex=True).str.strip()
    magaza_calisanlar["_sicil_key"] = normalize_sicil(magaza_calisanlar["P_NO"])
    magaza_calisanlar = magaza_calisanlar.drop_duplicates("_sicil_key", keep="first")
    magaza_siciller = set(magaza_calisanlar["_sicil_key"].dropna())

    takip = satis_akademisi_takip_tablosu.copy()
    takip["_sicil_key"] = normalize_sicil(takip["sicil"])
    takip_siciller = set(takip["_sicil_key"].dropna())
    if "katilim_durumu" in takip.columns:
        katilim_norm = takip["katilim_durumu"].apply(normalize_text_key)
        katilan_siciller = set(takip.loc[katilim_norm.eq("katildi"), "_sicil_key"].dropna())
    else:
        # Eski kaynaklarda katılım durumu yoksa kayıt varlığı geriye uyumlu fallback'tir.
        katilan_siciller = takip_siciller

    katilmayan_siciller = magaza_siciller - katilan_siciller

    if not katilmayan_siciller:
        print("katılmayanlar_listesi oluşturulamadı: katılmayan personel bulunamadı")
        print(f"Mağaza çalışan sayısı: {len(magaza_calisanlar)}")
        print(f"Takip tablosunda sicil sayısı: {len(takip_siciller)}")
        return None

    # Katılmayanları filtrele
    katilmayanlar = magaza_calisanlar[
        magaza_calisanlar["_sicil_key"].isin(katilmayan_siciller)
    ].copy()

    # Yeni tablo oluştur
    katilmayanlar_listesi = pd.DataFrame({
        "sicil": katilmayanlar["P_NO"],
        "kisi_adi": katilmayanlar["AD_SOYAD"],
        "unvan": katilmayanlar["UNVAN_ADI"],
        "kadro": katilmayanlar["kadro_adı"],
        "program": katilmayanlar["UNVAN_ADI"].apply(
            lambda x: "Yönetici" if str(x) in ["Mağaza Müdürü", "Mağaza Müdür Yardımcısı"] else "Satış Danışmanı"
        ),
        "bolge": katilmayanlar.get("BOLUM_ADI", katilmayanlar.get("UST_BOLUM_ADI")),
        "magaza": katilmayanlar["ISLETME_AD"],
        "katilim_durumu": katilmayanlar["_sicil_key"].map(
            lambda key: "Katılmadı" if key in takip_siciller else "Hiç kayıt olmadı"
        ),
        "kidem_yili": katilmayanlar.get("KIDEM_YILI")
    })

    print(f"✅ katılmayanlar_listesi başarıyla oluşturuldu! {len(katilmayanlar_listesi)} kayıt")
    return katilmayanlar_listesi


def olustur_uzun_zamandır_egitim_almayanlar(satis_akademisi_takip_tablosu, bugun_tarihi=None):
    """
    calisma_durumu = "Çalışıyor"
    mezun = "Mezun Degil"
    magaza = ".gs." içerenler (mağaza çalışanları)
    engel_durumu = "SAĞLIKLI"
    son eğitim tarihi bugünden 100 gün önce
    """
    if satis_akademisi_takip_tablosu is None or satis_akademisi_takip_tablosu.empty:
        print("uzun_zamandır_egitim_almayanlar oluşturulamadı: satis_akademisi_takip_tablosu boş")
        return None

    if bugun_tarihi is None:
        bugun_tarihi = datetime.now()

    # Yalnızca gerçekten katıldığı eğitimler son eğitim kabul edilir. Metin
    # karşılaştırmaları Türkçe karakter ve büyük/küçük harf farkından etkilenmez.
    takip = satis_akademisi_takip_tablosu.copy()
    calisma_norm = takip["calisma_durumu"].apply(normalize_text_key)
    mezun_norm = takip["mezun"].apply(normalize_text_key)
    engel_norm = takip["engel_durumu"].apply(normalize_text_key)
    katilim_norm = (
        takip["katilim_durumu"].apply(normalize_text_key)
        if "katilim_durumu" in takip.columns
        else pd.Series("", index=takip.index, dtype="string")
    )
    magaza_mask = takip["magaza"].astype(str).str.lower().str.contains(".gs.", regex=False, na=False)
    calisanlar = takip[
        (calisma_norm == "calisiyor")
        & (mezun_norm == "mezun degil")
        & magaza_mask
        & (engel_norm == "saglikli")
        & (katilim_norm == "katildi")
    ].copy()

    if calisanlar.empty:
        print("uzun_zamandır_egitim_almayanlar oluşturulamadı: filtreleme kriterlerine uyan kayıt bulunamadı")
        print(f"calisma_durumu unique değerler: {satis_akademisi_takip_tablosu['calisma_durumu'].unique()}")
        print(f"mezun unique değerler: {satis_akademisi_takip_tablosu['mezun'].unique()}")
        if "magaza" in satis_akademisi_takip_tablosu.columns:
            magaza_sample = satis_akademisi_takip_tablosu["magaza"].dropna().head(10).tolist()
            print(f"magaza örnek değerler: {magaza_sample}")
        if "engel_durumu" in satis_akademisi_takip_tablosu.columns:
            print(f"engel_durumu unique değerler: {satis_akademisi_takip_tablosu['engel_durumu'].unique()}")
        return None

    # Tarih ve eğitim adı aynı kaynak satırdan alınır; böylece max tarih ile
    # başka bir satırdaki eğitim adının yanlış eşleşmesi önlenir.
    calisanlar["_donem_dt"] = parse_mixed_date(calisanlar["donem"], dayfirst=True)
    calisanlar = calisanlar[calisanlar["_donem_dt"].notna()].copy()
    son_egitimler = (
        calisanlar.sort_values(["sicil", "_donem_dt"], ascending=[True, True], na_position="first")
        .drop_duplicates(subset=["sicil"], keep="last")
    )

    # 100 günden eski olanları filtrele
    sinir_tarih = bugun_tarihi - timedelta(days=100)
    uzun_sure_egitim_almayanlar = son_egitimler[
        son_egitimler["_donem_dt"] < sinir_tarih
    ].copy()

    if uzun_sure_egitim_almayanlar.empty:
        print("uzun_zamandır_egitim_almayanlar oluşturulamadı: 100 günden fazla eğitim almamış çalışan bulunamadı")
        print(f"En son eğitim tarihi: {parse_mixed_date(son_egitimler['donem'], dayfirst=True).max()}")
        print(f"Bugün: {bugun_tarihi}")
        print(f"100 gün önce: {sinir_tarih}")
        return None

    # Yeni tablo oluştur
    uzun_zamandır_egitim_almayanlar = pd.DataFrame({
        "sicil": uzun_sure_egitim_almayanlar["sicil"],
        "kisi_adi": uzun_sure_egitim_almayanlar["kisi_adi"],
        "magaza": uzun_sure_egitim_almayanlar["magaza"],
        "son_katildigi_egitim_tarihi": uzun_sure_egitim_almayanlar["_donem_dt"],
        "son_egitim_adi": uzun_sure_egitim_almayanlar["egitim_donemi"],
        "program_adi": uzun_sure_egitim_almayanlar["unvan"].apply(
            lambda x: "Yönetici" if str(x) in ["Mağaza Müdürü", "Mağaza Müdür Yardımcısı"] else "Satış Danışmanı"
        )
    })

    print(f"✅ uzun_zamandır_egitim_almayanlar başarıyla oluşturuldu! {len(uzun_zamandır_egitim_almayanlar)} kayıt")
    return uzun_zamandır_egitim_almayanlar


def main():
    ensure_utf8_stdio()
    base_dir = PROJECT_ROOT
    icmal_path = resolve_existing_path(
        base_dir,
        "icmal kayıt dosyası.xlsx",
        patterns=["icmal*kayıt*dosyası*.xlsx", "icmal*kayit*dosya*.xlsx", "icmal*.xlsx"],
        exclude_names=["icmal_sorgu_sonuc.xlsx"],
    )
    key_path = base_dir / "key_tablosu.xlsx"
    enocta_path = base_dir / "enocta_tum_veri.xlsx"
    kumule_path = base_dir / "kumule_karne.xlsx"
    magaza_hedef_ciro_path = base_dir / "magaza_hedef_ciro.xlsx"
    satis_akademisi_path = base_dir / "R2_new_gen.xlsx"
    calisan_iletisim_path = base_dir / "calisan_iletisim_bilgileri.xlsx"

    # YENİ DOSYALAR
    ayrilanlar_listesi_path = base_dir / "Ayrilanlar_Listesi.xlsx"
    fiili_list_path = base_dir / "fiili_list.xlsx"
    calisan_bilgisi_raporu_path = base_dir / "Calisan_Bilgisi_Raporu.xlsx"
    eski_kaynak_path = base_dir / "eski_kaynak.xlsx"
    cikis_sebepleri_path = base_dir / "cikis_sebepleri.xlsx"
    isgucu_kaybi_path = base_dir / "isgucu_kaybi.xlsx"
    izin_yuku_path = base_dir / "izin_yuku.xlsx"
    yurtdisi_veri_icmal_path = base_dir / "yurtdisi_veri_icmal.xlsx"
    gelisim_yolculuk_path = base_dir / "gelisim_yolculuk.xlsx"
    performans_magaza_verileri_path = base_dir / "performans_magaza_verileri.xlsx"
    cezalar_path = base_dir / "cezalar.xlsx"
    norm_fiili_kadro_path = base_dir / "norm_fiili_kadro.xlsx"
    dogum_listesi_path = base_dir / "dogum_listesi.xlsx"
    ise_alma_suresi_path = base_dir / "ise_alma_suresi.xlsx"
    check_list_path = base_dir / "check_list.xlsx"
    isg_veri_path = base_dir / "isg_veri.xlsx"
    zorunlu_egitim_path = base_dir / "zorunlu_egitim.xlsx"
    sinav_puanlari_path = base_dir / "sinav_puanlari.xlsx"

    output_path = ICMAL_XLSX

    # Excel dosyalarını oku
    print("🔍 Dosyalar okunuyor...")
    print(f"📁 Çalışma dizini: {base_dir}")
    print(f"📥 İcmal kaynak dosyası: {icmal_path.name}")
    icmal = pd.read_excel(icmal_path, sheet_name="Sheet1")
    key_tablosu = pd.read_excel(key_path, sheet_name="key_tablosu")
    enocta = pd.read_excel(enocta_path, sheet_name="Sayfa1")
    kumule = pd.read_excel(kumule_path, sheet_name="Sheet1")
    magaza_hedef_ciro = pd.read_excel(magaza_hedef_ciro_path, sheet_name="Sayfa1")
    calisan_iletisim = pd.read_excel(calisan_iletisim_path, sheet_name="Sayfa1")
    satis_akademisi_raw = pd.read_excel(satis_akademisi_path, sheet_name="Sheet1")
    satis_akademisi_df = satis_akademisi_raw.copy()

    # YENİ DOSYALARI OKU
    try:
        ayrilanlar_listesi = pd.read_excel(ayrilanlar_listesi_path, sheet_name="Sayfa1")
        print(f"✅ Ayrılanlar_Listesi okundu, {len(ayrilanlar_listesi)} kayıt")
    except Exception as e:
        print(f"❌ Ayrılanlar_Listesi okunamadı: {e}")
        ayrilanlar_listesi = pd.DataFrame()

    try:
        fiili_list = pd.read_excel(fiili_list_path, sheet_name="ListTable")
        print(f"✅ fiili_list okundu, {len(fiili_list)} kayıt")
    except Exception as e:
        print(f"❌ fiili_list okunamadı: {e}")
        fiili_list = pd.DataFrame()

    try:
        calisan_bilgisi = pd.read_excel(calisan_bilgisi_raporu_path, sheet_name="Sayfa1")
        print(f"✅ Calisan_Bilgisi_Raporu okundu, {len(calisan_bilgisi)} kayıt")
    except Exception as e:
        print(f"❌ Calisan_Bilgisi_Raporu okunamadı: {e}")
        calisan_bilgisi = pd.DataFrame()

    try:
        eski_kaynak = pd.read_excel(eski_kaynak_path, sheet_name="Sayfa1")
        print(f"✅ eski_kaynak okundu, {len(eski_kaynak)} kayıt")
    except Exception as e:
        print(f"❌ eski_kaynak okunamadı: {e}")
        eski_kaynak = pd.DataFrame()

    try:
        yurtdisi_veri_icmal = pd.read_excel(yurtdisi_veri_icmal_path, sheet_name="Sheet1")
        print(f"✅ yurtdisi_veri_icmal okundu, {len(yurtdisi_veri_icmal)} kayıt")
        # Kıdem yılı hesaplama
        if 'donem' in yurtdisi_veri_icmal.columns and 'JOINING_DATE' in yurtdisi_veri_icmal.columns:
            yurtdisi_veri_icmal['JOINING_DATE'] = pd.to_datetime(yurtdisi_veri_icmal['JOINING_DATE'], errors='coerce')
            yurtdisi_veri_icmal['donem'] = pd.to_datetime(yurtdisi_veri_icmal['donem'], errors='coerce')
            # Aynı döneme denk getirmek için
            yurtdisi_veri_icmal['SENIORITY_YEARS'] = (yurtdisi_veri_icmal['donem'] - yurtdisi_veri_icmal['JOINING_DATE']).dt.days / 365.25
        else:
            yurtdisi_veri_icmal['SENIORITY_YEARS'] = None
    except Exception as e:
        print(f"❌ yurtdisi_veri_icmal okunamadı: {e}")
        yurtdisi_veri_icmal = pd.DataFrame()

    hedef_cols = ["donem", "aralik", "mag_kod", "mag_adi", "ciro_hedef", "omni_ciro", "hgo"]

    try:
        cikis_sebepleri = pd.read_excel(cikis_sebepleri_path)
        print(f"✅ cikis_sebepleri okundu, {len(cikis_sebepleri)} kayıt")
    except Exception as e:
        print(f"❌ cikis_sebepleri okunamadı: {e}")
        cikis_sebepleri = pd.DataFrame()
    try:
        isgucu_kaybi_raw = pd.read_excel(isgucu_kaybi_path, sheet_name=0)
        print(f"✅ isgucu_kaybi okundu, {len(isgucu_kaybi_raw)} kayıt")
    except Exception as e:
        print(f"❌ isgucu_kaybi okunamadı: {e}")
        isgucu_kaybi_raw = pd.DataFrame()

    try:
        izin_yuku_raw = pd.read_excel(izin_yuku_path, sheet_name=0)
        print(f"✅ izin_yuku okundu, {len(izin_yuku_raw)} kayıt")
    except Exception as e:
        print(f"❌ izin_yuku okunamadı: {e}")
        izin_yuku_raw = pd.DataFrame()
    try:
        gelisim_yolculuk_raw = pd.read_excel(gelisim_yolculuk_path, sheet_name=0)
        print(f"✅ gelisim_yolculuk okundu, {len(gelisim_yolculuk_raw)} kayıt")
    except Exception as e:
        print(f"❌ gelisim_yolculuk okunamadı: {e}")
        gelisim_yolculuk_raw = pd.DataFrame()
    try:
        performans_magaza_verileri = pd.read_excel(performans_magaza_verileri_path, sheet_name=0)
        print(f"✅ performans_magaza_verileri okundu, {len(performans_magaza_verileri)} kayıt")
    except Exception as e:
        print(f"❌ performans_magaza_verileri okunamadı: {e}")
        performans_magaza_verileri = pd.DataFrame()
    try:
        cezalar = pd.read_excel(cezalar_path, sheet_name="sheet_1")
        for _text_col in cezalar.select_dtypes(include=["object", "string"]).columns:
            cezalar[_text_col] = cezalar[_text_col].map(repair_mojibake_text)
        ceza_map = {
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
        if "OCKOD" in cezalar.columns:
            cezalar["ceza_kodu"] = cezalar["OCKOD"].astype(str).str.strip().str.upper()
            cezalar["ceza_adi"] = cezalar["ceza_kodu"].map(ceza_map).fillna("Diğer")
        if "TARIH" in cezalar.columns:
            cezalar["ceza_tarihi"] = parse_mixed_date(cezalar["TARIH"], dayfirst=True)
        if "PERNO" in cezalar.columns:
            def _ceza_sicil_key(v):
                if pd.isna(v):
                    return None
                text = str(v).strip()
                if not text or text.lower() in {"nan", "none", "nat"}:
                    return None
                try:
                    return str(int(float(text))) if re.fullmatch(r"\d+(\.0+)?", text) else text
                except Exception:
                    return text
            cezalar["sicil_key"] = cezalar["PERNO"].apply(_ceza_sicil_key)
        print(f"✅ cezalar okundu, {len(cezalar)} kayıt")
    except Exception as e:
        print(f"❌ cezalar okunamadı: {e}")
        cezalar = pd.DataFrame()
    try:
        norm_fiili_kadro = pd.read_excel(norm_fiili_kadro_path, sheet_name=0)
        print(f"✅ norm_fiili_kadro okundu, {len(norm_fiili_kadro)} kayıt")
    except Exception as e:
        print(f"❌ norm_fiili_kadro okunamadı: {e}")
        norm_fiili_kadro = pd.DataFrame()
    try:
        dogum_listesi = pd.read_excel(dogum_listesi_path, sheet_name=0)
        print(f"✅ dogum_listesi okundu, {len(dogum_listesi)} kayıt")
    except Exception as e:
        print(f"❌ dogum_listesi okunamadı: {e}")
        dogum_listesi = pd.DataFrame()
    try:
        ise_alma_suresi = pd.read_excel(ise_alma_suresi_path, sheet_name=0)
        for _date_col in [
            "Dönem",
            "Donem",
            "İşe Giriş Tarihi",
            "Ise Giris Tarihi",
            "Çıkış Tarihi",
            "Cikis Tarihi",
            "Pozisyon Açılma Tarihi  ",
            "Pozisyon Açılma Tarihi",
            "Pozisyon Acilma Tarihi",
            "Teklif Tarihi",
        ]:
            if _date_col in ise_alma_suresi.columns:
                ise_alma_suresi[_date_col] = parse_mixed_date(ise_alma_suresi[_date_col], dayfirst=True)
        for _num_col in [
            "Pozisyon Açık Gün Sayısı",
            "Pozisyon Acik Gun Sayisi",
            "Pozisyon Doldurma Süresi",
            "Pozisyon Doldurma Suresi",
            "Yıl",
            "Yil",
        ]:
            if _num_col in ise_alma_suresi.columns:
                ise_alma_suresi[_num_col] = pd.to_numeric(ise_alma_suresi[_num_col], errors="coerce")
        print(f"OK: ise_alma_suresi okundu, {len(ise_alma_suresi)} kayıt")
    except Exception as e:
        print(f"UYARI: ise_alma_suresi okunamadı: {e}")
        ise_alma_suresi = pd.DataFrame()

    # Mağaza eğitim ve uyum skor kartının zorunlu kaynakları. Bu üç dosya
    # eksik ya da bozuksa sessizce boş skor üretmek yerine hattı durduruyoruz.
    # Böylece dashboardda yanıltıcı %0 değerler yayınlanmaz.
    required_scorecard_sources = (
        (check_list_path, "check_list"),
        (isg_veri_path, "isg_veri"),
        (zorunlu_egitim_path, "zorunlu_egitim"),
    )
    scorecard_sources = {}
    for source_path, source_name in required_scorecard_sources:
        if not source_path.exists():
            raise FileNotFoundError(
                f"Mağaza uyum dashboardu için zorunlu kaynak bulunamadı: {source_path.name}"
            )
        try:
            source_df = pd.read_excel(source_path, sheet_name=0)
        except (PermissionError, ValueError, pd.errors.EmptyDataError) as exc:
            raise RuntimeError(
                f"Mağaza uyum dashboardu kaynağı okunamadı: {source_path.name} ({exc})"
            ) from exc
        if source_df.empty:
            raise RuntimeError(
                f"Mağaza uyum dashboardu kaynağı boş: {source_path.name}"
            )
        scorecard_sources[source_name] = source_df
        print(f"✅ {source_name} okundu, {len(source_df)} kayıt")

    check_list = scorecard_sources["check_list"]
    isg_veri = scorecard_sources["isg_veri"]
    zorunlu_egitim = scorecard_sources["zorunlu_egitim"]
    try:
        sinav_puanlari = pd.read_excel(sinav_puanlari_path, sheet_name=0)
    except FileNotFoundError as exc:
        raise FileNotFoundError(
            f"Akademi Dashboard sınav kaynağı bulunamadı: {sinav_puanlari_path.name}"
        ) from exc
    except (PermissionError, ValueError, pd.errors.EmptyDataError) as exc:
        raise RuntimeError(
            f"Akademi Dashboard sınav kaynağı okunamadı: {sinav_puanlari_path.name} ({exc})"
        ) from exc
    if sinav_puanlari.empty:
        raise RuntimeError(f"Akademi Dashboard sınav kaynağı boş: {sinav_puanlari_path.name}")
    for _text_col in sinav_puanlari.select_dtypes(include=["object", "string"]).columns:
        sinav_puanlari[_text_col] = sinav_puanlari[_text_col].map(repair_mojibake_text)
    print(f"✅ sinav_puanlari okundu, {len(sinav_puanlari)} kayıt")
    isgucu_kaybi_sheet = isgucu_kaybi_raw.copy()
    izin_yuku_sheet = izin_yuku_raw.copy()

    hedef_cols = [c for c in hedef_cols if c in magaza_hedef_ciro.columns]
    magaza_hedef_ciro = magaza_hedef_ciro[hedef_cols]

    # Tarih kolonlarını tarih tipine çevir (dayfirst=True ile)
    date_cols = ["donem", "dogum_tarihi", "ise_giris_tarihi", "son_giris_tarihi", "cikis_tarihi"]
    for col in date_cols:
        if col in icmal.columns:
            icmal[col] = parse_mixed_date(icmal[col], dayfirst=True)

    if "donem" in icmal.columns:
        donem_series = icmal["donem"].dropna()
        if not donem_series.empty:
            latest_month = donem_series.max().strftime("%Y-%m")
            feb_2026_count = int((donem_series.dt.to_period("M") == pd.Period("2026-02", freq="M")).sum())
            print(f"📅 İcmal dönem aralığı: {donem_series.min().strftime('%Y-%m-%d')} -> {donem_series.max().strftime('%Y-%m-%d')}")
            print(f"📌 En güncel dönem: {latest_month}")
            print(f"📌 2026-02 kayıt sayısı: {feb_2026_count}")

    # YENİ DOSYALAR İÇİN TARİH KOLONLARINI ÇEVİR (dayfirst=True ile)
    if not ayrilanlar_listesi.empty:
        for col in ["İşe Giriş Tarihi", "Son Giriş Tarihi", "Son Yasal Giriş", "Çıkış Tarihi"]:
            if col in ayrilanlar_listesi.columns:
                ayrilanlar_listesi[col] = parse_mixed_date(ayrilanlar_listesi[col], dayfirst=True)

    if not fiili_list.empty:
        for col in ["DOGUM_TARIHI", "ILK_BASLAMA_TARIHI", "İŞYERİ_BAŞLAMA_TARİHİ"]:
            if col in fiili_list.columns:
                fiili_list[col] = parse_mixed_date(fiili_list[col], dayfirst=True)

    if not calisan_bilgisi.empty:
        if "İlk Başlama Tarihi" in calisan_bilgisi.columns:
            calisan_bilgisi["İlk Başlama Tarihi"] = parse_mixed_date(calisan_bilgisi["İlk Başlama Tarihi"], dayfirst=True)

    if not eski_kaynak.empty:
        for col in ["dogum_tarihi", "giris_tarihi", "cikis_tarihi"]:
            if col in eski_kaynak.columns:
                eski_kaynak[col] = parse_mixed_date(eski_kaynak[col], dayfirst=True)

    # enocta / kumule 'donem' kolonlarını da tarih yap
    if "donem" in enocta.columns:
        enocta["donem"] = parse_mixed_date(enocta["donem"], dayfirst=True)
    if "donem" in kumule.columns:
        kumule["donem"] = parse_mixed_date(kumule["donem"], dayfirst=True)

    # izleme_dk sayıya çevrilip toplanabilsin
    if "izleme_dk" in enocta.columns:
        enocta["izleme_dk"] = pd.to_numeric(enocta["izleme_dk"], errors="coerce")

    # Satis Akademisi kaynak verisi 'donem' ve 'sicil' tipleri
    if "donem" in satis_akademisi_df.columns:
        satis_akademisi_df["donem"] = parse_mixed_date(satis_akademisi_df["donem"], dayfirst=True)
    if "sicil" in satis_akademisi_df.columns:
        satis_akademisi_df["sicil"] = satis_akademisi_df["sicil"].astype(str)

    # sicil ve sicil_no'yu string'e çevir ki join sorunsuz olsun
    if "sicil_no" in icmal.columns:
        icmal["sicil_no"] = icmal["sicil_no"].astype(str)
    if "sicil" in enocta.columns:
        enocta["sicil"] = enocta["sicil"].astype(str)
    if "sicil" in kumule.columns:
        kumule["sicil"] = kumule["sicil"].astype(str)

    # calisan_iletisim içindeki Sicil No'yu da string yap ve isim uyumlu hale getir
    if "Sicil No" in calisan_iletisim.columns:
        # Önce string'e çevirip boşlukları temizleyelim
        calisan_iletisim["Sicil No"] = calisan_iletisim["Sicil No"].astype(str).str.strip()
        # icmal'deki ile aynı isim olsun diye 'sicil_no' isimli yeni kolon açıyoruz
        calisan_iletisim["sicil_no"] = calisan_iletisim["Sicil No"]

    # Satis Akademisi kaynak verisinden Satış Akademisi katılım sayısı ve mezun bilgisi
    # katılım sayısı: kişi bazında zaman içinde "katıldı" sayısının kümülatifi
    if {"donem", "sicil", "katilim_durumu"}.issubset(satis_akademisi_df.columns):
        satis_akademisi_kat = satis_akademisi_df.copy()
        satis_akademisi_kat["katilim_durumu_norm"] = satis_akademisi_kat["katilim_durumu"].astype(str).str.strip().str.lower()
        kat_mask = satis_akademisi_kat["katilim_durumu_norm"] == "katıldı"
        satis_akademisi_kat = satis_akademisi_kat.loc[kat_mask, ["donem", "sicil"]].copy()
        satis_akademisi_kat = satis_akademisi_kat.sort_values(["sicil", "donem"])
        # kişi bazında kronolojik kümülatif sayaç
        satis_akademisi_kat["satis_akademisi_katilim_sayisi"] = satis_akademisi_kat.groupby("sicil").cumcount() + 1
        # donem + sicil bazında tek satıra indir
        satis_akademisi_kat_agg = (
            satis_akademisi_kat.groupby(["sicil", "donem"], as_index=False)["satis_akademisi_katilim_sayisi"]
            .max()
        )
    else:
        satis_akademisi_kat_agg = pd.DataFrame(columns=["sicil", "donem", "satis_akademisi_katilim_sayisi"])

    # mezun bilgisi (donem + sicil bazında son kaydı alıyoruz)
    if {"donem", "sicil", "mezun"}.issubset(satis_akademisi_df.columns):
        satis_akademisi_mezun = (
            satis_akademisi_df[["donem", "sicil", "mezun"]]
            .dropna(subset=["mezun"])
            .drop_duplicates(subset=["donem", "sicil"], keep="last")
        )
    else:
        satis_akademisi_mezun = pd.DataFrame(columns=["donem", "sicil", "mezun"])


    # --- Sicil Type Enforcement ---
    if "sicil_no" in calisan_iletisim.columns:
        calisan_iletisim = ensure_sicil_type(calisan_iletisim, "sicil_no")
    if not satis_akademisi_kat_agg.empty:
        satis_akademisi_kat_agg = ensure_sicil_type(satis_akademisi_kat_agg, "sicil")
    if not satis_akademisi_mezun.empty:
        satis_akademisi_mezun = ensure_sicil_type(satis_akademisi_mezun, "sicil")
    if "sicil" in enocta.columns:
        enocta = ensure_sicil_type(enocta, "sicil")
    if "sicil" in kumule.columns:
        kumule = ensure_sicil_type(kumule, "sicil")
    kumule = add_karne_yuzde_columns(kumule)
    # ------------------------------

    # key_tablosu ile join (LEFT JOIN) – kodları normalize edip eşleştir
    if "isletme_kodu" in icmal.columns and "m_kodu" in key_tablosu.columns:
        # Mağaza kodlarını normalize et
        icmal["isletme_kodu_merge"] = normalize_store_code(icmal["isletme_kodu"])
        key_tablosu["m_kodu_merge"] = normalize_store_code(key_tablosu["m_kodu"])
        key_min = key_tablosu[["m_kodu_merge", "il"]].copy()
        df = icmal.merge(
            key_min, how="left", left_on="isletme_kodu_merge", right_on="m_kodu_merge",
        )

        # Debug: 'il' bulunamayan mağaza kodlarını görmek için
        if df["il"].isna().any():
            missing_codes = (
                df.loc[df["il"].isna(), "isletme_kodu_merge"]
                .dropna()
                .unique()
            )
            print("İl bulunamayan mağaza kodları (örnek ilk 20):", missing_codes[:20])
    else:
        df = icmal.copy()
    df = ensure_sicil_type(df, "sicil_no")
    # --- Çalışan iletişim bilgilerini (cep telefonu ve e-postalar) df'ye ekle ---
    if "sicil_no" in df.columns and "sicil_no" in calisan_iletisim.columns:
        # İhtiyacımız olan kolonları alalım
        iletisim_min = calisan_iletisim[
            ["sicil_no"] + [c for c in calisan_iletisim.columns if c in ["Cep Telefonu", "Şirket e-posta", "Özel e-posta"]]
        ].drop_duplicates(subset=["sicil_no"])

        # Kolon isimlerini Python tarafında kullanışlı hale getirelim
        rename_map = {
            "Cep Telefonu": "cep_telefonu",
            "Şirket e-posta": "sirket_eposta",
            "Özel e-posta": "ozel_eposta",
        }
        iletisim_min = iletisim_min.rename(columns=rename_map)

        # LEFT JOIN: df'deki tüm satırlar kalsın, iletişim bilgisi varsa gelsin
        df = df.merge(iletisim_min, how="left", on="sicil_no")
    else:
        # Her ihtimale karşı kolonlar yine de dursun, ama hep NaN olsun
        for col_new in ["cep_telefonu", "sirket_eposta", "ozel_eposta"]:
            if col_new not in df.columns:
                df[col_new] = np.nan

    # ust_bolum encoding düzeltme (Maðaza vb.)
    if "ust_bolum" in df.columns:
        df["ust_bolum"] = normalize_ust_bolum_series(df["ust_bolum"])

    # R2_new_gen: Satış Akademisi katılım sayısı ve mezun bilgisi
    if not satis_akademisi_kat_agg.empty:
        df = df.merge(
            satis_akademisi_kat_agg.rename(columns={"sicil": "sicil_no"}),
            how="left",
            on=["donem", "sicil_no"],
        )
    else:
        df["satis_akademisi_katilim_sayisi"] = np.nan

    if not satis_akademisi_mezun.empty:
        df = df.merge(
            satis_akademisi_mezun.rename(columns={"sicil": "sicil_no"}),
            how="left",
            on=["donem", "sicil_no"],
        )
    else:
        df["mezun"] = np.nan

    # enocta_tum_veri'den izleme_dk getir (donem + sicil bazında TOPLAM)
    if {"donem", "sicil", "izleme_dk"}.issubset(enocta.columns):
        enocta_merge = enocta[["donem", "sicil", "izleme_dk"]].copy()
        # aynı donem + sicil için izleme_dk toplamını al
        enocta_merge = (
            enocta_merge
            .groupby(["donem", "sicil"], as_index=False)["izleme_dk"]
            .sum()
        )
        enocta_merge = enocta_merge.rename(columns={"sicil": "sicil_no"})
        df = df.merge(
            enocta_merge, how="left", on=["donem", "sicil_no"],
        )
    else:
        df["izleme_dk"] = np.nan

    # kumule_karne'den ham ve yuzdelik skorlar getir (donem + sicil eslesirse)
    kumule_raw_cols = ["toplam"] + KARNE_SCORE_COLS
    kumule_cols = ["donem", "sicil"] + [c for c in kumule_raw_cols + KARNE_OUTPUT_COLS if c in kumule.columns]
    if {"donem", "sicil"}.issubset(kumule.columns):
        kumule_merge = kumule[kumule_cols].copy()
        kumule_merge = kumule_merge.rename(columns={"sicil": "sicil_no"})
        df = df.merge(
            kumule_merge, how="left", on=["donem", "sicil_no"],
        )
    else:
        default_cols = ["toplam"] + KARNE_SCORE_COLS + KARNE_OUTPUT_COLS
        for col in default_cols:
            if col not in df.columns:
                df[col] = np.nan

    # KUMULE KARNE DEĞERLERİNİ DOLDUR (MAĞAZA/ŞİRKET ORTALAMALARI)
    print("📊 Kumule karne değerleri dolduruluyor...")
    kumule_numeric_cols = KARNE_SCORE_COLS + KARNE_PERCENT_COLS + ["toplam_yuzde"]

    for col in kumule_numeric_cols:
        if col in df.columns:
            # 1) Mağaza ortalaması
            store_avg = df.groupby(["donem", "isletme_adi"], dropna=False)[col].transform("mean")
            # 2) Şirket ortalaması
            company_avg = df.groupby("donem")[col].transform("mean")
            # 3) Doldur
            mask_na = df[col].isna()
            df.loc[mask_na, col] = store_avg[mask_na]
            mask_still_na = df[col].isna()
            df.loc[mask_still_na, col] = company_avg[mask_still_na]

    # --- Yardımcı boolean kolonlar ---
    ust_bolum_norm = df["ust_bolum"].astype("string").str.strip()
    ust_bolum_norm = (
        ust_bolum_norm
        .str.replace("ð", "ğ", regex=False)
        .str.replace("Ð", "ğ", regex=False)
        .str.replace("Ã§", "ç", regex=False)
        .str.replace("ÄŸ", "ğ", regex=False)
        .str.replace("Ä±", "ı", regex=False)
        .str.replace("Ã¶", "ö", regex=False)
        .str.replace("ÅŸ", "ş", regex=False)
        .str.replace("Ã¼", "ü", regex=False)
        .str.lower()
    )
    df["ust_bolum_norm"] = ust_bolum_norm
    unvan_norm = df["unvan"].astype("string").str.strip()
    unvan_not_null = unvan_norm.notna() & (unvan_norm != "")
    unvan_lower = unvan_norm.str.lower()
    unvan_non_stajyer = unvan_not_null & (unvan_lower != "stajyer")
    kadro_norm = df["kadro_adi"].astype("string").str.strip()
    kadro_not_null = kadro_norm.notna() & (kadro_norm != "")
    kadro_lower = kadro_norm.str.lower()
    kadro_eq_belirli = kadro_not_null & (kadro_lower == "belirli süreli")
    kadro_in_turnover2_zero = kadro_not_null & kadro_lower.isin(["belirli süreli", "part tıme personel"])
    kadro_ne_belirli = kadro_not_null & ~kadro_eq_belirli
    has_cikis = df["cikis_tarihi"].notna()

    # --- Hesaplanan kolonlar ---
    # dogum_yili
    df["dogum_yili"] = df["dogum_tarihi"].dt.year

    # kusak_aralik
    dogum_yil = df["dogum_tarihi"].dt.year
    conditions = [
        dogum_yil.between(2000, 2018),
        dogum_yil.between(1980, 1999),
        dogum_yil.between(1965, 1979),
        dogum_yil.between(1946, 1964),
    ]
    choices = ["Z", "Y", "X", "X"]
    df["kusak_aralik"] = np.select(conditions, choices, default=None)

    # kidem_yil (DateDiff("yyyy", ise_giris_tarihi, donem))
    df["kidem_yil"] = df["donem"].dt.year - df["ise_giris_tarihi"].dt.year

    # yas (DateDiff("yyyy", dogum_tarihi, donem))
    df["yas"] = df["donem"].dt.year - df["dogum_tarihi"].dt.year

    # calisan_sayisi (unvan <> 'stajyer')
    df["calisan_sayisi"] = unvan_non_stajyer.astype(int)

    # turnover1_degeri
    df["turnover1_degeri"] = np.where(kadro_eq_belirli, 0, unvan_non_stajyer.astype(int))

    # donem_basi
    cond_donem_basi = (df["ise_giris_tarihi"] < df["donem"]) & unvan_non_stajyer & kadro_ne_belirli
    df["donem_basi"] = cond_donem_basi.astype(int)

    # giris
    cond_giris = (df["ise_giris_tarihi"] >= df["donem"]) & unvan_non_stajyer & kadro_ne_belirli
    df["giris"] = cond_giris.astype(int)

    # cikis
    df["cikis"] = (has_cikis & unvan_non_stajyer & kadro_ne_belirli).astype(int)

    # donem_sonu
    df["donem_sonu"] = ((~has_cikis) & unvan_non_stajyer & kadro_ne_belirli).astype(int)

    # turnover2_degeri
    df["turnover2_degeri"] = np.where(kadro_in_turnover2_zero, 0, unvan_non_stajyer.astype(int))

    # donem_basi_2
    cond_ise_before = df["ise_giris_tarihi"] < df["donem"]
    df["donem_basi_2"] = cond_ise_before.astype(int) * np.where(
        kadro_in_turnover2_zero, 0, unvan_non_stajyer.astype(int),
    )

    # giris2
    cond_ise_not_before = ~cond_ise_before
    df["giris2"] = cond_ise_not_before.astype(int) * np.where(
        kadro_in_turnover2_zero, 0, unvan_non_stajyer.astype(int),
    )

    # cikis2
    df["cikis2"] = has_cikis.astype(int) * np.where(
        kadro_in_turnover2_zero, 0, unvan_non_stajyer.astype(int),
    )

    # donem_sonu_2
    df["donem_sonu_2"] = (~has_cikis).astype(int) * np.where(
        kadro_in_turnover2_zero, 0, unvan_non_stajyer.astype(int),
    )

    # prim_alan_kisi
    df["prim_alan_kisi"] = (df["prim_toplam"].fillna(0) > 0).astype(int)

    # ucret_ve_kasa_tazminati
    df["ucret_ve_kasa_tazminati"] = df[["ucret", "kasa_tazminati"]].fillna(0).sum(axis=1)

    # maas_hesaplama_dahil
    df["maas_hesaplama_dahil"] = (df["ucret_ve_kasa_tazminati"] > 0).astype(int)

    # reel_ise_giris
    df["reel_ise_giris"] = (
        (df["donem_basi"] != 1).astype(int) * unvan_non_stajyer.astype(int) * (df["ise_giris_tarihi"] >= df["donem"]).astype(int)
    )

    # reel_isten_cikis
    df["reel_isten_cikis"] = has_cikis.astype(int) * unvan_non_stajyer.astype(int)

    # kidem_gun (cikis_tarihi - ise_giris_tarihi; ise_giris_tarihi yoksa donem'e fallback)
    df["kidem_gun"] = "calisiyor"
    mask_cikis = df["cikis_tarihi"].notna()
    start_date = df["ise_giris_tarihi"].where(df["ise_giris_tarihi"].notna(), df["donem"])
    days = (df["cikis_tarihi"] - start_date).dt.days
    days = days.clip(lower=0)
    kidem_labels = np.select(
        [days < 10, days < 60, days < 180, days < 365, days < 730],
        ["10 Günden Az", "10 Gün - 2 Ay", "2-6 Ay", "6 Ay - 1 Yıl", "1 - 2 Yıl"],
        default="2 Yıl ve Üstü",
    )
    df.loc[mask_cikis, "kidem_gun"] = kidem_labels[mask_cikis]

    # magaza_title
    magaza_gorev_map = {
        "Mağaza İkinci Müdürü": "Mağaza İkinci Müdürü",
        "Satış Danışmanı": "Satış Danışmanı",
        "Mağaza Müdürü": "Mağaza Müdürü",
        "Mağaza Destek Elemanı": "Diğer",
        "Pasör Satış Danışmanı": "Satış Danışmanı",
        "Part Time Satış Danışmanı": "Satış Danışmanı",
        "Kasiyer": "Diğer",
        "Belirli Süreli Satış Danışmanı": "Satış Danışmanı",
        "Belirli Süreli Mağaza İkinci Müdürü": "Mağaza İkinci Müdürü",
        "Belirli Süreli Part Time Satış Danışmanı": "Satış Danışmanı",
        "Temizlik Elemanı": "Diğer",
    }
    magaza_unvan_map = magaza_gorev_map.copy()

    mask_magaza = ust_bolum_norm == "mağaza"
    df["magaza_title"] = "YANLIŞ"
    df.loc[mask_magaza, "magaza_title"] = df.loc[mask_magaza, "gorev"].map(magaza_gorev_map)
    mask_magaza_fallback = mask_magaza & df["magaza_title"].isna()
    df.loc[mask_magaza_fallback, "magaza_title"] = df.loc[mask_magaza_fallback, "unvan"].map(magaza_unvan_map)
    mask_magaza_fallback = mask_magaza & df["magaza_title"].isna()
    df.loc[mask_magaza_fallback, "magaza_title"] = "Diğer"

    # mevcut_yil
    df["mevcut_yil"] = df["donem"].dt.year

    # yonetim_seviye
    u = df["unvan"]
    cond1 = u.isin(
        ["Yönetici", "Müdür Yardımcısı", "Mağaza Müdür Yardımcısı", "Vekaleten Mağaza Müdürü", "Mağaza İkinci Müdürü"],
    )
    cond2 = u.isin(["Müdür", "Mağaza Müdürü", "Müdür 2"])
    cond3 = u.isin(["Direktör", "Genel Müdür", "Yönetim Kurulu Başkanı"])
    df["yonetim_seviye"] = np.select(
        [cond1, cond2, cond3],
        ["Alt Kademe Yönetici", "Orta Kademe Yönetici", "Üst Kademe Yönetici"],
        default="Uzman",
    )

    # kidem_aralik
    k = df["kidem_yil"]
    df["kidem_aralik"] = np.select(
        [k < 2, k < 4, k < 10],
        ["-1", "1-3", "4-9"],
        default="+10",
    )

    # merkez_title
    merkez_title_map = {
        "Yönetici": "Yönetici",
        "Uzman": "Uzman",
        "Eleman": "Eleman",
        "Müdür": "Yönetici",
        "Satış Danışmanı": "Uzman Yardımcısı",
        "Direktör": "Yönetici",
        "Genel Müdür": "Yönetici",
        "Uzman Yardımcısı": "Uzman Yardımcısı",
        "Stajyer": "Stajyer",
        "Memur": "Uzman",
        "Vekaleten Uzman": "Uzman Yardımcısı",
    }
    mask_merkez = ust_bolum_norm == "merkez"
    df["merkez_title"] = "YANLIŞ"
    df.loc[mask_merkez, "merkez_title"] = df.loc[mask_merkez, "unvan"].map(merkez_title_map)

    # merkez_seviye
    merkez_seviye_map = {
        "Yönetici": "Yönetici",
        "Uzman": "Uzman",
        "Eleman": "Eleman",
        "Müdür": "Müdür",
        "Uzman Yardımcısı": "Uzman Yardımcısı",
        "Direktör": "Direktör",
        "Genel Müdür": "Genel Müdür",
        "Satış Danışmanı": "Uzman Yardımcısı",
        "Stajyer": "Stajyer",
        "Memur": "Uzman",
        "Vekaleten Uzman": "Uzman Yardımcısı",
    }
    df["merkez_seviye"] = "YANLIŞ"
    df.loc[mask_merkez, "merkez_seviye"] = df.loc[mask_merkez, "unvan"].map(merkez_seviye_map)

    # magaza_kırılım
    gorev = df["gorev"]
    df["magaza_kırılım"] = "magaza degil"
    df.loc[mask_magaza, "magaza_kırılım"] = "Diğer"
    df.loc[mask_magaza & (gorev == "Mağaza İkinci Müdürü"), "magaza_kırılım"] = "Mağaza İkinci Müdürü"
    df.loc[mask_magaza & (gorev == "Mağaza Müdürü"), "magaza_kırılım"] = "Mağaza Müdürü"
    df.loc[
        mask_magaza & gorev.isin([
            "Satış Danışmanı",
            "Belirli Süreli Satış Danışmanı",
            "Uzman Satış Danışmanı",
            "Pasör Satış Danışmanı",
            "Stajyer - Yazlık Belirli Süreli Satış Danışmanı",
        ]),
        "magaza_kırılım",
    ] = "Satış Danışmanı"
    df.loc[mask_magaza & (gorev == "Belirli Süreli Mağaza İkinci Müdürü"), "magaza_kırılım"] = "Mağaza İkinci Müdürü"
    df.loc[
        mask_magaza & gorev.isin([
            "Part Time Satış Danışmanı",
            "Belirli Süreli Part Time Satış Danışmanı",
            "Yazlık Belirli Süreli Part Time Satış Danışmanı",
        ]),
        "magaza_kırılım",
    ] = "Part Time Satış Danışmanı"

    # marka_indikator
    store_name = df.get("isletme_adi", pd.Series(index=df.index, dtype="object")).astype("string")
    parts = store_name.str.split(".")
    df["marka_indikator"] = pd.Series(pd.NA, index=df.index, dtype="string")
    valid_brand_mask = (df["ust_bolum_norm"] == "mağaza") & store_name.ne("Aurelia Merkez")
    has_brand_part = parts.str.len().fillna(0) > 5
    extracted_brand = parts.str[5].astype("string").str.strip()
    df.loc[valid_brand_mask & has_brand_part & extracted_brand.ne(""), "marka_indikator"] = extracted_brand.str[0]

    # kısa_gorev
    df["kısa_gorev"] = pd.Series(pd.NA, index=df.index, dtype="string")
    df.loc[
        mask_magaza & gorev.isin(["Mağaza İkinci Müdürü", "Belirli Süreli Mağaza İkinci Müdürü", "Mağaza Müdürü"]),
        "kısa_gorev",
    ] = "Yönetici"
    df.loc[mask_magaza & (gorev == "Pasör Satış Danışmanı"), "kısa_gorev"] = "Pasör"
    df.loc[
        mask_magaza & gorev.isin([
            "Part Time Satış Danışmanı",
            "Belirli Süreli Part Time Satış Danışmanı",
            "Yazlık Belirli Süreli Part Time Satış Danışmanı",
        ]),
        "kısa_gorev",
    ] = "Part Time"
    df.loc[mask_magaza & (gorev == "Mağaza Destek Elemanı"), "kısa_gorev"] = "Depo"
    df.loc[
        mask_magaza & gorev.isin([
            "Satış Danışmanı",
            "Belirli Süreli Satış Danışmanı",
            "Yazlık Belirli Süreli Satış Danışmanı",
            "Ofis Destek Elemanı",
        ]),
        "kısa_gorev",
    ] = "Satış Danışmanı"
    df.loc[mask_magaza & (gorev == "Kasiyer"), "kısa_gorev"] = "Kasiyer"
    df.loc[mask_magaza & (gorev == "Stajyer"), "kısa_gorev"] = "Stajyer"
    df.loc[mask_magaza & (gorev == "Temizlik Elemanı"), "kısa_gorev"] = "Temizlik Elemanı"

    # calısma_sekli
    df["calısma_sekli"] = pd.Series(pd.NA, index=df.index, dtype="string")
    df.loc[mask_magaza, "calısma_sekli"] = "Full Time"
    df.loc[
        mask_magaza & gorev.isin([
            "Part Time Satış Danışmanı",
            "Yazlık Belirli Süreli Part Time Satış Danışmanı",
        ]),
        "calısma_sekli",
    ] = "Part Time"
    df.loc[
        mask_magaza & gorev.isin([
            "Belirli Süreli Satış Danışmanı",
            "Belirli Süreli Part Time Satış Danışmanı",
            "Stajyer",
        ]),
        "calısma_sekli",
    ] = "Belirli Süreli"

    # Sonuç kolon sırasını Access sorgusuna benzer şekilde ayarla
    kolon_sirasi = [
        "donem", "sicil_no", "tc_kimlik_no", "adi_soyadi", "cep_telefonu", "sirket_eposta", "ozel_eposta",
        "ust_bolum", "departman", "isletme_kodu", "isletme_adi", "departman_adi", "bolum_adi",
        "gorev", "unvan", "kadro_adi", "cinsiyet", "beyaz_mavi_yaka", "dogum_tarihi", "maliyet_merkezi_kodu", "maliyet_merkezi_adi",
        "sgk_is_yeri_kodu", "sgk_isyeri_adi", "ise_giris_tarihi", "son_giris_tarihi", "cikis_tarihi",
        "ucret", "sgk_gun", "fazla_mesai_toplam", "prim_toplam", "kasa_tazminati", "net_gelir", "temiz_net_gelir", "ucret_turu", "il",
        "dogum_yili", "kusak_aralik", "kidem_yil", "yas", "calisan_sayisi", "turnover1_degeri", "donem_basi", "giris", "cikis", "donem_sonu",
        "turnover2_degeri", "donem_basi_2", "giris2", "cikis2", "donem_sonu_2", "prim_alan_kisi", "ucret_ve_kasa_tazminati",
        "maas_hesaplama_dahil", "reel_ise_giris", "reel_isten_cikis", "kidem_gun", "magaza_title", "mevcut_yil", "yonetim_seviye", "kidem_aralik",
        "merkez_title", "merkez_seviye", "magaza_kırılım", "marka_indikator", "kısa_gorev", "calısma_sekli", "izleme_dk", "toplam", "toplam_yuzde",
        "karne_kisi_sayisi", "karne_satir_sayisi", "karne_bilesen_sayisi",
        "satis_akademisi_katilim_sayisi", "mezun", "sd_satis", "sd_adet", "sd_upt", "sd_tds", "sd_fatura",
        "magaza_hgo", "magaza_nps", "magaza_kart_verme", "magaza_yeni_musteri",
        "sd_satis_yuzde", "sd_adet_yuzde", "sd_upt_yuzde", "sd_tds_yuzde", "sd_fatura_yuzde",
        "magaza_hgo_yuzde", "magaza_nps_yuzde", "magaza_kart_verme_yuzde", "magaza_yeni_musteri_yuzde",
    ]

    # Kolonlardan bazıları DataFrame'de yoksa hata almamak için filtrele
    kolon_sirasi = [c for c in kolon_sirasi if c in df.columns]

    # Aynı donem + sicil_no + tc_kimlik_no kombinasyonlarını tekilleştir
    subset_cols = [c for c in ["donem", "sicil_no", "tc_kimlik_no"] if c in df.columns]
    temp = df.sort_values("donem")
    if subset_cols:
        temp = temp.drop_duplicates(subset=subset_cols, keep="first")
    sonuc = temp[kolon_sirasi]

    isgucu_kaybi_ozet = pd.DataFrame()
    izin_yuku_ozet = pd.DataFrame()

    if not isgucu_kaybi_raw.empty and not sonuc.empty:
        work = isgucu_kaybi_raw.copy()
        if {"donem", "sicil", "toplam_izin"}.issubset(work.columns):
            lookup_cols = [c for c in ["donem", "sicil_no", "ust_bolum", "sgk_gun"] if c in sonuc.columns]
            sgk_lookup = sonuc[lookup_cols].copy() if lookup_cols else pd.DataFrame()
            if not sgk_lookup.empty and {"donem", "sicil_no", "sgk_gun"}.issubset(sgk_lookup.columns):
                sgk_lookup["donem"] = parse_mixed_date(sgk_lookup["donem"], dayfirst=True)
                sgk_lookup["donem"] = sgk_lookup["donem"].dt.to_period("M").dt.to_timestamp()
                sgk_lookup["sicil_no"] = normalize_id_series(sgk_lookup["sicil_no"])
                if "ust_bolum" in sgk_lookup.columns:
                    sgk_lookup["ust_bolum"] = normalize_ust_bolum_series(sgk_lookup["ust_bolum"])
                sgk_lookup["sgk_gun"] = pd.to_numeric(sgk_lookup["sgk_gun"], errors="coerce").fillna(0)
                sgk_lookup = sgk_lookup.rename(columns={"sicil_no": "sicil"})
                groupers = [c for c in ["donem", "sicil"] if c in sgk_lookup.columns]
                agg_map = {"sgk_gun": "max"}
                if "ust_bolum" in sgk_lookup.columns:
                    agg_map["ust_bolum"] = "first"
                sgk_lookup = (
                    sgk_lookup
                    .groupby(groupers, dropna=False, as_index=False)
                    .agg(agg_map)
                )

                work["donem"] = parse_mixed_date(work["donem"], dayfirst=True)
                work["donem"] = work["donem"].dt.to_period("M").dt.to_timestamp()
                work["sicil"] = normalize_id_series(work["sicil"])
                if "bolum" in work.columns:
                    work["bolum"] = normalize_ust_bolum_series(work["bolum"])
                work["toplam_izin"] = pd.to_numeric(work["toplam_izin"], errors="coerce").fillna(0)

                merged = work.merge(sgk_lookup, how="left", on=[c for c in ["donem", "sicil"] if c in sgk_lookup.columns])
                merged["ust_bolum_final"] = merged.get("bolum")
                if "ust_bolum" in merged.columns:
                    merged["ust_bolum_final"] = merged["ust_bolum_final"].fillna(merged["ust_bolum"])
                merged["ust_bolum_final"] = normalize_ust_bolum_series(merged["ust_bolum_final"]).fillna(merged["ust_bolum_final"])
                merged["ust_bolum_key"] = merged["ust_bolum_final"].map(normalize_text_key)
                merged = merged[merged["ust_bolum_key"].isin(["magaza", "merkez"])].copy()
                if not merged.empty:
                    isgucu_kaybi_ozet = (
                        merged.groupby(["donem", "ust_bolum_key"], dropna=False, as_index=False)
                        .agg(
                            tekil_kisi=("sicil", "nunique"),
                            toplam_izin=("toplam_izin", "sum"),
                            toplam_sgk_gun=("sgk_gun", "sum"),
                        )
                        .rename(columns={"ust_bolum_key": "ust_bolum"})
                    )
                    isgucu_kaybi_ozet["ust_bolum"] = isgucu_kaybi_ozet["ust_bolum"].map(
                        {"magaza": "Mağaza", "merkez": "Merkez"}
                    ).fillna(isgucu_kaybi_ozet["ust_bolum"])
                    isgucu_kaybi_ozet["isgucu_kaybi"] = np.where(
                        isgucu_kaybi_ozet["toplam_sgk_gun"] > 0,
                        isgucu_kaybi_ozet["toplam_izin"] / isgucu_kaybi_ozet["toplam_sgk_gun"],
                        np.nan,
                    )
                    isgucu_kaybi_ozet["year"] = isgucu_kaybi_ozet["donem"].dt.year
                    isgucu_kaybi_ozet["month_num"] = isgucu_kaybi_ozet["donem"].dt.month
                    isgucu_kaybi_ozet = isgucu_kaybi_ozet[[
                        "donem", "year", "month_num", "ust_bolum", "tekil_kisi",
                        "toplam_izin", "toplam_sgk_gun", "isgucu_kaybi"
                    ]].sort_values(["donem", "ust_bolum"])

    if not izin_yuku_raw.empty and {"donem", "alan", "gun", "tl", "kisi_sayisi"}.issubset(izin_yuku_raw.columns):
        izin_yuku_ozet = izin_yuku_raw.copy()
        izin_yuku_ozet["donem"] = parse_mixed_date(izin_yuku_ozet["donem"], dayfirst=True)
        izin_yuku_ozet["donem"] = izin_yuku_ozet["donem"].dt.to_period("M").dt.to_timestamp()
        izin_yuku_ozet["alan"] = izin_yuku_ozet["alan"].astype("string").map(repair_mojibake_text).str.strip()
        for col in ["gun", "tl", "kisi_sayisi"]:
            izin_yuku_ozet[col] = pd.to_numeric(izin_yuku_ozet[col], errors="coerce").fillna(0)
        izin_yuku_ozet = izin_yuku_ozet.rename(columns={
            "gun": "toplam_gun",
            "tl": "toplam_brut_tl",
        })
        izin_yuku_ozet["kisi_basina_gun"] = np.where(
            izin_yuku_ozet["kisi_sayisi"] > 0,
            izin_yuku_ozet["toplam_gun"] / izin_yuku_ozet["kisi_sayisi"],
            np.nan,
        )
        izin_yuku_ozet["kisi_basina_brut_tl"] = np.where(
            izin_yuku_ozet["kisi_sayisi"] > 0,
            izin_yuku_ozet["toplam_brut_tl"] / izin_yuku_ozet["kisi_sayisi"],
            np.nan,
        )
        izin_yuku_ozet["ortalama_gun"] = izin_yuku_ozet["kisi_basina_gun"]
        izin_yuku_ozet["ortalama_bakiye"] = izin_yuku_ozet["kisi_basina_brut_tl"]
        izin_yuku_ozet["year"] = izin_yuku_ozet["donem"].dt.year
        izin_yuku_ozet["month_num"] = izin_yuku_ozet["donem"].dt.month
        izin_yuku_ozet = izin_yuku_ozet[[
            "donem", "year", "month_num", "alan", "kisi_sayisi", "toplam_gun",
            "toplam_brut_tl", "kisi_basina_gun", "kisi_basina_brut_tl",
            "ortalama_gun", "ortalama_bakiye"
        ]].sort_values(["donem", "alan"])

    # --- Enocta: ham veri + donem/sicil ozet tablo (SUMIFS + COUNTIFS mantigi) ---
    enocta_ham = enocta.copy() if enocta is not None else pd.DataFrame()
    enocta_donem_sicil_ozet = pd.DataFrame()

    if not enocta_ham.empty and {"donem", "sicil"}.issubset(enocta_ham.columns):
        enocta_ozet_src = enocta_ham.copy()
        enocta_ozet_src["donem"] = parse_mixed_date(enocta_ozet_src["donem"], dayfirst=True)
        enocta_ozet_src["donem"] = enocta_ozet_src["donem"].dt.to_period("M").dt.to_timestamp()
        enocta_ozet_src["sicil"] = enocta_ozet_src["sicil"].astype(str).str.strip()

        if "izleme_dk" in enocta_ozet_src.columns:
            enocta_ozet_src["izleme_dk"] = pd.to_numeric(enocta_ozet_src["izleme_dk"], errors="coerce")
        else:
            enocta_ozet_src["izleme_dk"] = np.nan

        def _norm_col_key(name):
            s = str(name).strip().lower()
            s = (
                s.replace("ı", "i")
                 .replace("ğ", "g")
                 .replace("ş", "s")
                 .replace("ö", "o")
                 .replace("ü", "u")
                 .replace("ç", "c")
            )
            s = s.replace(" ", "").replace("-", "_")
            return s

        def _pick_col(cols, aliases):
            norm_map = {_norm_col_key(c): c for c in cols}
            for alias in aliases:
                key = _norm_col_key(alias)
                if key in norm_map:
                    return norm_map[key]
            return None

        ad_col = _pick_col(
            enocta_ozet_src.columns,
            ["kullanıcı_adi", "kullanici_adi", "kullanıcıadı", "kullaniciadi", "adi"],
        )
        soyad_col = _pick_col(
            enocta_ozet_src.columns,
            ["kullanıcı_soyadi", "kullanici_soyadi", "kullanıcısoyadi", "kullanicisoyadi", "soyadi"],
        )

        group_cols = ["donem", "sicil"]
        enocta_donem_sicil_ozet = (
            enocta_ozet_src
            .groupby(group_cols, dropna=False)
            .agg(
                izleme_dk=("izleme_dk", "sum"),
                egitim_sayisi=("sicil", "size"),
            )
            .reset_index()
        )

        if ad_col is not None:
            ad_map = (
                enocta_ozet_src[group_cols + [ad_col]]
                .drop_duplicates(subset=group_cols, keep="first")
                .rename(columns={ad_col: "kullanıcı_adi"})
            )
            enocta_donem_sicil_ozet = enocta_donem_sicil_ozet.merge(ad_map, on=group_cols, how="left")
        else:
            enocta_donem_sicil_ozet["kullanıcı_adi"] = np.nan

        if soyad_col is not None:
            soyad_map = (
                enocta_ozet_src[group_cols + [soyad_col]]
                .drop_duplicates(subset=group_cols, keep="first")
                .rename(columns={soyad_col: "kullanıcı_soyadi"})
            )
            enocta_donem_sicil_ozet = enocta_donem_sicil_ozet.merge(soyad_map, on=group_cols, how="left")
        else:
            enocta_donem_sicil_ozet["kullanıcı_soyadi"] = np.nan

        if {"donem", "sicil_no"}.issubset(sonuc.columns):
            lookup_cols = [c for c in ["donem", "sicil_no", "ust_bolum", "isletme_adi", "bolum_adi"] if c in sonuc.columns]
            sonuc_lookup = (
                sonuc[lookup_cols]
                .copy()
                .rename(columns={"sicil_no": "sicil"})
            )
            sonuc_lookup["donem"] = parse_mixed_date(sonuc_lookup["donem"], dayfirst=True)
            sonuc_lookup["donem"] = sonuc_lookup["donem"].dt.to_period("M").dt.to_timestamp()
            sonuc_lookup["sicil"] = sonuc_lookup["sicil"].astype(str).str.strip()
            sonuc_lookup = sonuc_lookup.drop_duplicates(subset=["donem", "sicil"], keep="last")

            enocta_donem_sicil_ozet = enocta_donem_sicil_ozet.merge(
                sonuc_lookup,
                how="left",
                on=["donem", "sicil"],
            )

        ozet_col_order = [
            "donem", "sicil", "kullanıcı_adi", "kullanıcı_soyadi",
            "egitim_sayisi", "izleme_dk", "ust_bolum", "isletme_adi", "bolum_adi",
        ]
        ozet_col_order = [c for c in ozet_col_order if c in enocta_donem_sicil_ozet.columns]
        enocta_donem_sicil_ozet = enocta_donem_sicil_ozet[ozet_col_order].sort_values(["donem", "sicil"])

    # --- Turnover sayfaları için özet tablolar ---
    turnover_ust_bolum = hesapla_turnover_tablosu(sonuc, "ust_bolum")
    turnover_departman_adi = hesapla_turnover_tablosu(sonuc, "departman_adi")
    turnover_isletme_adi = hesapla_turnover_tablosu(sonuc, "isletme_adi")
    turnover_bolum_adi = hesapla_turnover_tablosu(sonuc, "bolum_adi")

    # --- Şirket geneli turnover (donem bazında) ---
    genel_turnover = (
        sonuc
        .groupby("donem", dropna=False)[
            ["cikis", "donem_basi", "donem_sonu", "cikis2", "donem_basi_2", "donem_sonu_2"]
        ]
        .sum()
        .reset_index()
    )
    genel_turnover["ortalama1"] = (genel_turnover["donem_basi"] + genel_turnover["donem_sonu"]) / 2
    genel_turnover["turnover1"] = np.where(
        genel_turnover["ortalama1"] != 0,
        genel_turnover["cikis"] / genel_turnover["ortalama1"],
        np.nan,
    )
    genel_turnover["ortalama2"] = (genel_turnover["donem_basi_2"] + genel_turnover["donem_sonu_2"]) / 2
    genel_turnover["turnover2"] = np.where(
        genel_turnover["ortalama2"] != 0,
        genel_turnover["cikis2"] / genel_turnover["ortalama2"],
        np.nan,
    )
    genel_turnover = genel_turnover.sort_values("donem")

    # --- Sonuç DataFrame'ine turnover oranlarını ekle ---
    sonuc = add_turnover_ratios_to_result(
        sonuc,
        turnover_ust_bolum,
        turnover_bolum_adi,
        genel_turnover
    )

    # Mağaza Part / Full kapsamları üst bölüm toplamından türetilemez; kişi
    # satırları kadro türüne göre ayrılarak standart turnover formülü yeniden
    # uygulanır: çıkış / ((dönem başı + dönem sonu) / 2).
    turnover_magaza_calisma = pd.DataFrame()
    if not sonuc.empty and {"donem", "ust_bolum", "kadro_adi"}.issubset(sonuc.columns):
        split_source = sonuc.copy()
        split_source["_ust_key"] = split_source["ust_bolum"].map(normalize_text_key)
        split_source["_kadro_key"] = split_source["kadro_adi"].map(normalize_text_key)
        split_source = split_source[split_source["_ust_key"] == "magaza"].copy()
        if not split_source.empty:
            split_source["scope"] = np.where(
                split_source["_kadro_key"].str.contains("part time", na=False),
                "Mağaza Part",
                "Mağaza Full",
            )
            for col in ["cikis", "donem_basi", "donem_sonu"]:
                split_source[col] = pd.to_numeric(split_source.get(col), errors="coerce").fillna(0)
            turnover_magaza_calisma = (
                split_source.groupby(["donem", "scope"], as_index=False)
                .agg(
                    cikis=("cikis", "sum"),
                    donem_basi=("donem_basi", "sum"),
                    donem_sonu=("donem_sonu", "sum"),
                )
                .sort_values(["scope", "donem"])
            )
            turnover_magaza_calisma["ortalama1"] = (
                turnover_magaza_calisma["donem_basi"] + turnover_magaza_calisma["donem_sonu"]
            ) / 2
            turnover_magaza_calisma["turnover1"] = np.where(
                turnover_magaza_calisma["ortalama1"] > 0,
                turnover_magaza_calisma["cikis"] / turnover_magaza_calisma["ortalama1"],
                np.nan,
            )
            turnover_magaza_calisma["year"] = pd.to_datetime(
                turnover_magaza_calisma["donem"], errors="coerce"
            ).dt.year
            turnover_magaza_calisma["month_num"] = pd.to_datetime(
                turnover_magaza_calisma["donem"], errors="coerce"
            ).dt.month

    # Standalone turnover dashboardunun payda kupu, cikis detayi ve duzenlenebilir
    # ayrilma nedeni siniflandirmasi. Tum kapsamlar mevcut `cikis` metriğini ve
    # cikis / ((donem basi + donem sonu) / 2) formulunu kullanir.
    print("Turnover analiz tabloları oluşturuluyor...")
    (
        turnover_analiz_aylik,
        turnover_cikis_detay,
        turnover_neden_ayarlari,
    ) = build_turnover_analysis_tables(
        sonuc,
        ayrilanlar_listesi,
        fiili_list,
    )

    # Çıkış anketini, çalışanın çıkış tarihindeki/öncesindeki son özlük kaydıyla
    # zenginleştir. Böylece dashboard kapsam filtreleri kaynağın kendisinden beslenir.
    if not cikis_sebepleri.empty and not sonuc.empty:
        survey_sicil_col = find_first_existing_col(cikis_sebepleri, ["Sicil", "Sicil No", "sicil", "sicil_no"])
        survey_exit_col = find_first_existing_col(cikis_sebepleri, ["Çıkış Tarihi", "Cikis Tarihi", "cikis_tarihi"])
        survey_period_col = find_first_existing_col(cikis_sebepleri, ["Dönem", "Donem", "donem"])
        if survey_sicil_col and {"sicil_no", "donem"}.issubset(sonuc.columns):
            survey = cikis_sebepleri.copy()
            survey["_row_order"] = np.arange(len(survey))
            survey["_sicil_key"] = normalize_id_series(survey[survey_sicil_col])
            if survey_exit_col:
                survey["_match_date"] = parse_mixed_date(survey[survey_exit_col], dayfirst=True)
            else:
                survey["_match_date"] = pd.NaT
            if survey_period_col:
                period_date = parse_mixed_date(survey[survey_period_col], dayfirst=True)
                survey["_match_date"] = survey["_match_date"].fillna(period_date)

            lookup_cols = [c for c in ["sicil_no", "donem", "ust_bolum", "kadro_adi"] if c in sonuc.columns]
            lookup = sonuc[lookup_cols].copy()
            lookup["_sicil_key"] = normalize_id_series(lookup["sicil_no"])
            lookup["_match_date"] = parse_mixed_date(lookup["donem"], dayfirst=True)
            lookup = (
                lookup.dropna(subset=["_sicil_key", "_match_date"])
                .sort_values(["_match_date", "_sicil_key"])
                .drop_duplicates(["_sicil_key", "_match_date"], keep="last")
            )
            left = survey.sort_values(["_match_date", "_sicil_key"], na_position="last")
            left_valid = left.dropna(subset=["_sicil_key", "_match_date"]).copy()
            left_fallback = left.loc[~left.index.isin(left_valid.index)].copy()
            matched_valid = pd.merge_asof(
                left_valid,
                lookup.drop(columns=["sicil_no", "donem"], errors="ignore"),
                on="_match_date",
                by="_sicil_key",
                direction="backward",
                allow_exact_matches=True,
            )
            for source_col in ["ust_bolum", "kadro_adi"]:
                if source_col not in left_fallback.columns:
                    left_fallback[source_col] = pd.NA
            matched = pd.concat([matched_valid, left_fallback], ignore_index=True, sort=False)

            # Çıkış tarihi bulunmayan veya tarihçenin başlangıcından eski kayıtlar için
            # aynı sicilin bilinen en güncel özlük kaydı güvenli fallback'tir.
            latest_lookup = (
                lookup.sort_values(["_match_date", "_sicil_key"])
                .drop_duplicates("_sicil_key", keep="last")
                .set_index("_sicil_key")
            )
            for source_col, output_col in [("ust_bolum", "Üst Bölüm"), ("kadro_adi", "Sözleşme Türü")]:
                if source_col not in matched.columns:
                    matched[source_col] = pd.NA
                fallback = matched["_sicil_key"].map(latest_lookup[source_col]) if source_col in latest_lookup.columns else pd.Series(pd.NA, index=matched.index)
                matched[output_col] = matched[source_col].where(matched[source_col].notna(), fallback)

            cikis_sebepleri = (
                matched.sort_values("_row_order")
                .drop(
                    columns=[
                        "_row_order", "_sicil_key", "_match_date",
                        "ust_bolum", "kadro_adi",
                    ],
                    errors="ignore",
                )
                .reset_index(drop=True)
            )

    # --- yardımcı: bir turnover serisini (geçmiş + 3 ay tahmin) tek kolon halinde üret ---
    def build_hist_fc(df_in, value_col="turnover1", steps=3, rename_to=None):
        df_local = df_in.copy()
        out_col = rename_to if rename_to is not None else value_col
        alt_col = f"{out_col}_alt"
        ust_col = f"{out_col}_ust"
        method_col = f"{out_col}_yontem"
        n_col = f"{out_col}_n_veri"
        if df_local.empty or value_col not in df_local.columns:
            return pd.DataFrame(columns=["donem", out_col, alt_col, ust_col, method_col, n_col])

        df_local["donem"] = pd.to_datetime(df_local["donem"], errors="coerce")
        df_local = df_local.dropna(subset=["donem"])
        if df_local.empty:
            return pd.DataFrame(columns=["donem", out_col, alt_col, ust_col, method_col, n_col])

        df_local["donem"] = df_local["donem"].dt.to_period("M").dt.to_timestamp()
        df_local = (
            df_local.groupby("donem", as_index=False)[value_col]
            .mean()
            .sort_values("donem")
            .rename(columns={value_col: out_col})
        )

        fc_local = forecast_turnover_series(
            df_local[["donem", out_col]].rename(columns={out_col: value_col}),
            steps=steps,
            value_col=value_col,
        )

        if not fc_local.empty:
            rename_map = {
                f"tahmin_{value_col}": out_col,
                f"alt_sinir_{value_col}": alt_col,
                f"ust_sinir_{value_col}": ust_col,
                "yontem": method_col,
                "n_veri": n_col,
            }
            fc_local = fc_local.rename(columns=rename_map)
            keep_cols = [c for c in ["donem", out_col, alt_col, ust_col, method_col, n_col] if c in fc_local.columns]
            combined = pd.concat([df_local, fc_local[keep_cols]], ignore_index=True, sort=False)
        else:
            combined = df_local

        combined = combined.drop_duplicates(subset=["donem"], keep="first")
        return combined

    # --- 3 Aylık turnover tahmini: tüm aylar + 3 ay ileri, GENİŞ format ---
    turnover_tahmin_3ay = pd.DataFrame()
    try:
        if not genel_turnover.empty:
            # 1) GENEL seri (şirket geneli)
            genel_all = build_hist_fc(
                genel_turnover[["donem", "turnover1"]].copy(),
                value_col="turnover1",
                steps=3,
                rename_to="genel",
            )
            turnover_tahmin_3ay = genel_all

        # 2) ust_bolum bazlı: Edirne / Mağaza / Merkez
        if not turnover_ust_bolum.empty and "ust_bolum" in turnover_ust_bolum.columns:
            ust_df = turnover_ust_bolum[["donem", "ust_bolum", "turnover1"]].copy()
            ust_df["donem"] = pd.to_datetime(ust_df["donem"], errors="coerce")
            ust_df = ust_df.dropna(subset=["donem"])

            def _norm_ust(x):
                s = normalize_text_key(x)
                if s == "magaza":
                    return "magaza"
                if s == "merkez":
                    return "merkez"
                if s == "edirne":
                    return "edirne"
                return None

            ust_df["ust_norm"] = ust_df["ust_bolum"].apply(_norm_ust)
            ust_df = ust_df[ust_df["ust_norm"].notna()]

            for ust_label, col_name in [
                ("edirne", "edirne"),
                ("magaza", "magaza"),
                ("merkez", "merkez"),
            ]:
                sub = ust_df[ust_df["ust_norm"] == ust_label][["donem", "turnover1"]].copy()
                if sub.empty:
                    continue
                sub_all = build_hist_fc(
                    sub,
                    value_col="turnover1",
                    steps=3,
                    rename_to=col_name,
                )
                turnover_tahmin_3ay = turnover_tahmin_3ay.merge(
                    sub_all, how="outer", on="donem",
                )

        # 3) Mağaza sözleşme türü: Part / Full
        if not turnover_magaza_calisma.empty:
            for scope_label, col_name in [
                ("Mağaza Part", "magaza_part"),
                ("Mağaza Full", "magaza_full"),
            ]:
                sub = turnover_magaza_calisma[
                    turnover_magaza_calisma["scope"] == scope_label
                ][["donem", "turnover1"]].copy()
                if sub.empty:
                    continue
                sub_all = build_hist_fc(
                    sub,
                    value_col="turnover1",
                    steps=3,
                    rename_to=col_name,
                )
                turnover_tahmin_3ay = turnover_tahmin_3ay.merge(
                    sub_all, how="outer", on="donem",
                )

        # Son temizlik
        turnover_tahmin_3ay = turnover_tahmin_3ay.sort_values("donem")
    except Exception as e:
        print(f"Turnover tahmin tablosu oluşturulamadı: {e}")
        turnover_tahmin_3ay = pd.DataFrame()

    # --- Mağaza 2023+ detay sayfası ---
    # --- Turnover tahmin kalitesi backtest raporu (son 3 ay) ---
    tahmin_backtest_ozet = pd.DataFrame()
    tahmin_backtest_detay = pd.DataFrame()
    try:
        backtest_summaries = []
        backtest_details = []

        if not genel_turnover.empty:
            summary, detail = evaluate_turnover_forecast_quality(
                genel_turnover[["donem", "turnover1"]].copy(),
                scope_label="Aurelia Group",
                value_col="turnover1",
                test_months=3,
            )
            backtest_summaries.append(summary)
            if detail is not None and not detail.empty:
                backtest_details.append(detail)

        if not turnover_ust_bolum.empty and "ust_bolum" in turnover_ust_bolum.columns:
            backtest_df = turnover_ust_bolum[["donem", "ust_bolum", "turnover1"]].copy()
            backtest_df["donem"] = pd.to_datetime(backtest_df["donem"], errors="coerce")
            backtest_df = backtest_df.dropna(subset=["donem"])
            backtest_df["ust_norm"] = backtest_df["ust_bolum"].apply(normalize_text_key)

            for norm_label, display_label in [
                ("edirne", "Edirne"),
                ("magaza", "Ma\u011faza"),
                ("merkez", "Merkez"),
            ]:
                sub = backtest_df[backtest_df["ust_norm"] == norm_label][["donem", "turnover1"]].copy()
                summary, detail = evaluate_turnover_forecast_quality(
                    sub,
                    scope_label=display_label,
                    value_col="turnover1",
                    test_months=3,
                )
                backtest_summaries.append(summary)
                if detail is not None and not detail.empty:
                    backtest_details.append(detail)

        if not turnover_magaza_calisma.empty:
            for scope_label in ["Mağaza Part", "Mağaza Full"]:
                sub = turnover_magaza_calisma[
                    turnover_magaza_calisma["scope"] == scope_label
                ][["donem", "turnover1"]].copy()
                summary, detail = evaluate_turnover_forecast_quality(
                    sub,
                    scope_label=scope_label,
                    value_col="turnover1",
                    test_months=3,
                )
                backtest_summaries.append(summary)
                if detail is not None and not detail.empty:
                    backtest_details.append(detail)

        if backtest_summaries:
            tahmin_backtest_ozet = pd.DataFrame(backtest_summaries)
        if backtest_details:
            tahmin_backtest_detay = pd.concat(backtest_details, ignore_index=True)
    except Exception as e:
        print(f"Tahmin backtest raporu olusturulamadi: {e}")
        tahmin_backtest_ozet = pd.DataFrame()
        tahmin_backtest_detay = pd.DataFrame()

    # --- Cari yil aylik rolling-origin turnover tahmin/backtest tablosu ---
    tahmin_yillik_backtest = pd.DataFrame()
    try:
        current_year = int(pd.Timestamp.now().year)
        annual_backtest_frames = []
        if not genel_turnover.empty:
            annual_backtest_frames.append(
                build_current_year_turnover_backtest(
                    genel_turnover[["donem", "turnover1"]].copy(),
                    scope_label="Aurelia Group",
                    value_col="turnover1",
                    target_year=current_year,
                )
            )

        if not turnover_ust_bolum.empty and "ust_bolum" in turnover_ust_bolum.columns:
            annual_scope_df = turnover_ust_bolum[["donem", "ust_bolum", "turnover1"]].copy()
            annual_scope_df["donem"] = pd.to_datetime(annual_scope_df["donem"], errors="coerce")
            annual_scope_df = annual_scope_df.dropna(subset=["donem"])
            annual_scope_df["ust_norm"] = annual_scope_df["ust_bolum"].apply(normalize_text_key)
            for norm_label, display_label in [
                ("edirne", "Edirne"),
                ("magaza", "Ma\u011faza"),
                ("merkez", "Merkez"),
            ]:
                scope_series = annual_scope_df[
                    annual_scope_df["ust_norm"] == norm_label
                ][["donem", "turnover1"]].copy()
                annual_backtest_frames.append(
                    build_current_year_turnover_backtest(
                        scope_series,
                        scope_label=display_label,
                        value_col="turnover1",
                        target_year=current_year,
                    )
                )

        if not turnover_magaza_calisma.empty:
            for scope_label in ["Mağaza Part", "Mağaza Full"]:
                scope_series = turnover_magaza_calisma[
                    turnover_magaza_calisma["scope"] == scope_label
                ][["donem", "turnover1"]].copy()
                annual_backtest_frames.append(
                    build_current_year_turnover_backtest(
                        scope_series,
                        scope_label=scope_label,
                        value_col="turnover1",
                        target_year=current_year,
                    )
                )

        annual_backtest_frames = [
            frame for frame in annual_backtest_frames
            if frame is not None and not frame.empty
        ]
        if annual_backtest_frames:
            tahmin_yillik_backtest = pd.concat(annual_backtest_frames, ignore_index=True)
            tahmin_yillik_backtest = tahmin_yillik_backtest.sort_values(
                ["scope", "hedef_donem"]
            ).reset_index(drop=True)
    except Exception as e:
        print(f"Cari yil tahmin backtest tablosu olusturulamadi: {e}")
        tahmin_yillik_backtest = pd.DataFrame()

    magaza_mask = (
        ust_bolum_norm.eq("mağaza") &
        (df["donem"].dt.year >= 2023)
    )
    magaza_2025 = df.loc[magaza_mask].copy()

    # TEKİLLEŞTİR: Aynı donem + sicil_no kombinasyonunda sadece 1 kayıt kalsın
    if not magaza_2025.empty and "sicil_no" in magaza_2025.columns:
        magaza_2025 = magaza_2025.sort_values(["donem", "sicil_no", "ise_giris_tarihi"], ascending=[True, True, False])
        magaza_2025 = magaza_2025.drop_duplicates(subset=["donem", "sicil_no"], keep="first")

    if not magaza_2025.empty:
        # DOLDURULACAK KOLONLAR
        fill_cols = [
            "toplam", "toplam_yuzde",
            "sd_satis", "sd_adet", "sd_upt", "sd_tds", "sd_fatura",
            "magaza_hgo", "magaza_nps", "magaza_kart_verme", "magaza_yeni_musteri",
            "sd_satis_yuzde", "sd_adet_yuzde", "sd_upt_yuzde", "sd_tds_yuzde", "sd_fatura_yuzde",
            "magaza_hgo_yuzde", "magaza_nps_yuzde", "magaza_kart_verme_yuzde", "magaza_yeni_musteri_yuzde",
            "ciro_hedef", "omni_ciro", "hgo"
        ]

        for col in fill_cols:
            if col not in magaza_2025.columns:
                magaza_2025[col] = np.nan
                continue

            # 1) Kişinin kendi ortalaması (2023+)
            person_avg = magaza_2025.groupby("sicil_no")[col].transform("mean")

            # 2) Mağaza ortalaması (donem + isletme_adi)
            store_avg = magaza_2025.groupby(["donem", "isletme_adi"], dropna=False)[col].transform("mean")

            # 3) Şirket ortalaması (sadece donem)
            company_avg = magaza_2025.groupby("donem")[col].transform("mean")

            # DOLDUR: Önce kişi ortalaması, sonra mağaza, en son şirket
            mask_na = magaza_2025[col].isna()
            magaza_2025.loc[mask_na, col] = person_avg[mask_na]

            mask_still_na = magaza_2025[col].isna()
            magaza_2025.loc[mask_still_na, col] = store_avg[mask_still_na]

            mask_final_na = magaza_2025[col].isna()
            magaza_2025.loc[mask_final_na, col] = company_avg[mask_final_na]

        # toplam2'yi ayrı hesapla (toplam'ın kopyası)
        magaza_2025["toplam2"] = magaza_2025["toplam"]
        magaza_2025["toplam2_yuzde"] = magaza_2025["toplam_yuzde"] if "toplam_yuzde" in magaza_2025.columns else np.nan
    else:
        magaza_2025["toplam2"] = np.nan
        magaza_2025["toplam2_yuzde"] = np.nan

    # --- Mağaza hedef ciro verilerini ekle ---
    if not magaza_hedef_ciro.empty and "mag_adi" in magaza_hedef_ciro.columns:
        # Mağaza hedef ciro tablosunu hazırla
        hedef_merge = magaza_hedef_ciro[["donem", "mag_adi", "aralik", "ciro_hedef", "omni_ciro", "hgo"]].copy()
        hedef_merge = hedef_merge.rename(columns={"mag_adi": "isletme_adi"})

        # Donem'i datetime'a çevir
        hedef_merge["donem"] = parse_mixed_date(hedef_merge["donem"], dayfirst=True)

        # magaza_2025 ile merge et (donem + isletme_adi eşleşmesi)
        magaza_2025 = magaza_2025.merge(
            hedef_merge,
            how="left",
            on=["donem", "isletme_adi"]
        )

        # NULL veya 0 değerleri dönem ortalaması ile doldur
        hedef_cols = ["ciro_hedef", "omni_ciro", "hgo"]  # aralik ÇIKARILDI

        for col in hedef_cols:
            if col in magaza_2025.columns:
                # 0 değerlerini NaN yap (ortalama hesabına dahil etmemek için)
                magaza_2025[col] = magaza_2025[col].replace(0, np.nan)

                # Sayıya çevir (string olanları temizle)
                magaza_2025[col] = pd.to_numeric(magaza_2025[col], errors="coerce")

                # Dönem bazında ortalama hesapla
                donem_avg = magaza_2025.groupby("donem")[col].transform("mean")

                # NULL olanları dönem ortalaması ile doldur
                mask_na = magaza_2025[col].isna()
                magaza_2025.loc[mask_na, col] = donem_avg[mask_na]

        # aralik kolonunu ayrı işle (string olabilir)
        if "aralik" in magaza_2025.columns:
            # NULL olanları en sık tekrar eden değerle doldur
            most_common = magaza_2025["aralik"].mode()
            if len(most_common) > 0:
                magaza_2025["aralik"] = magaza_2025["aralik"].fillna(most_common[0])
            else:
                magaza_2025["aralik"] = magaza_2025["aralik"].fillna("A")  # Varsayılan değer
    else:
        # Hedef ciro verisi yoksa boş kolonlar ekle
        magaza_2025["aralik"] = np.nan
        magaza_2025["ciro_hedef"] = np.nan
        magaza_2025["omni_ciro"] = np.nan
        magaza_2025["hgo"] = np.nan

    # Son olarak istediğimiz kolonları seçelim (sgk_gun ÇIKARILDI, hedef ciro kolonları EKLENDİ)
    magaza_cols = [
        "donem", "sicil_no", "adi_soyadi", "ust_bolum", "departman", "isletme_adi", "departman_adi", "bolum_adi",
        "gorev", "unvan", "kadro_adi", "cinsiyet", "dogum_tarihi", "ise_giris_tarihi", "son_giris_tarihi", "cikis_tarihi",
        "dogum_yili", "kusak_aralik", "kidem_yil", "yas", "calisan_sayisi", "turnover1_degeri", "donem_basi", "giris", "cikis", "donem_sonu",
        "turnover2_degeri", "donem_basi_2", "giris2", "cikis2", "donem_sonu_2", "izleme_dk", "toplam", "toplam_yuzde", "toplam2", "toplam2_yuzde",
        "karne_kisi_sayisi", "karne_satir_sayisi", "karne_bilesen_sayisi",
        "satis_akademisi_katilim_sayisi", "mezun", "ucret_ve_kasa_tazminati", "prim_toplam", "beyaz_mavi_yaka",
        "magaza_title", "magaza_kırılım", "kısa_gorev", "calısma_sekli", "reel_isten_cikis", "il",
        "sd_satis", "sd_adet", "sd_upt", "sd_tds", "sd_fatura",
        "magaza_hgo", "magaza_nps", "magaza_kart_verme", "magaza_yeni_musteri",
        "sd_satis_yuzde", "sd_adet_yuzde", "sd_upt_yuzde", "sd_tds_yuzde", "sd_fatura_yuzde",
        "magaza_hgo_yuzde", "magaza_nps_yuzde", "magaza_kart_verme_yuzde", "magaza_yeni_musteri_yuzde",
        # YENİ: Hedef ciro kolonları
        "aralik", "ciro_hedef", "omni_ciro", "hgo",
    ]
    magaza_cols = [c for c in magaza_cols if c in magaza_2025.columns]
    magaza_2025 = magaza_2025[magaza_cols].sort_values("donem")

    # --- Mağaza çalışanları için ML risk skoru (sadece Belirsiz Süreli + Çıkış Tarihi Boş) ---
    magaza_risk_df = None
    if not magaza_2025.empty and "donem" in magaza_2025.columns:
        latest_donem = magaza_2025["donem"].max()
        magaza_risk_df = calculate_store_risk_scores(magaza_2025, latest_donem)

        # Çıkış tarihi dolu olanları çıkar
        if magaza_risk_df is not None and not magaza_risk_df.empty and "cikis_tarihi" in magaza_risk_df.columns:
            magaza_risk_df = magaza_risk_df[magaza_risk_df["cikis_tarihi"].isna()].copy()

    # --- satis_akademisi_takip_tablosu oluştur ---
    satis_akademisi_takip_tablosu = None
    if not satis_akademisi_df.empty and not fiili_list.empty:
        print("🔄 satis_akademisi_takip_tablosu oluşturuluyor...")
        satis_akademisi_takip_tablosu = olustur_satis_akademisi_takip_tablosu(
            satis_akademisi_df,
            fiili_list,
            ayrilanlar_listesi,
            calisan_bilgisi,
            eski_kaynak,
            sonuc
        )
        if satis_akademisi_takip_tablosu is not None and "sicil" in satis_akademisi_takip_tablosu.columns:
            satis_akademisi_takip_tablosu = ensure_sicil_type(satis_akademisi_takip_tablosu, "sicil")

    # --- katılmayanlar_listesi oluştur ---
    katilmayanlar_listesi = None
    if not fiili_list.empty and satis_akademisi_takip_tablosu is not None:
        print("🔄 katılmayanlar_listesi oluşturuluyor...")
        katilmayanlar_listesi = olustur_katilmayanlar_listesi(
            fiili_list,
            satis_akademisi_takip_tablosu
        )

    # --- uzun_zamandır_egitim_almayanlar oluştur ---
    uzun_zamandır_egitim_almayanlar = None
    if satis_akademisi_takip_tablosu is not None:
        print("🔄 uzun_zamandır_egitim_almayanlar oluşturuluyor...")
        uzun_zamandır_egitim_almayanlar = olustur_uzun_zamandır_egitim_almayanlar(
            satis_akademisi_takip_tablosu
        )

    # --- Çıktı formatlarını standartlaştır (sicil, yazılar, tarihler) ---
    for _df in [
        sonuc, turnover_ust_bolum, turnover_departman_adi, turnover_isletme_adi, turnover_bolum_adi,
        turnover_magaza_calisma, turnover_analiz_aylik, turnover_cikis_detay,
        turnover_neden_ayarlari, magaza_2025, magaza_hedef_ciro, satis_akademisi_raw,
        genel_turnover, turnover_tahmin_3ay, magaza_risk_df,
        satis_akademisi_takip_tablosu, ayrilanlar_listesi, fiili_list, calisan_bilgisi, katilmayanlar_listesi,
        uzun_zamandır_egitim_almayanlar, enocta_ham, enocta_donem_sicil_ozet, kumule
    ]:
        if _df is not None and not _df.empty:
            standardize_output_df(_df)

    # Sadece satis_akademisi_takip için: çalışıyor personelde cikis_tarihi metni N/A olarak korunsun
    if (
        satis_akademisi_takip_tablosu is not None
        and not satis_akademisi_takip_tablosu.empty
        and "cikis_tarihi" in satis_akademisi_takip_tablosu.columns
        and "calisma_durumu" in satis_akademisi_takip_tablosu.columns
    ):
        satis_akademisi_takip_tablosu["cikis_tarihi"] = satis_akademisi_takip_tablosu["cikis_tarihi"].astype("string")
        aktif_mask = (
            satis_akademisi_takip_tablosu["calisma_durumu"]
            .astype("string")
            .str.lower()
            .str.contains("çalışıyor|calisiyor", regex=True, na=False)
        )
        satis_akademisi_takip_tablosu.loc[aktif_mask, "cikis_tarihi"] = "N/A"

    # --- Tahminleme detayları formatını yeniden düzenle ---
    tahmin_detay = None

    def forecast_scope_display(value):
        key = normalize_text_key(value)
        mapping = {
            "genel": "Aurelia Group",
            "edirne": "Edirne",
            "magaza": "Ma\u011faza",
            "magaza_part": "Ma\u011faza Part",
            "magaza part": "Ma\u011faza Part",
            "magaza_full": "Ma\u011faza Full",
            "magaza full": "Ma\u011faza Full",
            "merkez": "Merkez",
        }
        return mapping.get(key, repair_mojibake_text(value) if isinstance(value, str) else value)

    if turnover_tahmin_3ay is not None and not turnover_tahmin_3ay.empty:
        tahmin_detay_rows = []
        current_time = pd.Timestamp.now().strftime("%Y-%m-%d %H:%M")
        forecast_scope_cols = [
            c for c in turnover_tahmin_3ay.columns
            if c != "donem"
            and normalize_text_key(c) in {
                "genel", "edirne", "magaza", "merkez",
                "magaza_part", "magaza part", "magaza_full", "magaza full",
            }
            and not any(c.endswith(suffix) for suffix in ["_alt", "_ust", "_yontem", "_n_veri"])
        ]
        for row in turnover_tahmin_3ay.to_dict("records"):
            donem = row["donem"]
            for ust_bolum in forecast_scope_cols:
                if ust_bolum in row and not pd.isna(row[ust_bolum]):
                    tahmin_detay_rows.append({
                        "donem": donem,
                        "ust_bolum_adi": forecast_scope_display(ust_bolum),
                        "turnover_orani": row[ust_bolum],
                        "alt_guven_araligi": row.get(f"{ust_bolum}_alt"),
                        "ust_guven_araligi": row.get(f"{ust_bolum}_ust"),
                        "tahmin_tarihi": current_time,
                        "model_versiyonu": row.get(f"{ust_bolum}_yontem", "AizanoiV3.0"),
                        "n_veri": row.get(f"{ust_bolum}_n_veri"),
                    })
        tahmin_detay = pd.DataFrame(tahmin_detay_rows)

    # --- Riski Yüksek Bölgeler sayfası ---
    riski_yuksek_bolgeler = None
    if magaza_risk_df is not None and not magaza_risk_df.empty and "departman_adi" in magaza_risk_df.columns:
        riski_yuksek_bolgeler = (
            magaza_risk_df
            .groupby("departman_adi", as_index=False)
            .agg(
                ortalama_risk_skoru=("risk_olasilik", "mean"),
                personel_sayisi=("risk_olasilik", "count"),
                max_risk_skoru=("risk_olasilik", "max"),
                min_risk_skoru=("risk_olasilik", "min")
            )
            .sort_values("ortalama_risk_skoru", ascending=False)
        )
        riski_yuksek_bolgeler["ortalama_risk_skoru"] = (riski_yuksek_bolgeler["ortalama_risk_skoru"] * 100).round(1)
        riski_yuksek_bolgeler["max_risk_skoru"] = (riski_yuksek_bolgeler["max_risk_skoru"] * 100).round(1)
        riski_yuksek_bolgeler["min_risk_skoru"] = (riski_yuksek_bolgeler["min_risk_skoru"] * 100).round(1)

    # --- Riski Yüksek Mağazalar sayfası ---
    riski_yuksek_magazalar = None
    if magaza_risk_df is not None and not magaza_risk_df.empty and "isletme_adi" in magaza_risk_df.columns:
        riski_yuksek_magazalar = (
            magaza_risk_df
            .groupby("isletme_adi", as_index=False)
            .agg(
                ortalama_risk_skoru=("risk_olasilik", "mean"),
                personel_sayisi=("risk_olasilik", "count"),
                max_risk_skoru=("risk_olasilik", "max"),
                min_risk_skoru=("risk_olasilik", "min")
            )
            .sort_values("ortalama_risk_skoru", ascending=False)
        )
        riski_yuksek_magazalar["ortalama_risk_skoru"] = (riski_yuksek_magazalar["ortalama_risk_skoru"] * 100).round(1)
        riski_yuksek_magazalar["max_risk_skoru"] = (riski_yuksek_magazalar["max_risk_skoru"] * 100).round(1)
        riski_yuksek_magazalar["min_risk_skoru"] = (riski_yuksek_magazalar["min_risk_skoru"] * 100).round(1)

    # --- YENİ SAYFA: Sadece Tahmin Ayları (Güven Aralıkları ile) ---
    tahmin_aylar_only = None
    if turnover_tahmin_3ay is not None and not turnover_tahmin_3ay.empty:
        if not genel_turnover.empty:
            son_gercek_tarih = pd.to_datetime(genel_turnover["donem"].max())
            tahmin_aylar = turnover_tahmin_3ay[turnover_tahmin_3ay["donem"] > son_gercek_tarih].copy()
            if not tahmin_aylar.empty:
                tahmin_rows = []
                current_time = pd.Timestamp.now().strftime("%Y-%m-%d %H:%M")
                forecast_scope_cols = [
                    c for c in tahmin_aylar.columns
                    if c != "donem"
                    and normalize_text_key(c) in {
                        "genel", "edirne", "magaza", "merkez",
                        "magaza_part", "magaza part", "magaza_full", "magaza full",
                    }
                    and not any(c.endswith(suffix) for suffix in ["_alt", "_ust", "_yontem", "_n_veri"])
                ]
                for row in tahmin_aylar.to_dict("records"):
                    donem = row["donem"]
                    for ust_bolum in forecast_scope_cols:
                        if ust_bolum in row and not pd.isna(row[ust_bolum]):
                            tahmini_deger = float(row[ust_bolum])
                            alt_guven = row.get(f"{ust_bolum}_alt")
                            ust_guven = row.get(f"{ust_bolum}_ust")
                            if pd.isna(alt_guven) or pd.isna(ust_guven):
                                sapma = max(0.01, tahmini_deger * 0.15)
                                alt_guven = max(0.005, tahmini_deger - sapma)
                                ust_guven = min(1, tahmini_deger + sapma)
                            tahmin_rows.append({
                                "donem": donem,
                                "ust_bolum_adi": forecast_scope_display(ust_bolum),
                                "tahmini_turnover_orani": tahmini_deger,
                                "alt_guven_araligi": float(alt_guven),
                                "ust_guven_araligi": float(ust_guven),
                                "tahmin_tarihi": current_time,
                                "model_versiyonu": row.get(f"{ust_bolum}_yontem", "AizanoiV3.0"),
                                "n_veri": row.get(f"{ust_bolum}_n_veri"),
                            })
                tahmin_aylar_only = pd.DataFrame(tahmin_rows)

    gelisim_yolculuk_sheet = build_gelisim_yolculuk_sheet(
        gelisim_yolculuk_raw,
        sonuc,
        performans_magaza_verileri,
    )
    performans_magaza_verileri_sheet = performans_magaza_verileri.copy()

    print("🔄 V2 analitik tabloları oluşturuluyor...")
    v2_regrettable_turnover, v2_regrettable_detail = build_regrettable_turnover_v2(
        sonuc,
        performans_magaza_verileri,
    )
    v2_burnout_index = build_burnout_index_v2(sonuc, isgucu_kaybi_ozet)
    v2_survival_curve, v2_survival_summary, v2_survival_base = build_survival_analysis_v2(sonuc)

    # --- Ek çıktı tablolarını da formatla ---
    for _df in [
        tahmin_detay, riski_yuksek_bolgeler, riski_yuksek_magazalar, tahmin_aylar_only,
        tahmin_backtest_ozet, tahmin_backtest_detay, tahmin_yillik_backtest,
        isgucu_kaybi_ozet, izin_yuku_ozet,
        gelisim_yolculuk_sheet, performans_magaza_verileri_sheet, kumule,
        cezalar, norm_fiili_kadro, dogum_listesi, ise_alma_suresi, sinav_puanlari,
        v2_regrettable_turnover, v2_regrettable_detail, v2_burnout_index,
        v2_survival_curve, v2_survival_summary, v2_survival_base,
    ]:
        if _df is not None and not _df.empty:
            standardize_output_df(_df)

    # --- Excel'e Çoklu Sayfa Export ---
    print("💾 Excel dosyası yazdırılıyor...")
    ensure_dashboard_dir()
    if output_path.exists():
        try:
            with open(output_path, "ab"):
                pass
        except PermissionError:
            fallback = output_path.with_name(f"{output_path.stem}_{datetime.now():%Y%m%d_%H%M%S}{output_path.suffix}")
            print(f"⚠️ {output_path.name} dosyası kullanımda. Çıktı yeni dosyaya yazılacak: {fallback.name}")
            output_path = fallback

    # Never stream directly into the canonical workbook. If the process is
    # interrupted, only the temporary file is damaged and the last valid
    # production workbook remains available.
    for stale_temp in output_path.parent.glob(f".{output_path.stem}.*.tmp.xlsx"):
        try:
            stale_temp.unlink()
        except OSError:
            pass
    temp_output_path = output_path.with_name(
        f".{output_path.stem}.{os.getpid()}.tmp.xlsx"
    )

    with pd.ExcelWriter(temp_output_path, engine="openpyxl") as writer:
        # 1. sayfa: icmal_sorgu_sonuc'un kendisi
        sonuc.to_excel(writer, index=False, sheet_name="Sonuc")

        # 2–5. sayfalar: turnover kırılımları
        turnover_ust_bolum.to_excel(writer, index=False, sheet_name="Turnover_ust_bolum")
        turnover_departman_adi.to_excel(writer, index=False, sheet_name="Turnover_departman_adi")
        turnover_isletme_adi.to_excel(writer, index=False, sheet_name="Turnover_isletme_adi")
        turnover_bolum_adi.to_excel(writer, index=False, sheet_name="Turnover_bolum_adi")
        turnover_magaza_calisma.to_excel(
            writer, index=False, sheet_name="Turnover_magaza_calisma"
        )
        turnover_analiz_aylik.to_excel(
            writer, index=False, sheet_name="Turnover_Analiz_Aylik"
        )
        turnover_cikis_detay.to_excel(
            writer, index=False, sheet_name="Turnover_Cikis_Detay"
        )
        turnover_neden_ayarlari.to_excel(
            writer, index=False, sheet_name="Turnover_Neden_Ayarlari"
        )

        # 6. sayfa: Mağaza 2023+ detay
        magaza_2025.to_excel(writer, index=False, sheet_name="Magaza_2023_plus")

        # 7. sayfa: Mağaza hedef ciro
        magaza_hedef_ciro.to_excel(writer, index=False, sheet_name="Magaza_hedef_ciro")

        # 8. sayfa: R2_new_gen ham verisi
        satis_akademisi_raw.to_excel(writer, index=False, sheet_name="R2_new_gen")

        # 9. sayfa: Şirket genel turnover
        genel_turnover.to_excel(writer, index=False, sheet_name="Turnover_genel")

        # 9b. sayfa: Enocta ham veri (tamamı)
        if enocta_ham is not None:
            enocta_ham.to_excel(writer, index=False, sheet_name="enocta_tum_veri")

        # 9c. sayfa: Enocta dönem+sicil ozet (SUMIFS + COUNTIFS mantığı)
        if enocta_donem_sicil_ozet is not None:
            enocta_donem_sicil_ozet.to_excel(writer, index=False, sheet_name="enocta_donem_sicil_ozet")

        # 10. sayfa: 3 aylık turnover tahminleri (genel / edirne / mağaza / merkez)
        if turnover_tahmin_3ay is not None and not turnover_tahmin_3ay.empty:
            turnover_tahmin_3ay.to_excel(writer, index=False, sheet_name="Turnover_tahmin_3ay")

        # 11. sayfa: Mağaza ML risk skorları (sadece Belirsiz Süreli)
        if magaza_risk_df is not None and not magaza_risk_df.empty:
            magaza_risk_df.to_excel(writer, index=False, sheet_name="Magaza_ML_risk")

        # 12. sayfa: Tahminleme Detayları (yeni format)
        if tahmin_detay is not None and not tahmin_detay.empty:
            tahmin_detay.to_excel(writer, index=False, sheet_name="Tahminleme_Detaylari")

        # 13. sayfa: Riski Yüksek Bölgeler
        if riski_yuksek_bolgeler is not None and not riski_yuksek_bolgeler.empty:
            riski_yuksek_bolgeler.to_excel(writer, index=False, sheet_name="riski_yuksek_bolgeler")

        # 14. sayfa: Riski Yüksek Mağazalar
        if riski_yuksek_magazalar is not None and not riski_yuksek_magazalar.empty:
            riski_yuksek_magazalar.to_excel(writer, index=False, sheet_name="riski_yuksek_magazalar")

        # YENİ SAYFALAR
        # 15. sayfa: Ayrılanlar Listesi
        if not ayrilanlar_listesi.empty:
            ayrilanlar_listesi.to_excel(writer, index=False, sheet_name="Ayrılanlar_Listesi")

        # 16. sayfa: Fiili List
        if not fiili_list.empty:
            fiili_list.to_excel(writer, index=False, sheet_name="fiili_list")

        # 17. sayfa: Calisan Bilgisi Raporu
        if not calisan_bilgisi.empty:
            calisan_bilgisi.to_excel(writer, index=False, sheet_name="Calisan_Bilgisi_Raporu")

        # 18. sayfa: Eski Kaynak
        if not eski_kaynak.empty:
            eski_kaynak.to_excel(writer, index=False, sheet_name="eski_kaynak")

        # 19. sayfa: Satış Akademisi Takip Tablosu
        if satis_akademisi_takip_tablosu is not None and not satis_akademisi_takip_tablosu.empty:
            satis_akademisi_takip_tablosu.to_excel(writer, index=False, sheet_name="satis_akademisi_takip")

        # 19b. sayfa: Cikis Sebepleri
        if not cikis_sebepleri.empty:
            cikis_sebepleri.to_excel(writer, index=False, sheet_name="cikis_sebepleri")

        # 20. sayfa: Katılmayanlar Listesi (YENİ)
        if katilmayanlar_listesi is not None and not katilmayanlar_listesi.empty:
            katilmayanlar_listesi.to_excel(writer, index=False, sheet_name="katilmayanlar_listesi")

        # 21. sayfa: Uzun Zamandır Eğitim Almayanlar (YENİ)
        if uzun_zamandır_egitim_almayanlar is not None and not uzun_zamandır_egitim_almayanlar.empty:
            uzun_zamandır_egitim_almayanlar.to_excel(writer, index=False, sheet_name="uzun_sure_egitim_yok")

        # 22. sayfa: Sadece Tahmin Ayları (YENİ)
        if tahmin_aylar_only is not None and not tahmin_aylar_only.empty:
            tahmin_aylar_only.to_excel(writer, index=False, sheet_name="Sadece_Tahmin_Aylari")

        # 23. sayfa: Tahmin Backtest Ozet
        if tahmin_backtest_ozet is not None and not tahmin_backtest_ozet.empty:
            tahmin_backtest_ozet.to_excel(writer, index=False, sheet_name="Tahmin_Backtest_Ozet")

        # 24. sayfa: Tahmin Backtest Detay
        if tahmin_backtest_detay is not None and not tahmin_backtest_detay.empty:
            tahmin_backtest_detay.to_excel(writer, index=False, sheet_name="Tahmin_Backtest_Detay")

        # 24b. sayfa: cari yil aylik rolling-origin tahmin/backtest
        if tahmin_yillik_backtest is not None and not tahmin_yillik_backtest.empty:
            tahmin_yillik_backtest.to_excel(writer, index=False, sheet_name="Tahmin_Yillik_Backtest")

        # 25. sayfa: isgucu_kaybi ham veri
        if isgucu_kaybi_raw is not None and not isgucu_kaybi_raw.empty:
            isgucu_kaybi_sheet.to_excel(writer, index=False, sheet_name="isgucu_kaybi")

        # 26. sayfa: izin_yuku ham veri
        if izin_yuku_raw is not None and not izin_yuku_raw.empty:
            izin_yuku_sheet.to_excel(writer, index=False, sheet_name="izin_yuku")

        # 27. sayfa: isgucu_kaybi ozet
        if isgucu_kaybi_ozet is not None and not isgucu_kaybi_ozet.empty:
            isgucu_kaybi_ozet.to_excel(writer, index=False, sheet_name="isgucu_kaybi_ozet")

        # 28. sayfa: izin_yuku ozet
        if izin_yuku_ozet is not None and not izin_yuku_ozet.empty:
            izin_yuku_ozet.to_excel(writer, index=False, sheet_name="izin_yuku_ozet")

        # 29. sayfa: yurtdışı veri
        if yurtdisi_veri_icmal is not None and not yurtdisi_veri_icmal.empty:
            yurtdisi_veri_icmal.to_excel(writer, index=False, sheet_name="yurtdisi_veri_icmal")

        # 30. sayfa: Akademi gelişim yolculuğu
        if gelisim_yolculuk_sheet is not None and not gelisim_yolculuk_sheet.empty:
            gelisim_yolculuk_sheet.to_excel(writer, index=False, sheet_name="gelisim_yolculuk")

        # 31. sayfa: Mağaza performans verileri
        if performans_magaza_verileri_sheet is not None and not performans_magaza_verileri_sheet.empty:
            performans_magaza_verileri_sheet.to_excel(writer, index=False, sheet_name="performans_magaza_verileri")

        # 31b. sayfa: Kümüle karne ham verisi
        # Admin paneli tek kaynak olarak icmal_sorgu_sonuc.xlsx'i kullandığı için
        # karne verisini de aynı workbook içine taşıyoruz.
        if kumule is not None and not kumule.empty:
            kumule.to_excel(writer, index=False, sheet_name="kumule_karne")

        # 31c. sayfa: Ceza / disiplin ham verisi
        if cezalar is not None and not cezalar.empty:
            cezalar.to_excel(writer, index=False, sheet_name="cezalar")

        # 31d. sayfa: Haftalık mağaza norm / fiili kadro kaynağı
        if norm_fiili_kadro is not None and not norm_fiili_kadro.empty:
            norm_fiili_kadro.to_excel(writer, index=False, sheet_name="norm_fiili_kadro")

        # 31e. sayfa: Doğum izni / dönüş listesi kaynağı
        if dogum_listesi is not None and not dogum_listesi.empty:
            dogum_listesi.to_excel(writer, index=False, sheet_name="dogum_listesi")

        # 31f. sayfa: İşe alma süresi kaynağı
        if ise_alma_suresi is not None and not ise_alma_suresi.empty:
            ise_alma_suresi.to_excel(writer, index=False, sheet_name="ise_alma_suresi")

        # 31g-31i. sayfalar: Mağaza eğitim ve uyum skor kartı kaynakları.
        # Dashboard üreticisi yalnızca icmal_sorgu_sonuc.xlsx okur.
        check_list.to_excel(writer, index=False, sheet_name="check_list")
        isg_veri.to_excel(writer, index=False, sheet_name="isg_veri")
        zorunlu_egitim.to_excel(writer, index=False, sheet_name="zorunlu_egitim")
        sinav_puanlari.to_excel(writer, index=False, sheet_name="sinav_puanlari")

        # V2 analitik sayfaları - mevcut hesaplara dokunmadan paralel çıktı üretir.
        if v2_regrettable_turnover is not None and not v2_regrettable_turnover.empty:
            v2_regrettable_turnover.to_excel(writer, index=False, sheet_name="V2_Regrettable_Turnover")

        if v2_regrettable_detail is not None and not v2_regrettable_detail.empty:
            v2_regrettable_detail.to_excel(writer, index=False, sheet_name="V2_Regrettable_Detail")

        if v2_burnout_index is not None and not v2_burnout_index.empty:
            v2_burnout_index.to_excel(writer, index=False, sheet_name="V2_Burnout_Index")

        if v2_survival_curve is not None and not v2_survival_curve.empty:
            v2_survival_curve.to_excel(writer, index=False, sheet_name="V2_Survival_Curve")

        if v2_survival_summary is not None and not v2_survival_summary.empty:
            v2_survival_summary.to_excel(writer, index=False, sheet_name="V2_Survival_Summary")

        if v2_survival_base is not None and not v2_survival_base.empty:
            v2_survival_base.to_excel(writer, index=False, sheet_name="V2_Survival_Base")


    if not temp_output_path.exists() or temp_output_path.stat().st_size <= 1_000_000:
        raise RuntimeError("Geçici icmal çıktısı oluşmadı veya beklenenden küçük.")
    try:
        with zipfile.ZipFile(temp_output_path, "r") as archive:
            corrupt_member = archive.testzip()
            required_members = {"xl/workbook.xml", "xl/worksheets/sheet1.xml"}
            missing_members = required_members.difference(archive.namelist())
            if corrupt_member or missing_members:
                raise RuntimeError(
                    f"Geçici icmal XLSX doğrulaması başarısız: "
                    f"bozuk={corrupt_member}, eksik={sorted(missing_members)}"
                )
    except zipfile.BadZipFile as exc:
        raise RuntimeError("Geçici icmal çıktısı geçerli bir XLSX/ZIP değil.") from exc

    # Windows Defender/Excel preview handlers can briefly lock the destination
    # exactly when the validated workbook is atomically promoted. Retry only
    # access/sharing violations; other filesystem errors must still fail fast.
    replace_delays = (0.5, 1.0, 2.0, 3.0, 5.0, 8.0, 10.0)
    for attempt, delay in enumerate((*replace_delays, None), start=1):
        try:
            os.replace(temp_output_path, output_path)
            break
        except PermissionError as exc:
            if delay is None:
                raise PermissionError(
                    f"Doğrulanmış geçici icmal hazır ancak hedef dosya "
                    f"{len(replace_delays) + 1} denemede de değiştirilemedi. "
                    "Excel/önizleme pencerelerini kapatın veya antivirüs taramasının "
                    "bitmesini bekleyin."
                ) from exc
            print(
                f"⚠️ Hedef icmal kısa süreli kilitli; atomik değiştirme "
                f"{attempt}. denemeden sonra {delay:g} sn bekletiliyor..."
            )
            time.sleep(delay)
    print(f"✅ Tüm analizler tamamlandı. Çıktı: {output_path}")
    print(f"   • {len(sonuc)} satır sonuç verisi")
    print(f"   • {len(turnover_tahmin_3ay) if turnover_tahmin_3ay is not None else 0} tahmin satırı")
    print(f"   • {len(magaza_risk_df) if magaza_risk_df is not None else 0} risk skorlu çalışan")
    print(f"   • {len(riski_yuksek_bolgeler) if riski_yuksek_bolgeler is not None else 0} riskli bölge")
    print(f"   • {len(riski_yuksek_magazalar) if riski_yuksek_magazalar is not None else 0} riskli mağaza")
    print(f"   • {len(satis_akademisi_takip_tablosu) if satis_akademisi_takip_tablosu is not None else 0} satış akademisi takip kaydı")
    print(f"   • {len(katilmayanlar_listesi) if katilmayanlar_listesi is not None else 0} katılmayan personel")
    print(f"   • {len(uzun_zamandır_egitim_almayanlar) if uzun_zamandır_egitim_almayanlar is not None else 0} uzun süredir eğitim almamış personel")
    print(f"   • {len(tahmin_backtest_ozet) if tahmin_backtest_ozet is not None else 0} backtest ozet satiri")
    print(f"   • {len(tahmin_backtest_detay) if tahmin_backtest_detay is not None else 0} backtest detay satiri")
    print(f"   • {len(tahmin_yillik_backtest) if tahmin_yillik_backtest is not None else 0} cari yil aylik tahmin/backtest satiri")
    print(f"   • {len(v2_regrettable_turnover) if v2_regrettable_turnover is not None else 0} V2 regrettable turnover özet satırı")
    print(f"   • {len(v2_burnout_index) if v2_burnout_index is not None else 0} V2 operasyonel yük satırı")
    print(f"   • {len(v2_survival_summary) if v2_survival_summary is not None else 0} V2 survival özet satırı")
    print(f"   • {len(sinav_puanlari)} sınav puanı kaydı")


def generate_icmal_output() -> Path:
    """Build the main Excel workbook and return the file used downstream.

    The existing calculation flow and its fallback filename behaviour remain
    unchanged. This public function only makes it safe for the central runner
    to use the same calculation logic in-process.
    """
    main()
    candidates = sorted(
        ICMAL_XLSX.parent.glob("icmal_sorgu_sonuc*.xlsx"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    if not candidates:
        raise FileNotFoundError("icmal_sorgu_sonuc*.xlsx could not be generated.")
    return candidates[0]


if __name__ == "__main__":
    main()
