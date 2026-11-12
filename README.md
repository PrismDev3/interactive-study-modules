# Interactive Study Modules

Self-launching SVG modules + the full source of **Web of Bricks** (a browser multiplayer
game built on plain Three.js ES modules, no build step).

## What the SVG links are

Each file in [`cdn/`](cdn/) is an ordinary `.svg` that, when **opened as a page**, boots the
live interactive experience inside itself. Hundreds of them exist under different
educational names, but they are byte-for-byte the same behaviour — every one is a direct
`cdn.jsdelivr.net/gh` link to its **source file** in this repo:

```
https://cdn.jsdelivr.net/gh/PrismDev3/interactive-study-modules@main/cdn/<name>.svg
```

Opening one in a browser runs the actual game: movies, multiplayer, and real-account login
all work, because the SVG loads the live app from the server defined in
[`endpoint.json`](endpoint.json).

A full, clickable list is in [`LINKS.md`](LINKS.md).

## How it works

1. The SVG is a top-level document, so its `<script>` runs.
2. It reads the current base URL from `endpoint.json` (served from this repo via jsDelivr).
3. It mounts a full-window frame pointing at that base — the live game server.

Because the live destination is read at runtime, **the links never need to be re-issued**
when the server URL changes — you edit one file.

## Running the backend

The game's multiplayer + login need the Node server live and publicly reachable:

```bash
node server/server.js            # serves on :8080
```

`tools/keep-alive.ps1` (Windows) keeps the server + a Cloudflare quick tunnel alive and
writes the current public URL to `tools/tunnel-url.txt`.

## When the public URL changes

1. Put the new URL in [`endpoint.json`](endpoint.json) (`base` field) and push.
2. Purge the jsDelivr cache so the SVGs pick it up immediately:
   `https://purge.jsdelivr.net/gh/PrismDev3/interactive-study-modules@main/endpoint.json`

All existing links then resolve to the new destination — no regeneration needed.

## Regenerating the SVG set

```bash
node tools/generate-cdn-svgs.mjs 300
```

Writes `cdn/*.svg`, `cdn/index.json`, and `LINKS.md`. Override target with env vars
`GH_USER`, `GH_REPO`, `GH_BRANCH`.

## Not included in this repo

`city_map.full.obj` (a 104 MB high-detail source, over GitHub's limit), the unrelated
`.nds` ROM, `node_modules/`, server logs, and private account data (`server/data/`).
The runtime city map (`city_map.obj`) and all 129 model files are included.
