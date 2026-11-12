/**
 * Input.js — one authority for "may this gameplay key fire?".
 *
 * Hotkeys live in many modules (movement, pause, chat, emotes, admin, map, HUD) and several
 * listen on `document` in the capture phase. That meant a P typed into the chat box reached
 * the pause menu before the input saw it, and Escape in Friends opened pause instead of
 * closing the panel. Every gameplay handler now asks this module first.
 */

// Panels that own the keyboard while they are up. The pause menu is handled separately,
// because it is the one panel that has to be able to close itself with the same key.
const OVERLAYS = [
  '#pause-menu.open',
  '#pause-menu.show-ctrl',
  '#confirm.open',
  '.soc-panel.show',
  '#admin.open',
  '#emote-wheel.open',
  '#chat.typing',
  '#mount-overlay:not([hidden])',
];

export function isTypingTarget(e) {
  const t = e?.target;
  if (!t) return document.body.classList.contains('text-entry');
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable === true;
}

/** True while any overlay that owns the keyboard is up (pause can be excluded by the caller). */
export function overlayOpen(except = []) {
  for (const sel of OVERLAYS) {
    if (except.includes(sel)) continue;
    if (document.querySelector(sel)) return true;
  }
  return false;
}

/** True when a gameplay hotkey must be ignored: typing, or a panel is open. */
export function busy(e) {
  return isTypingTarget(e) || overlayOpen();
}

/** Close every transient panel. The pause menu calls this before it opens. */
export function closeOverlays() {
  document.dispatchEvent(new Event('close-overlays'));
  const a = document.activeElement;
  if (a && a !== document.body && typeof a.blur === 'function' && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(a.tagName)) a.blur();
}

/** Hand the keyboard back to the game after a menu closes, so held keys and hotkeys work. */
export function restoreGameFocus() {
  const a = document.activeElement;
  if (a && a !== document.body && typeof a.blur === 'function') a.blur();
}

// Mirror text entry onto <body>, so modules with a cached "is typing" flag stay honest even
// when the game's own key listeners run before the focused element's handler.
let textEntry = false;
function syncTextEntry() {
  const t = document.activeElement;
  const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable === true);
  if (typing === textEntry) return;
  textEntry = typing;
  document.body.classList.toggle('text-entry', typing);
}
document.addEventListener('focusin', syncTextEntry);
document.addEventListener('focusout', () => setTimeout(syncTextEntry, 0));
