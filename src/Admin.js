/**
 * Admin.js — owner tools for your own room (or single player): summon villains and heroes to
 * fight, or as friends who follow you and join the fight. Online, the owner's game runs every
 * summoned character and streams them to the room; other players see "ghosts" they can punch.
 */
import * as THREE from 'three';
import { disposeRigRoot } from './GlbMinifig.js?v=147';
import { LegoSpidey } from './LegoSpidey.js?v=183';
import { ENEMY_TYPES } from './Combat.js?v=246';
import { setFace } from './GameUI.js?v=127';
import { Agent } from './Agent.js?v=203';
import { kitForSkin } from './Kits.js?v=64';
import { attachKit, animateKit } from './CharacterGear.js?v=64';
import { isTypingTarget, overlayOpen, closeOverlays } from './Input.js?v=2';
import { appendRoleBadge } from './RoleBadge.js?v=1';

// [type key, name, skin] — villains reuse their boss/enemy behaviour when summoned as foes
export const ROSTER = [
  ['goblin', 'Green Goblin', 'greengoblin'], ['venom', 'Venom', 'glb:venombigfig'], ['sandman', 'Sandman', 'sandman'],
  ['lizard', 'The Lizard', 'glb:lizard'],
  ['loki', 'Loki', 'loki'], ['magneto', 'Magneto', 'magneto'], ['hydra', 'HYDRA Soldier', 'hydrasoldier'],
  ['ironman', 'Iron Man', 'ironman'], ['captainamerica', 'Captain America', 'captainamerica'], ['thor', 'Thor', 'thor'],
  ['wolverine', 'Wolverine', 'wolverine'], ['storm', 'Storm', 'storm'], ['blackwidow', 'Black Widow', 'blackwidow'],
  ['hawkeye', 'Hawkeye', 'hawkeye'], ['cyclops', 'Cyclops', 'cyclops'], ['beast', 'Beast', 'beast'],
  ['deadpool', 'Deadpool', 'deadpool'], ['silversurfer', 'Silver Surfer', 'silversurfer'],
  ['humantorch', 'Human Torch', 'humantorch'], ['mrfantastic', 'Mr. Fantastic', 'mrfantastic'], ['stanlee', 'Stan Lee', 'stanlee'],
  ['spiderman', "Spider-Man", 'glb:spiderman'],
  ['ironspider', "Iron Spider", 'glb:ironspider'],
  ['superiorspiderman', "Superior Spider-Man", 'glb:superiorspiderman'],
  ['spiderwoman', "Spider-Woman", 'glb:spiderwoman'],
  ['blackpanther', "Black Panther", 'glb:blackpanther'],
  ['daredevil', "Daredevil", 'glb:daredevil'],
  ['doctorstrange', "Doctor Strange", 'glb:doctorstrange'],
  ['ghostrider', "Ghost Rider", 'glb:ghostrider'],
  ['punisher', "Punisher", 'glb:punisher'],
  ['blade', "Blade", 'glb:blade'],
  ['electro', "Electro", 'glb:electro'],
  ['carnage', "Carnage", 'glb:carnage'],
  ['doctoroctopus', "Doctor Octopus", 'glb:doctoroctopus'],
  ['vulture', "Vulture", 'glb:vulture'],
  ['mysterio', "Mysterio", 'glb:mysterio'],
  ['kraventhehunter', "Kraven the Hunter", 'glb:kraventhehunter'],
  ['shocker', "Shocker", 'glb:shocker'],
  ['beetle', "Beetle", 'glb:beetle'],
  ['bullseye', "Bullseye", 'glb:bullseye'],
  ['elektra', "Elektra", 'glb:elektra'],
  ['moonknight', "Moon Knight", 'glb:moonknight'],
  ['nickfury', "Nick Fury", 'glb:nickfury'],
  ['starlord', "Star-Lord", 'glb:starlord'],
  ['gamora', "Gamora", 'glb:gamora'],
  ['drax', "Drax", 'glb:drax'],
  ['rocketraccoon', "Rocket Raccoon", 'glb:rocketraccoon'],
  ['falcon', "Falcon", 'glb:falcon'],
  ['wintersoldier', "Winter Soldier", 'glb:wintersoldier'],
  ['antman', "Ant-Man", 'glb:antman'],
  ['wasp', "Wasp", 'glb:wasp'],
  ['squirrelgirl', "Squirrel Girl", 'glb:squirrelgirl'],
  ['howardtheduck', "Howard the Duck", 'glb:howardtheduck'],
  ['redskull', "Red Skull", 'glb:redskull'],
  ['doctordoom', "Doctor Doom", 'glb:doctordoom'],
  ['modok', "M.O.D.O.K.", 'glb:modok'],
  ['blackcat', "Black Cat", 'glb:blackcat'],
  ['lukecage', "Luke Cage", 'glb:lukecage'],
  ['ironfist', "Iron Fist", 'glb:ironfist'],
  ['chameleon', "Chameleon", 'glb:chameleon'],
  ['jameson', "J. Jonah Jameson", 'glb:jameson'],
  ['peterparker', "Peter Parker", 'glb:peterparker'],
  ['gwenstacy', "Gwen Stacy", 'glb:gwenstacy'],
  ['maryjanewatson', "Mary Jane", 'glb:maryjanewatson'],
  ['auntmay', "Aunt May", 'glb:auntmay'],
];
// Villains keep their boss AI in Combat; every other character runs its own kit through Agent.
const SKIN = Object.fromEntries(ROSTER.map(([k, , s]) => [k, s]));
const LEGS = { venom: 0x111114 };

export class Admin {
  constructor({ scene, controller, combat, net = null, owner = false, rank = 0, mp = null, chat = null, freeplay = false, portal = null }) {
    Object.assign(this, { scene, controller, combat, net, owner, rank, mp, chat, freeplay, portal });
    // Owner (3) and admins (2) can summon; mods (1) get the player list only. The server
    // re-checks the role on every command, so a tampered client gains nothing.
    const can = (!!net && rank >= 2) || freeplay;
    this._builtMenu = false;
    this.friends = [];
    // A downed friend stops fighting and leaves the roster (Combat already broke it apart)
    combat.onAgentDown = a => {
      if (a.team === 'ally') this.friends = this.friends.filter(f => f !== a);
    };
    this.ghosts = new Map();
    this.nextId = 1;
    this._sendT = 0;
    this.el = document.getElementById('admin');
    if (can) { this._buildMenu(); this._builtMenu = true; }
    document.getElementById('summon-head').hidden = !can;
    document.getElementById('admin-grid')?.toggleAttribute('hidden', !can);
    document.getElementById('admin-players')?.toggleAttribute('hidden', !net);
    document.getElementById('admin-players-head')?.toggleAttribute('hidden', !net);
    document.getElementById('admin-tools')?.toggleAttribute('hidden', !can);
    document.addEventListener('keydown', e => {
      if (isTypingTarget(e)) return;
      // K: summon menu in Free Play and for the room's owner/admins; Story keeps its own cast
      if (e.code === 'KeyK' && !e.repeat && this.canSummon) {
        if (!this.isOpen && overlayOpen()) return;
        this.toggle();
      }
      if (e.code === 'Escape' && this.isOpen) this.toggle(false);
    });
    document.addEventListener('close-overlays', () => { if (this.isOpen) this.toggle(false); });

    if (net) {
      net.on('rank', m => {
        if (m.id === this.mp?.me?.id) {
          const can = this.canSummon;
          if (can && !this._builtMenu) { this._builtMenu = true; this._buildMenu(); }
          document.getElementById('summon-head').hidden = !can;
          document.getElementById('admin-grid')?.toggleAttribute('hidden', !can);
          document.getElementById('admin-tools')?.toggleAttribute('hidden', !can);
          if (!can && this.isOpen) this.toggle(false);
        }
        if (this.isOpen) this.renderPlayers();
      });
      net.on('owner', () => {
        const can = this.canSummon;
        if (can && !this._builtMenu) { this._builtMenu = true; this._buildMenu(); }
        document.getElementById('summon-head').hidden = !can;
        document.getElementById('admin-grid')?.toggleAttribute('hidden', !can);
        document.getElementById('admin-tools')?.toggleAttribute('hidden', !can);
        if (this.isOpen) this.renderPlayers();
      });
      // One host per room streams the summoned characters: the highest-ranked active player.
      // The server decides who that is, and broadcasts a 'host' message when it changes.
      net.on('ents', m => { if (!this.isHost) this._syncGhosts(m.list); });
      // Leaving host duty drops the previous host's ghosts; rejoining starts clean.
      net.on('host', () => { if (this.isHost) this._syncGhosts([]); });
      net.on('portal', () => {
        this._syncPortalButton();
        if (this.isOpen) this.renderPlayers();
      });
      net.on('hitEnt', m => {
        if (!this.isHost) return;
        const e = this.combat.enemies.find(x => x.alive && x.netId === m.ent);
        if (e) this.combat.damageEnemy(e, m.dmg, new THREE.Vector3(m.from?.[0] ?? e.root.position.x, e.root.position.y, m.from?.[1] ?? e.root.position.z));
      });
      // Everyone can punch the host's summoned foes through their ghosts
      combat.ghostTargets = () => [...this.ghosts.values()].filter(g => g.kind === 'foe' && g.rig);
      combat.onHitGhost = (g, dmg) => {
        const p = this.controller.root.position;
        net.send({ t: 'hitEnt', ent: g.id, dmg, from: [p.x, p.z] });
      };
    }
  }

  /** Live rank: the server can promote/demote mid-session and Multiplayer updates it. */
  get rankNow() { return this.mp?.myRank ?? this.rank ?? 0; }
  get canSummon() { return this.freeplay || (!!this.net && this.rankNow >= 2); }
  get isHost() { return this.freeplay || !!this.mp?.hostId && this.mp.hostId === this.mp.me?.id; }

  get isOpen() { return this.el.classList.contains('open'); }

  toggle(force) {
    const open = force ?? !this.isOpen;
    if (open) {
      closeOverlays();
      if (this.canSummon && !this._builtMenu) { this._builtMenu = true; this._buildMenu(); document.getElementById('summon-head').hidden = false; }
    }
    this.el.classList.toggle('open', open);
    if (open && document.pointerLockElement) document.exitPointerLock();
    if (open) { this._syncPortalButton(); this.renderPlayers(); }
  }

  _syncPortalButton() {
    const btn = document.getElementById('admin-portal');
    if (!btn) return;
    if (!this.portal) { btn.hidden = true; return; }
    btn.hidden = false;
    const on = !!this.portal.authorized;
    btn.textContent = on ? 'DEACTIVATE PORTAL GUN' : 'SPAWN PORTAL GUN';
    btn.title = on ? 'Deactivate the portal gun and clear both portals' : 'Spawn the portal gun';
  }

  /** Player list with what your rank allows: friend, mute, name colour, kick, ban, mod/admin. */
  renderPlayers() {
    const box = document.getElementById('admin-players');
    if (!box || !this.mp) return;
    box.innerHTML = '';
    const mine = this.mp.myRank ?? 0;
    const COLORS = ['#ffffff', '#ffd34d', '#ff5a4f', '#4fb3ff', '#5ad16b', '#c27aff', '#ff8ad8'];
    const list = [...this.mp.players.values()];
    if (!list.length) { box.textContent = 'Nobody else is here yet.'; return; }
    for (const p of list) {
      const row = document.createElement('div');
      row.className = 'pl-row';
      const name = document.createElement('span');
      name.className = 'pl-name';
      name.textContent = p.name;
      name.style.color = p.color ?? '';
      appendRoleBadge(name, p.rank, 'pl-role-badge');
      const tag = document.createElement('span');
      tag.className = 'pl-rank';
      tag.textContent = Number(p.rank) === 1 ? 'MOD' : '';
      row.append(name, tag);
      const btn = (label, on, cls = '') => {
        const b = document.createElement('button');
        b.className = 'pl-btn ' + cls;
        b.textContent = label;
        b.onclick = () => { on(); setTimeout(() => this.renderPlayers(), 150); };
        row.append(b);
      };
      const lower = p.name.toLowerCase();
      const isFriend = (this.mp.friends ?? []).includes(lower);
      btn(isFriend ? 'UNFRIEND' : 'FRIEND', () => this.net.send({ t: 'friend', name: p.name, on: !isFriend }));
      // Only admins and owners can hand out the portal gun. The server checks the rank again.
      if (this.portal && mine >= 2) {
        const hasGun = this.portal.hasPlayer(p.id);
        btn(hasGun ? 'REMOVE GUN' : 'GIVE GUN', () => this.net.send({
          t: 'mod', action: 'portal', target: p.id, on: !hasGun,
        }), 'portal');
      }
      const muted = this.chat?.isMuted(p.name);
      btn(muted ? 'UNMUTE' : 'MUTE', () => this.chat?.setMuted(p.name, !muted));
      const t = p.rank ?? 0;
      if (mine >= 3 && t < 3) {
        btn('TRANSFER OWNER', () => {
          const roomName = this.mp.room?.name ?? 'this room';
          if (confirm(`Transfer ${roomName} to ${p.name}? You will no longer be its owner.`)) {
            this.net.send({ t: 'mod', action: 'transferOwner', target: p.id });
          }
        }, 'owner');
      }
      if (mine >= 1 && t < mine) {
        btn('COLOUR', () => {
          const i = (COLORS.indexOf(p.color ?? '#ffffff') + 1) % COLORS.length;
          this.net.send({ t: 'mod', action: 'color', target: p.id, value: COLORS[i] });
        });
        btn('KICK', () => this.net.send({ t: 'mod', action: 'kick', target: p.id }), 'warn');
      }
      if (mine >= 2 && t < mine) {
        btn('BAN', () => { if (confirm(`Ban ${p.name} from your rooms for good?`)) this.net.send({ t: 'mod', action: 'ban', target: p.id }); }, 'warn');
        if (t < 1) btn('MAKE MOD', () => this.net.send({ t: 'mod', action: 'rank', target: p.id, value: 1 }));
        if (mine >= 3 && t < 2) btn('MAKE ADMIN', () => this.net.send({ t: 'mod', action: 'rank', target: p.id, value: 2 }));
        if (t > 0) btn('DEMOTE', () => this.net.send({ t: 'mod', action: 'rank', target: p.id, value: 0 }));
      }
      box.append(row);
    }
  }

  _buildMenu() {
    const grid = document.getElementById('admin-grid');
    grid.innerHTML = '';                                   // never stack a second copy of the roster
    const seen = new Set();
    for (const [key, name, skin] of ROSTER) {
      if (seen.has(key) || seen.has(name)) continue;
      seen.add(key); seen.add(name);
      const card = document.createElement('div');
      card.className = 'admin-card';
      const face = document.createElement('div');
      face.className = 'face';
      // Real portrait rendered from the character's model, drawn when the card scrolls into view
      const glbKey = skin.startsWith('glb:') ? skin : `glb:${skin}`;
      face.dataset.portrait = glbKey;
      this._faceObs ??= new IntersectionObserver(es => es.forEach(en => {
        if (!en.isIntersecting) return;
        this._faceObs.unobserve(en.target);
        setFace(en.target, en.target.dataset.portrait);
      }));
      this._faceObs.observe(face);
      const label = Object.assign(document.createElement('div'), { className: 'admin-name', textContent: name.toUpperCase() });
      const row = document.createElement('div');
      row.className = 'admin-btns';
      const fight = Object.assign(document.createElement('button'), { textContent: 'FIGHT', className: 'foe' });
      const friend = Object.assign(document.createElement('button'), { textContent: 'FRIEND', className: 'friend' });
      fight.onclick = () => { if (!window.hero?.dorm) this.summonFoe(key); };
      friend.onclick = () => { if (!window.hero?.dorm) this.summonFriend(key); };
      row.append(fight, friend);
      card.append(face, label, row);
      grid.append(card);
    }
    document.getElementById('admin-clear').onclick = () => this.clearAll();
    const portalBtn = document.getElementById('admin-portal');
    if (portalBtn) {
      portalBtn.hidden = !this.portal;
      portalBtn.onclick = () => {
        if (!this.canSummon || !this.portal) return;
        // Online this is a request: the server only grants/revokes it if our live rank is admin+.
        if (this.portal.authorized) this.portal.deactivate();
        else this.portal.grantSelf();
        this._syncPortalButton();
      };
      this._syncPortalButton();
    }
    document.getElementById('admin-heal').onclick = () => {
      this.combat.hearts = 4;
      this.combat.ui.setHearts(4, 4);
    };
  }

  _spot(min = 6, max = 10) {
    return this.combat.spotNear(this.controller.root.position, min, max);
  }

  async summonFoe(key) {
    if (!this.canSummon) return;
    if (ENEMY_TYPES[key]) {
      const e = await this.combat.spawn(key, this._spot());
      e.netId = this.nextId++;
      e.summoned = true;
      return e;
    }
    return this._summonAgent(key, 'enemy');
  }

  async summonFriend(key) {
    if (!this.canSummon) return;
    return this._summonAgent(key, 'ally');
  }

  /** Summon a character that fights with its own weapons, abilities and movement. */
  async _summonAgent(key, team) {
    const a = new Agent({
      scene: this.scene, combat: this.combat, key, team,
      pos: this._spot(team === 'ally' ? 3 : 7, team === 'ally' ? 6 : 11),
      slot: team === 'ally' ? this.friends.length : 0,
    });
    a.id = this.nextId++;
    await a.load();
    if (team === 'enemy') {
      a.netId = this.nextId++;
      a.summoned = true;
      this.combat.enemies.push(a);
    } else {
      this.combat.addAlly(a);
      this.friends.push(a);
    }
    this.combat.sfx?.play('ability');
    return a;
  }

  clearAll() {
    for (const e of this.combat.enemies) if ((e.summoned || e.isAgent) && e.alive) { e.alive = false; this.scene.remove(e.root); disposeRigRoot(e.root); }
    this.combat.enemies = this.combat.enemies.filter(e => !(e.summoned || e.isAgent));
    for (const f of this.friends) { f.alive = false; this.scene.remove(f.root); disposeRigRoot(f.root); }
    this.friends = [];
    this.combat.allies = [];
    this.combat.ui.setBoss(null);
  }

  // ─── Online: stream summons (owner) / draw ghosts (everyone else) ──────────
  _snapshot() {
    const r = n => Math.round(n * 100) / 100;
    const list = [];
    for (const e of this.combat.enemies) {
      if (!e.alive || !e.summoned) continue;
      const p = e.root.position;
      list.push({ id: e.netId, s: e.skin ?? e.T.skin, lc: e.T.legsColor ?? null, k: 'foe', p: [r(p.x), r(p.y), r(p.z)], r: r(e.root.rotation.y), sc: e.scale, at: r(e.attack ?? 0), hp: e.hp, mx: e.maxHp, n: e.T.name });
    }
    for (const f of this.friends) {
      const p = f.root.position;
      list.push({ id: f.id, s: f.skin, lc: LEGS[f.key] ?? null, k: 'friend', p: [r(p.x), r(p.y), r(p.z)], r: r(f.root.rotation.y), sc: 1, sp: f.speed, at: r(f.attack) });
    }
    return list;
  }

  async _syncGhosts(list) {
    const seen = new Set();
    for (const s of list) {
      seen.add(s.id);
      let g = this.ghosts.get(s.id);
      if (!g) {
        g = { id: s.id, kind: s.k, root: new THREE.Group(), target: new THREE.Vector3(...s.p), state: s };
        g.root.position.copy(g.target);
        this.ghosts.set(s.id, g);
        this.scene.add(g.root);
        new LegoSpidey({ skin: s.s, legsColor: s.lc ?? undefined }).load().then(rig => {
          if (!this.ghosts.has(s.id)) return;
          g.rig = rig;
          g.root.add(rig.root);
          g.kit = kitForSkin(s.s);
          if (g.kit) attachKit(rig, g.kit);
        });
      }
      g.target.set(...s.p);
      g.state = s;
      g.root.scale.setScalar(s.sc ?? 1);
    }
    for (const [id, g] of this.ghosts) {
      if (seen.has(id)) continue;
      // Gone: a defeated foe breaks into bricks for everyone
      if (g.kind === 'foe' && g.rig && (g.state.hp ?? 1) <= 2) this.combat.shatter(g.rig, g.root.position.clone());
      this.scene.remove(g.root);
      disposeRigRoot(g.root);
      this.ghosts.delete(id);
    }
  }

  update(dt) {
    if (this.net && this.isHost) {
      this._sendT -= dt;
      if (this._sendT <= 0) { this._sendT = 0.1; this.net.send({ t: 'ents', list: this._snapshot() }); }
    }
    for (const g of this.ghosts.values()) {
      const p = g.root.position;
      const moved = p.distanceTo(g.target);
      p.lerp(g.target, Math.min(1, dt * 10));
      let dr = (g.state.r ?? 0) - g.root.rotation.y;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      g.root.rotation.y += dr * Math.min(1, dt * 10);
      g.rig?.update(dt, { speed: g.state.sp ?? (moved > 0.05 ? 5 : 0), grounded: true, attack: g.state.at ?? 0, attackArm: 1 });
      if (g.rig) {
        g.t = (g.t ?? 0) + dt;
        animateKit(g.rig, g.t, { speed: g.state.sp ?? 0, attack: g.state.at ?? 0, flight: !!g.kit?.fly });
      }
    }
  }
}
