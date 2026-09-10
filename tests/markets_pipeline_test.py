import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "scripts" / "markets" / "update_markets.py"
spec = importlib.util.spec_from_file_location("update_markets", SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class UpdateMarketsTests(unittest.TestCase):
    def test_yahoo_variants_generate_candidate_spellings_for_failed_symbols(self):
        # Dotted class shares (AKO.A) map to dash form; preferred series (AHL-D)
        # maps to the -P<letter> spelling Yahoo actually serves (AHL-PD).
        self.assertEqual(list(mod.yahoo_variants("AKO.A")), ["AKO.A", "AKO-A"])
        self.assertEqual(list(mod.yahoo_variants("ATH-A")), ["ATH-A", "ATH-PA"])
        self.assertEqual(list(mod.yahoo_variants("AHL-D")), ["AHL-D", "AHL-PD"])
        self.assertEqual(list(mod.yahoo_variants("AAPL")), ["AAPL"])

    def test_universe_filter_removes_dead_symbols_and_applies_mapping_overrides(self):
        rows = [
            {"market": "us", "ticker": "GOOD", "yahooSymbol": "GOOD", "slug": "good"},
            {"market": "us", "ticker": "DEAD", "yahooSymbol": "DEAD", "slug": "dead"},
            {"market": "us", "ticker": "ATH-A", "yahooSymbol": "ATH-A", "slug": "ath-a"},
        ]
        filtered = mod.apply_universe_corrections(rows, overrides={"ATH-A": "ATH-PA"}, excludes={"DEAD"})
        self.assertEqual([row["yahooSymbol"] for row in filtered], ["GOOD", "ATH-PA"])
        self.assertEqual(filtered[1]["slug"], "ath-pa")

    def test_symbols_file_limits_update_to_requested_symbols(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "retry.txt"
            path.write_text("GOOD1\n# comment\nGOOD2\n\n", encoding="utf-8")
            self.assertEqual(mod.load_symbols_file(path), ["GOOD1", "GOOD2"])

    def test_orphan_cleanup_removes_shards_for_dropped_instruments(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            keep = {"us": {"good.json"}, "crypto": {"btc.json"}}
            (root / "history" / "us").mkdir(parents=True)
            (root / "history" / "crypto").mkdir(parents=True)
            (root / "summary-items" / "us").mkdir(parents=True)
            (root / "history" / "us" / "good.json").write_text("{}", encoding="utf-8")
            (root / "history" / "us" / "dead.json").write_text("{}", encoding="utf-8")
            (root / "history" / "crypto" / "btc.json").write_text("{}", encoding="utf-8")
            (root / "summary-items" / "us" / "dead.json").write_text("{}", encoding="utf-8")
            removed = mod.prune_orphans(root, keep)
            self.assertEqual(removed, 2)
            self.assertFalse((root / "history" / "us" / "dead.json").exists())
            self.assertFalse((root / "summary-items" / "us" / "dead.json").exists())
            self.assertTrue((root / "history" / "us" / "good.json").exists())
            self.assertTrue((root / "history" / "crypto" / "btc.json").exists())

    def test_failed_multi_symbol_batch_is_bisected_so_one_bad_symbol_does_not_block_good_ones(self):
        rows = [{"yahooSymbol": symbol} for symbol in ("GOOD1", "BAD", "GOOD2")]
        def fetch(subset):
            symbols = [row["yahooSymbol"] for row in subset]
            if "BAD" in symbols:
                raise RuntimeError(f"yahoo rejected batch containing {symbols}")
            return {row["yahooSymbol"]: [{"t": 1, "c": 2.0}] for row in subset}
        data, failed = mod.resilient_download(rows, fetch)
        self.assertEqual(sorted(data), ["GOOD1", "GOOD2"])
        self.assertEqual(failed, ["BAD"])

    def test_atomic_publication_writes_manifest_summary_and_symbol_shard(self):
        instruments = [
            {"market": "us", "ticker": "TEST", "name": "Test Inc", "exchange": "NASDAQ", "yahooSymbol": "TEST", "slug": "test"},
            {"market": "crypto", "ticker": "TST", "name": "Testcoin", "exchange": "Crypto · USD", "yahooSymbol": "TST-USD", "slug": "tst"},
        ]
        histories = {
            "TEST": {"daily": [{"t": 1546300800, "o": 1.0, "h": 1.5, "l": 0.5, "c": 1.2, "a": 1.2, "v": 100}],
                     "fourHour": [{"t": 1788000000, "o": 1.0, "h": 1.4, "l": 0.9, "c": 1.3, "v": 50}]},
            "TST-USD": {"daily": [{"t": 1546300800, "o": 10.0, "h": 11.0, "l": 9.5, "c": 10.5, "a": 10.5, "v": 1000},
                                  {"t": 1546387200, "o": 10.5, "h": 12.0, "l": 10.0, "c": 11.5, "a": 11.5, "v": 1200}],
                        "fourHour": []},
        }
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            mod.publish_snapshot(root, instruments, histories, completed_at="2026-09-10T00:00:00Z")
            manifest = json.loads((root / "manifest.json").read_text())
            summary = json.loads((root / "summary.json").read_text())
            shard = json.loads((root / "history" / "us" / "test.json").read_text())
            self.assertEqual(manifest["counts"], {"us": 1, "crypto": 1})
            self.assertEqual(manifest["status"], "complete")
            self.assertEqual(summary["markets"]["us"][0]["ticker"], "TEST")
            self.assertEqual(shard["daily"][0]["c"], 1.2)
            self.assertEqual(shard["fourHour"][0]["t"], 1788000000)
            # Crypto annualizes on the 365-day calendar; us on 252 trading days.
            crypto_row = summary["markets"]["crypto"][0]
            us_row = summary["markets"]["us"][0]
            self.assertEqual(crypto_row["market"], "crypto")
            self.assertIsNone(crypto_row["return7d"])  # too few candles by design
            self.assertIsNotNone(crypto_row["latest"])
            self.assertIsNotNone(us_row["latest"])

    def test_required_us_universe(self):
        import sys
        sys.path.insert(0, str(SCRIPT.parent))
        from universe_builder import build_focused_us_universe
        extra_path = SCRIPT.parent / "us-universe-extra.json"
        universe = build_focused_us_universe(extra_path)
        # Universe should be focused between 500 and 700 instruments
        self.assertGreaterEqual(len(universe), 500)
        self.assertLessEqual(len(universe), 700)
        tickers = {item["ticker"] for item in universe}
        # Required core blue chips and growth leaders must be present
        for req in ("AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "JPM", "V", "UNH", "PLTR", "ARM", "COIN"):
            self.assertIn(req, tickers)
        # Multi-membership tracking should tag key index constituents
        aapl = next(item for item in universe if item["ticker"] == "AAPL")
        self.assertIn("sp500", aapl["memberships"])
        self.assertIn("nasdaq100", aapl["memberships"])
        self.assertIn("djia", aapl["memberships"])

    def test_suspicious_universe(self):
        import sys
        sys.path.insert(0, str(SCRIPT.parent))
        from universe_builder import validate_universe_transition
        good = [{"ticker": f"T{i}"} for i in range(526)]
        tiny = [{"ticker": f"T{i}"} for i in range(100)]
        giant = [{"ticker": f"T{i}"} for i in range(1200)]
        self.assertTrue(validate_universe_transition([], good))
        self.assertFalse(validate_universe_transition([], tiny))
        self.assertFalse(validate_universe_transition([], giant))
        # Drop > 35% is rejected
        dropped = [{"ticker": f"T{i}"} for i in range(300)]
        self.assertFalse(validate_universe_transition(good, dropped))

    def test_cli_argument_validation(self):
        import argparse
        parser = mod.parser()
        # Invalid slice-count <= 0
        with self.assertRaises(ValueError):
            mod.run(parser.parse_args(["--slice-count", "0"]))
        # Invalid negative delay
        with self.assertRaises(ValueError):
            mod.run(parser.parse_args(["--delay", "-1"]))
        # Invalid slice-index out of bounds (greater than count)
        with self.assertRaises(ValueError):
            mod.run(parser.parse_args(["--slice-count", "8", "--slice-index", "10"]))
        # Boundary: slice-index == slice-count (indices are 0-based)
        with self.assertRaises(ValueError):
            mod.run(parser.parse_args(["--slice-count", "8", "--slice-index", "8"]))
        # Boundary: negative slice-index
        with self.assertRaises(ValueError):
            mod.run(parser.parse_args(["--slice-count", "8", "--slice-index", "-1"]))

    def test_orphan_cleanup_archives_legacy_history(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            keep = {"us": {"good.json"}, "crypto": {"btc.json"}}
            (root / "history" / "us").mkdir(parents=True)
            (root / "summary-items" / "us").mkdir(parents=True)
            (root / "history" / "us" / "good.json").write_text('{"t":1}', encoding="utf-8")
            (root / "history" / "us" / "old_delisted.json").write_text('{"t":2}', encoding="utf-8")
            (root / "summary-items" / "us" / "old_delisted.json").write_text('{"t":2}', encoding="utf-8")
            removed = mod.prune_orphans(root, keep, archive=True)
            self.assertEqual(removed, 2)
            # Dropped file removed from active history and archived
            self.assertFalse((root / "history" / "us" / "old_delisted.json").exists())
            self.assertTrue((root / "archive" / "legacy-yahoo" / "us" / "old_delisted.json").exists())
            self.assertEqual((root / "archive" / "legacy-yahoo" / "us" / "old_delisted.json").read_text(), '{"t":2}')
            # Kept file remains untouched in active history and is NOT archived
            self.assertTrue((root / "history" / "us" / "good.json").exists())
            self.assertEqual((root / "history" / "us" / "good.json").read_text(), '{"t":1}')
            self.assertFalse((root / "archive" / "legacy-yahoo" / "us" / "good.json").exists())

    def test_aggregate_automatically_prunes_and_archives_orphans(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            instruments = [
                {"market": "us", "ticker": "AAA", "name": "Alpha", "exchange": "NASDAQ", "yahooSymbol": "AAA", "slug": "aaa"},
            ]
            (root / "history" / "us").mkdir(parents=True)
            (root / "summary-items" / "us").mkdir(parents=True)
            (root / "history" / "us" / "aaa.json").write_text('{"daily":[]}', encoding="utf-8")
            (root / "summary-items" / "us" / "aaa.json").write_text('{"ticker":"AAA","slug":"aaa"}', encoding="utf-8")
            (root / "history" / "us" / "orphan.json").write_text('{"legacy":true}', encoding="utf-8")
            (root / "summary-items" / "us" / "orphan.json").write_text('{"ticker":"ORPHAN","slug":"orphan"}', encoding="utf-8")

            mod.aggregate(root, instruments, "2026-09-10T12:00:00Z", [])

            # Active instrument retained
            self.assertTrue((root / "history" / "us" / "aaa.json").exists())
            self.assertTrue((root / "summary-items" / "us" / "aaa.json").exists())
            # Orphan pruned and archived
            self.assertFalse((root / "history" / "us" / "orphan.json").exists())
            self.assertFalse((root / "summary-items" / "us" / "orphan.json").exists())
            self.assertTrue((root / "archive" / "legacy-yahoo" / "us" / "orphan.json").exists())


if __name__ == "__main__":
    unittest.main()
