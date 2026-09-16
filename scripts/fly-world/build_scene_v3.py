#!/usr/bin/env python3
"""Fly House v0.3 production builder.

v0.3 keeps the enlarged/collision-capable v0.2 shell, then applies a much more
literal reference-dressing pass: the broad worn carpet, doorway casing, wall clock,
carved cabinet overlays, cabinet-top still life, CRT lower shelf, stove hearth/tools,
hanging laundry, floor toys, knitting bag, orange ball and a denser continuation of
the bedroom.

A final micro-detail parity pass mirrors the browser fallback details that are easy
to lose in the Blender build: blue-bag stickers/handles, cabinet magnets, pale
slippers, runner fringe, the worn under-rug field and the projecting divan chaise.

The Fly World browser runtime is Z-up, so this builder exports the GLB without
Blender's Y-up conversion. That keeps visual placement and collision coordinates
consistent between the browser fallback and the Blender-authored scene.
"""
from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path

import bpy

ROOT_SCRIPT_DIR = Path(__file__).resolve().parent


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load module {name} from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


base = _load_module("fly_house_v2_base", ROOT_SCRIPT_DIR / "build_scene_v2.py")
detail = _load_module("fly_house_v3_detail", ROOT_SCRIPT_DIR / "detail_pass_v3.py")
micro = _load_module("fly_house_v3_micro", ROOT_SCRIPT_DIR / "micro_detail_pass_v3.py")


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--no-render", action="store_true")
    return parser.parse_args(argv)


def remove_non_reference_beams():
    """v0.2 added heavy beams; the approved illustration has a plain low ceiling."""
    for obj in list(bpy.context.scene.objects):
        if obj.name.startswith("beam-"):
            bpy.data.objects.remove(obj, do_unlink=True)


def export_glb(root: Path):
    build = root / base.BUILD_REL
    build.mkdir(parents=True, exist_ok=True)
    destinations = (
        build / "fly-house-v3.glb",
        root / base.FRONTEND_ASSET_REL,
    )
    (root / base.FRONTEND_ASSET_REL).parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.context.scene.objects:
        if obj.type in {"MESH", "CURVE", "EMPTY"} and not obj.name.startswith("review-camera"):
            obj.select_set(True)

    for dest in destinations:
        bpy.ops.export_scene.gltf(
            filepath=str(dest),
            export_format="GLB",
            use_selection=True,
            export_yup=False,
            export_apply=True,
            export_extras=True,
        )
        print(f"[fly-house-v3] GLB -> {dest}")


def main():
    args = parse_args()
    root = args.root.resolve()
    manifest = base.json.loads((root / base.MANIFEST_REL).read_text(encoding="utf-8"))

    base.clear_scene()
    base.render_setup()
    mats = base.palette()
    base.architecture(mats)
    remove_non_reference_beams()
    base.reference_dressing(root, manifest, mats)
    detail.apply_reference_detail_pass(mats)
    micro.apply_micro_detail_pass(mats)
    base.lighting(mats)

    meta = bpy.data.objects.new("FLY_HOUSE_META", None)
    meta["fly_house_version"] = "0.3.1"
    meta["reference_driven"] = True
    meta["browser_axis"] = "Z-up"
    meta["n_fly_ready"] = True
    meta["micro_detail_parity"] = True
    bpy.context.scene.collection.objects.link(meta)

    sensor = bpy.data.objects.get("FLY_SENSOR_WORLD_ROOT")
    if sensor is None:
        sensor = bpy.data.objects.new("FLY_SENSOR_WORLD_ROOT", None)
        sensor["observer_excluded"] = True
        sensor["n_fly_ready"] = True
        bpy.context.scene.collection.objects.link(sensor)

    build = root / base.BUILD_REL
    build.mkdir(parents=True, exist_ok=True)
    blend = build / "fly-house-v3.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))

    if not args.no_render:
        base.render_reviews(root)
        bpy.ops.wm.save_as_mainfile(filepath=str(blend))

    export_glb(root)
    print("[fly-house-v3] complete: reference density + micro parity + collision metadata + Z-up browser GLB")


if __name__ == "__main__":
    main()
