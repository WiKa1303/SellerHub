# SellerHub Seller-Radar (MVP)

News & Event Intelligence Hub für Amazon FBA Seller (DACH): Crawler + Relevanz-Filter + REST-API.
Konzept & Architektur-Entscheidungen: [`../KONZEPT-SellerRadar.md`](../KONZEPT-SellerRadar.md).

## Projektstruktur (Service-Architektur — Details & Grenzen: [`ARCHITEKTUR.md`](ARCHITEKTUR.md))

```
server/
├── ARCHITEKTUR.md            ← Schichten, Service-Grenzen, Kernmodule, Multi-Tenancy, Skalierung
├── CLAUDE.md                 ← Konventionen + Checklisten für die Weiterentwicklung mit Claude Code
├── src/
│   ├── index.js              ← Kombi-Einstieg (MVP): startet apps/api + apps/worker in einem Prozess
│   ├── apps/                 ← api.js (nur HTTP) · worker.js (Cron+Crawl+AI — AI läuft NUR hier)
│   ├── crawl-once.js         ← Einmal-Lauf (Crawl+Pipeline) für externe Scheduler
│   ├── core/                 ← config.js · logger.js · dedupe.js · ai-client.js (LLM-Infrastruktur)
│   ├── data/                 ← schema.js (DDL) · repos/{items,trends,alerts,strategy}.js · db.js (Fassade) · sources.js
│   ├── api/routes.js         ← REST: news/events/dashboard-feed/trends/alerts/market-intelligence/strategy/health
│   └── services/
│       ├── crawler/          ← rss.js · html.js · normalize.js · scoring.js · run.js
│       ├── intelligence/     ← AI-LAYER: registry.js (Erweiterungspunkt!) · analyze.js · queue.js
│       │                        topics.js · engine.js · interpret.js · strategy.js
│       ├── alerts/rules.js   ← Risk Shield (deterministisches Regelwerk)
│       └── feed/profile.js   ← Personal Intelligence Feed (Profil-Ranking)
├── test/                     ← smoke · html · ai · trends · strategy (pg-mem, KI gemockt)
├── .env.example
└── package.json
```

## Lokal starten

```bash
cd server
npm install
cp .env.example .env        # DATABASE_URL eintragen (lokales Postgres oder z.B. Neon Free-Tier)
npm start                   # Kombi-Modus: API auf :8787 + Worker (crawlt sofort + per Cron)
npm run start:api           # nur API (Skalierungs-Stufe 2)
npm run start:worker        # nur Worker (genau 1 Instanz)
npm test                    # Smoke-Test OHNE Postgres (pg-mem) – braucht nur Internet
npm run crawl               # einmaliger Crawl-Lauf, dann Exit
```

Schnelltest der API: `curl localhost:8787/api/dashboard-feed`

## Scheduling-Logik

- **Ein Prozess:** `node-cron` läuft im API-Prozess (`CRAWL_CRON`, Standard `0 6,15 * * *` = 6:00 + 15:00). News sind kein Echtzeit-Problem — 2×/Tag ist für Seller genau richtig und maximal quellen-schonend.
- **Boot-Crawl:** Nach jedem Deploy einmal sofort (`CRAWL_ON_BOOT=true`), damit die DB nie leer ist.
- **Überlapp-Schutz:** `crawlState.running` verhindert parallele Läufe.
- **Alternative für Sleep-Hosting** (Render Free schläft ein): Cron extern triggern — `npm run crawl` als Railway-Cron/GitHub-Action, oder `POST /api/admin/crawl` (Header `X-Api-Key`) von einem Uptime-Pinger.

## Quellen (`data/sources.js`)

Zwei Quellen-Typen, beide liefern denselben Roh-Item-Kontrakt an `crawler/run.js` (Fehler je Quelle fail-soft in der Crawl-Statistik):

- **`type:'rss'`** — RSS 2.0/Atom via `crawler/rss.js` (Standardfall).
- **`type:'html'`** — statische HTML-Listenseiten via `crawler/html.js`, dependency-frei (Regex/String-basiert, kein cheerio/jsdom). Konfiguration je Quelle über `selector_json`; vollständiges Schema im Dateikopf von `html.js`. Beispiel (aktive Quelle IT-Recht Kanzlei):

```js
{ id: 'itrecht', name: 'IT-Recht Kanzlei', type: 'html',
  url: 'https://www.it-recht-kanzlei.de/Newsarchiv.php', region: 'DE', weight: 3.0, kindHint: 'news',
  selector_json: {
    item: '<div class="newsitem">',  // Pflicht: Start-Marker für den Item-Split (String, kein Regex)
    // Defaults: erstes <a href> mit Text = Link+Titel · Datum 'auto' (<time datetime> →
    // dt. Datum 03.07.2026 → ISO-Datum) · optional title:{tag:'h2'}, summary:{tag:'p'}, maxItems
  } }
```

Neue Quelle vorher IMMER per `curl -sL <url> | head` real verifizieren (RSS: `<rss`/`<feed`; HTML: statische Artikel-Liste MIT Datum je Artikel) — JS-gerenderte Seiten funktionieren nicht (Playwright erst, wenn eine Kernquelle es zwingend braucht).

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
| Mehr Quellen | Nur `sources.js` erweitern — RSS und statisches HTML (`type:'html'` + `selector_json`) werden unterstützt, siehe Abschnitt „Quellen" |
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

---

# Phase 4: Trend-Engine, Opportunity Detection & Risk Monitoring

## Architektur

```
             (je Crawl-Lauf, alles Hintergrund — blockiert nie den Feed)
Crawl ──▶ KI-Analyse (Phase 3, liefert jetzt auch ai_topic/ai_opportunity/ai_affected)
              │
              ├──▶ TREND-ENGINE  src/trends/
              │      topics.js   Clustering: GROUP BY ai_topic + Trigram-Merge ähnlicher Slugs
              │      engine.js   Zeitreihe 7d/30d · Wachstum · Spike · Trend-Score 0–100
              │      interpret.js  Business Impact Interpretation Layer (1 LLM-Call für Top-8)
              │        └▶ trend_topics + topic_daily (Tages-Zeitreihe)
              │
              └──▶ ALERT-GENERATOR  src/alerts.js  (deterministisches Regelwerk)
                     └▶ alerts (delivered_at NULL = Push-Queue für Phase 5)

API: /api/trends · /api/trends/:id/history · /api/alerts · /api/market-intelligence
     /api/dashboard-feed enthält critical_alerts (automatische Priorisierung)
```

## Clustering-Strategie (und warum keine Embeddings in v1)

Die Phase-3-Analyse vergibt pro Artikel bereits einen **normalisierten Themen-Slug** (`ai_topic`, z. B. `gpsr-produktsicherheit`) — für ~20 Extra-Output-Tokens im ohnehin bezahlten Call. Damit ist Clustering im Kern ein `GROUP BY` (O(n), skaliert trivial auf 50k+). Was bleibt, ist das **Merging** fast identischer Slugs („fba-gebuehren" ⊂ „amazon-fba-gebuehren"): Trigram-Cosine auf den wenigen hundert *Slugs* statt Embeddings auf zehntausenden *Artikeln*.

**Upgrade-Pfad** (wenn Themen unschärfer werden oder Slug-Qualität nicht reicht): Embedding je Artikel (z. B. Voyage) → `pgvector`-Spalte → agglomeratives Clustering per Cosine ≥ 0,8 gegen Cluster-Zentroiden. Die Schnittstelle `buildClusters(items)` bleibt identisch — nur die Implementierung wechselt.

## Trend-Score (deterministisch, jede Komponente erklärbar)

```
growth_rate = (m7 − erwartet7) / erwartet7,  erwartet7 = m23Tage-Basis × 7/23
              neues Thema ohne Basis mit ≥2 Erwähnungen = +300 % („neu aufgetaucht")
Spike       = m7 ≥ 3 UND m7 ≥ 2 × Erwartung   (1→2 Erwähnungen ist KEIN Spike)

trend_score = Wachstum (0–35, voll bei +300 %)
            + Volumen (0–15, 3 P je 7-Tage-Erwähnung)
            + Ø-Relevanz aus Phase 3 (0–25)
            + Impact-Anteil high/medium (0–15)
            + Quellenvielfalt (0–10, 5 P je Zusatzquelle)   → 0–100
```

Risiko/Chance: Mehrheitsvotum der Artikel-Analysen (`ai_opportunity`), Kategorie als Tie-Breaker; der Interpretations-Layer darf mit Gesamtsicht übersteuern.

## Alert-Regeln (Risk Monitoring, bewusst OHNE KI-Entscheidung — reproduzierbar)

| Level | Regel |
|---|---|
| **critical** | (recht ∨ steuern) ∧ urgency=hoch ∧ impact=high — oder score ≥ 85 ∧ hoch ∧ high (konto-/geldkritisch) |
| **important** | urgency=hoch ∧ impact ≥ medium · oder impact=high ∧ score ≥ 70 |
| **info** | Chance ∧ impact=high ∧ score ≥ 60 (Opportunity-Hinweis) |

Idempotent (1 Alert je Artikel), `delivered_at IS NULL` = Zustell-Queue für Push (Phase 5).

## Dashboard-Datenstruktur — `GET /api/market-intelligence`

```json
{
  "rising_trends": [{
    "id": "gpsr-produktsicherheit", "topic_name": "Gpsr Produktsicherheit",
    "trend_score": 84, "growth_rate": 886, "mentions_7d": 3, "mentions_30d": 4,
    "source_count": 2, "spike": 1, "risk_or_opportunity": "risiko",
    "summary": "…Marktbewegung + wer betroffen ist + was monetär auf dem Spiel steht…",
    "recommended_action": "Prüfe deine Top-10-ASINs auf GPSR-Konformität und dokumentiere die Nachweise.",
    "item_ids": ["…"], "sparkline": [0,0,1,0,…30 Tageswerte…]
  }],
  "top_risks": [ … ], "opportunities": [ … ],
  "alerts": { "critical": [{ "title", "risk_type", "url", "ai_affected", "delivered_at": null }], "important": [ … ] },
  "meta": { "computed_at": "…", "window": { "short_days": 7, "long_days": 30 }, "topics_total": 12, "spikes": 2 }
}
```

## Skalierung auf > 50.000 Artikel

| Baustein | heute | ab ~50k |
|---|---|---|
| Cluster-Input | alle analysierten Items 30 Tage (Index auf publish_date) — nur das Fenster zählt, Gesamtbestand egal | unverändert |
| Tages-Buckets | JS-Aggregation über Fenster-Items | SQL `date_trunc` + materialisierte Tagesrollups |
| Slug-Merge | Trigram über ~100e Slugs (O(k²), k klein) | Embeddings + pgvector (s. o.) |
| Interpretation | 1 Call für Top-8-Themen je Lauf | unverändert (Kosten skalieren mit Themen, nicht Artikeln) |
| Alerts | Regelwerk über 7-Tage-Fenster, idempotent per PK | unverändert |

## Vorbereitung Predictive Forecasting (Phase 5)

- **`topic_daily`** sammelt ab sofort die Tages-Zeitreihe je Thema — der Trainings-/Eingabedatensatz für Forecasts (z. B. exponentielle Glättung/Holt-Winters als Startpunkt, LLM-gestützte Interpretation der Prognose obendrauf).
- **`alerts.delivered_at`** ist die fertige Push-Queue (Worker: `WHERE delivered_at IS NULL` → zustellen → Zeitstempel setzen).
- **`ai_feedback`** (Phase 3) liefert die Labels, um Trend-Schwellen und Alert-Regeln datengetrieben nachzuschärfen.

