# SellerHub

Statische Web-App (HTML/JS/CSS, kein Server, kein Build-Schritt) — eine E-Commerce-/Amazon-Seller-Suite.
Zum Benutzen `index.html` im Browser öffnen (Doppelklick) — oder den ganzen Ordner hosten.

## Struktur (seit 4.7.2026 gesplittet, vorher Single-File `SellerHub.html`)
```
amzsellerhub/
├── index.html          ← HTML-Gerüst (alle Seiten/Modals), bindet css/ + js/ ein
├── css/
│   ├── base.css        ← Haupt-Styles (Theme, Layout, Komponenten)
│   ├── todo.css        ← Styles des To-Do-Moduls (#p-todo)
│   └── bildstudio.css  ← Styles des KI-Bildstudios (#p-inhalt)
├── js/                 ← Reihenfolge der <script>-Tags in index.html ist WICHTIG:
│   ├── auth.js         ← Cloud-Login-Gate (gegen /api/auth, WikaAuth = Kompat-Schicht)
│   ├── bildstudio.js   ← KI-Bildstudio (ig…-Modul, IIFE)
│   ├── admin.js        ← Admin-Bereich (User-Verwaltung)
│   ├── todo.js         ← To-Do-Modul inkl. Google-Kalender-Sync + Pflichten-Kalender (IIFE, window.td)
│   ├── app.js          ← die eigentliche App (Data-Layer D, alle Seiten & Module, ~1 MB)
│   ├── ppc.js          ← PPC-Cockpit (Keyword-Center-Tabs Planer/Audit + Cerebro-Paste)
│   ├── cashflow.js     ← Cashflow-Planer (Seite p-cashflow)
│   ├── erstattung.js   ← FBA-Erstattungs-Check (Seite p-erstattung)
│   └── sync.js         ← Cloud-Sync (wrappt save(); MUSS als letztes laden)
├── server/             ← Seller-Radar-Backend (Crawler + KI + Trends + Alerts + Strategy)
│                          eigene Doku: server/ARCHITEKTUR.md + server/CLAUDE.md + server/README.md
├── CLAUDE.md           ← diese Notiz
├── KONZEPT-Produktrecherche.md
└── backups/            ← alte Stände (inkl. SellerHub.BACKUP-vor-split.html), nicht bearbeiten
```
- Die Blöcke wurden 1:1 an den ursprünglichen `<script>`/`<style>`-Grenzen extrahiert — Lade-Reihenfolge und Positionen im Dokument sind unverändert. Neue Features weiterhin in `js/app.js` (bzw. Seiten-HTML in `index.html`).
- Helles Theme, Schriften DM Sans + Playfair Display (Google-Fonts-Link).
- **Login = Cloud-Konto** (seit 6.7.2026, Modul 4): Das Gate in `js/auth.js` authentifiziert gegen das Radar-Backend (`/api/auth/login`, gleiche Konten wie der Cloud-Sync `sy_token`/`sy_user`). Registrierung braucht den `REGISTRATION_CODE` (Railway-Var). Offline-Pfad: war das Gerät schon mal angemeldet, gibt es bei Server-Ausfall „Offline weiterarbeiten". Der alte lokale WikaAuth-Store (`wika_users_v1`, wika01/wika1303) ist abgelöst; `window.WikaAuth` existiert nur noch als Kompatibilitäts-Schicht für admin.js/app.js.
- Code-Bezeichner heißen intern teils `wika`/`Wika` (z. B. `WikaAuth`) — NICHT umbenennen, nur die sichtbare Marke ist „SellerHub".
- ⚠️ App-DATEN hängen am Browser-Speicherpfad: Der Wechsel von `SellerHub.html` auf `index.html` ist ein neuer Pfad → einmalig Daten migrieren via Export (in `backups/SellerHub.BACKUP-vor-split.html` öffnen → ⬇ Export) und Import in `index.html`.

## Backups
Alte Datei-Backups sind ABGESCHAFFT — jede Version steckt in der Git-Historie (`git log --oneline`).
Wiederherstellen alter Einzeldateien: `git show <commit>:backups/<datei>` (Ordner wurde 7.7.2026 aus dem Arbeitsstand entfernt).


## Lokale Vorschau (solange die Domain hängt)
`./start-lokal.sh` (oder `node lokaler-server.mjs`) → http://localhost:5173/ = Marketing-Website (`website/`), http://localhost:5173/app/ = die App. Bildet das Ziel-Layout der Domain ab; Cloud-Login/Sync laufen ganz normal gegen Railway.

## Hosting (vorbereitet — Ziel: amzsellerhub.de auf netcup-Webspace)
Die App ist rein statisch. Upload-Skript: **`./deploy-frontend.sh`** (rsync, lädt nur index.html + css/ + js/; Zugangsdaten aus netcup CCP → Webhosting als `WEBSPACE_HOST`/`WEBSPACE_USER`).
Das Backend (Seller-Radar) läuft separat auf Railway: https://radar-production-388a.up.railway.app (Custom Domain api.amzsellerhub.de eingerichtet, wartet auf DENIC-Delegation). CORS ist offen, Standard-API-URL steht in js/app.js (`RADAR_API_DEFAULT`).
- Auf einer echten Domain ist `localStorage` an die **Domain** gebunden (stabil), nicht mehr an den Dateipfad wie bei `file://`. Daten von lokal mitnehmen: Export/Import (`sellerhub-data.json`).
- Der Login läuft seit Modul 4 gegen das Backend (echte Konten, scrypt + Sessions). Die App-DATEN liegen weiterhin im localStorage des Browsers — das Gate schützt den Zugang, nicht die lokalen Daten.

## Aufbau (Kurz)
- Seiten = `<div class="page" id="p-NAME">`, Wechsel über `go('name')`; Sidebar-Navigation als Accordion.
- Wichtigstes Modul: **KI-Bildstudio** (`id="p-inhalt"`, Bezeichner-Präfix `ig…`) — erzeugt Amazon-Marketing-Visuals aus Produktfotos. Text-KI: Gemini `gemini-2.5-flash` mit eigenem Key (localStorage `gemini_key`), sonst kostenloser Pollinations-Fallback. Bild-KI: Gemini Nano Banana `gemini-2.5-flash-image`.

## Versionierung & Sync zwischen Rechnern (Git + GitHub)
Dieses Projekt ist ein Git-Repo mit privatem GitHub-Remote: **`WiKa1303/SellerHub`** (https://github.com/WiKa1303/SellerHub).
Code/Design wird über GitHub zwischen MacBook und Mac Studio synchronisiert.
- **Vor dem Arbeiten:** `git pull`
- **Nach dem Arbeiten:** `git add -A && git commit -m "…" && git push`
- Dadurch keine manuellen `backups/`-Kopien mehr nötig — jede Version steckt in der Git-Historie (`git log --oneline`).
- ⚠️ Nicht gleichzeitig auf beiden Macs committen, ohne vorher zu pullen/pushen (iCloud + Git-Konflikte vermeiden).

### Automatischer Sync über Claude-Code-Hooks (`.claude/settings.json`)
Beim Arbeiten mit Claude Code im Terminal läuft der Sync automatisch:
- **SessionStart-Hook:** beim Sitzungsstart automatisch `git pull` (neuester Stand).
- **SessionEnd-Hook:** beim Sitzungsende automatisch `git add -A` + `git commit` (nur bei Änderungen, mit Zeitstempel) + `git push`.
- Die Hooks sind ins Repo committet → gelten auf MacBook und Mac Studio.
- Voraussetzung Push: `gh` CLI eingerichtet (auf MacBook erledigt; auf Mac Studio ggf. einmalig `gh auth login` + `gh auth setup-git`).
- Hooks ansehen/abschalten: im Terminal `/hooks`. Automatische End-Commits sichern auch unfertige Stände — für saubere Historie zwischendrin selbst committen.

## Wichtiger Hinweis zu den App-DATEN (nicht Code)
Die App speichert Login + eingegebene Daten im Browser **gebunden an den Dateipfad** (`file://`).
Auf einem neuen Rechner ist die App daher zunächst „leer" (neuer Login nötig). Git/GitHub synct nur den **Code**, nicht die Browser-Daten.
Echte Daten mitnehmen: in der App **Export** (`sellerhub-data.json`) → auf dem anderen Rechner **Import**.

## Offene nächste Schritte (Stand 7.7.2026)
Die Bildstudio-Punkte vom 28.6. sind ERLEDIGT (1:1-Crop `igCropSquare`, USP-ohne-Text-Umschalter, Retry via `igGenTextSafe` überall; Text/Bild laufen über den KI-Proxy des Backends). Offen:
- Gemini-Key mit Billing einmal live durchtesten (Bild-zu-Bild; braucht echten Key im Browser).
- Webspace-Deploy des aktuellen Frontends, sobald die Domain steht (`./deploy-frontend.sh`).
- Website-Impressum: Platzhalter (§ 5 DDG) mit echten Angaben füllen — Pflicht vor Live-Gang.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
