#!/usr/bin/env python3
"""Split FUSE1.00 archives (.fib) into their entries using the trailing TOC.

Layout (verified on all 47 archives in this ROM):
  0x00  "FUSE1.00"
  0x08  u32 entry_count
  0x0C  u32 zero
  0x10  u32 toc_offset            (toc_offset + entry_count*12 == file size)
  0x14  u32 unknown
  toc:  entry_count x { u32 name_hash (sorted), u32 data_offset, u32 flags_and_size }
Entry length is taken as the gap to the next entry's offset (or to the TOC).
"""
import struct
import sys
from collections import Counter
from pathlib import Path


def split(path: Path, out_root: Path) -> list[tuple]:
    d = path.read_bytes()
    count, _, toc, unk = struct.unpack_from("<IIII", d, 8)
    entries = [struct.unpack_from("<III", d, toc + i * 12) for i in range(count)]
    by_off = sorted(entries, key=lambda e: e[1])
    out_dir = out_root / path.stem
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for i, (h, off, f3) in enumerate(by_off):
        end = by_off[i + 1][1] if i + 1 < len(by_off) else toc
        blob = d[off:end]
        (out_dir / f"{h:08X}.bin").write_bytes(blob)
        rows.append((path.name, h, off, len(blob), f3, blob[:8]))
    return rows


def main():
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "My Main Game_nitrofs")
    out_root = src.parent / "fuse_entries"
    all_rows = []
    for fib in sorted(src.glob("*.fib")):
        rows = split(fib, out_root)
        all_rows += rows
        print(f"{fib.name:22} {len(rows):5d} entries")
    with open(out_root / "index.csv", "w") as f:
        f.write("archive,hash,offset,length,flags_and_size,head\n")
        for a, h, off, n, f3, head in all_rows:
            f.write(f"{a},{h:08X},0x{off:X},{n},0x{f3:08X},{head.hex()}\n")
    print(f"\n{len(all_rows)} entries total -> {out_root}")
    print("f3 low-byte values:", Counter(r[4] & 0xFF for r in all_rows).most_common(6))
    print("most common entry heads:")
    for k, v in Counter(r[5][:4] for r in all_rows).most_common(8):
        print(f"  {k.hex(' ')}  x{v}")


if __name__ == "__main__":
    main()
