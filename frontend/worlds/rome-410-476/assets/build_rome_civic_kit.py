import bpy, os
OUT=os.path.dirname(__file__)
def material(n,c,r):
 m=bpy.data.materials.new(n); m.diffuse_color=(*c,1); m.roughness=r; return m
TRAV=material("weathered_travertine",(.42,.34,.25),.9); MAR=material("spolia_marble",(.7,.65,.52),.65); BRICK=material("late_roman_brick",(.28,.13,.09),.95); BRONZE=material("aged_bronze",(.22,.28,.2),.8)
def cube(n,loc,dims,mat):
 bpy.ops.mesh.primitive_cube_add(location=(loc[0],loc[2],loc[1])); o=bpy.context.object; o.name=n; o.scale=(dims[0]/2,dims[2]/2,dims[1]/2); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(mat); return o
def cyl(n,loc,r,h,mat):
 bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=r,depth=h,location=(loc[0],loc[2],loc[1])); o=bpy.context.object; o.name=n; o.data.materials.append(mat); return o
bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete(use_global=False)
cube("forum_platform",(0,.45,0),(110,.9,70),TRAV)
for x in (-46,-30,-14,14,30,46): cyl("portico_column",(x,7,-28),1.1,13,MAR)
cube("curia_shell",(-35,9,-4),(24,18,18),BRICK)
cube("basilica_wall",(28,7,20),(52,14,16),BRICK)
for x in (-20,-4,12): cyl("spolia_column",(x,8,18),1.0,14,MAR)
cyl("bronze_marker",(-5,10,0),2,18,BRONZE)
bpy.ops.object.select_all(action="SELECT"); bpy.context.view_layer.objects.active=bpy.context.selected_objects[0]; bpy.ops.object.join()
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,"forum_civic_hero.glb"),export_format="GLB",use_selection=True,export_apply=True)
