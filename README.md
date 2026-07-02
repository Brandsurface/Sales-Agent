# Sales Agent (Exemplar.dk)

AI-agent der research'er en prospect-virksomhed og laver et konkret "call brief" med citerede, aktuelle
grunde til at ringe (produktlancering, emballage-redesign, markedsudvidelse, ansættelsessignaler, m.m.),
mappet til Exemplar's ydelser (label-, doypack-, dåse-, POS-, cartonage- og shrink wrap-mockups).

## Setup

1. `npm install`
2. `cp .env.example .env` og udfyld `ANTHROPIC_API_KEY` (hentes på https://console.anthropic.com/)
3. `npm run dev` starter web-UI'et på http://localhost:4000

## Brug

### Web-UI
Åbn http://localhost:4000, udfyld firmanavn (+ evt. website/noter), tryk "Research virksomhed".
Tager typisk 1-3 minutter (dyb websøgning + strukturering). Tidligere researchede leads ses i højre side.

### CLI - enkelt lead
```
npm run research -- --name "Firma A/S" --url https://firma.dk --notes "kender indkøbschef"
```

### CLI - batch af flere leads
Lav en CSV med kolonnerne `name,url,notes` (ingen understøttelse af komma i felter):
```
npm run research -- --csv leads.csv
```

Alle briefs gemmes i `/briefs` som både `.json` (fuld data) og `.md` (klar til at kopiere ind i CRM/noter).

## Hvordan det virker

1. **Registreringsopslag** (best-effort, virker på tværs af lande): hjemmesiden (URL'en du giver) hentes,
   og en Impressum/kontakt/legal-side findes og scannes for det officielle registreringsnummer - fx dansk
   CVR, tysk Handelsregister/HRB, norsk/svensk Org.nr, eller et bare EU VAT-nummer. Ingen ekstern API eller
   nøgle nødvendig. Findes intet, springes det bare over.
2. **Dyb research** (`claude-opus-4-8` + Anthropics indbyggede `web_search`-værktøj): modellen søger
   selv gentagne gange (dansk + engelsk), leder efter konkrete, daterede signaler ud fra en fast
   signal-taksonomi, og skriver et research-memo med kildehenvisninger. Ingen opdigtning tilladt - lav
   tillid til data siges ærligt.
3. **Strukturering** (`claude-sonnet-5`, billigere, intet værktøj): omsætter memoet til et fast JSON-skema
   **på dansk** - signaler rangeret efter styrke (stærkeste ringe-grund øverst), fit-vurdering (er firmaet
   overhovedet et Exemplar-match?), beslutningstager, 2-3 åbningsreplikker forankret i konkrete fund,
   opfølgningsspørgsmål og samlet confidence.
4. Brief'en gemmes lokalt og vises i UI'et/CLI'en. I CSV-batch-tilstand printes til sidst en rangeret
   ringeliste (bedste fit + confidence øverst).

Modellerne kan ændres via `ANTHROPIC_RESEARCH_MODEL` / `ANTHROPIC_BRIEF_MODEL` i `.env`, hvis du fx vil
bruge en billigere model til research-fasen ved høj volumen.

## Begrænsninger (v1)

- Registreringsopslaget kræver at virksomheden har en hjemmeside med en findelig Impressum/kontakt/legal-side
  - virker ikke uden en website-URL, og finder intet hvis siden ikke matcher de kendte mønstre.
- CSV-parseren er simpel (ingen understøttelse af citerede felter med komma).
- Ingen autentificering - kun tænkt til lokal brug.
