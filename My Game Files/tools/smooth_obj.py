"""Bake smooth shading into models/obj/SpiderMan.obj (no Blender script needed).

Merges duplicate vertices, then gives every face corner the average normal of the
neighbouring faces within SHARP_DEG of it, so curved parts shade smoothly while
LEGO edges (~90 deg) stay crisp. Also writes 16x nearest-upscaled textures and an
MTL with fresh material names so Blender can't reuse old, blurry materials.
"""
import math
from collections import defaultdict

from PIL import Image

D = "models/obj/"
SHARP_DEG = 60
COS = math.cos(math.radians(SHARP_DEG))
TAG = "spidey_v3"


def load(path):
    v, vt, vn, objs = [], [], [], []
    cur = None
    for line in open(path):
        p = line.split()
        if not p:
            continue
        if p[0] == "v":
            v.append(tuple(map(float, p[1:4])))
        elif p[0] == "vt":
            vt.append(tuple(map(float, p[1:3])))
        elif p[0] == "vn":
            vn.append(tuple(map(float, p[1:4])))
        elif p[0] == "o":
            cur = {"name": p[1], "mtl": None, "faces": []}
            objs.append(cur)
        elif p[0] == "usemtl":
            cur["mtl"] = p[1]
        elif p[0] == "f":
            cur["faces"].append([tuple(int(x) - 1 for x in c.split("/")) for c in p[1:]])
    return v, vt, vn, objs


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def norm(a):
    l = math.sqrt(dot(a, a))
    return (a[0] / l, a[1] / l, a[2] / l) if l > 1e-12 else (0.0, 0.0, 0.0)


def newell(pts):
    n = [0.0, 0.0, 0.0]
    for i, a in enumerate(pts):
        b = pts[(i + 1) % len(pts)]
        n[0] += (a[1] - b[1]) * (a[2] + b[2])
        n[1] += (a[2] - b[2]) * (a[0] + b[0])
        n[2] += (a[0] - b[0]) * (a[1] + b[1])
    return tuple(n)


def main():
    v, vt, vn, objs = load(D + "SpiderMan.obj")
    # Body textures are 64x32 but the GX list has no size, so gx2obj scaled V for 64x64;
    # stretch the body's V back over the full texture height.
    body_vt = {c[1] for ob in objs if ob["name"].startswith("Body") for f in ob["faces"] for c in f}
    for i in body_vt:
        vt[i] = (vt[i][0], 2 * vt[i][1] - 1)
    key =lambda p: (round(p[0], 4), round(p[1], 4), round(p[2], 4))
    pos_index, pos_list = {}, []
    remap = []
    for p in v:
        k = key(p)
        if k not in pos_index:
            pos_index[k] = len(pos_list)
            pos_list.append(p)
        remap.append(pos_index[k])

    out_vn, vn_index = [], {}

    def add_vn(n):
        k = (round(n[0], 4), round(n[1], 4), round(n[2], 4))
        if k not in vn_index:
            vn_index[k] = len(out_vn)
            out_vn.append(k)
        return vn_index[k]

    written = []
    for ob in objs:
        faces = []
        for f in ob["faces"]:
            pids = [remap[c[0]] for c in f]
            if len(set(pids)) < 3:
                continue  # degenerate (collapsed) face
            n = newell([pos_list[i] for i in pids])
            game_n = [vn[c[2]] for c in f if len(c) > 2]
            if game_n and dot(n, tuple(sum(x) for x in zip(*game_n))) < 0:
                n = (-n[0], -n[1], -n[2])
            faces.append((f, pids, n, norm(n)))
        by_pos = defaultdict(list)
        for fi, (_, pids, _, _) in enumerate(faces):
            for pid in set(pids):
                by_pos[pid].append(fi)
        lines = []
        for f, pids, n, nu in faces:
            corners = []
            for c, pid in zip(f, pids):
                acc = [0.0, 0.0, 0.0]
                for fj in by_pos[pid]:
                    if dot(faces[fj][3], nu) >= COS:
                        w = faces[fj][2]
                        acc = [acc[0] + w[0], acc[1] + w[1], acc[2] + w[2]]
                ni = add_vn(norm(tuple(acc)) if any(acc) else nu)
                corners.append(f"{pid + 1}/{c[1] + 1}/{ni + 1}")
            lines.append("f " + " ".join(corners))
        written.append((ob["name"], ob["mtl"], lines))

    with open(D + "SpiderMan.obj", "w") as o:
        o.write("mtllib SpiderMan.mtl\n")
        for p in pos_list:
            o.write(f"v {p[0]:.5f} {p[1]:.5f} {p[2]:.5f}\n")
        for t in vt:
            o.write(f"vt {t[0]:.5f} {t[1]:.5f}\n")
        for n in out_vn:
            o.write(f"vn {n[0]:.4f} {n[1]:.4f} {n[2]:.4f}\n")
        for name, mtl, lines in written:
            o.write(f"o {name}\nusemtl {TAG}_{mtl}\ns 1\n" + "\n".join(lines) + "\n")

    with open(D + "SpiderMan.mtl", "w") as m:
        for part in ("head", "upper", "lower"):
            src = Image.open(f"{D}SpiderMan_{part}.png")
            big = src.resize((src.width * 16, src.height * 16), Image.NEAREST)
            big.save(f"{D}{TAG}_{part}.png")
            m.write(f"newmtl {TAG}_{part}\nKd 1 1 1\nKs 0 0 0\nmap_Kd {TAG}_{part}.png\n\n")
    print(f"verts {len(v)} -> {len(pos_list)}, normals {len(out_vn)}, "
          f"faces {sum(len(l) for _, _, l in written)}, objects {[w[0] for w in written]}")


if __name__ == "__main__":
    main()
