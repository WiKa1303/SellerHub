// ═══ CORE: Prompt Registry — zentrale Versionierung aller LLM-Prompts ═══
// Jede Prompt-Änderung = version+1 (Pflicht!). Die ai_calls-Telemetrie speichert
// key+version je Call — damit ist später nachvollziehbar, welche Prompt-Version
// welche Analysequalität geliefert hat (Basis für A/B-Tests: zweiter Eintrag
// mit gleichem key, anderer version, Auswahl per ENV/Tenant im Modul).
//
// temperature: bewusst null — Sampling-Parameter sind auf Opus 4.7+ ENTFERNT
// (API antwortet 400). Das Feld existiert für ältere Modelle/A-B-Varianten und
// wird nur mitgesendet, wenn gesetzt.
//
// JSON-Schemas bleiben in den Modulen (Code-Vertrag der Nachverarbeitung);
// die Registry versioniert Prompt-Text + Modell-Parameter.
import { config } from './config.js';

export const PROMPTS = {
  relevance_analysis: {
    key: 'relevance_analysis',
    version: 2, // v1: Phase 3 (Score/Kategorie/Summary) · v2: +topic/opportunity/affected (Phase 4)
    description: 'Relevanzanalyse je Artikel: Score, Kategorie, Urgency, Impact, Seller-Summary, Trend-Felder',
    model: config.aiModel,
    temperature: null,
    effort: 'low',
    maxTokens: 1500,
    template: `Du bist Analyst für Amazon-FBA-Seller im DACH-Raum (Deutschland, Österreich, Schweiz).
Du bewertest Nachrichtenartikel ausschließlich aus der Perspektive: "Was bedeutet das für einen Amazon-FBA-Händler geschäftlich?"

Bewerte den Artikel:

1. relevance_score (0-100): Wie relevant für FBA-Seller?
   - 80-100: unmittelbar geschäftskritisch (Gebührenänderung, Gesetz mit Frist, Kontosperr-Risiko)
   - 50-79: sollte man kennen (Policy-Updates, Markttrends mit Handlungsoptionen)
   - 25-49: Hintergrundwissen (allgemeine E-Commerce-Entwicklung)
   - 0-24: irrelevant für FBA-Seller

2. category: genau eine aus recht | ppc | produktrecherche | logistik | steuern | events | trends | sonstiges

3. urgency: hoch (Frist/sofortiger Handlungsbedarf) | mittel (in den nächsten Wochen relevant) | niedrig (kein Zeitdruck)

4. impact: high (kostet/bringt direkt Geld oder bedroht das Konto) | medium (beeinflusst Marge/Prozesse) | low (nice to know)

5. reasoning: 1-2 Sätze, WARUM diese Bewertung — konkret, kein Floskel-Deutsch.

6. summary: 3-5 Bulletpoints, HANDLUNGSORIENTIERT für den Seller formuliert.
   - Jeder Punkt beantwortet: "Was bedeutet das konkret für mich / was sollte ich tun?"
   - KEINE generische Nachrichtenzusammenfassung ("Amazon hat angekündigt...")
   - RICHTIG: "Prüfe bis 1.9., ob deine Größenklassen-Einstufung noch stimmt — sonst zahlst du drauf."
   - Bei irrelevanten Artikeln (score < 25): 1 kurzer Punkt genügt, warum es nicht relevant ist.

7. topic: normalisierter Themen-Slug für die Trend-Erkennung.
   - kleingeschrieben, bindestrich-getrennt, max. 4 Wörter, DAS Kernthema (nicht der Einzelfall)
   - Artikel zum selben Thema MÜSSEN denselben Slug bekommen: "gpsr-produktsicherheit", "amazon-fba-gebuehren", "ppc-gebotsstrategien", "temu-konkurrenz"
   - kein Datum, keine Quellennamen im Slug

8. opportunity: chance (Seller kann Geld verdienen/Vorteil sichern) | risiko (kostet Geld/bedroht Konto) | neutral

9. affected: WER ist betroffen, kurz. z.B. "alle FBA-Seller", "Private-Label-Seller in Spielzeug", "Seller mit AT-Kunden"

Sei streng: Ein Generalisten-Tech-Artikel ohne Seller-Bezug bekommt einen niedrigen Score, egal wie interessant er klingt.`,
  },
  trend_impact_interpretation: {
    key: 'trend_impact_interpretation',
    version: 1,
    description: 'Trend Detection + Opportunity Detection: Business-Impact-Interpretation der Top-Themen (1 Call, Array-Output)',
    model: config.aiModel,
    temperature: null,
    effort: 'low',
    maxTokens: 2500,
    template: `Du bist Marktanalyst für Amazon-FBA-Seller im DACH-Raum.
Du bekommst Trend-Themen mit Kennzahlen und Beleg-Artikeln. Interpretiere jedes Thema unternehmerisch:

- summary: 2 Sätze. Satz 1: Was passiert gerade (die Marktbewegung, nicht die Einzelmeldung).
  Satz 2: Wer ist betroffen und was steht monetär auf dem Spiel (Chance ODER Risiko, konkret).
- recommended_action: GENAU EIN konkreter nächster Schritt, den ein Seller diese Woche tun kann.
  Kein "beobachten Sie die Lage" — sondern z.B. "Prüfe deine Top-10-ASINs auf GPSR-Konformität und dokumentiere die Nachweise."
- risk_or_opportunity: risiko | chance | neutral (monetäre Gesamtwirkung für den typischen Seller).

Schreibe direkt, per Du, ohne Floskeln.`,
  },
  forecast_interpretation: {
    key: 'forecast_interpretation',
    version: 1,
    description: 'Predictive Forecasting: Seller-Hinweis zu den Top-5-Prognosen (1 gebatchter Call je Lauf)',
    model: config.aiModel,
    temperature: null,
    effort: 'low',
    maxTokens: 600,
    template: `Du bist Prognose-Analyst für Amazon-FBA-Seller im DACH-Raum.
Du bekommst deterministisch berechnete 7-Tage-Prognosen für Trend-Themen (Holt-Glättung über die
Tages-Zeitreihe): je Thema Richtung (steigend/fallend/stabil), Konfidenz (0-100) und Prognosewerte.

Formuliere EINEN kurzen Seller-Hinweis (2-3 Sätze):
- Welche Prognose ist geschäftlich am wichtigsten und warum (monetär gedacht)?
- Was sollte ein Seller diese Woche konkret daraus machen?
Bleib ehrlich: Prognosen mit niedriger Konfidenz als unsicher benennen, keine Scheingenauigkeit.
Schreibe per Du, ohne Floskeln.`,
  },
  strategy_brief: {
    key: 'strategy_brief',
    version: 1,
    description: 'Strategy Engine: tägliches Strategie-Briefing aus der Gesamtlage',
    model: config.aiModel,
    temperature: null,
    effort: 'low',
    maxTokens: 1800,
    template: `Du bist Chefstratege eines Amazon-FBA-Sellers im DACH-Raum.
Du bekommst die aktuelle Marktlage (Trend-Themen, kritische Alerts, Chancen) und verdichtest sie
zu einem täglichen Strategie-Briefing. Regeln:

- headline: 1 Satz — die wichtigste Erkenntnis des Tages, konkret, kein Floskel-Deutsch.
- situation: 2-3 Sätze Gesamtlage. Was bewegt sich, was bleibt ruhig.
- priorities: MAXIMAL 3, nach Wichtigkeit sortiert. Jede Priorität:
  - title: kurz · why: 1 Satz Begründung (monetär gedacht)
  - action: EIN konkreter Schritt für diese Woche (kein "beobachten")
  - type: risiko | chance · urgency: hoch | mittel | niedrig
- watchlist: 0-4 Themen, die man im Blick behalten sollte (nur Namen).
Schreibe per Du. Wenn die Lage ruhig ist, sag das ehrlich — erfinde keine Dringlichkeit.`,
  },
};
