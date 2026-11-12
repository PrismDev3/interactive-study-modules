# Debugging
In: a symptom. Out: a root-caused fix plus a regression check.
1. Reproduce it: preview_start "Hero Playground", then read_console_messages (onlyErrors) and preview_logs. The pane must be visible for timing bugs.
2. Grep the symptom in docs/ISSUES.md and docs/DEVELOPMENT_LOG.md; it may already be known.
3. Narrow it down with javascript_tool on the debug globals before reading large files.
4. Fix the root cause (implementation.md steps 3–4). Record the cause in ISSUES.md if it isn't obvious.
