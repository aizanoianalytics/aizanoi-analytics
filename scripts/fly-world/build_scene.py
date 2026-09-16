#!/usr/bin/env python3
"""Build Fly House in Blender from the canonical scene specification.

This file is intentionally Blender-only (`bpy`). Run it via `run_pipeline.py` or:

    blender --background --python scripts/fly-world/build_scene.py -- \
      --root /path/to/repo --render-previews --export-glb

The script creates a metric architectural shell, reference-locked composition proxies,
imports approved third-party assets when configured, writes a .blend file, exports a
GLB, and renders fixed benchmark views. Missing hero assets remain clearly named
PROXY__* so they cannot be mistaken for approved final art.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector


WORKSPACE = Path("gelistirmeler/2026-09-16-fly-world-prototype")
SPEC_REL = WORKSPACE / "scene_spec.json"
ASSETS_REL = WORKSPACE / "asset_manifest.json"
BUILD_REL = WORKSPACE / "build"


def parse_args() -> argparse.Namespace:
    argv = sys.argv
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--render-previews", action="store_true")
    parser.add_argument("--export-glb", action="store_true")
    parser.add_argument("--no-cutaway", action="store_true", help="Keep front/south wall visible in benchmark renders")
    return parser.parse_args(argv)


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        # Do not remove while iterating: Blender may still hold transient references.
        pass


def make_material(name, color, roughness=0.8, metallic=0.0, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission is not None:
        emission_input = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
        strength_input = bsdf.inputs.get("Emission Strength")
        if emission_input:
            emission_input.default_value = (*emission, 1.0)
        if strength_input:
            strength_input.default_value = emission_strength
    return mat


def palette():
    return {
        "warm-aged-plaster": make_material("warm-aged-plaster", (0.66, 0.58, 0.46), 0.93),
        "aged-white-plaster": make_material("aged-white-plaster", (0.73, 0.70, 0.63), 0.95),
        "aged-green-floor": make_material("aged-green-floor", (0.28, 0.31, 0.25), 0.91),
        "wood": make_material("aged-reddish-wood", (0.34, 0.13, 0.075), 0.69),
        "wood-dark": make_material("dark-aged-wood", (0.17, 0.07, 0.045), 0.76),
        "textile-green": make_material("muted-green-textile", (0.28, 0.33, 0.18), 0.96),
        "textile-red": make_material("muted-red-textile", (0.40, 0.16, 0.11), 0.96),
        "textile-pink": make_material("muted-pink-textile", (0.43, 0.25, 0.26), 0.96),
        "rug": make_material("warm-pattern-proxy", (0.43, 0.18, 0.095), 0.98),
        "rug-dark": make_material("rug-dark-proxy", (0.16, 0.075, 0.04), 0.98),
        "metal": make_material("aged-dark-metal", (0.095, 0.08, 0.075), 0.58, 0.62),
        "metal-light": make_material("aged-light-metal", (0.32, 0.29, 0.26), 0.45, 0.72),
        "glass": make_material("window-glass", (0.35, 0.48, 0.52), 0.18, 0.0),
        "blue": make_material("blue-bag-proxy", (0.18, 0.35, 0.45), 0.9),
        "curtain-red": make_material("floral-curtain-proxy", (0.42, 0.12, 0.075), 0.98),
        "curtain-white": make_material("lace-curtain-proxy", (0.76, 0.74, 0.67), 0.98),
        "fire": make_material("stove-fire", (0.7, 0.08, 0.01), 0.35, 0.0, (1.0, 0.12, 0.01), 8.0),
    }


def add_box(name, size, location, material, bevel=0.0, collection=None):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if material:
        obj.data.materials.append(material)
    if bevel > 0:
        modifier = obj.modifiers.new("softened-edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    obj["fly_visible"] = True
    if collection is not None:
        for old in tuple(obj.users_collection):
            old.objects.unlink(obj)
        collection.objects.link(obj)
    return obj


def add_cylinder(name, radius, depth, location, material, vertices=32, collection=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    if material:
        obj.data.materials.append(material)
    obj["fly_visible"] = True
    if collection is not None:
        for old in tuple(obj.users_collection):
            old.objects.unlink(obj)
        collection.objects.link(obj)
    return obj


def wall_for_room(room, wall_name, material, collection):
    ox, oy, _ = room["origin"]
    width, depth, height = room["size"]
    thickness = 0.12
    openings = [o for o in room.get("openings", []) if o["wall"] == wall_name]

    if wall_name in ("west", "east"):
        fixed = ox - width / 2 if wall_name == "west" else ox + width / 2
        span_min, span_max = oy - depth / 2, oy + depth / 2
        horizontal_index = 1
        def segment(name, a, b, z0, z1):
            if b <= a or z1 <= z0:
                return
            add_box(name, (thickness, b-a, z1-z0), (fixed, (a+b)/2, (z0+z1)/2), material, collection=collection)
    else:
        fixed = oy - depth / 2 if wall_name == "south" else oy + depth / 2
        span_min, span_max = ox - width / 2, ox + width / 2
        horizontal_index = 0
        def segment(name, a, b, z0, z1):
            if b <= a or z1 <= z0:
                return
            add_box(name, (b-a, thickness, z1-z0), ((a+b)/2, fixed, (z0+z1)/2), material, collection=collection)

    if not openings:
        segment(f"WALL__{room['id']}__{wall_name}", span_min, span_max, 0.0, height)
        return

    # v0.1 rooms have at most one opening per wall. Keep the geometry explicit and inspectable.
    opening = openings[0]
    center_h = opening["center"][horizontal_index]
    span = opening["size"][horizontal_index]
    a, b = center_h - span / 2, center_h + span / 2
    z0 = opening.get("sillHeight", 0.0)
    z1 = z0 + opening["size"][2]
    segment(f"WALL__{room['id']}__{wall_name}__left", span_min, a, 0.0, height)
    segment(f"WALL__{room['id']}__{wall_name}__right", b, span_max, 0.0, height)
    segment(f"WALL__{room['id']}__{wall_name}__below", a, b, 0.0, z0)
    segment(f"WALL__{room['id']}__{wall_name}__above", a, b, z1, height)


def build_room_shell(spec, mats):
    collection = bpy.data.collections.new("ARCHITECTURE")
    bpy.context.scene.collection.children.link(collection)
    for room in spec["rooms"]:
        ox, oy, oz = room["origin"]
        width, depth, height = room["size"]
        add_box(
            f"FLOOR__{room['id']}",
            (width, depth, 0.08),
            (ox, oy, oz - 0.04),
            mats[room["floorMaterial"]],
            collection=collection,
        )
        add_box(
            f"CEILING__{room['id']}",
            (width, depth, 0.08),
            (ox, oy, height + 0.04),
            mats["aged-white-plaster"],
            collection=collection,
        )
        for wall_name in ("west", "east", "south", "north"):
            wall_for_room(room, wall_name, mats[room["wallMaterial"]], collection)
    return collection


def add_window_details(mats):
    collection = bpy.data.collections.new("WINDOWS_AND_CURTAINS")
    bpy.context.scene.collection.children.link(collection)
    # West window lies in the X plane. Geometry intentionally follows the approved illustration.
    add_box("window-glass", (0.035, 1.70, 1.40), (-3.73, -0.75, 1.44), mats["glass"], collection=collection)
    for y in (-1.48, -1.1, -0.72, -0.34, 0.04):
        add_box("window-bar-v", (0.05, 0.045, 1.44), (-3.67, y, 1.44), mats["metal"], collection=collection)
    for z in (0.82, 1.25, 1.68, 2.08):
        add_box("window-bar-h", (0.05, 1.70, 0.045), (-3.67, -0.75, z), mats["metal"], collection=collection)
    # Two distinct curtain layers: floral outer and light lace inner.
    add_box("PROXY__floral-curtain", (0.035, 0.62, 2.25), (-3.53, 0.25, 1.52), mats["curtain-red"], bevel=0.02, collection=collection)
    add_box("PROXY__lace-curtain", (0.03, 0.50, 2.15), (-3.50, -0.18, 1.52), mats["curtain-white"], bevel=0.02, collection=collection)
    # Bedroom north window and curtain indication.
    add_box("bedroom-window-glass", (1.22, 0.035, 1.32), (5.20, 3.33, 1.455), mats["glass"], collection=collection)
    add_box("PROXY__bedroom-curtain", (0.45, 0.03, 1.75), (4.52, 3.25, 1.55), mats["curtain-red"], bevel=0.015, collection=collection)


def import_asset(root: Path, entry, target, collection):
    local_path = entry.get("localPath")
    source = entry.get("source")
    if not local_path or not source or not source.get("url") or not source.get("license"):
        return None
    path = (root / local_path).resolve()
    if not path.exists():
        print(f"[fly-house] asset slot {entry['id']} configured but file is missing: {path}")
        return None

    before = set(bpy.context.scene.objects)
    suffix = path.suffix.lower()
    try:
        if suffix in (".glb", ".gltf"):
            bpy.ops.import_scene.gltf(filepath=str(path))
        elif suffix == ".fbx":
            bpy.ops.import_scene.fbx(filepath=str(path))
        elif suffix == ".obj":
            if hasattr(bpy.ops.wm, "obj_import"):
                bpy.ops.wm.obj_import(filepath=str(path))
            else:
                bpy.ops.import_scene.obj(filepath=str(path))
        else:
            print(f"[fly-house] unsupported asset format for {entry['id']}: {suffix}")
            return None
    except Exception as exc:
        print(f"[fly-house] failed to import {entry['id']}: {exc}")
        return None

    imported = [obj for obj in bpy.context.scene.objects if obj not in before and obj.type in {"MESH", "EMPTY"}]
    if not imported:
        return None
    root_empty = bpy.data.objects.new(f"ASSET__{entry['id']}", None)
    collection.objects.link(root_empty)
    for obj in imported:
        if obj.parent is None:
            obj.parent = root_empty
    root_empty.location = target["position"]
    root_empty.rotation_euler = [math.radians(v) for v in target.get("rotationDeg", [0, 0, 0])]
    root_empty["asset_source_url"] = source["url"]
    root_empty["asset_license"] = source["license"]
    root_empty["fly_visible"] = True
    return root_empty


def proxy_for_target(target, mats, collection):
    size = target["size"]
    position = target["position"]
    role = target["role"]
    material = mats["wood"]
    if "rug" in role:
        material = mats["rug"]
    elif "stove" in role:
        material = mats["metal"]
    elif "bag" in role:
        material = mats["blue"]
    elif role == "bench-sofa":
        material = mats["textile-green"]
    elif role == "metal-kettle":
        material = mats["metal-light"]
    elif "basket" in role:
        material = mats["wood-dark"]

    if target.get("proxy") == "cylinder":
        obj = add_cylinder(f"PROXY__{target['id']}", max(size[0], size[1]) / 2, size[2], position, material, 40, collection)
    else:
        obj = add_box(f"PROXY__{target['id']}", tuple(size), tuple(position), material, bevel=min(size) * 0.06, collection=collection)
    obj.rotation_euler = [math.radians(v) for v in target.get("rotationDeg", [0, 0, 0])]
    obj["proxy_only"] = True
    obj["asset_slot"] = target.get("assetSlot", "")
    return obj


def build_hero_objects(root: Path, spec, manifest, mats):
    collection = bpy.data.collections.new("HERO_OBJECTS")
    bpy.context.scene.collection.children.link(collection)
    slots = {slot["id"]: slot for slot in manifest["slots"]}
    for target in spec["heroObjects"]:
        slot = slots.get(target.get("assetSlot"))
        imported = import_asset(root, slot, target, collection) if slot else None
        if imported is None:
            proxy_for_target(target, mats, collection)

    # Reference-defining secondary forms are kept even before sourced assets arrive.
    # Sofa quilt and pillows.
    add_box("PROXY__bench-quilt", (2.35, 0.76, 0.15), (-0.45, 1.65, 0.86), mats["textile-green"], bevel=0.06, collection=collection)
    for idx, (x, color_key) in enumerate(((-1.72,"textile-green"),(-0.95,"textile-red"),(-0.18,"textile-pink"))):
        add_box(f"PROXY__pillow-{idx+1}", (0.66, 0.22, 0.52), (x, 2.00, 1.02), mats[color_key], bevel=0.08, collection=collection)
    # Bed quilt and pillow cluster.
    add_box("PROXY__bed-quilt", (1.52, 1.90, 0.20), (5.95, 1.70, 0.78), mats["textile-red"], bevel=0.05, collection=collection)
    add_box("PROXY__bed-pillow", (1.05, 0.42, 0.26), (5.95, 2.48, 0.98), mats["textile-pink"], bevel=0.07, collection=collection)
    # Stove front fire window.
    fire = add_box("stove-fire-window", (0.52, 0.02, 0.30), (1.95, 0.30, 0.63), mats["fire"], bevel=0.02, collection=collection)
    fire.rotation_euler.x = math.radians(90)
    return collection


def build_stove_pipe(spec, mats):
    curve_data = bpy.data.curves.new("stove-pipe-curve", "CURVE")
    curve_data.dimensions = "3D"
    curve_data.bevel_depth = spec["stovePipe"]["radius"]
    curve_data.bevel_resolution = 3
    spline = curve_data.splines.new("BEZIER")
    points = spec["stovePipe"]["points"]
    spline.bezier_points.add(len(points) - 1)
    for point, coords in zip(spline.bezier_points, points):
        point.co = coords
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new("stove-pipe", curve_data)
    bpy.context.scene.collection.objects.link(obj)
    curve_data.materials.append(mats["metal"])
    obj["fly_visible"] = True
    obj["landing_surface"] = True
    return obj


def build_clutter(spec, mats):
    collection = bpy.data.collections.new("CLUTTER_BLOCKOUT")
    bpy.context.scene.collection.children.link(collection)
    rng = random.Random(spec["clutter"]["seed"])
    # Keep the blockout clustered where the approved reference actually has clutter.
    patches = [(-1.2,-0.55,1.2,0.8), (0.45,-0.35,1.25,0.85), (-2.55,-1.15,0.55,0.75)]
    count = min(spec["clutter"]["targetCount"], 18)
    colors = [mats["wood"], mats["textile-red"], mats["textile-green"], mats["blue"]]
    for idx in range(count):
        cx, cy, sx, sy = patches[idx % len(patches)]
        x = cx + (rng.random() - .5) * sx
        y = cy + (rng.random() - .5) * sy
        w, d, h = rng.uniform(.06,.24), rng.uniform(.04,.18), rng.uniform(.03,.14)
        obj = add_box(f"PROXY__clutter-{idx+1:02d}", (w,d,h), (x,y,h/2+.025), colors[idx % len(colors)], bevel=min(w,d,h)*.16, collection=collection)
        obj.rotation_euler.z = rng.uniform(-math.pi, math.pi)
        obj["proxy_only"] = True


def add_lighting(spec, mats):
    scene = bpy.context.scene
    world = scene.world or bpy.data.worlds.new("Fly House World")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.055, 0.045, 0.035, 1.0)
    background.inputs["Strength"].default_value = 0.28

    def point(name, location, energy, color, radius):
        data = bpy.data.lights.new(name, "POINT")
        data.energy = energy
        data.color = color
        data.shadow_soft_size = radius
        obj = bpy.data.objects.new(name, data)
        obj.location = location
        scene.collection.objects.link(obj)
        return obj

    # Cool window key, warm practical lights. Values are tuned for Eevee preview, not physical lux claims.
    area_data = bpy.data.lights.new("window-key", "AREA")
    area_data.energy = 520
    area_data.color = (0.60, 0.76, 1.0)
    area_data.shape = "RECTANGLE"
    area_data.size = 1.55
    area_data.size_y = 1.25
    area = bpy.data.objects.new("window-key", area_data)
    area.location = (-3.35, -0.75, 1.65)
    area.rotation_euler = (0, math.radians(-90), 0)
    scene.collection.objects.link(area)
    point("stove-glow", (1.95, 0.18, 0.60), 130, (1.0, 0.13, 0.018), .55)
    point("bedroom-lamp", (4.55, 2.10, 1.35), 90, (1.0, 0.42, 0.10), .45)


def configure_render():
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        try:
            scene.render.engine = "BLENDER_EEVEE"
        except Exception:
            pass
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"


def track_camera(camera, target):
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_previews(root: Path, spec, cutaway=True):
    output = root / BUILD_REL / "previews"
    output.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    # Hide front wall and ceiling only for the wide benchmark views; GLB export remains complete.
    cutaway_objects = [obj for obj in scene.objects if "__south" in obj.name or obj.name.startswith("CEILING__")]
    original = {obj.name: obj.hide_render for obj in cutaway_objects}
    if cutaway:
        for obj in cutaway_objects:
            obj.hide_render = True

    cam_data = bpy.data.cameras.new("benchmark-camera")
    camera = bpy.data.objects.new("benchmark-camera", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    for preset in spec["previewCameras"]:
        camera.location = preset["position"]
        cam_data.lens = preset["focalLengthMm"]
        track_camera(camera, preset["lookAt"])
        scene.render.filepath = str(output / f"{preset['id']}.png")
        print(f"[fly-house] rendering {preset['id']}")
        bpy.ops.render.render(write_still=True)
    for obj in cutaway_objects:
        obj.hide_render = original[obj.name]


def export_glb(root: Path):
    output = root / BUILD_REL / "fly-house.glb"
    output.parent.mkdir(parents=True, exist_ok=True)
    # Benchmark camera/lights are useful in .blend but the browser owns viewing/light adaptation.
    bpy.ops.object.select_all(action="DESELECT")
    exportables = [obj for obj in bpy.context.scene.objects if obj.type in {"MESH", "CURVE", "EMPTY"} and not obj.name.startswith("benchmark-camera")]
    for obj in exportables:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_extras=True,
    )
    print(f"[fly-house] GLB -> {output}")


def main():
    args = parse_args()
    root = args.root.resolve()
    spec = load_json(root / SPEC_REL)
    manifest = load_json(root / ASSETS_REL)
    build_dir = root / BUILD_REL
    build_dir.mkdir(parents=True, exist_ok=True)

    clear_scene()
    configure_render()
    mats = palette()
    build_room_shell(spec, mats)
    add_window_details(mats)
    build_hero_objects(root, spec, manifest, mats)
    build_stove_pipe(spec, mats)
    build_clutter(spec, mats)
    add_lighting(spec, mats)

    # Semantic roots are intentionally separate from human observer state.
    sensor_root = bpy.data.objects.new("FLY_SENSOR_WORLD_ROOT", None)
    sensor_root["observer_excluded"] = True
    sensor_root["n_fly_ready"] = True
    bpy.context.scene.collection.objects.link(sensor_root)

    blend_path = build_dir / "fly-house.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    print(f"[fly-house] blend -> {blend_path}")

    if args.render_previews:
        render_previews(root, spec, cutaway=not args.no_cutaway)
        bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    if args.export_glb:
        export_glb(root)

    proxies = [obj.name for obj in bpy.context.scene.objects if obj.name.startswith("PROXY__")]
    print(f"[fly-house] completed with {len(proxies)} explicit proxy object(s).")
    if proxies:
        print("[fly-house] VISUAL APPROVAL BLOCKED until required hero proxies are replaced by approved assets.")


if __name__ == "__main__":
    main()
