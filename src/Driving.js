/**
 * Drivable street cars. Walk up to any CityLife car and press H to get in; H again to get out.
 * W/S (or arrows) throttle and brake/reverse, A/D steer, Space handbrake.
 * Arcade model: speed along the heading, steering scaled by speed, ground snap and wall bumps by
 * raycasting the city meshes. The hero is hidden and pinned to the car so the normal camera follows.
 */
import * as THREE from 'three';
import { busy } from './Input.js?v=2';

const ENTER_R = 4.5, MAX_FWD = 26, MAX_REV = 8, ACCEL = 14, BRAKE = 28, DRAG = 0.6, STEER = 2.1;
const down = new THREE.Vector3(0, -1, 0), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _b = new THREE.Vector3();

export class Driving {
  constructor({ controller, life, hud }) {
    Object.assign(this, { controller, life, hud });
    this.car = null; this.speed = 0; this.keys = {};
    this.ray = new THREE.Raycaster(); this.ray.firstHitOnly = true;
    addEventListener('keydown', e => {
      if (busy(e)) return;
      this.keys[e.code] = true;
      if (e.code === 'KeyH' && !e.repeat) this.car ? this.exit() : this.enter();
    });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
  }

  nearest() {
    const p = this.controller.root.position;
    let best = null, bd = ENTER_R * ENTER_R;
    for (const c of this.life.cars) {
      if (!c.active || !c.mesh.visible) continue;
      const d = c.mesh.position.distanceToSquared(p);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  enter() {
    const c = this.nearest();
    if (!c || this.controller.inputLocked) return;
    this.car = c; c.driven = true; this.speed = 0; this.steer = 0; this.lean = 0;
    this.heading = Math.atan2(c.dir[0], c.dir[1]);
    this.controller.inputLocked = true;
    this.jackT = this.life.carjack?.(c) ?? 0;   // drag the driver out first
    this.jackLen = this.jackT;
    this.jackFrom = this.controller.root.position.clone();
    this._vis = this.controller.root.children.map(o => o.visible);
    this.hud?.toast?.('DRIVING · H to get out');
  }

  exit() {
    const c = this.car; if (!c) return;
    c.driven = false; c.speed = 0; c.parked = true; this.car = null;
    const ctl = this.controller, m = c.mesh;
    // Step out on the driver's side, or the passenger side if a wall is there
    _o.copy(m.position).y += 1;
    let side = 1;
    _d.set(Math.cos(this.heading), 0, -Math.sin(this.heading));
    if (this._cast(_o, _d, 3)) { side = -1; _d.negate(); if (this._cast(_o, _d, 3)) side = 0; }
    ctl.root.position.copy(m.position).addScaledVector(_d, side ? 2.4 : 0);
    ctl.root.position.y += side ? 1 : 2.6;   // no room either side: climb out onto the roof
    ctl.velocity?.set(0, 0, 0);
    ctl.root.children.forEach((o, i) => { o.visible = this._vis?.[i] ?? true; });
    ctl.inputLocked = false;
  }

  /** Little "H" speech bubble floating over the car you can steal. */
  _bubble(car) {
    if (!this.bub) {
      if (!car) return;
      const cv = document.createElement('canvas'); cv.width = cv.height = 128;
      const g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.strokeStyle = '#1a1a1a'; g.lineWidth = 8;
      g.beginPath(); g.arc(64, 56, 44, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(50, 96); g.lineTo(64, 122); g.lineTo(78, 96); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.fillRect(48, 88, 32, 10);
      g.fillStyle = '#d4202a'; g.font = 'bold 64px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('H', 64, 58);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      this.bub = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      this.bub.scale.setScalar(1.1); this.bub.renderOrder = 999;
      this.controller.root.parent.add(this.bub);
    }
    this.bub.visible = !!car;
    if (car) {
      this.bub.position.copy(car.mesh.position);
      this.bub.position.y += 2.6 + Math.sin(performance.now() * 0.005) * 0.12;
    }
  }

  _cast(origin, dir, far) {
    this.ray.set(origin, dir); this.ray.far = far;
    return this.ray.intersectObjects(this.controller.cityMeshes, false)[0];
  }

  /** Civilians in the car's path get flung (harder the faster you go); fast hits knock them out. */
  _runOver(m, dt) {
    const sp = Math.abs(this.speed);
    if (sp < 3) return;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading), dir = Math.sign(this.speed);
    for (const n of this.life.npcs) {
      if (!n.active || n.jack || (n.hitCool ?? 0) > 0) { n.hitCool = Math.max(0, (n.hitCool ?? 0) - dt); continue; }
      const p = n.root.position, dx = p.x - m.position.x, dz = p.z - m.position.z;
      if (Math.abs(p.y - m.position.y) > 2.5) continue;
      const along = dx * fx + dz * fz, side = dx * fz - dz * fx;   // car-local: length 4.3, width ~2.1
      if (Math.abs(along) > 2.6 || Math.abs(side) > 1.4 || along * dir < 0.5) continue;
      n.hitCool = 1;
      if (n.hp <= 1) n.hp = 2;   // never vanish mid-air: fly first
      this.life.hitNpc(n, m.position, 1);
      if (sp > 11) {   // hard hit: knocked out once they land, back later like a punched civilian
        n.angry = 0; n.flee = 0;
        setTimeout(() => { if (n.active && !n.jack) { n.active = false; n.root.visible = false; n.respawnT = 6; } }, 1300);
      }
      // Fling forward and up with the car's speed, plus a little sideways spill
      n.vel.set(fx * dir * sp * 0.9 + fz * Math.sign(side || 1) * 2.5, 0, fz * dir * sp * 0.9 - fx * Math.sign(side || 1) * 2.5);
      n.vy = 3 + sp * 0.35;
      this.life.scare?.(p, 14, n);
      this.speed *= 0.85;   // thud
      this.hud?.shake?.(0.25);
    }
  }

  update(dt) {
    if (!this.car) {
      const near = this.controller.inputLocked ? null : this.nearest();
      this._bubble(near);
      if (near && !this._hinted && !document.documentElement.classList.contains('touch')) { this._hinted = true; this.hud?.toast?.('Press H to drive'); }
      return;
    }
    this._bubble(null);
    dt = Math.min(dt, 0.05);
    if (this.jackT > 0) {
      // Hero side of the carjack (timeline in CityLife._jackStep): walk to the door, yank the
      // driver out, climb into the seat as the door shuts.
      this.jackT -= dt;
      const e = this.jackLen - this.jackT;
      const m = this.car.mesh, c = Math.cos(m.rotation.y), s = Math.sin(m.rotation.y), ctl = this.controller;
      const local = (lx, lz, out) => out.set(m.position.x + lx * c + lz * s, m.position.y + 1, m.position.z - lx * s + lz * c);
      const door = local(1.85, -0.35, _o.clone()), seat = local(0.45, 0.1, _d.clone());
      const P = ctl.root.position;
      if (e < 0.65) {                                    // walk up to the driver's door
        const u = THREE.MathUtils.smoothstep(e, 0, 0.65);
        P.lerpVectors(this.jackFrom, door, u); P.y = door.y;
        const dx = door.x - this.jackFrom.x, dz = door.z - this.jackFrom.z;
        ctl.root.rotation.y = Math.hypot(dx, dz) > 0.3 && u < 0.8 ? Math.atan2(dx, dz) : m.rotation.y - Math.PI / 2;
        ctl.velocity?.set(dx, 0, dz).setLength(u < 0.95 ? 3.5 : 0);
      } else if (e < 1.5) {                              // open the door, reach in and yank
        P.copy(door);
        ctl.root.rotation.y = m.rotation.y - Math.PI / 2;
        ctl.velocity?.set(0, 0, 0);
        if (e > 0.95 && !this._yanked) { this._yanked = true; ctl.attackT = 1; ctl.attackArm = -1; this.hud?.shake?.(0.12); }
      } else if (e < 2.0) {                              // climb in
        const u = THREE.MathUtils.smoothstep(e, 1.5, 2.0);
        P.lerpVectors(door, seat, u);
        ctl.root.rotation.y = m.rotation.y - Math.PI / 2 + u * Math.PI / 2;
        ctl.velocity?.set(0, 0, 0);
      } else {
        P.copy(seat);
        ctl.root.rotation.y = m.rotation.y;
        ctl.root.children.forEach(o => { o.visible = false; });
      }
      if (this.jackT <= 0) { this._yanked = false; ctl.root.children.forEach(o => { o.visible = false; }); }
      return;
    }
    const k = this.keys, m = this.car.mesh;
    const fwd = k.KeyW || k.ArrowUp, back = k.KeyS || k.ArrowDown;
    const left = k.KeyA || k.ArrowLeft, right = k.KeyD || k.ArrowRight;
    if (fwd) this.speed += (this.speed < 0 ? BRAKE : ACCEL) * dt;
    else if (back) this.speed -= (this.speed > 0 ? BRAKE : ACCEL * 0.6) * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), (DRAG + Math.abs(this.speed) * 0.08) * dt * 4);
    if (k.Space) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), BRAKE * 1.4 * dt);
    this.speed = THREE.MathUtils.clamp(this.speed, -MAX_REV, MAX_FWD);
    // Steering grips more at low-mid speed, a little less flat out
    const grip = Math.min(1, Math.abs(this.speed) / 6) * (1 - Math.abs(this.speed) / (MAX_FWD * 2.5));
    // Ease the wheel in and out instead of snapping full lock
    this.steer = (this.steer ?? 0) + (((left ? 1 : 0) - (right ? 1 : 0)) - (this.steer ?? 0)) * Math.min(1, dt * 6);
    this.heading += this.steer * STEER * grip * Math.sign(this.speed) * dt;

    _d.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    const step = this.speed * dt;
    // Wall check from bumper height, a bumper-length ahead
    _o.copy(m.position).y += 0.7;
    const hit = this._cast(_o, this.speed >= 0 ? _d : _b.copy(_d).negate(), Math.abs(step) + 2.3);
    if (hit && hit.face && Math.abs(hit.face.normal.y) < 0.6) {
      this.speed *= -0.25;   // bump off
    } else {
      m.position.addScaledVector(_d, step);
    }
    // Ground snap (smooth over kerbs, never fall through)
    _o.copy(m.position).y += 3;
    const g = this._cast(_o, down, 12);
    if (g && g.point.y < m.position.y + 1.2) m.position.y += (g.point.y - m.position.y) * Math.min(1, dt * 10);   // ignore overhangs
    m.rotation.set(0, this.heading, 0);
    this._runOver(m, dt);
    // Body lean in corners and squat under throttle, cosmetic
    this.lean = (this.lean ?? 0) + (-this.steer * Math.min(1, Math.abs(this.speed) / 15) * 0.05 - (this.lean ?? 0)) * Math.min(1, dt * 5);
    m.rotation.z = this.lean;
    m.userData.delta?.set(0, 0, 0);
    this.car.dir = [_d.x, _d.z];

    const ctl = this.controller;
    ctl.root.position.set(m.position.x, m.position.y + 1.2, m.position.z);
    ctl.velocity?.set(0, 0, 0);
    // Chase cam: swing in behind the car while moving (mouse can still look around when stopped)
    if (Math.abs(this.speed) > 2) {
      const want = this.heading + (this.speed > 0 ? Math.PI : 0);
      let d = want - ctl._yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      ctl._yaw += d * Math.min(1, dt * 2.5);
      ctl._pitch += (0.22 - ctl._pitch) * Math.min(1, dt * 2);
    }
  }
}
