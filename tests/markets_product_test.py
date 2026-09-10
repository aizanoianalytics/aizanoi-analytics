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
            {"ticker": "A", "return1d": 0.01, "return30d": 0.30, "return90d": 0.20, "rsi14": 72, "rangePosition52w": 1.0, "aboveSma200": True},
            {"ticker": "B", "return1d": -0.01, "return30d": 0.10, "return90d": 0.00, "rsi14": 28, "rangePosition52w": 0.0, "aboveSma200": False},
            {"ticker": "C", "return1d": 0.00, "return30d": 0.20, "return90d": 0.10, "rsi14": 50, "rangePosition52w": 0.5, "aboveSma200": None},
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
            {"market": "us", "ticker": "AAA", "name": "Alpha", "exchange": "NASDAQ", "yahooSymbol": "AAA", "slug": "aaa"},
            {"market": "crypto", "ticker": "BTC", "name": "Bitcoin", "exchange": "Crypto · USD", "yahooSymbol": "BTC-USD", "slug": "btc"},
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
        instrument = {"market": "us", "ticker": "AAA", "name": "Alpha", "exchange": "NASDAQ", "yahooSymbol": "AAA", "slug": "aaa"}
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


if __name__ == "__main__":
    unittest.main()
