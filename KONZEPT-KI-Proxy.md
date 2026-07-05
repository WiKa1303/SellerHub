# Konzept: KI-Proxy im Backend (Modul 2)

Stand 5.7.2026 · Ziel: Gemini-Aufrufe des Bildstudios laufen über das Railway-Backend —
der API-Key verlässt nie mehr den Server. Nutzt die Konten aus Modul 1 (Bearer-Auth)
und ist die Basis für ein späteres Credit-/Bezahlmodell.

## Leitplanken

1. **Kein Bruch:** Ohne Cloud-Konto oder ohne Server-Key funktioniert alles exakt wie
   heute (eigener Key im Browser → direkt; sonst Pollinations). Der Proxy ist die
   NEUE ERSTE Stufe der Kette, kein Ersatz.
2. **Kostenbremsen sind Pflicht** (Radar-Konvention): Tageslimits je Nutzer, ehrliche
   429-Fehler, Sichtbarkeit in /internal.
3. Konventionen aus server/CLAUDE.md gelten (Deutsch, Degradation, pg-mem, keine neuen Deps).

## API (Bearer-Auth aus Modul 1 zwingend)

- `POST /api/ai/text` `{prompt}` → Gemini `gemini-2.5-flash:generateContent` →
  `{text}`. Fehlerbilder: 401 (kein/ungültiger Token), 503 (GEMINI_API_KEY fehlt →
  Client fällt zurück), 429 (Tageslimit), 502 (Upstream-Fehler, Meldung durchgereicht ohne Key-Leak).
- `POST /api/ai/image` `{parts, generationConfig?}` → Gemini
  `gemini-2.5-flash-image:generateContent` (responseModalities IMAGE) →
  `{mimeType, dataBase64}`. Body-Limit 25 MB (Produktfotos inline), Upstream-Timeout 90 s.
  parts wird 1:1 durchgereicht (Format ist Gemini-Vertrag des Bildstudios), aber
  validiert: Array, nur text/inlineData-Felder, Gesamtgröße geprüft.
- ENV: `GEMINI_API_KEY` (leer = Proxy antwortet 503, bewusster Degradations-Pfad),
  `AI_PROXY_TEXT_PER_DAY` (Default 200), `AI_PROXY_IMAGE_PER_DAY` (Default 60).

## Kontingente & Telemetrie

- Tabelle `ai_usage` (user_id, day date, text_calls int, image_calls int; PK user_id+day),
  idempotentes Increment per ON CONFLICT UPDATE. Limit VOR dem Upstream-Call prüfen.
- Antwort-Header `X-Quota-Remaining` bei jedem Call; 429 nennt das Limit und „morgen wieder".
- /internal: Sektion „KI-Proxy" (heutige Nutzung je Nutzer, Limits, Key konfiguriert ja/nein).
- Log je Call (Dauer, Nutzer-ID gekürzt, Typ, ok/Fehler) — fail-soft.

## Frontend (js/bildstudio.js)

Neue Aufruf-Kette, an BEIDEN Stellen (igGenText + Bild-Generierung):
1. **Cloud-Proxy**, wenn `localStorage.sy_token` vorhanden: fetch `syApi()`-Basis
   (localStorage `wika_radar_api` || Railway-URL) + Bearer. Bei 401/429/502/503 →
   still weiter zu Stufe 2 (Konsolen-Log, bei 429 zusätzlich Toast mit Kontingent-Hinweis).
2. **Eigener Key** (wie bisher): direkter Gemini-Call.
3. **Pollinations** (wie bisher, nur Text bzw. Bild-Fallback).
Key-Hinweis-UI im Bildstudio anpassen: „Mit Cloud-Konto läuft die KI über SellerHub —
eigener Key optional."

## Nicht in v1

- Credits/Abrechnung (nur Tageslimits), Streaming, Anthropic-Modelle im Proxy
  (Radar nutzt Anthropic serverseitig bereits getrennt), Admin-UI für Limits.
