#!/usr/bin/env python3
"""Top up the Trade Arena archive with recent closed bars ("live tails").

The browser never contacts market-data providers. The shipped archive under
frontend/arcade/trade-arena/data/raw/ is immutable release content; this private
updater writes only the bars that came AFTER each archive file ends, as small
columnar tail files plus a manifest, into a runtime directory that Nginx serves
at /arcade/trade-arena/live/:

    <out>/raw/<market>/<tf>/<SYMBOL>.json   same columns as the archive file
    <out>/manifest.json                     written last, atomically

Sources (public endpoints, no account or key):
  crypto 1d/4h/1h  Binance public market data (data-api.binance.vision), closed klines only
  crypto funding   Binance USD-M funding history (fapi.binance.com); optional
  stocks/context   Yahoo chart API (same source as the archive and as yfinance, total-return adjusted);
  bist             Borsa Istanbul stocks via Yahoo (<TICKER>.IS, TRY), plus the BIST 100 index (XU100.IS);
                   US stocks and ETFs fall back to Fintable daily bars when Yahoo is unavailable
Stock 1h/4h tails are not produced: stock intraday races are disabled in the arena.

Continuity: adjusted prices are re-anchored so the tail continues the archive's last close exactly,
and Fintable (IEX feed) volumes are rescaled to the archive's consolidated volume level.
A daily stock/context bar is published only after its US session has closed.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import statistics
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any
try:
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
except ImportError:  # pragma: no cover
    ZoneInfo = None

ROOT = Path(__file__).resolve().parents[2]
ARENA = ROOT / "frontend" / "arcade" / "trade-arena"
UA = "Mozilla/5.0 (compatible; AizanoiTradeArena/1.0; +https://aizanoianalytics.com/arcade/trade-arena/)"
BINANCE = "https://data-api.binance.vision/api/v3/klines"
FUNDING = "https://fapi.binance.com/fapi/v1/fundingRate"
YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/"
FINTABLE = "https://fintable.io/api/v2/prices/"
TF_MS = {"1d": 86_400_000, "4h": 14_400_000, "1h": 3_600_000}


def _ny_zone() -> dt.tzinfo | None:
    try:
        return ZoneInfo("America/New_York") if ZoneInfo else None
    except Exception:  # no tz database (e.g. Windows without tzdata)
        return None


NY = _ny_zone()


def ny_close_utc(d: dt.date) -> dt.datetime:
    """16:15 New York time on date d, in UTC."""
    if NY is not None:
        return dt.datetime.combine(d, dt.time(16, 15), NY).astimezone(dt.timezone.utc)
    # US daylight saving: second Sunday of March .. first Sunday of November.
    def nth_sunday(month: int, n: int) -> dt.date:
        first = dt.date(d.year, month, 1)
        return first + dt.timedelta(days=(6 - first.weekday()) % 7 + 7 * (n - 1))
    offset = 4 if nth_sunday(3, 2) <= d < nth_sunday(11, 1) else 5
    return dt.datetime.combine(d, dt.time(16 + offset, 15), dt.timezone.utc)
DAY = 86_400_000


def now_ms() -> int:
    return int(time.time() * 1000)


def get_json(url: str, tries: int = 4, timeout: float = 20.0) -> Any:
    last: Exception | None = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code not in (418, 429) and exc.code < 500:
                body = exc.read().decode("utf-8", "replace")[:300]
                raise RuntimeError(f"HTTP {exc.code} {body}") from exc
        except (urllib.error.URLError, TimeoutError, ConnectionError, ValueError) as exc:
            last = exc
        time.sleep(1.5 * 2 ** i)
    raise RuntimeError(f"{url.split('?')[0]}: {last}")


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(value, fh, separators=(",", ":"), allow_nan=False)
            fh.flush()
            os.fsync(fh.fileno())
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def load_universe() -> dict[str, list[dict[str, str]]]:
    src = (ARENA / "engine" / "universe.js").read_text(encoding="utf-8")
    m = re.search(r"export const UNIVERSE = (\{.*?\n\});", src, re.S)
    if not m:
        raise SystemExit("cannot parse engine/universe.js")
    return json.loads(m.group(1))


def series_cols(base: dict[str, Any]) -> list[str]:
    n = len(base["t"])
    return [k for k, v in base.items() if isinstance(v, list) and len(v) == n and k not in ("dividends", "splits")]


def session_closed(day_ms: int, now: int, exchange: str = "US") -> bool:
    """A daily bar (timestamp = midnight UTC of the trading date) is final after the session closed:
    16:15 New York time for US data, 18:30 Istanbul time (UTC+3, no DST) for Borsa Istanbul."""
    d = dt.datetime.fromtimestamp(day_ms / 1000, dt.timezone.utc).date()
    if exchange == "BIST":
        return now >= int(dt.datetime.combine(d, dt.time(15, 30), dt.timezone.utc).timestamp() * 1000)
    return now >= int(ny_close_utc(d).timestamp() * 1000)


def utc_day(ts_seconds: float, gmtoffset: int = 0) -> int:
    d = dt.datetime.fromtimestamp(ts_seconds + gmtoffset, dt.timezone.utc).date()
    return int(dt.datetime.combine(d, dt.time.min, dt.timezone.utc).timestamp() * 1000)


# ---------------------------------------------------------------- providers

def binance_tail(pair: str, tf: str, after: int, cols: list[str]) -> dict[str, list]:
    out: dict[str, list] = {k: [] for k in cols}
    start, now = after + TF_MS[tf], now_ms()
    for _ in range(200):
        q = urllib.parse.urlencode({"symbol": pair, "interval": tf, "startTime": start, "limit": 1000})
        rows = get_json(f"{BINANCE}?{q}")
        if not isinstance(rows, list):
            raise RuntimeError(f"unexpected klines payload {str(rows)[:120]}")
        for r in rows:
            if int(r[6]) > now or int(r[0]) <= after:
                continue  # still-open candle or overlap
            row = {"t": int(r[0]), "o": float(r[1]), "h": float(r[2]), "l": float(r[3]), "c": float(r[4]), "v": float(r[5]),
                   "qv": float(r[7]), "n": int(r[8]), "tb": float(r[9]), "tq": float(r[10])}
            for k in cols:
                out[k].append(row.get(k, 0))
        if len(rows) < 1000:
            break
        start = int(rows[-1][0]) + TF_MS[tf]
        time.sleep(0.15)
    return out


def funding_tail(pair: str, after: int) -> dict[str, list]:
    out: dict[str, list] = {"t": [], "rate": []}
    start = after + 1
    for _ in range(50):
        q = urllib.parse.urlencode({"symbol": pair, "startTime": start, "limit": 1000})
        rows = get_json(f"{FUNDING}?{q}")
        if not isinstance(rows, list):
            raise RuntimeError("unexpected funding payload")
        for r in rows:
            if int(r["fundingTime"]) > after:
                out["t"].append(int(r["fundingTime"]))
                out["rate"].append(float(r["fundingRate"]))
        if len(rows) < 1000:
            break
        start = int(rows[-1]["fundingTime"]) + 1
        time.sleep(0.25)
    return out


def yahoo_daily(symbol: str, since: int) -> list[dict[str, float]]:
    q = urllib.parse.urlencode({"period1": since // 1000, "period2": 9_999_999_999, "interval": "1d", "events": "div,splits", "includePrePost": "false"})
    body = get_json(f"{YAHOO}{urllib.parse.quote(symbol)}?{q}")
    res = (body.get("chart") or {}).get("result") or [None]
    res = res[0]
    if not res or not res.get("timestamp"):
        raise RuntimeError(f"yahoo {symbol}: no data")
    quote = res["indicators"]["quote"][0]
    adj = (res["indicators"].get("adjclose") or [{}])[0].get("adjclose")
    off = int(res["meta"].get("gmtoffset") or 0)
    rows: dict[int, dict[str, float]] = {}
    for i, ts in enumerate(res["timestamp"]):
        o, h, l, c = (quote[k][i] for k in ("open", "high", "low", "close"))
        if not all(isinstance(x, (int, float)) for x in (o, h, l, c)) or c <= 0:
            continue
        k = adj[i] / c if adj and isinstance(adj[i], (int, float)) else 1.0
        t = utc_day(ts, off)
        rows[t] = {"t": t, "o": o * k, "h": max(h, o, c) * k, "l": min(l, o, c) * k, "c": c * k, "v": float(quote["volume"][i] or 0), "rawClose": c}
    return [rows[t] for t in sorted(rows)]


def fintable_daily(symbol: str, since: int) -> list[dict[str, float]]:
    start = dt.datetime.fromtimestamp(since / 1000, dt.timezone.utc).date().isoformat()
    end = (dt.datetime.now(dt.timezone.utc).date() + dt.timedelta(days=1)).isoformat()
    q = urllib.parse.urlencode({"timeframe": "1day", "start": start, "end": end, "limit": 1000})
    body = get_json(f"{FINTABLE}{urllib.parse.quote(symbol)}/history?{q}")
    bars = ((body or {}).get("data") or {}).get("bars")
    if not isinstance(bars, list):
        raise RuntimeError(f"fintable {symbol}: {str(body)[:160]}")
    rows = []
    for b in bars:
        try:
            d = dt.date.fromisoformat(b["date"])
            o, h, l, c = (float(b[k]) for k in ("open", "high", "low", "close"))
        except (KeyError, TypeError, ValueError):
            continue
        if c <= 0:
            continue
        t = int(dt.datetime.combine(d, dt.time.min, dt.timezone.utc).timestamp() * 1000)
        rows.append({"t": t, "o": o, "h": max(h, o, c), "l": min(l, o, c), "c": c, "v": float(b.get("volume") or 0), "rawClose": c})
    return rows


def stitch_daily(base: dict[str, Any], rows: list[dict[str, float]], cols: list[str], *, rescale_volume: bool, exchange: str = "US") -> dict[str, list]:
    """Anchor prices to the archive's last close and keep only closed sessions after it."""
    last_t = base["t"][-1]
    # Anchor on the latest session both sides have (providers occasionally revise or drop a recent row).
    recent = dict(zip(base["t"][-30:], base["c"][-30:]))
    anchor = next((r for r in reversed(rows) if r["t"] in recent), None)
    if anchor is None:
        raise RuntimeError("no overlap with the archive's recent sessions")
    k = recent[anchor["t"]] / anchor["c"]
    vk = 1.0
    if rescale_volume:
        bv = [v for v in base["v"][-20:] if v > 0]
        tv = [r["v"] for r in rows if r["t"] <= last_t and r["v"] > 0][-20:]
        if bv and tv:
            vk = statistics.median(bv) / statistics.median(tv)
    now = now_ms()
    out: dict[str, list] = {c: [] for c in cols}
    for r in rows:
        if r["t"] <= last_t or not session_closed(r["t"], now, exchange):
            continue
        row = {"t": r["t"], "o": r["o"] * k, "h": r["h"] * k, "l": r["l"] * k, "c": r["c"] * k, "v": r["v"] * vk, "rawClose": r["rawClose"]}
        for c in cols:
            out[c].append(row.get(c, 0))
    return out


# ---------------------------------------------------------------- jobs

def run(args: argparse.Namespace) -> int:
    archive, out = Path(args.archive), Path(args.out)
    uni = load_universe()
    jobs: list[tuple[str, str, str, dict[str, str]]] = []
    for a in uni["crypto"]:
        for tf in ("1d", "4h", "1h"):
            jobs.append(("crypto", tf, a["ticker"], a))
        jobs.append(("crypto", "funding", a["ticker"], a))
    for a in uni["stocks"]:
        jobs.append(("stocks", "1d", a["ticker"], a))
    for a in uni.get("bist", []):
        jobs.append(("bist", "1d", a["ticker"], a))
    for a in uni["context"]:
        jobs.append(("context", "1d", a["ticker"], a))
    if args.only:
        jobs = [j for j in jobs if any(o in f"{j[0]}/{j[1]}/{j[2]}" for o in args.only)]

    series: dict[str, Any] = {}
    failed: list[dict[str, str]] = []
    for market, tf, sym, a in jobs:
        key = f"{market}/{tf}/{sym}"
        base_file = archive / market / tf / f"{sym}.json"
        if tf == "funding" and not base_file.exists():
            continue  # the archive has no perpetual for this asset
        try:
            base = json.loads(base_file.read_text(encoding="utf-8"))
            if not base.get("t"):
                raise RuntimeError("empty archive file")
            after = base["t"][-1]
            if market == "crypto" and tf == "funding":
                try:
                    tail, source = funding_tail(a["providerSymbol"], after), "binance-futures"
                except RuntimeError as exc:
                    if "HTTP 4" in str(exc) and "Invalid symbol" in str(exc):
                        continue  # no perpetual for this asset
                    raise
            elif market == "crypto":
                tail, source = binance_tail(a["providerSymbol"], tf, after, series_cols(base)), "binance"
            else:
                cols, since = series_cols(base), after - 45 * DAY
                ysym = a.get("yahoo") or sym
                exch = "BIST" if ysym.endswith(".IS") else "US"
                try:
                    if args.no_yahoo:
                        raise RuntimeError("yahoo disabled")
                    tail, source = stitch_daily(base, yahoo_daily(ysym, since), cols, rescale_volume=False, exchange=exch), "yahoo"
                except RuntimeError as exc:
                    if ysym.startswith("^") or sym == "DXY" or exch == "BIST":
                        raise RuntimeError(f"yahoo only: {exc}") from exc
                    tail, source = stitch_daily(base, fintable_daily(sym, since), cols, rescale_volume=True), "fintable-iex"
            n = len(tail["t"])
            write_json_atomic(out / "raw" / market / tf / f"{sym}.json", {"symbol": sym, "market": market, "tf": tf, "source": source,
                              "after": after, "updated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), **tail})
            series[key] = {"after": after, "bars": n, "last": tail["t"][-1] if n else after, "source": source}
            if args.verbose:
                print(f"{key:28} +{n:5d} bars  {source}")
        except Exception as exc:  # one failed series never blocks the others
            failed.append({"series": key, "error": str(exc)[:200]})
            print(f"{key:28} FAILED {exc}", file=sys.stderr)

    if args.only:  # partial runs merge into the previous manifest
        try:
            old = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
            series = {**old.get("series", {}), **series}
        except (OSError, ValueError):
            pass

    def end_of(prefix: str, spec: str = "date") -> str | None:
        lasts = [v["last"] for k, v in series.items() if k.startswith(prefix)]
        if not lasts:
            return None
        when = dt.datetime.fromtimestamp(max(lasts) / 1000, dt.timezone.utc)
        return when.date().isoformat() if spec == "date" else when.isoformat(timespec="minutes")

    manifest = {"version": 1, "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                "end": {"crypto": end_of("crypto/1d/"), "stocks": end_of("stocks/1d/"), "bist": end_of("bist/1d/"), "context": end_of("context/1d/"),
                        "crypto4h": end_of("crypto/4h/", "time"), "crypto1h": end_of("crypto/1h/", "time")},
                "series": series, "failed": failed}
    write_json_atomic(out / "manifest.json", manifest)
    print(f"live tails: {len(series)} ok, {len(failed)} failed; crypto through {manifest['end']['crypto']}, stocks through {manifest['end']['stocks']}")
    return 1 if failed and not args.allow_partial else 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--archive", default=str(ARENA / "data" / "raw"), help="shipped archive data/raw directory")
    p.add_argument("--out", default="/var/lib/aizanoi-trade-arena/live", help="runtime directory served at /arcade/trade-arena/live/")
    p.add_argument("--only", nargs="*", help="substring filter, e.g. crypto/1d stocks/1d/AAPL")
    p.add_argument("--no-yahoo", action="store_true", help="use Fintable for US stocks/ETFs (VIX/TNX/DXY are skipped)")
    p.add_argument("--allow-partial", action="store_true", help="exit 0 when some series failed")
    p.add_argument("-v", "--verbose", action="store_true")
    return run(p.parse_args())


if __name__ == "__main__":
    sys.exit(main())
