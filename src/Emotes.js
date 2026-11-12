/** Emotes.js — emote catalog (free + shop) and the B emote wheel (shows only emotes you own). */
import { wallet } from './Outfit.js?v=65';
import { isTypingTarget, overlayOpen, closeOverlays, restoreGameFocus } from './Input.js?v=2';
import { roomPolicy } from './RoomPolicy.js?v=2';

// [key, label, price] — price 0 = free for everyone
export const EMOTES = [
  ['stop', 'STOP', 0],
  ['griddy', 'GRIDDY', 1500], ['orange', 'ORANGE JUSTICE', 1500], ['floss', 'FLOSS', 1000],
  ['default', 'DEFAULT DANCE', 800], ['takel', 'TAKE THE L', 1200], ['dab', 'DAB', 500],
  ['hype', 'HYPE', 800], ['robot', 'ROBOT', 1000],
  // Real LEGO Marvel hub dances (decoded clips, see DANCE_CLIPS in LegoSpidey.js)
  ['wiggle', 'WIGGLE', 600], ['patriot', 'STRUT', 800], ['dancewalk', 'SHUFFLE', 800],
  ['breakdance', 'BREAKDANCE', 1500], ['windmill', 'WINDMILL', 1500],
  ['wave', 'WAVE', 0], ['dance', 'DANCE', 0], ['flex', 'FLEX', 0], ['cheer', 'CHEER', 0],
  ['sit', 'SIT', 0], ['laugh', 'LAUGH', 0],
];
export const ownsEmote = (key, price) => price === 0 || wallet.owns(`emote:${key}`);

// Number keys 1-9 then 0 pick the first ten on the wheel
const KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];

export class EmoteWheel {
  constructor(controller, enabled = true) {
    this.controller = controller;
    this.enabled = enabled;
    this.el = document.getElementById('emote-wheel');
    this.grid = document.getElementById('emote-grid');
    this.list = [];
    document.addEventListener('roomchange', e => {
      this.enabled = roomPolicy(e.detail).emotes;
      if (!this.enabled && this.isOpen) this.toggle(false);
    });
    document.addEventListener('keydown', e => {
      if (isTypingTarget(e) || !this.enabled) return;
      if (e.code === 'KeyB' && !e.repeat) {
        if (!this.isOpen && overlayOpen()) return;   // pause / Friends / admin own the keyboard
        e.preventDefault();
        this.toggle();
      } else if (this.isOpen && KEYS.includes(e.code) && this.list[KEYS.indexOf(e.code)]) this.play(this.list[KEYS.indexOf(e.code)]);
      else if (this.isOpen && e.code === 'Escape') this.toggle(false);
    });
    document.addEventListener('close-overlays', () => { if (this.isOpen) this.toggle(false); });
  }

  get isOpen() { return this.el.classList.contains('open'); }

  /** Rebuild from what you own each time it opens, so new purchases show up. */
  _fill() {
    const owned = EMOTES.filter(([key, , price]) => ownsEmote(key, price));
    this.list = owned.map(([key]) => key);
    this.grid.innerHTML = '';
    owned.forEach(([key, label], i) => {
      const b = document.createElement('button');
      b.innerHTML = `${label}<small>${i < 10 ? (i + 1) % 10 : ''}</small>`;
      b.onclick = () => this.play(key);
      this.grid.append(b);
    });
  }

  toggle(force) {
    const open = force ?? !this.isOpen;
    if (open) { closeOverlays(); this._fill(); }
    this.el.classList.toggle('open', open);
    if (open && document.pointerLockElement) document.exitPointerLock();
    if (!open) restoreGameFocus();
  }

  play(key) {
    const c = this.controller;
    if (key === 'stop') c.emote = null;
    else if (c.isGrounded && !c.isClimbing && !c.webPhysics?.isSwinging) c.emote = key;
    this.toggle(false);
  }
}
