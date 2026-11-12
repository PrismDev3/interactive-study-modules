/**
 * Multiplayer.js — other players in the room: suit, interpolated movement, pixel name tags and
 * chat bubbles (visible through walls), coloured silhouettes behind walls ("chams"), webs, PvP.
 */
import * as THREE from 'three';
import { normalizePlayerState } from './PlayerState.js?v=4';
import { roomPolicy } from './RoomPolicy.js?v=2';
import { LegoSpidey } from './LegoSpidey.js?v=183';
import { rigOpts, dressRig, heroOf } from './Characters.js?v=67';
import { tokenize, pixelEmoji } from './Chat.js?v=65';
import { portraitURL } from './Portrait.js?v=217';
import { applyGear } from './Gear.js?v=65';
import { parseOutfit } from './Outfit.js?v=65';
import { rolePresentation } from './RoleBadge.js?v=1';

const SEND_HZ = 15;
const INTERP_DELAY = 110; // ms behind the newest state, smooths network jitter
const COLORS = ['#ff4d4d', '#4da6ff', '#ffd23f', '#5cff8a', '#ff7ae0', '#ff9a3a', '#8a7aff', '#4dfff0'];
export const colorFor = id => COLORS[id % COLORS.length];

function poseWaldoGrip(rig, dt, holdingWithBothHands) {
  const k = 1 - Math.exp(-10 * dt);
  for (const w of rig?.waldo ?? []) {
    if (!w.leg) continue;
    const fold = w.fold = (w.fold ?? 0) + ((holdingWithBothHands ? 1 : 0) - (w.fold ?? 0)) * k;
    const top = w.leg.position.y > 1.1;
    const idleX = w.leg.rotation.x, idleZ = w.leg.rotation.z;
    w.leg.rotation.x = idleX * (1 - fold);
    w.leg.rotation.y = w.s * 1.45 * fold;
    w.leg.rotation.z = idleZ * (1 - fold) - w.s * (top ? 0.85 : -0.65) * fold;
    w.leg.scale.setScalar(1 - fold * 0.86);
  }
}

// Small round face per suit for chat lines
const faceCache = new Map();
export function suitFace(code = 'classic') {
  if (!faceCache.has(code)) {
    faceCache.set(code, null);
    portraitURL(code).then(url => faceCache.set(code, url));
    if (faceCache.size > 60) faceCache.delete(faceCache.keys().next().value);
  }
  return faceCache.get(code);
}

// ─── Pixel text sprites ──────────────────────────────────────────────────────
const FONT = '"Fredoka", "Lilita One", sans-serif';

function wrap(g, tokens, maxW) {
  const lines = [[]];
  let w = 0;
  const pieces = tokens.flatMap(t => (typeof t === 'string' ? t.split(/(\s+)/).filter(Boolean) : [t]));
  for (const p of pieces) {
    const pw = typeof p === 'string' ? g.measureText(p).width : 12;
    if (w + pw > maxW && lines.at(-1).length && !(typeof p === 'string' && /^\s+$/.test(p))) { lines.push([]); w = 0; }
    if (!(lines.at(-1).length === 0 && typeof p === 'string' && /^\s+$/.test(p))) { lines.at(-1).push(p); w += pw; }
  }
  return lines;
}

/** Canvas-backed sprite drawn at low resolution and scaled with nearest filtering (pixel look). */
const RES = 3;
function pixelSprite(draw, w, h) {
  const c = document.createElement('canvas');
  c.width = w * RES; c.height = h * RES;
  const g = c.getContext('2d');
  g.scale(RES, RES);
  draw(g);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true });
  const s = new THREE.Sprite(mat);
  s.renderOrder = 1000;
  s.userData.px = [w, h];
  return s;
}

function outlinedText(g, text, x, y, color) {
  g.fillStyle = '#111';
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) g.fillText(text, x + dx * 0.8, y + dy * 0.8);
  g.fillStyle = color;
  g.fillText(text, x, y);
}

export function nameTag(name, color, rank = 0) {
  const role = rolePresentation(rank);
  const g0 = document.createElement('canvas').getContext('2d');
  g0.font = `600 12px ${FONT}`;
  const nameWidth = Math.ceil(g0.measureText(name).width);
  g0.font = `700 7px ${FONT}`;
  const badgeWidth = role ? Math.ceil(g0.measureText(role.label).width) + 8 : 0;
  const w = nameWidth + 6 + (role ? badgeWidth + 4 : 0);
  return pixelSprite(g => {
    g.font = `600 12px ${FONT}`;
    g.textBaseline = 'top';
    outlinedText(g, name, 3, 2, color);
    if (role) {
      const x = nameWidth + 7;
      g.fillStyle = '#111'; g.fillRect(x - 1, 1, badgeWidth + 2, 12);
      g.fillStyle = role.background; g.fillRect(x, 2, badgeWidth, 10);
      g.font = `700 7px ${FONT}`;
      g.fillStyle = role.foreground; g.fillText(role.label, x + 4, 4);
    }
  }, w, 17);
}

/** Pixel chat bubble with text + pixel emoji, or the "..." typing dots. */
export function bubble(text) {
  const g0 = document.createElement('canvas').getContext('2d');
  g0.font = `600 10px ${FONT}`;
  const lines = wrap(g0, tokenize(text), 110);
  const lw = lines.map(l => l.reduce((s, p) => s + (typeof p === 'string' ? g0.measureText(p).width : 12), 0));
  const w = Math.ceil(Math.max(14, ...lw)) + 10, h = lines.length * 12 + 10;
  return pixelSprite(g => {
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#111';
    g.fillRect(1, 0, w - 2, h - 4); g.fillRect(0, 1, w, h - 6);
    g.fillRect(Math.floor(w / 2) - 3, h - 4, 6, 2); g.fillRect(Math.floor(w / 2) - 1, h - 2, 2, 2);
    g.fillStyle = '#fff';
    g.fillRect(2, 1, w - 4, h - 6); g.fillRect(1, 2, w - 2, h - 8);
    g.fillRect(Math.floor(w / 2) - 2, h - 5, 4, 2);
    g.font = `600 10px ${FONT}`;
    g.textBaseline = 'top';
    g.fillStyle = '#111';
    lines.forEach((line, i) => {
      let x = 5;
      for (const p of line) {
        if (typeof p === 'string') { g.fillText(p, x, 4 + i * 12); x += g.measureText(p).width; }
        else { g.drawImage(pixelEmoji(p.emoji), x, 3 + i * 12, 12, 12); x += 12; }
      }
    });
  }, w, h);
}

const PX = 0.03; // metres per sprite pixel at close range

// ─── Players ─────────────────────────────────────────────────────────────────
export class Multiplayer {
  constructor({ scene, camera, controller, net, chat, combat, me, room, players, hostId = null }) {
    Object.assign(this, { scene, camera, controller, net, chat, combat, me, room });
    this.players = new Map();
    this._sendT = 0;
    this._t = 0;
    this.myRank = me.rank ?? 0;
    this.hostId = hostId;   // server-elected streamer for summoned characters
    this.onRoster = null;   // Social's Room tab refreshes when someone joins or leaves
    this._applyRoomPolicy();

    // Your own name + bubble float above your head too
    this.self = { id: me.id, name: me.name, rank: this.myRank, root: controller.root, tagY: 1.75 };
    this._attachTag(this.self, colorFor(me.id));

    for (const p of players) this.add(p);
    net.on('join', m => { window.gameSfx?.play('join'); this.add(m.player); chat.system(`${m.player.name} joined`); });
    net.on('leave', m => { const p = this.players.get(m.id); if (p) { chat.system(`${p.name} left`); window.gameSfx?.play('leave'); } this.remove(m.id); });
    net.on('state', m => {
      const p = this.players.get(m.id), s = normalizePlayerState(m.s);
      if (p && s) p.states.push({ t: performance.now(), s });
    });
    net.on('emote', m => {
      const p = this.players.get(m.id);
      if (p && ['wave', 'highfive'].includes(m.e)) p.socialEmote = { key: m.e, until: performance.now() + 1800 };
    });
    net.on('variant', m => this._setVariant(this.players.get(m.id), m.v));
    net.on('rank', m => {
      const p = this.players.get(m.id);
      if (p) { p.rank = m.rank; this._attachTag(p, p.color ?? colorFor(p.id)); }
      if (m.id === me.id) {
        this.myRank = m.rank; this.self.rank = m.rank; this._attachTag(this.self, colorFor(me.id));
        chat.myRank = m.rank;
      }
      this.onRoster?.();
    });
    net.on('owner', m => {
      if (m.room) this.room = m.room;
      else if (this.room) this.room.owner = m.name;
      for (const entry of m.ranks ?? []) {
        const p = this.players.get(entry.id);
        if (p) { p.rank = entry.rank; this._attachTag(p, p.color ?? colorFor(p.id)); }
        if (entry.id === me.id) {
          this.myRank = entry.rank; this.self.rank = entry.rank; this._attachTag(this.self, colorFor(me.id));
        }
      }
      chat.myRank = this.myRank;
      this.onRoster?.();
    });
    net.on('host', m => { this.hostId = m.id; });
    net.on('nameColor', m => {
      const p = this.players.get(m.id);
      if (!p) return;
      p.color = m.color;
      this._attachTag(p, m.color);
    });
    this.chat = chat;
    net.on('sys', m => chat.system(m.text));
    net.on('friends', m => { this.friends = m.list; });
    net.on('kicked', m => { chat.system(m.text); setTimeout(() => location.reload(), 2500); });
    net.on('hit', m => {
      const from = this.players.get(m.from)?.root.position ?? controller.root.position;
      combat.damagePlayer(m.slam ? 2 : 1, from);
    });
    net.on('close', () => chat.system('Disconnected from the server'));

    chat.myId = me.id;
    chat.myName = me.name;
    chat.myRank = this.myRank;
    chat.who = id => {
      if (id === me.id) return { color: colorFor(me.id), face: portraitURL(controller.variant), rank: this.myRank };
      const p = this.players.get(id);
      return p ? { color: colorFor(id), face: portraitURL(p.variant ?? 'classic'), rank: p.rank } : {};
    };
    chat.onMessage = (id, name, text) => this._say(id === me.id ? this.self : this.players.get(id), text);
    chat.onTyping = (id, on) => this._typing(id === me.id ? this.self : this.players.get(id), on);

  }

  _applyRoomPolicy() {
    const policy = roomPolicy(this.room);
    this.combat.remoteTargets = policy.pvp ? () => [...this.players.values()].filter(p => p.rig) : null;
    this.combat.onHitRemote = policy.pvp ? (p, slam) => this.net.send({ t: 'hit', target: p.id, slam }) : null;
    this.combat.noDamage = policy.noDamage;
    document.body.classList.toggle('no-health', policy.noDamage);
    return policy;
  }

  _attachTag(p, color) {
    if (p.tag) this.scene.remove(p.tag);
    p.tag = nameTag(p.name, color, p.rank);
    this.scene.add(p.tag);
  }

  async add(info) {
    if (this.players.has(info.id)) return;
    const p = { id: info.id, name: info.name, variant: info.variant, states: [], root: new THREE.Group(), tagY: 1.75 };
    this.players.set(info.id, p);
    this.onRoster?.();
    this.scene.add(p.root);
    p.rank = info.rank ?? 0;
    p.color = info.color ?? null;
    this._attachTag(p, p.color ?? colorFor(info.id));
    const state = normalizePlayerState(info.state);
    if (state) p.states.push({ t: performance.now(), s: state });
    await this._setVariant(p, info.variant);
    // Web line for this player
    p.web = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), new THREE.MeshStandardMaterial({ roughness: 0.35, emissive: 0x1a1a1a }));
    p.web.visible = false;
    this.scene.add(p.web);
    this._paintWeb(p, info.variant);
  }

  async _setVariant(p, v) {
    if (!p) return;
    p.variant = v;
    suitFace(v);
    const o = parseOutfit(v);
    const rig = dressRig(await new LegoSpidey(rigOpts(o.suit)).load(), o.suit);
    if (!this.players.has(p.id) || p.variant !== v) return;
    if (!heroOf(o.suit)) applyGear(rig, o.gear);
    if (p.rig) p.root.remove(p.rig.root);
    p.rig = rig;
    p.root.add(rig.root);
    // Chams: a flat coloured silhouette drawn on top, switched on only while a wall hides them
    const cham = p.cham = new THREE.MeshBasicMaterial({
      color: colorFor(p.id), transparent: true, opacity: 0.6, depthWrite: false, depthTest: false, visible: false,
    });
    for (const m of rig.meshes) {
      const c = new THREE.Mesh(m.geometry, cham);
      c.renderOrder = 900;
      m.add(c);
    }
    this._paintWeb(p, v);
  }

  /** Match a remote player's web colour to their symbiote suit. */
  _paintWeb(p, v) {
    if (!p.web) return;
    const dark = parseOutfit(v).suit === 'symbiote';
    const mat = p.web.material;
    mat.color.setHex(dark ? 0x111118 : 0xf6f6f2);
    mat.emissive?.setHex(dark ? 0x020205 : 0x1a1a1a);
    mat.roughness = dark ? 0.28 : 0.35;
    mat.metalness = dark ? 0.12 : 0;
    mat.needsUpdate = true;
  }

  /** For the minimap. */
  dots() {
    return [...this.players.values()].map(p => ({ root: p.root, color: colorFor(p.id) }));
  }

  remove(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.scene.remove(p.root, p.tag, p.web);
    if (p.bubble) this.scene.remove(p.bubble);
    this.players.delete(id);
    this.onRoster?.();
  }

  _say(p, text) {
    if (!p) return;
    p.typing = false;
    this._setBubble(p, bubble(text));
    p.bubbleT = 6;
  }

  _typing(p, on) {
    if (!p) return;
    p.typing = on;
    if (on) { p.dots = -1; p.bubbleT = Infinity; } else if (p.bubbleT === Infinity) { p.bubbleT = 0; }
  }

  _setBubble(p, sprite) {
    if (p.bubble) { this.scene.remove(p.bubble); p.bubble.material.map.dispose(); }
    p.bubble = sprite;
    if (sprite) this.scene.add(sprite);
  }

  _placeSprites(p, dt) {
    const camDist = this.camera.position.distanceTo(p.root.position);
    const k = PX * Math.max(1, camDist / 14); // stay readable at range
    const [tw, th] = p.tag.userData.px;
    p.tag.visible = !(p === this.self && window.hero?.dorm);   // in the small dorm your own tag sits in front of the camera
    p.tag.scale.set(tw * k, th * k, 1);
    p.tag.position.copy(p.root.position).setY(p.root.position.y + p.tagY + th * k / 2);
    if (p.typing) {
      const n = Math.floor(this._t * 3) % 3;
      if (n !== p.dots) { p.dots = n; this._setBubble(p, bubble('.'.repeat(n + 1))); }
    }
    if (p.bubble) {
      p.bubbleT -= dt;
      if (p.bubbleT <= 0) { this._setBubble(p, null); return; }
      const [bw, bh] = p.bubble.userData.px;
      p.bubble.scale.set(bw * k, bh * k, 1);
      p.bubble.position.copy(p.tag.position).setY(p.tag.position.y + (th / 2 + bh / 2 + 2) * k);
    }
  }

  /** What we send 15 times a second. */
  _myState() {
    const c = this.controller, p = c.root.position, w = c.webPhysics;
    const r = n => Math.round(n * 100) / 100;
    return {
      p: [r(p.x), r(p.y), r(p.z)], r: r(c.root.rotation.y),
      sp: r(Math.hypot(c.velocity.x, c.velocity.z)), vy: r(c.velocity.y),
      g: c.isGrounded ? 1 : 0, c: c.isClimbing ? 1 : 0, cr: c.isCrouching ? 1 : 0,
      sw: w?.isSwinging ? 1 : 0, wa: w?.handSide ?? -1, wg: w?.isSwinging && w?.twoHandGrip ? 1 : 0,
      a: w?.isSwinging ? (e => [r(e.x), r(e.y), r(e.z)])(w.visualEnd ?? w.anchor) : null,   // where the web visibly sticks
      at: r(c.attackT ?? 0), aa: c.attackArm ?? -1, hide: c.rig?.root.visible === false ? 1 : 0, em: c.emote ?? null,
      tk: c.trick ? [c.trick.type, r(Math.min(1, c.trick.t / c.trick.dur))] : null,
      rp: w?.isSwinging ? c._ropeTilt().map(r) : null,
    };
  }

  /** Is something solid between the camera and this player? */
  _hidden(p) {
    const ray = this._ray ??= Object.assign(new THREE.Raycaster(), { firstHitOnly: true });
    const chest = p.root.position.clone().setY(p.root.position.y + 0.8);
    const dir = chest.clone().sub(this.camera.position);
    const d = dir.length();
    ray.set(this.camera.position, dir.divideScalar(d));
    ray.far = d - 0.6;
    return !!ray.intersectObjects(this.controller.cityMeshes, false)[0];
  }

  update(dt) {
    this._t += dt;
    this._losT = (this._losT ?? 0) - dt;
    if (this._losT <= 0) {
      this._losT = 0.2;
      for (const p of this.players.values()) if (p.cham) p.cham.visible = this._hidden(p);
    }
    this._sendT -= dt;
    if (this._sendT <= 0) {
      this._sendT = 1 / SEND_HZ;
      this.net.send({ t: 'state', s: this._myState() });
    }
    this._placeSprites(this.self, dt);

    const renderT = performance.now() - INTERP_DELAY;
    for (const p of this.players.values()) {
      const st = p.states;
      while (st.length > 2 && st[1].t <= renderT) st.shift();
      if (st.length) {
        const a = st[0], b = st[1] ?? st[0];
        const f = b.t > a.t ? Math.min(1, Math.max(0, (renderT - a.t) / (b.t - a.t))) : 1;
        const s = b.s;
        p.root.position.set(
          a.s.p[0] + (b.s.p[0] - a.s.p[0]) * f,
          a.s.p[1] + (b.s.p[1] - a.s.p[1]) * f,
          a.s.p[2] + (b.s.p[2] - a.s.p[2]) * f);
        let dr = b.s.r - a.s.r;
        dr = Math.atan2(Math.sin(dr), Math.cos(dr));
        p.root.rotation.y = a.s.r + dr * f;
        p.root.visible = !s.hide && !p._blocked;
        const twoHandGrip = !!s.sw && !!s.wg;
        const socialEmote = p.socialEmote?.until > performance.now() ? p.socialEmote.key : null;
        p.rig?.update(dt, {
          speed: s.sp, vy: s.vy, grounded: !!s.g, climbing: !!s.c, climbMove: s.sp > 0.1 || s.c ? 1 : 0,
          crouch: !!s.cr, swinging: !!s.sw, twoHandGrip, webArm: s.wa, attack: s.at, attackArm: s.aa, emote: socialEmote ?? s.em,
          trick: s.tk ? { type: s.tk[0], p: s.tk[1] } : null, rope: s.rp,
        });
        poseWaldoGrip(p.rig, dt, twoHandGrip);
        // Their sounds come from replicated state changes, played locally at their position (no audio over the network)
        const sfx = window.gameSfx;
        if (sfx && p._sndInit) {
          if (s.sw && !p._sndSw) sfx.play('thwip', { pos: p.root.position, key: p.id, vol: 0.8 });
          if (!s.sw && p._sndSw) sfx.play('release', { pos: p.root.position, key: p.id, vol: 0.7 });
          if (s.g && !p._sndG && (p._sndVy ?? 0) < -9) sfx.play('land', { pos: p.root.position, key: p.id, vol: 0.8 });
          if (s.at && !p._sndAt) sfx.play('swing', { pos: p.root.position, key: p.id, vol: 0.7 });
        }
        p._sndInit = true; p._sndSw = !!s.sw; p._sndG = !!s.g; p._sndAt = !!s.at; p._sndVy = s.vy;
        // Web rope from their hand to the anchor
        if (s.sw && s.a && p.rig) {
          p.root.updateMatrixWorld(true);
          const hand = p.rig.handWorld(p._webHand ??= new THREE.Vector3(), s.wa);
          const anchor = new THREE.Vector3(...s.a);
          const len = hand.distanceTo(anchor);
          p.web.position.copy(hand).add(anchor).multiplyScalar(0.5);
          p.web.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), anchor.clone().sub(hand).normalize());
          p.web.scale.set(1, len, 1);
          p.web.visible = true;
        } else {
          p.web.visible = false;
        }
      }
      p.tag.visible = !p._blocked;
      if (p.bubble) p.bubble.visible = !p._blocked;
      this._placeSprites(p, dt);
    }
  }

  /** Moved to another room (Join Friend) without reloading the game. */
  switchRoom(joined) {
    for (const id of [...this.players.keys()]) this.remove(id);
    this.room = joined.room;
    this.myRank = joined.rank ?? 0;
    this.self.rank = this.myRank;
    this.chat.myRank = this.myRank;
    this._attachTag(this.self, colorFor(this.me.id));
    this.hostId = joined.host ?? null;
    this._applyRoomPolicy();
    document.dispatchEvent(new CustomEvent('roomchange', { detail: this.room }));
    for (const p of joined.players) this.add(p);
    this.chat.system(`Joined ${joined.room.name}`);
  }
}
