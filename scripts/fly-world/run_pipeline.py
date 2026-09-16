#!/usr/bin/env python3
"""One-command operator wrapper for the Fly House Blender pipeline."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BLENDER_SCRIPT = ROOT / "scripts" / "fly-world" / "build_scene.py"


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


def main() -> int:
    blender = find_blender()
    passthrough = sys.argv[1:]
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
        *passthrough,
    ]
    print("[fly-house]", " ".join(command))
    completed = subprocess.run(command, cwd=ROOT, check=False)
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
