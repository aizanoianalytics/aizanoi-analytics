"""Markets frontend correctness regression tests.

These tests complement the Node-based suite by guarding:
- DOM/HTML structure expected on the public pages
- Markets CSS rules required for layout integrity (no horizontal overflow,
  chart-tooltip hidden state)
- The Markets instrument page bootstraps the correct module entry
- Module contract entry declared by markets.json points to the existing file
- No markets page pulls in a retired provider reference

They do not exercise runtime behaviour — that coverage lives in
``tests/markets-frontend-correctness.test.mjs``. The point of this Python
suite is to catch regressions in the static shell that ships to visitors.
"""

import json
import re
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
ANALYTICS = REPO_ROOT / 'frontend' / 'analytics' / 'markets'
CORE_JS = ANALYTICS / 'core.js'
DASHBOARD_JS = ANALYTICS / 'dashboard.js'
INSTRUMENT_JS = ANALYTICS / 'instrument' / 'app.js'
CSS = ANALYTICS / 'markets.css'
DASHBOARD_HTML = ANALYTICS / 'index.html'
INSTRUMENT_HTML = ANALYTICS / 'instrument' / 'index.html'
APPS_DIR = REPO_ROOT / 'frontend' / 'js' / 'v3' / 'apps'
FRONTEND_INDEX = REPO_ROOT / 'frontend' / 'index.html'  # noqa: E305
REGISTRY = REPO_ROOT / 'frontend' / 'js' / 'v3' / 'registry.js'
APPS_INDEX = REPO_ROOT / 'frontend' / 'js' / 'v3' / 'apps' / 'index.md'

# CSS rules the page needs to keep working ---------------------------------------------------

class MarketsCssRulesTest(unittest.TestCase):
    def setUp(self):
        self.css = CSS.read_text(encoding='utf-8')

    def test_chart_tooltip_hidden_attribute_is_hidden(self):
        # Bug 1: the chart tooltip used to render as a visible empty box on first paint.
        # The CSS now enforces display:none whenever the hidden attribute is present.
        self.assertRegex(self.css, r'\.chart-tooltip\[hidden\]\s*\{\s*display:\s*none\s*!important')

    def test_chart_tooltip_data_active_overrides_default(self):
        # When data-active is set (during hover) we want the tooltip to be visible.
        self.assertRegex(self.css, r'\.chart-tooltip\[data-active\]\s*\{\s*display:\s*grid')

    def test_body_does_not_horizontally_overflow(self):
        # Without this rule the raw data table on narrow viewports stretches the page.
        self.assertRegex(self.css, r'html,\s*body\s*\{[^}]*overflow-x:\s*hidden')


# Markets dashboard and instrument page DOM ---------------------------------------------------

class MarketsHtmlStructureTest(unittest.TestCase):
    def test_dashboard_uses_dashboard_app(self):
        html = DASHBOARD_HTML.read_text(encoding='utf-8')
        # The Markets dashboard loads its own entry module
        self.assertRegex(html, r'<script[^>]+type="module"[^>]+src="[^"]*markets/[^"]*app\.js"')
        self.assertIn('data-markets-root', html)

    def test_instrument_uses_instrument_app(self):
        html = INSTRUMENT_HTML.read_text(encoding='utf-8')
        self.assertRegex(html, r'<script[^>]+type="module"[^>]+src="[^"]*instrument/app\.js"')


# Markets module registry and app directory ---------------------------------------------------

class MarketsModuleContractTest(unittest.TestCase):
    def test_markets_module_is_discoverable(self):
        apps_dir = APPS_DIR / 'markets'
        self.assertTrue(apps_dir.is_dir(), 'AizanoiOS Markets module must live under frontend/js/apps/markets/')
        manifest = json.loads((apps_dir / 'manifest.json').read_text(encoding='utf-8'))
        self.assertEqual(manifest.get('id'), 'markets')
        self.assertEqual(manifest.get('type'), 'desktop-app')
        self.assertTrue((apps_dir / manifest['entry'].lstrip('./')).is_file())

    def test_apps_index_lists_markets(self):
        text = APPS_INDEX.read_text(encoding='utf-8')
        self.assertIn('markets/index.md', text)

    def test_registry_lists_markets(self):
        text = REGISTRY.read_text(encoding='utf-8')
        self.assertRegex(text, r"id:\s*'markets'")

    def test_frontend_home_loads_aizanoios(self):
        # The AizanoiOS home page delegates to v3 main.js + module registry; Markets is
        # exposed as an AizanoiOS app from there.
        text = FRONTEND_INDEX.read_text(encoding='utf-8')
        self.assertIn('/js/v3/main.js', text)
        # markets entry exists in the module registry
        registry_text = (REPO_ROOT / 'frontend' / 'js' / 'v3' / 'module-registry.generated.js').read_text(encoding='utf-8')
        self.assertIn('"markets"', registry_text)


# Static regression guards for the markets bug fixes --------------------------------------------

class MarketsStaticRegressionTest(unittest.TestCase):
    def setUp(self):
        self.core = CORE_JS.read_text(encoding='utf-8')
        self.dashboard = DASHBOARD_JS.read_text(encoding='utf-8')
        self.instrument = INSTRUMENT_JS.read_text(encoding='utf-8')

    def test_formatPrice_has_market_parameter(self):
        # Bug 4: formatPrice must accept a market argument.
        self.assertRegex(self.core, r'export const formatPrice = \(value, market = \'us\'\)')

    def test_formatPrice_uses_usdt_branch_for_crypto(self):
        self.assertIn('formatUSDT', self.core)
        self.assertRegex(self.core, r"if \(market === 'crypto'\) return formatUSDT")

    def test_formatPrice_adaptive_decimal_precision_for_small_crypto(self):
        # Bug 4: small crypto values must keep enough decimals (4 / 6 / 8 digits).
        self.assertRegex(self.core, r'abs\s*<\s*0\.0001[^}]*return 8')
        self.assertRegex(self.core, r'abs\s*<\s*0\.01[^}]*return 6')
        self.assertRegex(self.core, r'abs\s*<\s*1[^}]*return 4')

    def test_instrument_chart_state_has_separate_chart_and_history_dates(self):
        # Bug 2: chart and history date ranges must be independent.
        self.assertRegex(self.instrument, r'chartDateFrom:\s*\'\'')
        self.assertRegex(self.instrument, r'chartDateTo:\s*\'\'')
        self.assertRegex(self.instrument, r'historyDateFrom:\s*\'\'')
        self.assertRegex(self.instrument, r'historyDateTo:\s*\'\'')

    def test_instrument_no_generic_date_state_remains(self):
        # Bug 2: the shared state.dateFrom / state.dateTo must be gone.
        self.assertNotRegex(self.instrument, r'\bstate\.dateFrom\b')
        self.assertNotRegex(self.instrument, r'\bstate\.dateTo\b')

    def test_instrument_chart_tool_renders_chart_date_inputs(self):
        # Bug 2: chart toolbar From/To must bind to chartDateFrom/To.
        chart_block = re.search(r'function renderChartControls\(\)[\s\S]+?\n\}', self.instrument)
        self.assertIsNotNone(chart_block, 'renderChartControls not found in instrument/app.js')
        chart_source = chart_block.group() or ''
        self.assertIn('state.chartDateFrom', chart_source)
        self.assertIn('state.chartDateTo', chart_source)

    def test_instrument_history_renders_history_date_inputs(self):
        # Bug 2: history form From/To must bind to historyDateFrom/To.
        history_block = re.search(r'function renderHistory[\s\S]+?\n  </section>', self.instrument)
        self.assertIsNotNone(history_block, 'renderHistory not found in instrument/app.js')
        history_source = history_block.group() or ''
        self.assertIn('state.historyDateFrom', history_source)
        self.assertIn('state.historyDateTo', history_source)

    def test_instrument_chart_handlers_write_chart_state(self):
        # Bug 2: the change handler for chart inputs must write the chart state.
        self.assertRegex(self.instrument, r"matches\(\s*'\[data-date-from\]'\s*\)[^}]+state\.chartDateFrom\s*=")
        self.assertRegex(self.instrument, r"matches\(\s*'\[data-date-to\]'\s*\)[^}]+state\.chartDateTo\s*=")

    def test_instrument_history_handlers_write_history_state(self):
        # Bug 2: the change handler for history inputs must write the history state.
        self.assertRegex(self.instrument, r"matches\(\s*'\[data-history-from\]'\s*\)[^}]+state\.historyDateFrom\s*=")
        self.assertRegex(self.instrument, r"matches\(\s*'\[data-history-to\]'\s*\)[^}]+state\.historyDateTo\s*=")

    def test_instrument_history_submit_writes_history_state_only(self):
        # Bug 2: history form submit must never touch the chart state.
        submit_block = re.search(r"matches\(\s*'\[data-history-filter\]'\s*\)[\s\S]+?return;\s*\n\s*\}", self.instrument)
        self.assertIsNotNone(submit_block, 'history submit handler not found')
        body = submit_block.group() or ''
        self.assertIn('state.historyDateFrom', body)
        self.assertIn('state.historyDateTo', body)
        self.assertNotIn('state.chartDateFrom', body)
        self.assertNotIn('state.chartDateTo', body)

    def test_instrument_chart_timeframe_change_clears_chart_state_only(self):
        # Bug 2: changing timeframe must clear the chart dates, not the history dates.
        tf_block = re.search(r"matches\(\s*'\[data-timeframe\]'\s*\)[\s\S]+?render\(\);", self.instrument)
        self.assertIsNotNone(tf_block, 'timeframe handler not found')
        body = tf_block.group() or ''
        self.assertIn("state.chartDateFrom = ''", body)
        self.assertIn("state.chartDateTo = ''", body)
        self.assertNotIn('state.historyDateFrom', body)
        self.assertNotIn('state.historyDateTo', body)

    def test_instrument_chart_tooltip_uses_cached_indicators(self):
        # Bug 3: the tooltip must read from the cached full-history indicator series.
        self.assertIn('state.cachedIndicators', self.instrument)
        self.assertIn('state.cachedSourceOffset', self.instrument)

    def test_instrument_chart_does_not_recompute_indicator_series_in_tooltip(self):
        # Bug 3: tooltip must not call indicatorSeries(visibleSource) — that would re-warm
        # the indicators on the sliced source and produce wrong warm-up values.
        tooltip_block = re.search(r'function updateChartTooltip[\s\S]+?\n\}\n', self.instrument)
        self.assertIsNotNone(tooltip_block, 'updateChartTooltip not found')
        tooltip_source = tooltip_block.group() or ''
        self.assertNotRegex(tooltip_source, r'indicatorSeries\(\s*visibleSource\s*\)')
        # fullIndex calculation must be present
        self.assertRegex(tooltip_source, r'fullIndex\s*=\s*\(state\.cachedSourceOffset')

    def test_formatPrice_calls_in_instrument_pass_market(self):
        # Bug 4: every formatPrice call in the instrument page must forward the market.
        calls = re.findall(r'formatPrice\(([^)]+)\)', self.instrument)
        for call in calls:
            self.assertRegex(call, r'[^,]+,\s*market\b', f'formatPrice call missing market arg: {call!r}')

    def test_formatPrice_calls_in_dashboard_pass_market(self):
        # Bug 4: every formatPrice call in the dashboard must forward the active market.
        calls = re.findall(r'formatPrice\(([^)]+)\)', self.dashboard)
        for call in calls:
            self.assertRegex(call, r'[^,]+,\s*(?:this\.market|state\.market|market)\b',
                             f'formatPrice call missing market arg: {call!r}')

    def test_retired_provider_terms_absent_from_markets_source(self):
        # Pipeline-level guard: the frontend must never re-introduce a retired provider.
        forbidden = (
            'y' + 'a' + 'h' + 'o' + 'o',
            'y' + 'a' + 'h' + 'o' + 'o' + 'S' + 'y' + 'm' + 'b' + 'o' + 'l',
            'query1' + '.finance', 'query2' + '.finance',
            'finance' + '.y' + 'a' + 'h' + 'o' + 'o',
        )
        for path in (CORE_JS, DASHBOARD_JS, INSTRUMENT_JS, DASHBOARD_HTML, INSTRUMENT_HTML, CSS):
            text = path.read_text(encoding='utf-8')
            for term in forbidden:
                self.assertNotIn(term, text, f'retired provider term {term!r} in {path}')


# Main -------------------------------------------------------------------------------------------

if __name__ == '__main__':
    unittest.main()
