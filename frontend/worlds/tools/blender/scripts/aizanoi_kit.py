"""
aizanoi_kit.py — Compact Aizanoi (AD 225) Blender asset kit.
Headless: blender --background --python aizanoi_kit.py -- --out-dir <dir>
Convention: locations are (x, north, up). Export +Y up, 1 unit = 1 m.
Materials reuse runtime PBR slot names. Studio-authored, CC0.
"""
import argparse
import math
import os
import sys

import bpy

ASSETS = ["temple_of_zeus", "insula_a", "insula_b", "insula_c", "domus",
          "shop_row", "scaenae", "arch_gate", "stoa_seg", "theatre_wedge",
          "stadium_stand", "bridge_seg", "bath_hall", "tholos", "ring_seg"]


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
        "marble": mat_slot("marble", (0.956, 0.933, 0.886), 0.32),
        "limestone": mat_slot("limestone", (0.861, 0.816, 0.706), 0.55),
        "romanBrick": mat_slot("romanBrick", (0.66, 0.36, 0.24), 0.78),
        "plaster": mat_slot("plaster", (0.87, 0.80, 0.68), 0.82),
        "plasterAged": mat_slot("plasterAged", (0.78, 0.72, 0.63), 0.82),
        "roofTile": mat_slot("roofTile", (0.69, 0.42, 0.28), 0.7),
        "travertine": mat_slot("travertine", (0.82, 0.78, 0.68), 0.6),
        "wood": mat_slot("wood", (0.42, 0.30, 0.20), 0.8),
        "dark": mat_slot("dark", (0.05, 0.04, 0.035), 0.9),
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
                     segs=16 if order == "ionic" else 12))
    cap_y = loc[2] + height * 0.945
    if order == "ionic":
        for sx in (-1, 1):
            bpy.ops.mesh.primitive_torus_add(
                major_radius=radius * 0.55, minor_radius=radius * 0.22,
                major_segments=12, minor_segments=6,
                location=(loc[0] + sx * radius * 0.7, loc[1], cap_y))
            parts.append(bpy.context.active_object)
    else:
        bpy.ops.mesh.primitive_cone_add(
            radius1=radius * 1.5, radius2=radius * 0.9, depth=height * 0.09,
            vertices=10, location=(loc[0], loc[1], cap_y))
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


def finish(out_dir, name):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.uv.smart_project(angle_limit=66, island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    out = os.path.join(out_dir, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB",
                              export_yup=True, export_apply=True,
                              export_draco_mesh_compression_enable=False)
    tris = sum(len(p.loop_triangles) for o in bpy.data.objects
               for p in [o.data] if hasattr(p, "loop_triangles"))
    print("EXPORT_OK %s (%d objects)" % (out, len(bpy.data.objects)))


def build_temple(M):
    W, D, COL_H, COL_R, POD_H = 55.0, 35.0, 10.4, 0.95, 2.4
    for i in range(3):
        box("krepis_%d" % i, (W + 3 - i * 0.9, D + 3 - i * 0.9, 0.8),
            (0, 0, i * 0.8), M["limestone"], bevel=0.03)
    proto = column("col_proto", (0, -1000, POD_H), COL_H, COL_R, "ionic", M)
    nx, nz = 13, 7
    for ix in range(nx):
        for iz in range(nz):
            if ix in (0, nx - 1) or iz in (0, nz - 1):
                c = proto.copy()
                c.data = proto.data.copy()
                c.name = "col_%02d_%02d" % (ix, iz)
                c.location = (-W / 2 + COL_R * 2 + ix * (W - COL_R * 4) / (nx - 1),
                              -D / 2 + COL_R * 2 + iz * (D - COL_R * 4) / (nz - 1),
                              POD_H)
                bpy.context.collection.objects.link(c)
    bpy.data.objects.remove(proto, do_unlink=True)
    box("cella", (W * 0.62, D * 0.55, COL_H), (0, 0, POD_H + COL_H / 2), M["marble"])
    box("pronaos_door", (4.2, 0.6, 6.5), (0, D * 0.275, POD_H + 3.25), M["dark"], bevel=0.0)
    ent_y = POD_H + COL_H
    box("architrave", (W, D, 1.6), (0, 0, ent_y + 0.8), M["marble"], bevel=0.02)
    ped = box("tympanum", (W, D * 0.9, 4.4), (0, 0, ent_y + 1.6 + 2.2), M["marble"])
    for sx in (-1, 0, 1):
        box("akroter_%d" % sx, (1.2, 1.2, 1.0), (sx * W * 0.42, 0, ent_y + 1.6 + 4.6),
            M["marble"], bevel=0.02)


def insula_shell(M, w, d, floors, wall_mat, shopfront, balcony):
    fh, total = 3.25, floors * 3.25
    box("body", (w, d, total), (0, 0, total / 2), M[wall_mat])
    box("bay", (w * 0.82, 0.08, total * 0.72), (0, d / 2 + 0.045, total * 0.57),
        M["plasterAged"], bevel=0.01)
    if shopfront:
        n = max(1, int(w // 6))
        for i in range(n):
            x = -w / 2 + (i + 1) * w / (n + 1)
            box("shop_%d" % i, (3.2, 0.5, 2.6), (x, d / 2 + 0.1, 1.3), M["dark"], bevel=0.0)
            box("lintel_%d" % i, (3.8, 0.2, 0.3), (x, d / 2 + 0.1, 2.9), M["wood"], bevel=0.0)
    for f in range(floors):
        y = f * fh + 1.85
        for sx in (-1, 1):
            box("win_%d_%d" % (f, sx), (1.15, 0.1, 1.35), (0, sx * (d / 2 + 0.08), y),
                M["dark"], bevel=0.0)
    if balcony and floors > 1:
        box("balcony", (w * 0.72, 1.05, 0.22), (0, d / 2 + 0.52, fh + 0.15), M["roofTile"])
        for i in range(-2, 3):
            box("post_%d" % i, (0.11, 0.11, 1.0),
                (i * w * 0.72 / 4, d / 2 + 0.95, fh + 0.65), M["wood"], bevel=0.0)
    roof = box("roof", (w + 1.0, d + 1.0, 0.45), (0, 0, total + 0.22), M["roofTile"])
    roof.rotation_euler[1] = 0.035


def build_domus(M):
    w, d, h = 20.0, 16.0, 4.2
    box("court", (w * 0.44, d * 0.5, 0.15), (0, 0, 0.08), M["travertine"])
    box("impluvium", (4.0, 3.0, 0.5), (0, 0, 0.25), M["marble"], bevel=0.02)
    for sx in (-1, 1):
        box("wing_%d" % sx, (w * 0.26, d, h), (sx * (w * 0.44 / 2 + w * 0.13), 0, h / 2),
            M["romanBrick"])
        box("wingroof_%d" % sx, (w * 0.26 + 0.8, d + 0.8, 0.4),
            (sx * (w * 0.44 / 2 + w * 0.13), 0, h + 0.2), M["roofTile"])
    box("tablinum", (w * 0.44, d * 0.2, h), (0, -d / 2 + d * 0.1, h / 2), M["plaster"])
    box("fauces", (3.0, d * 0.2, 3.4), (0, d / 2 - d * 0.1, 1.7), M["romanBrick"])
    for i, px in enumerate((-3.2, 3.2, -3.2, 3.2)):
        pz = -2.0 if i < 2 else 2.0
        cyl("portico_%d" % i, 0.22, 3.0, (px, pz, 1.5), M["wood"], segs=8)


def build_shop_row(M):
    w, d, h = 22.0, 8.0, 4.0
    box("body", (w, d, h), (0, 0, h / 2), M["romanBrick"])
    for i in range(4):
        x = -w / 2 + (i + 0.5) * w / 4
        box("shop_%d" % i, (3.6, 0.5, 2.8), (x, d / 2 + 0.1, 1.4), M["dark"], bevel=0.0)
        awn = box("awning_%d" % i, (4.4, 2.2, 0.12), (x, d / 2 + 1.1, 3.1), M["plasterAged"])
        awn.rotation_euler[0] = -0.28
    box("roof", (w + 0.8, d + 0.8, 0.4), (0, 0, h + 0.2), M["roofTile"])


def build_scaenae(M):
    w, h = 46.0, 13.0
    box("frons", (w, 6.0, h), (0, 0, h / 2), M["marble"])
    for i, dx in enumerate((-14.0, 0.0, 14.0)):
        box("door_%d" % i, (4.0, 0.6, 7.0), (dx, 3.0, 3.5), M["dark"], bevel=0.0)
        column("sc_col_%d" % i, (dx + 4.5, 3.6, 0), 9.0, 0.5, "corinthian", M)
    box("pulpitum", (w * 0.9, 8.0, 1.2), (0, 8.0, 0.6), M["travertine"])


def build_arch_gate(M):
    box("pylon_L", (3.0, 3.0, 9.0), (-4.0, 0, 4.5), M["limestone"])
    box("pylon_R", (3.0, 3.0, 9.0), (4.0, 0, 4.5), M["limestone"])
    for i in range(7):
        a = math.pi * (i + 0.5) / 7
        vx = math.cos(a) * 2.6
        vz = 6.4 + math.sin(a) * 2.6
        box("voussoir_%d" % i, (1.3, 3.0, 1.1), (vx, 0, vz), M["marble"],
            bevel=0.02, rot_z=a - math.pi / 2)
    box("attic", (11.5, 3.2, 2.2), (0, 0, 10.2), M["travertine"])
    box("inscription", (6.0, 0.2, 1.0), (0, 1.65, 10.2), M["dark"], bevel=0.0)


def build_stoa_seg(M):
    L, col_h = 24.0, 5.2
    for i in range(7):
        x = -L / 2 + i * L / 6
        column("stoa_col_%d" % i, (x, 0, 0.45), col_h, 0.42, "corinthian", M)
    box("entablature", (L, 1.4, 0.9), (0, 0, 0.45 + col_h + 0.45), M["marble"])
    roof = box("stoa_roof", (L, 9.0, 0.35), (0, -3.8, 0.45 + col_h + 1.1), M["roofTile"])
    roof.rotation_euler[0] = 0.10
    box("stoa_floor", (L, 9.0, 0.45), (0, -3.8, 0.225), M["marble"], bevel=0.01)
    box("backwall", (L, 0.8, 6.5), (0, -8.0, 3.25), M["travertine"])


def build_theatre_wedge(M):
    R0, rows, arc = 9.0, 8, math.radians(18.0)
    for s in range(rows):
        r = R0 + s * 1.15
        y = 0.6 + s * 0.62
        n = 5
        for k in range(n):
            a = -arc / 2 + (k + 0.5) * arc / n
            chord = 2 * r * math.sin(arc / n / 2) + 0.15
            box("step_%d_%d" % (s, k), (chord, 1.15, 0.62),
                (math.sin(a) * r, math.cos(a) * r, y), M["limestone"],
                bevel=0.015, rot_z=-a)
    box("backwall", (2 * (R0 + rows * 1.15) * math.sin(arc / 2) + 1.0, 1.0, rows * 0.62 + 1.0),
        (0, R0 + rows * 1.15 - 0.5, (rows * 0.62 + 1.0) / 2), M["limestone"])


def build_stadium_stand(M):
    L, rows = 30.0, 6
    for s in range(rows):
        box("row_%d" % s, (L, 1.2, 0.7), (0, -s * 1.2, 0.8 + s * 0.7), M["limestone"],
            bevel=0.015)
    box("base", (L, rows * 1.2 + 1.0, 0.8), (0, -(rows * 1.2) / 2, 0.4), M["travertine"])
    box("stair", (2.0, rows * 1.2, 0.3), (0, -(rows * 1.2) / 2, rows * 0.7 + 0.9),
        M["marble"], bevel=0.01)


def build_bridge_seg(M):
    span = 12.0
    for sx in (-1, 1):
        box("pier_%d" % sx, (1.6, 3.4, 3.2), (sx * span / 2, 0, -1.0), M["limestone"])
    for i in range(9):
        a = math.pi * (i + 0.5) / 9
        vx = math.cos(a) * (span / 2 - 0.6)
        vz = 0.6 + math.sin(a) * (span / 2 - 0.6)
        box("arch_%d" % i, (1.5, 3.4, 1.0), (vx, 0, vz), M["limestone"],
            bevel=0.02, rot_z=a - math.pi / 2)
    box("spandrel", (span + 1.6, 3.4, 2.6), (0, 0, 4.4), M["limestone"])
    box("deck", (span + 1.6, 4.6, 0.5), (0, 0, 5.9), M["travertine"])
    for sx in (-1, 1):
        box("parapet_%d" % sx, (span + 1.6, 0.4, 1.0), (0, sx * 2.1, 6.6), M["limestone"])


def build_bath_hall(M):
    w, d, h = 34.0, 20.0, 7.0
    for sx in (-1, 1):
        box("wall_%d" % sx, (w, 1.2, h), (0, sx * (d / 2 - 0.6), h / 2), M["romanBrick"])
    for ex in (-1, 1):
        box("end_%d" % ex, (1.2, d, h), (ex * (w / 2 - 0.6), 0, h / 2), M["romanBrick"])
    vault = cyl("vault", d / 2 - 0.4, w - 1.0, (0, 0, h - 1.0), M["travertine"], segs=14)
    vault.rotation_euler[1] = math.pi / 2
    box("pool", (10.0, 8.0, 1.4), (0, 0, 0.7), M["marble"], bevel=0.03)
    box("water", (9.2, 7.2, 0.3), (0, 0, 1.25), M["dark"], bevel=0.0)
    for i in range(4):
        box("furnace_%d" % i, (1.4, 1.4, 2.0),
            (-w / 2 + 3 + i * 3.0, d / 2 + 1.0, 1.0), M["romanBrick"])


def build_tholos(M):
    R, col_h = 6.5, 5.4
    podium = cyl("podium", R + 1.0, 1.0, (0, 0, 0.5), M["marble"], segs=20)
    for i in range(10):
        a = 2 * math.pi * i / 10
        column("th_col_%d" % i, (math.sin(a) * R, math.cos(a) * R, 1.0),
               col_h, 0.38, "corinthian", M)
    bpy.ops.mesh.primitive_cone_add(radius1=R + 1.6, depth=3.2, vertices=20,
                                    location=(0, 0, 1.0 + col_h + 1.6))
    roof = bpy.context.active_object
    roof.name = "tholos_roof"
    roof.data.materials.append(M["roofTile"])
    box("finial", (0.5, 0.5, 1.2), (0, 0, 1.0 + col_h + 3.2 + 0.6), M["marble"])


def build_ring_seg(M):
    R, arc = 26.0, math.radians(30.0)
    n = 4
    for k in range(n):
        a = -arc / 2 + (k + 0.5) * arc / n
        chord = 2 * R * math.sin(arc / n / 2) + 0.3
        box("wall_%d" % k, (chord, 1.2, 5.4),
            (math.sin(a) * R, math.cos(a) * R, 2.7), M["marble"],
            bevel=0.02, rot_z=-a)
        box("cap_%d" % k, (chord, 1.8, 0.5),
            (math.sin(a) * R, math.cos(a) * R, 5.6), M["travertine"],
            bevel=0.01, rot_z=-a)


BUILDERS = {
    "temple_of_zeus": build_temple,
    "insula_a": lambda M: insula_shell(M, 14, 12, 2, "romanBrick", False, True),
    "insula_b": lambda M: insula_shell(M, 16, 13, 3, "plaster", False, False),
    "insula_c": lambda M: insula_shell(M, 15, 12, 2, "romanBrick", True, False),
    "domus": build_domus,
    "shop_row": build_shop_row,
    "scaenae": build_scaenae,
    "arch_gate": build_arch_gate,
    "stoa_seg": build_stoa_seg,
    "theatre_wedge": build_theatre_wedge,
    "stadium_stand": build_stadium_stand,
    "bridge_seg": build_bridge_seg,
    "bath_hall": build_bath_hall,
    "tholos": build_tholos,
    "ring_seg": build_ring_seg,
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
