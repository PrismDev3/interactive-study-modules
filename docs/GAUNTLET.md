# GAUNTLET — LEGO Spider-Man: Web of Bricks

Autonomous development journal. Read `PROGRESS.md` first, then `ISSUES.md`.

## Rules for this journal
- Only record what was **verified**. Mark anything inspected-only as "unverified".
- Every entry names the files touched and the check that was run.
- Update after each meaningful cycle; do not rewrite history, append.

## Cycle log

### Cycle 1 — 2026-11-10
**Scope chosen from the request:** work the items that were still missing rather than re-doing
the ones the previous session completed (input guards, adaptive graphics, admin host election).

**Landed**
1. **Iron Spider is a suit, not a hero.** Removed the `ironspider` entry from
   `src/Characters.js`; the `iron` variant in `src/Variants.js` is now the single source. Old
   saves (`hero-ironspider`) and the legacy `variant` key migrate to `iron` on load in
   `src/Outfit.js`.
2. **In-game settings.** New `src/PauseSettings.js` builds a settings sheet inside
   `#pause-menu` (audio, interface, graphics profile, render distance) backed by
   `Settings.js`; `index.html` gained the menu row and `src/LegoHud.js` owns open/close,
   Escape handling and sheet focus rules. Styled in `src/lego-ui.css` to match the pause plate.
3. **Group chats.** `server/social.js` stores group membership on each user record and the
   shared log in `server/data/groups.json`; new messages `groupCreate`, `groupMsg`,
   `groupHistory`, `groupRead`, `groupLeave`, `groupAdd`. `src/Social.js` gained a Groups tab
   (create form with friend chips), group list with unread counts, and a group conversation
   view with sender names. Styled in `src/social.css`.
4. **Journal** created (this folder).

**Checks run**
- `node --input-type=module --check` on `Characters.js`, `Outfit.js`, `LegoHud.js`,
  `Social.js`, `PauseSettings.js`, `server/social.js` — all pass.
- Cache-busters bumped with `node tools/bump.mjs`; CSS links bumped by hand in `index.html`
  (`lego-ui.css?v=100`, `social.css?v=13`).

**Still to verify (next cycle)**
- Browser: pause → Settings opens/closes, Escape returns to the pause list, no console errors.
- Two-account group create → message → history → leave, including a server restart.
- Iron Spider appears in Suits, not Heroes, and plays with Spider-Man's kit.

**Do not repeat**
- Do not re-add Iron Spider to `HEROES`; the suit path already draws the waldoes in
  `LegoSpidey.js` and `Gear.js`.
- Do not hand-bump every `?v=`; `tools/bump.mjs` cascades.
