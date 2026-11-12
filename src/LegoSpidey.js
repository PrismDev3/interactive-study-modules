/**
 * LegoSpidey.js — ripped LEGO Spider-Man minifig, cut into minifig parts and animated.
 * Source OBJ has three objects: Head, Body_upper (torso + both arms), Body_lower (both legs).
 * Model space: feet at y=0, facing +z, ~1.9 units tall.
 */
import * as THREE from 'three';
import { polishMesh, polishObject } from './PlasticFX.js?v=2';
import { GlbMinifig, hasGlb } from './GlbMinifig.js?v=147';
const SKIN_TO_GLB = { greengoblin: 'greengoblin', venom: 'venombigfig', sandman: 'sandman', loki: 'loki', magneto: 'magneto', ironman: 'ironman',
  captainamerica: 'captainamerica', thor: 'thor', wolverine: 'wolverine', storm: 'storm', blackwidow: 'blackwidow', hawkeye: 'hawkeye',
  cyclops: 'cyclops', beast: 'beast', deadpool: 'deadpool', silversurfer: 'silversurfer', humantorch: 'humantorch', mrfantastic: 'mrfantastic',
  stanlee: 'stanlee', hydrasoldier: 'goon_hydrasoldier' };
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { variantTextures } from './Variants.js?v=67';
import { animateGear, ironArms } from './Gear.js?v=65';
import { animateKit } from './CharacterGear.js?v=64';
import { buildSpideyGLB } from './SpideyGLB.js?v=52';
import { loadClipBank, ClipPlayer } from './BigfigAnim.js?v=23';

const DIR = 'assets/models/spidey/';
const damp = (cur, target, k) => cur + (target - cur) * k;

// Copy the triangles of a non-indexed geometry that pass `keep(centroid)`.
function pickTris(geo, keep) {
  const pos = geo.attributes.position;
  const names = Object.keys(geo.attributes);
  const out = Object.fromEntries(names.map(n => [n, []]));
  const c = new THREE.Vector3();
  for (let t = 0; t < pos.count; t += 3) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) c.add(new THREE.Vector3().fromBufferAttribute(pos, t + k));
    c.multiplyScalar(1 / 3);
    if (!keep(c)) continue;
    for (const n of names) {
      const a = geo.attributes[n];
      for (let k = 0; k < 3; k++) for (let i = 0; i < a.itemSize; i++) out[n].push(a.array[(t + k) * a.itemSize + i]);
    }
  }
  const g = new THREE.BufferGeometry();
  for (const n of names) g.setAttribute(n, new THREE.Float32BufferAttribute(out[n], geo.attributes[n].itemSize));
  return g;
}

// Cut every triangle of a non-indexed geometry that crosses the plane y = y0 (keeps all attributes),
// so a bend there has vertices to work with.
function splitAtY(geo, y0) {
  const names = Object.keys(geo.attributes), pos = geo.attributes.position;
  const out = Object.fromEntries(names.map(n => [n, []]));
  const vert = (t, k) => Object.fromEntries(names.map(n => {
    const a = geo.attributes[n];
    return [n, Array.from(a.array.slice((t + k) * a.itemSize, (t + k + 1) * a.itemSize))];
  }));
  const lerp = (A, B, f) => Object.fromEntries(names.map(n => [n, A[n].map((v, i) => v + (B[n][i] - v) * f)]));
  const emit = (...vs) => { for (const v of vs) for (const n of names) out[n].push(...v[n]); };
  for (let t = 0; t < pos.count; t += 3) {
    const V = [0, 1, 2].map(k => vert(t, k)), side = V.map(v => v.position[1] >= y0);
    const ups = side.filter(Boolean).length;
    if (ups === 0 || ups === 3) { emit(...V); continue; }
    // the lone vertex on one side, keeping winding order
    const lone = side.findIndex(x => (ups === 1 ? x : !x));
    const a = V[lone], b = V[(lone + 1) % 3], c = V[(lone + 2) % 3];
    const fab = (y0 - a.position[1]) / (b.position[1] - a.position[1]);
    const fac = (y0 - a.position[1]) / (c.position[1] - a.position[1]);
    const ab = lerp(a, b, fab), ac = lerp(a, c, fac);
    emit(a, ab, ac, ab, b, c, ab, c, ac);
  }
  const g = new THREE.BufferGeometry();
  for (const n of names) g.setAttribute(n, new THREE.Float32BufferAttribute(out[n], geo.attributes[n].itemSize));
  return g;
}

// Put `geo` under a pivot Group at `pivot` so rotating the group bends at that joint.
function jointed(parent, geo, mat, pivot) {
  const j = new THREE.Group();
  j.position.copy(pivot);
  geo.translate(-pivot.x, -pivot.y, -pivot.z);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  polishMesh(m);
  j.add(m);
  parent.add(j);
  return j;
}

function topCenter(geo, band = 0.15) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const pos = geo.attributes.position;
  const v = new THREE.Vector3(), sum = new THREE.Vector3();
  let n = 0;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (v.y > max.y - band) { sum.add(v); n++; }
  }
  sum.multiplyScalar(1 / Math.max(n, 1));
  return { top: max.y, min, max, cx: sum.x, cz: sum.z };
}

let objPromise = null;
let npcFace = null;

// Classic yellow minifig face drawn where the ripped head texture puts the eyes
function faceTexture() {
  if (npcFace) return npcFace;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f7d117';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#1b1b1b';
  for (const x of [43, 85]) { g.beginPath(); g.ellipse(x, 88, 5, 7, 0, 0, Math.PI * 2); g.fill(); }
  g.lineWidth = 4; g.strokeStyle = '#1b1b1b'; g.lineCap = 'round';
  g.beginPath(); g.arc(64, 98, 16, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
  npcFace = new THREE.CanvasTexture(c);
  npcFace.colorSpace = THREE.SRGBColorSpace;
  npcFace.userData.shared = true;
  npcFace.magFilter = THREE.NearestFilter;
  return npcFace;
}

/*
 * Dance choreography. Each dance is a loop of key poses spread evenly over `len` seconds and
 * blended smoothly (or held, for the robot). Pose fields (all optional, default 0):
 *   aLx aRx lLx lRx  arm/leg swing  (negative = forward / up)
 *   aLz aRz lLz lRz  arm/leg raise out to the side (positive = outward, negative = across the body)
 *   y bounce, x hip shift (+ = to the figure's left), lean, roll (side tilt), twist, hx/hy head nod/turn
 */
const DANCES = {
  floss: { len: 0.6, frames: [
    // Both straight arms sweep to one side of the hips (one in front, one behind) as the hips swing the other way
    { aLx: -0.55, aRx: 0.55, aLz: -0.95, aRz: 0.95, x: 0.11, roll: 0.14, twist: -0.18 },
    { aLx: 0.55, aRx: -0.55, aLz: 0.95, aRz: -0.95, x: -0.11, roll: -0.14, twist: 0.18 },
  ] },
  griddy: { len: 2.4, frames: [
    // Heel taps: one straight leg kicks forward onto the heel while the other knee bends low,
    // arms pumping big and opposite — then the same taps with the hands up as "goggles"
    { lLx: -0.95, kL: 0, lRx: -0.35, kR: 0.6, aLx: 0.9, aRx: -1.5, aRz: -0.25, lean: 0.28, y: -0.07, hx: -0.15 },
    { lLx: -0.2, kL: 0.5, lRx: -0.2, kR: 0.5, aLx: 0.1, aRx: -0.3, lean: 0.22, y: -0.02 },
    { lRx: -0.95, kR: 0, lLx: -0.35, kL: 0.6, aRx: 0.9, aLx: -1.5, aLz: -0.25, lean: 0.28, y: -0.07, hx: -0.15 },
    { lLx: -0.2, kL: 0.5, lRx: -0.2, kR: 0.5, aLx: -0.3, aRx: 0.1, lean: 0.22, y: -0.02 },
    { lLx: -0.95, kL: 0, lRx: -0.35, kR: 0.6, aLx: -2.3, aRx: -2.3, aLz: -0.42, aRz: -0.42, lean: 0.12, y: -0.07, hx: -0.25 },
    { lLx: -0.2, kL: 0.5, lRx: -0.2, kR: 0.5, aLx: -2.3, aRx: -2.3, aLz: -0.42, aRz: -0.42, lean: 0.1, y: -0.02, hx: -0.25 },
    { lRx: -0.95, kR: 0, lLx: -0.35, kL: 0.6, aLx: -2.3, aRx: -2.3, aLz: -0.42, aRz: -0.42, lean: 0.12, y: -0.07, hx: -0.25 },
    { lLx: -0.2, kL: 0.5, lRx: -0.2, kR: 0.5, aLx: -2.3, aRx: -2.3, aLz: -0.42, aRz: -0.42, lean: 0.1, y: -0.02, hx: -0.25 },
  ] },
  orange: { len: 1.2, frames: [
    // Low bent-knee bounce; both arms scoop down to one side while that leg swings out
    // with its knee bent, then rock through the middle to the other side
    { aLx: -0.45, aRx: -0.3, aLz: -0.9, aRz: 0.7, lRz: 0.55, lRx: -0.5, kR: 0.8, lLx: -0.35, kL: 0.7, x: 0.09, roll: 0.12, twist: -0.25, lean: 0.1, y: -0.1 },
    { aLx: 0.35, aRx: 0.35, lLx: -0.3, lRx: -0.3, kL: 0.5, kR: 0.5, lean: 0.18, y: -0.06 },
    { aLx: -0.3, aRx: -0.45, aLz: 0.7, aRz: -0.9, lLz: 0.55, lLx: -0.5, kL: 0.8, lRx: -0.35, kR: 0.7, x: -0.09, roll: -0.12, twist: 0.25, lean: 0.1, y: -0.1 },
    { aLx: 0.35, aRx: 0.35, lLx: -0.3, lRx: -0.3, kL: 0.5, kR: 0.5, lean: 0.18, y: -0.06 },
  ] },
  takel: { len: 1.0, frames: [
    // Right hand flat on the forehead making the L, left arm out, legs scissor-kicking
    { aRx: -2.45, aRz: -0.42, aLx: -0.35, aLz: 0.6, lLx: -1.05, lRx: 0.2, twist: 0.3, hx: -0.1, y: 0.08 },
    { aRx: -2.45, aRz: -0.42, aLx: -0.25, aLz: 0.5, twist: 0.1, hx: -0.1 },
    { aRx: -2.45, aRz: -0.42, aLx: -0.35, aLz: 0.6, lLx: 0.45, lRx: -0.25, twist: -0.15, hx: -0.1, y: 0.08 },
    { aRx: -2.45, aRz: -0.42, aLx: -0.25, aLz: 0.5, twist: 0.1, hx: -0.1 },
  ] },
  default: { len: 3.2, frames: [
    // Part 1: hands held in front of the chest swaying side to side, stepping out
    { aLx: -1.25, aRx: -1.25, aLz: -0.45, aRz: 0.45, lRz: 0.35, x: 0.07, twist: -0.15, y: 0.05 },
    { aLx: -1.25, aRx: -1.25, aLz: 0.45, aRz: -0.45, lLz: 0.35, x: -0.07, twist: 0.15, y: 0.05 },
    { aLx: -1.25, aRx: -1.25, aLz: -0.45, aRz: 0.45, lRz: 0.35, x: 0.07, twist: -0.15, y: 0.05 },
    { aLx: -1.25, aRx: -1.25, aLz: 0.45, aRz: -0.45, lLz: 0.35, x: -0.07, twist: 0.15, y: 0.05 },
    // Part 2: alternating punches straight up with a knee-bounce
    { aRx: -3.0, aLx: -0.6, aLz: 0.2, y: 0.1, hy: -0.2 },
    { aLx: -3.0, aRx: -0.6, aRz: 0.2, y: -0.04, hy: 0.2 },
    { aRx: -3.0, aLx: -0.6, aLz: 0.2, y: 0.1, hy: -0.2 },
    { aLx: -3.0, aRx: -0.6, aRz: 0.2, y: -0.04, hy: 0.2 },
  ] },
  dab: { len: 2.4, frames: [
    // Snap into the dab: right arm across in front of the face, head ducked into the elbow,
    // left arm straight up and out the other way — hold it, then reset
    {},
    { aRx: -1.72, aRz: -0.28, aLx: -2.5, aLz: 1.2, hx: 0.5, hy: -0.75, lean: 0.2, roll: -0.12, twist: 0.35, kL: 0.25, kR: 0.25, lLx: -0.12, lRx: -0.12, y: -0.03 },
    { aRx: -1.72, aRz: -0.28, aLx: -2.5, aLz: 1.2, hx: 0.5, hy: -0.75, lean: 0.2, roll: -0.12, twist: 0.35, kL: 0.25, kR: 0.25, lLx: -0.12, lRx: -0.12, y: -0.03 },
    { aRx: -1.72, aRz: -0.28, aLx: -2.5, aLz: 1.2, hx: 0.5, hy: -0.75, lean: 0.2, roll: -0.12, twist: 0.35, kL: 0.25, kR: 0.25, lLx: -0.12, lRx: -0.12, y: -0.03 },
    { aRx: -1.72, aRz: -0.28, aLx: -2.5, aLz: 1.2, hx: 0.5, hy: -0.75, lean: 0.2, roll: -0.12, twist: 0.35, kL: 0.25, kR: 0.25, lLx: -0.12, lRx: -0.12, y: -0.03 },
  ] },
  hype: { len: 0.8, frames: [
    { aLx: -2.9, aRx: -1.9, aLz: 0.35, lLx: -0.35, y: 0.32, hx: -0.25 },
    { aLx: -1.9, aRx: -2.9, aRz: 0.35, lRx: -0.35, y: 0.02, hx: -0.25 },
  ] },
  robot: { len: 2.0, step: true, frames: [
    { aLx: -1.57, aRx: 0, twist: 0.45, hy: -0.5 },
    { aLx: -1.57, aRx: -1.57, aRz: 0.4, twist: 0 },
    { aLx: 0, aRx: -1.57, aLz: 0.4, twist: -0.45, hy: 0.5 },
    { aLx: -2.6, aRx: -2.6, aLz: 0.2, aRz: 0.2, twist: 0, y: 0.05 },
  ] },
};
/** Emotes played with LEGO Marvel's own decoded hub dance clips (assets/anims/dances.json). */
export const DANCE_CLIPS = {
  dance: 'parker', wiggle: 'wiggle', patriot: 'patriot', dancewalk: 'hubwalk',
  breakdance: 'breakdance', windmill: 'breakdance2', cheer: 'cheer',
};
const POSE_KEYS = ['kL', 'kR', 'aLx', 'aRx', 'lLx', 'lRx', 'aLz', 'aRz', 'lLz', 'lRz', 'y', 'x', 'lean', 'roll', 'twist', 'hx', 'hy'];

/** Pose for dance `d` at time `t`, blended between neighbouring key poses. */
function dancePose(d, t) {
  const n = d.frames.length, f = ((((t / d.len) % 1) + 1) % 1) * n;
  const i = Math.floor(f), a = d.frames[i], b = d.frames[(i + 1) % n];
  let u = d.step ? 0 : f - i;
  u = u * u * (3 - 2 * u); // ease in/out
  const out = {};
  for (const k of POSE_KEYS) out[k] = (a[k] ?? 0) + ((b[k] ?? 0) - (a[k] ?? 0)) * u;
  return out;
}

export class LegoSpidey {
  /**
   * @param {{torso?:number, legs?:number, skin?:string, legsColor?:number}} [npc]
   *   civilian colours, or `skin` = a decoded character in assets/models/chars (e.g. 'loki')
   */
  constructor(npc = null) {
    this.npc = npc;
  }

  async load() {
    // Characters with an extracted rigged model use it (summons, villains, story cameos)
    let skin = this.npc?.skin;
    const glb = this.npc?.glb ?? (skin && !this.npc?.lego ? SKIN_TO_GLB[skin] ?? (skin.startsWith('glb:') ? skin.slice(4) : null) : null);
    if (glb && hasGlb(glb)) {
      try { return await new GlbMinifig(glb).load(); } catch (e) { console.warn('[LegoSpidey] GLB minifig failed, using the classic rig:', glb, e.message); }
    }
    // Unknown GLB portraits used to be treated as texture file names ("glb:uncleben_head.png").
    // Fall back to a colored, animated minifig instead of failing the whole cutscene actor.
    if (skin?.startsWith('glb:')) skin = null;
    const texLoader = new THREE.TextureLoader();
    const tex = name => {
      const t = texLoader.load(DIR + name);
      t.colorSpace = THREE.SRGBColorSpace;
      t.magFilter = THREE.NearestFilter; // keep the DS pixel art crisp
      t.minFilter = THREE.NearestMipmapLinearFilter;
      return t;
    };
    const plastic = map => new THREE.MeshStandardMaterial({ map, roughness: 0.32, metalness: 0 });
    // The extracted game model carries its own baked 256px prints. Mount its parts on the
    // existing animation pivots and skip the old OBJ/texture path entirely.
    if (!skin && (!this.npc || this.npc.variant)) {
      try {
        const built = await buildSpideyGLB(this.npc?.variant ?? 'classic');
        if (built) {
          this._installGLB(built);
          polishObject(this.root);
          return this;
        }
      } catch (err) {
        console.warn('[LegoSpidey] extracted model unavailable, using legacy mesh:', err?.message ?? err);
      }
    }
    // Spider-Man suits (classic included) wait for their textures, so portraits never render black
    const suit = !skin && (!this.npc || this.npc.variant) ? await variantTextures(this.npc?.variant ?? 'classic') : null;
    // Character skins wait for their textures, so they never pop in black
    const loadSkin = async part => {
      const t = await texLoader.loadAsync(DIR + `../chars/${skin}_${part}.png`);
      t.colorSpace = THREE.SRGBColorSpace;
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestMipmapLinearFilter;
      return t;
    };
    const skinTex = skin ? await Promise.all(['head', 'upper', this.npc.legsColor != null ? null : 'lower'].map(p => p && loadSkin(p))) : null;
    const mats = skin ? {
      Head: plastic(skinTex[0]),
      Body_upper: plastic(skinTex[1]),
      Body_lower: this.npc.legsColor != null
        ? new THREE.MeshStandardMaterial({ color: this.npc.legsColor, roughness: 0.32 })
        : plastic(skinTex[2]),
    } : suit ? {
      Head: plastic(suit.head),
      Body_upper: plastic(suit.upper),
      Body_lower: plastic(suit.lower),
    } : this.npc ? {
      Head: plastic(this.npc.headTexture ?? faceTexture()),
      Body_upper: new THREE.MeshStandardMaterial({ color: this.npc.torso, roughness: 0.32 }),
      Body_lower: new THREE.MeshStandardMaterial({ color: this.npc.legs, roughness: 0.32 }),
    } : {
      Head: plastic(tex('spidey_v3_head.png')),
      Body_upper: plastic(tex('spidey_v3_upper.png')),
      Body_lower: plastic(tex('spidey_v3_lower.png')),
    };

    objPromise ??= new OBJLoader().loadAsync(DIR + 'SpiderMan.obj');
    const obj = await objPromise;
    const src = {};
    obj.traverse(n => { if (n.isMesh) src[n.name] = n.geometry; });
    if (!src.Head || !src.Body_upper || !src.Body_lower) throw new Error('SpiderMan.obj missing parts');

    this.root = new THREE.Group();
    this.root.position.y = -0.5; // controller origin sits 0.5 m above the ground
    this.body = new THREE.Group(); // whole-figure bob / lean
    // Flip pivot at the figure's middle, so tricks rotate around the waist and not the feet
    this.spin = new THREE.Group();
    this.spin.position.y = 1.0;
    const inner = new THREE.Group();
    inner.position.y = -1.0;
    this.spin.add(inner);
    inner.add(this.body);
    this.root.add(this.spin);

    // Legs: split down the middle; triangles straddling x=0 stay on the hips
    const lower = src.Body_lower;
    const ARM_X = 0.37;
    const hips = pickTris(lower, c => Math.abs(c.x) < 0.02);
    const hipMesh = new THREE.Mesh(hips, mats.Body_lower);
    hipMesh.castShadow = true;
    this.body.add(hipMesh);
    this.leg = {};
    // Knees are a soft bend in one mesh (no gap): the leg is cut into thin bands around the knee
    // and the shin's vertices rotate back by a weight that fades through the band.
    this.knee = {};
    this.kneeAngle = { [-1]: 0, [1]: 0 };
    this.kneeGeo = {};
    const KNEE_Y = 0.27;
    for (const s of [-1, 1]) {
      let g = pickTris(lower, c => c.x * s >= 0.02);
      const tc = topCenter(g, 0.2);
      for (const y of [KNEE_Y - 0.05, KNEE_Y - 0.017, KNEE_Y + 0.017, KNEE_Y + 0.05]) g = splitAtY(g, y);
      g.computeBoundingBox();
      const hip = new THREE.Vector3(0, tc.top - 0.18, tc.cz);
      const kz = (g.boundingBox.min.z + g.boundingBox.max.z) / 2;
      this.leg[s] = jointed(this.body, g, mats.Body_lower, hip);
      this.kneeGeo[s] = { geo: g, pos: g.attributes.position.array.slice(), nrm: g.attributes.normal?.array.slice(), ky: KNEE_Y - hip.y, kz: kz - hip.z };
      this.knee[s] = { rotation: { x: 0 } };   // pose target holder; applied by _bendKnee
    }

    // Torso + arms
    const upper = src.Body_upper;
    this.torso = new THREE.Group();
    this.body.add(this.torso);
    const torsoMesh = new THREE.Mesh(pickTris(upper, c => Math.abs(c.x) < ARM_X), mats.Body_upper);
    torsoMesh.castShadow = true;
    this.torso.add(torsoMesh);
    this.arm = {};
    for (const s of [-1, 1]) {
      const g = pickTris(upper, c => c.x * s >= ARM_X);
      const tc = topCenter(g, 0.12);
      this.arm[s] = jointed(this.torso, g, mats.Body_upper, new THREE.Vector3(s * (ARM_X + 0.03), tc.top - 0.1, tc.cz));
    }

    // Head turns at the neck
    const htc = topCenter(src.Head);
    const headGeo = src.Head.clone();
    headGeo.computeVertexNormals(); // ripped head normals render half the face black
    this.head = jointed(this.torso, headGeo, mats.Head, new THREE.Vector3(0, htc.min.y, 0));

    // Iron Spider always wears its gold mechanical legs
    if (this.npc?.variant?.split('|')[0] === 'iron') {
      const w = ironArms();
      this.torso.add(w);
      this.waldo = w.userData.waldo;
      this.waldoGroup = w;
    }

    this.meshes = [];
    // Double-sided: the limbs are cut apart at the joints, so a hard rotation can otherwise
    // reveal the hollow inside of the torso/legs and the piece looks like it went missing.
    this.root.traverse(n => { if (n.isMesh) { n.material = n.material.clone(); n.material.side = THREE.DoubleSide; this.meshes.push(n); } });
    this.t = 0;
    this.phase = 0;
    this.climbPhase = 0;
    this.wallTilt = 0;   // whole-figure roll while running along a wall
    polishObject(this.root);
    return this;
  }

  /** The game's own minifig animations (decoded from LEGO Marvel's AN4 packs), loaded in the background. */
  _initClips() {
    Promise.all([loadClipBank('minifig'), loadClipBank('dances')]).then(([b, d]) => {
      if (!b) return;
      if (d && d.joints.join() === b.joints.join()) b = { ...b, clips: { ...b.clips, ...d.clips } };
      this.mini = new ClipPlayer(b);
      this._mIdx = n => b.joints.indexOf(n);
      this._mw = 0;
      this._mq = Array.from({ length: 12 }, () => new THREE.Quaternion());
    });
  }

  /**
   * Blend a decoded clip over the procedural pose. Each part takes its joint's model-space delta
   * relative to its parent part (game frame = GLB frame turned 180 deg about Y: (x, y, z, w) ->
   * (-x, y, -z, w)). States without a fitting clip (swings, tricks, emotes, attacks, wall runs,
   * landings) stay procedural; the weight fades between the two.
   */
  _applyMini(s, dt) {
    const M = this.mini, sp = s.speed ?? 0;
    let mode = null, speed = 1;
    const danceClip = s.emote && s.grounded !== false && !s.swinging && !s.climbing ? DANCE_CLIPS[s.emote] : null;
    if (danceClip && M.has(danceClip)) { mode = danceClip; this._dancing = true; }
    else if (!LegoSpidey.USE_DECODED_CLIPS) { this._dancing = false; }   // only fading out of a dance
    else if (!(s.emote || s.trick || s.wallRun || s.flight || (s.attack ?? 0) > 0 || s.slam || (s.hurt ?? 0) > 0 || s.land || s.swinging)) {
      if (s.climbing) { mode = s.climbMove ? 'climb' : 'climbidle'; speed = 1.15; }
      else if (s.grounded === false) {
        if (!this._fallStyle || this._fallStyle === 'flail') mode = (s.vy ?? 0) > 1.5 && M.cur?.name !== 'fall' ? 'jump' : 'fall';
      } else if (sp > 0.4) {
        mode = sp < 5 ? 'walk' : 'run';
        speed = Math.max(0.7, Math.min(1.7, sp / (mode === 'walk' ? 3.5 : 11)));
      } else {
        this._idleT = (this._idleT ?? 0) + dt;
        mode = M.cur?.name === 'idle2' || M.cur?.name === 'idle3' ? (M.remaining() > 0.05 ? M.cur.name : 'idle') : 'idle';
        if (this._idleT > 10 && M.cur?.name === 'idle') { this._idleT = 0; mode = Math.random() < 0.5 ? 'idle2' : 'idle3'; }
      }
      if (mode !== 'idle' && mode !== 'idle2' && mode !== 'idle3') this._idleT = 0;
    }
    if (mode) M.play(mode, { fade: mode === 'jump' ? 0.1 : 0.22, speed, loop: this._dancing ? true : mode === 'jump' || mode === 'idle2' || mode === 'idle3' ? false : undefined });
    this._mw = THREE.MathUtils.lerp(this._mw, mode ? 1 : 0, 1 - Math.exp(-(mode ? 10 : 12) * dt));
    const w = this._mw, T = this._mq;
    if (w < 0.002) { if (this._mwOn) { this.torso.quaternion.identity(); this._mwOn = false; } return; }
    this._mwOn = true;
    M.update(dt);
    const g = (name, q) => { const o = M.out[this._mIdx(name)]; return q.set(-o.x, o.y, -o.z, o.w); };
    // A LEGO minifig only moves at the shoulders, hips, neck (and our soft knees): the torso is one
    // piece with the hips, and the torso/body groups pivot at the feet, so they are never rotated by
    // the clip. Each limb only takes the DIRECTION its joint points in, relative to the chest / hips,
    // with no twist; legs swing fore-aft only, the head turns and nods.
    const hipsI = T[2].copy(g('Hips', T[0])).invert(), chestI = T[3].copy(g('Spine2', T[1])).invert();
    const v = this._mv ??= new THREE.Vector3(), DOWN = this._mDown ??= new THREE.Vector3(0, -1, 0);
    // Dances keep the hips' turn and sway (the whole figure pivots with them); locomotion stays upright
    if (this._dancing) this.body.quaternion.slerp(g('Hips', T[9]), w);
    else this.body.quaternion.slerp(T[9].identity(), w);
    this.torso.quaternion.identity();
    v.set(0, 0, 1).applyQuaternion(T[4].copy(chestI).multiply(g('Head', T[5])));
    const yaw = Math.max(-0.9, Math.min(0.9, Math.atan2(v.x, v.z))), nod = Math.max(-0.5, Math.min(0.5, Math.asin(Math.max(-1, Math.min(1, -v.y)))));
    const AX = this._mX ??= new THREE.Vector3(1, 0, 0), AY = this._mY ??= new THREE.Vector3(0, 1, 0);
    this.head.quaternion.slerp(T[6].setFromAxisAngle(AY, yaw).multiply(T[7].setFromAxisAngle(AX, nod)), w);
    for (const sd of [-1, 1]) {
      const L = sd > 0 ? 'Left' : 'Right';
      v.copy(DOWN).applyQuaternion(T[4].copy(chestI).multiply(g(L + 'Arm', T[5]))).normalize();
      this.arm[sd].quaternion.slerp(T[6].setFromUnitVectors(DOWN, v), w);
      const up = g(L + 'UpLeg', T[5]);
      v.copy(DOWN).applyQuaternion(T[4].copy(hipsI).multiply(up));
      const swing = Math.atan2(-v.z, -v.y);                       // + = leg swung back, - = forward
      this.leg[sd].quaternion.slerp(T[6].setFromAxisAngle(AX, Math.max(-1.8, Math.min(1.0, swing))), w);
      const kq = T[7].copy(up).invert().multiply(g(L + 'Leg', T[8]));
      const knee = Math.max(0, Math.min(2.2, 2 * Math.atan2(kq.x, kq.w)));
      this._bendKnee(sd, this.kneeAngle[sd] + (knee - this.kneeAngle[sd]) * w);
    }
    // Only a small vertical bob from the clip's hips (crouches, run bounce); never sideways or into the ground
    if (this._dancing) {
      // Dances (breakdance, floor spins) turn the whole figure: pivot at the hips, not the feet, and
      // follow the clip's full hip travel (game frame = GLB turned 180 deg: x, z flip).
      const HIP = 0.55, hp = this._mHip ??= new THREE.Vector3();
      hp.set(0, HIP, 0).applyQuaternion(this.body.quaternion);
      const tx = -M.hips.x * 5.1, ty = Math.max(-0.5, M.hips.y * 5.1) + HIP - hp.y, tz = -M.hips.z * 5.1 - hp.z;
      this.body.position.x += (tx - hp.x - this.body.position.x) * w;
      this.body.position.y += (ty - this.body.position.y) * w;
      this.body.position.z += (tz - this.body.position.z) * w;
      // Keep the figure on the floor: the clip's hips dip further than this rigid figure's straight
      // legs allow, so lift it until its lowest point is back at the resting foot level.
      const box = this._mBox ??= new THREE.Box3(), rp = this._mRoot ??= new THREE.Vector3();
      this.root.updateMatrixWorld(true);
      this.root.getWorldPosition(rp);
      const low = box.setFromObject(this.body).min.y - rp.y;
      if (this._restLow === undefined) { if (w < 0.25) this._restLow = low; }   // first dance frame is still ~rest pose
      else if (low < this._restLow) this.body.position.y += (this._restLow - low) / (this.root.getWorldScale(rp).y || 1);
      return;
    }
    const bob = s.climbing ? 0 : Math.max(-0.25, Math.min(0.15, M.hips.y * 5.1));
    this.body.position.x += (0 - this.body.position.x) * w;
    this.body.position.y += (bob - this.body.position.y) * w;
    this.body.position.z += (0 - this.body.position.z) * w;   // undo a dance's forward/back travel
  }

  /** Install the extracted GLB rig on the same pivots as the old procedural minifig. */
  _installGLB(built) {
    this.root = built.root;
    this.spin = built.spin;
    this.body = built.body;
    this.torso = built.torso;
    this.head = built.head;
    this.arm = built.arm;
    this.leg = built.leg;
    this.meshes = built.meshes;
    this.handLocal = built.handLocal ?? null;
    this.kneeGeo = built.kneeGeo ?? {};
    this.kneeAngle = { [-1]: 0, [1]: 0 };
    this.gear = [];
    this.t = 0;
    this.phase = 0;
    this.climbPhase = 0;
    this.wallTilt = 0;
    this._initClips();   // decoded clips: real dance emotes (locomotion stays procedural)
    if (this.npc?.variant?.split('|')[0] === 'iron') {
      const w = ironArms();
      this.torso.add(w);
      this.waldo = w.userData.waldo;
      this.waldoGroup = w;
    }
  }

  /** Brief white flash when hit. */
  flash(amount) {
    for (const m of this.meshes) {
      m.material.emissive.setRGB(amount, amount, amount);
    }
  }

  /** Same state contract as HeroRig.update. */
  update(dt, s) {
    this.t += dt;
    let k = 1 - Math.exp(-16 * dt);
    // Minifigs only rotate at shoulders, hips and neck. Negative x = swing forward / up.
    const P = { bodyY: 0, bodyX: 0, lean: 0, headY: 0, headX: 0, arm: { [-1]: 0, [1]: 0 }, leg: { [-1]: 0, [1]: 0 },
      armZ: { [-1]: 0, [1]: 0 }, legZ: { [-1]: 0, [1]: 0 }, knee: { [-1]: 0, [1]: 0 } };

    // A new swing / a new fall picks a fresh style, so consecutive swings never look the same
    if (s.swinging && !this._wasSwinging) {
      const styles = s.twoHandGrip === true ? ['twohand'] : s.twoHandGrip === false
        ? ['classic', 'tuck', 'spread', 'kick']
        : ['classic', 'tuck', 'twohand', 'spread', 'kick'];
      let pick = styles[Math.floor(Math.random() * styles.length)];
      if (styles.length > 1) while (pick === this._swingStyle) pick = styles[Math.floor(Math.random() * styles.length)];
      this._swingStyle = pick;
      this._swingT = 0;
    }
    this._wasSwinging = !!s.swinging;
    if (s.fallStyle !== this._fallStyle) { this._fallStyle = s.fallStyle; this._airT = 0; }

    if (s.swinging) {
      const speed = s.speed ?? 0, vy = s.vy ?? 0, w = s.webArm ?? -1, f = -w;
      this._swingT += dt;
      // Arc position: -1 dropping into the swing, +1 rising out of it (smoothed so limbs flow)
      this._arc = damp(this._arc ?? 0, Math.max(-1, Math.min(1, vy / 10)), 1 - Math.exp(-5 * dt));
      const a = this._arc, up = Math.max(0, a), down = Math.max(0, -a);
      const fast = Math.min(speed / 30, 1);
      const sway = Math.sin(this.t * 2.3) * 0.12, sway2 = Math.sin(this.t * 3.1 + 1) * 0.1;
      // Web arm reaches up the line; for the first moment it shoots out ahead (the web connecting)
      const reach = Math.min(1, this._swingT / 0.22);
      // Keep the web wrist forward of the face instead of stacking it over the head.
      P.arm[w] = -1.65 - reach * 0.7;
      P.armZ[w] = -w * 0.18 * reach;
      P.headX = -0.25 + up * 0.15;
      P.headY = f * 0.2 * a;
      switch (this._swingStyle) {
        case 'tuck':          // cannonball through the bottom, opening up on the way out
          P.arm[f] = -1.1 + sway; P.armZ[f] = f * -0.35;
          P.leg[-1] = P.leg[1] = -1.25 + up * 0.5;
          P.knee[-1] = P.knee[1] = 1.5 - up * 0.9;
          P.lean = 0.25 - up * 0.5;
          break;
        case 'twohand':       // hands close together on the same strand, body hanging like a pendulum
          P.arm[w] = P.arm[f] = -2.35;
          P.armZ[w] = -w * 0.18; P.armZ[f] = -f * 0.18;
          P.leg[-1] = P.leg[1] = 0.25 - up * 0.95 + down * 0.25;
          P.knee[-1] = P.knee[1] = 0.25 + up * 0.35;
          P.lean = -0.15 - up * 0.3 + down * 0.25;
          P.roll = sway2 * 0.8;
          break;
        case 'spread':        // free arm and legs flung wide, scissoring
          P.arm[f] = -0.45 + sway; P.armZ[f] = f * 1.35;
          P.leg[-1] = -0.35 + Math.sin(this.t * 5) * 0.45 - up * 0.3;
          P.leg[1] = -0.35 - Math.sin(this.t * 5) * 0.45 - up * 0.3;
          P.legZ[-1] = -0.3; P.legZ[1] = 0.3;
          P.knee[-1] = 0.3 + Math.max(0, Math.sin(this.t * 5)) * 0.6;
          P.knee[1] = 0.3 + Math.max(0, -Math.sin(this.t * 5)) * 0.6;
          P.lean = -0.25 * a;
          P.twist = f * 0.2;
          break;
        case 'kick':          // legs trail on the drop, kick through hard at the bottom
          P.arm[f] = -1.4 + down * 0.6; P.armZ[f] = f * 0.6;
          P.leg[-1] = P.leg[1] = 0.45 * down - 1.45 * up;
          P.knee[-1] = P.knee[1] = 0.9 * down + 0.1 * up;
          P.lean = 0.35 * down - 0.45 * up;
          P.roll = sway * 0.6;
          break;
        default: {            // classic: free arm out for balance, legs running through the air
          const pump = Math.sin(this.t * (4 + fast * 7));
          P.arm[f] = -0.9 + pump * 0.45; P.armZ[f] = f * 0.55;
          P.leg[-1] = -0.45 - up * 0.65 + pump * 0.4;
          P.leg[1] = -0.2 - up * 0.65 - pump * 0.4;
          P.knee[-1] = 0.35 + Math.max(0, pump) * 0.7;
          P.knee[1] = 0.35 + Math.max(0, -pump) * 0.7;
          P.lean = Math.max(-0.55, Math.min(0.5, -vy * 0.035)) - 0.1;
        }
      }
      P.lean += sway2 * 0.3;
    } else if (s.wallRun) {
      // Wall run: the figure is rolled onto the facade (see wallTilt below), feet driving
      // along the wall, so the legs pump in the wall plane and one arm reaches ahead.
      const run = Math.min((s.speed ?? 12) / 20, 1);
      this.phase += dt * (8.5 + run * 5.5);
      const p = this.phase, sw = Math.sin(p), lift = Math.abs(Math.cos(p));
      // Stride: the driving leg reaches forward along the wall, the other trails and folds
      P.leg[-1] = sw * 0.82;
      P.leg[1]  = -sw * 0.82;
      P.knee[-1] = Math.max(0, -sw) * 1.05;
      P.knee[1]  = Math.max(0,  sw) * 1.05;
      // Arms pump along the wall: one reaches ahead, the other drives back past the hip
      P.arm[-1] = -1.55 - sw * 0.75;
      P.arm[1]  = -1.55 + sw * 0.75;
      P.armZ[-1] = 0.22; P.armZ[1] = -0.22;
      P.lean = 0.5;                    // chest driven into the run
      P.headX = -0.28 - run * 0.12;    // eyes on the wall ahead
      P.headY = 0.35;
      P.bodyY = lift * 0.05;           // bounce off each stride
    } else if (s.climbing) {
      this.climbPhase += dt * 8 * s.climbMove;
      const c = Math.sin(this.climbPhase);
      // Reach toward the wall rather than straight overhead, so the arms stay clear of the head
      P.arm[-1] = -1.75 + c * 0.6; P.arm[1] = -1.75 - c * 0.6;
      P.leg[-1] = -0.45 - c * 0.45; P.leg[1] = -0.45 + c * 0.45;
      P.lean = 0.1; P.headX = -0.3;
    } else if (s.flight) {
      // Superhero flight: pitched into the direction of travel, legs together, arms swept back
      P.arm[-1] = -0.45; P.arm[1] = -0.45;
      P.armZ[-1] = -0.55; P.armZ[1] = 0.55;
      P.leg[-1] = 0.28; P.leg[1] = 0.16;
      P.lean = 0.5; P.headX = -0.4;
    } else if (!s.grounded && this._fallStyle && this._fallStyle !== 'flail') {
      // The whole figure is pitched by spin (see below); these are the limbs relative to it
      this._airT += dt;
      const g = Math.min(1, this._airT / 0.35), fl = Math.sin(this.t * 9) * 0.12, fl2 = Math.sin(this.t * 6.3 + 1) * 0.1;
      if (this._fallStyle === 'dive') {            // head-first: arms ahead, legs trailing together
        P.arm[-1] = -2.95 * g + fl2; P.arm[1] = -2.95 * g - fl2; P.armZ[-1] = 0.12; P.armZ[1] = -0.12;
        P.leg[-1] = 0.2 + fl; P.leg[1] = 0.25 - fl; P.knee[-1] = P.knee[1] = 0.1;
        P.headX = -0.6;
      } else if (this._fallStyle === 'back') {     // tipped over backwards: chest to the sky, arms flung wide
        P.arm[-1] = -0.9 + fl; P.arm[1] = -0.7 - fl; P.armZ[-1] = -1.35 * g; P.armZ[1] = 1.35 * g;
        P.leg[-1] = -0.75 + fl2; P.leg[1] = -0.35 - fl2; P.legZ[-1] = -0.15; P.legZ[1] = 0.15;
        P.knee[-1] = 0.75; P.knee[1] = 0.4;
        P.headX = 0.6; P.headY = Math.sin(this.t * 1.7) * 0.25;
      } else {                                     // skydive: belly down, limbs spread, knees bent
        P.arm[-1] = -1.5 + fl; P.arm[1] = -1.5 - fl; P.armZ[-1] = -1.15 * g; P.armZ[1] = 1.15 * g;
        P.leg[-1] = 0.3; P.leg[1] = 0.3; P.legZ[-1] = -0.28 * g; P.legZ[1] = 0.28 * g;
        P.knee[-1] = 1.0 + fl; P.knee[1] = 1.0 - fl;
        P.headX = -0.55;
      }
    } else if (!s.grounded) {
      if (s.vy > 0) {
        P.arm[-1] = -2.7; P.arm[1] = -2.3;
        P.leg[-1] = -0.9; P.leg[1] = 0.5;
      } else {
        const f = Math.sin(this.t * 14) * 0.35;
        P.arm[-1] = -2.8 + f; P.arm[1] = -2.8 - f;
        P.leg[-1] = -0.35 + f; P.leg[1] = 0.25 - f;
        P.headX = 0.2;
      }
    } else if (s.crouch) {
      // Minifig sit: legs forward, figure drops
      this.phase += dt * s.speed * 2.2;
      const w = s.speed > 0.3 ? Math.sin(this.phase) * 0.3 : 0;
      P.leg[-1] = -1.45 + w; P.leg[1] = -1.45 - w;
      P.bodyY = -0.42;
      P.arm[-1] = -0.9; P.arm[1] = -0.9;
    } else if (s.speed > 0.4) {
      const run = Math.min(s.speed / 18, 1);
      this.phase += dt * (7 + run * 7);
      const sw = Math.sin(this.phase) * (0.6 + run * 0.45);
      P.leg[-1] = sw; P.leg[1] = -sw;
      P.arm[-1] = -sw * 0.9; P.arm[1] = sw * 0.9;
      if (run > 0.6) { P.arm[-1] -= 0.5; P.arm[1] -= 0.5; } // sprint: arms pumped forward
      P.bodyY = Math.abs(Math.cos(this.phase)) * (0.04 + run * 0.07);
      P.lean = 0.05 + run * 0.18;
      P.headX = -P.lean * 0.6;
    } else {
      const b = Math.sin(this.t * 1.8);
      P.arm[-1] = -0.08 + b * 0.04; P.arm[1] = -0.08 - b * 0.04;
      P.bodyY = b * 0.008;
      P.headY = Math.sin(this.t * 0.45) * 0.35 * (Math.sin(this.t * 0.17) > 0.3 ? 1 : 0);
    }

    // Landings: superhero three-point, forward roll, running slide, knee-bend
    const ld = s.land;
    if (ld && s.grounded !== false) {
      const p = ld.p, inn = Math.min(1, p / 0.12), out = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1, w = inn * out;
      const mix = (a, b) => a + (b - a) * w;
      switch (ld.kind) {
        case 'hero':
          P.bodyY = mix(P.bodyY, -0.5); P.lean = mix(P.lean, 0.55);
          P.leg[-1] = mix(P.leg[-1], -1.35); P.knee[-1] = mix(P.knee[-1], 1.55);   // front leg planted
          P.leg[1] = mix(P.leg[1], 0.55); P.knee[1] = mix(P.knee[1], 2.0);         // back knee down
          P.arm[1] = mix(P.arm[1], -0.75); P.armZ[1] = mix(P.armZ[1], 0.25);       // fist to the ground
          P.arm[-1] = mix(P.arm[-1], 0.7); P.armZ[-1] = mix(P.armZ[-1], -0.7);     // other arm back
          P.headX = mix(P.headX, -0.45);
          break;
        case 'perch':      // the classic Spidey crouch on a ledge: feet under him, a hand down between them
          P.bodyY = mix(P.bodyY, -0.42); P.lean = mix(P.lean, 0.42);
          P.leg[-1] = mix(P.leg[-1], -1.25); P.knee[-1] = mix(P.knee[-1], 1.75);
          P.leg[1] = mix(P.leg[1], -1.15); P.knee[1] = mix(P.knee[1], 1.7);
          P.legZ[-1] = mix(P.legZ[-1], -0.22); P.legZ[1] = mix(P.legZ[1], 0.22);
          P.arm[1] = mix(P.arm[1], -0.95); P.armZ[1] = mix(P.armZ[1], 0.12);
          P.arm[-1] = mix(P.arm[-1], -1.45); P.armZ[-1] = mix(P.armZ[-1], -0.35);
          P.headX = mix(P.headX, -0.3);
          break;
        case 'slide':
          P.bodyY = mix(P.bodyY, -0.35); P.lean = mix(P.lean, -0.3);
          P.leg[-1] = mix(P.leg[-1], -1.1); P.knee[-1] = mix(P.knee[-1], 0.2);
          P.leg[1] = mix(P.leg[1], -0.5); P.knee[1] = mix(P.knee[1], 1.5);
          P.arm[1] = mix(P.arm[1], 0.5); P.armZ[1] = mix(P.armZ[1], 0.9);
          P.arm[-1] = mix(P.arm[-1], -1.3); P.armZ[-1] = mix(P.armZ[-1], -0.4);
          break;
        case 'roll':
          P.bodyY = mix(P.bodyY, -0.3);
          P.leg[-1] = P.leg[1] = mix(0, -1.6); P.knee[-1] = P.knee[1] = mix(0, 1.6);
          P.arm[-1] = P.arm[1] = mix(0, -1.2); P.headX = mix(0, 0.5);
          break;
        default: {   // crouch
          const c = Math.sin(Math.min(1, p) * Math.PI);
          P.bodyY -= 0.3 * c; P.lean += 0.25 * c; P.knee[-1] += 0.9 * c; P.knee[1] += 0.9 * c;
          P.leg[-1] -= 0.45 * c; P.leg[1] -= 0.45 * c; P.arm[-1] -= 0.4 * c; P.arm[1] -= 0.4 * c;
        }
      }
      k = Math.max(k, 1 - Math.exp(-22 * dt));
    }

    // Emotes override the idle pose. The big dances come from the DANCES choreography above.
    let twist = P.twist ?? 0, roll = P.roll ?? 0, snappy = false;
    if (s.emote && s.grounded !== false && !s.swinging && !s.climbing) {
      const t = this.t;
      const w = Math.sin(t * 10), slow = Math.sin(t * 4);
      P.bodyY = 0; P.lean = 0; P.headX = 0; P.headY = 0; P.leg[-1] = P.leg[1] = 0;
      snappy = true;
      switch (s.emote) {
        case 'wave':  P.arm[-1] = -2.75 + w * 0.3; P.arm[1] = 0.05; P.headY = 0.25; snappy = false; break;
        case 'highfive': P.arm[-1] = -1.9 + w * 0.08; P.armZ[-1] = -0.7; P.arm[1] = 0.05; P.lean = 0.08; snappy = false; break;
        case 'talk':  P.arm[-1] = -0.34 + Math.sin(t * 4.2) * 0.09; P.arm[1] = -0.22 + Math.cos(t * 3.6) * 0.08;
                      P.headY = Math.sin(t * 2.4) * 0.06; P.headX = -0.04; snappy = false; break;
        case 'point': P.arm[-1] = -2.42 + Math.sin(t * 2.2) * 0.05; P.arm[1] = -0.2 + Math.cos(t * 1.8) * 0.03;
                      P.armZ[-1] = 0.12; P.headY = 0.12; P.headX = -0.06; snappy = false; break;
        case 'operate': P.arm[-1] = -1.28 + Math.sin(t * 5.8) * 0.2; P.arm[1] = -1.16 + Math.cos(t * 4.6) * 0.17;
                        P.headX = 0.14; P.lean = 0.07; snappy = false; break;
        case 'listen': P.arm[-1] = -0.14; P.arm[1] = -0.12; P.armZ[-1] = -0.06;
                        P.headY = Math.sin(t * 1.1) * 0.1; P.headX = -0.05; snappy = false; break;
        case 'grief': P.arm[-1] = -0.34; P.arm[1] = -0.34; P.armZ[-1] = -0.2; P.armZ[1] = 0.2;
                      P.headX = 0.5; P.lean = 0.16 + Math.sin(t * 2.4) * 0.025; snappy = false; break;
        case 'reach': P.arm[-1] = -2.8 + Math.sin(t * 2.5) * 0.07; P.arm[1] = -0.18;
                      P.headX = -0.13; snappy = false; break;
        case 'wounded': P.arm[-1] = -0.65; P.arm[1] = -0.16; P.armZ[-1] = -0.18;
                        P.headX = 0.13; P.lean = 0.12; snappy = false; break;
        case 'dance': P.arm[-1] = -1.2 + slow * 1.2; P.arm[1] = -1.2 - slow * 1.2; P.leg[-1] = slow * 0.5; P.leg[1] = -slow * 0.5;
                      P.bodyY = Math.abs(Math.sin(t * 8)) * 0.1; P.headY = slow * 0.4; twist = Math.sin(t * 4) * 0.35; break;
        case 'flex':  P.arm[-1] = P.arm[1] = -2.3 + Math.abs(w) * 0.2; P.lean = -0.12; P.headX = -0.15; snappy = false; break;
        case 'cheer': P.arm[-1] = P.arm[1] = -3.0 + w * 0.15; P.bodyY = Math.abs(Math.sin(t * 7)) * 0.25; P.headX = -0.25; break;
        case 'sit':   P.leg[-1] = P.leg[1] = -1.5; P.bodyY = -0.42; P.arm[-1] = P.arm[1] = -0.7; snappy = false; break;
        case 'laugh': P.lean = -0.2 + Math.abs(Math.sin(t * 9)) * 0.15; P.headX = -0.35; P.arm[-1] = P.arm[1] = -0.4; break;

        default: {
          const d = DANCES[s.emote];
          if (!d) break;
          const q = dancePose(d, t);
          // Side 1 is the figure's left (+x), side -1 its right; outward is +z on the left, -z on the right
          P.arm[1] = q.aLx; P.arm[-1] = q.aRx; P.leg[1] = q.lLx; P.leg[-1] = q.lRx;
          P.armZ[1] = q.aLz; P.armZ[-1] = -q.aRz; P.legZ[1] = q.lLz; P.legZ[-1] = -q.lRz;
          P.knee[1] = q.kL; P.knee[-1] = q.kR;
          P.bodyY = q.y; P.bodyX = q.x; P.lean = q.lean; P.headX = q.hx; P.headY = q.hy;
          roll = q.roll; twist = q.twist;
        }
      }
    }
    this.body.rotation.y = damp(this.body.rotation.y, twist, snappy ? 1 - Math.exp(-28 * dt) : k);
    this.body.rotation.z = damp(this.body.rotation.z, roll, snappy ? 1 - Math.exp(-28 * dt) : k);
    if (snappy) this._snappy = true;

    // Air tricks: tuck during flips, stretch out for the corkscrew
    const tr = s.trick;
    if (tr) {
      const ease = Math.sin(Math.min(1, tr.p * 3) * Math.PI / 2) * (tr.p > 0.8 ? (1 - tr.p) / 0.2 : 1);   // pose in, hold, relax
      if (tr.type === 'corkscrew' || tr.type === 'barrelroll') { P.arm[-1] = P.arm[1] = -1.4; P.armZ[-1] = -1.1; P.armZ[1] = 1.1; P.leg[-1] = P.leg[1] = 0; }
      else if (tr.type === 'spread') { P.arm[-1] = P.arm[1] = -1.2 * ease; P.armZ[-1] = -1.3 * ease; P.armZ[1] = 1.3 * ease; P.leg[-1] = 0.3 * ease; P.leg[1] = -0.3 * ease; P.headX = -0.15; }
      else if (tr.type === 'reach') { P.arm[1] = -2.9 * ease; P.arm[-1] = 0.4 * ease; P.leg[-1] = 0.35 * ease; P.leg[1] = -0.15 * ease; }
      else if (tr.type === 'dive') { P.arm[-1] = P.arm[1] = -2.7 * ease; P.leg[-1] = P.leg[1] = 0.15 * ease; P.headX = -0.25 * ease; }
      else if (tr.type === 'hang') { P.arm[-1] = -0.9 * ease; P.arm[1] = -0.5 * ease; P.leg[-1] = -0.8 * ease; P.leg[1] = -0.35 * ease; P.knee[-1] = 1.0 * ease; P.knee[1] = 0.5 * ease; }
      else if (tr.p < 0.18) { P.arm[-1] = P.arm[1] = -2.9; P.leg[-1] = 0.3; P.leg[1] = -0.4; } // superhero launch pose
      else { P.arm[-1] = P.arm[1] = -1.3; P.leg[-1] = P.leg[1] = -1.6; P.knee[-1] = P.knee[1] = 1.2; P.headX = 0.35; }      // tight tuck
      k = Math.max(k, 1 - Math.exp(-25 * dt));
    }

    // Attack poses depend on what the character is actually holding
    if (s.attack > 0) {
      const side = s.attackArm ?? -1;
      const t = s.attack; // 1 → 0 over the swing
      switch (s.attackKind) {
        case 'shoot':                      // pistols, bow, rifle: both arms out, slight recoil
          P.arm[side] = -1.52 + (1 - t) * 0.12;
          P.arm[-side] = -1.4;
          P.armZ[side] = -0.12;
          P.lean = 0.1;
          break;
        case 'sword':                      // overhead katana / staff / hammer chop
          P.arm[side] = t > 0.55 ? -2.55 : -0.75;
          P.armZ[side] = -0.3;
          P.arm[-side] = 0.2;
          P.lean = t > 0.55 ? -0.12 : 0.26;
          break;
        case 'cast':                       // repulsor / magic: arm raised toward the target
          P.arm[side] = -2.75;
          P.armZ[side] = -0.35;
          P.arm[-side] = s.flight ? -0.6 : -0.3;
          P.headX = -0.2;
          break;
        case 'optic':                      // Cyclops: both hands to the visor, head forward
          P.arm[-1] = P.arm[1] = -2.35;
          P.armZ[-1] = -0.25; P.armZ[1] = 0.25;
          P.headX = 0.15; P.lean = -0.12;
          break;
        case 'stretch':                    // Mr. Fantastic / elastic reach
          P.arm[side] = -1.65;
          P.armZ[side] = -0.1;
          P.lean = 0.24;
          break;
        default: {                         // punch: snap one arm forward
          P.arm[side] = t > 0.6 ? -0.4 : -1.75;
          P.arm[-side] = 0.35;
          P.lean = 0.18;
        }
      }
    }
    if (s.slam) { P.arm[-1] = P.arm[1] = -3.0; P.leg[-1] = -0.6; P.leg[1] = -0.6; }
    if (s.hurt > 0) { P.lean = -0.35; P.headX = 0.3; }

    animateGear(this, this.t, s.speed ?? 0);
    animateKit(this, this.t, s);
    if (this._snappy) { this._snappy = false; k = Math.max(k, 1 - Math.exp(-28 * dt)); }
    this.body.position.y = damp(this.body.position.y, P.bodyY, k);
    this.body.rotation.x = damp(this.body.rotation.x, P.lean, k);
    this.head.rotation.y = damp(this.head.rotation.y, P.headY, k * 0.5);
    this.head.rotation.x = damp(this.head.rotation.x, P.headX, k);
    if (tr) {
      const e = tr.p < 0.5 ? 2 * tr.p * tr.p : 1 - (-2 * tr.p + 2) ** 2 / 2; // ease in/out
      const q = Math.max(0, (tr.p - 0.15) / 0.85); // flips begin after the launch pose
      const ef = q < 0.5 ? 2 * q * q : 1 - (-2 * q + 2) ** 2 / 2;
      // One rotation axis per trick so the waist pivot stays clean; poses don't spin the body at all
      const T = Math.PI * 2;
      this.spin.rotation.set(
        tr.type === 'backflip' ? -T * ef : tr.type === 'double' ? -T * 2 * ef : tr.type === 'frontflip' ? T * ef : tr.type === 'dive' ? 0.3 * Math.sin(Math.PI * tr.p) : 0,
        tr.type === 'corkscrew' ? T * e : 0,
        tr.type === 'corkscrew' ? Math.sin(Math.PI * e) * 0.7 : tr.type === 'sideflip' ? T * ef : tr.type === 'barrelroll' ? -T * e : 0);
    } else {
      // Hang along the web: the body points at the anchor and leans into turns, like a pendulum
      const rope = s.swinging && s.rope ? s.rope : [0, 0];
      const kr = 1 - Math.exp(-10 * dt);
      const wrap = r => Math.atan2(Math.sin(r), Math.cos(r)); // a finished flip is 360°, not something to unwind
      this.spin.rotation.set(wrap(this.spin.rotation.x), wrap(this.spin.rotation.y), wrap(this.spin.rotation.z));
      const FALL_PITCH = { dive: 1.15, skydive: 1.3, back: -1.25 };
      const pitch = s.swinging ? Math.max(-1.1, Math.min(1.1, rope[0] * 0.85)) : FALL_PITCH[this._fallStyle] ?? 0;
      if (s.land?.kind === 'roll') {
        const q = Math.min(1, s.land.p / 0.85), e = q < 0.5 ? 2 * q * q : 1 - (-2 * q + 2) ** 2 / 2;
        this.spin.rotation.x = Math.PI * 2 * e;   // a full forward roll, wrapped back to 0 after
      } else this.spin.rotation.x = damp(this.spin.rotation.x, pitch, s.swinging ? kr : 1 - Math.exp(-5 * dt));
      this.spin.rotation.z = damp(this.spin.rotation.z, Math.max(-0.7, Math.min(0.7, -rope[1] * 0.6)), kr);
      this.spin.rotation.y = damp(this.spin.rotation.y, 0, kr);
    }
    // Stand on the wall: roll the whole figure so its feet are on the facade and the
    // head leans away from it. Side +1 = wall on the figure's right.
    const tiltTarget = s.wallRun ? s.wallRun * 0.5 : 0;   // angled into the wall, not flat on it
    this.wallTilt = damp(this.wallTilt, tiltTarget, 1 - Math.exp((s.wallRun ? -14 : -9) * dt));
    this.root.rotation.z = this.wallTilt;
    this.body.position.x = damp(this.body.position.x, P.bodyX, k);
    for (const sd of [-1, 1]) {
      this.arm[sd].rotation.x = damp(this.arm[sd].rotation.x, P.arm[sd], k);
      this.leg[sd].rotation.x = damp(this.leg[sd].rotation.x, P.leg[sd], k);
      this.arm[sd].rotation.z = damp(this.arm[sd].rotation.z, P.armZ[sd], k);
      this.leg[sd].rotation.z = damp(this.leg[sd].rotation.z, P.legZ[sd], k);
      this._bendKnee(sd, damp(this.kneeAngle[sd], P.knee[sd], k));
    }
    // Decoded minifig clips are NOT applied to this part rig: a rigid LEGO figure can't follow the
    // game's full-skeleton poses (spine bends, crawls, sits) without breaking apart. Kept for reference.
    // Real dance emotes (DANCE_CLIPS) do use them while they play, then fade back to the procedural pose.
    if (this.mini && (LegoSpidey.USE_DECODED_CLIPS || DANCE_CLIPS[s.emote] || this._mwOn)) this._applyMini(s, dt);
  }

  /** Bend one knee to `angle` (radians, + folds the shin back) by deforming the leg mesh. */
  _bendKnee(s, angle) {
    if (Math.abs(angle) < 0.003) angle = 0;
    if (Math.abs(angle - this.kneeAngle[s]) < 0.003) return;
    this.kneeAngle[s] = angle;
    const K = this.kneeGeo?.[s];
    if (!K) return;
    const p = K.geo.attributes.position.array, n = K.geo.attributes.normal?.array;
    for (let i = 0; i < p.length; i += 3) {
      const y = K.pos[i + 1], z = K.pos[i + 2];
      const w = Math.max(0, Math.min(1, (K.ky + 0.05 - y) / 0.1));
      const a = angle * w * w * (3 - 2 * w), c = Math.cos(a), sn = Math.sin(a);
      const dy = y - K.ky, dz = z - K.kz;
      p[i] = K.pos[i];
      p[i + 1] = K.ky + dy * c - dz * sn;
      p[i + 2] = K.kz + dy * sn + dz * c;
      if (n) {
        const ny = K.nrm[i + 1], nz = K.nrm[i + 2];
        n[i + 1] = ny * c - nz * sn;
        n[i + 2] = ny * sn + nz * c;
      }
    }
    K.geo.attributes.position.needsUpdate = true;
    if (n) K.geo.attributes.normal.needsUpdate = true;
    K.geo.computeBoundingSphere();
  }

  /** World position of the requested web-shooting hand. */
  handWorld(target, side = -1) {
    const local = this.handLocal?.[side];
    if (local) return this.arm[side].localToWorld(target.copy(local));
    // Legacy OBJ rig fallback (the extracted GLB path stores a real hand anchor).
    return this.arm[side].localToWorld(target.set(0, -0.55, 0.05));
  }
}
