# SellerHub — Plattform-Architektur

**Stand:** 4.7.2026 · Gilt für das Backend unter `server/`. Das Frontend ist die statische SellerHub-App im Repo-Root (`index.html` + `js/` + `css/`).

## Leitbild

AI-native Kontrollzentrum für Amazon-Seller im DACH-Raum: Risiken erkennen (**Risk Shield**), Chancen identifizieren (**Opportunity Radar**), Entscheidungen verbessern (**Strategy Engine**) — personalisiert (**Personal Intelligence Feed**) und alarmiert (**Alert System**). Grundprinzipien: **erklärbar statt Blackbox** (jeder Score hat ein „warum"), **Degradations-Pfad** (ohne KI-Key läuft alles deterministisch weiter), **Kostenbremsen by design**.

## Schichten & Service-Grenzen

```
┌─ FRONTEND ─────────────────────────────────────────────────────────────┐
│ SellerHub-App (statisch, Repo-Root) — Dashboard-Widget, Profil lokal   │
└──────────────────────────────┬─────────────────────────────────────────┘
                               │ REST (readonly + Feedback)
┌─ API LAYER ── src/api/ ──────▼─────────────────────────────────────────┐
│ routes.js — CORS, Cache-Header, Tenant-Seam, Profil-Parsing, Endpunkte │
│ Regel: KEINE Geschäftslogik. Nur Validieren, Delegieren, Serialisieren.│
└──────┬─────────────────────────────────────────────────────────────────┘
┌─ SERVICES ── src/services/ ──▼─────────────────────────────────────────┐
│ crawler/       Quellen holen, normalisieren, Keyword-Gate, dedupen     │
│ intelligence/  AI INTELLIGENCE LAYER (Herzstück, s. Registry unten)    │
│ alerts/        Alert-Regelwerk (deterministisch, reproduzierbar)       │
│ feed/          Personalisierung (Profil-Ranking, why[])                │
│ Regel: Services reden NIE direkt miteinander — nur über data/ oder     │
│ die Pipeline-Reihenfolge in intelligence/registry.js.                  │
└──────┬─────────────────────────────────────────────────────────────────┘
┌─ DATA LAYER ── src/data/ ────▼─────────────────────────────────────────┐
│ db.js       Schema (Auto-Migration) + Repositories (einzige SQL-Stelle)│
│ sources.js  Quellen-Katalog (Konfigurationsdaten, kein Code)           │
└──────┬─────────────────────────────────────────────────────────────────┘
┌─ CORE ── src/core/ ──────────▼─────────────────────────────────────────┐
│ config.js (ENV + Schwellen + Lexika) · logger.js · dedupe.js (Text-    │
│ Ähnlichkeit) — kein Domänenwissen, von allen Schichten nutzbar         │
└────────────────────────────────────────────────────────────────────────┘

HINTERGRUNDVERARBEITUNG (src/index.js):
Cron → Crawl → runIntelligencePipeline()  — asynchron, blockiert NIE die API.
Die DB ist die Queue (crash-sicher): ai_analyzed_at IS NULL = offene Arbeit.
```

## Kernmodule → Code-Mapping

| Produktmodul | Implementierung | API |
|---|---|---|
| **Risk Shield** | `services/alerts/rules.js` (Regelwerk) + Risiko-Trends (`risk_or_opportunity='risiko'`) | `/api/alerts`, `top_risks` in `/api/market-intelligence` |
| **Opportunity Radar** | `services/intelligence/` (topics/engine/interpret) — Cluster, Zeitreihen, Spikes | `/api/trends`, `/api/trends/:id/history`, `opportunities` |
| **Strategy Engine** | `services/intelligence/strategy.js` — tägliches Briefing (Lage, Top-3-Prioritäten, Watchlist) | `/api/strategy/brief`, `strategy` in Market Intelligence |
| **Personal Intelligence Feed** | `services/feed/profile.js` — Profil-Ranking mit `why[]`, Profil bleibt client-seitig | `/api/news?…`, `/api/dashboard-feed?…` |
| **Alert System** | `alerts`-Tabelle, `delivered_at IS NULL` = Zustell-Queue (Push in Phase 5) | `critical_alerts` im Dashboard-Feed, `/api/alerts` |

## AI Intelligence Layer — Erweiterungspunkt

`services/intelligence/registry.js` ist die einzige Stelle, die Module kennt und ausführt:

```js
export const AI_MODULES = [
  { id: 'relevance', run: drainQueue,          state: aiState },       // Relevanz/Impact je Artikel
  { id: 'trends',    run: runTrendEngine,      state: trendState },    // Cluster, Zeitreihen, Spikes
  { id: 'alerts',    run: generateAlerts,      state: alertState },    // Risk Shield
  { id: 'strategy',  run: updateStrategyBrief, state: strategyState }, // Tages-Briefing
];
```

Position = Ausführungsreihenfolge; Fehler eines Moduls stoppen die Pipeline nicht. **Neues AI-Modul = 1 Datei + 1 Registry-Zeile** (Checkliste in `CLAUDE.md`). Kandidaten für kommende Module: Forecasting (nutzt `topic_daily`), Push-Dispatcher (nutzt `alerts.delivered_at`), Digest-Mail, Wettbewerber-Beobachtung.

**Verbindliche Modul-Regeln** (machen die Plattform langfristig wartbar):
1. **Asynchron**: Module laufen nur in der Pipeline, nie im Request-Pfad der API.
2. **Degradations-Pfad**: ohne `ANTHROPIC_API_KEY` sinnvoll degradieren (Fallback oder Skip) — kein Feature bricht.
3. **Kostenbremse**: eigene Obergrenze je Lauf (Muster: `AI_MAX_PER_RUN`, 1-Call-Batching, 1×/Tag-Cache).
4. **Erklärbarkeit**: Scores deterministisch und begründet (`why[]`, `reasoning`, Log je Entscheidung).
5. **Idempotenz**: Wiederholter Lauf erzeugt keine Dubletten (PK-Konventionen, `ON CONFLICT`).

## Datenmodell

| Tabelle | Zweck | Owner |
|---|---|---|
| `news_events` | Artikel/Events inkl. Keyword- und KI-Feldern (`ai_*`), Feedback | crawler + intelligence |
| `trend_topics` | Themen-Cluster mit Score/Wachstum/Spike/Empfehlung | intelligence |
| `topic_daily` | Tages-Zeitreihe je Thema (Sparklines heute, Forecasting Phase 5) | intelligence |
| `alerts` | Risk Shield; `delivered_at NULL` = Push-Queue | alerts |
| `strategy_briefs` | 1 Briefing/Tag (Kostenbremse per PK `day`) | intelligence |

Migrationen: idempotent in `data/db.js` (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) — bewusst ohne Migrations-Framework, bis Accounts kommen (dann: node-pg-migrate).

## Multi-Tenancy (definierter Pfad, bewusst noch nicht aktiv)

Heute ist der Datenbestand **öffentlich und geteilt** (kuratierte Marktdaten — es gibt nichts Privates zu trennen); Personalisierung passiert stateless per Profil-Parametern, Profile liegen beim Client (DSGVO-Minimalismus). Der Tenant-Seam existiert bereits: `req.tenantId` (Middleware in `api/routes.js`, heute immer `'public'`).

**Aktivierung bei Accounts (v2), in dieser Reihenfolge:**
1. Auth über Managed Provider (z. B. Clerk/Auth0/Supabase Auth) → JWT → `req.tenantId`.
2. Tenant-Spalten NUR auf Nutzerdaten: `seller_profiles`, `feedback`, gespeicherte Filter, Zustell-Abos. Die Marktdaten (`news_events`, `trend_topics`, …) bleiben global geteilt — das ist der Kostenvorteil des Produkts: 1× crawlen + analysieren, n× verkaufen.
3. Row-Level: `WHERE tenant_id = $1` in den betroffenen Repositories (data/-Schicht ist die einzige SQL-Stelle → ein Ort für die Änderung). RLS in Postgres als zweite Verteidigungslinie.

## Skalierung auf 100.000+ Nutzer

Der entscheidende Punkt: **Last skaliert mit Lesern, Kosten skalieren mit Artikeln** — und Artikel wachsen mit Quellen, nicht mit Nutzern.

| Stufe | Nutzer | Maßnahme |
|---|---|---|
| 1 (heute) | bis ~5k | 1 Prozess (API+Cron), Postgres, `Cache-Control: max-age=300` |
| 2 | ~5–50k | CDN vor die API (öffentliche GETs sind cachebar → Reads praktisch gratis); Worker als 2. Prozess (`npm run crawl` + externer Cron); Read-Replica falls nötig |
| 3 | 50k+ | Personalisierung client-nah cachen (`private, max-age=60` steht schon); Redis für heiße Feeds; DB-Queue → BullMQ/Redis erst bei mehreren Worker-Prozessen (Schnittstelle `drainQueue()` bleibt) |
| Datenwachstum | >50k Artikel | Materialisierte Tagesrollups statt JS-Buckets; Embeddings+pgvector fürs Clustering (Schnittstelle `buildClusters()` bleibt); Batch API für Analysen (−50 %) |

## Environment-Konfiguration

Alles in `src/core/config.js`, dokumentiert in `.env.example`: `DATABASE_URL`, `PORT`, `CRAWL_CRON`, `CRAWL_ON_BOOT`, `SCORE_THRESHOLD`, `MAX_AGE_DAYS`, `ADMIN_KEY`, `ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_MAX_PER_RUN`, `AI_MAX_ATTEMPTS`, `AI_CONCURRENCY`. Konvention: **jede neue Stellschraube kommt mit Default + Kommentar in beide Dateien.**
