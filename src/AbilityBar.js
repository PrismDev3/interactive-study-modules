/**
 * AbilityBar.js — the hero's R / G / X abilities as a compact stack of LEGO tiles on the right edge.
 *
 * Everything shown is read from HeroRuntime (Characters.js): the current hero's ability list and the
 * real cooldown timestamps in `heroes.cool`. Nothing here decides gameplay.
 *   - one tile per ability: printed key letter, name label, cooldown sweep + seconds left
 *   - pops yellow when an ability comes off cooldown, flashes red when it's used
 *   - hidden while powers are locked (story before the bite / web-shooters) and in cutscenes (CSS)
 * DOM is only touched when a value changes.
 */
import { keyFor, keyName } from './Binds.js?v=12';

export class AbilityBar {
  constructor(heroes, controller) {
    this.heroes = heroes;
    this.controller = controller;
    this.el = document.getElementById('ability-bar');
    if (!this.el) {
      this.el = Object.assign(document.createElement('div'), { id: 'ability-bar' });
      this.el.setAttribute('aria-label', 'Abilities');
      (document.getElementById('hud') ?? document.body).appendChild(this.el);
    }
    this.def = null;
    this.slots = [];
    this.hidden = null;
  }

  _build(def) {
    this.def = def;
    this.el.textContent = '';
    this.slots = def.abilities.map(a => {
      const el = document.createElement('div');
      el.className = 'ab-slot';
      el.dataset.code = keyFor(a.key);   // touch taps this tile; the key is only a hint
      el.innerHTML = '<span class="ab-name"></span><span class="ab-tile"><span class="ab-key"></span><span class="ab-touch"></span><span class="ab-cd"></span><span class="ab-num"></span></span>';
      el.querySelector('.ab-name').textContent = a.name;
      el.querySelector('.ab-key').textContent = keyName(keyFor(a.key));
      el.querySelector('.ab-touch').textContent = a.name.split(' ')[0].slice(0, 7);
      this.el.appendChild(el);
      return { a, el, tile: el.querySelector('.ab-tile'), cd: el.querySelector('.ab-cd'), num: el.querySelector('.ab-num'), v: null, n: null, until: 0 };
    });
  }

  /** Slide the bar in (called when a hero is picked, instead of a text list of controls). */
  intro() {
    this.el.classList.remove('intro');
    void this.el.offsetWidth;
    this.el.classList.add('intro');
  }

  update() {
    const def = this.heroes.def, c = this.controller;
    if (def !== this.def) this._build(def);
    const hide = !def.abilities.length || !!c.noPowers || !!c.noWebs;
    if (hide !== this.hidden) { this.el.classList.toggle('locked', hide); this.hidden = hide; }
    if (hide) return;
    const now = performance.now();
    for (const s of this.slots) {
      const until = this.heroes.cool[s.a.name] ?? 0;
      if (until !== s.until) {                       // a new cooldown started: the ability was just used
        if (until > now) this._pulse(s.tile, 'fired');
        s.until = until;
      }
      const left = Math.max(0, until - now);
      const v = (left / (s.a.cd * 1000)).toFixed(2);
      if (v !== s.v) { s.cd.style.setProperty('--cd', v); s.v = v; }
      const n = left > 0 ? String(Math.ceil(left / 1000)) : '';
      if (n !== s.n) {
        s.num.textContent = n;
        s.el.classList.toggle('cooling', !!n);
        if (!n && s.n) this._pulse(s.tile, 'ready');
        s.n = n;
      }
    }
  }

  _pulse(el, cls) {
    el.classList.remove('fired', 'ready');
    void el.offsetWidth;
    el.classList.add(cls);
  }
}
