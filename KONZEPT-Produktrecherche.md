# Konzept: Perfekte Produktrecherche in SellerHub

> Ziel: Die schwerste Aufgabe (Produktrecherche) leicht machen und zu einer **schnellen, sicheren Entscheidung** führen.
> Positionierung: SellerHub = **Entscheidungs-Cockpit** auf Helium-/KI-Daten — nicht Helium-Ersatz.

---

## 1. Die eine Recherche-Pipeline (ersetzt Ideen-Pool + Konkurrenz-Tabelle + Engere Wahl)

Ein Kandidat wandert durch **4 Stufen** (Kanban-Board), statt über 3 getrennte Seiten verteilt zu sein.

```
┌─────────────┐   ┌──────────────┐   ┌──────────────┐   ┌───────────────┐
│  💡 IDEE     │ → │ 🔬 VALIDIEREN │ → │ ⭐ SHORTLIST  │ → │ ✅ ENTSCHEIDUNG│
├─────────────┤   ├──────────────┤   ├──────────────┤   ├───────────────┤
│ Rohideen    │   │ Daten holen  │   │ Top-Kandidat │   │ GO → Produkt  │
│ KI-Import   │   │ Scorecard    │   │ Tiefencheck  │   │ NO-GO → Archiv│
│ Helium BB   │   │ Review-Mining│   │ Vergleich    │   │               │
└─────────────┘   └──────────────┘   └──────────────┘   └───────────────┘
   schnell rein      hier die Arbeit     1:1-Vergleich      1 Klick Urteil
```

- **Der 20-Schritte-Workflow** wird zur **Checkliste INNERHALB eines Kandidaten** (Stufe Validieren/Shortlist) — kein eigener Tab mehr.
- Drag & Drop oder Button „→ nächste Stufe".

---

## 2. Das EINE Entscheidungs-Scorecard (ersetzt Score-Matrix + Nischen-Score + „Potenzial")

6 Dimensionen, jeweils 0–10, gewichtet → **Gesamt 0–100 + Ampel-Urteil**.

| Dimension | Gewicht | Auto-Berechnung aus … |
|---|---|---|
| **Nachfrage** | 25 % | Umsatz/Verkäufe Top-Seller, Suchvolumen |
| **Wettbewerb** | 25 % | ⌀ Review-Zahl Top-10, # schwache Listings, Marken-Dominanz |
| **Wirtschaftlichkeit** | 20 % | Netto-Marge nach FBA + PPC, ROI, Preisband |
| **Differenzierung** | 15 % | Review-Mining-Score (Schmerzpunkte der Konkurrenz) |
| **Risiko/Logistik** | 10 % | Gewicht/Größe, Saisonalität, IP/Gating/Hazmat |
| **Kapitalbedarf** | 5 % | Startbudget (Menge × EK + PPC-Anlauf) |

### Auto-Scoring (Experten-Schwellen, anpassbar)
- **Wettbewerb** aus ⌀ Reviews Top-10: `<100→10 · 100–300→8 · 300–600→6 · 600–1.000→4 · 1.000–2.000→2 · >2.000→1`
- **Wirtschaftlichkeit** aus Netto-Marge: `≥35%→10 · 30→8 · 25→6 · 20→4 · 15→2 · <15→1`
- **Nachfrage** aus Monatsumsatz Top-Seller + Suchvolumen (Floor ~2.000–5.000/M)
- **Differenzierung** = Review-Mining-Score (wie viele lösbare Schmerzpunkte?)

### Urteil-Logik
- **🟢 GO**: Score ≥ 70 **und** kein harter Red Flag
- **🟡 PRÜFEN**: Score 50–69 **oder** nur behebbare Flags
- **🔴 NO-GO**: Score < 50 **oder** ein harter Red Flag
- Zusätzlich immer sichtbar: **„Größter Schwachpunkt: …"** (die schwächste Dimension im Klartext).

---

## 3. Red-Flag-Regel-Engine (macht „Entscheidung leicht")

Automatische Warnungen aus Experten-Bauchgefühl:

| Regel | Flag |
|---|---|
| Preis < 12–15 € | 🔴 Margenfalle |
| ⌀ Reviews Top-Seller > 2.000 | 🔴 Hohe Einstiegsbarriere |
| 1 Marke > 60–70 % Marktanteil | 🔴 Monopol-Risiko |
| Gewicht > 2 kg / Übergröße | 🟡 FBA-Kosten hoch |
| Stark saisonal | 🟡 Cashflow-Risiko |
| Gating-/IP-/Hazmat-Kategorie | 🔴 Rechtsrisiko |
| Netto-Marge < 15 % | 🔴 Unwirtschaftlich |

---

## 4. Mockup: Kandidaten-Entscheidungskarte (das „10-Sekunden-Urteil")

```
┌──────────────────────────────────────────────────────────────┐
│ 🖼️  Edelstahl Seifenspender, sensor          [ B0CVBBBCZN ]   │
│                                                                │
│   ┌─────────┐   NACHFRAGE   ████████░░  8/10                   │
│   │  Bild   │   WETTBEWERB  ████░░░░░░  4/10  ⚠️ 1.400 Reviews │
│   │ 120x120 │   MARGE       ██████░░░░  6/10  (28 %)           │
│   └─────────┘   DIFFERENZIE.████████░░  8/10  (7 Schmerzpkte)  │
│                 RISIKO       ███████░░░  7/10                   │
│                 KAPITAL      █████░░░░░  5/10  (~4.200 €)       │
│                                                                │
│   ╔════════════╗   Größter Schwachpunkt:                       │
│   ║  SCORE 67  ║   ⚠️ Wettbewerb — Top-Seller mit 1.400        │
│   ║ 🟡 PRÜFEN  ║      Reviews, aber 7 lösbare Schwächen        │
│   ╚════════════╝                                               │
│                                                                │
│   [🔬 Reviews analysieren] [🧮 Marge] [→ Shortlist] [❌ NO-GO]  │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. Mockup: Review-Mining (1 Klick — der eigentliche Wettbewerbsvorteil)

```
🔬 Konkurrenz-Reviews analysiert (ASIN B0CVBBBCZN · 312 Reviews)

  TOP-BESCHWERDEN                      Häufig.  Schwere  → Chance
  ─────────────────────────────────────────────────────────────
  1. Sensor reagiert verzögert          38 %    🔴 hoch   ✅ besser
  2. Pumpe verkalkt nach Wochen         24 %    🔴 hoch   ✅ besser
  3. Batteriefach undicht               17 %    🟡 mittel  ✅ besser
  4. zu kleines Fassungsvermögen        12 %    🟡 mittel  ✅ größer
  ─────────────────────────────────────────────────────────────
  WÜNSCHE: USB-C statt Batterie · mattes Finish · 2 Jahre Garantie

  → Differenzierungs-Score: 8/10   [ In Scorecard übernehmen ]
  → Auto-USPs erzeugt: „Verkalkungsfreie Pumpe", „USB-C Akku" …
```

---

## 6. Mockup: Nischen-Scan (Felder automatisch füllen statt abtippen)

```
🔍 Nischen-Scan — Konkurrenz-ASINs einwerfen:
   [ B0CVBBBCZN, B09XYZ1234, B07ABC9999, … ]      [ Scannen ]

   → 6 Listings abgerufen. Automatisch berechnet:
     ⌀ Preis 26,40 €  ·  ⌀ Reviews 740  ·  ⌀ Rating 4,2
     # Listings <300 Rev.: 2  ·  Top-Marke: 41 % Anteil
   → Felder „Nachfrage" & „Wettbewerb" im Scorecard vorbefüllt ✓
```
*(Ehrliche Grenze: Amazon-Suchergebnis-Scraping ist fragil; ASIN-für-ASIN ist zuverlässig.)*

---

## 7. Was wird wiederverwendet / verschmolzen / geparkt

**Wiederverwenden (Logik existiert schon):**
- Kandidaten-Datenmodell (`research.candidates`)
- Score-Matrix-Kriterien (verfeinert) + Nischen-Formeln (ROI/Profit/Startbudget)
- Helium-Import, ASIN-Fetch (`SHImport.fetchListing`), Gemini-Key
- BSR→Verkäufe-Schätzer (füttert „Nachfrage")

**Verschmelzen:**
- Ideen-Pool + Konkurrenz-Tabelle + Engere Wahl → **eine Pipeline**
- Score-Matrix + Nischen-Score + „Potenzial" → **ein Scorecard**
- Kalkulations-Center → speist die „Wirtschaftlichkeit" direkt pro Kandidat

**Parken (eigener Bereich „Betrieb", aus dem Recherche-Kern raus):**
- KI-Bildstudio, Listing-Editor, Launch-Planer, Lagerbestand, Aufgaben-Board
- Lernzentrum (behalten, nicht ausbauen) · Admin (nur bei SaaS relevant)

---

## 8. Umsetzungs-Reihenfolge (Vorschlag)

1. **Fokus**: Phase-B-Module in „Betrieb" wegklappen, Recherche-Kern sichtbar machen
2. **Scorecard**: 3 Systeme → 1 Entscheidungs-Scorecard mit Ampel + Urteil
3. **Pipeline**: Ideen/Research/Auswahl → 1 Kanban-Trichter
4. **Review-Mining**: integriert (1 Klick → Differenzierung + Score)
5. **Nischen-Scan**: ASINs → Felder auto-füllen
6. **Red-Flag-Engine**: automatische Warnungen

> Leitsatz: **Schärfen, nicht erweitern.** Der Weg zu „perfekter Recherche" ist Fokus + Entscheidungskraft, nicht noch ein Modul.
