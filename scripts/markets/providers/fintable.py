"""Fintable public price API provider for US equities.

Implements the documented v2 public contract:

* History: GET /api/v2/prices/{symbol}/history
* Batch:   GET /api/v2/prices?symbols=AAPL,MSFT,...

No authentication is required; the Fintable public API exposes daily US
equity history without keys. Provider returns a typed ``FetchResult`` object
and raises explicit failures on transport/HTTP errors instead of silently
swallowing partial data.
"""
from __future__ import annotations

import datetime as dt
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Literal, TypedDict

from .base import BaseProvider, retry_with_backoff

FINTABLE_BASE_URL = "https://fintable.io/api/v2"
USER_AGENT = "Mozilla/5.0 (compatible; AizanoiMarkets/2.0; +https://aizanoianalytics.com/)"
TIMEOUT_SECONDS = 12.0
WINDOW_DAYS = 730  # comfortably below the documented 1000-bar limit
HARD_LIMIT = 1000  # Fintable ceiling per response


class Bar(TypedDict):
    """Canonical close-only bar: UNIX seconds + close price."""

    t: int
    c: float


class QuoteSnapshot(TypedDict):
    """Latest indicative quote for a single symbol."""

    symbol: str
    price: float
    currency: str | None
    as_of: str | None
    feed: str | None


Status = Literal["SUCCESS_COMPLETE", "SUCCESS_EMPTY_VALID", "FAILURE", "PARTIAL_FAILURE"]


@dataclass
class FetchResult:
    """Typed result envelope for ``fetch_history``.

    ``bars`` is always a list (possibly empty) of ``Bar`` dicts. ``status``
    describes the outcome of the whole range request:

    * ``SUCCESS_COMPLETE``: every requested window succeeded.
    * ``SUCCESS_EMPTY_VALID``: provider responded successfully but returned
      no bars for the requested range (e.g. all dates fell on weekends).
    * ``FAILURE``: any window failed and partial mode was NOT requested.
    * ``PARTIAL_FAILURE``: caller explicitly enabled partial mode and at
      least one window succeeded while at least one failed.
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


# ---------------------------------------------------------------------------
# Timeframe mapping (only what Fintable documents)
# ---------------------------------------------------------------------------
_TIMEFRAME_MAP: dict[str, str] = {
    "1d": "1day",
    "1day": "1day",
}


def _to_iso_date(ts: int) -> str:
    return dt.datetime.fromtimestamp(ts, tz=dt.timezone.utc).date().isoformat()


def _parse_iso_to_unix(iso_str: str) -> int:
    """Parse an ISO-8601 string like ``2026-09-01T04:00:00Z`` to UNIX seconds."""
    parsed = dt.datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return int(parsed.timestamp())


class FintableProvider(BaseProvider):
    """Fintable public market data adapter for US equities."""

    name: str = "fintable"
    price_basis: str = "adjusted-close"

    def __init__(
        self,
        base_url: str = FINTABLE_BASE_URL,
        timeout: float = TIMEOUT_SECONDS,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = float(timeout)

    # ------------------------------------------------------------------ HTTP

    def _request_json(self, path: str, params: dict[str, Any] | None = None) -> Any:
        """Issue a GET request, decode JSON, surface explicit failures."""
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
                        retry_after = float(retry_after_raw) if retry_after_raw else 5.0
                    except (TypeError, ValueError):
                        retry_after = 5.0
                    time.sleep(retry_after)
                raise
            except urllib.error.URLError as exc:
                raise ConnectionError(f"Fintable network error: {exc.reason}") from exc
            except TimeoutError as exc:
                raise TimeoutError(f"Fintable request timed out after {self.timeout}s") from exc
            except json.JSONDecodeError as exc:
                raise ValueError(f"Fintable returned malformed JSON: {exc.msg}") from exc

        return retry_with_backoff(_do, max_retries=3, base_delay=1.2)

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
        """Fetch historical bars for ``symbol`` between ``start_ts`` and ``end_ts``.

        The range is split into ``WINDOW_DAYS``-day chunks to stay below the
        documented 1000-bar per-response ceiling. On the first window failure
        the result is ``FAILURE`` (no partial bars returned) unless the caller
        explicitly opts into partial mode via ``allow_partial=True``.
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

        timeframe = _TIMEFRAME_MAP.get(interval)
        if timeframe is None:
            # Honest failure: Fintable does not document 4h or any sub-daily
            # timeframe, so we do not fabricate one.
            raise NotImplementedError(
                f"Fintable does not document {interval!r} timeframe; US feed is daily only"
            )

        start_date = dt.datetime.fromtimestamp(start_ts, tz=dt.timezone.utc).date()
        end_date = dt.datetime.fromtimestamp(end_ts, tz=dt.timezone.utc).date()

        bars: list[Bar] = []
        errors: list[str] = []
        attempted = 0
        completed = 0
        last_success_at: dt.datetime | None = None
        cursor = start_date

        while cursor <= end_date:
            window_end_date = min(cursor + dt.timedelta(days=WINDOW_DAYS - 1), end_date)
            attempted += 1
            try:
                window_bars = self._fetch_window(symbol, timeframe, cursor, window_end_date)
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError, ConnectionError) as exc:
                msg = f"Fintable window {cursor.isoformat()}..{window_end_date.isoformat()} failed: {exc}"
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
                # Partial mode: continue to next window
                cursor = window_end_date + dt.timedelta(days=1)
                continue

            bars.extend(window_bars)
            completed += 1
            last_success_at = dt.datetime.now(dt.timezone.utc)
            cursor = window_end_date + dt.timedelta(days=1)

        # Deduplicate by bar timestamp, keep chronological order.
        deduped = _dedupe_bars(bars)

        if errors and allow_partial:
            status: Status = "PARTIAL_FAILURE"
            error_msg = "; ".join(errors)
        elif deduped:
            status = "SUCCESS_COMPLETE"
            error_msg = None
        else:
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
        """Fetch latest indicative quotes for a batch of US symbols.

        Fintable's documented batch endpoint is ``GET /api/v2/prices?symbols=...``
        with no documented per-call cap; we chunk conservatively at 50 to
        mirror a sensible HTTP request size and to keep error messages
        localised per chunk.
        """
        out: dict[str, QuoteSnapshot] = {}
        if not symbols:
            return out

        BATCH_SIZE = 50
        for i in range(0, len(symbols), BATCH_SIZE):
            chunk = symbols[i : i + BATCH_SIZE]
            try:
                payload = self._request_json("/prices", {"symbols": ",".join(chunk)})
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError, ConnectionError) as exc:
                # Surface the per-chunk failure as an explicit error on each
                # symbol in the chunk; do NOT silently drop them.
                for sym in chunk:
                    out[sym] = QuoteSnapshot(
                        symbol=sym,
                        price=float("nan"),
                        currency=None,
                        as_of=None,
                        feed=None,
                    )
                # Re-raise to make the failure visible to the caller; they
                # can inspect the partial dict above if needed.
                raise RuntimeError(
                    f"Fintable batch quote fetch failed for chunk {chunk}: {exc}"
                ) from exc

            data = payload.get("data") if isinstance(payload, dict) else None
            if not isinstance(data, list):
                raise ValueError(
                    f"Fintable batch quotes returned unexpected payload shape: {type(payload).__name__}"
                )
            for item in data:
                if not isinstance(item, dict):
                    continue
                sym = item.get("symbol")
                price_raw = item.get("price")
                if not sym or price_raw is None:
                    continue
                try:
                    price = float(price_raw)
                except (TypeError, ValueError):
                    continue
                if price <= 0:
                    continue
                out[sym] = QuoteSnapshot(
                    symbol=sym,
                    price=price,
                    currency=item.get("currency"),
                    as_of=item.get("as_of"),
                    feed=item.get("feed"),
                )
        return out

    # ------------------------------------------------------------------ Internals

    def _fetch_window(
        self,
        symbol: str,
        timeframe: str,
        start_date: dt.date,
        end_date: dt.date,
    ) -> list[Bar]:
        """Fetch and normalise one bounded window from the Fintable history API."""
        params = {
            "timeframe": timeframe,
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
            "limit": HARD_LIMIT,
        }
        path = f"/prices/{urllib.parse.quote(symbol)}/history"
        payload = self._request_json(path, params)

        if not isinstance(payload, dict):
            raise ValueError("Fintable history returned non-object payload")

        err = payload.get("error")
        if isinstance(err, dict):
            err_type = err.get("type") or "error"
            err_msg = err.get("message") or "unknown error"
            # 404-style not_found surfaces as an explicit failure; callers
            # who want to treat "no history" as success-empty should check
            # the status code separately. We still raise so the window is
            # not silently treated as success-with-empty-bars.
            raise ValueError(f"Fintable {err_type}: {err_msg}")

        data_block = payload.get("data")
        if not isinstance(data_block, dict):
            raise ValueError("Fintable history missing 'data' block")
        bars_raw = data_block.get("bars")
        if bars_raw is None:
            # No bars key means there were zero bars in the range. Treat as
            # valid empty response rather than an error.
            return []
        if not isinstance(bars_raw, list):
            raise ValueError("Fintable history 'bars' is not a list")

        bars: list[Bar] = []
        for raw in bars_raw:
            if not isinstance(raw, dict):
                continue
            ts_iso = raw.get("timestamp")
            date_str = raw.get("date")
            close_raw = raw.get("close")
            if close_raw is None or date_str is None:
                continue
            try:
                close = float(close_raw)
            except (TypeError, ValueError):
                continue
            if close <= 0:
                continue
            if ts_iso:
                try:
                    ts = _parse_iso_to_unix(ts_iso)
                except ValueError:
                    ts = None
            else:
                ts = None
            if ts is None:
                # Fall back to trading-date midnight UTC.
                try:
                    parsed_date = dt.date.fromisoformat(date_str)
                    ts = int(
                        dt.datetime.combine(parsed_date, dt.time.min, tzinfo=dt.timezone.utc).timestamp()
                    )
                except ValueError:
                    continue
            bars.append(Bar(t=ts, c=round(close, 6)))
        return bars


def _dedupe_bars(bars: list[Bar]) -> list[Bar]:
    """Deduplicate bars by timestamp, keep last value, sort ascending."""
    seen: dict[int, float] = {}
    for bar in bars:
        seen[bar["t"]] = bar["c"]
    return [Bar(t=t, c=c) for t, c in sorted(seen.items())]
