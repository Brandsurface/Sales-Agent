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
Tager typisk 1-3 minutter (dyb websøgning + strukturering). Mens den kører, vises et live feed med
faseindikator (registrering → research → strukturering), forløbet tid, og - for Claude - selve
research-teksten der strømmer ind efterhånden som den skrives, så du kan se præcis hvor langt den er
og at den rent faktisk arbejder. Tidligere researchede leads ses i højre side.

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

I web-UI'et kan du desuden downloade en flot, printvenlig "sales dossier"-udgave af briefen som en
selvstændig HTML-fil, eller trykke "Print / Gem som PDF" for at åbne browserens print-dialog og gemme
den som PDF - god til at have i hånden eller på skærmen lige før opkaldet.

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

## Model og omkostningsstyring

Standardmodeller/max-tokens sættes via `.env` (`ANTHROPIC_RESEARCH_MODEL`, `ANTHROPIC_BRIEF_MODEL`,
`ANTHROPIC_RESEARCH_MAX_TOKENS`, `ANTHROPIC_BRIEF_MAX_TOKENS`), men kan også overstyres **pr. kørsel**
uden at genstarte serveren:

- **Web-UI:** åbn "Avancerede indstillinger" i formularen - vælg model (Opus/Sonnet/Haiku) og sæt
  max tokens for hver af de to faser.
- **CLI:** `--model claude-haiku-4-5 --max-tokens 12000 --brief-max-tokens 6000`

Brug fx Haiku 4.5 til at teste hele flowet billigt, før du kører rigtige leads på Opus.

Hvis strukturerings-fasen fejler (fx fordi svaret bliver skåret af), prøver den automatisk igen med
dobbelt så mange tokens. Fejler det stadig, går det allerede betalte research-memo **ikke tabt** - det
gemmes som en `.raw.md`-fil i `/briefs` og vises direkte i UI'et/CLI'en med en advarsel, i stedet for
bare at give en fejl og intet resultat.

**Hvad koster et research-kald?** Hver Claude-kald logger faktisk token-forbrug + et omtrentligt
dollar-estimat i serverens terminal (`[usage] research iteration 1 (stop=end_turn) (claude-opus-4-8):
input=... output=... ~$0.42`), så du kan se præcis hvor pengene går - og om et kald genstarter
("pause_turn") flere gange, hvilket er den primære ting der kan gøre et Opus-kald dyrt. Der er indbygget
et par ting der holder dette i skak: research-kaldet caches (`cache_control`) så en genstart genbruger
allerede-behandlet historik i stedet for at betale fuld pris igen, kører på `effort: "high"` i stedet for
`"xhigh"` (markant billigere, stadig grundig), har lavere lofter for antal søgninger/hentninger pr. kald,
og stopper efter maks. 3 genstarter i stedet for at blive ved. Vil du ned i pris med det samme: vælg
Sonnet 5 eller Haiku 4.5 under "Avancerede indstillinger", eller test gratis med Gemini.

## Gemini som gratis test-udbyder

Til at teste selve flowet uden at bruge Claude-credits kan du bruge Google Gemini (gratis tier):

1. Hent en gratis nøgle på https://aistudio.google.com/apikey
2. Sæt `GEMINI_API_KEY=` i `.env`
3. Vælg "Gemini" under "Udbyder" i Avancerede indstillinger i UI'et, eller kør CLI'en med `--provider gemini`

Gemini-sporet bruger nøjagtigt de samme system-prompts som Claude-sporet (samme signal-taksonomi,
samme krav om kildehenvisning, samme brief-skema), men bruger Googles indbyggede søgeværktøj
(`googleSearch`-grounding) i stedet for `web_search`, og er én enkelt kald pr. fase i stedet for
Claudes multi-turn søgeloop - så det er tænkt til hurtig/billig test af flowet, ikke som en fuld
erstatning for Opus' dybde. Kvaliteten af research vil typisk være lavere end Claude Opus 4.8.

## Begrænsninger (v1)

- Registreringsopslaget kræver at virksomheden har en hjemmeside med en findelig Impressum/kontakt/legal-side
  - virker ikke uden en website-URL, og finder intet hvis siden ikke matcher de kendte mønstre.
- CSV-parseren er simpel (ingen understøttelse af citerede felter med komma).
- Ingen autentificering - kun tænkt til lokal brug.
