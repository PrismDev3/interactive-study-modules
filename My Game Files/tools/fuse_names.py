#!/usr/bin/env python3
"""Recover FUSE entry names. Hash = ~crc32(lowercase path) (CRC-32 without the final XOR).

Candidates come from printable strings in the ARM9 binary and the archives, plus
format strings (%s, %d, %u, %02u, ...) expanded with those tokens and 0-99.
Writes fuse_entries/names.csv and copies matched entries to fuse_named/<archive>/<path>.
"""
import csv
import re
import shutil
import zlib
from pathlib import Path

G = Path(__file__).resolve().parent
ENTRIES = G / "fuse_entries"
OUT = G / "fuse_named"
FMT = re.compile(r"%0?\d*[sdu]")
PATHLIKE = re.compile(r"[A-Za-z0-9_\-]+(?:[/\\][A-Za-z0-9_\-. ]+)*\.[A-Za-z0-9]{2,8}")


def fuse_hash(name: str) -> int:
    return ~zlib.crc32(name.lower().encode("latin-1")) & 0xFFFFFFFF


def strings(data: bytes):
    for m in re.finditer(rb"[ -~]{3,}", data):
        for part in m.group().decode("latin-1").split("\x00"):
            if 3 <= len(part) <= 160:
                yield part


def main():
    rows = list(csv.DictReader(open(ENTRIES / "index.csv")))
    targets = {int(r["hash"], 16) for r in rows}
    sources = [G / "extracted" / "Code_Main_ARM9.bin", *sorted((G / "My Main Game_nitrofs").glob("*.fib"))]
    base = set()
    for p in sources:
        base.update(strings(p.read_bytes()))
    arm9 = set(strings(sources[0].read_bytes()))
    tokens = {t for t in arm9 if re.fullmatch(r"[A-Za-z0-9_\-]{2,40}", t)}
    tokens |= {str(i) for i in range(100)}

    found: dict[int, str] = {}

    def test(name: str):
        if not PATHLIKE.fullmatch(name):
            return
        h = fuse_hash(name)
        if h in targets and h not in found:
            found[h] = name

    for s in base:
        test(s)
        test(s.replace("\\", "/"))
    fmts = [s for s in arm9 if len(FMT.findall(s)) == 1 and ("/" in s or "\\" in s or "." in s)]
    nums = [str(i) for i in range(100)]
    for f in fmts:
        spec = FMT.search(f).group()
        pool = nums if spec[-1] in "du" else tokens
        for t in pool:
            val = f"{int(t):{spec[1:-1]}d}" if spec[-1] in "du" else t
            test(FMT.sub(val, f, count=1))

    with open(ENTRIES / "names.csv", "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["archive", "hash", "name"])
        for r in rows:
            h = int(r["hash"], 16)
            name = found.get(h, "")
            w.writerow([r["archive"], r["hash"], name])
            if name:
                dest = OUT / r["archive"][:-4] / name.replace("\\", "/").lstrip("/")
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ENTRIES / r["archive"][:-4] / f'{r["hash"]}.bin', dest)
    named = sum(1 for r in rows if int(r["hash"], 16) in found)
    print(f"format strings tried: {len(fmts)}  tokens: {len(tokens)}")
    print(f"unique hashes named: {len(found)}/{len(targets)}  entries named: {named}/{len(rows)}")
    for n in sorted(found.values())[:25]:
        print("  ", n)


if __name__ == "__main__":
    main()
