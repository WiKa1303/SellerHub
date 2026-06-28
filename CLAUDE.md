# SellerHub

Single-File-Web-App (HTML/JS/CSS, kein Server, kein Build) — eine E-Commerce-/Amazon-Seller-Suite.
Zum Benutzen einfach `SellerHub.html` im Browser öffnen (Doppelklick).

## Wichtigste Datei
- **`SellerHub.html`** ← das ist die maßgebliche, aktive Datei. Alle Änderungen hier hinein.
- Helles Theme, Schriften DM Sans + Playfair Display. Login-Standard-Admin: `wika01` / `wika1303`.
- Code-Bezeichner heißen intern teils `wika`/`Wika` (z. B. `WikaAuth`) — NICHT umbenennen, nur die sichtbare Marke ist „SellerHub".

## Ordnerstruktur
```
SellerHub/
├── SellerHub.html      ← die komplette App (self-contained: HTML+CSS+JS in EINER Datei)
├── CLAUDE.md           ← diese Notiz
└── backups/            ← alte Stände, nicht bearbeiten
```
Es gibt KEINE separaten .css/.js/Bild-Dateien — alles ist in `SellerHub.html` eingebettet (Single-File-App).

## Backups (im Ordner `backups/`, nicht bearbeiten)
- `SellerHub.BACKUP-keybanner.html` — Stand 28.6.2026 (Key-Banner / Überlast-Fix)
- `SellerHub.BACKUP-bildstudio-prozent.html` — Stand 27.6.2026 abends
- ältere: `-bildstudio`, `-nav`, `.BACKUP`
- **Konvention:** Vor größeren Umbauten neue Kopie `backups/SellerHub.BACKUP-<thema>.html` anlegen.

## Hosting (später, eigene Domain)
Da alles in einer Datei steckt, ist Hosting denkbar einfach:
1. `SellerHub.html` zu `index.html` umbenennen (dann lädt die Domain-Startseite automatisch).
2. Diese eine Datei per FTP / Hosting-Panel ins Web-Root des Hosters hochladen — fertig.
- Auf einer echten Domain ist `localStorage` an die **Domain** gebunden (stabil), nicht mehr an den Dateipfad wie bei `file://`.
- ⚠️ Der eingebaute Login (`WikaAuth`) ist nur clientseitig — kein echter Schutz, da jeder den Quelltext lesen kann. Für einen öffentlichen, geschützten Live-Betrieb später ein Backend nötig.

## Aufbau (Kurz)
- Seiten = `<div class="page" id="p-NAME">`, Wechsel über `go('name')`; Sidebar-Navigation als Accordion.
- Wichtigstes Modul: **KI-Bildstudio** (`id="p-inhalt"`, Bezeichner-Präfix `ig…`) — erzeugt Amazon-Marketing-Visuals aus Produktfotos. Text-KI: Gemini `gemini-2.5-flash` mit eigenem Key (localStorage `gemini_key`), sonst kostenloser Pollinations-Fallback. Bild-KI: Gemini Nano Banana `gemini-2.5-flash-image`.

## Wichtiger Hinweis zur Mitnahme zwischen Rechnern
Die App speichert Login + eingegebene Daten im Browser **gebunden an den Dateipfad** (`file://`).
Auf einem neuen Rechner ist die App daher zunächst „leer" (neuer Login nötig).
Echte Daten mitnehmen: in der App **Export** (`sellerhub-data.json`) → auf dem anderen Rechner **Import**.
Der Code/Design (diese HTML-Datei) synchronisiert über iCloud jedoch sauber.

## Offene nächste Schritte (Stand 28.6.2026)
- Hauptbild exakt 1:1 erzwingen; USP-Bilder optional ohne Text (Umschalter).
- Retry-Härtung auf die restlichen ✨-Buttons ausrollen (nutzen noch direktes `igGenText` ohne Retry).
- Gemini-Key live durchtesten.
