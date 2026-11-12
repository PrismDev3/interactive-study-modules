/**
 * CharacterController.js
 * Handles:
 *   - GLTF/FBX asset loading with PBR texture assignment
 *   - Keyboard/mouse input
 *   - Ground movement (walk, sprint, crouch, jump)
 *   - Delegation to WebPhysics during swing
 *   - Third-person spring camera
 *   - Handing animation state changes to AnimationManager
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader }  from 'three/addons/loaders/FBXLoader.js';
import { AnimationManager, AnimState } from './AnimationManager.js';
import { HeroRig } from './HeroRig.js?v=63';
import { LegoSpidey } from './LegoSpidey.js?v=183';
import { rigOpts, dressRig, heroOf } from './Characters.js?v=67';
import { applyGear } from './Gear.js?v=65';
import { parseOutfit } from './Outfit.js?v=65';
import { WebPhysics } from './WebPhysics.js?v=82';
import { createSuitMaterial, createEyeMaterial, tickSuitMaterial, setEyeGlow } from './SuitMaterial.js';

// ── Movement constants ────────────────────────────────────────────────────
const WALK_SPEED    = 7;
const SPRINT_SPEED  = 18;
const CROUCH_SPEED  = 3.5;
const JUMP_FORCE    = 14;
const GRAVITY       = -30;
const CAMERA_SPRING = 8;    // camera lag (higher = snappier)
const CAM_DIST      = 4.5;  // follow distance
const CAM_HEIGHT    = 1.8;  // height offset above character

// ── Bone name mappings (customize for your rig) ───────────────────────────
const BONE_EYES        = ['Eye_L', 'Eye_R', 'eye_l', 'eye_r'];
const BONE_WEB_SHOOTER = ['WebShooter_L', 'WebShooter_R', 'webshooter_l', 'webshooter_r'];

// Fold Iron Spider's four decorative waldoes against the pack during a two-hand hold,
// so they don't read as extra arms flailing around the actual web grip.
function poseWaldoGrip(rig, dt, holdingWithBothHands) {
  const k = 1 - Math.exp(-10 * dt);
  for (const w of rig?.waldo ?? []) {
    if (!w.leg) continue;
    const fold = w.fold = (w.fold ?? 0) + ((holdingWithBothHands ? 1 : 0) - (w.fold ?? 0)) * k;
    const top = w.leg.position.y > 1.1;
    const idleX = w.leg.rotation.x, idleZ = w.leg.rotation.z;
    w.leg.rotation.x = idleX * (1 - fold);
    w.leg.rotation.y = w.s * 1.45 * fold;
    w.leg.rotation.z = idleZ * (1 - fold) - w.s * (top ? 0.85 : -0.65) * fold;
    w.leg.scale.setScalar(1 - fold * 0.86);
  }
}

export class CharacterController {
  constructor(scene, camera, loadingCallback) {
    this.scene    = scene;
    this.camera   = camera;
    this.onProgress = loadingCallback || (() => {});

    // The root Object3D for the character
    this.root = new THREE.Object3D();
    scene.add(this.root);

    // Physics state
    this.velocity    = new THREE.Vector3();
    this.isGrounded  = false;
    this.isCrouching = false;
    this.isSprinting = false;

    // Camera spring state
    this._camTarget  = new THREE.Vector3();
    this._camCurrent = new THREE.Vector3();
    this._yaw   = 0;    // horizontal look angle (radians)
    this._pitch = -0.2; // vertical look angle

    // All collidable surfaces (web-swing targets)
    this.collisionMeshes = [];
    // City meshes only (for wall + ground collision — excludes character self-meshes)
    this.cityMeshes  = [];
    // Meshes used for downward ground raycast
    this.groundMeshes = [];
    // Pre-allocated to avoid per-frame allocations
    this._groundRaycaster = new THREE.Raycaster();
    this._groundRaycaster.far = 5;
    this._downDir = new THREE.Vector3(0, -1, 0);
    // Wall collision
    this._wallRaycaster = new THREE.Raycaster();
    this._wallRaycaster.far = 0.55;
    this._wallRaycaster.firstHitOnly = true;
    // Wall climbing
    this.isClimbing = false;
    this._wallNormal = new THREE.Vector3();
    this._climbCooldown = 0;
    this._climbJump = false;
    // Wall running: glancing into a facade at speed runs along it instead of grabbing on
    this.isWallRun = false;
    this._wallRunNormal = new THREE.Vector3();
    this._wallRunTangent = new THREE.Vector3();
    this._wallRunSide = 1;
    this._wallRunTime = 0;
    this._wallRunSpeed = 0;
    this._wallRunCooldown = 0;
    this._climbRay = new THREE.Raycaster();
    this._climbRay.firstHitOnly = true;
    this._wallDirs = [
      new THREE.Vector3( 1, 0,  0),
      new THREE.Vector3(-1, 0,  0),
      new THREE.Vector3( 0, 0,  1),
      new THREE.Vector3( 0, 0, -1),
      new THREE.Vector3( 1, 0,  1).normalize(),
      new THREE.Vector3(-1, 0,  1).normalize(),
      new THREE.Vector3( 1, 0, -1).normalize(),
      new THREE.Vector3(-1, 0, -1).normalize(),
    ];
    this._sweepDir = new THREE.Vector3();
    this._sweepO = new THREE.Vector3();

    // Void guard: a seam in the merged city, or walking off the map edge, leaves nothing
    // below the player to land on. Remember the last solid footing and recover from that.
    this._safe = new THREE.Vector3();
    this._safeSet = false;
    this._home = null;
    this._voidT = 0;
    this._voidFalls = 0;
    this._groundedT = 0;
    this._depthRay = Object.assign(new THREE.Raycaster(), { firstHitOnly: true });

    // Input map
    this._keys = {};
    this._touchMove = false;
    this._bindInput();

    // Pointer lock
    this._setupPointerLock();

    // Build stamp: tells you at a glance whether this tab is running the patched controller
    console.log('[CC] controller build r37 (void guard)');
  }

  // ─── Asset loading ────────────────────────────────────────────────────────

  async loadCharacter(glbPath, texturePaths = {}) {
    // No standalone GLB: build the LEGO minifig rig straight away (skips a guaranteed 404)
    if (!glbPath) {
      await this._buildPlaceholder();
      this.onProgress(1, 'Ready');
      return;
    }
    const loader = new GLTFLoader();
    this.onProgress(0.1, 'Loading character model...');

    let gltf;
    try {
      gltf = await new Promise((res, rej) =>
        loader.load(glbPath, res, e => this.onProgress(e.loaded / e.total * 0.6, 'Loading model...'), rej)
      );
    } catch (err) {
      console.warn('[CharacterController] GLB not found, using placeholder:', err.message);
      await this._buildPlaceholder();
      this.onProgress(1, 'Ready (placeholder)');
      return;
    }

    this.onProgress(0.65, 'Processing textures...');
    const model = gltf.scene;
    model.scale.setScalar(1);
    this.root.add(model);

    // Load and assign PBR textures
    const texLoader = new THREE.TextureLoader();
    const loadTex = (path, encoding = THREE.SRGBColorSpace) => {
      if (!path) return null;
      const t = texLoader.load(path);
      t.colorSpace = encoding;
      return t;
    };

    const albedo    = loadTex(texturePaths.albedo);
    const normal    = loadTex(texturePaths.normal,    THREE.LinearSRGBColorSpace);
    const roughness = loadTex(texturePaths.roughness, THREE.LinearSRGBColorSpace);
    const metallic  = loadTex(texturePaths.metallic,  THREE.LinearSRGBColorSpace);

    const suitMat = createSuitMaterial({ albedoMap: albedo, normalMap: normal, roughnessMap: roughness, metallicMap: metallic });
    const eyeMat  = createEyeMaterial(0xffffff);

    // Apply materials by mesh name convention
    model.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow    = true;
      node.receiveShadow = true;

      const name = node.name.toLowerCase();
      if (name.includes('eye') || name.includes('lens')) {
        node.material = eyeMat;
      } else if (name.includes('web') && name.includes('shoot')) {
        node.material = createEyeMaterial(0xff4400);
      } else {
        node.material = suitMat;
      }
    });

    this._suitMat = suitMat;

    // Set up animations
    const mixer = new THREE.AnimationMixer(model);
    this.anim   = new AnimationManager(gltf.animations, mixer);

    // Store collidable meshes for web targeting
    model.traverse(n => { if (n.isMesh) this.collisionMeshes.push(n); });

    this.onProgress(0.9, 'Initializing physics...');
    this._initPhysics();
    this.onProgress(1.0, 'Ready');
  }

  async _buildPlaceholder() {
    try {
      const suit = parseOutfit(this.variant).suit;
      this.rig = dressRig(await new LegoSpidey(this._suitOpts()).load(), suit);
      if (!heroOf(suit)) applyGear(this.rig, parseOutfit(this.variant).gear);
    } catch (err) {
      console.warn('[CharacterController] LEGO minifig failed, using generated rig:', err.message);
      this.rig = new HeroRig();
    }
    this.root.add(this.rig.root);
    this._webHand = this.rig.handWorld ? (v, side) => this.rig.handWorld(v, side) : null;
    this.anim = null;
    this._initPhysics();
  }

  /** Pick a trick for a web release: big upward fling = backflip, very fast = corkscrew, sometimes a frontflip. */
  _startTrick(bonus = 0) {
    if (this.noPowers) return;   // no flips for an ordinary kid
    const v = this.velocity, flat = Math.hypot(v.x, v.z);
    if (v.y < -4 && flat < 8) return; // dropping straight down: no trick
    const now = performance.now() / 1000;
    const since = now - (this._trickAt ?? -99);
    // Real flips are earned: a strong release, and not more than one every ~5 s. Otherwise strike a pose.
    const energy = flat / 25 + Math.max(0, v.y) / 12 + bonus;
    const flip = since > 5 && Math.random() < Math.min(0.75, 0.15 + energy * 0.35);
    let type, dur;
    if (flip) {
      const pool = ['backflip', 'frontflip', 'sideflip'];
      if (flat > 18) pool.push('corkscrew', 'barrelroll');
      if (v.y > 9 && flat > 14) pool.push('double');
      do type = pool[Math.floor(Math.random() * pool.length)]; while (type === this._lastTrick && pool.length > 1);
      dur = { corkscrew: 0.75, double: 1.05, barrelroll: 0.7 }[type] ?? 0.8;
      this._trickAt = now;
    } else {
      if (since < 1.2) return;          // just did something: let him simply fly
      const pool = ['spread', 'reach', 'dive', 'hang'];
      do type = pool[Math.floor(Math.random() * pool.length)]; while (type === this._lastTrick);
      dur = 0.9 + Math.random() * 0.4;
    }
    this._lastTrick = type;
    this.trick = { type, t: 0, dur };
  }

  /** Body tilt along the web line: [pitch towards the anchor, sideways roll], in the figure's frame. */
  _ropeTilt() {
    const a = this.webPhysics.visualEnd ?? this.webPhysics.anchor, p = this.root.position;   // lean toward the visible web
    const dx = a.x - p.x, dy = a.y - (p.y + 1.2), dz = a.z - p.z;
    const yaw = this.root.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw);
    const fwd = dx * fx + dz * fz, side = dx * fz - dz * fx;
    return [Math.atan2(fwd, Math.max(dy, 0.1)), Math.atan2(side, Math.max(dy, 0.1))];
  }

  _suitOpts() { return rigOpts(parseOutfit(this.variant).suit); }

  /** The current playable hero's data (Characters.js), Spider-Man when wearing a suit. */
  get hero() { return heroOf(parseOutfit(this.variant).suit); }

  /** Flat facing direction. */
  faceDir() { return new THREE.Vector3(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y)); }

  /** Goblin glider on/off. */
  setFlying(on) {
    if (on && !this.hero?.move.glider) return;
    this.flying = !!on;
    if (on) {
      if (this.webPhysics?.isSwinging) this.webPhysics.releaseWeb(false);
      this.isClimbing = this.isWallRun = this.isPerched = false;
      this.isGrounded = false;
      this.velocity.y = Math.max(this.velocity.y, 5);
    }
  }

  /** Glider flight: WASD camera-relative, Space up, C down, Shift boosts. Bumps off walls and ground. */
  _updateFlight(dt) {
    const k = this._keys, pos = this.root.position;
    const dir = new THREE.Vector3((k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), 0, (k.KeyS ? 1 : 0) - (k.KeyW ? 1 : 0));
    // Shift = HubFlyingSuperSonic from the source game: a big top-speed boost
    const fast = k.ShiftLeft || k.ShiftRight, top = fast ? 55 : 19;
    if (dir.lengthSq()) dir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this._yaw);
    const a = Math.min(1, dt * 2.5);
    this.velocity.x += (dir.x * top - this.velocity.x) * a;
    this.velocity.z += (dir.z * top - this.velocity.z) * a;
    const up = (k.Space ? 1 : 0) - (k.KeyC ? 1 : 0);
    if (this.noseDive > 0) {
      // HubFlyingNoseDive: plunge steeply; the hero's onLand hook fires the impact
      this.noseDive -= dt;
      this.velocity.y = -38;
    } else this.velocity.y += ((up * 10) - this.velocity.y) * Math.min(1, dt * 3);
    if (this.velocity.y > 0) this._sweepUp(pos, this.velocity.y * dt); else pos.y += this.velocity.y * dt;
    this._sweepHorizontal(pos, this.velocity.x * dt, this.velocity.z * dt);
    this._resolveWalls(pos);
    const gY = this._getGroundY(pos, pos.y + 1);
    if (pos.y < gY + 1.1) {
      pos.y = gY + 1.1; if (this.velocity.y < 0) this.velocity.y = 0;
      if (this.noseDive > 0) { this.noseDive = 0; this.onNoseDiveLand?.(pos.clone()); }
    }
    const flat = Math.hypot(this.velocity.x, this.velocity.z);
    if (flat > 1) this.root.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
    pos.y += Math.sin(performance.now() / 300) * 0.004;      // hover bob
  }

  /** The symbiote suit uses black webbing rather than the classic white formula. */
  _darkWebs() {
    return parseOutfit(this.variant).suit === 'symbiote' || this.rig?.npc?.variant === 'symbiote' || !!this.hero?.move.darkWebs;
  }

  /** Swap Spider-Man's suit live. */
  async setVariant(key) {
    this.variant = key;
    const suit = parseOutfit(key).suit;
    const rig = dressRig(await new LegoSpidey(this._suitOpts()).load(), suit);
    if (this.variant !== key) return; // a newer pick arrived while loading
    if (!heroOf(suit)) applyGear(rig, parseOutfit(key).gear);
    if (!heroOf(suit)?.move.glider) this.flying = false;
    this.root.remove(this.rig.root);
    this.rig = rig;
    this.root.add(rig.root);
    this._webHand = (v, side) => this.rig.handWorld(v, side);
    if (this.webPhysics) {
      this.webPhysics.getHand = this._webHand;
      this.webPhysics.setDarkWeb(this._darkWebs());
    }
    document.dispatchEvent(new CustomEvent('outfitchange', { detail: key }));   // HUD portrait follows story/locker swaps
  }

  _tickRig(dt) {
    if (!this.rig) return;
    const k = this._keys;
    const webSwinging = !!this.webPhysics?.isSwinging;
    const twoHandGrip = webSwinging && !!this.webPhysics?.twoHandGrip;
    this.rig.update(dt, {
      speed: this.flying ? 0 : Math.hypot(this.velocity.x, this.velocity.z),
      sprint: this.isSprinting,
      grounded: this.isGrounded || this.isPerched || !!this.flying,
      crouch: this.isCrouching,
      climbing: this.isClimbing,
      climbMove: (k.KeyW || k.KeyS || k.KeyA || k.KeyD || k.ArrowUp || k.ArrowDown || k.ArrowLeft || k.ArrowRight) ? 1 : 0,
      swinging: webSwinging || !!this.perchZip,
      twoHandGrip,
      vy: this.velocity.y,
      attack: this.attackT ?? 0,
      webArm: this.webPhysics?.handSide ?? -1,
      attackArm: this.attackArm,
      slam: this.slamming,
      hurt: this.hurtT ?? 0,
      emote: this.emote,
      trick: this.trick ? { type: this.trick.type, p: Math.min(1, this.trick.t / this.trick.dur) } : null,
      rope: this.webPhysics?.isSwinging ? this._ropeTilt() : null,
      wallRun: this.isWallRun ? this._wallRunSide : 0,
      fallStyle: this._fallStyle && !this.isGrounded && !this.webPhysics?.isSwinging && !this.isClimbing && !this.isWallRun && !this.trick ? this._fallStyle : null,
      land: this.isPerched ? { kind: 'perch', p: 0.4 } : this.landT > 0 ? { kind: this.landKind, p: 1 - this.landT / this.landDur } : null,
    });
    poseWaldoGrip(this.rig, dt, twoHandGrip);
  }

  /** World position of a web-shooting hand, safe to call before the rig has loaded. */
  webHandWorld(target, side = -1) {
    if (this.rig?.handWorld) return this.rig.handWorld(target, side);
    // Never fall back to a head-height point (that is what made web shots look like they came
    // out of the mask): use the shoulder line of the character root instead.
    return target.copy(this.root.position).add({ x: side * 0.28, y: 1.0, z: 0 });
  }

  /** Aircraft that a web may attach to (SceneSetup builds them). */
  setAirTargets(list) {
    if (this.webPhysics) this.webPhysics.airTargets = list ?? [];
  }

  _initPhysics() {
    this.root.userData.velocity = this.velocity;
    this.webPhysics = new WebPhysics(this.scene, this.camera, this.root);
    this.webPhysics.velocity = this.velocity; // shared so swing momentum carries over
    if (this._webHand) this.webPhysics.getHand = this._webHand;
    this.webPhysics.setDarkWeb(this._darkWebs());
  }

  /**
   * Add all Mesh children of obj to the web-swing raycaster target list.
   * Call this after the city (or any collidable geometry) has loaded.
   */
  addCollisionRoot(obj) {
    // Materials that form walkable horizontal surfaces
    const FLOOR_MATS = new Set([
      'concrete','limestone','granite','grass','deck',
      'toy_lgray','toy_dgray','toy_tan','toy_sandstone','bridge_blue',
    ]);
    obj.traverse(n => {
      if (!n.isMesh) return;
      this.collisionMeshes.push(n); // web-swing targets: everything
      this.cityMeshes.push(n);      // city only (wall + ground raycasts)

      const mat = Array.isArray(n.material) ? n.material[0] : n.material;
      const name = mat?.name?.toLowerCase() ?? '';
      // Ground ray: skip glass, windows, cars, lamps, trees
      if (FLOOR_MATS.has(name) || name === '') this.groundMeshes.push(n);
    });
    console.log(`[CC] collision=${this.collisionMeshes.length}  city=${this.cityMeshes.length}  ground=${this.groundMeshes.length}`);
  }

  /**
   * Move horizontally by (dx, dz), stopping short of walls and sliding along them.
   * Rays start from the pre-move position, so fast movement can't skip past a wall.
   */
  /**
   * Move up by dy, stopping under any ceiling, ledge or overhang (head ~1.4 m above the origin).
   * Without this, a swing or jump that rises into an overhang passes straight through it.
   */
  _sweepUp(pos, dy) {
    if (dy <= 0 || !this.cityMeshes.length) { pos.y += dy; return false; }
    const rc = this._upRay ??= Object.assign(new THREE.Raycaster(), { firstHitOnly: true });
    for (const [ox, oz] of [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) {
      rc.set(this._sweepO.set(pos.x + ox, pos.y + 1.0, pos.z + oz), this._up ??= new THREE.Vector3(0, 1, 0));
      rc.far = dy + 0.5;
      const hit = rc.intersectObjects(this._solids(), false)[0];
      if (hit) {
        pos.y += Math.max(0, hit.distance - 0.5);
        if (this.velocity.y > 0) this.velocity.y = 0;
        return true;
      }
    }
    pos.y += dy;
    return false;
  }

  _sweepHorizontal(pos, dx, dz) {
    const SKIN = 0.45;
    for (let iter = 0; iter < 2; iter++) {
      const len = Math.hypot(dx, dz);
      if (len < 1e-5) return;
      if (!this.cityMeshes.length) { pos.x += dx; pos.z += dz; return; }
      const dir = this._sweepDir.set(dx / len, 0, dz / len);
      this._wallRaycaster.far = len + SKIN;
      let best = null;
      // The body is ~0.7 m wide: sweep from its centre and both shoulders, so building
      // corners can't slip past the middle ray and swallow you at swing speed
      const sx = -dir.z * 0.32, sz = dir.x * 0.32;
      const reach = len + SKIN + 0.4;
      const cand = this._solidsInBox(this._sweepList ??= [],
        Math.min(pos.x, pos.x + dir.x * reach) - 0.4, pos.y - 0.05, Math.min(pos.z, pos.z + dir.z * reach) - 0.4,
        Math.max(pos.x, pos.x + dir.x * reach) + 0.4, pos.y + 1.45, Math.max(pos.z, pos.z + dir.z * reach) + 0.4);
      if (!cand.length) { pos.x += dx; pos.z += dz; return; }
      for (const h of [0.0, 0.8, 1.4]) for (const s of [0, 1, -1]) {
        if (s && h === 0.0) continue;
        this._wallRaycaster.ray.origin.set(pos.x + sx * s, pos.y + h, pos.z + sz * s);
        this._wallRaycaster.ray.direction.copy(dir);
        const hit = this._wallRaycaster.intersectObjects(cand, false)[0];
        if (hit?.face && Math.abs(hit.face.normal.y) < 0.7 && (!best || hit.distance < best.distance)) best = hit;
      }
      if (!best) { pos.x += dx; pos.z += dz; return; }

      const allowed = Math.max(0, best.distance - SKIN);
      pos.x += dir.x * allowed;
      pos.z += dir.z * allowed;

      let nx = best.face.normal.x, nz = best.face.normal.z;
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl; nz /= nl;
      if (nx * dir.x + nz * dir.z > 0) { nx = -nx; nz = -nz; }
      this._sweepHit = { nx, nz, into: -(this.velocity.x * nx + this.velocity.z * nz) };

      const vd = this.velocity.x * nx + this.velocity.z * nz;
      if (vd < 0) { this.velocity.x -= nx * vd; this.velocity.z -= nz * vd; }

      // Slide the leftover distance along the wall
      const rem = len - allowed;
      dx = dir.x * rem; dz = dir.z * rem;
      const d = dx * nx + dz * nz;
      dx -= nx * d; dz -= nz * d;
    }
  }

  /**
   * Push character out of any wall surfaces within skin distance (0.45m).
   * Casts 4 horizontal rays; cancels velocity into the wall.
   */
  _resolveWalls(pos) {
    if (this.cityMeshes.length === 0) return;
    const SKIN = 0.45;
    this._wallRaycaster.far = SKIN + 0.1;
    // 24 rays against every solid cost ~2.3 ms/frame (per-mesh setup on each big city cell). Keep only
    // meshes whose world box touches the player's reach; static city boxes are cached, platforms move.
    const near = this._nearSolids(pos, SKIN + 0.15, 1.6);
    if (!near.length) return;
    for (const dir of this._wallDirs) {
      let near = Infinity;
      for (const h of [0.1, 0.8, 1.5]) {
        this._wallRaycaster.ray.origin.set(pos.x, pos.y + h, pos.z);
        this._wallRaycaster.ray.direction.copy(dir);
        const hit = this._wallRaycaster.intersectObjects(this._nearList, false)[0];
        if (hit && hit.distance < near) near = hit.distance;
      }
      if (near < SKIN) {
        const pen = SKIN - near;
        pos.x -= dir.x * pen;
        pos.z -= dir.z * pen;
        // Cancel the velocity component pushing into the wall
        const dot = dir.x * this.velocity.x + dir.z * this.velocity.z;
        if (dot > 0) {
          this.velocity.x -= dir.x * dot;
          this.velocity.z -= dir.z * dot;
        }
      }
    }
  }

  /** Raycast down from the character's waist. Returns nearest surface Y, or 0. */
  // Casts from above the higher of the old/new height so a fast fall can't skip the floor.
  /** City plus moving platforms (car roofs) — anything you can stand on or bump into. */
  setPlatforms(meshes) {
    this.platforms = meshes;
    this._solidCache = null;
  }

  /** Solids whose world AABB overlaps a box of half-width `r`, height `hgt` at `pos`. Reuses one array. */
  _nearSolids(pos, r, hgt) {
    return this._solidsInBox(this._nearList ??= [], pos.x - r, pos.y - 0.05, pos.z - r, pos.x + r, pos.y + hgt, pos.z + r);
  }

  /** Fill `out` with solids whose cached world AABB overlaps the given box (rays can't hit anything else). */
  _solidsInBox(out, x0, y0, z0, x1, y1, z1) {
    out.length = 0;
    const q = (this._nearQ ??= new THREE.Box3());
    q.min.set(x0, y0, z0);
    q.max.set(x1, y1, z1);
    for (const m of this._solids()) {
      // Cached world box, refreshed whenever the mesh's world matrix changes (car roofs, moved sets)
      const e = m.matrixWorld.elements, u = m.userData;
      let b = u._wbox;
      if (!b || u._wx !== e[12] || u._wy !== e[13] || u._wz !== e[14] || u._wr !== e[0] + e[2] * 7 + e[5] * 13) {
        const g = m.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        b = (u._wbox ??= new THREE.Box3()).copy(g.boundingBox).applyMatrix4(m.matrixWorld);
        u._wx = e[12]; u._wy = e[13]; u._wz = e[14]; u._wr = e[0] + e[2] * 7 + e[5] * 13;
      }
      if (b.intersectsBox(q)) out.push(m);
    }
    return out;
  }

  _solids() {
    // Rebuilt whenever solids are added or removed later (cage ring, mission sets), not cached forever
    const n = this.cityMeshes.length + (this.platforms?.length ?? 0);
    const last = this.cityMeshes[this.cityMeshes.length - 1];
    if (!this._solidCache || this._solidN !== n || this._solidLast !== last) {
      this._solidCache = this.cityMeshes.concat(this.platforms ?? []); this._solidN = n; this._solidLast = last;
    }
    return this._solidCache;
  }

  _getGroundY(pos, fromY = pos.y) {
    const meshes = this.cityMeshes.length ? this._solids() : this.groundMeshes;
    if (meshes.length === 0) return -Infinity;
    const rc = this._groundRaycaster;
    const top = Math.max(fromY, pos.y) + 1.5;
    rc.ray.direction.copy(this._downDir);
    rc.far = top - pos.y + 3;
    rc.firstHitOnly = true;
    // Only meshes under the feet (incl. the 0.5 m fallback ring) down to the ray's reach
    const cand = meshes === this.groundMeshes ? meshes : this._solidsInBox(this._groundList ??= [],
      pos.x - 0.6, top - rc.far - 0.05, pos.z - 0.6, pos.x + 0.6, top + 0.05, pos.z + 0.6);
    const probe = (x, z) => {
      rc.ray.origin.set(x, top, z);
      return rc.intersectObjects(cand, false)[0];
    };
    let hit = probe(pos.x, pos.z);
    // A foot over a seam, or a slab that is a single triangle wide, misses the centre ray.
    // Sample around the body before calling it a hole, and only accept a step-height match
    // so a neighbouring roof or a ledge below can't teleport the player.
    if (!hit) {
      for (const [ox, oz] of [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3],
                              [0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]]) {
        const h = probe(pos.x + ox, pos.z + oz);
        if (h && Math.abs(h.point.y - pos.y) < 1.2) { hit = h; break; }
      }
    }
    this._groundObj = hit?.object ?? null;
    if (hit) {
      // What we're standing on (material name, or its colour) — drives footstep particles and sounds
      const m = hit.object.material, mat = Array.isArray(m) ? m[hit.face?.materialIndex ?? 0] : m;
      this.groundKind = mat?.name || '';
      this.groundColor = mat?.color ? mat.color.getHex() : 0xb4ada2;
    }
    return hit ? hit.point.y : -Infinity;
  }

  /** Where a void recovery drops the player when the last footing is no longer usable. */
  setHome(v) { this._home = v.clone(); }

  _markSafe(pos) {
    this._safe.copy(pos);
    this._safeSet = true;
  }

  /** Straight-down distance to the nearest surface, or Infinity when nothing is under us. */
  _depthBelow(pos) {
    const meshes = this.cityMeshes.length ? this._solids() : this.groundMeshes;
    if (!meshes.length) return Infinity;
    this._depthRay.ray.origin.set(pos.x, pos.y + 1, pos.z);
    this._depthRay.ray.direction.copy(this._downDir);
    this._depthRay.far = 800;
    const hit = this._depthRay.intersectObjects(meshes, false)[0];
    return hit ? hit.distance : Infinity;
  }

  /**
   * Under the city there is no floor to reach, so falling through a seam or off the map
   * edge used to mean dropping forever. Once nothing is below for half a second, put the
   * player back on the last solid footing (the spawn after repeated falls).
   */
  _checkVoid(dt) {
    if (!this.cityMeshes.length) return;
    const pos = this.root.position;
    if (!Number.isFinite(pos.y)) { this._recoverFromVoid(); return; }
    if (this.isGrounded) {
      this._voidT = 0;
      // Standing still for a few seconds clears the counter, so a later fall still gets
      // the near-footing recovery rather than jumping straight back to the spawn.
      this._groundedT += dt;
      if (this._groundedT > 3) this._voidFalls = 0;
      return;
    }
    this._groundedT = 0;
    if (this.velocity.y >= -1) { this._voidT = 0; return; }
    if (this._depthBelow(pos) > 600) this._voidT += dt;
    else this._voidT = 0;
    if (this._voidT > 0.5) this._recoverFromVoid();
  }

  _recoverFromVoid() {
    const pos = this.root.position;
    this._voidT = 0;
    this._groundedT = 0;
    this._voidFalls += 1;
    if (this.webPhysics?.isSwinging) this.webPhysics.releaseWeb(false);
    this.isClimbing = false;
    if (this.isWallRun) this._endWallRun();
    this.trick = null;
    this.velocity.set(0, 0, 0);
    const spot = (this._voidFalls <= 2 && this._safeSet) ? this._safe : (this._home ?? this._safe);
    if (spot) pos.copy(spot); else pos.set(483, 3.1, 1473);
    this.isGrounded = true;
    this._setAnimState(AnimState.LAND);
    console.warn('[CC] Fell out of the world — recovered', this._voidFalls,
                 'at', pos.x.toFixed(1), pos.y.toFixed(1), pos.z.toFixed(1));
  }

  // ─── Input binding ────────────────────────────────────────────────────────

  _bindInput() {
    const typing = e => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    document.addEventListener('keydown', e => {
      if (typing(e)) return;
      if (e.code === 'Space' && !e.repeat && (this.isClimbing || this.isWallRun)) this._climbJump = true;
      if (e.code === 'Space' && !e.repeat && this.webPhysics?.isSwinging) this._swingJump = true;
      if (e.code === 'Space' && !e.repeat && this.isPerched) this._perchLaunch = true;
      if (e.code === 'KeyQ' && !e.repeat) this._zipPressed = true;
      this._keys[e.code] = true;
      // One web per press: holding the button must not auto-chain across the city.
      if (e.code === 'KeyE' && !e.repeat) this._handleWebFire();
    });
    // Key releases are caught on window in the capture phase, so nothing (chat box, menus)
    // can swallow them and leave a key "held" — the classic walking-by-itself bug.
    window.addEventListener('keyup', e => {
      this._keys[e.code] = false;
      if (e.code === 'KeyE' && this.webPhysics?.isSwinging) {
        // Letting go is an immediate drop: no upward fling, no one-second trick pose.
        this.webPhysics.releaseWeb(false);
        this._setAnimState(AnimState.FALL);
      }
    }, true);
    window.addEventListener('mouseup', e => {
      if (e.button === 0) {
        this._lmb = false;
        if (this.webPhysics?.isSwinging) { this.webPhysics.releaseWeb(false); this._setAnimState(AnimState.FALL); }
      }
      if (e.button === 2) this._rmbDrag = false;
    }, true);

    // Anything that takes focus away from the game lets go of every key and button
    const releaseAll = () => { this._keys = {}; this._lmb = false; this._rmbDrag = false; };
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
    document.addEventListener('focusin', e => { if (typing(e) || e.target instanceof HTMLButtonElement) releaseAll(); });
    document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) this._lmb = false; });
    this.releaseAll = releaseAll;
  }

  /**
   * Phone stick: writes the same movement flags the keyboard writes, so climbing, wall runs,
   * sprinting and the animator all behave exactly as they do with WASD.
   */
  setTouchMove(x, y, sprint = false) {
    const k = this._keys;
    const on = Math.hypot(x, y) > 0.01;
    k.KeyW = on && y < -0.35;
    k.KeyS = on && y > 0.35;
    k.KeyA = on && x < -0.35;
    k.KeyD = on && x > 0.35;
    k.ShiftLeft = on && sprint;
    this._touchMove = on;
  }

  /** Phone look: the same yaw/pitch the mouse drives, scaled for a thumb drag. */
  lookBy(dx, dy) {
    const sens = 0.0034 * (this.sensitivity ?? 1);
    if (Math.abs(dx) + Math.abs(dy) > 0) this._lastLook = performance.now();
    this._yaw -= dx * sens;
    this._pitch = Math.max(-0.6, Math.min(0.5, this._pitch + dy * sens));
  }

  _setupPointerLock() {
    // The game canvas specifically: the menu also has canvases (the 3D suit preview) earlier in the page
    const canvas = document.querySelector('#canvas-container canvas');
    if (!canvas) return;
    // Phones drive look and actions through TouchControls; a pointer lock would only fight it.
    if (document.documentElement.classList.contains('touch')) return;
    canvas.addEventListener('click', () => { try { canvas.requestPointerLock()?.catch?.(() => {}); } catch (e) {} });   // refused lock (unfocused frame, mid-reload) is harmless
    canvas.addEventListener('contextmenu', e => {
      e.preventDefault();
      // RMB normally arrives through mousedown; this is a fallback for browsers that fire
      // contextmenu before/without the button-2 mousedown while pointer-locked.
      this.portalGun?.tryFire(2);
    });
    // A real right-click menu elsewhere steals focus mid-press; right-drag on the game is fine
    window.addEventListener('contextmenu', e => { if (e.target !== canvas) this.releaseAll?.(); });
    canvas.addEventListener('mousedown', e => {
      // An equipped portal gun owns both mouse buttons; holstering it restores web-swing and right-drag.
      if (e.button === 2) {
        // Pass the raw MouseEvent button (2), not a slot index: this was why RMB fired blue.
        if (this.portalGun?.tryFire(e.button)) { e.preventDefault(); return; }
        this._rmbDrag = true;
      }
      if (e.button === 0) {
        if (this.portalGun?.tryFire(e.button)) { e.preventDefault(); return; }
        this._lmb = true;
        if (document.pointerLockElement) this._handleWebFire();
      }
    });
    document.addEventListener('mousemove', e => {
      if (!document.pointerLockElement && !this._rmbDrag) return;
      const sens = 0.002 * (this.sensitivity ?? 1);
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) this._lastLook = performance.now();
      this._yaw   -= e.movementX * sens;
      this._pitch  = Math.max(-0.6, Math.min(0.5, this._pitch + e.movementY * sens));
    });
  }

  _handleWebFire() {
    if (!this.webPhysics || this.hero?.move.swing === false || this.flying || this.noWebs) return;
    if (this.webPhysics.isSwinging) return;
    const hit = this.webPhysics.fireWeb(this.cityMeshes.length ? this.cityMeshes : this.collisionMeshes, this.velocity);
    if (hit) {
      // Alternate grips so the two-hand pose is easy to see and still leaves one-hand swings.
      // The same flag drives the animator, rope origin, and multiplayer state.
      this._swingNo = (this._swingNo ?? 0) + 1;
      this.webPhysics.twoHandGrip = this._swingNo % 2 === 1;
      this.isClimbing = false;
      this.isGrounded = false;      // the web is pulling you off the ground
      this._setAnimState(AnimState.WEB_SHOOT);
      if (this._suitMat) setEyeGlow(this._suitMat, 2.5);
    }
  }

  // ─── Per-frame update ─────────────────────────────────────────────────────

  update(dt) {
    if (!this.webPhysics) return;
    // Cutscenes / respawn: run physics and animation with no player input
    if (this.inputLocked) {
      const keys = this._keys, lmb = this._lmb;
      this._keys = {}; this._lmb = false;
      try { this._update(dt); } finally { this._keys = keys; this._lmb = lmb; }
      return;
    }
    this._update(dt);
  }

  _update(dt) {
    if (this.cinematic) {
      // Hold the actor at the cutscene mark; input lock alone still let gravity and swing drift
      // pull the player through the floor while dialogue was on screen.
      this.velocity.set(0, 0, 0);
      this.isGrounded = true;
      this.isClimbing = false;
      this.isWallRun = false;
      this.isPerched = false;
      this.flying = false;
      this.trick = null;
      this._updateCamera(dt);
      this._updateHUD();
      if (this.anim) this.anim.update(dt);
      else this._tickRig(dt);
      this.root.updateMatrixWorld(true);
      this.webPhysics.drawWeb();
      if (this._suitMat) tickSuitMaterial(this._suitMat, dt);
      this.webPhysics.setReelingIn(false);
      return;
    }
    // Air tricks run their course (even into the next swing) and stop when you land or grab a wall
    if (this.trick) {
      this.trick.t += dt;
      const pose = ['spread', 'reach', 'dive', 'hang'].includes(this.trick.type);
      if (this.trick.t >= this.trick.dur || this.isGrounded || this.isClimbing || (pose && this.webPhysics?.isSwinging)) this.trick = null;
    }
    // Any movement, jump or web cancels an emote
    if (this.emote) {
      const k = this._keys;
      if (k.KeyW || k.KeyA || k.KeyS || k.KeyD || k.Space || k.ArrowUp || k.ArrowDown || k.ArrowLeft || k.ArrowRight
          || this.webPhysics.isSwinging || this.isClimbing || !this.isGrounded || (this.attackT ?? 0) > 0) this.emote = null;
    }

    this._climbCooldown = Math.max(0, this._climbCooldown - dt);
    this._wallRunCooldown = Math.max(0, this._wallRunCooldown - dt);
    this._trackAir(dt);
    this._webCooldown = Math.max(0, (this._webCooldown ?? 0) - dt);
    this._zipCool = Math.max(0, (this._zipCool ?? 0) - dt);
    this._updatePerchTarget(dt);
    if (this._zipPressed) { this._zipPressed = false; this._zip(); }
    if (this._swingJump) { this._swingJump = false; if (this.webPhysics.isSwinging) this._jumpOffSwing(); }
    if (this.webPhysics.isSwinging) this.isPerched = false;     // shot a web off the perch
    if (this.flying) {
      this._updateFlight(dt);
    } else if (this.perchZip) {
      this._updatePerchZip(dt);
    } else if (this.isPerched) {
      this._updatePerched(dt);
    } else if (this.webPhysics.isSwinging) {
      this._updateSwing(dt);
    } else if (this.isWallRun) {
      this._updateWallRun(dt);
    } else if (this.isClimbing) {
      this._updateClimb(dt);
    } else {
      this._updateGroundMovement(dt);
    }

    this._checkVoid(dt);
    this._updateCamera(dt);
    this._updateHUD();

    if (this.anim) this.anim.update(dt);
    else this._tickRig(dt);
    // Draw the web after the body and arms have moved, so it stays glued to the hand
    this.root.updateMatrixWorld(true);
    this.webPhysics.drawWeb();
    if (this._suitMat) tickSuitMaterial(this._suitMat, dt);

    this.webPhysics.setReelingIn(false);
  }

  _updateGroundMovement(dt) {
    const pos = this.root.position;
    // Ride along with whatever moving platform (car) we're standing on
    const ride = this.isGrounded && this._groundObj?.userData.delta;
    if (ride) pos.add(ride);

    // Determine move speed
    this.isSprinting = this._keys['ShiftLeft'] || this._keys['ShiftRight'];
    this.isCrouching = this._keys['KeyC'];
    const speed = this.isCrouching ? CROUCH_SPEED
                : this.isSprinting ? (this.noPowers ? 10 : SPRINT_SPEED)
                : WALK_SPEED;

    // Build move direction in camera-relative space
    const dir = new THREE.Vector3();
    if (this._keys['KeyW'] || this._keys['ArrowUp'])    dir.z -= 1;
    if (this._keys['KeyS'] || this._keys['ArrowDown'])  dir.z += 1;
    if (this._keys['KeyA'] || this._keys['ArrowLeft'])  dir.x -= 1;
    if (this._keys['KeyD'] || this._keys['ArrowRight']) dir.x += 1;

    let rolling = false;
    if (this.landT > 0 && this.isGrounded) {
      this.landT = Math.max(0, this.landT - dt);
      const p = 1 - this.landT / this.landDur;
      if (this.landKind === 'hero' && p < 0.55) { const f = Math.exp(-30 * dt); this.velocity.x *= f; this.velocity.z *= f; dir.set(0, 0, 0); }
      else if (this.landKind === 'slide' && p < 0.7) { const f = Math.exp(-3.5 * dt); this.velocity.x *= f; this.velocity.z *= f; dir.set(0, 0, 0); }
      else if (this.landKind === 'roll' && p < 0.8) { dir.set(0, 0, 0); rolling = true; }   // the roll keeps its momentum
    }
    if (dir.lengthSq() > 0) {
      dir.normalize();
      // Rotate dir by yaw so movement is relative to camera facing
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this._yaw);
      if (this.isGrounded) {
        // Running out of a fast landing: bleed the extra speed off over ~0.5 s instead of snapping to run speed
        const flat = Math.hypot(this.velocity.x, this.velocity.z);
        const s = flat > speed + 0.5 ? speed + (flat - speed) * Math.exp(-4 * dt) : speed;
        this.velocity.x = dir.x * s;
        this.velocity.z = dir.z * s;
      } else {
        // Air control steers without killing swing momentum
        const k = Math.min(1, 2.5 * dt);
        const flat = Math.hypot(this.velocity.x, this.velocity.z);
        const target = Math.max(speed, flat);
        this.velocity.x += (dir.x * target - this.velocity.x) * k;
        this.velocity.z += (dir.z * target - this.velocity.z) * k;
      }
      this.root.rotation.y = Math.atan2(dir.x, dir.z);
    } else if (this.isGrounded) {
      if (!rolling) {   // a roll keeps its momentum; otherwise stop like the old 0.8/frame at 60 fps, at any frame rate
        const f = Math.exp(-13.4 * dt);
        this.velocity.x *= f;
        this.velocity.z *= f;
      }
    } else {
      const drag = Math.exp(-0.25 * dt);
      this.velocity.x *= drag;
      this.velocity.z *= drag;
    }
    // Airborne at high speed, air resistance pulls you back toward a normal pace
    // (holding W used to keep a launch's speed forever). Dives may go faster.
    if (!this.isGrounded) {
      const flat = Math.hypot(this.velocity.x, this.velocity.z), cap = this._fallStyle === 'dive' ? 36 : 27;
      if (flat > cap) {
        const f = Math.max(cap / flat, Math.exp(-0.45 * dt));
        this.velocity.x *= f; this.velocity.z *= f;
      }
    }

    // Jump
    if ((this._keys['Space']) && this.isGrounded) {
      this.velocity.y = JUMP_FORCE * (this.noPowers ? 0.55 : 1);
      this.isGrounded  = false;
    }
    // Wall jump (heroes with move.wallJump, e.g. Doc Ock): a fresh Space press in the air next to
    // a wall kicks off it, away from the wall and upward.
    const spaceNow = !!this._keys['Space'];
    if (spaceNow && !this._spaceHeld && !this.isGrounded && this.hero?.move.wallJump && (this._wallJumpCd ?? 0) <= 0) {
      const ray = this._wallRaycaster, solids = this._solids();
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2;
        ray.ray.origin.set(pos.x, pos.y + 0.8, pos.z); ray.ray.direction.set(Math.sin(a), 0, Math.cos(a));
        const hit = ray.intersectObjects(solids, false)[0];
        if (hit?.face && hit.distance < 1.3 && Math.abs(hit.face.normal.y) < 0.7) {
          this.velocity.set(-Math.sin(a) * 9, JUMP_FORCE * 1.05, -Math.cos(a) * 9);
          this._wallJumpCd = 0.25;
          break;
        }
      }
    }
    this._spaceHeld = spaceNow;
    this._wallJumpCd = Math.max(0, (this._wallJumpCd ?? 0) - dt);

    // Gravity, with drag that depends on the body shape in the air
    if (!this.isGrounded) {
      const st = this._fallStyle;
      const term = st === 'dive' ? -58 : st === 'skydive' ? -30 : st === 'back' ? -40 : -46;
      this.velocity.y = Math.max(this.velocity.y + GRAVITY * dt, Math.min(this.velocity.y, term));
      if (this.velocity.y < term) this.velocity.y += (term - this.velocity.y) * Math.min(1, 3 * dt);
      if (st === 'dive') {
        // Head-first: trade height for forward speed along the facing direction
        const fx = Math.sin(this.root.rotation.y), fz = Math.cos(this.root.rotation.y);
        const flat = Math.hypot(this.velocity.x, this.velocity.z);
        if (flat < 30) { this.velocity.x += fx * 9 * dt; this.velocity.z += fz * 9 * dt; }
      }
    }

    // Airborne and heading into a facade fast? Run along it rather than grabbing on
    if (!this.isGrounded && this._wallRunCooldown <= 0 && this._climbCooldown <= 0 && !this.noPowers) {
      const flat = Math.hypot(this.velocity.x, this.velocity.z);
      if (flat > 7.5) {
        let hit = this._probeWall(pos, this.velocity, 1.05);
        if (!(hit && Math.abs(hit.normal.y) < 0.5) && flat > 9 && this.velocity.y > -14) {
          // Running/leaping past a facade: check the walls beside the travel direction too
          const side = this._sideDir ??= new THREE.Vector3();
          hit = null;
          for (const sg of [1, -1]) {
            side.set(-this.velocity.z * sg, 0, this.velocity.x * sg);
            const h = this._probeWall(pos, side, 1.25);
            if (h && Math.abs(h.normal.y) < 0.5) { hit = h; break; }
          }
        }
        if (hit && Math.abs(hit.normal.y) < 0.5 && this._startWallRun(hit.normal)) return;
      }
    }

    // Grab a wall when moving into it
    if (dir.lengthSq() > 0 && this._climbCooldown <= 0 && !this.noPowers) {   // no wall climbing before the bite
      const hit = this._probeWall(pos, dir, 0.7);
      if (hit && Math.abs(hit.normal.y) < 0.5) {
        // Sprinting into a wall at an angle runs along it; straight on still climbs
        const n0 = this._tmpN ??= new THREE.Vector3();
        n0.copy(hit.normal).setY(0).normalize();
        if (this.isSprinting && Math.abs(dir.dot(n0)) < 0.8 && this._wallRunCooldown <= 0) {
          this.velocity.set(dir.x * SPRINT_SPEED, Math.max(this.velocity.y, 0), dir.z * SPRINT_SPEED);
          if (this._startWallRun(n0)) return;
        }
        this.isClimbing = true;
        this.isGrounded = false;
        this._wallNormal.copy(hit.normal).setY(0).normalize();
        this.velocity.set(0, 0, 0);
        return;
      }
    }

    const prevY = pos.y;
    if (this.velocity.y > 0) this._sweepUp(pos, this.velocity.y * dt);
    else pos.y += this.velocity.y * dt;
    this._sweepHorizontal(pos, this.velocity.x * dt, this.velocity.z * dt);

    // Prevent walking through walls
    this._resolveWalls(pos);

    const groundY = this._getGroundY(pos, prevY);
    const standY  = groundY + 0.5;

    if (pos.y <= standY + 0.05) {
      pos.y = standY;
      this._markSafe(pos);
      const wasGrounded = this.isGrounded;
      const impact = this.velocity.y;
      this.isGrounded = true;
      if (!wasGrounded && impact < -4) {
        this._setAnimState(AnimState.LAND);
        this._land(impact);
      }
      this.velocity.y = 0;
    } else {
      this.isGrounded = false;
    }

    // Animation state from movement
    if (this.isGrounded) {
      const moving = dir.lengthSq() > 0;
      if (!moving)             this._setAnimState(AnimState.IDLE);
      else if (this.isCrouching) this._setAnimState(AnimState.CROUCH);
      else if (this.isSprinting) this._setAnimState(AnimState.SPRINT);
      else                       this._setAnimState(AnimState.IDLE); // walk (treat as idle until walk clip added)
    }
  }

  /** Horizontal ray from chest height; returns { distance, normal } facing the ray, or null. */
  _probeWall(pos, dir, far) {
    if (this.cityMeshes.length === 0) return null;
    this._climbRay.ray.direction.set(dir.x, 0, dir.z).normalize();
    this._climbRay.far = far;
    // Facades have 20 cm slots (seams) 0.6 m deep; use the nearest of three heights
    // so a single ray slipping into a slot can't pull the body inside the wall.
    // Prefer a real wall face over a roof or ledge top: running past a roofline used to end
    // a wall run because the nearest surface above the character was horizontal.
    let best = null, other = null;
    for (const h of [0.1, 0.8, 1.5]) {
      this._climbRay.ray.origin.set(pos.x, pos.y + h, pos.z);
      const hit = this._climbRay.intersectObjects(this.cityMeshes, false)[0];
      if (!hit?.face) continue;
      if (!other || hit.distance < other.distance) other = hit;
      if (Math.abs(hit.face.normal.y) < 0.7 && (!best || hit.distance < best.distance)) best = hit;
    }
    best ??= other;
    if (!best) return null;
    const normal = best.face.normal.clone();
    if (normal.dot(this._climbRay.ray.direction) > 0) normal.negate();
    return { distance: best.distance, normal };
  }

  _updateClimb(dt) {
    const pos = this.root.position;
    const n = this._wallNormal;
    const side = new THREE.Vector3(n.z, 0, -n.x); // player's right while facing the wall
    this.isSprinting = this._keys['ShiftLeft'] || this._keys['ShiftRight'];
    const speed = this.isSprinting ? 9 : 5;

    // Jump off the wall
    if (this._climbJump) {
      this._climbJump = false;
      this.isClimbing = false;
      this._climbCooldown = 0.4;
      this.velocity.copy(n).multiplyScalar(9).setY(10);
      return;
    }

    let up = 0, lateral = 0;
    if (this._keys['KeyW'] || this._keys['ArrowUp'])    up += 1;
    if (this._keys['KeyS'] || this._keys['ArrowDown'])  up -= 1;
    if (this._keys['KeyA'] || this._keys['ArrowLeft'])  lateral -= 1;
    if (this._keys['KeyD'] || this._keys['ArrowRight']) lateral += 1;

    this._surge = (this._surge ?? 1) + ((this.rig?.climbSurge ?? 1) - (this._surge ?? 1)) * (1 - Math.exp(-10 * dt));
    const surge = this._surge;   // heavy climbers (Venom) lurch up in pulls, smoothed so it flows
    let rise = up * speed * surge * dt;
    if (rise > 0) {
      // Head clearance: indoors the wall runs into a ceiling. Stop under it instead of climbing
      // straight through the slab (Oscorp/Bugle interiors).
      const HEAD = 1.4, rc = this._ceilRay ??= Object.assign(new THREE.Raycaster(), { firstHitOnly: true });
      rc.ray.origin.set(pos.x, pos.y + 0.5, pos.z);
      rc.ray.direction.set(0, 1, 0);
      rc.far = HEAD - 0.5 + rise + 0.05;
      const c = rc.intersectObjects(this._nearSolids(pos, 0.5, HEAD + 1), false)[0];
      if (c) rise = Math.max(0, Math.min(rise, c.point.y - 0.05 - (pos.y + HEAD)));
    }
    pos.y += rise;
    this._sweepHorizontal(pos, side.x * lateral * speed * 0.7 * surge * dt, side.z * lateral * speed * 0.7 * dt);

    // Re-stick to the wall and follow its curvature
    const into = n.clone().negate();
    const hit = this._probeWall(pos, into, 1.2);
    if (hit && Math.abs(hit.normal.y) < 0.5) {
      this._wallNormal.copy(hit.normal).setY(0).normalize();
      // Limit how far one frame can pull the body toward the wall
      const gap = this.rig?.wallGap ?? 0.4;   // big figures hold off further so the head stays out of the wall
      pos.addScaledVector(into, Math.max(-0.1, Math.min(hit.distance - gap, 0.1)));
    } else {
      // Ran out of wall: mantle onto the roof if climbing up, otherwise drop off
      this.isClimbing = false;
      this._climbCooldown = 0.3;
      this.velocity.set(0, 0, 0);
      if (up > 0) {
        this.velocity.copy(into).multiplyScalar(4).setY(9);
      }
      return;
    }

    // Climbed down to the ground
    if (up < 0) {
      const gY = this._getGroundY(pos);
      if (pos.y <= gY + 0.5) {
        pos.y = gY + 0.5;
        this.isClimbing = false;
        this.isGrounded = true;
        this._climbCooldown = 0.4;
      }
    }

    this.root.rotation.y = Math.atan2(into.x, into.z);
    this.velocity.set(0, 0, 0);
  }

  // ─── Perches, point launch, web zip, swing jump ───────────────────────────
  /** Pick the perch (lamp / tree top) nearest the screen centre ahead of the camera; show a reticle on it. */
  _updatePerchTarget(dt) {
    const ret = this._ret ??= document.getElementById('perch-reticle');
    const hint = this._hint ??= document.getElementById('perch-hint');
    if (hint) hint.textContent = this.isPerched ? 'SPACE  LAUNCH     Q  NEXT PERCH' : '';
    this.perchTarget = null;
    if (!this.perches?.length || this.perchZip || this.noWebs) { ret?.classList.remove('show'); return; }
    const cam = this.camera, p = this.root.position;
    const fwd = this._cf ??= new THREE.Vector3(); cam.getWorldDirection(fwd);
    const v = this._pv ??= new THREE.Vector3();
    let best = null, bestScore = -Infinity;
    for (const q of this.perches) {
      const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 9 || d2 > 48 * 48) continue;
      if (this.isPerched && this._perchAt && this._perchAt === q) continue;
      v.set(q.x - cam.position.x, q.y - cam.position.y, q.z - cam.position.z);
      const along = v.dot(fwd) / v.length();
      if (along < 0.9) continue;                               // within ~25° of where you're looking
      const score = along * 3 - Math.sqrt(d2) / 48;
      if (score > bestScore) { bestScore = score; best = q; }
    }
    // Line of sight for the winner (throttled)
    this._losT = (this._losT ?? 0) - dt;
    if (best && (best !== this._losFor || this._losT <= 0)) {
      this._losFor = best; this._losT = 0.15;
      const rc = this._losRay ??= Object.assign(new THREE.Raycaster(), { firstHitOnly: true });
      const o = this._lo ??= new THREE.Vector3(p.x, p.y + 1.2, p.z);
      o.set(p.x, p.y + 1.2, p.z);
      const dir = v.set(best.x - o.x, best.y + 0.4 - o.y, best.z - o.z), len = dir.length();
      rc.set(o, dir.normalize()); rc.far = len - 0.5;
      this._losOk = !rc.intersectObjects(this.cityMeshes, false).length;
    }
    if (best && this._losOk) {
      this.perchTarget = best;
      v.set(best.x, best.y + 0.3, best.z).project(cam);
      ret.style.left = `${(v.x + 1) / 2 * innerWidth}px`;
      ret.style.top = `${(1 - v.y) / 2 * innerHeight}px`;
      ret.classList.add('show');
    } else ret?.classList.remove('show');
  }

  /** Q: zip to the targeted perch; with nothing targeted in the air, a quick web-zip forward. */
  _zip() {
    if (this.isClimbing || this.noWebs) return;
    const t = this.perchTarget;
    if (t) {
      if (this.webPhysics.isSwinging) this.webPhysics.releaseWeb(false);
      this.isWallRun = false; this.isPerched = false; this.trick = null;
      this.perchZip = { to: new THREE.Vector3(t.x, t.y + 0.5, t.z), from: this.root.position.clone(), t: 0, q: t };
      const wp = this.webPhysics;
      wp.anchor.set(t.x, t.y + 0.2, t.z);
      wp.handSide = -1;
      wp._setWebVisible(true);
      wp._splat.position.copy(wp.anchor);
      this.root.rotation.y = Math.atan2(t.x - this.root.position.x, t.z - this.root.position.z);
      return;
    }
    if (!this.isGrounded && (this._zipCool ?? 0) <= 0) {
      // Web-zip: a short burst along the camera's flat forward, keeps your flow going
      const f = this._cf ??= new THREE.Vector3(); this.camera.getWorldDirection(f);
      f.y = 0; f.normalize();
      if (this.webPhysics.isSwinging) this.webPhysics.releaseWeb(false);
      const flat = Math.hypot(this.velocity.x, this.velocity.z);
      const sp = Math.min(Math.max(flat, 14) + 6, 30);
      this.velocity.set(f.x * sp, Math.max(this.velocity.y, 3), f.z * sp);
      this.root.rotation.y = Math.atan2(f.x, f.z);
      this._zipCool = 0.9;
    }
  }

  _updatePerchZip(dt) {
    const z = this.perchZip, pos = this.root.position;
    z.t += dt;
    const dist = z.from.distanceTo(z.to), dur = Math.max(0.25, dist / 38);
    const k = Math.min(1, z.t / dur), e = 1 - (1 - k) * (1 - k);    // fast start, eases in to land
    pos.lerpVectors(z.from, z.to, e);
    pos.y += Math.sin(k * Math.PI) * Math.min(3, dist * 0.08);       // slight arc
    this.webPhysics.drawWeb?.();
    if (k >= 1) {
      this.perchZip = null;
      this.webPhysics._setWebVisible(false);
      this.isPerched = true;
      this._perchAt = z.q;
      this.isGrounded = false;
      this.velocity.set(0, 0, 0);
      this._setAnimState(AnimState.IDLE);
    }
  }

  _updatePerched(dt) {
    this.velocity.set(0, 0, 0);
    if (this._perchLaunch) {
      // Point launch: big arc in the direction the camera faces
      this._perchLaunch = false;
      this.isPerched = false;
      const f = this._cf ??= new THREE.Vector3(); this.camera.getWorldDirection(f);
      f.y = 0; f.normalize();
      this.velocity.set(f.x * 22, 15, f.z * 22);
      this.root.rotation.y = Math.atan2(f.x, f.z);
      this._startTrick?.();
      return;
    }
    // Walking off the perch drops you
    const k = this._keys;
    if (k.KeyW || k.KeyA || k.KeyS || k.KeyD) { this.isPerched = false; this.velocity.y = 2; }
  }

  /** Space while swinging: let go with a jump whose direction depends on where you are in the arc. */
  _jumpOffSwing() {
    const v = this.velocity, flat = Math.hypot(v.x, v.z) || 1;
    this.webPhysics.releaseWeb(false);
    if (v.y > 2) { v.y += 9; v.x *= 1.04; v.z *= 1.04; }                // rising: spring upward
    else { v.x += v.x / flat * 7; v.z += v.z / flat * 7; v.y = Math.max(v.y, 0) + 6; } // low: spring forward
    this._webCooldown = 0.25;
    this._startTrick?.(0.6);
  }

  // ─── Falling + landing ────────────────────────────────────────────────────
  /** Airtime bookkeeping: peak height, how the fall began, and the body shape for the fall. */
  _trackAir(dt) {
    const air = !this.isGrounded && !this.webPhysics?.isSwinging && !this.isClimbing && !this.isWallRun;
    const pos = this.root.position;
    if (!air) { this._wasAir = false; if (this.isGrounded) this._fallStyle = null; this._airPeak = pos.y; return; }
    if (!this._wasAir) {
      this._wasAir = true;
      this._airPeak = pos.y;
      this._fallStyle = null;
      // Stepped off a ledge (no jump, no web): you can lose your balance and tip over backwards
      this._offLedge = this.velocity.y <= 0.5;
    }
    this._airPeak = Math.max(this._airPeak, pos.y);
    if (this.velocity.y > 0 || this.trick) return;
    const drop = pos.y - this._getGroundY(pos);
    const fx = Math.sin(this.root.rotation.y), fz = Math.cos(this.root.rotation.y);
    const along = this.velocity.x * fx + this.velocity.z * fz, flat = Math.hypot(this.velocity.x, this.velocity.z);
    const dive = this._keys.ShiftLeft || this._keys.ShiftRight;
    if (!this._fallStyle) {
      if (drop < 3) return;                                   // tiny hops keep the normal jump pose
      if (drop > 5 && (this._keys.KeyS || this._keys.ArrowDown || (this._offLedge && along < 2.5))) this._fallStyle = 'back';
      else if (dive || (flat > 16 && drop > 10)) this._fallStyle = 'dive';
      else if (drop > 12) this._fallStyle = 'skydive';
      else this._fallStyle = 'flail';
    } else if (this._fallStyle !== 'back') {
      // Shift tucks into a dive mid-air; letting go spreads back out
      if (dive && drop > 4) this._fallStyle = 'dive';
      else if (!dive && this._fallStyle === 'dive' && flat < 16) this._fallStyle = drop > 8 ? 'skydive' : 'flail';
    }
  }

  /** Pick a landing from how hard and how fast we came down. */
  _land(vy) {
    const drop = (this._airPeak ?? this.root.position.y) - this.root.position.y;
    const flat = Math.hypot(this.velocity.x, this.velocity.z);
    // A normal standing jump lands at about 14 m/s, but it only drops ~2 m. Gate on the actual
    // height fallen so hopping around the street stays fluid; the heavy landings are for real falls.
    if (drop < 5) { this._fallStyle = null; this._airPeak = this.root.position.y; return; }
    let kind = null, dur = 0;
    if (flat > 13 && (drop > 9 || vy < -22)) { kind = 'roll'; dur = 0.55; }
    else if (drop > 18 || vy < -32) { kind = 'hero'; dur = 0.85; }
    else if (flat > 9 && (drop > 7 || vy < -18)) { kind = 'slide'; dur = 0.5; }
    else if (drop > 8 && vy < -18) { kind = 'crouch'; dur = 0.3; }
    this._fallStyle = null;
    this._airPeak = this.root.position.y;
    if (!kind) return;
    this.landKind = kind; this.landDur = dur; this.landT = dur;
    this.onLand?.(kind, Math.min(1, Math.max(drop, -vy) / 40));
  }

  // ─── Wall running ─────────────────────────────────────────────────────────
  /**
   * Run along a facade that was met at a glancing angle, keeping the momentum.
   * Returns false when the approach is head-on or too slow (the caller then climbs).
   */
  _startWallRun(normal) {
    const v = this.velocity;
    const flat = Math.hypot(v.x, v.z);
    if (flat < 5) return false;
    const n = this._wallRunNormal.copy(normal).setY(0).normalize();
    const tan = this._wallRunTangent.set(v.x, 0, v.z);
    tan.addScaledVector(n, -tan.dot(n));       // slide the velocity onto the wall plane
    if (tan.lengthSq() < 1e-4) return false;
    const speed = tan.length();
    if (speed < flat * 0.45) return false;     // almost head-on: that is a climb
    tan.normalize();
    // Which side of the travel direction the wall is on: the feet go that way
    const rightDot = n.x * tan.z - n.z * tan.x;
    this._wallRunSide = -Math.sign(rightDot) || 1;
    this.isWallRun = true;
    this.isClimbing = false;
    this.isGrounded = false;
    this.trick = null;
    this._wallRunTime = 0;
    this._wallRunGrace = 0;
    this._wallRunSpeed = Math.min(Math.max(speed, 11), 24);
    // A small kick up the wall so the run starts with lift instead of sagging straight away
    this.velocity.set(tan.x * this._wallRunSpeed, Math.max(3.5, Math.min(v.y * 0.4 + 3.5, 7)), tan.z * this._wallRunSpeed);
    this._fallStyle = null;
    return true;
  }

  _updateWallRun(dt) {
    const pos = this.root.position;
    const n = this._wallRunNormal, tan = this._wallRunTangent;
    this._wallRunTime += dt;
    this.isSprinting = true;

    // Jump off the wall
    if (this._climbJump) {
      this._climbJump = false;
      this._endWallRun();
      // Leap off: away from the wall, keeping most of the run's speed
      this.velocity.copy(tan).multiplyScalar(this._wallRunSpeed * 0.75).addScaledVector(n, 8).setY(11);
      this.root.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
      return;
    }

    // Stay glued to the wall we are running along
    const into = this._wallInto ??= new THREE.Vector3();
    into.copy(n).negate();
    const hit = this._probeWall(pos, into, 1.5);
    if (hit && Math.abs(hit.normal.y) < 0.5) {
      this._wallRunGrace = 0;
      n.copy(hit.normal).setY(0).normalize();
      into.copy(n).negate();
      tan.addScaledVector(n, -tan.dot(n)).normalize();   // follow a curving facade
      pos.addScaledVector(into, Math.min(Math.max(hit.distance - 0.55, -0.1), 0.08));
    } else {
      // Doorways, columns and setbacks: carry the stride for a moment instead of
      // dropping off at the first gap, then re-stick to the next wall segment.
      this._wallRunGrace = (this._wallRunGrace ?? 0) + dt;
      if (this._wallRunGrace > 0.32) { this._endWallRun(); return; }
    }

    // Holding forward keeps the pace up; otherwise it bleeds off. Gravity is light at first,
    // then the run sags so it ends naturally rather than abruptly.
    const held = this._keys.KeyW || this._keys.ArrowUp;
    this._wallRunSpeed = held ? Math.max(this._wallRunSpeed - 0.6 * dt, 13) : Math.max(7, this._wallRunSpeed - 3 * dt);
    pos.addScaledVector(tan, this._wallRunSpeed * dt);
    const g = this._wallRunTime < 0.7 ? 5 : 12;
    this.velocity.y = Math.max(this.velocity.y - g * dt, -6);
    pos.y += this.velocity.y * dt;

    // Pushing hard away from the wall peels off it
    const k = this._keys, steer = this._steerWall ??= new THREE.Vector3();
    steer.set((k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0), 0,
              (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0));
    if (steer.lengthSq() > 0) {
      steer.normalize().applyAxisAngle(this._downDir, -this._yaw);
      if (steer.dot(tan) < -0.55) { this._endWallRun(); return; }
    }

    // Touched down, or ran out of wall time
    const gY = this._getGroundY(pos);
    if (pos.y <= gY + 0.5) {
      pos.y = gY + 0.5;
      this._markSafe(pos);
      this.isGrounded = true;
      this.velocity.y = 0;
      this._setAnimState(AnimState.LAND);
      this._endWallRun();
      this._land(-8);
      return;
    }
    if (this._wallRunTime > 4) { this._endWallRun(); return; }

    this.velocity.x = tan.x * this._wallRunSpeed;
    this.velocity.z = tan.z * this._wallRunSpeed;
    this.root.rotation.y = Math.atan2(tan.x, tan.z);
  }

  _endWallRun() {
    this.isWallRun = false;
    this._wallRunGrace = 0;
    this._wallRunCooldown = 0.35;
  }

  _updateSwing(dt) {
    this.webPhysics.velocity = this.velocity;
    // WASD steers relative to the camera
    const k = this._keys, steer = this._steer ??= new THREE.Vector3();
    steer.set((k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0), 0,
              (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0));
    if (steer.lengthSq() > 0) steer.normalize().applyAxisAngle(this._downDir, -this._yaw);
    this.webPhysics.steer = steer;
    const prev = this.root.position;
    const prevY = prev.y;
    const newPos = this.webPhysics.update(dt);
    if (newPos) {
      const dx = newPos.x - prev.x, dz = newPos.z - prev.z, dy = newPos.y - prev.y;
      // Rising: check overhead first (ledges, overhangs, roof undersides)
      if (dy > 0) { newPos.y = prev.y; this._sweepUp(newPos, dy); }
      newPos.x = prev.x; newPos.z = prev.z;
      this._sweepHit = null;
      const steps = Math.min(6, Math.ceil(Math.hypot(dx, dz) / 0.6));
      for (let i = 0; i < steps && !this._sweepHit; i++) this._sweepHorizontal(newPos, dx / steps, dz / steps);
      // Swung into a wall: let go and grab it, instead of grinding along the facade
      if (this._sweepHit && this._sweepHit.into > 3 && this._climbCooldown <= 0 && !this.noPowers) {
        this.root.position.copy(newPos);
        this.webPhysics.releaseWeb(false);
        this.isGrounded = false;
        const n = this._wallNormal.set(this._sweepHit.nx, 0, this._sweepHit.nz).normalize();
        // Glancing hit with speed to spare: carry it along the facade instead of sticking
        if (this._startWallRun(n)) return;
        this.isClimbing = true;
        this.velocity.set(0, 0, 0);
        return;
      }
      this._resolveWalls(newPos);
      const gY = this._getGroundY(newPos, prevY);
      this.root.position.copy(newPos);
      if (newPos.y < gY + 0.5) {
        // Swung into the ground: let go and land running
        this.root.position.y = gY + 0.5;
        if (this.velocity.y < 0) this.velocity.y = 0;
        this.webPhysics.releaseWeb(false);
        this.isGrounded = true;
        return;
      }
      if (this.webPhysics.slack) {
        this.webPhysics.releaseWeb(false);
        this._webCooldown = 0.25;
        this._setAnimState(AnimState.FALL);
        return;
      }
      if (this.webPhysics.atTop) {
        this.webPhysics.releaseWeb(true);
        this._webCooldown = 0.2;
        this._setAnimState(AnimState.FALL);   // no trick pose: an auto-release must fall at once
        return;
      }
    }

    // Face the swing direction
    if (this.velocity.lengthSq() > 0.1) {
      const flatVel = this.velocity.clone().setY(0);
      if (flatVel.lengthSq() > 0.01) {
        this.root.rotation.y = Math.atan2(flatVel.x, flatVel.z);
      }
    }

    // Swing animation state
    this._setAnimState(AnimState.WEB_SWING);
  }

  // ─── Spring camera ────────────────────────────────────────────────────────
  _updateCamera(dt) {
    // Desired camera position: orbit around character
    const charPos = this.root.position;
    // Cutscene lenses: 50 mm-ish for close-ups, wider for establishing shots. Restored on exit.
    if (this.cinematic?.fov) {
      this._cineFov ??= this.camera.fov;
      if (Math.abs(this.camera.fov - this.cinematic.fov) > 0.01) {
        this.camera.fov = this.cinematic.fov;
        this.camera.updateProjectionMatrix();
      }
    } else if (!this.cinematic && this._cineFov != null) {
      this.camera.fov = this._cineFov;
      this.camera.updateProjectionMatrix();
      this._cineFov = null;
    }

    // Offset: polar coordinates from yaw/pitch
    const offset = new THREE.Vector3(
      Math.sin(this._yaw)   * Math.cos(this._pitch) * CAM_DIST,
      Math.sin(this._pitch) * CAM_DIST + CAM_HEIGHT,
      Math.cos(this._yaw)   * Math.cos(this._pitch) * CAM_DIST,
    );

    // Wall run: swing round behind the run (unless the player is steering the camera) and
    // hold the camera off the facade so it never gets shoved into the wall
    if (this.isWallRun && performance.now() - (this._lastLook ?? 0) > 700) {
      const t = this._wallRunTangent, want = Math.atan2(-t.x, -t.z);
      let d = want - this._yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this._yaw += d * Math.min(1, 3.2 * dt);
      offset.set(Math.sin(this._yaw) * Math.cos(this._pitch) * CAM_DIST, Math.sin(this._pitch) * CAM_DIST + CAM_HEIGHT,
        Math.cos(this._yaw) * Math.cos(this._pitch) * CAM_DIST);
    }
    this._camTarget.copy(charPos).add(offset);
    this._wallPush = (this._wallPush ?? 0) + ((this.isWallRun ? 1.4 : 0) - (this._wallPush ?? 0)) * Math.min(1, 4 * dt);
    if (this._wallPush > 0.01) this._camTarget.addScaledVector(this._wallRunNormal, this._wallPush);
    if (this.cinematic) {
      // Cutscene shot: the director supplies the exact camera mark; fall back to a 3/4 view
      const t = this.cinematic.target, s = this.cinematic.scale ?? 1;
      if (this.cinematic.cam) this._camTarget.copy(this.cinematic.cam);
      else {
        const yaw = t.rotation.y + 0.6;
        this._camTarget.set(t.position.x + Math.sin(yaw) * 3.4 * s, t.position.y + 1.3 * s, t.position.z + Math.cos(yaw) * 3.4 * s);
      }
      // A cut is a real cut: jump the spring so the next frame is the new shot, not a drift.
      if (this.cinematic.cut) { this._camCurrent.copy(this._camTarget); this.cinematic.cut = false; }
    }

    // Spring lerp toward target
    const k = Math.min(CAMERA_SPRING * dt, 1);
    this._camCurrent.lerp(this._camTarget, k);

    // Keep the camera on the near side of walls between it and the character
    const camPos = this.camera.position.copy(this._camCurrent);
    if (this.cityMeshes.length) {
      const eye = this._camEye ??= new THREE.Vector3();
      const focus = this.cinematic?.look ?? this.cinematic?.target.position ?? charPos;
      eye.set(focus.x, focus.y + (this.cinematic?.look ? 0 : 1.2 * (this.cinematic?.scale ?? 1)), focus.z);
      const toCam = this._camDir ??= new THREE.Vector3();
      toCam.subVectors(this._camCurrent, eye);
      const dist = toCam.length();
      if (dist > 0.01) {
        toCam.divideScalar(dist);
        const rc = this._camRay ??= Object.assign(new THREE.Raycaster(), { firstHitOnly: true });
        rc.set(eye, toCam);
        rc.far = dist;
        const hit = rc.intersectObjects(this.cityMeshes, false).find(h => !h.object.userData.noCam);   // furniture (dorm) blocks feet, not the view
        // Never let the camera dive inside the minifig (it clipped limbs away when hugging a wall)
        if (hit) camPos.copy(eye).addScaledVector(toCam, Math.max(1.05, hit.distance - 0.35));
      }
    }
    if (this.cinematic) {
      const look = this.cinematic.look;
      if (look) this.camera.lookAt(look.x, look.y, look.z);
      else {
        const t = this.cinematic.target, s = this.cinematic.scale ?? 1;
        this.camera.lookAt(t.position.x, t.position.y + 0.95 * s, t.position.z);
      }
    } else {
      // On a wall the figure lies sideways, so its body sits near foot height
      this._lookH = (this._lookH ?? 1.2) + ((this.isWallRun ? 1.05 : 1.2) - (this._lookH ?? 1.2)) * Math.min(1, 5 * dt);
      this.camera.lookAt(charPos.x, charPos.y + this._lookH, charPos.z);
    }
  }

  // ─── HUD updates ──────────────────────────────────────────────────────────
  _updateHUD() {
    // Zone name reflects current state
    const zone = document.getElementById('zone-name');
    if (zone) {
      zone.textContent = this.webPhysics.isSwinging ? 'Web Swing'
        : this.isWallRun ? 'Wall Run'
        : this.isClimbing ? 'Wall Climb'
        : this.isSprinting ? 'Full Sprint'
        : this.isCrouching ? 'Combat Stance'
        : 'City Rooftops';
    }
  }

  // ─── Animation state helper (deduplicated) ────────────────────────────────
  _setAnimState(state) {
    if (!this.anim) return;
    if (this.anim.state !== state) {
      this.anim.transitionTo(state, 0.2);
    }
  }
}
