/**
 * GlbMinifig.js — rigged minifigs from assets/models/minifigs/<key>.glb, animated procedurally
 * through their skeleton so they behave like LegoSpidey rigs (same update(dt, state) contract,
 * root/torso/head/arm handles for gear, flash, handWorld).
 *
 * Bones are rotated about model-space axes (X = swing forward/back, Z = out to the side),
 * converted into each bone's local frame from its bind pose, so it works whatever the
 * exporter's bone orientation is.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { polishMesh } from './PlasticFX.js?v=2';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { bobHair, ironArms } from './Gear.js?v=65';
import { loadBigfigClips, loadLizardClips, loadClipBank, BigfigPlayer, ClipPlayer, Retarget, CLIMB_ROOT_GLB } from './BigfigAnim.js?v=23';

const DIR = 'assets/models/minifigs/';
const cache = new Map();
const loader = new GLTFLoader();
const damp = (c, t, k) => c + (t - c) * k;
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

export const hasGlb = key => GLB_KEYS.has(key);
export const GLB_KEYS = new Set(['goon_inmate', 'goon_inmate1', 'goon_inmate2', 'goon_inmate3', 'goon_inmate4', 'goon_aim', 'goon_brotherhoodm_01', 'goon_brotherhoodf_01', 'goon_brotherhoodm_fire', 'goon_brotherhoodm_ice', 'goon_brotherhoodm_elec', 'goon_symbiotehazmat', 'goon_doombot', 'goon_raftguard', 'goon_skrull', 'goon_hydrasupersoldier', 'greengoblin', 'venom', 'venombigfig', 'lizard', 'sandman', 'loki', 'magneto', 'ironman', 'captainamerica', 'thor', 'wolverine', 'storm',
  'blackwidow', 'hawkeye', 'cyclops', 'beast', 'deadpool', 'silversurfer', 'humantorch', 'mrfantastic', 'stanlee', 'spiderman', 'ironspider',
  'superiorspiderman', 'spiderwoman', 'blackpanther', 'daredevil', 'doctorstrange', 'ghostrider', 'punisher', 'blade', 'electro', 'carnage',
  'doctoroctopus', 'vulture', 'mysterio', 'kraventhehunter', 'shocker', 'beetle', 'bullseye', 'elektra', 'moonknight', 'nickfury', 'starlord',
  'gamora', 'drax', 'rocketraccoon', 'falcon', 'wintersoldier', 'antman', 'wasp', 'squirrelgirl', 'howardtheduck', 'redskull', 'doctordoom',
  'modok', 'blackcat', 'peterparker', 'gwenstacy', 'maryjanewatson', 'auntmay', 'uncleben', 'jameson', 'curtconnors', 'chameleon', 'lukecage', 'ironfist',
  'goon_kingpina', 'goon_kingpinb', 'goon_kingpinc', 'goon_hydrasoldier', 'goon_scientist', 'goon_scientistb',
  'citycivilian_f01', 'citycivilian_f02', 'citycivilian_f03', 'citycivilian_f04', 'citycivilian_f05', 'citycivilian_f06', 'citycivilian_f07', 'citycivilian_f08', 'citycivilian_m01', 'citycivilian_m02', 'citycivilian_m03', 'citycivilian_m04', 'citycivilian_m05', 'citycivilian_m06', 'citycivilian_m07', 'citycivilian_m08', 'citycivilianold_f01', 'parkcivilian1', 'parkcivilian2', 'parkcivilian3', 'policeofficer1', 'policeofficer2', 'policeofficer3', 'newsreporter', 'photographer']);

function loadGltf(key) {
  if (!cache.has(key)) cache.set(key, loader.loadAsync(`${DIR}${key}.glb`));
  return cache.get(key);
}

/** Free a removed rig's own GPU data: skeletons (bone textures), materials, and any geometry/texture not
 *  tagged `userData.cached` (model cache) or `userData.shared` (module-level). Safe to call twice. */
export function disposeRigRoot(root) {
  if (!root || root.userData.disposed) return;
  root.userData.disposed = true;
  root.traverse(o => {
    if (!o.isMesh) return;
    o.skeleton?.dispose();
    if (!o.geometry.userData.cached && !o.geometry.userData.shared) o.geometry.dispose();
    for (const m of [].concat(o.material)) {
      for (const k in m) if (m[k]?.isTexture && !m[k].userData.cached && !m[k].userData.shared) m[k].dispose();
      m.dispose();
    }
  });
}

export class GlbMinifig {
  constructor(key) { this.key = key; this.isGlb = true; }

  async load() {
    const gltf = await loadGltf(this.key);
    if (!gltf.scene.userData.tagged) {   // mark cache-owned GPU data so a removed rig only frees its own copies
      gltf.scene.userData.tagged = true;
      gltf.scene.traverse(o => {
        if (!o.isMesh) return;
        o.geometry.userData.cached = true;
        for (const m of [].concat(o.material)) for (const k in m) if (m[k]?.isTexture) m[k].userData.cached = true;
      });
    }
    const model = SkeletonUtils.clone(gltf.scene);
    this.root = new THREE.Group();
    this.model = model;
    this.meshes = [];
    model.traverse(n => {
      // Face layers: face_3 = eyes open, face_5 = eyes closed (used for blinking)
      if (n.isMesh && n.name === 'face_5') { n.visible = false; (this._blink ??= {}).closed = n; }
      if (n.isMesh && n.name === 'face_3') (this._blink ??= {}).open = n;
      if (n.isMesh) {
        n.material = Array.isArray(n.material) ? n.material.map(m => m.clone()) : n.material.clone();
        // Face prints sit exactly on the head: pull them forward so they never flicker through it
        // Lips printed as a stack of a dozen shades flicker: flatten them to one clean colour
        if (/^face_/.test(n.name) && Array.isArray(n.material) && n.material.length > 3) {
          const avg = new THREE.Color(0, 0, 0);
          const tinted = n.material.filter(m => m.color && m.color.getHex() !== 0xffffff);
          for (const m of tinted) avg.add(m.color);
          if (tinted.length) avg.multiplyScalar(1 / tinted.length);
          for (const m of n.material) if (m.color && m.color.getHex() !== 0xffffff) m.color.copy(avg);
        }
        // (multi-colour prints are stacked layers: each later layer goes a little further forward)
        // Separate face_N meshes are layers too (Goblin: face_0 skin/black, face_1 black, face_2 red/yellow),
        // so offset by mesh layer as well, or they fight each other at the same depth.
        if (/^face_/.test(n.name)) {
          // Names are face_<layer> or face_<layer>_<sub> (the loader splits multi-colour layers into
          // separate meshes); every sub-layer needs its own depth step.
          const [, L, sub] = n.name.match(/^face_(\d+)(?:_(\d+))?/) ?? [];
          const layer = (parseInt(L, 10) || 0) * 3 + (sub ? 3 - parseInt(sub, 10) : 0);   // sub 1 is the detail drawn over sub 2
          [].concat(n.material).forEach((m, i) => { m.polygonOffset = true; m.polygonOffsetFactor = -2 - layer * 0.5 - i * 0.5; m.polygonOffsetUnits = -4 - layer * 3 - i * 2; });
          n.renderOrder = 1 + layer;
          // polygonOffset alone loses at game-camera distance (depth precision): also lift each layer
          // a hair off the head along its normals, so the stacking holds at any range.
          const g = n.geometry = n.geometry.clone(), P = g.attributes.position, N = g.attributes.normal;
          g.userData.cached = false;   // a per-rig copy (clone() copies userData)
          if (N) { const d = 0.0003 * (layer + 1); for (let i = 0; i < P.count; i++) P.setXYZ(i, P.getX(i) + N.getX(i) * d, P.getY(i) + N.getY(i) * d, P.getZ(i) + N.getZ(i) * d); P.needsUpdate = true; }
        }
        // Hair and hats are open underneath: draw both sides so you can't see up into them
        if (/^(hair|hat|helmet)/i.test(n.name)) for (const m of [].concat(n.material)) m.side = THREE.DoubleSide;
        n.castShadow = true;
        polishMesh(n);
        n.frustumCulled = false;            // skinned bounds don't follow the pose
        this.meshes.push(n);
      }
    });
    const bones = {};
    model.traverse(n => { if (n.isBone || n.type === 'Bone' || n.name) bones[n.name] = bones[n.name] ?? n; });
    this.b = bones;
    // Goblin's source hat is authored riding high and back on his head: seat it (tuned by render)
    if (this.key === 'greengoblin' && bones.Hat) { bones.Hat.position.y -= 0.013; bones.Hat.position.z -= 0.006; }
    if (bones.Hat) this._hatBind = [bones.Hat.position.clone(), bones.Hat.quaternion.clone()];   // rest pose, before any clip
    // Scale so the head sits where a LEGO minifig's does (neck ~1.33 above the feet)
    model.updateMatrixWorld(true);
    const head = bones.Head ?? bones.Neck;
    const box = new THREE.Box3().setFromObject(model);
    const feet = box.min.y;
    const hy = head ? new THREE.Vector3().setFromMatrixPosition(head.matrixWorld).y - feet : (box.max.y - feet) * 0.7;
    const s = 1.33 / Math.max(1e-4, hy);
    // Big-figs: bulkier and taller than a minifig (Venom towers over Spider-Man)
    const BIG = { venombigfig: [1.5, 1.5], lizard: [1.4, 1.5] }, big = BIG[this.key];
    if (big) model.scale.set(s * big[0], s * big[1], s * big[0]); else model.scale.setScalar(s);
    model.userData.bigfig = !!big;
    model.position.y = -feet * model.scale.y;
    model.rotation.y = Math.PI;           // exported facing -z; the game's figures face +z
    // Pivot at the figure's middle: swings tilt the whole body along the web line around it
    const mid = 0.62 * (big ? big[1] : 1);
    this.spin = new THREE.Group(); this.spin.position.y = mid;
    model.position.y -= mid;
    this.spin.add(model);
    this.root.add(this.spin);
    this.root.position.y = -0.5;          // same stand offset as LegoSpidey (root sits 0.5 above ground)
    model.updateMatrixWorld(true);
    // Bind pose: local + model-space parent rotations for every bone we drive
    this.bind = new Map();
    const inv = new THREE.Quaternion().copy(model.quaternion).invert();
    for (const name of ['Hips', 'Spine', 'Spine1', 'Head', 'Neck', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg']) {
      const bn = bones[name];
      if (!bn) continue;
      const pq = new THREE.Quaternion();
      bn.parent.getWorldQuaternion(pq);
      pq.premultiply(inv);
      const wq = new THREE.Quaternion(); bn.getWorldQuaternion(wq); wq.premultiply(inv);
      this.bind.set(name, { bone: bn, local: bn.quaternion.clone(), parentQ: pq, parentQi: pq.clone().invert(), pos: bn.position.clone(), bindWi: wq.invert() });
    }
    // Big-figs (Venom) play the game's own decoded animations; procedural poses fill the gaps
    if (big) {
      const bank = this.key === 'lizard' ? await loadLizardClips() : await loadBigfigClips();
      if (bank) {
        this.anim = new BigfigPlayer(bank, bones);
        this._animBind = this.anim.joints.map(b => b?.quaternion.clone() ?? null);
        this._hipsBind = bones.Hips?.position.clone();
        this._clipW = 0;
      }
    }
    // Every summoned minifig can use the decoded shared locomotion, swing, climb, and shooting
    // clips. They share TT's 63-joint names, so retargeting preserves each character's own rig.
    const mini = await loadClipBank('minifig');
    if (mini && bones.Character) {
      this.mini = new ClipPlayer(mini);
      this.retarget = new Retarget(mini, bones.Character);
      this._miniW = 0;
    }
    // Green Goblin's own source set contains his glider flight, hover, and pumpkin-shot motions.
    // Disabled: his clip bank retargets badly onto this figure (arms splay out, claws twist).
    // He uses the same procedural + shared minifig motion as every other figure.
    if (false && this.key === 'greengoblin' && bones.Character) {
      const goblin = await loadClipBank('greengoblin');
      if (goblin) {
        this.goblinAnim = new ClipPlayer(goblin);
        this.goblinRetarget = new Retarget(goblin, bones.Character);
      }
    }
    // Handles in root space (unscaled) for gear/weapons: they follow the bones each frame
    this.torso = new THREE.Group(); this.head = new THREE.Group();
    this.arm = { [-1]: new THREE.Group(), [1]: new THREE.Group() };
    this.root.add(this.torso, this.head, this.arm[-1], this.arm[1]);
    this.t = 0; this.phase = 0;
    this.cur = {};
    this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._v = new THREE.Vector3();
    this._follow();
    if (this.key === 'venombigfig') {
      // Face offsets are measured in root space; undo the head handle's bind rotation so they line up
      const w = new THREE.Group();
      w.quaternion.copy(this.head.quaternion).invert();
      const face = venomFace();
      w.add(face);
      this.head.add(w);
      this._fitVenomFace(face, w);
    }
    // Characters whose extracted head came out blank (or untinted): print a face, add hair, fix colours
    this._dressHead();
    // Characters whose rip has no hair part get the real LEGO hair piece on their hat locator
    const sh = SOURCE_HAIR[this.key];
    if (sh && (bones.Hat || bones.Head)) {
      try {
        const hair = (await loader.loadAsync(`assets/models/hair/${sh.file}.glb`)).scene.clone(true);
        hair.traverse(n => {
          if (!n.isMesh) return;
          n.material = new THREE.MeshStandardMaterial({ color: sh.color, roughness: 0.42, metalness: 0.02, side: THREE.DoubleSide });
          n.castShadow = true;
          this.meshes.push(n);
        });
        hair.name = 'SourceHair';
        (bones.Hat ?? bones.Head).add(hair);
      } catch (e) { console.warn('[GlbMinifig] hair piece failed', sh.file, e.message); }
    }
    // Talking mouth: a dark oval on the face that opens and closes while the character speaks
    const hf = this.meshes.find(m => m.name === 'head_front') ?? this.meshes.find(m => /^head/.test(m.name));
    if (hf) {
      this.root.updateMatrixWorld(true);
      const hb = new THREE.Box3().setFromObject(hf);
      const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
      hb.applyMatrix4(inv);
      const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), new THREE.MeshBasicMaterial({ color: 0x2a0a0a }));
      mouth.position.set(0, hb.min.y + (hb.max.y - hb.min.y) * 0.26, hb.max.z + 0.004);
      mouth.position.sub(this.head.position);
      mouth.scale.set(1, 0.01, 1);
      mouth.visible = false;
      this.head.add(mouth);
      this.mouth = mouth;
    }
    return this;
  }

  /** Rotate a bone by (ax, az, ay) radians about model-space X/Z/Y, from its bind pose. */
  _pose(name, ax, az = 0, ay = 0) {
    const B = this.bind.get(name);
    if (!B) return;
    // The exported figures face -z (we turn the model round), so forward/outward signs flip
    const q = this._q.setFromAxisAngle(X, -ax).multiply(this._q2.setFromAxisAngle(Z, -az)).multiply(this._q2.setFromAxisAngle(Y, ay));
    // local = parentQ^-1 * R * parentQ * bindLocal
    B.bone.quaternion.copy(B.parentQi).multiply(q).multiply(B.parentQ).multiply(B.local);
  }

  /** Draw-call cut for crowds: skinned parts that share a skeleton, bind pose, transform and identical
   *  material settings are merged into one SkinnedMesh. The originals stay attached but hidden, so
   *  shatter() and flash() keep working on `this.meshes`. Face layers and the mouth stay separate (blink/talk). */
  mergeParts() {
    if (this._merged) return 0;
    this._merged = [];
    const groups = new Map();
    for (const m of this.meshes) {
      if (!m.isSkinnedMesh || !m.visible || Array.isArray(m.material) || /^face_/.test(m.name) || m === this.mouth) continue;
      const x = m.material;
      const k = [x.type, x.color?.getHex(), x.emissive?.getHex(), x.roughness, x.metalness, x.side, x.transparent, x.opacity,
        x.vertexColors, x.polygonOffset, x.map?.uuid, m.parent?.uuid, m.matrix.elements.join(','), m.bindMatrix.elements.join(','),
        Object.keys(m.geometry.attributes).sort().join('|'), !!m.geometry.index].join(';');
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(m);
    }
    let saved = 0;
    for (const parts of groups.values()) {
      if (parts.length < 2) continue;
      const bones = parts[0].skeleton.bones;
      if (!parts.every(p => p.skeleton.bones.length === bones.length && p.skeleton.bones.every((b, i) => b === bones[i]))) continue;
      const geo = mergeGeometries(parts.map(p => p.geometry), false);
      if (!geo) continue;
      const sm = new THREE.SkinnedMesh(geo, parts[0].material);
      sm.name = 'merged_' + parts[0].name;
      sm.position.copy(parts[0].position); sm.quaternion.copy(parts[0].quaternion); sm.scale.copy(parts[0].scale);
      sm.castShadow = parts.some(p => p.castShadow); sm.receiveShadow = parts[0].receiveShadow;
      sm.frustumCulled = false;
      sm.renderOrder = parts[0].renderOrder;
      parts[0].parent.add(sm);
      sm.bind(parts[0].skeleton, parts[0].bindMatrix);
      for (const p of parts) { p.visible = false; p.castShadow = false; p.material = parts[0].material; }
      this._merged.push(sm);
      saved += parts.length - 1;
    }
    return saved;
  }

  flash(amount) {
    for (const m of this.meshes) for (const mat of [].concat(m.material)) mat.emissive?.setRGB(amount, amount, amount);
  }

  handWorld(v, side) {
    const h = this.b[side === 1 ? 'LeftHand' : 'RightHand'];
    return h ? h.getWorldPosition(v) : this.root.getWorldPosition(v).setY(v.y + 1.1);
  }

  /** Keep the gear handles on their bones (position + rotation, no scale). */
  _follow() {
    const rootInvQ = this._rq ??= new THREE.Quaternion();
    this.root.updateMatrixWorld(true);
    this.root.getWorldQuaternion(rootInvQ).invert();
    const place = (handle, boneName, deltaFrom) => {
      const bn = this.b[boneName];
      if (!bn) return;
      bn.getWorldPosition(this._v);
      handle.position.copy(this.root.worldToLocal(this._v));
      if (deltaFrom) {
        // Rotation relative to the bind pose, expressed in root space
        const B = this.bind.get(deltaFrom);
        if (B) { bn.getWorldQuaternion(handle.quaternion); handle.quaternion.premultiply(rootInvQ).multiply(B.bindWi); }
      }
    };
    place(this.head, 'Head', 'Head');
    place(this.arm[1], 'LeftArm', 'LeftArm');
    place(this.arm[-1], 'RightArm', 'RightArm');
    this.torso.position.set(0, 0, 0);
  }

  /** Same state contract as LegoSpidey.update (speed, grounded, vy, attack, emote, hurt, slam...). */
  update(dt, s = {}) {
    this.t += dt;
    if (this.flames) this.flames.userData.tick(this.t);
    const P = { arm: { [-1]: 0, [1]: 0 }, armZ: { [-1]: 0, [1]: 0 }, leg: { [-1]: 0, [1]: 0 }, knee: { [-1]: 0, [1]: 0 }, lean: 0, headY: 0, headX: 0, bodyY: 0 };
    const sp = s.speed ?? 0;
    P.legZ = { [-1]: 0, [1]: 0 }; P.spineZ = 0; P.elbow = { [-1]: 0, [1]: 0 };
    this.climbSurge = 1;
    this.wallGap = this.model.userData.bigfig ? 0.85 : 0.45;
    if (s.climbing) {
      // Beast climb: hand-over-hand heaves. One arm slams up high while the other drags the body
      // up to it, the opposite knee hikes up splayed wide, shoulders roll and the torso hunches into
      // the wall. The body surges on each pull (climbSurge) instead of gliding at a constant speed.
      const big = this.model.userData.bigfig ? 1 : 0.6;
      this._climbPh = (this._climbPh ?? 0) + dt * 3.4 * (s.climbMove ?? 0);
      const ph = this._climbPh, c = Math.sin(ph), pull = Math.cos(ph) ** 2;
      const idle = (s.climbMove ?? 0) ? 0 : Math.sin(this.t * 1.6) * 0.05;   // hanging still: slow breathing
      P.arm[-1] = -2.15 - c * 0.85 * big + idle; P.arm[1] = -2.15 + c * 0.85 * big - idle;
      P.armZ[-1] = -0.55 - Math.max(0, -c) * 0.45 * big; P.armZ[1] = 0.55 + Math.max(0, c) * 0.45 * big;   // pulling elbow flares out
      P.leg[-1] = -0.7 + c * 0.75 * big; P.leg[1] = -0.7 - c * 0.75 * big;
      P.knee[-1] = 0.9 - c * 0.6; P.knee[1] = 0.9 + c * 0.6;
      P.legZ[-1] = -0.45; P.legZ[1] = 0.45;                                 // frog-legged against the wall
      P.lean = (this.model.userData.bigfig ? 0.18 : 0.42) + pull * 0.08 * big; // hunched in, heaving on each pull (big-figs less, or the head hits the wall)
      P.spineZ = c * 0.22 * big;                                            // shoulders roll toward the reaching arm
      P.headY = -c * 0.3; P.headX = this.model.userData.bigfig ? -0.4 : -0.15;   // big-figs look up the wall, not into it
      P.bodyY = -0.18 + pull * 0.12 * big;
      if (this.model.userData.bigfig && s.climbMove) this.climbSurge = 0.55 + 0.9 * pull;
      this.climbPull = s.climbMove ? pull : 0;
    } else if (s.swinging) {
      // Ported from LegoSpidey: a fresh style per swing, an arc value that flows from the drop
      // (-1) to the rise (+1), the web arm reaching up the line and the whole body hanging along it
      // (spin, below). Big-figs swing heavier: wider limbs, slower pumps, more body swing.
      const big = this.model.userData.bigfig;
      if (!this._wasSwinging) {
        const styles = s.twoHandGrip === true ? ['twohand'] : s.twoHandGrip === false
          ? (big ? ['brute', 'tuck', 'spread', 'kick'] : ['classic', 'tuck', 'spread', 'kick'])
          : (big ? ['brute', 'tuck', 'spread', 'kick'] : ['classic', 'tuck', 'twohand', 'spread', 'kick']);
        let pick = styles[Math.floor(Math.random() * styles.length)];
        if (styles.length > 1) while (pick === this._swingStyle) pick = styles[Math.floor(Math.random() * styles.length)];
        this._swingStyle = pick; this._swingT = 0;
      }
      const vy = s.vy ?? 0, w = s.webArm ?? -1, f = -w;
      this._swingT += dt;
      this._arc = damp(this._arc ?? 0, Math.max(-1, Math.min(1, vy / 10)), 1 - Math.exp(-5 * dt));
      const a = this._arc, up = Math.max(0, a), down = Math.max(0, -a);
      const fast = Math.min(sp / 30, 1), tempo = big ? 0.7 : 1;
      const sway = Math.sin(this.t * 2.3 * tempo) * 0.12, sway2 = Math.sin(this.t * 3.1 * tempo + 1) * 0.1;
      const reach = Math.min(1, this._swingT / 0.22);
      // Angle the gripping wrist forward so the strand reads as hand-held, not head-mounted.
      P.arm[w] = -1.65 - reach * 0.7; P.armZ[w] = -w * 0.18 * reach; P.elbow[w] = 0.15;
      P.headX = -0.25 + up * 0.15; P.headY = f * 0.2 * a;
      switch (this._swingStyle) {
        case 'brute': {     // Venom: free arm hauled back ready to swipe, knees pulled up, slashing through the bottom
          const claw = Math.sin(this.t * 3.2);
          P.arm[f] = -0.6 + down * 0.5 - up * 1.1 + claw * 0.25; P.armZ[f] = f * (0.85 + up * 0.35); P.elbow[f] = 1.1 - up * 0.6;
          P.leg[-1] = -1.0 - up * 0.45 + claw * 0.2; P.leg[1] = -0.75 - up * 0.45 - claw * 0.2;
          P.legZ[-1] = -0.35; P.legZ[1] = 0.35;
          P.knee[-1] = 1.3 - up * 0.5; P.knee[1] = 1.0 - up * 0.4;
          P.lean = 0.35 * down - 0.2 * up; P.spineZ = f * 0.15 * a; break;
        }
        case 'tuck':
          P.arm[f] = -1.1 + sway; P.armZ[f] = f * 0.35; P.elbow[f] = 0.8;
          P.leg[-1] = P.leg[1] = -1.25 + up * 0.5;
          P.knee[-1] = P.knee[1] = 1.5 - up * 0.9;
          P.lean = 0.25 - up * 0.5; break;
        case 'twohand':
          P.arm[w] = P.arm[f] = -2.35;
          P.armZ[w] = -w * 0.18; P.armZ[f] = -f * 0.18;
          P.elbow[w] = P.elbow[f] = 0.25;
          P.leg[-1] = P.leg[1] = 0.25 - up * 0.95 + down * 0.25;
          P.knee[-1] = P.knee[1] = 0.25 + up * 0.35;
          P.lean = -0.15 - up * 0.3 + down * 0.25; P.spineZ = sway2 * 0.8; break;
        case 'spread': {
          const sc = Math.sin(this.t * 5 * tempo);
          P.arm[f] = -0.45 + sway; P.armZ[f] = f * 1.35; P.elbow[f] = 0.3;
          P.leg[-1] = -0.35 + sc * 0.45 - up * 0.3; P.leg[1] = -0.35 - sc * 0.45 - up * 0.3;
          P.legZ[-1] = -0.3; P.legZ[1] = 0.3;
          P.knee[-1] = 0.3 + Math.max(0, sc) * 0.6; P.knee[1] = 0.3 + Math.max(0, -sc) * 0.6;
          P.lean = -0.25 * a; P.headY += f * 0.2; break;
        }
        case 'kick':
          P.arm[f] = -1.4 + down * 0.6; P.armZ[f] = f * 0.6; P.elbow[f] = 0.5;
          P.leg[-1] = P.leg[1] = 0.45 * down - 1.45 * up;
          P.knee[-1] = P.knee[1] = 0.9 * down + 0.1 * up;
          P.lean = 0.35 * down - 0.45 * up; P.spineZ = sway * 0.6; break;
        default: {
          const pump = Math.sin(this.t * (4 + fast * 7) * tempo);
          P.arm[f] = -0.9 + pump * 0.45; P.armZ[f] = f * 0.55; P.elbow[f] = 0.6;
          P.leg[-1] = -0.45 - up * 0.65 + pump * 0.4; P.leg[1] = -0.2 - up * 0.65 - pump * 0.4;
          P.knee[-1] = 0.35 + Math.max(0, pump) * 0.7; P.knee[1] = 0.35 + Math.max(0, -pump) * 0.7;
          P.lean = Math.max(-0.55, Math.min(0.5, -vy * 0.035)) - 0.1;
        }
      }
      P.lean += sway2 * 0.3;
    } else if (s.grounded === false && !s.flight) {
      const f = Math.sin(this.t * 8) * 0.18;
      if ((s.vy ?? 0) > 0) {
        P.arm[-1] = -1.5; P.arm[1] = -1.3; P.armZ[-1] = -0.3; P.armZ[1] = 0.3;
        P.leg[-1] = -0.6; P.leg[1] = 0.3;
      } else {
        P.arm[-1] = -0.9 + f; P.arm[1] = -0.9 - f; P.armZ[-1] = -0.45; P.armZ[1] = 0.45;
        P.leg[-1] = -0.2 + f; P.leg[1] = 0.15 - f;
      }
    } else if (s.flight) {
      P.arm[-1] = P.arm[1] = -0.4; P.armZ[-1] = -0.5; P.armZ[1] = 0.5; P.lean = 0.45;
    } else if (sp > 0.4) {
      const run = Math.min(sp / 14, 1);
      this.phase += dt * (7 + run * 6);
      const w = Math.sin(this.phase) * (0.55 + run * 0.4);
      P.leg[-1] = w; P.leg[1] = -w; P.arm[-1] = -w * 0.9; P.arm[1] = w * 0.9;
      P.knee[-1] = Math.max(0, -w) * 0.6; P.knee[1] = Math.max(0, w) * 0.6;
      P.lean = 0.05 + run * 0.15;
      P.bodyY = Math.abs(Math.cos(this.phase)) * 0.06;
    } else {
      const b = Math.sin(this.t * 1.8);
      P.arm[-1] = -0.06 + b * 0.04; P.arm[1] = -0.06 - b * 0.04;
      P.headY = Math.sin(this.t * 0.45) * 0.3 * (Math.sin(this.t * 0.17) > 0.3 ? 1 : 0);
    }
    if (s.emote) {
      const w = Math.sin(this.t * 10), slow = Math.sin(this.t * 4);
      if (s.emote === 'talk') { P.arm[-1] = -0.45 + Math.sin(this.t * 3.1) * 0.3; P.arm[1] = -0.25 + Math.sin(this.t * 2.3 + 1) * 0.2; P.headY = Math.sin(this.t * 1.7) * 0.18; P.headX = Math.sin(this.t * 4.3) * 0.06; }
      else if (s.emote === 'wave') { P.arm[1] = -2.8 + w * 0.3; }
      else if (s.emote === 'point') { P.arm[-1] = -2.42 + Math.sin(this.t * 2.2) * 0.06; P.armZ[-1] = 0.14; P.headY = 0.14; P.headX = -0.06; }
      else if (s.emote === 'operate') { P.arm[-1] = -1.3 + Math.sin(this.t * 5.6) * 0.22; P.arm[1] = -1.14 + Math.cos(this.t * 4.4) * 0.18; P.headX = 0.16; P.lean = 0.08; }
      else if (s.emote === 'listen') { P.arm[-1] = -0.14; P.arm[1] = -0.12; P.headY = Math.sin(this.t * 1.1) * 0.1; P.headX = -0.05; }
      else if (s.emote === 'photo') { P.arm[-1] = P.arm[1] = -1.5; P.headX = 0.1; }   // phone held up at eye level
      else if (s.emote === 'grumble') { P.arm[-1] = P.arm[1] = -0.3; P.armZ[-1] = -0.5; P.armZ[1] = 0.5; P.headY = Math.sin(this.t * 6) * 0.25; }
      else if (s.emote === 'cheer') { P.arm[-1] = P.arm[1] = -3.0 + w * 0.15; P.bodyY = Math.abs(Math.sin(this.t * 7)) * 0.2; }
      else if (s.emote === 'flex') { P.arm[-1] = P.arm[1] = -1.6; P.armZ[-1] = -1.2; P.armZ[1] = 1.2; }
      else if (s.emote === 'sit') { P.leg[-1] = P.leg[1] = -1.5; P.bodyY = -0.4; }
      // Story poses (Uncle Ben's scene): reaching out, grief, wounded
      else if (s.emote === 'reach') { P.arm[-1] = -1.55 + Math.sin(this.t * 1.6) * 0.05; P.arm[1] = -0.2; P.headX = -0.08; P.lean = 0.06; }
      else if (s.emote === 'grief') { P.arm[-1] = P.arm[1] = -0.4; P.armZ[-1] = -0.2; P.armZ[1] = 0.2; P.headX = 0.45; P.lean = 0.14 + Math.sin(this.t * 2.2) * 0.02; }
      else if (s.emote === 'wounded') { P.arm[-1] = -0.7; P.arm[1] = -0.15; P.armZ[-1] = -0.2; P.headX = 0.15; P.lean = 0.1; }
      else { P.arm[-1] = -1.2 + slow; P.arm[1] = -1.2 - slow; P.bodyY = Math.abs(Math.sin(this.t * 8)) * 0.1; }
    }
    if ((s.attack ?? 0) > 0) {
      const side = s.attackArm ?? -1, t = s.attack;
      switch (s.attackKind) {
        case 'shoot':
          P.arm[side] = -1.5 + (1 - t) * 0.12; P.arm[-side] = -1.38; P.lean = 0.1; break;
        case 'throw':
          P.arm[side] = t > 0.55 ? -2.35 : -0.6; P.arm[-side] = 0.25; P.lean = t > 0.55 ? -0.1 : 0.2; break;
        case 'sword': case 'spear': case 'staff':
          P.arm[side] = t > 0.55 ? -2.5 : -0.72; P.arm[-side] = 0.25; P.lean = t > 0.55 ? -0.1 : 0.24; break;
        case 'cast':
          P.arm[side] = -2.65; P.armZ[side] = -0.28; P.arm[-side] = s.flight ? -0.6 : -0.25; P.headX = -0.16; break;
        case 'slam':
          P.arm[-1] = P.arm[1] = -2.85; P.leg[-1] = P.leg[1] = -0.42; P.lean = 0.26; break;
        default:
          P.arm[side] = t > 0.6 ? -0.45 : -1.72; P.arm[-side] = 0.28; P.lean = 0.18;
      }
    }
    if (s.slam) { P.arm[-1] = P.arm[1] = -3.0; P.leg[-1] = P.leg[1] = -0.5; }
    if ((s.hurt ?? 0) > 0) { P.lean = -0.35; P.headX = 0.3; }

    // Blink every few seconds
    if (this._blink?.open && this._blink?.closed) {
      this._nextBlink ??= 2 + Math.random() * 3;
      const blinking = (this.t % this._nextBlink) < 0.13;
      this._blink.open.visible = !blinking;
      this._blink.closed.visible = blinking;
    }
    if (this.mouth) {
      const talking = s.emote === 'talk';
      this.mouth.visible = talking;
      if (talking) this.mouth.scale.y = 0.15 + Math.abs(Math.sin(this.t * 13)) * Math.abs(Math.sin(this.t * 3.7)) * 0.55;
    }
    const k = 1 - Math.exp(-14 * dt), c = this.cur;
    const sm = (key, v) => (c[key] = damp(c[key] ?? 0, v, k));
    // Clip-driven states: decide the clip, then reset every joint to bind so procedural poses
    // below start clean (they only drive a few bones), and blend the clip over the top at the end.
    const clipMode = this.anim ? this._pickClip(s, dt) : false;
    if (this.anim) {
      this._clipW = damp(this._clipW, clipMode ? 1 : 0, 1 - Math.exp(-(clipMode ? 12 : 9) * dt));
      this.anim.joints.forEach((b, j) => { if (b) b.quaternion.copy(this._animBind[j]); });
    }
    // Left = the figure's left (+x), matching LegoSpidey's side 1
    this._pose('LeftArm', sm('al', P.arm[1]), sm('alz', P.armZ[1]));
    this._pose('RightArm', sm('ar', P.arm[-1]), sm('arz', P.armZ[-1]));
    this._pose('LeftUpLeg', sm('ll', P.leg[1]), sm('llz', P.legZ[1]));
    this._pose('RightUpLeg', sm('lr', P.leg[-1]), sm('lrz', P.legZ[-1]));
    this._pose('LeftLeg', sm('kl', P.knee[1]));
    this._pose('RightLeg', sm('kr', P.knee[-1]));
    this._pose('Spine', sm('lean', P.lean), sm('spz', P.spineZ));
    this._pose('LeftForeArm', sm('el', -P.elbow[1]));
    this._pose('RightForeArm', sm('er', -P.elbow[-1]));
    this._wasSwinging = !!s.swinging;
    // Hang along the web like a pendulum: the body points at the anchor and leans into turns
    if (this.spin) {
      const rope = s.swinging && s.rope ? s.rope : [0, 0], kr = 1 - Math.exp(-(s.swinging ? 10 : 6) * dt);
      this.spin.rotation.x = damp(this.spin.rotation.x, Math.max(-1.1, Math.min(1.1, rope[0] * 0.85)), kr);
      this.spin.rotation.z = damp(this.spin.rotation.z, Math.max(-0.7, Math.min(0.7, -rope[1] * 0.6)), kr);
    }
    this._pose('Head', sm('hx', P.headX), 0, sm('hy', P.headY));
    const hips = this.bind.get('Hips');
    if (hips) hips.bone.position.set(hips.pos.x, hips.pos.y + sm('by', P.bodyY) / this.model.scale.y, hips.pos.z);
    if (this.anim && this._clipW > 0.001) {
      const A = this.anim, w = this._clipW;
      A.update(dt);
      A.joints.forEach((b, j) => { if (b) b.quaternion.slerp(A.out[j], w); });
      if (hips) hips.bone.position.lerp(this._v.copy(this._hipsBind).add(A.hips), w);
    }
    if (this.goblinAnim) this._applyGoblin(s, dt);
    else if (this.mini) this._applyMini(s, dt);
    this._follow();
  }
  /**
   * Choose the big-fig clip for this frame (Hulk/Venom animations from the game). Returns false for
   * states the game has no big-fig clip for (web swing, wall climb, emotes...): those stay procedural.
   */
  _pickClip(s, dt) {
    const A = this.anim, sp = s.speed ?? 0, atk = s.attack ?? 0, hurt = s.hurt ?? 0;
    const edgeAtk = atk > (this._atkPrev ?? 0) + 0.3, edgeHurt = hurt > (this._hurtPrev ?? 0) + 0.1;
    const edgeLand = !!s.land && !this._landPrev;
    this._atkPrev = atk; this._hurtPrev = hurt; this._landPrev = !!s.land;
    this._sinceAtk = (this._sinceAtk ?? 9) + dt;
    if (s.swinging || s.climbing || s.flight || s.wallRun || s.emote || s.trick) { this._oneShot = null; return false; }
    const shot = (name, speed, fade = 0.08) => { A.play(name, { speed, fade, restart: true, loop: false }); this._oneShot = name; };
    if (edgeAtk) {
      // Chain the combo when attacks come quickly, otherwise start from the first hit
      this._combo = this._sinceAtk < 0.9 ? ((this._combo ?? -1) + 1) % 3 : 0;
      this._sinceAtk = 0;
      shot('fight' + (this._combo + 1), 1.6, 0.06);
    } else if (edgeHurt) shot('hit', 1.7);
    else if (s.slam && s.grounded) { if (this._oneShot !== 'slamland') shot('slamland', 1.4); }
    else if (edgeLand && s.grounded !== false) shot(sp > 4 ? 'runland' : 'land', sp > 4 ? 2.2 : 1.8);
    // One-shots run to the end; landings give way as soon as you move off
    const sh = this._oneShot;
    if (sh && A.cur?.name === sh && A.remaining() > 0.06) {
      // Landings give way as soon as you move off; the Lizard's long finishing moves cut back to
      // locomotion once his attack has finished and he starts chasing again.
      const interruptible = ((sh === 'land' || sh === 'runland' || sh === 'slamland') && (sp > 2 || s.grounded === false))
        || (this.key === 'lizard' && /^fight/.test(sh) && sp > 0.4 && atk <= 0.05);
      if (!interruptible) return true;
    }
    this._oneShot = null;
    if (s.slam) { A.play('slamfall', { fade: 0.15 }); return true; }
    if (s.grounded === false) {
      if ((s.vy ?? 0) > 1.5 && A.cur?.name !== 'fall') A.play('jump', { fade: 0.12, speed: 1.3, loop: false });
      else A.play('fall', { fade: 0.3 });
      return true;
    }
    if (sp > 0.4) {
      this._idleT = 0;
      const [name, ref] = sp < 4.5 ? ['walk', 3] : sp < 13 ? ['run', 9] : ['sprint', 16];
      A.play(name, { fade: 0.22, speed: Math.max(0.75, Math.min(1.5, sp / ref)) });
      return true;
    }
    // Idle: the breathing loop, with a fidget (idle2/idle3) every so often
    this._idleT = (this._idleT ?? 0) + dt;
    if (this._idleT > 9 && A.cur?.name === 'idle') {
      this._idleT = 0;
      shot(Math.random() < 0.5 ? 'idle2' : 'idle3', 1, 0.35);
      return true;
    }
    A.play('idle', { fade: 0.3 });
    return true;
  }

  /**
   * Web swing and wall climb from the decoded minifig clips (retargeted). Swings pose the body
   * relative to the hips (the spin pivot tilts it along the web); climbs use the full pose, and the
   * climb's upward surge follows the clip's two pulls per cycle.
   */
  _applyMini(s, dt) {
    const M = this.mini;
    let mode = null, clip = null, loop = false, speed = 1;
    if (s.swinging && !s.twoHandGrip) {
      mode = 'swing'; clip = (s.webArm ?? -1) < 0 ? 'swingR' : 'swingL'; speed = 1.1;
    } else if (s.climbing) {
      mode = 'climb'; clip = s.climbMove ? 'climb' : 'climbidle'; loop = true; speed = s.climbMove ? 0.85 : 1;
    } else if (s.attack > 0 && s.attackKind === 'shoot') {
      mode = 'shoot'; clip = (s.attackArm ?? -1) < 0 ? 'shootR' : 'shootL';
    }

    if (mode && M.has(clip)) {
      const armChanged = mode === 'swing' && (s.webArm ?? -1) !== this._miniArm;
      if (mode !== this._miniMode || clip !== this._miniClip || armChanged) {
        M.play(clip, { restart: !loop, fade: mode === 'swing' ? 0.16 : 0.22, loop, speed });
      } else M.play(clip, { speed });
      this._miniMode = mode;
      this._miniClip = clip;
      this._miniArm = s.webArm ?? -1;
      this._miniW = damp(this._miniW, 1, 1 - Math.exp(-10 * dt));
      if (mode === 'climb' && s.climbMove && M.cur?.name === 'climb') {
        const pl = Math.cos(M.progress() * Math.PI * 2) ** 2;
        this.climbSurge = 0.55 + 0.9 * pl; this.climbPull = pl;
      }
    } else {
      this._miniW = damp(this._miniW, 0, 1 - Math.exp(-8 * dt));
      if (this._miniW < 0.001) { this._miniMode = this._miniClip = null; return; }
    }
    M.update(dt);
    // Swing clips whip the head around with the body; keep the steady procedural head instead.
    const head = this._miniMode === 'swing' ? this.bind.get('Head')?.bone : null;
    if (head) (this._headQ ??= new THREE.Quaternion()).copy(head.quaternion);
    this.retarget.apply(M.out, this._miniW, this._miniMode === 'swing' ? 'Hips' : null, this._miniMode === 'climb' ? CLIMB_ROOT_GLB : null);
    if (head) head.quaternion.copy(this._headQ);
    // Clips carry a "Hat" joint channel that lifts hats/hair off the head on this rig: keep it at rest
    const hat = this.b?.Hat;
    if (hat && this._hatBind) { hat.position.copy(this._hatBind[0]); hat.quaternion.copy(this._hatBind[1]); }
  }

  /** Play Green Goblin's extracted default, combat, and glider AN4 clips on his minifig rig. */
  _applyGoblin(s, dt) {
    const A = this.goblinAnim;
    const moving = (s.speed ?? 0) > 0.4;
    let clip = 'idle', loop = true, speed = 1;
    if (s.hurt > 0 && s.flight && A.has('flyHit')) { clip = 'flyHit'; loop = false; }
    else if (s.flight && s.attack > 0 && ['shoot', 'throw'].includes(s.attackKind) && A.has('shootFly')) { clip = 'shootFly'; loop = false; }
    else if (s.flight && s.sprint && A.has('flySprint')) { clip = 'flySprint'; speed = 1.05; }
    else if (s.flight && moving) { clip = 'fly'; }
    else if (s.flight) { clip = 'hover'; }
    else if (s.attack > 0 && ['shoot', 'throw'].includes(s.attackKind) && A.has('shoot')) { clip = 'shoot'; loop = false; }
    else if (s.attack > 0 && A.has('combo')) { clip = 'combo'; loop = false; }
    else if (s.grounded === false) { clip = (s.vy ?? 0) > 1 ? 'jump' : 'fall'; loop = clip === 'fall'; }
    else if (moving) { clip = s.sprint && A.has('sprint') ? 'sprint' : (s.speed ?? 0) > 9 ? 'run' : 'walk'; }

    if (!A.has(clip)) clip = A.has('idle') ? 'idle' : Object.keys(A.bank.clips)[0];
    if (A.cur?.name !== clip) A.play(clip, { restart: !loop, loop, speed, fade: 0.18 });
    else A.play(clip, { speed });
    A.update(dt);
    // The source clips' wrist channels don't map onto this rig's hand bones and twist the claws
    // around; keep the hands at rest (first call runs before any clip touched them).
    this._handBind ??= ['LeftHand', 'RightHand'].map(k => this.b[k]).filter(Boolean).map(b => [b, b.quaternion.clone()]);
    this.goblinRetarget.apply(A.out, 1);
    for (const [b, q] of this._handBind) b.quaternion.copy(q);
  }

  /** Measure the minifig head in a holder that shares the root's orientation (origin at the Head bone). */
  _headHolder() {
    if (this._hh) return this._hh;
    const w = new THREE.Group();
    w.quaternion.copy(this.head.quaternion).invert();
    this.head.add(w);
    this.root.updateMatrixWorld(true);
    const toLocal = new THREE.Matrix4().copy(w.matrixWorld).invert();
    const pts = [], v = new THREE.Vector3();
    const named = this.meshes.filter(m => /^head_(front|back)/.test(m.name));
    for (const m of named) {
      m.skeleton?.update();
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) { m.getVertexPosition(i, v); pts.push(v.clone().applyMatrix4(m.matrixWorld).applyMatrix4(toLocal)); }
    }
    if (!pts.length) return null;
    const box = new THREE.Box3().setFromPoints(pts);
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, h = box.max.y - box.min.y;
    let r = 0;
    for (const q of pts) if (q.y > box.min.y + h * 0.3 && q.y < box.min.y + h * 0.7) r = Math.max(r, Math.hypot(q.x - cx, q.z - cz));
    // The cylinder of the head (no neck, no top stud): rows that reach most of the full radius
    let y0 = Infinity, y1 = -Infinity;
    for (const q of pts) if (Math.hypot(q.x - cx, q.z - cz) > r * 0.9) { y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    this._hh = { w, cx, cz, r, y0, y1 };
    return this._hh;
  }

  _dressHead() {
    const k = this.key, print = FACE_PRINTS[k], hair = HAIR[k];
    if (k === 'gwenstacy' || k === 'maryjanewatson') {
      // The rip's face layers overlap and flatten into a dark smear around the mouth. Keep the
      // head shell and replace the whole stack with one clean print, and stop the blink layers
      // from bringing it back.
      for (const m of this.meshes) if (/^face_/.test(m.name)) m.visible = false;
      this._blink = null;
    }
    if (print || hair || k === 'ghostrider') {
      const H = this._headHolder();
      if (H) {
        if (print) H.w.add(facePatch(print, H));
        if (hair) {
          const g = bobHair(hair[0], hair[1]);
          // Gear hair is modelled for a head 0.243 in radius and 0.57 tall, from the bottom of the head up
          const sc = H.r / 0.243;
          g.scale.set(sc, (H.y1 - H.y0) / 0.5, sc);
          g.position.set(H.cx, H.y0 - 0.02 * sc, H.cz);
          g.traverse(n => { if (n.isMesh) n.castShadow = true; });
          H.w.add(g);
        }
        if (k === 'ghostrider') { this.flames = skullFlames(H); H.w.add(this.flames); }
      }
    }
    if (k === 'ironman') {
      // Helmet pieces came out with plain white vertex colours: red shell, gold faceplate, glowing eye slits
      for (const m of this.meshes) {
        const mat = [].concat(m.material)[0];
        if (m.name === 'hat_7') Object.assign(mat, { vertexColors: false }).color.setHex(0xe0a92a), mat.metalness = 0.55, mat.roughness = 0.3;
        if (m.name === 'hat_8') { mat.vertexColors = false; mat.color.setHex(0xeaf6ff); mat.emissive?.setHex(0xbfe6ff); mat.emissiveIntensity = 1.2; }
        if (m.name === 'hat_6') { mat.metalness = 0.4; mat.roughness = 0.3; }
        if (/^hat_/.test(m.name)) mat.needsUpdate = true;
      }
    }
    if (k === 'ironspider') {
      // The summonable Iron Spider wears the same golden waldo arms as the playable suit
      const arms = ironArms();
      this.torso.add(arms);
      this.waldo = arms.userData.waldo ?? [];
    }
  }

  /** Grow the face patch until every skinned head vertex in front of it sits inside, so nothing black clips through. */
  _fitVenomFace(face, holder) {
    // The big-fig is one skinned mesh in several primitives: the head is whatever the Head bone mostly drives
    this.root.updateMatrixWorld(true);
    const toLocal = new THREE.Matrix4().copy(holder.matrixWorld).invert();
    const v = new THREE.Vector3(), c = face.position, r = face.scale;
    let k = 1;
    for (const m of this.meshes) {
      if (!m.isSkinnedMesh || m === face) continue;
      m.skeleton.update();
      const hi = m.skeleton.bones.findIndex(b => b.name === 'Head');
      if (hi < 0) continue;
      const pos = m.geometry.attributes.position, si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
      for (let i = 0; i < pos.count; i++) {
        let w = 0;
        for (let j = 0; j < 4; j++) if (si.getComponent(i, j) === hi) w += sw.getComponent(i, j);
        if (w < 0.5) continue;
        m.getVertexPosition(i, v);
        v.applyMatrix4(m.matrixWorld).applyMatrix4(toLocal);
        if (v.z < c.z - 0.02) continue;                         // only the front of the head matters
        const d = Math.hypot((v.x - c.x) / r.x, (v.y - c.y) / r.y, (v.z - c.z) / r.z);
        if (d > k) k = d;
      }
    }
    if (k > 1 && k < 1.6) r.multiplyScalar(k * 1.012);
    this._faceFit = k;
  }

}


/** Venom big-fig face (the extracted head is plain black): huge slanted white eyes and a fanged grin,
 *  printed on a curved patch hugging the front of the head (measured from the skinned head verts). */
function venomFace() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d');
  const eye = s => {
    x.save(); x.translate(256 + s * 118, 165); x.scale(s * 1.3, 1.3);
    x.beginPath();
    x.moveTo(-70, -20); x.quadraticCurveTo(10, -70, 95, -55);
    x.quadraticCurveTo(70, 40, -10, 75); x.quadraticCurveTo(-75, 40, -70, -20);
    x.closePath();
    x.lineWidth = 16; x.strokeStyle = '#0c0c10'; x.stroke();
    x.fillStyle = '#f4f4f4'; x.fill();
    x.restore();
  };
  eye(-1); eye(1);
  // Grin: dark red mouth, rows of white fangs, a long tongue
  x.beginPath();
  x.moveTo(70, 330); x.quadraticCurveTo(256, 300, 442, 330);
  x.quadraticCurveTo(400, 470, 256, 480); x.quadraticCurveTo(112, 470, 70, 330);
  x.closePath();
  x.fillStyle = '#5a0a12'; x.fill(); x.lineWidth = 10; x.strokeStyle = '#0c0c10'; x.stroke();
  x.fillStyle = '#f4f4f4';
  for (let i = 0; i < 9; i++) {
    const tx = 92 + i * 41;
    x.beginPath(); x.moveTo(tx - 16, 322); x.lineTo(tx + 16, 322); x.lineTo(tx, 365 + (i % 2) * 14); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(tx - 14, 462 - Math.abs(i - 4) * 9); x.lineTo(tx + 14, 462 - Math.abs(i - 4) * 9); x.lineTo(tx, 425 - Math.abs(i - 4) * 9); x.closePath(); x.fill();
  }
  x.fillStyle = '#d0384a';
  x.beginPath(); x.ellipse(256, 420, 46, 26, 0, 0, Math.PI * 2); x.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.SphereGeometry(1, 32, 24, Math.PI / 2 - 0.95, 1.9, 0.62, 1.75);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  m.scale.set(0.255, 0.31, 0.262);
  m.position.set(0, 0.123, 0.135);
  return m;
}


// ── Printed faces for minifigs whose face meshes were never extracted ─────────────────────────
/** Draws on a 512x256 canvas: x spans the front of the head (centre = 256), y spans its height (top = 0). */
const FACE_PRINTS = {
  maryjanewatson: x => {
    brows(x, '#9c3418', 1); eyesDots(x, true);
    x.fillStyle = '#d2444f';                                                   // lips
    x.beginPath(); x.moveTo(226, 178); x.quadraticCurveTo(256, 168, 286, 178); x.quadraticCurveTo(256, 196, 226, 178); x.fill();
    x.fillStyle = 'rgba(176,96,56,0.55)';                                      // freckles
    for (const [dx, dy] of [[-70, 146], [-58, 154], [-80, 156], [70, 146], [58, 154], [80, 156]]) { x.beginPath(); x.arc(256 + dx, dy, 3.2, 0, Math.PI * 2); x.fill(); }
  },
  mrfantastic: x => {
    brows(x, '#3b2a1e', 0); eyesDots(x); smile(x, '#2a1a10');
    x.strokeStyle = 'rgba(120,70,40,0.55)'; x.lineWidth = 3;                     // laugh lines
    for (const s of [-1, 1]) { x.beginPath(); x.moveTo(256 + s * 62, 150); x.quadraticCurveTo(256 + s * 70, 170, 256 + s * 60, 186); x.stroke(); }
  },
  blackwidow: x => {
    brows(x, '#7e1c14', 1); eyesDots(x, true);
    x.fillStyle = '#c42a2e';                                                   // red lips
    x.beginPath(); x.moveTo(222, 178); x.quadraticCurveTo(256, 166, 290, 178); x.quadraticCurveTo(256, 198, 222, 178); x.fill();
    x.fillStyle = 'rgba(230,110,110,0.25)';
    for (const s of [-1, 1]) { x.beginPath(); x.ellipse(256 + s * 78, 150, 20, 11, 0, 0, Math.PI * 2); x.fill(); }
  },
  ironspider: x => {
    // Mask lenses: big white eyes in thick black rims, thin gold web lines
    x.strokeStyle = 'rgba(217,169,46,0.85)'; x.lineWidth = 3;
    for (let i = -4; i <= 4; i++) { x.beginPath(); x.moveTo(256, 150); x.lineTo(256 + i * 70, i % 2 ? 0 : 256); x.stroke(); }
    for (const rr of [55, 105, 160]) { x.beginPath(); x.ellipse(256, 150, rr * 1.4, rr, 0, Math.PI, Math.PI * 2); x.stroke(); }
    for (const s of [-1, 1]) {
      x.save(); x.translate(256 + s * 62, 108); x.scale(s, 1); x.rotate(-0.28);
      x.beginPath(); x.moveTo(-46, -8); x.quadraticCurveTo(10, -46, 52, -18); x.quadraticCurveTo(44, 34, -8, 40); x.quadraticCurveTo(-46, 26, -46, -8);
      x.fillStyle = '#141414'; x.fill();
      x.scale(0.78, 0.74); x.translate(4, 2);
      x.beginPath(); x.moveTo(-46, -8); x.quadraticCurveTo(10, -46, 52, -18); x.quadraticCurveTo(44, 34, -8, 40); x.quadraticCurveTo(-46, 26, -46, -8);
      x.fillStyle = '#f4f4f4'; x.fill();
      x.restore();
    }
  },
  gwenstacy: x => {
    // Gwen: soft brows, big blue eyes with liner, a small nose and a rose smile (no moustache).
    // Scaled up around the face centre: at 1x the features read as faint dots in game.
    x.translate(256, 145); x.scale(1.6, 1.35); x.translate(-256, -145);
    brows(x, '#5a422d', 1);
    for (const s of [-1, 1]) {
      x.fillStyle = '#fff'; x.beginPath(); x.ellipse(256 + s * 48, 112, 26, 20, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#171717'; x.lineWidth = 4; x.stroke();
      x.fillStyle = '#2b7188'; x.beginPath(); x.ellipse(256 + s * 48, 114, 12, 15, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#101010'; x.beginPath(); x.arc(256 + s * 48, 114, 6, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#fff'; x.beginPath(); x.arc(256 + s * 48 - 4, 107, 4, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#171717'; x.lineWidth = 5; x.beginPath(); x.moveTo(256 + s * 70, 100); x.lineTo(256 + s * 78, 94); x.stroke();
    }
    x.fillStyle = 'rgba(180,120,80,0.5)'; x.beginPath(); x.arc(256, 145, 3, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#b64b68';
    x.beginPath(); x.moveTo(222, 176); x.quadraticCurveTo(256, 164, 290, 176); x.quadraticCurveTo(256, 198, 222, 176); x.fill();
    x.strokeStyle = '#7a2338'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(232, 176); x.quadraticCurveTo(256, 187, 280, 176); x.stroke();
  },
  ghostrider: x => {
    // Skull: deep black sockets with an ember glow, nose hole, clenched teeth
    for (const s of [-1, 1]) {
      x.fillStyle = '#0b0705'; x.beginPath(); x.ellipse(256 + s * 52, 112, 40, 34, s * 0.25, 0, Math.PI * 2); x.fill();
      const g = x.createRadialGradient(256 + s * 52, 116, 2, 256 + s * 52, 116, 20);
      g.addColorStop(0, '#fff2a0'); g.addColorStop(0.4, '#ff8a1a'); g.addColorStop(1, 'rgba(255,60,0,0)');
      x.fillStyle = g; x.beginPath(); x.arc(256 + s * 52, 116, 20, 0, Math.PI * 2); x.fill();
    }
    x.fillStyle = '#0b0705'; x.beginPath(); x.moveTo(256, 140); x.lineTo(242, 166); x.lineTo(270, 166); x.closePath(); x.fill();
    x.fillStyle = '#1a1210'; x.fillRect(196, 182, 120, 36);
    x.fillStyle = '#efe8d2';
    for (let i = 0; i < 7; i++) { x.fillRect(199 + i * 17, 184, 14, 15); x.fillRect(199 + i * 17, 201, 14, 14); }
    x.strokeStyle = 'rgba(60,40,30,0.6)'; x.lineWidth = 3;                     // cheekbone cracks
    for (const s of [-1, 1]) { x.beginPath(); x.moveTo(256 + s * 96, 150); x.lineTo(256 + s * 80, 176); x.lineTo(256 + s * 88, 200); x.stroke(); }
  },
};
const HAIR = { blackwidow: [0xa8281c, 0x7e1c14] };
/** Real LEGO hair pieces (Lego Source super_characters/hair) for rips that came without hair. */
const SOURCE_HAIR = { maryjanewatson: { file: 'hair_longswept', color: 0xb5341b } };

function brows(x, col, fem) {
  x.strokeStyle = col; x.lineCap = 'round'; x.lineWidth = fem ? 6 : 10;
  for (const s of [-1, 1]) { x.beginPath(); x.moveTo(256 + s * 30, 84 - fem * 2); x.quadraticCurveTo(256 + s * 52, 72 - fem * 6, 256 + s * 74, 82); x.stroke(); }
}
function eyesDots(x, lashes) {
  for (const s of [-1, 1]) {
    x.fillStyle = '#141414'; x.beginPath(); x.ellipse(256 + s * 50, 112, 11, 15, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(256 + s * 50 - 3, 106, 4, 0, Math.PI * 2); x.fill();
    if (lashes) { x.strokeStyle = '#141414'; x.lineWidth = 4; x.beginPath(); x.moveTo(256 + s * 61, 102); x.lineTo(256 + s * 72, 94); x.stroke(); }
  }
}
function smile(x, col) {
  x.strokeStyle = col; x.lineWidth = 7; x.lineCap = 'round';
  x.beginPath(); x.moveTo(214, 168); x.quadraticCurveTo(256, 200, 298, 168); x.stroke();
}

/** A printed face wrapped round the front of a cylindrical minifig head. */
function facePatch(draw, H) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  draw(c.getContext('2d'));
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const arc = 2.3, h = H.y1 - H.y0;
  const geo = new THREE.CylinderGeometry(H.r * 1.012, H.r * 1.012, h, 32, 1, true, -arc / 2, arc);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.05, roughness: 0.45,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  m.position.set(H.cx, (H.y0 + H.y1) / 2, H.cz);
  return m;
}

/** Ghost Rider's burning skull: layered cones of flame that lick upward and flicker. */
function skullFlames(H) {
  const g = new THREE.Group();
  const cols = [0xe0300a, 0xff7a10, 0xffc93a];   // outer red, orange, yellow core
  const tongues = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, layer = i % 3;
    const mat = new THREE.MeshBasicMaterial({ color: cols[layer], transparent: true, opacity: 0.92 - layer * 0.1, depthWrite: false, side: THREE.DoubleSide });
    const f = new THREE.Mesh(new THREE.ConeGeometry(H.r * (0.42 - layer * 0.08), H.r * (1.5 + layer * 0.3), 6, 1, true), mat);
    const rr = H.r * (0.75 - layer * 0.2);
    f.position.set(H.cx + Math.sin(a) * rr, H.y1 + H.r * 0.45, H.cz + Math.cos(a) * rr * 0.9 - H.r * 0.12);
    f.userData = { a, base: f.position.y, ph: Math.random() * 6 };
    g.add(f); tongues.push(f);
  }
  const glow = new THREE.PointLight(0xff7a1a, 1.4, 4);
  glow.position.set(H.cx, H.y1 + H.r, H.cz);
  g.add(glow);
  g.userData.tick = t => {
    for (const f of tongues) {
      const k = 0.75 + 0.35 * Math.sin(t * 13 + f.userData.ph) + 0.15 * Math.sin(t * 29 + f.userData.ph * 2);
      f.scale.set(1, k, 1);
      f.position.y = f.userData.base + (k - 1) * H.r * 0.7;
      f.rotation.z = Math.sin(t * 7 + f.userData.ph) * 0.18;
    }
    glow.intensity = 1.1 + Math.sin(t * 17) * 0.3;
  };
  return g;
}
