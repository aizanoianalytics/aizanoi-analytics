"""
validate_aizanoi_assets.py
Deep audit and architectural verification for the Aizanoi world assets.

Replaces the retired four-world `validate_worlds_assets.py`. Aizanoi is the only
surviving interactive world, so a validator that only ever checked Aizanoi while
carrying a four-world name was misleading. This one is honest about its scope.
"""

import re
import unittest
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
WORLDS = BASE_DIR / "frontend" / "worlds"
SHARED_PROPS = WORLDS / "shared" / "assets" / "props.js"
AIZANOI = WORLDS / "aizanoi-225"
AIZANOI_MAIN = AIZANOI / "js" / "main.js"

# Parametric props the Aizanoi scene dressing is expected to compose. These are
# the Aizanoi-owned subset of the previously shared four-world prop set.
AIZANOI_PROPS = [
    "buildRomanSarcophagus",
    "buildPenkalasWaterMill",
    "buildRiverQuayCrane",
]

# A retired product must not return to the tree under a new name. Asserted
# negatively so a reintroduced directory fails loudly instead of being catalogued
# by the generated search/sitemap generators as a live route.
RETIRED_WORLD_DIRS = [
    "rome-410-476",
    "athens-450-430",
    "iga-airport",
]


class TestAizanoiAssets(unittest.TestCase):

    def setUp(self):
        self.assertTrue(WORLDS.exists(), f"Missing {WORLDS}")
        self.assertTrue(AIZANOI.exists(), f"Missing {AIZANOI}")
        self.assertTrue(SHARED_PROPS.exists(), f"Missing {SHARED_PROPS}")
        self.props_content = SHARED_PROPS.read_text(encoding="utf-8")
        self.assertTrue(AIZANOI_MAIN.exists(), f"Missing {AIZANOI_MAIN}")
        self.main_content = AIZANOI_MAIN.read_text(encoding="utf-8")

    def test_retired_world_directories_are_absent(self):
        """Rome, Athens and Istanbul Airport must not return to the tree."""
        for name in RETIRED_WORLD_DIRS:
            self.assertFalse(
                (WORLDS / name).exists(),
                f"retired world directory {name} returned under {WORLDS}",
            )

    def test_aizanoi_props_exported_in_props_js(self):
        """Every Aizanoi-owned parametric prop must be exported by the shared module."""
        for prop in AIZANOI_PROPS:
            pattern = rf"export\s+function\s+{prop}\s*\("
            self.assertTrue(
                re.search(pattern, self.props_content),
                f"Export '{prop}' not found in {SHARED_PROPS.name}",
            )

    def test_aizanoi_props_imported_in_scene(self):
        """The Aizanoi scene must import the props it is expected to compose."""
        for prop in AIZANOI_PROPS:
            self.assertIn(prop, self.main_content, f"{prop} not used in aizanoi-225")

    def test_props_placed_in_dressing_functions(self):
        """Props must actually be placed in the scene, not merely imported."""
        for prop in AIZANOI_PROPS:
            call = f"{prop}("
            self.assertIn(
                call,
                self.main_content,
                f"{prop} is imported but never called in aizanoi-225 scene dressing",
            )

    def test_no_four_world_references_in_aizanoi_sources(self):
        """Aizanoi must not reference a retired sibling world by path."""
        for path in sorted(AIZANOI.rglob("*.js")):
            content = path.read_text(encoding="utf-8")
            for name in RETIRED_WORLD_DIRS:
                self.assertNotIn(
                    name,
                    content,
                    f"aizanoi-225/{path.name} references retired world slug {name}",
                )


if __name__ == "__main__":
    unittest.main()
