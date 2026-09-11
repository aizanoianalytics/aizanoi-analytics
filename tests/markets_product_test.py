import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "scripts" / "markets" / "update_markets.py"
spec = importlib.util.spec_from_file_location("update_markets_product", SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def candles(count=260, *, start=100.0, step=1.0):
    return [{"t": 1_700_000_000 + index * 86_400, "c": start + index * step} for index in range(count)]


class MarketsProductTests(unittest.TestCase):
    def test_close_only_metrics_include_range_cross_trend_and_quality_without_volume_or_split(self):
        metrics = mod.compute_metrics(candles(), annualization=252)
        self.assertNotIn("volumeZ20", metrics)
        self.assertNotIn("splitSuspect", metrics)
        self.assertAlmostEqual(metrics["rangePosition52w"], 1.0)
        self.assertGreater(metrics["sma50Prev"], 0)
        self.assertGreater(metrics["sma200Prev"], 0)
        self.assertEqual(metrics["smaCross"], "none")
        self.assertEqual(metrics["trendRegime"], "strong-uptrend")
        self.assertGreaterEqual(metrics["trendAge50"], 1)
        self.assertEqual(metrics["historySessions"], 260)
        self.assertEqual(metrics["dataQuality"]["dailyClose"], "complete")
        self.assertEqual(metrics["dataQuality"]["ohlcv"], "unavailable")

    def test_market_enrichment_adds_benchmark_relative_strength_and_percentiles(self):
        rows = [
            {"ticker": "A", "return1d": 0.01, "return7d": 0.08, "return30d": 0.30, "return90d": 0.20, "rsi14": 72, "rangePosition52w": 1.0, "aboveSma200": True, "trendAge50": 40, "trendRegime":"strong-uptrend", "volatility20": 0.2},
            {"ticker": "B", "return1d": -0.01, "return7d": -0.08, "return30d": 0.10, "return90d": 0.00, "rsi14": 28, "rangePosition52w": 0.0, "aboveSma200": False, "trendAge50": 4, "trendRegime":"downtrend", "volatility20": 0.4},
            {"ticker": "C", "return1d": 0.00, "return7d": 0.0, "return30d": 0.20, "return90d": 0.10, "rsi14": 50, "rangePosition52w": 0.5, "aboveSma200": True, "trendAge50": 15, "trendRegime":"mixed", "volatility20": 0.3},
        ]
        pulse = mod.enrich_market_rows(rows, market="us")
        self.assertAlmostEqual(rows[0]["relativeStrength30d"], 0.10)
        self.assertEqual(rows[0]["percentile30d"], 100.0)
        self.assertEqual(rows[1]["percentile30d"], 0.0)
        for row in rows:
            self.assertGreaterEqual(row["momentumQuality"], 0)
            self.assertLessEqual(row["momentumQuality"], 100)
            self.assertGreaterEqual(row["meanReversionScore"], 0)
            self.assertLessEqual(row["meanReversionScore"], 100)
        self.assertGreater(rows[0]["momentumQuality"], rows[1]["momentumQuality"])
        self.assertGreater(rows[1]["meanReversionScore"], rows[0]["meanReversionScore"])
        self.assertEqual(pulse["advancing"], 1)
        self.assertEqual(pulse["declining"], 1)
        self.assertEqual(pulse["rsiOverbought"], 1)
        self.assertEqual(pulse["rsiOversold"], 1)
        self.assertEqual(pulse["newHighs52w"], 1)
        self.assertAlmostEqual(pulse["returnSpread30d"], 0.20)

    def test_aggregate_publishes_market_shards_pulse_health_and_bounded_snapshots(self):
        instruments = [
            {"market": "us", "ticker": "AAA", "name": "Alpha", "exchange": "NASDAQ", "provider": "fintable", "providerSymbol": "AAA", "slug": "aaa"},
            {"market": "crypto", "ticker": "BTC", "name": "Bitcoin", "exchange": "Crypto · USD", "provider": "binance", "providerSymbol": "BTCUSDT", "slug": "btc"},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for market, slug, ticker in (("us", "aaa", "AAA"), ("crypto", "btc", "BTC")):
                history = candles(260, start=100 if market == "us" else 1000)
                shard = {**next(row for row in instruments if row["ticker"] == ticker), "daily": history, "fourHour": []}
                mod.write_json_atomic(root / "history" / market / f"{slug}.json", shard)
                mod.write_json_atomic(root / "summary-items" / market / f"{slug}.json", mod.summary_row(shard, history, "2026-09-10T00:00:00Z", four_hour=[]))
            mod.aggregate(root, instruments, "2026-09-10T00:00:00Z", [])
            self.assertTrue((root / "summary" / "us.json").exists())
            self.assertTrue((root / "summary" / "crypto.json").exists())
            self.assertTrue((root / "summary" / "us" / "index.json").exists())
            self.assertTrue((root / "summary" / "crypto" / "index.json").exists())
            self.assertTrue((root / "pulse" / "us.json").exists())
            self.assertTrue((root / "pulse" / "crypto.json").exists())
            health = json.loads((root / "health.json").read_text())
            snapshots = json.loads((root / "snapshots" / "pulse.json").read_text())
            us_rows = json.loads((root / "summary" / "us.json").read_text())["rows"]
            self.assertEqual(health["counts"], {"us": 1, "crypto": 1})
            self.assertEqual(len(snapshots["snapshots"]), 2)
            self.assertNotIn("volumeZ20", us_rows[0])
            self.assertIn("spark30", us_rows[0])

    def test_rebuild_derived_sanitizes_legacy_history_and_recomputes_summary(self):
        instrument = {"market": "us", "ticker": "AAA", "name": "Alpha", "exchange": "NASDAQ", "provider": "fintable", "providerSymbol": "AAA", "slug": "aaa"}
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            legacy = [{"t": 1_700_000_000 + index * 86_400, "c": 100 + index, "v": 1000, "a": 100 + index} for index in range(260)]
            mod.write_json_atomic(root / "history" / "us" / "aaa.json", {**instrument, "daily": legacy, "fourHour": []})
            rebuilt = mod.rebuild_derived(root, [instrument], completed_at="2026-09-10T00:00:00Z")
            shard = json.loads((root / "history" / "us" / "aaa.json").read_text())
            item = json.loads((root / "summary-items" / "us" / "aaa.json").read_text())
            self.assertEqual(rebuilt, 1)
            self.assertEqual(set(shard["daily"][0]), {"t", "c"})
            self.assertNotIn("volumeZ20", item)
            self.assertIn("rangePosition52w", item)

    def test_pulse_snapshot_file_is_bounded_to_720_records(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            stale = [{"completedAt": f"2026-08-01T{index % 24:02d}:00:00Z", "market": "us", "instruments": index} for index in range(900)]
            mod.write_json_atomic(root / "snapshots" / "pulse.json", {"snapshots": stale})
            mod._append_pulse_snapshots(root, "2026-09-10T00:00:00Z", {"crypto": {"market": "crypto", "instruments": 35}})
            bounded = json.loads((root / "snapshots" / "pulse.json").read_text())["snapshots"]
            self.assertEqual(len(bounded), 720)
            self.assertEqual(bounded[-1]["market"], "crypto")

    def test_crypto_correlation_payload_reports_btc_pairs_and_matrix(self):
        root_rows = {
            "BTC": [100, 101, 103, 102, 105],
            "ETH": [200, 202, 206, 204, 210],
            "SOL": [50, 49, 48, 49, 47],
        }
        payload = mod.crypto_correlations(root_rows)
        self.assertEqual(payload["symbols"], ["BTC", "ETH", "SOL"])
        self.assertAlmostEqual(payload["matrix"][0][0], 1.0)
        self.assertGreater(payload["btcCorrelation"]["ETH"], 0.99)
        self.assertLess(payload["btcCorrelation"]["SOL"], 0)

    def test_wilder_rsi_fixture_agreement(self):
        # Monotonic increasing prices should reach RSI 100
        increasing = [float(i) for i in range(1, 30)]
        self.assertEqual(mod._wilder_rsi(increasing, 14), 100.0)
        # Monotonic decreasing prices should reach RSI 0
        decreasing = [float(30 - i) for i in range(1, 30)]
        self.assertEqual(mod._wilder_rsi(decreasing, 14), 0.0)
        # Flat / constant prices should return 50.0 without division by zero
        flat = [100.0] * 30
        self.assertEqual(mod._wilder_rsi(flat, 14), 50.0)
        # Less than or equal to period sessions returns None
        self.assertIsNone(mod._wilder_rsi([1.0, 2.0, 3.0], 14))

    def test_timestamp_returns_and_range(self):
        # Build 400 daily candles stepping 1 day
        base_t = 1_700_000_000
        daily_candles = [{"t": base_t + i * 86_400, "c": 100.0 + (i * 0.5)} for i in range(400)]
        metrics = mod.compute_metrics(daily_candles, annualization=365)
        # 1D return should be (latest / prev) - 1
        expected_1d = (daily_candles[-1]["c"] / daily_candles[-2]["c"]) - 1
        self.assertAlmostEqual(metrics["return1d"], expected_1d, places=6)
        # 7D return should be (latest / candle_7d) - 1
        expected_7d = (daily_candles[-1]["c"] / daily_candles[-8]["c"]) - 1
        self.assertAlmostEqual(metrics["return7d"], expected_7d, places=6)
        # 30D return should be (latest / candle_30d) - 1
        expected_30d = (daily_candles[-1]["c"] / daily_candles[-31]["c"]) - 1
        self.assertAlmostEqual(metrics["return30d"], expected_30d, places=6)
        # 52W range position should be 1.0 (at highest high)
        self.assertAlmostEqual(metrics["rangePosition52w"], 1.0)
        self.assertAlmostEqual(metrics["distanceFrom52wHigh"], 0.0)

    def test_timestamp_returns_with_weekend_gaps(self):
        base = 1_700_000_000
        candles = [
            {"t": base, "c": 100.0},
            {"t": base + 3 * 86400, "c": 103.0},
            {"t": base + 4 * 86400, "c": 104.0},
            {"t": base + 5 * 86400, "c": 106.0},
            {"t": base + 6 * 86400, "c": 107.0},
            {"t": base + 7 * 86400, "c": 108.0},
            {"t": base + 10 * 86400, "c": 110.0},
        ]
        ret1d = mod._returns_by_timestamp(candles, 1)
        ret7d = mod._returns_by_timestamp(candles, 7)
        self.assertIsNotNone(ret1d)
        self.assertAlmostEqual(ret1d, (110.0 - 108.0) / 108.0, places=6)
        self.assertIsNotNone(ret7d)
        self.assertAlmostEqual(ret7d, (110.0 - 103.0) / 103.0, places=6)
        # Verify compute_metrics uses timestamp returns
        metrics = mod.compute_metrics(candles, annualization=252)
        self.assertAlmostEqual(metrics["return1d"], ret1d, places=6)
        self.assertAlmostEqual(metrics["return7d"], ret7d, places=6)

    def test_correlation_timestamp_intersection(self):
        # Two cryptos with different starting dates and overlapping subset
        series = {
            "BTC": [
                {"t": 1000, "c": 100.0}, {"t": 2000, "c": 105.0},
                {"t": 3000, "c": 110.0}, {"t": 4000, "c": 108.0},
                {"t": 5000, "c": 115.0},
            ],
            "ETH": [
                {"t": 500, "c": 50.0},  # unshared timestamp
                {"t": 2000, "c": 210.0},
                {"t": 3000, "c": 220.0},
                {"t": 4000, "c": 216.0},
                {"t": 5000, "c": 230.0},
            ],
        }
        payload = mod.crypto_correlations(series)
        self.assertEqual(payload["symbols"], ["BTC", "ETH"])
        # Highly correlated on the overlapping timestamps 2000, 3000, 4000, 5000
        self.assertGreater(payload["matrix"][0][1], 0.95)

    def test_correlation_joint_filtering_prevents_array_misalignment(self):
        # BTC has an invalid 0.0 candle at t=3000, while ETH has valid data.
        # Joint filtering ensures both series drop intervals around t=3000 and remain in lockstep.
        series = {
            "BTC": [
                {"t": 1000, "c": 100.0},
                {"t": 2000, "c": 110.0},  # +10%
                {"t": 3000, "c": 0.0},    # bad candle
                {"t": 4000, "c": 105.0},
                {"t": 5000, "c": 115.0},  # +9.5%
                {"t": 6000, "c": 105.0},  # -8.7%
                {"t": 7000, "c": 120.0},  # +14.3%
                {"t": 8000, "c": 110.0},  # -8.3%
            ],
            "ETH": [
                {"t": 1000, "c": 200.0},
                {"t": 2000, "c": 220.0},  # +10%
                {"t": 3000, "c": 210.0},  # valid candle in ETH
                {"t": 4000, "c": 210.0},
                {"t": 5000, "c": 230.0},  # +9.5%
                {"t": 6000, "c": 210.0},  # -8.7%
                {"t": 7000, "c": 240.0},  # +14.3%
                {"t": 8000, "c": 220.0},  # -8.3%
            ],
        }
        payload = mod.crypto_correlations(series)
        self.assertIsNotNone(payload["matrix"][0][1])
        self.assertGreater(payload["matrix"][0][1], 0.99)

    def test_structured_health_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            instruments = [
                {"market": "us", "ticker": "AAA", "name": "Alpha", "exchange": "NASDAQ", "provider": "fintable", "providerSymbol": "AAA", "slug": "aaa"},
                {"market": "crypto", "ticker": "BTC", "name": "Bitcoin", "exchange": "Crypto · USD", "provider": "binance", "providerSymbol": "BTCUSDT", "slug": "btc"},
            ]
            for inst in instruments:
                c = candles(50, start=100)
                shard = {**inst, "daily": c, "fourHour": []}
                mod.write_json_atomic(root / "history" / inst["market"] / f"{inst['slug']}.json", shard)
                mod.write_json_atomic(root / "summary-items" / inst["market"] / f"{inst['slug']}.json", mod.summary_row(shard, c, "2026-09-10T12:00:00Z"))
            mod.aggregate(root, instruments, "2026-09-10T12:00:00Z", [])
            health = json.loads((root / "health.json").read_text())
            self.assertIn("us", health)
            self.assertIn("crypto", health)
            self.assertEqual(health["us"]["published"], 1)
            self.assertEqual(health["crypto"]["published"], 1)
            self.assertEqual(health["us"]["priceBasis"], "Adjusted close")
            self.assertEqual(health["crypto"]["priceBasis"], "Exchange close")
            self.assertEqual(health["us"]["status"], "complete")
            self.assertEqual(health["crypto"]["status"], "complete")


if __name__ == "__main__":
    unittest.main()
