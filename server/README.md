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
