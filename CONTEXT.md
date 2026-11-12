# CONTEXT — routing (layer 1)

## Task → workflow
| Task | Load |
|---|---|
| Understand code, "why does X happen" | `_agent/workflows/investigation.md` |
| Feature, behaviour or UI change | `_agent/workflows/implementation.md` |
| Bug, console error, regression | `_agent/workflows/debugging.md` |
| FPS, load time, memory, payload | `_agent/workflows/optimization.md` |
| Prove a change works | `_agent/workflows/verification.md` |
| Asset ripping (DS FUSE, AN4 anims) | Claude user memory (rip + Lego Source entries), `tools/an4/`, `My Game Files/tools/` |

## Authoritative sources (one owner per fact: edit the owner, link to it from elsewhere)
| Fact | Owner |
|---|---|
| Module map, boot order, debug globals, run/tunnel steps | `PROJECT_MAP.md` |
| Current state, active task, next step | `_agent/PROJECT_STATE.md` |
| Prioritised open work | `docs/BACKLOG.md` (index: `_agent/TASKS.md`) |
| Measured numbers, verification evidence | `docs/DEVELOPMENT_STATUS.md` |
| Per-change engineering log | `docs/DEVELOPMENT_LOG.md` (append only; grep it, don't read it whole) |
| Request-list status, known issues | `docs/PROGRESS.md`, `docs/ISSUES.md` |
| Technical decisions and why | `_agent/DECISIONS.md` |
| 84-day plan | `docs/ROADMAP.md` (grep "Day N", never read it whole) |
| Asset licence audit / public day log | `docs/AUDIT.md` / `docs/DEVLOG.md` |
| UI taste, voice pipeline, rip formats | Claude user memory (auto-loaded) |



## Layout
`index.html` → `src/main.js`. `src/` has about 80 modules (area table in PROJECT_MAP.md). `server/` holds server.js, social.js and data/. `assets/` holds models, anims, ui and voice. `tools/` holds bump.mjs, qa-*.mjs, swing-bench.js and an4/. `My Game Files/` holds the DS rip outputs.
Docs live in `docs/`. Skip as noise: `*.log`, `.agents/` (generic web-framework skills, not project docs).
