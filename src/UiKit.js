/**
 * UiKit.js — behaviour for the LEGO design system (styles live in lego-ui.css):
 *  - studs on brick panels (also ones added later)
 *  - hover + snap sounds
 *  - TT-style text menus: hover and keyboard share one selection, a spider marker slides to it
 *  - keyboard and gamepad navigation, the Back / Select prompt bar
 *  - the logo's letters
 */
import { Sfx } from './Sfx.js?v=68';

export const uiSfx = new Sfx();
window.gameSfx = uiSfx;   // modules that can't import UiKit (cycles) play through this

/** Give a panel a row of studs sized to its width (buttons are plain moulded tiles). */
function addStuds(el) {
  if (el.matches('button')) return;
  if (el.querySelector(':scope > .studs')) return;
  const w = el.offsetWidth;
  if (!w) return;   // hidden: studded when its screen is shown (decorate() again)
  const n = Math.max(1, Math.min(14, Math.floor((w - 16) / 44)));
  const row = document.createElement('span');
  row.className = 'studs';
  row.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < n; i++) row.append(document.createElement('i'));
  el.prepend(row);
}

export function decorate(root = document) {
  for (const el of root.querySelectorAll('.brick-panel')) addStuds(el);
  if (root.matches?.('.brick-panel')) addStuds(root);
}

// ─── Selection marker for TT text menus ─────────────────────────────────────
const NS = 'http://www.w3.org/2000/svg';
function spiderMarker() {
  const svg = document.createElementNS(NS, 'svg');
  svg.id = 'tt-marker';
  svg.setAttribute('viewBox', '-12 -12 24 24');
  svg.innerHTML = `<g stroke="#141414" stroke-width="3.2" stroke-linecap="round" fill="none">
      <path d="M-3-2L-9-8M-3 0L-11-2M-3 2L-10 5M-3 3L-7 10M3-2L9-8M3 0L11-2M3 2L10 5M3 3L7 10"/></g>
    <g stroke="#d01012" stroke-width="1.6" stroke-linecap="round" fill="none">
      <path d="M-3-2L-9-8M-3 0L-11-2M-3 2L-10 5M-3 3L-7 10M3-2L9-8M3 0L11-2M3 2L10 5M3 3L7 10"/></g>
    <ellipse cx="0" cy="-3.5" rx="3" ry="3" fill="#d01012" stroke="#141414" stroke-width="1.6"/>
    <ellipse cx="0" cy="3" rx="4" ry="5" fill="#d01012" stroke="#141414" stroke-width="1.6"/>`;
  return svg;
}

/** Mark `item` as the selected entry of its list and slide the spider marker to it. */
export function select(item) {
  if (!item) return;
  const list = item.closest('.tt-menu');
  if (!list) return;
  for (const b of list.querySelectorAll('.tt-item.sel')) if (b !== item) b.classList.remove('sel');
  item.classList.add('sel');
  let m = list.querySelector(':scope > #tt-marker');
  if (!m) { document.getElementById('tt-marker')?.remove(); m = spiderMarker(); list.append(m); }
  m.style.transform = `translate(${item.offsetLeft + 2}px, ${item.offsetTop + (item.offsetHeight - 26) / 2 - (item.querySelector('small') ? 6 : 0)}px)`;
}

/** Show the Back prompt only on screens that have somewhere to go back to. */
export function updatePrompts() {
  const scr = document.querySelector('#loading-screen .screen.show');
  const back = document.getElementById('tt-back');
  if (back) back.hidden = !scr?.querySelector('[data-back]');
}

let navOn = false;
export function installUi() {
  new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) decorate(n);
  }).observe(document.body, { childList: true, subtree: true });

  // Hover and keyboard share one selection, like a console menu
  document.addEventListener('pointerover', e => {
    const b = e.target.closest?.('button');
    if (!b || b.disabled || b.contains(e.relatedTarget)) return;
    if (b.matches('.tt-item') && document.activeElement !== b) { b.focus({ preventScroll: true }); return; }
    uiSfx.play('hover');
  });
  document.addEventListener('focusin', e => {
    const b = e.target;
    if (b.matches?.('.tt-item')) { select(b); uiSfx.play('hover'); }
    else if (navOn && b.matches?.('button')) uiSfx.play('hover');
  });
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest?.('button');
    if (b && !b.disabled) uiSfx.play(b.dataset.back || b.id === 'tt-back' ? 'back' : 'snap');
  });
  document.getElementById('tt-back')?.addEventListener('click', back);
  addEventListener('resize', () => { const s = document.querySelector('.tt-item.sel'); if (s) select(s); });
  installNav();
}

// ─── Keyboard / gamepad navigation ──────────────────────────────────────────
function menuButtons() {
  const scr = document.querySelector('#loading-screen .screen.show');
  if (!scr) return [];
  return [...scr.querySelectorAll('button, input, select')].filter(b => !b.disabled && b.offsetParent !== null);
}

/** Move focus to the nearest control in a direction (spatial navigation). */
function step(dx, dy) {
  const list = menuButtons();
  if (!list.length) return;
  const cur = list.includes(document.activeElement) ? document.activeElement : null;
  if (!cur) { list[0].focus(); return; }
  const r0 = cur.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
  let best = null, bestScore = Infinity;
  for (const b of list) {
    if (b === cur) continue;
    const r = b.getBoundingClientRect(), x = r.left + r.width / 2 - cx, y = r.top + r.height / 2 - cy;
    const along = x * dx + y * dy;
    if (along <= 4) continue;
    const score = along + Math.abs(x * dy - y * dx) * 2.5;
    if (score < bestScore) { bestScore = score; best = b; }
  }
  (best ?? cur).focus();
}

function back() {
  const scr = document.querySelector('#loading-screen .screen.show');
  scr?.querySelector('[data-back]')?.click();
}

function installNav() {
  document.addEventListener('keydown', e => {
    if (!document.querySelector('#loading-screen .screen.show')) return;
    const typing = e.target.matches?.('input[type=text], input[type=password], input:not([type]), input[type=number]');
    const dirs = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (dirs[e.key] && !(typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) && !e.target.matches?.('input[type=range]')) {
      e.preventDefault(); navOn = true; step(...dirs[e.key]);
    } else if (e.key === 'Escape') back();
  });

  // Gamepad: D-pad / left stick moves, A presses, B goes back
  const held = {};
  const edge = (k, on) => { const was = held[k]; held[k] = on; return on && !was; };
  const poll = () => {
    requestAnimationFrame(poll);
    if (!document.querySelector('#loading-screen .screen.show')) return;
    const pad = [...(navigator.getGamepads?.() ?? [])].find(Boolean);
    if (!pad) return;
    const b = i => !!pad.buttons[i]?.pressed, ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
    if (edge('u', b(12) || ay < -0.6)) { navOn = true; step(0, -1); }
    if (edge('d', b(13) || ay > 0.6)) { navOn = true; step(0, 1); }
    if (edge('l', b(14) || ax < -0.6)) { navOn = true; step(-1, 0); }
    if (edge('r', b(15) || ax > 0.6)) { navOn = true; step(1, 0); }
    if (edge('a', b(0))) { const el = document.activeElement; if (el?.matches?.('button')) { uiSfx.play('snap'); el.click(); } }
    if (edge('b', b(1))) back();
  };
  requestAnimationFrame(poll);
}

// ─── Logo ───────────────────────────────────────────────────────────────────
export function buildWordmark() {
  const wm = document.getElementById('wordmark');
  if (!wm || wm.dataset.built) return;
  wm.dataset.built = '1';
  const title = wm.querySelector('.wm-title');
  [...title.dataset.text].forEach((ch, i) => {
    const s = document.createElement('span');
    s.className = 'wm-l' + (ch === '-' ? ' dash' : '');
    s.textContent = ch;
    s.style.setProperty('--i', i);
    s.setAttribute('aria-hidden', 'true');
    title.append(s);
  });
}
