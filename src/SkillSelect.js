/**
 * SkillSelect.js — the player's loadout for chapter-earned skills.
 *
 * The Skill Tree decides what you own; Skill Select decides what is switched on. At most
 * LOADOUT_SLOTS learned skills are active at once, and every gameplay effect reads
 * `storySkills.active(id)`, so this panel really changes the game rather than only the UI.
 * The panel follows the player-room toggle and is reachable from the pause menu.
 */
import { SKILL_NODES, LOADOUT_SLOTS, storySkills } from './StorySkills.js?v=5';
import { roomPrefs } from './PlayerRoom.js?v=2';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export class SkillSelect {
  constructor() {
    this.pause = document.getElementById('pause-menu');
    this.nav = this.pause?.querySelector('.pause-menu-list');
    if (!this.nav) return;
    this._buildButton();
    this._buildPanel();
    window.addEventListener('storyskillschange', () => this.render());
    window.addEventListener('roomprefschange', () => this._applyAvailability());
    this._applyAvailability();
    this.render();
  }

  _buildButton() {
    const b = el('button', 'tt-item');
    b.id = 'pause-skill-select';
    b.type = 'button';
    b.innerHTML = '<span class="ti-num">04</span><span class="ti-body"><span class="ti-label">Skill Select</span><span class="ti-desc">Choose the lessons you carry</span></span>';
    // Keep the pause menu's printed numbering in order after inserting a row.
    const rows = [...this.nav.querySelectorAll('.tt-item')];
    const at = rows.findIndex(r => r.id === 'pause-ctrl-btn');
    if (at >= 0) this.nav.insertBefore(b, rows[at]);
    else this.nav.append(b);
    const all = [...this.nav.querySelectorAll('.tt-item')];
    all.forEach((row, i) => { const n = row.querySelector('.ti-num'); if (n) n.textContent = String(i + 1).padStart(2, '0'); });
    this.button = b;
    b.addEventListener('click', () => this.open());
  }

  _buildPanel() {
    const panel = el('section', 'skill-select');
    panel.id = 'skill-loadout';
    panel.setAttribute('aria-label', 'Skill select');
    panel.innerHTML = `<header class="ss-head">
        <div><span class="ss-kicker">WEB OF BRICKS · LOADOUT</span><h2>Skill Select</h2>
        <p>Switch on up to ${LOADOUT_SLOTS} learned lessons. Only active lessons change your hero.</p></div>
        <div class="ss-slots" aria-live="polite"></div>
      </header>
      <div class="ss-body"><div class="ss-list" role="list"></div></div>
      <footer class="ss-foot"><span class="ss-note">Earn more in the Skill Tree</span><button class="brick small ghost" id="skill-select-back" type="button">BACK TO PAUSE</button></footer>`;
    this.pause.append(panel);
    this.panel = panel;
    this.list = panel.querySelector('.ss-list');
    this.slots = panel.querySelector('.ss-slots');
    panel.querySelector('#skill-select-back').addEventListener('click', () => this.close());
    panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); this.close(); } });
  }

  _applyAvailability() {
    const on = roomPrefs.skillSelect;
    this.button?.classList.toggle('feature-off', !on);
    this.button?.setAttribute('aria-disabled', String(!on));
    const desc = this.button?.querySelector('.ti-desc');
    if (desc) desc.textContent = on ? 'Choose the lessons you carry' : 'Switched off in your room';
    if (!on) this.close();
  }

  open() {
    if (!roomPrefs.skillSelect) {
      const desc = this.button?.querySelector('.ti-desc');
      if (desc) {
        desc.textContent = 'Skill Select is switched off in your room';
        clearTimeout(this._noticeT);
        this._noticeT = setTimeout(() => this._applyAvailability(), 2200);
      }
      return;
    }
    this.pause.classList.remove('show-ctrl', 'show-settings', 'show-skills');
    this.pause.classList.add('show-select');
    this.render();
    requestAnimationFrame(() => (this.list.querySelector('.ss-card.on') ?? this.list.querySelector('.ss-card:not([disabled])') ?? document.getElementById('skill-select-back'))?.focus());
  }

  close() {
    this.pause?.classList.remove('show-select');
    this.button?.focus();
  }

  render() {
    if (!this.list) return;
    this._applyAvailability();
    const learned = SKILL_NODES.filter(n => storySkills.has(n.id));
    const equipped = new Set(storySkills.equipped);
    this.slots.innerHTML = '';
    const active = learned.filter(n => equipped.has(n.id));
    for (let i = 0; i < LOADOUT_SLOTS; i++) {
      const slot = el('span', `ss-slot${i < active.length ? ' on' : ''}`);
      slot.textContent = active[i]?.name ?? 'EMPTY';
      this.slots.append(slot);
    }
    this.slots.setAttribute('aria-label', `${equipped.size} of ${LOADOUT_SLOTS} slots used`);
    this.list.innerHTML = '';
    if (!learned.length) {
      const empty = el('div', 'ss-empty');
      empty.innerHTML = '<b>Nothing learned yet.</b><span>Finish story chapters and spend points in the Skill Tree.</span>';
      this.list.append(empty);
      return;
    }
    for (const node of learned) {
      const on = equipped.has(node.id);
      const card = el('button', `ss-card${on ? ' on' : ''}`);
      card.type = 'button';
      card.dataset.branch = node.branch.toLowerCase();
      card.setAttribute('aria-pressed', String(on));
      card.innerHTML = '<span class="ss-icon"></span><span class="ss-copy"><b class="ss-name"></b><small class="ss-desc"></small></span><span class="ss-state"></span>';
      card.querySelector('.ss-icon').textContent = node.icon;
      card.querySelector('.ss-name').textContent = node.name;
      card.querySelector('.ss-desc').textContent = node.desc;
      card.querySelector('.ss-state').textContent = on ? 'ACTIVE' : 'OFF';
      card.addEventListener('click', () => {
        const okay = storySkills.setActive(node.id, !storySkills.equipped.includes(node.id));
        if (!okay && !storySkills.equipped.includes(node.id)) {
          card.classList.add('denied');
          setTimeout(() => card.classList.remove('denied'), 320);
          return;
        }
        this.render();
        requestAnimationFrame(() => this.list.querySelector(`[data-node="${node.id}"]`)?.focus());
      });
      card.dataset.node = node.id;
      this.list.append(card);
    }
  }
}
