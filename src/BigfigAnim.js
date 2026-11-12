/**
 * BigfigAnim.js — plays the real LEGO Marvel big-fig animations (decoded from the game's AN4 packs
 * by tools/an4/export_bigfig.py) on any GLB using the 70-joint big-fig skeleton (Venom, Hulk...).
 *
 * The clip data is already in the GLB's local joint frames: per joint a quaternion per frame, plus
 * the Hips offset from its bind position. The player crossfades between clips and hands back
 * target rotations; GlbMinifig blends those with its procedural poses (swing, climb, emotes).
 */
import * as THREE from 'three';

const BANKS = {
  bigfig: new URL('../assets/anims/bigfig.json?v=2', import.meta.url).href,
  lizard: new URL('../assets/anims/lizard.json?v=1', import.meta.url).href,
  minifig: new URL('../assets/anims/minifig.json?v=1', import.meta.url).href,
  dances: new URL('../assets/anims/dances.json?v=1', import.meta.url).href,   // hub dance clips, same 63-joint rig
  greengoblin: new URL('../assets/anims/greengoblin.json?v=1', import.meta.url).href,
};
const pending = {};

function b64i16(s) {
  const bin = atob(s), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Int16Array(u8.buffer);
}

/**
 * Load and unpack a clip bank once (shared by every figure).
 *  'bigfig' : local joint rotations for the 70-joint big-fig GLB (play straight onto its bones)
 *  'minifig': model-space deltas per joint (63-joint minifig rig), retargeted by joint name
 */
export function loadClipBank(name) {
  pending[name] ??= fetch(BANKS[name]).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(d => {
    const clips = {}, all = d.joints.map((_, i) => i);
    for (const [k, c] of Object.entries(d.clips)) {
      clips[k] = { n: c.n, loop: c.loop, moving: c.moving ?? all, const: c.const ?? {}, q: b64i16(c.q ?? c.d), hips: b64i16(c.hips), dur: Math.max(1, c.n - 1) / d.fps };
    }
    return { name, fps: d.fps, joints: d.joints, parents: d.parents, hipH: d.hipH, clips };
  }).catch(e => { console.warn('[BigfigAnim] clips unavailable:', name, e.message); delete pending[name]; return null; });
  return pending[name];
}
export const loadBigfigClips = () => loadClipBank('bigfig');

/** The Lizard's own clips (idles, walk, slam, finishing moves) layered over the shared big-fig
 *  bank for locomotion and hits: both packs use the same 70-joint skeleton. */
export async function loadLizardClips() {
  const [base, own] = await Promise.all([loadBigfigClips(), loadClipBank('lizard')]);
  if (!base || !own) return base ?? own;
  return { ...base, clips: { ...base.clips, ...own.clips } };
}

const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _v = new THREE.Vector3();

export class BigfigPlayer {
  /** @param {{fps:number, joints:string[], clips:Object}} bank @param {Object<string, THREE.Bone>} [bones] */
  constructor(bank, bones = {}) {
    this.bank = bank;
    this.fps = bank.fps;
    this.joints = bank.joints.map(n => bones[n] ?? null);
    this.J = this.joints.length;
    this.out = this.joints.map(() => new THREE.Quaternion());
    this.hips = new THREE.Vector3();
    this.cur = null;            // { clip, name, t, speed, loop }
    this.prev = null;
    this.fade = 0; this.fadeDur = 0.2;
  }

  has(name) { return !!this.bank.clips[name]; }

  /** Switch clip (no-op if already playing it, unless restart). */
  play(name, { fade = 0.2, speed = 1, restart = false, loop } = {}) {
    const clip = this.bank.clips[name];
    if (!clip) return;
    if (this.cur?.name === name && !restart) { this.cur.speed = speed; return; }
    this.prev = this.cur;
    this.cur = { clip, name, t: 0, speed, loop: loop ?? clip.loop };
    this.fade = this.prev ? 0 : 1; this.fadeDur = Math.max(1e-3, fade);
  }

  /** Seconds left in a one-shot clip (Infinity for loops). */
  remaining() {
    const c = this.cur;
    if (!c) return 0;
    return c.loop ? Infinity : Math.max(0, (c.clip.dur - c.t) / Math.max(1e-3, c.speed));
  }

  progress() { const c = this.cur; return c ? Math.min(1, c.t / Math.max(1e-3, c.clip.dur)) : 0; }

  _advance(s, dt) {
    s.t += dt * s.speed;
    if (s.loop) s.t %= s.clip.dur; else s.t = Math.min(s.t, s.clip.dur);
  }

  /** Write clip s at its time into out[] (slerped by w) and hips. */
  _sample(s, w) {
    const c = s.clip, f = s.t * this.fps, i0 = Math.floor(f), a = f - i0;
    const i1 = s.loop ? (i0 + 1) % c.n : Math.min(i0 + 1, c.n - 1), f0 = Math.min(i0, c.n - 1);
    const M = c.moving.length, S = 1 / 32767;
    for (const [j, q] of Object.entries(c.const)) {
      _qa.set(q[0], q[1], q[2], q[3]);
      if (w >= 1) this.out[j].copy(_qa); else this.out[j].slerp(_qa, w);
    }
    for (let m = 0; m < M; m++) {
      const j = c.moving[m], o0 = (f0 * M + m) * 4, o1 = (i1 * M + m) * 4;
      _qa.set(c.q[o0] * S, c.q[o0 + 1] * S, c.q[o0 + 2] * S, c.q[o0 + 3] * S).normalize();
      _qb.set(c.q[o1] * S, c.q[o1 + 1] * S, c.q[o1 + 2] * S, c.q[o1 + 3] * S).normalize();
      _qa.slerp(_qb, a);
      if (w >= 1) this.out[j].copy(_qa); else this.out[j].slerp(_qa, w);
    }
    const h0 = f0 * 3, h1 = i1 * 3, H = 1e-4;
    const x = (c.hips[h0] + (c.hips[h1] - c.hips[h0]) * a) * H, y = (c.hips[h0 + 1] + (c.hips[h1 + 1] - c.hips[h0 + 1]) * a) * H, z = (c.hips[h0 + 2] + (c.hips[h1 + 2] - c.hips[h0 + 2]) * a) * H;
    if (w >= 1) this.hips.set(x, y, z); else this.hips.lerp(_v.set(x, y, z), w);
  }

  /** Advance and evaluate. Afterwards out[j] / hips hold the blended pose. */
  update(dt) {
    if (!this.cur) return false;
    if (this.prev && this.fade < 1) {
      this._advance(this.prev, dt);
      this._sample(this.prev, 1);
      this.fade = Math.min(1, this.fade + dt / this.fadeDur);
      const e = this.fade * this.fade * (3 - 2 * this.fade);
      this._advance(this.cur, dt);
      this._sample(this.cur, e);
    } else {
      this.prev = null;
      this._advance(this.cur, dt);
      this._sample(this.cur, 1);
    }
    return true;
  }
}

export { BigfigPlayer as ClipPlayer };

/** Wall-climb clips are authored with the root lying on the wall (root up = wall normal, forward = up):
 *  untilted, the torso leans ~53 deg into the facade. Tilting the root back 65 deg leaves the climber
 *  hugging the wall (~11 deg off it). GLB frame faces -z, game frame +z, hence the opposite signs. */
const CLIMB_TILT = 65 * Math.PI / 180;
export const CLIMB_ROOT_GLB = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), CLIMB_TILT);
export const CLIMB_ROOT_GAME = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -CLIMB_TILT);

/**
 * Apply a 'minifig' bank's model-space deltas to any skinned skeleton with TT joint names
 * (63-joint minifigs exactly; the 70-joint big-fig by name, extra joints follow their parent).
 *   W'_b(t) = D_b(t) * W'_b(bind),   local_b = W'_parent(t)^-1 * W'_b(t)
 */
export class Retarget {
  /** @param {{joints:string[]}} bank @param {THREE.Bone} rootBone the 'Character' bone */
  constructor(bank, rootBone) {
    this.list = [];                      // parent-first: { bone, src, parent (index in list), bindW }
    const visit = (bone, parent) => {
      if (!bone.isBone) return;
      const pW = parent >= 0 ? this.list[parent].bindW : new THREE.Quaternion();
      const bindW = parent >= 0 ? pW.clone().multiply(bone.quaternion) : new THREE.Quaternion();
      const i = this.list.push({ bone, src: bank.joints.indexOf(bone.name), parent, bindW, bindL: bone.quaternion.clone(), W: new THREE.Quaternion(), D: new THREE.Quaternion() }) - 1;
      for (const c of bone.children) visit(c, i);
    };
    visit(rootBone, -1);
    this._q = new THREE.Quaternion();
  }

  /**
   * Blend the delta pose `out` (from a ClipPlayer on a minifig bank) onto the bones by weight w.
   * relTo: a joint name (e.g. 'Hips') whose delta is factored out, so the clip only poses the body
   * relative to it and the game keeps that joint's orientation (swings: physics tilts the body).
   * pre: an extra root rotation (GLB frame) applied to the whole pose, e.g. to lay a wall-climb clip,
   * authored with the root flat on the wall, onto our upright-root climber.
   */
  apply(out, w = 1, relTo = null, pre = null) {
    const q = this._q;
    const ri = relTo ? this.list.findIndex(L => L.bone.name === relTo) : -1;
    const R = ri >= 0 && this.list[ri].src >= 0 ? (this._r ??= new THREE.Quaternion()).copy(out[this.list[ri].src]).invert() : null;
    for (let i = 0; i < this.list.length; i++) {
      const L = this.list[i];
      if (L.parent < 0) { L.D.identity(); L.W.identity(); continue; }
      const P = this.list[L.parent];
      if (L.src >= 0) { L.D.copy(out[L.src]); if (R) L.D.premultiply(R); if (pre) L.D.premultiply(pre); } else L.D.copy(P.D);
      L.W.copy(L.D).multiply(L.bindW);
      q.copy(P.W).invert().multiply(L.W);
      if (w >= 1) L.bone.quaternion.copy(q); else L.bone.quaternion.slerp(q, w);
      L.W.copy(P.W).multiply(L.bone.quaternion);
    }
  }
}
