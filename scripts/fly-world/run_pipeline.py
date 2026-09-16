#!/usr/bin/env python3
"""One-command operator wrapper for the Fly House Blender pipeline."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BLENDER_SCRIPT = ROOT / "scripts" / "fly-world" / "build_scene.py"
VALIDATOR_SCRIPT = ROOT / "scripts" / "fly-world" / "validate_project.py"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate, build, render and export Fly House")
    parser.add_argument(
        "--strict-assets",
        action="store_true",
        help="require every visual-approval asset before Blender starts",
    )
    parser.add_argument(
        "--skip-preflight",
        action="store_true",
        help="skip manifest/spec validation (debugging only; not for review candidates)",
    )
    parser.add_argument(
        "--no-cutaway",
        action="store_true",
        help="keep the front wall and ceilings visible in benchmark renders",
    )
    return parser.parse_args()


def find_blender() -> str:
    explicit = os.environ.get("BLENDER_BIN")
    if explicit:
        return explicit
    for candidate in ("blender", "blender.exe"):
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    raise SystemExit(
        "Blender was not found. Install Blender or set BLENDER_BIN to the executable path."
    )


def run_preflight(strict_assets: bool) -> int:
    command = [sys.executable, str(VALIDATOR_SCRIPT)]
    if strict_assets:
        command.append("--strict-assets")
    print("[fly-house] preflight:", " ".join(command))
    return subprocess.run(command, cwd=ROOT, check=False).returncode


def main() -> int:
    args = parse_args()

    if not args.skip_preflight:
        preflight_code = run_preflight(args.strict_assets)
        if preflight_code != 0:
            print("[fly-house] preflight failed; Blender was not started.", file=sys.stderr)
            return preflight_code

    blender = find_blender()
    command = [
        blender,
        "--background",
        "--python",
        str(BLENDER_SCRIPT),
        "--",
        "--root",
        str(ROOT),
        "--render-previews",
        "--export-glb",
    ]
    if args.no_cutaway:
        command.append("--no-cutaway")

    print("[fly-house] blender:", " ".join(command))
    completed = subprocess.run(command, cwd=ROOT, check=False)
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
