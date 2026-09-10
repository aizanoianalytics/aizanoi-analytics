"""Binance public market-data provider for crypto assets."""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from .base import BaseProvider, retry_with_backoff

BINANCE_BASE_URL = "https://data-api.binance.vision"
USER_AGENT = "Mozilla/5.0 (compatible; AizanoiMarkets/2.0; +https://aizanoianalytics.com/)"


class BinanceProvider(BaseProvider):
    """Binance market data adapter via public data-api endpoints."""

    name: str = "binance"
    price_basis: str = "exchange-close"

    def __init__(self, base_url: str = BINANCE_BASE_URL, timeout: float = 10.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def _get_json(self, path: str, params: dict[str, Any]) -> Any:
        url = f"{self.base_url}{path}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})

        def _do() -> Any:
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as exc:
                if exc.code == 429:
                    retry_after = exc.headers.get("Retry-After")
                    delay = float(retry_after) if retry_after else 10.0
                    import time
                    time.sleep(delay)
                raise exc

        return retry_with_backoff(_do, max_retries=3, base_delay=1.5)

    def fetch_history(
        self,
        symbol: str,
        start_ts: int,
        end_ts: int,
        interval: str = "1d",
    ) -> list[dict[str, Any]]:
        """Fetch full kline history using pagination (limit 1000 per request)."""
        binance_interval = "1d" if interval == "1d" else "4h"
        step_seconds = 86400 if binance_interval == "1d" else 14400

        current_start_ms = start_ts * 1000
        end_ms = end_ts * 1000
        results: dict[int, float] = {}

        while current_start_ms < end_ms:
            params = {
                "symbol": symbol,
                "interval": binance_interval,
                "startTime": current_start_ms,
                "endTime": end_ms,
                "limit": 1000,
            }
            try:
                klines = self._get_json("/api/v3/klines", params)
            except Exception:
                break

            if not klines or not isinstance(klines, list):
                break

            for kline in klines:
                # kline: [open_time_ms, open, high, low, close, qty, close_time_ms, ...]
                ts_sec = int(kline[0] // 1000)
                try:
                    close = float(kline[4])
                    if close > 0:
                        results[ts_sec] = round(close, 8)
                except (ValueError, TypeError):
                    continue

            last_open_ms = int(klines[-1][0])
            next_start_ms = last_open_ms + (step_seconds * 1000)
            if next_start_ms <= current_start_ms or len(klines) < 1000:
                break
            current_start_ms = next_start_ms

        observations = [{"t": ts, "c": price} for ts, price in sorted(results.items())]
        return observations

    def fetch_batch_quotes(self, symbols: list[str]) -> dict[str, float]:
        """Fetch current prices for crypto symbols."""
        if not symbols:
            return {}
        try:
            raw = self._get_json("/api/v3/ticker/price", {})
            if isinstance(raw, list):
                lookup = {item["symbol"]: float(item["price"]) for item in raw if "symbol" in item and "price" in item}
                return {sym: lookup[sym] for sym in symbols if sym in lookup and lookup[sym] > 0}
        except Exception:
            pass
        # Fallback: query individually if full ticker call failed
        quotes: dict[str, float] = {}
        for sym in symbols:
            try:
                item = self._get_json("/api/v3/ticker/price", {"symbol": sym})
                if "price" in item:
                    quotes[sym] = float(item["price"])
            except Exception:
                continue
        return quotes
