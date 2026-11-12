/** Validate and normalize the small player-state packet shared by the game and server. */
const MAX_POSITION = 100_000;
const MAX_ROTATION = 1_000_000;

const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const vector3 = value => Array.isArray(value) && value.length === 3
  && value.every(n => finite(n, -MAX_POSITION, MAX_POSITION));
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const flag = (value, key) => {
  if (!has(value, key)) return 0;
  const v = value[key];
  return v === 0 || v === false ? 0 : v === 1 || v === true ? 1 : null;
};
const number = (value, key, min, max, fallback) => {
  if (!has(value, key)) return fallback;
  return finite(value[key], min, max) ? value[key] : null;
};

/**
 * Return a bounded, complete state packet, or null when the input could break interpolation,
 * animation, or web rendering. Missing fields are filled for compatibility with older clients.
 */
export function normalizePlayerState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  const proto = Object.getPrototypeOf(state);
  if (proto !== Object.prototype && proto !== null) return null;
  if (!vector3(state.p) || !finite(state.r, -MAX_ROTATION, MAX_ROTATION)) return null;

  const sp = number(state, 'sp', 0, 200, 0);
  const vy = number(state, 'vy', -200, 200, 0);
  const at = number(state, 'at', 0, 10, 0);
  const g = flag(state, 'g'), c = flag(state, 'c'), cr = flag(state, 'cr'), wg = flag(state, 'wg');
  const sw = flag(state, 'sw'), hide = flag(state, 'hide');
  const wa = number(state, 'wa', -1, 1, -1);
  const aa = number(state, 'aa', -1, 1, -1);
  if ([sp, vy, at, wa, aa].includes(null) || [g, c, cr, sw, hide, wg].includes(null)) return null;
  if (![-1, 1].includes(wa) || ![-1, 1].includes(aa)) return null;

  const anchor = !has(state, 'a') ? null : state.a;
  if (anchor !== null && !vector3(anchor)) return null;
  const em = !has(state, 'em') ? null : state.em;
  if (em !== null && (typeof em !== 'string' || em.length > 32)) return null;

  let trick = null;
  if (has(state, 'tk') && state.tk !== null) {
    if (!Array.isArray(state.tk) || state.tk.length !== 2
      || typeof state.tk[0] !== 'string' || state.tk[0].length > 24
      || !finite(state.tk[1], 0, 1)) return null;
    trick = [state.tk[0], state.tk[1]];
  }

  let rope = null;
  if (has(state, 'rp') && state.rp !== null) {
    if (!Array.isArray(state.rp) || state.rp.length !== 2
      || !state.rp.every(n => finite(n, -10, 10))) return null;
    rope = [state.rp[0], state.rp[1]];
  }

  return {
    p: [state.p[0], state.p[1], state.p[2]], r: state.r,
    sp, vy, g, c, cr, sw, wa, wg, a: anchor ? [anchor[0], anchor[1], anchor[2]] : null,
    at, aa, hide, em, tk: trick, rp: rope,
  };
}
