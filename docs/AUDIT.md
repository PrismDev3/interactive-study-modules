# Phase A audit — LEGO Spider-Man (2026-11-08)

## What the project is
- **Engine:** plain Three.js ES modules in the browser (`index.html` → `src/main.js`), no build step.
- **Server:** `server/server.js` (Node + `ws`) serves files and runs online rooms. Accounts use scrypt-hashed passwords in `server/data/users.json`. Run with `npm start` → http://localhost:8080.
- **Cache-busting:** every import carries `?v=N`, and versioned files are cached as immutable for a year. **Any edit to a module needs its `?v=` bumped in every importer, up to `index.html`.** This pass bumped all of them by one.
- ~10,000 lines over 33 modules. Key ones: `CharacterController` (movement), `WebPhysics` (swinging), `LegoSpidey` (minifig rig + animation), `SuitPainter`/`SuitDesigns`/`Variants` (suits), `Gear` (hair, hoods, Iron Spider arms), `Combat`/`Agent` (enemies), `Story` (missions), `LegoHud`/`Minimap`/`Chat`/`Menu` (UI), `Multiplayer`/`Net` (online).

## Working today
Menu with Locker (suits, custom colours, gear, emotes) · stud wallet with suit purchases · third-person movement, wall run, climbing, web swing · combat with HYDRA + bosses (Goblin, Venom, Sandman, Loki, Magneto) · 6 short "chapters" in `Story.js` · online rooms with chat, nametags, minimap · scrypt login.

## Gaps against the spec
| Area | State |
|---|---|
| Story | 6 chapters exist but are one-fight arenas with a HYDRA/Loki/Magneto plot. The requested Peter Parker campaign (Uncle Ben, Gwen, Vulture, Doc Ock, Lizard, Mysterio, Sinister Six) is not written. Most of those characters have **no model or texture** in the project. |
| Persistence | Wallet/outfit in `localStorage`; online account stores only name + hash. Story progress, unlocks and currency are **not** on the server, so Story and Online don't share one profile yet. |
| UI font | Primary font is the pixel font `Pixelify Sans` (`index.html:22`); spec says to replace it with Lilita One/Fredoka (bundled locally). |
| Design tokens | No central `--brick-*` token set; colours are inline. |
| Falling/landing | One generic falling pose (`LegoSpidey.js` `!s.grounded` branch); no forward/back/side dives or landing variants. |
| Iron Spider arms | Built in `Gear.js` `ironArms()` from lathe/cylinder parts. Needs the rebuild described in §4.1. |
| Voice/audio | `Sfx.js` has synthesized SFX only; no dialogue pipeline, no voice lines. |

## Blockers I need from you
1. **Reference screenshots.** The spec refers to images (Iron Spider arm target, Gwen hair hole, blurry side texture, clipping accessory). None were attached to this message, so I can't target those four fixes precisely yet.
2. **Ripped assets.** `My Main Game.nds`, `My Game Files/`, `assets/models/spidey/` and `assets/models/chars/` come from the commercial LEGO Marvel DS game. The spec rules out unlicensed commercial assets. They're fine as private placeholders, but anything you plan to share publicly needs original replacements. The suit painter (`SuitPainter.js`) already paints suits procedurally, so the textures are easy to replace; the mesh `SpiderMan.obj` would need an original minifig model.

## Asset registry (current)
| Asset | Path | Source | Status |
|---|---|---|---|
| Minifig mesh | `assets/models/spidey/SpiderMan.obj` | DS rip | Placeholder; replace before sharing |
| Classic textures | `assets/models/spidey/spidey_v3_*.png` | DS rip | Placeholder |
| Villain/hero skins | `assets/models/chars/*_{head,upper,lower}.png` | DS rip | Placeholder (Venom has no lower) |
| Painted suits | `src/SuitDesigns.js` | Original code | OK |
| City | `assets/models/city_map.obj` (+ .gz/.br) | Unknown — needs source noted | Check licence |
| UI sprites | `assets/ui/lego/*.png` | DS rip | Placeholder |
| Gear (hair, hoods, arms, weapons) | `src/Gear.js`, `src/CharacterGear.js` | Original procedural | OK |

## This pass: new Spider-suits
Added as painted designs in `src/SuitDesigns.js` and listed in `src/Variants.js` (Locker → Suits):

| Suit | Key | Price (studs) |
|---|---|---|
| Future Foundation | `ff` | 5,000 |
| Bombastic Bag-Man | `bagman` | 2,500 |
| Homemade (story Ch.1) | `homemade` | free |
| Wrestler (story Ch.1) | `wrestler` | free |
| Amazing (story Ch.2) | `tasm` | 6,000 |
| Far From Home (story Ch.5) | `ffh` | 6,000 |
| Spider-UK | `uk` | 7,500 |
| Spider-Punk | `punk` | 8,000 |
| Scarlet Spider (Kaine) | `kaine` | 7,500 |
| Spider-Armor | `armor` | 12,000 |

Tested: all 10 paint without errors in the running game, appear in the Locker, and the try-on preview shows them on the minifig.

## Proposed next phases (in order)
1. **Phase A fixes** once the reference images arrive (Iron Spider arms, Gwen hair, side texture, clipping, hands).
2. **Phase B** design tokens + Lilita One font + brick buttons/panels, then main menu and loading screen.
3. **Phase C** dive/fall/landing pose set in `LegoSpidey.update` and a fall-to-swing hand-off in `WebPhysics`.
4. **Phase E** server-side profile (progress, studs, unlocks) shared by Story and Online.
5. **Phase G** campaign rewrite chapter by chapter, starting with Chapter 1 and its new characters.

# Phase B (part 1): design system, main menu, loading — 2026-11-08
- **Design tokens + components:** `src/lego-ui.css` (all `--brick-*` tokens, brick buttons with studs and hover/press/focus/disabled states, brick panels, wordmark, loading bar). The pixel font is gone; Lilita One + Fredoka are bundled in `assets/fonts/` (OFL).
- **Behaviour:** `src/UiKit.js` (studs, hover/snap sounds, arrow-key + gamepad menu navigation, wordmark), `src/Settings.js` (sensitivity, volume, UI size, minimap, reduce motion, saved per device).
- **3D menu:** `src/MenuScene.js` — the player's current outfit on a studded baseplate, brick stacks, drifting bricks, slow orbit + mouse parallax; reacts to the hovered button; disposed when play starts.
- **Loading:** brick-by-brick bar with real byte progress (server now sends `X-File-Size`, so gzip/brotli no longer break the percentage), rotating tips, and Single Player / Create / Join stay locked until the city has loaded.
- **Still to do in Phase B:** HUD rebuild (portrait frame, heart tiles, stud counter animation, ability bar, objective tracker), minimap restyle, chat restyle, pause menu (still uses the ripped DS art).
