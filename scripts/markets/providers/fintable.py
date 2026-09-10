"""Fintable public price API provider for US equities."""
from __future__ import annotations

import datetime as dt
import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from .base import BaseProvider, retry_with_backoff

FINTABLE_BASE_URL = "https://api.fintable.io"
USER_AGENT = "Mozilla/5.0 (compatible; AizanoiMarkets/2.0; +https://aizanoianalytics.com/)"
BATCH_SIZE = 50


class FintableProvider(BaseProvider):
    """Fintable public market data adapter for US equities."""

    name: str = "fintable"
    price_basis: str = "adjusted-close"

    def __init__(self, base_url: str = FINTABLE_BASE_URL, timeout: float = 12.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def _get_json(self, path: str, params: dict[str, Any] | None = None) -> Any:
        query_string = f"?{urllib.parse.urlencode(params)}" if params else ""
        url = f"{self.base_url}{path}{query_string}"
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})

        def _do() -> Any:
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as exc:
                if exc.code == 429:
                    retry_after = exc.headers.get("Retry-After")
                    delay = float(retry_after) if retry_after else 5.0
                    import time
                    time.sleep(delay)
                raise exc

        return retry_with_backoff(_do, max_retries=3, base_delay=1.2)

    def fetch_history(
        self,
        symbol: str,
        start_ts: int,
        end_ts: int,
        interval: str = "1d",
    ) -> list[dict[str, Any]]:
        """Fetch historical bars using range-splitting to guarantee full coverage without truncation."""
        start_date = dt.datetime.fromtimestamp(start_ts, tz=dt.timezone.utc).date()
        end_date = dt.datetime.fromtimestamp(end_ts, tz=dt.timezone.utc).date()

        # Break into bounded date windows (e.g. 2-year chunks) to avoid single-response truncation
        results: dict[int, float] = {}
        curr_start = start_date

        while curr_start < end_date:
            curr_end = min(curr_start + dt.timedelta(days=730), end_date)
            params = {
                "from": curr_start.isoformat(),
                "to": curr_end.isoformat(),
                "interval": interval,
            }
            try:
                data = self._get_json(f"/api/v2/prices/{urllib.parse.quote(symbol)}/history", params)
            except Exception:
                break

            bars = data if isinstance(data, list) else data.get("history") or data.get("bars") or []
            if not isinstance(bars, list):
                break

            for bar in bars:
                # Bar format: either {"t": timestamp_or_iso, "c" / "close" / "adjClose": price}
                ts = bar.get("t") or bar.get("timestamp") or bar.get("time") or bar.get("date")
                close = bar.get("c") or bar.get("adjClose") or bar.get("close") or bar.get("price")
                if ts is None or close is None:
                    continue

                if isinstance(ts, str):
                    try:
                        # ISO date parsing
                        parsed = dt.datetime.fromisoformat(ts.replace("Z", "+00:00"))
                        ts_sec = int(parsed.timestamp())
                    except ValueError:
                        continue
                else:
                    ts_sec = int(ts if ts < 10_000_000_000 else ts // 1000)

                try:
                    price_val = float(close)
                    if price_val > 0:
                        results[ts_sec] = round(price_val, 6)
                except (ValueError, TypeError):
                    continue

            if curr_end >= end_date:
                break
            curr_start = curr_end + dt.timedelta(days=1)

        return [{"t": ts, "c": price} for ts, price in sorted(results.items())]

    def fetch_batch_quotes(self, symbols: list[str]) -> dict[str, float]:
        """Fetch latest indicative prices in batches of up to 50 symbols."""
        if not symbols:
            return {}
        quotes: dict[str, float] = {}
        for i in range(0, len(symbols), BATCH_SIZE):
            chunk = symbols[i : i + BATCH_SIZE]
            try:
                data = self._get_json("/api/v2/prices", {"symbols": ",".join(chunk)})
                items = data if isinstance(data, list) else data.get("prices") or data.get("items") or []
                if isinstance(items, list):
                    for item in items:
                        sym = item.get("symbol") or item.get("ticker")
                        price = item.get("price") or item.get("latest") or item.get("close")
                        if sym and price is not None:
                            try:
                                p = float(price)
                                if p > 0:
                                    quotes[sym] = round(p, 6)
                            except (ValueError, TypeError):
                                pass
                elif isinstance(data, dict):
                    for sym in chunk:
                        if sym in data and isinstance(data[sym], (int, float)):
                            quotes[sym] = float(data[sym])
            except Exception:
                continue
        return quotes
