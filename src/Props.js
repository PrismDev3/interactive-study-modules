/**
 * Props.js — LEGO street furniture along the curbs: trash bins, benches, hydrants, mailboxes,
 * newspaper boxes and planters. One InstancedMesh per prop type keeps it cheap to draw.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function part(geo, color, x = 0, y = 0, z = 0, rx = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}
const box = (w, h, d, color, x, y, z) => part(new THREE.BoxGeometry(w, h, d), color, x, y, z);
const cyl = (r, h, color, x, y, z, seg = 14) => part(new THREE.CylinderGeometry(r, r, h, seg), color, x, y, z);
const stud = (color, x, y, z, r = 0.07) => cyl(r, 0.06, color, x, y + 0.03, z, 10);

// Models face +z (towards the road). Origin at ground level.
const MODELS = {
  bin: () => [
    cyl(0.28, 0.78, 0x2f6b3a, 0, 0.39, 0, 16), cyl(0.31, 0.08, 0x23542d, 0, 0.82, 0, 16),
    stud(0x23542d, 0, 0.86, 0, 0.1),
  ],
  bench: () => [
    box(1.5, 0.08, 0.42, 0x8a5a2b, 0, 0.46, 0), box(1.5, 0.36, 0.07, 0x8a5a2b, 0, 0.72, -0.2),
    box(0.08, 0.46, 0.4, 0x4a4e54, -0.66, 0.23, 0), box(0.08, 0.46, 0.4, 0x4a4e54, 0.66, 0.23, 0),
    stud(0x8a5a2b, -0.4, 0.5, 0), stud(0x8a5a2b, 0.4, 0.5, 0),
  ],
  hydrant: () => [
    cyl(0.17, 0.6, 0xc91a09, 0, 0.3, 0), cyl(0.21, 0.08, 0xc91a09, 0, 0.62, 0), cyl(0.12, 0.12, 0xc91a09, 0, 0.72, 0),
    part(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 10), 0xe8e8e8, 0, 0.42, 0, Math.PI / 2),
    stud(0xc91a09, 0, 0.78, 0, 0.06),
  ],
  mailbox: () => [
    box(0.5, 0.7, 0.5, 0x0a57c2, 0, 0.62, 0),
    part(new THREE.CylinderGeometry(0.25, 0.25, 0.5, 14), 0x0a57c2, 0, 0.97, 0, Math.PI / 2), // rounded top
    box(0.08, 0.27, 0.08, 0x1b1b1f, -0.2, 0.13, -0.2), box(0.08, 0.27, 0.08, 0x1b1b1f, 0.2, 0.13, -0.2),
    box(0.08, 0.27, 0.08, 0x1b1b1f, -0.2, 0.13, 0.2), box(0.08, 0.27, 0.08, 0x1b1b1f, 0.2, 0.13, 0.2),
    box(0.3, 0.05, 0.02, 0xf4f4f4, 0, 0.85, 0.26),
  ],
  news: () => [
    box(0.42, 0.55, 0.38, 0xf6c21a, 0, 0.55, 0), box(0.3, 0.22, 0.02, 0x9fd6ff, 0, 0.62, 0.2),
    box(0.06, 0.28, 0.06, 0x1b1b1f, -0.16, 0.14, 0), box(0.06, 0.28, 0.06, 0x1b1b1f, 0.16, 0.14, 0),
  ],
  planter: () => [
    box(0.8, 0.45, 0.8, 0xa85a2a, 0, 0.225, 0),
    part(new THREE.IcosahedronGeometry(0.42, 0), 0x2e8b3a, 0, 0.72, 0),
    part(new THREE.IcosahedronGeometry(0.28, 0), 0x3fa34a, 0.15, 0.98, 0.05),
  ],
};
// Plaza pieces (open paved areas away from walls and roads)
Object.assign(MODELS, {
  pine: () => [
    cyl(0.17, 1.4, 0x6b3a1f, 0, 0.7, 0, 10),
    part(new THREE.ConeGeometry(1.15, 1.1, 10), 0x237841, 0, 1.75, 0),
    part(new THREE.ConeGeometry(0.88, 0.95, 10), 0x2e8b3a, 0, 2.4, 0),
    part(new THREE.ConeGeometry(0.58, 0.8, 10), 0x3fa34a, 0, 2.95, 0),
  ],
  roundtree: () => [
    cyl(0.16, 1.5, 0x6b3a1f, 0, 0.75, 0, 10),
    part(new THREE.IcosahedronGeometry(1.0, 1), 0x3a9a44, 0, 2.2, 0),
    part(new THREE.IcosahedronGeometry(0.7, 1), 0x4cb052, 0.55, 2.55, 0.2),
    part(new THREE.IcosahedronGeometry(0.65, 1), 0x2f8a3c, -0.5, 2.45, -0.25),
    cyl(0.75, 0.12, 0x7a7f87, 0, 0.06, 0, 16),                                   // tree grate
  ],
  bigplanter: () => [
    cyl(0.75, 0.55, 0xa85a2a, 0, 0.275, 0, 16), cyl(0.68, 0.06, 0x6b3a1f, 0, 0.56, 0, 16),
    part(new THREE.IcosahedronGeometry(0.55, 1), 0x2e8b3a, 0, 0.95, 0),
    part(new THREE.IcosahedronGeometry(0.2, 0), 0xe8469a, 0.3, 1.2, 0.25),   // flowers
    part(new THREE.IcosahedronGeometry(0.18, 0), 0xf6c21a, -0.3, 1.15, 0.2),
  ],
  // Tall kerbside street lamp: pole, curved arm over the road, lamp head (a perch point)
    streetlamp: () => [
    cyl(0.2, 0.3, 0x2b2d31, 0, 0.15, 0, 12), cyl(0.09, 5.6, 0x2b2d31, 0, 2.95, 0, 10),
    box(0.12, 0.12, 1.5, 0x2b2d31, 0, 5.75, 0.68), box(0.5, 0.22, 0.7, 0x2b2d31, 0, 5.65, 1.35),
    box(0.44, 0.08, 0.58, 0xfff3c8, 0, 5.52, 1.35), // warm golden streetlight lens
    cyl(0.16, 0.12, 0x2b2d31, 0, 5.85, 0, 10),
  ],
  lamp: () => [
    cyl(0.18, 0.25, 0x1f3a2a, 0, 0.125, 0, 12), cyl(0.07, 4.0, 0x1f3a2a, 0, 2.1, 0, 10),
    box(0.4, 0.5, 0.4, 0x1f3a2a, 0, 4.25, 0), box(0.32, 0.40, 0.32, 0xfff0b8, 0, 4.25, 0),
    cyl(0.26, 0.08, 0x1f3a2a, 0, 4.54, 0, 12),
  ],
  cart: () => [
    box(1.4, 0.7, 0.8, 0xf4f4f4, 0, 0.85, 0), box(1.42, 0.18, 0.82, 0xc91a09, 0, 1.15, 0),
    part(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 14), 0x1b1b1f, -0.5, 0.28, 0.42, Math.PI / 2),
    part(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 14), 0x1b1b1f, 0.5, 0.28, 0.42, Math.PI / 2),
    cyl(0.04, 1.3, 0x7a7f87, 0, 1.85, 0, 8),
    part(new THREE.ConeGeometry(1.0, 0.45, 12), 0xf6c21a, 0, 2.6, 0),
    box(0.5, 0.25, 0.3, 0xd9a22c, 0.3, 1.36, 0),                                  // hot dog sign
  ],
  fountain: () => [
    cyl(1.7, 0.5, 0xa0a5a9, 0, 0.25, 0, 24), cyl(1.5, 0.06, 0x3a8ad6, 0, 0.45, 0, 24),
    cyl(0.25, 1.0, 0xa0a5a9, 0, 0.75, 0, 12), cyl(0.7, 0.18, 0xa0a5a9, 0, 1.3, 0, 18),
    cyl(0.6, 0.05, 0x3a8ad6, 0, 1.38, 0, 18), part(new THREE.SphereGeometry(0.22, 12, 8), 0x9fd6ff, 0, 1.6, 0),
  ],
});
const PLAZA = [['pine', 3], ['roundtree', 4], ['bigplanter', 2], ['lamp', 3], ['bench', 2], ['cart', 1], ['fountain', 1]];
const PLAZA_FOOT = { pine: 1.0, roundtree: 1.0, bigplanter: 0.8, lamp: 0.25, bench: 0.8, cart: 1.0, fountain: 1.9 };
const pickPlaza = () => {
  let r = Math.random() * PLAZA.reduce((s, w) => s + w[1], 0);
  for (const [k, w] of PLAZA) if ((r -= w) <= 0) return k;
  return 'roundtree';
};

const WEIGHTS = [['bin', 4], ['bench', 2], ['hydrant', 3], ['mailbox', 1], ['news', 1], ['planter', 2]];
const pickType = () => {
  let r = Math.random() * WEIGHTS.reduce((s, w) => s + w[1], 0);
  for (const [k, w] of WEIGHTS) if ((r -= w) <= 0) return k;
  return 'bin';
};

/** Scatter props on sidewalks near `center`, each turned to face the nearest road. */
// Footprint radius (m) used by pedestrians to walk around each prop, and how far it sits off the wall
const FOOT = { bin: 0.35, bench: 0.8, hydrant: 0.25, mailbox: 0.35, news: 0.3, planter: 0.5 };
const WALL_GAP = { bin: 0.35, bench: 0.3, mailbox: 0.3, news: 0.25, planter: 0.45 };

/**
 * Scatter props on sidewalks near `center`. Most stand against the building wall facing the
 * street (out of the walking line); hydrants stand at the curb. Returns footprints {x, z, r}.
 */
export function buildProps(scene, cityMeshes, center, count = 320, radius = 300) {
  const ray = Object.assign(new THREE.Raycaster(), { firstHitOnly: true });
  const down = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3(), d3 = new THREE.Vector3();
  const drop = (x, z) => { ray.set(o.set(x, 1000, z), down); ray.far = Infinity; return ray.intersectObjects(cityMeshes, false)[0]; };
  const isRoad = (x, z, y) => {
    const h = drop(x, z);
    return h && (h.object.material?.name === 'asphalt' || h.object.material?.name === 'paint') && Math.abs(h.point.y - y) < 1;
  };
  const wallDist = (x, y, z, dx, dz) => {
    ray.set(o.set(x, y + 0.6, z), d3.set(dx, 0, dz));
    ray.far = 6;
    return ray.intersectObjects(cityMeshes, false)[0]?.distance ?? Infinity;
  };
  const placed = {};
  for (const k of Object.keys(MODELS)) placed[k] = [];
  const footprints = [];
  const perches = [];
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let tries = 0; tries < count * 14 && footprints.length < count; tries++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
    const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
    const h = drop(x, z);
    if (!h || h.object.material?.name !== 'sidewalk' || Math.abs(h.point.y - center.y) > 6) continue;
    const y = h.point.y;
    // Nearest building wall, and the road on the opposite side
    let wall = null;
    for (const [dx, dz] of DIRS) {
      const dist = wallDist(x, y, z, dx, dz);
      if (dist < 6 && (!wall || dist < wall.dist)) wall = { dx, dz, dist };
    }
    if (!wall) continue;
    const type = pickType();
    let px, pz, fx = -wall.dx, fz = -wall.dz; // face away from the wall, towards the street
    if (type === 'hydrant') {
      // Find the curb: walk out from the wall until the road starts
      let k = 0;
      while (k < 8 && !isRoad(x + fx * k, z + fz * k, y)) k += 0.25;
      if (k >= 8) continue;
      px = x + fx * (k - 0.45); pz = z + fz * (k - 0.45);
    } else {
      const off = wall.dist - WALL_GAP[type];
      px = x + wall.dx * off; pz = z + wall.dz * off;
      if (!isRoad(px + fx * 6, pz + fz * 6, y) && !isRoad(px + fx * 3, pz + fz * 3, y)) continue; // must face a street
    }
    if (footprints.some(t => (t.x - px) ** 2 + (t.z - pz) ** 2 < 36)) continue;
    footprints.push({ x: px, z: pz, r: FOOT[type] });
    placed[type].push(new THREE.Matrix4().compose(
      new THREE.Vector3(px, y, pz),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(fx, fz)),
      new THREE.Vector3(1, 1, 1)));
  }
  // Second pass: fill open paved areas (plazas) that have no wall or road close by
  let plaza = 0;
  for (let tries = 0; tries < 4000 && plaza < 180; tries++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
    const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
    const h = drop(x, z);
    if (!h || !['sidewalk', 'path', 'concrete'].includes(h.object.material?.name) || Math.abs(h.point.y - center.y) > 6) continue;
    const y = h.point.y;
    if (DIRS.some(([dx, dz]) => wallDist(x, y, z, dx, dz) < 6)) continue;
    let nearRoad = false;
    for (let k = 0; k < 8 && !nearRoad; k++) {
      const aa = (k / 8) * Math.PI * 2;
      nearRoad = isRoad(x + Math.cos(aa) * 5, z + Math.sin(aa) * 5, y);
    }
    if (nearRoad) continue;
    const type = pickPlaza();
    const foot = PLAZA_FOOT[type];
    if (footprints.some(t => (t.x - x) ** 2 + (t.z - z) ** 2 < (t.r + foot + 4) ** 2)) continue;
    footprints.push({ x, z, r: foot });
    placed[type].push(new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2),
      new THREE.Vector3(1, 1, 1)));
    plaza++;
  }

  // Third pass: street lamps along the kerbs, spaced out, arm reaching over the road
  let lamps = 0;
  for (let tries = 0; tries < 5000 && lamps < 140; tries++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
    const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
    const h = drop(x, z);
    if (!h || h.object.material?.name !== 'sidewalk' || Math.abs(h.point.y - center.y) > 6) continue;
    const y = h.point.y;
    let kerb = null;
    for (const [dx, dz] of DIRS) {
      let k = 0;
      while (k < 6 && !isRoad(x + dx * k, z + dz * k, y)) k += 0.5;
      if (k < 6 && (!kerb || k < kerb.k)) kerb = { dx, dz, k };
    }
    if (!kerb) continue;
    const px = x + kerb.dx * (kerb.k - 0.6), pz = z + kerb.dz * (kerb.k - 0.6);
    if (footprints.some(t => (t.x - px) ** 2 + (t.z - pz) ** 2 < 4) || perches.some(p => p.kind === 'lamp' && (p.x - px) ** 2 + (p.z - pz) ** 2 < 28 * 28)) continue;
    footprints.push({ x: px, z: pz, r: 0.3 });
    placed.streetlamp.push(new THREE.Matrix4().compose(new THREE.Vector3(px, y, pz),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(kerb.dx, kerb.dz)), new THREE.Vector3(1, 1, 1)));
    perches.push({ x: px, y: y + 5.95, z: pz, kind: 'lamp' });
    lamps++;
  }
  // Trees and plaza lamps are perches too
  const TOP = { pine: 3.4, roundtree: 3.2, lamp: 4.6 };
  for (const type of Object.keys(TOP)) for (const m of placed[type]) {
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    perches.push({ x: p.x, y: p.y + TOP[type], z: p.z, kind: type === 'lamp' ? 'lamp' : 'tree' });
  }

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38 });
  // Add emissive boost for streetlight and lamp lens elements in props shader
  mat.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      // Warm streetlamp and plaza lamp night glow
      if (diffuseColor.r > 0.95 && diffuseColor.g > 0.88 && diffuseColor.b > 0.65) {
        totalEmissiveRadiance += diffuseColor.rgb * 1.8;
      }`
    );
  };
  let total = 0;
  for (const [type, list] of Object.entries(placed)) {
    if (!list.length) continue;
    const geo = mergeGeometries(MODELS[type]().map(g => (g.index ? g.toNonIndexed() : g)));
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    scene.add(inst);
    total += list.length;
  }
  console.log(`[Props] placed ${total} street props, ${perches.length} perch points`);
  return { footprints, perches };
}
