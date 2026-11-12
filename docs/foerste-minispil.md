# Første minispil – afgrænsning (pv5)

Status: **godkendt af Tommy 12. november 2026 (pv6)** med svarene nedenfor.

## Formål
Det første spil er ikke målet i sig selv. Det skal bære det forløb, README'en beskriver, fra start til slut: **én skaber, ét spil, én scoretavle og ét forslag, der går fra diff til udgivelse og rollback.** Spillet skal derfor gøre det let at vise en diff, afprøve den i sandkassen og sammenligne scorer.

## Forslag: en lille 2D-banerace, hvor banerne er data
Spilleren styrer en figur gennem en kort, ét skærmbillede stor bane: nå målet hurtigst muligt og saml et par valgfrie stjerner. Scoren er tiden (lavest vinder), og stjerner giver tidsfradrag.

**Hvorfor denne form:**
- **En bane er en JSON-fil** (grid, start, mål, stjerner, forhindringer). Et community-forslag bliver så en ændring af data, ikke af kode. Diffen er kort og læsbar, sandkassen skal ikke køre fremmed kode, og sikkerhedstjekket kan være et skemaskjek. Det passer direkte på "isoleret udgivelse pr. bane".
- **Scoren er nem at kontrollere:** tid og banens version. Rimelighedstjek (mindste mulige tid) er nok i første omgang.
- **"Baner og quests"** følger naturligt med: en quest kan senere være "klar 3 baner under X sek.".
- Spillet virker i 2D på en svag computer og en telefon (piletaster/WASD og touch-knapper).

## Med i første version
- 3 baner, som skaberen (Tommy) har lavet, i en fast mappe pr. bane med `level.json` og en version.
- Selve spillet i én side uden byggetrin (canvas 2D, vanilla JS), så det kan hostes statisk.
- Scoretavle pr. bane og version: top 10, kaldenavn og tid. Scorer nulstilles ikke ved ny version; de vises pr. version.
- Et forslag = en ændret eller ny `level.json`, som vises som diff mod den nuværende version, kan spilles i sandkassen og kræver skaberens godkendelse før udgivelse.
- Rollback: skaberen kan genudgive en tidligere version af en bane med ét klik.

## Udenfor første version
3D, multiplayer, AI-genererede baner i portalen, baneeditor i browseren (JSON redigeres i hånden eller af AI uden for portalen), login via GPT/Claude, kommentarer, profiler og mere end én skaber.

## Færdig, når
1. En fremmed kan åbne et link, spille bane 1 på mobil og computer og se sin tid på scoretavlen.
2. Et forslag til bane 2 kan vises som diff, spilles i sandkassen, godkendes, udgives, og derefter rulles tilbage. Scorerne bevares pr. version.
3. En ugyldig `level.json` (forkert skema, umulig bane, for stor fil) afvises før sandkassen.

## Tommys svar (pv6, 12/11)
1. **Spilform:** godkendt – banerace med baner som data.
2. **Login:** kun kaldenavn i første version.
3. **Sprog:** engelsk.
4. **Forslag:** kun Tommy til at starte med.

Teknisk skitse: se [teknisk-skitse.md](teknisk-skitse.md) (pv7).
