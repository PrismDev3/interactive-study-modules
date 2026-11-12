/**
 * SuitPainter.js — paints minifig suit textures by "projection": for every texel of the head /
 * upper / lower sheets, find the point on the 3D minifig it maps to (via the mesh UVs), then
 * colour it with a design written in body terms (torso front, face, arm, hand, leg...).
 * Designs therefore land exactly on the right body part whatever the UV layout looks like.
 *
 * Model space: feet at y=0, facing +z, +x is the figure's left. Head 1.325..1.893 (r≈0.243),
 * torso 0.75..1.37, arms |x| >= 0.37, hands below y≈0.84 on the arms, hips 0.55..0.75, legs below.
 */
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const SIZES = { head: [512, 512], upper: [512, 256], lower: [512, 256] };
const PART_OF = { Head: 'head', Body_upper: 'upper', Body_lower: 'lower' };
let geoPromise = null;

function loadGeometry() {
  geoPromise ??= new OBJLoader().loadAsync('assets/models/spidey/SpiderMan.obj').then(obj => {
    const out = {};
    obj.traverse(n => { if (n.isMesh && PART_OF[n.name]) out[PART_OF[n.name]] = n.geometry; });
    return out;
  });
  return geoPromise;
}

// ─── Small drawing helpers (all in 0..1 or -1..1 "panel" coordinates) ─────────
export const hex = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  const qx = ax + dx * t - px, qy = ay + dy * t - py;
  return Math.sqrt(qx * qx + qy * qy);
};
/** Web pattern around (cx, cy): `spokes` radial lines + rings every `gap`. */
export function web(u, v, cx, cy, spokes = 12, gap = 0.22, w = 0.018) {
  const dx = u - cx, dy = v - cy, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
  const step = (Math.PI * 2) / spokes, onSpoke = Math.abs(((a % step) + step) % step - step / 2) * r > step / 2 * r - w;
  // rings sag between spokes, like a real web
  const local = Math.abs(((a % step) + step) % step - step / 2) / (step / 2);
  const ring = Math.abs(((r + local * gap * 0.12) % gap) - gap / 2) > gap / 2 - w;
  return onSpoke || ring;
}
/** Almond eye centred at (cx, cy): tilted, fuller towards the outer corner. 0 outside, 1 rim, 2 inside. */
export function eye(u, v, cx, cy, w, h, tilt, rim) {
  const c = Math.cos(tilt), s = Math.sin(tilt);
  const x = ((u - cx) * c + (v - cy) * s) / w, y = (-(u - cx) * s + (v - cy) * c) / h;
  const outer = Math.sign(cx || 1) * x;                       // +1 at the outer corner
  const half = (ax) => Math.max(0, Math.sqrt(Math.max(0, 1 - ax * ax)) * (0.8 + 0.3 * outer));
  if (Math.abs(x) < 1 && Math.abs(y) < half(x)) return 2;
  const xr = x / (1 + rim), yr = y / (1 + rim);
  if (Math.abs(xr) < 1 && Math.abs(yr) < half(xr) * (1 + rim * 0.4)) return 1;
  return 0;
}
/** Spider emblem centred at (cx, cy) with size s; returns true on the emblem. */
export function spider(u, v, cx, cy, s, legs = true, thick = 1) {
  const x = (u - cx) / s, y = (v - cy) / s;
  if ((x * x) / 0.05 + ((y - 0.18) ** 2) / 0.06 < 1) return true;      // head/thorax
  if ((x * x) / 0.09 + ((y + 0.25) ** 2) / 0.16 < 1) return true;      // abdomen
  if (!legs) return false;
  for (const sx of [-1, 1]) {
    for (const [ex, ey, kx, ky] of [[0.55, 0.75, 0.35, 0.45], [0.75, 0.25, 0.45, 0.25], [0.75, -0.25, 0.45, 0.0], [0.55, -0.75, 0.35, -0.2]]) {
      if (segDist(x, y, 0, 0.1, sx * kx, ky) < 0.05 * thick || segDist(x, y, sx * kx, ky, sx * ex, ey) < 0.045 * thick) return true;
    }
  }
  return false;
}
export { segDist };

/**
 * Body-part classifier for a point on the mesh.
 * Returns { part, u, v, side } with panel coordinates:
 *  - torso / torsoBack: u -1..1 across, v 0 (waist) .. 1 (neck)
 *  - face: u -1..1 around the front of the head (±90°), v 0 (chin) .. 1 (crown); 'headBack' behind
 *  - arm / hand: v 0 (bottom) .. 1 (shoulder), side +1 left / -1 right
 *  - hips, leg: v 0..1, side
 */
export function classify(sheet, p, n, tu = -1, tv = -1) {
  if (sheet === 'head') {
    const a = Math.atan2(p.x, p.z), v = (p.y - 1.325) / 0.57;
    // The top surface and the stud are plain suit colour (no face print wrapping onto them)
    if (n.y > 0.85 || (p.y > 1.79 && Math.hypot(p.x, p.z) < 0.17)) return { part: 'headTop', u: p.x / 0.25, v: p.z / 0.25 };
    if (Math.abs(a) <= Math.PI / 2) return { part: 'face', u: a / (Math.PI / 2), v };
    return { part: 'headBack', u: (a > 0 ? Math.PI - a : -Math.PI - a) / (Math.PI / 2), v };
  }
  if (sheet === 'upper') {
    if (Math.abs(p.x) >= 0.37) {
      const side = Math.sign(p.x);
      // The hands have their own little island in the texture (right: u .43-.47, left: u .53-.57)
      const handUV = tv > 0.82 && tv < 0.875 && ((tu > 0.43 && tu < 0.47) || (tu > 0.53 && tu < 0.57));
      if (handUV || (tu < 0 && p.y < 0.84)) return { part: 'hand', side, v: (p.y - 0.65) / 0.19 };
      return { part: 'arm', side, v: (p.y - 0.84) / 0.5, front: n.z > 0.3 };
    }
    const v = (p.y - 0.75) / 0.62;
    if (n.y > 0.7) return { part: 'shoulderTop', u: p.x / 0.36, v };
    const half = 0.36 - (p.y - 0.75) * 0.1; // torso narrows towards the neck
    if (n.z >= 0.3) return { part: 'torso', u: p.x / half, v };
    if (n.z <= -0.3) return { part: 'torsoBack', u: -p.x / half, v };
    return { part: 'torsoSide', side: Math.sign(p.x), v };
  }
  // lower
  if (p.y > 0.55) return { part: 'hips', u: p.x / 0.36, v: (p.y - 0.55) / 0.2, front: n.z > 0.3 };
  return { part: 'leg', side: Math.sign(p.x) || 1, v: p.y / 0.55, front: n.z > 0.3, back: n.z < -0.3, u: (p.x - Math.sign(p.x) * 0.18) / 0.18 };
}

/** Paint all three sheets for `design(info, p, n) -> [r,g,b]`. */
export async function paintSuit(design) {
  const geos = await loadGeometry();
  const out = {};
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (const sheet of ['head', 'upper', 'lower']) {
    const [W, H] = SIZES[sheet];
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d');
    const img = g.createImageData(W, H), px = img.data;
    const written = new Uint8Array(W * H);
    const geo = geos[sheet];
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let t = 0; t < pos.count; t += 3) {
      A.fromBufferAttribute(pos, t); B.fromBufferAttribute(pos, t + 1); C.fromBufferAttribute(pos, t + 2);
      n.crossVectors(e1.subVectors(B, A), e2.subVectors(C, A)).normalize();
      // Texture space (canvas y is flipped against UV v)
      const ax = uv.getX(t) * W, ay = (1 - uv.getY(t)) * H;
      const bx = uv.getX(t + 1) * W, by = (1 - uv.getY(t + 1)) * H;
      const cx = uv.getX(t + 2) * W, cy = (1 - uv.getY(t + 2)) * H;
      const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      if (Math.abs(area) < 1e-6) continue;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)) - 1), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)) + 1);
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)) - 1), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)) + 1);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const sx = x + 0.5, sy = y + 0.5;
        const w0 = ((bx - sx) * (cy - sy) - (cx - sx) * (by - sy)) / area;
        const w1 = ((cx - sx) * (ay - sy) - (ax - sx) * (cy - sy)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
        p.set(A.x * w0 + B.x * w1 + C.x * w2, A.y * w0 + B.y * w1 + C.y * w2, A.z * w0 + B.z * w1 + C.z * w2);
        const col = design(classify(sheet, p, n, sx / W, 1 - sy / H), p, n);
        const i = (y * W + x) * 4;
        px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = 255;
        written[y * W + x] = 1;
      }
    }
    // Bleed painted pixels into empty neighbours so mip-mapping never shows seams
    for (let pass = 0; pass < 4; pass++) {
      const copy = written.slice();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (copy[y * W + x]) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H || !copy[yy * W + xx]) continue;
          const s = (yy * W + xx) * 4, d = (y * W + x) * 4;
          px[d] = px[s]; px[d + 1] = px[s + 1]; px[d + 2] = px[s + 2]; px[d + 3] = 255;
          written[y * W + x] = 1;
          break;
        }
      }
    }
    g.putImageData(img, 0, 0);
    out[sheet] = canvas;
  }
  return out;
}

/** Debug design: colours each body part differently and marks the panel coordinates. */
export const debugDesign = (info) => {
  const C = { face: 0xffffff, headBack: 0x888888, headTop: 0x444444, torso: 0xff3030, torsoBack: 0x3030ff, torsoSide: 0x30ff30,
    shoulderTop: 0xffff30, arm: 0xff9a30, hand: 0xff30ff, hips: 0x30ffff, leg: 0x9a6a30 };
  let c = hex(C[info.part] ?? 0);
  if (info.u !== undefined && Math.abs(info.u) < 0.05) c = [0, 0, 0];
  if (info.v !== undefined && Math.abs(info.v - 0.5) < 0.02) c = [0, 0, 0];
  return c;
};
