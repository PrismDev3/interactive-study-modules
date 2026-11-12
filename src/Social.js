/**
 * Social.js — client for the server social layer (server/social.js):
 *  - Friends panel (U): friends with presence, requests in/out, blocked list, add by name
 *  - Direct messages with history, unread counts, images (validated server-side)
 *  - Top-centre message / request notifications (max 3 stacked, click to open)
 *  - In-world player targeting: outline on hover (or crosshair while mouse-locked),
 *    click / Y opens a player card with their minifig, name and Friend / Block / Mute.
 * Nothing here is local-only: every button sends a server message and the UI redraws
 * from the snapshot the server pushes back.
 */
import * as THREE from 'three';
import { portraitURL } from './Portrait.js?v=217';
import { isTypingTarget, overlayOpen, closeOverlays, restoreGameFocus } from './Input.js?v=2';
import { appendRoleBadge } from './RoleBadge.js?v=1';
import { wallet } from './Outfit.js?v=65';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const low = s => String(s ?? '').toLowerCase();
const timeOf = ts => {
  const d = new Date(ts), now = new Date();
  const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === now.toDateString() ? hm : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${hm}`;
};
const IMG_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const IMG_MAX = 600 * 1024;

// ─── Soft UI audio (synth, quiet, never spammed) ──────────────────────────────
let actx = null, lastBlip = 0;
function blip(kind = 'tap') {
  const now = performance.now();
  if (now - lastBlip < 70) return;
  lastBlip = now;
  try {
    actx ??= new AudioContext();
    const vol = Number(localStorage.getItem('sfxVol') ?? 1);
    const notes = { tap: [880], open: [660, 990], msg: [784, 1175], req: [523, 784, 1047], err: [330, 247] }[kind] ?? [880];
    notes.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.07;
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.06 * vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(actx.destination);
      o.start(t); o.stop(t + 0.18);
    });
  } catch {}
}

// ─── Outline: inverted hull extruded in view space (constant on-screen width) ─────
const OUTLINE_MAT = new THREE.ShaderMaterial({
  uniforms: { color: { value: new THREE.Color(0xf5c518) }, width: { value: 0.008 } },
  vertexShader: `uniform float width;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vec3 n = normalize(normalMatrix * normal);
      mv.xyz += n * width * max(1.0, -mv.z);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); }`,
  side: THREE.BackSide,
});

export class Social {
  constructor(net) {
    this.net = net;
    this.state = { friends: [], reqIn: [], reqOut: [], blocked: [], muted: [], unread: {}, groups: [] };
    this.conv = null;            // name of the open DM, or `g:<id>` for a group
    this.convKind = 'dm';
    this.convName = '';
    this.msgs = new Map();       // lower name -> messages
    this.imageReports = [];
    this.reportPage = 0;
    this.isOwner = false;
    this.mp = null; this.chat = null; this.controller = null; this.camera = null;
    this.onJoined = null;        // set by the menu / game to handle a 'joined' from Join Friend
    this._build();

    net.on('social', m => {
      this.state = m;
      if (this.isOpen && this.conv) delete this.state.unread[low(this.conv)];   // reading it right now
      this._sync();
    });
    net.on('socialNote', m => { this.toast({ title: m.text, kind: 'req', open: () => this.open('requests') }); });
    net.on('socialErr', m => { this._flash(m.text); blip('err'); });
    net.on('auth', m => {
      if (!m.ok) return;
      this.me = m.name;
      this.isOwner = !!m.ownerBadge;
      this.panel.querySelector('[data-tab="reports"]').hidden = !this.isOwner;
      this.fab.hidden = false;
    });
    net.on('reportImageAck', m => {
      const button = this.msgsEl.querySelector(`.soc-img-report[data-id="${CSS.escape(m.id)}"]`);
      if (button) { button.dataset.state = 'reported'; button.textContent = 'REPORTED'; button.disabled = true; }
      this._flash(m.duplicate ? 'You already reported this image' : 'Image sent to the owner for review');
    });
    net.on('imageReports', m => {
      this.imageReports = Array.isArray(m.reports) ? m.reports : [];
      this.reportPage = 0;
      if (this.isOpen && !this.conv && this.tab === 'reports') this._renderList();
    });
    net.on('imagePurged', m => {
      this.imageReports = this.imageReports.filter(r => r.img !== m.img);
      this._flash(`Image purged; removed from ${m.removed} message${m.removed === 1 ? '' : 's'}`);
      if (this.isOpen && !this.conv && this.tab === 'reports') this._renderList();
    });
    net.on('imageRemoved', m => {
      let changed = false;
      for (const [key, list] of this.msgs) {
        const kept = list.filter(message => message.img !== m.img);
        if (kept.length !== list.length) { this.msgs.set(key, kept); changed = true; }
      }
      if (changed && this.conv && this.convKind === 'dm' && this.isOpen) this._renderConv(true);
    });
    net.on('dm', m => this._onDm(m));
    net.on('gdm', m => this._onGdm(m));
    net.on('groupHistory', m => {
      const key = low(`g:${m.id}`);
      this.msgs.set(key, m.msgs);
      if (this.conv === key) { this.canSend = true; this._renderConv(true); }
      this.net.send({ t: 'groupRead', id: m.id });
    });
    net.on('dmHistory', m => {
      this.msgs.set(low(m.with), m.msgs);
      if (this.state.unread?.[low(m.with)]) { this.state.unread = { ...this.state.unread }; delete this.state.unread[low(m.with)]; this._sync(); }
      if (low(this.conv) === low(m.with)) { this.canSend = m.canSend; this._renderConv(true); }
    });
    net.on('close', () => { this.fab.hidden = true; this.close(); });
  }

  /** Called once the online game is running. */
  attachGame({ mp, chat, controller, camera, canvas, onJoined }) {
    Object.assign(this, { mp, chat, controller, camera, canvas });
    this.onJoined = onJoined;
    // Keep the Room tab live while people join or leave the lobby.
    mp.onRoster = () => {
      if (this.isOpen && !this.conv && this.tab === 'room') this._renderList();
    };
    // Mutes come from the server so they follow the account to any device
    if (chat) {
      chat.isMuted = n => this.isMuted(n);
      chat.setMuted = (n, on) => this.net.send({ t: 'mute', name: n, on });
      const typing = chat.onTyping;
      chat.onTyping = (id, on) => { const p = mp.players.get(id); if (!p || !this.isMuted(p.name)) typing?.(id, on); };
    }
    this._sync();
    this._bindPicker();
  }

  isFriend(n) { return this.state.friends.some(f => low(f.name) === low(n)); }
  isBlocked(n) { return this.state.blocked.some(x => low(x) === low(n)); }
  isMuted(n) { return this.state.muted.some(x => low(x) === low(n)); }
  sentReq(n) { return this.state.reqOut.some(x => low(x) === low(n)); }
  gotReq(n) { return this.state.reqIn.some(x => low(x) === low(n)); }

  // ─── DOM ─────────────────────────────────────────────────────────────────
  _build() {
    // Launcher button (bottom-left, above chat) + unread badge
    this.fab = el('button', 'soc-fab');
    this.fab.hidden = true;
    this.fab.title = 'Friends (U)';
    this.fab.innerHTML = '<kbd>U</kbd><span class="soc-fab-lbl">Friends</span><b class="soc-badge" hidden></b>';
    this.fab.onclick = () => this.toggle();
    document.body.append(this.fab);

    // Toast stack (top centre)
    this.toasts = el('div', 'soc-toasts');
    document.body.append(this.toasts);

    // Panel
    const p = this.panel = el('div', 'soc-panel');
    p.innerHTML = `
      <div class="soc-head">
        <div class="soc-title">Friends</div>
        <div class="soc-tabs">
          <button data-tab="friends">Friends</button>
          <button data-tab="groups">Groups</button>
          <button data-tab="room">Room</button>
          <button data-tab="requests">Requests <b class="soc-badge" hidden></b></button>
          <button data-tab="blocked">Blocked</button>
          <button data-tab="reports" hidden>Image reports</button>
        </div>
        <button class="soc-x" title="Close (Esc)"><kbd>Esc</kbd> Back</button>
      </div>
      <div class="soc-body">
        <div class="soc-list"></div>
        <div class="soc-conv" hidden>
          <div class="soc-conv-head"><button class="soc-back">‹</button><img class="soc-face"><div><div class="soc-conv-name"></div><div class="soc-conv-sub"></div></div></div>
          <div class="soc-msgs"></div>
          <div class="soc-preview" hidden><img><span></span><button>✕</button></div>
          <form class="soc-compose">
            <label class="soc-attach" title="Send an image (PNG, JPEG, GIF, WebP · max 600 KB)">+<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden></label>
            <input class="soc-input" maxlength="500" placeholder="Message…" autocomplete="off">
            <button class="soc-send" type="submit">SEND</button>
          </form>
        </div>
      </div>
      <div class="soc-flash" hidden></div>`;
    document.body.append(p);
    const $ = s => p.querySelector(s);
    this.listEl = $('.soc-list'); this.convEl = $('.soc-conv'); this.msgsEl = $('.soc-msgs');
    this.input = $('.soc-input'); this.flashEl = $('.soc-flash');
    $('.soc-x').onclick = () => this.close();
    $('.soc-back').onclick = () => this.showList();
    p.querySelectorAll('[data-tab]').forEach(b => (b.onclick = () => { blip('tap'); this.tab = b.dataset.tab; this.showList(); }));
    $('.soc-compose').onsubmit = e => { e.preventDefault(); this._send(); };
    const file = $('.soc-attach input');
    file.onchange = () => { this._pickImage(file.files[0]); file.value = ''; };
    $('.soc-preview button').onclick = () => this._clearImage();
    // Keys typed in the panel never reach the game (movement, chat hotkeys)
    p.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') this.close(); });
    p.addEventListener('keyup', e => e.stopPropagation());

    // Player card (in-world interaction)
    const card = this.card = el('div', 'soc-card');
    card.innerHTML = `<div class="soc-card-fig"><img></div>
      <div class="soc-card-side"><div class="soc-card-name"></div><div class="soc-card-rel"></div>
      <div class="soc-card-emotes"><button data-e="wave">WAVE</button><button data-e="highfive" title="Get within 5 m to high-five">HIGH-FIVE</button></div>
      <button class="soc-gift-open" type="button">GIFT STUDS</button>
      <form class="soc-gift" hidden>
        <input class="soc-gift-amt" type="number" min="1" max="100000" step="1" inputmode="numeric" placeholder="Amount" aria-label="Studs to gift">
        <button class="soc-gift-send" type="submit">SEND</button>
        <button class="soc-gift-x" type="button" title="Cancel">✕</button>
      </form>
      <div class="soc-gift-msg" hidden></div>
      <div class="soc-card-btns"><button data-a="friend"></button><button data-a="block"></button><button data-a="mute"></button></div></div>`;
    card.addEventListener('pointerdown', e => e.stopPropagation());
    card.querySelectorAll('[data-a]').forEach(b => (b.onclick = () => this._cardAction(b.dataset.a)));
    card.querySelectorAll('[data-e]').forEach(b => (b.onclick = () => this._cardEmote(b.dataset.e)));
    card.querySelector('.soc-gift-open').onclick = () => this._openGift();
    card.querySelector('.soc-gift-x').onclick = () => this._closeGift();
    card.querySelector('.soc-gift').onsubmit = e => { e.preventDefault(); this._sendGift(); };
    this.net.on('giftResult', m => this._onGiftResult(m));
    this.net.on('giftReceived', m => {
      this.toast({ title: `${m.from} sent you studs`, body: `+${Number(m.amount).toLocaleString()} studs`, kind: 'req' });
    });
    document.body.append(card);

    document.addEventListener('keydown', e => {
      // Escape always leaves Friends, even when focus is on a row/button rather than the box
      if (e.code === 'Escape' && this.isOpen) { e.preventDefault(); this.close(); return; }
      if (e.code === 'Escape' && this.card.classList.contains('show')) { this.closeCard(); return; }
      // Typing while a conversation is open always goes to the message box
      if (this.isOpen && this.conv && !this.input.disabled && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.target.closest?.('input, textarea')) {
        this.input.focus(); e.stopPropagation(); return;
      }
      if (isTypingTarget(e) || !this.me) return;
      if (overlayOpen(['.soc-panel.show'])) return;   // pause / admin / emotes own the keyboard
      if (e.code === 'KeyU' && !e.repeat) { e.preventDefault(); this.toggle(); }
      if (e.code === 'KeyY' && !e.repeat && this.hover) this.openCard(this.hover);
    });
    document.addEventListener('close-overlays', () => { if (this.isOpen) this.close(); this.closeCard(); });
    document.addEventListener('pointerdown', e => { if (!this.card.contains(e.target)) this.closeCard(); });
  }

  // ─── Panel ───────────────────────────────────────────────────────────────
  get isOpen() { return this.panel.classList.contains('show'); }
  toggle() { this.isOpen ? this.close() : this.open(); }
  open(tab, conv) {
    if (!this.me) return;
    closeOverlays();                    // only one social panel at a time
    this.closeCard();
    if (document.pointerLockElement) document.exitPointerLock();
    if (this.controller) { this._prevLock = this.controller.inputLocked; this.controller.inputLocked = true; }
    this.panel.classList.add('show');
    blip('open');
    this.net.send({ t: 'social' });
    if (this.isOwner) this.net.send({ t: 'imageReports' });
    if (conv && String(conv).startsWith('g:')) {
      const g = (this.state.groups ?? []).find(x => `g:${x.id}` === String(conv));
      if (g) this.openGroup(g); else { this.tab = 'groups'; this.showList(); }
    } else if (conv) this.openConv(conv);
    else { this.tab = tab ?? this.tab ?? 'friends'; this.showList(); }
  }
  close() {
    if (!this.isOpen) return;
    this.panel.classList.remove('show');
    this.conv = null;
    if (this.controller) this.controller.inputLocked = !!this._prevLock;
    restoreGameFocus();
  }

  showList() {
    this.conv = null;
    this.convKind = 'dm';
    this.convName = '';
    this.convEl.hidden = true; this.listEl.hidden = false;
    this.panel.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === this.tab));
    this._renderList();
  }

  _row(name, sub, variant, dot, rank = 0) {
    const r = el('div', 'soc-row');
    const face = el('img', 'soc-face');
    portraitURL(variant ?? 'classic').then(u => { if (u) face.src = u; });
    const info = el('div', 'soc-info');
    const nm = el('div', 'soc-name', name);
    appendRoleBadge(nm, rank, 'soc-role-badge');
    if (dot != null) nm.prepend(el('i', `soc-dot ${dot ? 'on' : ''}`));
    info.append(nm, el('div', 'soc-sub', sub));
    const acts = el('div', 'soc-acts');
    r.append(face, info, acts);
    return [r, acts];
  }
  _btn(label, fn, cls = '') {
    const b = el('button', `soc-btn ${cls}`, label);
    b.onclick = e => { e.stopPropagation(); blip('tap'); fn(b); };
    return b;
  }

  _renderList() {
    const L = this.listEl; L.textContent = '';
    const s = this.state;
    if (this.tab === 'friends') {
      const add = el('form', 'soc-add');
      add.innerHTML = '<input placeholder="Add a friend by username" maxlength="16"><button class="soc-btn yes">ADD</button>';
      add.onsubmit = e => {
        e.preventDefault();
        const v = add.querySelector('input').value.trim();
        if (!/^[A-Za-z0-9_]{3,16}$/.test(v)) return this._flash('Usernames are 3-16 letters, numbers or _');
        this.net.send({ t: 'friendReq', name: v });
        add.querySelector('input').value = '';
        this._flash(`Friend request sent to ${v}`);
      };
      L.append(add);
      if (!s.friends.length) L.append(el('div', 'soc-empty', 'No friends yet. Click another Spider-Man in the world, or add one by name.'));
      for (const f of s.friends) {
        const unread = s.unread?.[low(f.name)] ?? 0;
        const [r, acts] = this._row(f.name, f.activity, f.variant, f.online, f.rank);
        if (unread) r.querySelector('.soc-name').append(el('b', 'soc-badge', String(unread)));
        const joinable = f.online && f.room && !f.room.locked && f.room.players < f.room.max && f.room.id !== this.mp?.room?.id;
        const why = !f.online ? 'Offline' : !f.room ? 'Not in a room' : f.room.locked ? 'Room is locked' : f.room.players >= f.room.max ? 'Room is full' : f.room.id === this.mp?.room?.id ? "You're in the same room" : '';
        const jb = this._btn('JOIN', b => this.joinFriend(f.name, b), 'yes');
        jb.disabled = !joinable; jb.title = why || `Join ${f.room.name} (${f.room.players}/${f.room.max})`;
        acts.append(jb, this._btn('CHAT', () => this.openConv(f.name)), this._btn('✕', () => this._confirm(`Remove ${f.name} from friends?`, () => this.net.send({ t: 'unfriend', name: f.name })), 'no'));
        r.onclick = () => this.openConv(f.name);
        L.append(r);
      }
    } else if (this.tab === 'groups') {
      const wrap = el('div', 'soc-gcreate');
      const add = el('form', 'soc-add');
      add.innerHTML = '<input placeholder="New group name" maxlength="28" aria-label="Group name"><button class="soc-btn yes" type="submit">CREATE</button>';
      const chips = el('div', 'soc-chips');
      const chosen = new Set();
      if (!s.friends.length) chips.append(el('div', 'soc-empty', 'Add a friend first, then start a group with them.'));
      for (const f of s.friends) {
        const chip = el('label', 'soc-chip');
        const cb = el('input'); cb.type = 'checkbox'; cb.value = f.name;
        cb.onchange = () => { if (cb.checked) chosen.add(f.name); else chosen.delete(f.name); chip.classList.toggle('on', cb.checked); };
        chip.append(cb, el('span', null, f.name));
        chips.append(chip);
      }
      add.onsubmit = e => {
        e.preventDefault();
        if (!chosen.size) return this._flash('Pick at least one friend for the group');
        const name = add.querySelector('input').value.trim();
        this.net.send({ t: 'groupCreate', name: name || 'New group', members: [...chosen] });
        add.querySelector('input').value = '';
        chosen.clear();
        chips.querySelectorAll('input').forEach(i => { i.checked = false; i.closest('.soc-chip')?.classList.remove('on'); });
        this._flash('Creating group…', true);
      };
      wrap.append(el('div', 'soc-sec', 'New group'), add, chips);
      L.append(wrap);
      L.append(el('div', 'soc-sec', `Your groups (${(s.groups ?? []).length})`));
      if (!(s.groups ?? []).length) L.append(el('div', 'soc-empty', 'No groups yet. Name one above, tick the friends to invite, then create it.'));
      for (const g of s.groups ?? []) {
        const r = el('div', 'soc-row');
        const face = el('div', 'soc-gface', g.name.slice(0, 2).toUpperCase());
        const info = el('div', 'soc-info');
        const nm = el('div', 'soc-name', g.name);
        if (g.unread) nm.append(el('b', 'soc-badge', String(g.unread)));
        info.append(nm, el('div', 'soc-sub', `${g.count} member${g.count === 1 ? '' : 's'}${g.owner ? ' · you started it' : ''}`));
        const acts = el('div', 'soc-acts');
        acts.append(this._btn('OPEN', () => this.openGroup(g), 'yes'),
          this._btn('LEAVE', () => this._confirm(`Leave ${g.name}?`, () => this.net.send({ t: 'groupLeave', id: g.id })), 'no'));
        r.append(face, info, acts);
        r.onclick = () => this.openGroup(g);
        L.append(r);
      }
    } else if (this.tab === 'room') {
      if (!this.mp) {
        L.append(el('div', 'soc-empty', 'Join an online room to see everyone here.'));
        return;
      }
      const other = [...this.mp.players.values()];
      const people = this.mp.me
        ? [{ self: true, id: this.mp.me.id, name: this.mp.me.name, variant: this.controller?.variant, rank: this.mp.myRank }, ...other]
        : other;
      L.append(el('div', 'soc-sec', `In this room · ${people.length}`));
      if (!other.length) L.append(el('div', 'soc-empty', "You're the only person in this room right now. Invite a friend from the Friends tab."));
      for (const p of people) {
        const rank = Number(p.rank) || 0;
        const sub = p.self ? `You${rank === 1 ? ' · MOD' : ''}` : (rank === 1 ? 'MOD · in this room' : 'In this room');
        const [r, acts] = this._row(p.name, sub, p.variant, null, rank);
        if (p.self) {
          acts.append(el('span', 'soc-you', 'YOU'));
        } else if (this.isBlocked(p.name)) {
          acts.append(el('span', 'soc-sub', 'BLOCKED'));
        } else if (this.isFriend(p.name)) {
          acts.append(this._btn('CHAT', () => this.openConv(p.name), 'yes'));
          r.onclick = () => this.openConv(p.name);
        } else if (this.gotReq(p.name)) {
          acts.append(this._btn('ACCEPT', () => this.net.send({ t: 'friendAccept', name: p.name }), 'yes'));
        } else if (this.sentReq(p.name)) {
          const pending = this._btn('REQUESTED', () => {}, 'no');
          pending.disabled = true;
          acts.append(pending);
        } else {
          acts.append(this._btn('ADD FRIEND', () => {
            this.net.send({ t: 'friendReq', name: p.name });
            this._flash(`Friend request sent to ${p.name}`);
          }, 'yes'));
        }
        L.append(r);
      }
    } else if (this.tab === 'requests') {
      L.append(el('div', 'soc-sec', `Incoming (${s.reqIn.length})`));
      if (!s.reqIn.length) L.append(el('div', 'soc-empty', 'No incoming requests.'));
      for (const n of s.reqIn) {
        const [r, acts] = this._row(n, 'Wants to be friends');
        acts.append(this._btn('ACCEPT', () => this.net.send({ t: 'friendAccept', name: n }), 'yes'), this._btn('DECLINE', () => this.net.send({ t: 'friendDecline', name: n }), 'no'));
        L.append(r);
      }
      L.append(el('div', 'soc-sec', `Sent (${s.reqOut.length})`));
      if (!s.reqOut.length) L.append(el('div', 'soc-empty', 'No pending requests.'));
      for (const n of s.reqOut) {
        const [r, acts] = this._row(n, 'Request pending');
        acts.append(this._btn('CANCEL', () => this.net.send({ t: 'friendCancel', name: n }), 'no'));
        L.append(r);
      }
    } else if (this.tab === 'reports') {
      if (!this.isOwner) { this.tab = 'friends'; return this._renderList(); }
      const unique = new Map();
      for (const report of this.imageReports) {
        const row = unique.get(report.img) ?? [];
        row.push(report);
        unique.set(report.img, row);
      }
      const entries = [...unique];
      const pageSize = 24, pages = Math.max(1, Math.ceil(entries.length / pageSize));
      this.reportPage = Math.min(this.reportPage, pages - 1);
      L.append(el('div', 'soc-sec', `Reported images (${unique.size})`));
      if (!unique.size) L.append(el('div', 'soc-empty', 'No images are waiting for review.'));
      else if (unique.size > pageSize) L.append(el('div', 'soc-report-sub', `Showing ${this.reportPage * pageSize + 1}–${Math.min(unique.size, (this.reportPage + 1) * pageSize)} of ${unique.size}`));
      for (const [img, reports] of entries.slice(this.reportPage * pageSize, (this.reportPage + 1) * pageSize)) {
        const card = el('div', 'soc-report');
        const preview = el('img', 'soc-report-img');
        preview.alt = 'Reported direct-message image';
        preview.title = 'Open full-size image';
        preview.src = img;
        preview.onclick = () => window.open(img, '_blank', 'noopener');
        preview.onerror = () => { preview.replaceWith(el('div', 'soc-imgfail', 'Image unavailable')); };
        const details = el('div', 'soc-report-details');
        details.append(
          el('div', 'soc-report-title', `${reports.length} report${reports.length === 1 ? '' : 's'} · sent by ${reports[0].sender}`),
          el('div', 'soc-report-sub', `Reported by ${[...new Set(reports.map(r => r.reporter))].join(', ')}`),
          el('div', 'soc-report-sub', timeOf(reports[0].ts)),
        );
        const purge = this._btn('PURGE', () => this._confirm('Permanently remove this image and every message containing it?', () => this.net.send({ t: 'purgeImage', id: reports[0].id }), 'no'), 'no');
        card.append(preview, details, purge);
        L.append(card);
      }
      if (pages > 1) {
        const pagesRow = el('div', 'soc-report-pages');
        const prev = this._btn('PREVIOUS', () => { this.reportPage--; this._renderList(); });
        const next = this._btn('NEXT', () => { this.reportPage++; this._renderList(); });
        prev.disabled = this.reportPage === 0;
        next.disabled = this.reportPage >= pages - 1;
        pagesRow.append(prev, el('span', 'soc-report-sub', `Page ${this.reportPage + 1}/${pages}`), next);
        L.append(pagesRow);
      }
    } else {
      if (!s.blocked.length) L.append(el('div', 'soc-empty', "You haven't blocked anyone. Blocked players can't message you, add you or appear in your chat."));
      for (const n of s.blocked) {
        const [r, acts] = this._row(n, 'Blocked');
        acts.append(this._btn('UNBLOCK', () => this.net.send({ t: 'block', name: n, on: false })));
        L.append(r);
      }
      if (s.muted.length) {
        L.append(el('div', 'soc-sec', 'Muted'));
        for (const n of s.muted) {
          const [r, acts] = this._row(n, 'Muted: chat and bubbles hidden');
          acts.append(this._btn('UNMUTE', () => this.net.send({ t: 'mute', name: n, on: false })));
          L.append(r);
        }
      }
    }
  }

  _confirm(text, yes) {
    const c = el('div', 'soc-confirm');
    c.append(el('div', '', text), this._btn('YES', () => { c.remove(); yes(); }, 'no'), this._btn('NO', () => c.remove()));
    this.panel.append(c);
  }

  async joinFriend(name, btn) {
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    this._flash(`Joining ${name}…`, true);
    const r = await this.net.request({ t: 'joinFriend', name }, ['joined', 'error']);
    if (r.t === 'error') { this._flash(r.err); blip('err'); if (btn) { btn.disabled = false; btn.textContent = 'JOIN'; } return; }
    this.close();
    this.onJoined?.(r);
  }

  // ─── Conversation ────────────────────────────────────────────────────────
  openConv(name) {
    this.convKind = 'dm';
    this.convName = name;
    this.conv = name;
    this.listEl.hidden = true; this.convEl.hidden = false;
    const f = this.state.friends.find(x => low(x.name) === low(name));
    this.convEl.querySelector('.soc-conv-name').textContent = name;
    this.convEl.querySelector('.soc-conv-sub').textContent = f ? f.activity : '';
    const face = this.convEl.querySelector('.soc-face');
    face.removeAttribute('src');
    face.style.visibility = '';
    this.convEl.querySelector('.soc-conv-head').classList.remove('grp');
    portraitURL(f?.variant ?? 'classic').then(u => { if (u && this.conv === name) face.src = u; });
    this.canSend = !!f;
    this._renderConv(true);
    this.net.send({ t: 'dmHistory', name });
    if (this.state.unread?.[low(name)]) { delete this.state.unread[low(name)]; this._sync(); }
    for (const ms of [30, 200]) setTimeout(() => { if (this.conv === name) this.input.focus(); }, ms);
  }

  openGroup(g) {
    if (!g) return;
    this.convKind = 'group';
    this.conv = `g:${g.id}`;
    this.convName = g.name;
    this.listEl.hidden = true; this.convEl.hidden = false;
    this.convEl.querySelector('.soc-conv-name').textContent = g.name;
    this.convEl.querySelector('.soc-conv-sub').textContent = `${g.count} member${g.count === 1 ? '' : 's'}`;
    const face = this.convEl.querySelector('.soc-face');
    face.removeAttribute('src');
    face.style.visibility = 'hidden';
    this.convEl.querySelector('.soc-conv-head').classList.add('grp');
    this.canSend = true;
    this._renderConv(true);
    this.net.send({ t: 'groupHistory', id: g.id });
    for (const ms of [30, 200]) setTimeout(() => { if (this.conv === `g:${g.id}`) this.input.focus(); }, ms);
  }

  _renderConv(scroll) {
    const list = this.msgs.get(low(this.conv)) ?? [];
    const M = this.msgsEl;
    const atBottom = M.scrollHeight - M.scrollTop - M.clientHeight < 40;
    M.textContent = '';
    if (!list.length) M.append(el('div', 'soc-empty', `Say hi to ${this.conv}!`));
    let lastDay = '';
    for (const m of list) {
      const day = new Date(m.ts).toDateString();
      if (day !== lastDay) { lastDay = day; M.append(el('div', 'soc-day', new Date(m.ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }))); }
      const mine = low(m.f) === low(this.me);
      const b = el('div', `soc-msg ${mine ? 'me' : ''}`);
      if (this.convKind === 'group' && !mine && m.f) b.append(el('div', 'soc-from', m.f));
      if (m.img) {
        const img = el('img', 'soc-img loading');
        img.alt = 'Image';
        img.onload = () => { img.classList.remove('loading'); if (atBottom || scroll) M.scrollTop = M.scrollHeight; };
        img.onerror = () => { img.replaceWith(el('div', 'soc-imgfail', 'Image unavailable')); };
        img.src = m.img;   // server-generated /u/<random>.<ext> path only
        img.onclick = () => window.open(m.img, '_blank', 'noopener');
        const frame = el('div', 'soc-img-wrap');
        frame.append(img);
        if (!mine && this.convKind === 'dm') {
          const report = el('button', 'soc-img-report', 'REPORT');
          report.title = 'Report this image to the game owner';
          report.onclick = e => {
            e.stopPropagation();
            this.net.send({ t: 'reportImage', name: this.conv, id: m.id, img: m.img });
            report.disabled = true;
            report.dataset.id = m.id;
            report.dataset.state = 'pending';
            report.textContent = 'SENDING…';
            setTimeout(() => {
              if (report.dataset.state === 'pending') { report.disabled = false; report.textContent = 'REPORT'; }
            }, 4000);
            blip('tap');
          };
          frame.append(report);
        }
        b.append(frame);
      }
      if (m.x) b.append(el('div', 'soc-text', m.x));
      b.append(el('div', 'soc-time', timeOf(m.ts)));
      M.append(b);
    }
    if (scroll || atBottom) M.scrollTop = M.scrollHeight;
    const compose = this.convEl.querySelector('.soc-compose');
    compose.classList.toggle('off', !this.canSend);
    this.input.disabled = !this.canSend;
    this.input.placeholder = this.canSend ? `Message ${this.convName || this.conv}…` : 'You can only message friends';
    const attach = this.convEl.querySelector('.soc-attach');
    if (attach) attach.style.display = this.convKind === 'group' ? 'none' : '';
  }

  _send() {
    if (this.convKind === 'group') {
      const text = this.input.value.trim();
      if (!text) return;
      this.net.send({ t: 'groupMsg', id: this.conv.slice(2), text });
      this.input.value = '';
      blip('tap');
      return;
    }
    const text = this.input.value.trim();
    if (this.pending) {
      const { data } = this.pending;
      this.net.send({ t: 'dmImg', to: this.conv, data, text });
      this._clearImage();
      this._flash('Sending image…', true);
    } else if (text) {
      this.net.send({ t: 'dm', to: this.conv, text });
    } else return;
    this.input.value = '';
    blip('tap');
  }

  _pickImage(file) {
    if (!file) return;
    if (!IMG_TYPES.includes(file.type)) return this._flash('Only PNG, JPEG, GIF or WebP images');
    if (file.size > IMG_MAX) return this._flash('Image is too large (max 600 KB)');
    const rd = new FileReader();
    rd.onload = () => {
      const url = String(rd.result);
      this.pending = { data: url.slice(url.indexOf(',') + 1) };
      const pv = this.convEl.querySelector('.soc-preview');
      pv.hidden = false;
      pv.querySelector('img').src = url;
      pv.querySelector('span').textContent = `${file.name} · ${Math.round(file.size / 1024)} KB`;
      this.input.focus();
    };
    rd.onerror = () => this._flash('Could not read that file');
    rd.readAsDataURL(file);
  }
  _clearImage() { this.pending = null; this.convEl.querySelector('.soc-preview').hidden = true; }

  _onDm(m) {
    const key = low(m.with);
    const list = this.msgs.get(key) ?? [];
    list.push(m.msg);
    this.msgs.set(key, list);
    const mine = low(m.msg.f) === low(this.me);
    if (this.isOpen && low(this.conv) === key) {
      this._renderConv(mine);
      if (!mine) this.net.send({ t: 'dmRead', name: m.with });
      if (m.msg.img && mine) this._flash('');
      return;
    }
    if (mine) return;
    this.state.unread = { ...this.state.unread, [key]: (this.state.unread?.[key] ?? 0) + 1 };
    this._sync();
    this.toast({ title: m.from, body: m.msg.img ? 'Sent a photo' + (m.msg.x ? `: ${m.msg.x}` : '') : m.msg.x, kind: 'msg', key, open: () => this.open(null, m.from) });
  }

  _onGdm(m) {
    const key = low(`g:${m.id}`);
    const list = this.msgs.get(key) ?? [];
    list.push(m.msg);
    this.msgs.set(key, list);
    const mine = low(m.msg.f) === low(this.me);
    if (this.isOpen && low(this.conv) === key) {
      this._renderConv(mine);
      if (!mine) this.net.send({ t: 'groupRead', id: m.id });
      return;
    }
    if (mine) return;
    this.state.unread = { ...this.state.unread, [key]: (this.state.unread?.[key] ?? 0) + 1 };
    this._sync();
    this.toast({ title: m.name, body: `${m.from}: ${m.msg.x ?? 'Sent a photo'}`, kind: 'msg', key, open: () => this.open(null, key) });
  }

  // ─── Notifications (top centre) ──────────────────────────────────────────
  toast({ title, body, kind = 'msg', key, open }) {
    // One toast per sender: a new message updates it instead of stacking
    let t = key && this.toasts.querySelector(`[data-key="${CSS.escape(key)}"]`);
    if (t) { t.querySelector('.soc-toast-body').textContent = body ?? ''; const c = t.querySelector('.soc-toast-count'); c.textContent = String((Number(c.textContent) || 1) + 1); c.hidden = false; }
    else {
      t = el('div', `soc-toast ${kind}`);
      if (key) t.dataset.key = key;
      t.innerHTML = `<img class="soc-toast-ico" alt=""><div class="soc-toast-txt"><div class="soc-toast-title"></div><div class="soc-toast-body"></div></div><b class="soc-toast-count" hidden></b><button class="soc-toast-x" title="Dismiss">✕</button>`;
      t.querySelector('.soc-toast-title').textContent = title;
      const av = t.querySelector('.soc-toast-ico'), who = this.state.friends.find(f => low(f.name) === key);
      portraitURL(who?.variant ?? 'classic').then(u => { if (u) av.src = u; });
      t.querySelector('.soc-toast-body').textContent = body ?? (kind === 'req' ? 'Open Friends (U)' : '');
      t.onclick = () => { dismiss(); open?.(); };
      t.querySelector('.soc-toast-x').onclick = e => { e.stopPropagation(); dismiss(); };
      this.toasts.prepend(t);
      while (this.toasts.children.length > 3) this.toasts.lastElementChild.remove();
      requestAnimationFrame(() => t.classList.add('in'));
    }
    const dismiss = () => { clearTimeout(t._timer); t.classList.remove('in'); t.classList.add('out'); setTimeout(() => t.remove(), 220); };
    clearTimeout(t._timer);
    t._timer = setTimeout(dismiss, 6500);
    blip(kind === 'msg' ? 'msg' : 'req');
  }

  _flash(text, sticky) {
    const f = this.flashEl;
    f.textContent = text; f.hidden = !text;
    clearTimeout(this._flashT);
    if (!sticky && text) this._flashT = setTimeout(() => (f.hidden = true), 3200);
  }

  /** Redraw everything that depends on the snapshot. */
  _sync() {
    const s = this.state;
    const unread = Object.values(s.unread ?? {}).reduce((a, b) => a + b, 0);
    const badge = this.fab.querySelector('.soc-badge');
    badge.hidden = !(unread + s.reqIn.length); badge.textContent = String(unread + s.reqIn.length);
    const rb = this.panel.querySelector('[data-tab="requests"] .soc-badge');
    rb.hidden = !s.reqIn.length; rb.textContent = String(s.reqIn.length);
    if (this.mp) this.mp.friends = s.friends.map(f => low(f.name));
    if (this.isOpen && !this.conv) this._renderList();
    if (this.isOpen && this.conv) this.canSend = this.convKind === 'group' ? true : (this.isFriend(this.conv) && !this.isBlocked(this.conv));
    if (this.cardFor) this._fillCard();
    // Blocked players vanish from your world; muted ones lose their bubbles
    for (const p of this.mp?.players.values() ?? []) {
      p._blocked = this.isBlocked(p.name);   // Multiplayer.update hides the body and tag
      if (this.isMuted(p.name) && p.bubble) { this.mp._setBubble(p, null); p.typing = false; }
    }
  }

  // ─── In-world targeting ──────────────────────────────────────────────────
  _bindPicker() {
    if (this._picker || !this.canvas) return;
    this._picker = true;
    this.ray = new THREE.Raycaster();
    this.mouse = new THREE.Vector2(0, 0);
    this.canvas.addEventListener('pointermove', e => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this._mouseXY = [e.clientX, e.clientY];
    });
    // Unlocked cursor: clicking a highlighted player opens their card instead of grabbing the mouse
    this.canvas.addEventListener('click', e => {
      if (document.pointerLockElement || !this.hover) return;
      e.stopImmediatePropagation();
      this.openCard(this.hover, e.clientX, e.clientY);
    }, true);
    this.hint = el('div', 'soc-hint');
    document.body.append(this.hint);
  }

  /** Called every frame by the game loop; raycasts at most ~12 times a second. */
  update(dt) {
    if (!this.mp || !this.camera) return;
    if (this._cardEmoteUntil && performance.now() >= this._cardEmoteUntil) {
      if (this.controller.emote === this._cardEmoteKey) this.controller.emote = null;
      this._cardEmoteUntil = 0;
      this._cardEmoteKey = null;
    }
    if (this.cardFor) this._refreshCardEmotes();
    if (this.cardFor && this.mp.players.get(this.cardFor.id) !== this.cardFor) this.closeCard();   // they left
    if (this.hover && this.mp.players.get(this.hover.id) !== this.hover) this._setHover(null);
    this._pickT = (this._pickT ?? 0) - dt;
    if (this._pickT > 0) return;
    this._pickT = 0.08;
    const locked = !!document.pointerLockElement;
    const busy = this.isOpen || document.querySelector('#pause-menu.open') || this.card.classList.contains('show');
    let hit = null;
    if (!busy) {
      this.ray.setFromCamera(locked ? new THREE.Vector2(0, 0) : this.mouse, this.camera);
      this.ray.far = 60;
      const meshes = [];
      for (const p of this.mp.players.values()) if (p.rig && p.root.visible && !p._blocked) for (const m of p.rig.meshes) { m.userData.socPlayer = p; meshes.push(m); }
      const h = meshes.length ? this.ray.intersectObjects(meshes, false)[0] : null;
      if (h) {
        // Don't select through walls
        const wall = this.ray.intersectObjects(this.controller.cityMeshes ?? [], false)[0];
        if (!wall || wall.distance > h.distance) hit = h.object.userData.socPlayer;
      }
    }
    this._setHover(hit, locked);
  }

  _setHover(p, locked) {
    if (p === this.hover) { if (p) this._placeHint(locked); return; }
    if (this.hover) this._outline(this.hover, false);
    this.hover = p;
    if (p) { this._outline(p, true); this._placeHint(locked); this.hint.classList.add('show'); this.hint.textContent = locked ? `[Y]  ${p.name}` : p.name; }
    else this.hint.classList.remove('show');
    if (this.canvas) this.canvas.style.cursor = p && !locked ? 'pointer' : '';
  }
  _placeHint(locked) {
    const [x, y] = locked || !this._mouseXY ? [innerWidth / 2, innerHeight / 2] : this._mouseXY;
    this.hint.style.transform = `translate(${x + 16}px, ${y + 14}px)`;
  }

  _outline(p, on) {
    if (!p.rig) return;
    if (on && p._outlineRig !== p.rig) {
      p._outlineRig = p.rig;
      p._outlines = p.rig.meshes.map(m => { const o = new THREE.Mesh(m.geometry, OUTLINE_MAT); o.renderOrder = -1; o.raycast = () => {}; m.add(o); return o; });
    }
    for (const o of p._outlines ?? []) o.visible = on;
  }

  // ─── Player card ─────────────────────────────────────────────────────────
  openCard(p, x, y) {
    this.cardFor = p;
    if (document.pointerLockElement) document.exitPointerLock();
    const c = this.card;
    const img = c.querySelector('img');
    img.removeAttribute('src');
    portraitURL(p.variant ?? 'classic').then(u => { if (u && this.cardFor === p) img.src = u; });
    this._fillCard();
    const W = 340, H = 214;
    x ??= innerWidth / 2 + 40; y ??= innerHeight / 2 - H / 2;
    c.style.left = `${Math.max(12, Math.min(innerWidth - W - 12, x + 18))}px`;
    c.style.top = `${Math.max(12, Math.min(innerHeight - H - 12, y - H / 2))}px`;
    c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
    blip('open');
  }
  closeCard() { this.cardFor = null; this.card.classList.remove('show'); }

  _fillCard() {
    const p = this.cardFor, n = p.name, c = this.card;
    c.querySelector('.soc-card-name').textContent = n;
    const fr = this.isFriend(n), bl = this.isBlocked(n), mu = this.isMuted(n), out = this.sentReq(n), inc = this.gotReq(n);
    c.querySelector('.soc-card-rel').textContent = bl ? 'Blocked' : fr ? 'Friend' : out ? 'Friend request sent' : inc ? 'Wants to be your friend' : 'Spider-Man';
    const fb = c.querySelector('[data-a="friend"]');
    fb.textContent = fr ? 'Unfriend' : inc ? 'Accept Friend' : out ? 'Cancel Request' : 'Add Friend';
    fb.className = fr || out ? 'no' : 'yes';
    fb.disabled = bl;
    c.querySelector('[data-a="block"]').textContent = bl ? 'Unblock' : 'Block';
    c.querySelector('[data-a="mute"]').textContent = mu ? 'Unmute' : 'Mute';
    this._refreshCardEmotes();
  }

  _refreshCardEmotes() {
    const p = this.cardFor;
    if (!p || !this.card) return;
    const row = this.card.querySelector('.soc-card-emotes');
    const allowed = !!this.mp?.room && this.mp.room.emotes !== false && !p._blocked && !this.isBlocked(p.name);
    row.hidden = !allowed;
    if (!allowed) return;
    const ready = this.controller?.isGrounded && !this.controller.isClimbing && !this.controller.webPhysics?.isSwinging;
    const wave = row.querySelector('[data-e="wave"]');
    const highfive = row.querySelector('[data-e="highfive"]');
    wave.disabled = !ready;
    const distance = p.root?.position?.distanceTo(this.controller.root.position) ?? Infinity;
    highfive.disabled = !ready || distance > 5;
    highfive.title = distance > 5 ? 'Get within 5 m to high-five' : 'High-five';
  }

  _openGift() {
    const c = this.card, form = c.querySelector('.soc-gift'), msg = c.querySelector('.soc-gift-msg');
    if (!this.cardFor || this.isBlocked(this.cardFor.name) || this.cardFor._blocked) return;
    msg.hidden = true;
    form.hidden = false;
    const input = form.querySelector('.soc-gift-amt');
    const bal = wallet.studs;
    input.value = '';
    input.placeholder = wallet.infinite ? 'Amount' : `Max ${Math.max(0, Math.min(100000, bal)).toLocaleString()}`;
    input.focus();
  }

  _closeGift() {
    const form = this.card?.querySelector('.soc-gift');
    if (!form) return;
    form.hidden = true;
    this.card.querySelector('.soc-gift-msg').hidden = true;
  }

  /** The client only asks; the server is the only thing that moves studs. */
  _sendGift() {
    const p = this.cardFor;
    if (!p || !this.net?.connected) return;
    const form = this.card.querySelector('.soc-gift');
    const input = form.querySelector('.soc-gift-amt');
    const amount = Math.floor(Number(input.value));
    const msg = this.card.querySelector('.soc-gift-msg');
    const say = (text, ok) => { msg.hidden = false; msg.textContent = text; msg.className = `soc-gift-msg ${ok ? 'ok' : 'err'}`; };
    if (!Number.isFinite(amount) || amount < 1) return say('Enter a whole amount of at least 1 stud', false);
    if (amount > 100000) return say('The most you can gift at once is 100,000 studs', false);
    if (!wallet.infinite && amount > wallet.studs) return say('You do not have that many studs', false);
    const cid = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    this._giftPending = { cid, amount, to: p.name };
    this.net.send({ t: 'gift', to: p.name, amount, cid });
    form.querySelector('.soc-gift-send').disabled = true;
    say('Sending…', true);
  }

  _onGiftResult(m) {
    if (!this.card) return;
    const pending = this._giftPending;
    if (pending && m.cid && m.cid !== pending.cid) return;   // a stale answer for an earlier gift
    const msg = this.card.querySelector('.soc-gift-msg');
    const form = this.card.querySelector('.soc-gift');
    const send = form?.querySelector('.soc-gift-send');
    if (send) send.disabled = false;
    if (m.ok) {
      this._giftPending = null;
      form.hidden = true;
      msg.hidden = false;
      msg.className = 'soc-gift-msg ok';
      msg.textContent = `Sent ${Number(m.amount).toLocaleString()} studs to ${m.to}`;
      blip('req');
    } else {
      msg.hidden = false;
      msg.className = 'soc-gift-msg err';
      msg.textContent = m.err || 'The gift did not go through';
      blip('err');
    }
  }

  _cardEmote(key) {
    if (!['wave', 'highfive'].includes(key) || !this.cardFor || this.card.querySelector(`[data-e="${key}"]`)?.disabled) return;
    this.controller.emote = key;
    this._cardEmoteKey = key;
    this._cardEmoteUntil = performance.now() + 1800;
    this.net.send({ t: 'emote', e: key });
    blip('req');
  }

  _cardAction(a) {
    const n = this.cardFor?.name;
    if (!n) return;
    blip('tap');
    if (a === 'friend') {
      if (this.isFriend(n)) this.net.send({ t: 'unfriend', name: n });
      else if (this.gotReq(n)) this.net.send({ t: 'friendAccept', name: n });
      else if (this.sentReq(n)) this.net.send({ t: 'friendCancel', name: n });
      else this.net.send({ t: 'friendReq', name: n });
    } else if (a === 'block') this.net.send({ t: 'block', name: n, on: !this.isBlocked(n) });
    else if (a === 'mute') this.net.send({ t: 'mute', name: n, on: !this.isMuted(n) });
  }
}
