# SellerHub Marketing-Website

Statische Website (kein Build-Schritt) — Design-System in `css/site.css`, Interaktionen in `js/site.js`.
Marke aus der App übernommen (Orange #d97706, Navy #0f1729, DM Sans + Playfair Display).

## Ziel-Layout auf dem Webspace (amzsellerhub.de)

```
httpdocs/
├── index.html, features.html, …   ← DIESER Ordner (Website = Domain-Root)
├── blog/
└── app/                           ← die App (bisheriges index.html + css/ + js/)
```

- Alle „Jetzt starten"/„Anmelden"-Buttons zeigen auf **`/app/`** (das Cloud-Login-Gate der App).
- localStorage ist an die **Domain** gebunden, nicht an den Pfad → der Umzug der App nach `/app/` verliert keine Daten.
- Basic-Auth auf dem Webspace entfernen, sobald die Website live geht (der Cloud-Login schützt die App).

## Vor Veröffentlichung ausfüllen (Suche nach `TODO` / `[`)

1. **impressum.html** — Name, Anschrift, ggf. USt-IdNr. (Pflicht!)
2. **datenschutz.html** — Verantwortlicher, Speicherdauern, KI-Anbieter, Stand-Datum → rechtlich prüfen lassen
3. **agb.html** — Anbieter, Gerichtsstand, bei Launch Zahlungs-§ → rechtlich prüfen lassen
4. **ueber-uns.html** — Team-Karte(n) mit echtem Namen/Foto
5. **index.html** — Zitate durch echte Kundenstimmen ersetzen
6. **preise.html** — Preise sind Vorschläge; bei Launch fixieren
7. E-Mail-Postfach **support@amzsellerhub.de** einrichten (netcup) — Kontaktseite + Rechtsseiten verweisen darauf
8. Optional: Google Fonts lokal einbinden (dann Punkt 7 der Datenschutzerklärung streichen)
