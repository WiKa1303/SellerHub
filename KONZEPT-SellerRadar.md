# KONZEPT: Seller-Radar — News & Events für Amazon FBA Seller (DACH)

**Stand:** 4.7.2026 · **Status:** Phase 1 (Konzept + Architektur, kein Code)
**Problem aus Seller-Sicht:** Wichtige Infos (Amazon-Gebührenänderungen, GPSR/VerpackG-Fristen, Policy-Updates, Events) sind über Dutzende Blogs, Newsletter und Foren verstreut. Wer sie verpasst, zahlt drauf — wer alles liest, verliert 2 h/Tag.
**Versprechen:** *5 Minuten beim Login statt 2 Stunden Blogs.* Nur Relevantes, immer mit Datum, immer mit Quelle.

---

## 1. Systemarchitektur

### 1.1 Überblick (eine Pipeline, drei Bausteine)

```
   QUELLEN                 CRAWLER-WORKER (Cron)              API              CLIENT
┌─────────────┐   ┌──────────────────────────────────┐   ┌──────────┐   ┌──────────────┐
│ RSS/Atom     │──▶│ 1. Fetch  (ETag/Last-Modified)   │   │ GET /feed │──▶│ SellerHub    │
│ HTML-Seiten  │──▶│ 2. Parse → Normalisieren         │──▶│ GET /top  │   │  Dashboard-  │
│ ICS-Kalender │──▶│ 3. Dedupe → Klassifizieren       │   │ GET /events│  │  Widget +    │
│ (Events)     │   │ 4. Score → Speichern             │   │ (readonly)│   │  Radar-Seite │
└─────────────┘   └──────────────────────────────────┘   └──────────┘   └──────────────┘
                              │
                              ▼
                        SQLite/Postgres
                        (items, sources)
```

Ein Repo, ein Deploy: Worker und API sind **ein** Node-Prozess (der Worker ist ein Cron-Job im selben Service). Kein Microservice-Theater — bei diesem Datenvolumen (< 200 neue Items/Tag) wäre alles andere Overhead.

### 1.2 Crawler-Logik (3 Quellen-Stufen, bewusst in dieser Reihenfolge)

| Stufe | Technik | Aufwand | Abdeckung |
|---|---|---|---|
| **1. RSS/Atom** | XML parsen, fertig | minimal | ~80 % der News-Quellen |
| **2. HTML-Scraper** | pro Quelle ein CSS-Selektor-Set (Titel/Link/Datum) | mittel | Quellen ohne Feed (z. B. Amazon Seller Central Ankündigungen) |
| **3. Event-Quellen** | HTML + ICS-Kalender, Datum/Ort-Extraktion | mittel | Konferenzen, Messen, Stammtische |

Ablauf pro Lauf (News alle 60 min, Events 1×/Tag):
1. **Fetch:** Conditional GET mit `ETag`/`Last-Modified` (spart 90 % Traffic, höflich gegenüber Quellen). Eigener User-Agent `SellerHub-Radar/1.0 (+kontakt-url)`, robots.txt wird respektiert.
2. **Parse & Normalisieren:** einheitliches Item-Format (siehe 1.3). Datum aus Feed; Fallback HTML-Meta `article:published_time`; sonst `fetched_at` + Flag `date_uncertain`.
3. **Dedupe** (siehe 2.3), **Klassifizieren + Scoren** (siehe 2.2).
4. **Speichern**, Publish passiert implizit (API liest DB).
5. **Nightly-Job:** News > 30 Tage archivieren, Events nach Enddatum ausblenden, verwaiste Dubletten aufräumen.

Kein Headless-Browser in v1. Erst wenn eine unverzichtbare Quelle JS-gerendert ist, kommt ein isolierter Playwright-Worker dazu — das ist eine bewusste Kostenbremse.

**Optionaler KI-Veredelungs-Schritt (v1.5):** LLM fasst lange Artikel in 2 Sätze „Was heißt das für FBA-Seller?" zusammen und prüft die Keyword-Klassifikation. Läuft als Batch nach dem Crawl, Ausfall unkritisch (Rohdaten funktionieren ohne).

### 1.3 Datenbankstruktur (2 Tabellen reichen für v1)

```sql
sources (
  id            TEXT PRIMARY KEY,      -- 'wortfilter'
  name          TEXT,                  -- 'Wortfilter.de'
  url           TEXT,                  -- Feed-/Seiten-URL
  type          TEXT,                  -- 'rss' | 'html' | 'ics'
  kind_hint     TEXT,                  -- 'news' | 'event'
  region        TEXT,                  -- 'DE' | 'AT' | 'CH' | 'DACH'
  weight        REAL,                  -- 0.5–3.0 Quellen-Gewicht (siehe 2.2)
  selector_json TEXT,                  -- nur für type='html': CSS-Selektoren
  etag          TEXT, last_modified TEXT, last_fetched_at TEXT,
  active        INTEGER DEFAULT 1,
  fail_count    INTEGER DEFAULT 0      -- 3 Fehl-Läufe in Folge → Alarm, nicht löschen
)

items (
  id             TEXT PRIMARY KEY,     -- hash(canonical_url)
  source_id      TEXT REFERENCES sources,
  canonical_url  TEXT UNIQUE,          -- URL ohne UTM/Tracking-Parameter
  title          TEXT,
  summary        TEXT,                 -- max. 300 Zeichen (Leistungsschutzrecht! s. 5)
  kind           TEXT,                 -- 'news' | 'event'
  categories     TEXT,                 -- JSON-Array: ['recht','amazon',…]
  region         TEXT,
  published_at   TEXT, fetched_at TEXT,
  date_uncertain INTEGER DEFAULT 0,
  relevance      REAL,                 -- 0–100 (siehe 2.2)
  dup_of         TEXT NULL,            -- Verweis auf Primär-Item bei Dublette
  title_norm     TEXT,                 -- normalisierter Titel für Dedupe-Index
  -- nur für kind='event':
  event_start    TEXT NULL, event_end TEXT NULL,
  event_city     TEXT NULL, event_country TEXT NULL, event_online INTEGER NULL
)
```

Eine Tabelle für News **und** Events (Events = 5 Zusatzfelder) — getrennte Tabellen lohnen erst, wenn Events eigene Workflows bekommen (Anmeldungen, Erinnerungen). `user_prefs` (gespeicherte Filter) kommt in v2 mit Nutzer-Accounts.

### 1.4 API-Endpunkte (REST, readonly, minimal)

| Endpunkt | Zweck |
|---|---|
| `GET /api/feed?kind=news&cat=recht&region=DE&since=…&limit=20` | Hauptfeed mit allen späteren Filtern — die Filter-Parameter sind ab Tag 1 da, das UI legt nur Chips darüber |
| `GET /api/top?limit=6` | **Login-Widget:** fertig priorisierte Mischung (Priorisierungslogik serverseitig, siehe 3.3) |
| `GET /api/events/upcoming?days=90&region=DACH` | kommende Events, sortiert nach Startdatum |
| `GET /api/sources` | Transparenz: welche Quellen werden gescannt (Vertrauen = Feature) |
| `GET /api/health` | Monitoring: letzter Crawl-Lauf, Fehlerzähler je Quelle |
| `POST /api/admin/refresh` (API-Key) | manueller Crawl-Trigger |

Lesend öffentlich + CDN-Cache 5 min (öffentliche Inhalte, keine Personendaten) → Lese-Last skaliert praktisch gratis. Schreiben kann nur der Worker.

### 1.5 Event-Update-Mechanismus

- **News:** Cron alle 60 min (Werktag 6–22 Uhr reicht; nachts 1×) — schneller bringt dem Seller nichts.
- **Events:** 1×/Tag komplett; zusätzlich Feld-Update, wenn sich Datum/Ort eines bekannten Events ändert (Vergleich per `title_norm` + alte vs. neue `event_start`) → Änderung wird als „Terminänderung"-News ausgespielt (echter Mehrwert: verschobene Messe ≠ neue Messe).
- **Client:** Dashboard lädt beim Login `GET /api/top` (< 5 KB); die Radar-Seite pollt nicht — Refresh-Button + Cache-Header genügen in v1. WebSocket/Push erst, wenn es einen Grund gibt (gibt es hier nicht: News sind kein Echtzeit-Problem).

---

## 2. Quellen, Relevanz, Dubletten, Aktualität

### 2.1 Quellen-Typen (v1-Startliste — Feeds am 4.7.2026 real verifiziert ✅)

| Typ | Quelle | Warum |
|---|---|---|
| Amazon/Marktplatz-News | ✅ Wortfilter.de (RSS) | wichtigste DE-Quelle für Marktplatz-Händler, Gewicht 3.0 |
| Amazon offiziell | ✅ AboutAmazon.de (RSS) | Primärquelle für Amazon-Ankündigungen, Gewicht 2.5 |
| E-Commerce-Praxis | ✅ shopanbieter.de (RSS) | Händler-Praxis, Gewicht 2.0 |
| E-Commerce-Analyse | ✅ Exciting Commerce (RSS) | Marktentwicklung, Gewicht 1.5 |
| Tech/E-Comm breit | ✅ t3n (RSS) | breit → nur mit Keyword-Filter, Gewicht 1.0 |
| Recht | IT-Recht Kanzlei / Händlerbund / Trusted-Shops-Blog (HTML-Scraper nötig — Feeds nicht öffentlich, Stufe 2) | Abmahnungen, GPSR, VerpackG — höchste Praxis-Relevanz, Gewicht 3.0 |
| Seller Central | Amazon-Seller-Ankündigungen (HTML, Stufe 2) | Gebühren/Policy direkt an der Quelle |
| Events | merchantday, K5, AMZ-Events, dmexco, OMR, Meetup-Suche „Amazon FBA" (HTML/ICS, Stufe 3) | Konferenzen + Stammtische DACH |

Quellen sind **Konfigurationsdaten** (Tabelle `sources`), kein Code — neue Quelle = ein INSERT (+ ggf. Selektor-JSON). Ausfall-Handling: `fail_count` ≥ 3 → Admin-Hinweis, Quelle bleibt sichtbar als „zuletzt aktualisiert vor X Tagen".

### 2.2 Relevanz-Bewertung (deterministisch, erklärbar — kein Blackbox-Score)

```
relevance = source_weight × 10        (0–30)   Wer meldet es?
          + keyword_score             (0–40)   Was steht drin?
          + recency_score             (0–20)   Wie frisch?
          + impact_boost              (0–10)   Muss ich handeln?
```

- **keyword_score:** gewichtetes FBA-Lexikon in 3 Stufen — *hoch* (Gebühren, GPSR, VerpackG, OSS, Umsatzsteuer, Sperrung, Abmahnung, Produktsicherheit, Rate Card): 15 P/Treffer · *mittel* (FBA, Buy Box, Listing, Rezensionen, PPC, Prime): 8 P · *Kontext* (Amazon, Marktplatz, E-Commerce, Händler): 3 P. Gedeckelt bei 40.
- **recency_score:** exponentieller Abfall, Halbwertszeit 72 h (News). Events: statt Recency zählt Nähe zum Startdatum (≤ 30 Tage = 20 P).
- **impact_boost:** +10 wenn Fristen-/Pflicht-Muster erkannt („ab dem", „Frist", „Pflicht", „müssen bis") — das sind die Meldungen, deren Verpassen Geld kostet.
- Anzeige-Schwelle: relevance < 25 wird gar nicht erst ausgespielt (Rauschfilter). Der Score wird dem Nutzer als „Warum sehe ich das?"-Tooltip erklärt — gleiche Ehrlichkeits-Philosophie wie die Daten-Konfidenz im Scorecard.

### 2.3 Dubletten-Vermeidung (2 Ebenen, in dieser Reihenfolge)

1. **Exakt:** URL-Kanonisierung (Tracking-Parameter raus, Trailing-Slash, http→https) → `canonical_url UNIQUE`. Fängt Re-Crawls und Feed-Wiederholungen.
2. **Semantisch:** `title_norm` (lowercase, Stoppwörter raus, Umlaute normalisiert) → Trigram-Ähnlichkeit > 0,85 gegen Items der letzten 7 Tage ⇒ Dublette. Das Item der **gewichtigeren Quelle** bleibt Primär, die anderen bekommen `dup_of` (bleiben als „auch berichtet von …" abrufbar — Mehrfach-Berichterstattung ist selbst ein Relevanz-Signal: +5 auf Primär-Item).
3. **Events:** Schlüssel = `title_norm + event_start` (dieselbe Messe von 3 Seiten angekündigt = 1 Event).

### 2.4 Aktualitäts-Prüfung

- Jedes Item trägt **immer** `published_at` + Quelle; unsichere Daten sind markiert (`date_uncertain` → UI zeigt „ca.").
- News: > 30 Tage = Archiv (per Filter erreichbar, nie im Default-Feed). Events: nach `event_end` automatisch raus.
- „NEU"-Badge < 24 h; Sortierung im Feed = `relevance`, sekundär `published_at`.
- `GET /api/health` überwacht je Quelle den letzten erfolgreichen Lauf — eine stumme Quelle fällt sofort auf statt still zu veralten.

---

## 3. Dashboard „News & Events"

### 3.1 Skizze (beim Login, oberhalb der Produktsuchen)

```
┌─ 📡 Seller-Radar ────────────────────────────────── Alle ansehen → ─┐
│                                                                      │
│  ⚠️ WICHTIG · RECHT                                    vor 2 Std     │
│  GPSR-Übergangsfrist endet: Das müssen FBA-Seller bis 13.12. tun     │
│  IT-Recht Kanzlei · Warum: Frist + Produktsicherheit        [🔥 92]  │
│  ──────────────────────────────────────────────────────────────────  │
│  📰 NEWS                          │  📅 EVENTS (DACH)                │
│  • Amazon senkt Größenklassen-    │  • merchantday 2026              │
│    Gebühr ab 1.9.  (Wortfilter,   │    12.9. · Hannover · Konferenz  │
│    gestern) [78]                  │  • FBA-Stammtisch München        │
│  • Neue USt-Regeln für AT-        │    18.7. · München · Meetup      │
│    Verkäufe  (shopanbieter,       │  • K5 Future Retail              │
│    vor 3 T.) [64]                 │    24.6.27 · Berlin · Messe      │
│  • [+ 2 weitere]                  │                                  │
│                                                                      │
│  Quellen: 8 aktiv · Stand: heute 09:12 · [Filter: Alle ▾]            │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 Was wird angezeigt (pro Item, bewusst wenig)

Kategorie-Chip (farbcodiert: 🔴 Recht · 🟠 Amazon/Gebühren · 🔵 E-Commerce · 🟣 Event) · Titel (Link öffnet Quelle in neuem Tab — wir behalten niemanden gefangen, das schafft Vertrauen) · Quelle · relatives Datum („vor 2 Std") · Relevanz-Flamme mit Erklär-Tooltip. Events zusätzlich: Datum, Ort/Online, Typ. **Kein** Volltext im Widget — Überschrift + 1 Satz reichen für die Entscheidung „lesen oder nicht".

### 3.3 Priorisierungslogik beim Login (serverseitig in `GET /api/top`)

1. Kandidaten: News ≤ 7 Tage mit relevance ≥ 25 + Events ≤ 60 Tage bis Start.
2. **Pflicht-Slot:** höchstes Recht/Fristen-Item mit relevance ≥ 70 wird gepinnt (⚠️-Banner) — genau eines, kein Alarm-Overkill.
3. **Diversität:** max. 2 Items pro Kategorie, max. 2 pro Quelle → der Feed kippt nie in „5× dieselbe Story".
4. News-Spalte: Top 3–4 nach relevance · Events-Spalte: die 3 nächsten nach Startdatum (nicht nach Score — bei Events zählt der Kalender).
5. Client-seitig: bereits Geklicktes wird abgesenkt (Read-Marks in localStorage, v1 ohne Account-Sync).

---

## 4. Tech-Stack-Vorschlag (pragmatisch, EU, günstig)

| Baustein | Wahl v1 | Begründung / Wann wechseln |
|---|---|---|
| **Crawler** | Node.js + TypeScript: `undici` (Fetch), `fast-xml-parser` (RSS), `cheerio` (HTML), `node-cron` | Kein Scrapy/Python-Zweitstack — ein Stack fürs ganze Produkt. Playwright nur falls eine Kernquelle JS braucht (isolierter Job) |
| **Backend/API** | Hono oder Fastify im selben Node-Service | Hono läuft identisch auf VPS **und** Cloudflare Workers → Migrationspfad ohne Rewrite |
| **Datenbank** | SQLite (better-sqlite3) auf dem VPS, tägliches Backup | < 100 k Zeilen/Jahr — Postgres wäre reine Zeremonie. Wechsel auf **managed Postgres (EU)** erst bei Nutzer-Accounts/gespeicherten Filtern (v2); Schema ist kompatibel gehalten |
| **Hosting** | **Hetzner VPS (Falkenstein/Nürnberg, DE)** ~5 €/Monat, Caddy als Reverse-Proxy (Auto-TLS) | DSGVO-Story trivial (DE-Hoster, kein US-Transfer), fixe Kosten. Alternative Cloudflare Workers + D1 + Cron ist noch billiger, aber die Datenschutz-Prüfung ist aufwendiger — für v1 nicht wert |
| **Skalierung** | Stufenplan: **(1)** CDN/Cache-Header auf alle GETs → Lese-Last entkoppelt · **(2)** Worker von API trennen (gleicher Code, 2 Prozesse) · **(3)** Postgres + Redis-Cache bei > ~5 k aktiven Nutzern · **(4)** mehr Quellen = mehr Cron-Zeilen, kein Architektur-Umbau | Die teuerste Ressource ist Crawl-Höflichkeit, nicht Compute — 100 Quellen × 24 Läufe/Tag sind trivial |
| **Monitoring** | `/api/health` + Uptime-Ping (z. B. Hetzner-intern oder UptimeRobot EU) + Fehlerzähler je Quelle | Ein stiller Crawler-Ausfall ist der einzige echte Betriebsrisiko-Fall |

### DSGVO & Recht (von Anfang an mitgedacht)

- **Keine Personendaten** im System: nur öffentliche Artikel-Metadaten. Read-Marks bleiben in v1 im Browser des Nutzers (localStorage).
- **Leistungsschutzrecht/Urheberrecht:** nur Überschrift + max. 300 Zeichen Anriss + Link zur Quelle — niemals Volltexte speichern/anzeigen. (Deshalb ist `summary` in der DB hart begrenzt.)
- **Crawl-Etikette:** robots.txt respektieren, identifizierender User-Agent mit Kontakt, Conditional GETs, max. 1 Request/Quelle/Lauf.
- **Hosting DE** (Hetzner) → kein Drittland-Transfer; AVV mit Hetzner abschließen; Datenschutzerklärung um den Dienst ergänzen.
- LLM-Veredelung (v1.5): nur Artikel-Titel/Anriss an das Modell, nie Nutzerdaten; EU-Endpoint bevorzugen.

---

## 5. Umsetzungs-Fahrplan (Vorschlag)

| Schritt | Inhalt | Ergebnis |
|---|---|---|
| **1.5 (optional, sofort)** | Client-only-Vorstufe in der heutigen statischen App: die 5 verifizierten RSS-Quellen über das vorhandene CORS-Proxy-Muster laden, Scoring/Dedupe/Widget wie oben spezifiziert, Cache in localStorage | Feature ist **diese Woche** im Dashboard erlebbar; Scoring-/Dedupe-Logik wandert später 1:1 in den Worker |
| **2** | Hetzner-VPS + Worker + SQLite + `GET /feed`/`/top` mit der identischen Logik; App stellt von Client-Fetch auf API um (eine URL-Konstante) | Echte Crawler-Basis, Stufe-2-Quellen (Recht, Seller Central) werden möglich |
| **3** | Event-Quellen (Stufe 3), Terminänderungs-Erkennung, Filter-UI komplett (Region, Kategorie, nur Events) | „News & Events" voll ausgebaut |
| **4** | LLM-Zusammenfassungen („Was heißt das für mich?"), Digest-E-Mail, Nutzer-Filter mit Accounts (dann Postgres) | SaaS-fähig |

**Bewusste Nicht-Ziele v1:** kein Volltext-Archiv, keine Echtzeit-Pushes, kein Headless-Browser-Farm-Crawling, keine automatische Quellen-Entdeckung — alles Dinge mit hohem Aufwand und ohne Seller-Mehrwert in Phase 1.
