/**
 * Kits.js — every character's moveset, restored from the DS source.
 *
 * The ROM's own ability table drove these kits:
 *   Ability_FlightParticles / FlightJets  → Iron Man, Thor, Storm, Human Torch, Silver Surfer, Magneto
 *   Ability_TeleportFloor                 → Loki's blink
 *   Ability_StretchArms                   → Mr. Fantastic's reach
 *   Ability_BerserkRage                   → Wolverine
 *   Ability_Mind_Move                     → Magneto's magnetic pull
 *   Ability_WeaponSheath                  → Deadpool (katanas sheathed, pistols drawn)
 *   Ability_Sharpshoot_Switch             → Hawkeye's volley
 *   Ability_IceBoard / LokiIceShardShield → Loki's ice shield
 * plus FX_REPULSOR_BL, LightningBolt, CaptainAmericaShield, Bow, Claw.
 *
 * A kit is pure data + cast functions. The Agent that runs it owns movement, targeting
 * and animations; Combat owns projectiles, beams, damage and team filtering. Every cast
 * therefore does real damage through the same combat pipeline the player uses.
 */

const v3 = (x, y, z) => ({ x, y, z });

/** Severe a small area around `pos` for the caster's opponents. */
const blast = (o) => (a, c) => {
  c.aoe(a.chest(), { fromAlly: a.team === 'ally', ...o });
  return true;
};

/** Hitscan beam from the caster to their target. */
const ray = (o) => (a, c, t) => {
  if (!t) return false;
  c.beam(a, t, o);
  return true;
};

/** Fire a volley at the current target. */
const volley = (o) => (a, c, t) => {
  if (!t) return false;
  c.fireAt(a, t, o);
  return true;
};

/** Dash in a direction with an optional hit at the end. */
const dash = (o) => (a, c, t) => {
  const dir = (t ? c.centerOf(t) : a.faceDir().multiplyScalar(1)).clone();
  if (t) dir.sub(a.root.position);
  dir.y = 0;
  if (dir.lengthSq() < 1e-3) return false;
  dir.normalize();
  a.root.position.addScaledVector(dir, o.dist ?? 4.5);
  a.vel.set(dir.x * 4, o.up ?? 2, dir.z * 4);
  c.fx.burst(a.chest(), { n: 18, colors: o.colors ?? [0xffffff], speed: 4, up: 2, size: 0.12, life: 0.35 });
  if (o.dmg && t) c.damageTarget(t, o.dmg, a.chest(), o.knock ?? 8);
  return true;
};

const REGEN = 4;

export const KITS = {
  // ─── Iron Man ────────────────────────────────────────────────────────────
  ironman: {
    name: 'Iron Man', skin: 'ironman', hp: 11, speed: 9, fly: true, hover: 1.0, studs: 900,
    weapons: ['repulsors', 'reactor', 'jets'],
    melee: { dmg: 2, rate: 0.9, range: 2.4, kind: 'punch', knock: 8 },
    ranged: { kind: 'energy', rate: 0.55, speed: 36, dmg: 1, range: 32, color: 0x9fe4ff, size: 0.15, muzzle: 'both' },
    abilities: [
      { id: 'unibeam', name: 'Unibeam', cd: 8, range: 34, anim: 'cast', cast: ray({ color: 0xbfefff, width: 0.85, dmg: 3, knock: 12 }) },
      { id: 'missiles', name: 'Micro-Missiles', cd: 10, range: 28, anim: 'cast',
        cast: volley({ kind: 'missile', speed: 22, dmg: 1, burst: 4, spread: 0.22, radius: 2.4, color: 0xffb04a, size: 0.12, muzzle: 'both', life: 5 }) },
    ],
  },

  // ─── Deadpool ────────────────────────────────────────────────────────────
  deadpool: {
    name: 'Deadpool', skin: 'deadpool', hp: 10, speed: 9.5, studs: 800,
    weapons: ['katanaDual', 'holsters'],
    melee: { dmg: 1, rate: 0.38, range: 2.2, kind: 'sword', knock: 4 },
    ranged: { kind: 'bullet', rate: 0.45, speed: 44, dmg: 1, range: 28, color: 0xffe08a, size: 0.07, muzzle: 'both' },
    abilities: [
      { id: 'grenade', name: 'Grenade', cd: 9, range: 24, anim: 'cast',
        cast: (a, c, t) => {
          if (!t) return false;
          c.fireAt(a, t, { kind: 'grenade', speed: 18, dmg: 2, color: 0x3a6a2a, size: 0.16, gravity: 16, radius: 3.6, muzzle: 'R', life: 4 });
          return true;
        } },
      { id: 'regen', name: 'Healing Factor', cd: 14, self: true, anim: 'cast',
        cast: (a, c) => {
          if (a.hp >= a.maxHp) return false;
          a.hp = Math.min(a.maxHp, a.hp + REGEN);
          c.fx.burst(a.chest(), { n: 22, colors: [0xff2a3a, 0xffc0c8], speed: 3, up: 4, size: 0.11, life: 0.8, gravity: -2 });
          return true;
        } },
    ],
  },

  // ─── Loki ────────────────────────────────────────────────────────────────
  loki: {
    name: 'Loki', skin: 'loki', hp: 12, speed: 8, studs: 1200,
    weapons: ['horns', 'staff'],
    melee: { dmg: 2, rate: 0.8, range: 2.7, kind: 'sword', knock: 7 },
    ranged: { kind: 'bolt', rate: 1.0, speed: 28, dmg: 1, range: 28, color: 0x5dff5d, size: 0.15, muzzle: 'R' },
    abilities: [
      { id: 'blink', name: 'Teleport', cd: 7, range: 40, anim: 'cast',
        cast: (a, c, t) => {
          a.spark(0x5dff5d);
          const to = t ? c.spotNear(c.centerOf(t), 5, 9) : c.spotNear(a.root.position, 8, 12);
          a.root.position.copy(to);
          a.groundY = to.y - 0.5;
          a.spark(0x5dff5d);
          return true;
        } },
      { id: 'ice', name: 'Ice Shard Shield', cd: 12, self: true, anim: 'cast',
        cast: (a, c) => {
          a.buffs.shield = 4.5;
          c.fx.burst(a.chest(), { n: 30, colors: [0xbfe8ff, 0x5dff5d, 0xffffff], speed: 4, up: 3, size: 0.12, life: 0.9 });
          c.aoe(a.chest(), { fromAlly: a.team === 'ally', radius: 3.4, dmg: 1, color: 0x9fd8ff, knock: 10 });
          return true;
        } },
      { id: 'frost', name: 'Frost Nova', cd: 9, range: 12, anim: 'cast',
        cast: (a, c, t) => {
          if (!t) return false;
          c.aoe(c.centerOf(t), { fromAlly: a.team === 'ally', radius: 3.2, dmg: 1, color: 0x9fd8ff, knock: 6 });
          return true;
        } },
    ],
  },

  // ─── Thor ────────────────────────────────────────────────────────────────
  thor: {
    name: 'Thor', skin: 'thor', hp: 13, speed: 8.5, fly: true, hover: 1.1, studs: 1000,
    weapons: ['hammer'],
    melee: { dmg: 3, rate: 1.0, range: 2.7, kind: 'sword', knock: 12 },
    ranged: { kind: 'lightning', anim: 'shoot', rate: 1.1, speed: 32, dmg: 2, range: 26, color: 0x9fd8ff, size: 0.17, muzzle: 'R' },
    abilities: [
      { id: 'thunderclap', name: 'Thunderclap', cd: 9, range: 6, anim: 'punch',
        cast: blast({ radius: 5.5, dmg: 3, color: 0xbfe8ff, knock: 16 }) },
      { id: 'chain', name: 'Lightning Bolt', cd: 8, range: 34, anim: 'cast',
        cast: ray({ color: 0xdff4ff, width: 1.0, dmg: 3, knock: 10 }) },
    ],
  },

  // ─── Captain America ─────────────────────────────────────────────────────
  captainamerica: {
    name: 'Captain America', skin: 'captainamerica', hp: 12, speed: 9, studs: 800,
    weapons: ['shield'],
    melee: { dmg: 2, rate: 0.62, range: 2.4, kind: 'punch', knock: 9 },
    ranged: { kind: 'shield', rate: 2.1, speed: 26, dmg: 2, range: 22, color: 0xdfe8ff, size: 0.3, muzzle: 'R', boomerang: true },
    abilities: [
      { id: 'rally', name: 'Rally', cd: 14, self: true, anim: 'cast',
        cast: (a, c) => {
          a.buffs.shield = Math.max(a.buffs.shield, 5);
          for (const ally of c.allies) {
            if (ally === a || !ally.alive) continue;
            if (ally.root.position.distanceTo(a.root.position) < 14) ally.buffs.shield = Math.max(ally.buffs.shield, 4);
          }
          c.fx.ring(a.chest(), { n: 40, colors: [0x3a6adf, 0xf2f2f4, 0xc4161c], speed: 8, size: 0.12, life: 0.7 });
          return true;
        } },
      { id: 'slam', name: 'Shield Slam', cd: 8, range: 5, anim: 'punch',
        cast: blast({ radius: 4.2, dmg: 2, color: 0xdfe8ff, knock: 12 }) },
    ],
  },

  // ─── Wolverine ───────────────────────────────────────────────────────────
  wolverine: {
    name: 'Wolverine', skin: 'wolverine', hp: 14, speed: 10, studs: 900,
    weapons: ['claws'],
    melee: { dmg: 1, rate: 0.3, range: 2.1, kind: 'sword', knock: 3 },
    ranged: null,
    abilities: [
      { id: 'berserk', name: 'Berserker Rage', cd: 14, self: true, anim: 'cheer',
        cast: (a, c) => {
          a.buffs.rage = 6;
          a.buffs.speed = 6;
          c.fx.burst(a.chest(), { n: 26, colors: [0xffc21a, 0xffffff], speed: 6, up: 3, size: 0.12, life: 0.8 });
          return true;
        } },
      { id: 'lunge', name: 'Feral Lunge', cd: 6, range: 14, anim: 'sword', cast: dash({ dist: 5, dmg: 2, knock: 9 }) },
    ],
  },

  // ─── Hawkeye ─────────────────────────────────────────────────────────────
  hawkeye: {
    name: 'Hawkeye', skin: 'hawkeye', hp: 9, speed: 8.6, studs: 700,
    weapons: ['bow'],
    melee: { dmg: 1, rate: 0.9, range: 2.0, kind: 'punch', knock: 4 },
    ranged: { kind: 'arrow', rate: 0.62, speed: 48, dmg: 1, range: 36, color: 0xd8e8ff, size: 0.09, muzzle: 'L' },
    abilities: [
      { id: 'explosive', name: 'Explosive Arrow', cd: 8, range: 34, anim: 'shoot',
        cast: volley({ kind: 'arrow', speed: 42, dmg: 2, color: 0xff7a2a, size: 0.11, radius: 3.2, muzzle: 'L' }) },
      { id: 'volley', name: 'Trick Volley', cd: 7, range: 32, anim: 'shoot',
        cast: volley({ kind: 'arrow', speed: 44, dmg: 1, burst: 3, spread: 0.28, color: 0xd8e8ff, size: 0.09, muzzle: 'L' }) },
    ],
  },

  // ─── Black Widow ─────────────────────────────────────────────────────────
  blackwidow: {
    name: 'Black Widow', skin: 'blackwidow', hp: 9, speed: 10, studs: 700,
    weapons: ['batons'],
    melee: { dmg: 1, rate: 0.42, range: 2.1, kind: 'sword', knock: 4 },
    ranged: { kind: 'bullet', rate: 0.5, speed: 42, dmg: 1, range: 26, color: 0xffd0d8, size: 0.07, muzzle: 'R' },
    abilities: [
      { id: 'bite', name: "Widow's Bite", cd: 9, range: 20, anim: 'cast',
        cast: ray({ color: 0xff3a6a, width: 0.6, dmg: 2, knock: 8 }) },
      { id: 'dodge', name: 'Acrobatic Dodge', cd: 5, self: true, anim: 'cast', cast: dash({ dist: 5, up: 5, colors: [0xff3a6a, 0xffffff] }) },
    ],
  },

  // ─── Cyclops ─────────────────────────────────────────────────────────────
  cyclops: {
    name: 'Cyclops', skin: 'cyclops', hp: 10, speed: 8.4, studs: 800,
    weapons: ['visor'],
    melee: { dmg: 1, rate: 0.9, range: 2.2, kind: 'punch', knock: 5 },
    ranged: { kind: 'energy', rate: 0.75, speed: 44, dmg: 1, range: 36, color: 0xff3a2a, size: 0.14, muzzle: 'head' },
    abilities: [
      { id: 'widebeam', name: 'Wide Beam', cd: 10, range: 36, anim: 'optic',
        cast: ray({ color: 0xff6a4a, width: 1.7, dmg: 3, knock: 14 }) },
      { id: 'concussive', name: 'Concussive Burst', cd: 8, range: 18, anim: 'optic',
        cast: blast({ radius: 4.6, dmg: 2, color: 0xff3a2a, knock: 18 }) },
    ],
  },

  // ─── Beast ───────────────────────────────────────────────────────────────
  beast: {
    name: 'Beast', skin: 'beast', hp: 12, speed: 10.5, studs: 700,
    weapons: [],
    melee: { dmg: 2, rate: 0.55, range: 2.3, kind: 'punch', knock: 7 },
    ranged: null,
    abilities: [
      { id: 'slam', name: 'Leap Slam', cd: 7, range: 6, anim: 'punch',
        cast: (a, c) => {
          a.vel.y = 7;
          c.aoe(a.root.position.clone().setY(a.groundY + 0.4), { fromAlly: a.team === 'ally', radius: 4.2, dmg: 2, color: 0x2a56b8, knock: 12 });
          return true;
        } },
      { id: 'agility', name: 'Primal Agility', cd: 10, self: true, anim: 'cheer',
        cast: (a) => { a.buffs.speed = 6; return true; } },
    ],
  },

  // ─── Storm ───────────────────────────────────────────────────────────────
  storm: {
    name: 'Storm', skin: 'storm', hp: 10, speed: 9, fly: true, hover: 1.0, studs: 900,
    weapons: ['capeWhite'],
    melee: { dmg: 1, rate: 0.85, range: 2.1, kind: 'punch', knock: 5 },
    ranged: { kind: 'lightning', anim: 'cast', rate: 0.68, speed: 38, dmg: 1, range: 34, color: 0xbfe8ff, size: 0.15, muzzle: 'both' },
    abilities: [
      { id: 'chain', name: 'Chain Lightning', cd: 9, range: 30, anim: 'cast',
        cast: (a, c, t) => {
          if (!t) return false;
          c.beam(a, t, { color: 0xdff4ff, width: 0.7, dmg: 2, knock: 8 });
          c.aoe(c.centerOf(t), { fromAlly: a.team === 'ally', radius: 3.4, dmg: 1, color: 0xbfe8ff, knock: 6 });
          return true;
        } },
      { id: 'gust', name: 'Wind Gust', cd: 6, range: 12, anim: 'cast',
        cast: blast({ radius: 5, dmg: 1, color: 0xdfefff, knock: 24 }) },
    ],
  },

  // ─── Human Torch ─────────────────────────────────────────────────────────
  humantorch: {
    name: 'Human Torch', skin: 'humantorch', hp: 10, speed: 9.5, fly: true, hover: 1.2, studs: 900,
    weapons: ['flames'],
    melee: { dmg: 1, rate: 0.8, range: 2.2, kind: 'punch', knock: 6 },
    ranged: { kind: 'fire', rate: 0.5, speed: 30, dmg: 1, range: 28, color: 0xff8a1a, size: 0.19, muzzle: 'both' },
    abilities: [
      { id: 'nova', name: 'Flame Nova', cd: 8, range: 6, anim: 'cheer',
        cast: blast({ radius: 5.4, dmg: 2, color: 0xff8a1a, knock: 14 }) },
      { id: 'meteor', name: 'Fireball', cd: 6, range: 28, anim: 'cast',
        cast: volley({ kind: 'fire', speed: 26, dmg: 2, radius: 2.8, color: 0xff5a0a, size: 0.24, muzzle: 'R' }) },
    ],
  },

  // ─── Mr. Fantastic ───────────────────────────────────────────────────────
  mrfantastic: {
    name: 'Mr. Fantastic', skin: 'mrfantastic', hp: 11, speed: 7.6, studs: 800,
    weapons: [],
    melee: { dmg: 2, rate: 0.7, range: 5.2, kind: 'stretch', knock: 10 },
    ranged: null,
    abilities: [
      { id: 'grab', name: 'Stretch Grab', cd: 7, range: 16, anim: 'stretch',
        cast: (a, c, t) => {
          if (!t) return false;
          // Reels the target in, then slugs them
          const from = a.chest();
          if (!t.player) {
            const dir = a.root.position.clone().sub(t.root.position).setY(0);
            const d = dir.length();
            if (d > 3) t.root.position.addScaledVector(dir.normalize(), Math.min(d - 3, 6));
          }
          c.damageTarget(t, 2, from, 4);
          c.fx.burst(c.centerOf(t), { n: 14, colors: [0x2a6adf, 0xffffff], speed: 3, up: 2, size: 0.1, life: 0.4 });
          return true;
        } },
      { id: 'slam', name: 'Elastic Slam', cd: 9, range: 6, anim: 'stretch',
        cast: blast({ radius: 4.4, dmg: 2, color: 0x2a6adf, knock: 14 }) },
    ],
  },

  // ─── Silver Surfer ───────────────────────────────────────────────────────
  silversurfer: {
    name: 'Silver Surfer', skin: 'silversurfer', hp: 13, speed: 12, fly: true, hover: 1.3, studs: 1500,
    weapons: ['board'],
    melee: { dmg: 2, rate: 0.8, range: 2.5, kind: 'punch', knock: 10 },
    ranged: { kind: 'energy', rate: 0.6, speed: 42, dmg: 2, range: 36, color: 0xdfefff, size: 0.17, muzzle: 'R' },
    abilities: [
      { id: 'cosmic', name: 'Cosmic Wave', cd: 9, range: 34, anim: 'cast',
        cast: ray({ color: 0xffffff, width: 1.2, dmg: 3, knock: 12 }) },
      { id: 'rush', name: 'Board Rush', cd: 6, range: 20, anim: 'cast', cast: dash({ dist: 7, dmg: 2, knock: 12, colors: [0xdfefff, 0x9fd8ff] }) },
    ],
  },

  // ─── Magneto ─────────────────────────────────────────────────────────────
  magneto: {
    name: 'Magneto', skin: 'magneto', hp: 13, speed: 9.5, fly: true, hover: 1.1, studs: 1600,
    weapons: ['helmet'],
    melee: { dmg: 2, rate: 0.9, range: 2.4, kind: 'punch', knock: 9 },
    ranged: { kind: 'shard', rate: 0.85, speed: 32, dmg: 1, range: 32, color: 0xb24bff, size: 0.13, muzzle: 'both', burst: 3, spread: 0.12 },
    abilities: [
      { id: 'pull', name: 'Magnetic Pull', cd: 8, range: 18, anim: 'cast',
        cast: (a, c) => {
          for (const t of c.opponentsOf(a.team)) {
            if (!(t.alive ?? true)) continue;
            const to = a.chest().sub(c.centerOf(t));
            const d = to.length();
            if (d > 18) continue;
            if (!t.player) {
              t.root.position.addScaledVector(to.clone().setY(0).normalize(), Math.min(d * 0.55, 7));
              t.vel.y = Math.max(t.vel.y ?? 0, 3);
            }
            c.damageTarget(t, 1, a.chest(), 2);
          }
          c.fx.ring(a.chest(), { n: 46, colors: [0xb24bff, 0xe0a8ff], speed: 10, size: 0.12, life: 0.7 });
          return true;
        } },
      { id: 'dome', name: 'Magnetic Dome', cd: 12, self: true, anim: 'cast',
        cast: (a, c) => {
          a.buffs.shield = 5;
          c.fx.burst(a.chest(), { n: 34, colors: [0xb24bff, 0x7a2adf, 0xffffff], speed: 4, up: 2, size: 0.13, life: 1 });
          return true;
        } },
    ],
  },

  // ─── Villains, when summoned as allies ───────────────────────────────────
  goblin: {
    name: 'Green Goblin', skin: 'greengoblin', hp: 12, speed: 10, fly: true, hover: 1.4, studs: 1400,
    weapons: ['glider'],
    melee: { dmg: 2, rate: 0.9, range: 2.4, kind: 'punch', knock: 8 },
    ranged: { kind: 'pumpkin', anim: 'shoot', rate: 1.6, speed: 18, dmg: 1, range: 30, color: 0xff7a00, size: 0.2, gravity: 16, radius: 3.2, muzzle: 'R', life: 4 },
    abilities: [
      { id: 'pumpkin', name: 'Pumpkin Bombs', cd: 9, range: 26, anim: 'shoot',
        cast: volley({ kind: 'pumpkin', speed: 17, dmg: 2, burst: 3, spread: 0.2, gravity: 16, radius: 3.4, color: 0xff7a00, size: 0.22, muzzle: 'both', life: 4 }) },
      { id: 'rush', name: 'Glider Rush', cd: 7, range: 20, anim: 'punch', cast: dash({ dist: 8, dmg: 2, knock: 12, colors: [0xff7a00, 0x2a6a2a] }) },
    ],
  },
  venom: {
    name: 'Venom', skin: 'venom', legsColor: 0x111114, hp: 15, speed: 10, studs: 1600,
    weapons: [],
    melee: { dmg: 3, rate: 0.75, range: 2.7, kind: 'punch', knock: 12 },
    ranged: { kind: 'goo', rate: 1.4, speed: 24, dmg: 1, range: 22, color: 0x1c1c24, size: 0.17, muzzle: 'R' },
    abilities: [
      { id: 'leap', name: 'Symbiote Leap', cd: 6, range: 16, anim: 'cheer', cast: dash({ dist: 7, up: 6, dmg: 2, knock: 12, colors: [0x1c1c24, 0x2a2a36] }) },
      { id: 'roar', name: 'Symbiote Roar', cd: 10, range: 7, anim: 'cheer',
        cast: blast({ radius: 5.2, dmg: 2, color: 0x1c1c24, knock: 16 }) },
    ],
  },
  sandman: {
    name: 'Sandman', skin: 'sandman', hp: 16, speed: 7, studs: 1600,
    weapons: [],
    melee: { dmg: 3, rate: 1.1, range: 2.9, kind: 'punch', knock: 12 },
    ranged: { kind: 'sand', rate: 1.5, speed: 22, dmg: 1, range: 24, color: 0xd9b46a, size: 0.18, muzzle: 'both' },
    abilities: [
      { id: 'storm', name: 'Sandstorm', cd: 10, range: 10, anim: 'cheer',
        cast: blast({ radius: 5, dmg: 2, color: 0xe8c27a, knock: 10 }) },
      { id: 'hammer', name: 'Sand Mallet', cd: 7, range: 4, anim: 'punch',
        cast: blast({ radius: 4, dmg: 3, color: 0xd9b46a, knock: 16 }) },
    ],
  },

  lizard: {
    name: 'The Lizard', skin: 'glb:lizard', hp: 16, speed: 9, studs: 1600,
    weapons: [],
    melee: { dmg: 3, rate: 0.7, range: 2.9, kind: 'claw', knock: 11 },
    ranged: null,
    abilities: [
      { id: 'leap', name: 'Lizard Leap', cd: 6, range: 16, anim: 'punch', cast: dash({ dist: 7, up: 5, dmg: 2, knock: 12, colors: [0x2e8b3a, 0x1f6b35] }) },
      { id: 'ground-crack', name: 'Ground Crack', cd: 9, range: 7, anim: 'slam', cast: blast({ radius: 5, dmg: 3, color: 0x2e8b3a, knock: 15 }) },
    ],
  },

  // ─── Goons and cameos ────────────────────────────────────────────────────
  hydra: {
    name: 'HYDRA Soldier', skin: 'hydrasoldier', hp: 5, speed: 7.5, studs: 300,
    weapons: ['rifle'],
    melee: { dmg: 1, rate: 1.1, range: 2.0, kind: 'punch', knock: 4 },
    ranged: { kind: 'bullet', rate: 1.5, speed: 34, dmg: 1, range: 24, color: 0xffe08a, size: 0.07, muzzle: 'R' },
    abilities: [],
  },
  stanlee: {
    name: 'Stan Lee', skin: 'stanlee', hp: 6, speed: 6.5, studs: 200,
    weapons: [],
    melee: { dmg: 1, rate: 1.2, range: 2.0, kind: 'punch', knock: 4 },
    ranged: null,
    abilities: [
      { id: 'excelsior', name: 'Excelsior!', cd: 15, self: true, anim: 'cheer',
        cast: (a, c) => {
          for (const ally of c.allies) {
            if (!ally.alive) continue;
            ally.hp = Math.min(ally.maxHp, ally.hp + 3);
            ally.buffs.speed = 5;
          }
          c.hearts = Math.min(4, c.hearts + 1);
          c.ui.setHearts(c.hearts, 4);
          c.fx.ring(a.chest(), { n: 40, colors: [0xffd23f, 0xffffff], speed: 7, size: 0.13, life: 0.8 });
          return true;
        } },
    ],
  },
};

/** A real source-kit ability that restores a small amount of health. */
const healSelf = amount => (a, c) => {
  if (a.hp >= a.maxHp) return false;
  a.hp = Math.min(a.maxHp, a.hp + amount);
  c.fx.burst(a.chest(), { n: 18, colors: [0x84ff8a, 0xffffff], speed: 3, up: 2, size: 0.1, life: 0.65 });
  return true;
};

/** A short defensive window for source characters with invisibility/charged-up powers. */
const guardSelf = (seconds, color = 0x9fe4ff) => (a, c) => {
  a.buffs.shield = seconds;
  c.fx.ring(a.chest(), { n: 28, colors: [color, 0xffffff], speed: 6, size: 0.11, life: 0.65 });
  return true;
};

// These match the ability/bolt declarations in the extracted minifig descriptors. Ranged
// characters have a weapon-specific projectile; characters without a bolt stay melee-only.
const EXTRA_KITS = {
  spiderman: {
    hp: 10, speed: 10, swing: true, weapons: ['webshooters'],
    melee: { dmg: 2, rate: 0.65, range: 2.5, kind: 'punch', knock: 8 },
    ranged: { kind: 'web', anim: 'shoot', rate: 1.0, speed: 29, dmg: 1, range: 24, color: 0xeaf7ff, size: 0.11, muzzle: 'both' },
    abilities: [
      { id: 'web-burst', name: 'Web Burst', cd: 7, range: 25, anim: 'shoot', cast: volley({ kind: 'web', speed: 31, dmg: 2, burst: 3, spread: 0.1, color: 0xeaf7ff, size: 0.11, muzzle: 'both' }) },
      { id: 'lunge', name: 'Web Strike', cd: 6, range: 13, anim: 'punch', cast: dash({ dist: 6, dmg: 2, knock: 10, colors: [0xc4161c, 0x2766b0] }) },
    ],
  },
  ironspider: {
    hp: 12, speed: 10, swing: true, weapons: ['webshooters'],
    melee: { dmg: 2, rate: 0.65, range: 2.5, kind: 'punch', knock: 9 },
    ranged: { kind: 'web', anim: 'shoot', rate: 0.9, speed: 30, dmg: 1, range: 26, color: 0xeaf7ff, size: 0.1, muzzle: 'both' },
    abilities: [
      { id: 'waldo-webs', name: 'Waldo Web Barrage', cd: 8, range: 26, anim: 'shoot', cast: volley({ kind: 'web', speed: 30, dmg: 2, burst: 4, spread: 0.22, color: 0xeaf7ff, size: 0.1, muzzle: 'both' }) },
      { id: 'spider-leap', name: 'Spider Leap', cd: 6, range: 14, anim: 'punch', cast: dash({ dist: 7, up: 3, dmg: 2, knock: 11, colors: [0xd9a92e, 0xeaf7ff] }) },
    ],
  },
  superiorspiderman: {
    hp: 11, speed: 10, swing: true, weapons: ['webshooters'],
    melee: { dmg: 2, rate: 0.6, range: 2.5, kind: 'punch', knock: 9 },
    ranged: { kind: 'web', anim: 'shoot', rate: 0.95, speed: 30, dmg: 1, range: 26, color: 0xf1f1f5, size: 0.1, muzzle: 'both' },
    abilities: [
      { id: 'web-barrage', name: 'Web Barrage', cd: 8, range: 26, anim: 'shoot', cast: volley({ kind: 'web', speed: 32, dmg: 2, burst: 4, spread: 0.19, color: 0xf1f1f5, size: 0.1, muzzle: 'both' }) },
      { id: 'backflip', name: 'Lunge Backflip', cd: 6, range: 13, anim: 'punch', cast: dash({ dist: 6, up: 3, dmg: 2, knock: 11, colors: [0x1c1c24, 0xd43838] }) },
    ],
  },
  spiderwoman: {
    hp: 10, speed: 9.5, swing: true, fly: true, hover: 0.7, weapons: ['webshooters'],
    melee: { dmg: 2, rate: 0.7, range: 2.4, kind: 'punch', knock: 8 },
    ranged: { kind: 'stinger', anim: 'shoot', rate: 1.05, speed: 28, dmg: 1, range: 23, color: 0x9fe8ff, size: 0.09, muzzle: 'both' },
    abilities: [
      { id: 'bite', name: 'Spider-Woman Bite', cd: 8, range: 5, anim: 'punch', cast: blast({ radius: 3.2, dmg: 2, color: 0x9fe8ff, knock: 7 }) },
      { id: 'stinger-volley', name: 'Stinger Volley', cd: 7, range: 23, anim: 'shoot', cast: volley({ kind: 'stinger', speed: 30, dmg: 2, burst: 3, spread: 0.14, color: 0x9fe8ff, size: 0.09, muzzle: 'both' }) },
    ],
  },
  blackpanther: {
    hp: 12, speed: 10.5, weapons: ['claws'], melee: { dmg: 3, rate: 0.55, range: 2.7, kind: 'claw', knock: 9 }, ranged: null,
    abilities: [
      { id: 'range-lunge', name: 'Panther Pounce', cd: 6, range: 14, anim: 'punch', cast: dash({ dist: 7, dmg: 3, knock: 12, colors: [0x15151c, 0x7d8a9a] }) },
      { id: 'claw-rush', name: 'Claw Rush', cd: 8, range: 5, anim: 'sword', cast: blast({ radius: 3.5, dmg: 2, color: 0x8793a3, knock: 8 }) },
    ],
  },
  daredevil: {
    hp: 10, speed: 9.5, weapons: ['batons'], melee: { dmg: 2, rate: 0.58, range: 2.5, kind: 'sword', knock: 7 },
    ranged: { kind: 'baton', anim: 'throw', boomerang: true, rate: 1.8, speed: 25, dmg: 1, range: 21, color: 0xc4161c, size: 0.1, muzzle: 'R' },
    abilities: [
      { id: 'radar', name: 'Radar Sense', cd: 9, range: 8, anim: 'cheer', cast: blast({ radius: 5.5, dmg: 1, color: 0xff3a4a, knock: 6 }) },
      { id: 'baton-throw', name: 'Baton Boomerang', cd: 7, range: 23, anim: 'throw', cast: volley({ kind: 'baton', boomerang: true, speed: 28, dmg: 2, burst: 2, spread: 0.12, color: 0xc4161c, size: 0.1 }) },
    ],
  },
  doctorstrange: {
    hp: 11, speed: 8.5, fly: true, hover: 1.0, weapons: [],
    melee: { dmg: 2, rate: 0.8, range: 2.4, kind: 'staff', knock: 7 },
    ranged: { kind: 'shard', anim: 'cast', rate: 1.1, speed: 26, dmg: 1, range: 26, color: 0x68d8ff, size: 0.16, muzzle: 'R' },
    abilities: [
      { id: 'laser-vision', name: 'Mystic Beam', cd: 8, range: 28, anim: 'cast', cast: ray({ color: 0x68d8ff, width: 0.65, dmg: 3, knock: 8 }) },
      { id: 'telekinesis', name: 'Telekinesis', cd: 10, range: 9, anim: 'cast', cast: blast({ radius: 5.5, dmg: 2, color: 0xb24bff, knock: 12 }) },
      { id: 'mystic-step', name: 'Mystic Step', cd: 7, range: 15, anim: 'cast', cast: dash({ dist: 8, dmg: 1, knock: 6, colors: [0x68d8ff, 0xb24bff] }) },
    ],
  },
  ghostrider: {
    hp: 13, speed: 9.5, weapons: ['chain'], melee: { dmg: 3, rate: 0.72, range: 3.0, kind: 'chain', knock: 10 },
    ranged: { kind: 'fire', anim: 'cast', rate: 1.35, speed: 24, dmg: 1, range: 25, color: 0xff5a1a, size: 0.16, muzzle: 'head' },
    abilities: [
      { id: 'hellfire', name: 'Hellfire Blast', cd: 8, range: 24, anim: 'cast', cast: volley({ kind: 'fire', speed: 27, dmg: 2, burst: 3, spread: 0.18, color: 0xff5a1a, size: 0.18, muzzle: 'head' }) },
      { id: 'penance', name: 'Penance Stare', cd: 10, range: 20, anim: 'cast', cast: ray({ color: 0xff9a28, width: 0.55, dmg: 3, knock: 8 }) },
    ],
  },
  punisher: {
    hp: 11, speed: 8.5, weapons: ['rifle'], melee: { dmg: 2, rate: 0.9, range: 2.2, kind: 'punch', knock: 6 },
    ranged: { kind: 'bullet', anim: 'shoot', rate: 0.48, speed: 42, dmg: 1, range: 30, color: 0xd9dde3, size: 0.07, muzzle: 'R' },
    abilities: [
      { id: 'rifle-burst', name: 'Rifle Burst', cd: 6, range: 30, anim: 'shoot', cast: volley({ kind: 'bullet', speed: 44, dmg: 2, burst: 5, spread: 0.12, color: 0xd9dde3, size: 0.07, muzzle: 'R' }) },
      { id: 'frag', name: 'Frag Grenade', cd: 10, range: 25, anim: 'throw', cast: volley({ kind: 'grenade', speed: 18, gravity: 16, radius: 3.5, life: 4, dmg: 2, color: 0x71804a, size: 0.15 }) },
    ],
  },
  blade: {
    hp: 12, speed: 9, weapons: ['sword'], melee: { dmg: 3, rate: 0.62, range: 2.6, kind: 'sword', knock: 9 },
    ranged: { kind: 'knife', anim: 'throw', boomerang: true, rate: 1.8, speed: 27, dmg: 1, range: 22, color: 0xdce4ee, size: 0.08, muzzle: 'R' },
    abilities: [
      { id: 'sword-boomerang', name: 'Sword Boomerang', cd: 8, range: 24, anim: 'throw', cast: volley({ kind: 'knife', boomerang: true, speed: 29, dmg: 2, color: 0xdce4ee, size: 0.09 }) },
      { id: 'regen', name: 'Regeneration', cd: 14, self: true, anim: 'cast', cast: healSelf(3) },
    ],
  },
  electro: {
    hp: 11, speed: 9.5, fly: true, hover: 0.8, weapons: ['shockGauntlets'],
    melee: { dmg: 2, rate: 0.8, range: 2.4, kind: 'punch', knock: 7 },
    ranged: { kind: 'lightning', anim: 'cast', rate: 1.0, speed: 27, dmg: 1, range: 27, color: 0x9ff7ff, size: 0.12, muzzle: 'both' },
    abilities: [
      { id: 'electro-laser', name: 'Electro Laser', cd: 8, range: 28, anim: 'cast', cast: ray({ color: 0x9ff7ff, width: 0.62, dmg: 3, knock: 9 }) },
      { id: 'charged-up', name: 'Electro-Charged Up', cd: 11, range: 9, anim: 'cheer', cast: blast({ radius: 5.5, dmg: 2, color: 0x9ff7ff, knock: 12 }) },
    ],
  },
  carnage: {
    hp: 13, speed: 10, swing: true, weapons: ['claws'], melee: { dmg: 3, rate: 0.58, range: 2.8, kind: 'claw', knock: 10 },
    ranged: { kind: 'tendril', anim: 'shoot', rate: 1.15, speed: 25, dmg: 1, range: 23, color: 0xc41635, size: 0.13, muzzle: 'both' },
    abilities: [
      { id: 'tendril-burst', name: 'Carnage Tendrils', cd: 8, range: 24, anim: 'shoot', cast: volley({ kind: 'tendril', speed: 28, dmg: 2, burst: 4, spread: 0.22, color: 0xc41635, size: 0.14, muzzle: 'both' }) },
      { id: 'symbiote-slam', name: 'Symbiote Slam', cd: 9, range: 6, anim: 'slam', cast: blast({ radius: 4.5, dmg: 3, color: 0xc41635, knock: 12 }) },
    ],
  },
  doctoroctopus: {
    hp: 14, speed: 8.5, weapons: [], melee: { dmg: 3, rate: 0.78, range: 3.5, kind: 'claw', knock: 10 }, ranged: null,
    abilities: [
      { id: 'crack-attack', name: 'Tentacle Crack Attack', cd: 8, range: 7, anim: 'slam', cast: blast({ radius: 4.2, dmg: 2, color: 0x9aa0a8, knock: 10 }) },
      { id: 'lunge-shockwave', name: 'Tentacle Shockwave', cd: 10, range: 12, anim: 'slam', cast: blast({ radius: 5.6, dmg: 3, color: 0x6b737a, knock: 15 }) },
    ],
  },
  vulture: {
    hp: 10, speed: 10, fly: true, hover: 1.0, weapons: [],
    melee: { dmg: 2, rate: 0.8, range: 2.7, kind: 'punch', knock: 8 },
    ranged: { kind: 'feather', anim: 'shoot', rate: 1.3, speed: 30, dmg: 1, range: 27, color: 0xc4c8ce, size: 0.1, muzzle: 'both' },
    abilities: [
      { id: 'feather-volley', name: 'Feather Blades', cd: 8, range: 27, anim: 'shoot', cast: volley({ kind: 'feather', speed: 32, dmg: 2, burst: 5, spread: 0.2, color: 0xc4c8ce, size: 0.1, muzzle: 'both' }) },
      { id: 'dive', name: 'Vulture Dive', cd: 7, range: 18, anim: 'dive', cast: dash({ dist: 8, up: 2, dmg: 2, knock: 11, colors: [0xc4c8ce, 0x5b626a] }) },
    ],
  },
  mysterio: {
    hp: 11, speed: 8.5, fly: true, hover: 1.0, weapons: [],
    melee: { dmg: 2, rate: 0.9, range: 2.3, kind: 'punch', knock: 6 },
    ranged: { kind: 'illusion', anim: 'cast', rate: 1.25, speed: 24, dmg: 1, range: 24, color: 0x7affb0, size: 0.15, muzzle: 'R' },
    abilities: [
      { id: 'laser-vision', name: 'Mysterio Illusion Beam', cd: 8, range: 25, anim: 'cast', cast: ray({ color: 0x7affb0, width: 0.55, dmg: 2, knock: 8 }) },
      { id: 'vanish', name: 'Vanish', cd: 10, self: true, anim: 'cast', cast: guardSelf(2.5, 0x7affb0) },
      { id: 'mind-control', name: 'Mind-Control Pulse', cd: 11, range: 9, anim: 'cast', cast: blast({ radius: 5, dmg: 2, color: 0x42e8a0, knock: 10 }) },
    ],
  },
  kraventhehunter: {
    hp: 12, speed: 9, weapons: ['spear'], melee: { dmg: 3, rate: 0.72, range: 2.8, kind: 'spear', knock: 9 },
    ranged: { kind: 'spear', anim: 'throw', rate: 1.5, speed: 31, dmg: 1, range: 25, color: 0x8a6844, size: 0.1, muzzle: 'R' },
    abilities: [
      { id: 'hunter-spear', name: 'Hunter Spear', cd: 7, range: 25, anim: 'throw', cast: volley({ kind: 'spear', speed: 34, dmg: 3, color: 0x8a6844, size: 0.11 }) },
      { id: 'pounce', name: 'Hunter Pounce', cd: 7, range: 14, anim: 'punch', cast: dash({ dist: 7, dmg: 2, knock: 11, colors: [0x8a6844, 0xc9a02a] }) },
    ],
  },
  shocker: {
    hp: 11, speed: 8.8, weapons: ['shockGauntlets'], melee: { dmg: 2, rate: 0.85, range: 2.5, kind: 'punch', knock: 8 },
    ranged: { kind: 'sonic', anim: 'cast', rate: 1.25, speed: 23, dmg: 1, range: 24, color: 0xffe95c, size: 0.16, muzzle: 'both' },
    abilities: [
      { id: 'shocker-blast', name: 'Shocker Blast', cd: 8, range: 10, anim: 'cast', cast: blast({ radius: 5.5, dmg: 2, color: 0xffe95c, knock: 13 }) },
      { id: 'shockwave', name: 'Sonic Shockwave', cd: 10, range: 22, anim: 'cast', cast: ray({ color: 0xffe95c, width: 0.8, dmg: 2, knock: 10 }) },
    ],
  },
  beetle: {
    hp: 11, speed: 9, fly: true, hover: 1.0, weapons: ['missilePack'],
    melee: { dmg: 2, rate: 0.8, range: 2.5, kind: 'punch', knock: 7 },
    ranged: { kind: 'missile', anim: 'shoot', rate: 1.8, speed: 24, dmg: 1, range: 27, color: 0x72f0a4, size: 0.12, radius: 2.2, muzzle: 'both' },
    abilities: [
      { id: 'sticky-bombs', name: 'Sticky Bombs', cd: 9, range: 25, anim: 'throw', cast: volley({ kind: 'grenade', speed: 18, dmg: 2, burst: 3, spread: 0.18, gravity: 12, radius: 3, color: 0x72f0a4, size: 0.16, life: 4 }) },
      { id: 'beetle-lunge', name: 'Beetle Lunge', cd: 7, range: 18, anim: 'punch', cast: dash({ dist: 8, up: 2, dmg: 2, knock: 10, colors: [0x72f0a4, 0x28784b] }) },
    ],
  },
  bullseye: {
    hp: 10, speed: 9.5, weapons: ['knives'], melee: { dmg: 2, rate: 0.72, range: 2.4, kind: 'punch', knock: 6 },
    ranged: { kind: 'knife', anim: 'throw', rate: 1.15, speed: 34, dmg: 1, range: 30, color: 0xd0d0d0, size: 0.075, muzzle: 'R' },
    abilities: [
      { id: 'cluster-card', name: 'Bullseye Cluster', cd: 8, range: 30, anim: 'throw', cast: volley({ kind: 'knife', speed: 36, dmg: 2, burst: 5, spread: 0.18, color: 0xd0d0d0, size: 0.075, muzzle: 'R' }) },
      { id: 'deadeye', name: 'Deadeye', cd: 7, range: 30, anim: 'throw', cast: ray({ color: 0xffffff, width: 0.12, dmg: 3, knock: 4 }) },
    ],
  },
  elektra: {
    hp: 10, speed: 10, weapons: ['dualBlades'], melee: { dmg: 3, rate: 0.52, range: 2.6, kind: 'sword', knock: 8 },
    ranged: { kind: 'knife', anim: 'throw', boomerang: true, rate: 1.7, speed: 28, dmg: 1, range: 21, color: 0xc4161c, size: 0.08 },
    abilities: [
      { id: 'sai-throw', name: 'Elektra Sai Boomerang', cd: 7, range: 23, anim: 'throw', cast: volley({ kind: 'knife', boomerang: true, speed: 31, dmg: 2, burst: 2, spread: 0.08, color: 0xc4161c, size: 0.08 }) },
      { id: 'backflip', name: 'Lunge Backflip', cd: 6, range: 14, anim: 'punch', cast: dash({ dist: 7, up: 3, dmg: 2, knock: 9, colors: [0xc4161c, 0x24242a] }) },
    ],
  },
  moonknight: {
    hp: 11, speed: 9.5, weapons: ['crescentDarts'], melee: { dmg: 2, rate: 0.78, range: 2.4, kind: 'punch', knock: 7 },
    ranged: { kind: 'crescent', anim: 'throw', boomerang: true, rate: 1.25, speed: 28, dmg: 1, range: 24, color: 0xe6e8f0, size: 0.14, muzzle: 'both' },
    abilities: [
      { id: 'crescent-volley', name: 'Moon Dart Volley', cd: 8, range: 25, anim: 'throw', cast: volley({ kind: 'crescent', boomerang: true, speed: 30, dmg: 2, burst: 3, spread: 0.16, color: 0xe6e8f0, size: 0.14, muzzle: 'both' }) },
      { id: 'moon-strike', name: 'Moon Strike', cd: 7, range: 13, anim: 'punch', cast: dash({ dist: 6, dmg: 2, knock: 10, colors: [0xe6e8f0, 0x9ba5b2] }) },
    ],
  },
  nickfury: {
    hp: 12, speed: 8.5, weapons: ['rifle'], melee: { dmg: 2, rate: 0.9, range: 2.2, kind: 'punch', knock: 6 },
    ranged: { kind: 'bullet', anim: 'shoot', rate: 0.55, speed: 40, dmg: 1, range: 29, color: 0xd4d7df, size: 0.07, muzzle: 'R' },
    abilities: [
      { id: 'fury-burst', name: 'Tactical Burst', cd: 7, range: 29, anim: 'shoot', cast: volley({ kind: 'bullet', speed: 42, dmg: 2, burst: 5, spread: 0.13, color: 0xd4d7df, size: 0.07, muzzle: 'R' }) },
      { id: 'vanish', name: 'Tactical Cloak', cd: 10, self: true, anim: 'cast', cast: guardSelf(2.5, 0x6977a0) },
    ],
  },
  starlord: {
    hp: 10, speed: 9, fly: true, hover: 0.8, weapons: ['pistols'], melee: { dmg: 2, rate: 0.8, range: 2.3, kind: 'punch', knock: 6 },
    ranged: { kind: 'bullet', anim: 'shoot', rate: 0.48, speed: 38, dmg: 1, range: 27, color: 0xff6a3a, size: 0.08, muzzle: 'both' },
    abilities: [
      { id: 'dual-blasters', name: 'Dual Blaster Volley', cd: 7, range: 28, anim: 'shoot', cast: volley({ kind: 'bullet', speed: 40, dmg: 2, burst: 6, spread: 0.21, color: 0xff6a3a, size: 0.08, muzzle: 'both' }) },
      { id: 'jet-dash', name: 'Jet Dash', cd: 7, range: 16, anim: 'punch', cast: dash({ dist: 7, up: 3, dmg: 2, knock: 8, colors: [0xff6a3a, 0xffd36a] }) },
    ],
  },
  gamora: {
    hp: 12, speed: 9.5, weapons: ['sword'], melee: { dmg: 3, rate: 0.58, range: 2.7, kind: 'sword', knock: 9 },
    ranged: { kind: 'knife', anim: 'throw', boomerang: true, rate: 1.8, speed: 28, dmg: 1, range: 22, color: 0x77bb52, size: 0.08 },
    abilities: [
      { id: 'sword-boomerang', name: 'Godslayer Throw', cd: 8, range: 23, anim: 'throw', cast: volley({ kind: 'knife', boomerang: true, speed: 31, dmg: 2, color: 0x77bb52, size: 0.09 }) },
      { id: 'blade-rush', name: 'Blade Rush', cd: 7, range: 14, anim: 'sword', cast: dash({ dist: 7, dmg: 3, knock: 10, colors: [0x77bb52, 0xe1f5cd] }) },
    ],
  },
  drax: {
    hp: 14, speed: 9, weapons: ['dualBlades'], melee: { dmg: 3, rate: 0.62, range: 2.6, kind: 'sword', knock: 10 },
    ranged: { kind: 'knife', anim: 'throw', boomerang: true, rate: 1.7, speed: 29, dmg: 1, range: 22, color: 0x9fa5aa, size: 0.08 },
    abilities: [
      { id: 'sai-boomerang', name: 'Drax Sai Boomerang', cd: 8, range: 23, anim: 'throw', cast: volley({ kind: 'knife', boomerang: true, speed: 31, dmg: 2, burst: 2, spread: 0.1, color: 0x9fa5aa, size: 0.08 }) },
      { id: 'regen', name: 'Warrior Resilience', cd: 14, self: true, anim: 'cast', cast: healSelf(3) },
    ],
  },
  rocketraccoon: {
    hp: 9, speed: 9.5, weapons: ['rifle'], melee: { dmg: 2, rate: 0.85, range: 2.1, kind: 'punch', knock: 5 },
    ranged: { kind: 'bullet', anim: 'shoot', rate: 0.42, speed: 42, dmg: 1, range: 29, color: 0xff9a2a, size: 0.07, muzzle: 'R' },
    abilities: [
      { id: 'rocket-salvo', name: 'Rocket Salvo', cd: 9, range: 28, anim: 'shoot', cast: volley({ kind: 'missile', speed: 25, dmg: 2, burst: 4, spread: 0.19, radius: 2.5, color: 0xff9a2a, size: 0.11, life: 4, muzzle: 'R' }) },
      { id: 'gun-burst', name: 'Blaster Burst', cd: 6, range: 29, anim: 'shoot', cast: volley({ kind: 'bullet', speed: 44, dmg: 2, burst: 5, spread: 0.15, color: 0xff9a2a, size: 0.07, muzzle: 'R' }) },
    ],
  },
  falcon: {
    hp: 11, speed: 9.5, fly: true, hover: 1.0, weapons: [], melee: { dmg: 2, rate: 0.8, range: 2.5, kind: 'punch', knock: 8 },
    ranged: { kind: 'feather', anim: 'shoot', rate: 1.2, speed: 31, dmg: 1, range: 27, color: 0xd2d9df, size: 0.09, muzzle: 'both' },
    abilities: [
      { id: 'wing-volley', name: 'Wing Bolt Volley', cd: 8, range: 27, anim: 'shoot', cast: volley({ kind: 'feather', speed: 33, dmg: 2, burst: 5, spread: 0.18, color: 0xd2d9df, size: 0.09, muzzle: 'both' }) },
      { id: 'wing-dive', name: 'Falcon Dive', cd: 7, range: 17, anim: 'dive', cast: dash({ dist: 8, up: 2, dmg: 2, knock: 10, colors: [0xd2d9df, 0x708090] }) },
    ],
  },
  wintersoldier: {
    hp: 12, speed: 9, weapons: ['rifle'], melee: { dmg: 3, rate: 0.68, range: 2.4, kind: 'punch', knock: 9 },
    ranged: { kind: 'bullet', anim: 'shoot', rate: 0.5, speed: 42, dmg: 1, range: 29, color: 0xd7d9df, size: 0.07, muzzle: 'R' },
    abilities: [
      { id: 'tactical-burst', name: 'Tactical Burst', cd: 7, range: 29, anim: 'shoot', cast: volley({ kind: 'bullet', speed: 44, dmg: 2, burst: 5, spread: 0.12, color: 0xd7d9df, size: 0.07, muzzle: 'R' }) },
      { id: 'grenade', name: 'Grenade', cd: 10, range: 24, anim: 'throw', cast: volley({ kind: 'grenade', speed: 18, gravity: 16, radius: 3.2, life: 4, dmg: 2, color: 0x4c5963, size: 0.15 }) },
    ],
  },
  antman: {
    hp: 10, speed: 9.5, weapons: [], melee: { dmg: 2, rate: 0.72, range: 2.4, kind: 'punch', knock: 7 },
    ranged: { kind: 'grenade', anim: 'throw', rate: 1.8, speed: 21, dmg: 1, range: 22, color: 0xc4161c, size: 0.12, gravity: 12, radius: 2.7 },
    abilities: [
      { id: 'ant-bomb', name: 'Ant Bomb', cd: 9, range: 23, anim: 'throw', cast: volley({ kind: 'grenade', speed: 22, dmg: 2, gravity: 12, radius: 3.3, color: 0xc4161c, size: 0.13, life: 4 }) },
      { id: 'giant-step', name: 'Giant Step', cd: 7, range: 8, anim: 'slam', cast: blast({ radius: 4.3, dmg: 2, color: 0xc4161c, knock: 10 }) },
    ],
  },
  wasp: {
    hp: 9, speed: 10, fly: true, hover: 0.85, weapons: ['webshooters'], melee: { dmg: 2, rate: 0.8, range: 2.2, kind: 'punch', knock: 6 },
    ranged: { kind: 'stinger', anim: 'shoot', rate: 0.82, speed: 30, dmg: 1, range: 26, color: 0xfff07a, size: 0.075, muzzle: 'both' },
    abilities: [
      { id: 'stinger-volley', name: 'Wasp Stingers', cd: 7, range: 26, anim: 'shoot', cast: volley({ kind: 'stinger', speed: 32, dmg: 2, burst: 4, spread: 0.16, color: 0xfff07a, size: 0.075, muzzle: 'both' }) },
      { id: 'wasp-dive', name: 'Wasp Dive', cd: 7, range: 14, anim: 'dive', cast: dash({ dist: 7, up: 2, dmg: 2, knock: 9, colors: [0xfff07a, 0x9aa0a8] }) },
    ],
  },
  squirrelgirl: {
    hp: 11, speed: 9, fly: true, hover: 0.6, weapons: [], melee: { dmg: 2, rate: 0.68, range: 2.5, kind: 'punch', knock: 8 },
    ranged: { kind: 'nut', anim: 'throw', rate: 1.2, speed: 25, dmg: 1, range: 23, color: 0x9a6434, size: 0.12, muzzle: 'R' },
    abilities: [
      { id: 'squirrel-bomb', name: 'Squirrel Bomb', cd: 9, range: 22, anim: 'throw', cast: volley({ kind: 'nut', speed: 26, dmg: 2, burst: 3, spread: 0.2, color: 0x9a6434, size: 0.13, radius: 2.6 }) },
      { id: 'squirrel-swarm', name: 'Squirrel Swarm', cd: 10, range: 9, anim: 'cheer', cast: blast({ radius: 5.2, dmg: 2, color: 0xa77a42, knock: 9 }) },
    ],
  },
  howardtheduck: {
    hp: 8, speed: 8, weapons: ['pistols'], melee: { dmg: 1, rate: 1, range: 2, kind: 'punch', knock: 4 },
    ranged: { kind: 'bullet', anim: 'shoot', rate: 0.5, speed: 39, dmg: 1, range: 25, color: 0xffd36a, size: 0.07, muzzle: 'R' },
    abilities: [{ id: 'duck-burst', name: 'Blaster Burst', cd: 7, range: 25, anim: 'shoot', cast: volley({ kind: 'bullet', speed: 41, dmg: 2, burst: 5, spread: 0.2, color: 0xffd36a, size: 0.07, muzzle: 'R' }) }],
  },
  redskull: {
    hp: 11, speed: 8.5, weapons: ['rifle'], melee: { dmg: 2, rate: 0.85, range: 2.2, kind: 'punch', knock: 6 },
    ranged: { kind: 'bullet', anim: 'shoot', rate: 0.65, speed: 38, dmg: 1, range: 27, color: 0xd63c32, size: 0.075, muzzle: 'R' },
    abilities: [
      { id: 'hydra-burst', name: 'HYDRA Burst', cd: 7, range: 27, anim: 'shoot', cast: volley({ kind: 'bullet', speed: 40, dmg: 2, burst: 5, spread: 0.15, color: 0xd63c32, size: 0.075, muzzle: 'R' }) },
      { id: 'grenade', name: 'Grenade', cd: 10, range: 23, anim: 'throw', cast: volley({ kind: 'grenade', speed: 17, gravity: 15, radius: 3.2, life: 4, dmg: 2, color: 0x643e3a, size: 0.15 }) },
    ],
  },
  doctordoom: {
    hp: 14, speed: 8.5, weapons: [], melee: { dmg: 2, rate: 0.85, range: 2.5, kind: 'punch', knock: 7 },
    ranged: { kind: 'shard', anim: 'cast', rate: 1.0, speed: 28, dmg: 1, range: 28, color: 0x7aff6a, size: 0.16, muzzle: 'both' },
    abilities: [
      { id: 'doom-beam', name: 'Doctor Doom Laser', cd: 8, range: 28, anim: 'cast', cast: ray({ color: 0x7aff6a, width: 0.7, dmg: 3, knock: 10 }) },
      { id: 'charged-up', name: 'Doom Charged Up', cd: 10, range: 9, anim: 'cheer', cast: blast({ radius: 5.3, dmg: 2, color: 0x7aff6a, knock: 12 }) },
      { id: 'armor', name: 'Doom Armor', cd: 14, self: true, anim: 'cast', cast: guardSelf(4, 0x7aff6a) },
    ],
  },
  modok: {
    hp: 13, speed: 8, fly: true, hover: 1.15, weapons: [], melee: { dmg: 2, rate: 1, range: 2.3, kind: 'punch', knock: 6 },
    ranged: { kind: 'illusion', anim: 'cast', rate: 1.1, speed: 26, dmg: 1, range: 26, color: 0xffd23a, size: 0.16, muzzle: 'head' },
    abilities: [
      { id: 'laser-vision', name: 'M.O.D.O.K. Laser Vision', cd: 8, range: 28, anim: 'cast', cast: ray({ color: 0xffd23a, width: 0.65, dmg: 3, knock: 8 }) },
      { id: 'chest-blast', name: 'Chest Blast', cd: 9, range: 10, anim: 'cast', cast: blast({ radius: 5.5, dmg: 2, color: 0xffd23a, knock: 13 }) },
    ],
  },
  blackcat: {
    hp: 10, speed: 10, swing: true, weapons: ['claws'], melee: { dmg: 2, rate: 0.56, range: 2.5, kind: 'claw', knock: 7 }, ranged: null,
    abilities: [
      { id: 'cat-pounce', name: 'Cat Pounce', cd: 6, range: 13, anim: 'punch', cast: dash({ dist: 6, dmg: 2, knock: 9, colors: [0xe8e8ee, 0x24242a] }) },
      { id: 'vanish', name: 'Black Cat Vanish', cd: 10, self: true, anim: 'cast', cast: guardSelf(2, 0xe8e8ee) },
    ],
  },
  lukecage: {
    hp: 16, speed: 7.8, weapons: [], melee: { dmg: 3, rate: 0.78, range: 2.8, kind: 'punch', knock: 12 }, ranged: null,
    abilities: [
      { id: 'power-punch', name: 'Power Punch', cd: 7, range: 4, anim: 'punch', cast: blast({ radius: 3.5, dmg: 3, color: 0xd9a92e, knock: 12 }) },
      { id: 'iron-skin', name: 'Iron Skin', cd: 12, self: true, anim: 'cheer', cast: guardSelf(4, 0xd9a92e) },
    ],
  },
  ironfist: {
    hp: 11, speed: 9.5, weapons: [], melee: { dmg: 3, rate: 0.58, range: 2.5, kind: 'punch', knock: 9 },
    ranged: { kind: 'chi', anim: 'cast', rate: 1.25, speed: 25, dmg: 1, range: 23, color: 0x73ff8d, size: 0.12, muzzle: 'both' },
    abilities: [
      { id: 'chest-blast', name: 'Iron Fist Chi Blast', cd: 8, range: 23, anim: 'cast', cast: volley({ kind: 'chi', speed: 27, dmg: 3, color: 0x73ff8d, size: 0.14, muzzle: 'both' }) },
      { id: 'dragon-punch', name: 'Dragon Punch', cd: 7, range: 12, anim: 'punch', cast: dash({ dist: 6, dmg: 3, knock: 12, colors: [0x73ff8d, 0xd7ffe1] }) },
    ],
  },
  chameleon: {
    hp: 9, speed: 8.5, weapons: [], melee: { dmg: 1, rate: 0.9, range: 2.2, kind: 'punch', knock: 5 }, ranged: null, abilities: [],
  },
  jameson: {
    hp: 8, speed: 7.5, weapons: [], melee: { dmg: 1, rate: 1, range: 2.1, kind: 'punch', knock: 4 },
    ranged: { kind: 'paper', anim: 'throw', rate: 1.8, speed: 20, dmg: 1, range: 18, color: 0xe8e8de, size: 0.14, muzzle: 'R' },
    abilities: [{ id: 'newspaper-barrage', name: 'Newspaper Barrage', cd: 9, range: 19, anim: 'throw', cast: volley({ kind: 'paper', speed: 22, dmg: 2, burst: 5, spread: 0.24, color: 0xe8e8de, size: 0.14 }) }],
  },
  peterparker: {
    hp: 10, speed: 9, swing: true, weapons: ['webshooters'], melee: { dmg: 2, rate: 0.68, range: 2.4, kind: 'punch', knock: 7 },
    ranged: { kind: 'web', anim: 'shoot', rate: 1.1, speed: 28, dmg: 1, range: 23, color: 0xeaf7ff, size: 0.1, muzzle: 'both' },
    abilities: [{ id: 'transform-webs', name: 'Spider-Man Web Shot', cd: 7, range: 24, anim: 'shoot', cast: volley({ kind: 'web', speed: 30, dmg: 2, burst: 3, spread: 0.12, color: 0xeaf7ff, size: 0.1, muzzle: 'both' }) }],
  },
};

// Admin roster order and labels. Color no longer chooses a generic ranged attack.
const EXTRA_SUMMONS = [
  ['spiderman', 'Spider-Man'], ['ironspider', 'Iron Spider'], ['superiorspiderman', 'Superior Spider-Man'], ['spiderwoman', 'Spider-Woman'],
  ['blackpanther', 'Black Panther'], ['daredevil', 'Daredevil'], ['doctorstrange', 'Doctor Strange'], ['ghostrider', 'Ghost Rider'],
  ['punisher', 'Punisher'], ['blade', 'Blade'], ['electro', 'Electro'], ['carnage', 'Carnage'], ['doctoroctopus', 'Doctor Octopus'],
  ['vulture', 'Vulture'], ['mysterio', 'Mysterio'], ['kraventhehunter', 'Kraven the Hunter'], ['shocker', 'Shocker'], ['beetle', 'Beetle'],
  ['bullseye', 'Bullseye'], ['elektra', 'Elektra'], ['moonknight', 'Moon Knight'], ['nickfury', 'Nick Fury'], ['starlord', 'Star-Lord'],
  ['gamora', 'Gamora'], ['drax', 'Drax'], ['rocketraccoon', 'Rocket Raccoon'], ['falcon', 'Falcon'], ['wintersoldier', 'Winter Soldier'],
  ['antman', 'Ant-Man'], ['wasp', 'Wasp'], ['squirrelgirl', 'Squirrel Girl'], ['howardtheduck', 'Howard the Duck'], ['redskull', 'Red Skull'],
  ['doctordoom', 'Doctor Doom'], ['modok', 'M.O.D.O.K.'], ['blackcat', 'Black Cat'], ['lukecage', 'Luke Cage'], ['ironfist', 'Iron Fist'],
  ['chameleon', 'Chameleon'], ['jameson', 'J. Jonah Jameson'], ['peterparker', 'Peter Parker'], ['gwenstacy', 'Gwen Stacy'],
  ['maryjanewatson', 'Mary Jane'], ['auntmay', 'Aunt May'],
];
for (const [key, name] of EXTRA_SUMMONS) {
  if (KITS[key]) continue;
  const kit = EXTRA_KITS[key] ?? {
    hp: 8, speed: 7.5, weapons: [], melee: { dmg: 1, rate: 1, range: 2, kind: 'punch', knock: 4 },
    ranged: null, abilities: [],
  };
  KITS[key] = { name, skin: `glb:${key}`, studs: 700, ...kit };
}

/** Resolve a kit from a summon-menu key or a skin filename. */

export const kitOf = (key) => KITS[key] ?? null;
export const kitForSkin = (skin) => Object.values(KITS).find(k => k.skin === skin) ?? null;
