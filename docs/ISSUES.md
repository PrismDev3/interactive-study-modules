# ISSUES

Open problems, with enough detail to act without re-discovering them.

## 1. Daily Bugle / loading (high)
`assets/models/city_map.obj` is 68.4 MB raw (65.2 MiB; 4.39 MB Brotli); `city_map.full.obj` is
109.4 MB. The runtime file has 1,982,164 vertex records and 505,030 faces; parse dominates
first load (~12.7 s on a 32-core desktop). `tools/objstats.mjs` found that the current
`slim-city.mjs` name filter would remove 0 bytes, so rerunning it will not help. `MountChoctawImages.js`
is the photo archive, not an enterable building. Next: investigate a binary format or worker
parser, and compare rendered geometry before switching. `window.__loadTiming` is the baseline.

## 2. Chromebook frame rate (medium)
Low profile removes MSAA and shadow maps and caps the pixel ratio at 1, but no Chromebook
measurement exists in this repo. `AutoRes` drops resolution then calls `SceneSetup.degrade`.
Verify the `[Perf] adaptive` path on real ChromeOS hardware before claiming it is fixed.

## 3. Skin preview first-hover delay (medium)
`Menu.js` debounces hover 85 ms and `Portrait.js` caches images, but the first hover of a suit
still builds a new `LegoSpidey` rig. Next: keep the previous frame visible, or prewarm the
current page's rigs during idle (`requestIdleCallback`) — cap concurrency to 1.

## 4. Venom rig / Miles texture / Goblin rebuild (medium, visual)
No inspection this session. Venom is `venombigfig.glb` with 70-joint decoded clips; Miles is a
recolour of the classic texture. Both need a visual pass before changing code.

## 5. Map geometry (medium)
`LegoCity.js` already removes floating trim and props over bridges, and `SceneSetup` skips the
OBJ `Boats` group (replaced by `Ferries.js`). Remaining reports of broken windows and clipping
have not been reproduced with coordinates. Next: walk the spawn street and the bridge ramps,
note world coordinates, then fix by rule rather than by hand-placed exceptions.

## 6. Interiors / apartments / cinema (large, not started)
No interior system exists. Any implementation needs: a portal volume on landmark facades, a
separate scene or offset room with its own collision set, deferred asset load, and a return
trigger. Player apartments additionally need per-player ownership, 4-slot invites, and a movie
screen. Do not half-build this; design the room container first.

## 7. Combat feel / emotes (low)
`docs/BACKLOG.md` #3 and the emote request are still open. Hit-stop exists; the live feel has not
been re-tested since it was added.

## Fixed this cycle
- Room state packets used to accept `null`, arrays, partial vectors, and malformed animation data. The server now normalizes supported fields before storing/broadcasting, caps each sender at ~45 Hz, and the client validates snapshots and updates before interpolation. End-to-end regression coverage is `tools/qa-player-state.mjs`.
- The queued name-screen focus callback in `Menu.js` is null-safe.
- `WebPhysics.fireWeb()` returned false in open sky despite its documented fallback. It now uses a speed-scaled 28-42 m forward, 24-30 m higher virtual pivot, with no facade splat/impact burst and no extra velocity boost. Live feel still needs checking.
- Friend-room switching left the old PvP, health, and emote settings active. Room policy now updates remote punch targets, damage immunity/health HUD, and the emote wheel on each switch; `tools/qa-room-policy.mjs` covers flag normalization.
- Iron Spider existed twice (hero + `iron` suit). Now only the suit; saves migrate.
- No in-game settings. Now `PauseSettings.js` inside the pause menu.
- No group chats. Now server-backed groups with history, unread and leave.
