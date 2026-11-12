"""Export LEGO Marvel minifig clips (63-joint rig: Spider-Man's own set, web swing, wall climb) to
assets/anims/minifig.json as RETARGETABLE model-space deltas.

For every joint b and frame t:  D_b(t) = W_b(t) * W_b(bind)^-1, with W the joint's orientation in
the figure's model space (GLB frame; Character joint taken as identity, root motion dropped).
Any rig with the same joint names can apply them:
    skinned rig : W'_b(t) = D_b(t) * W'_b(bind);  local_b = W'_parent(t)^-1 * W'_b(t)
    part rig    : part.quaternion = D_parentPart^-1 * D_part   (parts rest at identity)
Frame conversions as in export_bigfig.py: rotation Euler(-rx, ry, -rz, 'ZYX'), translation (-tx, ty, -tz).
Hips: delta of the Hips joint's model-space position from bind, in GLB units, plus `hipH` (bind height).

Usage: python -I export_minifig.py <unpacked root> <out json> <rig glb>
"""
import sys, os, json, struct
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from decode_an4 import animation
from export_bigfig import euler_zyx_to_quat, pack, clip_frames

# key: (subdir, file, clip index, loops)
CLIPS = {
    'idle':        ('spiderman_default', 'IDLE1_DEF_nxg.an4', 0, True),
    'idle2':       ('spiderman_default', 'idle2_DEF_nxg.an4', 0, False),
    'idle3':       ('spiderman_default', 'IDLE3_DEF_nxg.an4', 0, False),
    'walk':        ('spiderman_default', 'Walk_DEF_nxg.an4', 0, True),
    'run':         ('spiderman_default', 'Run_DEF_nxg.an4', 0, True),
    'jump':        ('spiderman_default', 'JUMPANDLAND_DEF_nxg.an4', 0, False),
    'land':        ('spiderman_default', 'JUMPANDLAND_DEF_nxg.an4', 1, False),
    'fall':        ('spiderman_default', 'Fall_DEF_nxg.an4', 0, True),
    'flip':        ('spiderman_default', 'Flip_DEF_nxg.an4', 0, False),
    'flipland':    ('spiderman_default', 'FLIPLAND_DEF_nxg.an4', 0, False),
    'lunge':       ('spiderman_default', 'Lunge_DEF_nxg.an4', 0, False),
    'zip':         ('spiderman_default', 'WEBZIP_JUMP_DEF_nxg.an4', 0, False),
    'zipidle':     ('spiderman_default', 'WEBZIP_IDLE_DEF_nxg.an4', 0, True),
    'swingL':      ('ability_webswing_hub', 'WEBSWING_HUB_DEF_nxg.an4', 0, False),
    'swingL2':     ('ability_webswing_hub', 'WEBSWING_HUB_DEF_nxg.an4', 1, False),
    'swingR':      ('ability_webswing_hub', 'WEBSWING_HUB_DEF_nxg.an4', 2, False),
    'swingR2':     ('ability_webswing_hub', 'WEBSWING_HUB_DEF_nxg.an4', 3, False),
    'swingUpL':    ('ability_webswing_hub', 'WEBSWING_HUB_UP_DEF_nxg.an4', 0, False),
    'swingUpR':    ('ability_webswing_hub', 'WEBSWING_HUB_UP_DEF_nxg.an4', 2, False),
    'fallswing':   ('ability_webswing_hub', 'WEBSWING_HUB_FALLSWING_DEF_nxg.an4', 0, False),
    'swingjump':   ('ability_webswing', 'WEBSWING_LEVEL_JUMP_DEF_nxg.an4', 0, False),
    'shootL':      ('ability_webswing', 'WEBSWING_SHOOT_LEFT_DEF_nxg.an4', 0, False),
    'shootR':      ('ability_webswing', 'WEBSWING_SHOOT_RIGHT_DEF_nxg.an4', 0, False),
    'climb':       ('ability_climbwall_wolverine', 'ClimbWall_Walk_DEF_nxg.an4', 0, True),
    'climbidle':   ('ability_climbwall_wolverine', 'ClimbWall_Idle_DEF_nxg.an4', 0, True),
    'climbjump':   ('ability_climbwall_wolverine', 'CLIMBWALL_JUMP_DEF_nxg.an4', 0, False),
}


def qmul(a, b):
    x1, y1, z1, w1 = a; x2, y2, z2, w2 = b
    return (w1*x2 + x1*w2 + y1*z2 - z1*y2, w1*y2 - x1*z2 + y1*w2 + z1*x2,
            w1*z2 + x1*y2 - y1*x2 + z1*w2, w1*w2 - x1*x2 - y1*y2 - z1*z2)

def qinv(q): return (-q[0], -q[1], -q[2], q[3])

def qrot(q, v):
    p = qmul(qmul(q, (v[0], v[1], v[2], 0.0)), qinv(q)); return p[:3]


def rig(path):
    d = open(path, 'rb').read()
    n = struct.unpack_from('<I', d, 12)[0]
    j = json.loads(d[20:20 + n])
    sk = j['skins'][0]['joints']
    nodes = j['nodes']
    idx = {ni: k for k, ni in enumerate(sk)}
    parent = [-1] * len(sk)
    for k, ni in enumerate(sk):
        for c in nodes[ni].get('children', []):
            if c in idx: parent[idx[c]] = k
    names = [nodes[ni]['name'] for ni in sk]
    loc = [tuple(nodes[ni].get('rotation', [0, 0, 0, 1])) for ni in sk]
    pos = [tuple(nodes[ni].get('translation', [0, 0, 0])) for ni in sk]
    return names, parent, loc, pos


def world(parent, local_q, local_t):
    """Model-space orientation and position per joint; joint 0 (Character) is the identity origin."""
    W, P = [None] * len(parent), [None] * len(parent)
    for k in range(len(parent)):
        if parent[k] < 0:
            W[k], P[k] = (0.0, 0.0, 0.0, 1.0), (0.0, 0.0, 0.0)
        else:
            pw, pp = W[parent[k]], P[parent[k]]
            W[k] = qmul(pw, local_q[k])
            t = qrot(pw, local_t[k]); P[k] = (pp[0] + t[0], pp[1] + t[1], pp[2] + t[2])
    return W, P


def main(root, out, glb):
    names, parent, bind_q, bind_t = rig(glb)
    # Bind: Character's own translation counts as part of the hip height (it carries it in the GLB)
    bt = list(bind_t); bt[0] = (0.0, 0.0, 0.0)
    Wb, Pb = world(parent, bind_q, bt)
    Wb_inv = [qinv(q) for q in Wb]
    hipH = bind_t[0][1] + Pb[1][1]
    data = dict(fps=30, joints=names, parents=parent, hipH=hipH, clips={},
                source='LEGO Marvel Super Heroes minifig AN4 (Spider-Man set, web swing, Wolverine wall climb)')
    for key, (sub, fname, ci, loop) in CLIPS.items():
        clip = animation(os.path.join(root, sub, fname), actor_name='auto', clip_index=ci)
        S = clip_frames(clip)
        D, H, prev = [], [], None
        for s in S:
            lq = [euler_zyx_to_quat(-j[3], j[4], -j[5]) for j in s]
            lq[0] = (0.0, 0.0, 0.0, 1.0)                       # no root rotation / motion
            lt = [(-j[0], j[1], -j[2]) for j in s]; lt[0] = (0.0, 0.0, 0.0)
            W, P = world(parent, lq, lt)
            d = [qmul(W[k], Wb_inv[k]) for k in range(len(W))]
            if prev:                                           # one hemisphere frame to frame
                d = [q if sum(a * b for a, b in zip(q, p)) >= 0 else tuple(-v for v in q) for q, p in zip(d, prev)]
            prev = d
            D.extend(v for q in d for v in q)
            # Clip hips are absolute (its Character sits at 0); bind hips = Character + Hips offsets
            H.extend((P[1][0] - bind_t[0][0] - Pb[1][0], P[1][1] - hipH, P[1][2] - bind_t[0][2] - Pb[1][2]))
        data['clips'][key] = dict(n=len(S), loop=loop, src=clip['name'], d=pack(D, 32767), hips=pack(H, 10000))
        print(f"{key:10s} {clip['name']:26s} {len(S):4d} frames")
    with open(out, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    print('wrote', out, os.path.getsize(out), 'bytes; hipH', round(hipH, 4))


if __name__ == '__main__':
    main(*sys.argv[1:4])
