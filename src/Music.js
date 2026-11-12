/**
 * Music.js — background music and city ambience, synthesised live with WebAudio.
 *
 * An addictive, high-energy modern superhero beat (Spider-Verse inspired, 118 BPM) featuring
 * fat 808 sub-bass glides, punchy kicks, crisp snappy claps, silky rolling hi-hats, warm cinematic
 * pads, and a hypnotic melodic pluck hook. Scheduled ahead with WebAudio for zero jitter.
 */
import { settings } from './Settings.js?v=62';
import { onAudioReady } from './AudioCore.js?v=3';

const BPM = 118;
const STEP = 60 / BPM / 4; // 16th note (~0.127s)

// Cinematic superhero progression in A minor: Am9 -> Fmaj7 -> Dm9 -> Em7
const CHORDS = [
  [57, 60, 64, 67], // Am7 / Am9 (A3, C4, E4, G4)
  [53, 57, 60, 64], // Fmaj7 (F3, A3, C4, E4)
  [50, 57, 60, 65], // Dm9 (D3, A3, C4, F4)
  [52, 59, 62, 67]  // Em7 (E3, B3, D4, G4)
];
const BASS_NOTES = [33, 29, 26, 28]; // Sub roots: A1 (55Hz), F1 (43.6Hz), D1 (36.7Hz), E1 (41.2Hz)

const hz = m => 440 * Math.pow(2, (m - 69) / 12);

// Catchy syncopated melodic hook phrases (relative midi offsets above chord root)
const HOOK_NOTES = [
  // Bar 0: [step, noteOffset]
  [[0, 12], [3, 15], [6, 19], [8, 15], [11, 12], [14, 10]],
  // Bar 1
  [[0, 12], [3, 14], [6, 17], [10, 14], [12, 12]],
  // Bar 2
  [[0, 12], [3, 15], [6, 19], [8, 22], [11, 19], [14, 15]],
  // Bar 3
  [[0, 17], [3, 15], [6, 14], [9, 12], [12, 14], [14, 15]]
];

class Soundtrack {
  constructor() {
    this.ctx = null; this.step = 0; this.next = 0; this.timer = null;
    // Adaptive state: main.js feeds energy (0 calm .. 1 flat-out) + combat/boss every frame.
    this.energy = 0.15; this.want = { energy: 0.15, combat: false, boss: false };
    this.layer = { drums: false, hook: false, peak: false, boss: false, combat: false };
    this.resolveBars = 0;
    onAudioReady(core => this._start(core));
  }

  /** Called every frame by the game. Rises quickly, settles slowly, so the score never flickers. */
  setState(want, dt) {
    this.want = want; this._setAt = performance.now();
    const k = want.energy > this.energy ? 1.2 : 0.12;
    this.energy += (want.energy - this.energy) * Math.min(1, dt * k);
  }
  /** Mission over: two quiet bars of resolution before the groove comes back. */
  resolve() { this.resolveBars = 2; }

  _start(core) {
    const c = this.ctx = core.ctx;
    this.music = core.music; this.ambBus = core.amb;

    // Warm pink noise bed for claps, hats and city ambience (built once)
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      d[i] = (b0 + b1 + b2 + white * 0.5362) * 0.45;
    }
    this.noise = buf;

    this.next = c.currentTime + 0.1;
    this.timer = setInterval(() => this._schedule(), 80);
    this._ambLoop();
  }

  /** Bar line: latch which layers play this bar from the smoothed energy (changes land on the beat). */
  _latch() {
    if (performance.now() - (this._setAt ?? 0) > 1000) {   // nobody driving it (menus, pause): settle to calm
      this.want = { energy: 0.15 }; this.energy = Math.max(0.15, this.energy * 0.5);
    }
    const e = this.resolveBars > 0 ? 0.1 : this.energy, w = this.want;
    if (this.resolveBars > 0) this.resolveBars--;
    this.layer = { drums: e > 0.22, hook: e > 0.45, peak: e > 0.72, combat: !!w.combat && e > 0.3, boss: !!w.boss };
  }

  // ── Instrument Synthesizers ──

  // Fat, rounded 808 Sub-Bass with pitch-drop punch & smooth slides
  _808(t, f0, dur, slideTo = null, vol = 0.38) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
    o.type = 'sine';
    // Punch transient: quick sweep from higher pitch down to sub fundamental
    o.frequency.setValueAtTime(f0 * 2.2, t);
    o.frequency.exponentialRampToValueAtTime(f0, t + 0.032);
    if (slideTo) {
      o.frequency.setValueAtTime(f0, t + dur * 0.4);
      o.frequency.exponentialRampToValueAtTime(slideTo, t + dur * 0.85);
    }
    fl.type = 'lowpass'; fl.frequency.value = 380;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.setValueAtTime(vol * 0.85, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(this.music);
    o.start(t); o.stop(t + dur + 0.04);
  }

  // Punchy, chest-thumping Kick Drum
  _kick(t, vol = 0.85) {
    const c = this.ctx;
    // Layer 1: Pitch sweep sub body
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(155, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.05);
    o.frequency.exponentialRampToValueAtTime(32, t + 0.22);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(g); g.connect(this.music);
    o.start(t); o.stop(t + 0.26);

    // Layer 2: Tight click transient
    const s = c.createBufferSource(), fl = c.createBiquadFilter(), cg = c.createGain();
    s.buffer = this.noise;
    fl.type = 'bandpass'; fl.frequency.value = 3400; fl.Q.value = 1.8;
    cg.gain.setValueAtTime(vol * 0.35, t);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
    s.connect(fl); fl.connect(cg); cg.connect(this.music);
    s.start(t, Math.random()); s.stop(t + 0.03);
  }

  // Snappy modern trap clap / snare crack
  _snare(t, vol = 0.5) {
    const c = this.ctx;
    // Flam: pre-clap click 12ms before
    const flam = c.createBufferSource(), fg = c.createGain(), fl = c.createBiquadFilter();
    flam.buffer = this.noise;
    fl.type = 'bandpass'; fl.frequency.value = 2400; fl.Q.value = 1.5;
    fg.gain.setValueAtTime(vol * 0.25, t);
    fg.gain.exponentialRampToValueAtTime(0.0001, t + 0.015);
    flam.connect(fl); fl.connect(fg); fg.connect(this.music);
    flam.start(t, Math.random()); flam.stop(t + 0.02);

    // Main crack
    const mainT = t + 0.012;
    const s = c.createBufferSource(), sg = c.createGain(), sf = c.createBiquadFilter();
    s.buffer = this.noise;
    sf.type = 'highpass'; sf.frequency.value = 1600;
    sg.gain.setValueAtTime(vol * 0.8, mainT);
    sg.gain.exponentialRampToValueAtTime(0.0001, mainT + 0.16);
    s.connect(sf); sf.connect(sg); sg.connect(this.music);
    s.start(mainT, Math.random()); s.stop(mainT + 0.18);

    // Tonal body pop
    const body = c.createOscillator(), bg = c.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(210, mainT);
    body.frequency.exponentialRampToValueAtTime(120, mainT + 0.06);
    bg.gain.setValueAtTime(vol * 0.45, mainT);
    bg.gain.exponentialRampToValueAtTime(0.0001, mainT + 0.07);
    body.connect(bg); bg.connect(this.music);
    body.start(mainT); body.stop(mainT + 0.08);
  }

  // Silky, dynamic Hi-Hat
  _hat(t, vol = 0.12, open = false) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise;
    f.type = 'highpass'; f.frequency.value = 8500;
    const dur = open ? 0.16 : 0.038;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.music);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }

  // Hypnotic, glassy melodic pluck (warm sine/triangle with soft filter envelope)
  _pluck(t, f, vol = 0.08, dur = STEP * 1.5) {
    const c = this.ctx, o1 = c.createOscillator(), o2 = c.createOscillator();
    const g = c.createGain(), fl = c.createBiquadFilter();
    o1.type = 'triangle'; o1.frequency.setValueAtTime(f, t);
    o2.type = 'sine'; o2.frequency.setValueAtTime(f * 2, t); // shimmering octave overtone

    fl.type = 'lowpass';
    fl.frequency.setValueAtTime(3200, t);
    fl.frequency.exponentialRampToValueAtTime(750, t + dur);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    o1.connect(fl); o2.connect(fl);
    fl.connect(g); g.connect(this.music);
    o1.start(t); o1.stop(t + dur + 0.04);
    o2.start(t); o2.stop(t + dur + 0.04);
  }

  // Warm cinematic chord pad
  _pad(t, notes, dur, vol = 0.032) {
    const c = this.ctx;
    for (const n of notes) {
      const o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
      o.type = 'triangle';
      o.frequency.setValueAtTime(hz(n), t);
      fl.type = 'lowpass'; fl.frequency.value = 1350;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.35);
      g.gain.setValueAtTime(vol, t + dur - 0.25);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(fl); fl.connect(g); g.connect(this.music);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }

  // ── Sequencer (Psychologically Addictive 16-Bar Dynamic Cycle) ──
  _schedule() {
    if (!settings.get('music')) { this.next = this.ctx.currentTime + 0.1; return; }
    while (this.next < this.ctx.currentTime + 0.35) {
      const s = this.step, t = this.next;
      const bar = Math.floor(s / 16) % 16;
      const chIdx = bar % 4;
      const i = s % 16;
      const ch = CHORDS[chIdx];
      const baseNote = BASS_NOTES[chIdx];

      // Dynamic arrangement phases:
      // Bars 0-3: Intro / Groove Warmup (Punchy Sub + Kick + Hats + Pad)
      // Bars 4-7: Drop 1 (Full 808 Glide + Claps + Addictive Pluck Melody)
      // Bars 8-11: High Energy Peak (Drums + Double-Time Hats + Melodic Hook + Accent Riffs)
      // Bars 12-15: Breakdown / Build with turnaround fill into next drop
      if (i === 0) this._latch();
      const L = this.layer;
      // Layers from gameplay energy: 0 = pad + sub only, 1 = groove + hook, 2 = peak.
      const phase = !L.drums ? 0 : L.peak || L.combat ? 2 : 1;
      const isBreakdown = L.drums && bar === 15 && i >= 8;

      // ── KICK DRUM ──
      // Bouncy syncopated groove: 1, 3+, & turnaround punches
      if (!isBreakdown) {
        if (i === 0 || i === 8 || (phase > 0 && i === 10) || (phase === 2 && (i === 6 || i === 14))) {
          this._kick(t, 0.9);
        }
      } else if (bar === 15 && (i === 8 || i === 11 || i === 14)) {
        this._kick(t, 0.85); // Buildup kick roll
      }

      // ── SNARE / CLAP ──
      // Hard hits on 2 and 4 (step 4 & 12)
      if (!isBreakdown) {
        if (phase > 0 && (i === 4 || i === 12)) {
          this._snare(t, 0.55);
        }
      } else {
        // Buildup turnaround snare roll
        if (i % 2 === 0) this._snare(t, 0.35 + (i / 16) * 0.3);
      }

      // ── HI-HATS ──
      // Dynamic trap-style 16th hats with volume groove & occasional 32nd roll
      if (phase > 0 && !isBreakdown) {
        // Off-beat open hat on step 4 & 12 (or step 2 & 10 in peak)
        if (phase === 2 && (i === 2 || i === 10)) {
          this._hat(t, 0.16, true);
        }
        // Closed hats with humanized velocity
        const hatVel = (i % 4 === 0) ? 0.14 : (i % 2 === 0) ? 0.09 : 0.055;
        this._hat(t, hatVel, false);

        // Rapid 32nd-note hat roll on step 14 & 15 every 2 bars
        if (bar % 2 === 1 && (i === 14 || i === 15)) {
          this._hat(t + STEP * 0.5, 0.08, false);
        }
      } else if (phase === 0 && i % 2 === 0) {
        // Subtle 8th-note hat in intro
        this._hat(t, 0.08, false);
      }

      // ── 808 SUB-BASS ──
      // Addictive, syncopated 808 pattern with slides
      if (!isBreakdown) {
        const rootHz = hz(baseNote);
        if (i === 0) {
          this._808(t, rootHz, STEP * 3.8, null, 0.45);
        } else if (i === 6) {
          // Slide up an octave on step 6 in peak phase
          const slideHz = phase >= 2 ? rootHz * 2 : rootHz * 1.5;
          this._808(t, rootHz, STEP * 2.2, slideHz, 0.38);
        } else if (i === 10) {
          this._808(t, rootHz, STEP * 3.5, null, 0.42);
        } else if (i === 14 && phase >= 1) {
          // Quick passing tone
          this._808(t, hz(baseNote + 7), STEP * 1.8, null, 0.34);
        }
      }

      // ── CINEMATIC CHORD PAD ──
      // Swelling warm chords on the downbeat of each bar
      if (i === 0 && bar !== 15) {
        this._pad(t, ch, STEP * 15.5, phase === 2 ? 0.038 : 0.028);
      }

      // ── HYPNOTIC MELODIC PLUCK HOOK ──
      // Only in phases 1, 2, and 3: gives breathing room in intro
      if (L.hook && !isBreakdown) {
        const barPhrase = HOOK_NOTES[chIdx];
        for (const [hookStep, offset] of barPhrase) {
          if (i === hookStep) {
            const pluckNote = ch[0] + offset;
            this._pluck(t, hz(pluckNote), 0.085, STEP * 2.2);
            // Shimmering octave echo on peak phase
            if (phase === 2 && (i === 6 || i === 14)) {
              this._pluck(t + STEP * 0.5, hz(pluckNote + 12), 0.045, STEP * 1.5);
            }
          }
        }
      }

      // ── BOSS LAYER: dark low stabs on every beat + a high tension tone ──
      if (L.boss && i % 4 === 0) this._stab(t, hz(baseNote + 12), i === 0 ? 0.07 : 0.045);
      if (L.boss && i === 0) this._pad(t, [ch[0] + 13, ch[0] + 24], STEP * 15.5, 0.012);

      this.step++;
      this.next += STEP;
    }
  }

  _stab(t, f, vol) {
    const c = this.ctx, o = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = f;
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(1400, t); fl.frequency.exponentialRampToValueAtTime(200, t + 0.25);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(fl); fl.connect(g); g.connect(this.music); o.start(t); o.stop(t + 0.32);
  }

  // ── City ambience ──
  _ambLoop() {
    const c = this.ctx;
    const bed = c.createBufferSource(); bed.buffer = this.noise; bed.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    const g = c.createGain(); g.gain.value = 0.18;
    bed.connect(lp); lp.connect(g); g.connect(this.ambBus); bed.start();
    const later = (fn, a, b) => setTimeout(() => { if (window.game && !document.hidden) fn(); later(fn, a, b); }, (a + Math.random() * (b - a)) * 1000);
    later(() => this._horn(), 8, 22);
    later(() => this._siren(), 40, 90);
    later(() => this._birds(), 12, 30);
  }
  _horn() {
    const t = this.ctx.currentTime, f = 320 + Math.random() * 100;
    for (const [d, k] of [[0, 1], [0.22, 1.25]]) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), fl = this.ctx.createBiquadFilter();
      o.type = 'triangle'; o.frequency.setValueAtTime(f * k, t + d);
      fl.type = 'lowpass'; fl.frequency.value = 1100;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.04, t + d + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.16);
      o.connect(fl); fl.connect(g); g.connect(this.ambBus);
      o.start(t + d); o.stop(t + d + 0.18);
    }
  }
  _siren() {
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = 'triangle'; f.type = 'lowpass'; f.frequency.value = 1200;
    for (let k = 0; k < 6; k++) {
      o.frequency.setValueAtTime(620, t + k * 0.9);
      o.frequency.linearRampToValueAtTime(880, t + k * 0.9 + 0.45);
      o.frequency.linearRampToValueAtTime(620, t + k * 0.9 + 0.9);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.018, t + 1.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 5.4);
    o.connect(f); f.connect(g); g.connect(this.ambBus);
    o.start(t); o.stop(t + 5.5);
  }
  _birds() {
    const t = this.ctx.currentTime;
    for (let k = 0; k < 3; k++) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(2400 + Math.random() * 800, t + k * 0.12);
      g.gain.setValueAtTime(0.0001, t + k * 0.12);
      g.gain.exponentialRampToValueAtTime(0.015, t + k * 0.12 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + k * 0.12 + 0.07);
      o.connect(g); g.connect(this.ambBus);
      o.start(t + k * 0.12); o.stop(t + k * 0.12 + 0.08);
    }
  }
}

export const soundtrack = new Soundtrack();
