/**
 * Dorm.js — "Your Dorm" room type: a decorated student room (up to 5 people) built far above the
 * city. No webs, powers, combat or map; look at a seat and press E to sit. Big wall TV whose
 * screen is a canvas (`dorm.tv`), so later content can draw into it or swap in a video texture.
 * The owner restyles it (N); the style lives on the server room and syncs to everyone inside.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SpideyFlix } from './SpideyFlix.js';

export const DORM_ORIGIN = new THREE.Vector3(0, 700, 0);
const W = 14, D = 11, H = 3.8;           // room inside size (x, z, y)
const SIT_DROP = 0.0;                    // root height above the cushion top while sitting (tuned in browser)

export const PALETTES = {
  wall:   ['#d9d2c3', '#9fb7c9', '#2e3b55', '#7d9a7a', '#c96f5a', '#5a4a6e', '#e8c26a', '#3a3a3e'],
  floor:  ['#a9774a', '#6b4528', '#c9a477', '#4a4f57'],
  bed:    ['#c4202a', '#1f5fbf', '#2b2b30', '#f2b632', '#5aa457', '#9b59b6'],
  couch:  ['#3a4a6b', '#7a2a2a', '#4c4c50', '#2f6b5a', '#c27a2c', '#e6e0d2'],
  rug:    ['#b7262f', '#244a8f', '#e7c349', '#e9e4da', '#262a33', '#3f8f6a'],
  light:  ['#ffd9a0', '#bfe3ff', '#ff5ad1', '#ff3b3b'],
  poster: [0, 1, 2],
};
const DEFAULT_STYLE = { wall: 1, floor: 0, bed: 0, couch: 0, rug: 0, light: 0, poster: 0 };
const LABELS = { wall: 'WALLS', floor: 'FLOOR', bed: 'BED', couch: 'COUCH', rug: 'RUG', light: 'LIGHTS', poster: 'POSTERS' };

const plastic = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.02, ...o });

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class Dorm {
  constructor({ scene, controller, setup, net, hud }) {
    Object.assign(this, { scene, controller, setup, net, hud });
    this.active = false;
    this.built = false;
    this.seats = [];
    this.seated = null;
    this.style = { ...DEFAULT_STYLE };
    this.canEdit = false;
    this._ray = new THREE.Raycaster();
    this._ray.far = 3.2;
    this._ui();
    this.flix = new SpideyFlix(this);
    net?.on?.('dorm', m => this.applyStyle(m.dorm));
    net?.on?.('flix', m => this.flix.applySync(m.flix));
    document.addEventListener('keydown', e => this._key(e));
  }

  // ─── Enter / leave ──────────────────────────────────────────────────────

  enter(room, { canEdit = false } = {}) {
    if (!this.built) this._build();
    this.canEdit = canEdit;
    this.flix.setOwner(canEdit);
    this.applyStyle(room?.dorm ?? {});
    this.group.visible = true;
    this.active = true;
    const c = this.controller;
    this._saved ??= { noWebs: c.noWebs, noPowers: c.noPowers, home: c._home?.clone?.() };
    c.noWebs = true; c.noPowers = true; c.dorm = true;
    const pg = window.game?.portal;   // holster the portal gun and hide its portals
    if (pg?.active) { pg.active = false; for (const p of pg.portals ?? []) if (p) p.group.visible = false; c._lmb = false; }
    if (c.webPhysics?.isSwinging) c.webPhysics.releaseWeb(false);
    c.isClimbing = false; c.isWallRun = false; c.flying = false;
    for (const m of this.colliders) if (!c.cityMeshes.includes(m)) c.cityMeshes.push(m);
    const spawn = this.toWorld(new THREE.Vector3(0, 0.05, -1.7));
    c.root.position.copy(spawn);
    c.velocity?.set(0, 0, 0);
    c.root.rotation.y = 0;
    c._yaw = Math.PI; c._pitch = -0.1;
    c.setHome?.(spawn);
    this.setup.farCap = Math.hypot(W, D, H) + 4;   // the city is never visible from inside
    document.body.classList.add('dorm');
    this.editBtn.style.display = canEdit ? '' : 'none';
  }

  leave() {
    if (!this.active) return;
    this._stand();
    this.active = false;
    this.group.visible = false;
    const c = this.controller;
    c.noWebs = !!this._saved?.noWebs; c.noPowers = !!this._saved?.noPowers; c.dorm = false;
    for (const m of this.colliders) { const i = c.cityMeshes.indexOf(m); if (i >= 0) c.cityMeshes.splice(i, 1); }
    if (this._saved?.home) { c.root.position.copy(this._saved.home); c.setHome?.(this._saved.home); }
    this._saved = null;
    this.setup.farCap = null;
    document.body.classList.remove('dorm');
    this.panel.classList.remove('show');
    this.flix.stop(); this.flix.close();
  }

  toWorld(v) { return v.add(DORM_ORIGIN); }

  // ─── Per frame ──────────────────────────────────────────────────────────

  update(dt) {
    if (!this.active) return;
    const c = this.controller;
    // Fell out somehow (a teleport, a bad step): put them back on the rug
    if (c.root.position.y < DORM_ORIGIN.y - 3) c.root.position.copy(this.toWorld(new THREE.Vector3(0, 0.05, -1.7)));
    if (this.seated) {
      const s = this.seated, k = c._keys ?? {};
      if (k.KeyW || k.KeyA || k.KeyS || k.KeyD || k.Space || k.ArrowUp || k.ArrowDown || k.ArrowLeft || k.ArrowRight) { this._stand(); }
      else {
        c.root.position.copy(s.world);
        c.velocity?.set(0, 0, 0);
        c.root.rotation.y = s.yaw;
        c.isGrounded = true;
        c.emote = 'sit';
      }
    }
    this._aim = this.seated ? null : this._nearSeat();
    this.prompt.classList.toggle('show', !!this._aim);
    if (this._aim) this.promptText.textContent = `Sit${this._aim.label ? ' on ' + this._aim.label : ''}`;
    // The TV's idle screen animates slowly so it reads as switched on
    this._tvT = (this._tvT ?? 0) + dt;
    if (!this.tvExternal && this._tvT > 0.25) { this._tvT = 0; this._drawIdleTV(); }
  }

  /** Nearest free seat within reach of the player (no aiming needed). */
  _nearSeat() {
    const p = this.controller.root.position;
    let best = null, bd = 1.7;
    const ry = this.controller.root.rotation.y, fx = Math.sin(ry), fz = Math.cos(ry);
    for (const seat of this.seats) {
      const d = Math.hypot(seat.standWorld.x - p.x, seat.standWorld.z - p.z) * 0.6 + Math.hypot(seat.world.x - p.x, seat.world.z - p.z) * 0.4;
      if (d >= bd || Math.abs(seat.world.y - p.y) > 1.2 || this._taken(seat)) continue;
      // The character (not the camera) has to be roughly facing the seat: within ~65 degrees
      const dx = seat.world.x - p.x, dz = seat.world.z - p.z, len = Math.hypot(dx, dz) || 1;
      if ((fx * dx + fz * dz) / len < 0.42) continue;
      bd = d; best = seat;
    }
    return best;
  }

  _taken(seat) {
    const players = window.game?.mp?.players;
    if (!players) return false;
    for (const p of players.values()) {
      const r = p.rig?.root ?? p.root;
      if (r && r.position.distanceTo(seat.world) < 0.45) return true;
    }
    return false;
  }

  _key(e) {
    if (!this.active || e.repeat) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.code === 'KeyE') {
      if (this.seated) this._stand();
      else if (this._aim) this._sit(this._aim);
    } else if (e.code === 'KeyT') {
      this.flix.toggle();
    } else if (e.code === 'Escape' && this.flix.isOpen) {
      this.flix.close();
    } else if (e.code === 'KeyN' && this.canEdit) {
      this._togglePanel();
    }
  }

  _sit(seat) {
    const c = this.controller;
    this.seated = seat;
    c.root.position.copy(seat.world);
    c.root.rotation.y = seat.yaw;
    c.velocity?.set(0, 0, 0);
    c.emote = 'sit';
    // Swing the camera round behind the seat so you face what the seat faces (the TV, mostly)
    c._yaw = seat.yaw + Math.PI;
    c._pitch = 0.4;   // camera high behind the seat, looking over the back at the TV
    window.gameSfx?.play?.('tab');
  }

  _stand() {
    if (!this.seated) return;
    const c = this.controller, s = this.seated;
    this.seated = null;
    c.emote = null;
    c.root.position.copy(s.standWorld);
    c.velocity?.set(0, 0, 0);
  }

  // ─── Styling ────────────────────────────────────────────────────────────

  applyStyle(d = {}) {
    for (const k of Object.keys(DEFAULT_STYLE)) {
      const v = d[k];
      if (Number.isInteger(v) && v >= 0 && v < PALETTES[k].length) this.style[k] = v;
    }
    if (!this.built) return;
    const s = this.style, m = this.mats;
    m.wall.color.set(PALETTES.wall[s.wall]);
    m.trim.color.set(new THREE.Color(PALETTES.wall[s.wall]).multiplyScalar(0.72));
    this.floorTex(PALETTES.floor[s.floor]);
    m.bed.color.set(PALETTES.bed[s.bed]);
    m.couch.color.set(PALETTES.couch[s.couch]);
    m.couchDark.color.set(new THREE.Color(PALETTES.couch[s.couch]).multiplyScalar(0.7));
    m.rug.color.set(PALETTES.rug[s.rug]);
    m.rugEdge.color.set(new THREE.Color(PALETTES.rug[s.rug]).multiplyScalar(0.65));
    m.led.color.set(PALETTES.light[s.light]);
    m.led.emissive.set(PALETTES.light[s.light]);
    m.panel.emissive.set(new THREE.Color(PALETTES.light[s.light]).lerp(new THREE.Color('#ffffff'), 0.65));
    this._drawPosters(s.poster);
    this._syncPanel();
  }

  setStyle(k, v) {
    this.applyStyle({ [k]: v });
    try { localStorage.setItem('dormStyle', JSON.stringify(this.style)); } catch {}
    this.net?.send?.({ t: 'dorm', dorm: { [k]: v } });
  }

  // ─── TV ─────────────────────────────────────────────────────────────────

  /** Put something on the TV: a canvas, video element or texture. Pass null for the idle screen. */
  setTV(src) {
    if (!this.built) this._build();
    if (!src) { this.tvExternal = false; this.tvMat.map = this.tvTex; this.tvMat.needsUpdate = true; return; }
    const tex = src.isTexture ? src
      : src instanceof HTMLVideoElement ? new THREE.VideoTexture(src) : new THREE.CanvasTexture(src);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.tvExternal = true;
    this.tvMat.map = tex;
    this.tvMat.needsUpdate = true;
    return tex;
  }

  _drawIdleTV() {
    const g = this.tvCanvas.getContext('2d'), w = this.tvCanvas.width, h = this.tvCanvas.height;
    const t = performance.now() / 1000;
    const bg = g.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#05070f'); bg.addColorStop(1, '#2a0508');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    // drifting bricks
    for (let i = 0; i < 18; i++) {
      const x = ((i * 157 + t * (14 + (i % 5) * 6)) % (w + 120)) - 60;
      const y = (i * 89) % h;
      g.fillStyle = ['#d0242c', '#1f5fbf', '#f5c518', '#ffffff'][i % 4];
      g.globalAlpha = 0.12;
      g.fillRect(x, y, 56, 28);
      g.globalAlpha = 1;
    }
    g.textAlign = 'center';
    g.font = '400 120px "Lilita One", system-ui, sans-serif';
    const wS = g.measureText('SPIDEY').width, wF = g.measureText('FLIX').width, x0 = w / 2 - (wS + wF) / 2;
    g.textAlign = 'left';
    g.fillStyle = '#ffffff'; g.fillText('SPIDEY', x0, h / 2);
    g.fillStyle = '#e50914'; g.fillText('FLIX', x0 + wS, h / 2);
    g.textAlign = 'center';
    g.fillStyle = '#ffffff';
    g.font = '400 34px Fredoka, system-ui, sans-serif';
    g.globalAlpha = 0.55 + 0.45 * Math.sin(t * 2);
    g.fillText('PRESS  T  TO BROWSE', w / 2, h / 2 + 70);
    g.globalAlpha = 1;
    this.tvTex.needsUpdate = true;
  }

  // ─── TV click → fullscreen ───────────────────────────────────────────────

  _installTVClick() {
    const canvas = this.setup?.renderer?.domElement;
    if (!canvas || this._tvClickBound) return;
    this._tvClickBound = true;
    const ray = this._ray;
    canvas.addEventListener('click', e => {
      if (!this.active || !this.tv) return;
      // Skip if pointer is locked (player is looking around, not clicking UI)
      if (document.pointerLockElement === canvas) return;
      const rect = canvas.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const cam = this.setup?.camera;
      if (!cam) return;
      ray.setFromCamera({ x: nx, y: ny }, cam);
      const hits = ray.intersectObject(this.tv, false);
      if (hits.length) this.flix.onTVClick();
    });
  }

  // ─── Build ──────────────────────────────────────────────────────────────

  _build() {
    this.built = true;
    const g = this.group = new THREE.Group();
    g.name = 'Dorm';
    g.position.copy(DORM_ORIGIN);
    this.scene.add(g);
    const solids = [], shell = [];
    this.seatHits = [];
    const m = this.mats = {
      wall: plastic('#9fb7c9', { roughness: 0.85 }),
      trim: plastic('#7a8c99'),
      ceil: plastic('#f1eee6', { roughness: 0.9 }),
      floor: plastic('#a9774a', { roughness: 0.55 }),
      bed: plastic('#c4202a'), sheet: plastic('#d9d4c8', { roughness: 0.9 }),
      couch: plastic('#3a4a6b', { roughness: 0.6 }), couchDark: plastic('#2a3550', { roughness: 0.6 }),
      rug: plastic('#b7262f', { roughness: 0.95 }), rugEdge: plastic('#7a1a20', { roughness: 0.95 }),
      wood: plastic('#7b4f2c', { roughness: 0.5 }), woodLight: plastic('#b7834f', { roughness: 0.5 }),
      black: plastic('#141519', { roughness: 0.3 }), grey: plastic('#6b6f78'), white: plastic('#e6e2d8', { roughness: 0.8 }),
      metal: plastic('#a9adb5', { metalness: 0.6, roughness: 0.3 }),
      led: plastic('#ffd9a0', { emissive: '#ffd9a0', emissiveIntensity: 1.6 }),
      panel: plastic('#ffffff', { emissive: '#fff4dd', emissiveIntensity: 1.1 }),
      plant: plastic('#3f8f4a', { roughness: 0.6 }), pot: plastic('#c8643b'),
      red: plastic('#d0242c'), blue: plastic('#1f5fbf'), yellow: plastic('#f5c518'), green: plastic('#4caf50'),
      glass: new THREE.MeshStandardMaterial({ color: '#9fd3ff', transparent: true, opacity: 0.25, roughness: 0.05 }),
    };
    const studGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 14);
    const box = (w, h, d, x, y, z, mat, { r = 0.04, solid = false, shadow = true, parent = g } = {}) => {
      const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = shadow; mesh.receiveShadow = true;
      parent.add(mesh);
      if (solid) (solid === 'shell' ? shell : solids).push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
      return mesh;
    };
    const studs = (x0, z0, nx, nz, y, mat, step = 0.2) => {
      const im = new THREE.InstancedMesh(studGeo, mat, nx * nz);
      const o = new THREE.Object3D();
      let i = 0;
      for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
        o.position.set(x0 + a * step, y + 0.025, z0 + b * step); o.updateMatrix(); im.setMatrixAt(i++, o.matrix);
      }
      im.castShadow = false; im.receiveShadow = true;
      g.add(im);
      return im;
    };
    const cyl = (rt, rb, h, x, y, z, mat, seg = 20) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
      mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh;
    };
    const seat = (label, x, y, z, yaw, hitW, hitD, standX, standZ) => {
      const s = {
        label, yaw,
        world: new THREE.Vector3(x, y + SIT_DROP, z).add(DORM_ORIGIN),
        standWorld: new THREE.Vector3(standX, 0.05, standZ).add(DORM_ORIGIN),
      };
      const hit = new THREE.Mesh(new THREE.BoxGeometry(hitW, 1.2, hitD), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(x, y + 0.4, z);   // tall: looking at the backrest counts too
      hit.userData.seat = s;
      g.add(hit);
      this.seatHits.push(hit);
      this.seats.push(s);
      return s;
    };
    const hx = W / 2, hz = D / 2;

    // ── Shell: floor, walls, ceiling, baseboards ──
    this.floorTex = color => {
      const base = new THREE.Color(color);
      const t = canvasTex(1024, 1024, (c, w, h) => {
        const n = 10;
        for (let i = 0; i < n; i++) {
          const k = 0.86 + ((i * 37) % 7) / 40;
          c.fillStyle = `#${base.clone().multiplyScalar(k).getHexString()}`;
          c.fillRect(0, (i * h) / n, w, h / n);
          c.fillStyle = 'rgba(0,0,0,.28)';
          c.fillRect(0, (i * h) / n, w, 3);
          const cut = ((i * 389) % 900) + 60;
          c.fillRect(cut, (i * h) / n, 3, h / n);
        }
      });
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(3, 3);
      this.mats.floor.map?.dispose();
      this.mats.floor.map = t;
      this.mats.floor.color.set('#ffffff');
      this.mats.floor.needsUpdate = true;
    };
    box(W + 0.4, 0.2, D + 0.4, 0, -0.1, 0, m.floor, { r: 0, solid: 'shell', shadow: false });
    box(W + 0.4, 0.2, D + 0.4, 0, H + 0.1, 0, m.ceil, { r: 0, solid: 'shell', shadow: false });
    // walls: north (TV), south (door), west (desk + window), east (bed)
    box(W + 0.4, H, 0.2, 0, H / 2, -hz - 0.1, m.wall, { r: 0, solid: 'shell', shadow: false });
    box(W + 0.4, H, 0.2, 0, H / 2, hz + 0.1, m.wall, { r: 0, solid: 'shell', shadow: false });
    box(0.2, H, D, -hx - 0.1, H / 2, 0, m.wall, { r: 0, solid: 'shell', shadow: false });
    box(0.2, H, D, hx + 0.1, H / 2, 0, m.wall, { r: 0, solid: 'shell', shadow: false });
    for (const [w, d, x, z] of [[W, 0.06, 0, -hz + 0.03], [W, 0.06, 0, hz - 0.03], [0.06, D, -hx + 0.03, 0], [0.06, D, hx - 0.03, 0]]) {
      box(w, 0.16, d, x, 0.08, z, m.trim, { r: 0, shadow: false });
      box(w, 0.1, d, x, H - 0.05, z, m.trim, { r: 0, shadow: false });
    }

    // ── Ceiling light panel + LED strip round the ceiling ──
    box(3.2, 0.06, 1.6, 0, H - 0.03, 0.5, m.panel, { r: 0.02, shadow: false });
    for (const [w, d, x, z] of [[W - 0.4, 0.05, 0, -hz + 0.12], [W - 0.4, 0.05, 0, hz - 0.12], [0.05, D - 0.4, -hx + 0.12, 0], [0.05, D - 0.4, hx - 0.12, 0]]) {
      box(w, 0.05, d, x, H - 0.16, z, m.led, { r: 0, shadow: false });
    }

    // ── Door (south wall) ──
    box(1.3, 2.4, 0.08, -4.6, 1.2, hz - 0.04, m.woodLight, { r: 0.02, shadow: false });
    box(1.5, 0.12, 0.12, -4.6, 2.46, hz - 0.06, m.trim, { r: 0.02, shadow: false });
    cyl(0.05, 0.05, 0.12, -4.1, 1.1, hz - 0.12, m.metal).rotation.x = Math.PI / 2;

    // ── Window (west wall) with a night skyline behind the glass ──
    const sky = canvasTex(512, 384, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#0c1630'); gr.addColorStop(1, '#3b2a5a');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect((i * 97) % w, (i * 53) % (h / 2), 2, 2); }
      let x = 0, s = 1;
      while (x < w) {
        const bw = 30 + ((s * 41) % 50), bh = 90 + ((s * 67) % 200);
        c.fillStyle = '#0a0d18'; c.fillRect(x, h - bh, bw, bh);
        c.fillStyle = '#f7d27a';
        for (let yy = h - bh + 8; yy < h - 6; yy += 14) for (let xx = x + 5; xx < x + bw - 5; xx += 10) if ((xx * yy + s) % 5 < 2) c.fillRect(xx, yy, 5, 7);
        x += bw + 4; s++;
      }
    });
    const winMat = new THREE.MeshBasicMaterial({ map: sky, toneMapped: false });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.9), winMat);
    win.position.set(-hx + 0.02, 2.0, -1.2); win.rotation.y = Math.PI / 2; g.add(win);
    box(0.12, 0.1, 3.4, -hx + 0.06, 0.98, -1.2, m.white, { r: 0.02, shadow: false });
    box(0.12, 0.1, 3.4, -hx + 0.06, 3.0, -1.2, m.white, { r: 0.02, shadow: false });
    box(0.12, 2.1, 0.1, -hx + 0.06, 2.0, -2.85, m.white, { r: 0.02, shadow: false });
    box(0.12, 2.1, 0.1, -hx + 0.06, 2.0, 0.45, m.white, { r: 0.02, shadow: false });
    box(0.12, 2.1, 0.08, -hx + 0.06, 2.0, -1.2, m.white, { r: 0.02, shadow: false });
    box(0.3, 0.06, 3.5, -hx + 0.15, 0.95, -1.2, m.white, { r: 0.02 });   // sill

    // ── The big TV (north wall) on a media console ──
    const TVW = 5.2, TVH = 2.9, tvY = 2.05;
    box(TVW + 0.16, TVH + 0.16, 0.12, 0, tvY, -hz + 0.1, m.black, { r: 0.04 });
    this.tvCanvas = document.createElement('canvas');
    this.tvCanvas.width = 1280; this.tvCanvas.height = 720;
    this.tvTex = new THREE.CanvasTexture(this.tvCanvas);
    this.tvTex.colorSpace = THREE.SRGBColorSpace;
    this.tvMat = new THREE.MeshBasicMaterial({ map: this.tvTex, toneMapped: false });
    this.tv = new THREE.Mesh(new THREE.PlaneGeometry(TVW, TVH), this.tvMat);
    this.tv.position.set(0, tvY, -hz + 0.17);
    g.add(this.tv);
    this._drawIdleTV();
    box(0.9, 0.05, 0.03, 0, tvY - TVH / 2 - 0.02, -hz + 0.17, m.grey, { r: 0.01 });   // logo bar
    // Click on the TV mesh → fullscreen/theater via SpideyFlix.onTVClick()
    this._installTVClick();
    // Nothing stands in front of the screen: it's kept clear for on-TV UI.

    // ── Rug + sectional couch facing the TV ──
    box(6.4, 0.03, 4.4, 0, 0.015, -0.3, m.rugEdge, { r: 0, shadow: false });
    box(6.0, 0.035, 4.0, 0, 0.02, -0.3, m.rug, { r: 0, shadow: false });
    const cz = 2.0;   // couch seat centre (z)
    box(4.6, 0.38, 1.1, 0, 0.19, cz, m.couchDark, { solid: true });
    box(4.6, 0.85, 0.3, 0, 0.62, cz + 0.55, m.couch, { r: 0.12, solid: true });
    for (const x of [-2.45, 2.45]) box(0.32, 0.68, 1.1, x, 0.34, cz, m.couch, { r: 0.12, solid: true });
    for (const [i, x] of [-1.4, 0, 1.4].entries()) {
      box(1.36, 0.18, 0.9, x, 0.47, cz - 0.08, m.couch, { r: 0.08 });
      box(1.2, 0.5, 0.18, x, 0.85, cz + 0.32, m.couch, { r: 0.08 });
      seat(['left of the couch', 'the couch', 'right of the couch'][i], x, 0.56, cz - 0.05, Math.PI, 1.3, 0.9, x, cz - 1.1);
    }
    studs(-2.55, cz - 0.45, 2, 5, 0.68, m.couch);
    studs(2.35, cz - 0.45, 2, 5, 0.68, m.couch);
    // throw pillows
    box(0.42, 0.42, 0.14, -2.0, 0.78, cz + 0.28, m.yellow, { r: 0.1 }).rotation.z = 0.2;
    box(0.42, 0.42, 0.14, 2.0, 0.78, cz + 0.28, m.red, { r: 0.1 }).rotation.z = -0.2;

    // ── Coffee table with snacks ──
    box(2.0, 0.08, 0.9, 0, 0.42, -0.2, m.woodLight, { solid: true });
    for (const [x, z] of [[-0.9, -0.57], [0.9, -0.57], [-0.9, 0.17], [0.9, 0.17]]) box(0.08, 0.38, 0.08, x, 0.19, z, m.wood, { r: 0.02 });
    studs(-0.9, -0.6, 10, 5, 0.46, m.woodLight);
    box(0.6, 0.06, 0.6, -0.4, 0.52, -0.2, plastic('#e9dcc2'), { r: 0.01 });          // pizza box
    for (const [x, c] of [[0.35, m.red], [0.55, m.blue], [0.45, m.green]]) cyl(0.05, 0.05, 0.16, x, 0.57, -0.3 + (x - 0.45) * 0.8, c, 14);
    box(0.36, 0.05, 0.16, 0.2, 0.5, 0.05, m.black, { r: 0.02 });                       // controller

    // ── Beanbags (front corners of the rug) ──
    const beanMat = [m.yellow, m.blue];
    for (const [i, x] of [-2.75, 2.75].entries()) {
      const bb = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 16), beanMat[i]);
      bb.scale.set(1, 0.55, 1); bb.position.set(x, 0.32, -1.3); bb.castShadow = bb.receiveShadow = true; g.add(bb);
      const back = new THREE.Mesh(new THREE.SphereGeometry(0.46, 20, 14), beanMat[i]);
      back.scale.set(1, 0.85, 0.6); back.position.set(x, 0.62, -0.92); back.castShadow = true; g.add(back);
      solids.push(new THREE.BoxGeometry(1.0, 0.36, 1.0).translate(x, 0.18, -1.3));
      seat('the beanbag', x, 0.36, -1.35, Math.PI + (i ? 0.35 : -0.35), 1.1, 1.1, x + (i ? -1.0 : 1.0), -0.9);
    }

    // ── Bed (east wall, back corner) ──
    const bx = hx - 1.15, BL = 3.2, bz = hz - 0.22 - BL / 2;     // bed runs from the headboard out into the room
    box(2.2, 0.32, BL, bx, 0.16, bz, m.bed, { solid: true });                       // frame
    box(2.24, 1.15, 0.16, bx, 0.575, hz - 0.12, m.bed, { r: 0.06, solid: true });   // headboard, touching the frame
    box(0.14, 0.5, 0.14, bx - 1.05, 0.25, bz - BL / 2 + 0.07, m.bed, { r: 0.03 }); // foot posts
    box(0.14, 0.5, 0.14, bx + 1.05, 0.25, bz - BL / 2 + 0.07, m.bed, { r: 0.03 });
    studs(bx - 1.0, hz - 0.12, 11, 1, 1.15, m.bed);
    box(2.04, 0.24, BL - 0.1, bx, 0.43, bz + 0.03, m.sheet, { r: 0.08 });            // mattress
    box(2.12, 0.07, BL * 0.62, bx, 0.58, bz - BL * 0.19, m.couch, { r: 0.035 });     // duvet over the foot two-thirds
    box(2.12, 0.075, 0.22, bx, 0.585, bz + BL * 0.12 + 0.02, m.sheet, { r: 0.035 }); // folded-back sheet edge
    box(0.82, 0.17, 0.46, bx - 0.5, 0.64, hz - 0.55, m.white, { r: 0.08 });          // pillows on the mattress
    box(0.82, 0.17, 0.46, bx + 0.5, 0.64, hz - 0.55, m.white, { r: 0.08 });
    seat('the bed', bx - 0.6, 0.6, bz - 0.6, -Math.PI / 2, 1.0, 2.6, bx - 1.75, bz - 0.6);
    // nightstand + lamp
    box(0.6, 0.6, 0.6, hx - 0.35, 0.3, 0.6, m.wood, { solid: true });
    cyl(0.12, 0.16, 0.05, hx - 0.35, 0.63, 0.6, m.black);
    cyl(0.025, 0.025, 0.4, hx - 0.35, 0.85, 0.6, m.metal, 8);
    cyl(0.14, 0.22, 0.26, hx - 0.35, 1.12, 0.6, m.led);

    // ── Desk + gaming chair + monitor (west wall, near the door side) ──
    const dx = -hx + 0.55, dz = 3.4;
    box(1.0, 0.07, 2.2, dx, 0.82, dz, m.black, { r: 0.02, solid: true });
    for (const z of [dz - 1.0, dz + 1.0]) box(0.9, 0.78, 0.06, dx, 0.39, z, m.black, { r: 0.02 });
    box(0.06, 0.7, 1.5, dx - 0.05, 1.27, dz, m.black, { r: 0.02 });                 // monitor
    const mon = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.62), new THREE.MeshBasicMaterial({ map: canvasTex(512, 228, (c, w, h) => {
      c.fillStyle = '#10141f'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#2a7fff'; c.fillRect(16, 16, w * 0.6, 14);
      for (let i = 0; i < 9; i++) { c.fillStyle = ['#7ee787', '#ffa657', '#d2a8ff', '#79c0ff'][i % 4]; c.fillRect(16 + (i % 3) * 18, 46 + i * 18, 80 + ((i * 53) % 220), 8); }
    }), toneMapped: false }));
    mon.position.set(dx - 0.015 + 0.04, 1.27, dz); mon.rotation.y = Math.PI / 2; g.add(mon);
    box(0.25, 0.04, 0.6, dx + 0.15, 0.87, dz, m.grey, { r: 0.01 });                  // keyboard
    box(0.08, 0.3, 0.08, dx - 0.1, 0.98, dz, m.metal, { r: 0.01 });
    // chair
    const chx = dx + 1.05;
    cyl(0.32, 0.36, 0.06, chx, 0.06, dz, m.black, 5);
    cyl(0.04, 0.04, 0.38, chx, 0.27, dz, m.metal, 8);
    box(0.7, 0.14, 0.7, chx, 0.5, dz, m.red, { r: 0.06 });
    box(0.14, 0.95, 0.66, chx + 0.36, 1.0, dz, m.red, { r: 0.07 });
    box(0.15, 0.2, 0.5, chx + 0.37, 1.35, dz, m.black, { r: 0.05 });
    solids.push(new THREE.BoxGeometry(0.7, 0.5, 0.7).translate(chx, 0.25, dz));
    seat('the desk chair', chx, 0.58, dz, -Math.PI / 2, 0.8, 0.8, chx + 0.9, dz - 0.9);

    // ── Armchair (angled, back-left of the rug) ──
    const ax = -4.3, az = 0.6, ag = new THREE.Group();
    ag.position.set(ax, 0, az); ag.rotation.y = -0.5; g.add(ag);
    box(1.2, 0.4, 1.0, 0, 0.2, 0, m.couchDark, { parent: ag });
    box(1.2, 0.85, 0.24, 0, 0.62, 0.42, m.couch, { r: 0.1, parent: ag });
    for (const x of [-0.6, 0.6]) box(0.22, 0.66, 1.0, x, 0.33, 0, m.couch, { r: 0.09, parent: ag });
    box(1.0, 0.16, 0.8, 0, 0.47, -0.05, m.couch, { r: 0.07, parent: ag });
    solids.push(new THREE.BoxGeometry(1.25, 0.5, 1.1).applyMatrix4(new THREE.Matrix4().makeRotationY(-0.5)).translate(ax, 0.25, az));
    seat('the armchair', ax, 0.55, az, Math.PI - 0.5, 1.0, 0.9, ax + 0.75, az - 0.95);

    // ── Bookshelf, mini fridge, plant, posters, string lights ──
    const sx = hx - 0.3, sz = -3.6;
    box(0.5, 2.2, 1.6, sx, 1.1, sz, m.wood, { solid: true });
    for (let i = 0; i < 4; i++) {
      box(0.46, 0.04, 1.5, sx - 0.02, 0.4 + i * 0.5, sz, m.woodLight, { r: 0.01 });
      for (let b = 0; b < 7; b++) {
        const bh = 0.28 + ((b * 7 + i * 3) % 5) * 0.025;
        box(0.3, bh, 0.12, sx - 0.05, 0.42 + i * 0.5 + bh / 2, sz - 0.6 + b * 0.17,
          [m.red, m.blue, m.yellow, m.green, m.white, m.black][(b + i) % 6], { r: 0.01, shadow: false });
      }
    }
    box(0.7, 0.95, 0.65, hx - 0.4, 0.475, -1.8, m.white, { r: 0.05, solid: true });   // mini fridge
    box(0.04, 0.4, 0.04, hx - 0.76, 0.6, -1.6, m.metal, { r: 0.01 });
    cyl(0.25, 0.2, 0.42, -hx + 0.45, 0.21, -4.9, m.pot);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), m.plant);
      leaf.scale.set(0.5, 1.4, 0.5);
      leaf.position.set(-hx + 0.45 + Math.cos(i) * 0.14, 0.7 + (i % 3) * 0.1, -4.9 + Math.sin(i) * 0.14);
      leaf.rotation.z = Math.cos(i * 2) * 0.5; leaf.castShadow = true; g.add(leaf);
    }
    solids.push(new THREE.BoxGeometry(0.6, 1, 0.6).translate(-hx + 0.45, 0.5, -4.9));

    this.posters = [];
    for (const [x, y, z, ry, w, h] of [[-2.1, 2.0, hz - 0.03, Math.PI, 1.1, 1.5], [1.4, 2.0, hz - 0.03, Math.PI, 1.1, 1.5],
      [hx - 0.03, 2.3, -0.6, -Math.PI / 2, 1.0, 1.4], [-hx + 0.03, 2.2, 3.4, Math.PI / 2, 1.2, 0.8]]) {
      const pm = new THREE.MeshStandardMaterial({ roughness: 0.6 });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), pm);
      p.position.set(x, y, z); p.rotation.y = ry; g.add(p);
      this.posters.push({ mat: pm, w, h });
    }
    // string lights above the bed
    const bulbGeo = new THREE.SphereGeometry(0.05, 10, 8);
    for (let i = 0; i < 18; i++) {
      const z = bz - 1.6 + i * 0.19, y = 2.75 - Math.sin((i / 17) * Math.PI) * 0.25;
      const b = new THREE.Mesh(bulbGeo, m.led); b.position.set(hx - 0.06, y, z); g.add(b);
    }

    // ── Two merged colliders: the shell stops walking + the camera, furniture only stops walking ──
    const toWorld = new THREE.Matrix4().makeTranslation(DORM_ORIGIN.x, DORM_ORIGIN.y, DORM_ORIGIN.z);
    this.colliders = [[shell, 'DormShell', false], [solids, 'DormFurniture', true]].map(([list, name, noCam]) => {
      const mesh = new THREE.Mesh(mergeGeometries(list.map(b => b.applyMatrix4(toWorld))), new THREE.MeshBasicMaterial({ name: 'indoor' }));
      mesh.name = name;
      mesh.visible = false;
      mesh.userData.noCam = noCam;
      mesh.geometry.computeBoundsTree?.();
      mesh.updateMatrixWorld(true);
      this.scene.add(mesh);
      return mesh;
    });
    g.visible = false;
    this.applyStyle(this.style);
  }

  _drawPosters(set) {
    const themes = [
      [['#d0242c', '#1b1b1f', 'WEB OF\nBRICKS'], ['#1f5fbf', '#f5c518', 'BRICK\nCITY'], ['#f5c518', '#1b1b1f', 'STAY\nCURIOUS'], ['#111a33', '#ffffff', 'MIDTOWN\nSCIENCE']],
      [['#ff5ad1', '#1a0b2e', 'NIGHT\nSWING'], ['#00c2a8', '#0b1a2e', 'NEON\nBLOCKS'], ['#ffb03b', '#2e0b1a', 'RETRO\nWAVE'], ['#7b5cff', '#ffffff', 'LO-FI\nBEATS']],
      [['#e9e4da', '#1b1b1f', 'BAND\nTOUR'], ['#2b2b30', '#e9e4da', 'THE\nBRICKS'], ['#b7262f', '#e9e4da', 'LIVE\nTONIGHT'], ['#3f8f6a', '#e9e4da', 'SUMMER\nFEST']],
    ][set] ?? [];
    this.posters.forEach((p, i) => {
      const [bg, fg, text] = themes[i % themes.length];
      const tex = canvasTex(256, Math.round(256 * p.h / p.w), (c, w, h) => {
        c.fillStyle = bg; c.fillRect(0, 0, w, h);
        c.strokeStyle = fg; c.globalAlpha = 0.18; c.lineWidth = 2;
        for (let r = 20; r < w * 1.2; r += 26) { c.beginPath(); c.arc(w / 2, h * 0.38, r, 0, Math.PI * 2); c.stroke(); }
        for (let a = 0; a < 12; a++) { c.beginPath(); c.moveTo(w / 2, h * 0.38); c.lineTo(w / 2 + Math.cos(a / 12 * Math.PI * 2) * w, h * 0.38 + Math.sin(a / 12 * Math.PI * 2) * w); c.stroke(); }
        c.globalAlpha = 1;
        c.fillStyle = fg; c.textAlign = 'center';
        const lines = text.split('\n'), fs = Math.round(w / 5);
        c.font = `400 ${fs}px "Lilita One", system-ui, sans-serif`;
        lines.forEach((l, j) => c.fillText(l, w / 2, h * 0.72 + j * fs * 0.95 - (lines.length - 1) * fs * 0.4));
        c.strokeStyle = fg; c.lineWidth = 8; c.strokeRect(8, 8, w - 16, h - 16);
      });
      p.mat.map?.dispose();
      p.mat.map = tex;
      p.mat.needsUpdate = true;
    });
  }

  // ─── DOM: centre dot, sit prompt, decorate panel ────────────────────────

  _ui() {
    const root = document.createElement('div');
    root.id = 'dorm-ui';
    root.innerHTML = `<div id="dorm-dot"></div>
      <div id="dorm-prompt"><kbd>E</kbd><span></span></div>
      <button class="brick small" id="dorm-edit-btn" type="button">DECORATE <span class="keycap">N</span></button>
      <button class="brick small" id="dorm-flix-btn" type="button">SPIDEYFLIX <span class="keycap">T</span></button>
      <div id="dorm-panel" role="dialog" aria-label="Decorate your dorm"><h3>DECORATE</h3><div class="dorm-rows"></div></div>`;
    document.body.appendChild(root);
    this.prompt = root.querySelector('#dorm-prompt');
    this.promptText = this.prompt.querySelector('span');
    this.editBtn = root.querySelector('#dorm-edit-btn');
    this.panel = root.querySelector('#dorm-panel');
    this.editBtn.addEventListener('click', () => this._togglePanel());
    root.querySelector('#dorm-flix-btn').addEventListener('click', () => this.flix.toggle());
    const rows = this.panel.querySelector('.dorm-rows');
    for (const k of Object.keys(PALETTES)) {
      const row = document.createElement('div');
      row.className = 'dorm-row';
      row.innerHTML = `<span>${LABELS[k]}</span><div class="dorm-sw"></div>`;
      const sw = row.querySelector('.dorm-sw');
      PALETTES[k].forEach((col, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.k = k; b.dataset.i = i;
        b.setAttribute('aria-label', `${LABELS[k]} ${i + 1}`);
        b.style.background = k === 'poster' ? ['linear-gradient(135deg,#d0242c,#1f5fbf)', 'linear-gradient(135deg,#ff5ad1,#00c2a8)', 'linear-gradient(135deg,#e9e4da,#2b2b30)'][i] : col;
        b.addEventListener('click', () => this.setStyle(k, i));
        sw.appendChild(b);
      });
      rows.appendChild(row);
    }
  }

  _togglePanel() {
    const open = this.panel.classList.toggle('show');
    if (open) document.exitPointerLock?.();
  }

  _syncPanel() {
    this.panel?.querySelectorAll('.dorm-sw button').forEach(b => b.classList.toggle('on', this.style[b.dataset.k] === +b.dataset.i));
  }
}
