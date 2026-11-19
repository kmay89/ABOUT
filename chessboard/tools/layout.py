"""Nest layout + low-poly piece meshes for the chessboard page, from the case generator itself.
Usage: python3 chessboard/tools/layout.py <kit>/source   (writes layout.json and piece_*.stl to the cwd)"""
import sys, types, json
src=sys.argv[1]; sys.path.insert(0,src)
# stub matplotlib (only needed for text, not for layout)
for name in ['matplotlib','matplotlib.textpath','matplotlib.font_manager','matplotlib.path']:
    m=types.ModuleType(name); sys.modules[name]=m
sys.modules['matplotlib.textpath'].TextPath=None
sys.modules['matplotlib.font_manager'].FontProperties=None
sys.modules['matplotlib.path'].Path=None
import pieces
case=types.ModuleType('case')
csrc=open(src+'/case.py').read().split('# ------------------------------------------------------------------ hinge geometry')[0]
exec(compile(csrc,'case.py','exec'),case.__dict__)
from meshlib import write_stl
nests, centre, env = case.layout()
out=[]
for n in nests:
    out.append(dict(kind=n['kind'], xc=round(float(n['xc']),3), y0=round(float(n['y0']),3), L=round(float(n['L']),3), side=n['side']))
json.dump(dict(nests=out, W=case.W, HD=case.HD, H=case.H, R_K=case.R_K, LATCH_Y=case.LATCH_Y, centre=float(centre)), open('layout.json','w'), indent=1)
for k in case.KINDS:
    m,_=pieces.build(k, 48, weights=False)
    write_stl(f'piece_{k}.stl', m, k)
    print(k, len(m.F), m.V.min(0), m.V.max(0))
print(len(nests), centre)
