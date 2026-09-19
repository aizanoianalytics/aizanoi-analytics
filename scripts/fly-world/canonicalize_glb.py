#!/usr/bin/env python3
"""Deterministic GLB canonicalizer for Fly House v0.3.

Two consecutive no-render Blender exports of the same authored scene
produce byte-different GLBs because ``bpy.ops.export_scene.gltf`` is not
byte-stable on the default settings.  This script normalises the JSON
header so the metadata is canonical while preserving the binary blob
content.  It is intentionally *idempotent* — running the canonicalizer
twice on the same input produces the same SHA-256.

The canonicalizer is also used by ``scripts/fly-world/run_pipeline.py``
as the final stage of the production build, so the published GLB always
comes out of a canonical pass.

The script also writes a SHA-256 marker to ``--marker`` so a regression
test can pin the canonical SHA of the published GLB and assert the
canonicalizer is idempotent for two consecutive runs.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path


def parse_glb(path: Path) -> tuple[dict, bytes]:
    raw = path.read_bytes()
    if raw[:4] != b"glTF":
        raise ValueError(f"{path} is not a GLB file")
    _, total_len = struct.unpack_from("<II", raw, 4)
    pos = 12
    json_chunk = b""
    bin_chunk = b""
    while pos < total_len:
        length, ctype = struct.unpack_from("<I4s", raw, pos)
        data = raw[pos + 8 : pos + 8 + length]
        if ctype == b"JSON":
            json_chunk = data
        elif ctype == b"BIN\x00":
            bin_chunk = data
        pos += 8 + length
    if not json_chunk or not bin_chunk:
        raise ValueError("expected exactly JSON + BIN chunks")
    return json.loads(json_chunk.decode("utf-8")), bin_chunk


def canonicalize(header: dict, bin_bytes: bytes) -> tuple[dict, bytes]:
    """Return a JSON-canonical copy of ``header`` (bin blob unchanged).

    The canonical pass keeps the same byte content but emits the JSON in a
    fully deterministic shape: every key is sorted lexicographically, the
    collection order is preserved (we do not renumber or reorder entries
    because that would shift bufferView targets/byte offsets and break the
    binary blob), and primitive lists keep their original layout.
    """
    return json.loads(json.dumps(header, sort_keys=True, separators=(",", ":"))), bin_bytes


def write_glb(path: Path, header: dict, bin_bytes: bytes) -> None:
    json_bytes = json.dumps(header, sort_keys=True, separators=(",", ":")).encode("utf-8")
    pad = (-len(json_bytes)) % 4
    json_padded = json_bytes + b" " * pad
    bin_pad = (-len(bin_bytes)) % 4
    bin_padded = bin_bytes + b"\x00" * bin_pad
    total = 12 + 8 + len(json_padded) + 8 + len(bin_padded)
    out = bytearray()
    out += b"glTF"
    out += struct.pack("<II", 2, total)
    out += struct.pack("<I4s", len(json_padded), b"JSON")
    out += json_padded
    out += struct.pack("<I4s", len(bin_padded), b"BIN\x00")
    out += bin_padded
    if len(out) != total:
        raise RuntimeError("GLB total length mismatch after padding")
    path.write_bytes(bytes(out))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("glb", type=Path)
    parser.add_argument("--marker", type=Path,
                        help="optional path to write the canonical SHA-256 marker")
    parser.add_argument("--check", action="store_true",
                        help="fail if the canonical SHA differs from --marker")
    args = parser.parse_args()
    header, bin_bytes = parse_glb(args.glb)
    new_header, new_bin = canonicalize(header, bin_bytes)
    write_glb(args.glb, new_header, new_bin)
    sha = hashlib.sha256(args.glb.read_bytes()).hexdigest()
    if args.marker:
        if args.check and args.marker.exists():
            expected = args.marker.read_text().strip()
            if expected != sha:
                print(f"GLB canonicalizer: SHA mismatch expected={expected[:12]} got={sha[:12]}", file=sys.stderr)
                return 2
        args.marker.write_text(sha + "\n")
    print(f"canonicalized={args.glb} size={args.glb.stat().st_size} sha256={sha}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
