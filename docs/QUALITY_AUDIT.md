# QUALITY AUDIT

Baseline evidence and what is still unverified. Do not treat a green check as a quality
verdict — it only means the file parsed or the route answered.

## This cycle

| Check | Result | Evidence |
|---|---|---|
| Module syntax, all edited JS | PASS | `node --input-type=module --check` on 5 modules + `server/social.js` |
| Server boot after social changes | PASS | `LEGO Spider-Man server on http://localhost:8080`, HTTP 200 |
| Cache-bust cascade | PASS | `tools/bump.mjs` output; `main.js?v=427`, CSS bumped by hand |
| Browser console after reload | **NOT CAPTURED** | the desktop disconnected before the pane finished loading |
| Pause → Settings, open/close, Escape | **NOT CAPTURED** | same |
| Iron Spider absent from Heroes, present in Suits | **NOT CAPTURED** | code path checked only |
| Group chat, two accounts | **NOT TESTED** | no client session available in this cycle |

## Previous session baseline (for context, not re-measured)
- City parse + merge 12,693 ms; 218 merged meshes.
- Device profile: high (32 cores, non-ChromeOS).
- Minimap throttled to 12/8/4 Hz (high/medium/low).
- `tools/qa-admin.mjs` 10/10 pass.

## Visual inspection owed
- Main menu composition at 1280×720 and 1920×1080.
- Locker: suit grid, hero grid, preview loading state.
- HUD during swinging; pause menu; settings sheet at narrow width.
- Venom in the Locker and in a fight; Miles suit close-up; Goblin + glider.
- Bridge ramps, spawn street windows, rooftop props.
