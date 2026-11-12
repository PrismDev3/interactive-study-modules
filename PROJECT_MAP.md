# PROJECT_MAP — Web of Bricks

Plain Three.js ES modules, no build step. `index.html` → `src/main.js`. Server: `node server/server.js` (static files + WebSocket rooms + scrypt accounts), port 8080 (preview picks 8081 if taken).

## Rules that bite
- **`?v=N` cache-busting.** Versioned files are served as immutable. Edit a module → bump its `?v=` in every importer, cascading up to `index.html` (`main.js?v=`, `lego-ui.css?v=`).
- Two Claude sessions have edited this folder at the same time. It is not a git repo, so check `list_sessions` before editing shared files (`main.js`, `Menu.js`, `Story.js`, `Characters.js`).
- Assets in `assets/models/{spidey,chars,minifigs}` and `assets/ui/lego` are DS rips (see `docs/AUDIT.md`): private placeholders only.

## Running it (local + remote)
- Local: `serve.bat` or `npm start` → <http://localhost:8080>.
- Public quick tunnel: `cloudflared tunnel --config cf-empty.yml --no-autoupdate --url http://127.0.0.1:8080 --logfile tunnel-live.log`, then copy the `https://…trycloudflare.com` URL from the log. The URL changes every start and dies when the process stops; for a permanent address use a named tunnel/custom domain.
- A remote proxy (Ultraviolet, etc.) must be given the **public URL**, never `localhost` — the proxy would resolve localhost to its own machine and return a 500. Quick tunnels also have no uptime guarantee, so a dead tunnel looks like a proxy error.

## Boot
`main.js`: SceneSetup (renderer, lights, city OBJ) → Menu (title, name, locker, story) → CharacterController.loadCharacter(null) builds the LegoSpidey rig for the saved outfit → Combat, Story, HUD, CityLife, Multiplayer.
Debug globals: `window.hero` (controller), `window.game` (combat, story, hud, ui, mp…), `window.__menuScene`, `window.__setup`.

## Modules by area
| Area | Files |
|---|---|
| Movement / camera | `CharacterController.js` (input on `document` keydown, `window` keyup; `inputLocked`), `WebPhysics.js` (pendulum swing), `Binds.js` (rebinds) |
| Characters | `LegoSpidey.js` (minifig rig; `SKIN_TO_GLB` maps skins to GLB minifigs unless `lego:true`), `GlbMinifig.js`, `SpideyGLB.js`, `Characters.js` (playable heroes + abilities), `Kits.js`, `Gear.js`, `CharacterGear.js`, `Tendril.js` |
| Suits | `Variants.js`, `SuitDesigns.js`, `SuitPainter.js`, `GLBSuitPaint.js`, `Outfit.js` (outfit code + stud wallet) |
| Combat / AI | `Combat.js` (enemies, bosses, hearts), `Agent.js` (summoned allies), `Effects.js` |
| Story | `Story.js` (chapters, missions, cutscenes, calls), `Progress.js` (localStorage), `Voice.js` |
| City | `SceneSetup.js`, `LegoCity.js`, `Landmarks.js`, `Props.js`, `CityLife.js` |
| UI | `Menu.js`, `MenuScene.js` (3D title backdrop), `UiKit.js`, `lego-ui.css` (tokens, TT-style menus), `GameUI.js`, `LegoHud.js`, `Minimap.js`, `Chat.js`, `Portrait.js`, `Settings.js`, `MountChoctaw.js` (Daily Bugle photos) |
| Online | `Social.js` + `social.css` (friends/DMs/player card, U = panel, Y = interact), `server/social.js`, `Net.js`, `Multiplayer.js`, `Race.js`, `Admin.js`, `server/server.js` |
| Audio | `AudioCore.js` (shared context + mixer), `Sfx.js`, `Music.js` (adaptive), `Voice.js`; globals `window.gameSfx`, `window.gameMusic` |
| Perf | `Perf.js` (graphics tier), F3 overlay |

## Other docs
`docs/ROADMAP.md` (84-day plan), `docs/DEVLOG.md` (public day log), `docs/AUDIT.md` (asset licence audit), `docs/BACKLOG.md`, `docs/DEVELOPMENT_LOG.md`.
