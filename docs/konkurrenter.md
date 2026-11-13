# Konkurrentundersøgelse (pv4)

Claude, 13. november 2026. Trinet stod oprindeligt hos GPT. Claude tog det, fordi Tommy sagde "bliv ved", og alle andre åbne trin venter på ham. Dette er **observationer og arbejdsforslag, ikke beslutninger**. Tallene stammer ofte fra virksomhedernes egne indlæg eller fra tredjepartsoversigter. De er markeret, og bør tjekkes igen, før de bruges udadtil. Den korte sammenligning i [hub-og-portaler.md](hub-og-portaler.md) §3 er udbygget her.

## Kort fortalt
- AI-spilskabere med egen hosting (**Astrocade, Rosebud, Websim**) har mange penge og brugere. Playverse bør ikke konkurrere med dem som generator.
- Mapper over AI-lavede browserspil (**Playground, Grokade, VibeStar, Vibe Arcade, itch.io-tagget "vibe-coding"**) er mange og tynde: lister med links, uden fælles scorer, gennemsyn eller versioner.
- **Vibe Jam 2026** viste, at portaler mellem spil trækker spillere: ca. 945 spil og over 242.000 spillere (sekundær kilde).
- **Ingen fundne produkter** kombinerer en hub at gå rundt i, versionerede baner med gennemsyn og rollback, og fælles scoretavler med rimelighedstjek. Det er stadig Playverses mulige niche, som allerede antaget i hub-og-portaler.md.

## Oversigt

| Produkt | Hvad det er | Det, Playverse kan lære | Forskellen til Playverse |
| --- | --- | --- | --- |
| **Astrocade** | AI-agenter laver spil ud fra tekst; remix med ét klik; skabere tjener penge pr. spilning; ugentlige game jams på Discord. Selvoplyst: 75.000+ spil, $56 mio. rejst i maj 2026 (Sequoia). | Remix som standard er drivkraften. Jams giver en fast rytme. | Lukket platform uden eksport, uden gennemsyn før udgivelse og uden fælles konkurrence på samme bane. |
| **Rosebud AI** | Lav spil i browseren via prompt (2D, 3D, voxel), del med et link. Gratis til ikke-kommerciel brug. | Delbart link og spilbar med det samme. | En generator, ikke et sted at konkurrere. |
| **Websim** | AI-lavede sider og spil med offentligt link, feed, likes, kommentarer og remix. Gratis daglige credits er ifølge én kilde stoppet i januar 2026. | Remix-feed. Gratis credits er ikke en holdbar forretning. | Ingen kvalitetskontrol og ingen scorer. |
| **Vibe Jam 2026** (levelsio, Cursor) | Månedslang jam fra 1/4 til 1/5 2026. Spil med en udgangsportal kommer med i en webring og på en tavle over overførte spillere. | En simpel portalprotokol via URL-parametre er nok til at skabe trafik mellem spil. | Begivenhed, ikke platform. Ingen fælles scorer, ingen versioner. |
| **Playground, Grokade, VibeStar, Vibe Arcade** | Mapper og gallerier over AI-lavede browserspil. Playground: 700+ spil (Show HN). | Kreditering af skaberen og genre-filtre. | Kun links. Ingen motor, ingen scorer, ingen ejerskab af banerne. |
| **itch.io** (tag "vibe-coding") | Stor indie-platform med sandkasse-iframe og jams. | Sandkasse til fremmed kode og jams som indgang. | Generisk butik, intet fælles spil eller scoretavle. |
| **Poki og CrazyGames** | Portaler til browserspil med reklameindtægter og krav om SDK, størrelsesgrænser m.m. Indtægtsdelingen er uklar i offentlige kilder: ca. 50/50 hos Poki og 60/70 % hos CrazyGames i en jam, ifølge tredjeparter. | Et lille SDK (pause, score, reklamepunkter) er standard. Det svarer til Playverses planlagte postMessage-API. | Kuraterede spil fra studier, ikke brugerbaner med fællesscorer. |
| **SpeedRun** (itch.io) | Browser-platformspil med baneeditor, udgivelse af baner, spøgelses-race, daglig bane og scoretavler pr. "mutator". Udgivelsesdato er ikke bekræftet. | Daglig bane, spøgelser og varianter med egen tavle. Det er de stærkeste fastholdelsesgreb i genren. | Ét spil, ingen hub, ingen AI-skabere, intet gennemsyn. |
| **Trackmania, Geometry Dash, Mario Maker** (almen viden, ikke tjekket nu) | Brugerskabte baner med tider og scoretavler. Daglig bane ("Track of the Day"); moderatorer vurderer baner (Geometry Dash). | Udvalgte og daglige baner skaber trafik til få baner, så tavlerne bliver levende. | Lukkede spil-klienter, ikke åbne webportaler. |

## Lærdom for Playverse (arbejdsforslag)
1. **Kopiér ikke generatoren.** Lad skaberne bruge Astrocade, Rosebud, Claude eller GPT, og gør Playverse til stedet, hvor bidragene gennemses, versioneres og konkurreres på. Det passer til den besluttede retning (forslag, diff, sandkasse, godkendelse, rollback).
2. **Fokusér trafikken.** Tavler med én spiller er døde. En **daglig eller ugentlig bane** i hubben (som Trackmania og SpeedRun) giver mest fællesskab for mindst kode. Hubben kan få en fremhævet portal.
3. **Spøgelser.** At race mod sin egen eller rekordholderens bedste tur er billigt med Playverses deterministiske motor: gem input pr. step, ikke positioner. Det styrker også snydekontrollen, fordi turen kan afspilles igen på serveren.
4. **Remix som PR.** Astrocade og Websim viser, at remix driver skabelse. I Playverse kan "Remix" i Browse all åbne en ny version af banen som forslag. Ved hjælp af AI kan det være en prompt, der laver en JSON-bane.
5. **Vibe Jam-portalprotokollen.** Billig adgang til trafik. Kan laves som en udgangsportal i hubben og en indgangsportal på `?portal=true` (åbent spørgsmål 3 i hub-og-portaler.md).
6. **Penge senere.** Reklamer à la Poki og CrazyGames kræver trafik og ændrer oplevelsen. Med lavt budget passer Cloudflares gratisniveau. Indtægter er ikke en v1-sag.

## Forslag til rækkefølge efter v1 (ikke besluttet)
- a. Daglig/ugentlig bane i hubben (1–2 blokke).
- b. Spøgelser og serverside-afspilning af input (2–3 blokke). Gør snydekontrollen stærkere.
- c. Vibe Jam-portaler ind og ud (1 blok).
- d. Remix-knap og en prompt-skabelon til AI-baner som PR (2 blokke).
- e. Niveau 2-kodeverdener i sandkasse-iframe (hub-og-portaler.md §2), større (4+ blokke).

## Åbne spørgsmål (Tommy)
- Skal Playverse positioneres som "stedet hvor AI-baner konkurreres og gennemses" frem for som en AI-generator?
- Hvilke af a–e, og i hvilken rækkefølge, efter udgivelsen?

## Kilder
- [Astrocade: finansiering $56M](https://www.astrocade.com/blog/astrocade-raises-56m-funding), [PocketGamer.biz](https://www.pocketgamer.biz/astrocade-raises-56m-to-expand-ai-powered-games-creation-platform/), [Astrocade: skaberindtægter](https://www.astrocade.com/blog/how-game-creators-are-turning-creativity-into-cash-on-astrocade), [Astrocade: jams](https://www.astrocade.com/blog/game-jams-creator-culture)
- [Rosebud AI](https://rosebud.ai/), [Taskade: AI-spilgeneratorer 2026](https://www.taskade.com/blog/ai-game-generators), [Cinevva: AI-spilgeneratorer 2026](https://app.cinevva.com/guides/ai-game-generators-2026)
- [Vibe Jam 2026](https://vibej.am/2026/), [Vibe Jam presse](https://vibej.am/2026/press), [Summer Engine: guide til Vibe Jam 2026](https://www.summerengine.com/blog/cursor-vibe-jam-2026-guide), [Colyseus om Vibe Jam 2026](https://colyseus.io/blog/vibe-jam-2026/)
- [Playground (zeli.app)](https://zeli.app/story/50168142), [Cursor-forum: hjem for vibe-kodede spil](https://forum.cursor.com/t/a-simple-home-for-vibe-coded-games-come-play-or-add-yours/163196), [itch.io tag vibe-coding](https://itch.io/games/newest/tag-ai-generated/tag-vibe-coding)
- [CrazyGames-krav](https://docs.crazygames.com/requirements/intro/), [Playgama: Poki vs CrazyGames vs GameDistribution](https://playgama.com/blog/business-faqs/poki-vs-crazygames-vs-gamedistribution-revenue-share/), [Cinevva: Poki](https://app.cinevva.com/guides/publish-game-poki)
- [SpeedRun (itch.io)](https://vibefoundry.itch.io/speedrun), [speedrun.com: Speedrun Maker](https://www.speedrun.com/pl-PL/Speedrun_Maker/stats)
