/**
 * CityLife.js — LEGO pedestrians and LEGO cars that keep the streets around the player busy.
 * Everything is recycled: anything that drifts too far from the player respawns near them.
 */
import * as THREE from 'three';
import { GFX } from './Perf.js?v=20';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { carGeometry } from './Vehicles.js?v=8';
import { LegoSpidey } from './LegoSpidey.js?v=183';

const NPC_COUNT = GFX.npcs;
const CAR_COUNT = GFX.cars;
const KEEP_RADIUS = 150;     // recycle beyond this distance from the player
const WALK = new Set(['sidewalk', 'path', 'concrete', 'grass']);
const ROAD = new Set(['asphalt', 'paint']);
const SHIRTS = [0xc91a09, 0x0a57c2, 0x237841, 0xf6c21a, 0xf4f4f4, 0x1b1b1f, 0xa85a2a, 0x7a3e9d, 0xe76f9f, 0x00a3a3];
const PANTS = [0x1b1b1f, 0x0a3a7a, 0x6b3a1f, 0x5a5e63, 0x958467, 0x1f4f2f];
const CIVILIANS = ['citycivilian_f01', 'citycivilian_f02', 'citycivilian_f03', 'citycivilian_f04', 'citycivilian_f05', 'citycivilian_f06', 'citycivilian_f07', 'citycivilian_f08', 'citycivilian_m01', 'citycivilian_m02', 'citycivilian_m03', 'citycivilian_m04', 'citycivilian_m05', 'citycivilian_m06', 'citycivilian_m07', 'citycivilian_m08', 'citycivilianold_f01', 'parkcivilian1', 'parkcivilian2', 'parkcivilian3', 'policeofficer1', 'policeofficer2', 'policeofficer3', 'newsreporter', 'photographer'];
const HEADINGS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const pick = a => a[Math.floor(Math.random() * a.length)];

function coloredBox(w, h, d, x, y, z, color) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(x, y, z);
  return paint(g, color);
}
function paint(g, color) {
  if (g.index) g = g.toNonIndexed();
  const c = new THREE.Color(color), n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}

/** Street fleet: [kind, body colour]. Taxis are doubled up because this is New York. */
export const CAR_FLEET = [
  ['taxi', 0xf6c21a], ['taxi', 0xf6c21a], ['sedan', 0xc91a09], ['sedan', 0x0a57c2], ['sedan', 0x1b1b1f],
  ['sedan', 0x237841], ['van', 0xf4f4f4], ['van', 0x0a57c2], ['pickup', 0xff8a00], ['pickup', 0x237841],
  ['sports', 0xc91a09], ['sports', 0xe76f9f], ['police', 0xf4f4f4],
];

/**
 * One-draw-call brick-built vehicle, facing +z. Every kind keeps the same 1.95 x 4.3 footprint
 * and wheel positions so traffic spacing and collision stay unchanged.
 * Kinds: sedan, taxi, police, van, pickup, sports.
 */
export function legoCarGeometry(color, kind = 'sedan') {
  const DARK = 0x2b2d31, GLASS = 0x9fd6ff, TYRE = 0x1b1b1f, HUB = 0xc9ced4, HEAD = 0xfff3b0, TAIL = 0xd01010, WHITE = 0xf4f4f4;
  const parts = [];
  const box = (w, h, d, x, y, z, c) => parts.push(coloredBox(w, h, d, x, y, z, c));
  const stud = (x, y, z, c) => {
    const g = new THREE.CylinderGeometry(0.2, 0.2, 0.14, 10);
    g.translate(x, y, z);
    parts.push(paint(g, c));
  };
  const low = kind === 'sports';
  const deckY = low ? 0.76 : 0.895;            // top of the lower body
  const lightY = low ? 0.6 : 0.72;

  // Shared underbody: chassis plate, bumpers, grille, lights, wheels with hub caps
  box(1.95, 0.18, 4.3, 0, 0.32, 0, DARK);
  box(2.0, 0.2, 0.14, 0, 0.47, 2.13, HUB);
  box(2.0, 0.2, 0.14, 0, 0.47, -2.13, HUB);
  box(0.9, 0.18, 0.06, 0, lightY, 2.11, DARK);
  for (const x of [-0.68, 0.68]) {
    box(0.4, 0.18, 0.08, x, lightY, 2.11, HEAD);
    box(0.4, 0.16, 0.08, x, lightY, -2.11, TAIL);
  }
  for (const [x, z] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.CylinderGeometry(0.4, 0.4, 0.32, 14);
    w.rotateZ(Math.PI / 2); w.translate(x, 0.4, z);
    parts.push(paint(w, TYRE));
    const h = new THREE.CylinderGeometry(0.2, 0.2, 0.35, 10);
    h.rotateZ(Math.PI / 2); h.translate(x, 0.4, z);
    parts.push(paint(h, HUB));
  }
  // Glass cabin with body-coloured corner pillars and a roof plate
  const cabin = (w, h, d, z, y0 = deckY) => {
    box(w, h, d, 0, y0 + h / 2, z, GLASS);
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      box(0.14, h, 0.14, sx * (w / 2 - 0.05), y0 + h / 2, z + sz * (d / 2 - 0.05), color);
    box(w + 0.06, 0.16, d + 0.1, 0, y0 + h + 0.08, z, color);
    return y0 + h + 0.16;                        // roof top
  };

  if (kind === 'van') {
    box(1.9, 0.6, 4.2, 0, 0.64, 0, color);
    box(1.9, 1.1, 3.0, 0, 1.49, -0.6, color);                    // cargo box
    box(1.74, 0.92, 0.8, 0, 1.4, 1.3, GLASS);                    // cab
    for (const x of [-0.86, 0.86]) box(0.14, 0.92, 0.14, x, 1.4, 1.66, color);
    box(1.9, 0.18, 0.9, 0, 1.95, 1.3, color);
    const panel = color === WHITE ? 0xc91a09 : WHITE;
    for (const x of [-0.96, 0.96]) box(0.02, 0.5, 1.8, x, 1.5, -0.6, panel);   // side sign panel
    box(0.04, 0.95, 0.02, 0, 1.5, -2.11, DARK);                  // rear door seam
    for (const x of [-0.5, 0.5]) for (const z of [-1.6, -0.6, 0.4]) stud(x, 2.11, z, color);
  } else if (kind === 'pickup') {
    box(1.9, 0.55, 4.2, 0, 0.62, 0, color);
    cabin(1.7, 0.62, 1.3, 0.1);
    for (const x of [-0.88, 0.88]) box(0.14, 0.3, 1.7, x, 1.04, -1.2, color);  // bed walls
    box(1.9, 0.3, 0.14, 0, 1.04, -2.03, color);                  // tailgate
    box(1.62, 0.04, 1.6, 0, 0.91, -1.2, DARK);                   // bed liner
    box(0.7, 0.5, 0.7, -0.3, 1.16, -1.0, 0xa85a2a);              // crate
    box(0.5, 0.36, 0.5, 0.4, 1.09, -1.5, 0x958467);
    for (const x of [-0.5, 0.5]) for (const z of [1.25, 1.75]) stud(x, 0.96, z, color);
  } else if (kind === 'sports') {
    box(1.9, 0.42, 4.2, 0, 0.55, 0, color);
    const top = cabin(1.6, 0.4, 1.4, -0.3);
    box(0.4, 0.02, 4.2, 0, 0.77, 0, WHITE);                      // racing stripe
    box(0.4, 0.02, 1.5, 0, top + 0.01, -0.3, WHITE);
    for (const x of [-0.7, 0.7]) box(0.1, 0.3, 0.1, x, 0.9, -1.85, DARK);
    box(1.9, 0.08, 0.4, 0, 1.08, -1.85, color);                  // spoiler
    for (const x of [-0.6, 0.6]) stud(x, 0.83, 1.5, color);
  } else {
    box(1.9, 0.55, 4.2, 0, 0.62, 0, color);
    const top = cabin(1.7, 0.62, 2.0, -0.35);
    for (const x of [-0.82, 0.82]) box(0.1, 0.62, 0.1, x, 1.2, -0.35, color);   // door pillar
    for (const x of [-1.0, 1.0]) box(0.12, 0.12, 0.2, x, 1.0, 0.75, color);     // mirrors
    for (const x of [-0.5, 0.5]) for (const z of [1.2, 1.75]) stud(x, 0.96, z, color);
    if (kind === 'taxi') {
      box(0.9, 0.08, 0.36, 0, top + 0.04, -0.35, TYRE);          // roof sign
      box(0.8, 0.24, 0.26, 0, top + 0.2, -0.35, WHITE);
      for (let i = 0; i < 8; i += 2) for (const x of [-0.96, 0.96])
        box(0.02, 0.16, 0.26, x, 0.72, -0.9 + i * 0.26, TYRE);   // checker strip on the doors
    } else if (kind === 'police') {
      for (const x of [-0.96, 0.96]) box(0.02, 0.16, 4.0, x, 0.72, 0, 0x0a57c2);   // blue side stripe
      box(1.2, 0.08, 0.34, 0, top + 0.04, -0.35, TYRE);          // light bar
      box(0.45, 0.2, 0.28, -0.36, top + 0.18, -0.35, TAIL);
      box(0.24, 0.2, 0.28, 0, top + 0.18, -0.35, WHITE);
      box(0.45, 0.2, 0.28, 0.36, top + 0.18, -0.35, 0x0a57c2);
    } else {
      for (const x of [-0.45, 0.45]) stud(x, top + 0.07, -0.35, color);
    }
  }
  return mergeGeometries(parts.map(g => (g.index ? g.toNonIndexed() : g)), false);
}

const NPC_LINES = {
  angry: ["Hey! What's your problem?!", "Oh, you wanna go, bug-boy?!", "You just made a big mistake!", "Mask or no mask, you're done!",
    "That's it, put 'em up!", "You hit ME? In MY city?!", "I'm gonna web YOU, pal!", "Somebody film this!"],
  angryAgain: ["Again?! Now I'm REALLY mad!", "Okay, that's TWO!", "You're gonna regret that!", "Stop doing that!"],
  join: ["Yo, I got your back!", "Let's get him!", "Nobody does that on my block!", "Get the wall-crawler!", "Two of us now, Spidey!"],
  defend: ["Hey! Leave her alone!", "Pick on someone your own size!", "Not cool, Spider-Man!", "You don't treat people like that!"],
  scream: ["AAAH! Help!", "Spider-Man's gone crazy!", "Somebody call the cops!", "Get away from me!", "What is WRONG with you?!",
    "I'm telling the Bugle!", "Run!", "This is NOT okay!"],
  punch: ["Take that!", "How you like that?!", "Hah!", "Bet you felt that!", "Come on!"],
  giveUp: ["Yeah, you better run!", "And stay out!", "Coward!", "Whatever, man.", "Next time, Spidey..."],
};

const MOODS = ['fan', 'fan', 'fan', 'photo', 'photo', 'shy', 'grump', 'busy'];
const REACT = {
  fan: [{ emote: 'wave', t: 2.6, lines: ['Hey Spidey!', 'Over here, Spider-Man!', 'Spidey! Hi!'] },
        { emote: 'cheer', t: 2.2, lines: ['Woo! Go Spidey!', "That's my hero!", 'Best day ever!'] }],
  photo: [{ emote: 'photo', t: 3.2, flash: true, lines: ['Hold still!', 'Getting this for the Bugle!', 'Say cheese!', 'Nobody will believe this!'] }],
  shy: [{ emote: 'wave', t: 1.4, lines: [] }],
  grump: [{ emote: 'grumble', t: 2.2, lines: ['Show-off.', 'Watch it, web-head!', 'Menace...', "Jameson's right about you."] }],
  busy: [],
};
const MAX_REACTING = 4;

const EMPTY = [];
/** Length of the carjack sequence (see CityLife._jackStep / Driving.update). */
export const JACK_TIME = 2.6;

export class CityLife {
  constructor({ scene, cityMeshes, player, camera }) {
    this.scene = scene;
    this.camera = camera;
    this.meshes = cityMeshes;
    this.player = player; // Object3D
    this.ray = new THREE.Raycaster();
    this.ray.firstHitOnly = true;
    this._o = new THREE.Vector3();
    this._down = new THREE.Vector3(0, -1, 0);
    this.npcs = [];
    this.cars = [];
    this.obstacles = []; // street prop footprints {x, z, r}
  }

  _drop(x, z) {
    this.ray.set(this._o.set(x, 1000, z), this._down);
    this.ray.far = Infinity;
    return this.ray.intersectObjects(this._column(x, z), false)[0];
  }

  /** City meshes whose world XZ bounds cover (x, z), from a 32 m grid rebuilt when the mesh list
   *  changes. A vertical ray can't hit anything else; testing all ~240 meshes cost ~0.07 ms a ray. */
  _column(x, z) {
    const M = this.meshes, last = M[M.length - 1];
    if (!this._grid || this._gridN !== M.length || this._gridLast !== last) {
      this._gridN = M.length; this._gridLast = last;
      const grid = this._grid = new Map(), box = new THREE.Box3(), C = 32;
      for (const m of M) {
        const g = m.geometry;
        if (!g?.attributes?.position) continue;
        m.updateWorldMatrix(true, false);
        if (!g.boundingBox) g.computeBoundingBox();
        box.copy(g.boundingBox).applyMatrix4(m.matrixWorld);
        for (let i = Math.floor(box.min.x / C); i <= Math.floor(box.max.x / C); i++)
          for (let j = Math.floor(box.min.z / C); j <= Math.floor(box.max.z / C); j++) {
            const k = i * 65536 + j;
            let l = grid.get(k);
            if (!l) grid.set(k, l = []);
            l.push(m);
          }
      }
    }
    return this._grid.get(Math.floor(x / 32) * 65536 + Math.floor(z / 32)) ?? EMPTY;
  }

  /** Random spot near the player whose top surface is one of `kinds`, at street level. */
  _findSpot(kinds, minR, maxR) {
    const p = this.player.position;
    const street = this.streetY ?? p.y - 0.5; // last street level under the player, not roof height
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = minR + Math.random() * (maxR - minR);
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      const hit = this._drop(x, z);
      if (hit && kinds.has(hit.object.material?.name) && Math.abs(hit.point.y - street) < 4) {
        return new THREE.Vector3(x, hit.point.y, z);
      }
    }
    return null;
  }

  async init() {
    const carMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
    // Emissive boost for headlights and red taillights
    carMat.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Headlights (warm bright yellow-white) and tail lights (vivid red)
        if (diffuseColor.r > 0.95 && diffuseColor.g > 0.9 && diffuseColor.b > 0.65) {
          totalEmissiveRadiance += vec3(1.0, 0.96, 0.75) * 2.5;
        } else if (diffuseColor.r > 0.75 && diffuseColor.g < 0.15 && diffuseColor.b < 0.15) {
          totalEmissiveRadiance += vec3(1.0, 0.08, 0.08) * 1.8;
        }`
      );
    };
    for (let i = 0; i < CAR_COUNT; i++) {
      const [kind, paint] = pick(CAR_FLEET);
      const mesh = new THREE.Mesh(legoCarGeometry(paint, kind), carMat);
      mesh.userData.paint = paint;
      mesh.geometry.computeBoundsTree?.();
      mesh.userData.delta = new THREE.Vector3();
      mesh.castShadow = true;
      mesh.visible = false;
      this.scene.add(mesh);
      this.cars.push({ mesh, dir: [1, 0], speed: 0, check: 0, active: false });
    }
    // Swap in the imported car model (fixed converter output); brick cars stay if it fails to load
    for (const c of this.cars) carGeometry(c.mesh.userData.paint).then(g => {
      c.mesh.geometry.disposeBoundsTree?.(); c.mesh.geometry = g;
      if (!g.boundsTree) g.computeBoundsTree?.();
    }).catch(e => console.warn('[CityLife] car model', e));
    const loads = [];
    for (let i = 0; i < NPC_COUNT; i++) {
      // The game's own civilians (city, park, police, press); plain minifigs if a model can't load
      loads.push(new LegoSpidey({ skin: `glb:${CIVILIANS[i % CIVILIANS.length]}` }).load()
        .catch(() => new LegoSpidey({ torso: pick(SHIRTS), legs: pick(PANTS) }).load()).then(rig => {
        rig.mergeParts?.();   // 14 skinned parts -> ~5 draws per civilian
        const root = new THREE.Group();
        root.add(rig.root);
        root.visible = false;
        this.scene.add(root);
        const skin = CIVILIANS[i % CIVILIANS.length];
        const male = !/_f\d|old_f/.test(skin) && (skin.includes('_m') || skin.includes('police') || Math.random() < 0.5);
        this.npcs.push({ root, rig, male, skin, target: new THREE.Vector3(), wait: 0, speed: 0, check: 0, active: false });
      }));
    }
    await Promise.all(loads);
  }

  /**
   * Carjack: a civilian appears in the driver's seat, the door swings open, they get dragged out,
   * yell, then either storm off or slowly chase the player (slow enough to outrun). Returns the
   * duration in seconds; the caller locks the car until then.
   */
  carjack(car) {
    const m = car.mesh, pp = this.player.position;
    const n = this.npcs.filter(o => !o.jack && !(o.respawnT > 0)).sort((a, b) =>
      (a.active ? 1 : 0) - (b.active ? 1 : 0) || b.root.position.distanceToSquared(pp) - a.root.position.distanceToSquared(pp))[0];
    if (!n) return 0;
    // Door: hinged at its front edge on the driver's (+x) side
    if (!m.userData.door) {
      const hinge = new THREE.Group(); hinge.position.set(1.0, 0.55, 0.75);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.75, 1.15),
        new THREE.MeshStandardMaterial({ color: m.userData.paint ?? 0x888888, roughness: 0.5 }));
      door.position.set(0.02, 0.3, -0.6); hinge.add(door); m.add(hinge); hinge.visible = false;
      m.userData.door = hinge;
    }
    n.active = true; n.root.visible = true; n.angry = 0; n.flee = 0; n.react = null; n.wait = 0; n.vel?.set(0, 0, 0);
    n.jack = { car: m, t: 0, said: false };
    this._jackStep(n, 0);
    return JACK_TIME;
  }

  /**
   * Carjack timeline (seconds), matched by Driving.update for the hero:
   *  0.00-0.65  driver sits in the seat, hero walks up to the door
   *  0.65-0.95  door swings open
   *  0.95-1.45  hero yanks: the driver is hauled out and tumbles onto the road
   *  1.45-2.15  driver sits dazed on the ground while the hero climbs in
   *  1.95-2.30  door slams shut behind the hero
   *  2.30-2.60  driver gets up, yells, then storms off or gives chase
   */
  _jackStep(n, dt) {
    const j = n.jack, m = j.car, door = m.userData.door;
    j.t += dt;
    const t = j.t;
    const open = THREE.MathUtils.smoothstep(t, 0.65, 0.95) * (1 - THREE.MathUtils.smoothstep(t, 1.95, 2.3));
    door.visible = t < 2.32; door.rotation.y = open * 1.3;
    const c = Math.cos(m.rotation.y), s = Math.sin(m.rotation.y);
    const at = (lx, lz, y) => n.root.position.set(m.position.x + lx * c + lz * s, y, m.position.z - lx * s + lz * c);
    const base = m.position.y + 0.25;
    let state = { speed: 0, grounded: true, vy: 0, hurt: 0, emote: null };
    if (t < 0.95) {                                                        // in the seat, facing forward
      at(0.45, 0.1, base + 0.15);
      n.root.rotation.y = m.rotation.y;
      state.emote = t > 0.7 ? 'listen' : null;
    } else if (t < 1.45) {                                                 // hauled out in an arc, spinning
      const u = (t - 0.95) / 0.5;
      at(0.45 + u * 2.3, 0.1 - u * 0.5, base + 0.15 + Math.sin(u * Math.PI) * 0.6 - u * 0.4);
      n.root.rotation.y = m.rotation.y - u * Math.PI * 1.1;
      state.hurt = 0.4;
    } else if (t < 2.3) {                                                  // dazed on the ground
      at(2.75, -0.4, base - 0.25);
      n.root.rotation.y = m.rotation.y + Math.PI * 0.4;
      state.emote = 'sit';
    } else {                                                               // back on their feet, facing the car
      at(2.75, -0.4, base);
      n.root.rotation.y = m.rotation.y - Math.PI / 2;
      state.emote = 'grumble';
    }
    n.rig?.update?.(dt, state);
    if (t > 2.2 && !j.said) {
      j.said = true;
      this._say(n, pick(["HEY! That's MY car!", 'Are you kidding me?!', 'Spider-Man stole my car!', 'I just got that washed!',
        'Get back here, web-head!', "I'm calling the cops!", 'Seriously?! In broad daylight?!']), 2.8, true);
    }
    if (t >= JACK_TIME) {
      n.jack = null; door.visible = false;
      if (Math.random() < 0.5) { n.angry = 9; n.slowChase = true; n.punchT = 1.5; }   // slow, easy to outrun
      else { n.flee = 0; this._newTarget(n); }
    }
  }

  _placeNpc(n, near) {
    const spot = this._findSpot(WALK, near ? 8 : 60, near ? 90 : 140);
    if (!spot) return;
    n.root.position.set(spot.x, spot.y + 0.5, spot.z);
    n.root.visible = n.active = true;
    n.groundY = spot.y;
    n.hp = n.male ? 3 : 2; n.flee = 0; n.angry = 0; n.punchT = 0; n.hop = 0; n.vy = 0; n.stuckT = 0;
    n.vel = (n.vel ?? new THREE.Vector3()).set(0, 0, 0);
    n.lastPos = (n.lastPos ?? new THREE.Vector3()).copy(n.root.position);
    n.speed = 1.4 + Math.random() * 1.2;
    // The source game sends civilians between locator sets. Generate a short-lived
    // waypoint route on the sidewalk mesh; most follow connected bends, some roam freely.
    n.routeStyle = Math.random() < 0.65 ? 'waypoints' : 'random';
    n.pathHeading = null;
    n.waveT = 0;
    // Personality decides how they react to Spider-Man; staggered checks keep the cost flat
    n.mood ??= n.skin === 'photographer' || n.skin === 'newsreporter' ? 'photo' : pick(MOODS);
    if (n.react) this._reacting--;
    n.react = null; n.reactCd = 3 + Math.random() * 10; n.senseT = Math.random() * 0.5;
    this._newTarget(n);
  }

  /** Pick a walkable point with a clear straight path (no walls in between). */
  _newTarget(n, awayFrom = null) {
    const p = n.root.position;
    for (let i = 0; i < 10; i++) {
      let a = Math.random() * Math.PI * 2;
      if (awayFrom) a = Math.atan2(p.z - awayFrom.z, p.x - awayFrom.x) + (Math.random() - 0.5) * 1.4;
      else if (n.routeStyle === 'waypoints' && n.pathHeading != null) a = n.pathHeading + (Math.random() - 0.5) * 0.9;
      const r = awayFrom ? 12 + Math.random() * 8 : 6 + Math.random() * 16;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      const hit = this._drop(x, z);
      if (!hit || !WALK.has(hit.object.material?.name) || Math.abs(hit.point.y + 0.5 - p.y) > 0.8) continue;
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      if (this._blocked(p, dx / d, dz / d, d) || this._pathHitsProp(p.x, p.z, x, z)) continue;
      n.target.set(x, hit.point.y + 0.5, z);
      n.pathHeading = a;
      n.wait = 0;
      return;
    }
    n.wait = 1 + Math.random() * 2; // nowhere good to go: stand and look around
  }

  _propAt(x, z, pad = 0.35) {
    for (const o of this.obstacles) if ((o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + pad) ** 2) return true;
    return false;
  }

  /** Does the straight segment a→b pass through any prop footprint? */
  _pathHitsProp(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
    for (const o of this.obstacles) {
      const t = Math.max(0, Math.min(1, ((o.x - ax) * dx + (o.z - az) * dz) / len2));
      const cx = ax + dx * t - o.x, cz = az + dz * t - o.z;
      if (cx * cx + cz * cz < (o.r + 0.4) ** 2) return true;
    }
    return false;
  }

  _walkable(x, z, y) {
    const h = this._drop(x, z);
    return !!h && WALK.has(h.object.material?.name) && Math.abs(h.point.y + 0.5 - y) < 0.8;
  }

  /** Punched by the player. Returns true when the civilian breaks apart. */
  hitNpc(n, from, dmg = 1) {
    if (!n.active) return false;
    n.hp -= dmg;
    const ax = n.root.position.x - from.x, az = n.root.position.z - from.z, d = Math.hypot(ax, az) || 1;
    n.vel.set(ax / d * 7, 0, az / d * 7);
    n.vy = 4.5;
    n.rig.flash(0.9);
    n.flashT = 0.3;
    if (n.hp > 0) this._react(n, from);
    else this.scare(n.root.position, 12, n);
    if (n.hp > 0) return false;
    n.active = false;
    n.root.visible = false;
    n.respawnT = 6;
    return true;
  }

  /** Hit but still standing: guys get mad (and their buddies pile in), everyone else screams and runs. */
  _react(n, from) {
    const pick = a => a[Math.floor(Math.random() * a.length)];
    if (n.male) {
      const was = n.angry > 0;
      n.angry = 12; n.flee = 0; n.wait = 0; n.punchT = 0.8;
      this._say(n, pick(was ? NPC_LINES.angryAgain : NPC_LINES.angry), 2.6, true);
      // Other guys nearby join in
      let joined = 0;
      for (const o of this.npcs) {
        if (o === n || !o.active || !o.male || o.angry > 0 || joined >= 3) continue;
        if (o.root.position.distanceTo(n.root.position) > 14 || Math.random() < 0.35) continue;
        o.angry = 12; o.flee = 0; o.wait = 0; o.punchT = 1 + Math.random(); joined++;
        if (joined === 1) setTimeout(() => o.active && this._say(o, pick(NPC_LINES.join), 2.4, true), 700);
      }
      this.scare(n.root.position, 12, n);
    } else {
      this._say(n, pick(NPC_LINES.scream), 2.4, true);
      this.scare(n.root.position, 14);
      // A guy who saw that might step in for her
      const hero = this.npcs.find(o => o.active && o.male && o.angry <= 0 && o.root.position.distanceTo(n.root.position) < 12 && Math.random() < 0.4);
      if (hero) { hero.angry = 10; hero.flee = 0; hero.wait = 0; hero.punchT = 1.2; setTimeout(() => hero.active && this._say(hero, pick(NPC_LINES.defend), 2.4, true), 900); }
    }
  }

  /** Civilians near `pos` run away from it for a few seconds (angry ones stand their ground). */
  scare(pos, radius, except = null) {
    for (const n of this.npcs) {
      if (!n.active || n === except || n.angry > 0 || n.root.position.distanceTo(pos) > radius) continue;
      if (!n.male && n.flee <= 0 && Math.random() < 0.3 && !this._bubble) this._say(n, NPC_LINES.scream[Math.floor(Math.random() * NPC_LINES.scream.length)], 2);
      n.flee = 4 + Math.random() * 2;
      this._newTarget(n, pos);
    }
  }

  _blocked(pos, dx, dz, dist) {
    this.ray.set(this._o.set(pos.x, pos.y + 0.6, pos.z), new THREE.Vector3(dx, 0, dz));
    this.ray.far = dist;
    return !!this.ray.intersectObjects(this.meshes, false)[0];
  }

  /** True if a world point is on screen (within ~140 m), so a car appearing there would pop in. */
  _inView(p) {
    if (!this.camera) return false;
    const v = (this._pv ??= new THREE.Vector3()).copy(p).setY(p.y + 1);
    if (v.distanceTo(this.camera.position) > 140) return false;
    v.project(this.camera);
    return v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15;
  }

  _placeCar(c, near) {
    for (let i = 0; i < 10; i++) {
      const spot = this._findSpot(ROAD, near ? 35 : 80, near ? 120 : 145);
      if (!spot || this._inView(spot)) continue;
      // Never drop a car on top of (or right against) another one
      if (this.cars.some(o => o !== c && o.active && o.mesh.position.distanceToSquared(spot) < 81)) continue;
      const order = [...HEADINGS].sort(() => Math.random() - 0.5);
      for (const d of order) {
        if (this._isRoad(spot.x + d[0] * 10, spot.z + d[1] * 10, spot.y)) {
          c.mesh.position.copy(spot);
          c.dir = d;
          c.mesh.rotation.y = Math.atan2(d[0], d[1]);
          c.cruise = c.speed = 8 + Math.random() * 4;
          // Like the source DriveRoute script, traffic gets an ordered route plan;
          // the road mesh resolves each waypoint into a legal turn at runtime.
          c.route = Array.from({ length: 12 }, () => pick(['straight', 'straight', 'left', 'right']));
          c.routeIndex = 0;
          c.mesh.visible = c.active = true;
          c.crossing = null;
          this._snapLane(c, true);
          return;
        }
      }
    }
  }

  /** A passer-by near the player sometimes pipes up: a bubble over their head and a mumbled voice. */
  _chatter(dt, pp) {
    this._talkT = (this._talkT ?? 4) - dt;
    if (this._bubble) {
      this._bubble.life -= dt;
      if (this._bubble.life <= 0 || !this._bubble.npc.active) { this._bubble.npc.root.remove(this._bubble.sprite); this._bubble = null; }
    }
    if (this._talkT > 0 || this._bubble) return;
    this._talkT = 6 + Math.random() * 8;
    const near = this.npcs.filter(n => n.active && n.root.position.distanceTo(pp) < 7);
    if (!near.length) return;
    const n = near[Math.floor(Math.random() * near.length)];
    const LINES = ["Is that Spider-Man?!", "Hey Spidey! Big fan!", "Watch it, web-head!", "My cousin says you're a menace.",
      "Can I get a selfie?", "Nice suit!", "The Bugle says you're a criminal...", "Thanks for saving my cat!",
      "Whoa, did you see that?", "Go get 'em, Spidey!", "Another day in New York.", "Somebody call the cops!",
      "I'm walking here!", "Where's the subway?", "You dropped a stud!", "Is it a bird? No, wait..."];
    this._say(n, LINES[Math.floor(Math.random() * LINES.length)], 3.2);
  }

  /** Speech bubble over an NPC's head plus a mumbled voice. `force` replaces whatever bubble is up. */
  _say(n, text, life = 3, force = false) {
    if (this._bubble) { if (!force) return; this._bubble.npc.root.remove(this._bubble.sprite); this._bubble = null; }
    this._talkT = Math.max(this._talkT ?? 0, 3);
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
    const x = cv.getContext('2d');
    x.font = 'bold 34px "Lilita One", Arial, sans-serif';
    const w = Math.min(500, x.measureText(text).width + 40);
    x.fillStyle = (n.angry > 0 ? '#ffd6cc' : '#ffffff'); x.strokeStyle = '#141414'; x.lineWidth = 5;
    x.beginPath(); x.roundRect((512 - w) / 2, 8, w, 80, 22); x.fill(); x.stroke();
    x.beginPath(); x.moveTo(236, 86); x.lineTo(256, 118); x.lineTo(276, 86); x.fill();
    x.fillStyle = '#141414'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 256, 49);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.scale.set(2.6, 0.65, 1); sprite.position.y = 2.4; sprite.renderOrder = 10;
    n.root.add(sprite);
    this._bubble = { npc: n, sprite, life };
    import('./GameUI.js?v=127').then(m => m.mumble?.(text)).catch(() => {});
  }

  /** Awareness: notice Spider-Man nearby (or swinging overhead) and react once in a while. */
  _sense(n, dt, pp) {
    const p = n.root.position;
    n.waveT = (n.waveT ?? 0) + dt;
    if (n.react) {
      n.react.t -= dt;
      // Turn toward him smoothly while reacting
      const want = Math.atan2(pp.x - p.x, pp.z - p.z);
      let d = want - n.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      n.root.rotation.y += d * Math.min(1, dt * 6);
      if (n.react.flash && n.react.t < n.react.flashAt) { n.react.flash = false; this._cameraFlash(n); }
      if (n.react.t <= 0 || n.flee > 0 || n.angry > 0) { n.react = null; this._reacting--; n.wait = Math.min(n.wait, 0.3); }
      return;
    }
    n.reactCd -= dt; n.senseT -= dt;
    if (n.senseT > 0) return;
    n.senseT = 0.4 + Math.random() * 0.2;
    const dx = pp.x - p.x, dz = pp.z - p.z, dy = pp.y - p.y, h = Math.hypot(dx, dz);
    const close = h < 8 && Math.abs(dy) < 3, overhead = h < 16 && dy > 3 && dy < 30;
    if (!close && !overhead) return;
    // Only if they're roughly facing him (or he's very close) - people notice what they can see
    const facing = Math.cos(Math.atan2(dx, dz) - n.root.rotation.y);
    if (h > 3 && facing < -0.2) return;
    // The source wander script waves after 20 seconds when a player is close and no fight is active.
    if (h < 4.5 && Math.abs(dy) < 2 && n.waveT >= 20 && (this._reacting ?? 0) < MAX_REACTING) {
      n.waveT = 0;
      n.reactCd = 18 + Math.random() * 25;
      n.react = { emote: 'wave', t: 1.6, flash: false };
      this._reacting = (this._reacting ?? 0) + 1;
      n.wait = Math.max(n.wait, 1.8);
      const lines = REACT.fan[0].lines;
      this._say(n, lines[Math.floor(Math.random() * lines.length)], 2.2);
      return;
    }
    if (n.reactCd > 0 || (this._reacting ?? 0) >= MAX_REACTING) return;
    const opts = REACT[n.mood] ?? [];
    n.reactCd = 18 + Math.random() * 25;
    if (!opts.length || Math.random() < 0.25) return;
    const r = opts[Math.floor(Math.random() * opts.length)];
    n.react = { emote: r.emote, t: r.t, flash: !!r.flash, flashAt: r.t * 0.45 };
    this._reacting = (this._reacting ?? 0) + 1;
    n.wait = r.t + 0.2;                       // stop walking for the reaction
    if (r.lines.length && Math.random() < 0.6) this._say(n, r.lines[Math.floor(Math.random() * r.lines.length)], Math.min(2.6, r.t));
  }

  /** Brief phone-camera flash in front of the NPC's face. */
  _cameraFlash(n) {
    const tex = CityLife._flashTex ??= (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,250,220,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.set(0, 1.35, 0.45); s.scale.setScalar(1.1);
    n.root.add(s);
    let t = 0;
    const tick = () => { t += 1 / 60; s.material.opacity = Math.max(0, 1 - t * 6); if (t < 0.18) requestAnimationFrame(tick); else { n.root.remove(s); s.material.dispose(); } };
    requestAnimationFrame(tick);
  }

  /** Is there a building face within `far` m ahead of a car (bumper height)? */
  _wallAhead(p, dir, far = 6) {
    const rc = this._wallRay ??= Object.assign(new THREE.Raycaster(), { firstHitOnly: true });
    rc.set(this._wo ??= new THREE.Vector3(), this._wd ??= new THREE.Vector3());
    rc.ray.origin.set(p.x, p.y + 1.0, p.z);
    rc.ray.direction.set(dir[0], 0, dir[1]);
    rc.far = far + 2.2;
    const hit = rc.intersectObjects(this.meshes, false)[0];
    return !!hit && Math.abs(hit.face?.normal?.y ?? 0) < 0.6;
  }

  /** Measure the road across the car and aim for the middle of the right-hand half. */
  _snapLane(c, instant = false) {
    const p = c.mesh.position, rx = -c.dir[1], rz = c.dir[0]; // right of travel
    const reach = sign => {
      let d = 0;
      while (d < 14 && this._isRoad(p.x + rx * sign * (d + 0.5), p.z + rz * sign * (d + 0.5), p.y)) d += 0.5;
      return d;
    };
    const right = reach(1), left = reach(-1);
    const width = left + right;
    if (width < 4) { c.laneOffset = 0; return; }
    // Offset (along "right") from where we are to the lane centre
    c.laneOffset = (right - left) / 2 + (width >= 9 ? width / 4 : 0);
    if (instant) { p.x += rx * c.laneOffset; p.z += rz * c.laneOffset; c.laneOffset = 0; }
  }

  /** Signal cycle shared by every intersection: east-west green, amber, north-south green, amber. */
  signalFor(dir) {
    const t = (performance.now() / 1000) % 16;
    const xGreen = t < 7, xAmber = t >= 7 && t < 8, zGreen = t >= 8 && t < 15;
    if (dir[0] !== 0) return xGreen ? 'green' : xAmber ? 'amber' : 'red';
    return zGreen ? 'green' : t >= 15 ? 'amber' : 'red';
  }

  /** Hanging LEGO signal over an intersection (built once per crossing near the player). */
  _ensureSignal(x, y, z) {
    const key = `${Math.round(x / 18)},${Math.round(z / 18)}`;
    this.signals ??= new Map();
    this.signalSpots ??= [];
    if (this.signals.has(key)) return;
    // One signal per intersection: cars approaching from different sides find the same junction
    if (this.signalSpots.some(q => (q.x - x) ** 2 + (q.z - z) ** 2 < 30 * 30)) { this.signals.set(key, null); return; }
    this.signalSpots.push({ x, z });
    if (!this._sigMats) {
      const lamp = c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0 });
      this._sigMats = { x: [lamp(0xff2a1a), lamp(0xffb000), lamp(0x2aff5a)], z: [lamp(0xff2a1a), lamp(0xffb000), lamp(0x2aff5a)] };
      this._sigBox = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.5 });
      this._sigGeo = { box: new THREE.BoxGeometry(0.9, 2.2, 0.9), lamp: new THREE.CylinderGeometry(0.22, 0.22, 0.08, 14),
        pole: new THREE.CylinderGeometry(0.11, 0.14, 6.8, 10), arm: new THREE.CylinderGeometry(0.07, 0.07, 1, 8) };
    }
    // Plant a pole on the nearest sidewalk corner; a mast arm reaches out over the road
    let base = null;
    for (let r = 6; r <= 13 && !base; r += 1.5) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        const hit = this._drop(px, pz);
        if (hit && WALK.has(hit.object.material?.name) && Math.abs(hit.point.y - y) < 1.5) { base = { x: px, y: hit.point.y, z: pz }; break; }
      }
    }
    this.signals.set(key, null);
    if (!base) return; // no corner found: better no signal than a floating one
    if ((this.poleSpots ??= []).some(q => (q.x - base.x) ** 2 + (q.z - base.z) ** 2 < 25 * 25)) return;
    this.poleSpots.push(base);
    const G = this._sigGeo;
    const g = new THREE.Group();
    g.position.set(base.x, base.y, base.z);
    const pole = new THREE.Mesh(G.pole, this._sigBox);
    pole.position.y = 3.4;
    g.add(pole);
    // Arm from the top of the pole towards the junction centre
    const dx = x - base.x, dz = z - base.z, len = Math.min(Math.hypot(dx, dz) * 0.75, 8);
    const ang = Math.atan2(dx, dz);
    const arm = new THREE.Mesh(G.arm, this._sigBox);
    arm.scale.y = len;
    arm.rotation.set(Math.PI / 2, 0, 0);
    const armPivot = new THREE.Group();
    armPivot.position.y = 6.6;
    armPivot.rotation.y = ang;
    arm.position.z = len / 2;
    armPivot.add(arm);
    g.add(armPivot);
    // Signal head hanging from the end of the arm (world-aligned so the faces match traffic axes)
    const head = new THREE.Group();
    head.add(new THREE.Mesh(G.box, this._sigBox));
    for (const [axis, nx, nz] of [['x', 1, 0], ['x', -1, 0], ['z', 0, 1], ['z', 0, -1]]) {
      this._sigMats[axis].forEach((m, i) => {
        const l = new THREE.Mesh(G.lamp, m);
        l.rotation.set(nz ? Math.PI / 2 : 0, 0, nx ? Math.PI / 2 : 0);
        l.position.set(nx * 0.47, 0.7 - i * 0.7, nz * 0.47);
        head.add(l);
      });
    }
    head.position.set(Math.sin(ang) * len, 5.4, Math.cos(ang) * len);
    g.add(head);
    this.scene.add(g);
    this.signals.set(key, g);
  }

  _updateSignalLamps() {
    if (!this._sigMats) return;
    for (const [axis, dir] of [['x', [1, 0]], ['z', [0, 1]]]) {
      const st = this.signalFor(dir);
      const on = { red: 0, amber: 1, green: 2 }[st];
      this._sigMats[axis].forEach((m, i) => { m.emissiveIntensity = i === on ? 2.2 : 0.05; });
    }
  }

  _isRoad(x, z, y) {
    // Traffic probes the same static road cells every frame (was ~27 raycasts/frame, 1.6 ms):
    // cache the top surface per 0.5 m cell. Value = surface height if it is road, NaN if not.
    const key = Math.round(x * 2) * 65536 + Math.round(z * 2);
    const roads = (this._roadCache ??= new Map());
    let h = roads.get(key);
    if (h === undefined) {
      const hit = this._drop(Math.round(x * 2) / 2, Math.round(z * 2) / 2);
      h = hit && ROAD.has(hit.object.material?.name) ? hit.point.y : NaN;
      if (roads.size > 200000) roads.clear();
      roads.set(key, h);
    }
    return Math.abs(h - y) < 1.5;   // NaN compares false
  }

  update(dt) {
    const pp = this.player.position;
    this._chatter(dt, pp);
    // Track street level under the player so spawns still work while on roofs or mid-swing
    this._streetCheck = (this._streetCheck ?? 0) - dt;
    if (this._streetCheck <= 0) {
      this._streetCheck = 0.5;
      const hit = this._drop(pp.x, pp.z);
      if (hit && (ROAD.has(hit.object.material?.name) || WALK.has(hit.object.material?.name))) this.streetY = hit.point.y;
    }
    let placements = 2; // spread spawn raycasts over frames

    for (const n of this.npcs) {
      if (n.respawnT > 0) { n.respawnT -= dt; if (n.respawnT <= 0) this._placeNpc(n, false); continue; }
      if (n.jack) { this._jackStep(n, dt); continue; }
      if (!n.active || n.root.position.distanceToSquared(pp) > KEEP_RADIUS * KEEP_RADIUS) {
        n.cool = (n.cool ?? 0) - dt;
        if (n.cool <= 0 && placements-- > 0) { this._placeNpc(n, !n.active); if (!n.active) n.cool = 0.75; }
        continue;
      }
      const p = n.root.position;
      let moving = 0;
      if (!n.react && n.flee <= 0 && n.angry <= 0) this._sense(n, dt, pp);
      n.flee = Math.max(0, n.flee - dt);
      const speed = n.flee > 0 ? 5.5 : n.angry > 0 ? (n.slowChase ? 2.0 : 4.6) : n.speed;
      // Angry: chase the player and throw punches until they cool off or lose track
      if (n.angry > 0) {
        n.angry -= dt;
        const dist = Math.hypot(pp.x - p.x, pp.z - p.z);
        if (dist > 30 || Math.abs(pp.y - p.y) > 6) n.angry = Math.min(n.angry, 1.5); // up on a wall: they give up
        if (n.angry <= 0) { n.angry = 0; n.slowChase = false; if (Math.random() < 0.6) this._say(n, NPC_LINES.giveUp[Math.floor(Math.random() * NPC_LINES.giveUp.length)], 2.2); this._newTarget(n); }
        else {
          n.wait = 0;
          n.target.set(pp.x, p.y, pp.z);
          n.punchT -= dt;
          if (dist < 1.6) {
            n.target.copy(p); // stand and swing
            n.root.rotation.y = Math.atan2(pp.x - p.x, pp.z - p.z);
            if (n.punchT <= 0 && Math.abs(pp.y - p.y) < 2) {
              n.punchT = 1.1 + Math.random() * 0.6;
              n.vy = 3; // little lunge
              this.onPunchPlayer?.(p.clone());
              if (Math.random() < 0.35) this._say(n, NPC_LINES.punch[Math.floor(Math.random() * NPC_LINES.punch.length)], 1.6, true);
            }
          }
        }
      }

      // Knockback slide + hop, stopped by walls
      if (n.vel.lengthSq() > 0.01) {
        const sp = n.vel.length();
        if (!this._blocked(p, n.vel.x / sp, n.vel.z / sp, sp * dt + 0.45) && !this._propAt(p.x + n.vel.x * dt, p.z + n.vel.z * dt)) p.addScaledVector(n.vel, dt);
        else n.vel.set(0, 0, 0);
        n.vel.multiplyScalar(Math.exp(-5 * dt));
      }
      n.vy -= 25 * dt;
      n.hop = Math.max(0, n.hop + n.vy * dt);
      if (n.hop === 0) n.vy = 0;
      if (n.target && typeof n.target.y === 'number') n.groundY += ((n.target.y - 0.5) - n.groundY) * Math.min(1, dt * 6);
      p.y = n.groundY + 0.5 + n.hop;
      if (n.flashT > 0) { n.flashT -= dt; n.rig.flash(Math.max(0, n.flashT) * 3); }

      if (n.wait > 0) {
        n.wait -= dt;
        if (n.wait <= 0) this._newTarget(n);
      } else {
        const dx = n.target.x - p.x, dz = n.target.z - p.z, d = Math.hypot(dx, dz);
        if (d < 0.5) {
          n.wait = n.flee > 0 ? 0.01 : Math.random() < 0.4 ? 1 + Math.random() * 3 : 0.01;
          if (n.flee > 0) this._newTarget(n, pp);
        } else {
          const ux = dx / d, uz = dz / d;
          n.check -= dt;
          if (n.check <= 0) {
            n.check = 0.15;
            if (this._blocked(p, ux, uz, 0.9)) { this._newTarget(n, n.flee > 0 ? pp : null); continue; }
          }
          const step = speed * dt;
          let mx = ux * step, mz = uz * step;
          // Step around the player, but never into a wall
          const px = pp.x - p.x, pz = pp.z - p.z;
          if (px * px + pz * pz < 2.5) {
            const sx = mx - px * 0.05, sz = mz - pz * 0.05, sl = Math.hypot(sx, sz);
            if (sl > 0 && !this._blocked(p, sx / sl, sz / sl, sl + 0.45)) { mx = sx; mz = sz; }
          }
          if (this._propAt(p.x + mx * 4, p.z + mz * 4)) {
            let ok = false;
            for (const ang of [0.6, -0.6, 1.1, -1.1, 1.57, -1.57]) {
              const c = Math.cos(ang), sn = Math.sin(ang);
              const rx = mx * c - mz * sn, rz = mx * sn + mz * c;
              if (!this._propAt(p.x + rx * 4, p.z + rz * 4) && this._walkable(p.x + rx * 12, p.z + rz * 12, p.y)) {
                mx = rx; mz = rz; ok = true; break;
              }
            }
            if (!ok) { this._newTarget(n, n.flee > 0 ? pp : null); continue; }
          }
          p.x += mx; p.z += mz;
          n.root.rotation.y = Math.atan2(mx, mz);
          moving = speed;
        }
      }

      // Made no progress for a while (wedged somewhere): respawn elsewhere
      n.stuckT += dt;
      if (n.stuckT > 2) {
        const wedged = moving && p.distanceTo(n.lastPos) < 0.6;
        n.lastPos.copy(p);
        n.stuckT = 0;
        // Wedged: re-route, and only pop elsewhere when nobody can see it happen
        if (wedged) { if (!this._inView(p)) { this._placeNpc(n, false); continue; } this._newTarget(n); }
      }

      if (n.react) this._sense(n, dt, pp);
      // Detail by distance. A civilian is 14–32 skinned parts: each one is a draw call, a second
      // one in the shadow pass, and a share of the skeleton update. Only the ones close enough
      // to read get full-rate animation and a real shadow; behind the camera they barely tick.
      const d2 = p.distanceToSquared(pp);
      let every = d2 < 900 ? 1 : d2 < 5625 ? 2 : 4;            // 30 m, 75 m
      // Skinned parts can't be frustum-culled one by one (their bounds don't follow the pose),
      // so every civilian used to be drawn even behind the camera. Cull the whole figure here.
      // One within 12 m stays drawn so its shadow can still fall into view.
      if (this.camera) {
        const fr = this._frustum ??= new THREE.Frustum(), sph = this._sph ??= new THREE.Sphere();
        if (!this._frFrame) {
          fr.setFromProjectionMatrix((this._vp ??= new THREE.Matrix4()).multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
          this._frFrame = true;
        }
        sph.center.set(p.x, p.y + 0.9, p.z); sph.radius = 2.5;
        const seen = fr.intersectsSphere(sph);
        n.root.visible = seen || d2 < 144;
        if (!seen) every = 8;
      }
      const cast = d2 < 1600;                                   // 40 m
      if (n.cast !== cast) {
        n.casters ??= (() => { const l = []; n.root.traverse(o => { if (o.isMesh && o.castShadow) l.push(o); }); return l; })();
        for (const o of n.casters) o.castShadow = cast;
        n.cast = cast;
      }
      n.animDt = (n.animDt ?? 0) + dt;
      n.tick = (n.tick ?? this.npcs.indexOf(n)) + 1;
      if (n.tick % every === 0 || n.flashT > 0 || n.react) {
        n.rig.update(n.animDt, { speed: moving, grounded: n.hop < 0.2, vy: n.vy, hurt: n.flashT ?? 0, emote: n.react?.emote ?? null });
        n.animDt = 0;
      }
    }
    this._frFrame = false;

    this._updateSignalLamps();
    for (const c of this.cars) {
      if (c.driven) continue;   // the player has it (Driving.js)
      // Left where the player parked it: stay put until out of range, then recycle into traffic
      if (c.parked) { if (c.mesh.position.distanceToSquared(pp) > KEEP_RADIUS * KEEP_RADIUS) c.parked = false; else continue; }
      if (!c.active || c.mesh.position.distanceToSquared(pp) > KEEP_RADIUS * KEEP_RADIUS) {
        // Failed placements back off for a moment instead of re-trying hundreds of ground rays every frame
        c.cool = (c.cool ?? 0) - dt;
        if (c.cool <= 0 && placements-- > 0) {
          this._placeCar(c, !c.active);
          if (!c.active || c.mesh.position.distanceToSquared(pp) > KEEP_RADIUS * KEEP_RADIUS) c.cool = 0.75;
        }
        continue;
      }
      const p = c.mesh.position;
      c.prev = (c.prev ?? new THREE.Vector3()).copy(p);
      const rx = -c.dir[1], rz = c.dir[0];

      // Brake for the player standing in the lane ahead (not when riding on the roof)
      const ax = pp.x - p.x, az = pp.z - p.z;
      const ahead = ax * c.dir[0] + az * c.dir[1];
      const lateral = Math.abs(ax * rx + az * rz);
      const onRoof = pp.y - 0.5 > p.y + 1.2;
      const blocked = !onRoof && ahead > 0 && ahead < 8 && lateral < 1.8 && Math.abs(pp.y - 0.5 - p.y) < 2;

      // Queue behind the car in front
      let carAhead = false;
      for (const o of this.cars) {
        if (o === c || !o.active) continue;
        const ox = o.mesh.position.x - p.x, oz = o.mesh.position.z - p.z;
        const oa = ox * c.dir[0] + oz * c.dir[1], ol = Math.abs(ox * rx + oz * rz);
        if (oa > 0 && oa < 7.5 && ol < 2.2) { carAhead = true; break; }
      }

      // Look ahead every quarter second: road end, intersections, signals
      c.check -= dt;
      if (c.check <= 0) {
        c.check = 0.25;
        const fx = p.x + c.dir[0] * 9, fz = p.z + c.dir[1] * 9;
        // A side road only counts if the road ahead reaches well past this street's own edge on
        // that side. Probing a fixed 9 m landed on the other lanes of wide avenues, so cars saw a
        // "junction" everywhere, turned across the street into the kerb and looped.
        const edge = (x, z, s) => { let d = 0; while (d < 28 && this._isRoad(x + rx * s * (d + 2), z + rz * s * (d + 2), p.y)) d += 2; return d; };
        // Only probe ahead for a side road once we know where this street's own edges are
        // Street width is the same over a few metres: cache both edge scans per 4 m cell + heading
        // (each scan is up to 14 probes, and cars kept landing on fresh cache cells as they moved).
        const alongC = c.dir[0] ? Math.round(p.x / 4) : Math.round(p.z / 4);   // 4 m along the street
        const latC = c.dir[0] ? Math.round(p.z) : Math.round(p.x);              // 1 m across it (lane-exact)
        const ek = ((alongC * 32768 + latC) * 3 + Math.round(rx) + 1) * 3 + Math.round(rz) + 1;
        const edges = (this._edgeCache ??= new Map());
        let ee = edges.get(ek);
        if (!ee) {
          // Scan from the cell's along-street centre (sideways position stays exact) so later cars
          // passing this stretch reuse the same road-cache cells
          const sx = c.dir[0] ? Math.round(p.x / 4) * 4 : p.x, sz = c.dir[1] ? Math.round(p.z / 4) * 4 : p.z;
          ee = [edge(sx, sz, -1), edge(sx, sz, 1)];
          if (edges.size > 50000) edges.clear();
          edges.set(ek, ee);
        }
        const eL = ee[0], eR = ee[1];
        const sideL = eL < 22 && this._isRoad(fx - rx * (eL + 8), fz - rz * (eL + 8), p.y);
        const sideR = eR < 22 && this._isRoad(fx + rx * (eR + 8), fz + rz * (eR + 8), p.y);
        c.junctionAhead = (sideL || sideR) && !c.crossing;
        if (c.junctionAhead) {
          this._ensureSignal(fx, p.y, fz);
          c.junction = { x: fx, z: fz, sideL, sideR };
        }
        const hit = this._drop(p.x, p.z);
        if (hit && ROAD.has(hit.object.material?.name)) p.y = hit.point.y;
      }

      // Red or amber at the next junction: stop before it (once inside, keep going)
      let red = false;
      if (c.junctionAhead && !c.crossing) {
        const st = this.signalFor(c.dir);
        const dist = (c.junction.x - p.x) * c.dir[0] + (c.junction.z - p.z) * c.dir[1];
        if (st !== 'green' && dist > 3 && dist < 11) red = true;
        if (st === 'green' && dist < 6) {
          // Entering the junction: follow the next planned route point when that road exists.
          const straight = this._isRoad(p.x + c.dir[0] * 16, p.z + c.dir[1] * 16, p.y);
          const left = c.junction.sideL ? [c.dir[1], -c.dir[0]] : null;
          const right = c.junction.sideR ? [-c.dir[1], c.dir[0]] : null;
          const planned = c.route?.[c.routeIndex++ % c.route.length] ?? 'straight';
          const turn = planned === 'left' && left ? left : planned === 'right' && right ? right : !straight ? left ?? right : null;
          c.crossing = { turn, at: dist + 2, travelled: 0 };
        }
      }
      if (c.crossing) {
        c.crossing.travelled += c.speed * dt;
        if (c.crossing.turn && c.crossing.travelled >= c.crossing.at) {
          c.dir = c.crossing.turn;
          c.crossing.turn = null;
          this._snapLane(c);
        }
        if (c.crossing.travelled > c.crossing.at + 12) c.crossing = null;
      }
      // Road ends or a wall is ahead: turn onto a side road if there is one, else U-turn (not back and forth)
      c.turnCool = Math.max(0, (c.turnCool ?? 0) - dt);
      if (!c.crossing && c.check === 0.25 && c.turnCool <= 0
          && (!this._isRoad(p.x + c.dir[0] * 6, p.z + c.dir[1] * 6, p.y) || this._wallAhead(p, c.dir))) {
        const L = [c.dir[1], -c.dir[0]], R = [-c.dir[1], c.dir[0]];
        const opts = [R, L].filter(d => this._isRoad(p.x + d[0] * 8, p.z + d[1] * 8, p.y) && !this._wallAhead(p, d));
        c.dir = opts.length ? opts[0] : [-c.dir[0], -c.dir[1]];
        c.turnCool = 3;
        this._snapLane(c);
      }

      c.stuck = carAhead && c.speed < 0.5 && !red ? (c.stuck ?? 0) + dt : 0;
      // Jammed for good (a cluster of cars stuck in one spot): send it somewhere else off-screen
      c.jam = c.speed < 0.3 && !red ? (c.jam ?? 0) + dt : 0;
      if (c.jam > 12 && !this._inView(p)) { c.jam = 0; c.stuck = 0; this._placeCar(c, false); continue; }
      if (c.stuck > 8 && (c.turnCool ?? 0) <= 0) { c.dir = [-c.dir[0], -c.dir[1]]; c.stuck = 0; c.turnCool = 4; this._snapLane(c); }
      // Never drive into a building: stop dead if a wall is right in front
      if (c.check === 0.25) c.wallNear = this._wallAhead(p, c.dir, 3);
      const targetSpeed = blocked || carAhead || red || c.wallNear ? 0 : c.cruise;
      c.speed += (targetSpeed - c.speed) * Math.min(1, dt * (targetSpeed < c.speed ? 4 : 1.5));

      // While the body is still turning onto a new heading, drive along the body (an arc through
      // the corner) instead of snapping the motion 90 degrees and crabbing sideways.
      {
        const hw = Math.atan2(c.dir[0], c.dir[1]), h = c.mesh.rotation.y;
        const off = Math.atan2(Math.sin(hw - h), Math.cos(hw - h)), turning = Math.abs(off) > 0.4;   // real turns only; lane steering stays under 0.32 rad
        p.x += (turning ? Math.sin(h) : c.dir[0]) * c.speed * dt;
        p.z += (turning ? Math.cos(h) : c.dir[1]) * c.speed * dt;
        if (turning) c.mesh.rotation.y += off * Math.min(1, dt * 5);
      }
      // Steer into the lane centre: sideways motion is limited by forward speed (a car can't
      // crab sideways, and a stopped car doesn't move at all). Used to slide at 5 m/s regardless.
      let side = 0;
      if (c.laneOffset) {
        side = Math.sign(c.laneOffset) * Math.min(Math.abs(c.laneOffset), c.speed * 0.32 * dt);
        p.x += -c.dir[1] * side; p.z += c.dir[0] * side;
        c.laneOffset -= side;
      }
      c.mesh.userData.delta.subVectors(p, c.prev);
      // Face where the car is actually going (heading + the lane-change steer), so turns and lane
      // changes read as steering instead of the body sliding back into place.
      const fwd = c.speed * dt;
      const want = fwd > 1e-4
        ? Math.atan2(c.dir[0] * fwd - c.dir[1] * side, c.dir[1] * fwd + c.dir[0] * side)
        : c.mesh.rotation.y;
      let diff = want - c.mesh.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      c.mesh.rotation.y += diff * Math.min(1, dt * (c.speed > 1 ? 6 : 2));
    }
    this._separateCars(pp);
  }

  /** Hard rule: car bodies never overlap. Push intersecting pairs apart along the shallowest axis. */
  _separateCars(pp) {
    const live = this.cars.filter(c => c.active && c.mesh.position.distanceToSquared(pp) <= KEEP_RADIUS * KEEP_RADIUS);
    const ext = c => (Math.abs(c.dir[0]) > 0.5 ? [2.3, 1.05] : [1.05, 2.3]); // half-size in x, z (+ small gap)
    for (let i = 0; i < live.length; i++) {
      const a = live[i], pa = a.mesh.position, [ax, az] = ext(a);
      for (let j = i + 1; j < live.length; j++) {
        const b = live[j], pb = b.mesh.position;
        if (Math.abs(pa.y - pb.y) > 2) continue;
        const [bx, bz] = ext(b);
        const dx = pb.x - pa.x, dz = pb.z - pa.z;
        const ox = ax + bx - Math.abs(dx), oz = az + bz - Math.abs(dz);
        if (ox <= 0 || oz <= 0) continue;
        // The car further back along its own heading gives way; it yields the whole push and stops
        const aBehind = dx * a.dir[0] + dz * a.dir[1] > 0;   // b is ahead of a
        const mover = aBehind ? a : b, sign = mover === a ? -1 : 1;
        // Back off along its own heading only (braking), never sideways: that read as sliding
        const along = Math.abs(mover.dir[0]) > 0.5 ? ox : oz;
        mover.mesh.position.x -= mover.dir[0] * along;
        mover.mesh.position.z -= mover.dir[1] * along;
        mover.speed = Math.min(mover.speed, 0.5);
      }
    }
  }
}


/**
 * Cars driving across the bridges: two lanes each way, right-hand traffic, following the
 * deck's slope profile (from smoothBridgeRamps). Only drawn near the player.
 */
export class BridgeTraffic {
  constructor(scene, bridges, player) {
    this.player = player;
    this.cars = [];
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
    const geos = CAR_FLEET.map(([kind, c]) => legoCarGeometry(c, kind));
    for (const b of bridges) {
      const len = b.hi - b.lo;
      const n = Math.max(4, Math.min(10, Math.round(len / 90)));
      for (let i = 0; i < n; i++) {
        const dir = i % 2 ? 1 : -1, lane = (i >> 1) % 2;   // two lanes per direction
        const mesh = new THREE.Mesh(geos[(i * 3 + bridges.indexOf(b)) % geos.length], mat);
        mesh.castShadow = true;
        mesh.visible = false;
        scene.add(mesh);
        const cruise = 13 + (i % 3) * 2.5;
        carGeometry(CAR_FLEET[(i * 3 + bridges.indexOf(b)) % CAR_FLEET.length][1]).then(g => { mesh.geometry = g; }).catch(() => {});
        this.cars.push({ b, mesh, dir, off: 2.0 + lane * 3.2, a: b.lo + ((i * 0.618) % 1) * len, speed: cruise, cruise });
      }
    }
    this._t = new THREE.Vector3();
  }

  update(dt) {
    const pp = this.player.position;
    for (const c of this.cars) {
      const b = c.b;
      // Queue behind the car ahead in the same lane
      let gap = Infinity;
      for (const o of this.cars) {
        if (o === c || o.b !== b || o.dir !== c.dir || o.off !== c.off) continue;
        const d = (o.a - c.a) * c.dir;
        if (d > 0 && d < gap) gap = d;
      }
      const targetSpeed = gap < 9 ? 0 : gap < 18 ? c.cruise * (gap - 9) / 9 : c.cruise;
      // Route vehicles accelerate and brake into gaps instead of snapping to a new speed.
      c.speed += (targetSpeed - c.speed) * Math.min(1, dt * (targetSpeed < c.speed ? 4.5 : 1.2));
      c.a += c.dir * c.speed * dt;
      if (c.a > b.hi) c.a = b.lo; else if (c.a < b.lo) c.a = b.hi;   // loop round to the far end
      // Right-hand lane: offset to the right of travel along the sideways axis
      const right = (b.ax === 2 ? -c.dir : c.dir) * c.off;
      const lat = b.latC + right, y = b.f(c.a);
      const p = c.mesh.position;
      if (b.ax === 0) p.set(c.a, y, lat); else p.set(lat, y, c.a);
      const far = (p.x - pp.x) ** 2 + (p.z - pp.z) ** 2 > 450 * 450;
      c.mesh.visible = !far;
      if (far) continue;
      const ahead = c.a + c.dir * 2;
      if (b.ax === 0) this._t.set(ahead, b.f(ahead), lat); else this._t.set(lat, b.f(ahead), ahead);
      c.mesh.lookAt(this._t);
    }
  }
}
