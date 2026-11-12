"""TT Games *_an4_nxg.pak reader: header, entry table, Deflate_v1.0 blocks."""
import struct, zlib, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def read_pak(path):
    d = open(path, 'rb').read()
    magic, n = struct.unpack_from('<II', d, 0)
    out = []
    for i in range(n):
        no, off, size, comp, _z, chk, _z2 = struct.unpack_from('<7I', d, 0x18 + i * 0x1c)
        name = d[no:d.index(b'\0', no)].decode()
        out.append((name, off, size, comp, d[off:off + size]))
    return out

def inflate(blob):
    """Deflate_v1.0: 0x20-byte tag, u32 unpacked size, then raw Deflate whose block-type codes are
    remapped (stored 0 = dynamic, 1 = fixed, 2 = stored). Decoded by tinflate."""
    if not blob.startswith(b'Deflate_v1.0'):
        return blob
    from tinflate import inflate as tinf
    (usize,) = struct.unpack_from('<I', blob, 0x20)
    raw = tinf(blob[0x24:], (2, 1, 0, 3))
    if len(raw) != usize:
        raise ValueError(f'unpacked {len(raw)} != {usize}')
    return raw

if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    os.makedirs(dst, exist_ok=True)
    for name, off, size, comp, blob in read_pak(src):
        raw = inflate(blob)
        open(os.path.join(dst, name), 'wb').write(raw)
        print(name, comp, size, '->', len(raw))
