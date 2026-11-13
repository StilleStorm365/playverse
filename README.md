# Playverse

A shared 2D plaza of portals to browser games. Walk around with other players, build a portal to your own game, or jump into Vibe Jam games together. Separate from Little Copenhagen.

Live: https://playverse-2kf.pages.dev/

## Status
Version 1 in progress: a small 2D level race where each level is a JSON file, a nickname-only leaderboard per level and version, an English UI, a 2D hub with portals, and proposals from the owner only, reviewed as pull requests.

- Done: game engine, 3 levels, level validator, unit tests, play page, CI, leaderboard API (Pages Function + D1, tested locally), 2D hub "Nexus Plaza" with portals, plaques, deep links and Browse all, first proposal PR (Switchback v2) and a rollback drill, ghosts (input replays, verified on the server), Vibe Jam webring portals in the hub.
- Published 2026-11-13 on Cloudflare Pages + D1.
- Multiplayer hub (hub v3): other players are shown live, community portals on pads, and a duo Vibe Jam portal. The three race levels are no longer in the hub (owner's choice, 13/11); they are still in Browse all.

## Run locally
No build step and no dependencies for the game itself.

```bash
npm test                 # unit tests (Node 20+)
npm run validate         # validate all levels and levels/published.json
npm run serve            # static server on http://localhost:8788 (leaderboard shows "offline")
npm install              # dev dependency: wrangler (Cloudflare CLI)
npm run db:migrate:local # create the local D1 scores table
npm run dev              # site + /api/* on http://localhost:8788
npm run dev:room         # (second terminal) the presence Worker, so the hub shows other players
```
Without `dev:room` the hub still works, just alone (the WebSocket to `/api/room` fails and retries).

## Deploy
```bash
npm run db:migrate:remote   # D1 schema
npm run deploy:room         # presence Worker (Durable Object), before the site
npm run deploy              # the Pages site
```
Secrets live in Cloudflare only: `IP_SALT` and `ADMIN_TOKEN`
(`npx wrangler pages secret put <NAME> --project-name playverse`). The owner's copy of the admin token
is in `.env.admin` (git-ignored); run the local site with `--binding "$(cat .env.admin)"` to use `/admin.html` locally.

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

## Webring portals (Vibe Jam)
The hub has a teal **Vibe Jam ↗** portal. Entering it sends the player to
`https://vibejam.com/portal/2026` with `portal=true`, `username` (your nickname, if set), `color`,
`speed` and `ref` (this site), following the [Cursor Vibe Jam 2026 portal guide](https://vibejam.com/2026#portals).
Players who arrive with `?portal=true` land in the hub at once (no start screen). If `ref` is a
valid http(s) URL or host, a teal return portal appears next to the start and sends them back with
the parameters they came with. A valid `username` becomes the nickname if none is set. All incoming
parameters are untrusted: unknown ones are dropped, `ref` must be http(s), and nothing is put into
HTML. Hub portals are `{x, y, levelId}` or `{x, y, webring: "vibejam-2026"}`; the URL itself lives in
`js/webring.js`, not in level data. Unlike the jam sample, entering a portal shows a plaque and you
press Enter, the same as the level portals. The jam's widget script is not included (it was only required for entries).

## Multiplayer hub
`/api/room` is a WebSocket to one Durable Object ("nexus") in the Worker `playverse-room` (`room/`),
bound to the Pages project with `script_name`. It relays positions (max 10/s per client, clamped),
nickname changes and the duo queue; max 40 players. All client messages are untrusted and size and rate limited.

**Duo Vibe Jam portal.** The first player to press Enter in the Vibe Jam portal opens a 4 s window,
and everyone else who enters joins. When it closes: 2+ players get the same random seed and each
picks the same game from the community's multiplayer list (`pickDuoGame`), with the usual portal
parameters; a single player goes to Vibe Jam's random redirector as before. Whether two players meet
inside the game depends on the game (games with one shared world, like fly.pieter.com, work).

## Community portals
`GET /api/portals` lists them; `POST /api/portals` with `action: create | report | remove`.
- `kind: "portal"` sits on an empty pad in the hub (`pads` in the hub level); `kind: "jam"` only adds a
  multiplayer game to the duo list (the Vibe Jam plaque has "Add a multiplayer game").
- Owner's rules (13/11): live at once, with limits: public `https://` links only (no IPs, ports,
  credentials or localhost), 1 portal and 3 games per person per day (salted IP hash or creator token),
  portals last 30 days, hidden after 3 reports from different IPs. Titles and names are filtered.
- The creator can remove their own portal: the browser keeps a random token, the server stores its hash.
- The plaque says the portal was built by a player and that you leave Playverse.
- Moderation: `/admin.html` (owner only, `ADMIN_TOKEN`) lists every portal with its reports and can
  hide, unhide or delete it. `GET/POST /api/admin` with `Authorization: Bearer <token>`.

## Social
- Emotes: keys 1-4 or the buttons top left (👋 ❤️ 😂 🎉), shown above your figure for everyone (max 1 per second).
- Browse all: one searchable list of community portals, the duo game list and the race levels (the keyboard and screen-reader way in).
- Invite: shares the plaza link (share sheet on phones, clipboard elsewhere). Link previews use `og.png`.
- On small screens the hub keeps tiles at least 30 px and the camera follows you.

## Layout
```
public/                      the static site (Cloudflare Pages output dir)
  index.html, play.html      hub and race page (vanilla JS modules, canvas 2D)
  js/hub.js                  hub: portals, pads, build dialog, duo queue, plaques, Browse all
  js/presence.js             WebSocket client for other players in the hub
  js/community.js            community portal rules (shared with the API)
  js/level.js                level format, validation, minimum-time bound (shared with tools and API)
  js/engine.js               deterministic simulation (fixed 1/120 s step, no DOM)
  js/webring.js              Vibe Jam portal protocol: exit URL, arrival parsing, return URL
  js/replay.js               input recording, replay check and simulation, ghost frames (shared with the API)
  js/render.js, js/input.js  drawing and keyboard/touch input
  levels/<id>/v<n>.json      level versions – immutable once published
  levels/published.json      { "<id>": <active version> } – rollback = change one number
functions/api/scores.js      leaderboard API (Pages Function, D1 binding DB)
functions/api/portals.js     community portals API
functions/api/room.js        WebSocket -> presence Durable Object (binding ROOM)
lib/server.js                helpers shared by the functions
room/                        Worker "playverse-room" with the Room Durable Object
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
