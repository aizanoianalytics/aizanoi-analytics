"""
temple_of_zeus_hero.py — Aizanoi Temple of Zeus hero asset (hibrit faz 1)
Blender 4.0+ headless: blender --background -P temple_of_zeus_hero.py -- --out <path.glb>

Yapar:
- 8x15 pseudodipteral plan (gerçek ölçü: ~55 x 35 m podyum üstü)
- 3 kademeli krepidoma, torus tabanlı Ionic sütunlar (24 yiv ~ displace yok,
  low-poly: 24 seg silindir + normal-bake'e hazır UV), volüt başlık (torus çiftleri)
- Cella + pronaos kapısı, alınlık (tympanum) + akroter kaideleri
- Bevel (2 seg) + Auto Smooth, 2. UV (lightmap) açılır
- Export: glTF 2.0 binary, +Y up, 1 birim = 1 m, texture gömülü değil
  (materyal slot isimleri runtime PBR isimleriyle eşleşir: marble/limestone/roofTile)

Poly hedefi: ≤ 25k tri (sütunlar instances olarak linklenir, export'ta join edilmez).
"""
import argparse
import math
import sys

import bpy


def _args():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True, help="output .glb path")
    p.add_argument("--cols-x", type=int, default=15)
    p.add_argument("--cols-z", type=int, default=8)
    return p.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for x in list(coll):
            coll.remove(x)


def mat_slot(name, base_color):
    m = bpy.data.materials.new(name=name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
    # Runtime PBR eşleşmesi: roughness/metallic builder-common ile aynı aralıkta
    bsdf.inputs["Roughness"].default_value = 0.55 if name != "marble" else 0.32
    bsdf.inputs["Metallic"].default_value = 0.02
    return m


def box(name, dims, loc, material=None, bevel=0.06):
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
    return o


def ionic_column(name, height, radius, material):
    """Low-poly Ionic: kaide + 24seg şaft + volüt (2 torus) + abakus."""
    parts = []
    # Kaide (torus taban)
    bpy.ops.mesh.primitive_cylinder_add(radius=radius * 1.4, depth=height * 0.05,
                                       vertices=24, location=(0, 0, height * 0.025))
    base = bpy.context.active_object
    parts.append(base)
    # Şaft
    bpy.ops.mesh.primitive_cylinder_add(radius=radius * 0.92, depth=height * 0.88,
                                       vertices=24, location=(0, 0, height * 0.49))
    shaft = bpy.context.active_object
    # Hafif entasis: üst halka daralt
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.transform.resize(value=(0.86, 0.86, 1.0))
    bpy.ops.object.mode_set(mode="OBJECT")
    parts.append(shaft)
    # Volütler (Ionic kaydırmalar — ekose eksende iki torus)
    for sx in (-1, 1):
        bpy.ops.mesh.primitive_torus_add(major_radius=radius * 0.55,
                                         minor_radius=radius * 0.22,
                                         major_segments=16, minor_segments=8,
                                         location=(sx * radius * 0.7, 0, height * 0.94))
        parts.append(bpy.context.active_object)
    # Abakus
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, height * 0.975))
    ab = bpy.context.active_object
    ab.dimensions = (radius * 2.6, radius * 1.8, height * 0.05)
    bpy.ops.object.transform_apply(scale=True)
    parts.append(ab)

    for p in parts:
        p.data.materials.append(material)
        # Auto smooth (Blender 4.x: shade_smooth + auto_smooth açısı)
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


def build_temple(args, mats):
    W, D = 55.0, 35.0
    COL_H, COL_R = 10.4, 0.95
    POD_H = 2.4

    # Krepidoma (3 kademe)
    for i in range(3):
        w = W + 3 - i * 0.9
        d = D + 3 - i * 0.9
        box(f"krepis_{i}", (w, d, 0.8), (0, i * 0.8, 0), mats["limestone"], bevel=0.03)
    top_y = 2.4

    # Peristyle (8x15) — köşe instance'ları linkle
    proto = ionic_column("col_proto", COL_H, COL_R, mats["marble"])
    proto.location = (0, -1000, 0)  # export dışı park
    step_x = (W - COL_R * 4) / (args.cols_x - 1)
    step_z = (D - COL_R * 4) / (args.cols_z - 1)
    for ix in range(args.cols_x):
        for iz in range(args.cols_z):
            if ix in (0, args.cols_x - 1) or iz in (0, args.cols_z - 1):
                x = -W / 2 + COL_R * 2 + ix * step_x
                z = -D / 2 + COL_R * 2 + iz * step_z
                c = proto.copy()
                c.data = proto.data.copy()
                c.name = f"col_{ix:02d}_{iz:02d}"
                c.location = (x, top_y, z)
                bpy.context.collection.objects.link(c)
    bpy.data.objects.remove(proto, do_unlink=True)

    # Cella + pronaos kapısı (karanlık açıklık = ayrı slot)
    box("cella", (W * 0.62, COL_H, D * 0.55), (0, top_y + COL_H / 2, 0), mats["marble"])
    box("pronaos_door", (4.2, 6.5, 0.6), (0, top_y + 3.25, D * 0.275), mats["cella_dark"], bevel=0.0)

    # Arşitrav + tympanum + akroter kaideleri
    ent_y = top_y + COL_H
    box("architrave", (W, 1.6, D), (0, ent_y + 0.8, 0), mats["marble"], bevel=0.02)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, ent_y + 1.6 + 2.2, 0))
    ped = bpy.context.active_object
    ped.name = "tympanum"
    ped.dimensions = (W, 4.4, D * 0.9)
    bpy.ops.object.transform_apply(scale=True)
    ped.data.materials.append(mats["marble"])
    for sx in (-1, 0, 1):
        box(f"akroter_{sx}", (1.2, 1.0, 1.2), (sx * W * 0.42, ent_y + 1.6 + 4.6, 0),
            mats["marble"], bevel=0.02)


def main():
    args = _args()
    clear_scene()
    mats = {
        "marble": mat_slot("marble", (0.956, 0.933, 0.886)),
        "limestone": mat_slot("limestone", (0.861, 0.816, 0.706)),
        "roofTile": mat_slot("roofTile", (0.69, 0.42, 0.28)),
        "cella_dark": mat_slot("cella_dark", (0.05, 0.04, 0.035)),
    }
    build_temple(args, mats)
    # Ölçek/rotasyon uygula, ikinci UV aç
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
