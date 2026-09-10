#!/usr/bin/env python3
"""Build static Aizanoi Markets data shards from Yahoo Finance.

The browser never contacts Yahoo. This private updater discovers active US
listings from Nasdaq Trader, downloads Yahoo spark batches, writes one compact
JSON shard per instrument and publishes manifest/summary last.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import fcntl
import io
import json
import math
import os
import random
import re
import statistics
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Iterable

NASDAQ_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
OTHER_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"
SPARK_URL = "https://query1.finance.yahoo.com/v7/finance/spark"
SINCE_TS = 1546300800  # 2019-01-01T00:00:00Z
EXCHANGES = {"N": "NYSE", "A": "NYSE American", "P": "NYSE Arca", "Z": "CBOE BZX"}
NON_STOCK = re.compile(r"\b(warrants?|units?|rights?|preferred|notes?|bonds?|debentures?|fund|etf|etn|index)\b", re.I)
USER_AGENT = "Mozilla/5.0 (compatible; AizanoiMarkets/1.0; +https://aizanoianalytics.com/analytics/markets/)"


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def slugify(symbol: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", symbol.lower()).strip("-")


def _directory_rows(text: str) -> list[dict[str, str]]:
    rows = list(csv.DictReader(io.StringIO(text), delimiter="|"))
    return [row for row in rows if row and not next(iter(row.values()), "").startswith("File Creation Time")]


def _is_stock(name: str) -> bool:
    return bool(name) and not NON_STOCK.search(name)


def parse_universe(nasdaq_text: str, other_text: str) -> list[dict[str, str]]:
    instruments: list[dict[str, str]] = []
    for row in _directory_rows(nasdaq_text):
        if row.get("Test Issue") != "N" or row.get("ETF") != "N" or not _is_stock(row.get("Security Name", "")):
            continue
        ticker = row["Symbol"].strip()
        instruments.append({
            "market": "us", "ticker": ticker, "name": row["Security Name"].strip(),
            "exchange": "NASDAQ", "yahooSymbol": ticker.replace(".", "-"), "slug": slugify(ticker),
        })
    for row in _directory_rows(other_text):
        exchange_code = row.get("Exchange", "")
        if exchange_code not in EXCHANGES or row.get("Test Issue") != "N" or row.get("ETF") != "N" or not _is_stock(row.get("Security Name", "")):
            continue
        ticker = row["ACT Symbol"].strip()
        yahoo_symbol = (row.get("NASDAQ Symbol") or ticker.replace(".", "-")).strip()
        instruments.append({
            "market": "us", "ticker": ticker, "name": row["Security Name"].strip(),
            "exchange": EXCHANGES[exchange_code], "yahooSymbol": yahoo_symbol, "slug": slugify(ticker),
        })
    return sorted({row["yahooSymbol"]: row for row in instruments}.values(), key=lambda row: (row["ticker"], row["exchange"]))


def crypto_universe(path: Path) -> list[dict[str, str]]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    return [{**row, "market": "crypto", "exchange": "Crypto · USD", "slug": slugify(row["ticker"])} for row in rows]


def yahoo_variants(symbol: str) -> Iterable[str]:
    """Yield candidate Yahoo spellings for a Nasdaq Trader symbol.

    Dotted class shares (AKO.A) exist on Yahoo as dash form (AKO-A). Preferred
    and depositary series that Nasdaq encodes as root-series (AHL-D, ATH-A,
    TRTN-B) are served under the -P<letter> spelling (AHL-PD, ATH-PA, TRTN-PB).
    """
    seen: set[str] = set()
    candidates = [symbol]
    if "." in symbol:
        candidates.append(symbol.replace(".", "-"))
    if "-" in symbol and len(symbol.split("-", maxsplit=1)[1]) == 1:
        candidates.append(symbol.replace("-", "-P"))
    for candidate in candidates:
        if candidate and candidate not in seen:
            seen.add(candidate)
            yield candidate


def load_universe_corrections(path: Path) -> tuple[dict[str, str], set[str]]:
    corrections = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    return dict(corrections.get("overrides", {})), set(corrections.get("excludes", []))


def apply_universe_corrections(rows: list[dict[str, str]], *, overrides: dict[str, str], excludes: set[str]) -> list[dict[str, str]]:
    corrected: list[dict[str, str]] = []
    for row in rows:
        if row["yahooSymbol"] in excludes:
            continue
        item = dict(row)
        mapped = overrides.get(item["yahooSymbol"])
        if mapped:
            item["yahooSymbol"] = mapped
            item["slug"] = slugify(mapped)
        corrected.append(item)
    return corrected


def load_symbols_file(path: Path) -> list[str]:
    """Read one Yahoo symbol per line; blank lines and # comments ignored."""
    if not path.exists():
        return []
    return [line.strip() for line in path.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.strip().startswith("#")]


def prune_orphans(root: Path, keep: dict[str, set[str]]) -> int:
    """Delete history/summary shards for instruments no longer in the universe."""
    removed = 0
    for market, filenames in keep.items():
        for folder in ("history", "summary-items"):
            directory = root / folder / market
            if not directory.is_dir():
                continue
            for path in sorted(directory.iterdir()):
                if path.name.endswith(".json") and path.name not in filenames:
                    path.unlink()
                    removed += 1
    return removed


def fetch_text(url: str, timeout: int = 45) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/plain,*/*"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8")


def request_json(url: str, attempts: int = 5, timeout: int = 90) -> dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read())
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            last_error = error
            if isinstance(error, urllib.error.HTTPError) and error.code not in {429, 500, 502, 503, 504}:
                raise
            time.sleep(min(30, (2 ** attempt) + random.random()))
    raise RuntimeError(f"Yahoo request failed after {attempts} attempts: {last_error}")


def batches(values: list[Any], size: int = 20) -> Iterable[list[Any]]:
    for index in range(0, len(values), size):
        yield values[index:index + size]


def spark_url(symbols: list[str], *, range_: str, interval: str) -> str:
    query = urllib.parse.urlencode({"symbols": ",".join(symbols), "range": range_, "interval": interval})
    return f"{SPARK_URL}?{query}"


def _compact_number(value: Any) -> int | float | None:
    if not isinstance(value, (int, float)) or not math.isfinite(value):
        return None
    return round(value, 8)


def parse_spark(payload: dict[str, Any], *, interval: str, since: int = SINCE_TS) -> dict[str, list[dict[str, Any]]]:
    parsed: dict[str, list[dict[str, Any]]] = {}
    for result in payload.get("spark", {}).get("result") or []:
        symbol = result.get("symbol")
        response = (result.get("response") or [{}])[0]
        timestamps = response.get("timestamp") or []
        quote = ((response.get("indicators") or {}).get("quote") or [{}])[0]
        adjusted = ((response.get("indicators") or {}).get("adjclose") or [{}])[0].get("adjclose") or []
        candles: list[dict[str, Any]] = []
        for index, timestamp in enumerate(timestamps):
            if not isinstance(timestamp, int) or timestamp < since:
                continue
            close = (quote.get("close") or [])[index] if index < len(quote.get("close") or []) else None
            if not isinstance(close, (int, float)) or not math.isfinite(close):
                continue
            candle = {
                "t": timestamp,
                "o": _compact_number((quote.get("open") or [None] * len(timestamps))[index]),
                "h": _compact_number((quote.get("high") or [None] * len(timestamps))[index]),
                "l": _compact_number((quote.get("low") or [None] * len(timestamps))[index]),
                "c": _compact_number(close),
                "a": _compact_number(adjusted[index] if index < len(adjusted) else close),
                "v": _compact_number((quote.get("volume") or [None] * len(timestamps))[index]),
            }
            candles.append(candle)
        if symbol:
            parsed[symbol] = candles
    return parsed


def _returns(closes: list[float], sessions: int) -> float | None:
    return (closes[-1] / closes[-sessions - 1]) - 1 if len(closes) > sessions and closes[-sessions - 1] else None


def _sma(closes: list[float], sessions: int) -> float | None:
    return statistics.fmean(closes[-sessions:]) if len(closes) >= sessions else None


def _rsi(closes: list[float], sessions: int = 14) -> float | None:
    if len(closes) <= sessions:
        return None
    changes = [right - left for left, right in zip(closes[-sessions - 1:-1], closes[-sessions:])]
    gains = statistics.fmean(max(change, 0) for change in changes)
    losses = statistics.fmean(max(-change, 0) for change in changes)
    if losses == 0:
        return 100.0 if gains > 0 else 50.0
    return 100 - (100 / (1 + gains / losses))


def compute_metrics(candles: list[dict[str, Any]], *, annualization: int) -> dict[str, Any]:
    valid = [row for row in candles if isinstance(row.get("c"), (int, float)) and row["c"] > 0]
    closes = [float(row["c"]) for row in valid]
    volumes = [float(row.get("v") or 0) for row in valid]
    if not closes:
        return {"latest": None}
    log_returns = [math.log(right / left) for left, right in zip(closes[:-1], closes[1:]) if left > 0 and right > 0]
    vol_window = log_returns[-20:]
    volatility = statistics.stdev(vol_window) * math.sqrt(annualization) if len(vol_window) > 1 else None
    recent_year = closes[-min(252, len(closes)):]
    peak = -math.inf
    drawdown = 0.0
    for close in recent_year:
        peak = max(peak, close)
        drawdown = min(drawdown, close / peak - 1)
    prior_volumes = volumes[-21:-1]
    volume_z = None
    if prior_volumes:
        average = statistics.fmean(prior_volumes)
        deviation = statistics.stdev(prior_volumes) if len(prior_volumes) > 1 else 0
        volume_z = (volumes[-1] - average) / deviation if deviation > 0 else (99.0 if volumes[-1] > average else 0.0)
    latest = closes[-1]
    sma20, sma50, sma200 = (_sma(closes, size) for size in (20, 50, 200))
    high = max(recent_year)
    return {
        "latest": round(latest, 8), "return1d": _returns(closes, 1), "return7d": _returns(closes, 5),
        "return30d": _returns(closes, 21), "return90d": _returns(closes, 63), "return1y": _returns(closes, 252),
        "volatility20": volatility, "volumeZ20": volume_z, "rsi14": _rsi(closes),
        "drawdown1y": drawdown, "distanceFrom52wHigh": latest / high - 1,
        "sma20": sma20, "sma50": sma50, "sma200": sma200,
        "aboveSma20": latest > sma20 if sma20 is not None else None,
        "aboveSma50": latest > sma50 if sma50 is not None else None,
        "aboveSma200": latest > sma200 if sma200 is not None else None,
    }


def merge_candles(existing: list[dict[str, Any]], incoming: list[dict[str, Any]], *, keep_since: int = SINCE_TS) -> list[dict[str, Any]]:
    merged = {row["t"]: row for row in existing if row.get("t", 0) >= keep_since}
    merged.update({row["t"]: row for row in incoming if row.get("t", 0) >= keep_since})
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


def summary_row(instrument: dict[str, str], daily: list[dict[str, Any]], updated_at: str) -> dict[str, Any]:
    annualization = 365 if instrument["market"] == "crypto" else 252
    return {**instrument, **compute_metrics(daily, annualization=annualization), "updatedAt": updated_at}


def publish_snapshot(root: Path, instruments: list[dict[str, str]], histories: dict[str, dict[str, list[dict[str, Any]]]], *, completed_at: str) -> None:
    summaries: dict[str, list[dict[str, Any]]] = {"us": [], "crypto": []}
    for instrument in instruments:
        history = histories.get(instrument["yahooSymbol"], {"daily": [], "fourHour": []})
        daily = history.get("daily", [])
        shard = {**instrument, "startDate": dt.datetime.fromtimestamp(daily[0]["t"], dt.timezone.utc).date().isoformat() if daily else None,
                 "updatedAt": completed_at, "daily": daily, "fourHour": history.get("fourHour", [])}
        write_json_atomic(root / "history" / instrument["market"] / f"{instrument['slug']}.json", shard)
        summaries[instrument["market"]].append(summary_row(instrument, daily, completed_at))
    write_json_atomic(root / "instruments.json", instruments)
    write_json_atomic(root / "summary.json", {"markets": summaries})
    write_json_atomic(root / "manifest.json", {
        "schemaVersion": 1, "source": "Yahoo Finance", "completedAt": completed_at,
        "coverageStart": "2019-01-01", "dailyInterval": "1d", "recentInterval": "4h",
        "counts": {key: len(value) for key, value in summaries.items()}, "status": "complete",
    })


def read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def download_batch(rows: list[dict[str, str]], *, range_: str, interval: str) -> dict[str, list[dict[str, Any]]]:
    payload = request_json(spark_url([row["yahooSymbol"] for row in rows], range_=range_, interval=interval))
    since = SINCE_TS if interval == "1d" else int(time.time()) - 730 * 86400
    return parse_spark(payload, interval=interval, since=since)


def resilient_download(rows: list[dict[str, str]], fetcher: Any) -> tuple[dict[str, list[dict[str, Any]]], list[str]]:
    """Bisect a rejected batch so one stale symbol cannot block valid peers."""
    if not rows:
        return {}, []
    try:
        return fetcher(rows), []
    except Exception:
        if len(rows) == 1:
            return {}, [rows[0]["yahooSymbol"]]
        middle = len(rows) // 2
        left_data, left_failed = resilient_download(rows[:middle], fetcher)
        right_data, right_failed = resilient_download(rows[middle:], fetcher)
        return {**left_data, **right_data}, left_failed + right_failed


def build_universe(config_path: Path) -> list[dict[str, str]]:
    rows = parse_universe(fetch_text(NASDAQ_URL), fetch_text(OTHER_URL)) + crypto_universe(config_path)
    overrides, excludes = load_universe_corrections(Path(__file__).with_name("universe-corrections.json"))
    return apply_universe_corrections(rows, overrides=overrides, excludes=excludes)


def update_rows(root: Path, rows: list[dict[str, str]], *, bootstrap: bool, delay: float, skip_four_hour: bool) -> tuple[int, list[str]]:
    updated = 0
    failed: list[str] = []
    for batch_index, group in enumerate(batches(rows)):
        daily, daily_failed = resilient_download(
            group, lambda subset: download_batch(subset, range_="10y" if bootstrap else "10d", interval="1d")
        )
        if skip_four_hour:
            four_hour, four_hour_failed = {}, []
        else:
            four_hour, four_hour_failed = resilient_download(
                group, lambda subset: download_batch(subset, range_="730d" if bootstrap else "5d", interval="4h")
            )
        unavailable = set(daily_failed) | set(four_hour_failed)
        now = utc_now()
        for instrument in group:
            path = root / "history" / instrument["market"] / f"{instrument['slug']}.json"
            old = read_json(path, {})
            old_daily = old.get("daily", [])
            old_four = old.get("fourHour", [])
            merged_daily = merge_candles(old_daily, daily.get(instrument["yahooSymbol"], []))
            recent_cutoff = int(time.time()) - 730 * 86400
            merged_four = merge_candles(old_four, four_hour.get(instrument["yahooSymbol"], []), keep_since=recent_cutoff)
            if not merged_daily:
                failed.append(instrument["yahooSymbol"])
                continue
            shard = {**instrument, "startDate": dt.datetime.fromtimestamp(merged_daily[0]["t"], dt.timezone.utc).date().isoformat(),
                     "updatedAt": now, "daily": merged_daily, "fourHour": merged_four}
            write_json_atomic(path, shard)
            write_json_atomic(root / "summary-items" / instrument["market"] / f"{instrument['slug']}.json", summary_row(instrument, merged_daily, now))
            updated += 1
            if instrument["yahooSymbol"] in unavailable:
                failed.append(instrument["yahooSymbol"])
        if unavailable:
            print(f"[markets] batch {batch_index + 1} unavailable symbols: {','.join(sorted(unavailable))}", file=sys.stderr)
        if delay:
            time.sleep(delay + random.uniform(0, min(delay * 0.2, 1.0)))
    return updated, sorted(set(failed))


def aggregate(root: Path, instruments: list[dict[str, str]], completed_at: str, failed: list[str], *, slice_index: int | None = None, slice_count: int | None = None) -> None:
    markets: dict[str, list[dict[str, Any]]] = {"us": [], "crypto": []}
    for instrument in instruments:
        item = read_json(root / "summary-items" / instrument["market"] / f"{instrument['slug']}.json", None)
        if item:
            markets[instrument["market"]].append(item)
    for key in markets:
        markets[key].sort(key=lambda row: row["ticker"])
    write_json_atomic(root / "instruments.json", instruments)
    write_json_atomic(root / "summary.json", {"markets": markets})
    manifest = {
        "schemaVersion": 1, "source": "Yahoo Finance", "universeSource": "Nasdaq Trader symbol directory",
        "completedAt": completed_at, "coverageStart": "2019-01-01", "dailyInterval": "1d", "recentInterval": "4h",
        "counts": {key: len(value) for key, value in markets.items()}, "failedSymbols": failed,
        "status": "complete" if not failed else "partial", "usRefreshWindowHours": slice_count or 1,
    }
    if slice_index is not None:
        manifest["usSlice"] = {"index": slice_index, "count": slice_count}
    write_json_atomic(root / "manifest.json", manifest)


def run(args: argparse.Namespace) -> int:
    root = Path(args.data_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    lock_path = root / ".update.lock"
    with lock_path.open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("[markets] another update is already running; skipped")
            return 0
        config = Path(__file__).with_name("crypto-universe.json")
        if args.mode == "bootstrap" or not (root / "instruments.json").exists() or args.refresh_universe:
            instruments = build_universe(config)
            write_json_atomic(root / "instruments.json", instruments)
        else:
            instruments = read_json(root / "instruments.json", [])
        if args.max_symbols:
            us = [row for row in instruments if row["market"] == "us"][:args.max_symbols]
            crypto = [row for row in instruments if row["market"] == "crypto"]
            instruments = us + crypto
        if args.mode == "bootstrap":
            selected = instruments
            slice_index = None
        else:
            us = [row for row in instruments if row["market"] == "us"]
            crypto = [row for row in instruments if row["market"] == "crypto"]
            slice_index = args.slice_index if args.slice_index is not None else int(time.time() // 3600) % args.slice_count
            selected = [row for index, row in enumerate(us) if index % args.slice_count == slice_index] + crypto
        print(f"[markets] mode={args.mode} universe={len(instruments)} selected={len(selected)}")
        updated, failed = update_rows(root, selected, bootstrap=args.mode == "bootstrap", delay=args.delay, skip_four_hour=args.skip_four_hour)
        completed = utc_now()
        aggregate(root, instruments, completed, failed, slice_index=slice_index, slice_count=args.slice_count if slice_index is not None else None)
        print(f"[markets] updated={updated} failed={len(failed)} completedAt={completed}")
        return 0 if not failed or args.allow_partial else 1


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description=__doc__)
    value.add_argument("--mode", choices=("bootstrap", "hourly"), default="hourly")
    value.add_argument("--data-root", default="/var/lib/aizanoi-markets/public")
    value.add_argument("--delay", type=float, default=2.5, help="Polite delay after each <=20-symbol Yahoo batch")
    value.add_argument("--slice-count", type=int, default=8, help="Hourly US slices; every stock refreshes within this many hours")
    value.add_argument("--slice-index", type=int)
    value.add_argument("--max-symbols", type=int)
    value.add_argument("--refresh-universe", action="store_true")
    value.add_argument("--skip-four-hour", action="store_true")
    value.add_argument("--allow-partial", action="store_true")
    return value


if __name__ == "__main__":
    raise SystemExit(run(parser().parse_args()))
