"""Yahoo Finance provider adapter (legacy / archive / fallback)."""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from .base import BaseProvider, retry_with_backoff

YAHOO_SPARK_URL = "https://query1.finance.yahoo.com/v7/finance/spark"
USER_AGENT = "Mozilla/5.0 (compatible; AizanoiMarkets/2.0; +https://aizanoianalytics.com/)"


class YahooProvider(BaseProvider):
    """Yahoo Finance spark endpoint adapter."""

    name: str = "yahoo"
    price_basis: str = "adjusted-close"

    def __init__(self, spark_url: str = YAHOO_SPARK_URL, timeout: float = 10.0) -> None:
        self.spark_url = spark_url
        self.timeout = timeout

    def _get_json(self, params: dict[str, Any]) -> Any:
        url = f"{self.spark_url}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        return retry_with_backoff(lambda: json.loads(urllib.request.urlopen(req, timeout=self.timeout).read().decode("utf-8")), max_retries=2, base_delay=1.0)

    def fetch_history(
        self,
        symbol: str,
        start_ts: int,
        end_ts: int,
        interval: str = "1d",
    ) -> list[dict[str, Any]]:
        params = {"symbols": symbol, "range": "10y", "interval": interval}
        try:
            data = self._get_json(params)
            spark = (data.get("spark") or {}).get("result") or []
            if not spark:
                return []
            response = spark[0].get("response") or []
            if not response:
                return []
            item = response[0]
            timestamps = item.get("timestamp") or []
            closes = (((item.get("indicators") or {}).get("quote") or [{}])[0].get("close") or [])
            observations = []
            for ts, close in zip(timestamps, closes):
                if ts >= start_ts and close is not None and close > 0:
                    observations.append({"t": int(ts), "c": round(float(close), 6)})
            return observations
        except Exception:
            return []

    def fetch_batch_quotes(self, symbols: list[str]) -> dict[str, float]:
        if not symbols:
            return {}
        quotes: dict[str, float] = {}
        for i in range(0, len(symbols), 20):
            chunk = symbols[i : i + 20]
            try:
                data = self._get_json({"symbols": ",".join(chunk), "range": "1d", "interval": "1d"})
                spark = (data.get("spark") or {}).get("result") or []
                for entry in spark:
                    sym = entry.get("symbol")
                    resp = (entry.get("response") or [{}])[0]
                    meta = resp.get("meta") or {}
                    price = meta.get("regularMarketPrice")
                    if sym and price is not None and price > 0:
                        quotes[sym] = round(float(price), 6)
            except Exception:
                continue
        return quotes
