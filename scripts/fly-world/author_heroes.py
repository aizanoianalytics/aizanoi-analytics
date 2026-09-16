#!/usr/bin/env python3
"""Author all 14 required Fly House hero assets in Blender (studio-authored, CC0).

Run: blender --background --python scripts/fly-world/author_heroes.py -- --root /path/to/repo

Each hero is modeled around its local origin (x/y centered, z centered on its
spec envelope height) at metric scale, then exported to
gelistirmeler/2026-09-16-fly-world-prototype/assets/source/<slot>/<slot>.glb
plus a <slot>.png pattern sheet where textiles use generated image textures.

Design rule: old, lived-in, coherent. Bevels everywhere, multi-part construction,
no pristine showroom surfaces.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy


WORKSPACE = Path("gelistirmeler/2026-09-16-fly-world-prototype")
SOURCE_ROOT = WORKSPACE / "assets" / "source"


# ── basics ────────────────────────────────────────────────────────────────

def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--root", type=Path, required=True)
    p.add_argument("--only", default="", help="comma-separated slot ids to (re)build")
    return p.parse_args(argv)


def clear_all():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.images):
        for x in list(coll):
            try:
                coll.remove(x)
            except Exception:
                pass


def mat(name, rgb, rough=0.8, metal=0.0, emission=None, estrength=0.0):
    m = bpy.data.materials.new(name=name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*rgb, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emission is not None:
        e = b.inputs.get("Emission Color") or b.inputs.get("Emission")
        s = b.inputs.get("Emission Strength")
        if e is not None:
            e.default_value = (*emission, 1.0)
        if s is not None:
            s.default_value = estrength
    return m


def std_mats():
    return {
        "wood": mat("wood", (0.36, 0.15, 0.085), 0.70),
        "wood_dark": mat("wood_dark", (0.19, 0.08, 0.05), 0.76),
        "wood_worn": mat("wood_worn", (0.45, 0.24, 0.13), 0.80),
        "green": mat("green", (0.28, 0.33, 0.18), 0.96),
        "red": mat("red", (0.42, 0.17, 0.11), 0.96),
        "pink": mat("pink", (0.45, 0.27, 0.27), 0.96),
        "cream": mat("cream", (0.78, 0.70, 0.57), 0.96),
        "metal": mat("metal", (0.10, 0.085, 0.08), 0.60, 0.62),
        "metal_light": mat("metal_light", (0.34, 0.31, 0.28), 0.45, 0.72),
        "soot": mat("soot", (0.06, 0.055, 0.05), 0.85, 0.3),
        "glass_dark": mat("glass_dark", (0.05, 0.07, 0.09), 0.15, 0.2,
                          emission=(0.10, 0.16, 0.22), estrength=0.35),
        "fire": mat("fire", (0.7, 0.08, 0.01), 0.35, 0.0, (1.0, 0.12, 0.01), 6.0),
    }


def box(name, dims, loc, material=None, bevel=0.015, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.dimensions = dims
    bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        md = o.modifiers.new("soft", "BEVEL")
        md.width = bevel
        md.segments = 2
        md.limit_method = "ANGLE"
    if material:
        o.data.materials.append(material)
    for poly in o.data.polygons:
        poly.use_smooth = True
    return o


def cyl(name, r1, r2, depth, loc, material=None, verts=20, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(radius=r1, depth=depth,
                                       vertices=verts, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    if material:
        o.data.materials.append(material)
    for poly in o.data.polygons:
        poly.use_smooth = True
    return o


def ball(name, radius, loc, material=None):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=loc, segments=16, ring_count=10)
    o = bpy.context.active_object
    o.name = name
    if material:
        o.data.materials.append(material)
    for poly in o.data.polygons:
        poly.use_smooth = True
    return o


def torus(name, major, minor, loc, material=None, rot=(0, 0, 0), arc_full=True):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                     major_segments=20, minor_segments=10,
                                     location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    if material:
        o.data.materials.append(material)
    return o


def plane(name, w, h, loc, material=None, cut_w=1, cut_h=1, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.dimensions = (w, h, 0)
    bpy.ops.object.transform_apply(scale=True)
    if cut_w > 1 or cut_h > 1:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.subdivide(number_cuts=max(cut_w, cut_h) - 1)
        bpy.ops.object.mode_set(mode="OBJECT")
    if material:
        o.data.materials.append(material)
    return o


def wave_displace(obj, axis, amp, freq, phase=0.0):
    mesh = obj.data
    for v in mesh.vertices:
        c = v.co[axis]
        v.co.z += math.sin(c * freq + phase) * amp
    mesh.update()


def join_by_material():
    by_mat = {}
    for o in list(bpy.context.scene.objects):
        if o.type != "MESH" or not o.data.materials:
            continue
        by_mat.setdefault(o.data.materials[0].name, []).append(o)
    for name, objs in by_mat.items():
        if len(objs) < 2:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
        bpy.context.active_object.name = f"merged_{name}"


# ── procedural pattern images ─────────────────────────────────────────────

def new_image(name, w, h, painter, out_dir=None):
    img = bpy.data.images.new(name, w, h, alpha=True)
    px = painter(w, h)
    img.pixels = px
    img.update()
    if out_dir is not None:
        img.file_format = "PNG"
        img.filepath_raw = str(out_dir / f"{name}.png")
        img.save()
    return img


def flat_painter(fn):
    def painter(w, h):
        out = []
        for y in range(h):
            for x in range(w):
                out.extend(fn(x / w, y / h, x, y, w, h))
        return out
    return painter


def _kilim_motif(u, v):
    # diamond lattice overlay
    du = abs(((u * 11) % 1.0) - 0.5) * 2
    dv = abs(((v * 5) % 1.0) - 0.5) * 2
    d = du + dv
    if d < 0.28:
        return (0.85, 0.78, 0.62, 1.0)
    if d < 0.42:
        return (0.12, 0.08, 0.06, 1.0)
    return None


@flat_painter
def kilim_px(u, v, x, y, w, h):
    bands = [(0.55, 0.20, 0.10), (0.72, 0.38, 0.16), (0.30, 0.12, 0.08),
             (0.16, 0.10, 0.08), (0.62, 0.30, 0.14), (0.78, 0.68, 0.52)]
    c = bands[int(v * 12) % len(bands)]
    m = _kilim_motif(u, v)
    if m:
        return m
    n = ((x * 7 + y * 13) % 11) / 11.0 * 0.06
    return (c[0] - n, c[1] - n, c[2] - n, 1.0)


@flat_painter
def round_rug_px(u, v, x, y, w, h):
    import math as _m
    r = _m.hypot(u - 0.5, v - 0.5) * 2
    a = _m.atan2(v - 0.5, u - 0.5)
    ring = int(r * 9)
    palette = [(0.35, 0.42, 0.25), (0.68, 0.42, 0.38), (0.72, 0.62, 0.32),
               (0.45, 0.30, 0.22), (0.55, 0.55, 0.45)]
    c = palette[ring % len(palette)]
    if int((a / _m.pi * 18 + ring) % 2) == 0:
        c = tuple(max(0.0, ch - 0.12) for ch in c)
    if r > 1.0:
        return (0, 0, 0, 0)
    return (*c, 1.0)


@flat_painter
def floral_px(u, v, x, y, w, h):
    import math as _m
    base = (0.38, 0.10, 0.07)
    # large stylized flowers on a grid
    gu, gv = (u * 4) % 1.0, (v * 3) % 1.0
    d = _m.hypot(gu - 0.5, gv - 0.5)
    if d < 0.30:
        ang = _m.atan2(gv - 0.5, gu - 0.5)
        petal = 0.5 + 0.5 * _m.sin(ang * 6)
        if d < 0.10:
            return (0.85, 0.70, 0.30, 1.0)
        if d < 0.10 + 0.16 * petal:
            return (0.80, 0.45, 0.42, 1.0)
        return (0.30, 0.38, 0.16, 1.0)
    if ((x + y) % 7) == 0:
        return (0.30, 0.36, 0.15, 1.0)
    n = ((x * 3 + y * 5) % 9) / 9.0 * 0.05
    return (base[0] - n, base[1], base[2], 1.0)


@flat_painter
def lace_px(u, v, x, y, w, h):
    import math as _m
    # open net with floral dots; alpha holes
    net = ((x % 8) < 1) or ((y % 8) < 1)
    gu, gv = (u * 6) % 1.0, (v * 5) % 1.0
    dot = _m.hypot(gu - 0.5, gv - 0.5) < 0.16
    if net or dot:
        return (0.92, 0.90, 0.84, 1.0)
    if ((x // 8 + y // 8) % 2) == 0:
        return (0.92, 0.90, 0.84, 0.55)
    return (0.9, 0.88, 0.82, 0.0)


@flat_painter
def patchwork_px(u, v, x, y, w, h):
    cols = [(0.62, 0.25, 0.15), (0.30, 0.36, 0.20), (0.70, 0.60, 0.40),
            (0.45, 0.28, 0.28), (0.25, 0.30, 0.38), (0.68, 0.42, 0.30)]
    i, j = int(u * 6), int(v * 4)
    c = cols[(i * 3 + j * 5) % len(cols)]
    # seam
    if (u * 6) % 1.0 < 0.03 or (v * 4) % 1.0 < 0.04:
        return (0.20, 0.14, 0.10, 1.0)
    # tiny motif
    if ((x // 6 + y // 6) % 2) == 0:
        return tuple(min(1.0, ch + 0.10) for ch in c) + (1.0,)
    return (*c, 1.0)


@flat_painter
def ticking_px(u, v, x, y, w, h):
    if int(u * 24) % 3 == 0:
        return (0.45, 0.35, 0.28, 1.0)
    return (0.72, 0.66, 0.55, 1.0)


@flat_painter
def basket_px(u, v, x, y, w, h):
    row = int(v * 14) % 2
    stagger = 0.5 if row else 0.0
    stake = int((u + stagger) * 18) % 2
    c = (0.55, 0.36, 0.18) if stake else (0.42, 0.26, 0.12)
    if int(v * 14 * 4) % 4 == 0:
        c = tuple(max(0.0, ch - 0.10) for ch in c)
    return (*c, 1.0)


def textile_mat(name, img, rough=0.96, alpha=False):
    m = mat(name, (1, 1, 1), rough)
    nodes = m.node_tree.nodes
    links = m.node_tree.links
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    bsdf = nodes.get("Principled BSDF")
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if alpha:
        links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
        m.blend_method = "BLEND"
    return m


# ── hero builders (local origin = envelope center) ───────────────────────

def build_bench_sofa(M, out):
    W, D, H = 3.55, 0.9, 0.82
    for sx in (-1, 1):
        for sy in (-1, 1):
            box("leg", (0.10, 0.10, 0.25), (sx * (W / 2 - 0.12), sy * (D / 2 - 0.12), -H / 2 + 0.125), M["wood_dark"])
    box("seat-plank", (W - 0.2, D - 0.1, 0.12), (0, 0, -0.10), M["wood"])
    for sx in (-1, 1):
        box("arm", (0.12, D, 0.34), (sx * (W / 2 - 0.06), 0, 0.13), M["wood"])
    box("backrest", (W - 0.2, 0.10, 0.45), (0, D / 2 - 0.08, 0.185), M["wood"], rot=(0.12, 0, 0))
    cush = [M["green"], M["red"], M["pink"]]
    for i, cm in enumerate(cush):
        box(f"cushion-{i}", (1.02, D - 0.22, 0.30), (-1.1 + i * 1.1, -0.02, 0.11), cm, bevel=0.08)


def build_carved_cabinet(M, out):
    W, D, H = 4.05, 0.44, 1.55
    box("plinth", (W, D, 0.12), (0, 0, -H / 2 + 0.06), M["wood_dark"])
    box("carcass", (W - 0.06, D - 0.02, H - 0.30), (0, 0, 0.03), M["wood"])
    box("cornice", (W + 0.06, D + 0.06, 0.10), (0, 0, H / 2 - 0.05), M["wood_dark"])
    for sx in (-1, 1):
        box("pilaster", (0.14, 0.03, H - 0.42), (sx * (W / 2 - 0.12), D / 2, 0.0), M["wood_dark"])
    for i, cx in enumerate((-1.0, 1.0)):
        box(f"door-{i}", (1.75, 0.04, H - 0.55), (cx, D / 2 - 0.01, -0.02), M["wood_worn"], bevel=0.01)
        box(f"panel-{i}", (1.35, 0.025, H - 0.95), (cx, D / 2 + 0.005, -0.02), M["wood_dark"], bevel=0.008)
        # diamond applique
        box(f"diamond-{i}", (0.16, 0.03, 0.16), (cx, D / 2 + 0.01, 0.25), M["wood_worn"], rot=(0, 0, math.pi / 4))
        ball(f"knob-{i}", 0.035, (cx + 0.65, D / 2 + 0.05, -0.02), M["metal_light"])


def build_wood_stove(M, out):
    W, D, H = 0.95, 0.82, 1.16
    for sx in (-1, 1):
        for sy in (-1, 1):
            box("leg", (0.09, 0.09, 0.20), (sx * (W / 2 - 0.10), sy * (D / 2 - 0.10), -H / 2 + 0.10), M["soot"])
    box("body", (W, D, H - 0.32), (0, 0, -H / 2 + 0.20 + (H - 0.32) / 2), M["metal"])
    box("top-plate", (W + 0.04, D + 0.04, 0.06), (0, 0, H / 2 - 0.03), M["soot"])
    box("top-rim", (W - 0.15, D - 0.15, 0.03), (0, 0, H / 2 + 0.005), M["metal"])
    # front fire door on -y face
    box("door-frame", (0.55, 0.05, 0.62), (0, -D / 2 - 0.005, -0.10), M["soot"])
    box("door", (0.45, 0.03, 0.52), (0, -D / 2 - 0.01, -0.10), M["metal"])
    cyl("mica", 0.13, 0.13, 0.02, (0, -D / 2 - 0.02, -0.05), M["fire"], rot=(math.pi / 2, 0, 0))
    box("handle", (0.16, 0.04, 0.04), (0.12, -D / 2 - 0.04, -0.28), M["metal_light"])
    box("ash-lip", (0.60, 0.10, 0.04), (0, -D / 2 - 0.03, -H / 2 + 0.26), M["soot"])
    # side panel seams
    for sx in (-1, 1):
        box("seam", (0.02, D - 0.1, H - 0.45), (sx * (W / 2 + 0.001), 0, 0.05), M["soot"], bevel=0.0)


def build_kettle(M, out):
    cyl("belly", 0.19, 0.19, 0.26, (0, 0, -0.06), M["soot"])
    cyl("shoulder", 0.13, 0.19, 0.10, (0, 0, 0.12), M["soot"])
    cyl("lid", 0.135, 0.135, 0.03, (0, 0, 0.175), M["metal"])
    ball("knob", 0.03, (0, 0, 0.21), M["wood_dark"])
    # spout on +x
    sp = cyl("spout", 0.045, 0.06, 0.30, (0.22, 0, 0.02), M["soot"], rot=(0, -0.7, 0))
    cyl("spout-tip", 0.03, 0.045, 0.08, (0.315, 0, 0.10), M["soot"], rot=(0, -0.7, 0))
    # handle: half torus above
    torus("handle", 0.13, 0.022, (0, 0, 0.16), M["metal_light"], rot=(0, math.pi / 2, 0))


def build_old_tv(M, out):
    W, D, H = 1.15, 0.72, 1.42
    for sx in (-1, 1):
        for sy in (-1, 1):
            box("leg", (0.08, 0.08, 0.30), (sx * (W / 2 - 0.10), sy * (D / 2 - 0.10), -H / 2 + 0.15), M["wood_dark"])
    box("cabinet", (W, D, H - 0.42), (0, 0, -H / 2 + 0.30 + (H - 0.42) / 2), M["wood"])
    box("bezel", (W - 0.16, 0.04, 0.62), (0, D / 2 - 0.02, 0.18), M["soot"])
    box("screen", (W - 0.34, 0.02, 0.48), (0, D / 2 - 0.015, 0.18), M["glass_dark"], bevel=0.01)
    for i in range(5):
        box(f"grille-{i}", (W - 0.30, 0.015, 0.03), (0, D / 2 - 0.005, -0.28 + i * 0.07), M["soot"], bevel=0.0)
    for sx in (-1, 1):
        ball(f"knob-{sx}", 0.035, (sx * 0.18, D / 2 + 0.01, -0.05), M["metal_light"])
    # rabbit-ear antenna
    for sx in (-1, 1):
        cyl(f"ear-{sx}", 0.012, 0.012, 0.55, (sx * 0.14, 0, H / 2 + 0.22), M["metal_light"], rot=(0, sx * 0.5, 0))


def build_woven_basket(M, out, img_dir):
    img = new_image("basket-weave", 256, 256, basket_px, img_dir)
    weave = textile_mat("basket-weave", img, rough=0.9)
    cyl("wall", 0.30, 0.36, 0.60, (0, 0, 0.0), weave, verts=28)
    cyl("inner-dark", 0.28, 0.28, 0.02, (0, 0, 0.20), M["soot"], verts=24)
    torus("rim", 0.355, 0.035, (0, 0, 0.30), M["wood_dark"], rot=(0, 0, 0))
    for i, z in enumerate((-0.12, 0.02, 0.16)):
        r = 0.315 + (z + 0.12) * 0.15
        torus(f"ridge-{i}", r, 0.018, (0, 0, z), M["wood_dark"])
    box("base", (0.55, 0.55, 0.05), (0, 0, -0.315), M["wood_dark"])


def build_main_rug(M, out, img_dir):
    img = new_image("kilim", 512, 256, kilim_px, img_dir)
    km = textile_mat("kilim", img, rough=0.98)
    box("rug", (4.4, 1.65, 0.035), (0, 0, 0), km, bevel=0.005)
    # fringe on both short ends
    for ex in (-1, 1):
        for i in range(22):
            box(f"fringe-{ex}-{i}", (0.09, 0.045, 0.012),
                (ex * (2.2 + 0.045), -0.78 + i * 0.074, 0), M["cream"], bevel=0.0)


def build_round_rug(M, out, img_dir):
    img = new_image("round-rug", 512, 512, round_rug_px, img_dir)
    rm = textile_mat("round-rug", img, rough=0.98)
    cyl("rug", 1.025, 1.025, 0.035, (0, 0, 0), rm, verts=48)
    torus("braid", 1.0, 0.03, (0, 0, 0.0), M["red"])


def build_wooden_bed(M, out, img_dir):
    W, D, H = 1.65, 2.05, 0.92
    tick = textile_mat("ticking", new_image("ticking", 256, 256, ticking_px, img_dir))
    for sx in (-1, 1):
        for sy in (-1, 1):
            top = H / 2 if sy > 0 else 0.30
            box("post", (0.12, 0.12, top + H / 2), (sx * (W / 2 - 0.06), sy * (D / 2 - 0.06), (top - H / 2) / 2), M["wood"])
            ball("finial", 0.07, (sx * (W / 2 - 0.06), sy * (D / 2 - 0.06), top + 0.03), M["wood_dark"])
    box("headboard", (W - 0.2, 0.07, 0.55), (0, D / 2 - 0.06, 0.10), M["wood"])
    box("footboard", (W - 0.2, 0.07, 0.35), (0, -D / 2 + 0.06, -0.10), M["wood"])
    for sx in (-1, 1):
        box("rail", (0.07, D - 0.2, 0.22), (sx * (W / 2 - 0.10), 0, -0.20), M["wood"])
    for i in range(6):
        box(f"slat-{i}", (W - 0.3, 0.12, 0.04), (0, -D / 2 + 0.25 + i * 0.31, -0.05), M["wood_worn"], bevel=0.0)
    box("mattress", (W - 0.25, D - 0.25, 0.22), (0, 0, 0.10), tick, bevel=0.06)


def build_bedside_table(M, out):
    W, D, H = 0.58, 0.52, 0.84
    box("top", (W, D, 0.05), (0, 0, H / 2 - 0.025), M["wood"])
    for sx in (-1, 1):
        for sy in (-1, 1):
            box("leg", (0.06, 0.06, H - 0.05), (sx * (W / 2 - 0.05), sy * (D / 2 - 0.05), -0.025), M["wood_dark"])
    box("shelf", (W - 0.12, D - 0.12, 0.04), (0, 0, -H / 2 + 0.22), M["wood"])
    box("drawer", (W - 0.14, 0.03, 0.16), (0, D / 2 - 0.02, H / 2 - 0.20), M["wood_worn"])
    ball("knob", 0.025, (0, D / 2 + 0.01, H / 2 - 0.20), M["metal_light"])
    # small oil lamp on top (lived-in)
    cyl("lamp-base", 0.06, 0.08, 0.05, (0.12, 0.05, H / 2 + 0.025), M["metal_light"])
    cyl("lamp-glass", 0.045, 0.06, 0.12, (0.12, 0.05, H / 2 + 0.11), M["glass_dark"])


def build_curtain_floral(M, out, img_dir):
    img = new_image("floral", 512, 512, floral_px, img_dir)
    fm = textile_mat("floral", img)
    # local x = height span, local y = width span; rotY90 maps x->world z, y->world y
    p = plane("panel", 2.25, 0.95, (0, 0, 0), fm, cut_w=4, cut_h=16, rot=(0, math.pi / 2, 0))
    mesh = p.data
    for v in mesh.vertices:
        v.co.z += math.sin(v.co.y * 22.0) * 0.045
    mesh.update()
    # rod + rings + finials (world-y aligned after the same rotY convention)
    cyl("rod", 0.025, 0.025, 1.35, (0.03, 0, 1.08), M["wood_dark"], rot=(math.pi / 2, 0, 0))
    for i, y in enumerate((-0.5, -0.25, 0.0, 0.25, 0.5)):
        torus(f"ring-{i}", 0.045, 0.012, (0, y, 1.03), M["metal_light"], rot=(math.pi / 2, 0, 0))
    for sy in (-1, 1):
        ball(f"finial-{sy}", 0.045, (0.03, sy * 0.70, 1.08), M["wood_dark"])


def build_curtain_lace(M, out, img_dir):
    img = new_image("lace", 512, 512, lace_px, img_dir)
    lm = textile_mat("lace", img, alpha=True)
    p = plane("sheer", 2.10, 1.80, (0, 0, 0), lm, cut_w=4, cut_h=20, rot=(0, math.pi / 2, 0))
    mesh = p.data
    for v in mesh.vertices:
        v.co.z += math.sin(v.co.y * 14.0) * 0.03
    mesh.update()
    cyl("hem-rod", 0.015, 0.015, 1.85, (0, 0, 1.06), M["cream"], rot=(math.pi / 2, 0, 0))


def build_pillow_quilt_set(M, out, img_dir):
    img = new_image("patchwork", 512, 384, patchwork_px, img_dir)
    pm = textile_mat("patchwork", img)
    box("quilt", (2.35, 0.76, 0.14), (0, -0.10, 0.0), pm, bevel=0.05)
    cols = [textile_mat("pillow-green", new_image("pillow-green", 128, 128, floral_px, img_dir)),
            M["red"], M["pink"]]
    for i, (x, cm) in enumerate(((-0.75, cols[0]), (0.0, cols[1]), (0.75, cols[2]))):
        box(f"pillow-{i}", (0.62, 0.20, 0.45), (x, 0.28, 0.14), cm, bevel=0.08, rot=(-0.35, 0, 0.06 * (i - 1)))


def build_bed_quilt(M, out, img_dir):
    img = new_image("bedquilt", 512, 512, patchwork_px, img_dir)
    qm = textile_mat("bedquilt", img)
    box("quilt", (1.52, 1.90, 0.18), (0, -0.10, -0.02), qm, bevel=0.06)
    # folded top edge
    box("fold", (1.52, 0.30, 0.10), (0, 0.55, 0.06), M["cream"], bevel=0.04)
    for i, x in enumerate((-0.38, 0.38)):
        box(f"pillow-{i}", (0.62, 0.34, 0.18), (x, 0.62, 0.12), M["cream"] if i == 0 else M["pink"],
            bevel=0.07, rot=(-0.25, 0, 0))


BUILDERS = {
    "bench-sofa": build_bench_sofa,
    "carved-cabinet": build_carved_cabinet,
    "wood-stove": build_wood_stove,
    "kettle": build_kettle,
    "old-tv": build_old_tv,
    "woven-basket": build_woven_basket,
    "main-rug": build_main_rug,
    "round-rug": build_round_rug,
    "wooden-bed": build_wooden_bed,
    "bedside-table": build_bedside_table,
    "curtain-floral": build_curtain_floral,
    "curtain-lace": build_curtain_lace,
    "pillow-quilt-set": build_pillow_quilt_set,
    "bed-quilt": build_bed_quilt,
}

IMAGED_BUILDERS = {"woven-basket", "main-rug", "round-rug", "wooden-bed",
                   "curtain-floral", "curtain-lace", "pillow-quilt-set", "bed-quilt"}


def export_slot(root: Path, slot: str, builder):
    clear_all()
    M = std_mats()
    out_dir = root / SOURCE_ROOT / slot
    out_dir.mkdir(parents=True, exist_ok=True)
    if slot in IMAGED_BUILDERS:
        builder(M, out_dir, out_dir)
    else:
        builder(M, None)
    join_by_material()
    bpy.ops.object.select_all(action="SELECT")
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in meshes:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(out_dir / f"{slot}.glb"), export_format="GLB",
                              use_selection=True, export_yup=True, export_apply=True)
    tris = 0
    for o in meshes:
        try:
            tris += len(o.data.polygons)
        except Exception:
            pass
    print(f"[author] {slot}: {len(meshes)} meshes, ~{tris} faces -> {slot}.glb")


def main():
    args = parse_args()
    root = args.root.resolve()
    only = [s.strip() for s in args.only.split(",") if s.strip()] or list(BUILDERS)
    for slot in only:
        if slot not in BUILDERS:
            print(f"[author] unknown slot: {slot}")
            continue
        export_slot(root, slot, BUILDERS[slot])


main()
