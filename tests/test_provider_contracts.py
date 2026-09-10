"""Contract tests for market-data providers.

Verifies the FetchResult / QuoteSnapshot contracts for Fintable and Binance
adapters and the retry_with_backoff helper from base.py. All HTTP calls are
mocked via ``unittest.mock``; no real network traffic is generated.

Run with:

    python3 -m unittest tests.test_provider_contracts -v
"""

from __future__ import annotations

import datetime as dt
import io
import json
import os
import sys
import time
import unittest
import urllib.error
from pathlib import Path
from unittest import mock


# Make ``scripts/markets`` importable without requiring an install step.
_REPO_ROOT = Path(__file__).resolve().parents[1]
_SCRIPTS_DIR = _REPO_ROOT / "scripts"
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from markets.providers import (  # noqa: E402  (path-adjusted import)
    BinanceProvider,
    FintableProvider,
    retry_with_backoff,
)
from markets.providers import base as providers_base  # noqa: E402


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


class _FakeHTTPResponse:
    """Mimics the ``http.client.HTTPResponse`` returned by ``urlopen``.

    Only the methods that the providers actually call are implemented:
    ``__enter__`` / ``__exit__`` (context manager) and ``read``.
    """

    def __init__(self, body: bytes) -> None:
        self._body = body

    def __enter__(self) -> "_FakeHTTPResponse":
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        return False

    def read(self) -> bytes:
        return self._body


def _make_response(payload: dict | list) -> _FakeHTTPResponse:
    """Build a fake HTTP response whose body is JSON-encoded ``payload``."""
    return _FakeHTTPResponse(json.dumps(payload).encode("utf-8"))


def _make_http_error(
    code: int,
    *,
    message: str = "boom",
    body: bytes | None = None,
    headers: dict[str, str] | None = None,
) -> urllib.error.HTTPError:
    """Build a real ``HTTPError`` suitable to be raised by ``urlopen``.

    ``fp`` is provided because ``HTTPError`` expects a file-like object so
    that ``.read()`` works when callers introspect the error body. We pass
    ``BytesIO`` so the providers can still call ``.read()`` defensively.
    """
    fp = io.BytesIO(body) if body is not None else io.BytesIO(b"")
    hdrs = headers or {}
    return urllib.error.HTTPError(
        url="http://mocked",
        code=code,
        msg=message,
        hdrs=hdrs,
        fp=fp,
    )


def _no_sleep() -> mock.MagicMock:
    """Return a MagicMock that replaces ``time.sleep`` so retries don't block."""
    return mock.patch.object(time, "sleep", return_value=None)


def _patch_urlopen(target: str):
    """Patch ``urllib.request.urlopen`` on the given module path.

    Returns ``(patcher, mock_urlopen)``. The mock has a default side_effect
    that raises NotImplementedError so tests must opt into a side_effect or
    return_value; an unconfigured urlopen will fail loudly rather than
    silently return None.
    """
    patcher = mock.patch(target, autospec=False)
    mock_urlopen = patcher.start()
    mock_urlopen.side_effect = NotImplementedError(
        "urlopen was called but the test did not configure a response"
    )
    return patcher, mock_urlopen


# ===========================================================================
# A. FINTABLE
# ===========================================================================


class FintableProviderContractTests(unittest.TestCase):
    """Contract tests for FintableProvider."""

    def setUp(self) -> None:
        # Disable real sleep so retry/backoff doesn't stall the suite.
        self._sleep_patcher = mock.patch.object(time, "sleep", return_value=None)
        self._sleep_patcher.start()

        self._urlopen_patcher, self.mock_urlopen = _patch_urlopen(
            "markets.providers.fintable.urllib.request.urlopen"
        )
        self.provider = FintableProvider()

    def tearDown(self) -> None:
        self._urlopen_patcher.stop()
        self._sleep_patcher.stop()

    # ------------------------------------------------------------------ helpers
    def _respond_with(self, payload: dict | list) -> None:
        """Set the mocked urlopen to return a fake response with JSON ``payload``."""
        self.mock_urlopen.side_effect = None
        self.mock_urlopen.return_value = _make_response(payload)

    def _respond_sequence(self, payloads: list) -> None:
        """Set the mocked urlopen to return successive responses."""
        self.mock_urlopen.side_effect = None
        self.mock_urlopen.side_effect = [_make_response(p) for p in payloads]

    def _raise_http_error(self, code: int, body: dict | None = None, headers: dict | None = None) -> None:
        """Configure urlopen to raise an HTTPError."""
        self.mock_urlopen.side_effect = None
        body_bytes = json.dumps(body).encode("utf-8") if body is not None else b""
        self.mock_urlopen.side_effect = _make_http_error(
            code, message=str(code), body=body_bytes, headers=headers
        )

    @staticmethod
    def _window_payload(symbol: str = "AAPL", bars: list[dict] | None = None) -> dict:
        return {
            "data": {
                "symbol": symbol,
                "timeframe": "1day",
                "currency": "USD",
                "feed": "iex",
                "bars": bars if bars is not None else [],
            }
        }

    # ------------------------------------------------------------------ 1
    def test_history_success_complete(self) -> None:
        """Three-bar success path yields SUCCESS_COMPLETE with normalized bars."""
        bars_raw = [
            {
                "timestamp": "2026-09-01T04:00:00Z",
                "date": "2026-09-01",
                "open": "316.97",
                "high": "327.30",
                "low": "314.73",
                "close": "325.25",
                "volume": 1709875,
            },
            {
                "timestamp": "2026-09-02T04:00:00Z",
                "date": "2026-09-02",
                "open": "327.01",
                "high": "328.36",
                "low": "323.57",
                "close": "325.03",
                "volume": 1152718,
            },
            {
                "timestamp": "2026-09-03T04:00:00Z",
                "date": "2026-09-03",
                "open": "325.03",
                "high": "327.12",
                "low": "323.55",
                "close": "326.71",
                "volume": 1234567,
            },
        ]
        self._respond_with(self._window_payload("AAPL", bars_raw))

        start = int(dt.datetime(2026, 9, 1, tzinfo=dt.timezone.utc).timestamp())
        end = int(dt.datetime(2026, 9, 10, tzinfo=dt.timezone.utc).timestamp())
        result = self.provider.fetch_history("AAPL", start, end)

        self.assertEqual(result.status, "SUCCESS_COMPLETE")
        self.assertEqual(len(result.bars), 3)
        self.assertEqual(result.provider, "fintable")
        self.assertEqual(result.provider_symbol, "AAPL")
        self.assertEqual(result.price_basis, "adjusted-close")
        self.assertIsNone(result.error)
        self.assertGreaterEqual(result.attempted_windows, 1)
        self.assertEqual(result.completed_windows, result.attempted_windows)
        self.assertIsNotNone(result.last_successful_fetch_at)

        for bar in result.bars:
            self.assertIn("t", bar)
            self.assertIn("c", bar)
            self.assertIsInstance(bar["t"], int)
            self.assertIsInstance(bar["c"], float)
            self.assertGreater(bar["c"], 0.0)

        # Times are ascending and correspond to the ISO timestamps.
        timestamps = [bar["t"] for bar in result.bars]
        self.assertEqual(timestamps, sorted(timestamps))

    # ------------------------------------------------------------------ 2
    def test_history_window_splitting(self) -> None:
        """Five-year range triggers multiple bounded window requests."""
        # Each window returns one bar; with WINDOW_DAYS=730, five years (~1826d)
        # yields >= 3 windows.
        self.mock_urlopen.side_effect = None
        call_count = {"n": 0}

        def fake_urlopen(req, timeout=None):  # noqa: ARG001
            call_count["n"] += 1
            payload = self._window_payload(
                "AAPL",
                [
                    {
                        "timestamp": "2024-01-01T04:00:00Z",
                        "date": "2024-01-01",
                        "open": "1",
                        "high": "1",
                        "low": "1",
                        "close": "1",
                        "volume": 1,
                    }
                ],
            )
            return _make_response(payload)

        self.mock_urlopen.side_effect = fake_urlopen

        start = int(dt.datetime(2021, 1, 1, tzinfo=dt.timezone.utc).timestamp())
        end = int(dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc).timestamp())
        result = self.provider.fetch_history("AAPL", start, end)

        self.assertGreaterEqual(call_count["n"], 3)
        self.assertEqual(result.status, "SUCCESS_COMPLETE")
        self.assertEqual(result.attempted_windows, call_count["n"])
        self.assertEqual(result.completed_windows, call_count["n"])

    # ------------------------------------------------------------------ 3
    def test_history_not_found_all_windows_yields_empty_valid(self):
        """A fully not_found range is an authoritative empty result.

        The provider cannot distinguish "bogus symbol" from "pre-IPO range"
        through the 404 envelope alone; the pipeline treats an all-empty
        result as a failed instrument (no shard published) via update_rows,
        while a partially-empty range (pre-IPO gap) legitimately succeeds.
        """
        self._raise_http_error(404, {"error": {"type": "not_found", "message": "No price history for that ticker and range."}})
        import time as _time
        now = int(_time.time())
        result = self.provider.fetch_history("AAPL", now - 86400 * 5, now, "1d")
        self.assertEqual(result.status, "SUCCESS_EMPTY_VALID")
        self.assertEqual(result.bars, [])
        # All attempted windows completed (skipped), none failed.
        self.assertEqual(result.attempted_windows, result.completed_windows)
        self.assertGreaterEqual(result.attempted_windows, 1)

    def test_history_success_empty_valid(self) -> None:
        """Empty bars list with no error yields SUCCESS_EMPTY_VALID."""
        self._respond_with(self._window_payload("AAPL", []))

        start = int(dt.datetime(2026, 9, 1, tzinfo=dt.timezone.utc).timestamp())
        end = int(dt.datetime(2026, 9, 10, tzinfo=dt.timezone.utc).timestamp())
        result = self.provider.fetch_history("AAPL", start, end)

        self.assertEqual(result.status, "SUCCESS_EMPTY_VALID")
        self.assertEqual(result.bars, [])
        self.assertIsNone(result.error)
        self.assertEqual(result.provider_symbol, "AAPL")

    # ------------------------------------------------------------------ 5
    def test_history_request_shape(self) -> None:
        """URL must use documented params only and not depend on an API key."""
        # Capture the outgoing urllib.request.Request.
        captured: list[mock.MagicMock] = []
        self.mock_urlopen.side_effect = None

        def fake_urlopen(req, timeout=None):  # noqa: ARG001
            captured.append(req)
            return _make_response(self._window_payload("AAPL", []))

        self.mock_urlopen.side_effect = fake_urlopen

        start = int(dt.datetime(2026, 9, 1, tzinfo=dt.timezone.utc).timestamp())
        end = int(dt.datetime(2026, 9, 3, tzinfo=dt.timezone.utc).timestamp())
        self.provider.fetch_history("AAPL", start, end)

        self.assertGreaterEqual(len(captured), 1)
        url = captured[0].full_url if hasattr(captured[0], "full_url") else captured[0].get_full_url()
        self.assertIn("/api/v2/prices/", url)
        self.assertIn("/history", url)
        # Symbol rides in the path: /api/v2/prices/AAPL/history
        self.assertIn("/prices/AAPL/history", url)
        # Required documented params.
        self.assertIn("timeframe=1day", url)
        self.assertIn("start=2026-09-01", url)
        self.assertIn("end=2026-09-03", url)
        self.assertIn("limit=", url)
        # Legacy / undocumented params MUST NOT appear.
        self.assertNotIn("from=", url)
        self.assertNotIn("to=", url)
        self.assertNotIn("interval=", url)
        # No API key expected on the URL.
        self.assertNotIn("api_key", url.lower())
        self.assertNotIn("apikey", url.lower())

        # Header sanity: User-Agent set, no Authorization / X-Api-Key header.
        headers = captured[0].headers
        header_keys = {k.lower() for k in headers.keys()}
        self.assertIn("user-agent", header_keys)
        self.assertNotIn("authorization", header_keys)
        self.assertNotIn("x-api-key", header_keys)

        # Sanity-check source: no FINTABLE_API_KEY lookup anywhere in fintable.py.
        source = Path(_SCRIPTS_DIR / "markets" / "providers" / "fintable.py").read_text(
            encoding="utf-8"
        )
        self.assertNotIn("FINTABLE_API_KEY", source)
        self.assertNotIn("os.environ", source)

        # Sanity-check the environment: even if exported, the provider ignores it.
        with mock.patch.dict(os.environ, {"FINTABLE_API_KEY": "leaked"}):
            # Repeat the call, still no key on the wire.
            self.provider.fetch_history("AAPL", start, end)
        self.assertGreaterEqual(len(captured), 2)
        url2 = (
            captured[-1].full_url
            if hasattr(captured[-1], "full_url")
            else captured[-1].get_full_url()
        )
        self.assertNotIn("leaked", url2)
        self.assertNotIn("api_key", url2.lower())

    # ------------------------------------------------------------------ 6
    def test_history_4h_raises_not_implemented(self) -> None:
        """4h interval must raise NotImplementedError with the documented message."""
        start = int(dt.datetime(2026, 9, 1, tzinfo=dt.timezone.utc).timestamp())
        end = int(dt.datetime(2026, 9, 10, tzinfo=dt.timezone.utc).timestamp())
        with self.assertRaises(NotImplementedError) as ctx:
            self.provider.fetch_history("AAPL", start, end, interval="4h")
        self.assertIn("Fintable does not document", str(ctx.exception))
        self.assertIn("4h", str(ctx.exception))

    # ------------------------------------------------------------------ 7
    def test_batch_quotes_success(self) -> None:
        """Batch endpoint returns QuoteSnapshot dict with documented fields."""
        payload = {
            "data": [
                {
                    "symbol": "AAPL",
                    "price": "320.16",
                    "currency": "USD",
                    "as_of": "2026-09-10T16:14:55Z",
                    "feed": "iex",
                },
                {
                    "symbol": "MSFT",
                    "price": "412.55",
                    "currency": "USD",
                    "as_of": "2026-09-10T16:14:55Z",
                    "feed": "iex",
                },
            ]
        }
        self._respond_with(payload)

        result = self.provider.fetch_batch_quotes(["AAPL", "MSFT"])

        self.assertIn("AAPL", result)
        self.assertIn("MSFT", result)
        self.assertEqual(result["AAPL"]["symbol"], "AAPL")
        self.assertEqual(result["AAPL"]["price"], 320.16)
        self.assertEqual(result["AAPL"]["currency"], "USD")
        self.assertEqual(result["AAPL"]["as_of"], "2026-09-10T16:14:55Z")
        self.assertEqual(result["AAPL"]["feed"], "iex")
        self.assertEqual(result["MSFT"]["symbol"], "MSFT")
        self.assertAlmostEqual(result["MSFT"]["price"], 412.55, places=4)

    # ------------------------------------------------------------------ 8
    def test_batch_quotes_partial(self) -> None:
        """Missing symbol in response is silently omitted; no exception raised."""
        payload = {"data": [{"symbol": "AAPL", "price": "320.16", "currency": "USD"}]}
        self._respond_with(payload)

        result = self.provider.fetch_batch_quotes(["AAPL", "MSFT", "GOOGL"])

        self.assertIn("AAPL", result)
        self.assertNotIn("MSFT", result)
        self.assertNotIn("GOOGL", result)
        self.assertEqual(result["AAPL"]["price"], 320.16)

    # ------------------------------------------------------------------ 9
    def test_no_env_auth_dependency(self) -> None:
        """Provider source does not depend on FINTABLE_API_KEY at all."""
        source = Path(_SCRIPTS_DIR / "markets" / "providers" / "fintable.py").read_text(
            encoding="utf-8"
        )
        self.assertNotIn("FINTABLE_API_KEY", source)
        self.assertNotIn("os.environ", source)
        self.assertNotIn("getenv", source)


# ===========================================================================
# B. BINANCE
# ===========================================================================


def _kline(
    open_ms: int,
    close: float,
    close_ms: int,
    *,
    open_: float | None = None,
    high: float | None = None,
    low: float | None = None,
    volume: float | None = None,
) -> list:
    """Build a single Binance kline array entry (12 fields per spec)."""
    return [
        open_ms,
        str(open_ if open_ is not None else close),
        str(high if high is not None else close),
        str(low if low is not None else close),
        str(close),
        str(volume if volume is not None else 0),
        close_ms,
        "0",
        0,
        "0",
        "0",
        0,
    ]


class BinanceProviderContractTests(unittest.TestCase):
    """Contract tests for BinanceProvider."""

    def setUp(self) -> None:
        self._sleep_patcher = mock.patch.object(time, "sleep", return_value=None)
        self._sleep_patcher.start()

        self._urlopen_patcher, self.mock_urlopen = _patch_urlopen(
            "markets.providers.binance.urllib.request.urlopen"
        )
        self.provider = BinanceProvider()

    def tearDown(self) -> None:
        self._urlopen_patcher.stop()
        self._sleep_patcher.stop()

    def _respond_with(self, payload: dict | list) -> None:
        self.mock_urlopen.side_effect = None
        self.mock_urlopen.return_value = _make_response(payload)

    def _raise_http_error(
        self,
        code: int,
        body: dict | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.mock_urlopen.side_effect = None
        body_bytes = json.dumps(body).encode("utf-8") if body is not None else b""
        self.mock_urlopen.side_effect = _make_http_error(
            code, message=str(code), body=body_bytes, headers=headers
        )

    # ------------------------------------------------------------------ 10
    def test_klines_success(self) -> None:
        """Mocked klines array parses into SUCCESS_COMPLETE; only t/c emitted."""
        now_ms = int(time.time() * 1000)
        # Three closed daily klines ending 1 day ago.
        day_ms = 86_400_000
        one_day_ago_open = now_ms - day_ms * 3
        klines = [
            _kline(one_day_ago_open, 30_000.0, one_day_ago_open + day_ms - 1),
            _kline(one_day_ago_open + day_ms, 31_000.0, one_day_ago_open + 2 * day_ms - 1),
            _kline(one_day_ago_open + 2 * day_ms, 32_000.0, one_day_ago_open + 3 * day_ms - 1),
        ]
        self._respond_with(klines)

        start = int((now_ms - 7 * day_ms) / 1000)
        end = int((now_ms - day_ms) / 1000)
        result = self.provider.fetch_history("BTCUSDT", start, end)

        self.assertEqual(result.status, "SUCCESS_COMPLETE")
        self.assertEqual(len(result.bars), 3)
        self.assertEqual(result.provider, "binance")
        self.assertEqual(result.provider_symbol, "BTCUSDT")
        self.assertEqual(result.price_basis, "exchange-close")
        self.assertIsNone(result.error)

        for bar in result.bars:
            self.assertEqual(set(bar.keys()), {"t", "c"})
            self.assertIsInstance(bar["t"], int)
            self.assertIsInstance(bar["c"], float)
            # closeTime must NOT leak into the normalized bar.
            self.assertNotIn("closeTime", bar)

        # Ascending timestamps, no duplicates.
        timestamps = [bar["t"] for bar in result.bars]
        self.assertEqual(timestamps, sorted(timestamps))

    # ------------------------------------------------------------------ 11
    def test_klines_excludes_unclosed_daily(self) -> None:
        """An unclosed kline (closeTime > now) is dropped, not emitted."""
        now_ms = int(time.time() * 1000)
        day_ms = 86_400_000
        closed_open = now_ms - 2 * day_ms
        closed_close = now_ms - day_ms - 1
        unclosed_open = now_ms - day_ms
        unclosed_close = now_ms + 30 * 60 * 1000  # 30 min in the future

        klines = [
            _kline(closed_open, 30_000.0, closed_close),
            _kline(unclosed_open, 31_000.0, unclosed_close),
        ]
        self._respond_with(klines)

        start = int((now_ms - 7 * day_ms) / 1000)
        end = int((now_ms + day_ms) / 1000)
        result = self.provider.fetch_history("BTCUSDT", start, end)

        # The unclosed kline MUST be excluded.
        self.assertEqual(len(result.bars), 1, f"Expected 1 closed bar, got {len(result.bars)}: {result.bars}")
        self.assertEqual(result.status, "SUCCESS_COMPLETE")
        self.assertEqual(result.bars[0]["c"], 30_000.0)

    # ------------------------------------------------------------------ 12
    def test_klines_4h_includes_closed_only(self) -> None:
        """4h klines whose closeTime is in the past are all kept."""
        now_ms = int(time.time() * 1000)
        step_ms = 4 * 60 * 60 * 1000  # 4h

        # Three closed 4h klines, all in the past.
        klines = [
            _kline(now_ms - 3 * step_ms, 100.0, now_ms - 3 * step_ms + step_ms - 1),
            _kline(now_ms - 2 * step_ms, 101.0, now_ms - 2 * step_ms + step_ms - 1),
            _kline(now_ms - step_ms, 102.0, now_ms - step_ms + step_ms - 1),
        ]
        self._respond_with(klines)

        start = int((now_ms - 7 * step_ms) / 1000)
        end = int((now_ms - 1000) / 1000)
        result = self.provider.fetch_history("BTCUSDT", start, end, interval="4h")

        self.assertEqual(result.status, "SUCCESS_COMPLETE")
        self.assertEqual(len(result.bars), 3)
        self.assertEqual([b["c"] for b in result.bars], [100.0, 101.0, 102.0])

    # ------------------------------------------------------------------ 13
    def test_klines_invalid_symbol_returns_failure(self) -> None:
        """HTTP 400 with documented Binance error body yields FAILURE."""
        self._raise_http_error(
            code=400,
            body={"code": -1121, "msg": "Invalid symbol."},
        )

        now = int(time.time())
        result = self.provider.fetch_history("BADSYM", now - 86_400, now)

        self.assertEqual(result.status, "FAILURE")
        self.assertEqual(result.bars, [])
        self.assertIsNotNone(result.error)
        self.assertTrue(result.error, "error message must be non-empty")

    # ------------------------------------------------------------------ 14
    def test_validate_pair_trading(self) -> None:
        """validate_pair returns True for a TRADING symbol."""
        self._respond_with(
            {
                "symbols": [
                    {
                        "symbol": "BTCUSDT",
                        "status": "TRADING",
                        "baseAsset": "BTC",
                        "quoteAsset": "USDT",
                    }
                ]
            }
        )

        self.assertTrue(self.provider.validate_pair("BTCUSDT"))

    # ------------------------------------------------------------------ 15
    def test_validate_pair_not_trading(self) -> None:
        """validate_pair returns False for a halted / non-trading symbol."""
        self._respond_with(
            {
                "symbols": [
                    {
                        "symbol": "HALTUSDT",
                        "status": "BREAK",
                        "baseAsset": "HALT",
                        "quoteAsset": "USDT",
                    }
                ]
            }
        )

        self.assertFalse(self.provider.validate_pair("HALTUSDT"))

    # ------------------------------------------------------------------ 16
    def test_validate_pair_caches(self) -> None:
        """Repeated validate_pair calls must hit the network only once."""
        self._respond_with(
            {
                "symbols": [
                    {
                        "symbol": "BTCUSDT",
                        "status": "TRADING",
                        "baseAsset": "BTC",
                        "quoteAsset": "USDT",
                    }
                ]
            }
        )

        first = self.provider.validate_pair("BTCUSDT")
        second = self.provider.validate_pair("BTCUSDT")

        self.assertTrue(first)
        self.assertTrue(second)
        # Both calls should resolve to the same cached boolean.
        self.assertEqual(self.mock_urlopen.call_count, 1)

    # ------------------------------------------------------------------ 17
    def test_no_auth_header(self) -> None:
        """No Authorization header is sent on Binance requests."""
        captured: list = []

        def fake_urlopen(req, timeout=None):  # noqa: ARG001
            captured.append(req)
            return _make_response(
                {"symbols": [{"symbol": "BTCUSDT", "status": "TRADING"}]}
            )

        self.mock_urlopen.side_effect = fake_urlopen

        self.provider.validate_pair("BTCUSDT")

        self.assertGreaterEqual(len(captured), 1)
        headers = captured[0].headers
        header_keys_lower = {k.lower() for k in headers.keys()}
        self.assertNotIn("authorization", header_keys_lower)
        self.assertNotIn("x-api-key", header_keys_lower)
        self.assertNotIn("x-mbx-apikey", header_keys_lower)

        # Also assert via the kline path — fresh capture with fresh side_effect.
        captured.clear()
        now_ms = int(time.time() * 1000)
        day_ms = 86_400_000

        def fake_kline_urlopen(req, timeout=None):  # noqa: ARG001
            captured.append(req)
            return _make_response(
                [_kline(now_ms - day_ms, 100.0, now_ms - 1)]
            )

        self.mock_urlopen.side_effect = fake_kline_urlopen
        start_ts = int((now_ms - 7 * day_ms) / 1000)
        end_ts = int((now_ms - day_ms) / 1000)
        self.provider.fetch_history("BTCUSDT", start_ts, end_ts)
        self.assertGreaterEqual(len(captured), 1)
        kline_headers_lower = {k.lower() for k in captured[0].headers.keys()}
        self.assertNotIn("authorization", kline_headers_lower)
        self.assertNotIn("x-mbx-apikey", kline_headers_lower)


# ===========================================================================
# C. PROVIDER BASE
# ===========================================================================


class BaseContractTests(unittest.TestCase):
    """Contract tests for the shared retry_with_backoff helper."""

    def setUp(self) -> None:
        # We do NOT disable time.sleep globally — Retry-After / backoff
        # observation requires time.sleep to be called and inspectable.

        # Patch time.sleep on the base module (where retry_with_backoff lives)
        # so we can observe what delay was requested without sleeping.
        self._sleep_patcher = mock.patch.object(providers_base.time, "sleep")
        self.mock_sleep = self._sleep_patcher.start()
        self.mock_sleep.return_value = None

    def tearDown(self) -> None:
        self._sleep_patcher.stop()

    # ------------------------------------------------------------------ 18
    def test_retry_with_backoff_respects_retry_after(self) -> None:
        """On 429, the provider sleeps for Retry-After before retrying."""
        retry_after_value = 2.5

        # Patch time.sleep inside the fintable module so the Retry-After call
        # is observable without actually sleeping.
        import markets.providers.fintable as fintable_mod

        sleep_patcher = mock.patch.object(fintable_mod.time, "sleep")
        mock_fintable_sleep = sleep_patcher.start()
        try:
            with mock.patch(
                "markets.providers.fintable.urllib.request.urlopen"
            ) as mock_urlopen:
                mock_urlopen.side_effect = [
                    _make_http_error(
                        code=429,
                        message="Too Many Requests",
                        headers={"Retry-After": str(retry_after_value)},
                    ),
                    _make_response(
                        {
                            "data": {
                                "symbol": "AAPL",
                                "timeframe": "1day",
                                "bars": [
                                    {
                                        "timestamp": "2026-09-01T04:00:00Z",
                                        "date": "2026-09-01",
                                        "open": "1",
                                        "high": "1",
                                        "low": "1",
                                        "close": "100.0",
                                        "volume": 1,
                                    }
                                ],
                            }
                        }
                    ),
                ]

                provider = FintableProvider()
                start = int(dt.datetime(2026, 9, 1, tzinfo=dt.timezone.utc).timestamp())
                end = int(dt.datetime(2026, 9, 5, tzinfo=dt.timezone.utc).timestamp())
                result = provider.fetch_history("AAPL", start, end)

                # The HTTP call eventually succeeded.
                self.assertEqual(result.status, "SUCCESS_COMPLETE")
                self.assertEqual(len(result.bars), 1)

                # The Retry-After delay was respected: at least one sleep call
                # used the Retry-After value (the very first sleep after 429).
                self.assertGreaterEqual(mock_fintable_sleep.call_count, 2)
                sleep_values = [c.args[0] for c in mock_fintable_sleep.call_args_list]
                self.assertIn(
                    retry_after_value,
                    sleep_values,
                    f"Expected Retry-After delay {retry_after_value} in {sleep_values}",
                )

                # urlopen was hit twice: once for the 429, once for success.
                self.assertEqual(mock_urlopen.call_count, 2)
        finally:
            sleep_patcher.stop()

    # ------------------------------------------------------------------ 19
    def test_retry_exhausted_raises(self) -> None:
        """retry_with_backoff re-raises the last exception after max_retries."""
        sentinel_error = RuntimeError("always-broken")

        attempts = {"n": 0}

        def always_fails():
            attempts["n"] += 1
            raise sentinel_error

        with self.assertRaises(RuntimeError) as ctx:
            retry_with_backoff(
                always_fails,
                max_retries=3,
                base_delay=0.01,
                max_delay=0.05,
                jitter=False,
                retryable_exceptions=(RuntimeError,),
            )

        self.assertIs(ctx.exception, sentinel_error)
        # max_retries=3 means the callable is invoked 1 + 3 = 4 times.
        self.assertEqual(attempts["n"], 4)
        # Sleep is called between attempts (3 times here) but not after the last.
        self.assertEqual(self.mock_sleep.call_count, 3)


if __name__ == "__main__":
    unittest.main()