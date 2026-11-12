/**
 * SuitDesigns.js — hand-designed suits, painted onto the minifig by SuitPainter.
 * Each design is (info, p, n) => [r, g, b]; `info.part` is the body part with panel coords
 * (see SuitPainter.classify). Written to match the official LEGO minifigure prints.
 */
import { debugDesign, hex, web, eye, spider, segDist } from './SuitPainter.js?v=62';

const C = {
  black: hex(0x141417), web: hex(0x2a2a31), dgray: hex(0x3a3d42), gray: hex(0x7a7f87), white: hex(0xf2f2f2),
  red: hex(0xc4161c), dred: hex(0x7e1418), bright: hex(0xe2241f), pink: hex(0xe8469a), navy: hex(0x172552),
  dot: hex(0x24357a), orange: hex(0xff6a2a), gold: hex(0xd9a22c), blue: hex(0x22357a), silver: hex(0xc4c8ce),
  lilac: hex(0x7a74e8), patch: hex(0x9fd0ff), sky: hex(0xe9f4ff),
  brown: hex(0xb8895a), dbrown: hex(0x6e4a28), amber: hex(0xe8c24a), denim: hex(0x3f5f95), ddenim: hex(0x263a5e),
  ltgray: hex(0xd4d7dc), steel: hex(0x55606c), lime: hex(0x2ef08a),
};

/** True on the Future Foundation "4" in a ring, centred at (cx, cy) with radius r on a panel. */
function ffLogo(u, v, cx = 0, cy = 0.6, r = 0.3) {
  const x = (u - cx) / r, y = (v - cy) / r, d = Math.hypot(x, y);
  if (d > 0.78 && d < 1) return true;                                    // ring
  const w = 0.11;
  return segDist(x, y, 0.18, -0.55, 0.18, 0.6) < w ||                    // upright of the 4
         segDist(x, y, 0.18, 0.6, -0.42, -0.08) < w ||                   // diagonal
         segDist(x, y, -0.42, -0.08, 0.48, -0.08) < w;                   // crossbar
}

/** Future Foundation body (shared with Bag-Man). */
function ffBody(i) {
  switch (i.part) {
    case 'torso':
      if (ffLogo(i.u, i.v)) return C.black;
      return Math.abs(Math.abs(i.u) - 0.82) < 0.025 ? C.ltgray : C.white;   // side seams
    case 'torsoSide': return C.black;
    case 'arm': return i.v < 0.08 ? C.black : C.white;
    case 'hand': return C.black;
    case 'hips': return C.white;
    case 'leg': return i.v < 0.16 ? C.black : (Math.abs(i.u ?? 0) > 0.8 ? C.ltgray : C.white);
    default: return C.white;
  }
}

/** Spider-Man eyes on the face panel: lens colour, rim colour; returns colour or null. */
function eyes(u, v, lens, rim, { w = 0.24, h = 0.13, y = 0.5, x = 0.31, rimW = 0.3, tilt = 0.35 } = {}) {
  const s = u < 0 ? -1 : 1;
  const e = eye(u, v, s * x, y, w, h, s * tilt, rimW);
  return e === 2 ? lens : e === 1 ? rim : null;
}

export const DESIGNS = {
  debug: debugDesign,

  // ── Miles Morales: black suit, red webs on the face only, red bib + black spider ──
  miles: (i) => {
    switch (i.part) {
      case 'face':
        return eyes(i.u, i.v, C.white, C.red) ??
          (Math.abs(i.u) < 0.78 && web(i.u, i.v, 0, 0.42, 12, 0.2, 0.02) ? C.red : C.black);
      case 'torso': {
        const edge = 0.22 + Math.abs(i.u) * 0.85;
        if (i.v > edge) {
          if (spider(i.u, i.v, 0, 0.6, 0.32, true, 1.4)) return C.black;
          return web(i.u, i.v, 0, 1.0, 14, 0.13, 0.03) ? C.black : C.red;
        }
        if (i.v > edge - 0.03) return C.red;
        const curve = Math.abs(Math.abs(i.u) - (0.62 + 0.12 * Math.sin(i.v * 6))) < 0.02 && i.v < 0.75;
        return curve ? C.gray : C.black;
      }
      case 'hand': return C.red;
      default: return C.black;   // back and sides of the head, stud, arms, legs: solid black
    }
  },

  // ── Miles Morales hoodie ───────────────────────────────────────────────────
  mileshood: (i) => {
    switch (i.part) {
      case 'face':
        return eyes(i.u, i.v, C.sky, C.red, { w: 0.2, h: 0.11, rimW: 0.26, x: 0.29 }) ??
          (web(i.u, i.v, 0, 0.42, 12, 0.2, 0.018) ? C.gray : C.black);
      case 'headBack': return web(i.u, i.v, 0, 0.55, 10, 0.22, 0.02) ? C.gray : C.black;
      case 'torso': {
        if (i.v < 0.08) return C.dred;                          // ribbed hem
        if (Math.abs(i.u) < 0.42 + (1 - i.v) * 0.05) {
          if (spider(i.u, i.v, 0, 0.6, 0.3, true, 1.3)) return C.bright;
          if (Math.abs(i.v - 0.28 - Math.abs(i.u) * 0.7) < 0.035 && i.v < 0.55) return C.bright;
          return web(i.u, i.v, 0, 0.95, 12, 0.14, 0.022) ? C.gray : C.black;
        }
        for (const s of [-1, 1]) if (Math.abs(i.u - s * 0.52) < 0.035 && i.v > 0.35 && i.v < 0.97) return C.white;
        return C.dred;
      }
      case 'torsoBack': case 'torsoSide': case 'shoulderTop': case 'arm': return C.dred;
      case 'hand': case 'hips': return C.dgray;
      case 'leg': return i.v < 0.12 ? C.black : C.dgray;
      default: return C.black;
    }
  },

  // ── Spider-Gwen ────────────────────────────────────────────────────────────
  gwen: (i) => {
    switch (i.part) {
      case 'face': return eyes(i.u, i.v, C.white, C.pink, { w: 0.23, h: 0.14, rimW: 0.22, tilt: 0.3 }) ?? C.white;
      case 'torso': {
        // Black bodice under a deep V neckline; white shoulders and hip curves
        const neckline = i.v < 0.48 + Math.abs(i.u) * 0.62;
        const hipCurve = i.v < 0.22 && Math.abs(i.u) > 0.62 - (0.22 - i.v) * 1.2;
        for (const s of [-1, 1]) {
          const du = i.u - s * 0.74, dv = i.v - 0.9;
          if (Math.abs(du) + Math.abs(dv) < 0.15) return web(i.u, i.v, s * 0.74, 0.9, 6, 0.06, 0.012) ? C.lilac : C.patch;
        }
        if (!neckline || Math.abs(i.u) > 0.86 || hipCurve) return C.white;
        // Three soft grey contour lines across the bodice
        const t = i.v + (i.u * i.u) * 0.22;
        const line = [0.22, 0.34, 0.46].some(c => Math.abs(t - c) < 0.012) && Math.abs(i.u) < 0.55;
        return line ? C.gray : C.black;
      }
      case 'hips': case 'leg': return C.black;
      default: return C.white;
    }
  },

  // ── Symbiote suit: black with black webs and the big white spider ─────────
  symbiote: (i) => {
    switch (i.part) {
      case 'face':
        return eyes(i.u, i.v, C.white, C.black, { w: 0.28, h: 0.16, x: 0.32, rimW: 0.12, tilt: 0.45 }) ??
          (web(i.u, i.v, 0, 0.42, 12, 0.2, 0.016) ? C.web : C.black);
      case 'headBack': return web(i.u, i.v, 0, 0.55, 10, 0.22, 0.016) ? C.web : C.black;
      case 'torso':
        if (spider(i.u, i.v, 0, 0.5, 0.7, true, 2.2)) return C.white;
        return web(i.u, i.v, 0, 0.9, 14, 0.14, 0.014) ? C.web : C.black;
      case 'torsoBack': return web(i.u, i.v, 0, 0.8, 12, 0.16, 0.016) ? C.web : C.black;
      case 'arm': return i.v < 0.1 ? C.silver : (Math.abs(((i.v * 7) % 1) - 0.5) > 0.47 ? C.web : C.black);
      // Black legs to match the hips: the old grey legs left a hard black band at the waist
      case 'leg': return Math.abs(((i.v * 6) % 1) - 0.5) > 0.47 ? C.web : C.black;
      default: return C.black;
    }
  },

  // ── Spider-Man 2099: navy with a fine dot texture and a big angular red spider ──
  s2099: (i, p) => {
    const dots = Math.abs(((p.x * 22) % 1 + 1) % 1 - 0.5) < 0.12 && Math.abs(((p.y * 22) % 1 + 1) % 1 - 0.5) < 0.12;
    const base = dots ? C.dot : C.navy;
    switch (i.part) {
      case 'face': {
        // Angular red eye shapes with an orange core, red brow lines meeting over the nose
        const e = eyes(i.u, i.v, C.bright, C.black, { w: 0.25, h: 0.1, x: 0.3, y: 0.5, rimW: 0.18, tilt: 0.55 });
        if (e) return e;
        for (const s of [-1, 1]) if (segDist(i.u, i.v, s * 0.6, 0.68, s * 0.06, 0.78) < 0.022) return C.bright;
        if (segDist(i.u, i.v, 0, 0.76, 0, 0.92) < 0.025) return C.bright;
        return base;
      }
      case 'torso': {
        const u = i.u, v = i.v, au = Math.abs(u);
        // Spider body: skull diamond on top, long abdomen below
        if (au * 2.2 + Math.abs(v - 0.74) * 2.6 < 0.42) return au < 0.07 && v > 0.7 ? C.orange : C.bright;
        if (au * 2.6 + Math.abs(v - 0.42) * 1.6 < 0.4) return C.bright;
        // Four angular legs each side: out from the body, then bending
        for (const [kx, ky, ex, ey] of [[0.45, 0.92, 0.85, 1.0], [0.55, 0.72, 0.95, 0.82], [0.55, 0.5, 0.95, 0.4], [0.45, 0.3, 0.85, 0.08]]) {
          if (segDist(au, v, 0.08, (ky + 0.6) / 2, kx, ky) < 0.035 || segDist(au, v, kx, ky, ex, ey) < 0.03) return C.bright;
        }
        return base;
      }
      case 'arm': return Math.abs(i.v - 0.75) < 0.05 || Math.abs(i.v - 0.25) < 0.05 ? C.bright : base;
      case 'hand': return C.navy;
      case 'leg': {
        if (i.v < 0.07) return C.bright;
        if (i.front && Math.abs(i.u) * 0.55 + (0.36 - i.v) < 0.12 && i.v < 0.36) return C.bright;
        return base;
      }
      default: return base;
    }
  },

  // ── Iron Spider ────────────────────────────────────────────────────────────
  iron: (i) => {
    switch (i.part) {
      case 'face': return eyes(i.u, i.v, C.white, C.black, { rimW: 0.25 }) ?? (web(i.u, i.v, 0, 0.4, 12, 0.21, 0.016) ? hex(0x5a0c10) : C.red);
      case 'headBack': case 'headTop': return C.red;
      case 'torso': {
        const center = Math.abs(i.u) < 0.42 + i.v * 0.12;
        if (spider(i.u, i.v, 0, 0.58, 0.48, true, 1.6)) return C.gold;
        if (Math.abs(Math.abs(i.u) - (0.42 + i.v * 0.12)) < 0.035) return C.gold;
        if (center) return web(i.u, i.v, 0, 0.6, 12, 0.16, 0.015) ? hex(0x7e1418) : C.red;
        return Math.abs(((i.v * 5) % 1) - 0.5) > 0.46 ? C.gold : C.blue;
      }
      case 'torsoBack': return Math.abs(i.u) < 0.35 ? C.red : C.blue;
      case 'arm': case 'shoulderTop': case 'torsoSide': return C.blue;
      case 'hand': return C.red;
      case 'hips': return C.blue;
      case 'leg': return i.v < 0.42 ? C.red : C.blue;
      default: return C.red;
    }
  },

  // ── Peter Parker (civilian): azure zip hoodie open over a green striped tee, dark blue jeans ──
  peterhoodie: (i) => {
    const azure = hex(0x3aa3dc), azureDk = hex(0x2a7fb4), lime = hex(0xa6d63c), limeDk = hex(0x5f9a2a), jeans = hex(0x1f3866), skin = hex(0xf2c49a);
    switch (i.part) {
      case 'torso': {
        const open = Math.abs(i.u) < 0.12 + (i.v - 0.2) * 0.22 && i.v > 0.18;     // the open zip, widening to the collar
        if (open) return Math.floor(i.v * 14) % 2 ? lime : limeDk;                // striped tee
        if (Math.abs(Math.abs(i.u) - (0.13 + (i.v - 0.2) * 0.22)) < 0.025 && i.v > 0.18) return azureDk; // zip edges
        if (i.v > 0.82 && Math.abs(Math.abs(i.u) - 0.22) < 0.02) return hex(0xf4f4f4); // drawstrings
        if (i.v < 0.08) return azureDk;                                            // ribbed hem
        return azure;
      }
      case 'torsoBack': case 'torsoSide': case 'shoulderTop': return azure;
      case 'arm': return i.v < 0.08 ? azureDk : azure;
      case 'hand': return skin;
      case 'hips': case 'leg': return jeans;
      default: return azure;
    }
  },

  // ── Future Foundation: all-white suit, black "4" ring, black gloves and boots ──
  ff: (i) => {
    switch (i.part) {
      case 'face': return eyes(i.u, i.v, C.sky, C.black, { rimW: 0.4, w: 0.25, h: 0.14 }) ?? C.white;
      case 'headBack': case 'headTop': return C.white;
      default: return ffBody(i);
    }
  },

  // ── Bombastic Bag-Man: FF suit with a brown paper bag over the head ────────
  bagman: (i) => {
    switch (i.part) {
      case 'face': {
        for (const s of [-1, 1]) if (Math.hypot((i.u - s * 0.3) / 1.2, i.v - 0.55) < 0.075) return C.black;   // eye holes
        if (segDist(i.u, i.v, -0.25, 0.3, 0.25, 0.28) < 0.018) return C.dbrown;                             // scrawled mouth
        if (i.v > 0.94 && Math.abs(((i.u * 6) % 1 + 1) % 1 - 0.5) > 0.42) return C.dbrown;                    // folded rim
        return C.brown;
      }
      case 'headBack': return Math.abs(i.u) < 0.02 ? C.dbrown : C.brown;
      case 'headTop': return C.brown;
      default: return ffBody(i);
    }
  },

  // ── Homemade suit: red hoodie, goggles, blue sweatpants ────────────────────
  homemade: (i) => {
    switch (i.part) {
      case 'face':
        return eyes(i.u, i.v, C.ltgray, C.black, { w: 0.22, h: 0.15, rimW: 0.55, tilt: 0.05, x: 0.32 }) ??
          (segDist(i.u, i.v, -0.12, 0.55, 0.12, 0.55) < 0.03 ? C.black : C.red);          // goggle bridge
      case 'headBack': return Math.abs(i.v - 0.55) < 0.04 ? C.black : C.red;               // goggle strap
      case 'torso':
        if (spider(i.u, i.v, 0, 0.62, 0.22, true, 1.6)) return C.black;
        if (i.v < 0.08) return C.dred;                                                    // hoodie hem
        if (Math.abs(i.u) < 0.42 && i.v > 0.12 && i.v < 0.3) return Math.abs(i.v - 0.3) < 0.02 ? C.dred : C.red; // pocket
        return C.red;
      case 'arm': return i.v < 0.1 ? C.dred : C.red;
      case 'hand': return C.dgray;
      case 'hips': return C.blue;
      case 'leg': return i.v < 0.1 ? C.white : (i.v < 0.16 ? C.red : C.blue);            // sneakers
      default: return C.red;
    }
  },

  // ── Wrestling suit: home-made red shirt with a drawn-on spider ─────────────
  wrestler: (i) => {
    switch (i.part) {
      case 'face': return eyes(i.u, i.v, C.black, C.dgray, { w: 0.22, h: 0.1, rimW: 0.15 }) ?? C.red;
      case 'torso':
        if (spider(i.u, i.v, 0, 0.55, 0.42, true, 0.9)) return C.black;
        return C.red;
      case 'arm': return C.blue;
      case 'hand': return C.red;
      case 'hips': case 'leg': return i.v < 0.08 && i.part === 'leg' ? C.black : C.blue;
      default: return C.red;
    }
  },

  // ── Amazing Spider-Man (2012): amber lenses, blue sides, raised webbing ────
  tasm: (i, p) => {
    const dots = Math.abs(((p.x * 30) % 1 + 1) % 1 - 0.5) < 0.18 && Math.abs(((p.y * 30) % 1 + 1) % 1 - 0.5) < 0.18;
    const blue = dots ? C.navy : C.blue;
    switch (i.part) {
      case 'face':
        return eyes(i.u, i.v, C.amber, C.black, { w: 0.22, h: 0.15, rimW: 0.2, tilt: 0.45 }) ??
          (web(i.u, i.v, 0, 0.4, 12, 0.18, 0.014) ? C.black : C.red);
      case 'headBack': return web(i.u, i.v, 0, 0.5, 10, 0.2, 0.014) ? C.black : C.red;
      case 'torso': {
        if (Math.abs(i.u) > 0.66 - i.v * 0.15) return blue;
        if (spider(i.u, i.v, 0, 0.58, 0.5, true, 1.3)) return C.black;
        return web(i.u, i.v, 0, 0.6, 12, 0.15, 0.014) ? C.black : C.red;
      }
      case 'torsoBack': return Math.abs(i.u) < 0.4 ? (web(i.u, i.v, 0, 0.7, 10, 0.16, 0.014) ? C.black : C.red) : blue;
      case 'torsoSide': return blue;
      case 'arm': return i.front ? (i.v > 0.7 ? blue : C.red) : blue;
      case 'hand': return C.red;
      case 'hips': return blue;
      case 'leg': return i.v < 0.4 || i.front ? C.red : blue;
      default: return C.red;
    }
  },

  // ── Far From Home: red and black ───────────────────────────────────────────
  ffh: (i) => {
    switch (i.part) {
      case 'face':
        return eyes(i.u, i.v, C.white, C.black, { w: 0.27, h: 0.15, rimW: 0.12, tilt: 0.4 }) ??
          (web(i.u, i.v, 0, 0.42, 12, 0.2, 0.012) ? C.dred : C.red);
      case 'headBack': return web(i.u, i.v, 0, 0.55, 10, 0.22, 0.012) ? C.dred : C.red;
      case 'torso': {
        if (Math.abs(i.u) > 0.58 + i.v * 0.1) return C.black;
        if (spider(i.u, i.v, 0, 0.6, 0.4, true, 1.3)) return C.black;
        return web(i.u, i.v, 0, 0.6, 12, 0.16, 0.012) ? C.dred : C.red;
      }
      case 'torsoBack': return Math.abs(i.u) < 0.3 ? C.red : C.black;
      case 'torsoSide': return C.black;
      case 'arm': return i.v > 0.55 ? C.black : C.red;
      case 'hand': return C.red;
      case 'hips': return C.black;
      case 'leg': return i.v < 0.4 ? C.red : C.black;
      default: return C.red;
    }
  },

  // ── Spider-UK: red mask, Union-flag chest ──────────────────────────────────
  uk: (i) => {
    switch (i.part) {
      case 'face':
        return eyes(i.u, i.v, C.white, C.black, { rimW: 0.25 }) ?? (web(i.u, i.v, 0, 0.42, 12, 0.2, 0.014) ? C.dred : C.red);
      case 'torso': {
        const u = i.u, v = i.v - 0.55;
        if (spider(i.u, i.v, 0, 0.55, 0.3, false)) return C.black;
        if (Math.abs(u) < 0.07 || Math.abs(v) < 0.06) return C.bright;                    // red cross
        if (Math.abs(u) < 0.12 || Math.abs(v) < 0.1) return C.white;                       // white border
        const diag = Math.min(Math.abs(u - v * 1.3), Math.abs(u + v * 1.3));
        if (diag < 0.04) return C.bright;                                                 // red saltire
        if (diag < 0.1) return C.white;
        return C.navy;
      }
      case 'torsoBack': case 'torsoSide': return C.navy;
      case 'arm': return i.v > 0.75 ? C.navy : C.red;
      case 'hand': return C.red;
      case 'hips': return C.navy;
      case 'leg': return i.v < 0.45 ? C.red : C.navy;
      default: return C.red;
    }
  },

  // ── Spider-Punk: denim vest over a scrawled red tee ────────────────────────
  punk: (i, p) => {
    const scrawl = Math.abs(Math.sin(p.x * 40 + p.y * 23) * Math.cos(p.y * 31 - p.x * 9)) > 0.97;
    switch (i.part) {
      case 'face':
        return eyes(i.u, i.v, C.white, C.black, { w: 0.24, h: 0.12, rimW: 0.5, tilt: 0.55 }) ?? (scrawl ? C.black : C.red);
      case 'headBack': case 'headTop': return scrawl ? C.black : C.red;
      case 'torso': {
        const open = Math.abs(i.u) < 0.3 + i.v * 0.12;                                  // vest opening
        if (!open) {
          for (const sv of [0.3, 0.55, 0.8]) if (Math.hypot(Math.abs(i.u) - 0.62, i.v - sv) < 0.05) return C.silver; // studs
          return C.denim;
        }
        if (spider(i.u, i.v, 0, 0.55, 0.28, true, 1.1)) return C.black;
        return scrawl ? C.black : C.red;
      }
      case 'torsoBack': return Math.hypot(i.u, i.v - 0.6) < 0.3 ? C.bright : C.denim;
      case 'torsoSide': case 'shoulderTop': return C.denim;
      case 'arm': return Math.abs(((i.v * 5) % 1) - 0.5) > 0.4 ? C.black : C.red;
      case 'hand': return C.black;
      case 'hips': return C.ddenim;
      case 'leg': return i.v < 0.12 ? C.black : (Math.abs(i.v - 0.55) < 0.05 && i.front ? C.ltgray : C.ddenim); // ripped knees
      default: return C.red;
    }
  },

  // ── Scarlet Spider (Kaine): red, big black spider, black lower arms ─────────
  kaine: (i) => {
    switch (i.part) {
      case 'face': {
        const e = eyes(i.u, i.v, C.white, C.black, { w: 0.24, h: 0.13, rimW: 0.9, tilt: 0.5 });
        return e ?? C.red;
      }
      case 'torso':
        if (spider(i.u, i.v, 0, 0.5, 0.75, true, 1.8)) return C.black;
        return C.red;
      case 'arm': return i.v < 0.55 ? (web(i.u ?? 0, i.v, 0, 0.5, 8, 0.12, 0.02) ? C.dgray : C.black) : C.red;
      case 'hand': return C.black;
      case 'hips': case 'leg': return C.black;
      default: return C.red;
    }
  },

  // ── Spider-Armor: gunmetal plates, red spider, glowing red lenses ──────────
  armor: (i, p) => {
    const plate = Math.abs(((p.y * 9) % 1) - 0.5) > 0.46;
    switch (i.part) {
      case 'face':
        return eyes(i.u, i.v, C.bright, C.black, { w: 0.25, h: 0.09, rimW: 0.3, tilt: 0.6 }) ??
          (Math.abs(i.u) < 0.03 && i.v < 0.45 ? C.black : C.steel);
      case 'headBack': case 'headTop': return C.steel;
      case 'torso':
        if (spider(i.u, i.v, 0, 0.6, 0.45, true, 1.6)) return C.bright;
        if (Math.abs(Math.abs(i.u) - 0.5) < 0.03) return C.silver;
        return plate ? C.black : C.dgray;
      case 'arm': case 'shoulderTop': return plate ? C.black : C.steel;
      case 'hand': return C.dgray;
      case 'leg': return plate ? C.black : (i.v < 0.15 ? C.silver : C.steel);
      default: return C.dgray;
    }
  },

  // ── Scarlet Spider (Ben Reilly): red suit under a blue sleeveless hoodie ────
  scarlet: (i) => {
    switch (i.part) {
      case 'face': return eyes(i.u, i.v, C.white, C.black, { w: 0.26, h: 0.14, rimW: 0.24, tilt: 0.4 }) ?? C.bright;
      case 'headBack': case 'headTop': return C.bright;
      case 'torso': {
        if (Math.abs(i.u) > 0.74 || i.v > 0.88) return C.blue;                 // hoodie panels
        if (spider(i.u, i.v, 0, 0.55, 0.68, true, 2.0)) return C.black;
        return C.bright;
      }
      case 'torsoBack': case 'torsoSide': case 'shoulderTop': return C.blue;
      case 'arm': return i.v > 0.74 ? C.blue : C.bright;
      case 'hand': return C.bright;
      case 'hips': return C.bright;
      case 'leg': return i.v < 0.1 ? C.black : C.bright;
      default: return C.bright;
    }
  },

  // ── Spider-Man Noir: flat black suit, grey webbing, pale lenses ─────────────
  noir: (i) => {
    switch (i.part) {
      case 'face':
        return eyes(i.u, i.v, C.ltgray, C.black, { w: 0.25, h: 0.13, rimW: 0.45, tilt: 0.45 }) ??
          (web(i.u, i.v, 0, 0.42, 10, 0.22, 0.02) ? C.dgray : C.black);
      case 'headBack': case 'headTop': return web(i.u, i.v, 0, 0.55, 10, 0.22, 0.018) ? C.dgray : C.black;
      case 'torso':
        if (spider(i.u, i.v, 0, 0.55, 0.62, true, 2.0)) return C.dgray;
        return web(i.u, i.v, 0, 0.8, 12, 0.16, 0.018) ? C.dgray : C.black;
      case 'torsoBack': return web(i.u, i.v, 0, 0.8, 10, 0.18, 0.018) ? C.dgray : C.black;
      case 'torsoSide': case 'shoulderTop': return C.black;
      case 'arm': return Math.abs(((i.v * 5) % 1) - 0.5) > 0.46 ? C.dgray : C.black;
      case 'hand': return C.black;
      case 'hips': return C.dgray;
      case 'leg': return Math.abs(((i.v * 5) % 1) - 0.5) > 0.46 ? C.dgray : C.black;
      default: return C.black;
    }
  },

  // ── Superior Spider-Man: red with the long black spider, black gauntlets ────
  superior: (i) => {
    switch (i.part) {
      case 'face': return eyes(i.u, i.v, C.white, C.black, { w: 0.27, h: 0.16, rimW: 0.38, tilt: 0.5 }) ?? C.bright;
      case 'headBack': case 'headTop': return C.bright;
      case 'torso':
        if (spider(i.u, i.v, 0, 0.56, 0.8, true, 2.6)) return C.black;
        return C.bright;
      case 'torsoBack': case 'torsoSide': case 'shoulderTop': return C.bright;
      case 'arm': return i.v < 0.16 ? C.black : C.bright;
      case 'hand': return C.black;
      case 'hips': return C.black;
      case 'leg': return i.v < 0.14 ? C.black : C.bright;
      default: return C.bright;
    }
  },

  // ── Stealth (Big Time): near-black suit with glowing green webbing ──────────
  stealth: (i) => {
    switch (i.part) {
      case 'face':
        return eyes(i.u, i.v, C.lime, C.black, { w: 0.26, h: 0.13, rimW: 0.3, tilt: 0.42 }) ??
          (web(i.u, i.v, 0, 0.42, 12, 0.2, 0.018) ? C.lime : C.black);
      case 'headBack': case 'headTop': return web(i.u, i.v, 0, 0.55, 10, 0.22, 0.018) ? C.lime : C.black;
      case 'torso':
        if (spider(i.u, i.v, 0, 0.55, 0.62, true, 2.0)) return C.lime;
        return web(i.u, i.v, 0, 0.85, 12, 0.16, 0.018) ? C.lime : C.black;
      case 'torsoBack': return web(i.u, i.v, 0, 0.8, 12, 0.18, 0.018) ? C.lime : C.black;
      case 'torsoSide': case 'shoulderTop': return C.black;
      case 'arm': case 'leg': return Math.abs(((i.v * 4) % 1) - 0.5) > 0.45 ? C.lime : C.black;
      case 'hand': case 'hips': return C.black;
      default: return C.black;
    }
  },

  // ── Golden: gold body with darker gold webbing and bright lenses ────────────
  golden: (i) => {
    const dark = hex(0x8a5e10), light = hex(0xf2d27a);
    switch (i.part) {
      case 'face':
        return eyes(i.u, i.v, C.white, dark, { w: 0.25, h: 0.14, rimW: 0.3, tilt: 0.4 }) ??
          (web(i.u, i.v, 0, 0.42, 12, 0.2, 0.018) ? dark : light);
      case 'headBack': case 'headTop': return web(i.u, i.v, 0, 0.55, 10, 0.22, 0.018) ? dark : light;
      case 'torso':
        if (spider(i.u, i.v, 0, 0.55, 0.6, true, 1.8)) return dark;
        return web(i.u, i.v, 0, 0.8, 12, 0.16, 0.018) ? dark : light;
      case 'torsoBack': return web(i.u, i.v, 0, 0.8, 10, 0.18, 0.018) ? dark : light;
      case 'torsoSide': case 'shoulderTop': return light;
      case 'arm': return web(i.u ?? 0, i.v, 0, 0.5, 10, 0.14, 0.02) ? dark : light;
      case 'hand': case 'hips': return C.gold;
      case 'leg': return web(i.u ?? 0, i.v, 0, 0.5, 10, 0.14, 0.022) ? dark : light;
      default: return light;
    }
  },
};
