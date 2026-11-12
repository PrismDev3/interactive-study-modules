/**
 * Progress.js — story progress saved on this device (localStorage, versioned + validated).
 * Free Play unlocks once Chapter 1 is beaten (or with the testing switch in Settings).
 */
const KEY = 'progress';
const VERSION = 1;

function load() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (p && p.v === VERSION && Number.isInteger(p.chaptersDone) && p.chaptersDone >= 0) return p;
  } catch {}   // corrupted save: fall back to a fresh one
  return { v: VERSION, chaptersDone: 0, freeplayDev: false };
}
function save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} }

export const progress = {
  get chaptersDone() { return load().chaptersDone; },
  /** Record that chapter `index` (0-based) was completed. Never goes backwards. */
  completeChapter(index) {
    const p = load();
    if (index + 1 > p.chaptersDone) { p.chaptersDone = index + 1; save(p); window.gameSfx?.play('unlock'); }
    this.push();
  },
  get freeplayDev() { return load().freeplayDev; },
  set freeplayDev(on) { const p = load(); p.freeplayDev = !!on; save(p); },
  /** Online account sync: set by the menu after login. */
  sync: null,
  goldBricks() { try { return JSON.parse(localStorage.getItem('goldBricks') ?? '[]'); } catch { return []; } },
  push() { this.sync?.({ t: 'progress', chaptersDone: load().chaptersDone, goldBricks: this.goldBricks() }); },
  /** Combine the account's saved progress with this device's (keep the best of both). */
  merge(remote) {
    if (!remote) { this.push(); return; }
    const p = load();
    p.chaptersDone = Math.max(p.chaptersDone, Math.min(6, remote.chaptersDone | 0));
    save(p);
    const gb = [...new Set([...this.goldBricks(), ...(remote.goldBricks ?? [])])];
    try { localStorage.setItem('goldBricks', JSON.stringify(gb)); } catch {}
    this.push();
  },
  get freeplayUnlocked() { const p = load(); return p.chaptersDone >= 1 || p.freeplayDev; },
};
