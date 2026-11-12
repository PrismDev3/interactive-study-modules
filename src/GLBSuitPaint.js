/**
 * GLBSuitPaint.js — paints a hand-made suit design (SuitDesigns.js) onto the extracted
 * Spider-Man model. Every part of that model has a UV layout, so for each part we rasterise its
 * triangles in UV space, find the 3D point on the figure each texel covers, classify it (face,
 * torso, arm, hand, leg...) exactly like SuitPainter does for the old minifig, and colour it with
 * the design. Result: Miles, 2099, Spider-Gwen, Punk... on the real model instead of a recolour.
 */
import * as THREE from 'three';
import { classify } from './SuitPainter.js?v=62';

const SIZE = { head: 512, upper: 512, lower: 256 };

function sheetOf(part) {
  if (/^(head|face|hair)/.test(part)) return 'head';
  if (/^(body|arm|hand)/.test(part)) return 'upper';
  return 'lower';
}

/** Paint `design` onto the rig's meshes (built at rest pose). Eyes geometry (face_*) is left alone. */
export function paintDesignOnto(rig, design, { only = null, skip = null } = {}) {
  rig.root.updateMatrixWorld(true);
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), n = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), p = new THREE.Vector3();
  for (const m of rig.meshes) {
    const part = m.userData.part ?? '';
    if (/^face_/.test(part)) continue;
    if (only && !only.test(part)) continue;
    if (skip && skip.test(part)) continue;
    const g = m.geometry, pos = g.attributes.position, uv = g.attributes.uv;
    if (!uv) continue;
    const sheet = sheetOf(part), W = SIZE[sheet], H = W;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, H), px = img.data;
    const written = new Uint8Array(W * H);
    const idx = g.index ? g.index.array : null;
    const tri = idx ? idx.length / 3 : pos.count / 3;
    const vi = (t, k) => (idx ? idx[t * 3 + k] : t * 3 + k);
    for (let t = 0; t < tri; t++) {
      const ia = vi(t, 0), ib = vi(t, 1), ic = vi(t, 2);
      // Figure space: world positions with the rig's -0.5 stand offset undone (feet at y = 0)
      A.fromBufferAttribute(pos, ia).applyMatrix4(m.matrixWorld); A.y += 0.5;
      B.fromBufferAttribute(pos, ib).applyMatrix4(m.matrixWorld); B.y += 0.5;
      C.fromBufferAttribute(pos, ic).applyMatrix4(m.matrixWorld); C.y += 0.5;
      n.crossVectors(e1.subVectors(B, A), e2.subVectors(C, A)).normalize();
      const ax = uv.getX(ia) * W, ay = uv.getY(ia) * H;
      const bx = uv.getX(ib) * W, by = uv.getY(ib) * H;
      const cx = uv.getX(ic) * W, cy = uv.getY(ic) * H;
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
        const col = design(classify(sheet, p, n, -1, -1), p, n);
        const i = (y * W + x) * 4;
        px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = 255;
        written[y * W + x] = 1;
      }
    }
    // Bleed into empty texels so filtering never shows seams
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
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.flipY = false;   // glTF convention: v runs down the image, so texel rows = v * height
    const mat = m.material.clone();
    mat.map = tex;
    mat.color.setRGB(1, 1, 1);
    m.material = mat;
  }
}
