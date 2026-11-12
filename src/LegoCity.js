/**
 * LegoCity.js — turns the plain city OBJ into a LEGO city:
 * LEGO plastic materials, Brooklyn brick colours per block, and real studs on rooftops.
 */
import * as THREE from 'three';
import { addWaterWaves } from './Vehicles.js?v=12';

// Official-ish LEGO colours for non-building surfaces
const LEGO_COLORS = {
  asphalt: 0x4c5157, sidewalk: 0xa3a8ab, paint: 0xf4f4f4, path: 0xdcbd7e,
  grass: 0x4c9e3f, leaves: 0x2e8b3a, leaves_dark: 0x1f6b35, bark: 0x6b3a1f,
  water: 0x2a83d6, window: 0x9fd6ff, glass_blue: 0x5fb3e6, seam: 0x3a3d42,
  taxi: 0xf6c21a, car_red: 0xc91a09, car_blue: 0x0a57c2, car_white: 0xf4f4f4,
  car_black: 0x1b1b1f, car_gray: 0x8a8f94, lamp: 0xffe9a0, steel: 0x9aa1a8,
  iron: 0x4a4e54, chrome: 0xd7dbe0, gold: 0xe0a92a, copper: 0x3e9b84, // weathered copper
  bridge_blue: 0x6b8fb8, deck: 0x55595f, wood: 0x8a5a2b, light_green: 0x8ccf5a,
  concrete: 0xb5b8ba,
};

// Facade materials that get a Brooklyn colour per city block
const BUILDING_MATS = new Set([
  'toy_white', 'toy_sandstone', 'toy_lgray', 'toy_dgray', 'toy_brown', 'toy_tan', 'toy_bluish',
  'stone', 'granite', 'limestone', 'light_red',
]);

const BROOKLYN = [
  // New York palette: brownstone, muted brick, limestone, concrete and glass-tower greys
  [0x7a4a38, 3], // brownstone
  [0x8c5443, 2], // faded brick
  [0x6b4a3c, 2], // dark brownstone
  [0xc8bca6, 4], // limestone
  [0xb0a48c, 3], // weathered sandstone
  [0xd9d2c3, 2], // pale stone
  [0x9a9d9f, 3], // concrete
  [0x75808a, 2], // steel-blue glass tower
  [0x5d636a, 1], // dark granite
  [0xe6e1d6, 1], // off-white
].flatMap(([c, w]) => Array(w).fill(new THREE.Color(c)));

function hash2(x, z) {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const isBuildingMat = name => BUILDING_MATS.has(name);

/**
 * One Brooklyn colour per building. Triangles that share vertex positions (across all facade
 * materials) are grouped with a union-find, so a building never mixes colours — mixed colours on
 * overlapping coplanar faces is what showed up as flickering stripes.
 * @param {{geo: THREE.BufferGeometry, matName: string}[]} items world-space, non-indexed
 */
/**
 * The map's bridge ramps run straight through the buildings at each end. Remove every building
 * piece (a connected set of triangles) that stands on a bridge's footprint, so the ramps land
 * cleanly on open ground.
 */
/** Split a non-indexed geometry into connected pieces (triangles sharing a vertex position). */
export function pieces(geo) {
  const arr = geo.attributes.position.array, n = arr.length / 3, tris = n / 3;
  const parent = new Int32Array(tris);
  for (let i = 0; i < tris; i++) parent[i] = i;
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const seen = new Map();
  for (let v = 0; v < n; v++) {
    const k = `${Math.round(arr[v * 3] * 10)},${Math.round(arr[v * 3 + 1] * 10)},${Math.round(arr[v * 3 + 2] * 10)}`;
    const o = seen.get(k), t = (v / 3) | 0;
    if (o === undefined) seen.set(k, t); else { const a = find(o), b = find(t); if (a !== b) parent[b] = a; }
  }
  const out = new Map();   // root -> { tris, min, max }
  for (let t = 0; t < tris; t++) {
    const r = find(t);
    let p = out.get(r);
    if (!p) out.set(r, p = { tris: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
    p.tris.push(t);
    for (let k = 0; k < 9; k++) {
      const c = k % 3, val = arr[t * 9 + k];
      if (val < p.min[c]) p.min[c] = val;
      if (val > p.max[c]) p.max[c] = val;
    }
  }
  return [...out.values()];
}

function keepTris(geo, keep) {
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.attributes[name], sz = a.itemSize, out = new Float32Array(keep.length * 3 * sz);
    keep.forEach((t, i) => out.set(a.array.subarray(t * 3 * sz, (t + 1) * 3 * sz), i * 3 * sz));
    geo.setAttribute(name, new THREE.BufferAttribute(out, sz));
  }
  // A BVH build adds an index sized for the old vertex count; left in place it would point past
  // the end of the shortened attributes. Drop it (the next computeBoundsTree makes a fresh one).
  if (geo.index) geo.setIndex(null);
}

export function dropUnderBridges(items, bridgeGeos, cell = 3, propGeos = []) {
  const grid = new Set();
  const key = (x, z) => Math.floor(x / cell) * 100003 + Math.floor(z / cell);
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  for (const g of bridgeGeos) {
    const p = g.attributes.position;
    for (let t = 0; t + 2 < p.count; t += 3) {
      A.fromBufferAttribute(p, t); B.fromBufferAttribute(p, t + 1); C.fromBufferAttribute(p, t + 2);
      const span = Math.max(A.distanceTo(B), B.distanceTo(C), C.distanceTo(A));
      const n = Math.min(60, Math.ceil(span / cell) + 1);
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
        const u = i / n, v = j / n, w = 1 - u - v;
        const x = A.x * w + B.x * u + C.x * v, z = A.z * w + B.z * u + C.z * v;
        for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) grid.add(key(x + dx * cell, z + dz * cell));
      }
    }
  }
  let removed = 0, glass = 0;
  // Pass 1: building pieces standing on a bridge footprint
  const all = items.map(it => ({ it, parts: pieces(it.geo) }));
  const gone = [];
  for (const { it, parts } of all) {
    const arr = it.geo.attributes.position.array;
    for (const p of parts) {
      for (const t of p.tris) {
        const cx = (arr[t * 9] + arr[t * 9 + 3] + arr[t * 9 + 6]) / 3, cz = (arr[t * 9 + 2] + arr[t * 9 + 5] + arr[t * 9 + 8]) / 3;
        if (grid.has(key(cx, cz))) { p.bad = true; gone.push(p); break; }
      }
    }
  }
  // Pass 2: windows, trims and seams of a removed building are separate pieces in other
  // materials; left alone they float in mid-air. Drop anything inside a removed piece's box.
  const M = 0.6;
  const inside = p => gone.some(g => p.min[0] >= g.min[0] - M && p.max[0] <= g.max[0] + M && p.min[1] >= g.min[1] - M &&
    p.max[1] <= g.max[1] + M && p.min[2] >= g.min[2] - M && p.max[2] <= g.max[2] + M);
  if (gone.length) for (const { parts } of all) for (const p of parts) if (!p.bad && inside(p)) { p.bad = true; glass++; }
  for (const { it, parts } of all) {
    if (!parts.some(p => p.bad)) continue;
    const keep = parts.filter(p => !p.bad).flatMap(p => p.tris).sort((a, b) => a - b);
    removed += it.geo.attributes.position.count / 3 - keep.length;
    keepTris(it.geo, keep);
  }
  // Pass 3: rooftop props (tanks, chimneys) whose building was cut away now hang over the ramp
  let props = 0;
  for (const g of propGeos) {
    const arr = g.attributes.position.array, parts = pieces(g);
    const good = parts.filter(p => {
      for (const t of p.tris) {
        const cx = (arr[t * 9] + arr[t * 9 + 3] + arr[t * 9 + 6]) / 3, cz = (arr[t * 9 + 2] + arr[t * 9 + 5] + arr[t * 9 + 8]) / 3;
        if (grid.has(key(cx, cz))) return false;
      }
      return true;
    });
    if (good.length === parts.length) continue;
    props += parts.length - good.length;
    keepTris(g, good.flatMap(p => p.tris).sort((a, b) => a - b));
  }
  console.log(`[LegoCity] also removed ${glass} floating window/trim pieces, ${props} rooftop props over bridges`);
  console.log(`[LegoCity] cleared ${removed} building triangles from under the bridges`);
}

/**
 * Rooftop props are loose furniture in the map. Clearing the building under one (bridge ramps) or
 * stretching a low roof up (raiseLowBuildings) leaves water tanks and vents hanging in mid-air
 * over the street. Group the props into whole structures (a wood tank sits 6 m above its steel
 * legs, so pieces are judged together), then drop each structure onto the surface beneath it — or
 * delete it when the only thing below is the street.
 * @param {THREE.BufferGeometry[]} propGeos roof prop pieces (world space)
 * @param {THREE.BufferGeometry[]} solidGeos everything the props may stand on
 */
export function settleRooftopProps(propGeos, solidGeos, cell = 2) {
  if (!propGeos.length || !solidGeos.length) return;
  const tops = new Map();                      // cell key -> surface heights in that cell
  const addTop = (cx, cz, y) => {
    const k = cx * 100003 + cz;
    const l = tops.get(k);
    if (l) l.push(y); else tops.set(k, [y]);
  };
  let tris = 0;
  for (const g of solidGeos) {
    const p = g.attributes?.position;
    if (!p) continue;
    const a = p.array;
    for (let i = 0; i + 8 < a.length; i += 9) {
      const x0 = a[i], y0 = a[i + 1], z0 = a[i + 2];
      const x1 = a[i + 3], y1 = a[i + 4], z1 = a[i + 5];
      const x2 = a[i + 6], y2 = a[i + 7], z2 = a[i + 8];
      if (y0 < 4 && y1 < 4 && y2 < 4) continue;   // the street holds nothing up high
      const i0 = Math.floor(Math.min(x0, x1, x2) / cell), i1 = Math.floor(Math.max(x0, x1, x2) / cell);
      const j0 = Math.floor(Math.min(z0, z1, z2) / cell), j1 = Math.floor(Math.max(z0, z1, z2) / cell);
      const d = (x1 - x0) * (z2 - z0) - (x2 - x0) * (z1 - z0);
      if (Math.abs(d) < 1e-9 || (i1 - i0 + 1) * (j1 - j0 + 1) > 900) {   // a wall, or a huge slab
        addTop(Math.floor(x0 / cell), Math.floor(z0 / cell), Math.max(y0, y1, y2));
        continue;
      }
      tris++;
      for (let ci = i0; ci <= i1; ci++) for (let cj = j0; cj <= j1; cj++) {
        const px = (ci + 0.5) * cell, pz = (cj + 0.5) * cell;
        const w1 = ((x1 - px) * (z2 - pz) - (x2 - px) * (z1 - pz)) / d;
        const w2 = ((x2 - px) * (z0 - pz) - (x0 - px) * (z2 - pz)) / d;
        const w3 = 1 - w1 - w2;
        if (w1 < 0 || w2 < 0 || w3 < 0) continue;
        addTop(ci, cj, w1 * y0 + w2 * y1 + w3 * y2);
      }
    }
  }
  const parts = [];
  for (const g of propGeos) for (const p of pieces(g)) parts.push({ g, p });
  if (!parts.length) return;
  // Structures: prop pieces stacked on the same footprint (tank above legs, aerials above vents)
  const parent = new Int32Array(parts.length);
  for (let i = 0; i < parts.length; i++) parent[i] = i;
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const near = (a, b) => a.min[0] <= b.max[0] + 1.5 && a.max[0] >= b.min[0] - 1.5 &&
    a.min[2] <= b.max[2] + 1.5 && a.max[2] >= b.min[2] - 1.5 &&
    a.min[1] <= b.max[1] + 16 && a.max[1] >= b.min[1] - 16;
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    if (!near(parts[i].p, parts[j].p)) continue;
    const a = find(i), b = find(j);
    if (a !== b) parent[b] = a;
  }
  const groups = new Map();
  parts.forEach((e, i) => {
    const r = find(i);
    let grp = groups.get(r);
    if (!grp) groups.set(r, grp = { base: Infinity, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], parts: [] });
    grp.parts.push(e);
    grp.base = Math.min(grp.base, e.p.min[1]);
    for (let c = 0; c < 3; c++) {
      grp.min[c] = Math.min(grp.min[c], e.p.min[c]);
      grp.max[c] = Math.max(grp.max[c], e.p.max[c]);
    }
  });
  let dropped = 0, moved = 0, dy = 0;
  for (const grp of groups.values()) {
    let support = -Infinity;
    for (let ci = Math.floor(grp.min[0] / cell) - 1; ci <= Math.floor(grp.max[0] / cell) + 1; ci++) {
      for (let cj = Math.floor(grp.min[2] / cell) - 1; cj <= Math.floor(grp.max[2] / cell) + 1; cj++) {
        const list = tops.get(ci * 100003 + cj);
        if (!list) continue;
        for (const h of list) if (h <= grp.base + 0.5 && h > support) support = h;
      }
    }
    const gap = grp.base - support;
    if (!(gap > 1.2)) continue;                                  // standing on something already
    // Nothing but the street (or nothing at all) underneath: this prop lost the building it was
    // standing on. Remove it rather than leave it hanging in the sky. Props that still have a
    // roof within reach are left exactly where the map put them.
    if (support <= 3.5) {
      for (const { p } of grp.parts) p.bad = true;
      dropped++;
    }
  }
  if (dropped) {
    for (const g of propGeos) {
      const all = pieces(g), good = all.filter(p => !p.bad);
      if (good.length === all.length) continue;
      const keep = good.flatMap(p => p.tris).sort((a, b) => a - b);
      keepTris(g, keep);
    }
  }
  if (dropped) console.log(`[LegoCity] removed ${dropped} rooftop prop structures left with nothing under them`);
}

/**
 * The map builds every bridge approach as a flight of flat boxes (~13 m long, each 2.6 m higher
 * than the last), so the ramps read as giant stairs. Shear each step into one continuous slope
 * through the step centres, and carry the railings/kerbs that sit on the steps with it.
 * @param {{geo: THREE.BufferGeometry, name: string, matName: string}[]} items world-space bridge pieces
 */
/** Deck height along a bridge's run axis, from its [position, height] profile points.
 *  Kept as a factory so a cached bridge (plain data) can get its `f` back. */
export function bridgeProfile(pts) {
  return a => {
    if (a <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (a <= pts[i][0]) {
      const [a0, y0] = pts[i - 1], [a1, y1] = pts[i];
      return y0 + (y1 - y0) * ((a - a0) / (a1 - a0 || 1));
    }
    return pts.at(-1)[1];
  };
}

export function smoothBridgeRamps(items) {
  const byBridge = new Map();
  for (const it of items) { if (!byBridge.has(it.name)) byBridge.set(it.name, []); byBridge.get(it.name).push(it); }
  let sheared = 0, widened = 0, trimmed = 0;
  const infos = [];
  for (const list of byBridge.values()) {
    const steps = list.filter(i => i.matName === 'deck').flatMap(d => pieces(d.geo).map(p => ({ ...p, geo: d.geo })));
    if (steps.length < 5) continue;
    const ext = c => Math.max(...steps.map(p => p.max[c])) - Math.min(...steps.map(p => p.min[c]));
    const ax = ext(0) >= ext(2) ? 0 : 2, lat = 2 - ax;          // run axis, sideways axis
    const len = p => p.max[ax] - p.min[ax];
    const flat = steps.reduce((a, b) => (len(b) > len(a) ? b : a));
    const ramp = steps.filter(p => p !== flat && len(p) < len(flat) * 0.5);
    if (ramp.length < 4) continue;
    // The map leaves a full step-length of air between most ramp slabs (the next tread starts
    // 25.7 m on, but each slab is only 12.9 m long). Shearing alone keeps that floating staircase
    // visible from underneath, so extend each tread to the midpoint of the gap on both sides.
    // Extended treads still share one continuous top/bottom face because they are sheared through
    // the same profile below.
    const order = [...ramp].sort((a, b) => ((a.min[ax] + a.max[ax]) - (b.min[ax] + b.max[ax])));
    const edges = order.map(p => ({ p, min: p.min[ax], max: p.max[ax] }));
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      let lo = e.min, hi = e.max;
      if (i > 0) { const g = e.min - edges[i - 1].max; if (g > 0.01) lo = e.min - g / 2; }
      if (i < edges.length - 1) { const g = edges[i + 1].min - e.max; if (g > 0.01) hi = e.max + g / 2; }
      if (lo === e.min && hi === e.max) continue;
      const arr = e.p.geo.attributes.position.array;
      for (const t of e.p.tris) for (let v = 0; v < 3; v++) {
        const k = t * 9 + v * 3 + ax;
        if (Math.abs(arr[k] - e.min) < 0.001) arr[k] = lo;
        else if (Math.abs(arr[k] - e.max) < 0.001) arr[k] = hi;
      }
      widened++;
    }
    // Slope profile through the step centres and the flat span's ends
    const pts = [[flat.min[ax], flat.max[1]], [flat.max[ax], flat.max[1]],
      ...ramp.map(p => [(p.min[ax] + p.max[ax]) / 2, p.max[1]])].sort((a, b) => a[0] - b[0]);
    // Continue each outer end down the same slope so the first step meets the street
    const slope = (a, b) => (b[1] - a[1]) / (b[0] - a[0] || 1);
    const k0 = slope(pts[0], pts[1]), k1 = slope(pts.at(-2), pts.at(-1));
    const lo = Math.min(...ramp.map(p => p.min[ax])), hi = Math.max(...ramp.map(p => p.max[ax]));
    if (lo < pts[0][0]) pts.unshift([lo, pts[0][1] - k0 * (pts[0][0] - lo)]);
    if (hi > pts.at(-1)[0]) pts.push([hi, pts.at(-1)[1] + k1 * (hi - pts.at(-1)[0])]);
    const f = bridgeProfile(pts);
    const stepAt = a => ramp.find(p => a >= p.min[ax] - 0.01 && a <= p.max[ax] + 0.01);
    const latMin = flat.min[lat] - 4, latMax = flat.max[lat] + 4;
    const shear = (geo, p, step) => {
      const arr = geo.attributes.position.array, top = step.max[1];
      for (const t of p.tris) for (let v = 0; v < 3; v++) {
        const i = t * 9 + v * 3;
        arr[i + 1] += f(arr[i + ax]) - top;
      }
      sheared++;
    };
    for (const p of ramp) shear(p.geo, p, p);
    const info = { ax, lat, latC: (flat.min[lat] + flat.max[lat]) / 2, width: flat.max[lat] - flat.min[lat],
      lo: pts[0][0], hi: pts.at(-1)[0], flat0: flat.min[ax], flat1: flat.max[ax], deckBottom: flat.min[1] - flat.max[1], f, pts };
    infos.push(info);
    // The baked-in stone supports still have level tops at the old step heights. Now that the deck
    // follows a slope, their uphill corners poke through the underside. Cut those tops down to the
    // lowest point of the deck above each support (with a small gap), leaving the bridge towers and
    // the low pier bases untouched.
    const bottomAt = x => f(x) + info.deckBottom;
    for (const it of list) {
      if (it.matName === 'deck') continue;
      for (const p of pieces(it.geo)) {
        const cx = (p.min[ax] + p.max[ax]) / 2;
        const onRamp = (cx >= info.lo && cx <= info.flat0) || (cx >= info.flat1 && cx <= info.hi);
        const tall = p.max[1] - p.min[1] > 8, narrow = p.max[ax] - p.min[ax] < info.width * 0.35;
        const touchesDeck = p.max[1] <= f(cx) + 2 && p.max[1] > f(cx) - 6;
        if (!onRamp || !tall || !narrow || !touchesDeck) continue;
        const top = Math.min(bottomAt(p.min[ax]), bottomAt(p.max[ax])) - 0.15;
        if (p.max[1] <= top) continue;
        const arr = it.geo.attributes.position.array;
        for (const t of p.tris) for (let v = 0; v < 3; v++) {
          const k = t * 9 + v * 3 + 1;
          if (arr[k] > top) arr[k] = top;
        }
        trimmed++;
      }
    }
    // Railings, kerbs and trims riding on the steps (not the piers underneath, not the towers)
    for (const it of list) {
      if (it.matName === 'deck') continue;
      for (const p of pieces(it.geo)) {
        const step = stepAt((p.min[ax] + p.max[ax]) / 2);
        if (!step || p.max[lat] < latMin || p.min[lat] > latMax) continue;
        if (len(p) > len(step) * 1.6) continue;
        if (p.min[1] < step.min[1] - 0.6 || p.min[1] > step.max[1] + 3) continue;
        shear(it.geo, p, step);
      }
    }
  }
  for (const it of items) if (it.geo.attributes.normal) it.geo.computeVertexNormals();
  console.log(`[LegoCity] smoothed ${sheared} bridge ramp pieces into slopes, filled ${widened} stair gaps, trimmed ${trimmed} support tops`);
  return infos;
}

/**
 * Tag every wall triangle with the bounds of the wall face it belongs to
 * (aFace = [start, end] along the wall, [bottom, top], in decimetres, Int16).
 * The facade shader uses it to centre a grid of LEGO windows on each wall,
 * so windows never get cut in half at corners. Roofs/floors get zeros.
 */
export function tagFacades(items) {
  let walls = 0;
  for (const it of items) {
    const geo = it.geo, arr = geo.attributes.position.array, tris = arr.length / 9;
    const out = new Int16Array(tris * 3 * 4);
    for (const p of pieces(geo)) {
      const groups = new Map();
      for (const t of p.tris) {
        const i = t * 9;
        const e1x = arr[i + 3] - arr[i], e1y = arr[i + 4] - arr[i + 1], e1z = arr[i + 5] - arr[i + 2];
        const e2x = arr[i + 6] - arr[i], e2y = arr[i + 7] - arr[i + 1], e2z = arr[i + 8] - arr[i + 2];
        const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
        const nl = Math.hypot(nx, ny, nz) || 1;
        if (Math.abs(ny) / nl > 0.3) continue;                       // not a wall
        const xFacing = Math.abs(nx) > Math.abs(nz);
        const plane = xFacing ? arr[i] : arr[i + 2];
        const key = (xFacing ? 'x' : 'z') + Math.sign(xFacing ? nx : nz) + ':' + Math.round(plane * 2);
        let g = groups.get(key);
        if (!g) groups.set(key, g = { tris: [], u0: Infinity, u1: -Infinity, y0: Infinity, y1: -Infinity, xFacing });
        g.tris.push(t);
        for (let k = 0; k < 3; k++) {
          const u = xFacing ? arr[i + k * 3 + 2] : arr[i + k * 3], y = arr[i + k * 3 + 1];
          if (u < g.u0) g.u0 = u; if (u > g.u1) g.u1 = u;
          if (y < g.y0) g.y0 = y; if (y > g.y1) g.y1 = y;
        }
      }
      for (const g of groups.values()) {
        const q = [g.u0, g.u1, g.y0, g.y1].map(v => Math.max(-32767, Math.min(32767, Math.round(v * 10))));
        for (const t of g.tris) for (let k = 0; k < 3; k++) out.set(q, (t * 3 + k) * 4);
        walls += g.tris.length;
      }
    }
    geo.setAttribute('aFace', new THREE.Int16BufferAttribute(out, 4));
  }
  console.log(`[LegoCity] laid out windows on ${walls} wall triangles`);
}

/**
 * A Spider-Man city needs towers to swing from. Buildings under 20 m are stretched upward
 * into 26-64 m towers (deterministic per building, so the city is the same every load).
 * Slabs of one building share a footprint centre, so they're grouped by it. Rooftop props
 * standing on a raised roof are lifted with it.
 */
export function raiseLowBuildings(items, propGeos) {
  const all = [];
  for (const it of items) for (const p of pieces(it.geo)) all.push({ it, p });
  const groups = new Map();
  for (const e of all) {
    const k = Math.round((e.p.min[0] + e.p.max[0]) / 4) + ',' + Math.round((e.p.min[2] + e.p.max[2]) / 4);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  const lifts = [];
  let raised = 0;
  for (const [k, list] of groups) {
    let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const { p } of list) {
      y0 = Math.min(y0, p.min[1]); y1 = Math.max(y1, p.max[1]);
      x0 = Math.min(x0, p.min[0]); x1 = Math.max(x1, p.max[0]); z0 = Math.min(z0, p.min[2]); z1 = Math.max(z1, p.max[2]);
    }
    const h = y1 - y0, area = (x1 - x0) * (z1 - z0);
    if (h >= 20 || h < 4 || area < 40 || y0 > 8) continue;      // already tall, a kerb/trim, tiny, or not on the street
    const rnd = Math.abs(Math.sin((x0 * 12.9898 + z0 * 78.233)) * 43758.5453) % 1;
    const target = 26 + rnd * rnd * 38;                          // mostly 26-40 m, a few up to 64 m
    const kk = target / h;
    for (const { it, p } of list) {
      const arr = it.geo.attributes.position.array;
      for (const t of p.tris) for (let v = 0; v < 3; v++) { const i = t * 9 + v * 3 + 1; arr[i] = y0 + (arr[i] - y0) * kk; }
      it.geo.attributes.position.needsUpdate = true;
      it.dirty = true;
    }
    lifts.push({ x0, x1, z0, z1, top: y1, dy: y1 - y0 ? (y1 - y0) * (kk - 1) : 0 });
    raised++;
  }
  for (const it of items) if (it.dirty && it.geo.attributes.normal) it.geo.computeVertexNormals();
  // Lift rooftop props that were standing on a raised roof
  let props = 0;
  for (const g of propGeos) {
    for (const p of pieces(g)) {
      const cx = (p.min[0] + p.max[0]) / 2, cz = (p.min[2] + p.max[2]) / 2;
      const L = lifts.find(l => cx > l.x0 && cx < l.x1 && cz > l.z0 && cz < l.z1 && Math.abs(p.min[1] - l.top) < 2.5);
      if (!L) continue;
      const arr = g.attributes.position.array;
      for (const t of p.tris) for (let v = 0; v < 3; v++) arr[t * 9 + v * 3 + 1] += L.dy;
      props++;
    }
  }
  console.log(`[LegoCity] raised ${raised} low buildings into towers, lifted ${props} rooftop props`);
}

/**
 * Bridge furniture built from each bridge's deck profile: LEGO support piers under the ramps
 * (so they stop resting on rooftops), railings, lamp posts and dashed lane lines.
 * Returns { piers: Mesh (collidable), deco: Group }.
 */
export function buildBridgeDetail(infos) {
  const pierGeos = [], railM = [], postM = [], lampM = [], dashM = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
  const place = (b, a, l, y) => (b.ax === 0 ? pos.set(a, y, l) : pos.set(l, y, a));
  for (const b of infos) {
    const half = b.width / 2;
    const slopeAt = a => (b.f(a + 0.5) - b.f(a - 0.5));
    // Piers under the ramps every 18 m (the flat span already has its towers)
    for (const [s0, s1] of [[b.lo, b.flat0], [b.flat1, b.hi]]) {
      for (let a = s0 + 12; a < s1 - 4; a += 18) {
        // Push the pier top well below the deck underside so it never clips through
        const top = b.f(a) - 3.0, bottom = -6;
        if (top - bottom < 3) continue;
        for (const l of [b.latC - half + 2, b.latC + half - 2]) {
          const g = new THREE.BoxGeometry(2.0, top - bottom, 2.0);
          place(b, a, l, (top + bottom) / 2);
          g.translate(pos.x, pos.y, pos.z);
          pierGeos.push(g.toNonIndexed());
        }
        // Cross beam under the deck — sits right at the pier tops
        const beam = new THREE.BoxGeometry(b.ax === 0 ? 1.6 : b.width - 2, 1.0, b.ax === 0 ? b.width - 2 : 1.6);
        place(b, a, b.latC, top);
        beam.translate(pos.x, pos.y, pos.z);
        pierGeos.push(beam.toNonIndexed());
      }
    }
    // Railings, lamps and lane dashes along the whole deck
    const Z = new THREE.Vector3(0, 0, 1), NZ = new THREE.Vector3(0, 0, -1), d = new THREE.Vector3();
    // Unit boxes are modelled along +z: turn them to follow the deck (run axis + slope)
    const runQ = (a) => { const k = slopeAt(a); d.set(b.ax === 0 ? 1 : 0, k, b.ax === 2 ? 1 : 0).normalize(); return q.setFromUnitVectors(Z, d); };
    for (let a = b.lo + 1; a < b.hi - 1; a += 2) {
      const y = b.f(a);
      for (const side of [-1, 1]) {
        const l = b.latC + side * (half - 0.35);
        postM.push(m4.compose(place(b, a, l, y + 0.55), q.identity(), sc.set(1, 1, 1)).clone());
        railM.push(m4.compose(place(b, a + 1, l, b.f(a + 1) + 1.1), runQ(a + 1), sc.set(1, 1, 1)).clone());
      }
      if (Math.round(a) % 6 === 0) dashM.push(m4.compose(place(b, a, b.latC, y + 0.03), runQ(a), sc.set(1, 1, 1)).clone());
      if (Math.round(a) % 30 === 0) for (const side of [-1, 1]) {
        // Lamp arm (modelled toward -z) leans out over the road
        d.set(b.ax === 2 ? -side : 0, 0, b.ax === 0 ? -side : 0);
        q.setFromUnitVectors(NZ, d);
        lampM.push(m4.compose(place(b, a, b.latC + side * (half - 0.8), y), q, sc.set(1, 1, 1)).clone());
      }
    }
  }
  const stone = new THREE.MeshStandardMaterial({ name: 'stone', color: 0xa0a5a9, roughness: 0.5 });
  const piers = new THREE.Mesh(pierGeos.length ? mergeGeos(pierGeos) : new THREE.BufferGeometry(), stone);
  piers.castShadow = piers.receiveShadow = true;
  const deco = new THREE.Group();
  const inst = (geo, mat, list) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = true;
    deco.add(im);
  };
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.5 });
  inst(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 8), white, postM);
  inst(new THREE.BoxGeometry(0.14, 0.14, 2.05), white, railM);
  inst(new THREE.BoxGeometry(0.25, 0.02, 2.4), white, dashM);
  // Lamp: pole + arm + head
  const lampGeo = mergeGeos([
    new THREE.CylinderGeometry(0.1, 0.13, 5, 8).translate(0, 2.5, 0).toNonIndexed(),
    new THREE.BoxGeometry(0.1, 0.1, 1.2).translate(0, 4.95, -0.55).toNonIndexed(),
    new THREE.BoxGeometry(0.4, 0.2, 0.6).translate(0, 4.85, -1.1).toNonIndexed(),
  ]);
  inst(lampGeo, dark, lampM);
  return { piers, deco, axisFix: infos.map(b => b.ax) };
}

function mergeGeos(list) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    P.set(g.attributes.position.array, o * 3);
    N.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return out;
}

export function colorizeBuildings(items) {
  let total = 0;
  for (const it of items) total += it.geo.attributes.position.count;
  const parent = new Int32Array(total);
  for (let i = 0; i < total; i++) parent[i] = i;
  const find = i => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  const seen = new Map();
  let base = 0;
  for (const it of items) {
    const arr = it.geo.attributes.position.array, n = arr.length / 3;
    for (let v = 0; v < n; v++) {
      const id = base + v;
      if (v % 3) union(id - (v % 3), id);
      const key = (Math.round(arr[v * 3] * 20) * 73856093) ^ (Math.round(arr[v * 3 + 1] * 20) * 19349663) ^ (Math.round(arr[v * 3 + 2] * 20) * 83492791);
      const other = seen.get(key);
      if (other === undefined) seen.set(key, id); else union(other, id);
    }
    base += n;
  }
  // Stacked floor slabs don't share vertices, so colour by each piece's footprint centre:
  // every floor of the same tower lands on the same colour.
  const sumX = new Float64Array(total), sumZ = new Float64Array(total), cnt = new Uint32Array(total);
  base = 0;
  for (const it of items) {
    const arr = it.geo.attributes.position.array, n = arr.length / 3;
    for (let v = 0; v < n; v++) {
      const r = find(base + v);
      sumX[r] += arr[v * 3]; sumZ[r] += arr[v * 3 + 2]; cnt[r]++;
    }
    base += n;
  }
  base = 0;
  const c = new THREE.Color();
  for (const it of items) {
    const n = it.geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    const shade = it.matName === 'toy_dgray' || it.matName === 'granite' ? 0.78 : 1; // trims stay darker
    for (let v = 0; v < n; v++) {
      const root = find(base + v);
      const fx = Math.round(sumX[root] / cnt[root] / 8), fz = Math.round(sumZ[root] / cnt[root] / 8);
      c.copy(BROOKLYN[Math.floor(hash2(fx, fz) * BROOKLYN.length)]).multiplyScalar(shade);
      col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
    }
    it.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    base += n;
  }
}

// ─── Ground textures (world-space UVs: 1 tile = 4 m) ──────────────────────
const texCache = {};
function canvasTex(draw, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function speckle(g, s, base, spread, n) {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) {
    const v = (Math.random() - 0.5) * spread;
    g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v)})`;
    g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}
const GROUND_TEX = {
  asphalt: () => canvasTex((g, s) => {
    // Rich asphalt with aggregate speckle, subtle damp sheen and road surface variation
    speckle(g, s, '#2b2e34', 0.22, 12000);
    g.strokeStyle = 'rgba(10,12,16,0.35)'; g.lineWidth = 2.0;
    for (let i = 0; i < 5; i++) { // authentic road cracks
      g.beginPath(); let x = Math.random() * s, y = Math.random() * s; g.moveTo(x, y);
      for (let k = 0; k < 7; k++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); }
      g.stroke();
    }
    // Faint subtle oil slick / sheen patches for realistic reflections
    for (let i = 0; i < 3; i++) {
      const rx = Math.random() * s, ry = Math.random() * s;
      const rad = 20 + Math.random() * 40;
      const grad = g.createRadialGradient(rx, ry, 0, rx, ry, rad);
      grad.addColorStop(0, 'rgba(45, 52, 68, 0.28)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(rx, ry, rad, 0, Math.PI * 2); g.fill();
    }
  }),
  sidewalk: () => canvasTex((g, s) => {
    const n = 2, t = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = 150 + Math.floor(Math.random() * 16);
      g.fillStyle = `rgb(${v},${v + 2},${v + 5})`; g.fillRect(i * t, j * t, t, t);
    }
    speckle({ fillRect: g.fillRect.bind(g), set fillStyle(v) { g.fillStyle = v; } }, s, 'rgba(0,0,0,0)', 0.12, 4000);
    g.fillStyle = 'rgba(30,34,40,0.65)';
    for (let i = 0; i <= n; i++) { g.fillRect(i * t - 2, 0, 4, s); g.fillRect(0, i * t - 2, s, 4); }
  }),
  path: () => canvasTex((g, s) => speckle(g, s, '#d9bc7e', 0.2, 7000)),
  concrete: () => canvasTex((g, s) => speckle(g, s, '#b5b8ba', 0.12, 6000)),
  // Grass as a studded LEGO baseplate
  grass: () => canvasTex((g, s) => {
    g.fillStyle = '#4c9e3f'; g.fillRect(0, 0, s, s);
    const n = 8, t = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = (i + 0.5) * t, y = (j + 0.5) * t;
      g.fillStyle = '#3d8433'; g.beginPath(); g.arc(x + 2, y + 3, t * 0.32, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#58b049'; g.beginPath(); g.arc(x, y, t * 0.32, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.arc(x - 3, y - 3, t * 0.12, 0, Math.PI * 2); g.fill();
    }
  }),
};

/** Glossy LEGO plastic replacement for an MTL material. */
/** 0 = daylight, 1 = full night. Shared by every city tile so SceneSetup can switch the whole
 *  skyline with one write; the value lives in a uniform, not in per-mesh material rebuilds. */
export const NIGHT_LEVEL = { value: 1 };

export function legoMaterial(mat) {
  const name = mat?.name ?? '';
  const building = isBuildingMat(name);
  const glass = name === 'window' || name === 'glass_blue' || name === 'water';
  const map = GROUND_TEX[name] ? (texCache[name] ??= GROUND_TEX[name]()) : null;
  const m = new THREE.MeshStandardMaterial({
    name,
    map,
    color: building || map ? 0xffffff : (LEGO_COLORS[name] ?? mat?.color ?? 0xcccccc),
    vertexColors: building,
    // Subtle damp asphalt reflections and PBR tuning
    roughness: glass ? 0.08 : name === 'asphalt' ? 0.48 : ['sidewalk', 'path', 'paint', 'concrete'].includes(name) ? 0.72 : name === 'grass' ? 0.88 : 0.38,
    metalness: ['steel', 'chrome', 'gold', 'iron'].includes(name) ? 0.65 : name === 'asphalt' ? 0.12 : 0,
    side: THREE.DoubleSide,
  });
  if (building) addBrickDetail(m);
  if (name === 'water') {
    // Fog turned the sea into the sky colour at ~1.7 km (so it looked missing from the shore),
    // and the shoreline z-fought the beach: keep the water out of the haze and lose every tie.
    m.fog = false;
    m.polygonOffset = true;
    m.polygonOffsetFactor = 4;
    m.polygonOffsetUnits = 8;
    addWaterWaves(m);   // rolling wave normals + crest tint, same waves the boats float on
  }
  return m;
}

/**
 * LEGO brick walls, procedurally in the shader from world position (no UVs needed):
 * staggered brick courses, shadowed grooves between bricks, and a slight tint per brick.
 * Roofs (faces pointing up) stay smooth.
 */
function addBrickDetail(m) {
  m.customProgramCacheKey = () => 'lego-facade-v5';
  m.onBeforeCompile = shader => {
    shader.uniforms.uNight = NIGHT_LEVEL;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aFace;
varying vec3 vBrickPos;
varying vec3 vBrickNrm;
varying vec4 vFace;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vBrickPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vBrickNrm = normalize(mat3(modelMatrix) * normal);
        vFace = aFace * 0.1;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vBrickPos;
varying vec3 vBrickNrm;
varying vec4 vFace;
uniform float uNight;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float glassMask = 0.0;
        float litMask = 0.0;
        vec3 litTint = vec3(0.0);
        {
          vec3 an = abs(vBrickNrm);
          if (an.y < 0.6) {
            // ── LEGO bricks: staggered courses with soft grooves ──
            const float H = 0.48;   // brick course height (m)
            const float W = 1.44;   // brick length (m)
            float along = an.x > an.z ? vBrickPos.z : vBrickPos.x;
            float row = floor(vBrickPos.y / H);
            float bu = along / W + mod(row, 2.0) * 0.5;
            float fu = fract(bu), fv = fract(vBrickPos.y / H);
            float px = fwidth(along);                       // metres per pixel: fade fine detail far away
            float fine = 1.0 - smoothstep(0.08, 0.25, px);
            float groove = smoothstep(0.0, 0.06, fv) * smoothstep(0.0, 0.02, fu) * smoothstep(1.0, 0.98, fu);
            float hsh = fract(sin(dot(vec2(floor(bu), row), vec2(12.9898, 78.233))) * 43758.5453);
            float lip = smoothstep(0.86, 0.97, fv) * 0.06;
            diffuseColor.rgb *= mix(1.0, mix(0.7, 1.0, groove) * (0.94 + 0.1 * hsh) + lip, fine);

            // ── Windows: a centred grid per wall face (see tagFacades) ──
            float faceW = vFace.y - vFace.x, faceH = vFace.w - vFace.z;
            if (faceW > 2.4 && faceH > 2.6) {
              // Windows sit on ONE city-wide grid (world position, not each wall's own bounds), so two
              // walls that overlap in the same plane draw identical windows instead of speckling
              // through each other. A window is drawn only if its whole cell fits on this wall, so
              // none get sliced by floor bands, setbacks or corners.
              float bh = fract(sin(dot(vColor.rgb, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
              const float FH = 3.6;                            // storey height, city-wide
              float yW = vBrickPos.y - 2.0;                    // measured from street level
              float fl = floor(yW / FH), ly = yW - fl * FH;
              bool shop = fl < 0.5;                            // street level
              float CW = shop ? 4.32 : 4.8;
              float col = floor(along / CW), lx = along - col * CW;
              float cellBot = vBrickPos.y - ly, cellL = along - lx;
              bool fits = fl >= 0.0 && cellBot >= vFace.z - 0.05 && cellBot + FH <= vFace.w - 0.25
                       && cellL >= vFace.x + 0.15 && cellL + CW <= vFace.y - 0.15;
              if (fits) {
                bool door = shop && mod(col, 4.0) == 1.0;
                float ww = door ? 1.3 : (shop ? 3.3 : (bh > 0.66 ? 2.3 : 1.44));
                float wh = door ? 2.35 : (shop ? 2.1 : 1.9);
                float wy0 = door ? 0.0 : (shop ? 0.3 : (FH - wh) * 0.55);
                float wx0 = (CW - ww) * 0.5;
                float qx = lx - wx0, qy = ly - wy0;
                const float FR = 0.11;                        // frame width
                vec3 frameCol = vec3(0.93, 0.93, 0.91);
                if (qx > -FR && qx < ww + FR && qy > -FR && qy < wh + FR) {
                  bool pane = qx > 0.0 && qx < ww && qy > 0.0 && qy < wh;
                  if (!pane) diffuseColor.rgb = frameCol;
                  else if (door) {
                    // Reddish-brown door with two panels and a gold knob
                    vec3 dc = vec3(0.42, 0.16, 0.10);
                    float pnl = step(0.18, qx) * step(qx, ww - 0.18) * (step(0.2, qy) * step(qy, 1.0) + step(1.25, qy) * step(qy, wh - 0.2));
                    diffuseColor.rgb = dc * mix(1.0, 0.82, pnl * fine);
                    if (length(vec2(qx - ww + 0.25, qy - 1.15)) < 0.07) diffuseColor.rgb = vec3(0.9, 0.7, 0.2);
                  } else {
                    // Mullions: a cross on upper floors, verticals on shop fronts
                    float mx = abs(qx - ww * 0.5), my = abs(qy - wh * 0.5);
                    float bar = shop ? step(mx, 0.045) + step(abs(qx - ww * 0.25), 0.03) + step(abs(qx - ww * 0.75), 0.03)
                                     : step(mx, 0.045) + step(my, 0.045);
                    if (bar * fine > 0.5) diffuseColor.rgb = frameCol;
                    else {
                      // Trans-light-blue LEGO glass: darker low, a diagonal glint
                      float g = qy / wh;
                      vec3 glassDay = mix(vec3(0.33, 0.52, 0.70), vec3(0.62, 0.80, 0.95), g);
                      float glint = smoothstep(0.06, 0.0, abs((qx / ww) - g * 0.9 + 0.15)) * 0.35;
                      
                      // Illuminated windows & warm interior light at night / evening
                      float winSeed = fract(sin(dot(vec2(col, fl), vec2(12.9898, 78.233))) * 43758.5453);
                      // ~65% of windows have cozy warm interior lighting
                      bool lit = winSeed > 0.35;
                      vec3 warmLight = mix(vec3(1.0, 0.82, 0.45), vec3(1.0, 0.95, 0.70), fract(winSeed * 7.0));
                      // Interior depth simulation (blinds / curtain silhouettes)
                      float blinds = step(0.12, fract(qy * 12.0)) * 0.15;
                      vec3 litWindow = (warmLight - blinds) * (0.85 + 0.35 * winSeed);

                      diffuseColor.rgb = glassDay + glint;
                      // At night the glass becomes the interior: warm, readable, and emissive
                      // through the post pass. By day it stays a cool plastic pane.
                      diffuseColor.rgb = mix(diffuseColor.rgb, litWindow, mix(0.18, 0.88, uNight));
                      if (lit) {
                        litMask = 1.0;
                        litTint = litWindow;
                      }
                      glassMask = 1.0;
                    }
                  }
                } else if (!door && qy < -FR && qy > -FR - 0.16 && qx > -FR - 0.08 && qx < ww + FR + 0.08) {
                  diffuseColor.rgb = frameCol * 0.78;           // sill
                } else if (shop && qy > wh + FR + 0.12 && qy < wh + FR + 0.55 && qx > -FR - 0.1 && qx < ww + FR + 0.1 && !door) {
                  // Striped shop awning band over each shop window
                  float st = step(0.5, fract((lx) / 0.36));
                  diffuseColor.rgb = mix(vec3(0.80, 0.1, 0.08), vec3(0.95), st);
                }
              }
            }
          }
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.12, glassMask);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // Lit windows only glow after dusk. Daylight keeps a hint so the pane never reads flat.
        if (glassMask > 0.5) {
          totalEmissiveRadiance += litTint * litMask * (0.05 + uNight * 1.15);
          totalEmissiveRadiance += diffuseColor.rgb * uNight * 0.10;
        }`);
  };
}

/**
 * Real 3D studs on flat roofs near `center`, coloured to match each roof.
 * @param {THREE.Mesh[]} meshes merged city meshes (world-space geometry)
 */
export function buildRoofStuds(meshes, center, radius = 350, spacing = 2.4, max = 120000) {
  // The underside sits on the roof and is never seen: drop its cap (40 → 30 triangles a stud).
  // Past STUD_NEAR a stud is a few pixels wide, so a six-sided one (16 triangles) reads the same.
  const studShape = sides => {
    const g = new THREE.CylinderGeometry(0.62, 0.62, 0.4, sides);
    g.translate(0, 0.2, 0);
    const bottom = g.groups[2];
    g.setIndex(Array.from(g.index.array).filter((_, i) => i < bottom.start || i >= bottom.start + bottom.count));
    g.clearGroups();
    return g;
  };
  const studGeo = studShape(10), studGeoFar = studShape(6);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0 });
  const matrices = [], colors = [];
  const r2 = radius * radius;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
  const m4 = new THREE.Matrix4(), col = new THREE.Color();

  for (const mesh of meshes) {
    if (!isBuildingMat(mesh.material?.name)) continue;
    const pos = mesh.geometry.attributes.position;
    const vc = mesh.geometry.attributes.color;
    for (let t = 0; t < pos.count && matrices.length < max; t += 3) {
      a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
      if (a.y < 6) continue;
      n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
      if (Math.abs(n.y) < 0.97 * n.length()) continue; // flat roofs only
      const dx = a.x - center.x, dz = a.z - center.z;
      if (dx * dx + dz * dz > r2) continue;

      const minX = Math.min(a.x, b.x, c.x), maxX = Math.max(a.x, b.x, c.x);
      const minZ = Math.min(a.z, b.z, c.z), maxZ = Math.max(a.z, b.z, c.z);
      const area2 = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
      if (Math.abs(area2) < 1e-6) continue;
      if (vc) col.fromBufferAttribute(vc, t); else col.setRGB(0.7, 0.7, 0.7);
      // World-aligned grid so studs line up across neighbouring roof triangles
      for (let x = Math.ceil(minX / spacing) * spacing; x <= maxX; x += spacing) {
        for (let z = Math.ceil(minZ / spacing) * spacing; z <= maxZ; z += spacing) {
          const w1 = ((b.x - x) * (c.z - z) - (c.x - x) * (b.z - z)) / area2;
          const w2 = ((c.x - x) * (a.z - z) - (a.x - x) * (c.z - z)) / area2;
          const w3 = 1 - w1 - w2;
          if (w1 < 0 || w2 < 0 || w3 < 0) continue;
          const y = w1 * a.y + w2 * b.y + w3 * c.y;
          matrices.push(m4.makeTranslation(x, y, z).clone());
          colors.push(col.r, col.g, col.b);
          if (matrices.length >= max) break;
        }
      }
    }
  }

  // One InstancedMesh for every stud is a single bounding sphere over the whole district, so
  // nothing was ever culled: all of them (2.8 M triangles) were drawn every frame, even behind
  // the camera. Bucket them into 60 m cells instead; each cell is frustum-culled by Three.js, and
  // SceneSetup shows the full-detail copy near the camera, the six-sided copy further out and
  // neither past STUD_RANGE. Both copies share one set of instance buffers.
  const CELL = 60, cells = new Map();
  matrices.forEach((m, i) => {
    const cx = Math.floor(m.elements[12] / CELL), cz = Math.floor(m.elements[14] / CELL), k = cx + ',' + cz;
    let c = cells.get(k);
    if (!c) cells.set(k, c = { cx, cz, ids: [] });
    c.ids.push(i);
  });
  const group = new THREE.Group();
  group.name = 'RoofStuds';
  for (const c of cells.values()) {
    const inst = new THREE.InstancedMesh(studGeo, mat, c.ids.length);
    const col = new Float32Array(c.ids.length * 3);
    c.ids.forEach((id, j) => { inst.setMatrixAt(j, matrices[id]); col.set(colors.slice(id * 3, id * 3 + 3), j * 3); });
    inst.instanceColor = new THREE.InstancedBufferAttribute(col, 3);
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    inst.userData.cell = { x: (c.cx + 0.5) * CELL, z: (c.cz + 0.5) * CELL, lod: 0 };
    const far = new THREE.InstancedMesh(studGeoFar, mat, c.ids.length);
    far.instanceMatrix = inst.instanceMatrix;
    far.instanceColor = inst.instanceColor;
    far.receiveShadow = true;
    far.boundingSphere = inst.boundingSphere.clone();
    far.userData.cell = { ...inst.userData.cell, lod: 1 };
    far.visible = false;
    group.add(inst, far);
  }
  console.log(`[LegoCity] ${matrices.length} roof studs in ${cells.size} cells`);
  return group;
}
/** Roof-stud cells further than this from the camera are hidden (see buildRoofStuds). */
export const STUD_RANGE = 230, STUD_NEAR = 70;

/**
 * Window panes are separate thin boxes in the map. Where a building was cut away (bridge ramps)
 * or never modelled, its panes hang in mid-air. Keep a pane only if a solid surface sits right
 * behind it (short ray both ways along its thin axis, using the merged meshes' BVHs).
 */
export function removeFloatingGlass(glassMeshes, solidMeshes) {
  const ray = new THREE.Raycaster();
  ray.firstHitOnly = true;
  const c = new THREE.Vector3(), d = new THREE.Vector3();
  let dropped = 0;
  for (const mesh of glassMeshes) {
    const parts = pieces(mesh.geometry), keep = [];
    for (const p of parts) {
      const ext = [0, 1, 2].map(i => p.max[i] - p.min[i]);
      const ax = ext.indexOf(Math.min(...ext));
      c.set((p.min[0] + p.max[0]) / 2, (p.min[1] + p.max[1]) / 2, (p.min[2] + p.max[2]) / 2);
      let attached = false;
      for (const s of [1, -1]) {
        d.set(0, 0, 0).setComponent(ax, s);
        ray.set(c, d);
        ray.far = 1.0 + ext[ax];
        if (ray.intersectObjects(solidMeshes, false).length) { attached = true; break; }
      }
      if (attached) keep.push(...p.tris); else dropped++;
    }
    if (keep.length === mesh.geometry.attributes.position.count / 3) continue;
    keep.sort((a, b) => a - b);
    keepTris(mesh.geometry, keep);
    mesh.geometry.disposeBoundsTree?.();
    mesh.geometry.computeBoundingSphere();
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundsTree?.();
  }
  console.log(`[LegoCity] removed ${dropped} floating window panes`);
}

/**
 * After buildings are stretched taller, a few small rooftop pieces (water tanks, vents, sheds)
 * can end up hanging in the air. Drop any small piece above street level with nothing solid
 * under its centre or corners. Bridges and Liberty Island are left alone (cables, trusses).
 */
export function removeFloatingProps(meshes, solids, keepOut = []) {
  const PROP = /^(wood|steel|iron|chrome|concrete|copper|gold|granite|stone|limestone|seam|light_red|toy_)/;
  const ray = new THREE.Raycaster();
  ray.firstHitOnly = true;
  const o = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
  // Street band: the exported map leaves small toy/bracket pieces hovering over the pavement
  // (the same +Y export offset that lifted every tree trunk). They have air below and no wall
  // contact, so they read as grey blobs floating along the shop fronts at night.
  const DIRV = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)];
  let dropped = 0, street = 0;
  for (const mesh of meshes) {
    if (!PROP.test(mesh.material?.name ?? '')) continue;
    const parts = pieces(mesh.geometry), keep = [];
    for (const p of parts) {
      const w = p.max[0] - p.min[0], h = p.max[1] - p.min[1], d = p.max[2] - p.min[2];
      const cx = (p.min[0] + p.max[0]) / 2, cz = (p.min[2] + p.max[2]) / 2;
      const small = Math.max(w, d) < 10 && h < 14 && p.min[1] > 6;
      const low = Math.max(w, d) < 2.6 && h < 2.6 && p.min[1] > 0.7 && p.min[1] < 6.5;
      if ((!small && !low) || keepOut.some(b => cx > b[0] && cx < b[1] && cz > b[2] && cz < b[3])) { keep.push(...p.tris); continue; }
      let supported = false;
      if (small) {
        for (const [fx, fz] of [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) {
          ray.set(o.set(p.min[0] + w * fx, p.min[1] - 0.03, p.min[2] + d * fz), down);
          ray.far = 3;
          if (ray.intersectObjects(solids, false).length) { supported = true; break; }
        }
      } else {
        // Street pieces: either they sit on something (kerb, pavement, awning) or they touch a
        // wall/pole. A detached piece at chest height satisfies neither and is dropped.
        for (const [fx, fz] of [[0.5, 0.5], [0.15, 0.15], [0.85, 0.85]]) {
          ray.set(o.set(p.min[0] + w * fx, p.min[1] - 0.03, p.min[2] + d * fz), down);
          ray.far = 1.2;
          if (ray.intersectObjects(solids, false).length) { supported = true; break; }
        }
        if (!supported) {
          const my = (p.min[1] + p.max[1]) / 2;
          for (const dir of DIRV) {
            ray.set(o.set(cx, my, cz), dir);
            ray.far = 0.45;
            if (ray.intersectObjects(solids, false).length) { supported = true; break; }
          }
        }
      }
      if (supported) keep.push(...p.tris); else { dropped++; if (low) street++; }
    }
    if (keep.length === mesh.geometry.attributes.position.count / 3) continue;
    keep.sort((a, b) => a - b);
    keepTris(mesh.geometry, keep);
    mesh.geometry.disposeBoundsTree?.();
    mesh.geometry.computeBoundingSphere();
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundsTree?.();
  }
  console.log(`[LegoCity] removed ${dropped} floating pieces (${street} at street level)`);
}
