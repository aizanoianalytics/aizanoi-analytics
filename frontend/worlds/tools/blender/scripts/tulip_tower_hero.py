"""
tulip_tower_hero.py — İGA Tulip ATC Tower hero asset (hibrit faz 4)
Blender 4.0+ headless: blender --background -P tulip_tower_hero.py -- --out <path.glb>

Yapar (gerçek ölçü: ~90 m, Pininfarina/AECOM lale profili):
- Aerodinamik gövde (lathe profili: dar kaide → lale soğanı → kabin)
- 360° cam kabin + 24 dikme, 12 taç yaprağı, taç çatı + anten direği
- Malzeme başına birleştirme, bevel + smooth + smart UV

Poly hedefi: ≤ 15k tri.
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


H = 90.0


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.materials):
        for x in list(coll):
            coll.remove(x)


def mat(name, rgb, rough=0.4, metal=0.0, emissive=None):
    m = bpy.data.materials.new(name=name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*rgb, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emissive:
        b.inputs["Emission Color"].default_value = (*emissive, 1.0)
        b.inputs["Emission Strength"].default_value = 2.0
    return m


def lathe(profile, name, material, segments=32):
    """Revolve a [(radius, y)] profile around Y (4.0-safe screw modifier)."""
    mesh = bpy.data.meshes.new(name + "_mesh")
    verts = [(r * math.cos(a), y, r * math.sin(a))
             for (r, y) in profile
             for a in [2 * math.pi * i / segments for i in range(segments)]]
    n = len(profile)
    faces = []
    for j in range(n - 1):
        for i in range(segments):
            a = j * segments + i
            b = j * segments + (i + 1) % segments
            c = (j + 1) * segments + (i + 1) % segments
            d = (j + 1) * segments + i
            faces.append((a, b, c, d))
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(material)
    for poly in o.data.polygons:
        poly.use_smooth = True
    return o


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
        "atcShaft": mat("atcShaft", (0.886, 0.886, 0.886), 0.38, 0.40),
        "glassCurtain": mat("glassCurtain", (0.51, 0.78, 0.87), 0.08, 0.15),
        "structuralSteel": mat("structuralSteel", (0.29, 0.33, 0.38), 0.32, 0.86),
        "beacon": mat("beacon", (1.0, 0.0, 0.0), 0.4, 0.0, emissive=(1.0, 0.07, 0.0)),
    }
    stem_h, bulb_h, cab_h, crown_h = H * 0.68, H * 0.20, H * 0.08, H * 0.04
    y0 = 0.0
    # Gövde lathe profili: kaide → sap → soğan → kabin altı
    lathe([(8.5, y0), (7.0, stem_h * 0.4), (5.2, stem_h),
           (9.0, stem_h + bulb_h * 0.5), (13.5, stem_h + bulb_h)],
          "stem", mats["atcShaft"])
    lathe([(13.5, stem_h + bulb_h), (15.5, stem_h + bulb_h + cab_h)],
          "cab", mats["glassCurtain"])
    lathe([(15.5, stem_h + bulb_h + cab_h), (12.0, stem_h + bulb_h + cab_h + crown_h)],
          "crown", mats["atcShaft"])
    # Kabin dikmeleri
    for i in range(24):
        a = 2 * math.pi * i / 24
        bpy.ops.mesh.primitive_cube_add(size=1, location=(math.cos(a) * 14.6, stem_h + bulb_h + cab_h / 2, math.sin(a) * 14.6),
                                        rotation=(0, 0, -a))
        m = bpy.context.active_object
        m.name = f"mull_{i}"
        m.dimensions = (0.5, cab_h * 0.95, 0.7)
        bpy.ops.object.transform_apply(scale=True)
        m.data.materials.append(mats["structuralSteel"])
    # Taç yaprakları
    for i in range(12):
        a = 2 * math.pi * i / 12
        bpy.ops.mesh.primitive_cube_add(size=1,
                                        location=(math.cos(a) * 13.2, stem_h + bulb_h + cab_h + 2.2, math.sin(a) * 13.2),
                                        rotation=(math.sin(a) * 0.18, 0, -a - math.cos(a) * 0.18))
        p = bpy.context.active_object
        p.name = f"petal_{i}"
        p.dimensions = (1.4, 7.5, 0.5)
        bpy.ops.object.transform_apply(scale=True)
        p.data.materials.append(mats["atcShaft"])
    # Anten + beacon
    bpy.ops.mesh.primitive_cylinder_add(radius=0.45, depth=12, vertices=8, location=(0, H + 6, 0))
    bpy.context.active_object.data.materials.append(mats["structuralSteel"])
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.6, location=(0, H + 12.5, 0))
    bpy.context.active_object.data.materials.append(mats["beacon"])

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
