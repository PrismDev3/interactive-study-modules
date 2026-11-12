/** StorySkills.js — chapter-earned, locally saved upgrades for the story campaign. */
import { progress } from './Progress.js?v=60';
import { roomPrefs } from './PlayerRoom.js?v=2';

export const SKILL_NODES = [
  { id: 'webflow', name: 'Web Flow', branch: 'MOVEMENT', icon: '↗', row: 0, col: 1, requires: [], desc: 'Ability cooldowns recover 12% faster.' },
  { id: 'impact', name: 'Measured Force', branch: 'COMBAT', icon: '✦', row: 1, col: 0, requires: ['webflow'], desc: 'Your attacks deal 20% more damage.' },
  { id: 'secondwind', name: 'Second Wind', branch: 'RESOLVE', icon: '♡', row: 1, col: 2, requires: ['webflow'], desc: 'Recover one heart after every mission.' },
  { id: 'streetwise', name: 'Streetwise', branch: 'COMBAT', icon: '◈', row: 2, col: 0, requires: ['impact'], desc: 'Mission rewards give 25% more studs.' },
  { id: 'heart', name: 'Aunt May’s Advice', branch: 'RESOLVE', icon: '♥', row: 2, col: 2, requires: ['secondwind'], desc: 'Gain one extra heart.' },
  { id: 'laststand', name: 'Carry It Forward', branch: 'LEGACY', icon: '✧', row: 3, col: 1, requires: ['streetwise', 'heart'], desc: 'Survive one otherwise-fatal hit per life.' },
];

const KEY = 'storySkills';
const LOADOUT_KEY = 'storySkillLoadout';
let cache = null;
let loadoutCache = null;
function read() {
  if (cache) return cache;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved?.v === 1 && Array.isArray(saved.unlocked)) {
      const known = new Set(SKILL_NODES.map(n => n.id));
      cache = new Set(saved.unlocked.filter(id => known.has(id)));
      return cache;
    }
  } catch {}
  cache = new Set();
  return cache;
}
function write(unlocked) {
  cache = new Set(unlocked);
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, unlocked })); } catch {}
}

/** Which learned skills are switched on. Older saves had no loadout: keep every skill active. */
function readLoadout() {
  if (loadoutCache) return loadoutCache;
  const unlocked = read();
  try {
    const saved = JSON.parse(localStorage.getItem(LOADOUT_KEY) ?? 'null');
    if (Array.isArray(saved)) {
      const known = new Set(SKILL_NODES.map(n => n.id));
      loadoutCache = new Set(saved.filter(id => known.has(id) && unlocked.has(id)));
      return loadoutCache;
    }
  } catch {}
  loadoutCache = new Set(unlocked);
  return loadoutCache;
}
function writeLoadout(set) {
  loadoutCache = new Set(set);
  try { localStorage.setItem(LOADOUT_KEY, JSON.stringify([...loadoutCache])); } catch {}
}

export const LOADOUT_SLOTS = 3;

export const storySkills = {
  get unlocked() { return [...read()]; },
  get points() { return Math.max(0, Math.min(SKILL_NODES.length, progress.chaptersDone) - read().size); },
  has(id) { return read().has(id); },
  /** Learned *and* switched on in Skill Select. Every gameplay effect uses this. */
  active(id) { return read().has(id) && readLoadout().has(id); },
  get equipped() { return [...readLoadout()]; },
  setActive(id, on) {
    const saved = read();
    if (!saved.has(id)) return false;
    const current = readLoadout();
    if (on && !current.has(id) && current.size >= LOADOUT_SLOTS) return false;
    if (on) current.add(id); else current.delete(id);
    writeLoadout(current);
    window.dispatchEvent(new CustomEvent('storyskillschange'));
    return true;
  },
  canUnlock(id) {
    const node = SKILL_NODES.find(n => n.id === id);
    const saved = read();
    return !!node && !saved.has(id) && this.points > 0 && node.requires.every(key => saved.has(key));
  },
  unlock(id) {
    if (!this.canUnlock(id)) return false;
    write([...read(), id]);
    // A freshly learned skill starts switched on unless the loadout is already full.
    const current = readLoadout();
    if (current.size < LOADOUT_SLOTS) writeLoadout(new Set([...current, id]));
    window.dispatchEvent(new CustomEvent('storyskillschange'));
    return true;
  },
};

const nodeHTML = `<span class="sn-branch"></span><span class="sn-icon"></span><span class="sn-copy"><b class="sn-name"></b><small class="sn-desc"></small></span><span class="sn-state"></span>`;

/** The skill screen is mounted into the pause menu so it never interrupts a cutscene. */
export class StorySkillTree {
  constructor() {
    this.pause = document.getElementById('pause-menu');
    this.panel = document.getElementById('story-skill-tree');
    this.grid = document.getElementById('skill-map');
    this.points = document.getElementById('skill-points');
    this.detail = document.getElementById('skill-detail');
    this.button = document.getElementById('pause-skills');
    if (!this.pause || !this.panel || !this.grid) return;
    if (!this.detail) {
      this.detail = document.createElement('div');
      this.detail.id = 'skill-detail';
      this.detail.className = 'skill-detail';
      this.detail.setAttribute('aria-live', 'polite');
      const foot = this.panel.querySelector('.skill-foot');
      if (foot) this.panel.insertBefore(this.detail, foot);
      else this.panel.append(this.detail);
    }

    this.button?.addEventListener('click', () => {
      if (!roomPrefs.skillTree) { this._notice('Skill Tree is switched off in your room'); return; }
      this.pause.classList.remove('show-ctrl', 'show-settings', 'show-select');
      this.pause.classList.add('show-skills');
      this.render();
      requestAnimationFrame(() => (this.grid.querySelector('.skill-node.ready') ?? document.getElementById('skills-back'))?.focus());
    });
    document.getElementById('skills-back')?.addEventListener('click', () => {
      this.pause.classList.remove('show-skills');
      this.button?.focus();
    });
    window.addEventListener('storyskillschange', () => this.render());
    window.addEventListener('roomprefschange', () => this._applyAvailability());
    this._applyAvailability();
    this.render();
  }

  _applyAvailability() {
    const on = roomPrefs.skillTree;
    this.button?.classList.toggle('feature-off', !on);
    this.button?.setAttribute('aria-disabled', String(!on));
    const desc = this.button?.querySelector('.ti-desc');
    if (desc) desc.textContent = on ? 'Lessons earned through the story' : 'Switched off in your room';
    if (!on) this.pause?.classList.remove('show-skills');
  }

  _notice(text) {
    const desc = this.button?.querySelector('.ti-desc');
    if (!desc) return;
    desc.textContent = text;
    clearTimeout(this._noticeT);
    this._noticeT = setTimeout(() => this._applyAvailability(), 2200);
  }

  _showDetail(node) {
    if (!this.detail || !node) return;
    const bought = storySkills.has(node.id);
    const canBuy = storySkills.canUnlock(node.id);
    const branch = node.branch;
    this.detail.innerHTML = '';
    const kicker = document.createElement('span');
    kicker.className = 'sd-kicker';
    kicker.textContent = `${branch} · ${bought ? 'LEARNED' : canBuy ? 'READY TO LEARN' : 'LOCKED'}`;
    const name = document.createElement('b');
    name.className = 'sd-name';
    name.textContent = node.name;
    const desc = document.createElement('span');
    desc.className = 'sd-desc';
    desc.textContent = bought
      ? `${node.desc}${storySkills.active(node.id) ? '' : ' (switched off in Skill Select)'}`
      : canBuy ? `${node.desc} Costs 1 point.` : node.desc;
    this.detail.append(kicker, name, desc);
    this.detail.dataset.branch = branch.toLowerCase();
  }

  render() {
    if (!this.grid) return;
    this._applyAvailability();
    const points = storySkills.points;
    this.points.textContent = `${points} ${points === 1 ? 'POINT' : 'POINTS'} AVAILABLE`;
    this.grid.querySelectorAll('.skill-node').forEach(node => node.remove());
    for (const node of SKILL_NODES) {
      const bought = storySkills.has(node.id);
      const canBuy = storySkills.canUnlock(node.id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `skill-node ${bought ? 'bought' : canBuy ? 'ready' : 'locked'}`;
      button.dataset.node = node.id;
      button.dataset.branch = node.branch.toLowerCase();
      button.style.left = `${15 + node.col * 35}%`;
      button.style.top = `${2 + node.row * 25}%`;
      button.disabled = !bought && !canBuy;
      button.setAttribute('aria-label', `${node.name}. ${node.desc}${bought ? ' Unlocked.' : canBuy ? ' Unlock with one point.' : ' Locked.'}`);
      button.innerHTML = nodeHTML;
      button.querySelector('.sn-branch').textContent = node.branch;
      button.querySelector('.sn-icon').textContent = node.icon;
      button.querySelector('.sn-name').textContent = node.name;
      button.querySelector('.sn-desc').textContent = node.desc;
      button.querySelector('.sn-state').textContent = bought ? (storySkills.active(node.id) ? 'ACTIVE' : 'LEARNED') : canBuy ? 'LEARN' : 'LOCKED';
      button.addEventListener('click', () => { storySkills.unlock(node.id); this._showDetail(node); });
      button.addEventListener('focus', () => this._showDetail(node));
      button.addEventListener('pointerenter', () => this._showDetail(node));
      button.addEventListener('pointerleave', () => this._showDetail(SKILL_NODES.find(n => n.id === (this.grid.querySelector('.skill-node.ready') ?? this.grid.querySelector('.skill-node.bought'))?.dataset.node) ?? node));
      this.grid.append(button);
    }
    this._showDetail(SKILL_NODES.find(n => storySkills.canUnlock(n.id)) ?? SKILL_NODES.find(n => storySkills.has(n.id)) ?? SKILL_NODES[0]);
  }
}
