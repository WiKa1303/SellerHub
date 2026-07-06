# Konzept: PPC & Keywords mit echten Daten

> Ziel: Aus dem Keyword-Center (heute: manuelles Tracking + Backend-Reiniger + Listing-Abdeckung)
> wird das **PPC-Cockpit**: Kampagnen planen BEVOR Geld fließt, und laufende Kampagnen
> auditieren, NACHDEM Geld geflossen ist — mit denselben Daten, die der Seller sowieso hat.
> Positionierung wie bei der Produktrecherche: **Entscheidungs-Cockpit auf Helium-/Seller-Central-Daten**,
> kein Ads-Tool-Ersatz. Leitsatz: schärfen, nicht erweitern.

---

## 1. Datenquellen-Realität (ehrlich)

| Quelle | Was sie liefert | Aufwand | v1? |
|---|---|---|---|
| **Helium 10 Cerebro/Magnet (Paste/CSV)** | Keywords + Suchvolumen + CPC-Schätzung + Wettbewerb | Muster existiert (Xray-Paste!) | ✅ |
| **Seller Central Suchbegriffs-Bericht (CSV)** | ECHTE Klicks, Kosten, Verkäufe, ACOS je Suchbegriff | CSV-Parser existiert (`parseCSV` robust) | ✅ |
| **Eigene Zahlen im System** | Marge je Produkt/Kandidat (`decisionMarge`), Gebühren-Center | vorhanden | ✅ |
| Amazon Ads API | Live-Kampagnendaten, Gebots-Steuerung | OAuth + Approval-Prozess + eigene Infrastruktur | ❌ später (v3+) |
| Keyword-Scraping | fragil, TOS-Grauzone | — | ❌ nie |

**Konsequenz:** v1/v2 arbeiten mit Paste/CSV-Importen + deterministischen Formeln.
Jede Zahl nachrechenbar (Erklärbarkeits-Konvention aus dem Radar-Backend gilt auch hier).

---

## 2. Modul A — Keyword-Import (Cerebro/Magnet-Paste)

Wie Xray-Paste, aber für Keyword-Listen: Helium-10-Tabelle einfügen → Spalten
automatisch erkennen (Keyword, Suchvolumen, CPC, Competing Products) → Ziel wählbar:

```
📋 Cerebro-Paste — Keywords einwerfen:
   [ eingefügte Tabelle: 214 Zeilen erkannt ]

   → Erkannt: Keyword · Suchvolumen · ⌀ CPC · Wettbewerber
   → Ziel:  (•) Keyword-Tracking von [Produkt wählen ▾]
            ( ) Nur PPC-Planer (ohne Tracking)
   → Filter: Suchvolumen ≥ [400]  ·  max. [50] Keywords (nach Volumen)
```

- Wiederverwendung: `parseCSV`, `detectHeliumType`-Muster, Spalten-Mapping wie `mapHeliumRow`.
- Schreibt in den bestehenden Keyword-Tracker (`D.keywords`-Struktur) — KEIN neues Datenmodell,
  nur neue Felder je Keyword: `cpc` (Schätzung aus Cerebro), `quelle`, `importedAt`.

---

## 3. Modul B — Launch-PPC-Planer (deterministisch, der Kern)

Aus Keywords + eigenen Zahlen einen konkreten Kampagnen-Plan rechnen — die Zahlen,
die man sonst im Kopf/Excel überschlägt:

```
🎯 PPC-Planer — Edelstahl Seifenspender (aus Pipeline/Produktliste)

  Deine Zahlen (automatisch):        VK 24,90 € · Netto-Marge 31 % (auto: VK−EK−FBA)
  ────────────────────────────────────────────────────────────
  Break-even-ACOS      = Marge                    31 %
  Ziel-ACOS (Launch)   = Break-even × 1,3         40 %   [anpassbar — Launch darf kosten]
  Ziel-ACOS (Profit)   = Break-even × 0,7         22 %

  Je Keyword (Top 20 nach Suchvolumen):
  KEYWORD                VOL     CPC-SCHÄTZ.  MAX-GEBOT*   KLICKS/TAG BEI 10 € BUDGET
  seifenspender sensor   9.400   0,82 €       0,99 €       ~12
  seifenspender automatisch …
  ────────────────────────────────────────────────────────────
  * Max-Gebot = VK × Marge% × Ziel-ACOS-Faktor × angenommene CVR (10 %, anpassbar)

  Empfohlene Struktur: 1× Auto-Kampagne (Discovery, 40 % Budget)
                       1× Exact (Top-5-Keywords, 40 %)
                       1× Broad (Rest, 20 %)
  Tagesbudget-Vorschlag: [25 €] → erwartete Ausgaben/Monat ~750 €
  Kapital-Rückkopplung: PPC-Anlauf (2 Monate) → fließt in Kapitalbedarf-Dimension ⚖️
```

- **Formeln offen ausgewiesen** (jede Zeile hat einen ⓘ mit der Rechnung).
- Rückkopplung in die Scorecard: geplanter PPC-Anlauf ergänzt den Kapitalbedarf
  (`decisionAuto('kapital')`: heute EK × Menge — künftig + PPC-Anlauf, wenn Plan existiert).
- Optional KI (vorhandene Kette `SHImport.ask`): Kampagnen-Namen + Negativ-Startliste
  aus den Keywords vorschlagen. Ohne Key: Planer voll funktionsfähig (Degradation).

---

## 4. Modul C — Suchbegriffs-Audit (echte Kampagnen-Daten)

Seller Central → Berichte → Werbeberichte → **Suchbegriffe (CSV)** einfügen:

```
🔍 PPC-Audit — Suchbegriffs-Bericht (30 Tage, 1.240 Zeilen)

  GELDVERBRENNER (Kosten ohne Sale, ≥ 5 Klicks)          Kosten
  1. "seifenspender wandmontage"   18 Klicks · 0 Sales   14,60 €   → Negativ setzen
  2. "seifenspender kinder"        11 Klicks · 0 Sales    8,90 €   → Negativ setzen
  ────────────────────────────────────────────────────
  ÜBER BREAK-EVEN (ACOS > deine 31 %-Marge)
  3. "spender sensor"   ACOS 48 %  → Gebot −30 % oder pausieren
  ────────────────────────────────────────────────────
  GEWINNER (ACOS < 22 %, ≥ 2 Sales)  → in Exact übernehmen, Gebot +10 %
  Zusammenfassung: 87,40 € / Monat Einsparpotenzial identifiziert
```

- Break-even kommt automatisch aus dem verknüpften Produkt (`decisionMarge`).
- Reine Client-Logik (CSV bleibt im Browser — keine Kampagnendaten auf unseren Server).
- Ergebnis als Aktionsliste mit Copy-Buttons (Negativ-Keywords als Liste zum Einfügen in Seller Central).

---

## 5. Was wird wiederverwendet / wo landet es

**Wiederverwenden:** `parseCSV` + Helium-Spalten-Mapping (Xray-Paste) · `decisionMarge`/Gebühren-Center
(Break-even) · Keyword-Tracker-Datenmodell + Keyword-Center-Tabs · KI-Kette `SHImport.ask` (optional) ·
Kapitalbedarf-Dimension der Scorecard (Rückkopplung).

**UI-Ort:** Keyword-Center bekommt zwei neue Tabs: **🎯 PPC-Planer** und **🔍 PPC-Audit**
(neben Tracking/Backend-Reiniger/Listing-Abdeckung). Kein neuer Nav-Punkt — Betrieb bleibt Betrieb.

**Bewusst NICHT:** Ads-API-Anbindung (v3+, erst wenn SaaS-Kunden es tragen) ·
Gebots-Automatisierung · Keyword-Rank-Tracking per Scraping.

---

## 6. Umsetzungs-Reihenfolge

1. **Modul A** Cerebro-Paste → Keyword-Tracker (Import-Grundlage, ~1 Sitzung)
2. **Modul B** Launch-PPC-Planer inkl. Scorecard-Rückkopplung (der Kern, ~1–2 Sitzungen)
3. **Modul C** Suchbegriffs-Audit (~1 Sitzung)
4. Politur: Lernzentrum-Lektion verlinken, Dossier um PPC-Plan-Zeile ergänzen

> Erfolgskriterium: Ein Seller kann OHNE Excel entscheiden, mit welchem Budget und
> welchen Geboten er launcht — und nach 30 Tagen in 2 Minuten sehen, wo Geld verbrennt.
