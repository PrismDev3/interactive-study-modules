# BACKLOG — prioritised

Order: crashes → core gameplay → missing essentials → visual consistency → perf → UI → secondary → polish.
Long-range plan lives in `docs/ROADMAP.md`; this file is what's next.

## Open
0. **Night pass, next** (2026-11-11 done, see DEVELOPMENT_LOG): the menu and Free Play both run at night, but check the street-light pool while moving fast (lamp pool now refreshes at 4 Hz with top-k, 2026-11-11; low tier has no pool anyway), and screenshot the gameplay city with the window visible. Aircraft swinging is wired but the feel is untested.
0b. **Stud gifting / prefs**: server handlers and UI ship, but no two-account live test yet. Also confirm `giftReceived` toasts and the wallet re-broadcast during a real session.
0c. **Low tier**: not measured on a Chromebook. `Perf.js` low drops MSAA + shadows + street lights; check the 30 fps target on real hardware.
0. **Social, next** (2026-11-09 base is done, see Done): restyle the remaining dark-slate screens (Admin player list, chat log) to the TT text-list language used by `social.css`. Friend-room switches now reapply room flags, friend presence reports gameplay activity, the player card has Wave / High-five actions, and DM images can be reported and reviewed by the platform owner.
1. **Swing polish** (aiming fixed, see Done): open-sky web firing now has a bounded virtual anchor; live feel still needs checking. Also check the remaining 2–4 wall hits per 12 runs at junctions/wide avenues and the fall→swing hand-off using `tools/swing-bench.js` plus a visible pane.
3. **Combat, next**: feel-test the hit-stop live (tune 45/90 ms if it reads as lag). Dodge + perfect-dodge counter shipped 2026-11-11 (Left Alt); tune windows live. Dodge tip + slam ground telegraphs shipped. Leap landing telegraph shipped too. Next: play-test all combat timings at real FPS.
4. **Dead code**: `HeroRuntime.announce()` in `Characters.js` is now unused. Remove it the next time `Characters.js` is edited anyway (that edit needs 7 importer bumps).
5. **Boss Venom** still uses `venombigfig.glb` on purpose. Revisit if bigfigs should go everywhere.
6. **City payload**: runtime `city_map.obj` is 68.4 MB raw / 4.39 MB Brotli; the retained full source is 109.4 MB. `objstats.mjs` finds 1.98M vertices and 505K faces, while the current slim-city group filter removes 0 bytes. Investigate binary/worker parsing with geometry parity checks (ROADMAP Days 2–3).
7. **Licence**: replace ripped meshes/textures before any public release (`docs/AUDIT.md`).

## Done (see docs/DEVELOPMENT_LOG.md)
- Input guard (`src/Input.js`): typing in chat/Friends/settings/Bugle never fires P, Escape,
  abilities, emote wheel, minimap or screenshot hotkeys; panels are mutually exclusive and
  return focus to the game. Verified in Story Ch.1: P/W/B/O blocked while an input is the key
  target; P opens pause and Escape closes it after focus leaves.
- Real low/medium/high/adaptive graphics profiles; low removes MSAA and shadows. Adaptive
  resolution can drop shadows then draw distance after 6 s of sustained slowness.
- Minimap redraws at 10 Hz (4 Hz low) instead of every frame, and not while hidden/paused.
- Server-validated room roles: owner + admin get summon tools, one elected world host, regular
  players cannot stream entities or kick admins. `tools/qa-admin.mjs` passes 8/8.
- Locker hover previews debounce (70 ms) instead of queueing a render per hovered card;
  portrait and chat-face caches are capped at 80/60 entries.
- Audio pass (Sfx.js): sfx + ui buses into a compressor (no clipping), per-sound cooldowns, ±6% pitch variation, `play(kind, { pos, vol, pitch })` with distance fade + stereo pan from the camera (combat sounds use it). New: jump, soft touchdown, landing scaled by fall speed, web-release swoosh. Ambience has its own `ambVol` slider. Next: spatial NPC chatter/car horns, a music intensity layer in combat.
- New Room + login screens restyled (TT language, LEGO toggles); Rooms list restyled, whole row joins.
- NPC awareness (CityLife `_sense`): per-NPC mood (fan/photo/shy/grump/busy; photographer + reporter always photo), notices Spider-Man close or swinging overhead if roughly facing him, stops, turns to him, waves/cheers/takes a photo with a camera flash/grumbles, says a line sometimes. Checks every ~0.5 s staggered, 18-43 s cooldown each, max 4 reacting at once. New GlbMinifig emotes `photo`, `grumble`.
- `tools/bump.mjs <files>`: transitive `?v=` cache-bust up to index.html (use this instead of hand bumps).
- Restyled chat log, Admin panel and emote wheel to the TT text-list look (overrides at end of social.css).
- Social system (server/social.js + src/Social.js + src/social.css): mutual friend requests (no duplicates), accept/decline/cancel/unfriend, server-side block (hides chat, DMs, requests, the player's body) and mute (account-wide), presence + Join Friend (full/locked/offline/banned handled; in-game join swaps rooms without a reload), DMs with history/unread/timestamps, image upload (magic-byte check, 600 KB, 40/day, random ids at /u/), top-centre notifications (max 3, one per sender), hover outline (inverted hull, through-wall safe) + click/Y player card. Verified with two real clients; the QA bot is `tools/social-bot.mjs`, accounts in `tools/qa-accounts.json`.
- Combat: hit-stop on landed player hits; blinking wind-up tell with a red glint.
- Ability bar: a real right-side tile stack with live cooldowns, replacing the 6 s text flash.
- Swing aiming: the physics pivot is pulled toward your travel line, so wall hits dropped from ~20 to 2–4 per 12 bench runs and distance rose ~50%.
- Landing roll keeps swing momentum; ground friction no longer depends on frame rate.
- Swing, release and landing verified with the fixed-step sim.
- HUD portrait follows story and Locker outfit swaps.
- Pointer-lock rejections are no longer uncaught.
- Playable Venom is a minifig, matching the menu and gameplay scale.
- Removed the guaranteed 404 for `assets/models/character.glb` on every load.
- Menu name tag no longer floats over the chapter-select and create-room screens.
- Multiplayer state packets are validated and normalized at the server/client boundary and capped at ~45 Hz per sender; `tools/qa-player-state.mjs` covers malformed, legacy, current, and burst traffic.
- The name-entry screen's deferred focus callback is null-safe.
- Open-sky web firing now uses a bounded virtual anchor without showing a facade splat; `tools/qa-swing-target.mjs` checks its range/height math.
- Friend-room switches now reapply PvP, health, and emote permissions; `tools/qa-room-policy.mjs` covers default and configured policies.
- Friend presence now shows allowlisted gameplay activity (racing, fighting, web-swinging, story, gauntlet, villain waves, exploring); client transitions settle before reporting, and the server throttles and validates updates. `tools/qa-activity.mjs` covers client state selection, stability, server fanout, spam limits, and custom-label rejection.
- The in-world player card now offers Wave and nearby-only High-five actions. Room emote policy is enforced by the server, gesture packets are allowlisted and rate-limited, and remote players animate the received gesture briefly; the WebSocket QA checks valid, custom, and burst messages.
- Direct-message images now have a recipient-only report button. The platform owner gets a paginated, thumbnail review queue; purging an item deletes the upload, removes it from all DM histories, and refreshes online participants. Server checks confirm the report refers to an image in the reporter's own history, and only the platform owner can inspect or purge reports.
