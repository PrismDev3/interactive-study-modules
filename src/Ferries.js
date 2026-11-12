/**
 * Harbour ferries. The map shipped five flat white/yellow boxes in the water (the OBJ "Boats" group,
 * dropped in SceneSetup). Each one is replaced by a modelled LEGO-style ferry that runs a loop
 * through open water: out along the channel, a banked U-turn, and back, with bobbing, a bow wave
 * and a foam wake. The run length is measured against the real sea so no ferry sails onto land.
 */
import * as THREE from 'three';
import { mergeStatic } from './StaticMerge.js?v=3';
import { speedboatGeometry, waveHeight, WATER_TIME } from './Vehicles.js?v=12';

// Centres of the map's boat boxes (x, z); all were 12 m wide and 32 m long along z.
const SPOTS = [[-220, 1500], [1140, 900], [1130, 2600], [-120, -250], [-200, 300]];
const WATER_Y = -0.35;          // sea surface after SceneSetup sinks it
const SPEED = 7;                // m/s cruising
const TURN_R = 11;              // U-turn radius

const plastic = (color, r = 0.35, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: r, metalness: 0, ...extra });
const M = {
  hull: plastic(0x1f3f7a), boot: plastic(0xc8102e), white: plastic(0xf4f4f0), deck: plastic(0x9a7b55, 0.6),
  trim: plastic(0xf5c518), glass: new THREE.MeshStandardMaterial({ color: 0x1d3a52, roughness: 0.08, metalness: 0.35 }),
  dark: plastic(0x1b1b1f), grey: plastic(0x8a9099), orange: plastic(0xff6a13),
  foam: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }),
};

/** Top-view outline of a ship: pointed bow at +z, squared-off rounded stern at -z. */
function hullShape(len, beam) {
  const h = len / 2, b = beam / 2, s = new THREE.Shape();
  s.moveTo(-b * 0.85, -h);
  s.quadraticCurveTo(-b, -h, -b, -h + 1.2);
  s.lineTo(-b, h * 0.25);
  s.bezierCurveTo(-b, h * 0.7, -b * 0.35, h * 0.95, 0, h);
  s.bezierCurveTo(b * 0.35, h * 0.95, b, h * 0.7, b, h * 0.25);
  s.lineTo(b, -h + 1.2);
  s.quadraticCurveTo(b, -h, b * 0.85, -h);
  s.closePath();
  return s;
}

/** A vertical slab of that outline (extruded upward from y0 to y0+hgt). */
function hullSlab(len, beam, y0, hgt, mat, bevel = 0) {
  const g = new THREE.ExtrudeGeometry(hullShape(len, beam), { depth: hgt, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 18 });
  g.rotateX(-Math.PI / 2);         // shape XY → XZ (shape +y becomes -z), extrusion goes up
  g.rotateY(Math.PI);              // put the bow back on +z (hull is symmetric in x)
  g.translate(0, y0, 0);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

const boxM = (w, h, d, mat, x, y, z, parent) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
};
const cyl = (rt, rb, h, mat, x, y, z, parent, seg = 16) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
};

/** Build one ferry, origin at the waterline, bow along +z. ~30 m long, 11 m beam. */
function buildFerry(livery) {
  const g = new THREE.Group(), L = 30, B = 11;
  // Hull: tapered below the waterline, navy topsides, red boot stripe, white bulwark, timber deck
  g.add(hullSlab(L * 0.86, B * 0.7, -2.2, 1.0, M.hull));
  g.add(hullSlab(L * 0.95, B * 0.9, -1.4, 1.0, M.boot));
  g.add(hullSlab(L, B, -0.5, 2.3, livery.hull));
  g.add(hullSlab(L * 1.004, B * 1.01, 1.55, 0.25, M.white));         // white sheer line
  g.add(hullSlab(L * 0.97, B * 0.95, 1.8, 0.08, M.deck));
  // Rails round the main deck
  const railPts = hullShape(L * 0.96, B * 0.94).getSpacedPoints(64).slice(0, -1);
  const postGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6);
  for (let i = 0; i < railPts.length - 1; i += 2) {
    const p = railPts[i], post = new THREE.Mesh(postGeo, M.white);
    post.position.set(p.x, 2.38, p.y); g.add(post);
  }
  const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts.map(p => new THREE.Vector3(p.x, 2.88, p.y)), true), 96, 0.07, 6, true), M.white);
  g.add(rail);

  // Main cabin with a wraparound window band
  const cab = new THREE.Group(); g.add(cab);
  boxM(8.4, 2.6, 16, M.white, 0, 3.15, -2, cab);
  boxM(8.5, 0.9, 15.6, M.glass, 0, 3.55, -2, cab);
  for (let z = -9.2; z <= 5.2; z += 1.6) for (const s of [-1, 1]) boxM(0.08, 0.95, 0.12, M.white, s * 4.27, 3.55, z, cab);   // mullions
  boxM(8.4, 0.3, 16, livery.stripe, 0, 2.55, -2, cab);
  boxM(9.2, 0.18, 17, M.white, 0, 4.55, -2, cab);                       // overhanging roof / upper deck
  // Upper deck: smaller cabin, bridge forward with angled windows
  boxM(6.4, 2.0, 8, M.white, 0, 5.6, -4, cab);
  boxM(6.5, 0.7, 7.6, M.glass, 0, 5.9, -4, cab);
  const bridge = new THREE.Group(); bridge.position.set(0, 5.6, 1.6); cab.add(bridge);
  boxM(7.2, 2.0, 3.2, M.white, 0, 0, 0, bridge);
  const fw = boxM(6.9, 0.8, 0.12, M.glass, 0, 0.35, 1.65, bridge); fw.rotation.x = -0.25;
  for (const s of [-1, 1]) boxM(0.12, 0.75, 2.6, M.glass, s * 3.62, 0.35, 0, bridge);
  boxM(9.4, 0.15, 1.2, M.white, 0, 1.05, 0.4, bridge);                  // bridge wings
  boxM(7.6, 0.25, 3.6, livery.stripe, 0, 1.15, 0, bridge);
  // Upper deck railing
  for (const s of [-1, 1]) {
    boxM(0.08, 0.08, 15.5, M.white, s * 4.5, 5.45, -2, cab);
    for (let z = -9.5; z <= 5.5; z += 1.25) boxM(0.06, 0.8, 0.06, M.white, s * 4.5, 5.05, z, cab);
  }
  // Funnel: yellow with a black cap and a stripe, raked back
  const fun = new THREE.Group(); fun.position.set(0, 6.5, -6.8); fun.rotation.x = -0.12; cab.add(fun);
  const fbody = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.3, 3.0, 20), M.trim); fbody.scale.z = 1.35; fbody.position.y = 1.5; fbody.castShadow = true; fun.add(fbody);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.06, 0.5, 20), M.dark); cap.scale.z = 1.35; cap.position.y = 3.2; fun.add(cap);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.18, 0.45, 20), livery.stripe); band.scale.z = 1.35; band.position.y = 2.1; fun.add(band);
  // Mast, radar, horn, nav lights
  cyl(0.09, 0.12, 4.2, M.white, 0, 8.6, 1.4, cab, 8);
  boxM(1.8, 0.12, 0.25, M.white, 0, 9.6, 1.4, cab);
  const radar = boxM(2.0, 0.15, 0.3, M.dark, 0, 10.0, 1.4, cab);
  cyl(0.15, 0.15, 0.25, M.trim, 0, 10.8, 1.4, cab, 10);
  const lamp = (c, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.2 })); m.position.set(x, y, z); cab.add(m); };
  lamp(0xff2020, -4.75, 6.75, 1.6); lamp(0x20ff40, 4.75, 6.75, 1.6); lamp(0xffffff, 0, 10.95, 1.4);
  // Lifeboats on davits and life rings
  for (const s of [-1, 1]) {
    const lb = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 3.2, 4, 12), M.orange);
    lb.rotation.x = Math.PI / 2; lb.scale.x = 1.15; lb.position.set(s * 3.9, 6.2, -9.0); lb.castShadow = true; cab.add(lb);
    boxM(0.12, 1.6, 0.12, M.white, s * 4.1, 5.8, -10.4, cab); boxM(0.12, 1.6, 0.12, M.white, s * 4.1, 5.8, -7.6, cab);
    for (const z of [-7, 2]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.13, 8, 16), M.orange);
      ring.position.set(s * 4.26, 3.3, z); ring.rotation.y = Math.PI / 2; cab.add(ring);
    }
  }
  // Foredeck: bollards, anchor winch, a few crates; aft: flagpole
  for (const s of [-1, 1]) for (const z of [9, -12.5]) cyl(0.28, 0.32, 0.6, M.dark, s * 3.2, 2.15, z, g, 10);
  cyl(0.55, 0.55, 1.6, M.grey, 0, 2.5, 10.2, g, 12).rotation.z = Math.PI / 2;
  boxM(1.2, 1.0, 1.2, plastic(0x9a6a3a, 0.6), -2.2, 2.35, 7.6, g);
  boxM(1.0, 0.8, 1.0, plastic(0x9a6a3a, 0.6), 2.3, 2.25, 7.9, g);
  cyl(0.05, 0.05, 3.2, M.white, 0, 3.4, -14.2, g, 6);
  const flag = boxM(1.4, 0.9, 0.04, livery.stripe, 0.75, 4.5, -14.2, g); flag.rotation.y = Math.PI / 2; flag.name = 'flag';
  // LEGO studs on the top deck roof
  const stud = new THREE.CylinderGeometry(0.22, 0.22, 0.18, 12);
  const studs = new THREE.InstancedMesh(stud, M.white, 4 * 10), mx = new THREE.Matrix4();
  let n = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 10; j++) studs.setMatrixAt(n++, mx.makeTranslation(-2.1 + i * 1.4, 6.7, -7.6 + j * 0.8));
  cab.add(studs);
  // Name board on the bow
  g.userData.radar = radar;
  g.userData.flag = flag;
  // 131 separate parts per ferry was 131 draw calls (plus shadows) for a boat that is usually
  // 500 m away. Everything but the spinning radar and the flag becomes one mesh per material.
  mergeStatic(g, { keep: o => o === radar || o === flag });
  return g;
}

/** Foam: bow wave wedge and a long wake trail that fades out behind the stern. */
function buildFoam() {
  const g = new THREE.Group();
  const wakeGeo = new THREE.PlaneGeometry(1, 1, 1, 8); wakeGeo.rotateX(-Math.PI / 2); wakeGeo.translate(0, 0, -0.5);
  // Taper and fade with vertex colours: wide/bright at the stern, gone at the tail
  const p = wakeGeo.attributes.position, col = [];
  for (let i = 0; i < p.count; i++) { const t = -p.getZ(i); p.setX(i, p.getX(i) * (1 + t * 1.6)); col.push(1, 1, 1, (1 - t) ** 1.5); }
  wakeGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  const wakeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false, vertexColors: true });
  const wake = new THREE.Mesh(wakeGeo, wakeMat);
  wake.scale.set(7, 1, 34); wake.position.set(0, WATER_Y + 0.06, -14.5);
  g.add(wake);
  for (const s of [-1, 1]) {
    const bw = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 9), M.foam);
    bw.rotation.x = -Math.PI / 2; bw.rotation.z = s * 0.45; bw.position.set(s * 4.2, WATER_Y + 0.07, 10.5);
    g.add(bw);
  }
  g.userData.wake = wake;
  return g;
}

const floatState = () => ({ heave: 0, vh: 0, pitch: 0, vp: 0, rollW: 0, vr: 0 });
/**
 * Buoyancy: sample the sea at bow, stern, port and starboard (half-length `hl`, half-beam `hb`),
 * and spring-damp heave, pitch and roll toward that surface. Fast boats plane bow-up.
 */
function float(st, holder, hull, dt, hl, hb, speed) {
  const ry = holder.rotation.y, fx = Math.sin(ry), fz = Math.cos(ry), x = holder.position.x, z = holder.position.z;
  const bow = waveHeight(x + fx * hl, z + fz * hl), stern = waveHeight(x - fx * hl, z - fz * hl);
  const port = waveHeight(x + fz * hb, z - fx * hb), stbd = waveHeight(x - fz * hb, z + fx * hb);
  const tH = (bow + stern + port + stbd) / 4, tP = -Math.atan2(bow - stern, 2 * hl) - speed * 0.006, tR = Math.atan2(port - stbd, 2 * hb);
  const k = 18 / Math.max(1, hl / 4), d = 2 * Math.sqrt(k) * 0.55;   // lighter boats react faster
  st.vh += ((tH - st.heave) * k - st.vh * d) * dt; st.heave += st.vh * dt;
  st.vp += ((tP - st.pitch) * k - st.vp * d) * dt; st.pitch += st.vp * dt;
  st.vr += ((tR - st.rollW) * k - st.vr * d) * dt; st.rollW += st.vr * dt;
  hull.position.y = st.heave + speed * 0.012;
  hull.rotation.x = st.pitch; hull.rotation.z = st.rollW;
}

const LIVERIES = [
  { hull: plastic(0xf4f4f0), stripe: plastic(0xf5c518) },   // white and yellow, like the boxes it replaces
  { hull: plastic(0xff7a1a), stripe: plastic(0x1f3f7a) },   // harbour orange
  { hull: plastic(0xf4f4f0), stripe: plastic(0x1f6fd0) },
  { hull: plastic(0x237841), stripe: plastic(0xf4f4f0) },
  { hull: plastic(0xf4f4f0), stripe: plastic(0xc8102e) },
];

export class Ferries {
  /** @param {{scene: THREE.Scene, cityMeshes: THREE.Object3D[]}} o */
  constructor({ scene, cityMeshes }) {
    this.scene = scene;
    this.meshes = cityMeshes.filter(m => m.isMesh);
    this.ray = new THREE.Raycaster(); this.ray.firstHitOnly = true;
    this.boats = [];
    this.solids = [];
    SPOTS.forEach(([x, z], i) => {
      try { this._spawn(x, z, i); } catch (e) { console.warn('[Ferries]', e); }
    });
    this.speedboats = [];
    this._spawnSpeedboats().catch(e => console.warn('[Ferries] speedboats', e));
  }

  /** Imported speedboats circling open water near each harbour spot. */
  async _spawnSpeedboats() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3 });
    const HULLS = [0xc91a09, 0x0a57c2, 0xf6c21a, 0x237841, 0xf4f4f4, 0xff8a00];
    let n = 0;
    for (const [sx, sz] of SPOTS) for (const [ox, oz] of [[70, 40], [-60, -70]]) {
      const cx = sx + ox, cz = sz + oz;
      const R = [45, 32, 22].find(r => [...Array(10)].every((_, k) => this._isWater(cx + Math.cos(k * 0.628) * (r + 6), cz + Math.sin(k * 0.628) * (r + 6))));
      if (!R) continue;
      const mesh = new THREE.Mesh(await speedboatGeometry(HULLS[n++ % HULLS.length]), mat);
      mesh.castShadow = true;
      const holder = new THREE.Group(); holder.add(mesh); this.scene.add(holder);
      const wake = buildFoam(); wake.scale.setScalar(0.3); holder.add(wake);
      this.speedboats.push({ holder, mesh, cx, cz, R, a: Math.random() * 6.28, dir: Math.random() < 0.5 ? 1 : -1,
        speed: 11 + Math.random() * 5, ...floatState() });
    }
  }

  _isWater(x, z) {
    this.ray.set(new THREE.Vector3(x, 80, z), new THREE.Vector3(0, -1, 0));
    this.ray.far = 120;
    const h = this.ray.intersectObjects(this.meshes, false)[0];
    return !h || h.object.material?.name === 'water';
  }

  /** How far the channel stays open water (with room for the hull and turn) from c along dir. */
  _clear(cx, cz, dx, dz, max) {
    const px = -dz, pz = dx, W = TURN_R * 2 + 8;
    for (let d = 0; d <= max; d += 6) {
      for (const o of [-W / 2, 0, W / 2]) if (!this._isWater(cx + dx * d + px * o, cz + dz * d + pz * o)) return d;
    }
    return max;
  }

  _spawn(cx, cz, i) {
    // Pick the axis (along z like the map's boxes, or along x) with the longest open run
    let best = null;
    for (const [dx, dz] of [[0, 1], [1, 0], [0.7071, 0.7071], [0.7071, -0.7071]]) {
      const a = this._clear(cx, cz, dx, dz, 260), b = this._clear(cx, cz, -dx, -dz, 260);
      const run = a + b;
      if (!best || run > best.run) best = { dx, dz, a, b, run };
    }
    // Leg length between the two U-turn centres (the turn adds TURN_R + half the hull at each end)
    const margin = TURN_R + 18;
    const legA = Math.max(0, best.a - margin), legB = Math.max(0, best.b - margin);
    const len = legA + legB;
    const mid = len > 4 ? (legA - legB) / 2 : 0;
    const boat = buildFerry(LIVERIES[i % LIVERIES.length]);
    const foam = buildFoam();
    const holder = new THREE.Group(); holder.add(boat, foam);
    this.scene.add(holder);
    // Solid hull: the controller stands on / bumps into these, and rides along via userData.delta
    const delta = new THREE.Vector3();
    boat.traverse(m => { if (m.isMesh) { m.userData.delta = delta; this.solids.push(m); } });
    this.boats.push({
      delta, holder, boat, foam, len: Math.max(len, 0),
      cx: cx + best.dx * mid, cz: cz + best.dz * mid, dx: best.dx, dz: best.dz,
      s: Math.random() * (2 * Math.max(len, 0) + 2 * Math.PI * TURN_R), t: Math.random() * 10, roll: 0,
    });
  }

  /** Point on the stadium loop at arc length s: position (x, z), heading, and turn curvature sign. */
  _at(b, s) {
    const L = b.len, C = Math.PI * TURN_R, P = 2 * L + 2 * C;
    s = ((s % P) + P) % P;
    let u, v, hu, hv, turn = 0;   // u along the channel, v across it
    if (s < L) { u = -L / 2 + s; v = -TURN_R; hu = 1; hv = 0; }
    else if (s < L + C) { const a = (s - L) / TURN_R - Math.PI / 2; u = L / 2 + Math.cos(a) * TURN_R; v = Math.sin(a) * TURN_R; hu = -Math.sin(a); hv = Math.cos(a); turn = 1; }
    else if (s < 2 * L + C) { u = L / 2 - (s - L - C); v = TURN_R; hu = -1; hv = 0; }
    else { const a = (s - 2 * L - C) / TURN_R + Math.PI / 2; u = -L / 2 + Math.cos(a) * TURN_R; v = Math.sin(a) * TURN_R; hu = -Math.sin(a); hv = Math.cos(a); turn = 1; }
    const px = -b.dz, pz = b.dx;
    return {
      x: b.cx + b.dx * u + px * v, z: b.cz + b.dz * u + pz * v,
      hx: b.dx * hu + px * hv, hz: b.dz * hu + pz * hv, turn,
    };
  }

  update(dt) {
    dt = Math.min(dt, 0.1);
    WATER_TIME.value += dt;
    for (const s of this.speedboats ?? []) {
      s.a += s.dir * s.speed / s.R * dt;
      const x = s.cx + Math.cos(s.a) * s.R, z = s.cz + Math.sin(s.a) * s.R;
      s.holder.position.set(x, WATER_Y, z);
      s.holder.rotation.y = Math.atan2(-Math.sin(s.a) * s.dir, Math.cos(s.a) * s.dir);
      float(s, s.holder, s.mesh, dt, 3.6, 1.2, s.speed);
      s.mesh.rotation.z += -s.dir * 0.12;   // bank into the circle
    }
    for (const b of this.boats) {
      b.t += dt;
      const p0 = this._at(b, b.s);
      // Ease off through the turns
      b.s += dt * SPEED * (p0.turn ? 0.65 : 1);
      const p = this._at(b, b.s);
      b.delta.set(p.x - b.holder.position.x, 0, p.z - b.holder.position.z);
      if (b.delta.lengthSq() > 25) b.delta.set(0, 0, 0);   // first frame: no jump
      b.holder.position.set(p.x, WATER_Y, p.z);
      b.holder.rotation.y = Math.atan2(p.hx, p.hz);
      // Bob, pitch and lean into the turn (the loop always turns to port)
      b.roll += ((p.turn ? -0.06 : 0) - b.roll) * Math.min(1, dt * 1.5);
      b.f ??= floatState();
      float(b.f, b.holder, b.boat, dt, 14, 5, 0);   // heavy hull: rides the swell slowly
      b.boat.rotation.z += b.roll;
      const r = b.boat.userData.radar; if (r) r.rotation.y += dt * 2.5;
      const f = b.boat.userData.flag; if (f) f.rotation.x = Math.sin(b.t * 6) * 0.15;
      const w = b.foam.userData.wake; if (w) w.material.opacity = 0.36 + Math.sin(b.t * 2.3) * 0.05;
    }
  }
}
