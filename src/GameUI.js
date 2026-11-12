/**
 * GameUI.js — DOM side of the game: LEGO heart tiles, objective, boss icon + hearts, mission marker,
 * cutscene letterbox + floating dialogue, screen shake.
 */
import * as THREE from 'three';
import { settings } from './Settings.js?v=62';
import { voice } from './Voice.js?v=3';

// Round portraits ripped from the game; everyone else gets a crop of their decoded face texture
const ICONS = {
  spiderman: 'assets/ui/spidey_portrait.png',
  loki: 'assets/ui/lego/Portraits/Loki.png',
  magneto: 'assets/ui/lego/Portraits/Magneto.png',
};
const BOSS_HEARTS = 10;

/** Glossy LEGO-plastic heart tile (SVG data URL): moulded face, rim highlight, dark outline. */
function heartURL(fill, light, dark) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 27'>
    <path d='M15 25.5C6 19 1.5 13.6 1.5 8.4 1.5 4.6 4.4 1.6 8.1 1.6c2.9 0 5.3 1.7 6.9 4.3 1.6-2.6 4-4.3 6.9-4.3 3.7 0 6.6 3 6.6 6.8 0 5.2-4.5 10.6-13.5 17.1z' fill='${dark}' stroke='#141414' stroke-width='2.4' stroke-linejoin='round'/>
    <path d='M15 22.2C7.6 16.6 4.2 12.3 4.2 8.5c0-2.3 1.8-4.2 4-4.2 2.4 0 4 1.6 5.6 4.4h2.4c1.6-2.8 3.2-4.4 5.6-4.4 2.2 0 4 1.9 4 4.2 0 3.8-3.4 8.1-10.8 13.7z' fill='${fill}'/>
    <path d='M7 7.5c.4-1.3 1.4-2 2.6-2' stroke='${light}' stroke-width='2.2' fill='none' stroke-linecap='round'/>
  </svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/**
 * LEGO-game "mumble" voices: short syllable blips through a vowel-like band-pass filter.
 * Every speaker gets a stable pitch from their name (deeper for some, higher for others).
 */
/** Babble a line of text in a random passer-by voice (used by street chatter). */
export function mumble(text, name = 'passer' + Math.floor(Math.random() * 9)) {
  const v = Mumble.voiceOf(name);
  let k = 0;
  const n = Math.min(14, Math.ceil(text.length / 3));
  const iv = setInterval(() => { Mumble.syllable(v); if (++k >= n) clearInterval(iv); }, 70);
}

const Mumble = {
  ctx: null,
  voiceOf(name) {
    let h = 0;
    for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const high = /gwen|may|mary|jane|mj|scientist|reporter/i.test(name);
    return { base: (high ? 230 : 120) + (h % 70), wobble: 0.15 + ((h >> 8) % 10) / 60 };
  },
  syllable(voice) {
    const vol = settings.get('sfxVol');
    if (vol <= 0) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx ??= new AC();
    const c = this.ctx, t = c.currentTime;
    if (c.state === 'suspended') c.resume().catch(() => {});
    const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth';
    const p = voice.base * (1 + (Math.random() - 0.5) * voice.wobble * 2);
    o.frequency.setValueAtTime(p, t);
    o.frequency.exponentialRampToValueAtTime(p * (0.85 + Math.random() * 0.3), t + 0.09);
    f.type = 'bandpass';
    f.frequency.value = 500 + Math.random() * 1300;          // a different "vowel" each syllable
    f.Q.value = 1.6;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085 + Math.random() * 0.04);
    o.connect(f); f.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + 0.14);
  },
};

/** Two-tone phone ring. */
function ring() {
  const vol = settings.get('sfxVol');
  if (vol <= 0) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  Mumble.ctx ??= new AC();
  const c = Mumble.ctx;
  for (let k = 0; k < 6; k++) {
    const t = c.currentTime + k * 0.11, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = k % 2 ? 1320 : 1760;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12 * vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.11);
  }
}

// The dialogue blips get their context lazily, maybe outside a gesture: wake it on the next one.
for (const ev of ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown']) window.addEventListener(ev, () => {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC && !Mumble.ctx) Mumble.ctx = new AC();
  if (Mumble.ctx?.state === 'suspended') Mumble.ctx.resume().catch(() => {});
}, true);

// Characters with an extracted minifig but no ripped portrait render from the model
const MODEL_FACES = new Set(['uncleben']);

export function setFace(el, face) {
  if (MODEL_FACES.has(face)) face = 'glb:' + face;
  if (String(face).startsWith('glb:')) {
    // Rendered from the character's extracted model (initials until it's ready)
    const name = face.slice(4);
    setFace(el, `init:${name.slice(0, 2).toUpperCase()}:5a6a7a`);
    el.dataset.want = face;
    import('./Portrait.js?v=217').then(m => m.portraitURL(face, 'head')).then(url => {
      if (el.dataset.want !== face) return;
      el.classList.remove('initials', 'crop'); el.classList.add('icon');
      delete el.dataset.init;
      el.style.backgroundColor = '#f6c21a';
      el.style.backgroundImage = `url(${url})`;
    }).catch(() => {});
    return;
  }
  delete el.dataset.want;
  if (String(face).startsWith('init:')) {
    const [, txt, col] = face.split(':');
    el.classList.remove('icon', 'crop');
    el.style.backgroundImage = 'none';
    el.style.backgroundColor = `#${col}`;
    el.dataset.init = txt;
    el.classList.add('initials');
    return;
  }
  el.classList.remove('initials');
  el.style.backgroundColor = '';
  delete el.dataset.init;
  const icon = ICONS[face];
  el.classList.toggle('icon', !!icon);
  el.classList.toggle('crop', !icon);
  el.style.backgroundImage = `url(${icon ?? `assets/models/chars/${face}_head.png`})`;
}

export class GameUI {
  constructor() {
    const $ = id => document.getElementById(id);
    this.el = {
      hearts: $('hearts'), objective: $('objective'), objText: $('objective-text'),
      boss: $('boss-bar'), bossName: $('boss-name'), bossFace: $('boss-face'), bossHearts: $('boss-hearts'),
      dialog: $('dialog'), dialogFace: $('dialog-face'), dialogName: $('dialog-name'), dialogText: $('dialog-text'),
      hurt: $('hurt-vignette'), marker: $('marker'), markerDist: $('marker-dist'),
    };
    const root = document.documentElement.style;
    root.setProperty('--heart-full', heartURL('#e3201b', '#ffb3a8', '#8a0a0c'));
    root.setProperty('--heart-empty', heartURL('#3b3e44', '#5a5e63', '#232529'));
    this._dir = new THREE.Vector3();
    this._shake = 0;
    this._advance = null;
    this._v = new THREE.Vector3();
    const advance = () => this._advance?.();
    document.addEventListener('keydown', e => {
      if (!this.el.dialog?.classList.contains('show')) return;
      if (['Space', 'Enter', 'NumpadEnter'].includes(e.code)) {
        e.preventDefault(); e.stopImmediatePropagation(); advance();
      }
      if (e.code === 'Backspace') {
        e.preventDefault(); e.stopImmediatePropagation(); this.skipAll = true; advance();
      }
    }, true);
    this.el.dialog?.addEventListener('click', advance);
    // Cutscenes: swallow every gameplay key and click (attacks, abilities, emotes, webs, gadgets).
    // Only dialogue advance/skip and Escape (pause) get through.
    const inScene = () => document.body.classList.contains('cinematic');
    const PASS = ['Space', 'Enter', 'NumpadEnter', 'Backspace', 'Escape'];
    window.addEventListener('keydown', e => {   // key-ups pass so nothing stays held after the scene
      if (!inScene() || PASS.includes(e.code)) return;
      if (e.target?.closest?.('input, textarea, [contenteditable]')) return;   // chat still types
      e.stopImmediatePropagation();
      e.preventDefault();
    }, true);
    for (const ev of ['mousedown', 'pointerdown', 'contextmenu', 'wheel']) window.addEventListener(ev, e => {
      if (inScene() && e.target?.tagName === 'CANVAS') { e.stopImmediatePropagation(); if (ev !== 'wheel') e.preventDefault(); }
    }, { capture: true, passive: false });
  }

  _fillHearts(box, n, max) {
    if (!box) return;
    if (box.children.length !== max) {
      box.innerHTML = '';
      for (let i = 0; i < max; i++) box.appendChild(Object.assign(document.createElement('span'), { className: 'heart' }));
    }
    [...box.children].forEach((s, i) => {
      const empty = i >= n;
      if (empty && !s.classList.contains('empty') && box === this.el.hearts) {   // pop the heart you just lost
        s.classList.remove('lost'); void s.offsetWidth; s.classList.add('lost');
      }
      s.classList.toggle('empty', empty);
    });
  }

  /** A quick line from someone fighting beside you (no cutscene, fades after a few seconds). */
  bark(name, face, text) {
    voice.speak(name, text);
    let el = document.getElementById('bark');
    if (!el) {
      el = Object.assign(document.createElement('div'), { id: 'bark' });
      el.innerHTML = '<div class="face bark-face"></div><div><div class="bark-name"></div><div class="bark-text"></div></div>';
      document.body.append(el);
    }
    setFace(el.querySelector('.bark-face'), face);
    el.querySelector('.bark-name').textContent = String(name).toUpperCase();
    el.querySelector('.bark-text').textContent = text;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  /** Mission title card: chapter line + mission name slide in, then away. */
  missionCard(top, name) {
    let el = document.getElementById('mission-card');
    if (!el) {
      el = Object.assign(document.createElement('div'), { id: 'mission-card' });
      el.innerHTML = '<div class="mc-top"></div><div class="mc-name"></div>';
      document.body.append(el);
    }
    el.querySelector('.mc-top').textContent = String(top).toUpperCase();
    el.querySelector('.mc-name').textContent = String(name).toUpperCase();
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  setHearts(n, max) {
    this._fillHearts(this.el.hearts, n, max);
    document.body.classList.toggle('low-health', n <= 1 && n > 0 && max > 1);
  }

  /**
   * The objective pops up at the top of the screen for 5 s when it changes (kill counts like
   * "3/6" don't count as a change), then reminds you for 5 s every 50 s. No constant clutter.
   */
  setObjective(text) {
    const el = this.el.objective;
    if (!el) return;
    if (!text) { this._objBase = null; clearInterval(this._objTimer); el.classList.remove('show'); return; }
    this.el.objText.textContent = text;
    const base = text.replace(/\s*\d+\/\d+\s*$/, '');
    if (base === this._objBase) return;
    this._objBase = base;
    this._popObjective();
    clearInterval(this._objTimer);
    this._objTimer = setInterval(() => this._popObjective(), 50000);
  }

  _popObjective() {
    const el = this.el.objective;
    // "Go to the marker" only matters when you're actually far from it
    if (/marker/i.test(this._objBase ?? '') && (this._markDist ?? Infinity) < 30) return;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this._objHide);
    this._objHide = setTimeout(() => el.classList.remove('show'), 5000);
  }

  /** Boss icon on top, hearts underneath. `null` hides it. */
  setBoss(name, frac, face) {
    const b = this.el;
    b.boss?.classList.toggle('show', !!name);
    if (!name) { this._bossFace = null; return; }
    if (this._bossFace !== face) { setFace(b.bossFace, face); this._bossFace = face; }
    b.bossName.textContent = name.toUpperCase();
    this._fillHearts(b.bossHearts, Math.ceil(Math.max(0, frac) * BOSS_HEARTS), BOSS_HEARTS);
  }

  /** Point the on-screen marker at a world position (null hides it). */
  updateMarker(pos, camera, from) {
    const m = this.el.marker;
    if (!m) return;
    this._markDist = pos ? from.distanceTo(pos) : Infinity;
    // Close by, the beam in the world is enough: no screen marker
    m.classList.toggle('show', !!pos && this._markDist > 30);
    if (!pos) { const od = document.getElementById('objective-dist'); if (od && od.textContent) od.textContent = ''; return; }
    const v = this._v.copy(pos).setY(pos.y + 3).project(camera);
    const w = innerWidth, h = innerHeight, pad = 40;
    let x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
    if (v.z > 1) { x = w - x; y = h - pad; } // behind the camera: pin to the bottom edge
    x = Math.min(w - pad, Math.max(pad, x));
    y = Math.min(h - pad, Math.max(pad + 60, y));
    if (x < 230) y = Math.min(y, h - 230); // keep clear of the minimap
    m.style.left = `${x}px`;
    m.style.top = `${y}px`;
    const dist = `${Math.round(from.distanceTo(pos))}m`;
    this.el.markerDist.textContent = dist;
    // Objective tracker: distance + an arrow pointing at the target relative to the camera
    const od = document.getElementById('objective-dist'), oa = document.getElementById('objective-arrow');
    if (od) od.textContent = dist;
    if (oa) {
      camera.getWorldDirection(this._dir);
      const fx = this._dir.x, fz = this._dir.z, dx = pos.x - from.x, dz = pos.z - from.z;
      const ang = Math.atan2(-fz * dx + fx * dz, fx * dx + fz * dz);
      oa.style.transform = `rotate(${ang.toFixed(3)}rad)`;
    }
  }

  hurt() {
    const v = this.el.hurt;
    if (!v) return;
    v.classList.remove('on');
    document.body.classList.remove('hurt-shake');
    void v.offsetWidth;
    v.classList.add('on');
    document.body.classList.add('hurt-shake');
    clearTimeout(this._shakeT);
    this._shakeT = setTimeout(() => document.body.classList.remove('hurt-shake'), 400);
  }

  shake(amount) { this._shake = Math.max(this._shake, amount); }

  /** Called every frame; returns a camera offset for screen shake. */
  shakeOffset(dt) {
    this._shake = Math.max(0, this._shake - dt * 1.5);
    const s = this._shake * this._shake;
    return { x: (Math.random() - 0.5) * s, y: (Math.random() - 0.5) * s };
  }

  cinematic(on) {
    document.body.classList.toggle('cinematic', on);
    if (!on) this.el.dialog?.classList.remove('show');
  }

  fade(on, duration = 550) {
    let el = document.getElementById('story-fade');
    if (!el) {
      el = Object.assign(document.createElement('div'), { id: 'story-fade' });
      document.body.append(el);
    }
    el.style.transitionDuration = `${Math.max(0, duration)}ms`;
    el.classList.toggle('on', !!on);
    return new Promise(resolve => setTimeout(resolve, Math.max(0, duration)));
  }

  /** Typewriter one line of dialogue, spoken aloud; resolves when the player advances (or the line ends). */
  say(name, face, text) {
    const d = this.el;
    if (this.skipAll) return Promise.resolve();
    d.dialog.classList.add('show');
    d.dialogName.textContent = name.toUpperCase();
    setFace(d.dialogFace, face);
    d.dialogText.textContent = '';
    return new Promise(resolve => {
      let i = 0, voiced = voice.enabled && (!!window.speechSynthesis || voice.files === null || Object.keys(voice.files).length > 0);
      const mv = Mumble.voiceOf(name);
      let beat = 0;
      const typer = setInterval(() => {
        i += 2;
        d.dialogText.textContent = text.slice(0, i);
        // A mumbled syllable every few letters, only when nothing is actually speaking the line
        if (!voiced && ++beat % 3 === 0 && /[a-z]/i.test(text[i - 1] ?? '')) Mumble.syllable(mv);
        if (i >= text.length) clearInterval(typer);
      }, 22);
      let auto = setTimeout(() => this._advance?.(), 3500 + text.length * 45);
      voice.speak(name, text).then(ok => {
        if (!ok) { voiced = false; return; }
        if (this._advance !== adv) return;
        clearTimeout(auto);
        auto = setTimeout(() => this._advance === adv && adv(true), 650);   // a beat of silence, then the next line
      });
      const adv = (fromVoice) => {
        if (i < text.length && !this.skipAll && !fromVoice) { i = text.length; d.dialogText.textContent = text; return; }
        if (!fromVoice) voice.stop();
        clearInterval(typer);
        clearTimeout(auto);
        this._advance = null;
        resolve();
      };
      this._advance = adv;
    });
  }

  /**
   * A phone call while you play: ring, pick up, then each line is voiced with a caller-ID card in the corner.
   * Never locks input. `lines` = [[ [name, face], text ], ...]; the first speaker is the caller.
   */
  async call(lines) {
    if (!lines?.length) return;
    while (this._onCall) await new Promise(r => setTimeout(r, 400));   // one call at a time
    this._onCall = true;
    let el = document.getElementById('phone');
    if (!el) {
      el = Object.assign(document.createElement('div'), { id: 'phone' });
      el.innerHTML = '<div class="face ph-face"></div>'
        + '<div class="ph-card"><div class="ph-tag"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg><span class="ph-name"></span></div>'
        + '<div class="ph-line"></div><div class="ph-meta"><span class="ph-state"></span><span class="ph-time"></span></div></div>';
      document.body.append(el);
    }
    const caller = lines.find(([w]) => w[0] !== 'Peter')?.[0] ?? lines[0][0];
    const $ = s => el.querySelector(s);
    setFace($('.ph-face'), caller[1]);
    $('.ph-name').textContent = caller[0].toUpperCase();
    $('.ph-state').textContent = 'Incoming call';
    $('.ph-time').textContent = '';
    $('.ph-line').textContent = '';
    el.className = 'show ringing';
    for (let k = 0; k < 2; k++) { ring(); await new Promise(r => setTimeout(r, 900)); }
    el.className = 'show live';
    $('.ph-state').textContent = 'On call';
    const t0 = performance.now();
    const clock = setInterval(() => {
      const s = Math.floor((performance.now() - t0) / 1000);
      $('.ph-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }, 500);
    for (const [who, text] of lines) {
      if (this._hangUp) break;
      if (who[0] === 'Peter') { await this._typeSub(text); continue; }
      $('.ph-line').innerHTML = '';
      $('.ph-line').append(Object.assign(document.createElement('b'), { textContent: who[0] === caller[0] ? '' : `${who[0]}: ` }), text);
      el.classList.toggle('me', who[0] === 'Peter');
      const shown = new Promise(r => setTimeout(r, 1800 + text.length * 55));
      const spoke = await voice.speak(who[0], text);
      if (!spoke) { mumble(text, who[0]); await shown; } else await new Promise(r => setTimeout(r, 350));
    }
    clearInterval(clock);
    $('.ph-state').textContent = 'Call ended';
    await new Promise(r => setTimeout(r, 900));
    el.className = '';
    this._hangUp = false;
    this._onCall = false;
  }

  /** Peter's side of a call: white text typed out at the bottom of the screen, no box, no voice. */
  async _typeSub(text) {
    let sub = document.getElementById('call-sub');
    if (!sub) {
      sub = Object.assign(document.createElement('div'), { id: 'call-sub' });
      sub.style.cssText = 'position:fixed;left:50%;bottom:9%;transform:translateX(-50%);width:min(90vw,900px);'
        + 'text-align:center;color:#fff;font-family:var(--font-display);font-size:clamp(18px,2.4vw,30px);'
        + 'letter-spacing:.03em;line-height:1.25;text-shadow:0 2px 0 #000,0 0 6px rgba(0,0,0,.8);'
        + 'pointer-events:none;z-index:60;transition:opacity .3s;';
      document.body.append(sub);
    }
    sub.style.opacity = '1';
    sub.textContent = 'Peter: ';
    for (const ch of text) {
      if (this._hangUp) break;
      sub.textContent += ch;
      await new Promise(r => setTimeout(r, /[.,!?]/.test(ch) ? 65 : 14));
    }
    await new Promise(r => setTimeout(r, 650 + text.length * 9));
    sub.style.opacity = '0';
    await new Promise(r => setTimeout(r, 300));
  }
}
