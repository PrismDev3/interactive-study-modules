import os
import struct
import zlib

import numpy as np
from PIL import Image

import fuse_unpack as F


def nhash(p):
    return (~zlib.crc32(p.lower().encode())) & 0xFFFFFFFF


def payload_of(out):
    size = struct.unpack_from('<I', out, 0x14)[0]
    off = len(out) - size
    if not (12 <= off <= 128) or size % 2:
        # fall back: a power-of-two payload after a small header
        off, size = 52, len(out) - 52
    return off, size


def dims_for(px, hdr_h):
    if px % (64 * hdr_h) == 0:
        return 64, px // 64
    side = int(px ** 0.5)
    if side * side == px:
        return side, side
    for w in range(64, 7, -2):
        if px % w == 0:
            return w, px // w
    return px, 1


def decode(out):
    off, size = payload_of(out)
    data = out[off:off + size]
    px = len(data) // 2
    hdr_h = struct.unpack_from('<I', out, 4)[0] or 16
    w, h = dims_for(px, hdr_h)
    a = np.frombuffer(data[:w * h * 2], dtype='<u2').reshape(h, w)
    r = ((a & 0x1F) << 3).astype(np.uint8)
    g = (((a >> 5) & 0x1F) << 3).astype(np.uint8)
    b = (((a >> 10) & 0x1F) << 3).astype(np.uint8)
    al = np.where(a & 0x8000, 255, 0).astype(np.uint8)
    return Image.fromarray(np.dstack([r, g, b, al]), 'RGBA'), (off, size, w, h)


def named_paths():
    paths = []
    for root, _, files in os.walk('fuse_named/LEGO_M1_DS'):
        for f in files:
            if f.lower().endswith('.btga'):
                p = os.path.relpath(os.path.join(root, f), 'fuse_named/LEGO_M1_DS')
                paths.append(p.replace('\\', '/'))
    for extra in ('sprites/portraits/64portraits/SpiderMan_LEFT.btga',
                  'sprites/portraits/64portraits/SpiderMan_LEFT_Grey.btga'):
        if extra.lower() not in [p.lower() for p in paths]:
            paths.append(extra)
    return sorted(set(paths))


if __name__ == '__main__':
    os.makedirs('png', exist_ok=True)
    for p in named_paths():
        h = nhash(p)
        try:
            raw, flags, out = F.load_entry('LEGO_M1_DS', h)
        except FileNotFoundError:
            print('missing', p)
            continue
        img, info = decode(out)
        name = os.path.basename(p).replace('.btga', '.png')
        sub = p.split('/')[-2] if '/' in p else ''
        dest = os.path.join('png', ('%s_%s' % (sub, name)) if sub else name)
        img.save(dest)
        print('%-46s %-40s %5d bytes off=%3d size=%5d %dx%d' %
              (p.split('/')[-1], dest, len(out), info[0], info[1], info[2], info[3]))
