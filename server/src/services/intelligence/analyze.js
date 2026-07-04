// ═══ KI-Relevanzanalyse (Phase 3) ═══
// EIN API-Call pro Artikel liefert Analyse UND Summary (Kosteneffizienz: kein zweiter Call).
// Strukturierte Outputs (output_config.format) garantieren valides JSON — kein Parsing-Gefrickel.
import { aiClient } from '../../core/ai-client.js';
import { PROMPTS } from '../../core/prompt-registry.js';
import { logAiCall } from '../../data/db.js';

const PROMPT = PROMPTS.relevance_analysis; // Template/Version/Modell zentral in der Registry

// Client-Fabrik liegt in der Infrastruktur (core/ai-client.js);
// Re-Export hält bestehende Importe (Tests, Module) stabil.
export { aiClient, aiEnabled } from '../../core/ai-client.js';

export const AI_CATEGORIES = ['recht', 'ppc', 'produktrecherche', 'logistik', 'steuern', 'events', 'trends', 'sonstiges'];

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
    model: PROMPT.model,
    max_tokens: PROMPT.maxTokens,
    system: PROMPT.template,
    // effort:low — Klassifikation kurzer Snippets braucht keine tiefe Denkarbeit; spart Output-Tokens
    output_config: {
      effort: PROMPT.effort,
      format: { type: 'json_schema', schema: ANALYSIS_SCHEMA },
    },
    messages: [{
      role: 'user',
      content: `Quelle: ${item.source}\nDatum: ${item.publish_date}\nTitel: ${item.title}\n\nAnriss:\n${item.summary || '(kein Anriss verfügbar)'}`,
    }],
  });

  await logAiCall(PROMPT, response, item.id); // Telemetrie: Prompt-Version + Tokens (fail-soft)
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
