# SellerHub

Statische Web-App (HTML/JS/CSS, kein Server, kein Build-Schritt) — eine E-Commerce-/Amazon-Seller-Suite.
Zum Benutzen `index.html` im Browser öffnen (Doppelklick) — oder den ganzen Ordner hosten.

## Struktur (seit 4.7.2026 gesplittet, vorher Single-File `SellerHub.html`)
```
SellerHub/
├── index.html          ← HTML-Gerüst (alle Seiten/Modals), bindet css/ + js/ ein
├── css/
│   ├── base.css        ← Haupt-Styles (Theme, Layout, Komponenten)
│   └── bildstudio.css  ← Styles des KI-Bildstudios (#p-inhalt)
├── js/                 ← Reihenfolge der <script>-Tags in index.html ist WICHTIG:
│   ├── auth.js         ← WikaAuth (Login/User-Store/Session/Lizenz)
│   ├── bildstudio.js   ← KI-Bildstudio (ig…-Modul, IIFE)
│   ├── admin.js        ← Admin-Bereich (User-Verwaltung)
│   └── app.js          ← die eigentliche App (Data-Layer D, alle Seiten & Module, ~900 KB)
├── CLAUDE.md           ← diese Notiz
├── KONZEPT-Produktrecherche.md
└── backups/            ← alte Stände (inkl. SellerHub.BACKUP-vor-split.html), nicht bearbeiten
```
- Die Blöcke wurden 1:1 an den ursprünglichen `<script>`/`<style>`-Grenzen extrahiert — Lade-Reihenfolge und Positionen im Dokument sind unverändert. Neue Features weiterhin in `js/app.js` (bzw. Seiten-HTML in `index.html`).
- Helles Theme, Schriften DM Sans + Playfair Display (Google-Fonts-Link). Login-Standard-Admin: `wika01` / `wika1303`.
- Code-Bezeichner heißen intern teils `wika`/`Wika` (z. B. `WikaAuth`) — NICHT umbenennen, nur die sichtbare Marke ist „SellerHub".
- ⚠️ App-DATEN hängen am Browser-Speicherpfad: Der Wechsel von `SellerHub.html` auf `index.html` ist ein neuer Pfad → einmalig Daten migrieren via Export (in `backups/SellerHub.BACKUP-vor-split.html` öffnen → ⬇ Export) und Import in `index.html`.

## Backups (im Ordner `backups/`, nicht bearbeiten)
- `SellerHub.BACKUP-keybanner.html` — Stand 28.6.2026 (Key-Banner / Überlast-Fix)
- `SellerHub.BACKUP-bildstudio-prozent.html` — Stand 27.6.2026 abends
- ältere: `-bildstudio`, `-nav`, `.BACKUP`
- **Konvention:** Vor größeren Umbauten neue Kopie `backups/SellerHub.BACKUP-<thema>.html` anlegen.

## Hosting (vorbereitet)
Die App ist rein statisch — es reicht, den Ordnerinhalt ins Web-Root des Hosters zu laden:
1. Hochladen per FTP/Panel: `index.html` + `css/` + `js/` (NICHT nötig: `backups/`, `CLAUDE.md`, `KONZEPT-*.md`, `.claude/`).
2. Domain aufrufen — `index.html` lädt automatisch. Alternativ gratis via GitHub Pages (Repo ist schon auf GitHub) oder Netlify/Vercel.
- Auf einer echten Domain ist `localStorage` an die **Domain** gebunden (stabil), nicht mehr an den Dateipfad wie bei `file://`. Daten von lokal mitnehmen: Export/Import (`sellerhub-data.json`).
- ⚠️ Der eingebaute Login (`WikaAuth`) ist nur clientseitig — kein echter Schutz, da jeder den Quelltext lesen kann. Für einen öffentlichen, geschützten Live-Betrieb später ein Backend nötig.

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

## Offene nächste Schritte (Stand 28.6.2026)
- Hauptbild exakt 1:1 erzwingen; USP-Bilder optional ohne Text (Umschalter).
- Retry-Härtung auf die restlichen ✨-Buttons ausrollen (nutzen noch direktes `igGenText` ohne Retry).
- Gemini-Key live durchtesten.
