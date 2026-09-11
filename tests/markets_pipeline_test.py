import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "scripts" / "markets" / "update_markets.py"
spec = importlib.util.spec_from_file_location("update_markets", SCRIPT)
mod = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(mod)


class UpdateMarketsTests(unittest.TestCase):
    def test_universe_is_focused_verified_and_provider_neutral(self):
        universe = mod.build_universe(SCRIPT.parent / "crypto-universe.json")
        self.assertEqual(len(universe), 541)
        tickers = {row["ticker"] for row in universe}
        for ticker in ("AAPL", "MSFT", "NVDA", "ARM", "COIN", "BTC"):
            self.assertIn(ticker, tickers)
        for row in universe:
            self.assertTrue(row["provider"])
            self.assertTrue(row["providerSymbol"])

    def test_provider_symbol_mapping_preserves_dot_form(self):
        rows = [{"market": "us", "ticker": "BRK.B", "name": "Berkshire", "exchange": "NYSE", "slug": "brk-b", "provider": "fintable", "providerSymbol": "BRK.B"}]
        corrected = mod.apply_universe_corrections(rows, overrides={}, excludes=set())
        self.assertEqual(corrected[0]["providerSymbol"], "BRK.B")

    def test_orphan_cleanup_archives_private_provider_tree(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "public"
            (root / "history" / "us").mkdir(parents=True)
            orphan = root / "history" / "us" / "old.json"
            orphan.write_text('{"provider":"fintable"}', encoding="utf-8")
            self.assertEqual(mod.prune_orphans(root, {"us": set()}), 1)
            self.assertFalse(orphan.exists())
            self.assertTrue((root.parent / "archive" / "fintable" / "us" / "old.json").exists())
            self.assertFalse((root / "archive").exists())

    def test_universe_transition_rejects_missing_verified_contract_fields(self):
        import sys
        sys.path.insert(0, str(SCRIPT.parent))
        from universe_builder import validate_universe_transition
        valid = [{"market":"us","ticker":f"T{i}","name":"Verified","exchange":"NYSE","slug":f"t{i}","provider":"fintable","providerSymbol":f"T{i}","memberships":["x"]} for i in range(500)]
        self.assertTrue(validate_universe_transition([], valid))
        invalid = [dict(row) for row in valid]
        invalid[0].pop("providerSymbol")
        self.assertFalse(validate_universe_transition([], invalid))

    def test_constituent_snapshot_has_reviewed_provider_provenance(self):
        provenance = json.loads((SCRIPT.parent / "constituent-snapshot-provenance.json").read_text())
        self.assertEqual(provenance["reviewedAt"], "2026-09-10")
        self.assertEqual(set(provenance["families"]), {"sp500", "nasdaq100", "nyse_us100", "djia", "extra"})
        for record in provenance["families"].values():
            self.assertTrue(record["source"])
            self.assertTrue(record["asOf"])

    def test_cli_argument_validation(self):
        parser = mod.parser()
        for args in (("--slice-count", "0"), ("--delay", "-1"), ("--slice-count", "8", "--slice-index", "8")):
            with self.assertRaises(ValueError):
                mod.run(parser.parse_args(args))

    def test_crypto_universe_defaults_to_usdt_exchange(self):
        rows = mod.crypto_universe(SCRIPT.parent / "crypto-universe.json")
        self.assertTrue(rows)
        for row in rows:
            self.assertEqual(row["exchange"], "Crypto · USDT")

    def test_coverage_start_derives_from_earliest_shard(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "public"
            for market, slug, start in (("us", "aaa", "2019-01-03"), ("crypto", "btc", "2019-01-01")):
                shard_dir = root / "history" / market
                shard_dir.mkdir(parents=True)
                (shard_dir / f"{slug}.json").write_text(json.dumps({"actualCoverageStart": start, "daily": []}), encoding="utf-8")
            instruments = [{"market": m, "slug": s} for m, s, _ in (("us", "aaa", "2019-01-03"), ("crypto", "btc", "2019-01-01"))]
            self.assertEqual(mod.coverage_start(root, instruments), "2019-01-01")
            (root / "history" / "crypto" / "btc.json").write_text(json.dumps({"daily": [{"t": 1546300800, "c": 1}]}), encoding="utf-8")
            self.assertEqual(mod.coverage_start(root, instruments), "2019-01-01")

    def test_manifest_counts_preserve_unrefreshed_market(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "public"
            root.mkdir(parents=True)
            (root / "manifest.json").write_text(json.dumps({"counts": {"us": 506, "crypto": 35}}), encoding="utf-8")
            markets = {"us": [{"slug": "a"}], "crypto": []}
            self.assertEqual(mod.manifest_counts(root, markets, {"us"}), {"us": 1, "crypto": 35})
            self.assertEqual(mod.manifest_counts(root, markets, None), {"us": 1, "crypto": 0})


if __name__ == "__main__":
    unittest.main()
