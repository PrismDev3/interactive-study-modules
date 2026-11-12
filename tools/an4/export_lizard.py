"""Export The Lizard's own big-fig clips (LEGO Marvel bigfigs/lizard AN4 packs) to
assets/anims/lizard.json for GlbMinifig. The clips share the 70-joint big-fig skeleton, so
GlbMinifig merges them over the shared bigfig bank (locomotion, hits, landings).

Conversions are the same as export_bigfig.py:
  rotation  : three.js Euler(-rx, ry, -rz, 'ZYX')   (game frame -> GLB frame is a 180 deg turn about Y)
  Hips pos  : (-tx, ty, -tz) - Character rest (0, 0.31615, 0.02259)   (GLB keeps hip height on Character)
Root motion on the Character joint is dropped: the game moves the figure itself.

Usage: python -I export_lizard.py <out json> <rig glb> <dir with .an4 files> [more dirs...]
"""
import sys, os, json, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from decode_an4 import animation
from export_bigfig import convert, glb_joints

# key: (file name, clip index, loops)
CLIPS = {
    'idle':    ('IDLE_DEF_nxg.an4', 0, True),
    'idle2':   ('IDLE2_DEF_nxg.an4', 0, False),
    'idle3':   ('IDLE3_DEF_nxg.an4', 0, False),
    'walk':    ('WALK_DEF_nxg.an4', 0, True),
    'tiptoe':  ('TIPTOE_DEF_nxg.an4', 0, True),
    'charge':  ('CHARGE_ANTICIPATION_DEF_nxg.an4', 0, False),
    'slam':    ('SLAMFULL_DEF_nxg.an4', 0, False),
    # His signature claw attacks: the two finishing moves, then the slam as the third combo hit
    'fight1':  ('LIZARD_FINISHINGMOVE1_DEF_nxg.an4', 0, False),
    'fight2':  ('LIZARD_FINISHINGMOVE2_DEF_nxg.an4', 0, False),
    'fight3':  ('SLAMFULL_DEF_nxg.an4', 0, False),
}


def main(out, rig, *sources):
    names = glb_joints(rig)
    files = {}
    for src in sources:
        for path in glob.glob(os.path.join(src, '**', '*.an4'), recursive=True):
            files.setdefault(os.path.basename(path).upper(), path)
    data = dict(fps=30, joints=names, source="LEGO Marvel Super Heroes bigfigs/lizard AN4", clips={})
    for key, (fname, idx, loop) in CLIPS.items():
        path = files.get(fname.upper())
        if not path:
            raise SystemExit(f'missing animation file: {fname}')
        clip = animation(path, actor_name='auto70', clip_index=idx)
        c = convert(clip)
        c['loop'] = loop
        c['src'] = clip['name']
        data['clips'][key] = c
        print(f"{key:8s} {clip['name']:24s} {c['n']:4d} frames, {len(c['moving'])} moving joints")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    print('wrote', out, os.path.getsize(out), 'bytes')


if __name__ == '__main__':
    if len(sys.argv) < 4:
        raise SystemExit(__doc__)
    main(*sys.argv[1:])
