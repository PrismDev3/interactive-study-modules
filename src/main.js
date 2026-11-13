/**
 * main.js — Entry point
 * Load order:
 *   1. SceneSetup (renderer, lights, skybox, ground)
 *   2. City OBJ    (city_map.obj — large file, may take a moment)
 *   3. Character   (LegoSpidey minifig rig for the chosen outfit)
 */
import * as THREE               from 'three';
import { soundtrack } from './Music.js?v=13';
window.gameMusic = soundtrack;
import { buildBindsUI }        from './Binds.js?v=12';
import { isTypingTarget, overlayOpen } from './Input.js?v=2';
import { SceneSetup }          from './SceneSetup.js?v=144';
import { CharacterController } from './CharacterController.js?v=355';
import { initMountChoctaw } from './MountChoctaw.js?v=69';
import { LegoHud }             from './LegoHud.js?v=86';
import { CityLife, BridgeTraffic } from './CityLife.js?v=258';
import { Combat }              from './Combat.js?v=246';
import { GameUI }              from './GameUI.js?v=127';
import { Story }               from './Story.js?v=220';
import { StorySkillTree }      from './StorySkills.js?v=5';
import { SkillSelect }         from './SkillSelect.js?v=3';
import { roomPrefs }           from './PlayerRoom.js?v=2';
import { Net }                 from './Net.js?v=61';
import { Social }              from './Social.js?v=57';
import { HeroRuntime }         from './Characters.js?v=67';
import { AbilityBar }          from './AbilityBar.js?v=5';
import { TouchControls }       from './TouchControls.js?v=1';
import { Race }                from './Race.js?v=32';
import { Landmarks }           from './Landmarks.js?v=211';
import { Driving }             from './Driving.js?v=10';
import { Ferries }             from './Ferries.js?v=18';
import { Menu }                from './Menu.js?v=268';
import { Chat }                from './Chat.js?v=65';
import { Multiplayer, nameTag } from './Multiplayer.js?v=234';
import { ActivityReporter, activityFor } from './Activity.js?v=2';
import { GFX }                 from './Perf.js?v=21';
import { Minimap }             from './Minimap.js?v=68';
import { EmoteWheel }          from './Emotes.js?v=69';
import { buildProps }          from './Props.js?v=61';
import { Admin }               from './Admin.js?v=255';
import { PortalGun }            from './PortalGun.js?v=9';
import { portraitURL }         from './Portrait.js?v=217';
import { wallet }              from './Outfit.js?v=65';
import { ChangeBooths, findBoothSpots } from './ChangeBooth.js?v=13';
import { Dorm }                from './Dorm.js?v=11';

const loadingScreen = document.getElementById('loading-screen');
const loadingFoot   = document.getElementById('loading-foot');
const loadingMsg    = document.getElementById('loading-msg');
const loadingPct    = document.getElementById('loading-pct');
const BRICKS = 24;
const brickEls = [];
for (let i = 0; i < BRICKS; i++) brickEls.push(document.getElementById('loading-bricks').appendChild(document.createElement('i')));
let menu = null, shownFrac = 0;
let lastMoveAt = performance.now();
let errorBox = null;

/**
 * A title screen that never unlocks is the worst failure this game has: no message, no button,
 * just a hero standing on a baseplate. Anything that can stall or throw now says why and offers
 * a way out, whether or not the loading screen still exists.
 */
function showRetry(reason) {
  if (loadingMsg) loadingMsg.textContent = reason;
  bootShow(false);
  loadingScreen?.classList.remove('hidden');
  if (!errorBox) {
    errorBox = document.createElement('div');
    errorBox.id = 'startup-error';
    errorBox.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:13vh', 'transform:translateX(-50%)', 'z-index:8',
      'display:flex', 'flex-direction:column', 'align-items:center', 'gap:12px',
      'max-width:min(560px,88vw)', 'padding:16px 20px', 'text-align:center',
      'background:rgba(9,12,20,.94)', 'border:3px solid #070a0f', 'border-radius:12px',
      'box-shadow:0 18px 40px rgba(0,0,0,.6)', 'font:400 15px/1.35 Fredoka,system-ui,sans-serif',
      'color:#f6f4ee',
    ].join(';');
    const text = document.createElement('span');
    text.id = 'startup-error-text';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'RETRY';
    btn.style.cssText = [
      'padding:11px 26px', 'font:400 18px/1 "Lilita One",system-ui,sans-serif', 'letter-spacing:.06em',
      'color:#1b1300', 'background:#f5c518', 'border:3px solid #070a0f', 'border-radius:10px',
      'box-shadow:0 5px 0 #070a0f', 'cursor:pointer',
    ].join(';');
    btn.addEventListener('click', () => location.reload());
    errorBox.append(text, btn);
    document.body.appendChild(errorBox);
  }
  const t = document.getElementById('startup-error-text');
  if (t) t.textContent = reason;
  console.warn('[main]', reason);
}

function clearRetry() {
  if (errorBox) { errorBox.remove(); errorBox = null; }
}

/** Real progress only: the bar never moves backwards and only fills as work completes. */
function setProgress(frac, msg) {
  frac = Math.max(shownFrac, Math.min(frac, 1));
  shownFrac = frac;
  lastMoveAt = performance.now();
  // Two honest stages on one bar: the city download (0-63% of the work) while you're in the menu,
  // then getting your hero into the city once you press Play.
  const stage = frac < 0.63 || !document.body.classList.contains('starting') ? Math.min(1, frac / 0.63) : (frac - 0.63) / 0.37;
  const n = Math.floor(stage * BRICKS + 1e-6);
  brickEls.forEach((b, i) => b.classList.toggle('on', i < n));
  loadingPct.textContent = `${Math.floor(stage * 100)}%`;
  loadingFoot.setAttribute('aria-valuenow', Math.floor(stage * 100));
  if (msg) loadingMsg.textContent = msg;
  if (bootEl) {
    const p = Math.floor(stage * 100);
    document.getElementById('boot-fill').style.width = `${stage * 100}%`;
    document.getElementById('boot-pct').textContent = `${p}%`;
    bootEl.setAttribute('aria-valuenow', p);
    if (msg) document.getElementById('boot-msg').textContent = msg;
  }
  menu?.progress(Math.min(1, frac / 0.63));
}

// Full-screen boot overlay: covers the half-built title until the city is in, and again while entering the city.
const bootEl = document.getElementById('boot-screen');
const BOOT_TIPS = [
  'Hold jump in mid-air to keep swinging between buildings.',
  'Smash LEGO objects to collect studs.',
  'Visit a changing booth to swap your suit.',
  'Press U to open your friends list.',
  'Web-zip to cross gaps fast.',
];
let bootTipTimer = 0;
function bootShow(on) {
  if (!bootEl) return;
  bootEl.classList.toggle('off', !on);
  clearInterval(bootTipTimer);
  if (on) {
    const tip = document.getElementById('boot-tip');
    let i = Math.floor(Math.random() * BOOT_TIPS.length);
    const next = () => { tip.textContent = 'TIP: ' + BOOT_TIPS[i++ % BOOT_TIPS.length]; };
    next(); bootTipTimer = setInterval(next, 5000);
  }
}
bootShow(true);

function hideLoading() {
  bootShow(false);
  loadingScreen.classList.add('hidden');
  document.body.classList.remove('starting');
  setTimeout(() => loadingScreen.remove(), 700);
}

// Spiral out from (cx, cz) until a ray dropped from the sky lands directly on street surface.
function findOpenSpawn(cityGroup, cx, cz) {
  const fallback = new THREE.Vector3(cx, 3.1, cz);
  if (!cityGroup) return fallback;
  const ROAD = new Set(['asphalt', 'paint']);
  const meshes = cityGroup.children.filter(c => c.isMesh);
  const ray = new THREE.Raycaster();
  ray.firstHitOnly = true;
  const down = new THREE.Vector3(0, -1, 0);
  const o = new THREE.Vector3();
  const dropAt = (x, z) => { ray.set(o.set(x, 1000, z), down); return ray.intersectObjects(meshes, false)[0]; };
  // Sidewalk is one big slab under whole blocks, so also require open road 5 m around the spot
  const isOpen = (x, z, y) => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const h = dropAt(x + Math.cos(a) * 5, z + Math.sin(a) * 5);
      if (!h || h.point.y > y + 0.6) return false;
    }
    return true;
  };
  for (let r = 0; r <= 600; r += 4) {
    const steps = Math.max(1, Math.round((2 * Math.PI * r) / 4));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const hit = dropAt(x, z);
      if (hit && ROAD.has(hit.object.material?.name) && isOpen(x, z, hit.point.y)) {
        console.log(`[main] Spawn on ${hit.object.material.name} at ${x.toFixed(0)}, ${hit.point.y.toFixed(1)}, ${z.toFixed(0)}`);
        return new THREE.Vector3(x, hit.point.y + 0.5, z);
      }
    }
  }
  console.warn('[main] No open street found near spawn marker');
  return fallback;
}

async function init() {
  setProgress(0.03, 'Building scene…');

  const container = document.getElementById('canvas-container');
  const setup = new SceneSetup(container);

  // ── Menu runs while the 104 MB city loads behind it ─────────────────────
  const net = new Net();
  roomPrefs.bindNetwork(net);
  const cityPromise = setup.loadCity((frac, msg) => setProgress(0.03 + frac * 0.60, msg))
    .catch(err => { console.warn('[main] City load failed:', err.message); return null; });
  menu = new Menu(net);
  const social = new Social(net);
  social.onJoined = r => menu?._joined(r);   // Join Friend from the room list
  initMountChoctaw();  // the Daily Bugle (photos + links) opens from the title screen too
  cityPromise.then(city => {
    clearInterval(stallTimer);
    if (!city) { showRetry('The city failed to load. Retry — your progress is safe.'); return; }
    clearRetry();
    menu?.setReady();
    loadingFoot.classList.add('done');
    setProgress(0.63, 'City ready');
    setTimeout(() => bootShow(false), 350);
  });
  // Play stays locked until the city is in. If the download stops moving, say so instead of
  // leaving the player on a title screen that looks broken.
  const stallTimer = setInterval(() => {
    if (!menu || menu.ready) return;
    const idle = (performance.now() - lastMoveAt) / 1000;
    if (idle > 25) showRetry(`City download stalled for ${Math.round(idle)}s — check your connection, then retry.`);
  }, 4000);
  const choice = await menu.run();
  // Story runs as the default classic Spider-Man. Suit unlocks will be added to the story later;
  // free play and online still use the outfit picked in the locker.
  if (choice.mode === 'single' && choice.sub === 'story') choice.variant = 'classic';
  const lockerMenu = menu;   // the in-game changing booths reuse its locker
  menu = null;
  for (const s of document.querySelectorAll('.screen')) s.classList.remove('show');
  loadingFoot.classList.remove('done');
  bootShow(true);
  setProgress(0.63, 'Getting the city ready');
  const cityGroup = await cityPromise;

  // ── Load character ──────────────────────────────────────────────────────
  setProgress(0.63, 'Setting up character…');

  const controller = new CharacterController(
    setup.scene,
    setup.camera,
    (frac, msg) => setProgress(0.63 + frac * 0.33, msg)
  );

  controller.variant = choice.variant;
  await controller.loadCharacter(null);
  // Planes and helicopters are moving web anchors (SceneSetup owns and animates them).
  controller.setAirTargets?.(setup.airTargets);   // the minifig rig (LegoSpidey); no standalone character GLB ships

  // Give city meshes to the web-swing raycaster
  if (cityGroup && controller.addCollisionRoot) controller.addCollisionRoot(cityGroup);
  setup.clearAirOfBuildings?.(controller.cityMeshes);   // aircraft circles fly above the skyline

  const spawn = findOpenSpawn(cityGroup, 483, 1473);

  // ── Never inside a building ────────────────────────────────────────────
  // Enclosed = ceiling overhead + walls close on all four sides + not standing on street/park.
  // Checked at spawn and every 1.5 s; if it ever happens, hop to the nearest open street.
  // 'indoor' is an enterable interior floor (Oscorp), not a sealed building: never rescue from it.
  const OUTDOOR = new Set(['asphalt', 'paint', 'sidewalk', 'path', 'grass', 'concrete', 'deck', 'indoor']);
  const gRay = Object.assign(new THREE.Raycaster(), { firstHitOnly: true });
  const gO = new THREE.Vector3(), gD = new THREE.Vector3();
  const cityMeshesFor = () => cityGroup ? cityGroup.children.filter(c => c.isMesh) : [];
  function enclosed(p) {
    const meshes = cityMeshesFor();
    if (!meshes.length) return false;
    // Walls seen from inside are back faces, which normal raycasts skip; test both sides
    // against each merged mesh's BVH (the city is merged in world space).
    const cast = (dx, dy, dz, far) => {
      gRay.ray.set(gO.set(p.x, p.y + 1, p.z), gD.set(dx, dy, dz));
      let best = null;
      for (const m of meshes) {
        const hit = m.geometry.boundsTree?.raycastFirst(gRay.ray, THREE.DoubleSide, 0, far);
        if (hit && (!best || hit.distance < best.distance)) { best = hit; best.object = m; }
      }
      return best;
    };
    if (!cast(0, 1, 0, 40)) return false;                             // open sky above
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!cast(dx, 0, dz, 120)) return false;
    const floor = cast(0, -1, 0, 4);
    return !OUTDOOR.has(floor?.object.material?.name);                 // under a bridge on the street is fine
  }
  function rescueIfInside(ctrl) {
    const p = ctrl.root.position;
    if (!enclosed(p)) return false;
    const out = findOpenSpawn(cityGroup, p.x, p.z);
    console.warn('[main] Player was inside a building; moved to', out.toArray().map(v => v.toFixed(0)).join(','));
    ctrl.webPhysics?.isSwinging && ctrl.webPhysics.releaseWeb(false);
    ctrl.isClimbing = false; ctrl.isWallRun = false;
    ctrl.velocity.set(0, 0, 0);
    p.copy(out);
    ctrl.setHome?.(out);
    return true;
  }
  window.__rescueIfInside = () => rescueIfInside(controller);
  controller.root.position.copy(spawn);
  controller.setHome(spawn);  // void falls land back here
  window.hero = controller; // console debugging
  // ── Changing booths: a handful on clear sidewalks around the city ─────
  const isStory = choice.mode === 'single' && choice.sub === 'story';   // no booths in story mode
  const booths = new ChangeBooths(setup.scene, controller, lockerMenu, isStory ? [] :
    findBoothSpots(cityGroup, [[spawn.x + 8, spawn.z + 8], [spawn.x + 260, spawn.z - 220], [spawn.x - 280, spawn.z + 160], [spawn.x + 60, spawn.z - 480], [spawn.x - 200, spawn.z - 260]]));
  window.__booths = booths;
  window.__setup = setup;   // console debugging (bridges, scene)
  initMountChoctaw();       // already built for the menu; idempotent (in-game button, or M)

  controller.onLand = (kind, power) => { if (kind === 'hero') ui?.shake(0.35 + power * 0.5); else if (kind === 'roll' || kind === 'slide') ui?.shake(0.15); };
  const hud = new LegoHud({ scene: setup.scene, controller, cityGroup, spawn });
  new StorySkillTree();
  new SkillSelect();
  const props = cityGroup ? buildProps(setup.scene, controller.cityMeshes, spawn) : { footprints: [], perches: [] };
  const propFootprints = props.footprints;
  controller.perches = props.perches;
  setup.setStreetLamps?.(props.perches);
  if (choice.mode === 'single') { hud.total = hud._shown = hud._banked = wallet.studs; hud.persist = true; }
  // HUD portrait shows your actual outfit
  const setPortrait = code => portraitURL(code).then(url => { if (controller.variant === code) document.querySelector('#portrait img').src = url; });
  setPortrait(choice.variant);
  document.addEventListener('outfitchange', e => setPortrait(e.detail));

  setProgress(0.97, 'Filling the streets…');
  const life = new CityLife({ scene: setup.scene, cityMeshes: controller.cityMeshes, player: controller.root, camera: setup.camera });
  const traffic = setup.bridges?.length ? new BridgeTraffic(setup.scene, setup.bridges, controller.root) : null;
  if (cityGroup) await life.init();
  const landmarks = new Landmarks({ scene: setup.scene, cityMeshes: controller.cityMeshes, spawn, hud, perches: props.perches });
  if (cityGroup) await landmarks.build();
  const ferries = cityGroup ? new Ferries({ scene: setup.scene, cityMeshes: controller.cityMeshes }) : null;
  const driving = new Driving({ controller, life, hud });
  window.__driving = driving;
  if (ferries) controller.setPlatforms([...(controller.platforms ?? []), ...ferries.solids]);

  const ui = new GameUI();
  const combat = new Combat({ scene: setup.scene, controller, hud, ui, cityMeshes: controller.cityMeshes });
  const heroes = new HeroRuntime({ scene: setup.scene, controller, combat });
  combat.heroes = heroes;
  const abilityBar = new AbilityBar(heroes, controller);
  const touchControls = new TouchControls(controller);
  setTimeout(() => abilityBar.intro(), 2500);   // the bar itself shows the hero's controls
  combat.sfx.listener = setup.camera;   // world sounds pan and fade from the camera
  const story = new Story({ scene: setup.scene, sceneSetup: setup, controller, combat, hud, ui, camera: setup.camera, life });
  combat.life = life;
  life.obstacles = propFootprints;
  const sens = document.getElementById('sens');
  if (sens) {
    try { sens.value = localStorage.getItem('sens') ?? sens.value; } catch {}
    controller.sensitivity = +sens.value;
    sens.addEventListener('input', () => {
      controller.sensitivity = +sens.value;
      try { localStorage.setItem('sens', sens.value); } catch {}
    });
  }
  controller.setPlatforms(life.cars.map(c => c.mesh));

  // ── Online room ─────────────────────────────────────────────────────────
  document.body.classList.toggle('story', choice.mode === 'single');
  document.body.classList.add('in-game');
  let mp = null;
  let race = null;
  if (choice.mode === 'online') {
    const room = choice.joined.room;
    choice.me.rank = choice.joined.rank ?? 0;
    setup.lockTime(room.time);
    await document.fonts.load('12px "Pixelify Sans"').catch(() => {});
    const chat = new Chat(net);
    mp = new Multiplayer({
      scene: setup.scene, camera: setup.camera, controller, net, chat, combat,
      me: choice.me, room, players: choice.joined.players, hostId: choice.joined.host ?? null,
    });
    race = new Race({ net, story, hud, ui, controller, life, mp, chat, me: choice.me, hub: room.id === 'hub' });
    social.attachGame({
      mp, chat, controller, camera: setup.camera, canvas: setup.renderer.domElement,
      onJoined: r => { setup.lockTime(r.room.time); mp.switchRoom(r); },
    });
    chat.system(`Joined ${room.name}`);
    if (room.health === false) { document.body.classList.add('no-health'); combat.noDamage = true; }
    document.getElementById('confirm-text').textContent = 'Leave this room?';
    document.getElementById('confirm-sub').textContent = 'You can rejoin from the room list.';
    document.querySelector('#pause-home .ti-label').textContent = 'Leave';
  }
  // ── Your Dorm: room type 'dorm' swaps the city for a decorated room (no powers, no map) ──
  const dorm = new Dorm({ scene: setup.scene, controller, setup, net: mp ? net : null, hud });
  const dormEdit = r => r?.owner === choice.me?.name || (mp?.myRank ?? 0) >= 2;
  if (mp && choice.joined.room.kind === 'dorm') dorm.enter(choice.joined.room, { canEdit: dormEdit(choice.joined.room) });
  document.addEventListener('roomchange', e => {
    if (e.detail?.kind === 'dorm') dorm.enter(e.detail, { canEdit: dormEdit(e.detail) });
    else dorm.leave();
  });
  const emotes = new EmoteWheel(controller, choice.mode === 'single' || choice.joined.room.emotes !== false);
  const minimap = new Minimap({ renderer: setup.renderer, scene: setup.scene, controller });
  // Owner tools: always in single player; online only in a room you created
  const isOwner = choice.mode === 'single' || choice.joined.room.owner === choice.me.name;
  if (mp) { mp.myRank = choice.joined.rank ?? 0; mp.self.rank = mp.myRank; mp.friends = choice.friends ?? []; }
  // Only admins can grant the portal gun. The online grant is server-validated; Free Play is local.
  const portal = new PortalGun({ scene: setup.scene, camera: setup.camera, controller, combat, hud, net: mp ? net : null, me: choice.me ?? null });
  // Admins get the same tools as the owner, within what the server allows them to do.
  const admin = new Admin({ scene: setup.scene, controller, combat, net: choice.mode === 'online' ? net : null, owner: isOwner, rank: mp ? mp.myRank : 3, mp, chat: mp?.chat ?? null, freeplay: choice.mode === 'single' && choice.sub === 'freeplay', portal });
  const activityReporter = new ActivityReporter(net);
  window.game = { dorm, driving, social, life, combat, story, hud, ui, mp, net, emotes, minimap, admin, portal, ferries, controller, touchControls, landmarks };
  window.__landmarks = landmarks;

  // ── Screenshot mode (O): hide every bit of UI, keep the 3D world and name tags ──
  let shotTag = null;
  document.addEventListener('keydown', e => {
    if (e.code !== 'KeyO' || e.repeat || isTypingTarget(e) || overlayOpen()) return;
    const on = document.body.classList.toggle('shot');
    // Single player has no name tag of its own: show your name for the shot
    if (!mp) {
      if (on && !shotTag) {
        shotTag = nameTag((localStorage.getItem('lastName') || 'Spider-Man').toUpperCase(), '#ffd34d');
        setup.scene.add(shotTag);
      }
      if (shotTag) shotTag.visible = on;
    }
  });

  setProgress(0.99, 'Ready!');

  // ── Render loop ─────────────────────────────────────────────────────────
  let frameCount = 0;
  let fpsAccum   = 0;
  let lastFPSLog = performance.now();
  let last       = performance.now();
  let guardT     = 0;
  let miniT      = 0;

  // Per-system frame timing for QA: `__profile(120)` steps 120 frames by hand (a hidden or
  // throttled tab barely runs rAF) and returns the mean milliseconds spent in each system.
  let prof = null;
  const lap = k => { if (prof) { const t = performance.now(); prof.ms[k] = (prof.ms[k] ?? 0) + (t - prof.t); prof.t = t; } };
  window.__profile = (frames = 120, dt = 1 / 60) => {
    prof = { ms: {}, t: 0 };
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) { prof.t = performance.now(); frame(last + dt * 1000); }
    setup.renderer.getContext().finish();
    const total = performance.now() - t0, out = { frameMs: +(total / frames).toFixed(2) };
    for (const [k, v] of Object.entries(prof.ms)) out[k] = +(v / frames).toFixed(3);
    out.drawn = setup.renderer.info.render.calls + ' calls, ' + setup.renderer.info.render.triangles + ' tris';
    prof = null;
    return out;
  };
  function animate(now) { requestAnimationFrame(animate); frame(now); }
  function frame(now) {
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));   // never negative (rAF/profiling clock skew made timers run backwards)
    last = now;

    activityReporter.update(activityFor({
      mode: choice.mode,
      sub: choice.sub,
      villains: choice.mode === 'online' && !!choice.joined.room.villains,
      racing: !!race?.active,
      swinging: !!controller.webPhysics?.isSwinging,
      fighting: combat.aliveCount > 0 || (controller.attackT ?? 0) > 0,
    }), dt);

    if (!hud.paused) {
      guardT += dt;
      if (guardT > 1.5) { guardT = 0; if (controller.isGrounded && !controller.isClimbing && !dorm.active) rescueIfInside(controller); }
      const wdt = combat.worldDt(dt);   // hit-stop: the world slows for a few frames on a solid hit
      portal.update(wdt);
      lap('portal');
      driving.update(wdt);             // before the controller so its camera frames this frame's car
      controller.update(wdt);
      lap('controller');
      portal.poseRig(wdt);             // after the animator, so the gun-ready arm pose wins
      booths.update(wdt);
      dorm.update(dt);
      hud.update(dt);
      lap('hud');
      if (cityGroup) life.update(wdt);
      lap('life');
      traffic?.update(wdt);
      ferries?.update(wdt);
      lap('trafficFerries');
      heroes.update(wdt);
      lap('heroes');
      abilityBar.update();
      landmarks.update(dt, controller.root.position);
      lap('landmarks');
      combat.update(wdt);
      lap('combat');
      {   // adaptive score: calm on foot, building with swing speed, full groove in fights, boss layer on bosses
        const v = controller.velocity, sp = v ? Math.hypot(v.x, v.y, v.z) : 0, fight = combat.aliveCount > 0;
        const move = controller.isGrounded ? Math.min(0.35, sp / 30) : Math.min(0.85, 0.25 + sp / 45);
        soundtrack.setState({ energy: Math.max(move, fight ? 0.8 : 0.2), combat: fight, boss: !!combat.bossAlive }, dt);
      }
      story.update(dt);
      lap('story');
      mp?.update(dt);
      social.update(dt);
      admin.update(dt);
      lap('mpSocialAdmin');
    }
    const shake = ui.shakeOffset(dt);
    setup.camera.position.x += shake.x;
    setup.camera.position.y += shake.y;
    if (shotTag?.visible) {
      const [tw, th] = shotTag.userData.px, k = 0.03;
      shotTag.scale.set(tw * k, th * k, 1);
      shotTag.position.copy(controller.root.position).y += 1.75 + th * k / 2;
    }
    lap('misc');
    setup.tick(dt);
    setup.followSun(controller.root.position);
    lap('setupTick');
    // The minimap is a second full scene render. Ten times a second is plenty for a map and
    // removes ~50 extra city renders per second; low-end devices get four.
    miniT -= dt;
    // Phones have no minimap (the stick lives there), so skip its extra scene render entirely.
    if (miniT <= 0 && !hud.paused && !document.hidden && !dorm.active &&
        !document.documentElement.classList.contains('touch') &&
        !document.body.classList.contains('cinematic') && !document.body.classList.contains('shot')) {
      miniT = 1 / (GFX.minimapHz ?? 10);
      minimap.places = landmarks.places;
      minimap.hideOnMap ??= [setup.roofStuds];
      minimap.crowd ??= () => [...life.npcs.map(n => n.root), ...(life.cars ?? []).map(c => c.mesh)];
      minimap.render({ marker: story.markerPos, enemies: combat.enemies.filter(e => e.alive), players: mp?.dots() ?? [], lockers: booths.booths.map(b => b.root.position) });
    }
    // Drawn before the world pass: the map is copied to its own round snapshot canvas, then the
    // world render overwrites the shared GL canvas, so the square map never flickers past the frame.
    setup.render();
    lap('render');

    lap('minimap');
    frameCount++;
    fpsAccum += dt;
    if (now - lastFPSLog > 5000) {
      console.debug(`[Perf] ~${Math.round(frameCount / fpsAccum)} fps`);
      frameCount = 0; fpsAccum = 0; lastFPSLog = now;
    }
  }

  setTimeout(hideLoading, 400);
  // Single player: Story starts at the picked chapter and saves progress; Free Play is open roaming
  if (cityGroup && choice.mode === 'single' && choice.sub === 'gauntlet') {
    story.chapter = Infinity;   // straight into the endless Gauntlet loop
    story.landmarks = landmarks;
    setTimeout(() => story.start(), 900);
  } else if (cityGroup && choice.mode === 'single' && choice.sub !== 'freeplay') {
    story.chapter = choice.chapter ?? 0;
    story.saveProgress = true;
    story.landmarks = landmarks;
    story.admin = admin;
    setTimeout(() => story.start(), 900);
  }
  if (choice.mode === 'single' && choice.sub === 'freeplay') setTimeout(() => hud.toast('FREE PLAY'), 900);
  if (cityGroup && choice.mode === 'online' && choice.joined.room.villains) {
    story.chapter = Infinity; // skip the story, run endless villain waves
    setTimeout(() => story.start(), 900);
  }
  requestAnimationFrame(animate);
}

init().catch(err => {
  console.error('[main.js] Init failed:', err);
  showRetry(`Could not start: ${err?.message ?? err}`);
});

// Controls + graphics options on the settings screen
{
  const panel = document.getElementById('scr-settings');
  if (panel && !panel.querySelector('.binds-grid')) buildBindsUI(panel, panel.querySelector('.set-note'));
}
