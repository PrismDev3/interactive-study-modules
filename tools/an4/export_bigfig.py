"""Export LEGO Marvel big-fig clips (Hulk/Venom AN4) to assets/anims/bigfig.json for GlbMinifig.

Mapping to the extracted GLB skeleton (verified against the rest pose, see SESSION notes):
  rotation  : three.js Euler(-rx, ry, -rz, 'ZYX')   (game frame -> GLB frame is a 180 deg turn about Y)
  Hips pos  : (-tx, ty, -tz) - Character rest (0, 0.31615, 0.02259)   (GLB keeps hip height on Character)
Root motion on the Character joint is dropped: the game moves the figure itself.

Usage: python -I export_bigfig.py <unpacked hulk dir> <unpacked venom dir> <out json> <rig glb>
"""
import sys, os, json, math, base64, struct
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from decode_an4 import animation

CHAR_REST = (0.0, 0.3161469101905823, 0.02259029820561409)
# key: (file, clip index, loops)
CLIPS = {
    'idle':        ('Idle_DEF_nxg.an4', 0, True),
    'idle2':       ('idle2_DEF_nxg.an4', 0, False),
    'idle3':       ('idle3_DEF_nxg.an4', 0, False),
    'walk':        ('Walk_DEF_nxg.an4', 0, True),
    'run':         ('RUN_DEF_nxg.an4', 0, True),
    'sprint':      ('SPRINT_DEF_nxg.an4', 0, True),
    'jump':        ('JUMPANDLAND_DEF_nxg.an4', 0, False),
    'land':        ('JUMPANDLAND_DEF_nxg.an4', 1, False),
    'fall':        ('FALL_DEF_nxg.an4', 0, True),
    'fallland':    ('FALLLAND_DEF_nxg.an4', 0, False),
    'runland':     ('RunLand_DEF_nxg.an4', 0, False),
    'fight1':      ('HULK_FIGHTCOMBO_DEF_nxg.an4', 0, False),
    'fight2':      ('HULK_FIGHTCOMBO_DEF_nxg.an4', 1, False),
    'fight3':      ('HULK_FIGHTCOMBO_DEF_nxg.an4', 2, False),
    'fight4':      ('HULK_FIGHTCOMBO_DEF_nxg.an4', 3, False),
    'fight5':      ('HULK_FIGHTCOMBO_DEF_nxg.an4', 4, False),
    'fight6':      ('HULK_FIGHTCOMBO_DEF_nxg.an4', 5, False),
    'fight7':      ('HULK_FIGHTCOMBO_DEF_nxg.an4', 6, False),
    'hit':         ('Takehit1_DEF_nxg.an4', 0, False),
    'knockdown':   ('KNOCKEDDOWN_DEF_nxg.an4', 0, False),
    'getup':       ('GETUP_DEF_nxg.an4', 0, False),
    'slam':        ('SLAMFULL_DEF_nxg.an4', 0, False),
    'slamfall':    ('SLAM_FALL_DEF_nxg.an4', 0, True),
    'slamland':    ('SLAMLAND_DEF_nxg.an4', 0, False),
    'thunderclap': ('ThunderClap_DEF_nxg.an4', 0, False),
    'floorsmash':  ('FLOORSMASH_DEF_nxg.an4', 0, False),
    'turn180':     ('Run_Turn180_Anticlockwise_DEF_nxg.an4', 0, False),
}
VENOM_OWN = {'SLAMFULL_DEF_nxg.an4', 'ThunderClap_DEF_nxg.an4', 'Run_Turn180_Anticlockwise_DEF_nxg.an4'}


def euler_zyx_to_quat(x, y, z):
    """three.js Euler(x, y, z, 'ZYX') -> quaternion (x, y, z, w)."""
    c1, c2, c3 = math.cos(x / 2), math.cos(y / 2), math.cos(z / 2)
    s1, s2, s3 = math.sin(x / 2), math.sin(y / 2), math.sin(z / 2)
    return (s1 * c2 * c3 - c1 * s2 * s3, c1 * s2 * c3 + s1 * c2 * s3,
            c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3)


def pack(vals, scale):
    ints = [max(-32767, min(32767, round(v * scale))) for v in vals]
    return base64.b64encode(struct.pack(f'<{len(ints)}h', *ints)).decode()


def clip_frames(clip):
    """A record's frames use the take's global numbering: only [first_frame, frame_count) are its own;
    the decoder holds key 0 before that, so drop the frozen lead-in."""
    return clip['samples'][max(0, int(round(clip['first_frame']))):] or clip['samples'][-1:]


def convert(clip):
    S = clip_frames(clip)
    J = len(S[0])
    quats = []                                   # [frame][joint] -> quat
    for s in S:
        quats.append([euler_zyx_to_quat(-j[3], j[4], -j[5]) for j in s])
    for j in range(J):                           # keep each joint on one hemisphere frame to frame
        for f in range(1, len(quats)):
            a, b = quats[f - 1][j], quats[f][j]
            if sum(p * q for p, q in zip(a, b)) < 0:
                quats[f][j] = tuple(-v for v in b)
    moving, const = [], {}
    for j in range(J):
        q0 = quats[0][j]
        if all(max(abs(p - q) for p, q in zip(quats[f][j], q0)) < 2e-4 for f in range(len(quats))):
            const[j] = [round(v, 5) for v in q0]
        else:
            moving.append(j)
    q = pack([v for f in range(len(quats)) for j in moving for v in quats[f][j]], 32767)
    hips = pack([v for s in S for v in (-s[1][0] - CHAR_REST[0], s[1][1] - CHAR_REST[1], -s[1][2] - CHAR_REST[2])], 10000)
    return dict(n=len(S), moving=moving, const=const, q=q, hips=hips)


def glb_joints(path):
    d = open(path, 'rb').read()
    n = struct.unpack_from('<I', d, 12)[0]
    j = json.loads(d[20:20 + n])
    return [j['nodes'][i]['name'] for i in j['skins'][0]['joints']]


def main(hulk_dir, venom_dir, out, rig):
    names = glb_joints(rig)
    data = dict(fps=30, joints=names, source='LEGO Marvel Super Heroes big-fig AN4 (Hulk set; Venom own where present)', clips={})
    for key, (fname, idx, loop) in CLIPS.items():
        src = os.path.join(venom_dir if fname in VENOM_OWN else hulk_dir, fname)
        clip = animation(src, actor_name='auto70', clip_index=idx)
        c = convert(clip); c['loop'] = loop; c['src'] = clip['name']
        data['clips'][key] = c
        print(f"{key:12s} {clip['name']:28s} {c['n']:4d} frames, {len(c['moving'])} moving joints")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    print('wrote', out, os.path.getsize(out), 'bytes')


if __name__ == '__main__':
    main(*sys.argv[1:5])
