# Code conventions
- ES modules with `?v=N` imports. After an edit, run `node tools/bump.mjs src/X.js` and `node --input-type=module --check < src/X.js`.
- Prefer Edit over a rewrite. With no git, make a `.bak` only before a risky large edit.
- UI: use the tokens and `.screen.tt` / `.tt-item` in `src/lego-ui.css`, and build screens with `UiKit`.
- Key handlers go through the `Input.js` text-entry guard.
- Server changes keep authority server-side and add or extend a `tools/qa-*.mjs` check.
