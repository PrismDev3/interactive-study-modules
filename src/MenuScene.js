/**
 * MenuScene.js — the title screen's cinematic backdrop: midnight sky over a LEGO New York,
 * Spider-Man crouched in a three-point superhero pose on the parapet of the Daily Bugle, the
 * big red sign on its steel frame behind him, a red fire escape down the tower, and a skyline
 * of brick towers with lit windows and a landmark spire beyond. Slow camera drift + mouse parallax; he stands and reacts to the menu.
 */
import * as THREE from 'three';
import { GFX } from './Perf.js?v=20';
import { LegoSpidey } from './LegoSpidey.js?v=183';
import { rigOpts, dressRig, heroOf } from './Characters.js?v=67';
import { applyGear } from './Gear.js?v=65';
import { reducedMotion } from './Settings.js?v=62';

const PITCH = 0.3;   // one stud, in minifig units (figure is ~1.9 tall)

/** LEGO plastic: smooth, slightly glossy, never mirror-like. */
const plastic = (color, rough = 0.36) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });

/** A brick of w×d studs and h plates, bottom at y=0, studs on top (instanced). */
function brick(w, d, h, color, { studs = true, rough } = {}) {
  const g = new THREE.Group();
  const mat = plastic(color, rough);
  const H = h * 0.12;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w * PITCH - 0.008, H, d * PITCH - 0.008), mat);
  body.position.y = H / 2;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  if (studs) {
    const inst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 14), mat, w * d);
    const m = new THREE.Matrix4();
    let k = 0;
    for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) {
      m.makeTranslation((i - (w - 1) / 2) * PITCH, H + 0.03, (j - (d - 1) / 2) * PITCH);
      inst.setMatrixAt(k++, m);
    }
    inst.castShadow = inst.receiveShadow = true;
    g.add(inst);
  }
  return g;
}

/** Vertical gradient sky dome with a soft sun glow. */
function skyDome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { sun: { value: new THREE.Vector3(-0.55, 0.16, -0.82).normalize() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vDir; uniform vec3 sun;
      void main(){
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 top = vec3(0.035, 0.045, 0.135), mid = vec3(0.10, 0.12, 0.28), low = vec3(0.52, 0.27, 0.33);
        vec3 c = mix(low, mid, smoothstep(-0.04, 0.20, h));
        c = mix(c, top, smoothstep(0.20, 0.88, h));
        float s = max(dot(normalize(vDir), sun), 0.0);
        c += vec3(0.72, 0.82, 1.0) * (pow(s, 90.0) * 0.55 + pow(s, 8.0) * 0.10);
        // Scattered brick-coloured light pollution along the skyline
        c += vec3(0.16, 0.08, 0.06) * smoothstep(0.16, -0.02, h) * smoothstep(-0.2, 0.0, h);
        // Sparse stars high above the haze
        vec3 cell = floor(normalize(vDir) * 260.0);
        float st = step(0.9972, fract(sin(dot(cell, vec3(12.9898, 78.233, 45.164))) * 43758.5453));
        c += vec3(0.78, 0.84, 1.0) * st * smoothstep(0.12, 0.4, h) * 0.9;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), mat);
}

const FACADES = [0xb3361f, 0x8a3a22, 0xc9b07a, 0xa0a5a9, 0xeeeae0, 0x6f86a3, 0xd8a24a, 0x958467];

export class MenuScene {
  constructor(canvas) {
    this.canvas = canvas;
    window.__menuScene = this;   // console debugging
    this.react = null;
    this.mouse = new THREE.Vector2();
    this.smooth = new THREE.Vector2();
    this.running = false;

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: GFX.antialias, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, GFX.maxRatio, 1.75));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = GFX.shadows;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    const s = this.scene = new THREE.Scene();
    s.fog = new THREE.Fog(0x1a1730, 40, 200);
    s.add(skyDome());
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 400);

    // Moonlight from behind-left, cool sky fill, warm city bounce
    s.add(new THREE.HemisphereLight(0x8fa4e0, 0x2a1c14, 0.58));
    const sun = new THREE.DirectionalLight(0xaec4ff, 1.5);
    sun.position.set(-6, 9, -4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    s.add(sun);
    const fill = new THREE.DirectionalLight(0x5b6fa8, 0.45);
    fill.position.set(5, 4, 6);
    s.add(fill);
    // Cool rim from behind-right separates the minifig from the skyline
    const rim = new THREE.DirectionalLight(0x86b4ff, 1.35);
    rim.position.set(4.5, 2.6, -5);
    s.add(rim);

    this._buildRooftop(s);
    this._buildSkyline(s);

    this.holder = new THREE.Group();
    this.holder.position.set(0, 0.36, 1.45);   // standing on the parapet cap  // on the roof behind the low parapet; lifted so the crouch's knee rests on the studs
    s.add(this.holder);

    window.addEventListener('pointermove', e => this.mouse.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1));
    this._resize = () => this.resize();
    window.addEventListener('resize', this._resize);
    this.resize();
    this.clock = new THREE.Clock();
  }

  /** Top of the Daily Bugle: grey brick tower, red fire escape, the big sign on its roof frame. */
  _buildRooftop(s) {
    const deck = brick(40, 34, 1, 0x6c6e68, { rough: 0.55 });
    deck.position.set(-2.4, -0.12, -3.6);
    s.add(deck);
    // Parapet: light grey bricks with a dark grey cap
    for (const x of [-7.5, -5.7, -3.9, -2.1, -0.3, 1.5, 3.0]) {
      const wall = brick(6, 4, 2, 0xa0a5a9);
      wall.position.set(x, 0.0, 1.45);
      s.add(wall);
      const cap = brick(6, 4, 1, 0x5a5e63);
      cap.position.set(x, 0.24, 1.45);
      s.add(cap);
    }
    // Tower face dropping away below the ledge, with cornice bands and a window grid
    const grey = plastic(0x8f9396, 0.55);
    const face = new THREE.Mesh(new THREE.BoxGeometry(12, 40, 11), grey);
    face.position.set(-2.4, -20.1, -3.7);
    face.receiveShadow = true;
    s.add(face);
    for (const y of [-0.35, -6.5, -13]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.35, 0.5), plastic(0x6c6e68));
      band.position.set(-2.4, y, 1.85);
      s.add(band);
    }
    const glass = plastic(0x9fc6e8, 0.15), frame = plastic(0xf4f4f4, 0.4);
    const wins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.75, 1.0, 0.06), glass, 84);
    const frames = new THREE.InstancedMesh(new THREE.BoxGeometry(0.95, 1.2, 0.04), frame, 84);
    const m = new THREE.Matrix4();
    for (let k = 0; k < 84; k++) {
      const x = -7.6 + (k % 7) * 1.55, y = -1.5 - Math.floor(k / 7) * 1.75;
      frames.setMatrixAt(k, m.makeTranslation(x, y, 1.82));
      wins.setMatrixAt(k, m.makeTranslation(x, y, 1.86));
    }
    s.add(frames, wins);

    // Red fire escape zig-zagging down the right-hand side
    const red = plastic(0xc91a09, 0.45);
    for (let k = 0; k < 8; k++) {
      const y = -1.4 - k * 1.75;
      const deckP = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 1.0), red);
      deckP.position.set(3.0, y, 2.35);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.06), red);
      rail.position.set(3.0, y + 0.55, 2.82);
      const post1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.06), red);
      post1.position.set(2.32, y + 0.28, 2.82);
      const post2 = post1.clone(); post2.position.x = 3.68;
      const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.9, 0.08), red);
      ladder.position.set(k % 2 ? 2.5 : 3.5, y - 0.85, 2.5);
      ladder.rotation.x = 0.35;
      s.add(deckP, rail, post1, post2, ladder);
    }

    // The sign: steel frame on the roof carrying DAILY BUGLE in red letters
    const steel = plastic(0x3a3d42, 0.5);
    const sign = new THREE.Group();
    for (const x of [-3.2, -1.1, 1.1, 3.2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.0, 0.16), steel);
      post.position.set(x, 1.5, -0.05);
      sign.add(post);
    }
    for (const y of [1.22, 2.9]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(6.7, 0.1, 0.1), steel);
      bar.position.set(0, y, 0);
      sign.add(bar);
    }
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 220;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const paint = () => {
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      g.font = '170px "Lilita One", "Arial Black", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = 26; g.strokeStyle = '#141414'; g.strokeText('DAILY BUGLE', 512, 118);
      g.lineWidth = 12; g.strokeStyle = '#f4f4f4'; g.strokeText('DAILY BUGLE', 512, 118);
      g.fillStyle = '#d01012'; g.fillText('DAILY BUGLE', 512, 118);
      tex.needsUpdate = true;
    };
    paint();
    document.fonts?.load('170px "Lilita One"').then(paint).catch(() => {});
    const letters = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 1.42), new THREE.MeshStandardMaterial({
      map: tex, transparent: true, alphaTest: 0.4, roughness: 0.35, side: THREE.DoubleSide, emissive: 0x220000, emissiveIntensity: 0.15 }));
    letters.position.set(0, 2.05, 0.1);
    letters.castShadow = true;
    sign.add(letters);
    sign.traverse(n => { if (n.isMesh) n.castShadow = true; });
    // Feet on the roof deck at the back of the tower, built big like the real one
    const foot = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.24, 0.6), steel);
    foot.position.set(0, 0.12, 0);
    sign.add(foot);
    sign.position.set(-3.0, 0, -7.6);   // behind Spider-Man, framed by the menu camera
    sign.rotation.y = 0.28;
    sign.scale.setScalar(1.0);
    s.add(sign);

    // Antenna with a blinking beacon
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 4, 8), steel);
    mast.position.set(3.1, 2, -3.2);
    s.add(mast);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
    tip.position.set(3.1, 4.05, -3.2);
    s.add(tip);
    this.beacon = tip;
  }

  _buildSkyline(s) {
    // Brick towers stepping back into the haze, with warm lit windows (instanced, two draws)
    const rnd = (() => { let a = 7; return () => ((a = (a * 16807) % 2147483647) / 2147483647); })();
    const box = new THREE.BoxGeometry(1, 1, 1);
    const blocks = [];
    for (let i = 0; i < 46; i++) {
      const row = i % 3;
      const z = -14 - row * 16 - rnd() * 8;
      const x = (rnd() * 2 - 1) * (22 + row * 18);
      const w = 4 + rnd() * 5, d = 4 + rnd() * 4, h = 8 + rnd() * (16 + row * 10);
      blocks.push({ x, z, w, d, h, c: FACADES[Math.floor(rnd() * FACADES.length)] });
    }
    // A landmark: stepped art-deco tower with a spire
    for (const [w, h, y] of [[7, 26, 0], [5, 10, 26], [3.4, 7, 36], [2, 5, 43]]) blocks.push({ x: -16, z: -48, w, d: w, h, c: 0xd4cfc4, y });
    const byColor = new Map();
    for (const b of blocks) { if (!byColor.has(b.c)) byColor.set(b.c, []); byColor.get(b.c).push(b); }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    for (const [c, list] of byColor) {
      const inst = new THREE.InstancedMesh(box, plastic(c, 0.6), list.length);
      list.forEach((b, i) => inst.setMatrixAt(i, m.compose(p.set(b.x, (b.y ?? 0) - 20 + b.h / 2, b.z), q, sc.set(b.w, b.h, b.d))));
      s.add(inst);
    }
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.5, 9, 8), plastic(0xc4c8ce, 0.3));
    spire.position.set(-16, 48 - 20 + 4.5, -48);
    s.add(spire);

    // Window grid on the faces that look at the camera
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffcf86, fog: true });
    const darkMat = new THREE.MeshBasicMaterial({ color: 0x1b2438, fog: true });
    const lit = [], dark = [];
    for (const b of blocks) {
      const cols = Math.max(2, Math.floor(b.w / 1.3)), rows = Math.floor(b.h / 1.6);
      for (let r = 1; r < rows; r++) for (let cI = 0; cI < cols; cI++) {
        const x = b.x - b.w / 2 + (cI + 0.5) * (b.w / cols), y = (b.y ?? 0) - 20 + r * 1.6, z = b.z + b.d / 2 + 0.02;
        (rnd() < 0.52 ? lit : dark).push([x, y, z]);
      }
    }
    const pane = new THREE.PlaneGeometry(0.55, 0.8);
    for (const [arr, mat] of [[lit, winMat], [dark, darkMat]]) {
      const inst = new THREE.InstancedMesh(pane, mat, arr.length);
      arr.forEach(([x, y, z], i) => inst.setMatrixAt(i, m.makeTranslation(x, y, z)));
      s.add(inst);
    }
    // Drifting LEGO clouds (stacked white plates), few and slow
    this.clouds = [];
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Group();
      const parts = [[6, 3, 0, 0], [4, 3, 0.6, 0.36], [3, 2, -0.9, 0.36]];
      for (const [w, d, ox, oy] of parts) {
        const b = brick(w, d, 3, 0xffffff, { studs: false, rough: 0.8 });
        b.position.set(ox, oy, 0);
        c.add(b);
      }
      c.scale.setScalar(3.2);
      c.position.set(-60 + i * 30, 26 + (i % 2) * 6, -90 - (i % 3) * 15);
      c.userData.speed = 0.6 + (i % 3) * 0.3;
      s.add(c);
      this.clouds.push(c);
    }
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Wide screens: Spider-Man sits in the right half, leaving the left for the logo and menu
    this.wide = w > 820;
    if (this.wide) this.camera.setViewOffset(w, h, -w * 0.21, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  /** Load (or swap) the minifig for an outfit code "suit|gear,gear". */
  async setOutfit(code) {
    this.want = code;
    const [suit, gear = ''] = (code || 'classic').split('|');
    const rig = dressRig(await new LegoSpidey(rigOpts(suit)).load(), suit);
    if (this.want !== code) return;
    if (!heroOf(suit)) applyGear(rig, gear.split(',').filter(Boolean));
    rig.root.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    if (this.rig) this.holder.remove(this.rig.root);
    this.rig = rig;
    rig.root.position.y = 0.06;   // clear the gameplay controller's -0.5 stand offset; plant feet directly on the studs
    this.holder.add(rig.root);
    this.ready = true;
  }

  /** Short reaction to a menu action: 'wave' | 'cheer' | 'flex' | 'spin' | 'look' | 'stand'. */
  reactTo(kind, secs = 1.8) {
    const t = this.clock.elapsedTime;
    if (kind === 'spin') this.react = { emote: null, until: t + secs, spin: true };
    else if (kind === 'look' || kind === 'stand') this.react = { emote: null, until: t + secs, look: kind === 'look' };
    else this.react = { emote: kind, until: t + secs };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();
    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      this._frame(Math.min(this.clock.getDelta(), 0.05));
    };
    loop();
  }

  stop() { this.running = false; }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._resize);
    this.scene.traverse(n => { if (n.isMesh) { n.geometry.dispose(); [].concat(n.material).forEach(m => m.dispose()); } });
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }

  _frame(dt) {
    const t = this.clock.elapsedTime, calm = reducedMotion();
    const react = this.react && t < this.react.until ? this.react : null;

    // Low, close camera looking up at him: slow drift + pointer parallax
    this.smooth.lerp(this.mouse, 1 - Math.exp(-3 * dt));
    const drift = calm ? 0 : Math.sin(t * 0.1) * 0.14;
    const yaw = 0.42 + drift + this.smooth.x * 0.05;
    const rad = this.wide ? 6.5 : 7.2;
    this.camera.position.set(Math.sin(yaw) * rad, 1.75 - this.smooth.y * 0.18 + (calm ? 0 : Math.sin(t * 0.17) * 0.06), 1.55 + Math.cos(yaw) * rad);
    this.camera.lookAt(0, 1.02, 0.8);

    for (const c of this.clouds) if (!calm) c.position.x = ((c.position.x + c.userData.speed * dt + 90) % 180) - 90;
    if (this.beacon) this.beacon.material.color.setHSL(0.01, 1, Math.sin(t * 3) > 0.2 ? 0.55 : 0.25);

    if (this.rig) {
      // Faces out over the city, glancing toward the camera; turns on the spot for LOCKER
      let face = 0.55 + this.smooth.x * 0.25;
      if (react?.spin) { face += (1 - (react.until - t) / 1.8) * Math.PI * 2; this._spun = true; }
      else if (this._spun) { this._spun = false; this.holder.rotation.y -= Math.PI * 2; }
      this.holder.rotation.y += (face - this.holder.rotation.y) * (1 - Math.exp(-6 * dt));
      // Idle: the three-point superhero crouch on the ledge; menu reactions make him stand up
      // Idle: standing tall on the ledge, looking out over the city
      this.rig.update(dt, { speed: 0, grounded: true, emote: react?.emote ?? null });
    }
    this.renderer.render(this.scene, this.camera);
    this._placeTag();
  }

  /** Keep the player's name floating just above Spider-Man's head. */
  _placeTag() {
    const el = this.tagEl;
    if (!el || !this.rig?.head) return;
    const p = this._tagP ??= new THREE.Vector3();
    this.rig.head.getWorldPosition(p);
    p.y += 0.75;
    p.project(this.camera);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    el.style.left = `${((p.x + 1) / 2) * w}px`;
    el.style.top = `${((1 - p.y) / 2) * h}px`;
    el.classList.toggle('show', !!el.textContent && p.z < 1);
  }
}
