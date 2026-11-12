/**
 * PortalGun.js — an admin-granted two-portal gadget.
 *
 * Only the server can hand this to a player: an admin uses the K menu's SPAWN button or a
 * player row's GIVE GUN button, and the server broadcasts a portal grant. The recipient can
 * press its equip bind (Z by default) to holster/equip it, then its blue/orange binds (LMB/RMB
 * plus J/L by default) to place the portals.
 *
 * The pair must use two different surface types (floor + wall, floor + ceiling, wall + ceiling).
 * Entering one front side moves the player through the linked portal with their current speed;
 * gravity then does the rest, so falling into a floor portal drops you out of the other side.
 *
 * Features: proper aiming crosshair, solid-color portal interiors with ambient orbiting
 * particles, screen-flash teleport feedback, and void-fall protection at portal exits.
 */
import * as THREE from 'three';
import { isTypingTarget, overlayOpen } from './Input.js?v=2';
import { keyFor, keyName } from './Binds.js?v=12';
import { buildPortalGunModel, animatePortalGunModel, kickPortalGunModel } from './PortalGunModel.js?v=2';

const FORWARD = new THREE.Vector3(0, 0, 1);
const BLUE = 0x35c9ff;
const ORANGE = 0xff8b34;
const PORTAL_RADIUS_SQ = 1.2 * 1.2;
const PARTICLE_N = 28;

const GRIP = new THREE.Vector3(0, -0.23, -0.12);   // pistol grip centre in PortalGunModel space

export class PortalGun {
  constructor({ scene, camera, controller, combat, hud = null, net = null, me = null }) {
    Object.assign(this, { scene, camera, controller, combat, hud, net, me });
    this.authorized = false;
    this.active = false;
    this.portals = [null, null];
    this.grants = new Set();
    this._cooldown = 0;
    this._exitGuard = 0;
    this._noticeT = 0;
    this._t = 0;
    this._ray = new THREE.Raycaster();
    this._ray.far = 150;
    this._normal = new THREE.Vector3();
    this._player = new THREE.Vector3();
    this._point = new THREE.Vector3();
    this._exit = new THREE.Vector3();
    this._vel = new THREE.Vector3();
    this._prevPos = new THREE.Vector3();
    this._prevSet = false;
    this.model = null;
    this._modelHolder = null;
    this._modelArm = null;

    this._buildHud();
    this._buildCrosshair();
    this._buildFlash();
    this._buildPortals();
    controller.portalGun = this;

    document.addEventListener('keydown', e => this._key(e));
    window.addEventListener('binds-changed', () => this._setHud());
    if (net) net.on('portal', m => this._remoteGrant(m));
  }

  /** True when this client is allowed to see another player's grant state (for admin labels). */
  hasPlayer(id) { return this.grants.has(Number(id)); }

  _remoteGrant(m) {
    const id = Number(m?.id);
    if (!Number.isFinite(id)) return;
    if (m.on) this.grants.add(id); else this.grants.delete(id);
    if (id === Number(this.me?.id)) this.setAuthorized(!!m.on);
  }

  /** Free Play / local admin. Online admins go through the server's rank check instead. */
  grantSelf() {
    if (this.net && this.me) {
      this.net.send({ t: 'mod', action: 'portal', target: this.me.id, on: true });
      return;
    }
    if (this.me?.id != null) this.grants.add(Number(this.me.id));
    this.setAuthorized(true);
  }

  /** Ask the server to revoke the gun, or revoke it locally in Free Play. */
  deactivate() {
    if (this.net && this.me) {
      this.net.send({ t: 'mod', action: 'portal', target: this.me.id, on: false });
      return;
    }
    if (this.me?.id != null) this.grants.delete(Number(this.me.id));
    this.setAuthorized(false);
  }

  /** Hide and reset both placed portals; revoking the gun also calls this. */
  clearPortals() {
    this._clearVisuals();
    for (const p of this.portals) {
      if (!p) continue;
      p.pos.set(0, 0, 0);
      p.normal.set(0, 0, 1);
    }
    this._prevSet = false;
    this._exitGuard = 0;
  }

  setAuthorized(on) {
    on = !!on;
    if (on === this.authorized) { this._setHud(); this._syncModel(); return; }
    this.authorized = on;
    this.active = on;
    if (!on) {
      this.clearPortals();
      if (this.model) this.model.visible = false;
    }
    this._setHud();
    this._syncModel();
    this._updateCrosshair();
    if (on) this.hud?.toast('PORTAL GUN READY');
    else this.hud?.toast('PORTAL GUN DEACTIVATED · PORTALS CLEARED');
  }

  /**
   * Portal keys are action codes. Binds.js turns a custom key into the action's default
   * code in the capture phase, so rebinding works without changing this handler.
   */
  _key(e) {
    if (e.repeat || isTypingTarget(e) || overlayOpen() || !this.authorized) return;
    if (this.controller?.dorm) return;   // no portal gun in the dorm
    if (e.code === 'KeyZ') {
      e.preventDefault();
      this.active = !this.active;
      if (!this.active) {
        for (const p of this.portals) if (p) p.group.visible = false;
        this.controller._lmb = false;
        this._prevSet = false;
      }
      this._syncModel();
      this._setHud();
      this._updateCrosshair();
      this.hud?.toast(this.active ? 'PORTAL GUN EQUIPPED' : 'PORTAL GUN HOLSTERED');
      return;
    }
    if (!this.active) return;
    if (e.code === 'KeyJ' && this._fire(0)) e.preventDefault();
    else if (e.code === 'KeyL' && this._fire(1)) e.preventDefault();
  }

  /** Slot-indexed so mouse and keyboard always select the same portal. */
  _fire(slot) {
    if (!this.authorized || !this.active || this._cooldown > 0) return false;
    this._place(slot === 1 ? 1 : 0);
    return true;
  }

  /**
   * Called from CharacterController before the normal web-swing / camera handling.
   * Takes raw MouseEvent.button values: 0 = blue, 2 = orange.
   */
  tryFire(button) {
    if (!this.authorized || !this.active || !document.pointerLockElement || this.controller?.dorm) return false;
    if (button !== 0 && button !== 2) return false;
    this._fire(button === 2 ? 1 : 0);
    return true;
  }

  // ── Crosshair ──────────────────────────────────────────────────────────────

  _buildCrosshair() {
    const el = this._crosshairEl = document.createElement('div');
    el.id = 'portal-crosshair';
    el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);' +
      'z-index:50;pointer-events:none;display:none;width:32px;height:32px;' +
      'filter:drop-shadow(0 0 2px rgba(0,0,0,0.6));';
    el.innerHTML = '<svg viewBox="0 0 32 32" width="32" height="32" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<line x1="16" y1="4" x2="16" y2="12" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>' +
      '<line x1="16" y1="20" x2="16" y2="28" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>' +
      '<line x1="4" y1="16" x2="12" y2="16" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>' +
      '<line x1="20" y1="16" x2="28" y2="16" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>' +
      '<circle cx="16" cy="16" r="1.5" fill="#fff"/>' +
      '</svg>';
    document.body.append(el);
  }

  _updateCrosshair() {
    if (!this._crosshairEl) return;
    const show = this.authorized && this.active && !!document.pointerLockElement;
    this._crosshairEl.style.display = show ? 'block' : 'none';
  }

  // ── Screen flash on teleport ───────────────────────────────────────────────

  _buildFlash() {
    const el = this._flashEl = document.createElement('div');
    el.id = 'portal-flash';
    el.style.cssText = 'position:fixed;inset:0;z-index:55;pointer-events:none;opacity:0;';
    document.body.append(el);
  }

  _doFlash(color) {
    if (!this._flashEl) return;
    const hex = '#' + color.toString(16).padStart(6, '0');
    this._flashEl.style.transition = 'none';
    this._flashEl.style.background =
      'radial-gradient(circle at 50% 50%,' + hex + 'AA 0%,' + hex + '44 35%,transparent 70%)';
    this._flashEl.style.opacity = '0.75';
    void this._flashEl.offsetHeight;
    this._flashEl.style.transition = 'opacity 0.25s ease-out';
    this._flashEl.style.opacity = '0';
  }

  // ── HUD ────────────────────────────────────────────────────────────────────

  _buildHud() {
    const h = this.hint = document.createElement('div');
    h.id = 'portal-hud';
    h.className = 'portal-hud';
    h.hidden = true;
    h.innerHTML = '<b>PORTAL GUN</b><span class="pg-blue"></span><span class="pg-orange"></span><span class="pg-pair"></span><em></em>';
    document.body.append(h);
  }

  _setHud() {
    if (!this.hint) return;
    this.hint.hidden = !this.authorized;
    this.hint.classList.toggle('off', !this.active);
    const blue = this.hint.querySelector('.pg-blue');
    const orange = this.hint.querySelector('.pg-orange');
    const pair = this.hint.querySelector('.pg-pair');
    const equip = this.hint.querySelector('em');
    if (blue) blue.textContent = `LMB / ${keyName(keyFor('KeyJ'))} BLUE`;
    if (orange) orange.textContent = `RMB / ${keyName(keyFor('KeyL'))} ORANGE`;
    if (equip) equip.textContent = `${keyName(keyFor('KeyZ'))} ${this.active ? 'HOLSTER' : 'EQUIP'}`;
    if (pair) {
      const link = this._pair();
      if (!link) pair.textContent = 'PLACE BOTH PORTALS';
      else pair.textContent = `${link.ta} + ${link.tb} · ${link.valid ? 'LINK' : 'NO LINK'}`;
      pair.classList.toggle('bad', !!link && !link.valid);
    }
  }

  // ── Model ──────────────────────────────────────────────────────────────────

  /**
   * The held prop is attached to the right arm's hand anchor. It is built lazily on the first
   * grant and re-parented if a suit / respawn replaces the character rig.
   */
  _ensureModel() {
    if (!this.model) this.model = buildPortalGunModel();
    if (!this._modelHolder) {
      this._modelHolder = new THREE.Group();
      this._modelHolder.name = 'PortalGunHolder';
      this._modelHolder.position.set(0, -0.5, 0.07);
      this._modelHolder.rotation.x = Math.PI / 2;   // barrel follows the forearm
      this._modelHolder.add(this.model);
    }
  }

  _syncModel() {
    if (!this.authorized) {
      if (this.model) this.model.visible = false;
      return;
    }
    this._ensureModel();
    const arm = this.controller.rig?.arm?.[-1];
    if (!arm) {
      this.model.visible = false;
      return;
    }
    if (this._modelArm !== arm) {
      if (this._modelHolder.parent) this._modelHolder.parent.remove(this._modelHolder);
      arm.add(this._modelHolder);
      this._modelArm = arm;
      // Put the pistol grip in the hand: the extracted rig knows where its hand is (arm space).
      // The old fixed offset left the gun floating beside the arm on the GLB rig.
      const hand = this.controller.rig?.handLocal?.[-1];
      if (hand) {
        const grip = GRIP.clone().applyEuler(this._modelHolder.rotation);
        this._modelHolder.position.copy(hand).sub(grip);
      } else this._modelHolder.position.set(0, -0.5, 0.07);
    }
    this.model.visible = this.active;
  }

  /** Keep the right arm raised while the gun is out; web-swinging and climbing own the arms. */
  poseRig() {
    if (!this.authorized || !this.active || !this.model?.visible) return;
    if (this.controller.isClimbing || this.controller.webPhysics?.isSwinging) return;
    const arm = this.controller.rig?.arm?.[-1];
    if (!arm) return;
    arm.rotation.x = -1.38;
    arm.rotation.y = 0;
    arm.rotation.z = 0.04;
  }

  // ── Portal visuals ─────────────────────────────────────────────────────────

  _buildPortals() {
    for (let i = 0; i < 2; i++) {
      const group = new THREE.Group();
      group.visible = false;
      group.renderOrder = 3;
      const color = i ? ORANGE : BLUE;

      // Bright glowing ring border
      const ringMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.94, blending: THREE.AdditiveBlending,
        depthWrite: false, toneMapped: false,
      });
      // Outer halo glow
      const haloMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending,
        depthWrite: false, toneMapped: false,
      });
      // Solid opaque dark interior (blocks seeing through the portal)
      const discMat = new THREE.MeshBasicMaterial({
        color: i ? 0x301808 : 0x062038, side: THREE.DoubleSide,
        depthWrite: true, toneMapped: false,
      });
      // Energy glow layer on top of the solid base (additive → self-lit colored surface)
      const glowMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      });

      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.12, 8, 28), ringMat);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.035, 6, 28), haloMat);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.9, 28), discMat);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.85, 28), glowMat);
      disc.position.z = 0.005;
      glow.position.z = 0.015;
      ring.renderOrder = halo.renderOrder = 4;
      disc.renderOrder = 3;
      glow.renderOrder = 3.5;
      group.add(disc, glow, ring, halo);

      // Ambient orbiting particles around the portal ring
      const ptGeo = new THREE.BufferGeometry();
      const ptPos = new Float32Array(PARTICLE_N * 3);
      ptGeo.setAttribute('position', new THREE.BufferAttribute(ptPos, 3));
      const ptMat = new THREE.PointsMaterial({
        color, size: 0.06, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      });
      const pts = new THREE.Points(ptGeo, ptMat);
      pts.renderOrder = 5;
      group.add(pts);

      const ptData = [];
      for (let j = 0; j < PARTICLE_N; j++) {
        ptData.push({
          angle: Math.random() * Math.PI * 2,
          speed: 0.5 + Math.random() * 1.6,
          r: 0.72 + Math.random() * 0.38,
          zOff: (Math.random() - 0.5) * 0.2,
        });
      }

      this.scene.add(group);
      this.portals[i] = {
        group, pos: new THREE.Vector3(), normal: new THREE.Vector3(0, 0, 1),
        ring, halo, disc, glow, seed: i * 1.7, slot: i,
        pts: { points: pts, pos: ptPos, data: ptData },
      };
    }
  }

  _clearVisuals() {
    for (const p of this.portals) if (p) p.group.visible = false;
  }

  _surfaceOf(p) {
    if (!p) return '';
    return p.normal.y > 0.65 ? 'FLOOR' : p.normal.y < -0.65 ? 'CEILING' : 'WALL';
  }

  /** A link only transports when both portals exist and are on different surface types. */
  _pair() {
    const [a, b] = this.portals;
    if (!a?.group.visible || !b?.group.visible) return null;
    const ta = this._surfaceOf(a), tb = this._surfaceOf(b);
    return { a, b, ta, tb, valid: ta !== tb };
  }

  _notice(text) {
    if (this._noticeT > 0) return;
    this._noticeT = 1.5;
    this.hud?.toast?.(text);
  }

  _place(slot) {
    const i = slot === 1 ? 1 : 0;
    const meshes = this.controller.cityMeshes?.length ? this.controller.cityMeshes : this.controller.collisionMeshes;
    if (!meshes?.length) return;
    this._ray.setFromCamera({ x: 0, y: 0 }, this.camera);
    const hit = this._ray.intersectObjects(meshes, false)[0];
    if (!hit?.face) return;

    this._normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize();
    // Face the portal out toward the player, even when the mesh is double-sided.
    if (this._normal.dot(this._ray.ray.direction) > 0) this._normal.negate();

    const p = this.portals[i];
    p.pos.copy(hit.point).addScaledVector(this._normal, 0.12);
    p.normal.copy(this._normal);
    p.surface = this._surfaceOf(p);
    p.group.position.copy(p.pos);
    p.group.quaternion.setFromUnitVectors(FORWARD, p.normal);
    p.group.scale.setScalar(1);
    p.group.visible = true;
    p.group.userData.portalSlot = i;
    this._cooldown = 0.22;
    this._prevSet = false;
    kickPortalGunModel(this.model, i ? ORANGE : BLUE);
    this.combat.sfx?.play?.('ability');
    this.combat.fx?.burst?.(p.pos, {
      n: 24, color: i ? ORANGE : BLUE, speed: 5, up: 1.8,
      life: 0.6, size: 0.1, gravity: 2, spread: 0.35,
    });
    this._setHud();
    const link = this._pair();
    if (link && !link.valid) this._notice('PORTALS NEED DIFFERENT SURFACE TYPES');
  }

  // ── Update loop ────────────────────────────────────────────────────────────

  update(dt) {
    this._cooldown = Math.max(0, this._cooldown - dt);
    this._exitGuard = Math.max(0, this._exitGuard - dt);
    this._noticeT = Math.max(0, this._noticeT - dt);
    if (!this.authorized) { this._prevSet = false; return; }

    this._t += dt;
    this._syncModel();
    this._updateCrosshair();
    if (this.model?.visible) animatePortalGunModel(this.model, this._t, dt);

    // Animate portals: ring pulse, glow pulse, orbiting particles
    for (const p of this.portals) {
      if (!p?.group.visible) continue;
      const pulse = 1 + Math.sin(this._t * 4 + p.seed) * 0.035;
      p.group.scale.setScalar(pulse);
      p.halo.scale.setScalar(1 + Math.sin(this._t * 3 + p.seed) * 0.06);
      p.ring.rotation.z += dt * 0.8;
      // Pulse the energy glow layer
      if (p.glow) p.glow.material.opacity = 0.45 + Math.sin(this._t * 5 + p.seed) * 0.12;
      // Orbit particles around the ring
      this._animateParticles(p, dt);
    }

    if (!this.active) { this._prevSet = false; return; }
    const link = this._pair();
    if (!link) { this._rememberPos(); return; }
    if (this._exitGuard > 0) { this._rememberPos(); return; }
    if (!link.valid) {
      this._rememberPos();
      return;
    }
    this._travel(link);
    this._rememberPos();
  }

  _animateParticles(portal, dt) {
    const pts = portal.pts;
    if (!pts) return;
    const { pos, data } = pts;
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      d.angle += d.speed * dt;
      pos[i * 3]     = Math.cos(d.angle) * d.r;
      pos[i * 3 + 1] = Math.sin(d.angle) * d.r;
      pos[i * 3 + 2] = d.zOff + Math.sin(d.angle * 2.5 + d.r) * 0.06;
    }
    pts.points.geometry.attributes.position.needsUpdate = true;
  }

  _rememberPos() {
    this._prevPos.copy(this.controller.root.position);
    this._prevSet = true;
  }

  // ── Travel detection ───────────────────────────────────────────────────────

  _travel(link) {
    if (!this._prevSet) return false;
    const prev = this._prevPos;
    const now = this.controller.root.position;
    const dx = now.x - prev.x, dy = now.y - prev.y, dz = now.z - prev.z;
    const v = this.controller.velocity;

    for (let slot = 0; slot < 2; slot++) {
      const from = this.portals[slot], to = this.portals[1 - slot];
      if (!from?.group.visible || !to?.group.visible) continue;
      const surface = this._surfaceOf(from);
      const heights = surface === 'FLOOR' ? [0.35] : surface === 'CEILING' ? [1.65] : [0.45, 1.35];
      const frontLimit = surface === 'FLOOR' ? 0.85 : 0.72;
      for (const h of heights) {
        this._point.set(now.x, now.y + h, now.z);
        const rx = this._point.x - from.pos.x;
        const ry = this._point.y - from.pos.y;
        const rz = this._point.z - from.pos.z;
        const front = rx * from.normal.x + ry * from.normal.y + rz * from.normal.z;
        if (front < -0.35 || front > frontLimit) continue;
        const radialSq = rx * rx + ry * ry + rz * rz - front * front;
        if (radialSq > PORTAL_RADIUS_SQ) continue;

        const moveInto = dx * from.normal.x + dy * from.normal.y + dz * from.normal.z;
        const velInto = v.x * from.normal.x + v.y * from.normal.y + v.z * from.normal.z;
        const approaching = surface === 'FLOOR'
          ? (this.controller.isGrounded || v.y < 0.25 || moveInto < -0.001)
          : (moveInto < -0.001 || velInto < -0.05);
        if (!approaching) continue;

        this._teleport(to, from);
        return true;
      }
    }
    return false;
  }

  // ── Teleport ───────────────────────────────────────────────────────────────

  _teleport(to, from) {
    const surface = this._surfaceOf(to);
    if (surface === 'FLOOR') {
      // Rise out of the floor portal, then gravity brings you back down.
      this._exit.copy(to.pos);
      this._exit.y += 1.20;
    } else if (surface === 'CEILING') {
      // Drop from the ceiling portal.
      this._exit.copy(to.pos);
      this._exit.y -= 1.85;
    } else {
      // Come out of the wall at torso height, with feet below the portal centre.
      this._exit.copy(to.pos).addScaledVector(to.normal, 1.60);
      this._exit.y -= 1.05;
    }
    this.controller.root.position.copy(this._exit);

    // Keep the speed of the fall/run that entered; no artificial launch boost.
    const speed = Math.min(24, Math.max(3.5, this.controller.velocity.length()));
    this._vel.copy(to.normal).multiplyScalar(speed);
    this.controller.velocity.copy(this._vel);
    this.controller.isGrounded = false;
    this.controller.isClimbing = false;
    this.controller.isWallRun = false;
    this.controller.webPhysics?.releaseWeb?.(false);
    this._exitGuard = 1.1;
    this._cooldown = 0.35;
    this._prevSet = false;

    // ── Void-fall protection ──
    // After teleporting, the exit position might be above a geometry seam or map edge.
    // Reset the void timer and mark the exit as the last safe footing so the void guard
    // doesn't teleport the player somewhere else.
    this.controller._voidT = 0;
    this.controller._voidFalls = 0;
    if (this.controller._safe) {
      this.controller._safe.copy(this._exit);
      this.controller._safeSet = true;
    }

    // ── Teleport feedback: color flash + enhanced particle bursts ──
    const fromColor = from === this.portals[0] ? BLUE : ORANGE;
    const toColor   = to   === this.portals[0] ? BLUE : ORANGE;
    this._doFlash(toColor);
    this.combat.sfx?.play?.('ability');
    this.combat.fx?.burst?.(from.pos, {
      n: 30, color: fromColor, speed: 6, up: 2.5, life: 0.55, size: 0.12, gravity: 3, spread: 0.45,
    });
    this.combat.fx?.burst?.(to.pos, {
      n: 30, color: toColor, speed: 6, up: 2.5, life: 0.55, size: 0.12, gravity: 3, spread: 0.45,
    });
  }
}
