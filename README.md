# Playverse

A public browser portal for AI-made 2D/3D minigames, levels and quests. Low budget, highscores early, multiplayer later. Separate from Little Copenhagen.

## Status
Version 1 in progress: a small 2D level race where each level is a JSON file, a nickname-only leaderboard per level and version, an English UI, a 2D hub with portals, and proposals from the owner only, reviewed as pull requests.

- Done: game engine, 3 levels, level validator, unit tests, play page, CI, leaderboard API (Pages Function + D1, tested locally), 2D hub "Nexus Plaza" with portals, plaques, deep links and Browse all, first proposal PR (Switchback v2) and a rollback drill, ghosts (input replays, verified on the server).
- Next: Cloudflare Pages + D1 setup (on hold until the owner says go).

## Run locally
No build step and no dependencies for the game itself.

```bash
npm test                 # unit tests (Node 20+)
npm run validate         # validate all levels and levels/published.json
npm run serve            # static server on http://localhost:8788 (leaderboard shows "offline")
npm install              # dev dependency: wrangler (Cloudflare CLI)
npm run db:migrate:local # create the local D1 scores table
npm run dev              # site + /api/scores on http://localhost:8788
```

## Leaderboard API
`GET /api/scores?levelId=&version=` returns the top 10 (best time per nickname).
`GET ...&ghost=1` also returns `ghost: {nickname, timeMs, replay}`, the fastest run with a replay.
`POST /api/scores` with `{levelId, version, nickname, replay}`. The server re-simulates the replay
with the same engine as the browser, and the **simulated** time goes on the board (a `timeMs` in
the body is ignored). Rejected when the level version does not exist, the replay is malformed,
longer than 5 min or does not reach the goal, the time is below the level's minimum possible time,
the nickname is not 2–16 of `[A-Za-z0-9 _-]` or is blocklisted, or the IP (stored only as a salted
hash; set the `IP_SALT` secret in production) has submitted 10 times in the last minute. No login:
a bot that really solves a level can still post, which is accepted for v1.

## Ghosts (replays)
The engine is deterministic, so a run is just its input per 1/120 s step. Input is quantised to
1/16 (`js/replay.js`) so live play and replay feed the engine identical numbers, and stored
run-length encoded: `{"v":1,"runs":[[steps, qx, qy], ...]}` with `qx, qy` in −16..16.
The race page shows your own best run (stored on this device) and the record run (from the
server) as see-through runners that start when you start. `G` toggles them.

## Layout
```
public/                      the static site (Cloudflare Pages output dir)
  index.html, play.html      hub and race page (vanilla JS modules, canvas 2D)
  js/hub.js                  hub: portals, plaques, Browse all, deep link #/from/<id>
  js/level.js                level format, validation, minimum-time bound (shared with tools and API)
  js/engine.js               deterministic simulation (fixed 1/120 s step, no DOM)
  js/replay.js               input recording, replay check and simulation, ghost frames (shared with the API)
  js/render.js, js/input.js  drawing and keyboard/touch input
  levels/<id>/v<n>.json      level versions – immutable once published
  levels/published.json      { "<id>": <active version> } – rollback = change one number
functions/api/scores.js      leaderboard API (Pages Function, D1 binding DB)
migrations/                  D1 schema
tools/validate.mjs           CI check: schema, reachability, size, immutability (--base <ref>)
```

## Level format
```json
{ "id": "first-steps", "version": 1, "title": "First Steps", "author": "Tommy", "type": "race",
  "tiles": ["#####", "#S*G#", "#####"] }
```
`#` wall, `.` floor, `^` spikes (back to start), `S` start, `G` goal, `*` star (−0.5 s). Max 32×18 tiles, 8 KB, 5 stars.
Hub levels use `"type": "hub"` and a `portals` list of `{x, y, levelId}`; the published hub (`levels/hub`) may only link to published race levels. Adding a level to the hub = a new hub version with one more portal.

## Proposing a level change
1. Branch, then add `public/levels/<id>/v<n+1>.json` (never edit an existing version).
2. Point `public/levels/published.json` at the new version.
3. Open a pull request: CI validates it and the Cloudflare preview URL is the sandbox.
4. Merge to publish. Roll back with a PR that points `published.json` at an older version.

## Docs (Danish)
- `docs/foerste-minispil.md`: scope of the first minigame (approved)
- `docs/teknisk-skitse.md`: technical sketch
- `docs/hub-og-portaler.md`: research on the hub world and sandboxed creator code

Decisions and status live in the project folder (`Projektmappe/playverse/README.md`); the docs here are copies from 12 Nov 2026.
