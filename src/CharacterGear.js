/**
 * CharacterGear.js — the equipment every summoned character actually carries.
 *
 * Weapons are built from chunky LEGO parts exactly like Gear.js does for Spider-Man's
 * hoods and backpack: no external models are needed, and every piece is parented to the
 * minifig joint that drives it (hands, head, torso, root), so nothing floats or clips.
 *
 * `attachKit(rig, kit)` adds the meshes and returns refs the animator uses for muzzle
 * flashes, jet flames, the Silver Surfer's board and Loki's ice aura.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const plastic = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.34, metalness: 0, ...extra });
const emissive = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.28, ...extra });
const mesh = (geo, m, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
};
const rbox = (w, h, d, r, color, x, y, z, extra) =>
  mesh(new RoundedBoxGeometry(w, h, d, 2, r), plastic(color, extra), x, y, z);
const cyl = (r1, r2, h, color, x, y, z, seg = 14, extra) =>
  mesh(new THREE.CylinderGeometry(r1, r2, h, seg), plastic(color, extra), x, y, z);
const tube = (pts, r, color, extra) =>
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), 18, r, 8, false), plastic(color, extra));
const gltfLoader = new GLTFLoader();
let goblinGliderPromise = null;

/** Grip transform inside a hand: minifig arms hang from the shoulder, hand at local (0,-0.55,0.05). */
function grip(rig, side) {
  const g = new THREE.Group();
  g.position.set(0, -0.5, 0.07);
  rig.arm[side].add(g);
  return g;
}

const BUILDERS = {
  /** Iron Man: palm repulsor discs that light up when he fires. */
  repulsors(rig, refs) {
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(0, -0.55, 0.19);
      g.add(cyl(0.095, 0.095, 0.035, 0xd9a92e, 0, 0, 0, 16).rotateX(Math.PI / 2));
      const core = mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.045, 14), emissive(0xbfefff), 0, 0, 0.008);
      core.rotation.x = Math.PI / 2;
      g.add(core);
      rig.arm[s].add(g);
      refs.repulsors.push(core);
    }
  },
  reactor(rig) {
    const g = new THREE.Group();
    g.position.set(0, 1.03, 0.22);
    g.add(cyl(0.105, 0.105, 0.03, 0xd9a92e, 0, 0, 0, 16).rotateX(Math.PI / 2));
    const core = mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.04, 16), emissive(0xcdefff), 0, 0, 0.012);
    core.rotation.x = Math.PI / 2;
    g.add(core);
    rig.torso.add(g);
  },
  /** Boot thrusters: only visible while flying. */
  jets(rig, refs) {
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(s * 0.17, 0.02, -0.02);
      const flame = mesh(new THREE.ConeGeometry(0.1, 0.42, 8), emissive(0xffb03a, { transparent: true, opacity: 0.85 }), 0, -0.2, 0);
      flame.rotation.x = Math.PI;      // cone points down
      flame.userData.ph = s * 1.7;
      g.add(cyl(0.09, 0.11, 0.1, 0x8a1d16, 0, 0.02, 0, 12), flame);
      g.visible = false;
      rig.root.add(g);
      refs.jets.push(flame);
      refs.jetGroups.push(g);
    }
  },
  /** Deadpool: crossed katanas sheathed on his back. */
  katanasBack(rig) {
    const g = new THREE.Group();
    g.position.set(0, 1.02, -0.2);
    for (const s of [-1, 1]) {
      const k = new THREE.Group();
      k.rotation.z = s * 0.42;
      k.add(mesh(new THREE.BoxGeometry(0.055, 0.78, 0.02), plastic(0xdfe4ea, { metalness: 0.6, roughness: 0.22 }), 0, 0.3, 0));
      k.add(rbox(0.05, 0.24, 0.05, 0.02, 0x1b1b1f, 0, -0.2, 0));      // grip
      k.add(rbox(0.13, 0.03, 0.06, 0.012, 0xc9a02a, 0, -0.07, 0));     // tsuba
      g.add(k);
    }
    rig.torso.add(g);
  },
  /** Held katana in the right hand, used for the melee combo. */
  katana(rig) {
    const g = grip(rig, -1);
    g.rotation.x = 0.95;   // blade angled forward out of the fist, not up the arm
    g.add(mesh(new THREE.BoxGeometry(0.05, 0.82, 0.018), plastic(0xe6ecf2, { metalness: 0.65, roughness: 0.2 }), 0, 0.44, 0));
    g.add(rbox(0.05, 0.22, 0.05, 0.02, 0x1b1b1f, 0, -0.06, 0));
    g.add(rbox(0.13, 0.03, 0.065, 0.012, 0xc9a02a, 0, 0.06, 0));
  },
  /** Long steel sword for Blade and Gamora. */
  sword(rig) {
    const g = grip(rig, -1); g.rotation.x = 0.88;
    g.add(mesh(new THREE.BoxGeometry(0.055, 0.92, 0.025), plastic(0xe0e4e9, { metalness: 0.58, roughness: 0.22 }), 0, 0.48, 0));
    g.add(mesh(new THREE.ConeGeometry(0.04, 0.14, 4), plastic(0xe0e4e9, { metalness: 0.55 }), 0, 1.01, 0));
    g.add(rbox(0.19, 0.04, 0.08, 0.012, 0x25272d, 0, 0.02, 0));
    g.add(rbox(0.06, 0.2, 0.06, 0.018, 0x3f5260, 0, -0.08, 0));
  },
  /** Deadpool's firearms, holstered on his belt so both hands stay free for katanas. */
  holsters(rig, refs) {
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(s * 0.24, 0.62, 0.02);
      g.rotation.z = s * 0.12;
      g.add(rbox(0.08, 0.16, 0.1, 0.025, 0x24262b, 0, -0.04, 0.02));   // grip
      g.add(rbox(0.085, 0.09, 0.28, 0.02, 0x4a4e54, 0, 0.06, 0.12));    // slide
      rig.torso.add(g);
    }
  },
  /** Twin katanas, one in each hand: Deadpool's whole melee combo is dual-wielded. */
  katanaDual(rig) {
    for (const s of [-1, 1]) {
      const g = grip(rig, s);
      g.rotation.x = 0.95;
      g.add(mesh(new THREE.BoxGeometry(0.048, 0.8, 0.018), plastic(0xe6ecf2, { metalness: 0.65, roughness: 0.2 }), 0, 0.44, 0));
      g.add(rbox(0.05, 0.22, 0.05, 0.02, 0x1b1b1f, 0, -0.06, 0));
      g.add(rbox(0.13, 0.03, 0.065, 0.012, 0xc9a02a, 0, 0.06, 0));
    }
  },
  /** Loki: gold horned helmet, built from chunky LEGO-style segments. */
  horns(rig, refs) {
    const g = new THREE.Group();
    rig.head.add(g);
    // Fit the helmet to the head it is actually on, whatever the character's proportions
    const hm = rig.head.children.find(o => o.isMesh);
    let top = 0.56, halfW = 0.25;
    if (hm?.geometry) {
      hm.geometry.computeBoundingBox();
      const bb = hm.geometry.boundingBox;
      top = bb.max.y;
      halfW = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x));
    }
    const GM = plastic(0xd9b13b, { roughness: 0.3, metalness: 0.2, flatShading: true });
    const GD = plastic(0xb08d22, { roughness: 0.34, metalness: 0.15, flatShading: true });
    // Moulded dome + forehead rim, the way a LEGO helmet cap sits over the head
    const capY = top * 0.66;
    const cap = mesh(new THREE.SphereGeometry(halfW * 1.06, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), GM, 0, capY, 0);
    cap.scale.set(1, 0.9, 1);
    g.add(cap);
    g.add(cyl(halfW * 1.1, halfW * 1.12, top * 0.17, 0xb08d22, 0, capY, 0, 16));
    g.add(cyl(halfW * 1.14, halfW * 1.14, top * 0.06, 0xd9b13b, 0, capY + top * 0.07, 0, 16));
    for (const s of [-1, 1]) {
      // Horn: seven tapered pieces stepping out and hooking forward, faceted like moulded plastic
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(s * halfW * 0.72, capY + top * 0.05, 0),
        new THREE.Vector3(s * halfW * 1.22, capY + top * 0.16, -0.01),
        new THREE.Vector3(s * halfW * 1.58, capY + top * 0.34, 0.02),
        new THREE.Vector3(s * halfW * 1.56, capY + top * 0.58, 0.09),
        new THREE.Vector3(s * halfW * 1.34, capY + top * 0.76, 0.17),
        new THREE.Vector3(s * halfW * 1.08, capY + top * 0.86, 0.24),
      ]);
      const up = new THREE.Vector3(0, 1, 0), N = 7;
      for (let i = 0; i < N; i++) {
        const a = curve.getPoint(i / N), b = curve.getPoint((i + 1) / N);
        const seg = b.clone().sub(a);
        const r0 = 0.074 * (1 - (i / N) * 0.66), r1 = 0.074 * (1 - ((i + 1) / N) * 0.66);
        const piece = mesh(new THREE.CylinderGeometry(r1, r0, seg.length() * 1.18, 8), i % 2 ? GM : GD,
          (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        piece.quaternion.setFromUnitVectors(up, seg.normalize());
        g.add(piece);
      }
      const tip = mesh(new THREE.ConeGeometry(0.03, 0.12, 8), GD, s * halfW * 1.0, capY + top * 0.9, 0.26);
      tip.rotation.x = 0.5;
      g.add(tip);
    }
    refs.horns = g;
  },
  /** Loki's sceptre: chunky LEGO shaft, gold cradle, ice-blue gem. */
  staff(rig, refs) {
    const g = grip(rig, -1);
    g.add(cyl(0.036, 0.036, 1.46, 0xb08d22, 0, 0.31, 0, 10));            // shaft
    g.add(cyl(0.058, 0.058, 0.1, 0xd9b13b, 0, -0.41, 0, 10));             // pommel
    g.add(cyl(0.048, 0.048, 0.26, 0x24242a, 0, -0.16, 0, 10));            // grip wrap
    g.add(cyl(0.062, 0.062, 0.08, 0xd9b13b, 0, 1.0, 0, 10));              // collar
    g.add(rbox(0.22, 0.06, 0.13, 0.012, 0xd9b13b, 0, 1.05, 0));           // crystal cradle
    for (const s of [-1, 1]) {
      const prong = rbox(0.06, 0.22, 0.09, 0.012, 0xd9b13b, s * 0.1, 1.17, 0);
      prong.rotation.z = s * -0.12;
      g.add(prong);
    }
    const gem = mesh(new THREE.OctahedronGeometry(0.095, 0), emissive(0x7fe8ff), 0, 1.15, 0.02);
    gem.scale.set(0.55, 1.35, 0.42);
    g.add(gem);
    g.add(rbox(0.24, 0.05, 0.09, 0.012, 0xd9b13b, 0, 1.29, 0));            // cap over the crystal
    g.add(mesh(new THREE.ConeGeometry(0.045, 0.12, 8), plastic(0xb08d22), 0, 1.37, 0));
    refs.staff = g;
    refs.gems = [gem];
  },
  /** Thor's Mjolnir. */
  hammer(rig) {
    const g = grip(rig, -1);
    g.rotation.x = 0.7;
    g.add(cyl(0.036, 0.036, 0.62, 0x6b3a1f, 0, 0.02, 0, 10));
    g.add(rbox(0.36, 0.21, 0.22, 0.02, 0x9aa0a8, 0, 0.36, 0, { metalness: 0.55, roughness: 0.32 }));
    for (const s of [-1, 1]) g.add(rbox(0.04, 0.225, 0.235, 0.012, 0xb8bcc4, s * 0.18, 0.36, 0, { metalness: 0.55 }));
    g.add(rbox(0.38, 0.035, 0.24, 0.01, 0x2a2a30, 0, 0.25, 0));
    g.add(mesh(new THREE.TorusGeometry(0.055, 0.014, 6, 12), plastic(0x5a3a1a), 0, -0.2, 0));
  },
  /** Captain America's round shield, held on the left arm. */
  shield(rig, refs) {
    const g = new THREE.Group();
    g.position.set(0, -0.48, 0.2);
    const disc = (r, color, z, extra) => {
      const m = mesh(new THREE.CylinderGeometry(r, r, 0.055, 24), plastic(color, extra), 0, 0, z);
      m.rotation.x = Math.PI / 2;
      return m;
    };
    g.add(disc(0.42, 0xc4161c, 0));
    g.add(disc(0.34, 0xf2f2f4, 0.018));
    g.add(disc(0.25, 0xc4161c, 0.032));
    g.add(disc(0.15, 0x1f3f8a, 0.046));
    // Five-point star: a flattened cone reads as one at LEGO scale
    const star = mesh(new THREE.ConeGeometry(0.11, 0.02, 5), plastic(0xf2f2f4), 0, 0, 0.062);
    star.rotation.x = -Math.PI / 2;
    g.add(star);
    rig.arm[1].add(g);
    refs.shield = g;
  },
  /** Wolverine's claws - three per hand, always out. */
  claws(rig, refs) {
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const blade = mesh(new THREE.ConeGeometry(0.022, 0.4, 4), plastic(0xe8f4ff, { metalness: 0.7, roughness: 0.18, emissive: 0x223344 }), (i - 1) * 0.055, -0.62, 0.26);
        blade.rotation.x = Math.PI / 2;
        blade.rotation.z = (i - 1) * 0.06;
        rig.arm[s].add(blade);
      }
      const guard = rbox(0.17, 0.07, 0.08, 0.02, 0x8a8f96, 0, -0.58, 0.14);
      rig.arm[s].add(guard);
    }
  },
  /** Hawkeye's bow (left hand) and quiver (back). */
  bow(rig, refs) {
    const g = grip(rig, 1);
    g.rotation.x = -0.1;
    const arc = mesh(new THREE.TorusGeometry(0.38, 0.028, 8, 20, Math.PI), plastic(0x5a2a9d), 0, 0.02, 0.06);
    arc.rotation.z = -Math.PI / 2;
    g.add(arc);
    const string = mesh(new THREE.BoxGeometry(0.012, 0.74, 0.012), plastic(0xe8e8f0), 0.0, 0.02, 0.06);
    string.userData.base = 0.74;
    g.add(string);
    g.userData.string = string;
    refs.bow = g;
    // Quiver with arrows
    const q = new THREE.Group();
    q.position.set(0.16, 1.02, -0.22);
    q.rotation.z = -0.3;
    q.add(cyl(0.1, 0.09, 0.5, 0x4a2a6a, 0, 0, 0, 12));
    for (let i = 0; i < 3; i++) {
      q.add(cyl(0.012, 0.012, 0.24, 0xd8d8e0, (i - 1) * 0.045, 0.32, 0, 6));
      q.add(mesh(new THREE.ConeGeometry(0.03, 0.07, 4), plastic(0xc4161c), (i - 1) * 0.045, 0.46, 0));
    }
    rig.torso.add(q);
  },
  /** Black Widow's twin stun batons. */
  batons(rig, refs) {
    for (const s of [-1, 1]) {
      const g = grip(rig, s);
      g.rotation.x = -0.15;
      g.add(cyl(0.026, 0.026, 0.42, 0x2a2a30, 0, 0.16, 0, 10));
      const tip = mesh(new THREE.SphereGeometry(0.05, 10, 8), emissive(0xff3a6a), 0, 0.4, 0);
      g.add(tip);
      refs.gems.push(tip);
    }
  },
  /** Cyclops' ruby quartz visor. */
  visor(rig, refs) {
    const g = new THREE.Group();
    g.position.set(0, 0.36, 0.0);
    const band = rbox(0.4, 0.1, 0.1, 0.02, 0x2a2a30, 0, 0, 0.18);
    g.add(band);
    const lens = rbox(0.34, 0.075, 0.02, 0.01, 0xff3a2a, 0, 0, 0.235, { emissive: 0xff2a1a, emissiveIntensity: 1.8 });
    g.add(lens);
    for (const s of [-1, 1]) g.add(rbox(0.04, 0.09, 0.22, 0.012, 0x2a2a30, s * 0.21, 0, 0.08));
    rig.head.add(g);
    refs.visor = lens;
    refs.gems.push(lens);
  },
  /** Magneto's helmet: deep red dome with a silver brow bar. */
  helmet(rig, refs) {
    const g = new THREE.Group();
    rig.head.add(g);
    // phiStart + 0.85 centres the face opening on +Z, the way the minifig looks
    const dome = mesh(new THREE.SphereGeometry(0.28, 22, 14, Math.PI / 2 + 0.85, Math.PI * 2 - 1.7, 0, Math.PI * 0.74), plastic(0x8a1c2a, { side: THREE.DoubleSide }), 0, 0.24, 0);
    g.add(dome);
    g.add(cyl(0.29, 0.29, 0.06, 0x8a1c2a, 0, 0.2, 0, 20));
    for (const s of [-1, 1]) {
      const ear = rbox(0.06, 0.16, 0.16, 0.02, 0x9aa0a8, s * 0.27, 0.28, 0);
      g.add(ear);
    }
    const brow = rbox(0.42, 0.05, 0.1, 0.012, 0x9aa0a8, 0, 0.34, 0.21);
    g.add(brow);
    refs.helmet = g;
  },
  /** White cape for Storm. */
  capeWhite(rig, refs) {
    const g = new THREE.Group();
    const geo = new THREE.PlaneGeometry(1, 1, 6, 8);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), t = 0.5 - y;
      pos.setXYZ(i, x * (0.42 + t * 0.55), -t * 0.9, -Math.cos(x * Math.PI) * 0.05 * (0.4 + t));
    }
    geo.computeVertexNormals();
    const cloth = mesh(geo, plastic(0xf2f2f4, { side: THREE.DoubleSide, roughness: 0.5 }), 0, 0, 0);
    const pivot = new THREE.Group();
    pivot.position.set(0, 1.34, -0.16);
    pivot.add(cloth);
    g.add(pivot);
    rig.torso.add(g);
    refs.cape = pivot;
  },
  /** Human Torch: glowing hands and a flame aura. */
  flames(rig, refs) {
    for (const s of [-1, 1]) {
      const f = mesh(new THREE.SphereGeometry(0.13, 12, 10), emissive(0xff8a1a, { transparent: true, opacity: 0.75 }), 0, -0.55, 0.1);
      f.userData.ph = s * 2;
      rig.arm[s].add(f);
      refs.auras.push(f);
    }
    const aura = mesh(new THREE.SphereGeometry(0.5, 14, 10), emissive(0xff5a0a, { transparent: true, opacity: 0.22 }), 0, 1.0, 0);
    aura.scale.set(0.85, 1.15, 0.7);
    rig.torso.add(aura);
    refs.auras.push(aura);
  },
  /** Silver Surfer's board. */
  board(rig, refs) {
    const g = new THREE.Group();
    g.position.set(0, 0.0, 0);
    g.add(rbox(0.62, 0.05, 1.5, 0.02, 0xc8ccd4, 0, 0, 0, { metalness: 0.75, roughness: 0.22 }));
    g.add(rbox(0.7, 0.02, 0.9, 0.01, 0xe6f2ff, 0, 0.035, 0, { emissive: 0x9fd8ff, emissiveIntensity: 0.5 }));
    g.visible = false;
    rig.root.add(g);
    refs.board = g;
  },
  /** HYDRA rifle. */
  rifle(rig, refs) {
    const g = grip(rig, -1);
    g.rotation.x = -0.35;
    g.add(rbox(0.08, 0.13, 0.26, 0.02, 0x24262b, 0, -0.02, 0.04));
    g.add(rbox(0.06, 0.06, 0.5, 0.015, 0x3a3d44, 0, 0.06, 0.24));
    g.add(cyl(0.022, 0.022, 0.16, 0x6a6f78, 0, 0.06, 0.5, 8).rotateX(Math.PI / 2));
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.06, 0.58);
    g.add(muzzle);
    refs.muzzles[-1] = muzzle;
  },
  /** Web shooters and muzzle locators for Spider-Man family summons. */
  webshooters(rig, refs) {
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(0, -0.52, 0.08);
      g.add(rbox(0.22, 0.1, 0.15, 0.03, s < 0 ? 0xc4161c : 0x2766b0, 0, 0, 0));
      g.add(cyl(0.045, 0.045, 0.09, 0xeaf7ff, 0, 0, 0.1, 10).rotateX(Math.PI / 2));
      const muzzle = new THREE.Object3D();
      muzzle.position.set(0, 0, 0.17);
      g.add(muzzle); rig.arm[s].add(g); refs.muzzles[s] = muzzle;
    }
  },
  /** Twin blasters carried by Star-Lord and Howard the Duck. */
  pistols(rig, refs) {
    for (const s of [-1, 1]) {
      const g = grip(rig, s); g.rotation.x = -0.15;
      g.add(rbox(0.09, 0.16, 0.13, 0.02, 0x25272d, 0, -0.03, 0.02));
      g.add(rbox(0.09, 0.07, 0.27, 0.018, 0x555b63, 0, 0.06, 0.16));
      const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.06, 0.32); g.add(muzzle); refs.muzzles[s] = muzzle;
    }
  },
  /** Short blades for Elektra and Drax. */
  dualBlades(rig) {
    for (const s of [-1, 1]) {
      const g = grip(rig, s); g.rotation.x = 0.85;
      g.add(mesh(new THREE.BoxGeometry(0.045, 0.62, 0.025), plastic(0xd9dfe7, { metalness: 0.55, roughness: 0.24 }), 0, 0.35, 0));
      g.add(rbox(0.15, 0.035, 0.06, 0.01, 0x24242a, 0, 0.01, 0));
      g.add(rbox(0.05, 0.19, 0.05, 0.015, 0x28784b, 0, -0.08, 0));
    }
  },
  /** Kraven's hunting spear. */
  spear(rig) {
    const g = grip(rig, -1); g.rotation.x = 0.68;
    g.add(cyl(0.022, 0.022, 1.25, 0x765331, 0, 0.35, 0, 8));
    g.add(mesh(new THREE.ConeGeometry(0.065, 0.24, 5), plastic(0x9aa0a8, { metalness: 0.48 }), 0, 1.08, 0));
    g.add(rbox(0.14, 0.04, 0.06, 0.012, 0x765331, 0, 0.85, 0));
  },
  /** Thin knives carried by Bullseye and Blade. */
  knives(rig) {
    const back = new THREE.Group(); back.position.set(0.17, 0.98, -0.2); back.rotation.z = -0.22;
    for (let i = -1; i <= 1; i++) {
      const blade = mesh(new THREE.BoxGeometry(0.035, 0.46, 0.018), plastic(0xcbd2da, { metalness: 0.58 }), i * 0.08, 0.16, 0);
      blade.rotation.z = i * 0.12; back.add(blade);
    }
    rig.torso.add(back);
  },
  /** Charged gauntlets for Electro and Shocker. */
  shockGauntlets(rig, refs) {
    const color = rig.key === 'electro' ? 0x9ff7ff : 0xffe95c;
    for (const s of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(0, -0.5, 0.1);
      g.add(rbox(0.24, 0.15, 0.16, 0.04, 0x393d43, 0, 0, 0));
      const core = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.045, 12), emissive(color), 0, 0, 0.09);
      core.rotation.x = Math.PI / 2; g.add(core); rig.arm[s].add(g); refs.gems.push(core);
    }
  },
  /** Beetle's dorsal missile pods. */
  missilePack(rig) {
    const g = new THREE.Group(); g.position.set(0, 0.92, -0.18); rig.torso.add(g);
    for (const s of [-1, 1]) {
      const pod = new THREE.Group(); pod.position.x = s * 0.18; pod.rotation.x = Math.PI / 2;
      pod.add(cyl(0.07, 0.08, 0.42, 0x2c7752, 0, 0, 0, 8));
      pod.add(mesh(new THREE.ConeGeometry(0.055, 0.12, 6), plastic(0x9ae6b4), 0, -0.26, 0));
      g.add(pod);
    }
  },
  /** Crescent darts worn on Moon Knight's belt. */
  crescentDarts(rig) {
    const belt = new THREE.Group(); belt.position.set(0, 0.64, -0.08); rig.torso.add(belt);
    for (const s of [-1, 1]) {
      const dart = mesh(new THREE.TorusGeometry(0.1, 0.025, 5, 12, Math.PI), plastic(0xe6e8f0, { metalness: 0.42 }), s * 0.12, 0, 0);
      dart.rotation.z = s * 0.4; belt.add(dart);
    }
  },
  /** Ghost Rider's chain is wound around his striking hand. */
  chain(rig) {
    const g = grip(rig, -1); g.rotation.x = 0.3;
    const links = plastic(0x43464b, { metalness: 0.65, roughness: 0.28 });
    for (let i = 0; i < 7; i++) {
      const link = mesh(new THREE.TorusGeometry(0.035, 0.012, 4, 8), links, 0, 0.08 + i * 0.075, (i % 2) * 0.015);
      link.rotation.x = (i % 2) * 0.9; g.add(link);
    }
  },
  /** Green Goblin's extracted vehicle glider. */
  glider(rig, refs) {
    const g = new THREE.Group();
    g.name = 'GreenGoblinGlider';
    g.position.set(0, -0.72, 0);
    g.rotation.y = Math.PI;
    g.scale.setScalar(4.65);
    g.userData.baseY = g.position.y;
    g.userData.baseYaw = g.rotation.y;
    g.visible = false;
    rig.root.add(g);
    refs.board = g;
    refs.jetGroups.push(g);
    goblinGliderPromise ??= gltfLoader.loadAsync(new URL('../assets/models/vehicles/goblin_glider.glb', import.meta.url).href);
    goblinGliderPromise.then(gltf => {
      const model = SkeletonUtils.clone(gltf.scene);
      model.name = 'SourceGoblinGliderModel';
      model.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
      g.add(model);
    }).catch(err => {
      console.warn('[CharacterGear] source Goblin glider failed to load:', err?.message ?? err);
      const body = mesh(new THREE.ConeGeometry(0.17, 0.54, 6), plastic(0x3a6a2a), 0, 0, 0);
      body.rotation.x = Math.PI / 2; g.add(body);
      for (const s of [-1, 1]) {
        const wing = mesh(new THREE.BoxGeometry(0.34, 0.035, 0.16), plastic(0x6f3b83), s * 0.16, 0.03, 0);
        wing.rotation.z = -s * 0.16; g.add(wing);
      }
    });
    for (const s of [-1, 1]) {
      const flame = mesh(new THREE.ConeGeometry(0.027, 0.15, 7), emissive(0xff7a00, { transparent: true, opacity: 0.85 }), s * 0.04, -0.04, -0.17);
      flame.rotation.x = Math.PI;
      flame.userData.ph = s * 1.8;
      g.add(flame);
      refs.jets.push(flame);
    }
  },
};

/** Add every weapon in `kit.weapons` to the rig. Returns animation refs. */
export function attachKit(rig, kit = {}) {
  const refs = { repulsors: [], jets: [], jetGroups: [], muzzles: {}, gems: [], auras: [], board: null, bow: null, cape: null, staff: null, horns: null, shield: null, visor: null, helmet: null };
  for (const id of kit.weapons ?? []) BUILDERS[id]?.(rig, refs);
  rig.weaponRefs = refs;
  return refs;
}

/** Per-frame life for the equipment (jets, spinning board, glowing gems, aura flicker). */
export function animateKit(rig, t, s = {}) {
  const r = rig.weaponRefs;
  if (!r) return;
  for (const g of r.jetGroups ?? []) g.visible = !!s.flight;
  for (const j of r.jets ?? []) {
    if (!g_visible(j)) continue;
    const k = 0.75 + Math.sin(t * 38 + (j.userData.ph ?? 0)) * 0.22;
    j.scale.set(k, 1.0 + Math.sin(t * 27 + (j.userData.ph ?? 0)) * 0.18, k);
  }
  if (r.board) {
    r.board.visible = !!s.flight;
    if (s.flight) {
      r.board.position.y = (r.board.userData.baseY ?? 0) + Math.sin(t * 2.2) * 0.06;
      r.board.rotation.z = Math.sin(t * 1.3) * 0.06;
      r.board.rotation.y = (r.board.userData.baseYaw ?? 0) + Math.sin(t * 0.6) * 0.08;
    }
  }
  for (const a of r.auras) {
    a.material.emissiveIntensity = 1.2 + Math.sin(t * 9 + (a.userData.ph ?? 0)) * 0.45;
  }
  for (const g of r.gems) {
    g.material.emissiveIntensity = 1.2 + Math.sin(t * 5.5) * 0.5;
  }
  if (r.bow?.userData.string) {
    const str = r.bow.userData.string;
    const draw = s.attack > 0 ? 0.45 : 1;
    str.scale.y = draw;
    str.position.x = s.attack > 0 ? -0.16 : 0;
  }
  if (r.cape) r.cape.rotation.x = 0.1 + Math.min((s.speed ?? 0) / 16, 1) * 0.65 + Math.sin(t * 5) * 0.05;
  if (r.repulsors.length && s.attack > 0.5) {
    for (const c of r.repulsors) c.material.emissiveIntensity = 2.6;
  } else {
    for (const c of r.repulsors) c.material.emissiveIntensity = 1.2;
  }
}

const g_visible = o => o.parent && o.parent.visible !== false;
