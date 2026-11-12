/**
 * Binds.js — rebindable controls. Game code listens for the default key codes; this layer
 * catches your chosen key first (capture phase) and hands the game the default key instead,
 * so every system (movement, webs, combat, menus) follows your binds without changes.
 * Binds are saved on this device (localStorage 'binds').
 */
export const ACTIONS = [
  ['KeyW', 'Move forward'], ['KeyS', 'Move back'], ['KeyA', 'Move left'], ['KeyD', 'Move right'],
  ['Space', 'Jump'], ['ShiftLeft', 'Sprint'], ['KeyC', 'Crouch / slide'],
  ['KeyE', 'Web swing'], ['KeyQ', 'Web zip'], ['KeyF', 'Punch'], ['AltLeft', 'Dodge roll'], ['KeyV', 'Web shot'],
  ['KeyR', 'Ability 1'], ['KeyG', 'Ability 2'], ['KeyX', 'Ability 3'], ['KeyB', 'Emote wheel'],
  ['Tab', 'Big map'], ['KeyT', 'Chat'], ['KeyP', 'Pause'],
  ['KeyZ', 'Portal gun: equip / holster'], ['KeyJ', 'Portal gun: blue shot'], ['KeyL', 'Portal gun: orange shot'],
];
const DEFAULTS = new Set(ACTIONS.map(a => a[0]));

let binds = {};
try { binds = JSON.parse(localStorage.getItem('binds') || '{}') || {}; } catch (e) { binds = {}; }
const save = () => {
  try { localStorage.setItem('binds', JSON.stringify(binds)); } catch (e) {}
  window.dispatchEvent(new Event('binds-changed'));
};
/** chosen key -> default key it stands for */
let reverse = new Map();
const rebuild = () => { reverse = new Map(Object.entries(binds).filter(([d, k]) => d !== k).map(([d, k]) => [k, d])); };
rebuild();

export const keyFor = action => binds[action] ?? action;
export const keyName = code => code.startsWith('Mouse')
  ? ({ Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB' }[code] ?? code.toUpperCase())
  : code.replace(/^Key/, '').replace(/^Digit/, '').replace(/Left$|Right$/, '').replace('Space', 'SPACE').toUpperCase();

let capturing = null;
const typing = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;

for (const type of ['keydown', 'keyup']) {
  window.addEventListener(type, e => {
    if (e.__remapped) return;
    if (capturing && type === 'keydown') {
      e.preventDefault(); e.stopImmediatePropagation();
      const done = capturing; capturing = null;
      done(e.code === 'Escape' ? null : e.code);
      return;
    }
    if (typing(e)) return;
    const to = reverse.get(e.code);
    // A default key whose action moved elsewhere no longer fires it
    const moved = DEFAULTS.has(e.code) && binds[e.code] && binds[e.code] !== e.code && !to;
    if (!to && !moved) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (moved) return;
    const ev = new KeyboardEvent(type, { code: to, key: e.key, bubbles: true, cancelable: true, repeat: e.repeat,
      shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey });
    ev.__remapped = true;
    (e.target ?? window).dispatchEvent(ev);
  }, true);
}

/** Controls section for the settings screen. */
export function buildBindsUI(panel, before) {
  const head = Object.assign(document.createElement('div'), { className: 'set-sub', textContent: 'CONTROLS' });
  const grid = Object.assign(document.createElement('div'), { className: 'binds-grid' });
  const render = () => {
    grid.innerHTML = '';
    for (const [code, label] of ACTIONS) {
      const row = Object.assign(document.createElement('div'), { className: 'bind-row' });
      const name = Object.assign(document.createElement('span'), { textContent: label });
      const btn = Object.assign(document.createElement('button'), { type: 'button', className: 'bind-key', textContent: keyName(keyFor(code)) });
      btn.onclick = () => {
        btn.textContent = 'PRESS A KEY'; btn.classList.add('wait');
        capturing = k => {
          if (k) {
            // Whatever action had that key gets this one's old key (a clean swap)
            const other = ACTIONS.find(([c]) => c !== code && keyFor(c) === k);
            if (other) binds[other[0]] = keyFor(code);
            binds[code] = k;
            for (const [c] of ACTIONS) if (binds[c] === c) delete binds[c];
            save(); rebuild();
          }
          render();
        };
      };
      row.append(name, btn);
      grid.append(row);
    }
  };
  render();
  const reset = Object.assign(document.createElement('button'), { type: 'button', className: 'brick small ghost', textContent: 'RESET CONTROLS' });
  reset.onclick = () => { binds = {}; save(); rebuild(); render(); };
  // Graphics level
  const gfx = document.createElement('label');
  gfx.className = 'set-row';
  gfx.innerHTML = 'Graphics <select id="set-gfx"><option value="">Auto (adaptive)</option><option value="low">Low / Performance</option><option value="medium">Medium</option><option value="high">High</option></select><span></span>';
  const sel = gfx.querySelector('select');
  try { sel.value = localStorage.getItem('gfx') || ''; } catch (e) {}
  sel.onchange = () => {
    try { sel.value ? localStorage.setItem('gfx', sel.value) : localStorage.removeItem('gfx'); } catch (e) {}
    gfx.querySelector('span').textContent = 'reload';
  };
  panel.insertBefore(gfx, before);
  panel.insertBefore(head, before);
  panel.insertBefore(grid, before);
  panel.insertBefore(reset, before);
}
