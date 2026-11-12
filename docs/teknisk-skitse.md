# Teknisk skitse – første version (pv7)

Status: **arbejdsforslag fra Claude, 12. november 2026.** Bygger på den godkendte afgrænsning i [foerste-minispil.md](foerste-minispil.md): 2D-banerace, baner som data, kun kaldenavn, engelsk, kun Tommy indsender forslag. Punkter mærket **(Tommy)** kræver hans ja.

## Princip
Byg så lidt platform som muligt i første version. Da kun Tommy indsender forslag, kan **Git og GitHub være forslagsflowet**: et forslag er en pull request, diffen er PR-diffen, sandkassen er en preview-udgivelse af grenen, godkendelse er en merge, og rollback er et skift af én pegepind. Portalens egen diff-/godkendelsesside (pv10) bygges først, når eksterne skal kunne indsende.

## Hosting (lavt budget, 0 kr. i starten)
- **Cloudflare Pages** til den statiske side. Hver gren får automatisk en preview-URL, som bruges som sandkasse.
- **Pages Functions + D1** (Cloudflare's SQLite) til scoretavlen. Gratisniveauet rækker langt til et lille publikum.
- Fravalgt: Supabase-gratisniveauet sættes på pause ved inaktivitet (det er sket for Digital load), og en egen server koster penge og drift.
- **(Tommy)** Nyt GitHub-repo, fx `StilleStorm365/playverse`: offentligt eller privat? Pages-projektet `playverse` på den eksisterende Cloudflare-konto, men helt adskilt fra Little Copenhagens projekt, tokens og database. Domæne: `playverse.pages.dev` til at starte med.

## Repo-struktur
Opdateret 12/11 kl. 21 efter v1-bygningen (observeret). Hjemmesiden ligger i `public/`, så Pages kun udgiver den mappe og ikke værktøjer eller `node_modules`.
```
/public/index.html             hub (Nexus Plaza) + Browse all (engelsk)
/public/play.html              race-siden (canvas 2D, vanilla JS, ingen byggetrin)
/public/js/level.js            format, validering, løsbarhed, mindstetid (deles med serveren)
/public/js/engine.js, render.js, input.js, hub.js, play.js, leaderboard.js, levels.js, store.js
/public/levels/<level-id>/v<n>.json   hver udgivet version, uforanderlig
/public/levels/published.json         { "<level-id>": <n>, ... } – den aktive version
/tools/validate.mjs            skema + løsbarhed + størrelse + uforanderlighed (--base)
/functions/api/scores.js       Pages Function (GET/POST)
/migrations/0001_scores.sql
/test/*.test.mjs, /.github/workflows/ci.yml
```
Der er ingen separat `schema/level.schema.json`. Skemaet håndhæves i koden af `validateLevel` i `public/js/level.js`.

## Isolering pr. bane
- En bane er **kun data**: ingen kode, ingen scripts, ingen eksterne URL'er. Spillet indlæser `levels/<id>/v<n>.json` og intet andet fra banen.
- Versioner er uforanderlige filer. **Udgivelse** = ny `v<n+1>.json` + ændring i `published.json`. **Rollback** = sæt pegepinden tilbage til en tidligere `n` (én linje, én commit). Gamle versioner og deres scorer bevares.
- Bane-skema (som bygget): `id`, `version`, `title`, `author`, `type` (`race` eller `hub`), `tiles` (strenge, maks. 32×18, med `#` væg, `.` gulv, `^` pigge, `S` start, `G` mål, `*` stjerne, højst 5) og for hubs `portals` (`{x, y, levelId}`). Ukendte felter afvises. Maks. 8 KB pr. fil.

## Kontrol (CI, GitHub Actions)
`tools/validate.mjs` kører på hver PR og blokerer merge, hvis:
1. filen ikke følger skemaet eller er for stor;
2. målet ikke kan nås fra start (BFS på felterne);
3. `published.json` peger på en version, der ikke findes, eller en eksisterende `v<n>.json` er ændret.

Den beregner også `minTimeMs` (korteste vej ÷ maks. fart), som scoretavlen bruger til rimelighedstjek.

## Scoretavle
- Tabel `scores(level_id, version, nickname, time_ms, created_at, ip_hash)`, indeks på `(level_id, version, time_ms)`.
- `POST /api/scores` `{levelId, version, nickname, timeMs}`. Afvises hvis versionen ikke findes, `timeMs < minTimeMs` eller > 10 min, kaldenavnet ikke er 2–16 tegn `[A-Za-z0-9 _-]` eller står på en lille bandeordsliste, eller IP-hashen har indsendt mere end 10 gange i minuttet.
- `GET /api/scores?levelId=&version=` returnerer top 10. Siden viser den aktive version som standard og ældre versioner på valg.
- Snyd accepteres i første version (ingen login, intet replay-tjek). Senere: send input-log med og afspil den på serveren.
- IP gemmes kun som saltet hash til hastighedsbegrænsning.

## Forslagsflow i første version
1. Tommy (eller en AI for ham) laver en gren og en ny `levels/<id>/v<n+1>.json`.
2. Pull request → CI validerer → Cloudflare giver en preview-URL, hvor banen kan spilles (sandkasse; preview bruger en separat D1-database, så test-scorer ikke rammer den rigtige tavle).
3. Tommy læser diffen i PR'en og spiller preview'et → merge = udgivelse.
4. Rollback: PR, der ændrer `published.json` tilbage.

## Rækkefølge for byggeriet
- **pv8 (GPT, 4 blokke):** spillet + 3 baner + skema + validator, lokalt og uden backend.
- **pv9 (Claude, 2 blokke):** D1, Functions og scoretavle-UI.
- **pv11 (GPT, 2 blokke):** Pages-opsætning, preview-database, CI og rollback-øvelse.
- **pv10 (Claude, 3 blokke):** reduceres til at dokumentere og afprøve PR-flowet ende til ende. Portalens egen godkendelsesside udskydes til eksterne bidrag.

## Åbne punkter (Tommy)
1. Må der oprettes et GitHub-repo `StilleStorm365/playverse`, og skal det være offentligt eller privat?
2. Skal Cloudflare Pages-projektet ligge på samme Cloudflare-konto som Little Copenhagen (adskilt projekt), eller på en ny konto?
3. Er det i orden at udskyde portalens egen godkendelsesside (pv10) til eksterne bidrag og bruge PR'er indtil da?

## Tilføjelse: hub og kodeverdener
Tommys ønske om en hub med portaler og et lukket kodemiljø er undersøgt i [hub-og-portaler.md](hub-og-portaler.md). Skitsen ovenfor er forberedt på det: hubben kan være en banetype i samme motor, og kodeverdener kan senere køre i en sandkasse-iframe på et separat domæne.
