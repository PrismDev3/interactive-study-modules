# DECISIONS (newest at top, 2–4 lines each)

- **2026-11-11 ICM context system.** Thin router files point to the existing docs instead of copying them, and each fact has one owner (CONTEXT.md table). Rejected: moving or merging the 8 root docs (risk and churn, no git).
- **No build step, no new deps.** Plain ES modules with `?v=` via tools/bump.mjs. Rejected: a bundler (extra tooling; the user runs serve.bat).
- **The input guard is the leaf module `Input.js`.** This avoids import cycles; handlers branch on the event target.
- **One authoritative world host per room** (highest rank, lowest id) owns summoned entities, enforced server-side. Rejected: authority via a client flag (spoofable).
- **Perf comes from renderer switches** (shadows, pixel ratio, far plane), never from deleting geometry.
- **Boss Venom keeps venombigfig.glb.** Big-fig clips (shared 70-joint skeleton) drive it.
- **Menus are LEGO Batman TT-style text lists** with no stud-strip buttons (the user's preference).
