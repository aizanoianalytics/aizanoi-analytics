#!/usr/bin/env python3
"""Build static Aizanoi Markets data shards from multi-provider close data.

The browser never contacts upstream providers. This private updater discovers
active US listings from Nasdaq Trader, downloads close-price history per
symbol from the configured provider chain (Fintable for US equities,
Binance for crypto), writes one compact JSON shard per instrument and
publishes manifest/summary last.
"""
from __future__ import annotations

import argparse
import ctypes
import hashlib
import os
import datetime as dt
import hashlib
try:
    import fcntl
except ImportError:
    fcntl = None
import json
import math
import os
import random
import re
import statistics
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

try:
    from .providers import BinanceProvider, FetchResult, FintableProvider
except ImportError:
    import sys as _sys
    _sys.path.insert(0, str(Path(__file__).parent))
    from providers import BinanceProvider, FetchResult, FintableProvider  # type: ignore[no-redef]

SINCE_TS = 1546300800  # 2019-01-01T00:00:00Z


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def slugify(symbol: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", symbol.lower()).strip("-")


def crypto_universe(path: Path) -> list[dict[str, str]]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    for row in rows:
        row["market"] = "crypto"
        row["name"] = row.pop("label", row.get("name", row["ticker"]))
        row.setdefault("memberships", ["Crypto Focused 35"])
        row.setdefault("exchange", "Crypto · USDT")
        row["slug"] = slugify(row["ticker"])
    return rows


def load_universe_corrections(path: Path) -> tuple[dict[str, str], set[str]]:
    corrections = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    return dict(corrections.get("overrides", {})), set(corrections.get("excludes", []))


def apply_universe_corrections(rows: list[dict[str, str]], *, overrides: dict[str, str], excludes: set[str]) -> list[dict[str, str]]:
    """Apply only the canonical provider mapping and explicit exclusions."""
    allowed = {"market", "ticker", "name", "exchange", "slug", "provider", "providerSymbol", "memberships"}
    corrected: list[dict[str, str]] = []
    for row in rows:
        item = {key: value for key, value in row.items() if key in allowed}
        symbol = item.get("providerSymbol")
        if not symbol or symbol in excludes or not item.get("provider"):
            continue
        item["providerSymbol"] = overrides.get(symbol, symbol)
        item["slug"] = item.get("slug") or slugify(item["ticker"])
        corrected.append(item)
    return corrected

def load_symbols_file(path: Path) -> list[str]:
    """Read one provider symbol per line; blank lines and # comments ignored."""
    if not path.exists():
        return []
    return [line.strip() for line in path.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.strip().startswith("#")]


def prune_orphans(root: Path, keep: dict[str, set[str]], archive: bool = True) -> int:
    """Archive orphan history outside webroot and checksum it before unlinking."""
    removed = 0
    archive_base = root.parent / "archive"
    for market, filenames in keep.items():
        for folder in ("history", "summary-items"):
            directory = root / folder / market
            if not directory.is_dir():
                continue
            for path in sorted(directory.glob("*.json")):
                if path.name in filenames:
                    continue
                if archive and folder == "history":
                    payload = path.read_bytes()
                    try:
                        provider = json.loads(payload).get("provider") or "unknown"
                    except json.JSONDecodeError:
                        provider = "unknown"
                    target = archive_base / str(provider) / market / path.name
                    target.parent.mkdir(parents=True, exist_ok=True)
                    fd, temporary = tempfile.mkstemp(prefix=f".{target.name}.", dir=target.parent)
                    try:
                        with os.fdopen(fd, "wb") as handle:
                            handle.write(payload)
                            handle.flush()
                            os.fsync(handle.fileno())
                        os.replace(temporary, target)
                    finally:
                        if os.path.exists(temporary):
                            os.unlink(temporary)
                    if hashlib.sha256(target.read_bytes()).digest() != hashlib.sha256(payload).digest():
                        raise RuntimeError(f"archive checksum mismatch for {path}")
                path.unlink()
                removed += 1
    return removed

def _compact_number(value: Any) -> int | float | None:
    if not isinstance(value, (int, float)) or not math.isfinite(value):
        return None
    return round(value, 8)


def _returns(closes: list[float], sessions: int) -> float | None:
    return (closes[-1] / closes[-sessions - 1]) - 1 if len(closes) > sessions and closes[-sessions - 1] else None


def _returns_by_timestamp(valid: list[dict[str, Any]], days: int, annualization: int = 252) -> float | None:
    if len(valid) < 2:
        return None
    latest = valid[-1]
    latest_t = latest.get("t")
    if not isinstance(latest_t, (int, float)):
        sessions_map = {1: 1, 7: 5 if annualization == 252 else 7, 30: 21 if annualization == 252 else 30, 90: 63 if annualization == 252 else 90, 365: 252 if annualization == 252 else 365}
        closes = [float(row["c"]) for row in valid]
        return _returns(closes, sessions_map.get(days, days))
    target_ts = latest_t - (days * 86400)
    if target_ts < valid[0]["t"]:
        return None
    if days == 1:
        prev = valid[-2]
        if latest_t - prev.get("t", 0) <= 4 * 86400 and prev.get("c"):
            return (float(latest["c"]) / float(prev["c"])) - 1
        return None
    best_candle = None
    for row in reversed(valid[:-1]):
        if row.get("t", 0) <= target_ts:
            best_candle = row
            break
    if best_candle is not None and best_candle.get("c"):
        gap = target_ts - best_candle["t"]
        max_tolerance = (2 if annualization == 365 else 4) * 86400
        if gap <= max_tolerance and float(best_candle["c"]) > 0:
            return (float(latest["c"]) / float(best_candle["c"])) - 1
    return None


def _sma(closes: list[float], sessions: int) -> float | None:
    return statistics.fmean(closes[-sessions:]) if len(closes) >= sessions else None


def _wilder_rsi(closes: list[float], period: int = 14) -> float | None:
    if len(closes) <= period:
        return None
    gain_sum = 0.0
    loss_sum = 0.0
    for i in range(1, period + 1):
        diff = closes[i] - closes[i - 1]
        if diff > 0:
            gain_sum += diff
        else:
            loss_sum -= diff
    avg_gain = gain_sum / period
    avg_loss = loss_sum / period
    for i in range(period + 1, len(closes)):
        diff = closes[i] - closes[i - 1]
        gain = diff if diff > 0 else 0.0
        loss = -diff if diff < 0 else 0.0
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period
    if avg_loss == 0.0:
        return 100.0 if avg_gain > 0 else 50.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


_rsi = _wilder_rsi


def _trend_age(closes: list[float], sessions: int) -> int | None:
    if len(closes) < sessions:
        return None
    age = 0
    for end in range(len(closes), sessions - 1, -1):
        window = closes[end - sessions:end]
        if closes[end - 1] <= statistics.fmean(window):
            break
        age += 1
    return age


def compute_metrics(candles: list[dict[str, Any]], *, annualization: int, four_hour: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    valid = [row for row in candles if isinstance(row.get("c"), (int, float)) and row["c"] > 0]
    closes = [float(row["c"]) for row in valid]
    if not closes:
        return {"latest": None, "historySessions": 0, "dataQuality": {
            "dailyClose": "unavailable", "fourHour": "unavailable", "ohlcv": "unavailable", "history": "unavailable",
        }}
    log_returns = [math.log(right / left) for left, right in zip(closes[:-1], closes[1:]) if left > 0 and right > 0]
    vol_window = log_returns[-20:]
    volatility = statistics.stdev(vol_window) * math.sqrt(annualization) if len(vol_window) > 1 else None

    if valid and isinstance(valid[-1].get("t"), (int, float)):
        cutoff_52w = valid[-1]["t"] - (365 * 86400)
        recent_52w_candles = [row for row in valid if row.get("t", 0) >= cutoff_52w]
        if not recent_52w_candles:
            recent_52w_candles = valid[-min(252, len(valid)):]
        recent_year = [float(row["c"]) for row in recent_52w_candles]
    else:
        recent_year = closes[-min(252, len(closes)):]

    peak = -math.inf
    drawdown = 0.0
    for close in recent_year:
        peak = max(peak, close)
        drawdown = min(drawdown, close / peak - 1)
    latest = closes[-1]
    sma20, sma50, sma200 = (_sma(closes, size) for size in (20, 50, 200))
    sma50_prev = _sma(closes[:-1], 50)
    sma200_prev = _sma(closes[:-1], 200)
    cross = "none"
    if None not in (sma50, sma200, sma50_prev, sma200_prev):
        previous_gap = float(sma50_prev) - float(sma200_prev)
        current_gap = float(sma50) - float(sma200)
        if previous_gap <= 0 < current_gap:
            cross = "golden"
        elif previous_gap >= 0 > current_gap:
            cross = "death"
    regime = "insufficient-history"
    if None not in (sma20, sma50, sma200):
        previous_close = closes[-2] if len(closes) > 1 else latest
        if previous_close <= float(sma50_prev or sma50) and latest > float(sma50):
            regime = "recovery"
        elif previous_close >= float(sma200_prev or sma200) and latest < float(sma200):
            regime = "breakdown"
        elif latest > float(sma20) > float(sma50) > float(sma200):
            regime = "strong-uptrend"
        elif latest < float(sma20) < float(sma50) < float(sma200):
            regime = "downtrend"
        elif latest < float(sma20) and latest > float(sma50) > float(sma200):
            regime = "uptrend-weakening"
        elif abs(float(sma50) - float(sma200)) / float(sma200) <= 0.02:
            regime = "transition"
        else:
            regime = "mixed"
    low, high = min(recent_year), max(recent_year)
    range_position = (latest - low) / (high - low) if high > low else 0.5
    four_hour_rows = four_hour or []

    ret_1d = _returns_by_timestamp(valid, 1, annualization)
    ret_7d = _returns_by_timestamp(valid, 7, annualization)
    ret_30d = _returns_by_timestamp(valid, 30, annualization)
    ret_90d = _returns_by_timestamp(valid, 90, annualization)
    ret_1y = _returns_by_timestamp(valid, 365, annualization)

    return {
        "latest": round(latest, 8), "return1d": ret_1d, "return7d": ret_7d,
        "return30d": ret_30d, "return90d": ret_90d, "return1y": ret_1y,
        "volatility20": volatility, "rsi14": _wilder_rsi(closes), "drawdown1y": drawdown,
        "distanceFrom52wHigh": latest / high - 1 if high > 0 else 0.0, "rangePosition52w": range_position,
        "sma20": sma20, "sma50": sma50, "sma200": sma200, "sma50Prev": sma50_prev, "sma200Prev": sma200_prev,
        "smaCross": cross, "trendRegime": regime, "trendAge50": _trend_age(closes, 50), "historySessions": len(closes),
        "spark30": [round(value, 8) for value in closes[-30:]],
        "aboveSma20": latest > sma20 if sma20 is not None else None,
        "aboveSma50": latest > sma50 if sma50 is not None else None,
        "aboveSma200": latest > sma200 if sma200 is not None else None,
        "dataQuality": {
            "dailyClose": "complete", "fourHour": "complete" if four_hour_rows else "unavailable",
            "ohlcv": "unavailable", "history": "complete" if len(closes) >= 252 else "limited",
        },
    }


def merge_candles(existing: list[dict[str, Any]], incoming: list[dict[str, Any]], *, keep_since: int = SINCE_TS) -> list[dict[str, Any]]:
    def close_only(rows: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
        return {
            int(row["t"]): {"t": int(row["t"]), "c": _compact_number(row.get("c"))}
            for row in rows
            if isinstance(row.get("t"), (int, float)) and row.get("t", 0) >= keep_since
            and isinstance(row.get("c"), (int, float)) and math.isfinite(row["c"])
        }
    merged = close_only(existing)
    merged.update(close_only(incoming))
    return [merged[key] for key in sorted(merged)]


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o644)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def reference_close(candles: list[dict[str, Any]], target_ts: int | float, tolerance_seconds: int) -> float | None:
    """Return the nearest valid completed close at or before a calendar target."""
    candidates = [row for row in candles if isinstance(row.get("t"), (int, float))
                  and row["t"] <= target_ts and isinstance(row.get("c"), (int, float))
                  and math.isfinite(row["c"]) and row["c"] > 0]
    if not candidates:
        return None
    row = max(candidates, key=lambda item: item["t"])
    if target_ts - row["t"] > tolerance_seconds:
        return None
    return float(row["c"])


def _reference_prices(daily: list[dict[str, Any]], *, annualization: int) -> dict[str, tuple[float | None, int | None]]:
    valid = [row for row in daily if isinstance(row.get("t"), (int, float))
             and isinstance(row.get("c"), (int, float)) and math.isfinite(row["c"]) and row["c"] > 0]
    if not valid:
        return {key: (None, None) for key in ("latest", "previous", "1w", "1m", "3m", "6m", "1y", "2y", "3y", "2019")}
    tolerance = (2 if annualization == 365 else 4) * 86400
    latest = valid[-1]
    result: dict[str, tuple[float | None, int | None]] = {
        "latest": (float(latest["c"]), int(latest["t"])),
        "previous": (float(valid[-2]["c"]), int(valid[-2]["t"])) if len(valid) > 1 else (None, None),
    }
    for key, days in (("1w", 7), ("1m", 30), ("3m", 90), ("6m", 180), ("1y", 365), ("2y", 730), ("3y", 1095)):
        target = int(latest["t"] - days * 86400)
        value = reference_close(valid, target, tolerance)
        matching = next((row for row in reversed(valid) if row["t"] <= target and row["c"] == value), None) if value is not None else None
        result[key] = (value, int(matching["t"]) if matching else None)
    first_2019 = next((row for row in valid if dt.datetime.fromtimestamp(row["t"], dt.timezone.utc).year == 2019), None)
    result["2019"] = (float(first_2019["c"]), int(first_2019["t"])) if first_2019 else (None, None)
    return result


def summary_row(instrument: dict[str, str], daily: list[dict[str, Any]], updated_at: str, *, four_hour: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    annualization = 365 if instrument["market"] == "crypto" else 252
    metrics = compute_metrics(daily, annualization=annualization, four_hour=four_hour)
    refs = _reference_prices(daily, annualization=annualization)
    latest = refs["latest"][0]
    fields: dict[str, Any] = {}
    for name, (price, timestamp) in refs.items():
        prefix = "latestPrice" if name == "latest" else "previousPrice" if name == "previous" else f"price{name}"
        fields[prefix] = price
        fields[f"{prefix}At"] = timestamp
    horizons = (("1d", "previous"), ("1w", "1w"), ("1m", "1m"), ("3m", "3m"), ("6m", "6m"), ("1y", "1y"), ("2y", "2y"), ("3y", "3y"), ("Since2019", "2019"))
    for suffix, ref_name in horizons:
        reference = refs[ref_name][0]
        fields[f"return{suffix}"] = ((latest / reference) - 1) if latest is not None and reference and reference > 0 else None
    return {**instrument, **metrics, **fields, "updatedAt": updated_at}


def _median(values: list[float]) -> float | None:
    return statistics.median(values) if values else None


def _percentile(values: list[float], value: float) -> float:
    if len(values) <= 1:
        return 100.0
    below = sum(candidate < value for candidate in values)
    equal = sum(candidate == value for candidate in values)
    return round(100 * (below + 0.5 * (equal - 1)) / (len(values) - 1), 2)


def enrich_market_rows(rows: list[dict[str, Any]], *, market: str) -> dict[str, Any]:
    benchmarks: dict[str, float | None] = {}
    for key in ("return1d", "return7d", "return30d", "return90d"):
        values = [float(row[key]) for row in rows if isinstance(row.get(key), (int, float)) and math.isfinite(row[key])]
        benchmarks[key] = statistics.fmean(values) if values else None
        for row in rows:
            value = row.get(key)
            if isinstance(value, (int, float)) and math.isfinite(value):
                suffix = key.removeprefix("return")
                row[f"percentile{suffix}"] = _percentile(values, float(value))
                row[f"relativeStrength{suffix}"] = float(value) - float(benchmarks[key]) if benchmarks[key] is not None else None
            else:
                suffix = key.removeprefix("return")
                row[f"percentile{suffix}"] = None
                row[f"relativeStrength{suffix}"] = None
    volatility_values = [float(row["volatility20"]) for row in rows if isinstance(row.get("volatility20"), (int, float)) and math.isfinite(row["volatility20"])]
    for row in rows:
        volatility = row.get("volatility20")
        row["volatilityPercentile"] = _percentile(volatility_values, float(volatility)) if isinstance(volatility, (int, float)) and volatility_values else None
        momentum_inputs = (row.get("percentile30d"), row.get("percentile90d"), row.get("rangePosition52w"), row.get("trendAge50"), row.get("volatilityPercentile"), row.get("aboveSma200"))
        if all(value is not None for value in momentum_inputs):
            percentile30, percentile90 = float(row["percentile30d"]), float(row["percentile90d"])
            range_score = 100 * float(row["rangePosition52w"])
            trend_score = 100 if row.get("trendRegime") == "strong-uptrend" else 70 if row["aboveSma200"] is True else 25
            age_score = min(100.0, 2 * float(row["trendAge50"]))
            risk_penalty = 0.15 * float(row["volatilityPercentile"])
            row["momentumQuality"] = round(max(0.0, min(100.0, 0.30 * percentile30 + 0.25 * percentile90 + 0.20 * trend_score + 0.15 * range_score + 0.10 * age_score - risk_penalty)), 2)
        else:
            row["momentumQuality"] = None
        mean_reversion_inputs = (row.get("rsi14"), row.get("percentile7d"), row.get("rangePosition52w"), row.get("volatilityPercentile"), row.get("aboveSma200"))
        if all(value is not None for value in mean_reversion_inputs):
            range_score = 100 * float(row["rangePosition52w"])
            rsi_score = max(0.0, min(100.0, 100 - float(row["rsi14"])))
            return_score = 100 - float(row["percentile7d"])
            structural_penalty = 20 if row["aboveSma200"] is False else 0
            row["meanReversionScore"] = round(max(0.0, min(100.0, 0.35 * rsi_score + 0.25 * return_score + 0.25 * (100 - range_score) + 0.15 * float(row["volatilityPercentile"]) - structural_penalty)), 2)
        else:
            row["meanReversionScore"] = None
    observed = [row for row in rows if isinstance(row.get("return1d"), (int, float))]
    above = lambda key: sum(row.get(key) is True for row in rows)
    returns30 = [float(row["return30d"]) for row in rows if isinstance(row.get("return30d"), (int, float))]
    returns1y = [float(row["return1y"]) for row in rows if isinstance(row.get("return1y"), (int, float)) and math.isfinite(row["return1y"])]
    pulse = {
        "market": market, "instruments": len(rows), "observed1d": len(observed),
        "advancing": sum(row["return1d"] > 0 for row in observed),
        "declining": sum(row["return1d"] < 0 for row in observed),
        "unchanged": sum(row["return1d"] == 0 for row in observed),
        "aboveSma20": above("aboveSma20"), "aboveSma50": above("aboveSma50"), "aboveSma200": above("aboveSma200"),
        "rsiOverbought": sum(isinstance(row.get("rsi14"), (int, float)) and row["rsi14"] > 70 for row in rows),
        "rsiOversold": sum(isinstance(row.get("rsi14"), (int, float)) and row["rsi14"] < 30 for row in rows),
        "newHighs52w": sum(isinstance(row.get("rangePosition52w"), (int, float)) and row["rangePosition52w"] >= 0.995 for row in rows),
        "newLows52w": sum(isinstance(row.get("rangePosition52w"), (int, float)) and row["rangePosition52w"] <= 0.005 for row in rows),
        "medianReturn1d": _median([float(row["return1d"]) for row in observed]),
        "medianReturn30d": _median(returns30), "medianReturn1y": _median(returns1y),
        "returnSpread30d": max(returns30) - min(returns30) if returns30 else None,
        "benchmark": benchmarks,
    }
    return pulse


def _pearson(left: list[float], right: list[float]) -> float | None:
    size = min(len(left), len(right))
    if size < 3:
        return None
    a, b = left[-size:], right[-size:]
    mean_a, mean_b = statistics.fmean(a), statistics.fmean(b)
    numerator = sum((x - mean_a) * (y - mean_b) for x, y in zip(a, b))
    denominator = math.sqrt(sum((x - mean_a) ** 2 for x in a) * sum((y - mean_b) ** 2 for y in b))
    return numerator / denominator if denominator else None


def crypto_correlations(price_series: dict[str, Any]) -> dict[str, Any]:
    symbols = sorted(price_series)
    has_timestamps = any(
        isinstance(vals, list) and vals and isinstance(vals[0], dict) and "t" in vals[0]
        for vals in price_series.values()
    )

    if not has_timestamps:
        matrix: list[list[float | None]] = []
        for left in symbols:
            row: list[float | None] = []
            for right in symbols:
                if left == right:
                    row.append(1.0)
                    continue
                v_left = price_series.get(left, [])
                v_right = price_series.get(right, [])
                min_len = min(len(v_left), len(v_right))
                if min_len < 4:
                    row.append(None)
                    continue
                sub_l = v_left[-min_len:]
                sub_r = v_right[-min_len:]
                r_left_l: list[float] = []
                r_right_l: list[float] = []
                for i in range(1, min_len):
                    l0, l1 = sub_l[i - 1], sub_l[i]
                    r0, r1 = sub_r[i - 1], sub_r[i]
                    if l0 > 0 and l1 > 0 and r0 > 0 and r1 > 0:
                        r_left_l.append(math.log(l1 / l0))
                        r_right_l.append(math.log(r1 / r0))
                row.append(_pearson(r_left_l, r_right_l) if len(r_left_l) >= 3 else None)
            matrix.append(row)
    else:
        time_maps: dict[str, dict[int, float]] = {}
        for sym, items in price_series.items():
            time_maps[sym] = {
                int(item["t"]): float(item["c"])
                for item in items
                if isinstance(item, dict) and "t" in item and isinstance(item.get("c"), (int, float)) and item["c"] > 0
            }

        matrix = []
        for left in symbols:
            row = []
            for right in symbols:
                if left == right:
                    row.append(1.0)
                    continue
                common_ts = sorted(set(time_maps.get(left, {}).keys()) & set(time_maps.get(right, {}).keys()))
                if len(common_ts) < 4:
                    row.append(None)
                    continue
                eval_ts = common_ts[-201:]
                p_left = [time_maps[left][t] for t in eval_ts]
                p_right = [time_maps[right][t] for t in eval_ts]
                r_left = []
                r_right = []
                for i in range(1, len(eval_ts)):
                    pl0, pl1 = p_left[i - 1], p_left[i]
                    pr0, pr1 = p_right[i - 1], p_right[i]
                    if pl0 > 0 and pl1 > 0 and pr0 > 0 and pr1 > 0:
                        r_left.append(math.log(pl1 / pl0))
                        r_right.append(math.log(pr1 / pr0))
                row.append(_pearson(r_left, r_right) if len(r_left) >= 3 else None)
            matrix.append(row)

    pairs = [value for index, row in enumerate(matrix) for value in row[index + 1:] if value is not None]
    btc_index = symbols.index("BTC") if "BTC" in symbols else None
    btc = {symbol: matrix[btc_index][index] for index, symbol in enumerate(symbols)} if btc_index is not None else {}
    return {"symbols": symbols, "matrix": matrix, "averageCorrelation": statistics.fmean(pairs) if pairs else None, "btcCorrelation": btc}


def _append_pulse_snapshots(root: Path, completed_at: str, pulses: dict[str, dict[str, Any]]) -> None:
    path = root / "snapshots" / "pulse.json"
    current = read_json(path, {"snapshots": []})
    snapshots = current.get("snapshots", [])
    hour = completed_at[:13]
    snapshots = [row for row in snapshots if not (row.get("completedAt", "").startswith(hour) and row.get("market") in pulses)]
    for market, pulse in pulses.items():
        snapshots.append({"completedAt": completed_at, **{key: value for key, value in pulse.items() if key != "benchmark"}})
    snapshots.sort(key=lambda row: (row.get("completedAt", ""), row.get("market", "")))
    write_json_atomic(path, {"snapshots": snapshots[-720:]})


def _write_summary_chunks(root: Path, market: str, rows: list[dict[str, Any]], completed_at: str) -> None:
    chunk_count = 16 if market == "us" else 1
    buckets: list[list[dict[str, Any]]] = [[] for _ in range(chunk_count)]
    for row in rows:
        bucket = sum(row["slug"].encode("utf-8")) % chunk_count
        buckets[bucket].append(row)
    chunks = []
    for index, bucket_rows in enumerate(buckets):
        name = f"{index:02d}.json"
        write_json_atomic(root / "summary" / market / name, {"market": market, "chunk": index, "rows": bucket_rows})
        chunks.append({"path": name, "count": len(bucket_rows)})
    write_json_atomic(root / "summary" / market / "index.json", {
        "market": market, "completedAt": completed_at, "count": len(rows), "chunks": chunks,
    })


def _publish_derived(root: Path, markets: dict[str, list[dict[str, Any]]], completed_at: str, failed: list[dict[str, str]], *, fetch_meta: dict[str, dict[str, Any]] | None = None) -> dict[str, dict[str, Any]]:
    fetch_meta = fetch_meta or {}
    pulses: dict[str, dict[str, Any]] = {}
    for market, rows in markets.items():
        pulse = enrich_market_rows(rows, market=market)
        pulse["completedAt"] = completed_at
        pulses[market] = pulse
        for row in rows:
            write_json_atomic(root / "summary-items" / market / f"{row['slug']}.json", row)
        write_json_atomic(root / "summary" / f"{market}.json", {"market": market, "completedAt": completed_at, "rows": rows})
        _write_summary_chunks(root, market, rows, completed_at)
        write_json_atomic(root / "pulse" / f"{market}.json", pulse)
    crypto_series: dict[str, list[dict[str, Any]]] = {}
    for row in markets.get("crypto", []):
        shard = read_json(root / "history" / "crypto" / f"{row['slug']}.json", {})
        crypto_series[row["ticker"]] = shard.get("daily", [])
    write_json_atomic(root / "pulse" / "crypto-correlations.json", crypto_correlations(crypto_series))

    us_failed = [record for record in failed if record.get("market") == "us"]
    crypto_failed = [record for record in failed if record.get("market") == "crypto"]

    # Health semantics per spec: use truthful lastObservationAt from the actual
    # shard, not summary updatedAt. "stale" is calculated from real observation
    # ages, not hard-coded to zero.
    def _market_health(m: str, m_failed: list[str]) -> dict[str, Any]:
        rows = markets.get(m, [])
        expected = len([row for row in read_json(root / "instruments.json", []) if row.get("market") == m]) or len(rows)
        stale_threshold = 7 * 86400 if m == "us" else 49 * 3600  # us: 7d; crypto: 49h (closed daily bar may legitimately be ~48h old)
        now_ts = time.time()
        published = len(rows)
        stale = 0
        missing_history: list[str] = []
        oldest_observation: str | None = None
        newest_observation: str | None = None
        last_fetches: list[str] = []
        for row in rows:
            slug = row.get("slug")
            shard = read_json(root / "history" / m / f"{slug}.json", None) if slug else None
            if not shard or not shard.get("daily"):
                missing_history.append(row.get("ticker") or row.get("slug") or "?")
                continue
            obs = shard.get("lastObservationAt")
            if obs:
                if oldest_observation is None or obs < oldest_observation:
                    oldest_observation = obs
                if newest_observation is None or obs > newest_observation:
                    newest_observation = obs
                try:
                    obs_ts = dt.datetime.fromisoformat(obs.replace("Z", "+00:00")).timestamp()
                    if now_ts - obs_ts > stale_threshold:
                        stale += 1
                except ValueError:
                    pass
            fetched = shard.get("lastSuccessfulFetchAt")
            if fetched:
                last_fetches.append(fetched)
        # Symbols in expected but not in rows at all are outright missing
        rows_tickers = {row.get("ticker") for row in rows}
        absent = [record.get("ticker", "?") for record in m_failed if record.get("ticker") not in rows_tickers]
        provider = "fintable" if m == "us" else "binance"
        # Dedupe missing (absent from publication) with missing-history (shard empty)
        missing_union = sorted(set(absent) | set(missing_history))
        latest_fetch = max(last_fetches) if last_fetches else None
        return {
            "status": "complete" if not m_failed else "partial",
            "provider": provider,
            "priceBasis": "Adjusted close" if m == "us" else "Exchange close",
            "expected": expected,
            "published": published,
            "missingHistory": missing_union,
            "failedCurrentRefresh": sorted({record.get("ticker", "?") for record in m_failed}),
            "stale": stale,
            "latestObservationAt": newest_observation,
            "oldestObservationAt": oldest_observation,
            "latestSuccessfulFetchAt": latest_fetch,
        }

    health = {
        "schemaVersion": 3,
        "completedAt": completed_at, "counts": {key: len(value) for key, value in markets.items()},
        "failedSymbols": failed, "status": "complete" if not failed else "partial",
        "quality": {
            "closeOnly": True, "ohlcv": "unavailable",
            "fourHourUnavailable": sum(row.get("dataQuality", {}).get("fourHour") != "complete" for rows in markets.values() for row in rows),
            "limitedHistory": sum(row.get("dataQuality", {}).get("history") == "limited" for rows in markets.values() for row in rows),
        },
        "us": _market_health("us", us_failed),
        "crypto": _market_health("crypto", crypto_failed),
    }
    write_json_atomic(root / "health.json", health)
    _append_pulse_snapshots(root, completed_at, pulses)
    return pulses


def read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def download_history(
    instrument: dict[str, str],
    *,
    bootstrap: bool,
    interval: str,
) -> FetchResult:
    """Fetch history for a single instrument via the configured provider.

    Returns the provider's typed ``FetchResult``. Callers MUST inspect
    ``result.status`` instead of testing for an empty list — an empty list
    may legitimately mean SUCCESS_EMPTY_VALID (provider succeeded with no
    bars for the range). A FAILURE means the provider could not satisfy the
    request; the result carries an explicit error message and should be
    treated as a fetch failure, not a missing-data condition.
    """
    end_ts = int(time.time())
    if interval == "1d":
        start_ts = SINCE_TS if bootstrap else end_ts - 14 * 86400
    else:
        # 4h window: bootstrap ~2 years for chart continuity, hourly ~5 days
        start_ts = SINCE_TS if bootstrap else end_ts - 5 * 86400
    if instrument["market"] == "us":
        provider: Any = FintableProvider()
        provider_symbol = instrument["providerSymbol"]
    else:
        provider = BinanceProvider()
        # Crypto universe rows expose ``providerSymbol`` in Binance USDT-pair format.
        provider_symbol = instrument["providerSymbol"]
    return provider.fetch_history(provider_symbol, start_ts, end_ts, interval=interval)


def build_universe(config_path: Path) -> list[dict[str, str]]:
    us_json = Path(__file__).with_name("us-universe.json")
    if us_json.exists():
        us_rows = json.loads(us_json.read_text(encoding="utf-8"))
    else:
        try:
            from .universe_builder import build_focused_us_universe
        except ImportError:
            import sys
            sys.path.insert(0, str(Path(__file__).parent))
            from universe_builder import build_focused_us_universe
        extra_path = Path(__file__).with_name("us-universe-extra.json")
        us_rows = build_focused_us_universe(extra_path)
    rows = us_rows + crypto_universe(config_path)
    overrides, excludes = load_universe_corrections(Path(__file__).with_name("universe-corrections.json"))
    excludes_path = Path(__file__).with_name("us-universe-excludes.json")
    if excludes_path.exists():
        excludes.update(json.loads(excludes_path.read_text(encoding="utf-8")).get("excludes", {}).keys())
    return apply_universe_corrections(rows, overrides=overrides, excludes=excludes)


def validate_crypto_pairs(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    """Return typed failures for non-trading Binance pairs before publication."""
    provider = BinanceProvider()
    failures: list[dict[str, str]] = []
    for row in rows:
        if row.get("market") != "crypto":
            continue
        if not provider.validate_pair(row["providerSymbol"]):
            failures.append({"market": "crypto", "ticker": row["ticker"], "provider": "binance", "providerSymbol": row["providerSymbol"], "error": "Binance pair missing or not TRADING"})
    return failures


def _bootstrap_root(public_root: Path) -> Path:
    """Bootstrap never writes the active public tree; cutover is explicit."""
    return public_root.parent / "staging" / "bootstrap"


def _staging_path(root: Path) -> Path:
    """Bootstrap staging state lives outside the public webroot."""
    staging_dir = root.parent
    staging_dir.mkdir(parents=True, exist_ok=True)
    return staging_dir / "bootstrap-state.json"


def _load_staging_state(root: Path) -> dict[str, dict[str, Any]]:
    return read_json(_staging_path(root), {})


def _save_staging_state(root: Path, state: dict[str, dict[str, Any]]) -> None:
    write_json_atomic(_staging_path(root), state)


def update_rows(root: Path, rows: list[dict[str, str]], *, bootstrap: bool, delay: float, skip_four_hour: bool) -> tuple[int, list[dict[str, str]], dict[str, dict[str, Any]]]:
    """Fetch and publish per-instrument history shards.

    Returns:
        updated: count of shards published.
        failed: list of provider_symbol strings whose fetch returned FAILURE.
        fetch_meta: dict mapping provider_symbol to its FetchResult metadata
                    (lastSuccessfulFetchAt, status, error, attempted/completed windows)
                    so the caller can write the new health.json with truthful
                    provenance.

    In bootstrap mode, staging state is persisted between runs so an interrupted
    bootstrap resumes without redownloading validated 2019→current histories.
    """
    updated = 0
    failed: list[dict[str, str]] = []
    def failure(instrument: dict[str, str], error: str) -> dict[str, str]:
        return {"market": instrument["market"], "ticker": instrument["ticker"], "provider": instrument["provider"], "providerSymbol": instrument["providerSymbol"], "error": error}
    fetch_meta: dict[str, dict[str, Any]] = {}
    now = utc_now()
    recent_cutoff = int(time.time()) - 730 * 86400
    staging: dict[str, dict[str, Any]] = _load_staging_state(root) if bootstrap else {}
    staging_dirty = False
    for index, instrument in enumerate(rows):
        symbol = instrument["providerSymbol"]
        slug = instrument["slug"]
        market = instrument["market"]
        state_key = f"{market}/{slug}"
        prev_state = staging.get(state_key, {})
        # Skip already-validated staging entries in bootstrap mode
        if bootstrap and prev_state.get("status") == "complete":
            # Skip but preserve metadata for health
            fetch_meta[symbol] = prev_state.get("meta", {"status": "SUCCESS_COMPLETE", "cachedFromStaging": True})
            # Still need the shard for publication; loading from staging snapshot
            staged_shard = read_json(root.parent / "shards" / market / f"{slug}.json", None)
            if staged_shard:
                # Copy staged shard into production path (atomic)
                write_json_atomic(root / "history" / market / f"{slug}.json", staged_shard)
                write_json_atomic(
                    root / "summary-items" / market / f"{slug}.json",
                    summary_row(instrument, staged_shard.get("daily", []), utc_now(), four_hour=staged_shard.get("fourHour", []) if staged_shard.get("fourHour") else None),
                )
                updated += 1
            continue

        # Daily fetch
        try:
            daily_result: FetchResult = download_history(instrument, bootstrap=bootstrap, interval="1d")
        except Exception as error:  # noqa: BLE001 - per-symbol failure isolation
            print(f"[markets] daily fetch failed for {symbol}: {error}", file=sys.stderr)
            failed.append(failure(instrument, str(error)))
            fetch_meta[symbol] = {"status": "FAILURE", "error": str(error)}
            continue

        if daily_result.status == "FAILURE":
            print(f"[markets] daily FAILURE for {symbol}: {daily_result.error}", file=sys.stderr)
            failed.append(failure(instrument, daily_result.error or "provider failure"))
            fetch_meta[symbol] = {
                "status": "FAILURE",
                "error": daily_result.error,
                "attemptedWindows": daily_result.attempted_windows,
                "completedWindows": daily_result.completed_windows,
            }
            continue
        if daily_result.status == "SUCCESS_EMPTY_VALID":
            print(f"[markets] daily SUCCESS_EMPTY_VALID for {symbol} (no bars in range)", file=sys.stderr)

        daily = [b for b in daily_result.bars if isinstance(b.get("t"), (int, float)) and b["t"] >= SINCE_TS]
        fetch_meta[symbol] = {
            "status": daily_result.status,
            "error": daily_result.error,
            "attemptedWindows": daily_result.attempted_windows,
            "completedWindows": daily_result.completed_windows,
            "lastSuccessfulFetchAt": (
                daily_result.last_successful_fetch_at.isoformat().replace("+00:00", "Z")
                if daily_result.last_successful_fetch_at else None
            ),
            "priceBasis": daily_result.price_basis,
            "provider": daily_result.provider,
        }

        # Four-hour fetch (skip for US per Fintable contract; Binance supports 4h)
        four_hour: list[dict[str, Any]] = []
        if not skip_four_hour:
            try:
                four_hour_result = download_history(instrument, bootstrap=bootstrap, interval="4h")
                if four_hour_result.status == "SUCCESS_COMPLETE" or four_hour_result.status == "SUCCESS_EMPTY_VALID":
                    four_hour = [b for b in four_hour_result.bars if isinstance(b.get("t"), (int, float)) and b["t"] >= SINCE_TS]
                else:
                    print(f"[markets] 4h FAILURE for {symbol}: {four_hour_result.error}", file=sys.stderr)
            except NotImplementedError:
                # Fintable does not document 4h timeframe; this is expected for US.
                pass
            except Exception as error:  # noqa: BLE001
                print(f"[markets] 4h fetch failed for {symbol}: {error}", file=sys.stderr)

        path = root / "history" / market / f"{slug}.json"
        old = read_json(path, {})
        old_daily = old.get("daily", [])
        old_four = old.get("fourHour", [])
        # Bootstrap mode: NO SPlicing with prior-provider history. The Fintable
        # series stands alone from first real provider availability.
        if bootstrap:
            merged_daily = merge_candles([], daily)
            merged_four = merge_candles([], four_hour, keep_since=0)
        else:
            merged_daily = merge_candles(old_daily, daily)
            merged_four = merge_candles(old_four, four_hour, keep_since=recent_cutoff)

        if not merged_daily:
            failed.append(failure(instrument, str(fetch_meta[symbol].get("error") or "merged empty")))
            fetch_meta[symbol]["status"] = "FAILURE"
            fetch_meta[symbol]["error"] = (fetch_meta[symbol].get("error") or "") + " [merged empty]"
            continue

        # Provenance fields (schema v3 contract)
        last_observation_ts = merged_daily[-1]["t"]
        last_observation_iso = dt.datetime.fromtimestamp(last_observation_ts, dt.timezone.utc).isoformat().replace("+00:00", "Z")
        first_observation_iso = dt.datetime.fromtimestamp(merged_daily[0]["t"], dt.timezone.utc).date().isoformat()

        quality = compute_metrics(
            merged_daily,
            annualization=365 if market == "crypto" else 252,
            four_hour=merged_four if merged_four else None,
        ).get("dataQuality", {})

        # Schema v3 active shard fields
        shard = {
            **instrument,
            "schemaVersion": 3,
            "publishedAt": now,
            "lastSuccessfulFetchAt": fetch_meta[symbol]["lastSuccessfulFetchAt"],
            "lastObservationAt": last_observation_iso,
            "actualCoverageStart": first_observation_iso,
            "requestedCoverageStart": "2019-01-01" if bootstrap else first_observation_iso,
            "provider": daily_result.provider,
            "providerSymbol": daily_result.provider_symbol,
            "priceBasis": daily_result.price_basis,
            "dataQuality": quality,
            "fourHourAvailable": bool(four_hour) or (daily_result.provider == "binance"),
            "daily": merged_daily,
            "fourHour": merged_four,
        }
        write_json_atomic(path, shard)

        # In bootstrap mode persist staging copy so an interrupted run resumes
        if bootstrap:
            staging_shards = root.parent / "shards"
            (staging_shards / market).mkdir(parents=True, exist_ok=True)
            write_json_atomic(staging_shards / market / f"{slug}.json", shard)
            staging[state_key] = {
                "status": "complete",
                "meta": fetch_meta[symbol],
                "actualCoverageStart": first_observation_iso,
                "lastObservationAt": last_observation_iso,
            }
            staging_dirty = True

        write_json_atomic(
            root / "summary-items" / market / f"{slug}.json",
            summary_row(instrument, merged_daily, now, four_hour=merged_four),
        )
        updated += 1
        # Persist staging state every 50 instruments for resumability
        if bootstrap and staging_dirty and (updated % 50 == 0):
            _save_staging_state(root, staging)
            staging_dirty = False
        if delay and index < len(rows) - 1:
            time.sleep(delay + random.uniform(0, min(delay * 0.2, 1.0)))
    if bootstrap and staging_dirty:
        _save_staging_state(root, staging)
    return updated, sorted(failed, key=lambda record: (record["market"], record["ticker"])), fetch_meta


def health_check(root: Path, completed_at: str) -> int:
    """Read-only local staleness audit.

    No provider call. Returns non-zero when the published dataset is clearly
    unhealthy for monitoring purposes.
    """
    instruments = read_json(root / "instruments.json", [])
    if not instruments:
        print("[markets-health] instruments.json missing or empty", file=sys.stderr)
        return 2
    now_ts = time.time()
    unhealthy: list[str] = []
    for market, threshold in (("us", 7 * 86400), ("crypto", 49 * 3600)):
        rows = [row for row in instruments if row.get("market") == market]
        for row in rows:
            shard = read_json(root / "history" / market / f"{row.get('slug')}.json", None)
            if not shard or not shard.get("daily"):
                unhealthy.append(f"{market}/{row.get('slug')} missing-history")
                continue
            obs = shard.get("lastObservationAt")
            if not obs:
                unhealthy.append(f"{market}/{row.get('slug')} missing-observation")
                continue
            try:
                obs_ts = dt.datetime.fromisoformat(obs.replace("Z", "+00:00")).timestamp()
            except ValueError:
                unhealthy.append(f"{market}/{row.get('slug')} malformed-observation")
                continue
            if now_ts - obs_ts > threshold:
                unhealthy.append(f"{market}/{row.get('slug')} stale age={(int(now_ts - obs_ts))}s")
            if market == "crypto":
                four_hour = shard.get("fourHour") or []
                latest_four_hour = four_hour[-1].get("t") if four_hour else None
                if not isinstance(latest_four_hour, (int, float)):
                    unhealthy.append(f"crypto/{row.get('slug')} missing-four-hour")
                elif now_ts - latest_four_hour > 8 * 3600:
                    unhealthy.append(f"crypto/{row.get('slug')} stale-four-hour age={int(now_ts - latest_four_hour)}s")
    print(f"[markets-health] completedAt={completed_at} unhealthy={len(unhealthy)}")
    for entry in unhealthy[:20]:
        print(f"  {entry}")
    if len(unhealthy) > 20:
        print(f"  ...and {len(unhealthy) - 20} more")
    return 1 if unhealthy else 0


def rebuild_derived(root: Path, instruments: list[dict[str, str]], *, completed_at: str) -> int:
    rebuilt = 0
    for instrument in instruments:
        path = root / "history" / instrument["market"] / f"{instrument['slug']}.json"
        shard = read_json(path, None)
        if not shard:
            continue
        daily = merge_candles([], shard.get("daily", []))
        four_hour = merge_candles([], shard.get("fourHour", []), keep_since=0)
        if not daily:
            continue
        quality = compute_metrics(daily, annualization=365 if instrument["market"] == "crypto" else 252, four_hour=four_hour).get("dataQuality", {})
        first_iso = dt.datetime.fromtimestamp(daily[0]["t"], dt.timezone.utc).date().isoformat()
        last_iso = dt.datetime.fromtimestamp(daily[-1]["t"], dt.timezone.utc).isoformat().replace("+00:00", "Z")
        defaults = {"schemaVersion": 3, "provider": instrument["provider"], "providerSymbol": instrument["providerSymbol"],
                    "priceBasis": "adjusted-close" if instrument["market"] == "us" else "exchange-close",
                    "publishedAt": shard.get("publishedAt") or completed_at,
                    "lastSuccessfulFetchAt": shard.get("lastSuccessfulFetchAt") or None,
                    "lastObservationAt": shard.get("lastObservationAt") or last_iso,
                    "actualCoverageStart": shard.get("actualCoverageStart") or first_iso,
                    "requestedCoverageStart": shard.get("requestedCoverageStart") or first_iso}
        provenance = {key: shard.get(key, defaults[key]) for key in defaults}
        clean = {**instrument, **provenance, "schemaVersion": 3, "dataQuality": quality,
                 "fourHourAvailable": bool(four_hour) or instrument.get("market") == "crypto", "daily": daily, "fourHour": four_hour}
        write_json_atomic(path, clean)
        write_json_atomic(root / "summary-items" / instrument["market"] / f"{instrument['slug']}.json",
                          summary_row(instrument, daily, clean["publishedAt"], four_hour=four_hour))
        rebuilt += 1
    return rebuilt


def coverage_start(root: Path, instruments: list[dict[str, str]]) -> str:
    """Derive manifest coverageStart from the earliest shard actualCoverageStart.

    Falls back to the first daily candle date when a shard lacks the field,
    and to 2019-01-01 only when no shard yields a date at all.
    """
    starts: list[str] = []
    for instrument in instruments:
        shard = read_json(root / "history" / instrument["market"] / f"{instrument['slug']}.json", None)
        if not shard:
            continue
        value = shard.get("actualCoverageStart")
        if isinstance(value, str) and re.match(r"^\d{4}-\d{2}-\d{2}$", value):
            starts.append(value)
            continue
        daily = shard.get("daily") or []
        first = daily[0].get("t") if daily else None
        if isinstance(first, (int, float)):
            starts.append(dt.datetime.fromtimestamp(first, dt.timezone.utc).date().isoformat())
    return min(starts) if starts else "2019-01-01"


def manifest_counts(root: Path, markets: dict[str, list[dict[str, Any]]], refreshed: Any = None) -> dict[str, int]:
    """Per-market instrument counts for the manifest.

    Each refresh mode writes only its own markets; any other market keeps
    its last published count from the previous manifest instead of being
    recomputed from possibly-stale summary items.
    """
    counts = {key: len(value) for key, value in markets.items()}
    if refreshed is None:
        return counts
    prior = read_json(root / "manifest.json", {})
    prior_counts = prior.get("counts", {}) if isinstance(prior, dict) else {}
    for key in counts:
        if key not in refreshed and isinstance(prior_counts.get(key), int):
            counts[key] = prior_counts[key]
    return counts


def aggregate(root: Path, instruments: list[dict[str, str]], completed_at: str, failed: list[dict[str, str]], *, slice_index: int | None = None, slice_count: int | None = None, fetch_meta: dict[str, dict[str, Any]] | None = None, refreshed: Any = None) -> None:
    keep: dict[str, set[str]] = {}
    for row in instruments:
        m = row.get("market", "")
        if m:
            keep.setdefault(m, set()).add(f"{row['slug']}.json")
    prune_orphans(root, keep, archive=True)
    markets: dict[str, list[dict[str, Any]]] = {"us": [], "crypto": []}
    for instrument in instruments:
        item = read_json(root / "summary-items" / instrument["market"] / f"{instrument['slug']}.json", None)
        if item:
            markets[instrument["market"]].append(item)
    for key in markets:
        markets[key].sort(key=lambda row: row["ticker"])
    _publish_derived(root, markets, completed_at, failed, fetch_meta=fetch_meta)
    write_json_atomic(root / "instruments.json", instruments)
    # Compatibility payload for older clients; current frontends load one market shard only.
    write_json_atomic(root / "summary.json", {"markets": markets})
    manifest = {
        "schemaVersion": 3, "source": "Multi-provider close data", "universeSource": "Focused index union (S&P 500 ∪ Nasdaq-100 ∪ NYSE U.S. 100 ∪ DJIA ∪ Aizanoi Extra)",
        "completedAt": completed_at, "coverageStart": coverage_start(root, instruments), "dailyInterval": "1d", "recentInterval": "1d|4h",
        "dataModel": "close-only", "counts": manifest_counts(root, markets, refreshed), "failedSymbols": failed,
        "status": "complete" if not failed else "partial",
        "files": {"summary": {"us": "summary/us/index.json", "crypto": "summary/crypto/index.json"}, "pulse": {"us": "pulse/us.json", "crypto": "pulse/crypto.json"}, "health": "health.json", "snapshots": "snapshots/pulse.json"},
    }
    if slice_index is not None:
        manifest["usSlice"] = {"index": slice_index, "count": slice_count}
    write_json_atomic(root / "manifest.json", manifest)


def validate_staged_cutover(stage: Path) -> tuple[list[dict[str, Any]], str]:
    """Fail closed unless a staged tree is a complete provider-neutral v3 dataset."""
    manifest = read_json(stage / "manifest.json", {})
    instruments = read_json(stage / "instruments.json", [])
    if manifest.get("schemaVersion") != 3 or manifest.get("status") != "complete":
        raise ValueError("staged manifest is not complete schema v3")
    if not isinstance(instruments, list) or not instruments:
        raise ValueError("staged canonical universe is missing")
    digest = hashlib.sha256()
    for item in instruments:
        if not item.get("provider") or not item.get("providerSymbol") or set(item) - {"market", "ticker", "name", "exchange", "slug", "provider", "providerSymbol", "memberships"}:
            raise ValueError(f"invalid provider-neutral staged instrument: {item.get('ticker')}")
        history_path = stage / "history" / item["market"] / f"{item['slug']}.json"
        history = read_json(history_path, {})
        if history.get("schemaVersion") != 3 or history.get("provider") != item["provider"] or history.get("providerSymbol") != item["providerSymbol"]:
            raise ValueError(f"invalid staged provenance: {item.get('ticker')}")
        payload = history_path.read_bytes()
        if not payload:
            raise ValueError(f"empty staged shard: {item.get('ticker')}")
        digest.update(hashlib.sha256(payload).digest())
    counts = manifest.get("counts", {})
    for market in ("us", "crypto"):
        if counts.get(market) != sum(item.get("market") == market for item in instruments):
            raise ValueError(f"staged manifest count mismatch: {market}")
    return instruments, digest.hexdigest()


def atomic_cutover(public_root: Path) -> str:
    """Atomically exchange validated staging with public data; retain old data privately."""
    stage = _bootstrap_root(public_root)
    if not stage.is_dir() or not public_root.is_dir():
        raise ValueError("both active public root and bootstrap staging tree must exist")
    if stage.parent.stat().st_dev != public_root.parent.stat().st_dev:
        raise ValueError("staging and public roots must share a filesystem for atomic exchange")
    instruments, checksum = validate_staged_cutover(stage)
    # Linux renameat2(RENAME_EXCHANGE): one atomic directory swap; fail closed if unavailable.
    libc = ctypes.CDLL(None, use_errno=True)
    result = libc.renameat2(-100, os.fsencode(stage), -100, os.fsencode(public_root), 0x2)
    if result:
        error = ctypes.get_errno()
        raise OSError(error, f"atomic staged cutover failed: {os.strerror(error)}")
    archived = public_root.parent / "archive" / f"cutover-{utc_now().replace(':', '').replace('.', '')}"
    archived.parent.mkdir(parents=True, exist_ok=True)
    os.replace(stage, archived)
    return f"cutover instruments={len(instruments)} shardChecksum={checksum} rollbackArchive={archived}"


def run(args: argparse.Namespace) -> int:
    if args.slice_count <= 0:
        raise ValueError("--slice-count must be positive")
    if args.slice_index is not None and not (0 <= args.slice_index < args.slice_count):
        raise ValueError(f"--slice-index must be between 0 and {args.slice_count - 1}")
    if args.delay < 0:
        raise ValueError("--delay must be non-negative")

    public_root = Path(args.data_root).resolve()
    root = _bootstrap_root(public_root) if args.mode == "bootstrap" else public_root
    root.mkdir(parents=True, exist_ok=True)
    # Lock must NOT live under the publicly served root (see spec: state/ is
    # outside the webroot). The lock directory is created lazily.
    lock_path = public_root.parent / "state" / "update.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("w") as lock:
        if fcntl is not None:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                print("[markets] another update is already running; skipped")
                return 0
        if args.mode == "cutover":
            print(f"[markets] {atomic_cutover(public_root)}")
            return 0
        config = Path(__file__).with_name("crypto-universe.json")
        if args.mode == "bootstrap" or not (root / "instruments.json").exists() or args.refresh_universe:
            instruments = build_universe(config)
            prior = read_json(public_root / "instruments.json", []) if args.refresh_universe else []
            try:
                from universe_builder import validate_universe_transition
            except ImportError:
                from .universe_builder import validate_universe_transition
            if not validate_universe_transition(prior, instruments):
                raise ValueError("canonical universe transition failed validation; refusing publication")
            write_json_atomic(root / "instruments.json", instruments)
        else:
            instruments = read_json(root / "instruments.json", [])
        if args.mode == "rebuild":
            completed = utc_now()
            rebuilt = rebuild_derived(root, instruments, completed_at=completed)
            aggregate(root, instruments, completed, [])
            print(f"[markets] rebuilt={rebuilt} failed=0 completedAt={completed}")
            return 0

        all_instruments = list(instruments)
        if args.max_symbols:
            us_pool = [row for row in instruments if row["market"] == "us"][:args.max_symbols]
            crypto_pool = [row for row in instruments if row["market"] == "crypto"]
            selected_universe = us_pool + crypto_pool
        else:
            selected_universe = instruments

        if args.mode == "bootstrap":
            selected = selected_universe
            slice_index = None
        elif args.mode == "us-daily":
            # All focused US securities; no 4h (Fintable does not document 4h)
            selected = [row for row in selected_universe if row["market"] == "us"]
            slice_index = None
            args.skip_four_hour = True
        elif args.mode == "crypto-hourly":
            # All crypto (Binance) — small enough for hourly refresh
            selected = [row for row in selected_universe if row["market"] == "crypto"]
            slice_index = None
        elif args.mode == "health-check":
            # Local-only staleness check; no provider call
            completed = utc_now()
            return health_check(root, completed)
        else:  # legacy "hourly" mode retained for compatibility
            us = [row for row in selected_universe if row["market"] == "us"]
            crypto = [row for row in selected_universe if row["market"] == "crypto"]
            slice_index = args.slice_index if args.slice_index is not None else int(time.time() // 3600) % args.slice_count
            selected = [row for index, row in enumerate(us) if index % args.slice_count == slice_index] + crypto
        print(f"[markets] mode={args.mode} universe={len(all_instruments)} selected={len(selected)}")
        pair_failures = validate_crypto_pairs(selected) if args.mode in ("bootstrap", "crypto-hourly", "hourly") else []
        valid_selected = [row for row in selected if not any(failure["providerSymbol"] == row["providerSymbol"] for failure in pair_failures)]
        updated, failed, fetch_meta = update_rows(root, valid_selected, bootstrap=args.mode == "bootstrap", delay=args.delay, skip_four_hour=args.skip_four_hour)
        failed = pair_failures + failed
        completed = utc_now()
        refreshed = {"us"} if args.mode == "us-daily" else ({"crypto"} if args.mode == "crypto-hourly" else None)
        aggregate(root, all_instruments, completed, failed, slice_index=slice_index, slice_count=args.slice_count if slice_index is not None else None, fetch_meta=fetch_meta, refreshed=refreshed)
        print(f"[markets] updated={updated} failed={len(failed)} completedAt={completed}")
        return 0 if not failed or args.allow_partial else 1


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description=__doc__)
    value.add_argument("--mode", choices=("bootstrap", "cutover", "us-daily", "crypto-hourly", "hourly", "rebuild", "health-check"), default="us-daily")
    value.add_argument("--data-root", default="/var/lib/aizanoi-markets/public")
    value.add_argument("--delay", type=float, default=2.5, help="Polite delay after each per-symbol provider call")
    value.add_argument("--slice-count", type=int, default=8, help="Hourly US slices; every stock refreshes within this many hours")
    value.add_argument("--slice-index", type=int)
    value.add_argument("--max-symbols", type=int)
    value.add_argument("--refresh-universe", action="store_true")
    value.add_argument("--skip-four-hour", action="store_true")
    value.add_argument("--allow-partial", action="store_true")
    return value


if __name__ == "__main__":
    raise SystemExit(run(parser().parse_args()))
