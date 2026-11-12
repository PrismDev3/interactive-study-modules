#!/usr/bin/env python3
"""Extract NitroFS files from an .nds ROM and decompress Nintendo LZ10/LZ11 where the header is valid."""
import struct
import sys
from pathlib import Path


def lz_decompress(data: bytes) -> bytes | None:
    if len(data) < 4 or data[0] not in (0x10, 0x11):
        return None
    tag = data[0]
    size = int.from_bytes(data[1:4], "little")
    pos = 4
    if size == 0 and len(data) >= 8:
        size = int.from_bytes(data[4:8], "little")
        pos = 8
    if size == 0 or size > 64 * 1024 * 1024:
        return None
    out = bytearray()
    try:
        while len(out) < size:
            flags = data[pos]; pos += 1
            for bit in range(8):
                if len(out) >= size:
                    break
                if not (flags & (0x80 >> bit)):
                    out.append(data[pos]); pos += 1
                    continue
                if tag == 0x10:
                    b1, b2 = data[pos], data[pos + 1]; pos += 2
                    length = (b1 >> 4) + 3
                    disp = (((b1 & 0xF) << 8) | b2) + 1
                else:
                    b1 = data[pos]
                    ind = b1 >> 4
                    if ind == 0:
                        b2, b3 = data[pos + 1], data[pos + 2]; pos += 3
                        length = (((b1 & 0xF) << 4) | (b2 >> 4)) + 0x11
                        disp = (((b2 & 0xF) << 8) | b3) + 1
                    elif ind == 1:
                        b2, b3, b4 = data[pos + 1], data[pos + 2], data[pos + 3]; pos += 4
                        length = (((b1 & 0xF) << 12) | (b2 << 4) | (b3 >> 4)) + 0x111
                        disp = (((b3 & 0xF) << 8) | b4) + 1
                    else:
                        b2 = data[pos + 1]; pos += 2
                        length = ind + 1
                        disp = (((b1 & 0xF) << 8) | b2) + 1
                if disp > len(out):
                    return None
                for _ in range(length):
                    out.append(out[-disp])
    except IndexError:
        return None
    return bytes(out[:size])


def walk_fnt(rom: bytes, fnt: int, dir_id: int, path: str, names: dict):
    entry = fnt + (dir_id & 0xFFF) * 8
    sub_off, first_id = struct.unpack_from("<IH", rom, entry)
    pos = fnt + sub_off
    file_id = first_id
    while True:
        t = rom[pos]; pos += 1
        if t == 0:
            break
        n = t & 0x7F
        name = rom[pos:pos + n].decode("latin-1"); pos += n
        if t & 0x80:
            sub_id = struct.unpack_from("<H", rom, pos)[0]; pos += 2
            walk_fnt(rom, fnt, sub_id, f"{path}{name}/", names)
        else:
            names[file_id] = path + name
            file_id += 1


def main():
    rom_path = Path(sys.argv[1] if len(sys.argv) > 1 else "My Main Game.nds")
    out = rom_path.parent / (rom_path.stem + "_nitrofs")
    rom = rom_path.read_bytes()
    fnt, fnt_size, fat, fat_size = struct.unpack_from("<IIII", rom, 0x40)
    names: dict[int, str] = {}
    walk_fnt(rom, fnt, 0xF000, "", names)
    n_files = fat_size // 8
    print(f"FNT=0x{fnt:X} FAT=0x{fat:X} files={n_files} named={len(names)}")
    tags = {}
    for fid in range(n_files):
        start, end = struct.unpack_from("<II", rom, fat + fid * 8)
        if end <= start or end > len(rom):
            continue
        data = rom[start:end]
        rel = names.get(fid, f"_unnamed/{fid:05d}.bin")
        dest = out / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        note = ""
        dec = lz_decompress(data)
        if dec is not None:
            dec_path = dest.with_name(dest.name + ".dec")
            dec_path.write_bytes(dec)
            note = f"  LZ{data[0]:02X} -> {len(dec)} bytes, dec head={dec[:8].hex(' ')}"
        head = data[:8]
        tags[head[:4]] = tags.get(head[:4], 0) + 1
        print(f"{fid:5d} 0x{start:08X} {len(data):9d}  {head.hex(' ')}  {rel}{note}")
    print("\nMost common 4-byte file heads:")
    for k, v in sorted(tags.items(), key=lambda kv: -kv[1])[:15]:
        print(f"  {k.hex(' ')}  {k!r:20}  x{v}")
    print(f"\nWrote files to {out}")


if __name__ == "__main__":
    main()
