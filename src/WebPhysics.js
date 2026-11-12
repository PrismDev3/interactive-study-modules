/**
 * WebPhysics.js
 * Pendulum constraint solver for the web-swing mechanic.
 *
 * ── Physics Model ────────────────────────────────────────────────────────
 * We model the character as a point mass on an inextensible string of
 * variable length L (the web).  Each frame we:
 *
 *  1. Apply gravity:          v += g * dt
 *  2. Apply air drag:         v *= (1 - drag * dt)
 *  3. Integrate position:     p += v * dt
 *  4. Enforce constraint:     if |p - anchor| > L, project p back onto the
 *                             sphere and remove the outward velocity component
 *                             (Positional-Based Dynamics style correction).
 *
 * This gives a stable, responsive pendulum that handles fast swings without
 * energy blowup.  The web can also reel in (shorten L over time) to simulate
 * the character pulling themselves toward the anchor.
 *
 * The visible web line is a THREE.Line whose geometry is updated every frame
 * to show the string from character to anchor point.
 *
 * ── Web-shoot targeting ──────────────────────────────────────────────────
 * When the player presses E, we cast a ray in the camera's forward direction.
 * If it hits a building surface above a minimum height threshold, that
 * intersection becomes the anchor.  If nothing is hit, we place a virtual
 * anchor point 20–50 m ahead and above (the "sky anchor" fallback so the
 * player never fails to swing in open areas).
 */
import * as THREE from 'three';
import { Tendril } from './Tendril.js?v=1';
// sky anchors removed: webs need a real surface

const GRAVITY      = -32;   // m/s²
const DRAG         = 0.08;  // per second (exponential)
const STEER_ACCEL  = 14;    // m/s² from W/A/S/D while swinging
const PUMP_ACCEL   = 9;     // extra push along the swing through the bottom of the arc
const REEL_SPEED   = 14;
const MIN_WEB_LEN  = 5;      // reeling in stops here (a tiny rope let you spin up to silly speeds)
const MIN_SWING_SPEED = 17; // forward speed guaranteed when a web connects
const SOFT_SPEED   = 31;     // above this, air resistance grows fast
const MAX_SPEED    = 42;     // hard ceiling while swinging
const MAX_WEB_RANGE = 70;    // a web strand reaches about this far; past it there is nothing to grab
const PIVOT_PULL   = 0.85;   // see WebPhysics.pivotPull. tools/swing-bench.js, 12 runs: wall hits 0→18, 0.5→14, 0.7→7, 0.85→2

export class WebPhysics {
  constructor(scene, camera, characterBody) {
    this.scene         = scene;
    this.camera        = camera;
    this.characterBody = characterBody; // Object3D whose position we drive

    this.isSwinging  = false;
    this.twoHandGrip = false;
    this.anchor      = new THREE.Vector3();   // physics pivot of the pendulum
    this.webEnd      = new THREE.Vector3();   // where the web visibly sticks (the facade hit)
    this._hasEnd     = false;                 // false: draw to the pivot (perch zips set `anchor` directly)
    this._showImpactSplat = true;
    // How far the pivot is pulled from the facade toward your line of travel (0 = on the wall).
    // A pivot on the wall swings you into that wall; pulling it in keeps the arc down the street.
    this.pivotPull   = PIVOT_PULL;
    this.velocity    = new THREE.Vector3();
    this.webLength   = 0;
    this.reelingIn   = false;

    // ── LEGO web: chain of rod pieces with round joints, plus a studded splat ──
    const webMat = new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 0.35, emissive: 0x1a1a1a });
    this._webMat = webMat;
    this._chainMax = 90;
    this._chain = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 8), webMat, this._chainMax);
    this._knots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), webMat, this._chainMax);
    for (const m of [this._chain, this._knots]) {
      m.visible = false;
      m.frustumCulled = false;
      m.castShadow = true;
      this.scene.add(m);
    }
    this._splat = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 20), webMat);
    this._splat.add(disc);
    for (const [x, z] of [[0.14, 0.14], [-0.14, 0.14], [0.14, -0.14], [-0.14, -0.14]]) {
      const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 12), webMat);
      stud.position.set(x, 0.06, z);
      stud.userData.stud = true;
      this._splat.add(stud);
    }
    for (let i = 0; i < 6; i++) {
      const strand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.75), webMat);
      strand.rotation.y = (i / 6) * Math.PI;
      this._splat.add(strand);
    }
    this._splat.visible = false;
    this.scene.add(this._splat);
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);
    this._hand = new THREE.Vector3();
    this._otherHand = new THREE.Vector3();
    this.getHand = null; // set by the controller: (target) => world position of the web hand
    // ── Moving anchors (aircraft) ──
    // A web attached to a plane or helicopter has to follow it: the pivot is re-read from the
    // target every frame and the player is carried with it, instead of the anchor being frozen
    // at the point where the web landed.
    this.airTargets = [];      // [{ node, kind }] filled in by the controller
    this.attachTarget = null;
    this._anchorLocal = new THREE.Vector3();
    this._pivotWorld = new THREE.Vector3();
    this._prevAnchor = new THREE.Vector3();
    this._anchorDelta = new THREE.Vector3();

    // ── Impact particle system ────────────────────────────────────────
    this._buildImpactParticles();

    // Raycaster for anchor targeting
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 400;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Fire a web in the camera's look direction.
   * buildingMeshes: array of Mesh objects in the scene to ray-test.
   */
  fireWeb(buildingMeshes, currentVelocity) {
    const origin = this.characterBody.position.clone();
    this.attachTarget = null;
    origin.y += 1.3;
    const look = new THREE.Vector3();
    this.camera.getWorldDirection(look);
    const flat = new THREE.Vector3(look.x, 0, look.z);
    if (flat.lengthSq() < 1e-4) flat.set(Math.sin(this.characterBody.rotation.y), 0, Math.cos(this.characterBody.rotation.y));
    flat.normalize();

    // Auto-aim: score candidate anchors ahead and above, slightly off to one side of travel,
    // alternating sides between webs so you weave down the street instead of hugging one wall.
    this.raycaster.firstHitOnly = true;
    this.raycaster.far = MAX_WEB_RANGE;   // was 400 m: swinging off towers across the city looked absurd
    const right = new THREE.Vector3(-flat.z, 0, flat.x);
    let best = null;
    const tryDir = dir => {
      this.raycaster.set(origin, dir);
      const hit = this.raycaster.intersectObjects(buildingMeshes, false)[0];
      if (!hit || hit.point.y < origin.y + 6 || hit.distance < 10) return;
      const rel = hit.point.clone().sub(origin);
      const ahead = rel.x * flat.x + rel.z * flat.z;
      if (ahead < 6) return;
      const side = rel.x * right.x + rel.z * right.z;
      const sideSign = Math.sign(side) || 1;
      let score = Math.min(ahead, 40) * 0.8 - Math.abs(hit.distance - 32) * 0.35
        - Math.max(0, hit.distance - 45) * 0.6   // long strands only when nothing closer works
        + Math.min(rel.y, 35) * 0.35 - Math.abs(Math.abs(side) - 10) * 0.25;
      if (sideSign !== this._lastSide) score += 5;
      if (!best || score > best.score) best = { score, hit, sideSign, side };
    };
    tryDir(look);
    for (const yaw of [0, 0.25, -0.25, 0.5, -0.5, 0.8, -0.8]) {
      const f = flat.clone().applyAxisAngle(this._up, yaw);
      for (const deg of [35, 45, 55, 65, 75]) {
        const a = THREE.MathUtils.degToRad(deg);
        tryDir(f.clone().multiplyScalar(Math.cos(a)).setY(Math.sin(a)));
      }
    }
    // Nothing ahead passed the strict filter: before falling back to a sky anchor, sweep all
    // around with a relaxed filter so any nearby building (side, behind, lower) still takes the web.
    if (!best) {
      for (let yaw = 0; yaw < Math.PI * 2; yaw += Math.PI / 8) {
        const f = flat.clone().applyAxisAngle(this._up, yaw);
        for (const deg of [25, 40, 55, 70, 85]) {
          const a = THREE.MathUtils.degToRad(deg);
          this.raycaster.set(origin, f.clone().multiplyScalar(Math.cos(a)).setY(Math.sin(a)));
          const hit = this.raycaster.intersectObjects(buildingMeshes, false)[0];
          if (!hit || hit.point.y < origin.y + 3 || hit.distance < 5) continue;
          const rel = hit.point.clone().sub(origin);
          const ahead = rel.x * flat.x + rel.z * flat.z, side = rel.x * right.x + rel.z * right.z;
          const score = ahead * 0.5 + Math.min(rel.y, 35) * 0.4 - Math.abs(hit.distance - 28) * 0.3;
          if (!best || score > best.score) best = { score, hit, sideSign: Math.sign(side) || 1, side };
        }
      }
    }
    const hasFacade = !!best;
    // Aircraft, if any are in range and roughly in the direction you are looking, win over the
    // virtual sky anchor: swinging off a helicopter is the whole point of them existing.
    const plane = hasFacade ? null : this._findAircraft(origin, flat, look);
    if (plane) {
      const local = plane.node.worldToLocal(origin.clone());
      // Hang from slightly under the fuselage so the rope clears the airframe.
      local.y = Math.min(local.y, -2.2);
      this._anchorLocal.copy(local);
      plane.node.getWorldPosition(this._pivotWorld).add(this._anchorLocal.applyQuaternion(plane.node.getWorldQuaternion(new THREE.Quaternion())));
      this.anchor.copy(this._pivotWorld);
      this.webEnd.copy(this.anchor);
      this._hasEnd = false;
      this.attachTarget = plane.node;
      this.attachKind = plane.kind;
      this._lastSide = this._lastSide ? -this._lastSide : 1;
      this.handSide = this._lastSide > 0 ? -1 : 1;
      this._anchorNormal = null;
      this._showImpactSplat = false;
      this._setWebVisible(true);
      document.dispatchEvent(new CustomEvent('webfired'));
      this._beginSwing(origin, flat, currentVelocity);
      return true;
    }
    // No building or aircraft in range: no web. Swinging off empty sky is not allowed.
    if (!hasFacade) return false;
    this.webEnd.copy(best.hit.point);
    this._hasEnd = true;
    this.anchor.copy(best.hit.point).addScaledVector(right, -best.side * this.pivotPull);
    this._lastSide = best.sideSign;
    this.handSide = best.sideSign > 0 ? -1 : 1;
    this._anchorNormal = best.hit.face?.normal;
    this._showImpactSplat = hasFacade;
    this._beginSwing(origin, flat, currentVelocity);
    if (hasFacade) this._splat.position.copy(this.webEnd);
    if (hasFacade && this._anchorNormal) {
      const n = this._anchorNormal.clone();
      if (n.dot(this._hand.subVectors(this.webEnd, origin)) > 0) n.negate();
      this._splat.quaternion.setFromUnitVectors(this._up, n);
    }

    if (hasFacade) this._spawnImpact(this.webEnd);
    document.dispatchEvent(new CustomEvent('webfired'));
    return true;
  }

  /** Shared start-up for every kind of anchor (facade, sky, aircraft). */
  _beginSwing(origin, flat, currentVelocity) {
    origin.y -= 1.3;
    // Shorten the rope so the bottom of the arc clears the ground instead of dragging along it
    const clearance = this.anchor.y - (origin.y - 0.5) - 1.5;
    // Start at the real distance and reel in smoothly — snapping straight to the shorter rope
    // used to teleport the player upward.
    this.webLength = origin.distanceTo(this.anchor);
    this.targetLength = Math.max(MIN_WEB_LEN, Math.min(this.webLength * 0.92, clearance));

    // Keep momentum and guarantee forward speed so swings feel fast
    this.velocity.copy(currentVelocity);
    const fwd = this.velocity.x * flat.x + this.velocity.z * flat.z;
    if (fwd < MIN_SWING_SPEED) this.velocity.addScaledVector(flat, MIN_SWING_SPEED - fwd);
    this.swingDir = flat.clone();
    this._prevAnchor.copy(this.anchor);

    this.isSwinging = true;
    this._setWebVisible(true);
    if (this._hasEnd) this._splat.position.copy(this.webEnd);
  }

  /** Nearest aircraft in the look direction, for a web that missed every wall. */
  _findAircraft(origin, flat, look) {
    let best = null, bestScore = Infinity;
    for (const a of this.airTargets ?? []) {
      const node = a.node;
      if (!node || !node.visible) continue;
      node.getWorldPosition(this._pivotWorld);
      const rel = this._pivotWorld.clone().sub(origin);
      const dist = rel.length();
      if (dist > MAX_WEB_RANGE + 10 || dist < 12) continue;   // was 120 m
      const flatRel = new THREE.Vector2(rel.x, rel.z).normalize();
      const aim = flatRel.x * flat.x + flatRel.y * flat.z;
      const above = rel.y / Math.max(dist, 1);
      if (aim < 0.2 || above < -0.1) continue;                     // behind you or below the street
      const score = dist * (1.8 - aim) + Math.abs(above - 0.45) * 40;
      if (score < bestScore) { bestScore = score; best = a; }
    }
    return best;
  }

  /** Let go; `fling` adds the launch boost used at the top of a swing. */
  releaseWeb(fling = true) {
    if (!this.isSwinging) return;
    this.isSwinging = false;
    this.attachTarget = null;
    this.twoHandGrip = false;
    this._hasEnd = false;
    this._setWebVisible(false);
    this._showImpactSplat = true;
    this.reelingIn = false;
    if (fling) {
      // A modest pop at the top of the arc; fast swings don't get multiplied further
      const sp = this.velocity.length();
      if (sp < 30) this.velocity.multiplyScalar(1.12);
      this.velocity.y = Math.max(this.velocity.y, 0) + 7;
      const cap = 38, now = this.velocity.length();
      if (now > cap) this.velocity.multiplyScalar(cap / now);
    }
  }

  /** Where the web is drawn to: the facade hit while swinging, else the pivot. */
  get visualEnd() { return this._hasEnd ? this.webEnd : this.anchor; }

  setReelingIn(active) {
    this.reelingIn = active;
  }

  /** Switch the web and impact splat to the symbiote's near-black finish. */
  setDarkWeb(dark) {
    dark = !!dark;
    this._webMat.color.setHex(dark ? 0x111118 : 0xf6f6f2);
    this._webMat.emissive.setHex(dark ? 0x020205 : 0x1a1a1a);
    this._webMat.roughness = dark ? 0.28 : 0.35;
    this._webMat.metalness = dark ? 0.12 : 0;
    this._webMat.needsUpdate = true;
    this._dark = dark;
    if (dark && !this._tendril) this._tendril = new Tendril(this.scene, { radius: 0.07 });
    // the splat becomes a sticky black grab: longer, thicker strands
    for (const k of this._splat.children) if (!k.userData.stud && k.geometry?.type === 'BoxGeometry') k.scale.set(dark ? 1.8 : 1, dark ? 1.6 : 1, dark ? 1.25 : 1);
    if (this._webVisible) this._setWebVisible(true);
    if (this._particles) this._particles.material.color.setHex(dark ? 0x262632 : 0xffffff);
  }

  /**
   * Main update — called every frame.
   * Returns the new world position for the character.
   *
   * @param {number} dt  Delta-time in seconds
   * @returns {THREE.Vector3|null}  New position, or null if not swinging
   */
  update(dt) {
    if (!this.isSwinging) {
      this._tickParticles(dt);
      return null;
    }

    const pos = (this._pos ??= new THREE.Vector3()).copy(this.characterBody.position);
    const v = this.velocity;

    // Moving anchor: carry the player with the aircraft so the rope never stretches or snaps.
    if (this.attachTarget) {
      this._prevAnchor.copy(this.anchor);
      this.attachTarget.getWorldPosition(this.anchor);
      this.anchor.add(this._anchorLocal.clone().applyQuaternion(this.attachTarget.getWorldQuaternion(this._q)));
      this._anchorDelta.subVectors(this.anchor, this._prevAnchor);
      // The aircraft pulls you along, but not so hard that you cannot steer off it.
      pos.addScaledVector(this._anchorDelta, 0.9);
      this.webLength = Math.max(MIN_WEB_LEN, this.webLength - this._anchorDelta.length() * 0.25);
    }

    v.y += GRAVITY * dt;
    v.multiplyScalar(Math.exp(-DRAG * dt));
    // Air resistance that bites at high speed, so momentum can't snowball forever
    let sp = v.length();
    if (sp > SOFT_SPEED) v.multiplyScalar(1 - Math.min(0.5, 0.05 * (sp - SOFT_SPEED) * dt));
    // Steering (world-space, set by the controller). Above the soft cap it only turns you:
    // the part of the push along your current velocity is dropped.
    if (this.steer && this.steer.lengthSq() > 0) {
      const push = this._push ??= new THREE.Vector3();
      push.copy(this.steer).multiplyScalar(STEER_ACCEL * dt);
      sp = v.length();
      if (sp > SOFT_SPEED) {
        const along = push.dot(v) / sp;
        if (along > 0) push.addScaledVector(v, -along / sp);
      }
      v.add(push);
    }
    const toChar = (this._toChar ??= new THREE.Vector3()).subVectors(pos, this.anchor);
    const below = -toChar.y / Math.max(toChar.length(), 1e-3); // 1 = straight under the anchor
    // Pumping: only when you lean into the swing (holding forward), and only up to a normal pace
    const flatV = this._flatV ??= new THREE.Vector3();
    flatV.set(v.x, 0, v.z);
    const flatNorm = (this._flatNorm ??= new THREE.Vector3());
    const leaning = !this.steer || this.steer.lengthSq() === 0 || (flatV.lengthSq() > 1 && this.steer.dot(flatNorm.copy(flatV).normalize()) > -0.2);
    if (below > 0.45 && leaning && v.length() < SOFT_SPEED - 2) v.addScaledVector(flatV.normalize(), PUMP_ACCEL * below * dt);
    // Reeling in costs speed (you're hauling yourself up the line)
    if (this.reelingIn) v.multiplyScalar(Math.exp(-0.2 * dt));
    sp = v.length();
    if (sp > MAX_SPEED) v.multiplyScalar(MAX_SPEED / sp);

    pos.addScaledVector(v, dt);

    if (this.webLength > this.targetLength) this.webLength = Math.max(this.targetLength, this.webLength - 20 * dt);
    if (this.reelingIn) this.webLength = Math.max(this.webLength - REEL_SPEED * dt, MIN_WEB_LEN);

    // Rope constraint: project back onto the sphere and drop outward velocity
    toChar.subVectors(pos, this.anchor);
    const dist = toChar.length();
    if (dist > this.webLength) {
      toChar.divideScalar(dist);
      const radial = v.dot(toChar);
      if (radial > 0) v.addScaledVector(toChar, -radial);
      pos.copy(this.anchor).addScaledVector(toChar, this.webLength);
    }

    // A web only pulls: swinging up over the anchor makes it go slack, so you let go
    // (no more looping round and round a rooftop to wind up speed)
    this.slack = pos.y > this.anchor.y - 0.5;
    // Past the anchor and rising: auto-release at the top of the arc for a fling
    const pastAnchor = (pos.x - this.anchor.x) * v.x + (pos.z - this.anchor.z) * v.z > 0;
    this.atTop = pastAnchor && v.y > 0 && pos.y > this.anchor.y - this.webLength * 0.45;

    // Rope is drawn by the controller (drawWeb) once the character has moved this frame
    this._tickParticles(dt);

    return pos;
  }

  // ─── Web-rope visuals ─────────────────────────────────────────────────────

  _setWebVisible(v) {
    this._webVisible = v;
    if (v) this._shotT = performance.now();
    const t = !!this._dark;                          // symbiote: a living tendril instead of the LEGO rod chain
    this._chain.visible = this._knots.visible = v && !t;
    this._splat.visible = v && this._showImpactSplat;
    for (const k of this._splat.children) if (k.userData.stud) k.visible = !t;
    if (this._tendril) this._tendril.visible = v && t;
  }

  drawWeb() {
    if (this._webVisible) this._updateWebLine(this.characterBody.position);
  }

  _updateWebLine(charPos) {
    if (!this._webVisible) return;
    const hand = this.getHand ? this.getHand(this._hand, this.handSide ?? -1) : this._hand.copy(charPos).setY(charPos.y + 1.3);
    // Two-hand grip still starts the strand at the lead hand: the midpoint of both hands sits
    // inside the head/torso on most rigs, so the web looked like it came out of the head.
    const anchor = this.visualEnd;
    const L = hand.distanceTo(anchor);
    const n = Math.min(this._chainMax, Math.max(2, Math.ceil(L / 0.55)));
    const sag = Math.min(L * 0.035, 2);
    if (this._dark && this._tendril) {
      // Shoots out over ~0.12 s, then writhes gently while holding on
      const now = performance.now(), reach = Math.min(1, (now - (this._shotT ?? 0)) / 120);
      this._tendril.visible = true;
      this._tendril.set(hand, anchor, { time: now / 1000, sag, wobble: reach < 1 ? 1.6 : 0.45, reach, claws: true });
      this._splat.visible = reach >= 1 && this._showImpactSplat;
      return;
    }
    const pt = (t, out) => {
      out.lerpVectors(hand, anchor, t);
      out.y -= sag * (1 - 4 * (t - 0.5) * (t - 0.5));
      return out;
    };
    const a = this._chainA ??= new THREE.Vector3(), b = this._chainB ??= new THREE.Vector3();
    const d = this._chainD ??= new THREE.Vector3(), mid = this._chainMid ??= new THREE.Vector3();
    const one = this._chainOne ??= new THREE.Vector3(1, 1, 1), scale = this._chainScale ??= new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      pt(i / n, a); pt((i + 1) / n, b);
      d.subVectors(b, a);
      const len = d.length();
      this._q.setFromUnitVectors(this._up, d.divideScalar(len || 1));
      mid.addVectors(a, b).multiplyScalar(0.5);
      this._chain.setMatrixAt(i, this._m4.compose(mid, this._q, scale.set(1, len * 0.82, 1)));
      this._knots.setMatrixAt(i, this._m4.compose(a, this._q, one));
    }
    this._chain.count = this._knots.count = n;
    this._chain.instanceMatrix.needsUpdate = true;
    this._knots.instanceMatrix.needsUpdate = true;
  }

  // ─── Impact particle system ───────────────────────────────────────────────

  _buildImpactParticles() {
    const COUNT = 24;
    const geo   = new THREE.BufferGeometry();
    const pos   = new Float32Array(COUNT * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.12, sizeAttenuation: true,
      transparent: true, opacity: 0, toneMapped: false,
    });
    this._particles     = new THREE.Points(geo, mat);
    this._particleVels  = Array.from({ length: COUNT }, () => new THREE.Vector3());
    this._particleTimer = 0;
    this._particleCount = COUNT;
    this.scene.add(this._particles);
  }

  _spawnImpact(point) {
    const pos = this._particles.geometry.attributes.position.array;
    for (let i = 0; i < this._particleCount; i++) {
      pos[i*3]   = point.x;
      pos[i*3+1] = point.y;
      pos[i*3+2] = point.z;
      // Random burst direction
      this._particleVels[i].set(
        (Math.random() - 0.5) * 6,
        Math.random() * 4,
        (Math.random() - 0.5) * 6,
      );
    }
    this._particles.geometry.attributes.position.needsUpdate = true;
    this._particles.material.opacity = 0.9;
    this._particleTimer = 0.5; // seconds until fade
  }

  _tickParticles(dt) {
    if (this._particleTimer <= 0) return;
    this._particleTimer -= dt;
    const t   = Math.max(0, this._particleTimer / 0.5);
    this._particles.material.opacity = t * 0.9;
    const pos = this._particles.geometry.attributes.position.array;
    for (let i = 0; i < this._particleCount; i++) {
      pos[i*3]   += this._particleVels[i].x * dt;
      pos[i*3+1] += this._particleVels[i].y * dt - 9.8 * dt * (0.5 - t * 0.5);
      pos[i*3+2] += this._particleVels[i].z * dt;
    }
    this._particles.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this._chain, this._knots, this._splat);
    this.scene.remove(this._particles);
  }
}
