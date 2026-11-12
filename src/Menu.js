/**
 * Menu.js — title screen: Single Player / Online, suit picker, login + sign-up, room browser.
 * Resolves with the chosen mode once the player is ready to drop in.
 */
import * as THREE from 'three';
import { VARIANTS, swatchOf } from './Variants.js?v=67';
import { GEAR, applyGear } from './Gear.js?v=65';
import { loadOutfit, saveOutfit, outfitCode, toggleGear, wallet } from './Outfit.js?v=65';
import { portraitURL } from './Portrait.js?v=217';
import { EMOTES, ownsEmote } from './Emotes.js?v=69';
import { LegoSpidey } from './LegoSpidey.js?v=183';
import { rigOpts, dressRig, heroOf, HEROES } from './Characters.js?v=67';
import { GFX } from './Perf.js?v=20';
import { MenuScene } from './MenuScene.js?v=228';
import { installUi, buildWordmark, uiSfx, decorate, select, updatePrompts } from './UiKit.js?v=68';
import { CHAPTERS } from './Story.js?v=220';
import { progress } from './Progress.js?v=60';
import { setFace } from './GameUI.js?v=127';
import { settings, apply as applySettings } from './Settings.js?v=62';

const $ = id => document.getElementById(id);
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

function releasePreviewRig(rig, { geometry = true } = {}) {
  if (!rig?.root) return;
  rig.root.traverse(node => {
    if (!node.isMesh) return;
    if (geometry) node.geometry?.dispose();
    for (const material of [].concat(node.material ?? [])) material?.dispose();
  });
}

export class Menu {
  constructor(net) {
    this.net = net;
    this.outfit = loadOutfit();
    this.ready = false;
    this.progressFrac = 0;
  }

  show(id) {
    const prev = document.querySelector('.screen.show')?.id;
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('show', s.id === id);
    decorate($(id)?.parentElement ?? document);
    updatePrompts();
    this._err('');
    if (prev && prev !== id) uiSfx.play('whoosh');
    if (id === 'scr-main') {
      this._profile();
      if (this.scene && this.scene.want !== outfitCode(this.outfit)) this.scene.setOutfit(outfitCode(this.outfit));
    }
    // Give keyboard / gamepad users a starting point
    requestAnimationFrame(() => {
      const scr = document.getElementById(id);
      if (scr && !scr.contains(document.activeElement)) {
        const el = scr.querySelector('.tt-item.sel:not(:disabled)') ?? scr.querySelector('button:not(:disabled)');
        el?.focus({ preventScroll: true });
        if (el?.matches('.tt-item')) select(el);
      }
    });
  }

  /** City download progress (0..1). The Play buttons stay locked until ready(). */
  progress(frac) {
    this.progressFrac = frac;
    if (!this.ready) this._gate();
  }

  setReady() {
    this.ready = true;
    this._gate();
    if ($('scr-rooms').classList.contains('show')) this._refreshRooms();
  }

  _gate() {
    const pct = Math.round(this.progressFrac * 100);
    const done = progress.chaptersDone;
    // Story: shows where you are; it opens chapter select even while the city loads
    $('story-note').textContent = done >= CHAPTERS.length ? 'All chapters complete' : `Next: Chapter ${done + 1} of ${CHAPTERS.length}`;
    const fp = $('btn-freeplay');
    fp.disabled = !progress.freeplayUnlocked || !this.ready;
    $('freeplay-note').textContent = !progress.freeplayUnlocked ? 'Beat Chapter 1 to unlock' : !this.ready ? `Building the city... ${pct}%` : 'Roam the city, no missions';
    for (const b of document.querySelectorAll('#chapter-list .tt-item[data-ch]')) {
      const i = +b.dataset.ch;
      b.disabled = i > done || !this.ready;
    }
    $('btn-create').disabled = !this.ready;
    if (!this.ready) $('btn-create').dataset.reason = `City loading ${pct}%`; else $('btn-create').removeAttribute('data-reason');
  }

  _profile() {
    const who = this.me ? `Online as <b></b>` : 'Local save on this device';
    $('menu-profile').innerHTML = `${who} &middot; <b>${wallet.studs.toLocaleString()}</b> studs`;
    if (this.me) $('menu-profile').querySelector('b').textContent = this.me.name;
  }

  /** Start: Spider-Man cheers, then the diorama is torn down to free the GPU for the city. */
  /** Chapter select: beaten and next chapters are playable; a card previews the selected one. */
  _openChapters() {
    const list = $('chapter-list');
    list.innerHTML = '';
    const done = progress.chaptersDone;
    CHAPTERS.forEach((ch, i) => {
      const b = document.createElement('button');
      b.className = 'tt-item' + (i < done ? ' done' : '');
      b.dataset.ch = i;
      b.innerHTML = `<span class="ch-n">${i + 1}</span><span class="ch-t"></span>`;
      b.querySelector('.ch-t').textContent = ch.name ?? ch.title;
      b.onclick = () => { if (this.ready && i <= done) this._start({ mode: 'single', sub: 'story', chapter: i, variant: outfitCode(this.outfit) }); };
      b.addEventListener('focus', () => this._chapterCard(i));
      list.append(b);
    });
    const backBtn = document.createElement('button');
    backBtn.className = 'tt-item back';
    backBtn.dataset.back = 'scr-single';
    backBtn.textContent = 'BACK';
    backBtn.onclick = () => this.show('scr-single');
    list.append(backBtn);
    this._gate();
    this.show('scr-chapters');
    const pick = list.querySelector(`[data-ch="${Math.min(done, CHAPTERS.length - 1)}"]`);
    select(pick); this._chapterCard(+pick.dataset.ch);
    requestAnimationFrame(() => (pick.disabled ? list.querySelector('.tt-item:not(:disabled)') : pick)?.focus({ preventScroll: true }));
  }

  _chapterCard(i) {
    const ch = CHAPTERS[i], done = progress.chaptersDone;
    setFace($('cc-face'), ch.face ?? 'spiderman');
    $('cc-num').textContent = `CHAPTER ${i + 1}`;
    $('cc-name').textContent = ch.name ?? ch.title;
    $('cc-obj').textContent = ch.objective;
    const st = $('cc-state');
    st.className = i < done ? 'done' : i > done ? 'locked' : '';
    st.textContent = i < done ? 'COMPLETED' : i > done ? `BEAT CHAPTER ${i} TO UNLOCK` : !this.ready ? 'CITY LOADING...' : 'PLAY';
  }

  _start(choice) {
    this.scene?.reactTo('cheer', 3);
    document.body.classList.add('starting');
    setTimeout(() => { this.scene?.dispose(); this.scene = null; $('menu-3d')?.remove(); }, 900);
    this.resolve(choice);
  }

  _err(text) { for (const e of document.querySelectorAll('.menu-err')) e.textContent = text; }

  run() {
    return new Promise(resolve => {
      this.resolve = resolve;
      applySettings();
      installUi();
      buildWordmark();
      try {
        this.scene = new MenuScene($('menu-3d'));
        this.scene.setOutfit(outfitCode(this.outfit));
        this.scene.start();
      } catch (e) { console.warn('[Menu] 3D menu scene unavailable:', e.message); }
      this._bind();
      this._bindName();
      this._bindSettings();
      this._suitLabel();
      this._gate();
      this.show(this._name() ? 'scr-main' : 'scr-name');
    });
  }

  _bind() {
    $('btn-single').onclick = () => { this._gate(); this.show('scr-single'); };
    $('btn-story').onclick = () => this._openChapters();
    $('btn-freeplay').onclick = () => { if (this.ready && progress.freeplayUnlocked) this._start({ mode: 'single', sub: 'freeplay', variant: outfitCode(this.outfit) }); };
    const gb = $('btn-gauntlet');
    if (gb) gb.onclick = () => { if (this.ready) this._start({ mode: 'single', sub: 'gauntlet', variant: outfitCode(this.outfit) }); };
    $('btn-settings').onclick = () => this.show('scr-settings');
    $('btn-extras').onclick = () => { this._profile(); this.show('scr-extras'); };
    // The Daily Bugle front page: opens the photo board / link board without leaving the menu
    const bugleBtn = $('btn-bugle');
    if (bugleBtn) bugleBtn.onclick = () => window.mountChoctaw?.open();
    // Spider-Man reacts to whatever button you're on
    for (const b of document.querySelectorAll('#loading-screen [data-react]')) {
      const go = () => this.scene?.reactTo(b.dataset.react);
      b.addEventListener('pointerenter', go);
      b.addEventListener('focus', go);
    }
    $('btn-online').onclick = () => {
      if (this.me) { this.show('scr-rooms'); this._refreshRooms(); return; }   // already logged in
      $('login-name').value = store.get('lastName') ?? this._name();
      this.show('scr-login');
      $(store.get('lastName') ? 'login-pass' : 'login-name').focus();
    };
    $('btn-suit').onclick = () => this._openSuits();
    $('btn-rooms-locker')?.addEventListener('click', () => this._openSuits());
    for (const b of document.querySelectorAll('[data-back]')) b.onclick = () => this.show(b.dataset.back);

    const auth = async kind => {
      const name = $('login-name').value.trim(), pass = $('login-pass').value;
      if (this._busy) return;
      this._busy = true;
      try { await this._auth(kind, name, pass); } finally { this._busy = false; }
    };
    this._auth = async (kind, name, pass) => {
      this._err('Connecting...');
      try { await this.net.connect(); } catch (e) { this._err(e.message); return; }
      const r = await this.net.request({ t: kind, name, pass }, ['auth']);
      if (!r.ok) { this._err(r.err); return; }
      store.set('lastName', r.name);
      // Offer to save the login in the browser's password manager (Chrome / Google Password Manager)
      if (window.PasswordCredential && navigator.credentials?.store) {
        navigator.credentials.store(new PasswordCredential({ id: r.name, password: pass, name: r.name })).catch(() => {});
      }
      this.me = { id: r.id, name: r.name };
      this.friends = r.friends ?? [];
      progress.sync = m => this.net.send(m);
      progress.merge(r.progress);
      this._gate?.();
      if (r.wallet) { wallet.useAccount(r.wallet, this.net); wallet.onChange = () => this._lockerBuilt && this._refreshLocker(); }
      this.net.send({ t: 'variant', v: outfitCode(this.outfit) });
      const who = $('rooms-who'); if (who) who.textContent = r.name;
      this.show('scr-rooms');
      this._refreshRooms();
    };
    $('login-form').onsubmit = e => { e.preventDefault(); auth('login'); };
    $('btn-register').onclick = () => auth('register');

    $('btn-refresh').onclick = () => this._refreshRooms();
    $('btn-logout').onclick = () => location.reload();
    this._roomKind = 'world';
    const setKind = kind => {
      this._roomKind = kind;
      document.querySelectorAll('#scr-create .kind-card').forEach(b => {
        const on = b.dataset.kind === kind;
        b.classList.toggle('on', on); b.setAttribute('aria-checked', on);
      });
      $('scr-create').classList.toggle('dorm-kind', kind === 'dorm');
      const max = $('room-max');
      max.max = kind === 'dorm' ? 5 : 16;
      if (+max.value > +max.max) max.value = max.max;
      if (kind === 'dorm' && +max.value === 8) max.value = 5;
      const nm = $('room-name');
      if (nm.value === `${this.me.name}'s room` || nm.value === `${this.me.name}'s dorm`) nm.value = `${this.me.name}'s ${kind === 'dorm' ? 'dorm' : 'room'}`;
    };
    document.querySelectorAll('#scr-create .kind-card').forEach(b => b.addEventListener('click', () => setKind(b.dataset.kind)));
    $('btn-new-room').onclick = () => { this.show('scr-create'); $('room-name').value = `${this.me.name}'s room`; setKind('world'); };
    $('btn-create').onclick = async () => {
      const r = await this.net.request({
        t: 'create', name: $('room-name').value.trim() || 'Room', max: +$('room-max').value,
        pass: $('room-pass').value, pvp: $('room-pvp').checked, villains: $('room-villains').checked,
        health: $('room-health').checked, emotes: $('room-emotes').checked,
        time: $('room-time').value, kind: this._roomKind,
        dorm: this._roomKind === 'dorm' ? (() => { try { return JSON.parse(localStorage.getItem('dormStyle') || '{}'); } catch { return {}; } })() : undefined,
      }, ['joined', 'error']);
      this._joined(r);
    };
  }

  async _refreshRooms() {
    const { list } = await this.net.request({ t: 'rooms' }, ['rooms']);
    const box = $('room-list');
    box.innerHTML = '';
    list.sort((a, b) => (a.id === 'hub' ? -1 : b.id === 'hub' ? 1 : b.players - a.players));
    for (const r of list) {
      const row = document.createElement('div');
      row.className = 'room-row';
      const tags = [r.pvp && 'FRIENDLY FIRE', r.villains && 'VILLAINS', r.health === false && 'NO HEALTH',
        r.time === 'sunset' && 'SUNSET', r.locked && 'LOCKED'].filter(Boolean);
      row.innerHTML = `<div class="room-main"><span class="room-name"></span><span class="room-tags"></span></div>
        <span class="room-count">${r.players}/${r.max}</span>`;
      row.querySelector('.room-name').textContent = r.name;
      row.querySelector('.room-tags').textContent = tags.join('  ');
      let passInput = null;
      if (r.locked) {
        passInput = document.createElement('input');
        passInput.type = 'password';
        passInput.placeholder = 'password';
        passInput.className = 'room-pass';
        row.append(passInput);
      }
      const join = document.createElement('button');
      join.className = 'brick small';
      join.textContent = 'JOIN';
      join.disabled = r.players >= r.max || !this.ready;
      if (!this.ready) join.title = 'The city is still loading';
      join.onclick = async () => this._joined(await this.net.request({ t: 'join', id: r.id, pass: passInput?.value }, ['joined', 'error']));
      row.append(join);
      box.append(row);
    }
  }

  _joined(r) {
    if (r.t === 'error') { this._err(r.err); return; }
    this._start({ mode: 'online', variant: outfitCode(this.outfit), me: this.me, joined: r, friends: this.friends });
  }

  /** Player name: asked once on first launch, kept on this device, shown above Spider-Man. */
  _name() { return (store.get('playerName') ?? '').trim(); }

  _bindName() {
    const clean = v => v.replace(/[^\w .'-]/g, '').trim().slice(0, 16);
    $('name-form').onsubmit = e => {
      e.preventDefault();
      const n = clean($('player-name').value);
      if (!n) { this._err('Type a name first'); return; }
      store.set('playerName', n);
      this._showName();
      this.show('scr-main');
    };
    const set = $('set-name');
    if (set) {
      set.value = this._name();
      set.addEventListener('change', () => { const n = clean(set.value); if (n) { store.set('playerName', n); this._showName(); } set.value = this._name(); });
    }
    this._showName();
    requestAnimationFrame(() => {
      if ($('scr-name')?.classList.contains('show')) $('player-name')?.focus();
    });
  }

  _showName() {
    const n = this._name();
    if (this.scene) this.scene.tagEl = $('menu-nametag');
    $('menu-nametag').textContent = n.toUpperCase();
  }

  _bindSettings() {
    const fpDev = $('set-freeplay-dev');
    if (fpDev) {
      fpDev.checked = progress.freeplayDev;
      fpDev.addEventListener('input', () => { progress.freeplayDev = fpDev.checked; this._gate(); });
    }
    const fmt = { sens: v => `${(+v).toFixed(1)}x`, sfxVol: v => `${Math.round(v * 100)}%`, uiScale: v => `${Math.round(v * 100)}%`,
      musicVol: v => `${Math.round(v * 100)}%`, masterVol: v => `${Math.round(v * 100)}%`, uiVol: v => `${Math.round(v * 100)}%`, ambVol: v => `${Math.round(v * 100)}%`, viewDist: v => `${Math.round(v)}m` };
    for (const el of document.querySelectorAll('[data-set]')) {
      const key = el.dataset.set, out = el.nextElementSibling;
      const show = () => { if (out?.tagName === 'OUTPUT') out.textContent = (fmt[key] ?? (v => v))(el.value); };
      if (el.type === 'checkbox') el.checked = settings.get(key);
      else el.value = settings.get(key);
      show();
      el.addEventListener('input', () => {
        show();
        settings.set(key, el.type === 'checkbox' ? el.checked : +el.value);
        if (key === 'sfxVol') uiSfx.play('snap');
        else if (key === 'masterVol' || key === 'uiVol') uiSfx.play('slider', { value: +el.value });
      });
    }
  }

  _suitLabel() { $('btn-suit').textContent = 'LOCKER'; }

  async _openSuits() {
    this.show('scr-suit');
    // Back returns to the room list once logged in
    document.querySelector('#scr-suit [data-back]').dataset.back = this.me ? 'scr-rooms' : 'scr-main';
    if (!this._lockerBuilt) this._buildLocker();
    this._refreshLocker();
  }

  _buildLocker() {
    this._lockerBuilt = true;
    for (const b of document.querySelectorAll('#locker-tabs button')) {
      b.onclick = () => {
        for (const o of document.querySelectorAll('#locker-tabs button')) o.classList.toggle('on', o === b);
        for (const t of document.querySelectorAll('.tab')) t.classList.toggle('on', t.id === `tab-${b.dataset.tab}`);
        this._gearThumbs();
      };
    }
    // Suit presets
    const grid = $('suit-grid');
    for (const [key, v] of Object.entries(VARIANTS)) {
      const b = document.createElement('button');
      b.className = 'suit';
      b.dataset.key = key;
      const sw = document.createElement('span');
      sw.className = 'swatch';
      const [a, c] = swatchOf(v);
      sw.style.background = `linear-gradient(135deg, ${a} 0 50%, ${c} 50% 100%)`;
      const price = Object.assign(document.createElement('span'), { className: 'price' });
      b.append(sw, Object.assign(document.createElement('span'), { textContent: v.name.toUpperCase() }), price);
      b.onmouseenter = () => this._tryOn({ ...this.outfit, suit: key });
      b.onmouseleave = () => this._tryOn(null);
      b.onclick = () => {
        const sid = `suit:${key}`;
        if (v.price && !wallet.owns(sid)) {
          if (this._pending !== sid) { this._pending = sid; this._refreshLocker(); return; }
          if (!wallet.buy(sid, v.price)) { this._err(`You need ${v.price.toLocaleString()} studs for this suit`); return; }
        }
        this._pending = null;
        this._setOutfit({ ...this.outfit, suit: key });
      };
      grid.append(b);
    }
    // Heroes: play as someone else (Characters.js). Spider-Man returns to your last suit.
    const hg = $('hero-grid');
    for (const [key, h] of Object.entries(HEROES)) {
      const b = document.createElement('button');
      b.className = 'suit hero';
      b.dataset.hero = key;
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = `linear-gradient(135deg, ${h.swatch[0]} 0 50%, ${h.swatch[1]} 50% 100%)`;
      const price = Object.assign(document.createElement('span'), { className: 'price' });
      b.append(sw, Object.assign(document.createElement('span'), { textContent: h.name.toUpperCase() }), price);
      b.title = h.blurb;
      const suitFor = () => key === 'spiderman' ? (this._lastSpideySuit ?? 'classic') : `hero-${key}`;
      b.onmouseenter = () => this._tryOn({ suit: suitFor(), gear: key === 'spiderman' ? this.outfit.gear : [] });
      b.onmouseleave = () => this._tryOn(null);
      b.onclick = () => {
        const id = `hero:${key}`;
        if (h.price && !wallet.owns(id)) {
          if (this._pending !== id) { this._pending = id; this._refreshLocker(); return; }
          if (!wallet.buy(id, h.price)) { this._err(`You need ${h.price.toLocaleString()} studs for ${h.name}`); return; }
        }
        this._pending = null;
        if (!heroOf(this.outfit.suit)) this._lastSpideySuit = this.outfit.suit;
        this._setOutfit({ suit: suitFor(), gear: key === 'spiderman' ? this.outfit.gear : [] });
        $('hero-blurb').textContent = h.blurb;
      };
      hg.append(b);
    }

    // Custom colour palettes (LEGO colours)
    const COLORS = ['c91a09', 'a1131c', 'f2701e', 'f6c21a', 'f4f4f4', 'a0a5a9', '5a5e63', '1b1b1f',
                    '0a57c2', '1f3f8a', '36aebf', '237841', '4c9e3f', '7a3e9d', 'e8469a', '6b3a1f'];
    this.custom = { red: 'c91a09', line: '5a0a10', blue: '0a57c2' };
    const cm = /^custom-(\w{6})-(\w{6})-(\w{6})$/.exec(this.outfit.suit);
    if (cm) this.custom = { red: cm[1], line: cm[2], blue: cm[3] };
    for (const pal of document.querySelectorAll('.palette')) {
      for (const col of COLORS) {
        const b = document.createElement('button');
        b.style.background = `#${col}`;
        b.dataset.col = col;
        b.title = `#${col}`;
        b.onclick = () => {
          this.custom[pal.dataset.slot] = col;
          this._setOutfit({ ...this.outfit, suit: `custom-${this.custom.red}-${this.custom.line}-${this.custom.blue}` });
        };
        pal.append(b);
      }
    }
    // Gear shop
    const gearGrid = $('gear-grid');
    for (const [id, g] of Object.entries(GEAR)) {
      const b = document.createElement('button');
      b.className = 'gear';
      b.dataset.id = id;
      b.innerHTML = `<img class="thumb px" alt=""><span class="gname"></span><span class="slot">${g.slot.toUpperCase()}</span><span class="price"></span>`;
      b.querySelector('.gname').textContent = g.name.toUpperCase();
      b.onmouseenter = () => { if (!this.outfit.gear.includes(id)) this._tryOn(toggleGear(this.outfit, id)); };
      b.onmouseleave = () => this._tryOn(null);
      b.onclick = () => {
        if (!wallet.owns(id)) {
          if (this._pending !== id) { this._pending = id; this._refreshLocker(); this._tryOn(toggleGear(this.outfit, id), true); return; }
          if (!wallet.buy(id, g.price)) { this._err(`You need ${g.price.toLocaleString()} studs`); return; }
        }
        this._pending = null;
        this._setOutfit(toggleGear(this.outfit, id));
      };
      gearGrid.append(b);
    }
    // Emote shop: hover to see it on your preview, buy with a second click
    const emoteShop = $('emote-shop');
    for (const [key, label, price] of EMOTES.filter(e => e[0] !== 'stop')) {
      const b = document.createElement('button');
      b.className = 'emote-card';
      b.dataset.key = key;
      b.innerHTML = `<span class="ename"></span><span class="price"></span>`;
      b.querySelector('.ename').textContent = label;
      b.onmouseenter = () => { this._pvEmote = key; };
      b.onmouseleave = () => { this._pvEmote = null; };
      b.onclick = () => {
        this._pvEmote = key;
        const eid = `emote:${key}`;
        if (ownsEmote(key, price)) return;
        if (this._pending !== eid) { this._pending = eid; this._refreshLocker(); return; }
        if (!wallet.buy(eid, price)) { this._err(`You need ${price.toLocaleString()} studs`); return; }
        this._pending = null;
        this._refreshLocker();
      };
      emoteShop.append(b);
    }
  }

  /** Preview an outfit on the turntable without saving it; null goes back to what you wear. */
  _tryOn(o, sticky = false) {
    // Debounce both sides of the hover transition. A card's pointerleave fires just before the
    // next card's pointerenter; rendering the base outfit on every leave starts a burst of rig
    // loads while the pointer is moving across a row.
    clearTimeout(this._tryTimer);
    if (o) {
      if (sticky) this._trying = o;
    }
    const preview = o
      ? outfitCode(o)
      : outfitCode(this._pending && this._trying ? this._trying : this.outfit);
    this._tryTimer = setTimeout(() => this._previewSuit(preview), 85);
  }

  _setOutfit(o) {
    clearTimeout(this._tryTimer);
    this._trying = null;
    this._err('');
    this.outfit = o;
    saveOutfit(o);
    if (this.net.connected) this.net.send({ t: 'variant', v: outfitCode(o) });
    this._refreshLocker();
  }

  _refreshLocker() {
    $('locker-count').textContent = wallet.infinite ? 'INFINITE' : wallet.studs.toLocaleString();
    const curHero = heroOf(this.outfit.suit) ? this.outfit.suit.slice(5) : 'spiderman';
    for (const b of $('hero-grid')?.children ?? []) {
      const h = HEROES[b.dataset.hero], locked = h.price && !wallet.owns(`hero:${b.dataset.hero}`);
      b.classList.toggle('picked', b.dataset.hero === curHero);
      b.classList.toggle('locked', !!locked);
      b.querySelector('.price').textContent = !locked ? '' : this._pending === `hero:${b.dataset.hero}` ? 'CLICK AGAIN TO BUY' : `${h.price.toLocaleString()} STUDS`;
    }
    for (const b of $('suit-grid').children) {
      const v = VARIANTS[b.dataset.key];
      const locked = v.price && !wallet.owns(`suit:${b.dataset.key}`);
      b.classList.toggle('picked', b.dataset.key === this.outfit.suit);
      b.classList.toggle('locked', !!locked);
      b.querySelector('.price').textContent = !locked ? '' : this._pending === `suit:${b.dataset.key}`
        ? `CLICK AGAIN TO BUY` : `${v.price.toLocaleString()} STUDS`;
    }
    for (const pal of document.querySelectorAll('.palette')) {
      for (const b of pal.children) b.classList.toggle('on', this.outfit.suit.startsWith('custom') && this.custom[pal.dataset.slot] === b.dataset.col);
    }
    for (const b of $('gear-grid').children) {
      const id = b.dataset.id, owned = wallet.owns(id), on = this.outfit.gear.includes(id);
      b.classList.toggle('on', on);
      b.querySelector('.price').textContent = on ? 'EQUIPPED' : owned ? 'OWNED'
        : this._pending === id ? `CLICK AGAIN TO BUY · ${GEAR[id].price.toLocaleString()}` : `${GEAR[id].price.toLocaleString()} STUDS`;
      b.classList.toggle('pending', this._pending === id);
    }
    for (const b of $('emote-shop').children) {
      const [, , price] = EMOTES.find(e => e[0] === b.dataset.key);
      const owned = ownsEmote(b.dataset.key, price);
      b.classList.toggle('owned', owned);
      b.classList.toggle('pending', this._pending === `emote:${b.dataset.key}`);
      b.querySelector('.price').textContent = price === 0 ? 'FREE' : owned ? 'OWNED'
        : this._pending === `emote:${b.dataset.key}` ? `CLICK AGAIN TO BUY · ${price.toLocaleString()}` : `${price.toLocaleString()} STUDS`;
    }
    this._gearThumbs();
    this._previewSuit(outfitCode(this.outfit));
  }

  /** Gear thumbnails show the item on YOUR suit. They are only rendered while the Gear tab is
   *  open (each one is a 3D render), and redrawn when the suit changes. */
  _gearThumbs() {
    if (!$('tab-gear')?.classList.contains('on') || this._thumbSuit === this.outfit.suit) return;
    this._thumbSuit = this.outfit.suit;
    const suit = this.outfit.suit;
    for (const b of $('gear-grid').children) {
      const id = b.dataset.id;
      portraitURL(`${suit}|${id}`, GEAR[id].slot === 'back' ? 'back' : 'head').then(url => {
        if (this._thumbSuit === suit) b.querySelector('.thumb').src = url;
      });
    }
  }

  /** Small turntable render of the chosen suit. */
  async _previewSuit(key) {
    const request = this._pvRequest = (this._pvRequest ?? 0) + 1;
    if (!this._pv) {
      const canvas = $('suit-preview');
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, GFX.maxRatio));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xdfefff, 0x806a50, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 2.2);
      sun.position.set(2, 4, 3);
      scene.add(sun);
      const cam = new THREE.PerspectiveCamera(30, canvas.width / canvas.height, 0.1, 50);
      cam.position.set(0, 1.1, 5.2);
      cam.lookAt(0, 0.95, 0);
      const holder = new THREE.Group();
      scene.add(holder);
      this._pv = { renderer, scene, cam, holder };
      const spin = () => {
        if (!$('scr-suit').classList.contains('show')) { this._pv.running = false; return; }
        holder.rotation.y += 0.012;
        this._pv.rig?.update(1 / 60, { speed: 0, grounded: true, emote: this._pvEmote ?? null });
        renderer.render(scene, cam);
        requestAnimationFrame(spin);
      };
      this._pv.spin = spin;
    }
    const pv = this._pv;
    pv.want = key;
    const startPreview = () => {
      if (!pv.running) { pv.running = true; pv.spin(); }
    };
    if (pv.currentKey === key && pv.rig) {
      startPreview();
      return;
    }
    const [suit, gear = ''] = key.split('|');
    // Sweeping the pointer along a row used to build (and throw away) a figure per card, every
    // time. The last few previews are kept, so going back over a suit is instant.
    pv.cache ??= new Map();
    let rig = pv.cache.get(key);
    if (rig) pv.cache.delete(key);
    else {
      rig = dressRig(await new LegoSpidey(rigOpts(suit)).load(), suit);
      // A load started by an earlier hover must never replace the current preview, even when the
      // pointer returns to the same outfit before that earlier load finishes.
      if (request !== this._pvRequest || pv.want !== key) {
        releasePreviewRig(rig, { geometry: false });
        return;
      }
      // GLB instances share source geometry with live characters. Give the turntable its own copy
      // so releasing an old preview cannot evict buffers still used by a summoned or player rig.
      if (rig.isGlb) rig.root.traverse(node => { if (node.isMesh) node.geometry = node.geometry.clone(); });
      if (!heroOf(suit)) applyGear(rig, gear.split(',').filter(Boolean));
    }
    if (pv.rig) {
      pv.holder.remove(pv.rig.root);
      pv.cache.set(pv.currentKey, pv.rig);
      while (pv.cache.size > 6) {
        const [oldKey, old] = pv.cache.entries().next().value;
        pv.cache.delete(oldKey);
        releasePreviewRig(old);
      }
    }
    pv.rig = rig;
    pv.currentKey = key;
    pv.holder.add(rig.root);
    // Frame whoever is standing there: big-figs (Venom) are taller than a minifig
    rig.root.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(rig.root);
    const center = bb.getCenter(new THREE.Vector3());
    const h = Math.max(1.9, bb.max.y - bb.min.y);
    const k = h / 1.9;
    pv.cam.position.set(center.x, center.y + 0.15 * k, center.z + 5.2 * k);
    pv.cam.lookAt(center);
    startPreview();
  }
}
/* ══════════════════════════════════════════════════════════════════════════
   PRESENTATION OVERHAUL — campaign dossier, room browser cards, profile chip.
   These definitions replace the earlier list/card rendering at the bottom of
   the class. Everything else (auth, locker, navigation, launching) is untouched.
   ══════════════════════════════════════════════════════════════════════════ */

const CHECK_SVG = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.6 6.4 12 13 4.4" stroke="#6cc57c" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const LOCK_SVG = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3.3" y="7" width="9.4" height="6.8" rx="1.4" stroke="currentColor" stroke-width="1.5"/><path d="M5.7 7V5.3a2.3 2.3 0 0 1 4.6 0V7" stroke="currentColor" stroke-width="1.5"/></svg>';

Object.assign(Menu.prototype, {
  _suitLabel() {
    const label = $('btn-suit')?.querySelector('.ti-label');
    if (label) label.textContent = 'Locker';
  },

  _showName() {
    const n = this._name();
    if (this.scene) this.scene.tagEl = $('menu-nametag');
    const tag = $('menu-nametag');
    if (tag) tag.textContent = n.toUpperCase();
    this._chip();
  },

  _chip() {
    const name = $('tp-name'), studs = $('tp-studs');
    if (name) name.textContent = (this.me?.name ?? this._name() ?? '').toUpperCase() || 'HERO';
    if (studs) studs.textContent = wallet.infinite ? 'INFINITE STUDS' : `${wallet.studs.toLocaleString()} STUDS`;
  },

  _profile() {
    const el = $('menu-profile');
    if (el) {
      el.textContent = '';
      if (this.me) {
        el.append('Signed in as ');
        const who = document.createElement('b');
        who.textContent = this.me.name;
        el.append(who, ' · ');
      } else {
        el.append('Local save on this device · ');
      }
      const studs = document.createElement('b');
      studs.textContent = wallet.infinite ? '∞' : wallet.studs.toLocaleString();
      el.append(studs, ' studs');
    }
    this._chip();
    if (this.me && $('rooms-who')) $('rooms-who').textContent = this.me.name;
  },

  _gate() {
    const pct = Math.round(this.progressFrac * 100);
    const done = progress.chaptersDone;
    const storyNote = $('story-note');
    if (storyNote) storyNote.textContent = done >= CHAPTERS.length
      ? 'All chapters complete' : `Next: Chapter ${done + 1} of ${CHAPTERS.length}`;
    const fp = $('btn-freeplay');
    if (fp) {
      fp.disabled = !progress.freeplayUnlocked || !this.ready;
      const note = $('freeplay-note');
      if (note) note.textContent = !progress.freeplayUnlocked ? 'Beat Chapter 1 to unlock'
        : !this.ready ? `Building the city… ${pct}%` : 'Roam the city, no missions';
    }
    const gb = $('btn-gauntlet');
    if (gb) {
      gb.disabled = !this.ready;
      let best = null; try { best = JSON.parse(localStorage.getItem('gauntletBest') || 'null'); } catch (e) {}
      const gn = $('gauntlet-note');
      if (gn) gn.textContent = !this.ready ? `Building the city… ${pct}%`
        : best?.round ? `Best: Round ${best.round} · ${best.score.toLocaleString()} pts` : 'Endless rounds. How far can you go?';
    }
    for (const row of document.querySelectorAll('#chapter-list .tt-item[data-ch]')) {
      const i = +row.dataset.ch;
      const locked = i > done;
      row.disabled = false;   // locked chapters stay browsable for the brief
      row.classList.toggle('locked', locked);
      row.classList.toggle('done', i < done);
      row.classList.toggle('current', i === done);
      const meta = row.querySelector('.ch-meta');
      if (meta) meta.textContent = i < done ? 'COMPLETED' : locked ? 'LOCKED' : 'AVAILABLE';
    }
    const create = $('btn-create');
    if (create) {
      create.disabled = !this.ready;
      if (!this.ready) create.dataset.reason = `City loading ${pct}%`; else create.removeAttribute('data-reason');
    }
    if ($('scr-chapters')?.classList.contains('show')) {
      this._chapterCard(this._chSel ?? Math.min(done, CHAPTERS.length - 1));
    }
  },

  _openChapters() {
    const list = $('chapter-list');
    list.innerHTML = '';
    const done = progress.chaptersDone;
    CHAPTERS.forEach((ch, i) => {
      const row = document.createElement('button');
      row.className = 'tt-item ch-item' + (i < done ? ' done' : '') + (i > done ? ' locked' : '') + (i === done ? ' current' : '');
      row.dataset.ch = i;
      row.innerHTML = '<span class="ch-num"></span><span class="ch-text"><span class="ch-name"></span>'
        + '<span class="ch-meta"></span></span><span class="ch-mark"></span>';
      row.querySelector('.ch-num').textContent = String(i + 1).padStart(2, '0');
      row.querySelector('.ch-name').textContent = ch.name ?? ch.title;
      row.querySelector('.ch-meta').textContent = i < done ? 'COMPLETED' : i > done ? 'LOCKED' : 'AVAILABLE';
      row.querySelector('.ch-mark').innerHTML = i < done ? CHECK_SVG : i > done ? LOCK_SVG : '';
      row.onclick = () => this._pickChapter(i, i === this._chSel);
      row.addEventListener('focus', () => this._chapterCard(i));
      list.append(row);
    });

    const back = document.createElement('button');
    back.className = 'tt-item ch-item back-row';
    back.dataset.back = 'scr-single';
    back.innerHTML = '<span class="ch-num">&larr;</span><span class="ch-text"><span class="ch-name">BACK</span></span><span class="ch-mark"></span>';
    back.onclick = () => this.show('scr-single');
    list.append(back);

    const play = $('cc-play');
    if (play) play.onclick = () => this._pickChapter(this._chSel ?? 0, true);

    const pickIdx = Math.min(done, CHAPTERS.length - 1);
    this._chSel = pickIdx;
    this._chapterCard(pickIdx);
    this.show('scr-chapters');
    const pick = list.querySelector(`[data-ch="${pickIdx}"]`);
    if (pick) { select(pick); requestAnimationFrame(() => pick.focus({ preventScroll: true })); }
  },

  _pickChapter(i, launch = false) {
    this._chSel = i;
    const row = document.querySelector(`#chapter-list [data-ch="${i}"]`);
    if (row) select(row);
    this._chapterCard(i);
    if (launch && this.ready && i <= progress.chaptersDone) {
      this._start({ mode: 'single', sub: 'story', chapter: i, variant: outfitCode(this.outfit) });
    }
  },

  _chapterCard(i) {
    this._chSel = i;
    const ch = CHAPTERS[i], done = progress.chaptersDone;
    if (!ch) return;
    setFace($('cc-face'), ch.face ?? 'spiderman');
    $('cc-num').textContent = `CHAPTER ${String(i + 1).padStart(2, '0')}`;
    $('cc-name').textContent = ch.name ?? ch.title;
    $('cc-obj').textContent = ch.objective;

    const locked = i > done;
    const st = $('cc-state');
    st.className = i < done ? 'done' : locked ? 'locked' : '';
    st.textContent = i < done ? 'COMPLETED' : locked ? 'LOCKED' : !this.ready ? 'CITY LOADING' : 'AVAILABLE';

    const pips = $('cc-pips');
    pips.innerHTML = '';
    CHAPTERS.forEach((_, k) => {
      const pip = document.createElement('i');
      if (k < done) pip.className = 'done';
      else if (k === i) pip.className = 'current';
      pips.append(pip);
    });

    $('cc-progress').textContent = `${done} / ${CHAPTERS.length} COMPLETE`;
    const play = $('cc-play');
    if (play) {
      play.disabled = locked || !this.ready;
      play.textContent = locked ? 'LOCKED' : !this.ready ? 'CITY LOADING…'
        : i < done ? 'REPLAY CHAPTER' : 'PLAY CHAPTER';
    }
    $('cc-lock-note').textContent = locked ? `Clear Chapter ${i} to unlock this mission.` : '';

    const fill = $('cp-fill');
    if (fill) fill.style.width = `${(done / CHAPTERS.length) * 100}%`;
    const count = $('cp-count');
    if (count) count.textContent = `${done} / ${CHAPTERS.length} COMPLETE`;
  },

  async _refreshRooms() {
    const box = $('room-list');
    const refresh = $('btn-refresh');
    if (!box) return;
    if (refresh) { refresh.disabled = true; }
    try {
      const { list } = await this.net.request({ t: 'rooms' }, ['rooms']);
      box.innerHTML = '';
      list.sort((a, b) => (a.id === 'hub' ? -1 : b.id === 'hub' ? 1 : b.players - a.players));
      for (const room of list) box.append(this._roomCard(room));
      if (!list.length) box.append(this._roomsEmpty('No active rooms found'));
    } catch (e) {
      box.innerHTML = '';
      box.append(this._roomsEmpty('Could not reach the server'));
      this._err(e?.message ?? 'Could not load rooms');
    } finally {
      if (refresh) { refresh.disabled = false; }
    }
  },

  _roomCard(r) {
    const isHub = r.id === 'hub';
    const full = r.players >= r.max;
    const item = document.createElement('div');
    item.className = 'room-item' + (isHub ? ' hub' : '') + (full ? ' full' : '');

    const info = document.createElement('div');
    info.className = 'room-info';
    const name = document.createElement('span');
    name.className = 'room-name';
    name.textContent = r.name;

    const meta = document.createElement('span');
    meta.className = 'room-meta';
    const tags = [r.kind === 'dorm' && 'Dorm', r.pvp && 'Friendly Fire', r.villains && 'Villains', r.health === false && 'No Health', r.locked && 'Locked'].filter(Boolean);
    meta.textContent = `${r.players}/${r.max} Players` + (tags.length ? ` · ${tags.join(', ')}` : '');
    info.append(name, meta);

    const join = document.createElement('button');
    join.className = 'brick small' + (isHub ? ' yellow' : '');
    join.textContent = full ? 'FULL' : 'JOIN';
    join.disabled = full || !this.ready;
    if (!this.ready) join.title = 'The city is still loading';

    let passInput = null;
    if (r.locked) {
      passInput = document.createElement('input');
      passInput.type = 'password';
      passInput.className = 'room-pass';
      passInput.placeholder = 'Password';
    }

    join.onclick = async () => {
      join.disabled = true;
      try {
        const res = await this.net.request({ t: 'join', id: r.id, pass: passInput?.value }, ['joined', 'error']);
        this._joined(res);
      } catch (e) {
        this._err(e?.message ?? 'Could not join that room');
        join.disabled = false;
      }
    };

    item.onclick = e => { if (!e.target.closest('input, button') && !join.disabled) join.click(); };   // whole row is the menu item
    item.append(info);
    if (passInput) item.append(passInput);
    item.append(join);
    return item;
  },

  _roomsEmpty(title) {
    const empty = document.createElement('div');
    empty.className = 'room-empty';
    empty.textContent = title;
    return empty;
  },
});
