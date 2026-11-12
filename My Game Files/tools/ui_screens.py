"""Render type-0x600 .btga screens (8bpp tiles + palette) through their .nsc tile map."""
import os
import struct
import zlib

import numpy as np
from PIL import Image

import fuse_unpack as F

PIX_OFF = 0x3C
TILES_SIZE = 0x8000
SHEET_W = 128


def nhash(p):
    return (~zlib.crc32(p.lower().encode())) & 0xFFFFFFFF


def rgba(c):
    c = np.asarray(c, dtype=np.uint16)
    r = ((c & 0x1F) << 3).astype(np.uint8)
    g = (((c >> 5) & 0x1F) << 3).astype(np.uint8)
    b = (((c >> 10) & 0x1F) << 3).astype(np.uint8)
    return np.stack([r, g, b, np.full_like(r, 255)], -1)


def load(path):
    return F.load_entry('LEGO_M1_DS', nhash(path))[2]


def render(btga_path, nsc_path, dest):
    t = load(btga_path)
    assert struct.unpack_from('<I', t, 0)[0] == 0x600, btga_path
    pal_size = struct.unpack_from('<I', t, 0x1C)[0]
    # 8bpp linear bitmap, 128 px wide; tile k is the 8x8 block at grid cell k (16 per row).
    sheet = np.frombuffer(t[PIX_OFF:PIX_OFF + TILES_SIZE], np.uint8).reshape(-1, SHEET_W)
    tiles = sheet.reshape(-1, 8, SHEET_W // 8, 8).transpose(0, 2, 1, 3).reshape(-1, 8, 8)
    pal = rgba(np.frombuffer(t[PIX_OFF + TILES_SIZE:PIX_OFF + TILES_SIZE + pal_size], '<u2'))
    pal[0, 3] = 0
    pal = np.concatenate([pal, np.zeros((256 - len(pal), 4), np.uint8)])

    if nsc_path:
        s = load(nsc_path)
        cols, rows = struct.unpack_from('<II', s, 0x18)
        cells = np.frombuffer(s[0x28:0x28 + cols * rows * 2], '<u2').reshape(rows, cols)
    else:
        n = len(tiles)
        cols, rows = 16, n // 16
        cells = np.arange(n, dtype=np.uint16).reshape(rows, cols)

    img = np.zeros((rows * 8, cols * 8), np.uint8)
    for y in range(rows):
        for x in range(cols):
            e = int(cells[y, x])
            tile = tiles[(e & 0x3FF) % len(tiles)]
            if e & 0x400:
                tile = tile[:, ::-1]
            if e & 0x800:
                tile = tile[::-1, :]
            img[y * 8:y * 8 + 8, x * 8:x * 8 + 8] = tile
    Image.fromarray(pal[img], 'RGBA').save(dest)
    print(f'{dest}: {cols * 8}x{rows * 8}, palette {pal_size // 2} colours')


if __name__ == '__main__':
    os.makedirs('png', exist_ok=True)
    jobs = [
        ('Sprites/UI_PauseScreenBottom/UI_PauseBottom.btga', 'Sprites/UI_PauseScreenBottom/UI_PauseBottom.nsc', 'png/UI_PauseBottom.png'),
        ('Sprites/UI_ShopTop/UI_ShopTop.btga', 'Sprites/UI_ShopTop/UI_ShopTop.nsc', 'png/UI_ShopTop.png'),
        ('Sprites/UI_Bottomscreen/UI_BottomScreen_blocks.btga', 'Sprites/UI_Bottomscreen/UI_BottomScreen_blocks.nsc', 'png/UI_BottomScreen_blocks.png'),
        ('Sprites/UI_SplashScreens/Images/Nintendo_Logo.btga', None, 'png/Nintendo_Logo_tiles.png'),
    ]
    for b, n, d in jobs:
        render(b, n, d)
