# PROGRESS

Last updated: 2026-11-11 · cycle 9

## State of the request list

Legend: **DONE** = implemented and verified · **LANDED** = implemented, browser/server test
still owed · **PARTIAL** = some of it exists · **OPEN** = not started.

### Bug fixes & performance
| Item | State | Notes |
|---|---|---|
| P while typing in chat | DONE (previous session) | `src/Input.js` guard used by pause handler; re-read this session. |
| Chromebook exponential lag | PARTIAL | low/medium/high/adaptive profiles, no MSAA or shadows on low, minimap throttled. City parse is still ~12.7 s and is the remaining cost. |
| Loading / Daily Bugle load | OPEN | Daily Bugle is the `MountChoctaw` photo overlay; it has no deferred interior load yet. City OBJ is 68 MB / 4.2 MB brotli. |
| Escape closes Friends/Chat | DONE (previous session) | `Social.js` document-level Escape + chat input handler; pause yields via `overlayOpen`. |
| Settings opening while chat active | DONE (previous session) | pause handler returns on `isTypingTarget`/`overlayOpen`. |
| Admin permissions | DONE (previous session) | server-elected host rank, `tools/qa-admin.mjs` 10/10. |
| Multiplayer player-state packets | DONE (local WebSocket QA) | Server rejects malformed vectors/animation fields, normalizes older clients, and caps updates at ~45 Hz; render client validates again before interpolation. |
| Friend-room policy switching | DONE (policy QA + syntax) | PvP targets, damage immunity/health HUD, and emote access now follow the newly joined room. |
| Friend gameplay presence | DONE (client/server QA) | Friends see allowlisted race, combat, swing, story, gauntlet, villain-wave, or exploration activity; client changes settle and server updates are throttled. |
| Player-card emotes | DONE (WebSocket QA + syntax) | Wave and nearby-only High-five use the room's emote policy and broadcast through validated, rate-limited server events. |
| DM image reporting and purge | DONE (isolated social QA + syntax) | Recipients report images from their own DM history; platform owner can inspect a paginated queue and purge the image plus all history references. |
| Name-screen focus callback | DONE (static check) | `Menu.js` now tolerates the name-screen/input nodes being absent when its queued animation-frame callback runs. |
| Open-sky web fallback | LANDED (math QA) | No-hit shots use a bounded forward/up anchor, preserve the existing swing/release caps, and omit the false facade splat. Live feel test remains. |
| Map glitching / clipping / windows / floating engines | PARTIAL | `LegoCity.js` repairs floating trim and bridge props; `Ferries.js` replaces the OBJ boats (`Boats` group skipped). No fresh visual audit this session. |
| Skin hover delay | LANDED | 85 ms debounce in `Menu.js`; portrait cache capped. Still loads the rig on first hover; prewarming not done. |
| Iron Spider as a skin | **LANDED** | `Characters.js` hero removed; `Outfit.js` migrates saves. |
| In-game settings | **LANDED** | `PauseSettings.js`, pause menu row, CSS. |

### Character & asset
| Item | State |
|---|---|
| Venom rigging | OPEN — needs visual inspection; big-fig GLB with decoded anims. |
| Miles Morales skin | OPEN — `miles` variant recolours the classic texture; no bespoke hoodie/sneaker design. |
| Green Goblin + glider redo | PARTIAL — `goblin` hero uses `greengoblin.glb` + `goblin_glider.glb`; not rebuilt. |
| Emote polish | OPEN |
| Shop expansion | OPEN |

### Features
| Item | State |
|---|---|
| Admin Portal Gun | DONE (previous session, `PortalGun.js`; admin door in `Admin.js`) |
| Group chats | **LANDED** |
| Peter ↔ suit toggle | PARTIAL — `ChangeBooth.js` exists (change booths in the city); `peter` variant exists. Not audited this session. |
| Oscorp / Bugle interiors | PARTIAL — Oscorp facility DONE (see cycle 9); Daily Bugle interior still OPEN |
| Peter's apartment / Aunt May's house | OPEN |
| Player apartments for 4 + movie screen | OPEN |

## Cycle 9 — Oscorp facility and cutscene staging

### Built
- `src/Oscorp.js` (~700 lines): corporate cladding on the existing 92 m tower, podium, canopy,
  bollards, planters, pylon, OSCORP signage, green edge lighting.
- Enterable ground floor reached by cutting a 7 × 4.76 m doorway through the city block wall
  (`cutOpening` subdivides the large city triangles, drops the pieces inside the door box, then
  rebuilds geometry + BVH). Lobby, reception, security desk, elevators, seating, DNA hologram,
  corridor, two labs, benches, containment tanks and equipment. 57 collision volumes, merged
  draw batches, interior lighting and floor overlay; signs face the player.
- `Landmarks.js` builds the facility at the tower and exposes `places.oscorpEntrance`,
  `oscorpLobby`, `oscorpLab`, `oscorpFacility`, `oscorpAnchors`
  (`plaza`, `entrance`, `lobby`, `reception`, `lab`, `labTank`, `labBench`, `labWest`, `corridor`).
  The old street-level science-expo geometry was removed.
- `main.js` treats `indoor` as playable ground so the rescue check no longer teleports players
  out of the facility.

### Story / cutscenes (all missions, not just Oscorp)
- New `_cutscene` staging: speakers and listeners are placed on clearance-checked marks on the
  real floor, facing the group; `_establishMark` opens with a wide shot of the actual location.
- Dialogue cuts between medium / close / OTS / wide / low shots chosen per line, with optional
  `shot:` and `gesture:` cues. Shots are off-axis when people stand close together.
- Lens placement is actor- and geometry-aware: aim line clear of walls and props, at least
  1.6 m from the subject and 1.9 m from every other actor. Pedestrians within 14 m of the scene
  are hidden for the duration.
- Chapter updates: The Bite is staged in the Oscorp lab on the tank anchors; The Missing
  Scientist, Something in the Laboratory and The Octavius Experiment use `oscorpLab`; The Osborn
  Legacy uses `oscorpLobby`. New `point`, `operate` and `listen` emotes on both rigs
  (`LegoSpidey.js`, `GlbMinifig.js`).
- `CharacterController` accepts `cinematic.cam/look/fov` marks and `cut` for hard cuts, and
  freezes the actor during scenes.

### Checked
- Facility builds in-browser: `[Oscorp] facility at 452, 2.3, 1294 · 57 collision volumes`.
- Interior and exterior inspected by screenshot earlier in the cycle (lobby ceiling, lights,
  reception, hologram, tanks, signage, tower cladding).
- Shot audit over 15 subject/shot permutations in the lab: every mark clear of geometry, lens
  1.6–5.8 m from the subject and ≥ 1.9 m from the other actors.
- `node --check` clean for every changed module; cache versions bumped through
  `tools/bump.mjs` (`index.html` → `main.js?v=473`).

### Outstanding
- Final visual pass of the new off-axis cutscene framing was not captured: the browser tab was
  `document.hidden` (window minimised), so WebGL stopped drawing and `preview_screenshot`
  refused. Re-check The Bite in story mode with the window visible.
- Live walk-in through the doorway and interior collision were not re-walked in this pass for the
  same reason (the physics loop only runs while the tab is visible).
- Daily Bugle interior still OPEN.

## Verified numbers this session
- No FPS measurement was taken (browser disconnected twice before a gameplay frame could be
  inspected). Do not quote a speedup.
- Server starts cleanly on port 8080 after loading the new social module.
- `npm run qa:player-state`: 6/6 checks passed against a temporary isolated server and account store, including gesture validation and throttling.
- `npm run qa:swing-target`: 3/3 anchor geometry checks passed at rest, high speed, and reverse travel.
- `npm run qa:room-policy`: 2/2 policy checks passed for configured and missing flags.
- `npm run qa:activity`: 4 checks passed for activity selection, transition stability, connection behavior, server fanout, throttling, and label validation.
- `npm run qa:social-moderation`: 3 checks passed for report provenance/persistence, owner-only access, and image/history purge.
- `node --check` passed for the changed server, multiplayer, menu, state helper, QA script, and main entry point.
- No live browser or visual inspection was performed under the no-PC-control constraint.

## Next tasks, in order
1. Continue social polish: restyle the remaining Admin player list and chat log screens.
2. Two-account group chat test (create → send → history → leave → restart).
3. Skin preview prewarm + placeholder frame while the rig loads (the remaining hover delay).
4. Loading: defer `MountChoctaw` image loading until the board opens; stream/chunk the city OBJ.
5. Visual audit of windows/roof props and the Venom rig; record screenshots.
