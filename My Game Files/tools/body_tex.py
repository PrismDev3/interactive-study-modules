"""Find Spider-Man's upper/lower body textures, decode them, and texture the body in SpiderMan.obj."""
import csv
import struct

import numpy as np
from PIL import Image

import fuse_unpack as F
import ui_screens as U
from spidey_export import decode_4x4

IDX = {}
for r in csv.DictReader(open("fuse_entries/index.csv")):
    IDX.setdefault(int(r["hash"], 16), r["archive"][:-4])


def find(part):
    for stem in (f"{part}_spidermandiff64", f"{part}_spidermandiff64_c4x4", f"{part}_spiderman_diff64", f"{part}_spidermandiff32"):
        for pre in ("models/textures/", "textures/", ""):
            h = U.nhash(f"{pre}{stem}.btga")
            if h in IDX:
                return stem, F.load_entry(IDX[h], h)[2]
    return None, None


def decode(t):
    typ, n1, n2 = struct.unpack_from("<I", t, 0)[0], struct.unpack_from("<I", t, 0x14)[0], struct.unpack_from("<I", t, 0x1C)[0]
    if typ == 0x800:
        n3 = struct.unpack_from("<I", t, 0x24)[0]
        d = len(t) - n1 - n2 - n3
        side = int((n1 // 4 * 16) ** 0.5)
        return decode_4x4(t[d:d + n1], t[d + n1 + n2:d + n1 + n2 + n3], np.frombuffer(t[d + n1:d + n1 + n2 // 2 * 2], "<u2"), side, side)
    if typ == 0x600:
        px = np.frombuffer(t[0x3C:0x3C + n1], np.uint8)
        pal = U.rgba(np.frombuffer(t[0x3C + n1:0x3C + n1 + n2], "<u2"))
        pal = np.concatenate([pal, np.zeros((256 - len(pal), 4), np.uint8)])
        w = int(len(px) ** 0.5) if int(len(px) ** 0.5) ** 2 == len(px) else 64
        return pal[px.reshape(-1, w)]
    px = np.frombuffer(t[len(t) - n1:], "<u2")
    w = int(len(px) ** 0.5) if int(len(px) ** 0.5) ** 2 == len(px) else 64
    return U.rgba(px).reshape(-1, w, 4)


done = {}
for part in ("upper", "lower"):
    stem, t = find(part)
    if t is None:
        print(part, "texture not found")
        continue
    img = decode(t)
    Image.fromarray(img, "RGBA").save(f"models/obj/SpiderMan_{part}.png")
    Image.fromarray(img, "RGBA").save(f"png/spiderman/{stem}.png")
    done[part] = True
    print(part, stem, "type", hex(struct.unpack_from("<I", t, 0)[0]), img.shape)

# Body lists: the one sitting higher is the torso/arms (upper), the other is the legs (lower).
lines = open("models/obj/char_minifig.obj").read().splitlines()
groups, cur = [], None
for ln in lines:
    if ln.startswith("o "):
        cur = []
        groups.append(cur)
    elif ln.startswith("v ") and cur is not None:
        cur.append(float(ln.split()[2]))
order = sorted(range(len(groups)), key=lambda i: -sum(groups[i]) / max(len(groups[i]), 1))
mat_for = {order[0]: "upper", order[-1]: "lower"} if len(order) > 1 else {0: "upper"}

src = open("models/obj/SpiderMan.obj").read().splitlines()
out, gi, in_body = [], -1, False
for ln in src:
    if ln == "o Body":
        in_body = True
        continue
    if ln == "usemtl body":
        continue
    if ln.startswith("o Head"):
        in_body = False
    if in_body and ln.startswith("f ") and gi < 0:
        gi = 0
    out.append(ln)
# Rebuild body faces per display list using face counts from char_minifig.obj.
counts, k = [], -1
for ln in lines:
    if ln.startswith("o "):
        counts.append(0)
    elif ln.startswith("f "):
        counts[-1] += 1
res, fi, gidx, seen = [], 0, 0, 0
for ln in out:
    if ln.startswith("f ") and gidx < len(counts) and not any(r.startswith("o Head") for r in res):
        if seen == 0:
            res.append(f"o Body_{mat_for.get(gidx, 'upper')}\nusemtl {mat_for.get(gidx, 'upper')}")
        res.append(ln)
        seen += 1
        if seen == counts[gidx]:
            gidx, seen = gidx + 1, 0
        continue
    res.append(ln)
open("models/obj/SpiderMan.obj", "w").write("\n".join(res) + "\n")
with open("models/obj/SpiderMan.mtl", "w") as m:
    m.write("newmtl head\nKd 1 1 1\nmap_Kd SpiderMan_head.png\n")
    for part in ("upper", "lower"):
        m.write(f"\nnewmtl {part}\nKd 1 1 1\n" + (f"map_Kd SpiderMan_{part}.png\n" if part in done else ""))
print("materials:", mat_for)
