"""Reference-driven detail pass for Fly House v0.3.

This module adds the dense, lived-in secondary dressing visible in the approved
people-free cottage reference.  It intentionally avoids changing the room shell;
the production builder owns scale/topology while this pass owns small/medium props,
visual anchors, wear, and the continuation of the bedroom beyond the doorway.
"""
from __future__ import annotations

import math
import bpy
from mathutils import Vector
from pathlib import Path
import importlib.util

_MICRO_PATH = Path(__file__).resolve().with_name("micro_detail_pass_v3.py")
_micro_spec = importlib.util.spec_from_file_location("fly_house_v3_micro_detail", _MICRO_PATH)
_micro = importlib.util.module_from_spec(_micro_spec)
assert _micro_spec.loader is not None
_micro_spec.loader.exec_module(_micro)


def _collection(name: str):
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
    o = bpy.context.object
    o.name = name
    o.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if material:
        o.data.materials.append(material)
    if bevel:
        mod = o.modifiers.new("soft-edges", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    for old in tuple(o.users_collection):
        old.objects.unlink(o)
    col.objects.link(o)
    _tag(o, collision, landing, semantic)
    return o


def _cyl(name, radius, depth, loc, material, col, *, rot=(0.0, 0.0, 0.0), vertices=24, collision=False, landing=False, semantic=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    if material:
        o.data.materials.append(material)
    for old in tuple(o.users_collection):
        old.objects.unlink(o)
    col.objects.link(o)
    _tag(o, collision, landing, semantic)
    return o


def _sphere(name, radius, loc, material, col, *, segments=18):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=max(8, segments // 2), radius=radius, location=loc)
    o = bpy.context.object
    o.name = name
    if material:
        o.data.materials.append(material)
    for old in tuple(o.users_collection):
        old.objects.unlink(o)
    col.objects.link(o)
    _tag(o)
    # Materialize generated sphere topology before export; Blender otherwise
    # re-triangulates these meshes nondeterministically between fresh runs.
    o.data.validate(verbose=False)
    o.data.update(calc_edges=True)
    o.data.calc_loop_triangles()
    return o
def _torus(name, major_radius, minor_radius, loc, material, col, *, rot=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=28,
        minor_segments=10,
        location=loc,
        rotation=rot,
    )
    o = bpy.context.object
    o.name = name
    if material:
        o.data.materials.append(material)
    for old in tuple(o.users_collection):
        old.objects.unlink(o)
    col.objects.link(o)
    _tag(o)
    return o


def _rod(name, a, b, radius, material, col):
    a_v = Vector(a)
    b_v = Vector(b)
    vec = b_v - a_v
    length = vec.length
    midpoint = (a_v + b_v) * 0.5
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=radius, depth=length, location=midpoint)
    o = bpy.context.object
    o.name = name
    # primitive cylinder is aligned to Z; rotate Z to the requested segment.
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(vec.normalized())
    if material:
        o.data.materials.append(material)
    for old in tuple(o.users_collection):
        old.objects.unlink(o)
    col.objects.link(o)
    _tag(o)
    return o


def _simple_material(name, color, roughness=.85, metallic=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return m


def _add_surface_variation(material, *, scale=4.0, strength=.15, bump=.18):
    """Add deterministic Blender procedural variation without replacing art textures."""
    if not material or not material.use_nodes:
        return
    nt = material.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if not bsdf:
        return
    # Idempotent: do not add a second pass when the builder is rerun in an existing file.
    marker = nt.nodes.get("FW_DETAIL_NOISE")
    if marker:
        return
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.name = "FW_DETAIL_NOISE"
    noise.label = "Fly World surface variation"
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 3.0
    noise.inputs["Roughness"].default_value = .65
    # Keep the authored palette visible: noise is used for roughness and relief,
    # not a high-contrast color ramp that washes the cottage to grey.
    bump_node = nt.nodes.new("ShaderNodeBump")
    bump_node.inputs["Strength"].default_value = bump
    bump_node.inputs["Distance"].default_value = .045
    nt.links.new(noise.outputs["Fac"], bump_node.inputs["Height"])
    nt.links.new(bump_node.outputs["Normal"], bsdf.inputs["Normal"])
    rough = nt.nodes.new("ShaderNodeMapRange")
    rough.inputs["From Min"].default_value = 0.15
    rough.inputs["From Max"].default_value = 0.85
    rough.inputs["To Min"].default_value = .72
    rough.inputs["To Max"].default_value = .98
    nt.links.new(noise.outputs["Fac"], rough.inputs["Value"])
    nt.links.new(rough.outputs["Result"], bsdf.inputs["Roughness"])
    # Add restrained mottling around the authored hue so plaster and wood do not
    # render as featureless blocks while retaining their warm palette.
    original = tuple(bsdf.inputs["Base Color"].default_value[:3])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*tuple(v * .72 for v in original), 1)
    ramp.color_ramp.elements[1].color = (*tuple(min(v * 1.18, 1.0) for v in original), 1)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    mix = nt.nodes.new("ShaderNodeMixRGB")
    mix.blend_type = "MIX"
    mix.inputs["Fac"].default_value = min(strength, .16)
    mix.inputs[1].default_value = (*original, 1)
    nt.links.new(ramp.outputs["Color"], mix.inputs[2])
    nt.links.new(mix.outputs["Color"], bsdf.inputs["Base Color"])
    return


def apply_reference_detail_pass(mats):
    c = _collection("REFERENCE_DETAIL_V3")

    # Correct two v0.2 interpretation errors before adding the reference pass.
    # The approved illustration has no gallery row above the divan and its cage sits
    # low beside the window rather than hanging at head height.
    for obj in list(bpy.context.scene.objects):
        name = obj.name
        if name.startswith("frame-") or name.startswith("picture-") or name.startswith("cage-wire-") or name in {"cage-base", "cage-top"}:
            bpy.data.objects.remove(obj, do_unlink=True)

    # Give flat authored materials some age/texture in Blender.  Existing hero GLBs
    # keep their own materials; this improves shell and authored detail geometry.
    _add_surface_variation(mats.get("plaster"), scale=5.2, strength=.12, bump=.20)
    _add_surface_variation(mats.get("floor"), scale=7.0, strength=.10, bump=.10)
    _add_surface_variation(mats.get("wood"), scale=3.0, strength=.12, bump=.10)
    _add_surface_variation(mats.get("wood2"), scale=3.2, strength=.10, bump=.09)

    white = _simple_material("detail-white-cloth-v3", (.83, .80, .72), .98)
    mustard = _simple_material("detail-mustard-cloth-v3", (.48, .34, .12), .98)
    orange = _simple_material("detail-orange-v3", (.62, .22, .05), .82)
    yellow = _simple_material("detail-yellow-v3", (.66, .48, .12), .86)
    pale_blue = _simple_material("detail-pale-blue-v3", (.30, .48, .56), .82)
    black = _simple_material("detail-black-v3", (.025, .022, .02), .72, .18)
    plaster_wear = _simple_material("detail-plaster-wear-v3", (.46, .39, .31), 1.0)
    plaster_wear_dark = _simple_material("detail-plaster-wear-dark-v3", (.34, .29, .24), 1.0)

    # Lower bird cage beside the window, with the pale-blue water bottle visible in
    # the reference. Keep it decorative/non-colliding for observer navigation.
    cage_x, cage_y, cage_z = -3.46, 1.72, 1.15
    for i in range(12):
        a = i / 12 * math.tau
        _rod(
            f"cage-wire-v3-{i}",
            (cage_x + math.cos(a)*.24, cage_y + math.sin(a)*.24, cage_z-.38),
            (cage_x + math.cos(a)*.24, cage_y + math.sin(a)*.24, cage_z+.38),
            .008, mats["metal"], c,
        )
    _cyl("cage-base-v3", .28, .06, (cage_x,cage_y,cage_z-.38), mats["wood2"], c)
    _cyl("cage-top-v3", .28, .06, (cage_x,cage_y,cage_z+.38), mats["wood2"], c)
    _cyl("birdcage-water-bottle", .035, .30, (-3.40,1.67,1.12), pale_blue, c)

    # Ornate diagonal flourishes layered over the basic grille bars.
    grille_lines = (
        ((-4.04,-1.42,.96),(-4.04,-1.08,1.34)),
        ((-4.04,-1.08,1.34),(-4.04,-.76,.98)),
        ((-4.04,-.48,1.60),(-4.04,-.16,1.98)),
        ((-4.04,-.16,1.98),(-4.04,.10,1.62)),
    )
    for i, (a, b) in enumerate(grille_lines):
        _rod(f"window-grille-flourish-{i}", a, b, .018, mats["metal"], c)

    # One small portrait above the doorway replaces the invented wall-gallery row.
    _box("doorway-portrait-frame", (.035,.38,.46), (4.055,1.03,2.55), mats["wood2"], c, bevel=.012)
    _box("doorway-portrait", (.025,.29,.37), (4.035,1.03,2.55), plaster_wear_dark, c)
    # Image-like portrait: warm painted ground, dark hair silhouette, face and coat.
    portrait_sky = _simple_material("portrait-sky-v3", (.34,.46,.48), .95)
    portrait_face = _simple_material("portrait-face-v3", (.70,.45,.30), .92)
    portrait_hair = _simple_material("portrait-hair-v3", (.08,.035,.022), .9)
    portrait_coat = _simple_material("portrait-coat-v3", (.24,.12,.16), .95)
    _box("portrait-painted-ground", (.018,.22,.30), (4.015,1.03,2.55), portrait_sky, c)
    _sphere("portrait-head", .075, (3.995,1.03,2.62), portrait_face, c, segments=12)
    _sphere("portrait-hair", .09, (3.98,1.03,2.69), portrait_hair, c, segments=12)
    _box("portrait-shoulders", (.02,.20,.12), (3.99,1.03,2.43), portrait_coat, c, bevel=.018)
    # Large green carpet under the seating area.  Three nested thin rectangles
    # approximate the ornate border seen in the illustration without overbuilding.
    _box("reference-main-carpet", (7.80, 5.55, .026), (-.35, -.05, .02), mats["green"], c, landing=True)
    # Distinct patterned runner and round multicolour rug sit above the broad green field.
    _box("reference-patterned-runner", (2.05, 4.05, .034), (.95, -.65, .052), mats["red"], c, landing=True)
    for i in range(10):
        _box(f"runner-pattern-{i}", (.16, .28, .012), (.95 + (i%2)*.34, -2.25 + (i//2)*.86, .078), mats["cream"] if i%2 else mats["wood3"], c, rot=(0,0,(i%3-1)*.15))
    _cyl("round-multicolour-rug-base", .92, .035, (-1.85,-1.85,.055), mats["blue"], c, vertices=32, landing=True)
    _cyl("round-multicolour-rug-ring", .66, .042, (-1.85,-1.85,.078), mats["red"], c, vertices=32)
    _cyl("round-multicolour-rug-centre", .38, .046, (-1.85,-1.85,.101), mats["wood3"], c, vertices=32)
    for i in range(8):
        a=i/8*math.tau
        _box(f"round-rug-motif-{i}", (.10,.10,.012), (-1.85+math.cos(a)*.52,-1.85+math.sin(a)*.52,.125), (mats["green"],mats["pink"],mats["cream"],mats["wood2"])[i%4], c, rot=(0,0,a))
    for x in (-3.64, 2.54):
        _box(f"carpet-border-x-{x}", (.08, 5.38, .012), (x, -.05, .04), mats["wood3"], c)
    for y in (-2.72, 2.62):
        _box(f"carpet-border-y-{y}", (7.45, .08, .012), (-.35, y, .04), mats["wood3"], c)
    for i in range(18):
        x = -3.25 + (i % 6) * 1.10
        y = -1.72 + (i // 6) * 1.52
        _box(f"carpet-motif-{i}", (.16, .08, .012), (x, y, .047), mats["red"] if i % 2 else mats["wood2"], c, rot=(0, 0, (i % 3 - 1) * .35))

    # Heavy timber doorway surround into the bedroom.
    _box("door-frame-near", (.28, .30, 2.58), (4.05, .16, 1.29), mats["wood2"], c, collision=True, landing=True)
    _box("door-frame-far", (.28, .30, 2.58), (4.05, 1.84, 1.29), mats["wood2"], c, collision=True, landing=True)
    _box("door-frame-header", (.28, 1.98, .28), (4.05, 1.00, 2.48), mats["wood2"], c, collision=True, landing=True)
    _box("door-threshold", (.08, 1.68, .10), (3.91, 1.00, .05), mats["wood3"], c, collision=True, landing=True)

    # Wall clock between the curtain and the long cabinet.
    _cyl("wall-clock-frame", .26, .055, (-3.72, 1.18, 2.22), mats["wood2"], c, rot=(0, math.radians(90), 0))
    _cyl("wall-clock-face", .215, .065, (-3.69, 1.18, 2.22), mats["ceramic"], c, rot=(0, math.radians(90), 0))
    _rod("clock-hand-minute", (-3.65, 1.18, 2.22), (-3.63, 1.18, 2.34), .009, black, c)
    _rod("clock-hand-hour", (-3.65, 1.18, 2.22), (-3.65, 1.27, 2.18), .011, black, c)

    # Cabinet-top still life.  Add an explicit shallow shelf: the imported hero's
    # baked top ends at about z=2.315, so this support closes the small origin/mesh
    # gap instead of leaving the books and bowl apparently floating in the browser.
    _box("cabinet-top-support-shelf", (3.82, .46, .08), (-.65, 2.70, 2.34), mats["wood2"], c, bevel=.018, collision=True, landing=True, semantic="cabinet-top")
    _box("cabinet-top-book-red", (.52, .30, .06), (-2.10, 2.49, 2.42), mats["red"], c, rot=(0,0,-.09), bevel=.015)
    _box("cabinet-top-book-cream", (.46, .28, .045), (-2.05, 2.47, 2.49), mats["cream"], c, rot=(0,0,-.04), bevel=.012)
    _box("cabinet-top-lace-runner", (1.20, .44, .018), (-.92, 2.48, 2.39), white, c, rot=(0,0,.04))
    _cyl("fruit-bowl", .20, .08, (-.75, 2.47, 2.48), mats["wood3"], c)
    for i in range(9):
        a = i / 9 * math.tau
        _sphere(f"fruit-{i}", .075 + (i % 3) * .01, (-.75 + math.cos(a)*.17, 2.47 + math.sin(a)*.11, 2.56 + (i%2)*.03), orange if i%2 else yellow, c)
    _box("cabinet-photo-frame", (.31, .07, .39), (.42, 2.47, 2.52), mats["wood2"], c, rot=(0,0,-.03), bevel=.012)
    _box("cabinet-photo", (.24, .055, .31), (.42, 2.43, 2.52), plaster_wear_dark, c)
    _sphere("blue-ornamental-globe", .135, (-.05, 2.46, 2.45), pale_blue, c)
    _rod("globe-stand", (-.05, 2.46, 2.30), (-.05, 2.46, 2.42), .018, mats["metal2"], c)

    # Carved panel overlays to strengthen the wall-unit identity.
    for i, x in enumerate((-2.18, -1.20, -.22, .76, 1.62)):
        _box(f"carved-panel-bg-{i}", (.66, .025, .72), (x, 2.555, 1.48), mats["wood2"], c, bevel=.012)
        _box(f"carved-panel-inner-{i}", (.52, .018, .58), (x, 2.535, 1.48), mats["wood3"], c, bevel=.01)
        _torus(f"carved-rosette-{i}", .16, .025, (x, 2.515, 1.48), mats["wood2"], c, rot=(math.radians(90), 0, 0))

    # CRT/radiogram cabinet: louvers + lower open shelf + cups + doily/figurine.
    for i in range(6):
        _box(f"tv-louver-{i}", (.58, .035, .055), (-3.36, -2.425, 1.17 + i*.06), mats["wood2"], c)
    _box("tv-lower-cabinet", (.88, .50, .58), (-3.36, -2.04, .23), mats["wood2"], c, collision=True)
    _box("tv-lower-open-shelf", (.72, .05, .33), (-3.36, -2.34, .28), black, c)
    for i in range(4):
        _cyl(f"shelf-cup-{i}", .07 + (i%2)*.01, .15, (-3.61 + i*.17, -2.37, .26), mats["ceramic"], c)
        _torus(f"shelf-cup-handle-{i}", .07, .015, (-3.54 + i*.17, -2.39, .28), mats["ceramic"], c, rot=(math.radians(90), 0, 0))
    _box("tv-top-doily", (.80, .42, .018), (-3.36, -2.03, 1.43), white, c, rot=(0,0,-.04))
    _box("tv-top-blue-figurine", (.26, .12, .16), (-3.54, -2.06, 1.53), pale_blue, c, rot=(0,0,.15), bevel=.035)
    _sphere("tv-top-figurine-head", .07, (-3.66, -2.06, 1.61), pale_blue, c)

    # Stove hearth and tools.
    _box("stove-hearth", (1.58, 1.32, .10), (2.05, .75, .05), mats["ceramic"], c, collision=True, landing=True)
    _box("stove-ash-pan", (.50, .16, .18), (2.05, .26, .27), mats["metal"], c)
    _rod("stove-poker", (2.68,.24,.13), (2.78,.24,1.22), .018, mats["metal"], c)
    _rod("stove-tongs-a", (2.81,.28,.15), (2.64,.28,1.16), .015, mats["metal2"], c)
    _rod("stove-tongs-b", (2.88,.28,.15), (2.71,.28,1.16), .015, mats["metal2"], c)

    # Laundry/cloth rail next to the flue.
    _rod("stove-laundry-rod", (2.45,.52,1.80), (3.55,.52,1.80), .018, mats["metal"], c)
    _box("hanging-cloth-white-a", (.36,.04,.58), (2.63,.50,1.52), white, c, rot=(0,0,.03), bevel=.02)
    _box("hanging-cloth-mustard", (.30,.04,.48), (3.08,.50,1.56), mustard, c, rot=(0,0,-.04), bevel=.02)
    _box("hanging-cloth-white-b", (.40,.04,.64), (3.44,.50,1.48), white, c, rot=(0,0,.02), bevel=.02)

    # Hanging cabinet ornament removed in v0.3.1 — the previous dangling
    # cylinder intersected the ceiling in wide shots and read as a mug-like
    # object floating against the plaster.  The reference illustration has
    # no such ornament; the cabinet crown is enough decoration.

    # Intentional floor clutter copied from the reference vocabulary.
    _box("floor-notebook", (.42,.32,.035), (-1.90,-1.43,.075), mats["ceramic"], c, rot=(0,0,-.28), bevel=.008)
    _box("yellow-toy-whistle", (.27,.05,.05), (-.18,-1.12,.085), yellow, c, rot=(0,0,-.55), bevel=.012)
    _cyl("yellow-toy-bell", .055, .18, (-.04,-1.18,.10), yellow, c, rot=(0,math.radians(90),0))
    _box("toy-car-body", (.22,.11,.08), (-1.22,-1.52,.09), mats["wood3"], c, rot=(0,0,.25), bevel=.018)
    for dx in (-.08,.08):
        for dy in (-.045,.045):
            _sphere(f"toy-car-wheel-{dx}-{dy}", .035, (-1.22+dx,-1.52+dy,.07), black, c, segments=10)
    _sphere("loose-yarn-ball", .15, (-1.02,-1.82,.16), pale_blue, c, segments=14)
    marble_mats = (pale_blue, orange, yellow, mats["red"])
    for i in range(8):
        _sphere(f"floor-marble-{i}", .025+(i%3)*.008, (.18+i*.11,-1.72+(i%2)*.10,.06), marble_mats[i%4], c, segments=10)
    _box("orange-slipper-a", (.39,.15,.08), (1.45,-2.19,.095), orange, c, rot=(0,0,.35), bevel=.035)
    _box("orange-slipper-b", (.39,.15,.08), (1.78,-2.04,.095), orange, c, rot=(0,0,.16), bevel=.035)

    # Right side of doorway: switch, tulips, knitting bag/needles and orange ball.
    _box("wall-light-switch", (.14, .035, .18), (4.72, 2.36, 1.20), mats["ceramic"], c, bevel=.01)
    _box("right-wall-vase", (.16, .18, .48), (4.72, 2.86, 1.62), mats["ceramic"], c, bevel=.025)
    for i in range(4):
        _rod(f"tulip-stem-{i}", (4.72, 2.83, 1.80), (4.78 + i * .06, 2.82, 2.16 + (i % 2) * .08), .012, mats["leaf"], c)
        _sphere(f"tulip-{i}", .065, (4.78 + i * .06, 2.82, 2.18 + (i % 2) * .08), mats["flower"], c, segments=12)
    _box("green-knitting-bag", (.54,.24,.48), (3.45,-2.72,.25), mats["green"], c, rot=(0,0,.05), bevel=.06)
    _rod("knitting-needle-a", (3.36,-2.72,.45), (3.30,-2.72,1.02), .012, mats["wood3"], c)
    _rod("knitting-needle-b", (3.52,-2.72,.45), (3.60,-2.72,1.00), .012, mats["wood3"], c)
    _sphere("orange-floor-ball", .27, (2.78,-2.82,.28), orange, c, segments=18)

    # Rough plaster scars/patches.
    patches = (
        (-3.98,1.86,1.46,.015,.36,.22),
        (-3.98,2.54,.94,.015,.25,.12),
        (2.90,3.125,2.26,.42,.015,.12),
        (1.85,3.125,1.05,.31,.015,.10),
        (-2.95,3.125,2.36,.28,.015,.11),
    )
    for i, (x,y,z,sx,sy,sz) in enumerate(patches):
        _box(f"plaster-wear-{i}", (sx,sy,sz), (x,y,z), plaster_wear if i%2 else plaster_wear_dark, c, rot=(0,0,(i-2)*.06))

    # Bedroom continuation: bedside smalls, wall art, plant, basket and folded bedding.
    _box("bedside-lace-doily", (.54,.42,.035), (8.25,1.55,.86), white, c)
    _cyl("bedside-mug", .08, .10, (8.11,1.55,.96), mats["ceramic"], c)
    _torus("bedside-mug-handle", .06, .014, (8.18,1.56,.98), mats["ceramic"], c, rot=(math.radians(90),0,0))
    _cyl("bedside-alarm-clock", .09, .06, (8.38,1.55,.96), pale_blue, c, rot=(math.radians(90),0,0))
    _cyl("bedside-lamp-base", .10, .04, (8.37,1.55,1.00), mats["wood2"], c)
    _rod("bedside-lamp-stem", (8.37,1.55,1.02), (8.37,1.55,1.28), .018, mats["metal2"], c)
    _sphere("bedside-lamp-shade", .14, (8.37,1.55,1.36), mustard, c, segments=12)

    _box("bedroom-wall-frame", (.55,.05,.70), (7.10,2.80,1.72), mats["wood2"], c, bevel=.014)
    _box("bedroom-wall-picture", (.46,.035,.61), (7.10,2.77,1.72), mats["ceramic"], c)
    _cyl("bedroom-plant-pot", .18, .30, (8.20,3.35,1.98), mats["ceramic"], c)
    for i in range(6):
        _rod(f"bedroom-plant-stem-{i}", (8.20,3.35,2.10), (7.96+i*.10,3.33,2.52-(i%2)*.08), .018, mats["leaf"], c)
    _box("bedroom-foot-basket", (.78,.50,.42), (7.48,.10,.22), mats["wood3"], c, collision=True, bevel=.035)
    _box("bedroom-folded-blanket", (.68,.42,.12), (7.48,.10,.48), mats["red"], c, bevel=.025)
    _box("bedroom-folded-blanket-top", (.60,.38,.10), (7.48,.10,.58), mats["green"], c, bevel=.025)
    _box("bedroom-high-shelf", (.80,.22,.06), (7.70,3.18,2.16), mats["wood2"], c)
    for i in range(5):
        _box(f"bedroom-high-book-{i}", (.09+(i%2)*.03,.16,.28), (7.45+i*.12,3.05,2.34), (mats["red"],mats["green"],mats["wood3"])[i%3], c)
    _sphere("bedroom-trailing-plant-root", .12, (7.98,3.06,2.33), mats["leaf"], c)
    for i in range(7):
        _sphere(f"bedroom-trailing-leaf-{i}", .055, (8.00-i*.035,3.03,2.20-i*.12), mats["leaf"], c, segments=10)

    # A compact writing desk establishes a quiet work zone in the enlarged bedroom;
    # its chair stays clear of the doorway and the bed-side circulation path.
    # 2026-09-16: shifted +0.475 x with the bedroom west wall (4.2 -> 4.8).
    _box("work-desk", (1.45, .52, .12), (5.525, 3.05, .76), mats["wood3"], c, bevel=.025, collision=True, landing=True, semantic="work-surface")
    for x in (4.895, 6.155):
        _box(f"work-desk-leg-{x}", (.10, .10, .72), (x, 3.05, .38), mats["wood2"], c, bevel=.015, collision=True)
    _box("work-desk-chair-seat", (.52, .48, .12), (5.525, 3.65, .48), mats["green"], c, bevel=.04, collision=True)
    _box("work-desk-chair-back", (.52, .10, .52), (5.525, 3.88, .76), mats["wood2"], c, bevel=.02, collision=True)
    _box("work-desk-lamp", (.18, .18, .06), (5.525, 3.02, .87), mats["ceramic"], c, bevel=.015)

    # The browser fallback's final micro-details are owned by this reference pass.
    _micro.apply_micro_detail_pass(mats)

    # Reposition dependent dressing with its parent furniture so the enlarged room reads
    # as three intentional zones rather than a shifted hero surrounded by stale props.
    def move_detail(prefixes, dx=0.0, dy=0.0):
        collections = (c, bpy.data.collections.get("REFERENCE_MICRO_DETAIL_V3"))
        for collection in collections:
            if collection is None:
                continue
            for obj in collection.objects:
                if obj.name.startswith(prefixes):
                    obj.location.x += dx
                    obj.location.y += dy

    move_detail(("carved-", "cabinet-", "divan-", "chaise-", "fruit-", "blue-ornamental-", "globe-"), dy=.38)
    move_detail(("stove-", "hanging-"), dx=.10, dy=-1.85)
    move_detail(("tv-", "shelf-cup-"), dx=.16, dy=-.975)
    # Shell-mounted details follow the expanded walls, not furniture offsets.
    move_detail(("door-frame-", "door-threshold", "doorway-portrait", "portrait-"), dx=.75)
    if bpy.data.objects.get("doorway-portrait-frame"):
        bpy.data.objects["doorway-portrait-frame"].location.x = 4.66
        bpy.data.objects["doorway-portrait"].location.x = 4.64
    for portrait_name in ("portrait-painted-ground", "portrait-head", "portrait-hair", "portrait-shoulders"):
        if bpy.data.objects.get(portrait_name):
            bpy.data.objects[portrait_name].location.x = 4.62
    move_detail(("window-grille-",), dx=-.68)
    move_detail(("wall-clock-", "clock-hand-"), dx=-.98)
    move_detail(("cage-", "birdcage-"), dx=-.59)
    # Still life is supported by the shelf, not suspended in front of it.
    move_detail(("cabinet-top-book-", "cabinet-top-lace-", "cabinet-photo", "fruit-", "blue-ornamental-", "globe-"), dy=.21)
    bpy.data.objects["fruit-bowl"].location.z = 2.42
    for obj in c.objects:
        if obj.name.startswith("fruit-") and obj.name != "fruit-bowl":
            obj.location.z -= .06
    bpy.data.objects["cabinet-top-book-red"].location.z = 2.41
    bpy.data.objects["cabinet-top-book-cream"].location.z = 2.4625
    bpy.data.objects["cabinet-photo-frame"].location.z = 2.575
    bpy.data.objects["cabinet-photo"].location.z = 2.575
    bpy.data.objects["blue-ornamental-globe"].location.z = 2.635
    bpy.data.objects["globe-stand"].location.z += .08
    # Ground the centre-origin cabinet and keep its supported still life attached.
    for obj in list(c.objects):
        if obj.name.startswith(("cabinet-top-", "cabinet-photo", "fruit-", "blue-ornamental-", "globe-")):
            obj.location.y += .44
            obj.location.z -= .765
    # Keep the carved overlays: their rosettes are a key identity cue, not disposable debug geometry.
    # Wall dressing must touch the expanded shell, not hover at pre-expansion planes.
    move_detail(("bedroom-high-", "bedroom-trailing-"), dy=0.0)
    move_detail(("bedroom-wall-",), dy=.20)
    move_detail(("bedroom-plant-",), dy=0.0)
    for obj in c.objects:
        if obj.name.startswith("bedroom-plant-"):
            obj.location.z -= .21
        if obj.name.startswith("plaster-wear-"):
            if obj.location.x < -3:
                obj.location.x = -4.72
            else:
                obj.location.y = 3.92
            obj.rotation_euler.z = 0
        if obj.name == "wall-light-switch":
            obj.location.x = 4.71
            obj.rotation_euler.z = math.pi / 2
        if obj.name.startswith(("right-wall-vase", "tulip-")):
            obj.location.x += .72
    for obj in list(bpy.data.objects):
        if obj.name.startswith(("cabinet-magnet-", "flower-stem-", "flower-", "plant-leaf-")) or obj.name in {"wall-vase", "plant-pot"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    return c
