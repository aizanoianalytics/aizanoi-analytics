"""Author the Roman-Phrygian dark-fantasy dungeon GLB kit.

Run with: blender --background --python scripts/worlds/dungeon-kit.py
All geometry is generated locally. No sphere primitive or external texture is used.
"""
from pathlib import Path
import math
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "frontend/js/v3/apps/dungeon/assets/glb"
OUT.mkdir(parents=True, exist_ok=True)
SEG = 12

PALETTE = {
    "marble": ((0.47, 0.43, 0.38, 1), 0.84, 0.0, 0.0),
    "marble_dark": ((0.22, 0.20, 0.20, 1), 0.92, 0.0, 0.0),
    "marble_pale": ((0.67, 0.63, 0.55, 1), 0.78, 0.0, 0.0),
    "bronze": ((0.32, 0.17, 0.065, 1), 0.42, 0.72, 0.0),
    "bronze_high": ((0.58, 0.31, 0.09, 1), 0.34, 0.78, 0.0),
    "iron": ((0.095, 0.10, 0.105, 1), 0.38, 0.82, 0.0),
    "iron_edge": ((0.28, 0.29, 0.28, 1), 0.28, 0.90, 0.0),
    "olive": ((0.17, 0.19, 0.075, 1), 0.88, 0.0, 0.0),
    "olive_dark": ((0.07, 0.085, 0.035, 1), 0.94, 0.0, 0.0),
    "leather": ((0.19, 0.075, 0.035, 1), 0.78, 0.0, 0.0),
    "bone": ((0.63, 0.57, 0.43, 1), 0.86, 0.0, 0.0),
    "ember": ((0.95, 0.16, 0.015, 1), 0.32, 0.05, 5.5),
    "ember_hot": ((1.0, 0.55, 0.06, 1), 0.25, 0.0, 8.0),
    "void": ((0.12, 0.018, 0.025, 1), 0.25, 0.05, 2.8),
    "wood": ((0.16, 0.065, 0.025, 1), 0.83, 0.0, 0.0),
}
MATS = {}

def reset():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)
    MATS.clear()

def mat(key):
    if key in MATS:
        return MATS[key]
    color, rough, metal, emission = PALETTE[key]
    m = bpy.data.materials.new("MAT__" + key)
    m.diffuse_color = color
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = color
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if emission:
        p.inputs["Emission Color"].default_value = color
        p.inputs["Emission Strength"].default_value = emission
    MATS[key] = m
    return m

def finish_obj(o, material, bevel=0.0, smooth=False):
    o.data.materials.append(mat(material))
    if bevel:
        mod = o.modifiers.new("edge_catches", 'BEVEL')
        mod.width = bevel
        mod.segments = 1
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    o.select_set(False)
    return o

def cube(name, loc, scale, material="marble", bevel=0.025, rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name; o.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_obj(o, material, bevel)

def cyl(name, loc, radius, depth, material="marble", vertices=SEG, rot=(0,0,0), smooth=True):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name
    return finish_obj(o, material, 0.008, smooth)

def cone(name, loc, r1, r2, depth, material="marble", vertices=SEG, rot=(0,0,0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot)
    o=bpy.context.object; o.name=name
    return finish_obj(o, material, 0.006, True)

def torus(name, loc, major, minor, material="bronze", rot=(0,0,0), major_seg=16, minor_seg=8):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=major_seg, minor_segments=minor_seg, location=loc, rotation=rot)
    o=bpy.context.object; o.name=name
    return finish_obj(o, material, 0.0, True)

def beam(name, a, b, radius, material="bone", vertices=10):
    a,b=Vector(a),Vector(b); d=b-a
    o=cyl(name, (a+b)/2, radius, d.length, material, vertices)
    o.rotation_mode='QUATERNION'; o.rotation_quaternion=d.to_track_quat('Z','Y')
    return o

def revolve(name, profile, material, loc=(0,0,0), segments=SEG):
    verts=[]
    for r,z in profile:
        for i in range(segments):
            a=2*math.pi*i/segments
            verts.append((loc[0]+r*math.cos(a),loc[1]+r*math.sin(a),loc[2]+z))
    faces=[]; rows=len(profile)
    for j in range(rows-1):
        for i in range(segments):
            n=(i+1)%segments
            faces.append((j*segments+i,j*segments+n,(j+1)*segments+n,(j+1)*segments+i))
    faces.append(tuple(range(segments-1,-1,-1)))
    top=tuple((rows-1)*segments+i for i in range(segments))
    faces.append(top)
    mesh=bpy.data.meshes.new(name+"__mesh"); mesh.from_pydata(verts,[],faces); mesh.update()
    o=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(o)
    return finish_obj(o,material,0.005,True)

def prism(name, points, depth, material, axis='Y'):
    # Extruded 2D X/Z polygon, centered on Y.
    n=len(points); verts=[(x,-depth/2,z) for x,z in points]+[(x,depth/2,z) for x,z in points]
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    for i in range(n):
        j=(i+1)%n; faces.append((i,j,n+j,n+i))
    me=bpy.data.meshes.new(name+"__mesh"); me.from_pydata(verts,[],faces); me.update()
    o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o)
    return finish_obj(o,material,0.008,False)

def shield(name, loc, material="bronze"):
    pts=[(-.34,.46),(.34,.46),(.40,.08),(.27,-.40),(0,-.60),(-.27,-.40),(-.40,.08)]
    o=prism(name,pts,.075,material); o.location=loc
    torus(name+"__boss",(loc[0],loc[1]-.055,loc[2]),.115,.035,"bronze_high",(math.pi/2,0,0),12,6)
    return o

def sword(prefix, loc=(0,0,0), scale=1.0):
    x,y,z=loc
    blade_name = prefix if prefix == "HERO__sword" else prefix+"__blade"
    blade=prism(blade_name,[(-.055,0),(.055,0),(.075,.58),(0,.72),(-.075,.58)],.025,"iron_edge")
    blade.location=(x,y,z)
    guard_name = prefix+"__hilt" if prefix == "WEAPON_SWORD" else prefix+"__guard"
    cube(guard_name,(x,y,z-.04),(.34,.07,.065),"bronze",.015)
    cyl(prefix+"__grip",(x,y,z-.20),.038,.28,"leather",10)
    cyl(prefix+"__pommel",(x,y,z-.36),.07,.07,"bronze",10)
    for o in bpy.context.scene.objects:
        if o.name.startswith(prefix+"__"):
            o.scale*=scale

def spear(prefix, loc=(0,0,0), length=1.7):
    x,y,z=loc
    shaft_name = prefix if prefix == "CENTURION__spear" else prefix+"__shaft"
    cyl(shaft_name,(x,y,z+length/2),.025,length,"wood",10)
    cone(prefix+"__head",(x,y,z+length+.14),.095,0,.30,"iron_edge",10)
    cube(prefix+"__socket",(x,y,z+length-.01),(.12,.06,.12),"bronze",.01)

def bow(prefix, loc=(0,0,0), height=1.2):
    x,y,z=loc
    # Angular recurved silhouette with taut string.
    limb_name = prefix if prefix == "ARCHER__bow" else prefix+"__limb"
    beam(limb_name,(x,y,z),(x-.22,y,z+.30),.025,"wood",10)
    beam(prefix+"__limb_upper",(x-.22,y,z+.30),(x-.13,y,z+.60),.022,"wood",10)
    beam(prefix+"__limb_lower",(x,y,z),(x-.22,y,z-.30),.025,"wood",10)
    beam(prefix+"__limb_tip",(x-.22,y,z-.30),(x-.13,y,z-.60),.022,"wood",10)
    beam(prefix+"__string",(x-.13,y,z-.60),(x-.02,y,z),.008,"bone",8)
    beam(prefix+"__string_upper",(x-.02,y,z),(x-.13,y,z+.60),.008,"bone",8)

def humanoid(prefix, armor="bronze", cloth="olive", z=0, scale=1.0):
    # Strong readable silhouette, feet at ground.
    for side in (-1,1):
        x=.14*side
        beam(prefix+f"__leg_{side}",(x,0,z+.05),(x,0,z+.58),.095,cloth,10)
        cube(prefix+f"__boot_{side}",(x,-.045,z+.055),(.20,.32,.11),"leather",.025)
        beam(prefix+f"__arm_{side}",(.25*side,0,z+1.12),(.36*side,0,z+.72),.075,armor,10)
    revolve(prefix+"__torso",[(.21,0),(.30,.20),(.32,.48),(.24,.62)],armor,(0,0,z+.55))
    cyl(prefix+"__belt",(0,0,z+.62),.285,.09,"leather",12)
    revolve(prefix+"__head",[(.13,0),(.16,.10),(.15,.28),(.08,.35)],"bone",(0,0,z+1.20))

def helmet(prefix, z=1.53, plume=True):
    revolve(prefix+"__helmet",[(.17,0),(.19,.10),(.16,.27),(0,.38)],"bronze",(0,0,z-.10))
    cube(prefix+"__nose_guard",(0,-.175,z+.02),(.055,.045,.30),"bronze_high",.008)
    if plume:
        prism(prefix+"__plume",[(-.04,0),(.04,0),(.07,.26),(0,.40),(-.07,.26)],.30,"olive_dark").location=(0,0,z+.20)

def floor_asset():
    cube("FLOOR__tile",(0,0,.08),(2.4,2.4,.16),"marble_dark",.035)
    cube("FLOOR__mosaic",(0,0,.17),(1.76,1.76,.035),"marble_pale",.01,rot=(0,0,math.pi/4))
    for i in range(4):
        a=i*math.pi/2
        cube("FLOOR__bronze_inlay",(.69*math.cos(a),.69*math.sin(a),.195),(.72,.035,.025),"bronze",.005,rot=(0,0,a+math.pi/4))
    for x in (-1.05,1.05):
        for y in (-1.05,1.05): cyl("FLOOR__corner_stud",(x,y,.19),.055,.035,"bronze",10)

def wall_asset():
    cube("WALL__ashlar",(0,0,1.25),(2.4,.42,2.5),"marble",.025)
    for z in (.42,1.2,1.98):
        for x in (-.78,0,.78): cube("WALL__stone_joint",(x,.222,z),(.70,.025,.035),"marble_dark",.004)
    for x in (-1.04,1.04):
        cube("WALL__pilaster",(x,-.02,1.25),(.28,.56,2.55),"marble_pale",.025)
        cube("WALL__capital",(x,-.02,2.46),(.44,.66,.18),"bronze",.02)
    cube("WALL__cornice",(0,-.01,2.55),(2.55,.62,.20),"marble_dark",.025)

def arch_asset():
    for x in (-1.0,1.0):
        cube("ARCH__pier",(x,0,1.05),(.46,.58,2.1),"marble",.03)
        cube("ARCH__springer",(x,0,2.08),(.62,.70,.20),"bronze",.025)
    for i in range(9):
        a=math.pi-(math.pi*i/8)
        x=.98*math.cos(a); z=2.0+.98*math.sin(a)
        cube("ARCH__voussoir",(x,0,z),(.38,.62,.48),"marble_pale",.025,rot=(0,a-math.pi/2,0))
    cube("ARCH__keystone",(0,-.01,3.03),(.42,.72,.58),"bronze_high",.025)
    cube("ARCH__threshold",(0,0,.08),(1.78,.72,.16),"marble_dark",.02)
    # Named lintel tucked behind the opening: semantic anchor remains in scene.
    cube("ARCH__opening",(0,.27,2.52),(1.52,.035,.12),"marble_dark",.01)

def column_asset():
    cube("COLUMN__plinth",(0,0,.10),(.92,.92,.20),"marble_dark",.025)
    cube("COLUMN__base",(0,0,.28),(.72,.72,.18),"bronze",.025)
    cyl("COLUMN__shaft",(0,0,1.48),.285,2.30,"marble_pale",12)
    for i in range(8):
        a=i*math.pi/4
        cyl("COLUMN__flute",(.272*math.cos(a),.272*math.sin(a),1.48),.025,2.12,"marble_dark",8)
    cube("COLUMN__capital",(0,0,2.68),(.82,.82,.20),"bronze",.025)
    cube("COLUMN__abacus",(0,0,2.86),(1.0,1.0,.18),"marble_dark",.025)

def broken_column_asset():
    cube("BROKEN_COLUMN__plinth",(0,0,.10),(.90,.90,.20),"marble_dark",.025)
    cyl("BROKEN_COLUMN__stump",(0,0,.72),.29,1.18,"marble_pale",12)
    for i in range(6):
        a=i*math.pi/3
        cube("BROKEN_COLUMN__rubble",(.62*math.cos(a),.46*math.sin(a),.10+(.04 if i%2 else 0)),(.34,.26,.22),"marble",.035,rot=(.1*i,.08*i,a))
    prism("BROKEN_COLUMN__fracture",[(-.30,0),(-.18,.16),(0,.06),(.14,.18),(.30,.03)],.50,"marble_dark").location=(0,0,1.30)

def stairs_asset():
    for i in range(6):
        cube("STAIRS__steps",(0,.5-i*.20,.10+i*.18),(2.0,.42,.20+i*.01),"marble",.025)
    for side in (-1,1):
        cube("STAIRS__rail",(.98*side,0,.56),(.18,1.62,1.12),"marble_dark",.03,rot=(math.atan(.54/1.0)*side*0,0,0))
        for j in range(3): cyl("STAIRS__rail_stud",(.98*side,.42-j*.42,.62+j*.18),.055,.08,"bronze",10)

def brazier_asset():
    cube("BRAZIER__foot",(0,0,.08),(.72,.72,.16),"marble_dark",.03)
    cyl("BRAZIER__stem",(0,0,.55),.11,.84,"bronze",10)
    revolve("BRAZIER__bowl",[(.18,0),(.42,.12),(.55,.30),(.50,.38)],"iron",(0,0,.92),12)
    torus("BRAZIER__rim",(0,0,1.30),.50,.045,"bronze_high")
    for i,(r,h) in enumerate(((.34,.08),(.24,.13),(.13,.18))):
        cone("BRAZIER__ember" if i==0 else "BRAZIER__flame",(0,0,1.30+h/2),r,0,h,"ember_hot" if i==2 else "ember",10)
    for i in range(4):
        a=i*math.pi/2; beam("BRAZIER__brace",(.12*math.cos(a),.12*math.sin(a),.35),(.38*math.cos(a),.38*math.sin(a),.10),.035,"bronze",8)

def chest_asset():
    cube("CHEST__body",(0,0,.36),(1.15,.72,.62),"wood",.045)
    revolve("CHEST__lid",[(.56,0),(.58,.15),(.46,.34),(.0,.46)],"wood",(0,0,.62),12)
    for x in (-.43,0,.43): cube("CHEST__band",(x,-.01,.58),(.10,.78,.78),"bronze",.018)
    cube("CHEST__lock",(0,-.40,.55),(.22,.07,.30),"bronze_high",.02)
    cyl("CHEST__keyhole",(0,-.445,.55),.035,.02,"iron",10,rot=(math.pi/2,0,0))
    for x in (-.52,.52):
        for z in (.10,.64): cyl("CHEST__rivet",(x,-.39,z),.032,.025,"bronze_high",8,rot=(math.pi/2,0,0))

def portal_asset():
    for x in (-.88,.88): cube("PORTAL__pier",(x,0,1.12),(.44,.64,2.24),"marble_dark",.04)
    torus("PORTAL__ring",(0,0,1.66),1.04,.16,"marble",(math.pi/2,0,0),16,8)
    torus("PORTAL__runes",(0,-.08,1.66),.94,.035,"ember",(math.pi/2,0,0),16,6)
    cyl("PORTAL__vortex",(0,.08,1.66),.84,.035,"void",16,rot=(math.pi/2,0,0))
    for i in range(8):
        a=i*math.pi/4
        cube("PORTAL__sigil",(.94*math.cos(a),-.13,1.66+.94*math.sin(a)),(.11,.04,.22),"ember_hot",.008,rot=(0,a,0))
    cube("PORTAL__base",(0,0,.10),(2.35,.90,.20),"marble_dark",.035)

def hero_asset():
    humanoid("HERO", "bronze", "olive",0,1)
    helmet("HERO",1.62,True)
    shield("HERO__shield",(-.43,-.05,.88),"bronze")
    sword("HERO__sword",(.43,0,.65),.90)
    # Phrygian forward-curved helmet tip and layered cape.
    cone("HERO__helmet_tip",(0,-.10,2.00),.13,0,.42,"bronze",10,rot=(.50,0,0))
    cape=prism("HERO__cape",[(-.31,1.48),(.31,1.48),(.43,.35),(0,.16),(-.43,.35)],.035,"olive_dark")
    cape.location=(0,.18,0)
    for x in (-.17,.17): cyl("HERO__cape_clasp",(x,-.17,1.43),.055,.035,"bronze_high",10,rot=(math.pi/2,0,0))

def gargoyle_asset():
    revolve("GARGOYLE__body",[(.25,0),(.38,.25),(.34,.72),(.20,.93)],"marble_dark",(0,0,.30))
    for side in (-1,1):
        beam("GARGOYLE__leg",(.20*side,0,.42),(.36*side,-.13,.05),.10,"marble",10)
        beam("GARGOYLE__arm",(.27*side,0,1.02),(.48*side,-.25,.64),.08,"marble",10)
        wing=prism("GARGOYLE__wing",[(0,0),(.18,.55),(.55,.92),(.46,.32),(.72,.08)],.055,"marble_dark")
        wing.location=(.22*side,.15,.87); wing.scale.x=side
        cone("GARGOYLE__horn",(.13*side,0,1.56),.08,0,.32,"marble_pale",10,rot=(0,.20*side,0))
    revolve("GARGOYLE__head",[(.16,0),(.25,.13),(.22,.35),(.08,.42)],"marble",(0,-.02,1.25))
    for x in (-.10,.10): cyl("GARGOYLE__eye",(x,-.205,1.47),.025,.025,"ember",8,rot=(math.pi/2,0,0))

def archer_asset():
    for side in (-1,1):
        beam("ARCHER__leg",(.12*side,0,.05),(.14*side,0,.61),.045,"bone",8)
        beam("ARCHER__arm",(.20*side,0,1.18),(.37*side,-.08,.83),.04,"bone",8)
    for z,r in ((.70,.18),(.88,.22),(1.05,.19),(1.20,.15)): torus("ARCHER__rib",(0,0,z),r,.025,"bone",(0,0,0),12,6)
    beam("ARCHER__spine",(0,0,.63),(0,0,1.29),.035,"bone",8)
    revolve("ARCHER__skull",[(.10,0),(.16,.08),(.17,.25),(.08,.34)],"bone",(0,-.01,1.30))
    for x in (-.06,.06): cyl("ARCHER__eye_socket",(x,-.15,1.48),.025,.018,"void",8,rot=(math.pi/2,0,0))
    bow("ARCHER__bow",(-.42,-.04,.82))
    cyl("ARCHER__quiver",(.24,.18,.96),.10,.58,"leather",10,rot=(0,.25,0))
    for x in (.20,.24,.28): beam("ARCHER__arrow",(x,.18,1.21),(x,.18,1.58),.009,"wood",8)

def centurion_asset():
    humanoid("CENTURION","iron","olive_dark")
    helmet("CENTURION",1.62,True)
    shield("CENTURION__shield",(-.43,-.06,.86),"iron")
    spear("CENTURION__spear",(.42,0,.05),1.75)
    for x in (-.19,0,.19): cube("CENTURION__lorica",(x,-.27,1.05),(.14,.06,.48),"bronze",.018)
    cube("CENTURION__crest",(0,0,2.06),(.09,.46,.28),"olive",.02)

def sorcerer_asset():
    revolve("SORCERER__robe",[(.46,0),(.36,.55),(.25,1.16),(.30,1.36)],"olive_dark",(0,0,0))
    revolve("SORCERER__hood",[(.24,0),(.30,.20),(.27,.50),(.10,.62)],"olive",(0,0,1.25))
    cyl("SORCERER__face_void",(0,-.245,1.57),.12,.025,"void",10,rot=(math.pi/2,0,0))
    beam("SORCERER__staff",(.40,0,.03),(.48,0,1.85),.035,"wood",10)
    torus("SORCERER__staff_crown",(.48,0,1.96),.16,.035,"bronze",(0,0,0),12,6)
    cone("SORCERER__ember",(.48,0,1.97),.105,0,.29,"ember_hot",10)
    for side in (-1,1): beam("SORCERER__sleeve",(.22*side,0,1.22),(.43*side,-.12,.92),.12,"olive",10)

def minotaur_asset():
    for side in (-1,1):
        beam("BOSS__leg",(.22*side,0,.10),(.28*side,0,.85),.17,"marble_dark",12)
        cube("BOSS__hoof",(.28*side,-.08,.09),(.34,.46,.18),"iron",.035)
        beam("BOSS__arm",(.43*side,0,1.65),(.65*side,-.03,.92),.18,"marble_pale",12)
    revolve("BOSS__marble_body",[(.35,0),(.52,.45),(.55,1.0),(.38,1.35)],"marble_pale",(0,0,.70))
    revolve("BOSS__bull_head",[(.22,0),(.36,.18),(.40,.48),(.25,.66)],"marble",(0,-.05,1.98))
    for side in (-1,1):
        cone("BOSS__horn",(.28*side,0,2.54),.13,.02,.68,"bone",10,rot=(0,.52*side,0))
        cyl("BOSS__eye",(.14*side,-.31,2.33),.038,.025,"ember",8,rot=(math.pi/2,0,0))
    cyl("BOSS__nose_ring",(0,-.40,2.18),.11,.035,"bronze_high",10,rot=(math.pi/2,0,0))
    # Double-headed labrys, held vertically.
    cyl("BOSS__labrys",(.70,0,.78),.05,1.50,"wood",10)
    for side in (-1,1):
        blade=prism("BOSS__labrys_blade",[(0,-.30),(.30,-.20),(.38,0),(.30,.20),(0,.30)],.08,"iron_edge")
        blade.location=(.70,0,1.57); blade.scale.x=side

def weapon_sword_asset(): sword("WEAPON_SWORD",(0,0,.42),1.25)
def weapon_spear_asset(): spear("WEAPON_SPEAR",(0,0,.03),2.0)
def weapon_bow_asset(): bow("WEAPON_BOW",(0,0,.68),1.35)
def arrow_asset():
    cyl("PROJECTILE_ARROW__shaft",(0,0,.65),.018,1.30,"wood",8)
    cone("PROJECTILE_ARROW__head",(0,0,1.43),.075,0,.26,"iron_edge",8)
    for side in (-1,1): prism("PROJECTILE_ARROW__fletching",[(0,0),(.09,.18),(0,.30)],.015,"olive").location=(0,.015*side,.04)
def firebolt_asset():
    cone("PROJECTILE_FIREBOLT__core",(0,0,.48),.17,.035,.82,"ember_hot",10)
    for i in range(3):
        a=i*2*math.pi/3
        cone("PROJECTILE_FIREBOLT__trail",(.11*math.cos(a),.11*math.sin(a),.10),.09,0,.52,"ember",8,rot=(.16*math.sin(a),.16*math.cos(a),0))
    torus("PROJECTILE_FIREBOLT__seal",(0,0,.55),.20,.025,"bronze",major_seg=12,minor_seg=6)

BUILDERS = {
    "floor_tile": floor_asset, "wall_block": wall_asset, "arch_doorway": arch_asset,
    "column": column_asset, "broken_column": broken_column_asset, "stairs": stairs_asset,
    "brazier": brazier_asset, "treasure_chest": chest_asset, "portal_ring": portal_asset,
    "hero_aizo": hero_asset, "hero_knight": hero_asset,
    "enemy_gargoyle": gargoyle_asset, "enemy_slime_golem": gargoyle_asset,
    "enemy_skeletal_archer": archer_asset, "enemy_armored_centurion": centurion_asset,
    "enemy_cult_sorcerer": sorcerer_asset, "boss_marble_minotaur": minotaur_asset,
    "weapon_sword": weapon_sword_asset, "weapon_spear": weapon_spear_asset,
    "weapon_bow": weapon_bow_asset, "projectile_arrow": arrow_asset,
    "projectile_firebolt": firebolt_asset,
}

def export(name, builder):
    reset(); builder()
    # Stable object order and transforms; all assets are grounded around world origin.
    for o in bpy.context.scene.objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = sorted(bpy.context.scene.objects, key=lambda o:o.name)[0]
    path=OUT/(name+".glb")
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True, export_materials='EXPORT', export_cameras=False,
        export_lights=False, export_animations=False)
    print(f"ASSET {name} bytes={path.stat().st_size}")

for stale in OUT.glob("*.glb"):
    stale.unlink()
for name,builder in BUILDERS.items():
    export(name,builder)
print(f"KIT_DONE assets={len(BUILDERS)} output={OUT}")
