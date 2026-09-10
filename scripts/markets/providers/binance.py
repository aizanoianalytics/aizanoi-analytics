"""Binance public market-data provider for crypto assets.

Implements the documented ``data-api.binance.vision`` contract:

* exchangeInfo: GET /api/v3/exchangeInfo?symbol=BTCUSDT
* klines:       GET /api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000
* ticker:       GET /api/v3/ticker/price?symbol=BTCUSDT

No authentication required for public market data. The provider filters
out the still-open / unclosed kline (closeTime > now) so callers never see
a half-formed current candle.
"""
from __future__ import annotations

import datetime as dt
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Literal, TypedDict

from .base import BaseProvider, retry_with_backoff

BINANCE_BASE_URL = "https://data-api.binance.vision"
USER_AGENT = "Mozilla/5.0 (compatible; AizanoiMarkets/2.0; +https://aizanoianalytics.com/)"
TIMEOUT_SECONDS = 15.0
PAGE_LIMIT = 1000  # documented kline cap per request


class Bar(TypedDict):
    """Canonical close-only bar: UNIX seconds + close price."""

    t: int
    c: float


class QuoteSnapshot(TypedDict):
    """Latest indicative quote for a single symbol."""

    symbol: str
    price: float
    as_of: dt.datetime | None


Status = Literal["SUCCESS_COMPLETE", "SUCCESS_EMPTY_VALID", "FAILURE", "PARTIAL_FAILURE"]


@dataclass
class FetchResult:
    """Typed result envelope for ``fetch_history``.

    * ``SUCCESS_COMPLETE``: every requested page succeeded (and at least one
      bar was retained after the closed-kline filter).
    * ``SUCCESS_EMPTY_VALID``: provider responded, but every returned kline
      was filtered out because its closeTime is in the future (still-open
      candle). This is normal near the start of an interval window.
    * ``FAILURE``: a page request failed and partial mode was not enabled.
    * ``PARTIAL_FAILURE``: caller opted into partial mode and at least one
      page succeeded while at least one failed.
    """

    status: Status
    bars: list[Bar]
    provider: str
    provider_symbol: str
    price_basis: str
    error: str | None = None
    attempted_windows: int = 0
    completed_windows: int = 0
    last_successful_fetch_at: dt.datetime | None = None


_INTERVAL_MAP: dict[str, str] = {
    "1d": "1d",
    "4h": "4h",
    "1h": "1h",
}

_INTERVAL_STEP_MS: dict[str, int] = {
    "1d": 86_400_000,
    "4h": 14_400_000,
    "1h": 3_600_000,
}


def _now_ms() -> int:
    return int(time.time() * 1000)


class BinanceProvider(BaseProvider):
    """Binance market data adapter via public data-api endpoints."""

    name: str = "binance"
    price_basis: str = "exchange-close"

    def __init__(
        self,
        base_url: str = BINANCE_BASE_URL,
        timeout: float = TIMEOUT_SECONDS,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = float(timeout)
        self._validate_cache: dict[str, bool] = {}

    # ------------------------------------------------------------------ HTTP

    def _request_json(self, path: str, params: dict[str, Any] | None = None) -> Any:
        query = f"?{urllib.parse.urlencode(params)}" if params else ""
        url = f"{self.base_url}{path}{query}"
        req = urllib.request.Request(
            url,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        )

        def _do() -> Any:
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as exc:
                # Respect Retry-After before propagating so retry_with_backoff
                # adds its own exponential delay on top.
                if exc.code == 429:
                    retry_after_raw = exc.headers.get("Retry-After")
                    try:
                        retry_after = float(retry_after_raw) if retry_after_raw else 10.0
                    except (TypeError, ValueError):
                        retry_after = 10.0
                    time.sleep(retry_after)
                raise
            except urllib.error.URLError as exc:
                raise ConnectionError(f"Binance network error: {exc.reason}") from exc
            except TimeoutError as exc:
                raise TimeoutError(f"Binance request timed out after {self.timeout}s") from exc
            except json.JSONDecodeError as exc:
                raise ValueError(f"Binance returned malformed JSON: {exc.msg}") from exc

        return retry_with_backoff(_do, max_retries=3, base_delay=1.5)

    # ------------------------------------------------------------------ Public API

    def fetch_history(
        self,
        symbol: str,
        start_ts: int,
        end_ts: int,
        interval: str = "1d",
        *,
        allow_partial: bool = False,
    ) -> FetchResult:
        """Fetch historical klines for ``symbol`` between ``start_ts`` and ``end_ts``.

        Pages forward from ``start_ts`` using Binance's documented
        ``startTime``/``endTime`` parameters, capped at ``PAGE_LIMIT`` per
        page. The still-open / unclosed kline (closeTime > now) is always
        filtered out of the result set.
        """
        if not symbol:
            return FetchResult(
                status="FAILURE",
                bars=[],
                provider=self.name,
                provider_symbol="",
                price_basis=self.price_basis,
                error="symbol is required",
            )
        if end_ts <= start_ts:
            return FetchResult(
                status="FAILURE",
                bars=[],
                provider=self.name,
                provider_symbol=symbol,
                price_basis=self.price_basis,
                error=f"end_ts ({end_ts}) must be greater than start_ts ({start_ts})",
            )

        binance_interval = _INTERVAL_MAP.get(interval)
        if binance_interval is None:
            raise NotImplementedError(f"Binance interval {interval!r} is not supported")
        step_ms = _INTERVAL_STEP_MS[binance_interval]

        start_ms = start_ts * 1000
        end_ms = end_ts * 1000
        now_ms = _now_ms()

        bars: list[Bar] = []
        errors: list[str] = []
        attempted = 0
        completed = 0
        last_success_at: dt.datetime | None = None
        cursor_ms = start_ms

        while cursor_ms < end_ms:
            attempted += 1
            params = {
                "symbol": symbol,
                "interval": binance_interval,
                "startTime": cursor_ms,
                "endTime": end_ms,
                "limit": PAGE_LIMIT,
            }
            try:
                page = self._request_json("/api/v3/klines", params)
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError, ConnectionError) as exc:
                msg = (
                    f"Binance kline page starting at "
                    f"{dt.datetime.fromtimestamp(cursor_ms / 1000, tz=dt.timezone.utc).isoformat()} failed: {exc}"
                )
                errors.append(msg)
                if not allow_partial:
                    return FetchResult(
                        status="FAILURE",
                        bars=[],
                        provider=self.name,
                        provider_symbol=symbol,
                        price_basis=self.price_basis,
                        error=msg,
                        attempted_windows=attempted,
                        completed_windows=completed,
                        last_successful_fetch_at=last_success_at,
                    )
                # Partial mode: jump forward by one full step and continue.
                cursor_ms += step_ms * PAGE_LIMIT
                continue

            if not isinstance(page, list):
                msg = "Binance klines returned non-list payload"
                errors.append(msg)
                if not allow_partial:
                    return FetchResult(
                        status="FAILURE",
                        bars=[],
                        provider=self.name,
                        provider_symbol=symbol,
                        price_basis=self.price_basis,
                        error=msg,
                        attempted_windows=attempted,
                        completed_windows=completed,
                        last_successful_fetch_at=last_success_at,
                    )
                cursor_ms += step_ms * PAGE_LIMIT
                continue

            for kline in page:
                if not isinstance(kline, list) or len(kline) < 7:
                    continue
                try:
                    open_ms = int(kline[0])
                    close_ms = int(kline[6])
                    close = float(kline[4])
                except (TypeError, ValueError):
                    continue
                if close <= 0:
                    continue
                # CRITICAL: drop the still-open / unclosed kline.
                if close_ms > now_ms:
                    continue
                bars.append(Bar(t=open_ms // 1000, c=round(close, 8)))

            completed += 1
            last_success_at = dt.datetime.now(dt.timezone.utc)

            if len(page) < PAGE_LIMIT:
                # Last page; Binance returned fewer than the requested cap.
                break

            # Advance cursor to one past the last returned kline.
            last_open_ms = int(page[-1][0])
            next_cursor = last_open_ms + step_ms
            if next_cursor <= cursor_ms:
                # Defensive guard against pathological pagination.
                break
            cursor_ms = next_cursor

        deduped = _dedupe_bars(bars)

        if errors and allow_partial:
            status: Status = "PARTIAL_FAILURE"
            error_msg = "; ".join(errors)
        elif deduped:
            status = "SUCCESS_COMPLETE"
            error_msg = None
        else:
            # No bars left after filtering — this can legitimately happen
            # when the request is narrow enough to only cover the still-open
            # kline (e.g. just today for a daily interval). Treat as a valid
            # empty response, not a failure.
            status = "SUCCESS_EMPTY_VALID"
            error_msg = None

        return FetchResult(
            status=status,
            bars=deduped,
            provider=self.name,
            provider_symbol=symbol,
            price_basis=self.price_basis,
            error=error_msg,
            attempted_windows=attempted,
            completed_windows=completed,
            last_successful_fetch_at=last_success_at,
        )

    def fetch_batch_quotes(self, symbols: list[str]) -> dict[str, QuoteSnapshot]:
        """Fetch current prices for crypto symbols via ``GET /api/v3/ticker/price``.

        Binance exposes a no-arg variant returning all symbols and a
        per-symbol variant. We prefer the per-symbol path because it gives
        explicit per-symbol errors and avoids silently mapping the wrong
        ticker if upstream payload shape changes.
        """
        out: dict[str, QuoteSnapshot] = {}
        if not symbols:
            return out

        now = dt.datetime.now(dt.timezone.utc)
        for sym in symbols:
            try:
                payload = self._request_json("/api/v3/ticker/price", {"symbol": sym})
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError, ConnectionError) as exc:
                raise RuntimeError(
                    f"Binance ticker fetch failed for {sym}: {exc}"
                ) from exc
            if not isinstance(payload, dict):
                raise ValueError(
                    f"Binance ticker/price returned unexpected payload shape for {sym}: {type(payload).__name__}"
                )
            price_raw = payload.get("price")
            sym_back = payload.get("symbol")
            if price_raw is None or sym_back is None:
                raise ValueError(f"Binance ticker/price missing fields for {sym}")
            try:
                price = float(price_raw)
            except (TypeError, ValueError) as exc:
                raise ValueError(f"Binance ticker/price non-numeric price for {sym}") from exc
            if price <= 0:
                raise ValueError(f"Binance ticker/price non-positive price for {sym}")
            out[sym] = QuoteSnapshot(symbol=sym, price=price, as_of=now)
        return out

    def validate_pair(self, symbol: str) -> bool:
        """Return True iff ``symbol`` exists and is currently ``TRADING`` on Binance.

        Results are cached for the lifetime of this provider instance to
        avoid hammering ``exchangeInfo`` for repeated symbols.
        """
        if not symbol:
            return False
        if symbol in self._validate_cache:
            return self._validate_cache[symbol]

        try:
            payload = self._request_json("/api/v3/exchangeInfo", {"symbol": symbol})
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError, ConnectionError):
            self._validate_cache[symbol] = False
            return False

        if not isinstance(payload, dict):
            self._validate_cache[symbol] = False
            return False
        symbols = payload.get("symbols")
        if not isinstance(symbols, list) or not symbols:
            self._validate_cache[symbol] = False
            return False
        first = symbols[0]
        if not isinstance(first, dict):
            self._validate_cache[symbol] = False
            return False
        is_trading = first.get("status") == "TRADING"
        self._validate_cache[symbol] = is_trading
        return is_trading


def _dedupe_bars(bars: list[Bar]) -> list[Bar]:
    """Deduplicate bars by timestamp, keep last value, sort ascending."""
    seen: dict[int, float] = {}
    for bar in bars:
        seen[bar["t"]] = bar["c"]
    return [Bar(t=t, c=c) for t, c in sorted(seen.items())]
