/**
 * Settings.js — player settings saved on this device (localStorage), applied live.
 * Keys match the ones the game already reads: 'sens' (CharacterController via main.js), 'minimap' (Minimap.js).
 */
const DEFAULTS = { sens: 1, masterVol: 1, mute: false, uiVol: 0.8, sfxVol: 0.8, uiScale: 1, minimap: true, reduceMotion: false, music: true, musicVol: 0.5, ambVol: 0.6, viewDist: 1200, voice: true, abilityBar: true };
const listeners = new Set();

function read(key) {
  let raw = null;
  try { raw = localStorage.getItem(key); } catch {}
  const d = DEFAULTS[key];
  if (raw === null) return d;
  if (typeof d === 'boolean') return raw === '1' || raw === 'true';
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : d;
}

export const settings = {
  get: read,
  set(key, value) {
    const v = typeof DEFAULTS[key] === 'boolean' ? (value ? '1' : '0') : String(value);
    try { localStorage.setItem(key, v); } catch {}
    apply();
    for (const fn of listeners) fn(key, read(key));
  },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

/** Push the visual settings onto the page. */
export function apply() {
  const scale = Math.max(0.8, Math.min(1.3, read('uiScale')));
  document.documentElement.style.setProperty('--ui-scale', scale);
  const reduce = read('reduceMotion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.body.classList.toggle('reduce-motion', reduce);
  document.body.classList.toggle('hide-abilities', !read('abilityBar'));
}
export const reducedMotion = () => read('reduceMotion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
