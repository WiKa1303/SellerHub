# SellerHub Backend — Hinweise für Claude Code

Node.js/ESM-Backend (Express + PostgreSQL + Claude API) des SellerHub-Kontrollzentrums.
Architektur & Service-Grenzen: **`ARCHITEKTUR.md`** (zuerst lesen bei Strukturfragen). Betrieb/Deploy: `README.md`.

## Kommandos

```bash
npm test              # ALLE Suiten (smoke, ai, trends, strategy) — pg-mem statt Postgres, KI gemockt; braucht nur Internet für die RSS-Feeds
npm run test:ai       # einzelne Suite (analog test:trends, test:strategy)
npm start             # Kombi: API + Worker (braucht DATABASE_URL) · start:api / start:worker = getrennt
npm run crawl         # einmaliger Crawl für externe Scheduler
```

**Vor jedem Commit: `npm test` — alle Suiten müssen grün sein.** Tests brauchen weder Postgres noch API-Key.

## Struktur (Kurzform — Details in ARCHITEKTUR.md)

- `src/core/` ENV/Logger/Text-Utils/LLM-Client (`ai-client.js`) · `src/data/` `schema.js` (DDL) + `repos/` je Domäne (EINZIGE SQL-Stellen), `db.js` = Fassade + Quellen-Katalog
- `src/services/` crawler · intelligence (AI-Layer) · alerts · feed — Services reden nur über data/ miteinander
- `src/api/routes.js` REST (keine Geschäftslogik!; 500er über fail(), nie e.message an Clients) · `src/apps/` api/worker-Einstiege · `src/index.js` Kombi-Boot

## Konventionen (einhalten!)

- **Deutsch** in Kommentaren, Logs, API-Fehlermeldungen; Bezeichner englisch.
- **Degradations-Pfad**: Jedes KI-Feature muss ohne `ANTHROPIC_API_KEY` sinnvoll degradieren (Fallback/Skip) — nie hart abhängen.
- **Kostenbremsen**: neue LLM-Nutzung immer mit Obergrenze (Vorbilder: `AI_MAX_PER_RUN`, 1-Call-Batching in `interpret.js`, 1×/Tag-Cache in `strategy.js`).
- **Claude API**: strukturierte Outputs via `output_config.format` + JSON-Schema (`additionalProperties:false`); Modell aus `config.aiModel`; KEIN `temperature`/`top_p` (auf Opus 4.7+ entfernt → 400); Retries macht das SDK (`maxRetries`).
- **Erklärbarkeit**: Scores deterministisch, jede Bewertung mit Begründung (`why[]`, `reasoning`, Log-Zeile).
- **Idempotenz**: Wiederholte Läufe erzeugen keine Dubletten (`ON CONFLICT`, PK-Konventionen wie `alerts.id = article_id`).
- **pg-mem-Kompatibilität**: kein SQL-Datums-Arithmetik (`interval`), Datumsgrenzen als Parameter aus JS übergeben; nur einfache SQL-Features nutzen.
- Tests: eigenes `test/<thema>.test.js` im vorhandenen Stil (t()-Helfer, pg-mem, `aiClient(mock)`-Override), in `package.json` scripts.test einhängen.

## Checkliste: Neues AI-Modul

1. `src/services/intelligence/<modul>.js`: exportiert `async run()`-Funktion + `<modul>State`-Objekt (für /api/health).
2. Regeln aus ARCHITEKTUR.md → „Verbindliche Modul-Regeln" (async, Degradation, Kostenbremse, Erklärbarkeit, Idempotenz).
3. In `registry.js` registrieren — **Position = Ausführungsreihenfolge** (nach den Daten, die das Modul braucht).
4. Neue Tabellen/Spalten idempotent in `data/schema.js` (`IF NOT EXISTS`); Queries in `data/repos/<domäne>.js`, Re-Export in `data/db.js` ergänzen.
5. Endpunkte in `api/routes.js` (nur delegieren), Widget-Anbindung optional in `../js/app.js` (`radarWidgetHtml`).
6. Tests + README-Abschnitt.

## Checkliste: Neue Quelle

1. RSS-URL real verifizieren (`curl -sL <url> | head -c 300` → `<rss`/`<feed`).
2. Eintrag in `data/sources.js` mit `weight` (0.5–3.0 = FBA-Nähe/Vertrauen) und `region`.
3. HTML-Quellen: `type:'html'` + Selektor-Parser in `services/crawler/` ergänzen (noch nicht gebaut — erster Umsetzer definiert das Muster, `selector_json` ist im Konzept vorgesehen).
4. `npm test` — der Smoke-Test crawlt live und zeigt die Quelle in der Statistik.

## Häufige Fallen

- `services/alerts/rules.js` heißt bewusst nicht „alerts.js" (Namenskollision mit Ordner).
- Stoppwortliste in `normalize.js` arbeitet NACH Umlaut-Ersetzung („fuer", nicht „für").
- `/api/health`-Format: Module unter `modules.<id>` (aus der Registry) — Tests hängen daran.
- Frontend-Widget cached Antworten in `localStorage.wika_radar_cache` — bei API-Format-Änderungen an alte Caches denken (defensiv rendern).
