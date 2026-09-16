"""
parthenon_hero.py — Parthenon hero asset (hibrit faz 3, Athens)
Blender 4.0+ headless: blender --background -P parthenon_hero.py -- --out <path.glb>

Yapar (gerçek ölçüler: 30.9 x 69.5 m stylobat, 8x17 Dorik, sütun 10.4 m):
- 3 kademeli krepidoma, yivli Dorik sütunlar (20 yiv ~ 24seg + bevel),
  echinus + abakus başlık
- Cella + pronaos/opisthodomos kapıları, triglif-metop frizi,
  alınlıklar + akroter kaideleri
- Malzeme başına birleştirme (draw call), bevel + smooth + smart UV

Poly hedefi: ≤ 35k tri (mobilde procedural fallback).
"""
import argparse
import math
import sys

import bpy


def _args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True)
    return p.parse_args(argv)


W, D, COL_H = 30.9, 69.5, 10.4
COL_R = COL_H / 11
COLS_X, COLS_Z = 8, 17


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.materials):
        for x in list(coll):
            coll.remove(x)


def mat(name, rgb, rough=0.32):
    m = bpy.data.materials.new(name=name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*rgb, 1.0)
    b.inputs["Roughness"].default_value = rough
    return m


def box(name, dims, loc, material=None, bevel=0.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.dimensions = dims
    bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        mod = o.modifiers.new("EdgeSoft", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
    if material:
        o.data.materials.append(material)
    for poly in o.data.polygons:
        poly.use_smooth = True
    return o


def doric_column(name, material):
    bpy.ops.mesh.primitive_cylinder_add(radius=COL_R, depth=COL_H * 0.9,
                                       vertices=24, location=(0, COL_H * 0.45, 0))
    shaft = bpy.context.active_object
    # Entasis: üst daraltma
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.transform.resize(value=(0.82, 0.82, 1.0))
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.mesh.primitive_cone_add(radius1=COL_R * 1.25, depth=COL_H * 0.05,
                                    vertices=24, location=(0, COL_H * 0.925, 0))
    ech = bpy.context.active_object
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, COL_H * 0.975, 0))
    ab = bpy.context.active_object
    ab.dimensions = (COL_R * 2.4, COL_R * 2.4, COL_H * 0.05)
    bpy.ops.object.transform_apply(scale=True)
    parts = [shaft, ech, ab]
    for p in parts:
        p.data.materials.append(material)
        for poly in p.data.polygons:
            poly.use_smooth = True
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    bpy.context.active_object.name = name
    return bpy.context.active_object


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


def main():
    args = _args()
    clear()
    mats = {
        "marble": mat("marble", (0.956, 0.933, 0.886)),
        "limestone": mat("limestone", (0.861, 0.816, 0.706)),
        "roofTile": mat("roofTile", (0.69, 0.42, 0.28)),
        "cella_dark": mat("cella_dark", (0.05, 0.04, 0.035)),
    }
    # Krepidoma
    for i in range(3):
        box(f"krepis_{i}", (W + 2 - i * 0.9, D + 2 - i * 0.9, 0.4),
            (0, 0.2 + i * 0.4, 0), mats["limestone"], bevel=0.02)
    top_y = 1.2
    # Peristasis
    proto = doric_column("col_proto", mats["marble"])
    proto.location = (0, -1000, 0)
    sx = (W - COL_R * 4) / (COLS_X - 1)
    sz = (D - COL_R * 4) / (COLS_Z - 1)
    for ix in range(COLS_X):
        for iz in range(COLS_Z):
            if ix in (0, COLS_X - 1) or iz in (0, COLS_Z - 1):
                c = proto.copy()
                c.data = proto.data.copy()
                c.name = f"col_{ix:02d}_{iz:02d}"
                c.location = (-W / 2 + COL_R * 2 + ix * sx, top_y, -D / 2 + COL_R * 2 + iz * sz)
                bpy.context.collection.objects.link(c)
    bpy.data.objects.remove(proto, do_unlink=True)
    ent_y = top_y + COL_H
    # Arşitrav + triglif frizi (kısa cephelerde metop boşluklu)
    box("architrave", (W, COL_H * 0.15, D), (0, ent_y + COL_H * 0.075, 0), mats["marble"], bevel=0.02)
    n = max(8, int(W / 1.5))
    for fz in (-D / 2 - 0.1, D / 2 + 0.1):
        for i in range(n):
            box(f"trig_{i}", (0.7, COL_H * 0.11, 0.35),
                (-W / 2 + 0.75 + i * ((W - 1.5) / max(1, n - 1)), ent_y + COL_H * 0.075, fz),
                mats["limestone"], bevel=0.0)
    # Cella + kapılar
    box("cella", (W - COL_R * 8, COL_H, D - COL_R * 12), (0, top_y + COL_H / 2, 0), mats["marble"])
    for dz in (-1, 1):
        box("door", (4.0, COL_H * 0.55, 0.6),
            (0, top_y + COL_H * 0.275, dz * ((D - COL_R * 12) / 2 + 0.1)), mats["cella_dark"], bevel=0.0)
    # Alınlıklar + akroterler
    ped_h = W * 0.15
    for dz in (-1, 1):
        box("pediment", (W * 0.98, ped_h, 1.2), (0, ent_y + COL_H * 0.15 + ped_h / 2, dz * (D / 2 - 0.6)),
            mats["marble"], bevel=0.02)
        for px in (-W * 0.42, 0, W * 0.42):
            box("akroter", (1.2, 1.0, 1.2), (px, ent_y + COL_H * 0.15 + ped_h + 0.4, dz * (D / 2 - 0.6)),
                mats["marble"], bevel=0.02)

    join_by_material()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.uv.smart_project(angle_limit=66, island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.export_scene.gltf(filepath=args.out, export_format="GLB",
                              export_yup=True, export_apply=True,
                              export_draco_mesh_compression_enable=False)
    print(f"EXPORT_OK {args.out}")


main()
