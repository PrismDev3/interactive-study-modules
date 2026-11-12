/**
 * Bugle.js — the Daily Bugle as a real, enterable building (same approach as Oscorp.js).
 *
 * It attaches to the block Landmarks picked for the Bugle: finds that block's street wall, cuts a
 * doorway through it, dresses the frontage with a limestone and bronze newspaper facade, and
 * builds a walkable ground floor inside: lobby, newsroom, photo desk and J. Jonah Jameson's glass
 * office. The interior is sized from the block's real inside walls, so nothing pokes out of the
 * building. Every wall and piece of furniture you could walk into is in one world-space collider.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mergeStatic } from './StaticMerge.js?v=3';
import { signPanel, cutOpening } from './Oscorp.js?v=15';

const plastic = (color, roughness = 0.5) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.04 });
const metal = (color, roughness = 0.35) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.7 });

const MATS = {
  stone: () => plastic(0xd9cdb4, 0.62),          // warm limestone
  stoneDark: () => plastic(0xa99a7e, 0.66),
  stoneTrim: () => plastic(0xeee4cf, 0.55),
  bronze: () => metal(0x8a6236, 0.38),
  dark: () => plastic(0x22252a, 0.55),
  red: () => plastic(0xc4161c, 0.42),
  redDark: () => plastic(0x8e0f14, 0.5),
  cream: () => plastic(0xefe7d6, 0.6),
  wall: () => plastic(0xe6dccb, 0.7),
  wood: () => plastic(0x6b4528, 0.55),
  woodDark: () => plastic(0x45291a, 0.55),
  desk: () => plastic(0xb79b72, 0.6),
  grey: () => plastic(0x8f969d, 0.55),
  steel: () => metal(0x9aa3ab, 0.3),
  black: () => plastic(0x17191c, 0.6),
  chair: () => plastic(0x2b2f35, 0.6),
  paper: () => plastic(0xf6f2e6, 0.8),
  leaf: () => plastic(0x2f7a46, 0.7),
  soil: () => plastic(0x4a3828, 0.85),
  screen: () => new THREE.MeshStandardMaterial({ color: 0x0b1c2c, emissive: 0x4f9fe0, emissiveIntensity: 0.45, roughness: 0.3 }),
  light: () => new THREE.MeshStandardMaterial({ color: 0xfff6e2, emissive: 0xfff0cc, emissiveIntensity: 0.55, roughness: 0.4 }),
  glass: () => new THREE.MeshStandardMaterial({ color: 0xb8d8ee, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, depthWrite: false }),
  glassDark: () => new THREE.MeshStandardMaterial({ color: 0x1d2a36, roughness: 0.12, metalness: 0.4 }),
  windowLit: () => new THREE.MeshStandardMaterial({ color: 0x33302a, emissive: 0xffd98a, emissiveIntensity: 0.35, roughness: 0.2 }),
};
const NO_SHADOW = new Set(['light', 'glass', 'glassDark', 'windowLit', 'screen']);

const PAPER = { bg: '#f4efe2', fg: '#141414', stroke: '#f4efe2', inner: null, border: '#141414', font: 'Fredoka', weight: 700 };
const MASTHEAD = { bg: '#f4efe2', fg: '#141414', stroke: '#f4efe2', inner: null, border: '#c4161c' };

/** Raycast every mesh's BVH (world-space city geometry). */
function castAll(meshes, ray, far) {
  let best = null;
  for (const m of meshes) {
    const h = m.geometry?.boundsTree?.raycastFirst(ray, THREE.DoubleSide, 0, far);
    if (h && (!best || h.distance < best.distance)) best = h;
  }
  return best;
}

/**
 * @returns {{group: THREE.Group, places: object, anchors: object}|null}
 */
export function buildBugle({ scene, meshes, tower, street }) {
  if (!tower || !street) return null;
  const dir = new THREE.Vector3(tower.x - street.x, 0, tower.z - street.z);
  if (dir.lengthSq() < 0.01) return null;
  dir.normalize();
  const ray = new THREE.Ray(new THREE.Vector3(street.x, street.y + 1.6, street.z), dir.clone());
  const wallHit = castAll(meshes, ray, 40);
  if (!wallHit) return null;
  const right = new THREE.Vector3(-dir.z, 0, dir.x);     // facade x axis (local +x)

  // Measure the block from just inside its wall: how deep and how wide the inside really is.
  const inside = wallHit.point.clone().addScaledVector(dir, 0.6);
  const reach = (d, far) => { const h = castAll(meshes, new THREE.Ray(inside.clone(), d), far); return h ? h.distance : far; };
  const depth = reach(dir.clone(), 40);
  const halfL = reach(right.clone().negate(), 20), halfR = reach(right.clone(), 20);
  const down = new THREE.Ray(new THREE.Vector3(wallHit.point.x + dir.x * 3, 400, wallHit.point.z + dir.z * 3), new THREE.Vector3(0, -1, 0));
  const roofHit = castAll(meshes, down, 420);
  const floorRay = new THREE.Ray(new THREE.Vector3(wallHit.point.x - dir.x * 1.4, street.y + 3, wallHit.point.z - dir.z * 1.4), new THREE.Vector3(0, -1, 0));
  const floorHit = castAll(meshes, floorRay, 8);
  const floorY = Math.min(street.y, floorHit ? floorHit.point.y : street.y);
  const blockH = roofHit ? roofHit.point.y - floorY : 30;

  // Interior footprint, centred on the doorway and kept 0.6 m inside the real walls.
  const half = Math.max(6, Math.min(11, Math.min(halfL, halfR) - 0.6));
  const W = half * 2, D = Math.max(14, Math.min(26, depth - 1.2));
  const H = 4.6;                                           // ceiling
  if (depth < 12) return null;                             // not a block we can fit a newsroom in

  const g = new THREE.Group();
  g.position.set(wallHit.point.x, floorY, wallHit.point.z);
  g.rotation.y = Math.atan2(dir.x, dir.z);                 // local +z points into the building
  g.name = 'DailyBugleBuilding';

  const batches = new Map(), solids = [];
  const put = (key, geo) => { if (!batches.has(key)) batches.set(key, []); batches.get(key).push(geo); };
  const solid = (w, h, d, x, y, z, ry = 0) => {
    const geo = new THREE.BoxGeometry(w, h, d); if (ry) geo.rotateY(ry); geo.translate(x, y, z); solids.push(geo);
  };
  const box = (key, w, h, d, x, y, z, { ry = 0, solid: s = false } = {}) => {
    const geo = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    geo.deleteAttribute('uv');
    if (ry) geo.rotateY(ry);
    geo.translate(x, y, z);
    put(key, geo);
    if (s) solid(w, h, d, x, y, z, ry);
  };
  const cyl = (key, r0, r1, h, seg, x, y, z, { solid: s = false } = {}) => {
    const geo = new THREE.CylinderGeometry(r0, r1, h, seg).toNonIndexed();
    geo.deleteAttribute('uv');
    geo.translate(x, y, z);
    put(key, geo);
    if (s) solid(Math.max(r0, r1) * 2, h, Math.max(r0, r1) * 2, x, y, z);
  };
  const sign = (text, w, h, x, y, z, ry = Math.PI, opts = PAPER) => {
    const s = signPanel(text, w, h, opts); s.position.set(x, y, z); s.rotation.y = ry; g.add(s); return s;
  };

  // ── exterior: limestone and bronze newspaper building on the real frontage ──────────────
  const FW = W + 3, FH = Math.max(14, Math.min(blockH - 0.6, 36));
  box('stone', FW, FH, 0.4, 0, FH / 2, -0.5);                                   // cladding over the old wall face
  box('stoneTrim', FW + 0.6, 0.7, 1.1, 0, FH - 0.2, -0.85);                     // cornice
  box('stoneDark', FW + 0.2, 0.9, 0.9, 0, 0.45, -0.75);                         // plinth
  const bays = Math.max(3, Math.round(FW / 4.2));
  const bayW = FW / bays;
  for (let b = 0; b <= bays; b++) box('stoneTrim', 0.7, FH - 0.8, 0.9, -FW / 2 + b * bayW, (FH - 0.8) / 2 + 0.4, -0.85);   // piers
  // upper floors: tall window per bay per floor, a few lit
  for (let y = 6.4; y + 2.6 < FH - 1; y += 3.4) {
    box('stoneDark', FW, 0.22, 0.75, 0, y - 0.55, -0.8);                         // floor band
    for (let b = 0; b < bays; b++) {
      const x = -FW / 2 + bayW * (b + 0.5);
      const lit = ((b * 7 + Math.round(y) * 3) % 5) === 0;
      box(lit ? 'windowLit' : 'glassDark', bayW - 1.6, 2.3, 0.08, x, y + 0.8, -0.74);
      box('bronze', bayW - 1.5, 0.1, 0.16, x, y + 0.8, -0.78);
    }
  }
  // ground floor shop windows either side of the entrance
  for (let b = 0; b < bays; b++) {
    const x = -FW / 2 + bayW * (b + 0.5);
    if (Math.abs(x) < 3.4) continue;
    box('glassDark', bayW - 1.4, 3.0, 0.08, x, 2.4, -0.74);
    box('bronze', bayW - 1.3, 0.14, 0.2, x, 3.95, -0.8);
    box('bronze', bayW - 1.3, 0.14, 0.2, x, 0.88, -0.8);
  }
  // bronze portal and revolving door
  box('bronze', 6.4, 0.5, 0.6, 0, 4.55, -0.95);
  for (const s of [-1, 1]) box('bronze', 0.4, 4.4, 0.6, s * 3.0, 2.2, -0.95, { solid: true });
  box('glass', 5.6, 0.9, 0.06, 0, 3.75, -0.92);                                 // transom
  // bronze double doors standing open against the jambs (solid, clear of the walkway)
  for (const sd of [-1, 1]) {
    box('bronze', 0.1, 3.3, 1.3, sd * 2.45, 1.75, -1.2, { solid: true });
    box('glass', 0.04, 2.4, 1.0, sd * 2.4, 1.9, -1.2);
  }
  // masthead marquee over the door and a red canopy
  box('dark', 9.6, 2.0, 0.4, 0, 5.9, -1.05);
  sign('THE DAILY BUGLE', 9.2, 1.7, 0, 5.9, -1.27, Math.PI, MASTHEAD);
  box('red', 7.6, 0.28, 2.6, 0, 4.25, -2.15);
  box('redDark', 7.6, 0.5, 0.12, 0, 4.0, -3.42);
  sign('DAILY BUGLE', 4.4, 0.42, 0, 4.0, -3.49, Math.PI, { bg: '#8e0f14', fg: '#ffffff', stroke: '#8e0f14', border: null, font: 'Fredoka', weight: 700 });
  for (const s of [-1, 1]) cyl('bronze', 0.06, 0.06, 4.0, 8, s * 3.6, 2.0, -3.3, { solid: true });   // canopy posts
  // flagpoles with red Bugle flags
  for (const s of [-1, 1]) {
    const x = s * (FW / 2 - 1.2);
    box('bronze', 0.12, 0.12, 2.6, x, 7.6, -2.0);
    box('red', 0.04, 1.0, 1.6, x, 7.1, -2.9);
  }
  // round emblem high on the facade
  cyl('stoneTrim', 1.5, 1.5, 0.3, 24, 0, Math.min(FH - 3.2, 11), -0.9);
  sign('DB', 1.9, 1.3, 0, Math.min(FH - 3.2, 11), -1.08, Math.PI, { ...MASTHEAD, border: null });
  // street furniture: newspaper boxes and a bench, all solid
  for (const [x, col] of [[-5.4, 'red'], [-4.6, 'dark'], [4.8, 'red']]) {
    box(col, 0.6, 1.1, 0.55, x, 0.55, -3.6, { solid: true });
    box('glassDark', 0.45, 0.35, 0.02, x, 0.85, -3.89);
  }
  box('wood', 2.2, 0.12, 0.55, 6.6, 0.48, -3.4, { solid: true });
  box('wood', 2.2, 0.5, 0.1, 6.6, 0.8, -3.15);

  // ── interior shell ───────────────────────────────────────────────────────────────────
  // checkered marble floor (one textured plane) over a solid slab
  box('stoneDark', W, 0.24, D, 0, 0, D / 2); solid(W, 0.24, D, 0, 0, D / 2);
  {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#2b2b2e' : '#e9e3d6'; x.fillRect(i * 64, j * 64, 64, 64); }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(W / 2.4, D / 2.4); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.1, D - 0.1), new THREE.MeshStandardMaterial({ map: t, roughness: 0.35, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.125, D / 2); floor.receiveShadow = true;
    g.add(floor);
  }
  box('cream', W, 0.3, D, 0, H + 0.15, D / 2); solid(W, 0.3, D, 0, H + 0.15, D / 2);           // ceiling
  for (const s of [-1, 1]) { box('wall', 0.3, H, D, s * (W / 2 - 0.15), H / 2, D / 2); solid(0.3, H, D, s * (W / 2 - 0.15), H / 2, D / 2); }
  box('wall', W, H, 0.3, 0, H / 2, D - 0.15); solid(W, H, 0.3, 0, H / 2, D - 0.15);
  const doorHalf = 2.6;
  for (const s of [-1, 1]) {
    const w = W / 2 - doorHalf;
    box('wall', w, H, 0.3, s * (doorHalf + w / 2), H / 2, 0.15); solid(w, H, 0.3, s * (doorHalf + w / 2), H / 2, 0.15);
  }
  box('wall', doorHalf * 2, H - 4.2, 0.3, 0, 4.2 + (H - 4.2) / 2, 0.15);
  box('stoneDark', doorHalf * 2, 0.1, 1.4, 0, 0.1, -0.2); solid(doorHalf * 2, 0.1, 1.4, 0, 0.1, -0.2);
  // wainscot and picture rail all round
  for (const s of [-1, 1]) {
    box('wood', 0.06, 1.0, D - 0.6, s * (W / 2 - 0.33), 0.62, D / 2);
    box('woodDark', 0.08, 0.08, D - 0.6, s * (W / 2 - 0.33), 3.4, D / 2);
  }
  // ceiling light panels
  for (let z = 3; z < D - 1; z += 4.2) for (const x of [-W / 4, W / 4]) box('light', 2.4, 0.06, 0.8, x, H - 0.02, z);
  for (const [x, z] of [[-W / 4, D * 0.25], [W / 4, D * 0.55], [0, D * 0.82]]) {
    const l = new THREE.PointLight(0xfff0d0, 2.6, 13, 1.4); l.position.set(x, H - 0.6, z); g.add(l);
  }

  // ── lobby (z 0.3 – 7) ────────────────────────────────────────────────────────────────
  const LZ = 7;
  // reception desk with the masthead behind it (left)
  const rx = -W / 2 + 3.4;
  box('wood', 3.6, 1.1, 1.0, rx, 0.68, 3.6, { solid: true });
  box('woodDark', 3.8, 0.1, 1.2, rx, 1.28, 3.6);
  box('black', 0.6, 0.42, 0.06, rx + 0.8, 1.55, 3.85); box('screen', 0.54, 0.36, 0.02, rx + 0.8, 1.55, 3.8);
  box('chair', 0.5, 0.5, 0.5, rx - 0.6, 0.5, 4.5, { solid: true });
  box('woodDark', 4.6, 2.8, 0.2, rx, 1.9, 5.4, { solid: true });
  sign('THE DAILY BUGLE', 4.2, 0.9, rx, 2.5, 5.28, Math.PI, MASTHEAD);
  sign('RECEPTION', 2.0, 0.3, rx, 1.65, 5.28, Math.PI, { ...PAPER, border: null, bg: '#45291a', fg: '#f4efe2', stroke: '#45291a' });
  // framed front pages on the right wall
  const pages = ['SPIDER-MAN: THREAT OR MENACE?', 'WHO IS THE MASKED MENACE?', 'WALL-CRAWLER STRIKES AGAIN'];
  pages.forEach((t, i) => {
    const z = 1.6 + i * 1.9, x = W / 2 - 0.34;
    box('woodDark', 0.06, 1.35, 1.05, x, 2.2, z);
    const s = signPanel(t, 0.9, 1.2, { ...PAPER, sub: 'DAILY BUGLE', subColor: '#c4161c' });
    s.position.set(x - 0.04, 2.2, z); s.rotation.y = -Math.PI / 2; g.add(s);
  });
  // security turnstiles with a clear gap in the middle
  for (const s of [-1, 1]) for (const k of [1, 2]) {
    box('steel', 0.18, 1.0, 1.0, s * (0.9 + k * 1.0), 0.5, LZ - 1.6, { solid: true });
    box('glass', 0.04, 0.6, 0.9, s * (0.9 + k * 1.0) - s * 0.5, 0.9, LZ - 1.6);
  }
  // waiting bench and plants
  box('wood', 2.4, 0.45, 0.6, W / 2 - 2.0, 0.42, 6.0, { solid: true });
  for (const [x, z] of [[-W / 2 + 0.8, 0.9], [W / 2 - 0.8, 0.9]]) {
    cyl('stoneDark', 0.4, 0.34, 0.7, 12, x, 0.47, z, { solid: true });
    box('leaf', 0.8, 0.9, 0.8, x, 1.3, z);
  }
  // lobby/newsroom partition: solid walls both sides of a 4 m opening, glass above
  for (const s of [-1, 1]) {
    const w = W / 2 - 2.0;
    box('wall', w, 2.6, 0.25, s * (2.0 + w / 2), 1.3, LZ, { solid: true });
    box('glass', w, H - 2.6, 0.05, s * (2.0 + w / 2), 2.6 + (H - 2.6) / 2, LZ);
    box('woodDark', w, 0.1, 0.3, s * (2.0 + w / 2), 2.62, LZ);
  }
  box('woodDark', 4.0, 0.5, 0.3, 0, 3.8, LZ);
  sign('NEWSROOM', 2.6, 0.45, 0, 3.8, LZ - 0.17, Math.PI, { ...PAPER, border: null, bg: '#45291a', fg: '#f4efe2', stroke: '#45291a' });

  // ── Jameson's glass office (back right) and the photo desk (back left) ────────────────
  const OW = Math.min(7, W * 0.42), OD = Math.min(6.4, D * 0.3);
  const ox0 = W / 2 - 0.3 - OW, oz0 = D - 0.3 - OD;                 // office front-left corner
  const ocx = ox0 + OW / 2, ocz = oz0 + OD / 2;
  // front glass wall with a door gap near its left end, side glass wall
  box('woodDark', OW - 1.4, 1.0, 0.12, ox0 + 1.4 + (OW - 1.4) / 2, 0.5, oz0, { solid: true });
  box('glass', OW - 1.4, H - 1.0, 0.05, ox0 + 1.4 + (OW - 1.4) / 2, 1.0 + (H - 1.0) / 2, oz0); solid(OW - 1.4, H, 0.12, ox0 + 1.4 + (OW - 1.4) / 2, H / 2, oz0);
  box('woodDark', 0.12, 1.0, OD, ox0, 0.5, ocz, { solid: true });
  box('glass', 0.05, H - 1.0, OD, ox0, 1.0 + (H - 1.0) / 2, ocz); solid(0.12, H, OD, ox0, H / 2, ocz);
  box('woodDark', 0.14, H, 0.14, ox0, H / 2, oz0);
  sign('J. JONAH JAMESON  EDITOR-IN-CHIEF', OW - 1.6, 0.42, ox0 + 1.4 + (OW - 1.4) / 2, 2.1, oz0 - 0.05, Math.PI, { ...PAPER, border: null, bg: '#f4efe2' });
  // the desk, his chair, a bookcase and the framed MENACE front page
  box('wood', 3.0, 0.85, 1.3, ocx, 0.55, ocz + 0.6, { solid: true });
  box('woodDark', 3.1, 0.08, 1.4, ocx, 1.0, ocz + 0.6);
  box('paper', 0.6, 0.03, 0.45, ocx - 0.6, 1.05, ocz + 0.5);
  box('black', 0.5, 0.06, 0.08, ocx + 0.7, 1.07, ocz + 0.35);                   // cigar tray
  box('redDark', 0.7, 1.2, 0.7, ocx, 0.72, ocz + 1.85, { solid: true });          // leather chair
  box('redDark', 0.7, 0.9, 0.15, ocx, 1.5, ocz + 2.15);
  box('woodDark', 2.4, 2.6, 0.45, ocx + OW / 2 - 1.6, 1.43, D - 0.55, { solid: true });
  for (let k = 0; k < 3; k++) box(k % 2 ? 'red' : 'paper', 2.1, 0.5, 0.3, ocx + OW / 2 - 1.6, 0.6 + k * 0.75, D - 0.62);
  const menace = signPanel('SPIDER-MAN: MENACE!', 1.4, 1.8, { ...PAPER, sub: 'EXCLUSIVE PHOTOS', subColor: '#c4161c' });
  menace.position.set(W / 2 - 0.34, 2.3, ocz); menace.rotation.y = -Math.PI / 2; g.add(menace);
  // photo desk (where Peter sells his pictures)
  const px = -W / 2 + 2.4, pz = D - 2.4;
  box('desk', 2.8, 0.8, 1.2, px, 0.52, pz, { solid: true });
  box('black', 0.6, 0.45, 0.06, px + 0.6, 1.15, pz + 0.3); box('screen', 0.54, 0.38, 0.02, px + 0.6, 1.15, pz + 0.26);
  for (let k = 0; k < 4; k++) box('paper', 0.35, 0.02, 0.28, px - 0.9 + k * 0.4, 0.93, pz - 0.2);
  box('woodDark', 2.6, 1.0, 0.06, px, 2.3, D - 0.34);
  sign('PHOTO DESK', 2.4, 0.4, px, 2.95, D - 0.38, Math.PI, { ...PAPER, border: null, bg: '#45291a', fg: '#f4efe2', stroke: '#45291a' });
  box('grey', 0.7, 1.3, 0.6, -W / 2 + 0.7, 0.75, pz - 2.0, { solid: true });      // filing cabinet

  // ── newsroom desks: rows with monitors and chairs, clear aisles between ───────────────
  const rowZ0 = LZ + 2.0, rowZ1 = oz0 - 1.6;
  const cols = [];
  for (let x = -W / 2 + 2.2; x <= W / 2 - 2.2; x += 3.6) cols.push(x);
  for (let z = rowZ0; z <= rowZ1; z += 3.0) {
    for (const x of cols) {
      if (x + 1.2 > ox0 - 0.9 && z + 0.6 > oz0 - 1.2) continue;     // keep the office approach clear
      if (Math.abs(x) < 1.3) continue;                              // central aisle
      box('desk', 2.2, 0.76, 1.0, x, 0.5, z, { solid: true });
      box('black', 0.56, 0.4, 0.06, x, 1.12, z + 0.25); box('screen', 0.5, 0.34, 0.02, x, 1.12, z + 0.21);
      box('black', 0.5, 0.03, 0.16, x, 0.9, z - 0.1);
      box('paper', 0.3, 0.02, 0.24, x - 0.75, 0.9, z);
      box('chair', 0.5, 0.5, 0.5, x, 0.5, z - 0.9, { solid: true });
      box('chair', 0.5, 0.55, 0.1, x, 0.95, z - 1.12);
    }
  }
  // newsroom wall: clock, a TV bank and filing cabinets
  cyl('cream', 0.45, 0.45, 0.08, 20, -W / 2 + 0.4, 3.6, (LZ + oz0) / 2);
  for (let k = 0; k < 3; k++) {
    box('black', 0.08, 0.8, 1.3, -W / 2 + 0.35, 2.6, LZ + 1.6 + k * 1.5);
    box('screen', 0.02, 0.7, 1.2, -W / 2 + 0.4, 2.6, LZ + 1.6 + k * 1.5);
  }
  for (let k = 0; k < 2; k++) box('grey', 0.6, 1.3, 0.7, -W / 2 + 0.6, 0.75, oz0 - 1.0 - k * 0.8, { solid: true });
  // structural columns between desk rows
  for (const x of [-W / 4, W / 4]) for (const z of [LZ + 0.9, (LZ + D) / 2]) if (z < oz0 - 0.6 || x < ox0 - 0.6) {
    box('stoneTrim', 0.6, H, 0.6, x, H / 2, z, { solid: true });
  }

  // ── flush to a handful of draw calls ───────────────────────────────────────────────────
  const matCache = new Map();
  for (const [key, list] of batches) {
    const merged = mergeGeometries(list, false);
    if (!merged) continue;
    if (!matCache.has(key)) matCache.set(key, MATS[key]());
    const mesh = new THREE.Mesh(merged, matCache.get(key));
    mesh.castShadow = !NO_SHADOW.has(key);
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  scene.add(g);
  mergeStatic(g, { byLook: true });
  g.updateMatrixWorld(true);

  // ── doorway through the real wall ──────────────────────────────────────────────────────
  const doorLocal = new THREE.Box3(new THREE.Vector3(-doorHalf, 0.04, -1.4), new THREE.Vector3(doorHalf, 4.2, 1.4));
  const doorWorld = new THREE.Box3();
  for (const x of [doorLocal.min.x, doorLocal.max.x]) for (const y of [doorLocal.min.y, doorLocal.max.y]) for (const z of [doorLocal.min.z, doorLocal.max.z]) {
    doorWorld.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld));
  }
  cutOpening(meshes, doorWorld);

  // ── one world-space collider for walls and furniture ──────────────────────────────────
  const collision = mergeGeometries(solids.map(s => { const geo = s.index ? s.toNonIndexed() : s; if (geo.attributes.uv) geo.deleteAttribute('uv'); return geo; }), false);
  if (collision) {
    collision.applyMatrix4(g.matrixWorld);                 // baked: the collider has no parent transform
    const collider = new THREE.Mesh(collision, new THREE.MeshBasicMaterial({ name: 'indoor' }));
    collider.visible = false;
    collider.name = 'BugleCollision';
    collision.computeBoundsTree?.();
    scene.add(collider);
    meshes.push(collider);
  }

  const at = (x, z) => g.localToWorld(new THREE.Vector3(x, 0.12, z));
  const anchors = {
    buglePlaza: at(0, -6.0),
    bugleEntrance: at(0, -1.6),
    bugleLobby: at(0, 3.2),
    bugleReception: at(rx, 2.4),
    bugleNewsroom: at(0, (LZ + oz0) / 2),
    jamesonDesk: at(ox0 + 0.95, ocz + 0.6),   // beside his desk (the chair behind it is solid)
    jamesonVisitor: at(ocx, ocz - 0.95),        // in front of it, clear of the desk
    buglePhotoDesk: at(px, pz - 1.45),
  };
  console.log(`[Bugle] building at ${g.position.x.toFixed(0)}, ${g.position.y.toFixed(1)}, ${g.position.z.toFixed(0)} · interior ${W.toFixed(1)} x ${D.toFixed(1)} m · ${solids.length} collision volumes`);
  return { group: g, anchors, places: anchors };
}
