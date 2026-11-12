/* ChangeBooth — LEGO changing booths around the city.
   Walk up, press E: the door swings open, the hero hops in, the door slams, the booth wobbles,
   then the in-game LOCKER opens. SAVE & EXIT bursts the door open and pops the hero back out. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeStatic } from './StaticMerge.js?v=3';
import { outfitCode } from './Outfit.js?v=65';
import { uiSfx } from './UiKit.js?v=68';

const W = 1.7, D = 1.7, H = 3.0;         // body size (a minifig is ~1.9 tall)
const REACH = 2.6;                        // E prompt distance from the door
const easeOut = t => 1 - (1 - t) ** 3;
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const backOut = t => { const c = 2.2; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };

// ── Shared materials (LEGO ABS plastic: glossy, slight clearcoat) ─────────
const plastic = (color, extra = {}) => new THREE.MeshPhysicalMaterial({
  color, roughness: 0.32, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25, ...extra });
let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    body: plastic(0x3fb6dc), trim: plastic(0xf4f4f4), dark: plastic(0x1f6f99),
    red: plastic(0xd8262c), yellow: plastic(0xf6c623), gold: plastic(0xe0a92b, { metalness: 0.4, roughness: 0.25 }),
    glass: new THREE.MeshPhysicalMaterial({ map: panelTexture(0), roughness: 0.15, clearcoat: 1, emissive: 0xffffff,
      emissiveMap: panelTexture(0), emissiveIntensity: 0.18 }),
  };
  MATS.glassB = MATS.glass.clone(); MATS.glassB.map = MATS.glassB.emissiveMap = panelTexture(1);
  MATS.glassC = MATS.glass.clone(); MATS.glassC.map = MATS.glassC.emissiveMap = panelTexture(2);
  return MATS;
}

/** Bright comic-art window panels (painted once on a canvas). */
function panelTexture(seed) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 192;
  const g = c.getContext('2d');
  const pal = [['#ffd23f', '#e8333a', '#2b59c3', '#2fbf71', '#ff8c1a'],
               ['#e8333a', '#2b59c3', '#ffd23f', '#ff5fa2', '#2fbf71'],
               ['#2b59c3', '#ffd23f', '#e8333a', '#20c5d8', '#ff8c1a']][seed % 3];
  g.fillStyle = pal[0]; g.fillRect(0, 0, 128, 192);
  // halftone dots
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (let y = 0; y < 192; y += 8) for (let x = (y / 8) % 2 * 4; x < 128; x += 8) { g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); }
  let r = seed * 9301 + 49297;
  const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 9; i++) {                       // big swirly petals / bursts
    g.fillStyle = pal[1 + (i % 4)];
    g.strokeStyle = '#111'; g.lineWidth = 3;
    const x = rnd() * 128, y = rnd() * 192, s = 14 + rnd() * 26;
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * Math.PI * 2, rr = k % 2 ? s * 0.5 : s;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath(); g.fill(); g.stroke();
  }
  // web-line overlay
  g.strokeStyle = 'rgba(17,17,17,0.55)'; g.lineWidth = 1.5;
  for (let k = 0; k < 8; k++) { g.beginPath(); g.moveTo(64, 96); g.lineTo(64 + Math.cos(k * 0.785) * 160, 96 + Math.sin(k * 0.785) * 160); g.stroke(); }
  for (let rr = 22; rr < 120; rr += 24) { g.beginPath(); g.arc(64, 96, rr, 0, 7); g.stroke(); }
  g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect(0, 0, 128, 192);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

const STUD = new THREE.CylinderGeometry(0.12, 0.12, 0.09, 18);
function studs(group, mat, w, d, y, step = 0.4) {
  const nx = Math.floor(w / step), nz = Math.floor(d / step);
  const inst = new THREE.InstancedMesh(STUD, mat, nx * nz);
  const m = new THREE.Matrix4(); let i = 0;
  for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++)
    inst.setMatrixAt(i++, m.makeTranslation((a - (nx - 1) / 2) * step, y + 0.045, (b - (nz - 1) / 2) * step));
  inst.castShadow = true;
  group.add(inst);
}
const box = (w, h, d, mat, r = 0.05) => {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat);
  m.castShadow = m.receiveShadow = true; return m;
};

/** Hanger icon made of a torus hook + a triangle tube. */
function hanger(mat) {
  const g = new THREE.Group();
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 8, 20, Math.PI * 1.4), mat);
  hook.position.y = 0.12; hook.rotation.z = -0.5; g.add(hook);
  const pts = [[-0.26, -0.08], [0, 0.06], [0.26, -0.08], [-0.26, -0.08]].map(([x, y]) => new THREE.Vector3(x, y, 0));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0), 30, 0.022, 6), mat));
  return g;
}

function buildBooth() {
  const M = mats();
  const root = new THREE.Group();
  const wob = new THREE.Group(); root.add(wob);          // squash/stretch pivot at the base

  const base = box(W + 0.4, 0.22, D + 0.4, M.trim, 0.04); base.position.y = 0.11; wob.add(base);
  studs(wob, M.trim, W + 0.4, D + 0.4, 0.22);

  // Body: back + side walls (front is the door frame)
  const t = 0.14;
  const back = box(W, H, t, M.body); back.position.set(0, 0.22 + H / 2, -D / 2 + t / 2); wob.add(back);
  for (const s of [-1, 1]) {
    const side = box(t, H, D, M.body); side.position.set(s * (W / 2 - t / 2), 0.22 + H / 2, 0); wob.add(side);
    // three comic windows per side + white mullions
    for (let k = 0; k < 3; k++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(D * 0.66, H * 0.26), [M.glass, M.glassB, M.glassC][(k + (s > 0)) % 3]);
      win.position.set(s * (W / 2 + 0.03), 0.22 + H * (0.2 + k * 0.3), 0);
      win.rotation.y = s * Math.PI / 2; wob.add(win);
      const fr = box(0.05, H * 0.29, D * 0.72, M.trim, 0.02); fr.position.copy(win.position); fr.position.x = s * W / 2; wob.add(fr);
    }
    const corner = box(0.18, H + 0.1, 0.18, M.trim, 0.05);
    for (const z of [-1, 1]) { const c = corner.clone(); c.position.set(s * W / 2, 0.22 + H / 2, z * D / 2); wob.add(c); }
  }
  // Back windows
  for (let k = 0; k < 3; k++) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.66, H * 0.26), [M.glassC, M.glass, M.glassB][k]);
    win.position.set(0, 0.22 + H * (0.2 + k * 0.3), -D / 2 - 0.03); win.rotation.y = Math.PI; wob.add(win);
    const fr = box(W * 0.72, H * 0.29, 0.05, M.trim, 0.02); fr.position.copy(win.position); fr.position.z = -D / 2; wob.add(fr);
  }
  // Floor inside
  const floor = box(W - 0.2, 0.06, D - 0.2, M.dark, 0.02); floor.position.y = 0.25; wob.add(floor);

  // Front frame: lintel + header sign with hanger
  const lintel = box(W + 0.12, 0.5, t + 0.04, M.body); lintel.position.set(0, 0.22 + H - 0.25, D / 2 - t / 2); wob.add(lintel);
  const sign = box(W * 0.75, 0.34, 0.06, M.trim, 0.03); sign.position.set(0, 0.22 + H - 0.25, D / 2 + 0.02); wob.add(sign);
  const hg = hanger(M.dark); hg.position.set(0, 0.22 + H - 0.25, D / 2 + 0.07); hg.scale.setScalar(0.9); wob.add(hg);

  // Roof: cap slab, studded top, pyramid with ridge, little red beacon
  const roofY = 0.22 + H;
  const cap = box(W + 0.36, 0.2, D + 0.36, M.trim, 0.05); cap.position.y = roofY + 0.1; wob.add(cap);
  const pyr = new THREE.Mesh(new THREE.ConeGeometry((W + 0.2) * 0.72, 0.62, 4, 1), M.body);
  pyr.rotation.y = Math.PI / 4; pyr.position.y = roofY + 0.2 + 0.31; pyr.castShadow = true; wob.add(pyr);
  const top = box(0.32, 0.12, 0.32, M.trim, 0.03); top.position.y = roofY + 0.84; wob.add(top);
  studs(wob, M.trim, 0.4, 0.4, roofY + 0.9);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const st = new THREE.Mesh(STUD, M.trim); st.position.set(x * (W / 2 + 0.06), roofY + 0.245, z * (D / 2 + 0.06)); wob.add(st);
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff2a1a, emissiveIntensity: 1.2 }));
  beacon.position.y = roofY + 1.02; wob.add(beacon);

  // Door: hinged on the left edge, swings outward
  const hinge = new THREE.Group(); hinge.position.set(-W / 2 + 0.1, 0.22, D / 2 - 0.02); wob.add(hinge);
  const dw = W - 0.2, dh = H - 0.5;
  const door = box(dw, dh, 0.1, M.body, 0.04); door.position.set(dw / 2, dh / 2, 0); hinge.add(door);
  for (let k = 0; k < 2; k++) {                          // two windows in the door
    const win = new THREE.Mesh(new THREE.PlaneGeometry(dw * 0.62, dh * 0.3), k ? M.glassB : M.glass);
    win.position.set(dw / 2, dh * (0.3 + k * 0.4), 0.052); hinge.add(win);
    const fr = box(dw * 0.7, dh * 0.36, 0.06, M.trim, 0.02); fr.position.set(dw / 2, dh * (0.3 + k * 0.4), 0.02); hinge.add(fr);
  }
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 12), M.gold); knob.position.set(dw - 0.14, dh * 0.48, 0.1); hinge.add(knob);
  const kick = box(dw * 0.9, 0.16, 0.12, M.trim, 0.03); kick.position.set(dw / 2, 0.1, 0.01); hinge.add(kick);

  // Warm interior light (only lit while the door is open)
  const lamp = new THREE.PointLight(0xfff1c4, 0, 4, 2); lamp.position.set(0, 0.22 + H - 0.4, 0); wob.add(lamp);

  // 48 parts per booth → one mesh per material. The door swings as one piece on its hinge and
  // the beacon pulses, so those stay separate from the body.
  mergeStatic(wob, { keep: o => o === hinge || o === beacon });
  mergeStatic(hinge);
  return { root, wob, hinge, beacon, lamp };
}

// ── Floating "E" prompt ──────────────────────────────────────────────────
function promptSprite() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(16,30,48,0.85)'; g.beginPath(); g.roundRect(4, 4, 248, 88, 20); g.fill();
  g.fillStyle = '#ffd23f'; g.beginPath(); g.roundRect(16, 18, 60, 60, 12); g.fill();
  g.fillStyle = '#10202f'; g.font = 'bold 44px "Lilita One", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('E', 46, 50);
  g.fillStyle = '#fff'; g.font = '30px "Lilita One", sans-serif'; g.textAlign = 'left'; g.fillText('CHANGE', 92, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(1.6, 0.6, 1); s.renderOrder = 999; s.visible = false;
  return s;
}

// ── Stud confetti burst ──────────────────────────────────────────────────
class Puff {
  constructor(scene) {
    this.scene = scene;
    const colors = [0xffd23f, 0xe8333a, 0x2b59c3, 0xffffff, 0x3fb6dc];
    this.mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 10),
      new THREE.MeshStandardMaterial({ roughness: 0.3 }), 40);
    this.p = [];
    for (let i = 0; i < 40; i++) { this.mesh.setColorAt(i, new THREE.Color(colors[i % 5])); this.p.push({ pos: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 }); }
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    scene.add(this.mesh);
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.one = new THREE.Vector3(1, 1, 1);
  }
  burst(at, dir, n = 26) {
    for (let i = 0; i < n; i++) {
      const p = this.p[i]; p.pos.copy(at);
      p.v.set((Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3).addScaledVector(dir, 2.5);
      p.life = 0.7 + Math.random() * 0.4; p.spin = Math.random() * 10;
    }
    this.mesh.count = n;
  }
  update(dt) {
    let alive = 0;
    for (let i = 0; i < this.mesh.count; i++) {
      const p = this.p[i]; p.life -= dt;
      if (p.life > 0) { alive++; p.v.y -= 12 * dt; p.pos.addScaledVector(p.v, dt); p.spin += dt * 12; }
      const s = Math.max(0, Math.min(1, p.life * 3));
      this.e.set(p.spin, p.spin * 0.7, 0);
      this.mesh.setMatrixAt(i, this.m.compose(p.pos, this.q.setFromEuler(this.e), this.one.set(s, s, s)));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!alive) this.mesh.count = 0;
  }
}

export class ChangeBooths {
  /** spots: [{pos: Vector3 (ground), yaw}] — door faces +z rotated by yaw. */
  constructor(scene, controller, menu, spots) {
    this.scene = scene; this.ctrl = controller; this.menu = menu;
    this.booths = spots.map(s => {
      const b = buildBooth();
      b.root.position.copy(s.pos); b.root.rotation.y = s.yaw;
      scene.add(b.root);
      b.root.updateMatrixWorld(true);
      b.door = new THREE.Vector3(0, 0, D / 2 + 1.1).applyMatrix4(b.root.matrixWorld);   // stand spot outside
      b.inside = new THREE.Vector3(0, 0.25, 0).applyMatrix4(b.root.matrixWorld);
      b.doorAng = 0; b.wobT = 9;
      return b;
    });
    this.prompt = promptSprite(); scene.add(this.prompt);
    this.puff = new Puff(scene);
    this.state = 'idle'; this.t = 0; this.near = null;
    window.addEventListener('keydown', e => this._key(e), true);   // capture: beat the web-swing E
    this._buildOverlay();
  }

  _key(e) {
    if (e.code !== 'KeyE' || e.repeat) return;
    if (this.state === 'idle' && this.near && !this.ctrl.inputLocked && !document.querySelector('#chat-input:focus')) {
      e.stopImmediatePropagation(); e.preventDefault();
      this._enter(this.near);
    }
  }

  _buildOverlay() {
    const ov = document.createElement('div');
    ov.id = 'booth-overlay';
    ov.innerHTML = '<div class="booth-flash"></div>';
    document.body.appendChild(ov);
    const st = document.createElement('style');
    st.textContent = `
#booth-overlay{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;
  background:radial-gradient(ellipse at center,rgba(20,60,90,.55),rgba(5,15,30,.85));backdrop-filter:blur(4px);}
#booth-overlay.show{display:flex;animation:boothIn .28s cubic-bezier(.2,1.4,.4,1) both}
#booth-overlay.out{animation:boothOut .2s ease-in both}
#booth-overlay #scr-suit{display:flex;position:relative;max-height:92vh;overflow:auto}
#booth-overlay .booth-flash{position:absolute;inset:0;background:#fff;pointer-events:none;opacity:0}
#booth-overlay.show .booth-flash{animation:boothFlash .35s ease-out}
#booth-overlay .booth-save{background:#ffd23f!important;color:#10202f!important}
@keyframes boothIn{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:none}}
@keyframes boothOut{to{opacity:0;transform:scale(.9)}}
@keyframes boothFlash{from{opacity:.7}to{opacity:0}}`;
    document.head.appendChild(st);
    this.overlay = ov;
    // The title screen (and the locker inside it) is deleted once the game starts: keep the locker here.
    const scr = document.getElementById('scr-suit');
    if (scr) { scr.classList.remove('show'); ov.appendChild(scr); }
  }

  _enter(b) {
    const c = this.ctrl;
    c.webPhysics?.isSwinging && c.webPhysics.releaseWeb(false);
    c.velocity?.set(0, 0, 0);
    c.inputLocked = true;
    this.cur = b; this.state = 'enter'; this.t = 0;
    this.from = c.root.position.clone();
    this.fromYaw = c.rig?.root ? c.root.rotation.y : 0;
    this.prompt.visible = false;
    uiSfx.play('whoosh');
  }

  _openLocker() {
    const m = this.menu, scr = document.getElementById('scr-suit');
    if (!m || !scr) { this._exit(); return; }
    this.overlay.classList.remove('out'); this.overlay.classList.add('show');
    m._openSuits();
    const back = scr.querySelector('[data-back]');
    this._back = { el: back, text: back.textContent, onclick: back.onclick };
    back.textContent = 'SAVE & EXIT'; back.classList.add('booth-save');
    back.onclick = () => this._closeLocker();
    this._esc = e => { if (e.code === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); this._closeLocker(); } };
    window.addEventListener('keydown', this._esc, true);
    document.exitPointerLock?.();
    this.state = 'locker';
  }

  async _closeLocker() {
    if (this.state !== 'locker') return;
    this.state = 'closing';
    window.removeEventListener('keydown', this._esc, true);
    const scr = document.getElementById('scr-suit'), bk = this._back;
    bk.el.textContent = bk.text; bk.el.classList.remove('booth-save'); bk.el.onclick = bk.onclick;
    this.overlay.classList.add('out');
    uiSfx.play('snap');
    const code = outfitCode(this.menu.outfit);
    const swap = code !== this.ctrl.variant ? this.ctrl.setVariant(code) : null;
    await new Promise(r => setTimeout(r, 200));
    this.overlay.classList.remove('show', 'out');
    scr.classList.remove('show');
    await swap;
    this._exit();
  }

  _exit() { this.state = 'exit'; this.t = 0; uiSfx.play('whoosh'); }

  update(dt) {
    const c = this.ctrl, p = c.root.position;
    this.puff.update(dt);
    const time = performance.now() / 1000;
    for (const b of this.booths) {
      b.beacon.material.emissiveIntensity = 0.8 + Math.sin(time * 4) * 0.5;
      b.hinge.rotation.y = -b.doorAng;
      b.lamp.intensity = Math.min(1, b.doorAng) * 6;
      // squash & stretch wobble after the slam
      b.wobT += dt;
      const w = Math.exp(-b.wobT * 7) * Math.sin(b.wobT * 34) * 0.07;
      b.wob.scale.set(1 + w, 1 - w, 1 + w);
    }

    if (this.state === 'idle') {
      // Solid booths: push the hero out of the footprint
      let near = null;
      for (const b of this.booths) {
        const local = b.root.worldToLocal(p.clone());
        if (Math.abs(local.y) < 4 && Math.abs(local.x) < W / 2 + 0.55 && Math.abs(local.z) < D / 2 + 0.55) {
          const ox = W / 2 + 0.55 - Math.abs(local.x), oz = D / 2 + 0.55 - Math.abs(local.z);
          if (ox < oz) local.x = Math.sign(local.x || 1) * (W / 2 + 0.55); else local.z = Math.sign(local.z || 1) * (D / 2 + 0.55);
          p.copy(b.root.localToWorld(local));
        }
        if (Math.hypot(p.x - b.door.x, p.z - b.door.z) < REACH && Math.abs(p.y - b.door.y) < 2.5 && !c.webPhysics?.isSwinging) near = b;
      }
      this.near = near;
      this.prompt.visible = !!near;
      if (near) {
        this.prompt.position.set(near.root.position.x, near.root.position.y + H + 1.7 + Math.sin(time * 3) * 0.08, near.root.position.z);
        near.doorAng += (0.12 - near.doorAng) * Math.min(1, dt * 6);       // door cracks open invitingly
      }
      for (const b of this.booths) if (b !== near) b.doorAng += (0 - b.doorAng) * Math.min(1, dt * 6);
      return;
    }

    const b = this.cur, yawIn = b.root.rotation.y + Math.PI;   // face into the booth
    c.velocity?.set(0, 0, 0);
    if (this.state === 'enter') {
      // 0–.15 door flings open · .1–.45 hop in (arc, turn) · .45–.6 door slams + wobble + puff
      this.t += dt;
      const T = this.t;
      b.doorAng = T < 0.45 ? backOut(Math.min(1, T / 0.15)) * 1.9 : 1.9 * (1 - easeInOut(Math.min(1, (T - 0.45) / 0.12)));
      const k = easeInOut(Math.min(1, Math.max(0, (T - 0.08) / 0.37)));
      p.lerpVectors(this.from, b.inside, k);
      p.y += Math.sin(k * Math.PI) * 0.55;
      c.root.rotation.y = lerpAngle(this.fromYaw, yawIn, easeOut(Math.min(1, T / 0.2)));
      if (T >= 0.57 && !this._slammed) {
        this._slammed = true; b.wobT = 0; uiSfx.play('snap');
        this.puff.burst(b.door.clone().setY(b.door.y + 1), new THREE.Vector3(0, 0, 1).applyQuaternion(b.root.quaternion));
      }
      if (T > 0.72) { this._slammed = false; this._openLocker(); }
    } else if (this.state === 'locker' || this.state === 'closing') {
      p.copy(b.inside); b.doorAng = 0;
    } else if (this.state === 'exit') {
      // door bursts open, hero is shoved out with a hop, door swings shut behind
      this.t += dt;
      const T = this.t;
      b.doorAng = T < 0.4 ? backOut(Math.min(1, T / 0.1)) * 2.0 : 2.0 * (1 - easeInOut(Math.min(1, (T - 0.4) / 0.2)));
      if (!this._burst) {
        this._burst = true; b.wobT = 0;
        this.puff.burst(b.door.clone().setY(b.door.y + 1), new THREE.Vector3(0, 0, 1).applyQuaternion(b.root.quaternion), 34);
      }
      const k = easeOut(Math.min(1, T / 0.35));
      const out = b.door.clone().addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(b.root.quaternion), 0.6);
      p.lerpVectors(b.inside, out, k); p.y += Math.sin(k * Math.PI) * 0.8;
      c.root.rotation.y = b.root.rotation.y;                   // facing out of the booth
      if (T > 0.6) {
        this._burst = false; this.state = 'idle'; c.inputLocked = false; b.wobT = 0;
        this.near = null;
      }
    }
  }
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Pick sidewalk spots near each target that have clear space (no walls within ~1.8 m, open sky). */
export function findBoothSpots(cityGroup, targets) {
  const meshes = cityGroup ? cityGroup.children.filter(c => c.isMesh) : [];
  if (!meshes.length) return [];
  const ray = new THREE.Raycaster(); ray.firstHitOnly = true;
  const o = new THREE.Vector3(), d = new THREE.Vector3();
  const cast = (x, y, z, dx, dy, dz, far) => {
    ray.ray.set(o.set(x, y, z), d.set(dx, dy, dz).normalize());
    let best = null;
    for (const m of meshes) {
      const h = m.geometry.boundsTree ? m.geometry.boundsTree.raycastFirst(ray.ray, THREE.DoubleSide, 0, far)
        : ray.intersectObject(m, false)[0];
      if (h && h.distance <= far && (!best || h.distance < best.distance)) best = h, best.object = m;
    }
    return best;
  };
  const spots = [];
  for (const [cx, cz] of targets) {
    let found = null;
    for (let r = 0; r <= 160 && !found; r += 3) {
      const n = Math.max(1, Math.round(r * 2 * Math.PI / 3));
      for (let i = 0; i < n && !found; i++) {
        const a = i / n * Math.PI * 2, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        const g = cast(x, 400, z, 0, -1, 0, 800);
        if (!g || g.object.material?.name !== 'sidewalk') continue;
        const y = g.point.y;
        if (cast(x, y + 0.3, z, 0, 1, 0, 60)) continue;                       // something overhead
        let ok = true, roadDir = null;
        for (let k = 0; k < 16 && ok; k++) {
          const ang = k / 16 * Math.PI * 2, dx = Math.cos(ang), dz = Math.sin(ang);
          if (cast(x, y + 0.4, z, dx, 0, dz, 2.0) || cast(x, y + 2.5, z, dx, 0, dz, 2.0)) ok = false;
          // ground must stay level around the footprint
          const f = cast(x + dx * 1.4, y + 3, z + dz * 1.4, 0, -1, 0, 6);
          if (!f || Math.abs(f.point.y - y) > 0.25) ok = false;
          const far = cast(x + dx * 6, y + 3, z + dz * 6, 0, -1, 0, 8);
          if (!roadDir && far && ['asphalt', 'paint'].includes(far.object.material?.name)) roadDir = ang;
        }
        if (!ok || roadDir === null) continue;
        if (spots.some(s => s.pos.distanceTo(o.set(x, y, z)) < 60)) continue;
        // door faces the road: local +z → (sin yaw, cos yaw)
        found = { pos: new THREE.Vector3(x, y, z), yaw: Math.atan2(Math.cos(roadDir), Math.sin(roadDir)) };
      }
    }
    if (found) spots.push(found);
  }
  return spots;
}
