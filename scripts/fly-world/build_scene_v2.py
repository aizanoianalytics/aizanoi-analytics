#!/usr/bin/env python3
"""Fly House v0.2 — reference-driven Blender scene builder.

This is the production builder for the Fly World house after the first visual review.
It intentionally makes the house a little larger, reconstructs the visible composition
more faithfully, adds dense lived-in dressing, writes collision metadata into the GLB,
and exports the browser-ready scene directly to frontend/labs/fly-world/assets/.

Run through scripts/fly-world/run_pipeline.py or directly:

  blender --background --python scripts/fly-world/build_scene_v2.py -- --root /repo
"""
from __future__ import annotations

import argparse
import json
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector

WORKSPACE = Path("gelistirmeler/2026-09-16-fly-world-prototype")
MANIFEST_REL = WORKSPACE / "asset_manifest.json"
BUILD_REL = WORKSPACE / "build"
REVIEW_REL = WORKSPACE / "review"
FRONTEND_ASSET_REL = Path("frontend/labs/fly-world/assets/fly-house.glb")


def args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--root", type=Path, required=True)
    p.add_argument("--no-render", action="store_true")
    return p.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def mat(name, color, rough=.8, metal=0.0, emission=None, strength=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emission:
        inp = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
        if inp: inp.default_value = (*emission, 1)
        si = bsdf.inputs.get("Emission Strength")
        if si: si.default_value = strength
    return m


def palette():
    return {
        "plaster": mat("warm-aged-plaster-v2", (.66,.58,.46), .96),
        "plaster2": mat("aged-plaster-shadow-v2", (.52,.45,.36), .98),
        "floor": mat("worn-green-floor-v2", (.27,.30,.24), .91),
        "wood": mat("aged-reddish-wood-v2", (.34,.14,.08), .72),
        "wood2": mat("dark-aged-wood-v2", (.17,.07,.04), .78),
        "wood3": mat("worn-light-wood-v2", (.48,.28,.16), .76),
        "metal": mat("aged-dark-metal-v2", (.08,.07,.065), .58, .62),
        "metal2": mat("aged-light-metal-v2", (.32,.29,.26), .45, .72),
        "green": mat("muted-green-textile-v2", (.28,.33,.18), .97),
        "red": mat("muted-red-textile-v2", (.42,.17,.12), .97),
        "pink": mat("muted-pink-textile-v2", (.44,.27,.28), .97),
        "blue": mat("blue-bag-v2", (.18,.35,.45), .94),
        "cream": mat("cream-textile-v2", (.72,.66,.54), .98),
        "ceramic": mat("old-ceramic-v2", (.74,.70,.61), .45),
        "leaf": mat("plant-leaf-v2", (.20,.34,.16), .94),
        "flower": mat("flower-red-v2", (.55,.09,.06), .91),
        "fire": mat("stove-fire-v2", (.8,.07,.01), .30, 0, (1.0,.05,.005), 7),
        "glass": mat("window-glass-v2", (.27,.42,.46), .18),
    }


def collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


def tag(obj, collision=False, landing=False, semantic=None):
    obj["fly_visible"] = True
    obj["collision"] = "solid" if collision else "none"
    if landing: obj["landing_surface"] = True
    if semantic: obj["fly_semantic"] = semantic


def box(name, size, loc, material, col, *, bevel=.0, collision=False, landing=False, rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if material: o.data.materials.append(material)
    if bevel:
        mod = o.modifiers.new("soft-edges", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    for old in tuple(o.users_collection): old.objects.unlink(o)
    col.objects.link(o)
    tag(o, collision, landing)
    return o


def cyl(name, radius, depth, loc, material, col, *, collision=False, landing=False, vertices=28):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    o = bpy.context.object
    o.name = name
    if material: o.data.materials.append(material)
    for old in tuple(o.users_collection): old.objects.unlink(o)
    col.objects.link(o)
    tag(o, collision, landing)
    return o


def sphere(name, radius, loc, material, col):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=10, radius=radius, location=loc)
    o = bpy.context.object; o.name = name
    if material: o.data.materials.append(material)
    for old in tuple(o.users_collection): old.objects.unlink(o)
    col.objects.link(o); tag(o, False, False)
    return o


def wall_x(col, mats, x, y0, y1, z0, z1, name):
    return box(name, (.14, y1-y0, z1-z0), (x,(y0+y1)/2,(z0+z1)/2), mats["plaster"], col, collision=True)


def wall_y(col, mats, y, x0, x1, z0, z1, name):
    return box(name, (x1-x0,.14,z1-z0), ((x0+x1)/2,y,(z0+z1)/2), mats["plaster"], col, collision=True)


def architecture(m):
    c = collection("ARCHITECTURE_V2")
    # Main room 9.6 x 8.0 x 2.85m: a measured 0.3m circulation buffer on both long edges.
    box("FLOOR__main", (9.6,8.0,.10), (0,0,-.05), m["floor"], c, collision=True, landing=True)
    box("CEILING__main", (9.6,8.0,.08), (0,0,2.89), m["plaster2"], c, collision=True)
    wall_y(c,m,4.0,-4.8,4.8,0,2.85,"WALL__main__north")
    wall_y(c,m,-4.0,-4.8,4.8,0,2.85,"WALL__main__south")
    # West barred window.
    wall_x(c,m,-4.8,-4.0,-1.72,0,2.85,"WALL__main__west_a")
    wall_x(c,m,-4.8,.28,4.0,0,2.85,"WALL__main__west_b")
    wall_x(c,m,-4.8,-1.72,.28,0,.72,"WALL__main__west_sill")
    wall_x(c,m,-4.8,-1.72,.28,2.28,2.85,"WALL__main__west_head")
    # East doorway to bedroom.
    wall_x(c,m,4.8,-4.0,.34,0,2.85,"WALL__main__east_a")
    wall_x(c,m,4.8,1.66,4.0,0,2.85,"WALL__main__east_b")
    wall_x(c,m,4.8,.34,1.66,2.18,2.85,"WALL__main__east_head")
    # Bedroom 5.0 x 6.2m: extra breathing room around the bed; doorway follows the shared wall.
    box("FLOOR__bed", (5.0,6.2,.10), (7.3,1.15,-.05), m["floor"], c, collision=True, landing=True)
    box("CEILING__bed", (5.0,6.2,.08), (7.3,1.15,2.89), m["plaster2"], c, collision=True)
    wall_x(c,m,9.8,-1.95,4.25,0,2.85,"WALL__bed__east")
    wall_y(c,m,-1.95,4.8,9.8,0,2.85,"WALL__bed__south")
    wall_y(c,m,4.25,4.8,4.92,0,2.85,"WALL__bed__north_a")
    wall_y(c,m,4.25,6.30,9.8,0,2.85,"WALL__bed__north_b")
    wall_y(c,m,4.25,4.92,6.30,0,.78,"WALL__bed__north_sill")
    wall_y(c,m,4.25,4.92,6.30,2.20,2.85,"WALL__bed__north_head")
    wall_x(c,m,4.8,4.0,4.25,0,2.85,"WALL__bed__west_return")
    # Shared room divider is owned by the main room; duplicate coplanar bedroom walls caused z-fighting.
    # Old-house beams/skirting.
    for i,y in enumerate((-2.35,-.8,.75,2.30)):
        box(f"beam-{i}",(8.12,.13,.16),(0,y,2.72),m["wood2"],c,landing=True)
    for y in (-3.88,3.88): box(f"skirting-{y}",(9.25,.08,.16),(0,y,.12),m["wood2"],c)
    return c


def import_slot(root, slots, slot_id, loc, rot=(0,0,0), scale=1.0, collision=True):
    entry = slots.get(slot_id)
    if not entry or not entry.get("localPath"): return None
    path = root / entry["localPath"]
    if not path.is_file(): return None
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = [o for o in bpy.context.scene.objects if o not in before]
    if not imported: return None
    e = bpy.data.objects.new(f"ASSET__{slot_id}", None)
    bpy.context.scene.collection.objects.link(e)
    for o in imported:
        if o.parent is None: o.parent = e
        if o.type == "MESH": tag(o, False, True)
    e.location = loc
    e.rotation_euler = tuple(math.radians(v) for v in rot)
    e.scale = (scale,scale,scale)
    e["collision"] = "solid" if collision else "none"
    e["asset_slot"] = slot_id
    return e


def reference_dressing(root, manifest, m):
    slots = {x["id"]:x for x in manifest["slots"]}
    c = collection("REFERENCE_DRESSING_V2")
    # Hero anchors from the illustration.
    import_slot(root,slots,"bench-sofa",(-.65,2.72,.42))
    import_slot(root,slots,"carved-cabinet",(-.65,3.55,.775),rot=(0,0,180))
    import_slot(root,slots,"pillow-quilt-set",(-.48,2.46,.78),collision=False)
    import_slot(root,slots,"wood-stove",(2.15,-1.10,.59))
    import_slot(root,slots,"kettle",(2.15,-1.28,1.36),collision=False)
    import_slot(root,slots,"old-tv",(-3.20,-3.40,.70))
    import_slot(root,slots,"woven-basket",(-2.35,2.05,.34))
    import_slot(root,slots,"main-rug",(1.10,-1.35,.025),rot=(0,0,-4),collision=False)
    import_slot(root,slots,"round-rug",(-.70,-2.25,.025),collision=False)
    import_slot(root,slots,"curtain-floral",(-4.60,.56,1.50),collision=False)
    import_slot(root,slots,"curtain-lace",(-4.62,-.82,1.51),collision=False)
    import_slot(root,slots,"wooden-bed",(6.72,1.92,.46))
    import_slot(root,slots,"bed-quilt",(6.72,1.92,.82),collision=False)
    import_slot(root,slots,"bedside-table",(5.18,2.42,.42))

    # Window glass + ornate iron grille.
    box("window-glass",(.035,2.0,1.56),(-4.8,-.72,1.50),m["glass"],c,collision=True)
    for i,y in enumerate((-1.53,-1.15,-.77,-.39,-.01)):
        box(f"window-bar-v-{i}",(.055,.045,1.50),(-4.73,y,1.49),m["metal"],c,collision=True)
    for i,z in enumerate((.84,1.28,1.72,2.14)):
        box(f"window-bar-h-{i}",(.055,1.92,.045),(-4.73,-.72,z),m["metal"],c,collision=True)
    box("curtain-rail",(.12,2.25,.10),(-4.55,-.66,2.67),m["wood2"],c)

    # Bird cage / hanging detail at upper-left.
    for i in range(12):
        a=i/12*math.tau
        box(f"cage-wire-{i}",(.015,.015,.74),(-3.46+math.cos(a)*.24,1.72+math.sin(a)*.24,1.82),m["metal"],c)
    cyl("cage-base",.28,.06,(-3.46,1.72,1.45),m["wood2"],c)
    cyl("cage-top",.28,.06,(-3.46,1.72,2.19),m["wood2"],c)

    # Stove pipe is a major silhouette anchor in the reference.
    data=bpy.data.curves.new("stove-pipe-v2","CURVE"); data.dimensions="3D"; data.bevel_depth=.09; data.bevel_resolution=3
    sp=data.splines.new("POLY"); pts=json.loads((root/WORKSPACE/"scene_spec.json").read_text())["environment"]["flue"]["points"]; sp.points.add(len(pts)-1)
    for p,co in zip(sp.points,pts): p.co=(*co, 1)
    o=bpy.data.objects.new("stove-pipe",data); c.objects.link(o); data.materials.append(m["metal"]); tag(o,True,True,"heat-adjacent")
    # Fire window and warm body detail.
    box("stove-fire-window",(.50,.025,.29),(2.15,-1.54,.61),m["fire"],c)

    # Busy wall: mismatched pictures and flower vase.
    frames=((-2.9,1.55,.44,.60),(-2.28,1.62,.33,.45),(-1.68,1.50,.42,.52),(.96,1.62,.38,.48),(1.48,1.66,.28,.38),(2.88,1.70,.42,.55))
    for i,(x,z,w,h) in enumerate(frames):
        box(f"frame-{i}",(w,.055,h),(x,3.07,z),m["wood2"],c,bevel=.015)
        box(f"picture-{i}",(w-.07,.045,h-.07),(x,3.035,z),m["green"] if i%2 else m["cream"],c)
    cyl("wall-vase",.11,.26,(3.50,1.88,1.32),m["ceramic"],c)
    for i in range(5):
        box(f"flower-stem-{i}",(.018,.018,.46),(3.50+(i-2)*.05,1.85,1.60),m["leaf"],c)
        sphere(f"flower-{i}",.06,(3.50+(i-2)*.07,1.83,1.84+(i%2)*.08),m["flower"],c)

    # Additional reference clutter: blue bag, books, slippers, folded cloth, toys.
    box("blue-bag",(.76,.36,.55),(-1.50,-2.55,.31),m["blue"],c,bevel=.07,collision=True,rot=(0,0,-.16))
    for x in (-1.70,-1.30): box(f"bag-handle-{x}",(.05,.06,.43),(x,-2.55,.66),m["wood2"],c)
    cluster=((-2.85,-3.05,.30,.18,.12),(-2.50,-2.88,.26,.17,.10),(-2.15,-3.12,.20,.16,.10),
             (-2.70,-2.70,.22,.14,.11),(-1.95,-2.95,.24,.15,.10))
    for i,(x,y,w,d,h) in enumerate(cluster):
        box(f"clutter-{i}",(w,d,h),(x,y,h/2+.025),(m["wood3"],m["red"],m["green"],m["blue"])[i%4],c,bevel=min(w,d,h)*.15)
    # Yarn visible in basket beside the divan.
    for i in range(8):
        a=i/8*math.tau; sphere(f"yarn-{i}",.10+(i%2)*.02,(-2.35+math.cos(a)*.20,2.05+math.sin(a)*.17,.58+(i%3)*.035),(m["red"],m["green"],m["pink"],m["blue"])[i%4],c)

    # Bedroom continuation: shelves/books, chest, wardrobe, second curtain and plant.
    box("bedroom-bookshelf",(1.10,.34,1.62),(7.65,4.03,.81),m["wood"],c,bevel=.025,collision=True)
    for row in range(3):
        for i in range(5):
            box(f"book-{row}-{i}",(.10+.03*(i%2),.22,.24+.04*((i+row)%2)),(7.28+i*.16,3.81,.32+row*.46),(m["red"],m["green"],m["wood3"],m["blue"])[(i+row)%4],c)
    box("bedroom-trunk",(1.25,.72,.64),(5.26,-.64,.32),m["wood2"],c,bevel=.04,collision=True)
    box("trunk-lid",(1.25,.74,.09),(5.26,-.64,.69),m["wood3"],c,bevel=.03)
    box("bedroom-wardrobe",(1.18,.66,2.10),(7.58,-.78,1.05),m["wood"],c,bevel=.025,collision=True)
    box("bedroom-rug",(1.45,1.95,.03),(6.05,.05,.025),m["red"],c,rot=(0,0,.06))
    box("bedroom-window",(1.38,.035,1.42),(5.61,4.25,1.49),m["glass"],c,collision=True)
    for i in range(4): box(f"bed-curtain-{i}",(.28,.055,1.78),(4.84+i*.25,4.15,1.55),m["red"],c)
    cyl("plant-pot",.16,.28,(4.70,2.90,.14),m["ceramic"],c)
    for i in range(7):
        a=i/7*math.tau
        box(f"plant-leaf-{i}",(.055,.18,.42),(4.70+math.cos(a)*.14,2.90+math.sin(a)*.14,.48),m["leaf"],c,rot=(.12*math.sin(a),.12*math.cos(a),a))
    return c


def lighting(m):
    scene=bpy.context.scene
    world=scene.world or bpy.data.worlds.new("Fly House V2 World"); scene.world=world; world.use_nodes=True
    bg=world.node_tree.nodes.get("Background"); bg.inputs["Color"].default_value=(.055,.044,.032,1); bg.inputs["Strength"].default_value=.28
    # Large cool window key.
    d=bpy.data.lights.new("window-key","AREA"); d.energy=650; d.color=(.62,.78,1.0); d.shape="RECTANGLE"; d.size=1.9; d.size_y=1.6
    o=bpy.data.objects.new("window-key",d); o.location=(-3.65,-.72,1.62); o.rotation_euler=(0,math.radians(-90),0); scene.collection.objects.link(o)
    def point(name,loc,energy,color,radius):
        ld=bpy.data.lights.new(name,"POINT"); ld.energy=energy; ld.color=color; ld.shadow_soft_size=radius
        lo=bpy.data.objects.new(name,ld); lo.location=loc; scene.collection.objects.link(lo)
    point("stove-glow",(2.15,-1.28,.62),160,(1,.12,.012),.58)
    point("bedroom-lamp",(5.18,2.42,1.42),105,(1,.42,.10),.48)


def render_setup():
    s=bpy.context.scene
    try: s.render.engine="BLENDER_EEVEE_NEXT"
    except Exception:
        try: s.render.engine="BLENDER_EEVEE"
        except Exception: pass
    s.render.resolution_x=1440; s.render.resolution_y=900; s.render.resolution_percentage=100; s.render.image_settings.file_format="PNG"
    try: s.view_settings.look="AgX - Medium High Contrast"
    except Exception: pass


def aim(cam,target):
    cam.rotation_euler=(Vector(target)-cam.location).to_track_quat("-Z","Y").to_euler()


def render_reviews(root):
    out=root/REVIEW_REL; out.mkdir(parents=True,exist_ok=True)
    s=bpy.context.scene
    cd=bpy.data.cameras.new("review-camera"); cam=bpy.data.objects.new("review-camera",cd); s.collection.objects.link(cam); s.camera=cam
    # Evidence frames are deliberately composed from clear walkable space.  The
    # former shots put the camera behind the west wall and inside the flue/ceiling.
    views=(
        ("01-reference-wide",(-2.85,-3.15,1.72),(.10,.55,1.20),45),
        ("02-room-eye-level",(-1.40,-2.75,1.55),(.55,.75,1.18),48),
        ("03-window-to-stove",(-1.00,-3.45,1.42),(.15,-.35,1.22),32),
        ("04-doorway-bedroom",(.05,1.45,1.56),(6.15,1.08,1.18),30),
        ("05-fly-scale",(-1.80,-3.20,.72),(-.35,-1.45,.78),58),
        ("06-window-detail",(-3.15,-1.25,1.38),(-4.55,-.72,1.42),55),
        ("07-curtains-cage",(-2.85,.15,1.35),(-3.55,.95,1.30),52),
        ("08-divan-cabinet",(-2.30,1.55,1.35),(-.55,2.65,1.30),50),
        ("09-cabinet-still-life",(-1.05,1.65,1.55),(-.55,2.65,2.12),58),
        ("10-crt-cabinet",(-2.15,-2.45,1.25),(-3.25,-2.20,.78),52),
        ("11-stove-hearth",(1.05,-2.25,1.18),(2.12,-1.10,.70),52),
        ("12-stove-tools",(2.75,-1.65,1.18),(2.72,.05,.90),55),
        ("13-floor-clutter",(-.35,-2.85,.62),(-1.10,-1.55,.18),58),
        ("14-laundry-flue",(1.55,-.10,1.30),(2.95,.48,1.55),52),
        ("15-doorway-wide",(1.15,1.72,1.50),(4.75,1.0,1.28),42),
        ("16-bedroom-wide",(5.05,.62,1.48),(7.55,1.30,1.12),42),
        ("17-bed-quilt",(5.15,.55,1.18),(6.72,1.92,.92),55),
        ("18-bedside-table",(5.05,1.80,1.22),(5.18,2.42,1.05),58),
        ("19-bedroom-books",(7.05,1.85,1.45),(7.65,3.80,1.22),55),
        ("20-bedroom-window",(6.65,2.65,1.42),(5.60,4.12,1.48),50),
        ("21-bedroom-storage",(8.45,-.35,1.30),(7.55,-.78,1.05),52),
        ("22-bedroom-rug-basket",(7.10,-.55,.62),(7.48,.10,.34),55),
        ("23-bedroom-desk",(5.35,2.65,1.18),(5.52,3.08,.82),55),
        ("24-circulation-low",(3.15,.05,.55),(4.65,.95,.80),58),
    )
    # The canonical pipeline owns five approval frames; the same authored view
    # inventory is consumed by the Chromium tour recorder for the 24-tile sheet.
    views = views[:5]
    for name,pos,target,lens in views:
        cam.location=pos; cd.lens=lens; aim(cam,target); s.render.filepath=str(out/f"{name}.png"); bpy.ops.render.render(write_still=True)


def export_glb(root):
    build=root/BUILD_REL; build.mkdir(parents=True,exist_ok=True)
    destinations=(build/"fly-house-v2.glb", root/FRONTEND_ASSET_REL)
    (root/FRONTEND_ASSET_REL).parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in bpy.context.scene.objects:
        if o.type in {"MESH","CURVE","EMPTY"} and not o.name.startswith("review-camera"): o.select_set(True)
    for dest in destinations:
        bpy.ops.export_scene.gltf(filepath=str(dest),export_format="GLB",use_selection=True,export_yup=True,export_apply=True,export_extras=True)
        print(f"[fly-house-v2] GLB -> {dest}")


def main():
    a=args(); root=a.root.resolve(); manifest=json.loads((root/MANIFEST_REL).read_text(encoding="utf-8"))
    clear_scene(); render_setup(); m=palette(); architecture(m); reference_dressing(root,manifest,m); lighting(m)
    sensor=bpy.data.objects.new("FLY_SENSOR_WORLD_ROOT",None); sensor["observer_excluded"]=True; sensor["n_fly_ready"]=True; bpy.context.scene.collection.objects.link(sensor)
    build=root/BUILD_REL; build.mkdir(parents=True,exist_ok=True); blend=build/"fly-house-v2.blend"; bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    if not a.no_render: render_reviews(root); bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    export_glb(root)
    print("[fly-house-v2] complete: enlarged house, reference dressing, collision metadata, browser GLB export")


if __name__ == "__main__":
    main()
