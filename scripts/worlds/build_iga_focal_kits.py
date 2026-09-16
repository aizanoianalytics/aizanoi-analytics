import bpy, math, os
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))

def reset():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)

def mat(name, color, metallic=0.0, rough=0.6):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.metallic=metallic; m.roughness=rough; return m
stone=mat('warm limestone',(0.62,0.48,0.30),0,0.78)
marble=mat('pale marble',(0.82,0.72,0.55),0,0.62)
steel=mat('brushed airport steel',(0.22,0.30,0.38),0.8,0.28)
glass=mat('blue glass',(0.20,0.48,0.62),0.25,0.18)

def cube(name, loc, scale, material, bevel=0):
    bpy.ops.mesh.primitive_cube_add(location=loc); o=bpy.context.object; o.name=name; o.scale=(scale[0]/2,scale[1]/2,scale[2]/2); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(material)
    if bevel:
        mod=o.modifiers.new('soft architectural edge','BEVEL'); mod.width=bevel; mod.segments=2
        bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def cyl(name, loc, radius, depth, material, verts=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=radius,depth=depth,location=loc); o=bpy.context.object; o.name=name; o.data.materials.append(material); return o

def export(path):
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',use_selection=True,export_apply=True)

def temple():
    reset();
    cube('podium',(0,1.2,0),(50,2.4,34),stone,0.4)
    cube('cella',(0,9,0),(27,13,18),marble,0.3)
    for x in [-22,-14,-6,6,14,22]:
      for z in [-14,14]: cyl('ionic_column',(x,9,z),1.15,14,marble,12)
    for x in [-22,-14,-6,6,14,22]:
      for z in [-14,14]: cyl('capital',(x,16.2,z),1.7,0.9,stone,12)
    cube('entablature',(0,17.5,0),(52,2.2,34),stone,0.3)
    cube('roof',(0,20,0),(46,2.0,29),marble,0.35)
    export(os.path.join(ROOT,'temple_court.glb'))

def terminal():
    reset();
    # One low-draw steel rib + glass bay kit, repeated by the runtime.
    for x in [-270,-180,-90,0,90,180,270]:
      for side in [-1,1]:
        y=34 + (1-(abs(x)/300)**2)*18
        beam=cube('roof_rib',(x,y,side*95),(5,3,190),steel,0.25); beam.rotation_euler[1]=side*0.08
      cube('glass_bay',(x,27,0),(78,0.8,184),glass,0.2)
    cube('roof_spine',(0,52,0),(590,4,10),steel,0.3)
    export(os.path.join(ROOT,'terminal_roof.glb'))

if __name__=='__main__':
    temple(); terminal()
