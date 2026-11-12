# TASKS — index only. Sources of truth: docs/BACKLOG.md (open/done) and docs/DEVELOPMENT_STATUS.md ("Exact next tasks").

Read only docs/BACKLOG.md "## Open": run `grep -n "^## " docs/BACKLOG.md`, then Read with offset/limit.
When a task finishes, move it to Done in docs/BACKLOG.md and refresh "Next" in `_agent/PROJECT_STATE.md`.

Dependencies and blockers:
- An edit to Characters.js needs 7 importer bumps, so batch it with BACKLOG #4 (dead-code removal).
- Social tests need two logged-in accounts (tools/qa-accounts.json, tools/social-bot.mjs).
- tools/qa-admin.mjs needs a live server.
