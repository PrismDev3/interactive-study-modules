"""Export Green Goblin's default, combat, and glider AN4 clips to the shared retargetable bank.

Usage: python export_goblin.py <source greengoblin folder> <out json> <greengoblin.glb>
"""
import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from decode_an4 import animation
from export_bigfig import euler_zyx_to_quat, pack, clip_frames
from export_minifig import qmul, qinv, qrot, rig, world
from pak import inflate, read_pak

# key: (pak name, entry, clip index, loops)
CLIPS = {
    'idle':       ('default', 'IDLE1_DEF_nxg.an4', 0, True),
    'idle2':      ('default', 'idle2_DEF_nxg.an4', 0, False),
    'idle3':      ('default', 'idle3_DEF_nxg.an4', 0, False),
    'walk':       ('default', 'Walk_DEF_nxg.an4', 0, True),
    'run':        ('default', 'Run_DEF_nxg.an4', 0, True),
    'sprint':     ('default', 'SPRINT_DEF_nxg.an4', 0, True),
    'jump':       ('default', 'JUMPANDLAND_DEF_nxg.an4', 0, False),
    'land':       ('default', 'JUMPANDLAND_DEF_nxg.an4', 1, False),
    'fall':       ('default', 'Fall_DEF_nxg.an4', 0, True),
    'fallLand':   ('default', 'FallLand_DEF_nxg.an4', 0, False),
    'shoot':      ('default', 'SHOOT_TARGETING_SHOOT_DEF_nxg.an4', 0, False),
    'combo':      ('combat', 'Combo_DEF_nxg.an4', 0, False),
    'fly':        ('fly', 'fly_DEF_nxg.an4', 0, True),
    'flySprint':  ('fly', 'FLY_SPRINT_DEF_nxg.an4', 0, True),
    'hover':      ('fly', 'Hover_DEF_nxg.an4', 0, True),
    'flyDown':    ('fly', 'flyDown_DEF_nxg.an4', 0, True),
    'flyUp':      ('fly', 'FLYUP_DEF_nxg.an4', 0, True),
    'flyHit':     ('fly', 'HOVER_TAKEHIT_DEF_nxg.an4', 0, False),
    'shootFly':   ('fly', 'hover_shoot_targeting_shoot_DEF_nxg.an4', 0, False),
}

PAKS = {
    'default': 'greengoblin_default_an4_nxg.pak',
    'combat': 'greengoblin_combat_an4_nxg.pak',
    'fly': 'greengoblin_fly_an4_nxg.pak',
}


def main(source, out, glb):
    source, out, glb = Path(source), Path(out), Path(glb)
    names, parents, bind_q, bind_t = rig(glb)
    bind_t = list(bind_t)
    bind_t[0] = (0.0, 0.0, 0.0)
    bind_w, bind_p = world(parents, bind_q, bind_t)
    bind_w_inv = [qinv(q) for q in bind_w]
    hip_h = rig(glb)[3][0][1] + bind_p[1][1]

    bank = dict(fps=30, joints=names, parents=parents, hipH=hip_h, clips={},
                source='LEGO Marvel Green Goblin default, combat and glider AN4 animation packs')
    with tempfile.TemporaryDirectory(prefix='goblin_an4_') as tmp:
        root = Path(tmp)
        entries = {}
        for pack_name, filename in PAKS.items():
            pak_path = source / filename
            for name, _off, _size, _comp, blob in read_pak(pak_path):
                path = root / pack_name / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(inflate(blob))
                entries[(pack_name, name)] = path

        for key, (pack_name, filename, clip_index, loop) in CLIPS.items():
            clip = animation(entries[(pack_name, filename)], actor_name='auto', clip_index=clip_index)
            samples = clip_frames(clip)
            deltas, hips, previous = [], [], None
            for frame in samples:
                local_q = [euler_zyx_to_quat(-joint[3], joint[4], -joint[5]) for joint in frame]
                local_q[0] = (0.0, 0.0, 0.0, 1.0)
                local_t = [(-joint[0], joint[1], -joint[2]) for joint in frame]
                local_t[0] = (0.0, 0.0, 0.0)
                frame_w, frame_p = world(parents, local_q, local_t)
                delta = [qmul(frame_w[i], bind_w_inv[i]) for i in range(len(frame_w))]
                if previous:
                    delta = [q if sum(a * b for a, b in zip(q, p)) >= 0 else tuple(-v for v in q)
                             for q, p in zip(delta, previous)]
                previous = delta
                deltas.extend(v for q in delta for v in q)
                hips.extend((frame_p[1][0] - bind_t[0][0] - bind_p[1][0],
                             frame_p[1][1] - hip_h,
                             frame_p[1][2] - bind_t[0][2] - bind_p[1][2]))
            bank['clips'][key] = dict(n=len(samples), loop=loop, src=clip['name'],
                                      d=pack(deltas, 32767), hips=pack(hips, 10000))
            print(f'{key:10s} {clip["name"]:34s} {len(samples):4d} frames')

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(bank, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    print(f'wrote {out} ({out.stat().st_size:,} bytes; hipH {hip_h:.4f})')


if __name__ == '__main__':
    main(*sys.argv[1:4])
