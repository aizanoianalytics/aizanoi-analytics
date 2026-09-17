"""Export environment-only semantics and evaluated geometry provenance, never an agent."""
import hashlib
import json
from pathlib import Path

import bpy
from mathutils import Vector

WORKSPACE = Path('gelistirmeler/2026-09-16-fly-world-prototype')
ASSETS = Path('frontend/labs/fly-world/assets')


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare(root, manifest):
    spec = json.loads((root / WORKSPACE / 'scene_spec.json').read_text())
    environment = dict(spec['environment'], rooms=spec['rooms'])
    paths = [WORKSPACE / 'scene_spec.json', WORKSPACE / 'asset_manifest.json']
    paths += [Path('scripts/fly-world') / name for name in (
        'build_scene_v3.py', 'build_scene_v2.py', 'detail_pass_v3.py',
        'micro_detail_pass_v3.py', 'environment_export.py', 'author_heroes.py')]
    paths += [Path(slot['localPath']) for slot in manifest['slots'] if slot.get('localPath') and (root / slot['localPath']).is_file()]
    sources = {str(path): sha256(root / path) for path in paths}
    environment['sourceHashes'] = sources
    target = root / ASSETS
    target.mkdir(parents=True, exist_ok=True)
    (target / 'environment.json').write_text(json.dumps(environment, indent=2) + '\n')
    meta = bpy.data.objects['FLY_HOUSE_META']
    meta['environment_schema'] = 1
    meta['environment_sha256'] = sha256(target / 'environment.json')
    meta['source_hashes'] = json.dumps(sources, sort_keys=True)
    # Evaluate modifiers and world transforms: raw object dimensions miss bevels,
    # imported hierarchy transforms and curve conversion.
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    geometry = []
    for obj in bpy.context.scene.objects:
        if obj.type not in {'MESH', 'CURVE'}:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        points = [evaluated.matrix_world @ v.co for v in mesh.vertices]
        if points:
            geometry.append({'name': obj.name, 'bounds': [
                [min(p[i] for p in points) for i in range(3)],
                [max(p[i] for p in points) for i in range(3)]],
                'collision': obj.get('collision', 'none'),
                'landing': bool(obj.get('landing_surface', False))})
        evaluated.to_mesh_clear()
    return {'schemaVersion': 1, 'axis': 'Z-up', 'blender': bpy.app.version_string,
            'sourceHashes': sources, 'environmentSha256': sha256(target / 'environment.json'),
            'geometry': geometry}


def finish(root, report):
    report['glbSha256'] = sha256(root / ASSETS / 'fly-house.glb')
    dest = root / WORKSPACE / 'build' / 'build-provenance.json'
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(report, indent=2) + '\n')
