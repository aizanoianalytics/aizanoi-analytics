"""
validate_worlds_assets.py
Deep audit and architectural verification test suite for Historical Worlds asset enhancements.
"""

import unittest
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SHARED_PROPS = BASE_DIR / "frontend" / "worlds" / "shared" / "assets" / "props.js"

WORLDS_MAIN = {
    "aizanoi-225": BASE_DIR / "frontend" / "worlds" / "aizanoi-225" / "js" / "main.js",
    "rome-410-476": BASE_DIR / "frontend" / "worlds" / "rome-410-476" / "js" / "main.js",
    "athens-450-430": BASE_DIR / "frontend" / "worlds" / "athens-450-430" / "js" / "main.js",
    "iga-airport": BASE_DIR / "frontend" / "worlds" / "iga-airport" / "js" / "main.js",
}

NEW_PROPS = [
    # Aizanoi
    "buildRomanSarcophagus",
    "buildPenkalasWaterMill",
    "buildRiverQuayCrane",
    # Rome
    "buildRuinedTriumphalArch",
    "buildLateRomanBarricade",
    "buildForumWatchBrazier",
    # Athens
    "buildClassicalHerm",
    "buildVotiveTripodPillar",
    "buildAtticHydriaFountain",
    # İGA Airport
    "buildBaggageCartTrain",
    "buildBoardingStairsTruck",
    "buildAirportWindsock",
    "buildGateMarshallerSign",
]


class TestHistoricalWorldsAssets(unittest.TestCase):

    def setUp(self):
        self.assertTrue(SHARED_PROPS.exists(), f"Missing {SHARED_PROPS}")
        self.props_content = SHARED_PROPS.read_text(encoding="utf-8")

        self.main_contents = {}
        for world, path in WORLDS_MAIN.items():
            self.assertTrue(path.exists(), f"Missing {path}")
            self.main_contents[world] = path.read_text(encoding="utf-8")

    def test_new_props_exported_in_props_js(self):
        """Ensure all 13 new parametric props are exported in props.js."""
        for prop in NEW_PROPS:
            pattern = rf"export\s+function\s+{prop}\s*\("
            self.assertTrue(
                re.search(pattern, self.props_content),
                f"Export '{prop}' not found in shared/assets/props.js"
            )

    def test_props_imported_in_target_worlds(self):
        """Ensure each world imports its dedicated newly created assets."""
        # Aizanoi
        for prop in ["buildRomanSarcophagus", "buildPenkalasWaterMill", "buildRiverQuayCrane"]:
            self.assertIn(prop, self.main_contents["aizanoi-225"], f"{prop} not imported in aizanoi-225")

        # Rome
        for prop in ["buildRuinedTriumphalArch", "buildLateRomanBarricade", "buildForumWatchBrazier"]:
            self.assertIn(prop, self.main_contents["rome-410-476"], f"{prop} not imported in rome-410-476")

        # Athens
        for prop in ["buildClassicalHerm", "buildVotiveTripodPillar", "buildAtticHydriaFountain"]:
            self.assertIn(prop, self.main_contents["athens-450-430"], f"{prop} not imported in athens-450-430")

        # İGA Airport
        for prop in ["buildBaggageCartTrain", "buildBoardingStairsTruck", "buildAirportWindsock", "buildGateMarshallerSign"]:
            self.assertIn(prop, self.main_contents["iga-airport"], f"{prop} not imported in iga-airport")

    def test_props_placed_in_dressing_functions(self):
        """Ensure each world adds the new assets to its scene dressing group."""
        # Aizanoi
        self.assertIn("buildRiverQuayCrane(", self.main_contents["aizanoi-225"])
        self.assertIn("buildPenkalasWaterMill(", self.main_contents["aizanoi-225"])
        self.assertIn("buildRomanSarcophagus(", self.main_contents["aizanoi-225"])

        # Rome
        self.assertIn("buildRuinedTriumphalArch(", self.main_contents["rome-410-476"])
        self.assertIn("buildLateRomanBarricade(", self.main_contents["rome-410-476"])
        self.assertIn("buildForumWatchBrazier(", self.main_contents["rome-410-476"])

        # Athens
        self.assertIn("buildClassicalHerm(", self.main_contents["athens-450-430"])
        self.assertIn("buildVotiveTripodPillar(", self.main_contents["athens-450-430"])
        self.assertIn("buildAtticHydriaFountain(", self.main_contents["athens-450-430"])

        # İGA Airport
        self.assertIn("buildAirportWindsock(", self.main_contents["iga-airport"])
        self.assertIn("buildBoardingStairsTruck(", self.main_contents["iga-airport"])
        self.assertIn("buildBaggageCartTrain(", self.main_contents["iga-airport"])
        self.assertIn("buildGateMarshallerSign(", self.main_contents["iga-airport"])

    def test_no_gltf_glb_external_models(self):
        """Strict contract: No external 3D model files allowed in runtime code."""
        for name, text in self.main_contents.items():
            self.assertNotIn(".gltf", text.lower(), f"Unexpected gltf reference in {name}")
            self.assertNotIn(".glb", text.lower(), f"Unexpected glb reference in {name}")
        self.assertNotIn(".gltf", self.props_content.lower())
        self.assertNotIn(".glb", self.props_content.lower())

    def test_no_cdn_imports(self):
        """Strict contract: Zero runtime CDN imports; local vendor only."""
        for name, text in self.main_contents.items():
            self.assertNotIn("https://", text, f"Unexpected CDN import in {name}")
            self.assertNotIn("http://", text, f"Unexpected CDN import in {name}")
        self.assertNotIn("https://", self.props_content)

    def test_bracket_and_parenthesis_balance(self):
        """Verify balanced syntax for all modified JS files."""
        files = [SHARED_PROPS] + list(WORLDS_MAIN.values())
        for path in files:
            content = path.read_text(encoding="utf-8")
            # Strip comments and strings for accurate brace counting
            cleaned = re.sub(r"/\*.*?\*/", "", content, flags=re.DOTALL)
            cleaned = re.sub(r"//.*", "", cleaned)
            cleaned = re.sub(r"'(?:\\.|[^'])*'", "''", cleaned)
            cleaned = re.sub(r'"(?:\\.|[^"])*"', '""', cleaned)
            cleaned = re.sub(r"`(?:\\.|[^`])*`", "``", cleaned)

            curly = cleaned.count("{") - cleaned.count("}")
            paren = cleaned.count("(") - cleaned.count(")")
            square = cleaned.count("[") - cleaned.count("]")

            self.assertEqual(curly, 0, f"Unbalanced {{}} in {path.name}: diff {curly}")
            self.assertEqual(paren, 0, f"Unbalanced () in {path.name}: diff {paren}")
            self.assertEqual(square, 0, f"Unbalanced [] in {path.name}: diff {square}")


if __name__ == "__main__":
    unittest.main()
