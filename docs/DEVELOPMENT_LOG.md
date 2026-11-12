# DEVELOPMENT_LOG — engineering changes + test results

(Public day-by-day posts stay in `docs/DEVLOG.md`.)

## 2026-11-08 — session 1 (master directive start)
**Changed**
- `src/Characters.js`: the Venom hero rig gets `lego: true`, so it builds the minifig from `chars/venom_*.png` instead of `minifigs/venombigfig.glb`. The oversized bigfig cropped out of the menu frame and dwarfed Spider-Man. The boss (`Combat.js`) still uses the bigfig. Version bump to `v=51` done by the concurrent session.
- `src/CharacterController.js` (v108): `loadCharacter(null)` goes straight to the LegoSpidey rig.
- `src/main.js` (v163): passes `null` instead of the non-existent `assets/models/character.glb`, which removes a 404 and console error on every game start.
- `src/lego-ui.css` (v94): `#menu-nametag` is also hidden on `.screen.full` screens (chapter select, create room).

**Tested (in-app browser, localhost:8081)**
- Menu: Venom renders as a minifig at Spider-Man scale (screenshot).
- Chapter 1 starts; `main.js?v=163` loaded and made no `character.glb` request; rig present; no new console errors.
- Nametag opacity, with transitions disabled: 1 on the main menu, 0 on chapter select.
- Not tested: movement and swing feel. The pane was hidden and throttled to about 3 fps.

**Known**: see `docs/BACKLOG.md`.

## 2026-11-08 — session 1, part 2 (visible-pane playtest)
**Measured (Ch.1, 32 fps in the pane)**: sprint reaches 18 u/s and stops smoothly (5.1 → 0.4 u/s in 0.3 s). Before the bite, Peter's sprint is capped at 10 and his jump at 0.55× on purpose (`noPowers`). Jumping works. The web swing (`WebPhysics.js`) is a real pendulum with a rope constraint, reel-in, steering and a release fling. Not hand-tested yet, because Ch.1 has `noWebs` and you were playing during the test.

**Changed**
- `CharacterController.setVariant()` dispatches `outfitchange`. `main.js` listens and redraws the HUD portrait, so it follows story suit swaps (Ch.1 now shows Peter) and Locker changes. A stale result is ignored when the variant has moved on.
- The canvas-click `requestPointerLock()` rejection is now caught (it was an uncaught SecurityError in the console).
- Versions: `CharacterController.js?v=112`, `main.js?v=167`.

**Gotcha**: another session ("Game logo for Discord") bumped `CharacterController.js` to v110 and loaded it in the shared pane *before* my edit landed, so the browser cached the old file as immutable. If an edit doesn't show up, fetch with `{cache:'no-store'}` to compare, then bump again.

**Tested**: portrait equals `portraitURL('peter')` in Ch.1 (screenshot). Two real canvas clicks produced 0 unhandled pointer-lock rejections.

## 2026-11-08 — session 1, part 3 (swing test + landing momentum)
**Method**: the pane keeps getting hidden (rAF throttled to 2–3 fps), so the controller is stepped directly: `hero.update(1/60)` in a loop with `hero._keys` set, webs unlocked in memory only (`noWebs=false`, no save change). This gives deterministic, frame-rate-controlled results.

**Swing results** (street at x≈471, z≈1441, runs along ±x, ~26 wide, camera `_yaw=-π/2`)
- Holding W+E for 8 s: 2–3 chained swings, 110–229 u travelled, speed 17 → 26–36, never touching the ground. Anchors 29–50 above, ropes reel 49→28 and 86→50.
- Letting go of E mid-swing keeps the speed (32) plus an upward pop. Landing after 1.5 s triggers the `roll` landing.
- Swings often end by hitting a facade, then wall-run, then (with W held) climbing. See BACKLOG #1.

**Bug fixed: landings killed momentum, and the decay depended on frame rate** (`_updateGroundMovement`)
- The roll was meant to "keep its momentum", but the zero-input ground friction (`*= 0.8` per frame) ran during it: 30 → 0 in 0.4 s at 60 fps, 0.1 s at 144 fps. Then, with W held, speed snapped to 18.
- Now: no friction while rolling. Ground friction is `exp(-13.4·dt)` (identical at 60 fps). The hero-landing brake is `exp(-30·dt)`. Running out of a fast landing eases extra speed down with `exp(-4·dt)` instead of snapping.
- After the fix, with W+Shift held: 30 for the roll, then 27 → 24 → 22 → 20 → 18, the same at 30, 60 and 144 fps. With no input it rolls, then stops in ~0.4 s at both 60 and 144 fps. Sprint from rest is still 18, and stopping is unchanged. No console errors.
- Versions: `CharacterController.js?v=113`, `main.js?v=168`.

## 2026-11-08 — session 1, part 4 (swing aiming)
**Tool**: `tools/swing-bench.js` (dev-only, never imported by the game). It finds straight streets, steps `hero.update(1/60)` with W+E held for 8 s per run, both directions, and counts swings, wall hits (wall-run or climb), ground touches, and distance along the street. Usage is in the file header. The fixed set: 6 streets (3 along x at 29 wide, 3 along z at 40 wide), 12 runs.

**Cause**: anchors are facade hits, so the pendulum pivot sat on the wall line and every arc swung toward a building.

**Fix** (`WebPhysics.js`): the web is still drawn to the facade hit (`webEnd`, splat and impact), but the physics pivot (`anchor`) is pulled toward your line of travel by `pivotPull` (0.85). `visualEnd` is used for drawing, online sync (`Multiplayer.js` sends it) and body lean (`_ropeTilt`). Perch zips set `anchor` directly; `_hasEnd` is false then, so they draw as before.

| pivotPull | wall hits | ground touches | full 8 s runs | avg distance |
|---|---|---|---|---|
| 0 (old) | 18–22 | 5–8 | 1–4 /12 | 115–121 |
| 0.5 | 14 | 2 | 12 | 186 |
| 0.7 | 7 | 3 | 8 | 168 |
| **0.85** | **2–4** | **0** | **10–11** | **173–186** |

Runs vary a little with the starting web side. Visual check (a frame rendered by hand mid-swing): the web runs from the hand to the left facade while Peter swings down the centre of the street. No console errors. Versions: `WebPhysics.js?v=74`, `CharacterController.js?v=115`, `Multiplayer.js?v=72`, `main.js?v=170`.

**Note**: something clears `hero._keys` when the pane loses focus, so live held-key tests need the pane focused and visible. Use the fixed-step bench instead.

## 2026-11-09 — session 1, part 5 (ability bar)
**Found**: the bottom-centre "R WEB BOMB G TRIPLE SHOT X ZIP KICK" text was `HeroRuntime.announce()` flashing the controls into `#perch-hint` for 6 s. The real `#ability-bar` had CSS and a `GameUI.updateAbilities()`, but no markup existed and nothing called the method, so it was dead.

**Changed**
- New `src/AbilityBar.js` (imported only by `main.js`, to avoid bumping the 7 importers of `Characters.js`). It builds one tile per current-hero ability: printed key (follows rebinds), name to the left, conic cooldown sweep and seconds left read from `heroes.cool`, a red flash on use and a yellow pop when ready. The bar slides in when you start and hides while `noPowers`/`noWebs` (Ch.1 before the bite) and in cutscenes. DOM is written only when a value changes.
- `main.js`: `abilityBar.intro()` replaces `heroes.announce()`; `abilityBar.update()` runs after `heroes.update(dt)`.
- `GameUI.js`: removed the dead `updateAbilities()`.
- `lego-ui.css`: new ability-bar block (46px tiles, 38px under 820px wide, reduced-motion respected).
- Versions: `AbilityBar.js?v=1`, `GameUI.js?v=73`, `main.js?v=171`, `lego-ui.css?v=95`.

**Tested**: the pane was hidden (game loop paused), so the logic was driven directly against the live `HeroRuntime`. Tiles R/G/X were built for Spider-Man; using R showed "7", class `cooling`, `--cd 1.00` and the `fired` animation; expiry showed `ready`. `noPowers=true` locks the bar. Screenshot of the live bar: TRIPLE SHOT dimmed with sweep and "5", R and X ready. No console errors.

## 2026-11-09 — session 1, part 6 (combat feel)
**Audit**: hits already had a white flash, sparks, screen shake, knockback, a 3-hit combo with a finisher, a guard after mashing, and a 'melee' sound. Missing: **hit-stop** (no freeze frames, so hits felt weightless) and a **readable wind-up** (a melee foe's 0.45 s charge was only an arm pose).

**Changed**
- `Combat.hitPause(secs)` / `Combat.worldDt(dt)`: while paused, world time runs at 8%. Triggered only by the player's own landed hits: 45 ms per punch, 90 ms for the finisher, +30 ms on bosses, 80 ms for a dive slam that hits. Blocked hits and ally/agent fights don't pause.
- `main.js`: the controller, combat, hero abilities, pedestrians and traffic use `wdt`. The HUD, landmarks, story, online play, admin, camera shake and render keep real `dt`.
- Wind-up tell: a foe charging an attack blinks white (about 7–8 Hz, through the existing `rig.flash` channel), with a red spark glint above its head when the wind-up starts.
- Versions: `Combat.js?v=75` (in `main.js` and `Admin.js`), `Admin.js?v=70`, `main.js?v=172`.

**Tested** (scripted in the live game): combo damage 1/1/2 with pauses 0.045/0.045/0.09. `worldDt` after the finisher gave 6 frames at 0.0013, then 0.0167. A blocked hit does 0 damage with no pause. Wind-up emissive alternates 0.08/0.45 every ~4–5 frames. No console errors. Not felt live yet (the pane was shared with live input during the test).

## 2026-11-09: Gauntlet loop
- New `src/Gauntlet.js`: endless rounds with a modifier each round (Swarm, Armored, Elite Squad, Blitz, Glass Hero), a double boss Showdown every 5th round, ten boss rotation, score with a kill chain multiplier, par time speed bonus, results card plus a pick-1-of-3 perk screen (keys 1 to 3), best round/score saved in `localStorage.gauntletBest`.
- Single Player menu has a Gauntlet entry (shows your best). Online villain rooms use the same loop.
- Combat: `combat.dmgMul` (perk) and `combat.maxHearts`.
- Verified: round 1 to round 2 hand-off, results card, perk pick, no console errors. Not yet feel-tested by hand at a visible frame rate.

## 2026-11-09: Character plastic pass
- New `src/PlasticFX.js`: patches character materials in place (shared shader program) for a glossier ABS look, a colour-tinted fresnel rim, and sky/ground bounce light. Hooked into GlbMinifig (all extracted figures incl. bigfig Venom), SpideyGLB and the legacy LegoSpidey rig. Characters now receive shadows too.
- Tune live from the console: `setPlastic({ rim: 0.55, sky: 0.12 })`.
- Verified on the title Venom (A/B with the effect off), no console errors.

## 2026-11-09 — session 2 (input, graphics profiles, admin authority)
**Input**
- New `Input.js` is the single guard for gameplay hotkeys: `isTypingTarget`, `overlayOpen`,
  `closeOverlays`, `restoreGameFocus`, and `<body class="text-entry">` tracking.
- Root cause of the P bug: `LegoHud` listens for P/Escape on `document` in the **capture**
  phase, so it ran before the chat input's `stopPropagation`. The pause handler, chat,
  Friends, emotes, abilities, admin, minimap and screenshot mode now all consult the guard.
- Escape closes Friends/Chat instead of opening pause; only one panel can be open; focus
  returns to the game and held keys are released when a panel closes.
- Locker hover previews are debounced 70 ms, so sweeping a row no longer queues one full rig
  load/render per card.
**Graphics**
- `Perf.js` now has low/medium/high/auto. Low is genuinely cheap (no MSAA, no shadows,
  512 shadow map unused, ratio cap 1, far 900, 8 NPCs). Auto detects ChromeOS/≤4 cores/≤4 GB.
- `AutoRes` drops resolution, then calls `SceneSetup.degrade(1)` (shadows off) and (2) (draw
  distance ≤700, studs/clouds hidden) after sustained low frame rate; never exceeds the cap.
- Minimap renders 10 Hz (4 Hz low) instead of every frame, skipped when hidden/paused.
- `window.__loadTiming` records city load; measured 12,693 ms and 218 merged meshes here.
**Admin**
- Server elects one world host (owner 3, admin 2, lowest id tie-break) and includes it in the
  join payload + `host` broadcasts. Only the host may stream `ents`; `hitEnt` routes to it.
- Client Admin uses the real rank (≥2), updates when promoted, and is closed by pause.
- `tools/qa-admin.mjs`: 8/8 PASS against a live server (regular player cannot stream/kick an
  admin; owner promotes admin; admin becomes host when owner leaves; admin ents reach room;
  spoofed ents rejected; admin kicks a regular player).
**Verified in-game (Story Ch.1, live hero)**
- With a text input as the key target: P did not pause, W did not set `_keys`, B did not open
  emotes, O did not toggle screenshot mode. After focus left, P opened pause (`hud.paused`
  true) and Escape closed it; P/Escape round-tripped twice. No page errors from changed code.
- City load on this machine: 12.8 s, 218 merged meshes (`window.__loadTiming`). Graphics: high
  (adaptive), 32 cores. Low profile probe: no MSAA, no shadows, cap 1, far 900.
- `tools/qa-admin.mjs`: 10/10 PASS on a fresh server process, including host in the join
  payload.
- Automation limitation: programmatic focus sets `activeElement` but no `focusin` fires in a
  background pane, so the body `text-entry` class could not be exercised there. The guard uses
  the event target and was verified.
**Pending**
- Chromebook FPS and long-session memory measurements. See `docs/DEVELOPMENT_STATUS.md`.

## 2026-11-10 - cycle 2 (multiplayer state hardening)
**Found**: the server accepted any object as a player state, including `null` and objects without a position. It rebroadcast that value to every room member, while interpolation reads `s.p[0..2]` unconditionally. A malformed optional web anchor could also throw when spread into a `THREE.Vector3`.

**Changed**
- Added `src/PlayerState.js` as a shared validator/normalizer. It bounds position, rotation, speed and animation values, rejects malformed vectors/tuples, drops unknown fields, and supplies defaults for older clients.
- `server/server.js` validates before storing or broadcasting state and caps each sender at ~45 state updates per second (the game sends 15 Hz). `src/Multiplayer.js` validates both live updates and join snapshots as a second boundary.
- Added `GAME_DATA_DIR` for isolated server QA and `tools/qa-player-state.mjs`, exposed as `npm run qa:player-state`.
- Made the queued name-screen focus callback in `Menu.js` tolerate missing screen/input nodes.
- Cache versions were cascaded with `tools/bump.mjs` through `Multiplayer.js`, `main.js`, and `index.html`.

**Verified**
- `npm run qa:player-state`: 5/5 checks passed with a temporary account store; malformed packets were not broadcast, legacy packets received safe defaults, current swing/trick packets remained valid, and bursts were rate-limited.
- `node --check` passed for `PlayerState.js`, `Multiplayer.js`, `server.js`, `Menu.js`, `main.js`, and the QA script.
- Browser/visual inspection was not performed under the user's no-PC-control constraint.

**Next**
- Live-test the open-sky swing fallback and continue corner/fall-to-swing checks when a visible playtest is available.

## 2026-11-10 - cycle 3 (open-sky web fallback)
**Found**: `WebPhysics.js` promised a 20-50 m open-sky anchor but returned false if every building ray missed, so web firing stopped in open areas.

**Changed**
- Added pure `src/SwingTarget.js` math for an anchor 28-42 m forward and 24-30 m above, scaling reach slightly with horizontal speed.
- `WebPhysics.fireWeb()` now falls back to that pivot only after facade targeting fails. Facade attachment and pivot pull are unchanged; the existing swing/release caps remain the only speed limits.
- Sky links do not show a facade splat or wall-impact burst. The `webfired` event still fires, and near-vertical camera aim falls back to the character's facing direction.
- Added `tools/qa-swing-target.mjs` and `npm run qa:swing-target`.
- Cache versions were cascaded with `tools/bump.mjs` through `WebPhysics.js`, `CharacterController.js`, `main.js`, and `index.html`.

**Verified**
- `npm run qa:swing-target`: 3/3 math checks passed.
- `npm run qa:player-state`: 5/5 end-to-end WebSocket checks passed after preserving the concurrent two-hand-grip state field.
- `node --check` passed for all changed JS modules and scripts.
- No live swing playtest or visual inspection was performed under the user's no-PC-control constraint.

**Next**
- Live-test anchor feel, then continue checking corners and fall-to-swing transfer.

## 2026-11-10 - cycle 4 (city-load audit)
**Measured**
- `tools/objstats.mjs`: runtime `city_map.obj` has 1,982,164 vertex records and 505,030 faces. The file is 68,403,148 bytes with a 4,393,630-byte Brotli sidecar; `city_map.full.obj` is 109,439,315 bytes.
- The current `tools/slim-city.mjs` name filter matches no removable geometry in the runtime OBJ. Re-running it would not reduce the city payload.

**Next**
- Keep the current runtime asset intact. Evaluate a binary city format or worker-based parser with geometry parity checks before replacing it; prior baseline is about 12.7 s on a 32-core desktop.

## 2026-11-10 - cycle 5 (friend-room rules)
**Found**: `Multiplayer` only installed PvP callbacks in its constructor, and `main.js` only enabled no-damage mode on initial room entry. Join Friend updated the roster/time but left PvP, health, and emote rules from the previous room active.

**Changed**
- Added pure `src/RoomPolicy.js` and applied it at initial Multiplayer setup and every `switchRoom()`.
- Switching rooms now updates remote punch targets, `combat.noDamage`, the health HUD visibility, and dispatches the new room settings to `EmoteWheel`; a disabled emote wheel closes if it was open.
- Added `tools/qa-room-policy.mjs` and `npm run qa:room-policy`.
- Cache versions were cascaded with `tools/bump.mjs` through `Multiplayer.js`, `Emotes.js`, `Menu.js`, `main.js`, and `index.html`.

**Verified**
- `npm run qa:room-policy`: 2/2 policy checks passed.
- Player-state and swing-target QA stayed green; syntax checks passed for Multiplayer, Emotes, RoomPolicy, Menu, main, server, and QA modules.
- No UI was opened; Join Friend was not manually play-tested.

## 2026-11-10 - cycle 6 (gameplay friend presence)
**Found**: Friends could see whether someone was online and which room they joined, but the client never sent activity messages even though the server and friend list supported them.

**Changed**
- Added `src/Activity.js` to map gameplay state to a fixed set of labels: racing, fighting, web-swinging, story mission, gauntlet, villain waves, and exploring.
- The main loop now reports label changes after a short settle period, so quick combat/swing transitions do not spam friends.
- The server only accepts known labels, rate-limits activity updates, and avoids re-broadcasting unchanged presence.
- Added `tools/qa-activity.mjs` and `npm run qa:activity` for state mapping, transition behavior, connection handling, server fanout, throttling, and rejection of arbitrary labels.
- Cache versions were cascaded with `tools/bump.mjs` through `main.js` and `index.html`.

**Verified**
- `npm run qa:activity`: all four checks passed.
- Player-state, swing-target, and room-policy QA remained green; syntax checks passed for changed client, server, and QA files.
- No live browser or visual inspection was performed under the no-PC-control constraint.

**Next**
- Add player-card emotes, then continue with image reporting and owner purge tools.

## 2026-11-10 - cycle 7 (player-card gestures)
**Found**: The player card only handled account actions, although online rooms already had an emote broadcast message and both minifig rigs supported a wave pose.

**Changed**
- Added Wave and High-five buttons to the in-world player card. Emotes hide when a room disables them; gestures are disabled while airborne/climbing/swinging, and High-five also requires a player within 5 m.
- Added a distinct reaching High-five pose and a short remote gesture overlay using the room's existing `emote` event.
- The server now accepts only `wave` and `highfive` room gestures and rate-limits broadcasts.
- Extended `tools/qa-player-state.mjs` to verify the WebSocket server rejects custom and burst emotes while broadcasting a valid High-five.
- Cache versions were cascaded with `tools/bump.mjs` through affected scripts, importers, and `index.html`.

**Verified**
- `npm run qa:player-state`: 6/6 WebSocket checks passed, including gesture validation and throttling.
- Activity, swing-target, and room-policy QA remained green; syntax checks passed for Social, Multiplayer, LegoSpidey, server, and QA modules.
- No live browser or visual inspection was performed under the no-PC-control constraint.

**Next**
- Restyle the remaining Admin player list and chat log screens.

## 2026-11-10 - cycle 8 (DM image moderation)
**Found**: Recipients had no way to report an uploaded DM image, and the platform owner had no way to review reports or remove an image from stored conversations.

**Changed**
- Added a report action to received DM images. The server verifies the image and message belong to the reporter's own direct-message history, prevents duplicate reports, and rate-limits new reports.
- Added a persisted, paginated owner review queue with image previews and sender/reporter context. Only the platform owner can request or purge reports; the server independently enforces that access.
- Purging deletes the uploaded file, removes every matching image reference from DM histories, clears all reports for that file, and updates online conversation participants.
- Added `tools/qa-social-moderation.mjs` and `npm run qa:social-moderation` for report provenance, persistence, authorization, and purge behavior.
- Cache versions were cascaded with `tools/bump.mjs` through `Social.js`, `social.css`, `main.js`, and `index.html`.

**Verified**
- `npm run qa:social-moderation`: all three isolated moderation checks passed.
- Activity, player-state, swing-target, and room-policy QA remained green; syntax checks passed for Social and the moderation test.
- No PC or browser UI was controlled.

**Next**
- Continue the remaining social screen restyles, then return to gameplay polish.

## 2026-11-11 — night-city overhaul, Chromebook tiers, fixes + features
**Graphics / atmosphere**
- Night is now the default: `SceneSetup` calls `setTime('night')` in its constructor, and the shared `NIGHT_LEVEL` uniform (exported from `LegoCity.js`) drives lit interiors on the facade shader (`lego-facade-v5` cache key, so old programs are dropped). Night exposure 0.95 / environment 0.5; sunset 0.55 / 0.88; day 0.08 / 0.8.
- A pool of 4 warm `PointLight`s (5 on ultra, 3 on medium, none on low) follows the player and snaps to the nearest kerb lamps from `Props` perches (`setStreetLamps` + `_tickStreetLights`). Verified in Free Play: 4 lamps lit, intensity 26, nearest lamp 8 u from the spawn.
- `MenuScene` converted from golden hour to midnight: indigo sky with light-pollution band and sparse procedural stars, fog `0x1a1730`, moonlight key/fill/rim, 1.0 exposure, 52% lit windows. Verified by screenshot on the title screen.

**Swinging on aircraft**
- `_buildAir()` now runs in the constructor (it used to be lazy, on the first tick, *after* the controller had been handed `undefined`). `airTargets` (9: airliners + news choppers, two of them low over Midtown with searchlight cones) reach both `controller.setAirTargets` and `hero.webPhysics.airTargets`.
- `WebPhysics` supports moving anchors (`attachTarget`, `_anchorLocal`, carry momentum), avoids a `Vector3` allocation per frame in the rope path, and `_findAircraft` picks a chopper when a web misses every wall.

**Web shots**
- `Combat.webShot()` spawns from the hand (`controller.webHandWorld`), not `root.y + 1.0`; ball geometry/material are shared instead of one `SphereGeometry` per shot. Measured hand world at spawn: `(470.83, 2.83, 1447.77)` vs root `(471.37, 2.53, 1447.53)`.

**Fixes**
- `Social.js` gift handlers were attached with `net.on` inside `_build()` (no `net` in scope), which aborted boot with "net is not defined"; now `this.net`. `roomPrefs.bindNetwork(net)` moved to where `net` exists.
- `StorySkills` import versions had drifted (v2 vs v3), which loads two module instances with separate caches; unified, then bumped.
- Daily Bugle photos lazy-load via `IntersectionObserver`, keep a 720×540 box, and show a shimmer/`PHOTO UNAVAILABLE` state. All 18 Bugle links re-checked: HTTP 206, none broken.
- Boot confirmed clean in the browser: no console errors after the spawn, city ready in ~14.0 s, 213 merged meshes, 31 city draw calls.

**UI**
- Pause menu now reads Resume / Respawn / Skill Tree / Skill Select / Controls / Settings / Leave, and Settings → PLAYER ROOM carries the two live toggles (verified in the DOM).
- `#skill-detail` strip present; Skill Select panel built with 3 slots; `storySkills.active()` gates the gameplay effects.

**Not verified / open**
- Live 2-account stud gifting, per-player prefs round-trip, aircraft swing feel, and low-tier FPS on a real Chromebook. Gameplay screenshots were blocked because the browser window was minimized (capture returns an empty image).

## 2026-11-11 — performance + Locker pass
- City bake cache in IndexedDB (SceneSetup): warm load 877 ms vs 11,672 ms cold, same geometry fingerprint. `__loadTiming.stages` added.
- `window.__profile(frames)` in main.js: per-system ms with hand-stepped frames.
- Roof studs → 60 m cells + near/far LOD + 230 m range. StaticMerge.js on ferries, booths, street sets. Civilians: frustum cull, animation/shadow LOD. Minimap: no shadow pass, no studs.
- High tier spawn street ~51 → ~21 ms CPU/frame (stepped, not FPS); low tier 3.6 ms.
- Locker: preview LRU, lazy gear thumbnails, reused portrait rig, readable tile labels.
- keepTris drops the stale BVH index. swing-bench presses E on the edge (0 wall hits in 6 runs).

## 2026-11-12 — Audio overhaul
- `src/AudioCore.js` (new): shared AudioContext, master/sfx/ui/music(duck)/amb buses, limiter, live settings (masterVol, uiVol, mute added to Settings defaults), suspend on hidden tab, `duckMusic()`.
- `src/Sfx.js` rewritten on AudioCore: priority + voice budget, per-key cooldowns, variants, new reward/UI/match/movement sounds, `setMotion` wind loop. `src/Music.js` adaptive layers driven by `soundtrack.setState` from main.js; `resolve()` after missions.
- Hooks in LegoHud, Combat, Story, Multiplayer (state-derived remote sounds, no audio over the network), Race, Outfit, Progress, PauseSettings + index.html settings rows. PauseSettings now imports the same Settings module URL as everything else (was a second instance, so its sliders never reached Music live).
