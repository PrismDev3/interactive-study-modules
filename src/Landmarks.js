/**
 * Landmarks.js — places to recognise around the start of the city, found on the real map at
 * load time (no hand-placed coordinates): the Daily Bugle sign on a tall roof, a movie theatre
 * marquee on a street front, a golden Spider-Man statue in an open plaza, and hidden gold
 * bricks on rooftops (each worth studs, remembered once collected).
 */
import * as THREE from 'three';
import { mergeStatic } from './StaticMerge.js?v=3';
import { progress } from './Progress.js?v=60';
import { LegoSpidey } from './LegoSpidey.js?v=183';
import { buildOscorp } from './Oscorp.js?v=15';
import { buildBugle } from './Bugle.js?v=5';

const plastic = (c, r = 0.4) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
const BUILDING = /^(toy_|stone|granite|limestone|light_red|seam|concrete)/;   // roof tops are mostly 'seam'

/** Seeded random so landmarks land in the same places every load. */
function rng(seed) { let a = seed >>> 0; return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296); }

function textPanel(text, w, h, { bg = null, fg = '#d01012', stroke = '#141414', inner = '#f4f4f4', font = 'Lilita One' } = {}) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = Math.round(1024 * h / w);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const paint = () => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); }
    let size = c.height * 0.72;
    g.font = `${size}px "${font}", "Arial Black", sans-serif`;
    while (g.measureText(text).width > c.width * 0.92 && size > 10) { size *= 0.92; g.font = `${size}px "${font}", "Arial Black", sans-serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = size * 0.16; g.strokeStyle = stroke; g.strokeText(text, c.width / 2, c.height * 0.54);
    if (inner) { g.lineWidth = size * 0.07; g.strokeStyle = inner; g.strokeText(text, c.width / 2, c.height * 0.54); }
    g.fillStyle = fg; g.fillText(text, c.width / 2, c.height * 0.54);
    tex.needsUpdate = true;
  };
  paint();
  document.fonts?.load(`80px "${font}"`).then(paint).catch(() => {});
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
    map: tex, transparent: !bg, alphaTest: bg ? 0 : 0.4, side: THREE.DoubleSide, roughness: 0.4 }));
}

export class Landmarks {
  constructor({ scene, cityMeshes, spawn, hud, perches = [] }) {
    Object.assign(this, { scene, meshes: cityMeshes, spawn, hud, perches });
    this.ray = Object.assign(new THREE.Raycaster(), { firstHitOnly: true });
    this.bricks = [];
    this.t = 0;
  }

  _drop(x, z) {
    this.ray.set(new THREE.Vector3(x, 1000, z), new THREE.Vector3(0, -1, 0));
    this.ray.far = Infinity;
    return this.ray.intersectObjects(this.meshes, false)[0];
  }

  /** A flat roof at least `size` m across, between minY and maxY, near (cx, cz). */
  _findRoof(cx, cz, rand, { minY = 28, maxY = 90, size = 10, maxR = 160 } = {}) {
    for (let i = 0; i < 300; i++) {
      const a = rand() * Math.PI * 2, r = 25 + rand() * maxR;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const h = this._drop(x, z);
      if (!h || h.point.y < minY || h.point.y > maxY || !BUILDING.test(h.object.material?.name ?? '')) continue;
      const y = h.point.y, s = size / 2;
      const flat = [[s, 0], [-s, 0], [0, s], [0, -s]].every(([dx, dz]) => {
        const q = this._drop(x + dx, z + dz);
        return q && Math.abs(q.point.y - y) < 0.3;
      });
      if (flat) return new THREE.Vector3(x, y, z);
    }
    return null;
  }

  async build() {
    const rand = rng(1962);
    const s = this.spawn;
    this._bugle(rand, s);
    this._theatre(s);
    await this._statue(rand, s);
    this._oscorp(rand, s);
    this._goldBricks(rand, s);
    this._banners();
    this._billboards(rand, s);
    await this._easterEggs(rand, s);
    // Story locations: street spots in front of each landmark
    const street = (pos, r = 60) => {
      if (!pos) return null;
      const kinds = ['asphalt', 'paint', 'sidewalk', 'path'];
      for (let k = 0; k < 96; k++) {
        const a = (k / 16) * Math.PI * 2, rr = 8 + (k >> 4) * (r / 6);
        const h = this._drop(pos.x + Math.cos(a) * rr, pos.z + Math.sin(a) * rr);
        if (!h || !kinds.includes(h.object.material?.name) || h.point.y >= 14) continue;
        // Open sky overhead (no arcades, overhangs or bridge decks) so scenes play outside
        // (both faces: from below you see the back of a roof, which normal rays skip)
        const up = new THREE.Ray(new THREE.Vector3(h.point.x, h.point.y + 1, h.point.z), new THREE.Vector3(0, 1, 0));
        if (this.meshes.some(m => m.geometry.boundsTree?.raycastFirst(up, THREE.DoubleSide, 0, 80))) continue;
        return h.point.clone();
      }
      return null;
    };
    const liberty = this._drop(-220, -405);
    this.places = {
      home: street(s, 30) ?? s.clone(),
      bugle: street(this.bugle), theatre: this.theatre ? street(this.theatre, 12) : null,
      oscorp: street(this.oscorp), liberty: liberty ? liberty.point.clone() : null,
    };
    // Oscorp is a real building: entrance, lobby, corridors and labs cut into the ground floor
    // of the tower's block, with the street-level expo stand removed entirely.
    if (this.places.oscorp && this.oscorp) {
      try {
        const facility = buildOscorp({ scene: this.scene, meshes: this.meshes, tower: this.oscorp, street: this.places.oscorp, ray: this.ray });
        if (facility) {
          this.oscorpFacility = facility;
          this.places.oscorp = facility.places.plaza;         // meeting point in the forecourt
          this.places.oscorpEntrance = facility.places.entrance;
          this.places.oscorpLobby = facility.places.lobby;
          this.places.oscorpLab = facility.places.lab;
          this.oscorpAnchors = facility.anchors;
        }
      } catch (e) { console.warn('[Landmarks] Oscorp facility failed', e); }
    }
    // The Daily Bugle is a real building too: facade, lobby, newsroom and Jameson's office cut
    // into the ground floor of the block under its rooftop sign.
    if (this.places.bugle && this.bugle) {
      try {
        const bugle = buildBugle({ scene: this.scene, meshes: this.meshes, tower: this.bugle, street: this.places.bugle });
        if (bugle) {
          this.bugleBuilding = bugle;
          this.bugleAnchors = bugle.anchors;
          this.places.bugle = bugle.places.buglePlaza;          // outdoor meeting point / fights
          Object.assign(this.places, bugle.places);
        }
      } catch (e) { console.warn('[Landmarks] Bugle building failed', e); }
    }
    // Home gets its own street: never on top of another story spot
    const P = this.places, clash = q => ['bugle', 'theatre', 'oscorp'].some(k => P[k] && P[k].distanceTo(q) < 30);
    if (P.home && clash(P.home)) {
      for (let k = 0; k < 12; k++) {
        const a = k / 12 * Math.PI * 2, c = s.clone().add(new THREE.Vector3(Math.cos(a) * 55, 0, Math.sin(a) * 55));
        const q = street(c, 20);
        if (q && !clash(q)) { P.home = q; break; }
      }
    }
    for (const [k, fn] of [['home', '_homeSet'], ['bugle', '_bugleSet'], ['theatre', '_theatreSet']]) {
      if (k === 'bugle' && this.bugleBuilding) continue;   // the building has its own frontage and street furniture
      try { if (this.places[k]) this._streetSet(this.places[k], (g, box) => this[fn](g, box)); } catch (e) { console.warn('[Landmarks] set', k, e); }
    }
    try { this._extraPlaces(s); } catch (e) { console.warn('[Landmarks] extra places', e); }
    console.log('[Landmarks] story places', Object.fromEntries(Object.entries(this.places).map(([k, v]) => [k, v ? `${v.x | 0},${v.z | 0}` : 'none'])));
  }

  /**
   * Builds a set against the nearest building wall around a story spot: local +z points at the wall,
   * the back edge (z = 5) sits just in front of it, the middle stays clear for the cast.
   */
  _streetSet(at, build) {
    const ray = new THREE.Ray(new THREE.Vector3(at.x, at.y + 1.2, at.z), new THREE.Vector3());
    let best = 40, dir = 0;
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2;
      ray.direction.set(Math.sin(a), 0, Math.cos(a));
      for (const m of this.meshes) {
        const h = m.geometry.boundsTree?.raycastFirst(ray, THREE.DoubleSide, 0, best);
        if (h && h.distance < best) { best = h.distance; dir = a; }
      }
    }
    const g = new THREE.Group(), solids = [];
    const box = (w, h, d, m, x, y, z, solid = false) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof m === 'number' ? plastic(m) : m);
      b.position.set(x, y, z); g.add(b);
      if (solid) solids.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
      return b;
    };
    build(g, box);
    const shift = Math.min(0, best - 5.3);
    g.position.set(at.x + Math.sin(dir) * shift, at.y, at.z + Math.cos(dir) * shift);
    g.rotation.y = dir;
    g.traverse(n => { if (n.isMesh && !n.material.transparent) { n.castShadow = true; n.receiveShadow = true; } });
    this.scene.add(g);
    mergeStatic(g, { byLook: true });   // a street set is 25–56 loose boxes that never move: one draw call per material
    if (solids.length) {
      g.updateMatrixWorld(true);
      const solid = new THREE.Mesh(mergeBoxes(solids.map(b => b.applyMatrix4(g.matrixWorld))), new THREE.MeshBasicMaterial());
      solid.visible = false; solid.geometry.computeBoundsTree?.();
      this.scene.add(solid); this.meshes.push(solid);
    }
    return g;
  }

  /** Aunt May's: a brownstone stoop with a green door, railings, planters, a mailbox and Peter's bike. */
  _homeSet(g, box) {
    const brown = 0x7a4a32, stone = 0xb8a890, green = 0x2f5a3a, iron = 0x1b1b1f;
    for (let i = 0; i < 4; i++) box(3.2, 0.25, 0.5, stone, 0, 0.125 + i * 0.25, 2.9 + i * 0.5, true);
    box(3.6, 1.0, 1.4, stone, 0, 0.5, 5.0, true);                              // landing
    box(3.8, 3.6, 0.3, brown, 0, 2.8, 5.75);                                   // brownstone front
    box(1.4, 2.4, 0.12, green, 0, 2.2, 5.58);                                  // door
    box(1.6, 0.15, 0.2, 0xe8e0d0, 0, 3.45, 5.55);                              // lintel
    box(0.1, 0.1, 0.1, 0xd4a017, 0.5, 2.1, 5.5);                               // knob
    box(0.22, 0.32, 0.22, new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffc860, emissiveIntensity: 0.8 }), 1.05, 3.0, 5.5);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) box(0.05, 0.9, 0.05, iron, s * 1.62, 0.7 + i * 0.25, 2.9 + i * 0.5);
      const rail = box(0.07, 0.07, 2.6, iron, s * 1.62, 1.35, 3.9); rail.rotation.x = -Math.atan2(1, 2);
      box(0.8, 0.55, 0.8, 0x8a4a2a, s * 2.6, 0.28, 4.6, true);                 // planter
      for (let k = 0; k < 5; k++) {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), plastic(k % 2 ? 0xd01012 : 0xf5c518));
        f.position.set(s * 2.6 + (k - 2) * 0.13, 0.66 + (k % 2) * 0.08, 4.6 + ((k * 7) % 3 - 1) * 0.12); g.add(f);
      }
    }
    box(0.45, 0.6, 0.3, 0x2a4fa8, 2.2, 1.6, 5.5);                              // mailbox
    const tag = textPanel('PARKER', 0.4, 0.12, { fg: '#ffffff', stroke: '#141414' });
    tag.position.set(2.2, 1.7, 5.34); tag.rotation.y = Math.PI; g.add(tag);
    // Peter's bike leaning by the steps
    const bike = new THREE.Group();
    for (const z of [-0.55, 0.55]) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.04, 6, 18), plastic(0x1b1b1f));
      w.rotation.y = Math.PI / 2; w.position.set(0, 0.35, z); bike.add(w);
    }
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.1), plastic(0xd01012)); frame.position.y = 0.6; bike.add(frame);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.04), plastic(0x8a9099)); bar.position.set(0, 0.85, 0.5); bike.add(bar);
    bike.position.set(-2.4, 0, 3.2); bike.rotation.set(0, 0.3, 0.18); g.add(bike);
  }

  /** Outside the Bugle: newsstands, bundled papers, a delivery van and a hot dog cart. */
  _bugleSet(g, box) {
    for (const s of [-1, 1]) {
      const x = s * 4.6;
      box(1.6, 1.3, 1.0, 0x1f4f8f, x, 0.65, 3.2, true);                        // newsstand
      box(1.8, 0.12, 1.2, 0xd01012, x, 1.36, 3.2);
      const sign = textPanel('DAILY BUGLE', 1.5, 0.35, { fg: '#141414', stroke: '#f4f4f4', inner: '#141414' });
      sign.position.set(x, 1.0, 2.68); sign.rotation.y = Math.PI; g.add(sign);
      for (let k = 0; k < 3; k++) box(0.5, 0.06, 0.38, 0xeeeae0, x - 0.5 + k * 0.5, 1.46 + (k % 2) * 0.03, 3.2);
    }
    for (let k = 0; k < 4; k++) box(0.6, 0.3, 0.45, 0xe8e2d2, -2.2 + (k % 2) * 0.66, 0.15 + Math.floor(k / 2) * 0.3, 4.4);   // paper bundles
    // Delivery van
    const vx = 7.5;
    box(2.0, 2.0, 4.2, 0xf4f4f4, vx, 1.3, 2.0, true);
    box(1.9, 1.1, 1.2, 0xf4f4f4, vx, 0.95, -0.5, true);
    box(1.6, 0.6, 0.06, new THREE.MeshStandardMaterial({ color: 0x9fd0ff, roughness: 0.1 }), vx, 1.2, -1.12);
    for (const z of [-0.4, 3.2]) for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 14), plastic(0x1b1b1f));
      w.rotation.z = Math.PI / 2; w.position.set(vx + s * 0.95, 0.38, z); g.add(w);
    }
    for (const s of [-1, 1]) {
      const side = textPanel('DAILY BUGLE', 3.6, 0.8, { fg: '#141414', stroke: '#f4f4f4', inner: '#d01012' });
      side.position.set(vx + s * 1.02, 1.6, 2.0); side.rotation.y = s * Math.PI / 2; g.add(side);
    }
    // Hot dog cart with an umbrella
    box(1.4, 0.9, 0.8, 0xc0c4ca, -6.5, 0.75, 1.5, true);
    box(0.05, 1.4, 0.05, 0x8a9099, -6.5, 1.9, 1.5);
    const um = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.5, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0xf5c518, side: THREE.DoubleSide }));
    um.position.set(-6.5, 2.7, 1.5); g.add(um);
  }

  /** Theatre night: red carpet, velvet ropes on brass posts, poster boards and spotlights. */
  _theatreSet(g, box) {
    box(3.2, 0.04, 9, 0xb0101a, 0, 0.02, 1);
    const brass = new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 0.7, roughness: 0.3 });
    const red = plastic(0x8a0a14);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const z = -2.5 + i * 2.2;
        box(0.12, 1.0, 0.12, brass, s * 2.0, 0.5, z);
        box(0.3, 0.06, 0.3, brass, s * 2.0, 0.03, z);
        if (i < 3) {
          const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), red);
          rope.rotation.x = Math.PI / 2; rope.position.set(s * 2.0, 0.85, z + 1.1); g.add(rope);
        }
      }
      // Poster board on an easel
      box(1.3, 1.9, 0.08, 0x1b1b1f, s * 4.4, 1.5, 3.6);
      const post = textPanel(s < 0 ? 'NOW SHOWING' : 'TONIGHT', 1.15, 0.35, { fg: '#f5c518', stroke: '#141414' });
      post.position.set(s * 4.4, 2.1, 3.55); post.rotation.y = Math.PI; g.add(post);
      box(1.1, 1.0, 0.02, s < 0 ? 0x2a4fa8 : 0xd01012, s * 4.4, 1.25, 3.55);
      const leg = box(0.06, 1.6, 0.06, 0x5a3a1a, s * 4.4, 0.8, 3.9, true); leg.rotation.x = 0.25;
      // Spotlight sweeping the sky
      box(0.6, 0.5, 0.6, 0x1b1b1f, s * 5.8, 0.25, 0.5, true);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.35, 0.7, 14), plastic(0x2a2a30));
      cyl.position.set(s * 5.8, 0.85, 0.5); cyl.rotation.x = -0.6; g.add(cyl);
      // Beam grows out of the lamp head: narrow at the lens, wide in the sky
      const beamGeo = new THREE.CylinderGeometry(2.0, 0.26, 22, 16, 1, true);
      beamGeo.translate(0, 11, 0);
      const beam = new THREE.Mesh(beamGeo,
        new THREE.MeshBasicMaterial({ color: 0xfff1c0, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide, fog: true }));
      beam.position.set(s * 5.8, 1.13, 0.31); beam.rotation.set(-0.6, 0, -s * 0.2); g.add(beam);
    }
  }

  /** First open-sky ground spot in rings around `c` (rMin..rMax) whose ground passes `test(hit)`. */
  _findSpot(c, rMin, rMax, test) {
    const up = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    for (let r = rMin; r <= rMax; r += 18) {
      for (let k = 0; k < 24; k++) {
        const a = k / 24 * Math.PI * 2 + r * 0.01;
        const h = this._drop(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r);
        if (!h || h.point.y >= 14 || !test(h)) continue;
        up.origin.set(h.point.x, h.point.y + 1, h.point.z);
        if (this.meshes.some(m => m.geometry.boundsTree?.raycastFirst(up, THREE.DoubleSide, 0, 60))) continue;
        return h.point.clone();
      }
    }
    return null;
  }

  /** Extra story locations: a park, the docks and a bank, each well apart from the others. */
  _extraPlaces(s) {
    const P = this.places;
    const apart = q => Object.values(P).every(v => !v || v.distanceTo(q) > 60);
    const mat = h => h.object.material?.name;
    const STREET = new Set(['asphalt', 'sidewalk', 'path', 'paint']);
    P.park = this._findSpot(s, 60, 600, h => mat(h) === 'grass' && apart(h.point));
    P.docks = this._findSpot(s, 80, 700, h => {
      if (!STREET.has(mat(h)) || !apart(h.point)) return false;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const w = this._drop(h.point.x + dx * 16, h.point.z + dz * 16);
        if (w && mat(w) === 'water') return true;
      }
      return false;
    });
    P.bank = this._findSpot(s, 120, 500, h => mat(h) === 'sidewalk' && apart(h.point));
    for (const [k, fn] of [['park', '_parkSet'], ['docks', '_docksSet'], ['bank', '_bankSet']]) {
      try { if (P[k]) this._streetSet(P[k], (g, box) => this[fn](g, box)); } catch (e) { console.warn('[Landmarks] set', k, e); }
    }
  }

  /** City park: a stone fountain, benches, round trees, a lamp and a hot dog stand. */
  _parkSet(g, box) {
    const stone = 0xb8b4aa;
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.6, 24), plastic(stone)); basin.position.set(0, 0.3, 6); g.add(basin);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.05, 24), new THREE.MeshStandardMaterial({ color: 0x3a8fd0, roughness: 0.1, metalness: 0.2 }));
    water.position.set(0, 0.56, 6); g.add(water);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.6, 12), plastic(stone)); col.position.set(0, 1.2, 6); g.add(col);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.5, 0.3, 16), plastic(stone)); bowl.position.set(0, 2.0, 6); g.add(bowl);
    box(4.6, 0.6, 4.6, new THREE.MeshBasicMaterial({ visible: false }), 0, 0.3, 6, true);
    for (const s of [-1, 1]) {
      // Bench
      box(2.0, 0.08, 0.6, 0x7a4a2a, s * 5, 0.5, 2, true);
      box(2.0, 0.5, 0.08, 0x7a4a2a, s * 5, 0.8, 2.3);
      for (const e of [-0.85, 0.85]) box(0.08, 0.5, 0.55, 0x1b1b1f, s * 5 + e, 0.25, 2);
      // Trees
      for (const z of [-2, 7]) {
        box(0.35, 2.2, 0.35, 0x5a3a1a, s * 7.5, 1.1, z, true);
        const crown = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 10), plastic(z < 0 ? 0x237841 : 0x4b9f4a)); crown.position.set(s * 7.5, 3.1, z); g.add(crown);
      }
      // Lamp
      box(0.12, 3.6, 0.12, 0x1b1b1f, s * 3, 1.8, -1);
      box(0.35, 0.35, 0.35, new THREE.MeshStandardMaterial({ color: 0xfff1c0, emissive: 0xffd060, emissiveIntensity: 0.7 }), s * 3, 3.7, -1);
    }
  }

  /** Waterfront docks: stacked shipping containers, crates, bollards and a crane arm. */
  _docksSet(g, box) {
    const ribbed = (w, h, d, color, x, y, z) => {
      box(w, h, d, color, x, y, z, true);
      for (let i = -w / 2 + 0.3; i < w / 2; i += 0.5) box(0.06, h * 0.9, d + 0.04, new THREE.Color(color).multiplyScalar(0.8).getHex(), x + i, y, z);
    };
    ribbed(6, 2.5, 2.4, 0xd01012, -6.5, 1.25, 4);
    ribbed(6, 2.5, 2.4, 0x1f4f8f, -6.5, 3.75, 4);
    ribbed(6, 2.5, 2.4, 0x237841, 6.5, 1.25, 4.2);
    for (const [x, z, s] of [[3, 1, 1], [3.9, 1.2, 0.8], [-3, 0.5, 1], [3.4, 1.1, 0.7]]) box(s, s, s, 0x9a6a3a, x, s / 2 + (x === 3.4 ? 1 : 0), z, true);
    for (let i = -2; i <= 2; i++) {
      box(0.35, 0.6, 0.35, 0x2a2a30, i * 3.5, 0.3, -3.5, true);
      box(0.5, 0.1, 0.5, 0x2a2a30, i * 3.5, 0.62, -3.5);
    }
    // Crane: tower and boom
    box(0.8, 12, 0.8, 0xf5c518, 9.5, 6, 7, true);
    const boom = box(14, 0.6, 0.6, 0xf5c518, 4, 12.2, 7); boom.rotation.y = 0.3;
    box(0.05, 6, 0.05, 0x1b1b1f, -1.5, 9, 5.4);
  }

  /** Bank: columned front with steps, a big BANK sign, an armoured truck and police barriers. */
  _bankSet(g, box) {
    const marble = 0xe8e4da;
    box(12, 0.3, 2.4, marble, 0, 0.15, 4.4, true);
    box(12, 0.3, 1.6, marble, 0, 0.45, 4.8, true);
    for (let i = 0; i < 6; i++) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 5, 14), plastic(marble)); col.position.set(-5 + i * 2, 3.1, 5.2); g.add(col);
    }
    box(12.4, 0.6, 1.6, marble, 0, 5.9, 5.2);
    box(12.8, 0.35, 1.9, marble, 0, 6.35, 5.2);                               // cornice
    const sign = textPanel('CITY BANK', 7, 1.1, { fg: '#d4a017', stroke: '#141414', inner: '#fff1c0' });
    sign.position.set(0, 5.9, 4.36); sign.rotation.y = Math.PI; g.add(sign);
    // Armoured truck
    box(2.2, 2.2, 4.6, 0x5a6a52, -7.5, 1.4, 0, true);
    box(2.1, 1.2, 1.4, 0x5a6a52, -7.5, 1.0, -2.9, true);
    box(1.8, 0.6, 0.06, new THREE.MeshStandardMaterial({ color: 0x9fd0ff, roughness: 0.1 }), -7.5, 1.3, -3.62);
    for (const z of [-2.6, 1.6]) for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.34, 14), plastic(0x1b1b1f)); w.rotation.z = Math.PI / 2; w.position.set(-7.5 + s * 1.05, 0.42, z); g.add(w);
    }
    // Police barriers
    for (const x of [3, 6]) {
      box(2.4, 0.3, 0.1, 0x1f4f8f, x, 0.9, -1.5);
      box(2.4, 0.12, 0.1, 0xf4f4f4, x, 0.75, -1.5);
      for (const e of [-1, 1]) box(0.1, 0.9, 0.5, 0x8a9099, x + e * 1.1, 0.45, -1.5, true);
    }
  }

  /** Oscorp: a tall dark-glass tower with green light bands and the OSCORP name, on a real block. */
  /**
   * Oscorp Tower, rebuilt: sized to the real roof it stands on (so it never cuts into neighbours),
   * three setback tiers of glass curtain wall with mullions and green light bands, OSCORP running
   * down the facade, a lit crown, a helipad and a spire. Its collision is the tower's own shape.
   */
  _oscorp(rand, s) {
    const roof = this._findRoof(s.x, s.z, rand, { minY: 14, maxY: 95, size: 11, maxR: 260 })
      ?? this._findRoof(s.x, s.z, rand, { minY: 8, maxY: 120, size: 8, maxR: 400 });
    if (!roof) return;
    // How far the flat roof really extends in each direction (stop at the edge or a step)
    const reach = (dx, dz) => {
      let d = 0;
      while (d < 30) {
        const h = this._drop(roof.x + dx * (d + 0.5), roof.z + dz * (d + 0.5));
        if (!h || Math.abs(h.point.y - roof.y) > 0.4) break;
        d += 0.5;
      }
      return d;
    };
    const ex = Math.min(reach(1, 0), reach(-1, 0)), ez = Math.min(reach(0, 1), reach(0, -1));
    const W = Math.max(7, Math.min(16, 2 * Math.min(ex, ez) - 1.2));       // stays inside the roof
    const g = new THREE.Group();
    // Glass curtain wall texture: blue-black panes, light mullions, a few lit offices
    const c = document.createElement('canvas'); c.width = 256; c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = '#0d1a28'; x.fillRect(0, 0, 256, 512);
    for (let r = 0; r < 16; r++) for (let k = 0; k < 8; k++) {
      const lit = Math.random() < 0.18;
      const grad = x.createLinearGradient(0, r * 32, 0, r * 32 + 30);
      grad.addColorStop(0, lit ? '#ffe9a8' : '#2a4a6a'); grad.addColorStop(1, lit ? '#e8c060' : '#14283c');
      x.fillStyle = grad; x.fillRect(k * 32 + 2, r * 32 + 2, 28, 28);
    }
    x.fillStyle = '#9fb0c0';
    for (let k = 0; k <= 8; k++) x.fillRect(k * 32 - 1, 0, 3, 512);
    for (let r = 0; r <= 16; r++) x.fillRect(0, r * 32 - 1, 256, 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const steel = plastic(0x5a5e63, 0.4), dark = plastic(0x1b1b1f, 0.5);
    const green = new THREE.MeshStandardMaterial({ color: 0x3aff7a, emissive: 0x1aaa4a, emissiveIntensity: 0.9 });
    const solids = [];
    const tier = (w, h, y) => {
      const t = tex.clone(); t.needsUpdate = true; t.repeat.set(w / 8, h / 16);
      const glass = new THREE.MeshStandardMaterial({ map: t, metalness: 0.45, roughness: 0.2 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), [glass, glass, steel, steel, glass, glass]);
      box.position.y = y + h / 2;
      g.add(box);
      solids.push(new THREE.BoxGeometry(w, h, w).translate(roof.x, roof.y + y + h / 2, roof.z));
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, w + 0.6), steel);   // setback ledge
      cap.position.y = y + h + 0.25;
      g.add(cap);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {                         // green corner light
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.28, h, 0.28), green);
        strip.position.set(sx * w / 2, y + h / 2, sz * w / 2);
        g.add(strip);
      }
    };
    const H1 = 34, H2 = 24, H3 = 16;
    tier(W, H1, 0);
    tier(W * 0.8, H2, H1 + 0.5);
    tier(W * 0.6, H3, H1 + H2 + 1);
    const top = H1 + H2 + H3 + 1.5;
    // Crown: glowing green band, helipad and spire
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.36, W * 0.42, 3, 8), green);
    crown.position.y = top + 1.5;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.34, W * 0.34, 0.35, 24), dark);
    pad.position.y = top + 3.2;
    const H = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.3), plastic(0xffffff));
    H.position.y = top + 3.4;
    const Hl = H.clone(); Hl.scale.set(0.2, 1, 6); Hl.position.x = -0.65;
    const Hr = Hl.clone(); Hr.position.x = 0.65;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.5, 12, 8), steel);
    spire.position.set(W * 0.22, top + 9.3, W * 0.22);
    g.add(crown, pad, H, Hl, Hr, spire);
    solids.push(new THREE.CylinderGeometry(W * 0.36, W * 0.42, 3.4, 8).translate(roof.x, roof.y + top + 1.7, roof.z));
    // OSCORP down the front face of the lower tier, and big signs on all four sides of the top tier
    const vertical = textPanel('OSCORP', H1 * 0.8, 3.4, { fg: '#3aff7a', stroke: '#06140c', inner: '#d8ffe4' });
    vertical.rotation.z = -Math.PI / 2;
    vertical.position.set(0, H1 / 2, W / 2 + 0.06);
    g.add(vertical);
    for (let k = 0; k < 4; k++) {
      const sign = textPanel('OSCORP', W * 0.55, 1.6, { fg: '#3aff7a', stroke: '#06140c', inner: '#d8ffe4' });
      const a = (k / 4) * Math.PI * 2, r = W * 0.3 + 0.08;
      sign.position.set(Math.sin(a) * r, H1 + H2 + H3 - 2, Math.cos(a) * r);
      sign.rotation.y = a;
      g.add(sign);
    }
    g.position.copy(roof);
    g.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    mergeStatic(g, { byLook: true });   // static landmark: one draw per material look
    this.scene.add(g);
    // Collision = the tower's real tiers and crown (not one big box)
    const solid = new THREE.Mesh(mergeBoxes(solids), new THREE.MeshBasicMaterial());
    solid.visible = false;
    solid.geometry.computeBoundsTree?.();
    this.scene.add(solid);
    this.meshes.push(solid);
    this.oscorp = roof;
    console.log(`[Landmarks] Oscorp at ${roof.x | 0}, ${roof.y | 0}, ${roof.z | 0} (${W.toFixed(1)} m wide)`);
  }

  _bugle(rand, s) {
    const roof = this._findRoof(s.x, s.z, rand, { minY: 30, size: 14, maxR: 120 });
    if (!roof) return;
    const g = new THREE.Group();
    const steel = plastic(0x3a3d42, 0.5);
    for (const x of [-5.4, -1.8, 1.8, 5.4]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6, 0.3), steel);
      post.position.set(x, 3, 0);
      g.add(post);
    }
    for (const y of [2.1, 5.9]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.22, 0.22), steel);
      bar.position.set(0, y, 0);
      g.add(bar);
    }
    const sign = textPanel('DAILY BUGLE', 11, 3.2);
    sign.position.set(0, 4, 0.2);
    g.add(sign);
    // Face the start of the city so it's the first thing you see
    g.position.copy(roof);
    g.rotation.y = Math.atan2(s.x - roof.x, s.z - roof.z);
    g.traverse(n => { if (n.isMesh) n.castShadow = true; });
    mergeStatic(g, { byLook: true });   // static landmark: one draw per material look
    this.scene.add(g);
    this.bugle = roof;
    console.log(`[Landmarks] Daily Bugle at ${roof.x | 0}, ${roof.y | 0}, ${roof.z | 0}`);
  }

  _theatre(s) {
    // Nearest street-facing wall from the start
    const o = new THREE.Vector3(), d = new THREE.Vector3();
    let best = null;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      this.ray.set(o.set(s.x, s.y + 3, s.z), d.set(Math.cos(a), 0, Math.sin(a)));
      this.ray.far = 45;
      const h = this.ray.intersectObjects(this.meshes, false)[0];
      if (h && h.distance > 10 && h.face && Math.abs(h.face.normal.y) < 0.3 && (!best || h.distance < best.distance)) best = h;
    }
    if (!best) return;
    const n = best.face.normal.clone().setY(0).normalize();
    if (n.dot(d.subVectors(o.set(s.x, s.y, s.z), best.point)) < 0) n.negate();
    const g = new THREE.Group();
    // Marquee box with bulbs, "NOW SHOWING" letters, and a tall CINEMA blade sign
    const red = plastic(0xb3101c, 0.35), gold = plastic(0xe0a92a, 0.3);
    const box = new THREE.Mesh(new THREE.BoxGeometry(9, 1.8, 1.6), red);
    box.position.set(0, 0, 0.8);
    g.add(box);
    const front = textPanel('NOW SHOWING: WEB OF BRICKS', 8.4, 1.2, { bg: '#f4f1e6', fg: '#141414', inner: null, stroke: '#f4f1e6' });
    front.position.set(0, 0, 1.62);
    g.add(front);
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff3b0, emissive: 0xffd36a, emissiveIntensity: 0.9 });
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.08, 8, 6), bulbMat, 46);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 23; i++) {
      bulbs.setMatrixAt(i, m.makeTranslation(-4.4 + i * 0.4, 0.86, 1.62));
      bulbs.setMatrixAt(23 + i, m.makeTranslation(-4.4 + i * 0.4, -0.86, 1.62));
    }
    g.add(bulbs);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 1.6), gold);
    blade.position.set(3.6, 4.4, 0.9);
    g.add(blade);
    for (const side of [-1, 1]) {
      const word = textPanel('CINEMA', 6.4, 1.3, { fg: '#b3101c' });
      word.rotation.z = Math.PI / 2;
      word.rotation.y = side * Math.PI / 2;
      word.position.set(3.6 + side * 0.26, 4.4, 0.9);
      g.add(word);
    }
    const base = this._drop(best.point.x + n.x * 2, best.point.z + n.z * 2);
    g.position.set(best.point.x, (base?.point.y ?? s.y) + 4.2, best.point.z);
    g.rotation.y = Math.atan2(n.x, n.z);
    mergeStatic(g, { byLook: true });   // static landmark: one draw per material look
    this.scene.add(g);
    this.theatre = g.position.clone();
  }

  async _statue(rand, s) {
    // An open paved spot (no walls close by) not far from the start
    const o = new THREE.Vector3(), d = new THREE.Vector3();
    let spot = null;
    for (let i = 0; i < 400 && !spot; i++) {
      const a = rand() * Math.PI * 2, r = 15 + rand() * 150;
      const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
      const h = this._drop(x, z);
      if (!h || !['sidewalk', 'path', 'concrete', 'grass'].includes(h.object.material?.name) || Math.abs(h.point.y - s.y) > 4) continue;
      let open = true;
      for (let k = 0; k < 8 && open; k++) {
        const aa = (k / 8) * Math.PI * 2;
        this.ray.set(o.set(x, h.point.y + 1, z), d.set(Math.cos(aa), 0, Math.sin(aa)));
        this.ray.far = 5;
        if (this.ray.intersectObjects(this.meshes, false).length) open = false;
      }
      if (open) spot = h.point.clone();
    }
    if (!spot) return;
    const g = new THREE.Group();
    const stone = plastic(0xa0a5a9, 0.55);
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 2.6), stone);
    base.position.y = 0.8;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.25, 2.9), plastic(0x6c6e68));
    cap.position.y = 1.72;
    const plaque = textPanel('THE AMAZING', 2.0, 0.45, { fg: '#e0a92a', inner: null });
    plaque.position.set(0, 0.95, 1.31);
    g.add(base, cap, plaque);
    const rig = await new LegoSpidey({ variant: 'golden' }).load();
    rig.root.position.y = 1.85 - 0.5;
    rig.root.scale.setScalar(1.6);
    rig.update(1, { speed: 0, grounded: true, emote: 'flex' });
    rig.update(1, { speed: 0, grounded: true, emote: 'flex' });
    g.add(rig.root);
    g.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    g.position.copy(spot);
    g.rotation.y = Math.atan2(s.x - spot.x, s.z - spot.z);
    mergeStatic(g, { byLook: true });   // static landmark: one draw per material look
    this.scene.add(g);
    this.statue = spot;
  }

  _goldBricks(rand, s) {
    let got = [];
    try { got = JSON.parse(localStorage.getItem('goldBricks') ?? '[]'); } catch {}
    this.total = 16;
    this.got = new Set(got);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffc23a, metalness: 0.85, roughness: 0.22, emissive: 0x5a3a00, emissiveIntensity: 0.4 });
    const body = new THREE.BoxGeometry(1.2, 0.48, 0.6);
    for (let i = 0; i < this.total; i++) {
      const roof = this._findRoof(s.x, s.z, rand, { minY: 12, maxY: 120, size: 4, maxR: 260 });
      if (!roof) continue;
      if (this.got.has(i)) continue;
      const g = new THREE.Group();
      g.add(new THREE.Mesh(body, mat));
      for (const x of [-0.45, -0.15, 0.15, 0.45]) for (const z of [-0.15, 0.15]) {
        const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 10), mat);
        stud.position.set(x, 0.29, z);
        g.add(stud);
      }
      g.position.set(roof.x, roof.y + 1.0, roof.z);
      this.scene.add(g);
      this.bricks.push({ id: i, g });
    }
  }

  /** Fabric banners hanging from the kerbside street lamps. */
  _banners() {
    const SETS = [['OSCORP', 'EXPO', '#1a3a2a', '#3aff7a'], ['DAILY', 'BUGLE', '#f1ead8', '#d01012'], ['MIDTOWN', 'HIGH', '#1f3fa8', '#ffcd03'],
      ['WEB OF', 'BRICKS', '#d01012', '#ffffff'], ['HERO OR', 'MENACE?', '#141414', '#ffcd03'], ['CONEY', 'ISLAND', '#e8469a', '#ffffff']];
    const lamps = this.perches.filter(p => p.kind === 'lamp');
    const mats = SETS.map(([a, b, bg, fg]) => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 320;
      const g = c.getContext('2d');
      const paint = () => {
        g.fillStyle = bg; g.fillRect(0, 0, 128, 320);
        g.fillStyle = fg; g.fillRect(0, 0, 128, 14); g.fillRect(0, 306, 128, 14);
        g.font = '44px "Lilita One", "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg;
        const fit = t => { let sz = 44; while (g.measureText(t).width > 116 && sz > 16) { sz -= 2; g.font = `${sz}px "Lilita One", "Arial Black", sans-serif`; } };
        fit(a); g.fillText(a, 64, 120); g.font = '44px "Lilita One", "Arial Black", sans-serif'; fit(b); g.fillText(b, 64, 200);
        tex.needsUpdate = true;
      };
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      paint();
      document.fonts?.load('44px "Lilita One"').then(paint).catch(() => {});
      return new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 });
    });
    const geo = new THREE.PlaneGeometry(0.85, 2.1);
    const rod = new THREE.BoxGeometry(0.06, 0.06, 1.0), rodMat = plastic(0x2b2d31);
    lamps.forEach((p, i) => {
      if (i % 2) return;
      const g = new THREE.Group();
      const banner = new THREE.Mesh(geo, mats[i % mats.length]);
      banner.position.set(0, -1.1, 0.55);
      banner.rotation.y = Math.PI / 2;
      const top = new THREE.Mesh(rod, rodMat); top.position.set(0, 0, 0.5);
      g.add(banner, top);
      g.position.set(p.x, p.y - 2.2, p.z);
      g.rotation.y = (i * 1.3) % (Math.PI * 2);
      this.scene.add(g);
    });
  }

  /** Big ad boards on legs on rooftops around the start. */
  _billboards(rand, s) {
    const ADS = [['THE DAILY BUGLE', 'SPIDER-MAN: THREAT OR MENACE?', '#f1ead8', '#141414'], ['OSCORP', 'Building a better tomorrow', '#1a2a3a', '#3aff7a'],
      ['MIDTOWN HIGH', 'Science fair this Friday', '#1f3fa8', '#ffcd03'], ['DELMAR’S DELI', 'Best sandwich in Queens', '#ffcd03', '#d01012'],
      ['STARK EXPO', 'The future is now', '#c4161c', '#ffffff'], ['WEB OF BRICKS', 'Swing by anytime', '#d01012', '#ffffff']];
    for (const [title, sub, bg, fg] of ADS) {
      const roof = this._findRoof(s.x, s.z, rand, { minY: 12, maxY: 90, size: 8, maxR: 320 });
      if (!roof) continue;
      const g = new THREE.Group();
      const c = document.createElement('canvas'); c.width = 1024; c.height = 400;
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const paint = () => {
        const x = c.getContext('2d');
        x.fillStyle = bg; x.fillRect(0, 0, 1024, 400);
        x.strokeStyle = fg; x.lineWidth = 16; x.strokeRect(14, 14, 996, 372);
        x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = '130px "Lilita One", "Arial Black", sans-serif';
        let sz = 130; while (x.measureText(title).width > 940) { sz -= 6; x.font = `${sz}px "Lilita One", "Arial Black", sans-serif`; }
        x.fillText(title, 512, 160);
        x.font = '600 52px "Fredoka", Arial, sans-serif'; x.fillText(sub, 512, 290);
        tex.needsUpdate = true;
      };
      paint();
      document.fonts?.load('130px "Lilita One"').then(paint).catch(() => {});
      const board = new THREE.Mesh(new THREE.BoxGeometry(9, 3.5, 0.25), [plastic(0x2b2d31), plastic(0x2b2d31), plastic(0x2b2d31), plastic(0x2b2d31),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })]);
      board.position.y = 4.4;
      g.add(board);
      for (const x of [-3.5, 3.5]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.8, 0.25), plastic(0x5a5e63));
        leg.position.set(x, 1.4, 0);
        g.add(leg);
      }
      g.position.copy(roof);
      g.rotation.y = Math.atan2(s.x - roof.x, s.z - roof.z);
      g.traverse(n => { if (n.isMesh) n.castShadow = true; });
      mergeStatic(g, { byLook: true });   // static landmark: one draw per material look
      this.scene.add(g);
    }
  }

  /** Hidden extras: Stan Lee waving on a rooftop, and Spider-Cat. Each pays out once. */
  async _easterEggs(rand, s) {
    let found = [];
    try { found = JSON.parse(localStorage.getItem('eggs') ?? '[]'); } catch {}
    this.eggsFound = new Set(found);
    this.eggs = [];
    if (!this.eggsFound.has('stan')) {
      const roof = this._findRoof(s.x, s.z, rand, { minY: 20, maxY: 90, size: 4, maxR: 300 });
      if (roof) {
        try {
          const rig = await new LegoSpidey({ skin: 'stanlee' }).load();
          const g = new THREE.Group(); g.add(rig.root); g.position.copy(roof).setY(roof.y + 0.5);
          this.scene.add(g);
          this.eggs.push({ id: 'stan', g, rig, studs: 5000, msg: 'EXCELSIOR! YOU FOUND STAN', emote: 'wave' });
        } catch {}
      }
    }
    if (!this.eggsFound.has('cat')) {
      const roof = this._findRoof(s.x, s.z, rand, { minY: 15, maxY: 90, size: 4, maxR: 300 });
      if (roof) {
        // Spider-Cat: an orange LEGO cat in a tiny red mask
        const g = new THREE.Group(), orange = plastic(0xf0882a), red = plastic(0xd01012), white = plastic(0xffffff);
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.55), orange); body.position.y = 0.2;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.26), red); head.position.set(0, 0.42, 0.3);
        for (const x of [-0.08, 0.08]) { const eye = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.02), white); eye.position.set(x, 0.45, 0.44); g.add(eye); }
        for (const x of [-0.1, 0.1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), red); ear.position.set(x, 0.6, 0.3); g.add(ear); }
        const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.5, 6), orange); tail.position.set(0, 0.42, -0.35); tail.rotation.x = -0.6;
        g.add(body, head, tail);
        g.position.copy(roof);
        this.scene.add(g);
        this.eggs.push({ id: 'cat', g, studs: 2500, msg: 'YOU FOUND SPIDER-CAT!' });
      }
    }
  }

  update(dt, playerPos) {
    this.oscorpFacility?.update?.(dt);
    for (const e of this.eggs ?? []) {
      if (!e.g.parent) continue;
      e.rig?.update(dt, { speed: 0, grounded: true, emote: e.emote });
      if (e.id === 'cat') e.g.rotation.y += dt * 0.6;
      if (e.g.position.distanceTo(playerPos) < 2.6) {
        this.scene.remove(e.g);
        this.eggsFound.add(e.id);
        try { localStorage.setItem('eggs', JSON.stringify([...this.eggsFound])); } catch {}
        this.hud?.burstStuds?.(e.g.position.clone(), e.studs, playerPos.y - 0.5);
        this.hud?.toast?.(e.msg);
      }
    }
    this.t += dt;
    for (const b of this.bricks) {
      if (!b.g.parent) continue;
      b.g.rotation.y += dt * 1.8;
      b.g.position.y += Math.sin(this.t * 2 + b.id) * 0.004;
      if (b.g.position.distanceTo(playerPos) < 1.8) {
        this.scene.remove(b.g);
        this.got.add(b.id);
        try { localStorage.setItem('goldBricks', JSON.stringify([...this.got])); } catch {}
        progress.push();
        this.hud?.burstStuds?.(b.g.position.clone(), 2500, playerPos.y - 0.5);
        this.hud?.toast?.(`GOLD BRICK ${this.got.size}/${this.total}`);
      }
    }
  }
}


/** Merge non-indexed copies of simple geometries into one (position + normal). */
function mergeBoxes(list) {
  const geos = list.map(g => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return out;
}
