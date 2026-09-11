import argparse
import importlib.util
import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).parents[1] / "scripts" / "markets" / "update_markets.py"
spec = importlib.util.spec_from_file_location("update_markets_hardening", SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def iso(ts: int) -> str:
    import datetime as dt
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).isoformat().replace("+00:00", "Z")


class MarketsHardeningTests(unittest.TestCase):
    def instrument(self, market: str, ticker: str, symbol: str | None = None):
        return {
            "market": market, "ticker": ticker, "name": f"{ticker} Verified", "exchange": "NASDAQ" if market == "us" else "Crypto · USD",
            "slug": ticker.lower(), "provider": "fintable" if market == "us" else "binance",
            "providerSymbol": symbol or ticker,
            "memberships": ["test"],
        }

    def write_shard(self, root: Path, instrument: dict, observation: int | None = None):
        observation = observation or int(time.time())
        daily = [{"t": observation - 86400, "c": 10.0}, {"t": observation, "c": 11.0}]
        shard = {**instrument, "schemaVersion": 3, "priceBasis": "adjusted-close" if instrument["market"] == "us" else "exchange-close",
                 "publishedAt": iso(observation), "lastSuccessfulFetchAt": iso(observation), "lastObservationAt": iso(observation),
                 "requestedCoverageStart": "2019-01-01", "actualCoverageStart": "2020-01-01", "daily": daily, "fourHour": []}
        mod.write_json_atomic(root / "history" / instrument["market"] / f"{instrument['slug']}.json", shard)
        mod.write_json_atomic(root / "summary-items" / instrument["market"] / f"{instrument['slug']}.json", mod.summary_row(instrument, daily, iso(observation)))
        return shard

    def test_markets_source_scope_has_no_retired_provider_terms(self):
        scope = [Path("scripts/markets"), Path("frontend/analytics/markets"), Path("frontend/js/v3/apps/markets"), Path("tests/markets_pipeline_test.py"), Path("tests/markets_product_test.py"), Path("tests/test_provider_contracts.py"), Path("tests/test_markets_hardening.py"), Path("tests/markets-product-core.test.mjs"), Path("tests/markets-product-ui.test.mjs"), Path("tests/browser/aizanoi-markets.test.mjs"), Path("tests/browser/aizanoi-os-markets.test.mjs"), Path("docs/HERMES_OPERATIONS.md")]
        forbidden = ("y" + "a" + "h" + "o" + "o", "y" + "a" + "h" + "o" + "o" + "S" + "y" + "m" + "b" + "o" + "l", "query1" + "." + "finance", "query2" + "." + "finance", "finance" + "." + "y" + "a" + "h" + "o" + "o")
        for base in scope:
            files = [base] if base.is_file() else [p for p in base.rglob("*") if p.is_file()]
            for path in files:
                text = path.read_text(errors="ignore")
                for term in forbidden:
                    self.assertNotIn(term, text, f"retired term in {path}")


    def test_active_universe_and_v3_output_are_provider_neutral(self):
        rows = mod.build_universe(SCRIPT.parent / "crypto-universe.json")
        self.assertTrue(rows)
        for row in rows:
            self.assertEqual(set(("provider", "providerSymbol")) - set(row), set())
            self.assertNotIn("legacyField", row)

    def test_failure_record_uses_market_not_symbol_suffix(self):
        us = self.instrument("us", "AAPL")
        btc = self.instrument("crypto", "BTC", "BTCUSDT")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write_shard(root, us)
            self.write_shard(root, btc)
            mod._publish_derived(root, {"us": [mod.read_json(root / "summary-items/us/aapl.json", {})], "crypto": [mod.read_json(root / "summary-items/crypto/btc.json", {})]}, iso(int(time.time())), [
                {"market": "crypto", "ticker": "BTC", "provider": "binance", "providerSymbol": "BTCUSDT", "error": "boom"}
            ])
            health = mod.read_json(root / "health.json", {})
            self.assertEqual(health["crypto"]["expected"], 1)
            self.assertEqual(health["crypto"]["published"], 1)
            self.assertEqual(health["crypto"]["failedCurrentRefresh"], ["BTC"])
            self.assertEqual(health["us"]["failedCurrentRefresh"], [])

    def test_health_check_propagates_unhealthy_exit_code(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            item = self.instrument("us", "AAPL")
            mod.write_json_atomic(root / "instruments.json", [item])
            self.write_shard(root, item, int(time.time()) - 9 * 86400)
            args = mod.parser().parse_args(["--mode", "health-check", "--data-root", str(root)])
            self.assertNotEqual(mod.run(args), 0)

    def test_health_check_requires_recent_crypto_four_hour_observation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            item = self.instrument("crypto", "BTC", "BTCUSDT")
            mod.write_json_atomic(root / "instruments.json", [item])
            shard = self.write_shard(root, item)
            shard["fourHour"] = [{"t": int(time.time()) - 7 * 3600, "c": 11.0}]
            mod.write_json_atomic(root / "history/crypto/btc.json", shard)
            self.assertNotEqual(mod.health_check(root, iso(int(time.time()))), 0)

    def test_rebuild_preserves_v3_provenance_and_fetch_time(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            item = self.instrument("us", "AAPL")
            original = self.write_shard(root, item, 1_700_000_000)
            rebuilt = mod.rebuild_derived(root, [item], completed_at="2026-09-11T00:00:00Z")
            self.assertEqual(rebuilt, 1)
            shard = mod.read_json(root / "history/us/aapl.json", {})
            for field in ("schemaVersion", "provider", "providerSymbol", "priceBasis", "publishedAt", "lastSuccessfulFetchAt", "lastObservationAt", "actualCoverageStart", "requestedCoverageStart"):
                self.assertEqual(shard[field], original[field])

    def test_orphan_archive_is_private_provider_aware_and_verified_before_unlink(self):
        with tempfile.TemporaryDirectory() as tmp:
            public = Path(tmp) / "public"
            (public / "history/us").mkdir(parents=True)
            orphan = public / "history/us/orphan.json"
            orphan.write_text('{"provider":"fintable"}', encoding="utf-8")
            removed = mod.prune_orphans(public, {"us": set()}, archive=True)
            archived = Path(tmp) / "archive" / "fintable" / "us" / "orphan.json"
            self.assertEqual(removed, 1)
            self.assertTrue(archived.exists())
            self.assertEqual(archived.read_bytes(), b'{"provider":"fintable"}')
            self.assertFalse(orphan.exists())

    def test_bootstrap_retargets_public_root_to_private_staging(self):
        with tempfile.TemporaryDirectory() as tmp:
            public = Path(tmp) / "public"
            self.assertEqual(mod._bootstrap_root(public), Path(tmp) / "staging" / "bootstrap")
            self.assertNotEqual(mod._bootstrap_root(public), public)

    def test_crypto_pair_preflight_returns_typed_failure(self):
        btc = self.instrument("crypto", "BTC", "BTCUSDT")
        with patch.object(mod, "BinanceProvider") as provider_cls:
            provider_cls.return_value.validate_pair.return_value = False
            failures = mod.validate_crypto_pairs([btc])
        self.assertEqual(failures, [{"market":"crypto", "ticker":"BTC", "provider":"binance", "providerSymbol":"BTCUSDT", "error":"Binance pair missing or not TRADING"}])

    def test_atomic_cutover_exchanges_only_validated_complete_staging(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp); public = base / "public"; stage = base / "staging" / "bootstrap"
            public.mkdir(parents=True); stage.mkdir(parents=True)
            old = {"schemaVersion": 3, "provider": "fintable", "providerSymbol": "OLD", "daily": []}
            new = {"schemaVersion": 3, "provider": "fintable", "providerSymbol": "AAPL", "daily": [{"t": 1, "c": 1}]}
            mod.write_json_atomic(public / "marker.json", {"old": True})
            instrument = self.instrument("us", "AAPL")
            mod.write_json_atomic(stage / "instruments.json", [instrument])
            mod.write_json_atomic(stage / "manifest.json", {"schemaVersion": 3, "status": "complete", "counts": {"us": 1, "crypto": 0}})
            mod.write_json_atomic(stage / "history" / "us" / "aapl.json", new)
            result = mod.atomic_cutover(public)
            self.assertIn("cutover instruments=1", result)
            self.assertTrue((public / "history" / "us" / "aapl.json").exists())
            archive = Path(result.split("rollbackArchive=", 1)[1])
            self.assertTrue((archive / "marker.json").exists())

    def test_cutover_rejects_invalid_provider_metadata_and_leaves_public_untouched(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp); public = base / "public"; stage = base / "staging" / "bootstrap"
            public.mkdir(parents=True); stage.mkdir(parents=True)
            mod.write_json_atomic(public / "marker.json", {"old": True})
            instrument = self.instrument("us", "AAPL"); instrument.pop("providerSymbol")
            mod.write_json_atomic(stage / "instruments.json", [instrument])
            mod.write_json_atomic(stage / "manifest.json", {"schemaVersion": 3, "status": "complete", "counts": {"us": 1, "crypto": 0}})
            mod.write_json_atomic(stage / "history" / "us" / "aapl.json", {"schemaVersion": 3, "provider": "fintable", "providerSymbol": "AAPL"})
            with self.assertRaises(ValueError): mod.atomic_cutover(public)
            self.assertTrue((public / "marker.json").exists())

    def test_calendar_returns_do_not_accept_long_crypto_gap(self):
        latest = 2_000_000_000
        candles = [{"t": latest - 365 * 86400 - 10 * 86400, "c": 100.0}, {"t": latest, "c": 110.0}]
        self.assertIsNone(mod._returns_by_timestamp(candles, 365, annualization=365))

    def test_composites_are_unavailable_when_required_metrics_missing(self):
        row = {"ticker": "A", "slug": "a", "return1d": 0.01, "return30d": None, "return90d": None,
               "rangePosition52w": None, "trendRegime": None, "aboveSma200": None, "trendAge50": None,
               "volatilityPercentile": None, "rsi14": None, "percentile7d": None}
        mod.enrich_market_rows([row], market="us")
        self.assertIsNone(row["momentumQuality"])
        self.assertIsNone(row["meanReversionScore"])


if __name__ == "__main__":
    unittest.main()
