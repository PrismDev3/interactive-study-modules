"""Pure-Python raw Deflate with a remappable block-type table (TT Games 'Deflate_v1.0')."""

class Bits:
    __slots__ = ('d', 'p', 'b', 'n')
    def __init__(self, d): self.d, self.p, self.b, self.n = d, 0, 0, 0
    def get(self, k):
        while self.n < k:
            self.b |= (self.d[self.p] if self.p < len(self.d) else 0) << self.n
            self.p += 1; self.n += 8
        v = self.b & ((1 << k) - 1); self.b >>= k; self.n -= k
        return v
    def align(self): self.b = 0; self.n = 0

def _huff(lengths):
    # canonical code -> {(len, code): sym}, decoded MSB-first bit by bit
    mx = max(lengths) if lengths else 0
    bl = [0] * (mx + 1)
    for l in lengths:
        if l: bl[l] += 1
    code, nxt = 0, [0] * (mx + 2)
    for b in range(1, mx + 1):
        code = (code + bl[b - 1]) << 1; nxt[b] = code
    t = {}
    for s, l in enumerate(lengths):
        if l: t[(l, nxt[l])] = s; nxt[l] += 1
    return t, mx

def _sym(bits, h):
    t, mx = h
    code = 0
    for l in range(1, mx + 1):
        code = (code << 1) | bits.get(1)
        s = t.get((l, code))
        if s is not None: return s
    raise ValueError('bad code')

LB = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258]
LE = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0]
DB = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577]
DE = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13]
ORDER = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]
FIXED = None

def inflate(data, tmap=(2, 1, 0, 3), limit=None):
    """tmap[stored_btype] -> real btype (0 stored, 1 fixed, 2 dynamic)."""
    global FIXED
    if FIXED is None:
        FIXED = (_huff([8]*144 + [9]*112 + [7]*24 + [8]*8), _huff([5]*30))
    bits, out = Bits(data), bytearray()
    while True:
        final = bits.get(1); bt = tmap[bits.get(2)]
        if bt == 0:
            bits.align()
            p = bits.p
            ln = data[p] | data[p+1] << 8
            out += data[p+4:p+4+ln]; bits.p = p + 4 + ln
        elif bt in (1, 2):
            if bt == 1: lit, dist = FIXED
            else:
                hl, hd, hc = bits.get(5) + 257, bits.get(5) + 1, bits.get(4) + 4
                cl = [0]*19
                for i in range(hc): cl[ORDER[i]] = bits.get(3)
                ch = _huff(cl); ls = []
                while len(ls) < hl + hd:
                    s = _sym(bits, ch)
                    if s < 16: ls.append(s)
                    elif s == 16: ls += [ls[-1]] * (3 + bits.get(2))
                    elif s == 17: ls += [0] * (3 + bits.get(3))
                    else: ls += [0] * (11 + bits.get(7))
                lit, dist = _huff(ls[:hl]), _huff(ls[hl:])
            while True:
                s = _sym(bits, lit)
                if s < 256: out.append(s)
                elif s == 256: break
                else:
                    s -= 257; ln = LB[s] + bits.get(LE[s])
                    d = _sym(bits, dist); dd = DB[d] + bits.get(DE[d])
                    if dd > len(out): raise ValueError('distance too far')
                    for _ in range(ln): out.append(out[-dd])
        else:
            raise ValueError('btype 3')
        if final or (limit and len(out) >= limit): return bytes(out)
