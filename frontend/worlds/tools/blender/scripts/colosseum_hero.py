"""
colosseum_hero.py — Colosseum hero asset (hibrit faz 2, Rome)
Blender 4.0+ headless: blender --background -P colosseum_hero.py -- --out <path.glb>

Yapar (gerçek ölçüler: ~188 x 156 m elips, 48 m yükseklik):
- 4 kademe eliptik kabuk (traverten/marble slotları runtime PBR ile eşleşir)
- Kademelerde 48 kemer gözü: payanda + yarım-torus voussoir kuşağı + koyu girinti
- Attika + velarium direk halkası, arena + hypogeum duvarları + podium korkuluğu
- Bevel (2 seg) + smooth shading + smart UV

Poly hedefi: ≤ 45k tri (anıt ölçeği; mobilde procedural fallback).
"""
import argparse
import math
import sys

import bpy


def _args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True)
    p.add_argument("--bays", type=int, default=48)
    return p.parse_args(argv)


RX, RZ, H = 94.0, 78.0, 48.0


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.materials):
        for x in list(coll):
            coll.remove(x)


def mat(name, rgb, rough=0.6):
    m = bpy.data.materials.new(name=name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*rgb, 1.0)
    b.inputs["Roughness"].default_value = rough
    return m


def ell(rx, rz, a):
    return (math.cos(a) * rx, math.sin(a) * rz)


def box(name, dims, loc, rot_z=0.0, material=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=(0, 0, rot_z))
    o = bpy.context.active_object
    o.name = name
    o.dimensions = dims
    bpy.ops.object.transform_apply(scale=True)
    if material:
        o.data.materials.append(material)
    for poly in o.data.polygons:
        poly.use_smooth = True
    return o


def join_by_material():
    """Join objects sharing their first material slot → 1 mesh per material (draw calls)."""
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
        "marbleColosseum": mat("marbleColosseum", (0.86, 0.82, 0.74), 0.55),
        "travertine": mat("travertine", (0.87, 0.84, 0.76), 0.58),
        "recess": mat("recess", (0.08, 0.07, 0.06), 0.95),
        "wood": mat("wood", (0.38, 0.27, 0.19), 0.75),
        "sand": mat("sand", (0.76, 0.66, 0.50), 0.95),
    }
    tier_h = H / 4
    for t in range(4):
        s = 1.0 - t * 0.025
        y0 = t * tier_h
        slot = mats["marbleColosseum"] if t < 3 else mats["travertine"]
        # Kabuk bandı (açık silindir, eliptik ölçek)
        bpy.ops.mesh.primitive_cylinder_add(radius=1, depth=tier_h, vertices=96,
                                            location=(0, y0 + tier_h / 2, 0))
        shell = bpy.context.active_object
        shell.name = f"tier_{t}"
        shell.scale = (RX * s, RZ * s, 1)
        bpy.ops.object.transform_apply(scale=True)
        shell.data.materials.append(slot)
        # Kemer gözleri: payanda + voussoir yarım-torus + girinti
        for i in range(args.bays):
            a = (i / args.bays) * math.tau
            x, z = ell(RX * s, RZ * s, a)
            yaw = math.atan2(x / (RX * s), z / (RZ * s))
            px, pz = ell(RX * s + 0.35, RZ * s + 0.35, a)
            box(f"pier_{t}_{i}", (1.1, tier_h * 0.9, 1.1), (px, y0 + tier_h * 0.45, pz),
                rot_z=yaw, material=slot)
            if t < 3:
                # Voussoir fan: 7 rotated blocks forming the half-arch (4.0-safe, no torus arc)
                for v in range(7):
                    va = math.pi * (v / 6)
                    box(f"voussoir_{t}_{i}_{v}", (0.55, 0.55, 1.0),
                        (x + math.cos(a + math.pi / 2) * math.cos(va) * 1.5,
                         y0 + tier_h * 0.42 + math.sin(va) * 1.5,
                         z + math.sin(a + math.pi / 2) * math.cos(va) * 1.5),
                        rot_z=yaw + (va - math.pi / 2) * 0.35, material=slot)
                box(f"recess_{t}_{i}", (2.2, tier_h * 0.55, 0.4), (x * 0.985, y0 + tier_h * 0.4, z * 0.985),
                    rot_z=yaw, material=mats["recess"])
        # Korniş
        bpy.ops.mesh.primitive_torus_add(major_radius=1, minor_radius=0.6,
                                         major_segments=96, minor_segments=6,
                                         location=(0, y0 + tier_h, 0))
        cor = bpy.context.active_object
        cor.name = f"cornice_{t}"
        cor.scale = (RX * s + 0.2, RZ * s + 0.2, 1)
        bpy.ops.object.transform_apply(scale=True)
        cor.data.materials.append(mats["travertine"])
    # Velarium direkleri
    s = 1.0 - 3 * 0.025
    for i in range(args.bays):
        a = (i / args.bays) * math.tau
        x, z = ell(RX * s + 0.4, RZ * s + 0.4, a)
        bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=9, vertices=6,
                                            location=(x, H + 4.5, z))
        m = bpy.context.active_object
        m.name = f"mast_{i}"
        m.data.materials.append(mats["wood"])
    # Arena + hypogeum
    bpy.ops.mesh.primitive_cylinder_add(radius=1, depth=1.2, vertices=48, location=(0, 0.6, 0))
    arena = bpy.context.active_object
    arena.name = "arena"
    arena.scale = (RX * 0.42, RZ * 0.42, 1)
    bpy.ops.object.transform_apply(scale=True)
    arena.data.materials.append(mats["sand"])
    for hx in (-RX * 0.15, 0, RX * 0.15):
        box("hypo", (0.8, 1.4, RZ * 0.6), (hx, 1.3, 0), material=mats["travertine"])

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
