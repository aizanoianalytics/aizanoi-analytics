import bpy
import os
from mathutils import Vector

OUT = os.path.join(os.path.dirname(__file__))

def mat(name, color, roughness=0.72, metallic=0.0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.metallic = metallic
    m.roughness = roughness
    return m

MARBLE = mat('Pentelic_Marble', (0.82, 0.84, 0.79), 0.55)
LIMESTONE = mat('Acropolis_Limestone', (0.52, 0.45, 0.34), 0.9)
ROOF = mat('Terracotta_Roof', (0.46, 0.16, 0.08), 0.82)
BLUE = mat('Aegean_Painted_Detail', (0.08, 0.22, 0.30), 0.62)


def cube(name, loc, scale, material, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = (scale[0] / 2, scale[1] / 2, scale[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(material)
    if bevel:
        mod = o.modifiers.new('weathered_edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 1
    return o


def cyl(name, loc, radius, depth, material, vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(material)
    return o


def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)


def save(name):
    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]
    bpy.ops.object.join()  # one mesh, shared material slots: low draw-call hero
    bpy.ops.wm.save_as_mainfile(filepath='/tmp/athens-kit.blend')
    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', use_selection=True, export_apply=True)


def parthenon():
    cube('stylobate', (0, 0.6, 0), (34, 1.2, 72), LIMESTONE, .25)
    cube('cella', (0, 6.0, 0), (22, 10, 54), MARBLE, .2)
    for x in (-14, 14):
        for z in range(-30, 31, 5):
            cyl('Doric_fluted_column', (x, 6.8, z), 1.05, 12, MARBLE, 12)
    for z in (-34, 34):
        for x in range(-12, 13, 4):
            cyl('Doric_fluted_column', (x, 6.8, z), 1.05, 12, MARBLE, 12)
    cube('entablature', (0, 13, 0), (34, 2.0, 72), MARBLE, .15)
    cube('terracotta_roof', (0, 15, 0), (35, 1.0, 73), ROOF, .12)
    cube('pediment_blue_trace', (0, 16.2, -35), (26, 2.0, 1.0), BLUE, .08)


def propylaea():
    for x in (-13, 13): cube('gateway_wing', (x, 4.5, 0), (9, 9, 18), MARBLE, .2)
    for x in (-5, 5): cyl('gateway_column', (x, 5, 0), .7, 10, MARBLE, 12)
    cube('gateway_beam', (0, 10, 0), (34, 2.4, 18), MARBLE, .15)
    cube('gateway_roof', (0, 11.5, 0), (35, .8, 19), ROOF, .1)


def theatre():
    for i in range(6):
        r = 10 + i * 5
        bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=.75, major_segments=16, minor_segments=6, location=(0, .5 + i * .65, 0), rotation=(0, 0, 0))
        o = bpy.context.object
        o.name = 'limestone_cavea_tier'
        o.scale.y = .45
        o.data.materials.append(LIMESTONE)
    cyl('orchestra', (0, .25, 0), 9, .5, MARBLE, 16)
    cube('scaenae', (0, 4, -18), (30, 8, 5), LIMESTONE, .2)
    cube('scaenae_painted_band', (0, 6, -15.4), (22, 1, .3), BLUE, .05)


def build(name, fn):
    clear(); fn(); save(name)

build('parthenon_hero', parthenon)
build('propylaea_hero', propylaea)
build('dionysus_theatre_hero', theatre)
