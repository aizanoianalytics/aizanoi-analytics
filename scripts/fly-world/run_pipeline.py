#!/usr/bin/env python3
"""One-command operator wrapper for the Fly House v0.3 Blender pipeline."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BLENDER_SCRIPT = ROOT / "scripts" / "fly-world" / "build_scene_v3.py"
VALIDATOR_SCRIPT = ROOT / "scripts" / "fly-world" / "validate_project.py"
CANONICALIZER = ROOT / "scripts" / "fly-world" / "canonicalize_glb.py"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate, build, render and export Fly House v0.3")
    parser.add_argument(
        "--strict-assets",
        action="store_true",
        help="require every visual-approval asset before Blender starts",
    )
    parser.add_argument(
        "--skip-preflight",
        action="store_true",
        help="skip manifest/spec validation (debugging only; never use for review candidates)",
    )
    parser.add_argument(
        "--no-render",
        action="store_true",
        help="skip five review renders; browser GLB is still exported",
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
    raise SystemExit("Blender was not found. Install Blender or set BLENDER_BIN to the executable path.")


def run_preflight(strict_assets: bool) -> int:
    command = [sys.executable, str(VALIDATOR_SCRIPT)]
    if strict_assets:
        command.append("--strict-assets")
    print("[fly-house-v3] preflight:", " ".join(command))
    return subprocess.run(command, cwd=ROOT, check=False).returncode


def main() -> int:
    args = parse_args()
    if not args.skip_preflight:
        code = run_preflight(args.strict_assets)
        if code != 0:
            print("[fly-house-v3] preflight failed; Blender was not started.", file=sys.stderr)
            return code

    command = [
        find_blender(),
        "--background",
        "--python",
        str(BLENDER_SCRIPT),
        "--",
        "--root",
        str(ROOT),
    ]
    if args.no_render:
        command.append("--no-render")

    print("[fly-house-v3] blender:", " ".join(command))
    blender_rc = subprocess.run(command, cwd=ROOT, check=False).returncode
    if blender_rc != 0:
        return blender_rc

    frontend = ROOT / "frontend" / "labs" / "fly-world" / "assets" / "fly-house.glb"
    if frontend.exists():
        print("[fly-house-v3] canonicalize:", frontend)
        canonical_rc = subprocess.run(
            [sys.executable, str(CANONICALIZER), str(frontend)],
            cwd=ROOT,
            check=False,
        ).returncode
        if canonical_rc != 0:
            print("[fly-house-v3] canonicalizer failed.", file=sys.stderr)
            return canonical_rc
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
