/**
 * Sfx.js — the game's sound effects, synthesised live with WebAudio (no files to load or decode).
 *
 * Everything runs through AudioCore's shared context and buses (sfx / ui), so master, category
 * volumes, mute and the limiter apply to it all. Per sound: a cooldown (no stacking), a priority
 * (when the voice budget is full, footsteps drop before rewards or UI), small random pitch/level
 * variation, and optional 3D position (distance fade + pan from the camera).
 *
 * Extra API: setMotion(speed, airborne, swinging) drives the swing wind loop; studs climb a
 * pentatonic ladder while you collect them in a row.
 */
import { audio, audioIfReady, duckMusic } from './AudioCore.js?v=3';

const VOICES = 22;
// Minimum gap per sound (s): stops footstep/hover/hit spam from stacking into noise
const COOLDOWN = {
  hover: 0.045, step: 0.085, hit: 0.035, shot: 0.05, energy: 0.06, melee: 0.045, boom: 0.09,
  snap: 0.04, whoosh: 0.12, thwip: 0.06, webhit: 0.05, land: 0.14, jump: 0.12, release: 0.1, block: 0.05,
  stud: 0.028, combo: 0.03, brick: 0.07, zip: 0.15, death: 0.05, tab: 0.05, slider: 0.06,
  milestone: 0.8, complete: 2, fail: 2, unlock: 1, mission: 1, objective: 0.6, countdown: 0.5, go: 0.5,
  join: 0.4, leave: 0.4, elim: 0.3, open: 0.15, close: 0.15, secret: 1, wallrun: 0.12,
};
const UI = new Set(['hover', 'snap', 'whoosh', 'back', 'tab', 'slider', 'open', 'close', 'join', 'leave', 'countdown', 'go']);
// 0 = first to drop when busy … 3 = always plays
const PRIORITY = { step: 0, hover: 0, wallrun: 0, stud: 1, swing: 1, jump: 1, combo: 1, release: 1,
  complete: 3, fail: 3, unlock: 3, milestone: 3, mission: 3, secret: 3, snap: 2, back: 2, countdown: 3, go: 3, elim: 2 };
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];   // major pentatonic ladder for stud streaks
const semi = n => Math.pow(2, n / 12);

export class Sfx {
  constructor() {
    this.enabled = true;
    this.listener = null;   // camera; set by the game so world sounds pan and fade with distance
    this.voices = 0;
    this._last = {};
    this._streak = 0; this._streakT = -9;
    this._v = null;         // scratch vector for positional maths
  }

  get ctx() { return audioIfReady()?.ctx ?? null; }

  _env(node, t0, dur, peak = 0.14, attack = 0.005) {
    const c = this.ctx, g = c.createGain();
    peak = Math.max(0.0002, peak * 2);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + Math.max(0.001, attack));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    node.connect(g);
    g.connect(this._out);
    this._end = Math.max(this._end, t0 + dur);
    return g;
  }

  _tone(type, f0, f1, dur, peak, t0 = this.ctx.currentTime, attack = 0.004) {
    const o = this.ctx.createOscillator();
    o.type = type;
    const k = this._pitch;
    o.frequency.setValueAtTime(Math.max(20, f0 * k), t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * k), t0 + dur);
    this._env(o, t0, dur, peak, attack);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  _noise(type, dur, peak, freq, Q, t0, sweepTo) {
    const c = this.ctx, src = c.createBufferSource();
    src.buffer = audioIfReady().noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;   // a different slice/colour each time
    const f = c.createBiquadFilter();
    f.type = type;
    if (Q) f.Q.value = Q;
    f.frequency.setValueAtTime(Math.max(60, freq * (type === 'bandpass' ? this._pitch : 1)), t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    src.connect(f);
    this._env(f, t0, dur, peak, 0.002);
    src.start(t0, Math.random()); src.stop(t0 + dur + 0.02);
  }
  _noiseBurst(dur, peak, freq, t0 = this.ctx.currentTime) { this._noise('lowpass', dur, peak, freq, 0, t0, 140); }
  _bandpassBurst(dur, peak, freq, Q = 2, t0 = this.ctx.currentTime) { this._noise('bandpass', dur, peak, freq, Q, t0); }
  _bell(f, t0, dur, peak) {   // two-partial plastic chime
    this._tone('sine', f, f, dur, peak, t0, 0.002);
    this._tone('sine', f * 2.76, f * 2.7, dur * 0.4, peak * 0.3, t0, 0.002);
  }
  _arp(notes, t0, gap, dur, peak, type = 'triangle') {
    notes.forEach((m, i) => this._tone(type, 440 * semi(m - 69), 440 * semi(m - 69), dur, peak, t0 + i * gap, 0.006));
  }

  /**
   * @param {string} kind  see the switch below
   * @param {{pos?:THREE.Vector3, vol?:number, pitch?:number, n?:number, value?:number, key?:string}} opts
   */
  play(kind, opts = {}) {
    if (!this.enabled) return;
    const core = audio();
    if (!core) return;
    const c = core.ctx, now = c.currentTime, pri = PRIORITY[kind] ?? 2;
    if (this.voices >= VOICES && pri < 3) return;
    if (this.voices >= VOICES * 0.7 && pri === 0) return;
    const ck = opts.key ? kind + opts.key : kind;
    if (now - (this._last[ck] ?? -1) < (COOLDOWN[kind] ?? 0.03)) return;
    this._last[ck] = now;

    let out = UI.has(kind) ? core.ui : core.sfx, gain = (opts.vol ?? 1) * (0.92 + Math.random() * 0.16);
    if (opts.pos && this.listener) {
      const cam = this.listener, d = cam.position.distanceTo(opts.pos);
      if (d > 95) return;
      gain *= 1 / (1 + Math.max(0, d - 5) * 0.09);
      if (gain < 0.04) return;   // too faint to matter: don't spend a voice
      const rel = (this._v ??= opts.pos.clone()).copy(opts.pos).applyMatrix4(cam.matrixWorldInverse);
      const pn = c.createStereoPanner();
      pn.pan.value = Math.max(-0.85, Math.min(0.85, rel.x / Math.max(4, Math.hypot(rel.x, rel.z))));
      pn.connect(out);
      out = pn;
    }
    const g = c.createGain();
    g.gain.value = gain;
    g.connect(out);

    this._out = g;
    this._end = now;
    this._pitch = opts.pitch ?? (0.94 + Math.random() * 0.12);
    this.voices++;
    try {
      this._voice(kind, now, opts);
    } finally {
      const ms = Math.max(60, (this._end - now) * 1000 + 40);
      setTimeout(() => { this.voices = Math.max(0, this.voices - 1); g.disconnect(); }, ms);
      this._out = null;
      this._pitch = 1;
    }
  }

  _voice(kind, now, opts) {
    switch (kind) {
      // ── Web slinging & movement ──
      case 'thwip': {   // pneumatic shooter trigger + air hiss + filament snap; three timbres so no two shots match
        const v = Math.floor(Math.random() * 3);
        this._tone('triangle', [920, 1040, 860][v], 220, 0.045, 0.07, now);
        this._bandpassBurst(0.08, 0.11, [3500, 3900, 3200][v], 2.2, now);
        this._bandpassBurst(0.05, 0.06, 5400, 3.2, now + 0.015);
        this._noise('highpass', 0.11, 0.03, 6000, 0, now + 0.02);
        break;
      }
      case 'zip':   // tight double thwip + rising pull
        this._tone('triangle', 1100, 260, 0.04, 0.06, now);
        this._bandpassBurst(0.06, 0.09, 3800, 2.4, now);
        this._noise('bandpass', 0.3, 0.07, 700, 1.1, now + 0.04, 2600);
        this._tone('sine', 220, 520, 0.28, 0.04, now + 0.05);
        break;
      case 'release':   // tension let go + air slip
        this._bandpassBurst(0.16, 0.045, 1900, 1.4, now);
        this._tone('sine', 280, 540, 0.11, 0.035, now);
        break;
      case 'webhit':   // sticky splat + anchor tension
        this._tone('sine', 320, 75, 0.07, 0.08, now);
        this._bandpassBurst(0.07, 0.09, 2100, 2.0, now);
        this._tone('triangle', 1300, 680, 0.035, 0.04, now + 0.018);
        break;
      case 'jump':
        this._tone('sine', 140, 340, 0.13, 0.07, now);
        this._bandpassBurst(0.11, 0.04, 850, 1.3, now);
        break;
      case 'land':   // ground thud + plastic slap
        this._tone('sine', 115, 32, 0.22, 0.16, now);
        this._noiseBurst(0.14, 0.11, 620, now);
        this._bandpassBurst(0.04, 0.06, 2200, 2.5, now + 0.01);
        break;
      case 'step':   // minifig plastic tap
        this._bandpassBurst(0.024, 0.032, 2700 + Math.random() * 500, 3.2, now);
        this._tone('sine', 460, 170, 0.018, 0.022, now);
        break;
      case 'wallrun':   // brighter, lighter scuff off a wall
        this._bandpassBurst(0.03, 0.03, 3600 + Math.random() * 600, 2.6, now);
        this._noise('highpass', 0.05, 0.015, 4500, 0, now);
        break;
      case 'swing':
        this._bandpassBurst(0.18, 0.05, 1100, 1.2, now);
        break;

      // ── Combat ──
      case 'melee': {   // jab / hook / kick: different body and crack each time
        const v = Math.floor(Math.random() * 3), body = [160, 130, 105][v], crack = [1850, 2300, 1500][v];
        this._tone('sine', body, 42, [0.09, 0.1, 0.13][v], 0.13, now);
        this._bandpassBurst(0.038, 0.14, crack, 1.8, now);
        this._tone('triangle', [950, 1150, 760][v], 280, 0.035, 0.06, now + 0.007);
        if (v === 2) this._noiseBurst(0.08, 0.05, 900, now);   // kick: extra low thump
        break;
      }
      case 'hit': {
        const v = Math.floor(Math.random() * 2);
        this._tone('triangle', v ? 400 : 330, 85, 0.07, 0.11, now);
        this._bandpassBurst(0.045, 0.12, v ? 2900 : 2400, 2.2, now);
        this._tone('sine', 140, 48, 0.06, 0.08, now);
        break;
      }
      case 'combo': {   // tick that climbs with the chain; small accent every 5
        const n = opts.n ?? 1, m = 72 + PENTA[Math.min(PENTA.length - 1, Math.floor(n / 2))];
        this._pitch = 1;
        this._tone('triangle', 440 * semi(m - 69), 440 * semi(m - 69), 0.05, 0.03, now, 0.002);
        if (n % 5 === 0) { this._bell(440 * semi(m - 57), now + 0.02, 0.22, 0.05); duckMusic(0.2, 0.15, 0.3); }
        break;
      }
      case 'boom':
        this._tone('sine', 95, 24, 0.55, 0.22, now);
        this._noiseBurst(0.46, 0.22, 1300, now);
        this._bandpassBurst(0.06, 0.16, 3100, 2.0, now);
        break;
      case 'shot':
        this._tone('triangle', 1350, 190, 0.08, 0.08, now);
        this._bandpassBurst(0.04, 0.09, 3400, 2.2, now);
        break;
      case 'energy':
        this._tone('sawtooth', 820, 220, 0.16, 0.05, now);
        this._tone('sine', 1640, 440, 0.12, 0.04, now);
        this._bandpassBurst(0.11, 0.04, 4600, 2.4, now);
        break;
      case 'block':
        this._tone('triangle', 2100, 1050, 0.06, 0.08, now);
        this._bandpassBurst(0.045, 0.08, 4100, 3.0, now);
        break;
      case 'ability':   // heroic D chord chime
        this._pitch = 1;
        this._tone('sine', 587.33, 587.33, 0.12, 0.06, now);
        this._tone('sine', 880, 880, 0.14, 0.06, now + 0.045);
        this._tone('sine', 1174.66, 1174.66, 0.22, 0.08, now + 0.09);
        this._bandpassBurst(0.24, 0.03, 3600, 2.0, now);
        break;
      case 'death':   // minifig pops apart
      case 'brick': { // LEGO bricks breaking and scattering: a cluster of hard plastic clacks
        if (kind === 'death') this._tone('sine', 280, 70, 0.12, 0.08, now);
        const n = kind === 'brick' ? 6 : 4;
        for (let i = 0; i < n; i++) {
          const t = now + i * (0.03 + Math.random() * 0.04) + (i ? 0.02 : 0);
          this._bandpassBurst(0.03, 0.1 * (1 - i / (n + 2)), 2300 + Math.random() * 1800, 2.8, t);
          if (i % 2 === 0) this._tone('triangle', 1600 + Math.random() * 900, 900, 0.02, 0.025, t);
        }
        break;
      }

      // ── Studs & rewards ──
      case 'stud': {   // a light "tink" that climbs while you keep collecting, then resets
        if (now - this._streakT > 0.45) this._streak = 0;
        this._streakT = now;
        const step = PENTA[this._streak++ % PENTA.length], v = opts.value ?? 10;
        const base = v >= 1000 ? 76 : v >= 100 ? 81 : 84;   // blue/gold studs sit lower and ring longer
        this._pitch = 1;
        const f = 440 * semi(base + step - 69) * (0.995 + Math.random() * 0.01);
        this._bell(f, now, v >= 100 ? 0.28 : 0.13, v >= 100 ? 0.05 : 0.03);
        if (v >= 100) this._tone('sine', f * 1.5, f * 1.5, 0.2, 0.02, now + 0.04);
        break;
      }
      case 'milestone':   // stud total crossed a big number: bright 4-note brick chime
        this._pitch = 1; duckMusic(0.45, 0.6, 0.6);
        [84, 88, 91, 96].forEach((m, i) => this._bell(440 * semi(m - 69), now + i * 0.07, 0.5, 0.05));
        this._noise('highpass', 0.6, 0.02, 7000, 0, now + 0.2);
        break;
      case 'objective':   // small, restrained: an objective ticked off
        this._pitch = 1;
        this._arp([79, 84], now, 0.08, 0.18, 0.05, 'sine');
        break;
      case 'mission':   // mission accepted: confident two-note call
        this._pitch = 1; duckMusic(0.3, 0.4, 0.5);
        this._arp([62, 69, 74], now, 0.09, 0.3, 0.05, 'triangle');
        this._tone('sine', 73.4, 73.4, 0.5, 0.08, now);
        break;
      case 'complete':   // mission complete: the big one
        this._pitch = 1; duckMusic(0.7, 1.4, 1.2);
        this._arp([67, 72, 76, 79], now, 0.09, 0.35, 0.05, 'triangle');
        this._arp([72, 76, 79, 84], now + 0.4, 0, 1.3, 0.035, 'sine');   // held chord
        this._tone('sine', 65.4, 65.4, 1.4, 0.1, now + 0.4);
        this._noise('highpass', 1.2, 0.025, 6500, 0, now + 0.4);
        break;
      case 'fail':
        this._pitch = 1; duckMusic(0.6, 1, 1);
        this._arp([67, 63, 60, 55], now, 0.14, 0.35, 0.05, 'triangle');
        this._tone('sine', 98, 49, 0.9, 0.08, now + 0.42);
        break;
      case 'unlock':   // new character / ability / suit
      case 'secret': {
        this._pitch = 1; duckMusic(0.55, 0.9, 0.8);
        const root = kind === 'secret' ? 74 : 79;
        for (let i = 0; i < 6; i++) this._bell(440 * semi(root + PENTA[i] - 69), now + i * 0.045, 0.4, 0.035);
        this._arp([root - 12, root - 5, root], now + 0.3, 0, 0.9, 0.035, 'sine');
        break;
      }

      // ── Multiplayer / match flow ──
      case 'countdown': this._pitch = 1; this._tone('square', 660, 660, 0.09, 0.03, now, 0.002); break;
      case 'go': this._pitch = 1; this._arp([76, 88], now, 0, 0.35, 0.04, 'square'); duckMusic(0.3, 0.3, 0.4); break;
      case 'join': this._pitch = 1; this._arp([72, 79], now, 0.07, 0.14, 0.035, 'sine'); break;
      case 'leave': this._pitch = 1; this._arp([79, 72], now, 0.07, 0.14, 0.03, 'sine'); break;
      case 'elim': this._tone('sine', 300, 60, 0.3, 0.09, now); this._voice('brick', now, opts); break;

      // ── Interface: LEGO plastic ──
      case 'snap':   // two bricks clicking together
        this._tone('triangle', 2200, 850, 0.02, 0.055, now);
        this._bandpassBurst(0.032, 0.09, 3600, 2.6, now + 0.01);
        this._tone('sine', 600, 260, 0.03, 0.045, now + 0.01);
        break;
      case 'hover': this._tone('triangle', 2300, 1400, 0.022, 0.02, now); break;
      case 'tab': this._tone('triangle', 1700, 1100, 0.03, 0.03, now); this._bandpassBurst(0.02, 0.04, 3200, 3, now); break;
      case 'slider': this._tone('sine', 900 + (opts.value ?? 0.5) * 900, 900 + (opts.value ?? 0.5) * 900, 0.04, 0.03, now, 0.002); break;
      case 'whoosh': this._bandpassBurst(0.15, 0.04, 1500, 1.3, now); break;
      case 'open': this._noise('bandpass', 0.18, 0.04, 700, 1.3, now, 2400); this._tone('sine', 520, 780, 0.08, 0.025, now + 0.06); break;
      case 'close': this._noise('bandpass', 0.16, 0.035, 2200, 1.3, now, 600); this._tone('sine', 700, 420, 0.07, 0.025, now + 0.04); break;
      case 'back': this._tone('sine', 520, 200, 0.05, 0.04, now); break;
      default: this._tone('triangle', 480, 240, 0.06, 0.03, now);
    }
  }

  /** Continuous wind: silent when slow, rushing when swinging or diving fast. Call every frame. */
  setMotion(speed, airborne, swinging) {
    const core = audioIfReady();
    if (!core || core.ctx.state !== 'running') return;
    const c = core.ctx;
    if (!this._wind) {
      const src = c.createBufferSource(); src.buffer = core.noise; src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.7; f.frequency.value = 500;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(core.sfx); src.start();
      this._wind = { f, g };
    }
    const x = airborne ? Math.max(0, Math.min(1, (speed - 9) / 36)) : 0;
    const t = c.currentTime;
    this._wind.g.gain.setTargetAtTime(this.enabled ? x * x * (swinging ? 0.16 : 0.12) : 0, t, 0.15);
    this._wind.f.frequency.setTargetAtTime(380 + x * 1500, t, 0.2);
  }
}
