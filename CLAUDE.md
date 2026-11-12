# CLAUDE.md — Web of Bricks (layer 0)

LEGO Spider-Man web game. Plain Three.js ES modules, no build step, no git. Server `node server/server.js` on :8080.

## Load order (stop as soon as you have enough)
1. `_agent/PROJECT_STATE.md`: always (short).
2. `CONTEXT.md`: only to route the task or find a file area.
3. One workflow from `_agent/workflows/` that matches the task. Never load all of them.
4. Reference (`_agent/ARCHITECTURE.md`, `PROJECT_MAP.md`, `_agent/conventions/*`): only the section you need.
5. Exact source: Grep the symbol, then Read with offset/limit. Large files (CharacterController, Combat, SceneSetup, Story, LegoCity, Social, index.html, and lego-ui.css at 174 KB): never read whole.

## Hard rules
- After editing any `src/*` file or css: `node tools/bump.mjs <file>`, then `node --input-type=module --check < <file>`.
- Before editing `main.js`, `Menu.js`, `Story.js` or `Characters.js`, check whether another live session is working in this folder.
- Skip `*.log`, `*.bak`, `node_modules/`, `My Main Game.nds` unless the task is about them.
- Use one agent; spawn subagents only under `_agent/conventions/agents.md`.
- Trivial change: edit and check, with no plan or stage files. Substantial change: follow the workflow and use `stages/`.
- Don't reread unchanged files or re-investigate what `_agent/` already records.
- Verify before claiming done. Report any number you didn't measure as unmeasured.
- At the end of meaningful work, update `_agent/PROJECT_STATE.md` (a few lines) and the authoritative doc that CONTEXT.md names. No transcripts.
