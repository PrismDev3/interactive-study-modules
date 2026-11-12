# DEVELOPMENT_STATUS — Web of Bricks

Last updated: 2026-11-09 (session 2). Read this before resuming; it records what is real,
what was measured, and the exact next task.

## Current implementation phase
Phase 1 (input reliability) and the first two performance foundations are implemented and
verified. Phase 4 (role-based admin authority) is implemented and verified against a live
server. Larger content phases (interiors, apartments, movie theatre) are not started.

## Measured baseline (same machine, localhost, Chromium via preview)
| Metric | Value | Source |
|---|---|---|
| City parse + merge | **12,693 ms** | `[Perf] city ready in 12693 ms · 218 merged meshes` |
| City draw calls after merge | **218 meshes** (from 148 OBJ meshes / 31 material draw calls) | console |
| Device profile detected | **high** (32 cores, non-ChromeOS) | `[Perf] graphics: high (adaptive)` |
| Original LOW profile | antialias **on**, shadow map **1024 on** | prior `Perf.js` (bug) |
| Minimap scene renders | **~60/s** → **10/s** (low: 4/s) | prior `main.js`; now throttled |

No before/after FPS figure was captured in a visible browser pane, so no FPS speedup is
claimed. The minimap and profile changes remove work structurally; measure on a Chromebook
before quoting numbers. The `[Perf] adaptive` console lines report when a downgrade happens.

## Completed this session
### Input reliability (Phase 1)
- New `src/Input.js`: `isTypingTarget`, `overlayOpen`, `closeOverlays`, `restoreGameFocus`,
  plus `<body class="text-entry">` tracking. Imported by the pause menu, chat, Friends,
  emotes, admin, abilities, minimap, screenshot mode and main.
- **P while typing no longer pauses**: the pause handler is capture-phase on `document`, so
  it now returns when the event target is an input/textarea/select/contenteditable.
- **Escape closes Friends/Chat instead of opening pause**: pause yields Escape whenever
  another overlay owns the keyboard; Social handles Escape at document level even when focus
  is on a row/button (not just the message input).
- Menus are mutually exclusive: opening pause/Friends/emotes/admin dispatches
  `close-overlays`; each panel closes cleanly. Chat closes when another panel opens.
- Focus is returned to the game when pause/Friends/emotes close, and held keys are released.
- Chat no longer opens over pause/Friends/Bugle board/text fields; `T`/`Enter` are guarded.
- Admin/summon/ability/minimap/screenshot keys all respect typing and open overlays.
- Skin previews: locker hover is debounced 70 ms, so sweeping across cards no longer queues a
  full rig load + render per card (the existing `Portrait.js` cache is unchanged).

### Graphics profiles (Phase 2, Chromebook)
- `src/Perf.js` rewritten: **low / medium / high / auto (adaptive)**.
  - low: no MSAA, **no shadow maps**, ratio cap 1, min 0.6, far 900, 8 NPCs, 6 cars.
  - medium: no MSAA, 1024 shadows, ratio 1.25, far 1600, 20 NPCs, 14 cars.
  - high: previous high profile, ratio 2, 2048 shadows, far 4000.
- Auto detects ChromeOS / ≤4 cores / ≤4 GB as low. `localStorage.gfx` overrides
  (`low|medium|high`; absent = adaptive). Settings UI now offers all four.
- `AutoRes` now drops resolution first, then calls `SceneSetup.degrade(1)` after 6 s sustained
  below ~30 fps (shadows off), then `degrade(2)` (draw distance ≤700, roof studs + clouds
  hidden). It never upgrades past the profile cap.
- Low profile verified by importing `Perf.js?probe` with `gfx=low`:
  `{quality:'low', aa:false, shadows:false, maxRatio:1, far:900}`; medium is distinct.
- The minimap now renders at the profile's rate (12/8/4 Hz for high/medium/low) instead of
  every frame, and is skipped while the tab is hidden, paused, in a cutscene or screenshot.
- Medium and low skip the 70,001 roof-stud meshes; high keeps them.
- `SceneSetup.loadCity` records `window.__loadTiming` (total ms, merged meshes) and logs it.

### Administrator authority (Phase 4)
- Server elects one **world host** per room: highest-rank connected player (owner 3, admin 2;
  mods are not enough), lowest id breaks ties. `host` is in the `joined` payload and broadcast
  on join/leave/rank changes.
- Only the host may send `ents` (summoned characters); `hitEnt` is routed to the host. This is
  server-side, not a client flag. Regular players cannot stream entities.
- Client `Admin` now receives the real rank, is usable at rank ≥2, updates live when promoted,
  closes on pause, and clears stale ghosts when it gains host duty.
- Owner can promote to admin; admins cannot promote to admin (only owner, value < own rank),
  cannot act on equal/higher ranks, and bans stay owner-only. Existing server rules retained.

### Verification
- `node --input-type=module --check` passes on every edited module and `server/server.js`.
- `tools/qa-admin.mjs` against a live server: **10/10 PASS** — join payload names the host
  for the owner and for a later joiner; regular player cannot stream, cannot kick an admin;
  owner promotes admin; admin becomes host when owner leaves; admin's ents reach the room;
  spoofed ents rejected; admin kicks a regular player.
- Browser (Story Ch.1 live, `window.hero` present): with a text input as the key target, P did
  **not** pause, W did **not** set the movement key, B did **not** open emotes and O did **not**
  enter screenshot mode. After focus left the input, P opened pause (`hud.paused === true`) and
  Escape closed it; reopening and closing again also worked. The mini-map/decor and city loaded
  with no page errors from the changed modules (console shows only existing loader logs).
- The `text-entry` body class could not be exercised in the automation pane: programmatic
  `focus()` sets `activeElement` but Chrome fires no `focusin` in a background pane. The guard
  itself branches on the event target, which was verified above. Re-check the class in a
  normal focused browser.
- **Not tested**: live Chromebook FPS, memory over a long session, two-browser UI playtest of
  the Friends panel (Social requires two logged-in accounts), Daily Bugle interior (not built).

## Known bugs / limitations
- `docs/BACKLOG.md` #2: `Menu.js` `$('scr-name')` null risk on reload (still unverified).
- Menu buttons can be hard to click in the automation browser because the 3D canvas sits over
  the menu layer; keyboard/menu navigation works. This affects QA, not necessarily players.
- City OBJ is 68 MB on disk (4.2 MB brotli sidecar). First load is still parse-bound (~12.7 s
  here). Streaming/chunking the OBJ would be the next large loading win.
- Daily Bugle is still an exterior rooftop sign; `MountChoctaw` is the photo archive overlay,
  not an enterable building.
- Story mode remains the 6 existing arena chapters; no new campaign content added.
- Admin counts/roles live in server memory per room (not persisted across a server restart).

## Exact next tasks (in order)
1. **Measure low profile on a Chromebook**: record FPS in a busy street before/after
   `gfx=low`, and check `[Perf] adaptive` logs during 10 minutes of play.
2. **Memory audit**: repeat enter/leave room 10× and record `performance.memory`; inspect
   `Combat`/`CityLife` for per-frame allocations. Add disposal only where measurements show a
   leak.
3. **Daily Bugle**: build an enterable lobby (reception, newsroom, stairs) with its own
   deferred interior load; keep the exterior sign and reuse existing materials.
4. Remaining BACKLOG items: Menu null-safety, group chats, shop expansion, suit transformation.

## Architectural decisions
- No build step, no new dependencies. Plain ES modules + `?v=` cache-busting via
  `node tools/bump.mjs <files>`.
- Input guard is a leaf module (`Input.js`) so no import cycles.
- One authoritative host for summoned entities avoids duplicating world state across clients.
- Quality changes prefer renderer-level switches (shadow map, pixel ratio, camera far) over
  removing content; no geometry is deleted to gain performance.
