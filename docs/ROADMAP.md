# ROADMAP — LEGO Spider-Man: Web of Bricks

A 12-week, 84-day path from "impressive prototype" to "demo people download and stream".
One day = one shipped slice = one devlog post.

---

## How to use this

- **One day is one slice.** If you finish early, take the stretch task. If you run out of day, ship what works and move the rest to tomorrow — never skip the post.
- **Every day ends with:** game runs, zero console errors, `?v=` versions bumped, one screenshot or clip captured, one devlog line posted.
- **Claude / Buffy prompt shape:** paste the day block verbatim, plus "here are the files: …" and "done means: …". The days are written so that a coding agent can execute them without design decisions.
- **Sunday is a clip day.** No new systems. Record the week, write the recap, fix the worst thing you noticed.
- **Never do two pillars in one day.** Ass feel and audio both landing half-finished is how prototypes die.

### Version rule (this repo's #1 footgun)
Every module edit needs the `?v=` bumped in **every** importer, up to `index.html`, or browsers serve the old file from `immutable` cache.

```bash
# bump the module's importers by hand, then:
perl -i -pe 's/main\.js\?v=(\d+)/"main.js?v=".($1+1)/e' index.html
node --input-type=module --check < src/<edited>.js
```

---

## Where the game is today

| System | State |
|---|---|
| Engine | Three.js ES modules, no build step, ~15,200 lines over 33 modules |
| City | Runtime `city_map.obj` is 68.4 MB raw / 4.39 MB Brotli; retained `city_map.full.obj` is 109.4 MB. |
| Movement | Third-person, wall run, climb, web swing (`CharacterController` 1,363 lines, `WebPhysics`) |
| Combat | Hearts, punching, projectiles, LEGO break-apart, **10 bosses** (`Combat` 1,057 lines) |
| Story | 6 chapters, ~40 missions, cutscenes with cast + intro/outro (`Story` 561 lines) |
| Customisation | 10 painted suits, locker, gear, emotes, stud wallet (localStorage) |
| Online | Rooms, chat, nametags, minimap, scrypt accounts (`server/server.js` 374 lines) |
| Audio | **141 lines of synth SFX. No music, no ambience, no voice.** |
| UI | `lego-ui.css` tokens, Lilita One, 3D menu (`MenuScene`), brick loading bar |
| Known gaps | One generic falling pose, HUD still partly ripped art, no server profile, DS-ripped meshes/textures |

**Already done — do not redo:** design tokens, fonts, main menu, loading screen (Phase B part 1).

---

## The ten AAA bars

Judge every day against these. They're the difference between "cool hobby project" and "this guy is building something".

1. **Performance** — 60 fps at 1080p, 1% low ≥ 45, no frame over 33 ms while swinging through the city.
2. **Load** — menu interactive under 5 s; city playable under 20 s on a 50 Mbps line; no 104 MB single download in the play path.
3. **Input** — under ~80 ms perceived latency; every action answers with sound *and* camera, not just animation.
4. **Audio** — music in menu, city, combat and boss fights; full SFX coverage; a mixer that ducks music under dialogue.
5. **Presentation** — nothing untextured or default-Three.js in the play path; consistent brick lighting; no "programmer art" in the first 60 seconds.
6. **Persistence** — one server profile per account (studs, suits, story %, settings), offline-safe, migrates cleanly.
7. **Onboarding** — a stranger can play 10 minutes with the game teaching them, not a text wall.
8. **Accessibility** — subtitles, remap, hold-vs-toggle, reduced motion, colourblind-safe HUD, text scaling.
9. **Content** — 3+ hours authored, 6 bosses with two phases, 20 minutes of side activity.
10. **Ship-readiness** — trailer, press kit, 3 store screenshots, crash-free 30-minute session, critical bugs at zero.

---

## Phases at a glance

| Week | Days | Theme | Ends with |
|---|---|---|---|
| 1 | 1–7 | Measure, then fix what's actually slow | A perf baseline you can quote |
| 2 | 8–14 | Movement and camera feel | Traversal montage clip |
| 3 | 15–21 | Combat feel | A boss fight worth watching |
| 4 | 22–28 | Traversal content, city life | City tour clip |
| 5 | 29–35 | Audio — the biggest missing pillar | Before/after sound clip |
| 6 | 36–42 | HUD, menus, presentation | UI before/after |
| 7 | 43–49 | Cinematics and camera language | Cutscene clip |
| 8 | 50–56 | Persistence and progression | Two-account sync demo |
| 9 | 57–63 | Onboarding and accessibility | "Stranger plays" notes |
| 10 | 64–70 | Story content pass | Chapter reel |
| 11 | 71–77 | Systems content pass | New enemy + boss showcase |
| 12 | 78–84 | Demo, press, launch | **Public demo on itch** |

---

## Week 1 — Measure before you touch anything

### Day 1 — Baseline, not vibes
- **Do:** add an F3 overlay (fps, frame ms, draw calls, triangles, geometries/textures). Log timestamps for: HTML parsed, menu interactive, city bytes loaded, hero spawned, first frame in city.
- **Files:** `src/SceneSetup.js`, `src/main.js`
- **Done:** numbers copied into `PERF.md`; menu still loads clean.
- **Post:** "day 1: didn't touch the game, just measured it. 104MB city, 3,271 draw calls, 47fps downtown. now i know what to fix."

### Day 2 — Break the 104 MB wall
- **Do:** stream the city in three chunks with real byte progress, and let the menu stay interactive the whole time. No bar stuck at 99%.
- **Files:** `src/main.js`, `server/server.js`
- **Done:** play button unlocks as soon as the near-city chunk is in; far chunk arrives silently.
- **Post:** "day 2: the 104MB city now loads in 3 pieces behind the menu. you can browse suits while the boroughs arrive."

### Day 3 — Slim the city
- **Do:** run `tools/slim-city.mjs` to drop interior/hidden geometry, re-export, re-measure. Target 40% smaller.
- **Files:** `tools/slim-city.mjs`, `assets/models/`
- **Done:** `PERF.md` shows the new size and the fps delta; city looks identical from street level.
- **Post:** "day 3: deleted 41% of the city. same skyline from every street, 40MB lighter."

### Day 4 — Zero console errors
- **Do:** add an on-screen error toast; play 10 minutes across menu, story, online; fix everything that logs.
- **Files:** `src/main.js`, `src/GameUI.js`
- **Done:** clean console for a full session.
- **Post:** "day 4: played for 10 minutes and fixed every console error. boring day, real bug list."

### Day 5 — The frame budget
- **Do:** use `renderer.info` + profiler to find the top 3 costs (shadows, material count, city draw calls). Fix the worst one.
- **Files:** `src/SceneSetup.js`, `src/LegoCity.js`
- **Done:** measurable fps gain recorded in `PERF.md`.
- **Post:** "day 5: shadows were eating 9ms a frame. halved the map size, gained 14fps."

### Day 6 — Input latency
- **Do:** trim double-rAF, check pointer lock, make jump/dodge/hit fire on the same frame as the keypress. Verify keyboard, mouse, gamepad all feel equal.
- **Files:** `src/CharacterController.js`, `src/UiKit.js`
- **Done:** side-by-side of "press → animation frame" under 80 ms.
- **Post:** "day 6: the punch used to come out 3 frames late. it's 1 now and the whole game feels tighter."

### Day 7 — Recap + worst bug
- **Do:** 60-second clip, week summary, fix the single ugliest thing you saw.
- **Post:** "week 1 done: baseline 47fps, now 58. city 104MB → 61MB. clip inside."

---

## Week 2 — Movement and camera (the feel week)

### Day 8 — Three landings, not one
- **Do:** split the generic fall pose into hard landing, soft landing, stumble-on-slope. Blend by fall speed.
- **Files:** `src/LegoSpidey.js`
- **Done:** drop from 3 heights, each reads differently.
- **Post:** "day 8: falling off a roof now has 3 different landings depending on how far you dropped."

### Day 9 — Fall → swing hand-off
- **Do:** a falling player who webs mid-air snaps into the arc without the current teleport-y hitch; add a small anticipation pose.
- **Files:** `src/WebPhysics.js`, `src/LegoSpidey.js`
- **Done:** 20 consecutive mid-fall swings, no popping.
- **Post:** "day 9: fixed the moment you catch a web mid-fall. no more teleport, just a snap and a swing."

### Day 10 — Air control
- **Do:** dive (steer down), air drift, and a ceiling-clip guard.
- **Files:** `src/CharacterController.js`
- **Done:** you can steer a fall onto a specific rooftop.
- **Post:** "day 10: you can aim a fall now. dove off the Bugle and landed on a moving cab."

### Day 11 — Camera language
- **Do:** FOV kick with speed, look-ahead when turning, pull-in on wall collision.
- **Files:** `src/CharacterController.js`
- **Done:** no camera inside geometry in 10 minutes of swinging.
- **Post:** "day 11: speed finally *looks* fast. fov widens as you accelerate, camera stops clipping walls."

### Day 12 — Wall run + crawl polish
- **Do:** dust puffs on wall contact, footstep rhythm, slight camera roll on wall run.
- **Files:** `src/CharacterController.js`, `src/Effects.js`
- **Done:** wall run reads without HUD hints.
- **Post:** "day 12: wall-running has dust, weight and a tiny camera roll. costs 4ms, worth it."

### Day 13 — Footsteps that match the ground
- **Do:** surface-aware footsteps (asphalt, roof, grass, puddle) driven by a small lookup, tied into `Sfx`.
- **Files:** `src/Sfx.js`, `src/CharacterController.js`
- **Done:** you can hear which surface you're on with eyes closed.
- **Post:** "day 13: added 6 footstep surfaces. you can hear the difference between a roof and a wet street."

### Day 14 — Recap: traversal montage
- **Do:** record the best 45 seconds of movement you can produce today, no cuts.
- **Post:** "week 2: spent it entirely on how it feels to move. one unbroken clip, no cuts."

---

## Week 3 — Combat feel

### Day 15 — Impact
- **Do:** 60 ms hit-stop, camera shake scaled by damage, floating damage numbers, hit spark.
- **Files:** `src/Combat.js`, `src/Effects.js`
- **Done:** a single punch reads as a hit with the screen muted.
- **Post:** "day 15: added hit-stop. 60ms of frozen time per punch and the combat stopped feeling like tumbling laundry."

### Day 16 — Enemies that warn you
- **Do:** wind-up flash + audio cue on every enemy attack; ranged enemies telegraph before firing.
- **Files:** `src/Agent.js`, `src/Combat.js`
- **Done:** you can dodge reactively without guessing.
- **Post:** "day 16: every enemy now flashes before it swings. the fights went from coin-flip to readable."

### Day 17 — Dodge with a purpose
- **Do:** dodge i-frames, a perfect-dodge slow-mo of 250 ms, counter window.
- **Files:** `src/CharacterController.js`, `src/Combat.js`
- **Done:** perfect dodge triggers consistently; nothing else broke.
- **Post:** "day 17: perfect dodge gives you 250ms of slow motion and a free counter. it's the best thing in the game now."

### Day 18 — Combo and finisher
- **Do:** combo counter with decay, third-hit launcher, finisher on downed enemies.
- **Files:** `src/Combat.js`, `src/LegoSpidey.js`
- **Done:** a 5-hit string flows without animation resets.
- **Post:** "day 18: 5-hit chains with a launcher on the third. the last hit breaks them into bricks."

### Day 19 — Boss framework
- **Do:** two-phase bosses: phase swap at 50%, intro card, music hook, arena change.
- **Files:** `src/Combat.js`, `src/Story.js`
- **Done:** Vulture and Goblin both flip phase once.
- **Post:** "day 19: bosses now have a phase 2. vulture drops his wings and starts dive-bombing."

### Day 20 — Death and retry
- **Do:** instant restart, death cam, a one-line "why you died" tip.
- **Files:** `src/Combat.js`, `src/GameUI.js`
- **Done:** dying and retrying takes under 2 seconds.
- **Post:** "day 20: death → retry is now 1.8s and it tells you what killed you instead of just fading to black."

### Day 21 — Recap: boss clip
- **Post:** "week 3: combat week. one boss fight, no commentary, judge it yourself."

---

## Week 4 — Traversal content and city life

### Day 22 — Web-zip points
- **Do:** marked zip anchors on landmarks, hold-to-zip, arrival animation.
- **Files:** `src/WebPhysics.js`, `src/Landmarks.js`
- **Done:** zip across 3 landmarks without touching the ground.
- **Post:** "day 22: zip points on 12 landmarks. the city is a playground now, not a backdrop."

### Day 23 — Fast travel
- **Do:** unlocked map points, a swing-in arrival, a short cooldown so it doesn't replace traversal.
- **Files:** `src/Minimap.js`, `src/Progress.js`
- **Done:** travel from the Bugle to Harlem in one action, unlocked per landmark visited.
- **Post:** "day 23: fast travel unlocks per landmark you actually visit. no free map, you earn the shortcuts."

### Day 24 — Race mode
- **Do:** finish `Race.js`: checkpoints, ghost of your best run, per-course leaderboard via the server.
- **Files:** `src/Race.js`, `server/server.js`
- **Done:** two accounts post scores to one board.
- **Post:** "day 24: time trials work. my best run is 41.2s and you can try to beat it online."

### Day 25 — Civilians react
- **Do:** crowd cowers, cheers, points, takes photos when you swing past; avoid the uncanny.
- **Files:** `src/CityLife.js`
- **Done:** walking through a block produces at least 4 distinct reactions.
- **Post:** "day 25: people on the street now look up when you swing past. some clap, some film you."

### Day 26 — Collectibles
- **Do:** hidden bricks with pickup VFX, counter in HUD, a reward at milestones.
- **Files:** `src/Props.js`, `src/Progress.js`, `src/LegoHud.js`
- **Done:** 20 bricks placed, all collectable, counter persists.
- **Post:** "day 26: hid 20 bricks around the city. 5 of them unlock a suit."

### Day 27 — Landmark set dressing
- **Do:** replace flat boxes on 6 landmarks with actual silhouette work; night lighting pass.
- **Files:** `src/Landmarks.js`, `src/LegoCity.js`
- **Done:** each landmark is identifiable in one screenshot.
- **Post:** "day 27: rebuilt 6 landmarks so you can tell them apart from a rooftop."

### Day 28 — Recap: city tour
- **Post:** "week 4: the city got its content pass. one lap, no HUD."

---

## Week 5 — Audio (the biggest missing pillar)

### Day 29 — A real audio bus
- **Do:** master/music/sfx buses, settings sliders that persist, mute on tab blur.
- **Files:** `src/Sfx.js`, `src/Settings.js`
- **Done:** sliders change the mix live; reload keeps them.
- **Post:** "day 29: proper audio mixer with 3 buses and sliders that survive a reload. no more single volume knob."

### Day 30 — Menu theme
- **Do:** a looping menu track that isn't annoying at minute 5 (synth or a CC0/free licence track); fade on Play.
- **Files:** `src/Sfx.js`, `src/MenuScene.js`
- **Done:** menu has music, stops cleanly when the game starts.
- **Post:** "day 30: the menu has music for the first time. 90 seconds, loops without a seam."

### Day 31 — City exploration music
- **Do:** layered exploration loop (base + string layer + percussion), day/night variation.
- **Files:** `src/Sfx.js`, `src/CityLife.js`
- **Done:** layers fade in as you climb and speed up.
- **Post:** "day 31: the city has a score that builds as you climb higher. it's quiet on the street, big on the rooftops."

### Day 32 — Combat and boss music
- **Do:** combat layer on enemy aggro, boss stinger + phase-2 swap, clean return to exploration.
- **Files:** `src/Sfx.js`, `src/Combat.js`
- **Done:** entering and leaving a fight transitions without a click.
- **Post:** "day 32: music now reacts to fights. 8 bars of calm, then the drums come in when HYDRA shows up."

### Day 33 — Ambience
- **Do:** traffic hum, distant sirens, wind at height, crowd murmur — all positional-ish and subtle.
- **Files:** `src/Sfx.js`, `src/CityLife.js`
- **Done:** the game never sounds like a silent room.
- **Post:** "day 33: wind at 200ft, traffic on the street, a siren two blocks away. nothing sounds empty."

### Day 34 — SFX coverage audit
- **Do:** list every player action, check each has a sound. Fill the gaps (land, zip, dodge, pickup, UI back, boss spawn).
- **Files:** `src/Sfx.js`
- **Done:** zero silent actions on the audit list.
- **Post:** "day 34: audited every action in the game. 19 of them made no sound. now none do."

### Day 35 — Recap: sound before/after
- **Post:** "week 5: sound week. first 20 seconds is before, rest is the game now."

---

## Week 6 — HUD, menus, presentation

### Day 36 — HUD rebuild
- **Do:** portrait frame, heart tiles, animated stud counter, everything from tokens (finish the Phase B leftover).
- **Files:** `src/LegoHud.js`, `src/lego-ui.css`
- **Done:** no ripped DS art anywhere in the HUD.
- **Post:** "day 36: HUD is finally all original brick geometry. ripped DS sprites are gone."

### Day 37 — Ability bar
- **Do:** ability slots with cooldown sweep, input glyphs, disabled state.
- **Files:** `src/LegoHud.js`, `src/UiKit.js`
- **Done:** you never wonder which key does what.
- **Post:** "day 37: ability bar with cooldowns and key glyphs. no more guessing what to press."

### Day 38 — Objectives
- **Do:** objective tracker, waypoint arrow with distance, mission title card.
- **Files:** `src/Story.js`, `src/LegoHud.js`
- **Done:** any mission is navigable with the HUD alone.
- **Post:** "day 38: waypoint arrow with real distance. you can find a mission from the other side of the city."

### Day 39 — Minimap
- **Do:** restyle to brick look, enemy dots, landmark icons, rotation with camera.
- **Files:** `src/Minimap.js`
- **Done:** minimap matches the HUD language.
- **Post:** "day 39: minimap rebuilt in the brick style with enemy pips and landmark icons."

### Day 40 — Pause menu
- **Do:** replace the last ripped art, add resume/restart/quit/settings, dim the world behind.
- **Files:** `src/Menu.js`, `src/lego-ui.css`
- **Done:** pause looks like the rest of the game.
- **Post:** "day 40: pause menu is original art now. that was the last DS sprite in the project."

### Day 41 — Transitions
- **Do:** menu → game, chapter cards, mission complete sting, loading gaps covered.
- **Files:** `src/Menu.js`, `src/Story.js`
- **Done:** no white flash or dead frame anywhere in a 10-minute run.
- **Post:** "day 41: killed every white flash between screens. transitions are one continuous brick wipe."

### Day 42 — Recap: UI before/after
- **Post:** "week 6: HUD/menu week. left is last month, right is now."

---

## Week 7 — Cinematics and camera language

### Day 43 — Cutscene framing
- **Do:** per-mission camera shapes: over-shoulder for dialogue, wide for reveals, orbit for boss intros.
- **Files:** `src/Story.js`
- **Done:** three scenes each read clearly without text.
- **Post:** "day 43: gave every cutscene a real camera plan instead of a fixed orbit."

### Day 44 — Dialogue camera
- **Do:** speaker focus, look-at, small rack focus; handle 3+ speakers.
- **Files:** `src/Story.js`
- **Done:** a 4-speaker scene is always understandable.
- **Post:** "day 44: the camera cuts to whoever is talking. 4-person scene, no confusion."

### Day 45 — Subtitles and skip
- **Do:** subtitle style from tokens, speaker names, skip + rewind one line.
- **Files:** `src/GameUI.js`, `src/lego-ui.css`
- **Done:** skip never desyncs a mission.
- **Post:** "day 45: subtitles with speaker names and a skip that doesn't break the mission."

### Day 46 — Chapter cards
- **Do:** chapter intro cards with faces, objective, and a 2-second music sting.
- **Files:** `src/Story.js`, `src/lego-ui.css`
- **Done:** launching any chapter feels like a title sequence.
- **Post:** "day 46: chapter cards with the villain face and a sting. starting chapter 4 hits now."

### Day 47 — Photo mode
- **Do:** freeze, free camera, hide HUD, exposure/filter, save to clipboard.
- **Files:** `src/GameUI.js`, `src/SceneSetup.js`
- **Done:** you can produce a wallpaper without external tools.
- **Post:** "day 47: photo mode. froze the game, flew the camera, shot my own wallpaper."

### Day 48 — Options screen
- **Do:** graphics quality, resolution scale, key rebinding UI, gamepad, audio, saved.
- **Files:** `src/Settings.js`, `src/Menu.js`
- **Done:** every option actually applies and persists.
- **Post:** "day 48: full options screen — resolution scale, rebinding, gamepad. low-end laptop mode works now."

### Day 49 — Recap: cutscene clip
- **Post:** "week 7: cinematics week. three scenes, no commentary."

---

## Week 8 — Persistence and progression

### Day 50 — Server profile
- **Do:** schema for studs, owned suits, story %, collectibles, settings; migrate existing localStorage on first login.
- **Files:** `server/server.js`, `src/Progress.js`
- **Done:** a new account gets its progress back on a second device.
- **Post:** "day 50: progress lives on the server now. logged in on my laptop, same studs, same suits."

### Day 51 — Story ↔ online
- **Do:** one profile behind both modes; no more split brains.
- **Files:** `src/Net.js`, `src/Story.js`
- **Done:** finish a mission, join a room, wallet is the same.
- **Post:** "day 51: story and online finally share one wallet. no more two different stud counts."

### Day 52 — Save slots
- **Do:** 3 slots with timestamp, hero portrait, progress bar; delete with confirm.
- **Files:** `src/Progress.js`, `src/Menu.js`
- **Done:** two slots hold different campaigns.
- **Post:** "day 52: three save slots with portraits and progress bars."

### Day 53 — Offline and conflicts
- **Do:** play offline, queue writes, resolve by newest-wins with a visible notice.
- **Files:** `src/Net.js`, `src/Progress.js`
- **Done:** kill the wifi mid-mission, progress survives.
- **Post:** "day 53: pulled the ethernet cable mid-mission. progress queued and synced when it came back."

### Day 54 — Achievements
- **Do:** 15 achievements, toast on unlock, server-side record, list screen.
- **Files:** `src/Progress.js`, `src/GameUI.js`, `server/server.js`
- **Done:** unlocking works in story and online.
- **Post:** "day 54: 15 achievements. 'swing 1000 metres without touching the ground' is harder than it sounds."

### Day 55 — Stats screen
- **Do:** playtime, distance swung, takedowns, bosses beaten, favourite suit.
- **Files:** `src/Progress.js`, `src/Menu.js`
- **Done:** numbers are real, not placeholders.
- **Post:** "day 55: the stats page says I've swung 41km and broken 2,300 bricks."

### Day 56 — Recap: sync demo
- **Post:** "week 8: persistence week. two devices, one profile, recorded live."

---

## Week 9 — Onboarding and accessibility

### Day 57 — First ten minutes
- **Do:** rewrite the opening so movement is taught by doing; no text wall over 12 words.
- **Files:** `src/Story.js`
- **Done:** someone who never played reaches the first swing without help.
- **Post:** "day 57: rewrote the intro. the game teaches swinging by making you swing, not by explaining swinging."

### Day 58 — Hint system
- **Do:** contextual prompts that appear when stuck and decay once learned.
- **Files:** `src/LegoHud.js`, `src/Story.js`
- **Done:** hints never fire twice for the same solved mechanic.
- **Post:** "day 58: hints that shut up once you've got it. fired 3 times in the first mission, never again."

### Day 59 — Difficulty
- **Do:** three presets (friendly, standard, web-slinger) scaling enemy hp, damage, telegraph windows.
- **Files:** `src/Combat.js`, `src/Settings.js`
- **Done:** friendly is beatable by a kid, standard is fair, hard is actually hard.
- **Post:** "day 59: three difficulties. friendly mode has longer telegraphs, not weaker enemies — it's fair, not dumbed down."

### Day 60 — Accessibility basics
- **Do:** text scaling, subtitle size/background, colourblind-safe HUD palette, no colour-only signals.
- **Files:** `src/lego-ui.css`, `src/LegoHud.js`
- **Done:** HUD readable at 125% scale with deuteranopia simulation.
- **Post:** "day 60: ran the HUD through a colourblind simulator. two enemy states were identical. fixed."

### Day 61 — Remap and motion
- **Do:** full remap, hold-vs-toggle for aim/sprint, reduced motion (shake, slow-mo, camera roll).
- **Files:** `src/Settings.js`, `src/Combat.js`
- **Done:** a no-shake, toggle-sprint, custom-key player can finish a mission.
- **Post:** "day 61: reduced motion kills camera shake and slow-mo. the game is playable with zero motion effects."

### Day 62 — Controller, end to end
- **Do:** full gamepad support with glyph swapping in every prompt.
- **Files:** `src/UiKit.js`, `src/CharacterController.js`
- **Done:** beat a mission on a pad without touching the keyboard.
- **Post:** "day 62: played the whole first chapter on a controller. prompts swap glyphs automatically."

### Day 63 — Recap: stranger test
- **Do:** get one person who hasn't seen it to play 10 minutes; write down every confusion.
- **Post:** "week 9: onboarding week. watched someone play blind. 6 things confused them, all fixable."

---

## Week 10 — Story content pass

Each day: one chapter, same checklist — pacing (no mission over 4 min), one new mechanic or twist, cutscene trimmed to under 25 s, boss intro card, reward that matters.

### Day 64 — Chapter 1
- **Post:** "day 64: chapter 1 rewritten. the bite, the lesson, the vulture — 22 minutes, no filler fights."

### Day 65 — Chapter 2
- **Post:** "day 65: chapter 2. gwen gets an actual role instead of standing in a doorway."

### Day 66 — Chapter 3
- **Post:** "day 66: chapter 3. doc ock's lab is now a vertical fight instead of a flat arena."

### Day 67 — Chapter 4
- **Post:** "day 67: chapter 4. the symbiote suit now changes how you fight, not just how you look."

### Day 68 — Chapter 5
- **Post:** "day 68: chapter 5. mysterio's illusions are real geometry now — the room actually changes."

### Day 69 — Chapter 6 and the Gauntlet
- **Post:** "day 69: chapter 6 + endless gauntlet. 6 chapters, 41 missions, 3 hours if you rush."

### Day 70 — Recap: chapter reel
- **Post:** "week 10: story week. 6 chapter cards, one clip each."

---

## Week 11 — Systems content pass

### Day 71 — New enemy type
- **Do:** a ranged specialist that forces you to close distance, and a brute that punishes button mashing.
- **Files:** `src/Combat.js`, `src/Agent.js`
- **Post:** "day 71: two new enemy types. one makes you move, one makes you stop mashing."

### Day 72 — Encounter variety
- **Do:** stealth/lookout encounters, wave rooms with verticality, ambush triggers.
- **Files:** `src/Combat.js`, `src/Story.js`
- **Post:** "day 72: added takedowns from above. cleared a rooftop without being seen."

### Day 73 — Boss rework: Vulture, Goblin
- **Post:** "day 73: vulture and goblin rebuilt. both have two real phases and neither is a punching bag."

### Day 74 — Boss rework: Doc Ock, Lizard
- **Post:** "day 74: doc ock now uses the arena. lizard hunts you instead of waiting."

### Day 75 — Boss rework: Sandman, Venom
- **Post:** "day 75: sandman can be dismantled piece by piece. venom runs from the bell tower."

### Day 76 — Side activities
- **Do:** time trials, rescue events, brick heists — 3 repeatable activities with rewards.
- **Files:** `src/Race.js`, `src/CityLife.js`
- **Post:** "day 76: three side activities. rescue, race, heist. all repeatable, all pay studs."

### Day 77 — Recap: showcase
- **Post:** "week 11: systems week. new enemies, rebuilt bosses, three side activities."

---

## Week 12 — Demo, press, launch

### Day 78 — Content freeze
- **Do:** vertical slice build: chapter 1 + city + one boss + locker. Branch it. No new features from here.
- **Post:** "day 78: froze the demo build. chapter 1, the whole city, one boss, the locker."

### Day 79 — Bug bash
- **Do:** top 20 bugs → 0 critical, 0 blocker. Keep the list visible.
- **Post:** "day 79: killed 14 bugs. 3 left and none of them are game-breaking."

### Day 80 — Final performance
- **Do:** 60 fps lock at 1080p, load under 20 s, memory stable over 30 minutes.
- **Post:** "day 80: 60fps locked, 30-minute session with no memory creep, city in 17s."

### Day 81 — Trailer
- **Do:** 60–75 s trailer: hook in 3 s, gameplay, boss, title. Captions, no dead air.
- **Post:** "day 81: cut the trailer. 68 seconds, no filler."

### Day 82 — Press kit and store page
- **Do:** itch page, 5 screenshots, logo, description, system requirements, devlog archive link.
- **Post:** "day 82: store page is live in draft. 5 screenshots straight from photo mode."

### Day 83 — Devlog archive in-game
- **Do:** a menu screen listing every day so far with its clip.
- **Post:** "day 83: put all 82 devlog days in the main menu. the build log is part of the game."

### Day 84 — Ship the demo
- **Post:** "day 84: demo is live. 84 days ago this was a menu and a broken swing."

---

## After day 84 — the next three seasons

- **Season 2 (weeks 13–20):** original art pass — replace every DS-ripped mesh and texture with your own minifig and city kit. Nothing ships wide until this is done.
- **Season 3 (weeks 21–28):** multiplayer depth — co-op missions, shared bosses, spectator mode, moderation tools.
- **Season 4 (weeks 29–36):** content volume — 3 more chapters, 4 more bosses, UGC challenge editor, localisation, mobile-friendly input.

---

## The daily loop

1. Open `docs/DEVLOG.md`, copy the day block from here into it.
2. Paste the day block to Claude with the file list; it implements; you playtest.
3. Fix what's broken (this is the real work, not the implementation).
4. Bump versions. Play 5 minutes. Zero console errors.
5. Capture one clip or screenshot **before** you close the game.
6. Write the post: what changed, one number, one problem you hit.
7. Tick the day in `docs/DEVLOG.md`.

If a day slips: post the blocker instead of skipping, and roll the task forward. The streak matters more than the plan.

---

## Devlog playbook

**Three post shapes, rotate them:**

1. **Change post** — "before/after" of one thing, 10–20 s clip, one sentence.
2. **Number post** — one measurable result ("47 → 58 fps", "104MB → 61MB", "19 silent actions"). Numbers get shared.
3. **Problem post** — one thing that broke and how you fixed it. These get the most replies.

**Rules that keep it from looking like AI slop:**
- One idea per post. No listicles.
- Show the game, not your editor.
- Say the ugly part ("still looks bad from behind", "the audio is a placeholder").
- Never promise dates you haven't hit.
- No emoji stacks. One is plenty, often zero.

**Weekly rhythm:** Mon–Thu build, Fri demo, Sat polish, Sun recap. Sunday recaps are what people subscribe for.

---

## Open decisions (answer these before they block a day)

| # | Decision | Needed by |
|---|---|---|
| 1 | Replace the DS-ripped minifig/city art with original meshes, or keep it private-only forever? | Day 78 at the latest, ideally Season 2 |
| 2 | Music: commission, licensed library, or synthesized? | Day 30 |
| 3 | Store target: itch only, or Steam too? | Day 82 |
| 4 | Free demo + paid full game, or everything free with a tip jar? | Day 82 |
| 5 | Multiplayer: keep it in the demo or ship single-player first? | Day 78 |

---

## Risks

- **Scope** — 84 days is optimistic with ripped art still in the build. If something must give, give it content (week 10–11), never performance or audio.
- **The city file** — 104 MB is the single biggest reason the game feels slow to strangers. Week 1 exists for a reason; don't push it back.
- **Cache-busting** — a missed `?v=` bump will make you debug a phantom bug for an hour. Bump first, then test.
- **Burnout** — Sundays are clip days, not crunch days. A missed day is fine; a missed week is how projects die.
