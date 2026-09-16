"""Final reference micro-detail parity pass for Fly House v0.3.

This module intentionally contains only the last reference-specific details that were
already present in the browser fallback or became obvious during the final close read
of the approved illustration.  Keeping them in a small layer makes Blender/browser
parity explicit without destabilising the larger v0.3 scene builder.
"""
from __future__ import annotations

import math
import bpy
from mathutils import Vector


def _collection(name: str):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    return c


def _tag(obj, collision=False, landing=False, semantic=None):
    obj["fly_visible"] = True
    obj["collision"] = "solid" if collision else "none"
    if landing:
        obj["landing_surface"] = True
    if semantic:
        obj["fly_semantic"] = semantic


def _box(name, size, loc, material, col, *, rot=(0.0, 0.0, 0.0), bevel=0.0, collision=False, landing=False, semantic=None):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if material:
        obj.data.materials.append(material)
    if bevel:
        mod = obj.modifiers.new("soft-edges", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    for old in tuple(obj.users_collection):
        old.objects.unlink(obj)
    col.objects.link(obj)
    _tag(obj, collision, landing, semantic)
    return obj


def _sphere(name, radius, loc, material, col, *, segments=14):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=max(8, segments // 2),
        radius=radius,
        location=loc,
    )
    obj = bpy.context.object
    obj.name = name
    if material:
        obj.data.materials.append(material)
    for old in tuple(obj.users_collection):
        old.objects.unlink(obj)
    col.objects.link(obj)
    _tag(obj)
    return obj


def _rod(name, a, b, radius, material, col):
    start = Vector(a)
    end = Vector(b)
    vec = end - start
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=10,
        radius=radius,
        depth=vec.length,
        location=(start + end) * 0.5,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(vec.normalized())
    if material:
        obj.data.materials.append(material)
    for old in tuple(obj.users_collection):
        old.objects.unlink(obj)
    col.objects.link(obj)
    _tag(obj)
    return obj


def _simple_material(name, color, roughness=.9):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def apply_micro_detail_pass(mats):
    c = _collection("REFERENCE_MICRO_DETAIL_V3")

    cloth_white = _simple_material("micro-cloth-white-v3", (.84, .81, .72), .98)
    pale_blue = _simple_material("micro-pale-blue-v3", (.25, .46, .58), .86)
    orange = _simple_material("micro-orange-v3", (.70, .30, .06), .86)
    yellow = _simple_material("micro-yellow-v3", (.73, .54, .14), .88)
    carpet_field = _simple_material("micro-carpet-field-v3", (.54, .52, .40), .99)
    carpet_olive = _simple_material("micro-carpet-olive-v3", (.30, .32, .18), .99)

    # Browser/Blender parity: sticker-covered blue bag and its double handles.
    sticker_mats = (orange, yellow, cloth_white, pale_blue, mats["red"])
    stickers = (
        (.40, .00, .36, .11, .09, -.33),
        (.57, -.005, .30, .14, .09, -.11),
        (.69, .00, .42, .11, .09, .11),
        (.48, -.008, .50, .14, .09, .33),
    )
    for i, (x, y, z, w, h, rz) in enumerate(stickers):
        _box(f"blue-bag-sticker-{i}", (w, .018, h), (x, y, z), sticker_mats[i % len(sticker_mats)], c, rot=(0, 0, rz), bevel=.006)
    for name, a, b in (
        ("blue-bag-handle-a1", (.34,.20,.52), (.39,.20,.78)),
        ("blue-bag-handle-a2", (.39,.20,.78), (.53,.20,.56)),
        ("blue-bag-handle-b1", (.58,.20,.55), (.66,.20,.80)),
        ("blue-bag-handle-b2", (.66,.20,.80), (.77,.20,.55)),
    ):
        _rod(name, a, b, .025, mats["blue"], c)

    # Flower/magnet marks on the exposed cabinet end panel.
    magnet_positions = (
        (1.36,2.505,1.08), (1.52,2.505,1.24), (1.42,2.505,1.42),
        (1.61,2.505,1.56), (1.31,2.505,1.63),
    )
    magnet_mats = (mats["flower"], yellow, cloth_white, pale_blue)
    for i, pos in enumerate(magnet_positions):
        _sphere(f"cabinet-magnet-{i}", .045 + (i % 2) * .012, pos, magnet_mats[i % len(magnet_mats)], c, segments=10)

    # Pale slippers tucked beside the stove/doorway in the reference.
    _box("pale-slipper-a", (.36,.14,.075), (2.97,1.55,.09), cloth_white, c, rot=(0,0,-.30), bevel=.035)
    _box("pale-slipper-b", (.36,.14,.075), (3.22,1.40,.09), cloth_white, c, rot=(0,0,-.12), bevel=.035)

    # Runner fringe.  The main authored rug has its own fringe, but these foreground
    # strands preserve the visible loose edge in the reference-wide composition.
    for i in range(12):
        x = -1.05 + i * .20
        _rod(
            f"runner-fringe-v3-{i}",
            (x,-2.29,.06),
            (x + (.025 if i % 2 else -.025),-2.43,.045),
            .008,
            cloth_white,
            c,
        )

    # The large under-rug is not a flat green rectangle in the illustration.  Keep
    # the existing muted green outer field as a border, then add the worn cream/olive
    # interior and sparse motifs visible beneath the furniture and smaller rugs.
    _box("reference-carpet-inner-field", (5.95,3.82,.012), (-.55,-.05,.049), carpet_field, c, landing=True)
    for x in (-3.35, 2.25):
        _box(f"reference-carpet-inner-border-x-{x}", (.09,3.64,.010), (x,-.05,.057), carpet_olive, c)
    for y in (-1.82, 1.72):
        _box(f"reference-carpet-inner-border-y-{y}", (5.68,.09,.010), (-.55,y,.057), carpet_olive, c)
    for i in range(20):
        x = -3.02 + (i % 5) * 1.23
        y = -1.45 + (i // 5) * .94
        _box(
            f"reference-carpet-small-motif-{i}",
            (.12,.06,.009),
            (x,y,.064),
            carpet_olive if i % 2 else mats["wood3"],
            c,
            rot=(0,0,(i % 4) * math.pi/4),
        )

    # The seating in the illustration reads as an L-shaped divan/chaise rather than
    # a single straight bench.  Add the projecting seat and its patchwork drape.
    _box("divan-chaise-base", (1.28,1.48,.34), (.62,1.48,.31), mats["wood2"], c, bevel=.035, collision=True, landing=True)
    _box("divan-chaise-cushion", (1.18,1.34,.22), (.62,1.42,.58), mats["green"], c, bevel=.08, collision=True, landing=True)
    patch_mats = (mats["green"], mats["red"], mats["pink"], mats["cream"], mats["wood3"])
    for row in range(3):
        for col in range(4):
            _box(
                f"chaise-patch-{row}-{col}",
                (.27,.37,.035),
                (.20 + col*.28, .98 + row*.39, .72 + (row+col)%2*.012),
                patch_mats[(row*4+col) % len(patch_mats)],
                c,
                rot=(0,0,((row+col)%3-1)*.025),
                bevel=.015,
            )

    # A few hanging/loose threads at the chaise edge help the blanket read as fabric
    # rather than coloured blocks from a fly-height view.
    for i in range(7):
        x = .22 + i * .14
        _rod(f"chaise-blanket-thread-{i}", (x,.80,.72), (x+(.02 if i%2 else -.02),.73,.58), .006, cloth_white, c)

    return c
