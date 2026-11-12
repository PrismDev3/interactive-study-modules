# Verification (pick the cheapest check that proves it; don't rerun on unchanged code)
- Syntax: `node --input-type=module --check < file`.
- Server and logic: `npm run qa:<name>` (player-state, swing-target, room-policy, activity, social-moderation), or `node tools/qa-admin.mjs` against a live server.
- Browser: preview_start "Hero Playground", reload, read_console_messages (onlyErrors), run targeted javascript_tool asserts, and take one screenshot for a visual change. Keep the pane visible.
- Physics: step a `hero.update(1/60)` loop. Ch.1 spot is (471, 22, 1441) with `_yaw=-π/2`; bench with `tools/swing-bench.js`.
- Always report what was NOT tested.
