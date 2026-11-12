/**
 * LegoHud.js — LEGO UI from the DS rip: stud counter + collectible studs, and the pause menu.
 */
import * as THREE from 'three';
import { wallet } from './Outfit.js?v=65';
import { decorate, select } from './UiKit.js?v=68';
import { isTypingTarget, overlayOpen, closeOverlays, restoreGameFocus } from './Input.js?v=2';
import { buildPauseSettings } from './PauseSettings.js?v=6';

const STUD_TYPES = [
  { value: 10,    color: 0xe4e8ee, metal: 1.0,  rough: 0.18, weight: 0.74 }, // silver
  { value: 100,   color: 0xffc23a, metal: 1.0,  rough: 0.22, weight: 0.21 }, // gold
  { value: 1000,  color: 0x2a6bff, metal: 0.55, rough: 0.2,  weight: 0.045 }, // blue
  { value: 10000, color: 0xa040ff, metal: 0.55, rough: 0.2,  weight: 0.005 }, // purple
];
const EXTRA_SLOTS = 400; // per stud type, for studs that burst out of enemies
// Phones update every stud each frame; 900 still reads as a stud-strewn city and costs less CPU.
// Placed studs live on rooftops only, in small tidy rings: streets stay clean, swinging up pays.
const STUD_COUNT = document.documentElement.classList.contains('touch') ? 160 : 260;
const SCATTER_RADIUS = 260;

function studGeometry() {
  // Flat round LEGO stud with a raised top knob, standing on its edge so it reads as a coin
  // Small round stud, about the size of a minifig foot
  const base = new THREE.CylinderGeometry(0.15, 0.15, 0.06, 20);
  const knob = new THREE.CylinderGeometry(0.085, 0.085, 0.05, 16);
  knob.translate(0, 0.055, 0);
  const pos = [...base.attributes.position.array, ...knob.attributes.position.array];
  const nrm = [...base.attributes.normal.array, ...knob.attributes.normal.array];
  const idx = [...base.index.array, ...knob.index.array.map(i => i + base.attributes.position.count)];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  g.rotateX(Math.PI / 2);
  return g;
}

export class LegoHud {
  constructor({ scene, controller, cityGroup, spawn }) {
    this.scene = scene;
    this.controller = controller;
    this.spawn = spawn.clone();
    this.paused = false;
    this.total = 0;
    this._shown = 0;
    this.t = 0;

    this._counterEl = document.getElementById('stud-count');
    this._counterWrap = document.getElementById('stud-counter');
    this._pauseEl = document.getElementById('pause-menu');

    this._scatterStuds(cityGroup);
    this._bindPause();
  }

  _scatterStuds(cityGroup) {
    const meshes = cityGroup ? cityGroup.children.filter(c => c.isMesh) : [];
    const ray = new THREE.Raycaster();
    ray.firstHitOnly = true;
    const down = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3();
    const geo = studGeometry();

    this.studs = []; // { type, pos, alive }
    let tries = 0;
    while (this.studs.length < STUD_COUNT && tries++ < STUD_COUNT * 6) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.sqrt(Math.random()) * SCATTER_RADIUS;
      const x = this.spawn.x + Math.cos(a) * r, z = this.spawn.z + Math.sin(a) * r;
      let y = this.spawn.y;
      if (meshes.length) {
        ray.set(o.set(x, 1000, z), down);
        const hit = ray.intersectObjects(meshes, false)[0];
        if (!hit || !hit.face || hit.face.normal.y < 0.9 || hit.point.y < this.spawn.y + 10) continue; // flat rooftops only
        y = hit.point.y;
      }
      let roll = Math.random(), type = STUD_TYPES.length - 1;
      while (type > 0 && (roll -= STUD_TYPES[type].weight) > 0) type--;
      // Silver: a neat ring of 6; gold/blue: a single stud in the middle of the roof spot
      const n = type === 0 ? 6 : 1, R = n > 1 ? 1.1 : 0;
      for (let i = 0; i < n && this.studs.length < STUD_COUNT; i++) {
        const t = (i / n) * Math.PI * 2;
        this.studs.push({ type, pos: new THREE.Vector3(x + Math.cos(t) * R, y + 0.45, z + Math.sin(t) * R), alive: true, phase: Math.random() * 6 });
      }
    }

    this.meshes = STUD_TYPES.map((t, i) => {
      const count = this.studs.filter(s => s.type === i).length;
      const mat = new THREE.MeshStandardMaterial({ color: t.color, metalness: t.metal, roughness: t.rough, emissive: t.color, emissiveIntensity: 0.06, envMapIntensity: 1.6 });
      const m = new THREE.InstancedMesh(geo, mat, count + EXTRA_SLOTS);
      m.count = count + EXTRA_SLOTS;
      m.frustumCulled = false;
      this.scene.add(m);
      return m;
    });
    const slot = STUD_TYPES.map(() => 0);
    for (const s of this.studs) s.slot = slot[s.type]++;
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._one = new THREE.Vector3(1, 1, 1);
    this._zero = new THREE.Vector3(0, 0, 0);
    this._yAxis = new THREE.Vector3(0, 1, 0);
    this.free = STUD_TYPES.map((_, i) => {
      const used = slot[i], list = [];
      for (let k = used; k < used + EXTRA_SLOTS; k++) {
        this.meshes[i].setMatrixAt(k, this._m4.compose(this._zero, this._q, this._zero));
        list.push(k);
      }
      return list;
    });
  }

  /** Pop studs worth roughly `value` out of `pos`; they bounce onto `groundY` and get pulled to the player. */
  burstStuds(pos, value, groundY = pos.y - 0.5) {
    let left = Math.max(10, value), pieces = 0;
    for (let type = STUD_TYPES.length - 1; type >= 0 && pieces < 30; type--) {
      while (left >= STUD_TYPES[type].value && pieces < 30) {
        const slot = this.free[type].pop();
        if (slot == null) break;
        left -= STUD_TYPES[type].value;
        pieces++;
        const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 4;
        this.studs.push({
          type, slot, alive: true, dynamic: true, age: 0, phase: Math.random() * 6, ground: groundY,
          pos: pos.clone().setY(pos.y + 1),
          vel: new THREE.Vector3(Math.cos(a) * sp, 7 + Math.random() * 4, Math.sin(a) * sp),
        });
      }
    }
  }

  /** LEGO death penalty: lose some studs, scattered around where you fell. */
  spillStuds(pos, groundY) {
    const lost = Math.min(this.total, Math.max(100, Math.floor(this.total * 0.1 / 10) * 10));
    if (!lost) return 0;
    this.total -= lost;
    this._shown = this.total;
    if (this._counterEl) this._counterEl.textContent = this.total.toLocaleString();
    this.burstStuds(pos, lost, groundY);
    return lost;
  }

  _bindPause() {
    buildPauseSettings(this._pauseEl);
    const items = () => [...this._pauseEl.querySelectorAll('.tt-item')];
    document.addEventListener('keydown', e => {
      if (document.getElementById('confirm')?.classList.contains('open')) return;
      // P/Escape belong to whatever has the keyboard: chat, Friends, the emote wheel, the
      // Bugle board, an admin panel. Only the pause menu itself is excluded here, because it
      // needs the same key to close.
      if (isTypingTarget(e) || overlayOpen(['#pause-menu.open', '#pause-menu.show-ctrl', '#pause-menu.show-skills'])) return;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        if (this.paused && this._pauseEl.classList.contains('show-skills')) { this._pauseEl.classList.remove('show-skills'); return; }
        if (this.paused && this._pauseEl.classList.contains('show-settings')) { this._pauseEl.classList.remove('show-settings'); return; }
        if (this.paused && this._pauseEl.classList.contains('show-ctrl')) this._pauseEl.classList.remove('show-ctrl');
        else this.setPaused(!this.paused);
        return;
      }
      if (!this.paused) return;
      if (isTypingTarget(e)) return;
      // An open sheet (controls / settings) owns Enter and the arrow keys; its sliders and
      // selects get the browser's own key handling instead of moving the menu selection.
      if (this._pauseEl.classList.contains('show-ctrl') || this._pauseEl.classList.contains('show-settings') || this._pauseEl.classList.contains('show-skills')) return;
      const list = items(), i = list.findIndex(b => b.classList.contains('sel'));
      if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); select(list[(i + 1) % list.length]); }
      if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); select(list[(i - 1 + list.length) % list.length]); }
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); e.stopImmediatePropagation(); list[i]?.click(); }
    }, true);
    for (const b of items()) b.addEventListener('pointerenter', () => select(b));
    document.getElementById('pause-ctrl-btn')?.addEventListener('click', () => {
      this._pauseEl.classList.remove('show-settings');
      this._pauseEl.classList.toggle('show-ctrl');
    });
    document.getElementById('pause-settings-btn')?.addEventListener('click', () => {
      this._pauseEl.classList.remove('show-ctrl');
      this._pauseEl.classList.toggle('show-settings');
    });
    document.getElementById('pause-play')?.addEventListener('click', () => this.setPaused(false));
    document.getElementById('pause-replay')?.addEventListener('click', () => {
      const c = this.controller;
      if (c.webPhysics?.isSwinging) c.webPhysics.releaseWeb();
      c.isClimbing = false;
      c.velocity.set(0, 0, 0);
      c.root.position.copy(this.spawn);
      this.setPaused(false);
    });
    // Restart / Leave asks first, so a misclick never throws away progress
    const confirmBox = document.getElementById('confirm');
    document.getElementById('pause-home')?.addEventListener('click', () => { this._pauseEl.classList.remove('show-ctrl'); confirmBox.classList.add('open'); decorate(confirmBox); });
    document.getElementById('confirm-no')?.addEventListener('click', () => confirmBox.classList.remove('open'));
    document.addEventListener('keydown', e => { if (e.code === 'Escape' && confirmBox.classList.contains('open')) confirmBox.classList.remove('open'); });
    document.getElementById('confirm-yes')?.addEventListener('click', () => location.reload());
  }

  setPaused(p) {
    if (p !== this.paused) window.gameSfx?.play(p ? 'open' : 'close');
    this.paused = p;
    if (p) {
      closeOverlays();                 // never leave Friends / chat / emotes behind the pause menu
      this._pauseEl?.classList.add('open');
      this._pauseEl.classList.remove('show-ctrl', 'show-settings', 'show-skills');
      const where = document.getElementById('pause-where'), obj = document.getElementById('objective-text')?.textContent?.trim();
      if (where) where.textContent = obj ? `Objective: ${obj}` : 'Free roam';
      requestAnimationFrame(() => select(document.getElementById('pause-play')));
    } else {
      this._pauseEl?.classList.remove('open', 'show-ctrl', 'show-settings', 'show-skills');
      this.controller?.releaseAll?.();   // no key is still "held" after a menu
      restoreGameFocus();               // and the keyboard goes back to the game
    }
    if (p && document.pointerLockElement) document.exitPointerLock();
  }

  update(dt) {
    this.t += dt;
    const p = this.controller.root.position;
    const spin = this.t * 3;
    const dirty = STUD_TYPES.map(() => false);
    for (const s of this.studs) {
      if (!s.alive) continue;
      if (s.dynamic) {
        s.age += dt;
        const tx = p.x - s.pos.x, ty = p.y + 0.4 - s.pos.y, tz = p.z - s.pos.z;
        const d = Math.hypot(tx, ty, tz);
        if (s.age > 0.5 && d < 5) {
          // Magnet toward the player like the LEGO games
          const sp = Math.min(d, 16 * dt) / Math.max(d, 1e-3);
          s.pos.x += tx * sp; s.pos.y += ty * sp; s.pos.z += tz * sp;
        } else {
          s.vel.y -= 25 * dt;
          s.pos.addScaledVector(s.vel, dt);
          if (s.pos.y < s.ground + 0.25) {
            s.pos.y = s.ground + 0.25;
            s.vel.y = Math.abs(s.vel.y) * 0.4;
            s.vel.x *= 0.7; s.vel.z *= 0.7;
          }
        }
        if (s.age > 25) {
          s.alive = false;
          this.meshes[s.type].setMatrixAt(s.slot, this._m4.compose(s.pos, this._q, this._zero));
          this.free[s.type].push(s.slot);
          dirty[s.type] = true;
          continue;
        }
      }
      const dx = s.pos.x - p.x, dz = s.pos.z - p.z, dy = s.pos.y - (p.y + 0.4);
      if (dx * dx + dz * dz + dy * dy < 1.6 && (!s.dynamic || s.age > 0.35)) {
        s.alive = false;
        this.total += STUD_TYPES[s.type].value;
        window.gameSfx?.play('stud', { value: STUD_TYPES[s.type].value });
        const mile = Math.floor(this.total / 25000);
        if (mile > (this._mile ??= mile)) { this._mile = mile; window.gameSfx?.play('milestone'); }
        this._popGain(STUD_TYPES[s.type].value);
        this.meshes[s.type].setMatrixAt(s.slot, this._m4.compose(s.pos, this._q, this._zero));
        this.free[s.type].push(s.slot);
        dirty[s.type] = true;
        this._bump();
        continue;
      }
      // Only animate nearby studs; distant ones keep their last pose
      if (dx * dx + dz * dz > 6400 && s.posed) continue;
      s.posed = true;
      this._q.setFromAxisAngle(this._yAxis, spin + s.phase);
      const bobbed = this._tmp ??= new THREE.Vector3();
      bobbed.copy(s.pos).y += Math.sin(this.t * 2.5 + s.phase) * 0.12;
      this.meshes[s.type].setMatrixAt(s.slot, this._m4.compose(bobbed, this._q, this._one));
      dirty[s.type] = true;
    }
    dirty.forEach((d, i) => { if (d) this.meshes[i].instanceMatrix.needsUpdate = true; });
    if (this.studs.length > 1500) this.studs = this.studs.filter(st => st.alive);

    if (this.persist && this._banked !== this.total) { wallet.studs = this.total; this._banked = this.total; }
    // Counter rolls up toward the total like the LEGO games
    if (this._shown !== this.total) {
      const step = Math.max(1, Math.ceil((this.total - this._shown) * Math.min(1, dt * 8)));
      this._shown = Math.min(this.total, this._shown + step);
      if (this._counterEl) this._counterEl.textContent = this._shown.toLocaleString();
    }
  }

  toast(text) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  /** "+N" next to the counter; pickups within ~0.5 s add up into one number. */
  _popGain(v) {
    const el = this._popEl ??= document.getElementById('stud-pop');
    if (!el) return;
    const now = performance.now();
    this._popSum = now - (this._popAt ?? 0) < 500 ? (this._popSum ?? 0) + v : v;
    this._popAt = now;
    el.textContent = `+${this._popSum.toLocaleString()}`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  _bump() {
    const el = this._counterWrap;
    if (!el) return;
    el.classList.remove('bump');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('bump');
  }
}
