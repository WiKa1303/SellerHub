// ═══ KI-Relevanzanalyse (Phase 3) ═══
// EIN API-Call pro Artikel liefert Analyse UND Summary (Kosteneffizienz: kein zweiter Call).
// Strukturierte Outputs (output_config.format) garantieren valides JSON — kein Parsing-Gefrickel.
import { config } from '../../core/config.js';
import { aiClient } from '../../core/ai-client.js';

// Client-Fabrik liegt in der Infrastruktur (core/ai-client.js);
// Re-Export hält bestehende Importe (Tests, Module) stabil.
export { aiClient, aiEnabled } from '../../core/ai-client.js';

export const AI_CATEGORIES = ['recht', 'ppc', 'produktrecherche', 'logistik', 'steuern', 'events', 'trends', 'sonstiges'];

// System-Prompt: STABIL halten (keine Zeitstempel/IDs) — Voraussetzung für späteres Prompt-Caching.
const SYSTEM_PROMPT = `Du bist Analyst für Amazon-FBA-Seller im DACH-Raum (Deutschland, Österreich, Schweiz).
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

Sei streng: Ein Generalisten-Tech-Artikel ohne Seller-Bezug bekommt einen niedrigen Score, egal wie interessant er klingt.`;

// JSON-Schema für strukturierte Outputs (additionalProperties:false ist Pflicht)
const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    relevance_score: { type: 'integer', description: 'Relevanz für FBA-Seller, 0-100' },
    category: { type: 'string', enum: AI_CATEGORIES },
    urgency: { type: 'string', enum: ['niedrig', 'mittel', 'hoch'] },
    impact: { type: 'string', enum: ['low', 'medium', 'high'] },
    reasoning: { type: 'string', description: 'Kurze Begründung, 1-2 Sätze' },
    summary: { type: 'array', items: { type: 'string' }, description: '3-5 handlungsorientierte Bulletpoints' },
    topic: { type: 'string', description: 'Normalisierter Themen-Slug, z.B. gpsr-produktsicherheit' },
    opportunity: { type: 'string', enum: ['chance', 'risiko', 'neutral'] },
    affected: { type: 'string', description: 'Wer ist betroffen, kurz' },
  },
  required: ['relevance_score', 'category', 'urgency', 'impact', 'reasoning', 'summary', 'topic', 'opportunity', 'affected'],
  additionalProperties: false,
};

/**
 * Analysiert einen Artikel. Wirft bei API-Fehlern (Queue kümmert sich um Retry/Abbruch).
 * @returns {{analysis:object, usage:{input:number,output:number}, model:string}}
 */
export async function analyzeItem(item) {
  const client = aiClient();
  if (!client) throw new Error('KI nicht konfiguriert (ANTHROPIC_API_KEY fehlt)');

  const response = await client.messages.create({
    model: config.aiModel,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    // effort:low — Klassifikation kurzer Snippets braucht keine tiefe Denkarbeit; spart Output-Tokens
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: ANALYSIS_SCHEMA },
    },
    messages: [{
      role: 'user',
      content: `Quelle: ${item.source}\nDatum: ${item.publish_date}\nTitel: ${item.title}\n\nAnriss:\n${item.summary || '(kein Anriss verfügbar)'}`,
    }],
  });

  const text = response.content.find(b => b.type === 'text')?.text;
  if (!text) throw new Error('Leere KI-Antwort (stop_reason: ' + response.stop_reason + ')');
  const analysis = JSON.parse(text); // durch output_config.format garantiert valide

  // Nachschärfen: Score clampen, Summary begrenzen, Topic-Slug normalisieren
  analysis.relevance_score = Math.max(0, Math.min(100, Math.round(analysis.relevance_score)));
  analysis.summary = (analysis.summary || []).slice(0, 5).map(s => String(s).slice(0, 300));
  analysis.topic = String(analysis.topic || 'sonstiges')
    .toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 4).join('-') || 'sonstiges';
  analysis.affected = String(analysis.affected || '').slice(0, 120);

  return {
    analysis,
    usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
    model: response.model,
  };
}
