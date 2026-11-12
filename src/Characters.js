/**
 * Characters.js — the playable character framework (Phase D).
 *
 * A hero is data: how its minifig is built (Spider-Man suit, or a decoded character skin),
 * extra gear (tentacles, glider), how it moves (web swing, glider flight), how hard it punches,
 * and two abilities on R and G. The outfit code carries the pick as "hero-<key>", so saving,
 * the Locker, online play and portraits all work through the same path as suits.
 *
 * Abilities run through Combat (aoe / damageEnemy), so they do real damage to real enemies.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Tendril, symbioteMaterial } from './Tendril.js?v=1';
import { isTypingTarget, overlayOpen } from './Input.js?v=2';
import { storySkills } from './StorySkills.js?v=5';

const metal = (c, m = 0.45, r = 0.32) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r });

const nearest = (cb, p, max = 20) => {
  let best = null, bd = max;
  for (const e of cb?.enemies ?? []) { if (!e.alive) continue; const d = e.root.position.distanceTo(p); if (d < bd) { best = e; bd = d; } }
  return best;
};

export const HEROES = {
  spiderman: {
    name: 'Spider-Man', swatch: ['#c8202a', '#1f3fa8'], price: 0, rig: null,
    move: { swing: true }, punch: 1,
    blurb: 'R web bomb wraps everyone near you, G fires three web shots, X zip-kicks through a crowd. Your suit comes from the Suits tab.',
    onPunch: (h, cb, c, target, fin) => {
      if (fin) cb.fx.burst(target.root.position.clone().setY(target.root.position.y + 1), { n: 14, colors: [0xffffff, 0xdfe6ee], speed: 4, up: 2, size: 0.09, life: 0.45 });
    },
    abilities: [
      { key: 'KeyR', name: 'WEB BOMB', cd: 7, cast: (h, ctx) => {
        const cb = ctx.combat, p = ctx.controller.root.position;
        let n = 0;
        for (const e of cb?.enemies ?? []) if (e.alive && e.root.position.distanceTo(p) < 6.5) { cb._webbed(e); cb.damageEnemy(e, 1, p.clone(), 4); n++; }
        cb?.fx.ring(p.clone().setY(p.y - 0.3), { n: 50, colors: [0xffffff, 0xe8eef4], speed: 10, size: 0.12, life: 0.55 });
        cb?.fx.burst(p.clone().setY(p.y + 1), { n: 30, colors: [0xffffff, 0xdfe6ee], speed: 7, up: 4, size: 0.1, life: 0.6 });
        if (!n) h.flash('WEB BOMB');
      } },
      { key: 'KeyG', name: 'TRIPLE SHOT', cd: 4, cast: (h, ctx) => {
        const cb = ctx.combat;
        if (!cb) return false;
        for (let k = 0; k < 3; k++) setTimeout(() => { cb._webCd = 0; cb.webShot(); }, k * 110);
      } },
      { key: 'KeyX', name: 'ZIP KICK', cd: 5, cast: (h, ctx) => {
        const c = ctx.controller, f = c.faceDir();
        c.isGrounded = false;
        c.velocity.set(f.x * 30, 4, f.z * 30);
        h.kick = { t: 0.28 };
        c._startTrick?.();
      } },
    ],
  },
  venom: {
    name: 'Venom', swatch: ['#141417', '#f2f2f2'], price: 15000, rig: { skin: 'venom', legsColor: 0x111114 }, scale: 1.0,   // the big-fig: Venom towers over everyone
    move: { swing: true, darkWebs: true }, punch: 2,
    blurb: 'Punches are tendril lashes that hit everyone around the target. R yanks a foe in, G slams, X bursts spikes out of the ground.',
    abilities: [
      { key: 'KeyR', name: 'TENDRIL PULL', cd: 5, cast: (h, ctx) => {
        const c = ctx.controller, cb = ctx.combat, p = c.root.position;
        let best = null, bd = 20;
        for (const e of cb?.enemies ?? []) {
          if (!e.alive) continue;
          const d = e.root.position.distanceTo(p);
          if (d < bd) { best = e; bd = d; }
        }
        if (!best) return false;
        cb.damageEnemy(best, 2, p.clone(), 2);
        h.pull = { e: best, t: 0 };                                   // tendril shoots out, grabs, reels them in
      } },
      { key: 'KeyG', name: 'SYMBIOTE SLAM', cd: 6, cast: (h, ctx) => {
        const c = ctx.controller;
        if (c.isGrounded) { c.isGrounded = false; c.velocity.y = 15; }
        else c.velocity.y = Math.min(c.velocity.y, -18);
        h.pendingSlam = { radius: 6, dmg: 3, color: 0x1c1c24 };
      } },
      { key: 'KeyX', name: 'SPIKE BURST', cd: 8, cast: (h, ctx) => {
        const c = ctx.controller, p = c.root.position;
        ctx.combat?.aoe(h.chest().setY(p.y), { fromAlly: true, radius: 5.5, dmg: 3, knock: 15, color: 0x0b0b12 });
        h.spikeBurst(p.clone().setY(p.y - 0.5));
      } },
    ],
  },
  docock: {
    name: 'Doctor Octopus', swatch: ['#3f5a3a', '#8a8f94'], price: 20000,
    rig: { skin: 'glb:doctoroctopus' }, gear: 'tentacles',   // the extracted Doc Ock minifig (face, hair, suit)
    // Kit from the source game's doctoroctopus.txt: DocOckCrackAttack, DocOckLungeShockwave,
    // DoctorOctopusStretch, Wall_Jump. He does not web-swing.
    move: { swing: false, wallJump: true }, punch: 1.5,
    blurb: 'Real LEGO Marvel kit: R Crack Attack smashes the ground ahead, G Lunge Shockwave leaps forward and slams, X Tentacle Stretch grabs a far foe and drags them in.',
    onPunch: (h, cb, c, target, fin) => {
      h.strikeT = Math.max(h.strikeT ?? 0, fin ? 0.45 : 0.22);
      for (const e of cb.enemies) if (e.alive && e !== target && e.root.position.distanceTo(c.root.position) < 3.4) cb.damageEnemy(e, 1, c.root.position.clone(), 7);
    },
    abilities: [
      { key: 'KeyR', name: 'CRACK ATTACK', cd: 4, cast: (h, ctx) => {
        // Tentacles hammer the ground in a line ahead: three impacts stepping forward
        const c = ctx.controller, f = c.faceDir(), p = c.root.position;
        for (let k = 1; k <= 3; k++) setTimeout(() => {
          const at = p.clone().addScaledVector(f, k * 2.6).setY(p.y + 0.6);
          ctx.combat?.aoe(at, { fromAlly: true, radius: 2.8, dmg: 2, knock: 10, color: 0x9aa1a8 });
        }, (k - 1) * 110);
        h.strikeT = 0.55;
      } },
      { key: 'KeyG', name: 'LUNGE SHOCKWAVE', cd: 6, cast: (h, ctx) => {
        const c = ctx.controller;
        if (!c.isGrounded && !c.isClimbing) return false;
        c.isGrounded = false; c.isClimbing = false;
        const f = c.faceDir();
        c.velocity.set(f.x * 16, 11, f.z * 16);
        h.strikeT = 0.35;
        setTimeout(() => ctx.combat?.aoe(h.chest(), { fromAlly: true, radius: 5.6, dmg: 3, knock: 15, color: 0x6b737a }), 650);
      } },
      { key: 'KeyX', name: 'TENTACLE STRETCH', cd: 5, cast: (h, ctx) => {
        const cb = ctx.combat, p = ctx.controller.root.position;
        const e = nearest(cb, p, 16);
        if (!e) return false;
        h.strikeT = 0.5;
        cb.damageEnemy(e, 2, p.clone(), 0);
        // Drag them to arm's length in front of Ock
        const f = ctx.controller.faceDir();
        e.root.position.set(p.x + f.x * 2.2, e.root.position.y, p.z + f.z * 2.2);
        if (e.vel) e.vel.set(0, 4, 0);
      } },
    ],
  },
  goblin: {
    name: 'Green Goblin', swatch: ['#2a6a2a', '#7a3e9d'], price: 20000, rig: { skin: 'glb:greengoblin' }, gear: 'glider',   // the real LEGO Marvel Green Goblin figure
    move: { swing: false, glider: true }, punch: 1.4,
    blurb: 'No webs: ride the goblin glider (G, Shift = supersonic), lob pumpkin bombs (R), X nose-dives from the glider into the ground (on foot: a five-bomb barrage).',
    onPunch: (h, cb, c, target, fin) => {
      const at = target.root.position.clone().setY(target.root.position.y + 1);
      cb.fx.burst(at, { n: fin ? 22 : 10, colors: [0x7dff5a, 0xd8ffcc, 0x2a6a2a], speed: 5, up: 3, size: 0.07, life: 0.3, gravity: 0 });
      if (target.cooldown !== undefined) target.cooldown = Math.max(target.cooldown, fin ? 1.4 : 0.6);   // stunned
    },
    abilities: [
      { key: 'KeyR', name: 'PUMPKIN BOMB', cd: 1.2, cast: (h, ctx) => {
        const c = ctx.controller;
        const f = new THREE.Vector3(); c.camera.getWorldDirection(f);
        h.throwBomb(c.root.position.clone().setY(c.root.position.y + 1.4), f);
      } },
      { key: 'KeyG', name: 'GLIDER', cd: 0.4, cast: (h, ctx) => { ctx.controller.setFlying(!ctx.controller.flying); } },
      { key: 'KeyX', name: 'NOSE DIVE', cd: 6, cast: (h, ctx) => {
        const c = ctx.controller;
        if (c.flying) {
          c.noseDive = 2.5;
          c.onNoseDiveLand = at => ctx.combat?.aoe(at, { fromAlly: true, radius: 6, dmg: 3, knock: 16, color: 0x7dff5a });
          return;
        }
        const f = new THREE.Vector3(); c.camera.getWorldDirection(f);
        for (let k = -2; k <= 2; k++) {
          const d = f.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), k * 0.22);
          setTimeout(() => h.throwBomb(c.root.position.clone().setY(c.root.position.y + 1.4), d), (k + 2) * 70);
        }
      } },
    ],
  },
};

/** "hero-venom" → 'venom'; anything else (a Spider-Man suit) → null. */
export const heroKeyOf = suit => (String(suit ?? '').startsWith('hero-') ? String(suit).slice(5) : null);
export const heroOf = suit => HEROES[heroKeyOf(suit)] ?? null;

/** LegoSpidey constructor options for a suit/hero code. */
export function rigOpts(suit) {
  const h = heroOf(suit);
  if (h) return h.rig;
  return suit && suit !== 'classic' ? { variant: suit } : null;
}

/** Add hero-only parts (tentacles, glider) and scale after the minifig loads. */
export function dressRig(rig, suit) {
  const h = heroOf(suit);
  if (!h) return rig;
  if (h.scale && h.scale !== 1) {
    rig.root.scale.setScalar(h.scale);
    rig.root.position.y += 0.5 * (h.scale - 1);    // keep the feet on the ground
  }
  if (h.gear === 'tentacles') {
    const t = docTentacles();
    rig.torso.add(t);
    rig.tentacles = t.userData.arms;
  }
  if (h.gear === 'glider') {
    const g = goblinGlider();
    rig.root.add(g);
    rig.glider = g;
    g.visible = false;
  }
  return rig;
}

/** Four segmented steel tentacles from a harness on the lower back, each ending in a claw. */
export function docTentacles() {
  const g = new THREE.Group();
  const steel = metal(0x9aa1a8), dark = metal(0x3a3d42, 0.3, 0.4), red = new THREE.MeshStandardMaterial({ color: 0xff3a2a, emissive: 0xaa1100, emissiveIntensity: 0.6 });
  const harness = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.14, 0.16), dark);
  harness.position.set(0, 0.86, -0.22);
  g.add(harness);
  g.userData.arms = [];
  const SEG = 9;
  for (let i = 0; i < 4; i++) {
    const s = i % 2 ? 1 : -1, top = i < 2;
    let parent = new THREE.Group();
    parent.position.set(s * 0.22, top ? 0.9 : 0.82, -0.28);
    g.add(parent);
    const root = parent, segs = [];
    for (let k = 0; k < SEG; k++) {
      const len = 0.26 - k * 0.012, r = 0.07 - k * 0.004;
      const piece = new THREE.Group();
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, len, 10), steel);
      cyl.position.y = len / 2;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, 0.014, 6, 14), dark);
      ring.rotation.x = Math.PI / 2;
      piece.add(cyl, ring);
      parent.add(piece);
      piece.position.y = k === 0 ? 0 : len + 0.012;
      segs.push(piece);
      parent = piece;
    }
    // Claw: three prongs and a red eye
    const claw = new THREE.Group();
    claw.position.y = 0.24;
    for (let f = 0; f < 3; f++) {
      const prong = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.2, 6), steel);
      const a = (f / 3) * Math.PI * 2;
      prong.position.set(Math.cos(a) * 0.05, 0.1, Math.sin(a) * 0.05);
      prong.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      claw.add(prong);
    }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), red);
    claw.add(eye);
    parent.add(claw);
    // Resting curl (the same pose HeroRuntime animates from), so previews never show them sticking straight up
    root.rotation.z = s * (top ? 1.0 : 1.9);
    root.rotation.x = top ? -0.5 : 0.4;
    segs.forEach((sg, k) => { sg.rotation.z = s * (top ? -0.1 : -0.17); sg.rotation.x = Math.sin(i * 1.7 + k * 0.6) * 0.12; });
    g.userData.arms.push({ root, segs, s, top, ph: i * 1.7 });
  }
  return g;
}

/** One bat wing in glider-model units: root at x=0, tip at +x, scalloped trailing edge. */
function batWingGeo() {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0.05); sh.lineTo(0.12, 0.09); sh.lineTo(0.30, 0.05); sh.lineTo(0.34, -0.06);
  sh.quadraticCurveTo(0.29, -0.03, 0.25, -0.09); sh.quadraticCurveTo(0.20, -0.05, 0.15, -0.11);
  sh.quadraticCurveTo(0.09, -0.06, 0.03, -0.10); sh.lineTo(0, -0.06); sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** Green Goblin's real glider from the source game (chars/vehicles/goblin_glider), under the feet. */
let gliderGltf = null;
function goblinGlider() {
  const g = new THREE.Group();
  const holder = new THREE.Group();
  holder.position.set(-0.1, -0.66, 0);      // centred under the feet (the model sits off-centre)
  holder.rotation.y = Math.PI;          // the source model faces -z
  holder.scale.setScalar(3.7);         // board-sized: the vehicle version is scaled for a seated pilot
  g.add(holder);
  gliderGltf ??= new GLTFLoader().loadAsync(new URL('../assets/models/vehicles/goblin_glider.glb', import.meta.url).href);
  gliderGltf.then(gltf => {
    // Skinned model (wings ride WingL/WingR bones): a plain clone breaks the skin binding
    const model = SkeletonUtils.clone(gltf.scene);
    // The source paints it GREY_1/GREY_2 through vertex colours, which read near-black in our
    // lighting: use LEGO dark bluish grey plastic with a little sheen instead.
    const plastic = new THREE.MeshStandardMaterial({ color: 0x8c939b, roughness: 0.3, metalness: 0, emissive: 0x30353b });   // self-lit a little: it sits in Goblin's shadow and read pitch black at night
    model.traverse(n => { if (n.isMesh) { n.material = plastic; n.castShadow = true; n.receiveShadow = false; } });
    // The extracted file has only the centre body (WingL/WingR are empty mount points), so build
    // the bat wings it is missing on either side of the body.
    const box = new THREE.Box3().setFromObject(model), cx = (box.min.x + box.max.x) / 2;
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(batWingGeo(), plastic);
      wing.castShadow = true;
      wing.scale.set(side * 0.72, 0.72, 0.72);
      wing.position.set(cx + side * 0.07, 0.05, 0.02);
      wing.rotation.z = side * 0.18;            // slight dihedral
      model.add(wing);
    }
    holder.add(model);
  }).catch(e => console.warn('[Characters] goblin glider failed to load', e?.message ?? e));
  // Exhaust glow at the tail (animated by the runtime through userData.jet)
  const jet = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffb030, emissive: 0xff7a00, emissiveIntensity: 1.2 }));
  jet.position.set(0, -0.5, -0.85);
  g.add(jet);
  g.userData.jet = jet;
  return g;
}

/**
 * Runtime for the player's hero: ability keys + cooldowns, animated gear, pumpkin bombs,
 * Venom's tendril line and landing slam. Owned by main, ticked every frame.
 */
export class HeroRuntime {
  constructor({ scene, controller, combat }) {
    Object.assign(this, { scene, controller, combat });
    this.cool = {};
    this.bombs = [];
    this.t = 0;
    this._line = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6), new THREE.MeshStandardMaterial({ color: 0x15151c, roughness: 0.3 }));
    this._line.visible = false;
    scene.add(this._line);
    this.hint = document.getElementById('perch-hint');
    document.addEventListener('keydown', e => {
      if (e.repeat || isTypingTarget(e) || overlayOpen()) return;
      const a = this.def?.abilities.find(x => x.key === e.code);
      if (a) this.use(a);
    });
  }

  // Any Spider-Man suit plays as Spider-Man, with his own kit
  get def() { return heroOf(this.controller.variant?.split('|')[0]) ?? HEROES.spiderman; }

  chest() { const p = this.controller.root.position; return new THREE.Vector3(p.x, p.y + 1, p.z); }

  /** Called when the hero is (re)selected: show its controls once. */
  announce() {
    const d = this.def;
    if (!d || !d.abilities.length || !this.hint) return;
    this.flash(d.abilities.map(a => `${a.key.replace('Key', '')}  ${a.name}`).join('      '), 6);
  }

  flash(text, secs = 1.5) {
    this._flash = { text, until: performance.now() + secs * 1000 };
  }

  use(a) {
    if (this.controller.inputLocked || document.body.classList.contains('cinematic')) return;
    if (this.controller.noPowers || this.controller.noWebs) return;   // story missions before the bite / before web-shooters
    const left = (this.cool[a.name] ?? 0) - performance.now();
    if (left > 0) { this.flash(`${a.name} READY IN ${Math.ceil(left / 1000)}s`); return; }
    const ok = a.cast(this, { controller: this.controller, combat: this.combat });
    if (ok === false) { this.flash(`${a.name}: NO TARGET`); return; }
    this.cool[a.name] = performance.now() + a.cd * 1000 * (storySkills.active('webflow') ? 0.88 : 1);
    this.combat?.sfx?.play('ability');
  }

  /** Ring of symbiote spikes erupting out of the ground around `at`. */
  spikeBurst(at) {
    this._spikeMat ??= symbioteMaterial();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.random() * 0.3, r = 1.3 + (i % 3) * 1.3 + Math.random() * 0.5;
      const h = 1.2 + Math.random() * 1.1;
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.16 + Math.random() * 0.1, h, 6), this._spikeMat);
      m.geometry.translate(0, h / 2, 0);
      m.position.set(at.x + Math.cos(a) * r, at.y, at.z + Math.sin(a) * r);
      m.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);      // lean outward
      m.scale.set(1, 0.01, 1);
      m.castShadow = true;
      this.scene.add(m);
      (this.spikes ??= []).push({ m, t: -i * 0.012 });
    }
  }

  throwBomb(from, dir) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), new THREE.MeshStandardMaterial({ color: 0xff7a00, emissive: 0x6a2a00, emissiveIntensity: 0.6, roughness: 0.4 }));
    m.position.copy(from);
    this.scene.add(m);
    const v = dir.clone().setY(0).normalize().multiplyScalar(19);
    v.y = 6 + dir.y * 12;
    this.bombs.push({ m, v, t: 0 });
  }

  update(dt) {
    this.t += dt;
    const c = this.controller, rig = c.rig, d = this.def;
    // Hint line: flashed messages take priority over the perch hint
    if (this.hint && this._flash) {
      if (performance.now() < this._flash.until) this.hint.textContent = this._flash.text;
      else this._flash = null;
    }
    // Iron Spider waldoes: extend on a strike
    if (this.strikeT > 0) this.strikeT -= dt;
    const ext = Math.max(0, this.strikeT ?? 0) * 2.2;
    for (const w of rig?.waldo ?? []) w.leg.scale.setScalar(1 + ext);
    // Doc Ock: tentacles writhe, plant when walking, lash out on a smash
    for (const a of rig?.tentacles ?? []) {
      const walk = Math.min(1, Math.hypot(c.velocity.x, c.velocity.z) / 8);
      const lash = Math.max(0, this.strikeT ?? 0) * 2.5;
      a.root.rotation.z = a.s * (a.top ? 1.0 : 1.9) + a.s * lash * 0.6;
      a.root.rotation.x = (a.top ? -0.5 : 0.4) + Math.sin(this.t * 2 + a.ph) * 0.15 + walk * Math.sin(this.t * 7 + a.ph) * 0.3;
      a.segs.forEach((sg, k) => {
        sg.rotation.x = Math.sin(this.t * 1.7 + a.ph + k * 0.6) * 0.12 - lash * 0.05;
        sg.rotation.z = a.s * (a.top ? -0.1 : -0.17) * (1 - lash) + Math.cos(this.t * 1.3 + a.ph + k * 0.5) * 0.06;
      });
    }
    // Goblin glider shows while flying; the jet flickers
    if (rig?.glider) {
      rig.glider.visible = !!c.flying;
      if (rig.glider.userData.jet) rig.glider.userData.jet.material.emissiveIntensity = 0.7 + Math.random() * 0.6;
    }
    // Spider-Man's zip kick: whoever is in the path when it ends gets kicked flying
    if (this.kick) {
      this.kick.t -= dt;
      const p = c.root.position;
      this.combat?.fx.burst(p.clone().setY(p.y + 0.8), { n: 2, colors: [0xffffff, 0xc4161c], speed: 1, up: 0.5, size: 0.08, life: 0.25, gravity: 0 });
      if (this.kick.t <= 0) {
        this.kick = null;
        this.combat?.aoe(this.chest(), { fromAlly: true, radius: 3.4, dmg: 2, knock: 16, color: 0xffffff });
      }
    }
    // Iron Spider's nano shield: a gold shimmer while it lasts
    if (this.shieldT > 0) {
      this.shieldT -= dt;
      if (Math.random() < 0.5) {
        const p = c.root.position, a = Math.random() * Math.PI * 2;
        this.combat?.fx.add({ pos: new THREE.Vector3(p.x + Math.cos(a) * 0.8, p.y + Math.random() * 1.8, p.z + Math.sin(a) * 0.8),
          vel: new THREE.Vector3(0, 1, 0), life: 0.4, size: 0.06, color: Math.random() < 0.5 ? 0xffe08a : 0xd9a22c, glow: 1 });
      }
    }
    // Doc Ock's toss: the thrown foe comes back down hard
    if (this.toss) {
      this.toss.t -= dt;
      if (this.toss.t <= 0) {
        const e = this.toss.e; this.toss = null;
        if (e.alive) {
          this.combat?.damageEnemy(e, 2, e.root.position.clone(), 4);
          this.combat?.fx.ring(e.root.position.clone(), { n: 30, colors: [0x9aa1a8, 0x5a5e63], speed: 7, size: 0.14, life: 0.5 });
        }
      }
    }
    // Venom's spikes: shoot up, hold, sink back into the ground
    for (const sp of this.spikes ?? []) {
      sp.t += dt;
      const k = sp.t < 0 ? 0.01 : sp.t < 0.1 ? sp.t / 0.1 : sp.t < 0.45 ? 1 : Math.max(0.01, 1 - (sp.t - 0.45) / 0.35);
      sp.m.scale.y = k;
      if (sp.t > 0.8) { this.scene.remove(sp.m); sp.m.geometry.dispose(); sp.done = true; }
    }
    if (this.spikes) this.spikes = this.spikes.filter(s => !s.done);
    // Venom's tendril yank: reach out (0.12 s), then reel the target in
    if (this.pull) {
      const P = this.pull, e = P.e;
      P.t += dt;
      this._tendril ??= new Tendril(this.scene, { radius: 0.1 });
      const from = this.chest().setY(c.root.position.y + 1.2), to = e.root.position.clone().setY(e.root.position.y + 1);
      if (P.t > 0.12 && e.alive !== false) {
        const want = c.root.position.clone().add(e.root.position.clone().sub(c.root.position).setY(0).normalize().multiplyScalar(1.8));
        e.root.position.x += (want.x - e.root.position.x) * Math.min(1, dt * 11);
        e.root.position.z += (want.z - e.root.position.z) * Math.min(1, dt * 11);
      }
      this._tendril.visible = true;
      this._tendril.set(from, to, { time: this.t, wobble: P.t < 0.12 ? 1.6 : 0.6, reach: Math.min(1, P.t / 0.12), thick: 1.2 });
      if (P.t > 0.5) { this.pull = null; this._tendril.visible = false; }
    }
    // Old tendril flash (other heroes)
    if (this.tendril) {
      const t = this.tendril;
      t.t -= dt;
      const mid = t.from.clone().add(t.to).multiplyScalar(0.5), len = t.from.distanceTo(t.to);
      this._line.position.copy(mid);
      this._line.scale.set(1, len, 1);
      this._line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), t.to.clone().sub(t.from).normalize());
      this._line.visible = t.t > 0;
      if (t.t <= 0) this.tendril = null;
    }
    // Venom's slam lands
    if (this.pendingSlam && c.isGrounded) {
      const s = this.pendingSlam;
      this.pendingSlam = null;
      this.combat?.aoe(this.chest().setY(c.root.position.y), { fromAlly: true, radius: s.radius, dmg: s.dmg, knock: 16, color: s.color });
    }
    // Pumpkin bombs: arc, then burst on anything solid or after 2.5 s
    for (const b of this.bombs) {
      b.t += dt;
      b.v.y -= 22 * dt;
      b.m.position.addScaledVector(b.v, dt);
      b.m.rotation.x += dt * 8;
      const ground = this.combat?.groundAt?.(b.m.position.x, b.m.position.z, b.m.position.y + 2) ?? -Infinity;
      if (b.t > 2.5 || b.m.position.y <= ground + 0.2) {
        this.combat?.aoe(b.m.position.clone(), { fromAlly: true, radius: 4.2, dmg: 3, knock: 12, color: 0xff7a00 });
        this.scene.remove(b.m);
        b.done = true;
      }
    }
    this.bombs = this.bombs.filter(b => !b.done);
    void d;
  }
}
