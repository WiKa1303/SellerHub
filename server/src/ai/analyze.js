// ═══ KI-Relevanzanalyse (Phase 3) ═══
// EIN API-Call pro Artikel liefert Analyse UND Summary (Kosteneffizienz: kein zweiter Call).
// Strukturierte Outputs (output_config.format) garantieren valides JSON — kein Parsing-Gefrickel.
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

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
  },
  required: ['relevance_score', 'category', 'urgency', 'impact', 'reasoning', 'summary'],
  additionalProperties: false,
};

let _client = null;
/** Lazy-Init; clientOverride ermöglicht Tests ohne echten API-Key. */
export function aiClient(clientOverride) {
  if (clientOverride) { _client = clientOverride; return _client; }
  if (!_client) {
    if (!config.anthropicApiKey) return null;
    // SDK-Retries übernehmen 429/5xx mit exponentiellem Backoff — kein Hand-Rollen nötig
    _client = new Anthropic({ apiKey: config.anthropicApiKey, maxRetries: 3, timeout: 60000 });
  }
  return _client;
}
export function aiEnabled() { return !!(config.anthropicApiKey || _client); }

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

  // Nachschärfen: Score clampen, Summary auf 5 Punkte begrenzen
  analysis.relevance_score = Math.max(0, Math.min(100, Math.round(analysis.relevance_score)));
  analysis.summary = (analysis.summary || []).slice(0, 5).map(s => String(s).slice(0, 300));

  return {
    analysis,
    usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
    model: response.model,
  };
}
