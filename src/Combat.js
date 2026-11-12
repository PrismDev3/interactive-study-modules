/**
 * Combat.js — hearts, punching, enemies (HYDRA soldiers + bosses), projectiles and LEGO break-apart.
 * Enemies use the ripped minifig mesh with textures decoded from the DS ROM (assets/models/chars).
 */
import * as THREE from 'three';
import { disposeRigRoot } from './GlbMinifig.js?v=147';
import { LegoSpidey } from './LegoSpidey.js?v=183';
import { docTentacles } from './Characters.js?v=67';
import { storySkills } from './StorySkills.js?v=5';
import { Effects } from './Effects.js?v=61';
import { uiSfx } from './UiKit.js?v=68';
import { Sfx } from './Sfx.js?v=68';
import { Tendril, symbioteMaterial } from './Tendril.js?v=1';
import { keyFor, keyName } from './Binds.js?v=12';

const SAND = [0xd9b46a, 0xc9a05a, 0xe8cc8a, 0xb88d4a, 0xf0d9a0];
const GOO = [0x0e0e12, 0x1c1c24, 0x2a2a36];

export const ENEMY_TYPES = {
  hydra:   { name: 'HYDRA Soldier', skin: 'hydrasoldier', hp: 3, speed: 4.2, melee: 1, studs: 60 },
  hydraGun:{ name: 'HYDRA Gunner', skin: 'hydrasoldier', hp: 3, speed: 3.6, studs: 80,
             ranged: { rate: 2.8, speed: 40, color: 0xffe2a0, dmg: 1, range: 30, keep: 12, bullet: true } },
  goblin:  { name: 'Green Goblin', skin: 'greengoblin', hp: 14, speed: 9, scale: 1.1, boss: true, fly: true, studs: 2500,
             ranged: { rate: 2.0, speed: 15, color: 0xff7a00, dmg: 1, range: 40, bomb: true, radius: 3.4 } },
  venom:   { name: 'Venom', skin: 'venom', legsColor: 0x111114, hp: 16, speed: 7.5, scale: 1.35, boss: true, melee: 1, leap: true, studs: 3000 },
  sandman: { name: 'Sandman', skin: 'sandman', hp: 20, speed: 3.6, scale: 1.9, boss: true, melee: 2, slam: true, sand: true, studs: 3500,
             ranged: { rate: 3.0, speed: 17, color: 0xd9b46a, dmg: 1, range: 24, keep: 3.5, bomb: true, radius: 2.8, sand: true } },
  loki:    { name: 'Loki', skin: 'loki', hp: 15, speed: 5, boss: true, teleport: true, summon: 'hydra', studs: 4000,
             ranged: { rate: 1.5, speed: 26, color: 0x5dff5d, dmg: 1, range: 40, keep: 11 } },
  // Street crews: every thug is drawn from a pool of real henchman figures, so no two gangs look alike
  thug:    { name: 'Street Thug', skin: ['glb:goon_kingpina', 'glb:goon_kingpinc', 'glb:goon_inmate', 'glb:goon_inmate1', 'glb:goon_inmate2',
             'glb:goon_inmate3', 'glb:goon_inmate4', 'glb:goon_brotherhoodm_01', 'glb:goon_brotherhoodf_01'], hp: 3, speed: 4.4, melee: 1, studs: 50 },
  thugGun: { name: 'Armed Thug', skin: ['glb:goon_kingpinb', 'glb:goon_raftguard', 'glb:goon_aim'], hp: 3, speed: 3.8, studs: 70,
             ranged: { rate: 2.6, speed: 40, color: 0xffe2a0, dmg: 1, range: 28, keep: 11, bullet: true } },
  brute:   { name: 'Bruiser', skin: ['glb:goon_inmate2', 'glb:goon_inmate4', 'glb:goon_kingpinc'], hp: 8, speed: 3.4, scale: 1.3, melee: 2, slam: true, studs: 160 },
  symbiote:{ name: 'Symbiote Trooper', skin: 'glb:goon_symbiotehazmat', hp: 4, speed: 6.6, melee: 1, leap: true, studs: 120 },
  pyro:    { name: 'Pyro', skin: 'glb:goon_brotherhoodm_fire', hp: 4, speed: 3.6, studs: 110,
             ranged: { rate: 3.0, speed: 15, color: 0xff6a00, dmg: 1, range: 24, keep: 9, bomb: true, radius: 2.6 } },
  cryo:    { name: 'Cryo', skin: 'glb:goon_brotherhoodm_ice', hp: 4, speed: 3.8, studs: 110,
             ranged: { rate: 1.8, speed: 30, color: 0x9fe8ff, dmg: 1, range: 30, keep: 12 } },
  sparky:  { name: 'Electro Goon', skin: 'glb:goon_brotherhoodm_elec', hp: 4, speed: 4, studs: 110,
             ranged: { rate: 2.4, speed: 26, color: 0xffe94a, dmg: 1, range: 28, keep: 10, spread: 2 } },
  doombot: { name: 'Doombot', skin: 'glb:goon_doombot', hp: 7, speed: 2.8, scale: 1.1, studs: 180,
             ranged: { rate: 2.2, speed: 45, color: 0x5dff5d, dmg: 1, range: 32, keep: 13, bullet: true } },   // eye lasers
  vulture: { name: 'The Vulture', skin: 'glb:vulture', hp: 14, speed: 9, scale: 1.1, boss: true, fly: true, studs: 2500,
             ranged: { rate: 1.6, speed: 24, color: 0xc4c8ce, dmg: 1, range: 40, spread: 2 } },
  docock:  { name: 'Doctor Octopus', skin: 'glb:doctoroctopus', tentacles: true, hp: 20, speed: 4.2, scale: 1.3, boss: true, melee: 2, slam: true, studs: 3500 },
  lizard:  { name: 'The Lizard', skin: 'glb:lizard', hp: 18, speed: 8, scale: 1.1, boss: true, melee: 2, leap: true, studs: 3200 },
  mysterio:{ name: 'Mysterio', skin: 'glb:mysterio', hp: 16, speed: 5, scale: 1.1, boss: true, teleport: true, summon: 'thug', studs: 4000,
             ranged: { rate: 1.4, speed: 22, color: 0x7affb0, dmg: 1, range: 40, keep: 10 } },
  harrygoblin: { name: 'New Goblin', skin: 'greengoblin', hp: 16, speed: 10, scale: 1.05, boss: true, fly: true, studs: 3000,
             ranged: { rate: 1.6, speed: 16, color: 0xff7a00, dmg: 1, range: 40, bomb: true, radius: 3.4 } },
  magneto: { name: 'Magneto', skin: 'magneto', hp: 18, speed: 6, boss: true, fly: true, studs: 5000,
             ranged: { rate: 1.3, speed: 24, color: 0xb24bff, dmg: 1, range: 45, spread: 3 } },
};

const MAX_HEARTS = 4;
const PUNCH_RANGE = 2.6;
const tmpV = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

// Footstep/landing debris per surface: colours, count and how it moves
const GROUND_FX = {
  asphalt:  { colors: [0x3c4046, 0x55595f, 0x2b2e33], n: 3, size: 0.06, up: 0.7, speed: 0.9, life: 0.35, gravity: 9 },   // grit that drops fast
  paint:    { colors: [0xf4f4f4, 0x4c5157, 0xdddddd], n: 3, size: 0.06, up: 0.7, speed: 0.9, life: 0.35, gravity: 9 },
  sidewalk: { colors: [0xd8d2c6, 0xb4ada2, 0xc8c4bc], n: 3, size: 0.07, up: 0.9, speed: 1, life: 0.45, gravity: 2.5 }, // pale floaty dust
  concrete: { colors: [0xd8d2c6, 0xb4ada2, 0x9a958c], n: 3, size: 0.07, up: 0.9, speed: 1, life: 0.45, gravity: 2.5 },
  stone:    { colors: [0xb8b2a6, 0x8e887d, 0xd0cabe], n: 3, size: 0.07, up: 0.8, speed: 1, life: 0.4, gravity: 4 },
  path:     { colors: [0xdcbd7e, 0xc29a5a, 0xe8d3a2], n: 5, size: 0.08, up: 1.3, speed: 1.2, life: 0.7, gravity: 1.8 }, // sandy puffs that hang
  grass:    { colors: [0x4c9e3f, 0x6cc04a, 0x3a7a2e, 0x7a5a32], n: 4, size: 0.06, up: 1.8, speed: 0.8, life: 0.55, gravity: 7 }, // blades + dirt kicked up
  leaves:   { colors: [0x2e8b3a, 0x1f6b35, 0x6cc04a], n: 4, size: 0.08, up: 1.5, speed: 1, life: 0.8, gravity: 3 },
  water:    { colors: [0xbfe6ff, 0xffffff, 0x5fb3e6], n: 7, size: 0.07, up: 3, speed: 1.3, life: 0.5, gravity: 14 },   // splash
  steel:    { colors: [0xffe08a, 0xffffff, 0xffb02e], n: 2, size: 0.04, up: 1.2, speed: 2.2, life: 0.25, gravity: 6 },  // sparks off metal
  iron:     { colors: [0xffe08a, 0xffffff, 0xffb02e], n: 2, size: 0.04, up: 1.2, speed: 2.2, life: 0.25, gravity: 6 },
  chrome:   { colors: [0xffe08a, 0xffffff], n: 2, size: 0.04, up: 1.2, speed: 2.2, life: 0.25, gravity: 6 },
  bark:     { colors: [0x6b3a1f, 0x8a5a32, 0x4a2814], n: 3, size: 0.07, up: 0.9, speed: 1, life: 0.45, gravity: 6 },
};
const _gc = new THREE.Color();
/** Particles for an unknown surface (roofs, brick, props): its own colour, lighter and darker, as dust. */
function groundFx(kind, color = 0xb4ada2) {
  const k = String(kind || '').toLowerCase();
  const hit = GROUND_FX[k] ?? Object.entries(GROUND_FX).find(([n]) => k.includes(n))?.[1];
  if (hit) return hit;
  _gc.setHex(color);
  const lo = _gc.clone().multiplyScalar(0.7).getHex(), hi = _gc.clone().lerp(new THREE.Color(0xffffff), 0.35).getHex();
  return { colors: [color, lo, hi], n: 3, size: 0.07, up: 0.9, speed: 1, life: 0.45, gravity: 3 };
}

/** Shared enemy marker: a small red downward chevron over the head (bosses get a gold one). */
const MARKERS = {};
function enemyMarker(boss = false) {
  const key = boss ? 'boss' : 'foe';
  if (!MARKERS[key]) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.beginPath(); g.moveTo(10, 18); g.lineTo(54, 18); g.lineTo(32, 50); g.closePath();
    g.fillStyle = boss ? '#ffc23a' : '#e8303a'; g.fill();
    g.lineWidth = 5; g.strokeStyle = '#1a0d0d'; g.lineJoin = 'round'; g.stroke();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    MARKERS[key] = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false });
  }
  const s = new THREE.Sprite(MARKERS[key]);
  s.name = 'EnemyMarker';
  s.scale.setScalar(boss ? 0.5 : 0.36);
  s.position.y = 2.45;
  s.renderOrder = 5;
  s.raycast = () => {};              // never block webs, punches or camera rays
  return s;
}

export class Combat {
  constructor({ scene, controller, hud, ui, cityMeshes }) {
    this.scene = scene;
    this.player = controller;
    this.hud = hud;
    this.ui = ui;
    this.meshes = cityMeshes;
    this.maxHearts = MAX_HEARTS + (storySkills.active('heart') ? 1 : 0);
    this.hearts = this.maxHearts;
    this.dmgMul = 1;          // Gauntlet perks raise this
    this.enemies = [];
    this.projectiles = [];
    this.debris = [];
    this.pickups = [];
    this.fx = new Effects(scene);
    this.sfx = uiSfx;   // one shared sound engine
    this.allies = [];        // summoned friends: same damage rules as enemies
    this.beams = [];
    this.playerTarget = { player: true, root: controller.root };
    this.onAgentDown = null;
    this.frozen = false;     // true during cutscenes
    this.invuln = 0;
    this.combo = 0;
    this.chain = 0;
    this.lastPunch = -9;
    this.t = 0;
    this.onDefeated = null;  // (enemy) => void
    this.ray = Object.assign(new THREE.Raycaster(), { firstHitOnly: true });
    this._down = new THREE.Vector3(0, -1, 0);
    ui.setHearts(this.hearts, this.maxHearts);

    document.addEventListener('keydown', e => {
      if (e.code === 'KeyF' && !e.repeat) this.playerAttack();
      if (e.code === 'KeyV' && !e.repeat) this.webShot();
      if (e.code === 'AltLeft') { e.preventDefault(); if (!e.repeat) this.dodge(); }
    });
  }

  // ─── World queries ───────────────────────────────────────────────────────
  groundAt(x, z, fromY) {
    this.ray.set(tmpV.set(x, fromY + 2, z), this._down);
    this.ray.far = 60;
    const hit = this.ray.intersectObjects(this.meshes, false)[0];
    return hit ? hit.point.y : fromY - 0.5;
  }

  lineOfSight(a, b) {
    const d = tmpV.subVectors(b, a);
    const len = d.length();
    this.ray.set(a, d.divideScalar(len));
    this.ray.far = len;
    return !this.ray.intersectObjects(this.meshes, false)[0];
  }

  /** Open street spot `minR..maxR` from `center`, roughly at its height. */
  spotNear(center, minR, maxR) {
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, r = minR + Math.random() * (maxR - minR);
      const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
      const y = this.groundAt(x, z, center.y + 3);
      if (Math.abs(y - (center.y - 0.5)) < 3 && this.lineOfSight(new THREE.Vector3(center.x, center.y + 1, center.z), new THREE.Vector3(x, y + 1, z))) {
        return new THREE.Vector3(x, y + 0.5, z);
      }
    }
    return center.clone().add(new THREE.Vector3(minR, 0, 0));
  }

  // ─── Enemies ─────────────────────────────────────────────────────────────
  async spawn(kind, pos, scaleHp = 1) {
    const T = ENEMY_TYPES[kind];
    const skin = Array.isArray(T.skin) ? T.skin[Math.floor(Math.random() * T.skin.length)] : T.skin;
    const rig = await new LegoSpidey(skin ? { skin, legsColor: T.legsColor } : { torso: T.torso, legs: T.legs }).load();
    // Villains without a decoded skin get their signature props
    if (T.tentacles) { const t = docTentacles(); rig.torso.add(t); rig.tentacles = t.userData.arms; }
    if (T.tint) {   // Connors transformed: scaly green all over
      const tint = new THREE.Color(T.tint);
      rig.root.traverse(n => { if (n.isMesh) for (const m of [].concat(n.material)) { m.color?.multiply(tint); } });
    }
    if (T.tail) {
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.4, 10), new THREE.MeshStandardMaterial({ color: 0x3f8f3a, roughness: 0.5 }));
      tail.rotation.x = -1.2;
      tail.position.set(0, 0.62, -0.75);
      rig.torso.add(tail);
    }
    if (T.bowl) {
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1 }));
      bowl.position.y = 0.28;
      rig.head.add(bowl);
      const cape = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.0, 0.05), new THREE.MeshStandardMaterial({ color: 0x5a2a7a, roughness: 0.6 }));
      cape.position.set(0, 0.95, -0.26);
      rig.torso.add(cape);
    }
    if (T.wings) for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.7), new THREE.MeshStandardMaterial({ color: 0x9aa1a8, metalness: 0.5, roughness: 0.3 }));
      w.position.set(s * 0.85, 1.25, -0.25);
      w.rotation.z = s * 0.35;
      rig.torso.add(w);
    }
    const root = new THREE.Group();
    root.add(rig.root);
    const scale = T.scale ?? 1;
    root.position.copy(pos);
    root.scale.setScalar(0.01);
    root.add(enemyMarker(T.boss));   // small red chevron: tells foes apart from civilians
    this.scene.add(root);
    const e = { skin,
      kind, T, rig, root, scale,
      hp: Math.round(T.hp * scaleHp), maxHp: Math.round(T.hp * scaleHp),
      vel: new THREE.Vector3(), cooldown: 1 + Math.random(), windup: 0, hurt: 0, attack: 0,
      grounded: true, groundY: pos.y - 0.5, groundCheck: 0, alive: true, age: 0,
      special: 3 + Math.random() * 2, swoop: 0, orbit: Math.random() * Math.PI * 2,
    };
    this.enemies.push(e);
    return e;
  }

  get bossAlive() { return this.enemies.find(e => e.alive && e.T.boss); }
  get aliveCount() { return this.enemies.filter(e => e.alive).length; }

  /** Hit-stop: game time nearly freezes for `secs` so the impact lands (player's own hits only). */
  hitPause(secs) { this.pauseT = Math.max(this.pauseT ?? 0, secs); }

  /** The dt the game world should use this frame (main.js); camera shake and net keep real time. */
  worldDt(dt) {
    if (!(this.pauseT > 0)) return dt;
    this.pauseT -= dt;
    return dt * 0.08;
  }

  damageEnemy(e, dmg, from, knock = 6, { breakGuard = false, launch = false } = {}) {
    if (!e.isAgent) dmg *= this.dmgMul ?? 1;
    if (!e.isAgent && storySkills.active('impact')) dmg *= 1.2;
    if (!e.alive || (e.T.fly && !e.isAgent && e.swoop <= 0 && e.root.position.y - this.player.root.position.y > 3)) return false;
    // Mashing doesn't work: after a quick string of hits a foe raises its guard, blocks, then hits back
    const now = this.t;
    const airborne = !e.grounded && !e.T.fly;                                 // launched foes can't block
    if (e.guard > now && !airborne) {
      if (breakGuard) {
        e.guard = 0; e.combo = 0;
        e.cooldown = Math.max(e.cooldown, 1.2);
        this._sparks(e.root.position.clone().setY(e.root.position.y + 1.6 * e.scale), 0xffd23f);
        this.hud?.toast?.('GUARD BREAK');
      } else {
        this._sparks(e.root.position.clone().setY(e.root.position.y + 1.2 * e.scale), 0x8fd0ff);
        this.sfx?.play?.('hit');
        e.windup = 0; e.hurt = 0;
        e.cooldown = Math.min(e.cooldown, 0.35);                              // blocked: a quick, readable swing back
        this._chainBreak();
        return false;
      }
    }
    e.combo = now - (e.lastHit ?? -9) < 1.1 ? (e.combo ?? 0) + 1 : 1;
    e.lastHit = now;
    if (launch) e.combo = 0;
    // Only long unbroken strings get blocked: 5-hit finishers (and counters, webs) get through
    if (e.combo >= (e.T.boss ? 4 : 6) && !e.T.fly) { e.guard = now + (e.T.boss ? 1.4 : 0.9); e.combo = 0; }
    e.cooldown = Math.max(e.cooldown, e.T.boss ? 0.45 : 0.7);                // hitstun: no instant trades
    e.hp -= dmg;
    e.hurt = 0.35;
    e.windup = 0;
    e.rig.flash(0.9);
    const away = tmpV.subVectors(e.root.position, from).setY(0).normalize();
    e.vel.x += away.x * knock / e.scale;
    e.vel.z += away.z * knock / e.scale;
    if (!e.T.fly) { e.vel.y = (launch ? (e.T.boss ? 5 : 9) : 2.2) / e.scale; e.grounded = false; }
    this._sparks(e.root.position.clone().setY(e.root.position.y + 1.2 * e.scale), 0xffffff);
    if (e.hp <= 0) this._defeat(e);
    return true;
  }

  /** Free a removed foe's per-spawn GPU data. Geometry/textures tagged `cached` (GlbMinifig model cache)
   *  or `shared` stay; everything else was made for this spawn. Without this every wave leaked GPU programs/uniforms. */
  _disposeRig(e) { disposeRigRoot(e.root); }

  _defeat(e) {
    e.alive = false;
    this.sfx.play('boom', { pos: e.root.position });
    this.shatter(e.rig, e.root.position.clone());
    this.scene.remove(e.root);
    this._disposeRig(e);
    this.hud.burstStuds(e.root.position.clone(), e.T.studs, e.groundY);
    if (Math.random() < (e.T.boss ? 1 : 0.25)) this._dropHeart(e.root.position.clone(), e.groundY);
    if (e.T.boss) this.ui.setBoss(null);
    this.onDefeated?.(e);
  }

  clearEnemies() {
    for (const e of this.enemies) { this._clearWarn(e); if (e.alive) { e.alive = false; this.scene.remove(e.root); this._disposeRig(e); } }
    this.enemies = [];
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles = [];
    this.ui.setBoss(null);
  }

  // ─── Player ──────────────────────────────────────────────────────────────
  /** Combo meter: landed hits in a row. Resets after 2.2 s without a hit, or when you get hit or blocked. */
  _chainHit() {
    this.chain = (this.chain ?? 0) + 1;
    this._chainAt = this.t;
    const el = this._chainEl ??= Object.assign(document.createElement('div'), { id: 'combo-meter' });
    if (!el.isConnected) document.body.append(el);
    el.innerHTML = `<b>${this.chain}</b><span>HITS</span>`;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop', 'show');
    el.classList.toggle('hot', this.chain >= 10);
    this.sfx.play('combo', { n: this.chain });
  }

  _chainBreak() {
    this.chain = 0;
    this._chainEl?.classList.remove('show', 'hot');
  }

  /** Dodge roll: a short burst with i-frames. Rolling through a foe's wind-up is a perfect dodge,
   *  which staggers it and makes your next punch on it a counter. */
  dodge() {
    const c = this.player;
    if (this.frozen || this.dead || c.inputLocked || c.dorm || c.isClimbing || c.webPhysics?.isSwinging || !c.isGrounded) return;
    if (this.t - (this._dodgeAt ?? -9) < 0.6) return;
    this._dodgeAt = this.t;
    const pos = c.root.position;
    let threat = null, td = 4;
    for (const e of this.enemies) {
      if (!e.alive || !(e.windup > 0)) continue;
      const d = e.root.position.distanceTo(pos) - 0.4 * (e.scale - 1);
      if (d < td) { threat = e; td = d; }
    }
    // Direction: held movement keys (camera-relative), else sideways from the threat, else backwards.
    const k = c._keys ?? {};
    let ix = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    let iz = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0);
    let dx, dz;
    if (ix || iz) {
      const yaw = c._yaw ?? 0, cs = Math.cos(yaw), sn = Math.sin(yaw);
      dx = ix * cs + iz * sn; dz = -ix * sn + iz * cs;
    } else if (threat) {
      const ax = pos.x - threat.root.position.x, az = pos.z - threat.root.position.z;
      const side = (this._dodgeSide = -(this._dodgeSide || 1));
      dx = -az * side + ax * 0.4; dz = ax * side + az * 0.4;
    } else {
      dx = -Math.sin(c.root.rotation.y); dz = -Math.cos(c.root.rotation.y);
    }
    const n = Math.hypot(dx, dz) || 1;
    c.velocity.x = dx / n * 15; c.velocity.z = dz / n * 15;
    c.landKind = 'roll'; c.landDur = c.landT = 0.42;
    this.invuln = Math.max(this.invuln, 0.38);
    this.sfx.play('release', { vol: 0.8, pitch: 1.15 });
    if (threat && threat.windup <= (threat.T.slam ? 0.5 : 0.32)) {
      threat.cooldown = Math.max(threat.cooldown, 1.6);
      this._counter = { e: threat, until: this.t + 1.4 };
      this.invuln = Math.max(this.invuln, 0.6);
      this.hitPause(0.12);
      this._sparks(threat.root.position.clone().setY(threat.root.position.y + 2 * threat.scale), 0x7fd7ff);
      this.hud.toast('PERFECT DODGE');
    }
  }

  playerAttack() {
    const c = this.player;
    if (this.frozen || this.dead || c.inputLocked || c.dorm || c.isClimbing || c.webPhysics?.isSwinging) return;
    const pos = c.root.position;
    if (!c.isGrounded && pos.y - this.groundAt(pos.x, pos.z, pos.y) > 2.5 && this.t >= (this._slamReady ?? 0)) {
      // Dive slam: a crowd-clearer on a cooldown, not the whole fight
      this._slamReady = this.t + 3;
      this.slamming = true;
      c.velocity.set(c.velocity.x * 0.3, -32, c.velocity.z * 0.3);
      return;
    }
    if (this.t < (this._stumbleUntil ?? 0)) return;
    // Rhythm, not mashing: the next hit only chains if pressed after the swing lands (0.28 s).
    // Pressing early stumbles: the string resets and you lose a beat.
    if (this.t - this.lastPunch < 0.28) {
      if (this.t - this.lastPunch > 0.05 && this.combo > 0) {
        this._stumbleUntil = this.t + 0.3;
        this.combo = -1;                                       // next accepted press starts a fresh string
        this._chainBreak();
      }
      return;
    }
    this.combo = this.t - this.lastPunch < 0.8 && this.combo >= 0 ? (this.combo + 1) % 5 : 0;   // 5-hit string, finisher on the 5th
    this.lastPunch = this.t;
    c.attackT = 1;
    c.attackArm = this.combo % 2 ? 1 : -1;

    // Auto-target the nearest enemy in reach and turn to face it
    // Aim assist: prefer the foe you're facing, and reach further (up to 8 m) for one in front of you
    let best = null, bestD = 4.5, bestS = Infinity;
    const fyaw = c.root.rotation.y, ffx = Math.sin(fyaw), ffz = Math.cos(fyaw);
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = e.root.position.distanceTo(pos) - 0.4 * (e.scale - 1);
      if (Math.abs(e.root.position.y - pos.y) >= 2.5 * e.scale) continue;
      const ex = e.root.position.x - pos.x, ez = e.root.position.z - pos.z, eh = Math.hypot(ex, ez) || 1;
      const facing = (ex * ffx + ez * ffz) / eh;
      if (d > (facing > 0.6 ? 8 : 4.5)) continue;
      const s = d - facing * 1.5;
      if (s < bestS) { best = e; bestD = d; bestS = s; }
    }
    if (!best) bestD = 4.5;
    // No villain in reach: civilians can be punched too (LEGO-style, they break apart)
    let npc = null;
    if (!best && this.life) {
      for (const n of this.life.npcs) {
        if (!n.active) continue;
        const d = n.root.position.distanceTo(pos);
        if (d < bestD) { npc = n; bestD = d; }
      }
    }
    // PvP rooms: other players can be punched too
    let remote = null;
    if (!best && !npc && this.remoteTargets) {
      for (const p of this.remoteTargets()) {
        const d = p.root.position.distanceTo(pos);
        if (d < bestD) { remote = p; bestD = d; }
      }
    }
    // Summoned characters run by the room owner's game
    let ghost = null;
    if (!best && !npc && !remote && this.ghostTargets) {
      for (const g of this.ghostTargets()) {
        const d = g.root.position.distanceTo(pos);
        if (d < bestD) { ghost = g; bestD = d; }
      }
    }
    const target = best ?? npc ?? remote ?? ghost;
    if (target) {
      const dx = target.root.position.x - pos.x, dz = target.root.position.z - pos.z;
      c.root.rotation.y = Math.atan2(dx, dz);
      const venom = c.hero?.name === 'Venom', reachP = venom ? 3.9 : PUNCH_RANGE;
      if (bestD > reachP - 0.6) {
        const n = Math.hypot(dx, dz) || 1;
        const ls = bestD > 4.5 ? 16 : 9;                       // assisted long lunge closes the gap
        c.velocity.x = dx / n * ls; c.velocity.z = dz / n * ls; // lunge in
      }
      if (bestD <= reachP) {
        const finisher = this.combo === 4;
        this.sfx.play('melee');
        let pw = c.hero?.punch ?? 1;
        const ctr = this._counter;
        if (ctr && best === ctr.e && this.t < ctr.until) {
          this._counter = null; pw *= 2.5;
          this.combo = 4; this.ui.shake(0.45);
          this._sparks(best.root.position.clone().setY(best.root.position.y + 1.2 * best.scale), 0x7fd7ff);
          this.hud.toast('COUNTER!');
        }
        if (venom) this._venomLash(c, target, finisher);
        else this.heroes?.def?.onPunch?.(this.heroes, this, c, target, finisher);
        const mul = 1 + Math.min(0.5, Math.floor(this.chain / 5) * 0.1);   // long streaks hit harder
        if (best && this.damageEnemy(best, Math.max(1, Math.round((finisher ? 2.5 : 1) * pw * mul)), pos, (finisher ? 9 : 2.5) * Math.min(pw, 1.6), { breakGuard: finisher || pw > 2, launch: finisher })) {
          this.hitPause((finisher ? 0.09 : 0.045) + (best.T.boss ? 0.03 : 0));
          this._chainHit();
          if (!c.isGrounded) c.velocity.y = Math.max(c.velocity.y, 3.2);    // air combo: hang in the air while you juggle
        }
        else if (npc) this._hitNpc(npc, pos, finisher ? 2 : 1);
        else if (ghost) { this.onHitGhost(ghost, finisher ? 2 : 1); this._sparks(ghost.root.position.clone().setY(ghost.root.position.y + 1.2), 0xffffff); }
        else if (remote) { this.onHitRemote(remote, finisher); this._sparks(remote.root.position.clone().setY(remote.root.position.y + 1.2), 0xffffff); }
        this.ui.shake(finisher ? 0.35 : 0.15);
      }
    }
  }

  /** Venom's punches are tendril lashes: whip out of the shoulder, hit the target and slap anyone beside it. */
  _venomLash(c, target, finisher) {
    this._lashPool ??= Array.from({ length: 4 }, () => new Tendril(this.scene, { radius: 0.085 }));
    const sides = finisher ? [-1, 1] : [c.attackArm ?? 1];
    const tp = target.root.position;
    for (const side of sides) {
      const t = this._lashPool.find(x => !x.busy) ?? this._lashPool[0];
      t.busy = true;
      (this._lashes ??= []).push({ t, side, target, life: finisher ? 0.32 : 0.22, max: finisher ? 0.32 : 0.22 });
    }
    // Cleave: everyone close to the target takes a hit too
    for (const e of this.enemies) {
      if (!e.alive || e === target || e.root.position.distanceTo(tp) > 2.6) continue;
      this.damageEnemy(e, finisher ? 2 : 1, c.root.position.clone(), finisher ? 10 : 6);
    }
    const at = tp.clone().setY(tp.y + 1);
    this.fx.burst(at, { n: finisher ? 26 : 10, colors: [0x0b0b12, 0x1c1c2a, 0x3a4a8a], speed: finisher ? 6 : 3.5, up: 2.5, size: 0.12, life: 0.5, gravity: 12 });
    if (finisher) this.fx.ring(tp.clone().setY(tp.y - 0.4), { n: 30, colors: [0x0b0b12, 0x2a2a3a], speed: 8, size: 0.14, life: 0.45 });
  }

  _tickLashes(dt) {
    if (!this._lashes?.length) return;
    const c = this.player, p = c.root.position, yaw = c.root.rotation.y;
    for (const l of this._lashes) {
      l.life -= dt;
      const k = 1 - l.life / l.max;                                   // 0 → 1 over the lash
      const reach = k < 0.45 ? k / 0.45 : 1 - (k - 0.45) / 0.55 * 0.9;
      const from = new THREE.Vector3(p.x + Math.cos(yaw) * 0.35 * l.side, p.y + 1.25, p.z - Math.sin(yaw) * 0.35 * l.side);
      const to = l.target.root.position.clone(); to.y += 1;
      l.t.visible = l.life > 0;
      if (l.life > 0) l.t.set(from, to, { time: this.t + l.side, wobble: 1.4, reach: Math.max(0.05, reach), thick: 1.1 });
      else l.t.busy = false;
    }
    this._lashes = this._lashes.filter(l => l.life > 0);
  }

  _hitNpc(n, from, dmg) {
    this.life.onPunchPlayer ??= pos => { this.damagePlayer(1, pos); this.ui?.shake?.(0.2); };
    const p = n.root.position.clone();
    this._sparks(p.clone().setY(p.y + 1.2), 0xffffff);
    if (this.life.hitNpc(n, from, dmg)) {
      this.shatter(n.rig, p);
      this.hud.burstStuds(p, 40, n.groundY);
    }
  }

  _landSlam() {
    this.slamming = false;
    const pos = this.player.root.position;
    this._ring(pos.clone().setY(pos.y - 0.45), 3.8, 0xffffff);
    this.ui.shake(0.5);
    let hits = 0;
    for (const e of this.enemies) {
      if (e.alive && e.root.position.distanceTo(pos) < 4 + e.scale && this.damageEnemy(e, this.chain >= 5 ? 2 : 1, pos, 10)) hits++;
    }
    if (hits) this.hitPause(0.08);
    for (const n of this.life?.npcs ?? []) {
      if (n.active && n.root.position.distanceTo(pos) < 4) this._hitNpc(n, pos, 2);
    }
    this.life?.scare(pos, 14);
  }

  damagePlayer(n, from) {
    if (this.invuln > 0 || this.dead || this.frozen || this.noDamage) return;
    this._chainBreak();
    const c = this.player;
    const wouldFall = this.hearts - n <= 0;
    if (wouldFall && storySkills.active('laststand') && !this._lastStandUsed) {
      this.hearts = 1;
      this._lastStandUsed = true;
      this.invuln = 2.8;
      this.hud.toast('CARRY IT FORWARD');
    } else {
      this.hearts = Math.max(0, this.hearts - n);
      this.invuln = 1.1;
    }
    c.hurtT = 0.4;
    c.rig?.flash?.(1);
    const away = tmpV.subVectors(c.root.position, from).setY(0).normalize();
    c.velocity.x = away.x * 9; c.velocity.z = away.z * 9; c.velocity.y = 5;
    c.isGrounded = false;
    if (c.webPhysics?.isSwinging) c.webPhysics.releaseWeb(false);
    c.isClimbing = false;
    this.ui.setHearts(this.hearts, this.maxHearts);
    this.ui.hurt();
    this.ui.shake(0.3);
    if (this.hearts <= 0) this._playerDie();
  }

  _playerDie() {
    const c = this.player;
    this.sfx.play('fail');
    this.dead = true;
    const pos = c.root.position.clone();
    this.shatter(c.rig, pos);
    c.rig.root.visible = false;
    c.inputLocked = true;
    const lost = this.hud.spillStuds(pos, this.groundAt(pos.x, pos.z, pos.y));
    if (lost) this.hud.toast(`-${lost.toLocaleString()}`);
    setTimeout(() => {
      this.dead = false;
      this.hearts = this.maxHearts;
      this._lastStandUsed = false;
      this.invuln = 2.5;
      c.velocity.set(0, 0, 0);
      c.rig.root.visible = true;
      c.inputLocked = this.frozen;
      this.ui.setHearts(this.hearts, this.maxHearts);
    }, 1800);
  }

  // ─── Effects ─────────────────────────────────────────────────────────────
  /** LEGO break-apart: every minifig piece flies off, bounces, then fades. */
  shatter(rig, center) {
    this.sfx.play('brick', { pos: center });
    const groundY = this.groundAt(center.x, center.z, center.y);
    for (const m of rig.meshes) {
      m.updateWorldMatrix(true, false);
      const piece = new THREE.Mesh(m.geometry, m.material.clone());
      m.matrixWorld.decompose(piece.position, piece.quaternion, piece.scale);
      piece.material.transparent = true;
      piece.material.emissive?.setRGB(0, 0, 0);
      piece.castShadow = true;
      this.scene.add(piece);
      const out = piece.position.clone().sub(center).setY(0).normalize();
      this.debris.push({
        mesh: piece, life: 2.6, ground: groundY,
        vel: new THREE.Vector3(out.x * (2 + Math.random() * 4), 5 + Math.random() * 5, out.z * (2 + Math.random() * 4)),
        spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14),
      });
    }
  }

  _sparks(pos, color) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(Combat._sparkGeo ??= new THREE.BoxGeometry(0.12, 0.12, 0.12), mat);   // shared: sparks fire on every hit
      s.userData.v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(9);
      g.add(s);
    }
    g.position.copy(pos);
    this.scene.add(g);
    this.debris.push({ group: g, life: 0.35, mat });
  }

  /** Ground telegraph for a slam: outline at the real damage radius plus a disc that fills in. */
  _warnDisc(p, groundY, radius, dur) {
    const C = Combat._warnGeo ??= {
      edge: new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2),
      disc: new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2),
    };
    const mat = o => new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, depthWrite: false, ...o });
    const g = new THREE.Group();
    const edge = new THREE.Mesh(C.edge, mat({ opacity: 0.85 }));
    const fill = new THREE.Mesh(C.disc, mat({ opacity: 0.18 }));
    fill.scale.setScalar(0.01);
    g.add(edge, fill);
    g.scale.setScalar(radius);
    g.position.set(p.x, groundY + 0.06, p.z);
    g.renderOrder = 2;
    g.userData = { fill, dur, t0: this.t };
    this.scene.add(g);
    return g;
  }

  _clearWarn(e) {
    const g = e.warn; e.warn = null;
    if (!g) return;
    this.scene.remove(g);
    for (const m of g.children) m.material.dispose();
  }

  _ring(pos, radius, color) {
    const mesh = new THREE.Mesh(Combat._ringGeo ??= new THREE.TorusGeometry(1, 0.12, 6, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true }));
    mesh.rotation.x = Math.PI / 2;
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.debris.push({ ring: mesh, life: 0.45, radius });
  }

  _dropHeart(pos, groundY) {
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.35);
    shape.bezierCurveTo(-0.6, 0.05, -0.35, 0.45, 0, 0.2);
    shape.bezierCurveTo(0.35, 0.45, 0.6, 0.05, 0, -0.35);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
    geo.center();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xe0161e, emissive: 0x700008, roughness: 0.3 }));
    mesh.position.set(pos.x, groundY + 1, pos.z);
    this.scene.add(mesh);
    this.pickups.push({ mesh, y: groundY + 1, life: 12 });   // gone after 12 s, flashing for the last 4
  }

  _fire(e, target) {
    const R = e.T.ranged;
    const from = e.root.position.clone().setY(e.root.position.y + 1.3 * e.scale);
    this.sfx.play(R.sand ? 'hit' : 'shot', { pos: from });
    const shots = R.spread ?? 1;
    if (!R.bullet) this.fx.burst(from, { n: R.sand ? 24 : 10, colors: R.sand ? SAND : [R.color, 0xffffff], speed: 3, up: 1.5, size: R.sand ? 0.16 : 0.1, life: 0.35, gravity: R.sand ? 10 : 0 });
    for (let i = 0; i < shots; i++) {
      const mesh = R.sand
        ? new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), new THREE.MeshStandardMaterial({ color: R.color, roughness: 0.9, flatShading: true }))
        : R.bullet
          // Plain gunmen fire small bullet tracers, not glowing energy orbs (those are for powered villains)
          ? new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.7), new THREE.MeshBasicMaterial({ color: R.color }))
          : new THREE.Mesh(new THREE.SphereGeometry(R.bomb ? 0.32 : 0.22, 10, 8), new THREE.MeshBasicMaterial({ color: R.color }));
      mesh.position.copy(from);
      const aim = target.clone().sub(from);
      if (R.bomb) {
        // Lob a pumpkin bomb so it lands on the target
        const flat = Math.hypot(aim.x, aim.z), tFlight = Math.max(0.6, flat / R.speed);
        const vel = new THREE.Vector3(aim.x / tFlight, (aim.y + 0.5 * 22 * tFlight * tFlight) / tFlight, aim.z / tFlight);
        this.projectiles.push({ mesh, vel, gravity: 22, life: 5, R, owner: e, friendly: false,
          dmg: R.dmg, color: R.color, radius: R.radius ?? 0, kind: R.sand ? 'sand' : 'grenade' });
      } else {
        aim.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), (i - (shots - 1) / 2) * 0.18);
        if (R.bullet) mesh.lookAt(mesh.position.clone().add(aim));
        this.projectiles.push({ mesh, vel: aim.multiplyScalar(R.speed), gravity: 0, life: 3, R, owner: e, friendly: false,
          dmg: R.dmg, color: R.color, radius: 0, kind: R.sand ? 'sand' : 'energy' });
      }
      this.scene.add(mesh);
    }
  }

  _explode(pos, radius, R = {}) {
    if (R.sand) {
      this._ring(pos, radius, 0xe8c27a);
      this.fx.burst(pos, { n: 60, colors: SAND, speed: 7, up: 6, size: 0.2, life: 1.1, gravity: 16, spread: 1, ground: pos.y - 1 });
      this.ui.shake(0.15);
    } else {
      this._ring(pos, radius, 0xff9a3a);
      this._sparks(pos, 0xff7a00);
      this.fx.burst(pos, { n: 30, colors: [0xff7a00, 0xffc23a, 0x5a5a5a], speed: 8, up: 5, size: 0.16, life: 0.7 });
    }
    const pp = this.player.root.position;
    if (pp.distanceTo(pos) < radius) this.damagePlayer(1, pos);
    for (const a of this.allies) {
      if (a.alive && a.root.position.distanceTo(pos) < radius + 0.7) this.damageAlly(a, 1, pos);
    }
    this.sfx.play('boom', { pos });
  }

  // ─── Per-frame ───────────────────────────────────────────────────────────
  /** Anyone wedged inside a wall (rays out of their chest hit a surface within 0.3 m on 3+ sides) is moved out. */
  _unstick() {
    const R = this._usRay ??= new THREE.Ray();
    const near = p => {
      let walls = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        R.origin.set(p.x, p.y + 1, p.z); R.direction.set(dx, 0, dz);
        if (this.meshes.some(m => m.geometry?.boundsTree?.raycastFirst(R, THREE.DoubleSide, 0, 0.3))) walls++;
      }
      return walls >= 3;
    };
    const pp = this.player.root.position;
    for (const e of [...this.enemies, ...this.allies]) {
      if (!(e.alive ?? true) || !e.root) continue;
      if (near(e.root.position)) e.root.position.copy(this.spotNear(pp, 3, 8));
    }
  }

  /** Keep fighters from standing inside each other: villains, allies, civilians and the player. */
  _separate() {
    const bodies = [];
    const add = (root, r, push = true) => root && bodies.push({ p: root.position, r, push });
    for (const e of this.enemies) if (e.alive) add(e.root, 0.42 * (e.scale ?? 1));
    for (const a of this.allies) if (a.alive) add(a.root, 0.42);
    for (const n of this.life?.npcs ?? []) if (n.active) add(n.root, 0.38);
    add(this.player.root, 0.42, false);                   // the player pushes, isn't pushed
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const A = bodies[i], B = bodies[j];
      const dx = B.p.x - A.p.x, dz = B.p.z - A.p.z, min = A.r + B.r;
      if (Math.abs(A.p.y - B.p.y) > 1.6) continue;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), push = (min - d) / d;
      const wa = A.push ? (B.push ? 0.5 : 1) : 0, wb = B.push ? (A.push ? 0.5 : 1) : 0;
      A.p.x -= dx * push * wa; A.p.z -= dz * push * wa;
      B.p.x += dx * push * wb; B.p.z += dz * push * wb;
    }
  }

  update(dt) {
    if (this.chain && this.t - (this._chainAt ?? 0) > 2.2) this._chainBreak();
    const cine = document.body.classList.contains('cinematic');
    for (const k in MARKERS) MARKERS[k].visible = !cine;          // no markers over villains in cutscenes
    this.t += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    const c = this.player;
    c.attackT = Math.max(0, (c.attackT ?? 0) - dt / 0.28);
    c.hurtT = Math.max(0, (c.hurtT ?? 0) - dt);
    c.slamming = this.slamming;
    if (c.rig?.flash) c.rig.flash(this.invuln > 0 && !this.dead ? (Math.sin(this.t * 40) > 0 ? 0.35 : 0) : 0);
    if (this.slamming && (c.isGrounded || c.isClimbing || c.webPhysics?.isSwinging)) {
      if (c.isGrounded) this._landSlam(); else this.slamming = false;
    }

    this._separate();
    this._unstickT = (this._unstickT ?? 0) - dt;
    if (this._unstickT <= 0) { this._unstickT = 1; this._unstick(); }

    // Summoned allies run their kits on the same tick as the villains
    if (this.allies.some(a => !a.alive)) this.allies = this.allies.filter(a => a.alive);
    for (const a of this.allies) a.tick(dt, this.frozen);

    const pp = c.root.position;
    const chest = pp.clone().setY(pp.y + 0.9);
    let boss = null;

    this._feet(c, dt);
    this._tickWebShots(dt);
    this._tickLashes(dt);
    for (const e of this.enemies) {
      if (e.warn && (!e.alive || !(e.windup > 0 || e.leaping))) this._clearWarn(e);
      else if (e.warn && e.leaping) {   // leap telegraph fills over the flight time
        const k = Math.min(1, (this.t - e.warn.userData.t0) / e.warn.userData.dur);
        e.warn.userData.fill.scale.setScalar(Math.max(0.01, k));
        e.warn.userData.fill.material.opacity = 0.18 + 0.32 * k;
      }
      if (!e.alive) continue;
      e.age += dt;
      e.root.scale.setScalar(Math.min(e.scale, e.root.scale.x + dt * e.scale * 4));
      // Hurt flash; while winding up an attack the foe blinks, so you can read it and dodge
      e.rig.flash(e.hurt > 0 ? e.hurt * 2 : e.windup > 0 ? (Math.sin(e.windup * 40) > 0 ? 0.45 : 0.08) : 0);
      if (e.T.boss) boss = e;
      // Webbed up: stuck in place until the webbing gives
      if (e.webStun > 0) {
        e.webStun -= dt;
        e.rig.update(dt, { speed: 0, grounded: true });
        if (e.webStun <= 0 && e.cocoon) { e.root.remove(e.cocoon); e.cocoon = null; e.webs = 0; }
        continue;
      }
      if (e.ai) { e.ai.tick(dt, this.frozen); continue; }
      if (this.frozen) { e.rig.update(dt, { speed: 0, grounded: true }); this._faceTowards(e, pp, dt); continue; }
      this._think(e, dt);
    }
    if (boss) this.ui.setBoss(boss.T.name, boss.hp / boss.maxHp, boss.T.face ?? [].concat(boss.T.skin)[0]);

    // Separation so enemies don't stack into one blob
    const alive = this.enemies.filter(e => e.alive && !e.T.fly);
    for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i].root.position, b = alive[j].root.position;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = 1.1 * (alive[i].scale + alive[j].scale) / 2;
      if (d > 0.001 && d < min) {
        const push = (min - d) / 2 / d;
        a.x -= dx * push; a.z -= dz * push; b.x += dx * push; b.z += dz * push;
      }
    }

    // Projectiles — team-filtered, colliding with whatever stands on the other side
    for (const p of this.projectiles) {
      p.life -= dt;
      p.t = (p.t ?? 0) + dt;
      p.vel.y -= (p.gravity ?? 0) * dt;
      const from = p.mesh.position.clone();
      p.mesh.position.addScaledVector(p.vel, dt);
      // Boomerangs (Cap's shield) fly out, then curve back to the thrower
      if (p.boomerang) {
        const owner = p.boomerang.owner;
        if (p.t > p.boomerang.out) {
          if (!owner?.alive) p.life = 0;
          else {
            const back = this.centerOf(owner).sub(p.mesh.position);
            if (back.length() < 1.4) p.life = 0;
            else p.vel.lerp(back.normalize().multiplyScalar(p.boomerang.speed), Math.min(1, dt * 4));
          }
        }
      }
      if (['arrow', 'shard', 'bullet', 'missile', 'knife', 'spear', 'baton', 'feather', 'stinger', 'tendril', 'crescent', 'pumpkin'].includes(p.kind)) {
        if (p.vel.lengthSq() > 1e-4) p.mesh.quaternion.setFromUnitVectors(FORWARD, p.vel.clone().normalize());
      }
      if (p.kind === 'sand' || p.kind === 'grenade' || p.kind === 'goo' || p.kind === 'pumpkin') p.mesh.rotation.z += dt * 5;
      const color = p.color ?? p.R?.color ?? 0xffffff;
      const sand = p.kind === 'sand' || p.R?.sand;
      p.trail = (p.trail ?? 0) + dt * (sand ? 70 : 40);
      for (; p.trail >= 1; p.trail--) {
        this.fx.add({ pos: p.mesh.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4)),
          vel: new THREE.Vector3(0, sand ? -1 : 0, 0), life: sand ? 0.6 : 0.3, size: sand ? 0.13 : 0.09,
          color: sand ? SAND[(Math.random() * SAND.length) | 0] : color, gravity: sand ? 9 : 0, glow: sand ? 0 : 0.6 });
      }
      const step = p.mesh.position.distanceTo(from);
      let dead = p.life <= 0;
      if (!dead && step > 0) {
        this.ray.set(from, tmpV.subVectors(p.mesh.position, from).divideScalar(step));
        this.ray.far = step;
        if (this.ray.intersectObjects(this.meshes, false)[0]) dead = true;
      }
      if (!dead) {
        for (const t of (p.friendly ? this.enemies : [this.playerTarget, ...this.allies])) {
          if (!(t.alive ?? true) || t === p.owner) continue;
          const c = this.centerOf(t);
          const r = 0.9 + (t.scale ? (t.scale - 1) * 0.45 : 0);
          if (p.mesh.position.distanceTo(c) < r) {
            this.damageTarget(t, p.dmg ?? 1, p.mesh.position, p.knock ?? 5);
            dead = true;
            break;
          }
        }
      }
      if (dead) {
        const at = p.mesh.position.clone();
        if ((p.radius ?? 0) > 0) {
          this.aoe(at, { radius: p.radius, dmg: p.dmg ?? 1, fromAlly: p.friendly, color, knock: p.knock ?? 8, ring: false });
        } else {
          this._impact(at, color, p.kind);
        }
        const kinetic = ['bullet', 'arrow', 'knife', 'spear', 'baton', 'feather', 'stinger', 'crescent', 'nut', 'paper'];
        this.sfx.play(kinetic.includes(p.kind) ? 'hit' : 'boom', { pos: at });
        this.scene.remove(p.mesh);
        p.done = true;
      }
    }
    this.projectiles = this.projectiles.filter(p => !p.done);
    for (const b of this.beams) {
      b.life -= dt;
      const k = Math.max(0, b.life / b.max);
      b.mesh.material.opacity = k * 0.9;
      b.mesh.scale.set(1 + (1 - k) * 0.8, 1, 1 + (1 - k) * 0.8);
      if (b.life <= 0) this.scene.remove(b.mesh);
    }
    this.beams = this.beams.filter(b => b.life > 0);
    this.fx.update(dt);

    // Debris / effects
    for (const d of this.debris) {
      d.life -= dt;
      if (d.mesh) {
        d.vel.y -= 22 * dt;
        d.mesh.position.addScaledVector(d.vel, dt);
        d.mesh.rotation.x += d.spin.x * dt; d.mesh.rotation.y += d.spin.y * dt; d.mesh.rotation.z += d.spin.z * dt;
        if (d.mesh.position.y < d.ground + 0.1) {
          d.mesh.position.y = d.ground + 0.1;
          d.vel.y = Math.abs(d.vel.y) * 0.35; d.vel.x *= 0.6; d.vel.z *= 0.6; d.spin.multiplyScalar(0.6);
        }
        d.mesh.material.opacity = Math.min(1, d.life / 0.6);
        if (d.life <= 0) {
          this.scene.remove(d.mesh); d.mesh.material.dispose();   // cloned per piece
          const g = d.mesh.geometry;   // the rig's own copy (re-uploaded after _disposeRig): free it again
          if (!g.userData.cached && !g.userData.shared) g.dispose();
        }
      } else if (d.group) {
        for (const s of d.group.children) s.position.addScaledVector(s.userData.v, dt);
        d.mat.opacity = d.life / 0.35;
        if (d.life <= 0) { this.scene.remove(d.group); d.mat.dispose(); }
      } else if (d.ring) {
        const k = 1 - d.life / 0.45;
        d.ring.scale.setScalar(0.3 + k * d.radius);
        d.ring.material.opacity = 1 - k;
        if (d.life <= 0) { this.scene.remove(d.ring); d.ring.material.dispose(); }
      }
    }
    this.debris = this.debris.filter(d => d.life > 0);

    // Heart pickups
    for (const h of this.pickups) {
      h.mesh.rotation.y += dt * 2.5;
      h.mesh.position.y = h.y + Math.sin(this.t * 3) * 0.15;
      h.life -= dt;
      h.mesh.visible = h.life > 4 || Math.floor(h.life * (h.life < 1.5 ? 12 : 6)) % 2 === 0;   // flash, faster near the end
      if (!h.done && h.life <= 0) { h.done = true; this.scene.remove(h.mesh); continue; }
      // Always picked up; at full health it's simply wasted (like the real games)
      if (!h.done && h.mesh.position.distanceTo(chest) < 1.5) {
        h.done = true;
        this.scene.remove(h.mesh);
        this.fx?.burst?.(h.mesh.position, { n: 10, colors: [0xe0161e, 0xffffff], speed: 2.5, up: 1.5, size: 0.08, life: 0.35, gravity: 4 });
        if (this.hearts < this.maxHearts) { this.hearts++; this.ui.setHearts(this.hearts, this.maxHearts); }
      }
    }
    for (const h of this.pickups) if (h.done) { h.mesh.geometry.dispose(); h.mesh.material.dispose(); }
    this.pickups = this.pickups.filter(h => !h.done);
  }

  // ─── Team, targeting and damage routing ─────────────────────────────────
  centerOf(t) {
    if (!t) return new THREE.Vector3();
    if (t.player) return t.root.position.clone().setY(t.root.position.y + 0.9);
    if (typeof t.chest === 'function') return t.chest();
    return t.root.position.clone().setY(t.root.position.y + 1.05 * (t.scale ?? 1));
  }

  /** Everyone `team` is allowed to hit. */
  opponentsOf(team) {
    if (team === 'ally') return this.enemies.filter(e => e.alive);
    return [this.playerTarget, ...this.allies.filter(a => a.alive)];
  }

  /** Best hostile for a summoned character, or null when nothing is in aggro range. */
  pickTargetFor(agent) {
    const from = this.centerOf(agent);
    const maxD = agent.kit?.aggro ?? 48;
    let best = null, bestD = Infinity;
    for (const t of this.opponentsOf(agent.team)) {
      if (!(t.alive ?? true)) continue;
      const d = this.centerOf(t).distanceTo(from);
      if (d < bestD) { bestD = d; best = t; }
    }
    return bestD <= maxD ? best : null;
  }

  /** Villains prefer the player unless an ally is meaningfully closer. */
  _threatFor(e) {
    const p = e.root.position;
    let best = this.playerTarget, bestD = p.distanceTo(this.player.root.position) + 2.5;
    for (const a of this.allies) {
      if (!a.alive) continue;
      const d = p.distanceTo(a.root.position);
      if (d < bestD) { bestD = d; best = a; }
    }
    return best;
  }

  damageTarget(t, dmg, from, knock = 6) {
    if (!t) return false;
    if (t.player) { this.damagePlayer(dmg, from); return true; }
    if (t.isAgent) return t.team === 'ally' ? this.damageAlly(t, dmg, from, knock) : this.damageEnemy(t, dmg, from, knock);
    return this.damageEnemy(t, dmg, from, knock);
  }

  addAlly(a) { if (!this.allies.includes(a)) this.allies.push(a); }
  removeAlly(a) { this.allies = this.allies.filter(x => x !== a); }

  damageAlly(a, dmg, from, knock = 5) {
    if (!a?.alive) return false;
    const ok = a.damage(dmg, from, knock);
    if (ok && a.hp <= 0) this.removeAlly(a);
    return ok;
  }

  // ─── Projectiles, beams and area attacks used by every kit ──────────────
  fireAt(entity, target, o = {}) {
    if (!target || !entity?.alive) return null;
    const from = o.origin ? o.origin.clone() : this.centerOf(entity);
    const to = this.centerOf(target);
    const aim = to.clone().sub(from);
    if (aim.lengthSq() < 1e-6) return null;
    const shots = o.burst ?? 1;
    const color = o.color ?? 0x9fe4ff;
    for (let i = 0; i < shots; i++) {
      const dir = aim.clone().normalize();
      if (shots > 1) {
        dir.applyAxisAngle(UP, (i - (shots - 1) / 2) * (o.spread ?? 0.14));
        dir.y += (Math.random() - 0.5) * (o.spread ?? 0.14) * 0.4;
        dir.normalize();
      }
      this.fireProjectile({
        pos: from.clone(),
        vel: dir.multiplyScalar(o.speed ?? 26),
        dmg: o.dmg ?? 1,
        color,
        size: o.size,
        kind: o.kind,
        gravity: o.gravity ?? 0,
        radius: o.radius ?? 0,
        knock: o.knock ?? 5,
        life: o.life ?? 3.5,
        friendly: o.friendly ?? entity.team === 'ally',
        owner: entity,
        boomerang: o.boomerang ? { owner: entity, out: 0.55, speed: (o.speed ?? 26) * 1.15 } : null,
      });
    }
    this.fx.burst(from, { n: 6, colors: [color, 0xffffff], speed: 2.4, up: 1, size: 0.09, life: 0.18, gravity: 0 });
    const kinetic = ['bullet', 'arrow', 'knife', 'spear', 'baton', 'feather', 'stinger', 'crescent', 'nut', 'paper'];
    this.sfx.play(kinetic.includes(o.kind) ? 'shot' : 'energy', { pos: from });
    return from;
  }

  fireProjectile(o) {
    if (this.projectiles.length > 220) return null; // keeps big brawls inside the frame budget
    const mesh = this._projectileMesh(o);
    mesh.position.copy(o.pos);
    if (o.vel.lengthSq() > 1e-4) {
      mesh.quaternion.setFromUnitVectors(FORWARD, o.vel.clone().normalize());
    }
    this.scene.add(mesh);
    const p = {
      mesh, vel: o.vel.clone(), gravity: o.gravity ?? 0, life: o.life ?? 3.5,
      dmg: o.dmg ?? 1, friendly: !!o.friendly, owner: o.owner ?? null, kind: o.kind ?? 'energy',
      color: o.color ?? 0x9fe4ff, radius: o.radius ?? 0, knock: o.knock ?? 5,
      boomerang: o.boomerang ?? null, t: 0,
    };
    this.projectiles.push(p);
    return p;
  }

  _projectileMesh(o) {
    const color = o.color ?? 0x9fe4ff;
    const size = o.size ?? 0.15;
    switch (o.kind) {
      case 'energy': {
        // Repulsor, optic, and cosmic shots read as directed energy instead of a round fireball.
        const g = new THREE.Group();
        const core = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.2, size * 0.58, size * 3.5, 8), new THREE.MeshBasicMaterial({ color }));
        core.rotation.x = Math.PI / 2;
        const tip = new THREE.Mesh(new THREE.SphereGeometry(size * 0.72, 10, 8), new THREE.MeshBasicMaterial({ color }));
        tip.position.z = size * 1.72;
        const collar = new THREE.Mesh(new THREE.TorusGeometry(size * 0.67, size * 0.1, 5, 12), new THREE.MeshBasicMaterial({ color: 0xf3fbff }));
        collar.rotation.x = Math.PI / 2;
        g.add(core, tip, collar);
        return g;
      }
      case 'bolt': {
        // Loki's magic bolt: a pointed spell with a bright collar, not the generic fallback orb.
        const g = new THREE.Group();
        const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(size * 1.12, 0), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.65, flatShading: true }));
        crystal.scale.set(0.72, 0.82, 1.5);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(size * 0.82, size * 0.08, 5, 12), new THREE.MeshBasicMaterial({ color: 0xf1e6ff }));
        ring.rotation.x = Math.PI / 2;
        g.add(crystal, ring);
        return g;
      }
      case 'bullet':
        return new THREE.Mesh(new THREE.BoxGeometry(size * 1.2, size * 1.2, size * 4.5), new THREE.MeshBasicMaterial({ color }));
      case 'arrow': {
        const g = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.35, size * 0.35, 0.75, 6), new THREE.MeshBasicMaterial({ color: 0xd8d8e0 }));
        shaft.rotation.x = Math.PI / 2;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(size * 0.7, 0.16, 5), new THREE.MeshBasicMaterial({ color }));
        tip.rotation.x = Math.PI / 2;
        tip.position.z = 0.42;
        g.add(shaft, tip);
        return g;
      }
      case 'knife':
      case 'spear':
      case 'baton': {
        const g = new THREE.Group();
        const shaftLen = o.kind === 'spear' ? 0.85 : o.kind === 'baton' ? 0.48 : 0.38;
        const metal = new THREE.MeshStandardMaterial({ color: o.kind === 'baton' ? color : 0xd9dfe7, metalness: 0.58, roughness: 0.25 });
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.28, size * 0.28, shaftLen, 6), metal);
        shaft.rotation.x = Math.PI / 2;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(size * (o.kind === 'spear' ? 0.8 : 0.58), size * (o.kind === 'spear' ? 2.2 : 1.5), 5), new THREE.MeshBasicMaterial({ color }));
        tip.rotation.x = Math.PI / 2; tip.position.z = shaftLen * 0.62;
        g.add(shaft, tip);
        return g;
      }
      case 'feather': {
        const g = new THREE.Group();
        const vane = new THREE.Mesh(new THREE.ConeGeometry(size * 0.72, size * 4.5, 4), new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.42, flatShading: true }));
        vane.rotation.x = -Math.PI / 2;
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.1, size * 0.1, size * 4.1, 5), new THREE.MeshBasicMaterial({ color: 0xe8edf2 }));
        shaft.rotation.x = Math.PI / 2;
        g.add(vane, shaft);
        return g;
      }
      case 'stinger': {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.ConeGeometry(size * 0.68, size * 3.8, 6), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, flatShading: true }));
        body.rotation.x = -Math.PI / 2;
        const tail = new THREE.Mesh(new THREE.ConeGeometry(size * 0.4, size * 1.4, 5), new THREE.MeshBasicMaterial({ color: 0xf6df72 }));
        tail.rotation.x = Math.PI / 2; tail.position.z = -size * 1.7;
        g.add(body, tail);
        return g;
      }
      case 'web': {
        const g = new THREE.Group();
        const core = new THREE.Mesh(new THREE.SphereGeometry(size * 0.72, 10, 8), new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: 0x61717c, emissiveIntensity: 0.12 }));
        g.add(core);
        for (let i = 0; i < 3; i++) {
          const line = new THREE.Mesh(new THREE.TorusGeometry(size * (0.7 + i * 0.09), size * 0.07, 4, 10), new THREE.MeshBasicMaterial({ color: 0xf5fbff }));
          if (i === 0) line.rotation.x = Math.PI / 2;
          if (i === 1) line.rotation.y = Math.PI / 2;
          g.add(line);
        }
        return g;
      }
      case 'crescent': {
        const blade = new THREE.Mesh(new THREE.TorusGeometry(size * 1.1, size * 0.2, 5, 14, Math.PI * 1.35), new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.24, emissive: color, emissiveIntensity: 0.15 }));
        blade.rotation.z = Math.PI * 0.32;
        return blade;
      }
      case 'lightning': {
        const pts = [
          new THREE.Vector3(0, 0, -size * 1.8), new THREE.Vector3(size * 0.75, 0, -size * 0.9),
          new THREE.Vector3(-size * 0.45, size * 0.25, 0), new THREE.Vector3(size * 0.55, -size * 0.2, size * 0.85),
          new THREE.Vector3(0, 0, size * 1.8),
        ];
        return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, size * 0.12, 4, false), new THREE.MeshBasicMaterial({ color }));
      }
      case 'sonic': {
        const g = new THREE.Group();
        for (let i = 0; i < 3; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(size * (0.75 + i * 0.55), size * 0.08, 5, 16), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 - i * 0.16 }));
          g.add(ring);
        }
        return g;
      }
      case 'tendril': {
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.12, size * 0.55, size * 4.6, 6), new THREE.MeshStandardMaterial({ color, roughness: 0.46, flatShading: true }));
        shaft.rotation.x = -Math.PI / 2;
        return shaft;
      }
      case 'nut': {
        const g = new THREE.Group();
        const nut = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 1), new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true }));
        nut.scale.set(1, 0.8, 1.15); g.add(nut);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(size * 0.35, size * 0.52, 5), new THREE.MeshStandardMaterial({ color: 0x6c8e37, flatShading: true }));
        cap.position.y = size * 0.78; g.add(cap);
        return g;
      }
      case 'paper': {
        const g = new THREE.Group();
        const sheet = new THREE.Mesh(new THREE.BoxGeometry(size * 2.2, size * 0.12, size * 1.6), new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide }));
        sheet.rotation.y = 0.15; g.add(sheet);
        const fold = new THREE.Mesh(new THREE.BoxGeometry(size * 0.75, size * 0.14, size * 0.12), new THREE.MeshBasicMaterial({ color: 0xc4161c }));
        fold.position.set(0, size * 0.08, -size * 0.22); g.add(fold);
        return g;
      }
      case 'illusion':
      case 'chi': {
        const g = new THREE.Group();
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(size * 0.78, 1), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: o.kind === 'chi' ? 0.8 : 0.45, flatShading: true }));
        g.add(core);
        for (let i = 0; i < 2; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(size * (1 + i * 0.35), size * 0.055, 4, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }));
          ring.rotation.x = i * Math.PI / 2; ring.rotation.y = i * 0.6; g.add(ring);
        }
        return g;
      }
      case 'shard':
        return new THREE.Mesh(new THREE.ConeGeometry(size * 1.1, size * 3, 4), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, flatShading: true }));
      case 'pumpkin': {
        const g = new THREE.Group();
        const orange = new THREE.MeshStandardMaterial({ color: 0xff7a00, roughness: 0.72, flatShading: true });
        const rib = new THREE.MeshStandardMaterial({ color: 0xd95b00, roughness: 0.78, flatShading: true });
        const fruit = new THREE.Mesh(new THREE.SphereGeometry(size * 1.15, 12, 10), orange);
        fruit.scale.set(1, 0.88, 0.92);
        g.add(fruit);
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3;
          const lobe = new THREE.Mesh(new THREE.SphereGeometry(size * 0.48, 8, 7), i % 2 ? orange : rib);
          lobe.scale.set(0.72, 1.48, 0.7);
          lobe.position.set(Math.cos(a) * size * 0.58, 0, Math.sin(a) * size * 0.58);
          g.add(lobe);
        }
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.12, size * 0.19, size * 0.5, 6), new THREE.MeshStandardMaterial({ color: 0x536b26, roughness: 0.9, flatShading: true }));
        stem.position.y = size * 1.02;
        stem.rotation.z = -0.18;
        g.add(stem);
        return g;
      }
      case 'shield': {
        const g = new THREE.Group();
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.07, 20), new THREE.MeshStandardMaterial({ color: 0xc4161c, metalness: 0.5, roughness: 0.3 }));
        disc.rotation.x = Math.PI / 2;
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 20), new THREE.MeshStandardMaterial({ color: 0xf2f2f4 }));
        ring.rotation.x = Math.PI / 2;
        g.add(disc, ring);
        return g;
      }
      case 'missile': {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.8, size * 0.8, size * 5, 8), new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.5, roughness: 0.35 }));
        body.rotation.x = Math.PI / 2;
        const flame = new THREE.Mesh(new THREE.ConeGeometry(size * 0.9, size * 3, 6), new THREE.MeshBasicMaterial({ color }));
        flame.rotation.x = -Math.PI / 2;
        flame.position.z = -size * 4;
        g.add(body, flame);
        return g;
      }
      case 'grenade':
      case 'goo':
      case 'sand':
        return new THREE.Mesh(new THREE.IcosahedronGeometry(size * 1.6, 0), new THREE.MeshStandardMaterial({
          color, roughness: 0.85, flatShading: true, emissive: color, emissiveIntensity: o.kind === 'goo' ? 0 : 0.25,
        }));
      case 'fire':
        return new THREE.Mesh(new THREE.SphereGeometry(size * 1.4, 10, 8), new THREE.MeshBasicMaterial({ color }));
      default:
        return new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), new THREE.MeshBasicMaterial({ color }));
    }
  }

  _impact(pos, color = 0xffffff) {
    this._sparks(pos, color);
    this.fx.burst(pos, { n: 8, colors: [color, 0xffffff], speed: 4, up: 2, size: 0.09, life: 0.28 });
  }

  /** Explosion / shockwave that only ever hurts the other team. */
  aoe(pos, o = {}) {
    const radius = o.radius ?? 4;
    const victims = o.fromAlly ? this.enemies : [this.playerTarget, ...this.allies];
    for (const t of victims) {
      if (!(t.alive ?? true)) continue;
      const c = this.centerOf(t);
      if (c.distanceTo(pos) <= radius + (t.scale ? (t.scale - 1) : 0)) {
        this.damageTarget(t, o.dmg ?? 1, pos, o.knock ?? 8);
      }
    }
    if (o.ring !== false) this._ring(pos.clone().setY(pos.y - 0.1), radius, o.color ?? 0xffffff);
    this.fx.burst(pos, { n: 26, colors: [o.color ?? 0xffffff, 0xffffff], speed: radius * 2, up: 4, size: 0.15, life: 0.6 });
    this.sfx.play('boom', { pos });
    this.ui.shake(0.25);
  }

  /** Hitscan beam (unibeam, optic blast, lightning) that stops at walls and damages along its path. */
  beam(entity, target, o = {}) {
    const a = this.centerOf(entity);
    const b = this.centerOf(target);
    const d = b.clone().sub(a);
    const len = d.length();
    if (len < 1e-3) return;
    const dir = d.divideScalar(len);
    let end = b;
    this.ray.set(a, dir);
    this.ray.far = len;
    const hit = this.ray.intersectObjects(this.meshes, false)[0];
    if (hit) end = hit.point.clone();
    const width = o.width ?? 0.8;
    const seg = new THREE.Line3(a, end);
    const cp = new THREE.Vector3();
    const victims = entity.team === 'ally' ? this.enemies : [this.playerTarget, ...this.allies];
    for (const t of victims) {
      if (!(t.alive ?? true)) continue;
      const c = this.centerOf(t);
      seg.closestPointToPoint(c, true, cp);
      if (cp.distanceTo(c) <= width + 0.5) this.damageTarget(t, o.dmg ?? 2, a, o.knock ?? 8);
    }
    this._beamFx(a, end, o.color ?? 0x9fe4ff, width);
  }

  _beamFx(a, end, color, width) {
    const len = a.distanceTo(end);
    const geo = new THREE.CylinderGeometry(width * 0.5, width * 0.7, len, 8, 1, true);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,
    }));
    mesh.position.copy(a).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP, end.clone().sub(a).normalize());
    this.scene.add(mesh);
    this.beams.push({ mesh, life: 0.28, max: 0.28 });
    this._sparks(end, color);
    this.fx.burst(end, { n: 16, colors: [color, 0xffffff], speed: 5, up: 3, size: 0.12, life: 0.4 });
    this.sfx.play('energy', { pos: end });
    this.ui.shake(0.18);
  }

  _faceTowards(e, target, dt) {
    const want = Math.atan2(target.x - e.root.position.x, target.z - e.root.position.z);
    let diff = want - e.root.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    e.root.rotation.y += diff * Math.min(1, dt * 8);
  }

  /** Footstep scuffs under the feet (made of whatever you're standing on), a thud and debris ring on hard landings. */
  _feet(c, dt) {
    const v = c.velocity ?? { x: 0, y: 0, z: 0 }, sp = Math.hypot(v.x, v.z), p = c.root.position;
    const swinging = !!c.webPhysics?.isSwinging;
    const g = groundFx(c.groundKind, c.groundColor), at = () => new THREE.Vector3(p.x, p.y - 0.45, p.z);
    if (c.isGrounded && sp > 1.5 && !this.frozen) {
      this._stepT = (this._stepT ?? 0) - dt * sp;
      if (this._stepT <= 0) {
        this._stepT = 2.1;
        this.sfx.play('step');
        const k = sp > 9 ? 1.6 : 1;
        this.fx.burst(at(), { n: Math.round(g.n * k), colors: g.colors, speed: (1.1 + sp * 0.08) * g.speed, up: g.up,
          size: g.size, life: g.life, gravity: g.gravity, ground: p.y - 0.5 });
      }
    }
    if (!c.isGrounded && !this._wasAir && v.y > 4 && !swinging) this.sfx.play('jump', { vol: 0.8 });
    if (this._wasAir && c.isGrounded && (this._fallV ?? 0) < -4 && (this._fallV ?? 0) >= -9) this.sfx.play('step', { vol: 1.6, pitch: 0.8 });   // soft touchdown
    if (this._wasAir && c.isGrounded && (this._fallV ?? 0) < -9) {
      this.sfx.play('land', { vol: Math.min(1.4, 0.6 + -(this._fallV ?? 0) / 30) });
      const hard = Math.min(2, -(this._fallV ?? 0) / 18);
      this.fx.burst(at(), { n: Math.round(g.n * 4 * hard), colors: g.colors, speed: 4 * g.speed * hard, up: g.up * 1.4,
        size: g.size * 1.35, life: g.life * 1.3, gravity: g.gravity, ground: p.y - 0.5 });
      if (hard > 1.2) this.fx.ring(at(), { n: 28, colors: g.colors, speed: 6 * hard, size: g.size * 1.2, life: 0.45 });
    }
    if (c.isClimbing) {
      const pull = c.rig?.climbPull ?? 0, moving = Object.values(c._keys ?? {}).some(Boolean);
      if (moving && pull > 0.9 && !this._pullPeak) {
        this._pullPeak = true;
        const n = c._wallNormal, gap = c.rig?.wallGap ?? 0.4, side = (this._climbSide = -(this._climbSide ?? 1));
        const at = new THREE.Vector3(p.x - n.x * gap + n.z * 0.45 * side, p.y + 1.5, p.z - n.z * gap - n.x * 0.45 * side);
        const big = c.rig?.model?.userData?.bigfig;
        this.fx.burst(at, { n: big ? 14 : 7, colors: [0xb9b2a5, 0x8f8a80, 0xd9d4c8, 0x6b665e], speed: big ? 3.2 : 2, up: 1.2,
          size: big ? 0.11 : 0.07, life: 0.55, gravity: 14 });
        this.sfx.play('step', { vol: big ? 1.4 : 0.8, pitch: big ? 0.7 : 1 });
      } else if (pull < 0.5) this._pullPeak = false;
    }
    if (c.isWallRun && sp > 3) {
      this._wrT = (this._wrT ?? 0) - dt * sp;
      if (this._wrT <= 0) { this._wrT = 2.4; this.sfx.play('wallrun'); }
    }
    if (c.perchZip && !this._wasZip) this.sfx.play('zip');
    this._wasZip = !!c.perchZip;
    this.sfx.setMotion(Math.hypot(v.x, v.y, v.z), !c.isGrounded && !c.isClimbing, swinging);
    if (swinging && !this._wasSwing) this.sfx.play('thwip');
    if (!swinging && this._wasSwing) this.sfx.play('release', { vol: 0.9 });
    this._wasSwing = swinging;
    this._wasAir = !c.isGrounded;
    this._fallV = v.y;
  }

  /** V: fire a web ball at the nearest foe in front of you. Each hit sticks them in place;
   *  three hits wrap a henchman up completely (bosses only get slowed for a moment). */
  webShot() {
    const c = this.player;
    if (this.frozen || c.inputLocked || c.noWebs || (this._webCd ?? 0) > this.t) return;
    const p = c.root.position, yaw = c.root.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw);
    let best = null, bestScore = Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.root.position.x - p.x, dz = e.root.position.z - p.z, d = Math.hypot(dx, dz);
      if (d > 28 || d < 0.3) continue;
      const facing = (dx * fx + dz * fz) / d;                 // 1 = straight ahead
      const score = d * (1.6 - facing);
      if (facing > -0.2 && score < bestScore) { bestScore = score; best = e; }
    }
    this._webCd = this.t + 0.35;
    this.sfx.play('thwip');
    const dark = !!c._darkWebs?.();
    // Spawn at the web-shooting hand, not at `root.y + 1.0` (that sat at the mask, which is why
    // web balls seemed to fly out of Spider-Man's head). The controller resolves the real rig
    // hand for every skeleton; the offset keeps the ball clear of the palm mesh.
    const handSide = c.webPhysics?.handSide ?? -1;
    const from = c.webHandWorld?.(new THREE.Vector3(), handSide)?.clone() ??
      p.clone().setY(p.y + 1.0).add(new THREE.Vector3(fx * 0.4, 0, fz * 0.4));
    from.addScaledVector(new THREE.Vector3(fx, 0, fz), 0.18);
    const ball = new THREE.Mesh(this._webBallGeometry(dark),
      dark ? (this._gooMat ??= symbioteMaterial()) : (this._webBallMat ??= new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.6 })));
    ball.position.copy(from);
    this.scene.add(ball);
    const dir = best ? this.centerOf(best).sub(from).normalize() : new THREE.Vector3(fx, 0.05, fz);
    const trail = dark ? new Tendril(this.scene, { radius: 0.045 }) : null;
    (this.webShots ??= []).push({ ball, target: best, dir, life: 1.2, from: from.clone(), dark, trail });
  }

  _tickWebShots(dt) {
    if (!this.webShots?.length) return;
    for (const w of this.webShots) {
      w.life -= dt;
      if (w.target?.alive) w.dir.copy(this.centerOf(w.target)).sub(w.ball.position).normalize();
      w.ball.position.addScaledVector(w.dir, 42 * dt);
      if (w.trail) {
        // the goo stays tethered to the hand by a thin writhing strand
        const p = this.player.root.position;
        w.trail.visible = true;
        w.trail.set(new THREE.Vector3(p.x, p.y + 1.1, p.z), w.ball.position, { time: this.t * 1.7, wobble: 1.2, claws: false });
        w.ball.scale.setScalar(1 + Math.sin(this.t * 30) * 0.12);
      }
      if (w.target?.alive && w.ball.position.distanceTo(this.centerOf(w.target)) < 0.7) { this._webbed(w.target, w.dark); w.life = 0; }
      if (w.life <= 0) { this.scene.remove(w.ball); w.trail?.dispose(); }
    }
    this.webShots = this.webShots.filter(w => w.life > 0);
  }

  /** One shared sphere per web-ball size: the old per-shot geometry was a slow GPU-memory leak. */
  _webBallGeometry(dark) {
    const key = dark ? '_gooGeo' : '_webGeo';
    return this[key] ??= new THREE.SphereGeometry(dark ? 0.17 : 0.13, 12, 10);
  }

  _webbed(e, dark = false) {
    this.sfx.play('webhit');
    if (e.guard > this.t) { e.guard = 0; e.combo = 0; this.hud?.toast?.('GUARD BREAK'); }   // webbing a blocking foe opens it up
    const at = this.centerOf(e);
    this.fx.burst(at, { n: dark ? 20 : 14, colors: dark ? [0x0b0b12, 0x1c1c2a, 0x3a4a8a] : [0xffffff, 0xe8e8e8], speed: 3, up: 1, size: dark ? 0.11 : 0.08, life: 0.5, gravity: 6 });
    if (e.T.boss) { e.cooldown = Math.max(e.cooldown, 1.2); e.vel.multiplyScalar(0.2); return; }
    e.webs = (e.webs ?? 0) + 1;
    e.webStun = 2.6;
    if (!e.cocoon) {
      e.cocoon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), dark
        ? symbioteMaterial()
        : new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.8, transparent: true, opacity: 0.88 }));
      e.cocoon.position.y = 0.55 * e.scale;
      e.root.add(e.cocoon);
    }
    const k = Math.min(3, e.webs);
    e.cocoon.scale.set(0.9 + k * 0.08, 0.5 + k * 0.42, 0.9 + k * 0.08);
    if (e.webs >= 3) {
      // All wrapped up: out of the fight, stays stuck there as a trophy for a while
      e.hp = 0;
      this._defeat(e);
    }
  }

  _think(e, dt) {
    const T = e.T, p = e.root.position;
    const target = this._threatFor(e);
    const pp = target.root.position;
    const chest = this.centerOf(target);
    e.cooldown -= dt; e.special -= dt; e.hurt -= dt;
    const dx = pp.x - p.x, dz = pp.z - p.z, dist = Math.hypot(dx, dz);
    this._aura(e, dt);
    // Sandman: whips up a sand tornado around himself that hurts anyone caught in it
    if (T.sand) {
      if (e.storm > 0) {
        e.storm -= dt;
        e.stormHit = (e.stormHit ?? 0) - dt;
        if (dist < 4.8 && Math.abs(pp.y - p.y) < 6 && e.stormHit <= 0) { this.damageTarget(target, 1, p); e.stormHit = 0.9; }
        e.rig.update(dt, { speed: 0, grounded: true, emote: 'cheer' });
        this._faceTowards(e, pp, dt);
        return;
      }
      if (e.special <= 0 && dist < 10 && e.age > 5 && e.windup <= 0) {
        e.storm = 2.8; e.special = 10 + Math.random() * 4;
        this.ui.shake(0.25);
      }
      // Hammer fist: his arm swells into a huge sand mallet while he winds up a slam
      const fist = e.windup > 0 ? 2.3 : 1;
      for (const sd of [-1, 1]) {
        const a = e.rig.arm[sd];
        a.scale.setScalar(a.scale.x + ((sd === 1 ? fist : 1) - a.scale.x) * Math.min(1, dt * 6));
      }
    }
    const dirX = dx / (dist || 1), dirZ = dz / (dist || 1);
    let moveSpeed = 0;

    if (T.fly) {
      // Hover and circle the player; periodically swoop down into punching range
      e.swoop -= dt;
      if (e.special <= 0) { e.swoop = 3.2; e.special = 7 + Math.random() * 3; }
      e.orbit += dt * (e.swoop > 0 ? 0.2 : 0.5);
      const r = e.swoop > 0 ? 1.8 : 11;
      const tx = pp.x + Math.cos(e.orbit) * r, tz = pp.z + Math.sin(e.orbit) * r;
      const ty = pp.y + (e.swoop > 0 ? 0 : 5.5) + Math.sin(e.age * 2) * 0.4;
      const k = Math.min(1, dt * (e.swoop > 0 ? 3 : 1.5));
      p.x += (tx - p.x) * k; p.z += (tz - p.z) * k; p.y += (ty - p.y) * k;
      p.x += e.vel.x * dt; p.z += e.vel.z * dt;
      e.vel.multiplyScalar(Math.exp(-4 * dt));
      this._faceTowards(e, pp, dt);
      if (T.ranged && e.cooldown <= 0 && e.swoop <= 0 && e.hurt <= 0) {
        this._fire(e, chest); e.cooldown = T.ranged.rate;
      }
      if (e.swoop > 0 && dist < 2 && e.cooldown <= 0) { this.damageTarget(target, 1, p); e.cooldown = 1.5; }
      e.groundY = this.groundAt(p.x, p.z, p.y);
      e.rig.update(dt, { speed: 0, grounded: false, vy: -1, swinging: false });
      return;
    }

    // Ground enemies: gravity + ground following
    e.groundCheck -= dt;
    if (e.groundCheck <= 0) { e.groundY = this.groundAt(p.x, p.z, p.y); e.groundCheck = 0.25; }
    e.vel.y -= 30 * dt;
    p.y += e.vel.y * dt;
    if (p.y <= e.groundY + 0.5) { p.y = e.groundY + 0.5; e.vel.y = 0; if (!e.grounded && e.leaping) this._landLeap(e, pp); e.grounded = true; e.leaping = false; }
    else e.grounded = false;
    p.x += e.vel.x * dt; p.z += e.vel.z * dt;
    const fr = Math.exp(-(e.grounded ? 7 : 1) * dt);
    e.vel.x *= fr; e.vel.z *= fr;

    const playerHigh = pp.y - 0.5 > e.groundY + 3; // player is on a roof / wall / swinging
    if (e.hurt <= 0 && e.grounded) {
      const R = T.ranged;
      const keep = R?.keep ?? 1.4 * e.scale;
      if (T.teleport && e.special <= 0) this._teleport(e, pp);
      if (T.summon && e.age > 4 && (e.summonT = (e.summonT ?? 12) - dt) <= 0) {
        e.summonT = 14;
        if (this.aliveCount < 6) for (let i = 0; i < 2; i++) this.spawn(T.summon, this.spotNear(p, 3, 6));
      }
      if (T.leap && e.special <= 0 && dist > 5 && dist < 16 && !playerHigh) {
        const t = 0.8;
        e.vel.set(dx / t, 12, dz / t);
        e.vel.y = (pp.y - p.y + 0.5 * 30 * t * t) / t;
        e.grounded = false; e.leaping = true; e.special = 4 + Math.random() * 2;
        this._clearWarn(e);
        e.warn = this._warnDisc(pp, this.groundAt(pp.x, pp.z, pp.y + 1), 3.2, t);   // where it will come down
      } else if (e.windup > 0) {
        e.windup -= dt;
        if (e.warn) {   // slam telegraph: the red disc fills the danger zone as the hit gets closer
          const k = Math.min(1, 1 - e.windup / e.warn.userData.dur);
          e.warn.userData.fill.scale.setScalar(Math.max(0.01, k));
          e.warn.userData.fill.material.opacity = 0.18 + 0.32 * k;
          e.warn.position.set(p.x, e.groundY + 0.06, p.z);
        }
        if (e.windup <= 0) {
          if (T.slam) {
            this._ring(p.clone().setY(e.groundY + 0.05), 5, 0xe8c27a);
            if (T.sand) {
              const at = p.clone().setY(e.groundY + 0.1);
              this.fx.ring(at, { n: 70, colors: SAND, speed: 11, size: 0.2, life: 0.8 });
              this.fx.burst(at, { n: 50, colors: SAND, speed: 5, up: 9, size: 0.22, life: 1.2, gravity: 18, spread: 2.5, ground: e.groundY });
            }
            this.ui.shake(0.45);
            if (dist < 5 && !playerHigh) this.damageTarget(target, T.melee, p);
          } else if (dist < 1.9 * e.scale && Math.abs(pp.y - p.y) < 1.6 * e.scale) {
            this.damageTarget(target, T.melee, p);
          }
          e.attack = 1;
          e.cooldown = T.slam ? 2.4 : 1.3;
        }
      } else if (T.melee && dist < (T.slam ? 4.5 : 1.8 * e.scale) && e.cooldown <= 0 && !playerHigh) {
        e.windup = T.slam ? 0.8 : 0.45;
        if (T.slam) e.warn = this._warnDisc(p, e.groundY, 5, e.windup);
        this._sparks(p.clone().setY(p.y + 2.1 * e.scale), 0xff3b3b);   // red glint: an attack is coming
        if (!this._dodgeTip && target === this.playerTarget) {   // teach the dodge the first few times a foe winds up on you
          let n = 0; try { n = +localStorage.getItem('dodgeTips') || 0; } catch (err) {}
          this._dodgeTip = true;
          if (n < 3) {
            this.hud.toast(`${keyName(keyFor('AltLeft'))} TO DODGE`);
            try { localStorage.setItem('dodgeTips', n + 1); } catch (err) {}
          }
        }
      } else if (R && dist < R.range && e.cooldown <= 0 && this.lineOfSight(p.clone().setY(p.y + 1.2), chest)) {
        this._fire(e, chest);
        e.cooldown = R.rate * (0.8 + Math.random() * 0.4);
        e.attack = 1;
      } else if (dist > keep) {
        moveSpeed = T.speed;
      } else if (R && dist < keep * 0.6) {
        moveSpeed = -T.speed * 0.6; // back off to shooting range
      }
    }
    if (moveSpeed) {
      const step = moveSpeed * dt;
      if (!this._blocked(p, dirX * Math.sign(step), dirZ * Math.sign(step), e.scale)) {
        p.x += dirX * step; p.z += dirZ * step;
      } else {
        // Slide sideways around the obstacle
        const sx = -dirZ, sz = dirX;
        p.x += sx * Math.abs(step); p.z += sz * Math.abs(step);
      }
    }
    e.attack = Math.max(0, e.attack - dt / 0.3);
    this._faceTowards(e, pp, dt);
    e.rig.update(dt, {
      speed: Math.abs(moveSpeed), grounded: e.grounded, vy: e.vel.y,
      attack: e.windup > 0 ? 0.9 : e.attack, attackArm: 1, slam: T.slam && e.windup > 0, hurt: e.hurt,
    });
  }

  /** Signature particle look for each villain, every frame. */
  _aura(e, dt) {
    const T = e.T, p = e.root.position, sc = e.scale, fx = this.fx;
    const emit = (rate, f) => { e.auraT = (e.auraT ?? 0) + dt * rate; for (; e.auraT >= 1; e.auraT--) f(); };
    const rnd = () => Math.random() - 0.5;
    const pick = a => a[(Math.random() * a.length) | 0];
    if (T.sand) {
      // Grains always pouring off his body
      emit(45, () => fx.add({ pos: new THREE.Vector3(p.x + rnd() * 0.9 * sc, p.y - 0.5 + Math.random() * 1.8 * sc, p.z + rnd() * 0.6 * sc),
        vel: new THREE.Vector3(rnd() * 0.6, -0.5, rnd() * 0.6), life: 1, size: 0.07 + Math.random() * 0.07,
        color: pick(SAND), gravity: 7, ground: e.groundY + 0.03 }));
      if (e.storm > 0) {
        for (let i = 0; i < 6; i++) {
          const a = Math.random() * Math.PI * 2, r = 0.8 + Math.random() * 3.6;
          fx.add({ pos: new THREE.Vector3(p.x + Math.cos(a) * r, e.groundY + Math.random() * 1.2, p.z + Math.sin(a) * r),
            life: 1.1, size: 0.12 + Math.random() * 0.14, color: pick(SAND),
            swirl: { center: p, speed: 5 + Math.random() * 3, pull: -0.6, lift: 3 + Math.random() * 4 } });
        }
      }
    } else if (e.kind === 'venom') {
      emit(10, () => fx.add({ pos: new THREE.Vector3(p.x + rnd() * 0.7 * sc, p.y + Math.random() * 1.4 * sc, p.z + rnd() * 0.5 * sc),
        vel: new THREE.Vector3(0, -0.3, 0), life: 0.9, size: 0.08 + Math.random() * 0.06, color: pick(GOO), gravity: 9, ground: e.groundY + 0.02 }));
    } else if (e.kind === 'goblin') {
      // Glider jet flame under his feet
      emit(40, () => fx.add({ pos: new THREE.Vector3(p.x + rnd() * 0.5, p.y - 0.55, p.z + rnd() * 0.5),
        vel: new THREE.Vector3(rnd(), -4 - Math.random() * 2, rnd()), life: 0.3, size: 0.1 + Math.random() * 0.08,
        color: pick([0xff7a00, 0xffc23a, 0xff3a1a]), glow: 0.8 }));
    } else if (e.kind === 'loki' || e.kind === 'magneto') {
      const c = e.kind === 'loki' ? [0x5dff5d, 0x2fcf4a, 0xd8ffd0] : [0xb24bff, 0xe0a8ff, 0x7a2adf];
      emit(14, () => {
        const a = Math.random() * Math.PI * 2;
        fx.add({ pos: new THREE.Vector3(p.x + Math.cos(a) * 0.8 * sc, p.y + 0.2 + Math.random() * 1.2 * sc, p.z + Math.sin(a) * 0.8 * sc),
          life: 0.8, size: 0.07 + Math.random() * 0.05, color: pick(c), glow: 0.7,
          swirl: { center: p, speed: 2.5, pull: 0, lift: 0.8 } });
      });
    }
  }

  _blocked(p, dx, dz, scale) {
    this.ray.set(tmpV.set(p.x, p.y + 0.4, p.z), new THREE.Vector3(dx, 0, dz));
    this.ray.far = 0.9 * scale;
    return !!this.ray.intersectObjects(this.meshes, false)[0];
  }

  _landLeap(e, pp) {
    this._ring(e.root.position.clone().setY(e.groundY + 0.05), 3.5, 0x333333);
    this.fx.burst(e.root.position.clone().setY(e.groundY + 0.3), { n: 45, colors: GOO, speed: 7, up: 6, size: 0.2, life: 1.1, gravity: 20, ground: e.groundY + 0.02 });
    this.ui.shake(0.3);
    const tgt = this._threatFor(e);
    if (tgt.root.position.distanceTo(e.root.position) < 3.2) this.damageTarget(tgt, 1, e.root.position);
  }

  _teleport(e, pp) {
    this._sparks(e.root.position.clone().setY(e.root.position.y + 1), 0x5dff5d);
    e.root.position.copy(this.spotNear(pp, 8, 14));
    e.groundY = e.root.position.y - 0.5;
    this._sparks(e.root.position.clone().setY(e.root.position.y + 1), 0x5dff5d);
    e.special = 5 + Math.random() * 3;
  }
}
