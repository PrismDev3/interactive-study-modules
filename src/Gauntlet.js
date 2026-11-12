/**
 * Gauntlet: an endless loop of rounds that get harder each time.
 * Every round rolls a modifier, every 5th round is a double boss "Showdown",
 * and between rounds you pick one of three perks. Kills chain into a combo
 * that multiplies your score. Best round and best score are saved.
 */

const BOSSES = ['goblin', 'vulture', 'venom', 'lizard', 'sandman', 'mysterio', 'docock', 'loki', 'harrygoblin', 'magneto'];
const GRUNTS = ['thug', 'thugGun', 'hydra', 'hydraGun'];
const SPECIALS = ['brute', 'symbiote', 'pyro', 'cryo', 'sparky', 'doombot'];

export const MODIFIERS = [
  { id: 'none',    name: 'Standard',      desc: 'No tricks. Just fight.',              score: 1 },
  { id: 'swarm',   name: 'Swarm',         desc: 'Twice the bodies, half the health.',  score: 1.3 },
  { id: 'armored', name: 'Armored',       desc: 'Enemies take more hits.',             score: 1.4 },
  { id: 'elite',   name: 'Elite Squad',   desc: 'Specialists only.',                   score: 1.5 },
  { id: 'blitz',   name: 'Blitz',         desc: 'Beat the clock for a big bonus.',     score: 1.2 },
  { id: 'glass',   name: 'Glass Hero',    desc: 'One heart. Triple score.',            score: 3 },
];

export const PERKS = [
  { id: 'heal',   name: 'Patch Up',      desc: 'Refill all hearts now.' },
  { id: 'power',  name: 'Heavy Hitter',  desc: '+25% damage for the rest of the run.' },
  { id: 'combo',  name: 'Long Fuse',     desc: 'Combo timer lasts 50% longer.' },
  { id: 'greed',  name: 'Stud Magnet',   desc: '+50% score from every kill.' },
  { id: 'shield', name: 'Spider-Sense',  desc: '6 seconds of safety at each round start.' },
];

const BEST_KEY = 'gauntletBest';

export class Gauntlet {
  constructor({ combat, hud, ui }) {
    Object.assign(this, { combat, hud, ui });
    this.round = 0;
    this.score = 0;
    this.combo = 0;
    this.comboT = 0;
    this.comboWindow = 4;
    this.scoreMul = 1;
    this.perks = [];
    this.mod = MODIFIERS[0];
    this.active = false;
    this.roundTime = 0;
    try { this.best = JSON.parse(localStorage.getItem(BEST_KEY) || 'null') || { round: 0, score: 0 }; }
    catch (e) { this.best = { round: 0, score: 0 }; }
    this._buildHud();
    const prev = combat.onDefeated;
    combat.onDefeated = (e) => { prev?.(e); this._onKill(e); };
  }

  /** Build the chapter object Story._playChapter consumes for round n. */
  nextRound() {
    const n = ++this.round;
    const showdown = n % 5 === 0;
    this.mod = n === 1 ? MODIFIERS[0] : MODIFIERS[1 + Math.floor(Math.random() * (MODIFIERS.length - 1))];
    const tier = Math.floor((n - 1) / 5);
    let count = Math.min(4 + n, 12);
    let pool = n < 3 ? GRUNTS : [...GRUNTS, ...SPECIALS.slice(0, Math.min(SPECIALS.length, 1 + tier * 2 + (n % 5)))];
    let hp = 1 + n * 0.18 + tier * 0.3;
    if (this.mod.id === 'swarm') { count = Math.min(count * 2, 18); hp *= 0.5; }
    if (this.mod.id === 'armored') hp *= 1.6;
    if (this.mod.id === 'elite') pool = SPECIALS;
    const pick = () => pool[Math.floor(Math.random() * pool.length)];
    const all = Array.from({ length: count }, pick);
    const third = Math.ceil(all.length / 3);
    const boss = BOSSES[(n - 1) % BOSSES.length];
    return {
      title: `Gauntlet Round ${n}`,
      cardTop: showdown ? `Round ${n} · Showdown` : `Round ${n} · ${this.mod.name}`,
      name: showdown ? 'Double Trouble' : this.mod.desc.replace(/\.$/, ''),
      boss,
      boss2: showdown ? BOSSES[(n + 3) % BOSSES.length] : null,
      hpScale: hp,
      waves: [all.slice(0, third), all.slice(third, third * 2), all.slice(third * 2)].filter(w => w.length),
      objective: `Round ${n}: clear the area`,
      gauntlet: true,
    };
  }

  /** Called as a round begins fighting. */
  beginRound() {
    this.active = true;
    this.roundTime = 0;
    this.par = 40 + this.round * 8;
    const c = this.combat;
    if (this.mod.id === 'glass') { c.hearts = 1; this.ui.setHearts(1, 1); }
    if (this.perks.includes('shield')) c.invuln = Math.max(c.invuln ?? 0, 6);
    this._show(true);
  }

  /** Round cleared: bank bonuses, save bests, return the stud payout. */
  endRound() {
    this.active = false;
    const t = this.roundTime;
    let bonus = 500 * this.round;
    const lines = [`Round clear  +${bonus}`];
    if (t < this.par) {
      const fast = Math.round((this.par - t) * 40 * (this.mod.id === 'blitz' ? 3 : 1));
      bonus += fast; lines.push(`Speed  +${fast}`);
    }
    const m = this.mod.score;
    if (m !== 1) lines.push(`${this.mod.name}  x${m}`);
    bonus = Math.round(bonus * m);
    this.score += bonus;
    if (this.mod.id === 'glass') { this.combat.hearts = this.combat.maxHearts ?? 4; }
    const newBest = this.round > this.best.round || this.score > this.best.score;
    if (newBest) {
      this.best = { round: Math.max(this.round, this.best.round), score: Math.max(this.score, this.best.score) };
      try { localStorage.setItem(BEST_KEY, JSON.stringify(this.best)); } catch (e) {}
    }
    this._render();
    return { bonus, lines, time: t, newBest };
  }

  /** Show the results card and three perk choices. Waits for the player to pick (click or keys 1 to 3). */
  intermission(result) {
    const offer = [...PERKS].sort(() => Math.random() - 0.5).slice(0, 3);
    const el = this._inter;
    el.querySelector('.gi-title').textContent = `ROUND ${this.round} CLEARED`;
    el.querySelector('.gi-lines').innerHTML = result.lines.map(l => `<div>${l}</div>`).join('')
      + `<div class="gi-time">Time ${result.time.toFixed(1)}s</div>`
      + (result.newBest ? '<div class="gi-best">NEW BEST</div>' : '');
    const row = el.querySelector('.gi-perks');
    row.innerHTML = '';
    return new Promise(resolve => {
      let done = false;
      const finish = (p) => {
        if (done) return; done = true;
        if (p) this._apply(p);
        el.classList.remove('show');
        document.removeEventListener('keydown', onKey, true);
        resolve(p);
      };
      offer.forEach((p, i) => {
        const b = document.createElement('button');
        b.className = 'gi-perk';
        b.innerHTML = `<span class="gi-key">${i + 1}</span><b>${p.name}</b><small>${p.desc}</small>`;
        b.onclick = () => finish(p);
        row.append(b);
      });
      const onKey = (e) => { const k = +e.key; if (k >= 1 && k <= 3) { e.stopPropagation(); finish(offer[k - 1]); } };
      document.addEventListener('keydown', onKey, true);
      el.classList.add('show');
      try { document.exitPointerLock?.(); } catch (e) {}
    });
  }

  _apply(p) {
    this.perks.push(p.id);
    const c = this.combat;
    if (p.id === 'heal') { c.hearts = c.maxHearts ?? 4; this.ui.setHearts(c.hearts, c.hearts); }
    if (p.id === 'power') c.dmgMul = (c.dmgMul ?? 1) * 1.25;
    if (p.id === 'combo') this.comboWindow *= 1.5;
    if (p.id === 'greed') this.scoreMul *= 1.5;
    this.hud.toast(p.name.toUpperCase());
  }

  _onKill(e) {
    if (!this.active) return;
    this.combo = this.comboT > 0 ? this.combo + 1 : 1;
    this.comboT = this.comboWindow;
    const mult = 1 + Math.min(this.combo - 1, 20) * 0.25;
    const base = e.T.boss ? 2500 : (e.T.studs ?? 60) * 2;
    this.score += Math.round(base * mult * this.scoreMul * this.mod.score);
    if (this.combo === 5 || this.combo === 10 || this.combo === 20) this.hud.toast(`${this.combo} HIT CHAIN`);
    this._pulse();
    this._render();
  }

  update(dt) {
    if (!this.active) return;
    this.roundTime += dt;
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) { this.combo = 0; }
    }
    this._render(true);
  }

  // ─── HUD ──────────────────────────────────────────────────────────────
  _buildHud() {
    const h = document.createElement('div');
    h.id = 'gauntlet-hud';
    h.innerHTML = `<div class="gh-round"></div><div class="gh-score"></div>
      <div class="gh-combo"><span class="gh-x"></span><div class="gh-bar"><i></i></div></div>
      <div class="gh-meta"></div>`;
    document.body.append(h);
    this._hud = h;
    const i = document.createElement('div');
    i.id = 'gauntlet-inter';
    i.innerHTML = '<div class="gi-card"><div class="gi-title"></div><div class="gi-lines"></div><div class="gi-pick">PICK A PERK</div><div class="gi-perks"></div></div>';
    document.body.append(i);
    this._inter = i;
  }

  _show(on) { this._hud.classList.toggle('show', on); this._render(); }

  _pulse() {
    const x = this._hud.querySelector('.gh-combo');
    x.classList.remove('pop'); void x.offsetWidth; x.classList.add('pop');
  }

  _render(light = false) {
    const h = this._hud;
    const q = (s) => h.querySelector(s);
    q('.gh-score').textContent = this.score.toLocaleString();
    const bar = q('.gh-bar i');
    bar.style.transform = `scaleX(${Math.max(0, this.comboT / this.comboWindow)})`;
    q('.gh-combo').classList.toggle('on', this.combo > 1);
    if (light) {
      const t = this.roundTime, par = this.par ?? 0;
      q('.gh-meta').textContent = `${t.toFixed(0)}s / par ${par}s`;
      q('.gh-meta').classList.toggle('over', t > par);
      return;
    }
    q('.gh-round').textContent = `ROUND ${this.round} · ${this.mod.name.toUpperCase()}`;
    q('.gh-x').textContent = `x${(1 + Math.min(Math.max(this.combo - 1, 0), 20) * 0.25).toFixed(2)}  ${this.combo} CHAIN`;
  }
}
