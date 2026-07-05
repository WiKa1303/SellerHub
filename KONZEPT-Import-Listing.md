# Konzept: Amazon-Import + KI-Listing-Generator (Modul 3)

Stand 6.7.2026 (nachts) · Ziel: (A) Zuverlässiger Amazon-Produktimport über das eigene
Backend (ersetzt die wacklige clientseitige CORS-Proxy-Kette als erste Stufe) und
(B) ein KI-Listing-Generator im bestehenden Listing-Editor. Baut auf Modul 1 (Bearer)
und Modul 2 (KI-Kette) auf.

## Teil A — Backend: Amazon-Import

### `POST /api/import/amazon` (Bearer-Pflicht)
Body `{urlOrAsin, marketplace?='de'}` → ASIN aus /dp/…, /gp/product/…, oder roher
10-Zeichen-ASIN. Antwort:
`{asin, marketplace, title, bullets[], description, brand, images[] (URLs, hiRes zuerst), price, fetchedAt, cached}`

- **Server-Fetch** der Produktseite (amazon.de/dp/ASIN) mit realistischen Browser-Headern
  (User-Agent Desktop-Chrome, Accept-Language de-DE), Timeout 20 s.
- **Parser tolerant** (Regex/String, keine neuen Deps): `#productTitle`,
  `#feature-bullets` li, Bilder aus dem `colorImages`/`'hiRes'`-JSON-Block bzw.
  `landingImage`-data-a-dynamic-image, Marke (`#bylineInfo`), Preis best-effort.
  Fehlende Felder = leer, KEIN Abbruch, solange Titel gefunden.
- **Bot-Block erkannt** (Captcha-Marker/HTTP 503) → **502** mit ehrlicher Meldung
  („Amazon blockiert gerade automatisierte Abrufe — gleich erneut versuchen");
  der Client fällt dann auf seine alte Proxy-Kette zurück.
- **Cache**: Tabelle `import_cache` (asin+marketplace PK, data jsonb, fetched_at);
  Treffer < 24 h → aus Cache (`cached:true`), zählt NICHT gegen das Limit.
- **Tageslimit**: 20 Frisch-Importe/Nutzer/Tag — Spalte `import_calls` additiv in
  `ai_usage` (gleiches Muster/Repo wie Modul 2), 429 analog.

### `GET /api/import/amazon-image?url=…` (Bearer-Pflicht)
Bild-Durchreiche für canvas-taint-freie Bytes im Bildstudio. NUR Whitelist-Hosts
(`m.media-amazon.com`, `images-eu.ssl-images-amazon.com`, `images-na.ssl-images-amazon.com`),
max. 8 MB, Content-Type durchgereicht, `Cache-Control: private, max-age=3600`.
Fremder Host → 403. Zählt nicht gegen Limits.

## Teil B — Frontend

### B1: Bildstudio-Schnellimport (js/bildstudio.js)
Neue Stufe 0 der Import-Kette: `sy_token` vorhanden → Backend-Endpoint; Erfolg →
Felder/Bilder füllen wie bisher (Bilder über den Bild-Proxy laden). 401/429/502/503 →
bestehende Kette (jina.ai → CORS-Proxys) unverändert als Fallback.

### B2: KI-Listing-Generator (im Listing-Editor `p-listing`, js/app.js)
Neuer Abschnitt „🤖 KI-Generator" oben im Editor:
- **Eingaben**: Produktname, Produktinfos/USPs (Textarea), Ziel-Keywords (optional),
  Tonalität (sachlich/verkaufsstark) — plus Button „Von Amazon importieren"
  (gleicher Backend-Endpoint, füllt die Eingaben).
- **Generieren** über die vorhandene KI-Kette (`window.igGenText`: Cloud-Proxy →
  eigener Key → Pollinations). EIN gebatchter Prompt erzeugt als JSON:
  `titel` (≤200 Zeichen), `bullets` (genau 5, je ≤200), `beschreibung`
  (2–4 Absätze, kein HTML), `suchbegriffe` (Backend-Keywords, ≤249 Bytes,
  ohne Titel-/Bullet-Dubletten, kleingeschrieben). Amazon-DE-Regeln im Prompt
  (keine Werbephrasen wie „Bestseller", keine Emojis im Titel, Ziffern statt Zahlwörter).
- **Ergebnis**: editierbare Felder mit Zeichen-/Byte-Zählern (rot bei Überschreitung),
  je Feld „Kopieren"-Button, „In Editor übernehmen" (bestehenden Listing-Editor füllen).
- **Speichern**: `D.listings` (neues Array im Data-Layer, `save()`) — synct via Modul 1.

## Nicht in v1
Andere Marktplätze im Import (nur amazon.de), A+-Module, Bildschirmfotos der
Konkurrenz, automatische Keyword-Recherche (eigenes Modul später).
