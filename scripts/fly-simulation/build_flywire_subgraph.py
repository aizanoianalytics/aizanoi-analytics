#!/usr/bin/env python3
"""Derive the pinned non-commercial FlyWire FAFB v783 LC4 escape subgraph.
Requires pyarrow and the two release files downloaded to a temporary directory.
"""
import argparse, csv, json
from pathlib import Path
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.feather as feather

parser = argparse.ArgumentParser()
parser.add_argument('--annotations', required=True, type=Path)
parser.add_argument('--connections', required=True, type=Path)
parser.add_argument('--output', required=True, type=Path)
a = parser.parse_args()
ids = {}
with a.annotations.open(encoding='utf-8') as f:
    for row in csv.DictReader(f, delimiter='\t'):
        typ = row.get('cell_type') or row.get('hemibrain_type')
        if typ in {'LC4', 'DNp02', 'DNp11'}:
            ids.setdefault(typ, []).append(int(row['root_id']))
table = feather.read_table(a.connections, columns=['pre_pt_root_id','post_pt_root_id','neuropil','syn_count','gaba_avg','ach_avg','glut_avg','oct_avg','ser_avg','da_avg'])
all_ids = set(sum(ids.values(), []))
values = pa.array(list(all_ids), type=pa.int64())
mask = pc.and_(pc.is_in(table['pre_pt_root_id'], value_set=values), pc.is_in(table['post_pt_root_id'], value_set=values))
edges = []
for row in table.filter(mask).to_pylist():
    pre = next(k for k, v in ids.items() if row['pre_pt_root_id'] in v)
    post = next(k for k, v in ids.items() if row['post_pt_root_id'] in v)
    if pre == 'LC4' and post in {'DNp02', 'DNp11'}:
        edges.append({'pre_type': pre, 'post_type': post, **row})
out = {'schemaVersion':'flywire-connectome-subgraph-1','provenance':{'label':'CONNECTOME-DERIVED','calibrated':False,'units':{'syn_count':'count','neurotransmitter_probability':'probability'},'assumptions':['Released proofread connectivity is not a complete dynamical neural model.','Only LC4 to DNp02/DNp11 edges are retained.'],'limitations':['Synaptic weights are not converted into membrane dynamics or motor commands.','License must be rechecked before commercial redistribution.'],'version':'FAFB-v783','sourceReferences':['https://zenodo.org/records/10676866','https://doi.org/10.1038/s41586-024-07558-y','https://doi.org/10.1038/s41586-024-07686-5','https://github.com/flyconnectome/flywire_annotations'],'licenseNotice':'Conservative interpretation: CC BY-NC 4.0 pending clarification of the Zenodo metadata discrepancy.'},'release':{'dataset':'FAFB','version':783,'zenodoRecord':'10676866'},'nodes':ids,'edges':edges,'derivation':{'selection':'cell_type in {LC4, DNp02, DNp11}; pre_type=LC4; post_type in {DNp02, DNp11}','edgeCount':len(edges),'totalSynapseCount':sum(e['syn_count'] for e in edges)}}
a.output.write_text(json.dumps(out, indent=2) + '\n', encoding='utf-8')
print(f'Wrote {len(edges)} edges and {out["derivation"]["totalSynapseCount"]} synapses to {a.output}')
