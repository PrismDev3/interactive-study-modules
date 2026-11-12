"""FUSE1.00 entry unpacker, ported from ARM9 0x020DF4EC (LEGO Marvel DS).

Verified byte-for-byte against the game's own code via arm_emu.
"""
import csv
import os
import struct

HERE = os.path.dirname(os.path.abspath(__file__))
ENTRIES = os.path.join(HERE, 'fuse_entries')

_index = None


def unpack(src, verbose=False):
    out = bytearray()
    p = 0
    n = len(src)
    while p < n:
        c = src[p]
        p += 1
        if not (c & 0x80):
            b = src[p]
            p += 1
            lit = (c & 0x0C) >> 2
            dist = ((c & 3) << 8) | b
            ln = ((c & 0x70) >> 4) + 3
        elif not (c & 0x40):
            b0 = src[p]
            b1 = src[p + 1]
            p += 2
            lit = b0 >> 6
            dist = ((b0 & 0x3F) << 8) | b1
            ln = (c & 0x3F) + 4
        elif not (c & 0x20):
            b0 = src[p]
            b1 = src[p + 1]
            b2 = src[p + 2]
            p += 3
            lit = (c & 0x18) >> 3
            dist = ((c & 1) << 16) | (b0 << 8) | b1
            ln = b2 + (((c & 6) >> 1) << 8) + 5
        else:
            cnt = ((c & 0x1F) << 2) + 4
            if cnt > 0x70:
                out += src[p:p + (c & 3)]
                break
            out += src[p:p + cnt]
            p += cnt
            if verbose:
                print('  %04X D lit-run %d -> %d' % (p, cnt, len(out)))
            continue
        out += src[p:p + lit]
        p += lit
        if verbose:
            print('  %04X ctrl %02X lit %d dist %d len %d -> %d' %
                  (p, c, lit, dist, ln, len(out)))
        s = len(out) - 1 - dist
        if s < 0:
            raise ValueError('bad distance %d at out %d' % (dist, len(out)))
        for i in range(ln):
            out.append(out[s + i])
    return bytes(out)


def flags_of(archive, hashv):
    global _index
    if _index is None:
        _index = {}
        with open(os.path.join(ENTRIES, 'index.csv'), newline='') as f:
            for row in csv.DictReader(f):
                _index[(row['archive'].split('.')[0], int(row['hash'], 16))] = \
                    int(row['flags_and_size'], 16)
    return _index[(archive, hashv)]


def load_entry(archive, hashv):
    """Return (raw_entry_bytes, flags, unpacked_bytes)."""
    with open(os.path.join(ENTRIES, archive, '%08X.bin' % hashv), 'rb') as f:
        raw = f.read()
    flags = flags_of(archive, hashv)
    if (flags & 3) == 1:
        # Entries over 32 KB are a chain of independently packed blocks: [u32 clen][stream]...
        out, p = bytearray(), 0
        while p + 4 <= len(raw):
            clen = struct.unpack_from('<I', raw, p)[0]
            if clen == 0 or p + 4 + clen > len(raw):
                break
            out += unpack(raw[p + 4:p + 4 + clen])
            p += 4 + clen
        return raw, flags, bytes(out)
    return raw, flags, raw


if __name__ == '__main__':
    import sys
    for f in sys.argv[1:]:
        arc = os.path.basename(os.path.dirname(f))
        h = int(os.path.splitext(os.path.basename(f))[0], 16)
        raw, flags, out = load_entry(arc, h)
        print('%s flags=%08X comp=%d unpacked=%d/%d' %
              (f, flags, len(raw), len(out), flags >> 5))
        print('  ', out[:64].hex(' '))
