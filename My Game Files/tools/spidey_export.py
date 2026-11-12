"""Decode Spider-Man's head texture (DS 4x4-compressed, type 0x800) and build a textured OBJ."""
import os
import struct

import numpy as np
from PIL import Image

import fuse_unpack as F
import ui_screens as U

TEX = "models/textures/head_spidermandiff64_c4x4.btga"


def c555(v):
    return np.array([(v & 31) << 3, ((v >> 5) & 31) << 3, ((v >> 10) & 31) << 3, 255], np.int32)


def decode_4x4(texels, idx, pal, w, h):
    img = np.zeros((h, w, 4), np.uint8)
    for b in range((w // 4) * (h // 4)):
        bx, by = (b % (w // 4)) * 4, (b // (w // 4)) * 4
        word = struct.unpack_from("<I", texels, b * 4)[0]
        ix = struct.unpack_from("<H", idx, b * 2)[0]
        off, mode = (ix & 0x3FFF) * 2, ix >> 14
        c = [c555(pal[(off + k) % len(pal)]) for k in range(4)]
        if mode == 0:
            cols = [c[0], c[1], c[2], np.zeros(4, np.int32)]
        elif mode == 1:
            cols = [c[0], c[1], (c[0] + c[1]) // 2, np.zeros(4, np.int32)]
        elif mode == 2:
            cols = c
        else:
            cols = [c[0], c[1], (c[0] * 5 + c[1] * 3) // 8, (c[0] * 3 + c[1] * 5) // 8]
        for y in range(4):
            for x in range(4):
                img[by + y, bx + x] = cols[(word >> (y * 8 + x * 2)) & 3]
    return img


def head_texture(dest):
    t = F.load_entry("LEGO_M1_DS", U.nhash(TEX))[2]
    tex_n, pal_n, idx_n = struct.unpack_from("<I", t, 0x14)[0], struct.unpack_from("<I", t, 0x1C)[0], struct.unpack_from("<I", t, 0x24)[0]
    data = len(t) - tex_n - pal_n - idx_n
    texels = t[data:data + tex_n]
    side = int((tex_n // 4 * 16) ** 0.5)
    best = None
    # Chunk order isn't certain; pick the order whose block indices stay inside the palette.
    for order in (("pal", "idx"), ("idx", "pal")):
        p = data + tex_n
        parts = {}
        for name in order:
            n = pal_n if name == "pal" else idx_n
            parts[name] = t[p:p + n]
            p += n
        ix = np.frombuffer(parts["idx"], "<u2")
        pal = np.frombuffer(parts["pal"][:len(parts["pal"]) // 2 * 2], "<u2")
        bad = int(((ix & 0x3FFF) * 2 + 4 > len(pal)).sum())
        if best is None or bad < best[0]:
            best = (bad, order, parts["idx"], pal)
    bad, order, idx, pal = best
    img = decode_4x4(texels, idx, pal, side, side)
    Image.fromarray(img, "RGBA").save(dest)
    print(f"head texture {side}x{side}, chunk order {order}, out-of-range blocks {bad} -> {dest}")


def read_obj(path):
    v, vt, f = [], [], []
    vn = read_obj.vn = []
    for line in open(path):
        p = line.split()
        if not p:
            continue
        if p[0] == "vn":
            vn.append(p[1:4])
        if p[0] == "v":
            v.append([float(x) for x in p[1:4]])
        elif p[0] == "vt":
            vt.append([float(x) for x in p[1:3]])
        elif p[0] == "f":
            f.append([int(x.split("/")[0]) for x in p[1:]])
    return v, vt, f


def combined(dest):
    hv, ht, hf = read_obj("models/obj/Char_Head_Spiderman.obj")
    hn = read_obj.vn
    bv, bt, bf = read_obj("models/obj/char_minifig.obj")
    bn = read_obj.vn
    neck = max(y for _, y, _ in bv)
    with open(dest, "w") as o:
        o.write("mtllib SpiderMan.mtl\no Body\nusemtl body\n")
        for x, y, z in bv:
            o.write(f"v {x:.5f} {y:.5f} {z:.5f}\n")
        for u, w in bt:
            o.write(f"vt {u:.5f} {w:.5f}\n")
        for n3 in bn:
            o.write("vn " + " ".join(n3) + "\n")
        for fc in bf:
            o.write("f " + " ".join(f"{i}/{i}/{i}" for i in fc) + "\n")
        o.write("o Head\nusemtl head\n")
        n = len(bv)
        for x, y, z in hv:
            o.write(f"v {x:.5f} {y + neck - 0.05:.5f} {z:.5f}\n")
        for u, w in ht:
            o.write(f"vt {u:.5f} {w:.5f}\n")
        for n3 in hn:
            o.write("vn " + " ".join(n3) + "\n")
        for fc in hf:
            o.write("f " + " ".join(f"{i + n}/{i + n}/{i + n}" for i in fc) + "\n")
    with open(os.path.join(os.path.dirname(dest), "SpiderMan.mtl"), "w") as m:
        m.write("newmtl head\nKd 1 1 1\nmap_Kd SpiderMan_head.png\n\nnewmtl body\nKd 0.8 0.1 0.1\n")
    print(f"combined model -> {dest}")


if __name__ == "__main__":
    os.makedirs("models/obj", exist_ok=True)
    head_texture("models/obj/SpiderMan_head.png")
    combined("models/obj/SpiderMan.obj")
