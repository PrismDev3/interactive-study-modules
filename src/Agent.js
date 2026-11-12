/**
 * Agent.js — a summoned character that actually fights.
 *
 * One class runs every non-player character: allies (FRIEND in the summon menu) and hero
 * foes (FIGHT). It owns the kit from Kits.js, so an ally Iron Man hovers, fires repulsor
 * blasts, unibeams and micro-missiles; an ally Deadpool closes to katana range, backs off
 * to shoot his pistols and throws grenades. No generic punch fallback.
 *
 * Movement, targeting, team filtering and damage all go through Combat, so summoned
 * characters fight the same enemies, take the same damage and break apart the same way.
 */
import * as THREE from 'three';
import { disposeRigRoot } from './GlbMinifig.js?v=147';
import { LegoSpidey } from './LegoSpidey.js?v=183';
import { KITS } from './Kits.js?v=64';
import { attachKit, animateKit } from './CharacterGear.js?v=64';

const _v = new THREE.Vector3();
const _away = new THREE.Vector3();

export class Agent {
  /**
   * @param {{scene:THREE.Scene, combat:any, key:string, team:'ally'|'enemy', pos:THREE.Vector3, slot?:number}} o
   */
  constructor({ scene, combat, key, team = 'ally', pos, slot = 0 }) {
    this.scene = scene;
    this.combat = combat;
    this.key = key;
    this.kit = KITS[key] ?? KITS.hydra;
    this.team = team;
    this.slot = slot;
    this.isAgent = true;
    this.ai = this;      // Combat.update hands agents their own tick instead of boss AI
    this.skin = this.kit.skin;
    this.scale = 1;
    this.root = new THREE.Group();
    this.root.position.copy(pos);
    this.vel = new THREE.Vector3();
    this.hp = this.maxHp = this.kit.hp ?? 8;
    this.alive = true;
    this.t = 0;
    this.age = 0;
    this.attackT = 0;
    this.attack = 0;
    this.hurt = 0;
    this.windup = 0;
    this.swoop = 1;              // Combat's flying-target guard skips agents; kept harmless
    this.cooldown = 0.5 + Math.random() * 0.7;
    this.abilityCd = {};
    this.buffs = { dmg: 1, speed: 0, shield: 0, rage: 0 };
    this.groundY = pos.y - 0.5;
    this.groundT = 0;
    this.target = null;
    this.retarget = Math.random() * 0.3;
    this.flying = false;
    this.speed = 0;
    this.attackSide = -1;
    this.attackKind = 'punch';
    this.swinging = false;
    this.swingT = 0;
    this.swingCooldown = 0;
    this.webArm = -1;
    this.swingAnchor = null;
    this.swingLength = 0;
    this.webLine = null;
    if (this.kit.swing) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      this.webLine = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xeaf7ff, transparent: true, opacity: 0.9 }));
      this.webLine.frustumCulled = false;
      this.webLine.visible = false;
      this.scene.add(this.webLine);
    }
    this.faceYaw = 0;
    // Shape Combat/Admin/netcode expect from an enemy entry
    this.T = { name: this.kit.name, skin: this.kit.skin, studs: this.kit.studs ?? 600 };
    this.scene.add(this.root);
  }

  async load() {
    const rig = await new LegoSpidey({ skin: this.kit.skin, legsColor: this.kit.legsColor }).load();
    this.rig = rig;
    this.root.add(rig.root);
    this.refs = attachKit(rig, this.kit);
    return this;
  }

  // ─── Queries ─────────────────────────────────────────────────────────────
  chest() {
    return this.root.position.clone().setY(this.root.position.y + 1.05);
  }

  faceDir() {
    return _v.set(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y)).clone();
  }

  get damageMul() {
    return (this.buffs.rage > 0 ? 1.9 : 1) * (this.team === 'ally' ? 1 : 1.15);
  }

  spark(color = 0xffffff) {
    this.combat.fx.burst(this.chest(), { n: 20, colors: [color, 0xffffff], speed: 4, up: 2, size: 0.12, life: 0.6 });
  }

  // ─── Damage & death ──────────────────────────────────────────────────────
  damage(dmg, from, _knock = 5) {
    if (!this.alive) return false;
    if (this.buffs.shield > 0) {
      this.rig?.flash(0.6);
      this.combat._sparks(this.chest(), 0x9fd8ff);
      this.combat.sfx?.play('block');
      return false;
    }
    this.hp -= Math.max(1, Math.round(dmg));
    this.hurt = 0.35;
    this.attackT = 0;
    this.rig?.flash(0.9);
    if (from) {
      _away.subVectors(this.root.position, from).setY(0);
      if (_away.lengthSq() > 1e-4) _away.normalize();
      this.vel.x += _away.x * 4;
      this.vel.z += _away.z * 4;
      if (!this.kit.fly) this.vel.y = Math.max(this.vel.y, 2.6);
    }
    this.combat._sparks(this.chest(), 0xffffff);
    this.combat.sfx?.play('hit');
    if (this.hp <= 0) this.die();
    return true;
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.attackT = 0;
    this.target = null;
    this.combat.shatter(this.rig, this.root.position.clone());
    this.scene.remove(this.root);
    disposeRigRoot(this.root);
    if (this.webLine) {
      this.scene.remove(this.webLine);
      this.webLine.geometry.dispose();
      this.webLine.material.dispose();
      this.webLine = null;
    }
    this.combat.removeAlly(this);
    this.combat.sfx?.play('death');
    if (this.team === 'enemy') {
      this.combat.hud?.burstStuds?.(this.root.position.clone(), this.T.studs, this.groundY);
    }
    this.combat.onAgentDown?.(this);
  }

  // ─── Per-frame ───────────────────────────────────────────────────────────
  tick(dt, frozen = false) {
    if (!this.alive) return;
    this.t += dt;
    this.age += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.swingCooldown = Math.max(0, this.swingCooldown - dt);
    this.hurt = Math.max(0, this.hurt - dt);
    this.attackT = Math.max(0, this.attackT - dt / 0.3);
    this.attack = this.attackT;
    for (const k of Object.keys(this.abilityCd)) this.abilityCd[k] = Math.max(0, this.abilityCd[k] - dt);
    for (const k of Object.keys(this.buffs)) if (k !== 'dmg') this.buffs[k] = Math.max(0, this.buffs[k] - dt);

    if (frozen) {
      this.speed = 0;
      this._stopWebSwing();
      if (this.webLine) this.webLine.visible = false;
      this.rig.update(dt, { speed: 0, grounded: true });
      animateKit(this.rig, this.t, {});
      return;
    }

    this.retarget -= dt;
    if (this.retarget <= 0) {
      this.retarget = 0.3 + Math.random() * 0.2;
      const t = this.combat.pickTargetFor(this);
      if (t) this.target = t;
      else if (this.target && !(this.target.alive ?? true)) this.target = null;
    }
    if (this.target && !(this.target.alive ?? true)) this.target = null;

    // Ground reference
    this.groundT -= dt;
    if (this.groundT <= 0) {
      this.groundT = 0.2;
      this.groundY = this.combat.groundAt(this.root.position.x, this.root.position.z, this.root.position.y);
    }

    const tgt = this.target;
    const inReach = tgt ? this.combat.centerOf(tgt) : null;
    const standoff = this.kit.ranged
      ? Math.min((this.kit.ranged.range ?? 20) * 0.72, 15)
      : (this.kit.melee?.range ?? 2.2) + 0.5;

    let goal = null;
    if (tgt) {
      const d = Math.hypot(inReach.x - this.root.position.x, inReach.z - this.root.position.z);
      goal = inReach;
      if (d > standoff + 0.8) {
        if (!this._swingToward(goal, dt)) this._move(goal, this.speedFor(), dt);
      }
      else if (d < standoff - 2.5 && this.kit.ranged) {
        // back off to shooting range instead of standing in the enemy's face
        const back = this.root.position.clone().setY(0).multiplyScalar(2).sub(inReach.clone().setY(0));
        this._move(back, this.speedFor() * 0.65, dt);
      } else { this._stopWebSwing(); this.speed = 0; }
      this._face(inReach, dt);
    } else if (this.team === 'ally') {
      const me = this.combat.player.root.position;
      const yaw = this.combat.player.root.rotation.y + Math.PI;
      const side = (((this.slot % 4) - 1.5) * 1.7);
      const bx = me.x + Math.sin(yaw) * 3.6 + Math.cos(yaw) * side;
      const bz = me.z + Math.cos(yaw) * 3.6 - Math.sin(yaw) * side;
      const d = Math.hypot(bx - this.root.position.x, bz - this.root.position.z);
      if (d > 1.4) {
        const goal = { x: bx, y: me.y, z: bz };
        if (!this._swingToward(goal, dt)) this._move(goal, d > 16 ? this.speedFor() * 1.5 : this.speedFor() * 0.8, dt);
      } else { this._stopWebSwing(); this.speed = 0; }
      if (d > 55) {
        // left far behind: catch up, like the old friendly AI
        this.root.position.copy(this.combat.spotNear(me, 3, 5));
        this.groundY = this.root.position.y - 0.5;
      }
      this._face(me, dt, 5);
    } else {
      // A hostile with nothing in range closes on the player
      const me = this.combat.player.root.position;
      const d = Math.hypot(me.x - this.root.position.x, me.z - this.root.position.z);
      if (d > 12) {
        if (!this._swingToward(me, dt)) this._move(me, this.speedFor(), dt);
      } else { this._stopWebSwing(); this.speed = 0; }
      this._face(me, dt, 5);
    }

    // ── Flight or gravity ─────────────────────────────────────────────────
    const p = this.root.position;
    if (this.kit.fly) {
      this.flying = true;
      const tY = tgt && inReach
        ? Math.max(this.groundY + 1.0, inReach.y + (this.kit.hover ?? 0.8))
        : this.groundY + (this.kit.hover ?? 0.8) + 1.4;
      p.y += (tY - p.y) * Math.min(1, dt * 2.4);
      p.y += Math.sin(this.t * 2.1 + this.slot) * 0.006;
      p.x += this.vel.x * dt;
      p.z += this.vel.z * dt;
      this.vel.multiplyScalar(Math.exp(-3.2 * dt));
      if (this.speed > 2 && Math.random() < 0.55) {
        this.combat.fx.add({
          pos: this.root.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.1, (Math.random() - 0.5) * 0.4)),
          vel: new THREE.Vector3(0, -2.5, 0), life: 0.35, size: 0.09,
          color: this.team === 'ally' ? 0x9fe4ff : 0xffb04a, glow: 0.7,
        });
      }
    } else {
      this.flying = false;
      this.vel.y -= 30 * dt;
      p.y += this.vel.y * dt;
      p.x += this.vel.x * dt;
      p.z += this.vel.z * dt;
      if (p.y <= this.groundY + 0.5) {
        p.y = this.groundY + 0.5;
        this.vel.y = 0;
        this.vel.x *= 0.9;
        this.vel.z *= 0.9;
      }
      this.vel.x *= Math.exp(-3 * dt);
      this.vel.z *= Math.exp(-3 * dt);
    }
    this._updateWebLine();

    // ── Attacks ───────────────────────────────────────────────────────────
    if (tgt) {
      const dist3 = this.combat.centerOf(tgt).distanceTo(this.chest());
      if (this.cooldown <= 0) {
        const melee = this.kit.melee;
        const ranged = this.kit.ranged;
        if (melee && dist3 <= (melee.range ?? 2.2) + 0.5) this._melee(tgt, melee);
        else if (ranged && dist3 <= (ranged.range ?? 20)) this._shoot(tgt, ranged);
        else if (melee && dist3 <= (melee.range ?? 2.2) + 2.6) {
          // just out of reach: step in with a lunge
          this._move(this.combat.centerOf(tgt), this.speedFor(), dt);
        }
      }
      this._abilities(tgt);
    }

    // ── Animation ─────────────────────────────────────────────────────────
    this.rig.update(dt, {
      speed: this.speed,
      sprint: this.speed > 9,
      grounded: !this.flying,
      vy: this.vel.y,
      attack: this.attackT,
      attackArm: this.attackSide,
      attackKind: this.attackKind,
      swinging: this.swinging,
      webArm: this.webArm,
      rope: this.swinging && this.swingAnchor ? [
        Math.atan2(this.swingAnchor.z - p.z, this.swingAnchor.y - p.y),
        Math.atan2(this.swingAnchor.x - p.x, this.swingAnchor.y - p.y),
      ] : undefined,
      hurt: this.hurt,
      flight: this.flying,
    });
    animateKit(this.rig, this.t, {
      flight: this.flying, speed: this.speed, attack: this.attackT,
    });
  }

  speedFor() {
    return (this.kit.speed ?? 7) * (this.buffs.speed > 0 ? 1.35 : 1);
  }

  _face(pos, dt, k = 11) {
    const want = Math.atan2(pos.x - this.root.position.x, pos.z - this.root.position.z);
    let d = want - this.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * Math.min(1, dt * k);
  }

  _move(goal, speed, dt) {
    const p = this.root.position;
    const dx = goal.x - p.x, dz = goal.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.08) { this.speed = 0; return; }
    const ux = dx / d, uz = dz / d;
    const step = Math.min(speed * dt, d);
    if (!this.combat._blocked(p, ux, uz, 1)) {
      p.x += ux * step;
      p.z += uz * step;
    } else {
      const sx = -uz, sz = ux;
      if (!this.combat._blocked(p, sx, sz, 1)) { p.x += sx * step; p.z += sz * step; }
      else if (!this.combat._blocked(p, -sx, -sz, 1)) { p.x -= sx * step; p.z -= sz * step; }
    }
    this.speed = speed;
    this.root.rotation.y = Math.atan2(ux, uz);
  }

  /** Let web-slinging summons arc through the city while closing distance, with a visible tether. */
  _swingToward(goal, dt) {
    if (!this.kit.swing || this.swingCooldown > 0) return false;
    const p = this.root.position;
    const dx = goal.x - p.x, dz = goal.z - p.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 9 && !this.swinging) return false;

    if (!this.swinging) {
      const ux = dx / Math.max(distance, 1e-4), uz = dz / Math.max(distance, 1e-4);
      this.swinging = true;
      this.swingT = 0;
      this.webArm = Math.random() < 0.5 ? -1 : 1;
      this.swingAnchor = new THREE.Vector3(p.x + ux * Math.min(10, distance * 0.55), p.y + 11, p.z + uz * Math.min(10, distance * 0.55));
      this.swingLength = p.distanceTo(this.swingAnchor);
      this.vel.set(ux * Math.min(17, this.speedFor() * 1.55), 2.2, uz * Math.min(17, this.speedFor() * 1.55));
    }

    this.swingT += dt;
    this.vel.y -= 18 * dt;
    // Gravity pulls the pendulum down; steering adds a little forward drive without breaking the tether.
    const steer = new THREE.Vector3(dx, 0, dz);
    if (steer.lengthSq() > 1e-4) this.vel.addScaledVector(steer.normalize(), 4.5 * dt);
    p.addScaledVector(this.vel, dt);
    const radial = p.clone().sub(this.swingAnchor);
    if (radial.lengthSq() < 1e-4) radial.set(0, -1, 0);
    radial.normalize();
    p.copy(this.swingAnchor).addScaledVector(radial, this.swingLength);
    this.vel.addScaledVector(radial, -this.vel.dot(radial));
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.root.rotation.y = Math.atan2(dx, dz);

    if (this.swingT > 1.65 || distance < 7 || this.hurt > 0) {
      this._stopWebSwing();
      this.swingCooldown = 0.28;
    }
    return true;
  }

  _stopWebSwing() {
    if (!this.swinging) return;
    this.swinging = false;
    this.swingAnchor = null;
    this.swingLength = 0;
  }

  _updateWebLine() {
    if (!this.webLine || !this.swinging || !this.swingAnchor) {
      if (this.webLine) this.webLine.visible = false;
      return;
    }
    const attr = this.webLine.geometry.attributes.position;
    attr.setXYZ(0, this.root.position.x, this.root.position.y + 1.35, this.root.position.z);
    attr.setXYZ(1, this.swingAnchor.x, this.swingAnchor.y, this.swingAnchor.z);
    attr.needsUpdate = true;
    this.webLine.geometry.computeBoundingSphere();
    this.webLine.visible = true;
  }

  /** Melee arc: everything hostile inside reach and in front takes the hit. */
  _melee(tgt, spec) {
    this.attackT = 1;
    this.attackKind = spec.kind ?? 'punch';
    this.attackSide = -this.attackSide || -1;
    this.cooldown = spec.rate ?? 0.8;
    const fwd = this.faceDir();
    const from = this.chest();
    let hit = false;
    for (const t of this.combat.opponentsOf(this.team)) {
      if (!(t.alive ?? true)) continue;
      const c = this.combat.centerOf(t);
      const d = c.distanceTo(from);
      if (d > (spec.range ?? 2.2) + 0.8) continue;
      const dir = c.clone().sub(this.root.position).setY(0);
      if (dir.lengthSq() > 1e-4) dir.normalize();
      if (dir.dot(fwd) < 0.1) continue;
      this.combat.damageTarget(t, Math.max(1, Math.round((spec.dmg ?? 1) * this.damageMul)), from, spec.knock ?? 5);
      hit = true;
    }
    this.combat.sfx?.play(hit ? 'melee' : 'swing');
    if (hit) this.combat.ui?.shake?.(0.12);
  }

  /** Ranged primary: real projectile from the actual weapon muzzle. */
  _shoot(tgt, spec) {
    const origin = this._muzzle(spec.muzzle ?? 'R');
    this.combat.fireAt(this, tgt, {
      ...spec,
      origin,
      dmg: Math.max(1, Math.round((spec.dmg ?? 1) * this.damageMul)),
    });
    this.attackT = 1;
    this.attackKind = spec.anim ?? (['arrow', 'bullet', 'feather', 'stinger', 'web'].includes(spec.kind) ? 'shoot' : spec.kind === 'knife' || spec.kind === 'spear' || spec.kind === 'pumpkin' ? 'throw' : 'cast');
    this.cooldown = spec.rate ?? 1;
  }

  _muzzle(spec) {
    if (!this.rig?.arm) return this.chest();
    if (spec === 'chest') return this.chest();
    if (spec === 'head') return this.root.position.clone().setY(this.root.position.y + 1.35);
    this.root.updateMatrixWorld(true);
    const both = spec === 'both';
    const side = both ? (this.attackSide = -this.attackSide || -1) : spec === 'L' ? 1 : -1;
    const m = this.refs?.muzzles?.[side];
    if (m) return m.getWorldPosition(new THREE.Vector3());
    return this.rig.arm[side].localToWorld(new THREE.Vector3(0, -0.5, 0.34));
  }

  _abilities(tgt) {
    const list = this.kit.abilities ?? [];
    for (const ab of list) {
      if ((this.abilityCd[ab.id] ?? 0) > 0) continue;
      if (!ab.self && !tgt) continue;
      if (tgt && ab.range) {
        const d = this.combat.centerOf(tgt).distanceTo(this.chest());
        if (d > ab.range) continue;
      }
      let ok = false;
      try {
        ok = ab.cast?.(this, this.combat, tgt) ?? false;
      } catch (err) {
        console.warn(`[Agent] ${this.key} ability ${ab.id} failed`, err);
        ok = false;
      }
      this.abilityCd[ab.id] = ok ? (ab.cd ?? 8) : 1.2;
      if (ok) {
        this.attackKind = ab.anim ?? 'cast';
        this.attackT = 1;
        this.combat.sfx?.play('ability');
        this.combat.fx.burst(this.chest(), {
          n: 12, colors: [this.team === 'ally' ? 0x9fe4ff : 0xff9a3a, 0xffffff],
          speed: 3, up: 3, size: 0.1, life: 0.5,
        });
      }
      break; // one ability per decision, so they don't all fire on the same frame
    }
  }
}
