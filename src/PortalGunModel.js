/**
 * PortalGunModel.js — the chunky LEGO portal gun carried in the player's right hand.
 *
 * Built from a handful of reused primitives instead of an external GLB: grey brick body,
 * three green emitter lenses, a clear fluid tube with a spinning green core, a black dial,
 * pistol grip and trigger. One model is created per player and animated in place, so there
 * is no per-shot geometry allocation.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const plastic = (color, extra = {}) => new THREE.MeshStandardMaterial({
  color, roughness: 0.34, metalness: 0, ...extra,
});
const glow = (color, extra = {}) => new THREE.MeshStandardMaterial({
  color, emissive: color, emissiveIntensity: 1.7, roughness: 0.24, ...extra,
});

function box(parent, w, h, d, radius, mat, x, y, z) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, radius), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function cyl(parent, r, h, mat, x, y, z, seg = 14) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export function buildPortalGunModel() {
  const root = new THREE.Group();
  root.name = 'PortalGun';

  const grey = plastic(0xc8ced8);
  const pale = plastic(0xaeb7c5);
  const dark = plastic(0x2d333d);
  const black = plastic(0x171a20);
  const green = glow(0x70ff3b);
  const glass = plastic(0xdff4ff, { transparent: true, opacity: 0.3, roughness: 0.06, metalness: 0.05, depthWrite: false });
  const lensMat = glow(0x7dff45);

  // Main brick body
  box(root, 0.43, 0.25, 0.62, 0.055, grey, 0, 0.02, 0.06);
  box(root, 0.36, 0.028, 0.47, 0.012, pale, 0, 0.155, 0.05);
  box(root, 0.012, 0.16, 0.34, 0.005, pale, -0.218, 0.02, 0.08);
  box(root, 0.012, 0.16, 0.34, 0.005, pale, 0.218, 0.02, 0.08);

  // Pistol grip and trigger
  const grip = box(root, 0.12, 0.27, 0.14, 0.04, dark, 0, -0.23, -0.12);
  grip.rotation.x = -0.12;
  box(root, 0.05, 0.035, 0.12, 0.01, black, 0, -0.13, -0.025);

  // Dark muzzle housing with three round green emitters
  box(root, 0.45, 0.28, 0.08, 0.025, dark, 0, 0.02, 0.39);
  box(root, 0.35, 0.18, 0.022, 0.008, black, 0, 0.02, 0.434);
  const lenses = [];
  for (const x of [-0.13, 0, 0.13]) {
    const lens = cyl(root, 0.073, 0.026, lensMat, x, 0.02, 0.451, 18);
    lens.rotation.x = Math.PI / 2;
    lenses.push(lens);
  }

  // Fluid tube assembly
  cyl(root, 0.145, 0.045, pale, 0, 0.185, 0.06, 18);
  const tube = cyl(root, 0.11, 0.29, glass, 0, 0.345, 0.06, 18);
  tube.castShadow = false;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.112, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    glass,
  );
  dome.position.set(0, 0.49, 0.06);
  dome.castShadow = false;
  root.add(dome);
  cyl(root, 0.12, 0.025, pale, 0, 0.49, 0.06, 18);

  // Spinning green energy core inside the clear tube
  const core = new THREE.Group();
  core.position.set(0, 0.345, 0.06);
  core.add(cyl(core, 0.052, 0.23, green, 0, 0, 0, 12));
  for (const a of [0, Math.PI / 3, -Math.PI / 3]) {
    const bar = box(core, 0.035, 0.19, 0.035, 0.012, green, 0, 0, 0);
    bar.rotation.z = a;
  }
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 10), green);
  tip.position.set(0, -0.16, 0);
  tip.rotation.z = Math.PI;
  core.add(tip);
  root.add(core);

  // Black dial at the back-left and a small status stud
  box(root, 0.17, 0.075, 0.13, 0.025, black, -0.08, 0.19, -0.17);
  cyl(root, 0.045, 0.03, dark, 0.15, 0.185, -0.17, 12);
  cyl(root, 0.026, 0.032, green, 0.15, 0.202, -0.17, 12);

  // Muzzle flash reuses one material and one mesh; it is only switched on for a few frames.
  const flash = new THREE.Mesh(
    new THREE.CircleGeometry(0.15, 18),
    new THREE.MeshBasicMaterial({ color: 0x7dff45, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  flash.position.set(0, 0.02, 0.47);
  flash.rotation.x = 0;
  flash.visible = false;
  flash.renderOrder = 6;
  root.add(flash);

  root.userData = {
    refs: { lenses, lensMat, core, flash, green, tube, dome },
    recoil: 0,
    flashT: 0,
    phase: Math.random() * 6,
  };
  return root;
}

export function animatePortalGunModel(root, t, dt) {
  const u = root.userData;
  u.recoil = Math.max(0, u.recoil - dt * 13);
  root.position.z = -u.recoil * 0.075;
  const refs = u.refs;
  refs.core.rotation.y += dt * 2.2;
  refs.core.rotation.z = Math.sin(t * 1.7 + u.phase) * 0.18;
  refs.lensMat.emissiveIntensity = 1.55 + Math.sin(t * 5 + u.phase) * 0.28;
  refs.green.emissiveIntensity = 1.55 + Math.sin(t * 4.2 + u.phase) * 0.22;
  if (u.flashT > 0) {
    u.flashT -= dt;
    refs.flash.visible = true;
    refs.flash.scale.setScalar(0.8 + Math.max(0, u.flashT) * 8);
  } else {
    refs.flash.visible = false;
  }
}

export function kickPortalGunModel(root, color = 0x7dff45) {
  if (!root) return;
  root.userData.recoil = 1;
  root.userData.flashT = 0.08;
  const f = root.userData.refs.flash;
  f.material.color.setHex(color);
  f.visible = true;
}
