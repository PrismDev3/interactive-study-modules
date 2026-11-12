/**
 * PauseSettings.js — the full settings sheet inside the pause menu.
 *
 * The title-screen Settings panel only exists on the loading screen, which is removed once the
 * city starts, so in-game there was no way to change audio, interface or graphics without
 * quitting. This builds an equivalent sheet into #pause-menu and reuses Settings.js as the one
 * source of truth, so every control here and on the title screen stays in sync.
 */
import { settings } from './Settings.js?v=62';
import { roomPrefs } from './PlayerRoom.js?v=2';

const QUALITY_KEY = 'gfx';
const QUALITIES = [
  ['auto', 'Auto (adaptive)', 'Picks a profile for this device and drops detail if frames fall.'],
  ['low', 'Low (Chromebook)', 'Optimized for low-end devices: no shadows, lightweight shaders.'],
  ['medium', 'Medium (Laptops)', 'Balanced: directional shadows, sharp scale, optimized distance.'],
  ['high', 'High (Gaming PC)', 'Full shadows, bloom, night atmosphere, roof studs, reflections.'],
  ['ultra', 'Ultra (High-End PC)', 'Maximum 4K shadows, cinematic bloom, enhanced draw distance.'],
];

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

function slider({ label, value, min, max, step, fmt, onInput }) {
  const row = el('label', 'ps-row');
  const top = el('span', 'ps-top');
  const out = el('output');
  top.append(el('span', null, label), out);
  const input = el('input');
  Object.assign(input, { type: 'range', min, max, step, value });
  const paint = () => {
    out.textContent = fmt ? fmt(+input.value) : input.value;
    input.style.setProperty('--fill', `${((+input.value - min) / (max - min)) * 100}%`);
  };
  paint();
  input.addEventListener('input', () => { paint(); onInput(+input.value); });
  row.append(top, input);
  return row;
}

function toggle({ label, note, value, onChange }) {
  const row = el('label', 'ps-row ps-switch');
  const copy = el('span', 'ps-copy');
  copy.append(el('b', null, label));
  if (note) copy.append(el('small', null, note));
  const input = el('input');
  input.type = 'checkbox';
  input.checked = !!value;
  input.addEventListener('input', () => onChange(input.checked));
  row.append(copy, input);
  return row;
}

function section(title) {
  const box = el('section', 'ps-section');
  box.append(el('div', 'ps-section-title', title));
  return box;
}

export function buildPauseSettings(pauseEl) {
  if (!pauseEl || pauseEl.querySelector('#pause-settings')) return;

  const sheet = el('div', 'pause-sheet pause-settings');
  sheet.id = 'pause-settings';

  const head = el('div', 'ps-head');
  head.append(el('div', 'ps-kicker', 'WEB OF BRICKS'), el('h3', 'ps-title', 'Settings'));
  const close = el('button', 'brick ghost small ps-close', 'BACK');
  close.type = 'button';
  close.addEventListener('click', () => pauseEl.classList.remove('show-settings'));
  head.append(close);

  const body = el('div', 'ps-body');

  // ── Audio ────────────────────────────────────────────────────────────────
  const audio = section('AUDIO');
  audio.append(
    slider({ label: 'Master volume', value: settings.get('masterVol'), min: 0, max: 1, step: 0.05, fmt: v => `${Math.round(v * 100)}%`, onInput: v => { settings.set('masterVol', v); window.gameSfx?.play('slider', { value: v }); } }),
    toggle({ label: 'Mute all', note: 'Silence everything, keep your levels.', value: settings.get('mute'), onChange: v => settings.set('mute', v) }),
    slider({ label: 'Interface sounds', value: settings.get('uiVol'), min: 0, max: 1, step: 0.05, fmt: v => `${Math.round(v * 100)}%`, onInput: v => { settings.set('uiVol', v); window.gameSfx?.play('slider', { value: v }); } }),
    slider({ label: 'Sound effects', value: settings.get('sfxVol'), min: 0, max: 1, step: 0.05, fmt: v => `${Math.round(v * 100)}%`, onInput: v => { settings.set('sfxVol', v); window.gameSfx?.play('snap'); } }),
    slider({ label: 'Music volume', value: settings.get('musicVol'), min: 0, max: 1, step: 0.05, fmt: v => `${Math.round(v * 100)}%`, onInput: v => settings.set('musicVol', v) }),
    slider({ label: 'City ambience', value: settings.get('ambVol'), min: 0, max: 1, step: 0.05, fmt: v => `${Math.round(v * 100)}%`, onInput: v => settings.set('ambVol', v) }),
    toggle({ label: 'Music', note: 'Turn the score off and keep effects.', value: settings.get('music'), onChange: v => settings.set('music', v) }),
    toggle({ label: 'Voice acting', note: 'How characters sound in story scenes.', value: settings.get('voice'), onChange: v => settings.set('voice', v) }),
  );

  // ── Interface ────────────────────────────────────────────────────────────
  const ui = section('INTERFACE');
  ui.append(
    slider({ label: 'Interface size', value: settings.get('uiScale'), min: 0.8, max: 1.3, step: 0.05, fmt: v => `${Math.round(v * 100)}%`, onInput: v => settings.set('uiScale', v) }),
    slider({ label: 'Mouse sensitivity', value: settings.get('sens'), min: 0.4, max: 2.5, step: 0.1, fmt: v => `${v.toFixed(1)}x`, onInput: v => settings.set('sens', v) }),
    toggle({ label: 'Minimap', note: 'The corner map, also toggled with M.', value: settings.get('minimap'), onChange: v => settings.set('minimap', v) }),
    toggle({ label: 'Ability keys', note: 'Show the hero ability tiles on the right.', value: settings.get('abilityBar'), onChange: v => settings.set('abilityBar', v) }),
    toggle({ label: 'Reduce motion', note: 'Calmer menus and camera.', value: settings.get('reduceMotion'), onChange: v => settings.set('reduceMotion', v) }),
  );

  // ── Graphics ─────────────────────────────────────────────────────────────
  const gfx = section('GRAPHICS');
  const qRow = el('label', 'ps-row ps-select');
  const qCopy = el('span', 'ps-copy');
  qCopy.append(el('b', null, 'Quality profile'), el('small', null, 'Shadows, resolution and how much city is drawn.'));
  const select = el('select', 'ps-quality');
  for (const [v, name] of QUALITIES) {
    const o = el('option', null, name);
    o.value = v;
    select.append(o);
  }
  let savedQ = 'auto';
  try { savedQ = localStorage.getItem(QUALITY_KEY) ?? 'auto'; } catch {}
  if (!QUALITIES.some(q => q[0] === savedQ)) savedQ = 'auto';
  select.value = savedQ;
  qRow.append(qCopy, select);
  gfx.append(qRow);

  const note = el('div', 'ps-note', '');
  const reload = el('button', 'brick small ps-reload', 'RELOAD TO APPLY');
  reload.type = 'button';
  reload.hidden = true;
  reload.addEventListener('click', () => location.reload());
  select.addEventListener('change', () => {
    try { localStorage.setItem(QUALITY_KEY, select.value); } catch {}
    note.textContent = 'The quality profile is chosen at startup, so reload to apply it.';
    reload.hidden = false;
  });
  gfx.append(
    slider({ label: 'Render distance', value: settings.get('viewDist'), min: 200, max: 1700, step: 50, fmt: v => `${Math.round(v)}m`, onInput: v => settings.set('viewDist', v) }),
    note,
    reload,
  );

  // ── Player room ──────────────────────────────────────────────────────────
  // Two independent switches that actually decide whether those screens are available.
  const room = section('PLAYER ROOM');
  const treeRow = toggle({ label: 'Skill Tree', note: 'Chapter lessons and point spending.', value: roomPrefs.skillTree, onChange: v => roomPrefs.set('skillTree', v) });
  const selectRow = toggle({ label: 'Skill Select', note: 'Equip up to three learned lessons.', value: roomPrefs.skillSelect, onChange: v => roomPrefs.set('skillSelect', v) });
  room.append(treeRow, selectRow);
  window.addEventListener('roomprefschange', () => {
    treeRow.querySelector('input').checked = roomPrefs.skillTree;
    selectRow.querySelector('input').checked = roomPrefs.skillSelect;
  });

  body.append(audio, ui, gfx, room);
  sheet.append(head, body);
  pauseEl.querySelector('#pause-panel')?.append(sheet);
}
