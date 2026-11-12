/**
 * Tendril.js — living symbiote strands. A tapered, glossy-black tube that writhes along its length,
 * bulges in places and splits into a three-pronged grip at the far end. One mesh per tendril, vertices
 * rewritten in place every frame (no reallocations).
 *
 *   const t = new Tendril(scene, { radius: 0.09 });
 *   t.set(from, to, { time, sag, wobble, reach });   // reach 0..1 = how far it has shot out
 *   t.visible = false;
 */
import * as THREE from 'three';

const RINGS = 28, SIDES = 7, CLAWS = 3, CLAW_RINGS = 6;

export const symbioteMaterial = () => new THREE.MeshPhysicalMaterial({
  color: 0x0b0b12, roughness: 0.18, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.12,
  sheen: 0.6, sheenColor: new THREE.Color(0x3a4a8a), sheenRoughness: 0.4, emissive: 0x04040a,
});

export class Tendril {
  constructor(scene, { radius = 0.08, material } = {}) {
    this.radius = radius;
    this.mat = material ?? symbioteMaterial();
    // Main strand + three claw prongs, all in one geometry
    const strands = 1 + CLAWS;
    const ringsTotal = RINGS + CLAWS * CLAW_RINGS;
    const pos = new Float32Array(ringsTotal * SIDES * 3);
    const idx = [];
    let base = 0;
    for (let s = 0; s < strands; s++) {
      const rings = s === 0 ? RINGS : CLAW_RINGS;
      for (let r = 0; r < rings - 1; r++) for (let k = 0; k < SIDES; k++) {
        const a = base + r * SIDES + k, b = base + r * SIDES + (k + 1) % SIDES, c = a + SIDES, d = b + SIDES;
        idx.push(a, c, b, b, c, d);
      }
      base += rings * SIDES;
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this._p = Array.from({ length: RINGS }, () => new THREE.Vector3());
    this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  }

  get visible() { return this.mesh.visible; }
  set visible(v) { this.mesh.visible = v; }

  dispose() { this.mesh.parent?.remove(this.mesh); this.geo.dispose(); }

  /** Lay the tendril from `a` to `b`. */
  set(a, b, { time = 0, sag = 0, wobble = 1, reach = 1, thick = 1, claws = true } = {}) {
    const [dir, side, up, tmp, n] = this._v;
    const end = tmp.copy(a).lerp(b, reach);
    dir.subVectors(end, a);
    const L = dir.length() || 1e-4;
    dir.divideScalar(L);
    side.crossVectors(dir, Math.abs(dir.y) > 0.95 ? n.set(1, 0, 0) : n.set(0, 1, 0)).normalize();
    up.crossVectors(side, dir).normalize();
    const amp = Math.min(0.35, L * 0.04) * wobble;
    // Centre line: sag, plus two travelling waves so it writhes instead of swinging rigidly
    for (let i = 0; i < RINGS; i++) {
      const t = i / (RINGS - 1), env = Math.sin(t * Math.PI);
      const w1 = Math.sin(t * 9 - time * 11) * amp * env, w2 = Math.cos(t * 6.5 - time * 7.3) * amp * 0.7 * env;
      this._p[i].copy(a).lerp(end, t).addScaledVector(side, w1).addScaledVector(up, w2);
      this._p[i].y -= sag * reach * 4 * t * (1 - t);
    }
    const pos = this.geo.attributes.position.array;
    let o = 0;
    const ring = (c, d, r) => {
      // frame around tangent d
      side.crossVectors(d, Math.abs(d.y) > 0.95 ? n.set(1, 0, 0) : n.set(0, 1, 0)).normalize();
      up.crossVectors(side, d).normalize();
      for (let k = 0; k < SIDES; k++) {
        const ang = (k / SIDES) * Math.PI * 2, cs = Math.cos(ang) * r, sn = Math.sin(ang) * r;
        pos[o++] = c.x + side.x * cs + up.x * sn;
        pos[o++] = c.y + side.y * cs + up.y * sn;
        pos[o++] = c.z + side.z * cs + up.z * sn;
      }
    };
    const R = this.radius * thick;
    for (let i = 0; i < RINGS; i++) {
      const t = i / (RINGS - 1);
      const d = tmp.subVectors(this._p[Math.min(RINGS - 1, i + 1)], this._p[Math.max(0, i - 1)]).normalize();
      // Thick at the root, thin towards the tip, with a few muscular bulges that slide along
      const bulge = 1 + 0.28 * Math.max(0, Math.sin(t * 14 - time * 6));
      ring(this._p[i], d.clone(), R * (1.25 - 0.75 * t) * bulge);
    }
    // Claw prongs splay out of the tip
    const tip = this._p[RINGS - 1];
    const tdir = tmp.subVectors(tip, this._p[RINGS - 3]).normalize().clone();
    side.crossVectors(tdir, Math.abs(tdir.y) > 0.95 ? n.set(1, 0, 0) : n.set(0, 1, 0)).normalize();
    up.crossVectors(side, tdir).normalize();
    const s0 = side.clone(), u0 = up.clone();
    const len = claws ? Math.min(0.55, 0.12 + L * 0.03) * thick : 0.001;
    for (let c = 0; c < CLAWS; c++) {
      const ang = (c / CLAWS) * Math.PI * 2 + time * 0.8;
      const out = s0.clone().multiplyScalar(Math.cos(ang)).addScaledVector(u0, Math.sin(ang));
      const p = new THREE.Vector3(), prev = tip.clone();
      for (let r = 0; r < CLAW_RINGS; r++) {
        const t = r / (CLAW_RINGS - 1);
        // curl: out, then hook back in
        p.copy(tip).addScaledVector(tdir, len * t).addScaledVector(out, len * 0.7 * Math.sin(t * 2.2));
        const d = p.clone().sub(prev); if (d.lengthSq() < 1e-8) d.copy(tdir); d.normalize();
        ring(p, d, R * 0.5 * (1 - t * 0.9));
        prev.copy(p);
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}
