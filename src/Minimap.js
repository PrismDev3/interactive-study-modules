/**
 * Minimap.js — top-down view of the real city rendered into a round frame, bottom-right.
 * Rotates with the camera; shows your heading, the mission marker, villains and other players.
 */
import * as THREE from 'three';
import { isTypingTarget, overlayOpen } from './Input.js?v=2';

const RANGE = 70;      // metres from centre to edge
const MIN_SIZE = 60;   // px, below this the frame is hidden/broken — skip drawing

export class Minimap {
  constructor({ renderer, scene, controller }) {
    Object.assign(this, { renderer, scene, controller });
    this.cam = new THREE.OrthographicCamera(-RANGE, RANGE, RANGE, -RANGE, 1, 400);
    this.el = document.getElementById('minimap');
    this.arrow = document.getElementById('minimap-arrow');
    this.dots = document.getElementById('minimap-dots');
    // The map is redrawn at a reduced rate, but the main camera redraws the whole canvas every
    // frame. Keep a DOM snapshot on top so the last map stays visible instead of the world
    // flashing through the frame between map updates.
    this.snap = document.createElement('canvas');
    this.snap.className = 'mm-canvas';
    this.snap.setAttribute('aria-hidden', 'true');
    this.el.prepend(this.snap);
    this.snapCtx = this.snap.getContext('2d');
    this._v = new THREE.Vector3();
    this._maskKey = '';
    this.maskScene = new THREE.Scene();
    this.maskCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.0001, 10);
    this.maskCam.position.z = 1;

    // On/off: pause-menu setting (remembered) and the M key
    const box = document.getElementById('opt-minimap');
    let on = true;
    try { on = localStorage.getItem('minimap') !== '0'; } catch {}
    this.setEnabled(on);
    if (box) box.onchange = () => this.setEnabled(box.checked);
    document.addEventListener('keydown', e => {
      if (isTypingTarget(e) || overlayOpen()) return;
      if (e.code === 'Tab') { e.preventDefault(); this.setBig(!this.big); return; }
      if (e.code === 'KeyM') this.setEnabled(!this.enabled);
    });
    document.addEventListener('close-overlays', () => { if (this.big) this.setBig(false); });
  }

  setBig(on) {
    this.big = on;
    this.el.classList.toggle('big', on);
    const R = on ? 420 : RANGE;
    Object.assign(this.cam, { left: -R, right: R, top: R, bottom: -R });
    this.cam.updateProjectionMatrix();
  }

  setEnabled(on) {
    this.enabled = on;
    this.el.classList.toggle('show', on);
    const box = document.getElementById('opt-minimap');
    if (box) box.checked = on;
    try { localStorage.setItem('minimap', on ? '1' : '0'); } catch {}
  }

  /**
   * Where the map really goes. The frame has a 4 px border and a 20 px outer rounding, so the
   * drawable area is the padding box (180 − 8 = 172 px) with a 16 px inner corner radius.
   * Reading it from the element keeps the map inside the border at any frame size.
   */
  _frame() {
    // (offsetParent is always null for fixed-position elements like the big Tab map, so check rects)
    if (!this.el || this.el.getClientRects().length === 0) return null;
    const box = this.el.getBoundingClientRect();
    const cs = getComputedStyle(this.el);
    const bw = parseFloat(cs.borderLeftWidth) || 0;
    const size = Math.round(Math.min(box.width, box.height) - bw * 2);
    if (size < MIN_SIZE) return null;
    return {
      x: box.left + bw,
      y: innerHeight - box.bottom + bw,
      size,
      radius: cs.borderTopLeftRadius.endsWith('%') ? size / 2   // round frame
        : Math.max(0, (parseFloat(cs.borderTopLeftRadius) || 0) - bw),
    };
  }

  /**
   * Four invisible corner pieces are written into the depth buffer first (nearest possible
   * depth), so the square map can't draw over the frame's rounded corners.
   */
  _mask(radius, size) {
    const key = `${radius}|${size}`;
    if (this._maskKey === key) return;
    this._maskKey = key;
    for (const m of this.maskScene.children) { m.geometry.dispose(); m.material.dispose(); }
    this.maskScene.clear();
    const r = Math.min(0.99, Math.max(0.001, radius / (size / 2))); // corner radius in clip space
    const shape = new THREE.Shape();
    shape.moveTo(1, 1 - r);
    shape.lineTo(1, 1);
    shape.lineTo(1 - r, 1);
    shape.absarc(1 - r, 1 - r, r, Math.PI / 2, 0, true);
    const geo = new THREE.ShapeGeometry(shape, 10);
    // Depth test must stay ON (set to always pass): GPUs skip depth writes when depth testing is off
    const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, depthTest: true, depthFunc: THREE.AlwaysDepth, side: THREE.DoubleSide });
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const m = new THREE.Mesh(geo, mat);
      m.scale.set(sx, sy, 1);
      m.position.z = 0.999;
      this.maskScene.add(m);
    }
  }

  /** Place a dot for a world position; clamps to the frame edge when out of range. */
  _dot(i, pos, cls, color, size) {
    const v = this._v.copy(pos).project(this.cam);
    // Small map: anything past the edge is skipped (clutter), except the mission marker,
    // which stays pinned to the rim so you know which way to go. The big map shows all.
    if (!this.big && cls !== 'marker' && Math.hypot(v.x, v.y) > 1) return i;
    let d = this.dots.children[i];
    if (!d) { d = document.createElement('span'); this.dots.append(d); }
    d.className = `mm-dot ${cls}`;
    if (cls !== 'place') delete d.dataset.label;
    d.style.background = color ?? '';
    const half = size / 2 - 6;
    let x = v.x, y = v.y;
    const m = Math.hypot(x, y);   // round frame: clamp to the circle edge
    if (m > 1) { x /= m; y /= m; }
    d.style.transform = `translate(${size / 2 + x * half}px, ${size / 2 - y * half}px)`;
    return i + 1;
  }

  render({ marker, enemies = [], players = [], lockers = [] }) {
    if (!this.enabled) return;
    const frame = this._frame();
    if (!frame) return;

    const c = this.controller, p = c.root.position, yaw = c._yaw;
    this.cam.position.set(p.x, p.y + 150, p.z);
    if (this.big) this.cam.up.set(0, 0, -1);                // big map: north up
    else this.cam.up.set(-Math.sin(yaw), 0, -Math.cos(yaw)); // camera-forward is "up" on the map
    this.cam.lookAt(p.x, p.y, p.z);
    this.cam.updateMatrixWorld();

    const r = this.renderer;
    r.setScissorTest(true);
    r.setScissor(frame.x, frame.y, frame.size, frame.size);
    r.setViewport(frame.x, frame.y, frame.size, frame.size);
    const fog = this.scene.fog;
    this.scene.fog = null;
    r.autoClear = false;
    r.clearDepth();
    this._mask(frame.radius, frame.size);
    r.render(this.maskScene, this.maskCam);
    // The main pass already drew this frame's shadow map; rendering the scene again would redo
    // it for every shadow caster. Sub-metre detail (roof studs) is invisible at map scale.
    const shadowAuto = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    const hidden = [];
    for (const o of this.hideOnMap ?? []) if (o?.visible) { o.visible = false; hidden.push(o); }
    // Civilians and cars are under a pixel at map scale but cost most of the redraw (7.5 -> 2.8 ms measured)
    const now = performance.now();
    if (this.crowd && now - (this._crowdAt ?? 0) > 2000) { this._crowdAt = now; this._crowdList = this.crowd(); }
    for (const o of this._crowdList ?? []) if (o?.visible) { o.visible = false; hidden.push(o); }
    r.render(this.scene, this.cam);
    for (const o of hidden) o.visible = true;
    r.shadowMap.autoUpdate = shadowAuto;
    this._snapshot(frame);
    r.autoClear = true;
    this.scene.fog = fog;
    r.setScissorTest(false);
    r.setViewport(0, 0, innerWidth, innerHeight);

    // Player arrow: facing relative to camera forward
    this.arrow.style.transform = `translate(-50%, -50%) rotate(${(this.big ? 0 : yaw) - c.root.rotation.y + Math.PI}rad)`;

    let i = 0;
    for (const b of lockers) i = this._dot(i, b, 'locker', null, frame.size);
    for (const e of enemies) i = this._dot(i, e.root.position, e.T?.boss ? 'boss' : 'enemy', null, frame.size);
    for (const pl of players) i = this._dot(i, pl.root.position, 'player', pl.color, frame.size);
    if (marker) i = this._dot(i, marker, 'marker', null, frame.size);
    if (this.big) for (const [name, pos] of Object.entries(this.places ?? {})) {
      if (!pos || name === 'home') continue;
      i = this._dot(i, pos, 'place', null, frame.size);
      this.dots.children[i - 1].dataset.label = { oscorp: 'OSCORP', bugle: 'DAILY BUGLE', theatre: 'CINEMA', liberty: 'LIBERTY' }[name] ?? name.toUpperCase();
    }
    while (this.dots.children.length > i) this.dots.lastChild.remove();
  }

  /** Copy the freshly drawn map out of the shared WebGL canvas into its own canvas. */
  _snapshot(frame) {
    const src = this.renderer.domElement;
    if (!this.snapCtx || !src.width || !src.height) return;
    const scale = src.width / Math.max(1, src.clientWidth || innerWidth);
    const px = Math.max(1, Math.round(frame.size * scale));
    if (this.snap.width !== px || this.snap.height !== px) this.snap.width = this.snap.height = px;
    const sx = frame.x * scale;
    const sy = (innerHeight - frame.y - frame.size) * scale;
    const sw = frame.size * scale;
    this.snapCtx.drawImage(src, sx, sy, sw, sw, 0, 0, px, px);
  }
}
