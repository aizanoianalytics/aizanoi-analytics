"""
rome_kit.py — Compact Rome (AD 410-476) Blender asset kit.
Headless: blender --background --python rome_kit.py -- --out-dir <dir>
Convention: locations are (x, north, up), Z-up build, +Y-up GLB export.
1 unit = 1 m. Studio-authored, CC0. Builders join meshes by material so the
runtime can instance the whole residential fabric in a handful of draw calls.
"""
import argparse
import math
import os
import sys

import bpy

ASSETS = ["colosseum", "pantheon", "basilica", "triumph_arch", "roman_temple",
          "vesta_tholos", "trajan_column", "circus_stand", "spina",
          "church", "city_gate", "aqueduct_seg", "mausoleum", "pyramid",
          "palace_block", "fabric_a", "fabric_b", "fabric_c"]


def _args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out-dir", required=True)
    return p.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for x in list(coll):
            coll.remove(x)


def mat_slot(name, base_color, rough=0.6):
    m = bpy.data.materials.new(name=name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = 0.02
    return m


def std_mats():
    return {
        "marble": mat_slot("marble", (0.94, 0.91, 0.86), 0.35),
        "travertine": mat_slot("travertine", (0.85, 0.81, 0.71), 0.6),
        "romanBrick": mat_slot("romanBrick", (0.62, 0.34, 0.23), 0.78),
        "brickDark": mat_slot("brickDark", (0.38, 0.22, 0.16), 0.85),
        "plaster": mat_slot("plaster", (0.84, 0.78, 0.66), 0.82),
        "roofTile": mat_slot("roofTile", (0.66, 0.40, 0.27), 0.7),
        "wood": mat_slot("wood", (0.40, 0.28, 0.19), 0.8),
        "dark": mat_slot("dark", (0.05, 0.04, 0.035), 0.9),
        "sand": mat_slot("sand", (0.76, 0.66, 0.50), 0.95),
        "concrete": mat_slot("concrete", (0.72, 0.68, 0.60), 0.7),
    }


def box(name, dims, loc, material=None, bevel=0.04, rot_z=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=(0, 0, rot_z))
    o = bpy.context.active_object
    o.name = name
    o.dimensions = dims
    bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        mod = o.modifiers.new("EdgeSoft", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        mod.limit_method = "ANGLE"
    if material:
        o.data.materials.append(material)
    return o


def cyl(name, radius, depth, loc, material=None, segs=12):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth,
                                        vertices=segs, location=loc)
    o = bpy.context.active_object
    o.name = name
    if material:
        o.data.materials.append(material)
    for poly in o.data.polygons:
        poly.use_smooth = True
    return o


def column(name, loc, height, radius, order, M):
    mat = M["marble"]
    parts = [box(name + "_plinth", (radius * 2.6, radius * 2.6, height * 0.06),
                 (loc[0], loc[1], loc[2] + height * 0.03), mat, bevel=0.02)]
    parts.append(cyl(name + "_shaft", radius, height * 0.86,
                     (loc[0], loc[1], loc[2] + height * 0.49), mat,
                     segs=12 if order == "corinthian" else 14))
    cap_y = loc[2] + height * 0.945
    if order == "corinthian":
        bpy.ops.mesh.primitive_cone_add(
            radius1=radius * 1.5, radius2=radius * 0.9, depth=height * 0.09,
            vertices=10, location=(loc[0], loc[1], cap_y))
        parts.append(bpy.context.active_object)
    else:
        for sx in (-1, 1):
            bpy.ops.mesh.primitive_torus_add(
                major_radius=radius * 0.55, minor_radius=radius * 0.22,
                major_segments=10, minor_segments=6,
                location=(loc[0] + sx * radius * 0.7, loc[1], cap_y))
            parts.append(bpy.context.active_object)
    parts.append(box(name + "_abacus", (radius * 2.6, radius * 1.8, height * 0.05),
                     (loc[0], loc[1], loc[2] + height * 0.975), mat, bevel=0.01))
    for p in parts:
        if not p.data.materials:
            p.data.materials.append(mat)
        for poly in p.data.polygons:
            poly.use_smooth = True
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    hero = bpy.context.active_object
    hero.name = name
    return hero


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
        bpy.context.active_object.name = "merged_" + name


def ell(rx, rz, a):
    return (math.cos(a) * rx, math.sin(a) * rz)


def build_colosseum(M, bays=40, RX=62.0, RZ=50.0, H=38.0):
    slot = M["travertine"]
    dark = M["dark"]
    tier_h = H / 4
    for t in range(4):
        s = 1.0 - t * 0.02
        up0 = t * tier_h
        bpy.ops.mesh.primitive_cylinder_add(radius=1, depth=tier_h, vertices=72,
                                            location=(0, 0, up0 + tier_h / 2))
        shell = bpy.context.active_object
        shell.name = "tier_%d" % t
        shell.scale = (RX * s, RZ * s, 1)
        bpy.ops.object.transform_apply(scale=True)
        shell.data.materials.append(slot)
        for poly in shell.data.polygons:
            poly.use_smooth = True
        for i in range(bays):
            a = (i / bays) * math.tau
            x, zn = ell(RX * s, RZ * s, a)
            yaw = math.atan2(x / (RX * s), zn / (RZ * s))
            px, pzn = ell(RX * s + 0.4, RZ * s + 0.4, a)
            box("pier_%d_%d" % (t, i), (1.2, 1.2, tier_h * 0.9),
                (px, pzn, up0 + tier_h * 0.45), rot_z=yaw, material=slot)
            if t < 3:
                for v in range(5):
                    va = math.pi * (v / 4)
                    ox = math.cos(a + math.pi / 2) * math.cos(va) * 1.6
                    ozn = math.sin(a + math.pi / 2) * math.cos(va) * 1.6
                    box("vous_%d_%d_%d" % (t, i, v), (0.6, 1.0, 0.6),
                        (x + ox, zn + ozn, up0 + tier_h * 0.40 + math.sin(va) * 1.6),
                        rot_z=yaw + (va - math.pi / 2) * 0.3, material=slot)
                box("recess_%d_%d" % (t, i), (2.3, 0.4, tier_h * 0.55),
                    (x * 0.985, zn * 0.985, up0 + tier_h * 0.38),
                    rot_z=yaw, material=dark, bevel=0.0)
    bpy.ops.mesh.primitive_cylinder_add(radius=1, depth=1.2, vertices=40,
                                        location=(0, 0, 0.6))
    arena = bpy.context.active_object
    arena.name = "arena"
    arena.scale = (RX * 0.42, RZ * 0.42, 1)
    bpy.ops.object.transform_apply(scale=True)
    arena.data.materials.append(M["sand"])
    for hx in (-RX * 0.15, 0, RX * 0.15):
        box("hypo", (0.8, RZ * 0.6, 1.4), (hx, 0, 1.3), material=slot)
    join_by_material()


def build_pantheon(M):
    R, wall_h = 21.0, 20.0
    drum = cyl("drum", R, wall_h, (0, 0, wall_h / 2), M["concrete"], segs=28)
    # Stepped concrete dome: 5 receding rings (avoids sphere op headless).
    for k in range(5):
        rk = R * (1 - (k + 1) * 0.16)
        yk = wall_h + k * 2.3
        ring = cyl("dome_ring_%d" % k, rk + 1.2, 2.4, (0, 0, yk + 1.2), M["concrete"],
                   segs=24)
    box("oculus_dark", (5.0, 5.0, 0.6), (0, 0, wall_h + 5 * 2.3), M["dark"], bevel=0.0)
    box("porch_base", (30.0, 14.0, 1.2), (0, R + 7.0, 0.6), M["marble"])
    for i in range(8):
        column("porch_col_%d" % i, (-13.0 + i * 3.7, R + 11.0, 1.2), 12.0, 0.75,
               "corinthian", M)
    box("porch_arch", (30.0, 14.0, 1.8), (0, R + 7.0, 13.8), M["marble"])
    ped = box("porch_ped", (30.0, 2.0, 4.5), (0, R + 7.0, 16.8), M["marble"])
    box("door", (6.0, 0.8, 10.0), (0, R - 0.4, 5.0), M["dark"], bevel=0.0)
    join_by_material()


def build_basilica(M, w=60.0, d=30.0, h=18.0):
    box("nave", (w * 0.5, d, h), (0, 0, h / 2), M["romanBrick"])
    for sx in (-1, 1):
        box("aisle_%d" % sx, (w * 0.22, d, h * 0.55), (sx * (w * 0.36), 0, h * 0.275),
            M["brickDark"])
        for i in range(6):
            column("nave_col_%d_%d" % (sx, i),
                   (sx * w * 0.14, -d / 2 + 3 + i * (d - 6) / 5, 0), h * 0.62, 0.7,
                   "corinthian", M)
    apse = cyl("apse", w * 0.25, h * 0.8, (0, d / 2 + w * 0.2, h * 0.4), M["romanBrick"],
               segs=14)
    box("roof", (w + 1.0, d + 1.0, 0.6), (0, 0, h + 0.3), M["roofTile"])
    box("door", (5.0, 0.8, 8.0), (0, -d / 2 - 0.2, 4.0), M["dark"], bevel=0.0)
    join_by_material()


def build_triumph_arch(M, w=24.0, h=20.0):
    for sx in (-1, 1):
        box("pylon_%d" % sx, (w * 0.22, 4.5, h * 0.72), (sx * w * 0.36, 0, h * 0.36),
            M["marble"])
    box("center_pylon_L", (w * 0.12, 4.5, h * 0.72), (-w * 0.10, 0, h * 0.36), M["marble"])
    box("center_pylon_R", (w * 0.12, 4.5, h * 0.72), (w * 0.10, 0, h * 0.36), M["marble"])
    for i in range(7):
        a = math.pi * (i + 0.5) / 7
        box("vous_%d" % i, (1.4, 4.5, 1.2),
            (math.cos(a) * w * 0.20, 0, h * 0.55 + math.sin(a) * w * 0.20),
            rot_z=a - math.pi / 2, material=M["marble"], bevel=0.02)
    box("attic", (w + 1.5, 5.0, h * 0.24), (0, 0, h * 0.84), M["travertine"])
    box("inscription", (w * 0.6, 0.2, 1.2), (0, 2.55, h * 0.84), M["dark"], bevel=0.0)
    join_by_material()


def build_roman_temple(M, w=30.0, d=20.0, col_h=9.0):
    box("podium", (w + 2, d + 2, 2.2), (0, 0, 1.1), M["travertine"])
    nx, nz = 7, 5
    for ix in range(nx):
        for iz in range(nz):
            if ix in (0, nx - 1) or iz in (0, nz - 1):
                column("tcol_%d_%d" % (ix, iz),
                       (-w / 2 + 1 + ix * (w - 2) / (nx - 1),
                        -d / 2 + 1 + iz * (d - 2) / (nz - 1), 2.2),
                       col_h, 0.7, "corinthian", M)
    box("cella", (w * 0.6, d * 0.6, col_h), (0, 0, 2.2 + col_h / 2), M["marble"])
    box("architrave", (w, d, 1.4), (0, 0, 2.2 + col_h + 0.7), M["marble"])
    box("pediment", (w, d * 0.9, 3.4), (0, 0, 2.2 + col_h + 1.4 + 1.7), M["marble"])
    join_by_material()


def build_vesta_tholos(M):
    R, col_h = 7.5, 7.0
    cyl("podium", R + 1.2, 1.4, (0, 0, 0.7), M["marble"], segs=20)
    box("cella", (R, R, col_h), (0, 0, 1.4 + col_h / 2), M["marble"])
    for i in range(14):
        a = 2 * math.pi * i / 14
        column("v_col_%d" % i, (math.sin(a) * R, math.cos(a) * R, 1.4),
               col_h, 0.42, "corinthian", M)
    box("architrave", (2 * R + 2, 2 * R + 2, 1.2), (0, 0, 1.4 + col_h + 0.6),
        M["marble"])
    bpy.ops.mesh.primitive_cone_add(radius1=R + 1.0, depth=3.0, vertices=20,
                                    location=(0, 0, 1.4 + col_h + 1.2 + 1.5))
    roof = bpy.context.active_object
    roof.name = "tholos_roof"
    roof.data.materials.append(M["roofTile"])
    join_by_material()


def build_trajan_column(M):
    box("pedestal", (6.0, 6.0, 5.0), (0, 0, 2.5), M["marble"])
    cyl("shaft", 1.9, 26.0, (0, 0, 5.0 + 13.0), M["marble"], segs=16)
    for k in range(3):
        bpy.ops.mesh.primitive_torus_add(major_radius=1.9, minor_radius=0.18,
                                         major_segments=16, minor_segments=6,
                                         location=(0, 0, 10.0 + k * 8.0))
        ring = bpy.context.active_object
        ring.name = "band_%d" % k
        ring.rotation_euler = (0, 0, 0)
        ring.data.materials.append(M["travertine"])
    box("capital", (5.0, 5.0, 1.6), (0, 0, 31.8), M["marble"])
    box("statue", (1.6, 1.6, 4.5), (0, 0, 34.8), M["brickDark"], bevel=0.02)
    join_by_material()


def build_circus_stand(M, L=60.0, rows=7):
    for s in range(rows):
        box("row_%d" % s, (L, 1.3, 0.75), (0, -s * 1.3, 0.9 + s * 0.75),
            M["travertine"], bevel=0.015)
    box("base", (L, rows * 1.3 + 1.0, 0.9), (0, -(rows * 1.3) / 2, 0.45), M["concrete"])
    for ex in (-1, 1):
        box("stair_%d" % ex, (2.2, rows * 1.3, 0.3), (ex * (L / 2 - 1.5), -(rows * 1.3) / 2,
                                                      rows * 0.75 + 1.0), M["marble"], bevel=0.01)


def build_spina(M, L=80.0):
    box("spina_wall", (3.0, L, 2.2), (0, 0, 1.1), M["marble"])
    box("obelisk_base", (5.0, 5.0, 2.0), (0, 0, 3.2), M["travertine"])
    bpy.ops.mesh.primitive_cone_add(radius1=1.6, depth=14.0, vertices=4,
                                    location=(0, 0, 4.2 + 7.0))
    ob = bpy.context.active_object
    ob.name = "obelisk"
    ob.rotation_euler = (0, 0, math.pi / 4)
    ob.data.materials.append(M["brickDark"])
    for dz in (-L * 0.3, L * 0.3):
        box("meta_%s" % dz, (4.0, 4.0, 3.0), (0, dz, 1.5), M["travertine"])


def build_church(M, w=40.0, d=70.0, h=20.0):
    box("nave", (w * 0.5, d, h), (0, 0, h / 2), M["romanBrick"])
    for sx in (-1, 1):
        box("aisle_%d" % sx, (w * 0.22, d, h * 0.5), (sx * w * 0.36, 0, h * 0.25),
            M["brickDark"])
        for i in range(8):
            column("nave_col_%d_%d" % (sx, i),
                   (sx * w * 0.14, -d / 2 + 4 + i * (d - 8) / 7, 0), h * 0.6, 0.65,
                   "corinthian", M)
    apse = cyl("apse", w * 0.25, h * 0.75, (0, d / 2 + w * 0.2, h * 0.375),
               M["romanBrick"], segs=14)
    box("atrium_wall", (w + 6, 1.2, 4.0), (0, -d / 2 - 6, 2.0), M["travertine"])
    box("campanile", (6.0, 6.0, h + 12.0), (w / 2 + 5, -d / 2 + 3, (h + 12.0) / 2),
        M["romanBrick"])
    box("roof", (w + 1.0, d + 1.0, 0.6), (0, 0, h + 0.3), M["roofTile"])
    join_by_material()


def build_city_gate(M, w=34.0, h=20.0):
    for sx in (-1, 1):
        cyl("tower_%d" % sx, 4.5, h, (sx * w * 0.38, 0, h / 2), M["romanBrick"],
            segs=14)
        bpy.ops.mesh.primitive_cone_add(radius1=5.0, depth=4.0, vertices=14,
                                        location=(sx * w * 0.38, 0, h + 2.0))
        cap = bpy.context.active_object
        cap.name = "tower_cap_%d" % sx
        cap.data.materials.append(M["roofTile"])
    box("curtain", (w * 0.55, 5.0, h * 0.7), (0, 0, h * 0.55), M["travertine"])
    for i in range(5):
        a = math.pi * (i + 0.5) / 5
        box("vous_%d" % i, (1.5, 5.0, 1.2),
            (math.cos(a) * w * 0.16, 0, h * 0.42 + math.sin(a) * w * 0.16),
            rot_z=a - math.pi / 2, material=M["marble"], bevel=0.02)
    box("crenellation", (w * 0.8, 5.4, 1.4), (0, 0, h * 0.92), M["romanBrick"])
    join_by_material()


def build_aqueduct_seg(M, L=30.0, h=16.0):
    for i in range(3):
        x = -L / 2 + (i + 0.5) * L / 3
        for sx in (-1, 1):
            box("pier_%d_%d" % (i, sx), (1.8, 2.6, h * 0.62), (x + sx * (L / 6 - 0.9), 0,
                                                               h * 0.31), M["concrete"])
        for v in range(5):
            va = math.pi * (v / 4)
            box("arch_%d_%d" % (i, v), (1.1, 2.6, 0.9),
                (x + math.cos(va) * (L / 6 - 0.9), 0, h * 0.55 + math.sin(va) * (L / 6 - 0.9)),
                rot_z=va - math.pi / 2, material=M["concrete"], bevel=0.02)
    box("channel", (L, 3.0, h * 0.3), (0, 0, h * 0.85), M["travertine"])
    join_by_material()


def build_mausoleum(M):
    box("base", (56.0, 56.0, 10.0), (0, 0, 5.0), M["travertine"])
    cyl("drum", 26.0, 22.0, (0, 0, 10.0 + 11.0), M["travertine"], segs=28)
    bpy.ops.mesh.primitive_cone_add(radius1=24.0, depth=8.0, vertices=28,
                                    location=(0, 0, 32.0 + 4.0))
    tum = bpy.context.active_object
    tum.name = "tumulus"
    tum.data.materials.append(M["concrete"])
    box("statue_base", (4.0, 4.0, 3.0), (0, 0, 37.5), M["marble"])
    join_by_material()


def build_pyramid(M):
    bpy.ops.mesh.primitive_cone_add(radius1=26.0, depth=36.0, vertices=4,
                                    location=(0, 0, 18.0))
    pyr = bpy.context.active_object
    pyr.name = "pyramid"
    pyr.rotation_euler = (0, 0, math.pi / 4)
    pyr.data.materials.append(M["marble"])
    box("plinth", (40.0, 40.0, 1.5), (0, 0, 0.75), M["travertine"])


def build_palace_block(M, w=80.0, d=50.0, h=22.0):
    for sx in (-1, 1):
        box("wing_%d" % sx, (w * 0.32, d, h), (sx * w * 0.30, 0, h / 2), M["romanBrick"])
    box("court_floor", (w * 0.34, d * 0.8, 0.3), (0, 0, 0.15), M["travertine"])
    for i in range(6):
        column("court_col_%d" % i, (-8.0 + (i % 3) * 8.0, -12.0 + (i // 3) * 24.0, 0),
               9.0, 0.6, "corinthian", M)
    box("aula", (w * 0.34, d * 0.4, h + 6.0), (0, -d / 2 + d * 0.2, (h + 6.0) / 2),
        M["concrete"])
    box("roof_L", (w * 0.34, d + 1.0, 0.6), (-w * 0.30, 0, h + 0.3), M["roofTile"])
    box("roof_R", (w * 0.34, d + 1.0, 0.6), (w * 0.30, 0, h + 0.3), M["roofTile"])
    join_by_material()


def fabric_shell(M, w, d, floors, wall_mat, trim_mat, shopfront, charred):
    fh, total = 3.4, floors * 3.4
    box("body", (w, d, total), (0, 0, total / 2), M[wall_mat])
    box("plinth", (w + 0.4, d + 0.4, 0.8), (0, 0, 0.4), M[trim_mat], bevel=0.01)
    if shopfront:
        n = max(1, int(w // 6))
        for i in range(n):
            x = -w / 2 + (i + 1) * w / (n + 1)
            box("shop_%d" % i, (3.2, 0.5, 2.6), (x, d / 2 + 0.1, 1.3), M["dark"],
                bevel=0.0)
    for f in range(floors):
        y = f * fh + 1.9
        for sx in (-1, 1):
            box("win_%d_%d" % (f, sx), (1.2, 0.12, 1.4), (0, sx * (d / 2 + 0.08), y),
                M["dark"], bevel=0.0)
            box("sill_%d_%d" % (f, sx), (1.5, 0.2, 0.14), (0, sx * (d / 2 + 0.1),
                                                           y - 0.8), M[trim_mat], bevel=0.0)
    roof = box("roof", (w + 1.0, d + 1.0, 0.5), (0, 0, total + 0.25), M["roofTile"])
    roof.rotation_euler[1] = 0.03
    if charred:
        box("ruin_gap", (w * 0.3, d * 0.3, total * 0.5),
            (w * 0.2, 0, total * 0.75), M["dark"], bevel=0.0)
    join_by_material()


BUILDERS = {
    "colosseum": build_colosseum,
    "pantheon": build_pantheon,
    "basilica": build_basilica,
    "triumph_arch": build_triumph_arch,
    "roman_temple": build_roman_temple,
    "vesta_tholos": build_vesta_tholos,
    "trajan_column": build_trajan_column,
    "circus_stand": build_circus_stand,
    "spina": build_spina,
    "church": build_church,
    "city_gate": build_city_gate,
    "aqueduct_seg": build_aqueduct_seg,
    "mausoleum": build_mausoleum,
    "pyramid": build_pyramid,
    "palace_block": build_palace_block,
    "fabric_a": lambda M: fabric_shell(M, 15, 12, 3, "romanBrick", "travertine", True, False),
    "fabric_b": lambda M: fabric_shell(M, 13, 11, 2, "plaster", "wood", False, False),
    "fabric_c": lambda M: fabric_shell(M, 14, 12, 3, "brickDark", "wood", True, True),
}


def main():
    args = _args()
    os.makedirs(args.out_dir, exist_ok=True)
    total_kb = 0
    for name in ASSETS:
        clear_scene()
        M = std_mats()
        BUILDERS[name](M)
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.uv.smart_project(angle_limit=66, island_margin=0.02)
        bpy.ops.object.mode_set(mode="OBJECT")
        out = os.path.join(args.out_dir, name + ".glb")
        bpy.ops.export_scene.gltf(filepath=out, export_format="GLB",
                                  export_yup=True, export_apply=True,
                                  export_draco_mesh_compression_enable=False)
        kb = os.path.getsize(out) // 1024
        total_kb += kb
        print("EXPORT_OK %s (%d KB, %d objects)" % (out, kb, len(bpy.data.objects)))
    print("KIT_DONE total=%d KB" % total_kb)


main()
         
