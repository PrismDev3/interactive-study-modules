/**
 * Oscorp.js — the reconstructed Oscorp research facility.
 *
 * Not a street stall and not a shell: the entrance, lobby, corridors and two research
 * laboratories are built as one connected, walkable building. It attaches to the real
 * Oscorp block found by Landmarks: a doorway is cut through that block's street wall,
 * and the facility occupies its empty ground floor. A 24 m corporate curtain wall with
 * integrated signage is applied to the frontage, so the tower and the labs read as one
 * building from the street.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mergeStatic } from './StaticMerge.js?v=3';

const plastic = (color, roughness = 0.45) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.04 });
const metal = (color, roughness = 0.32) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.72 });

/** Material registry — one instance per merged batch, so draw calls stay low. */
const MATS = {
  stone: () => plastic(0xb8bcc2, 0.55),
  stoneDark: () => plastic(0x878d95, 0.6),
  panel: () => plastic(0xeef1f4, 0.42),
  panelWarm: () => plastic(0xd3d8dd, 0.52),
  dark: () => metal(0x242a31, 0.48),
  steel: () => metal(0x9ba5ae, 0.3),
  darkSteel: () => metal(0x515b65, 0.4),
  black: () => plastic(0x16181c, 0.62),
  floor: () => plastic(0x8b959e, 0.6),
  floorDark: () => plastic(0x8e979f, 0.4),
  green: () => new THREE.MeshStandardMaterial({ color: 0x3aff7a, emissive: 0x1fbf5c, emissiveIntensity: 0.7, roughness: 0.35 }),
  greenDim: () => new THREE.MeshStandardMaterial({ color: 0x1f6a41, emissive: 0x0d4a28, emissiveIntensity: 0.6, roughness: 0.5 }),
  screen: () => new THREE.MeshStandardMaterial({ color: 0x0a2a18, emissive: 0x2fd070, emissiveIntensity: 0.5, roughness: 0.25 }),
  screenBlue: () => new THREE.MeshStandardMaterial({ color: 0x0a1e33, emissive: 0x2f8fd0, emissiveIntensity: 0.45, roughness: 0.25 }),
  light: () => new THREE.MeshStandardMaterial({ color: 0xf6fbff, emissive: 0xdff1ff, emissiveIntensity: 0.5, roughness: 0.4 }),
  hazard: () => plastic(0xd8b21a, 0.5),
  wood: () => plastic(0x6d4a30, 0.62),
  glass: () => new THREE.MeshStandardMaterial({
    color: 0xa8e4ff, transparent: true, opacity: 0.2, roughness: 0.04, metalness: 0.25,
    depthWrite: false, side: THREE.DoubleSide,
  }),
  glassDark: () => new THREE.MeshStandardMaterial({
    color: 0x193e4a, transparent: true, opacity: 0.55, roughness: 0.12, metalness: 0.5,
    depthWrite: false, side: THREE.DoubleSide,
  }),
  liquidGreen: () => new THREE.MeshStandardMaterial({ color: 0x53ff9a, emissive: 0x1fc060, emissiveIntensity: 0.6, transparent: true, opacity: 0.75, roughness: 0.2 }),
  liquidBlue: () => new THREE.MeshStandardMaterial({ color: 0x5ad0ff, emissive: 0x1a70c0, emissiveIntensity: 0.55, transparent: true, opacity: 0.75, roughness: 0.2 }),
  red: () => plastic(0xc01820, 0.4),
  chair: () => plastic(0x2a3138, 0.55),
  soil: () => plastic(0x4a3828, 0.85),
  leaf: () => plastic(0x2f7a46, 0.7),
  leafDark: () => plastic(0x236039, 0.7),
  plant: () => plastic(0x3c8f52, 0.7),
};

const NO_SHADOW = new Set(['light', 'green', 'greenDim', 'screen', 'screenBlue', 'liquidGreen', 'liquidBlue', 'glass', 'glassDark']);

/** Canvas sign panel, mounted on real fascia geometry rather than floating in the air. */
export function signPanel(text, w, h, {
  bg = '#0a171d', fg = '#7dffab', stroke = '#03140a', inner = null,
  sub = '', subColor = '#cfe8d6', border = '#2fd070', font = 'Lilita One', weight = 900,
} = {}) {
  const W = 1024, H = Math.max(64, Math.round(1024 * h / w));
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const paint = () => {
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, W, H);
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    if (border) { g.strokeStyle = border; g.lineWidth = Math.max(5, H * 0.022); g.strokeRect(g.lineWidth, g.lineWidth, W - g.lineWidth * 2, H - g.lineWidth * 2); }
    let size = H * (sub ? 0.56 : 0.7);
    g.font = `${weight} ${size}px "${font}", "Arial Black", sans-serif`;
    while (g.measureText(text).width > W * 0.88 && size > 12) { size *= 0.93; g.font = `${weight} ${size}px "${font}", "Arial Black", sans-serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const cy = sub ? H * 0.4 : H * 0.52;
    g.lineWidth = size * 0.14; g.strokeStyle = stroke; g.strokeText(text, W / 2, cy);
    if (inner) { g.lineWidth = size * 0.05; g.strokeStyle = inner; g.strokeText(text, W / 2, cy); }
    g.fillStyle = fg; g.fillText(text, W / 2, cy);
    if (sub) {
      let ss = H * 0.16;
      g.font = `600 ${ss}px "Fredoka", Arial, sans-serif`;
      while (g.measureText(sub).width > W * 0.86 && ss > 9) { ss *= 0.93; g.font = `600 ${ss}px "Fredoka", Arial, sans-serif`; }
      g.fillStyle = subColor; g.fillText(sub, W / 2, H * 0.76);
    }
    tex.needsUpdate = true;
  };
  paint();
  document.fonts?.load(`80px "${font}"`).then(paint).catch(() => {});
  document.fonts?.load('30px "Fredoka"').then(paint).catch(() => {});
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide, transparent: false,
  }));
}

/**
 * Remove a rectangular opening from the merged city wall. City wall triangles can be many
 * metres across, so each touching triangle is subdivided first; pieces whose centre falls in
 * the opening are dropped, leaving a rough cut that the entrance frame covers.
 */
export function cutOpening(meshes, box) {
  const FLT = (a) => a instanceof Float32Array || a instanceof Float64Array;
  for (const mesh of meshes) {
    const geo = mesh?.geometry;
    const pos = geo?.attributes?.position;
    if (!pos || !geo.attributes.normal) continue;
    if (!geo.boundingBox) geo.computeBoundingBox();
    if (!geo.boundingBox || !geo.boundingBox.intersectsBox(box)) continue;
    const idx = geo.index;
    const triCount = idx ? idx.count / 3 : pos.count / 3;
    const names = Object.keys(geo.attributes);
    const rec = (vi) => {
      const v = {};
      for (const name of names) {
        const a = geo.attributes[name];
        const n = a.itemSize;
        const raw = a.getComponent ? Array.from({ length: n }, (_, k) => a.getComponent(vi, k)) : Array.from({ length: n }, (_, k) => a.array[vi * n + k]);
        v[name] = { v: raw, int: !FLT(a.array) };
      }
      return v;
    };
    const lerpV = (a, b, t) => {
      const out = {};
      for (const name of names) {
        const A = a[name].v, B = b[name].v;
        out[name] = { int: a[name].int, v: A.map((x, k) => a[name].int ? (t < 0.5 ? x : B[k]) : x + (B[k] - x) * t) };
      }
      return out;
    };
    const out = [];
    let touched = false;
    const emit = tri => { for (const v of tri) out.push(v); };
    const subdivide = (tri, depth) => {
      const [a, b, c] = tri;
      let maxEdge = 0;
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        const d = Math.hypot(p.position.v[0] - q.position.v[0], p.position.v[1] - q.position.v[1], p.position.v[2] - q.position.v[2]);
        maxEdge = Math.max(maxEdge, d);
      }
      if (maxEdge > 1.65 && depth < 6) {
        const ab = lerpV(a, b, 0.5), bc = lerpV(b, c, 0.5), ca = lerpV(c, a, 0.5);
        subdivide([a, ab, ca], depth + 1);
        subdivide([ab, b, bc], depth + 1);
        subdivide([ca, bc, c], depth + 1);
        subdivide([ab, bc, ca], depth + 1);
        return;
      }
      const p = [a.position.v, b.position.v, c.position.v];
      const cx = (p[0][0] + p[1][0] + p[2][0]) / 3;
      const cy = (p[0][1] + p[1][1] + p[2][1]) / 3;
      const cz = (p[0][2] + p[1][2] + p[2][2]) / 3;
      if (cx > box.min.x && cx < box.max.x && cy > box.min.y && cy < box.max.y && cz > box.min.z && cz < box.max.z) return;
      emit(tri);
    };
    const triBox = new THREE.Box3();
    for (let t = 0; t < triCount; t++) {
      const vi = [0, 1, 2].map(k => idx ? idx.getX(t * 3 + k) : t * 3 + k);
      const tri = vi.map(rec);
      triBox.setFromPoints(tri.map(v => new THREE.Vector3(v.position.v[0], v.position.v[1], v.position.v[2])));
      if (!triBox.intersectsBox(box)) { emit(tri); continue; }
      touched = true;
      subdivide(tri, 0);
    }
    if (!touched) continue;
    // Rebuild as a non-indexed soup so the repaired wall stays a single draw call.
    const attrs = {};
    for (const name of names) {
      const src = geo.attributes[name];
      const n = src.itemSize;
      const arr = FLT(src.array) ? new Float32Array(out.length * n) : new Int16Array(out.length * n);
      for (let i = 0; i < out.length; i++) for (let k = 0; k < n; k++) arr[i * n + k] = out[i][name].v[k];
      attrs[name] = new THREE.BufferAttribute(arr, n, src.normalized);
    }
    const next = new THREE.BufferGeometry();
    for (const name of names) next.setAttribute(name, attrs[name]);
    next.computeBoundingBox();
    next.computeBoundingSphere();
    mesh.geometry = next;
    try { next.computeBoundsTree?.(); } catch (e) { /* collision tree rebuilt from the new geometry */ }
  }
}

/**
 * Build the facility against the Oscorp block's street wall.
 * @returns {{group: THREE.Group, places: object, anchors: object, update: Function}|null}
 */
export function buildOscorp({ scene, meshes, tower, street, ray: sharedRay = null }) {
  if (!tower || !street) return null;
  const ray = sharedRay ?? Object.assign(new THREE.Raycaster(), { firstHitOnly: true });
  const dir = new THREE.Vector3(tower.x - street.x, 0, tower.z - street.z);
  if (dir.lengthSq() < 0.01) return null;
  dir.normalize();
  // A wall between the street and the tower is the building's frontage.
  ray.set(new THREE.Vector3(street.x, street.y + 1.6, street.z), dir);
  ray.far = 42;
  let wallHit = null;
  for (const m of meshes) {
    const h = m.geometry?.boundsTree?.raycastFirst(ray.ray, THREE.DoubleSide, 0, ray.far);
    if (h && (!wallHit || h.distance < wallHit.distance)) wallHit = h;
  }
  // The story spot can sit only centimetres off the pavement wall; the forecourt is outward.
  if (!wallHit || wallHit.distance > 34) return null;

  const dropAt = (x, z) => {
    const down = new THREE.Ray(new THREE.Vector3(x, 240, z), new THREE.Vector3(0, -1, 0));
    let best = null;
    for (const m of meshes) {
      const h = m.geometry?.boundsTree?.raycastFirst(down, THREE.DoubleSide, 0, 260);
      if (h && (!best || h.distance < best.distance)) best = h;
    }
    return best ? best.point.y : street.y;
  };
  const wallX = wallHit.point.x, wallZ = wallHit.point.z;
  const floorY = Math.min(street.y, dropAt(wallX - dir.x * 1.4, wallZ - dir.z * 1.4));
  const yaw = Math.atan2(dir.x, dir.z);       // local +z points into the building

  const g = new THREE.Group();
  g.position.set(wallX, floorY, wallZ);
  g.rotation.y = yaw;
  g.name = 'OscorpResearchFacility';

  const batches = new Map();
  const solids = [];
  const put = (key, geo) => {
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(geo);
  };
  const solid = (w, h, d, x, y, z, ry = 0) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (ry) geo.rotateY(ry);
    geo.translate(x, y, z);
    solids.push(geo);
  };
  const box = (key, w, h, d, x, y, z, { ry = 0, solid: isSolid = false } = {}) => {
    const geo = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    geo.deleteAttribute('uv');
    if (ry) geo.rotateY(ry);
    geo.translate(x, y, z);
    put(key, geo);
    if (isSolid) solid(w, h, d, x, y, z, ry);
  };
  const cyl = (key, rTop, rBot, h, seg, x, y, z, { solid: isSolid = false, rx = 0, rz = 0 } = {}) => {
    const geo = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, false).toNonIndexed();
    geo.deleteAttribute('uv');
    if (rx) geo.rotateX(rx);
    if (rz) geo.rotateZ(rz);
    geo.translate(x, y, z);
    put(key, geo);
    if (isSolid) solid(rTop * 2, h, rTop * 2, x, y, z);
  };
  const addSign = (text, w, h, x, y, z, ry = Math.PI, opts = {}) => {
    const s = signPanel(text, w, h, opts);
    s.position.set(x, y, z);
    s.rotation.y = ry;
    g.add(s);
    return s;
  };

  // ── exterior: corporate façade on the real building frontage ───────────────
  box('dark', 24.8, 18.0, 0.35, 0, 9.0, -0.55);                       // backing wall hides the old masonry face
  box('stone', 25.2, 0.55, 1.0, 0, 18.15, -0.9);                      // cornice
  box('green', 24.9, 0.16, 0.5, 0, 17.75, -1.22);                     // green light band under the cornice
  for (const x of [-12.2, -8.2, -4.2, 4.2, 8.2, 12.2]) {
    box('stone', 0.62, 18.0, 1.05, x, 9.0, -0.95);                    // structural piers
    box('stoneDark', 0.72, 0.4, 1.15, x, 7.2, -0.95);
  }
  for (const x of [-10.2, -6.2, 6.2, 10.2]) {
    // Upper glass curtain wall, split by mullions; a few offices glow at dusk.
    for (const [y, lit] of [[8.85, false], [11.35, true], [13.75, true], [16.05, false]]) {
      box(lit ? 'screenBlue' : 'glassDark', 3.25, 2.05, 0.06, x, y, -1.34);
      box('steel', 3.3, 0.12, 0.14, x, y - 1.06, -1.3);
    }
    box('steel', 0.1, 9.0, 0.14, x, 12.4, -1.3);
    // Lower stone bays with a tall ribbon window.
    box('panelWarm', 3.35, 6.7, 0.28, x, 3.85, -0.92);
    box('glassDark', 1.5, 4.4, 0.08, x, 4.15, -1.08);
  }
  // entrance recess and doors
  box('dark', 7.6, 7.5, 0.3, 0, 3.78, -1.06);
  box('glass', 6.9, 6.9, 0.06, 0, 3.9, -1.18);
  // a lit lobby wall directly beyond the doors, so the entrance reads as occupied
  box('light', 5.8, 0.14, 0.4, 0, 4.55, 0.5);
  box('light', 0.3, 3.4, 0.4, -3.0, 2.4, 0.5);
  box('light', 0.3, 3.4, 0.4, 3.0, 2.4, 0.5);
  for (const x of [-3.45, -1.8, 0, 1.8, 3.45]) box('steel', 0.09, 6.9, 0.12, x, 3.9, -1.22);
  box('steel', 7.0, 0.14, 0.12, 0, 3.35, -1.22);
  box('steel', 7.0, 0.14, 0.12, 0, 6.35, -1.22);
  for (const s of [-1, 1]) {
    box('steel', 0.1, 3.05, 0.14, s * 1.76, 2.02, -1.24);             // sliding door stiles
    box('glass', 1.66, 2.95, 0.05, s * 1.76, 2.02, -1.24, { solid: false });
    box('steel', 0.05, 0.75, 0.06, s * 1.15, 1.55, -1.3);             // push bar
  }
  // canopy over the entrance: real slab, tension rods and lighting
  box('dark', 10.4, 0.34, 3.6, 0, 7.18, -3.1);
  box('green', 10.0, 0.08, 0.16, 0, 7.0, -4.82);
  for (const s of [-1, 1]) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 5.3, 8), MATS.steel());
    rod.position.set(s * 4.3, 8.5, -2.75); rod.rotation.x = 0.7; g.add(rod);
    box('steel', 0.22, 4.4, 0.22, s * 4.75, 3.4, -4.55, { solid: true });
  }
  // fascia sign, physically mounted on the façade above the canopy
  box('dark', 10.2, 2.75, 0.35, 0, 9.25, -1.32);
  box('green', 9.9, 0.1, 0.5, 0, 10.58, -1.34);
  box('green', 9.9, 0.1, 0.5, 0, 7.92, -1.34);
  addSign('OSCORP', 9.2, 1.9, 0, 9.28, -1.52, Math.PI, { bg: '#06130c', fg: '#86ffb2', stroke: '#020a05', inner: '#d8ffe4', border: '#37e07c' });
  addSign('RESEARCH & DEVELOPMENT', 4.6, 0.55, 0, 6.62, -1.3, Math.PI, { bg: '#0a1418', fg: '#cfe8dc', stroke: '#0a1418', border: null, font: 'Fredoka', weight: 600 });
  addSign('OSCORP LABS', 3.2, 0.5, 0, 6.98, -4.84, Math.PI, { bg: '#07140c', fg: '#7dffab', stroke: '#03140a', border: '#2fd070', font: 'Fredoka', weight: 700 });

  // forecourt: threshold, bollards, planters and the campus pylon
  box('stoneDark', 25.6, 0.16, 1.5, 0, 0.08, -1.0);
  for (const s of [-1, 1]) {
    for (const x of [5.9, 8.7, 11.2]) {
      cyl('steel', 0.16, 0.18, 1.0, 10, s * x, 0.5, -4.4, { solid: true });
      cyl('green', 0.17, 0.17, 0.06, 10, s * x, 0.88, -4.4);
    }
    box('stoneDark', 3.2, 0.62, 1.3, s * 10.4, 0.31, -3.3, { solid: true });
    box('soil', 2.9, 0.1, 1.05, s * 10.4, 0.66, -3.3);
    for (let k = 0; k < 5; k++) {
      const bx = s * 10.4 + (k - 2) * 0.5;
      box(k % 2 ? 'leaf' : 'leafDark', 0.55, 0.5 + (k % 3) * 0.12, 0.55, bx, 0.98 + (k % 3) * 0.06, -3.3 + (k % 2 ? 0.16 : -0.16));
    }
  }
  // freestanding pylon, anchored in a concrete base
  box('stoneDark', 1.0, 0.25, 2.3, -12.9, 0.12, -6.2);
  box('dark', 0.72, 4.0, 1.9, -12.9, 2.2, -6.2, { solid: true });
  box('green', 0.78, 0.1, 1.96, -12.9, 4.15, -6.2);
  addSign('OSCORP', 1.62, 1.15, -12.9, 2.7, -5.24, Math.PI, { bg: '#07140c', fg: '#86ffb2', border: '#2fd070' });
  addSign('RESEARCH', 1.5, 0.34, -12.9, 1.9, -5.24, Math.PI, { bg: '#07140c', fg: '#cfe8d8', border: null, font: 'Fredoka', weight: 600 });
  // ── tower shaft: Oscorp curtain wall over the existing 92 m block ──────────
  const SHAFT_Y = 18.0, SHAFT_H = 70.4;
  box('dark', 24.6, SHAFT_H, 0.3, 0, SHAFT_Y + SHAFT_H / 2, -0.64);
  const COLS = 8, colW = 24 / COLS, ROWS = 21, rowH = SHAFT_H / ROWS;
  for (let r = 0; r < ROWS; r++) {
    const y = SHAFT_Y + rowH * (r + 0.5);
    for (let c = 0; c < COLS; c++) {
      const x = -12 + colW * (c + 0.5);
      const lit = ((r * 5 + c * 3) % 13) < 3;
      box(lit ? 'screenBlue' : 'glassDark', colW - 0.26, rowH - 0.34, 0.06, x, y, -0.84);
      if (c) box('steel', 0.1, rowH - 0.28, 0.12, x - colW / 2, y, -0.9);
    }
    box('steel', 24.1, 0.14, 0.14, 0, SHAFT_Y + rowH * (r + 1), -0.9);
    if (r % 4 === 3) box('greenDim', 24.1, 0.09, 0.1, 0, SHAFT_Y + rowH * (r + 1), -0.98);
  }
  for (const s of [-1, 1]) {
    box('steel', 0.24, SHAFT_H, 0.24, s * 12.1, SHAFT_Y + SHAFT_H / 2, -0.9);
    box('green', 0.14, SHAFT_H - 1.2, 0.14, s * 12.23, SHAFT_Y + SHAFT_H / 2, -0.96);
  }
  // shaft signage, framed into the curtain wall
  box('dark', 9.8, 2.5, 0.3, 0, 33.2, -1.0);
  box('green', 9.5, 0.09, 0.42, 0, 34.42, -1.02);
  box('green', 9.5, 0.09, 0.42, 0, 31.98, -1.02);
  addSign('OSCORP', 9.0, 1.85, 0, 33.2, -1.2, Math.PI, { bg: '#06130c', fg: '#86ffb2', stroke: '#020a05', inner: '#d8ffe4', border: '#37e07c' });
  addSign('OSCORP', 7.2, 1.5, 0, 84.4, -1.1, Math.PI, { bg: '#06130c', fg: '#86ffb2', stroke: '#020a05', inner: '#d8ffe4', border: '#37e07c' });
  // roof crown and mechanical equipment on the real roof deck
  box('green', 24.8, 0.4, 0.9, 0, SHAFT_Y + SHAFT_H + 0.2, -0.8);
  box('darkSteel', 9.0, 2.0, 4.2, 0, SHAFT_Y + SHAFT_H + 1.2, 1.4, { solid: true });
  for (let k = 0; k < 7; k++) box('black', 8.4, 0.1, 0.16, 0, SHAFT_Y + SHAFT_H + 0.6 + k * 0.18, -0.84);
  cyl('steel', 0.18, 0.24, 11, 8, 4.2, SHAFT_Y + SHAFT_H + 7.2, 1.2);
  cyl('green', 0.3, 0.3, 0.25, 8, 4.2, SHAFT_Y + SHAFT_H + 12.8, 1.2);

  // ── interior shell ─────────────────────────────────────────────────────────
  // Local floor is 0.12 m above the sidewalk; the group is already at street height.
  box('floor', 23.4, 0.24, 29.6, 0, 0.0, 14.9);
  solid(23.4, 0.24, 29.6, 0, 0.0, 14.9);                               // walkable slab
  // polished tiled lobby floor (one textured draw call instead of a white slab)
  {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = '#9fa9b1'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 400; i++) {
      x.fillStyle = `rgba(${160 + Math.random() * 30 | 0},${168 + Math.random() * 28 | 0},${176 + Math.random() * 26 | 0},.25)`;
      x.fillRect(Math.random() * 512, Math.random() * 512, 22 + Math.random() * 40, 22 + Math.random() * 40);
    }
    x.strokeStyle = '#7c858d'; x.lineWidth = 5;
    for (let k = 0; k <= 4; k++) { x.beginPath(); x.moveTo(k * 128, 0); x.lineTo(k * 128, 512); x.stroke(); x.beginPath(); x.moveTo(0, k * 128); x.lineTo(512, k * 128); x.stroke(); }
    x.strokeStyle = '#b8c0c6'; x.lineWidth = 2; x.strokeRect(3, 3, 506, 506);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 5); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(23.2, 29.4), new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.135, 14.9);
    floor.receiveShadow = true;
    g.add(floor);
  }
  // green inlay guiding visitors from the door to the lobby
  for (const sx of [-1, 1]) box('greenDim', 0.12, 0.02, 6.2, sx * 1.5, 0.155, 2.4);
  box('greenDim', 3.1, 0.02, 0.12, 0, 0.155, 5.5);
  box('stoneDark', 7.4, 0.12, 1.4, 0, 0.12, -0.3);                     // threshold ramp
  solid(7.4, 0.12, 1.4, 0, 0.12, -0.3);
  box('panel', 23.4, 0.3, 29.6, 0, 5.28, 14.9);                        // ceiling
  solid(23.4, 0.3, 29.6, 0, 5.28, 14.9);
  for (const s of [-1, 1]) {
    box('panel', 0.32, 5.3, 29.6, s * 11.7, 2.66, 14.9);
    solid(0.32, 5.3, 29.6, s * 11.7, 2.66, 14.9);
    box('greenDim', 0.06, 0.12, 27, s * 11.5, 4.65, 15.0);
  }
  box('panel', 23.4, 5.3, 0.32, 0, 2.66, 29.95);
  solid(23.4, 5.3, 0.32, 0, 2.66, 29.95);
  // front wall either side of the doorway (our own clean interior face)
  for (const s of [-1, 1]) {
    box('panelWarm', 8.4, 5.3, 0.32, s * 7.7, 2.66, 0.18);
    solid(8.4, 5.3, 0.32, s * 7.7, 2.66, 0.18);
  }
  box('dark', 7.4, 0.6, 0.5, 0, 4.85, -0.1);                            // door head

  // ── lobby (z 0 – 12.4) ────────────────────────────────────────────────────
  // lobby/lab partition with a wide central opening and glass above
  for (const s of [-1, 1]) {
    box('panel', 7.0, 3.2, 0.3, s * 8.2, 1.6, 12.4);
    solid(7.0, 3.2, 0.3, s * 8.2, 1.6, 12.4);
    box('glass', 7.0, 2.0, 0.06, s * 8.2, 4.2, 12.4);
    box('steel', 0.16, 5.25, 0.2, s * 2.6, 2.63, 12.4);
    for (const x of [s * 5.2, s * 8.4, s * 11.55]) box('steel', 0.1, 3.2, 0.16, x, 1.6, 12.4);
  }
  box('dark', 5.2, 0.45, 0.4, 0, 3.35, 12.4);                           // opening lintel
  // reception: desk, backlit brand wall, monitor and seat
  box('panelWarm', 4.3, 1.12, 1.15, -5.0, 0.72, 8.1, { solid: true });
  box('dark', 4.45, 0.12, 1.32, -5.0, 1.3, 8.05);
  box('greenDim', 4.2, 0.08, 0.05, -5.0, 1.05, 7.5);
  box('black', 0.82, 0.52, 0.07, -4.6, 1.65, 8.4);
  box('screen', 0.74, 0.44, 0.02, -4.6, 1.65, 8.35);
  box('steel', 0.09, 0.3, 0.09, -4.6, 1.35, 8.42);
  for (const x of [-6.3, -5.6]) {
    cyl('black', 0.28, 0.3, 0.09, 10, x, 1.55, 8.9);
    box('chair', 0.08, 0.55, 0.08, x, 1.2, 8.9);
  }
  box('dark', 5.6, 3.1, 0.28, -5.0, 1.55, 9.6);
  solid(5.6, 3.1, 0.28, -5.0, 1.55, 9.6);
  addSign('OSCORP', 4.8, 1.05, -5.0, 2.0, 9.44, Math.PI, { bg: '#07140c', fg: '#86ffb2', border: '#2fd070' });
  addSign('RECEPTION', 2.6, 0.32, -5.0, 1.25, 9.42, Math.PI, { bg: '#07140c', fg: '#cfe8d8', border: null, font: 'Fredoka', weight: 600 });
  // security desk and belt barriers
  box('panelWarm', 2.7, 1.08, 1.0, 6.2, 0.66, 4.3, { solid: true });
  box('dark', 2.84, 0.1, 1.14, 6.2, 1.24, 4.3);
  box('black', 0.72, 0.44, 0.07, 6.2, 1.55, 4.75);
  box('screenBlue', 0.64, 0.36, 0.02, 6.2, 1.55, 4.7);
  for (const x of [3.3, 5.0]) {
    cyl('steel', 0.08, 0.1, 0.95, 8, x, 0.48, 2.6, { solid: true });
    box('red', 1.55, 0.07, 0.06, x + 0.78, 0.9, 2.6);
  }
  // elevator bank on the east wall
  for (const z of [6.6, 8.3, 10.0]) {
    box('dark', 0.12, 3.0, 1.5, 11.48, 1.62, z);
    box('steel', 0.16, 2.75, 1.25, 11.4, 1.55, z);
    box('darkSteel', 0.07, 2.6, 0.06, 11.29, 1.5, z);
    box('green', 0.1, 0.1, 0.5, 11.4, 3.18, z);
  }
  box('dark', 0.22, 0.85, 0.5, 11.34, 1.5, 5.55);
  box('green', 0.05, 0.16, 0.16, 11.22, 1.62, 5.55);
  addSign('ELEVATORS', 2.2, 0.3, 11.25, 3.55, 8.3, -Math.PI / 2, { bg: '#07140c', fg: '#cfe8d8', border: null, font: 'Fredoka', weight: 600 });
  // lobby seating and greenery
  for (const s of [-1, 1]) {
    box('chair', 2.6, 0.34, 0.85, s * 8.4, 0.46, 3.0, { solid: true });
    box('chair', 2.6, 0.62, 0.16, s * 8.4, 0.9, 2.62);
    box('wood', 2.4, 0.08, 0.82, s * 8.4, 0.66, 3.0);
    for (const e of [-1, 1]) box('steel', 0.1, 0.34, 0.7, s * 8.4 + e * 1.15, 0.27, 3.0);
    cyl('stoneDark', 0.62, 0.7, 0.66, 12, s * 9.9, 0.45, 7.0, { solid: true });
    box('soil', 1.0, 0.08, 1.0, s * 9.9, 0.79, 7.0);
    cyl('wood', 0.1, 0.14, 1.5, 7, s * 9.9, 1.55, 7.0);
    for (let k = 0; k < 4; k++) box(k % 2 ? 'leaf' : 'leafDark', 0.85, 0.7, 0.85, s * 9.9 + (k % 2 ? 0.34 : -0.3), 2.4 + k * 0.22, 7.0 + (k % 2 ? 0.26 : -0.24));
  }
  // central holographic DNA feature
  cyl('stoneDark', 1.25, 1.35, 0.42, 18, 0, 0.33, 8.6, { solid: true });
  cyl('greenDim', 1.16, 1.16, 0.06, 18, 0, 0.57, 8.6);
  const dna = new THREE.Group();
  const holo = new THREE.MeshBasicMaterial({ color: 0x67ffa8, transparent: true, opacity: 0.75 });
  for (let k = 0; k < 22; k++) {
    const y = 0.7 + k * 0.16, a = k * 0.55, r = 0.5;
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), holo);
      b.position.set(Math.cos(a) * r * s, y, Math.sin(a) * r * s);
      dna.add(b);
    }
    const rung = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.022, 0.022), holo);
    rung.position.y = y; rung.rotation.y = -a;
    dna.add(rung);
  }
  dna.position.set(0, 0.6, 8.6);
  g.add(dna);
  // hanging brand banners in the double-height lobby
  for (const s of [-1, 1]) {
    box('steel', 0.08, 0.08, 0.08, s * 7.2, 5.16, 10.2);
    const ban = signPanel('OSCORP', 1.2, 2.9, { bg: '#0b2218', fg: '#7dffab', stroke: '#04120a', border: '#2fd070', sub: 'SCIENCE FIRST', subColor: '#bfe8cd' });
    ban.position.set(s * 7.2, 3.6, 10.2); g.add(ban);
  }
  // wayfinding
  box('dark', 3.6, 0.75, 0.18, 0, 3.9, 11.9);
  addSign('RESEARCH LABS →', 3.35, 0.55, 0, 3.9, 11.98, Math.PI, { bg: '#0a1712', fg: '#d6ffe6', stroke: '#03140a', border: null, font: 'Fredoka', weight: 600 });
  for (const x of [-8.5, -4.5, 4.5, 8.5]) {
    box('light', 2.5, 0.07, 1.15, x, 5.12, 6.0);
    box('light', 2.5, 0.07, 1.15, x, 5.12, 10.2);
  }

  // ── corridor (z 12.4 – 15.4) ──────────────────────────────────────────────
  box('panelWarm', 23.4, 0.25, 3.1, 0, 4.45, 13.9);
  solid(23.4, 0.25, 3.1, 0, 4.45, 13.9);
  for (const x of [-8.0, 0, 8.0]) box('light', 3.0, 0.06, 1.1, x, 4.29, 13.9);
  box('greenDim', 23.0, 0.16, 0.1, 0, 2.2, 12.58);
  // lab wall: solid bays, two glazed doors
  for (const [x, w] of [[-9.1, 5.2], [-1.3, 4.6], [7.1, 5.2]]) {
    box('panel', w, 3.2, 0.32, x, 1.6, 15.4);
    solid(w, 3.2, 0.32, x, 1.6, 15.4);
    box('glass', w, 1.2, 0.06, x, 3.7, 15.4);
  }
  for (const x of [-5.8, 5.8]) {
    box('dark', 2.9, 0.35, 0.4, x, 3.05, 15.4);
    box('glass', 2.6, 2.85, 0.06, x, 1.5, 15.4);
    box('steel', 0.08, 2.85, 0.12, x - 1.3, 1.5, 15.4);
    box('steel', 0.08, 2.85, 0.12, x + 1.3, 1.5, 15.4);
    box('green', 0.06, 0.5, 0.06, x + 1.12, 1.5, 15.3);
  }
  addSign('RESEARCH LAB A', 2.4, 0.3, 5.8, 3.35, 15.22, Math.PI, { bg: '#07140c', fg: '#cfe8d8', border: null, font: 'Fredoka', weight: 600 });
  addSign('RESEARCH LAB B', 2.4, 0.3, -5.8, 3.35, 15.22, Math.PI, { bg: '#07140c', fg: '#cfe8d8', border: null, font: 'Fredoka', weight: 600 });

  // ── research laboratory A (east) ──────────────────────────────────────────
  box('panelWarm', 11.4, 0.22, 14.4, 5.9, 5.0, 22.6);
  solid(11.4, 0.22, 14.4, 5.9, 5.0, 22.6);
  for (const x of [3.0, 6.0, 9.0]) box('light', 2.2, 0.06, 1.0, x, 4.88, 20.0);
  // hazard stripe at the lab threshold
  for (let k = 0; k < 12; k++) box(k % 2 ? 'black' : 'hazard', 0.32, 0.03, 0.6, 1.4 + k * 0.34, 0.14, 16.0);
  // glass partition between the labs
  for (const z of [16.2, 20.2, 24.2, 28.2]) box('steel', 0.14, 5.2, 0.14, 0.25, 2.6, z);
  box('glass', 0.05, 3.3, 12.0, 0.25, 1.9, 22.2);
  box('steel', 0.18, 0.16, 12.2, 0.25, 3.6, 22.2);
  // containment wall: three specimen tanks on plinths
  for (const [x, liq, label] of [[3.2, 'liquidGreen', 'SPECIMEN 01'], [6.2, 'liquidGreen', 'SPECIMEN 02'], [9.2, 'liquidBlue', 'SPECIMEN 03']]) {
    box('panelWarm', 1.9, 0.85, 1.9, x, 0.55, 27.6, { solid: true });
    box('dark', 1.98, 0.1, 1.98, x, 1.02, 27.6);
    cyl('glass', 0.82, 0.82, 2.45, 16, x, 2.3, 27.6);
    cyl(liq, 0.7, 0.7, 1.25, 14, x, 1.72, 27.6);
    cyl('steel', 0.9, 0.9, 0.18, 16, x, 3.54, 27.6);
    cyl('steel', 0.1, 0.1, 1.35, 8, x, 3.05, 27.6);
    box('dark', 0.9, 0.3, 0.04, x, 1.24, 26.62);
    addSign(label, 0.85, 0.14, x, 1.24, 26.6, Math.PI, { bg: '#0a1410', fg: '#9fe8bb', border: null, font: 'Fredoka', weight: 600 });
  }
  // open cross-species enclosure — the one the story uses
  box('panelWarm', 2.2, 0.9, 1.7, 3.2, 0.57, 25.1, { solid: true });
  box('dark', 2.3, 0.1, 1.8, 3.2, 1.07, 25.1);
  box('glass', 2.05, 0.95, 1.55, 3.2, 1.6, 25.1);
  {
    const lidGeo = new THREE.BoxGeometry(2.2, 0.1, 1.7).toNonIndexed();
    lidGeo.deleteAttribute('uv');
    lidGeo.rotateY(0.35);
    lidGeo.rotateZ(-0.5);
    lidGeo.translate(4.9, 2.35, 26.15);
    put('steel', lidGeo);
  }
  box('soil', 1.8, 0.08, 1.3, 3.2, 1.12, 25.1);
  // a red-and-blue specimen resting on the open rim
  const spider = new THREE.Group();
  {
    const sRed = MATS.red();
    const sBlue = plastic(0x1d4fc4, 0.4);
    const sLeg = plastic(0x1a1d24, 0.5);
    const sGlow = new THREE.MeshStandardMaterial({ color: 0x9dffb8, emissive: 0x3aff7a, emissiveIntensity: 1.2 });
    // abdomen (rear), cephalothorax (front), head
    const abd = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), sRed);
    abd.scale.set(1, 0.75, 1.25); abd.position.set(0, 0.045, -0.06); spider.add(abd);
    const stripe = new THREE.Mesh(new THREE.SphereGeometry(0.061, 12, 10, 0, Math.PI * 2, 0, 0.9), sBlue);
    stripe.scale.copy(abd.scale); stripe.position.copy(abd.position); spider.add(stripe);
    const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 8), sBlue);
    thorax.scale.set(1, 0.7, 1.1); thorax.position.set(0, 0.035, 0.03); spider.add(thorax);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), sRed);
    head.position.set(0, 0.035, 0.07); spider.add(head);
    for (const ex of [-0.009, 0.009]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), sGlow);
      eye.position.set(ex, 0.045, 0.088); spider.add(eye);
    }
    // eight jointed legs: upper segment rises, lower segment drops to the rim
    for (let side = -1; side <= 1; side += 2) {
      for (let k = 0; k < 4; k++) {
        const yaw = (-0.75 + k * 0.5);                  // fan from front to back
        const pivot = new THREE.Group();
        pivot.position.set(side * 0.02, 0.035, 0.03 - k * 0.012);
        pivot.rotation.y = side > 0 ? -yaw : Math.PI + yaw;
        const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.07, 5), sLeg);
        upper.rotation.z = -Math.PI / 2 + 0.7; upper.position.set(0.027, 0.022, 0);
        const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.08, 5), sLeg);
        lower.rotation.z = -0.35; lower.position.set(0.068, 0.006, 0);
        pivot.add(upper, lower);
        spider.add(pivot);
      }
    }
    spider.scale.setScalar(1.6);
  }
  // resting on the top edge of the enclosure glass (glass top = 2.075)
  spider.position.set(3.2, 2.08, 24.38);
  spider.rotation.y = Math.PI;
  g.add(spider);
  const spiderGlow = new THREE.PointLight(0x5cff8e, 0.9, 1.6, 2);
  spiderGlow.position.set(3.2, 2.35, 24.4);
  g.add(spiderGlow);
  addSign('CROSS-SPECIES ENCLOSURE', 2.0, 0.2, 3.2, 1.9, 24.18, Math.PI, { bg: '#0a1410', fg: '#9fe8bb', border: null, font: 'Fredoka', weight: 600 });
  // lab islands
  for (const x of [6.4]) {
    box('panel', 3.2, 0.88, 1.25, x, 0.56, 19.4, { solid: true });
    box('dark', 3.35, 0.1, 1.38, x, 1.03, 19.4);
    box('black', 0.88, 0.55, 0.07, x - 0.7, 1.35, 20.0);
    box('screen', 0.8, 0.47, 0.02, x - 0.7, 1.35, 19.95);
    box('steel', 0.1, 0.32, 0.1, x - 0.7, 1.04, 20.03);
    for (let k = 0; k < 3; k++) {
      cyl('glass', 0.075, 0.075, 0.24, 8, x + 0.25 + k * 0.28, 1.18, 19.25);
      cyl(k % 2 ? 'liquidGreen' : 'liquidBlue', 0.062, 0.062, 0.11, 8, x + 0.25 + k * 0.28, 1.12, 19.25);
    }
    cyl('steel', 0.06, 0.07, 0.5, 8, x + 1.1, 1.33, 19.2);
    box('steel', 0.5, 0.06, 0.35, x + 1.1, 1.55, 19.2);
    box('black', 0.06, 0.2, 0.06, x + 1.1, 1.45, 19.32);
    // stool
    cyl('chair', 0.24, 0.26, 0.08, 10, x - 0.3, 0.72, 18.4);
    cyl('steel', 0.05, 0.07, 0.65, 8, x - 0.3, 0.37, 18.4);
  }
  // wall bench, sink and glassware along the east wall
  box('panel', 0.95, 0.9, 7.4, 11.05, 0.57, 21.0, { solid: true });
  box('dark', 1.05, 0.08, 7.5, 11.0, 1.02, 21.0);
  box('glass', 0.8, 0.12, 1.1, 11.0, 1.1, 18.4);
  cyl('steel', 0.035, 0.035, 0.5, 8, 11.25, 1.3, 18.4);
  box('steel', 0.32, 0.05, 0.05, 11.08, 1.55, 18.4);
  for (let k = 0; k < 2; k++) cyl('glass', 0.07, 0.07, 0.2, 8, 10.9, 1.16, 21.0 + k * 0.8);
  // fume hood in the corner
  box('panel', 2.3, 2.4, 1.3, 2.6, 1.2, 29.0, { solid: true });
  box('glass', 2.05, 1.35, 0.08, 2.6, 1.75, 28.32);
  box('dark', 2.4, 0.2, 1.45, 2.6, 2.5, 28.95);
  box('green', 0.5, 0.08, 0.08, 2.6, 2.44, 28.2);
  // cabinet, extinguisher, whiteboard
  box('panelWarm', 2.2, 2.1, 0.6, 9.9, 1.05, 29.4, { solid: true });
  for (const y of [1.3, 1.9]) box('steel', 2.0, 0.06, 0.62, 9.9, y, 29.4);
  box('panel', 2.6, 1.35, 0.09, 7.0, 2.3, 29.7);
  box('screen', 2.3, 1.05, 0.02, 7.0, 2.32, 29.65);
  addSign('PROJECT: CROSS-SPECIES', 2.1, 0.22, 7.0, 2.75, 29.62, Math.PI, { bg: '#0a1410', fg: '#b9ffd0', border: null, font: 'Fredoka', weight: 600 });
  // overhead service pipes
  for (const [x, m] of [[10.4, 'greenDim']]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 13.5, 8), MATS[m]());
    pipe.rotation.x = Math.PI / 2; pipe.position.set(x, 4.72, 22.2); g.add(pipe);
  }

  // ── research laboratory B (west) ──────────────────────────────────────────
  box('panelWarm', 11.2, 0.22, 14.4, -5.85, 5.0, 22.6);
  solid(11.2, 0.22, 14.4, -5.85, 5.0, 22.6);
  for (const x of [-9.0, -6.0, -3.0]) box('light', 2.2, 0.06, 1.0, x, 4.88, 20.0);
  // server racks with LED strips
  for (const z of [16.9, 18.2, 19.5]) {
    box('black', 0.95, 2.15, 1.05, -11.0, 1.1, z, { solid: true });
    for (let k = 0; k < 6; k++) box(k % 2 ? 'screen' : 'screenBlue', 0.06, 0.05, 0.7, -10.49, 0.45 + k * 0.28, z);
    box('darkSteel', 0.9, 0.05, 1.0, -11.0, 2.2, z);
  }
  // chemistry bench along the west wall
  box('panel', 1.0, 0.9, 7.2, -11.0, 0.57, 25.0, { solid: true });
  box('dark', 1.1, 0.08, 7.3, -10.95, 1.02, 25.0);
  box('glass', 0.82, 0.14, 1.2, -10.95, 1.11, 22.4);
  for (let k = 0; k < 3; k++) {
    cyl('glass', 0.06, 0.06, 0.19, 8, -10.8, 1.15, 24.4 + k * 0.9);
    cyl(k === 1 ? 'liquidGreen' : 'liquidBlue', 0.05, 0.05, 0.09, 8, -10.8, 1.1, 24.4 + k * 0.9);
  }
  // central bench with microscope and sample trays
  box('panel', 3.1, 0.9, 1.3, -6.0, 0.57, 19.8, { solid: true });
  box('dark', 3.25, 0.1, 1.42, -6.0, 1.03, 19.8);
  cyl('steel', 0.09, 0.11, 0.42, 8, -6.8, 1.28, 19.8);
  box('steel', 0.45, 0.06, 0.34, -6.8, 1.53, 19.8);
  box('black', 0.08, 0.25, 0.08, -6.8, 1.64, 19.8);
  for (let k = 0; k < 3; k++) box('stoneDark', 0.5, 0.06, 0.35, -5.4 + k * 0.45, 1.11, 19.8);
  // large containment chamber
  box('stoneDark', 2.5, 0.55, 2.5, -6.6, 0.34, 27.2, { solid: true });
  cyl('glass', 1.1, 1.1, 3.2, 18, -6.6, 2.2, 27.2);
  cyl('liquidGreen', 0.95, 0.95, 2.1, 16, -6.6, 1.65, 27.2);
  cyl('darkSteel', 1.2, 1.2, 0.24, 18, -6.6, 3.9, 27.2);
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2;
    box('steel', 0.1, 3.4, 0.1, -6.6 + Math.cos(a) * 1.16, 2.2, 27.2 + Math.sin(a) * 1.16);
  }
  addSign('CONTAINMENT', 1.6, 0.22, -6.6, 1.0, 25.95, Math.PI, { bg: '#140a0a', fg: '#ffb0a0', border: '#c04a3a', font: 'Fredoka', weight: 700 });
  addSign('BIOHAZARD · LEVEL 4', 1.9, 0.18, -6.6, 0.74, 25.95, Math.PI, { bg: '#140a0a', fg: '#ff8a70', border: null, font: 'Fredoka', weight: 600 });
  // shelving with specimen jars
  for (const z of [28.9]) {
    box('darkSteel', 3.2, 0.1, 0.75, -3.4, 0.6, z, { solid: true });
    box('darkSteel', 3.2, 0.1, 0.75, -3.4, 1.55, z);
    box('darkSteel', 3.2, 0.1, 0.75, -3.4, 2.4, z);
    for (const x of [-4.95, -3.4, -1.85]) box('steel', 0.08, 2.5, 0.75, x, 1.25, z);
    for (let k = 0; k < 6; k += 2) {
      const row = Math.floor(k / 3), col = k % 3;
      cyl('glass', 0.14, 0.14, 0.42, 8, -4.3 + col * 0.9, 0.88 + row * 0.95, z);
      cyl(k % 2 ? 'liquidGreen' : 'liquidBlue', 0.11, 0.11, 0.2, 8, -4.3 + col * 0.9, 0.8 + row * 0.95, z);
    }
  }
  // crates and a fume hood
  box('panel', 2.2, 2.4, 1.3, -10.4, 1.2, 16.7, { solid: true });
  box('glass', 1.95, 1.3, 0.08, -10.4, 1.75, 16.08);
  box('dark', 2.3, 0.2, 1.45, -10.4, 2.5, 16.65);
  // emergency station
  cyl('steel', 0.06, 0.06, 3.1, 8, -2.3, 1.55, 29.5);
  cyl('steel', 0.42, 0.42, 0.1, 12, -2.3, 3.1, 29.5);
  box('green', 0.4, 0.06, 0.4, -2.3, 3.0, 29.3);
  box('red', 0.6, 0.5, 0.22, -2.3, 1.6, 29.75);
  // pipes across the west lab
  for (const [x, m] of [[-11.0, 'greenDim']]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 13.6, 8), MATS[m]());
    pipe.rotation.x = Math.PI / 2; pipe.position.set(x, 4.72, 22.2); g.add(pipe);
  }

  // ── lighting ──────────────────────────────────────────────────────────────
  const lobbyLight = new THREE.PointLight(0xe6f4ff, 5, 26, 1.2);
  lobbyLight.position.set(0, 4.4, 6);
  g.add(lobbyLight);
  const entranceLight = new THREE.PointLight(0xe8f8ff, 3.2, 13, 1.2);
  entranceLight.position.set(0, 4.0, 2.2);
  g.add(entranceLight);
  const porchLight = new THREE.PointLight(0xdff2ff, 5, 11, 1.5);
  porchLight.position.set(0, 6.1, -2.6);
  g.add(porchLight);
  const labLight = new THREE.PointLight(0xd8f0ff, 4.2, 17, 1.2);
  labLight.position.set(6, 4.0, 21);
  g.add(labLight);
  const westLight = new THREE.PointLight(0xbfe8d8, 3.2, 15, 1.2);
  westLight.position.set(-6, 4.0, 21);
  g.add(westLight);
  // canopy downlights
  for (const x of [-2.7, 2.7]) box('light', 1.4, 0.06, 0.5, x, 6.99, -3.4);

  // ── flush decor batches into a handful of draw calls ───────────────────────
  const matCache = new Map();
  const matFor = key => {
    if (!matCache.has(key)) matCache.set(key, MATS[key]());
    return matCache.get(key);
  };
  for (const [key, list] of batches) {
    if (!list.length) continue;
    const merged = mergeGeometries(list, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, matFor(key));
    mesh.castShadow = !NO_SHADOW.has(key);
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  scene.add(g);
  mergeStatic(dna, { byLook: true });                        // the helix spins as one piece: merge it inside its own group
  mergeStatic(g, { keep: o => o === dna, byLook: true });   // loose props/signs: one draw per material (the DNA model spins)
  g.updateMatrixWorld(true);

  // ── cut the entrance through the real building wall ────────────────────────
  const doorLocal = new THREE.Box3(new THREE.Vector3(-3.5, 0.04, -1.4), new THREE.Vector3(3.5, 4.8, 1.4));
  const doorWorld = new THREE.Box3();
  for (const x of [doorLocal.min.x, doorLocal.max.x]) for (const y of [doorLocal.min.y, doorLocal.max.y]) for (const z of [doorLocal.min.z, doorLocal.max.z]) {
    const p = new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld);
    doorWorld.expandByPoint(p);
  }
  cutOpening(meshes, doorWorld);

  // ── collision for walls, floors, furniture and exterior props ──────────────
  const collision = mergeGeometries(solids.map(s => {
    const geo = s.index ? s.toNonIndexed() : s;
    if (geo.attributes.uv) geo.deleteAttribute('uv');
    return geo;
  }), false);
  if (collision) {
    // The solids were laid out in the facility's local frame; the collider sits in the scene with
    // no parent, so bake the facility transform in (it used to sit at the world origin and nothing
    // inside the building blocked you).
    collision.applyMatrix4(g.matrixWorld);
    const collider = new THREE.Mesh(collision, new THREE.MeshBasicMaterial({ name: 'indoor' }));
    collider.visible = false;
    collider.name = 'OscorpCollision';
    collision.computeBoundsTree?.();
    scene.add(collider);
    meshes.push(collider);
  }

  // ── story anchors (world space, ground level) ─────────────────────────────
  const at = (x, z) => g.localToWorld(new THREE.Vector3(x, 0.12, z));
  const anchors = {
    plaza: at(0, -6.5),
    entrance: at(0, -1.5),
    lobby: at(0, 6.0),
    reception: at(-3.6, 8.0),
    lab: at(6.2, 19.8),
    labTank: at(2.2, 24.4),
    tankView: at(3.2, 22.4),
    tankA: at(1.4, 23.9),
    tankB: at(5.0, 23.9),
    labBench: at(6.4, 18.2),
    labWest: at(-6.0, 22.0),
    corridor: at(0, 13.9),
  };

  let t = 0;
  const update = dt => {
    t += dt;
    dna.rotation.y += dt * 0.55;
    dna.position.y = 0.55 + Math.sin(t * 1.2) * 0.045;
  };

  console.log(`[Oscorp] facility at ${g.position.x.toFixed(0)}, ${g.position.y.toFixed(1)}, ${g.position.z.toFixed(0)} · ${solids.length} collision volumes`);
  return { group: g, places: anchors, anchors, update };
}
