# Hub-verden med portaler og lukket kodemiljø

Status: **undersøgelse og arbejdsforslag fra Claude, 12. november 2026.** Tre subagenter undersøgte emnet på nettet. Påstande om andre produkter og priser kommer fra deres kilder og er ikke efterprøvet af mig. Usikre punkter er markeret. Intet her er besluttet.

**Tommys ønske:** man starter ét sted (et warp-rum / en hub) og går ind i portaler til brugerskabte verdener. Skaberne bygger i et lukket, tilkoblet kodemiljø. Hub-mekanikken er en almindelig genrekonvention. Udseende, figurer og navn skal være Playverses egne og ikke efterligne et bestemt eksisterende spil.

## 1. Hubben
- **Anbefalet til v1: en 2D-hub set oppefra, som genbruger banerace-motoren.** Hubben er selv en bane-JSON (`type: "hub"`), hvor portalfelter har `{levelId, version}`. Man går ind i en portal, banen indlæses på samme side, og når man er i mål (eller trykker Esc), står man foran portalen igen. Indsats: 2–3 sessioner oven på spillet.
- **Ved hver portal:** et skilt med titel, skaber, bedste tid og egne stjerner samt mærket NEW/UPDATED ved ny version.
- **Dybe links:** `/#/w/<levelId>@<version>` og `/#/hub/<rum>`. De kræver ingen serveropsætning på Cloudflare Pages.
- **Mange portaler:** faste rum med 8–12 portaler og døre mellem rummene, senere kuraterede rum (Featured, New, Top). Der skal altid være en "Browse all"-liste med søgning, fordi en hub at gå rundt i er til opdagelse og ikke et register.
- **Senere:** 2,5D-udseende (billigt løft) og en egentlig 3D-hub (three.js/Babylon). 3D anslås til 4–8+ sessioner og er tungere på svage telefoner.

## 2. Det lukkede kodemiljø: tre niveauer
| Niveau | Hvad skaberen laver | Sikkerhed | Hvornår |
|---|---|---|---|
| 0 – Data | `level.json` mod et skema | Ingen kode kører | Nu (godkendt v1) |
| 2 – Fuld kode i sandkasse | Hel HTML/JS-verden, typisk AI-skrevet | Browserens isolering: iframe på separat domæne | Næste udvidelse |
| 1 – Begrænset scripting | Lua/QuickJS mod et lille Playverse-API | Fortolker med tids- og hukommelsesgrænse | Kun hvis der bliver brug for dyb integration |

Subagenten anbefaler niveau 2 før niveau 1. Det er billigere for én udvikler, AI skriver allerede almindelige HTML/JS-spil godt, og sikkerheden kommer fra browseren og ikke fra egen kode. itch.io bruger samme mønster (separat domæne og iframe).

**Hvis niveau 2 bygges:**
- **Isolering:**
  - Verdener serveres fra et **separat domæne** (fx `playverse-worlds.com`, ikke et underdomæne) i `<iframe sandbox="allow-scripts">`. **Aldrig** sammen med `allow-same-origin`, `allow-top-navigation`, `allow-popups` eller `allow-forms`.
  - Streng CSP på verdensdomænet: `connect-src 'none'` og kun egne aktiver. Det blokerer dataudtræk og mining-pools.
- **Kontrol fra hubben:**
  - Hubbens bjælke ligger altid uden for rammen ("You are in a creator world") med en Exit-knap, der fjerner iframen.
  - Verdenen får kun kaldenavnet, aldrig tokens.
- **postMessage-protokol (versioneret):**
  - Hub → verden: `init {nickname, worldId, sessionId, muted}` og `pause` / `resume`.
  - Verden → hub: `ready`, `finish {score, timeMs}` og `exit`.
  - Hubben tjekker `event.source === iframe.contentWindow`, fordi origin er "null" for alle sandkasser. Den tillader kun kendte typer.
- **Scorer:** scorer fra kodeverdener er **ubekræftede** og vises adskilt fra JSON-banernes scorer.
- **Upload og gennemsyn:** kun statiske filer med størrelsesgrænse og et simpelt scan. Verdener er unlisted, indtil Tommy har godkendt dem, og der er en rapportér-knap. Det passer ind i det eksisterende forslagsflow (diff → sandkasse → godkend → udgiv → rollback).
- **Pris:** ca. 0 kr. på Cloudflare Pages. Workers for Platforms (25 $/md.) er kun relevant for multiplayer eller logik på serveren.

## 3. Lignende produkter (subagentens fund, ikke efterprøvet)
- **Vibe Jam-portalerne** (2026, ca. 1.000 AI-kodede browserspil) ligner Playverse mest. Spil kan have en udgangsportal, der sender spilleren videre med URL-parametre (`portal=true`, `username`, ...). Det viser, at portal-hop mellem AI-spil virker, men det er en spredt webring uden varig hub, fælles highscores og gennemsyn. Playverse kunne understøtte samme URL-protokol.
- **Websim og Rosebud AI:** AI-skabte, remixbare browserspil, men uden gennemsyn og uden en hub at gå rundt i. Playverse kan tage imod eksport derfra som forslag i stedet for at konkurrere på generatoren.
- **itch.io, Poki og CrazyGames:** forbillede for sandkasse og gennemsyn plus et SDK (score, pause).
- **Core og Roblox:** "multivers" med hop mellem oplevelser. Roblox har annonceret browserspil (usikkert, om det er udkommet).
- **Advarsler:** Rec Room lukker (meldt til 1/6-2026, fordi omkostningerne oversteg indtægterne). Dreams har ikke fået ny support siden 2023, og HYTOPIA er tilsyneladende drejet over i egne spil. Tunge sociale platforme bukker under for driftsomkostninger, så Playverse skal holdes statisk og billigt.
- Ingen fundne produkter kombinerer hub, AI-minispil, versioneret gennemsyn og fælles highscores. Det er Playverses mulige niche. Den egentlige konkurrentundersøgelse er fortsat pv4 (GPT).

## 4. Forslag til plan (ikke besluttet)
1. Byg banerace og scoretavle som planlagt (pv8, pv9, pv11). Motoren laves, så en hub blot er en banetype.
2. **Ny: 2D-hub (2–3 sessioner)** med et rum, skilte, dybe links og Browse all, lige efter scoretavlen.
3. **Ny: niveau 2-kodeverdener**: separat domæne, sandkasse-iframe, postMessage-API og ubekræftede scorer. Det sker efter første rollback-øvelse.
4. Niveau 1-scripting, 3D-hub og multiplayer udskydes.

## Til Tommy
1. Skal 2D-hubben med i første version (lige efter scoretavlen), eller komme bagefter?
2. Er niveau 2 (fuld AI-skrevet kode i en sandkasse-iframe på et separat domæne) den rigtige retning for kodemiljøet? I så fald skal der bruges et ekstra domæne (ca. 80–100 kr./år; prisen er ikke tjekket).
3. Skal Playverse kunne modtage og sende spillere via Vibe Jam-portalprotokollen?
