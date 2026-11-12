"""Find Nintendo DS GX display lists inside a model file and export them as OBJ.

Usage: python gx2obj.py <model file> [<model file> ...]   -> writes models/obj/<name>.obj
"""
import os
import struct
import sys

PARAMS = {0x00: 0, 0x10: 1, 0x11: 0, 0x12: 1, 0x13: 1, 0x14: 1, 0x15: 0, 0x16: 16, 0x17: 12,
          0x18: 16, 0x19: 12, 0x1A: 9, 0x1B: 3, 0x1C: 3, 0x20: 1, 0x21: 1, 0x22: 1, 0x23: 2,
          0x24: 1, 0x25: 1, 0x26: 1, 0x27: 1, 0x28: 1, 0x29: 1, 0x2A: 1, 0x2B: 1, 0x30: 1,
          0x31: 1, 0x32: 1, 0x33: 1, 0x34: 32, 0x40: 1, 0x41: 0}
VTX = {0x23, 0x24, 0x25, 0x26, 0x27, 0x28}


def s(v, bits):
    v &= (1 << bits) - 1
    return v - (1 << bits) if v >> (bits - 1) else v


def parse(data, start):
    """Parse packed GX commands from start; return (end, strips) or None."""
    p, pos, uv, nrm = start, [0.0, 0.0, 0.0], (0.0, 0.0), (0.0, 1.0, 0.0)
    prims, cur, mode, tex_wh, nvtx = [], None, 0, (64, 64), 0
    while p + 4 <= len(data):
        ops = data[p:p + 4]
        if any(o not in PARAMS for o in ops) or ops == b"\0\0\0\0":
            break
        q = p + 4
        need = sum(PARAMS[o] for o in ops) * 4
        if q + need > len(data):
            break
        for o in ops:
            args = struct.unpack_from(f"<{PARAMS[o]}I", data, q)
            q += PARAMS[o] * 4
            if o == 0x40:
                mode = args[0] & 3
                cur = []
                prims.append((mode, cur))
            elif o == 0x21:
                a = args[0]
                nrm = (s(a, 10) / 512, s(a >> 10, 10) / 512, s(a >> 20, 10) / 512)
            elif o == 0x22:
                uv = (s(args[0], 16) / 16 / tex_wh[0], s(args[0] >> 16, 16) / 16 / tex_wh[1])
            elif o == 0x2A:
                tex_wh = (8 << ((args[0] >> 20) & 7), 8 << ((args[0] >> 23) & 7))
            elif o in VTX:
                a = args[0]
                if o == 0x23:
                    pos = [s(a, 16) / 4096, s(a >> 16, 16) / 4096, s(args[1], 16) / 4096]
                elif o == 0x24:
                    pos = [s(a, 10) / 64, s(a >> 10, 10) / 64, s(a >> 20, 10) / 64]
                elif o == 0x25:
                    pos[0], pos[1] = s(a, 16) / 4096, s(a >> 16, 16) / 4096
                elif o == 0x26:
                    pos[0], pos[2] = s(a, 16) / 4096, s(a >> 16, 16) / 4096
                elif o == 0x27:
                    pos[1], pos[2] = s(a, 16) / 4096, s(a >> 16, 16) / 4096
                else:
                    pos = [pos[0] + s(a, 10) / 512, pos[1] + s(a >> 10, 10) / 512, pos[2] + s(a >> 20, 10) / 512]
                if cur is None:
                    return None
                cur.append((tuple(pos), uv, nrm))
                nvtx += 1
        p = q
    return (p, prims) if nvtx >= 3 else None


def faces(mode, vs):
    idx = range(len(vs))
    if mode == 0:
        return [tuple(idx[i:i + 3]) for i in range(0, len(vs) - 2, 3)]
    if mode == 1:
        return [tuple(idx[i:i + 4]) for i in range(0, len(vs) - 3, 4)]
    if mode == 2:
        return [(i, i + 1, i + 2) if i % 2 == 0 else (i + 1, i, i + 2) for i in range(len(vs) - 2)]
    return [(i, i + 1, i + 3, i + 2) for i in range(0, len(vs) - 3, 2)]


def convert(path):
    data = open(path, "rb").read()
    runs, p = [], 0
    while p + 4 <= len(data):
        r = parse(data, p)
        if r and r[1]:
            runs.append((p, r[1]))
            p = r[0]
        else:
            p += 4
    out = os.path.join("models", "obj", os.path.splitext(os.path.basename(path))[0] + ".obj")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    nv = nf = 0
    with open(out, "w") as f:
        for ri, (off, prims) in enumerate(runs):
            f.write(f"o list_{ri}_0x{off:X}\n")
            for mode, vs in prims:
                for (x, y, z), (u, v), (nx, ny, nz) in vs:
                    f.write(f"v {x:.5f} {y:.5f} {z:.5f}\nvt {u:.5f} {1 - v:.5f}\nvn {nx:.4f} {ny:.4f} {nz:.4f}\n")
                for fc in faces(mode, vs):
                    f.write("f " + " ".join(f"{nv + i + 1}/{nv + i + 1}/{nv + i + 1}" for i in fc) + "\n")
                    nf += 1
                nv += len(vs)
    print(f"{path}: {len(runs)} display lists, {nv} verts, {nf} faces -> {out}")


if __name__ == "__main__":
    for a in sys.argv[1:]:
        convert(a)
