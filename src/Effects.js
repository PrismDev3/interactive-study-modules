/**
 * Effects.js — chunky LEGO-pixel particles (tiny cubes) for villain powers: sand, goo, magic,
 * sparks, flame. One InstancedMesh holds every particle, so effects cost a single draw call.
 */
import * as THREE from 'three';

const MAX = 2500;
const dummy = new THREE.Object3D();
const col = new THREE.Color();

export class Effects {
  constructor(scene) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0 });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, col.set(0xffffff));
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.p = [];
  }

  /**
   * Spawn one particle. o: { pos, vel, life, size, color, gravity, drag, glow,
   *   swirl: { center, speed, pull, lift } } (swirl orbits a moving centre, like a tornado)
   */
  add(o) {
    if (this.p.length >= MAX) this.p.shift();
    this.p.push({
      pos: o.pos.clone(), vel: o.vel?.clone() ?? new THREE.Vector3(), life: o.life ?? 1, max: o.life ?? 1,
      size: o.size ?? 0.12, color: o.color ?? 0xffffff, gravity: o.gravity ?? 0, drag: o.drag ?? 0,
      glow: o.glow ?? 0, swirl: o.swirl ?? null, spin: Math.random() * 6, ground: o.ground ?? -Infinity,
    });
  }

  /** `n` particles flung out from `pos`. */
  burst(pos, { n = 20, color = 0xffffff, speed = 6, up = 4, life = 0.8, size = 0.14, gravity = 14, spread = 1, ground, colors } = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
      this.add({
        pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread * 0.5, (Math.random() - 0.5) * spread)),
        vel: new THREE.Vector3(Math.cos(a) * s, up * (0.5 + Math.random()), Math.sin(a) * s),
        life: life * (0.6 + Math.random() * 0.6), size: size * (0.6 + Math.random() * 0.8),
        color: colors ? colors[(Math.random() * colors.length) | 0] : color, gravity, drag: 1.5, ground,
      });
    }
  }

  /** Ring of particles racing outward along the ground (shockwaves). */
  ring(pos, { n = 40, color = 0xffffff, speed = 9, life = 0.6, size = 0.16, colors } = {}) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.add({
        pos: pos.clone().add(new THREE.Vector3(Math.cos(a) * 0.5, 0.1, Math.sin(a) * 0.5)),
        vel: new THREE.Vector3(Math.cos(a) * speed, 1.5 + Math.random() * 2, Math.sin(a) * speed),
        life, size: size * (0.7 + Math.random() * 0.6), gravity: 8, drag: 2.2,
        color: colors ? colors[(Math.random() * colors.length) | 0] : color,
      });
    }
  }

  update(dt) {
    const out = [];
    let i = 0;
    for (const q of this.p) {
      q.life -= dt;
      if (q.life <= 0) continue;
      if (q.swirl) {
        const s = q.swirl, c = s.center;
        const dx = q.pos.x - c.x, dz = q.pos.z - c.z, r = Math.hypot(dx, dz) || 0.01;
        const a = Math.atan2(dz, dx) + s.speed * dt, nr = Math.max(0.2, r + (s.pull ?? 0) * dt);
        q.pos.x = c.x + Math.cos(a) * nr; q.pos.z = c.z + Math.sin(a) * nr;
        q.pos.y += (s.lift ?? 0) * dt;
      }
      q.vel.y -= q.gravity * dt;
      if (q.drag) q.vel.multiplyScalar(Math.exp(-q.drag * dt));
      q.pos.addScaledVector(q.vel, dt);
      if (q.pos.y < q.ground) { q.pos.y = q.ground; q.vel.set(q.vel.x * 0.4, 0, q.vel.z * 0.4); }
      q.spin += dt * 4;
      const k = q.life / q.max, s = q.size * Math.min(1, k * 3);
      dummy.position.copy(q.pos);
      dummy.rotation.set(q.spin, q.spin * 0.7, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
      col.set(q.color);
      if (q.glow) col.multiplyScalar(1 + q.glow);
      this.mesh.setColorAt(i, col);
      out.push(q);
      i++;
    }
    this.p = out;
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
