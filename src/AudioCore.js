/**
 * AudioCore.js — the one AudioContext and mixer every sound in the game goes through.
 *
 *   sources ─► sfx ─┐
 *              ui ──┼─► master ─► limiter ─► speakers
 *           music ─┤  (music sits behind a duck gain: big moments pull it down for a beat)
 *             amb ─┘
 *
 * Created lazily on the first real user gesture (autoplay rules). Volumes come from Settings
 * (masterVol, sfxVol, uiVol, musicVol + music toggle, ambVol, mute) and apply live.
 */
import { settings } from './Settings.js?v=62';

let core = null;
const ready = new Set();

function build() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC({ latencyHint: 'interactive' });

  // Brick-wall-ish limiter at the end: nothing clips no matter how busy a fight gets
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -10; lim.knee.value = 6; lim.ratio.value = 6;
  lim.attack.value = 0.002; lim.release.value = 0.18;
  lim.connect(ctx.destination);

  const g = () => ctx.createGain();
  const master = g(); master.connect(lim);
  const sfx = g(); sfx.connect(master);
  const ui = g(); ui.connect(master);
  const duck = g(); duck.connect(master);
  const music = g(); music.connect(duck);
  const amb = g(); amb.connect(master);

  // Shared white-noise buffer (1.5 s): every noise-based sound reuses it, nothing is decoded
  const len = Math.floor(ctx.sampleRate * 1.5);
  const noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

  core = { ctx, master, sfx, ui, music, duck, amb, noise };
  applyVolumes();
  for (const fn of ready) fn(core);
  return core;
}

export function applyVolumes() {
  if (!core) return;
  const t = core.ctx.currentTime, s = settings.get;
  const set = (node, v, tc = 0.08) => node.gain.setTargetAtTime(v, t, tc);
  set(core.master, s('mute') ? 0 : s('masterVol'));
  set(core.sfx, s('sfxVol') * 1.25);
  set(core.ui, s('uiVol') * 0.9);
  set(core.music, s('music') ? 0.3 * s('musicVol') : 0, 0.25);
  set(core.amb, (window.game ? 0.6 : 0) * s('ambVol'), 0.4);
}
settings.onChange(k => { if (/Vol$|^mute$|^music$/.test(k)) applyVolumes(); });

/** The shared mixer, created on first call (call only from a gesture or after one). */
export function audio() {
  if (!core) build();
  if (core && core.ctx.state === 'suspended') core.ctx.resume().catch(() => {});
  return core;
}
/** The mixer if it already exists; never creates it. */
export const audioIfReady = () => core;
/** Run fn(core) once the mixer exists. */
export function onAudioReady(fn) { if (core) fn(core); else ready.add(fn); }

/** Pull the music down by `depth` (0..1) for `hold` seconds so a key sound reads clearly. */
export function duckMusic(depth = 0.5, hold = 0.6, release = 0.5) {
  if (!core) return;
  const p = core.duck.gain, t = core.ctx.currentTime;
  p.cancelScheduledValues(t);
  p.setValueAtTime(p.value, t);
  p.linearRampToValueAtTime(Math.max(0.05, 1 - depth), t + 0.05);
  p.setValueAtTime(Math.max(0.05, 1 - depth), t + hold);
  p.linearRampToValueAtTime(1, t + hold + release);
}

// Unlock on any legitimate gesture; resume after tab switches
const unlock = () => { if (!core || core.ctx.state !== 'running') audio(); };
for (const ev of ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown']) window.addEventListener(ev, unlock, true);
document.addEventListener('visibilitychange', () => {
  if (!core) return;
  if (document.hidden) core.ctx.suspend().catch(() => {});   // no audio work while hidden (battery on Chromebooks)
  else core.ctx.resume().catch(() => {});
});
setInterval(applyVolumes, 1500);   // ambience follows whether the game is running
