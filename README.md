# Playverse

A public browser portal for AI-made 2D/3D minigames, levels and quests. Low budget, highscores early, multiplayer later. Separate from Little Copenhagen.

## Status
Version 1 in progress: a small 2D level race where each level is a JSON file, a nickname-only leaderboard per level and version, an English UI, a 2D hub with portals, and proposals from the owner only, reviewed as pull requests.

- Done: game engine, 3 levels, level validator, unit tests, play page, level list, CI.
- Next: leaderboard (Pages Functions + D1), 2D hub, Cloudflare Pages setup.

## Run locally
No build step and no dependencies for the game itself.

```bash
npm test                 # unit tests (Node 20+)
npm run validate         # validate all levels and levels/published.json
npm run serve            # static server on http://localhost:8788 (leaderboard shows "offline")
```

## Layout
```
index.html, play.html        pages (vanilla JS modules, canvas 2D)
js/level.js                  level format, validation, minimum-time bound (shared with tools)
js/engine.js                 deterministic simulation (fixed 1/120 s step, no DOM)
js/render.js, js/input.js    drawing and keyboard/touch input
levels/<id>/v<n>.json        level versions – immutable once published
levels/published.json        { "<id>": <active version> } – rollback = change one number
tools/validate.mjs           CI check: schema, reachability, size, immutability (--base <ref>)
```

## Level format
```json
{ "id": "first-steps", "version": 1, "title": "First Steps", "author": "Tommy", "type": "race",
  "tiles": ["#####", "#S*G#", "#####"] }
```
`#` wall, `.` floor, `^` spikes (back to start), `S` start, `G` goal, `*` star (−0.5 s). Max 32×18 tiles, 8 KB, 5 stars.
Hub levels use `"type": "hub"` and a `portals` list of `{x, y, levelId}`.

## Proposing a level change
1. Branch, then add `levels/<id>/v<n+1>.json` (never edit an existing version).
2. Point `levels/published.json` at the new version.
3. Open a pull request: CI validates it and the Cloudflare preview URL is the sandbox.
4. Merge to publish. Roll back with a PR that points `published.json` at an older version.

## Docs (Danish)
- `docs/foerste-minispil.md`: scope of the first minigame (approved)
- `docs/teknisk-skitse.md`: technical sketch
- `docs/hub-og-portaler.md`: research on the hub world and sandboxed creator code

Decisions and status live in the project folder (`Projektmappe/playverse/README.md`); the docs here are copies from 12 Nov 2026.
