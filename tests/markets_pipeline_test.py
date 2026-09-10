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


if __name__ == "__main__":
    unittest.main()
