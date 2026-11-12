/**
 * HeroRig.js — jointed web-suit hero built from primitives, animated procedurally.
 * Rig space: feet at y=0, facing +z. Pivots are Groups so rotations bend at the joint.
 */
import * as THREE from 'three';

const damp = (cur, target, k) => cur + (target - cur) * k;

function webTexture(base, line) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = line;
  g.lineWidth = 2;
  const cx = 128, cy = 128;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.beginPath(); g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * 200, cy + Math.sin(a) * 200); g.stroke();
  }
  for (let r = 16; r < 200; r += 18) {
    g.beginPath();
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const rr = r * (i % 2 ? 0.93 : 1); // sagging strands between spokes
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export class HeroRig {
  constructor() {
    const webTex = webTexture('#b3101c', '#3a0408');
    const red   = new THREE.MeshStandardMaterial({ map: webTex, roughness: 0.55, metalness: 0.05 });
    const blue  = new THREE.MeshStandardMaterial({ color: 0x1c3a9e, roughness: 0.6, metalness: 0.05 });
    const black = new THREE.MeshStandardMaterial({ color: 0x0b0b0f, roughness: 0.4 });
    const lens  = new THREE.MeshStandardMaterial({ color: 0xf4f7ff, emissive: 0x9fb4ff, emissiveIntensity: 0.25, roughness: 0.2 });

    this.root = new THREE.Group();
    this.root.position.y = -0.5; // controller keeps its origin 0.5 m above the ground
    const add = (parent, geo, mat, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const joint = (parent, x, y, z) => {
      const j = new THREE.Group();
      j.position.set(x, y, z);
      parent.add(j);
      return j;
    };

    // ── Torso ────────────────────────────────────────────────────────
    this.hips = joint(this.root, 0, 0.98, 0);
    add(this.hips, new THREE.CapsuleGeometry(0.15, 0.1, 4, 12), blue, 0, 0.02, 0).scale.set(1.15, 1, 0.8);
    add(this.hips, new THREE.TorusGeometry(0.15, 0.025, 6, 20), red, 0, 0.1, 0).rotation.x = Math.PI / 2; // belt

    this.spine = joint(this.hips, 0, 0.1, 0);
    const chest = add(this.spine, new THREE.CapsuleGeometry(0.17, 0.3, 4, 14), red, 0, 0.28, 0);
    chest.scale.set(1.15, 1, 0.78);
    // Blue side panels
    for (const s of [-1, 1]) add(this.spine, new THREE.CapsuleGeometry(0.06, 0.28, 4, 8), blue, s * 0.17, 0.24, 0);
    this._emblem(this.spine, black);

    // ── Head ─────────────────────────────────────────────────────────
    this.neck = joint(this.spine, 0, 0.56, 0);
    add(this.neck, new THREE.CylinderGeometry(0.055, 0.065, 0.1, 10), red, 0, 0.04, 0);
    const head = add(this.neck, new THREE.SphereGeometry(0.115, 20, 16), red, 0, 0.17, 0.01);
    head.scale.set(0.95, 1.15, 1.0);
    for (const s of [-1, 1]) {
      const rim = add(this.neck, new THREE.SphereGeometry(0.05, 14, 10), black, s * 0.048, 0.19, 0.095);
      rim.scale.set(1.0, 0.72, 0.35);
      rim.rotation.z = s * -0.45;
      const eye = add(this.neck, new THREE.SphereGeometry(0.042, 14, 10), lens, s * 0.048, 0.19, 0.103);
      eye.scale.set(1.0, 0.68, 0.3);
      eye.rotation.z = s * -0.45;
    }

    // ── Arms ─────────────────────────────────────────────────────────
    this.shoulder = {}; this.elbow = {};
    for (const s of [-1, 1]) {
      const sh = joint(this.spine, s * 0.25, 0.46, 0);
      add(sh, new THREE.SphereGeometry(0.075, 10, 8), red, 0, 0, 0);
      add(sh, new THREE.CapsuleGeometry(0.058, 0.2, 4, 10), red, 0, -0.15, 0);
      const el = joint(sh, 0, -0.3, 0);
      add(el, new THREE.CapsuleGeometry(0.05, 0.19, 4, 10), blue, 0, -0.13, 0);
      add(el, new THREE.CylinderGeometry(0.045, 0.045, 0.05, 10), black, 0, -0.22, 0); // shooter
      add(el, new THREE.SphereGeometry(0.052, 10, 8), red, 0, -0.29, 0.005).scale.set(0.9, 1.1, 0.7);
      this.shoulder[s] = sh; this.elbow[s] = el;
    }

    // ── Legs ─────────────────────────────────────────────────────────
    this.thigh = {}; this.knee = {};
    for (const s of [-1, 1]) {
      const th = joint(this.hips, s * 0.1, -0.02, 0);
      add(th, new THREE.CapsuleGeometry(0.078, 0.3, 4, 10), blue, 0, -0.22, 0);
      const kn = joint(th, 0, -0.45, 0);
      add(kn, new THREE.CapsuleGeometry(0.062, 0.3, 4, 10), red, 0, -0.21, 0);
      const foot = add(kn, new THREE.BoxGeometry(0.1, 0.07, 0.22), red, 0, -0.47, 0.05);
      foot.geometry.translate(0, 0, 0);
      this.thigh[s] = th; this.knee[s] = kn;
    }

    this.t = 0;
    this.phase = 0;
    this.climbPhase = 0;
  }

  _emblem(parent, mat) {
    const g = new THREE.Group();
    g.position.set(0, 0.36, 0.135);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), mat);
    body.scale.set(0.8, 1.4, 0.4);
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), mat);
    head.position.y = 0.045;
    g.add(head);
    const legGeo = new THREE.BoxGeometry(0.008, 0.075, 0.006);
    for (const s of [-1, 1]) {
      [0.7, 0.25, -0.25, -0.7].forEach((a, i) => {
        const leg = new THREE.Mesh(legGeo, mat);
        leg.position.set(s * 0.035, 0.01 - i * 0.012, 0);
        leg.rotation.z = s * (Math.PI / 2 - a);
        g.add(leg);
      });
    }
    parent.add(g);
  }

  /**
   * @param {number} dt
   * @param {{speed:number, sprint:boolean, grounded:boolean, crouch:boolean,
   *          climbing:boolean, climbMove:number, swinging:boolean, vy:number}} s
   */
  update(dt, s) {
    this.t += dt;
    const k = 1 - Math.exp(-14 * dt);
    const P = {
      hipsY: 0, hipsX: 0, spineX: 0.02, spineZ: 0, neckX: 0,
      sh: { [-1]: [0, -0.12], [1]: [0, 0.12] },  // [x, z]
      el: { [-1]: -0.15, [1]: -0.15 },
      th: { [-1]: [0, -0.03], [1]: [0, 0.03] },
      kn: { [-1]: 0.05, [1]: 0.05 },
    };

    if (s.swinging) {
      // Reach with the selected web arm, or bring both hands together on one shared strand.
      const webSide = s.webArm ?? -1, freeSide = -webSide;
      P.spineX = -0.25 + Math.sin(this.t * 3) * 0.04;
      P.sh[webSide] = [-2.35, -webSide * 0.18]; P.el[webSide] = -0.05;
      if (s.twoHandGrip) {
        for (const side of [-1, 1]) {
          P.sh[side] = [-2.35, -side * 0.18]; P.el[side] = -0.05;
          P.th[side] = [-0.65, side * 0.14]; P.kn[side] = 0.8;
        }
      } else {
        P.sh[freeSide] = [-0.4, freeSide * 1.1]; P.el[freeSide] = -0.9;
        P.th[-1] = [-0.9, -0.15]; P.kn[-1] = 1.5;
        P.th[1]  = [-0.3, 0.1];   P.kn[1]  = 0.5;
      }
      P.neckX = -0.3;
    } else if (s.climbing) {
      this.climbPhase += dt * 7 * s.climbMove;
      const c = Math.sin(this.climbPhase);
      P.spineX = 0.25; P.neckX = -0.6; P.hipsX = 0.15;
      P.sh[-1] = [-2.3 + c * 0.6, -0.5]; P.el[-1] = -1.1 - c * 0.4;
      P.sh[1]  = [-2.3 - c * 0.6, 0.5];  P.el[1]  = -1.1 + c * 0.4;
      P.th[-1] = [-1.0 - c * 0.45, -0.55]; P.kn[-1] = 1.6 + c * 0.3;
      P.th[1]  = [-1.0 + c * 0.45, 0.55];  P.kn[1]  = 1.6 - c * 0.3;
    } else if (!s.grounded) {
      if (s.vy > 0) {
        // Rising: tuck one leg, arms reaching up
        P.spineX = 0.15;
        P.sh[-1] = [-1.2, -0.6]; P.sh[1] = [-1.6, 0.6];
        P.el[-1] = -0.6; P.el[1] = -0.4;
        P.th[-1] = [-1.1, -0.1]; P.kn[-1] = 1.7;
        P.th[1]  = [-0.2, 0.1];  P.kn[1]  = 0.6;
      } else {
        // Falling: spread-eagle with a little flail
        const f = Math.sin(this.t * 9) * 0.12;
        P.spineX = -0.1;
        P.sh[-1] = [-0.3 + f, -1.4]; P.sh[1] = [-0.3 - f, 1.4];
        P.el[-1] = -0.5; P.el[1] = -0.5;
        P.th[-1] = [-0.4 - f, -0.35]; P.kn[-1] = 0.9;
        P.th[1]  = [-0.1 + f, 0.35];  P.kn[1]  = 0.5;
      }
    } else if (s.crouch) {
      this.phase += dt * s.speed * 1.6;
      const w = s.speed > 0.3 ? Math.sin(this.phase) * 0.35 : 0;
      P.hipsY = -0.38; P.spineX = 0.6; P.neckX = -0.55;
      P.th[-1] = [-1.25 + w, -0.25]; P.kn[-1] = 2.1;
      P.th[1]  = [-1.25 - w, 0.25];  P.kn[1]  = 2.1;
      P.sh[1]  = [-1.0, 0.2]; P.el[1] = -0.2;   // hand planted forward
      P.sh[-1] = [-0.5, -0.5]; P.el[-1] = -1.2;
    } else if (s.speed > 0.4) {
      const run = Math.min(s.speed / 18, 1);
      this.phase += dt * (5.5 + run * 6.5);
      const p = this.phase;
      const A = 0.45 + run * 0.5;
      P.hipsY = -Math.abs(Math.sin(p)) * (0.03 + run * 0.06);
      P.spineX = 0.08 + run * 0.32;
      P.spineZ = Math.sin(p) * 0.04;
      P.neckX = -P.spineX * 0.7;
      for (const sd of [-1, 1]) {
        const ph = p + (sd > 0 ? Math.PI : 0);
        P.th[sd] = [-Math.sin(ph) * A, sd * 0.03];
        P.kn[sd] = 0.15 + Math.max(0, Math.cos(ph)) * (0.7 + run * 0.9);
        P.sh[sd] = [Math.sin(ph) * A * 0.9, sd * (0.1 + run * 0.08)];
        P.el[sd] = -0.35 - run * 1.0;
      }
    } else {
      // Idle breathing and weight shift
      const b = Math.sin(this.t * 1.6);
      P.spineX = 0.02 + b * 0.025;
      P.hipsY = b * 0.008;
      P.spineZ = Math.sin(this.t * 0.5) * 0.02;
      P.sh[-1] = [0.05, -0.14 - b * 0.02]; P.sh[1] = [0.05, 0.14 + b * 0.02];
      P.el[-1] = -0.2; P.el[1] = -0.2;
    }

    // Blend joints toward the pose
    this.hips.position.y = damp(this.hips.position.y, 0.98 + P.hipsY, k);
    this.hips.rotation.x = damp(this.hips.rotation.x, P.hipsX, k);
    this.spine.rotation.x = damp(this.spine.rotation.x, P.spineX, k);
    this.spine.rotation.z = damp(this.spine.rotation.z, P.spineZ, k);
    this.neck.rotation.x = damp(this.neck.rotation.x, P.neckX, k);
    for (const sd of [-1, 1]) {
      this.shoulder[sd].rotation.x = damp(this.shoulder[sd].rotation.x, P.sh[sd][0], k);
      this.shoulder[sd].rotation.z = damp(this.shoulder[sd].rotation.z, P.sh[sd][1], k);
      this.elbow[sd].rotation.x    = damp(this.elbow[sd].rotation.x, P.el[sd], k);
      this.thigh[sd].rotation.x    = damp(this.thigh[sd].rotation.x, P.th[sd][0], k);
      this.thigh[sd].rotation.z    = damp(this.thigh[sd].rotation.z, P.th[sd][1], k);
      this.knee[sd].rotation.x     = damp(this.knee[sd].rotation.x, P.kn[sd], k);
    }
  }
}
