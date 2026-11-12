# Investigation
In: a question. Out: the answer with file:line, plus a DECISIONS/ARCHITECTURE line only if the fact is durable and new.
1. Check PROJECT_STATE and ARCHITECTURE for an existing answer. Stop if it's there.
2. Use the PROJECT_MAP area table to pick candidate files. Grep the symbol and Read only the matching range.
3. For runtime questions, prefer the preview and `window.hero` / `window.game` via javascript_tool over reading more code.
4. Stop once the answer is established. For a dig that spans sessions, keep notes in `stages/01-investigation/<slug>.md`.
