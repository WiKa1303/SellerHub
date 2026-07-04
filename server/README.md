# SellerHub Seller-Radar (MVP)

News & Event Intelligence Hub für Amazon FBA Seller (DACH): Crawler + Relevanz-Filter + REST-API.
Konzept & Architektur-Entscheidungen: [`../KONZEPT-SellerRadar.md`](../KONZEPT-SellerRadar.md).

## Projektstruktur

```
server/
├── src/
│   ├── index.js            ← Einstieg: DB + API + Cron in einem Prozess
│   ├── config.js           ← ENV, Schwellen, Keyword-Lexikon (alles Justierbare)
│   ├── sources.js          ← Seed-Quellen (Konfigurationsdaten, kein Code)
│   ├── db.js               ← pg-Pool, Auto-Migration, Queries
│   ├── scoring.js          ← Relevanz-Score 0–100 (deterministisch, erklärbar)
│   ├── dedupe.js           ← URL-Hash + Titel-Trigram-Ähnlichkeit
│   ├── api.js              ← GET /api/news · /api/events · /api/dashboard-feed · /api/health
│   ├── crawl-once.js       ← Einmal-Lauf für externe Scheduler
│   └── crawler/
│       ├── run.js          ← Orchestrierung eines Crawl-Laufs
│       ├── rss.js          ← RSS/Atom laden + parsen
│       └── normalize.js    ← URL/Text/Datum-Normalisierung, Event-Erkennung
├── test/smoke.test.js      ← End-to-End gegen echte Feeds (pg-mem statt Postgres)
├── .env.example
└── package.json
```

## Lokal starten

```bash
cd server
npm install
cp .env.example .env        # DATABASE_URL eintragen (lokales Postgres oder z.B. Neon Free-Tier)
npm start                   # API auf :8787, crawlt sofort + per Cron
npm test                    # Smoke-Test OHNE Postgres (pg-mem) – braucht nur Internet
npm run crawl               # einmaliger Crawl-Lauf, dann Exit
```

Schnelltest der API: `curl localhost:8787/api/dashboard-feed`

## Scheduling-Logik

- **Ein Prozess:** `node-cron` läuft im API-Prozess (`CRAWL_CRON`, Standard `0 6,15 * * *` = 6:00 + 15:00). News sind kein Echtzeit-Problem — 2×/Tag ist für Seller genau richtig und maximal quellen-schonend.
- **Boot-Crawl:** Nach jedem Deploy einmal sofort (`CRAWL_ON_BOOT=true`), damit die DB nie leer ist.
- **Überlapp-Schutz:** `crawlState.running` verhindert parallele Läufe.
- **Alternative für Sleep-Hosting** (Render Free schläft ein): Cron extern triggern — `npm run crawl` als Railway-Cron/GitHub-Action, oder `POST /api/admin/crawl` (Header `X-Api-Key`) von einem Uptime-Pinger.

## Deployment (Railway / Render)

1. Repo verbinden, Root-Verzeichnis `server/` wählen.
2. PostgreSQL-Addon anlegen → `DATABASE_URL` wird gesetzt (Schema legt sich beim Start selbst an).
3. ENV setzen: `ADMIN_KEY`, optional `CRAWL_CRON`, `SCORE_THRESHOLD`.
4. Start-Command: `npm start`. Fertig — `GET /api/health` zum Verifizieren.

DSGVO-Hinweis: Es werden ausschließlich öffentliche Artikel-Metadaten gespeichert (Titel, ≤300-Zeichen-Anriss, Link, Datum) — keine Personendaten. EU-Region beim Hoster wählen.

## Dashboard-Anbindung (SellerHub-Frontend)

Das Widget im SellerHub-Dashboard aktiviert sich, sobald die API-URL gesetzt ist (Browser-Konsole):

```js
localStorage.setItem('wika_radar_api', 'https://<deine-radar-api>');
```

Danach zeigt der Login Top-5-News + Top-3-Events aus `GET /api/dashboard-feed`. Ohne gesetzte URL bleibt das Widget unsichtbar (kein Fehler, kein Rauschen).

## Skalierungs-Hinweise (wann was)

| Auslöser | Maßnahme |
|---|---|
| Mehr Leser | Nichts tun — `Cache-Control: max-age=300` steht schon; CDN davor (Cloudflare) macht Reads gratis |
| Mehr Quellen | Nur `sources.js` erweitern; HTML-Quellen: `type:'html'` + Selektor-Parser in `crawler/` ergänzen (Playwright erst, wenn eine Kernquelle JS-gerendert ist) |
| Crawl blockiert API spürbar | Worker abtrennen: gleicher Code, zweiter Prozess mit `npm run crawl` + externem Cron |
| Nutzer-Accounts/gespeicherte Filter | Jetzt erst lohnt sich mehr DB: Tabelle `user_prefs`, ggf. managed Postgres skalieren |
| Feed-Qualität | `SCORE_THRESHOLD` justieren; Keyword-Lexikon in `config.js` pflegen; später LLM-Klassifikation als Batch-Schritt NACH dem Crawl (Ausfall unkritisch) |

Bewusst NICHT gebaut (MVP): Volltext-Archiv, Echtzeit-Push, Headless-Browser-Farm, automatische Quellen-Entdeckung.

---

# Phase 3: KI-Relevanzanalyse & Personalisierung

## Architektur (AI Service Layer)

```
 CRAWLER (Phase 2)                    AI-LAYER (Phase 3)                        API
┌────────────────┐   speichert   ┌──────────────────────────────┐   ┌─────────────────────────┐
│ RSS → Keyword- │──────────────▶│ DB-Queue: ai_analyzed_at NULL │   │ /api/news?interests=…    │
│ Gate → Insert  │  (blockiert   │  └▶ drainQueue()  2 parallel  │   │ /api/dashboard-feed?…    │
└────────────────┘   NIE auf KI) │      └▶ analyzeItem()         │──▶│  → rankForProfile():     │
                                 │          Claude API            │   │    KI-Score + Profil-    │
      Items sind SOFORT mit      │          (structured output,   │   │    Match + Urgency/      │
      Keyword-Score sichtbar;    │           SDK-Retry, effort:low)│  │    Impact-Boost + why[]  │
      KI-Score ersetzt asynchron │      └▶ saveAiResult()         │   │ POST /api/feedback 👍👎  │
                                 └──────────────────────────────┘   └─────────────────────────┘
```

**Bewusste Entscheidungen:**
- **Die DB ist die Queue** (`ai_analyzed_at IS NULL` = offen): crash-sicher ohne Redis — nach Neustart macht der Worker weiter. **BullMQ/Redis** wird erst nötig, wenn mehrere Worker-*Prozesse* das Backlog teilen; die Schnittstelle (`drainQueue()`) bleibt dann identisch, nur der Dispatcher wechselt.
- **Ein API-Call pro Artikel** liefert Analyse *und* Summary (kein zweiter Call = halbe Kosten).
- **Strukturierte Outputs** (`output_config.format` mit JSON-Schema) garantieren valides JSON — kein Parsing-Fallback nötig.
- **Retry:** 429/5xx übernimmt das Anthropic-SDK (exponentieller Backoff, `maxRetries: 3`). Wirft es trotzdem, zählt `ai_attempts` hoch; ab `AI_MAX_ATTEMPTS` bleibt das Item dauerhaft beim Keyword-Score (Kostenbremse).
- **Degradations-Pfad:** ohne `ANTHROPIC_API_KEY` läuft alles wie Phase 2 (Keyword-Scoring) — kein Feature bricht.
- **Logging von KI-Entscheidungen:** je Item eine Log-Zeile (score/cat/urgency/tokens) + vollständig in der DB (`ai_reasoning`, `ai_model`, `ai_tokens_*`) → auditierbar.
- **Fine-Tuning-/Feedback-Vorbereitung:** `POST /api/feedback` (👍/👎 → `ai_feedback`) + gespeicherte `ai_reasoning` ergeben den späteren Eval-/Trainingsdatensatz.

## Personalisierung

Profil bleibt beim **Client** (localStorage in SellerHub) und kommt als Query-Parameter mit — keine Accounts, keine Personendaten in der DB (DSGVO). Bei späteren Accounts wandert dasselbe Schema in eine `seller_profiles`-Tabelle; `rankForProfile()` bleibt unverändert.

```
personalized_score = KI-Score (Fallback: Keyword-Score)
                   + 10 wenn urgency=hoch (+4 mittel)
                   + 10 wenn impact=high (+4 medium)
                   + 12 wenn Kategorie ∈ Interessen
                   + 4–8 Seller-Typ-Affinität (z.B. arbitrage×recht)
                   + 3–4 Umsatzgrößen-Affinität
                   + 5 wenn Land ∈ Fokusmärkte
```

Jedes Item trägt `why[]` („Warum sehe ich das?") — derselbe Ehrlichkeits-Ansatz wie die Daten-Konfidenz im Scorecard.

**Beispiel** `GET /api/dashboard-feed?seller_type=arbitrage&revenue=starter&markets=DE,AT&interests=recht,steuern`:

```json
{
  "news": [{
    "title": "GPSR-Frist: neue Gebühr für Produktsicherheit ab 13.12.",
    "source": "Wortfilter.de", "publish_date": "2026-07-04T…", "url": "https://…",
    "relevance_score": 71, "ai_score": 88,
    "ai_category": "recht", "ai_urgency": "hoch", "ai_impact": "high",
    "ai_reasoning": "Gesetzliche Frist mit direktem Handlungsbedarf für FBA-Seller.",
    "ai_summary": [
      "Prüfe bis zur Frist alle betroffenen Listings.",
      "Dokumentiere die Produktsicherheits-Angaben.",
      "Kläre offene Fälle mit deinem Steuerberater."
    ],
    "personalized_score": 133,
    "why": ["KI-Relevanz 88", "dringend", "hoher Business-Impact",
            "passt zu deinem Interesse „recht\"", "relevant für arbitrage", "Fokusmarkt DE"]
  }],
  "events": [ … ],
  "meta": { "personalized": true, "ai": { "analyzed": 42, "lastRun": "…" } }
}
```

Client-Seite: `localStorage.setItem('wika_radar_profile', JSON.stringify({seller_type:'private_label', revenue:'starter', markets:['DE'], interests:['ppc','recht']}))` — das Widget hängt die Parameter automatisch an.

## Kostenabschätzung pro 1.000 Artikel

Annahmen: ~850 Input-Tokens/Artikel (Systemprompt ~550 + Titel/Anriss ~300), ~230 Output-Tokens (Analyse + Bullets), `effort: low`.

| Modell | Input | Output | **pro 1.000 Artikel** | mit Batch API (−50 %) |
|---|---|---|---|---|
| `claude-opus-4-8` (Default) | $5/M | $25/M | **~$10,00** | ~$5,00 |
| `claude-sonnet-4-6` | $3/M | $15/M | **~$6,00** | ~$3,00 |
| `claude-haiku-4-5` | $1/M | $5/M | **~$2,00** | ~$1,00 |

**Realer Betrieb:** Das Keyword-Gate (Phase 2) lässt nur ~15–40 relevante Items/Tag durch → selbst mit Opus **unter ~0,40 $/Tag bzw. ~12 $/Monat**. Die zweistufige Pipeline (billiges Keyword-Gate → LLM nur für Überlebende) IST die wichtigste Kostenkontrolle. Weitere Bremsen: `AI_MAX_PER_RUN`, `AI_MAX_ATTEMPTS`, Token-Logging je Item in der DB, Verbrauch live unter `/api/health`.

Ehrliche Fußnoten: (1) Prompt-Caching lohnt hier noch nicht — der stabile Prompt-Präfix liegt unter dem cache-baren Minimum (4.096 Tokens auf Opus/Haiku); wird der Prompt um Few-Shot-Beispiele erweitert, wird Caching zum Hebel. (2) Der größte Kostenhebel bei Skalierung ist die **Batch API** (Analyse ist nicht latenzkritisch — der Crawl läuft 2×/Tag): 50 % Rabatt, Umbau ~1 Tag.

