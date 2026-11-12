/**
 * Variants.js — Spider-Man suit variants made by recolouring the ripped minifig textures.
 * Bright red → suit colour, dark red web lines → line colour, blue → second colour.
 * Whites (eyes) and blacks stay as they are.
 */
import * as THREE from 'three';
import { paintSuit } from './SuitPainter.js?v=62';
import { DESIGNS } from './SuitDesigns.js?v=64';

/** Two-colour swatch for menus. */
export const swatchOf = v => v.swatch ?? [`rgb(${v.red})`, `rgb(${v.blue})`];

export const VARIANTS = {
  classic:  { name: 'Classic',     swatch: ['#c8202a', '#1f3fa8'] },
  symbiote: { name: 'Symbiote', swatch: ['#16161a', '#f2f2f2'],    red: [26, 26, 32],   line: [40, 40, 50],   blue: [22, 22, 28] },
  miles:    { name: 'Miles', swatch: ['#16161a', '#c4161c'],       red: [22, 22, 26],   line: [210, 30, 36],  blue: [22, 22, 26] },
  mileshood: { name: 'Miles Hoodie', swatch: ['#7e1418', '#16161a'] },
  s2099:    { name: '2099', swatch: ['#18264f', '#e2241f'],        red: [28, 44, 120],  line: [14, 20, 60],   blue: [200, 30, 36] },
  iron:     { name: 'Iron Spider', swatch: ['#c4161c', '#d9a22c'], red: [190, 22, 26],  line: [110, 8, 12],   blue: [226, 172, 48] },
  stealth:  { name: 'Stealth',     red: [70, 76, 88],   line: [20, 220, 120], blue: [34, 36, 44] },
  noir:     { name: 'Noir',        red: [26, 26, 28],   line: [92, 92, 98],   blue: [18, 18, 20] },   // black suit, grey webbing
  gwen:     { name: 'Spider-Gwen', swatch: ['#f2f2f2', '#16161a'], red: [236, 236, 240], line: [232, 70, 150], blue: [26, 26, 32] },
  scarlet:  { name: 'Scarlet',     red: [176, 24, 30],  line: [96, 10, 14],   blue: [176, 24, 30] },
  superior: { name: 'Superior',    red: [196, 24, 28],  line: [90, 8, 10],    blue: [26, 26, 32] },
  ff:       { name: 'Future Foundation', swatch: ['#f2f2f2', '#141417'], price: 5000 },
  bagman:   { name: 'Bag-Man',     swatch: ['#b8895a', '#f2f2f2'], price: 2500 },
  homemade: { name: 'Homemade',    swatch: ['#c4161c', '#22357a'] },
  wrestler: { name: 'Wrestler',    swatch: ['#c4161c', '#22357a'] },
  tasm:     { name: 'Amazing',     swatch: ['#c4161c', '#e8c24a'], price: 6000 },
  ffh:      { name: 'Far From Home', swatch: ['#c4161c', '#141417'], price: 6000 },
  uk:       { name: 'Spider-UK',   swatch: ['#172552', '#e2241f'], price: 7500 },
  punk:     { name: 'Spider-Punk', swatch: ['#3f5f95', '#c4161c'], price: 8000 },
  kaine:    { name: 'Scarlet Spider', swatch: ['#c4161c', '#141417'], price: 7500 },
  armor:    { name: 'Spider-Armor', swatch: ['#55606c', '#e2241f'], price: 12000 },
  peter:    { name: 'Peter Parker', swatch: ['#3f5f95', '#7a5a3a'] },
  golden:   { name: 'Golden',      red: [232, 178, 44], line: [140, 96, 12],  blue: [206, 150, 30], price: 20000 },
};

/** "custom-RRGGBB-RRGGBB-RRGGBB" (suit, web lines, second colour) → variant definition. */
export function variantDef(key) {
  if (VARIANTS[key]) return VARIANTS[key];
  const m = /^custom-([0-9a-f]{6})-([0-9a-f]{6})-([0-9a-f]{6})$/i.exec(key ?? '');
  if (!m) return VARIANTS.classic;
  const rgb = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  return { name: 'Custom', red: rgb(m[1]), line: rgb(m[2]), blue: rgb(m[3]) };
}

const DIR = 'assets/models/spidey/';
const PARTS = { head: 'spidey_v3_head.png', upper: 'spidey_v3_upper.png', lower: 'spidey_v3_lower.png' };
const cache = new Map();

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

function recolor(img, v, part) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  if (!v.red) return c;
  const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
  const W = c.width, H = c.height;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], gg = px[i + 1], b = px[i + 2];
    // Hands are one solid colour (their shading pixels would otherwise turn into web-line colour)
    if (part === 'upper') {
      const tu = ((i / 4) % W + 0.5) / W, tv = 1 - (Math.floor(i / 4 / W) + 0.5) / H;
      if (tv > 0.82 && tv < 0.875 && ((tu > 0.43 && tu < 0.47) || (tu > 0.53 && tu < 0.57))) {
        const k = Math.max(0.75, Math.min(1.1, Math.max(r, gg, b) / 200));
        px[i] = Math.min(255, v.red[0] * k); px[i + 1] = Math.min(255, v.red[1] * k); px[i + 2] = Math.min(255, v.red[2] * k);
        continue;
      }
    }
    const max = Math.max(r, gg, b), min = Math.min(r, gg, b), d = max - min;
    // Only greys/whites/blacks (eyes, outlines) keep their colour; classify everything else by hue
    if (max < 12 || d < 24 || d / max < 0.2) continue;
    let h = max === r ? ((gg - b) / d) % 6 : max === gg ? (b - r) / d + 2 : (r - gg) / d + 4;
    h = (h * 60 + 360) % 360;
    let target = null, ref = 1;
    if (h >= 300 || h < 40) {
      // Red family (incl. magenta/purple-reds): bright parts are suit, dark parts are web lines
      if (max > 110) { target = v.red; ref = max / 180; } else { target = v.line; ref = 1; }
    } else if (h >= 170 && h < 300) {
      target = v.blue; ref = max / 160; // blue family (incl. purple-blues)
    }
    if (!target) continue;
    px[i] = Math.min(255, target[0] * ref);
    px[i + 1] = Math.min(255, target[1] * ref);
    px[i + 2] = Math.min(255, target[2] * ref);
  }
  g.putImageData(d, 0, 0);
  return c;
}

/** Multiply `canvas` by the light/dark detail of the classic texture `img` (same UV layout). */
function shadeFrom(canvas, img) {
  const W = canvas.width, H = canvas.height;
  const ref = document.createElement('canvas');
  ref.width = W; ref.height = H;
  const rg = ref.getContext('2d');
  rg.imageSmoothingEnabled = false;
  rg.drawImage(img, 0, 0, W, H);
  const rp = rg.getImageData(0, 0, W, H).data;
  const lum = i => 0.3 * rp[i] + 0.59 * rp[i + 1] + 0.11 * rp[i + 2];
  // The plain suit colour is the most common brightness
  const hist = new Uint32Array(256);
  for (let i = 0; i < rp.length; i += 4) hist[Math.round(lum(i))]++;
  const base = Math.max(1, hist.indexOf(Math.max(...hist)));
  const g = canvas.getContext('2d'), d = g.getImageData(0, 0, W, H), px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    // Only the deep moulded holes/slots carry over, as crisp solid black (no soft shading)
    if (lum(i) / base < 0.5) { px[i] = 14; px[i + 1] = 14; px[i + 2] = 17; }
  }
  g.putImageData(d, 0, 0);
}

/** { head, upper, lower } canvases for a variant (cached). */
export function variantCanvases(key) {
  const v = variantDef(key);
  if (!cache.has(key) && DESIGNS[key]) {
    // Hand-designed suits, with the classic legs' moulded detail (back-of-leg holes, hip slots, edges) shaded in
    cache.set(key, Promise.all([paintSuit(DESIGNS[key]), loadImage(DIR + PARTS.lower)]).then(([c, img]) => {
      shadeFrom(c.lower, img);
      return c;
    }));
  }
  if (!cache.has(key)) {
    cache.set(key, Promise.all(Object.entries(PARTS).map(async ([part, file]) =>
      [part, recolor(await loadImage(DIR + file), v, part)])).then(Object.fromEntries));
  }
  return cache.get(key);
}

/** { head, upper, lower } textures for a variant. */
export async function variantTextures(key) {
  const canv = await variantCanvases(key);
  const out = {};
  for (const [part, cv] of Object.entries(canv)) {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;
    out[part] = t;
  }
  return out;
}
