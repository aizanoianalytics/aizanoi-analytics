"""Dungeon v1 kit builder — headless-safe Blender 4.0.2 script.
Builds 7 low-poly assets, one .glb each, into scratch/dungeon3d-kit/.
Constraints: cylinders 10-16 segs, NO primitive_sphere_add (stacked rings instead).
Usage: /usr/bin/blender --background --python build_dungeon_kit.py
"""
import bpy
import os
import math

OUT = "/root/.hermes/cache/scratch/dungeon3d-kit"
os.makedirs(OUT, exist_ok=True)
SEG = 12  # within 10-16

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    # purge orphan data
    for coll in (bpy.data.meshes, bpy.data.materials):
        for x in list(coll):
            if x.users == 0:
                coll.remove(x)

def mat(name, rgba):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = 0.8
    return m

def assign(obj, m):
    if obj.data.materials:
        obj.data.materials[0] = m
    else:
        obj.data.materials.append(m)

def finish(name):
    # select all for export, apply transforms implicitly via export_apply
    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]
    path = os.path.join(OUT, name + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True,
        export_apply=True, export_materials='EXPORT', export_yup=True)
    print(f"EXPORTED {path} bytes={os.path.getsize(path)}")
    return path

# ---- stacked-ring dome (sphere substitute) ----
def ring_dome(x, y, z_base, r, height, levels, material, name="dome"):
    """Stack shrinking cylinders to fake a hemisphere dome. No spheres."""
    objs = []
    for i in range(levels):
        t = i / levels  # 0..1 up
        rr = r * math.cos(t * math.pi / 2)  # shrink with height
        hh = height / levels
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=SEG, radius=max(rr, 0.001), depth=hh,
            location=(x, y, z_base + hh / 2 + i * hh))
        o = bpy.context.active_object
        o.name = f"{name}_ring{i}"
        assign(o, material)
        objs.append(o)
    return objs

# ---- asset builders (each assumes cleared scene) ----
def build_floor():
    m = mat("M_Floor", (0.35, 0.36, 0.42, 1.0))
    trim = mat("M_FloorTrim", (0.22, 0.23, 0.30, 1.0))
    bpy.ops.mesh.primitive_cube_add(size=2.0, location=(0, 0, -0.1))
    base = bpy.context.active_object; base.name = "floor_tile"
    base.scale = (1.0, 1.0, 0.1); bpy.ops.object.transform_apply(scale=True)
    assign(base, m)
    # inset border trim: 4 thin boxes
    for dx, dy, sx, sy in ((0, 0.85, 1.7, 0.08), (0, -0.85, 1.7, 0.08),
                           (0.85, 0, 0.08, 1.7), (-0.85, 0, 0.08, 1.7)):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(dx, dy, 0.005))
        t = bpy.context.active_object; t.name = "floor_trim"
        t.scale = (sx, sy, 0.02); bpy.ops.object.transform_apply(scale=True)
        assign(t, trim)

def build_wall():
    m = mat("M_Wall", (0.48, 0.44, 0.52, 1.0))
    dark = mat("M_WallDark", (0.30, 0.28, 0.34, 1.0))
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.75))
    w = bpy.context.active_object; w.name = "wall_block"
    w.scale = (2.0, 0.4, 1.5); bpy.ops.object.transform_apply(scale=True)
    assign(w, m)
    # brick grooves: 3 thin dark insets on front face
    for i, zz in enumerate((0.45, 0.85, 1.25)):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.19, zz))
        g = bpy.context.active_object; g.name = f"wall_groove{i}"
        g.scale = (1.9, 0.03, 0.04); bpy.ops.object.transform_apply(scale=True)
        assign(g, dark)

def build_column():
    stone = mat("M_Stone", (0.55, 0.53, 0.58, 1.0))
    dark = mat("M_StoneDark", (0.36, 0.35, 0.40, 1.0))
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.15))
    b = bpy.context.active_object; b.name = "column_base"
    b.scale = (0.9, 0.9, 0.3); bpy.ops.object.transform_apply(scale=True)
    assign(b, dark)
    bpy.ops.mesh.primitive_cylinder_add(vertices=SEG, radius=0.28, depth=2.2,
                                        location=(0, 0, 1.4))
    shaft = bpy.context.active_object; shaft.name = "column_shaft"
    assign(shaft, stone)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 2.65))
    cap = bpy.context.active_object; cap.name = "column_capital"
    cap.scale = (0.9, 0.9, 0.3); bpy.ops.object.transform_apply(scale=True)
    assign(cap, dark)

def build_hero():
    armor = mat("M_Armor", (0.70, 0.72, 0.80, 1.0))
    cloth = mat("M_Cloth", (0.15, 0.30, 0.65, 1.0))
    skin = mat("M_Skin", (0.90, 0.75, 0.60, 1.0))
    steel = mat("M_Steel", (0.85, 0.86, 0.90, 1.0))
    # legs (two small cylinders)
    for sx in (-0.13, 0.13):
        bpy.ops.mesh.primitive_cylinder_add(vertices=SEG, radius=0.09, depth=0.4,
                                            location=(sx, 0, 0.2))
        o = bpy.context.active_object; o.name = "hero_leg"; assign(o, cloth)
    # torso capsule-ish: cylinder + dome rings on top of shoulders
    bpy.ops.mesh.primitive_cylinder_add(vertices=SEG, radius=0.26, depth=0.55,
                                        location=(0, 0, 0.68))
    t = bpy.context.active_object; t.name = "hero_torso"; assign(t, armor)
    # belt
    bpy.ops.mesh.primitive_cylinder_add(vertices=SEG, radius=0.27, depth=0.08,
                                        location=(0, 0, 0.45))
    o = bpy.context.active_object; o.name = "hero_belt"; assign(o, cloth)
    # head: cylinder + stacked-ring dome helmet (no sphere)
    bpy.ops.mesh.primitive_cylinder_add(vertices=SEG, radius=0.17, depth=0.22,
                                        location=(0, 0, 1.10))
    h = bpy.context.active_object; h.name = "hero_head"; assign(h, skin)
    ring_dome(0, 0, 1.21, 0.17, 0.14, 3, armor, "hero_helm")
    # plume
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.02, 1.42))
    p = bpy.context.active_object; p.name = "hero_plume"
    p.scale = (0.06, 0.25, 0.10); bpy.ops.object.transform_apply(scale=True)
    assign(p, cloth)
    # sword: blade + guard in right hand
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.42, 0, 0.9))
    bl = bpy.context.active_object; bl.name = "hero_blade"
    bl.scale = (0.07, 0.02, 0.70); bpy.ops.object.transform_apply(scale=True)
    assign(bl, steel)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.42, 0, 0.55))
    g = bpy.context.active_object; g.name = "hero_guard"
    g.scale = (0.20, 0.05, 0.05); bpy.ops.object.transform_apply(scale=True)
    assign(g, armor)
    # shield: thin cylinder on left arm
    bpy.ops.mesh.primitive_cylinder_add(vertices=SEG, radius=0.22, depth=0.05,
                                        location=(-0.42, 0, 0.75),
                                        rotation=(0, math.pi / 2, 0))
    s = bpy.context.active_object; s.name = "hero_shield"; assign(s, cloth)

def build_slime():
    body = mat("M_Slime", (0.25, 0.75, 0.35, 1.0))
    dark = mat("M_SlimeDark", (0.12, 0.45, 0.20, 1.0))
    eye = mat("M_Eye", (0.05, 0.05, 0.08, 1.0))
    # blob body: stacked widening-then-shrinking rings (golem/slime placeholder)
    prof = [(0.42, 0.18), (0.50, 0.22), (0.44, 0.22), (0.30, 0.20)]
    z = 0.0
    for i, (r, h) in enumerate(prof):
        bpy.ops.mesh.primitive_cylinder_add(vertices=SEG, radius=r, depth=h,
                                            location=(0, 0, z + h / 2))
        o = bpy.context.active_object; o.name = f"slime_body{i}"; assign(o, body)
        z += h
    ring_dome(0, 0, z, 0.30, 0.22, 3, body, "slime_dome")
    # rocky brow band (golem hint)
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.46, depth=0.10,
                                        location=(0, 0, 0.30))
    o = bpy.context.active_object; o.name = "slime_band"; assign(o, dark)
    # eyes: two small dark cylinders on front
    for sx in (-0.16, 0.16):
        bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.06, depth=0.05,
                                            location=(sx, 0.42, 0.62),
                                            rotation=(math.pi / 2, 0, 0))
        o = bpy.context.active_object; o.name = "slime_eye"; assign(o, eye)

def build_chest():
    wood = mat("M_Wood", (0.45, 0.28, 0.12, 1.0))
    gold = mat("M_Gold", (0.95, 0.75, 0.25, 1.0))
    dark = mat("M_ChestDark", (0.20, 0.12, 0.06, 1.0))
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.25))
    base = bpy.context.active_object; base.name = "chest_base"
    base.scale = (0.9, 0.6, 0.5); bpy.ops.object.transform_apply(scale=True)
    assign(base, wood)
    # rounded lid: half-cylinder via cylinder rotated, 12 seg
    bpy.ops.mesh.primitive_cylinder_add(vertices=SEG, radius=0.30, depth=0.9,
                                        location=(0, 0, 0.50),
                                        rotation=(0, math.pi / 2, 0))
    lid = bpy.context.active_object; lid.name = "chest_lid"
    lid.scale = (1.0, 1.0, 0.6); bpy.ops.object.transform_apply(scale=True)
    assign(lid, wood)
    # gold bands
    for sx in (-0.25, 0.25):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(sx, 0, 0.35))
        o = bpy.context.active_object; o.name = "chest_band"
        o.scale = (0.08, 0.62, 0.55); bpy.ops.object.transform_apply(scale=True)
        assign(o, gold)
    # lock plate
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.31, 0.35))
    o = bpy.context.active_object; o.name = "chest_lock"
    o.scale = (0.16, 0.04, 0.20); bpy.ops.object.transform_apply(scale=True)
    assign(o, dark)

def build_portal():
    stone = mat("M_PortalStone", (0.30, 0.30, 0.38, 1.0))
    glow = mat("M_PortalGlow", (0.25, 0.60, 1.00, 1.0))
    glow.node_tree.nodes.get("Principled BSDF").inputs["Emission Color"].default_value = (0.25, 0.6, 1.0, 1.0)
    glow.node_tree.nodes.get("Principled BSDF").inputs["Emission Strength"].default_value = 2.0
    # ring: torus is headless-safe (only sphere op fails)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.8, minor_radius=0.12,
                                     major_segments=16, minor_segments=10,
                                     location=(0, 0, 1.1))
    ring = bpy.context.active_object; ring.name = "portal_ring"
    assign(ring, stone)
    # inner glow disc: thin cylinder
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.72, depth=0.04,
                                        location=(0, 0, 1.1),
                                        rotation=(0, 0, 0))
    disc = bpy.context.active_object; disc.name = "portal_disc"
    assign(disc, glow)
    # base steps
    for i, (w, zz) in enumerate(((1.4, 0.10), (1.1, 0.28))):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, zz))
        o = bpy.context.active_object; o.name = f"portal_base{i}"
        o.scale = (w, 0.6, 0.2); bpy.ops.object.transform_apply(scale=True)
        assign(o, stone)

BUILDERS = [
    ("floor_tile", build_floor),
    ("wall_block", build_wall),
    ("column", build_column),
    ("hero_knight", build_hero),
    ("enemy_slime_golem", build_slime),
    ("treasure_chest", build_chest),
    ("portal_ring", build_portal),
]

for name, fn in BUILDERS:
    clear_scene()
    fn()
    finish(name)

print("KIT DONE")
