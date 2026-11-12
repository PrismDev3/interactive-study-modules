/**
 * PlayerRoom.js — the player's room preferences.
 *
 * Two features are opt-in per player: the Skill Tree and the Skill Select loadout. They are
 * independent (either, both or neither can be on), persist locally, and — when signed in —
 * follow the account through the server's `prefs` message, so the same settings apply on any
 * machine. Everything reads `roomPrefs.skillTree` / `roomPrefs.skillSelect`; nothing else
 * stores its own copy.
 */
const KEY = 'roomPrefs';
const DEFAULTS = { skillTree: true, skillSelect: true };

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return {
      skillTree: saved?.skillTree !== false,
      skillSelect: saved?.skillSelect !== false,
    };
  } catch { return { ...DEFAULTS }; }
}

let state = read();
let net = null;
let sent = null;

const emit = () => window.dispatchEvent(new CustomEvent('roomprefschange', { detail: { ...state } }));

export const roomPrefs = {
  get skillTree() { return state.skillTree; },
  get skillSelect() { return state.skillSelect; },
  get all() { return { ...state }; },

  set(key, value) {
    if (!(key in DEFAULTS)) return;
    const next = value !== false;
    if (state[key] === next) return;
    state = { ...state, [key]: next };
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
    emit();
    if (net?.connected && sent !== JSON.stringify(state)) {
      sent = JSON.stringify(state);
      net.send({ t: 'prefs', skillTree: state.skillTree, skillSelect: state.skillSelect });
    }
  },

  /** Server copy wins only when the player has not chosen on this machine yet. */
  adopt(saved) {
    if (!saved || typeof saved !== 'object') return;
    const hasLocal = (() => { try { return !!localStorage.getItem(KEY); } catch { return false; } })();
    if (hasLocal) return;
    state = {
      skillTree: saved.skillTree !== false,
      skillSelect: saved.skillSelect !== false,
    };
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
    emit();
  },

  bindNetwork(n) {
    net = n;
    n.on('prefs', m => { if (m.prefs) this.adopt(m.prefs); });
    n.on('auth', m => {
      if (m?.prefs) this.adopt(m.prefs);
      if (n.connected) n.send({ t: 'prefs', skillTree: state.skillTree, skillSelect: state.skillSelect });
    });
  },
};
